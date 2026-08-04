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

import {
  parse as parseDate,
  isValid as isValidDate,
  format as formatDate,
} from "date-fns";

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
 * Map of street type abbreviations to their full forms.
 * Keys are lowercase abbreviations; values are title-case full forms.
 */
const STREET_TYPE_MAP: Record<string, string> = {
  st: "Street",
  rd: "Road",
  ave: "Avenue",
  av: "Avenue",
  dr: "Drive",
  ct: "Court",
  cl: "Close",
  pl: "Place",
  cres: "Crescent",
  cr: "Crescent",
  blvd: "Boulevard",
  bvd: "Boulevard",
  hwy: "Highway",
  fwy: "Freeway",
  ln: "Lane",
  tce: "Terrace",
  pde: "Parade",
  cct: "Circuit",
  gr: "Grove",
  gdns: "Gardens",
  gdn: "Garden",
  esp: "Esplanade",
  mws: "Motorway",
  byp: "Bypass",
  cnr: "Corner",
  wy: "Way",
  way: "Way",
  loop: "Loop",
  rise: "Rise",
  run: "Run",
  trk: "Track",
  track: "Track",
  row: "Row",
  rdge: "Ridge",
  ridge: "Ridge",
  bnd: "Bend",
  bend: "Bend",
  vw: "View",
  view: "View",
  gln: "Glen",
  glen: "Glen",
  hts: "Heights",
  heights: "Heights",
  vale: "Vale",
  walk: "Walk",
  wlk: "Walk",
  mews: "Mews",
  qy: "Quay",
  quay: "Quay",
  sq: "Square",
  square: "Square",
  pass: "Pass",
  psge: "Passage",
  passage: "Passage",
  nook: "Nook",
  chase: "Chase",
  grange: "Grange",
  link: "Link",
  retreat: "Retreat",
  approach: "Approach",
  app: "Approach",
  pkwy: "Parkway",
  pwy: "Parkway",
  parkway: "Parkway",
};

/** Full-word street type options for a dropdown (Street, Road, Avenue, …), deduped and sorted. */
export const STREET_TYPE_OPTIONS: string[] = Array.from(
  new Set(Object.values(STREET_TYPE_MAP))
).sort();

/** Australian states/territories for a dropdown — WA first as the app default. */
export const AU_STATE_OPTIONS = [
  "WA",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "TAS",
  "NT",
  "ACT",
] as const;

/** Vehicle type options for a dropdown. */
export const VEHICLE_TYPE_OPTIONS = [
  "Utility",
  "Sedan",
  "SUV",
  "Truck",
  "Motorbike",
  "4WD",
  "coupe",
  "station sedan",
  "hatch",
] as const;

/**
 * Expand street type abbreviations in a street name string.
 * Only expands the LAST word if it matches a known abbreviation.
 * e.g. "Dover Rd" → "Dover Road", "Lakey St" → "Lakey Street"
 */
function expandStreetType(streetName: string): string {
  return streetName.replace(/\b([A-Za-z]+)$/, match => {
    const expanded = STREET_TYPE_MAP[match.toLowerCase()];
    return expanded ?? match;
  });
}

/** Title-case a string: "20 hinderwell st" → "20 Hinderwell Street" */
function toTitleCase(s: string): string {
  const titled = s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
  return expandStreetType(titled);
}

/** Uppercase the suburb portion of a "Suburb STATE" string, keep state as-is */
function upperSuburb(suburbState: string): string {
  // e.g. "Scarborough WA" → "SCARBOROUGH WA", "Southern River WA" → "SOUTHERN RIVER WA"
  const m = suburbState
    .trim()
    .match(new RegExp(`^(.+?)\\s+(${AU_STATES})$`, "i"));
  if (m) return `${m[1].trim().toUpperCase()} ${m[2].toUpperCase()}`;
  return suburbState.trim().toUpperCase();
}

/**
 * Returns true if the text contains a Google Maps formatted address that has
 * NOT already been converted to running sheet format.
 */
