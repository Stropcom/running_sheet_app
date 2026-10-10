// Who may reach which operation. ONE rule, used by the server's guard, the
// operation lists and the Access Management screens, so they can't disagree.
//
//   - your own Command's operations: full access (what you can DO there is
//     still limited by your role — observers stay view-only, and so on);
//   - an operation another Command's admin has shared with you by name, or
//     every operation that Command owns: the level you were given, worded
//     like the usual access levels — Investigator (the Mapping page only),
//     Observer (view, read only), Full Access (also add rows and certify) or
//     Full Access + User Management (also edit the operation). An Observer
//     never goes past View;
//   - an all-region admin: everything.
//
// Deterministic and pure — no lookups here.
import type { CommandCode } from "./commands";

export type ShareLevel = "investigator" | "view" | "log" | "manage";
/** 0 = none, 1 = view, 2 = log, 3 = manage (or your own Command's). */
export type AccessLevel = 0 | 1 | 2 | 3;

/** Same order and wording as the Add User "Access level" dropdown. */
export const SHARE_LEVELS: ShareLevel[] = [
  "investigator",
  "view",
  "log",
  "manage",
];
/** Investigator is 0: it opens no operation data through the normal guard —
 * the Mapping page picks it up separately (see mapOnlyOperationIds). */
export const SHARE_LEVEL_NUM: Record<ShareLevel, 0 | 1 | 2 | 3> = {
  investigator: 0,
  view: 1,
  log: 2,
  manage: 3,
};
export const SHARE_LEVEL_LABEL: Record<ShareLevel, string> = {
  investigator: "Investigator",
  view: "Observer",
  log: "Full Access",
  manage: "Full Access + User Management",
};
/** Short form for pills and badges. */
export const SHARE_LEVEL_SHORT: Record<ShareLevel, string> = {
  investigator: "Investigator",
  view: "Observer",
  log: "Full Access",
  manage: "Full Access + UM",
};
export const SHARE_LEVEL_HELP: Record<ShareLevel, string> = {
  investigator: "mapping page only",
  view: "view only",
  log: "own CIN certify only",
  manage: "",
};
/** "Observer — view only", or just the label when there's no help text. */
export function shareLevelText(l: ShareLevel): string {
  return SHARE_LEVEL_HELP[l]
    ? `${SHARE_LEVEL_LABEL[l]} — ${SHARE_LEVEL_HELP[l]}`
    : SHARE_LEVEL_LABEL[l];
}

export interface AccessUser {
  id: number;
  command: CommandCode;
  role: string;
  allRegions: boolean;
}

export interface AccessOperation {
  id: number;
  command: CommandCode;
  /** Restricted: other Commands can't open it in Intelligence. */
  restricted?: boolean;
}

export interface AccessShare {
  /** A single operation, or null for "every operation `fromCommand` owns". */
  operationId: number | null;
  fromCommand: CommandCode | null;
  userId: number;
  level: ShareLevel;
}

export function accessLevel(
  user: AccessUser,
  op: AccessOperation,
  shares: AccessShare[]
): AccessLevel {
  if (user.allRegions) return 3;
  if (op.command === user.command) return 3;
  let best: AccessLevel = 0;
  for (const s of shares) {
    if (s.userId !== user.id) continue;
    const applies =
      s.operationId != null
        ? s.operationId === op.id
        : s.fromCommand != null && s.fromCommand === op.command;
    if (!applies) continue;
    const lv = SHARE_LEVEL_NUM[s.level];
    if (lv > best) best = lv;
  }
  // An Observer can read but never log or edit, whatever they were given.
  if (user.role === "observer" && best > 1) best = 1;
  return best;
}

export function visibleOperationIds(
  user: AccessUser,
  ops: AccessOperation[],
  shares: AccessShare[],
  min: AccessLevel = 1
): Set<number> {
  const out = new Set<number>();
  for (const op of ops)
    if (accessLevel(user, op, shares) >= min) out.add(op.id);
  return out;
}

/** Operations this person holds an Investigator-level share for and can't
 * otherwise open: they appear on the Mapping page and nowhere else. */
