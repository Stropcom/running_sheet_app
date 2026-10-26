/**
 * The fuller address to geocode for a place the running sheets name.
 *
 * An entity's short form is often just a place or business name ("Terminal 4",
 * "Balthazar") with no street or suburb, which the Geocoding API cannot place
 * on its own — it can land anywhere in the State. The free text written just
 * before the entity's bracket is "<street>, SUBURB STATE" when the officer gave
 * one, so that is what the Location profile and the Heat Map both geocode.
 * One rule here so the two can never disagree about where a place is.
 */

const SUBURB_STATE_RE =
  /,\s*[A-Za-z][\w\s]*?\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/;

/** The first description that carries a "<…>, SUBURB STATE" tail, trimmed, or
 * null when none does (the caller then geocodes the bare label as before). */
export function fullAddressForGeocode(
  fullDescriptions: readonly (string | null | undefined)[]
): string | null {
  for (const text of fullDescriptions) {
    if (text && SUBURB_STATE_RE.test(text)) return text.trim();
  }
  return null;
}
