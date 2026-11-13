// Part of the target queries (server/ctoRoster.ts): roster drafts: the seeded and standalone drafts, their shifts, merging and saving as a roster.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, gte, lte, lt, inArray, desc, asc, max } from "drizzle-orm";
import { liveChangedSinceSeed } from "@shared/ctoRosterMerge";
import { getDb } from "../db";
import {
  ctoRosterShifts,
  ctoRosterDrafts,
  ctoRosterDraftTeams,
  ctoRosterDraftMembers,
  ctoRosterDraftShifts,
  ctoRosterSavedRosters,
  ctoRosterSavedRosterTeams,
  ctoRosterSavedRosterMembers,
  ctoRosterSavedRosterShifts,
  CtoRosterDraft,
  CtoRosterDraftShift,
  InsertCtoRosterDraftShift,
} from "../../drizzle/schema";
import { rosterCommand, rosterCommandForWrite } from "../rosterContext";
import {
  inCommand,
  liveShiftScope,
  getAllCtoRosterMembers,
  upsertCtoRosterShift,
} from "./liveRoster";

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
    .where(inCommand(ctoRosterDrafts.command))
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
    .where(
      and(eq(ctoRosterDrafts.id, draftId), inCommand(ctoRosterDrafts.command))
    );
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
        lte(ctoRosterShifts.shiftDate, endDate),
        await liveShiftScope()
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
    command: rosterCommandForWrite(),
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
    command: rosterCommandForWrite(),
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
        lte(ctoRosterShifts.shiftDate, draft.endDate),
        await liveShiftScope()
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
    diff.push({
      memberId: ds.memberId,
      memberName: nameByMemberId.get(ds.memberId) ?? String(ds.memberId),
      shiftDate: ds.shiftDate,
      draftCode,
      draftTime,
      liveCode,
      liveTime,
      isConflict: liveChangedSinceSeed(live, snapshot[key]),
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
): Promise<{ applied: number; skipped: number; affectedMemberIds: number[] }> {
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
        lte(ctoRosterShifts.shiftDate, draft.endDate),
        await liveShiftScope()
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

  // A draft can only change this Command's own members' shifts.
  const mergeableMemberIds = rosterCommand()
    ? new Set((await getAllCtoRosterMembers()).map(m => m.id))
    : null;
  // Pass 1 — decide everything, change nothing. A merge either works
  // completely or does nothing: if any conflicting cell is still unresolved
  // the whole merge is refused before a single shift is written.
  let skipped = 0,
    conflicts = 0;
  const toApply: typeof draftShiftRows = [];
  for (const ds of draftShiftRows) {
    if (mergeableMemberIds && !mergeableMemberIds.has(ds.memberId)) {
      skipped++;
      continue;
    }
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
    if (liveChangedSinceSeed(live, snapshot[key])) {
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
    toApply.push(ds);
  }
  if (conflicts > 0)
    throw new Error(
      `${conflicts} unresolved conflict(s). Resolve all conflicts before merging.`
    );

  // Pass 2 — write.
  const affectedMemberIds = new Set<number>();
  for (const ds of toApply) {
    await upsertCtoRosterShift(
      ds.memberId,
      ds.shiftDate,
      ds.shiftCode,
      updatedBy,
      ds.comment ?? undefined,
      ds.isActing,
      ds.shiftTime ?? undefined
    );
    affectedMemberIds.add(ds.memberId);
  }
  return {
    applied: toApply.length,
    skipped,
    affectedMemberIds: Array.from(affectedMemberIds),
  };
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
    command: draft.command,
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
