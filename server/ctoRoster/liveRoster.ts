// Part of the target queries (server/ctoRoster.ts): the live roster: teams, members, secondments, shift notifications and shifts.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, sql, gte, lte, inArray, max } from "drizzle-orm";
import {
  getDb,
  getAllUsers as getAllRunLogUsers,
  getUserByCin,
  createNotificationsForUsers,
  findRecentUnreadNotification,
  updateNotificationContent,
  visitorUserIdsOf,
} from "../db";
import {
  ctoRosterTeams,
  ctoRosterMembers,
  ctoRosterShifts,
  ctoRosterAuditLog,
  CtoRosterTeam,
  CtoRosterMember,
  CtoRosterShift,
  ctoRosterSecondments,
  CtoRosterSecondment,
} from "../../drizzle/schema";
import { rosterCommand, rosterCommandForWrite } from "../rosterContext";
import { COMMAND_LABELS, type CommandCode } from "../../shared/commands";
import { perthDateISO } from "@shared/runningSheetTitle";

// ── Per-Command scope ────────────────────────────────────────────────────────
// Each Command has its own roster (see server/rosterScope.ts). Inside a
// request, lists are limited to the request's Command and new rows are stamped
// with it; internal callers with no request see everything.

/** `command = <this request's Command>` — or nothing when there is no request. */
export function inCommand(column: Parameters<typeof eq>[0]) {
  const command = rosterCommand();
  return command ? eq(column, command) : undefined;
}

/** Limits a query on cto_roster_shifts to this Command's members. */
export async function liveShiftScope() {
  if (!rosterCommand()) return undefined;
  const members = await getAllCtoRosterMembers();
  return members.length > 0
    ? inArray(
        ctoRosterShifts.memberId,
        members.map(m => m.id)
      )
    : sql`1 = 0`;
}

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
      command: rosterCommandForWrite(),
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
  return db
    .select()
    .from(ctoRosterTeams)
    .where(inCommand(ctoRosterTeams.command))
    .orderBy(ctoRosterTeams.sortOrder);
}

export async function addCtoRosterTeam(name: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterTeams.sortOrder) })
    .from(ctoRosterTeams)
    .where(inCommand(ctoRosterTeams.command));
  const [result] = await db.insert(ctoRosterTeams).values({
    command: rosterCommandForWrite(),
    name,
    sortOrder: (maxOrder ?? -1) + 1,
  });
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
    .where(inCommand(ctoRosterMembers.command))
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

/** A person's own roster entries, whichever Commands' rosters they are on (a
 * visitor can be on their own and on a host Command's) — for "My shifts",
 * which is theirs wherever they are rostered. */
export async function getCtoRosterMembersByCin(
  cin: string
): Promise<CtoRosterMember[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ctoRosterMembers)
    .where(eq(ctoRosterMembers.cin, cin));
}

/** Toggle whether a member counts toward ON DUTY / ON CALL headcount totals. */
export async function setCtoRosterMemberExcludedFromCounts(
  memberId: number,
  excluded: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterMembers)
    .set({ excludedFromCounts: excluded })
    .where(eq(ctoRosterMembers.id, memberId));
}

type RosterEligibility = { ok: true } | { ok: false; message: string };

/** Whether a person can go on a Command's roster: they are in that Command, or
 * visiting it (given access by name, or put in one of its teams). */
async function rosterEligibility(
  command: CommandCode,
  user: { id: number; name: string; command: string }
): Promise<RosterEligibility> {
  if (user.command === command) return { ok: true };
  if ((await visitorUserIdsOf(command)).has(user.id)) return { ok: true };
  const home =
    COMMAND_LABELS[user.command as CommandCode] ?? `${user.command} Command`;
  return {
    ok: false,
    message: `${user.name} is in ${home} and isn't visiting ${COMMAND_LABELS[command]}. Give them visiting access first (User Management → Share with), then add them.`,
  };
}

export interface CtoRosterCandidate {
  cin: string;
  name: string;
  command: CommandCode;
  /** From another Command, visiting this one. */
  visiting: boolean;
}

/** Who can be added to this Command's roster and isn't on it yet: its own
 * people, then visitors from other Commands. */
