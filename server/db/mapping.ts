import { signIconOf } from "@shared/placeSigns";

import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";

import { formatIntelAddress } from "@shared/addressFormat";

import {
  operations,
  sheetRows,
  targets,
  associates,
  users,
  teams,
  operationTargetLinks,
  userLocations,
  userLocationHistory,
  customMapMarkers,
  CustomMapMarker,
  InsertCustomMapMarker,
  intelPinOverrides,
  IntelPinOverride,
  InsertIntelPinOverride,
  mapShapes,
  MapShape,
  InsertMapShape,
  rsMappingWaypoints,
} from "../../drizzle/schema";

import { getAllIntelligenceEntities } from "./reports";
import { getDb } from "./core";
import { IntelligenceEntity, extractEntitiesFromText } from "./intelligence";

// ─── Intelligence Mapping ─────────────────────────────────────────────────────

export interface IntelMapLocation {
  label: string;
  /** "target_address": a target's own registered home address. "observation":
   * genuinely mentioned in at least one running sheet row (mined from
   * observation text — see Step 2 below). "associate_address": an
   * associate's registered address that has never actually been observed
   * in a running sheet — kept distinct from "observation" so the map
   * doesn't claim something was seen that was only ever typed into a
   * registry card. Upgraded to "observation" the moment a real occurrence
   * is found for the same address (Step 2). */
  type: "target_address" | "associate_address" | "observation";
  /** Targets whose registered details (HBF/V1F/V2F) include this location */
  linkedTargets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    operationId: number | null;
    operationName: string | null;
    /** Set when this pin is one of the target's Additional Addresses (e.g. "Work — KFC Cannington") rather than the home address or a co-occurrence match */
    addressLabel: string | null;
  }>;
  /** Associates (non-target persons) seen at this location in observation rows */
  assocPersons: string[];
  /** Vehicles seen at this location in observation rows */
  assocVehicles: string[];
  /** Total link count (targets + assocPersons + assocVehicles) */
  linkCount: number;
  /** Only what running-sheet observations recorded at this location (the
   * fields above also carry registry-derived entries): target names, other
   * people, and vehicles. The map popup's OBSERVATIONS block. */
  observedTargets: string[];
  observedPersons: string[];
  observedVehicles: string[];
}

