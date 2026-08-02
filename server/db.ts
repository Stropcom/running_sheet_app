import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool as createPromisePool } from "mysql2/promise";
import { vaultEncrypt, vaultDecrypt } from "./wipcVault";
import { cosineSimilarity } from "./faceRecognition";
import { makeRequest, type GeocodingResult } from "./_core/map";
import {
  auditLogs,
  certifications,
  InsertAuditLog,
  InsertCertification,
  InsertOperation,
  InsertRowMember,
  InsertRunningSheet,
  InsertSheetRow,
  InsertUser,
  operations,
  rowMembers,
  rowAttachments,
  InsertRowAttachment,
  attachmentEntityLinks,
  InsertAttachmentEntityLink,
  personDetections,
  InsertPersonDetection,
  faceMatchDismissals,
  runningSheets,
  sheetRows,
  shortcuts,
  InsertShortcut,
  targets,
  InsertTarget,
  targetFieldHistory,
  InsertTargetFieldHistory,
  users,
  governanceRecords,
  GovernanceRecord,
  sheetSummaries,
  SheetSummary,
  InsertSheetSummary,
  sheetSummaryEntries,
  SheetSummaryEntry,
  targetShortcuts,
  InsertTargetShortcut,
  operationTargetLinks,
  wipcMembers,
  wipcOfficerProfiles,
  wipcAuditLog,
  WipcMemberRecord,
  WipcOfficerProfile,
  userLocations,
  customMapMarkers,
  intelligenceGeocodeCache,
  CustomMapMarker,
  InsertCustomMapMarker,
  rsMappingWaypoints,
  userSidebarOrder,
  opManagerPriorityRows,
  opManagerTaskingCells,
  opManagerSupervisorContacts,
  opManagerPostedWeeks,
  notifications,
  entityAliases,
  InsertEntityAlias,
  entityDedupDecisions,
  InsertEntityDedupDecision,
} from "../drizzle/schema";
import {
  findPossibleDuplicates,
  type DedupType,
  type DedupCandidateEntity,
} from "./entityDedup";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Awaited<ReturnType<typeof createPromisePool>> | null = null;
let _lastConnectAttempt = 0;
const RECONNECT_COOLDOWN_MS = 5000; // don't retry more than once per 5s
// Caches the in-flight connection attempt so concurrent getDb() callers (e.g.
// several queries fired via Promise.all on a cold start, before any pool
// exists yet) await the same attempt instead of each independently hitting
// the cooldown check below and silently getting null — which previously
// meant only the first of several concurrent queries actually ran, and the
// rest quietly returned empty results with no error.
let _connectingPromise: Promise<ReturnType<typeof drizzle> | null> | null =
  null;

// Managed hosts (e.g. TiDB Cloud) require TLS; a local dev database normally
// isn't configured for it. Only force SSL for non-local hosts so local
// development keeps working without requiring a local SSL setup.
function isLocalDatabaseHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

async function createDbPool(
  retries = 3
): Promise<ReturnType<typeof drizzle> | null> {
  const useSsl = !isLocalDatabaseHost(process.env.DATABASE_URL!);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = createPromisePool({
        uri: process.env.DATABASE_URL!,
        ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 15000,
        // Automatically re-establish broken connections
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      // Verify the connection is actually alive
      await pool.query("SELECT 1");
      _pool = pool;
      console.log(`[Database] Pool created successfully (attempt ${attempt})`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return drizzle(pool as any);
    } catch (error) {
      console.warn(
        `[Database] Connection attempt ${attempt}/${retries} failed:`,
        error
      );
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // backoff: 1s, 2s
      }
    }
  }
  console.error("[Database] All connection attempts failed");
  return null;
}

export async function getDb() {
  // If we have a pool, do a lightweight health check to detect stale connections
  if (_db && _pool) {
    try {
      await _pool.query("SELECT 1");
      return _db;
    } catch {
      console.warn("[Database] Pool health check failed — reconnecting...");
      _db = null;
      _pool = null;
    }
  }
  if (!_db && process.env.DATABASE_URL) {
    if (_connectingPromise) return _connectingPromise;
    const now = Date.now();
    if (now - _lastConnectAttempt < RECONNECT_COOLDOWN_MS) {
      // Too soon to retry — return null to avoid hammering the DB
      return null;
    }
    _lastConnectAttempt = now;
    _connectingPromise = createDbPool(3).finally(() => {
      _connectingPromise = null;
    });
    _db = await _connectingPromise;
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByCin(cin: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.cin, cin))
    .limit(1);
  return result[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function createUser(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(users).values(data);
  return result.insertId as number;
}

export async function updateUser(id: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, id));
}

export async function updateUserRole(
  userId: number,
  role: "observer" | "member" | "admin"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, userId));
}

// Legacy upsert kept for OAuth callback compatibility
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  await db
    .insert(users)
    .values(user)
    .onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
}

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
  await db
    .update(operations)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(operations.id, id));
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
      // Exclusively linked — delete target shortcuts then the target
      await db
        .delete(targetShortcuts)
        .where(eq(targetShortcuts.targetId, t.id));
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
      // Only linked to this operation — delete the target too
      await db
        .delete(targetShortcuts)
        .where(eq(targetShortcuts.targetId, link.targetId));
      await db.delete(targets).where(eq(targets.id, link.targetId));
    }
  }
  await db
    .delete(operationTargetLinks)
    .where(eq(operationTargetLinks.operationId, id));
  // Delete custom map markers linked to this operation (hard delete — operation is gone)
  await db.delete(customMapMarkers).where(eq(customMapMarkers.operationId, id));
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

export async function softDeleteSheet(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(runningSheets)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(runningSheets.id, id));
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
  const db = await getDb();
  if (!db) return [];
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

  return [...sortedTimed, ...sortedNoTime];
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
  const [result] = await db.insert(sheetRows).values(data);
  return result.insertId as number;
}

export async function updateSheetRow(
  id: number,
  data: Partial<InsertSheetRow>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sheetRows).set(data).where(eq(sheetRows.id, id));
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

// ─── Row Attachments ────────────────────────────────────────────────────────

export async function createRowAttachment(data: InsertRowAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(rowAttachments).values(data);
  return result.insertId as number;
}

// linkedCount = number of Intelligence entity links on each attachment — used
// to require photos be linked to an entity before a Governance row can be
// marked saved, and to show a linked/unlinked badge in the Images gallery and
// on inline running-sheet photo attachments. linkedCategories is the distinct
// set of entity categories ("target"/"vehicle"/"associate"/"location") linked
// to that attachment, so the badge can show which kind of thing a photo is
// linked to at a glance (a category-specific icon when there's exactly one,
// a generic "linked" icon when it spans more than one) without a second
// round-trip per thumbnail. linkedEntities carries the actual label per link
// (target name, vehicle rego, Unidentified Person placeholder, etc.) so
// thumbnails can show *who/what* a photo is linked to, not just that it is.
async function attachLinkedCounts<T extends { id: number }>(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rows: T[]
): Promise<
  (T & {
    linkedCount: number;
    linkedCategories: string[];
    linkedEntities: Array<{ category: string; label: string }>;
  })[]
> {
  if (rows.length === 0) return [];
  const attachmentIds = rows.map(r => r.id);
  const [linkCounts, linkRows] = await Promise.all([
    db
      .select({
        attachmentId: attachmentEntityLinks.attachmentId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(attachmentEntityLinks)
      .where(inArray(attachmentEntityLinks.attachmentId, attachmentIds))
      .groupBy(attachmentEntityLinks.attachmentId),
    db
      .select({
        attachmentId: attachmentEntityLinks.attachmentId,
        category: attachmentEntityLinks.category,
        entityLabel: attachmentEntityLinks.entityLabel,
      })
      .from(attachmentEntityLinks)
      .where(inArray(attachmentEntityLinks.attachmentId, attachmentIds)),
  ]);
  const countMap = new Map(
    linkCounts.map(l => [l.attachmentId, Number(l.count)])
  );
  const categoryMap = new Map<number, string[]>();
  const entityMap = new Map<
    number,
    Array<{ category: string; label: string }>
  >();
  for (const l of linkRows) {
    const cats = categoryMap.get(l.attachmentId) ?? [];
    if (!cats.includes(l.category)) cats.push(l.category);
    categoryMap.set(l.attachmentId, cats);
    const ents = entityMap.get(l.attachmentId) ?? [];
    ents.push({ category: l.category, label: l.entityLabel });
    entityMap.set(l.attachmentId, ents);
  }
  return rows.map(r => ({
    ...r,
    linkedCount: countMap.get(r.id) ?? 0,
    linkedCategories: categoryMap.get(r.id) ?? [],
    linkedEntities: entityMap.get(r.id) ?? [],
  }));
}

export async function getAttachmentsByRowIds(rowIds: number[]) {
  const db = await getDb();
  if (!db || rowIds.length === 0) return [];
  const attachments = await db
    .select()
    .from(rowAttachments)
    .where(
      and(
        inArray(rowAttachments.rowId, rowIds),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(asc(rowAttachments.createdAt));
  return attachLinkedCounts(db, attachments);
}

export async function getAttachmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(rowAttachments)
    .where(eq(rowAttachments.id, id))
    .limit(1);
  return result[0];
}

// Batches in the CINs of members on each attachment's row (excluding the
// __SPACE__ spacer entry) — used for the "date/time · CIN" caption shown
// under photos, which reflects the observation row, not the upload.
async function attachRowMemberCins<T extends { rowId: number | null }>(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rows: T[]
): Promise<(T & { memberCINs: string[] })[]> {
  if (rows.length === 0) return [];
  // Manually-uploaded photos may have no row at all — nothing to look up for those.
  const rowIds = Array.from(
    new Set(rows.map(r => r.rowId).filter((id): id is number => id != null))
  );
  const members =
    rowIds.length > 0
      ? await db
          .select({
            rowId: rowMembers.rowId,
            memberName: rowMembers.memberName,
          })
          .from(rowMembers)
          .where(inArray(rowMembers.rowId, rowIds))
      : [];
  const byRow = new Map<number, string[]>();
  for (const m of members) {
    if (m.memberName === "__SPACE__") continue;
    const arr = byRow.get(m.rowId) ?? [];
    arr.push(m.memberName);
    byRow.set(m.rowId, arr);
  }
  return rows.map(r => ({
    ...r,
    memberCINs: r.rowId != null ? (byRow.get(r.rowId) ?? []) : [],
  }));
}

// All attachments across every running sheet in an operation, joined back to
// their row/sheet so the Images folder can show which sheet/row each came from.
export async function getAttachmentsByOperationId(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  // Left-joined: manually-uploaded photos (rowId null) belong to the
  // operation directly via rowAttachments.operationId and have no sheet/row
  // to join through. isNull(runningSheets.deletedAt) still excludes photos
  // whose sheet was soft-deleted, since the join only NULLs out for photos
  // that never had a sheet in the first place.
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      isManualUpload: rowAttachments.isManualUpload,
      url: rowAttachments.url,
      mimeType: rowAttachments.mimeType,
      caption: rowAttachments.caption,
      uploadedByCIN: rowAttachments.uploadedByCIN,
      createdAt: rowAttachments.createdAt,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .where(
      and(
        eq(rowAttachments.operationId, operationId),
        isNull(runningSheets.deletedAt),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(desc(rowAttachments.createdAt));
  return attachLinkedCounts(db, await attachRowMemberCins(db, rows));
}

// All attachments on a single running sheet, joined back to their row for a
// time label.
export async function getAttachmentsBySheetId(sheetId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      isManualUpload: rowAttachments.isManualUpload,
      url: rowAttachments.url,
      mimeType: rowAttachments.mimeType,
      caption: rowAttachments.caption,
      uploadedByCIN: rowAttachments.uploadedByCIN,
      createdAt: rowAttachments.createdAt,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .innerJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .where(
      and(eq(sheetRows.sheetId, sheetId), isNull(rowAttachments.deletedAt))
    )
    .orderBy(desc(rowAttachments.createdAt));
  return attachLinkedCounts(db, await attachRowMemberCins(db, rows));
}

// Soft-delete — goes to the Recycle Bin for 7 days before purge
export async function softDeleteAttachment(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(rowAttachments)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(rowAttachments.id, id));
}

export async function reinstateAttachment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(rowAttachments)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(rowAttachments.id, id));
}

// Permanent delete — used when purging expired Recycle Bin items, or by an
// admin hard-deleting straight from the Recycle Bin.
export async function deleteRowAttachment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.attachmentId, id));
  await db.delete(rowAttachments).where(eq(rowAttachments.id, id));
}

// ─── Attachment Entity Links ────────────────────────────────────────────────
// Matches the same normalization getAllIntelligenceEntities() uses to
// de-duplicate vehicle/associate/location entities, so a link's entityKey
// lines up with entity.shortForm regardless of casing/whitespace.
export function normalizeEntityLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function linkAttachmentToEntity(data: {
  attachmentId: number;
  category:
    | "target"
    | "vehicle"
    | "associate"
    | "location"
    | "unidentified_person";
  targetId?: number;
  entityLabel: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const entityKey =
    data.category === "target" ? null : normalizeEntityLabel(data.entityLabel);
  const findExisting = () =>
    db
      .select({ id: attachmentEntityLinks.id })
      .from(attachmentEntityLinks)
      .where(
        and(
          eq(attachmentEntityLinks.attachmentId, data.attachmentId),
          eq(attachmentEntityLinks.category, data.category),
          data.category === "target"
            ? eq(attachmentEntityLinks.targetId, data.targetId ?? -1)
            : eq(attachmentEntityLinks.entityKey, entityKey ?? "")
        )
      )
      .limit(1);
  // Avoid duplicate links to the same entity
  const existing = await findExisting();
  if (existing.length > 0) return existing[0].id;
  const insertData: InsertAttachmentEntityLink = {
    attachmentId: data.attachmentId,
    category: data.category,
    targetId: data.category === "target" ? data.targetId : null,
    entityKey,
    entityLabel: data.entityLabel,
  };
  try {
    const [result] = await db.insert(attachmentEntityLinks).values(insertData);
    return result.insertId as number;
  } catch (err) {
    // The check above is a plain SELECT-then-INSERT, so two requests for the
    // same face landing close together (e.g. a fast double-tap on the
    // face-select Confirm button) can both pass it before either commits.
    // The unique index on (attachmentId, category, entityKey) is the real
    // guard — on conflict, the other request won the race, so reuse its row.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ER_DUP_ENTRY" &&
      entityKey !== null
    ) {
      const raceWinner = await findExisting();
      if (raceWinner.length > 0) return raceWinner[0].id;
    }
    throw err;
  }
}

export async function unlinkAttachmentFromEntity(linkId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, linkId));
}

export async function getEntityLinksByAttachmentId(attachmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.attachmentId, attachmentId));
}

// ─── Person Detections (face recognition) ──────────────────────────────────

export async function createPersonDetection(data: {
  attachmentId: number;
  entityLinkId: number;
  bbox: [number, number, number, number];
  landmarks: [number, number][];
  embedding: number[];
  detectionConfidence: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const insertData: InsertPersonDetection = {
    attachmentId: data.attachmentId,
    entityLinkId: data.entityLinkId,
    bboxX0: data.bbox[0],
    bboxY0: data.bbox[1],
    bboxX1: data.bbox[2],
    bboxY1: data.bbox[3],
    landmarks: JSON.stringify(data.landmarks),
    embedding: JSON.stringify(data.embedding),
    detectionConfidence: data.detectionConfidence,
  };
  try {
    const [result] = await db.insert(personDetections).values(insertData);
    return result.insertId as number;
  } catch (err) {
    // entityLinkId is unique (one detection per link, see schema comment) —
    // a racing duplicate confirm request (see linkAttachmentToEntity) can
    // reach here with the same linkId the other request already saved a
    // detection for. Treat that as already-done rather than erroring.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ER_DUP_ENTRY"
    ) {
      const [existing] = await db
        .select({ id: personDetections.id })
        .from(personDetections)
        .where(eq(personDetections.entityLinkId, data.entityLinkId))
        .limit(1);
      if (existing) return existing.id;
    }
    throw err;
  }
}

export interface FaceMatchCandidate {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
  attachmentId: number;
  photoUrl: string;
}

// Threshold picked from empirical testing against one real multi-face photo
// (same face re-encoded ~0.99, mirrored ~0.89, different people ~0.1-0.3) —
// deliberately generous since a missed real match is worse than an extra
// candidate the officer just rejects. Lowered from an initial 0.35 after
// real operational photos showed the on-device MobileFace embedding's
// discriminative margin is narrow under real lighting/angle/pose variation
// (different people ranged roughly -0.06 to 0.31, one confirmed same-person
// cross-photo pair scored 0.45) — 0.35 was missing true matches that sat
// just under it. Still just a starting point for further calibration:
// matches are always human-confirmed, never applied automatically, so a
// loose threshold only means more suggestions to review, not bad data.
export const FACE_MATCH_THRESHOLD = 0.25;
const FACE_MATCH_MAX_RESULTS = 5;

// Compares a newly-confirmed face's embedding against every other confirmed
// face on file (other Unidentified Person entries and identified
// Targets/Associates alike) and returns the closest candidates above
// threshold, excluding whatever this face's own link is and anything the
// officer has already dismissed as "not a match" against it. Never called
// automatically outside a face-confirm flow, and never applied without a
// human explicitly accepting a specific candidate (see confirmFaceMatch).
export async function findSimilarFaces(
  embedding: number[],
  excludeEntityLinkId: number
): Promise<FaceMatchCandidate[]> {
  const db = await getDb();
  if (!db) return [];

  const dismissals = await db
    .select()
    .from(faceMatchDismissals)
    .where(
      or(
        eq(faceMatchDismissals.entityLinkIdA, excludeEntityLinkId),
        eq(faceMatchDismissals.entityLinkIdB, excludeEntityLinkId)
      )
    );
  const dismissedPartners = new Set<number>();
  for (const d of dismissals) {
    dismissedPartners.add(
      d.entityLinkIdA === excludeEntityLinkId
        ? d.entityLinkIdB
        : d.entityLinkIdA
    );
  }

  const rows = await db
    .select({
      entityLinkId: personDetections.entityLinkId,
      embedding: personDetections.embedding,
      attachmentId: personDetections.attachmentId,
      category: attachmentEntityLinks.category,
      targetId: attachmentEntityLinks.targetId,
      entityLabel: attachmentEntityLinks.entityLabel,
      photoUrl: rowAttachments.url,
    })
    .from(personDetections)
    .innerJoin(
      attachmentEntityLinks,
      eq(personDetections.entityLinkId, attachmentEntityLinks.id)
    )
    .innerJoin(
      rowAttachments,
      eq(personDetections.attachmentId, rowAttachments.id)
    )
    .where(isNull(rowAttachments.deletedAt));

  const candidates: FaceMatchCandidate[] = [];
  for (const r of rows) {
    if (r.entityLinkId === excludeEntityLinkId) continue;
    if (dismissedPartners.has(r.entityLinkId)) continue;
    const otherEmbedding: number[] = JSON.parse(r.embedding);
    const similarity = cosineSimilarity(embedding, otherEmbedding);
    if (similarity >= FACE_MATCH_THRESHOLD) {
      candidates.push({
        entityLinkId: r.entityLinkId,
        category: r.category,
        targetId: r.targetId,
        entityLabel: r.entityLabel,
        similarity,
        attachmentId: r.attachmentId,
        photoUrl: r.photoUrl,
      });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, FACE_MATCH_MAX_RESULTS);
}

// Officer confirmed "yes, this is the same person" — merges the two links'
// identities. Whichever side carries the stronger identification wins (a
// real Target/Associate outranks an anonymous Unidentified Person
// placeholder), and every link sharing the *weaker* side's identity is
// upgraded to the stronger one — never the other way around. This used to
// unconditionally make the newly-confirmed link adopt the matched link's
// identity on the assumption the new side was "almost always a fresh
// Unidentified Person entry" — which broke exactly when an officer
// positively IDs someone as a Target/Associate and the match happens to be
// an existing Unidentified Person: the fresh Target link got silently
// overwritten back to "unidentified". A confirmed positive ID must never be
// downgraded by a merge, regardless of which side of the match it's on.
const FACE_IDENTITY_PRIORITY: Record<string, number> = {
  unidentified_person: 0,
  associate: 1,
  target: 2,
};

export async function confirmFaceMatch(
  newLinkId: number,
  matchedLinkId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [newLink] = await db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, newLinkId))
    .limit(1);
  const [matched] = await db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, matchedLinkId))
    .limit(1);
  if (!newLink) throw new Error("New entity link not found");
  if (!matched) throw new Error("Matched entity link not found");

  const newPriority = FACE_IDENTITY_PRIORITY[newLink.category] ?? 0;
  const matchedPriority = FACE_IDENTITY_PRIORITY[matched.category] ?? 0;
  // Ties (including the common Unidentified-Person-joins-an-existing-
  // Unidentified-Person-pool case) favor the matched/existing side, so a
  // single freshly-confirmed face doesn't rename an already-established pool.
  const [winner, loser] =
    newPriority > matchedPriority ? [newLink, matched] : [matched, newLink];

  const loserGroupWhere =
    loser.category === "target"
      ? and(
          eq(attachmentEntityLinks.category, "target"),
          eq(attachmentEntityLinks.targetId, loser.targetId ?? -1)
        )
      : and(
          eq(attachmentEntityLinks.category, loser.category),
          eq(attachmentEntityLinks.entityKey, loser.entityKey ?? "")
        );

  await db
    .update(attachmentEntityLinks)
    .set({
      category: winner.category,
      targetId: winner.targetId,
      entityKey: winner.entityKey,
      entityLabel: winner.entityLabel,
    })
    .where(loserGroupWhere);
}

// Officer confirmed "no, not the same person" — stored unordered (smaller id
// first) so findSimilarFaces only needs one OR lookup to check both directions.
export async function createFaceMatchDismissal(
  entityLinkIdA: number,
  entityLinkIdB: number,
  cin?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [a, b] =
    entityLinkIdA < entityLinkIdB
      ? [entityLinkIdA, entityLinkIdB]
      : [entityLinkIdB, entityLinkIdA];
  await db
    .insert(faceMatchDismissals)
    .values({ entityLinkIdA: a, entityLinkIdB: b, dismissedByCIN: cin });
}

// One row per distinct linked entity with its photo count — used to show a
// camera badge on Intelligence Folder rows without an N+1 query per entity.
export async function getEntityLinkCounts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      category: attachmentEntityLinks.category,
      targetId: attachmentEntityLinks.targetId,
      entityKey: attachmentEntityLinks.entityKey,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(attachmentEntityLinks)
    .innerJoin(
      rowAttachments,
      eq(attachmentEntityLinks.attachmentId, rowAttachments.id)
    )
    .where(isNull(rowAttachments.deletedAt))
    .groupBy(
      attachmentEntityLinks.category,
      attachmentEntityLinks.targetId,
      attachmentEntityLinks.entityKey
    );
}

// All photos linked to one entity, joined back to row/sheet for display.
export async function getAttachmentsForEntity(params: {
  category:
    | "target"
    | "vehicle"
    | "associate"
    | "location"
    | "unidentified_person";
  targetId?: number;
  entityLabel?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const entityKey = params.entityLabel
    ? normalizeEntityLabel(params.entityLabel)
    : null;
  const links = await db
    .select()
    .from(attachmentEntityLinks)
    .where(
      and(
        eq(attachmentEntityLinks.category, params.category),
        params.category === "target"
          ? eq(attachmentEntityLinks.targetId, params.targetId ?? -1)
          : eq(attachmentEntityLinks.entityKey, entityKey ?? "")
      )
    );
  if (links.length === 0) return [];
  const attachmentIds = links.map(l => l.attachmentId);
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      isManualUpload: rowAttachments.isManualUpload,
      url: rowAttachments.url,
      mimeType: rowAttachments.mimeType,
      uploadedByCIN: rowAttachments.uploadedByCIN,
      createdAt: rowAttachments.createdAt,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .where(
      and(
        inArray(rowAttachments.id, attachmentIds),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(desc(rowAttachments.createdAt));
  const withCins = await attachRowMemberCins(db, rows);
  return withCins.map(r => ({
    ...r,
    linkId: links.find(l => l.attachmentId === r.id)!.id,
  }));
}

export interface OperationEntityPhoto {
  id: number;
  url: string;
  rowId: number | null;
  rowTime: string | null;
  rowDate: string | null;
  memberCINs: string[];
}

// Batched photo lookup for an Operation profile: given the targets in the
// operation and the (normalized) labels of every associated vehicle/
// associate/location shown against those targets, returns photos grouped
// by targetId and by "category::entityKey" so the profile can slot each
// entity's linked photos into its own section in one pass.
async function getAttachmentsForOperationEntities(
  targetIds: number[],
  entityKeys: { vehicle: string[]; associate: string[]; location: string[] }
): Promise<{
  targetPhotos: Map<number, OperationEntityPhoto[]>;
  entityPhotos: Map<string, OperationEntityPhoto[]>;
}> {
  const empty = {
    targetPhotos: new Map<number, OperationEntityPhoto[]>(),
    entityPhotos: new Map<string, OperationEntityPhoto[]>(),
  };
  const db = await getDb();
  if (!db) return empty;

  const conditions = [];
  if (targetIds.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "target"),
        inArray(attachmentEntityLinks.targetId, targetIds)
      )
    );
  if (entityKeys.vehicle.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "vehicle"),
        inArray(attachmentEntityLinks.entityKey, entityKeys.vehicle)
      )
    );
  if (entityKeys.associate.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "associate"),
        inArray(attachmentEntityLinks.entityKey, entityKeys.associate)
      )
    );
  if (entityKeys.location.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "location"),
        inArray(attachmentEntityLinks.entityKey, entityKeys.location)
      )
    );
  if (!conditions.length) return empty;

  const links = await db
    .select()
    .from(attachmentEntityLinks)
    .where(or(...conditions));
  if (!links.length) return empty;

  const attachmentIds = Array.from(new Set(links.map(l => l.attachmentId)));
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      url: rowAttachments.url,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .where(
      and(
        inArray(rowAttachments.id, attachmentIds),
        isNull(rowAttachments.deletedAt)
      )
    );
  const withCins = await attachRowMemberCins(db, rows);
  const byAttachmentId = new Map(withCins.map(r => [r.id, r]));

  const targetPhotos = new Map<number, OperationEntityPhoto[]>();
  const entityPhotos = new Map<string, OperationEntityPhoto[]>();
  for (const link of links) {
    const photo = byAttachmentId.get(link.attachmentId);
    if (!photo) continue;
    if (link.category === "target" && link.targetId != null) {
      const arr = targetPhotos.get(link.targetId) ?? [];
      arr.push(photo);
      targetPhotos.set(link.targetId, arr);
    } else if (link.entityKey) {
      const key = `${link.category}::${link.entityKey}`;
      const arr = entityPhotos.get(key) ?? [];
      arr.push(photo);
      entityPhotos.set(key, arr);
    }
  }
  return { targetPhotos, entityPhotos };
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

export async function getAuditLogsBySheet(sheetId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.sheetId, sheetId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getAllAuditLogs(limit = 500) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ─── Targets ─────────────────────────────────────────────────────────────────

export async function getTargetsByOperation(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get targets by legacy operationId FK AND by operation_target_links (registry-linked)
  // Exclude soft-deleted targets in both paths
  const byFk = await db
    .select()
    .from(targets)
    .where(
      and(eq(targets.operationId, operationId), isNull(targets.deletedAt))
    );
  const linked = await db
    .select({
      id: targets.id,
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
      extraVehicles: targets.extraVehicles,
      wildFields: targets.wildFields,
      operationId: targets.operationId,
      createdBy: targets.createdBy,
      createdAt: targets.createdAt,
      updatedAt: targets.updatedAt,
    })
    .from(operationTargetLinks)
    .innerJoin(targets, eq(operationTargetLinks.targetId, targets.id))
    .where(
      and(
        eq(operationTargetLinks.operationId, operationId),
        isNull(targets.deletedAt)
      )
    );
  // Merge, deduplicate by id
  const seen = new Set<number>();
  const all = [];
  for (const t of [...byFk, ...linked]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      all.push(t);
    }
  }
  return all;
}

/** Return all targets across all operations, joined with operation name */
export async function getAllTargets() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId, operations.id))
    .where(isNull(targets.deletedAt))
    .orderBy(targets.name);
  return rows;
}

export async function createTarget(data: InsertTarget) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targets).values(data);
  return { id: (result as any).insertId as number };
}

export async function updateTarget(
  id: number,
  data: Partial<
    Pick<
      InsertTarget,
      | "name"
      | "tgt"
      | "hbf"
      | "hb"
      | "v1f"
      | "v1"
      | "v2f"
      | "v2"
      | "dep"
      | "arr"
      | "extraVehicles"
      | "wildFields"
    >
  >
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targets).set(data).where(eq(targets.id, id));
  return { id };
}

export async function getTargetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [result] = await db
    .select()
    .from(targets)
    .where(eq(targets.id, id))
    .limit(1);
  return result;
}

// ─── Target Duplicate Detection & Field-Level Merge ────────────────────────
// Reuses the same deterministic (non-AI) name-similarity heuristic already
// used for Intelligence entity dedup (see entityDedup.ts) — the Target
// Registry has its own separate flow because a target is a structured
// record with several fields, not a single label string, so a match needs
// to resolve field-by-field (see mergeTargetFieldDetails) rather than just
// picking a winner label.

export type TargetFieldName =
  | "name"
  | "tgt"
  | "hbf"
  | "hb"
  | "v1f"
  | "v1"
  | "dep"
  | "arr";

/** Fuzzy-checks a candidate target name against every existing live target's name. Best match first, or null if nothing close enough. */
export async function findPossibleDuplicateTarget(
  name: string,
  excludeId?: number
): Promise<{ id: number; name: string; score: number; reason: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: targets.id, name: targets.name })
    .from(targets)
    .where(isNull(targets.deletedAt));
  const candidates: DedupCandidateEntity[] = rows
    .filter(r => r.id !== excludeId)
    .map(r => ({
      key: String(r.id),
      label: r.name,
      type: "person" as DedupType,
      rowCount: 0,
    }));
  const matches = findPossibleDuplicates(name, "person", "__new__", candidates);
  if (matches.length === 0) return null;
  const best = matches[0];
  return {
    id: Number(best.key),
    name: best.label,
    score: best.score,
    reason: best.reason,
  };
}

/** All recorded "previous" values for a target, most recently superseded first. */
export async function getTargetFieldHistory(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(targetFieldHistory)
    .where(eq(targetFieldHistory.targetId, targetId))
    .orderBy(desc(targetFieldHistory.supersededAt));
}

/**
 * Applies officer-resolved field choices when a new-target entry turned out
 * to match an existing target. For each resolved field, `value` becomes the
 * target's new live value; if `discarded` is also present (a real new-vs-
 * existing conflict, not just filling in a previously-blank field), that
 * losing value is preserved as history rather than dropped — nothing is
 * ever silently overwritten or lost.
 */
