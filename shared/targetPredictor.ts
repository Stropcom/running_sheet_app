// Target Predictor — where a target is likely to go next, or may be now, from
// his own history on the operation. Plain counts and medians over the visits
// the Places Report already builds (shared/placesReport.ts); no model, no
// randomness, no lookups, so the same history and the same clock always give
// the same answer. A pattern, never a certainty — it is shown on the map and
// is never written to a running sheet.
//
// What it counts
//   A "stop" is one visit with the place he went to next on the same sheet.
//   A visit with nothing logged after it gives no "next" and is left out — a
//   sheet ending is not the same as him staying put, and a gap is a gap.
//
// Where next   — stops at the place he is at now that were under way around
//                this time of day; count where each went.
// Where now    — he was last seen (a place, a point on the map, or not at all);
//                the same count, but only places he could have reached in the
//                time since, with a stated adjustment for the kind of area.
//
// The kind of area (freeway / main road / built-up / back street) sets the
// travel speed and how strongly places near the last sighting are favoured.
// Those numbers are assumptions, not history — the screen says so.
import { weekdayIndex, type PlaceVisit } from "./placesReport";
import { directionWeight, haversineKm } from "./travelDirection";

export { haversineKm };

// ── Tunable rules ────────────────────────────────────────────────────────────

/**
 * For now the predictor counts EVERY visit on record for the target on the
 * operation, whatever the day of the week or the time of day (owner's decision:
 * a target's route yesterday is evidence today, and histories are short). Set
 * to false to go back to the careful search that starts with the same weekday
 * and the same time of day and only widens when that finds fewer than
 * MIN_SAMPLES similar visits (kept below, and tested).
 */
export const USE_ALL_HISTORY = true;

/** Fewest similar visits for a prediction to count as more than very limited. */
export const MIN_SAMPLES = 3;

export type AreaClass = "freeway" | "main" | "built" | "back";
export const AREA_CLASSES: AreaClass[] = ["freeway", "main", "built", "back"];

export interface AreaRule {
  label: string;
  /** Assumed travel speed in this kind of area. */
  kmh: number;
  /** How quickly the pull of a place falls off with distance (km): small =
   * stays close. An assumption, not history. */
  lambdaKm: number;
  /** Share given to "somewhere close by" — not one of his usual places. */
  nearShare: number;
  note: string;
}

export const AREAS: Record<AreaClass, AreaRule> = {
  freeway: {
    label: "Freeway",
    kmh: 100,
    lambdaKm: 60,
    nearShare: 0.05,
    note: "On a freeway he may carry on a long way or turn off at an exit, so far-away places stay open.",
  },
  main: {
    label: "Main road",
    kmh: 70,
    lambdaKm: 25,
    nearShare: 0.15,
    note: "On a main road he may carry on or turn off, so places along and off it all stay in play.",
  },
  built: {
    label: "Built-up area",
    kmh: 60,
    lambdaKm: 12,
    nearShare: 0.4,
    note: "In a built-up area he is slow and most likely heading somewhere close by.",
  },
  back: {
    label: "Back street",
    kmh: 50,
    lambdaKm: 6,
    nearShare: 0.6,
    note: "On a back street he has most likely turned off to somewhere very close by.",
  },
};

/** The kind of area a street name says, or null when the name can't tell —
 * the officer then picks, and "built-up" is the stated default. Only the names
 * that are unmistakable are read: a freeway, motorway or expressway; a highway. */
export function areaFromStreetName(
  name: string | null | undefined
): AreaClass | null {
  if (!name) return null;
  if (/\b(freeway|fwy|motorway|expressway|tollway|ring road)\b/i.test(name))
    return "freeway";
  if (/\b(highway|hwy)\b/i.test(name)) return "main";
  return null;
}

/** The kind of area a posted speed limit says (WA): 90 and over is a freeway
 * or highway at speed, 70–80 a main road, 60 a built-up road, 50 and under a
 * back street. */
