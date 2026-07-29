import {
  and,
  eq,
  gte,
  lte,
  lt,
  inArray,
  desc,
  asc,
  max,
  count,
} from "drizzle-orm";
import { getDb, getAllUsers as getAllRunLogUsers, getUserByCin } from "./db";
import {
  ctoRosterTeams,
  ctoRosterMembers,
  ctoRosterShifts,
  ctoRosterAuditLog,
  ctoRosterDrafts,
  ctoRosterDraftTeams,
  ctoRosterDraftMembers,
  ctoRosterDraftShifts,
  ctoRosterSavedRosters,
  ctoRosterSavedRosterTeams,
  ctoRosterSavedRosterMembers,
  ctoRosterSavedRosterShifts,
  CtoRosterTeam,
  CtoRosterMember,
  CtoRosterShift,
  CtoRosterDraft,
  CtoRosterDraftShift,
  InsertCtoRosterDraftShift,
  CtoRosterSavedRoster,
  ctoRosterEbaRules,
  ctoRosterOutlookSettings,
  CtoRosterEbaRule,
  CtoRosterAuditLog,
} from "../drizzle/schema";
import { runEbaChecks, type ShiftRecord } from "./ctoRosterEbaEngine";
import { computeShiftInterval } from "../shared/ctoRosterShiftDuration";

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
// The live roster's teams aren't seeded automatically (the source app only
// ever bootstrapped them via a one-off seed script) — admins manage them here.

export async function getAllCtoRosterTeams(): Promise<CtoRosterTeam[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ctoRosterTeams).orderBy(ctoRosterTeams.sortOrder);
}

export async function addCtoRosterTeam(name: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterTeams.sortOrder) })
    .from(ctoRosterTeams);
  const [result] = await db
    .insert(ctoRosterTeams)
    .values({ name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterTeam(
  teamId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterTeams)
    .set({ name })
    .where(eq(ctoRosterTeams.id, teamId));
}

/** Refuses to delete a team that still has members — move or remove them first. */
export async function deleteCtoRosterTeam(teamId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const remaining = await db
    .select({ id: ctoRosterMembers.id })
    .from(ctoRosterMembers)
    .where(eq(ctoRosterMembers.teamId, teamId));
  if (remaining.length > 0) {
    throw new Error(
      `This team still has ${remaining.length} member(s) — move or remove them before deleting the team.`
    );
  }
  await db.delete(ctoRosterTeams).where(eq(ctoRosterTeams.id, teamId));
}

export async function reorderCtoRosterTeams(
  rows: { id: number; sortOrder: number }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await Promise.all(
    rows.map(t =>
      db
        .update(ctoRosterTeams)
        .set({ sortOrder: t.sortOrder })
        .where(eq(ctoRosterTeams.id, t.id))
    )
  );
}

// ── Members ───────────────────────────────────────────────────────────────────
// A "member" is a RunLog user (by CIN) assigned to a roster team. Display
// name is always resolved live from RunLog's users table, never duplicated
// on the roster row — see the schema comment on ctoRosterMembers.

export interface CtoRosterMemberWithName extends CtoRosterMember {
  name: string;
}

export async function getAllCtoRosterMembers(): Promise<
  CtoRosterMemberWithName[]
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(ctoRosterMembers)
    .orderBy(ctoRosterMembers.teamId, ctoRosterMembers.sortOrder);
  const users = await getAllRunLogUsers();
  const nameByCin = new Map(users.map(u => [u.cin, u.name]));
  return rows.map(r => ({ ...r, name: nameByCin.get(r.cin) ?? r.cin }));
}

export async function getCtoRosterMembersByTeam(
  teamId: number
): Promise<CtoRosterMemberWithName[]> {
  const all = await getAllCtoRosterMembers();
  return all.filter(m => m.teamId === teamId);
}

/** Add an existing RunLog user (by CIN) to the roster under a team. */
export async function addCtoRosterMember(
  cin: string,
  teamId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const user = await getUserByCin(cin);
  if (!user) throw new Error(`No RunLog user found with CIN ${cin}`);
  const existing = await db
    .select()
    .from(ctoRosterMembers)
    .where(eq(ctoRosterMembers.teamId, teamId));
  const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const [result] = await db
    .insert(ctoRosterMembers)
    .values({ cin, teamId, sortOrder: maxSort + 1 });
  return result.insertId as number;
}

export async function deleteCtoRosterMember(
  memberId: number,
  deleteShifts: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (deleteShifts) {
    await db
      .delete(ctoRosterShifts)
      .where(eq(ctoRosterShifts.memberId, memberId));
  }
  await db.delete(ctoRosterMembers).where(eq(ctoRosterMembers.id, memberId));
}

export async function moveCtoRosterMember(
  memberId: number,
  teamId: number,
  sortOrder?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterMembers)
    .set({ teamId, ...(sortOrder !== undefined ? { sortOrder } : {}) })
    .where(eq(ctoRosterMembers.id, memberId));
}

/**
 * Move a member to a new team, clearing their future (from today) shifts
 * except for the shift codes the caller chose to keep (e.g. Leave, Court).
 */
export async function changeCtoRosterMemberTeam(
  memberId: number,
  newTeamId: number,
  keepShiftCodes: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterMembers)
    .set({ teamId: newTeamId })
    .where(eq(ctoRosterMembers.id, memberId));

  const todayStr = new Date().toISOString().slice(0, 10);
  const futureShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        eq(ctoRosterShifts.memberId, memberId),
        gte(ctoRosterShifts.shiftDate, todayStr)
      )
    );
  for (const s of futureShifts) {
    if (!keepShiftCodes.includes(s.shiftCode)) {
      await db
        .delete(ctoRosterShifts)
        .where(
          and(
            eq(ctoRosterShifts.memberId, memberId),
            eq(ctoRosterShifts.shiftDate, s.shiftDate)
          )
        );
    }
  }
}

export async function reorderCtoRosterMembers(
  rows: { id: number; teamId: number; sortOrder: number }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await Promise.all(
    rows.map(m =>
      db
        .update(ctoRosterMembers)
        .set({ teamId: m.teamId, sortOrder: m.sortOrder })
        .where(eq(ctoRosterMembers.id, m.id))
    )
  );
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function getCtoRosterShiftsForDateRange(
  startDate: string,
  endDate: string
): Promise<CtoRosterShift[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        gte(ctoRosterShifts.shiftDate, startDate),
        lte(ctoRosterShifts.shiftDate, endDate)
      )
    )
    .orderBy(ctoRosterShifts.shiftDate, ctoRosterShifts.memberId);
}

export async function getCtoRosterShiftsForMember(
  memberId: number,
  startDate?: string,
  endDate?: string
): Promise<CtoRosterShift[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(ctoRosterShifts.memberId, memberId)];
  if (startDate) conditions.push(gte(ctoRosterShifts.shiftDate, startDate));
  if (endDate) conditions.push(lte(ctoRosterShifts.shiftDate, endDate));
  return db
    .select()
    .from(ctoRosterShifts)
    .where(and(...conditions))
    .orderBy(ctoRosterShifts.shiftDate);
}

