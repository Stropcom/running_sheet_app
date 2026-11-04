/**
 * Rules about the teams on the Team Duty Roster. Pure and tested
 * (server/teamColours.test.ts).
 */

/** Teams whose people are never on call, so their section has no ON CALL row.
 * Matched by team name, ignoring case and spaces at the ends. */
const NEVER_ON_CALL = new Set(["admin"]);

/** Whether a team's section shows an ON CALL totals row. */
export function teamShowsOnCall(teamName: string): boolean {
  return !NEVER_ON_CALL.has(teamName.trim().toLowerCase());
}
