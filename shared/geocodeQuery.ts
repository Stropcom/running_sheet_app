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

/** Groups the written forms of each place by the place's label, so a caller
 * that only has the label (the Supervisor Summary's Location column) can find
 * the fuller "<street>, SUBURB STATE" the officer wrote for it. `normalize` is
 * the same label key the Heat Map uses. Only address / business places count. */
export function fullDescriptionsByLabel(
  entities: readonly {
    type: string;
    shortForm: string;
    fullDescription: string;
  }[],
  normalize: (label: string) => string
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of entities) {
    if (e.type !== "address" && e.type !== "business") continue;
    const key = normalize(e.shortForm);
    const list = out.get(key);
    if (list) list.push(e.fullDescription);
    else out.set(key, [e.fullDescription]);
  }
  return out;
}