export async function upsertCtoRosterShift(
  memberId: number,
  shiftDate: string,
  shiftCode: string,
  updatedBy?: number,
  comment?: string | null,
  isActing?: boolean,
  shiftTime?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateSet: Record<string, unknown> = { shiftCode, updatedBy };
  if (comment !== undefined) updateSet.comment = comment;
  if (isActing !== undefined) updateSet.isActing = isActing;
  if (shiftTime !== undefined) updateSet.shiftTime = shiftTime;
  await db
    .insert(ctoRosterShifts)
    .values({
      memberId,
      shiftDate,
      shiftCode,
      updatedBy,
      comment: comment ?? null,
      isActing: isActing ?? false,
      shiftTime: shiftTime ?? null,
    })
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function bulkUpdateCtoRosterShifts(
  rows: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    updatedBy?: number;
    isActing?: boolean;
    shiftTime?: string | null;
  }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const row of rows) {
    const baseUpd: Record<string, unknown> = {
      shiftCode: row.shiftCode,
      updatedBy: row.updatedBy,
    };
    if (row.isActing !== undefined) baseUpd.isActing = row.isActing;
    if (row.shiftTime !== undefined) baseUpd.shiftTime = row.shiftTime;
    const insertVals: Record<string, unknown> = {
      memberId: row.memberId,
      shiftDate: row.shiftDate,
      shiftCode: row.shiftCode,
      updatedBy: row.updatedBy,
    };
    if (row.isActing !== undefined) insertVals.isActing = row.isActing;
    if (row.shiftTime !== undefined) insertVals.shiftTime = row.shiftTime;
    await db
      .insert(ctoRosterShifts)
      .values(insertVals as typeof ctoRosterShifts.$inferInsert)
      .onDuplicateKeyUpdate({ set: baseUpd });
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
  updatedBy?: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const sourceShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        eq(ctoRosterShifts.memberId, sourceMemberId),
        gte(ctoRosterShifts.shiftDate, startDate),
        lte(ctoRosterShifts.shiftDate, endDate)
      )
    );
  if (sourceShifts.length === 0) return 0;
  let count = 0;
  for (const targetId of targetMemberIds) {
    for (const s of sourceShifts) {
      await db
        .insert(ctoRosterShifts)
        .values({
          memberId: targetId,
          shiftDate: s.shiftDate,
          shiftCode: s.shiftCode,
          comment: s.comment,
          isActing: s.isActing ?? false,
          updatedBy,
        })
        .onDuplicateKeyUpdate({
          set: {
            shiftCode: s.shiftCode,
            comment: s.comment,
            isActing: s.isActing ?? false,
            updatedBy,
          },
        });
      count++;
    }
  }
  return count;
}

// ── Drafts (what-if planning, merges back into live roster) ────────────────────
// A "seeded" draft is a snapshot copy of the live roster over a date range —
// Leave/Court cells stay locked, and it can be merged back with conflict
// detection. A "standalone" draft is a blank slate with its own free-text
// teams/members (not CIN-linked — see schema comment) that can only be saved
// as an archived roster, never merged into the live grid.

const DRAFT_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const STANDALONE_DRAFT_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

function assertDraftUsable(
  draft: CtoRosterDraft | undefined,
  action: string
): asserts draft is CtoRosterDraft {
  if (!draft) throw new Error("Draft not found.");
  if (new Date(draft.expiresAt) < new Date())
    throw new Error(`This draft has expired and can no longer be ${action}.`);
}

export async function getAllCtoRosterDrafts(): Promise<CtoRosterDraft[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const expired = await db
    .select({ id: ctoRosterDrafts.id })
    .from(ctoRosterDrafts)
    .where(lt(ctoRosterDrafts.expiresAt, now));
  for (const d of expired) {
    await db
      .delete(ctoRosterDraftShifts)
      .where(eq(ctoRosterDraftShifts.draftId, d.id));
    await db
      .delete(ctoRosterDraftTeams)
      .where(eq(ctoRosterDraftTeams.draftId, d.id));
    await db
      .delete(ctoRosterDraftMembers)
      .where(eq(ctoRosterDraftMembers.draftId, d.id));
    await db.delete(ctoRosterDrafts).where(eq(ctoRosterDrafts.id, d.id));
  }
  return db
    .select()
    .from(ctoRosterDrafts)
    .orderBy(desc(ctoRosterDrafts.createdAt));
}

export async function getCtoRosterDraftById(
  draftId: number
): Promise<CtoRosterDraft | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(ctoRosterDrafts)
    .where(eq(ctoRosterDrafts.id, draftId));
  return rows[0];
}

/** Create a new seeded draft, copying all live shifts in the date range for conflict-free planning. */
export async function createCtoRosterDraft(
  name: string,
  startDate: string,
  endDate: string,
  createdBy?: number,
  createdByName?: string | null
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const liveShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        gte(ctoRosterShifts.shiftDate, startDate),
        lte(ctoRosterShifts.shiftDate, endDate)
      )
    );
  const snapshot: Record<
    string,
    { shiftCode: string; shiftTime?: string | null }
  > = {};
  for (const s of liveShifts)
    snapshot[`${s.memberId}_${s.shiftDate}`] = {
      shiftCode: s.shiftCode,
      shiftTime: s.shiftTime ?? null,
    };
  const [result] = await db.insert(ctoRosterDrafts).values({
    name,
    startDate,
    endDate,
    createdBy: createdBy ?? null,
    createdByName: createdByName ?? null,
    seedSnapshot: JSON.stringify(snapshot),
    draftType: "seeded",
    expiresAt: new Date(Date.now() + DRAFT_EXPIRY_MS),
  });
  const draftId = result.insertId as number;
  if (liveShifts.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < liveShifts.length; i += CHUNK) {
      const chunk = liveShifts.slice(i, i + CHUNK);
      await db.insert(ctoRosterDraftShifts).values(
        chunk.map(
          s =>
            ({
              draftId,
              memberId: s.memberId,
              shiftDate: s.shiftDate,
              shiftCode: s.shiftCode,
              shiftTime: s.shiftTime ?? null,
              comment: s.comment ?? null,
              isActing: s.isActing ?? false,
              updatedBy: createdBy ?? null,
            }) satisfies InsertCtoRosterDraftShift
        )
      );
    }
  }
  return draftId;
}

export async function createStandaloneCtoRosterDraft(
  name: string,
  startDate: string,
  endDate: string,
  createdBy?: number,
  createdByName?: string | null
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(ctoRosterDrafts).values({
    name,
    startDate,
    endDate,
    createdBy: createdBy ?? null,
    createdByName: createdByName ?? null,
    seedSnapshot: null,
    draftType: "standalone",
    expiresAt: new Date(Date.now() + STANDALONE_DRAFT_EXPIRY_MS),
  });
  return result.insertId as number;
}

