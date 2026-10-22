import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  auditLogs,
  certifications,
  InsertAuditLog,
  InsertCertification,
  InsertOperation,
  InsertRowMember,
  InsertRunningSheet,
  InsertSheetRow,
  operations,
  rowMembers,
  rowAttachments,
  attachmentEntityLinks,
  runningSheets,
  sheetRows,
  targets,
  associates,
  governanceRecords,
  targetShortcuts,
  operationTargetLinks,
  customMapMarkers,
  rsMappingWaypoints,
} from "../../drizzle/schema";

import {
  buildRunningSheetTitle,
  getTargetTitleBracket,
} from "../../shared/runningSheetTitle";
import { getDb } from "./core";
import { addDaysISO, perthTodayISO, toPerthDateISO } from "./reports";
import { deleteRowAttachment } from "./attachments";
import { getTargetById } from "./targets";
import { normalizeObservationPunctuation } from "./targetLogger";
import { autoRegisterDriverVehicles } from "./recycleBin";

// ─── Operations ─────────────────────────────────────────────────────────────

export async function getOperations() {
  const db = await getDb();
  if (!db) return [];
  // Only return active, non-deleted operations for the main operations list
  return db
    .select()
    .from(operations)
    .where(and(eq(operations.status, "active"), isNull(operations.deletedAt)))
    .orderBy(desc(operations.createdAt));
}

export async function getOperationsByStatus(
  status: "active" | "before_court" | "archive"
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(operations)
    .where(and(eq(operations.status, status), isNull(operations.deletedAt)))
    .orderBy(desc(operations.createdAt));
}

export async function getAllOperations() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(operations)
    .where(isNull(operations.deletedAt))
    .orderBy(desc(operations.createdAt));
}

export async function setOperationStatus(
  id: number,
  status: "active" | "before_court" | "archive"
): Promise<{ success: boolean; blockedSheets?: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If moving away from active, all sheets must be closed
  if (status !== "active") {
    const sheets = await db
      .select({
        id: runningSheets.id,
        title: runningSheets.title,
        closedAt: runningSheets.closedAt,
      })
      .from(runningSheets)
      .where(eq(runningSheets.operationId, id));
    const openSheets = sheets.filter(s => !s.closedAt);
    if (openSheets.length > 0) {
      return { success: false, blockedSheets: openSheets.map(s => s.title) };
    }
  }

  await db.update(operations).set({ status }).where(eq(operations.id, id));
  return { success: true };
}

// An active operation moves itself to Archive once every one of its running
// sheets is closed AND the most recent sheet's date is more than 30 days in
// the past. "Triggered on read" — see operation.list in routers.ts, which
// calls this before returning the active-operations list — same pattern
// purgeExpiredRecycleBinItems below already uses. Deliberately not a
// background cron: references/periodic-updates.md's heartbeat
// infrastructure is Manus-platform-hosted (server/_core/heartbeat.ts calls
// out to Manus's own forge backend), and this app is deployed independently
// (git pull + pnpm build + pm2, not through Manus hosting) with nothing else
// in the codebase actually calling that SDK — it wouldn't be reachable in
// production regardless of whether it's wired up here.
const AUTO_ARCHIVE_AFTER_DAYS = 30;

export async function autoArchiveEligibleOperations(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const activeOps = await db
    .select({ id: operations.id, name: operations.name })
    .from(operations)
    .where(and(eq(operations.status, "active"), isNull(operations.deletedAt)));
  if (activeOps.length === 0) return;

  const today = perthTodayISO();

  for (const op of activeOps) {
    const sheets = await db
      .select({
        closedAt: runningSheets.closedAt,
        sheetDate: runningSheets.sheetDate,
        createdAt: runningSheets.createdAt,
      })
      .from(runningSheets)
      .where(
        and(
          eq(runningSheets.operationId, op.id),
          isNull(runningSheets.deletedAt)
        )
      );

    // Nothing to measure "last sheet date" from, and a freshly created
    // operation with no sheets yet should never silently archive.
    if (sheets.length === 0) continue;
    // Every sheet must be closed, not just the most recent one.
    if (sheets.some(s => !s.closedAt)) continue;

    // Effective date per sheet: sheetDate if set, else the Perth calendar
    // date of createdAt — legacy sheets only, see runningSheets.sheetDate's
    // own comment in schema.ts. Plain string comparison is safe: both are
    // YYYY-MM-DD.
    const latestDate = sheets
      .map(s => s.sheetDate ?? toPerthDateISO(s.createdAt))
      .sort()
      .at(-1)!;
    if (addDaysISO(latestDate, AUTO_ARCHIVE_AFTER_DAYS) > today) continue;

    await db
      .update(operations)
      .set({ status: "archive" })
      .where(eq(operations.id, op.id));
    // sheetId: 0 / userId: 0 — same "not applicable to one sheet, no human
    // actor" sentinel routers.ts's manual operation.setStatus already uses
    // for this same action when a user does it directly.
    await createAuditLog({
      sheetId: 0,
      userId: 0,
      userName: "System",
      action: "operation_status_changed",
      details: `Operation "${op.name}" auto-archived — all running sheets closed and the most recent sheet date (${latestDate}) is more than ${AUTO_ARCHIVE_AFTER_DAYS} days ago`,
      createdAt: Date.now(),
    });
  }
}

