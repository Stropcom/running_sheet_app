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
import { vaultEncrypt, vaultDecrypt, fingerprintVaultKey } from "./wipcVault";
import { cosineSimilarity } from "./faceRecognition";
import { makeRequest, type GeocodingResult } from "./_core/map";
import {
  formatIntelAddress,
  formatIntelVehicle,
  bracketCodeFromRegisteredName,
  nameWithoutBornClause,
} from "@shared/addressFormat";
import {
  VEHICLE_DEPART_PATTERN,
  VEHICLE_ARRIVE_PATTERN,
  VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN,
} from "@shared/vehicleEventPatterns";
import {
  classifyVisitDirection,
  timeBucketLabels,
  DAY_LABELS,
  buildLocationTimeGrid,
  findPeakCell,
  buildDayTimeGrid,
  mostActiveDays,
  computeHomePresenceByBucket,
  toHomePresencePercent,
  dominantRanges,
  buildDirectionHistogram,
  peakBucketIndex,
  confidenceTier,
  MIN_OBSERVATIONS_FOR_PATTERN,
  type VisitDirection,
  type LocationVisitEvent,
  type HomeEvent,
  type HomePresencePercent,
  type PeakCell,
  type ConfidenceTier,
} from "./patternOfLife";
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
  associates,
  InsertAssociate,
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
  wipcVaultKeyCheck,
  WipcMemberRecord,
  WipcOfficerProfile,
  userLocations,
  userLocationHistory,
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
  personNameMatchDecisions,
  smeacBriefings,
  SmeacBriefing,
  InsertSmeacBriefing,
  smeacAcknowledgements,
  SmeacAcknowledgement,
} from "../drizzle/schema";
import {
  findPossibleDuplicates,
  comparePersonNames,
  compareVehicleDescriptions,
  type DedupType,
  type DedupCandidateEntity,
} from "./entityDedup";
import {
  attributedRowIds,
  collapseToVisits,
  crossOperationNames,
} from "./entityAttribution";
import { buildRunningSheetTitle } from "../shared/runningSheetTitle";

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
    targetSurname: target?.surname ?? null,
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
  const normalized =
    typeof data.observation === "string"
      ? {
          ...data,
          observation: normalizeObservationPunctuation(data.observation),
        }
      : data;
  const [result] = await db.insert(sheetRows).values(normalized);
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
  await db.update(sheetRows).set(normalized).where(eq(sheetRows.id, id));
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

// Photo count per operation, for the top-level Images folder list badge —
// same live-photo filter as getAttachmentsByOperationId (excludes soft-deleted
// attachments and photos whose row-owning sheet was soft-deleted), grouped
// across every operation in one query rather than N+1 per folder.
export async function getAttachmentCountsByOperation(): Promise<
  { operationId: number; count: number }[]
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      operationId: rowAttachments.operationId,
      count: sql<number>`count(*)`,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .where(
      and(isNull(runningSheets.deletedAt), isNull(rowAttachments.deletedAt))
    )
    .groupBy(rowAttachments.operationId);
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
  /** Where this candidate photo actually came from — a different running
   * sheet (possibly weeks/months old, on a different operation entirely)
   * the officer confirming a match may have no idea exists. Null sheetId
   * means a manually-uploaded photo not attached to any row; operation
   * info is always present since every attachment has a home Operation. */
  sourceSheetId: number | null;
  sourceSheetTitle: string | null;
  sourceOperationId: number;
  sourceOperationName: string;
}

// Threshold picked from empirical testing against one real multi-face photo
// (same face re-encoded ~0.99, mirrored ~0.89, different people ~0.1-0.3).
// Was lowered to 0.25 after real operational photos showed the on-device
// MobileFace embedding's discriminative margin is narrow under real
// lighting/angle/pose variation (different people ranged roughly -0.06 to
// 0.31, one confirmed same-person cross-photo pair scored 0.45) — 0.25 was
// generous specifically to avoid missing that kind of true match. Raised
// back to 0.35 to cut down on false-positive suggestion volume; re-lower if
// operational use shows genuine matches being missed again. Matches are
// always human-confirmed, never applied automatically, so this only trades
// off review noise vs. recall, never data correctness.
export const FACE_MATCH_THRESHOLD = 0.35;
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
      sourceSheetId: sheetRows.sheetId,
      sourceSheetTitle: runningSheets.title,
      sourceOperationId: rowAttachments.operationId,
      sourceOperationName: operations.name,
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
    // A manually-uploaded photo (see rowAttachments.isManualUpload) has no
    // rowId, so these two are left joins — the candidate still always has
    // a home Operation (rowAttachments.operationId is never null).
    .leftJoin(sheetRows, eq(sheetRows.id, rowAttachments.rowId))
    .leftJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .innerJoin(operations, eq(operations.id, rowAttachments.operationId))
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
        sourceSheetId: r.sourceSheetId,
        sourceSheetTitle: r.sourceSheetTitle,
        sourceOperationId: r.sourceOperationId,
        sourceOperationName: r.sourceOperationName,
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

/** Resolves an attachment back to the running-sheet row/sheet it's attached
 * to (if any) — a manually-uploaded photo (see rowAttachments.isManualUpload)
 * may not belong to any row, in which case there's no lock/sheet to guard
 * or notify about. Used by confirmFaceMatch to check whether the row
 * holding an "Unidentified Person" photo is certified/locked before
 * auto-renaming it. */
async function getAttachmentRowSheetInfo(attachmentId: number): Promise<{
  sheetId: number;
  sheetTitle: string;
  sheetCins: string | null;
  isRowLocked: boolean;
  isSheetClosed: boolean;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      isLocked: sheetRows.isLocked,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
      sheetCins: runningSheets.sheetCins,
      closedAt: runningSheets.closedAt,
    })
    .from(rowAttachments)
    .innerJoin(sheetRows, eq(sheetRows.id, rowAttachments.rowId))
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .where(eq(rowAttachments.id, attachmentId))
    .limit(1);
  if (!row) return null;
  return {
    sheetId: row.sheetId,
    sheetTitle: row.sheetTitle,
    sheetCins: row.sheetCins,
    isRowLocked: row.isLocked,
    isSheetClosed: row.closedAt != null,
  };
}

/** Notifies a running sheet's Author and Team Leader (see sheetCins'
 * isAuthor/isTeamLeader flags) via the app's in-app notification system.
 * Deduplicates in case the same officer holds both roles. */
async function notifySheetAuthorAndTeamLeader(
  sheetCinsJson: string | null,
  params: { title: string; body: string; url: string }
) {
  let roster: { cin: string; isTeamLeader?: boolean; isAuthor?: boolean }[] =
    [];
  try {
    roster = sheetCinsJson ? JSON.parse(sheetCinsJson) : [];
  } catch {
    roster = [];
  }
  const cins = Array.from(
    new Set(
      roster
        .filter(c => c.isAuthor || c.isTeamLeader)
        .map(c => c.cin)
        .filter(Boolean)
    )
  );
  if (cins.length === 0) return;
  const users = await Promise.all(cins.map(cin => getUserByCin(cin)));
  const userIds = Array.from(
    new Set(users.filter((u): u is NonNullable<typeof u> => !!u).map(u => u.id))
  );
  if (userIds.length === 0) return;
  await createNotificationsForUsers(userIds, {
    ...params,
    sourceModule: "faceRecognition",
  });
}

export async function confirmFaceMatch(
  newLinkId: number,
  matchedLinkId: number
): Promise<{ applied: boolean; blockedRowLocked: boolean }> {
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

  // A genuine identification — an Unidentified Person pool resolving to a
  // real Target/Associate — is the only case that needs a lock guard and a
  // notification. entityKey is unique per (attachmentId, faceIndex) for
  // unidentified_person links (see the dedup index above), so the loser
  // side here is always exactly the one photo/face being confirmed.
  const isRealIdentification =
    loser.category === "unidentified_person" &&
    winner.category !== "unidentified_person";

  const loserRowInfo = isRealIdentification
    ? await getAttachmentRowSheetInfo(loser.attachmentId)
    : null;
  const loserRowLocked =
    !!loserRowInfo?.isRowLocked || !!loserRowInfo?.isSheetClosed;

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

  // Certified rows are evidentiary — a Facial Recognition match must never
  // silently rewrite one. Skip the rename and fall through to the
  // "needs manual review" notification below instead.
  if (!(isRealIdentification && loserRowLocked)) {
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

  if (isRealIdentification && loserRowInfo) {
    const winnerRowInfo = await getAttachmentRowSheetInfo(winner.attachmentId);
    const otherSheetClause = winnerRowInfo
      ? `an image in '${winnerRowInfo.sheetTitle}'`
      : "a linked photo";
    const url = `/sheet/${loserRowInfo.sheetId}`;
    if (loserRowLocked) {
      await notifySheetAuthorAndTeamLeader(loserRowInfo.sheetCins, {
        title: "Facial Recognition match needs review — row is certified",
        body: `An unidentified Person in Running Sheet '${loserRowInfo.sheetTitle}' has a possible Facial Recognition match (${winner.entityLabel}) from ${otherSheetClause}, but the row is certified/locked so it could not be updated automatically. You need to review '${loserRowInfo.sheetTitle}' and confirm manually.`,
        url,
      });
    } else {
      await notifySheetAuthorAndTeamLeader(loserRowInfo.sheetCins, {
        title: "Unidentified person identified via Facial Recognition",
        body: `An unidentified Person in Running Sheet '${loserRowInfo.sheetTitle}' has been identified through Facial Recognition from ${otherSheetClause}. You need to review '${loserRowInfo.sheetTitle}'.`,
        url,
      });
    }
  }

  return {
    applied: !(isRealIdentification && loserRowLocked),
    blockedRowLocked: isRealIdentification && loserRowLocked,
  };
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
      extraAddresses: targets.extraAddresses,
      wildFields: targets.wildFields,
      firstNames: targets.firstNames,
      surname: targets.surname,
      bornDate: targets.bornDate,
      addrUnitNo: targets.addrUnitNo,
      addrHouseNo: targets.addrHouseNo,
      addrStreetName: targets.addrStreetName,
      addrStreetType: targets.addrStreetType,
      addrSuburb: targets.addrSuburb,
      addrState: targets.addrState,
      addrBusinessName: targets.addrBusinessName,
      vehRegistration: targets.vehRegistration,
      vehState: targets.vehState,
      vehColour: targets.vehColour,
      vehMake: targets.vehMake,
      vehModel: targets.vehModel,
      vehType: targets.vehType,
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

  // targets.operationId is a nullable legacy column — a registry target's
  // real operations live in operation_target_links. Without this the
  // cross-operation target picker showed no "Op:" label for registry
  // targets and couldn't find them by operation name in its search.
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id));

  const namesByTarget = new Map<number, Set<string>>();
  for (const l of links) {
    if (!l.operationName) continue;
    if (!namesByTarget.has(l.targetId))
      namesByTarget.set(l.targetId, new Set());
    namesByTarget.get(l.targetId)!.add(l.operationName);
  }

  return rows.map(r => {
    const names = new Set(namesByTarget.get(r.id) ?? []);
    // The legacy FK still counts as a link where it's set.
    if (r.operationName) names.add(r.operationName);
    return {
      ...r,
      operationName: names.size ? Array.from(names).join(", ") : null,
    };
  });
}

export async function createTarget(data: InsertTarget) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targets).values(data);
  return { id: (result as any).insertId as number };
}

// ─── Person Identity Links (Target ↔ Associate) ────────────────────────────
// An officer creating a new Target or Associate can confirm that a
// possible-duplicate match really is the same real person as an existing
// Associate/Target elsewhere in the registry. Neither record is converted
// or deleted — both keep existing under their own role — but their shared
// identity fields below are copied in at creation, then kept in sync on
// every later edit to either side (see updateTarget/updateAssociate).
// Linking and syncing both run inside a single DB transaction: if either
// side's write fails, the whole operation rolls back rather than leaving
// the two records out of sync with each other.
const LINKED_SYNC_FIELDS = [
  "firstNames",
  "surname",
  "bornDate",
  "name",
  "tgt",
  "addrUnitNo",
  "addrHouseNo",
  "addrStreetName",
  "addrStreetType",
  "addrSuburb",
  "addrState",
  "addrBusinessName",
  "hbf",
  "hb",
  "vehRegistration",
  "vehState",
  "vehColour",
  "vehMake",
  "vehModel",
  "vehType",
  "v1f",
  "v1",
  "extraAddresses",
  "extraVehicles",
] as const;
type LinkedSyncField = (typeof LINKED_SYNC_FIELDS)[number];
type LinkedSyncData = Partial<Record<LinkedSyncField, string | null>>;

/** Narrows an update payload down to just the fields two linked records
 * share, so a target-only field (dep/arr/wildFields) or associate-only
 * field never gets written to the other side. */
function pickLinkedSyncFields(data: Record<string, unknown>): LinkedSyncData {
  const out: LinkedSyncData = {};
  for (const f of LINKED_SYNC_FIELDS) {
    if (f in data) out[f] = data[f as keyof typeof data] as string | null;
  }
  return out;
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
      | "firstNames"
      | "surname"
      | "bornDate"
      | "addrUnitNo"
      | "addrHouseNo"
      | "addrStreetName"
      | "addrStreetType"
      | "addrSuburb"
      | "addrState"
      | "addrBusinessName"
      | "vehRegistration"
      | "vehState"
      | "vehColour"
      | "vehMake"
      | "vehModel"
      | "vehType"
      | "extraAddresses"
    >
  >,
  /** Set when the officer has explicitly chosen "Add new" over "Edit
   * current" for a given HB/V1/extra-address/extra-vehicle field — see
   * TargetRegistry.tsx. Archives the current value into target_field_history
   * (the same "Previous" record the duplicate-target merge flow already
   * writes) before the new value applies, so a genuine change is preserved
   * while a plain typo-fix isn't. Extra addresses/vehicles are matched by
   * their stable `id` (see ExtraAddress/ExtraVehicle in
   * TargetStructuredFields.tsx), not array position, since entries can be
   * added/removed/reordered around them. */
  options?: {
    isNewAddress?: boolean;
    isNewVehicle?: boolean;
    newExtraAddressIds?: string[];
    newExtraVehicleIds?: string[];
    byCIN?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db.transaction(async tx => {
    const hasExtraChanges =
      (options?.newExtraAddressIds?.length ?? 0) > 0 ||
      (options?.newExtraVehicleIds?.length ?? 0) > 0;

    if (options?.isNewAddress || options?.isNewVehicle || hasExtraChanges) {
      const [current] = await tx
        .select()
        .from(targets)
        .where(eq(targets.id, id))
        .limit(1);
      if (current) {
        const now = Date.now();
        const historyRows: InsertTargetFieldHistory[] = [];
        if (
          options?.isNewAddress &&
          current.hbf &&
          current.hbf.trim() &&
          current.hbf.trim() !== (data.hbf ?? "").trim()
        ) {
          historyRows.push({
            targetId: id,
            fieldName: "hbf",
            previousValue: current.hbf,
            supersededAt: now,
            supersededByCIN: options.byCIN ?? null,
          });
        }
        if (
          options?.isNewVehicle &&
          current.v1f &&
          current.v1f.trim() &&
          current.v1f.trim() !== (data.v1f ?? "").trim()
        ) {
          historyRows.push({
            targetId: id,
            fieldName: "v1f",
            previousValue: current.v1f,
            supersededAt: now,
            supersededByCIN: options.byCIN ?? null,
          });
        }

        const parseJsonArray = (
          json: string | null | undefined
        ): Array<{ id?: string; full?: string }> => {
          if (!json) return [];
          try {
            return JSON.parse(json);
          } catch {
            return [];
          }
        };

        if (options?.newExtraAddressIds?.length) {
          const oldEntries = parseJsonArray(current.extraAddresses);
          const newEntries = parseJsonArray(data.extraAddresses);
          for (const entryId of options.newExtraAddressIds) {
            const oldEntry = oldEntries.find(e => e.id === entryId);
            const newEntry = newEntries.find(e => e.id === entryId);
            if (
              oldEntry?.full &&
              oldEntry.full.trim() &&
              oldEntry.full.trim() !== (newEntry?.full ?? "").trim()
            ) {
              historyRows.push({
                targetId: id,
                fieldName: `extraAddress:${entryId}`,
                previousValue: oldEntry.full,
                supersededAt: now,
                supersededByCIN: options.byCIN ?? null,
              });
            }
          }
        }
        if (options?.newExtraVehicleIds?.length) {
          const oldEntries = parseJsonArray(current.extraVehicles);
          const newEntries = parseJsonArray(data.extraVehicles);
          for (const entryId of options.newExtraVehicleIds) {
            const oldEntry = oldEntries.find(e => e.id === entryId);
            const newEntry = newEntries.find(e => e.id === entryId);
            if (
              oldEntry?.full &&
              oldEntry.full.trim() &&
              oldEntry.full.trim() !== (newEntry?.full ?? "").trim()
            ) {
              historyRows.push({
                targetId: id,
                fieldName: `extraVehicle:${entryId}`,
                previousValue: oldEntry.full,
                supersededAt: now,
                supersededByCIN: options.byCIN ?? null,
              });
            }
          }
        }

        if (historyRows.length > 0) {
          await tx.insert(targetFieldHistory).values(historyRows);
        }
      }
    }

    await tx.update(targets).set(data).where(eq(targets.id, id));

    // Propagate shared identity fields to a linked associate, if this target
    // is linked to one — blocking (the whole transaction rolls back) rather
    // than letting the two records drift out of sync.
    const [linkRow] = await tx
      .select({ linkedAssociateId: targets.linkedAssociateId })
      .from(targets)
      .where(eq(targets.id, id))
      .limit(1);
    if (linkRow?.linkedAssociateId) {
      const synced = pickLinkedSyncFields(data);
      if (Object.keys(synced).length > 0) {
        await tx
          .update(associates)
          .set(synced as Partial<InsertAssociate>)
          .where(eq(associates.id, linkRow.linkedAssociateId));
      }
    }

    return { id };
  });
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
  // Associates always belong to exactly one target and have no life of
  // their own once it's gone — leaving them behind orphaned real rows
  // that getAllIntelligenceEntities() would otherwise keep surfacing as
  // permanent "INDICES" vehicle/address entities with no way to remove them.
  await db.delete(associates).where(eq(associates.targetId, id));
  // Drop the "tagged to this target" links — the underlying photos stay
  // (they still belong to their own operation), just untagged from a
  // target that no longer exists.
  await db
    .delete(attachmentEntityLinks)
    .where(
      and(
        eq(attachmentEntityLinks.category, "target"),
        eq(attachmentEntityLinks.targetId, id)
      )
    );
  await db.delete(targets).where(eq(targets.id, id));
}

// ─── Associates ─────────────────────────────────────────────────────────────
// A person linked to a target as a known associate — structured the same
// way as a target (own name/address/vehicle), always belongs to exactly one
// target. See drizzle/schema.ts for the full field list.

export async function getAssociatesForTarget(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(associates)
    .where(and(eq(associates.targetId, targetId), isNull(associates.deletedAt)))
    .orderBy(associates.name);
}

/** Same as getAssociatesForTarget, plus each row's "Indices" (not yet
 * corroborated by a real running-sheet observation) status — for display in
 * the Target Registry's Associates list. */
export async function getAssociatesForTargetWithIndices(targetId: number) {
  const rows = await getAssociatesForTarget(targetId);
  const allEntities = await getAllIntelligenceEntities();
  const indicesByAssociateId = new Map(
    allEntities
      .filter(e => e.isAssociate && e.associateId != null)
      .map(e => [e.associateId as number, e.isIndicesOnly ?? false])
  );
  return rows.map(a => ({
    ...a,
    isIndicesOnly: indicesByAssociateId.get(a.id) ?? false,
  }));
}

export async function getAssociateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [result] = await db
    .select()
    .from(associates)
    .where(eq(associates.id, id))
    .limit(1);
  return result;
}

export async function createAssociate(data: InsertAssociate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(associates).values(data);
  return { id: (result as any).insertId as number };
}

export async function updateAssociate(
  id: number,
  data: Partial<
    Pick<
      InsertAssociate,
      | "name"
      | "tgt"
      | "firstNames"
      | "surname"
      | "bornDate"
      | "hbf"
      | "hb"
      | "addrUnitNo"
      | "addrHouseNo"
      | "addrStreetName"
      | "addrStreetType"
      | "addrSuburb"
      | "addrState"
      | "addrBusinessName"
      | "v1f"
      | "v1"
      | "vehRegistration"
      | "vehState"
      | "vehColour"
      | "vehMake"
      | "vehModel"
      | "vehType"
      | "extraAddresses"
      | "extraVehicles"
    >
  >
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    await tx.update(associates).set(data).where(eq(associates.id, id));

    // Propagate shared identity fields to a linked target, if this
    // associate is linked to one — blocking (the whole transaction rolls
    // back) rather than letting the two records drift out of sync.
    const [linkRow] = await tx
      .select({ linkedTargetId: associates.linkedTargetId })
      .from(associates)
      .where(eq(associates.id, id))
      .limit(1);
    if (linkRow?.linkedTargetId) {
      const synced = pickLinkedSyncFields(data);
      if (Object.keys(synced).length > 0) {
        await tx
          .update(targets)
          .set(synced as Partial<InsertTarget>)
          .where(eq(targets.id, linkRow.linkedTargetId));
      }
    }

    return { id };
  });
}

/**
 * Creates a new Target pre-filled from `data`, linked to an existing
 * Associate record confirmed to be the same real person (see "Person
 * Identity Links" above createTarget). Both records survive independently;
 * only their shared fields (LINKED_SYNC_FIELDS) stay in sync from here on.
 */
export async function createTargetLinkedToAssociate(
  data: Omit<InsertTarget, "operationId"> & { operationId?: number | null },
  existingAssociateId: number
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const [existing] = await tx
      .select({ linkedTargetId: associates.linkedTargetId })
      .from(associates)
      .where(eq(associates.id, existingAssociateId))
      .limit(1);
    if (!existing) throw new Error("Associate not found");
    if (existing.linkedTargetId) {
      throw new Error(
        "This associate is already linked to another target record."
      );
    }
    const [result] = await tx.insert(targets).values({
      ...data,
      operationId: data.operationId ?? null,
      linkedAssociateId: existingAssociateId,
    });
    const newTargetId = (result as any).insertId as number;
    await tx
      .update(associates)
      .set({ linkedTargetId: newTargetId })
      .where(eq(associates.id, existingAssociateId));
    return { id: newTargetId };
  });
}

/**
 * Creates a new Associate pre-filled from `data`, linked to an existing
 * Target record confirmed to be the same real person. Mirror of
 * createTargetLinkedToAssociate above.
 */
export async function createAssociateLinkedToTarget(
  data: InsertAssociate,
  existingTargetId: number
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const [existing] = await tx
      .select({ linkedAssociateId: targets.linkedAssociateId })
      .from(targets)
      .where(eq(targets.id, existingTargetId))
      .limit(1);
    if (!existing) throw new Error("Target not found");
    if (existing.linkedAssociateId) {
      throw new Error(
        "This target is already linked to another associate record."
      );
    }
    const [result] = await tx.insert(associates).values({
      ...data,
      linkedTargetId: existingTargetId,
    });
    const newAssociateId = (result as any).insertId as number;
    await tx
      .update(targets)
      .set({ linkedAssociateId: newAssociateId })
      .where(eq(targets.id, existingTargetId));
    return { id: newAssociateId };
  });
}

