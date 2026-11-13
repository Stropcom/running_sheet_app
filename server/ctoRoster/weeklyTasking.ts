// Part of the target queries (server/ctoRoster.ts): the weekly tasking report and the roster-to-tasking sync.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  getOpManagerPriorityBoard,
  getOpManagerTaskingCalendar,
  getOutstandingTodosByUser,
} from "../db";
import { rosterCommand } from "../rosterContext";
import {
  planTaskingRosterSync,
  type SyncChange,
  type SyncTarget,
} from "../../shared/taskingRosterSync";
import { addDaysToDateStr } from "../ctoRosterDates";
import {
  writeCtoRosterAudit,
  getAllCtoRosterTeams,
  getAllCtoRosterMembers,
  getRelevantCtoRosterSecondments,
  upsertRosterShiftNotification,
  getCtoRosterShiftsForDateRange,
  upsertCtoRosterShift,
} from "./liveRoster";
import { getCtoRosterOutlookSettings } from "./outlookAndAudit";

// ─── Weekly Tasking Report ───────────────────────────────────────────────────
// "What the unit can do next week" — priority board, day-by-day tasking grid,
// team deployability risk, and outstanding governance actions, all for a
// given Monday-start week.

const ON_DUTY_CODES = new Set(["d", "a", "ad", "adoc", "aoc", "doc"]);
const DEFAULT_TEAM_MIN = 3;

export interface WeeklyTaskingPriorityRow {
  category: string;
  priority: number;
  operationName: string | null;
  team: string | null;
  requestType: string | null;
}

export interface WeeklyTaskingCell {
  dayIndex: number;
  teamRow: string;
  shiftTime: string | null;
  primaryTask: string | null;
  secondaryTask: string | null;
}

export interface WeeklyTaskingDeployability {
  date: string;
  teamName: string;
  onDuty: number;
  min: number;
  deployable: boolean;
}

export interface WeeklyTaskingOutstandingTodo {
  cin: string;
  name: string;
  totalCount: number;
}

export interface WeeklyTaskingReport {
  weekStart: string;
  weekEnd: string;
  priorityRows: WeeklyTaskingPriorityRow[];
  taskingCells: WeeklyTaskingCell[];
  deployability: WeeklyTaskingDeployability[];
  atRiskDayCount: number;
  outstandingTodos: WeeklyTaskingOutstandingTodo[];
}

/** weekStart is a Monday, YYYY-MM-DD.
 *
 * Deployability here is a simplified read of the same on-duty-vs-minimum
 * check the live Outlook coverage page (OutlookPage.tsx) computes — it
 * deliberately skips that page's secondment handling and blended Team
 * 1/Team 2 combined-minimum logic, since this is a weekly summary rather
 * than the live operational tool: a per-team, per-day on-duty headcount
 * against its configured minimum is enough to flag a week worth reviewing
 * there in full. */
export async function getWeeklyTaskingReport(
  weekStart: string
): Promise<WeeklyTaskingReport> {
  const weekEnd = addDaysToDateStr(weekStart, 6);

  const [
    priorityRowsRaw,
    taskingCellsRaw,
    teams,
    members,
    settings,
    shifts,
    todoUsers,
  ] = await Promise.all([
    getOpManagerPriorityBoard(weekStart),
    getOpManagerTaskingCalendar(weekStart),
    getAllCtoRosterTeams(),
    getAllCtoRosterMembers(),
    getCtoRosterOutlookSettings(),
    getCtoRosterShiftsForDateRange(weekStart, weekEnd),
    getOutstandingTodosByUser(rosterCommand()),
  ]);

  const priorityRows: WeeklyTaskingPriorityRow[] = priorityRowsRaw
    .map(r => ({
      category: r.category,
      priority: r.priority,
      operationName: r.operationName,
      team: r.team,
      requestType: r.requestType,
    }))
    .sort((a, b) => a.priority - b.priority);

  const taskingCells: WeeklyTaskingCell[] = taskingCellsRaw.map(c => ({
    dayIndex: c.dayIndex,
    teamRow: c.teamRow,
    shiftTime: c.shiftTime,
    primaryTask: c.primaryTask,
    secondaryTask: c.secondaryTask,
  }));

  const teamMinimums = settings.teamMinimums;

  const membersByTeam = new Map<number, typeof members>();
  for (const m of members) {
    if (m.excludedFromCounts) continue;
    if (!membersByTeam.has(m.teamId)) membersByTeam.set(m.teamId, []);
    membersByTeam.get(m.teamId)!.push(m);
  }
  const shiftCodeByMemberDate = new Map<string, string>();
  for (const s of shifts)
    shiftCodeByMemberDate.set(`${s.memberId}::${s.shiftDate}`, s.shiftCode);

  const deployability: WeeklyTaskingDeployability[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysToDateStr(weekStart, i);
    for (const team of teams) {
      const teamMembers = membersByTeam.get(team.id) ?? [];
      const min = teamMinimums[team.name] ?? DEFAULT_TEAM_MIN;
      const onDuty = teamMembers.filter(m =>
        ON_DUTY_CODES.has(shiftCodeByMemberDate.get(`${m.id}::${date}`) ?? "")
      ).length;
      deployability.push({
        date,
        teamName: team.name,
        onDuty,
        min,
        deployable: onDuty >= min,
      });
    }
  }
  const atRiskDayCount = new Set(
    deployability.filter(d => !d.deployable).map(d => d.date)
  ).size;

  const outstandingTodos: WeeklyTaskingOutstandingTodo[] = (
    todoUsers as { cin: string; name: string; totalCount: number }[]
  )
    .filter(u => u.totalCount > 0)
    .slice(0, 15)
    .map(u => ({ cin: u.cin, name: u.name, totalCount: u.totalCount }));

  return {
    weekStart,
    weekEnd,
    priorityRows,
    taskingCells,
    deployability,
    atRiskDayCount,
    outstandingTodos,
  };
}