export async function mergeTargetFieldDetails(
  targetId: number,
  resolutions: { field: TargetFieldName; value: string; discarded?: string }[],
  appendExtraVehicles: { full: string; short: string }[],
  appendWildFields: { label: string; value: string }[],
  byCIN: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const current = await getTargetById(targetId);
  if (!current) throw new Error("Target not found");

  const now = Date.now();
  const patch: Partial<InsertTarget> = {};
  const historyRows: InsertTargetFieldHistory[] = [];
  for (const r of resolutions) {
    patch[r.field] = r.value;
    if (
      r.discarded &&
      r.discarded.trim() &&
      r.discarded.trim() !== r.value.trim()
    ) {
      historyRows.push({
        targetId,
        fieldName: r.field,
        previousValue: r.discarded,
        supersededAt: now,
        supersededByCIN: byCIN,
      });
    }
  }

  // Extra vehicles / wild fields are purely additive (dynamic lists, not a
  // single value to conflict over) — append anything not already present.
  if (appendExtraVehicles.length > 0) {
    let existing: { full: string; short: string }[] = [];
    try {
      existing = current.extraVehicles ? JSON.parse(current.extraVehicles) : [];
    } catch {
      existing = [];
    }
    const existingKeys = new Set(
      existing.map(v => `${v.full.trim()}|${v.short.trim()}`.toLowerCase())
    );
    const toAdd = appendExtraVehicles.filter(
      v =>
        (v.full.trim() || v.short.trim()) &&
        !existingKeys.has(`${v.full.trim()}|${v.short.trim()}`.toLowerCase())
    );
    if (toAdd.length > 0)
      patch.extraVehicles = JSON.stringify([...existing, ...toAdd]);
  }
  if (appendWildFields.length > 0) {
    let existing: { label: string; value: string }[] = [];
    try {
      existing = current.wildFields ? JSON.parse(current.wildFields) : [];
    } catch {
      existing = [];
    }
    const existingKeys = new Set(
      existing.map(w => `${w.label.trim()}|${w.value.trim()}`.toLowerCase())
    );
    const toAdd = appendWildFields.filter(
      w =>
        w.value.trim() &&
        !existingKeys.has(`${w.label.trim()}|${w.value.trim()}`.toLowerCase())
    );
    if (toAdd.length > 0)
      patch.wildFields = JSON.stringify([...existing, ...toAdd]);
  }

  if (Object.keys(patch).length > 0) {
    await db.update(targets).set(patch).where(eq(targets.id, targetId));
  }
  if (historyRows.length > 0) {
    await db.insert(targetFieldHistory).values(historyRows);
  }
  return getTargetById(targetId);
}

export async function softDeleteTarget(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(targets)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(targets.id, id));
}

export async function deleteTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Clear any running sheets that reference this target before deleting
  await db
    .update(runningSheets)
    .set({ targetId: null })
    .where(eq(runningSheets.targetId, id));
  // Remove all operation links for this target
  await db
    .delete(operationTargetLinks)
    .where(eq(operationTargetLinks.targetId, id));
  await db.delete(targets).where(eq(targets.id, id));
}

export async function setSheetTarget(sheetId: number, targetId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (targetId !== null) {
    // Verify the target belongs to the same operation as the sheet
    const [sheet] = await db
      .select({ operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(eq(runningSheets.id, sheetId))
      .limit(1);
    if (!sheet) throw new Error("Sheet not found");
    const [target] = await db
      .select({ operationId: targets.operationId })
      .from(targets)
      .where(eq(targets.id, targetId))
      .limit(1);
    if (!target) throw new Error("Target not found");
    // Target Registry: targets are no longer operation-scoped, allow any target on any sheet
  }
  await db
    .update(runningSheets)
    .set({ targetId })
    .where(eq(runningSheets.id, sheetId));
}

// ─── Target Registry ────────────────────────────────────────────────────────

/** Return all targets in the global registry, with their linked operations */
export async function getAllTargetsForRegistry() {
  const db = await getDb();
  if (!db) return [];
  const allTargets = await db
    .select()
    .from(targets)
    .where(isNull(targets.deletedAt))
    .orderBy(targets.name);
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id));

  const linkMap = new Map<
    number,
    Array<{ operationId: number; operationName: string | null }>
  >();
  for (const l of links) {
    if (!linkMap.has(l.targetId)) linkMap.set(l.targetId, []);
    linkMap
      .get(l.targetId)!
      .push({ operationId: l.operationId, operationName: l.operationName });
  }

  return allTargets.map(t => ({
    ...t,
    linkedOperations: linkMap.get(t.id) ?? [],
  }));
}

/** Create a target in the global registry (no operationId required) */
export async function createRegistryTarget(
  data: Omit<InsertTarget, "operationId"> & { operationId?: number | null }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db
    .insert(targets)
    .values({ ...data, operationId: data.operationId ?? null });
  return { id: (result as any).insertId as number };
}

/** Link a target to an operation (idempotent) */
export async function linkTargetToOperation(
  targetId: number,
  operationId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db
    .select({ id: operationTargetLinks.id })
    .from(operationTargetLinks)
    .where(
      and(
        eq(operationTargetLinks.targetId, targetId),
        eq(operationTargetLinks.operationId, operationId)
      )
    )
    .limit(1);
  if (!existing) {
    await db.insert(operationTargetLinks).values({ targetId, operationId });
  }
}

/**
 * Ensure a target is fully linked to both a sheet and its parent operation.
 * Idempotent — safe to call from any entry point.
 *  1. Sets sheet.targetId if not already pointing to this target
 *  2. Creates operationTargetLinks row if missing
 */
export async function ensureTargetFullyLinked(
  targetId: number,
  sheetId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [sheet] = await db
    .select({
      operationId: runningSheets.operationId,
      currentTargetId: runningSheets.targetId,
    })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet) throw new Error("Sheet not found");
  // 1. Link sheet → target
  if (sheet.currentTargetId !== targetId) {
    await db
      .update(runningSheets)
      .set({ targetId })
      .where(eq(runningSheets.id, sheetId));
  }
  // 2. Link target → operation (idempotent)
  await linkTargetToOperation(targetId, sheet.operationId);
}

/** Unlink a target from an operation */
export async function unlinkTargetFromOperation(
  targetId: number,
  operationId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(operationTargetLinks)
    .where(
      and(
        eq(operationTargetLinks.targetId, targetId),
        eq(operationTargetLinks.operationId, operationId)
      )
    );
}

/** Get all operations linked to a target */
export async function getLinkedOperationsForTarget(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(eq(operationTargetLinks.targetId, targetId));
}

// ─── Shortcuts ───────────────────────────────────────────────────────────────

export async function listShortcuts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shortcuts).orderBy(shortcuts.trigger);
}

export async function createShortcut(
  data: Omit<InsertShortcut, "id" | "createdAt" | "updatedAt">
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(shortcuts).values(data);
}

export async function updateShortcut(
  id: number,
  data: { trigger?: string; expansion?: string; showInRs?: boolean }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(shortcuts).set(data).where(eq(shortcuts.id, id));
}

export async function deleteShortcut(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(shortcuts).where(eq(shortcuts.id, id));
}

/** Seed the default shortcuts if the table is empty. Called at server startup. */
export async function seedShortcutsIfEmpty(systemUserId: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: shortcuts.id })
    .from(shortcuts)
    .limit(1);
  if (existing.length > 0) return;
  const defaults = [
    { trigger: "sc", expansion: "Surveillance commenced in the vicinity of" },
    { trigger: "rack", expansion: "Surveillance ceased in the vicinity of" },
    { trigger: "oos", expansion: "Out of sight" },
    { trigger: "coos", expansion: "Continued out of sight" },
    { trigger: "pt", expansion: "PHOTOGRAPH/S TAKEN" },
  ];
  for (const s of defaults) {
    await db
      .insert(shortcuts)
      .values({ ...s, createdBy: systemUserId })
      .catch(() => {
        /* ignore duplicate */
      });
  }
}

/**
 * Ensure specific default shortcuts exist — inserts each if its trigger is not already present.
 * Safe to call on every startup even when the table already has rows.
 */
export async function ensureDefaultShortcuts(systemUserId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Shortcuts] DB unavailable, skipping ensureDefaultShortcuts");
    return;
  }
  const required = [
    { trigger: "sc", expansion: "Surveillance commenced in the vicinity of" },
    { trigger: "rack", expansion: "Surveillance ceased in the vicinity of" },
    { trigger: "oos", expansion: "Out of sight" },
    { trigger: "coos", expansion: "Continued out of sight" },
    { trigger: "pt", expansion: "PHOTOGRAPH/S TAKEN" },
    { trigger: "dso", expansion: "driver and sole occupant" },
    { trigger: "d", expansion: "departed and" },
    { trigger: "ar", expansion: "arrived and" },
  ];
  const existing = await db
    .select({ trigger: shortcuts.trigger })
    .from(shortcuts);
  const existingTriggers = new Set(existing.map(s => s.trigger.toLowerCase()));
  for (const s of required) {
    if (!existingTriggers.has(s.trigger.toLowerCase())) {
      try {
        await db.insert(shortcuts).values({ ...s, createdBy: systemUserId });
        console.log(`[Shortcuts] Inserted default shortcut: ${s.trigger}`);
      } catch (err) {
        console.error(
          `[Shortcuts] Failed to insert shortcut '${s.trigger}':`,
          err
        );
      }
    }
  }
  console.log(
    `[Shortcuts] ensureDefaultShortcuts complete. Existing: [${Array.from(existingTriggers).join(", ")}]`
  );
}

// ─── Deep Search ─────────────────────────────────────────────────────────────
// Returns operations that match the query across: operation fields, sheet titles,
// sheet CINs (JSON text), target fields, and observation row text.
// Each matched operation includes a list of match contexts for display.

export type DeepSearchMatch = {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  matchContexts: string[];
  operationStatus: "active" | "before_court" | "archive";
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
      or(
        like(sql`LOWER(${operations.name})`, q),
        like(sql`LOWER(COALESCE(${operations.promisNumber}, ''))`, q),
        like(sql`LOWER(COALESCE(${operations.imsNumber}, ''))`, q),
        like(sql`LOWER(COALESCE(${operations.investigationUnit}, ''))`, q)
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
      sheetId: sheetRows.sheetId,
      observation: sheetRows.observation,
      time: sheetRows.time,
    })
    .from(sheetRows)
    .where(like(sql`LOWER(COALESCE(${sheetRows.observation}, ''))`, q));

  // 5. Row members (CIN in row) that match
  const memberMatches = await db
    .select({ rowId: rowMembers.rowId, memberName: rowMembers.memberName })
    .from(rowMembers)
    .where(like(sql`LOWER(${rowMembers.memberName})`, q));

  // Resolve sheetId → operationId for row/member matches
  const rowSheetIds = Array.from(new Set(rowMatches.map(r => r.sheetId)));
  const memberRowIds = Array.from(new Set(memberMatches.map(m => m.rowId)));
  let memberSheetIds: number[] = [];
  const memberRowToSheetMap: Record<number, number> = {}; // rowId -> sheetId
  if (memberRowIds.length > 0) {
    const memberRows = await db
      .select({ id: sheetRows.id, sheetId: sheetRows.sheetId })
      .from(sheetRows)
      .where(inArray(sheetRows.id, memberRowIds));
    memberRows.forEach(r => {
      memberRowToSheetMap[r.id] = r.sheetId;
    });
    memberSheetIds = Array.from(new Set(memberRows.map(r => r.sheetId)));
  }
  const allSheetIds = Array.from(new Set([...rowSheetIds, ...memberSheetIds]));
  let sheetOpMap: Record<number, number> = {};
  if (allSheetIds.length > 0) {
    const sheetRows2 = await db
      .select({ id: runningSheets.id, operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(inArray(runningSheets.id, allSheetIds));
    sheetRows2.forEach(s => {
      sheetOpMap[s.id] = s.operationId;
    });
  }

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

  rowMatches.forEach(r => {
    const opId = sheetOpMap[r.sheetId];
    if (!opId) return;
    ensure(opId);
    const snippet = (r.observation ?? "").slice(0, 60);
    matchMap
      .get(opId)!
      .add(`Observation: "${snippet}${snippet.length === 60 ? "…" : ""}"`);
  });

  memberMatches.forEach(m => {
    const sheetId = memberRowToSheetMap[m.rowId];
    if (!sheetId) return;
    const opId = sheetOpMap[sheetId];
    if (!opId) return;
    ensure(opId);
    matchMap.get(opId)!.add(`CIN: ${m.memberName}`);
  });

  // Fetch full operation records for all matched ids
  const matchedIds = Array.from(matchMap.keys());
  if (matchedIds.length === 0) return [];

  const matchedOps = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, matchedIds));

  return matchedOps.map(op => ({
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
  }));
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

/**
 * Extract bracketed entities from a single observation string.
 * Pattern: any text followed by (ShortForm) — the short form is the entity identifier.
 * We classify by heuristics on the preceding context words.
 */
export function extractEntitiesFromText(text: string): Array<{
  shortForm: string;
  rawShortForm: string;
  fullDescription: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  confidence: "high" | "medium" | "low";
}> {
  const results: Array<{
    shortForm: string;
    rawShortForm: string; // the exact bracketed token before name-recovery
    fullDescription: string;
    type: "person" | "vehicle" | "address" | "business" | "unknown";
    confidence: "high" | "medium" | "low";
  }> = [];

  // Match: some preceding text (fullDescription) immediately followed by (ShortForm)
  const pattern = /([^()]{3,120}?)\s*\(([^()]{1,80})\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const fullDescription = match[1].trim();
    const shortForm = match[2].trim();

    // Skip empty or very short short-forms
    if (shortForm.length < 2) continue;
    // Skip if shortForm looks like a time (e.g. "08:00")
    if (/^\d{1,2}:\d{2}$/.test(shortForm)) continue;
    // Skip UM references (e.g. "UM1", "UM2", "UM12") — unidentified males/persons
    // that are not recorded in the intelligence folder by design.
    if (/^UM\d+$/i.test(shortForm)) continue;

    const lowerFull = fullDescription.toLowerCase();
    const lowerShort = shortForm.toLowerCase();
    // Vehicle-keyword detection is scoped to just the clause immediately
    // before the bracket (last comma/semicolon-separated segment), not the
    // whole preceding sentence. Running sheet rows routinely describe several
    // entities in one sentence — e.g. "Vehicle 1GDA876, EWEN driver, Jason
    // SMITH (SMITH), departed..." — and without this scoping, the vehicle
    // keyword from an earlier, unrelated clause leaks into the classification
    // of a person's bracketed name later in the same sentence.
    const lastClause = (
      fullDescription.split(/[,;]/).pop() ?? fullDescription
    ).trim();
    const lowerLastClause = lastClause.toLowerCase();

    let type: "person" | "vehicle" | "address" | "business" | "unknown" =
      "unknown";

    // ── Address-format detection (highest priority) ──────────────────────────
    // If the full description (before the parenthesis) contains a street address
    // pattern — e.g. "1200 Leach Highway, MYAREE" — classify as address regardless
    // of whether the word "vehicle" appears elsewhere in the sentence.
    // Also classify airport terminals, train stations, bus stops, ports, and
    // numbered terminals (e.g. "Terminal 2", "Gate 3", "Platform 5") as addresses.
    // Also handles cnr/corner-of addresses and lot numbers.
    const STREET_TYPES =
      /\b(st|street|rd|road|ave|avenue|dr|drive|way|ct|court|pl|place|cl|close|cres|crescent|blvd|boulevard|hwy|highway|fwy|freeway|ln|lane|tce|terrace|pde|parade|cct|circuit|gr|grove|rise|loop|link|walk|track|row|mews|quay|esplanade|promenade)\b/i;
    const addressInFull =
      /\b\d{1,5}[A-Za-z]?\s+\w[\w\s]*(street|road|ave|avenue|drive|way|court|place|close|crescent|boulevard|highway|freeway|lane|terrace|parade|circuit)\b/i.test(
        fullDescription
      ) ||
      STREET_TYPES.test(shortForm) ||
      /^\d{1,5}\s/.test(shortForm) ||
      // cnr / corner of addresses: "cnr Smith St and Jones Ave"
      /^(cnr|corner of|corner)\b/i.test(shortForm) ||
      /^(cnr|corner of|corner)\b/i.test(fullDescription) ||
      // Lot numbers: "Lot 42 Smith Road"
      /^lot\s+\d+/i.test(shortForm) ||
      // Google Maps formatted addresses: "131 Lakey St, Southern River WA 6110, Australia"
      // Pattern: number + street name + suburb + STATE + postcode (+ optional ", Australia")
      /\b\d{1,5}[A-Za-z]?\/\d{1,5}\s/.test(shortForm) || // unit/number e.g. "3/12 Smith St"
      /\b\d{1,5}[A-Za-z]?\/\d{1,5}\s/.test(fullDescription) ||
      /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
        shortForm
      ) ||
      /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
        fullDescription
      ) ||
      /,\s*Australia\s*$/.test(shortForm) ||
      /,\s*Australia\s*$/.test(fullDescription) ||
      // Airport terminals, train stations, bus stops, ports, gates, platforms
      /\b(terminal|gate|platform|pier|bay|berth|concourse|departure|arrival|lounge)\s+\d/i.test(
        shortForm
      ) ||
      /\b(airport|station|terminus|port|wharf|depot|interchange|shopping centre|shopping center|shopping mall|mall|plaza|precinct)\b/i.test(
        shortForm
      ) ||
      /\b(airport|station|terminus|port|wharf|depot|interchange)\b/i.test(
        fullDescription
      );

    // ── WA vehicle registration patterns ─────────────────────────────────────
    // WA standard: 1ABC234 (digit + 3 letters + 3 digits) or older ABC-123 / ABC 123
    // Also: 1AB 234, personalised plates (letters only up to 6 chars)
    const WA_REGO =
      /^\d[A-Z]{2,3}\d{3}$|^[A-Z]{1,3}[-\s]?\d{3}$|^[A-Z0-9]{2,7}$/.test(
        shortForm.replace(/\s/g, "").toUpperCase()
      );
    // Broader vehicle make/model keywords
    const VEHICLE_MAKES =
      /\b(toyota|ford|holden|honda|mazda|nissan|mitsubishi|subaru|hyundai|kia|volkswagen|vw|bmw|mercedes|audi|lexus|volvo|jeep|dodge|chevrolet|chevy|ram|gmc|chrysler|fiat|alfa|peugeot|renault|citroen|skoda|seat|suzuki|isuzu|daihatsu|ssangyong|great wall|gwm|haval|mg|byd|tesla|rivian|land rover|range rover|defender|discovery|jaguar|porsche|ferrari|lamborghini|maserati|bentley|rolls royce|aston martin|mclaren|lotus|mini|smart|dacia|lancia|opel|vauxhall|saab|pontiac|buick|cadillac|lincoln|infiniti|acura|genesis|lucid|polestar|scout|rivian)\b/i;
    const VEHICLE_BODY =
      /\b(vehicle|car|truck|van|ute|sedan|hatchback|suv|wagon|coupe|convertible|roadster|pickup|4wd|4x4|cab|dual cab|single cab|tray|flatbed|panel van|people mover|minivan|bus|minibus|motorcycle|motorbike|bike|scooter|quad|atv|boat|trailer|caravan|motorhome|rv|bearing|registration|rego|reg|plate|plated)\b/i;
    // A shortForm that looks like an all-caps person name (letters/spaces/
    // hyphens/apostrophes only, no digits) should never be classified as a
    // vehicle just because "vehicle" or a make appears somewhere in the same
    // clause — see the guard on the VEHICLE_BODY/MAKES branch below.
    const shortFormLooksLikeName =
      /^[A-Z][A-Z\s'-]{1,40}$/.test(shortForm) && !/\d/.test(shortForm);

    // ── Confidence scoring ────────────────────────────────────────────────────
    let confidence: "high" | "medium" | "low" = "low";

    if (addressInFull) {
      type = "address";
      // High confidence if has number + street type or state/postcode; medium for cnr/lot/airport
      if (
        /\b\d{1,5}[A-Za-z]?\s+\w/.test(shortForm) &&
        STREET_TYPES.test(shortForm)
      )
        confidence = "high";
      else if (
        /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
          shortForm
        )
      )
        confidence = "high";
      else confidence = "medium";
    }
    // Vehicle: the clause immediately before the bracket mentions vehicle
    // keywords OR shortForm matches rego/make. BUT only when the full
    // description does NOT look like an address, AND the shortForm itself
    // doesn't look like an all-caps person name (e.g. "Exited the vehicle
    // and met with Keanu REEVES (REEVES)" — no comma separates "vehicle"
    // from the name that follows it in the same clause, so without this
    // guard the leftover word "vehicle" wrongly classifies REEVES as a
    // vehicle. Same exclusion the WA_REGO branch below already applies.
    else if (
      !shortFormLooksLikeName &&
      (VEHICLE_BODY.test(lowerLastClause) ||
        VEHICLE_MAKES.test(lowerLastClause) ||
        VEHICLE_MAKES.test(lowerShort))
    ) {
      type = "vehicle";
      if (
        VEHICLE_BODY.test(lowerLastClause) &&
        (VEHICLE_MAKES.test(lowerLastClause) || VEHICLE_MAKES.test(lowerShort))
      )
        confidence = "high";
      else confidence = "medium";
    }
    // WA rego plate in shortForm — strong vehicle signal
    else if (WA_REGO && !/^[A-Z]{4,}$/.test(shortForm)) {
      // Only treat as rego if it doesn't look like an all-caps name (4+ letters)
      type = "vehicle";
      confidence = "medium";
    }
    // Person: shortForm is all-caps word(s) with no digits, no street number pattern
    else if (
      /^[A-Z][A-Z\s'-]{1,40}$/.test(shortForm) &&
      !/\d/.test(shortForm) &&
      !STREET_TYPES.test(shortForm)
    ) {
      type = "person";
      // High confidence if shortForm is 2 words (first + surname) or matches name-recovery
      const wordCount = shortForm.trim().split(/\s+/).length;
      confidence = wordCount >= 2 ? "high" : "medium";
    }
    // Address: shortForm starts with a number or contains street type
    else if (/^\d/.test(shortForm) || STREET_TYPES.test(shortForm)) {
      type = "address";
      confidence = "medium";
    }
    // Business: shortForm contains a proper noun (mixed case or known business words)
    else if (
      /[A-Z][a-z]/.test(shortForm) ||
      /\b(hotel|motel|cafe|restaurant|shop|store|centre|center|gym|club|bar|pub|servo|service station|petrol|chemist|pharmacy|hospital|clinic|school|college|university|church|mosque|temple|park|reserve|oval|stadium|arena|theatre|cinema|library|museum|gallery|council|police|fire|ambulance|court|prison|jail|detention)\b/i.test(
        lowerShort
      )
    ) {
      type = "business";
      confidence =
        /\b(hotel|motel|cafe|restaurant|shop|store|centre|center|gym|club|bar|pub|servo|service station|petrol|chemist|pharmacy|hospital|clinic|school|college|university|church|mosque|temple|park|reserve|oval|stadium|arena|theatre|cinema|library|museum|gallery|council|police|fire|ambulance|court|prison|jail|detention)\b/i.test(
          lowerShort
        )
          ? "high"
          : "medium";
    } else {
      // unknown — low confidence
      confidence = "low";
    }

    // For person entities: prefer the full name (fullDescription) over the bracketed
    // shortForm. E.g. "Jason JOHNSON (JOHNSON)" → use "Jason JOHNSON", not "JOHNSON".
    // Only apply when fullDescription looks like a name: 2–5 words, letters/spaces/hyphens/apostrophes only,
    // and the shortForm is a suffix/subset of the fullDescription.
    //
    // For address entities: recover the properly-formatted address from fullDescription.
    // The bracket short form is always ALL-CAPS abbreviated (e.g. "4 GLYDE ST") which is
    // correct for geocoding but wrong for display. We extract the address from the text
    // before the bracket and format it as "4 Glyde Street, EAST FREMANTLE".
    let displayName = shortForm;
    if (type === "address") {
      // Try to extract a properly-formatted address from fullDescription.
      // fullDescription is the text immediately before the bracket, e.g.:
      //   "...arrived at 4 Glyde St, East Fremantle WA"
      //   "Vehicle 1FAB007, REID driver and sole occupant, arrived at 146 Marine Parade, Cottesloe WA"
      // Strategy: find the last occurrence of a street-number pattern in fullDescription
      // and take everything from there to the end as the address.
      const AU_STATES_ADDR = /\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/;

      // Title-case a word in a street name context:
      //  - State codes (WA, NSW, etc.) stay ALL-CAPS
      //  - Street type abbreviations (St, Rd, Ave, etc.) become Title Case
      //  - All other words become Title Case
      const titleCaseStreetWord = (w: string): string => {
        if (/^\d+$/.test(w)) return w; // digits unchanged
        // Unit-letter-suffixed street numbers (e.g. "61a" → "61A") keep the
        // digits and uppercase the trailing letter.
        if (/^\d+[A-Za-z]$/.test(w))
          return w.slice(0, -1) + w.slice(-1).toUpperCase();
        if (/^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i.test(w)) return w.toUpperCase(); // state codes
        // Street type abbreviations → Title Case (e.g. ST→St, RD→Rd, AVE→Ave)
        if (
          /^(ST|RD|AVE|DR|CT|PL|CL|CRES|BLVD|HWY|FWY|LN|TCE|PDE|CCT|GR|CNR|WY|LOOP|RISE|RIDGE|GROVE|MEWS|CLOSE|PLACE|COURT|LANE|TERRACE|PARADE|CIRCUIT|GREEN|CORNER)$/i.test(
            w
          )
        ) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      };

      // Find the last address-like segment in fullDescription.
      // Supports standard addresses AND intersections (e.g. "Kent St & Queens Park Rd, Wilson WA").
      // Two patterns tried in order:
      //  1. Standard: starts with a street number or cnr/corner prefix
      //  2. Intersection: "Street Type & Street Type, Suburb STATE"
      const STREET_TYPES_RE =
        "(?:St|Rd|Ave|Dr|Hwy|Fwy|Tce|Pde|Cct|Gr|Ln|Pl|Ct|Cl|Cres|Blvd|Way|Loop|Rise|Mews|Close|Place|Court|Lane|Terrace|Parade|Circuit|Green|Corner)";
      // The street-number prefix must be preceded by a word boundary (start of string,
      // space, comma, or punctuation) to prevent partial rego digits (e.g. "905" from
      // "1HTU905") from being mistaken for a street number.
      const standardAddrRe =
        /(?:^|(?<=[\s,;]))((?:cnr\s+of\s+|cnr\s+|corner\s+of\s+|lot\s+\d+\s+|\d{1,5}[A-Za-z]?\/\d{1,5}\s+|\d{1,5}[A-Za-z]?\s+)[A-Za-z][\w\s&]*(?:,\s*[A-Za-z][\w\s]+)?(?:\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))?(?:\s+\d{4})?(?:,\s*Australia)?)$/i;
      const intersectionAddrRe = new RegExp(
        `[A-Za-z][\\w\\s]+\\s+${STREET_TYPES_RE}\\s*&\\s*[A-Za-z][\\w\\s]+\\s+${STREET_TYPES_RE}(?:,\\s*[A-Za-z][\\w\\s]+)?(?:\\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))?(?:\\s+\\d{4})?(?:,\\s*Australia)?$`,
        "i"
      );
      const standardMatch = fullDescription.match(standardAddrRe);
      const addrMatch =
        (standardMatch ? [standardMatch[1] ?? standardMatch[0]] : null) ||
        fullDescription.match(intersectionAddrRe);
      if (addrMatch) {
        let addrText = addrMatch[0].trim();
        // Strip postcode and ", Australia"
        addrText = addrText.replace(/,?\s*Australia\s*$/i, "").trim();
        addrText = addrText.replace(/\s+\d{4}\s*$/, "").trim();
        // Split into parts: street part(s) and suburb+state part
        const commaParts = addrText.split(",");
        if (commaParts.length >= 2) {
          const lastPart = commaParts[commaParts.length - 1].trim();
          const stateMatch = lastPart.match(
            /^(.+?)\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i
          );
          if (stateMatch) {
            // Title-case the street part(s), CAPS the suburb
            const streetParts = commaParts
              .slice(0, -1)
              .map(p => p.trim().replace(/\b(\w+)/g, titleCaseStreetWord));
            const suburb = stateMatch[1].trim().toUpperCase();
            displayName = [...streetParts, " " + suburb].join(",");
          } else if (AU_STATES_ADDR.test(lastPart)) {
            // Last part is just a state — drop it
            const streetParts = commaParts
              .slice(0, -1)
              .map(p => p.trim().replace(/\b(\w+)/g, titleCaseStreetWord));
            displayName = streetParts.join(",").trim();
          } else {
            // No state found — just title-case the whole thing
            displayName = addrText.replace(/\b(\w+)/g, titleCaseStreetWord);
          }
        } else {
          // Single part (no comma) — title-case it
          displayName = addrText.replace(/\b(\w+)/g, titleCaseStreetWord);
        }
      } else {
        // Fallback: title-case the shortForm itself (it's all-caps abbreviated)
        // e.g. "4 GLYDE ST" → "4 Glyde St"
        displayName = shortForm.replace(/\b(\w+)/g, titleCaseStreetWord);
      }

      // Business location recovery: for business addresses the bracket short
      // form is the business name itself (e.g. "Bicton Tavern, 1 Point Walter
      // Road, BICTON WA (Bicton Tavern)"), not a street code, so the regex
      // above only recovers the street+suburb portion. Narrative text before
      // the address (e.g. "IOs observed the subject enter Bicton Tavern, ...")
      // has no reliable delimiter marking where the business name starts, so
      // rather than trying to parse it out, check whether the text
      // immediately before the recovered address — after stripping the
      // separating comma — ends with the (already known) shortForm at a word
      // boundary. If so, restore it as a prefix so the Intelligence display
      // reads "Bicton Tavern, 1 Point Walter Road, BICTON" instead of
      // dropping the business name.
      const addrStartIdx = fullDescription.lastIndexOf(
        addrMatch ? addrMatch[0] : ""
      );
      if (addrStartIdx > 0) {
        const beforeAddr = fullDescription
          .slice(0, addrStartIdx)
          .replace(/,\s*$/, "");
        if (beforeAddr.toLowerCase().endsWith(shortForm.toLowerCase())) {
          const nameStart = beforeAddr.length - shortForm.length;
          const boundaryOk =
            nameStart === 0 || /\s/.test(beforeAddr[nameStart - 1]);
          if (boundaryOk) {
            const matchedName = beforeAddr.slice(nameStart);
            displayName = `${matchedName}, ${displayName.trim()}`;
          }
        }
      }
    } else if (type === "vehicle") {
      // For vehicle entities: build a clean display name as "REGO colour make/model".
      // The shortForm is typically "Vehicle REGO" (e.g. "Vehicle 1FBP509") or just the rego.
      // The fullDescription is the text immediately before the bracket, e.g.:
      //   "A white Toyota Landcruiser, bearing WA registration 1FBP509"
      //   "black Subaru WRX, bearing WA registration 1FDD444"
      //   "1HTU905" (bare rego, no description)
      //
      // Strategy:
      //   1. Extract the raw rego from shortForm (strip "Vehicle " prefix if present)
      //   2. Find colour + make/model words in fullDescription that precede the rego mention
      //   3. Build display as "REGO colour make/model" (e.g. "1FBP509 white Toyota Landcruiser")

      // Step 1: extract raw rego
      const rawRego = shortForm.replace(/^vehicle\s+/i, "").trim();

      // Step 2: scan fullDescription for vehicle description words before the rego
      // Look for colour + make/model in the text
      const COLOURS =
        /\b(white|black|silver|grey|gray|red|blue|green|yellow|orange|purple|brown|gold|bronze|cream|beige|maroon|navy|dark|light|bright)\b/gi;
      const MAKES_DISPLAY =
        /\b(toyota|ford|holden|honda|mazda|nissan|mitsubishi|subaru|hyundai|kia|volkswagen|vw|bmw|mercedes|audi|lexus|volvo|jeep|dodge|land rover|range rover|defender|discovery|jaguar|porsche|mini|isuzu|suzuki|daihatsu|haval|gwm|mg|byd|tesla|great wall)\b/gi;
      const BODY_TYPES =
        /\b(landcruiser|land cruiser|hilux|ranger|triton|navara|amarok|colorado|dmax|d-max|fortuner|prado|patrol|pathfinder|rav4|crv|cr-v|cx-5|cx5|cx-3|cx3|tucson|santa fe|santafe|sportage|tiguan|forester|outback|wrx|impreza|levorg|liberty|brz|86|corolla|camry|yaris|kluger|tarago|hiace|hilux|falcon|commodore|cruze|captiva|trax|trailblazer|everest|territory|escape|focus|fiesta|mondeo|transit|connect|courier|f-150|f150|mustang|explorer|expedition|bronco|wrangler|cherokee|grand cherokee|compass|renegade|gladiator|durango|charger|challenger|ram|1500|2500|3500|sedan|hatchback|suv|wagon|coupe|ute|van|truck|4wd|4x4|bus|minivan|people mover)\b/gi;

      // Find the portion of fullDescription that describes the vehicle
      // (everything before any mention of the rego or "bearing"/"registration" keywords)
      const regoIdx = fullDescription
        .toUpperCase()
        .indexOf(rawRego.toUpperCase());
      const descSource =
        regoIdx > 0 ? fullDescription.slice(0, regoIdx) : fullDescription;

      const colourMatches = Array.from(descSource.matchAll(COLOURS)).map(m =>
        m[0].toLowerCase()
      );
      const makeMatches = Array.from(descSource.matchAll(MAKES_DISPLAY)).map(
        m => m[0]
      );
      const bodyMatches = Array.from(descSource.matchAll(BODY_TYPES)).map(
        m => m[0]
      );

      // Build description: colour + make + body (deduplicated, max 3 words)
      const descParts: string[] = [];
      if (colourMatches.length > 0)
        descParts.push(colourMatches[colourMatches.length - 1]);
      if (makeMatches.length > 0)
        descParts.push(makeMatches[makeMatches.length - 1]);
      if (bodyMatches.length > 0) {
        const lastBody = bodyMatches[bodyMatches.length - 1];
        // Don't duplicate if body type is same as make (e.g. "Toyota Toyota")
        if (!descParts.some(p => p.toLowerCase() === lastBody.toLowerCase())) {
          descParts.push(lastBody);
        }
      }

      if (rawRego && rawRego !== shortForm) {
        // Had "Vehicle REGO" format — use rego + description
        displayName =
          descParts.length > 0 ? `${rawRego} ${descParts.join(" ")}` : rawRego;
      } else if (descParts.length > 0) {
        // shortForm is already just the rego
        displayName = `${rawRego} ${descParts.join(" ")}`;
      }
      // else: keep displayName = shortForm (bare rego, no description available)
    } else if (type === "person") {
      // Extract the last 2-4 words immediately before the bracket — these are most
      // likely to be the full name. E.g. "Observed Jason JOHNSON (JOHNSON)" →
      // fullDescription = "Observed Jason JOHNSON", last 2 words = "Jason JOHNSON".
      // Words that are NOT part of a person's name (verbs, prepositions, articles, etc.)
      const NON_NAME_WORDS = new Set([
        "with",
        "the",
        "a",
        "an",
        "and",
        "or",
        "at",
        "to",
        "from",
        "in",
        "on",
        "of",
        "front",
        "back",
        "side",
        "door",
        "gate",
        "exit",
        "entry",
        "via",
        "near",
        "by",
        "into",
        "out",
        "up",
        "down",
        "off",
        "over",
        "under",
        "through",
        "along",
        "exited",
        "entered",
        "walked",
        "ran",
        "drove",
        "observed",
        "seen",
        "met",
        "approached",
        "departed",
        "arrived",
        "left",
        "attended",
        "accompanied",
        "was",
        "were",
        "is",
        "are",
        "had",
        "has",
        "been",
        "being",
        "then",
        "also",
        "who",
        "whom",
        "which",
        "that",
        "this",
        "these",
        "those",
      ]);
      const words = fullDescription.trim().split(/\s+/);
      // Try last 4, 3, 2 words in order — use the longest that contains shortForm
      // AND where every word looks like a name word (not a common English word)
      let bestName = "";
      for (let take = Math.min(4, words.length); take >= 2; take--) {
        const candidate = words.slice(-take).join(" ");
        // Candidate must be all letters/spaces/hyphens/apostrophes (a name, not a sentence)
        const looksLikeName =
          /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'\-]{1,60}$/.test(candidate);
        // None of the candidate words should be a common non-name word
        const candidateWords = candidate.toLowerCase().split(/\s+/);
        const hasNonNameWord = candidateWords.some(w => NON_NAME_WORDS.has(w));
        // shortForm must be contained within the candidate (case-insensitive)
        const shortInCandidate = candidate
          .toUpperCase()
          .includes(shortForm.toUpperCase());
        if (looksLikeName && !hasNonNameWord && shortInCandidate) {
          bestName = candidate;
          break;
        }
      }
      if (bestName) displayName = bestName;
    }

    results.push({
      shortForm: displayName,
      rawShortForm: shortForm,
      fullDescription,
      type,
      confidence,
    });
  }

  return results;
}