export function areaFromSpeedLimit(kph: number): AreaClass {
  if (kph >= 90) return "freeway";
  if (kph >= 70) return "main";
  if (kph >= 60) return "built";
  return "back";
}

export const DEFAULT_AREA: AreaClass = "built";

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface PredictorPlace {
  placeKey: string;
  name: string;
  /** Null when the place could not be located on the map. */
  lat: number | null;
  lng: number | null;
  /** Visits on record (0 = a registered address he has never been seen at). */
  visits?: number;
  /** One of the target's registered addresses. */
  registered?: boolean;
}

/** One visit with where he went after it. Times are minutes after midnight of
 * the day the visit started (a visit that ran past midnight can exceed 1440). */
export interface PredictorStop {
  placeKey: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  dateISO: string;
  startMinutes: number | null;
  endMinutes: number | null;
  /** True when a row at the place says he left (not just that the next place
   * began). */
  departureLogged: boolean;
  nextPlaceKey: string | null;
  /** Minutes from the start-day midnight when the next place began. */
  nextStartMinutes: number | null;
}

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** A hop longer than this between two places on one sheet is a different shift,
 * not "next". */
const MAX_HOP_MINUTES = 12 * 60;

/**
 * Orders each sheet's visits and attaches the place that came next. A visit
 * with no later visit on its sheet, or with the next one more than 12 hours
 * away, has no next place and gives no outcome.
 */
export function buildStops(visits: readonly PlaceVisit[]): PredictorStop[] {
  const bySheet = new Map<number, PlaceVisit[]>();
  for (const v of visits) {
    if (!bySheet.has(v.sheetId)) bySheet.set(v.sheetId, []);
    bySheet.get(v.sheetId)!.push(v);
  }
  const stops: PredictorStop[] = [];
  for (const list of Array.from(bySheet.values())) {
    const keyOf = (v: PlaceVisit) =>
      dayNum(v.dateISO) * 1440 + (v.startMinutes ?? v.endMinutes ?? 0);
    const ordered = [...list].sort((a, b) => keyOf(a) - keyOf(b));
    ordered.forEach((v, i) => {
      const nx = ordered[i + 1];
      const gapOk =
        nx &&
        nx.placeKey !== v.placeKey &&
        nx.startMinutes !== null &&
        keyOf(nx) - keyOf(v) <= MAX_HOP_MINUTES;
      const base = dayNum(v.dateISO) * 1440;
      stops.push({
        placeKey: v.placeKey,
        weekday: weekdayIndex(v.dateISO),
        dateISO: v.dateISO,
        startMinutes: v.startMinutes,
        endMinutes:
          v.endMinutes === null ? null : v.endMinutes + v.endDayOffset * 1440,
        departureLogged: v.endMinutes !== null,
        nextPlaceKey: gapOk ? nx.placeKey : null,
        nextStartMinutes: gapOk
          ? dayNum(nx.dateISO) * 1440 + (nx.startMinutes as number) - base
          : null,
      });
    });
  }
  return stops;
}

/** When the stop was over: the logged departure, else when the next place
 * began, else unknown. */
function effectiveEnd(s: PredictorStop): number | null {
  return s.endMinutes ?? s.nextStartMinutes ?? null;
}

function effectiveStart(s: PredictorStop): number | null {
  return s.startMinutes ?? s.endMinutes ?? null;
}

// ── Geography ────────────────────────────────────────────────────────────────

function located(
  p: PredictorPlace | undefined
): { lat: number; lng: number } | null {
  return p && p.lat !== null && p.lng !== null
    ? { lat: p.lat, lng: p.lng }
    : null;
}

// ── Prediction ───────────────────────────────────────────────────────────────

export type Scope = "day" | "group" | "anyday" | "anytime";

export type PredictorMode = "next" | "now";
export type Tier = "none" | "thin" | "low" | "mid" | "high";

