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
export const WALK_IN_PATTERN =
  /exited the vehicle,?\s*walked\s+(.+?),?\s*entered\s+(.+?)\s+and continued out of sight/i;
export const WALK_OUT_PATTERN =
  /exited\s+(.+?),?\s*walked\s+(.+?),?\s*to Vehicle\s+([A-Za-z0-9]{5,8})/i;