export async function getOperationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(operations)
    .where(eq(operations.id, id))
    .limit(1);
  return result[0];
}

export async function createOperation(data: InsertOperation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operations).values(data);
  return result.insertId as number;
}

export async function updateOperation(
  id: number,
  data: Partial<InsertOperation>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operations).set(data).where(eq(operations.id, id));
}

export async function softDeleteOperation(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  await db
    .update(operations)
    .set({ deletedAt: now, deletedByCIN: cin })
    .where(eq(operations.id, id));
  // Every attachment always has an operationId, so this one update covers
  // both row-captured and manually-uploaded photos — they now go to the
  // Recycle Bin (and auto-purge after 7 days) alongside their operation
  // instead of quietly surviving it.
  await db
    .update(rowAttachments)
    .set({ deletedAt: now, deletedByCIN: cin })
    .where(
      and(eq(rowAttachments.operationId, id), isNull(rowAttachments.deletedAt))
    );
}

export async function deleteOperation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cascade: delete all child records before deleting the operation
  const sheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(eq(runningSheets.operationId, id));
  for (const sheet of sheets) {
    await deleteRunningSheet(sheet.id);
  }
  // Find targets that are EXCLUSIVELY linked to this operation (via legacy operationId FK)
  // and have no other operation links — these should be deleted, not orphaned
  const exclusiveTargets = await db
    .select({ id: targets.id })
    .from(targets)
    .where(and(eq(targets.operationId, id), isNull(targets.deletedAt)));
  for (const t of exclusiveTargets) {
    // Check if this target is also linked to other operations via the join table
    const otherLinks = await db
      .select({ id: operationTargetLinks.id })
      .from(operationTargetLinks)
      .where(
        and(
          eq(operationTargetLinks.targetId, t.id),
          sql`${operationTargetLinks.operationId} != ${id}`
        )
      )
      .limit(1);
    if (otherLinks.length === 0) {
      // Exclusively linked — delete target shortcuts, associates, then the
      // target itself. Associates always belong to exactly one target and
      // have no life of their own once it's gone — leaving them behind
      // orphaned real rows that getAllIntelligenceEntities() would
      // otherwise keep surfacing as permanent "INDICES" entities.
      await db
        .delete(targetShortcuts)
        .where(eq(targetShortcuts.targetId, t.id));
      await db.delete(associates).where(eq(associates.targetId, t.id));
      await db.delete(targets).where(eq(targets.id, t.id));
    } else {
      // Linked to other ops too — just clear the legacy FK
      await db
        .update(targets)
        .set({ operationId: null })
        .where(eq(targets.id, t.id));
    }
  }
  // Remove operation-target links for registry targets linked via join table
  // For registry targets linked ONLY to this operation, also delete them
  const linkedOnlyToThis = await db
    .select({ targetId: operationTargetLinks.targetId })
    .from(operationTargetLinks)
    .where(eq(operationTargetLinks.operationId, id));
  for (const link of linkedOnlyToThis) {
    const otherLinks = await db
      .select({ id: operationTargetLinks.id })
      .from(operationTargetLinks)
      .where(
        and(
          eq(operationTargetLinks.targetId, link.targetId),
          sql`${operationTargetLinks.operationId} != ${id}`
        )
      )
      .limit(1);
    if (otherLinks.length === 0) {
      // Only linked to this operation — delete the target, its shortcuts,
      // and its associates too (see matching comment above).
      await db
        .delete(targetShortcuts)
        .where(eq(targetShortcuts.targetId, link.targetId));
      await db.delete(associates).where(eq(associates.targetId, link.targetId));
      await db.delete(targets).where(eq(targets.id, link.targetId));
    }
  }
  await db
    .delete(operationTargetLinks)
    .where(eq(operationTargetLinks.operationId, id));
  // Delete custom map markers linked to this operation (hard delete — operation is gone)
  await db.delete(customMapMarkers).where(eq(customMapMarkers.operationId, id));
  // Every attachment always has an operationId (row-captured or manually
  // uploaded), so this is the actual ownership boundary for photos — sweep
  // up anything deleteRunningSheet's row-scoped pass above didn't reach
  // (manual uploads, or a row that was already gone).
  const remainingAttachments = await db
    .select({ id: rowAttachments.id })
    .from(rowAttachments)
    .where(eq(rowAttachments.operationId, id));
  for (const a of remainingAttachments) {
    await deleteRowAttachment(a.id);
  }
  await db.delete(operations).where(eq(operations.id, id));
}