export interface IntelligenceEntity {
  shortForm: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  /** True when this entity comes from a formal target card (not just observation text) */
  isTarget?: boolean;
  /** For target entities: the TGT code alias (e.g. "TANG") if set on the target card */
  tgtAlias?: string | null;
  /** For target entities: the numeric DB id of the target record */
  targetId?: number | null;
  /** True when at least one occurrence was extracted with low confidence (type=unknown or ambiguous pattern) */
  lowConfidence?: boolean;
  /** Labels of entities merged into this one via a confirmed duplicate decision. */
  aliasLabels?: string[];
  occurrences: Array<{
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    rowId: number;
    observationSnippet: string;
    timeMinutes: number | null;
    fullDescription: string;
  }>;
}

// Vehicles are uniquely identified by their registration, not by whatever
// descriptive text happens to surround it in a given mention. The same car
// can show up as "1ADF124" (bare), "Vehicle 1ADF124" (chip insert),
// "1ADF124 red Ford Territory" (built from observation text), or "silver
// Hyundai Santa Fe, bearing WA registration 1ICW519" (raw target-card V1F
// field) — all textually very different despite being the same physical
// vehicle, which previously produced separate duplicate entities. Extract
// the WA-plate-shaped token (if any) and key on that alone so every
// mention of the same vehicle collapses into one entity; the richest
// available description is still kept for display (see "prefer longer
// shortForm" below).
export function vehicleRegoKey(text: string): string {
  const m = text.match(/\b\d[A-Za-z]{2,3}\d{3}\b/);
  return (m ? m[0] : text).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Same "type::normalizedShortForm" key scheme getAllIntelligenceEntities uses internally. */
export function computeEntityKey(type: DedupType, shortForm: string): string {
  const norm =
    type === "vehicle"
      ? vehicleRegoKey(shortForm)
      : normalizeEntityLabel(shortForm);
  return `${type}::${norm}`;
}

export interface SheetEntityChip {
  key: string;
  type: "person" | "vehicle" | "address" | "business";
  /** The short bracket token as typed — surname / rego / short address — inserted when the chip is tapped. */
  insertValue: string;
  /** The fuller recovered name/description shown on the chip button itself. */
  display: string;
  occurrenceCount: number;
}

// Surfaces a quick-tap chip for every distinct person/vehicle/address/business
// mentioned in this sheet's observations so far, reusing the same
// "Full description (SHORT)" bracket convention extractEntitiesFromText
// already parses — e.g. "Jason JOHNSON (JOHNSON)" surfaces a JOHNSON chip,
// "white Toyota Landcruiser (1FBP509)" surfaces a 1FBP509 chip. Scoped to
// just this sheet's rows (not the whole operation/registry), computed on
// read rather than stored, so every officer viewing the sheet sees the same
// chips — not a per-device thing. Low-confidence extractions are excluded
// to keep the chip bar from filling with noise from ambiguous text.
//
// Anything already covered by the sheet's assigned target card (TGT/HB/
// V1/V2.../DEP/ARR/wild fields — the blue chips) is skipped, since those
// already have their own chip; these purple chips are for genuinely new
// information logged in this sheet, not a duplicate of the target card.
export async function getSheetEntityChips(
  sheetId: number
): Promise<SheetEntityChip[]> {
  const [rows, sheet] = await Promise.all([
    getRowsBySheetId(sheetId),
    getRunningSheetById(sheetId),
  ]);

  const targetKeys = new Set<string>();
  if (sheet?.targetId) {
    const t = await getTargetById(sheet.targetId);
    if (t) {
      const addKey = (type: DedupType, v?: string | null) => {
        if (v) targetKeys.add(computeEntityKey(type, v));
      };
      addKey("person", t.tgt);
      addKey("address", t.hb);
      addKey("address", t.dep);
      addKey("address", t.arr);
      addKey("vehicle", t.v1);
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(
          t.extraVehicles ?? "[]"
        );
        evs.forEach(ev => addKey("vehicle", ev.short));
      } catch {}
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(
          t.wildFields ?? "[]"
        );
        // A wild field's type isn't known ahead of time, so cover all three —
        // an accidental cross-type key collision on arbitrary text is negligible.
        wfs.forEach(wf => {
          addKey("person", wf.value);
          addKey("vehicle", wf.value);
          addKey("address", wf.value);
        });
      } catch {}
    }
  }

  const byKey = new Map<string, SheetEntityChip>();

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    for (const e of entities) {
      if (e.confidence === "low") continue;
      if (e.type === "unknown") continue;
      const key = computeEntityKey(e.type, e.rawShortForm);
      if (targetKeys.has(key)) continue;
      const existing = byKey.get(key);
      if (existing) {
        existing.occurrenceCount++;
        if (e.shortForm.length > existing.display.length)
          existing.display = e.shortForm;
      } else {
        byKey.set(key, {
          key,
          type: e.type,
          insertValue: e.rawShortForm,
          display: e.shortForm,
          occurrenceCount: 1,
        });
      }
    }
  }

  // Group by type — vehicles, then persons, then locations, then business —
  // preserving each entity's original generation order within its group
  // (Array.prototype.sort is a stable sort, so equal-type items keep their
  // relative Map-insertion order rather than being re-sorted by name/count).
  const TYPE_ORDER: Record<SheetEntityChip["type"], number> = {
    vehicle: 0,
    person: 1,
    address: 2,
    business: 3,
  };
  return Array.from(byKey.values())
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .slice(0, 24);
}

// ─── Intelligence Heat Map ──────────────────────────────────────────────────
// Aggregates address/business entities extracted from a scoped set of running
// sheet rows (one Operation, optionally one Target, and a time window) into
// per-location visit counts + coordinates for the Heat Map view.

/** Perth-anchored (+08:00, no DST) YYYY-MM-DD for "today". */
function perthTodayISO(): string {
  return toPerthDateISO(new Date());
}

/** YYYY-MM-DD (Perth-anchored) for a JS Date — used to fall back to the
 * running sheet's creation date when a row has no explicit rowDate. */
function toPerthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Add (or subtract) days to a YYYY-MM-DD string, Perth-anchored — same
 * anchoring approach as getRowsBySheetId's day-offset math above. */
function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A row only marks a genuine sighting of the target at a location if it
// actually narrates presence/activity there — arriving, departing, parking,
// being observed doing something. Officers phrase this many different ways
// ("travelled on X and parked in the vicinity of Y", "reversed from the
// driveway onto X and continued via:", "travelled through the car park and
// continued via:"), so this is deliberately a loose, wide keyword net —
// every verb stem wildcarded to catch arrive/arrived/arriving-style tense
// variants — rather than a small set of exact phrases. False positives (an
// address mentioned in a row that isn't really a visit) are a lesser
// evidentiary risk than false negatives (a real visit silently dropped from
// the count). "continued via" is included even though it reads as a
// departure, not an arrival — an address mentioned in the same row as
// "continued via" is the point they just left, i.e. still part of the same
// visit, not a new one.
const OBSERVATION_SIGNAL_RE =
  /\b(arriv\w*|depart\w*|left|enter\w*|exit\w*|park\w*|observ\w*|seen|saw|see|met|meet\w*|attend\w*|pull\w*\s+(?:into|up)|stopp?\w*|wait\w*|remain\w*|stationary|revers\w*\s+from\s+the\s+driveway|continu\w*\s+via|vicinity\s+of|driveway\s+of|driv(?:e|es|ing|ove)\s+(?:into|through)|travell?\w*\s+through)\b/i;

/** Rows that only mark surveillance team activity or a travelled-via street
 * list, not a sighting of the target — same classification the Court
 * Statement generator already uses (server/routers.ts statement.previewData)
 * to exclude these from CIN eligibility, reused here for the same reason:
 * they aren't real observations of the target at a location. */
function isNonObservationRow(
  observation: string,
  previousObservation: string | null
): boolean {
  const obs = observation.trim();
  if (/^surveillance commenced/i.test(obs) || /^surveillance ceased/i.test(obs))
    return true;
  const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
  if (
    endsInWhereat &&
    previousObservation &&
    /continued via[;:]/i.test(previousObservation)
  )
    return true;
  return false;
}

export type IntelligenceHeatMapWhen =
  | { mode: "sheet"; sheetId: number }
  | { mode: "last7" }
  | { mode: "last30" }
  | { mode: "custom"; startDate: string; endDate: string }; // YYYY-MM-DD, inclusive

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
  const sheetCreatedAt = new Map<number, Date>();

  if (params.when.mode === "sheet") {
    const sheet = await db
      .select({ id: runningSheets.id, createdAt: runningSheets.createdAt })
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
    sheetCreatedAt.set(sheet[0].id, sheet[0].createdAt);
  } else {
    const conditions = [
      eq(runningSheets.operationId, params.operationId),
      isNull(runningSheets.deletedAt),
    ];
    if (params.targetId)
      conditions.push(eq(runningSheets.targetId, params.targetId));
    const sheets = await db
      .select({ id: runningSheets.id, createdAt: runningSheets.createdAt })
      .from(runningSheets)
      .where(and(...conditions));
    if (!sheets.length) return [];
    sheetIds = sheets.map(s => s.id);
    for (const s of sheets) sheetCreatedAt.set(s.id, s.createdAt);
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
  let startISO = "";
  let endISO = "";
  if (params.when.mode !== "sheet") {
    if (params.when.mode === "custom") {
      startISO = params.when.startDate;
      endISO = params.when.endDate;
    } else {
      endISO = perthTodayISO();
      startISO = addDaysISO(endISO, params.when.mode === "last7" ? -6 : -29);
    }
  }

  // ── Reuse the same entity extraction/dedup pipeline as the Locations tab
  // (bracket-introduction + bare-re-mention two-pass recognition, plus
  // confirmed entity-alias merges) instead of a standalone per-row regex
  // pass — an address is often bracket-introduced once and then referenced
  // in plain prose on later rows ("returned to 54 Terrace Road"), which a
  // bracket-only pass undercounts to a single visit.
  const allEntities = await getAllIntelligenceEntities();

  // A "mention" of an address isn't the same as a "visit" — a target's home
  // address sitting on their target card, a Surveillance Commenced/Ceased
  // marker, a Travelled Via street list, or an address mentioned without any
  // narration of the target's presence there all inflate the raw mention
  // count without representing a real sighting. Collect only the qualifying
  // mentions first, keyed by sheet + row order, then collapse below.
  type QualifyingMention = {
    entityKey: string;
    label: string;
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

      if (params.when.mode !== "sheet") {
        const resolvedDate =
          row.rowDate ??
          addDaysISO(
            toPerthDateISO(sheetCreatedAt.get(occ.sheetId) ?? new Date()),
            row.dayOffset
          );
        if (resolvedDate < startISO || resolvedDate > endISO) continue;
      }

      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        sheetId: occ.sheetId,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
      });
    }
  }

  // ── Collapse consecutive mentions of the same address into one visit ──────
  // "Arrived at X" followed by "departed X" (or "…and continued via:") is one
  // visit, not two — a new visit only counts once a *different* address
  // appears in between, or the sheet changes. Walk each sheet's qualifying
  // mentions in row order and count address transitions, not raw mentions.
  const grouped = new Map<string, { label: string; count: number }>();
  const qualifyingBySheet = new Map<number, QualifyingMention[]>();
  for (const m of qualifying) {
    if (!qualifyingBySheet.has(m.sheetId)) qualifyingBySheet.set(m.sheetId, []);
    qualifyingBySheet.get(m.sheetId)!.push(m);
  }
  for (const mentions of Array.from(qualifyingBySheet.values())) {
    mentions.sort((a, b) => a.order - b.order);
    let lastEntityKey: string | null = null;
    for (const m of mentions) {
      if (m.entityKey === lastEntityKey) {
        lastEntityKey = m.entityKey;
        continue; // still the same visit
      }
      lastEntityKey = m.entityKey;
      const existing = grouped.get(m.entityKey);
      if (existing) existing.count++;
      else grouped.set(m.entityKey, { label: m.label, count: 1 });
    }
  }

  const results = await Promise.all(
    Array.from(grouped.entries()).map(async ([key, { label, count }]) => {
      const coords = await resolveLatLng(key, label);
      if (!coords) return null;
      return { label, count, lat: coords.lat, lng: coords.lng };
    })
  );

  return results
    .filter((r): r is IntelligenceHeatMapLocation => r !== null)
    .sort((a, b) => b.count - a.count);
}

/** Cache-first geocoding for intel addresses — geocodes once via Google's
 * Geocoding API and persists the result, so re-opening the Heat Map doesn't
 * re-geocode the same addresses every time. */
export async function resolveLatLng(
  addressKey: string,
  rawAddress: string
): Promise<{ lat: number; lng: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const cached = await db
    .select({
      lat: intelligenceGeocodeCache.lat,
      lng: intelligenceGeocodeCache.lng,
    })
    .from(intelligenceGeocodeCache)
    .where(eq(intelligenceGeocodeCache.addressKey, addressKey))
    .limit(1);
  if (cached.length) return cached[0];

  try {
    const result = await makeRequest<GeocodingResult>(
      "/maps/api/geocode/json",
      { address: rawAddress + ", Western Australia, Australia", region: "au" }
    );
    if (result.status !== "OK" || !result.results.length) return null;
    const loc = result.results[0].geometry.location;
    await db
      .insert(intelligenceGeocodeCache)
      .values({ addressKey, lat: loc.lat, lng: loc.lng })
      .onDuplicateKeyUpdate({
        set: { lat: loc.lat, lng: loc.lng, resolvedAt: new Date() },
      });
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

// ─── Weekly Activity Report ─────────────────────────────────────────────────
// "What the unit did this week" — operations coverage, newly-gathered
// intelligence, target visit activity, and governance completed, all for a
// given Monday-start week. Reuses the same entity pipeline and observed-
// visit logic as the Heat Map (see getIntelligenceHeatMapLocations above)
// rather than re-deriving anything.

export interface WeeklyActivityOperation {
  operationId: number;
  operationName: string;
  sheetsCount: number;
  rowsCount: number;
  officers: string[];
}

export interface WeeklyActivityNewIntel {
  operationId: number;
  operationName: string;
  newImages: number;
  newLocations: string[];
  newVehicles: string[];
}

export interface WeeklyActivityTarget {
  targetId: number;
  targetName: string;
  operationName: string;
  locations: { label: string; count: number }[];
}

export interface WeeklyActivityReport {
  weekStart: string;
  weekEnd: string;
  operations: WeeklyActivityOperation[];
  newIntelligence: WeeklyActivityNewIntel[];
  targetActivity: WeeklyActivityTarget[];
  governanceCompleted: number;
}

/** weekStart is a Monday, YYYY-MM-DD (Perth-anchored). */
export async function getWeeklyActivityReport(
  weekStart: string
): Promise<WeeklyActivityReport> {
  const db = await getDb();
  const weekEnd = addDaysISO(weekStart, 6);
  const empty: WeeklyActivityReport = {
    weekStart,
    weekEnd,
    operations: [],
    newIntelligence: [],
    targetActivity: [],
    governanceCompleted: 0,
  };
  if (!db) return empty;

  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  if (!sheets.length) return empty;
  const sheetById = new Map(sheets.map(s => [s.id, s]));
  const opIds = Array.from(new Set(sheets.map(s => s.operationId)));

  const [ops, targetRows, rows, govRecords] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    db.select().from(targets).where(inArray(targets.operationId, opIds)),
    db
      .select()
      .from(sheetRows)
      .where(
        inArray(
          sheetRows.sheetId,
          sheets.map(s => s.id)
        )
      ),
    getGovernanceRecordsBySheetIds(sheets.map(s => s.id)),
  ]);
  const opById = new Map(ops.map(o => [o.id, o]));
  const targetById = new Map(targetRows.map(t => [t.id, t]));

  function resolveRowDate(row: (typeof rows)[number]): string {
    if (row.rowDate) return row.rowDate;
    const sheet = sheetById.get(row.sheetId);
    return addDaysISO(
      toPerthDateISO(sheet?.createdAt ?? new Date()),
      row.dayOffset
    );
  }
  const rowById = new Map(rows.map(r => [r.id, r]));
  const rowsInWeek = rows.filter(r => {
    const d = resolveRowDate(r);
    return d >= weekStart && d <= weekEnd;
  });

  // ── Operations & coverage ──────────────────────────────────────────────
  const opStats = new Map<
    number,
    { sheetIds: Set<number>; rowsCount: number; officers: Set<string> }
  >();
  for (const r of rowsInWeek) {
    const sheet = sheetById.get(r.sheetId);
    if (!sheet) continue;
    if (!opStats.has(sheet.operationId))
      opStats.set(sheet.operationId, {
        sheetIds: new Set(),
        rowsCount: 0,
        officers: new Set(),
      });
    const stat = opStats.get(sheet.operationId)!;
    stat.sheetIds.add(sheet.id);
    stat.rowsCount++;
  }
  for (const stat of Array.from(opStats.values())) {
    for (const sid of Array.from(stat.sheetIds)) {
      const sheet = sheetById.get(sid);
      if (!sheet?.sheetCins) continue;
      try {
        const cins: { cin: string }[] = JSON.parse(sheet.sheetCins);
        for (const c of cins) if (c.cin) stat.officers.add(c.cin);
      } catch {
        // malformed roster JSON — skip officers for this sheet
      }
    }
  }
  const operationsSummary: WeeklyActivityOperation[] = Array.from(
    opStats.entries()
  )
    .map(([opId, stat]) => ({
      operationId: opId,
      operationName: opById.get(opId)?.name ?? "—",
      sheetsCount: stat.sheetIds.size,
      rowsCount: stat.rowsCount,
      officers: Array.from(stat.officers).sort(),
    }))
    .sort((a, b) => a.operationName.localeCompare(b.operationName));

  // ── New intelligence — images uploaded this week, plus locations/vehicles
  // whose *first-ever* occurrence (all time, not just this week) falls
  // inside the week, i.e. genuinely new discoveries rather than repeat
  // mentions of something already known ──────────────────────────────────
  const attachments = await db
    .select({
      id: rowAttachments.id,
      operationId: rowAttachments.operationId,
      createdAt: rowAttachments.createdAt,
    })
    .from(rowAttachments)
    .where(
      and(
        inArray(rowAttachments.operationId, opIds),
        isNull(rowAttachments.deletedAt)
      )
    );
  const newImagesByOp = new Map<number, number>();
  for (const a of attachments) {
    const d = toPerthDateISO(a.createdAt);
    if (d < weekStart || d > weekEnd) continue;
    newImagesByOp.set(
      a.operationId,
      (newImagesByOp.get(a.operationId) ?? 0) + 1
    );
  }

  const allEntities = await getAllIntelligenceEntities();
  const newLocationsByOp = new Map<number, Set<string>>();
  const newVehiclesByOp = new Map<number, Set<string>>();
  for (const entity of allEntities) {
    if (
      entity.type !== "address" &&
      entity.type !== "business" &&
      entity.type !== "vehicle"
    )
      continue;
    let earliestDate: string | null = null;
    const opsSeenThisWeek = new Set<number>();
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0) continue; // target-card entry, not a real sighting
      const row = rowById.get(occ.rowId);
      const d = row ? resolveRowDate(row) : null;
      if (!d) continue;
      if (earliestDate === null || d < earliestDate) earliestDate = d;
      if (d >= weekStart && d <= weekEnd) opsSeenThisWeek.add(occ.operationId);
    }
    if (
      earliestDate === null ||
      earliestDate < weekStart ||
      earliestDate > weekEnd
    )
      continue; // not newly discovered this week
    const targetMap =
      entity.type === "vehicle" ? newVehiclesByOp : newLocationsByOp;
    for (const opId of Array.from(opsSeenThisWeek)) {
      if (!targetMap.has(opId)) targetMap.set(opId, new Set());
      targetMap.get(opId)!.add(entity.shortForm);
    }
  }

  const intelOpIds = new Set([
    ...Array.from(newImagesByOp.keys()),
    ...Array.from(newLocationsByOp.keys()),
    ...Array.from(newVehiclesByOp.keys()),
  ]);
  const newIntelligence: WeeklyActivityNewIntel[] = Array.from(intelOpIds)
    .map(opId => ({
      operationId: opId,
      operationName: opById.get(opId)?.name ?? "—",
      newImages: newImagesByOp.get(opId) ?? 0,
      newLocations: Array.from(newLocationsByOp.get(opId) ?? []).sort(),
      newVehicles: Array.from(newVehiclesByOp.get(opId) ?? []).sort(),
    }))
    .sort((a, b) => a.operationName.localeCompare(b.operationName));

  // ── Target visit activity — same qualifying-mention + session-collapse
  // rules as the Heat Map (skip target-card entries, Surveillance
  // Commenced/Ceased and Travelled Via rows, require an observation-signal
  // keyword, collapse consecutive same-address mentions into one visit) —
  // grouped by each sheet's assigned target rather than geocoded. ─────────
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  {
    const bySheet = new Map<number, typeof rows>();
    for (const r of rows) {
      if (!bySheet.has(r.sheetId)) bySheet.set(r.sheetId, []);
      bySheet.get(r.sheetId)!.push(r);
    }
    for (const list of Array.from(bySheet.values())) {
      list.sort(
        (a, b) =>
          (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0) ||
          a.rowNumber - b.rowNumber
      );
      list.forEach((r, i) => {
        previousObservationByRowId.set(
          r.id,
          i > 0 ? (list[i - 1].observation ?? null) : null
        );
        rowOrderIndex.set(r.id, i);
      });
    }
  }

  type QualifyingMention = {
    entityKey: string;
    label: string;
    targetId: number;
    order: number;
  };
  const qualifying: QualifyingMention[] = [];
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0) continue;
      const row = rowById.get(occ.rowId);
      if (!row?.observation) continue;
      const d = resolveRowDate(row);
      if (d < weekStart || d > weekEnd) continue;
      const sheet = sheetById.get(row.sheetId);
      if (!sheet?.targetId) continue; // no target assigned — not attributable
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;
      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        targetId: sheet.targetId,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
      });
    }
  }
  const visitCounts = new Map<
    number,
    Map<string, { label: string; count: number }>
  >();
  const qualifyingByTarget = new Map<number, QualifyingMention[]>();
  for (const m of qualifying) {
    if (!qualifyingByTarget.has(m.targetId))
      qualifyingByTarget.set(m.targetId, []);
    qualifyingByTarget.get(m.targetId)!.push(m);
  }
  for (const [targetId, mentions] of Array.from(qualifyingByTarget.entries())) {
    mentions.sort((a, b) => a.order - b.order);
    let lastEntityKey: string | null = null;
    const grouped = new Map<string, { label: string; count: number }>();
    for (const m of mentions) {
      if (m.entityKey === lastEntityKey) continue;
      lastEntityKey = m.entityKey;
      const existing = grouped.get(m.entityKey);
      if (existing) existing.count++;
      else grouped.set(m.entityKey, { label: m.label, count: 1 });
    }
    visitCounts.set(targetId, grouped);
  }
  const targetActivity: WeeklyActivityTarget[] = Array.from(
    visitCounts.entries()
  )
    .map(([targetId, locMap]) => {
      const target = targetById.get(targetId);
      return {
        targetId,
        targetName: target?.name ?? "—",
        operationName: opById.get(target?.operationId ?? -1)?.name ?? "—",
        locations: Array.from(locMap.values()).sort(
          (a, b) => b.count - a.count
        ),
      };
    })
    .sort((a, b) => a.targetName.localeCompare(b.targetName));

  // ── Governance completed — sheets whose record hit 100% and were last
  // touched within the week. There's no per-checkbox completion timestamp,
  // only the record's own updatedAt, so this is an approximation: a sheet
  // completed earlier and merely re-saved this week would also count. ────
  const govFields = [
    "isurv",
    "sentToIO",
    "savedAsWord",
    "savedAsPdf",
    "uploadedToPromis",
    "linked",
    "savedInOpFolder",
    "imageryTaken",
    "coverPage",
  ] as const;
  let governanceCompleted = 0;
  for (const g of govRecords) {
    const d = toPerthDateISO(g.updatedAt);
    if (d < weekStart || d > weekEnd) continue;
    if (govFields.every(f => g[f])) governanceCompleted++;
  }

  return {
    weekStart,
    weekEnd,
    operations: operationsSummary,
    newIntelligence,
    targetActivity,
    governanceCompleted,
  };
}

export async function getAllIntelligenceEntities(): Promise<
  IntelligenceEntity[]
