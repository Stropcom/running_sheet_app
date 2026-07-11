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

/**
 * Format an address for display in the Intelligence section and map pop-ups.
 *
 * Input is the RS shortForm (what's inside the brackets in an observation), e.g.:
 *   "1 Smith Street"                         → "1 Smith Street, MELVILLE"
 *   "1 Smith Street, MELVILLE WA"            → "1 Smith Street, MELVILLE"
 *   "1 Smith Street, MELVILLE WA (1 Smith Street)" → "1 Smith Street, MELVILLE"
 *   "Blend Cafe, 1 Smith Street, MELVILLE WA" → "Blend Cafe, 1 Smith Street, MELVILLE"
 *   "Blend Cafe"                             → "Blend Cafe"  (no address info, returned as-is)
 *   "Kent St & Queens Park Rd, WILSON WA"    → "Kent St & Queens Park Rd, WILSON"
 *
 * Rules:
 *  1. Strip any trailing bracket code e.g. " (1 SMITH STREET)"
 *  2. Strip the state abbreviation (WA, NSW, etc.) from the suburb+state segment
 *  3. Strip the postcode and ", Australia"
 *  4. Uppercase the suburb name
 *  5. If no suburb is detectable, return the address as-is (cleaned)
 */
export function formatIntelAddress(shortForm: string): string {
  if (!shortForm) return shortForm;

  // Step 1: strip trailing bracket code " (ANYTHING)"
  let text = shortForm.replace(/\s*\([^)]{1,80}\)\s*$/, "").trim();

  // Step 2: strip ", Australia" and postcode
  text = text.replace(/,?\s*Australia\s*$/i, "").trim();
  text = text.replace(/\s+\d{4}\s*$/, "").trim();

  // Step 3: detect and reformat "..., Suburb STATE" → "..., SUBURB"
  // Match the trailing ", Suburb STATE" pattern
  const AU_STATES_RE = /^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i;
  const parts = text.split(",");
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    // Check if lastPart ends with a state abbreviation: "Southern River WA" or "MELVILLE WA"
    const stateMatch = lastPart.match(/^(.*?)\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i);
    if (stateMatch) {
      const suburb = stateMatch[1].trim();
      // Uppercase the suburb
      parts[parts.length - 1] = " " + suburb.toUpperCase();
      text = parts.join(",");
    } else if (AU_STATES_RE.test(lastPart)) {
      // The last part is just a state abbreviation — remove it entirely
      parts.pop();
      text = parts.join(",").trim();
    }
  }

  return text.trim();
}

/**
 * Format an address for map marker pop-up display.
 * Same as formatIntelAddress — produces "1 Smith Street, MELVILLE" or
 * "Blend Cafe, 1 Smith Street, MELVILLE".
 */
export function formatMapPopupAddress(shortForm: string): string {
  return formatIntelAddress(shortForm);
}

/**
 * Format a vehicle for display in the Intelligence section and map pop-ups.
 *
 * The RS shortForm is what's inside the brackets in an observation, e.g.:
 *   "Vehicle 1ABC123"   → extracted from "red Mercedes Benz sedan, bearing WA registration 1ABC123 (Vehicle 1ABC123)"
 *
 * The Intel display format is: "[registration] [description]"
 * e.g. "1ABC123 red Mercedes Benz sedan"
 *
 * Rules:
 *  1. If shortForm starts with "Vehicle " (case-insensitive), strip that prefix
 *     to get the registration: "Vehicle 1ABC123" → "1ABC123"
 *  2. If fullObservation is provided, extract the vehicle description from it:
 *     look for text before "bearing ... registration REGO" or before "(Vehicle REGO)"
 *  3. Combine as "[rego] [description]" — e.g. "1ABC123 red Mercedes Benz sedan"
 *  4. If no description can be found, return just the registration
 *  5. If shortForm doesn't look like a vehicle reference, return it as-is
 *    (stripped of leading "a " or "A ")
 */
export function formatIntelVehicle(shortForm: string, fullObservation?: string): string {
  if (!shortForm) return shortForm;

  // Strip leading "a " or "A " (legacy normalisation)
  let cleaned = shortForm.replace(/^[aA]\s+/, "").trim();

  // Extract registration from "Vehicle REGO" pattern
  const vehiclePrefix = cleaned.match(/^[Vv]ehicle\s+(.+)$/i);
  if (!vehiclePrefix) {
    // Not a "Vehicle REGO" format — return as-is (already normalised above)
    return cleaned;
  }

  const rego = vehiclePrefix[1].trim().toUpperCase();

  // Try to extract description from the full observation text
  if (fullObservation) {
    // Pattern: "[description], bearing [jurisdiction] registration REGO (Vehicle REGO)"
    // or:      "[description] bearing [jurisdiction] registration REGO"
    // or:      "[description] bearing registration REGO"
    const descMatch = fullObservation.match(
      /^(.+?),?\s+bearing\s+(?:[A-Z]{2,3}\s+)?registration\s+[\w\s-]+/i
    );
    if (descMatch) {
      const rawDesc = descMatch[1].trim();
      // Clean up: remove leading "a " or "A "
      // Also strip shortcut prefixes like "V1F:", "V2F:", "V1:", "V2:"
      const desc = rawDesc
        .replace(/^[aA]\s+/, "")
        .replace(/^V\d[A-Z]?:\s*/i, "")
        .trim();
      if (desc && desc.toLowerCase() !== "vehicle") {
        return `${rego} ${desc}`;
      }
    }
  }

  // No description available — return just the registration
  return rego;
}