export async function getOperationDeleteStats(id: number) {
  const db = await getDb();
  if (!db) return { sheetCount: 0, rowCount: 0, targetCount: 0 };
  const sheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(eq(runningSheets.operationId, id));
  const sheetIds = sheets.map(s => s.id);
  let rowCount = 0;
  if (sheetIds.length > 0) {
    const rowResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(sheetRows)
      .where(inArray(sheetRows.sheetId, sheetIds));
    rowCount = Number(rowResult[0]?.count ?? 0);
  }
  const targetResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(targets)
    .where(eq(targets.operationId, id));
  const targetCount = Number(targetResult[0]?.count ?? 0);
  return { sheetCount: sheets.length, rowCount, targetCount };
}

// ─── Running Sheets ───────────────────────────────────────────────────────────

export async function getRunningSheets() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt))
    .orderBy(desc(runningSheets.createdAt));
}

export async function getRunningSheetsByOperation(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(runningSheets)
    .where(
      and(
        eq(runningSheets.operationId, operationId),
        isNull(runningSheets.deletedAt)
      )
    )
    .orderBy(desc(runningSheets.createdAt));
}

export async function getRunningSheetsByOperations(operationIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (operationIds.length === 0) return [];
  return db
    .select()
    .from(runningSheets)
    .where(
      and(
        inArray(runningSheets.operationId, operationIds),
        isNull(runningSheets.deletedAt)
      )
    )
    .orderBy(desc(runningSheets.createdAt));
}

export async function getRunningSheetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(runningSheets)
    .where(eq(runningSheets.id, id))
    .limit(1);
  return result[0];
}

export async function createRunningSheet(data: InsertRunningSheet) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(runningSheets).values(data);
  return result.insertId as number;
}

export async function updateRunningSheet(
  id: number,
  data: Partial<InsertRunningSheet>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(runningSheets).set(data).where(eq(runningSheets.id, id));
}

/** Stops (rowId given) or resumes (rowId null) tracking one continuity card
 * on a sheet. Shared by everyone on the sheet. Returns the new map. */
export async function setContinuityDismissal(
  sheetId: number,
  key: string,
  rowId: number | null
): Promise<Record<string, number>> {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet) throw new Error("Sheet not found");
  let map: Record<string, number> = {};
  try {
    map = sheet.continuityDismissed
      ? (JSON.parse(sheet.continuityDismissed) as Record<string, number>)
      : {};
  } catch {
    map = {};
  }
  if (rowId === null) delete map[key];
  else map[key] = rowId;
  await updateRunningSheet(sheetId, {
    continuityDismissed: JSON.stringify(map),
  });
  return map;
}

/** Recomputes and overwrites a sheet's auto-generated title from its
 * current date/author/operation/target — call this after anything that
 * feeds the title changes (sheetDate, sheetCins/author, targetId, or the
 * operation's own name). Missing pieces are simply left out until they're
 * known, per buildRunningSheetTitle. */
export async function recomputeRunningSheetTitle(
  sheetId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet) return;

  const [operation, target] = await Promise.all([
    getOperationById(sheet.operationId),
    sheet.targetId ? getTargetById(sheet.targetId) : Promise.resolve(null),
  ]);
  if (!operation) return;

  let authorCIN: string | null = null;
  if (sheet.sheetCins) {
    try {
      const roster: { cin: string; isAuthor?: boolean }[] = JSON.parse(
        sheet.sheetCins
      );
      authorCIN = roster.find(c => c.isAuthor)?.cin ?? null;
    } catch {
      authorCIN = null;
    }
  }

  const title = buildRunningSheetTitle({
    sheetDate: sheet.sheetDate,
    createdAt: sheet.createdAt,
    authorCIN,
    operationName: operation.name,
    targetBracketLabel: getTargetTitleBracket(target ?? null),
  });

  await db
    .update(runningSheets)
    .set({ title })
    .where(eq(runningSheets.id, sheetId));
}