export async function deleteCtoRosterDraft(draftId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(ctoRosterDraftShifts)
    .where(eq(ctoRosterDraftShifts.draftId, draftId));
  await db
    .delete(ctoRosterDraftTeams)
    .where(eq(ctoRosterDraftTeams.draftId, draftId));
  await db
    .delete(ctoRosterDraftMembers)
    .where(eq(ctoRosterDraftMembers.draftId, draftId));
  await db.delete(ctoRosterDrafts).where(eq(ctoRosterDrafts.id, draftId));
}

export async function renameCtoRosterDraft(
  draftId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterDrafts)
    .set({ name })
    .where(eq(ctoRosterDrafts.id, draftId));
}

export async function setCtoRosterDraftTimeframe(
  draftId: number,
  startDate: string,
  endDate: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterDrafts)
    .set({ startDate, endDate })
    .where(eq(ctoRosterDrafts.id, draftId));
}

export async function getCtoRosterDraftShifts(
  draftId: number
): Promise<CtoRosterDraftShift[]> {
  const db = await getDb();
  if (!db) return [];
  const draft = await getCtoRosterDraftById(draftId);
  assertDraftUsable(draft, "accessed");
  return db
    .select()
    .from(ctoRosterDraftShifts)
    .where(eq(ctoRosterDraftShifts.draftId, draftId));
}

/** Upsert a single draft shift cell. Blocks changing a cell that's currently Leave ('l') or Court ('c'). */
export async function upsertCtoRosterDraftShift(
  draftId: number,
  memberId: number,
  shiftDate: string,
  shiftCode: string,
  updatedBy?: number,
  comment?: string | null,
  isActing?: boolean,
  shiftTime?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(ctoRosterDraftShifts)
    .where(
      and(
        eq(ctoRosterDraftShifts.draftId, draftId),
        eq(ctoRosterDraftShifts.memberId, memberId),
        eq(ctoRosterDraftShifts.shiftDate, shiftDate)
      )
    );
  const currentCode = existing[0]?.shiftCode ?? "";
  if (currentCode === "l" || currentCode === "c") {
    throw new Error(
      `This cell is locked (${currentCode === "l" ? "Leave" : "Court"}) — update the main roster first.`
    );
  }
  const updateSet: Record<string, unknown> = { shiftCode, updatedBy };
  if (comment !== undefined) updateSet.comment = comment;
  if (isActing !== undefined) updateSet.isActing = isActing;
  if (shiftTime !== undefined) updateSet.shiftTime = shiftTime;
  await db
    .insert(ctoRosterDraftShifts)
    .values({
      draftId,
      memberId,
      shiftDate,
      shiftCode,
      shiftTime: shiftTime ?? null,
      comment: comment ?? null,
      isActing: isActing ?? false,
      updatedBy,
    })
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function bulkUpsertCtoRosterDraftShifts(
  draftId: number,
  shifts: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    shiftTime?: string | null;
    isActing?: boolean;
  }[],
  updatedBy?: number,
  actingOnly?: boolean
): Promise<{ updated: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existingRows = await db
    .select()
    .from(ctoRosterDraftShifts)
    .where(eq(ctoRosterDraftShifts.draftId, draftId));
  const existingMap = new Map(
    existingRows.map(r => [`${r.memberId}_${r.shiftDate}`, r])
  );
  const allowed = shifts.filter(s => {
    const cur = existingMap.get(`${s.memberId}_${s.shiftDate}`);
    return !(cur?.shiftCode === "l" || cur?.shiftCode === "c");
  });
  for (const s of allowed) {
    const cur = existingMap.get(`${s.memberId}_${s.shiftDate}`);
    if (actingOnly) {
      if (cur) {
        await db
          .update(ctoRosterDraftShifts)
          .set({ isActing: s.isActing ?? false, updatedBy })
          .where(
            and(
              eq(ctoRosterDraftShifts.draftId, draftId),
              eq(ctoRosterDraftShifts.memberId, s.memberId),
              eq(ctoRosterDraftShifts.shiftDate, s.shiftDate)
            )
          );
      }
    } else {
      await db
        .insert(ctoRosterDraftShifts)
        .values({
          draftId,
          memberId: s.memberId,
          shiftDate: s.shiftDate,
          shiftCode: s.shiftCode,
          shiftTime: s.shiftTime ?? null,
          isActing: s.isActing ?? false,
          updatedBy,
        })
        .onDuplicateKeyUpdate({
          set: {
            shiftCode: s.shiftCode,
            shiftTime: s.shiftTime ?? null,
            isActing: s.isActing ?? false,
            updatedBy,
          },
        });
    }
  }
  return { updated: allowed.length, skipped: shifts.length - allowed.length };
}

export interface CtoRosterDraftDiffEntry {
  memberId: number;
  memberName: string;
  shiftDate: string;
  draftCode: string;
  draftTime: string | null;
  liveCode: string;
  liveTime: string | null;
  isConflict: boolean;
}

/** Compute the diff between a seeded draft and the current live roster, flagging conflicts (live changed since seed). */
export async function getCtoRosterDraftMergeDiff(draftId: number): Promise<{
  diff: CtoRosterDraftDiffEntry[];
  draftName: string;
  startDate: string;
  endDate: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const draft = await getCtoRosterDraftById(draftId);
  assertDraftUsable(draft, "merged");
  const snapshot: Record<
    string,
    { shiftCode: string; shiftTime?: string | null }
  > = draft.seedSnapshot ? JSON.parse(draft.seedSnapshot) : {};
  const liveShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        gte(ctoRosterShifts.shiftDate, draft.startDate),
        lte(ctoRosterShifts.shiftDate, draft.endDate)
      )
    );
  const liveMap = new Map(
    liveShifts.map(s => [`${s.memberId}_${s.shiftDate}`, s])
  );
  const draftShiftRows = await db
    .select()
    .from(ctoRosterDraftShifts)
    .where(eq(ctoRosterDraftShifts.draftId, draftId));
  const members = await getAllCtoRosterMembers();
  const nameByMemberId = new Map(members.map(m => [m.id, m.name]));

  const diff: CtoRosterDraftDiffEntry[] = [];
  for (const ds of draftShiftRows) {
    const key = `${ds.memberId}_${ds.shiftDate}`;
    const live = liveMap.get(key);
    const liveCode = live?.shiftCode ?? "";
    const liveTime = live?.shiftTime ?? null;
    const draftCode = ds.shiftCode;
    const draftTime = ds.shiftTime ?? null;
    if (draftCode === liveCode && draftTime === liveTime) continue;
    if (liveCode === "l" || liveCode === "c") continue;
    const seededCode = snapshot[key]?.shiftCode ?? "";
    diff.push({
      memberId: ds.memberId,
      memberName: nameByMemberId.get(ds.memberId) ?? String(ds.memberId),
      shiftDate: ds.shiftDate,
      draftCode,
      draftTime,
      liveCode,
      liveTime,
      isConflict: liveCode !== seededCode,
    });
  }
  return {
    diff,
    draftName: draft.name,
    startDate: draft.startDate,
    endDate: draft.endDate,
  };
}

