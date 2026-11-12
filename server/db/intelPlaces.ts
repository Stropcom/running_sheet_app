import { and, eq, inArray, isNull } from "drizzle-orm";
import { parseExtraAddresses } from "@shared/extraAddresses";
import {
  buildVisits,
  classifyPlace,
  type PlaceKind,
  type PlaceMention,
  type PlaceRecord,
  type RegisteredAddressRef,
} from "@shared/placesReport";
import { classifyVisitDirection } from "../patternOfLife";
import {
  operations,
  runningSheets,
  sheetRows,
  intelPinOverrides,
  targetPlaceLabels,
} from "../../drizzle/schema";
import { attributedRowIds } from "../entityAttribution";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import { getTargetById } from "./targets";
import { resolvePlaceLatLng } from "./geocoding";
import { getAllIntelligenceEntities } from "./intelEntities";
import {
  OBSERVATION_SIGNAL_RE,
  addDaysISO,
  isNonObservationRow,
  perthTodayISO,
  toPerthDateISO,
} from "./reportHelpers";

export interface IntelTargetPlacesResponse {
  targetName: string;
  operationName: string;
  /** Last day of the report, Perth time — "new this week" counts back from it. */
  todayISO: string;
  places: (PlaceRecord & {
    /** The kind an officer set on this report, or null when it is automatic. */
    officerKind: PlaceKind | null;
  })[];
}

/** Whether an entity is one of the target's registered addresses — Home, or
 * Address 2, 3… — read from the synthetic "Target card" occurrence
 * getAllIntelligenceEntities seeds for each (rowId 0). */
export function registeredRefOf(
  occurrences: readonly { rowId: number; observationSnippet?: string | null }[],
  targetName: string,
  extras: readonly { label: string }[]
): RegisteredAddressRef | null {
  const prefix = `Target card — ${targetName} [`;
  for (const occ of occurrences) {
    if (occ.rowId !== 0) continue;
    const snip = occ.observationSnippet ?? "";
    if (!snip.startsWith(prefix)) continue;
    const field = snip.slice(prefix.length).replace(/\]$/, "");
    if (field === "HBF") return { slot: "home", label: "" };
    const n = /^Address (\d+)$/.exec(field);
    if (n)
      return {
        slot: "extra",
        number: Number(n[1]),
        label: extras[Number(n[1]) - 2]?.label ?? "",
      };
  }
  return null;
}

