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
// What an id points at is traced back to its operation(s): sheets, rows,
// members, attachments (and their entity links), briefings, map markers and
// shapes, and — because a target belongs to the operations it is linked to —
// targets, their associates and shortcuts. A target is reachable when it has
// no operations, or any one of them is (queries use the more open Intelligence
// scope, so a profile opened from Region Search still works; changes need Log
// on one of its operations).
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import {
  accessLevel,
  hiddenBrowseOperationIds,
  hiddenIntelligenceOperationIds,
  reachableOperationIds,
  visibleOperationIds,
  mapOnlyOperationIds,
  type AccessLevel,
  type AccessOperation,
  type AccessShare,
  type AccessUser,
} from "@shared/operationAccess";
import {
  associates,
  attachmentEntityLinks,
  customMapMarkers,
  mapShapes,
  operations,
  operationShares,
  operationTargetLinks,
  rowAttachments,
  rowMembers,
  runningSheets,
  sheetRows,
  smeacBriefings,
  targets,
  targetShortcuts,
  ucoGuideBriefings,
} from "../drizzle/schema";
import { getAllUsers, getDb } from "./db";

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

async function idsOf(
  table: any,
  idCol: any,
  pick: any,
  ids: number[]
): Promise<any[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select({ v: pick }).from(table).where(inArray(idCol, ids));
}

