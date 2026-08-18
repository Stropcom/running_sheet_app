// ─── Pattern of Life ────────────────────────────────────────────────────────
// Deterministic time/location analysis derived from a target's own certified
// observations — pure functions only (no DB access), so every rule here is
// unit-tested directly. server/db.ts wires real query results into these.

/**
 * Whether an observation row narrates arriving at, or departing, the address
 * it mentions. Deliberately conservative: a row that reads as both, or
 * neither, comes back "neutral" rather than guessing — an unclear direction
 * must not be asserted as a bounding event for the Home Presence timeline
 * (see computeHomePresenceByBucket below), though it still counts as a plain
 * visit for the Where & When grid and the day/time activity grid.
 */
export type VisitDirection = "arrived" | "departed" | "neutral";

const ARRIVE_RE =
  /\b(arriv\w*|return\w*|re-?enter\w*|(?<!re-)enter\w*|back\s+(?:at|home)|pull\w*\s+(?:in|into|up)\s+(?:at|to|outside)?)\b/i;
const DEPART_RE =
  /\b(depart\w*|left|drove?\s+(?:off|away)|exit\w*|revers\w*\s+from\s+the\s+driveway|continu\w*\s+via)\b/i;

export function classifyVisitDirection(observation: string): VisitDirection {
  const hasArrive = ARRIVE_RE.test(observation);
  const hasDepart = DEPART_RE.test(observation);
  if (hasArrive && !hasDepart) return "arrived";
  if (hasDepart && !hasArrive) return "departed";
  return "neutral";
}

// ── Time-of-day bucketing ───────────────────────────────────────────────────
// One generic bucketer parameterised by bucket count, rather than separate
// 6/8/12-bucket variants, so the three different granularities used across
// the report (Where & When = 6, departure/arrival histograms = 8, Home
// Presence = 12) can't drift out of sync with each other.

export function timeBucketIndex(
  timeMinutes: number,
  bucketCount: number
): number {
  const bucketSizeMin = 1440 / bucketCount;
  return Math.min(
    bucketCount - 1,
    Math.max(0, Math.floor(timeMinutes / bucketSizeMin))
  );
}

export function timeBucketLabels(bucketCount: number): string[] {
  const bucketSizeMin = 1440 / bucketCount;
  const labels: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const startH = Math.floor((i * bucketSizeMin) / 60);
    const endH = Math.floor(((i + 1) * bucketSizeMin) / 60);
    labels.push(
      `${String(startH).padStart(2, "0")}–${String(endH).padStart(2, "0")}`
    );
  }
  return labels;
}

// ── Day of week ──────────────────────────────────────────────────────────────

export const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** dateISO must already be a resolved Perth-anchored YYYY-MM-DD (see
 * toPerthDateISO/addDaysISO in db.ts) — this function itself is timezone-free,
 * treating the string as a pure calendar date. Returns 0=Mon .. 6=Sun. */
