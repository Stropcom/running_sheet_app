import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { vaultEncrypt, vaultDecrypt } from "./wipcVault";
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
  runningSheets,
  sheetRows,
  shortcuts,
  InsertShortcut,
  targets,
  InsertTarget,
  users,
  governanceRecords,
  GovernanceRecord,
  targetShortcuts,
  InsertTargetShortcut,
  operationTargetLinks,
  wipcMembers,
  wipcOfficerProfiles,
  wipcAuditLog,
  WipcMemberRecord,
  WipcOfficerProfile,
  userLocations,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
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
  await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, id));
}

export async function updateUserRole(userId: number, role: "observer" | "member" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

// Legacy upsert kept for OAuth callback compatibility
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  await db.insert(users).values(user).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
}

// ─── Operations ─────────────────────────────────────────────────────────────

export async function getOperations() {
  const db = await getDb();
  if (!db) return [];
  // Only return active, non-deleted operations for the main operations list
  return db.select().from(operations).where(and(eq(operations.status, "active"), isNull(operations.deletedAt))).orderBy(desc(operations.createdAt));
}

export async function getOperationsByStatus(status: "active" | "before_court" | "archive") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(operations).where(and(eq(operations.status, status), isNull(operations.deletedAt))).orderBy(desc(operations.createdAt));
}

export async function getAllOperations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(operations).where(isNull(operations.deletedAt)).orderBy(desc(operations.createdAt));
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
      .select({ id: runningSheets.id, title: runningSheets.title, closedAt: runningSheets.closedAt })
      .from(runningSheets)
      .where(eq(runningSheets.operationId, id));
    const openSheets = sheets.filter((s) => !s.closedAt);
    if (openSheets.length > 0) {
      return { success: false, blockedSheets: openSheets.map((s) => s.title) };
    }
  }

  await db.update(operations).set({ status }).where(eq(operations.id, id));
  return { success: true };
}

export async function getOperationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(operations).where(eq(operations.id, id)).limit(1);
  return result[0];
}

export async function createOperation(data: InsertOperation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operations).values(data);
  return result.insertId as number;
}

export async function updateOperation(id: number, data: Partial<InsertOperation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operations).set(data).where(eq(operations.id, id));
}

export async function softDeleteOperation(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operations).set({ deletedAt: Date.now(), deletedByCIN: cin }).where(eq(operations.id, id));
}

export async function deleteOperation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cascade: delete all child records before deleting the operation
  const sheets = await db.select({ id: runningSheets.id }).from(runningSheets).where(eq(runningSheets.operationId, id));
  for (const sheet of sheets) {
    await deleteRunningSheet(sheet.id);
  }
  // Remove operation-target links (targets themselves stay in the registry)
  await db.delete(operationTargetLinks).where(eq(operationTargetLinks.operationId, id));
  // Clear legacy operationId FK on targets (nullable, so set to null rather than delete)
  await db.update(targets).set({ operationId: null }).where(eq(targets.operationId, id));
  await db.delete(operations).where(eq(operations.id, id));
}

export async function getOperationDeleteStats(id: number) {
  const db = await getDb();
  if (!db) return { sheetCount: 0, rowCount: 0, targetCount: 0 };
  const sheets = await db.select({ id: runningSheets.id }).from(runningSheets).where(eq(runningSheets.operationId, id));
  const sheetIds = sheets.map((s) => s.id);
  let rowCount = 0;
  if (sheetIds.length > 0) {
    const rowResult = await db.select({ count: sql<number>`count(*)` }).from(sheetRows).where(inArray(sheetRows.sheetId, sheetIds));
    rowCount = Number(rowResult[0]?.count ?? 0);
  }
  const targetResult = await db.select({ count: sql<number>`count(*)` }).from(targets).where(eq(targets.operationId, id));
  const targetCount = Number(targetResult[0]?.count ?? 0);
  return { sheetCount: sheets.length, rowCount, targetCount };
}

// ─── Running Sheets ───────────────────────────────────────────────────────────

export async function getRunningSheets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(runningSheets).where(isNull(runningSheets.deletedAt)).orderBy(desc(runningSheets.createdAt));
}

export async function getRunningSheetsByOperation(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(runningSheets).where(and(eq(runningSheets.operationId, operationId), isNull(runningSheets.deletedAt))).orderBy(desc(runningSheets.createdAt));
}

export async function getRunningSheetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(runningSheets).where(eq(runningSheets.id, id)).limit(1);
  return result[0];
}

export async function createRunningSheet(data: InsertRunningSheet) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(runningSheets).values(data);
  return result.insertId as number;
}

export async function updateRunningSheet(id: number, data: Partial<InsertRunningSheet>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(runningSheets).set(data).where(eq(runningSheets.id, id));
}

export async function softDeleteSheet(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(runningSheets).set({ deletedAt: Date.now(), deletedByCIN: cin }).where(eq(runningSheets.id, id));
}

export async function deleteRunningSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cascade: delete all child records before deleting the sheet
  const rows = await db.select({ id: sheetRows.id }).from(sheetRows).where(eq(sheetRows.sheetId, id));
  if (rows.length > 0) {
    const rowIds = rows.map((r) => r.id);
    // Delete certifications and row_members for these rows
    await db.delete(certifications).where(inArray(certifications.rowId, rowIds));
    await db.delete(rowMembers).where(inArray(rowMembers.rowId, rowIds));
    await db.delete(sheetRows).where(eq(sheetRows.sheetId, id));
  }
  // Delete governance record for this sheet
  await db.delete(governanceRecords).where(eq(governanceRecords.sheetId, id));
  await db.delete(runningSheets).where(eq(runningSheets.id, id));
}

export async function closeSheet(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(runningSheets)
    .set({ closedAt: Date.now(), closedByCIN: cin })
    .where(eq(runningSheets.id, id));
}

export async function reopenSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(runningSheets)
    .set({ closedAt: null, closedByCIN: null })
    .where(eq(runningSheets.id, id));
}

export async function moveRunningSheet(sheetId: number, targetOperationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(runningSheets)
    .set({ operationId: targetOperationId })
    .where(eq(runningSheets.id, sheetId));
}

/**
 * Deep-copies a running sheet (and all its rows + row_members) into the target operation.
 * Certifications and governance records are NOT copied — the copy starts fresh.
 * Returns the new sheet ID.
 */
export async function copyRunningSheet(sheetId: number, targetOperationId: number, createdBy: number, newTitle?: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Fetch the source sheet
  const [srcSheet] = await db.select().from(runningSheets).where(eq(runningSheets.id, sheetId)).limit(1);
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
  const srcRows = await db.select().from(sheetRows).where(eq(sheetRows.sheetId, sheetId)).orderBy(sheetRows.rowNumber);

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
    const srcMembers = await db.select().from(rowMembers).where(eq(rowMembers.rowId, row.id)).orderBy(rowMembers.sortOrder);
    if (srcMembers.length > 0) {
      await db.insert(rowMembers).values(
        srcMembers.map((m) => ({
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
  // Sort order:
  //   1. Rows WITH a time set come first (ISNULL(timeMinutes) = 0 sorts before 1)
  //   2. Among timed rows: ascending by timeMinutes
  //   3. Tie-break: ascending by rowNumber (insertion order)
  //   4. Rows WITHOUT a time float to the bottom, ordered by rowNumber
  return db
    .select()
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId))
    .orderBy(
      sql`ISNULL(${sheetRows.timeMinutes}) ASC`,
      sheetRows.timeMinutes,
      sheetRows.rowNumber
    );
}

export async function getRowById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sheetRows).where(eq(sheetRows.id, id)).limit(1);
  return result[0];
}

export async function createSheetRow(data: InsertSheetRow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(sheetRows).values(data);
  return result.insertId as number;
}

export async function updateSheetRow(id: number, data: Partial<InsertSheetRow>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sheetRows).set(data).where(eq(sheetRows.id, id));
}

export async function deleteSheetRow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
  return db.select().from(rowMembers).where(eq(rowMembers.rowId, rowId)).orderBy(rowMembers.sortOrder, rowMembers.createdAt);
}

export async function reorderRowMembers(rowId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Update each member's sortOrder to match the position in orderedIds
  await Promise.all(
    orderedIds.map((id, index) =>
      db.update(rowMembers).set({ sortOrder: index }).where(and(eq(rowMembers.id, id), eq(rowMembers.rowId, rowId)))
    )
  );
}