async function operationsOfTargets(
  targetIds: number[]
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (targetIds.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  for (const id of targetIds) out.set(id, []);
  const [own, links] = await Promise.all([
    db
      .select({ id: targets.id, operationId: targets.operationId })
      .from(targets)
      .where(inArray(targets.id, targetIds)),
    db
      .select({
        targetId: operationTargetLinks.targetId,
        operationId: operationTargetLinks.operationId,
      })
      .from(operationTargetLinks)
      .where(inArray(operationTargetLinks.targetId, targetIds)),
  ]);
  for (const r of own)
    if (r.operationId != null) out.get(r.id)!.push(r.operationId);
  for (const l of links) {
    const list = out.get(l.targetId)!;
    if (!list.includes(l.operationId)) list.push(l.operationId);
  }
  return out;
}

/** How ids are traced back to operations. The database in production; a
 * plain in-memory version in the tests. */
export interface Resolvers {
  operationsOfSheets(ids: number[]): Promise<Map<number, number>>;
  sheetsOfRows(ids: number[]): Promise<number[]>;
  rowsOfMembers(ids: number[]): Promise<number[]>;
  operationsOfAttachments(ids: number[]): Promise<number[]>;
  attachmentsOfLinks(ids: number[]): Promise<number[]>;
  operationsOfTargets(ids: number[]): Promise<Map<number, number[]>>;
  targetsOfAssociates(ids: number[]): Promise<number[]>;
  targetsOfShortcuts(ids: number[]): Promise<number[]>;
  operationsOfBriefings(
    kind: "smeac" | "uco",
    ids: number[]
  ): Promise<number[]>;
  operationsOfMarkers(ids: number[]): Promise<number[]>;
  operationsOfShapes(ids: number[]): Promise<number[]>;
}

const notNull = (xs: any[]): number[] =>
  xs.map(x => x.v).filter((x): x is number => x != null);

const dbResolvers: Resolvers = {
  operationsOfSheets,
  sheetsOfRows,
  rowsOfMembers,
  operationsOfAttachments,
  attachmentsOfLinks: async ids =>
    notNull(
      await idsOf(
        attachmentEntityLinks,
        attachmentEntityLinks.id,
        attachmentEntityLinks.attachmentId,
        ids
      )
    ),
  operationsOfTargets,
  targetsOfAssociates: async ids =>
    notNull(await idsOf(associates, associates.id, associates.targetId, ids)),
  targetsOfShortcuts: async ids =>
    notNull(
      await idsOf(
        targetShortcuts,
        targetShortcuts.id,
        targetShortcuts.targetId,
        ids
      )
    ),
  operationsOfBriefings: async (kind, ids) =>
    kind === "smeac"
      ? notNull(
          await idsOf(
            smeacBriefings,
            smeacBriefings.id,
            smeacBriefings.operationId,
            ids
          )
        )
      : notNull(
          await idsOf(
            ucoGuideBriefings,
            ucoGuideBriefings.id,
            ucoGuideBriefings.operationId,
            ids
          )
        ),
  operationsOfMarkers: async ids =>
    notNull(
      await idsOf(
        customMapMarkers,
        customMapMarkers.id,
        customMapMarkers.operationId,
        ids
      )
    ),
  operationsOfShapes: async ids =>
    notNull(await idsOf(mapShapes, mapShapes.id, mapShapes.operationId, ids)),
};

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
const num = (v: unknown): number[] => (typeof v === "number" ? [v] : []);

/** What a request names: operations, and targets (reachable via their
 * operations). */
interface Refs {
  ops: number[];
  targets: number[];
}

/** Recycle Bin items are named by (type, id). */
async function recycleRefs(
  raw: Record<string, unknown>,
  r: Resolvers
): Promise<Refs> {
  const ids = num(raw.id);
  const out: Refs = { ops: [], targets: [] };
  switch (raw.type) {
    case "operation":
      out.ops.push(...ids);
      break;
    case "sheet":
      (await r.operationsOfSheets(ids)).forEach(o => out.ops.push(o));
      break;
    case "target":
      out.targets.push(...ids);
      break;
    case "map_marker":
      out.ops.push(...(await r.operationsOfMarkers(ids)));
      break;
    case "attachment":
      out.ops.push(...(await r.operationsOfAttachments(ids)));
      break;
    case "smeac_briefing":
      out.ops.push(...(await r.operationsOfBriefings("smeac", ids)));
      break;
    case "uco_guide":
      out.ops.push(...(await r.operationsOfBriefings("uco", ids)));
      break;
  }
  return out;
}

/** The operations and targets a single-id style request refers to. */
async function singleRefs(
  path: string,
  raw: Record<string, unknown>,
  r: Resolvers
): Promise<Refs> {
  const ops = new Set<number>([
    ...num(raw.operationId),
    ...num(raw.linkToOperationId),
  ]);
  const targetIds = new Set<number>([
    ...num(raw.targetId),
    ...num(raw.existingTargetId),
  ]);
  const sheetIds = [...num(raw.sheetId)];
  const rowIds = [...num(raw.rowId)];
  const memberIds = [...num(raw.memberId)];
  const attachmentIds = [...num(raw.attachmentId)];
  const linkIds = [
    ...num(raw.linkId),
    ...num(raw.matchedLinkId),
    ...num(raw.newLinkId),
    ...num(raw.matchedEntityLinkId),
  ];
  const associateIds = [...num(raw.existingAssociateId)];
  // `id` means different things by namespace.
  const id = num(raw.id);
  if (path.startsWith("operation.")) id.forEach(i => ops.add(i));
  else if (path.startsWith("sheet.") || path.startsWith("export."))
    sheetIds.push(...id);
  else if (path.startsWith("row.")) rowIds.push(...id);
  else if (path.startsWith("member.")) memberIds.push(...id);
  else if (path.startsWith("attachment.")) attachmentIds.push(...id);
  else if (path.startsWith("target.")) id.forEach(i => targetIds.add(i));
  else if (path.startsWith("associate.")) associateIds.push(...id);
  else if (path.startsWith("targetShortcuts."))
    (await r.targetsOfShortcuts(id)).forEach(t => targetIds.add(t));
  else if (path.startsWith("smeacBriefing."))
    (await r.operationsOfBriefings("smeac", id)).forEach(o => ops.add(o));
  else if (path.startsWith("ucoGuide."))
    (await r.operationsOfBriefings("uco", id)).forEach(o => ops.add(o));
  else if (path.startsWith("customMarker."))
    (await r.operationsOfMarkers(id)).forEach(o => ops.add(o));
  else if (path.startsWith("mapShape."))
    (await r.operationsOfShapes(id)).forEach(o => ops.add(o));
  else if (path.startsWith("recycleBin.")) {
    const rb = await recycleRefs(raw, r);
    rb.ops.forEach(o => ops.add(o));
    rb.targets.forEach(t => targetIds.add(t));
  }
  (await r.targetsOfAssociates(associateIds)).forEach(t => targetIds.add(t));
  attachmentIds.push(...(await r.attachmentsOfLinks(linkIds)));
  rowIds.push(...(await r.rowsOfMembers(memberIds)));
  sheetIds.push(...(await r.sheetsOfRows(rowIds)));
  (await r.operationsOfSheets(sheetIds)).forEach(opId => ops.add(opId));
  (await r.operationsOfAttachments(attachmentIds)).forEach(i => ops.add(i));
  return { ops: Array.from(ops), targets: Array.from(targetIds) };
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

/** Reads that feed the Mapping page. An Investigator-level share opens its
 * operation for exactly these and nothing else. */
export const MAP_VIEW_PATHS = new Set([
  "intelligence.mappingLocations",
  "intelligence.userLocations",
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
  const refs = await singleRefs(path, input, resolvers);
  for (const opId of refs.ops) {
    if (levelOf(opId) < need) {
      throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
    }
  }
  // A target belongs to its operations. Reading one is allowed when it has
  // none, or any is open to this person (the Intelligence profile scope, so
  // Region Search's "Open in Intelligence" works); changing one needs Log on
  // one of them.
  if (refs.targets.length > 0) {
    const groups = await resolvers.operationsOfTargets(refs.targets);
    const hidden = hiddenIntelligenceOperationIds(user, ops, shares);
    for (const group of Array.from(groups.values())) {
      if (group.length === 0) continue;
      const ok =
        type === "mutation"
          ? group.some(opId => levelOf(opId) >= need)
          : group.some(opId => !hidden.has(opId));
      if (!ok) {
        throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
      }
    }
  }

  // Lists: keep only what they can reach.
  const allowed = visibleOperationIds(user, ops, shares, need);
  // Mapping page reads also cover the operations shared at Investigator level.
  const mapOnly =
    type === "query" && MAP_VIEW_PATHS.has(path)
      ? mapOnlyOperationIds(user, ops, shares)
      : new Set<number>();
  mapOnly.forEach(id => allowed.add(id));
  if (Array.isArray(input.operationIds)) {
    input.operationIds = nums(input.operationIds).filter(i => allowed.has(i));
    changed = true;
    // targetIds is matched with OR against operationIds, so it must not be
    // able to pull in a target from an operation they only see on the map.
    if (
      mapOnly.size > 0 &&
      (input.operationIds as number[]).some(i => mapOnly.has(i))
    ) {
      delete input.targetIds;
    }
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
  mode: "browse" | "profile" = "browse",
  path?: string
): Promise<Set<number>> {
  const { ops, shares } = await loadAccessData();
  const hidden =
    mode === "profile"
      ? hiddenIntelligenceOperationIds(user, ops, shares)
      : hiddenBrowseOperationIds(user, ops, shares);
  // The Mapping page's own reads may show what was shared at Investigator level.
  if (path && MAP_VIEW_PATHS.has(path)) {
    mapOnlyOperationIds(user, ops, shares).forEach(id => hidden.delete(id));
  }
  return hidden;
}

/** Operations this person holds an Investigator-level share for. */
export async function mapOnlyFor(user: AccessUser): Promise<number[]> {
  const { ops, shares } = await loadAccessData();
  return Array.from(mapOnlyOperationIds(user, ops, shares));
}

/** Other Commands' operations shared with this person at any level. For an
 * Investigator login (map-only by role) these join the operations an admin
 * allocated to them. */
export async function sharedInOperationIds(
  user: AccessUser
): Promise<number[]> {
  const { ops, shares } = await loadAccessData();
  return ops
    .filter(
      op =>
        op.command !== user.command &&
        shares.some(
          s =>
            s.userId === user.id &&
            (s.operationId != null
              ? s.operationId === op.id
              : s.fromCommand != null && s.fromCommand === op.command)
        )
    )
    .map(op => op.id);
}

/** The operations the Mapping page may offer: everything they can open, plus
 * what was shared at Investigator level (those carry `mapOnly: true`). */
export async function operationsForMap<
  T extends { id: number; command: AccessUser["command"] },
>(
  user: AccessUser,
  rows: T[]
): Promise<
  Array<T & { accessLevel: AccessLevel; sharedIn: boolean; mapOnly?: boolean }>
> {
  const open = await operationsForUser(user, rows);
  const mapOnly = new Set(await mapOnlyFor(user));
  const have = new Set(open.map(o => o.id));
  const extra = rows
    .filter(r => mapOnly.has(r.id) && !have.has(r.id))
    .map(r => ({
      ...r,
      accessLevel: 0 as AccessLevel,
      sharedIn: true,
      mapOnly: true as const,
    }));
  return [...open, ...extra];
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

// ─── More filters for the lists that aren't tied to one operation id ────────
/** Operation ids open in Intelligence (the profile scope: everything except
 * other Commands' Restricted operations). null = all of them. */
export async function intelligenceOperationIds(
  user: AccessUser
): Promise<Set<number> | null> {
  const { ops, shares } = await loadAccessData();
  const hidden = hiddenIntelligenceOperationIds(user, ops, shares);
  if (hidden.size === 0) return null;
  return new Set(ops.filter(o => !hidden.has(o.id)).map(o => o.id));
}

/** Keep rows whose operation is open in Intelligence (profile scope). */
export async function filterByIntelligenceScope<T>(
  user: AccessUser,
  rows: T[],
  operationIdOf: (row: T) => number | null | undefined
): Promise<T[]> {
  const allowed = await intelligenceOperationIds(user);
  if (allowed === null) return rows;
  return rows.filter(r => {
    const id = operationIdOf(r);
    return id == null || allowed.has(id);
  });
}

/** Audit entries: those on a sheet follow that sheet's operation; system
 * entries (no sheet — users, shares, operations) stay with admins. */
export async function filterAuditLogs<T extends { sheetId: number }>(
  user: AccessUser,
  logs: T[]
): Promise<T[]> {
  const allowed = await accessibleOperationIds(user);
  if (allowed === null) return logs;
  const sheetIds = Array.from(
    new Set(logs.map(l => l.sheetId).filter(id => id > 0))
  );
  const opOf = await operationsOfSheets(sheetIds);
  return logs.filter(l => {
    if (l.sheetId <= 0) return user.role === "admin";
    const opId = opOf.get(l.sheetId);
    return opId == null || allowed.has(opId);
  });
}

/** Ids of people in the same Command as this person. */
export async function sameCommandUserIds(
  user: AccessUser
): Promise<Set<number>> {
  const all = await getAllUsers();
  return new Set(all.filter(u => u.command === user.command).map(u => u.id));
}

/** Live team locations: people in your own Command, plus anyone whose
 * operations include one you can reach. */
export async function filterLocationRows<
  T extends { userId: number; operationIds: string | number[] },
>(user: AccessUser, rows: T[]): Promise<T[]> {
  const allowed = await accessibleOperationIds(user);
  if (allowed === null) return rows;
  const mine = await sameCommandUserIds(user);
  return rows.filter(r => {
    if (mine.has(r.userId)) return true;
    let ids: unknown = r.operationIds;
    if (typeof ids === "string") {
      try {
        ids = JSON.parse(ids);
      } catch {
        return false;
      }
    }
    return (
      Array.isArray(ids) &&
      ids.some((i: unknown) => typeof i === "number" && allowed.has(i))
    );
  });
}

/** Command of each person, by id (empty when unknown). */
export async function commandsOfUsers(): Promise<
  Map<number, AccessUser["command"]>
> {
  const all = await getAllUsers();
  return new Map(all.map(u => [u.id, u.command]));
}