/** Apply a seeded draft's changes to the live roster. Throws if any conflicting cell is left unresolved. */
export async function mergeCtoRosterDraft(
  draftId: number,
  resolutions:
    | { memberId: number; shiftDate: string; resolution: "draft" | "live" }[]
    | undefined,
  updatedBy?: number
): Promise<{ applied: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const draft = await getCtoRosterDraftById(draftId);
  assertDraftUsable(draft, "merged");
  const snapshot: Record<
    string,
    { shiftCode: string; shiftTime?: string | null }
  > = draft.seedSnapshot ? JSON.parse(draft.seedSnapshot) : {};
  const liveShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        gte(ctoRosterShifts.shiftDate, draft.startDate),
        lte(ctoRosterShifts.shiftDate, draft.endDate)
      )
    );
  const liveMap = new Map(
    liveShifts.map(s => [`${s.memberId}_${s.shiftDate}`, s])
  );
  const draftShiftRows = await db
    .select()
    .from(ctoRosterDraftShifts)
    .where(eq(ctoRosterDraftShifts.draftId, draftId));
  const resolutionMap = new Map(
    (resolutions ?? []).map(r => [`${r.memberId}_${r.shiftDate}`, r.resolution])
  );

  let applied = 0,
    skipped = 0,
    conflicts = 0;
  for (const ds of draftShiftRows) {
    const key = `${ds.memberId}_${ds.shiftDate}`;
    const live = liveMap.get(key);
    const liveCode = live?.shiftCode ?? "";
    if (liveCode === "l" || liveCode === "c") {
      skipped++;
      continue;
    }
    if (
      ds.shiftCode === liveCode &&
      (ds.shiftTime ?? null) === (live?.shiftTime ?? null)
    ) {
      skipped++;
      continue;
    }
    const seededCode = snapshot[key]?.shiftCode ?? "";
    if (liveCode !== seededCode) {
      const res = resolutionMap.get(key);
      if (!res) {
        conflicts++;
        continue;
      }
      if (res === "live") {
        skipped++;
        continue;
      }
    }
    await upsertCtoRosterShift(
      ds.memberId,
      ds.shiftDate,
      ds.shiftCode,
      updatedBy,
      ds.comment ?? undefined,
      ds.isActing,
      ds.shiftTime ?? undefined
    );
    applied++;
  }
  if (conflicts > 0)
    throw new Error(
      `${conflicts} unresolved conflict(s). Resolve all conflicts before merging.`
    );
  return { applied, skipped };
}

// ── Standalone draft teams/members (free-text — see schema comment) ────────────

export async function getCtoRosterDraftTeamsAndMembers(draftId: number) {
  const db = await getDb();
  if (!db) return { teams: [], members: [] };
  const [teams, members] = await Promise.all([
    db
      .select()
      .from(ctoRosterDraftTeams)
      .where(eq(ctoRosterDraftTeams.draftId, draftId))
      .orderBy(asc(ctoRosterDraftTeams.sortOrder)),
    db
      .select()
      .from(ctoRosterDraftMembers)
      .where(eq(ctoRosterDraftMembers.draftId, draftId))
      .orderBy(asc(ctoRosterDraftMembers.sortOrder)),
  ]);
  return { teams, members };
}

export async function addCtoRosterDraftTeam(
  draftId: number,
  name: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterDraftTeams.sortOrder) })
    .from(ctoRosterDraftTeams)
    .where(eq(ctoRosterDraftTeams.draftId, draftId));
  const [result] = await db
    .insert(ctoRosterDraftTeams)
    .values({ draftId, name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterDraftTeam(
  teamId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterDraftTeams)
    .set({ name })
    .where(eq(ctoRosterDraftTeams.id, teamId));
}

export async function deleteCtoRosterDraftTeam(
  teamId: number,
  draftId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const teamMembers = await db
    .select({ id: ctoRosterDraftMembers.id })
    .from(ctoRosterDraftMembers)
    .where(
      and(
        eq(ctoRosterDraftMembers.teamId, teamId),
        eq(ctoRosterDraftMembers.draftId, draftId)
      )
    );
  if (teamMembers.length > 0) {
    const memberIds = teamMembers.map(m => m.id);
    await db
      .delete(ctoRosterDraftShifts)
      .where(
        and(
          eq(ctoRosterDraftShifts.draftId, draftId),
          inArray(ctoRosterDraftShifts.memberId, memberIds)
        )
      );
    await db
      .delete(ctoRosterDraftMembers)
      .where(inArray(ctoRosterDraftMembers.id, memberIds));
  }
  await db
    .delete(ctoRosterDraftTeams)
    .where(eq(ctoRosterDraftTeams.id, teamId));
}

export async function addCtoRosterDraftMember(
  draftId: number,
  teamId: number,
  name: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterDraftMembers.sortOrder) })
    .from(ctoRosterDraftMembers)
    .where(
      and(
        eq(ctoRosterDraftMembers.draftId, draftId),
        eq(ctoRosterDraftMembers.teamId, teamId)
      )
    );
  const [result] = await db
    .insert(ctoRosterDraftMembers)
    .values({ draftId, teamId, name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterDraftMember(
  memberId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterDraftMembers)
    .set({ name })
    .where(eq(ctoRosterDraftMembers.id, memberId));
}

export async function deleteCtoRosterDraftMember(
  memberId: number,
  draftId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(ctoRosterDraftShifts)
    .where(
      and(
        eq(ctoRosterDraftShifts.draftId, draftId),
        eq(ctoRosterDraftShifts.memberId, memberId)
      )
    );
  await db
    .delete(ctoRosterDraftMembers)
    .where(eq(ctoRosterDraftMembers.id, memberId));
}

export async function moveCtoRosterDraftMember(
  memberId: number,
  newTeamId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterDraftMembers)
    .set({ teamId: newTeamId })
    .where(eq(ctoRosterDraftMembers.id, memberId));
}