export type PredictorFrom =
  /** At a place: Where next uses it as the place he is at; Where now as the
   * place he was last seen. `leaving` = a row says he was leaving it. */
  | { kind: "place"; placeKey: string; minutes: number; leaving: boolean }
  /** Last seen at a point on the map (no known place). */
  | { kind: "point"; lat: number; lng: number; minutes: number }
  /** Where now only: not seen yet. */
  | { kind: "none" };

export interface PredictorInput {
  mode: PredictorMode;
  stops: readonly PredictorStop[];
  places: readonly PredictorPlace[];
  from: PredictorFrom;
  /** The clock: weekday (0 = Monday) and minutes after midnight, Perth time. */
  nowWeekday: number;
  nowMinutes: number;
  /** Where he was last seen — sets speed and favoured distance. */
  area: AreaClass;
  /** Where now: the compass bearing (0 = north) the team was travelling in the
   * minutes before the last sighting — places ahead of it are favoured over
   * places behind (shared/travelDirection.ts). Null = no direction. */
  heading?: number | null;
  /** Where now: the posted speed limit (km/h) of the road he was last seen
   * on, when it is known and the officer has not chosen the area by hand — the
   * travel speed is then the limit itself rather than the area's assumed
   * speed. */
  limitKmh?: number | null;
  /** Count every visit on record whatever the day or time (default
   * USE_ALL_HISTORY). false = the careful search that starts with the same
   * weekday and time of day. */
  allHistory?: boolean;
}

export type CandidateState = "next" | "at" | "route" | "near";

export interface Candidate {
  /** A place key, or "_near" for "somewhere close by". */
  placeKey: string;
  /** Similar visits that went here. */
  n: number;
  /** Share of similar visits (history only). */
  history: number;
  /** The share shown — history, nudged by the area for Where now. */
  p: number;
  /** Km from where he was last seen (Where now), else null. */
  km: number | null;
  /** Median minutes from leaving the start place to arriving here. */
  gapMinutes: number | null;
  /** Median minutes after midnight he usually gets here. */
  arriveMinutes: number | null;
  state: CandidateState;
}

/** A location of interest inside the "how far could he have got" ring. */
export interface ReachPlace {
  placeKey: string;
  /** Straight-line km from where he was last seen. */
  km: number;
  visits: number;
  registered: boolean;
}

export interface Prediction {
  mode: PredictorMode;
  tier: Tier;
  /** Similar visits the prediction rests on. */
  total: number;
  /** "day" = the same weekday; "group" = all weekdays / all weekend days. */
  /** How wide the search had to go to find similar visits: the same weekday,
   * all weekdays / weekend days, any day (same time of day), or any day and
   * time. The search only widens when the narrower one finds fewer than
   * MIN_SAMPLES. */
  scope: Scope;
  candidates: Candidate[];
  /** The most-used outcome in his history, ignoring the area adjustment. */
  topHistoryShare: number | null;
  /** Median minutes after midnight he usually leaves the start place. */
  leaveMinutes: number | null;
  /** Where now: minutes since last seen, how far he could have got (km). */
  elapsedMinutes: number;
  reachKm: number;
  /** The travel speed the reach was worked out at, km/h. */
  kmh: number;
  area: AreaClass;
  /** Where now: every known location (places he has been seen at and his
   * registered addresses) inside the reach, nearest first. Independent of the
   * history counts — it answers "what is out there that is his", while the
   * candidates answer "where is he most likely to be". */
  inReach: ReachPlace[];
  /** Where now: the last-seen position could be placed on the map, so the
   * reach (and inReach) mean something. Needs no history at all. */
  seenLocated: boolean;
  /** True when the area adjustment was applied to the shares. */
  adjusted: boolean;
  /** True when the team's direction of travel changed the shares. */
  directionApplied: boolean;
  /** Visits on record in the whole history used. */
  historyStops: number;
}

