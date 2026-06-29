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

  // Fetch sheets
  const sheets = await db
    .select()
    .from(runningSheets)
    .where(inArray(runningSheets.id, sheetIds));

  // Fetch operations for those sheets
  const opIds = Array.from(new Set(sheets.map((s) => s.operationId)));
  const ops = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, opIds));

  return sheets.map((sheet) => {
    const op = ops.find((o) => o.id === sheet.operationId);
    const uncertifiedRowCount = rows.filter((r) => r.sheetId === sheet.id).length;
    return {
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      targetName: sheet.targetName ?? null,
      operationId: sheet.operationId,
      operationName: op?.name ?? "Unknown Operation",
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
  return db.select().from(targets).where(eq(targets.operationId, operationId));
}

export async function createTarget(data: InsertTarget) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targets).values(data);
  return { id: (result as any).insertId as number };
}

export async function updateTarget(
  id: number,
  data: Partial<Pick<InsertTarget, "name" | "tgt" | "hb" | "v1" | "v2" | "wb" | "dep" | "arr">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targets).set(data).where(eq(targets.id, id));
  return { id };
}

export async function deleteTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Clear any running sheets that reference this target before deleting
  await db.update(runningSheets).set({ targetId: null }).where(eq(runningSheets.targetId, id));
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
    if (target.operationId !== sheet.operationId) throw new Error("Target does not belong to this operation");
  }
  await db.update(runningSheets).set({ targetId }).where(eq(runningSheets.id, sheetId));
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

  const q = `%${query.trim()}%`;

  // 1. Operations that match on their own fields
  const opMatches = await db
    .select()
    .from(operations)
    .where(
      or(
        like(operations.name, q),
        like(sql`COALESCE(${operations.promisNumber}, '')`, q),
        like(sql`COALESCE(${operations.imsNumber}, '')`, q),
        like(sql`COALESCE(${operations.investigationUnit}, '')`, q),
      )
    );

  // 2. Sheets that match on title or sheetCins JSON text
  const sheetMatches = await db
    .select({ operationId: runningSheets.operationId, title: runningSheets.title, sheetCins: runningSheets.sheetCins })
    .from(runningSheets)
    .where(
      or(
        like(runningSheets.title, q),
        like(sql`COALESCE(${runningSheets.sheetCins}, '')`, q),
      )
    );

  // 3. Targets that match on any field
  const targetMatches = await db
    .select({ operationId: targets.operationId, name: targets.name, tgt: targets.tgt, hb: targets.hb, v1: targets.v1, v2: targets.v2, wb: targets.wb, dep: targets.dep, arr: targets.arr })
    .from(targets)
    .where(
      or(
        like(targets.name, q),
        like(sql`COALESCE(${targets.tgt}, '')`, q),
        like(sql`COALESCE(${targets.hb}, '')`, q),
        like(sql`COALESCE(${targets.v1}, '')`, q),
        like(sql`COALESCE(${targets.v2}, '')`, q),
        like(sql`COALESCE(${targets.wb}, '')`, q),
        like(sql`COALESCE(${targets.dep}, '')`, q),
        like(sql`COALESCE(${targets.arr}, '')`, q),
      )
    );

  // 4. Observation rows that match
  const rowMatches = await db
    .select({ sheetId: sheetRows.sheetId, observation: sheetRows.observation, time: sheetRows.time })
    .from(sheetRows)
    .where(like(sql`COALESCE(${sheetRows.observation}, '')`, q));

  // 5. Row members (CIN in row) that match
  const memberMatches = await db
    .select({ rowId: rowMembers.rowId, memberName: rowMembers.memberName })
    .from(rowMembers)
    .where(like(rowMembers.memberName, q));

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

    // Vehicle: preceding text mentions vehicle/car/truck/van/ute/sedan/hatchback/SUV/registration/bearing/reg
    if (
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

    results.push({ shortForm, fullDescription, type });
  }

  return results;
}

export interface IntelligenceEntity {
  shortForm: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
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

  const entityMap = new Map<string, IntelligenceEntity>();

  // ── 1. Extract from observation rows ──────────────────────────────────────
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
      const key = `${e.type}::${e.shortForm}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm: e.shortForm, type: e.type, occurrences: [] });
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

  // ── 2. Extract from target cards (TGT, HB, V1, V2, WB — NOT DEP/ARR) ─────
  const targetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      wb: targets.wb,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(operations, eq(targets.operationId, operations.id));

  // Find sheets linked to each target so we can populate sheetId/sheetTitle
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

  for (const t of targetRows) {
    // Fields to include: TGT (person), HB (address), V1 (vehicle), V2 (vehicle), WB (address)
    const fields: Array<{ label: string; value: string | null; type: IntelligenceEntity["type"] }> = [
      { label: "TGT", value: t.tgt, type: "person" },
      { label: "HB",  value: t.hb,  type: "address" },
      { label: "V1",  value: t.v1,  type: "vehicle" },
      { label: "V2",  value: t.v2,  type: "vehicle" },
      { label: "WB",  value: t.wb,  type: "address" },
    ];

    const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
    // Use a synthetic sheetId of 0 if no sheets are linked yet
    const sheetEntries = linkedSheets.length > 0 ? linkedSheets : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];

    for (const field of fields) {
      if (!field.value || field.value.trim() === "") continue;
      const shortForm = field.value.trim();
      const key = `${field.type}::${shortForm}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      }
      for (const sheet of sheetEntries) {
        entityMap.get(key)!.occurrences.push({
          sheetId: sheet.sheetId,
          sheetTitle: sheet.sheetTitle,
          operationId: t.operationId,
          operationName: t.operationName,
          rowId: 0,
          observationSnippet: `Target card — ${t.targetName} [${field.label}]`,
          timeMinutes: null,
          fullDescription: `${field.label}: ${shortForm} (from target: ${t.targetName}, operation: ${t.operationName})`,
        });
      }
    }

    // Also add the target name itself as a person entity
    const nameKey = `person::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, { shortForm: t.targetName, type: "person", occurrences: [] });
    }
    for (const sheet of sheetEntries) {
      entityMap.get(nameKey)!.occurrences.push({
        sheetId: sheet.sheetId,
        sheetTitle: sheet.sheetTitle,
        operationId: t.operationId,
        operationName: t.operationName,
        rowId: 0,
        observationSnippet: `Target card — ${t.targetName}`,
        timeMinutes: null,
        fullDescription: `Target: ${t.targetName} (operation: ${t.operationName})`,
      });
    }
  }

  return Array.from(entityMap.values());
}