/** Resyncs every sheet under an operation — used when the operation itself
 * is renamed, since the operation name is baked into every sheet's title. */
export async function recomputeRunningSheetTitlesForOperation(
  operationId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(eq(runningSheets.operationId, operationId));
  for (const s of sheets) {
    await recomputeRunningSheetTitle(s.id);
  }
}

export async function softDeleteSheet(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  await db
    .update(runningSheets)
    .set({ deletedAt: now, deletedByCIN: cin })
    .where(eq(runningSheets.id, id));
  // Photos captured against one of this sheet's rows go to the Recycle Bin
  // with it. Manually-uploaded photos live at the operation level and are
  // untouched here — they only go when the whole operation does.
  const rows = await db
    .select({ id: sheetRows.id })
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, id));
  if (rows.length > 0) {
    await db
      .update(rowAttachments)
      .set({ deletedAt: now, deletedByCIN: cin })
      .where(
        and(
          inArray(
            rowAttachments.rowId,
            rows.map(r => r.id)
          ),
          isNull(rowAttachments.deletedAt)
        )
      );
  }
}

export async function deleteRunningSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cascade: delete all child records before deleting the sheet
  const rows = await db
    .select({ id: sheetRows.id })
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, id));
  if (rows.length > 0) {
    const rowIds = rows.map(r => r.id);
    // Photos captured against one of this sheet's rows — permanently gone
    // with it. Manually-uploaded (rowId null) photos live at the operation
    // level and are handled by deleteOperation instead.
    const rowLinkedAttachments = await db
      .select({ id: rowAttachments.id })
      .from(rowAttachments)
      .where(inArray(rowAttachments.rowId, rowIds));
    for (const a of rowLinkedAttachments) {
      await deleteRowAttachment(a.id);
    }
    // Delete certifications and row_members for these rows
    await db
      .delete(certifications)
      .where(inArray(certifications.rowId, rowIds));
    await db.delete(rowMembers).where(inArray(rowMembers.rowId, rowIds));
    await db.delete(sheetRows).where(eq(sheetRows.sheetId, id));
  }
  // Delete governance record for this sheet
  await db.delete(governanceRecords).where(eq(governanceRecords.sheetId, id));
  // Delete audit logs for this sheet (retained for accountability until sheet is permanently deleted)
  await db.delete(auditLogs).where(eq(auditLogs.sheetId, id));
  // Delete RS mapping waypoint overrides for this sheet
  await db.delete(rsMappingWaypoints).where(eq(rsMappingWaypoints.sheetId, id));
  await db.delete(runningSheets).where(eq(runningSheets.id, id));
}

export async function closeSheet(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(runningSheets)
    .set({ closedAt: Date.now(), closedByCIN: cin })
    .where(eq(runningSheets.id, id));
}

export async function reopenSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(runningSheets)
    .set({ closedAt: null, closedByCIN: null })
    .where(eq(runningSheets.id, id));
}

export async function moveRunningSheet(
  sheetId: number,
  targetOperationId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(runningSheets)
    .set({ operationId: targetOperationId })
    .where(eq(runningSheets.id, sheetId));
}

/**
 * Deep-copies a running sheet (and all its rows + row_members) into the target operation.
 * Certifications and governance records are NOT copied — the copy starts fresh.
 * Returns the new sheet ID.
 */
export async function copyRunningSheet(
  sheetId: number,
  targetOperationId: number,
  createdBy: number,
  newTitle?: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Fetch the source sheet
  const [srcSheet] = await db
    .select()
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!srcSheet) throw new Error("Source sheet not found");

  // 2. Create the new sheet (reset closed state)
  const [newSheetResult] = await db.insert(runningSheets).values({
    operationId: targetOperationId,
    title: newTitle?.trim() || srcSheet.title,
    targetName: srcSheet.targetName,
    sheetCins: srcSheet.sheetCins,
    targetId: srcSheet.targetId,
    createdBy,
    closedAt: null,
    closedByCIN: null,
  });
  const newSheetId = newSheetResult.insertId as number;

  // 3. Fetch all rows from the source sheet
  const srcRows = await db
    .select()
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId))
    .orderBy(sheetRows.rowNumber);

  for (const row of srcRows) {
    // 4. Insert each row into the new sheet
    const [newRowResult] = await db.insert(sheetRows).values({
      sheetId: newSheetId,
      rowNumber: row.rowNumber,
      time: row.time,
      timeMinutes: row.timeMinutes,
      observation: row.observation,
      isLocked: false, // copy starts unlocked
    });
    const newRowId = newRowResult.insertId as number;

    // 5. Copy row members for this row
    const srcMembers = await db
      .select()
      .from(rowMembers)
      .where(eq(rowMembers.rowId, row.id))
      .orderBy(rowMembers.sortOrder);
    if (srcMembers.length > 0) {
      await db.insert(rowMembers).values(
        srcMembers.map(m => ({
          rowId: newRowId,
          memberName: m.memberName,
          sortOrder: m.sortOrder,
        }))
      );
    }
  }

  return newSheetId;
}

