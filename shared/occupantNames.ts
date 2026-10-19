// Shared so the server-side continuity rules and the client chips read a
// vehicle's occupants the same way.

/** Best-effort strip of role descriptors ("driver", "front passenger",
 * "sole occupant", etc.) from a vehicle occupantDesc string (e.g. "HOGAN
 * driver, Denise HOLLY (HOLLY) front passenger") down to just the names
 * ("HOGAN and Denise HOLLY (HOLLY)") — used to pre-fill a "Walked in" chip's
 * names from the vehicle's known occupants. Deliberately best-effort rather
 * than a strict parser: the officer reviews and edits the inserted text
 * before submitting either way, same trust level the occupantDesc text
 * itself already has (it's reused verbatim elsewhere with no validation),
 * so an imperfect strip here is a minor edit, not a silent wrong fact in
 * the record. Shared by the RS Quick Entry map popup and the full sheet
 * table's own continuity chips. */
export function extractOccupantNames(occupantDesc: string): string {
  // Role words mark where one person ends and the next begins, so officers
  // who leave out the commas ("BAIG driver UM1 front passenger and JOHNSON
  // rear passenger") still get separate people.
  const ROLE_WORD =
    /\b(?:driver|front passenger|rear passenger|back passenger|sole occupant|unseen\s+occupants?(?:\/s)?|occupant(?:\/s|s)?\s+(?:not\s+(?:observed|seen)|unseen)|passenger)\b/gi;
  return occupantDesc
    .replace(ROLE_WORD, ",")
    .split(/\s*,\s*|\s*\band\b\s*/i)
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" and ");
}
