// Part of the Intelligence queries (server/db/intelligence.ts): Deep Search and the line search across an operation's running sheets.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { snippetAround } from "@shared/searchSnippet";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import {
  operations,
  rowMembers,
  runningSheets,
  sheetRows,
  targets,
} from "../../../drizzle/schema";
import { getDb } from "../core";

// ─── Deep Search ─────────────────────────────────────────────────────────────
// Returns operations that match the query across: operation fields, sheet titles,
// sheet CINs (JSON text), target fields, and observation row text.
// Each matched operation includes a list of match contexts for display.

/** One running sheet line the search found, with where to open it. */
export type DeepSearchRowHit = {
  rowId: number;
  sheetId: number;
  sheetTitle: string;
  /** The row's time as written ("10:05 AM"), or null. */
  time: string | null;
  /** The row's date (YYYY-MM-DD) when it has one. */
  date: string | null;
  /** A stretch of the officer's own text around the match. */
  snippet: string;
  /** "text": the words are in the observation. "cin": an officer CIN on the row matched. */
  via: "text" | "cin";
};

/** At most this many lines are returned per operation; `rowHitCount` is the full count. */
export const DEEP_SEARCH_MAX_HITS_PER_OPERATION = 40;

export type DeepSearchMatch = {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  matchContexts: string[];
  operationStatus: "active" | "before_court" | "archive";
  /** The matching running sheet lines (newest sheets first, each sheet in row order). */
  rowHits: DeepSearchRowHit[];
  /** How many lines matched in all (rowHits is capped). */
  rowHitCount: number;
};

