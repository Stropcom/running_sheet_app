import { type LiveUser } from "./mapTypes";

// ── Helpers ────────────────────────────────────────────────────────────────────
// Pin colour comes from the person's team (User Management → Teams); anyone
// without a team is grey.
export const NO_TEAM_PIN_COLOUR = "#6b7280"; // grey for unassigned

// Investigator accounts have no team (they aren't a surveillance team
// member), so they'd otherwise fall through to the generic "unassigned" grey
// above — deliberately darker instead, so their pin still reads as a
// distinct, recognised category rather than looking like a misconfigured
// account.
export const INVESTIGATOR_PIN_COLOUR = "#374151"; // dark grey

/** Key a live user's team goes by in the hide/collapse sets ("null" = none). */
export function teamKeyOf(u: { teamId: number | null }): string {
  return u.teamId != null ? String(u.teamId) : "null";
}

export function getTeamColour(
  u: { teamColour: string | null } | null,
  role?: LiveUser["role"]
): string {
  if (role === "investigator") return INVESTIGATOR_PIN_COLOUR;
  return u?.teamColour ?? NO_TEAM_PIN_COLOUR;
}

// Live team pin — directional "sonar" ring cadence + reach once a member
// is travelling over 80 km/h (see createUserPinElement). Faster tiers
// pulse quicker (durationMs, via teamPinSonarRing's animation-duration)
// AND reach further (maxSizePx, via its --sonar-max-size custom property,
// see index.css) — the pill's own position is always a second or two
// behind the vehicle's real one, so a longer reach at higher speed gives
// other officers a rough sense of how far ahead of the pin the vehicle
// actually is. Below 80 km/h no rings show at all. Ring shape/colour never
// changes, only these two numbers.
export const HIGH_SPEED_RING_TIERS: Array<{
  minKmh: number;
  durationMs: number;
  maxSizePx: number;
}> = [
  { minKmh: 120, durationMs: 1500, maxSizePx: 90 },
  { minKmh: 100, durationMs: 2000, maxSizePx: 74 },
  { minKmh: 80, durationMs: 2600, maxSizePx: 58 },
];

export function getSonarRingTier(
  speedKmh: number
): { durationMs: number; maxSizePx: number } | null {
  const tier = HIGH_SPEED_RING_TIERS.find(t => speedKmh >= t.minKmh);
  return tier
    ? { durationMs: tier.durationMs, maxSizePx: tier.maxSizePx }
    : null;
}

// Alternate heading shapes for the Wheels-mode indicator (pinVehicleIcon),
// on top of the default "arrow" — see the "Heading Shape Ideas" artifact
// these were picked from. The SVG shapes are drawn pointing straight up
// already, matching "arrow"'s own polygon convention, so they need no
// offset. The emoji glyphs aren't all drawn pointing up by default in every
// font (a rocket/plane point diagonally, a pizza slice's tip is off to one
// side), so this corrects each one before the live heading rotation is
// applied on top of it — same fixed-offset-then-rotate approach the
// artifact demo used, confirmed against it directly rather than guessed.
export const HEADING_SHAPE_ROTATION_OFFSET_DEG: Partial<
  Record<LiveUser["pinVehicleIcon"], number>
> = {
  rocket: 45,
  airplane: 45,
  pizza: -135,
};

export const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#181818" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1b1b1b" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#2c2c2c" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a8a" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#373737" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3c3c3c" }],
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry",
    stylers: [{ color: "#4e4e4e" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
];