export function containsGoogleAddress(text: string): boolean {
  if (!text) return false;

  // Check intersection first
  const intMatch = INTERSECTION_RE.exec(text);
  if (intMatch) {
    const afterMatch = text
      .slice((intMatch.index ?? 0) + intMatch[0].length)
      .trimStart();
    if (!afterMatch.startsWith("(")) return true;
  }

  const match = GOOGLE_ADDRESS_RE.exec(text);
  if (!match) return false;
  const afterMatch = text
    .slice((match.index ?? 0) + match[0].length)
    .trimStart();
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

      const s1 = toTitleCase(street1.trim());
      const s2 = toTitleCase(street2.trim());
      const bracketCode = toTitleCase(`${s1} & ${s2}`);
      const cleanedAddress = `${s1} & ${s2}, ${upperSuburb(suburbState)}`;
      return `${cleanedAddress} (${bracketCode})`;
    }
  );

  // Step 2: handle standard numbered addresses
  result = result.replace(
    new RegExp(GOOGLE_ADDRESS_RE.source, "gi"),
    (
      fullMatch,
      businessPrefix,
      streetNum,
      streetName,
      suburbState,
      _postcode,
      offset,
      str
    ) => {
      const afterMatch = str.slice(offset + fullMatch.length).trimStart();
      if (afterMatch.startsWith("(")) return fullMatch; // already converted

      const streetNameClean = toTitleCase(streetName.trim());
      // Business locations use the business name as the bracket short code
      // (e.g. "Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern)")
      // rather than the street code plain addresses use.
      const businessName = businessPrefix
        ? businessPrefix.replace(/,\s*$/, "").trim()
        : "";
      const bracketCode =
        businessName || toTitleCase(`${streetNum} ${streetNameClean}`);
      const cleanedAddress = `${businessPrefix ?? ""}${streetNum} ${streetNameClean}, ${upperSuburb(suburbState)}`;
      return `${cleanedAddress} (${bracketCode})`;
    }
  );

  return result;
}

/**
 * Build a full address string from a POI (business pin) tap.
 * Prepends the business name if it's not already in the address, and uses
 * the business name as the bracket short code (business locations use their
 * name as the bracket code, not the street — see convertGoogleAddresses).
 * e.g. name="Bicton Tavern", address="1 Point Walter Road, Bicton WA 6157, Australia"
 *   → "Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern)"
 */
export function buildPoiAddress(name: string, address: string): string {
  const converted = convertGoogleAddresses(address);
  if (!name) return converted;

  const withoutBracket = converted.replace(/\s*\([^)]{1,80}\)\s*$/, "").trim();
  const alreadyPrefixed = withoutBracket
    .toLowerCase()
    .startsWith(name.toLowerCase());
  const addressPart = alreadyPrefixed
    ? withoutBracket
    : `${name}, ${withoutBracket}`;
  return `${addressPart} (${name})`;
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
    const stateMatch = lastPart.match(
      /^(.*?)\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i
    );
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

  // Step 4: if the street segment (everything before the last comma) is ALL-CAPS
  // (e.g. "4 GLYDE ST" from an old entity), title-case it.
  // This is a safety net for entities stored before the server-side fix.
  const finalParts = text.split(",");
  if (finalParts.length >= 1) {
    const streetSegment = finalParts[0].trim();
    // Detect all-caps street segment: all non-digit characters are uppercase
    const nonDigitChars = streetSegment.replace(/[\d\s/]/g, "");
    if (
      nonDigitChars.length > 0 &&
      nonDigitChars === nonDigitChars.toUpperCase() &&
      /[A-Z]{2}/.test(nonDigitChars)
    ) {
      // Title-case the street segment
      finalParts[0] =
        " " +
        streetSegment.replace(/\b(\w+)/g, w => {
          if (/^\d+$/.test(w)) return w;
          if (
            /^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT|HWY|RD|ST|AVE|DR|CT|PL|CL|CRES|BLVD|FWY|LN|TCE|PDE|CCT|GR|CNR)$/i.test(
              w
            )
          )
            return w.toUpperCase();
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        });
      text = finalParts.join(",").trim();
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
 * Extract the short-form HB value from a fully-formatted RS address (HBF).
 *
 * The HBF format is: "27 Olding Way, MELVILLE WA (27 Olding Way)"
 * The HB short form is the content inside the trailing brackets: "27 Olding Way"
 *
 * If no bracket code is present, falls back to extracting just the street
 * portion (everything before the first comma).
 *
 * Returns an empty string if nothing useful can be extracted.
 *
 * Examples:
 *   "27 Olding Way, MELVILLE WA (27 Olding Way)"  → "27 Olding Way"
 *   "131 Lakey Street, SOUTHERN RIVER WA (131 Lakey Street)" → "131 Lakey Street"
 *   "Kent St & Queens Park Rd, WILSON WA (Kent St & Queens Park Rd)" → "Kent St & Queens Park Rd"
 *   "27 Olding Way, MELVILLE WA"                  → "27 Olding Way"  (fallback)
 */
export function extractShortAddress(hbf: string): string {
  if (!hbf) return "";

  // Prefer the bracket code — it is the canonical short form
  const bracketMatch = hbf.match(/\(([^)]{1,120})\)\s*$/);
  if (bracketMatch) return bracketMatch[1].trim();

  // Fallback: everything before the first comma
  const commaIdx = hbf.indexOf(",");
  if (commaIdx > 0) return hbf.slice(0, commaIdx).trim();

  return hbf.trim();
}

