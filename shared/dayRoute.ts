/**
 * Day Route (Intelligence → Reports): where one target went on one day, in
 * time order, with the time at each place and the stretches no row covers.
 *
 * It is built from the same visits the Places Report works out
 * (shared/placesReport.ts buildVisits), so the two can never disagree about
 * where a target was. Every rule is a pure function here, tested directly
 * (server/dayRoute.test.ts) and used by the page and the PDF alike.
 * Deterministic and offline — no AI, and nothing is filled in: a stretch no
 * row covers is shown as a gap, never as a guessed path.
 */
import { formatClock, formatDwell } from "./placesReport";
import type { PlaceKind, PlaceVisit } from "./placesReport";

/** No row for this long between two places is shown as a gap. */
export const GAP_MINUTES = 60;

/** The most pins a Google static map can label (0-9 and A-Z are the only
 * single-character labels it accepts; 0 is left out so a pin never reads as O). */
const PIN_LABELS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The label a place's pin carries, by the order the places were first visited.
 * Past 35 places a pin is left unlabelled ("" — never a wrong character). */
export function pinLabel(index: number): string {
  return index >= 0 && index < PIN_LABELS.length ? PIN_LABELS[index] : "";
}

export interface DayRoutePlace {
  placeKey: string;
  name: string;
  kind: PlaceKind;
  visits: readonly PlaceVisit[];
}

export interface RouteStop {
  /** Position in the day, 1 first. */
  n: number;
  placeKey: string;
  name: string;
  kind: PlaceKind;
  /** The pin this place carries on the map (same place, same pin, every visit). */
  pin: string;
  /** 1 for the first time at this place that day, 2 for the second… */
  visitNo: number;
  startMinutes: number | null;
  endMinutes: number | null;
  /** Whole days after the day the departure fell on (0 = the same day). */
  endDayOffset: number;
  /** Time there, only when both ends are logged. */
  dwellMinutes: number | null;
  /** The first row of the stop — for linking back to the sheet. */
  rowId: number;
  sheetId: number;
  sheetTitle: string;
}

/** What lies between one stop and the next. */
export type RouteLeg =
  | { kind: "travel"; minutes: number }
  /** No row for GAP_MINUTES or more between the two. */
  | { kind: "gap"; minutes: number; fromMinutes: number; toMinutes: number }
  /** The earlier stop has no logged departure, so the time between is unknown. */
  | { kind: "unknown" };

export interface DayRoute {
  dateISO: string;
  stops: RouteStop[];
  /** legs[i] is between stops[i] and stops[i + 1]. */
  legs: RouteLeg[];
  /** Distinct places, in the order first visited — one map pin each. */
  places: { pin: string; placeKey: string; name: string; kind: PlaceKind }[];
  stats: {
    stops: number;
    places: number;
    returns: number;
    /** Sum of the times at places that have both ends logged. */
    minutesAtPlaces: number;
    gaps: number;
  };
}

/** The minute a stop is placed at in the day: its arrival, or its departure
 * when the sheet opened with the target already leaving. */
function placedAt(v: {
  startMinutes: number | null;
  endMinutes: number | null;
}) {
  return v.startMinutes ?? v.endMinutes ?? 0;
}

/**
 * The target's route on one day, from the places and visits the Places Report
 * holds. Visits are ordered by the time they are placed at; two stops in a
 * row at the same place (a hand-over between sheets) are one stop. Returns
 * null when nothing happened that day.
 */
export function buildDayRoute(
  places: readonly DayRoutePlace[],
  dateISO: string
): DayRoute | null {
  type Raw = { place: DayRoutePlace; visit: PlaceVisit };
  const raw: Raw[] = [];
  for (const place of places)
    for (const visit of place.visits)
      if (visit.dateISO === dateISO) raw.push({ place, visit });
  if (!raw.length) return null;

  raw.sort(
    (a, b) =>
      placedAt(a.visit) - placedAt(b.visit) ||
      a.visit.sheetId - b.visit.sheetId ||
      a.visit.rowId - b.visit.rowId
  );

  // Two stops in a row at the same place are one: the hand-over between
  // sheets writes the second sheet's arrival at the place the first left open.
  const merged: Raw[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && last.place.placeKey === r.place.placeKey) {
      const a = last.visit;
      const b = r.visit;
      const start = a.startMinutes ?? b.startMinutes;
      const end = b.endMinutes ?? a.endMinutes;
      const endOffset = b.endMinutes !== null ? b.endDayOffset : a.endDayOffset;
      const dwell =
        start !== null && end !== null ? end + endOffset * 1440 - start : null;
      last.visit = {
        ...a,
        startMinutes: start,
        endMinutes: end,
        endDayOffset: endOffset,
        dwellMinutes: dwell !== null && dwell >= 0 ? dwell : null,
      };
      continue;
    }
    merged.push({ place: r.place, visit: { ...r.visit } });
  }

  const pinOf = new Map<string, string>();
  const placesInOrder: DayRoute["places"] = [];
  const timesAt = new Map<string, number>();
  const stops: RouteStop[] = merged.map(({ place, visit }, i) => {
    if (!pinOf.has(place.placeKey)) {
      const pin = pinLabel(pinOf.size);
      pinOf.set(place.placeKey, pin);
      placesInOrder.push({
        pin,
        placeKey: place.placeKey,
        name: place.name,
        kind: place.kind,
      });
    }
    const visitNo = (timesAt.get(place.placeKey) ?? 0) + 1;
    timesAt.set(place.placeKey, visitNo);
    return {
      n: i + 1,
      placeKey: place.placeKey,
      name: place.name,
      kind: place.kind,
      pin: pinOf.get(place.placeKey) ?? "",
      visitNo,
      startMinutes: visit.startMinutes,
      endMinutes: visit.endMinutes,
      endDayOffset: visit.endDayOffset,
      dwellMinutes: visit.dwellMinutes,
      rowId: visit.rowId,
      sheetId: visit.sheetId,
      sheetTitle: visit.sheetTitle,
    };
  });

  const legs: RouteLeg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    if (from.endMinutes === null || to.startMinutes === null) {
      legs.push({ kind: "unknown" });
      continue;
    }
    const left = from.endMinutes + from.endDayOffset * 1440;
    const minutes = to.startMinutes - left;
    if (minutes < 0) legs.push({ kind: "unknown" });
    else if (minutes >= GAP_MINUTES)
      legs.push({
        kind: "gap",
        minutes,
        fromMinutes: from.endMinutes,
        toMinutes: to.startMinutes,
      });
    else legs.push({ kind: "travel", minutes });
  }

  return {
    dateISO,
    stops,
    legs,
    places: placesInOrder,
    stats: {
      stops: stops.length,
      places: placesInOrder.length,
      returns: stops.length - placesInOrder.length,
      minutesAtPlaces: stops.reduce((s, x) => s + (x.dwellMinutes ?? 0), 0),
      gaps: legs.filter(l => l.kind === "gap").length,
    },
  };
}