// ─── Sheet Rows ───────────────────────────────────────────────────────────────

export async function getRowsBySheetId(sheetId: number) {
  return (await getRowsWithDays(sheetId)).rows;
}

// The sheet's rows in time order, with the day each one falls on (relative to
// the sheet's first row date) so a row's real time can be worked out — used to
// tell whether two sheets' surveillance times line up (findHandoverSource).
export async function getRowsWithDays(sheetId: number) {
  const db = await getDb();
  if (!db)
    return {
      rows: [] as (typeof sheetRows.$inferSelect)[],
      dayOffsetMap: new Map<number, number>(),
      minRowDate: null as string | null,
    };
  // Fetch all rows ordered by rowNumber (insertion order) first so we can
  // detect midnight rollovers from the time sequence itself.
  const raw = await db
    .select()
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId))
    .orderBy(sheetRows.rowNumber);

  // ── Day-offset sort ──────────────────────────────────────────────────────────
  // Priority order for determining a row's effective day:
  //   1. rowDate (YYYY-MM-DD) — explicit operator-set date, most authoritative.
  //      Day index is computed relative to the earliest rowDate in the sheet.
  //   2. dayOffset != 0 — legacy explicit toggle (kept for backward compat).
  //   3. Inference from timeMinutes sequence — for rows with neither.
  const timedRows = raw.filter(r => r.timeMinutes != null);
  const noTimeRows = raw.filter(r => r.timeMinutes == null);

  // Build effective day offset for each row.
  const dayOffsetMap = new Map<number, number>();

  // Find the earliest rowDate among all rows that have one, to use as day-0 anchor.
  const rowDates = raw.map(r => r.rowDate).filter((d): d is string => !!d);
  const minRowDate = rowDates.length > 0 ? rowDates.slice().sort()[0] : null;

  // First pass: assign offsets from rowDate (highest priority) or stored dayOffset (legacy)
  for (const r of timedRows) {
    if (r.rowDate && minRowDate) {
      // Compute day index relative to the earliest date in this sheet (Perth UTC+8)
      const anchor = new Date(minRowDate + "T00:00:00+08:00").getTime();
      const rowDay = new Date(r.rowDate + "T00:00:00+08:00").getTime();
      const dayIdx = Math.round((rowDay - anchor) / 86400000);
      dayOffsetMap.set(r.id, dayIdx);
    } else if (r.dayOffset !== 0) {
      dayOffsetMap.set(r.id, r.dayOffset);
    }
  }

  // Second pass: infer for rows with no explicit date/offset
  let currentDay = 0;
  let prevEffective = -1;
  for (const r of timedRows) {
    if (dayOffsetMap.has(r.id)) {
      // Already set explicitly — use it to update the running effective time
      prevEffective = r.timeMinutes! + dayOffsetMap.get(r.id)! * 1440;
      currentDay = dayOffsetMap.get(r.id)!;
      continue;
    }
    const mins = r.timeMinutes!;
    const effective = mins + currentDay * 1440;
    if (prevEffective >= 0 && effective < prevEffective - 120) {
      currentDay++;
    }
    dayOffsetMap.set(r.id, currentDay);
    prevEffective = mins + currentDay * 1440;
  }

  const effectiveMins = (r: (typeof raw)[0]) =>
    (r.timeMinutes ?? 0) + (dayOffsetMap.get(r.id) ?? 0) * 1440;

  const sortedTimed = [...timedRows].sort((a, b) => {
    const diff = effectiveMins(a) - effectiveMins(b);
    if (diff !== 0) return diff;
    return a.rowNumber - b.rowNumber;
  });

  // No-time rows float to the bottom, ordered by rowNumber
  const sortedNoTime = [...noTimeRows].sort(
    (a, b) => a.rowNumber - b.rowNumber
  );

  return {
    rows: [...sortedTimed, ...sortedNoTime],
    dayOffsetMap,
    minRowDate,
  };
}