export async function getIntelMappingLocations(
  operationIds?: number[],
  targetIds?: number[]
): Promise<IntelMapLocation[]> {
  const allEntities = await getAllIntelligenceEntities();

  // Filter entities to only those in the requested operations/targets.
  // IMPORTANT: if neither filter is active, return nothing (empty map) rather than everything.
  const filterByOp = operationIds && operationIds.length > 0;
  const filterByTarget = targetIds && targetIds.length > 0;

  if (!filterByOp && !filterByTarget) return [];

  const filteredEntities = allEntities.filter(e => {
    if (!filterByOp && !filterByTarget) return true;
    const opIds = e.occurrences.map(o => o.operationId).filter(id => id > 0);
    const tgtMatch =
      filterByTarget &&
      e.isTarget &&
      e.targetId != null &&
      targetIds!.includes(e.targetId);
    const opMatch = filterByOp && opIds.some(id => operationIds!.includes(id));
    return tgtMatch || opMatch || (!filterByTarget && opMatch);
  });

  // Build a set of target entities that pass the filter
  const filteredTargetEntities = filteredEntities.filter(
    e => e.isTarget && e.targetId != null
  );
  const filteredTargetIds = new Set(
    filteredTargetEntities.map(e => e.targetId!)
  );

  // Load full target card details for filtered targets
  const db = await getDb();
  if (!db) return [];

  const allTargetRows = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      extraAddresses: targets.extraAddresses,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId!, operations.id))
    .where(isNull(targets.deletedAt));

  // Also load registry-linked targets
  const linkedTargetRows = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      extraAddresses: targets.extraAddresses,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(
      operationTargetLinks,
      eq(operationTargetLinks.targetId, targets.id)
    )
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(isNull(targets.deletedAt));

  // Merge, prefer linked rows
  const seenPairs = new Set<string>();
  const allTargetData: typeof allTargetRows = [];
  for (const r of linkedTargetRows) {
    seenPairs.add(`${r.id}::${r.operationId}`);
    allTargetData.push(r);
  }
  for (const r of allTargetRows) {
    if (!seenPairs.has(`${r.id}::${r.operationId}`)) allTargetData.push(r);
  }

  // Only keep targets that pass the filter.
  // If filteredTargetIds is empty (no targets linked to this operation), skip target card rendering
  // but still allow observation-based intel (addresses, vehicles, persons) to show.
  const relevantTargets =
    filteredTargetIds.size === 0
      ? []
      : allTargetData.filter(t => filteredTargetIds.has(t.id));

  // Build location map: label (lowercase) -> IntelMapLocation
  const locationMap = new Map<string, IntelMapLocation>();

  // Every caller runs its label through here before keying, so a target's
  // raw registry text ("101 Eric Street, COTTESLOE WA (101 Eric Street)")
  // and an already-formatted observation-derived label ("101 Eric Street,
  // COTTESLOE") converge on the identical key instead of producing two
  // separate pins for the same real place — formatIntelAddress is
  // idempotent, so normalizing an already-clean label is a no-op. Without
  // this, a target's home address (registry) and its own text-mined
  // mentions (observation) key apart and never merge — the "double-stacked
  // popup" bug: a red TARGET ADDRESS card and a purple OBSERVED LOCATION
  // card both pinned at the exact same address.
  const ensureLocation = (label: string): IntelMapLocation => {
    const normalized = formatIntelAddress(label) || label.trim();
    const key = normalized.toLowerCase().trim();
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        label: normalized,
        type: "observation",
        linkedTargets: [],
        assocPersons: [],
        assocVehicles: [],
        linkCount: 0,
        observedTargets: [],
        observedPersons: [],
        observedVehicles: [],
      });
    }
    return locationMap.get(key)!;
  };

  // Step 1: Register target card addresses as target_address type
  for (const t of relevantTargets) {
    const addrFields = [t.hbf?.trim() || t.hb?.trim() || null].filter(
      Boolean
    ) as string[];
    for (const addr of addrFields) {
      const loc = ensureLocation(addr);
      loc.type = "target_address";
      // Add this target to linkedTargets if not already there
      if (!loc.linkedTargets.find(lt => lt.targetId === t.id)) {
        loc.linkedTargets.push({
          targetId: t.id,
          name: t.name,
          tgt: t.tgt,
          hbf: t.hbf?.trim() || t.hb?.trim() || null,
          v1f: t.v1f?.trim() || t.v1?.trim() || null,
          v2f: t.v2f?.trim() || t.v2?.trim() || null,
          operationId: t.operationId ?? null,
          operationName: t.operationName ?? null,
          addressLabel: null,
        });
      }
    }

    // Additional Addresses from the target's Add Target form (e.g. "Work —
    // KFC Cannington") get their own pins too — purple (observation), same
    // as any other non-home location, since only the home address counts as
    // "target_address" red. Each still carries the target's card details so
    // the popup reads exactly like the home-address pin, plus the address's
    // own label to say which additional address this is.
    let extraAddrs: { full?: string; label?: string }[] = [];
    try {
      extraAddrs = t.extraAddresses ? JSON.parse(t.extraAddresses) : [];
    } catch {
      extraAddrs = [];
    }
    for (const ea of extraAddrs) {
      const addr = ea.full?.trim();
      if (!addr) continue;
      const loc = ensureLocation(addr);
      // Don't downgrade a pin that's already this target's (or another
      // target's) home address at the same spot.
      if (loc.type !== "target_address") loc.type = "observation";
      if (!loc.linkedTargets.find(lt => lt.targetId === t.id)) {
        loc.linkedTargets.push({
          targetId: t.id,
          name: t.name,
          tgt: t.tgt,
          hbf: t.hbf?.trim() || t.hb?.trim() || null,
          v1f: t.v1f?.trim() || t.v1?.trim() || null,
          v2f: t.v2f?.trim() || t.v2?.trim() || null,
          operationId: t.operationId ?? null,
          operationName: t.operationName ?? null,
          addressLabel: ea.label?.trim() || "Additional address",
        });
      }
    }
  }

  // Step 1b: Register each relevant target's associates' own registered
  // addresses too — same idea as Step 1, but an associate isn't a target
  // (no operationTargetLinks row of its own), so it can never appear via
  // Step 1's target loop. Without this, an associate's HBF/HB only ever
  // shows up on the map if that address text also happens to get mined
  // from an observation row — adding an associate to the Target Registry
  // alone produced no pin at all. Always purple/"observation" (never
  // upgraded to target_address — that colour is reserved for the target's
  // own home address), listed by name in assocPersons like any other
  // co-occurring person rather than linkedTargets, since an associate has
  // no targetId of its own to key that array on.
  if (relevantTargets.length > 0) {
    const relevantTargetIds = relevantTargets.map(t => t.id);
    const relevantAssociates = await db
      .select({
        name: associates.name,
        hbf: associates.hbf,
        hb: associates.hb,
        extraAddresses: associates.extraAddresses,
      })
      .from(associates)
      .where(
        and(
          inArray(associates.targetId, relevantTargetIds),
          isNull(associates.deletedAt)
        )
      );
    for (const a of relevantAssociates) {
      const addrFields = [a.hbf?.trim() || a.hb?.trim() || null].filter(
        Boolean
      ) as string[];
      let extraAddrs: { full?: string }[] = [];
      try {
        extraAddrs = a.extraAddresses ? JSON.parse(a.extraAddresses) : [];
      } catch {
        extraAddrs = [];
      }
      for (const ea of extraAddrs) {
        const addr = ea.full?.trim();
        if (addr) addrFields.push(addr);
      }
      for (const addr of addrFields) {
        const loc = ensureLocation(addr);
        // Registered-only until Step 2 proves an actual observation at this
        // address — never downgrade a "target_address"/"observation" pin
        // that's already stronger (e.g. this associate shares a target's
        // home address, or the address was already mined from real text).
        if (loc.type === "observation") loc.type = "associate_address";
        if (!loc.assocPersons.includes(a.name)) loc.assocPersons.push(a.name);
      }
    }
  }

  // Step 2: Use entity co-occurrence to populate observation locations with persons/vehicles
  // Get all location entities (address + business) from filtered set
  const locationEntities = filteredEntities.filter(
    e => e.type === "address" || e.type === "business"
  );

  // Build a rowId -> [entity] map for co-occurrence
  const rowEntityMap = new Map<number, IntelligenceEntity[]>();
  for (const e of filteredEntities) {
    for (const occ of e.occurrences) {
      if (occ.rowId <= 0) continue;
      if (!rowEntityMap.has(occ.rowId)) rowEntityMap.set(occ.rowId, []);
      rowEntityMap.get(occ.rowId)!.push(e);
    }
  }

  for (const locEntity of locationEntities) {
    // Collect all rowIds for this location entity
    const locRowIds = new Set(
      locEntity.occurrences.filter(o => o.rowId > 0).map(o => o.rowId)
    );
    // An entity with no real (rowId > 0) occurrence has never actually been
    // observed — it exists only because it's typed into a registry card
    // (isIndicesOnly). Registering it here would create a spurious
    // "observation" pin for a place nobody has ever been seen at. This
    // matters especially for a target's own home address: before registry
    // addresses were tidied for display (17e2229), this entity's shortForm
    // was the same raw HBF text Step 1 keys the "target_address" pin on, so
    // ensureLocation's string-keyed dedup happened to collapse them into
    // one. Tidying formatted the two labels differently, so they now key
    // apart — producing a second, phantom "OBSERVED LOCATION" card for the
    // exact same address with nothing behind it.
    if (locRowIds.size === 0) continue;
    const loc = ensureLocation(locEntity.shortForm);
    // A real occurrence proves this address was actually observed — upgrade
    // it off "associate_address" (registered-only) even if Step 1b already
    // staked a claim here first. Never touches "target_address".
    if (loc.type === "associate_address") loc.type = "observation";
    for (const rowId of Array.from(locRowIds)) {
      const coEntities = rowEntityMap.get(rowId) ?? [];
      for (const co of coEntities) {
        if (co === locEntity) continue;
        if (co.isTarget) {
          // Add to linkedTargets if not already there
          const tData = relevantTargets.find(t => t.id === co.targetId);
          if (tData && !loc.observedTargets.includes(tData.name))
            loc.observedTargets.push(tData.name);
          if (
            tData &&
            !loc.linkedTargets.find(lt => lt.targetId === co.targetId)
          ) {
            // Do NOT upgrade type here — only target card addresses are "target_address"
            // Observation locations stay purple even if a target co-occurs in the same row
            loc.linkedTargets.push({
              targetId: tData.id,
              name: tData.name,
              tgt: tData.tgt,
              hbf: tData.hbf?.trim() || tData.hb?.trim() || null,
              v1f: tData.v1f?.trim() || tData.v1?.trim() || null,
              v2f: tData.v2f?.trim() || tData.v2?.trim() || null,
              addressLabel: null,
              operationId: tData.operationId ?? null,
              operationName: tData.operationName ?? null,
            });
          }
        } else if (co.type === "person") {
          if (!loc.assocPersons.includes(co.shortForm)) {
            loc.assocPersons.push(co.shortForm);
          }
          if (!loc.observedPersons.includes(co.shortForm)) {
            loc.observedPersons.push(co.shortForm);
          }
        } else if (co.type === "vehicle") {
          if (!loc.assocVehicles.includes(co.shortForm)) {
            loc.assocVehicles.push(co.shortForm);
          }
          if (!loc.observedVehicles.includes(co.shortForm)) {
            loc.observedVehicles.push(co.shortForm);
          }
        }
      }
    }
  }

  // Step 3: Compute link counts and return
  const result: IntelMapLocation[] = [];
  for (const loc of Array.from(locationMap.values())) {
    loc.linkCount =
      loc.linkedTargets.length +
      loc.assocPersons.length +
      loc.assocVehicles.length;
    result.push(loc);
  }

  // Sort: target_address entries first (so they geocode before observations and win proximity merge),
  // then alphabetically within each type
  return result.sort((a, b) => {
    if (a.type === "target_address" && b.type !== "target_address") return -1;
    if (a.type !== "target_address" && b.type === "target_address") return 1;
    return a.label.localeCompare(b.label);
  });
}