export function dayOfWeekIndex(dateISO: string): number {
  const d = new Date(dateISO + "T00:00:00Z");
  const jsDay = d.getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

// ── Where & When: location × time grid ──────────────────────────────────────

export interface LocationVisitEvent {
  entityKey: string;
  label: string;
  timeMinutes: number;
  dateISO: string;
}

export interface LocationTimeGridRow {
  entityKey: string;
  label: string;
  counts: number[]; // length = bucketCount
  total: number;
}

export function buildLocationTimeGrid(
  visits: LocationVisitEvent[],
  bucketCount: number,
  topN: number
): LocationTimeGridRow[] {
  const byEntity = new Map<string, LocationTimeGridRow>();
  for (const v of visits) {
    let row = byEntity.get(v.entityKey);
    if (!row) {
      row = {
        entityKey: v.entityKey,
        label: v.label,
        counts: new Array(bucketCount).fill(0),
        total: 0,
      };
      byEntity.set(v.entityKey, row);
    }
    row.counts[timeBucketIndex(v.timeMinutes, bucketCount)]++;
    row.total++;
  }
  return Array.from(byEntity.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
}

export interface PeakCell {
  entityKey: string;
  label: string;
  bucketIndex: number;
  count: number;
}

/** The single most common (location, time-bucket) combination — the
 * headline "most predictable pattern" is derived from this. */
export function findPeakCell(rows: LocationTimeGridRow[]): PeakCell | null {
  let best: PeakCell | null = null;
  for (const row of rows) {
    row.counts.forEach((count, bucketIndex) => {
      if (count > 0 && (!best || count > best.count)) {
        best = {
          entityKey: row.entityKey,
          label: row.label,
          bucketIndex,
          count,
        };
      }
    });
  }
  return best;
}

// ── Activity by day & time (general, not location-specific) ────────────────

export function buildDayTimeGrid(
  rows: Array<{ dateISO: string; timeMinutes: number }>,
  bucketCount: number
): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () =>
    new Array(bucketCount).fill(0)
  );
  for (const r of rows) {
    grid[dayOfWeekIndex(r.dateISO)][
      timeBucketIndex(r.timeMinutes, bucketCount)
    ]++;
  }
  return grid;
}

/** Days (0=Mon..6=Sun) whose total activity ties for the highest — the
 * "most active days" part of the headline. Returns all tied days, so a
 * flat/even week doesn't misleadingly single one out. */
export function mostActiveDays(grid: number[][]): number[] {
  const totals = grid.map(row => row.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals);
  if (max === 0) return [];
  return totals.reduce<number[]>((acc, t, i) => {
    if (t === max) acc.push(i);
    return acc;
  }, []);
}

// ── Home presence: interval-stitching between departed/arrived events ──────

export interface HomeEvent {
  dateISO: string;
  timeMinutes: number;
  direction: "arrived" | "departed";
}

export interface HomePresenceBucket {
  homeMinutes: number;
  awayMinutes: number;
  unknownMinutes: number;
}

/**
 * For each time-of-day bucket, how many minutes (aggregated across every
 * observed day) fall in each state. Deliberately only interpolates BETWEEN
 * two events on the SAME calendar day — a gap between one day's last event
 * and the next day's first is never bridged, since surveillance runs in
 * shifts, not continuously; that gap (and the time before the first event
 * or after the last event of a day) is Unknown, not assumed to carry the
 * last known state forward. Days with zero home events are excluded
 * entirely rather than contributing Unknown minutes, since "no shift that
 * day" is a different fact than "had a shift but couldn't tell."
 */
export function computeHomePresenceByBucket(
  events: HomeEvent[],
  bucketCount: number
): HomePresenceBucket[] {
  const buckets: HomePresenceBucket[] = Array.from(
    { length: bucketCount },
    () => ({ homeMinutes: 0, awayMinutes: 0, unknownMinutes: 0 })
  );
  if (events.length === 0) return buckets;

  const byDate = new Map<string, HomeEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.dateISO)) byDate.set(e.dateISO, []);
    byDate.get(e.dateISO)!.push(e);
  }

  const bucketSizeMin = 1440 / bucketCount;
  const addSpan = (
    startMin: number,
    endMin: number,
    state: "home" | "away" | "unknown"
  ) => {
    let cursor = Math.max(0, startMin);
    const end = Math.min(1440, endMin);
    while (cursor < end) {
      const bucketIdx = Math.min(
        buckets.length - 1,
        Math.floor(cursor / bucketSizeMin)
      );
      const bucketEnd = (bucketIdx + 1) * bucketSizeMin;
      const spanEnd = Math.min(end, bucketEnd);
      const minutes = spanEnd - cursor;
      if (state === "home") buckets[bucketIdx].homeMinutes += minutes;
      else if (state === "away") buckets[bucketIdx].awayMinutes += minutes;
      else buckets[bucketIdx].unknownMinutes += minutes;
      cursor = spanEnd;
    }
  };

  for (const dayEvents of Array.from(byDate.values())) {
    dayEvents.sort((a, b) => a.timeMinutes - b.timeMinutes);
    addSpan(0, dayEvents[0].timeMinutes, "unknown");
    for (let i = 0; i < dayEvents.length - 1; i++) {
      const cur = dayEvents[i];
      const next = dayEvents[i + 1];
      addSpan(
        cur.timeMinutes,
        next.timeMinutes,
        cur.direction === "arrived" ? "home" : "away"
      );
    }
    addSpan(dayEvents[dayEvents.length - 1].timeMinutes, 1440, "unknown");
  }

  return buckets;
}