const dayGroup = (weekday: number) => (weekday <= 4 ? "weekday" : "weekend");

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function tierOf(total: number, topShare: number | null): Tier {
  if (total === 0 || topShare === null) return "none";
  // One or two similar visits: still an answer, but a very thin one.
  if (total < MIN_SAMPLES) return "thin";
  if (total < 6 || topShare < 0.5) return "low";
  if (total < 12 || topShare < 0.7) return "mid";
  return "high";
}

export const NEAR_KEY = "_near";

/** Counts the target's own history. See the file header for the rules. */
export function predict(input: PredictorInput): Prediction {
  const { mode, from } = input;
  const allHistory = input.allHistory ?? USE_ALL_HISTORY;
  const placeByKey = new Map(input.places.map(p => [p.placeKey, p]));
  const known = input.stops.filter(
    s => placeByKey.has(s.placeKey) && effectiveStart(s) !== null
  );
  const pool = (scope: Scope) =>
    known.filter(s =>
      scope === "day"
        ? s.weekday === input.nowWeekday
        : scope === "group"
          ? dayGroup(s.weekday) === dayGroup(input.nowWeekday)
          : true
    );
  /** The narrowest search that finds MIN_SAMPLES similar visits; when none
   * does, the one that finds the most (the narrowest of those). */
  const search = (
    steps: { scope: Scope; timed: boolean }[],
    matches: (s: PredictorStop, timed: boolean) => boolean,
    /** Stop at the first step that finds anything (used where the narrower
     * step is the better evidence however few it finds). */
    firstNonEmpty = false
  ): { scope: Scope; hits: PredictorStop[] } => {
    let best: { scope: Scope; hits: PredictorStop[] } | null = null;
    for (const st of steps) {
      const hits = pool(st.scope).filter(s => matches(s, st.timed));
      if (hits.length >= MIN_SAMPLES || (firstNonEmpty && hits.length > 0))
        return { scope: st.scope, hits };
      if (!best || hits.length > best.hits.length)
        best = { scope: st.scope, hits };
    }
    return best ?? { scope: "day", hits: [] };
  };

  // The point he was last seen, for distance and reach.
  const seenPt =
    mode !== "now"
      ? null
      : from.kind === "place"
        ? (located(placeByKey.get(from.placeKey)) ?? null)
        : from.kind === "point"
          ? { lat: from.lat, lng: from.lng }
          : null;
  const seenMinutes =
    mode === "now" && from.kind !== "none" ? from.minutes : null;
  const elapsed =
    seenMinutes === null ? 0 : Math.max(0, input.nowMinutes - seenMinutes);
  const kmh = input.limitKmh ?? AREAS[input.area].kmh;
  const reachKm = (kmh * elapsed) / 60;

  let scope: Scope = "day";
  let hits: PredictorStop[] = [];
  let candidates: Candidate[] = [];
  let leaveMinutes: number | null = null;
  // The moment the journey starts from: when he was last seen (Where now), or
  // when the sheet says he left (Where next, already on the move), else now.
  const t0 =
    from.kind === "place" && from.leaving
      ? from.minutes
      : (seenMinutes ?? input.nowMinutes);

  if (from.kind === "place") {
    const from_ = from;
    const at =
      mode === "next" && !from_.leaving ? input.nowMinutes : from_.minutes;
    const matches = (s: PredictorStop, timed: boolean): boolean => {
      if (s.placeKey !== from_.placeKey || !s.nextPlaceKey) return false;
      // Any day, any time: he was at this place and went on from it.
      if (!timed) return true;
      const start = effectiveStart(s) as number;
      const end = effectiveEnd(s);
      // He was seen leaving: visits that ended around then.
      if (from_.leaving)
        return end !== null && s.departureLogged && Math.abs(end - at) <= 60;
      // Otherwise: visits that were under way at that time of day.
      return at >= start - 30 && (end === null ? false : at <= end + 15);
    };
    const found = search(
      allHistory
        ? [{ scope: "anytime", timed: false }]
        : [
            { scope: "day", timed: true },
            { scope: "group", timed: true },
            { scope: "anyday", timed: true },
            { scope: "anytime", timed: false },
          ],
      matches
    );
    scope = found.scope;
    hits = found.hits;
    leaveMinutes = median(
      hits.map(effectiveEnd).filter((m): m is number => m !== null)
    );
    const byNext = new Map<string, PredictorStop[]>();
    for (const s of hits) {
      const k = s.nextPlaceKey as string;
      if (!byNext.has(k)) byNext.set(k, []);
      byNext.get(k)!.push(s);
    }
    candidates = Array.from(byNext.entries()).map(([k, list]) => {
      const gaps = list
        .map(s => {
          const end = effectiveEnd(s);
          return end !== null && s.nextStartMinutes !== null
            ? s.nextStartMinutes - end
            : null;
        })
        .filter((g): g is number => g !== null && g >= 0);
      const gap = median(gaps);
      const leave = leaveMinutes ?? t0;
      const arrive =
        gap === null ? null : (from_.leaving ? t0 : Math.max(t0, leave)) + gap;
      const share = list.length / Math.max(1, hits.length);
      return {
        placeKey: k,
        n: list.length,
        history: share,
        p: share,
        km: null,
        gapMinutes: gap,
        arriveMinutes: arrive,
        state: "next" as CandidateState,
      };
    });
  } else {
    // Not seen yet, or seen somewhere that is not a known place: where is he
    // usually at this time of day?
    const occupied = (s: PredictorStop, timed: boolean) => {
      // Nothing on record at this time of day: every visit counts, so the
      // places he goes most are still ranked rather than nothing at all.
      if (!timed) return true;
      const start = effectiveStart(s) as number;
      const end = effectiveEnd(s);
      return (
        start <= input.nowMinutes && end !== null && input.nowMinutes <= end
      );
    };
    // Where is he at this time of day: the time counts here, the day does not
    // (when all history is used); and when nothing was on record at this time,
    // all his visits are ranked by how often he goes there.
    const found = search(
      allHistory
        ? [
            { scope: "anyday", timed: true },
            { scope: "anytime", timed: false },
          ]
        : [
            { scope: "day", timed: true },
            { scope: "group", timed: true },
            { scope: "anyday", timed: true },
            { scope: "anytime", timed: false },
          ],
      occupied,
      true
    );
    scope = found.scope;
    hits = found.hits;
    const byPlace = new Map<string, PredictorStop[]>();
    for (const s of hits) {
      if (!byPlace.has(s.placeKey)) byPlace.set(s.placeKey, []);
      byPlace.get(s.placeKey)!.push(s);
    }
    candidates = Array.from(byPlace.entries()).map(([k, list]) => {
      const share = list.length / Math.max(1, hits.length);
      return {
        placeKey: k,
        n: list.length,
        history: share,
        p: share,
        km: null,
        gapMinutes: null,
        arriveMinutes: null,
        state: "at" as CandidateState,
      };
    });
  }

  const total = hits.length;
  const topHistory = [...candidates].sort((a, b) => b.history - a.history)[0];
  const tierBase = candidates.slice();

  // Distances and states from where he was last seen.
  if (mode === "now" && seenPt) {
    for (const c of candidates) {
      const place = located(placeByKey.get(c.placeKey));
      c.km = place ? haversineKm(seenPt, place) : null;
      c.state =
        from.kind === "place" &&
        c.gapMinutes !== null &&
        elapsed >= c.gapMinutes &&
        (c.km ?? 0) <= reachKm * 1.25
          ? "at"
          : from.kind === "place"
            ? "route"
            : "at";
    }
  } else if (mode === "next") {
    for (const c of candidates) c.state = "next";
  }

  // From a point or a place he was last seen at: drop places he cannot have
  // reached (from a point), favour nearby ones by the kind of area. The
  // adjustment is an assumption, shown as one.
  let adjusted = false;
  let directionApplied = false;
  if (mode === "now" && seenPt && candidates.length) {
    // A place that could not be located can't be judged by distance.
    candidates = candidates.filter(c => c.km !== null);
    if (from.kind === "point")
      candidates = candidates.filter(
        c => (c.km ?? 0) <= Math.max(reachKm * 1.25, 0.6)
      );
    const lambda = AREAS[input.area].lambdaKm;
    const heading = input.heading ?? null;
    const dirW = (c: Candidate) => {
      const pl = located(placeByKey.get(c.placeKey));
      return heading !== null && pl ? directionWeight(heading, seenPt, pl) : 1;
    };
    const weight = (c: Candidate) =>
      c.history * Math.exp(-(c.km ?? 0) / lambda) * dirW(c);
    const sum = candidates.reduce((t, c) => t + weight(c), 0);
    if (sum > 0) {
      for (const c of candidates) c.p = weight(c) / sum;
      adjusted = true;
      directionApplied = heading !== null && candidates.some(c => dirW(c) < 1);
    }
  }

  const topShare = (tierBase.length ? topHistory?.history : null) ?? null;
  const tier = tierOf(total, topShare);

  // Plus a share for "somewhere close by" — not one of his usual places.
  if (mode === "now" && seenPt && tier !== "none") {
    const m = AREAS[input.area].nearShare;
    for (const c of candidates) c.p = c.p * (1 - m);
    candidates.push({
      placeKey: NEAR_KEY,
      n: 0,
      history: 0,
      p: m,
      km: 0,
      gapMinutes: null,
      arriveMinutes: null,
      state: "near",
    });
  }
  candidates.sort((a, b) => b.p - a.p || b.n - a.n);

  // Locations of interest inside the reach, nearest first. The reach is a
  // little generous (x1.25) because speeds are assumptions, and never smaller
  // than 600 m so a fresh sighting still lists what is right there.
  const inReach: ReachPlace[] =
    mode === "now" && seenPt
      ? input.places
          .map(pl => {
            const at = located(pl);
            return at
              ? {
                  placeKey: pl.placeKey,
                  km: haversineKm(seenPt, at),
                  visits: pl.visits ?? 0,
                  registered: pl.registered ?? false,
                }
              : null;
          })
          .filter(
            (r): r is ReachPlace =>
              r !== null && r.km <= Math.max(reachKm * 1.25, 0.6)
          )
          .sort((a, b) => a.km - b.km)
      : [];

  return {
    mode,
    tier,
    total,
    scope,
    candidates,
    topHistoryShare: topShare,
    leaveMinutes,
    elapsedMinutes: elapsed,
    reachKm,
    kmh,
    area: input.area,
    inReach,
    seenLocated: mode === "now" && seenPt !== null,
    adjusted,
    directionApplied,
    historyStops: input.stops.length,
  };
}