> {
  const db = await getDb();
  if (!db) return [];

  // Confirmed entity-alias merges (fuzzy-duplicate prompt "Yes", or the manual
  // Merge Entities tool) — fold the loser's occurrences into the winner the
  // same way TGT aliases fold into their canonical target below. loserLabel
  // is attached to the winner entity's aliasLabels ("also known as") the
  // first time an occurrence is redirected through it — see registerOccurrence.
  const aliasRows = await db.select().from(entityAliases);
  const entityAliasMap = new Map<string, { key: string; label: string }>();
  for (const a of aliasRows) {
    entityAliasMap.set(`${a.type}::${a.loserKey}`, {
      key: `${a.type}::${a.winnerKey}`,
      label: a.winnerLabel,
    });
  }

  // When two mentions of the same vehicle merge, prefer whichever is in the
  // canonical "REGO description" form (matches how observation text gets
  // formatted — see extractEntitiesFromText's vehicle branch) over a raw
  // target-card field where the rego sits mid-sentence (e.g. "silver Hyundai
  // Santa Fe, bearing WA registration 1ICW519") — otherwise a longer but
  // awkwardly-worded raw field value would win on length alone.
  const isCanonicalVehicleForm = (
    shortForm: string,
    regoKey: string
  ): boolean => shortForm.toLowerCase().startsWith(regoKey);
  const preferVehicleShortForm = (
    existing: string,
    candidate: string,
    regoKey: string
  ): boolean => {
    const existingCanonical = isCanonicalVehicleForm(existing, regoKey);
    const candidateCanonical = isCanonicalVehicleForm(candidate, regoKey);
    if (candidateCanonical !== existingCanonical) return candidateCanonical;
    return candidate.length > existing.length;
  };

  // ── 1. Load formal target cards first ─────────────────────────────────────
  // Use leftJoin so registry targets with null operationId are included.
  // Also pull in linked operations via operation_target_links for registry targets.
  const directTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId!, operations.id))
    .where(isNull(targets.deletedAt));

  // Also load registry-linked targets (via operation_target_links)
  const linkedTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(
      operationTargetLinks,
      eq(operationTargetLinks.targetId, targets.id)
    )
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(isNull(targets.deletedAt));

  // Merge: for each target, prefer linked operation rows; fall back to direct row
  const seenTargetOpPairs = new Set<string>();
  const targetRows: Array<{
    targetId: number;
    targetName: string;
    tgt: string | null;
    hb: string | null;
    v1: string | null;
    v2: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    extraVehicles: string | null;
    operationId: number | null;
    operationName: string | null;
  }> = [];

  for (const row of linkedTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    seenTargetOpPairs.add(pairKey);
    targetRows.push(row);
  }
  for (const row of directTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    if (!seenTargetOpPairs.has(pairKey)) {
      targetRows.push(row);
    }
  }

  // Find sheets linked to each target (exclude soft-deleted sheets)
  const sheetsByTarget = await db
    .select({
      targetId: runningSheets.targetId,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
    })
    .from(runningSheets)
    .where(
      and(isNotNull(runningSheets.targetId), isNull(runningSheets.deletedAt))
    );

  const targetSheetMap = new Map<
    number,
    Array<{ sheetId: number; sheetTitle: string }>
  >();
  for (const s of sheetsByTarget) {
    if (s.targetId === null) continue;
    if (!targetSheetMap.has(s.targetId)) targetSheetMap.set(s.targetId, []);
    targetSheetMap
      .get(s.targetId)!
      .push({ sheetId: s.sheetId, sheetTitle: s.sheetTitle });
  }

  // Build a set of TGT aliases so we can suppress them from observation-derived persons
  // Maps tgtAlias (uppercased) -> canonical full name
  const tgtAliasToFullName = new Map<string, string>();
  for (const t of targetRows) {
    if (t.tgt && t.tgt.trim()) {
      tgtAliasToFullName.set(t.tgt.trim().toUpperCase(), t.targetName);
    }
  }

  const entityMap = new Map<string, IntelligenceEntity>();

  // ── 2. Add formal target cards as person entities (isTarget = true) ────────
  for (const t of targetRows) {
    const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
    const sheetEntries =
      linkedSheets.length > 0
        ? linkedSheets
        : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];

    // Target person entity — keyed by full name, carries tgtAlias
    const nameKey = `target::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, {
        shortForm: t.targetName,
        type: "person",
        isTarget: true,
        tgtAlias: t.tgt?.trim() || null,
        targetId: t.targetId,
        occurrences: [],
      });
    }
    for (const sheet of sheetEntries) {
      entityMap.get(nameKey)!.occurrences.push({
        sheetId: sheet.sheetId,
        sheetTitle: sheet.sheetTitle,
        operationId: t.operationId ?? 0,
        operationName: t.operationName ?? "(Registry)",
        rowId: 0,
        observationSnippet: `Target card — ${t.targetName}${t.tgt ? ` (TGT: ${t.tgt})` : ""}`,
        timeMinutes: null,
        fullDescription: `Target: ${t.targetName}${t.tgt ? `, TGT: ${t.tgt}` : ""} (operation: ${t.operationName ?? "Registry"})`,
      });
    }

    // Location fields from target card: HBF/HB (address), V1F/V1/V2F/V2 (vehicle)
    // For each full/abbreviated pair, only register the full version if it is set;
    // the abbreviated version is only used as a fallback when the full field is empty.
    // This prevents HBF + HB (or V1F + V1) from appearing as two separate entities.
    const locationFields: Array<{
      label: string;
      value: string | null;
      type: IntelligenceEntity["type"];
    }> = [
      {
        label: "HBF",
        value: t.hbf?.trim() || t.hb?.trim() || null,
        type: "address",
      },
      {
        label: "V1F",
        value: t.v1f?.trim() || t.v1?.trim() || null,
        type: "vehicle",
      },
      {
        label: "V2F",
        value: t.v2f?.trim() || t.v2?.trim() || null,
        type: "vehicle",
      },
    ];
    // Also include extra vehicles (V2, V3, V4 ...) stored as JSON array {full, short}
    if (t.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          t.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const vehicleLabel = `V${idx + 2}F`; // V2F, V3F, V4F ...
          const vehicleValue = ev.full?.trim() || ev.short?.trim() || null;
          if (vehicleValue) {
            locationFields.push({
              label: vehicleLabel,
              value: vehicleValue,
              type: "vehicle",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    for (const field of locationFields) {
      if (!field.value || field.value.trim() === "") continue;
      let shortForm = field.value.trim();
      // For vehicles: strip the RS bracket suffix "(Vehicle REGO)" or "(REGO)" appended
      // by the HBF autocomplete / addressFormat so the entity key matches the observation-
      // derived key (which never includes the bracket code in the shortForm).
      if (field.type === "vehicle") {
        shortForm = shortForm.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
      }
      if (!shortForm) continue;
      // Normalise whitespace so minor spacing differences don't create duplicate keys.
      // Vehicles key on registration alone (see vehicleRegoKey above).
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const key = `${field.type}::${normKey}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      } else {
        // Prefer the longer / richer shortForm
        const existing = entityMap.get(key)!;
        const shouldUpgrade =
          field.type === "vehicle"
            ? preferVehicleShortForm(existing.shortForm, shortForm, normKey)
            : shortForm.length > existing.shortForm.length;
        if (shouldUpgrade) existing.shortForm = shortForm;
      }
      for (const sheet of sheetEntries) {
        // Deduplicate occurrences by sheetId+rowId (rowId=0 for target card entries)
        const occKey = `${sheet.sheetId}::0::${field.label}`;
        const alreadyAdded = entityMap
          .get(key)!
          .occurrences.some(
            o =>
              o.sheetId === sheet.sheetId &&
              o.rowId === 0 &&
              o.observationSnippet ===
                `Target card — ${t.targetName} [${field.label}]`
          );
        if (!alreadyAdded) {
          entityMap.get(key)!.occurrences.push({
            sheetId: sheet.sheetId,
            sheetTitle: sheet.sheetTitle,
            operationId: t.operationId ?? 0,
            operationName: t.operationName ?? "(Registry)",
            rowId: 0,
            observationSnippet: `Target card — ${t.targetName} [${field.label}]`,
            timeMinutes: null,
            fullDescription: `${field.label}: ${shortForm} (from target: ${t.targetName}, operation: ${t.operationName ?? "Registry"})`,
          });
        }
        void occKey; // suppress unused variable warning
      }
    }
  }

  // ── 3. Extract from observation rows ──────────────────────────────────────
  //
  // Two-pass approach:
  //   Pass A: for each sheet, scan all rows in time order and collect every
  //           bracketed introduction "FullForm (ShortForm)" into a per-sheet
  //           entity dictionary.  This is the "first mention" that establishes
  //           the entity's type and canonical full description.
  //   Pass B: re-scan every row in the sheet and, for each known short form
  //           that appears as a standalone token (unbracketed), emit an
  //           occurrence using the registered full description and type.
  //           This handles all subsequent mentions that omit the brackets.
  //
  const rows = await db
    .select({
      rowId: sheetRows.id,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      operationId: runningSheets.operationId,
      operationName: operations.name,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .innerJoin(operations, eq(runningSheets.operationId, operations.id))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes);

  // Group rows by sheetId so we can do the two-pass per sheet
  const rowsBySheet = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!rowsBySheet.has(row.sheetId)) rowsBySheet.set(row.sheetId, []);
    rowsBySheet.get(row.sheetId)!.push(row);
  }

  // Helper: register or merge an entity occurrence into entityMap
  function registerOccurrence(
    e: {
      shortForm: string;
      rawShortForm?: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
      confidence?: "high" | "medium" | "low";
    },
    row: {
      sheetId: number;
      sheetTitle: string;
      operationId: number;
      operationName: string;
      rowId: number;
      observation: string | null;
      timeMinutes: number | null;
    }
  ) {
    if (!row.observation) return;
    // If this person shortForm (or its raw bracketed token) is a known TGT alias,
    // merge into the canonical target entity.
    // We must check BOTH because name-recovery may expand "HOTA" → "G HOTA",
    // but the tgtAliasToFullName map is keyed by the raw alias ("HOTA").
    if (e.type === "person") {
      const canonicalName =
        tgtAliasToFullName.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm
          ? tgtAliasToFullName.get(e.rawShortForm.toUpperCase())
          : undefined);
      if (canonicalName) {
        const targetKey = `target::${canonicalName}`;
        if (entityMap.has(targetKey)) {
          const snippet =
            row.observation.slice(0, 80) +
            (row.observation.length > 80 ? "…" : "");
          entityMap.get(targetKey)!.occurrences.push({
            sheetId: row.sheetId,
            sheetTitle: row.sheetTitle,
            operationId: row.operationId,
            operationName: row.operationName,
            rowId: row.rowId,
            observationSnippet: snippet,
            timeMinutes: row.timeMinutes ?? null,
            fullDescription: e.fullDescription,
          });
          return; // skip adding as a separate entity
        }
      }
    }
    // Vehicles key on registration alone (see vehicleRegoKey above) so a bare
    // rego, a chip-inserted "Vehicle REGO", and a fully-described sighting of
    // the same car all collapse into one entity instead of three.
    const normShortForm =
      e.type === "vehicle"
        ? vehicleRegoKey(e.shortForm)
        : e.shortForm.toLowerCase().replace(/\s+/g, " ").trim();
    let key = `${e.type}::${normShortForm}`;

    // Confirmed entity-alias merge (fuzzy-duplicate prompt "Yes", or the
    // manual Merge Entities tool) — redirect this occurrence to the winner
    // entity instead of creating/growing a separate one under the loser key.
    let displayShortForm = e.shortForm;
    const resolved = e.type !== "unknown" ? entityAliasMap.get(key) : undefined;
    if (resolved) {
      key = resolved.key;
      displayShortForm = resolved.label;
    }

    if (!entityMap.has(key)) {
      entityMap.set(key, {
        shortForm: displayShortForm,
        type: e.type,
        isTarget: false,
        occurrences: [],
      });
    } else if (!resolved) {
      // Upgrade to longer / richer shortForm if available — skipped when this
      // occurrence was redirected via an alias, since the winner's label is
      // the confirmed canonical display form and shouldn't be overwritten by
      // whatever the loser's raw text happened to say.
      const existing = entityMap.get(key)!;
      const shouldUpgrade =
        e.type === "vehicle"
          ? preferVehicleShortForm(
              existing.shortForm,
              e.shortForm,
              normShortForm
            )
          : e.shortForm.length > existing.shortForm.length;
      if (shouldUpgrade) existing.shortForm = e.shortForm;
    }
    if (
      resolved &&
      e.shortForm.toLowerCase().trim() !== displayShortForm.toLowerCase().trim()
    ) {
      const winner = entityMap.get(key)!;
      winner.aliasLabels = winner.aliasLabels ?? [];
      if (!winner.aliasLabels.includes(e.shortForm))
        winner.aliasLabels.push(e.shortForm);
    }
    // Flag entity as low-confidence if this occurrence was uncertain
    if (e.confidence === "low" || e.type === "unknown") {
      entityMap.get(key)!.lowConfidence = true;
    }
    const snippet =
      row.observation.slice(0, 80) + (row.observation.length > 80 ? "…" : "");
    entityMap.get(key)!.occurrences.push({
      sheetId: row.sheetId,
      sheetTitle: row.sheetTitle,
      operationId: row.operationId,
      operationName: row.operationName,
      rowId: row.rowId,
      observationSnippet: snippet,
      timeMinutes: row.timeMinutes ?? null,
      fullDescription: e.fullDescription,
    });
  }

  for (const [, sheetRows_] of Array.from(rowsBySheet.entries())) {
    // ── Pass A: build per-sheet entity dictionary from bracketed introductions ──
    // Dictionary key: shortForm.toLowerCase() AND rawShortForm.toLowerCase() (both point to same entry)
    // This is critical: name-recovery may change "HOTA" → "G HOTA", so we must register
    // BOTH keys so that Pass B can find "HOTA" in subsequent rows even though the
    // display name is "G HOTA".
    type DictEntry = {
      shortForm: string;
      rawShortForm: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
    };
    const sheetDict = new Map<string, DictEntry>();

    const registerDictEntry = (key: string, entry: DictEntry) => {
      if (!sheetDict.has(key)) {
        sheetDict.set(key, entry);
      } else {
        // Upgrade to longer shortForm if available
        const existing = sheetDict.get(key)!;
        if (entry.shortForm.length > existing.shortForm.length) {
          existing.shortForm = entry.shortForm;
          existing.fullDescription = entry.fullDescription;
        }
      }
    };

    // ── Pre-seed sheetDict with ALL target aliases from the target registry ──
    // Operators often write the target alias (e.g. "JAMES", "SMITH") from the very
    // first row without ever bracketing it, because the target card IS the introduction.
    // Without pre-seeding, Pass B would never find these tokens.
    // We register each alias under its lowercase key so Pass B can match it in any row.
    for (const [alias, canonicalName] of Array.from(
      tgtAliasToFullName.entries()
    )) {
      const aliasKey = alias.toLowerCase();
      if (!sheetDict.has(aliasKey)) {
        sheetDict.set(aliasKey, {
          shortForm: canonicalName, // display as full canonical name
          rawShortForm: alias, // raw alias is the search token
          fullDescription: `Target: ${canonicalName}`,
          type: "person",
        });
      }
    }

    for (const row of sheetRows_) {
      if (!row.observation) continue;
      const bracketed = extractEntitiesFromText(row.observation);
      for (const e of bracketed) {
        const entry: DictEntry = {
          shortForm: e.shortForm,
          rawShortForm: e.rawShortForm,
          fullDescription: e.fullDescription,
          type: e.type,
        };
        // Register by displayName key (e.g. "g hota")
        registerDictEntry(e.shortForm.toLowerCase(), entry);
        // Also register by raw bracketed token key (e.g. "hota") if different
        // This ensures Pass B can find "HOTA" in subsequent rows even though
        // the display name is "G HOTA".
        if (e.rawShortForm.toLowerCase() !== e.shortForm.toLowerCase()) {
          registerDictEntry(e.rawShortForm.toLowerCase(), entry);
        }
      }
    }

    // ── Pass B: scan every row for both bracketed AND unbracketed occurrences ──
    // Build a sorted list of known short forms (longest first to avoid partial matches)
    const knownEntries = Array.from(sheetDict.values()).sort(
      (a, b) => b.shortForm.length - a.shortForm.length
    );

    for (const row of sheetRows_) {
      if (!row.observation) continue;

      // First, register all bracketed entities in this row (as before)
      const bracketed = extractEntitiesFromText(row.observation);
      // Track both displayName and rawShortForm so we don't double-count
      // e.g. "G HOTA" (displayName) and "HOTA" (rawShortForm) are the same entity
      const bracketedShortForms = new Set<string>();
      for (const e of bracketed) {
        bracketedShortForms.add(e.shortForm.toLowerCase());
        bracketedShortForms.add(e.rawShortForm.toLowerCase());
      }
      for (const e of bracketed) {
        registerOccurrence(e, row);
      }

      // Then, scan for unbracketed occurrences of known short forms.
      //
      // Correct approach: work on the ORIGINAL observation text but track only
      // the paren content ranges "(ShortForm)" — i.e. the brackets themselves.
      // A short-form match is considered "inside a bracket" only if it falls
      // entirely within one of those paren ranges.  This correctly handles rows
      // like "Vehicle 1CZQ642 (1CZQ642) with G HOTA (HOTA) ..." where the same
      // token appears both unbracketed (the real entity) and inside parens
      // (the short-form label) — we want the unbracketed occurrence.
      //
      // Step 1: collect all paren-content ranges [start, end) in this row.
      //         We mark the entire "(ShortForm)" including the parens.
      const parenRanges: Array<[number, number]> = [];
      const parenPattern = /\([^()]{1,80}\)/g;
      let spanMatch: RegExpExecArray | null;
      while ((spanMatch = parenPattern.exec(row.observation)) !== null) {
        parenRanges.push([
          spanMatch.index,
          spanMatch.index + spanMatch[0].length,
        ]);
      }

      // Helper: returns true if the match at [start, end) is entirely inside a paren
      const isInsideParenContent = (start: number, end: number): boolean =>
        parenRanges.some(([s, e]) => start >= s && end <= e);

      // Deduplicate knownEntries so we don't emit two occurrences for the same entity
      // (sheetDict may have both "g hota" and "hota" pointing to the same DictEntry object)
      const seenEntryObjects = new Set<DictEntry>();

      for (const entry of knownEntries) {
        // Skip duplicates (same DictEntry registered under multiple keys)
        if (seenEntryObjects.has(entry)) continue;
        seenEntryObjects.add(entry);

        // Skip if this entity was already captured as a bracketed entity in this row
        // (check both displayName and rawShortForm)
        if (bracketedShortForms.has(entry.shortForm.toLowerCase())) continue;
        if (bracketedShortForms.has(entry.rawShortForm.toLowerCase())) continue;

        // For person, address, and business entities, search by BOTH the
        // enriched displayName ("G HOTA" / "54 Terrace Road, PERTH") AND the
        // raw bracketed token ("HOTA" / "54 Terrace Road") — subsequent rows
        // routinely use the short form (e.g. re-visits that don't repeat the
        // suburb every time: "returned to 54 Terrace Road"), and searching
        // only the full enriched form would miss those, undercounting visits.
        const searchTerms: string[] = [entry.shortForm];
        if (
          (entry.type === "person" ||
            entry.type === "address" ||
            entry.type === "business") &&
          entry.rawShortForm !== entry.shortForm
        ) {
          searchTerms.push(entry.rawShortForm);
        }

        let found = false;
        for (const term of searchTerms) {
          if (found) break;
          // Build a word-boundary regex for the search term.
          // For vehicle registrations (e.g. "1CZQ642") use lookahead/lookbehind for
          // non-alphanumeric boundaries; for alphabetic terms use \b.
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const wordBoundary = /^[A-Za-z]/.test(term)
            ? `\\b${escaped}\\b`
            : `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
          const re = new RegExp(wordBoundary, "gi");

          let tokenMatch: RegExpExecArray | null;
          while ((tokenMatch = re.exec(row.observation)) !== null) {
            const mStart = tokenMatch.index;
            const mEnd = mStart + tokenMatch[0].length;
            // Only count this occurrence if it is NOT inside a paren
            if (!isInsideParenContent(mStart, mEnd)) {
              found = true;
              break;
            }
          }
        }

        if (found) {
          registerOccurrence(
            {
              shortForm: entry.shortForm,
              rawShortForm: entry.rawShortForm,
              fullDescription: entry.fullDescription,
              type: entry.type,
            },
            row
          );
        }
      }
    }
  }

  // ── 4. Post-process: merge address and vehicle entities where one shortForm is a
  //       strict prefix of another (e.g. "1 Smith Street" absorbed into
  //       "1 Smith Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux").
  //
  //       IMPORTANT constraints:
  //         - Only applies to "address" and "vehicle" types (NOT persons or businesses)
  //           because person names share common prefixes legitimately (SMITH vs SMITH JONES)
  //         - isTarget entities are never touched by this pass
  //         - The shorter form must end at a natural word boundary in the longer form
  //           (space, comma, semicolon, dash, or slash) to avoid false merges
  // ─────────────────────────────────────────────────────────────────────────────

  // Separate target entities (keyed as target::) from non-target entities
  const nonTargetEntities = Array.from(entityMap.entries())
    .filter(([key]) => !key.startsWith("target::"))
    .map(([, entity]) => entity);

  const targetEntities = Array.from(entityMap.entries())
    .filter(([key]) => key.startsWith("target::"))
    .map(([, entity]) => entity);

  // Group non-target entities by type
  const byType = new Map<string, IntelligenceEntity[]>();
  for (const entity of nonTargetEntities) {
    const t = entity.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(entity);
  }

  const mergedMap = new Map<string, IntelligenceEntity>();

  for (const [entityType, group] of Array.from(byType.entries())) {
    // Only apply prefix-merge to addresses and vehicles
    if (entityType !== "address" && entityType !== "vehicle") {
      // For all other types, just add them as-is
      for (const entity of group) {
        const k = `${entity.type}::${entity.shortForm.toLowerCase().trim()}`;
        mergedMap.set(k, entity);
      }
      continue;
    }

    // Sort by shortForm length descending so longer (fuller) versions come first
    const sorted = [...group].sort(
      (a, b) => b.shortForm.length - a.shortForm.length
    );
    const absorbed = new Set<string>(); // lowercase shortForms that have been merged away

    for (let i = 0; i < sorted.length; i++) {
      const longer = sorted[i];
      const longerLower = longer.shortForm.toLowerCase().trim();
      if (absorbed.has(longerLower)) continue;

      for (let j = i + 1; j < sorted.length; j++) {
        const shorter = sorted[j];
        const shorterLower = shorter.shortForm.toLowerCase().trim();
        if (absorbed.has(shorterLower)) continue;

        // For vehicles: also absorb when the shorter shortForm appears ANYWHERE inside
        // the longer (e.g. "ABC 123" inside "silver Toyota Hilux bearing ABC 123").
        // For addresses: keep the original prefix-only rule.
        const isContained =
          entityType === "vehicle"
            ? (() => {
                const idx = longerLower.indexOf(shorterLower);
                if (idx === -1) return false;
                // Must be at a word boundary on both sides
                const before =
                  idx === 0 || /[\s,;\-/(]/.test(longerLower[idx - 1]);
                const after =
                  idx + shorterLower.length === longerLower.length ||
                  /[\s,;\-/)]/.test(longerLower[idx + shorterLower.length]);
                return before && after;
              })()
            : longerLower.startsWith(shorterLower) &&
              (longerLower.length === shorterLower.length ||
                /^[\s,;\-/]/.test(longerLower.slice(shorterLower.length)));
        if (isContained) {
          // Merge shorter's occurrences into longer, deduplicating by sheetId+rowId+snippet
          const existingKeys = new Set(
            longer.occurrences.map(
              (o: IntelligenceEntity["occurrences"][0]) =>
                `${o.sheetId}::${o.rowId}::${o.observationSnippet}`
            )
          );
          for (const occ of shorter.occurrences) {
            const occKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
            if (!existingKeys.has(occKey)) {
              longer.occurrences.push(occ);
              existingKeys.add(occKey);
            }
          }
          if (shorter.aliasLabels?.length) {
            longer.aliasLabels = longer.aliasLabels ?? [];
            for (const label of shorter.aliasLabels) {
              if (!longer.aliasLabels.includes(label))
                longer.aliasLabels.push(label);
            }
          }
          // For vehicles: when merging, prefer the entity with a richer display name
          // (one that includes colour/make/model) over a bare rego or "Vehicle REGO" form.
          // The longer entity (sorted by shortForm length) is usually richer, so we keep it.
          // Exception: if the longer entity is actually a bare rego and the shorter has
          // a richer description (colour+make), swap them.
          if (entityType === "vehicle") {
            const longerHasDesc = /[a-z]/i.test(
              longer.shortForm.replace(/^\d[A-Z]{2,3}\d{3}\s*/i, "")
            );
            const shorterHasDesc = /[a-z]/i.test(
              shorter.shortForm.replace(/^\d[A-Z]{2,3}\d{3}\s*/i, "")
            );
            if (!longerHasDesc && shorterHasDesc) {
              longer.shortForm = shorter.shortForm;
            }
          }
          absorbed.add(shorterLower);
        }
      }

      // Only add to mergedMap if this entity was NOT itself absorbed by a longer one
      if (!absorbed.has(longerLower)) {
        const mergeKey = `${longer.type}::${longerLower}`;
        mergedMap.set(mergeKey, longer);
      }
    }
  }

  // Add target entities back — they were never in byType
  for (const entity of targetEntities) {
    const k = `target::${entity.shortForm}`;
    mergedMap.set(k, entity);
  }

  return Array.from(mergedMap.values());
}

// ─── Entity Deduplication ───────────────────────────────────────────────────
// Deterministic fuzzy-duplicate detection and manual/confirmed merging for
// non-target Intelligence entities (person/vehicle/address/business). See
// server/entityDedup.ts for the matching heuristics themselves — everything
// here is plain DB plumbing around entity_aliases / entity_dedup_decisions.

/** Bare normalized key (no "type::" prefix) — what entity_aliases/entity_dedup_decisions store. */
function normOnly(type: DedupType, shortForm: string): string {
  return type === "vehicle"
    ? vehicleRegoKey(shortForm)
    : normalizeEntityLabel(shortForm);
}

export interface DuplicateMatchResult {
  key: string;
  label: string;
  type: DedupType;
  rowCount: number;
  score: number;
  reason: string;
}

/**
 * Fuzzy-matches a candidate label (not yet saved as an entity — this is
 * called as an officer types/saves an observation row) against every
 * existing entity of the same type, excluding pairs already confirmed as
 * distinct via a previous "No" answer.
 */
export async function checkPossibleDuplicates(
  type: DedupType,
  label: string
): Promise<DuplicateMatchResult[]> {
  const db = await getDb();
  if (!db) return [];
  const candidateCombinedKey = computeEntityKey(type, label);
  const candidateBareKey = normOnly(type, label);

  // Already a confirmed alias (either side) — getAllIntelligenceEntities will
  // silently fold this into its winner, so there's nothing new to ask about.
  const existingAlias = await db
    .select()
    .from(entityAliases)
    .where(
      and(
        eq(entityAliases.type, type),
        or(
          eq(entityAliases.loserKey, candidateBareKey),
          eq(entityAliases.winnerKey, candidateBareKey)
        )
      )
    )
    .limit(1);
  if (existingAlias.length > 0) return [];

  const allEntities = await getAllIntelligenceEntities();
  const candidates: DedupCandidateEntity[] = allEntities
    .filter(e => !e.isTarget && e.type === type)
    .map(e => ({
      key: computeEntityKey(type, e.shortForm),
      label: e.shortForm,
      type,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
    }));

  const decisions = await db
    .select()
    .from(entityDedupDecisions)
    .where(eq(entityDedupDecisions.type, type));
  const decidedDifferentBareKeys = new Set<string>();
  for (const d of decisions) {
    if (d.keyA === candidateBareKey) decidedDifferentBareKeys.add(d.keyB);
    else if (d.keyB === candidateBareKey) decidedDifferentBareKeys.add(d.keyA);
  }
  const filtered = candidates.filter(
    c => !decidedDifferentBareKeys.has(normOnly(type, c.label))
  );

  return findPossibleDuplicates(label, type, candidateCombinedKey, filtered);
}

/** Records a confirmed "these are NOT the same entity" decision so the prompt never asks about this pair again. */
export async function markEntitiesNotDuplicate(
  type: DedupType,
  labelA: string,
  labelB: string,
  decidedByCIN: string | undefined
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const bareA = normOnly(type, labelA);
  const bareB = normOnly(type, labelB);
  if (bareA === bareB) return; // same normalized key — nothing to record
  const [keyA, keyB] = bareA < bareB ? [bareA, bareB] : [bareB, bareA];
  const existing = await db
    .select()
    .from(entityDedupDecisions)
    .where(
      and(
        eq(entityDedupDecisions.type, type),
        eq(entityDedupDecisions.keyA, keyA),
        eq(entityDedupDecisions.keyB, keyB)
      )
    )
    .limit(1);
  if (existing.length > 0) return;
  await db
    .insert(entityDedupDecisions)
    .values({ type, keyA, keyB, decidedByCIN, decidedAt: Date.now() });
}

/** Walks the existing alias chain from `winnerKey` to detect a would-be cycle before writing a new merge. */
async function wouldCreateAliasCycle(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  type: DedupType,
  winnerKey: string,
  loserKey: string
): Promise<boolean> {
  const rows = await db
    .select()
    .from(entityAliases)
    .where(eq(entityAliases.type, type));
  const map = new Map(rows.map(r => [r.loserKey, r.winnerKey]));
  let current = winnerKey;
  const seen = new Set<string>();
  while (map.has(current)) {
    if (seen.has(current)) return false; // pre-existing unrelated cycle — not ours to fix here
    seen.add(current);
    current = map.get(current)!;
    if (current === loserKey) return true;
  }
  return false;
}

/**
 * Confirms two entities are the same real-world thing. Used by both the
 * auto-detected duplicate prompt ("Yes") and the manual Merge Entities tool.
 * `winnerLabel` survives as the canonical entity; `loserLabel` is folded into
 * it and kept as an "also known as" — see aliasLabels on IntelligenceEntity.
 */
export async function mergeEntities(
  type: DedupType,
  winnerLabel: string,
  loserLabel: string,
  mergedByCIN: string | undefined
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const winnerKey = normOnly(type, winnerLabel);
  const loserKey = normOnly(type, loserLabel);
  if (winnerKey === loserKey)
    throw new Error("Cannot merge an entity into itself.");
  if (await wouldCreateAliasCycle(db, type, winnerKey, loserKey)) {
    throw new Error(
      "This merge would create a loop with an existing merge — check current merges first."
    );
  }
  const existing = await db
    .select()
    .from(entityAliases)
    .where(
      and(eq(entityAliases.type, type), eq(entityAliases.loserKey, loserKey))
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(entityAliases)
      .set({
        winnerKey,
        winnerLabel,
        loserLabel,
        mergedByCIN,
        mergedAt: Date.now(),
      })
      .where(eq(entityAliases.id, existing[0].id));
  } else {
    await db.insert(entityAliases).values({
      type,
      loserKey,
      loserLabel,
      winnerKey,
      winnerLabel,
      mergedByCIN,
      mergedAt: Date.now(),
    });
  }
}

/** Reverses a previous merge. `loserKey` must be the bare key from an existing entity_aliases row (see listEntityMerges). */
export async function unmergeEntity(
  type: DedupType,
  loserKey: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(entityAliases)
    .where(
      and(eq(entityAliases.type, type), eq(entityAliases.loserKey, loserKey))
    );
}

export async function listEntityMerges() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(entityAliases).orderBy(desc(entityAliases.mergedAt));
}

/**
 * Search existing entities of one type by substring — backs the manual Merge
 * Entities picker (excludeTargets: true, the default) and the Target
 * Registry name/vehicle autocomplete (excludeTargets: false — that feature's
 * whole point is suggesting entities already seen in observations, and most
 * of those worth adding as a Target have often already been promoted to one
 * elsewhere, so filtering them out there defeats the feature).
 */
export async function searchIntelligenceEntities(
  type: DedupType,
  query: string,
  excludeTargets = true
): Promise<DedupCandidateEntity[]> {
  const allEntities = await getAllIntelligenceEntities();
  const q = query.trim().toLowerCase();
  return allEntities
    .filter(
      e =>
        (!excludeTargets || !e.isTarget) &&
        e.type === type &&
        (!q || e.shortForm.toLowerCase().includes(q))
    )
    .map(e => ({
      key: computeEntityKey(type, e.shortForm),
      label: e.shortForm,
      type,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
    }))
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 25);
}

// ─── Association Graph ───────────────────────────────────────────────────────

export interface AssocNode {
  id: string; // e.g. "person::SAM JACK"
  label: string; // display label
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number; // total times seen
  operationIds: number[];
  operationNames: string[];
}

export interface AssocEdge {
  source: string; // node id
  target: string; // node id
  weight: number; // number of rows where both appear together
}

export interface AssociationGraph {
  nodes: AssocNode[];
  edges: AssocEdge[];
}

export async function getAssociationGraph(
  operationIds?: number[]
): Promise<AssociationGraph> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  // Fetch all rows with their observations, filtered by operation if specified
  // Exclude rows from soft-deleted sheets
  let rowQuery = db
    .select({
      rowId: sheetRows.id,
      observation: sheetRows.observation,
      sheetId: sheetRows.sheetId,
      operationId: runningSheets.operationId,
      operationName: operations.name,
    })
    .from(sheetRows)
    .innerJoin(
      runningSheets,
      and(
        eq(sheetRows.sheetId, runningSheets.id),
        isNull(runningSheets.deletedAt)
      )
    )
    .innerJoin(operations, eq(runningSheets.operationId, operations.id));

  const allRows = await rowQuery;
  const filteredRows =
    operationIds && operationIds.length > 0
      ? allRows.filter(r => operationIds.includes(r.operationId))
      : allRows;

  // Build TGT alias map from targets (exclude soft-deleted)
  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      operationId: targets.operationId,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));
  const tgtAliasMap = new Map<string, string>(); // alias -> full name
  for (const t of allTargets) {
    if (t.tgt?.trim()) tgtAliasMap.set(t.tgt.trim().toUpperCase(), t.name);
  }

  // nodeMap: id -> AssocNode (accumulate)
  const nodeMap = new Map<string, AssocNode>();

  // Add target nodes from target cards
  for (const t of allTargets) {
    if (
      operationIds &&
      operationIds.length > 0 &&
      t.operationId &&
      !operationIds.includes(t.operationId)
    )
      continue;
    const nodeId = `target::${t.name}`;
    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, {
        id: nodeId,
        label: t.name,
        type: "target",
        occurrences: 0,
        operationIds: [],
        operationNames: [],
      });
    }
  }

  // edgeWeight: "nodeId1|||nodeId2" -> count (always sort ids so order is consistent)
  const edgeWeight = new Map<string, number>();

  const ensureNode = (
    id: string,
    label: string,
    type: AssocNode["type"],
    opId: number,
    opName: string
  ) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label,
        type,
        occurrences: 0,
        operationIds: [],
        operationNames: [],
      });
    }
    const n = nodeMap.get(id)!;
    n.occurrences++;
    if (!n.operationIds.includes(opId)) {
      n.operationIds.push(opId);
      n.operationNames.push(opName);
    }
  };

  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    const key = [a, b].sort().join("|||");
    edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
  };

  for (const row of filteredRows) {
    if (!row.observation) continue;
    const rawEntities = extractEntitiesFromText(row.observation);

    // Resolve TGT aliases to canonical target names
    const rowNodeIds: string[] = [];
    for (const e of rawEntities) {
      let nodeId: string;
      let label: string;
      let nodeType: AssocNode["type"];

      if (e.type === "person") {
        const canonical = tgtAliasMap.get(e.shortForm.toUpperCase());
        if (canonical) {
          nodeId = `target::${canonical}`;
          label = canonical;
          nodeType = "target";
        } else {
          nodeId = `person::${e.shortForm.toLowerCase()}`;
          label = e.shortForm;
          nodeType = "person";
        }
      } else {
        nodeId = `${e.type}::${e.shortForm.toLowerCase()}`;
        label = e.shortForm;
        nodeType = e.type as AssocNode["type"];
      }

      ensureNode(nodeId, label, nodeType, row.operationId, row.operationName);
      rowNodeIds.push(nodeId);
    }

    // Create edges between every pair of entities in this row
    for (let i = 0; i < rowNodeIds.length; i++) {
      for (let j = i + 1; j < rowNodeIds.length; j++) {
        addEdge(rowNodeIds[i], rowNodeIds[j]);
      }
    }
  }

  // Build edges array
  const edges: AssocEdge[] = [];
  for (const [key, weight] of Array.from(edgeWeight.entries())) {
    const [src, dst] = key.split("|||");
    edges.push({ source: src, target: dst, weight });
  }

  // Increment occurrences for target nodes from target cards (they may have 0 row appearances)
  for (const [, node] of Array.from(nodeMap.entries())) {
    if (node.type === "target" && node.occurrences === 0) node.occurrences = 1;
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

// ─── Governance Records ───────────────────────────────────────────────────────

export async function getGovernanceRecord(
  sheetId: number
): Promise<GovernanceRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(governanceRecords)
    .where(eq(governanceRecords.sheetId, sheetId))
    .limit(1);
  return rows[0] ?? null;
}

export interface ImageryEntry {
  cin: string;
  rowTime: string;
  type: "photo" | "video" | "";
  saved: boolean;
}

export interface GovernanceUpsertInput {
  sheetId: number;
  dueDate?: number | null;
  summaryNotification?: boolean;
  isurvCIN?: string | null;
  isurvName?: string | null;
  sentToIO?: boolean;
  sentToIOCIN?: string | null;
  sentToIOName?: string | null;
  savedAsWord?: boolean;
  savedAsWordCIN?: string | null;
  savedAsWordName?: string | null;
  savedAsPdf?: boolean;
  savedAsPdfCIN?: string | null;
  savedAsPdfName?: string | null;
  uploadedToPromis?: boolean;
  uploadedToPromisCIN?: string | null;
  uploadedToPromisName?: string | null;
  linked?: boolean;
  linkedCIN?: string | null;
  linkedName?: string | null;
  savedInOpFolder?: boolean;
  savedInOpFolderCIN?: string | null;
  savedInOpFolderName?: string | null;
  imageryTaken?: boolean;
  imageryTakenCIN?: string | null;
  imageryTakenName?: string | null;
  coverPage?: boolean;
  coverPageCIN?: string | null;
  coverPageName?: string | null;
  sheetCell?: string | null;
  imageryEntries?: ImageryEntry[];
  notes?: string | null;
}

export async function upsertGovernanceRecord(
  input: GovernanceUpsertInput
): Promise<GovernanceRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getGovernanceRecord(input.sheetId);
  const imageryJson =
    input.imageryEntries !== undefined
      ? JSON.stringify(input.imageryEntries)
      : undefined;

  if (existing) {
    await db
      .update(governanceRecords)
      .set({
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.summaryNotification !== undefined && {
          isurv: input.summaryNotification,
        }),
        ...(input.isurvCIN !== undefined && { isurvCIN: input.isurvCIN }),
        ...(input.isurvName !== undefined && { isurvName: input.isurvName }),
        ...(input.sentToIO !== undefined && { sentToIO: input.sentToIO }),
        ...(input.sentToIOCIN !== undefined && {
          sentToIOCIN: input.sentToIOCIN,
        }),
        ...(input.sentToIOName !== undefined && {
          sentToIOName: input.sentToIOName,
        }),
        ...(input.savedAsWord !== undefined && {
          savedAsWord: input.savedAsWord,
        }),
        ...(input.savedAsWordCIN !== undefined && {
          savedAsWordCIN: input.savedAsWordCIN,
        }),
        ...(input.savedAsWordName !== undefined && {
          savedAsWordName: input.savedAsWordName,
        }),
        ...(input.savedAsPdf !== undefined && { savedAsPdf: input.savedAsPdf }),
        ...(input.savedAsPdfCIN !== undefined && {
          savedAsPdfCIN: input.savedAsPdfCIN,
        }),
        ...(input.savedAsPdfName !== undefined && {
          savedAsPdfName: input.savedAsPdfName,
        }),
        ...(input.uploadedToPromis !== undefined && {
          uploadedToPromis: input.uploadedToPromis,
        }),
        ...(input.uploadedToPromisCIN !== undefined && {
          uploadedToPromisCIN: input.uploadedToPromisCIN,
        }),
        ...(input.uploadedToPromisName !== undefined && {
          uploadedToPromisName: input.uploadedToPromisName,
        }),
        ...(input.linked !== undefined && { linked: input.linked }),
        ...(input.linkedCIN !== undefined && { linkedCIN: input.linkedCIN }),
        ...(input.linkedName !== undefined && { linkedName: input.linkedName }),
        ...(input.savedInOpFolder !== undefined && {
          savedInOpFolder: input.savedInOpFolder,
        }),
        ...(input.savedInOpFolderCIN !== undefined && {
          savedInOpFolderCIN: input.savedInOpFolderCIN,
        }),
        ...(input.savedInOpFolderName !== undefined && {
          savedInOpFolderName: input.savedInOpFolderName,
        }),
        ...(input.imageryTaken !== undefined && {
          imageryTaken: input.imageryTaken,
        }),
        ...(input.imageryTakenCIN !== undefined && {
          imageryTakenCIN: input.imageryTakenCIN,
        }),
        ...(input.imageryTakenName !== undefined && {
          imageryTakenName: input.imageryTakenName,
        }),
        ...(input.coverPage !== undefined && { coverPage: input.coverPage }),
        ...(input.coverPageCIN !== undefined && {
          coverPageCIN: input.coverPageCIN,
        }),
        ...(input.coverPageName !== undefined && {
          coverPageName: input.coverPageName,
        }),
        ...(input.sheetCell !== undefined && { sheetCell: input.sheetCell }),
        ...(imageryJson !== undefined && { imageryEntries: imageryJson }),
        ...(input.notes !== undefined && { notes: input.notes }),
      })
      .where(eq(governanceRecords.sheetId, input.sheetId));
  } else {
    // Default due date: sheet createdAt + 7 days (resolved at call site if not provided)
    await db.insert(governanceRecords).values({
      sheetId: input.sheetId,
      dueDate: input.dueDate ?? null,
      isurv: input.summaryNotification ?? false,
      isurvCIN: input.isurvCIN ?? null,
      isurvName: input.isurvName ?? null,
      sentToIO: input.sentToIO ?? false,
      sentToIOCIN: input.sentToIOCIN ?? null,
      sentToIOName: input.sentToIOName ?? null,
      savedAsWord: input.savedAsWord ?? false,
      savedAsWordCIN: input.savedAsWordCIN ?? null,
      savedAsWordName: input.savedAsWordName ?? null,
      savedAsPdf: input.savedAsPdf ?? false,
      savedAsPdfCIN: input.savedAsPdfCIN ?? null,
      savedAsPdfName: input.savedAsPdfName ?? null,
      uploadedToPromis: input.uploadedToPromis ?? false,
      uploadedToPromisCIN: input.uploadedToPromisCIN ?? null,
      uploadedToPromisName: input.uploadedToPromisName ?? null,
      linked: input.linked ?? false,
      linkedCIN: input.linkedCIN ?? null,
      linkedName: input.linkedName ?? null,
      savedInOpFolder: input.savedInOpFolder ?? false,
      savedInOpFolderCIN: input.savedInOpFolderCIN ?? null,
      savedInOpFolderName: input.savedInOpFolderName ?? null,
      imageryTaken: input.imageryTaken ?? false,
      imageryTakenCIN: input.imageryTakenCIN ?? null,
      imageryTakenName: input.imageryTakenName ?? null,
      coverPage: input.coverPage ?? false,
      coverPageCIN: input.coverPageCIN ?? null,
      coverPageName: input.coverPageName ?? null,
      sheetCell: input.sheetCell ?? null,
      imageryEntries: imageryJson ?? null,
      notes: input.notes ?? null,
    });
  }
  return getGovernanceRecord(input.sheetId);
}

// ─── Governance Summary Helpers ───────────────────────────────────────────────

/** Lightweight summary of a governance record for the list view */
export interface GovernanceSummary {
  sheetId: number;
  overallPercent: number;
  isComplete: boolean;
  isOverdue: boolean;
  dueDate: number | null;
}

/**
 * Compute a governance completion % for a sheet.
 * allSigned must be passed in from the caller (it requires row/cert queries).
 */
export function computeGovernancePercent(
  rec: GovernanceRecord | null | undefined,
  allSigned: boolean
): number {
  if (!rec) return 0;

  // ── Team Leader section (2 items) ──────────────────────────────────────────
  // isurv column stores the summaryNotification value
  const tlFields: boolean[] = [
    !!rec.isurv, // Summary complete
    !!rec.sentToIO, // Sent to IO
  ];

  // ── Operative section (4 items, only countable when allSigned) ─────────────
  // If not all signed, these are all blocked — count them as incomplete
  const opFields: boolean[] = [
    allSigned && !!rec.savedAsWord,
    allSigned && !!rec.savedAsPdf,
    allSigned && !!rec.uploadedToPromis,
    allSigned && !!rec.savedInOpFolder,
  ];

  // ── Imagery section ────────────────────────────────────────────────────────
  // Derive imageryTaken from sheetCins (client-side) — server stores it in imageryEntries JSON
  // If no imagery was taken (no entries with a CIN), exclude imagery from the total
  let imageryFields: boolean[] = [];
  let entries: { cin?: string; saved?: boolean }[] = [];
  try {
    entries = JSON.parse(rec.imageryEntries ?? "[]");
  } catch {
    entries = [];
  }
  // Only count imagery if at least one entry has a real CIN (blank placeholder rows are ignored)
  const realEntries = entries.filter(e => e.cin && e.cin.trim() !== "");
  const hasImagery = realEntries.length > 0;
  if (hasImagery) {
    imageryFields = realEntries.map(e => !!e.saved);
  }
  // If no real imagery entries, imagery section is N/A — not counted

  const allFields = [...tlFields, ...opFields, ...imageryFields];
  if (allFields.length === 0) return 0;
  return Math.round(
    (allFields.filter(Boolean).length / allFields.length) * 100
  );
}

/** Returns all governance records for a list of sheet IDs */
export async function getGovernanceRecordsBySheetIds(
  sheetIds: number[]
): Promise<GovernanceRecord[]> {
  if (sheetIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const { inArray } = await import("drizzle-orm");
  return db
    .select()
    .from(governanceRecords)
    .where(inArray(governanceRecords.sheetId, sheetIds));
}

/**
 * Returns outstanding governance to-do items for a given CIN.
 * - If the CIN is the Team Leader on a sheet: returns TL items (summaryNotification, sentToIO) that are incomplete.
 * - If the CIN is the Author on a sheet: returns Operative items (savedAsWord, savedAsPdf, uploadedToPromis, savedInOpFolder)
 *   that are incomplete AND the sheet is fully certified.
 * allSigned is computed inline per sheet.
 */
export async function getGovernanceTodoForCin(cin: string): Promise<
  {
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    role: "teamLeader" | "author";
    outstanding: string[];
    allSigned: boolean;
    govPercent?: number;
  }[]
> {
  const db = await getDb();
  if (!db) return [];

  // Find all sheets where this CIN is TL or Author (stored in sheetCins JSON)
  // Exclude soft-deleted sheets so they don't appear in governance to-do
  const allSheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  const relevantSheets = allSheets.filter(s => {
    try {
      const cins: {
        cin: string;
        isTeamLeader?: boolean;
        isAuthor?: boolean;
      }[] = JSON.parse(s.sheetCins ?? "[]");
      return cins.some(c => c.cin === cin && (c.isTeamLeader || c.isAuthor));
    } catch {
      return false;
    }
  });
  if (relevantSheets.length === 0) return [];

  const opIds = Array.from(new Set(relevantSheets.map(s => s.operationId)));

  const [ops, govRecords] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    getGovernanceRecordsBySheetIds(relevantSheets.map(s => s.id)),
  ]);

  // Only process sheets whose operation still exists
  const validOpIds = new Set(ops.map(o => o.id));
  const validSheets = relevantSheets.filter(s => validOpIds.has(s.operationId));
  if (validSheets.length === 0) return [];

  // Compute allSigned per sheet
  const results: Awaited<ReturnType<typeof getGovernanceTodoForCin>> = [];

  for (const sheet of validSheets) {
    const rows = await getRowsBySheetId(sheet.id);
    const rowIds = rows.map(r => r.id);
    const [members, certs] = await Promise.all([
      getMembersByRowIds(rowIds),
      getCertificationsByRowIds(rowIds),
    ]);
    const allSigned =
      rows.length > 0 &&
      rows.every(r => {
        const rowMems = members.filter(m => m.rowId === r.id);
        return (
          rowMems.length > 0 &&
          rowMems.every(m =>
            certs.some(
              c => c.rowId === r.id && c.memberId === m.id && c.isActive
            )
          )
        );
      });

    const rec = govRecords.find(g => g.sheetId === sheet.id);
    const op = ops.find(o => o.id === sheet.operationId);
    const cinList: {
      cin: string;
      isTeamLeader?: boolean;
      isAuthor?: boolean;
    }[] = (() => {
      try {
        return JSON.parse(sheet.sheetCins ?? "[]");
      } catch {
        return [];
      }
    })();
    const cinEntry = cinList.find(c => c.cin === cin);

    if (cinEntry?.isTeamLeader) {
      const outstanding: string[] = [];
      if (!rec?.isurv) outstanding.push("Summary complete");
      if (!rec?.sentToIO) outstanding.push("Sent to IO");

      // "Ready to close" notification: always shown for open sheets (Team Leader must close)
      const govPercent = computeGovernancePercent(rec ?? null, allSigned);
      if (!sheet.closedAt) {
        outstanding.push("Ready to close");
      }

      if (outstanding.length > 0) {
        results.push({
          sheetId: sheet.id,
          sheetTitle: sheet.title,
          operationId: sheet.operationId,
          operationName: op?.name ?? "Unknown",
          role: "teamLeader",
          outstanding,
          allSigned,
          govPercent,
        });
      }
    }

    if (cinEntry?.isAuthor) {
      // Operative items only actionable once sheet is fully certified
      const outstanding: string[] = [];
      if (allSigned) {
        if (!rec?.savedAsWord) outstanding.push("Saved as Word document");
        if (!rec?.savedAsPdf) outstanding.push("Saved as PDF");
        if (!rec?.uploadedToPromis) outstanding.push("Uploaded to PROMIS");
        if (!rec?.savedInOpFolder)
          outstanding.push("Saved in Operation folder");
        // Check imagery entries — any unsaved imagery rows are outstanding for the author
        if (rec?.imageryEntries) {
          try {
            const entries: { saved?: boolean }[] = JSON.parse(
              rec.imageryEntries
            );
            const unsavedCount = entries.filter(e => !e.saved).length;
            if (unsavedCount > 0) {
              outstanding.push(
                `${unsavedCount} imagery entr${unsavedCount === 1 ? "y" : "ies"} not saved`
              );
            }
          } catch {
            /* ignore parse errors */
          }
        }
      } else {
        // Sheet not yet fully certified — flag it as pending certification
        outstanding.push("Sheet not fully certified");
      }
      if (outstanding.length > 0) {
        results.push({
          sheetId: sheet.id,
          sheetTitle: sheet.title,
          operationId: sheet.operationId,
          operationName: op?.name ?? "Unknown",
          role: "author",
          outstanding,
          allSigned,
        });
      }
    }
  }

  return results;
}

/**
 * Returns running sheets authored by this CIN that have one or more photo
 * attachments not yet linked to an Intelligence entity — surfaced to the
 * author as a To-Do item so photos don't get left unlinked.
 */
export async function getUnlinkedImagesTodoForCin(cin: string): Promise<
  {
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    unlinkedCount: number;
  }[]
> {
  const db = await getDb();
  if (!db) return [];

  const allSheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  const authoredSheets = allSheets.filter(s => {
    try {
      const cins: { cin: string; isAuthor?: boolean }[] = JSON.parse(
        s.sheetCins ?? "[]"
      );
      return cins.some(c => c.cin === cin && c.isAuthor);
    } catch {
      return false;
    }
  });
  if (authoredSheets.length === 0) return [];

  const opIds = Array.from(new Set(authoredSheets.map(s => s.operationId)));
  const ops = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, opIds));
  const validOpIds = new Set(ops.map(o => o.id));
  const validSheets = authoredSheets.filter(s => validOpIds.has(s.operationId));
  if (validSheets.length === 0) return [];

  const results: Awaited<ReturnType<typeof getUnlinkedImagesTodoForCin>> = [];

  for (const sheet of validSheets) {
    const rows = await getRowsBySheetId(sheet.id);
    const rowIds = rows.map(r => r.id);
    const attachments = await getAttachmentsByRowIds(rowIds);
    if (attachments.length === 0) continue;
    const withLinkCounts = await attachLinkedCounts(db, attachments);
    const unlinkedCount = withLinkCounts.filter(
      a => a.linkedCount === 0
    ).length;
    if (unlinkedCount === 0) continue;

    const op = ops.find(o => o.id === sheet.operationId);
    results.push({
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      operationId: sheet.operationId,
      operationName: op?.name ?? "Unknown",
      unlinkedCount,
    });
  }

  return results;
}

// ─── Sheet Summary ──────────────────────────────────────────────────────────

export async function getSheetSummary(
  sheetId: number
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sheetSummaries)
    .where(eq(sheetSummaries.sheetId, sheetId))
    .limit(1);
  return rows[0] ?? null;
}

export interface SheetSummaryUpsertInput {
  sheetId: number;
  teamLabel?: string | null;
  teamCins?: string | null;
  operationName?: string | null;
  dayDate?: string | null;
  startTime?: string | null;
  finishTime?: string | null;
  targetName?: string | null;
  location?: string | null;
  dismissedVehicleKeys?: string | null;
  ioSupport?: string | null;
  intelSupport?: string | null;
  specialProjects?: string | null;
  ioContactTiming?: string | null;
  ioContactMethod?: string | null;
  objectives?: string | null;
  criticalDecisions?: string | null;
  issues?: string | null;
  lastEditedByCIN?: string | null;
}

export async function upsertSheetSummary(
  input: SheetSummaryUpsertInput
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getSheetSummary(input.sheetId);
  const { sheetId, ...fields } = input;

  if (existing) {
    const patch: Partial<InsertSheetSummary> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (patch as any)[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(sheetSummaries)
        .set(patch)
        .where(eq(sheetSummaries.sheetId, sheetId));
    }
  } else {
    await db.insert(sheetSummaries).values({ sheetId, ...fields });
  }
  return getSheetSummary(sheetId);
}

/** Locks the summary — sets completedAt/completedByCIN, clears any prior reopen record. */
export async function completeSheetSummary(
  sheetId: number,
  cin: string
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(sheetSummaries)
    .set({
      completedAt: Date.now(),
      completedByCIN: cin,
      reopenedAt: null,
      reopenedByCIN: null,
    })
    .where(eq(sheetSummaries.sheetId, sheetId));
  return getSheetSummary(sheetId);
}

/** Unlocks the summary — clears completedAt/completedByCIN, stamps who reopened it. */
export async function reopenSheetSummary(
  sheetId: number,
  cin: string
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(sheetSummaries)
    .set({
      completedAt: null,
      completedByCIN: null,
      reopenedAt: Date.now(),
      reopenedByCIN: cin,
    })
    .where(eq(sheetSummaries.sheetId, sheetId));
  return getSheetSummary(sheetId);
}

/** Sort CINs ascending by their numeric portion (e.g. "QA1" < "TA01" < "BS12"); falls back to plain string compare when neither has digits. */
export function sortCinsNumerically(cins: string[]): string[] {
  return [...cins].sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10);
    const nb = parseInt(b.replace(/\D/g, ""), 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

/** Team-leader-first, then ascending-numeric-CIN ordering for the Summary tab's Team Members field. */
export function orderTeamCins(
  sheetCins: { cin: string; isTeamLeader?: boolean }[]
): string[] {
  const leaders = sheetCins.filter(c => c.isTeamLeader).map(c => c.cin);
  const others = sheetCins.filter(c => !c.isTeamLeader).map(c => c.cin);
  return [...sortCinsNumerically(leaders), ...sortCinsNumerically(others)];
}

/** Location for the Summary tab: the RS row whose observation mentions "surveillance commenced" — an address entity extracted from it if found, otherwise the raw row text. Null if no such row exists. */
export function extractSummaryLocation(
  rows: { observation: string | null }[]
): string | null {
  const row = rows.find(r =>
    (r.observation ?? "").toLowerCase().includes("surveillance commenced")
  );
  if (!row?.observation) return null;
  const entities = extractEntitiesFromText(row.observation);
  const address = entities.find(e => e.type === "address");
  return address
    ? address.shortForm || address.fullDescription
    : row.observation;
}

export interface SheetSummaryVehicle {
  key: string;
  label: string;
}

/** Vehicles for the Summary tab: Target Registry vehicles (v1f/v1, v2f/v2, extraVehicles) plus vehicles mentioned in RS row text, minus any the supervisor has dismissed. Always computed live, never stored. */
export function computeSheetSummaryVehicles(
  target:
    | {
        v1f: string | null;
        v1: string | null;
        v2f: string | null;
        v2: string | null;
        extraVehicles: string | null;
      }
    | null
    | undefined,
  rows: { observation: string | null }[],
  dismissedKeys: string[]
): SheetSummaryVehicle[] {
  const vehicles: SheetSummaryVehicle[] = [];
  const seen = new Set<string>();
  const add = (key: string, label: string) => {
    const normalized = label.trim().toLowerCase();
    if (!label.trim() || seen.has(normalized)) return;
    seen.add(normalized);
    vehicles.push({ key, label: label.trim() });
  };

  if (target) {
    const v1 = target.v1f?.trim() || target.v1?.trim();
    if (v1) add("target:v1", v1);
    const v2 = target.v2f?.trim() || target.v2?.trim();
    if (v2) add("target:v2", v2);
    if (target.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          target.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const label = ev.full?.trim() || ev.short?.trim();
          if (label) add(`target:extra${idx}`, label);
        });
      } catch {
        // ignore malformed JSON
      }
    }
  }

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    for (const e of entities) {
      if (e.type !== "vehicle") continue;
      const label = e.shortForm || e.fullDescription;
      if (!label) continue;
      add(`rs:${label.trim().toLowerCase()}`, label);
    }
  }

  const dismissed = new Set(dismissedKeys);
  return vehicles.filter(v => !dismissed.has(v.key));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strips the trailing "(ShortForm)" bracket for location/address entity mentions — the shortform duplicates what's already stated in the surrounding text. */
function stripLocationBrackets(
  text: string,
  entities: ReturnType<typeof extractEntitiesFromText>
): string {
  let result = text;
  for (const e of entities) {
    if (e.type !== "address" || !e.shortForm) continue;
    result = result.replace(
      new RegExp(`\\s*\\(${escapeRegExp(e.shortForm)}\\)`, "g"),
      ""
    );
  }
  return result;
}

/**
 * Splits one RS row into the Summary line's three fields — time, location,
 * and just the "what happened" text — kept separate (rather than
 * concatenated into one string) so the PDF export can render them as
 * distinct Time / Address / Observation table columns without the address
 * being duplicated inside the observation text.
 */
function buildSummaryEntryFields(row: {
  time: string | null;
  observation: string | null;
}): { text: string; location: string | null } {
  const raw = row.observation ?? "";
  const entities = extractEntitiesFromText(raw);
  const location = entities.find(e => e.type === "address");

  return {
    text: stripLocationBrackets(raw, entities),
    location: location ? location.shortForm || location.fullDescription : null,
  };
}

/**
 * Returns the Summary tab's per-row entry list, first append-only syncing in
 * any RS rows that don't have an entry yet. Existing entries (including ones
 * the supervisor has edited or soft-deleted) are never touched or regenerated.
 *
 * "Travelled Via" rows — a row containing "continued via:" (the street/road
 * list, whether inline or on its own) and, where present, the paired row
 * immediately after it ending in "whereat" (the same convention used to
 * exclude these from Court Statements, see routers.ts's
 * statement.previewData) — are skipped when first creating a line for a row.
 * That check is never re-applied to a line that already exists: if an edit
 * later makes a row's text happen to match the pattern, the existing line is
 * still kept and just updated normally — a line only disappears here if its
 * row is genuinely gone (deleted or blanked).
 *
 * While the summary is marked complete, none of this runs at all — no new
 * lines are added and no existing ones are refreshed, even if RS rows keep
 * changing. Reopening the summary resumes syncing from where it left off.
 */
export async function getSheetSummaryEntries(
  sheetId: number
): Promise<SheetSummaryEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const summary = await getSheetSummary(sheetId);
  const isComplete = !!summary?.completedAt;

  const allRows = await getRowsBySheetId(sheetId);
  // Rows with real content — used for sort order and for deciding whether an
  // existing line's row is still genuinely there, regardless of Travelled
  // Via classification (that classification only ever gates new inserts).
  const contentRows = allRows.filter(r => (r.observation ?? "").trim());
  const contentRowById = new Map(contentRows.map(r => [r.id, r]));

  const travelledViaRowIds = new Set<number>();
  for (let i = 0; i < allRows.length; i++) {
    const obs = (allRows[i].observation ?? "").toLowerCase();
    if (obs.includes("continued via:")) {
      travelledViaRowIds.add(allRows[i].id);
      const next = allRows[i + 1];
      if (next && /whereat$/i.test((next.observation ?? "").trim())) {
        travelledViaRowIds.add(next.id);
      }
    }
  }

  const existing = await db
    .select()
    .from(sheetSummaryEntries)
    .where(eq(sheetSummaryEntries.sheetId, sheetId));

  let all = existing;

  if (!isComplete) {
    const existingRowIds = new Set(existing.map(e => e.rowId));
    const missing = contentRows.filter(
      r => !travelledViaRowIds.has(r.id) && !existingRowIds.has(r.id)
    );
    if (missing.length > 0) {
      await db.insert(sheetSummaryEntries).values(
        missing.map(r => {
          const fields = buildSummaryEntryFields(r);
          return {
            sheetId,
            rowId: r.id,
            text: fields.text,
            location: fields.location,
            time: r.time,
            timeMinutes: r.timeMinutes,
          };
        })
      );
      all = await db
        .select()
        .from(sheetSummaryEntries)
        .where(eq(sheetSummaryEntries.sheetId, sheetId));
    }

    // Keep unedited row-linked lines synced with their source row — editing
    // an RS row (e.g. adding a vehicle mention) should flow through to a
    // Summary line the supervisor hasn't touched. A line that's been edited
    // stays exactly as the supervisor left it, no matter what happens to the
    // row afterward.
    const pendingUpdates: Promise<unknown>[] = [];
    all = all.map(e => {
      if (e.edited || e.rowId == null) return e;
      const row = contentRowById.get(e.rowId);
      if (!row) {
        if (e.deleted) return e;
        pendingUpdates.push(
          db
            .update(sheetSummaryEntries)
            .set({ deleted: true })
            .where(eq(sheetSummaryEntries.id, e.id))
        );
        return { ...e, deleted: true };
      }
      const fields = buildSummaryEntryFields(row);
      const changed =
        fields.text !== e.text ||
        fields.location !== e.location ||
        row.time !== e.time ||
        row.timeMinutes !== e.timeMinutes;
      if (!changed) return e;
      pendingUpdates.push(
        db
          .update(sheetSummaryEntries)
          .set({
            text: fields.text,
            location: fields.location,
            time: row.time,
            timeMinutes: row.timeMinutes,
          })
          .where(eq(sheetSummaryEntries.id, e.id))
      );
      return {
        ...e,
        text: fields.text,
        location: fields.location,
        time: row.time,
        timeMinutes: row.timeMinutes,
      };
    });
    if (pendingUpdates.length > 0) await Promise.all(pendingUpdates);
  }

  const rowOrder = new Map(contentRows.map((r, idx) => [r.id, idx]));
  // Row-linked lines sort by their source row's position. Manually-added
  // lines (rowId null) with no time yet sort above everything else, newest
  // first — "adds the row to the top and stays there until a time is
  // added" — via a negative key derived from id (higher id = added later =
  // more negative = further toward the top). Once a manual line has a time,
  // it's slotted in among the row-linked lines by comparing that time
  // against each row's own time.
  const sortKey = (e: SheetSummaryEntry): number => {
    if (e.rowId != null) {
      return rowOrder.has(e.rowId)
        ? rowOrder.get(e.rowId)!
        : contentRows.length + e.id;
    }
    if (e.timeMinutes == null) return -1 - e.id;
    let idx = 0;
    for (const r of contentRows) {
      if (r.timeMinutes != null && r.timeMinutes <= e.timeMinutes) idx++;
      else break;
    }
    return idx - 0.5;
  };
  return all.filter(e => !e.deleted).sort((a, b) => sortKey(a) - sortKey(b));
}

/** Adds a blank, manually-added summary line (not tied to any RS row) for additional information the supervisor wants to note. */
export async function addManualSheetSummaryEntry(
  sheetId: number
): Promise<SheetSummaryEntry | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db
    .insert(sheetSummaryEntries)
    .values({ sheetId, rowId: null, text: "" });
  const [row] = await db
    .select()
    .from(sheetSummaryEntries)
    .where(eq(sheetSummaryEntries.id, result.insertId as number))
    .limit(1);
  return row ?? null;
}

export async function updateSheetSummaryEntry(
  id: number,
  text: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetSummaryEntries)
    .set({ text, edited: true })
    .where(eq(sheetSummaryEntries.id, id));
}

/** Sets a manually-added summary line's time, which is what lets it sort into place among the row-linked lines instead of staying pinned at the top. */
export async function setSheetSummaryEntryTime(
  id: number,
  time: string,
  timeMinutes: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetSummaryEntries)
    .set({ time, timeMinutes })
    .where(eq(sheetSummaryEntries.id, id));
}

export async function deleteSheetSummaryEntry(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetSummaryEntries)
    .set({ deleted: true })
    .where(eq(sheetSummaryEntries.id, id));
}

/** Previously-used IO/Intel support names for the same Operation, for the Summary tab's autocomplete. */
export async function getSheetSummarySupportHistory(
  operationId: number,
  field: "ioSupport" | "intelSupport"
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      value:
        field === "ioSupport"
          ? sheetSummaries.ioSupport
          : sheetSummaries.intelSupport,
    })
    .from(sheetSummaries)
    .innerJoin(runningSheets, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(eq(runningSheets.operationId, operationId));

  const names = new Set<string>();
  for (const r of rows) {
    if (!r.value) continue;
    for (const name of r.value.split(",")) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * The most recently-created summary on the same Operation (excluding this
 * sheet), used to carry forward Investigator, Intel Support, Special
 * Projects, and Objectives into a newly-created summary. Everything else
 * (Location, Team, Target, the Communication section, Critical Decisions,
 * Issues) starts blank/derived fresh per the supervisor's spec.
 */
export async function getMostRecentSheetSummaryForOperation(
  operationId: number,
  excludeSheetId: number
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ summary: sheetSummaries })
    .from(sheetSummaries)
    .innerJoin(runningSheets, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(
      and(
        eq(runningSheets.operationId, operationId),
        sql`${runningSheets.id} != ${excludeSheetId}`
      )
    )
    .orderBy(desc(runningSheets.createdAt))
    .limit(1);
  return rows[0]?.summary ?? null;
}

// ─── Target Shortcuts ─────────────────────────────────────────────────────────

export async function getTargetShortcuts(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(targetShortcuts)
    .where(eq(targetShortcuts.targetId, targetId));
}

export async function createTargetShortcut(data: InsertTargetShortcut) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targetShortcuts).values(data);
  return { id: (result as { insertId: number }).insertId };
}

export async function updateTargetShortcut(
  id: number,
  data: Partial<Pick<InsertTargetShortcut, "trigger" | "expansion">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targetShortcuts).set(data).where(eq(targetShortcuts.id, id));
  return { id };
}

export async function deleteTargetShortcut(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(targetShortcuts).where(eq(targetShortcuts.id, id));
}

export async function getTargetShortcutsForSheet(sheetId: number) {
  // Returns target shortcuts for the target assigned to the given sheet
  const db = await getDb();
  if (!db) return [];
  const sheet = await db
    .select({ targetId: runningSheets.targetId })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet[0]?.targetId) return [];
  return db
    .select()
    .from(targetShortcuts)
    .where(eq(targetShortcuts.targetId, sheet[0].targetId));
}

// ─── WIPC Vault Helpers ───────────────────────────────────────────────────────
// All sensitive fields are encrypted/decrypted via wipcVault.ts (AES-256-GCM).
// These helpers are called only from server-side procedures with admin guards.

const WIPC_MEMBER_FIELDS = [
  "fullName",
  "dob",
  "afpId",
  "cinNumber",
  "aiInitials",
  "aiKnownAs",
] as const;
const WIPC_OFFICER_FIELDS = [
  "fullName",
  "afpId",
  "workLocation",
  "portfolio",
  "contactNumber",
] as const;

function encryptMember(m: Record<string, unknown>): Record<string, unknown> {
  const out = { ...m };
  for (const f of WIPC_MEMBER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultEncrypt(out[f] as string);
  }
  return out;
}

function decryptMember(m: Record<string, unknown>): Record<string, unknown> {
  const out = { ...m };
  for (const f of WIPC_MEMBER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultDecrypt(out[f] as string);
  }
  return out;
}

function encryptOfficer(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o };
  for (const f of WIPC_OFFICER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultEncrypt(out[f] as string);
  }
  return out;
}

function decryptOfficer(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o };
  for (const f of WIPC_OFFICER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultDecrypt(out[f] as string);
  }
  return out;
}

/** Write an entry to the WIPC audit log */
export async function createWipcAuditEntry(data: {
  userId: number;
  action: string;
  targetId?: number;
  detail?: string;
  ipAddress?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(wipcAuditLog).values({
    userId: data.userId,
    action: data.action,
    targetId: data.targetId ?? null,
    detail: data.detail ?? null,
    ipAddress: data.ipAddress ?? null,
  });
}

/** Get all WIPC audit log entries (admin only) */
export async function getWipcAuditLog(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(wipcAuditLog)
    .orderBy(desc(wipcAuditLog.createdAt))
    .limit(limit);
}

/** Save or update the requesting officer profile for a user (encrypted) */
export async function upsertWipcOfficerProfile(
  userId: number,
  data: {
    fullName: string;
    afpId: string;
    workLocation?: string;
    portfolio?: string;
    contactNumber?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptOfficer({ ...data }) as typeof data;
  const existing = await db
    .select({ id: wipcOfficerProfiles.id })
    .from(wipcOfficerProfiles)
    .where(eq(wipcOfficerProfiles.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(wipcOfficerProfiles)
      .set({ ...encrypted, updatedAt: new Date() })
      .where(eq(wipcOfficerProfiles.userId, userId));
  } else {
    await db.insert(wipcOfficerProfiles).values({
      userId,
      fullName: encrypted.fullName as string,
      afpId: encrypted.afpId as string,
      workLocation: encrypted.workLocation as string | undefined,
      portfolio: encrypted.portfolio as string | undefined,
      contactNumber: encrypted.contactNumber as string | undefined,
    });
  }
}

/** Get the requesting officer profile for a user (decrypted) */
export async function getWipcOfficerProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(wipcOfficerProfiles)
    .where(eq(wipcOfficerProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  return decryptOfficer(
    row as unknown as Record<string, unknown>
  ) as unknown as WipcOfficerProfile;
}

/** List all WIPC members (decrypted) — admin only */
export async function listWipcMembers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(wipcMembers)
    .orderBy(wipcMembers.createdAt);
  return rows.map(
    r =>
      decryptMember(
        r as unknown as Record<string, unknown>
      ) as unknown as WipcMemberRecord
  );
}

/** Save a new WIPC member (encrypted) — admin only */
export async function createWipcMember(
  createdBy: number,
  data: {
    fullName: string;
    dob?: string;
    afpId: string;
    cinNumber?: string;
    aiInitials?: string;
    aiKnownAs?: string;
    isUco?: boolean;
    isOco?: boolean;
    isCin?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  const [result] = await db.insert(wipcMembers).values({
    createdBy,
    fullName: encrypted.fullName as string,
    afpId: encrypted.afpId as string,
    dob: encrypted.dob as string | undefined,
    cinNumber: encrypted.cinNumber as string | undefined,
    aiInitials: encrypted.aiInitials as string | undefined,
    aiKnownAs: encrypted.aiKnownAs as string | undefined,
    isUco: data.isUco ?? false,
    isOco: data.isOco ?? false,
    isCin: data.isCin ?? true,
  });
  return result;
}

/** Update an existing WIPC member (encrypted) — admin only */
export async function updateWipcMember(
  id: number,
  data: Partial<{
    fullName: string;
    dob: string;
    afpId: string;
    cinNumber: string;
    aiInitials: string;
    aiKnownAs: string;
    isUco: boolean;
    isOco: boolean;
    isCin: boolean;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  await db
    .update(wipcMembers)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(wipcMembers.id, id));
}

/** Delete a WIPC member — admin only */
export async function deleteWipcMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(wipcMembers).where(eq(wipcMembers.id, id));
}

// ─── Recycle Bin ─────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type RecycleBinItem = {
  id: number;
  type: "operation" | "sheet" | "target" | "map_marker" | "attachment";
  label: string;
  sublabel?: string;
  deletedAt: number;
  deletedByCIN: string | null;
  expiresAt: number;
  // For reinstate context
  operationId?: number | null;
  operationName?: string | null;
};

export async function getRecycleBinItems(): Promise<RecycleBinItem[]> {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_MS;
  const items: RecycleBinItem[] = [];

  // Deleted operations (not yet permanently purged)
  const deletedOps = await db
    .select()
    .from(operations)
    .where(
      and(
        isNotNull(operations.deletedAt),
        sql`${operations.deletedAt} > ${cutoff}`
      )
    );
  for (const op of deletedOps) {
    items.push({
      id: op.id,
      type: "operation",
      label: op.name,
      sublabel: op.investigationUnit ?? undefined,
      deletedAt: op.deletedAt!,
      deletedByCIN: op.deletedByCIN ?? null,
      expiresAt: op.deletedAt! + SEVEN_DAYS_MS,
    });
  }

  // Deleted running sheets
  const deletedSheets = await db
    .select({
      id: runningSheets.id,
      title: runningSheets.title,
      operationId: runningSheets.operationId,
      operationName: operations.name,
      deletedAt: runningSheets.deletedAt,
      deletedByCIN: runningSheets.deletedByCIN,
    })
    .from(runningSheets)
    .leftJoin(operations, eq(runningSheets.operationId, operations.id))
    .where(
      and(
        isNotNull(runningSheets.deletedAt),
        sql`${runningSheets.deletedAt} > ${cutoff}`
      )
    );
  for (const s of deletedSheets) {
    items.push({
      id: s.id,
      type: "sheet",
      label: s.title,
      sublabel: s.operationName ?? undefined,
      deletedAt: s.deletedAt!,
      deletedByCIN: s.deletedByCIN ?? null,
      expiresAt: s.deletedAt! + SEVEN_DAYS_MS,
      operationId: s.operationId,
      operationName: s.operationName,
    });
  }

  // Deleted targets
  const deletedTargets = await db
    .select()
    .from(targets)
    .where(
      and(isNotNull(targets.deletedAt), sql`${targets.deletedAt} > ${cutoff}`)
    );
  for (const t of deletedTargets) {
    items.push({
      id: t.id,
      type: "target",
      label: t.name,
      sublabel: t.tgt ? `TGT: ${t.tgt}` : undefined,
      deletedAt: t.deletedAt!,
      deletedByCIN: t.deletedByCIN ?? null,
      expiresAt: t.deletedAt! + SEVEN_DAYS_MS,
    });
  }

  // Deleted custom map markers
  const deletedMarkers = await db
    .select()
    .from(customMapMarkers)
    .where(
      and(
        isNotNull(customMapMarkers.deletedAt),
        sql`${customMapMarkers.deletedAt} > ${cutoff}`
      )
    );
  for (const m of deletedMarkers) {
    items.push({
      id: m.id,
      type: "map_marker",
      label: m.label ?? `Marker at ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`,
      sublabel: m.address ?? undefined,
      deletedAt: m.deletedAt!,
      deletedByCIN: m.deletedByCIN ?? null,
      expiresAt: m.deletedAt! + SEVEN_DAYS_MS,
    });
  }

  // Deleted photo attachments
  const deletedAttachments = await db
    .select({
      id: rowAttachments.id,
      deletedAt: rowAttachments.deletedAt,
      deletedByCIN: rowAttachments.deletedByCIN,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      rowTime: sheetRows.time,
      operationId: runningSheets.operationId,
      operationName: operations.name,
    })
    .from(rowAttachments)
    .innerJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .innerJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .leftJoin(operations, eq(runningSheets.operationId, operations.id))
    .where(
      and(
        isNotNull(rowAttachments.deletedAt),
        sql`${rowAttachments.deletedAt} > ${cutoff}`
      )
    );
  for (const a of deletedAttachments) {
    items.push({
      id: a.id,
      type: "attachment",
      label: `Photo — ${a.sheetTitle}`,
      sublabel: a.rowTime
        ? `${a.operationName ?? ""} · ${a.rowTime}`
        : (a.operationName ?? undefined),
      deletedAt: a.deletedAt!,
      deletedByCIN: a.deletedByCIN ?? null,
      expiresAt: a.deletedAt! + SEVEN_DAYS_MS,
      operationId: a.operationId,
      operationName: a.operationName,
    });
  }

  // Sort newest deleted first
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function reinstateOperation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(operations)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(operations.id, id));
}

export async function reinstateSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(runningSheets)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(runningSheets.id, id));
}

export async function reinstateTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(targets)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(targets.id, id));
}

export async function purgeExpiredRecycleBinItems() {
  const db = await getDb();
  if (!db) return;
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  // Permanently delete expired operations (cascade sheets first)
  const expiredOps = await db
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        isNotNull(operations.deletedAt),
        sql`${operations.deletedAt} <= ${cutoff}`
      )
    );
  for (const op of expiredOps) {
    await deleteOperation(op.id);
  }
  // Permanently delete expired sheets
  const expiredSheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(
      and(
        isNotNull(runningSheets.deletedAt),
        sql`${runningSheets.deletedAt} <= ${cutoff}`
      )
    );
  for (const s of expiredSheets) {
    await deleteRunningSheet(s.id);
  }
  // Permanently delete expired targets
  const expiredTargets = await db
    .select({ id: targets.id })
    .from(targets)
    .where(
      and(isNotNull(targets.deletedAt), sql`${targets.deletedAt} <= ${cutoff}`)
    );
  for (const t of expiredTargets) {
    await deleteTarget(t.id);
  }
  // Permanently delete expired photo attachments
  const expiredAttachments = await db
    .select({ id: rowAttachments.id })
    .from(rowAttachments)
    .where(
      and(
        isNotNull(rowAttachments.deletedAt),
        sql`${rowAttachments.deletedAt} <= ${cutoff}`
      )
    );
  for (const a of expiredAttachments) {
    await deleteRowAttachment(a.id);
  }
}

// ─── Intelligence Profile Queries ─────────────────────────────────────────────
// Correct association logic: an entity is an "operational associate" of a target
// ONLY if it appears in an observation row on a running sheet where that target
// is the LINKED TARGET (runningSheets.targetId = target.id).
// Co-membership in the same operation is NOT sufficient.

export interface IntelProfileEntity {
  id: string;
  label: string;
  type: "target" | "person" | "vehicle" | "address" | "business";
  targetId?: number;
  sheetIds: number[];
  operationIds: number[];
  rowCount: number;
  /** Only populated on the Operation profile — photos linked to this entity. */
  photos?: OperationEntityPhoto[];
  /** True when this vehicle/location matches a value superseded by a target-merge (see target_field_history). */
  isPrevious?: boolean;
}

export interface IntelTargetProfile {
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  v2f: string | null;
  v2: string | null;
  /** Extra vehicles beyond V1: JSON array of {full: string, short: string} */
  extraVehicles: string | null;
  dep: string | null;
  arr: string | null;
  operations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  observationCount: number;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
}

export interface IntelOperationProfile {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  linkedSheets: Array<{
    id: number;
    title: string;
    targetId: number | null;
    targetName: string | null;
  }>;
  targets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    dep: string | null;
    arr: string | null;
    linkedSheets: Array<{ id: number; title: string }>;
    assocPersons: IntelProfileEntity[];
    assocVehicles: IntelProfileEntity[];
    assocLocations: IntelProfileEntity[];
    photos: OperationEntityPhoto[];
  }>;
}

export interface IntelAssociateProfile {
  label: string;
  type: "person" | "business";
  linkedTargets: Array<{
    targetId: number;
    name: string;
    operationId: number;
    operationName: string;
  }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocLocations: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
}

export interface IntelVehicleProfile {
  label: string;
  firstObservation: string | null;
  linkedTarget: { targetId: number; name: string } | null;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  /** True when this vehicle itself matches a value superseded by a target-merge. */
  isPrevious?: boolean;
}

export interface IntelLocationProfile {
  label: string;
  linkedTargets: Array<{ targetId: number; name: string }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  /** True when this location itself matches a value superseded by a target-merge. */
  isPrevious?: boolean;
}

// A target's registered name is often followed by descriptive detail
// ("JOHN SMITH, born 1 Jan 1980") — take everything before the first comma
// as the "core" name to compare against observation-derived person entities.
function targetCoreName(name: string): string {
  const commaIdx = name.indexOf(",");
  return (commaIdx > 0 ? name.slice(0, commaIdx) : name).trim().toLowerCase();
}

// ─── "Previous" entity propagation (target-merge history) ─────────────────
// A vehicle/address superseded during a duplicate-target merge (see
// mergeTargetFieldDetails) should read as "Previous" everywhere it shows up
// as an associated-entity chip across Intelligence profiles, not just on
// the target's own Registered Details — otherwise the same real vehicle/
// address can appear both "current" and unmarked-stale elsewhere, which is
// exactly the confusion this is meant to prevent. Matching is by
// registration (vehicles) / normalized address core (locations) rather
// than exact string equality, since the free-text entity mined from an
// observation rarely matches the manually-typed V1F/HBF field byte-for-byte.

const VEHICLE_REGO_PATTERN = /\b\d[A-Za-z]{2,3}\d{3}\b/;

function extractRegoUpper(text: string): string | null {
  const m = text.match(VEHICLE_REGO_PATTERN);
  return m ? m[0].toUpperCase() : null;
}

// Normalizes down to just the street segment (house number + street name),
// dropping suburb/state/postcode/bracket-code — so a manually-typed HBF value
// ("6 Shearman Street, ATTADALE WA (6 Shearman Street)") and a free-text
// entity mined from an observation ("6 Shearman Street, ATTADALE" or just
// "6 Shearman Street") reduce to the same comparable core regardless of which
// optional parts either side happens to include.
function addressCoreLower(text: string): string {
  // Prefer the canonical bracket short-form when present (mirrors the
  // client's extractShortAddress) — it's just the street, no suburb/state.
  const bracketMatch = text.match(/\(([^)]{1,120})\)\s*$/);
  const base = bracketMatch ? bracketMatch[1] : text;
  return base
    .replace(/,?\s*(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s*\d{0,4}\s*$/i, "")
    .replace(
      /^(?:unit|lot|apt|apartment|suite|ste)\s*\d+[a-z]?[,\s]*|^\d{1,4}[a-z]?\/(?=\d)/i,
      ""
    )
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function getPreviousEntityMatchers(): Promise<{
  vehicleRegos: Set<string>;
  addressCores: Set<string>;
}> {
  const db = await getDb();
  if (!db) return { vehicleRegos: new Set(), addressCores: new Set() };
  const rows = await db.select().from(targetFieldHistory);
  const vehicleRegos = new Set<string>();
  const addressCores = new Set<string>();
  for (const r of rows) {
    if (r.fieldName === "v1f" || r.fieldName === "v1") {
      const rego = extractRegoUpper(r.previousValue);
      if (rego) vehicleRegos.add(rego);
    } else if (r.fieldName === "hbf" || r.fieldName === "hb") {
      const core = addressCoreLower(r.previousValue);
      if (core) addressCores.add(core);
    }
  }
  return { vehicleRegos, addressCores };
}

/** Mutates matching vehicle/location entities in place, flagging isPrevious. */
function markPreviousEntities(
  assocVehicles: IntelProfileEntity[],
  assocLocations: IntelProfileEntity[],
  matchers: { vehicleRegos: Set<string>; addressCores: Set<string> }
): void {
  for (const v of assocVehicles) {
    const rego = extractRegoUpper(v.label);
    if (rego && matchers.vehicleRegos.has(rego)) v.isPrevious = true;
  }
  for (const l of assocLocations) {
    const core = addressCoreLower(l.label);
    if (matchers.addressCores.has(core)) l.isPrevious = true;
  }
}

async function buildTargetOperationalAssociations(
  targetId: number,
  targetLabel: string,
  targetName: string,
  allEntities: IntelligenceEntity[]
): Promise<{
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
}> {
  const db = await getDb();
  if (!db) return { assocPersons: [], assocVehicles: [], assocLocations: [] };

  const targetSheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(
      and(eq(runningSheets.targetId, targetId), isNull(runningSheets.deletedAt))
    );

  if (!targetSheets.length)
    return { assocPersons: [], assocVehicles: [], assocLocations: [] };

  const targetSheetIds = targetSheets.map(s => s.id);
  const rows = await db
    .select({ id: sheetRows.id })
    .from(sheetRows)
    .where(inArray(sheetRows.sheetId, targetSheetIds));

  const targetRowIds = new Set(rows.map(r => r.id));
  const targetLabelLower = targetLabel.toLowerCase();
  // Catches observation-derived person entities that are just the target's own
  // name in different wording (e.g. "Sighted JOHN SMITH" vs the target card's
  // "JOHN SMITH, born 1 Jan 1980") — without this, the same real person shows
  // up both as the profile's main subject and again in its own associate list.
  const coreName = targetCoreName(targetName);

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();
  const assocLocationsMap = new Map<string, IntelProfileEntity>();

  for (const entity of allEntities) {
    if (entity.shortForm.toLowerCase() === targetLabelLower) continue;
    if (entity.isTarget && entity.targetId === targetId) continue;
    if (!entity.isTarget && entity.type === "person" && coreName) {
      const entityLower = entity.shortForm.toLowerCase().trim();
      if (entityLower === coreName || entityLower.endsWith(` ${coreName}`))
        continue;
    }
    const relevantOccs = entity.occurrences.filter(
      occ => occ.rowId > 0 && targetRowIds.has(occ.rowId)
    );
    if (!relevantOccs.length) continue;

    const key = `${entity.type}::${entity.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: entity.shortForm,
      type: entity.isTarget
        ? "target"
        : (entity.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(relevantOccs.map(o => o.sheetId))),
      operationIds: Array.from(new Set(relevantOccs.map(o => o.operationId))),
      rowCount: new Set(relevantOccs.map(o => o.rowId)).size,
    };

    if (entity.type === "person" || entity.isTarget) {
      assocPersonsMap.set(key, profileEntity);
    } else if (entity.type === "vehicle") {
      assocVehiclesMap.set(key, profileEntity);
    } else if (entity.type === "address" || entity.type === "business") {
      assocLocationsMap.set(key, profileEntity);
    }
  }

  return {
    assocPersons: Array.from(assocPersonsMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    assocVehicles: Array.from(assocVehiclesMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    assocLocations: Array.from(assocLocationsMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
  };
}

// Populates `.photos` on a set of associated-entity arrays (mutates in place),
// mirroring the batched lookup already used by getIntelOperationProfile — so
// every profile page (Target/Associate/Vehicle/Location) shows an associated
// entity's own linked photos, not just the Operation profile.
async function populateAssocPhotos(
  assocPersons: IntelProfileEntity[],
  assocVehicles: IntelProfileEntity[],
  assocLocations: IntelProfileEntity[]
): Promise<void> {
  const vehicleKeys = assocVehicles.map(v => normalizeEntityLabel(v.label));
  const personKeys = assocPersons
    .filter(p => p.type !== "target")
    .map(p => normalizeEntityLabel(p.label));
  const locationKeys = assocLocations.map(l => normalizeEntityLabel(l.label));
  const { entityPhotos } = await getAttachmentsForOperationEntities([], {
    vehicle: vehicleKeys,
    associate: personKeys,
    location: locationKeys,
  });
  for (const p of assocPersons)
    p.photos =
      entityPhotos.get(`associate::${normalizeEntityLabel(p.label)}`) ?? [];
  for (const v of assocVehicles)
    v.photos =
      entityPhotos.get(`vehicle::${normalizeEntityLabel(v.label)}`) ?? [];
  for (const l of assocLocations)
    l.photos =
      entityPhotos.get(`location::${normalizeEntityLabel(l.label)}`) ?? [];
}

export async function getIntelTargetProfile(
  targetId: number
): Promise<IntelTargetProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const target = await getTargetById(targetId);
  if (!target) return null;

  const opLinks = await db
    .select({ id: operations.id, name: operations.name })
    .from(operationTargetLinks)
    .innerJoin(operations, eq(operations.id, operationTargetLinks.operationId))
    .where(
      and(
        eq(operationTargetLinks.targetId, targetId),
        isNull(operations.deletedAt)
      )
    );

  const linkedSheetRows = await db
    .select({
      id: runningSheets.id,
      title: runningSheets.title,
      operationId: runningSheets.operationId,
    })
    .from(runningSheets)
    .where(
      and(eq(runningSheets.targetId, targetId), isNull(runningSheets.deletedAt))
    );

  const opNames: Record<number, string> = {};
  for (const op of opLinks) opNames[op.id] = op.name;

  const extraOpIds = Array.from(
    new Set(linkedSheetRows.map(s => s.operationId).filter(id => !opNames[id]))
  );
  if (extraOpIds.length) {
    const extraOps = await db
      .select({ id: operations.id, name: operations.name })
      .from(operations)
      .where(inArray(operations.id, extraOpIds));
    for (const op of extraOps) opNames[op.id] = op.name;
  }

  let observationCount = 0;
  for (const sheet of linkedSheetRows) {
    const cnt = await db
      .select({ c: sql<number>`count(*)` })
      .from(sheetRows)
      .where(eq(sheetRows.sheetId, sheet.id));
    observationCount += Number(cnt[0]?.c ?? 0);
  }

  const allEntities = await getAllIntelligenceEntities();
  const targetLabel = target.tgt ?? target.name;
  const { assocPersons, assocVehicles, assocLocations } =
    await buildTargetOperationalAssociations(
      targetId,
      targetLabel,
      target.name,
      allEntities
    );
  await populateAssocPhotos(assocPersons, assocVehicles, assocLocations);
  markPreviousEntities(
    assocVehicles,
    assocLocations,
    await getPreviousEntityMatchers()
  );

  return {
    targetId,
    name: target.name,
    tgt: target.tgt,
    hbf: target.hbf,
    hb: target.hb,
    v1f: target.v1f,
    v1: target.v1,
    v2f: target.v2f,
    v2: target.v2,
    extraVehicles: target.extraVehicles ?? null,
    dep: target.dep,
    arr: target.arr,
    operations: opLinks,
    linkedSheets: linkedSheetRows.map(s => ({
      id: s.id,
      title: s.title,
      operationId: s.operationId,
      operationName: opNames[s.operationId] ?? "Unknown",
    })),
    observationCount,
    assocPersons,
    assocVehicles,
    assocLocations,
  };
}

export async function getIntelOperationProfile(
  operationId: number
): Promise<IntelOperationProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const opRows = await db
    .select()
    .from(operations)
    .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)));
  if (!opRows.length) return null;
  const op = opRows[0];

  const sheets = await db
    .select({
      id: runningSheets.id,
      title: runningSheets.title,
      targetId: runningSheets.targetId,
      targetName: runningSheets.targetName,
    })
    .from(runningSheets)
    .where(
      and(
        eq(runningSheets.operationId, operationId),
        isNull(runningSheets.deletedAt)
      )
    );

  const targetLinks = await db
    .select({ targetId: operationTargetLinks.targetId })
    .from(operationTargetLinks)
    .where(eq(operationTargetLinks.operationId, operationId));

  const allEntities = await getAllIntelligenceEntities();

  const targetProfiles = (
    await Promise.all(
      targetLinks.map(async ({ targetId }) => {
        const target = await getTargetById(targetId);
        if (!target) return null;
        const targetLabel = target.tgt ?? target.name;
        const targetSheets = sheets.filter(s => s.targetId === targetId);
        const { assocPersons, assocVehicles, assocLocations } =
          await buildTargetOperationalAssociations(
            targetId,
            targetLabel,
            target.name,
            allEntities
          );
        return {
          targetId,
          name: target.name,
          tgt: target.tgt,
          hbf: target.hbf,
          v1f: target.v1f,
          v2f: target.v2f,
          dep: target.dep,
          arr: target.arr,
          linkedSheets: targetSheets.map(s => ({ id: s.id, title: s.title })),
          assocPersons,
          assocVehicles,
          assocLocations,
        };
      })
    )
  ).filter(Boolean) as IntelOperationProfile["targets"];

  // Batch-fetch photos for every target and every associated vehicle/
  // associate/location shown across this operation's targets, then slot
  // them into the matching entity below.
  const vehicleKeys = new Set<string>();
  const personKeys = new Set<string>();
  const locationKeys = new Set<string>();
  for (const t of targetProfiles) {
    for (const v of t.assocVehicles)
      vehicleKeys.add(normalizeEntityLabel(v.label));
    for (const p of t.assocPersons)
      if (p.type !== "target") personKeys.add(normalizeEntityLabel(p.label));
    for (const l of t.assocLocations)
      locationKeys.add(normalizeEntityLabel(l.label));
  }
  const { targetPhotos, entityPhotos } =
    await getAttachmentsForOperationEntities(
      targetProfiles.map(t => t.targetId),
      {
        vehicle: Array.from(vehicleKeys),
        associate: Array.from(personKeys),
        location: Array.from(locationKeys),
      }
    );
  const previousMatchers = await getPreviousEntityMatchers();
  for (const t of targetProfiles) {
    t.photos = targetPhotos.get(t.targetId) ?? [];
    for (const p of t.assocPersons)
      p.photos =
        entityPhotos.get(`associate::${normalizeEntityLabel(p.label)}`) ?? [];
    for (const v of t.assocVehicles)
      v.photos =
        entityPhotos.get(`vehicle::${normalizeEntityLabel(v.label)}`) ?? [];
    for (const l of t.assocLocations)
      l.photos =
        entityPhotos.get(`location::${normalizeEntityLabel(l.label)}`) ?? [];
    markPreviousEntities(t.assocVehicles, t.assocLocations, previousMatchers);
  }

  return {
    operationId,
    operationName: op.name,
    promisNumber: op.promisNumber ?? null,
    imsNumber: op.imsNumber ?? null,
    investigationUnit: op.investigationUnit ?? null,
    linkedSheets: sheets,
    targets: targetProfiles,
  };
}

