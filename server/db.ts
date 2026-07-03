import { and, desc, eq, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  return db.select().from(operations).orderBy(desc(operations.createdAt));
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
  return db.select().from(runningSheets).orderBy(desc(runningSheets.createdAt));
}

export async function getRunningSheetsByOperation(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(runningSheets).where(eq(runningSheets.operationId, operationId)).orderBy(desc(runningSheets.createdAt));
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
  const byFk = await db.select().from(targets).where(eq(targets.operationId, operationId));
  const linked = await db
    .select({ id: targets.id, name: targets.name, tgt: targets.tgt, hbf: targets.hbf, hb: targets.hb, v1f: targets.v1f, v1: targets.v1, v2f: targets.v2f, v2: targets.v2, dep: targets.dep, arr: targets.arr, operationId: targets.operationId, createdBy: targets.createdBy, createdAt: targets.createdAt, updatedAt: targets.updatedAt })
    .from(operationTargetLinks)
    .innerJoin(targets, eq(operationTargetLinks.targetId, targets.id))
    .where(eq(operationTargetLinks.operationId, operationId));
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
  const allTargets = await db.select().from(targets).orderBy(targets.name);
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
      or(
        like(sql`LOWER(${runningSheets.title})`, q),
        like(sql`LOWER(COALESCE(${runningSheets.sheetCins}, ''))`, q),
      )
    );

  // 3. Targets that match on any field
  const targetMatches = await db
    .select({ operationId: targets.operationId, name: targets.name, tgt: targets.tgt, hbf: targets.hbf, hb: targets.hb, v1f: targets.v1f, v1: targets.v1, v2f: targets.v2f, v2: targets.v2, dep: targets.dep, arr: targets.arr })
    .from(targets)
    .where(
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
  fullDescription: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
}> {
  const results: Array<{
    shortForm: string;
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
    const addressInFull =
      /\b\d{1,5}\s+\w[\w\s]*(street|road|ave|avenue|drive|way|court|place|close|crescent|boulevard|highway|freeway|lane|terrace|parade|circuit)\b/i.test(fullDescription) ||
      /\b(street|road|ave|avenue|drive|way|court|place|close|crescent|boulevard|highway|freeway|lane|terrace|parade|circuit)\b/i.test(shortForm) ||
      /^\d{1,5}\s/.test(shortForm);

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

    results.push({ shortForm: displayName, fullDescription, type });
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
    .leftJoin(operations, eq(targets.operationId!, operations.id));

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
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id));

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

  // Find sheets linked to each target
  const sheetsByTarget = await db
    .select({
      targetId: runningSheets.targetId,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
    })
    .from(runningSheets)
    .where(isNotNull(runningSheets.targetId));

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
    .orderBy(sheetRows.timeMinutes);

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    for (const e of entities) {
      // If this person shortForm is a known TGT alias, merge its occurrences
      // into the canonical target entity instead of creating a duplicate
      if (e.type === "person") {
        const canonicalName = tgtAliasToFullName.get(e.shortForm.toUpperCase());
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
            continue; // skip adding as a separate entity
          }
        }
      }
      // Use lowercase key so "1 Smith Street" and "1 SMITH STREET" are the same entity
      const key = `${e.type}::${e.shortForm.toLowerCase()}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm: e.shortForm, type: e.type, isTarget: false, occurrences: [] });
      } else {
        // If the existing entry has a shorter shortForm, upgrade it to the longer one
        const existing = entityMap.get(key)!;
        if (e.shortForm.length > existing.shortForm.length) {
          existing.shortForm = e.shortForm;
        }
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

        // The longer must START WITH the shorter, and the character immediately
        // after the shorter in the longer must be a natural word boundary
        if (
          longerLower.startsWith(shorterLower) &&
          (
            longerLower.length === shorterLower.length ||
            /^[\s,;\-/]/.test(longerLower.slice(shorterLower.length))
          )
        ) {
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
  let rowQuery = db
    .select({
      rowId: sheetRows.id,
      observation: sheetRows.observation,
      sheetId: sheetRows.sheetId,
      operationId: runningSheets.operationId,
      operationName: operations.name,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .innerJoin(operations, eq(runningSheets.operationId, operations.id));

  const allRows = await rowQuery;
  const filteredRows = operationIds && operationIds.length > 0
    ? allRows.filter((r) => operationIds.includes(r.operationId))
    : allRows;

  // Build TGT alias map from targets
  const allTargets = await db
    .select({ id: targets.id, name: targets.name, tgt: targets.tgt, operationId: targets.operationId })
    .from(targets);
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
  }[]
> {
  const db = await getDb();
  if (!db) return [];

  // Find all sheets where this CIN is TL or Author (stored in sheetCins JSON)
  const allSheets = await db.select().from(runningSheets);
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
      if (outstanding.length > 0) {
        results.push({
          sheetId: sheet.id,
          sheetTitle: sheet.title,
          operationId: sheet.operationId,
          operationName: op?.name ?? "Unknown",
          role: "teamLeader",
          outstanding,
          allSigned,
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