// ─── User Location Helpers ────────────────────────────────────────────────────

export interface UserLocationRow {
  userId: number;
  deviceId: string;
  name: string;
  role: "observer" | "member" | "admin" | "investigator";
  /** The person's team (see teams), for pin grouping and colour. */
  teamId: number | null;
  teamName: string | null;
  teamColour: string | null;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  operationIds: number[];
  updatedAt: number;
  onFoot: boolean;
  pinGender: "neutral" | "male" | "female";
  pinSkinTone: "default" | "brown";
  pinVehicleIcon:
    | "arrow"
    | "dart"
    | "cursor"
    | "finger"
    | "up_arrow_emoji"
    | "rocket"
    | "airplane"
    | "pizza"
    | "car"
    | "racing_car"
    | "motorcycle"
    | "truck"
    | "police_car";
  pinColor: string | null;
}

/**
 * Returns all users who have sharingEnabled=true and whose location was updated
 * within the last 90 seconds (server-side expiry — no client cleanup needed).
 * Visibility is NOT filtered by operationIds — any sharing user is visible to
 * any viewer regardless of which operations either party has selected.
 */
export async function getUserLocations(
  _callerOpIds: number[]
): Promise<UserLocationRow[]> {
  const db = await getDb();
  if (!db) return [];
  const expiryMs = Date.now() - 90_000; // 90 seconds ago
  const rows = await db
    .select({
      userId: userLocations.userId,
      deviceId: userLocations.deviceId,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      teamName: teams.name,
      teamColour: teams.colour,
      lat: userLocations.lat,
      lng: userLocations.lng,
      speed: userLocations.speed,
      heading: userLocations.heading,
      operationIds: userLocations.operationIds,
      updatedAt: userLocations.updatedAt,
      onFoot: users.onFoot,
      pinGender: users.pinGender,
      pinSkinTone: users.pinSkinTone,
      pinVehicleIcon: users.pinVehicleIcon,
      pinColor: users.pinColor,
    })
    .from(userLocations)
    .innerJoin(users, eq(users.id, userLocations.userId))
    .leftJoin(teams, eq(teams.id, users.teamId))
    .where(
      and(
        eq(userLocations.sharingEnabled, true),
        gt(userLocations.updatedAt, expiryMs)
      )
    );

  return rows.map(r => {
    let opIds: number[] = [];
    try {
      opIds = JSON.parse(r.operationIds || "[]");
    } catch {
      opIds = [];
    }
    return { ...r, operationIds: opIds };
  });
}

/**
 * Sets a user's own "on foot" flag (see users.onFoot) — swaps their live
 * team pin's heading arrow for a walking glyph on every viewer's map, not
 * just their own. Caller must scope userId to the requesting user's own id
 * (see the users.setOnFoot router procedure) — there is no admin/team-lead
 * override to set this for someone else.
 */
export async function setUserOnFoot(
  userId: number,
  onFoot: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ onFoot }).where(eq(users.id, userId));
}

/**
 * Sets a user's own pin-appearance prefs (see users.pinGender/pinSkinTone/
 * pinVehicleIcon) — same broadcast-to-every-viewer / self-only-scoping
 * rules as setUserOnFoot above. Partial: only the provided fields change.
 */
export async function setUserPinAppearance(
  userId: number,
  prefs: {
    pinGender?: "neutral" | "male" | "female";
    pinSkinTone?: "default" | "brown";
    pinVehicleIcon?:
      | "arrow"
      | "dart"
      | "cursor"
      | "finger"
      | "up_arrow_emoji"
      | "rocket"
      | "airplane"
      | "pizza"
      | "car"
      | "racing_car"
      | "motorcycle"
      | "truck"
      | "police_car";
    pinColor?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(prefs).where(eq(users.id, userId));
}

/**
 * Upserts a user's location record. Creates if not exists, updates if exists.
 */
export async function upsertUserLocation(
  userId: number,
  deviceId: string,
  lat: number,
  lng: number,
  operationIds: number[],
  sharingEnabled: boolean,
  speed: number | null,
  heading: number | null,
  accuracy: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const opIdsJson = JSON.stringify(operationIds);
  await db
    .insert(userLocations)
    .values({
      userId,
      deviceId,
      lat,
      lng,
      speed,
      heading,
      accuracy,
      operationIds: opIdsJson,
      sharingEnabled,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        lat,
        lng,
        speed,
        heading,
        accuracy,
        operationIds: opIdsJson,
        sharingEnabled,
        updatedAt: now,
      },
    });

  if (sharingEnabled) {
    await recordUserLocationHistory(
      userId,
      deviceId,
      lat,
      lng,
      speed,
      heading,
      accuracy,
      opIdsJson,
      now
    );
  }

  // Auto-cleanup: remove stale rows for this user that are not sharing and older than 2 hours.
  // This prevents accumulation of orphaned device rows from old sessions.
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  await db
    .delete(userLocations)
    .where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.sharingEnabled, false),
        lt(userLocations.updatedAt, twoHoursAgo)
      )
    );
}

/**
 * Disables location sharing for a user (sets sharingEnabled=false).
 */
