import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { makeRequest, type GeocodingResult } from "../_core/map";

import {
  aliasMentionCompatible,
  aliasSearchFlags,
  mentionIsOtherRegisteredPerson,
} from "../personAliasMatch";

import type { CommandCode } from "@shared/commands";

import { scopeEntities } from "@shared/operationAccess";
import { holdsPriority, isSearchLive } from "@shared/teamSearch";

import { intelScope } from "../intelScope";

import {
  FingerprintCache,
  fingerprintSql,
  fingerprintFromRow,
  type Fingerprint,
} from "../intelCache";

import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";

import { parseExtraAddresses } from "@shared/extraAddresses";
import { fullAddressForGeocode } from "@shared/geocodeQuery";

import {
  buildVisits,
  classifyPlace,
  LABELLABLE_KINDS,
  type PlaceKind,
  type PlaceMention,
  type PlaceRecord,
  type RegisteredAddressRef,
} from "@shared/placesReport";
import {
  buildStops,
  type PredictorPlace,
  type PredictorStop,
} from "@shared/targetPredictor";

import {
  classifyVisitDirection,
  timeBucketLabels,
  DAY_LABELS,
  buildLocationTimeGrid,
  findPeakCell,
  buildDayTimeGrid,
  mostActiveDays,
  computeHomePresenceByBucket,
  toHomePresencePercent,
  dominantRanges,
  buildDirectionHistogram,
  peakBucketIndex,
  confidenceTier,
  MIN_OBSERVATIONS_FOR_PATTERN,
  type VisitDirection,
  type LocationVisitEvent,
  type HomeEvent,
  type HomePresencePercent,
  type PeakCell,
  type ConfidenceTier,
} from "../patternOfLife";

import {
  certifications,
  governanceRecords,
  operations,
  rowMembers,
  rowAttachments,
  runningSheets,
  sheetRows,
  targets,
  TargetType,
  associates,
  users,
  sheetSummaries,
  operationTargetLinks,
  intelligenceGeocodeCache,
  entityAliases,
  intelPinOverrides,
  targetPlaceLabels,
  predictorLastSeen,
} from "../../drizzle/schema";

import { attributedRowIds, collapseToVisits } from "../entityAttribution";
import { recordIntelBuild } from "../intelBuildWatch";

import { getDb } from "./core";
import { attachLinkedCounts, normalizeEntityLabel } from "./attachments";
import { getTargetById } from "./targets";
import {
  IntelligenceEntity,
  addressBracketKey,
  extractEntitiesFromText,
  mergeContainedEntities,
  subjectTargetEntityKey,
  vehicleRegoKey,
} from "./intelligence";
import {
  computeAllRowsSigned,
  computeGovernancePercent,
  getGovernanceRecordsBySheetIds,
  getGovernanceTodoForCin,
  isRowSignedOff,
} from "./governance";
import { teamNameMap, visitorTeamMap } from "./accounts";
import { getOutstandingSheetsForCin } from "./operations";

// ─── Intelligence Heat Map ──────────────────────────────────────────────────
// Aggregates address/business entities extracted from a scoped set of running
// sheet rows (one Operation, optionally one Target, and a time window) into
// per-location visit counts + coordinates for the Heat Map view.

/** Perth-anchored (+08:00, no DST) YYYY-MM-DD for "today". */
export function perthTodayISO(): string {
  return toPerthDateISO(new Date());
}

/** YYYY-MM-DD (Perth-anchored) for a JS Date — used to fall back to the
 * running sheet's creation date when a row has no explicit rowDate. */
export function toPerthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Add (or subtract) days to a YYYY-MM-DD string, Perth-anchored — same
 * anchoring approach as getRowsBySheetId's day-offset math above.
 *
 * `new Date(dateISO + "T00:00:00+08:00")`'s underlying UTC instant is
 * always 16:00 on the PREVIOUS UTC calendar day (Perth midnight = UTC-8h),
 * so reading .toISOString() straight off it after setUTCDate() reads the
 * UTC day, not the Perth day — silently one day short for every call,
 * including days=0. Re-anchor back to Perth by shifting +8h before slicing,
 * same as toPerthDateISO does. (This was wrong for years — addDaysISO(x, 6)
 * for a Monday-start week produced Saturday instead of Sunday, silently
 * dropping the last day of every week from any range built with it, e.g.
 * the Weekly Activity Report's weekEnd and the Heat Map's last7/last30
 * windows.) */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// A row only marks a genuine sighting of the target at a location if it
// actually narrates presence/activity there — arriving, departing, parking,
// being observed doing something. Officers phrase this many different ways
// ("travelled on X and parked in the vicinity of Y", "reversed from the
// driveway onto X and continued via:", "travelled through the car park and
// continued via:"), so this is deliberately a loose, wide keyword net —
// every verb stem wildcarded to catch arrive/arrived/arriving-style tense
// variants — rather than a small set of exact phrases. False positives (an
// address mentioned in a row that isn't really a visit) are a lesser
// evidentiary risk than false negatives (a real visit silently dropped from
// the count). "continued via" is included even though it reads as a
// departure, not an arrival — an address mentioned in the same row as
// "continued via" is the point they just left, i.e. still part of the same
// visit, not a new one.
//
// The second group below (walk/stood/return/approach/knock/sat, "out of
// sight", and the front door/yard/driveway nouns) covers presence narrated
// without an arrival or departure verb. Officers write what the target is
// *doing*, not only that they got somewhere: "SANDWICH and CAT walked from
// 81 Redmond Road and stood in conversation in the front yard" is as clear a
// sighting at that address as "arrived at", but matched nothing here. The
// effect was perverse — in the same sheet an associate's "CAT arrived at 81
// Redmond Road" was counted while the target standing in the same front yard
// three hours later was not.
export const OBSERVATION_SIGNAL_RE =
  /\b(arriv\w*|depart\w*|left|enter\w*|exit\w*|park\w*|observ\w*|seen|saw|see|met|meet\w*|attend\w*|walk\w*|stood|stand\w*|return\w*|approach\w*|knock\w*|sat|sitting|out\s+of\s+sight|front\s+(?:door|yard|gate)|driveway|pull\w*\s+(?:into|up)|stopp?\w*|wait\w*|remain\w*|stationary|revers\w*\s+from\s+the\s+driveway|continu\w*\s+via|vicinity\s+of|driv(?:e|es|ing|ove)\s+(?:into|through)|travell?\w*\s+through)\b/i;

/** Does this observation narrate a presence at a place, as opposed to merely
 * naming one? Exported for testing — see observationSignal.test.ts. */
export function hasObservationSignal(observation: string): boolean {
  return OBSERVATION_SIGNAL_RE.test(observation);
}

/** Rows that only mark surveillance team activity or a travelled-via street
 * list, not a sighting of the target — same classification the Court
 * Statement generator already uses (server/routers.ts statement.previewData)
 * to exclude these from CIN eligibility, reused here for the same reason:
 * they aren't real observations of the target at a location. */
function isNonObservationRow(
  observation: string,
  previousObservation: string | null
): boolean {
  const obs = observation.trim();
  if (/^surveillance commenced/i.test(obs) || /^surveillance ceased/i.test(obs))
    return true;
  const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
  if (
    endsInWhereat &&
    previousObservation &&
    /continued via[;:]/i.test(previousObservation)
  )
    return true;
  return false;
}

export type IntelligenceHeatMapWhen =
  | { mode: "sheet"; sheetId: number }
  | { mode: "all" } // every sheet in scope, no date window
  | { mode: "last7" }
  | { mode: "last30" }
  | { mode: "custom"; startDate: string; endDate: string };
// YYYY-MM-DD, inclusive

export interface IntelligenceHeatMapLocation {
  label: string;
  count: number;
  lat: number;
  lng: number;
}

export async function getIntelligenceHeatMapLocations(params: {
  operationId: number;
  targetId?: number | null;
  when: IntelligenceHeatMapWhen;
}): Promise<IntelligenceHeatMapLocation[]> {
  const db = await getDb();
  if (!db) return [];

  // ── Resolve the scoped set of sheets (Operation, optionally + Target) ──────
  let sheetIds: number[];
  // Keyed by sheet id — sheetDate (the picker date) takes priority over
  // createdAt when resolving a row's date below; createdAt is kept only as
  // the fallback for legacy sheets with no sheetDate.
  const sheetDateInfo = new Map<
    number,
    { createdAt: Date; sheetDate: string | null }
  >();

  if (params.when.mode === "sheet") {
    const sheet = await db
      .select({
        id: runningSheets.id,
        createdAt: runningSheets.createdAt,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .where(
        and(
          eq(runningSheets.id, params.when.sheetId),
          eq(runningSheets.operationId, params.operationId),
          isNull(runningSheets.deletedAt)
        )
      )
      .limit(1);
    if (!sheet.length) return [];
    sheetIds = [sheet[0].id];
    sheetDateInfo.set(sheet[0].id, {
      createdAt: sheet[0].createdAt,
      sheetDate: sheet[0].sheetDate,
    });
  } else {
    // Deliberately NOT narrowed by runningSheets.targetId. A target filter
    // means "rows this target is mentioned in" (applied per-row below), not
    // "sheets assigned to this target" — assignment records who the team set
    // out to watch, not who they actually saw. Scoping by sheet both credited
    // the target with everyone else's movements on their sheets and missed
    // their own mentions on other sheets in the operation.
    const conditions = [
      eq(runningSheets.operationId, params.operationId),
      isNull(runningSheets.deletedAt),
    ];
    const sheets = await db
      .select({
        id: runningSheets.id,
        createdAt: runningSheets.createdAt,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .where(and(...conditions));
    if (!sheets.length) return [];
    sheetIds = sheets.map(s => s.id);
    for (const s of sheets)
      sheetDateInfo.set(s.id, {
        createdAt: s.createdAt,
        sheetDate: s.sheetDate,
      });
  }
  const sheetIdSet = new Set(sheetIds);

  // Full per-sheet row order (observation text + a stable sort key) — needed
  // both for the Surveillance/Travelled Via "previous row" check and for
  // collapsing consecutive same-address mentions into one visit below.
  const rows = await db
    .select({
      id: sheetRows.id,
      sheetId: sheetRows.sheetId,
      rowDate: sheetRows.rowDate,
      dayOffset: sheetRows.dayOffset,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      rowNumber: sheetRows.rowNumber,
    })
    .from(sheetRows)
    .where(inArray(sheetRows.sheetId, sheetIds))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes, sheetRows.rowNumber);
  const rowById = new Map(rows.map(r => [r.id, r]));

  const rowsBySheetOrdered = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!rowsBySheetOrdered.has(row.sheetId))
      rowsBySheetOrdered.set(row.sheetId, []);
    rowsBySheetOrdered.get(row.sheetId)!.push(row);
  }
  const previousObservationByRowId = new Map<number, string | null>();
  for (const sheetRowList of Array.from(rowsBySheetOrdered.values())) {
    for (let i = 0; i < sheetRowList.length; i++) {
      previousObservationByRowId.set(
        sheetRowList[i].id,
        i > 0 ? (sheetRowList[i - 1].observation ?? null) : null
      );
    }
  }
  const rowOrderIndex = new Map<number, number>();
  for (const sheetRowList of Array.from(rowsBySheetOrdered.values())) {
    sheetRowList.forEach((r, i) => rowOrderIndex.set(r.id, i));
  }

  // ── Resolve the date window ("sheet" mode takes every row in that sheet
  // as-is; the other three modes resolve a concrete range). Date priority
  // matches getRowsBySheetId above: explicit rowDate first, else the sheet's
  // creation date shifted by dayOffset. (Unlike getRowsBySheetId, this skips
  // the third-tier timeMinutes-rollover inference — that's a per-sheet
  // sequential scan meant for single-sheet rendering, disproportionately
  // expensive to replicate across every sheet in scope here, and only
  // matters for legacy rows predating rowDate.)
  // "sheet" takes the whole sheet and "all" takes every sheet in scope, so
  // neither resolves a window — only the three windowed modes do.
  const hasDateWindow =
    params.when.mode === "custom" ||
    params.when.mode === "last7" ||
    params.when.mode === "last30";
  let startISO = "";
  let endISO = "";
  if (params.when.mode === "custom") {
    startISO = params.when.startDate;
    endISO = params.when.endDate;
  } else if (params.when.mode === "last7" || params.when.mode === "last30") {
    endISO = perthTodayISO();
    startISO = addDaysISO(endISO, params.when.mode === "last7" ? -6 : -29);
  }

  // ── Reuse the same entity extraction/dedup pipeline as the Locations tab
  // (bracket-introduction + bare-re-mention two-pass recognition, plus
  // confirmed entity-alias merges) instead of a standalone per-row regex
  // pass — an address is often bracket-introduced once and then referenced
  // in plain prose on later rows ("returned to 54 Terrace Road"), which a
  // bracket-only pass undercounts to a single visit.
  const allEntities = await getAllIntelligenceEntities();

  // The heat map plots TARGET movement — always, not only when one target is
  // picked out. "All Targets" means every target on the operation, not every
  // entity on it: an associate's or a third party's addresses are theirs, and
  // mapping them under the operation's targets misrepresents where the
  // targets have been. So restrict to rows a target is actually mentioned in,
  // either the one selected or any of them.
  //
  // An empty set is a real answer, not a failure: a target never named in any
  // observation has no mapped locations, however many sheets were opened in
  // their name.
  const targetRowIds = new Set<number>();
  for (const entity of allEntities) {
    if (!entity.isTarget) continue;
    if (params.targetId != null && entity.targetId !== params.targetId)
      continue;
    for (const rowId of Array.from(
      attributedRowIds(entity.occurrences, { sheetIds: sheetIdSet })
    )) {
      targetRowIds.add(rowId);
    }
  }

  // A "mention" of an address isn't the same as a "visit" — a target's home
  // address sitting on their target card, a Surveillance Commenced/Ceased
  // marker, a Travelled Via street list, or an address mentioned without any
  // narration of the target's presence there all inflate the raw mention
  // count without representing a real sighting. Collect only the qualifying
  // mentions first, keyed by sheet + row order, then collapse below.
  type QualifyingMention = {
    entityKey: string;
    label: string;
    fullDescription: string;
    sheetId: number;
    order: number;
  };
  const qualifying: QualifyingMention[] = [];

  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      // rowId 0 marks a synthetic occurrence built from the target's own
      // registry card (e.g. Home Base), not an actual running sheet row —
      // never a real sighting.
      if (occ.rowId === 0) continue;
      if (!sheetIdSet.has(occ.sheetId)) continue;
      // The address must be mentioned in a row a target is themselves
      // mentioned in.
      if (!targetRowIds.has(occ.rowId)) continue;

      const row = rowById.get(occ.rowId);
      if (!row?.observation) continue;
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;

      if (hasDateWindow) {
        const info = sheetDateInfo.get(occ.sheetId);
        const resolvedDate =
          row.rowDate ??
          addDaysISO(
            info?.sheetDate ?? toPerthDateISO(info?.createdAt ?? new Date()),
            row.dayOffset
          );
        if (resolvedDate < startISO || resolvedDate > endISO) continue;
      }

      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        fullDescription: occ.fullDescription,
        sheetId: occ.sheetId,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
      });
    }
  }

  // The fuller written form of each address, for geocoding (see
  // resolvePlaceLatLng) — every qualifying mention's, not just the visits'.
  const fullDescriptionsByKey = new Map<string, string[]>();
  for (const m of qualifying) {
    const list = fullDescriptionsByKey.get(m.entityKey);
    if (list) list.push(m.fullDescription);
    else fullDescriptionsByKey.set(m.entityKey, [m.fullDescription]);
  }

  // ── Collapse consecutive mentions of the same address into one visit ──────
  // "Arrived at X" followed by "departed X" (or "…and continued via:") is one
  // visit, not two — a new visit only counts once a *different* address
  // appears in between, or the sheet changes. Walk each sheet's qualifying
  // mentions in row order and count address transitions, not raw mentions.
  const grouped = new Map<string, { label: string; count: number }>();
  for (const visit of collapseToVisits(qualifying)) {
    const existing = grouped.get(visit.entityKey);
    if (existing) existing.count++;
    else grouped.set(visit.entityKey, { label: visit.label, count: 1 });
  }

  const results = await Promise.all(
    Array.from(grouped.entries()).map(async ([key, { label, count }]) => {
      const coords = await resolvePlaceLatLng(
        key,
        label,
        fullDescriptionsByKey.get(key) ?? []
      );
      if (!coords) return null;
      return { label, count, lat: coords.lat, lng: coords.lng };
    })
  );

  return results
    .filter((r): r is IntelligenceHeatMapLocation => r !== null)
    .sort((a, b) => b.count - a.count);
}

/** Cache-first geocoding for intel addresses — geocodes once via Google's
 * Geocoding API and persists the result, so re-opening the Heat Map doesn't
 * re-geocode the same addresses every time. */
