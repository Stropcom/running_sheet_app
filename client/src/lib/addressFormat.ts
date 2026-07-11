/**
 * Utilities for auto-converting Google Maps formatted addresses into the
 * standard running sheet address format used by the intelligence extractor.
 *
 * Google Maps format examples:
 *   "131 Lakey St, Southern River WA 6110, Australia"
 *   "McDonald's, 131 Lakey St, Southern River WA 6110, Australia"
 *   "3/12 Smith St, Fremantle WA 6160"
 *   "Kent St &, Queens Park Rd, Wilson WA 6107, Australia"   ← intersection
 *   "Canning River Cafe\nKent St &, Queens Park Rd, Wilson WA 6107, Australia"
 *
 * Running sheet format (what the intelligence extractor expects):
 *   "131 Lakey St, Southern River WA (131 LAKEY ST)"
 *   "McDonald's, 131 Lakey St, Southern River WA (131 LAKEY ST)"
 *   "Kent St & Queens Park Rd, Wilson WA (KENT ST & QUEENS PARK RD)"
 *
 * Rules:
 *  1. Detect a Google Maps address anywhere in the text.
 *  2. Strip the postcode (4-digit number) and ", Australia" suffix.
 *  3. Append "(STREET_NUMBER STREET_NAME)" bracket code in UPPERCASE at the end.
 *  4. If a business name precedes the street number, leave it untouched.
 *  5. Handle intersection addresses: "Kent St &, Queens Park Rd, Suburb STATE"
 *  6. If the text already contains a bracket code that looks like an address
 *     short-form, do not double-convert.
 */

const AU_STATES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";

/**
 * Regex for standard numbered street address.
 * Captures:
 *   group 1 — optional business name prefix (e.g. "McDonald's, ")
 *   group 2 — street number (may include unit slash, e.g. "3/12" or "131A")
 *   group 3 — street name (e.g. "Lakey St")
 *   group 4 — suburb + state (e.g. "Southern River WA")
 *   group 5 — postcode (4 digits, optional)
 */
const GOOGLE_ADDRESS_RE = new RegExp(
  // Optional business name: anything before the street number that ends with ", "
  `((?:[^,\\d\\n][^,\\n]*,\\s*)?)` +
  // Street number: optional unit/number (e.g. "3/12" or "131A")
  `(\\d{1,5}[A-Za-z]?(?:\\/\\d{1,5}[A-Za-z]?)?)\\s+` +
  // Street name: 1-5 words
  `([A-Za-z][\\w\\s]{2,50}?)` +
  // Comma + suburb + state abbreviation
  `,\\s*([A-Za-z][\\w\\s]{1,40}?\\s+(?:${AU_STATES}))` +
  // Optional postcode
  `(?:\\s+(\\d{4}))?` +
  // Optional ", Australia" suffix
  `(?:,\\s*Australia)?`,
  "i"
);

/**
 * Regex for intersection addresses like:
 *   "Kent St &, Queens Park Rd, Wilson WA 6107, Australia"
 *   "Kent St & Queens Park Rd, Wilson WA 6107, Australia"
 * Captures:
 *   group 1 — first street name (e.g. "Kent St")
 *   group 2 — second street name (e.g. "Queens Park Rd")
 *   group 3 — suburb + state (e.g. "Wilson WA")
 *   group 4 — postcode (optional)
 */
const INTERSECTION_RE = new RegExp(
  // First street name (letters/words, ends before &)
  `([A-Za-z][\\w\\s]{1,40}?)` +
  // Intersection marker: " &," or " & " or " &\n"
  `\\s+&,?\\s+` +
  // Second street name
  `([A-Za-z][\\w\\s]{1,40}?)` +
  // Comma + suburb + state
  `,\\s*([A-Za-z][\\w\\s]{1,40}?\\s+(?:${AU_STATES}))` +
  // Optional postcode
  `(?:\\s+(\\d{4}))?` +
  // Optional ", Australia"
  `(?:,\\s*Australia)?`,
  "i"
);

/**
 * Returns true if the text contains a Google Maps formatted address that has
 * NOT already been converted to running sheet format.
 */
export function containsGoogleAddress(text: string): boolean {
  if (!text) return false;

  // Check intersection first
  const intMatch = INTERSECTION_RE.exec(text);
  if (intMatch) {
    const afterMatch = text.slice((intMatch.index ?? 0) + intMatch[0].length).trimStart();
    if (!afterMatch.startsWith("(")) return true;
  }

  const match = GOOGLE_ADDRESS_RE.exec(text);
  if (!match) return false;
  const afterMatch = text.slice((match.index ?? 0) + match[0].length).trimStart();
  if (afterMatch.startsWith("(")) return false;
  return true;
}

/**
 * Convert all Google Maps formatted addresses in `text` to running sheet format.
 * Handles both numbered addresses and intersection addresses.
 * Idempotent — if already converted, returns the text unchanged.
 */
export function convertGoogleAddresses(text: string): string {
  if (!text) return text;

  // Step 1: handle intersection addresses first
  let result = text.replace(
    new RegExp(INTERSECTION_RE.source, "gi"),
    (fullMatch, street1, street2, suburbState, _postcode, offset, str) => {
      const afterMatch = str.slice(offset + fullMatch.length).trimStart();
      if (afterMatch.startsWith("(")) return fullMatch; // already converted

      const s1 = street1.trim();
      const s2 = street2.trim();
      const bracketCode = `${s1} & ${s2}`.toUpperCase();
      const cleanedAddress = `${s1} & ${s2}, ${suburbState.trim()}`;
      return `${cleanedAddress} (${bracketCode})`;
    }
  );

  // Step 2: handle standard numbered addresses
  result = result.replace(
    new RegExp(GOOGLE_ADDRESS_RE.source, "gi"),
    (fullMatch, businessPrefix, streetNum, streetName, suburbState, _postcode, offset, str) => {
      const afterMatch = str.slice(offset + fullMatch.length).trimStart();
      if (afterMatch.startsWith("(")) return fullMatch; // already converted

      const bracketCode = `${streetNum} ${streetName.trim()}`.toUpperCase();
      const cleanedAddress = `${businessPrefix ?? ""}${streetNum} ${streetName.trim()}, ${suburbState.trim()}`;
      return `${cleanedAddress} (${bracketCode})`;
    }
  );

  return result;
}

/**
 * Build a full address string from a POI (business pin) tap.
 * Prepends the business name if it's not already in the address.
 * e.g. name="Canning River Cafe", address="Kent St & Queens Park Rd, Wilson WA 6107, Australia"
 *   → "Canning River Cafe, Kent St & Queens Park Rd, Wilson WA (KENT ST & QUEENS PARK RD)"
 */
export function buildPoiAddress(name: string, address: string): string {
  const converted = convertGoogleAddresses(address);
  // If the business name is already at the start of the address, don't duplicate
  if (!name || converted.toLowerCase().startsWith(name.toLowerCase())) {
    return converted;
  }
  // Prepend business name
  return `${name}, ${converted}`;
}
