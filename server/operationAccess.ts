// Server side of operation access (the rule itself is shared/operationAccess.ts).
//
// `enforceOperationAccess` runs in front of every signed-in procedure. It
// reads the operation / sheet / row ids a request names and:
//   - rejects a single id the person can't reach (FORBIDDEN);
//   - quietly drops unreachable ids from a list (`operationIds`, `sheetIds`);
//   - fills in "everything I can see" when a map-style list is asked for with
//     no operations named.
// A person who can reach every operation (a single-Command deployment, or an
// all-region admin) skips all of it, so nothing changes for them.
//
// Not covered here (listed in CLAUDE.md): procedures that identify their data
// only by an id this file doesn't resolve (e.g. a target, a statement) — the
// operation lists, Intelligence entity list and the operation/sheet/row
// procedures are the covered surface.
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import {
  accessLevel,
  hiddenBrowseOperationIds,
  hiddenIntelligenceOperationIds,
  reachableOperationIds,
  visibleOperationIds,
  type AccessLevel,
  type AccessOperation,
  type AccessShare,
  type AccessUser,
} from "@shared/operationAccess";
import {
  operations,
  operationShares,
  rowAttachments,
  rowMembers,
  runningSheets,
  sheetRows,
} from "../drizzle/schema";
import { getDb } from "./db";

// ─── Data (small tables, cached for a couple of seconds) ────────────────────
interface AccessData {
  ops: AccessOperation[];
  shares: AccessShare[];
}
let cache: { at: number; data: AccessData } | null = null;
const TTL_MS = 2000;

/** Call after anything that changes who can reach what. */
export function invalidateAccessCache() {
  cache = null;
}

export async function loadAccessData(): Promise<AccessData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const db = await getDb();
  if (!db) return { ops: [], shares: [] };
  const [ops, shares] = await Promise.all([
    db
      .select({
        id: operations.id,
        command: operations.command,
        restricted: operations.restricted,
      })
      .from(operations),
    db.select().from(operationShares),
  ]);
  const data: AccessData = {
    ops,
    shares: shares.map(s => ({
      operationId: s.operationId,
      fromCommand: s.fromCommand,
      userId: s.userId,
      level: s.level,
    })),
  };
  cache = { at: Date.now(), data };
  return data;
}

export function toAccessUser(u: {
  id: number;
  command: AccessUser["command"];
  role: string;
  allRegions: boolean;
}): AccessUser {
  return {
    id: u.id,
    command: u.command,
    role: u.role,
    allRegions: u.allRegions,
  };
}

/** Operation ids this person can reach at `min` (null = all of them). */
export async function accessibleOperationIds(
  user: AccessUser,
  min: AccessLevel = 1
): Promise<Set<number> | null> {
  const { ops, shares } = await loadAccessData();
  if (user.allRegions) return null;
  const ids = visibleOperationIds(user, ops, shares, min);
  return ids.size === ops.length ? null : ids;
}

export async function operationAccessFor(
  user: AccessUser,
  operationId: number
): Promise<AccessLevel> {
  const { ops, shares } = await loadAccessData();
  const op = ops.find(o => o.id === operationId);
  // An unknown id isn't ours to judge; the procedure reports "not found".
  if (!op) return 3;
  return accessLevel(user, op, shares);
}

// ─── Resolving ids to operations ────────────────────────────────────────────
async function operationsOfSheets(
  sheetIds: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (sheetIds.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  const rows = await db
    .select({ id: runningSheets.id, operationId: runningSheets.operationId })
    .from(runningSheets)
    .where(inArray(runningSheets.id, sheetIds));
  for (const r of rows) out.set(r.id, r.operationId);
  return out;
}

async function sheetsOfRows(rowIds: number[]): Promise<number[]> {
  if (rowIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ sheetId: sheetRows.sheetId })
    .from(sheetRows)
    .where(inArray(sheetRows.id, rowIds));
  return rows.map(r => r.sheetId);
}

async function rowsOfMembers(memberIds: number[]): Promise<number[]> {
  if (memberIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ rowId: rowMembers.rowId })
    .from(rowMembers)
    .where(inArray(rowMembers.id, memberIds));
  return rows.map(r => r.rowId);
}

async function operationsOfAttachments(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ operationId: rowAttachments.operationId })
    .from(rowAttachments)
    .where(inArray(rowAttachments.id, ids));
  return rows.map(r => r.operationId).filter((x): x is number => x != null);
}