export async function resolveLatLng(
  addressKey: string,
  rawAddress: string
): Promise<{ lat: number; lng: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const cached = await db
    .select({
      lat: intelligenceGeocodeCache.lat,
      lng: intelligenceGeocodeCache.lng,
    })
    .from(intelligenceGeocodeCache)
    .where(eq(intelligenceGeocodeCache.addressKey, addressKey))
    .limit(1);
  if (cached.length) return cached[0];

  try {
    const result = await makeRequest<GeocodingResult>(
      "/maps/api/geocode/json",
      { address: rawAddress + ", Western Australia, Australia", region: "au" }
    );
    if (result.status !== "OK" || !result.results.length) return null;
    const loc = result.results[0].geometry.location;
    await db
      .insert(intelligenceGeocodeCache)
      .values({ addressKey, lat: loc.lat, lng: loc.lng })
      .onDuplicateKeyUpdate({
        set: { lat: loc.lat, lng: loc.lng, resolvedAt: new Date() },
      });
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

/** Geocode a place the sheets name, preferring the fuller "<street>, SUBURB
 * STATE" the officer wrote before its bracket (same rule as the Location
 * profile) over the bare short form, which for a place name like "Terminal 4"
 * can resolve anywhere in the State. A fuller address is cached under its own
 * key, so a wrong position cached earlier for the bare label is never reused. */
async function resolvePlaceLatLng(
  addressKey: string,
  label: string,
  fullDescriptions: readonly string[]
): Promise<{ lat: number; lng: number } | null> {
  const full = fullAddressForGeocode(fullDescriptions);
  if (!full) return resolveLatLng(addressKey, label);
  return resolveLatLng(normalizeEntityLabel(full).slice(0, 500), full);
}

/** Batch-geocode a list of raw address strings via the same cache-first
 * geocoder as the Heat Map, deduping repeats — used by the Supervisor
 * Summary export to plot its own Location column on a map page rather than
 * re-deriving addresses from row text. */
export async function geocodeAddressList(
  addresses: string[]
): Promise<{ address: string; lat: number; lng: number }[]> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of addresses) {
    const address = raw.trim();
    if (!address) continue;
    const key = normalizeEntityLabel(address);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }

  const results = await Promise.all(
    unique.map(async address => {
      const coords = await resolveLatLng(
        normalizeEntityLabel(address),
        address
      );
      if (!coords) return null;
      return { address, lat: coords.lat, lng: coords.lng };
    })
  );

  return results.filter(
    (r): r is { address: string; lat: number; lng: number } => r !== null
  );
}

// ─── Pattern of Life ────────────────────────────────────────────────────────
// Time/location analysis for one target within one operation — reuses the
// same entity extraction, "qualifying mention" gating, and same-address
// visit-collapsing as the Heat Map above, plus the pure bucketing/interval
// functions in ./patternOfLife.ts, rather than re-deriving any of it.

export interface IntelPatternOfLifeLocationRow {
  entityKey: string;
  label: string;
  counts: number[];
  total: number;
}

export interface IntelPatternOfLifeResponse {
  targetName: string;
  operationName: string;
  observationCount: number;
  geocodedObservationCount: number;
  sufficientData: boolean;
  confidence: ConfidenceTier;
  // Every time-bucketed chart in this report shares one 2-hourly (12-bucket)
  // granularity so they read consistently side by side.
  timeBuckets: string[];
  dayLabels: string[];
  // Section A — general activity, any location
  dayTimeGrid: number[][]; // [dayIndex][bucketIndex]
  mostActiveDayIndices: number[];
  // Section B — where & when
  locationTimeGrid: IntelPatternOfLifeLocationRow[];
  peakCell: PeakCell | null;
  // Section C — home presence. homeAddressKnown/homeAddressGeocoded/
  // homeAddressMentioned let the client explain WHY the charts are missing
  // (no HB on file vs. never geocoded vs. mentioned but no clear
  // arrived/departed language yet) instead of just silently omitting the
  // section, which reads as a bug rather than an honest "not enough data."
  homeAddressKnown: boolean;
  homeAddressGeocoded: boolean;
  homeAddressMentioned: boolean;
  homeAddressLabel: string | null;
  homePresence: HomePresencePercent[] | null; // length 12
  homeLikelyRanges: Array<{ startBucket: number; endBucket: number }> | null;
  homeAwayRanges: Array<{ startBucket: number; endBucket: number }> | null;
  departureHistogram: number[] | null; // length 12
  arrivalHistogram: number[] | null; // length 12
  peakDepartureBucket: number | null;
  peakArrivalBucket: number | null;
}

export async function getIntelTargetPatternOfLife(
  operationId: number,
  targetId: number
): Promise<IntelPatternOfLifeResponse | null> {
  const db = await getDb();
  if (!db) return null;

  const [operation] = await db
    .select({ id: operations.id, name: operations.name })
    .from(operations)
    .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)))
    .limit(1);
  const target = await getTargetById(targetId);
  if (!operation || !target) return null;

  // ── Resolve this target's own rows within this operation — formally
  // assigned sheets UNION sheets where the target is text-mentioned,
  // exactly like buildTargetOperationalAssociations, but scoped to the one
  // operation this report is for. ──────────────────────────────────────────
  const targetSheets = await db
    .select({
      id: runningSheets.id,
      createdAt: runningSheets.createdAt,
      sheetDate: runningSheets.sheetDate,
    })
    .from(runningSheets)
    .where(
      and(
        eq(runningSheets.operationId, operationId),
        eq(runningSheets.targetId, targetId),
        isNull(runningSheets.deletedAt)
      )
    );
  const sheetDateInfo = new Map<
    number,
    { createdAt: Date; sheetDate: string | null }
  >();
  for (const s of targetSheets)
    sheetDateInfo.set(s.id, { createdAt: s.createdAt, sheetDate: s.sheetDate });
  const targetSheetIds = new Set(targetSheets.map(s => s.id));

  const allEntities = await getAllIntelligenceEntities();
  const targetEntity = allEntities.find(
    e => e.isTarget && e.targetId === targetId
  );

  // Only rows the target is actually mentioned in — see entityAttribution.ts
  // for why a sheet assignment isn't sufficient.
  const targetRowIds = attributedRowIds(targetEntity?.occurrences, {
    operationId,
  });
  for (const occ of targetEntity?.occurrences ?? []) {
    if (targetRowIds.has(occ.rowId)) targetSheetIds.add(occ.sheetId);
  }
  // Mentioned-only sheets need their own date-resolution info too.
  const missingSheetIds = Array.from(targetSheetIds).filter(
    id => !sheetDateInfo.has(id)
  );
  if (missingSheetIds.length) {
    const extraSheets = await db
      .select({
        id: runningSheets.id,
        createdAt: runningSheets.createdAt,
        sheetDate: runningSheets.sheetDate,
      })
      .from(runningSheets)
      .where(inArray(runningSheets.id, missingSheetIds));
    for (const s of extraSheets)
      sheetDateInfo.set(s.id, {
        createdAt: s.createdAt,
        sheetDate: s.sheetDate,
      });
  }

  if (!targetRowIds.size) {
    return {
      targetName: target.name,
      operationName: operation.name,
      observationCount: 0,
      geocodedObservationCount: 0,
      sufficientData: false,
      confidence: confidenceTier(0),
      timeBuckets: timeBucketLabels(12),
      dayLabels: DAY_LABELS,
      dayTimeGrid: Array.from({ length: 7 }, () => new Array(12).fill(0)),
      mostActiveDayIndices: [],
      locationTimeGrid: [],
      peakCell: null,
      homeAddressKnown: !!(target.hbf || target.hb),
      homeAddressGeocoded: false,
      homeAddressMentioned: false,
      homeAddressLabel:
        target.hbf || target.hb
          ? formatIntelAddress((target.hbf || target.hb) ?? "")
          : null,
      homePresence: null,
      homeLikelyRanges: null,
      homeAwayRanges: null,
      departureHistogram: null,
      arrivalHistogram: null,
      peakDepartureBucket: null,
      peakArrivalBucket: null,
    };
  }

  // Every row of the sheets in scope — not just the target's own rows. The
  // target's rows are picked out below via targetRowIds; the full set is
  // needed so "previous row" (which isNonObservationRow uses to spot a
  // continued-via / whereat street list) and row ordering stay true to the
  // sheet as written, rather than to whichever subset mentions the target.
  const allSheetRows = await db
    .select({
      id: sheetRows.id,
      sheetId: sheetRows.sheetId,
      rowDate: sheetRows.rowDate,
      dayOffset: sheetRows.dayOffset,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      rowNumber: sheetRows.rowNumber,
    })
    .from(sheetRows)
    .where(inArray(sheetRows.sheetId, Array.from(targetSheetIds)))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes, sheetRows.rowNumber);
  const rows = allSheetRows.filter(r => targetRowIds.has(r.id));
  const rowById = new Map(rows.map(r => [r.id, r]));

  const rowsBySheetOrdered = new Map<number, typeof allSheetRows>();
  for (const row of allSheetRows) {
    if (!rowsBySheetOrdered.has(row.sheetId))
      rowsBySheetOrdered.set(row.sheetId, []);
    rowsBySheetOrdered.get(row.sheetId)!.push(row);
  }
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  for (const sheetRowList of Array.from(rowsBySheetOrdered.values())) {
    sheetRowList.forEach((r, i) => {
      previousObservationByRowId.set(
        r.id,
        i > 0 ? (sheetRowList[i - 1].observation ?? null) : null
      );
      rowOrderIndex.set(r.id, i);
    });
  }

  const resolveDateISO = (row: (typeof rows)[number]): string => {
    if (row.rowDate) return row.rowDate;
    const info = sheetDateInfo.get(row.sheetId);
    return addDaysISO(
      info?.sheetDate ?? toPerthDateISO(info?.createdAt ?? new Date()),
      row.dayOffset
    );
  };

  // ── General activity (Section A): every real observation row, regardless
  // of whether it mentions a location. ────────────────────────────────────
  const generalRows = rows.filter(
    r =>
      r.timeMinutes != null &&
      !isNonObservationRow(
        r.observation ?? "",
        previousObservationByRowId.get(r.id) ?? null
      )
  );
  const observationCount = generalRows.length;
  const dayTimeGrid = buildDayTimeGrid(
    generalRows.map(r => ({
      dateISO: resolveDateISO(r),
      timeMinutes: r.timeMinutes!,
    })),
    12
  );
  const mostActiveDayIndices = mostActiveDays(dayTimeGrid);

  // ── Qualifying address mentions (Section B + C) — same gating as the Heat
  // Map (isNonObservationRow + OBSERVATION_SIGNAL_RE), plus direction and
  // resolved date/time so they can be bucketed and, for the home address,
  // used as interval-bounding events. ─────────────────────────────────────
  type QualifyingMention = {
    entityKey: string;
    label: string;
    fullDescription: string;
    sheetId: number;
    order: number;
    timeMinutes: number;
    dateISO: string;
    direction: VisitDirection;
  };
  const qualifying: QualifyingMention[] = [];
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0 || !targetRowIds.has(occ.rowId)) continue;
      const row = rowById.get(occ.rowId);
      if (!row?.observation || row.timeMinutes == null) continue;
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;
      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        fullDescription: occ.fullDescription,
        sheetId: occ.sheetId,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
        timeMinutes: row.timeMinutes,
        dateISO: resolveDateISO(row),
        direction: classifyVisitDirection(row.observation),
      });
    }
  }

  // Geocode every distinct address mentioned — only geocodable addresses
  // count toward the location-based sections, same quality bar as the Heat
  // Map (an address-shaped mention that doesn't resolve to a real place
  // isn't reliable enough to plot).
  const distinctKeys = new Map<string, { label: string; full: string[] }>();
  for (const m of qualifying) {
    const seen = distinctKeys.get(m.entityKey);
    if (seen) seen.full.push(m.fullDescription);
    else
      distinctKeys.set(m.entityKey, {
        label: m.label,
        full: [m.fullDescription],
      });
  }
  const geocodable = new Set<string>();
  await Promise.all(
    Array.from(distinctKeys.entries()).map(async ([key, { label, full }]) => {
      const coords = await resolvePlaceLatLng(key, label, full);
      if (coords) geocodable.add(key);
    })
  );
  const geocodedQualifying = qualifying.filter(m =>
    geocodable.has(m.entityKey)
  );
  const geocodedObservationCount = new Set(
    geocodedQualifying.map(m => `${m.sheetId}::${m.order}`)
  ).size;

  // ── Section B: collapse consecutive same-address mentions (within a
  // sheet, in row order) into one visit — "arrived at X" then "departed X"
  // is one visit to X, not two. Keep the first mention's time as the
  // visit's representative time. Same rule the Heat Map already applies. ──
  const visitEvents: LocationVisitEvent[] = collapseToVisits(
    geocodedQualifying
  ).map(m => ({
    entityKey: m.entityKey,
    label: m.label,
    timeMinutes: m.timeMinutes,
    dateISO: m.dateISO,
  }));
  // No cap — every distinct geocoded location the target has been recorded
  // at belongs in the picture, not just the busiest few. A one-off visit
  // to an unusual address can matter more operationally than a routine
  // one that happens to have a higher count.
  const locationTimeGrid = buildLocationTimeGrid(
    visitEvents,
    12,
    visitEvents.length
  );
  const peakCell = findPeakCell(locationTimeGrid);

  // ── Section C: home presence — the target's registered HBF is merged by
  // getAllIntelligenceEntities into the same entity as any text-mined
  // mention of it, keyed internally on addressBracketKey — but that
  // internal key is never exposed on the IntelligenceEntity objects we get
  // back (only the display-friendly, non-bracketed .shortForm is). Trying
  // to recompute that internal key ourselves (normalizeEntityLabel(
  // addressBracketKey(target.hbf))) doesn't match normalizeEntityLabel(
  // entity.shortForm) — the key scheme every OTHER entityKey in this
  // function uses — so it silently never found the entity. Instead, find
  // the actual merged entity directly via the synthetic rowId=0 occurrence
  // getAllIntelligenceEntities seeds specifically for this target's HBF
  // field, then key off *that* entity's own shortForm like everything else
  // here does.
  const homeSnippet = `Target card — ${target.name} [HBF]`;
  const homeEntity =
    target.hbf || target.hb
      ? allEntities.find(
          e =>
            (e.type === "address" || e.type === "business") &&
            e.occurrences.some(
              occ => occ.rowId === 0 && occ.observationSnippet === homeSnippet
            )
        )
      : undefined;
  const homeEntityKey = homeEntity
    ? normalizeEntityLabel(homeEntity.shortForm)
    : null;
  let homePresence: HomePresencePercent[] | null = null;
  let homeLikelyRanges: Array<{
    startBucket: number;
    endBucket: number;
  }> | null = null;
  let homeAwayRanges: Array<{ startBucket: number; endBucket: number }> | null =
    null;
  let departureHistogram: number[] | null = null;
  let arrivalHistogram: number[] | null = null;
  let peakDepartureBucket: number | null = null;
  let peakArrivalBucket: number | null = null;

  const homeAddressKnown = !!(target.hbf || target.hb);
  const homeAddressMentioned =
    !!homeEntityKey && distinctKeys.has(homeEntityKey);
  const homeAddressGeocoded = !!homeEntityKey && geocodable.has(homeEntityKey);
  // Fall back to the raw registered address so the client can still name it
  // in an explanatory message even when there's no chart data yet. Prefer
  // the matched entity's own (already-canonical) shortForm when we have
  // one, since it's the same text the grids above already show.
  let homeAddressLabel: string | null = homeEntity
    ? homeEntity.shortForm
    : homeAddressKnown
      ? formatIntelAddress((target.hbf || target.hb) ?? "")
      : null;

  if (homeEntityKey && homeAddressGeocoded) {
    const homeEvents: HomeEvent[] = geocodedQualifying
      .filter(m => m.entityKey === homeEntityKey && m.direction !== "neutral")
      .map(m => ({
        dateISO: m.dateISO,
        timeMinutes: m.timeMinutes,
        direction: m.direction as "arrived" | "departed",
      }));
    if (homeEvents.length) {
      homeAddressLabel =
        distinctKeys.get(homeEntityKey)?.label ?? homeAddressLabel;
      const buckets = computeHomePresenceByBucket(homeEvents, 12);
      homePresence = buckets.map(toHomePresencePercent);
      homeLikelyRanges = dominantRanges(homePresence, "home", 12);
      homeAwayRanges = dominantRanges(homePresence, "away", 12);
      departureHistogram = buildDirectionHistogram(homeEvents, "departed", 12);
      arrivalHistogram = buildDirectionHistogram(homeEvents, "arrived", 12);
      peakDepartureBucket = peakBucketIndex(departureHistogram);
      peakArrivalBucket = peakBucketIndex(arrivalHistogram);
    }
  }

  return {
    targetName: target.name,
    operationName: operation.name,
    observationCount,
    geocodedObservationCount,
    sufficientData: observationCount >= MIN_OBSERVATIONS_FOR_PATTERN,
    confidence: confidenceTier(geocodedObservationCount),
    timeBuckets: timeBucketLabels(12),
    dayLabels: DAY_LABELS,
    dayTimeGrid,
    mostActiveDayIndices,
    locationTimeGrid,
    peakCell,
    homeAddressKnown,
    homeAddressGeocoded,
    homeAddressMentioned,
    homeAddressLabel,
    homePresence,
    homeLikelyRanges,
    homeAwayRanges,
    departureHistogram,
    arrivalHistogram,
    peakDepartureBucket,
    peakArrivalBucket,
  };
}

