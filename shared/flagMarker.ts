// Which marker the Target location flag goes on when more than one marker
// matches the place — a parked car and a boat that both resolve to
// "15 Riverside Road", say. The place alone can't tell them apart, so the
// flag goes on the *most specific* marker the sheet actually points at:
//
//   1. the marker of the vehicle he got out of / is in (its label holds the
//      rego — shared/vehicleMarker.ts);
//   2. the marker of the boat he is on (a boat icon);
//   3. otherwise a marker of the right kind for what he is doing: a vehicle
//      marker when he is in a vehicle, a place marker (house, point of
//      interest) when he is inside or on foot, a boat marker on a vessel;
//   4. still more than one → the newest, and the caller says so ("2 markers
//      at this address") instead of silently picking one.
//
// Deterministic: no lookups, no AI.
import { findVehicleMarker } from "./vehicleMarker";

export interface FlagMarkerCandidate {
  id: number;
  lat: number;
  lng: number;
  label: string | null;
  address: string | null;
  /** The marker's icon key (markerIcon), e.g. "sedan", "boat", "house_filled". */
  icon: string | null;
  operationId: number | null;
}

export type MarkerKind = "vehicle" | "boat" | "place";

const BOAT_RE =
  /boat|vessel|vessell|yacht|ship|ferry|dinghy|catamaran|jet.?ski|kayak|canoe/i;
const VEHICLE_RE =
  /sedan|car|police|motorbike|motorcycle|bike|truck|van|ute|suv|4wd|wagon|vehicle|bus|train|tram|taxi|cab|rideshare/i;

/** What a marker stands for, from its icon (and label as a backup). */
export function markerKind(
  icon: string | null,
  label: string | null = null
): MarkerKind {
  const i = icon ?? "";
  if (BOAT_RE.test(i)) return "boat";
  if (VEHICLE_RE.test(i)) return "vehicle";
  // No telling icon: a label that is only a rego is a vehicle marker.
  if (
    label &&
    /^[A-Za-z0-9 -]{5,10}$/.test(label) &&
    /\d/.test(label) &&
    /[A-Za-z]/.test(label)
  )
    return "vehicle";
  return "place";
}

export interface FlagWant {
  /** The target state: "inside", "walking", "vehicle", "moving", "oos", "vessel", "transit". */
  state: string;
  /** The vehicle he is in, or just got out of. */
  rego?: string;
  operationId?: number | null;
}

export interface FlagMarkerChoice {
  marker: FlagMarkerCandidate;
  /** Why this one: its rego, a boat icon, the right kind, or the only one. */
  why: "rego" | "boat" | "kind" | "only" | "newest";
  /** More than one marker was still equally good — the newest was taken. */
  ambiguous: boolean;
}

const preferredKind = (state: string): MarkerKind =>
  state === "vessel"
    ? "boat"
    : state === "vehicle" || state === "moving" || state === "oos"
      ? "vehicle"
      : "place";

/** Pick the marker for the flag from `candidates` (all already matching the
 * place, newest first). Null when there are none. */
export function chooseFlagMarker(
  candidates: FlagMarkerCandidate[],
  want: FlagWant
): FlagMarkerChoice | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1)
    return { marker: candidates[0], why: "only", ambiguous: false };

  if (want.rego) {
    const hit = findVehicleMarker(
      candidates,
      want.rego,
      want.operationId ?? null
    );
    const m = hit && candidates.find(c => c.id === hit.id);
    if (m) return { marker: m, why: "rego", ambiguous: false };
  }

  const kind = preferredKind(want.state);
  const ofKind = candidates.filter(c => markerKind(c.icon, c.label) === kind);
  if (ofKind.length > 0)
    return {
      marker: ofKind[0],
      why: kind === "boat" ? "boat" : "kind",
      ambiguous: ofKind.length > 1,
    };
  return { marker: candidates[0], why: "newest", ambiguous: true };
}

/** Whether a marker of `kind` can be where the target is in `state`. A boat
 * marker is never where someone in or walking to a car is, and a car marker is
 * never where someone on a boat is — even when it is the only marker carrying
 * the place. */
export function markerFitsState(kind: MarkerKind, state: string): boolean {
  if (state === "vessel") return kind !== "vehicle";
  // On a bus or train: the stop or station (a place), or the bus itself (a
  // vehicle marker) — never a boat.
  return kind !== "boat";
}
