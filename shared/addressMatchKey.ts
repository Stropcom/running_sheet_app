/**
 * A comparable key for a street address, shared by the client (a map pin's
 * address) and the server (a registry person's home address) so the two sides
 * agree on what "the same address" means — "17 Riversdale Rd, BURSWOOD WA
 * (17 Riversdale Rd)" and "17 Riversdale Road, BURSWOOD" both reduce to
 * "17 riversdale road|burswood".
 *
 * Deliberately stricter than the street-only core used for cross-operation
 * links: the unit number and suburb stay in the key, so 3/12 Smith St never
 * matches 5/12 Smith St, and two different suburbs' "12 Smith Street" are not
 * mixed up. Returns "" when no house number can be read.
 */

const STREET_TYPES: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  dr: "drive",
  ct: "court",
  cl: "close",
  pl: "place",
  cres: "crescent",
  cr: "crescent",
  blvd: "boulevard",
  bvd: "boulevard",
  hwy: "highway",
  fwy: "freeway",
  ln: "lane",
  tce: "terrace",
  pde: "parade",
  cct: "circuit",
  gr: "grove",
  gdns: "gardens",
  esp: "esplanade",
  wy: "way",
};

export function addressMatchKey(text: string | null | undefined): string {
  if (!text) return "";
  let t = text
    .replace(/\s*\([^)]{1,120}\)\s*$/, "")
    .replace(/,?\s*Australia\s*$/i, "")
    .trim();
  t = t.replace(/\s+\d{4}\s*$/, "").trim();
  const segments = t
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  // "Unit 3, 12 Smith St" — a unit sitting in its own comma segment.
  if (
    segments.length > 1 &&
    /^(?:unit|u|apt|apartment)\s*\d+[a-z]?$/i.test(segments[0])
  ) {
    segments.splice(0, 2, `${segments[0]}/${segments[1]}`);
  }
  const streetIdx = segments.findIndex(s =>
    /^(?:(?:unit|u|apt|apartment)\s*)?\d/i.test(s)
  );
  if (streetIdx === -1) return "";
  let street = segments[streetIdx].toLowerCase().replace(/\s+/g, " ");
  let suburb = (segments[streetIdx + 1] ?? "")
    .replace(/\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (/^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i.test(suburb)) suburb = "";

  // "unit 3 12 smith st" / "u3/12 smith st" / "3/12 smith st" → "3/12 smith st"
  street = street
    .replace(
      /^(?:unit|u|apt|apartment)\s*(\d+[a-z]?)\s*[\/,\s]\s*(?=\d)/,
      "$1/"
    )
    .replace(/^(?:unit|u|apt|apartment)\s*(?=\d)/, "");

  // Expand an abbreviated street type — only the final word of the street
  // segment, so "St Georges Tce" keeps its leading "St".
  const words = street.split(" ");
  const last = words[words.length - 1];
  if (words.length > 2 && STREET_TYPES[last])
    words[words.length - 1] = STREET_TYPES[last];
  street = words.join(" ");

  return `${street}|${suburb}`;
}
