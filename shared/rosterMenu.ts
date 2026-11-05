/**
 * The CTO Roster entry of the side menu (client/src/components/
 * DashboardLayout.tsx). The roster itself, My Shifts and Outlook sit directly
 * under CTO Roster; the other five pages are grouped under "Roster tools",
 * which is folded away unless you are on one of them. Tested in
 * server/rosterMenu.test.ts.
 */

/** Path prefixes of the pages inside Roster tools (a prefix, so a draft's own
 * page, /cto-roster/drafts/12, counts). */
export const ROSTER_TOOL_PREFIXES = [
  "/cto-roster/draft",
  "/cto-roster/saved-roster",
  "/cto-roster/ea-compliance",
  "/cto-roster/audit",
  "/cto-roster/members",
] as const;

/** Whether this path is one of the Roster tools pages. */
export function isRosterToolsPath(path: string): boolean {
  return ROSTER_TOOL_PREFIXES.some(p => path.startsWith(p));
}

/** Every page that belongs to the Op Manager folder of the side menu. Weekly
 * Activity and the Weekly Tasking Report have a /reports address but live under
 * Op Manager, so opening one keeps Op Manager open (and highlighted) and must
 * not open the Procedures or Administration folders. */
export function isOpManagerPath(path: string): boolean {
  return (
    path.startsWith("/operation-manager") ||
    path.startsWith("/cto-roster") ||
    path === "/reports/weekly-activity" ||
    path === "/reports/weekly-tasking"
  );
}

/** The pages inside the Procedures folder. */
export function isProceduresPath(path: string): boolean {
  return (
    path.startsWith("/administration/vehicle-crash") ||
    path.startsWith("/administration/uco-guide") ||
    path.startsWith("/administration/smeac")
  );
}
