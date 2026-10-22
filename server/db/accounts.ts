import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { isLoggedIn, type TeamMapVisibility } from "@shared/teamMap";

import type { CommandCode } from "@shared/commands";

import { type OperationShareRow } from "@shared/operationAccess";

import {
  InsertUser,
  operations,
  users,
  teams,
  operationShares,
  visitorTeamAssignments,
  userSidebarOrder,
  entityAliases,
  entityDedupDecisions,
} from "../../drizzle/schema";

import { type DedupType } from "../entityDedup";

import { crossOperationNames } from "../entityAttribution";

import { getDb } from "./core";
import {
  getAllIntelligenceEntities,
  invalidateIntelligenceCache,
} from "./reports";
import { computeEntityKey, normOnly } from "./intelligence";

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByCin(cin: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.cin, cin))
    .limit(1);
  return result[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function createUser(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(users).values(data);
  return result.insertId as number;
}

export async function updateUser(id: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, id));
}

// ─── Teams ──────────────────────────────────────────────────────────────────
// A team belongs to one Command; people point at it with users.teamId.

export interface TeamRow {
  id: number;
  command: CommandCode;
  name: string;
  /** #rrggbb pin colour on the live map, or null for the default grey. */
  colour: string | null;
  /** Assumed Identity phones (Crash Helper). */
  aiPhones: string[];
  sortOrder: number;
  /** Map Settings → Teams: always listed, or only while someone is logged in. */
  mapVisibility: TeamMapVisibility;
  /** Members' location sharing is forced on at login and can't be turned off. */
  forceShare: boolean;
  /** Offered as an "Add team" button on the New Running Sheet dialog. */
  offerOnNewSheet: boolean;
}

function toTeamRow(t: typeof teams.$inferSelect): TeamRow {
  let phones: string[] = [];
  try {
    const parsed = t.aiPhones ? JSON.parse(t.aiPhones) : [];
    if (Array.isArray(parsed))
      phones = parsed.filter((p): p is string => typeof p === "string");
  } catch {
    phones = [];
  }
  return {
    id: t.id,
    command: t.command,
    name: t.name,
    colour: t.colour,
    aiPhones: phones,
    sortOrder: t.sortOrder,
    mapVisibility: t.mapVisibility,
    forceShare: t.forceShare,
    offerOnNewSheet: t.offerOnNewSheet,
  };
}

/** Teams in display order; one Command's, or every Command's. */
export async function listTeams(command?: CommandCode): Promise<TeamRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(teams)
    .where(command ? eq(teams.command, command) : undefined)
    .orderBy(teams.sortOrder, teams.name);
  return rows.map(toTeamRow);
}

export async function getTeamById(id: number): Promise<TeamRow | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return row ? toTeamRow(row) : undefined;
}

/** True when this Command already has a team with that name. */
export async function teamNameTaken(
  command: CommandCode,
  name: string,
  exceptId?: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.command, command), eq(teams.name, name)));
  return rows.some(r => r.id !== exceptId);
}

export async function createTeam(data: {
  command: CommandCode;
  name: string;
  colour: string | null;
  aiPhones: string[];
  mapVisibility?: TeamMapVisibility;
  forceShare?: boolean;
  offerOnNewSheet?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [last] = await db
    .select({ sortOrder: teams.sortOrder })
    .from(teams)
    .where(eq(teams.command, data.command))
    .orderBy(desc(teams.sortOrder))
    .limit(1);
  const [result] = await db.insert(teams).values({
    command: data.command,
    name: data.name,
    colour: data.colour,
    aiPhones: data.aiPhones.length > 0 ? JSON.stringify(data.aiPhones) : null,
    sortOrder: (last?.sortOrder ?? 0) + 1,
    mapVisibility: data.mapVisibility ?? "always",
    forceShare: data.forceShare ?? false,
    offerOnNewSheet: data.offerOnNewSheet ?? true,
    createdAt: Date.now(),
  });
  return result.insertId as number;
}

export async function updateTeam(
  id: number,
  data: {
    name?: string;
    colour?: string | null;
    aiPhones?: string[];
    mapVisibility?: TeamMapVisibility;
    forceShare?: boolean;
    offerOnNewSheet?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Partial<typeof teams.$inferInsert> = {};
  if (data.name !== undefined) set.name = data.name;
  if (data.colour !== undefined) set.colour = data.colour;
  if (data.aiPhones !== undefined)
    set.aiPhones =
      data.aiPhones.length > 0 ? JSON.stringify(data.aiPhones) : null;
  if (data.mapVisibility !== undefined) set.mapVisibility = data.mapVisibility;
  if (data.forceShare !== undefined) set.forceShare = data.forceShare;
  if (data.offerOnNewSheet !== undefined)
    set.offerOnNewSheet = data.offerOnNewSheet;
  if (Object.keys(set).length === 0) return;
  await db.update(teams).set(set).where(eq(teams.id, id));
}

/** Ids of teams with someone logged in right now (see shared/teamMap.ts). */
export async function listTeamIdsWithOnlineMembers(
  now: number = Date.now()
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ teamId: users.teamId, lastSignedIn: users.lastSignedIn })
    .from(users)
    .where(and(isNotNull(users.teamId), isNull(users.archivedAt)));
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.teamId != null && isLoggedIn(r.lastSignedIn, now)) ids.add(r.teamId);
  }
  return Array.from(ids);
}