/**
 * Extract the short-form target code from a target's "Full Name, Born" text.
 *
 * Format: "Benjamin KING, born 9 September 1966 (KING)"
 * The TGT short form is the content inside the trailing brackets: "KING"
 *
 * Returns an empty string if no bracket code is present — unlike address
 * short-forms, there's no reliable fallback for a person's name/DOB text.
 */
export function extractShortTarget(fullNameBorn: string): string {
  if (!fullNameBorn) return "";
  const bracketMatch = fullNameBorn.match(/\(([^)]{1,80})\)\s*$/);
  return bracketMatch ? bracketMatch[1].trim() : "";
}

/**
 * Extract the short-form V1/V2 value from a fully-formatted RS vehicle description (V1F/V2F).
 *
 * The V1F format is: "grey Ford Escape, bearing WA registration 1IEK105 (Vehicle 1IEK105)"
 * The V1 short form is the full bracket content, "Vehicle 1IEK105" — kept with
 * the "Vehicle " prefix since that's how vehicle mentions read in observation
 * text (see the RS chip/entity extraction conventions elsewhere in this file).
 *
 * Rules:
 *  1. Extract the bracket content: "(Vehicle 1IEK105)" → "Vehicle 1IEK105"
 *  2. Strip a leading "Vehicle " prefix (case-insensitive) to get just the rego.
 *  3. If no bracket code is present, returns an empty string.
 *
 * Examples:
 *   "grey Ford Escape, bearing WA registration 1IEK105 (Vehicle 1IEK105)" → "Vehicle 1IEK105"
 *   "blue Toyota Hilux, bearing WA rego 1ABC123 (Vehicle 1ABC123)"        → "Vehicle 1ABC123"
 *   "grey Ford Escape, bearing WA registration 1IEK105"                   → "" (no bracket)
 */
export function extractShortVehicle(v1f: string): string {
  if (!v1f) return "";
  const bracketMatch = v1f.match(/\(([^)]{1,80})\)\s*$/);
  if (!bracketMatch) return "";
  // Return the full bracket content (e.g. "Vehicle 1ABC 234") unchanged
  return bracketMatch[1].trim();
}

/**
 * Ensure an already-formatted RS address has a bracket short-form appended.
 *
 * If the address already ends with "(...)" it is returned unchanged.
 * Otherwise, the bracket code is derived: for a business address (the first
 * comma segment isn't a numbered street) it's the business name; otherwise
 * it's the street portion (everything before the first comma).
 *
 * Examples:
 *   "25 Mccallum Crescent, ARDROSS"          → "25 Mccallum Crescent, ARDROSS (25 Mccallum Crescent)"
 *   "25 Mccallum Crescent, ARDROSS (25 Mccallum Crescent)" → unchanged
 *   "Blend Cafe, 25 Mccallum Crescent, ARDROSS" → "Blend Cafe, 25 Mccallum Crescent, ARDROSS (Blend Cafe)"
 */