// ─── Places Report ───────────────────────────────────────────────────────────
// Where one target goes — see shared/placesReport.ts for every rule (what a
// place is called, what counts as a visit, how long it lasted). Built from the
// same attributed rows and place mentions as Pattern of Life, so the two agree
// on which rows are the target's; unlike that report it does not need a place
// to be geocodable, and it does NOT require a row to be certified (a live
// operation is read as it is written).

export interface IntelTargetPlacesResponse {
  targetName: string;
  operationName: string;
  /** Last day of the report, Perth time — "new this week" counts back from it. */
  todayISO: string;
  places: (PlaceRecord & {
    /** The kind an officer set on this report, or null when it is automatic. */
    officerKind: PlaceKind | null;
  })[];
}

/** Whether an entity is one of the target's registered addresses — Home, or
 * Address 2, 3… — read from the synthetic "Target card" occurrence
 * getAllIntelligenceEntities seeds for each (rowId 0). */
function registeredRefOf(
  occurrences: readonly { rowId: number; observationSnippet?: string | null }[],
  targetName: string,
  extras: readonly { label: string }[]
): RegisteredAddressRef | null {
  const prefix = `Target card — ${targetName} [`;
  for (const occ of occurrences) {
    if (occ.rowId !== 0) continue;
    const snip = occ.observationSnippet ?? "";
    if (!snip.startsWith(prefix)) continue;
    const field = snip.slice(prefix.length).replace(/\]$/, "");
    if (field === "HBF") return { slot: "home", label: "" };
    const n = /^Address (\d+)$/.exec(field);
    if (n)
      return {
        slot: "extra",
        number: Number(n[1]),
        label: extras[Number(n[1]) - 2]?.label ?? "",
      };
  }
  return null;
}

export async function getIntelTargetPlaces(
  operationId: number,
  targetId: number
): Promise<IntelTargetPlacesResponse | null> {
  const db = await getDb();
  if (!db) return null;
  const [operation] = await db
    .select({ id: operations.id, name: operations.name })
    .from(operations)
    .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)))
    .limit(1);
  const target = await getTargetById(targetId);
  if (!operation || !target) return null;
  const empty: IntelTargetPlacesResponse = {
    targetName: target.name,
    operationName: operation.name,
    todayISO: perthTodayISO(),
    places: [],
  };

  const allEntities = await getAllIntelligenceEntities();
  const targetEntity = allEntities.find(
    e => e.isTarget && e.targetId === targetId
  );
  const targetRowIds = attributedRowIds(targetEntity?.occurrences, {
    operationId,
  });
  if (!targetRowIds.size) return empty;

  const sheetIds = new Set<number>();
  for (const occ of targetEntity?.occurrences ?? [])
    if (targetRowIds.has(occ.rowId)) sheetIds.add(occ.sheetId);
  if (!sheetIds.size) return empty;

  const sheets = await db
    .select({
      id: runningSheets.id,
      createdAt: runningSheets.createdAt,
      sheetDate: runningSheets.sheetDate,
    })
    .from(runningSheets)
    .where(inArray(runningSheets.id, Array.from(sheetIds)));
  const sheetDateInfo = new Map(sheets.map(s => [s.id, s]));

  // Every row of those sheets, in order — a row's "previous row" decides
  // whether it is a street list rather than an observation (isNonObservationRow).
  const allSheetRows = await db
    .select({
      id: sheetRows.id,
      sheetId: sheetRows.sheetId,
      rowDate: sheetRows.rowDate,
      dayOffset: sheetRows.dayOffset,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      rowNumber: sheetRows.rowNumber,
    })
    .from(sheetRows)
    .where(inArray(sheetRows.sheetId, Array.from(sheetIds)))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes, sheetRows.rowNumber);
  const rowById = new Map(
    allSheetRows.filter(r => targetRowIds.has(r.id)).map(r => [r.id, r])
  );
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  const bySheet = new Map<number, typeof allSheetRows>();
  for (const row of allSheetRows) {
    if (!bySheet.has(row.sheetId)) bySheet.set(row.sheetId, []);
    bySheet.get(row.sheetId)!.push(row);
  }
  for (const list of Array.from(bySheet.values())) {
    list.forEach((r, i) => {
      previousObservationByRowId.set(
        r.id,
        i > 0 ? (list[i - 1].observation ?? null) : null
      );
      rowOrderIndex.set(r.id, i);
    });
  }
  const resolveDateISO = (row: {
    sheetId: number;
    rowDate: string | null;
    dayOffset: number;
  }): string => {
    if (row.rowDate) return row.rowDate;
    const info = sheetDateInfo.get(row.sheetId);
    return addDaysISO(
      info?.sheetDate ?? toPerthDateISO(info?.createdAt ?? new Date()),
      row.dayOffset
    );
  };

  // The target's registered addresses, from the synthetic "Target card"
  // occurrences getAllIntelligenceEntities seeds for them.
  const extras = parseExtraAddresses(target.extraAddresses);
  const registeredOf = (entity: (typeof allEntities)[number]) =>
    registeredRefOf(entity.occurrences, target.name, extras);

  // Signs saved for places (Google's type from the address suggestions, or an
  // officer's own icon) — how a place Google knows as a gym is known here.
  const signs = new Map<string, string>();
  for (const o of await db
    .select({
      label: intelPinOverrides.label,
      icon: intelPinOverrides.markerIcon,
    })
    .from(intelPinOverrides))
    if (o.icon) signs.set(o.label, o.icon);
  const officer = new Map<string, PlaceKind>();
  for (const l of await db
    .select()
    .from(targetPlaceLabels)
    .where(eq(targetPlaceLabels.targetId, targetId)))
    officer.set(l.placeKey, l.kind as PlaceKind);

  const mentions: PlaceMention[] = [];
  const meta = new Map<
    string,
    { name: string; entity: (typeof allEntities)[number] }
  >();
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0 || !targetRowIds.has(occ.rowId)) continue;
      const row = rowById.get(occ.rowId);
      if (!row?.observation || row.timeMinutes == null) continue;
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;
      const placeKey = normalizeEntityLabel(entity.shortForm);
      if (!meta.has(placeKey))
        meta.set(placeKey, { name: entity.shortForm, entity });
      mentions.push({
        placeKey,
        sheetId: occ.sheetId,
        sheetTitle: occ.sheetTitle,
        order: rowOrderIndex.get(occ.rowId) ?? 0,
        rowId: occ.rowId,
        dateISO: resolveDateISO(row),
        timeMinutes: row.timeMinutes,
        direction: classifyVisitDirection(row.observation),
      });
    }
  }

  const visitsByPlace = new Map<string, ReturnType<typeof buildVisits>>();
  for (const v of buildVisits(mentions)) {
    if (!visitsByPlace.has(v.placeKey)) visitsByPlace.set(v.placeKey, []);
    visitsByPlace.get(v.placeKey)!.push(v);
  }
  const places: IntelTargetPlacesResponse["places"] = [];
  for (const [placeKey, visits] of Array.from(visitsByPlace.entries())) {
    const info = meta.get(placeKey);
    if (!info) continue;
    const officerKind = officer.get(placeKey) ?? null;
    const c = classifyPlace({
      name: info.name,
      savedSign: signs.get(info.name) ?? null,
      registered: registeredOf(info.entity),
      officerKind,
    });
    places.push({
      placeKey,
      name: info.name,
      kind: c.kind,
      source: c.source,
      registeredAs: c.registeredAs,
      visits,
      officerKind,
    });
  }
  return { ...empty, places };
}

// ─── Target Predictor ────────────────────────────────────────────────────────
// What the Map page's Target Predictor needs for one target on one operation:
// the places he goes (located on the map, cache-first like the Heat Map), the
// stops with where he went next (shared/targetPredictor.ts), and where the
// chosen running sheet last had him. The sums are done on the client with the
// clock — nothing here predicts anything.

export interface IntelTargetPredictorResponse {
  targetName: string;
  operationName: string;
  todayISO: string;
  places: (PredictorPlace & {
    kind: PlaceKind;
    /** One of the target's registered addresses (Home, Address 2…). */
    registered: boolean;
    /** Visits on record (0 for a registered address he has not been seen at). */
    visits: number;
  })[];
  stops: PredictorStop[];
  /** The latest visit on the chosen sheet: where, when, and whether a row
   * says he was leaving. Null when the sheet has none. */
  lastSeen: {
    placeKey: string;
    dateISO: string;
    minutes: number;
    leaving: boolean;
  } | null;
}

export interface SharedSeen {
  /** "sheet" = no position of its own: the running sheet's, with this area. */
  kind: "place" | "point" | "none" | "sheet";
  placeKey: string | null;
  lat: number | null;
  lng: number | null;
  /** Minutes after midnight, Perth time. */
  seenMinutes: number | null;
  area: "freeway" | "main" | "built" | "back" | null;
  /** Search: the minute the ring was paused at, or null while it grows. */
  pausedAtMinutes: number | null;
  /** The same moments to the second (epoch ms), or null on a row written
   * before they existed — the minutes above are then used. */
  seenAtMs: number | null;
  pausedAtMs: number | null;
  updatedByCIN: string | null;
  updatedAtMs: number;
  /** When this search began (the row is new for every start), so a screen can
   * tell a fresh search from one it has already dealt with or dismissed. */
  startedAtMs: number;
}

/** What the team set by hand as "last seen" for this sheet today, shared with
 * everyone who has it open. Null when nothing is set (or it is from an earlier
 * day). A light query: the predictor polls it every few seconds. */
export async function getSharedSeen(
  sheetId: number
): Promise<SharedSeen | null> {
  const db = await getDb();
  if (!db) return null;
  const todayISO = perthTodayISO();
  const [row] = await db
    .select()
    .from(predictorLastSeen)
    .where(eq(predictorLastSeen.sheetId, sheetId))
    .limit(1);
  // Only today's counts: yesterday's "last seen" says nothing about now.
  if (!row || row.dateISO !== todayISO) return null;
  return {
    kind: row.kind as SharedSeen["kind"],
    placeKey: row.placeKey,
    lat: row.lat,
    lng: row.lng,
    seenMinutes: row.seenMinutes,
    area: row.area as SharedSeen["area"],
    pausedAtMinutes: row.pausedAtMinutes,
    seenAtMs: row.seenAtMs,
    pausedAtMs: row.pausedAtMs,
    updatedByCIN: row.updatedByCIN,
    updatedAtMs: row.updatedAt.getTime(),
    startedAtMs: row.createdAt.getTime(),
  };
}

/** Sets (replacing any earlier one) where the team says he was last seen. */
export async function setPredictorLastSeen(params: {
  sheetId: number;
  targetId: number;
  kind: SharedSeen["kind"];
  placeKey: string | null;
  lat: number | null;
  lng: number | null;
  seenMinutes: number | null;
  area: SharedSeen["area"];
  pausedAtMinutes: number | null;
  seenAtMs?: number | null;
  pausedAtMs?: number | null;
  cin: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const values = {
    sheetId: params.sheetId,
    targetId: params.targetId,
    dateISO: perthTodayISO(),
    kind: params.kind,
    placeKey: params.kind === "place" ? params.placeKey : null,
    lat: params.kind === "point" ? params.lat : null,
    lng: params.kind === "point" ? params.lng : null,
    seenMinutes:
      params.kind === "none" || params.kind === "sheet"
        ? null
        : params.seenMinutes,
    area: params.area,
    pausedAtMinutes: params.kind === "point" ? params.pausedAtMinutes : null,
    seenAtMs: params.kind === "point" ? (params.seenAtMs ?? null) : null,
    pausedAtMs: params.kind === "point" ? (params.pausedAtMs ?? null) : null,
    updatedByCIN: params.cin,
  };
  // A row from an earlier day is thrown away first, so today's search is a new
  // row (and a new start time) rather than yesterday's, brought back to life.
  await db
    .delete(predictorLastSeen)
    .where(
      and(
        eq(predictorLastSeen.sheetId, params.sheetId),
        ne(predictorLastSeen.dateISO, values.dateISO)
      )
    );
  await db
    .insert(predictorLastSeen)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}

/** Starts Search on this sheet. The search is shown to everybody who has this
 * operation selected, so there is only one at a time per operation:
 *  - one already running on this sheet is left as it is (nothing is wiped);
 *  - one running on ANOTHER sheet of the same operation that has been touched in
 *    the last hour holds the operation — the first search has priority — and
 *    nothing new is started (`holdingSheetId` says which);
 *  - older ones on the operation are over: they are removed and this one starts
 *    blank. */
export async function startPredictorSearch(params: {
  sheetId: number;
  targetId: number;
  cin: string | null;
}): Promise<{ existing: boolean; holdingSheetId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const today = perthTodayISO();
  const now = Date.now();

  const [sheet] = await db
    .select({ operationId: runningSheets.operationId })
    .from(runningSheets)
    .where(eq(runningSheets.id, params.sheetId))
    .limit(1);
  if (sheet) {
    const others = await db
      .select({
        sheetId: predictorLastSeen.sheetId,
        updatedAt: predictorLastSeen.updatedAt,
        dateISO: predictorLastSeen.dateISO,
      })
      .from(predictorLastSeen)
      .innerJoin(runningSheets, eq(runningSheets.id, predictorLastSeen.sheetId))
      .where(
        and(
          eq(runningSheets.operationId, sheet.operationId),
          ne(predictorLastSeen.sheetId, params.sheetId)
        )
      );
    const holding = others.find(
      o => o.dateISO === today && holdsPriority(o.updatedAt.getTime(), now)
    );
    if (holding) return { existing: true, holdingSheetId: holding.sheetId };
    // The rest are over: a start takes the operation.
    const stale = others.map(o => o.sheetId);
    if (stale.length)
      await db
        .delete(predictorLastSeen)
        .where(inArray(predictorLastSeen.sheetId, stale));
  }

  const [row] = await db
    .select({
      dateISO: predictorLastSeen.dateISO,
      updatedAt: predictorLastSeen.updatedAt,
    })
    .from(predictorLastSeen)
    .where(eq(predictorLastSeen.sheetId, params.sheetId))
    .limit(1);
  if (
    row &&
    row.dateISO === today &&
    isSearchLive(row.updatedAt.getTime(), now)
  )
    return { existing: true, holdingSheetId: null };
  if (row)
    await db
      .delete(predictorLastSeen)
      .where(eq(predictorLastSeen.sheetId, params.sheetId));
  await db.insert(predictorLastSeen).values({
    sheetId: params.sheetId,
    targetId: params.targetId,
    dateISO: today,
    kind: "sheet",
    updatedByCIN: params.cin,
  });
  return { existing: false, holdingSheetId: null };
}

export interface TodaysSearchRow {
  seen: SharedSeen;
  sheetId: number;
  operationId: number;
  targetId: number;
  /** The sheet's CIN roster, as stored (JSON). */
  sheetCins: string | null;
}

/** Every search running today, with the sheet it belongs to. The router keeps
 * only the ones the caller is on the team of and may reach. */
export async function getTodaysSearches(): Promise<TodaysSearchRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      row: predictorLastSeen,
      operationId: runningSheets.operationId,
      sheetCins: runningSheets.sheetCins,
    })
    .from(predictorLastSeen)
    .innerJoin(runningSheets, eq(runningSheets.id, predictorLastSeen.sheetId))
    .where(
      and(
        eq(predictorLastSeen.dateISO, perthTodayISO()),
        isNull(runningSheets.deletedAt)
      )
    );
  return rows.map(r => ({
    seen: {
      kind: r.row.kind as SharedSeen["kind"],
      placeKey: r.row.placeKey,
      lat: r.row.lat,
      lng: r.row.lng,
      seenMinutes: r.row.seenMinutes,
      area: r.row.area as SharedSeen["area"],
      pausedAtMinutes: r.row.pausedAtMinutes,
      seenAtMs: r.row.seenAtMs,
      pausedAtMs: r.row.pausedAtMs,
      updatedByCIN: r.row.updatedByCIN,
      updatedAtMs: r.row.updatedAt.getTime(),
      startedAtMs: r.row.createdAt.getTime(),
    },
    sheetId: r.row.sheetId,
    operationId: r.operationId,
    targetId: r.row.targetId,
    sheetCins: r.sheetCins,
  }));
}

/** Back to what the running sheet says. */
export async function clearPredictorLastSeen(sheetId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(predictorLastSeen)
    .where(eq(predictorLastSeen.sheetId, sheetId));
}

