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
import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";

export { formatIntelAddress, formatIntelVehicle };

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
    // Street number: optional unit/number (e.g. "3/12" or "131A") — \b stops
    // this from matching digits embedded mid-word (e.g. the "450" in a
    // vehicle description like "GL450 SUV, bearing WA registration...").
    `\\b(\\d{1,5}[A-Za-z]?(?:\\/\\d{1,5}[A-Za-z]?)?)\\s+` +
    // Street name: 1-5 words
    `([A-Za-z][\\w\\s]{2,50}?)` +
    // Comma + suburb + state abbreviation. The negative lookahead keeps the
    // running sheet's own vehicle convention — "<description>, bearing WA
    // registration <rego>" — from being read as "suburb STATE": without it,
    // "bearing" parses as a suburb and the whole clause gets rewritten as an
    // address (see convertGoogleAddresses.test.ts).
    `,\\s*([A-Za-z][\\w\\s]{1,40}?\\s+(?:${AU_STATES}))\\b(?!\\s+(?:registration|rego)\\b)` +
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
  /** Business/place name, e.g. "Woolworths Fremantle" — most relevant for a
   * work address. Optional so existing callers building a plain residential
   * address don't need to know about it. */
  businessName?: string;
}

/**
 * Compose a Home Address Full (HBF) + short Home (HB) form from structured
 * address fields, using the same convention convertGoogleAddresses() builds
 * from a Google Places pick. Returns empty strings until house number,
 * street name + type, and suburb are all present — unit number and state
 * (defaults to WA) are the only optional parts.
 *
 * When a business name is set, it becomes the bracket/short code instead of
 * the street — matching the convention convertGoogleAddresses()/
 * buildPoiAddress() use for a business picked via free-text Google Places
 * search, since extractShortAddress() reads the bracket code as the
 * canonical short form everywhere else in the app.
 */
export function composeAddress(parts: StructuredAddressParts): {
  full: string;
  short: string;
} {
  const businessName = (parts.businessName ?? "").trim();
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
  const streetShort = `${numberPart} ${streetFull}`;
  const bracketCode = businessName || streetShort;
  const addressLine = businessName
    ? `${businessName}, ${streetShort}`
    : streetShort;
  const full = `${addressLine}, ${suburb.toUpperCase()} ${state} (${bracketCode})`;
  return { full, short: bracketCode };
}

/**
 * Map a Google Geocoder result's address_components to the subset of
 * StructuredAddressParts they cover — house number, unit/subpremise, street
 * (split into name + type against the same abbreviation map used elsewhere
 * in this file), suburb, and state. Only returns keys Google actually
 * supplied, so a caller can shallow-merge this over existing field values
 * without blanking anything Google didn't cover for this result.
 */
export function structuredAddressFromGoogleComponents(
  components: { long_name: string; short_name: string; types: string[] }[]
): Partial<StructuredAddressParts> {
  const find = (type: string) => components.find(c => c.types.includes(type));

  const streetNumber = find("street_number")?.long_name ?? "";
  const routeRaw = find("route")?.long_name ?? "";
  const subpremise = find("subpremise")?.long_name ?? "";
  const suburb =
    find("locality")?.long_name ??
    find("sublocality")?.long_name ??
    find("postal_town")?.long_name ??
    "";
  const stateShort = find("administrative_area_level_1")?.short_name ?? "";

  const result: Partial<StructuredAddressParts> = {};
  if (subpremise) result.unitNo = subpremise;
  if (streetNumber) result.houseNo = streetNumber;

  if (routeRaw.trim()) {
    const words = routeRaw.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    const expandedFromAbbrev = STREET_TYPE_MAP[lastWord.toLowerCase()];
    const isAlreadyFullType = STREET_TYPE_OPTIONS.some(
      t => t.toLowerCase() === lastWord.toLowerCase()
    );
    if (words.length > 1 && (expandedFromAbbrev || isAlreadyFullType)) {
      result.streetName = words.slice(0, -1).join(" ");
      result.streetType = expandedFromAbbrev ?? lastWord;
    } else {
      // Can't confidently split off a type — leave streetType for the
      // officer to pick from the dropdown rather than guessing wrong.
      result.streetName = routeRaw.trim();
    }
  }

  if (suburb) result.suburb = suburb.toUpperCase();
  if (
    stateShort &&
    (AU_STATE_OPTIONS as readonly string[]).includes(stateShort)
  ) {
    result.state = stateShort;
  }
  return result;
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