export function ensureBracketCode(address: string): string {
  if (!address) return address;
  // Already has a bracket code — leave it
  if (/\([^)]{1,120}\)\s*$/.test(address)) return address;
  const parts = address.split(",");
  const firstPart = parts[0]?.trim() ?? "";
  // If the first segment isn't a numbered street, it's a business name —
  // business locations use their name as the bracket code.
  if (firstPart && !/^\d/.test(firstPart)) {
    return `${address} (${firstPart})`;
  }
  // Find the street portion: the first segment that starts with a number
  let streetPart = "";
  for (const p of parts) {
    const trimmed = p.trim();
    if (/^\d/.test(trimmed)) {
      streetPart = trimmed;
      break;
    }
  }
  if (!streetPart) {
    streetPart = firstPart || address;
  }
  return `${address} (${streetPart})`;
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
export function formatIntelVehicle(
  shortForm: string,
  fullObservation?: string
): string {
  if (!shortForm) return shortForm;

  // Strip leading "a " or "A " (legacy normalisation)
  let cleaned = shortForm.replace(/^[aA]\s+/, "").trim();

  // Extract registration from "Vehicle REGO" pattern
  const vehiclePrefix = cleaned.match(/^[Vv]ehicle\s+(.+)$/i);
  if (!vehiclePrefix) {
    // Not a "Vehicle REGO" format.
    // Try to extract rego from "bearing [STATE] registration REGO" embedded in the text.
    // e.g. "black Subaru WRX, bearing WA registration 1FDD444 (Vehicle 1FDD444)"
    //   → rego = "1FDD444", desc = "black Subaru WRX" → "1FDD444 black Subaru WRX"
    const bearingMatch = cleaned.match(
      /^(.+?),?\s+bearing\s+(?:[A-Z]{2,3}\s+)?registration\s+([A-Z0-9-]+)/i
    );
    if (bearingMatch) {
      const rawDesc = bearingMatch[1]
        .replace(/^[aA]\s+/, "")
        .replace(/^V\d[A-Z]?:\s*/i, "")
        .trim();
      const extractedRego = bearingMatch[2].trim().toUpperCase();
      if (rawDesc && rawDesc.toLowerCase() !== "vehicle") {
        // Avoid duplicating rego if desc already starts with it
        if (rawDesc.toUpperCase().startsWith(extractedRego)) return rawDesc;
        return `${extractedRego} ${rawDesc}`;
      }
      return extractedRego;
    }
    // No bearing pattern — strip any trailing bracket code and return
    const stripped = cleaned.replace(/\s*\([^)]{1,80}\)\s*$/, "").trim();
    return stripped || cleaned;
  }

  const rego = vehiclePrefix[1].trim().toUpperCase();

  // Try to extract description from the full observation text
  if (fullObservation) {
    // Find the specific bearing clause for THIS rego in the full observation.
    // Strategy: locate "bearing ... registration REGO" by index, then look backward
    // from that position to extract the vehicle description.
    // We split on closing brackets ) to avoid spilling across other vehicle references
    // like "(Vehicle 1HTU905)" when there are multiple vehicles in one observation.
    const escapedRego = rego.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bearingIdx = fullObservation.search(
      new RegExp(
        "bearing\\s+(?:[A-Z]{2,3}\\s+)?registration\\s+" + escapedRego + "\\b",
        "i"
      )
    );
    if (bearingIdx >= 0) {
      // Take text before the bearing clause, strip trailing comma/space
      const beforeBearing = fullObservation
        .slice(0, bearingIdx)
        .replace(/,?\s*$/, "")
        .trim();
      // Split on closing brackets to isolate the last vehicle description segment
      const segments = beforeBearing.split(")");
      let lastSegment = segments[segments.length - 1].trim();
      // Strip leading connectors: "and a", "and an", "and the", "a ", "an ", "the "
      lastSegment = lastSegment
        .replace(/^(?:and\s+(?:a[n]?\s+|the\s+)?|a[n]?\s+|the\s+)/i, "")
        .trim();
      lastSegment = lastSegment
        .replace(/^[aA]\s+/, "")
        .replace(/^V\d[A-Z]?:\s*/i, "")
        .trim();
      if (lastSegment && lastSegment.toLowerCase() !== "vehicle") {
        if (lastSegment.toLowerCase().startsWith(rego.toLowerCase()))
          return lastSegment;
        return `${rego} ${lastSegment}`;
      }
    }
    // Fallback: original approach — match from start of observation (single-vehicle case)
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
        // If desc already starts with the rego (e.g. "1FDD444 black Subaru WRX"),
        // return desc directly to avoid duplicating the rego in the display.
        if (desc.toLowerCase().startsWith(rego.toLowerCase())) {
          return desc;
        }
        return `${rego} ${desc}`;
      }
    }
  }

  // No description available — return just the registration
  return rego;
}

