// Per-Command CTO Roster and Weekly Tasking board.
//
// Each Command has its own roster (teams, members, shifts, secondments,
// drafts, saved rosters, outlook minimums, audit log) and its own tasking
// board (priority rows, tasking grid, supervisor contacts, posted weeks).
// Eastern's can't be seen or changed by Western.
//
// Two layers, both fail-closed:
//   1. The data layer (server/ctoRoster.ts and the Op Manager functions in
//      db.ts) reads the request's Command from `rosterScope` and filters lists
//      and writes by it.
//   2. `enforceRosterAccess` (called from the tRPC guard) checks every roster
//      id a request names — member, team, secondment, draft, saved roster and
//      their children — belongs to that Command, so a guessed id from another
//      Command is refused (FORBIDDEN) instead of acted on.
// Internal callers with no request (no scope) are unfiltered.
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import type { CommandCode } from "@shared/commands";
import {
  ctoRosterDraftMembers,
  ctoRosterDraftTeams,
  ctoRosterDrafts,
  ctoRosterMembers,
  ctoRosterSavedRosterMembers,
  ctoRosterSavedRosterTeams,
  ctoRosterSavedRosters,
  ctoRosterSecondments,
  ctoRosterTeams,
} from "../drizzle/schema";
import { getDb } from "./db";

// ─── Which roster ids each procedure names ──────────────────────────────────
type Kind =
  | "team"
  | "member"
  | "secondment"
  | "draft"
  | "draftTeam"
  | "draftMember"
  | "saved"
  | "savedTeam"
  | "savedMember";

type Ref = [Kind, string];

