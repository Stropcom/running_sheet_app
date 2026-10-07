// Streets are always written with the full street type — "Street", "Road",
// "Avenue" — never "St", "Rd", "Ave", in the text the app writes, the places it
// shows, and (via Check Sheet) the rows officers have typed. The abbreviation
// is only ever expanded where it is the last word of a number-led street
// ("29A Robert St") or of an intersection ("Kent St & Queens Park Rd"), so
// "St Georges Terrace", "St Kilda" and "Dr Smith" are left alone.

const FULL: Record<string, string> = {
  st: "Street",
  rd: "Road",
  ave: "Avenue",
  av: "Avenue",
  dr: "Drive",
  ct: "Court",
  cl: "Close",
  pl: "Place",
  cres: "Crescent",
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
  esp: "Esplanade",
  wy: "Way",
  trk: "Track",
  hts: "Heights",
  rdge: "Ridge",
  vw: "View",
  gln: "Glen",
};

const TYPES = Object.keys(FULL).join("|");
const STATES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";

// A number-led street whose last word is the abbreviation: "29A Robert St",
// "6/12 Hill Rd", "1 Smith St" — followed by the end of the segment (comma,
// bracket, full stop, end, a state, "and", "&").
const NUMBERED = new RegExp(
  `(\\b\\d{1,5}[A-Za-z]?(?:\\/\\d{1,5}[A-Za-z]?)?\\s+(?:[A-Za-z'’-]+\\s+){0,4}?)(${TYPES})\\b(?=\\s*(?:[,;)&]|\\.(?:\\s|$)|$)|\\s+(?:and|then|${STATES})\\b)`,
  "gi"
);
// An intersection: "Kent St & Queens Park Rd".
const FIRST_OF_PAIR = new RegExp(
  `(\\b(?:[A-Z][A-Za-z'’-]*\\s+){1,3})(${TYPES})\\b(?=\\s*&\\s*[A-Z])`,
  "gi"
);
const SECOND_OF_PAIR = new RegExp(
  `(&\\s*(?:[A-Z][A-Za-z'’-]*\\s+){1,3})(${TYPES})\\b(?=\\s*(?:[,)]|$))`,
  "gi"
);

function casedFull(abbr: string): string {
  const full = FULL[abbr.toLowerCase()];
  return abbr.length > 1 && abbr === abbr.toUpperCase()
    ? full.toUpperCase()
    : full;
}

export interface AbbreviatedStreetType {
  /** Where the abbreviation starts in the text. */
  index: number;
  abbr: string;
  full: string;
}

/** Every abbreviated street type in `text`, in order. */
export function findAbbreviatedStreetTypes(
  text: string
): AbbreviatedStreetType[] {
  const hits = new Map<number, AbbreviatedStreetType>();
  for (const re of [NUMBERED, FIRST_OF_PAIR, SECOND_OF_PAIR]) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      const index = m.index + m[1].length;
      hits.set(index, { index, abbr: m[2], full: casedFull(m[2]) });
    }
  }
  return Array.from(hits.values()).sort((a, b) => a.index - b.index);
}

/** `text` with every abbreviated street type written in full. */
export function fullStreetTypes(text: string): string {
  if (!text) return text;
  const hits = findAbbreviatedStreetTypes(text);
  if (hits.length === 0) return text;
  let out = "";
  let at = 0;
  for (const h of hits) {
    out += text.slice(at, h.index) + h.full;
    at = h.index + h.abbr.length;
  }
  return out + text.slice(at);
}
