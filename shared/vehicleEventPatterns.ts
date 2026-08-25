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