/** Procedure path → the input fields that hold roster ids (see `collectIds`). */
export const ROSTER_ID_REFS: Record<string, Ref[]> = {
  "ctoRoster.teams.rename": [["team", "teamId"]],
  "ctoRoster.teams.delete": [["team", "teamId"]],
  "ctoRoster.teams.reorder": [["team", "[].id"]],
  "ctoRoster.members.add": [["team", "teamId"]],
  "ctoRoster.members.delete": [["member", "memberId"]],
  "ctoRoster.members.move": [
    ["member", "memberId"],
    ["team", "teamId"],
  ],
  "ctoRoster.members.reorder": [
    ["member", "[].id"],
    ["team", "[].teamId"],
  ],
  "ctoRoster.members.changeTeam": [
    ["member", "memberId"],
    ["team", "newTeamId"],
  ],
  "ctoRoster.members.setExcludedFromCounts": [["member", "memberId"]],
  "ctoRoster.secondments.create": [
    ["member", "memberId"],
    ["team", "destinationTeamId"],
  ],
  "ctoRoster.secondments.update": [
    ["secondment", "id"],
    ["team", "destinationTeamId"],
  ],
  "ctoRoster.secondments.delete": [["secondment", "id"]],
  "ctoRoster.roster.updateShift": [["member", "memberId"]],
  "ctoRoster.roster.bulkUpdate": [["member", "memberId"]],
  "ctoRoster.roster.bulkCopy": [
    ["member", "sourceMemberId"],
    ["member", "targetMemberIds[]"],
  ],
  "ctoRoster.roster.detectCycle": [["member", "memberId"]],
  "ctoRoster.roster.repeatCycle": [["member", "sourceMemberId"]],
  "ctoRoster.draft.get": [["draft", "draftId"]],
  "ctoRoster.draft.delete": [["draft", "draftId"]],
  "ctoRoster.draft.rename": [["draft", "draftId"]],
  "ctoRoster.draft.setTimeframe": [["draft", "draftId"]],
  "ctoRoster.draft.getShifts": [["draft", "draftId"]],
  "ctoRoster.draft.upsertShift": [["draft", "draftId"]],
  "ctoRoster.draft.bulkUpsert": [["draft", "draftId"]],
  "ctoRoster.draft.getMergeDiff": [["draft", "draftId"]],
  "ctoRoster.draft.merge": [["draft", "draftId"]],
  "ctoRoster.draft.getTeamsAndMembers": [["draft", "draftId"]],
  "ctoRoster.draft.addTeam": [["draft", "draftId"]],
  "ctoRoster.draft.renameTeam": [["draftTeam", "teamId"]],
  "ctoRoster.draft.deleteTeam": [
    ["draftTeam", "teamId"],
    ["draft", "draftId"],
  ],
  "ctoRoster.draft.addMember": [
    ["draft", "draftId"],
    ["draftTeam", "teamId"],
  ],
  "ctoRoster.draft.renameMember": [["draftMember", "memberId"]],
  "ctoRoster.draft.deleteMember": [
    ["draftMember", "memberId"],
    ["draft", "draftId"],
  ],
  "ctoRoster.draft.moveMember": [
    ["draftMember", "memberId"],
    ["draftTeam", "newTeamId"],
  ],
  "ctoRoster.draft.saveAsRoster": [["draft", "draftId"]],
  "ctoRoster.savedRoster.get": [["saved", "id"]],
  "ctoRoster.savedRoster.delete": [["saved", "id"]],
  "ctoRoster.savedRoster.rename": [["saved", "id"]],
  "ctoRoster.savedRoster.setTimeframe": [["saved", "id"]],
  "ctoRoster.savedRoster.getTeamsAndMembers": [["saved", "id"]],
  "ctoRoster.savedRoster.getShifts": [["saved", "id"]],
  "ctoRoster.savedRoster.upsertShift": [["saved", "savedRosterId"]],
  "ctoRoster.savedRoster.bulkUpsert": [["saved", "savedRosterId"]],
  "ctoRoster.savedRoster.addTeam": [["saved", "savedRosterId"]],
  "ctoRoster.savedRoster.renameTeam": [["savedTeam", "teamId"]],
  "ctoRoster.savedRoster.deleteTeam": [
    ["savedTeam", "teamId"],
    ["saved", "savedRosterId"],
  ],
  "ctoRoster.savedRoster.addMember": [
    ["saved", "savedRosterId"],
    ["savedTeam", "teamId"],
  ],
  "ctoRoster.savedRoster.renameMember": [["savedMember", "memberId"]],
  "ctoRoster.savedRoster.deleteMember": [
    ["savedMember", "memberId"],
    ["saved", "savedRosterId"],
  ],
  "ctoRoster.savedRoster.moveMember": [
    ["savedMember", "memberId"],
    ["savedTeam", "newTeamId"],
  ],
  "ctoRoster.eba.runCheck": [
    ["draft", "draftId"],
    ["saved", "savedRosterId"],
  ],
};

/** Pull the numbers an expression names out of a request input.
 *  "memberId" → input.memberId · "ids[]" → each of input.ids · "[].id" → the
 *  id of each element of an array input. */
export function collectIds(input: unknown, expr: string): number[] {
  let current: unknown[] = [input];
  for (const part of expr.split(".")) {
    const many = part.endsWith("[]");
    const key = many ? part.slice(0, -2) : part;
    const next: unknown[] = [];
    for (const value of current) {
      const picked =
        key === ""
          ? value
          : value && typeof value === "object"
            ? (value as Record<string, unknown>)[key]
            : undefined;
      if (picked === undefined || picked === null) continue;
      if (many) {
        if (Array.isArray(picked)) next.push(...picked);
      } else {
        next.push(picked);
      }
    }
    current = next;
  }
  return current.filter((v): v is number => typeof v === "number");
}