/**
 * Operations a vehicle/associate/location entity has appeared in, for the
 * manual-upload "link to operation" dropdown — reuses the same
 * getAllIntelligenceEntities() + opMap pattern as getIntelVehicleProfile.
 */
export async function getLinkedOperationsForEntity(
  category: "vehicle" | "associate" | "location",
  entityLabel: string
): Promise<Array<{ id: number; name: string }>> {
  const allEntities = await getAllIntelligenceEntities();
  const labelLower = entityLabel.toLowerCase();

  const entity = allEntities.find(e => {
    if (e.shortForm.toLowerCase() !== labelLower) return false;
    if (category === "vehicle") return e.type === "vehicle";
    if (category === "associate")
      return (e.type === "person" || e.type === "business") && !e.isTarget;
    return (e.type === "address" || e.type === "business") && !e.isTarget;
  });
  if (!entity) return [];

  const opMap = new Map<number, { id: number; name: string }>();
  for (const occ of entity.occurrences) {
    if (!opMap.has(occ.operationId))
      opMap.set(occ.operationId, {
        id: occ.operationId,
        name: occ.operationName,
      });
  }
  return Array.from(opMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function getIntelAssociateProfile(
  label: string
): Promise<IntelAssociateProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e =>
      e.shortForm.toLowerCase() === label.toLowerCase() &&
      (e.type === "person" || e.type === "business") &&
      !e.isTarget
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));

  const sheetMap = new Map<
    number,
    { id: number; title: string; operationId: number; operationName: string }
  >();
  for (const occ of observationOccs) {
    if (!sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, {
        id: occ.sheetId,
        title: occ.sheetTitle,
        operationId: occ.operationId,
        operationName: occ.operationName,
      });
    }
  }

  const allTargets = await db
    .select({ id: targets.id, name: targets.name })
    .from(targets)
    .where(isNull(targets.deletedAt));

  const linkedTargets: IntelAssociateProfile["linkedTargets"] = [];

  for (const target of allTargets) {
    const targetSheets = await db
      .select({ id: runningSheets.id, operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(
        and(
          eq(runningSheets.targetId, target.id),
          isNull(runningSheets.deletedAt)
        )
      );

    for (const sheet of targetSheets) {
      const rows = await db
        .select({ id: sheetRows.id })
        .from(sheetRows)
        .where(eq(sheetRows.sheetId, sheet.id));
      const hasOverlap = rows.some(r => assocRowIds.has(r.id));
      if (hasOverlap) {
        const opRows = await db
          .select({ name: operations.name })
          .from(operations)
          .where(eq(operations.id, sheet.operationId));
        const alreadyLinked = linkedTargets.some(
          lt =>
            lt.targetId === target.id && lt.operationId === sheet.operationId
        );
        if (!alreadyLinked) {
          linkedTargets.push({
            targetId: target.id,
            name: target.name,
            operationId: sheet.operationId,
            operationName: opRows[0]?.name ?? "Unknown",
          });
        }
        break;
      }
    }
  }

  const assocLocationsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === label.toLowerCase()) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: other.shortForm,
      type: other.isTarget
        ? "target"
        : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(
        new Set(overlappingOccs.map(o => o.operationId))
      ),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "vehicle") assocVehiclesMap.set(key, profileEntity);
    else if (other.type === "address" || other.type === "business")
      assocLocationsMap.set(key, profileEntity);
  }

  const assocVehicles = Array.from(assocVehiclesMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const assocLocations = Array.from(assocLocationsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  await populateAssocPhotos([], assocVehicles, assocLocations);
  markPreviousEntities(
    assocVehicles,
    assocLocations,
    await getPreviousEntityMatchers()
  );

  return {
    label: entity.shortForm,
    type: entity.type as "person" | "business",
    linkedTargets,
    linkedSheets: Array.from(sheetMap.values()),
    assocLocations,
    assocVehicles,
  };
}

export async function getIntelVehicleProfile(
  label: string
): Promise<IntelVehicleProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e =>
      e.shortForm.toLowerCase() === label.toLowerCase() && e.type === "vehicle"
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));
  const labelLower = label.toLowerCase();

  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      v1f: targets.v1f,
      v2f: targets.v2f,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Find linkedTarget from TWO sources:
  // 1. Target card v1f/v2f fields that mention this vehicle
  // 2. Row-level co-occurrence: isTarget entities that share observation rows with this vehicle
  let linkedTarget: IntelVehicleProfile["linkedTarget"] = null;
  for (const t of allTargets) {
    if (
      (t.v1f && t.v1f.toLowerCase().includes(labelLower)) ||
      (t.v2f && t.v2f.toLowerCase().includes(labelLower))
    ) {
      linkedTarget = { targetId: t.id, name: t.name };
      break;
    }
  }
  if (!linkedTarget) {
    // Check row-level co-occurrence with target entities
    for (const other of allEntities) {
      if (!other.isTarget || !other.targetId) continue;
      const overlappingOccs = other.occurrences.filter(
        o => o.rowId > 0 && assocRowIds.has(o.rowId)
      );
      if (overlappingOccs.length > 0) {
        linkedTarget = { targetId: other.targetId, name: other.shortForm };
        break;
      }
    }
  }

  const opMap = new Map<number, { id: number; name: string }>();
  const sheetMap = new Map<
    number,
    { id: number; title: string; operationId: number; operationName: string }
  >();
  for (const occ of entity.occurrences) {
    if (!opMap.has(occ.operationId))
      opMap.set(occ.operationId, {
        id: occ.operationId,
        name: occ.operationName,
      });
    if (occ.rowId > 0 && !sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, {
        id: occ.sheetId,
        title: occ.sheetTitle,
        operationId: occ.operationId,
        operationName: occ.operationName,
      });
    }
  }

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocLocationsMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === labelLower) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: other.shortForm,
      type: other.isTarget
        ? "target"
        : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(
        new Set(overlappingOccs.map(o => o.operationId))
      ),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "person" || other.isTarget)
      assocPersonsMap.set(key, profileEntity);
    else if (other.type === "address" || other.type === "business")
      assocLocationsMap.set(key, profileEntity);
  }

  // Find the first observation text that contains the full vehicle description
  const firstObservation =
    entity.occurrences.find(o => o.fullDescription)?.fullDescription ?? null;

  const assocPersons = Array.from(assocPersonsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const assocLocations = Array.from(assocLocationsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  await populateAssocPhotos(assocPersons, [], assocLocations);
  const previousMatchers = await getPreviousEntityMatchers();
  markPreviousEntities([], assocLocations, previousMatchers);
  const selfRego = extractRegoUpper(entity.shortForm);
  const isPrevious = !!selfRego && previousMatchers.vehicleRegos.has(selfRego);

  return {
    label: entity.shortForm,
    firstObservation,
    linkedTarget,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons,
    assocLocations,
    isPrevious,
  };
}

export async function getIntelLocationProfile(
  label: string
): Promise<IntelLocationProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e =>
      e.shortForm.toLowerCase() === label.toLowerCase() &&
      (e.type === "address" || e.type === "business")
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));
  const labelLower = label.toLowerCase();

  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      hbf: targets.hbf,
      dep: targets.dep,
      arr: targets.arr,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Build linkedTargets from TWO sources:
  // 1. Target card fields (hbf/dep/arr) that mention this location
  // 2. Row-level co-occurrence: isTarget entities that share observation rows with this location
  const linkedTargetsMap = new Map<
    number,
    { targetId: number; name: string }
  >();
  for (const t of allTargets) {
    if (
      (t.hbf && t.hbf.toLowerCase().includes(labelLower)) ||
      (t.dep && t.dep.toLowerCase().includes(labelLower)) ||
      (t.arr && t.arr.toLowerCase().includes(labelLower))
    ) {
      linkedTargetsMap.set(t.id, { targetId: t.id, name: t.name });
    }
  }
  // Also check row-level co-occurrence with target entities
  for (const other of allEntities) {
    if (!other.isTarget || !other.targetId) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (overlappingOccs.length > 0 && !linkedTargetsMap.has(other.targetId)) {
      linkedTargetsMap.set(other.targetId, {
        targetId: other.targetId,
        name: other.shortForm,
      });
    }
  }
  const linkedTargets: IntelLocationProfile["linkedTargets"] = Array.from(
    linkedTargetsMap.values()
  );

  const opMap = new Map<number, { id: number; name: string }>();
  const sheetMap = new Map<
    number,
    { id: number; title: string; operationId: number; operationName: string }
  >();
  for (const occ of entity.occurrences) {
    if (!opMap.has(occ.operationId))
      opMap.set(occ.operationId, {
        id: occ.operationId,
        name: occ.operationName,
      });
    if (occ.rowId > 0 && !sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, {
        id: occ.sheetId,
        title: occ.sheetTitle,
        operationId: occ.operationId,
        operationName: occ.operationName,
      });
    }
  }

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === labelLower) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: other.shortForm,
      type: other.isTarget
        ? "target"
        : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(
        new Set(overlappingOccs.map(o => o.operationId))
      ),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "person" || other.isTarget)
      assocPersonsMap.set(key, profileEntity);
    else if (other.type === "vehicle") assocVehiclesMap.set(key, profileEntity);
  }

  const assocPersons = Array.from(assocPersonsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const assocVehicles = Array.from(assocVehiclesMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  await populateAssocPhotos(assocPersons, assocVehicles, []);
  const previousMatchers = await getPreviousEntityMatchers();
  markPreviousEntities(assocVehicles, [], previousMatchers);
  const isPrevious = previousMatchers.addressCores.has(
    addressCoreLower(entity.shortForm)
  );

  return {
    label: entity.shortForm,
    linkedTargets,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons,
    assocVehicles,
    isPrevious,
  };
}

// ─── Intelligence Mapping ─────────────────────────────────────────────────────

export interface IntelMapLocation {
  label: string;
  type: "target_address" | "observation";
  /** Targets whose registered details (HBF/V1F/V2F) include this location */
  linkedTargets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    operationId: number | null;
    operationName: string | null;
  }>;
  /** Associates (non-target persons) seen at this location in observation rows */
  assocPersons: string[];
  /** Vehicles seen at this location in observation rows */
  assocVehicles: string[];
  /** Total link count (targets + assocPersons + assocVehicles) */
  linkCount: number;
}