/** True when this person's team forces their location sharing on. */
export async function mustShareLocation(user: {
  teamId: number | null;
}): Promise<boolean> {
  if (user.teamId == null) return false;
  return (await getTeamById(user.teamId))?.forceShare ?? false;
}

/** Delete a team; its members simply become "No team". Returns how many. */
export async function deleteTeam(id: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const members = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.teamId, id));
  await db.update(users).set({ teamId: null }).where(eq(users.teamId, id));
  // Visitors put in this team go back to "no team" too.
  const visitors = await db
    .select({ id: visitorTeamAssignments.id })
    .from(visitorTeamAssignments)
    .where(eq(visitorTeamAssignments.teamId, id));
  await db
    .delete(visitorTeamAssignments)
    .where(eq(visitorTeamAssignments.teamId, id));
  await db.delete(teams).where(eq(teams.id, id));
  return members.length + visitors.length;
}

/** Team name by id, for the places that still show a plain label. */
export async function teamNameMap(): Promise<Map<number, string>> {
  const db = await getDb();
  const out = new Map<number, string>();
  if (!db) return out;
  for (const t of await db
    .select({ id: teams.id, name: teams.name })
    .from(teams))
    out.set(t.id, t.name);
  return out;
}

export async function updateUserRole(
  userId: number,
  role: "observer" | "member" | "admin"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function archiveUser(userId: number, archivedByCIN: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ archivedAt: Date.now(), archivedByCIN })
    .where(eq(users.id, userId));
}

export async function restoreUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ archivedAt: null, archivedByCIN: null })
    .where(eq(users.id, userId));
}

/** Parses a User row's investigatorOperationIds JSON column — empty for
 * every non-investigator, or an investigator with nothing granted yet.
 * The single point every operation-scoped query funnels an investigator's
 * request through (see server/_core/trpc.ts's INVESTIGATOR_ALLOWED_PATHS
 * for the matching procedure allowlist). */
export function getInvestigatorAllowedOperationIds(user: {
  role: string;
  investigatorOperationIds?: string | null;
}): number[] {
  if (user.role !== "investigator" || !user.investigatorOperationIds) return [];
  try {
    const parsed = JSON.parse(user.investigatorOperationIds);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

export async function updateLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, userId));
}

// Legacy upsert kept for OAuth callback compatibility
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  await db
    .insert(users)
    .values(user)
    .onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
}

// ─── Operation shares ────────────────────────────────────────────────────────
// A Command's admin gives named people in other Commands access to one
// operation, or to every operation the Command owns. The rule lives in
// shared/operationAccess.ts; these are just the rows.

