import { and, eq, gte, lte, lt, inArray, desc, asc, max } from "drizzle-orm";
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
export async function getCtoRosterDraftMergeDiff(
  draftId: number
): Promise<{
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
    const [mResult] = await db
      .insert(ctoRosterSavedRosterMembers)
      .values({
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
