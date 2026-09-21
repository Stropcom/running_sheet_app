// Canonical "Vehicle <rego> ..." narrative patterns used to mine
// depart/arrive continuity — see server/db.ts's "Vehicle Depart → Arrive
// Continuity" section, the authoritative user of these for building chips.
// Kept here rather than duplicated inline so there's a single definition.

// Officers sometimes put a comma directly after the rego ("Vehicle 1FAD531,
// HOGAN driver...") and sometimes don't ("Vehicle 1FAD531 HOGAN driver...") —
// the ",?\s*" after the rego capture tolerates either.
//
// "Departed", "reversed", and "exited" are all written as the departure
// verb in practice ("...departed X and continued via:" / "...reversed
// from the driveway of X and continued via:" / "...exited X and continued
// via:"). Unlike the arrival side's VEHICLE_ARRIVE_VIA_TRAVEL_PATTERN, this
// still requires the comma to sit directly before the verb rather than
// tolerating an intervening travel clause — no real example of that shape
// has come up for departures yet, so it hasn't been built; extend the same
// way if one does. Note "exited" here means the VEHICLE departing a
// location, distinct from WALK_IN_PATTERN's "NAME exited the vehicle"
// (a person on foot) — the two can't cross-match since this pattern
// requires a leading "Vehicle REGO" and WALK_IN_PATTERN's "exited" is
// never preceded by a comma, but keep that distinction in mind if either
// pattern's shape changes.
export const VEHICLE_DEPART_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*(?:departed|reversed|exited)\b/i;

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
// arrived/parked/stopped at X", or with a modifier before the verb itself
// ("...and street parked in the vicinity of X") — rather than going
// straight from occupants to the arrival verb. VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN's
// occupant group would swallow that whole travel clause as part of
// "occupants" once normalizeObservationPunctuation inserts its guaranteed
// comma before the verb (since the nearest comma-before-verb is now AFTER
// the travel narrative, not before it) — this pattern anchors on the word
// "travelled" itself instead, which an occupant description never
// contains, so the occupant group correctly stops there regardless of what
// the travel clause says or how it's punctuated. Deliberately doesn't
// require "and" (or anything else) to sit directly before the verb — the
// lazy `.*?` already stops at the first arrival verb it finds after
// "travelled", so any wording in between ("and", "and then", "and street",
// a save-time-inserted comma, ...) is tolerated without needing to be
// enumerated.
export const VEHICLE_ARRIVE_VIA_TRAVEL_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*travelled\b.*?\b(?:arrived|parked|stopped)\b/i;

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

// "...parked and unattended in the driveway at X" describes a vehicle an
// officer simply found already present — nobody was observed arriving in
// it, so there's no continuity to track: no "Vehicle departing" or "Walked
// in" chip should be offered off the back of it. Checked once, up front in
// matchVehicleArrival below, rather than per-pattern, since any of the
// three arrival shapes there could in principle be followed by this
// wording. "Unattended" alone (without also requiring "parked" right next
// to it) is deliberately the whole trigger — an officer only ever writes
// it to mean exactly this, and requiring it be adjacent to "parked" would
// miss "parked, unattended, in the driveway" and similar minor rewordings.
const UNATTENDED_RE = /\bunattended\b/i;

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
  if (UNATTENDED_RE.test(text)) return null;
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

// Connector phrases officers write between the arrival verb and the actual
// address ("parked in the vicinity of X", "stopped near X", "parked
// outside X") — stripped the same way WALK_IN_LOCATION_PREFIX_RE
// (shared/walkEventPatterns.ts) strips them for a walk-in destination;
// keep the two lists in sync by hand if either gains a new phrase, same
// convention as this codebase's other small maintained word lists (see
// STREET_TYPE_WORDS in mentionAutocomplete.ts). "at" is included here
// (walk-in's list doesn't need it, since that one anchors on "towards"
// instead) since "arrived/parked/stopped at X" is the single most common
// phrasing and needs to be recognised as a connector too, not just the
// less common ones.
const ARRIVAL_LOCATION_CONNECTORS =
  "(?:at|in\\s+the\\s+vicinity\\s+of|the\\s+vicinity\\s+of|near|outside(?:\\s+of)?|the\\s+(?:front(?:\\s+door)?|back|rear|side)\\s+of|the\\s+door\\s+of|the\\s+entrance\\s+of|the\\s+residence\\s+at)";
// Requires the verb and a connector to sit directly together — a bare
// "arrived|parked|stopped" elsewhere in the text (e.g. the car-park
// shape's own "...and parked in a car bay", where "in a car bay" isn't a
// real address at all) must NOT be treated as introducing a location just
// because one of these three words appears nearby.
const VERB_WITH_LOCATION_CONNECTOR_RE = new RegExp(
  `\\b(?:arrived|parked|stopped)\\s+${ARRIVAL_LOCATION_CONNECTORS}\\s+`,
  "i"
);
const LEADING_LOCATION_CONNECTOR_RE = new RegExp(
  `^${ARRIVAL_LOCATION_CONNECTORS}\\s+`,
  "i"
);

// Captures the address an arrival text names — prefers the canonical
// bracketed short-form if it includes one (a first mention of that
// address), otherwise falls back to the plain text straight after the
// arrival verb and whatever connector phrase follows it (a later,
// short-form-only mention). Used so the "Vehicle departing" chip (and the
// "Walked in" chip, client-side, against in-progress draft text) only
// offer themselves back at the exact location a vehicle is known to have
// arrived at.
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
  const verbMatch = text.match(VERB_WITH_LOCATION_CONNECTOR_RE);
  if (verbMatch && verbMatch.index !== undefined) {
    let rest = text.slice(verbMatch.index + verbMatch[0].length);
    let stripped: string;
    while (
      (stripped = rest.replace(LEADING_LOCATION_CONNECTOR_RE, "")) !== rest
    ) {
      rest = stripped;
    }
    const bracket = rest.match(/\(([^)]{1,80})\)/);
    if (bracket) return bracket[1].trim();
    const afterConnector = rest.match(/^(.+?)(?:\s+and\s+\w+|[.\n]|$)/i);
    if (afterConnector && afterConnector[1].trim()) {
      return afterConnector[1].trim();
    }
  }
  // Fallback: the "travelled through the car park of X and parked" shape
  // (see VEHICLE_ARRIVE_VIA_CARPARK_PATTERN) has no "<verb> ... X" clause
  // to anchor on at all — the address sits inside the "car park of" clause
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