export async function getCtoRosterCandidates(): Promise<CtoRosterCandidate[]> {
  const command = rosterCommandForWrite();
  const [users, onRoster, visitors] = await Promise.all([
    getAllRunLogUsers(),
    getAllCtoRosterMembers(),
    visitorUserIdsOf(command),
  ]);
  const taken = new Set(onRoster.map(m => m.cin));
  const out: CtoRosterCandidate[] = [];
  for (const u of users) {
    if (u.archivedAt || !u.cin || taken.has(u.cin)) continue;
    const home = u.command === command;
    if (!home && !visitors.has(u.id)) continue;
    out.push({
      cin: u.cin,
      name: u.name,
      command: u.command as CommandCode,
      visiting: !home,
    });
  }
  return out.sort(
    (a, b) =>
      Number(a.visiting) - Number(b.visiting) || a.name.localeCompare(b.name)
  );
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
  const command = rosterCommandForWrite();
  // Who can be on this Command's roster: its own people, and people from
  // other Commands who are visiting it.
  const eligibility = await rosterEligibility(command, user);
  if (!eligibility.ok) throw new Error(eligibility.message);
  // One place on each Command's roster. (A visitor keeps their own roster
  // place and can have one here as well.)
  const alreadyHere = await db
    .select({ id: ctoRosterMembers.id })
    .from(ctoRosterMembers)
    .where(
      and(eq(ctoRosterMembers.cin, cin), eq(ctoRosterMembers.command, command))
    )
    .limit(1);
  if (alreadyHere.length > 0) {
    throw new Error(`${user.name} is already on this roster.`);
  }
  const existing = await db
    .select()
    .from(ctoRosterMembers)
    .where(eq(ctoRosterMembers.teamId, teamId));
  const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const [result] = await db.insert(ctoRosterMembers).values({
    command,
    cin,
    teamId,
    sortOrder: maxSort + 1,
  });
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
  keepShiftCodes: string[],
  keepAllShifts = false
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterMembers)
    .set({ teamId: newTeamId })
    .where(eq(ctoRosterMembers.id, memberId));

  // "Keep and copy all shifts" — the member's whole schedule moves with
  // them to the new team as-is, so there's nothing to clear.
  if (keepAllShifts) return;

  const todayStr = perthDateISO(new Date());
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

// ── Secondments (temporary acting-team assignments) ────────────────────────

export interface CtoRosterSecondmentWithNames extends CtoRosterSecondment {
  memberName: string;
  destinationTeamName: string;
}

/**
 * Secondments that are still relevant — active now or starting in the
 * future (endDate >= today). Completed ones (endDate < today) are simply
 * left out, which is what makes the destination-team pill disappear "on
 * its own" — there's no cleanup job, every read just filters by date.
 */
export async function getRelevantCtoRosterSecondments(): Promise<
  CtoRosterSecondmentWithNames[]
> {
  const db = await getDb();
  if (!db) return [];
  const todayStr = perthDateISO(new Date());
  const [rows, members, teams] = await Promise.all([
    db
      .select()
      .from(ctoRosterSecondments)
      .where(gte(ctoRosterSecondments.endDate, todayStr)),
    getAllCtoRosterMembers(),
    db.select().from(ctoRosterTeams).where(inCommand(ctoRosterTeams.command)),
  ]);
  const memberNameById = new Map(members.map(m => [m.id, m.name]));
  const teamNameById = new Map(teams.map(t => [t.id, t.name]));
  // Only this Command's people (members is already limited to them).
  return rows
    .filter(r => !rosterCommand() || memberNameById.has(r.memberId))
    .map(r => ({
      ...r,
      memberName: memberNameById.get(r.memberId) ?? "Unknown",
      destinationTeamName: teamNameById.get(r.destinationTeamId) ?? "Unknown",
    }));
}

/** One secondment at a time per member — reject if one is already active/upcoming. */
export async function createCtoRosterSecondment(
  memberId: number,
  destinationTeamId: number,
  startDate: string,
  endDate: string,
  createdByCIN: string | null
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (startDate > endDate) {
    throw new Error("Start date must be on or before the finish date");
  }
  const todayStr = perthDateISO(new Date());
  const existing = await db
    .select({ id: ctoRosterSecondments.id })
    .from(ctoRosterSecondments)
    .where(
      and(
        eq(ctoRosterSecondments.memberId, memberId),
        gte(ctoRosterSecondments.endDate, todayStr)
      )
    );
  if (existing.length > 0) {
    throw new Error(
      "This member already has an active or upcoming secondment — edit or cancel it first"
    );
  }
  const [result] = await db.insert(ctoRosterSecondments).values({
    memberId,
    destinationTeamId,
    startDate,
    endDate,
    createdByCIN,
  });
  return result.insertId as number;
}