export async function getRowById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sheetRows)
    .where(eq(sheetRows.id, id))
    .limit(1);
  return result[0];
}

export async function createSheetRow(data: InsertSheetRow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalized =
    typeof data.observation === "string"
      ? {
          ...data,
          observation: normalizeObservationPunctuation(data.observation),
        }
      : data;
  const [result] = await db.insert(sheetRows).values(normalized);
  if (typeof normalized.observation === "string" && normalized.sheetId) {
    await autoRegisterDriverVehicles(
      normalized.sheetId,
      normalized.observation
    );
  }
  return result.insertId as number;
}

export async function updateSheetRow(
  id: number,
  data: Partial<InsertSheetRow>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalized =
    typeof data.observation === "string"
      ? {
          ...data,
          observation: normalizeObservationPunctuation(data.observation),
        }
      : data;
  const before =
    typeof normalized.observation === "string"
      ? (
          await db
            .select({
              sheetId: sheetRows.sheetId,
              observation: sheetRows.observation,
            })
            .from(sheetRows)
            .where(eq(sheetRows.id, id))
            .limit(1)
        )[0]
      : undefined;
  await db.update(sheetRows).set(normalized).where(eq(sheetRows.id, id));
  if (before && typeof normalized.observation === "string") {
    await autoRegisterDriverVehicles(
      before.sheetId,
      normalized.observation,
      before.observation ?? ""
    );
  }
}

export async function deleteSheetRow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Deleting a row is permanent (unlike the sheet/operation soft-delete
  // pattern), so any photo attachments left on it would otherwise become
  // orphaned — unreachable by every query that joins rowAttachments back
  // to sheetRows, including the Recycle Bin. Clean those up first.
  const attachments = await db
    .select({ id: rowAttachments.id })
    .from(rowAttachments)
    .where(eq(rowAttachments.rowId, id));
  if (attachments.length) {
    const attachmentIds = attachments.map(a => a.id);
    await db
      .delete(attachmentEntityLinks)
      .where(inArray(attachmentEntityLinks.attachmentId, attachmentIds));
    await db
      .delete(rowAttachments)
      .where(inArray(rowAttachments.id, attachmentIds));
  }
  await db.delete(sheetRows).where(eq(sheetRows.id, id));
}

export async function setRowLocked(id: number, isLocked: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sheetRows).set({ isLocked }).where(eq(sheetRows.id, id));
}

// ─── Travelled Via row auto-insertion ──────────────────────────────────────
// A vehicle-departure narrative conventionally ends "...and continued
// via:", with the streets actually travelled logged as their own row
// directly below it, at the SAME time — see the "TV" trigger in
// SheetDetail.tsx's EditableCell onSave, which fills that row's text (once
// the arrival row also exists, so a route can be computed between the
// two). Officers had to remember to add that blank row themselves first,
// every single time. This adds it automatically the moment "continued
// via:" first appears in a saved row, so it's simply already there.
const CONTINUED_VIA_PATTERN = /continued via:?/i;

export function textHasContinuedVia(text: string | null | undefined): boolean {
  return !!text && CONTINUED_VIA_PATTERN.test(text);
}

// Inserts an empty row immediately after a row on the same sheet, sharing
// its exact time (time/timeMinutes/dayOffset/rowDate) so it sorts directly
// beneath it in the time-ordered display (rows sort by timeMinutes then
// rowNumber — this new row's rowNumber is always higher, so it wins the
// tiebreak). Left empty rather than pre-filled: the officer either types
// the streets by hand, or triggers the existing "tv" auto-fill later once
// the arrival row exists to compute a route from.
export async function insertTravelledViaRow(afterRow: {
  sheetId: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset: number | null;
  rowDate: string | null;
}): Promise<number> {
  const existingRows = await getRowsBySheetId(afterRow.sheetId);
  const rowNumber = existingRows.length + 1;
  return createSheetRow({
    sheetId: afterRow.sheetId,
    rowNumber,
    time: afterRow.time ?? undefined,
    timeMinutes: afterRow.timeMinutes ?? undefined,
    dayOffset: afterRow.dayOffset ?? 0,
    rowDate: afterRow.rowDate ?? undefined,
    isLocked: false,
  });
}

// ─── Row Members ──────────────────────────────────────────────────────────────