export async function getMembersByRowIds(rowIds: number[]) {
  if (rowIds.length === 0) return [];
  const results = await Promise.all(rowIds.map((rid) => getMembersByRowId(rid)));
  return results.flat();
}

// Returns all row_members whose memberName matches a given CIN across all rows in a sheet
export async function getMembersByCINAndSheet(sheetId: number, cin: string) {
  const db = await getDb();
  if (!db) return [];
  // Get all row IDs for this sheet first
  const rows = await db.select({ id: sheetRows.id, isLocked: sheetRows.isLocked })
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId));
  if (rows.length === 0) return [];
  const rowIds = rows.map((r) => r.id);
  // Find members in those rows whose memberName matches the CIN
  const members = await db.select().from(rowMembers)
    .where(and(inArray(rowMembers.rowId, rowIds), eq(rowMembers.memberName, cin)));
  return members.map((m) => {
    const row = rows.find((r) => r.id === m.rowId);
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
  return db.select().from(certifications).where(and(eq(certifications.rowId, rowId), eq(certifications.isActive, true)));
}

export async function getCertificationsByRowIds(rowIds: number[]) {
  if (rowIds.length === 0) return [];
  const results = await Promise.all(rowIds.map((rid) => getCertificationsByRowId(rid)));
  return results.flat();
}

export async function getCertificationByMember(rowId: number, memberId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(certifications)
    .where(and(eq(certifications.rowId, rowId), eq(certifications.memberId, memberId), eq(certifications.isActive, true)))
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
    .where(and(eq(certifications.rowId, rowId), eq(certifications.memberId, memberId)));
}

export async function deactivateAllCertificationsForRow(rowId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(certifications).set({ isActive: false }).where(eq(certifications.rowId, rowId));
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
  const members = await db.select().from(rowMembers).where(eq(rowMembers.memberName, cin));
  if (members.length === 0) return [];

  const memberIds = members.map((m) => m.id);
  const rowIds = Array.from(new Set(members.map((m) => m.rowId)));

  // Get active certifications for those members
  const certs = await db
    .select()
    .from(certifications)
    .where(and(inArray(certifications.memberId, memberIds), eq(certifications.isActive, true)));

  // Determine which members are uncertified
  const uncertifiedMembers = members.filter(
    (m) => !certs.some((c) => c.memberId === m.id),
  );
  if (uncertifiedMembers.length === 0) return [];

  // Get the rows for uncertified members
  const uncertifiedRowIds = Array.from(new Set(uncertifiedMembers.map((m) => m.rowId)));
  const rows = await db
    .select()
    .from(sheetRows)
    .where(inArray(sheetRows.id, uncertifiedRowIds));

  // Get distinct sheet IDs
  const sheetIds = Array.from(new Set(rows.map((r) => r.sheetId)));
  if (sheetIds.length === 0) return [];

  // Fetch sheets — only those that still exist
  const sheets = await db
    .select()
    .from(runningSheets)
    .where(inArray(runningSheets.id, sheetIds));

  // Fetch operations for those sheets — only those that still exist
  const opIds = Array.from(new Set(sheets.map((s) => s.operationId)));
  if (opIds.length === 0) return [];
  const ops = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, opIds));

  // Only include sheets whose operation still exists
  const validOpIds = new Set(ops.map((o) => o.id));
  const validSheets = sheets.filter((s) => validOpIds.has(s.operationId));

  return validSheets.map((sheet) => {
    const op = ops.find((o) => o.id === sheet.operationId)!;
    const uncertifiedRowCount = rows.filter((r) => r.sheetId === sheet.id).length;
    return {
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      targetName: sheet.targetName ?? null,
      operationId: sheet.operationId,
      operationName: op.name,
      uncertifiedRowCount,
      createdAt: sheet.createdAt,
    };
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * For a given sheet, return per-CIN certification status.
 * A CIN is "certified" when every row_member row with that memberName
 * has an active certification.
 * Returns: { cin: string; certified: boolean }[]
 */
export async function getCinCertStatusForSheet(
  sheetId: number,
  cinList: string[],
): Promise<{ cin: string; certified: boolean }[]> {
  if (cinList.length === 0) return [];
  const db = await getDb();
  if (!db) return cinList.map((cin) => ({ cin, certified: false }));

  // Get all rows for this sheet
  const rows = await db.select({ id: sheetRows.id }).from(sheetRows).where(eq(sheetRows.sheetId, sheetId));
  if (rows.length === 0) return cinList.map((cin) => ({ cin, certified: false }));

  const rowIds = rows.map((r) => r.id);

  // Get all row_members for these rows
  const members = await db.select().from(rowMembers).where(inArray(rowMembers.rowId, rowIds));

  // Get all active certifications for these rows
  const certs = await getCertificationsByRowIds(rowIds);

  return cinList.map((cin) => {
    const cinMembers = members.filter((m) => m.memberName.toLowerCase() === cin.toLowerCase());
    if (cinMembers.length === 0) return { cin, certified: false };
    const allCertified = cinMembers.every((m) =>
      certs.some((c) => c.memberId === m.id && c.isActive),
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
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ─── Targets ─────────────────────────────────────────────────────────────────

export async function getTargetsByOperation(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get targets by legacy operationId FK AND by operation_target_links (registry-linked)
  // Exclude soft-deleted targets in both paths
  const byFk = await db.select().from(targets).where(and(eq(targets.operationId, operationId), isNull(targets.deletedAt)));
  const linked = await db
    .select({ id: targets.id, name: targets.name, tgt: targets.tgt, hbf: targets.hbf, hb: targets.hb, v1f: targets.v1f, v1: targets.v1, v2f: targets.v2f, v2: targets.v2, dep: targets.dep, arr: targets.arr, operationId: targets.operationId, createdBy: targets.createdBy, createdAt: targets.createdAt, updatedAt: targets.updatedAt })
    .from(operationTargetLinks)
    .innerJoin(targets, eq(operationTargetLinks.targetId, targets.id))
    .where(and(eq(operationTargetLinks.operationId, operationId), isNull(targets.deletedAt)));
  // Merge, deduplicate by id
  const seen = new Set<number>();
  const all = [];
  for (const t of [...byFk, ...linked]) {
    if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
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
  data: Partial<Pick<InsertTarget, "name" | "tgt" | "hbf" | "hb" | "v1f" | "v1" | "v2f" | "v2" | "dep" | "arr">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targets).set(data).where(eq(targets.id, id));
  return { id };
}

export async function getTargetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [result] = await db.select().from(targets).where(eq(targets.id, id)).limit(1);
  return result;
}

export async function softDeleteTarget(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targets).set({ deletedAt: Date.now(), deletedByCIN: cin }).where(eq(targets.id, id));
}

export async function deleteTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Clear any running sheets that reference this target before deleting
  await db.update(runningSheets).set({ targetId: null }).where(eq(runningSheets.targetId, id));
  // Remove all operation links for this target
  await db.delete(operationTargetLinks).where(eq(operationTargetLinks.targetId, id));
  await db.delete(targets).where(eq(targets.id, id));
}

export async function setSheetTarget(sheetId: number, targetId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (targetId !== null) {
    // Verify the target belongs to the same operation as the sheet
    const [sheet] = await db.select({ operationId: runningSheets.operationId }).from(runningSheets).where(eq(runningSheets.id, sheetId)).limit(1);
    if (!sheet) throw new Error("Sheet not found");
    const [target] = await db.select({ operationId: targets.operationId }).from(targets).where(eq(targets.id, targetId)).limit(1);
    if (!target) throw new Error("Target not found");
    // Target Registry: targets are no longer operation-scoped, allow any target on any sheet
  }
  await db.update(runningSheets).set({ targetId }).where(eq(runningSheets.id, sheetId));
}

// ─── Target Registry ────────────────────────────────────────────────────────

/** Return all targets in the global registry, with their linked operations */
export async function getAllTargetsForRegistry() {
  const db = await getDb();
  if (!db) return [];
  const allTargets = await db.select().from(targets).where(isNull(targets.deletedAt)).orderBy(targets.name);
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id));

  const linkMap = new Map<number, Array<{ operationId: number; operationName: string | null }>>();
  for (const l of links) {
    if (!linkMap.has(l.targetId)) linkMap.set(l.targetId, []);
    linkMap.get(l.targetId)!.push({ operationId: l.operationId, operationName: l.operationName });
  }

  return allTargets.map(t => ({
    ...t,
    linkedOperations: linkMap.get(t.id) ?? [],
  }));
}

/** Create a target in the global registry (no operationId required) */
export async function createRegistryTarget(data: Omit<InsertTarget, 'operationId'> & { operationId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const [result] = await db.insert(targets).values({ ...data, operationId: data.operationId ?? null });
  return { id: (result as any).insertId as number };
}

/** Link a target to an operation (idempotent) */
export async function linkTargetToOperation(targetId: number, operationId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const [existing] = await db
    .select({ id: operationTargetLinks.id })
    .from(operationTargetLinks)
    .where(and(eq(operationTargetLinks.targetId, targetId), eq(operationTargetLinks.operationId, operationId)))
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
export async function ensureTargetFullyLinked(targetId: number, sheetId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const [sheet] = await db
    .select({ operationId: runningSheets.operationId, currentTargetId: runningSheets.targetId })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet) throw new Error('Sheet not found');
  // 1. Link sheet → target
  if (sheet.currentTargetId !== targetId) {
    await db.update(runningSheets).set({ targetId }).where(eq(runningSheets.id, sheetId));
  }
  // 2. Link target → operation (idempotent)
  await linkTargetToOperation(targetId, sheet.operationId);
}

/** Unlink a target from an operation */
export async function unlinkTargetFromOperation(targetId: number, operationId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  await db.delete(operationTargetLinks)
    .where(and(eq(operationTargetLinks.targetId, targetId), eq(operationTargetLinks.operationId, operationId)));
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

export async function createShortcut(data: Omit<InsertShortcut, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(shortcuts).values(data);
}

export async function updateShortcut(id: number, data: { trigger?: string; expansion?: string }) {
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
  const existing = await db.select({ id: shortcuts.id }).from(shortcuts).limit(1);
  if (existing.length > 0) return;
  const defaults = [
    { trigger: 'sc',   expansion: 'Surveillance commenced in the vicinity of' },
    { trigger: 'rack', expansion: 'Surveillance ceased in the vicinity of' },
    { trigger: 'oos',  expansion: 'Out of sight' },
    { trigger: 'coos', expansion: 'Continued out of sight' },
    { trigger: 'pt',   expansion: 'PHOTOGRAPH/S TAKEN' },
  ];
  for (const s of defaults) {
    await db.insert(shortcuts).values({ ...s, createdBy: systemUserId }).catch(() => {/* ignore duplicate */});
  }
}

/**
 * Ensure specific default shortcuts exist — inserts each if its trigger is not already present.
 * Safe to call on every startup even when the table already has rows.
 */
export async function ensureDefaultShortcuts(systemUserId: number) {
  const db = await getDb();
  if (!db) { console.warn('[Shortcuts] DB unavailable, skipping ensureDefaultShortcuts'); return; }
  const required = [
    { trigger: 'sc',   expansion: 'Surveillance commenced in the vicinity of' },
    { trigger: 'rack', expansion: 'Surveillance ceased in the vicinity of' },
    { trigger: 'oos',  expansion: 'Out of sight' },
    { trigger: 'coos', expansion: 'Continued out of sight' },
    { trigger: 'pt',   expansion: 'PHOTOGRAPH/S TAKEN' },
    { trigger: 'dso',  expansion: 'driver and sole occupant' },
  ];
  const existing = await db.select({ trigger: shortcuts.trigger }).from(shortcuts);
  const existingTriggers = new Set(existing.map((s) => s.trigger.toLowerCase()));
  for (const s of required) {
    if (!existingTriggers.has(s.trigger.toLowerCase())) {
      try {
        await db.insert(shortcuts).values({ ...s, createdBy: systemUserId });
        console.log(`[Shortcuts] Inserted default shortcut: ${s.trigger}`);
      } catch (err) {
        console.error(`[Shortcuts] Failed to insert shortcut '${s.trigger}':`, err);
      }
    }
  }
  console.log(`[Shortcuts] ensureDefaultShortcuts complete. Existing: [${Array.from(existingTriggers).join(', ')}]`);
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

export async function deepSearchOperations(query: string): Promise<DeepSearchMatch[]> {
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
        like(sql`LOWER(COALESCE(${operations.investigationUnit}, ''))`, q),
      )
    );

  // 2. Sheets that match on title or sheetCins JSON text
  const sheetMatches = await db
    .select({ operationId: runningSheets.operationId, title: runningSheets.title, sheetCins: runningSheets.sheetCins })
    .from(runningSheets)
    .where(
      and(
        isNull(runningSheets.deletedAt),
        or(
          like(sql`LOWER(${runningSheets.title})`, q),
          like(sql`LOWER(COALESCE(${runningSheets.sheetCins}, ''))`, q),
        )
      )
    );

  // 3. Targets that match on any field
  const targetMatches = await db
    .select({ operationId: targets.operationId, name: targets.name, tgt: targets.tgt, hbf: targets.hbf, hb: targets.hb, v1f: targets.v1f, v1: targets.v1, v2f: targets.v2f, v2: targets.v2, dep: targets.dep, arr: targets.arr })
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
          like(sql`LOWER(COALESCE(${targets.arr}, ''))`, q),
        )
      )
    );

  // 4. Observation rows that match
  const rowMatches = await db
    .select({ sheetId: sheetRows.sheetId, observation: sheetRows.observation, time: sheetRows.time })
    .from(sheetRows)
    .where(like(sql`LOWER(COALESCE(${sheetRows.observation}, ''))`, q));

  // 5. Row members (CIN in row) that match
  const memberMatches = await db
    .select({ rowId: rowMembers.rowId, memberName: rowMembers.memberName })
    .from(rowMembers)
    .where(like(sql`LOWER(${rowMembers.memberName})`, q));

  // Resolve sheetId → operationId for row/member matches
  const rowSheetIds = Array.from(new Set(rowMatches.map((r) => r.sheetId)));
  const memberRowIds = Array.from(new Set(memberMatches.map((m) => m.rowId)));
  let memberSheetIds: number[] = [];
  const memberRowToSheetMap: Record<number, number> = {}; // rowId -> sheetId
  if (memberRowIds.length > 0) {
    const memberRows = await db
      .select({ id: sheetRows.id, sheetId: sheetRows.sheetId })
      .from(sheetRows)
      .where(inArray(sheetRows.id, memberRowIds));
    memberRows.forEach((r) => { memberRowToSheetMap[r.id] = r.sheetId; });
    memberSheetIds = Array.from(new Set(memberRows.map((r) => r.sheetId)));
  }
  const allSheetIds = Array.from(new Set([...rowSheetIds, ...memberSheetIds]));
  let sheetOpMap: Record<number, number> = {};
  if (allSheetIds.length > 0) {
    const sheetRows2 = await db
      .select({ id: runningSheets.id, operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(inArray(runningSheets.id, allSheetIds));
    sheetRows2.forEach((s) => { sheetOpMap[s.id] = s.operationId; });
  }

  // Collect all matching operationIds with context labels
  const matchMap = new Map<number, Set<string>>();

  const ensure = (id: number) => { if (!matchMap.has(id)) matchMap.set(id, new Set()); };

  opMatches.forEach((op) => {
    ensure(op.id);
    matchMap.get(op.id)!.add("Operation details");
  });

  sheetMatches.forEach((s) => {
    // s.operationId IS the operationId directly from runningSheets.operationId
    const opId = s.operationId;
    ensure(opId);
    matchMap.get(opId)!.add(`Sheet: ${s.title}`);
  });

  targetMatches.forEach((t) => {
    if (t.operationId === null) return;
    ensure(t.operationId);
    matchMap.get(t.operationId)!.add(`Target: ${t.name}`);
  });

  rowMatches.forEach((r) => {
    const opId = sheetOpMap[r.sheetId];
    if (!opId) return;
    ensure(opId);
    const snippet = (r.observation ?? "").slice(0, 60);
    matchMap.get(opId)!.add(`Observation: "${snippet}${snippet.length === 60 ? "…" : ""}"`);
  });

  memberMatches.forEach((m) => {
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

  return matchedOps.map((op) => ({
    operationId: op.id,
    operationName: op.name,
    promisNumber: op.promisNumber ?? null,
    imsNumber: op.imsNumber ?? null,
    investigationUnit: op.investigationUnit ?? null,
    matchContexts: Array.from(matchMap.get(op.id) ?? []),
    operationStatus: (op.status ?? "active") as "active" | "before_court" | "archive",
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
}> {
  const results: Array<{
    shortForm: string;
    rawShortForm: string; // the exact bracketed token before name-recovery
    fullDescription: string;
    type: "person" | "vehicle" | "address" | "business" | "unknown";
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

    const lowerFull = fullDescription.toLowerCase();
    const lowerShort = shortForm.toLowerCase();

    let type: "person" | "vehicle" | "address" | "business" | "unknown" = "unknown";

    // ── Address-format detection (highest priority) ──────────────────────────
    // If the full description (before the parenthesis) contains a street address
    // pattern — e.g. "1200 Leach Highway, MYAREE" — classify as address regardless
    // of whether the word "vehicle" appears elsewhere in the sentence.
    // Also classify airport terminals, train stations, bus stops, ports, and
    // numbered terminals (e.g. "Terminal 2", "Gate 3", "Platform 5") as addresses.
    const addressInFull =
      /\b\d{1,5}\s+\w[\w\s]*(street|road|ave|avenue|drive|way|court|place|close|crescent|boulevard|highway|freeway|lane|terrace|parade|circuit)\b/i.test(fullDescription) ||
      /\b(street|road|ave|avenue|drive|way|court|place|close|crescent|boulevard|highway|freeway|lane|terrace|parade|circuit)\b/i.test(shortForm) ||
      /^\d{1,5}\s/.test(shortForm) ||
      // Airport terminals, train stations, bus stops, ports, gates, platforms
      /\b(terminal|gate|platform|pier|bay|berth|concourse|departure|arrival|lounge)\s+\d/i.test(shortForm) ||
      /\b(airport|station|terminus|port|wharf|depot|interchange|shopping centre|shopping center|shopping mall|mall|plaza|precinct)\b/i.test(shortForm) ||
      /\b(airport|station|terminus|port|wharf|depot|interchange)\b/i.test(fullDescription);

    if (addressInFull) {
      type = "address";
    }
    // Vehicle: preceding text mentions vehicle/car/truck/van/ute/sedan/hatchback/SUV/registration/bearing/reg
    // BUT only when the full description does NOT look like an address
    else if (
      /\b(vehicle|car|truck|van|ute|sedan|hatchback|suv|wagon|coupe|bearing|registration|reg|plate)\b/.test(lowerFull)
    ) {
      type = "vehicle";
    }
    // Person: shortForm is all-caps word(s) with no digits, no street number pattern
    else if (/^[A-Z][A-Z\s'-]{1,40}$/.test(shortForm) && !/\d/.test(shortForm) && !/street|road|ave|drive|way|court|place|close|crescent/i.test(shortForm)) {
      type = "person";
    }
    // Address: shortForm starts with a number or contains street/road/ave/drive etc.
    else if (
      /^\d/.test(shortForm) ||
      /\b(street|road|ave|avenue|drive|way|court|place|close|crescent|boulevard|highway|freeway)\b/i.test(shortForm)
    ) {
      type = "address";
    }
    // Business: shortForm contains a proper noun (mixed case or known business words)
    else if (/[A-Z][a-z]/.test(shortForm) || /\b(hotel|motel|cafe|restaurant|shop|store|centre|center|gym|club|bar|pub)\b/i.test(lowerShort)) {
      type = "business";
    }

    // For person entities: prefer the full name (fullDescription) over the bracketed
    // shortForm. E.g. "Jason JOHNSON (JOHNSON)" → use "Jason JOHNSON", not "JOHNSON".
    // Only apply when fullDescription looks like a name: 2–5 words, letters/spaces/hyphens/apostrophes only,
    // and the shortForm is a suffix/subset of the fullDescription.
    let displayName = shortForm;
    if (type === "person") {
      // Extract the last 2-4 words immediately before the bracket — these are most
      // likely to be the full name. E.g. "Observed Jason JOHNSON (JOHNSON)" →
      // fullDescription = "Observed Jason JOHNSON", last 2 words = "Jason JOHNSON".
      // Words that are NOT part of a person's name (verbs, prepositions, articles, etc.)
      const NON_NAME_WORDS = new Set([
        "with", "the", "a", "an", "and", "or", "at", "to", "from", "in", "on", "of",
        "front", "back", "side", "door", "gate", "exit", "entry", "via", "near", "by",
        "into", "out", "up", "down", "off", "over", "under", "through", "along",
        "exited", "entered", "walked", "ran", "drove", "observed", "seen", "met",
        "approached", "departed", "arrived", "left", "attended", "accompanied",
        "was", "were", "is", "are", "had", "has", "been", "being",
        "then", "also", "who", "whom", "which", "that", "this", "these", "those",
      ]);
      const words = fullDescription.trim().split(/\s+/);
      // Try last 4, 3, 2 words in order — use the longest that contains shortForm
      // AND where every word looks like a name word (not a common English word)
      let bestName = "";
      for (let take = Math.min(4, words.length); take >= 2; take--) {
        const candidate = words.slice(-take).join(" ");
        // Candidate must be all letters/spaces/hyphens/apostrophes (a name, not a sentence)
        const looksLikeName = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'\-]{1,60}$/.test(candidate);
        // None of the candidate words should be a common non-name word
        const candidateWords = candidate.toLowerCase().split(/\s+/);
        const hasNonNameWord = candidateWords.some(w => NON_NAME_WORDS.has(w));
        // shortForm must be contained within the candidate (case-insensitive)
        const shortInCandidate = candidate.toUpperCase().includes(shortForm.toUpperCase());
        if (looksLikeName && !hasNonNameWord && shortInCandidate) {
          bestName = candidate;
          break;
        }
      }
      if (bestName) displayName = bestName;
    }

    results.push({ shortForm: displayName, rawShortForm: shortForm, fullDescription, type });
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

export async function getAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  const db = await getDb();
  if (!db) return [];

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
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(operationTargetLinks, eq(operationTargetLinks.targetId, targets.id))
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(isNull(targets.deletedAt));

  // Merge: for each target, prefer linked operation rows; fall back to direct row
  const seenTargetOpPairs = new Set<string>();
  const targetRows: Array<{
    targetId: number; targetName: string; tgt: string | null;
    hb: string | null; v1: string | null; v2: string | null;
    hbf: string | null; v1f: string | null; v2f: string | null;
    operationId: number | null; operationName: string | null;
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
    .where(and(isNotNull(runningSheets.targetId), isNull(runningSheets.deletedAt)));

  const targetSheetMap = new Map<number, Array<{ sheetId: number; sheetTitle: string }>>();
  for (const s of sheetsByTarget) {
    if (s.targetId === null) continue;
    if (!targetSheetMap.has(s.targetId)) targetSheetMap.set(s.targetId, []);
    targetSheetMap.get(s.targetId)!.push({ sheetId: s.sheetId, sheetTitle: s.sheetTitle });
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
    const sheetEntries = linkedSheets.length > 0 ? linkedSheets : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];

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
    const locationFields: Array<{ label: string; value: string | null; type: IntelligenceEntity["type"] }> = [
      { label: "HBF", value: t.hbf?.trim() || t.hb?.trim() || null, type: "address" },
      { label: "V1F", value: t.v1f?.trim() || t.v1?.trim() || null, type: "vehicle" },
      { label: "V2F", value: t.v2f?.trim() || t.v2?.trim() || null, type: "vehicle" },
    ];
    for (const field of locationFields) {
      if (!field.value || field.value.trim() === "") continue;
      const shortForm = field.value.trim();
      const key = `${field.type}::${shortForm.toLowerCase()}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      }
      for (const sheet of sheetEntries) {
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
    e: { shortForm: string; rawShortForm?: string; fullDescription: string; type: "person" | "vehicle" | "address" | "business" | "unknown" },
    row: { sheetId: number; sheetTitle: string; operationId: number; operationName: string; rowId: number; observation: string | null; timeMinutes: number | null }
  ) {
    if (!row.observation) return;
    // If this person shortForm (or its raw bracketed token) is a known TGT alias,
    // merge into the canonical target entity.
    // We must check BOTH because name-recovery may expand "HOTA" → "G HOTA",
    // but the tgtAliasToFullName map is keyed by the raw alias ("HOTA").
    if (e.type === "person") {
      const canonicalName =
        tgtAliasToFullName.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm ? tgtAliasToFullName.get(e.rawShortForm.toUpperCase()) : undefined);
      if (canonicalName) {
        const targetKey = `target::${canonicalName}`;
        if (entityMap.has(targetKey)) {
          const snippet = row.observation.slice(0, 80) + (row.observation.length > 80 ? "…" : "");
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
    const key = `${e.type}::${e.shortForm.toLowerCase()}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, { shortForm: e.shortForm, type: e.type, isTarget: false, occurrences: [] });
    } else {
      // Upgrade to longer shortForm if available
      const existing = entityMap.get(key)!;
      if (e.shortForm.length > existing.shortForm.length) existing.shortForm = e.shortForm;
    }
    const snippet = row.observation.slice(0, 80) + (row.observation.length > 80 ? "…" : "");
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
    type DictEntry = { shortForm: string; rawShortForm: string; fullDescription: string; type: "person" | "vehicle" | "address" | "business" | "unknown" };
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
    for (const [alias, canonicalName] of Array.from(tgtAliasToFullName.entries())) {
      const aliasKey = alias.toLowerCase();
      if (!sheetDict.has(aliasKey)) {
        sheetDict.set(aliasKey, {
          shortForm: canonicalName,   // display as full canonical name
          rawShortForm: alias,         // raw alias is the search token
          fullDescription: `Target: ${canonicalName}`,
          type: "person",
        });
      }
    }

    for (const row of sheetRows_) {
      if (!row.observation) continue;
      const bracketed = extractEntitiesFromText(row.observation);
      for (const e of bracketed) {
        const entry: DictEntry = { shortForm: e.shortForm, rawShortForm: e.rawShortForm, fullDescription: e.fullDescription, type: e.type };
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
    const knownEntries = Array.from(sheetDict.values())
      .sort((a, b) => b.shortForm.length - a.shortForm.length);

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
        parenRanges.push([spanMatch.index, spanMatch.index + spanMatch[0].length]);
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

        // For person entities, search by BOTH the displayName ("G HOTA") AND the raw
        // bracketed token ("HOTA") — because subsequent rows use the short alias.
        // For other types, only search by shortForm.
        const searchTerms: string[] = [entry.shortForm];
        if (entry.type === "person" && entry.rawShortForm !== entry.shortForm) {
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
          registerOccurrence({
            shortForm: entry.shortForm,
            rawShortForm: entry.rawShortForm,
            fullDescription: entry.fullDescription,
            type: entry.type,
          }, row);
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
    const sorted = [...group].sort((a, b) => b.shortForm.length - a.shortForm.length);
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
        const isContained = entityType === "vehicle"
          ? (() => {
              const idx = longerLower.indexOf(shorterLower);
              if (idx === -1) return false;
              // Must be at a word boundary on both sides
              const before = idx === 0 || /[\s,;\-/(]/.test(longerLower[idx - 1]);
              const after = idx + shorterLower.length === longerLower.length || /[\s,;\-/)]/.test(longerLower[idx + shorterLower.length]);
              return before && after;
            })()
          : (longerLower.startsWith(shorterLower) &&
              (longerLower.length === shorterLower.length ||
               /^[\s,;\-/]/.test(longerLower.slice(shorterLower.length))));
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

// ─── Association Graph ───────────────────────────────────────────────────────

export interface AssocNode {
  id: string;          // e.g. "person::SAM JACK"
  label: string;       // display label
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
  operationIds?: number[],
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
    .innerJoin(runningSheets, and(eq(sheetRows.sheetId, runningSheets.id), isNull(runningSheets.deletedAt)))
    .innerJoin(operations, eq(runningSheets.operationId, operations.id));

  const allRows = await rowQuery;
  const filteredRows = operationIds && operationIds.length > 0
    ? allRows.filter((r) => operationIds.includes(r.operationId))
    : allRows;

  // Build TGT alias map from targets (exclude soft-deleted)
  const allTargets = await db
    .select({ id: targets.id, name: targets.name, tgt: targets.tgt, operationId: targets.operationId })
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
    if (operationIds && operationIds.length > 0 && t.operationId && !operationIds.includes(t.operationId)) continue;
    const nodeId = `target::${t.name}`;
    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, {
        id: nodeId, label: t.name, type: "target",
        occurrences: 0, operationIds: [], operationNames: [],
      });
    }
  }

  // edgeWeight: "nodeId1|||nodeId2" -> count (always sort ids so order is consistent)
  const edgeWeight = new Map<string, number>();

  const ensureNode = (id: string, label: string, type: AssocNode["type"], opId: number, opName: string) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, label, type, occurrences: 0, operationIds: [], operationNames: [] });
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

export async function getGovernanceRecord(sheetId: number): Promise<GovernanceRecord | null> {
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
  sentToIO?: boolean;
  sentToIOCIN?: string | null;
  savedAsWord?: boolean;
  savedAsWordCIN?: string | null;
  savedAsPdf?: boolean;
  savedAsPdfCIN?: string | null;
  uploadedToPromis?: boolean;
  uploadedToPromisCIN?: string | null;
  linked?: boolean;
  linkedCIN?: string | null;
  savedInOpFolder?: boolean;
  savedInOpFolderCIN?: string | null;
  imageryTaken?: boolean;
  imageryTakenCIN?: string | null;
  coverPage?: boolean;
  coverPageCIN?: string | null;
  sheetCell?: string | null;
  imageryEntries?: ImageryEntry[];
  notes?: string | null;
}

export async function upsertGovernanceRecord(input: GovernanceUpsertInput): Promise<GovernanceRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getGovernanceRecord(input.sheetId);
  const imageryJson = input.imageryEntries !== undefined
    ? JSON.stringify(input.imageryEntries)
    : undefined;

  if (existing) {
    await db
      .update(governanceRecords)
      .set({
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.summaryNotification !== undefined && { isurv: input.summaryNotification }),
        ...(input.isurvCIN !== undefined && { isurvCIN: input.isurvCIN }),
        ...(input.sentToIO !== undefined && { sentToIO: input.sentToIO }),
        ...(input.sentToIOCIN !== undefined && { sentToIOCIN: input.sentToIOCIN }),
        ...(input.savedAsWord !== undefined && { savedAsWord: input.savedAsWord }),
        ...(input.savedAsWordCIN !== undefined && { savedAsWordCIN: input.savedAsWordCIN }),
        ...(input.savedAsPdf !== undefined && { savedAsPdf: input.savedAsPdf }),
        ...(input.savedAsPdfCIN !== undefined && { savedAsPdfCIN: input.savedAsPdfCIN }),
        ...(input.uploadedToPromis !== undefined && { uploadedToPromis: input.uploadedToPromis }),
        ...(input.uploadedToPromisCIN !== undefined && { uploadedToPromisCIN: input.uploadedToPromisCIN }),
        ...(input.linked !== undefined && { linked: input.linked }),
        ...(input.linkedCIN !== undefined && { linkedCIN: input.linkedCIN }),
        ...(input.savedInOpFolder !== undefined && { savedInOpFolder: input.savedInOpFolder }),
        ...(input.savedInOpFolderCIN !== undefined && { savedInOpFolderCIN: input.savedInOpFolderCIN }),
        ...(input.imageryTaken !== undefined && { imageryTaken: input.imageryTaken }),
        ...(input.imageryTakenCIN !== undefined && { imageryTakenCIN: input.imageryTakenCIN }),
        ...(input.coverPage !== undefined && { coverPage: input.coverPage }),
        ...(input.coverPageCIN !== undefined && { coverPageCIN: input.coverPageCIN }),
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
      sentToIO: input.sentToIO ?? false,
      sentToIOCIN: input.sentToIOCIN ?? null,
      savedAsWord: input.savedAsWord ?? false,
      savedAsWordCIN: input.savedAsWordCIN ?? null,
      savedAsPdf: input.savedAsPdf ?? false,
      savedAsPdfCIN: input.savedAsPdfCIN ?? null,
      uploadedToPromis: input.uploadedToPromis ?? false,
      uploadedToPromisCIN: input.uploadedToPromisCIN ?? null,
      linked: input.linked ?? false,
      linkedCIN: input.linkedCIN ?? null,
      savedInOpFolder: input.savedInOpFolder ?? false,
      savedInOpFolderCIN: input.savedInOpFolderCIN ?? null,
      imageryTaken: input.imageryTaken ?? false,
      imageryTakenCIN: input.imageryTakenCIN ?? null,
      coverPage: input.coverPage ?? false,
      coverPageCIN: input.coverPageCIN ?? null,
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
    !!rec.isurv,      // Summary complete
    !!rec.sentToIO,   // Sent to IO
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
  try { entries = JSON.parse(rec.imageryEntries ?? "[]"); } catch { entries = []; }
  // Only count imagery if at least one entry has a real CIN (blank placeholder rows are ignored)
  const realEntries = entries.filter((e) => e.cin && e.cin.trim() !== "");
  const hasImagery = realEntries.length > 0;
  if (hasImagery) {
    imageryFields = realEntries.map((e) => !!e.saved);
  }
  // If no real imagery entries, imagery section is N/A — not counted

  const allFields = [...tlFields, ...opFields, ...imageryFields];
  if (allFields.length === 0) return 0;
  return Math.round((allFields.filter(Boolean).length / allFields.length) * 100);
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
  const allSheets = await db.select().from(runningSheets).where(isNull(runningSheets.deletedAt));
  const relevantSheets = allSheets.filter((s) => {
    try {
      const cins: { cin: string; isTeamLeader?: boolean; isAuthor?: boolean }[] = JSON.parse(s.sheetCins ?? "[]");
      return cins.some((c) => c.cin === cin && (c.isTeamLeader || c.isAuthor));
    } catch { return false; }
  });
  if (relevantSheets.length === 0) return [];

  const opIds = Array.from(new Set(relevantSheets.map((s) => s.operationId)));

  const [ops, govRecords] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    getGovernanceRecordsBySheetIds(relevantSheets.map((s) => s.id)),
  ]);

  // Only process sheets whose operation still exists
  const validOpIds = new Set(ops.map((o) => o.id));
  const validSheets = relevantSheets.filter((s) => validOpIds.has(s.operationId));
  if (validSheets.length === 0) return [];

  // Compute allSigned per sheet
  const results: Awaited<ReturnType<typeof getGovernanceTodoForCin>> = [];

  for (const sheet of validSheets) {
    const rows = await getRowsBySheetId(sheet.id);
    const rowIds = rows.map((r) => r.id);
    const [members, certs] = await Promise.all([
      getMembersByRowIds(rowIds),
      getCertificationsByRowIds(rowIds),
    ]);
    const allSigned = rows.length > 0 && rows.every((r) => {
      const rowMems = members.filter((m) => m.rowId === r.id);
      return rowMems.length > 0 && rowMems.every((m) =>
        certs.some((c) => c.rowId === r.id && c.memberId === m.id && c.isActive)
      );
    });

    const rec = govRecords.find((g) => g.sheetId === sheet.id);
    const op = ops.find((o) => o.id === sheet.operationId);
    const cinList: { cin: string; isTeamLeader?: boolean; isAuthor?: boolean }[] =
      (() => { try { return JSON.parse(sheet.sheetCins ?? "[]"); } catch { return []; } })();
    const cinEntry = cinList.find((c) => c.cin === cin);

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
        if (!rec?.savedInOpFolder) outstanding.push("Saved in Operation folder");
        // Check imagery entries — any unsaved imagery rows are outstanding for the author
        if (rec?.imageryEntries) {
          try {
            const entries: { saved?: boolean }[] = JSON.parse(rec.imageryEntries);
            const unsavedCount = entries.filter((e) => !e.saved).length;
            if (unsavedCount > 0) {
              outstanding.push(`${unsavedCount} imagery entr${unsavedCount === 1 ? "y" : "ies"} not saved`);
            }
          } catch { /* ignore parse errors */ }
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

// ─── Target Shortcuts ─────────────────────────────────────────────────────────

export async function getTargetShortcuts(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(targetShortcuts).where(eq(targetShortcuts.targetId, targetId));
}

export async function createTargetShortcut(data: InsertTargetShortcut) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targetShortcuts).values(data);
  return { id: (result as { insertId: number }).insertId };
}

export async function updateTargetShortcut(id: number, data: Partial<Pick<InsertTargetShortcut, "trigger" | "expansion">>) {
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
  const sheet = await db.select({ targetId: runningSheets.targetId }).from(runningSheets).where(eq(runningSheets.id, sheetId)).limit(1);
  if (!sheet[0]?.targetId) return [];
  return db.select().from(targetShortcuts).where(eq(targetShortcuts.targetId, sheet[0].targetId));
}

// ─── WIPC Vault Helpers ───────────────────────────────────────────────────────
// All sensitive fields are encrypted/decrypted via wipcVault.ts (AES-256-GCM).
// These helpers are called only from server-side procedures with admin guards.

const WIPC_MEMBER_FIELDS = ["fullName", "dob", "afpId", "cinNumber", "aiInitials", "aiKnownAs"] as const;
const WIPC_OFFICER_FIELDS = ["fullName", "afpId", "workLocation", "portfolio", "contactNumber"] as const;

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
  return db.select().from(wipcAuditLog).orderBy(desc(wipcAuditLog.createdAt)).limit(limit);
}

/** Save or update the requesting officer profile for a user (encrypted) */
export async function upsertWipcOfficerProfile(userId: number, data: {
  fullName: string;
  afpId: string;
  workLocation?: string;
  portfolio?: string;
  contactNumber?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptOfficer({ ...data }) as typeof data;
  const existing = await db.select({ id: wipcOfficerProfiles.id }).from(wipcOfficerProfiles).where(eq(wipcOfficerProfiles.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(wipcOfficerProfiles).set({ ...encrypted, updatedAt: new Date() }).where(eq(wipcOfficerProfiles.userId, userId));
  } else {
    await db.insert(wipcOfficerProfiles).values({ userId, fullName: encrypted.fullName as string, afpId: encrypted.afpId as string, workLocation: encrypted.workLocation as string | undefined, portfolio: encrypted.portfolio as string | undefined, contactNumber: encrypted.contactNumber as string | undefined });
  }
}

/** Get the requesting officer profile for a user (decrypted) */
export async function getWipcOfficerProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(wipcOfficerProfiles).where(eq(wipcOfficerProfiles.userId, userId)).limit(1);
  if (!row) return null;
  return decryptOfficer(row as unknown as Record<string, unknown>) as unknown as WipcOfficerProfile;
}

/** List all WIPC members (decrypted) — admin only */
export async function listWipcMembers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(wipcMembers).orderBy(wipcMembers.createdAt);
  return rows.map((r) => decryptMember(r as unknown as Record<string, unknown>) as unknown as WipcMemberRecord);
}

/** Save a new WIPC member (encrypted) — admin only */
export async function createWipcMember(createdBy: number, data: {
  fullName: string;
  dob?: string;
  afpId: string;
  cinNumber?: string;
  aiInitials?: string;
  aiKnownAs?: string;
  isUco?: boolean;
  isOco?: boolean;
  isCin?: boolean;
}) {
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
export async function updateWipcMember(id: number, data: Partial<{
  fullName: string;
  dob: string;
  afpId: string;
  cinNumber: string;
  aiInitials: string;
  aiKnownAs: string;
  isUco: boolean;
  isOco: boolean;
  isCin: boolean;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  await db.update(wipcMembers).set({ ...encrypted, updatedAt: new Date() }).where(eq(wipcMembers.id, id));
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
  type: "operation" | "sheet" | "target";
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
    .where(and(isNotNull(operations.deletedAt), sql`${operations.deletedAt} > ${cutoff}`));
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
    .where(and(isNotNull(runningSheets.deletedAt), sql`${runningSheets.deletedAt} > ${cutoff}`));
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
    .where(and(isNotNull(targets.deletedAt), sql`${targets.deletedAt} > ${cutoff}`));
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

  // Sort newest deleted first
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function reinstateOperation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(operations).set({ deletedAt: null, deletedByCIN: null }).where(eq(operations.id, id));
}

export async function reinstateSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(runningSheets).set({ deletedAt: null, deletedByCIN: null }).where(eq(runningSheets.id, id));
}

export async function reinstateTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targets).set({ deletedAt: null, deletedByCIN: null }).where(eq(targets.id, id));
}

export async function purgeExpiredRecycleBinItems() {
  const db = await getDb();
  if (!db) return;
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  // Permanently delete expired operations (cascade sheets first)
  const expiredOps = await db
    .select({ id: operations.id })
    .from(operations)
    .where(and(isNotNull(operations.deletedAt), sql`${operations.deletedAt} <= ${cutoff}`));
  for (const op of expiredOps) {
    await deleteOperation(op.id);
  }
  // Permanently delete expired sheets
  const expiredSheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(and(isNotNull(runningSheets.deletedAt), sql`${runningSheets.deletedAt} <= ${cutoff}`));
  for (const s of expiredSheets) {
    await deleteRunningSheet(s.id);
  }
  // Permanently delete expired targets
  const expiredTargets = await db
    .select({ id: targets.id })
    .from(targets)
    .where(and(isNotNull(targets.deletedAt), sql`${targets.deletedAt} <= ${cutoff}`));
  for (const t of expiredTargets) {
    await deleteTarget(t.id);
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
  dep: string | null;
  arr: string | null;
  operations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{ id: number; title: string; operationId: number; operationName: string }>;
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
  linkedSheets: Array<{ id: number; title: string; targetId: number | null; targetName: string | null }>;
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
  }>;
}

export interface IntelAssociateProfile {
  label: string;
  type: "person" | "business";
  linkedTargets: Array<{ targetId: number; name: string; operationId: number; operationName: string }>;
  linkedSheets: Array<{ id: number; title: string; operationId: number; operationName: string }>;
  assocLocations: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
}

export interface IntelVehicleProfile {
  label: string;
  linkedTarget: { targetId: number; name: string } | null;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{ id: number; title: string; operationId: number; operationName: string }>;
  assocPersons: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
}

export interface IntelLocationProfile {
  label: string;
  linkedTargets: Array<{ targetId: number; name: string }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{ id: number; title: string; operationId: number; operationName: string }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
}

async function buildTargetOperationalAssociations(
  targetId: number,
  targetLabel: string,
  allEntities: IntelligenceEntity[],
): Promise<{ assocPersons: IntelProfileEntity[]; assocVehicles: IntelProfileEntity[]; assocLocations: IntelProfileEntity[] }> {
  const db = await getDb();
  if (!db) return { assocPersons: [], assocVehicles: [], assocLocations: [] };

  const targetSheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(and(eq(runningSheets.targetId, targetId), isNull(runningSheets.deletedAt)));

  if (!targetSheets.length) return { assocPersons: [], assocVehicles: [], assocLocations: [] };

  const targetSheetIds = targetSheets.map(s => s.id);
  const rows = await db
    .select({ id: sheetRows.id })
    .from(sheetRows)
    .where(inArray(sheetRows.sheetId, targetSheetIds));

  const targetRowIds = new Set(rows.map(r => r.id));
  const targetLabelLower = targetLabel.toLowerCase();

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();
  const assocLocationsMap = new Map<string, IntelProfileEntity>();

  for (const entity of allEntities) {
    if (entity.shortForm.toLowerCase() === targetLabelLower) continue;
    const relevantOccs = entity.occurrences.filter(occ => occ.rowId > 0 && targetRowIds.has(occ.rowId));
    if (!relevantOccs.length) continue;

    const key = `${entity.type}::${entity.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: entity.shortForm,
      type: entity.isTarget ? "target" : (entity.type as IntelProfileEntity["type"]),
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
    assocPersons: Array.from(assocPersonsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    assocVehicles: Array.from(assocVehiclesMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    assocLocations: Array.from(assocLocationsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export async function getIntelTargetProfile(targetId: number): Promise<IntelTargetProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const target = await getTargetById(targetId);
  if (!target) return null;

  const opLinks = await db
    .select({ id: operations.id, name: operations.name })
    .from(operationTargetLinks)
    .innerJoin(operations, eq(operations.id, operationTargetLinks.operationId))
    .where(and(eq(operationTargetLinks.targetId, targetId), isNull(operations.deletedAt)));

  const linkedSheetRows = await db
    .select({ id: runningSheets.id, title: runningSheets.title, operationId: runningSheets.operationId })
    .from(runningSheets)
    .where(and(eq(runningSheets.targetId, targetId), isNull(runningSheets.deletedAt)));

  const opNames: Record<number, string> = {};
  for (const op of opLinks) opNames[op.id] = op.name;

  const extraOpIds = Array.from(new Set(linkedSheetRows.map(s => s.operationId).filter(id => !opNames[id])));
  if (extraOpIds.length) {
    const extraOps = await db
      .select({ id: operations.id, name: operations.name })
      .from(operations)
      .where(inArray(operations.id, extraOpIds));
    for (const op of extraOps) opNames[op.id] = op.name;
  }

  let observationCount = 0;
  for (const sheet of linkedSheetRows) {
    const cnt = await db.select({ c: sql<number>`count(*)` }).from(sheetRows).where(eq(sheetRows.sheetId, sheet.id));
    observationCount += Number(cnt[0]?.c ?? 0);
  }

  const allEntities = await getAllIntelligenceEntities();
  const targetLabel = target.tgt ?? target.name;
  const { assocPersons, assocVehicles, assocLocations } = await buildTargetOperationalAssociations(targetId, targetLabel, allEntities);

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

export async function getIntelOperationProfile(operationId: number): Promise<IntelOperationProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const opRows = await db.select().from(operations).where(and(eq(operations.id, operationId), isNull(operations.deletedAt)));
  if (!opRows.length) return null;
  const op = opRows[0];

  const sheets = await db
    .select({ id: runningSheets.id, title: runningSheets.title, targetId: runningSheets.targetId, targetName: runningSheets.targetName })
    .from(runningSheets)
    .where(and(eq(runningSheets.operationId, operationId), isNull(runningSheets.deletedAt)));

  const targetLinks = await db
    .select({ targetId: operationTargetLinks.targetId })
    .from(operationTargetLinks)
    .where(eq(operationTargetLinks.operationId, operationId));

  const allEntities = await getAllIntelligenceEntities();

  const targetProfiles = (await Promise.all(
    targetLinks.map(async ({ targetId }) => {
      const target = await getTargetById(targetId);
      if (!target) return null;
      const targetLabel = target.tgt ?? target.name;
      const targetSheets = sheets.filter(s => s.targetId === targetId);
      const { assocPersons, assocVehicles, assocLocations } = await buildTargetOperationalAssociations(targetId, targetLabel, allEntities);
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
  )).filter(Boolean) as IntelOperationProfile["targets"];

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

export async function getIntelAssociateProfile(label: string): Promise<IntelAssociateProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e => e.shortForm.toLowerCase() === label.toLowerCase() &&
    (e.type === "person" || e.type === "business") &&
    !e.isTarget
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));

  const sheetMap = new Map<number, { id: number; title: string; operationId: number; operationName: string }>();
  for (const occ of observationOccs) {
    if (!sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, { id: occ.sheetId, title: occ.sheetTitle, operationId: occ.operationId, operationName: occ.operationName });
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
      .where(and(eq(runningSheets.targetId, target.id), isNull(runningSheets.deletedAt)));

    for (const sheet of targetSheets) {
      const rows = await db.select({ id: sheetRows.id }).from(sheetRows).where(eq(sheetRows.sheetId, sheet.id));
      const hasOverlap = rows.some(r => assocRowIds.has(r.id));
      if (hasOverlap) {
        const opRows = await db.select({ name: operations.name }).from(operations).where(eq(operations.id, sheet.operationId));
        const alreadyLinked = linkedTargets.some(lt => lt.targetId === target.id && lt.operationId === sheet.operationId);
        if (!alreadyLinked) {
          linkedTargets.push({ targetId: target.id, name: target.name, operationId: sheet.operationId, operationName: opRows[0]?.name ?? "Unknown" });
        }
        break;
      }
    }
  }

  const assocLocationsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === label.toLowerCase()) continue;
    const overlappingOccs = other.occurrences.filter(o => o.rowId > 0 && assocRowIds.has(o.rowId));
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key, label: other.shortForm,
      type: other.isTarget ? "target" : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(new Set(overlappingOccs.map(o => o.operationId))),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "vehicle") assocVehiclesMap.set(key, profileEntity);
    else if (other.type === "address" || other.type === "business") assocLocationsMap.set(key, profileEntity);
  }

  return {
    label: entity.shortForm,
    type: entity.type as "person" | "business",
    linkedTargets,
    linkedSheets: Array.from(sheetMap.values()),
    assocLocations: Array.from(assocLocationsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    assocVehicles: Array.from(assocVehiclesMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export async function getIntelVehicleProfile(label: string): Promise<IntelVehicleProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(e => e.shortForm.toLowerCase() === label.toLowerCase() && e.type === "vehicle");
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));
  const labelLower = label.toLowerCase();

  const allTargets = await db
    .select({ id: targets.id, name: targets.name, v1f: targets.v1f, v2f: targets.v2f })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Find linkedTarget from TWO sources:
  // 1. Target card v1f/v2f fields that mention this vehicle
  // 2. Row-level co-occurrence: isTarget entities that share observation rows with this vehicle
  let linkedTarget: IntelVehicleProfile["linkedTarget"] = null;
  for (const t of allTargets) {
    if ((t.v1f && t.v1f.toLowerCase().includes(labelLower)) || (t.v2f && t.v2f.toLowerCase().includes(labelLower))) {
      linkedTarget = { targetId: t.id, name: t.name };
      break;
    }
  }
  if (!linkedTarget) {
    // Check row-level co-occurrence with target entities
    for (const other of allEntities) {
      if (!other.isTarget || !other.targetId) continue;
      const overlappingOccs = other.occurrences.filter(o => o.rowId > 0 && assocRowIds.has(o.rowId));
      if (overlappingOccs.length > 0) {
        linkedTarget = { targetId: other.targetId, name: other.shortForm };
        break;
      }
    }
  }

  const opMap = new Map<number, { id: number; name: string }>();
  const sheetMap = new Map<number, { id: number; title: string; operationId: number; operationName: string }>();
  for (const occ of entity.occurrences) {
    if (!opMap.has(occ.operationId)) opMap.set(occ.operationId, { id: occ.operationId, name: occ.operationName });
    if (occ.rowId > 0 && !sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, { id: occ.sheetId, title: occ.sheetTitle, operationId: occ.operationId, operationName: occ.operationName });
    }
  }

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocLocationsMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === labelLower) continue;
    const overlappingOccs = other.occurrences.filter(o => o.rowId > 0 && assocRowIds.has(o.rowId));
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key, label: other.shortForm,
      type: other.isTarget ? "target" : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(new Set(overlappingOccs.map(o => o.operationId))),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "person" || other.isTarget) assocPersonsMap.set(key, profileEntity);
    else if (other.type === "address" || other.type === "business") assocLocationsMap.set(key, profileEntity);
  }

  return {
    label: entity.shortForm,
    linkedTarget,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons: Array.from(assocPersonsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    assocLocations: Array.from(assocLocationsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export async function getIntelLocationProfile(label: string): Promise<IntelLocationProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e => e.shortForm.toLowerCase() === label.toLowerCase() && (e.type === "address" || e.type === "business")
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));
  const labelLower = label.toLowerCase();

  const allTargets = await db
    .select({ id: targets.id, name: targets.name, hbf: targets.hbf, dep: targets.dep, arr: targets.arr })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Build linkedTargets from TWO sources:
  // 1. Target card fields (hbf/dep/arr) that mention this location
  // 2. Row-level co-occurrence: isTarget entities that share observation rows with this location
  const linkedTargetsMap = new Map<number, { targetId: number; name: string }>();
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
    const overlappingOccs = other.occurrences.filter(o => o.rowId > 0 && assocRowIds.has(o.rowId));
    if (overlappingOccs.length > 0 && !linkedTargetsMap.has(other.targetId)) {
      linkedTargetsMap.set(other.targetId, { targetId: other.targetId, name: other.shortForm });
    }
  }
  const linkedTargets: IntelLocationProfile["linkedTargets"] = Array.from(linkedTargetsMap.values());

  const opMap = new Map<number, { id: number; name: string }>();
  const sheetMap = new Map<number, { id: number; title: string; operationId: number; operationName: string }>();
  for (const occ of entity.occurrences) {
    if (!opMap.has(occ.operationId)) opMap.set(occ.operationId, { id: occ.operationId, name: occ.operationName });
    if (occ.rowId > 0 && !sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, { id: occ.sheetId, title: occ.sheetTitle, operationId: occ.operationId, operationName: occ.operationName });
    }
  }

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === labelLower) continue;
    const overlappingOccs = other.occurrences.filter(o => o.rowId > 0 && assocRowIds.has(o.rowId));
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key, label: other.shortForm,
      type: other.isTarget ? "target" : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(new Set(overlappingOccs.map(o => o.operationId))),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "person" || other.isTarget) assocPersonsMap.set(key, profileEntity);
    else if (other.type === "vehicle") assocVehiclesMap.set(key, profileEntity);
  }

  return {
    label: entity.shortForm,
    linkedTargets,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons: Array.from(assocPersonsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    assocVehicles: Array.from(assocVehiclesMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
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

  // Filter entities to only those in the requested operations/targets
  const filterByOp = operationIds && operationIds.length > 0;
  const filterByTarget = targetIds && targetIds.length > 0;

  const filteredEntities = allEntities.filter(e => {
    if (!filterByOp && !filterByTarget) return true;
    const opIds = e.occurrences.map(o => o.operationId).filter(id => id > 0);
    const tgtMatch = filterByTarget && e.isTarget && e.targetId != null && targetIds!.includes(e.targetId);
    const opMatch = filterByOp && opIds.some(id => operationIds!.includes(id));
    return tgtMatch || opMatch || (!filterByTarget && opMatch);
  });

  // Build a set of target entities that pass the filter
  const filteredTargetEntities = filteredEntities.filter(e => e.isTarget && e.targetId != null);
  const filteredTargetIds = new Set(filteredTargetEntities.map(e => e.targetId!));

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
    .innerJoin(operationTargetLinks, eq(operationTargetLinks.targetId, targets.id))
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

  // Only keep targets that pass the filter
  const relevantTargets = allTargetData.filter(t =>
    filteredTargetIds.size === 0 ? true : filteredTargetIds.has(t.id)
  );

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
    const addrFields = [
      t.hbf?.trim() || t.hb?.trim() || null,
    ].filter(Boolean) as string[];
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
          if (tData && !loc.linkedTargets.find(lt => lt.targetId === co.targetId)) {
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
    loc.linkCount = loc.linkedTargets.length + loc.assocPersons.length + loc.assocVehicles.length;
    result.push(loc);
  }

  return result.sort((a, b) => a.label.localeCompare(b.label));
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
 * Returns all users who have sharingEnabled=true and whose selected operationIds
 * overlap with the caller's operationIds (operation-scoped visibility).
 * If callerOpIds is empty, returns all sharing users (no filter).
 */
export async function getUserLocations(callerOpIds: number[]): Promise<UserLocationRow[]> {
  const db = await getDb();
  if (!db) return [];
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
    .where(eq(userLocations.sharingEnabled, true));

  return rows
    .map((r) => {
      let opIds: number[] = [];
      try { opIds = JSON.parse(r.operationIds || "[]"); } catch { opIds = []; }
      return { ...r, operationIds: opIds };
    })
    .filter((r) => {
      if (callerOpIds.length === 0) return true;
      return r.operationIds.some((id) => callerOpIds.includes(id));
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
  accuracy: number | null,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const opIdsJson = JSON.stringify(operationIds);
  await db
    .insert(userLocations)
    .values({ userId, deviceId, lat, lng, speed, heading, accuracy, operationIds: opIdsJson, sharingEnabled, updatedAt: now })
    .onDuplicateKeyUpdate({
      set: { lat, lng, speed, heading, accuracy, operationIds: opIdsJson, sharingEnabled, updatedAt: now },
    });
}

/**
 * Disables location sharing for a user (sets sharingEnabled=false).
 */
export async function clearUserLocation(userId: number, deviceId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(userLocations)
    .set({ sharingEnabled: false, updatedAt: Date.now() })
    .where(and(eq(userLocations.userId, userId), eq(userLocations.deviceId, deviceId)));
}

/**
 * Returns the current location/sharing state for a single user.
 */
export async function getUserLocationState(userId: number, deviceId: string): Promise<{
  sharingEnabled: boolean;
  operationIds: number[];
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ sharingEnabled: userLocations.sharingEnabled, operationIds: userLocations.operationIds })
    .from(userLocations)
    .where(and(eq(userLocations.userId, userId), eq(userLocations.deviceId, deviceId)))
    .limit(1);
  if (!rows.length) return null;
  let opIds: number[] = [];
  try { opIds = JSON.parse(rows[0].operationIds || "[]"); } catch { opIds = []; }
  return { sharingEnabled: rows[0].sharingEnabled, operationIds: opIds };
}