export async function getIntelTargetPlaces(
  operationId: number,
  targetId: number
): Promise<IntelTargetPlacesResponse | null> {
  const db = await getDb();
  if (!db) return null;
  const [operation] = await db
    .select({ id: operations.id, name: operations.name })
    .from(operations)
    .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)))
    .limit(1);
  const target = await getTargetById(targetId);
  if (!operation || !target) return null;
  const empty: IntelTargetPlacesResponse = {
    targetName: target.name,
    operationName: operation.name,
    todayISO: perthTodayISO(),
    places: [],
  };

  const allEntities = await getAllIntelligenceEntities();
  const targetEntity = allEntities.find(
    e => e.isTarget && e.targetId === targetId
  );
  const targetRowIds = attributedRowIds(targetEntity?.occurrences, {
    operationId,
  });
  if (!targetRowIds.size) return empty;

  const sheetIds = new Set<number>();
  for (const occ of targetEntity?.occurrences ?? [])
    if (targetRowIds.has(occ.rowId)) sheetIds.add(occ.sheetId);
  if (!sheetIds.size) return empty;

  const sheets = await db
    .select({
      id: runningSheets.id,
      createdAt: runningSheets.createdAt,
      sheetDate: runningSheets.sheetDate,
    })
    .from(runningSheets)
    .where(inArray(runningSheets.id, Array.from(sheetIds)));
  const sheetDateInfo = new Map(sheets.map(s => [s.id, s]));

  // Every row of those sheets, in order — a row's "previous row" decides
  // whether it is a street list rather than an observation (isNonObservationRow).
  const allSheetRows = await db
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
    .where(inArray(sheetRows.sheetId, Array.from(sheetIds)))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes, sheetRows.rowNumber);
  const rowById = new Map(
    allSheetRows.filter(r => targetRowIds.has(r.id)).map(r => [r.id, r])
  );
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  const bySheet = new Map<number, typeof allSheetRows>();
  for (const row of allSheetRows) {
    if (!bySheet.has(row.sheetId)) bySheet.set(row.sheetId, []);
    bySheet.get(row.sheetId)!.push(row);
  }
  for (const list of Array.from(bySheet.values())) {
    list.forEach((r, i) => {
      previousObservationByRowId.set(
        r.id,
        i > 0 ? (list[i - 1].observation ?? null) : null
      );
      rowOrderIndex.set(r.id, i);
    });
  }
  const resolveDateISO = (row: {
    sheetId: number;
    rowDate: string | null;
    dayOffset: number;
  }): string => {
    if (row.rowDate) return row.rowDate;
    const info = sheetDateInfo.get(row.sheetId);
    return addDaysISO(
      info?.sheetDate ?? toPerthDateISO(info?.createdAt ?? new Date()),
      row.dayOffset
    );
  };

  // The target's registered addresses, from the synthetic "Target card"
  // occurrences getAllIntelligenceEntities seeds for them.
  const extras = parseExtraAddresses(target.extraAddresses);
  const registeredOf = (entity: (typeof allEntities)[number]) =>
    registeredRefOf(entity.occurrences, target.name, extras);

  // Signs saved for places (Google's type from the address suggestions, or an
  // officer's own icon) — how a place Google knows as a gym is known here.
  const signs = new Map<string, string>();
  for (const o of await db
    .select({
      label: intelPinOverrides.label,
      icon: intelPinOverrides.markerIcon,
    })
    .from(intelPinOverrides))
    if (o.icon) signs.set(o.label, o.icon);
  const officer = new Map<string, PlaceKind>();
  for (const l of await db
    .select()
    .from(targetPlaceLabels)
    .where(eq(targetPlaceLabels.targetId, targetId)))
    officer.set(l.placeKey, l.kind as PlaceKind);

  const mentions: PlaceMention[] = [];
  const meta = new Map<
    string,
    { name: string; entity: (typeof allEntities)[number] }
  >();
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0 || !targetRowIds.has(occ.rowId)) continue;
      const row = rowById.get(occ.rowId);
      if (!row?.observation || row.timeMinutes == null) continue;
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;
      const placeKey = normalizeEntityLabel(entity.shortForm);
      if (!meta.has(placeKey))
        meta.set(placeKey, { name: entity.shortForm, entity });
      mentions.push({
        placeKey,
        sheetId: occ.sheetId,
        sheetTitle: occ.sheetTitle,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
        rowId: occ.rowId,
        dateISO: resolveDateISO(row),
        timeMinutes: row.timeMinutes,
        direction: classifyVisitDirection(row.observation),
      });
    }
  }

  const visitsByPlace = new Map<string, ReturnType<typeof buildVisits>>();
  for (const v of buildVisits(mentions)) {
    if (!visitsByPlace.has(v.placeKey)) visitsByPlace.set(v.placeKey, []);
    visitsByPlace.get(v.placeKey)!.push(v);
  }
  const places: IntelTargetPlacesResponse["places"] = [];
  for (const [placeKey, visits] of Array.from(visitsByPlace.entries())) {
    const info = meta.get(placeKey);
    if (!info) continue;
    const officerKind = officer.get(placeKey) ?? null;
    const c = classifyPlace({
      name: info.name,
      savedSign: signs.get(info.name) ?? null,
      registered: registeredOf(info.entity),
      officerKind,
    });
    places.push({
      placeKey,
      name: info.name,
      kind: c.kind,
      source: c.source,
      registeredAs: c.registeredAs,
      visits,
      officerKind,
    });
  }
  return { ...empty, places };
}

/** Where the places one target goes are on the map — for the Day Route. Each
 * place is geocoded from the fuller "<street>, SUBURB STATE" an officer wrote
 * for it when there is one (same rule as the Heat Map), cache-first. A place
 * that cannot be located is left out, and the route simply has no line to it. */
export async function getIntelPlaceCoords(
  operationId: number,
  targetId: number,
  placeKeys: string[]
): Promise<{ placeKey: string; lat: number; lng: number }[]> {
  // Only places this target's own rows put them at, on an operation the
  // caller can reach — never an arbitrary label from anywhere in the system.
  const report = await getIntelTargetPlaces(operationId, targetId);
  const ownKeys = new Set((report?.places ?? []).map(p => p.placeKey));
  const wanted = new Set(placeKeys.filter(k => ownKeys.has(k)));
  if (!wanted.size) return [];
  const allEntities = await getAllIntelligenceEntities();
  const fullByKey = new Map<string, string[]>();
  const nameByKey = new Map<string, string>();
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    const key = normalizeEntityLabel(entity.shortForm);
    if (!wanted.has(key)) continue;
    nameByKey.set(key, entity.shortForm);
    const list = fullByKey.get(key) ?? [];
    for (const occ of entity.occurrences) list.push(occ.fullDescription);
    fullByKey.set(key, list);
  }
  const results = await Promise.all(
    Array.from(nameByKey.entries()).map(async ([key, name]) => {
      const coords = await resolvePlaceLatLng(
        key,
        name,
        fullByKey.get(key) ?? []
      );
      return coords
        ? { placeKey: key, lat: coords.lat, lng: coords.lng }
        : null;
    })
  );
  return results.filter(
    (r): r is { placeKey: string; lat: number; lng: number } => r !== null
  );
}

// ─── Target Predictor ────────────────────────────────────────────────────────
// What the Map page's Target Predictor needs for one target on one operation:
// the places he goes (located on the map, cache-first like the Heat Map), the
// stops with where he went next (shared/targetPredictor.ts), and where the
// chosen running sheet last had him. The sums are done on the client with the
// clock — nothing here predicts anything.