export async function getMembersByRowId(rowId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(rowMembers)
    .where(eq(rowMembers.rowId, rowId))
    .orderBy(rowMembers.sortOrder, rowMembers.createdAt);
}

export async function reorderRowMembers(rowId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Update each member's sortOrder to match the position in orderedIds
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(rowMembers)
        .set({ sortOrder: index })
        .where(and(eq(rowMembers.id, id), eq(rowMembers.rowId, rowId)))
    )
  );
}

export async function getMembersByRowIds(rowIds: number[]) {
  if (rowIds.length === 0) return [];
  const results = await Promise.all(rowIds.map(rid => getMembersByRowId(rid)));
  return results.flat();
}

// Returns all row_members whose memberName matches a given CIN across all rows in a sheet
export async function getMembersByCINAndSheet(sheetId: number, cin: string) {
  const db = await getDb();
  if (!db) return [];
  // Get all row IDs for this sheet first
  const rows = await db
    .select({ id: sheetRows.id, isLocked: sheetRows.isLocked })
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId));
  if (rows.length === 0) return [];
  const rowIds = rows.map(r => r.id);
  // Find members in those rows whose memberName matches the CIN
  const members = await db
    .select()
    .from(rowMembers)
    .where(
      and(inArray(rowMembers.rowId, rowIds), eq(rowMembers.memberName, cin))
    );
  return members.map(m => {
    const row = rows.find(r => r.id === m.rowId);
    return { ...m, rowIsLocked: row?.isLocked ?? false };
  });
}

export async function addRowMember(data: InsertRowMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(rowMembers).values(data);
  return result.insertId as number;
}

export async function removeRowMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(rowMembers).where(eq(rowMembers.id, id));
}

// ─── Certifications ───────────────────────────────────────────────────────────

export async function getCertificationsByRowId(rowId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(certifications)
    .where(
      and(eq(certifications.rowId, rowId), eq(certifications.isActive, true))
    );
}

export async function getCertificationsByRowIds(rowIds: number[]) {
  if (rowIds.length === 0) return [];
  const results = await Promise.all(
    rowIds.map(rid => getCertificationsByRowId(rid))
  );
  return results.flat();
}

export async function getCertificationByMember(
  rowId: number,
  memberId: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(certifications)
    .where(
      and(
        eq(certifications.rowId, rowId),
        eq(certifications.memberId, memberId),
        eq(certifications.isActive, true)
      )
    )
    .limit(1);
  return result[0];
}

export async function createCertification(data: InsertCertification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(certifications).values(data);
  return result.insertId as number;
}

export async function deactivateCertification(rowId: number, memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(certifications)
    .set({ isActive: false })
    .where(
      and(
        eq(certifications.rowId, rowId),
        eq(certifications.memberId, memberId)
      )
    );
}

export async function deactivateAllCertificationsForRow(rowId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(certifications)
    .set({ isActive: false })
    .where(eq(certifications.rowId, rowId));
}

/**
 * Returns all running sheets that have at least one row where the given CIN
 * is a member but has NOT yet been certified (active certification missing).
 * Result is enriched with operationName and uncertifiedRowCount.
 */
export async function getOutstandingSheetsForCin(cin: string): Promise<
  {
    sheetId: number;
    sheetTitle: string;
    targetName: string | null;
    operationId: number;
    operationName: string;
    uncertifiedRowCount: number;
    createdAt: Date;
  }[]