export async function getIntelTargetPredictor(
  operationId: number,
  targetId: number,
  sheetId: number | null
): Promise<IntelTargetPredictorResponse | null> {
  const report = await getIntelTargetPlaces(operationId, targetId);
  if (!report) return null;
  // Locations of interest: every place he has been seen at, plus his registered
  // addresses even if he has never been seen there — so the predictor has
  // something to offer inside the "how far could he have got" ring on day one.
  const target = await getTargetById(targetId);
  const have = new Set(report.places.map(p => p.placeKey));
  const registeredOnly: {
    placeKey: string;
    name: string;
    kind: PlaceKind;
  }[] = [];
  if (target) {
    const extras = parseExtraAddresses(target.extraAddresses);
    for (const entity of await getAllIntelligenceEntities()) {
      if (entity.type !== "address" && entity.type !== "business") continue;
      const ref = registeredRefOf(entity.occurrences, target.name, extras);
      if (!ref) continue;
      const placeKey = normalizeEntityLabel(entity.shortForm);
      if (have.has(placeKey)) continue;
      have.add(placeKey);
      registeredOnly.push({
        placeKey,
        name: entity.shortForm,
        kind: classifyPlace({
          name: entity.shortForm,
          registered: ref,
        }).kind,
      });
    }
  }
  const places = await Promise.all(
    [
      ...report.places.map(p => ({
        placeKey: p.placeKey,
        name: p.name,
        kind: p.kind,
        visits: p.visits.length,
        registered: p.registeredAs !== null,
      })),
      ...registeredOnly.map(p => ({ ...p, visits: 0, registered: true })),
    ].map(async p => {
      const at = await resolveLatLng(p.placeKey, p.name);
      return {
        ...p,
        lat: at?.lat ?? null,
        lng: at?.lng ?? null,
      };
    })
  );
  const visits = report.places.flatMap(p => p.visits);
  let lastSeen: IntelTargetPredictorResponse["lastSeen"] = null;
  let lastKey = -1;
  if (sheetId != null) {
    for (const v of visits) {
      if (v.sheetId !== sheetId) continue;
      const minutes = v.endMinutes ?? v.startMinutes;
      if (minutes === null) continue;
      const key = Math.floor(Date.parse(v.dateISO) / 60_000) + minutes;
      if (key <= lastKey) continue;
      lastKey = key;
      lastSeen = {
        placeKey: v.placeKey,
        dateISO: v.dateISO,
        minutes,
        leaving: v.endMinutes !== null,
      };
    }
  }
  return {
    targetName: report.targetName,
    operationName: report.operationName,
    todayISO: report.todayISO,
    places,
    stops: buildStops(visits),
    lastSeen,
  };
}

/** Sets (or, with kind = null, clears) an officer's label on a place for a
 * target. */
export async function setTargetPlaceLabel(params: {
  targetId: number;
  placeKey: string;
  kind: PlaceKind | null;
  cin: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { targetId, placeKey, kind, cin } = params;
  if (kind === null) {
    await db
      .delete(targetPlaceLabels)
      .where(
        and(
          eq(targetPlaceLabels.targetId, targetId),
          eq(targetPlaceLabels.placeKey, placeKey)
        )
      );
    return;
  }
  if (!(LABELLABLE_KINDS as readonly string[]).includes(kind))
    throw new Error("That kind of place cannot be set by hand.");
  await db
    .insert(targetPlaceLabels)
    .values({ targetId, placeKey, kind, updatedByCIN: cin })
    .onDuplicateKeyUpdate({ set: { kind, updatedByCIN: cin } });
}

// ─── Weekly Activity Report ─────────────────────────────────────────────────
// "What the unit did this week" — operations coverage, newly-gathered
// intelligence, target visit activity, and governance completed, all for a
// given Monday-start week. Reuses the same entity pipeline and observed-
// visit logic as the Heat Map (see getIntelligenceHeatMapLocations above)
// rather than re-deriving anything.

export interface WeeklyActivityIssue {
  /** The sheet's own date (sheetDate/createdAt fallback), not "when read". */
  date: string | null;
  text: string;
}

export interface WeeklyActivitySpecialProject {
  key: string;
  detail: string | null;
}

export interface WeeklyActivityImage {
  attachmentId: number;
  url: string;
  createdAt: Date;
  /** Same shape LinkedEntityPills renders under a photo on the running sheet. */
  linkedEntities: { category: string; label: string }[];
}

export interface WeeklyActivityNewIntel {
  persons: string[];
  vehicles: string[];
  locations: string[];
  images: WeeklyActivityImage[];
}

export interface WeeklyActivityTargetBlock {
  /** null = sheets this week with no target assigned. */
  targetId: number | null;
  targetName: string | null;
  officers: string[];
  teamLabel: string | null;
  /** Distinct sheet dates worked, ascending. */
  days: string[];
  /** Sum of (finish - start) across the week's sheets for this target, in hours. */
  coverageHours: number | null;
  investigator: string | null;
  intelSupport: string | null;
  contacted: string | null;
  specialProjects: WeeklyActivitySpecialProject[];
  objectives: string[];
  criticalDecisions: WeeklyActivityIssue[];
  issues: WeeklyActivityIssue[];
  targetActivity: { label: string; count: number }[];
  newIntel: WeeklyActivityNewIntel;
}

export interface WeeklyActivityOperationBlock {
  operationId: number;
  operationName: string;
  sheetsCount: number;
  rowsCount: number;
  targets: WeeklyActivityTargetBlock[];
}

export interface WeeklyActivityReport {
  weekStart: string;
  weekEnd: string;
  operations: WeeklyActivityOperationBlock[];
}

/** Defensive JSON-array parse for the Supervisor Summary's free-text-array
 * fields (objectives/specialProjects/criticalDecisions) — same tolerance as
 * the client's parseRollupJsonArray, duplicated here since this is the one
 * place server-side that needs to merge several sheets' arrays together
 * rather than just pass the raw string through to the client. */
function parseSummaryJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * "07:33" -> 453, "02:00 PM" -> 840. The Supervisor Summary's time fields
 * are entered 12-hour with an AM/PM suffix ("07:00 AM"–"02:00 PM"), so a
 * bare 24-hour read of the hour digits left every afternoon finish time
 * looking earlier than its own morning start time (2 read as 2am, not
 * 2pm) — coverage hours silently dropped to ~0 for every shift except the
 * one where the PM hour happened to still be numerically >= 12 (12:xx PM).
 * Returns null for anything that doesn't match.
 */
export function parseHHMMToMinutes(
  t: string | null | undefined
): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "AM" && hour === 12) hour = 0;
  else if (ampm === "PM" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

/** weekStart is a Monday, YYYY-MM-DD (Perth-anchored). */
export async function getWeeklyActivityReport(
  weekStart: string
): Promise<WeeklyActivityReport> {
  const db = await getDb();
  const weekEnd = addDaysISO(weekStart, 6);
  const empty: WeeklyActivityReport = { weekStart, weekEnd, operations: [] };
  if (!db) return empty;

  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  if (!sheets.length) return empty;
  const sheetById = new Map(sheets.map(s => [s.id, s]));
  const opIds = Array.from(new Set(sheets.map(s => s.operationId)));

  // Targets are looked up by the ids the sheets actually reference, not by
  // targets.operationId — that column is a nullable legacy field (the real
  // association is the operation_target_links join table, since a registry
  // target can belong to several operations). Filtering on it silently
  // dropped every registry-created target, leaving Target Activity showing
  // "—" instead of a name.
  const referencedTargetIds = Array.from(
    new Set(
      sheets
        .map(s => s.targetId)
        .filter((id): id is number => typeof id === "number")
    )
  );

  const [ops, targetRows, rows, allEntities, summaryRows] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    referencedTargetIds.length
      ? db
          .select()
          .from(targets)
          .where(inArray(targets.id, referencedTargetIds))
      : Promise.resolve([] as (typeof targets.$inferSelect)[]),
    db
      .select()
      .from(sheetRows)
      .where(
        inArray(
          sheetRows.sheetId,
          sheets.map(s => s.id)
        )
      ),
    getAllIntelligenceEntities(),
    db
      .select()
      .from(sheetSummaries)
      .where(
        inArray(
          sheetSummaries.sheetId,
          sheets.map(s => s.id)
        )
      ),
  ]);
  const opById = new Map(ops.map(o => [o.id, o]));
  const targetById = new Map(targetRows.map(t => [t.id, t]));
  const summaryBySheetId = new Map(summaryRows.map(s => [s.sheetId, s]));

  // Priority: explicit rowDate, then the sheet's picker date (sheetDate —
  // the authoritative calendar date for the sheet, distinct from createdAt),
  // then createdAt only as a last resort for legacy sheets with no
  // sheetDate. Falling straight to createdAt (as this used to) silently
  // misdated every row on a sheet created for a different day than it was
  // actually saved, dropping it out of every week's report entirely.
  function resolveRowDate(row: (typeof rows)[number]): string {
    if (row.rowDate) return row.rowDate;
    const sheet = sheetById.get(row.sheetId);
    return addDaysISO(
      sheet?.sheetDate ?? toPerthDateISO(sheet?.createdAt ?? new Date()),
      row.dayOffset
    );
  }
  function resolveSheetDate(sheetId: number): string | null {
    const sheet = sheetById.get(sheetId);
    if (!sheet) return null;
    return sheet.sheetDate ?? toPerthDateISO(sheet.createdAt);
  }
  const rowById = new Map(rows.map(r => [r.id, r]));
  const rowsInWeek = rows.filter(r => {
    const d = resolveRowDate(r);
    return d >= weekStart && d <= weekEnd;
  });

  // ── Group this week's sheets by operation, then by target (null = no
  // target assigned) — every other section below hangs off this grouping,
  // matching the "one report block per target" layout the Weekly Surveillance
  // Report renders. ────────────────────────────────────────────────────────
  type GroupKey = string; // `${operationId}:${targetId ?? "none"}`
  const groupKey = (operationId: number, targetId: number | null): GroupKey =>
    `${operationId}:${targetId ?? "none"}`;

  const opSheetIds = new Map<number, Set<number>>();
  const opRowsCount = new Map<number, number>();
  const groupSheetIds = new Map<GroupKey, Set<number>>();
  const groupMeta = new Map<
    GroupKey,
    { operationId: number; targetId: number | null }
  >();
  for (const r of rowsInWeek) {
    const sheet = sheetById.get(r.sheetId);
    if (!sheet) continue;
    if (!opSheetIds.has(sheet.operationId))
      opSheetIds.set(sheet.operationId, new Set());
    opSheetIds.get(sheet.operationId)!.add(sheet.id);
    opRowsCount.set(
      sheet.operationId,
      (opRowsCount.get(sheet.operationId) ?? 0) + 1
    );

    const targetId = sheet.targetId ?? null;
    const key = groupKey(sheet.operationId, targetId);
    if (!groupSheetIds.has(key)) {
      groupSheetIds.set(key, new Set());
      groupMeta.set(key, { operationId: sheet.operationId, targetId });
    }
    groupSheetIds.get(key)!.add(sheet.id);
  }

  // ── Deployment / Investigator / Special Projects / Objectives / Critical
  // Decisions / Issues — all sourced from each sheet's Supervisor Summary
  // (sheetSummaries), aggregated across every sheet in the group. ─────────
  const officersByGroup = new Map<GroupKey, Set<string>>();
  const teamLabelsByGroup = new Map<GroupKey, Set<string>>();
  const daysByGroup = new Map<GroupKey, Set<string>>();
  const coverageMinutesByGroup = new Map<GroupKey, number>();
  const investigatorByGroup = new Map<GroupKey, string>();
  const intelSupportByGroup = new Map<GroupKey, string>();
  const contactedByGroup = new Map<GroupKey, string>();
  // Keyed by normalized "key|detail" per group — the same special project
  // is typically re-typed into every sheet's Supervisor Summary for the
  // week it spans, so a plain push-per-sheet duplicated it once per day.
  const specialProjectsByGroup = new Map<
    GroupKey,
    Map<string, WeeklyActivitySpecialProject>
  >();
  const objectivesByGroup = new Map<GroupKey, Set<string>>();
  const criticalDecisionsByGroup = new Map<GroupKey, WeeklyActivityIssue[]>();
  const issuesByGroup = new Map<GroupKey, WeeklyActivityIssue[]>();

  for (const [key, sheetIds] of Array.from(groupSheetIds.entries())) {
    // Newest sheet first, so "latest wins" for investigator/intel/contacted.
    const orderedSheetIds = Array.from(sheetIds).sort((a, b) => {
      const da = resolveSheetDate(a) ?? "";
      const db_ = resolveSheetDate(b) ?? "";
      return db_.localeCompare(da);
    });
    for (const sheetId of orderedSheetIds) {
      const sheet = sheetById.get(sheetId);
      if (sheet?.sheetCins) {
        try {
          const cins: { cin: string }[] = JSON.parse(sheet.sheetCins);
          for (const c of cins) {
            if (!c.cin) continue;
            if (!officersByGroup.has(key)) officersByGroup.set(key, new Set());
            officersByGroup.get(key)!.add(c.cin);
          }
        } catch {
          // malformed roster JSON — skip officers for this sheet
        }
      }
      const date = resolveSheetDate(sheetId);
      if (date) {
        if (!daysByGroup.has(key)) daysByGroup.set(key, new Set());
        daysByGroup.get(key)!.add(date);
      }

      const summary = summaryBySheetId.get(sheetId);
      if (!summary) continue;

      if (summary.teamLabel) {
        if (!teamLabelsByGroup.has(key)) teamLabelsByGroup.set(key, new Set());
        teamLabelsByGroup.get(key)!.add(summary.teamLabel);
      }
      const startMin = parseHHMMToMinutes(summary.startTime);
      const finishMin = parseHHMMToMinutes(summary.finishTime);
      if (startMin !== null && finishMin !== null && finishMin > startMin) {
        coverageMinutesByGroup.set(
          key,
          (coverageMinutesByGroup.get(key) ?? 0) + (finishMin - startMin)
        );
      }
      if (summary.ioSupport?.trim() && !investigatorByGroup.has(key))
        investigatorByGroup.set(key, summary.ioSupport.trim());
      if (summary.intelSupport?.trim() && !intelSupportByGroup.has(key))
        intelSupportByGroup.set(key, summary.intelSupport.trim());
      const contactParts = [summary.ioContactTiming, summary.ioContactMethod]
        .map(p => p?.trim())
        .filter((p): p is string => !!p);
      if (contactParts.length && !contactedByGroup.has(key))
        contactedByGroup.set(key, contactParts.join(" — "));

      for (const p of parseSummaryJsonArray<{ key: string; detail?: string }>(
        summary.specialProjects
      )) {
        if (!p.key?.trim()) continue;
        const project: WeeklyActivitySpecialProject = {
          key: p.key.trim(),
          detail: p.detail?.trim() || null,
        };
        const dedupeKey = `${project.key.toLowerCase()}|${(project.detail ?? "").toLowerCase()}`;
        if (!specialProjectsByGroup.has(key))
          specialProjectsByGroup.set(key, new Map());
        if (!specialProjectsByGroup.get(key)!.has(dedupeKey))
          specialProjectsByGroup.get(key)!.set(dedupeKey, project);
      }
      for (const o of parseSummaryJsonArray<string>(summary.objectives)) {
        if (!o.trim()) continue;
        if (!objectivesByGroup.has(key)) objectivesByGroup.set(key, new Set());
        objectivesByGroup.get(key)!.add(o.trim());
      }
      for (const d of parseSummaryJsonArray<string>(
        summary.criticalDecisions
      )) {
        if (!d.trim()) continue;
        if (!criticalDecisionsByGroup.has(key))
          criticalDecisionsByGroup.set(key, []);
        criticalDecisionsByGroup.get(key)!.push({ date, text: d.trim() });
      }
      if (summary.issues?.trim()) {
        if (!issuesByGroup.has(key)) issuesByGroup.set(key, []);
        issuesByGroup.get(key)!.push({ date, text: summary.issues.trim() });
      }
    }
  }

  // ── New intelligence — persons/vehicles/locations whose *first-ever*
  // occurrence (all time, not just this week) falls inside the week, i.e.
  // genuinely new discoveries rather than repeat mentions of something
  // already known — plus images uploaded this week. Both attributed to the
  // target of the sheet the mention/photo actually happened on. ──────────
  const newPersonsByGroup = new Map<GroupKey, Set<string>>();
  const newVehiclesByGroup = new Map<GroupKey, Set<string>>();
  const newLocationsByGroup = new Map<GroupKey, Set<string>>();
  for (const entity of allEntities) {
    if (
      entity.type !== "address" &&
      entity.type !== "business" &&
      entity.type !== "vehicle" &&
      entity.type !== "person"
    )
      continue;
    let earliestDate: string | null = null;
    const groupsSeenThisWeek = new Set<GroupKey>();
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0) continue; // target-card entry, not a real sighting
      const row = rowById.get(occ.rowId);
      const d = row ? resolveRowDate(row) : null;
      if (!d) continue;
      if (earliestDate === null || d < earliestDate) earliestDate = d;
      if (d >= weekStart && d <= weekEnd) {
        const sheet = row ? sheetById.get(row.sheetId) : undefined;
        if (!sheet) continue;
        groupsSeenThisWeek.add(
          groupKey(sheet.operationId, sheet.targetId ?? null)
        );
      }
    }
    if (
      earliestDate === null ||
      earliestDate < weekStart ||
      earliestDate > weekEnd
    )
      continue; // not newly discovered this week
    const targetMap =
      entity.type === "vehicle"
        ? newVehiclesByGroup
        : entity.type === "person"
          ? newPersonsByGroup
          : newLocationsByGroup;
    for (const key of Array.from(groupsSeenThisWeek)) {
      if (!targetMap.has(key)) targetMap.set(key, new Set());
      targetMap.get(key)!.add(entity.shortForm);
    }
  }

  const attachments = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      operationId: rowAttachments.operationId,
      url: rowAttachments.url,
      createdAt: rowAttachments.createdAt,
    })
    .from(rowAttachments)
    .where(
      and(
        inArray(rowAttachments.operationId, opIds),
        isNull(rowAttachments.deletedAt)
      )
    );
  const attachmentsInWeek = attachments.filter(a => {
    const d = toPerthDateISO(a.createdAt);
    return d >= weekStart && d <= weekEnd;
  });
  const attachmentsWithLinks = await attachLinkedCounts(db, attachmentsInWeek);
  const imagesByGroup = new Map<GroupKey, WeeklyActivityImage[]>();
  for (const a of attachmentsWithLinks) {
    const row = a.rowId ? rowById.get(a.rowId) : undefined;
    const sheet = row ? sheetById.get(row.sheetId) : undefined;
    const key = groupKey(a.operationId, sheet?.targetId ?? null);
    if (!imagesByGroup.has(key)) imagesByGroup.set(key, []);
    imagesByGroup.get(key)!.push({
      attachmentId: a.id,
      url: a.url,
      createdAt: a.createdAt,
      linkedEntities: a.linkedEntities,
    });
  }

  // ── Target visit activity — same qualifying-mention + session-collapse
  // rules as the Heat Map (skip target-card entries, Surveillance
  // Commenced/Ceased and Travelled Via rows, require an observation-signal
  // keyword, collapse consecutive same-address mentions into one visit) —
  // grouped the same way as everything else above. ────────────────────────
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  {
    const bySheet = new Map<number, typeof rows>();
    for (const r of rows) {
      if (!bySheet.has(r.sheetId)) bySheet.set(r.sheetId, []);
      bySheet.get(r.sheetId)!.push(r);
    }
    for (const list of Array.from(bySheet.values())) {
      list.sort(
        (a, b) =>
          (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0) ||
          a.rowNumber - b.rowNumber
      );
      list.forEach((r, i) => {
        previousObservationByRowId.set(
          r.id,
          i > 0 ? (list[i - 1].observation ?? null) : null
        );
        rowOrderIndex.set(r.id, i);
      });
    }
  }

  type QualifyingMention = {
    entityKey: string;
    label: string;
    groupKey: GroupKey;
    order: number;
  };
  const qualifying: QualifyingMention[] = [];
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0) continue;
      const row = rowById.get(occ.rowId);
      if (!row?.observation) continue;
      const d = resolveRowDate(row);
      if (d < weekStart || d > weekEnd) continue;
      const sheet = sheetById.get(row.sheetId);
      if (!sheet?.targetId) continue; // no target assigned — not attributable
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;
      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        groupKey: groupKey(sheet.operationId, sheet.targetId),
        order: rowOrderIndex.get(occ.rowId) ?? 0,
      });
    }
  }
  const visitCountsByGroup = new Map<
    GroupKey,
    Map<string, { label: string; count: number }>
  >();
  const qualifyingByGroup = new Map<GroupKey, QualifyingMention[]>();
  for (const m of qualifying) {
    if (!qualifyingByGroup.has(m.groupKey))
      qualifyingByGroup.set(m.groupKey, []);
    qualifyingByGroup.get(m.groupKey)!.push(m);
  }
  for (const [key, mentions] of Array.from(qualifyingByGroup.entries())) {
    mentions.sort((a, b) => a.order - b.order);
    let lastEntityKey: string | null = null;
    const grouped = new Map<string, { label: string; count: number }>();
    for (const m of mentions) {
      if (m.entityKey === lastEntityKey) continue;
      lastEntityKey = m.entityKey;
      const existing = grouped.get(m.entityKey);
      if (existing) existing.count++;
      else grouped.set(m.entityKey, { label: m.label, count: 1 });
    }
    visitCountsByGroup.set(key, grouped);
  }

  // ── Assemble: one WeeklyActivityTargetBlock per group, nested under its
  // operation ──────────────────────────────────────────────────────────────
  const allGroupKeys = new Set<GroupKey>([
    ...Array.from(groupSheetIds.keys()),
    ...Array.from(imagesByGroup.keys()),
    ...Array.from(newPersonsByGroup.keys()),
    ...Array.from(newVehiclesByGroup.keys()),
    ...Array.from(newLocationsByGroup.keys()),
    ...Array.from(visitCountsByGroup.keys()),
  ]);
  const targetBlocksByOp = new Map<number, WeeklyActivityTargetBlock[]>();
  for (const key of Array.from(allGroupKeys)) {
    const meta = groupMeta.get(key);
    // A group can only come from imagesByGroup/newIntel/visitCounts (never
    // groupSheetIds) if a photo or mention landed on a sheet that itself had
    // no row in the week — shouldn't happen given how each map is built, but
    // skip defensively rather than render a block with no coverage data.
    if (!meta) continue;
    const { operationId, targetId } = meta;
    const target = targetId ? targetById.get(targetId) : null;
    const coverageMinutes = coverageMinutesByGroup.get(key) ?? null;

    const block: WeeklyActivityTargetBlock = {
      targetId,
      targetName: target?.name ?? null,
      officers: Array.from(officersByGroup.get(key) ?? []).sort(),
      teamLabel:
        Array.from(teamLabelsByGroup.get(key) ?? []).join(", ") || null,
      days: Array.from(daysByGroup.get(key) ?? []).sort(),
      coverageHours:
        coverageMinutes !== null
          ? Math.round((coverageMinutes / 60) * 10) / 10
          : null,
      investigator: investigatorByGroup.get(key) ?? null,
      intelSupport: intelSupportByGroup.get(key) ?? null,
      contacted: contactedByGroup.get(key) ?? null,
      specialProjects: Array.from(
        (specialProjectsByGroup.get(key) ?? new Map()).values()
      ),
      objectives: Array.from(objectivesByGroup.get(key) ?? []),
      criticalDecisions: (criticalDecisionsByGroup.get(key) ?? []).sort(
        (a, b) => (a.date ?? "").localeCompare(b.date ?? "")
      ),
      issues: (issuesByGroup.get(key) ?? []).sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "")
      ),
      targetActivity: Array.from(
        (visitCountsByGroup.get(key) ?? new Map()).values()
      ).sort((a, b) => b.count - a.count),
      newIntel: {
        persons: Array.from(newPersonsByGroup.get(key) ?? []).sort(),
        vehicles: Array.from(newVehiclesByGroup.get(key) ?? []).sort(),
        locations: Array.from(newLocationsByGroup.get(key) ?? []).sort(),
        images: (imagesByGroup.get(key) ?? []).sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        ),
      },
    };
    if (!targetBlocksByOp.has(operationId))
      targetBlocksByOp.set(operationId, []);
    targetBlocksByOp.get(operationId)!.push(block);
  }
  for (const blocks of Array.from(targetBlocksByOp.values())) {
    // Named targets alphabetically first, the "no target" block (targetId
    // null) last — matches how the report reads: specific work first, the
    // catch-all bucket at the end.
    blocks.sort((a, b) => {
      if (a.targetId === null && b.targetId === null) return 0;
      if (a.targetId === null) return 1;
      if (b.targetId === null) return -1;
      return (a.targetName ?? "").localeCompare(b.targetName ?? "");
    });
  }

  const operationBlocks: WeeklyActivityOperationBlock[] = Array.from(
    opSheetIds.keys()
  )
    .map(opId => ({
      operationId: opId,
      operationName: opById.get(opId)?.name ?? "—",
      sheetsCount: opSheetIds.get(opId)?.size ?? 0,
      rowsCount: opRowsCount.get(opId) ?? 0,
      targets: targetBlocksByOp.get(opId) ?? [],
    }))
    .sort((a, b) => a.operationName.localeCompare(b.operationName));

  return { weekStart, weekEnd, operations: operationBlocks };
}

