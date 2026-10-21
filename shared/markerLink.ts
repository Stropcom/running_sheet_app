import { fullStreetTypes } from "./streetTypes";

// An RS Quick Entry opened from a custom marker stays on that marker (see
// linkEntryToMarker in IntelligenceMapping.tsx). The marker is only linked
// when the saved entry actually mentions the marker's address.

/** The short form of a Quick Entry address — its bracket label when it has
 * one ("902 Canning Highway, APPLECROSS WA (902 Canning Highway)" → "902
 * Canning Highway"), otherwise its first comma-separated part. */
export function shortAddressLabel(address: string): string {
  const bracket = address.match(/\(([^)]+)\)\s*$/);
  return (bracket ? bracket[1] : address.split(",")[0]).trim();
}

/** The short address when `observation` mentions it (case ignored), else
 * null. */
export function entryMentionsAddress(
  address: string,
  observation: string
): string | null {
  const short = shortAddressLabel(address);
  if (!short) return null;
  return observation.toLowerCase().includes(short.toLowerCase()) ? short : null;
}

/** The short address the RS Quick Entry popup offers and matches its tracker
 * cards against. Works for street addresses ("21 OLDING WAY" bracket →
 * "21 Olding Way") and for businesses/POIs that carry no street or suburb
 * ("The Lookout Bar Bowling Bites (The Lookout Bar Bowling Bites)" → "The
 * Lookout Bar Bowling Bites"). An all-capitals bracket is title-cased; street
 * types are always written in full. */
export function popupShortAddress(address: string): string {
  const label = shortAddressLabel(address);
  const titled =
    label && label === label.toUpperCase()
      ? label.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
      : label;
  return fullStreetTypes(titled);
}

// ─── The key a tapped place's pin is saved under ────────────────────────────
// A pin's saved position / icon (intelPinOverrides) is looked up by the
// location's own label — "La Lune, 73 George Street, EAST FREMANTLE" — but a
// tapped place used to be saved under its short bracket name ("La Lune"), so
// for any place with a street number the map never found it. This finds the
// real label among the locations the map has.

function placeKey(text: string): string {
  return text
    .replace(/\([^)]*\)\s*$/, "")
    .replace(/,?\s*Australia\s*$/i, "")
    .replace(/,?\s*\b(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b(?:\s+\d{4})?\s*$/i, "")
    .split(",")
    .map(part => fullStreetTypes(part.replace(/\s+/g, " ").trim()))
    .filter(Boolean)
    .join(", ")
    .toLowerCase();
}

/** The label of the map location a tapped place became, from the labels the
 * map knows: the same name, street and suburb (state, postcode, street-type
 * abbreviations and case ignored), else the single location that starts with
 * the place's short name. Null when none (or more than one) fits — the caller
 * then falls back to the short name, as before. */
export function pinKeyForTappedPlace(
  labels: readonly string[],
  address: string
): string | null {
  const want = placeKey(address);
  if (!want) return null;
  const exact = labels.find(l => placeKey(l) === want);
  if (exact) return exact;
  const short = popupShortAddress(address).toLowerCase();
  if (!short) return null;
  const starts = labels.filter(l => placeKey(l).startsWith(short));
  return starts.length === 1 ? starts[0] : null;
}
