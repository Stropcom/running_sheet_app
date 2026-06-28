import { and, desc, eq, inArray } from "drizzle-orm";
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
  users,
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

export async function updateUserRole(userId: number, role: "observer" | "certifier" | "admin") {
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
  await db.delete(operations).where(eq(operations.id, id));
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
  await db.delete(runningSheets).where(eq(runningSheets.id, id));
}

// ─── Sheet Rows ───────────────────────────────────────────────────────────────

export async function getRowsBySheetId(sheetId: number) {
  const db = await getDb();
  if (!db) return [];
  // Sort by timeMinutes when available, fall back to rowNumber for rows without a time set
  return db.select().from(sheetRows).where(eq(sheetRows.sheetId, sheetId)).orderBy(sheetRows.timeMinutes, sheetRows.rowNumber);
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
  return db.select().from(rowMembers).where(eq(rowMembers.rowId, rowId)).orderBy(rowMembers.createdAt);
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
