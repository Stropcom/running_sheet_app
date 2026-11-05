/**
 * Which CTO Weekly Tasking team-days carry an EA breach marker.
 *
 * The roster already marks a member's cell with a red dot when the EA
 * compliance check finds a breach on that date. The tasking calendar carries
 * the same alert: a team-day shows the dot when any person ON DUTY for that
 * team that day has a breach on that date.
 *
 * "On duty for that team" follows the same rules as the on-duty count and the
 * Outlook page: members excluded from counts are left out, a secondment moves
 * a person to the destination team for its dates, and only the duty shift
 * types count (ON_DUTY_CODES). This is a plain rule, no network, no guessing:
 * a breach is only ever shown against a day the finding itself names.
 */
import { ON_DUTY_CODES } from "./ctoRosterShiftUtils";

export interface BreachFindingInput {
  ruleKey: string;
  ruleTitle: string;
  eaReference: string | null;
  memberId: number;
  memberName: string;
  dates: string[];
  detail: string;
  severity: "warning" | "error";
}

export interface BreachMemberInput {
  id: number;
  teamId: number;
  excludedFromCounts?: boolean | null;
}

export interface BreachSecondmentInput {
  memberId: number;
  destinationTeamId: number;
  startDate: string;
  endDate: string;
}

export interface BreachItem {
  /** Stable id for one finding (same finding on two days has the same id). */
  id: string;
  ruleTitle: string;
  eaReference: string | null;
  memberName: string;
  detail: string;
  severity: "warning" | "error";
}

export function breachCellKey(teamName: string, date: string): string {
  return `${teamName}|${date}`;
}

export function breachId(f: BreachFindingInput): string {
  return `${f.ruleKey}|${f.memberId}|${f.dates.join(",")}`;
}

/**
 * @param teams       the roster teams (id + name)
 * @param members     the roster members
 * @param secondments secondments (any; filtered by date here)
 * @param shiftCodeOf shift code a member has on a date ("" when none)
 * @param teamNames   the team names the calendar shows
 * @param dates       the dates (YYYY-MM-DD) the calendar shows
 * @returns team|date → the breaches on that team-day (worst first)
 */
export function taskingBreachCells(
  findings: BreachFindingInput[],
  teams: { id: number; name: string }[],
  members: BreachMemberInput[],
  secondments: BreachSecondmentInput[],
  shiftCodeOf: (memberId: number, date: string) => string,
  teamNames: string[],
  dates: string[]
): Record<string, BreachItem[]> {
  const out: Record<string, BreachItem[]> = {};
  const shown = new Set(dates);
  const wanted = new Set(teamNames);
  const teamNameById = new Map(teams.map(t => [t.id, t.name]));
  const memberById = new Map(members.map(m => [m.id, m]));
  const secondmentByMember = new Map(secondments.map(s => [s.memberId, s]));

  for (const f of findings) {
    const m = memberById.get(f.memberId);
    if (!m || m.excludedFromCounts) continue;
    const id = breachId(f);
    for (const date of f.dates) {
      if (!shown.has(date)) continue;
      if (!ON_DUTY_CODES.has(shiftCodeOf(m.id, date))) continue;
      const sec = secondmentByMember.get(m.id);
      const onSecondment =
        !!sec && date >= sec.startDate && date <= sec.endDate;
      const teamId = onSecondment ? sec!.destinationTeamId : m.teamId;
      const teamName = teamNameById.get(teamId);
      if (!teamName || !wanted.has(teamName)) continue;
      const key = breachCellKey(teamName, date);
      const list = (out[key] ??= []);
      if (list.some(b => b.id === id)) continue;
      list.push({
        id,
        ruleTitle: f.ruleTitle,
        eaReference: f.eaReference,
        memberName: f.memberName,
        detail: f.detail,
        severity: f.severity,
      });
    }
  }
  for (const list of Object.values(out)) {
    list.sort(
      (a, b) =>
        Number(b.severity === "error") - Number(a.severity === "error") ||
        a.memberName.localeCompare(b.memberName)
    );
  }
  return out;
}

/** Number of distinct findings across a set of cells (for the header chip). */
export function distinctBreachCount(
  cells: Record<string, BreachItem[]>
): number {
  const ids = new Set<string>();
  for (const list of Object.values(cells)) for (const b of list) ids.add(b.id);
  return ids.size;
}
