import { eq, inArray } from "drizzle-orm";

import {
  buildSheetIntel,
  leftOutOfSheet,
  type SheetIntelLine as SheetIntelLineView,
} from "@shared/sheetIntel";
import type { LeftOutSentence } from "@shared/intelCues";

import {
  runningSheets,
  sheetIntelLines,
  sheetRows,
  type SheetIntelLine,
} from "../../drizzle/schema";

import { getDb } from "./core";
import {
  addDaysISO,
  getAllIntelligenceEntities,
  toPerthDateISO,
} from "./reports";
import { getSheetSummary, upsertSheetSummary } from "./governance";
import { getRowsBySheetId } from "./operations";

// ─── New Intelligence on the Supervisor Summary ──────────────────────────────
// The automatic lines are worked out from the rows every time (shared/
// sheetIntel.ts); only the hand-added lines and the "unticked" list are stored.

/** The cue keys the supervisor unticked on this sheet. */
export async function getSheetIntelHiddenKeys(
  sheetId: number
): Promise<string[]> {
  const record = await getSheetSummary(sheetId);
  return parseKeys(record?.intelHiddenKeys);
}

function parseKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setSheetIntelHiddenKeys(
  sheetId: number,
  keys: string[],
  cin: string
) {
  const unique = Array.from(new Set(keys));
  await upsertSheetSummary({
    sheetId,
    intelHiddenKeys: JSON.stringify(unique),
    lastEditedByCIN: cin,
  });
}

export async function getSheetIntelManualLines(
  sheetId: number
): Promise<SheetIntelLine[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sheetIntelLines)
    .where(eq(sheetIntelLines.sheetId, sheetId))
    .orderBy(sheetIntelLines.id);
}

export async function getSheetIntelManualLinesForSheets(
  sheetIds: number[]
): Promise<SheetIntelLine[]> {
  const db = await getDb();
  if (!db || sheetIds.length === 0) return [];
  return db
    .select()
    .from(sheetIntelLines)
    .where(inArray(sheetIntelLines.sheetId, sheetIds))
    .orderBy(sheetIntelLines.id);
}