export async function listOperationShares(opts?: {
  /** Only shares of what this Command owns. Omit for all. */
  fromCommand?: CommandCode;
  /** Only shares reaching this person. */
  userId?: number;
}): Promise<OperationShareRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: operationShares.id,
      operationId: operationShares.operationId,
      shareFromCommand: operationShares.fromCommand,
      opName: operations.name,
      opCommand: operations.command,
      userId: operationShares.userId,
      userName: users.name,
      userCIN: users.cin,
      userCommand: users.command,
      userTeam: teams.name,
      level: operationShares.level,
      sharedByCIN: operationShares.sharedByCIN,
      createdAt: operationShares.createdAt,
    })
    .from(operationShares)
    .innerJoin(users, eq(users.id, operationShares.userId))
    .leftJoin(teams, eq(teams.id, users.teamId))
    .leftJoin(operations, eq(operations.id, operationShares.operationId))
    .where(
      opts?.userId != null ? eq(operationShares.userId, opts.userId) : undefined
    )
    .orderBy(desc(operationShares.createdAt));
  const out: OperationShareRow[] = [];
  for (const r of rows) {
    const owner = (r.opCommand ?? r.shareFromCommand) as CommandCode | null;
    if (!owner) continue;
    if (opts?.fromCommand && owner !== opts.fromCommand) continue;
    out.push({
      id: r.id,
      operationId: r.operationId,
      operationName: r.opName ?? null,
      fromCommand: owner,
      userId: r.userId,
      userName: r.userName,
      userCIN: r.userCIN ?? null,
      userCommand: r.userCommand,
      userTeam: r.userTeam ?? null,
      level: r.level,
      sharedByCIN: r.sharedByCIN,
      createdAt: r.createdAt,
    });
  }
  return out;
}

/** Add or change one share. Returns whether it was new. */
export async function upsertOperationShare(data: {
  operationId: number | null;
  fromCommand: CommandCode | null;
  userId: number;
  level: "investigator" | "view" | "log" | "manage";
  sharedByCIN: string;
}): Promise<"created" | "updated"> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select({ id: operationShares.id })
    .from(operationShares)
    .where(
      and(
        eq(operationShares.userId, data.userId),
        data.operationId != null
          ? eq(operationShares.operationId, data.operationId)
          : isNull(operationShares.operationId),
        data.operationId == null && data.fromCommand
          ? eq(operationShares.fromCommand, data.fromCommand)
          : undefined
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(operationShares)
      .set({
        level: data.level,
        sharedByCIN: data.sharedByCIN,
        createdAt: Date.now(),
      })
      .where(eq(operationShares.id, existing[0].id));
    return "updated";
  }
  await db.insert(operationShares).values({
    operationId: data.operationId,
    fromCommand: data.operationId != null ? null : data.fromCommand,
    userId: data.userId,
    level: data.level,
    sharedByCIN: data.sharedByCIN,
    createdAt: Date.now(),
  });
  return "created";
}

export async function deleteOperationShare(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(operationShares).where(eq(operationShares.id, id));
}

// ─── Visitor team assignments ────────────────────────────────────────────────
// A person from another Command who was given access can be put in one of the
// HOSTING Command's teams (visitor_team_assignments). users.teamId is left
// alone — it stays their own Command's team.

export interface VisitorTeamRow {
  userId: number;
  /** The hosting Command (owner of the team). */
  command: CommandCode;
  teamId: number;
}

/** Assignments made by one hosting Command, or every Command's. */
export async function listVisitorTeams(
  command?: CommandCode | null
): Promise<VisitorTeamRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      userId: visitorTeamAssignments.userId,
      command: visitorTeamAssignments.command,
      teamId: visitorTeamAssignments.teamId,
    })
    .from(visitorTeamAssignments)
    .where(command ? eq(visitorTeamAssignments.command, command) : undefined);
  return rows;
}

/**
 * userId → teamId for the visitors a Command hosts. This is the one place the
 * "effective team" of a visitor is worked out; callers use it to override
 * users.teamId when they show people from the viewer's Command's side. With no
 * Command (an all-region view) every assignment counts.
 */
export async function visitorTeamMap(
  command?: CommandCode | null
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const r of await listVisitorTeams(command)) {
    if (!out.has(r.userId)) out.set(r.userId, r.teamId);
  }
  return out;
}

/**
 * The people from other Commands who are visiting a Command: someone it shared
 * an operation (or all its operations) with by name, or put in one of its
 * teams. Their home Command is somewhere else.
 */
export async function visitorUserIdsOf(
  command: CommandCode
): Promise<Set<number>> {
  const out = new Set<number>();
  for (const share of await listOperationShares({ fromCommand: command })) {
    if (share.userCommand !== command) out.add(share.userId);
  }
  for (const a of await listVisitorTeams(command)) out.add(a.userId);
  return out;
}

