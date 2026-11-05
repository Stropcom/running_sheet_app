/**
 * The operation a person is tasked on, shown at the top of their roster tile.
 *
 * From the CTO Weekly Tasking: a team-day's primary operation, for weeks that
 * have been POSTED (a re-saved or re-posted week shows what is saved now, the
 * same as the tasking page does for officers). It is looked up when the roster
 * is drawn, never copied into the shift, so it follows the tasking, writes
 * nothing and notifies nobody. Shown on a tile only when the person is on duty
 * (ON_DUTY_CODES: Day, Arvo, Admin and the on-call versions) in the team that
 * is tasked; rows already sit in the team they count for (a seconded person's
 * acting row is in the destination team). Pure; tested in
 * server/rosterTaskingOps.test.ts.
 */
import { ON_DUTY_CODES } from "./ctoRosterShiftUtils";

/** The tasking's team rows and the roster team each one is. */
export const TASKING_TEAM_NAMES: Record<string, string> = {
  surv1: "Team 1",
  surv2: "Team 2",
  ptt: "PTT",
  cap: "Capability",
};

export interface TaskingCellLite {
  weekStart: string;
  dayIndex: number;
  teamRow: string;
  primaryTask: string | null;
}

export interface PostedTaskingOp {
  /** YYYY-MM-DD */
  date: string;
  teamRow: string;
  primary: string;
}

/** `date` + `n` days, as YYYY-MM-DD (UTC, no timezone slips). */
export function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The tasked operation for each team-day of the posted weeks, within the dates
 * asked for. A cell with no operation gives nothing.
 */
export function postedTaskingOps(
  cells: TaskingCellLite[],
  postedWeekStarts: ReadonlySet<string>,
  startDate: string,
  endDate: string
): PostedTaskingOp[] {
  const out: PostedTaskingOp[] = [];
  for (const c of cells) {
    if (!postedWeekStarts.has(c.weekStart)) continue;
    const primary = (c.primaryTask ?? "").trim();
    if (!primary) continue;
    const date = addDaysISO(c.weekStart, c.dayIndex);
    if (date < startDate || date > endDate) continue;
    out.push({ date, teamRow: c.teamRow, primary });
  }
  return out;
}

/** Roster team name → date → operation, for the roster to look up. */
export function opsByTeam(
  ops: readonly PostedTaskingOp[]
): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const o of ops) {
    const team = TASKING_TEAM_NAMES[o.teamRow];
    if (!team) continue;
    const byDate = out.get(team) ?? {};
    byDate[o.date] = o.primary;
    out.set(team, byDate);
  }
  return out;
}

/** What to show on one roster tile: the operation, or "" for nothing. */
export function opForRosterTile(
  teamOps: Record<string, string> | undefined,
  shiftCode: string,
  date: string
): string {
  if (!teamOps || !ON_DUTY_CODES.has(shiftCode)) return "";
  return teamOps[date] ?? "";
}
