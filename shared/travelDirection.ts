// Which way the team was travelling in the minutes before the target was last
// seen — used by the Target Predictor ("Where now?") to favour places ahead of
// that line over places behind it. Pure geometry over the GPS trail officers
// already share on the map: no model, no lookups, no randomness.
//
// The team's direction stands in for the target's only while the team is
// following him — the screen says so. When the trail can't answer (nobody
// sharing, too little movement, officers going different ways) there is no
// direction and the predictor works as it did, saying why.

/** How far back from the last sighting the trail is read. */
export const DIRECTION_WINDOW_MIN = 5;
/** Less net movement than this in the window is standing still, not a heading. */
export const MIN_TRAVEL_M = 200;
/** Officers whose headings differ by more than this are not going the same way. */
export const MAX_DISAGREE_DEG = 45;
/** Places within this many degrees either side of the heading (the whole
 * forward half) keep their full weight… */
export const FORWARD_HALF_DEG = 90;
/** …places behind lose most of it but never all — targets double back. */
export const BEHIND_WEIGHT = 0.25;
/** A place this close to the last sighting has no meaningful bearing. */
const SAME_SPOT_KM = 0.3;

export interface TrailPoint {
  userId: number;
  lat: number;
  lng: number;
  /** Epoch milliseconds. */
  recordedAt: number;
}

export type TravelDirection =
  | { ok: true; bearing: number; officers: number; metres: number }
  | { ok: false; why: "no-trail" | "too-short" | "disagree" };

type LL = { lat: number; lng: number };

/** Straight-line distance in km between two points. */
export function haversineKm(a: LL, b: LL): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, degrees 0–360 (0 = north). */
export function bearingDeg(a: LL, b: LL): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest angle between two bearings, 0–180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const NAMES = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
export function compassName(bearing: number): string {
  return NAMES[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

function circularMean(bearings: number[]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = bearings.reduce((s, b) => s + Math.cos(rad(b)), 0);
  const y = bearings.reduce((s, b) => s + Math.sin(rad(b)), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * The way the officers in `points` were going between `fromMs` and `toMs`:
 * each officer's net movement from their first to their last point in the
 * window (needs at least two points and MIN_TRAVEL_M), then one heading only if
 * they all agree within MAX_DISAGREE_DEG of it. Err towards no heading.
 */
export function travelDirection(
  points: readonly TrailPoint[],
  fromMs: number,
  toMs: number
): TravelDirection {
  const byUser = new Map<number, TrailPoint[]>();
  for (const p of points) {
    if (p.recordedAt < fromMs || p.recordedAt > toMs) continue;
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId)!.push(p);
  }
  if (byUser.size === 0) return { ok: false, why: "no-trail" };
  const bearings: number[] = [];
  let metres = 0;
  let sawTrail = false;
  for (const list of Array.from(byUser.values())) {
    if (list.length < 2) continue;
    sawTrail = true;
    list.sort((a, b) => a.recordedAt - b.recordedAt);
    const first = list[0];
    const last = list[list.length - 1];
    const m = haversineKm(first, last) * 1000;
    if (m < MIN_TRAVEL_M) continue;
    bearings.push(bearingDeg(first, last));
    metres += m;
  }
  if (!bearings.length)
    return { ok: false, why: sawTrail ? "too-short" : "no-trail" };
  const mean = circularMean(bearings);
  if (bearings.some(b => angleDiff(b, mean) > MAX_DISAGREE_DEG))
    return { ok: false, why: "disagree" };
  return {
    ok: true,
    bearing: mean,
    officers: bearings.length,
    metres: metres / bearings.length,
  };
}

/** Weight for a place seen from `from` given the heading: 1 within
 * FORWARD_HALF_DEG of it, BEHIND_WEIGHT beyond; 1 for a place at the same spot. */
export function directionWeight(heading: number, from: LL, to: LL): number {
  if (haversineKm(from, to) < SAME_SPOT_KM) return 1;
  return angleDiff(heading, bearingDeg(from, to)) <= FORWARD_HALF_DEG
    ? 1
    : BEHIND_WEIGHT;
}

export const WHY_NO_DIRECTION: Record<
  Extract<TravelDirection, { ok: false }>["why"],
  string
> = {
  "no-trail":
    "No shared location from the team in the 5 minutes before he was last seen, so no direction.",
  "too-short":
    "The team barely moved in the 5 minutes before he was last seen, so no direction.",
  disagree:
    "Officers were heading different ways in the 5 minutes before he was last seen, so no direction.",
};