/** Put a visitor in a team of the hosting Command, or (null) take them out. */
export async function setVisitorTeam(data: {
  userId: number;
  command: CommandCode;
  teamId: number | null;
  assignedByCIN: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.teamId == null) {
    await clearVisitorTeam(data.userId, data.command);
    return;
  }
  const [existing] = await db
    .select({ id: visitorTeamAssignments.id })
    .from(visitorTeamAssignments)
    .where(
      and(
        eq(visitorTeamAssignments.userId, data.userId),
        eq(visitorTeamAssignments.command, data.command)
      )
    )
    .limit(1);
  if (existing) {
    await db
      .update(visitorTeamAssignments)
      .set({ teamId: data.teamId, assignedByCIN: data.assignedByCIN })
      .where(eq(visitorTeamAssignments.id, existing.id));
  } else {
    await db.insert(visitorTeamAssignments).values({
      userId: data.userId,
      command: data.command,
      teamId: data.teamId,
      assignedByCIN: data.assignedByCIN,
      createdAt: Date.now(),
    });
  }
}

export async function clearVisitorTeam(
  userId: number,
  command: CommandCode
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(visitorTeamAssignments)
    .where(
      and(
        eq(visitorTeamAssignments.userId, userId),
        eq(visitorTeamAssignments.command, command)
      )
    );
}

/**
 * Once the last share from a Command to a person is gone they are no longer a
 * visitor there, so their place in that Command's team goes with it.
 */
export async function clearVisitorTeamIfNoShares(
  userId: number,
  command: CommandCode
): Promise<void> {
  const remaining = await listOperationShares({
    userId,
    fromCommand: command,
  });
  if (remaining.length === 0) await clearVisitorTeam(userId, command);
}

export async function getOperationShareRow(id: number) {
  const rows = await listOperationShares();
  return rows.find(r => r.id === id);
}

export interface CrossOperationMatch {
  /** Every other operation (not the one the officer is currently working in)
   * that has a real observation of this exact entity. */
  operationNames: string[];
}

/**
 * Does this exact entity — not a near-miss, the same normalized key —
 * already have a real observation on a DIFFERENT operation? Deliberately the
 * opposite case findPossibleDuplicates excludes: an exact match silently
 * collapses into one shared entity via getAllIntelligenceEntities' key
 * normalization, which is correct for recognition, but means nobody is ever
 * told about it. On a surveillance operation, "the same address the team is
 * about to sit on is already a known entity under Operation X" is exactly
 * the kind of thing that must surface, not silently merge.
 *
 * Deliberately independent of findPossibleDuplicates/checkPossibleDuplicates
 * — a separate, additive check, not a variant of the near-duplicate prompt.
 * rowId > 0 only: a registry-only ("Indices") occurrence isn't a real
 * sighting anywhere, so it shouldn't trigger a cross-operation warning.
 */
export async function checkCrossOperationEntity(
  type: DedupType,
  label: string,
  currentOperationId: number
): Promise<CrossOperationMatch | null> {
  const allEntities = await getAllIntelligenceEntities();
  const candidateKey = computeEntityKey(type, label);
  const entity = allEntities.find(
    e =>
      !e.isTarget &&
      e.type === type &&
      computeEntityKey(type, e.shortForm) === candidateKey
  );
  if (!entity) return null;

  const operationNames = crossOperationNames(
    entity.occurrences,
    currentOperationId
  );
  if (!operationNames.length) return null;
  return { operationNames };
}

/** Records a confirmed "these are NOT the same entity" decision so the prompt never asks about this pair again. */
export async function markEntitiesNotDuplicate(
  type: DedupType,
  labelA: string,
  labelB: string,
  decidedByCIN: string | undefined
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const bareA = normOnly(type, labelA);
  const bareB = normOnly(type, labelB);
  if (bareA === bareB) return; // same normalized key — nothing to record
  const [keyA, keyB] = bareA < bareB ? [bareA, bareB] : [bareB, bareA];
  const existing = await db
    .select()
    .from(entityDedupDecisions)
    .where(
      and(
        eq(entityDedupDecisions.type, type),
        eq(entityDedupDecisions.keyA, keyA),
        eq(entityDedupDecisions.keyB, keyB)
      )
    )
    .limit(1);
  if (existing.length > 0) return;
  await db
    .insert(entityDedupDecisions)
    .values({ type, keyA, keyB, decidedByCIN, decidedAt: Date.now() });
}