/** Copy a standalone draft's teams/members/shifts into a new named saved roster (archive snapshot). */
export async function saveCtoRosterDraftAsRoster(
  draftId: number,
  name: string,
  createdBy?: number,
  createdByName?: string | null
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const draft = await getCtoRosterDraftById(draftId);
  if (!draft) throw new Error("Draft not found.");

  const [rResult] = await db.insert(ctoRosterSavedRosters).values({
    name,
    startDate: draft.startDate,
    endDate: draft.endDate,
    createdBy: createdBy ?? null,
    createdByName: createdByName ?? null,
  });
  const savedRosterId = rResult.insertId as number;

  const dTeams = await db
    .select()
    .from(ctoRosterDraftTeams)
    .where(eq(ctoRosterDraftTeams.draftId, draftId));
  const teamIdMap = new Map<number, number>();
  for (const t of dTeams) {
    const [tResult] = await db
      .insert(ctoRosterSavedRosterTeams)
      .values({ savedRosterId, name: t.name, sortOrder: t.sortOrder });
    teamIdMap.set(t.id, tResult.insertId as number);
  }

  const dMembers = await db
    .select()
    .from(ctoRosterDraftMembers)
    .where(eq(ctoRosterDraftMembers.draftId, draftId));
  const memberIdMap = new Map<number, number>();
  for (const m of dMembers) {
    const newTeamId = teamIdMap.get(m.teamId) ?? 0;
    const [mResult] = await db.insert(ctoRosterSavedRosterMembers).values({
      savedRosterId,
      teamId: newTeamId,
      name: m.name,
      sortOrder: m.sortOrder,
    });
    memberIdMap.set(m.id, mResult.insertId as number);
  }

  const dShifts = await db
    .select()
    .from(ctoRosterDraftShifts)
    .where(eq(ctoRosterDraftShifts.draftId, draftId));
  const CHUNK = 200;
  for (let i = 0; i < dShifts.length; i += CHUNK) {
    const chunk = dShifts.slice(i, i + CHUNK);
    const rows = chunk.map(s => ({
      savedRosterId,
      memberId: memberIdMap.get(s.memberId) ?? s.memberId,
      shiftDate: s.shiftDate,
      shiftCode: s.shiftCode,
      shiftTime: s.shiftTime ?? null,
      comment: s.comment ?? null,
      isActing: s.isActing ?? false,
      updatedBy: createdBy ?? null,
    }));
    if (rows.length > 0)
      await db.insert(ctoRosterSavedRosterShifts).values(rows);
  }

  return savedRosterId;
}

// ── Saved Rosters (named point-in-time archive/export) ─────────────────────────
// Own free-text teams/members (not CIN-linked — see schema comment): a saved
// roster is a frozen snapshot, so it must keep the display names as they were
// at save time even if the underlying RunLog user's name later changes.

export async function getAllCtoRosterSavedRosters(): Promise<
  CtoRosterSavedRoster[]
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ctoRosterSavedRosters)
    .orderBy(desc(ctoRosterSavedRosters.createdAt));
}

export async function getCtoRosterSavedRosterById(
  id: number
): Promise<CtoRosterSavedRoster | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(ctoRosterSavedRosters)
    .where(eq(ctoRosterSavedRosters.id, id));
  return rows[0];
}

export async function deleteCtoRosterSavedRoster(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(ctoRosterSavedRosterShifts)
    .where(eq(ctoRosterSavedRosterShifts.savedRosterId, id));
  await db
    .delete(ctoRosterSavedRosterMembers)
    .where(eq(ctoRosterSavedRosterMembers.savedRosterId, id));
  await db
    .delete(ctoRosterSavedRosterTeams)
    .where(eq(ctoRosterSavedRosterTeams.savedRosterId, id));
  await db
    .delete(ctoRosterSavedRosters)
    .where(eq(ctoRosterSavedRosters.id, id));
}

export async function renameCtoRosterSavedRoster(
  id: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosters)
    .set({ name })
    .where(eq(ctoRosterSavedRosters.id, id));
}

export async function setCtoRosterSavedRosterTimeframe(
  id: number,
  startDate: string,
  endDate: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosters)
    .set({ startDate, endDate })
    .where(eq(ctoRosterSavedRosters.id, id));
}

export async function getCtoRosterSavedRosterTeamsAndMembers(
  savedRosterId: number
) {
  const db = await getDb();
  if (!db) return { teams: [], members: [] };
  const [teams, members] = await Promise.all([
    db
      .select()
      .from(ctoRosterSavedRosterTeams)
      .where(eq(ctoRosterSavedRosterTeams.savedRosterId, savedRosterId))
      .orderBy(asc(ctoRosterSavedRosterTeams.sortOrder)),
    db
      .select()
      .from(ctoRosterSavedRosterMembers)
      .where(eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId))
      .orderBy(asc(ctoRosterSavedRosterMembers.sortOrder)),
  ]);
  return { teams, members };
}

export async function getCtoRosterSavedRosterShifts(savedRosterId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ctoRosterSavedRosterShifts)
    .where(eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId));
}

export async function upsertCtoRosterSavedRosterShift(
  savedRosterId: number,
  memberId: number,
  shiftDate: string,
  shiftCode: string,
  updatedBy?: number,
  comment?: string | null,
  isActing?: boolean,
  shiftTime?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (shiftCode === "") {
    await db
      .delete(ctoRosterSavedRosterShifts)
      .where(
        and(
          eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
          eq(ctoRosterSavedRosterShifts.memberId, memberId),
          eq(ctoRosterSavedRosterShifts.shiftDate, shiftDate)
        )
      );
    return;
  }
  await db
    .insert(ctoRosterSavedRosterShifts)
    .values({
      savedRosterId,
      memberId,
      shiftDate,
      shiftCode,
      shiftTime: shiftTime ?? null,
      comment: comment ?? null,
      isActing: isActing ?? false,
      updatedBy,
    })
    .onDuplicateKeyUpdate({
      set: {
        shiftCode,
        shiftTime: shiftTime ?? null,
        comment: comment ?? null,
        isActing: isActing ?? false,
        updatedBy,
      },
    });
}

export async function bulkUpsertCtoRosterSavedRosterShifts(
  savedRosterId: number,
  shifts: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    shiftTime?: string | null;
    isActing?: boolean;
  }[],
  updatedBy?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const s of shifts) {
    if (s.shiftCode === "") {
      await db
        .delete(ctoRosterSavedRosterShifts)
        .where(
          and(
            eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
            eq(ctoRosterSavedRosterShifts.memberId, s.memberId),
            eq(ctoRosterSavedRosterShifts.shiftDate, s.shiftDate)
          )
        );
    } else {
      await db
        .insert(ctoRosterSavedRosterShifts)
        .values({
          savedRosterId,
          memberId: s.memberId,
          shiftDate: s.shiftDate,
          shiftCode: s.shiftCode,
          shiftTime: s.shiftTime ?? null,
          isActing: s.isActing ?? false,
          updatedBy,
        })
        .onDuplicateKeyUpdate({
          set: {
            shiftCode: s.shiftCode,
            shiftTime: s.shiftTime ?? null,
            isActing: s.isActing ?? false,
            updatedBy,
          },
        });
    }
  }
}

