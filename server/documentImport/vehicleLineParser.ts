// Splits the free-text vehicle description a target-profile document uses
// (e.g. "1ABC123 (WA) 2022 black Toyota Landcruiser station sedan.") into
// the same component shape the Add Target form's vehicle fields use
// (client/src/lib/addressFormat.ts's StructuredVehicleParts) — so a parsed
// vehicle can pre-fill that real form instead of landing as one opaque
// string. Anchors on "<token> (<STATE>)" rather than the stricter
// VEHICLE_REGO_PATTERN (server/db.ts) used for cross-linking mentions of an
// *already-known* rego: a personalised plate like "1KEEPUP" doesn't have
// that pattern's required trailing 3 digits, but a document that spells out
// the state in brackets straight after the plate is unambiguous regardless
// of shape, so that's what this module keys on. A colour/vehicle-type list
// this file doesn't recognise just means the officer fills that one field
// in themselves on the review screen — same safe degradation as
// addressLineParser.ts's unrecognised street types.

export interface ParsedVehicleLine {
  registration: string;
  state: string;
  colour: string;
  make: string;
  model: string;
  vehicleType: string;
  /** Year of manufacture, when the description led with one — not part of
   * StructuredVehicleParts (no field for it on the form today), kept only
   * for display on the review screen. */
  year: string;
  /** True once colour + make + model were all found — mirrors
   * composeVehicle()'s own "nothing composes until these are present"
   * rule. */
  confident: boolean;
  /** The original text for this one vehicle, always kept — shown alongside
   * the parsed fields on the review screen so a bad split is obvious and
   * fixable at a glance. */
  raw: string;
}

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

const COLOURS = new Set([
  "white",
  "black",
  "silver",
  "grey",
  "gray",
  "blue",
  "red",
  "green",
  "yellow",
  "gold",
  "brown",
  "maroon",
  "orange",
  "purple",
  "tan",
  "beige",
  "cream",
  "navy",
  "khaki",
  "pink",
  "bronze",
  "charcoal",
]);

// Mirrors client/src/lib/addressFormat.ts's VEHICLE_TYPE_OPTIONS values —
// kept as a separate, server-owned copy for the same reason
// addressLineParser.ts keeps its own street-type list (that file is
// client-side, this pipeline runs server-side against untrusted uploaded
// documents). Longer (two-word) phrases are checked before their one-word
// synonyms below.
const VEHICLE_TYPE_PHRASES: [string, string][] = [
  ["station sedan", "station sedan"],
  ["station wagon", "station sedan"],
  ["four wheel drive", "4WD"],
];
const VEHICLE_TYPE_WORDS: Record<string, string> = {
  utility: "Utility",
  ute: "Utility",
  sedan: "Sedan",
  suv: "SUV",
  truck: "Truck",
  motorbike: "Motorbike",
  motorcycle: "Motorbike",
  "4wd": "4WD",
  coupe: "coupe",
  wagon: "station sedan",
  hatch: "hatch",
  hatchback: "hatch",
};

const YEAR_RE = /^(19|20)\d{2}$/;

/** Matches a "<token> (<STATE>)" anchor — the shape every vehicle line in a
 * target-profile document starts with, regardless of whether the token
 * itself looks like a standard-format registration. */
const VEHICLE_ANCHOR = new RegExp(
  `\\b([A-Za-z0-9]{2,10})\\s*\\((${Array.from(AU_STATES).join("|")})\\)`,
  "g"
);

function stripVehicleType(words: string[]): {
  rest: string[];
  vehicleType: string;
} {
  if (words.length >= 2) {
    const lastTwo = words.slice(-2).join(" ").toLowerCase();
    for (const [phrase, canonical] of VEHICLE_TYPE_PHRASES) {
      if (lastTwo === phrase) {
        return { rest: words.slice(0, -2), vehicleType: canonical };
      }
    }
  }
  if (words.length >= 1) {
    const last = words[words.length - 1].toLowerCase();
    const canonical = VEHICLE_TYPE_WORDS[last];
    if (canonical) {
      return { rest: words.slice(0, -1), vehicleType: canonical };
    }
  }
  return { rest: words, vehicleType: "" };
}

function parseDescription(
  registration: string,
  state: string,
  raw: string,
  description: string
): ParsedVehicleLine {
  const words = description
    .trim()
    .replace(/\.+$/, "")
    .split(/\s+/)
    .filter(Boolean);

  let year = "";
  if (words.length > 0 && YEAR_RE.test(words[0])) {
    year = words.shift()!;
  }

  let colour = "";
  if (words.length > 0 && COLOURS.has(words[0].toLowerCase())) {
    colour = words.shift()!;
    colour = colour[0].toUpperCase() + colour.slice(1).toLowerCase();
  }

  const { rest, vehicleType } = stripVehicleType(words);
  const make = rest[0] ?? "";
  const model = rest.slice(1).join(" ");

  return {
    registration: registration.toUpperCase(),
    state,
    colour,
    make,
    model,
    vehicleType,
    year,
    confident: !!(colour && make && model),
    raw: raw.trim(),
  };
}

/** Finds every "<token> (<STATE>) <description>" vehicle entry in a block
 * of text (a VEHICLES table cell typically holds more than one, separated
 * by a blank line). Each entry's descriptive text runs up to the next
 * anchor or the end of the text. */
export function findVehicleLines(text: string): ParsedVehicleLine[] {
  const anchors: { index: number; token: string; state: string; end: number }[] =
    [];
  VEHICLE_ANCHOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VEHICLE_ANCHOR.exec(text)) !== null) {
    anchors.push({
      index: m.index,
      token: m[1],
      state: m[2],
      end: m.index + m[0].length,
    });
  }

  const out: ParsedVehicleLine[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const sliceEnd = anchors[i + 1] ? anchors[i + 1].index : text.length;
    const chunk = text.slice(anchor.index, sliceEnd);
    const description = text.slice(anchor.end, sliceEnd);
    out.push(
      parseDescription(anchor.token, anchor.state, chunk, description)
    );
  }
  return out;
}

/** Parses the first vehicle-shaped entry in `text`. Returns null if no
 * "<token> (<STATE>)" anchor is present at all. */
export function parseVehicleLine(text: string): ParsedVehicleLine | null {
  const all = findVehicleLines(text);
  return all[0] ?? null;
}
