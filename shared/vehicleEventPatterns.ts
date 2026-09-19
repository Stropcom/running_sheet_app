// Canonical "Vehicle <rego> ..." narrative patterns used to mine
// depart/arrive continuity — see server/db.ts's "Vehicle Depart → Arrive
// Continuity" section, the authoritative user of these for building chips.
// Kept here rather than duplicated inline so there's a single definition.

// Officers sometimes put a comma directly after the rego ("Vehicle 1FAD531,
// HOGAN driver...") and sometimes don't ("Vehicle 1FAD531 HOGAN driver...") —
// the ",?\s*" after the rego capture tolerates either.
export const VEHICLE_DEPART_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*departed\b/i;

// "Arrived", "parked", and "stopped" are all written as the arrival verb in
// practice ("...arrived at X" / "...parked at X" / "...stopped at X") — the
// loose version below (rego + the verb appearing anywhere later) is only
// used to suppress an already-stale "Vehicle arriving" chip once a vehicle
// is known to have arrived somewhere by any of these wordings, so it
// deliberately doesn't care about occupants or a comma.
export const VEHICLE_ARRIVE_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8})\b.*?\b(?:arrived|parked|stopped)\b/i;

// The direct form — occupant description immediately followed by a comma
// and the arrival verb ("Vehicle REGO, occupants, arrived/parked/stopped").
// This is the shape the "Vehicle arriving" chip inserts verbatim, and
// normalizeObservationPunctuation (server/db.ts) guarantees the comma is
// present at save time even if the officer typed "and" there instead — see
// VEHICLE_ARRIVE_VIA_TRAVEL_PATTERN below for the case where that comma
// insertion would otherwise swallow an intervening travel narrative into
// the occupant description; matchVehicleArrival tries that pattern FIRST
// for exactly this reason.
export const VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*(?:arrived|parked|stopped)\b/i;

// Officers often narrate the route between the occupants and the arrival
// itself — "Vehicle REGO, occupants, travelled on Smith Street, PERTH and
// arrived/parked/stopped at X" — rather than going straight from occupants
// to the arrival verb. VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN's occupant
// group would swallow that whole travel clause as part of "occupants" once
// normalizeObservationPunctuation inserts its guaranteed comma before the
// verb (since the nearest comma-before-verb is now AFTER the travel
// narrative, not before it) — this pattern anchors on the word "travelled"
// itself instead, which an occupant description never contains, so the
// occupant group correctly stops there regardless of what the travel
// clause says or how it's punctuated. The optional comma between "and" and
// the verb ("and,?\s+") tolerates that same save-time comma insertion,
// which fires on the literal word "arrived" wherever it appears in the
// row, including right here.
export const VEHICLE_ARRIVE_VIA_TRAVEL_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*travelled\b.*?\band,?\s+(?:arrived|parked|stopped)\b/i;

// A second real-world variant of the travel narrative above: the vehicle
// travels through a location's car park and parks there directly, with no
// separate "arrived/parked/stopped at X" clause at all — "Vehicle REGO,
// occupants, travelled through the car park of X and parked in a car
// bay/car park." X sits inside the "car park of" clause instead of after
// an arrival verb, so this needs its own anchor ("travelled through the car
// park of") rather than reusing VEHICLE_ARRIVE_VIA_TRAVEL_PATTERN's "and
// arrived/parked/stopped" ending.
export const VEHICLE_ARRIVE_VIA_CARPARK_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*travelled\s+through\s+the\s+car\s+park\s+of\s+(.+?)\s+and\s+parked\b/i;

export interface VehicleArrivalMatch {
  rego: string;
  occupantDesc: string;
}

// Tries every recognised arrival narrative shape and returns the
// rego/occupants from whichever one matches — the single place that knows
// all the ways an arrival can be written, reused by both
// getPendingVehicleArrivals (server/db.ts, for SAVED rows) and the RS
// Quick Entry popup's own draft-text detection (IntelligenceMapping.tsx,
// for the row the officer is still typing) so the two never drift out of
// sync on what counts as "arrived".
//
// The two "travelled..." patterns are tried BEFORE the direct/generic
// pattern, not after — deliberately the more specific shapes first, since
// VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN's own comma-before-verb shape is
// technically satisfied by a "travelled" row too once
// normalizeObservationPunctuation's save-time comma insertion runs (it
// fires on the literal word "arrived" anywhere in the row), which would
// otherwise let the generic pattern win first and swallow the whole travel
// clause into "occupants".
export function matchVehicleArrival(text: string): VehicleArrivalMatch | null {
  const viaTravel = text.match(VEHICLE_ARRIVE_VIA_TRAVEL_PATTERN);
  if (viaTravel) {
    return {
      rego: viaTravel[1].toUpperCase(),
      occupantDesc: viaTravel[2].trim(),
    };
  }
  const viaCarPark = text.match(VEHICLE_ARRIVE_VIA_CARPARK_PATTERN);
  if (viaCarPark) {
    return {
      rego: viaCarPark[1].toUpperCase(),
      occupantDesc: viaCarPark[2].trim(),
    };
  }
  const direct = text.match(VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN);
  if (direct) {
    return { rego: direct[1].toUpperCase(), occupantDesc: direct[2].trim() };
  }
  return null;
}

// Captures the address an arrival text names — prefers the canonical
// bracketed short-form if it includes one (a first mention of that
// address), otherwise falls back to the plain text straight after the
// arrival verb + "at" (a later, short-form-only mention). Used so the
// "Vehicle departing" chip (and the "Walked in" chip, client-side, against
// in-progress draft text) only offer themselves back at the exact location
// a vehicle is known to have arrived at.
//
// Both the bracket search and the plain-text fallback are scoped to the
// text FROM the arrival verb onward, not the whole string — the occupant
// description right before it often carries its own bracket code for a
// newly-introduced person (e.g. "Denise HOLLY (HOLLY) front passenger,
// arrived at Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton
// Tavern)"). Searching the whole string for the first "(...)" grabbed that
// person's bracket instead of the address's own trailing one, silently
// returning the wrong (and usually non-matching) "address" — a business is
// a first-mention (full-form, bracketed) address far more often than an
// already-established residential one, so this showed up almost
// exclusively as "the departing chip doesn't work for businesses".
export function extractArrivalAddress(text: string): string | null {
  const verbAtIdx = text.search(/(?:arrived|parked|stopped)\s+at\s+/i);
  if (verbAtIdx >= 0) {
    const searchText = text.slice(verbAtIdx);
    const bracket = searchText.match(/\(([^)]{1,80})\)/);
    if (bracket) return bracket[1].trim();
    const afterVerb = searchText.match(
      /(?:arrived|parked|stopped)\s+at\s+(.+?)(?:\s+and\s+\w+|[.\n]|$)/i
    );
    if (afterVerb) return afterVerb[1].trim();
  }
  // Fallback: the "travelled through the car park of X and parked" shape
  // (see VEHICLE_ARRIVE_VIA_CARPARK_PATTERN) has no "<verb> at X" clause to
  // anchor on at all — the address sits inside the "car park of" clause
  // instead. The capture here is already tightly scoped to that clause
  // alone, so checking it for a bracket first (same first-mention rule as
  // above) is safe without the whole-string bracket-search bug this
  // function was originally written to avoid.
  const carParkMatch = text.match(
    /travelled\s+through\s+the\s+car\s+park\s+of\s+(.+?)\s+and\s+parked\b/i
  );
  if (carParkMatch) {
    const bracket = carParkMatch[1].match(/\(([^)]{1,80})\)/);
    return bracket ? bracket[1].trim() : carParkMatch[1].trim();
  }
  return null;
}
