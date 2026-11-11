import { and, eq, inArray, isNull } from "drizzle-orm";
import { formatIntelAddress } from "@shared/addressFormat";
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
import { operations, runningSheets, sheetRows } from "../../drizzle/schema";
import { attributedRowIds, collapseToVisits } from "../entityAttribution";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import { getTargetById } from "./targets";
import { resolvePlaceLatLng } from "./geocoding";
import { getAllIntelligenceEntities } from "./intelEntities";
import {
  OBSERVATION_SIGNAL_RE,
  addDaysISO,
  isNonObservationRow,
  toPerthDateISO,
} from "./reportHelpers";

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