// The unscoped entity set is remembered for a short while and reused only when
// the source tables haven't changed (server/intelCache.ts). Everyone gets a
// copy, and the per-request scope below is applied to that copy.
const intelEntityCache = new FingerprintCache<IntelligenceEntity[]>(v =>
  structuredClone(v)
);

/** Drop the remembered set after a write the change check can't see (an
 * in-place update of a link or alias row). */
export function invalidateIntelligenceCache() {
  intelEntityCache.invalidate();
}

async function loadAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  let fp: Fingerprint | null = null;
  try {
    const db = await getDb();
    if (db) {
      const [rows] = (await db.execute(
        sql.raw(fingerprintSql())
      )) as unknown as [Record<string, unknown>[]];
      fp = fingerprintFromRow(rows?.[0]);
    }
  } catch {
    fp = null; // the check failed: build fresh, remember nothing
  }
  return intelEntityCache.get(fp, async () => {
    // Time each real rebuild (not a cache hit) so the log warns when it is
    // time to start the Intelligence redesign (server/intelBuildWatch.ts).
    const started = Date.now();
    const built = await buildAllIntelligenceEntities();
    recordIntelBuild(Date.now() - started, fp ? fp.rows : null, built.length);
    return built;
  });
}

export async function getAllIntelligenceEntities(opts?: {
  /** Skip the per-request Intelligence scope (Region Search only). */
  unscoped?: boolean;
}) {
  const all = await loadAllIntelligenceEntities();
  const scope = intelScope.getStore();
  if (!scope || opts?.unscoped) return all;
  // A registry target's occurrences carry operation 0 even when its running
  // sheet sits inside a hidden operation, so hide by the sheet as well.
  const hiddenIds = Array.from(scope.hiddenOperationIds);
  const db = hiddenIds.length > 0 ? await getDb() : null;
  const hiddenSheets = new Set<number>();
  if (db) {
    const rows = await db
      .select({ id: runningSheets.id })
      .from(runningSheets)
      .where(inArray(runningSheets.operationId, hiddenIds));
    for (const r of rows) hiddenSheets.add(r.id);
  }
  return scopeEntities(all, scope.hiddenOperationIds, hiddenSheets);
}