/** The Command each id belongs to (ids that don't exist are left out). */
async function commandsOf(
  kind: Kind,
  ids: number[]
): Promise<Map<number, CommandCode>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const out = new Map<number, CommandCode>();
  if (ids.length === 0) return out;
  const unique = Array.from(new Set(ids));
  switch (kind) {
    case "team": {
      for (const r of await db
        .select({ id: ctoRosterTeams.id, c: ctoRosterTeams.command })
        .from(ctoRosterTeams)
        .where(inArray(ctoRosterTeams.id, unique)))
        out.set(r.id, r.c);
      break;
    }
    case "member": {
      for (const r of await db
        .select({ id: ctoRosterMembers.id, c: ctoRosterMembers.command })
        .from(ctoRosterMembers)
        .where(inArray(ctoRosterMembers.id, unique)))
        out.set(r.id, r.c);
      break;
    }
    case "secondment": {
      const secs = await db
        .select({
          id: ctoRosterSecondments.id,
          memberId: ctoRosterSecondments.memberId,
        })
        .from(ctoRosterSecondments)
        .where(inArray(ctoRosterSecondments.id, unique));
      const members = await commandsOf(
        "member",
        secs.map(s => s.memberId)
      );
      for (const s of secs) {
        const c = members.get(s.memberId);
        if (c) out.set(s.id, c);
      }
      break;
    }
    case "draft": {
      for (const r of await db
        .select({ id: ctoRosterDrafts.id, c: ctoRosterDrafts.command })
        .from(ctoRosterDrafts)
        .where(inArray(ctoRosterDrafts.id, unique)))
        out.set(r.id, r.c);
      break;
    }
    case "draftTeam":
    case "draftMember": {
      const table =
        kind === "draftTeam" ? ctoRosterDraftTeams : ctoRosterDraftMembers;
      const kids = await db
        .select({ id: table.id, parent: table.draftId })
        .from(table)
        .where(inArray(table.id, unique));
      const parents = await commandsOf(
        "draft",
        kids.map(k => k.parent)
      );
      for (const k of kids) {
        const c = parents.get(k.parent);
        if (c) out.set(k.id, c);
      }
      break;
    }
    case "saved": {
      for (const r of await db
        .select({
          id: ctoRosterSavedRosters.id,
          c: ctoRosterSavedRosters.command,
        })
        .from(ctoRosterSavedRosters)
        .where(inArray(ctoRosterSavedRosters.id, unique)))
        out.set(r.id, r.c);
      break;
    }
    case "savedTeam":
    case "savedMember": {
      const table =
        kind === "savedTeam"
          ? ctoRosterSavedRosterTeams
          : ctoRosterSavedRosterMembers;
      const kids = await db
        .select({ id: table.id, parent: table.savedRosterId })
        .from(table)
        .where(inArray(table.id, unique));
      const parents = await commandsOf(
        "saved",
        kids.map(k => k.parent)
      );
      for (const k of kids) {
        const c = parents.get(k.parent);
        if (c) out.set(k.id, c);
      }
      break;
    }
  }
  return out;
}

/** Looks up which Command each id belongs to (swapped for a stub in tests). */
export type RosterOwners = (
  kind: Kind,
  ids: number[]
) => Promise<Map<number, CommandCode>>;

/** Refuse a request that names a roster id from another Command. */
export async function enforceRosterWith(
  path: string,
  command: CommandCode,
  rawInput: unknown,
  owners: RosterOwners
): Promise<void> {
  const refs = ROSTER_ID_REFS[path];
  if (!refs) return;
  for (const [kind, expr] of refs) {
    const ids = collectIds(rawInput, expr);
    if (ids.length === 0) continue;
    const found = await owners(kind, ids);
    for (const id of ids) {
      const owner = found.get(id);
      // An id that doesn't exist can't belong to another Command; the
      // operation on it simply does nothing.
      if (owner && owner !== command) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That belongs to another Command's roster.",
        });
      }
    }
  }
}

export function enforceRosterAccess(
  path: string,
  command: CommandCode,
  rawInput: unknown
): Promise<void> {
  return enforceRosterWith(path, command, rawInput, commandsOf);
}