// ── Wording (shared by the banner and the tests) ─────────────────────────────

export const TIER_LABEL: Record<Tier, string> = {
  none: "No similar visits",
  thin: "Very limited history",
  low: "Low confidence",
  mid: "Moderate confidence",
  high: "High confidence",
};

function hhmm(m: number): string {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface Headline {
  main: string;
  sub: string;
}

/** The one line (and the small print under it) shown at the top of the map. */
export function describePrediction(
  pr: Prediction,
  input: PredictorInput,
  nameOf: (placeKey: string) => string
): Headline {
  // Where now with a last-seen point: how far he could have got is an answer
  // in its own right, needing no history at all.
  if (
    pr.mode === "now" &&
    pr.seenLocated &&
    (pr.tier === "none" || !pr.candidates[0])
  ) {
    const n = pr.inReach.length;
    return {
      main:
        pr.elapsedMinutes > 0
          ? `He could be up to ${formatKm(pr.reachKm)} from where he was last seen`
          : "Just seen — the area he could be in grows with every minute",
      sub: `${Math.round(pr.elapsedMinutes)} min at about ${pr.kmh} km/h (${AREAS[pr.area].label.toLowerCase()}) · ${
        n === 0
          ? "no known locations of interest in reach"
          : `${n} known location${n === 1 ? "" : "s"} of interest in reach`
      }`,
    };
  }
  const h = headlineCore(pr, input, nameOf);
  if (pr.tier === "none" || !pr.candidates[0]) return h;
  // Say plainly when the answer rests on very little, or on other days.
  const notes: string[] = [];
  if (pr.tier === "thin")
    notes.push(
      `only ${pr.total} similar visit${pr.total === 1 ? "" : "s"} — very limited history`
    );
  if (pr.mode === "now" && pr.seenLocated && pr.elapsedMinutes > 0)
    notes.push(`could be up to ${formatKm(pr.reachKm)} away`);
  if (!(input.allHistory ?? USE_ALL_HISTORY)) {
    if (pr.scope === "anyday") notes.push("from other days at this time");
    if (pr.scope === "anytime") notes.push("from other days and times");
  }
  return notes.length ? { ...h, sub: `${h.sub} · ${notes.join(" · ")}` } : h;
}

function headlineCore(
  pr: Prediction,
  input: PredictorInput,
  nameOf: (placeKey: string) => string
): Headline {
  const top = pr.candidates[0];
  if (pr.tier === "none" || !top) {
    return {
      main: "No prediction yet",
      sub: "No similar visit on record for this target on this operation — nothing to count yet.",
    };
  }
  const pct = `${Math.round(top.p * 100)}%`;
  const from = input.from;
  const adj = pr.directionApplied
    ? " (area-adjusted, favouring places ahead)"
    : pr.adjusted
      ? " (area-adjusted)"
      : "";
  const startName = from.kind === "place" ? nameOf(from.placeKey) : null;
  if (pr.mode === "next") {
    const leave =
      pr.leaveMinutes !== null && startName
        ? ` · usually leaves ${startName} about ${hhmm(pr.leaveMinutes)}`
        : "";
    return {
      main: `Next: ${nameOf(top.placeKey)}${top.arriveMinutes !== null ? `, about ${hhmm(top.arriveMinutes)}` : ""}`,
      sub: `${pct} of similar visits${leave}`,
    };
  }
  if (from.kind === "none") {
    return {
      main: `Likely at ${nameOf(top.placeKey)} right now`,
      sub:
        pr.scope === "anytime"
          ? `${pct} of all his recorded visits · not seen yet, and nothing on record at this time of day, so this is where he goes most`
          : `${pct} of similar visits at this time of day · not seen yet, so this is from his routine only`,
    };
  }
  const where =
    from.kind === "place"
      ? startName
      : `the ${AREAS[pr.area].label.toLowerCase()}`;
  const since = `last seen at ${where} ${hhmm(from.minutes)}`;
  if (top.placeKey === NEAR_KEY) {
    return {
      main: "May still be close to where he was last seen",
      sub: `${pct} · ${since} · in this kind of area he has most likely turned off nearby (an assumption, not his history)`,
    };
  }
  if (from.kind === "point")
    return {
      main: `May be at ${nameOf(top.placeKey)} or on the way there`,
      sub: `${pct}${adj} · ${since}`,
    };
  const usual =
    top.arriveMinutes !== null
      ? ` (usually there by ${hhmm(top.arriveMinutes)})`
      : "";
  return top.state === "at"
    ? {
        main: `May now be at ${nameOf(top.placeKey)}${usual}`,
        sub: `${pct}${adj} · ${since}`,
      }
    : {
        main: `May be on the way to ${nameOf(top.placeKey)}${top.arriveMinutes !== null ? `, usually there about ${hhmm(top.arriveMinutes)}` : ""}`,
        sub: `${pct}${adj} · ${since}`,
      };
}

// ── The clock ────────────────────────────────────────────────────────────────

/** Weekday (0 = Monday), date and minutes after midnight in Perth for an
 * instant — the predictor always works on the Perth clock, whatever the device
 * says. */
export function perthClock(at: Date): {
  dateISO: string;
  weekday: number;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "0";
  const dateISO = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    dateISO,
    weekday: weekdayIndex(dateISO),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}
