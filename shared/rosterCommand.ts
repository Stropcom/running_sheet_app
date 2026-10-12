/**
 * Which Command's CTO Roster / Weekly Tasking board a request works on.
 *
 * Every Command has its own. A person always works on their own Command's;
 * only an all-region admin may pick another Command to look at (the picker on
 * those pages sends the choice as a header). Anything else, or a value that
 * isn't a real Command, falls back to their own — so a tampered request can't
 * widen what it reaches.
 */
import { DEFAULT_COMMAND, isCommandCode, type CommandCode } from "./commands";

/** Header the client sends when an all-region admin picks a Command. */
export const ROSTER_COMMAND_HEADER = "x-runlog-roster-command";

export function resolveRosterCommand(
  user: { command?: string | null; allRegions?: boolean | null },
  requested: string | string[] | null | undefined
): CommandCode {
  const home = isCommandCode(user.command) ? user.command : DEFAULT_COMMAND;
  const asked = Array.isArray(requested) ? requested[0] : requested;
  if (user.allRegions && isCommandCode(asked)) return asked;
  return home;
}
