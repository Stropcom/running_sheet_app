import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, getAllUsers as getAllRunLogUsers, getUserByCin } from "./db";
import {
  ctoRosterTeams,
  ctoRosterMembers,
  ctoRosterShifts,
  ctoRosterAuditLog,
  CtoRosterTeam,
  CtoRosterMember,
  CtoRosterShift,
} from "../drizzle/schema";

// ── Audit ─────────────────────────────────────────────────────────────────────
// Fire-and-forget, never throws — an audit failure must never break the
// underlying roster mutation.
export async function writeCtoRosterAudit(entry: {
  userId?: number | null;
  userName?: string | null;
  action: string;
  memberId?: number | null;
  memberName?: string | null;
  shiftDate?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(ctoRosterAuditLog).values({
      userId: entry.userId ?? null,
      userName: entry.userName ?? null,
      action: entry.action,
      memberId: entry.memberId ?? null,
      memberName: entry.memberName ?? null,
      shiftDate: entry.shiftDate ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      detail: entry.detail ?? null,
    });
  } catch {
    // Never let audit failures break the main operation
  }
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getAllCtoRosterTeams(): Promise<CtoRosterTeam[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ctoRosterTeams).orderBy(ctoRosterTeams.sortOrder);
}

// ── Members ───────────────────────────────────────────────────────────────────
// A "member" is a RunLog user (by CIN) assigned to a roster team. Display
// name is always resolved live from RunLog's users table, never duplicated
// on the roster row — see the schema comment on ctoRosterMembers.

export interface CtoRosterMemberWithName extends CtoRosterMember {
  name: string;
}

export async function getAllCtoRosterMembers(): Promise<CtoRosterMemberWithName[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ctoRosterMembers).orderBy(ctoRosterMembers.teamId, ctoRosterMembers.sortOrder);
  const users = await getAllRunLogUsers();
  const nameByCin = new Map(users.map((u) => [u.cin, u.name]));
  return rows.map((r) => ({ ...r, name: nameByCin.get(r.cin) ?? r.cin }));
}

export async function getCtoRosterMembersByTeam(teamId: number): Promise<CtoRosterMemberWithName[]> {
  const all = await getAllCtoRosterMembers();
  return all.filter((m) => m.teamId === teamId);
}

/** Add an existing RunLog user (by CIN) to the roster under a team. */
export async function addCtoRosterMember(cin: string, teamId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const user = await getUserByCin(cin);
  if (!user) throw new Error(`No RunLog user found with CIN ${cin}`);
  const existing = await db.select().from(ctoRosterMembers).where(eq(ctoRosterMembers.teamId, teamId));
  const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const [result] = await db.insert(ctoRosterMembers).values({ cin, teamId, sortOrder: maxSort + 1 });
  return result.insertId as number;
}

export async function deleteCtoRosterMember(memberId: number, deleteShifts: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (deleteShifts) {
    await db.delete(ctoRosterShifts).where(eq(ctoRosterShifts.memberId, memberId));
  }
  await db.delete(ctoRosterMembers).where(eq(ctoRosterMembers.id, memberId));
}

export async function moveCtoRosterMember(memberId: number, teamId: number, sortOrder?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ctoRosterMembers)
    .set({ teamId, ...(sortOrder !== undefined ? { sortOrder } : {}) })
    .where(eq(ctoRosterMembers.id, memberId));
}

export async function reorderCtoRosterMembers(rows: { id: number; teamId: number; sortOrder: number }[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await Promise.all(
    rows.map((m) => db.update(ctoRosterMembers).set({ teamId: m.teamId, sortOrder: m.sortOrder }).where(eq(ctoRosterMembers.id, m.id)))
  );
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function getCtoRosterShiftsForDateRange(startDate: string, endDate: string): Promise<CtoRosterShift[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ctoRosterShifts)
    .where(and(gte(ctoRosterShifts.shiftDate, startDate), lte(ctoRosterShifts.shiftDate, endDate)))
    .orderBy(ctoRosterShifts.shiftDate, ctoRosterShifts.memberId);
}

export async function getCtoRosterShiftsForMember(memberId: number, startDate?: string, endDate?: string): Promise<CtoRosterShift[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(ctoRosterShifts.memberId, memberId)];
  if (startDate) conditions.push(gte(ctoRosterShifts.shiftDate, startDate));
  if (endDate) conditions.push(lte(ctoRosterShifts.shiftDate, endDate));
  return db.select().from(ctoRosterShifts).where(and(...conditions)).orderBy(ctoRosterShifts.shiftDate);
}

export async function upsertCtoRosterShift(
  memberId: number,
  shiftDate: string,
  shiftCode: string,
  updatedBy?: number,
  comment?: string | null,
  isActing?: boolean,
  shiftTime?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateSet: Record<string, unknown> = { shiftCode, updatedBy };
  if (comment !== undefined) updateSet.comment = comment;
  if (isActing !== undefined) updateSet.isActing = isActing;
  if (shiftTime !== undefined) updateSet.shiftTime = shiftTime;
  await db.insert(ctoRosterShifts)
    .values({ memberId, shiftDate, shiftCode, updatedBy, comment: comment ?? null, isActing: isActing ?? false, shiftTime: shiftTime ?? null })
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function bulkUpdateCtoRosterShifts(
  rows: { memberId: number; shiftDate: string; shiftCode: string; updatedBy?: number; isActing?: boolean; shiftTime?: string | null }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const row of rows) {
    const baseUpd: Record<string, unknown> = { shiftCode: row.shiftCode, updatedBy: row.updatedBy };
    if (row.isActing !== undefined) baseUpd.isActing = row.isActing;
    if (row.shiftTime !== undefined) baseUpd.shiftTime = row.shiftTime;
    const insertVals: Record<string, unknown> = { memberId: row.memberId, shiftDate: row.shiftDate, shiftCode: row.shiftCode, updatedBy: row.updatedBy };
    if (row.isActing !== undefined) insertVals.isActing = row.isActing;
    if (row.shiftTime !== undefined) insertVals.shiftTime = row.shiftTime;
    await db.insert(ctoRosterShifts).values(insertVals as typeof ctoRosterShifts.$inferInsert).onDuplicateKeyUpdate({ set: baseUpd });
  }
}

/**
 * Copy shifts from sourceMemberId to one or more targetMemberIds for a given date range.
 * Existing shifts for target members in that range are overwritten.
 */
export async function bulkCopyCtoRosterShifts(
  sourceMemberId: number,
  targetMemberIds: number[],
  startDate: string,
  endDate: string,
  updatedBy?: number,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const sourceShifts = await db.select().from(ctoRosterShifts)
    .where(and(
      eq(ctoRosterShifts.memberId, sourceMemberId),
      gte(ctoRosterShifts.shiftDate, startDate),
      lte(ctoRosterShifts.shiftDate, endDate),
    ));
  if (sourceShifts.length === 0) return 0;
  let count = 0;
  for (const targetId of targetMemberIds) {
    for (const s of sourceShifts) {
      await db.insert(ctoRosterShifts)
        .values({ memberId: targetId, shiftDate: s.shiftDate, shiftCode: s.shiftCode, comment: s.comment, isActing: s.isActing ?? false, updatedBy })
        .onDuplicateKeyUpdate({ set: { shiftCode: s.shiftCode, comment: s.comment, isActing: s.isActing ?? false, updatedBy } });
      count++;
    }
  }
  return count;
}