export async function getIntelMappingLocations(
  operationIds?: number[],
  targetIds?: number[]
): Promise<IntelMapLocation[]> {
  const allEntities = await getAllIntelligenceEntities();

  // Filter entities to only those in the requested operations/targets.
  // IMPORTANT: if neither filter is active, return nothing (empty map) rather than everything.
  const filterByOp = operationIds && operationIds.length > 0;
  const filterByTarget = targetIds && targetIds.length > 0;

  if (!filterByOp && !filterByTarget) return [];

  const filteredEntities = allEntities.filter(e => {
    if (!filterByOp && !filterByTarget) return true;
    const opIds = e.occurrences.map(o => o.operationId).filter(id => id > 0);
    const tgtMatch =
      filterByTarget &&
      e.isTarget &&
      e.targetId != null &&
      targetIds!.includes(e.targetId);
    const opMatch = filterByOp && opIds.some(id => operationIds!.includes(id));
    return tgtMatch || opMatch || (!filterByTarget && opMatch);
  });

  // Build a set of target entities that pass the filter
  const filteredTargetEntities = filteredEntities.filter(
    e => e.isTarget && e.targetId != null
  );
  const filteredTargetIds = new Set(
    filteredTargetEntities.map(e => e.targetId!)
  );

  // Load full target card details for filtered targets
  const db = await getDb();
  if (!db) return [];

  const allTargetRows = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId!, operations.id))
    .where(isNull(targets.deletedAt));

  // Also load registry-linked targets
  const linkedTargetRows = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(
      operationTargetLinks,
      eq(operationTargetLinks.targetId, targets.id)
    )
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(isNull(targets.deletedAt));

  // Merge, prefer linked rows
  const seenPairs = new Set<string>();
  const allTargetData: typeof allTargetRows = [];
  for (const r of linkedTargetRows) {
    seenPairs.add(`${r.id}::${r.operationId}`);
    allTargetData.push(r);
  }
  for (const r of allTargetRows) {
    if (!seenPairs.has(`${r.id}::${r.operationId}`)) allTargetData.push(r);
  }

  // Only keep targets that pass the filter.
  // If filteredTargetIds is empty (no targets linked to this operation), skip target card rendering
  // but still allow observation-based intel (addresses, vehicles, persons) to show.
  const relevantTargets =
    filteredTargetIds.size === 0
      ? []
      : allTargetData.filter(t => filteredTargetIds.has(t.id));

  // Build location map: label (lowercase) -> IntelMapLocation
  const locationMap = new Map<string, IntelMapLocation>();

  const ensureLocation = (label: string): IntelMapLocation => {
    const key = label.toLowerCase().trim();
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        label: label.trim(),
        type: "observation",
        linkedTargets: [],
        assocPersons: [],
        assocVehicles: [],
        linkCount: 0,
      });
    }
    return locationMap.get(key)!;
  };

  // Step 1: Register target card addresses as target_address type
  for (const t of relevantTargets) {
    const addrFields = [t.hbf?.trim() || t.hb?.trim() || null].filter(
      Boolean
    ) as string[];
    for (const addr of addrFields) {
      const loc = ensureLocation(addr);
      loc.type = "target_address";
      // Add this target to linkedTargets if not already there
      if (!loc.linkedTargets.find(lt => lt.targetId === t.id)) {
        loc.linkedTargets.push({
          targetId: t.id,
          name: t.name,
          tgt: t.tgt,
          hbf: t.hbf?.trim() || t.hb?.trim() || null,
          v1f: t.v1f?.trim() || t.v1?.trim() || null,
          v2f: t.v2f?.trim() || t.v2?.trim() || null,
          operationId: t.operationId ?? null,
          operationName: t.operationName ?? null,
        });
      }
    }
  }

  // Step 2: Use entity co-occurrence to populate observation locations with persons/vehicles
  // Get all location entities (address + business) from filtered set
  const locationEntities = filteredEntities.filter(
    e => e.type === "address" || e.type === "business"
  );

  // Build a rowId -> [entity] map for co-occurrence
  const rowEntityMap = new Map<number, IntelligenceEntity[]>();
  for (const e of filteredEntities) {
    for (const occ of e.occurrences) {
      if (occ.rowId <= 0) continue;
      if (!rowEntityMap.has(occ.rowId)) rowEntityMap.set(occ.rowId, []);
      rowEntityMap.get(occ.rowId)!.push(e);
    }
  }

  for (const locEntity of locationEntities) {
    const loc = ensureLocation(locEntity.shortForm);
    // Collect all rowIds for this location entity
    const locRowIds = new Set(
      locEntity.occurrences.filter(o => o.rowId > 0).map(o => o.rowId)
    );
    for (const rowId of Array.from(locRowIds)) {
      const coEntities = rowEntityMap.get(rowId) ?? [];
      for (const co of coEntities) {
        if (co === locEntity) continue;
        if (co.isTarget) {
          // Add to linkedTargets if not already there
          const tData = relevantTargets.find(t => t.id === co.targetId);
          if (
            tData &&
            !loc.linkedTargets.find(lt => lt.targetId === co.targetId)
          ) {
            // Do NOT upgrade type here — only target card addresses are "target_address"
            // Observation locations stay purple even if a target co-occurs in the same row
            loc.linkedTargets.push({
              targetId: tData.id,
              name: tData.name,
              tgt: tData.tgt,
              hbf: tData.hbf?.trim() || tData.hb?.trim() || null,
              v1f: tData.v1f?.trim() || tData.v1?.trim() || null,
              v2f: tData.v2f?.trim() || tData.v2?.trim() || null,
              operationId: tData.operationId ?? null,
              operationName: tData.operationName ?? null,
            });
          }
        } else if (co.type === "person") {
          if (!loc.assocPersons.includes(co.shortForm)) {
            loc.assocPersons.push(co.shortForm);
          }
        } else if (co.type === "vehicle") {
          if (!loc.assocVehicles.includes(co.shortForm)) {
            loc.assocVehicles.push(co.shortForm);
          }
        }
      }
    }
  }

  // Step 3: Compute link counts and return
  const result: IntelMapLocation[] = [];
  for (const loc of Array.from(locationMap.values())) {
    loc.linkCount =
      loc.linkedTargets.length +
      loc.assocPersons.length +
      loc.assocVehicles.length;
    result.push(loc);
  }

  // Sort: target_address entries first (so they geocode before observations and win proximity merge),
  // then alphabetically within each type
  return result.sort((a, b) => {
    if (a.type === "target_address" && b.type !== "target_address") return -1;
    if (a.type !== "target_address" && b.type === "target_address") return 1;
    return a.label.localeCompare(b.label);
  });
}