/** How ids are traced back to operations. The database in production; a
 * plain in-memory version in the tests. */
export interface Resolvers {
  operationsOfSheets(ids: number[]): Promise<Map<number, number>>;
  sheetsOfRows(ids: number[]): Promise<number[]>;
  rowsOfMembers(ids: number[]): Promise<number[]>;
  operationsOfAttachments(ids: number[]): Promise<number[]>;
}

const dbResolvers: Resolvers = {
  operationsOfSheets,
  sheetsOfRows,
  rowsOfMembers,
  operationsOfAttachments,
};

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
const num = (v: unknown): number[] => (typeof v === "number" ? [v] : []);

/** Operation ids a single-id style request refers to. */
async function singleRefs(
  path: string,
  raw: Record<string, unknown>,
  r: Resolvers
): Promise<number[]> {
  const ops = new Set<number>(num(raw.operationId));
  const sheetIds = [...num(raw.sheetId)];
  const rowIds = [...num(raw.rowId)];
  const memberIds = [...num(raw.memberId)];
  // `id` means different things by namespace.
  if (path.startsWith("operation.")) num(raw.id).forEach(i => ops.add(i));
  if (path.startsWith("sheet.")) sheetIds.push(...num(raw.id));
  if (path.startsWith("row.")) rowIds.push(...num(raw.id));
  rowIds.push(...(await r.rowsOfMembers(memberIds)));
  sheetIds.push(...(await r.sheetsOfRows(rowIds)));
  (await r.operationsOfSheets(sheetIds)).forEach(opId => ops.add(opId));
  (await r.operationsOfAttachments(num(raw.attachmentId))).forEach(i =>
    ops.add(i)
  );
  return Array.from(ops);
}

// ─── What each kind of request needs ────────────────────────────────────────
/** Mutations need Log. These need less or more. */
const LEVEL_OVERRIDES: Record<string, AccessLevel> = {
  "operation.update": 3,
  "operation.delete": 3,
  "operation.hardDelete": 3,
  "operation.setStatus": 3,
  // Personal view state / own location, not edits to the operation:
  "intelligence.updateUserLocation": 1,
  "sheet.setContinuityDismissal": 1,
  "intelligence.dismissScanFinding": 1,
  "sheet.dismissCheckFinding": 1,
};

/** Map-style lists that mean "everything" when no operations are named.
 * With restricted access they get "everything I can reach" instead. */
const SCOPED_LIST_PATHS = new Set([
  "intelligence.mappingLocations",
  "intelligence.userLocations",
  "intelligence.registeredPeopleForMap",
  "intelligence.getAssociationGraph",
  "customMarker.list",
  "mapShape.list",
]);

function requiredLevel(path: string, type: string): AccessLevel {
  if (path in LEVEL_OVERRIDES) return LEVEL_OVERRIDES[path];
  return type === "mutation" ? 2 : 1;
}

const FORBIDDEN_MSG = "You don't have access to that operation.";

export async function enforceOperationAccess(args: {
  user: AccessUser;
  path: string;
  type: string;
  getRawInput: () => Promise<unknown>;
}): Promise<{ input?: unknown }> {
  const { ops, shares } = await loadAccessData();
  return enforceWith({ ...args, ops, shares, resolvers: dbResolvers });
}

/** The guard itself, with its data handed in (so it can be tested). */
export async function enforceWith(args: {
  user: AccessUser;
  path: string;
  type: string;
  getRawInput: () => Promise<unknown>;
  ops: AccessOperation[];
  shares: AccessShare[];
  resolvers: Resolvers;
}): Promise<{ input?: unknown }> {
  const { user, path, type, ops, shares, resolvers } = args;
  const need = requiredLevel(path, type);
  // Nothing to enforce when every operation is reachable AT the level this
  // request needs (a View share isn't enough to log, so it can't skip this).
  if (
    user.allRegions ||
    visibleOperationIds(user, ops, shares, need).size === ops.length
  ) {
    return {};
  }

  const levelOf = (opId: number): AccessLevel => {
    const op = ops.find(o => o.id === opId);
    return op ? accessLevel(user, op, shares) : 3;
  };

  let raw: unknown;
  try {
    raw = await args.getRawInput();
  } catch {
    raw = undefined;
  }
  if (!raw || typeof raw !== "object") return {};
  const input: Record<string, unknown> = {
    ...(raw as Record<string, unknown>),
  };
  let changed = false;

  // A single id the person can't reach: refuse.
  for (const opId of await singleRefs(path, input, resolvers)) {
    if (levelOf(opId) < need) {
      throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
    }
  }

  // Lists: keep only what they can reach.
  const allowed = visibleOperationIds(user, ops, shares, need);
  if (Array.isArray(input.operationIds)) {
    input.operationIds = nums(input.operationIds).filter(i => allowed.has(i));
    changed = true;
  } else if (SCOPED_LIST_PATHS.has(path)) {
    input.operationIds = Array.from(allowed);
    changed = true;
  }
  if (Array.isArray(input.sheetIds)) {
    const ids = nums(input.sheetIds);
    const opOf = await resolvers.operationsOfSheets(ids);
    input.sheetIds = ids.filter(id => {
      const opId = opOf.get(id);
      return opId == null || allowed.has(opId);
    });
    changed = true;
  }
  return changed ? { input } : {};
}