/** Dates (and/or destination team) change often in practice — edit in place rather than cancel+recreate. */
export async function updateCtoRosterSecondment(
  id: number,
  destinationTeamId: number,
  startDate: string,
  endDate: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (startDate > endDate) {
    throw new Error("Start date must be on or before the finish date");
  }
  await db
    .update(ctoRosterSecondments)
    .set({ destinationTeamId, startDate, endDate })
    .where(eq(ctoRosterSecondments.id, id));
}

export async function deleteCtoRosterSecondment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ctoRosterSecondments).where(eq(ctoRosterSecondments.id, id));
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

// ── Shift-change notifications ──────────────────────────────────────────────
// Reliable in-app inbox (see drizzle/schema.ts notifications comment), used
// instead of a notification per shift row so bulk edits don't spam. Coalesces
// repeated events for the same member into one bumped notification if the
// previous one is still unread and less than an hour old — while someone's
// actively re-testing a roster change, that keeps refreshing the same row
// instead of piling up new ones.
const ROSTER_NOTIF_SOURCE = "ctoRosterShift";
const ROSTER_NOTIF_COALESCE_WINDOW_MS = 60 * 60 * 1000;

function formatShiftDateShort(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

type RosterNotifyParams =
  | {
      memberId: number;
      actingUserId?: number;
      kind: "count";
      count: number;
      startDate: string;
      endDate: string;
    }
  | { memberId: number; actingUserId?: number; kind: "generic" };

interface RosterNotifMeta {
  generic?: boolean;
  count?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Notify the one RunLog user whose own roster shift(s) changed — never
 * anyone else on their team. Skips: no linked RunLog account, the person who
 * made the edit editing their own shift, the recipient having roster
 * notifications turned off, and (for "count" kind) a zero-length change
 * (no-op saves).
 */
export async function upsertRosterShiftNotification(
  params: RosterNotifyParams
): Promise<void> {
  if (params.kind === "count" && params.count <= 0) return;

  const members = await getAllCtoRosterMembers();
  const member = members.find(m => m.id === params.memberId);
  if (!member) return;
  const user = await getUserByCin(member.cin);
  if (!user) return;
  if (params.actingUserId && user.id === params.actingUserId) return;
  if (!user.rosterShiftNotificationsEnabled) return;

  const title = "Your Roster Was Updated";
  const genericBody = "Your roster was updated (including a merge).";
  const buildCountBody = (count: number, startDate: string, endDate: string) =>
    count === 1 && startDate === endDate
      ? `Your shift on ${formatShiftDateShort(startDate)} was changed.`
      : `${count} of your shifts between ${formatShiftDateShort(startDate)} and ${formatShiftDateShort(endDate)} were updated.`;

  const existing = await findRecentUnreadNotification(
    user.id,
    ROSTER_NOTIF_SOURCE,
    ROSTER_NOTIF_COALESCE_WINDOW_MS
  );

  if (existing) {
    const prevMeta: RosterNotifMeta = existing.meta
      ? JSON.parse(existing.meta)
      : {};
    // Once any generic (merge) event is folded in, stay generic — we don't
    // know its exact shift count, so a precise-looking number would be
    // misleading from here on.
    if (params.kind === "generic" || prevMeta.generic) {
      await updateNotificationContent(existing.id, {
        title,
        body: genericBody,
        meta: JSON.stringify({ generic: true } satisfies RosterNotifMeta),
      });
      return;
    }
    const count = (prevMeta.count ?? 0) + params.count;
    const startDate =
      !prevMeta.startDate || params.startDate < prevMeta.startDate
        ? params.startDate
        : prevMeta.startDate;
    const endDate =
      !prevMeta.endDate || params.endDate > prevMeta.endDate
        ? params.endDate
        : prevMeta.endDate;
    await updateNotificationContent(existing.id, {
      title,
      body: buildCountBody(count, startDate, endDate),
      meta: JSON.stringify({
        count,
        startDate,
        endDate,
      } satisfies RosterNotifMeta),
    });
    return;
  }

  const body =
    params.kind === "generic"
      ? genericBody
      : buildCountBody(params.count, params.startDate, params.endDate);
  const meta: RosterNotifMeta =
    params.kind === "generic"
      ? { generic: true }
      : {
          count: params.count,
          startDate: params.startDate,
          endDate: params.endDate,
        };
  await createNotificationsForUsers([user.id], {
    title,
    body,
    url: "/cto-roster/my-shifts",
    sourceModule: ROSTER_NOTIF_SOURCE,
    meta: JSON.stringify(meta),
  });
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
        lte(ctoRosterShifts.shiftDate, endDate),
        await liveShiftScope()
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
  shiftTime?: string | null,
  shiftDurationHours?: number | null,
  /** Only the CTO Weekly Tasking sync passes this (see `taskingRevert` in the schema); any other write clears it. */
  taskingRevert?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateSet: Record<string, unknown> = {
    shiftCode,
    updatedBy,
    taskingRevert: taskingRevert ?? null,
  };
  if (comment !== undefined) updateSet.comment = comment;
  if (isActing !== undefined) updateSet.isActing = isActing;
  if (shiftTime !== undefined) updateSet.shiftTime = shiftTime;
  if (shiftDurationHours !== undefined)
    updateSet.shiftDurationHours = shiftDurationHours;
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
      shiftDurationHours: shiftDurationHours ?? null,
      taskingRevert: taskingRevert ?? null,
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
    shiftDurationHours?: number | null;
  }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const row of rows) {
    const baseUpd: Record<string, unknown> = {
      shiftCode: row.shiftCode,
      updatedBy: row.updatedBy,
      taskingRevert: null,
    };
    if (row.isActing !== undefined) baseUpd.isActing = row.isActing;
    if (row.shiftTime !== undefined) baseUpd.shiftTime = row.shiftTime;
    if (row.shiftDurationHours !== undefined)
      baseUpd.shiftDurationHours = row.shiftDurationHours;
    const insertVals: Record<string, unknown> = {
      memberId: row.memberId,
      shiftDate: row.shiftDate,
      shiftCode: row.shiftCode,
      updatedBy: row.updatedBy,
    };
    if (row.isActing !== undefined) insertVals.isActing = row.isActing;
    if (row.shiftTime !== undefined) insertVals.shiftTime = row.shiftTime;
    if (row.shiftDurationHours !== undefined)
      insertVals.shiftDurationHours = row.shiftDurationHours;
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
): Promise<{ count: number; changedByMember: Map<number, number> }> {
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
  const changedByMember = new Map<number, number>();
  if (sourceShifts.length === 0) return { count: 0, changedByMember };
  const existingTargetShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(
      and(
        inArray(ctoRosterShifts.memberId, targetMemberIds),
        gte(ctoRosterShifts.shiftDate, startDate),
        lte(ctoRosterShifts.shiftDate, endDate)
      )
    );
  const existingByKey = new Map(
    existingTargetShifts.map(s => [`${s.memberId}_${s.shiftDate}`, s])
  );
  let count = 0;
  for (const targetId of targetMemberIds) {
    for (const s of sourceShifts) {
      const old = existingByKey.get(`${targetId}_${s.shiftDate}`);
      const changed =
        (old?.shiftCode ?? "") !== s.shiftCode ||
        (old?.comment ?? null) !== (s.comment ?? null) ||
        (old?.isActing ?? false) !== (s.isActing ?? false) ||
        (old?.shiftTime ?? null) !== (s.shiftTime ?? null) ||
        (old?.shiftDurationHours ?? null) !== (s.shiftDurationHours ?? null);
      if (changed) {
        changedByMember.set(targetId, (changedByMember.get(targetId) ?? 0) + 1);
      }
      await db
        .insert(ctoRosterShifts)
        .values({
          memberId: targetId,
          shiftDate: s.shiftDate,
          shiftCode: s.shiftCode,
          comment: s.comment,
          isActing: s.isActing ?? false,
          shiftTime: s.shiftTime,
          shiftDurationHours: s.shiftDurationHours,
          updatedBy,
        })
        .onDuplicateKeyUpdate({
          set: {
            shiftCode: s.shiftCode,
            comment: s.comment,
            isActing: s.isActing ?? false,
            shiftTime: s.shiftTime,
            shiftDurationHours: s.shiftDurationHours,
            updatedBy,
            taskingRevert: null,
          },
        });
      count++;
    }
  }
  return { count, changedByMember };
}