// ─── User Location Helpers ────────────────────────────────────────────────────

export interface UserLocationRow {
  userId: number;
  deviceId: string;
  name: string;
  team: "TEAM1" | "TEAM2" | "PTT" | null;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  operationIds: number[];
  updatedAt: number;
}

/**
 * Returns all users who have sharingEnabled=true and whose location was updated
 * within the last 90 seconds (server-side expiry — no client cleanup needed).
 * Visibility is NOT filtered by operationIds — any sharing user is visible to
 * any viewer regardless of which operations either party has selected.
 */
export async function getUserLocations(
  _callerOpIds: number[]
): Promise<UserLocationRow[]> {
  const db = await getDb();
  if (!db) return [];
  const expiryMs = Date.now() - 90_000; // 90 seconds ago
  const rows = await db
    .select({
      userId: userLocations.userId,
      deviceId: userLocations.deviceId,
      name: users.name,
      team: users.team,
      lat: userLocations.lat,
      lng: userLocations.lng,
      speed: userLocations.speed,
      heading: userLocations.heading,
      operationIds: userLocations.operationIds,
      updatedAt: userLocations.updatedAt,
    })
    .from(userLocations)
    .innerJoin(users, eq(users.id, userLocations.userId))
    .where(
      and(
        eq(userLocations.sharingEnabled, true),
        gt(userLocations.updatedAt, expiryMs)
      )
    );

  return rows.map(r => {
    let opIds: number[] = [];
    try {
      opIds = JSON.parse(r.operationIds || "[]");
    } catch {
      opIds = [];
    }
    return { ...r, operationIds: opIds };
  });
}

/**
 * Upserts a user's location record. Creates if not exists, updates if exists.
 */
export async function upsertUserLocation(
  userId: number,
  deviceId: string,
  lat: number,
  lng: number,
  operationIds: number[],
  sharingEnabled: boolean,
  speed: number | null,
  heading: number | null,
  accuracy: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const opIdsJson = JSON.stringify(operationIds);
  await db
    .insert(userLocations)
    .values({
      userId,
      deviceId,
      lat,
      lng,
      speed,
      heading,
      accuracy,
      operationIds: opIdsJson,
      sharingEnabled,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        lat,
        lng,
        speed,
        heading,
        accuracy,
        operationIds: opIdsJson,
        sharingEnabled,
        updatedAt: now,
      },
    });

  // Auto-cleanup: remove stale rows for this user that are not sharing and older than 2 hours.
  // This prevents accumulation of orphaned device rows from old sessions.
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  await db
    .delete(userLocations)
    .where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.sharingEnabled, false),
        lt(userLocations.updatedAt, twoHoursAgo)
      )
    );
}

/**
 * Disables location sharing for a user (sets sharingEnabled=false).
 */
export async function clearUserLocation(
  userId: number,
  deviceId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(userLocations)
    .set({ sharingEnabled: false, updatedAt: Date.now() })
    .where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.deviceId, deviceId)
      )
    );
}

/**
 * Returns the current location/sharing state for a single user.
 */
export async function getUserLocationState(
  userId: number,
  deviceId: string
): Promise<{
  sharingEnabled: boolean;
  operationIds: number[];
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      sharingEnabled: userLocations.sharingEnabled,
      operationIds: userLocations.operationIds,
    })
    .from(userLocations)
    .where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.deviceId, deviceId)
      )
    )
    .limit(1);
  if (!rows.length) return null;
  let opIds: number[] = [];
  try {
    opIds = JSON.parse(rows[0].operationIds || "[]");
  } catch {
    opIds = [];
  }
  return { sharingEnabled: rows[0].sharingEnabled, operationIds: opIds };
}

// ─── Custom Map Markers ───────────────────────────────────────────────────────

export interface CustomMarkerRow {
  id: number;
  createdBy: number;
  operationId: number | null;
  targetId: number | null;
  lat: number;
  lng: number;
  label: string | null;
  address: string | null;
  markerIcon: string;
  markerColour: string;
  note: string | null;
  assocPersons: string[]; // parsed from JSON
  assocVehicles: string[]; // parsed from JSON
  rotation: number;
  linkedIntelLabel: string | null;
  deletedAt: number | null;
  deletedByCIN: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function parseMarkerRow(row: CustomMapMarker): CustomMarkerRow {
  let persons: string[] = [];
  let vehicles: string[] = [];
  try {
    persons = JSON.parse(row.assocPersons || "[]");
  } catch {
    persons = [];
  }
  try {
    vehicles = JSON.parse(row.assocVehicles || "[]");
  } catch {
    vehicles = [];
  }
  return {
    ...row,
    assocPersons: persons,
    assocVehicles: vehicles,
    rotation: row.rotation ?? 0,
    linkedIntelLabel: row.linkedIntelLabel ?? null,
    deletedAt: row.deletedAt ?? null,
    deletedByCIN: row.deletedByCIN ?? null,
  };
}

export async function getCustomMarkers(
  operationIds?: number[]
): Promise<CustomMarkerRow[]> {
  const db = await getDb();
  if (!db) return [];
  let rows: CustomMapMarker[];
  if (operationIds !== undefined && operationIds.length === 0) {
    // No operations selected — return nothing (matches intel layer behaviour)
    return [];
  } else if (operationIds && operationIds.length > 0) {
    // Only include markers explicitly assigned to the selected operations.
    // Markers with no operation (null) are excluded when a specific op filter is active
    // — they only appear in the all-ops view (no filter selected).
    rows = await db
      .select()
      .from(customMapMarkers)
      .where(
        and(
          inArray(customMapMarkers.operationId, operationIds),
          isNull(customMapMarkers.deletedAt)
        )
      )
      .orderBy(desc(customMapMarkers.createdAt));
  } else {
    // operationIds is undefined = all-ops view, return all markers
    rows = await db
      .select()
      .from(customMapMarkers)
      .where(isNull(customMapMarkers.deletedAt))
      .orderBy(desc(customMapMarkers.createdAt));
  }
  return rows.map(parseMarkerRow);
}

export async function createCustomMarker(data: {
  createdBy: number;
  operationId?: number | null;
  targetId?: number | null;
  lat: number;
  lng: number;
  label?: string | null;
  address?: string | null;
  markerIcon: string;
  markerColour: string;
  note?: string | null;
  assocPersons?: string[];
  assocVehicles?: string[];
  rotation?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(customMapMarkers).values({
    createdBy: data.createdBy,
    operationId: data.operationId ?? null,
    targetId: data.targetId ?? null,
    lat: data.lat,
    lng: data.lng,
    label: data.label ?? null,
    address: data.address ?? null,
    markerIcon: data.markerIcon,
    markerColour: data.markerColour,
    note: data.note ?? null,
    assocPersons: JSON.stringify(data.assocPersons ?? []),
    assocVehicles: JSON.stringify(data.assocVehicles ?? []),
    rotation: data.rotation ?? 0,
  });
  return (result as any).insertId as number;
}

export async function updateCustomMarker(
  id: number,
  data: {
    label?: string | null;
    address?: string | null;
    lat?: number;
    lng?: number;
    markerIcon?: string;
    markerColour?: string;
    note?: string | null;
    operationId?: number | null;
    targetId?: number | null;
    assocPersons?: string[];
    assocVehicles?: string[];
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Partial<InsertCustomMapMarker> = {};
  if (data.label !== undefined) update.label = data.label;
  if (data.address !== undefined) update.address = data.address;
  if (data.lat !== undefined) (update as any).lat = data.lat;
  if (data.lng !== undefined) (update as any).lng = data.lng;
  if (data.markerIcon !== undefined) update.markerIcon = data.markerIcon;
  if (data.markerColour !== undefined) update.markerColour = data.markerColour;
  if (data.note !== undefined) update.note = data.note;
  if (data.operationId !== undefined) update.operationId = data.operationId;
  if (data.targetId !== undefined) update.targetId = data.targetId;
  if (data.assocPersons !== undefined)
    update.assocPersons = JSON.stringify(data.assocPersons);
  if (data.assocVehicles !== undefined)
    update.assocVehicles = JSON.stringify(data.assocVehicles);
  if ((data as any).rotation !== undefined)
    (update as any).rotation = (data as any).rotation;
  if ((data as any).linkedIntelLabel !== undefined)
    (update as any).linkedIntelLabel = (data as any).linkedIntelLabel;
  if (Object.keys(update).length > 0) {
    await db
      .update(customMapMarkers)
      .set(update)
      .where(eq(customMapMarkers.id, id));
  }
}

export async function softDeleteCustomMarker(
  id: number,
  cin: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(customMapMarkers)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(customMapMarkers.id, id));
}

export async function reinstateCustomMarker(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(customMapMarkers)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(customMapMarkers.id, id));
}

export async function hardDeleteCustomMarker(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(customMapMarkers).where(eq(customMapMarkers.id, id));
}

// ─── Google Address Backfill ──────────────────────────────────────────────────

const AU_STATES_BACKFILL = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";
const GOOGLE_ADDRESS_RE_BACKFILL = new RegExp(
  `((?:[^,\\d\\n][^,\\n]*,\\s*)?)` +
    `(\\d{1,5}[A-Za-z]?(?:\\/\\d{1,5}[A-Za-z]?)?)\\s+` +
    `([A-Za-z][\\w\\s]{2,50}?)` +
    `,\\s*([A-Za-z][\\w\\s]{1,40}?\\s+(?:${AU_STATES_BACKFILL}))` +
    `(?:\\s+(\\d{4}))?` +
    `(?:,\\s*Australia)?`,
  "gi"
);

function convertGoogleAddressesServer(text: string): string {
  if (!text) return text;
  return text.replace(
    GOOGLE_ADDRESS_RE_BACKFILL,
    (
      fullMatch: string,
      businessPrefix: string,
      streetNum: string,
      streetName: string,
      suburbState: string,
      _postcode: string,
      offset: number,
      str: string
    ) => {
      const afterMatch = str.slice(offset + fullMatch.length).trimStart();
      if (afterMatch.startsWith("(")) return fullMatch;
      const bracketCode = `${streetNum} ${streetName.trim()}`.toUpperCase();
      const cleanedAddress = `${businessPrefix ?? ""}${streetNum} ${streetName.trim()}, ${suburbState.trim()}`;
      return `${cleanedAddress} (${bracketCode})`;
    }
  );
}

export async function backfillGoogleAddressesInObservations(): Promise<{
  scanned: number;
  updated: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch all non-deleted rows that have an observation
  const rows = await db
    .select({ id: sheetRows.id, observation: sheetRows.observation })
    .from(sheetRows)
    .where(
      sql`${sheetRows.observation} IS NOT NULL AND ${sheetRows.observation} != ''`
    );

  let updated = 0;
  for (const row of rows) {
    if (!row.observation) continue;
    const converted = convertGoogleAddressesServer(row.observation);
    if (converted !== row.observation) {
      await db
        .update(sheetRows)
        .set({ observation: converted })
        .where(eq(sheetRows.id, row.id));
      updated++;
    }
  }

  return { scanned: rows.length, updated };
}

// ─── RS Mapping Waypoints ─────────────────────────────────────────────────────

export interface RsWaypointRow {
  rowId: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  observation: string | null;
  /** Extracted address short-form (from brackets) */
  address: string | null;
  /** Full description preceding the bracket */
  addressFull: string | null;
  /** Manual lat override (null = use geocoded position) */
  lat: number | null;
  /** Manual lng override (null = use geocoded position) */
  lng: number | null;
  /** User comment */
  comment: string | null;
  /** Marker appearance overrides */
  markerIcon: string | null;
  markerColour: string | null;
  markerRotation: number | null;
  waypointId: number | null;
  /**
   * Route segment type for the path AFTER this waypoint:
   * - 'normal'        — straight line to next waypoint (no via data)
   * - 'continued_via' — the NEXT row is a "continued via:" row; viaStreets holds the parsed streets
   * - 'coos'          — the NEXT row is a COOS/OOS row; draw dashed line
   */
  segmentType: "normal" | "continued_via" | "coos";
  /**
   * Ordered list of street names/intersections extracted from the following
   * "continued via:" row. Empty when segmentType !== 'continued_via'.
   */
  viaStreets: string[];
  /**
   * Suburb context inferred from this waypoint's address (used to help geocode viaStreets).
   */
  suburbContext: string | null;
  /** Explicit calendar date (YYYY-MM-DD, Perth) set by the operator */
  rowDate: string | null;
  /** Legacy day-offset (0 = sheet start day, 1 = next day, etc.) */
  dayOffset: number;
}

/**
 * Return all sheet rows that contain a bracketed address entity,
 * merged with any persisted waypoint overrides (comment / moved position).
 */
/**
 * Parse a "continued via:" or "continued via;" observation text into an ordered
 * list of street names / intersection tokens.
 *
 * Handles separators:  →  |  ->  |  ,  |  then  |  via  (as conjunction)
 * Strips bracketed short-forms, leading/trailing whitespace, and common filler
 * words so only the actual street names remain.
 */
// Australian street type suffixes used to identify genuine street names
const STREET_TYPE_RE =
  /\b(street|st|road|rd|avenue|ave|drive|dr|highway|hwy|freeway|fwy|parade|pde|terrace|tce|place|pl|court|ct|crescent|cres|boulevard|blvd|way|lane|ln|close|cl|circuit|cct|grove|gr|rise|row|walk|track|trk|path|loop|mews|quay|esplanade|esp)\b/i;

function parseViaStreets(obs: string): string[] {
  // If the observation ends with "continued via:" (street list is in the NEXT row),
  // return empty immediately so the caller falls back to reading the next row.
  if (/continued\s+via[;:]\s*$/i.test(obs.trim())) return [];

  // Extract only the part AFTER "continued via:" prefix (may appear mid-text)
  const match = obs.match(/continued\s+via[;:]\s*([\s\S]*)$/i);
  const body = match
    ? match[1].trim()
    : obs.replace(/^continued\s+via[;:]/i, "").trim();
  if (!body) return [];

  // Split on common separators: →, ->, newline, comma, semicolon
  const parts = body
    .split(/\s*(?:→|->|\n|,|;)\s*/i)
    .map(p => {
      // Strip bracketed short-forms like (CV) (OOS) etc.
      return p.replace(/\([^)]*\)/g, "").trim();
    })
    .filter(p => {
      if (p.length < 3) return false;
      // Only keep parts that look like street names (contain a street-type suffix)
      return STREET_TYPE_RE.test(p);
    });

  return parts;
}

/**
 * Extract suburb/city context from an address string.
 * Returns the suburb portion (e.g. "FREMANTLE" from "1 Smith St, FREMANTLE WA").
 */
function extractSuburb(address: string): string | null {
  // Try to match suburb from common Australian address formats
  // "1 Smith St, FREMANTLE WA 6160" → "FREMANTLE WA"
  const m = address.match(
    /,\s*([A-Z][A-Za-z\s]+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s*\d{0,4})/
  );
  if (m) return m[1].trim();
  // Fallback: last word-group after a comma
  const parts = address.split(",");
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return null;
}