export async function softDeleteAssociate(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(associates)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(associates.id, id));
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

  const allEntities = await getAllIntelligenceEntities();
  const indicesByTargetId = new Map(
    allEntities
      .filter(e => e.isTarget && e.targetId != null)
      .map(e => [e.targetId as number, e.isIndicesOnly ?? false])
  );

  return allTargets.map(t => ({
    ...t,
    linkedOperations: linkMap.get(t.id) ?? [],
    isIndicesOnly: indicesByTargetId.get(t.id) ?? false,
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

// Hoisted out of extractEntitiesFromText so other detection logic (see the
// vague-vehicle matching below) can reuse the same make list rather than
// duplicating it.
export const VEHICLE_MAKES_PATTERN =
  /\b(toyota|ford|holden|honda|mazda|nissan|mitsubishi|subaru|hyundai|kia|volkswagen|vw|bmw|mercedes|audi|lexus|volvo|jeep|dodge|chevrolet|chevy|ram|gmc|chrysler|fiat|alfa|peugeot|renault|citroen|skoda|seat|suzuki|isuzu|daihatsu|ssangyong|great wall|gwm|haval|mg|byd|tesla|rivian|land rover|range rover|defender|discovery|jaguar|porsche|ferrari|lamborghini|maserati|bentley|rolls royce|aston martin|mclaren|lotus|mini|smart|dacia|lancia|opel|vauxhall|saab|pontiac|buick|cadillac|lincoln|infiniti|acura|genesis|lucid|polestar|scout|rivian)\b/i;

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
    // Address detection (below) is scoped to the last SENTENCE before the
    // bracket, not the whole fullDescription — a legitimate address
    // routinely spans a comma ("44 Smith Street, PALMYRA WA"), so it can't
    // be scoped as tightly as the clause-level vehicle check above, but it
    // should never span a full stop into an unrelated earlier sentence.
    // Without this, a row that opens with a plain-prose address statement
    // and no bracket of its own ("Vehicles visible at 81 Redmond Road.")
    // followed by the row's first bracketed entity — e.g. a vehicle,
    // "A green Toyota Prado, bearing WA registration WTQ304 (Vehicle
    // WTQ304)" — lets the regex's fullDescription capture balloon backward
    // across the sentence boundary (nothing bounds it until it hits the
    // opening "(" or the 120-char cap), and the leading sentence's address
    // pattern gets misapplied to the vehicle.
    const lastSentence = (
      fullDescription.split(/(?<=[.!?])\s+/).pop() ?? fullDescription
    ).trim();

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
        lastSentence
      ) ||
      STREET_TYPES.test(shortForm) ||
      /^\d{1,5}\s/.test(shortForm) ||
      // cnr / corner of addresses: "cnr Smith St and Jones Ave"
      /^(cnr|corner of|corner)\b/i.test(shortForm) ||
      /^(cnr|corner of|corner)\b/i.test(lastSentence) ||
      // Lot numbers: "Lot 42 Smith Road"
      /^lot\s+\d+/i.test(shortForm) ||
      // Google Maps formatted addresses: "131 Lakey St, Southern River WA 6110, Australia"
      // Pattern: number + street name + suburb + STATE + postcode (+ optional ", Australia")
      /\b\d{1,5}[A-Za-z]?\/\d{1,5}\s/.test(shortForm) || // unit/number e.g. "3/12 Smith St"
      /\b\d{1,5}[A-Za-z]?\/\d{1,5}\s/.test(lastSentence) ||
      /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
        shortForm
      ) ||
      /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
        lastSentence
      ) ||
      /,\s*Australia\s*$/.test(shortForm) ||
      /,\s*Australia\s*$/.test(lastSentence) ||
      // Airport terminals, train stations, bus stops, ports, gates, platforms.
      // "station" is excluded when it's followed by "wagon"/"sedan" — that's
      // the vehicle body-style term ("station wagon"/"station sedan"), not a
      // transit station, and would otherwise misclassify a vehicle mention
      // like "...Passat station sedan, bearing WA registration 1DHY084
      // (Vehicle 1DHY084)..." as an address before the vehicle keywords
      // ("registration", "Vehicle") are even considered — address detection
      // runs first, so this exclusion has to live here rather than being
      // resolved by the vehicle-keyword check further down.
      /\b(terminal|gate|platform|pier|bay|berth|concourse|departure|arrival|lounge)\s+\d/i.test(
        shortForm
      ) ||
      /\b(airport|station(?!\s+(?:wagon|sedan)\b)|terminus|port|wharf|depot|interchange|shopping centre|shopping center|shopping mall|mall|plaza|precinct)\b/i.test(
        shortForm
      ) ||
      /\b(airport|station(?!\s+(?:wagon|sedan)\b)|terminus|port|wharf|depot|interchange)\b/i.test(
        lastSentence
      );

    // ── WA vehicle registration patterns ─────────────────────────────────────
    // WA standard: 1ABC234 (digit + 3 letters + 3 digits) or older ABC-123 / ABC 123
    // Also: 1AB 234, personalised plates (letters only up to 6 chars)
    const WA_REGO =
      /^\d[A-Z]{2,3}\d{3}$|^[A-Z]{1,3}[-\s]?\d{3}$|^[A-Z0-9]{2,7}$/.test(
        shortForm.replace(/\s/g, "").toUpperCase()
      );
    // Broader vehicle make/model keywords
    const VEHICLE_MAKES = VEHICLE_MAKES_PATTERN;
    const VEHICLE_BODY =
      /\b(vehicle|car|truck|van|ute|sedan|hatchback|suv|wagon|coupe|convertible|roadster|pickup|4wd|4x4|cab|dual cab|single cab|tray|flatbed|panel van|people mover|minivan|bus|minibus|motorcycle|motorbike|bike|scooter|quad|atv|boat|trailer|caravan|motorhome|rv|bearing|registration|rego|reg|plate|plated)\b/i;
    // A shortForm that looks like an all-caps person name (letters/spaces/
    // hyphens/apostrophes/periods only, no digits) should never be classified
    // as a vehicle just because "vehicle" or a make appears somewhere in the
    // same clause — see the guard on the VEHICLE_BODY/MAKES branch below.
    // Periods are allowed for the "P.HILL" initial-plus-surname convention
    // officers use to disambiguate family members sharing a surname.
    const shortFormLooksLikeName =
      /^[A-Z][A-Z\s'.-]{1,40}$/.test(shortForm) && !/\d/.test(shortForm);

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
    else if (WA_REGO && !shortFormLooksLikeName) {
      // Only treat as rego if it doesn't look like an all-caps name. This used
      // to require 4+ letters to count as "looks like a name", which let any
      // short (2-3 letter) all-caps bracket code — a perfectly ordinary short
      // surname like "CAT", "FOX", "LEE", "COX" — fall through and match the
      // personalised-plate branch of WA_REGO (`^[A-Z0-9]{2,7}$`) instead of
      // being classified as a person. That misclassification was silent but
      // significant: a person entity classified as a vehicle never runs
      // through the person-specific fuzzy-match check against the Target/
      // Associate Registry (see checkPossibleTargetMatches / SheetDetail's
      // updateRowWithDupeCheck), so the "possible duplicate" prompt never
      // fired even for an exact match. Reusing shortFormLooksLikeName (already
      // used one branch up for the same purpose) excludes any all-caps,
      // digit-free bracket code regardless of length, which is what "looks
      // like a name" actually means here.
      type = "vehicle";
      confidence = "medium";
    }
    // Person: shortForm is all-caps word(s) with no digits, no street number
    // pattern — periods allowed for "P.HILL" initial-plus-surname short forms
    // (see shortFormLooksLikeName above).
    else if (
      /^[A-Z][A-Z\s'.-]{1,40}$/.test(shortForm) &&
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
      // For vehicle entities: build a display name as "REGO <description as written>".
      // The shortForm is typically "Vehicle REGO" (e.g. "Vehicle 1FBP509") or just the rego.
      // The fullDescription is the text immediately before the bracket, e.g.:
      //   "A white Toyota Landcruiser, bearing WA registration 1FBP509"
      //   "black Subaru WRX, bearing WA registration 1FDD444"
      //   "1HTU905" (bare rego, no description)
      //
      // Previously this reconstructed the description by matching against
      // hardcoded lists of car makes/models/body-types — which silently
      // dropped anything not on those lists: motorcycle makes ("Harley
      // Davidson"), motorcycle models ("Fatboy"), car models missing from the
      // list ("Monaro"), multi-word makes ("Mercedes Benz"), etc. Instead,
      // keep the description exactly as the officer wrote it: everything
      // before the rego mention, minus the trailing "bearing WA
      // registration"/"registration"/"rego"/"reg"/"plate" boilerplate clause.

      // Step 1: extract raw rego
      const rawRego = shortForm.replace(/^vehicle\s+/i, "").trim();

      // Everything below assumes rawRego IS a real registration and
      // searches for that exact text inside fullDescription to find where
      // the description ends. That assumption breaks for a vague/no-rego
      // sighting bracketed with a make/model instead of a plate — e.g.
      // "(Vehicle White Hyundai)" on "a white Hyundai Santa Fe,
      // registration unable to be observed" — where "White Hyundai" is
      // also a substring of the description itself, so regoIdx lands
      // mid-sentence and truncates descSource to a fragment ("a"). A real
      // WA rego is short and never spells out a recognised make, so guard
      // the whole reconstruction on that instead of assuming every bracket
      // is a plate.
      const rawRegoCompact = rawRego.replace(/\s/g, "").toUpperCase();
      const rawRegoLooksLikeRealRego =
        /^\d[A-Z]{2,3}\d{3}$/.test(rawRegoCompact) ||
        (/^[A-Z0-9]{2,7}$/.test(rawRegoCompact) &&
          !VEHICLE_MAKES_PATTERN.test(rawRego));

      if (!rawRegoLooksLikeRealRego) {
        // Descriptive bracket, not a real rego — the bracket text itself
        // (minus the "Vehicle " prefix) already IS the description; there's
        // nothing in fullDescription to reconstruct around.
        displayName = rawRego || shortForm;
      } else {
        // Step 2: find the description text — everything before the rego
        // mention. If the rego quoted in the text doesn't match the bracket's
        // rego (e.g. a typo), regoIdx is -1 and the whole fullDescription is
        // used instead — the boilerplate-stripping step below also swallows a
        // trailing rego-shaped token in that case, so the mismatched number
        // doesn't leak into the description either way.
        const regoIdx = fullDescription
          .toUpperCase()
          .indexOf(rawRego.toUpperCase());
        let descSource =
          regoIdx > 0 ? fullDescription.slice(0, regoIdx) : fullDescription;

        const STATE_CODES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";
        descSource = descSource
          .replace(
            new RegExp(
              `[,;]?\\s*(?:bearing\\s+)?(?:(?:${STATE_CODES})\\s+)?(?:registration|rego|reg\\.?|plated?)\\s*:?\\s*(?:\\d[A-Za-z0-9]{2,7})?\\s*$`,
              "i"
            ),
            ""
          )
          .replace(/[,;]\s*$/, "")
          .trim();

        // A real vehicle description is a short noun phrase (colour + make +
        // model + trim + body, typically 2-5 words). When an officer embeds
        // that same phrase in a longer narrative sentence instead of writing
        // it tersely — "WINMAR and LOWE walked through the car park to a blue
        // Mercedes Benz C250 sedan, bearing WA registration 1HFD521" — keeping
        // the whole clause up to the rego drags the narrative prose in too.
        // Cut at the LAST standalone article ("a"/"an"/"the") — that's
        // reliably where the noun phrase describing the vehicle starts, since
        // narrative lead-ins almost always end "...to a", "...into an",
        // "...near the", etc. Falls back to a generous word-count cap when no
        // article is present, as a backstop against unbounded narrative text
        // with no article at all.
        const articlePattern = /\b(?:a|an|the)\s+(?=\S)/gi;
        let lastArticleEnd = -1;
        let articleMatch: RegExpExecArray | null;
        while ((articleMatch = articlePattern.exec(descSource)) !== null) {
          lastArticleEnd = articleMatch.index + articleMatch[0].length;
        }
        if (lastArticleEnd >= 0) {
          descSource = descSource.slice(lastArticleEnd);
        } else {
          const words = descSource.split(/\s+/).filter(Boolean);
          if (words.length > 8) descSource = words.slice(-8).join(" ");
        }
        descSource = descSource
          .replace(/^vehicle\s+/i, "")
          .replace(/\s+/g, " ")
          .trim();

        if (rawRego && rawRego !== shortForm) {
          // Had "Vehicle REGO" format — use rego + description as written
          displayName = descSource ? `${rawRego} ${descSource}` : rawRego;
        } else if (descSource) {
          // shortForm is already just the rego
          displayName = `${rawRego} ${descSource}`;
        }
        // else: keep displayName = shortForm (bare rego, no description available)
      }
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
      // "P.HILL"-style short forms (one or more initials + period + surname,
      // used to disambiguate family members sharing a surname) never appear
      // verbatim in the full name ("Peter HILL" has no "P.HILL" substring),
      // so recognise them separately: the candidate's last word must match
      // the surname and its first word must start with the first initial.
      const initialSurnameMatch = shortForm.match(
        /^((?:[A-Z]\.)+)([A-Z]{2,})$/
      );

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
        // shortForm must be contained within the candidate (case-insensitive),
        // or — for "P.HILL" style short forms — the candidate's surname and
        // first initial must match.
        const candidateWordsUpper = candidate.toUpperCase().split(/\s+/);
        const shortInCandidate =
          candidate.toUpperCase().includes(shortForm.toUpperCase()) ||
          (initialSurnameMatch !== null &&
            candidateWordsUpper[candidateWordsUpper.length - 1] ===
              initialSurnameMatch[2] &&
            candidateWordsUpper[0].startsWith(initialSurnameMatch[1][0]));
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
  /** True when this entity comes from a formal registry associate record (not just observation text) */
  isAssociate?: boolean;
  /** For associate entities: the numeric DB id of the associate record */
  associateId?: number | null;
  /** For associate entities: the parent target this associate belongs to */
  associateOfTargetId?: number | null;
  associateOfTargetName?: string | null;
  /**
   * True when every occurrence of this entity is synthetic (rowId 0) — i.e.
   * it exists only because it was typed into the Target Registry (or another
   * non-running-sheet source), and has never actually been mentioned in a
   * real observation row yet. Drives the "Indices" badge: the moment a real
   * (rowId > 0) occurrence appears, this flips to false permanently, since
   * the information is now corroborated by a running sheet.
   */
  isIndicesOnly?: boolean;
  /**
   * Set when this entity's Target/Associate card is linked (via
   * targets.linkedAssociateId / associates.linkedTargetId — see "Person
   * Identity Links" above updateTarget) to a card of the other kind for
   * the same real person. Both entities' occurrences are unioned so
   * either profile shows the complete picture; this points at the other
   * one so the UI can flag "identical profile" and link across.
   */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
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

/**
 * Merges address/vehicle entities of one type where one shortForm is a
 * strict prefix of another (e.g. "1 Smith Street" absorbed into "1 Smith
 * Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux") — the same
 * real-world thing recognised twice: once from a registry card, once from
 * observation text, under two different labels. Exported and pure (no DB)
 * so this can be tested directly — see entityMerge.test.ts.
 *
 * IMPORTANT constraints:
 *   - Only meaningful for "address" and "vehicle" types (NOT persons or
 *     businesses) because person names share common prefixes legitimately
 *     (SMITH vs SMITH JONES) — callers should only invoke this for a group
 *     that's already been filtered to one of those two types.
 *   - isTarget entities are never passed to this pass.
 *   - The shorter form must end at a natural word boundary in the longer
 *     form (space, comma, semicolon, dash, or slash) to avoid false merges.
 *
 * `absorbed` is tracked by entity object, not by shortForm string: when a
 * registry entity and a text-mined entity for the same place format to the
 * exact same label — the normal case once registry addresses are tidied for
 * display (see 17e2229) — a string-keyed set can't tell "the entity that got
 * absorbed" from "the entity it was absorbed into"; they're the same string.
 * That collision used to silently drop the merged survivor (all its
 * occurrences included) from the output entirely, precisely whenever a
 * registry card and an observation-derived mention of the same address
 * coincided — the case that matters most.
 */
export function mergeContainedEntities(
  group: IntelligenceEntity[],
  entityType: "address" | "vehicle"
): IntelligenceEntity[] {
  // Sort by shortForm length descending so longer (fuller) versions come first
  const sorted = [...group].sort(
    (a, b) => b.shortForm.length - a.shortForm.length
  );
  const absorbed = new Set<IntelligenceEntity>();
  const survivors: IntelligenceEntity[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const longer = sorted[i];
    const longerLower = longer.shortForm.toLowerCase().trim();
    if (absorbed.has(longer)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const shorter = sorted[j];
      const shorterLower = shorter.shortForm.toLowerCase().trim();
      if (absorbed.has(shorter)) continue;

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
        absorbed.add(shorter);
      }
    }

    // Only keep this entity if it was NOT itself absorbed by a longer one
    if (!absorbed.has(longer)) {
      survivors.push(longer);
    }
  }

  return survivors;
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

/**
 * Extracts the trailing "(<short form>)" bracket content from a composed
 * HBF-style address string (e.g. "6 Shearman Street, ATTADALE WA (6
 * Shearman Street)" -> "6 shearman street") — the same short text an
 * observation row's own "(ShortForm)" bracket would contain for the same
 * address. Registry address fields must key on this, not the full
 * street/suburb/state description, or a registry-sourced address entity can
 * never match (and therefore never get corroborated by) a text-mined
 * mention of the same real-world address. Falls back to the whole
 * (normalized) string when there's no trailing bracket, e.g. legacy
 * free-text data entered before the structured address fields existed.
 */
export function addressBracketKey(text: string): string {
  const m = text.match(/\(([^()]{1,120})\)\s*$/);
  return (m ? m[1] : text).toLowerCase().replace(/\s+/g, " ").trim();
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

// ─── Observation Punctuation Normalization ─────────────────────────────────
// Officers write vehicle mentions and depart/arrive rows via several
// paths — the QE popup's autocomplete, the "Vehicle arriving"/"Vehicle
// departing" chips, and free typing — and only the chips are guaranteed to
// produce consistent punctuation. Two gaps matter enough to auto-correct
// at save time, applied here rather than per-client-callsite so it's
// enforced once regardless of how the text reached the server:
//
//   1. A comma should always follow a "(Vehicle REGO)" bracket. Cosmetic
//      on its own, but the NEXT bracketed entity in the same sentence is
//      found by scanning forward from here (see extractEntitiesFromText's
//      fullDescription capture), so a missing separator can let an
//      unrelated earlier clause bleed into that next entity's
//      classification.
//   2. A comma must precede "departed"/"arrived" following a "Vehicle
//      REGO" mention — this one is load-bearing, not cosmetic:
//      VEHICLE_DEPART_PATTERN / VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN
//      below require that exact comma to match at all, and
//      getPendingVehicleDepartures/getPendingVehicleArrivals silently miss
//      the row without it — the QE "Vehicle arriving"/"Vehicle departing"
//      chip just never appears.
//
// Deliberately structural, not phrase-based: it doesn't try to recognise
// "driver"/"passenger"/"unseen occupant/s"/etc — it only looks for the
// fixed "Vehicle REGO ... departed/arrived" shape the parsing patterns
// below already use, so any occupant phrasing (present or future) is
// covered without a maintained word list. Only ever applied when a row is
// created or edited (see createSheetRow/updateSheetRow) — never
// retroactively rewritten, and the row.update procedure already refuses a
// locked row before this can run.
export function normalizeObservationPunctuation(text: string): string {
  if (!text) return text;
  let result = text;

  // Rule 1: comma right after a "(Vehicle REGO)" bracket, unless the next
  // non-space character already closes the clause (,.;:)\n) or the
  // bracket is the last thing in the text.
  result = result.replace(
    /\(Vehicle\s+[A-Za-z0-9]{2,8}\)/gi,
    (bracket: string, offset: number, str: string) => {
      const rest = str.slice(offset + bracket.length);
      const peek = rest.match(/^(\s*)(\S)?/);
      const ws = peek?.[1] ?? "";
      const nextChar = peek?.[2];
      if (nextChar === undefined) return bracket; // end of text — leave alone
      if (ws.includes("\n")) return bracket; // paragraph break already separates it
      if (/[,.;:)]/.test(nextChar)) return bracket; // already closed
      // ws (if any) is NOT part of the regex match, so it's left untouched
      // in the source string right after whatever we return here — only
      // add a space ourselves when there's no existing whitespace to rely
      // on, otherwise we'd double it up.
      return ws.length > 0 ? `${bracket},` : `${bracket}, `;
    }
  );

  // Rule 2: for a "Vehicle REGO ... departed/arrived" narrative, make sure
  // there's a comma right after the rego and right before the keyword.
  // Mirrors VEHICLE_DEPART_PATTERN/VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN's
  // own single-line-only reach (no dotAll flag) so this never "fixes" a
  // pairing those patterns wouldn't actually recognise as one event. The
  // "(?<!\()" guard skips a "Vehicle REGO" mention that's actually the
  // CONTENT of a "(Vehicle REGO)" bracket (Rule 1's job, above) — without
  // it, "Vehicle 1ABC123 (Vehicle 1ABC123) ... departed" would wrongly
  // treat the bracket's own closing ")" as part of this narrative.
  result = result.replace(
    /(?<!\()\bVehicle\s+([A-Za-z0-9]{5,8})(,?)(\s*)(.+?)(,?)(\s*)(departed|arrived)\b/gi,
    (
      _match: string,
      rego: string,
      commaAfterRego: string,
      wsAfterRego: string,
      middle: string,
      commaBeforeKeyword: string,
      wsBeforeKeyword: string,
      keyword: string
    ) =>
      `Vehicle ${rego}${commaAfterRego || ","}${wsAfterRego}${middle}${commaBeforeKeyword || ","}${wsBeforeKeyword}${keyword}`
  );

  return result;
}

// ─── Vehicle Depart → Arrive Continuity ────────────────────────────────────
// Officers write vehicle departures in a fixed narrative pattern —
// "Vehicle 1FAD531 HOGAN driver, Denise HOLLY (HOLLY) front passenger,
// departed 34 Duke Street and continued via:" or "Vehicle 1FAD531 HOGAN
// driver and sole occupant, departed 34 Duke Street and continued via:" —
// then, sometime later (possibly on a different sheet/day), the same
// vehicle arrives somewhere and the officer re-types the same occupant
// description by hand. This mines the operation's own rows for the most
// recent departure per rego that hasn't since been matched by an arrival
// for that rego, so the RS Quick Entry popup can offer it back as a chip.

// VEHICLE_DEPART_PATTERN / VEHICLE_ARRIVE_PATTERN / VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN
// live in shared/vehicleEventPatterns.ts (imported above), reused by
// normalizeObservationPunctuation above so both stay in lockstep.

export interface PendingVehicleDeparture {
  rego: string;
  /** Occupant description as originally written, e.g. "HOGAN driver and sole occupant". */
  occupantDesc: string;
  sheetId: number;
  rowId: number;
}

// Returns the most recent still-pending (not yet arrived) departure per
// vehicle rego on THIS sheet, ordered most-recent first. Deliberately
// scoped to a single sheet, not the whole operation — a running sheet is a
// per-day/per-shift log, and a vehicle depart/arrive pair is a one-shift
// convenience, not something that should carry over into the next sheet.
// "Pending" means no later row on this sheet mentions that same rego
// arriving. This is only ever offered back as a suggestion the officer
// confirms before it's inserted, not written directly into the record.
export async function getPendingVehicleDepartures(
  sheetId: number
): Promise<PendingVehicleDeparture[]> {
  const rows = await getRowsBySheetId(sheetId);

  const lastDepartByRego = new Map<
    string,
    { occupantDesc: string; sheetId: number; rowId: number; orderIdx: number }
  >();
  const arrivedRegos = new Set<string>();

  rows.forEach((row, idx) => {
    if (!row.observation) return;
    const departMatch = row.observation.match(VEHICLE_DEPART_PATTERN);
    if (departMatch) {
      const rego = departMatch[1].toUpperCase();
      lastDepartByRego.set(rego, {
        occupantDesc: departMatch[2].trim(),
        sheetId: row.sheetId,
        rowId: row.id,
        orderIdx: idx,
      });
      arrivedRegos.delete(rego);
      return;
    }
    const arriveMatch = row.observation.match(VEHICLE_ARRIVE_PATTERN);
    if (arriveMatch) {
      arrivedRegos.add(arriveMatch[1].toUpperCase());
    }
  });

  const pending: (PendingVehicleDeparture & { orderIdx: number })[] = [];
  for (const rego of Array.from(lastDepartByRego.keys())) {
    if (arrivedRegos.has(rego)) continue;
    const d = lastDepartByRego.get(rego)!;
    pending.push({ rego, ...d });
  }
  // Most recently departed first.
  return pending
    .sort((a, b) => b.orderIdx - a.orderIdx)
    .map(({ orderIdx, ...rest }) => rest);
}

// Captures the address an "arrived" row names — prefers the canonical
// bracketed short-form if the row includes one (a first mention of that
// address), otherwise falls back to the plain text straight after "arrived
// at" (a later, short-form-only mention). Used so the "Vehicle departing"
// chip only offers itself back at the exact location a vehicle is known to
// have arrived at, not at every location on the map.
function extractArrivalAddress(text: string): string | null {
  const bracket = text.match(/\(([^)]{1,80})\)/);
  if (bracket) return bracket[1].trim();
  const afterArrived = text.match(
    /arrived at\s+(.+?)(?:\s+and\s+\w+|[.\n]|$)/i
  );
  return afterArrived ? afterArrived[1].trim() : null;
}

export interface PendingVehicleArrival {
  rego: string;
  /** Occupant description as originally written, e.g. "HOGAN driver and sole occupant". */
  occupantDesc: string;
  /** The address this vehicle is known to have arrived at (short form). */
  address: string;
  sheetId: number;
  rowId: number;
}

// Returns the most recent still-"here" (not yet re-departed) arrival per
// vehicle rego on THIS sheet, ordered most-recent first — the mirror of
// getPendingVehicleDepartures, used by the "Vehicle departing" chip to
// reuse the occupant description (and address) from a vehicle's last
// logged arrival rather than making the officer retype it. Scoped to a
// single sheet for the same reason as getPendingVehicleDepartures.
export async function getPendingVehicleArrivals(
  sheetId: number
): Promise<PendingVehicleArrival[]> {
  const rows = await getRowsBySheetId(sheetId);

  const lastArrivalByRego = new Map<
    string,
    {
      occupantDesc: string;
      address: string;
      sheetId: number;
      rowId: number;
      orderIdx: number;
    }
  >();
  const departedRegos = new Set<string>();

  rows.forEach((row, idx) => {
    if (!row.observation) return;
    const arriveMatch = row.observation.match(
      VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN
    );
    if (arriveMatch) {
      const rego = arriveMatch[1].toUpperCase();
      lastArrivalByRego.set(rego, {
        occupantDesc: arriveMatch[2].trim(),
        address: extractArrivalAddress(row.observation) ?? "",
        sheetId: row.sheetId,
        rowId: row.id,
        orderIdx: idx,
      });
      departedRegos.delete(rego);
      return;
    }
    const departMatch = row.observation.match(VEHICLE_DEPART_PATTERN);
    if (departMatch) {
      departedRegos.add(departMatch[1].toUpperCase());
    }
  });

  const pending: (PendingVehicleArrival & { orderIdx: number })[] = [];
  for (const rego of Array.from(lastArrivalByRego.keys())) {
    if (departedRegos.has(rego)) continue;
    const a = lastArrivalByRego.get(rego)!;
    pending.push({ rego, ...a });
  }
  // Most recently arrived first.
  return pending
    .sort((a, b) => b.orderIdx - a.orderIdx)
    .map(({ orderIdx, ...rest }) => rest);
}

// ─── Missing Location Prompt (Vehicle Presence Rows) ───────────────────────
// Officers often write a "vehicles present at the address" row at the start
// of the day (or whenever they re-check an address) without repeating the
// location — relying on an earlier "Surveillance commenced ... (LOCATION)"
// row to carry the context for a human reading the sheet top-to-bottom.
// That's a real gap for getAllIntelligenceEntities() though: it links
// vehicles to a location per-ROW (see registerOccurrence), so a row with
// vehicle brackets and no location mention of its own never gets linked on
// the map/Intelligence folder for THAT row, even though the location is
// "obviously" the one established earlier. This detects that specific
// shape — vehicle(s) described as present/parked, no movement verb, no
// location entity anywhere in the row's own text — and offers back the
// most recent established location (prioritising a "Surveillance
// commenced" row) so the officer can add it with one tap. Entirely
// rule-based: a fixed phrase/keyword check plus a reuse of
// extractEntitiesFromText, no different in kind from the punctuation
// normalization above.
//
// Deliberately narrow (matches only this specific "static presence, no
// movement verb" shape) rather than firing on every vehicle-mentioning row
// with no location — a row already describing an arrival/departure is
// covered by its own "arrived at X"/"departed X" convention and doesn't
// need this prompt.
const STATIC_PRESENCE_PATTERN = /\b(parked|unattended|stationary)\b/i;
const VEHICLE_MOVEMENT_PATTERN =
  /\b(arrived|departed|driving|drove|drives|reversed|reversing|reverses|pulled up|pulled away|pulling up|pulling away|left)\b/i;
const VEHICLE_MENTION_PATTERN = /\bVehicle\s+[A-Za-z0-9]{2,8}\b/i;

export function looksLikeUnlocatedVehiclePresenceRow(
  observation: string
): boolean {
  if (!VEHICLE_MENTION_PATTERN.test(observation)) return false;
  if (!STATIC_PRESENCE_PATTERN.test(observation)) return false;
  if (VEHICLE_MOVEMENT_PATTERN.test(observation)) return false;
  const entities = extractEntitiesFromText(observation);
  return !entities.some(e => e.type === "address" || e.type === "business");
}

// The app-wide subsequent-mention convention (see isAddressAlreadyMentioned
// below) drops the suburb — an already-introduced address is referred back
// to by its street portion alone ("21 Allora Avenue", not "21 Allora
// Avenue, SUBIACO"). A plain business-name entity (no address attached)
// has no suburb to strip in the first place, so this is a no-op for those.
export function toSubsequentMentionForm(shortForm: string): string {
  const commaIdx = shortForm.indexOf(",");
  return commaIdx === -1 ? shortForm : shortForm.slice(0, commaIdx).trim();
}

export interface MissingLocationSuggestion {
  location: string;
  source: string;
}

// Pure decision logic over an already-fetched row list — kept separate
// from findMissingLocationSuggestion's DB fetch below so it can be unit
// tested directly, the same way extractEntitiesFromText and
// normalizeObservationPunctuation are (no DB dependency, deterministic).
//
// Rolling location, not "always the commencement address": a team moves
// over the course of a sheet (depart 67 Cleaver Street → arrive 28
// Carnarvon Crescent), so "the location this row is obviously at" is
// whichever address/business was most recently established BEFORE this
// row — walking backward through the sheet — not necessarily wherever
// surveillance first commenced. Only falls back to the commencement row
// when nothing more recent has been mentioned yet (e.g. this is the very
// first vehicle-presence row of the day, right after commencement).
export function pickMissingLocationSuggestion(
  observation: string,
  otherRows: Array<{ observation: string | null }>
): MissingLocationSuggestion | null {
  if (!looksLikeUnlocatedVehiclePresenceRow(observation)) return null;

  const rows = otherRows.filter(
    (r): r is { observation: string } => !!r.observation
  );

  for (let i = rows.length - 1; i >= 0; i--) {
    const entities = extractEntitiesFromText(rows[i].observation);
    const loc = entities.find(
      e => e.type === "address" || e.type === "business"
    );
    if (loc) {
      const isCommencementRow = /surveillance commenced/i.test(
        rows[i].observation
      );
      return {
        location: toSubsequentMentionForm(loc.shortForm),
        source: isCommencementRow
          ? "the Surveillance commencement row"
          : "an earlier row on this sheet",
      };
    }
  }

  return null;
}

// Scoped to a single sheet for the same reason as the vehicle depart/arrive
// continuity helpers above — a running sheet is a per-day/per-shift log,
// and "the location established earlier today" shouldn't reach into a
// different day's sheet. excludeRowId lets an edit of an existing row skip
// re-matching itself as its own "earlier row".
export async function findMissingLocationSuggestion(
  sheetId: number,
  observation: string,
  excludeRowId?: number
): Promise<MissingLocationSuggestion | null> {
  if (!looksLikeUnlocatedVehiclePresenceRow(observation)) return null;
  const rows = await getRowsBySheetId(sheetId);
  return pickMissingLocationSuggestion(
    observation,
    rows.filter(r => r.id !== excludeRowId)
  );
}

// ─── Vague Vehicle Match (No-Rego Sighting → Later Full Description) ──────
// A vehicle is often first sighted without its registration visible —
// "a white Hyundai Santa Fe, registration unable to be observed (Vehicle
// White Hyundai)" — and only fully identified later in the same sheet once
// the rego is actually seen. Bracketed like that, the vague sighting is
// already a real, trackable vehicle entity (extractEntitiesFromText
// classifies it as type "vehicle" fine, since classification only needs a
// make/body keyword nearby) — but it keys on whatever descriptive text was
// typed, so a later full sighting with the real rego becomes a SEPARATE,
// unlinked entity even though it's the same car. This detects that
// specific shape and offers the officer a merge, reusing the exact
// mechanism the "Merge Entities" tool and the general duplicate-prompt
// already use (entityAliases via mergeEntities) — see the SCOPE note on
// compareVehicleDescriptions in entityDedup.ts for why this needs a
// dedicated word-overlap comparison rather than the existing
// character-similarity vehicle comparator (compareVehicles): a vague
// bracket and a real rego share almost no characters in common even when
// they're the same car.

// Two independent signals that a vehicle mention is vague (no real rego
// known yet), combined with OR rather than AND so either one alone is
// enough — an officer might bracket the vague sighting with just a
// make/model ("Vehicle White Hyundai") without writing an explicit "rego
// not seen" phrase, or vice versa:
//   1. The bracket itself contains a vehicle make (VEHICLE_MAKES_PATTERN)
//      — a real rego never does.
//   2. The surrounding text uses one of the common ways officers phrase
//      "the registration wasn't visible" — kept fuzzy/pattern-based
//      (unseen/unobserved/unable to see or observe/not visible) rather
//      than a fixed phrase list, so wording variants are still caught.
const NO_REGO_OBSERVED_PATTERN =
  /\b(registration|rego|reg|plate)\b[^.]{0,40}\b(unseen|unobserved|not\s+(?:seen|observed|obtained|visible)|unable\s+to\s+(?:be\s+)?(?:see|seen|observe|observed|obtain|obtained)|no(?:t)?\s+visible)\b/i;

function isVagueVehicleMention(
  shortForm: string,
  fullDescription: string
): boolean {
  const hasRealRego = /\b\d[A-Za-z]{2,3}\d{3}\b/.test(shortForm);
  if (hasRealRego) return false;
  return (
    VEHICLE_MAKES_PATTERN.test(shortForm) ||
    NO_REGO_OBSERVED_PATTERN.test(fullDescription)
  );
}

export interface VagueVehicleMatch {
  /** The vague sighting's bracket text — becomes entityAliases' loserLabel on confirm. */
  loserLabel: string;
  /** The new, real-rego vehicle just entered — becomes entityAliases' winnerLabel. */
  winnerLabel: string;
  reason: string;
}

// Pure decision logic over an already-extracted row list — kept separate
// from findVagueVehicleMatch's DB fetch/alias-dedup checks below so it can
// be unit tested directly, the same pattern as
// pickMissingLocationSuggestion. Returns every candidate match (best first
// by score), not just one — the DB-aware wrapper below filters out any
// already-decided pair and takes the first survivor.
export function pickVagueVehicleMatches(
  observation: string,
  otherRows: Array<{ observation: string | null }>
): VagueVehicleMatch[] {
  const newVehicles = extractEntitiesFromText(observation).filter(
    e => e.type === "vehicle" && /\b\d[A-Za-z]{2,3}\d{3}\b/.test(e.shortForm)
  );
  if (newVehicles.length === 0) return [];

  const rows = otherRows.filter(
    (r): r is { observation: string } => !!r.observation
  );

  const candidates: Array<VagueVehicleMatch & { score: number }> = [];
  for (const newVehicle of newVehicles) {
    const winnerKey = normOnly("vehicle", newVehicle.shortForm);
    const newDescText = `${newVehicle.fullDescription} ${newVehicle.shortForm}`;

    for (const row of rows) {
      const earlierEntities = extractEntitiesFromText(row.observation);
      for (const earlier of earlierEntities) {
        if (earlier.type !== "vehicle") continue;
        if (!isVagueVehicleMention(earlier.shortForm, earlier.fullDescription))
          continue;

        const loserKey = normOnly("vehicle", earlier.shortForm);
        if (loserKey === winnerKey) continue;

        const match = compareVehicleDescriptions(
          newDescText,
          `${earlier.fullDescription} ${earlier.shortForm}`
        );
        if (!match) continue;

        candidates.push({
          loserLabel: earlier.shortForm,
          winnerLabel: newVehicle.shortForm,
          reason: match.reason,
          score: match.score,
        });
      }
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...rest }) => rest);
}

// Scoped to a single sheet, same reasoning as the other same-day continuity
// helpers above (vehicle depart/arrive, missing location). excludeRowId
// lets an edit of an existing row skip matching against itself.
export async function findVagueVehicleMatch(
  sheetId: number,
  observation: string,
  excludeRowId?: number
): Promise<VagueVehicleMatch | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await getRowsBySheetId(sheetId);
  const candidates = pickVagueVehicleMatches(
    observation,
    rows.filter(r => r.id !== excludeRowId)
  );

  for (const candidate of candidates) {
    const loserKey = normOnly("vehicle", candidate.loserLabel);
    const winnerKey = normOnly("vehicle", candidate.winnerLabel);

    // Already linked (either direction) or already dismissed as "not the
    // same vehicle" — don't ask again, same as the generic duplicate-prompt
    // pipeline.
    const [existingAlias, existingDecision] = await Promise.all([
      db
        .select()
        .from(entityAliases)
        .where(
          and(
            eq(entityAliases.type, "vehicle"),
            or(
              and(
                eq(entityAliases.loserKey, loserKey),
                eq(entityAliases.winnerKey, winnerKey)
              ),
              and(
                eq(entityAliases.loserKey, winnerKey),
                eq(entityAliases.winnerKey, loserKey)
              )
            )
          )
        )
        .limit(1),
      db
        .select()
        .from(entityDedupDecisions)
        .where(
          and(
            eq(entityDedupDecisions.type, "vehicle"),
            or(
              and(
                eq(entityDedupDecisions.keyA, loserKey),
                eq(entityDedupDecisions.keyB, winnerKey)
              ),
              and(
                eq(entityDedupDecisions.keyA, winnerKey),
                eq(entityDedupDecisions.keyB, loserKey)
              )
            )
          )
        )
        .limit(1),
    ]);
    if (existingAlias.length > 0 || existingDecision.length > 0) continue;

    return candidate;
  }
  return null;
}

// App-wide convention: the first time an address is mentioned in a running
// sheet it's written in full with its bracketed short-form ("5 Davidson
// Road, ATTADALE WA (5 Davidson Road)") — that bracket is what
// extractEntitiesFromText relies on to register the location as an
// Intelligence entity and place it on the map. Every subsequent mention in
// the same sheet just uses the short form on its own ("5 Davidson Road").
// This lets the vehicle-arriving chip decide which form to insert, without
// touching how any other chip/field on the sheet composes an address.
export async function isAddressAlreadyMentioned(
  sheetId: number,
  shortAddress: string
): Promise<boolean> {
  const trimmed = shortAddress.trim();
  if (!trimmed) return false;
  const rows = await getRowsBySheetId(sheetId);
  const needle = `(${trimmed})`.toLowerCase();
  return rows.some(
    r => r.observation && r.observation.toLowerCase().includes(needle)
  );
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
 * anchoring approach as getRowsBySheetId's day-offset math above.
 *
 * `new Date(dateISO + "T00:00:00+08:00")`'s underlying UTC instant is
 * always 16:00 on the PREVIOUS UTC calendar day (Perth midnight = UTC-8h),
 * so reading .toISOString() straight off it after setUTCDate() reads the
 * UTC day, not the Perth day — silently one day short for every call,
 * including days=0. Re-anchor back to Perth by shifting +8h before slicing,
 * same as toPerthDateISO does. (This was wrong for years — addDaysISO(x, 6)
 * for a Monday-start week produced Saturday instead of Sunday, silently
 * dropping the last day of every week from any range built with it, e.g.
 * the Weekly Activity Report's weekEnd and the Heat Map's last7/last30
 * windows.) */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
//
// The second group below (walk/stood/return/approach/knock/sat, "out of
// sight", and the front door/yard/driveway nouns) covers presence narrated
// without an arrival or departure verb. Officers write what the target is
// *doing*, not only that they got somewhere: "SANDWICH and CAT walked from
// 81 Redmond Road and stood in conversation in the front yard" is as clear a
// sighting at that address as "arrived at", but matched nothing here. The
// effect was perverse — in the same sheet an associate's "CAT arrived at 81
// Redmond Road" was counted while the target standing in the same front yard
// three hours later was not.
export const OBSERVATION_SIGNAL_RE =
  /\b(arriv\w*|depart\w*|left|enter\w*|exit\w*|park\w*|observ\w*|seen|saw|see|met|meet\w*|attend\w*|walk\w*|stood|stand\w*|return\w*|approach\w*|knock\w*|sat|sitting|out\s+of\s+sight|front\s+(?:door|yard|gate)|driveway|pull\w*\s+(?:into|up)|stopp?\w*|wait\w*|remain\w*|stationary|revers\w*\s+from\s+the\s+driveway|continu\w*\s+via|vicinity\s+of|driv(?:e|es|ing|ove)\s+(?:into|through)|travell?\w*\s+through)\b/i;

/** Does this observation narrate a presence at a place, as opposed to merely
 * naming one? Exported for testing — see observationSignal.test.ts. */
export function hasObservationSignal(observation: string): boolean {
  return OBSERVATION_SIGNAL_RE.test(observation);
}

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
  | { mode: "all" } // every sheet in scope, no date window
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
  for (const visit of collapseToVisits(qualifying)) {
    const existing = grouped.get(visit.entityKey);
    if (existing) existing.count++;
    else grouped.set(visit.entityKey, { label: visit.label, count: 1 });
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

/** Batch-geocode a list of raw address strings via the same cache-first
 * geocoder as the Heat Map, deduping repeats — used by the Supervisor
 * Summary export to plot its own Location column on a map page rather than
 * re-deriving addresses from row text. */
export async function geocodeAddressList(
  addresses: string[]
): Promise<{ address: string; lat: number; lng: number }[]> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of addresses) {
    const address = raw.trim();
    if (!address) continue;
    const key = normalizeEntityLabel(address);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }

  const results = await Promise.all(
    unique.map(async address => {
      const coords = await resolveLatLng(
        normalizeEntityLabel(address),
        address
      );
      if (!coords) return null;
      return { address, lat: coords.lat, lng: coords.lng };
    })
  );

  return results.filter(
    (r): r is { address: string; lat: number; lng: number } => r !== null
  );
}

// ─── Pattern of Life ────────────────────────────────────────────────────────
// Time/location analysis for one target within one operation — reuses the
// same entity extraction, "qualifying mention" gating, and same-address
// visit-collapsing as the Heat Map above, plus the pure bucketing/interval
// functions in ./patternOfLife.ts, rather than re-deriving any of it.

export interface IntelPatternOfLifeLocationRow {
  entityKey: string;
  label: string;
  counts: number[];
  total: number;
}

export interface IntelPatternOfLifeResponse {
  targetName: string;
  operationName: string;
  observationCount: number;
  geocodedObservationCount: number;
  sufficientData: boolean;
  confidence: ConfidenceTier;
  // Every time-bucketed chart in this report shares one 2-hourly (12-bucket)
  // granularity so they read consistently side by side.
  timeBuckets: string[];
  dayLabels: string[];
  // Section A — general activity, any location
  dayTimeGrid: number[][]; // [dayIndex][bucketIndex]
  mostActiveDayIndices: number[];
  // Section B — where & when
  locationTimeGrid: IntelPatternOfLifeLocationRow[];
  peakCell: PeakCell | null;
  // Section C — home presence. homeAddressKnown/homeAddressGeocoded/
  // homeAddressMentioned let the client explain WHY the charts are missing
  // (no HB on file vs. never geocoded vs. mentioned but no clear
  // arrived/departed language yet) instead of just silently omitting the
  // section, which reads as a bug rather than an honest "not enough data."
  homeAddressKnown: boolean;
  homeAddressGeocoded: boolean;
  homeAddressMentioned: boolean;
  homeAddressLabel: string | null;
  homePresence: HomePresencePercent[] | null; // length 12
  homeLikelyRanges: Array<{ startBucket: number; endBucket: number }> | null;
  homeAwayRanges: Array<{ startBucket: number; endBucket: number }> | null;
  departureHistogram: number[] | null; // length 12
  arrivalHistogram: number[] | null; // length 12
  peakDepartureBucket: number | null;
  peakArrivalBucket: number | null;
}

export async function getIntelTargetPatternOfLife(
  operationId: number,
  targetId: number
): Promise<IntelPatternOfLifeResponse | null> {
  const db = await getDb();
  if (!db) return null;

  const [operation] = await db
    .select({ id: operations.id, name: operations.name })
    .from(operations)
    .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)))
    .limit(1);
  const target = await getTargetById(targetId);
  if (!operation || !target) return null;

  // ── Resolve this target's own rows within this operation — formally
  // assigned sheets UNION sheets where the target is text-mentioned,
  // exactly like buildTargetOperationalAssociations, but scoped to the one
  // operation this report is for. ──────────────────────────────────────────
  const targetSheets = await db
    .select({
      id: runningSheets.id,
      createdAt: runningSheets.createdAt,
      sheetDate: runningSheets.sheetDate,
    })
    .from(runningSheets)
    .where(
      and(
        eq(runningSheets.operationId, operationId),
        eq(runningSheets.targetId, targetId),
        isNull(runningSheets.deletedAt)
      )
    );
  const sheetDateInfo = new Map<
    number,
    { createdAt: Date; sheetDate: string | null }
  >();
  for (const s of targetSheets)
    sheetDateInfo.set(s.id, { createdAt: s.createdAt, sheetDate: s.sheetDate });
  const targetSheetIds = new Set(targetSheets.map(s => s.id));

  const allEntities = await getAllIntelligenceEntities();
  const targetEntity = allEntities.find(
    e => e.isTarget && e.targetId === targetId
  );

  // Only rows the target is actually mentioned in — see entityAttribution.ts
  // for why a sheet assignment isn't sufficient.
  const targetRowIds = attributedRowIds(targetEntity?.occurrences, {
    operationId,
  });
  for (const occ of targetEntity?.occurrences ?? []) {
    if (targetRowIds.has(occ.rowId)) targetSheetIds.add(occ.sheetId);
  }
  // Mentioned-only sheets need their own date-resolution info too.
  const missingSheetIds = Array.from(targetSheetIds).filter(
    id => !sheetDateInfo.has(id)
  );
  if (missingSheetIds.length) {
    const extraSheets = await db
      .select({
        id: runningSheets.id,
        createdAt: runningSheets.createdAt,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .where(inArray(runningSheets.id, missingSheetIds));
    for (const s of extraSheets)
      sheetDateInfo.set(s.id, {
        createdAt: s.createdAt,
        sheetDate: s.sheetDate,
      });
  }

  if (!targetRowIds.size) {
    return {
      targetName: target.name,
      operationName: operation.name,
      observationCount: 0,
      geocodedObservationCount: 0,
      sufficientData: false,
      confidence: confidenceTier(0),
      timeBuckets: timeBucketLabels(12),
      dayLabels: DAY_LABELS,
      dayTimeGrid: Array.from({ length: 7 }, () => new Array(12).fill(0)),
      mostActiveDayIndices: [],
      locationTimeGrid: [],
      peakCell: null,
      homeAddressKnown: !!(target.hbf || target.hb),
      homeAddressGeocoded: false,
      homeAddressMentioned: false,
      homeAddressLabel:
        target.hbf || target.hb
          ? formatIntelAddress((target.hbf || target.hb) ?? "")
          : null,
      homePresence: null,
      homeLikelyRanges: null,
      homeAwayRanges: null,
      departureHistogram: null,
      arrivalHistogram: null,
      peakDepartureBucket: null,
      peakArrivalBucket: null,
    };
  }

  // Every row of the sheets in scope — not just the target's own rows. The
  // target's rows are picked out below via targetRowIds; the full set is
  // needed so "previous row" (which isNonObservationRow uses to spot a
  // continued-via / whereat street list) and row ordering stay true to the
  // sheet as written, rather than to whichever subset mentions the target.
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
    .where(inArray(sheetRows.sheetId, Array.from(targetSheetIds)))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes, sheetRows.rowNumber);
  const rows = allSheetRows.filter(r => targetRowIds.has(r.id));
  const rowById = new Map(rows.map(r => [r.id, r]));

  const rowsBySheetOrdered = new Map<number, typeof allSheetRows>();
  for (const row of allSheetRows) {
    if (!rowsBySheetOrdered.has(row.sheetId))
      rowsBySheetOrdered.set(row.sheetId, []);
    rowsBySheetOrdered.get(row.sheetId)!.push(row);
  }
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  for (const sheetRowList of Array.from(rowsBySheetOrdered.values())) {
    sheetRowList.forEach((r, i) => {
      previousObservationByRowId.set(
        r.id,
        i > 0 ? (sheetRowList[i - 1].observation ?? null) : null
      );
      rowOrderIndex.set(r.id, i);
    });
  }

  const resolveDateISO = (row: (typeof rows)[number]): string => {
    if (row.rowDate) return row.rowDate;
    const info = sheetDateInfo.get(row.sheetId);
    return addDaysISO(
      info?.sheetDate ?? toPerthDateISO(info?.createdAt ?? new Date()),
      row.dayOffset
    );
  };

  // ── General activity (Section A): every real observation row, regardless
  // of whether it mentions a location. ────────────────────────────────────
  const generalRows = rows.filter(
    r =>
      r.timeMinutes != null &&
      !isNonObservationRow(
        r.observation ?? "",
        previousObservationByRowId.get(r.id) ?? null
      )
  );
  const observationCount = generalRows.length;
  const dayTimeGrid = buildDayTimeGrid(
    generalRows.map(r => ({
      dateISO: resolveDateISO(r),
      timeMinutes: r.timeMinutes!,
    })),
    12
  );
  const mostActiveDayIndices = mostActiveDays(dayTimeGrid);

  // ── Qualifying address mentions (Section B + C) — same gating as the Heat
  // Map (isNonObservationRow + OBSERVATION_SIGNAL_RE), plus direction and
  // resolved date/time so they can be bucketed and, for the home address,
  // used as interval-bounding events. ─────────────────────────────────────
  type QualifyingMention = {
    entityKey: string;
    label: string;
    sheetId: number;
    order: number;
    timeMinutes: number;
    dateISO: string;
    direction: VisitDirection;
  };
  const qualifying: QualifyingMention[] = [];
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
      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        sheetId: occ.sheetId,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
        timeMinutes: row.timeMinutes,
        dateISO: resolveDateISO(row),
        direction: classifyVisitDirection(row.observation),
      });
    }
  }

  // Geocode every distinct address mentioned — only geocodable addresses
  // count toward the location-based sections, same quality bar as the Heat
  // Map (an address-shaped mention that doesn't resolve to a real place
  // isn't reliable enough to plot).
  const distinctKeys = new Map<string, string>();
  for (const m of qualifying)
    if (!distinctKeys.has(m.entityKey)) distinctKeys.set(m.entityKey, m.label);
  const geocodable = new Set<string>();
  await Promise.all(
    Array.from(distinctKeys.entries()).map(async ([key, label]) => {
      const coords = await resolveLatLng(key, label);
      if (coords) geocodable.add(key);
    })
  );
  const geocodedQualifying = qualifying.filter(m =>
    geocodable.has(m.entityKey)
  );
  const geocodedObservationCount = new Set(
    geocodedQualifying.map(m => `${m.sheetId}::${m.order}`)
  ).size;

  // ── Section B: collapse consecutive same-address mentions (within a
  // sheet, in row order) into one visit — "arrived at X" then "departed X"
  // is one visit to X, not two. Keep the first mention's time as the
  // visit's representative time. Same rule the Heat Map already applies. ──
  const visitEvents: LocationVisitEvent[] = collapseToVisits(
    geocodedQualifying
  ).map(m => ({
    entityKey: m.entityKey,
    label: m.label,
    timeMinutes: m.timeMinutes,
    dateISO: m.dateISO,
  }));
  const locationTimeGrid = buildLocationTimeGrid(visitEvents, 12, 6);
  const peakCell = findPeakCell(locationTimeGrid);

  // ── Section C: home presence — the target's registered HBF is merged by
  // getAllIntelligenceEntities into the same entity as any text-mined
  // mention of it, keyed internally on addressBracketKey — but that
  // internal key is never exposed on the IntelligenceEntity objects we get
  // back (only the display-friendly, non-bracketed .shortForm is). Trying
  // to recompute that internal key ourselves (normalizeEntityLabel(
  // addressBracketKey(target.hbf))) doesn't match normalizeEntityLabel(
  // entity.shortForm) — the key scheme every OTHER entityKey in this
  // function uses — so it silently never found the entity. Instead, find
  // the actual merged entity directly via the synthetic rowId=0 occurrence
  // getAllIntelligenceEntities seeds specifically for this target's HBF
  // field, then key off *that* entity's own shortForm like everything else
  // here does.
  const homeSnippet = `Target card — ${target.name} [HBF]`;
  const homeEntity =
    target.hbf || target.hb
      ? allEntities.find(
          e =>
            (e.type === "address" || e.type === "business") &&
            e.occurrences.some(
              occ => occ.rowId === 0 && occ.observationSnippet === homeSnippet
            )
        )
      : undefined;
  const homeEntityKey = homeEntity
    ? normalizeEntityLabel(homeEntity.shortForm)
    : null;
  let homePresence: HomePresencePercent[] | null = null;
  let homeLikelyRanges: Array<{
    startBucket: number;
    endBucket: number;
  }> | null = null;
  let homeAwayRanges: Array<{ startBucket: number; endBucket: number }> | null =
    null;
  let departureHistogram: number[] | null = null;
  let arrivalHistogram: number[] | null = null;
  let peakDepartureBucket: number | null = null;
  let peakArrivalBucket: number | null = null;

  const homeAddressKnown = !!(target.hbf || target.hb);
  const homeAddressMentioned =
    !!homeEntityKey && distinctKeys.has(homeEntityKey);
  const homeAddressGeocoded = !!homeEntityKey && geocodable.has(homeEntityKey);
  // Fall back to the raw registered address so the client can still name it
  // in an explanatory message even when there's no chart data yet. Prefer
  // the matched entity's own (already-canonical) shortForm when we have
  // one, since it's the same text the grids above already show.
  let homeAddressLabel: string | null = homeEntity
    ? homeEntity.shortForm
    : homeAddressKnown
      ? formatIntelAddress((target.hbf || target.hb) ?? "")
      : null;

  if (homeEntityKey && homeAddressGeocoded) {
    const homeEvents: HomeEvent[] = geocodedQualifying
      .filter(m => m.entityKey === homeEntityKey && m.direction !== "neutral")
      .map(m => ({
        dateISO: m.dateISO,
        timeMinutes: m.timeMinutes,
        direction: m.direction as "arrived" | "departed",
      }));
    if (homeEvents.length) {
      homeAddressLabel = distinctKeys.get(homeEntityKey) ?? homeAddressLabel;
      const buckets = computeHomePresenceByBucket(homeEvents, 12);
      homePresence = buckets.map(toHomePresencePercent);
      homeLikelyRanges = dominantRanges(homePresence, "home", 12);
      homeAwayRanges = dominantRanges(homePresence, "away", 12);
      departureHistogram = buildDirectionHistogram(homeEvents, "departed", 12);
      arrivalHistogram = buildDirectionHistogram(homeEvents, "arrived", 12);
      peakDepartureBucket = peakBucketIndex(departureHistogram);
      peakArrivalBucket = peakBucketIndex(arrivalHistogram);
    }
  }

  return {
    targetName: target.name,
    operationName: operation.name,
    observationCount,
    geocodedObservationCount,
    sufficientData: observationCount >= MIN_OBSERVATIONS_FOR_PATTERN,
    confidence: confidenceTier(geocodedObservationCount),
    timeBuckets: timeBucketLabels(12),
    dayLabels: DAY_LABELS,
    dayTimeGrid,
    mostActiveDayIndices,
    locationTimeGrid,
    peakCell,
    homeAddressKnown,
    homeAddressGeocoded,
    homeAddressMentioned,
    homeAddressLabel,
    homePresence,
    homeLikelyRanges,
    homeAwayRanges,
    departureHistogram,
    arrivalHistogram,
    peakDepartureBucket,
    peakArrivalBucket,
  };
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

  // Targets are looked up by the ids the sheets actually reference, not by
  // targets.operationId — that column is a nullable legacy field (the real
  // association is the operation_target_links join table, since a registry
  // target can belong to several operations). Filtering on it silently
  // dropped every registry-created target, leaving the Target Activity
  // section showing "—" instead of a name.
  const referencedTargetIds = Array.from(
    new Set(
      sheets
        .map(s => s.targetId)
        .filter((id): id is number => typeof id === "number")
    )
  );

  const [ops, targetRows, rows, govRecords] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    referencedTargetIds.length
      ? db
          .select()
          .from(targets)
          .where(inArray(targets.id, referencedTargetIds))
      : Promise.resolve([] as (typeof targets.$inferSelect)[]),
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

  // Priority: explicit rowDate, then the sheet's picker date (sheetDate —
  // the authoritative calendar date for the sheet, distinct from createdAt),
  // then createdAt only as a last resort for legacy sheets with no
  // sheetDate. Falling straight to createdAt (as this used to) silently
  // misdated every row on a sheet created for a different day than it was
  // actually saved, dropping it out of every week's report entirely.
  function resolveRowDate(row: (typeof rows)[number]): string {
    if (row.rowDate) return row.rowDate;
    const sheet = sheetById.get(row.sheetId);
    return addDaysISO(
      sheet?.sheetDate ?? toPerthDateISO(sheet?.createdAt ?? new Date()),
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
    operationId: number;
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
        operationId: sheet.operationId,
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
      // The operation comes from the sheets this week's activity was logged
      // on, not the target's own legacy operationId — a registry target can
      // be linked to several operations, and what matters here is where it
      // was actually observed.
      const opNames = Array.from(
        new Set(
          (qualifyingByTarget.get(targetId) ?? [])
            .map(m => opById.get(m.operationId)?.name)
            .filter((n): n is string => !!n)
        )
      );
      return {
        targetId,
        targetName: target?.name ?? "—",
        operationName: opNames.length ? opNames.join(", ") : "—",
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
    "linked",
    "savedInOpFolder",
    "savedInInvestigatorTransferDrive",
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

  // When two mentions of the same vehicle merge, prefer whichever actually
  // carries more descriptive detail — not whichever happens to start with
  // the rego. That used to be the tie-break (favouring the "REGO
  // description" form observation text is built in, over a raw target-card
  // field where the rego sits mid-sentence, e.g. "silver Hyundai Santa Fe,
  // bearing WA registration 1ICW519") but it backfired badly: a bare
  // "Vehicle 1GHH000" text mention starts with the rego and so counted as
  // "canonical", letting it beat — and overwrite — a fully-detailed target
  // card ("grey Ford Ranger Utility, bearing WA registration 1GHH000") that
  // doesn't. Strip the rego out of both candidates first and compare what's
  // actually left describing the vehicle; whichever has more wins,
  // regardless of where the rego sits in the string.
  const escapeRegExp = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vehicleDescriptiveLength = (
    shortForm: string,
    regoKey: string
  ): number =>
    shortForm
      .toLowerCase()
      .replace(new RegExp(`\\b${escapeRegExp(regoKey)}\\b`, "i"), "")
      .replace(/[,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  const preferVehicleShortForm = (
    existing: string,
    candidate: string,
    regoKey: string
  ): boolean => {
    const existingLen = vehicleDescriptiveLength(existing, regoKey);
    const candidateLen = vehicleDescriptiveLength(candidate, regoKey);
    if (candidateLen !== existingLen) return candidateLen > existingLen;
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
      extraAddresses: targets.extraAddresses,
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
      extraAddresses: targets.extraAddresses,
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
    extraAddresses: string | null;
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
  // Same idea for registry associates: maps their bracket surname (e.g.
  // "P.HILL") to the associate's own entity key, so a bare mention of that
  // bracket elsewhere in observation text redirects into this associate's
  // entity instead of spawning a lookalike duplicate.
  const associateAliasToKey = new Map<string, string>();

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
    // Also include extra addresses beyond HBF, stored as JSON array
    // {full, short, label?, businessName?, ...structured parts} — same
    // treatment as the associate block below (assocLocationFields).
    if (t.extraAddresses) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          t.extraAddresses
        );
        extras.forEach((ea, idx) => {
          const addrValue = ea.full?.trim() || ea.short?.trim() || null;
          if (addrValue) {
            locationFields.push({
              label: `Address ${idx + 2}`,
              value: addrValue,
              type: "address",
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
        // Registry vehicle fields are stored exactly as typed — often
        // "<description>, bearing WA registration <REGO>", never reordered
        // into the Intelligence "REGO description" display form the way an
        // RS-mined mention already is (see the type==="vehicle" branch in
        // extractEntitiesFromText). Left unformatted, this raw text's own
        // unstripped "bearing WA registration" boilerplate inflated its
        // apparent descriptive length enough to always win the "prefer
        // longer" merge below against a properly-formatted RS mention of
        // the same rego, overwriting a clean "1CWY970 silver Hyundai Getz"
        // with the raw "silver Hyundai Getz, bearing WA registration
        // 1CWY970". Reformat first so both candidates are compared, and
        // ultimately displayed, on the same footing.
        shortForm = formatIntelVehicle(shortForm);
      }
      if (!shortForm) continue;
      // Normalise whitespace so minor spacing differences don't create duplicate keys.
      // Vehicles key on registration alone (see vehicleRegoKey above); addresses
      // key on the HBF's own trailing bracket short form (see addressBracketKey
      // above) so a registry HBF and a text-mined mention of the same address
      // collapse into one entity instead of two.
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : field.type === "address"
            ? addressBracketKey(shortForm)
            : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const key = `${field.type}::${normKey}`;
      // Same problem the vehicle branch above solves, now for addresses: a
      // registry address field is stored exactly as typed, still carrying its
      // state suffix and its own trailing bracket code. Unformatted it is
      // always the longest candidate, so it won the "prefer longer" merge
      // below and became the display label everywhere — Home Presence read
      // "101 Eric Street, COTTESLOE WA (101 Eric Street)", bracket and all,
      // while every text-mined address rendered cleanly.
      //
      // Deliberately applied AFTER normKey is computed above: addresses key
      // on the raw value's trailing bracket, so formatting first would change
      // the key and re-partition existing entities. Display only.
      if (field.type === "address") shortForm = formatIntelAddress(shortForm);
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

  // ── 2b. Add registry associates as person entities (isAssociate = true) ────
  // Mirrors the target-card block above: an associate recorded on a target in
  // the Target Registry is a confirmed intelligence entity in its own right —
  // it must show up in the Associates tab (and its address/vehicle in
  // Locations/Vehicles) even if it has never been mentioned in observation
  // text yet, same as a target card.
  const targetRowsByTargetId = new Map<number, typeof targetRows>();
  for (const t of targetRows) {
    if (!targetRowsByTargetId.has(t.targetId))
      targetRowsByTargetId.set(t.targetId, []);
    targetRowsByTargetId.get(t.targetId)!.push(t);
  }

  const associateRows = await db
    .select({
      id: associates.id,
      targetId: associates.targetId,
      name: associates.name,
      tgt: associates.tgt,
      hbf: associates.hbf,
      hb: associates.hb,
      v1f: associates.v1f,
      v1: associates.v1,
      extraVehicles: associates.extraVehicles,
      extraAddresses: associates.extraAddresses,
    })
    .from(associates)
    .where(isNull(associates.deletedAt));

  for (const a of associateRows) {
    const parentRows = targetRowsByTargetId.get(a.targetId) ?? [];
    // An associate whose parent target no longer exists (e.g. the target
    // was purged but this associate row wasn't cascade-deleted with it —
    // see deleteTarget()) is orphaned data, not a live intelligence entity.
    // Skip it entirely rather than synthesizing a phantom "(Registry)"
    // occurrence for its address/vehicle fields below, which used to leave
    // permanent zombie INDICES-badged entities behind after a full delete.
    if (parentRows.length === 0) continue;
    const parentName = parentRows[0]?.targetName ?? null;
    const assocKey = `associate::${a.id}`;

    if (a.tgt && a.tgt.trim()) {
      associateAliasToKey.set(a.tgt.trim().toUpperCase(), assocKey);
    }

    if (!entityMap.has(assocKey)) {
      entityMap.set(assocKey, {
        shortForm: a.name,
        type: "person",
        isAssociate: true,
        associateId: a.id,
        associateOfTargetId: a.targetId,
        associateOfTargetName: parentName,
        occurrences: [],
      });
    }

    // Occurrences piggyback on the parent target's linked sheets (or a
    // "(no sheet linked)" placeholder), same pattern as the target card.
    for (const t of parentRows) {
      const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
      const sheetEntries =
        linkedSheets.length > 0
          ? linkedSheets
          : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];
      for (const sheet of sheetEntries) {
        entityMap.get(assocKey)!.occurrences.push({
          sheetId: sheet.sheetId,
          sheetTitle: sheet.sheetTitle,
          operationId: t.operationId ?? 0,
          operationName: t.operationName ?? "(Registry)",
          rowId: 0,
          observationSnippet: `Associate card — ${a.name} (associate of ${parentName ?? "target"})`,
          timeMinutes: null,
          fullDescription: `Associate: ${a.name}${a.tgt ? `, TGT: ${a.tgt}` : ""} (of target: ${parentName ?? "unknown"}, operation: ${t.operationName ?? "Registry"})`,
        });
      }
    }

    // Address/vehicle fields, same field-registration logic as target cards.
    const assocLocationFields: Array<{
      label: string;
      value: string | null;
      type: IntelligenceEntity["type"];
    }> = [
      {
        label: "HBF",
        value: a.hbf?.trim() || a.hb?.trim() || null,
        type: "address",
      },
      {
        label: "V1F",
        value: a.v1f?.trim() || a.v1?.trim() || null,
        type: "vehicle",
      },
    ];
    if (a.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          a.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const vehicleValue = ev.full?.trim() || ev.short?.trim() || null;
          if (vehicleValue) {
            assocLocationFields.push({
              label: `V${idx + 2}F`,
              value: vehicleValue,
              type: "vehicle",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    if (a.extraAddresses) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          a.extraAddresses
        );
        extras.forEach((ea, idx) => {
          const addrValue = ea.full?.trim() || ea.short?.trim() || null;
          if (addrValue) {
            assocLocationFields.push({
              label: `Address ${idx + 2}`,
              value: addrValue,
              type: "address",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }

    for (const field of assocLocationFields) {
      if (!field.value || field.value.trim() === "") continue;
      let shortForm = field.value.trim();
      if (field.type === "vehicle") {
        shortForm = shortForm.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
        // See the matching comment on the target locationFields loop above —
        // reformat to "REGO description" before this competes in the
        // "prefer longer" merge, or its own unstripped boilerplate can beat
        // and overwrite a clean RS-mined mention of the same vehicle.
        shortForm = formatIntelVehicle(shortForm);
      }
      if (!shortForm) continue;
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : field.type === "address"
            ? addressBracketKey(shortForm)
            : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const key = `${field.type}::${normKey}`;
      // See the matching comment on the target locationFields loop above —
      // tidy the registry address for display, after the key is computed
      // from the raw value so entity keying is unaffected.
      if (field.type === "address") shortForm = formatIntelAddress(shortForm);
      if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      } else {
        const existing = entityMap.get(key)!;
        const shouldUpgrade =
          field.type === "vehicle"
            ? preferVehicleShortForm(existing.shortForm, shortForm, normKey)
            : shortForm.length > existing.shortForm.length;
        if (shouldUpgrade) existing.shortForm = shortForm;
      }
      for (const t of parentRows) {
        const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
        const sheetEntries =
          linkedSheets.length > 0
            ? linkedSheets
            : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];
        for (const sheet of sheetEntries) {
          const alreadyAdded = entityMap
            .get(key)!
            .occurrences.some(
              o =>
                o.sheetId === sheet.sheetId &&
                o.rowId === 0 &&
                o.observationSnippet ===
                  `Associate card — ${a.name} [${field.label}]`
            );
          if (!alreadyAdded) {
            entityMap.get(key)!.occurrences.push({
              sheetId: sheet.sheetId,
              sheetTitle: sheet.sheetTitle,
              operationId: t.operationId ?? 0,
              operationName: t.operationName ?? "(Registry)",
              rowId: 0,
              observationSnippet: `Associate card — ${a.name} [${field.label}]`,
              timeMinutes: null,
              fullDescription: `${field.label}: ${shortForm} (from associate: ${a.name}, of target: ${parentName ?? "unknown"})`,
            });
          }
        }
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
      // Same idea, but for a registry associate's bracket surname (e.g. "P.HILL").
      const canonicalAssocKey =
        associateAliasToKey.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm
          ? associateAliasToKey.get(e.rawShortForm.toUpperCase())
          : undefined);
      if (canonicalAssocKey && entityMap.has(canonicalAssocKey)) {
        const snippet =
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : "");
        entityMap.get(canonicalAssocKey)!.occurrences.push({
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
            entry.type === "business" ||
            entry.type === "vehicle") &&
          entry.rawShortForm !== entry.shortForm
        ) {
          searchTerms.push(entry.rawShortForm);
        }
        // A vehicle is identified by its registration, and later rows refer
        // back to it however the officer typed it that day — "Vehicle
        // 1FAD093", "in 1FAD093", or the bare plate. Searching the plate
        // itself catches all of those. Without it the only term searched is
        // the enriched display form ("1FAD093 red Mercedes SUV"), which this
        // pipeline assembles and which therefore never appears verbatim in a
        // later row — so every bare vehicle re-mention went uncounted, and a
        // vehicle never co-occurred with the target driving it.
        if (entry.type === "vehicle") {
          const rego = vehicleRegoKey(entry.shortForm);
          const alreadySearched = searchTerms.some(
            t => t.toLowerCase() === rego
          );
          if (
            rego &&
            rego !== entry.shortForm.toLowerCase() &&
            !alreadySearched
          ) {
            searchTerms.push(rego);
          }
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
  //       See mergeContainedEntities above for the algorithm itself.
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

    for (const survivor of mergeContainedEntities(group, entityType)) {
      const mergeKey = `${survivor.type}::${survivor.shortForm.toLowerCase().trim()}`;
      mergedMap.set(mergeKey, survivor);
    }
  }

  // Add target entities back — they were never in byType
  for (const entity of targetEntities) {
    const k = `target::${entity.shortForm}`;
    mergedMap.set(k, entity);
  }

  // ── Person Identity Links: mirror intelligence across a linked pair ────────
  // A Target card and a Registry Associate card can be confirmed as the same
  // real person (targets.linkedAssociateId / associates.linkedTargetId — see
  // "Person Identity Links" above updateTarget). Both records intentionally
  // stay as separate profiles (a Target and an Associate are different
  // roles), but neither one should be missing intelligence the other has —
  // so union their occurrences onto both entities, and mark each with a
  // pointer to its identical twin so the UI can flag it.
  const linkedPairRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      associateId: targets.linkedAssociateId,
    })
    .from(targets)
    .where(
      and(isNull(targets.deletedAt), isNotNull(targets.linkedAssociateId))
    );

  for (const pair of linkedPairRows) {
    if (!pair.associateId) continue;
    const targetEntity = mergedMap.get(`target::${pair.targetName}`);
    const associateEntity = Array.from(mergedMap.values()).find(
      e => e.isAssociate && e.associateId === pair.associateId
    );
    if (!targetEntity || !associateEntity) continue;

    const seen = new Set<string>();
    const combined: IntelligenceEntity["occurrences"] = [];
    for (const occ of [
      ...targetEntity.occurrences,
      ...associateEntity.occurrences,
    ]) {
      const dedupeKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      combined.push(occ);
    }
    targetEntity.occurrences = combined;
    associateEntity.occurrences = combined.slice();

    targetEntity.identicalProfile = {
      type: "associate",
      id: associateEntity.associateId!,
      label: associateEntity.shortForm,
    };
    associateEntity.identicalProfile = {
      type: "target",
      id: targetEntity.targetId!,
      label: targetEntity.shortForm,
    };
  }

  // "Indices" flag — computed last, once every occurrence (registry-injected
  // and text-mined alike) has been assembled and merged above.
  const finalEntities = Array.from(mergedMap.values());
  for (const entity of finalEntities) {
    entity.isIndicesOnly =
      entity.occurrences.length > 0 &&
      entity.occurrences.every(o => o.rowId === 0);
  }

  return finalEntities;
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
  associateId?: number | null;
  associateOfTargetId?: number | null;
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
      associateId: e.isAssociate ? e.associateId : null,
      associateOfTargetId: e.isAssociate ? e.associateOfTargetId : null,
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

export interface CrossOperationMatch {
  /** Every other operation (not the one the officer is currently working in)
   * that has a real observation of this exact entity. */
  operationNames: string[];
}

/**
 * Does this exact entity — not a near-miss, the same normalized key —
 * already have a real observation on a DIFFERENT operation? Deliberately the
 * opposite case findPossibleDuplicates excludes: an exact match silently
 * collapses into one shared entity via getAllIntelligenceEntities' key
 * normalization, which is correct for recognition, but means nobody is ever
 * told about it. On a surveillance operation, "the same address the team is
 * about to sit on is already a known entity under Operation X" is exactly
 * the kind of thing that must surface, not silently merge.
 *
 * Deliberately independent of findPossibleDuplicates/checkPossibleDuplicates
 * — a separate, additive check, not a variant of the near-duplicate prompt.
 * rowId > 0 only: a registry-only ("Indices") occurrence isn't a real
 * sighting anywhere, so it shouldn't trigger a cross-operation warning.
 */
export async function checkCrossOperationEntity(
  type: DedupType,
  label: string,
  currentOperationId: number
): Promise<CrossOperationMatch | null> {
  const allEntities = await getAllIntelligenceEntities();
  const candidateKey = computeEntityKey(type, label);
  const entity = allEntities.find(
    e =>
      !e.isTarget &&
      e.type === type &&
      computeEntityKey(type, e.shortForm) === candidateKey
  );
  if (!entity) return null;

  const operationNames = crossOperationNames(
    entity.occurrences,
    currentOperationId
  );
  if (!operationNames.length) return null;
  return { operationNames };
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

// ─── Person Name Match (Target/Associate Registry spelling correction) ────
// Distinct from the entityAliases merge system above: that links two ordinary
// text-mined entities without touching the observation text. This checks a
// not-yet-saved person mention against the formal Target/Associate Registry
// and, when confirmed, corrects the row's own text to the registered
// spelling before it's saved — see routers.ts row.update's use of this.

export interface PersonTargetMatch {
  targetId?: number;
  associateId?: number;
  name: string;
  tgtAlias: string | null;
  score: number;
  reason: string;
}

/** Silent auto-correction lookup: has this exact spelling already been
 * confirmed against a Target/Associate? Used to rewrite the observation text
 * at save time without prompting again — the "remembered" half of the
 * spellcheck-style flow the officer confirms once. */
export async function getKnownPersonNameCorrection(spelling: string): Promise<{
  correctSpelling: string;
  targetId: number | null;
  associateId: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const norm = spelling.trim().toUpperCase();
  if (!norm) return null;
  const rows = await db
    .select()
    .from(personNameMatchDecisions)
    .where(
      and(
        eq(personNameMatchDecisions.decision, "confirmed"),
        eq(personNameMatchDecisions.spelling, norm)
      )
    )
    .limit(1);
  if (!rows.length || !rows[0].correctSpelling) return null;
  return {
    correctSpelling: rows[0].correctSpelling,
    targetId: rows[0].targetId,
    associateId: rows[0].associateId,
  };
}

/** Fuzzy-match a not-yet-saved person mention against the Target/Associate
 * Registry — backs the save-time "is this an existing Target?" prompt.
 * Excludes anything that already exactly matches a registered TGT/associate
 * alias (that already auto-links silently via getAllIntelligenceEntities,
 * nothing to ask) and anything with a prior decision recorded for this exact
 * (spelling, target/associate) pairing, confirmed or rejected. */
export async function checkPossibleTargetMatches(
  label: string
): Promise<PersonTargetMatch[]> {
  const db = await getDb();
  if (!db) return [];
  const labelUpper = label.trim().toUpperCase();
  if (!labelUpper) return [];

  const allEntities = await getAllIntelligenceEntities();
  const registryEntities = allEntities.filter(e => e.isTarget || e.isAssociate);

  // Already an exact alias match — the existing tgtAlias/associate-alias
  // mechanism already folds this into the target/associate silently.
  if (
    registryEntities.some(
      e => e.tgtAlias && e.tgtAlias.trim().toUpperCase() === labelUpper
    )
  ) {
    return [];
  }

  const decisions = await db
    .select()
    .from(personNameMatchDecisions)
    .where(eq(personNameMatchDecisions.spelling, labelUpper));
  const decidedTargetIds = new Set(
    decisions.filter(d => d.targetId != null).map(d => d.targetId)
  );
  const decidedAssociateIds = new Set(
    decisions.filter(d => d.associateId != null).map(d => d.associateId)
  );

  const results: PersonTargetMatch[] = [];
  for (const e of registryEntities) {
    if (e.isTarget && e.targetId != null && decidedTargetIds.has(e.targetId))
      continue;
    if (
      e.isAssociate &&
      e.associateId != null &&
      decidedAssociateIds.has(e.associateId)
    )
      continue;

    const candidateNames = [e.shortForm, e.tgtAlias].filter(
      (v): v is string => !!v && v.trim().length > 0
    );
    let best: { score: number; reason: string } | null = null;
    for (const c of candidateNames) {
      const cmp = comparePersonNames(label, c);
      if (cmp && (!best || cmp.score > best.score)) best = cmp;
    }
    if (!best) continue;

    results.push({
      targetId: e.isTarget ? (e.targetId ?? undefined) : undefined,
      associateId: e.isAssociate ? (e.associateId ?? undefined) : undefined,
      name: e.shortForm,
      tgtAlias: e.tgtAlias ?? null,
      score: best.score,
      reason: best.reason,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

async function upsertPersonNameMatchDecision(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  correctSpelling?: string;
  decidedByCIN: string | undefined;
  decision: "confirmed" | "rejected";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const norm = data.spelling.trim().toUpperCase();
  const existing = await db
    .select()
    .from(personNameMatchDecisions)
    .where(
      and(
        eq(personNameMatchDecisions.spelling, norm),
        data.targetId != null
          ? eq(personNameMatchDecisions.targetId, data.targetId)
          : eq(personNameMatchDecisions.associateId, data.associateId!)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(personNameMatchDecisions)
      .set({
        decision: data.decision,
        correctSpelling: data.correctSpelling ?? null,
        decidedByCIN: data.decidedByCIN,
        decidedAt: Date.now(),
      })
      .where(eq(personNameMatchDecisions.id, existing[0].id));
  } else {
    await db.insert(personNameMatchDecisions).values({
      spelling: norm,
      targetId: data.targetId ?? null,
      associateId: data.associateId ?? null,
      decision: data.decision,
      correctSpelling: data.correctSpelling ?? null,
      decidedByCIN: data.decidedByCIN,
      decidedAt: Date.now(),
    });
  }
}

/** Records a confirmed spelling correction against a Target/Associate — this
 * exact spelling auto-corrects silently on every future save from now on. */
export async function confirmPersonNameMatch(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  correctSpelling: string;
  decidedByCIN: string | undefined;
}): Promise<void> {
  await upsertPersonNameMatchDecision({ ...data, decision: "confirmed" });
}

/** Records "not the same person" so this exact (spelling, target/associate)
 * pairing isn't asked about again. */
export async function rejectPersonNameMatch(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  decidedByCIN: string | undefined;
}): Promise<void> {
  await upsertPersonNameMatchDecision({
    spelling: data.spelling,
    targetId: data.targetId,
    associateId: data.associateId,
    decidedByCIN: data.decidedByCIN,
    decision: "rejected",
  });
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

export interface PersonMentionSuggestion {
  key: string;
  /** The name portion an officer would write before the bracket, e.g. "Basil CAT". */
  displayName: string;
  /** The bracket code to write it with, e.g. "CAT". */
  bracketCode: string;
  rowCount: number;
  /** Exactly one of these is set — which Registry record this suggestion is,
   * so selecting it can immediately record the same confirmed link
   * checkPossibleTargetMatches' save-time prompt would otherwise still ask
   * for, rather than asking again for a person the officer just picked by
   * name. */
  targetId: number | null;
  associateId: number | null;
}

/**
 * Live "as you type" suggestions for the observation field's inline mention
 * autocomplete — scoped to registered Target/Associate Registry people only
 * (not bare text-mined mentions), since only a registry entry reliably
 * carries a clean "Name, born DATE (BRACKET)" shape to split into a display
 * name and bracket code. A bare text-mined person's bracket code isn't
 * recoverable from the merged entity alone, and registry entries are also
 * exactly the ones worth proactively linking to as an officer types.
 */
export async function searchRegisteredPersonMentions(
  query: string
): Promise<PersonMentionSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const allEntities = await getAllIntelligenceEntities();
  return allEntities
    .filter(
      e =>
        e.type === "person" &&
        (e.isTarget || e.isAssociate) &&
        e.shortForm.toLowerCase().includes(q)
    )
    .map(e => ({
      key: computeEntityKey("person", e.shortForm),
      displayName: nameWithoutBornClause(e.shortForm),
      bracketCode: bracketCodeFromRegisteredName(e.shortForm),
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
      targetId: e.isTarget ? (e.targetId ?? null) : null,
      associateId: e.isAssociate ? (e.associateId ?? null) : null,
    }))
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 8);
}

// ─── Association Graph ───────────────────────────────────────────────────────

export interface AssocNode {
  id: string; // e.g. "person::SAM JACK"
  label: string; // display label
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number; // total times seen
  operationIds: number[];
  operationNames: string[];
  /** Registry target id when this node is a target, else null. Lets callers
   * (e.g. the Intelligence Package, which centres a diagram on each chosen
   * target) match a target to its node by id instead of by display label. */
  targetId: number | null;
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

/**
 * Co-occurrence graph for the Association Map / Ego Network.
 *
 * Built on getAllIntelligenceEntities() — the same two-pass, alias-merged
 * pipeline the Intelligence folder's own entity list uses — rather than
 * running extractEntitiesFromText() per row. That distinction is the whole
 * point: extractEntitiesFromText only recognises entities that are
 * bracket-introduced in the row it is handed, but the running sheet
 * convention is to bracket-introduce an entity once and then refer to it
 * bare ("HOGAN entered Vehicle 1FAD093"). Per-row extraction therefore sees
 * at most one entity in almost every row, finds no pairs, and produces a
 * graph with zero edges. Grouping the resolved entities' own occurrences by
 * rowId picks up those bare re-mentions and yields the real co-occurrences.
 *
 * Occurrences with rowId 0 are synthetic — they come from a Target Registry
 * card rather than an observation — so they make an entity appear as a node
 * but never manufacture an edge.
 */
export async function getAssociationGraph(
  operationIds?: number[]
): Promise<AssociationGraph> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const scoped = operationIds && operationIds.length > 0 ? operationIds : null;
  const entities = await getAllIntelligenceEntities();

  const nodeMap = new Map<string, AssocNode>();
  // rowId -> node ids mentioned in that row
  const rowMembers = new Map<number, Set<string>>();

  for (const entity of entities) {
    // A Target and Associate card confirmed as the same real person (see
    // identicalProfile in getAllIntelligenceEntities) already carry the
    // same unioned occurrences — represent them as ONE combined node
    // (the Target side) rather than two nodes for one person. Skip the
    // Associate side here; its occurrences are already fully reflected via
    // the Target node below.
    if (entity.isAssociate && entity.identicalProfile?.type === "target") {
      continue;
    }

    const type: AssocNode["type"] = entity.isTarget
      ? "target"
      : (entity.type as AssocNode["type"]);
    const nodeId = entity.isTarget
      ? `target::${entity.shortForm}`
      : `${entity.type}::${entity.shortForm.toLowerCase()}`;

    const relevant = scoped
      ? entity.occurrences.filter(o => scoped.includes(o.operationId))
      : entity.occurrences;
    if (relevant.length === 0) continue;

    let node = nodeMap.get(nodeId);
    if (!node) {
      node = {
        id: nodeId,
        label: entity.shortForm,
        type,
        occurrences: 0,
        operationIds: [],
        operationNames: [],
        targetId: entity.isTarget ? (entity.targetId ?? null) : null,
      };
      nodeMap.set(nodeId, node);
    }

    for (const occ of relevant) {
      node.occurrences++;
      if (!node.operationIds.includes(occ.operationId)) {
        node.operationIds.push(occ.operationId);
        node.operationNames.push(occ.operationName);
      }
      // rowId 0 is a registry-card mention, not a real observation — it
      // makes the entity visible but must not create a co-occurrence.
      if (occ.rowId > 0) {
        if (!rowMembers.has(occ.rowId)) rowMembers.set(occ.rowId, new Set());
        rowMembers.get(occ.rowId)!.add(nodeId);
      }
    }
  }

  // Every pair of entities sharing a row is one co-occurrence.
  const edgeWeight = new Map<string, number>();
  for (const members of Array.from(rowMembers.values())) {
    const ids = Array.from(members);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|||");
        edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: AssocEdge[] = [];
  for (const [key, weight] of Array.from(edgeWeight.entries())) {
    const [source, target] = key.split("|||");
    edges.push({ source, target, weight });
  }

  // A registry-only entity has real presence in the app even with no
  // observation behind it yet — keep it visible rather than showing 0.
  for (const node of Array.from(nodeMap.values())) {
    if (node.occurrences === 0) node.occurrences = 1;
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
  linked?: boolean;
  linkedCIN?: string | null;
  linkedName?: string | null;
  savedInOpFolder?: boolean;
  savedInOpFolderCIN?: string | null;
  savedInOpFolderName?: string | null;
  savedInInvestigatorTransferDrive?: boolean;
  savedInInvestigatorTransferDriveCIN?: string | null;
  savedInInvestigatorTransferDriveName?: string | null;
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
        ...(input.savedInInvestigatorTransferDrive !== undefined && {
          savedInInvestigatorTransferDrive:
            input.savedInInvestigatorTransferDrive,
        }),
        ...(input.savedInInvestigatorTransferDriveCIN !== undefined && {
          savedInInvestigatorTransferDriveCIN:
            input.savedInInvestigatorTransferDriveCIN,
        }),
        ...(input.savedInInvestigatorTransferDriveName !== undefined && {
          savedInInvestigatorTransferDriveName:
            input.savedInInvestigatorTransferDriveName,
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
      linked: input.linked ?? false,
      linkedCIN: input.linkedCIN ?? null,
      linkedName: input.linkedName ?? null,
      savedInOpFolder: input.savedInOpFolder ?? false,
      savedInOpFolderCIN: input.savedInOpFolderCIN ?? null,
      savedInOpFolderName: input.savedInOpFolderName ?? null,
      savedInInvestigatorTransferDrive:
        input.savedInInvestigatorTransferDrive ?? false,
      savedInInvestigatorTransferDriveCIN:
        input.savedInInvestigatorTransferDriveCIN ?? null,
      savedInInvestigatorTransferDriveName:
        input.savedInInvestigatorTransferDriveName ?? null,
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
    allSigned && !!rec.savedInOpFolder,
    allSigned && !!rec.savedInInvestigatorTransferDrive,
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
 * - If the CIN is the Author on a sheet: returns Operative items (savedInOpFolder, savedInInvestigatorTransferDrive)
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
        if (!rec?.savedInOpFolder)
          outstanding.push("Saved in Operation folder");
        if (!rec?.savedInInvestigatorTransferDrive)
          outstanding.push("Saved in Investigator transfer drive");
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
  startTimeEdited?: boolean;
  finishTimeEdited?: boolean;
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
    if (v1) add("target:v1", formatIntelVehicle(v1));
    const v2 = target.v2f?.trim() || target.v2?.trim();
    if (v2) add("target:v2", formatIntelVehicle(v2));
    if (target.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          target.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const label = ev.full?.trim() || ev.short?.trim();
          if (label) add(`target:extra${idx}`, formatIntelVehicle(label));
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

/**
 * A small fixed set of officer-facing shorthand the Summary tab writes back
 * out — not the full `shortcuts` table (that also has phrases like
 * "Surveillance commenced in the vicinity of" that stay spelled out in a
 * Summary), just the specific abbreviations investigators expect to read:
 * driver/sole occupant, front passenger, parked/unattended, continued out
 * of sight. Case-insensitive, whole-phrase match.
 */
const SUMMARY_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bdriver and sole occupant\b/gi, "DSO"],
  [/\bfront passenger\b/gi, "FP"],
  [/\bparked and unattended\b/gi, "PU"],
  [/\bcontinued out of sight\b/gi, "COOS"],
];

/**
 * Rewrites one RS row's observation text into the shorthand style
 * investigators actually write Summaries in — not a verbatim copy, and not
 * an attempt at general rewriting (that would need real language
 * understanding, which this app's Golden Rule rules out at runtime; text
 * that doesn't match one of these specific, deterministic patterns is left
 * exactly as written). Rules, applied in order:
 *
 *  1. Every bracket-introduced address/vehicle mention becomes its
 *     Intelligence short form (formatIntelAddress/formatIntelVehicle —
 *     the same functions the Intelligence folder itself uses), e.g.
 *     "44 Elvira Street, PALMYRA WA (44 Elvira Street)" -> "44 Elvira
 *     Street, PALMYRA", "...bearing WA registration 1FAT004 (Vehicle
 *     1FAT004)" -> "1FAT004 ...".
 *  2. A bare "Vehicle <rego>" mention (already introduced earlier in the
 *     sheet, so it shows up here without its own bracket) drops the word
 *     "Vehicle" — just the rego.
 *  3. The sheet's own target — by TGT alias, whether bracket-introduced or
 *     a bare re-mention — becomes "TGT".
 *  4. DSO / FP / PU / COOS (see SUMMARY_ABBREVIATIONS above).
 *  5. "departed ... continued via:" — the from-address in between is
 *     dropped (it was just stated, or is the previous line's location) —
 *     becomes "departed, travelled to:".
 *  6. "PHOTOGRAPH/S TAKEN" is dropped entirely — investigators reading a
 *     Summary don't need this noted, it's implicit in the photo count.
 */
function buildSummaryAbbreviatedText(
  observation: string,
  tgtAlias: string | null
): string {
  let text = observation;

  // 1. Bracket-introduced address/vehicle mentions -> Intelligence short form.
  const entities = extractEntitiesFromText(text);
  const typeByRawShortForm = new Map(
    entities.map(e => [e.rawShortForm.trim().toUpperCase(), e.type])
  );
  const bracketPattern = /([^()]{3,120}?)\s*\(([^()]{1,80})\)/g;
  let rebuilt = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = bracketPattern.exec(text)) !== null) {
    const [full, , bracketContent] = match;
    const type = typeByRawShortForm.get(bracketContent.trim().toUpperCase());
    let replacement = full;
    if (type === "address") {
      replacement = formatIntelAddress(full);
    } else if (type === "vehicle") {
      replacement = formatIntelVehicle(bracketContent.trim(), text);
    }
    rebuilt += text.slice(lastIndex, match.index) + replacement;
    lastIndex = match.index + full.length;
  }
  rebuilt += text.slice(lastIndex);
  text = rebuilt;

  // 2. Bare "Vehicle <rego>" (already introduced earlier in the sheet) -> just the rego.
  text = text.replace(/\bVehicle\s+([A-Z0-9]{4,8})\b/gi, "$1");

  // 3. The sheet's own target's alias -> "TGT".
  if (tgtAlias && tgtAlias.trim()) {
    text = text.replace(
      new RegExp(`\\b${escapeRegExp(tgtAlias.trim())}\\b`, "g"),
      "TGT"
    );
  }

  // 4. Fixed abbreviations.
  for (const [pattern, replacement] of SUMMARY_ABBREVIATIONS) {
    text = text.replace(pattern, replacement);
  }

  // 5. "departed ... continued via:" -> "departed, travelled to:" — the
  // from-address in between (bracket-introduced or bare) is dropped, along
  // with any comma immediately preceding "departed" in the source sentence.
  text = text.replace(
    /,?\s*\bdeparted\b\s*(?:and\s+)?.*?,?\s*(?:and\s+)?continued via:/gi,
    " departed, travelled to:"
  );

  // 6. Drop "PHOTOGRAPH/S TAKEN" entirely.
  text = text.replace(/\s*PHOTOGRAPH\/?S?\s+TAKEN\.?/gi, "");

  // Cleanup: collapse stray whitespace/punctuation left by the removals above.
  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  return text;
}

/**
 * Splits one RS row into the Summary line's three fields — time, location,
 * and just the "what happened" text — kept separate (rather than
 * concatenated into one string) so the PDF export can render them as
 * distinct Time / Address / Observation table columns without the address
 * being duplicated inside the observation text.
 */
function buildSummaryEntryFields(
  row: {
    time: string | null;
    observation: string | null;
  },
  tgtAlias: string | null
): { text: string; location: string | null } {
  const raw = row.observation ?? "";
  const entities = extractEntitiesFromText(raw);
  const location = entities.find(e => e.type === "address");

  return {
    text: buildSummaryAbbreviatedText(raw, tgtAlias),
    location: location ? location.shortForm || location.fullDescription : null,
  };
}

/**
 * A row that is nothing but the "Travelled Via" route mechanics — the bare
 * "continued via:" trigger, its paired street-list row, or a self-contained
 * "continued via: <streets>, whereat" row — carries no observational
 * content of its own, so it never gets a Summary line. This is deliberately
 * narrower than "the row mentions continued via" — a row that WRAPS a via
 * clause in real narrative (e.g. "departed 44 Smith St and continued via:
 * Jones Ave, whereat continued surveillance") still gets a line; only the
 * via clause inside it is shortened, by buildSummaryAbbreviatedText's
 * "departed ... continued via:" step. A blanket exclusion on any row
 * mentioning "continued via" would silently drop that real narrative along
 * with the route detail.
 */
function isPureTravelledViaRow(observation: string): boolean {
  const trimmed = observation.trim();
  if (/^continued via[;:]\s*$/i.test(trimmed)) return true;
  return /^continued via[;:].*\bwhereat[;:.,]?\s*$/i.test(trimmed);
}

function isPureTravelledViaFollowUp(
  observation: string,
  previousObservation: string | null
): boolean {
  if (!previousObservation) return false;
  if (!/^continued via[;:]\s*$/i.test(previousObservation.trim())) return false;
  return /whereat[;:.,]?\s*$/i.test(observation.trim());
}

/**
 * Returns the Summary tab's per-row entry list, first append-only syncing in
 * any RS row with real observation text that doesn't have an entry yet —
 * except pure "Travelled Via" street-list rows (see isPureTravelledViaRow),
 * which are skipped entirely; a witness/supervisor reading the Summary
 * doesn't need the turn-by-turn route, same reasoning Court Statements
 * already apply (routers.ts's statement.previewData). That check only ever
 * gates new inserts — an existing line is never removed or regenerated,
 * even if a later edit makes its row match the pattern. Existing entries
 * (including ones the supervisor has edited or soft-deleted) are never
 * touched or regenerated either way.
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

  // The sheet's own target's TGT alias (e.g. "MAY") — used to rewrite their
  // name down to "TGT" in the shorthand Summary text (see
  // buildSummaryAbbreviatedText). Not every sheet has a linked target.
  const sheet = await getRunningSheetById(sheetId);
  const target = sheet?.targetId ? await getTargetById(sheet.targetId) : null;
  const tgtAlias = target?.tgt?.trim() || null;

  const allRows = await getRowsBySheetId(sheetId);
  // Rows with real content — used both for deciding which rows need a new
  // line and for sort order / for deciding whether an existing line's row
  // is still genuinely there.
  const contentRows = allRows.filter(r => (r.observation ?? "").trim());
  const contentRowById = new Map(contentRows.map(r => [r.id, r]));

  const pureTravelledViaRowIds = new Set<number>();
  for (let i = 0; i < allRows.length; i++) {
    const obs = allRows[i].observation ?? "";
    if (!obs.trim()) continue;
    const prevObs = i > 0 ? allRows[i - 1].observation : null;
    if (
      isPureTravelledViaRow(obs) ||
      isPureTravelledViaFollowUp(obs, prevObs)
    ) {
      pureTravelledViaRowIds.add(allRows[i].id);
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
      r => !existingRowIds.has(r.id) && !pureTravelledViaRowIds.has(r.id)
    );
    if (missing.length > 0) {
      await db.insert(sheetSummaryEntries).values(
        missing.map(r => {
          const fields = buildSummaryEntryFields(r, tgtAlias);
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
      const fields = buildSummaryEntryFields(row, tgtAlias);
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
/**
 * Donor sheet for carry-forward fields (Investigator, Intel Support, Special
 * Projects, Objectives — see summary.getBySheet). When this sheet has a
 * target, only a summary for that SAME target counts — Special Projects
 * ticked for one target shouldn't leak onto the next summary for a
 * different target just because it happens to be the most recently created
 * sheet in the operation. Falls back to the most recent summary anywhere in
 * the operation when this sheet has no target to scope by.
 */
export async function getMostRecentSheetSummaryForOperation(
  operationId: number,
  excludeSheetId: number,
  targetId?: number | null
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  const conditions = [
    eq(runningSheets.operationId, operationId),
    sql`${runningSheets.id} != ${excludeSheetId}`,
  ];
  if (targetId) conditions.push(eq(runningSheets.targetId, targetId));
  const rows = await db
    .select({ summary: sheetSummaries })
    .from(sheetSummaries)
    .innerJoin(runningSheets, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(and(...conditions))
    .orderBy(desc(runningSheets.createdAt))
    .limit(1);
  return rows[0]?.summary ?? null;
}

export interface OperationSummaryRollupRow {
  sheetId: number;
  sheetTitle: string;
  sheetDate: string | null;
  createdAt: Date;
  targetId: number | null;
  targetName: string | null;
  teamLabel: string | null;
  teamCins: string | null;
  startTime: string | null;
  finishTime: string | null;
  location: string | null;
  ioSupport: string | null;
  intelSupport: string | null;
  ioContactTiming: string | null;
  ioContactMethod: string | null;
  objectives: string | null;
  specialProjects: string | null;
  criticalDecisions: string | null;
  issues: string | null;
  completedAt: number | null;
}

/**
 * Every running sheet's Supervisor Summary for an operation (optionally
 * narrowed to one target), newest first — the "Deployment Rollup" view. Only
 * sheets that already have a summary record are included (a sheet nobody has
 * opened the Summary tab on yet has nothing to roll up).
 */
export async function getSheetSummariesForOperation(
  operationId: number,
  targetId?: number | null
): Promise<OperationSummaryRollupRow[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(runningSheets.operationId, operationId),
    isNull(runningSheets.deletedAt),
  ];
  if (targetId) conditions.push(eq(runningSheets.targetId, targetId));

  const rows = await db
    .select({
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
      sheetDate: runningSheets.sheetDate,
      createdAt: runningSheets.createdAt,
      targetId: runningSheets.targetId,
      summary: sheetSummaries,
    })
    .from(runningSheets)
    .innerJoin(sheetSummaries, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(and(...conditions))
    .orderBy(desc(runningSheets.sheetDate), desc(runningSheets.id));

  return rows.map(r => ({
    sheetId: r.sheetId,
    sheetTitle: r.sheetTitle,
    sheetDate: r.sheetDate,
    createdAt: r.createdAt,
    targetId: r.targetId,
    targetName: r.summary.targetName,
    teamLabel: r.summary.teamLabel,
    teamCins: r.summary.teamCins,
    startTime: r.summary.startTime,
    finishTime: r.summary.finishTime,
    location: r.summary.location,
    ioSupport: r.summary.ioSupport,
    intelSupport: r.summary.intelSupport,
    ioContactTiming: r.summary.ioContactTiming,
    ioContactMethod: r.summary.ioContactMethod,
    objectives: r.summary.objectives,
    specialProjects: r.summary.specialProjects,
    criticalDecisions: r.summary.criticalDecisions,
    issues: r.summary.issues,
    completedAt: r.summary.completedAt,
  }));
}

export interface RollupExportRow extends OperationSummaryRollupRow {
  entries: SheetSummaryEntry[];
  vehicles: SheetSummaryVehicle[];
}

/**
 * Same rows as getSheetSummariesForOperation, but with each sheet's
 * summary-entries table and computed vehicle list attached — everything the
 * Deployment Rollup's expanded card view shows, for every sheet at once, so
 * the PDF export doesn't need one round-trip per sheet.
 */
export async function getRollupExportData(
  operationId: number,
  targetId?: number | null
): Promise<RollupExportRow[]> {
  const rows = await getSheetSummariesForOperation(operationId, targetId);
  return Promise.all(
    rows.map(async r => {
      const [entries, sheet, record, allRows] = await Promise.all([
        getSheetSummaryEntries(r.sheetId),
        getRunningSheetById(r.sheetId),
        getSheetSummary(r.sheetId),
        getRowsBySheetId(r.sheetId),
      ]);
      const target = sheet?.targetId
        ? await getTargetById(sheet.targetId)
        : null;
      let dismissed: string[] = [];
      try {
        dismissed = record?.dismissedVehicleKeys
          ? JSON.parse(record.dismissedVehicleKeys)
          : [];
      } catch {
        dismissed = [];
      }
      const vehicles = computeSheetSummaryVehicles(
        target ?? null,
        allRows,
        dismissed
      );
      return { ...r, entries, vehicles };
    })
  );
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

/**
 * Guards against the WIPC vault silently swapping keys underneath existing
 * data. A wrong/rotated WIPC_VAULT_KEY doesn't fail loudly on its own — it
 * just makes vaultDecrypt() throw (or worse, on a key of the right shape,
 * decrypt to garbage) the next time someone happens to open an existing
 * record. Called once at server startup (see server/_core/index.ts) so a
 * mismatch is caught before the app ever serves a request, not weeks later
 * when an officer opens a real WIPC record.
 *
 * On the very first run with a given key (no canary row yet) it records a
 * fingerprint of that key plus a small encrypted marker, so future startups
 * have something to check against.
 */
export async function verifyWipcVaultKeyOrThrow(): Promise<void> {
  if (!process.env.WIPC_VAULT_KEY) return; // vault not configured — nothing to check yet
  const db = await getDb();
  if (!db) return; // DB unavailable — let the normal DB connectivity checks surface this

  const fingerprint = fingerprintVaultKey();
  const [existing] = await db.select().from(wipcVaultKeyCheck).limit(1);

  if (!existing) {
    await db.insert(wipcVaultKeyCheck).values({
      keyFingerprint: fingerprint,
      canaryValue: vaultEncrypt("WIPC_VAULT_KEY_OK"),
    });
    return;
  }

  if (
    existing.keyFingerprint !== fingerprint ||
    vaultDecrypt(existing.canaryValue) !== "WIPC_VAULT_KEY_OK"
  ) {
    throw new Error(
      "WIPC_VAULT_KEY does not match the key that encrypted the existing WIPC vault data. " +
        "Refusing to start with a mismatched key — using it would make existing WIPC records " +
        "permanently unreadable rather than just blocking new saves. If this key change is " +
        "intentional (e.g. the old WIPC data is known-disposable test data), clear the " +
        "wipc_officer_profiles, wipc_members and wipc_vault_key_check tables first, then restart."
    );
  }
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

/** CINs (uppercased) currently registered for WIPC protection. Used only to
 * redact protected identities from data meant to leave the app (e.g. Intel
 * Export) — never to gate normal in-app display, which already shows CINs
 * freely to authenticated users. */
export async function getWipcProtectedCins(): Promise<Set<string>> {
  const members = await listWipcMembers();
  const cins = new Set<string>();
  for (const m of members) {
    const cin = (m as any).cinNumber as string | undefined;
    if (cin && cin.trim()) cins.add(cin.trim().toUpperCase());
  }
  return cins;
}

// ─── Intel Export ───────────────────────────────────────────────────────────
// Structured JSON/CSV data for handing running-sheet content and its mined
// intelligence to another agency's system — Administration → Intel Export.
// Deliberately independent of the Court module (Statement/Witness List/
// WIPC generators) — this reads straight from running sheets and the
// Intelligence entity index, nothing here is ever built from Court output.
// Any CIN that matches a registered WIPC member is redacted, since WIPC
// exists specifically to keep that identity from appearing in material that
// could leave the organisation.

export interface IntelExportRunningSheet {
  operation: {
    id: number;
    name: string;
    promisNumber: string | null;
    imsNumber: string | null;
    investigationUnit: string | null;
  } | null;
  sheet: {
    id: number;
    title: string;
    sheetDate: string | null;
    status: "open" | "closed";
    closedAt: number | null;
    closedByCIN: string | null;
    targetId: number | null;
    targetName: string | null;
    roster: { cin: string; isTeamLeader: boolean }[];
  };
  rows: {
    rowNumber: number;
    date: string | null;
    time: string | null;
    observation: string | null;
    membersPresent: string[];
    certifications: { cin: string; certifiedAt: string }[];
    isLocked: boolean;
  }[];
}

export interface IntelExportEntity {
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  shortForm: string;
  isRegisteredTarget: boolean;
  registryId: number | null;
  occurrences: {
    sheetId: number;
    sheetTitle: string;
    rowNumber: number | null;
    time: string | null;
    snippet: string;
  }[];
}

/** Builds both Intel Export documents (the running sheet(s) themselves, and
 * the intelligence mined from them) for a set of running sheets — the
 * caller decides which of the two, and in which format(s), to actually
 * download. Redacts any WIPC-protected CIN wherever a CIN appears. */
export async function getIntelExportData(sheetIds: number[]): Promise<{
  runningSheets: IntelExportRunningSheet[];
  intelEntities: IntelExportEntity[];
}> {
  const protectedCins = await getWipcProtectedCins();
  const redactCin = (cin: string | null | undefined): string => {
    if (!cin) return "";
    return protectedCins.has(cin.trim().toUpperCase()) ? "WIPC-PROTECTED" : cin;
  };

  const runningSheets: IntelExportRunningSheet[] = [];
  const rowMetaById = new Map<
    number,
    {
      sheetId: number;
      sheetTitle: string;
      rowNumber: number;
      time: string | null;
    }
  >();

  for (const sheetId of sheetIds) {
    const sheet = await getRunningSheetById(sheetId);
    if (!sheet) continue;
    const operation = sheet.operationId
      ? await getOperationById(sheet.operationId)
      : null;
    const rows = await getRowsBySheetId(sheetId);
    const rowIds = rows.map(r => r.id);
    const [members, certs] = await Promise.all([
      getMembersByRowIds(rowIds),
      getCertificationsByRowIds(rowIds),
    ]);

    let roster: { cin: string; isTeamLeader: boolean }[] = [];
    try {
      const raw: Array<{ cin: string; isTeamLeader?: boolean }> = JSON.parse(
        sheet.sheetCins ?? "[]"
      );
      roster = raw.map(c => ({
        cin: redactCin(c.cin),
        isTeamLeader: !!c.isTeamLeader,
      }));
    } catch {
      roster = [];
    }

    rows.forEach(row => {
      rowMetaById.set(row.id, {
        sheetId,
        sheetTitle: sheet.title,
        rowNumber: row.rowNumber,
        time: row.time,
      });
    });

    runningSheets.push({
      operation: operation
        ? {
            id: operation.id,
            name: operation.name,
            promisNumber: operation.promisNumber ?? null,
            imsNumber: operation.imsNumber ?? null,
            investigationUnit: operation.investigationUnit ?? null,
          }
        : null,
      sheet: {
        id: sheet.id,
        title: sheet.title,
        sheetDate: sheet.sheetDate,
        status: sheet.closedAt ? "closed" : "open",
        closedAt: sheet.closedAt ?? null,
        closedByCIN: sheet.closedByCIN ? redactCin(sheet.closedByCIN) : null,
        targetId: sheet.targetId ?? null,
        targetName: sheet.targetName ?? null,
        roster,
      },
      rows: rows.map(row => ({
        rowNumber: row.rowNumber,
        date: row.rowDate ?? sheet.sheetDate ?? null,
        time: row.time,
        observation: row.observation,
        membersPresent: members
          .filter(m => m.rowId === row.id)
          .map(m => redactCin(m.memberName)),
        certifications: certs
          .filter(c => c.rowId === row.id && c.isActive)
          .map(c => ({
            cin: redactCin(c.certifiedByCIN),
            certifiedAt: new Date(c.certifiedAt).toISOString(),
          })),
        isLocked: row.isLocked,
      })),
    });
  }

  const sheetIdSet = new Set(sheetIds);
  const allEntities = await getAllIntelligenceEntities();
  const intelEntities: IntelExportEntity[] = [];
  for (const e of allEntities) {
    const relevantOccurrences = e.occurrences.filter(
      o => sheetIdSet.has(o.sheetId) && o.rowId > 0
    );
    if (relevantOccurrences.length === 0) continue;
    intelEntities.push({
      type: e.type,
      shortForm: e.shortForm,
      isRegisteredTarget: !!e.isTarget || !!e.isAssociate,
      registryId: e.isTarget
        ? (e.targetId ?? null)
        : e.isAssociate
          ? (e.associateId ?? null)
          : null,
      occurrences: relevantOccurrences.map(o => {
        const meta = rowMetaById.get(o.rowId);
        return {
          sheetId: o.sheetId,
          sheetTitle: o.sheetTitle,
          rowNumber: meta?.rowNumber ?? null,
          time: meta?.time ?? null,
          snippet: o.observationSnippet,
        };
      }),
    });
  }

  return { runningSheets, intelEntities };
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

  // Deleted photo attachments — left-joined through sheetRows/runningSheets
  // (present only for row-captured photos) and directly through
  // rowAttachments.operationId (always set, row-captured or manually
  // uploaded) for the operation name, so a manually-uploaded photo with no
  // rowId still surfaces here instead of silently vanishing from the list.
  const deletedAttachments = await db
    .select({
      id: rowAttachments.id,
      deletedAt: rowAttachments.deletedAt,
      deletedByCIN: rowAttachments.deletedByCIN,
      sheetTitle: runningSheets.title,
      rowTime: sheetRows.time,
      operationId: rowAttachments.operationId,
      operationName: operations.name,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .leftJoin(operations, eq(rowAttachments.operationId, operations.id))
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
      label: a.sheetTitle ? `Photo — ${a.sheetTitle}` : "Photo — manual upload",
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

/**
 * Photos left behind by operations/sheets deleted before deleteOperation/
 * deleteRunningSheet/softDeleteOperation/softDeleteSheet cascaded to
 * attachments (a gap that existed until this was added) — still
 * `deletedAt IS NULL` (so still "live" everywhere: Intelligence photo
 * lookups, EntityPhotosSection, etc.) even though their owning operation is
 * gone. Every attachment always has an operationId, so an attachment is
 * orphaned exactly when that operation no longer exists or is itself
 * soft-deleted.
 */
export async function getOrphanedAttachments() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: rowAttachments.id,
      key: rowAttachments.key,
      mimeType: rowAttachments.mimeType,
      isManualUpload: rowAttachments.isManualUpload,
      createdAt: rowAttachments.createdAt,
      operationId: rowAttachments.operationId,
      operationName: operations.name,
      operationDeletedAt: operations.deletedAt,
    })
    .from(rowAttachments)
    .leftJoin(operations, eq(rowAttachments.operationId, operations.id))
    .where(
      and(
        isNull(rowAttachments.deletedAt),
        or(isNull(operations.id), isNotNull(operations.deletedAt))
      )
    );
}

/** Permanently purges every currently-orphaned attachment (see
 * getOrphanedAttachments) — bypasses the normal 7-day Recycle Bin grace
 * period, since these were already deleted (their operation is gone) and
 * simply never got cleaned up. Admin-only, see adminUtils.purgeOrphanedAttachments. */
export async function purgeOrphanedAttachments(): Promise<number> {
  const orphans = await getOrphanedAttachments();
  for (const a of orphans) {
    await deleteRowAttachment(a.id);
  }
  return orphans.length;
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

/** A cross-operation link discovered because a DIFFERENT target/associate
 * registers the same vehicle rego or the same address as this one — e.g.
 * two independent targets on two different operations both have the same
 * car registered. Distinct from a "mentioned" link (which needs the other
 * record's name to actually appear in this one's observation text): this
 * fires purely from registry field overlap, so it catches cases where
 * there's no shared observation text linking the two records at all. */
export interface SharedEntityCrossLink {
  /** Absent when this link came from the vehicle/address itself being
   * independently sighted on another operation, rather than from another
   * specific target/associate registering the same vehicle/address. */
  targetId?: number;
  targetName?: string;
  operationId: number;
  operationName: string;
  via: "vehicle" | "address";
  /** The rego or address (display form) that matched, for the tooltip/explanation. */
  sharedValue: string;
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
  /** Extra addresses beyond HBF: JSON array of {full: string, short: string, ...} */
  extraAddresses: string | null;
  dep: string | null;
  arr: string | null;
  operations: Array<{ id: number; name: string }>;
  /** Cross-operation links found via a shared registered vehicle/address —
   * see SharedEntityCrossLink. */
  sharedEntityLinks: SharedEntityCrossLink[];
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  /** Sheets this target is NOT formally assigned to (no runningSheets.targetId
   * link) but whose observation text mentions them by name — e.g. as a
   * passenger/associate on someone else's running sheet. Sourced from the
   * same name-matched entity data that already powers the Intelligence
   * Folder and Ego Network, so it stays consistent with what those show. */
  mentionedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  observationCount: number;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  /** True until this target has appeared in at least one real running-sheet
   * observation — i.e. everything known about them so far came from the
   * Target Registry (or another non-RS source), not from the field. */
  isIndicesOnly: boolean;
  /** Present when this target is linked (Person Identity Links) to a
   * Registry Associate record confirmed to be the same real person — both
   * profiles show identical combined intelligence; the UI uses this to
   * flag it and link across. */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  /** Associates recorded directly on this target in the Target Registry — a
   * guaranteed link (not inferred from observation-text co-occurrence). */
  registryAssociates: Array<{
    id: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    hb: string | null;
    v1f: string | null;
    v1: string | null;
    isIndicesOnly: boolean;
  }>;
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
    isIndicesOnly: boolean;
  }>;
  /** Cross-operation links found for any target in this operation — a
   * shared registered vehicle/address with a target on a DIFFERENT
   * operation. otherOperationId/otherOperationName refer to that other
   * operation, not this one. */
  crossOperationLinks: Array<{
    targetId: number;
    targetName: string;
    otherOperationId: number;
    otherOperationName: string;
    via: "vehicle" | "address";
    sharedValue: string;
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
  /** Cross-operation links found via a shared registered vehicle/address —
   * see SharedEntityCrossLink. */
  sharedEntityLinks: SharedEntityCrossLink[];
  /** True until this associate has appeared in at least one real running-sheet
   * observation — i.e. everything known about them so far came from the
   * Target Registry (or another non-RS source), not from the field. */
  isIndicesOnly: boolean;
  /** Present when this associate is linked (Person Identity Links) to a
   * Target record confirmed to be the same real person — both profiles
   * show identical combined intelligence; the UI uses this to flag it and
   * link across. */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  /** Present when this associate has a formal Target Registry record — its
   * own structured identity/address/vehicle, not just text-mined mentions. */
  registryAssociateId?: number | null;
  firstNames?: string | null;
  surname?: string | null;
  bornDate?: string | null;
  hbf?: string | null;
  hb?: string | null;
  v1f?: string | null;
  v1?: string | null;
}

export interface IntelVehicleProfile {
  label: string;
  firstObservation: string | null;
  /** Every registered target/associate that lists this vehicle — a rego can
   * legitimately be registered by more than one record (e.g. two
   * independent targets on two different operations both have the same
   * car), so this must never be narrowed to "the first match". */
  linkedTargets: Array<{ targetId: number; name: string }>;
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
  /** True until this vehicle has appeared in at least one real running-sheet
   * observation — i.e. it's only known from a Target/Associate registry field. */
  isIndicesOnly: boolean;
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
  /** True until this location has appeared in at least one real running-sheet
   * observation — i.e. it's only known from a Target/Associate registry field. */
  isIndicesOnly: boolean;
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

// ─── Cross-operation links via shared registered vehicle/address ──────────
// Two independent target/associate records — possibly on two different
// operations — can register the same rego or the same address without ever
// sharing an observation row, so the "mentioned in another operation's
// text" check (mentionedSheets) can't see them. These helpers find that
// kind of link directly from registry fields instead.

/** Every rego this target/associate record has registered — v1/v1f, v2/v2f,
 * and each entry in extraVehicles — normalized via extractRegoUpper so
 * "1GHH884" and "...bearing WA registration 1GHH884..." compare equal. */
function targetVehicleRegos(t: {
  v1f?: string | null;
  v1?: string | null;
  v2f?: string | null;
  v2?: string | null;
  extraVehicles?: string | null;
}): Set<string> {
  const regos = new Set<string>();
  const add = (v?: string | null) => {
    const r = v ? extractRegoUpper(v) : null;
    if (r) regos.add(r);
  };
  add(t.v1f);
  add(t.v1);
  add(t.v2f);
  add(t.v2);
  try {
    const evs: Array<{ full?: string; short?: string }> = JSON.parse(
      t.extraVehicles ?? "[]"
    );
    evs.forEach(ev => {
      add(ev.full);
      add(ev.short);
    });
  } catch {
    /* malformed JSON — skip */
  }
  return regos;
}

/** Every address this target/associate record has registered — hbf/hb,
 * dep, arr, and each entry in extraAddresses — normalized via
 * addressCoreLower so formatting differences don't stop a real match. */
function targetAddressCores(t: {
  hbf?: string | null;
  hb?: string | null;
  dep?: string | null;
  arr?: string | null;
  extraAddresses?: string | null;
}): Set<string> {
  const cores = new Set<string>();
  const add = (v?: string | null) => {
    if (!v) return;
    const c = addressCoreLower(v);
    if (c) cores.add(c);
  };
  add(t.hbf);
  add(t.hb);
  add(t.dep);
  add(t.arr);
  try {
    const eas: Array<{ full?: string; short?: string }> = JSON.parse(
      t.extraAddresses ?? "[]"
    );
    eas.forEach(ea => {
      add(ea.full);
      add(ea.short);
    });
  } catch {
    /* malformed JSON — skip */
  }
  return cores;
}

/** Bulk targetId -> operations map from operationTargetLinks, for folding a
 * registered target's own operation membership into another entity's
 * (vehicle/location/target) cross-operation detection without an N+1 query
 * per target. */
export async function getTargetOperationLinksMap(): Promise<
  Map<number, Array<{ id: number; name: string }>>
> {
  const db = await getDb();
  if (!db) return new Map();
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      id: operations.id,
      name: operations.name,
    })
    .from(operationTargetLinks)
    .innerJoin(operations, eq(operations.id, operationTargetLinks.operationId))
    .where(isNull(operations.deletedAt));
  const map = new Map<number, Array<{ id: number; name: string }>>();
  for (const l of links) {
    if (!map.has(l.targetId)) map.set(l.targetId, []);
    map.get(l.targetId)!.push({ id: l.id, name: l.name });
  }
  return map;
}

/** Finds every OTHER target that registers a vehicle rego or address this
 * one also does, and folds in their operation(s) — see
 * SharedEntityCrossLink. Deliberately targets-only (not associates): an
 * associate's own cross-operation exposure already comes from its parent
 * target's operations, so the residual gap this closes is specifically two
 * independent target records sharing a vehicle/address. */
export async function getSharedEntityCrossLinks(
  ownVehicleRegos: Set<string>,
  ownAddressCores: Set<string>,
  excludeTargetId: number
): Promise<SharedEntityCrossLink[]> {
  if (ownVehicleRegos.size === 0 && ownAddressCores.size === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      extraVehicles: targets.extraVehicles,
      hbf: targets.hbf,
      hb: targets.hb,
      dep: targets.dep,
      arr: targets.arr,
      extraAddresses: targets.extraAddresses,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  const opLinksMap = await getTargetOperationLinksMap();
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();

  for (const t of allTargets) {
    if (t.id === excludeTargetId) continue;
    const theirRegos = targetVehicleRegos(t);
    const theirCores = targetAddressCores(t);
    const matchedVehicle = Array.from(theirRegos).find(r =>
      ownVehicleRegos.has(r)
    );
    const matchedAddress = Array.from(theirCores).find(c =>
      ownAddressCores.has(c)
    );
    if (!matchedVehicle && !matchedAddress) continue;

    const theirOps = opLinksMap.get(t.id) ?? [];
    const opsToUse =
      theirOps.length > 0 ? theirOps : [{ id: 0, name: "(Registry)" }];
    for (const op of opsToUse) {
      if (matchedVehicle) {
        const key = `${t.id}::${op.id}::vehicle`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({
            targetId: t.id,
            targetName: t.name,
            operationId: op.id,
            operationName: op.name,
            via: "vehicle",
            sharedValue: matchedVehicle,
          });
        }
      }
      if (matchedAddress) {
        const key = `${t.id}::${op.id}::address`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({
            targetId: t.id,
            targetName: t.name,
            operationId: op.id,
            operationName: op.name,
            via: "address",
            sharedValue: matchedAddress,
          });
        }
      }
    }
  }
  return links;
}

/** Finds operations reached by a target/associate's own registered
 * vehicle(s)/address(es) via a real observation SIGHTING of that exact
 * vehicle/address — independent of whose name the sighting was logged
 * against. This is what catches "my car was seen on someone else's
 * operation" (e.g. a different target was observed near it) even when
 * that other target doesn't register the vehicle themselves and neither
 * record's name ever appears in the other's text — getSharedEntityCrossLinks
 * above only catches two records that both register the SAME field value;
 * this catches the vehicle/address itself turning up elsewhere. */
export function getEntitySightingCrossLinks(
  allEntities: IntelligenceEntity[],
  ownVehicleRegos: Set<string>,
  ownAddressCores: Set<string>,
  excludeOperationIds: Set<number>
): SharedEntityCrossLink[] {
  if (ownVehicleRegos.size === 0 && ownAddressCores.size === 0) return [];
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();
  for (const e of allEntities) {
    let via: "vehicle" | "address" | null = null;
    if (e.type === "vehicle") {
      const rego = extractRegoUpper(e.shortForm);
      if (rego && ownVehicleRegos.has(rego)) via = "vehicle";
    } else if (e.type === "address" || e.type === "business") {
      if (ownAddressCores.has(addressCoreLower(e.shortForm))) via = "address";
    }
    if (!via) continue;
    for (const occ of e.occurrences) {
      if (occ.rowId <= 0) continue; // real sightings only, not registry-only occurrences
      if (excludeOperationIds.has(occ.operationId)) continue;
      const key = `${occ.operationId}::${via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        operationId: occ.operationId,
        operationName: occ.operationName,
        via,
        sharedValue: e.shortForm,
      });
    }
  }
  return links;
}

/** Finds targets from a DIFFERENT operation whose own entity co-occurs
 * (same observation row) with one of THIS target/associate's own
 * registered vehicle(s)/address(es) — e.g. a different target was
 * observed near/in this record's car. Catches the case
 * getEntitySightingCrossLinks can't: the vehicle/address itself was only
 * ever sighted on this record's own operation, but that same sighting
 * also names a target who belongs to a different operation. */
export async function getCoOccurringTargetCrossLinks(
  allEntities: IntelligenceEntity[],
  ownVehicleRegos: Set<string>,
  ownAddressCores: Set<string>,
  excludeOperationIds: Set<number>
): Promise<SharedEntityCrossLink[]> {
  if (ownVehicleRegos.size === 0 && ownAddressCores.size === 0) return [];

  // Every row where one of my own vehicles/addresses actually appears,
  // tagged with which one so the link can say what was shared.
  const ownRowVia = new Map<
    number,
    { via: "vehicle" | "address"; sharedValue: string }
  >();
  for (const e of allEntities) {
    let via: "vehicle" | "address" | null = null;
    if (e.type === "vehicle") {
      const rego = extractRegoUpper(e.shortForm);
      if (rego && ownVehicleRegos.has(rego)) via = "vehicle";
    } else if (e.type === "address" || e.type === "business") {
      if (ownAddressCores.has(addressCoreLower(e.shortForm))) via = "address";
    }
    if (!via) continue;
    for (const occ of e.occurrences) {
      if (occ.rowId <= 0) continue;
      if (!ownRowVia.has(occ.rowId))
        ownRowVia.set(occ.rowId, { via, sharedValue: e.shortForm });
    }
  }
  if (ownRowVia.size === 0) return [];

  const opLinksMap = await getTargetOperationLinksMap();
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();
  for (const e of allEntities) {
    if (!e.isTarget || !e.targetId) continue;
    const overlap = e.occurrences.find(
      o => o.rowId > 0 && ownRowVia.has(o.rowId)
    );
    if (!overlap) continue;
    const info = ownRowVia.get(overlap.rowId)!;
    for (const op of opLinksMap.get(e.targetId) ?? []) {
      if (excludeOperationIds.has(op.id)) continue;
      const key = `${e.targetId}::${op.id}::${info.via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        targetId: e.targetId,
        targetName: e.shortForm,
        operationId: op.id,
        operationName: op.name,
        via: info.via,
        sharedValue: info.sharedValue,
      });
    }
  }
  return links;
}

/** getSharedEntityCrossLinks, getEntitySightingCrossLinks, and
 * getCoOccurringTargetCrossLinks each dedupe within themselves, but the
 * same underlying fact (e.g. "this vehicle was sighted on operation X")
 * can legitimately be found by more than one of them at once — collapse
 * those into a single entry before returning to the client, preferring a
 * named entry (from the registry-sharing or co-occurring-target checks)
 * over an anonymous one (from the plain entity-sighting check) when both
 * exist for the same target/operation/via/value. */
function dedupeCrossLinks(
  links: SharedEntityCrossLink[]
): SharedEntityCrossLink[] {
  const map = new Map<string, SharedEntityCrossLink>();
  for (const l of links) {
    const key = `${l.targetId ?? "-"}::${l.operationId}::${l.via}::${l.sharedValue.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || (!existing.targetName && l.targetName)) {
      map.set(key, l);
    }
  }
  return Array.from(map.values());
}

async function buildTargetOperationalAssociations(
  targetId: number,
  targetLabel: string,
  targetName: string,
  allEntities: IntelligenceEntity[],
  targetEntity: IntelligenceEntity | undefined,
  /** Restrict to mentions on these sheets. Omitted = app-wide (the target's
   * own profile); the Operation Profile passes its own sheets so it stays a
   * summary of that operation rather than of the target everywhere. */
  scopeSheetIds?: Set<number>
): Promise<{
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
}> {
  // Rows where this target is actually mentioned — the same occurrence data
  // that links them in the Intelligence Folder / Ego Network, so a target's
  // profile shows the co-occurring people/vehicles/locations those views
  // already agree on.
  //
  // Every row of a formally-assigned sheet used to be included as well. That
  // was wrong: a sheet assignment says who the team set out to watch, not who
  // they saw. On a shift spent watching a house the target never leaves, the
  // associates and vehicles that do come and go were all being listed as the
  // target's own associations. An entity only associates with the target
  // where both are named in the same observation.
  const targetRowIds = attributedRowIds(targetEntity?.occurrences, {
    sheetIds: scopeSheetIds,
  });

  if (!targetRowIds.size)
    return { assocPersons: [], assocVehicles: [], assocLocations: [] };
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
  const targetEntity = allEntities.find(
    e => e.isTarget && e.targetId === targetId
  );

  // Sheets this target is mentioned in by name (per the same entity data the
  // Intelligence Folder / Ego Network already use) but isn't formally
  // assigned to — e.g. appearing as a passenger on someone else's sheet.
  const linkedSheetIdSet = new Set(linkedSheetRows.map(s => s.id));
  const mentionedSheetIds = Array.from(
    new Set(
      (targetEntity?.occurrences ?? [])
        .filter(occ => occ.rowId > 0 && !linkedSheetIdSet.has(occ.sheetId))
        .map(occ => occ.sheetId)
    )
  );
  let mentionedSheets: IntelTargetProfile["mentionedSheets"] = [];
  if (mentionedSheetIds.length) {
    const mentionedSheetRows = await db
      .select({
        id: runningSheets.id,
        title: runningSheets.title,
        operationId: runningSheets.operationId,
      })
      .from(runningSheets)
      .where(
        and(
          inArray(runningSheets.id, mentionedSheetIds),
          isNull(runningSheets.deletedAt)
        )
      );
    const extraOpIds2 = Array.from(
      new Set(
        mentionedSheetRows.map(s => s.operationId).filter(id => !opNames[id])
      )
    );
    if (extraOpIds2.length) {
      const extraOps2 = await db
        .select({ id: operations.id, name: operations.name })
        .from(operations)
        .where(inArray(operations.id, extraOpIds2));
      for (const op of extraOps2) opNames[op.id] = op.name;
    }
    mentionedSheets = mentionedSheetRows.map(s => ({
      id: s.id,
      title: s.title,
      operationId: s.operationId,
      operationName: opNames[s.operationId] ?? "Unknown",
    }));

    // Mentioned-only sheets aren't formally linked to this target, but the
    // target still appears in their rows — count those rows too so the
    // profile's Observations total matches "everywhere this target shows
    // up", not just formally-assigned sheets.
    for (const sheet of mentionedSheetRows) {
      const cnt = await db
        .select({ c: sql<number>`count(*)` })
        .from(sheetRows)
        .where(eq(sheetRows.sheetId, sheet.id));
      observationCount += Number(cnt[0]?.c ?? 0);
    }
  }

  const targetLabel = target.tgt ?? target.name;
  const { assocPersons, assocVehicles, assocLocations } =
    await buildTargetOperationalAssociations(
      targetId,
      targetLabel,
      target.name,
      allEntities,
      targetEntity
    );
  await populateAssocPhotos(assocPersons, assocVehicles, assocLocations);
  markPreviousEntities(
    assocVehicles,
    assocLocations,
    await getPreviousEntityMatchers()
  );

  const registryAssociateRows = await getAssociatesForTarget(targetId);
  const associateEntityById = new Map(
    allEntities
      .filter(e => e.isAssociate && e.associateId != null)
      .map(e => [e.associateId as number, e])
  );

  const ownVehicleRegos = targetVehicleRegos(target);
  const ownAddressCores = targetAddressCores(target);
  const ownOperationIds = new Set(opLinks.map(o => o.id));
  // Same reasoning as the mirror-image check in getIntelAssociateProfile: if
  // this target is Person-Identity-Linked to a registry associate, that
  // associate's own operation (via its parent target) is this same
  // person's own turf, not a genuine cross-operation connection to flag.
  if (target.linkedAssociateId) {
    const linkedAssociate = await getAssociateById(target.linkedAssociateId);
    if (linkedAssociate) {
      const parentOps = await getLinkedOperationsForTarget(
        linkedAssociate.targetId
      );
      for (const op of parentOps) ownOperationIds.add(op.operationId);
    }
  }
  const sharedEntityLinks = dedupeCrossLinks([
    ...(await getSharedEntityCrossLinks(
      ownVehicleRegos,
      ownAddressCores,
      targetId
    )),
    ...getEntitySightingCrossLinks(
      allEntities,
      ownVehicleRegos,
      ownAddressCores,
      ownOperationIds
    ),
    ...(await getCoOccurringTargetCrossLinks(
      allEntities,
      ownVehicleRegos,
      ownAddressCores,
      ownOperationIds
    )),
  ]);

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
    extraAddresses: target.extraAddresses ?? null,
    dep: target.dep,
    arr: target.arr,
    operations: opLinks,
    sharedEntityLinks,
    linkedSheets: linkedSheetRows.map(s => ({
      id: s.id,
      title: s.title,
      operationId: s.operationId,
      operationName: opNames[s.operationId] ?? "Unknown",
    })),
    mentionedSheets,
    observationCount,
    assocPersons,
    assocVehicles,
    assocLocations,
    isIndicesOnly: targetEntity?.isIndicesOnly ?? false,
    identicalProfile: targetEntity?.identicalProfile ?? null,
    registryAssociates: registryAssociateRows.map(a => ({
      id: a.id,
      name: a.name,
      tgt: a.tgt,
      hbf: a.hbf,
      hb: a.hb,
      v1f: a.v1f,
      v1: a.v1,
      isIndicesOnly: associateEntityById.get(a.id)?.isIndicesOnly ?? false,
    })),
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
  const operationSheetIds = new Set(sheets.map(s => s.id));

  const targetProfilesRaw = await Promise.all(
    targetLinks.map(async ({ targetId }) => {
      const target = await getTargetById(targetId);
      if (!target) return null;
      const targetLabel = target.tgt ?? target.name;
      const targetSheets = sheets.filter(s => s.targetId === targetId);
      const targetEntity = allEntities.find(
        e => e.isTarget && e.targetId === targetId
      );
      // Operation Profile is scoped to this operation's own sheets by
      // design (it's summarizing the operation, not the target), unlike the
      // target's own profile page which widens app-wide. That scoping is
      // now expressed as an explicit sheet scope rather than by withholding
      // targetEntity — associations are the rows the target is mentioned
      // in, and withholding the entity would leave nothing to match on.
      const { assocPersons, assocVehicles, assocLocations } =
        await buildTargetOperationalAssociations(
          targetId,
          targetLabel,
          target.name,
          allEntities,
          targetEntity,
          operationSheetIds
        );
      // Does this target share a registered vehicle/address with a target
      // on a DIFFERENT operation, or has its own vehicle/address been
      // independently sighted on a different operation? (Same-operation
      // matches aren't a cross-operation signal, so those are filtered out
      // below.)
      const ownVehicleRegos = targetVehicleRegos(target);
      const ownAddressCores = targetAddressCores(target);
      const crossLinksRaw = dedupeCrossLinks([
        ...(await getSharedEntityCrossLinks(
          ownVehicleRegos,
          ownAddressCores,
          targetId
        )),
        ...getEntitySightingCrossLinks(
          allEntities,
          ownVehicleRegos,
          ownAddressCores,
          new Set([operationId])
        ),
        ...(await getCoOccurringTargetCrossLinks(
          allEntities,
          ownVehicleRegos,
          ownAddressCores,
          new Set([operationId])
        )),
      ]);
      const crossLinks = crossLinksRaw.filter(
        l => l.operationId !== operationId
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
        isIndicesOnly: targetEntity?.isIndicesOnly ?? false,
        crossLinks,
      };
    })
  );
  // crossLinks entries can come from more than one detection mechanism
  // (e.g. a registry-field match against one other target, and a separate
  // row co-occurrence against a different other target) that both resolve
  // to the same fact once displayed here — this flatMap deliberately
  // overwrites each entry's own internal targetId/targetName with THIS
  // (outer-loop) target's, so those two mechanisms produce rows that are
  // indistinguishable to the reader even though dedupeCrossLinks() above
  // correctly kept them apart (it saw two different internal targetIds).
  // Collapse again here, on the identity actually shown on screen: this
  // target, that other operation, that kind of link — regardless of which
  // mechanism found it or what exact value it matched on.
  const crossOperationLinksRaw: IntelOperationProfile["crossOperationLinks"] =
    targetProfilesRaw
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .flatMap(t =>
        t.crossLinks.map(l => ({
          targetId: t.targetId,
          targetName: t.name,
          otherOperationId: l.operationId,
          otherOperationName: l.operationName,
          via: l.via,
          sharedValue: l.sharedValue,
        }))
      );
  const seenOpLinks = new Set<string>();
  const crossOperationLinks = crossOperationLinksRaw.filter(l => {
    const key = `${l.targetId}::${l.otherOperationId}::${l.via}`;
    if (seenOpLinks.has(key)) return false;
    seenOpLinks.add(key);
    return true;
  });
  const targetProfiles = targetProfilesRaw
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map(({ crossLinks, ...rest }) => rest) as IntelOperationProfile["targets"];

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
    crossOperationLinks,
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

  // Guaranteed link: a registry associate always belongs to exactly one
  // target, regardless of whether they've been mentioned in that target's
  // observation text yet — this must show up even with zero row overlap.
  if (entity.isAssociate && entity.associateOfTargetId) {
    const parentOpLinks = await db
      .select({ id: operations.id, name: operations.name })
      .from(operationTargetLinks)
      .innerJoin(
        operations,
        eq(operations.id, operationTargetLinks.operationId)
      )
      .where(
        and(
          eq(operationTargetLinks.targetId, entity.associateOfTargetId),
          isNull(operations.deletedAt)
        )
      );
    if (parentOpLinks.length > 0) {
      for (const op of parentOpLinks) {
        linkedTargets.push({
          targetId: entity.associateOfTargetId,
          name: entity.associateOfTargetName ?? "Unknown",
          operationId: op.id,
          operationName: op.name,
        });
      }
    } else {
      linkedTargets.push({
        targetId: entity.associateOfTargetId,
        name: entity.associateOfTargetName ?? "Unknown",
        operationId: 0,
        operationName: "(Registry)",
      });
    }
  }

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

  // Surface the associate's own structured identity/address/vehicle if this
  // is a formal registry record, not just a text-mined mention.
  const registryAssociate = entity.isAssociate
    ? await getAssociateById(entity.associateId ?? -1)
    : undefined;

  // Associates aren't rows in the `targets` table, so there's normally no
  // self id to exclude — EXCEPT when this associate is Person-Identity-
  // Linked to a target (linkedTargetId), whose shared fields (hbf/v1f/etc.)
  // are kept in sync with this record — see updateAssociate/updateTarget.
  // Without excluding it, that linked target's own registered
  // vehicle/address would falsely show up here as a "shared" cross-op
  // match, when it's actually just this same person's other profile (now
  // already surfaced by the "Identical profile" banner/combined intel).
  const associateOwnOperationIds = new Set(
    linkedTargets.map(t => t.operationId)
  );
  // Same reasoning as the linkedTargetId exclusion above, for the two
  // occurrence-based cross-link checks below: a real sighting of this
  // person's own vehicle/address on an operation the LINKED target (not
  // this associate's associateOfTargetId) is tasked to is this same
  // person's own turf, not a cross-operation connection to flag.
  if (registryAssociate?.linkedTargetId) {
    const linkedTargetOps = await getLinkedOperationsForTarget(
      registryAssociate.linkedTargetId
    );
    for (const op of linkedTargetOps)
      associateOwnOperationIds.add(op.operationId);
  }
  const sharedEntityLinks = registryAssociate
    ? dedupeCrossLinks([
        ...(await getSharedEntityCrossLinks(
          targetVehicleRegos(registryAssociate),
          targetAddressCores(registryAssociate),
          registryAssociate.linkedTargetId ?? -1
        )),
        ...getEntitySightingCrossLinks(
          allEntities,
          targetVehicleRegos(registryAssociate),
          targetAddressCores(registryAssociate),
          associateOwnOperationIds
        ),
        ...(await getCoOccurringTargetCrossLinks(
          allEntities,
          targetVehicleRegos(registryAssociate),
          targetAddressCores(registryAssociate),
          associateOwnOperationIds
        )),
      ])
    : [];

  return {
    label: entity.shortForm,
    type: entity.type as "person" | "business",
    linkedTargets,
    sharedEntityLinks,
    linkedSheets: Array.from(sheetMap.values()),
    assocLocations,
    assocVehicles,
    isIndicesOnly: entity.isIndicesOnly ?? false,
    identicalProfile: entity.identicalProfile ?? null,
    registryAssociateId: registryAssociate?.id ?? null,
    firstNames: registryAssociate?.firstNames ?? null,
    surname: registryAssociate?.surname ?? null,
    bornDate: registryAssociate?.bornDate ?? null,
    hbf: registryAssociate?.hbf ?? null,
    hb: registryAssociate?.hb ?? null,
    v1f: registryAssociate?.v1f ?? null,
    v1: registryAssociate?.v1 ?? null,
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
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      extraVehicles: targets.extraVehicles,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Registered target(s) — a rego can legitimately be registered by more
  // than one target (e.g. two independent targets on two different
  // operations both have the same car), so this collects every match, not
  // just the first. Deliberately registry-field-only: a target/associate
  // that merely co-occurs with this vehicle in an observation row belongs
  // in assocPersons below, not here — "registered target" should mean
  // exactly what the Target Registry says, not an inferred association.
  const selfRegoForMatch = extractRegoUpper(label);
  const linkedTargetsMap = new Map<
    number,
    { targetId: number; name: string }
  >();
  if (selfRegoForMatch) {
    for (const t of allTargets) {
      if (targetVehicleRegos(t).has(selfRegoForMatch)) {
        linkedTargetsMap.set(t.id, { targetId: t.id, name: t.name });
      }
    }
  }
  const linkedTargets = Array.from(linkedTargetsMap.values());

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
  // A registered owner's own operation(s) are a cross-operation signal in
  // their own right, even when this vehicle has never actually been
  // observed (via a running-sheet row) in that operation — e.g. it's
  // registered to a target tasked there, but hasn't been sighted yet.
  const opLinksMap = await getTargetOperationLinksMap();
  for (const lt of linkedTargets) {
    for (const op of opLinksMap.get(lt.targetId) ?? []) {
      if (!opMap.has(op.id)) opMap.set(op.id, op);
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
    // A target who merely co-occurs with this vehicle in an observation
    // (e.g. named alongside it in the same row) still makes their own
    // operation(s) relevant here — someone from another operation showing
    // up around this vehicle is exactly the kind of thing worth flagging,
    // even though it doesn't make them a "registered" owner (see above).
    if (other.isTarget && other.targetId) {
      for (const op of opLinksMap.get(other.targetId) ?? []) {
        if (!opMap.has(op.id)) opMap.set(op.id, op);
      }
    }
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
    linkedTargets,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons,
    assocLocations,
    isPrevious,
    isIndicesOnly: entity.isIndicesOnly ?? false,
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
      hb: targets.hb,
      dep: targets.dep,
      arr: targets.arr,
      extraAddresses: targets.extraAddresses,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Registered target(s) — registry-field-only (hbf/hb/dep/arr/
  // extraAddresses). Deliberately excludes row co-occurrence: a target
  // that merely appears in an observation alongside this address belongs
  // in assocPersons below, not here — "registered target" should mean
  // exactly what the Target Registry says.
  const selfCoreForMatch = addressCoreLower(label);
  const linkedTargetsMap = new Map<
    number,
    { targetId: number; name: string }
  >();
  for (const t of allTargets) {
    if (targetAddressCores(t).has(selfCoreForMatch)) {
      linkedTargetsMap.set(t.id, { targetId: t.id, name: t.name });
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
  // A registered owner's own operation(s) are a cross-operation signal in
  // their own right, even when this address has never actually been
  // observed (via a running-sheet row) in that operation.
  const opLinksMap = await getTargetOperationLinksMap();
  for (const lt of linkedTargets) {
    for (const op of opLinksMap.get(lt.targetId) ?? []) {
      if (!opMap.has(op.id)) opMap.set(op.id, op);
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
    // A target who merely co-occurs with this address in an observation
    // still makes their own operation(s) relevant here — see the matching
    // comment in getIntelVehicleProfile.
    if (other.isTarget && other.targetId) {
      for (const op of opLinksMap.get(other.targetId) ?? []) {
        if (!opMap.has(op.id)) opMap.set(op.id, op);
      }
    }
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
    isIndicesOnly: entity.isIndicesOnly ?? false,
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
    /** Set when this pin is one of the target's Additional Addresses (e.g. "Work — KFC Cannington") rather than the home address or a co-occurrence match */
    addressLabel: string | null;
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
      extraAddresses: targets.extraAddresses,
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
      extraAddresses: targets.extraAddresses,
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

  // Every caller runs its label through here before keying, so a target's
  // raw registry text ("101 Eric Street, COTTESLOE WA (101 Eric Street)")
  // and an already-formatted observation-derived label ("101 Eric Street,
  // COTTESLOE") converge on the identical key instead of producing two
  // separate pins for the same real place — formatIntelAddress is
  // idempotent, so normalizing an already-clean label is a no-op. Without
  // this, a target's home address (registry) and its own text-mined
  // mentions (observation) key apart and never merge — the "double-stacked
  // popup" bug: a red TARGET ADDRESS card and a purple OBSERVED LOCATION
  // card both pinned at the exact same address.
  const ensureLocation = (label: string): IntelMapLocation => {
    const normalized = formatIntelAddress(label) || label.trim();
    const key = normalized.toLowerCase().trim();
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        label: normalized,
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
          addressLabel: null,
        });
      }
    }

    // Additional Addresses from the target's Add Target form (e.g. "Work —
    // KFC Cannington") get their own pins too — purple (observation), same
    // as any other non-home location, since only the home address counts as
    // "target_address" red. Each still carries the target's card details so
    // the popup reads exactly like the home-address pin, plus the address's
    // own label to say which additional address this is.
    let extraAddrs: { full?: string; label?: string }[] = [];
    try {
      extraAddrs = t.extraAddresses ? JSON.parse(t.extraAddresses) : [];
    } catch {
      extraAddrs = [];
    }
    for (const ea of extraAddrs) {
      const addr = ea.full?.trim();
      if (!addr) continue;
      const loc = ensureLocation(addr);
      // Don't downgrade a pin that's already this target's (or another
      // target's) home address at the same spot.
      if (loc.type !== "target_address") loc.type = "observation";
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
          addressLabel: ea.label?.trim() || "Additional address",
        });
      }
    }
  }

  // Step 1b: Register each relevant target's associates' own registered
  // addresses too — same idea as Step 1, but an associate isn't a target
  // (no operationTargetLinks row of its own), so it can never appear via
  // Step 1's target loop. Without this, an associate's HBF/HB only ever
  // shows up on the map if that address text also happens to get mined
  // from an observation row — adding an associate to the Target Registry
  // alone produced no pin at all. Always purple/"observation" (never
  // upgraded to target_address — that colour is reserved for the target's
  // own home address), listed by name in assocPersons like any other
  // co-occurring person rather than linkedTargets, since an associate has
  // no targetId of its own to key that array on.
  if (relevantTargets.length > 0) {
    const relevantTargetIds = relevantTargets.map(t => t.id);
    const relevantAssociates = await db
      .select({
        name: associates.name,
        hbf: associates.hbf,
        hb: associates.hb,
        extraAddresses: associates.extraAddresses,
      })
      .from(associates)
      .where(
        and(
          inArray(associates.targetId, relevantTargetIds),
          isNull(associates.deletedAt)
        )
      );
    for (const a of relevantAssociates) {
      const addrFields = [a.hbf?.trim() || a.hb?.trim() || null].filter(
        Boolean
      ) as string[];
      let extraAddrs: { full?: string }[] = [];
      try {
        extraAddrs = a.extraAddresses ? JSON.parse(a.extraAddresses) : [];
      } catch {
        extraAddrs = [];
      }
      for (const ea of extraAddrs) {
        const addr = ea.full?.trim();
        if (addr) addrFields.push(addr);
      }
      for (const addr of addrFields) {
        const loc = ensureLocation(addr);
        if (!loc.assocPersons.includes(a.name)) loc.assocPersons.push(a.name);
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
    // Collect all rowIds for this location entity
    const locRowIds = new Set(
      locEntity.occurrences.filter(o => o.rowId > 0).map(o => o.rowId)
    );
    // An entity with no real (rowId > 0) occurrence has never actually been
    // observed — it exists only because it's typed into a registry card
    // (isIndicesOnly). Registering it here would create a spurious
    // "observation" pin for a place nobody has ever been seen at. This
    // matters especially for a target's own home address: before registry
    // addresses were tidied for display (17e2229), this entity's shortForm
    // was the same raw HBF text Step 1 keys the "target_address" pin on, so
    // ensureLocation's string-keyed dedup happened to collapse them into
    // one. Tidying formatted the two labels differently, so they now key
    // apart — producing a second, phantom "OBSERVED LOCATION" card for the
    // exact same address with nothing behind it.
    if (locRowIds.size === 0) continue;
    const loc = ensureLocation(locEntity.shortForm);
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
              addressLabel: null,
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

  if (sharingEnabled) {
    await recordUserLocationHistory(
      userId,
      deviceId,
      lat,
      lng,
      speed,
      heading,
      accuracy,
      opIdsJson,
      now
    );
  }

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

// ─── User Location History (trail / live trace) ────────────────────────────────

function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Only append a trail point when the officer has moved a meaningful distance
// since the last recorded point, or enough time has passed. A slower
// stationary heartbeat still keeps the trail continuous (and useful for
// "where was officer X at time Y") when parked.
//
// These are tuned for a vehicle. At 10 m / 2 s a car records continuously
// from about 18 km/h up — 2 s apart at 50 km/h is a point every ~28 m, which
// draws a road-following line rather than the corner-cutting chords the old
// 25 m / 15 s pair produced (a point every ~208 m at 50 km/h). Below ~18 km/h
// the distance gate takes over and spaces points out again, which is what you
// want at walking pace or crawling a car park.
const HISTORY_MOVE_THRESHOLD_M = 10;
const HISTORY_MOVING_MIN_INTERVAL_MS = 2_000;
const HISTORY_STATIONARY_HEARTBEAT_MS = 120_000;
/**
 * A 10 m movement gate is inside the error margin of a poor GPS fix, so a
 * parked car with ±20 m drift would otherwise write a point every 2 seconds
 * and draw itself wandering around the street. Fixes vaguer than this are
 * treated as noise for movement purposes — the stationary heartbeat below
 * still records them, so the trail stays continuous either way.
 */
const HISTORY_MAX_ACCURACY_M = 50;

async function recordUserLocationHistory(
  userId: number,
  deviceId: string,
  lat: number,
  lng: number,
  speed: number | null,
  heading: number | null,
  accuracy: number | null,
  operationIdsJson: string,
  now: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [lastPoint] = await db
    .select({
      lat: userLocationHistory.lat,
      lng: userLocationHistory.lng,
      recordedAt: userLocationHistory.recordedAt,
    })
    .from(userLocationHistory)
    .where(
      and(
        eq(userLocationHistory.userId, userId),
        eq(userLocationHistory.deviceId, deviceId)
      )
    )
    .orderBy(desc(userLocationHistory.recordedAt))
    .limit(1);

  let shouldRecord = !lastPoint;
  if (lastPoint) {
    const elapsed = now - lastPoint.recordedAt;
    const distance = haversineMetres(lastPoint.lat, lastPoint.lng, lat, lng);
    // A vague fix can "move" 10 m while the vehicle is stationary, so it
    // only counts as movement when the fix is accurate enough to trust.
    const fixIsPrecise = accuracy == null || accuracy <= HISTORY_MAX_ACCURACY_M;
    if (
      fixIsPrecise &&
      distance >= HISTORY_MOVE_THRESHOLD_M &&
      elapsed >= HISTORY_MOVING_MIN_INTERVAL_MS
    ) {
      shouldRecord = true;
    } else if (elapsed >= HISTORY_STATIONARY_HEARTBEAT_MS) {
      shouldRecord = true;
    }
  }
  if (!shouldRecord) return;

  await db.insert(userLocationHistory).values({
    userId,
    deviceId,
    lat,
    lng,
    speed,
    heading,
    accuracy,
    operationIds: operationIdsJson,
    recordedAt: now,
  });
}

export interface UserLocationHistoryPointDTO {
  lat: number;
  lng: number;
  speed: number | null;
  recordedAt: number;
}

/**
 * Returns each requested user's recorded location trail since `sinceMs`,
 * ordered oldest-first, for drawing a live-trace line on the map. Grouped by
 * userId (not deviceId) since a single officer's trail should read as one
 * continuous line regardless of which device recorded which point.
 */
export async function getUserLocationHistories(
  userIds: number[],
  sinceMs: number
): Promise<Record<number, UserLocationHistoryPointDTO[]>> {
  const db = await getDb();
  const result: Record<number, UserLocationHistoryPointDTO[]> = {};
  if (!db || userIds.length === 0) return result;

  const rows = await db
    .select({
      userId: userLocationHistory.userId,
      lat: userLocationHistory.lat,
      lng: userLocationHistory.lng,
      speed: userLocationHistory.speed,
      recordedAt: userLocationHistory.recordedAt,
    })
    .from(userLocationHistory)
    .where(
      and(
        inArray(userLocationHistory.userId, userIds),
        gt(userLocationHistory.recordedAt, sinceMs)
      )
    )
    .orderBy(asc(userLocationHistory.recordedAt));

  for (const r of rows) {
    if (!result[r.userId]) result[r.userId] = [];
    result[r.userId].push({
      lat: r.lat,
      lng: r.lng,
      speed: r.speed,
      recordedAt: r.recordedAt,
    });
  }
  return result;
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
  /** Explicit calendar date (YYYY-MM-DD, Perth) set by the operator */
  rowDate: string | null;
  /** Legacy day-offset (0 = sheet start day, 1 = next day, etc.) */
  dayOffset: number;
}

/**
 * Return all sheet rows that contain a bracketed address entity,
 * merged with any persisted waypoint overrides (comment / moved position).
 */
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

  const result: RsWaypointRow[] = [];

  for (let wi = 0; wi < addressRows.length; wi++) {
    const { row, address, addressFull } = addressRows[wi];
    const override = overrideMap.get(row.id);

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

// ─── SMEAC Briefings ───────────────────────────────────────────────────────
// See drizzle/schema.ts for the "exceptional use only" framing. A draft is
// only visible to its creator; posting is the one-way action that notifies
// every user and makes it visible to everyone.

export interface SmeacTeamSlot {
  name: string;
  // Only set when this slot came from a real roster CIN (via
  // getSmeacRosterPrefill) — lets the acknowledgement view match this slot
  // to a real acknowledgement. A manually-typed team member has no cin and
  // so can't show an acknowledged/not-acknowledged state, only "unlinked".
  cin?: string | null;
  vehicle: string;
  foot: string;
  skill: string;
  kit: string;
  isTeamLeader: boolean;
}

function parseSmeacStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSmeacTeamSlots(raw: string | null): SmeacTeamSlot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // sheetCins (the source for a slot's cin) is stored in whatever case it
    // was entered, but users.cin and acknowledgement cins are always
    // upper-cased — normalize here so the acknowledgedCins match works.
    return parsed.map((slot: SmeacTeamSlot) => ({
      ...slot,
      cin: slot.cin ? slot.cin.toUpperCase() : slot.cin,
    }));
  } catch {
    return [];
  }
}

export interface SmeacBriefingView
  extends Omit<
    SmeacBriefing,
    | "objectives"
    | "teamSlots"
    | "extraLocations"
    | "otherAgencies"
    | "accoutrements"
    | "covertIdentifiers"
  > {
  objectives: string[];
  teamSlots: SmeacTeamSlot[];
  extraLocations: string[];
  otherAgencies: string[];
  accoutrements: string[];
  covertIdentifiers: string[];
}

function toSmeacBriefingView(row: SmeacBriefing): SmeacBriefingView {
  return {
    ...row,
    objectives: parseSmeacStringArray(row.objectives),
    teamSlots: parseSmeacTeamSlots(row.teamSlots),
    extraLocations: parseSmeacStringArray(row.extraLocations),
    otherAgencies: parseSmeacStringArray(row.otherAgencies),
    accoutrements: parseSmeacStringArray(row.accoutrements),
    covertIdentifiers: parseSmeacStringArray(row.covertIdentifiers),
  };
}

export interface UpsertSmeacBriefingInput {
  operationId: number;
  sheetId?: number | null;
  targetId?: number | null;
  voiOverride?: string | null;
  hbOverride?: string | null;
  extraLocations?: string[];
  situation?: string | null;
  backgroundIntel?: string | null;
  knownRisks?: string | null;
  otherAgencies?: string[];
  mission?: string | null;
  overallPlan?: string | null;
  actionsOn?: string | null;
  situationChange?: string | null;
  objectives?: string[];
  legalAuthArrest?: string | null;
  afpOrders?: string | null;
  warrant?: string | null;
  accoutrements?: string[];
  covertIdentifiers?: string[];
  firstAidAllVehicles?: boolean;
  firstAidMemberName?: string | null;
  commsPrimary?: string | null;
  commsSecondary?: string | null;
  locationOfTeamLeader?: string | null;
  reportingProcedures?: string | null;
  teamSlots?: SmeacTeamSlot[];
}

export async function createSmeacBriefingDraft(
  data: UpsertSmeacBriefingInput,
  createdBy: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(smeacBriefings).values({
    operationId: data.operationId,
    sheetId: data.sheetId ?? null,
    targetId: data.targetId ?? null,
    voiOverride: data.voiOverride ?? null,
    hbOverride: data.hbOverride ?? null,
    extraLocations: JSON.stringify(data.extraLocations ?? []),
    situation: data.situation ?? null,
    backgroundIntel: data.backgroundIntel ?? null,
    knownRisks: data.knownRisks ?? null,
    otherAgencies: JSON.stringify(data.otherAgencies ?? []),
    mission: data.mission ?? null,
    overallPlan: data.overallPlan ?? null,
    actionsOn: data.actionsOn ?? null,
    situationChange: data.situationChange ?? null,
    objectives: JSON.stringify(data.objectives ?? []),
    legalAuthArrest: data.legalAuthArrest ?? null,
    afpOrders: data.afpOrders ?? null,
    warrant: data.warrant ?? null,
    accoutrements: JSON.stringify(data.accoutrements ?? []),
    covertIdentifiers: JSON.stringify(data.covertIdentifiers ?? []),
    firstAidAllVehicles: data.firstAidAllVehicles ?? true,
    firstAidMemberName: data.firstAidMemberName ?? null,
    commsPrimary: data.commsPrimary ?? null,
    commsSecondary: data.commsSecondary ?? null,
    locationOfTeamLeader: data.locationOfTeamLeader ?? null,
    reportingProcedures: data.reportingProcedures ?? null,
    teamSlots: JSON.stringify(data.teamSlots ?? []),
    status: "draft",
    createdBy,
  });
  return result.insertId as number;
}

/**
 * Updates a briefing's content regardless of status — a posted briefing can
 * be corrected without that alone re-notifying anyone; re-notifying is only
 * ever a deliberate, separate call to postSmeacBriefing.
 */
export async function updateSmeacBriefing(
  id: number,
  data: UpsertSmeacBriefingInput
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(smeacBriefings)
    .set({
      operationId: data.operationId,
      sheetId: data.sheetId ?? null,
      targetId: data.targetId ?? null,
      voiOverride: data.voiOverride ?? null,
      hbOverride: data.hbOverride ?? null,
      extraLocations: JSON.stringify(data.extraLocations ?? []),
      situation: data.situation ?? null,
      backgroundIntel: data.backgroundIntel ?? null,
      knownRisks: data.knownRisks ?? null,
      otherAgencies: JSON.stringify(data.otherAgencies ?? []),
      mission: data.mission ?? null,
      overallPlan: data.overallPlan ?? null,
      actionsOn: data.actionsOn ?? null,
      situationChange: data.situationChange ?? null,
      objectives: JSON.stringify(data.objectives ?? []),
      legalAuthArrest: data.legalAuthArrest ?? null,
      afpOrders: data.afpOrders ?? null,
      warrant: data.warrant ?? null,
      accoutrements: JSON.stringify(data.accoutrements ?? []),
      covertIdentifiers: JSON.stringify(data.covertIdentifiers ?? []),
      firstAidAllVehicles: data.firstAidAllVehicles ?? true,
      firstAidMemberName: data.firstAidMemberName ?? null,
      commsPrimary: data.commsPrimary ?? null,
      commsSecondary: data.commsSecondary ?? null,
      locationOfTeamLeader: data.locationOfTeamLeader ?? null,
      reportingProcedures: data.reportingProcedures ?? null,
      teamSlots: JSON.stringify(data.teamSlots ?? []),
      revision: sql`${smeacBriefings.revision} + 1`,
    })
    .where(eq(smeacBriefings.id, id));
}

export async function getSmeacBriefingById(
  id: number
): Promise<SmeacBriefingView | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(smeacBriefings)
    .where(and(eq(smeacBriefings.id, id), isNull(smeacBriefings.deletedAt)))
    .limit(1);
  return row ? toSmeacBriefingView(row) : undefined;
}

export async function listSmeacBriefings(): Promise<SmeacBriefingView[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(smeacBriefings)
    .where(isNull(smeacBriefings.deletedAt))
    .orderBy(desc(smeacBriefings.createdAt));
  return rows.map(toSmeacBriefingView);
}

/**
 * Posts (or re-posts) a briefing — always notifies every user, whether this
 * is the first post of a draft or a re-post after editing a already-posted
 * one. Returns the id list notified, or undefined if the briefing doesn't
 * exist (or was deleted).
 */
export async function postSmeacBriefing(
  id: number,
  postedByCIN: string,
  notifyBody: { title: string; body: string; url: string },
  // Explicit recipient list (e.g. from the "who to notify" picker) — falls
  // back to every registered user when omitted or empty, same as before.
  targetUserIds?: number[]
): Promise<number[] | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(smeacBriefings)
    .where(and(eq(smeacBriefings.id, id), isNull(smeacBriefings.deletedAt)))
    .limit(1);
  if (!existing) return undefined;

  await db
    .update(smeacBriefings)
    .set({ status: "posted", postedAt: Date.now(), postedByCIN })
    .where(eq(smeacBriefings.id, id));

  // Distinguish "no list passed" (default: everyone, back-compat for any
  // caller that doesn't offer a picker) from "explicitly an empty list"
  // (the picker's Select All was cleared — notify no one, don't silently
  // fall back to everyone).
  const userIds =
    targetUserIds !== undefined
      ? targetUserIds
      : (await getAllUsers()).map(u => u.id);
  await createNotificationsForUsers(userIds, {
    title: notifyBody.title,
    body: notifyBody.body,
    url: notifyBody.url,
    sourceModule: "smeacBriefing",
  });
  return userIds;
}

export async function softDeleteSmeacBriefing(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(smeacBriefings)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(smeacBriefings.id, id));
}

/**
 * Explicit, audited "I have seen this" — deliberately not the same thing as
 * opening the notification. Scoped to a revision: an edit + re-post is a
 * new revision, and a prior revision's acknowledgement doesn't carry
 * forward, so this is "first acknowledgement of THIS revision wins".
 */
export async function acknowledgeSmeacBriefing(
  briefingId: number,
  userId: number,
  cin: string,
  revision: number
): Promise<SmeacAcknowledgement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(smeacAcknowledgements)
    .where(
      and(
        eq(smeacAcknowledgements.briefingId, briefingId),
        eq(smeacAcknowledgements.userId, userId),
        eq(smeacAcknowledgements.revision, revision)
      )
    )
    .limit(1);
  if (existing) return existing;

  const acknowledgedAt = Date.now();
  const cinUpper = cin.toUpperCase();
  await db.insert(smeacAcknowledgements).values({
    briefingId,
    userId,
    cin: cinUpper,
    revision,
    acknowledgedAt,
  });
  return { id: 0, briefingId, userId, cin: cinUpper, revision, acknowledgedAt };
}

export async function getSmeacAcknowledgementForUser(
  briefingId: number,
  userId: number,
  revision: number
): Promise<SmeacAcknowledgement | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(smeacAcknowledgements)
    .where(
      and(
        eq(smeacAcknowledgements.briefingId, briefingId),
        eq(smeacAcknowledgements.userId, userId),
        eq(smeacAcknowledgements.revision, revision)
      )
    )
    .limit(1);
  return row;
}

/** Acknowledgements for the given revision only — a prior revision's don't count. */
export async function getSmeacAcknowledgements(
  briefingId: number,
  revision: number
): Promise<SmeacAcknowledgement[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(smeacAcknowledgements)
    .where(
      and(
        eq(smeacAcknowledgements.briefingId, briefingId),
        eq(smeacAcknowledgements.revision, revision)
      )
    )
    .orderBy(asc(smeacAcknowledgements.acknowledgedAt));
}

/** Today's sheet roster (CIN -> display name) to pre-fill the team grid when raising a briefing from a running sheet. */
export async function getSmeacRosterPrefill(
  sheetId: number
): Promise<SmeacTeamSlot[]> {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet || !sheet.sheetCins) return [];
  let cins: { cin: string }[] = [];
  try {
    const parsed = JSON.parse(sheet.sheetCins);
    if (Array.isArray(parsed)) cins = parsed;
  } catch {
    return [];
  }
  const allUsers = await getAllUsers();
  const byCin = new Map(allUsers.map(u => [u.cin, u.name]));
  return cins.map(({ cin }) => {
    const cinUpper = cin.toUpperCase();
    return {
      name: byCin.get(cinUpper) ?? cin,
      cin: cinUpper,
      vehicle: "",
      foot: "",
      skill: "",
      kit: "",
      isTeamLeader: false,
    };
  });
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

  // Sort sheets by date — read sheetDate directly (the source the title's
  // date prefix is itself generated from) rather than re-deriving it by
  // regex-parsing the title, falling back to createdAt for legacy sheets
  // with no sheetDate.
  const getSheetDate = (
    sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>
  ) => {
    if (sheet.sheetDate) {
      const [y, mo, da] = sheet.sheetDate.split("-").map(Number);
      return Date.UTC(y, mo - 1, da);
    }
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
