// Canonical "Vehicle <rego> ..." narrative patterns used to mine
// depart/arrive continuity — see server/db.ts's "Vehicle Depart → Arrive
// Continuity" section, which is the authoritative user of these for
// building chips. Kept here (not duplicated) so the client-side "couldn't
// parse this as a vehicle event" hint (SheetDetail.tsx) checks against the
// exact same patterns server/db.ts uses — the hint and the real chip
// mining can never drift apart.

// Officers sometimes put a comma directly after the rego ("Vehicle 1FAD531,
// HOGAN driver...") and sometimes don't ("Vehicle 1FAD531 HOGAN driver...") —
// the ",?\s*" after the rego capture tolerates either.
export const VEHICLE_DEPART_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*departed\b/i;
export const VEHICLE_ARRIVE_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8})\b.*?\barrived\b/i;
export const VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*arrived\b/i;

// Loose heuristic, for the hint only — never used to mine data, only to
// flag a row for a human to look at. Mentions "Vehicle <rego>" AND some
// movement word, without matching any of the three strict patterns above.
// Deliberately broad: a false positive just shows a dismissible hint, a
// false negative silently shows nothing (today's behaviour), so this errs
// toward catching more phrasing rather than less.
const VEHICLE_MENTION_PATTERN = /\bVehicle\s+[A-Za-z0-9]{5,8}\b/i;
const MOVEMENT_KEYWORD_PATTERN =
  /\b(departed|arrived|left|revers\w*|pulled\s+(?:out|up|away|in)|drove\s+(?:off|away|up|in|out)|driven\s+off|backed\s+(?:out|into|up)|moved\s+off|took\s+off|parked\s+(?:up|outside|in|at|on)|returned|headed\s+off|sped\s+off|accelerated\s+away)\b/i;

export function looksLikeUnparsedVehicleEvent(
  observation: string | null | undefined
): boolean {
  if (!observation) return false;
  if (!VEHICLE_MENTION_PATTERN.test(observation)) return false;
  if (!MOVEMENT_KEYWORD_PATTERN.test(observation)) return false;
  return (
    !VEHICLE_DEPART_PATTERN.test(observation) &&
    !VEHICLE_ARRIVE_PATTERN.test(observation) &&
    !VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN.test(observation)
  );
}