export async function addCtoRosterSavedRosterTeam(
  savedRosterId: number,
  name: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterSavedRosterTeams.sortOrder) })
    .from(ctoRosterSavedRosterTeams)
    .where(eq(ctoRosterSavedRosterTeams.savedRosterId, savedRosterId));
  const [result] = await db
    .insert(ctoRosterSavedRosterTeams)
    .values({ savedRosterId, name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterSavedRosterTeam(
  teamId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosterTeams)
    .set({ name })
    .where(eq(ctoRosterSavedRosterTeams.id, teamId));
}

export async function deleteCtoRosterSavedRosterTeam(
  teamId: number,
  savedRosterId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const teamMembers = await db
    .select({ id: ctoRosterSavedRosterMembers.id })
    .from(ctoRosterSavedRosterMembers)
    .where(
      and(
        eq(ctoRosterSavedRosterMembers.teamId, teamId),
        eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId)
      )
    );
  if (teamMembers.length > 0) {
    const memberIds = teamMembers.map(m => m.id);
    await db
      .delete(ctoRosterSavedRosterShifts)
      .where(
        and(
          eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
          inArray(ctoRosterSavedRosterShifts.memberId, memberIds)
        )
      );
    await db
      .delete(ctoRosterSavedRosterMembers)
      .where(inArray(ctoRosterSavedRosterMembers.id, memberIds));
  }
  await db
    .delete(ctoRosterSavedRosterTeams)
    .where(eq(ctoRosterSavedRosterTeams.id, teamId));
}

export async function addCtoRosterSavedRosterMember(
  savedRosterId: number,
  teamId: number,
  name: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterSavedRosterMembers.sortOrder) })
    .from(ctoRosterSavedRosterMembers)
    .where(
      and(
        eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId),
        eq(ctoRosterSavedRosterMembers.teamId, teamId)
      )
    );
  const [result] = await db
    .insert(ctoRosterSavedRosterMembers)
    .values({ savedRosterId, teamId, name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterSavedRosterMember(
  memberId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosterMembers)
    .set({ name })
    .where(eq(ctoRosterSavedRosterMembers.id, memberId));
}

export async function deleteCtoRosterSavedRosterMember(
  memberId: number,
  savedRosterId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(ctoRosterSavedRosterShifts)
    .where(
      and(
        eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
        eq(ctoRosterSavedRosterShifts.memberId, memberId)
      )
    );
  await db
    .delete(ctoRosterSavedRosterMembers)
    .where(eq(ctoRosterSavedRosterMembers.id, memberId));
}

export async function moveCtoRosterSavedRosterMember(
  memberId: number,
  newTeamId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosterMembers)
    .set({ teamId: newTeamId })
    .where(eq(ctoRosterSavedRosterMembers.id, memberId));
}

// ── EA Compliance (EBA rule engine) ─────────────────────────────────────────────

/** Default rule set, seeded into the DB on first read so the engine has something to run. */
const DEFAULT_EBA_RULES: Omit<
  CtoRosterEbaRule,
  "id" | "createdAt" | "updatedAt"
>[] = [
  {
    ruleKey: "max_continuous_hours",
    title: "Maximum continuous hours per shift",
    description: "No more than 12 continuous hours in one shift.",
    eaReference: "s.33(11)",
    thresholdValue: 12,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_hours_7day",
    title: "Maximum hours in a 7-day period",
    description: "No more than 60 hours worked in any rolling 7-day period.",
    eaReference: "s.33(12)",
    thresholdValue: 60,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_consecutive_shifts_10h",
    title: "Maximum consecutive shifts of 10+ hours",
    description:
      "No more than 6 consecutive shifts of 10h, or 5 consecutive shifts over 10h.",
    eaReference: "s.33(13)",
    thresholdValue: 6,
    thresholdValue2: 5,
    isActive: true,
  },
  {
    ruleKey: "max_consecutive_days",
    title: "Maximum consecutive working days",
    description:
      "No 10+ consecutive working days (>6h each) without two consecutive rest days after.",
    eaReference: "s.33(14)",
    thresholdValue: 9,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_rest_after_8_14h",
    title: "Minimum rest after an 8-14h shift",
    description:
      "At least 11 hours rest required after a shift of 8 to 14 hours.",
    eaReference: "s.33(15a)",
    thresholdValue: 11,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_rest_after_14_18h",
    title: "Minimum rest after a 14-18h shift",
    description:
      "At least 14 hours rest required after a shift of 14 to 18 hours.",
    eaReference: "s.33(15b)",
    thresholdValue: 14,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_rest_after_18h",
    title: "Minimum rest after an 18h+ shift",
    description:
      "At least 24 hours rest required after a shift of 18 hours or more.",
    eaReference: "s.33(15c)",
    thresholdValue: 24,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_weekend_frequency",
    title: "Maximum weekend work frequency",
    description: "Average no more than 1 in 2 weekends worked over the period.",
    eaReference: "s.33(17)",
    thresholdValue: null,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_oncall_28day",
    title: "Maximum on-call days in a 28-day period",
    description: "No more than 7 on-call days in any rolling 28-day period.",
    eaReference: "s.42(3)",
    thresholdValue: 7,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "oncall_sequence",
    title: "On-call weekend sequence",
    description:
      "On-call weekend blocks must follow adoc(Fri) → o(Sat) → o(Sun) → doc(Mon).",
    eaReference: "Operational",
    thresholdValue: null,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_shift_length",
    title: "Minimum shift length",
    description:
      "No shift rostered for less than 8 hours, unless supervisor agreement exists.",
    eaReference: "s.25(8)",
    thresholdValue: 8,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "oncall_while_on_leave",
    title: "On-call while on leave",
    description: "An employee cannot be on-call while on any form of leave.",
    eaReference: "s.42(6)",
    thresholdValue: null,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "training_consecutive_days",
    title: "Maximum consecutive training days",
    description:
      "Training in excess of 10 consecutive days (≥6h each) triggers additional pay.",
    eaReference: "s.30(5b)",
    thresholdValue: 10,
    thresholdValue2: null,
    isActive: true,
  },
];

async function ensureCtoRosterEbaRulesSeeded(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ ruleKey: ctoRosterEbaRules.ruleKey })
    .from(ctoRosterEbaRules);
  const existingKeys = new Set(existing.map(r => r.ruleKey));
  const missing = DEFAULT_EBA_RULES.filter(r => !existingKeys.has(r.ruleKey));
  if (missing.length > 0) await db.insert(ctoRosterEbaRules).values(missing);
}

export async function getAllCtoRosterEbaRules(): Promise<CtoRosterEbaRule[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureCtoRosterEbaRulesSeeded();
  return db.select().from(ctoRosterEbaRules).orderBy(ctoRosterEbaRules.id);
}