export async function clearUserLocation(
  userId: number,
  deviceId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(userLocations)
    .set({ sharingEnabled: false, updatedAt: Date.now() })
    .where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.deviceId, deviceId)
      )
    );
}

/**
 * Returns the current location/sharing state for a single user.
 */
export async function getUserLocationState(
  userId: number,
  deviceId: string
): Promise<{
  sharingEnabled: boolean;
  operationIds: number[];
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      sharingEnabled: userLocations.sharingEnabled,
      operationIds: userLocations.operationIds,
    })
    .from(userLocations)
    .where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.deviceId, deviceId)
      )
    )
    .limit(1);
  if (!rows.length) return null;
  let opIds: number[] = [];
  try {
    opIds = JSON.parse(rows[0].operationIds || "[]");
  } catch {
    opIds = [];
  }
  return { sharingEnabled: rows[0].sharingEnabled, operationIds: opIds };
}

// ─── User Location History (trail / live trace) ────────────────────────────────

function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Only append a trail point when the officer has moved a meaningful distance
// since the last recorded point, or enough time has passed. A slower
// stationary heartbeat still keeps the trail continuous (and useful for
// "where was officer X at time Y") when parked.
//
// These are tuned for a vehicle. At 10 m / 2 s a car records continuously
// from about 18 km/h up — 2 s apart at 50 km/h is a point every ~28 m, which
// draws a road-following line rather than the corner-cutting chords the old
// 25 m / 15 s pair produced (a point every ~208 m at 50 km/h). Below ~18 km/h
// the distance gate takes over and spaces points out again, which is what you
// want at walking pace or crawling a car park.
const HISTORY_MOVE_THRESHOLD_M = 10;

const HISTORY_MOVING_MIN_INTERVAL_MS = 2_000;

const HISTORY_STATIONARY_HEARTBEAT_MS = 120_000;

/**
 * A 10 m movement gate is inside the error margin of a poor GPS fix, so a
 * parked car with ±20 m drift would otherwise write a point every 2 seconds
 * and draw itself wandering around the street. Fixes vaguer than this are
 * treated as noise for movement purposes — the stationary heartbeat below
 * still records them, so the trail stays continuous either way.
 */
const HISTORY_MAX_ACCURACY_M = 50;

// The trail is only ever read from the moment someone switches Track on, so
// points older than this are dead weight (the table grows by a point every few
// seconds per person on the move). Purged opportunistically — no cron, same as
// purgeExpiredNotifications — at most once an hour, from the write path below
// and once at startup.
export const LOCATION_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const LOCATION_HISTORY_PURGE_EVERY_MS = 60 * 60 * 1000;

const LOCATION_HISTORY_PURGE_BATCH = 5000;

let lastLocationHistoryPurge = 0;

/** Deletes trail points older than 7 days, in batches so no long table lock.
 * Returns how many were removed. */
export async function purgeOldLocationHistory(
  now = Date.now()
): Promise<number> {
  lastLocationHistoryPurge = now;
  const db = await getDb();
  if (!db) return 0;
  const cutoff = now - LOCATION_HISTORY_MAX_AGE_MS;
  let removed = 0;
  for (;;) {
    const [res] = (await db.execute(
      sql`DELETE FROM user_location_history WHERE recordedAt < ${cutoff} LIMIT ${LOCATION_HISTORY_PURGE_BATCH}`
    )) as unknown as [{ affectedRows?: number }];
    const n = Number(res?.affectedRows ?? 0);
    removed += n;
    if (n < LOCATION_HISTORY_PURGE_BATCH) break;
  }
  return removed;
}

async function recordUserLocationHistory(
  userId: number,
  deviceId: string,
  lat: number,
  lng: number,
  speed: number | null,
  heading: number | null,
  accuracy: number | null,
  operationIdsJson: string,
  now: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [lastPoint] = await db
    .select({
      lat: userLocationHistory.lat,
      lng: userLocationHistory.lng,
      recordedAt: userLocationHistory.recordedAt,
    })
    .from(userLocationHistory)
    .where(
      and(
        eq(userLocationHistory.userId, userId),
        eq(userLocationHistory.deviceId, deviceId)
      )
    )
    .orderBy(desc(userLocationHistory.recordedAt))
    .limit(1);

  let shouldRecord = !lastPoint;
  if (lastPoint) {
    const elapsed = now - lastPoint.recordedAt;
    const distance = haversineMetres(lastPoint.lat, lastPoint.lng, lat, lng);
    // A vague fix can "move" 10 m while the vehicle is stationary, so it
    // only counts as movement when the fix is accurate enough to trust.
    const fixIsPrecise = accuracy == null || accuracy <= HISTORY_MAX_ACCURACY_M;
    if (
      fixIsPrecise &&
      distance >= HISTORY_MOVE_THRESHOLD_M &&
      elapsed >= HISTORY_MOVING_MIN_INTERVAL_MS
    ) {
      shouldRecord = true;
    } else if (elapsed >= HISTORY_STATIONARY_HEARTBEAT_MS) {
      shouldRecord = true;
    }
  }
  if (!shouldRecord) return;

  if (now - lastLocationHistoryPurge >= LOCATION_HISTORY_PURGE_EVERY_MS) {
    // Fire and forget: a failed purge must never lose a position.
    purgeOldLocationHistory(now).catch(() => {});
  }

  await db.insert(userLocationHistory).values({
    userId,
    deviceId,
    lat,
    lng,
    speed,
    heading,
    accuracy,
    operationIds: operationIdsJson,
    recordedAt: now,
  });
}

export interface UserLocationHistoryPointDTO {
  lat: number;
  lng: number;
  speed: number | null;
  recordedAt: number;
}

/**
 * Returns each requested user's recorded location trail since `sinceMs`,
 * ordered oldest-first, for drawing a live-trace line on the map. Grouped by
 * userId (not deviceId) since a single officer's trail should read as one
 * continuous line regardless of which device recorded which point.
 */
export async function getUserLocationHistories(
  userIds: number[],
  sinceMs: number
): Promise<Record<number, UserLocationHistoryPointDTO[]>> {
  const db = await getDb();
  const result: Record<number, UserLocationHistoryPointDTO[]> = {};
  if (!db || userIds.length === 0) return result;

  const rows = await db
    .select({
      userId: userLocationHistory.userId,
      lat: userLocationHistory.lat,
      lng: userLocationHistory.lng,
      speed: userLocationHistory.speed,
      recordedAt: userLocationHistory.recordedAt,
    })
    .from(userLocationHistory)
    .where(
      and(
        inArray(userLocationHistory.userId, userIds),
        gt(userLocationHistory.recordedAt, sinceMs)
      )
    )
    .orderBy(asc(userLocationHistory.recordedAt));

  for (const r of rows) {
    if (!result[r.userId]) result[r.userId] = [];
    result[r.userId].push({
      lat: r.lat,
      lng: r.lng,
      speed: r.speed,
      recordedAt: r.recordedAt,
    });
  }
  return result;
}