> {
  const db = await getDb();
  if (!db) return [];

  // Find all row_members whose memberName matches the CIN
  const members = await db
    .select()
    .from(rowMembers)
    .where(eq(rowMembers.memberName, cin));
  if (members.length === 0) return [];

  const memberIds = members.map(m => m.id);
  const rowIds = Array.from(new Set(members.map(m => m.rowId)));

  // Get active certifications for those members
  const certs = await db
    .select()
    .from(certifications)
    .where(
      and(
        inArray(certifications.memberId, memberIds),
        eq(certifications.isActive, true)
      )
    );

  // Determine which members are uncertified
  const uncertifiedMembers = members.filter(
    m => !certs.some(c => c.memberId === m.id)
  );
  if (uncertifiedMembers.length === 0) return [];

  // Get the rows for uncertified members
  const uncertifiedRowIds = Array.from(
    new Set(uncertifiedMembers.map(m => m.rowId))
  );
  const rows = await db
    .select()
    .from(sheetRows)
    .where(inArray(sheetRows.id, uncertifiedRowIds));

  // Get distinct sheet IDs
  const sheetIds = Array.from(new Set(rows.map(r => r.sheetId)));
  if (sheetIds.length === 0) return [];

  // Fetch sheets — only those that still exist
  const sheets = await db
    .select()
    .from(runningSheets)
    .where(inArray(runningSheets.id, sheetIds));

  // Fetch operations for those sheets — only those that still exist
  const opIds = Array.from(new Set(sheets.map(s => s.operationId)));
  if (opIds.length === 0) return [];
  const ops = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, opIds));

  // Only include sheets whose operation still exists
  const validOpIds = new Set(ops.map(o => o.id));
  const validSheets = sheets.filter(s => validOpIds.has(s.operationId));

  return validSheets
    .map(sheet => {
      const op = ops.find(o => o.id === sheet.operationId)!;
      const uncertifiedRowCount = rows.filter(
        r => r.sheetId === sheet.id
      ).length;
      return {
        sheetId: sheet.id,
        sheetTitle: sheet.title,
        targetName: sheet.targetName ?? null,
        operationId: sheet.operationId,
        operationName: op.name,
        uncertifiedRowCount,
        createdAt: sheet.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * For a given sheet, return per-CIN certification status.
 * A CIN is "certified" when every row_member row with that memberName
 * has an active certification.
 * Returns: { cin: string; certified: boolean }[]
 */
export async function getCinCertStatusForSheet(
  sheetId: number,
  cinList: string[]
): Promise<{ cin: string; certified: boolean }[]> {
  if (cinList.length === 0) return [];
  const db = await getDb();
  if (!db) return cinList.map(cin => ({ cin, certified: false }));

  // Get all rows for this sheet
  const rows = await db
    .select({ id: sheetRows.id })
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId));
  if (rows.length === 0) return cinList.map(cin => ({ cin, certified: false }));

  const rowIds = rows.map(r => r.id);

  // Get all row_members for these rows
  const members = await db
    .select()
    .from(rowMembers)
    .where(inArray(rowMembers.rowId, rowIds));

  // Get all active certifications for these rows
  const certs = await getCertificationsByRowIds(rowIds);

  return cinList.map(cin => {
    const cinMembers = members.filter(
      m => m.memberName.toLowerCase() === cin.toLowerCase()
    );
    if (cinMembers.length === 0) return { cin, certified: false };
    const allCertified = cinMembers.every(m =>
      certs.some(c => c.memberId === m.id && c.isActive)
    );
    return { cin, certified: allCertified };
  });
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
}

// Stitches each log's own rowId (already stored on every row/certification
// event, see createAuditLog's callers) to that row's own time + a short
// observation excerpt, so "Certified by CIN 459" reads as "Certified by CIN
// 459 — row at 09:46 AM: Surveillance commenced..." instead of a bare
// action with no way to tell which running-sheet entry it refers to.
// Batched into one query for however many distinct rowIds the page's whole
// log list touches, rather than one query per log entry.
const ROW_EXCERPT_LENGTH = 80;

async function attachRowSummaries<T extends { rowId: number | null }>(
  logs: T[]
): Promise<(T & { rowTime: string | null; rowObservation: string | null })[]> {
  const rowIds = Array.from(
    new Set(logs.map(l => l.rowId).filter((id): id is number => id != null))
  );
  if (rowIds.length === 0) {
    return logs.map(l => ({ ...l, rowTime: null, rowObservation: null }));
  }
  const db = await getDb();
  if (!db)
    return logs.map(l => ({ ...l, rowTime: null, rowObservation: null }));
  const rows = await db
    .select({
      id: sheetRows.id,
      time: sheetRows.time,
      observation: sheetRows.observation,
    })
    .from(sheetRows)
    .where(inArray(sheetRows.id, rowIds));
  const rowById = new Map(rows.map(r => [r.id, r]));
  return logs.map(l => {
    const row = l.rowId != null ? rowById.get(l.rowId) : undefined;
    const observation = row?.observation?.trim() || null;
    return {
      ...l,
      rowTime: row?.time ?? null,
      rowObservation: observation
        ? observation.length > ROW_EXCERPT_LENGTH
          ? observation.slice(0, ROW_EXCERPT_LENGTH) + "…"
          : observation
        : null,
    };
  });
}

export async function getAuditLogsBySheet(sheetId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.sheetId, sheetId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return attachRowSummaries(logs);
}

export async function getAllAuditLogs(limit = 500) {
  const db = await getDb();
  if (!db) return [];
  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return attachRowSummaries(logs);
}
