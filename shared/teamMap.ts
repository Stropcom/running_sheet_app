/**
 * How a team appears in Map Settings → Teams, and what "logged in" means for
 * it. Pure, so the rule is testable and the server and client agree.
 *
 *  - "always" teams (Team 1, Team 2, PTT, Capability, and any team an admin
 *    adds — temporary teams stay until they are deleted) always show.
 *  - "online" teams (Admin, Investigators) show only while someone in the
 *    team is logged in.
 *
 * "Logged in" = the person has used the app within ONLINE_WINDOW_MS. The
 * server stamps users.lastSignedIn on every signed-in request, and the app
 * keeps asking the server while it is open, so this follows people who are
 * actually on it rather than anyone whose 12-hour session cookie hasn't
 * expired yet.
 */

export type TeamMapVisibility = "always" | "online";

/** How recently someone must have used the app to count as logged in. */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;

/** Whether a team row belongs in Map Settings → Teams right now. */
export function teamShownOnMap(
  team: { id: number; mapVisibility: TeamMapVisibility },
  onlineTeamIds: ReadonlySet<number>,
  hasLiveMember: boolean
): boolean {
  if (team.mapVisibility === "always") return true;
  // Someone sharing their position is, by definition, on the app.
  return hasLiveMember || onlineTeamIds.has(team.id);
}

/** True when this person was active recently enough to count as logged in. */
export function isLoggedIn(lastSignedIn: Date | number | null, now: number) {
  if (lastSignedIn == null) return false;
  const t =
    lastSignedIn instanceof Date ? lastSignedIn.getTime() : lastSignedIn;
  return now - t <= ONLINE_WINDOW_MS;
}