export async function getSheetIntelManualLine(
  id: number
): Promise<SheetIntelLine | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sheetIntelLines)
    .where(eq(sheetIntelLines.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export interface SheetIntelLineFields {
  category: string;
  heading: string;
  text: string;
  time: string | null;
  timeMinutes: number | null;
}

export async function addSheetIntelManualLine(
  sheetId: number,
  fields: SheetIntelLineFields,
  addedByCIN: string
): Promise<SheetIntelLine | null> {
  const db = await getDb();
  if (!db) return null;
  const [res] = await db
    .insert(sheetIntelLines)
    .values({ sheetId, ...fields, addedByCIN });
  return getSheetIntelManualLine(
    Number((res as { insertId: number }).insertId)
  );
}

export async function updateSheetIntelManualLine(
  id: number,
  fields: SheetIntelLineFields
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetIntelLines)
    .set(fields)
    .where(eq(sheetIntelLines.id, id));
}

export async function deleteSheetIntelManualLine(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(sheetIntelLines).where(eq(sheetIntelLines.id, id));
}

// ─── "New this shift — first time recorded" ──────────────────────────────────

export interface SheetNewEntities {
  persons: string[];
  vehicles: string[];
  locations: string[];
}

const ROW_CHUNK = 500;

/**
 * Persons, vehicles and locations whose FIRST-EVER recorded occurrence (all
 * time, every operation, same rule as the Weekly Report's new intelligence) is
 * on this sheet. The baseline is the full record — never trimmed to what the
 * viewer may open — so a restricted viewer is never told something is "new"
 * only because its earlier sighting sits in an operation they cannot see; only
 * entities that occur on THIS sheet are ever returned.
 */
export async function getSheetNewEntities(
  sheetId: number
): Promise<SheetNewEntities> {
  const out: SheetNewEntities = { persons: [], vehicles: [], locations: [] };
  const db = await getDb();
  if (!db) return out;

  const entities = (
    await getAllIntelligenceEntities({ unscoped: true })
  ).filter(
    e =>
      (e.type === "person" ||
        e.type === "vehicle" ||
        e.type === "address" ||
        e.type === "business") &&
      e.occurrences.some(o => o.rowId > 0 && o.sheetId === sheetId)
  );
  if (entities.length === 0) return out;

  const rowIds = new Set<number>();
  for (const e of entities)
    for (const o of e.occurrences) if (o.rowId > 0) rowIds.add(o.rowId);
  const ids = Array.from(rowIds);
  const rowMeta = new Map<
    number,
    {
      sheetId: number;
      rowDate: string | null;
      dayOffset: number;
      timeMinutes: number | null;
    }
  >();
  for (let i = 0; i < ids.length; i += ROW_CHUNK) {
    const part = await db
      .select({
        id: sheetRows.id,
        sheetId: sheetRows.sheetId,
        rowDate: sheetRows.rowDate,
        dayOffset: sheetRows.dayOffset,
        timeMinutes: sheetRows.timeMinutes,
      })
      .from(sheetRows)
      .where(inArray(sheetRows.id, ids.slice(i, i + ROW_CHUNK)));
    for (const r of part) rowMeta.set(r.id, r);
  }
  const sheetIds = Array.from(
    new Set(Array.from(rowMeta.values()).map(r => r.sheetId))
  );
  const sheetMeta = new Map<
    number,
    { sheetDate: string | null; createdAt: Date }
  >();
  for (let i = 0; i < sheetIds.length; i += ROW_CHUNK) {
    const part = await db
      .select({
        id: runningSheets.id,
        sheetDate: runningSheets.sheetDate,
        createdAt: runningSheets.createdAt,
      })
      .from(runningSheets)
      .where(inArray(runningSheets.id, sheetIds.slice(i, i + ROW_CHUNK)));
    for (const s of part) sheetMeta.set(s.id, s);
  }

  // Same date rule as the Weekly Report: the row's own date, else the sheet's
  // date plus the legacy day offset.
  const dateOf = (rowId: number): string | null => {
    const r = rowMeta.get(rowId);
    if (!r) return null;
    if (r.rowDate) return r.rowDate;
    const s = sheetMeta.get(r.sheetId);
    if (!s) return null;
    return addDaysISO(s.sheetDate ?? toPerthDateISO(s.createdAt), r.dayOffset);
  };

  const seen = new Set<string>();
  for (const e of entities) {
    let first: {
      date: string;
      minutes: number;
      rowId: number;
      sheetId: number;
    } | null = null;
    for (const o of e.occurrences) {
      if (o.rowId <= 0) continue; // a registry card, not a sighting
      const date = dateOf(o.rowId);
      if (!date) continue;
      const cand = {
        date,
        minutes: rowMeta.get(o.rowId)?.timeMinutes ?? 0,
        rowId: o.rowId,
        sheetId: rowMeta.get(o.rowId)!.sheetId,
      };
      if (
        !first ||
        cand.date < first.date ||
        (cand.date === first.date &&
          (cand.minutes < first.minutes ||
            (cand.minutes === first.minutes && cand.rowId < first.rowId)))
      )
        first = cand;
    }
    if (!first || first.sheetId !== sheetId) continue;
    const list =
      e.type === "person"
        ? out.persons
        : e.type === "vehicle"
          ? out.vehicles
          : out.locations;
    const k = `${e.type === "business" ? "address" : e.type}:${e.shortForm}`;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push(e.shortForm);
  }
  out.persons.sort();
  out.vehicles.sort();
  out.locations.sort();
  return out;
}

// ─── Everything the New Intelligence section shows for one sheet ─────────────

export interface SheetIntelData {
  lines: SheetIntelLineView[];
  newThisShift: SheetNewEntities;
  leftOut: Array<LeftOutSentence & { rowId: number; time: string | null }>;
  /** The summary is complete, so the section is locked. */
  locked: boolean;
}

/** The automatic lines (from the rows), the hand-added lines and the unticked
 * list put together — the one answer the Supervisor Summary screen, the
 * Deployment Rollup (screen and export) and the Intelligence Package all read. */
export async function getSheetIntelData(
  sheetId: number
): Promise<SheetIntelData> {
  const [rows, manual, hidden, record, newThisShift] = await Promise.all([
    getRowsBySheetId(sheetId),
    getSheetIntelManualLines(sheetId),
    getSheetIntelHiddenKeys(sheetId),
    getSheetSummary(sheetId),
    getSheetNewEntities(sheetId),
  ]);
  return {
    lines: buildSheetIntel({ rows, manualLines: manual, hiddenKeys: hidden }),
    newThisShift,
    leftOut: leftOutOfSheet(rows),
    locked: !!record?.completedAt,
  };
}