// ─── Custom Map Markers ───────────────────────────────────────────────────────

export interface CustomMarkerRow {
  id: number;
  createdBy: number;
  operationId: number | null;
  targetId: number | null;
  lat: number;
  lng: number;
  label: string | null;
  labelOnly: boolean;
  address: string | null;
  markerIcon: string;
  markerColour: string;
  note: string | null;
  assocPersons: string[]; // parsed from JSON
  assocVehicles: string[]; // parsed from JSON
  rotation: number;
  linkedIntelLabel: string | null;
  deletedAt: number | null;
  deletedByCIN: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function parseMarkerRow(row: CustomMapMarker): CustomMarkerRow {
  let persons: string[] = [];
  let vehicles: string[] = [];
  try {
    persons = JSON.parse(row.assocPersons || "[]");
  } catch {
    persons = [];
  }
  try {
    vehicles = JSON.parse(row.assocVehicles || "[]");
  } catch {
    vehicles = [];
  }
  return {
    ...row,
    assocPersons: persons,
    assocVehicles: vehicles,
    rotation: row.rotation ?? 0,
    linkedIntelLabel: row.linkedIntelLabel ?? null,
    deletedAt: row.deletedAt ?? null,
    deletedByCIN: row.deletedByCIN ?? null,
  };
}

export async function getCustomMarkers(
  operationIds?: number[]
): Promise<CustomMarkerRow[]> {
  const db = await getDb();
  if (!db) return [];
  let rows: CustomMapMarker[];
  if (operationIds !== undefined && operationIds.length === 0) {
    // No operations selected — return nothing (matches intel layer behaviour)
    return [];
  } else if (operationIds && operationIds.length > 0) {
    // Only include markers explicitly assigned to the selected operations.
    // Markers with no operation (null) are excluded when a specific op filter is active
    // — they only appear in the all-ops view (no filter selected).
    rows = await db
      .select()
      .from(customMapMarkers)
      .where(
        and(
          inArray(customMapMarkers.operationId, operationIds),
          isNull(customMapMarkers.deletedAt)
        )
      )
      .orderBy(desc(customMapMarkers.createdAt));
  } else {
    // operationIds is undefined = all-ops view, return all markers
    rows = await db
      .select()
      .from(customMapMarkers)
      .where(isNull(customMapMarkers.deletedAt))
      .orderBy(desc(customMapMarkers.createdAt));
  }
  return rows.map(parseMarkerRow);
}

export async function createCustomMarker(data: {
  createdBy: number;
  operationId?: number | null;
  targetId?: number | null;
  lat: number;
  lng: number;
  label?: string | null;
  labelOnly?: boolean;
  address?: string | null;
  markerIcon: string;
  markerColour: string;
  note?: string | null;
  assocPersons?: string[];
  assocVehicles?: string[];
  rotation?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(customMapMarkers).values({
    createdBy: data.createdBy,
    operationId: data.operationId ?? null,
    targetId: data.targetId ?? null,
    lat: data.lat,
    lng: data.lng,
    label: data.label ?? null,
    labelOnly: data.labelOnly ?? false,
    address: data.address ?? null,
    markerIcon: data.markerIcon,
    markerColour: data.markerColour,
    note: data.note ?? null,
    assocPersons: JSON.stringify(data.assocPersons ?? []),
    assocVehicles: JSON.stringify(data.assocVehicles ?? []),
    rotation: data.rotation ?? 0,
  });
  return (result as any).insertId as number;
}

export async function updateCustomMarker(
  id: number,
  data: {
    label?: string | null;
    labelOnly?: boolean;
    address?: string | null;
    lat?: number;
    lng?: number;
    markerIcon?: string;
    markerColour?: string;
    note?: string | null;
    operationId?: number | null;
    targetId?: number | null;
    assocPersons?: string[];
    assocVehicles?: string[];
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Partial<InsertCustomMapMarker> = {};
  if (data.label !== undefined) update.label = data.label;
  if (data.labelOnly !== undefined) update.labelOnly = data.labelOnly;
  if (data.address !== undefined) update.address = data.address;
  if (data.lat !== undefined) (update as any).lat = data.lat;
  if (data.lng !== undefined) (update as any).lng = data.lng;
  if (data.markerIcon !== undefined) update.markerIcon = data.markerIcon;
  if (data.markerColour !== undefined) update.markerColour = data.markerColour;
  if (data.note !== undefined) update.note = data.note;
  if (data.operationId !== undefined) update.operationId = data.operationId;
  if (data.targetId !== undefined) update.targetId = data.targetId;
  if (data.assocPersons !== undefined)
    update.assocPersons = JSON.stringify(data.assocPersons);
  if (data.assocVehicles !== undefined)
    update.assocVehicles = JSON.stringify(data.assocVehicles);
  if ((data as any).rotation !== undefined)
    (update as any).rotation = (data as any).rotation;
  if ((data as any).linkedIntelLabel !== undefined)
    (update as any).linkedIntelLabel = (data as any).linkedIntelLabel;
  if (Object.keys(update).length > 0) {
    await db
      .update(customMapMarkers)
      .set(update)
      .where(eq(customMapMarkers.id, id));
  }
}

export async function softDeleteCustomMarker(
  id: number,
  cin: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(customMapMarkers)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(customMapMarkers.id, id));
}

export async function reinstateCustomMarker(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(customMapMarkers)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(customMapMarkers.id, id));
}

export async function hardDeleteCustomMarker(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(customMapMarkers).where(eq(customMapMarkers.id, id));
}

// ─── Map Shapes ─────────────────────────────────────────────────────────────
// Transparent annotation shapes (circle/rectangle/sector/line) a user draws
// on the intelligence map — see the mapShapes schema comment for which
// geometry columns apply to which shapeType. Mirrors customMapMarkers'
// list/create/update/soft-delete pattern above.

export interface MapShapeRow {
  id: number;
  createdBy: number;
  operationId: number | null;
  shapeType: "circle" | "rectangle" | "sector" | "line";
  colour: string;
  opacity: number;
  label: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number | null;
  startAngle: number | null;
  endAngle: number | null;
  neLat: number | null;
  neLng: number | null;
  swLat: number | null;
  swLng: number | null;
  rotation: number; // rectangle only — degrees, 0 = unrotated
  points: { lat: number; lng: number }[]; // parsed from JSON
  lineDashed: boolean;
  lineArrowEnd: boolean;
  deletedAt: number | null;
  deletedByCIN: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function parseMapShapeRow(row: MapShape): MapShapeRow {
  let points: { lat: number; lng: number }[] = [];
  try {
    points = JSON.parse(row.points || "[]");
  } catch {
    points = [];
  }
  return { ...row, points };
}

export async function getMapShapes(
  operationIds?: number[]
): Promise<MapShapeRow[]> {
  const db = await getDb();
  if (!db) return [];
  let rows: MapShape[];
  if (operationIds !== undefined && operationIds.length === 0) {
    // No operations selected — return nothing (matches customMarkers/intel
    // layer behaviour).
    return [];
  } else if (operationIds && operationIds.length > 0) {
    rows = await db
      .select()
      .from(mapShapes)
      .where(
        and(
          inArray(mapShapes.operationId, operationIds),
          isNull(mapShapes.deletedAt)
        )
      )
      .orderBy(desc(mapShapes.createdAt));
  } else {
    rows = await db
      .select()
      .from(mapShapes)
      .where(isNull(mapShapes.deletedAt))
      .orderBy(desc(mapShapes.createdAt));
  }
  return rows.map(parseMapShapeRow);
}

export async function createMapShape(data: {
  createdBy: number;
  operationId?: number | null;
  shapeType: "circle" | "rectangle" | "sector" | "line";
  colour: string;
  opacity?: number;
  label?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusMeters?: number | null;
  startAngle?: number | null;
  endAngle?: number | null;
  innerRadiusMeters?: number | null;
  neLat?: number | null;
  neLng?: number | null;
  swLat?: number | null;
  swLng?: number | null;
  rotation?: number | null;
  points?: { lat: number; lng: number }[];
  lineDashed?: boolean;
  lineArrowEnd?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(mapShapes).values({
    createdBy: data.createdBy,
    operationId: data.operationId ?? null,
    shapeType: data.shapeType,
    colour: data.colour,
    opacity: data.opacity ?? 30,
    label: data.label ?? null,
    centerLat: data.centerLat ?? null,
    centerLng: data.centerLng ?? null,
    radiusMeters: data.radiusMeters ?? null,
    startAngle: data.startAngle ?? null,
    endAngle: data.endAngle ?? null,
    innerRadiusMeters: data.innerRadiusMeters ?? null,
    neLat: data.neLat ?? null,
    neLng: data.neLng ?? null,
    swLat: data.swLat ?? null,
    swLng: data.swLng ?? null,
    rotation: data.rotation ?? 0,
    points: JSON.stringify(data.points ?? []),
    lineDashed: data.lineDashed ?? false,
    lineArrowEnd: data.lineArrowEnd ?? false,
  });
  return (result as any).insertId as number;
}

export async function updateMapShape(
  id: number,
  data: {
    operationId?: number | null;
    colour?: string;
    opacity?: number;
    label?: string | null;
    centerLat?: number | null;
    centerLng?: number | null;
    radiusMeters?: number | null;
    startAngle?: number | null;
    endAngle?: number | null;
    innerRadiusMeters?: number | null;
    neLat?: number | null;
    neLng?: number | null;
    swLat?: number | null;
    swLng?: number | null;
    rotation?: number | null;
    points?: { lat: number; lng: number }[];
    lineDashed?: boolean;
    lineArrowEnd?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Partial<InsertMapShape> = {};
  if (data.operationId !== undefined) update.operationId = data.operationId;
  if (data.colour !== undefined) update.colour = data.colour;
  if (data.opacity !== undefined) update.opacity = data.opacity;
  if (data.label !== undefined) update.label = data.label;
  if (data.centerLat !== undefined) update.centerLat = data.centerLat;
  if (data.centerLng !== undefined) update.centerLng = data.centerLng;
  if (data.radiusMeters !== undefined) update.radiusMeters = data.radiusMeters;
  if (data.startAngle !== undefined) update.startAngle = data.startAngle;
  if (data.endAngle !== undefined) update.endAngle = data.endAngle;
  if (data.innerRadiusMeters !== undefined)
    update.innerRadiusMeters = data.innerRadiusMeters;
  if (data.neLat !== undefined) update.neLat = data.neLat;
  if (data.neLng !== undefined) update.neLng = data.neLng;
  if (data.swLat !== undefined) update.swLat = data.swLat;
  if (data.swLng !== undefined) update.swLng = data.swLng;
  if (data.rotation !== undefined) update.rotation = data.rotation ?? 0;
  if (data.points !== undefined) update.points = JSON.stringify(data.points);
  if (data.lineDashed !== undefined) update.lineDashed = data.lineDashed;
  if (data.lineArrowEnd !== undefined) update.lineArrowEnd = data.lineArrowEnd;
  if (Object.keys(update).length > 0) {
    await db.update(mapShapes).set(update).where(eq(mapShapes.id, id));
  }
}

export async function softDeleteMapShape(
  id: number,
  cin: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(mapShapes)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(mapShapes.id, id));
}

// ─── Intel Pin Overrides ────────────────────────────────────────────────────
// A manual position move and/or appearance change (icon/colour/rotation) for
// an auto-generated Intelligence map pin — see the intelPinOverrides schema
// comment for why this table exists (it replaces a per-device-only
// in-memory ref and localStorage that never actually persisted or synced).

export async function getIntelPinOverrides(): Promise<IntelPinOverride[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(intelPinOverrides);
}

export async function saveIntelPinOverride(
  data: {
    label: string;
    lat?: number;
    lng?: number;
    address?: string;
    markerIcon?: string;
    markerColour?: string;
    rotation?: number;
    customLabel?: string;
    note?: string;
  },
  cin: string | undefined
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Partial<InsertIntelPinOverride> = { updatedByCIN: cin };
  if (data.lat !== undefined) update.lat = data.lat;
  if (data.lng !== undefined) update.lng = data.lng;
  if (data.address !== undefined) update.address = data.address;
  if (data.markerIcon !== undefined) update.markerIcon = data.markerIcon;
  if (data.markerColour !== undefined) update.markerColour = data.markerColour;
  if (data.rotation !== undefined) update.rotation = data.rotation;
  if (data.customLabel !== undefined) update.customLabel = data.customLabel;
  if (data.note !== undefined) update.note = data.note;

  const existing = await db
    .select({ id: intelPinOverrides.id })
    .from(intelPinOverrides)
    .where(eq(intelPinOverrides.label, data.label))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(intelPinOverrides)
      .set(update)
      .where(eq(intelPinOverrides.id, existing[0].id));
  } else {
    await db.insert(intelPinOverrides).values({ label: data.label, ...update });
  }
}

/**
 * A place picked from the address suggestions carries Google's type (cafe,
 * restaurant, gym …); the observation only gets the written address. Reads the
 * place's own map label from that address text — with the same extraction the
 * map uses — and saves the place's sign as that pin's icon, unless the pin
 * already has an icon (an officer's own choice wins) or the written name
 * already gives that sign by itself. Returns whether anything was saved.
 */
export async function savePlaceSignForText(
  addressText: string,
  markerIcon: string,
  cin: string | undefined
): Promise<boolean> {
  const place = extractEntitiesFromText(addressText).find(
    e => e.type === "address"
  );
  const label = place?.shortForm?.trim();
  if (!label) return false;
  if (signIconOf(label) === markerIcon) return false;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select({ markerIcon: intelPinOverrides.markerIcon })
    .from(intelPinOverrides)
    .where(eq(intelPinOverrides.label, label))
    .limit(1);
  if (existing[0]?.markerIcon) return false;
  await saveIntelPinOverride({ label, markerIcon }, cin);
  return true;
}

// ─── Google Address Backfill ──────────────────────────────────────────────────

const AU_STATES_BACKFILL = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";

const GOOGLE_ADDRESS_RE_BACKFILL = new RegExp(
  `((?:[^,\\d\\n][^,\\n]*,\\s*)?)` +
    `(\\d{1,5}[A-Za-z]?(?:\\/\\d{1,5}[A-Za-z]?)?)\\s+` +
    `([A-Za-z][\\w\\s]{2,50}?)` +
    `,\\s*([A-Za-z][\\w\\s]{1,40}?\\s+(?:${AU_STATES_BACKFILL}))` +
    `(?:\\s+(\\d{4}))?` +
    `(?:,\\s*Australia)?`,
  "gi"
);

function convertGoogleAddressesServer(text: string): string {
  if (!text) return text;
  return text.replace(
    GOOGLE_ADDRESS_RE_BACKFILL,
    (
      fullMatch: string,
      businessPrefix: string,
      streetNum: string,
      streetName: string,
      suburbState: string,
      _postcode: string,
      offset: number,
      str: string
    ) => {
      const afterMatch = str.slice(offset + fullMatch.length).trimStart();
      if (afterMatch.startsWith("(")) return fullMatch;
      const bracketCode = `${streetNum} ${streetName.trim()}`.toUpperCase();
      const cleanedAddress = `${businessPrefix ?? ""}${streetNum} ${streetName.trim()}, ${suburbState.trim()}`;
      return `${cleanedAddress} (${bracketCode})`;
    }
  );
}

export async function backfillGoogleAddressesInObservations(): Promise<{
  scanned: number;
  updated: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch all non-deleted rows that have an observation
  const rows = await db
    .select({ id: sheetRows.id, observation: sheetRows.observation })
    .from(sheetRows)
    .where(
      sql`${sheetRows.observation} IS NOT NULL AND ${sheetRows.observation} != ''`
    );

  let updated = 0;
  for (const row of rows) {
    if (!row.observation) continue;
    const converted = convertGoogleAddressesServer(row.observation);
    if (converted !== row.observation) {
      await db
        .update(sheetRows)
        .set({ observation: converted })
        .where(eq(sheetRows.id, row.id));
      updated++;
    }
  }

  return { scanned: rows.length, updated };
}

// ─── RS Mapping Waypoints ─────────────────────────────────────────────────────

export interface RsWaypointRow {
  rowId: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  observation: string | null;
  /** Extracted address short-form (from brackets) */
  address: string | null;
  /** Full description preceding the bracket */
  addressFull: string | null;
  /** Manual lat override (null = use geocoded position) */
  lat: number | null;
  /** Manual lng override (null = use geocoded position) */
  lng: number | null;
  /** User comment */
  comment: string | null;
  /** Marker appearance overrides */
  markerIcon: string | null;
  markerColour: string | null;
  markerRotation: number | null;
  waypointId: number | null;
  /** Explicit calendar date (YYYY-MM-DD, Perth) set by the operator */
  rowDate: string | null;
  /** Legacy day-offset (0 = sheet start day, 1 = next day, etc.) */
  dayOffset: number;
}

/**
 * Return all sheet rows that contain a bracketed address entity,
 * merged with any persisted waypoint overrides (comment / moved position).
 */
export async function getRsMappingWaypoints(
  sheetId: number
): Promise<RsWaypointRow[]> {
  const db = await getDb();
  if (!db) return [];

  // Load all rows for the sheet (sorted chronologically)
  const rows = await db
    .select()
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId))
    .orderBy(
      sql`ISNULL(${sheetRows.timeMinutes})`,
      asc(sheetRows.timeMinutes),
      asc(sheetRows.rowNumber)
    );