export interface HomePresencePercent {
  home: number;
  away: number;
  unknown: number;
}

export function toHomePresencePercent(
  bucket: HomePresenceBucket
): HomePresencePercent {
  const total = bucket.homeMinutes + bucket.awayMinutes + bucket.unknownMinutes;
  if (total === 0) return { home: 0, away: 0, unknown: 100 };
  return {
    home: Math.round((bucket.homeMinutes / total) * 100),
    away: Math.round((bucket.awayMinutes / total) * 100),
    unknown: Math.round((bucket.unknownMinutes / total) * 100),
  };
}

/** Contiguous bucket ranges where a state is at or above `threshold`% —
 * feeds the "likely home 18:00–06:00" headline. Wraps around midnight
 * (e.g. a run from bucket 10 to bucket 2 the next "day" is one range). */
export function dominantRanges(
  percents: HomePresencePercent[],
  state: "home" | "away",
  bucketCount: number,
  threshold = 50
): Array<{ startBucket: number; endBucket: number }> {
  const isDominant = percents.map(p => p[state] >= threshold);
  if (isDominant.every(v => !v)) return [];
  if (isDominant.every(v => v))
    return [{ startBucket: 0, endBucket: bucketCount }];

  // Rotate to start at a false→true transition so a wraparound run isn't
  // split into two at the array boundary.
  let rotateBy = 0;
  for (let i = 0; i < bucketCount; i++) {
    if (isDominant[i] && !isDominant[(i - 1 + bucketCount) % bucketCount]) {
      rotateBy = i;
      break;
    }
  }
  const rotated = Array.from(
    { length: bucketCount },
    (_, i) => isDominant[(i + rotateBy) % bucketCount]
  );

  const ranges: Array<{ startBucket: number; endBucket: number }> = [];
  let runStart: number | null = null;
  for (let i = 0; i <= bucketCount; i++) {
    const on = i < bucketCount && rotated[i];
    if (on && runStart === null) runStart = i;
    if (!on && runStart !== null) {
      ranges.push({
        startBucket: (runStart + rotateBy) % bucketCount,
        endBucket: (i + rotateBy) % bucketCount,
      });
      runStart = null;
    }
  }
  return ranges;
}

// ── Departure / return time histograms ──────────────────────────────────────

export function buildDirectionHistogram(
  events: HomeEvent[],
  direction: "arrived" | "departed",
  bucketCount: number
): number[] {
  const counts = new Array(bucketCount).fill(0);
  for (const e of events) {
    if (e.direction !== direction) continue;
    counts[timeBucketIndex(e.timeMinutes, bucketCount)]++;
  }
  return counts;
}

export function peakBucketIndex(counts: number[]): number | null {
  const max = Math.max(...counts);
  if (max <= 0) return null;
  return counts.indexOf(max);
}

// ── Confidence ───────────────────────────────────────────────────────────────

export type ConfidenceTier = "low" | "moderate" | "high";

/** Minimum geocoded observations before the report is shown at all — below
 * this, a handful of sightings would present as a confident "pattern" that
 * isn't one yet. */
export const MIN_OBSERVATIONS_FOR_PATTERN = 5;

export function confidenceTier(
  geocodedObservationCount: number
): ConfidenceTier {
  if (geocodedObservationCount >= 30) return "high";
  if (geocodedObservationCount >= 10) return "moderate";
  return "low";
}