export function mapOnlyOperationIds(
  user: AccessUser,
  ops: AccessOperation[],
  shares: AccessShare[]
): Set<number> {
  const out = new Set<number>();
  if (user.allRegions) return out;
  for (const op of ops) {
    if (accessLevel(user, op, shares) > 0) continue;
    const has = shares.some(
      s =>
        s.userId === user.id &&
        s.level === "investigator" &&
        (s.operationId != null
          ? s.operationId === op.id
          : s.fromCommand != null && s.fromCommand === op.command)
    );
    if (has) out.add(op.id);
  }
  return out;
}

/** Everything is visible: nothing to enforce, so skip the guard entirely.
 * This is what keeps a single-Command deployment behaving exactly as before. */
export function seesEverything(
  user: AccessUser,
  ops: AccessOperation[],
  shares: AccessShare[]
): boolean {
  return visibleOperationIds(user, ops, shares).size === ops.length;
}

/** Who can share an operation: an admin of the Command that owns it (or an
 * all-region admin). Sharing is a deliberate act of the owning Command. */
export function canShareOperation(
  user: AccessUser,
  op: AccessOperation
): boolean {
  return (
    user.role === "admin" && (user.allRegions || op.command === user.command)
  );
}

// ─── Intelligence scope ─────────────────────────────────────────────────────
// Two scopes, because Intelligence is used two ways:
//
//   BROWSING (the Intelligence Folder lists, maps, reports) follows the access
//   rule above: you see the entities of the operations you can reach, so a
//   Command's Folder is its own (plus anything shared with it).
//
//   OPENING one entity's profile (what Region Search's "Open in Intelligence"
//   does) is more open: any operation except another Command's Restricted
//   one — so you can follow a match into another Command's unrestricted work.

/** Operation ids hidden when BROWSING Intelligence: everything you can't reach. */
export function hiddenBrowseOperationIds(
  user: AccessUser,
  ops: AccessOperation[],
  shares: AccessShare[]
): Set<number> {
  const hidden = new Set<number>();
  if (user.allRegions) return hidden;
  for (const op of ops) {
    if (accessLevel(user, op, shares) < 1) hidden.add(op.id);
  }
  return hidden;
}

/** Operation ids hidden when OPENING an entity's profile. */
export function hiddenIntelligenceOperationIds(
  user: AccessUser,
  ops: AccessOperation[],
  shares: AccessShare[]
): Set<number> {
  const hidden = new Set<number>();
  if (user.allRegions) return hidden;
  for (const op of ops) {
    if (!op.restricted || op.command === user.command) continue;
    if (accessLevel(user, op, shares) >= 1) continue;
    hidden.add(op.id);
  }
  return hidden;
}

/** Restricted operations a person was given a share for — Region Search
 * lets them open those. */
export function reachableOperationIds(
  user: AccessUser,
  ops: AccessOperation[],
  shares: AccessShare[]
): number[] {
  return Array.from(visibleOperationIds(user, ops, shares, 1));
}

/** Drop occurrences from hidden operations. An entity seen ONLY in hidden
 * operations disappears; one with other occurrences stays, trimmed.
 * Registry-only occurrences (operation 0) are never hidden. */
export function scopeEntities<
  E extends {
    occurrences: Array<{ operationId: number; rowId: number }>;
    isIndicesOnly?: boolean;
  },
>(entities: E[], hidden: Set<number>): E[] {
  if (hidden.size === 0) return entities;
  const out: E[] = [];
  for (const e of entities) {
    const kept = e.occurrences.filter(o => !hidden.has(o.operationId));
    if (kept.length === e.occurrences.length) {
      out.push(e);
    } else if (kept.length > 0) {
      out.push({
        ...e,
        occurrences: kept,
        isIndicesOnly: kept.every(o => o.rowId === 0),
      });
    }
  }
  return out;
}

/** One share, with the names needed to show it (see server listOperationShares). */
export interface OperationShareRow {
  id: number;
  operationId: number | null;
  operationName: string | null;
  /** The Command that owns what is shared. */
  fromCommand: CommandCode;
  userId: number;
  userName: string;
  userCIN: string | null;
  userCommand: CommandCode;
  userTeam: string | null;
  level: ShareLevel;
  sharedByCIN: string;
  createdAt: number;
}
