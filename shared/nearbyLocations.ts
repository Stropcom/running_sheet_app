/**
 * NEARBY LOCATION (Map page, right-hand pane): every Intelligence Folder /
 * Target Registry location within 500 m of where the officer is, drawn as a
 * diamond with its distance, so nobody stops or parks near another location
 * without knowing. Pure helpers — the geometry and the rules — so they are
 * testable and the page only does the drawing.
 */

/** How far out the feature looks. */
export const NEARBY_RADIUS_M = 500;
/** Own position changes smaller than this don't redraw anything. */
export const NEARBY_MOVE_THRESHOLD_M = 10;
/** An observed / associate location this close to a target address is shown
 * on that address's pin, same as the normal pins do. */
export const NEARBY_MERGE_RADIUS_M = 20;

/** Colours of the distance band on a diamond and its pill. */
export const NEARBY_BAND_COLOURS = {
  close: "#dc2626", // 100 m or less
  mid: "#d97706", // up to 250 m
  far: "#0284c7", // up to 500 m
} as const;
export type NearbyBand = keyof typeof NEARBY_BAND_COLOURS;

export function distanceBand(metres: number): NearbyBand {
  if (metres <= 100) return "close";
  if (metres <= 250) return "mid";
  return "far";
}

/** Great-circle distance in metres. */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The shortest label for a distance: "42 m", "120 m", "480 m". */
export function formatNearbyDistance(metres: number): string {
  return `${Math.round(metres)} m`;
}

/** Items within `radius` of `centre`, nearest first, each with its distance. */
export function locationsWithin<T extends { lat: number; lng: number }>(
  items: readonly T[],
  centre: { lat: number; lng: number },
  radius: number = NEARBY_RADIUS_M
): Array<T & { distance: number }> {
  const out: Array<T & { distance: number }> = [];
  for (const item of items) {
    const distance = distanceMetres(centre.lat, centre.lng, item.lat, item.lng);
    if (distance <= radius) out.push({ ...item, distance });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/** True when a new GPS fix is far enough from the last one to redraw. */
export function movedEnough(
  prev: { lat: number; lng: number } | null,
  next: { lat: number; lng: number },
  threshold: number = NEARBY_MOVE_THRESHOLD_M
): boolean {
  if (!prev) return true;
  return distanceMetres(prev.lat, prev.lng, next.lat, next.lng) >= threshold;
}

/** What folding needs from a location (the Map page's IntelMapLocation). */
export interface FoldableLocation {
  label: string;
  type: "target_address" | "associate_address" | "observation";
  lat: number;
  lng: number;
  assocPersons: string[];
  assocVehicles: string[];
  linkedTargets: Array<{ targetId: number }>;
  linkCount: number;
  secondaryLocs?: unknown[];
}

/**
 * The same folding the normal pins do: an observed or associate location
 * within NEARBY_MERGE_RADIUS_M of a target address is not a pin of its own —
 * its people, vehicles and targets are added to the target address's popup
 * and it is listed under it. Returns new objects; the inputs are not changed.
 */
export function foldIntoTargetAddresses<T extends FoldableLocation>(
  locations: readonly T[]
): T[] {
  const targets: T[] = locations
    .filter(l => l.type === "target_address")
    .map(l => ({
      ...l,
      assocPersons: [...l.assocPersons],
      assocVehicles: [...l.assocVehicles],
      linkedTargets: [...l.linkedTargets],
      secondaryLocs: [...(l.secondaryLocs ?? [])],
    }));
  const rest: T[] = [];
  for (const l of locations) {
    if (l.type === "target_address") continue;
    const home = targets.find(
      t => distanceMetres(t.lat, t.lng, l.lat, l.lng) <= NEARBY_MERGE_RADIUS_M
    );
    if (!home) {
      rest.push(l);
      continue;
    }
    for (const p of l.assocPersons)
      if (!home.assocPersons.includes(p)) home.assocPersons.push(p);
    for (const v of l.assocVehicles)
      if (!home.assocVehicles.includes(v)) home.assocVehicles.push(v);
    for (const t of l.linkedTargets)
      if (!home.linkedTargets.some(x => x.targetId === t.targetId))
        home.linkedTargets.push(t);
    (home.secondaryLocs as unknown[]).push(l);
    home.linkCount =
      home.linkedTargets.length +
      home.assocPersons.length +
      home.assocVehicles.length;
  }
  return [...targets, ...rest];
}