/**
 * Reverse of formatIntelVehicle's "[rego] [description]" display format —
 * expands it back into the full RS observation/V1F convention:
 * "[description], bearing WA registration [rego] (Vehicle [rego])".
 *
 * Used when a user picks a vehicle suggestion (sourced from Intelligence
 * entities, which are stored/displayed rego-first, e.g. "1GBG656 grey Ford
 * Ranger") to fill a Target Registry Vehicle Full (V1F) field — so the
 * inserted text reads the same way an officer would type it, and so
 * extractShortVehicle can find the trailing "(Vehicle REGO)" bracket to
 * auto-fill the short Vehicle (V1) field on blur, same as if it had been
 * typed by hand.
 *
 * Returns the input unchanged if it doesn't look like "[rego] [description]"
 * (e.g. already has a bracket, or has no rego-looking leading token).
 *
 * Example:
 *   "1GBG656 grey Ford Ranger" → "grey Ford Ranger, bearing WA registration 1GBG656 (Vehicle 1GBG656)"
 */
export function expandIntelVehicleToFullForm(introLabel: string): string {
  if (!introLabel) return introLabel;
  const trimmed = introLabel.trim();
  // Already has a bracket code — nothing to expand.
  if (/\([^)]{1,80}\)\s*$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^([A-Za-z0-9-]{5,8})\s+(.+)$/);
  if (!match) return trimmed;
  const rego = match[1].toUpperCase();
  const description = match[2].trim();
  // Only treat the leading token as a rego if it mixes letters and digits —
  // avoids misfiring on a plain description with no recognised rego.
  if (!/[A-Za-z]/.test(rego) || !/\d/.test(rego)) return trimmed;
  return `${description}, bearing WA registration ${rego} (Vehicle ${rego})`;
}

// ─── Structured input composition ──────────────────────────────────────────
// Instead of trusting an officer to hand-type a Target/Address/Vehicle in
// the exact running-sheet convention, the Target Registry collects each
// part as its own controlled field and these functions build the same
// composed strings (name/tgt, hbf/hb, v1f/v1) the rest of the app already
// expects — same output, guaranteed well-formed input.

/**
 * Parse a dd/mm/yyyy string into a real Date, rejecting anything that isn't
 * an actual calendar date (e.g. "31/02/2020" is shape-valid but not real).
 */
export function parseDdMmYyyyDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return null;
  const parsed = parseDate(trimmed, "d/M/yyyy", new Date());
  if (!isValidDate(parsed)) return null;
  const [d, m, y] = trimmed.split("/").map(Number);
  if (
    parsed.getDate() !== d ||
    parsed.getMonth() !== m - 1 ||
    parsed.getFullYear() !== y
  )
    return null;
  return parsed;
}

/** "9/9/1966" → "9 September 1966" (the spelled-out form used in TGT text). Empty string if not a valid date. */
export function formatBornDate(input: string): string {
  const d = parseDdMmYyyyDate(input);
  return d ? formatDate(d, "d MMMM yyyy") : "";
}

/** dd/mm/yyyy (form input) → yyyy-mm-dd (stored). Empty string if not a valid date. */
export function ddMmYyyyToIso(input: string): string {
  const d = parseDdMmYyyyDate(input);
  return d ? formatDate(d, "yyyy-MM-dd") : "";
}

