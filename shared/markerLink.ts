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
