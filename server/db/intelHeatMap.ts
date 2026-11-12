import { and, eq, inArray, isNull } from "drizzle-orm";
import { runningSheets, sheetRows } from "../../drizzle/schema";
import { attributedRowIds, collapseToVisits } from "../entityAttribution";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import { resolvePlaceLatLng } from "./geocoding";
import { getAllIntelligenceEntities } from "./intelEntities";
import {
  OBSERVATION_SIGNAL_RE,
  addDaysISO,
  isNonObservationRow,
  perthTodayISO,
  toPerthDateISO,
} from "./reportHelpers";

// ─── Intelligence Heat Map ──────────────────────────────────────────────────
// Aggregates address/business entities extracted from a scoped set of running
// sheet rows (one Operation, optionally one Target, and a time window) into
// per-location visit counts + coordinates for the Heat Map view.

export type IntelligenceHeatMapWhen =
  | { mode: "sheet"; sheetId: number }
  | { mode: "all" } // every sheet in scope, no date window
  | { mode: "last7" }
  | { mode: "last30" }
  | { mode: "custom"; startDate: string; endDate: string };
// YYYY-MM-DD, inclusive

export interface IntelligenceHeatMapLocation {
  label: string;
  count: number;
  lat: number;
  lng: number;
}

export async function getIntelligenceHeatMapLocations(params: {
  operationId: number;
  targetId?: number | null;
  when: IntelligenceHeatMapWhen;
}): Promise<IntelligenceHeatMapLocation[]> {
  const db = await getDb();
  if (!db) return [];

  // ── Resolve the scoped set of sheets (Operation, optionally + Target) ──────
  let sheetIds: number[];
  // Keyed by sheet id — sheetDate (the picker date) takes priority over
  // createdAt when resolving a row's date below; createdAt is kept only as
  // the fallback for legacy sheets with no sheetDate.
  const sheetDateInfo = new Map<
    number,
    { createdAt: Date; sheetDate: string | null }
  >();

  if (params.when.mode === "sheet") {
    const sheet = await db
      .select({
        id: runningSheets.id,
        createdAt: runningSheets.createdAt,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .where(
        and(
          eq(runningSheets.id, params.when.sheetId),
          eq(runningSheets.operationId, params.operationId),
          isNull(runningSheets.deletedAt)
        )
      )
      .limit(1);
    if (!sheet.length) return [];
    sheetIds = [sheet[0].id];
    sheetDateInfo.set(sheet[0].id, {
      createdAt: sheet[0].createdAt,
      sheetDate: sheet[0].sheetDate,
    });
  } else {
    // Deliberately NOT narrowed by runningSheets.targetId. A target filter
    // means "rows this target is mentioned in" (applied per-row below), not
    // "sheets assigned to this target" — assignment records who the team set
    // out to watch, not who they actually saw. Scoping by sheet both credited
    // the target with everyone else's movements on their sheets and missed
    // their own mentions on other sheets in the operation.
    const conditions = [
      eq(runningSheets.operationId, params.operationId),
      isNull(runningSheets.deletedAt),
    ];
    const sheets = await db
      .select({
        id: runningSheets.id,
        createdAt: runningSheets.createdAt,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .where(and(...conditions));
    if (!sheets.length) return [];
    sheetIds = sheets.map(s => s.id);
    for (const s of sheets)
      sheetDateInfo.set(s.id, {
        createdAt: s.createdAt,
        sheetDate: s.sheetDate,
      });
  }
  const sheetIdSet = new Set(sheetIds);

  // Full per-sheet row order (observation text + a stable sort key) — needed
  // both for the Surveillance/Travelled Via "previous row" check and for
  // collapsing consecutive same-address mentions into one visit below.
  const rows = await db
    .select({
      id: sheetRows.id,
      sheetId: sheetRows.sheetId,
      rowDate: sheetRows.rowDate,
      dayOffset: sheetRows.dayOffset,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      rowNumber: sheetRows.rowNumber,
    })
    .from(sheetRows)
    .where(inArray(sheetRows.sheetId, sheetIds))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes, sheetRows.rowNumber);
  const rowById = new Map(rows.map(r => [r.id, r]));

  const rowsBySheetOrdered = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!rowsBySheetOrdered.has(row.sheetId))
      rowsBySheetOrdered.set(row.sheetId, []);
    rowsBySheetOrdered.get(row.sheetId)!.push(row);
  }
  const previousObservationByRowId = new Map<number, string | null>();
  for (const sheetRowList of Array.from(rowsBySheetOrdered.values())) {
    for (let i = 0; i < sheetRowList.length; i++) {
      previousObservationByRowId.set(
        sheetRowList[i].id,
        i > 0 ? (sheetRowList[i - 1].observation ?? null) : null
      );
    }
  }
  const rowOrderIndex = new Map<number, number>();
  for (const sheetRowList of Array.from(rowsBySheetOrdered.values())) {
    sheetRowList.forEach((r, i) => rowOrderIndex.set(r.id, i));
  }

  // ── Resolve the date window ("sheet" mode takes every row in that sheet
  // as-is; the other three modes resolve a concrete range). Date priority
  // matches getRowsBySheetId above: explicit rowDate first, else the sheet's
  // creation date shifted by dayOffset. (Unlike getRowsBySheetId, this skips
  // the third-tier timeMinutes-rollover inference — that's a per-sheet
  // sequential scan meant for single-sheet rendering, disproportionately
  // expensive to replicate across every sheet in scope here, and only
  // matters for legacy rows predating rowDate.)
  // "sheet" takes the whole sheet and "all" takes every sheet in scope, so
  // neither resolves a window — only the three windowed modes do.
  const hasDateWindow =
    params.when.mode === "custom" ||
    params.when.mode === "last7" ||
    params.when.mode === "last30";
  let startISO = "";
  let endISO = "";
  if (params.when.mode === "custom") {
    startISO = params.when.startDate;
    endISO = params.when.endDate;
  } else if (params.when.mode === "last7" || params.when.mode === "last30") {
    endISO = perthTodayISO();
    startISO = addDaysISO(endISO, params.when.mode === "last7" ? -6 : -29);
  }

  // ── Reuse the same entity extraction/dedup pipeline as the Locations tab
  // (bracket-introduction + bare-re-mention two-pass recognition, plus
  // confirmed entity-alias merges) instead of a standalone per-row regex
  // pass — an address is often bracket-introduced once and then referenced
  // in plain prose on later rows ("returned to 54 Terrace Road"), which a
  // bracket-only pass undercounts to a single visit.
  const allEntities = await getAllIntelligenceEntities();

  // The heat map plots TARGET movement — always, not only when one target is
  // picked out. "All Targets" means every target on the operation, not every
  // entity on it: an associate's or a third party's addresses are theirs, and
  // mapping them under the operation's targets misrepresents where the
  // targets have been. So restrict to rows a target is actually mentioned in,
  // either the one selected or any of them.
  //
  // An empty set is a real answer, not a failure: a target never named in any
  // observation has no mapped locations, however many sheets were opened in
  // their name.
  const targetRowIds = new Set<number>();
  for (const entity of allEntities) {
    if (!entity.isTarget) continue;
    if (params.targetId != null && entity.targetId !== params.targetId)
      continue;
    for (const rowId of Array.from(
      attributedRowIds(entity.occurrences, { sheetIds: sheetIdSet })
    )) {
      targetRowIds.add(rowId);
    }
  }

  // A "mention" of an address isn't the same as a "visit" — a target's home
  // address sitting on their target card, a Surveillance Commenced/Ceased
  // marker, a Travelled Via street list, or an address mentioned without any
  // narration of the target's presence there all inflate the raw mention
  // count without representing a real sighting. Collect only the qualifying
  // mentions first, keyed by sheet + row order, then collapse below.
  type QualifyingMention = {
    entityKey: string;
    label: string;
    fullDescription: string;
    sheetId: number;
    order: number;
  };
  const qualifying: QualifyingMention[] = [];

  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      // rowId 0 marks a synthetic occurrence built from the target's own
      // registry card (e.g. Home Base), not an actual running sheet row —
      // never a real sighting.
      if (occ.rowId === 0) continue;
      if (!sheetIdSet.has(occ.sheetId)) continue;
      // The address must be mentioned in a row a target is themselves
      // mentioned in.
      if (!targetRowIds.has(occ.rowId)) continue;

      const row = rowById.get(occ.rowId);
      if (!row?.observation) continue;
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;

      if (hasDateWindow) {
        const info = sheetDateInfo.get(occ.sheetId);
        const resolvedDate =
          row.rowDate ??
          addDaysISO(
            info?.sheetDate ?? toPerthDateISO(info?.createdAt ?? new Date()),
            row.dayOffset
          );
        if (resolvedDate < startISO || resolvedDate > endISO) continue;
      }

      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        fullDescription: occ.fullDescription,
        sheetId: occ.sheetId,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
      });
    }
  }

  // The fuller written form of each address, for geocoding (see
  // resolvePlaceLatLng) — every qualifying mention's, not just the visits'.
  const fullDescriptionsByKey = new Map<string, string[]>();
  for (const m of qualifying) {
    const list = fullDescriptionsByKey.get(m.entityKey);
    if (list) list.push(m.fullDescription);
    else fullDescriptionsByKey.set(m.entityKey, [m.fullDescription]);
  }

  // ── Collapse consecutive mentions of the same address into one visit ──────
  // "Arrived at X" followed by "departed X" (or "…and continued via:") is one
  // visit, not two — a new visit only counts once a *different* address
  // appears in between, or the sheet changes. Walk each sheet's qualifying
  // mentions in row order and count address transitions, not raw mentions.
  const grouped = new Map<string, { label: string; count: number }>();
  for (const visit of collapseToVisits(qualifying)) {
    const existing = grouped.get(visit.entityKey);
    if (existing) existing.count++;
    else grouped.set(visit.entityKey, { label: visit.label, count: 1 });
  }

  const results = await Promise.all(
    Array.from(grouped.entries()).map(async ([key, { label, count }]) => {
      const coords = await resolvePlaceLatLng(
        key,
        label,
        fullDescriptionsByKey.get(key) ?? []
      );
      if (!coords) return null;
      return { label, count, lat: coords.lat, lng: coords.lng };
    })
  );

  return results
    .filter((r): r is IntelligenceHeatMapLocation => r !== null)
    .sort((a, b) => b.count - a.count);
}