  // Load persisted waypoint overrides
  const overrides = await db
    .select()
    .from(rsMappingWaypoints)
    .where(eq(rsMappingWaypoints.sheetId, sheetId));

  const overrideMap = new Map(overrides.map(o => [o.rowId, o]));

  // ── First pass: collect all address-bearing rows ──────────────────────────
  // Strategy:
  //  1. Bracketed format: "arrived at 50 Kings Park Rd, WEST PERTH WA (50 KPR)" → use extractEntitiesFromText
  //  2. Unbracketed bare address: "50 Kings Park Road" (no brackets) → detect with street-type regex
  //  3. Enrich unbracketed short-form addresses by matching against known full addresses seen earlier
  //     in the sheet, so return visits get the correct full address for geocoding.

  interface RawWaypoint {
    row: (typeof rows)[number];
    address: string;
    addressFull: string;
  }

  // Regex to detect a bare street address at the start of an observation or after a keyword
  // Matches: "50 Kings Park Road", "cnr Smith St and Jones Ave", "146 Marine Parade, Cottesloe"
  const BARE_ADDR_RE =
    /(?:^|(?:arrived?\s+at|departed?|at|to|from|outside|near|opposite|behind|beside|in\s+front\s+of|parked\s+(?:at|in|on|outside))\s+)((?:cnr\s+(?:of\s+)?|corner\s+of\s+|lot\s+\d+\s+|\d{1,5}[A-Za-z]?\/\d{1,5}\s+|\d{1,5}[A-Za-z]?\s+)[A-Za-z][\w\s,&'-]{3,80}?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Highway|Hwy|Freeway|Fwy|Terrace|Tce|Parade|Pde|Circuit|Cct|Grove|Gr|Lane|Ln|Place|Pl|Court|Ct|Close|Cl|Crescent|Cres|Boulevard|Blvd|Way|Loop|Rise|Mews|Esplanade|Esp|Quay)(?:\s*,\s*[A-Za-z][\w\s]+)?)/i;

  // Build a normalised-address → full-address lookup from bracketed entries seen so far
  // Key: normalised street number + street name (lowercase, no punctuation)
  // Value: the best full address string seen for that location
  const knownAddressMap = new Map<string, string>(); // normKey → addressFull

  const normaliseAddrKey = (addr: string): string =>
    addr
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Expand common street-type abbreviations to their full form so that
  // "50 Kings Park Rd" and "50 Kings Park Road" produce the same key.
  const expandStreetTypes = (s: string): string =>
    s
      .replace(/\brd\b/gi, "road")
      .replace(/\bst\b/gi, "street")
      .replace(/\bave?\b/gi, "avenue")
      .replace(/\bdr\b/gi, "drive")
      .replace(/\bhwy\b/gi, "highway")
      .replace(/\bfwy\b/gi, "freeway")
      .replace(/\btce\b/gi, "terrace")
      .replace(/\bpde\b/gi, "parade")
      .replace(/\bcct\b/gi, "circuit")
      .replace(/\bgr\b/gi, "grove")
      .replace(/\bln\b/gi, "lane")
      .replace(/\bpl\b/gi, "place")
      .replace(/\bct\b/gi, "court")
      .replace(/\bcl\b/gi, "close")
      .replace(/\bcres\b/gi, "crescent")
      .replace(/\bblvd\b/gi, "boulevard")
      .replace(/\besp\b/gi, "esplanade");

  // Extract just the street number + street name for fuzzy matching.
  // IMPORTANT: split on comma BEFORE normalising (normaliseAddrKey strips commas, so
  // splitting after normalisation never fires and the suburb bleeds into the key).
  const addrMatchKey = (addr: string): string => {
    const expanded = expandStreetTypes(addr);
    // Split at first comma OR at a state code word boundary (raw string, before stripping)
    const base = expanded
      .split(/,|\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/i)[0]
      .trim();
    return normaliseAddrKey(base);
  };

  const addressRows: RawWaypoint[] = [];
  const rowIdsWithBracketed = new Set<number>(); // rows already handled by bracketed pass

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    const addrEntity = entities.find(e => e.type === "address");
    if (addrEntity) {
      // Bracketed address found — use it and register in knownAddressMap
      // Register by display shortForm key (e.g. "4 glyde street")
      const displayKey = addrMatchKey(addrEntity.shortForm);
      if (displayKey && !knownAddressMap.has(displayKey)) {
        knownAddressMap.set(displayKey, addrEntity.shortForm);
      }
      // Also register by rawShortForm key (the exact bracket token, e.g. "4 glyde st")
      const rawKey = addrMatchKey(addrEntity.rawShortForm);
      if (rawKey && rawKey !== displayKey && !knownAddressMap.has(rawKey)) {
        knownAddressMap.set(rawKey, addrEntity.shortForm);
      }
      addressRows.push({
        row,
        address: addrEntity.shortForm,
        addressFull: addrEntity.shortForm,
      });
      rowIdsWithBracketed.add(row.id);
    }
  }

  // Second sub-pass: detect unbracketed bare addresses in rows that had no bracketed address
  for (const row of rows) {
    if (!row.observation || rowIdsWithBracketed.has(row.id)) continue;
    const obs = row.observation.trim();
    const bareMatch = obs.match(BARE_ADDR_RE);
    if (!bareMatch) continue;
    const rawAddr = bareMatch[1].trim();
    // Try to enrich with a known full address from earlier in the sheet
    const matchKey = addrMatchKey(rawAddr);
    const knownFull = knownAddressMap.get(matchKey);
    addressRows.push({
      row,
      address: rawAddr,
      addressFull: knownFull ?? rawAddr,
    });
  }

  // Sort addressRows back into chronological order (same as rows array)
  const rowOrderMap = new Map(rows.map((r, i) => [r.id, i]));
  addressRows.sort(
    (a, b) =>
      (rowOrderMap.get(a.row.id) ?? 0) - (rowOrderMap.get(b.row.id) ?? 0)
  );

  const result: RsWaypointRow[] = [];

  for (let wi = 0; wi < addressRows.length; wi++) {
    const { row, address, addressFull } = addressRows[wi];
    const override = overrideMap.get(row.id);

    result.push({
      rowId: row.id,
      rowNumber: row.rowNumber,
      time: row.time ?? null,
      timeMinutes: row.timeMinutes ?? null,
      observation: row.observation,
      address,
      addressFull,
      lat: override?.lat ?? null,
      lng: override?.lng ?? null,
      comment: override?.comment ?? null,
      markerIcon: override?.markerIcon ?? null,
      markerColour: override?.markerColour ?? null,
      markerRotation: override?.markerRotation ?? null,
      waypointId: override?.id ?? null,
      rowDate: (row as any).rowDate ?? null,
      dayOffset: (row as any).dayOffset ?? 0,
    } as RsWaypointRow);
  }

  return result;
}

export async function upsertRsMappingWaypoint(input: {
  sheetId: number;
  rowId: number;
  createdBy: number;
  lat?: number | null;
  lng?: number | null;
  comment?: string | null;
  markerIcon?: string | null;
  markerColour?: string | null;
  markerRotation?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if a waypoint already exists for this row
  const existing = await db
    .select({ id: rsMappingWaypoints.id })
    .from(rsMappingWaypoints)
    .where(
      and(
        eq(rsMappingWaypoints.sheetId, input.sheetId),
        eq(rsMappingWaypoints.rowId, input.rowId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(rsMappingWaypoints)
      .set({
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        comment: input.comment ?? null,
        markerIcon: input.markerIcon ?? null,
        markerColour: input.markerColour ?? null,
        markerRotation: input.markerRotation ?? null,
      })
      .where(eq(rsMappingWaypoints.id, existing[0].id));
    return existing[0].id;
  } else {
    const [res] = await db.insert(rsMappingWaypoints).values({
      sheetId: input.sheetId,
      rowId: input.rowId,
      createdBy: input.createdBy,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      comment: input.comment ?? null,
      markerIcon: input.markerIcon ?? null,
      markerColour: input.markerColour ?? null,
      markerRotation: input.markerRotation ?? null,
    });
    return (res as any).insertId as number;
  }
}