async function buildAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  const db = await getDb();
  if (!db) return [];

  // "business" and "address" are the same category of location entity from
  // an officer's point of view — which one a given mention gets classified
  // as depends only on whether that particular sentence happened to spell
  // out the street address, not on what the place actually is (see the
  // type classification in extractEntitiesFromText above). Bucket both
  // under the same key prefix everywhere an entity type key gets built
  // below, so a location mentioned once with its street address and once
  // without ("The Reveley, 1 Barrack Street, PERTH WA (The Reveley)" vs
  // just "The Reveley (The Reveley)") merges into one entity instead of
  // forking into two separate profiles for the same real place.
  const locationKeyType = (t: string) => (t === "business" ? "address" : t);

  // Confirmed entity-alias merges (fuzzy-duplicate prompt "Yes", or the manual
  // Merge Entities tool) — fold the loser's occurrences into the winner the
  // same way TGT aliases fold into their canonical target below. loserLabel
  // is attached to the winner entity's aliasLabels ("also known as") the
  // first time an occurrence is redirected through it — see registerOccurrence.
  const aliasRows = await db.select().from(entityAliases);
  const entityAliasMap = new Map<string, { key: string; label: string }>();
  for (const a of aliasRows) {
    const aliasType = locationKeyType(a.type);
    entityAliasMap.set(`${aliasType}::${a.loserKey}`, {
      key: `${aliasType}::${a.winnerKey}`,
      label: a.winnerLabel,
    });
  }

  // When two mentions of the same vehicle merge, prefer whichever actually
  // carries more descriptive detail — not whichever happens to start with
  // the rego. That used to be the tie-break (favouring the "REGO
  // description" form observation text is built in, over a raw target-card
  // field where the rego sits mid-sentence, e.g. "silver Hyundai Santa Fe,
  // bearing WA registration 1ICW519") but it backfired badly: a bare
  // "Vehicle 1GHH000" text mention starts with the rego and so counted as
  // "canonical", letting it beat — and overwrite — a fully-detailed target
  // card ("grey Ford Ranger Utility, bearing WA registration 1GHH000") that
  // doesn't. Strip the rego out of both candidates first and compare what's
  // actually left describing the vehicle; whichever has more wins,
  // regardless of where the rego sits in the string.
  const escapeRegExp = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vehicleDescriptiveLength = (
    shortForm: string,
    regoKey: string
  ): number =>
    shortForm
      .toLowerCase()
      .replace(new RegExp(`\\b${escapeRegExp(regoKey)}\\b`, "i"), "")
      .replace(/[,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  const preferVehicleShortForm = (
    existing: string,
    candidate: string,
    regoKey: string
  ): boolean => {
    const existingLen = vehicleDescriptiveLength(existing, regoKey);
    const candidateLen = vehicleDescriptiveLength(candidate, regoKey);
    if (candidateLen !== existingLen) return candidateLen > existingLen;
    return candidate.length > existing.length;
  };

  // ── 1. Load formal target cards first ─────────────────────────────────────
  // Use leftJoin so registry targets with null operationId are included.
  // Also pull in linked operations via operation_target_links for registry targets.
  const directTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      targetType: targets.targetType,
      surname: targets.surname,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      extraAddresses: targets.extraAddresses,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId!, operations.id))
    .where(isNull(targets.deletedAt));

  // Also load registry-linked targets (via operation_target_links)
  const linkedTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      targetType: targets.targetType,
      surname: targets.surname,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
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

  // Merge: for each target, prefer linked operation rows; fall back to direct row
  const seenTargetOpPairs = new Set<string>();
  const targetRows: Array<{
    targetId: number;
    targetName: string;
    targetType: TargetType;
    surname: string | null;
    tgt: string | null;
    hb: string | null;
    v1: string | null;
    v2: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    extraVehicles: string | null;
    extraAddresses: string | null;
    operationId: number | null;
    operationName: string | null;
  }> = [];

  for (const row of linkedTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    seenTargetOpPairs.add(pairKey);
    targetRows.push(row);
  }
  for (const row of directTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    if (!seenTargetOpPairs.has(pairKey)) {
      targetRows.push(row);
    }
  }

  // Find sheets linked to each target (exclude soft-deleted sheets)
  const sheetsByTarget = await db
    .select({
      targetId: runningSheets.targetId,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
    })
    .from(runningSheets)
    .where(
      and(isNotNull(runningSheets.targetId), isNull(runningSheets.deletedAt))
    );

  const targetSheetMap = new Map<
    number,
    Array<{ sheetId: number; sheetTitle: string }>
  >();
  for (const s of sheetsByTarget) {
    if (s.targetId === null) continue;
    if (!targetSheetMap.has(s.targetId)) targetSheetMap.set(s.targetId, []);
    targetSheetMap
      .get(s.targetId)!
      .push({ sheetId: s.sheetId, sheetTitle: s.sheetTitle });
  }

  // Build a set of TGT aliases so we can suppress them from observation-derived persons
  // Maps tgtAlias (uppercased) -> canonical full name
  const tgtAliasToFullName = new Map<string, string>();
  for (const t of targetRows) {
    if (t.tgt && t.tgt.trim()) {
      tgtAliasToFullName.set(t.tgt.trim().toUpperCase(), t.targetName);
    }
  }
  // Same idea for registry associates: maps their bracket surname (e.g.
  // "P.HILL") to the associate's own entity key, so a bare mention of that
  // bracket elsewhere in observation text redirects into this associate's
  // entity instead of spawning a lookalike duplicate.
  const associateAliasToKey = new Map<string, string>();
  // Every registered person (targets and associates) under their surname
  // alias, so a mention that is exactly a *different* registered person with
  // the target's surname ("Hana PARK" vs the target "Soo-Min Hana PARK") is
  // never folded into the target.
  const registeredNamesByAlias = new Map<string, string[]>();
  const noteRegisteredName = (
    alias: string | null | undefined,
    name: string
  ) => {
    const k = (alias ?? "").trim().toUpperCase();
    if (!k || !name) return;
    const list = registeredNamesByAlias.get(k) ?? [];
    list.push(name);
    registeredNamesByAlias.set(k, list);
  };
  for (const t of targetRows) noteRegisteredName(t.tgt, t.targetName);

  const entityMap = new Map<string, IntelligenceEntity>();

  // A person Target's own name, as an ordinary person key, → its target entity.
  // A confirmed merge ("Yes, same person" on the duplicate prompt, or Merge
  // Entities) names the target's NAME as the winner, so mentions redirected
  // through it must land on the target entity itself — not on a second
  // person entity that happens to carry the same name. (The surname-alias
  // fold above can't do this on its own: it refuses a mention whose given
  // name differs, e.g. "Mikayla" vs "Mikala", which is exactly the case a
  // confirmed merge exists to settle.)
  const personTargetByKey = new Map<string, string>();
  for (const t of targetRows) {
    if (t.targetType && t.targetType !== "person") continue;
    personTargetByKey.set(
      `person::${normalizeEntityLabel(t.targetName)}`,
      `target::${t.targetName}`
    );
  }

  // A Vehicle/Location target stands in for the ordinary vehicle/address
  // entity its sightings would otherwise create (see subjectTargetEntityKey).
  // Mentions are folded into the target below, so every target entity has to
  // exist before any mention, registry field or text row is registered.
  const subjectTargetByKey = new Map<string, string>();
  for (const t of targetRows) {
    const subjectKey = subjectTargetEntityKey(t.targetType, t.targetName);
    if (!subjectKey) continue;
    subjectTargetByKey.set(subjectKey, `target::${t.targetName}`);
    const nameKey = `target::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, {
        shortForm: t.targetName,
        type: t.targetType === "vehicle" ? "vehicle" : "address",
        isTarget: true,
        tgtAlias: t.tgt?.trim() || null,
        targetId: t.targetId,
        surname: t.surname,
        occurrences: [],
      });
    }
  }

  // ── 2. Add formal target cards as person entities (isTarget = true) ────────
  for (const t of targetRows) {
    const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
    const sheetEntries =
      linkedSheets.length > 0
        ? linkedSheets
        : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];

    // Target entity — keyed by full name, carries tgtAlias. type follows
    // targetType: "person" (the only option before targetType existed) for
    // a Person target, or "vehicle"/"address" when a Vehicle or Location
    // stands in as the subject itself — see the Golden Rule/CLAUDE.md's
    // Target Type note. "location" maps to "address" here since that's
    // IntelligenceEntity's own type name for the same concept.
    const entityType: IntelligenceEntity["type"] =
      t.targetType === "vehicle"
        ? "vehicle"
        : t.targetType === "location"
          ? "address"
          : "person";
    const nameKey = `target::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, {
        shortForm: t.targetName,
        type: entityType,
        isTarget: true,
        tgtAlias: t.tgt?.trim() || null,
        targetId: t.targetId,
        surname: t.surname,
        occurrences: [],
      });
    }
    for (const sheet of sheetEntries) {
      entityMap.get(nameKey)!.occurrences.push({
        sheetId: sheet.sheetId,
        sheetTitle: sheet.sheetTitle,
        operationId: t.operationId ?? 0,
        operationName: t.operationName ?? "(Registry)",
        rowId: 0,
        observationSnippet: `Target card — ${t.targetName}${t.tgt ? ` (TGT: ${t.tgt})` : ""}`,
        timeMinutes: null,
        fullDescription: `Target: ${t.targetName}${t.tgt ? `, TGT: ${t.tgt}` : ""} (operation: ${t.operationName ?? "Registry"})`,
      });
    }

    // Location fields from target card: HBF/HB (address), V1F/V1/V2F/V2 (vehicle)
    // For each full/abbreviated pair, only register the full version if it is set;
    // the abbreviated version is only used as a fallback when the full field is empty.
    // This prevents HBF + HB (or V1F + V1) from appearing as two separate entities.
    // HBF is skipped entirely for a Location target and V1F for a Vehicle
    // target — for those, the field IS the primary card entity keyed above
    // (target::${t.targetName}), not a secondary attribute of it, so
    // registering it again here under its own vehicle::/address:: key would
    // just duplicate the same card as a second, identical-looking entity.
    const locationFields: Array<{
      label: string;
      value: string | null;
      type: IntelligenceEntity["type"];
    }> = [
      ...(t.targetType === "location"
        ? []
        : [
            {
              label: "HBF",
              value: t.hbf?.trim() || t.hb?.trim() || null,
              type: "address" as const,
            },
          ]),
      ...(t.targetType === "vehicle"
        ? []
        : [
            {
              label: "V1F",
              value: t.v1f?.trim() || t.v1?.trim() || null,
              type: "vehicle" as const,
            },
          ]),
      {
        label: "V2F",
        value: t.v2f?.trim() || t.v2?.trim() || null,
        type: "vehicle",
      },
    ];
    // Also include extra vehicles (V2, V3, V4 ...) stored as JSON array {full, short}
    if (t.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          t.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const vehicleLabel = `V${idx + 2}F`; // V2F, V3F, V4F ...
          const vehicleValue = ev.full?.trim() || ev.short?.trim() || null;
          if (vehicleValue) {
            locationFields.push({
              label: vehicleLabel,
              value: vehicleValue,
              type: "vehicle",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    // Also include extra addresses beyond HBF, stored as JSON array
    // {full, short, label?, businessName?, ...structured parts} — same
    // treatment as the associate block below (assocLocationFields).
    if (t.extraAddresses) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          t.extraAddresses
        );
        extras.forEach((ea, idx) => {
          const addrValue = ea.full?.trim() || ea.short?.trim() || null;
          if (addrValue) {
            locationFields.push({
              label: `Address ${idx + 2}`,
              value: addrValue,
              type: "address",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    for (const field of locationFields) {
      if (!field.value || field.value.trim() === "") continue;
      let shortForm = field.value.trim();
      // For vehicles: strip the RS bracket suffix "(Vehicle REGO)" or "(REGO)" appended
      // by the HBF autocomplete / addressFormat so the entity key matches the observation-
      // derived key (which never includes the bracket code in the shortForm).
      if (field.type === "vehicle") {
        shortForm = shortForm.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
        // Registry vehicle fields are stored exactly as typed — often
        // "<description>, bearing WA registration <REGO>", never reordered
        // into the Intelligence "REGO description" display form the way an
        // RS-mined mention already is (see the type==="vehicle" branch in
        // extractEntitiesFromText). Left unformatted, this raw text's own
        // unstripped "bearing WA registration" boilerplate inflated its
        // apparent descriptive length enough to always win the "prefer
        // longer" merge below against a properly-formatted RS mention of
        // the same rego, overwriting a clean "1CWY970 silver Hyundai Getz"
        // with the raw "silver Hyundai Getz, bearing WA registration
        // 1CWY970". Reformat first so both candidates are compared, and
        // ultimately displayed, on the same footing.
        shortForm = formatIntelVehicle(shortForm);
      }
      if (!shortForm) continue;
      // Normalise whitespace so minor spacing differences don't create duplicate keys.
      // Vehicles key on registration alone (see vehicleRegoKey above); addresses
      // key on the HBF's own trailing bracket short form (see addressBracketKey
      // above) so a registry HBF and a text-mined mention of the same address
      // collapse into one entity instead of two.
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : field.type === "address"
            ? addressBracketKey(shortForm)
            : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const fieldKey = `${field.type}::${normKey}`;
      // A registry vehicle/address that is itself a Vehicle/Location target
      // is that target's own entity, not a second one.
      const subjectTarget = subjectTargetByKey.get(fieldKey);
      const folded = !!subjectTarget && entityMap.has(subjectTarget);
      const key = folded ? subjectTarget! : fieldKey;
      // Same problem the vehicle branch above solves, now for addresses: a
      // registry address field is stored exactly as typed, still carrying its
      // state suffix and its own trailing bracket code. Unformatted it is
      // always the longest candidate, so it won the "prefer longer" merge
      // below and became the display label everywhere — Home Presence read
      // "101 Eric Street, COTTESLOE WA (101 Eric Street)", bracket and all,
      // while every text-mined address rendered cleanly.
      //
      // Deliberately applied AFTER normKey is computed above: addresses key
      // on the raw value's trailing bracket, so formatting first would change
      // the key and re-partition existing entities. Display only.
      if (field.type === "address") shortForm = formatIntelAddress(shortForm);
      if (folded) {
        // The target keeps its own name; only the occurrence is added below.
      } else if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      } else {
        // Prefer the longer / richer shortForm
        const existing = entityMap.get(key)!;
        const shouldUpgrade =
          field.type === "vehicle"
            ? preferVehicleShortForm(existing.shortForm, shortForm, normKey)
            : shortForm.length > existing.shortForm.length;
        if (shouldUpgrade) existing.shortForm = shortForm;
      }
      for (const sheet of sheetEntries) {
        // Deduplicate occurrences by sheetId+rowId (rowId=0 for target card entries)
        const occKey = `${sheet.sheetId}::0::${field.label}`;
        const alreadyAdded = entityMap
          .get(key)!
          .occurrences.some(
            o =>
              o.sheetId === sheet.sheetId &&
              o.rowId === 0 &&
              o.observationSnippet ===
                `Target card — ${t.targetName} [${field.label}]`
          );
        if (!alreadyAdded) {
          entityMap.get(key)!.occurrences.push({
            sheetId: sheet.sheetId,
            sheetTitle: sheet.sheetTitle,
            operationId: t.operationId ?? 0,
            operationName: t.operationName ?? "(Registry)",
            rowId: 0,
            observationSnippet: `Target card — ${t.targetName} [${field.label}]`,
            timeMinutes: null,
            fullDescription: `${field.label}: ${shortForm} (from target: ${t.targetName}, operation: ${t.operationName ?? "Registry"})`,
          });
        }
        void occKey; // suppress unused variable warning
      }
    }
  }

  // ── 2b. Add registry associates as person entities (isAssociate = true) ────
  // Mirrors the target-card block above: an associate recorded on a target in
  // the Target Registry is a confirmed intelligence entity in its own right —
  // it must show up in the Associates tab (and its address/vehicle in
  // Locations/Vehicles) even if it has never been mentioned in observation
  // text yet, same as a target card.
  const targetRowsByTargetId = new Map<number, typeof targetRows>();
  for (const t of targetRows) {
    if (!targetRowsByTargetId.has(t.targetId))
      targetRowsByTargetId.set(t.targetId, []);
    targetRowsByTargetId.get(t.targetId)!.push(t);
  }

  const associateRows = await db
    .select({
      id: associates.id,
      targetId: associates.targetId,
      name: associates.name,
      surname: associates.surname,
      tgt: associates.tgt,
      hbf: associates.hbf,
      hb: associates.hb,
      v1f: associates.v1f,
      v1: associates.v1,
      extraVehicles: associates.extraVehicles,
      extraAddresses: associates.extraAddresses,
    })
    .from(associates)
    .where(isNull(associates.deletedAt));

  for (const a of associateRows) {
    const parentRows = targetRowsByTargetId.get(a.targetId) ?? [];
    // An associate whose parent target no longer exists (e.g. the target
    // was purged but this associate row wasn't cascade-deleted with it —
    // see deleteTarget()) is orphaned data, not a live intelligence entity.
    // Skip it entirely rather than synthesizing a phantom "(Registry)"
    // occurrence for its address/vehicle fields below, which used to leave
    // permanent zombie INDICES-badged entities behind after a full delete.
    if (parentRows.length === 0) continue;
    const parentName = parentRows[0]?.targetName ?? null;
    const assocKey = `associate::${a.id}`;

    if (a.tgt && a.tgt.trim()) {
      associateAliasToKey.set(a.tgt.trim().toUpperCase(), assocKey);
    }
    noteRegisteredName(a.tgt, a.name);

    if (!entityMap.has(assocKey)) {
      entityMap.set(assocKey, {
        shortForm: a.name,
        type: "person",
        isAssociate: true,
        associateId: a.id,
        associateOfTargetId: a.targetId,
        associateOfTargetName: parentName,
        surname: a.surname,
        occurrences: [],
      });
    }

    // Occurrences piggyback on the parent target's linked sheets (or a
    // "(no sheet linked)" placeholder), same pattern as the target card.
    for (const t of parentRows) {
      const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
      const sheetEntries =
        linkedSheets.length > 0
          ? linkedSheets
          : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];
      for (const sheet of sheetEntries) {
        entityMap.get(assocKey)!.occurrences.push({
          sheetId: sheet.sheetId,
          sheetTitle: sheet.sheetTitle,
          operationId: t.operationId ?? 0,
          operationName: t.operationName ?? "(Registry)",
          rowId: 0,
          observationSnippet: `Associate card — ${a.name} (associate of ${parentName ?? "target"})`,
          timeMinutes: null,
          fullDescription: `Associate: ${a.name}${a.tgt ? `, TGT: ${a.tgt}` : ""} (of target: ${parentName ?? "unknown"}, operation: ${t.operationName ?? "Registry"})`,
        });
      }
    }

    // Address/vehicle fields, same field-registration logic as target cards.
    const assocLocationFields: Array<{
      label: string;
      value: string | null;
      type: IntelligenceEntity["type"];
    }> = [
      {
        label: "HBF",
        value: a.hbf?.trim() || a.hb?.trim() || null,
        type: "address",
      },
      {
        label: "V1F",
        value: a.v1f?.trim() || a.v1?.trim() || null,
        type: "vehicle",
      },
    ];
    if (a.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          a.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const vehicleValue = ev.full?.trim() || ev.short?.trim() || null;
          if (vehicleValue) {
            assocLocationFields.push({
              label: `V${idx + 2}F`,
              value: vehicleValue,
              type: "vehicle",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    if (a.extraAddresses) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          a.extraAddresses
        );
        extras.forEach((ea, idx) => {
          const addrValue = ea.full?.trim() || ea.short?.trim() || null;
          if (addrValue) {
            assocLocationFields.push({
              label: `Address ${idx + 2}`,
              value: addrValue,
              type: "address",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }

    for (const field of assocLocationFields) {
      if (!field.value || field.value.trim() === "") continue;
      let shortForm = field.value.trim();
      if (field.type === "vehicle") {
        shortForm = shortForm.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
        // See the matching comment on the target locationFields loop above —
        // reformat to "REGO description" before this competes in the
        // "prefer longer" merge, or its own unstripped boilerplate can beat
        // and overwrite a clean RS-mined mention of the same vehicle.
        shortForm = formatIntelVehicle(shortForm);
      }
      if (!shortForm) continue;
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : field.type === "address"
            ? addressBracketKey(shortForm)
            : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const fieldKey = `${field.type}::${normKey}`;
      // See the matching comment on the target locationFields loop above — a
      // registry vehicle/address that is a Vehicle/Location target is that
      // target's own entity.
      const subjectTarget = subjectTargetByKey.get(fieldKey);
      const folded = !!subjectTarget && entityMap.has(subjectTarget);
      const key = folded ? subjectTarget! : fieldKey;
      // See the matching comment on the target locationFields loop above —
      // tidy the registry address for display, after the key is computed
      // from the raw value so entity keying is unaffected.
      if (field.type === "address") shortForm = formatIntelAddress(shortForm);
      if (folded) {
        // The target keeps its own name; only the occurrence is added below.
      } else if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      } else {
        const existing = entityMap.get(key)!;
        const shouldUpgrade =
          field.type === "vehicle"
            ? preferVehicleShortForm(existing.shortForm, shortForm, normKey)
            : shortForm.length > existing.shortForm.length;
        if (shouldUpgrade) existing.shortForm = shortForm;
      }
      for (const t of parentRows) {
        const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
        const sheetEntries =
          linkedSheets.length > 0
            ? linkedSheets
            : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];
        for (const sheet of sheetEntries) {
          const alreadyAdded = entityMap
            .get(key)!
            .occurrences.some(
              o =>
                o.sheetId === sheet.sheetId &&
                o.rowId === 0 &&
                o.observationSnippet ===
                  `Associate card — ${a.name} [${field.label}]`
            );
          if (!alreadyAdded) {
            entityMap.get(key)!.occurrences.push({
              sheetId: sheet.sheetId,
              sheetTitle: sheet.sheetTitle,
              operationId: t.operationId ?? 0,
              operationName: t.operationName ?? "(Registry)",
              rowId: 0,
              observationSnippet: `Associate card — ${a.name} [${field.label}]`,
              timeMinutes: null,
              fullDescription: `${field.label}: ${shortForm} (from associate: ${a.name}, of target: ${parentName ?? "unknown"})`,
            });
          }
        }
      }
    }
  }

  // ── 3. Extract from observation rows ──────────────────────────────────────
  //
  // Two-pass approach:
  //   Pass A: for each sheet, scan all rows in time order and collect every
  //           bracketed introduction "FullForm (ShortForm)" into a per-sheet
  //           entity dictionary.  This is the "first mention" that establishes
  //           the entity's type and canonical full description.
  //   Pass B: re-scan every row in the sheet and, for each known short form
  //           that appears as a standalone token (unbracketed), emit an
  //           occurrence using the registered full description and type.
  //           This handles all subsequent mentions that omit the brackets.
  //
  const rows = await db
    .select({
      rowId: sheetRows.id,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      operationId: runningSheets.operationId,
      operationName: operations.name,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .innerJoin(operations, eq(runningSheets.operationId, operations.id))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes);

  // Group rows by sheetId so we can do the two-pass per sheet
  const rowsBySheet = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!rowsBySheet.has(row.sheetId)) rowsBySheet.set(row.sheetId, []);
    rowsBySheet.get(row.sheetId)!.push(row);
  }

  // A person entity mined from observation text has its own raw, unbracketed
  // shortForm ("Timothy HOLMES") used as a literal search/matching key all
  // through the two-pass scan below and extractEntitiesFromText's many other
  // callers — changing that key's shape is out of scope here and risks
  // degrading bare-re-mention matching in later rows. This instead only
  // dresses up the DISPLAY shortForm actually stored on the final
  // IntelligenceEntity (what LinkAttachmentDialog hands the photo linker as
  // entityLabel), so a mined associate matches the same "Name SURNAME
  // (SURNAME)" convention a registry Target/Associate card gets from
  // composeTargetName/composeAssociateName — which is what LinkedEntityPills'
  // Profile pill actually keys off. No-ops (idempotent) when it's not a
  // person, already ends in a bracket, or the last word isn't a clean
  // all-caps surname to begin with.
  function withSurnameBracket(shortForm: string, type: string): string {
    if (type !== "person") return shortForm;
    if (/\([^()]+\)\s*$/.test(shortForm)) return shortForm;
    const words = shortForm.trim().split(/\s+/);
    const last = words[words.length - 1] ?? "";
    return /^[A-Z][A-Z'-]{1,40}$/.test(last)
      ? `${shortForm} (${last})`
      : shortForm;
  }

  // Helper: register or merge an entity occurrence into entityMap
  function registerOccurrence(
    e: {
      shortForm: string;
      rawShortForm?: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
      confidence?: "high" | "medium" | "low";
    },
    row: {
      sheetId: number;
      sheetTitle: string;
      operationId: number;
      operationName: string;
      rowId: number;
      observation: string | null;
      timeMinutes: number | null;
    }
  ) {
    if (!row.observation) return;
    // If this person shortForm (or its raw bracketed token) is a known TGT alias,
    // merge into the canonical target entity.
    // We must check BOTH because name-recovery may expand "HOTA" → "G HOTA",
    // but the tgtAliasToFullName map is keyed by the raw alias ("HOTA").
    if (e.type === "person") {
      // A bracket alias is only a SURNAME — "Lawrence TAN (TAN)" must not be
      // folded into the registered "Grace Olivia TAN (TAN)" just because the
      // surname matches. The redirect below only happens when the mention's
      // given names don't contradict the registered person's (a bare alias,
      // an initial, or a shortened name all still match).
      const aliasUsedForTarget = tgtAliasToFullName.has(
        e.shortForm.toUpperCase()
      )
        ? e.shortForm
        : (e.rawShortForm ?? e.shortForm);
      let canonicalName =
        tgtAliasToFullName.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm
          ? tgtAliasToFullName.get(e.rawShortForm.toUpperCase())
          : undefined);
      if (
        canonicalName &&
        !aliasMentionCompatible(e.shortForm, aliasUsedForTarget, canonicalName)
      ) {
        canonicalName = undefined;
      }
      // "Hana PARK" is a different registered person from the target
      // "Soo-Min Hana PARK" even though the given name fits — see
      // mentionIsOtherRegisteredPerson.
      if (
        canonicalName &&
        mentionIsOtherRegisteredPerson(
          e.shortForm,
          aliasUsedForTarget,
          canonicalName,
          (
            registeredNamesByAlias.get(aliasUsedForTarget.toUpperCase()) ?? []
          ).filter(n => n !== canonicalName)
        )
      ) {
        canonicalName = undefined;
      }
      if (canonicalName) {
        const targetKey = `target::${canonicalName}`;
        if (entityMap.has(targetKey)) {
          const snippet =
            row.observation.slice(0, 80) +
            (row.observation.length > 80 ? "…" : "");
          entityMap.get(targetKey)!.occurrences.push({
            sheetId: row.sheetId,
            sheetTitle: row.sheetTitle,
            operationId: row.operationId,
            operationName: row.operationName,
            rowId: row.rowId,
            observationSnippet: snippet,
            timeMinutes: row.timeMinutes ?? null,
            fullDescription: e.fullDescription,
          });
          return; // skip adding as a separate entity
        }
      }
      // Same idea, but for a registry associate's bracket surname (e.g. "P.HILL").
      const aliasUsedForAssoc = associateAliasToKey.has(
        e.shortForm.toUpperCase()
      )
        ? e.shortForm
        : (e.rawShortForm ?? e.shortForm);
      const canonicalAssocKey =
        associateAliasToKey.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm
          ? associateAliasToKey.get(e.rawShortForm.toUpperCase())
          : undefined);
      if (
        canonicalAssocKey &&
        entityMap.has(canonicalAssocKey) &&
        aliasMentionCompatible(
          e.shortForm,
          aliasUsedForAssoc,
          entityMap.get(canonicalAssocKey)!.shortForm
        )
      ) {
        const snippet =
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : "");
        entityMap.get(canonicalAssocKey)!.occurrences.push({
          sheetId: row.sheetId,
          sheetTitle: row.sheetTitle,
          operationId: row.operationId,
          operationName: row.operationName,
          rowId: row.rowId,
          observationSnippet: snippet,
          timeMinutes: row.timeMinutes ?? null,
          fullDescription: e.fullDescription,
        });
        return; // skip adding as a separate entity
      }
    }
    // Vehicles key on registration alone (see vehicleRegoKey above) so a bare
    // rego, a chip-inserted "Vehicle REGO", and a fully-described sighting of
    // the same car all collapse into one entity instead of three.
    const normShortForm =
      e.type === "vehicle"
        ? vehicleRegoKey(e.shortForm)
        : e.shortForm.toLowerCase().replace(/\s+/g, " ").trim();
    let key = `${locationKeyType(e.type)}::${normShortForm}`;

    // Confirmed entity-alias merge (fuzzy-duplicate prompt "Yes", or the
    // manual Merge Entities tool) — redirect this occurrence to the winner
    // entity instead of creating/growing a separate one under the loser key.
    let displayShortForm = e.shortForm;
    const resolved = e.type !== "unknown" ? entityAliasMap.get(key) : undefined;
    if (resolved) {
      key = resolved.key;
      displayShortForm = resolved.label;
    }

    // A person redirected onto a Target's own name (a confirmed merge) IS that
    // Target — fold into the target entity, remembering the spelling used.
    const personTarget = personTargetByKey.get(key);
    if (personTarget && entityMap.has(personTarget)) {
      const targetEntity = entityMap.get(personTarget)!;
      if (
        normalizeEntityLabel(e.shortForm) !==
        normalizeEntityLabel(targetEntity.shortForm)
      ) {
        targetEntity.aliasLabels = targetEntity.aliasLabels ?? [];
        if (!targetEntity.aliasLabels.includes(e.shortForm))
          targetEntity.aliasLabels.push(e.shortForm);
      }
      targetEntity.occurrences.push({
        sheetId: row.sheetId,
        sheetTitle: row.sheetTitle,
        operationId: row.operationId,
        operationName: row.operationName,
        rowId: row.rowId,
        observationSnippet:
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : ""),
        timeMinutes: row.timeMinutes ?? null,
        fullDescription: e.fullDescription,
      });
      return;
    }

    // A sighting of a Vehicle/Location target belongs to that target, not to
    // a second ordinary entity for the same vehicle/place.
    const subjectTarget = subjectTargetByKey.get(key);
    if (subjectTarget && entityMap.has(subjectTarget)) {
      entityMap.get(subjectTarget)!.occurrences.push({
        sheetId: row.sheetId,
        sheetTitle: row.sheetTitle,
        operationId: row.operationId,
        operationName: row.operationName,
        rowId: row.rowId,
        observationSnippet:
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : ""),
        timeMinutes: row.timeMinutes ?? null,
        fullDescription: e.fullDescription,
      });
      return;
    }

    if (!entityMap.has(key)) {
      entityMap.set(key, {
        shortForm: withSurnameBracket(displayShortForm, e.type),
        type: e.type,
        isTarget: false,
        occurrences: [],
      });
    } else if (!resolved) {
      // Upgrade to longer / richer shortForm if available — skipped when this
      // occurrence was redirected via an alias, since the winner's label is
      // the confirmed canonical display form and shouldn't be overwritten by
      // whatever the loser's raw text happened to say.
      const existing = entityMap.get(key)!;
      // Prefer "address" over "business" once a mention with real street
      // detail shows up — address is strictly more informative and this is
      // the same real-world place (see locationKeyType above).
      if (existing.type === "business" && e.type === "address") {
        existing.type = "address";
      }
      // Compared/assigned bracketed, not raw — existing.shortForm was
      // already bracketed at creation above, so comparing raw e.shortForm's
      // length against it here would unfairly favour existing every time.
      const candidateShortForm = withSurnameBracket(e.shortForm, e.type);
      const shouldUpgrade =
        e.type === "vehicle"
          ? preferVehicleShortForm(
              existing.shortForm,
              e.shortForm,
              normShortForm
            )
          : candidateShortForm.length > existing.shortForm.length;
      if (shouldUpgrade) existing.shortForm = candidateShortForm;
    }
    if (
      resolved &&
      e.shortForm.toLowerCase().trim() !== displayShortForm.toLowerCase().trim()
    ) {
      const winner = entityMap.get(key)!;
      winner.aliasLabels = winner.aliasLabels ?? [];
      if (!winner.aliasLabels.includes(e.shortForm))
        winner.aliasLabels.push(e.shortForm);
    }
    // Flag entity as low-confidence if this occurrence was uncertain
    if (e.confidence === "low" || e.type === "unknown") {
      entityMap.get(key)!.lowConfidence = true;
    }
    const snippet =
      row.observation.slice(0, 80) + (row.observation.length > 80 ? "…" : "");
    entityMap.get(key)!.occurrences.push({
      sheetId: row.sheetId,
      sheetTitle: row.sheetTitle,
      operationId: row.operationId,
      operationName: row.operationName,
      rowId: row.rowId,
      observationSnippet: snippet,
      timeMinutes: row.timeMinutes ?? null,
      fullDescription: e.fullDescription,
    });
  }

  for (const [, sheetRows_] of Array.from(rowsBySheet.entries())) {
    // ── Pass A: build per-sheet entity dictionary from bracketed introductions ──
    // Dictionary key: shortForm.toLowerCase() AND rawShortForm.toLowerCase() (both point to same entry)
    // This is critical: name-recovery may change "HOTA" → "G HOTA", so we must register
    // BOTH keys so that Pass B can find "HOTA" in subsequent rows even though the
    // display name is "G HOTA".
    type DictEntry = {
      shortForm: string;
      rawShortForm: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
    };
    const sheetDict = new Map<string, DictEntry>();

    // Keys pre-seeded from the target registry (see below) → that target's
    // full name. A person introduced in this sheet's own text under the same
    // surname alias but with a different given name is someone else, and the
    // sheet's own introduction wins for bare mentions on this sheet.
    const preseededAliasName = new Map<string, string>();
    // The same registered name, looked up by the dictionary entry itself
    // (Pass B below needs it when it scans text for the alias).
    const preseededEntryName = new WeakMap<DictEntry, string>();
    // Surname aliases this sheet uses for TWO different people ("Grace TAN
    // (TAN)" and "Lawrence TAN (TAN)"). A bare "TAN" on such a sheet can't be
    // attributed to either, so Pass B doesn't search for the bare alias — each
    // person is still found by their full name — and Check Sheet flags it.
    const ambiguousAliasKeys = new Set<string>();
    const registerDictEntry = (key: string, entry: DictEntry) => {
      const preseedName = preseededAliasName.get(key);
      if (
        preseedName !== undefined &&
        entry.type === "person" &&
        !aliasMentionCompatible(
          entry.shortForm,
          entry.rawShortForm,
          preseedName
        )
      ) {
        sheetDict.set(key, entry);
        preseededAliasName.delete(key);
        return;
      }
      if (!sheetDict.has(key)) {
        sheetDict.set(key, entry);
      } else {
        const existing = sheetDict.get(key)!;
        // Same surname bracket, different given names → two different
        // people. Never fold one into the other (that would rewrite the
        // first person's entry as the second).
        if (
          entry.type === "person" &&
          existing.type === "person" &&
          existing !== entry &&
          key === entry.rawShortForm.toLowerCase() &&
          !aliasMentionCompatible(
            entry.shortForm,
            entry.rawShortForm,
            existing.shortForm
          )
        ) {
          ambiguousAliasKeys.add(key);
          return;
        }
        // Upgrade to longer shortForm if available
        if (entry.shortForm.length > existing.shortForm.length) {
          existing.shortForm = entry.shortForm;
          existing.fullDescription = entry.fullDescription;
        }
      }
    };

    // ── Pre-seed sheetDict with ALL target aliases from the target registry ──
    // Operators often write the target alias (e.g. "JAMES", "SMITH") from the very
    // first row without ever bracketing it, because the target card IS the introduction.
    // Without pre-seeding, Pass B would never find these tokens.
    // We register each alias under its lowercase key so Pass B can match it in any row.
    for (const [alias, canonicalName] of Array.from(
      tgtAliasToFullName.entries()
    )) {
      const aliasKey = alias.toLowerCase();
      if (!sheetDict.has(aliasKey)) {
        const seeded: DictEntry = {
          shortForm: canonicalName, // display as full canonical name
          rawShortForm: alias, // raw alias is the search token
          fullDescription: `Target: ${canonicalName}`,
          type: "person",
        };
        sheetDict.set(aliasKey, seeded);
        preseededAliasName.set(aliasKey, canonicalName);
        preseededEntryName.set(seeded, canonicalName);
      }
    }

    for (const row of sheetRows_) {
      if (!row.observation) continue;
      const bracketed = extractEntitiesFromText(row.observation);
      for (const e of bracketed) {
        const entry: DictEntry = {
          shortForm: e.shortForm,
          rawShortForm: e.rawShortForm,
          fullDescription: e.fullDescription,
          type: e.type,
        };
        // Register by displayName key (e.g. "g hota")
        registerDictEntry(e.shortForm.toLowerCase(), entry);
        // Also register by raw bracketed token key (e.g. "hota") if different
        // This ensures Pass B can find "HOTA" in subsequent rows even though
        // the display name is "G HOTA".
        if (e.rawShortForm.toLowerCase() !== e.shortForm.toLowerCase()) {
          registerDictEntry(e.rawShortForm.toLowerCase(), entry);
        }
      }
    }

    // ── Pass B: scan every row for both bracketed AND unbracketed occurrences ──
    // Build a sorted list of known short forms (longest first to avoid partial matches)
    const knownEntries = Array.from(sheetDict.values()).sort(
      (a, b) => b.shortForm.length - a.shortForm.length
    );

    for (const row of sheetRows_) {
      if (!row.observation) continue;

      // First, register all bracketed entities in this row (as before)
      const bracketed = extractEntitiesFromText(row.observation);
      // Track both displayName and rawShortForm so we don't double-count
      // e.g. "G HOTA" (displayName) and "HOTA" (rawShortForm) are the same entity
      const bracketedShortForms = new Set<string>();
      for (const e of bracketed) {
        bracketedShortForms.add(e.shortForm.toLowerCase());
        bracketedShortForms.add(e.rawShortForm.toLowerCase());
      }
      for (const e of bracketed) {
        registerOccurrence(e, row);
      }

      // Then, scan for unbracketed occurrences of known short forms.
      //
      // Correct approach: work on the ORIGINAL observation text but track only
      // the paren content ranges "(ShortForm)" — i.e. the brackets themselves.
      // A short-form match is considered "inside a bracket" only if it falls
      // entirely within one of those paren ranges.  This correctly handles rows
      // like "Vehicle 1CZQ642 (1CZQ642) with G HOTA (HOTA) ..." where the same
      // token appears both unbracketed (the real entity) and inside parens
      // (the short-form label) — we want the unbracketed occurrence.
      //
      // Step 1: collect all paren-content ranges [start, end) in this row.
      //         We mark the entire "(ShortForm)" including the parens.
      const parenRanges: Array<[number, number]> = [];
      const parenPattern = /\([^()]{1,80}\)/g;
      let spanMatch: RegExpExecArray | null;
      while ((spanMatch = parenPattern.exec(row.observation)) !== null) {
        parenRanges.push([
          spanMatch.index,
          spanMatch.index + spanMatch[0].length,
        ]);
      }

      // Helper: returns true if the match at [start, end) is entirely inside a paren
      const isInsideParenContent = (start: number, end: number): boolean =>
        parenRanges.some(([s, e]) => start >= s && end <= e);

      // Deduplicate knownEntries so we don't emit two occurrences for the same entity
      // (sheetDict may have both "g hota" and "hota" pointing to the same DictEntry object)
      const seenEntryObjects = new Set<DictEntry>();

      for (const entry of knownEntries) {
        // Skip duplicates (same DictEntry registered under multiple keys)
        if (seenEntryObjects.has(entry)) continue;
        seenEntryObjects.add(entry);

        // Skip if this entity was already captured as a bracketed entity in this row
        // (check both displayName and rawShortForm)
        if (bracketedShortForms.has(entry.shortForm.toLowerCase())) continue;
        if (bracketedShortForms.has(entry.rawShortForm.toLowerCase())) continue;

        // For person, address, and business entities, search by BOTH the
        // enriched displayName ("G HOTA" / "54 Terrace Road, PERTH") AND the
        // raw bracketed token ("HOTA" / "54 Terrace Road") — subsequent rows
        // routinely use the short form (e.g. re-visits that don't repeat the
        // suburb every time: "returned to 54 Terrace Road"), and searching
        // only the full enriched form would miss those, undercounting visits.
        const searchTerms: string[] = [entry.shortForm];
        const aliasIsAmbiguous =
          entry.type === "person" &&
          ambiguousAliasKeys.has(entry.rawShortForm.toLowerCase());
        if (
          !aliasIsAmbiguous &&
          (entry.type === "person" ||
            entry.type === "address" ||
            entry.type === "business" ||
            entry.type === "vehicle") &&
          entry.rawShortForm !== entry.shortForm
        ) {
          searchTerms.push(entry.rawShortForm);
        }
        // A vehicle is identified by its registration, and later rows refer
        // back to it however the officer typed it that day — "Vehicle
        // 1FAD093", "in 1FAD093", or the bare plate. Searching the plate
        // itself catches all of those. Without it the only term searched is
        // the enriched display form ("1FAD093 red Mercedes SUV"), which this
        // pipeline assembles and which therefore never appears verbatim in a
        // later row — so every bare vehicle re-mention went uncounted, and a
        // vehicle never co-occurred with the target driving it.
        if (entry.type === "vehicle") {
          const rego = vehicleRegoKey(entry.shortForm);
          const alreadySearched = searchTerms.some(
            t => t.toLowerCase() === rego
          );
          if (
            rego &&
            rego !== entry.shortForm.toLowerCase() &&
            !alreadySearched
          ) {
            searchTerms.push(rego);
          }
        }

        let found = false;
        for (const term of searchTerms) {
          if (found) break;
          // Build a word-boundary regex for the search term.
          // For vehicle registrations (e.g. "1CZQ642") use lookahead/lookbehind for
          // non-alphanumeric boundaries; for alphabetic terms use \b.
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const wordBoundary = /^[A-Za-z]/.test(term)
            ? `\\b${escaped}\\b`
            : `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
          // An all-caps surname alias ("PARK") only counts when written in
          // capitals — see aliasSearchFlags.
          const re = new RegExp(
            wordBoundary,
            entry.type === "person" ? aliasSearchFlags(term) : "gi"
          );

          let tokenMatch: RegExpExecArray | null;
          while ((tokenMatch = re.exec(row.observation)) !== null) {
            const mStart = tokenMatch.index;
            const mEnd = mStart + tokenMatch[0].length;
            // Only count this occurrence if it is NOT inside a paren
            if (!isInsideParenContent(mStart, mEnd)) {
              // A bare surname alias that follows a different given name
              // mid-sentence ("met Lawrence TAN") is someone else, not the
              // registered "Grace Olivia TAN". At the start of a sentence a
              // capitalised word is as likely to be ordinary text ("Then
              // TAN left"), so that case still counts as before.
              const registeredName = preseededEntryName.get(entry);
              if (registeredName && term === entry.rawShortForm) {
                const before = row.observation.slice(0, mStart);
                const prev = before.match(
                  /([^.!?\n]\s+)([A-Z][a-z]{2,}(?:[-'][A-Za-z]+)?)\s+$/
                );
                if (
                  prev &&
                  !aliasMentionCompatible(
                    `${prev[2]} ${term}`,
                    term,
                    registeredName
                  )
                ) {
                  continue;
                }
              }
              found = true;
              break;
            }
          }
        }

        if (found) {
          registerOccurrence(
            {
              shortForm: entry.shortForm,
              rawShortForm: entry.rawShortForm,
              fullDescription: entry.fullDescription,
              type: entry.type,
            },
            row
          );
        }
      }
    }
  }

  // ── 4. Post-process: merge address and vehicle entities where one shortForm is a
  //       strict prefix of another (e.g. "1 Smith Street" absorbed into
  //       "1 Smith Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux").
  //       See mergeContainedEntities above for the algorithm itself.
  // ─────────────────────────────────────────────────────────────────────────────

  // Separate target entities (keyed as target::) from non-target entities
  const nonTargetEntities = Array.from(entityMap.entries())
    .filter(([key]) => !key.startsWith("target::"))
    .map(([, entity]) => entity);

  const targetEntities = Array.from(entityMap.entries())
    .filter(([key]) => key.startsWith("target::"))
    .map(([, entity]) => entity);

  // Group non-target entities by type
  const byType = new Map<string, IntelligenceEntity[]>();
  for (const entity of nonTargetEntities) {
    const t = entity.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(entity);
  }

  const mergedMap = new Map<string, IntelligenceEntity>();

  for (const [entityType, group] of Array.from(byType.entries())) {
    // Only apply prefix-merge to addresses and vehicles
    if (entityType !== "address" && entityType !== "vehicle") {
      // For all other types, just add them as-is
      for (const entity of group) {
        const k = `${entity.type}::${entity.shortForm.toLowerCase().trim()}`;
        mergedMap.set(k, entity);
      }
      continue;
    }

    for (const survivor of mergeContainedEntities(group, entityType)) {
      const mergeKey = `${survivor.type}::${survivor.shortForm.toLowerCase().trim()}`;
      mergedMap.set(mergeKey, survivor);
    }
  }

  // Add target entities back — they were never in byType
  for (const entity of targetEntities) {
    const k = `target::${entity.shortForm}`;
    mergedMap.set(k, entity);
  }

  // ── Person Identity Links: mirror intelligence across a linked pair ────────
  // A Target card and a Registry Associate card can be confirmed as the same
  // real person (targets.linkedAssociateId / associates.linkedTargetId — see
  // "Person Identity Links" above updateTarget). Both records intentionally
  // stay as separate profiles (a Target and an Associate are different
  // roles), but neither one should be missing intelligence the other has —
  // so union their occurrences onto both entities, and mark each with a
  // pointer to its identical twin so the UI can flag it.
  const linkedPairRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      associateId: targets.linkedAssociateId,
    })
    .from(targets)
    .where(
      and(isNull(targets.deletedAt), isNotNull(targets.linkedAssociateId))
    );

  for (const pair of linkedPairRows) {
    if (!pair.associateId) continue;
    const targetEntity = mergedMap.get(`target::${pair.targetName}`);
    const associateEntity = Array.from(mergedMap.values()).find(
      e => e.isAssociate && e.associateId === pair.associateId
    );
    if (!targetEntity || !associateEntity) continue;

    const seen = new Set<string>();
    const combined: IntelligenceEntity["occurrences"] = [];
    for (const occ of [
      ...targetEntity.occurrences,
      ...associateEntity.occurrences,
    ]) {
      const dedupeKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      combined.push(occ);
    }
    targetEntity.occurrences = combined;
    associateEntity.occurrences = combined.slice();

    targetEntity.identicalProfile = {
      type: "associate",
      id: associateEntity.associateId!,
      label: associateEntity.shortForm,
    };
    associateEntity.identicalProfile = {
      type: "target",
      id: targetEntity.targetId!,
      label: targetEntity.shortForm,
    };

    // A registry field (V1F/HBF/etc.) shared by this linked pair produces
    // its own "Target card" occurrence from the target's own record AND a
    // separate "Associate card" occurrence from the associate's own record
    // on whatever vehicle/address entity that field's value keys into —
    // even though both describe the exact same real-world fact for the
    // exact same person (see updateTarget's Person Identity Link sync).
    // When neither side has any real operation touchpoint of its own, that
    // duplication is harmless — it's still just one true Indices-only fact.
    // But once EITHER side carries a real operation (e.g. the associate's
    // parent target is tasked to an operation while the linked target
    // itself is a bare registry entry), the other side's "(Registry)"
    // fallback occurrence for that same synced field is a redundant
    // restatement, not a second independent cross-operation touchpoint —
    // left in place it inflated e.g. a vehicle's "linked operations" with a
    // phantom "(Registry)" badge alongside the real one. combined (just
    // assigned above) already carries the union of both sides' own PERSON
    // occurrences, so it's the right place to check for real exposure.
    const identityHasRealOp = combined.some(o => o.operationId !== 0);
    if (identityHasRealOp) {
      const targetCardPrefix = `Target card — ${targetEntity.shortForm} [`;
      const associateCardPrefix = `Associate card — ${associateEntity.shortForm} [`;
      for (const entity of Array.from(mergedMap.values())) {
        if (entity.type !== "vehicle" && entity.type !== "address") continue;
        entity.occurrences = entity.occurrences.filter(o => {
          if (o.rowId !== 0 || o.operationId !== 0) return true;
          return (
            !o.observationSnippet.startsWith(targetCardPrefix) &&
            !o.observationSnippet.startsWith(associateCardPrefix)
          );
        });
      }
    }
  }

  // "Indices" flag — computed last, once every occurrence (registry-injected
  // and text-mined alike) has been assembled and merged above.
  const finalEntities = Array.from(mergedMap.values());
  for (const entity of finalEntities) {
    entity.isIndicesOnly =
      entity.occurrences.length > 0 &&
      entity.occurrences.every(o => o.rowId === 0);
  }

  return finalEntities;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface IncompleteSheetReport {
  sheetId: number;
  sheetTitle: string;
  operationId: number;
  operationName: string;
  operationStatus: string;
  /** Parsed sheetCins array */
  teamCins: {
    cin: string;
    isTeamLeader?: boolean;
    isAuthor?: boolean;
    isCertifier?: boolean;
  }[];
  /** Teams present on this sheet (derived from users table) */
  teams: string[];
  /** True when members span more than one distinct team */
  isTeamBlended: boolean;
  teamLeaderCin: string | null;
  authorCin: string | null;
  certifierCin: string | null;
  uncertifiedRowCount: number;
  govPercent: number;
  isClosed: boolean;
  createdAt: Date;
}

/**
 * The sheets the Reports page lists as incomplete, each with full status info
 * and team membership (from the users table, so the "Team Blended" logic can
 * be applied client-side). A non-deleted sheet is incomplete when it is not
 * closed, OR it has a row that is not signed off, OR its governance is under
 * 100%.
 *
 * Done in the database, not in memory: the unsigned-row count per sheet comes
 * from one aggregate query (indexed on row_members.rowId and
 * certifications.rowId/memberId), so only the sheets, their governance records
 * and a count per sheet are loaded — never every row, member and
 * certification ever recorded. The original loaded all of those into memory
 * and rescanned them for every sheet (30 s at one year of data, an error at
 * three); the answer is unchanged — scripts/dev/compare-incomplete-sheets.ts
 * proves it against a copy of the original. Row sign-off is the same rule as
 * isRowSignedOff (governance.ts): at least one real (non-"__SPACE__") member,
 * and every one of them has their OWN active certification.
 */
export async function getIncompleteRunningSheets(
  viewerCommand?: CommandCode | null
): Promise<IncompleteSheetReport[]> {
  const db = await getDb();
  if (!db) return [];

  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt))
    .orderBy(runningSheets.id);
  if (sheets.length === 0) return [];

  // A row is NOT signed off when it has no real member, or any real member
  // lacks an active certification of their own. (BINARY: the comparison with
  // "__SPACE__" is exact, like the JavaScript rule, not case-insensitive.)
  const realMember = and(
    eq(rowMembers.rowId, sheetRows.id),
    sql`BINARY ${rowMembers.memberName} <> '__SPACE__'`
  );
  const unsignedCounts = await db
    .select({
      sheetId: sheetRows.sheetId,
      unsigned: sql<number>`COUNT(*)`,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .where(
      and(
        isNull(runningSheets.deletedAt),
        or(
          notExists(
            db
              .select({ one: sql`1` })
              .from(rowMembers)
              .where(realMember)
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(rowMembers)
              .where(
                and(
                  realMember,
                  notExists(
                    db
                      .select({ one: sql`1` })
                      .from(certifications)
                      .where(
                        and(
                          eq(certifications.rowId, sheetRows.id),
                          eq(certifications.memberId, rowMembers.id),
                          eq(certifications.isActive, true)
                        )
                      )
                  )
                )
              )
          )
        )
      )
    )
    .groupBy(sheetRows.sheetId);
  const unsignedBySheet = new Map<number, number>(
    unsignedCounts.map(r => [r.sheetId, Number(r.unsigned)])
  );

  // Governance records of the live sheets (a join, not a giant IN list).
  const govRows = await db
    .select({ rec: governanceRecords })
    .from(governanceRecords)
    .innerJoin(runningSheets, eq(runningSheets.id, governanceRecords.sheetId))
    .where(isNull(runningSheets.deletedAt));
  const govBySheet = new Map(govRows.map(r => [r.rec.sheetId, r.rec]));

  // Which sheets are incomplete — decided without parsing anything else.
  const incompleteSheets = sheets.filter(sheet => {
    const uncertifiedRowCount = unsignedBySheet.get(sheet.id) ?? 0;
    const allSigned = uncertifiedRowCount === 0;
    const govPercent = computeGovernancePercent(
      govBySheet.get(sheet.id) ?? null,
      allSigned
    );
    return !sheet.closedAt || uncertifiedRowCount > 0 || govPercent < 100;
  });
  if (incompleteSheets.length === 0) return [];

  const opIds = Array.from(new Set(incompleteSheets.map(s => s.operationId)));
  const [ops, allUsers] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    db
      .select({ id: users.id, cin: users.cin, teamId: users.teamId })
      .from(users),
  ]);
  const opById = new Map(ops.map(o => [o.id, o]));

  // Build CIN → team name map from users table
  const teamNames = await teamNameMap();
  const cinTeamMap = new Map<string, string>();
  // A visitor hosted by the viewer's Command counts in that Command's team.
  const visitorTeams = await visitorTeamMap(viewerCommand);
  for (const u of allUsers) {
    const teamId = visitorTeams.get(u.id) ?? u.teamId;
    const name = teamId != null ? teamNames.get(teamId) : undefined;
    if (u.cin && name) cinTeamMap.set(u.cin, name);
  }

  const results: IncompleteSheetReport[] = [];
  for (const sheet of incompleteSheets) {
    const op = opById.get(sheet.operationId);
    if (!op) continue;

    // Parse sheetCins
    let teamCins: {
      cin: string;
      isTeamLeader?: boolean;
      isAuthor?: boolean;
      isCertifier?: boolean;
    }[] = [];
    try {
      teamCins = JSON.parse(sheet.sheetCins ?? "[]");
    } catch {
      teamCins = [];
    }

    const teamLeaderCin = teamCins.find(c => c.isTeamLeader)?.cin ?? null;
    const authorCin = teamCins.find(c => c.isAuthor)?.cin ?? null;
    // Certifier: first CIN that is neither TL nor Author (or TL if no one else)
    const certifierCin =
      teamCins.find(c => !c.isTeamLeader && !c.isAuthor)?.cin ?? teamLeaderCin;

    // Derive teams present on this sheet
    const teamsOnSheet = Array.from(
      new Set(
        teamCins.map(c => cinTeamMap.get(c.cin)).filter((t): t is string => !!t)
      )
    );
    const isTeamBlended = teamsOnSheet.length > 1;

    const uncertifiedRowCount = unsignedBySheet.get(sheet.id) ?? 0;
    const govPercent = computeGovernancePercent(
      govBySheet.get(sheet.id) ?? null,
      uncertifiedRowCount === 0
    );

    results.push({
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      operationId: op.id,
      operationName: op.name,
      operationStatus: op.status,
      teamCins,
      teams: teamsOnSheet,
      isTeamBlended,
      teamLeaderCin,
      authorCin,
      certifierCin,
      uncertifiedRowCount,
      govPercent,
      isClosed: !!sheet.closedAt,
      createdAt: sheet.createdAt,
    });
  }

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface OutstandingTodoUser {
  cin: string;
  name: string;
  team: string | null;
  uncertifiedCount: number;
  governanceCount: number;
  totalCount: number;
}

/**
 * Returns all users ranked by total outstanding to-do actions
 * (uncertified rows they are a member of + governance items they own as TL/Author).
 */
export async function getOutstandingTodosByUser(
  viewerCommand?: CommandCode | null
): Promise<OutstandingTodoUser[]> {
  const db = await getDb();
  if (!db) return [];

  const allUsers = await db.select().from(users);
  const usersWithCin = allUsers.filter(u => u.cin && u.cin.trim() !== "");
  const teamNames = await teamNameMap();
  const visitorTeams = await visitorTeamMap(viewerCommand);

  const results: OutstandingTodoUser[] = [];

  for (const user of usersWithCin) {
    const cin = user.cin!;

    // Uncertified rows for this CIN
    const outstanding = await getOutstandingSheetsForCin(cin);
    const uncertifiedCount = outstanding.reduce(
      (sum, s) => sum + s.uncertifiedRowCount,
      0
    );

    // Governance items for this CIN (TL + Author)
    const govTodo = await getGovernanceTodoForCin(cin);
    const governanceCount = govTodo.reduce(
      (sum, s) =>
        sum + s.outstanding.filter(o => o !== "Ready to close").length,
      0
    );

    const totalCount = uncertifiedCount + governanceCount;
    if (totalCount === 0) continue;

    results.push({
      cin,
      name: user.name,
      team:
        teamNames.get(visitorTeams.get(user.id) ?? user.teamId ?? -1) ?? null,
      uncertifiedCount,
      governanceCount,
      totalCount,
    });
  }

  return results.sort((a, b) => b.totalCount - a.totalCount);
}
