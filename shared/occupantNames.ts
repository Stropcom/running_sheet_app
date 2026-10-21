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
/** The occupants text with any bracket, comma or semicolon left at its front
 * removed. The departure / arrival patterns read the occupants as whatever
 * sits between the rego and the verb, so "… (Vehicle TAXI2345), departed X"
 * (the people named earlier in the sentence, nothing between the bracket and
 * the verb) captures just ")" — which must never reach a card or a flag. */
export function cleanOccupantDesc(desc: string): string {
  return (desc ?? "").replace(/^[\s),;]+/, "").trim();
}

export function extractOccupantNames(occupantDesc: string): string {
  // Role words mark where one person ends and the next begins, so officers
  // who leave out the commas ("BAIG driver UM1 front passenger and JOHNSON
  // rear passenger") still get separate people.
  const ROLE_WORD =
    /\b(?:driver|front passenger|rear passenger|back passenger|sole occupant|unseen\s+occupants?(?:\/s)?|occupant(?:\/s|s)?\s+(?:not\s+(?:observed|seen)|unseen)|passenger)\b/gi;
  return (
    occupantDesc
      .replace(ROLE_WORD, ",")
      .split(/\s*,\s*|\s*\band\b\s*/i)
      .map(part => part.replace(/\s+/g, " ").trim())
      // A stray ")" or the like is not a person.
      .filter(part => /[A-Za-z0-9]/.test(part))
      .join(" and ")
  );
}