export async function getRsMappingWaypoints(
  sheetId: number
): Promise<RsWaypointRow[]> {
  const db = await getDb();
  if (!db) return [];

  // Load all rows for the sheet (sorted chronologically)
  const rows = await db
    .select()
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId))
    .orderBy(
      sql`ISNULL(${sheetRows.timeMinutes})`,
      asc(sheetRows.timeMinutes),
      asc(sheetRows.rowNumber)
    );

  // Load persisted waypoint overrides
  const overrides = await db
    .select()
    .from(rsMappingWaypoints)
    .where(eq(rsMappingWaypoints.sheetId, sheetId));

  const overrideMap = new Map(overrides.map(o => [o.rowId, o]));

  // ── First pass: collect all address-bearing rows ──────────────────────────
  // Strategy:
  //  1. Bracketed format: "arrived at 50 Kings Park Rd, WEST PERTH WA (50 KPR)" → use extractEntitiesFromText
  //  2. Unbracketed bare address: "50 Kings Park Road" (no brackets) → detect with street-type regex
  //  3. Enrich unbracketed short-form addresses by matching against known full addresses seen earlier
  //     in the sheet, so return visits get the correct full address for geocoding.

  interface RawWaypoint {
    row: (typeof rows)[number];
    address: string;
    addressFull: string;
  }

  // Regex to detect a bare street address at the start of an observation or after a keyword
  // Matches: "50 Kings Park Road", "cnr Smith St and Jones Ave", "146 Marine Parade, Cottesloe"
  const BARE_ADDR_RE =
    /(?:^|(?:arrived?\s+at|departed?|at|to|from|outside|near|opposite|behind|beside|in\s+front\s+of|parked\s+(?:at|in|on|outside))\s+)((?:cnr\s+(?:of\s+)?|corner\s+of\s+|lot\s+\d+\s+|\d{1,5}[A-Za-z]?\/\d{1,5}\s+|\d{1,5}[A-Za-z]?\s+)[A-Za-z][\w\s,&'-]{3,80}?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Highway|Hwy|Freeway|Fwy|Terrace|Tce|Parade|Pde|Circuit|Cct|Grove|Gr|Lane|Ln|Place|Pl|Court|Ct|Close|Cl|Crescent|Cres|Boulevard|Blvd|Way|Loop|Rise|Mews|Esplanade|Esp|Quay)(?:\s*,\s*[A-Za-z][\w\s]+)?)/i;

  // Build a normalised-address → full-address lookup from bracketed entries seen so far
  // Key: normalised street number + street name (lowercase, no punctuation)
  // Value: the best full address string seen for that location
  const knownAddressMap = new Map<string, string>(); // normKey → addressFull

  const normaliseAddrKey = (addr: string): string =>
    addr
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Expand common street-type abbreviations to their full form so that
  // "50 Kings Park Rd" and "50 Kings Park Road" produce the same key.
  const expandStreetTypes = (s: string): string =>
    s
      .replace(/\brd\b/gi, "road")
      .replace(/\bst\b/gi, "street")
      .replace(/\bave?\b/gi, "avenue")
      .replace(/\bdr\b/gi, "drive")
      .replace(/\bhwy\b/gi, "highway")
      .replace(/\bfwy\b/gi, "freeway")
      .replace(/\btce\b/gi, "terrace")
      .replace(/\bpde\b/gi, "parade")
      .replace(/\bcct\b/gi, "circuit")
      .replace(/\bgr\b/gi, "grove")
      .replace(/\bln\b/gi, "lane")
      .replace(/\bpl\b/gi, "place")
      .replace(/\bct\b/gi, "court")
      .replace(/\bcl\b/gi, "close")
      .replace(/\bcres\b/gi, "crescent")
      .replace(/\bblvd\b/gi, "boulevard")
      .replace(/\besp\b/gi, "esplanade");

  // Extract just the street number + street name for fuzzy matching.
  // IMPORTANT: split on comma BEFORE normalising (normaliseAddrKey strips commas, so
  // splitting after normalisation never fires and the suburb bleeds into the key).
  const addrMatchKey = (addr: string): string => {
    const expanded = expandStreetTypes(addr);
    // Split at first comma OR at a state code word boundary (raw string, before stripping)
    const base = expanded
      .split(/,|\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/i)[0]
      .trim();
    return normaliseAddrKey(base);
  };

  const addressRows: RawWaypoint[] = [];
  const rowIdsWithBracketed = new Set<number>(); // rows already handled by bracketed pass

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    const addrEntity = entities.find(e => e.type === "address");
    if (addrEntity) {
      // Bracketed address found — use it and register in knownAddressMap
      // Register by display shortForm key (e.g. "4 glyde street")
      const displayKey = addrMatchKey(addrEntity.shortForm);
      if (displayKey && !knownAddressMap.has(displayKey)) {
        knownAddressMap.set(displayKey, addrEntity.shortForm);
      }
      // Also register by rawShortForm key (the exact bracket token, e.g. "4 glyde st")
      const rawKey = addrMatchKey(addrEntity.rawShortForm);
      if (rawKey && rawKey !== displayKey && !knownAddressMap.has(rawKey)) {
        knownAddressMap.set(rawKey, addrEntity.shortForm);
      }
      addressRows.push({
        row,
        address: addrEntity.shortForm,
        addressFull: addrEntity.shortForm,
      });
      rowIdsWithBracketed.add(row.id);
    }
  }

  // Second sub-pass: detect unbracketed bare addresses in rows that had no bracketed address
  for (const row of rows) {
    if (!row.observation || rowIdsWithBracketed.has(row.id)) continue;
    const obs = row.observation.trim();
    const bareMatch = obs.match(BARE_ADDR_RE);
    if (!bareMatch) continue;
    const rawAddr = bareMatch[1].trim();
    // Try to enrich with a known full address from earlier in the sheet
    const matchKey = addrMatchKey(rawAddr);
    const knownFull = knownAddressMap.get(matchKey);
    addressRows.push({
      row,
      address: rawAddr,
      addressFull: knownFull ?? rawAddr,
    });
  }

  // Sort addressRows back into chronological order (same as rows array)
  const rowOrderMap = new Map(rows.map((r, i) => [r.id, i]));
  addressRows.sort(
    (a, b) =>
      (rowOrderMap.get(a.row.id) ?? 0) - (rowOrderMap.get(b.row.id) ?? 0)
  );

  // ── Build a rowId → index map for the sorted full row list ───────────────
  const rowIndexMap = new Map(rows.map((r, i) => [r.id, i]));

  // ── Second pass: annotate each address row with segment type ─────────────
  const result: RsWaypointRow[] = [];

  for (let wi = 0; wi < addressRows.length; wi++) {
    const { row, address, addressFull } = addressRows[wi];
    const override = overrideMap.get(row.id);

    // Determine what comes between this waypoint and the next in the full row list
    let segmentType: RsWaypointRow["segmentType"] = "normal";
    let viaStreets: string[] = [];
    const suburbContext = extractSuburb(addressFull || address);

    // Look at rows that fall between this address row and the next address row
    const thisRowIdx = rowIndexMap.get(row.id) ?? -1;
    const nextWpRow = addressRows[wi + 1];
    const nextRowIdx = nextWpRow
      ? (rowIndexMap.get(nextWpRow.row.id) ?? rows.length)
      : rows.length;

    // Scan the rows between the two waypoints
    for (let ri = thisRowIdx + 1; ri < nextRowIdx; ri++) {
      const between = rows[ri];
      if (!between.observation) continue;
      const obs = between.observation.trim();

      if (/continued\s+via[;:]/i.test(obs)) {
        segmentType = "continued_via";
        // Try to parse streets from the same row first
        viaStreets = parseViaStreets(obs);
        // If no streets found inline, check if the observation ends with "continued via:"
        // and the streets are in the very next row (separate row format)
        if (viaStreets.length === 0 && ri + 1 < nextRowIdx) {
          const nextRow = rows[ri + 1];
          if (nextRow?.observation) {
            const nextObs = nextRow.observation.trim();
            // The next row should look like a street list (no bracketed address entity)
            // and not be another continued_via or coos row
            const hasAddress = extractEntitiesFromText(nextObs).some(
              e => e.type === "address"
            );
            const isAnotherKeyword =
              /continued\s+via[;:]|continued\s+out\s+of\s+sight|\bcoos\b/i.test(
                nextObs
              );
            if (!hasAddress && !isAnotherKeyword) {
              // Parse the next row as the street list.
              // Format: "Street Name, SUBURB,\nStreet Name,\n...\nStreet Name, SUBURB, whereat;"
              // Each line/comma-segment may be a street name or a suburb name.
              // We only want parts that contain a street-type suffix.
              const streetBody = nextObs
                .replace(/[,;]?\s*whereat[;:,.]?.*$/i, "") // strip trailing "whereat"
                .trim();
              viaStreets = streetBody
                .split(/\s*(?:→|->|,|;|\n)\s*/i)
                .map(p => p.replace(/\([^)]*\)/g, "").trim())
                .filter(p => {
                  if (p.length < 3) return false;
                  // Only keep parts that look like street names
                  return STREET_TYPE_RE.test(p);
                })
                .map(p => {
                  // Strip trailing suburb/state info (e.g. "Marine Parade, COTTESLOE" -> "Marine Parade")
                  // Remove anything after the street type word
                  const m = p.match(
                    /^(.+?\b(?:street|st|road|rd|avenue|ave|drive|dr|highway|hwy|freeway|fwy|parade|pde|terrace|tce|place|pl|court|ct|crescent|cres|boulevard|blvd|way|lane|ln|close|cl|circuit|cct|grove|gr|rise|row|walk|track|trk|path|loop|mews|quay|esplanade|esp))\b/i
                  );
                  return m ? m[1].trim() : p.trim();
                });
            }
          }
        }
        break; // continued via takes priority
      }
      // COOS / OOS patterns (out of sight)
      if (/continued\s+out\s+of\s+sight|\bcoos\b|\boos\b/i.test(obs)) {
        segmentType = "coos";
        // don't break — a continued_via later in the gap would override
      }
    }

    result.push({
      rowId: row.id,
      rowNumber: row.rowNumber,
      time: row.time ?? null,
      timeMinutes: row.timeMinutes ?? null,
      observation: row.observation,
      address,
      addressFull,
      lat: override?.lat ?? null,
      lng: override?.lng ?? null,
      comment: override?.comment ?? null,
      markerIcon: override?.markerIcon ?? null,
      markerColour: override?.markerColour ?? null,
      markerRotation: override?.markerRotation ?? null,
      waypointId: override?.id ?? null,
      segmentType,
      viaStreets,
      suburbContext,
      rowDate: (row as any).rowDate ?? null,
      dayOffset: (row as any).dayOffset ?? 0,
    } as RsWaypointRow);
  }

  return result;
}

export async function upsertRsMappingWaypoint(input: {
  sheetId: number;
  rowId: number;
  createdBy: number;
  lat?: number | null;
  lng?: number | null;
  comment?: string | null;
  markerIcon?: string | null;
  markerColour?: string | null;
  markerRotation?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if a waypoint already exists for this row
  const existing = await db
    .select({ id: rsMappingWaypoints.id })
    .from(rsMappingWaypoints)
    .where(
      and(
        eq(rsMappingWaypoints.sheetId, input.sheetId),
        eq(rsMappingWaypoints.rowId, input.rowId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(rsMappingWaypoints)
      .set({
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        comment: input.comment ?? null,
        markerIcon: input.markerIcon ?? null,
        markerColour: input.markerColour ?? null,
        markerRotation: input.markerRotation ?? null,
      })
      .where(eq(rsMappingWaypoints.id, existing[0].id));
    return existing[0].id;
  } else {
    const [res] = await db.insert(rsMappingWaypoints).values({
      sheetId: input.sheetId,
      rowId: input.rowId,
      createdBy: input.createdBy,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      comment: input.comment ?? null,
      markerIcon: input.markerIcon ?? null,
      markerColour: input.markerColour ?? null,
      markerRotation: input.markerRotation ?? null,
    });
    return (res as any).insertId as number;
  }
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface IncompleteSheetReport {
  sheetId: number;
  sheetTitle: string;
  operationId: number;
  operationName: string;
  operationStatus: string;
  /** Parsed sheetCins array */
  teamCins: {
    cin: string;
    isTeamLeader?: boolean;
    isAuthor?: boolean;
    isCertifier?: boolean;
  }[];
  /** Teams present on this sheet (derived from users table) */
  teams: string[];
  /** True when members span more than one distinct team */
  isTeamBlended: boolean;
  teamLeaderCin: string | null;
  authorCin: string | null;
  certifierCin: string | null;
  uncertifiedRowCount: number;
  govPercent: number;
  isClosed: boolean;
  createdAt: Date;
}

/**
 * Returns all non-deleted, non-closed running sheets with full status info
 * for the Reports page. Enriches each sheet with team membership data from
 * the users table so the "Team Blended" logic can be applied client-side.
 */
export async function getIncompleteRunningSheets(): Promise<
  IncompleteSheetReport[]
> {
  const db = await getDb();
  if (!db) return [];

  // All non-deleted sheets
  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));

  if (sheets.length === 0) return [];

  const opIds = Array.from(new Set(sheets.map(s => s.operationId)));
  const sheetIds = sheets.map(s => s.id);

  const [ops, govRecords, allUsers] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    getGovernanceRecordsBySheetIds(sheetIds),
    db.select().from(users),
  ]);

  // Build CIN → team map from users table
  const cinTeamMap = new Map<string, string>();
  for (const u of allUsers) {
    if (u.cin && u.team) cinTeamMap.set(u.cin, u.team);
  }

  // Compute certification status per sheet
  const allRowMembers =
    sheetIds.length > 0
      ? await db
          .select()
          .from(rowMembers)
          .where(
            inArray(
              rowMembers.rowId,
              (
                await db
                  .select({ id: sheetRows.id })
                  .from(sheetRows)
                  .where(inArray(sheetRows.sheetId, sheetIds))
              ).map(r => r.id)
            )
          )
      : [];

  const allRows =
    sheetIds.length > 0
      ? await db
          .select()
          .from(sheetRows)
          .where(inArray(sheetRows.sheetId, sheetIds))
      : [];

  const allRowIds = allRows.map(r => r.id);
  const allCerts =
    allRowIds.length > 0
      ? await db
          .select()
          .from(certifications)
          .where(
            and(
              inArray(certifications.rowId, allRowIds),
              eq(certifications.isActive, true)
            )
          )
      : [];

  const results: IncompleteSheetReport[] = [];

  for (const sheet of sheets) {
    const op = ops.find(o => o.id === sheet.operationId);
    if (!op) continue;

    // Parse sheetCins
    let teamCins: {
      cin: string;
      isTeamLeader?: boolean;
      isAuthor?: boolean;
      isCertifier?: boolean;
    }[] = [];
    try {
      teamCins = JSON.parse(sheet.sheetCins ?? "[]");
    } catch {
      teamCins = [];
    }

    const teamLeaderCin = teamCins.find(c => c.isTeamLeader)?.cin ?? null;
    const authorCin = teamCins.find(c => c.isAuthor)?.cin ?? null;
    // Certifier: first CIN that is neither TL nor Author (or TL if no one else)
    const certifierCin =
      teamCins.find(c => !c.isTeamLeader && !c.isAuthor)?.cin ?? teamLeaderCin;

    // Derive teams present on this sheet
    const teamsOnSheet = Array.from(
      new Set(
        teamCins.map(c => cinTeamMap.get(c.cin)).filter((t): t is string => !!t)
      )
    );
    const isTeamBlended = teamsOnSheet.length > 1;

    // Compute uncertified row count
    const sheetRowObjs = allRows.filter(r => r.sheetId === sheet.id);
    const sheetRowIds = sheetRowObjs.map(r => r.id);
    const sheetMembers = allRowMembers.filter(
      m => sheetRowIds.includes(m.rowId) && m.memberName !== "__SPACE__"
    );
    const certRowMemberIds = new Set(
      allCerts.filter(c => sheetRowIds.includes(c.rowId)).map(c => c.memberId)
    );
    const uncertifiedRowCount = sheetRowObjs.filter(row => {
      const rowMems = sheetMembers.filter(m => m.rowId === row.id);
      return (
        rowMems.length > 0 && rowMems.some(m => !certRowMemberIds.has(m.id))
      );
    }).length;

    const allSigned =
      sheetRowObjs.length === 0 ||
      (sheetMembers.length > 0 &&
        sheetMembers.every(m => certRowMemberIds.has(m.id)));

    // Governance percent
    const govRec = govRecords.find(g => g.sheetId === sheet.id) ?? null;
    const govPercent = computeGovernancePercent(govRec, allSigned);

    const isClosed = !!sheet.closedAt;

    // Only include sheets that are incomplete (not closed OR governance < 100 OR uncertified rows)
    const isIncomplete =
      !isClosed || uncertifiedRowCount > 0 || govPercent < 100;
    if (!isIncomplete) continue;

    results.push({
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      operationId: op.id,
      operationName: op.name,
      operationStatus: op.status,
      teamCins,
      teams: teamsOnSheet,
      isTeamBlended,
      teamLeaderCin,
      authorCin,
      certifierCin,
      uncertifiedRowCount,
      govPercent,
      isClosed,
      createdAt: sheet.createdAt,
    });
  }

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface OutstandingTodoUser {
  cin: string;
  name: string;
  team: string | null;
  uncertifiedCount: number;
  governanceCount: number;
  totalCount: number;
}

/**
 * Returns all users ranked by total outstanding to-do actions
 * (uncertified rows they are a member of + governance items they own as TL/Author).
 */
export async function getOutstandingTodosByUser(): Promise<
  OutstandingTodoUser[]
> {
  const db = await getDb();
  if (!db) return [];

  const allUsers = await db.select().from(users);
  const usersWithCin = allUsers.filter(u => u.cin && u.cin.trim() !== "");

  const results: OutstandingTodoUser[] = [];

  for (const user of usersWithCin) {
    const cin = user.cin!;

    // Uncertified rows for this CIN
    const outstanding = await getOutstandingSheetsForCin(cin);
    const uncertifiedCount = outstanding.reduce(
      (sum, s) => sum + s.uncertifiedRowCount,
      0
    );

    // Governance items for this CIN (TL + Author)
    const govTodo = await getGovernanceTodoForCin(cin);
    const governanceCount = govTodo.reduce(
      (sum, s) =>
        sum + s.outstanding.filter(o => o !== "Ready to close").length,
      0
    );

    const totalCount = uncertifiedCount + governanceCount;
    if (totalCount === 0) continue;

    results.push({
      cin,
      name: user.name,
      team: user.team ?? null,
      uncertifiedCount,
      governanceCount,
      totalCount,
    });
  }

  return results.sort((a, b) => b.totalCount - a.totalCount);
}

// ─── User Sidebar Order ───────────────────────────────────────────────────────

export const DEFAULT_SIDEBAR_ORDER = [
  "operations",
  "governance",
  "todo",
  "mapping",
  "images",
  "calendar",
  "shortcuts",
  "intelligence",
  "targetRegistry",
  "operationManager",
];

export async function getSidebarOrder(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return DEFAULT_SIDEBAR_ORDER;
  const rows = await db
    .select()
    .from(userSidebarOrder)
    .where(eq(userSidebarOrder.userId, userId))
    .limit(1);
  if (rows.length === 0) return DEFAULT_SIDEBAR_ORDER;
  try {
    const parsed = JSON.parse(rows[0].orderedKeys);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* fall through */
  }
  return DEFAULT_SIDEBAR_ORDER;
}

export async function setSidebarOrder(
  userId: number,
  orderedKeys: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const json = JSON.stringify(orderedKeys);
  const existing = await db
    .select({ id: userSidebarOrder.id })
    .from(userSidebarOrder)
    .where(eq(userSidebarOrder.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(userSidebarOrder)
      .set({ orderedKeys: json })
      .where(eq(userSidebarOrder.userId, userId));
  } else {
    await db.insert(userSidebarOrder).values({ userId, orderedKeys: json });
  }
}

// ─── Operation Manager ────────────────────────────────────────────────────────

export async function getOpManagerPriorityBoard(weekStart: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerPriorityRows)
    .where(eq(opManagerPriorityRows.weekStart, weekStart))
    .orderBy(opManagerPriorityRows.sortOrder);
}

export async function saveOpManagerPriorityBoard(
  weekStart: string,
  rows: Array<{
    category: string;
    priority: number;
    operationId?: number | null;
    operationName?: string | null;
    team?: string | null;
    requestType?: string | null;
    sortOrder: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(opManagerPriorityRows)
    .where(eq(opManagerPriorityRows.weekStart, weekStart));
  if (rows.length === 0) return [];
  await db
    .insert(opManagerPriorityRows)
    .values(rows.map(r => ({ ...r, weekStart })));
  return getOpManagerPriorityBoard(weekStart);
}

export async function getOpManagerTaskingCalendar(weekStart: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerTaskingCells)
    .where(eq(opManagerTaskingCells.weekStart, weekStart));
}

export async function saveOpManagerTaskingCell(
  weekStart: string,
  dayIndex: number,
  teamRow: string,
  data: {
    shiftTime?: string | null;
    primaryTask?: string | null;
    secondaryTask?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(opManagerTaskingCells)
    .where(
      and(
        eq(opManagerTaskingCells.weekStart, weekStart),
        eq(opManagerTaskingCells.dayIndex, dayIndex),
        eq(opManagerTaskingCells.teamRow, teamRow)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(opManagerTaskingCells)
      .set(data)
      .where(eq(opManagerTaskingCells.id, existing[0].id));
  } else {
    await db
      .insert(opManagerTaskingCells)
      .values({ weekStart, dayIndex, teamRow, ...data });
  }
}

export async function getOpManagerSupervisorContacts(weekStart: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerSupervisorContacts)
    .where(eq(opManagerSupervisorContacts.weekStart, weekStart))
    .orderBy(opManagerSupervisorContacts.sortOrder);
}

export async function saveOpManagerSupervisorContacts(
  weekStart: string,
  contacts: Array<{
    role: string;
    userId?: number | null;
    customName?: string | null;
    phone?: string | null;
    sortOrder: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(opManagerSupervisorContacts)
    .where(eq(opManagerSupervisorContacts.weekStart, weekStart));
  if (contacts.length === 0) return [];
  await db
    .insert(opManagerSupervisorContacts)
    .values(contacts.map(c => ({ ...c, weekStart })));
  return getOpManagerSupervisorContacts(weekStart);
}

// ─── Op Manager All Weeks (folder list) ───────────────────────────────────────
export async function listAllOpManagerWeeks() {
  const db = await getDb();
  if (!db) return [];
  const [taskingRows, contactRows, priorityRows, postedRows] =
    await Promise.all([
      db
        .selectDistinct({ weekStart: opManagerTaskingCells.weekStart })
        .from(opManagerTaskingCells),
      db
        .selectDistinct({ weekStart: opManagerSupervisorContacts.weekStart })
        .from(opManagerSupervisorContacts),
      db
        .selectDistinct({ weekStart: opManagerPriorityRows.weekStart })
        .from(opManagerPriorityRows),
      db.select().from(opManagerPostedWeeks),
    ]);
  const postedMap = new Map(postedRows.map(p => [p.weekStart, p.postedAt]));
  const allWeekStarts = new Set([
    ...taskingRows.map(r => r.weekStart),
    ...contactRows.map(r => r.weekStart),
    ...priorityRows.map(r => r.weekStart),
    ...postedRows.map(r => r.weekStart),
  ]);
  return Array.from(allWeekStarts)
    .sort((a, b) => b.localeCompare(a))
    .map(weekStart => ({
      weekStart,
      posted: postedMap.has(weekStart),
      postedAt: postedMap.get(weekStart) ?? null,
    }));
}

export async function copyOpManagerWeek(
  fromWeekStart: string,
  toWeekStart: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const contacts = await getOpManagerSupervisorContacts(fromWeekStart);
  if (contacts.length > 0) {
    await db
      .delete(opManagerSupervisorContacts)
      .where(eq(opManagerSupervisorContacts.weekStart, toWeekStart));
    await db.insert(opManagerSupervisorContacts).values(
      contacts.map(({ id: _id, weekStart: _ws, ...rest }) => ({
        ...rest,
        weekStart: toWeekStart,
      }))
    );
  }
  const priority = await getOpManagerPriorityBoard(fromWeekStart);
  if (priority.length > 0) {
    await db
      .delete(opManagerPriorityRows)
      .where(eq(opManagerPriorityRows.weekStart, toWeekStart));
    await db.insert(opManagerPriorityRows).values(
      priority.map(({ id: _id, weekStart: _ws, ...rest }) => ({
        ...rest,
        weekStart: toWeekStart,
      }))
    );
  }
  // Copy task names only — shiftTime always comes from auto-population
  const tasking = await getOpManagerTaskingCalendar(fromWeekStart);
  if (tasking.length > 0) {
    await db
      .delete(opManagerTaskingCells)
      .where(eq(opManagerTaskingCells.weekStart, toWeekStart));
    await db.insert(opManagerTaskingCells).values(
      tasking.map(({ id: _id, weekStart: _ws, shiftTime: _st, ...rest }) => ({
        ...rest,
        weekStart: toWeekStart,
        shiftTime: null,
      }))
    );
  }
  return { ok: true };
}

// ─── Op Manager Posted Weeks ─────────────────────────────────────────────────
export async function getPostedWeeks() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerPostedWeeks)
    .orderBy(opManagerPostedWeeks.weekStart);
}

export async function isWeekPosted(weekStart: string) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(opManagerPostedWeeks)
    .where(eq(opManagerPostedWeeks.weekStart, weekStart));
  return rows.length > 0;
}

export async function markWeekPosted(weekStart: string, postedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert — if already posted, update postedAt
  await db
    .insert(opManagerPostedWeeks)
    .values({ weekStart, postedBy, postedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { postedAt: new Date(), postedBy } });
  return { weekStart, postedAt: new Date() };
}

// ─── In-app Notifications ─────────────────────────────────────────────────────
// See schema.ts comment on the notifications table for why this exists
// instead of browser push.
export async function createNotificationsForUsers(
  userIds: number[],
  params: {
    title: string;
    body: string;
    url?: string;
    sourceModule?: string;
    meta?: string;
  }
) {
  const db = await getDb();
  if (!db || userIds.length === 0) return;
  await db.insert(notifications).values(
    userIds.map(userId => ({
      userId,
      title: params.title,
      body: params.body,
      url: params.url,
      sourceModule: params.sourceModule,
      meta: params.meta,
    }))
  );
}

/**
 * Most recent still-unread notification for this user/sourceModule created
 * within the last `sinceMs` — used to coalesce repeated events (e.g. CTO
 * Roster shift edits) into one bumped row instead of a new notification per
 * event. See upsertRosterShiftNotification in ctoRoster.ts.
 */
export async function findRecentUnreadNotification(
  userId: number,
  sourceModule: string,
  sinceMs: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.sourceModule, sourceModule),
        isNull(notifications.readAt),
        gt(notifications.createdAt, new Date(Date.now() - sinceMs))
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return rows[0];
}

/** Overwrite an existing notification's content and bump createdAt to now, so it resurfaces as fresh in the bell. */
export async function updateNotificationContent(
  id: number,
  params: { title: string; body: string; meta?: string }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({
      title: params.title,
      body: params.body,
      meta: params.meta,
      createdAt: new Date(),
    })
    .where(eq(notifications.id, id));
}

export async function getNotificationsForUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  // Scoped to userId so one user can't mark another's notification read.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function deleteNotification(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  // Scoped to userId so one user can't delete another's notification.
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function deleteReadNotificationsForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(
      and(eq(notifications.userId, userId), isNotNull(notifications.readAt))
    );
}

const NOTIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Opportunistic purge (no cron — see references/periodic-updates.md),
// triggered on read like purgeExpiredRecycleBinItems, so the table doesn't
// grow forever even if nobody manually clears their bell.
export async function purgeExpiredNotifications() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(
      lt(
        notifications.createdAt,
        new Date(Date.now() - NOTIFICATION_MAX_AGE_MS)
      )
    );
}

// ─── Witness List ───────────────────────────────────────────────────────────

export interface WitnessListSheetData {
  sheetTitle: string;
  sheetDate: number;
  primary: string[];
  secondary: string[];
}

export interface WitnessListData {
  operationName: string;
  overallPrimary: string[];
  overallSecondary: string[];
  sheets: WitnessListSheetData[];
  producedAt: number;
  certifierCin: string;
}

// Primary witnesses: CINs that appear on at least one non-excluded row.
// Secondary witnesses: CINs that ONLY appear on excluded rows (travelled via,
// surveillance commenced/ceased). Shared by the .docx generator (witnessList.generate)
// and the PDF export (witnessList.getData) so both read the exact same classification.
export async function computeWitnessListData(
  sheetIds: number[],
  operationName: string,
  certifierCin: string
): Promise<WitnessListData> {
  const sheets = await Promise.all(sheetIds.map(id => getRunningSheetById(id)));
  const validSheets = sheets.filter(Boolean) as NonNullable<
    Awaited<ReturnType<typeof getRunningSheetById>>
  >[];

  // Sort sheets by date (YYYYMMDD prefix or createdAt)
  const getSheetDate = (
    sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>
  ) => {
    const m = sheet.title.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(
      sheet.createdAt instanceof Date
        ? sheet.createdAt.getTime()
        : sheet.createdAt
    );
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  validSheets.sort((a, b) => getSheetDate(a) - getSheetDate(b));

  // Helper to classify rows for a sheet
  const classifyRows = async (
    sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>
  ) => {
    const rows = await getRowsBySheetId(sheet.id);
    const sortedRows = [...rows];
    const excludedRowIds = new Set<number>();

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const obs = (row.observation ?? "").trim();
      // Surveillance commenced/ceased
      if (
        /^surveillance commenced/i.test(obs) ||
        /^surveillance ceased/i.test(obs)
      ) {
        excludedRowIds.add(row.id);
        continue;
      }
      // Travelled via — ends in "whereat" (optionally followed by : or ;)
      //                AND previous row contains "continued via" (followed by : or ;)
      if (/whereat[;:]?\s*$/i.test(obs) && i > 0) {
        const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
        if (/continued via[;:]/.test(prevObs)) {
          excludedRowIds.add(row.id);
        }
      }
    }

    const rowIds = rows.map(r => r.id);
    const members = rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];
    return { excludedRowIds, members };
  };

  const sheetWitnessList: WitnessListSheetData[] = [];

  // Overall sets (across all sheets)
  const overallPrimarySet = new Set<string>();
  const overallSecondarySet = new Set<string>();

  for (const sheet of validSheets) {
    const sheetDate = getSheetDate(sheet);
    let roster: { cin: string }[] = [];
    try {
      roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
    } catch {
      roster = [];
    }

    const { excludedRowIds, members } = await classifyRows(sheet);

    // For each CIN in roster, determine primary vs secondary
    const primarySet = new Set<string>();
    const secondarySet = new Set<string>();

    for (const entry of roster) {
      const cinUpper = entry.cin.toUpperCase();
      const cinRowIds = members
        .filter(m => m.memberName.toUpperCase() === cinUpper)
        .map(m => m.rowId);

      if (cinRowIds.length === 0) {
        // On roster but no rows — treat as secondary (on duty, no observations)
        secondarySet.add(cinUpper);
        continue;
      }

      const hasQualifyingRow = cinRowIds.some(id => !excludedRowIds.has(id));
      if (hasQualifyingRow) {
        primarySet.add(cinUpper);
      } else {
        secondarySet.add(cinUpper);
      }
    }

    // A CIN that is primary on ANY sheet is overall primary
    Array.from(primarySet).forEach(cin => {
      overallPrimarySet.add(cin);
      overallSecondarySet.delete(cin); // remove from secondary if they were added there
    });
    Array.from(secondarySet).forEach(cin => {
      if (!overallPrimarySet.has(cin)) {
        overallSecondarySet.add(cin);
      }
    });

    sheetWitnessList.push({
      sheetTitle: sheet.title,
      sheetDate,
      primary: Array.from(primarySet).sort(),
      secondary: Array.from(secondarySet).sort(),
    });
  }

  return {
    operationName,
    overallPrimary: Array.from(overallPrimarySet).sort(),
    overallSecondary: Array.from(overallSecondarySet).sort(),
    sheets: sheetWitnessList,
    producedAt: Date.now(),
    certifierCin,
  };
}
