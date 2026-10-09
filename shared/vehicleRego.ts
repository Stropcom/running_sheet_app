// What a vehicle registration looks like inside free text. One definition, so
// the server's vehicle matching (server/db.ts) and the client's tracked-target
// rule (shared/trackedTarget.ts) can never read a plate differently.
//
// 4 to 10 contiguous letters/digits with at least one of each. An earlier,
// narrower pattern only recognised the current WA standard ("1ABC234") and one
// older shape ("ABC123"), and silently extracted nothing from a differently
// shaped plate (an 8-character rego fell through both alternatives, since a
// contiguous alnum run only has word boundaries at its outer edges).
export const VEHICLE_REGO_PATTERN =
  /\b(?=[A-Za-z0-9]{4,10}\b)(?=[A-Za-z0-9]*[0-9])(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{4,10}\b/;

/** The registration in `text`, upper-cased, or null. */
export function regoIn(text: string | null | undefined): string | null {
  const m = (text ?? "").match(VEHICLE_REGO_PATTERN);
  return m ? m[0].toUpperCase() : null;
}