/** yyyy-mm-dd (stored) → dd/mm/yyyy (form input). Empty string if blank/invalid. */
export function isoToDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseDate(iso, "yyyy-MM-dd", new Date());
  return isValidDate(d) ? formatDate(d, "dd/MM/yyyy") : "";
}

/**
 * Auto-inserts the "/" separators as an officer types digits into a Born
 * date field, so "1" "2" "0" "3" "1" "9" "8" "0" reads back as
 * "12/03/1980" without them typing the slashes themselves — reformats from
 * the raw digits on every keystroke, so backspacing naturally removes a
 * separator too rather than getting stuck on it.
 */
export function formatDdMmYyyyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  let result = day;
  if (month) result += "/" + month;
  if (year) result += "/" + year;
  return result;
}

export interface StructuredNameParts {
  firstNames: string;
  surname: string;
  bornDate: string; // dd/mm/yyyy, optional
}

/**
 * Compose a target/associate's "Full Name, Born (SURNAME)" + short TGT form
 * from structured identity fields. Returns empty strings until both first
 * name(s) and surname are present — DOB is optional (a target may be added
 * before it's known).
 */
export function composeTargetName(parts: StructuredNameParts): {
  name: string;
  tgt: string;
} {
  const firstNames = parts.firstNames.trim();
  const surname = parts.surname.trim().toUpperCase();
  if (!firstNames || !surname) return { name: "", tgt: "" };
  const bornText = formatBornDate(parts.bornDate);
  const bornSuffix = bornText ? `, born ${bornText}` : "";
  return {
    name: `${firstNames} ${surname}${bornSuffix} (${surname})`,
    tgt: surname,
  };
}

export interface StructuredAddressParts {
  unitNo: string;
  houseNo: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
}

/**
 * Compose a Home Address Full (HBF) + short Home (HB) form from structured
 * address fields, using the same convention convertGoogleAddresses() builds
 * from a Google Places pick. Returns empty strings until house number,
 * street name + type, and suburb are all present — unit number and state
 * (defaults to WA) are the only optional parts.
 */
export function composeAddress(parts: StructuredAddressParts): {
  full: string;
  short: string;
} {
  const unitNo = parts.unitNo.trim();
  const houseNo = parts.houseNo.trim();
  const streetName = parts.streetName.trim();
  const streetType = parts.streetType.trim();
  const suburb = parts.suburb.trim();
  const state = (parts.state.trim() || "WA").toUpperCase();
  if (!houseNo || !streetName || !streetType || !suburb)
    return { full: "", short: "" };
  const streetFull = toTitleCase(`${streetName} ${streetType}`);
  const numberPart = unitNo ? `${unitNo}/${houseNo}` : houseNo;
  const short = `${numberPart} ${streetFull}`;
  const full = `${short}, ${suburb.toUpperCase()} ${state} (${short})`;
  return { full, short };
}

export interface StructuredVehicleParts {
  registration: string;
  state: string;
  colour: string;
  make: string;
  model: string;
}

/**
 * Compose a Vehicle Full (V1F) + short Vehicle (V1) form from structured
 * vehicle fields, matching the "[colour] [make] [model] [type], bearing
 * [state] registration [rego] (Vehicle [rego])" convention used throughout
 * the app — the same description (minus the bracket) is what the
 * Intelligence folder displays as "[rego] [colour] [make] [model] [type]".
 * Type is appended last and only when filled, so a vehicle added before
 * Type existed (or without it set) still composes correctly.
 */
export function composeVehicle(
  parts: StructuredVehicleParts & { vehicleType?: string }
): {
  full: string;
  short: string;
} {
  const registration = parts.registration.trim().toUpperCase();
  const state = (parts.state.trim() || "WA").toUpperCase();
  const colour = parts.colour.trim();
  const make = parts.make.trim();
  const model = parts.model.trim();
  const vehicleType = (parts.vehicleType ?? "").trim();
  if (!registration || !colour || !make || !model)
    return { full: "", short: "" };
  const description = [colour, make, model, vehicleType]
    .filter(Boolean)
    .join(" ");
  const short = `Vehicle ${registration}`;
  const full = `${description}, bearing ${state} registration ${registration} (${short})`;
  return { full, short };
}
