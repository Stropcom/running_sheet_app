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
