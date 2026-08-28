// Splits a raw, freely-typed address line (as it appears in an imported
// document, e.g. "3 Appletree Place, Woodvale WA 6026") into the same
// component shape the Add Target form's address fields use
// (client/src/lib/addressFormat.ts's StructuredAddressParts) — so a parsed
// address can pre-fill that real form instead of landing as one opaque
// string. Deliberately a *separate*, server-side street-type list rather
// than importing the client's (STREET_TYPE_MAP in addressFormat.ts isn't
// exported, and that file lives under client/src — this module runs in the
// import pipeline, on the server, on an untrusted uploaded document, so it
// keeps its own small, easily-audited list rather than reaching across that
// boundary). A street type this list doesn't recognise just means the
// officer fills that one field in themselves on the review screen — same
// safe degradation as every other best-effort field here.

export interface ParsedAddressLine {
  houseNo: string;
  unitNo: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  /** True once house number + street name + street type + suburb were all
   * found — mirrors composeAddress()'s own "nothing composes until these
   * four are present" rule, so the caller can tell a confident parse from
   * a partial one before showing it as pre-filled. */
  confident: boolean;
  /** The original text, always kept — shown alongside the parsed fields on
   * the review screen so a bad split is obvious and fixable at a glance. */
  raw: string;
}

const STREET_TYPES: Record<string, string> = {
  st: "Street",
  street: "Street",
  rd: "Road",
  road: "Road",
  ave: "Avenue",
  av: "Avenue",
  avenue: "Avenue",
  pl: "Place",
  place: "Place",
  dr: "Drive",
  drive: "Drive",
  ct: "Court",
  court: "Court",
  cres: "Crescent",
  crescent: "Crescent",
  way: "Way",
  tce: "Terrace",
  terrace: "Terrace",
  cl: "Close",
  close: "Close",
  blvd: "Boulevard",
  boulevard: "Boulevard",
  pde: "Parade",
  parade: "Parade",
  ln: "Lane",
  lane: "Lane",
  cct: "Circuit",
  circuit: "Circuit",
  hwy: "Highway",
  highway: "Highway",
  gr: "Grove",
  grove: "Grove",
  loop: "Loop",
  rise: "Rise",
  mews: "Mews",
  esp: "Esplanade",
  esplanade: "Esplanade",
};

const AU_STATES = new Set([
  "WA",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "TAS",
  "NT",
  "ACT",
]);

/** Matches "<houseNo> <street words incl. type>, <suburb> <STATE> [postcode]"
 * anywhere in a string — the shape a WA intelligence document's address
 * lines consistently follow, labeled or not. Captures loosely; the street
 * type and suburb/state split happens afterward against the lists above so
 * a state or type this exact regex didn't anticipate still gets a chance. */
const ADDRESS_SHAPE = new RegExp(
  `\\b(\\d+[A-Za-z]?(?:\\/\\d+[A-Za-z]?)?)\\s+([A-Za-z][A-Za-z\\s]{1,40}?),\\s*([A-Za-z][A-Za-z\\s]{1,40}?)\\s+(${Array.from(
    AU_STATES
  ).join("|")})\\b(?:\\s+(\\d{4}))?`,
  "g"
);

function splitUnitHouse(token: string): { unitNo: string; houseNo: string } {
  const m = token.match(/^(\d+[A-Za-z]?)\/(\d+[A-Za-z]?)$/);
  if (m) return { unitNo: m[1], houseNo: m[2] };
  return { unitNo: "", houseNo: token };
}

function splitStreetNameAndType(
  streetWords: string
): { streetName: string; streetType: string } {
  const words = streetWords.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  const expanded = STREET_TYPES[last.toLowerCase()];
  if (expanded && words.length > 1) {
    return { streetName: words.slice(0, -1).join(" "), streetType: expanded };
  }
  // Type not recognised (or the whole thing is just one word) — leave the
  // type blank rather than guess; the officer picks it from the dropdown.
  return { streetName: streetWords.trim(), streetType: "" };
}

/** Parses the first address-shaped match in `text`. Returns null if nothing
 * matches the shape at all (not even a partial), so the caller can tell
 * "no address here" from "an address was here but incomplete". */
export function parseAddressLine(text: string): ParsedAddressLine | null {
  ADDRESS_SHAPE.lastIndex = 0;
  const m = ADDRESS_SHAPE.exec(text);
  if (!m) return null;
  const [raw, numberToken, streetWords, suburbRaw, state] = m;
  const { unitNo, houseNo } = splitUnitHouse(numberToken);
  const { streetName, streetType } = splitStreetNameAndType(streetWords);
  const suburb = suburbRaw.trim().toUpperCase();
  const confident = !!(houseNo && streetName && streetType && suburb);
  return {
    houseNo,
    unitNo,
    streetName,
    streetType,
    suburb,
    state: AU_STATES.has(state) ? state : "WA",
    confident,
    raw: raw.trim(),
  };
}

/** Finds every address-shaped match in a longer block of prose (not just
 * the first) — used to scan a free-text paragraph for addresses that
 * aren't on a line of their own, e.g. "...held at EES Shipping (EES
 * Shipment S00084692) 16 Baling Street, Cockburn Central WA was
 * searched...". */
export function findAddressLines(text: string): ParsedAddressLine[] {
  const out: ParsedAddressLine[] = [];
  ADDRESS_SHAPE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ADDRESS_SHAPE.exec(text)) !== null) {
    const [raw, numberToken, streetWords, suburbRaw, state] = m;
    const { unitNo, houseNo } = splitUnitHouse(numberToken);
    const { streetName, streetType } = splitStreetNameAndType(streetWords);
    const suburb = suburbRaw.trim().toUpperCase();
    out.push({
      houseNo,
      unitNo,
      streetName,
      streetType,
      suburb,
      state: AU_STATES.has(state) ? state : "WA",
      confident: !!(houseNo && streetName && streetType && suburb),
      raw: raw.trim(),
    });
  }
  return out;
}