/** True when a Command-wide share row set is the only thing that changed
 * (used by callers that want to double check a single operation). */
export async function assertOperationAccess(
  user: AccessUser,
  operationId: number,
  min: AccessLevel = 1
) {
  if ((await operationAccessFor(user, operationId)) < min) {
    throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
  }
}

export async function operationCommand(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [op] = await db
    .select({ id: operations.id, command: operations.command })
    .from(operations)
    .where(eq(operations.id, id))
    .limit(1);
  return op;
}

// ─── Filtering list results ─────────────────────────────────────────────────
/** Keep only rows whose operation the person can reach. */
export async function filterByOperationAccess<T>(
  user: AccessUser,
  rows: T[],
  operationIdOf: (row: T) => number | null | undefined
): Promise<T[]> {
  const allowed = await accessibleOperationIds(user);
  if (allowed === null) return rows;
  return rows.filter(r => {
    const id = operationIdOf(r);
    return id == null || allowed.has(id);
  });
}

/** Operations the person can reach, each tagged with what they may do and
 * whether it belongs to another Command (so lists can show "Shared with me"). */
export async function operationsForUser<
  T extends { id: number; command: AccessUser["command"] },
>(
  user: AccessUser,
  rows: T[]
): Promise<Array<T & { accessLevel: AccessLevel; sharedIn: boolean }>> {
  const { ops, shares } = await loadAccessData();
  const out: Array<T & { accessLevel: AccessLevel; sharedIn: boolean }> = [];
  for (const row of rows) {
    const lv = accessLevel(user, { id: row.id, command: row.command }, shares);
    void ops;
    if (lv >= 1) {
      out.push({
        ...row,
        accessLevel: lv,
        sharedIn: !user.allRegions && row.command !== user.command,
      });
    }
  }
  return out;
}

/** Operations hidden from this person's Intelligence (empty = nothing to scope). */
export async function hiddenIntelligenceFor(
  user: AccessUser,
  mode: "browse" | "profile" = "browse"
): Promise<Set<number>> {
  const { ops, shares } = await loadAccessData();
  return mode === "profile"
    ? hiddenIntelligenceOperationIds(user, ops, shares)
    : hiddenBrowseOperationIds(user, ops, shares);
}

/** Procedures that open ONE entity's profile (Region Search's "Open in
 * Intelligence"): they use the more open scope. Everything else that reads
 * Intelligence is browsing. */
export const INTELLIGENCE_PROFILE_PATHS = new Set([
  "intelligence.targetProfile",
  "intelligence.associateProfile",
  "intelligence.vehicleProfile",
  "intelligence.locationProfile",
]);

/** For Region Search: the operations this person holds a share for. */
export async function reachableFor(user: AccessUser): Promise<number[]> {
  const { ops, shares } = await loadAccessData();
  return reachableOperationIds(user, ops, shares);
}

/** Target Registry rows: keep a target linked to at least one operation the
 * person can reach (or linked to none), and show only the operations they can
 * reach on it. */
export async function scopeRegistryTargets<
  T extends { linkedOperations: Array<{ operationId: number }> },
>(user: AccessUser, rows: T[]): Promise<T[]> {
  const allowed = await accessibleOperationIds(user);
  if (allowed === null) return rows;
  const out: T[] = [];
  for (const r of rows) {
    if (r.linkedOperations.length === 0) {
      out.push(r);
      continue;
    }
    const kept = r.linkedOperations.filter(l => allowed.has(l.operationId));
    if (kept.length > 0) out.push({ ...r, linkedOperations: kept });
  }
  return out;
}
