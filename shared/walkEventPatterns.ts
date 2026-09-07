// Canonical "walked" narrative patterns for the on-foot mirror of the
// vehicle depart/arrive continuity feature (see vehicleEventPatterns.ts)
// — see server/db.ts's "Walk-In → Walk-Out Continuity" section, the
// authoritative user of these for building RS Quick Entry chips.
//
// Officers exit a parked vehicle, walk on foot to a location, then later
// walk back to the same vehicle. Deliberately scoped to vehicle <-> location
// only (not location <-> location) — see the "Walked in"/"Walked out" chips
// in IntelligenceMapping.tsx, which cross-reference the existing vehicle
// arrival/departure state to know which vehicle a walk-out leads back to.
//
// Both patterns tolerate commas being present or absent around each clause
// (",?\s*") rather than requiring one exact punctuation style — unlike the
// vehicle patterns, there's no normalizeObservationPunctuation pass backing
// these up, and real examples of this narrative have appeared with
// inconsistent comma placement even from the same officer.
//
// WALK_IN_PATTERN's first group captures who's walking (e.g. "KENNEDY and
// JOHNS"), anchored to not cross a "." or newline — this keeps it from
// reaching back into an earlier sentence in the same row (e.g. the vehicle
// arrival narrative that typically precedes it) while still tolerating
// free-text names of any length. getPendingWalkIns reuses this captured
// text verbatim for the "Walked out" chip, on the same names-reuse basis
// VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN already reuses occupantDesc.
export const WALK_IN_PATTERN =
  /([A-Za-z][^.\n]*?)\s*exited the vehicle,?\s*walked\s+(.+?),?\s*entered\s+(.+?)\s+and continued out of sight/i;

// Alternate walk-in phrasing with no separate "entered <location>" clause —
// the destination is folded straight into the route text instead ("...
// walked towards 45 Francis Street and continued out of sight."). This is a
// real, standard narrative officers write at least as often as the
// "entered <location>" form, but WALK_IN_PATTERN requires that clause
// literally and simply never matches this shape — the row silently never
// registers as a pending walk-in, so no "Walked out" chip is ever offered
// for it. getPendingWalkIns tries WALK_IN_PATTERN first and only falls back
// to this one when that doesn't match, so there's no double-matching.
// Route/destination isn't cleanly separable here (there's no anchor clause
// like "entered" to split on), so extractWalkInTowardsLocation below does
// its own best-effort split off the single captured route clause.
export const WALK_IN_TOWARDS_PATTERN =
  /([A-Za-z][^.\n]*?)\s*exited the vehicle,?\s*walked\s+(.+?)\s+and continued out of sight/i;

// Best-effort destination extraction from a WALK_IN_TOWARDS_PATTERN route
// clause — e.g. "towards 45 Francis Street" -> "45 Francis Street",
// "across the road towards the residence at 18 Pepperbush Road" ->
// "18 Pepperbush Road". The destination always comes after the LAST
// "towards" in the clause, so strip up to and including that, then drop a
// leading "the residence at " if the officer added one. Falls back to the
// whole clause when there's no "towards" at all — same trust level as
// extractOccupantNames in IntelligenceMapping.tsx: worst case the address
// match later doesn't line up and the chip just doesn't appear, it never
// inserts anything wrong into the record.
export function extractWalkInTowardsLocation(route: string): string {
  const towardsMatch = route.match(/towards\s+(.+)$/i);
  const location = towardsMatch ? towardsMatch[1] : route;
  return location.replace(/^the residence at\s+/i, "").trim();
}

// Canonical form is "... exited <location> and walked <route> towards
// Vehicle <rego>." — also still matches the older "... exited <location>,
// walked <route>, to Vehicle <rego>." phrasing (comma-separated, "to"
// instead of "towards", no "and") so rows written before this wording was
// standardised keep matching. Don't retire that half without checking
// existing sheets first — this is a legal record, not just app state.
export const WALK_OUT_PATTERN =
  /exited\s+(.+?)\s*,?\s*(?:and\s+)?walked\s+(.+?)\s*,?\s*(?:to|towards)\s+Vehicle\s+([A-Za-z0-9]{5,8})/i;
