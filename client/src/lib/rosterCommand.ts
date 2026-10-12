// Which Command's CTO Roster / Weekly Tasking an all-region admin is looking
// at. Everyone else always works on their own Command's (the server ignores
// the header unless the person is an all-region admin — see
// shared/rosterCommand.ts), so sending it is harmless.
import { ROSTER_COMMAND_HEADER } from "@shared/rosterCommand";
import { isCommandCode, type CommandCode } from "@shared/commands";

const STORAGE_KEY = "runlog_roster_command";

export function getPickedRosterCommand(): CommandCode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isCommandCode(v) ? v : null;
  } catch {
    return null;
  }
}

export function setPickedRosterCommand(command: CommandCode | null) {
  try {
    if (command) localStorage.setItem(STORAGE_KEY, command);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — the pick just won't be remembered
  }
}

/** Extra request headers carrying the pick, if there is one. */
export function rosterCommandHeaders(): Record<string, string> {
  const picked = getPickedRosterCommand();
  return picked ? { [ROSTER_COMMAND_HEADER]: picked } : {};
}