export async function deepSearchOperations(
  query: string
): Promise<DeepSearchMatch[]> {
  const db = await getDb();
  if (!db || !query.trim()) return [];

  const q = `%${query.trim().toLowerCase()}%`;

  // 1. Operations that match on their own fields (case-insensitive via LOWER)
  const opMatches = await db
    .select()
    .from(operations)
    .where(
      and(
        isNull(operations.deletedAt),
        or(
          like(sql`LOWER(${operations.name})`, q),
          like(sql`LOWER(COALESCE(${operations.promisNumber}, ''))`, q),
          like(sql`LOWER(COALESCE(${operations.imsNumber}, ''))`, q),
          like(sql`LOWER(COALESCE(${operations.investigationUnit}, ''))`, q)
        )
      )
    );

  // 2. Sheets that match on title or sheetCins JSON text
  const sheetMatches = await db
    .select({
      operationId: runningSheets.operationId,
      title: runningSheets.title,
      sheetCins: runningSheets.sheetCins,
    })
    .from(runningSheets)
    .where(
      and(
        isNull(runningSheets.deletedAt),
        or(
          like(sql`LOWER(${runningSheets.title})`, q),
          like(sql`LOWER(COALESCE(${runningSheets.sheetCins}, ''))`, q)
        )
      )
    );

  // 3. Targets that match on any field
  const targetMatches = await db
    .select({
      operationId: targets.operationId,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      dep: targets.dep,
      arr: targets.arr,
    })
    .from(targets)
    .where(
      and(
        isNull(targets.deletedAt),
        or(
          like(sql`LOWER(${targets.name})`, q),
          like(sql`LOWER(COALESCE(${targets.tgt}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.hb}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v1}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v2}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.hbf}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v1f}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v2f}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.dep}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.arr}, ''))`, q)
        )
      )
    );

  // 4. Observation rows that match
  const rowMatches = await db
    .select({
      id: sheetRows.id,
      sheetId: sheetRows.sheetId,
      observation: sheetRows.observation,
      time: sheetRows.time,
      timeMinutes: sheetRows.timeMinutes,
      rowNumber: sheetRows.rowNumber,
      rowDate: sheetRows.rowDate,
    })
    .from(sheetRows)
    .where(like(sql`LOWER(COALESCE(${sheetRows.observation}, ''))`, q));

  // 5. Row members (CIN in row) that match
  const memberMatches = await db
    .select({ rowId: rowMembers.rowId, memberName: rowMembers.memberName })
    .from(rowMembers)
    .where(like(sql`LOWER(${rowMembers.memberName})`, q));

  // Resolve rows → sheets → operations (live sheets in live operations only)
  const memberRowIds = Array.from(new Set(memberMatches.map(m => m.rowId)));
  const memberRowInfo = new Map<
    number,
    {
      id: number;
      sheetId: number;
      observation: string | null;
      time: string | null;
      timeMinutes: number | null;
      rowNumber: number;
      rowDate: string | null;
    }
  >();
  if (memberRowIds.length > 0) {
    const memberRows = await db
      .select({
        id: sheetRows.id,
        sheetId: sheetRows.sheetId,
        observation: sheetRows.observation,
        time: sheetRows.time,
        timeMinutes: sheetRows.timeMinutes,
        rowNumber: sheetRows.rowNumber,
        rowDate: sheetRows.rowDate,
      })
      .from(sheetRows)
      .where(inArray(sheetRows.id, memberRowIds));
    memberRows.forEach(r => memberRowInfo.set(r.id, r));
  }
  const allSheetIds = Array.from(
    new Set([
      ...rowMatches.map(r => r.sheetId),
      ...Array.from(memberRowInfo.values()).map(r => r.sheetId),
    ])
  );
  const sheetInfo: Record<
    number,
    { operationId: number; title: string; sheetDate: string | null }
  > = {};
  if (allSheetIds.length > 0) {
    const liveSheets = await db
      .select({
        id: runningSheets.id,
        operationId: runningSheets.operationId,
        title: runningSheets.title,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .innerJoin(operations, eq(operations.id, runningSheets.operationId))
      .where(
        and(
          inArray(runningSheets.id, allSheetIds),
          isNull(runningSheets.deletedAt),
          isNull(operations.deletedAt)
        )
      );
    liveSheets.forEach(s => {
      sheetInfo[s.id] = s;
    });
  }
  const sheetOpMap: Record<number, number> = {};
  for (const [id, s] of Object.entries(sheetInfo))
    sheetOpMap[Number(id)] = s.operationId;

  // Collect all matching operationIds with context labels
  const matchMap = new Map<number, Set<string>>();

  const ensure = (id: number) => {
    if (!matchMap.has(id)) matchMap.set(id, new Set());
  };

  opMatches.forEach(op => {
    ensure(op.id);
    matchMap.get(op.id)!.add("Operation details");
  });

  sheetMatches.forEach(s => {
    // s.operationId IS the operationId directly from runningSheets.operationId
    const opId = s.operationId;
    ensure(opId);
    matchMap.get(opId)!.add(`Sheet: ${s.title}`);
  });

  targetMatches.forEach(t => {
    if (t.operationId === null) return;
    ensure(t.operationId);
    matchMap.get(t.operationId)!.add(`Target: ${t.name}`);
  });

  // The running sheet lines themselves (one per row, text matches first; a
  // row that matched both ways is listed once, as a text match).
  type HitRow = {
    id: number;
    sheetId: number;
    observation: string | null;
    time: string | null;
    timeMinutes: number | null;
    rowNumber: number;
    rowDate: string | null;
    via: "text" | "cin";
  };
  const hitRows = new Map<number, HitRow>();
  rowMatches.forEach(r => hitRows.set(r.id, { ...r, via: "text" }));
  memberMatches.forEach(m => {
    const r = memberRowInfo.get(m.rowId);
    if (r && !hitRows.has(r.id)) hitRows.set(r.id, { ...r, via: "cin" });
    const opId = r ? sheetOpMap[r.sheetId] : undefined;
    if (!opId) return;
    ensure(opId);
    matchMap.get(opId)!.add(`CIN: ${m.memberName}`);
  });
  const hitsByOp = new Map<number, HitRow[]>();
  hitRows.forEach(r => {
    const opId = sheetOpMap[r.sheetId];
    if (!opId) return;
    ensure(opId);
    if (!hitsByOp.has(opId)) hitsByOp.set(opId, []);
    hitsByOp.get(opId)!.push(r);
  });
  hitsByOp.forEach(list =>
    // Newest sheet first (higher id), each sheet in the order of its rows.
    list.sort(
      (a, b) =>
        b.sheetId - a.sheetId || a.rowNumber - b.rowNumber || a.id - b.id
    )
  );

  // Fetch full operation records for all matched ids
  const matchedIds = Array.from(matchMap.keys());
  if (matchedIds.length === 0) return [];

  const matchedOps = await db
    .select()
    .from(operations)
    .where(
      and(inArray(operations.id, matchedIds), isNull(operations.deletedAt))
    );

  return matchedOps.map(op => {
    const allHits = hitsByOp.get(op.id) ?? [];
    return {
      operationId: op.id,
      operationName: op.name,
      promisNumber: op.promisNumber ?? null,
      imsNumber: op.imsNumber ?? null,
      investigationUnit: op.investigationUnit ?? null,
      matchContexts: Array.from(matchMap.get(op.id) ?? []),
      operationStatus: (op.status ?? "active") as
        | "active"
        | "before_court"
        | "archive",
      rowHitCount: allHits.length,
      rowHits: allHits.slice(0, DEEP_SEARCH_MAX_HITS_PER_OPERATION).map(r => ({
        rowId: r.id,
        sheetId: r.sheetId,
        sheetTitle: sheetInfo[r.sheetId]?.title ?? "",
        time: r.time ?? null,
        date: r.rowDate ?? sheetInfo[r.sheetId]?.sheetDate ?? null,
        snippet: snippetAround(r.observation ?? "", query),
        via: r.via,
      })),
    };
  });
}

/** At most this many lines come back from a search inside one operation. */
export const OPERATION_LINE_SEARCH_MAX = 200;

/**
 * The running sheet lines of ONE operation that match a search — the same
 * "contains, any case" match and the same line shape as the Operations page
 * search (deepSearchOperations), for the search box inside an operation. Live
 * sheets only; a line is found by its words or by a CIN on it.
 */
export async function searchOperationLines(
  operationId: number,
  query: string
): Promise<{ hits: DeepSearchRowHit[]; total: number }> {
  const db = await getDb();
  const text = query.trim();
  if (!db || !text) return { hits: [], total: 0 };
  const q = `%${text.toLowerCase()}%`;

  const cols = {
    id: sheetRows.id,
    sheetId: sheetRows.sheetId,
    observation: sheetRows.observation,
    time: sheetRows.time,
    rowNumber: sheetRows.rowNumber,
    rowDate: sheetRows.rowDate,
    sheetTitle: runningSheets.title,
    sheetDate: runningSheets.sheetDate,
  };
  const live = and(
    eq(runningSheets.operationId, operationId),
    isNull(runningSheets.deletedAt),
    isNull(operations.deletedAt)
  );
  const byText = await db
    .select(cols)
    .from(sheetRows)
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .innerJoin(operations, eq(operations.id, runningSheets.operationId))
    .where(
      and(live, like(sql`LOWER(COALESCE(${sheetRows.observation}, ''))`, q))
    );
  const byCin = await db
    .select(cols)
    .from(rowMembers)
    .innerJoin(sheetRows, eq(sheetRows.id, rowMembers.rowId))
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .innerJoin(operations, eq(operations.id, runningSheets.operationId))
    .where(and(live, like(sql`LOWER(${rowMembers.memberName})`, q)));

  type Found = (typeof byText)[number] & { via: "text" | "cin" };
  const rows = new Map<number, Found>();
  byText.forEach(r => rows.set(r.id, { ...r, via: "text" }));
  byCin.forEach(r => {
    if (!rows.has(r.id)) rows.set(r.id, { ...r, via: "cin" });
  });
  // Newest sheet first (higher id), each sheet in the order of its rows.
  const all = Array.from(rows.values()).sort(
    (a, b) => b.sheetId - a.sheetId || a.rowNumber - b.rowNumber || a.id - b.id
  );
  return {
    total: all.length,
    hits: all.slice(0, OPERATION_LINE_SEARCH_MAX).map(r => ({
      rowId: r.id,
      sheetId: r.sheetId,
      sheetTitle: r.sheetTitle,
      time: r.time ?? null,
      date: r.rowDate ?? r.sheetDate ?? null,
      snippet: snippetAround(r.observation ?? "", text),
      via: r.via,
    })),
  };
}