/** Walks the existing alias chain from `winnerKey` to detect a would-be cycle before writing a new merge. */
async function wouldCreateAliasCycle(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  type: DedupType,
  winnerKey: string,
  loserKey: string
): Promise<boolean> {
  const rows = await db
    .select()
    .from(entityAliases)
    .where(eq(entityAliases.type, type));
  const map = new Map(rows.map(r => [r.loserKey, r.winnerKey]));
  let current = winnerKey;
  const seen = new Set<string>();
  while (map.has(current)) {
    if (seen.has(current)) return false; // pre-existing unrelated cycle — not ours to fix here
    seen.add(current);
    current = map.get(current)!;
    if (current === loserKey) return true;
  }
  return false;
}

/**
 * Confirms two entities are the same real-world thing. Used by both the
 * auto-detected duplicate prompt ("Yes") and the manual Merge Entities tool.
 * `winnerLabel` survives as the canonical entity; `loserLabel` is folded into
 * it and kept as an "also known as" — see aliasLabels on IntelligenceEntity.
 */
export async function mergeEntities(
  type: DedupType,
  winnerLabel: string,
  loserLabel: string,
  mergedByCIN: string | undefined
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const winnerKey = normOnly(type, winnerLabel);
  const loserKey = normOnly(type, loserLabel);
  if (winnerKey === loserKey)
    throw new Error("Cannot merge an entity into itself.");
  if (await wouldCreateAliasCycle(db, type, winnerKey, loserKey)) {
    throw new Error(
      "This merge would create a loop with an existing merge — check current merges first."
    );
  }
  const existing = await db
    .select()
    .from(entityAliases)
    .where(
      and(eq(entityAliases.type, type), eq(entityAliases.loserKey, loserKey))
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(entityAliases)
      .set({
        winnerKey,
        winnerLabel,
        loserLabel,
        mergedByCIN,
        mergedAt: Date.now(),
      })
      .where(eq(entityAliases.id, existing[0].id));
    invalidateIntelligenceCache();
  } else {
    await db.insert(entityAliases).values({
      type,
      loserKey,
      loserLabel,
      winnerKey,
      winnerLabel,
      mergedByCIN,
      mergedAt: Date.now(),
    });
  }
}

/** Reverses a previous merge. `loserKey` must be the bare key from an existing entity_aliases row (see listEntityMerges). */
export async function unmergeEntity(
  type: DedupType,
  loserKey: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(entityAliases)
    .where(
      and(eq(entityAliases.type, type), eq(entityAliases.loserKey, loserKey))
    );
}

export async function listEntityMerges() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(entityAliases).orderBy(desc(entityAliases.mergedAt));
}

// ─── User Sidebar Order ───────────────────────────────────────────────────────

export const DEFAULT_SIDEBAR_ORDER = [
  "operations",
  "governance",
  "todo",
  "mapping",
  "images",
  "calendar",
  "shortcuts",
  "intelligence",
  "targetRegistry",
  "operationManager",
];

export async function getSidebarOrder(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return DEFAULT_SIDEBAR_ORDER;
  const rows = await db
    .select()
    .from(userSidebarOrder)
    .where(eq(userSidebarOrder.userId, userId))
    .limit(1);
  if (rows.length === 0) return DEFAULT_SIDEBAR_ORDER;
  try {
    const parsed = JSON.parse(rows[0].orderedKeys);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* fall through */
  }
  return DEFAULT_SIDEBAR_ORDER;
}

export async function setSidebarOrder(
  userId: number,
  orderedKeys: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const json = JSON.stringify(orderedKeys);
  const existing = await db
    .select({ id: userSidebarOrder.id })
    .from(userSidebarOrder)
    .where(eq(userSidebarOrder.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(userSidebarOrder)
      .set({ orderedKeys: json })
      .where(eq(userSidebarOrder.userId, userId));
  } else {
    await db.insert(userSidebarOrder).values({ userId, orderedKeys: json });
  }
}