export async function updateCtoRosterEbaRule(
  id: number,
  updates: {
    isActive?: boolean;
    thresholdValue?: number | null;
    thresholdValue2?: number | null;
    description?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const set: Partial<CtoRosterEbaRule> = {};
  if (updates.isActive !== undefined) set.isActive = updates.isActive;
  if (updates.thresholdValue !== undefined)
    set.thresholdValue = updates.thresholdValue;
  if (updates.thresholdValue2 !== undefined)
    set.thresholdValue2 = updates.thresholdValue2;
  if (updates.description !== undefined) set.description = updates.description;
  await db
    .update(ctoRosterEbaRules)
    .set(set)
    .where(eq(ctoRosterEbaRules.id, id));
}

export type CtoRosterEbaScope = "main" | "draft" | "custom" | "saved";

/**
 * Run the EA compliance engine against live shifts, a draft, a saved roster,
 * or an arbitrary custom date range on the live roster.
 */
export async function runCtoRosterEbaCheck(
  scope: CtoRosterEbaScope,
  draftId?: number,
  savedRosterId?: number,
  startDate?: string,
  endDate?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rules = await getAllCtoRosterEbaRules();

  let rawShifts: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    shiftTime: string | null;
  }[];
  let memberMap = new Map<number, string>();

  if (scope === "main" || scope === "custom") {
    const allMembers = await getAllCtoRosterMembers();
    memberMap = new Map(allMembers.map(m => [m.id, m.name]));
    const conditions = [];
    if (startDate) conditions.push(gte(ctoRosterShifts.shiftDate, startDate));
    if (endDate) conditions.push(lte(ctoRosterShifts.shiftDate, endDate));
    rawShifts = await db
      .select({
        memberId: ctoRosterShifts.memberId,
        shiftDate: ctoRosterShifts.shiftDate,
        shiftCode: ctoRosterShifts.shiftCode,
        shiftTime: ctoRosterShifts.shiftTime,
      })
      .from(ctoRosterShifts)
      .where(conditions.length ? and(...conditions) : undefined);
  } else if (scope === "draft") {
    if (!draftId) throw new Error("draftId required for draft scope");
    const allMembers = await getAllCtoRosterMembers();
    memberMap = new Map(allMembers.map(m => [m.id, m.name]));
    const dMems = await db
      .select()
      .from(ctoRosterDraftMembers)
      .where(eq(ctoRosterDraftMembers.draftId, draftId));
    for (const m of dMems) memberMap.set(m.id, m.name);
    rawShifts = await db
      .select({
        memberId: ctoRosterDraftShifts.memberId,
        shiftDate: ctoRosterDraftShifts.shiftDate,
        shiftCode: ctoRosterDraftShifts.shiftCode,
        shiftTime: ctoRosterDraftShifts.shiftTime,
      })
      .from(ctoRosterDraftShifts)
      .where(eq(ctoRosterDraftShifts.draftId, draftId));
  } else {
    if (!savedRosterId)
      throw new Error("savedRosterId required for saved scope");
    const sMembers = await db
      .select()
      .from(ctoRosterSavedRosterMembers)
      .where(eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId));
    memberMap = new Map(sMembers.map(m => [m.id, m.name]));
    rawShifts = await db
      .select({
        memberId: ctoRosterSavedRosterShifts.memberId,
        shiftDate: ctoRosterSavedRosterShifts.shiftDate,
        shiftCode: ctoRosterSavedRosterShifts.shiftCode,
        shiftTime: ctoRosterSavedRosterShifts.shiftTime,
      })
      .from(ctoRosterSavedRosterShifts)
      .where(eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId));
  }

  const shiftRecords: ShiftRecord[] = rawShifts.map(s => ({
    memberId: s.memberId,
    memberName: memberMap.get(s.memberId) ?? `Member ${s.memberId}`,
    shiftDate: s.shiftDate,
    shiftCode: s.shiftCode,
    shiftTime: s.shiftTime,
  }));

  const findings = runEbaChecks(shiftRecords, rules);
  const missingTime = shiftRecords.filter(
    s => computeShiftInterval(s.shiftCode, s.shiftTime).missingRequiredTime
  );

  return {
    findings,
    checkedShifts: shiftRecords.length,
    missingTimeWarnings: missingTime.map(s => ({
      memberName: s.memberName,
      shiftDate: s.shiftDate,
      shiftCode: s.shiftCode,
    })),
  };
}

// ── Outlook Settings (team coverage minimums) ───────────────────────────────────

const DEFAULT_OUTLOOK_SETTINGS: {
  teamMinimums: Record<string, number>;
  onCallMin: number;
  combinedMin: number;
} = {
  teamMinimums: { "Team 1": 5, "Team 2": 5 },
  onCallMin: 5,
  combinedMin: 5,
};

export async function getCtoRosterOutlookSettings() {
  const db = await getDb();
  if (!db) return DEFAULT_OUTLOOK_SETTINGS;
  const rows = await db.select().from(ctoRosterOutlookSettings).limit(1);
  if (rows.length === 0) return DEFAULT_OUTLOOK_SETTINGS;
  const row = rows[0];
  let teamMinimums: Record<string, number>;
  try {
    teamMinimums = JSON.parse(row.teamMinimums);
  } catch {
    teamMinimums = DEFAULT_OUTLOOK_SETTINGS.teamMinimums;
  }
  return {
    teamMinimums,
    onCallMin: row.onCallMin,
    combinedMin: row.combinedMin,
  };
}

export async function updateCtoRosterOutlookSettings(
  teamMinimums: Record<string, number>,
  onCallMin: number,
  combinedMin: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(ctoRosterOutlookSettings).limit(1);
  const teamMinimumsJson = JSON.stringify(teamMinimums);
  if (rows.length === 0) {
    await db
      .insert(ctoRosterOutlookSettings)
      .values({ teamMinimums: teamMinimumsJson, onCallMin, combinedMin });
  } else {
    await db
      .update(ctoRosterOutlookSettings)
      .set({ teamMinimums: teamMinimumsJson, onCallMin, combinedMin })
      .where(eq(ctoRosterOutlookSettings.id, rows[0].id));
  }
}

// ── Audit Log ────────────────────────────────────────────────────────────────