// ── Carrying the CTO Weekly Tasking's start times to the roster ──────────────
// The rule (who is affected, what changes) is shared/taskingRosterSync.ts; this
// reads this Command's teams, members, secondments and shifts and applies the
// result.

/** A team's start on the tasking, as the screen sends it. */
export interface TaskingSyncInput {
  teamName: string;
  date: string;
  /** "HH:MM", or null when the tasking has no shift for the team that day. */
  start: string | null;
  /** The task is Admin (so a rest day becomes an Admin shift). */
  admin?: boolean;
}

/** Today in the unit's own time zone (the server runs on Perth time). */
const unitToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Perth" });

export async function planTaskingSyncFor(
  inputs: TaskingSyncInput[]
): Promise<SyncChange[]> {
  if (inputs.length === 0) return [];
  const teams = await getAllCtoRosterTeams();
  const teamByName = new Map(teams.map(t => [t.name.trim().toLowerCase(), t]));
  const targets: SyncTarget[] = [];
  for (const i of inputs) {
    const team = teamByName.get(i.teamName.trim().toLowerCase());
    if (!team) continue;
    if (i.start === null) {
      targets.push({
        teamId: team.id,
        teamName: team.name,
        date: i.date,
        startMinutes: null,
      });
      continue;
    }
    const [h, m] = i.start.split(":").map(Number);
    if (h > 23 || m > 59) continue;
    targets.push({
      teamId: team.id,
      teamName: team.name,
      date: i.date,
      startMinutes: h * 60 + m,
      admin: i.admin === true,
    });
  }
  if (targets.length === 0) return [];
  const dates = targets.map(t => t.date).sort();
  const [members, secondments, shifts] = await Promise.all([
    getAllCtoRosterMembers(),
    getRelevantCtoRosterSecondments(),
    getCtoRosterShiftsForDateRange(dates[0], dates[dates.length - 1]),
  ]);
  return planTaskingRosterSync({
    targets,
    members,
    secondments,
    shifts,
    today: unitToday(),
  });
}

/**
 * Applies the plan: each affected shift gets the new type and start time (its
 * comment, acting flag and length are left alone), an audit entry, and the
 * usual "Your Roster Was Updated" notice to the person (joined into one per
 * person by the existing notice logic).
 */
export async function applyTaskingSyncFor(
  inputs: TaskingSyncInput[],
  actor: { id: number; name: string | null }
): Promise<{ shifts: number; members: number }> {
  const changes = await planTaskingSyncFor(inputs);
  for (const c of changes) {
    await upsertCtoRosterShift(
      c.memberId,
      c.date,
      c.toCode,
      actor.id,
      undefined,
      undefined,
      c.storeTime,
      undefined,
      c.revertTo
    );
    await writeCtoRosterAudit({
      userId: actor.id,
      userName: actor.name,
      action: "upsert_shift",
      memberId: c.memberId,
      memberName: c.memberName,
      shiftDate: c.date,
      oldValue: JSON.stringify({
        shiftCode: c.fromCode,
        shiftTime: c.fromTime,
      }),
      newValue: JSON.stringify({ shiftCode: c.toCode, shiftTime: c.storeTime }),
      detail: c.backTo
        ? `From the CTO Weekly Tasking: ${c.teamName} has no shift, back to ${c.backTo === "o" ? "Rest on-call" : "a rest day"}`
        : `From the CTO Weekly Tasking: ${c.teamName} starts at ${c.toTime}${c.fromRest ? " (was a rest day)" : c.fromOnCall ? " (was Rest on-call)" : ""}`,
    });
  }
  const byMember = new Map<number, SyncChange[]>();
  for (const c of changes)
    byMember.set(c.memberId, [...(byMember.get(c.memberId) ?? []), c]);
  for (const [memberId, list] of Array.from(byMember)) {
    const dates = list.map(c => c.date).sort();
    await upsertRosterShiftNotification({
      memberId,
      actingUserId: actor.id,
      kind: "count",
      count: list.length,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
    }).catch(err =>
      console.warn("[Notifications] Roster shift notify failed:", err)
    );
  }
  return { shifts: changes.length, members: byMember.size };
}
