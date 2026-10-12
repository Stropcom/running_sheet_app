// The Command a request's CTO Roster / Weekly Tasking work belongs to. Kept
// free of database imports so both server/db.ts and server/ctoRoster.ts can
// read it. The id guards that go with it are in server/rosterScope.ts.
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_COMMAND, type CommandCode } from "@shared/commands";

export interface RosterScope {
  command: CommandCode;
}

export const rosterScope = new AsyncLocalStorage<RosterScope>();

/** The request's Command, or null when there is no request (internal use —
 *  nothing is filtered). */
export function rosterCommand(): CommandCode | null {
  return rosterScope.getStore()?.command ?? null;
}

/** The Command to stamp on a new row. */
export function rosterCommandForWrite(): CommandCode {
  return rosterCommand() ?? DEFAULT_COMMAND;
}