export async function getCtoRosterAuditLog(
  limit: number,
  offset: number,
  userId?: number,
  action?: string
): Promise<{ entries: CtoRosterAuditLog[]; total: number }> {
  const db = await getDb();
  if (!db) return { entries: [], total: 0 };
  const conditions = [];
  if (userId) conditions.push(eq(ctoRosterAuditLog.userId, userId));
  if (action) conditions.push(eq(ctoRosterAuditLog.action, action));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [entries, [{ total }]] = await Promise.all([
    db
      .select()
      .from(ctoRosterAuditLog)
      .where(where)
      .orderBy(desc(ctoRosterAuditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(ctoRosterAuditLog).where(where),
  ]);
  return { entries, total: Number(total) };
}

// ── Repeat Cycle → Team ──────────────────────────────────────────────────────
// Takes a source member's already-entered shift pattern (whatever contiguous
// span they have, e.g. a 2-week rotation), tiles it forward to a chosen end
// date, and optionally copies the resulting calendar to every other member of
// the same team. Used for e.g. "Strop has a 2-week cycle entered — repeat it
// for the rest of the year and copy it to the rest of Team 1."

function addDaysToDateStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function daysBetweenDateStrs(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db_ = Date.UTC(by, bm - 1, bd);
  return Math.round((db_ - da) / 86_400_000);
}

type CyclePatternDay = {
  shiftCode: string;
  shiftTime: string | null;
  comment: string | null;
  isActing: boolean;
} | null;

export interface RepeatCtoRosterCycleResult {
  cycleStart: string;
  cycleEnd: string;
  cycleLengthDays: number;
  daysFilledForSource: number;
  membersUpdated: number;
}

export interface CtoRosterCyclePreviewDay {
  date: string;
  shiftCode: string;
  shiftTime: string | null;
}

export interface CtoRosterCyclePreview {
  cycleStart: string;
  cycleEnd: string;
  cycleLengthDays: number;
  pattern: CtoRosterCyclePreviewDay[];
}

/**
 * The cycle boundary is the earliest-to-latest shift that actually has a real
 * code — a stray blank/cleared cell at either edge (e.g. from testing a cell
 * and clicking "Clear") must not silently stretch or shrink the detected
 * cycle length, since that throws off every date after it once repeated.
 */
function detectCycleBoundary(
  shifts: { shiftDate: string; shiftCode: string }[]
): { cycleStart: string; cycleEnd: string; cycleLengthDays: number } {
  const codedDates = shifts
    .filter(s => s.shiftCode !== "")
    .map(s => s.shiftDate)
    .sort();
  if (codedDates.length === 0) {
    throw new Error(
      "This member has no shifts entered yet — nothing to repeat."
    );
  }
  const cycleStart = codedDates[0];
  const cycleEnd = codedDates[codedDates.length - 1];
  const cycleLengthDays = daysBetweenDateStrs(cycleStart, cycleEnd) + 1;
  if (cycleLengthDays < 1 || cycleLengthDays > 90) {
    throw new Error(
      `Detected cycle looks wrong (${cycleLengthDays} days, ${cycleStart} to ${cycleEnd}) — check this member's existing shifts.`
    );
  }
  return { cycleStart, cycleEnd, cycleLengthDays };
}

/**
 * Read-only preview of a member's detected cycle, for the admin to check
 * (and, if needed, override) before actually applying the repeat.
 */
export async function detectCtoRosterCycle(
  memberId: number
): Promise<CtoRosterCyclePreview> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const shifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(eq(ctoRosterShifts.memberId, memberId));
  const { cycleStart, cycleEnd, cycleLengthDays } = detectCycleBoundary(shifts);
  const byDate = new Map(shifts.map(s => [s.shiftDate, s]));
  const pattern: CtoRosterCyclePreviewDay[] = [];
  for (let i = 0; i < cycleLengthDays; i++) {
    const d = addDaysToDateStr(cycleStart, i);
    const s = byDate.get(d);
    pattern.push({
      date: d,
      shiftCode: s?.shiftCode ?? "",
      shiftTime: s?.shiftTime ?? null,
    });
  }
  return { cycleStart, cycleEnd, cycleLengthDays, pattern };
}

/**
 * Repeats a member's existing cycle forward to fillUntilDate — for the
 * source member themselves, and optionally for every other member of the
 * same team. The cycle boundary auto-detects from the member's coded shifts
 * (see detectCycleBoundary) unless cycleStartOverride/cycleEndOverride are
 * given, which the admin can supply after reviewing the detected preview.
 */
export async function repeatCtoRosterCycle(
  sourceMemberId: number,
  fillUntilDate: string,
  copyToTeam: boolean,
  updatedBy?: number,
  cycleStartOverride?: string,
  cycleEndOverride?: string
): Promise<RepeatCtoRosterCycleResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const sourceShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(eq(ctoRosterShifts.memberId, sourceMemberId));
  if (sourceShifts.length === 0) {
    throw new Error(
      "This member has no shifts entered yet — nothing to repeat."
    );
  }

  let cycleStart: string;
  let cycleEnd: string;
  let cycleLengthDays: number;
  if (cycleStartOverride && cycleEndOverride) {
    cycleStart = cycleStartOverride;
    cycleEnd = cycleEndOverride;
    cycleLengthDays = daysBetweenDateStrs(cycleStart, cycleEnd) + 1;
    if (cycleLengthDays < 1 || cycleLengthDays > 90) {
      throw new Error(
        `Cycle length looks wrong (${cycleLengthDays} days, ${cycleStart} to ${cycleEnd}).`
      );
    }
  } else {
    ({ cycleStart, cycleEnd, cycleLengthDays } =
      detectCycleBoundary(sourceShifts));
  }
  if (fillUntilDate <= cycleEnd) {
    throw new Error(
      `Fill-until date must be after the end of the existing cycle (${cycleEnd}).`
    );
  }

  const byDate = new Map(sourceShifts.map(s => [s.shiftDate, s]));
  const pattern: CyclePatternDay[] = [];
  for (let i = 0; i < cycleLengthDays; i++) {
    const d = addDaysToDateStr(cycleStart, i);
    const s = byDate.get(d);
    pattern.push(
      s
        ? {
            shiftCode: s.shiftCode,
            shiftTime: s.shiftTime,
            comment: s.comment,
            isActing: s.isActing ?? false,
          }
        : null
    );
  }

  const writeDay = async (
    memberId: number,
    shiftDate: string,
    day: CyclePatternDay
  ) => {
    if (!day) return;
    await db
      .insert(ctoRosterShifts)
      .values({
        memberId,
        shiftDate,
        shiftCode: day.shiftCode,
        shiftTime: day.shiftTime,
        comment: day.comment,
        isActing: day.isActing,
        updatedBy,
      })
      .onDuplicateKeyUpdate({
        set: {
          shiftCode: day.shiftCode,
          shiftTime: day.shiftTime,
          comment: day.comment,
          isActing: day.isActing,
          updatedBy,
        },
      });
  };

  // Fill the source member forward from the end of their existing cycle.
  let daysFilledForSource = 0;
  let cursor = addDaysToDateStr(cycleEnd, 1);
  while (cursor <= fillUntilDate) {
    const offset = daysBetweenDateStrs(cycleStart, cursor) % cycleLengthDays;
    const day = pattern[offset];
    if (day) {
      await writeDay(sourceMemberId, cursor, day);
      daysFilledForSource++;
    }
    cursor = addDaysToDateStr(cursor, 1);
  }

  // Copy the complete cycle (start to fillUntilDate) to the rest of the team.
  let membersUpdated = 0;
  if (copyToTeam) {
    const members = await getAllCtoRosterMembers();
    const sourceMember = members.find(m => m.id === sourceMemberId);
    if (!sourceMember) throw new Error("Member not found");
    const teammates = members.filter(
      m => m.teamId === sourceMember.teamId && m.id !== sourceMemberId
    );
    for (const teammate of teammates) {
      let d = cycleStart;
      while (d <= fillUntilDate) {
        const offset = daysBetweenDateStrs(cycleStart, d) % cycleLengthDays;
        await writeDay(teammate.id, d, pattern[offset]);
        d = addDaysToDateStr(d, 1);
      }
      membersUpdated++;
    }
  }

  return {
    cycleStart,
    cycleEnd,
    cycleLengthDays,
    daysFilledForSource,
    membersUpdated,
  };
}