/** The days a target has visits on, newest first, with how many stops each. */
export function routeDays(
  places: readonly DayRoutePlace[]
): { dateISO: string; stops: number }[] {
  const counts = new Map<string, number>();
  for (const p of places)
    for (const v of p.visits)
      counts.set(v.dateISO, (counts.get(v.dateISO) ?? 0) + 1);
  return Array.from(counts, ([dateISO, stops]) => ({ dateISO, stops })).sort(
    (a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0)
  );
}

/** "06:42 to 07:18", "06:42 (no departure logged)", "left 07:18". */
export function stopTimes(s: RouteStop): string {
  const end =
    s.endMinutes !== null
      ? formatClock(s.endMinutes) +
        (s.endDayOffset > 0 ? ` +${s.endDayOffset}` : "")
      : null;
  if (s.startMinutes !== null && end) {
    return `${formatClock(s.startMinutes)} to ${end}`;
  }
  if (s.startMinutes !== null)
    return `${formatClock(s.startMinutes)} (no departure logged)`;
  return `left ${end ?? ""}`.trim();
}

/** The line shown between two stops. */
export function legText(leg: RouteLeg): string {
  if (leg.kind === "travel")
    return `${formatDwell(leg.minutes)} between places`;
  if (leg.kind === "gap")
    return `No rows for ${formatDwell(leg.minutes)} (${formatClock(leg.fromMinutes)} to ${formatClock(leg.toMinutes)})`;
  return "No departure logged, so the time between is not known";
}

/** The lat/lng pairs a map line joins, in order — only stops with a position.
 * `gap` marks a leg whose line is drawn in the gap colour. */
export function routeSegments(
  route: DayRoute,
  at: (placeKey: string) => { lat: number; lng: number } | null | undefined
): {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  gap: boolean;
}[] {
  const out: ReturnType<typeof routeSegments> = [];
  for (let i = 0; i < route.legs.length; i++) {
    const a = at(route.stops[i].placeKey);
    const b = at(route.stops[i + 1].placeKey);
    if (!a || !b) continue;
    // A leg between two stops at the same spot is no line at all.
    if (a.lat === b.lat && a.lng === b.lng) continue;
    out.push({ from: a, to: b, gap: route.legs[i].kind !== "travel" });
  }
  return out;
}

/** The red used for the target's pins and travel lines everywhere (the PDF
 * exports and the map popup write the same hex), and the gap colour. */
export const ROUTE_RED = "#dc2626";
export const ROUTE_GAP = "#b45309";

/**
 * What to ask Google's static map for: one pin per distinct place that has a
 * position, a red line for each leg that is plain travel and an amber one for
 * a leg no row covers. A map with one place has no points to fit to, so it is
 * given a centre and a street-level zoom. Null when no place has a position.
 */
export function staticMapInput(
  route: DayRoute,
  at: (placeKey: string) => { lat: number; lng: number } | null | undefined
): {
  waypoints: {
    lat: number;
    lng: number;
    index: number;
    colour: string;
    label?: string;
  }[];
  paths: { colour: string; points: { lat: number; lng: number }[] }[];
  center?: { lat: number; lng: number };
  zoom?: number;
} | null {
  const waypoints = route.places.flatMap((p, index) => {
    const pos = at(p.placeKey);
    return pos
      ? [
          {
            lat: pos.lat,
            lng: pos.lng,
            index,
            colour: ROUTE_RED,
            ...(p.pin ? { label: p.pin } : {}),
          },
        ]
      : [];
  });
  if (!waypoints.length) return null;
  const paths = routeSegments(route, at).map(s => ({
    colour: s.gap ? ROUTE_GAP : ROUTE_RED,
    points: [s.from, s.to],
  }));
  const spots = new Set(waypoints.map(w => `${w.lat},${w.lng}`));
  return {
    waypoints,
    paths,
    ...(spots.size === 1
      ? { center: { lat: waypoints[0].lat, lng: waypoints[0].lng }, zoom: 15 }
      : {}),
  };
}
