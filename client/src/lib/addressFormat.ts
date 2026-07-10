/**
 * Utilities for auto-converting Google Maps formatted addresses into the
 * standard running sheet address format used by the intelligence extractor.
 *
 * Google Maps format examples:
 *   "131 Lakey St, Southern River WA 6110, Australia"
 *   "McDonald's, 131 Lakey St, Southern River WA 6110, Australia"
 *   "3/12 Smith St, Fremantle WA 6160"
 *
 * Running sheet format (what the intelligence extractor expects):
 *   "131 Lakey St, Southern River WA (131 LAKEY ST)"
 *   "McDonald's, 131 Lakey St, Southern River WA (131 LAKEY ST)"
 *   "3/12 Smith St, Fremantle WA (3/12 SMITH ST)"
 *
 * Rules:
 *  1. Detect a Google Maps address anywhere in the text.
 *  2. Strip the postcode (4-digit number) and ", Australia" suffix.
 *  3. Append "(STREET_NUMBER STREET_NAME)" bracket code in UPPERCASE at the end.
 *  4. If a business name precedes the street number, leave it untouched.
 *  5. If the text already contains a bracket code that looks like an address
 *     short-form, do not double-convert.
 */

const AU_STATES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";

/**
 * Regex that matches a Google Maps formatted Australian address segment.
 * Captures:
 *   group 1 — optional business name prefix (e.g. "McDonald's, ")
 *   group 2 — street number (may include unit slash, e.g. "3/12" or "131A")
 *   group 3 — street name (e.g. "Lakey St")
 *   group 4 — suburb + state (e.g. "Southern River WA")
 *   group 5 — postcode (4 digits, optional)
 */
const GOOGLE_ADDRESS_RE = new RegExp(
  // Optional business name: anything before the street number that ends with ", "
  // We use a non-greedy match and require the business name NOT to start with a digit.
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
 * Returns true if the text contains a Google Maps formatted address that has
 * NOT already been converted to running sheet format.
 */
export function containsGoogleAddress(text: string): boolean {
  if (!text) return false;
  const match = GOOGLE_ADDRESS_RE.exec(text);
  if (!match) return false;
  // If the text already has a bracket code right after the matched segment, skip
  const afterMatch = text.slice((match.index ?? 0) + match[0].length).trimStart();
  if (afterMatch.startsWith("(")) return false;
  return true;
}

/**
 * Convert all Google Maps formatted addresses in `text` to running sheet format.
 * Idempotent — if already converted, returns the text unchanged.
 */
export function convertGoogleAddresses(text: string): string {
  if (!text) return text;

  // Use replace with a function so we can handle multiple addresses in one text
  return text.replace(
    new RegExp(GOOGLE_ADDRESS_RE.source, "gi"),
    (fullMatch, businessPrefix, streetNum, streetName, suburbState, _postcode, offset, str) => {
      // Check if there is already a bracket code immediately after this match
      const afterMatch = str.slice(offset + fullMatch.length).trimStart();
      if (afterMatch.startsWith("(")) {
        // Already converted — leave as-is
        return fullMatch;
      }

      // Build the bracket code: "STREET_NUMBER STREET_NAME" in uppercase
      // e.g. "131 LAKEY ST" or "3/12 SMITH ST"
      const bracketCode = `${streetNum} ${streetName.trim()}`.toUpperCase();

      // Build the cleaned address: business prefix + street number + street name + suburb + state
      // (postcode and ", Australia" are stripped)
      const cleanedAddress = `${businessPrefix ?? ""}${streetNum} ${streetName.trim()}, ${suburbState.trim()}`;

      return `${cleanedAddress} (${bracketCode})`;
    }
  );
}
