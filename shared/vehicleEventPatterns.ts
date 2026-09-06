// Canonical "Vehicle <rego> ..." narrative patterns used to mine
// depart/arrive continuity — see server/db.ts's "Vehicle Depart → Arrive
// Continuity" section, the authoritative user of these for building chips.
// Kept here rather than duplicated inline so there's a single definition.

// Officers sometimes put a comma directly after the rego ("Vehicle 1FAD531,
// HOGAN driver...") and sometimes don't ("Vehicle 1FAD531 HOGAN driver...") —
// the ",?\s*" after the rego capture tolerates either.
export const VEHICLE_DEPART_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*departed\b/i;
export const VEHICLE_ARRIVE_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8})\b.*?\barrived\b/i;
export const VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*arrived\b/i;

// Captures the address an "arrived" text names — prefers the canonical
// bracketed short-form if it includes one (a first mention of that
// address), otherwise falls back to the plain text straight after "arrived
// at" (a later, short-form-only mention). Used so the "Vehicle departing"
// chip (and the "Walked in" chip, client-side, against in-progress draft
// text) only offer themselves back at the exact location a vehicle is
// known to have arrived at.
//
// Both the bracket search and the plain-text fallback are scoped to the
// text FROM "arrived at" onward, not the whole string — the occupant
// description right before "arrived at" often carries its own bracket code
// for a newly-introduced person (e.g. "Denise HOLLY (HOLLY) front
// passenger, arrived at Bicton Tavern, 1 Point Walter Road, BICTON WA
// (Bicton Tavern)"). Searching the whole string for the first "(...)"
// grabbed that person's bracket instead of the address's own trailing one,
// silently returning the wrong (and usually non-matching) "address" — a
// business is a first-mention (full-form, bracketed) address far more
// often than an already-established residential one, so this showed up
// almost exclusively as "the departing chip doesn't work for businesses".
export function extractArrivalAddress(text: string): string | null {
  const arrivedAtIdx = text.search(/arrived at\s+/i);
  const searchText = arrivedAtIdx >= 0 ? text.slice(arrivedAtIdx) : text;
  const bracket = searchText.match(/\(([^)]{1,80})\)/);
  if (bracket) return bracket[1].trim();
  const afterArrived = searchText.match(
    /arrived at\s+(.+?)(?:\s+and\s+\w+|[.\n]|$)/i
  );
  return afterArrived ? afterArrived[1].trim() : null;
}
