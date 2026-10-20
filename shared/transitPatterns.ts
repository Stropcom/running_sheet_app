// Getting onto and off a bus or train (or tram), read from an observation
// sentence. Deterministic regular expressions — no lookups, no AI. The same
// shape as shared/vesselPatterns.ts: scanWalkEvents (walkEventPatterns.ts)
// puts a person "on a bus / on a train" until a later row puts them somewhere
// else, and isReadAsMovement uses these so the tracker doesn't warn that such a
// row "wasn't read as a move".

export type TransitMode = "bus" | "train" | "tram";

const TRANSIT_NOUN =
  "bus|coach|minibus|train|tram|railcar|light\\s?rail(?:\\s+train)?";

// A transport word that is really part of a place or thing: "the bus stop",
// "the train station", "a bus shelter", "the train line", "the bus driver".
// Never read as a vehicle to board.
const NOT_A_TRANSIT_PLACE =
  "(?!\\s+(?:stops?|stations?|shelters?|bays?|depot|terminal|interchange|lanes?|lines?|tracks?|yard|crossings?|platforms?|stands?|tickets?|fares?|drivers?|passes|pass|cards?|timetables?|routes?|network|museum|sets?|ports?|mall|park|hire|company|services?|schedules?|transfer|queue|rank))";

// Words that end a description: "the shopping centre and the bus" must not
// read "centre and the" as a description of the bus.
const STOP_WORD =
  "(?!(?:and|then|to|at|in|on|into|from|near|after|with|before|while|who|as|when|outside|inside|onto)\\b)";

/** "a bus", "the 998 bus", "the Armadale line train" — up to four plain words
 * of description in front of the transport word. */
const TRANSIT_REF = `(?:a|an|the|their|his|her|another|that|this)\\s+(?:${STOP_WORD}[\\w'’#/-]+\\s+){0,4}?(?:${TRANSIT_NOUN})\\b${NOT_A_TRANSIT_PLACE}`;

const BOARD_VERB =
  "boarded|embarked(?:\\s+(?:on|onto|upon))?|entered|got\\s+(?:aboard|onto|on\\s+board|on|into|in)|stepped\\s+(?:aboard|onto|on\\s+board|on|into)|climbed\\s+(?:aboard|onto|on\\s+board|on|into)|hopped\\s+(?:aboard|onto|on|into)|jumped\\s+(?:aboard|onto|on|into)|went\\s+(?:aboard|on\\s+board)|walked\\s+(?:onto|on\\s+to|aboard)|ran\\s+(?:onto|aboard)|(?:was\\s+|is\\s+)?seated\\s+(?:in|on|inside|aboard|within)|sat\\s+(?:in|on|inside|aboard)|took\\s+a\\s+seat\\s+(?:in|on)|(?:was|is)\\s+(?:on|aboard|in)|travell?ing\\s+(?:on|in)|travell?ed\\s+(?:on|in)|riding(?:\\s+(?:on|in))?|rode(?:\\s+(?:on|in))?";

const LEAVE_VERB =
  "disembarked(?:\\s+from)?|alighted(?:\\s+(?:from|off))?|got\\s+(?:off|out\\s+of|down\\s+from)|stepped\\s+(?:off|out\\s+of|down\\s+from)|climbed\\s+(?:off|out\\s+of|down\\s+from)|jumped\\s+off|hopped\\s+off|came\\s+off|exited|left|walked\\s+off|departed";

/** "HOGAN boarded a bus at Bus Stop Stirling Highway …" */
export const TRANSIT_BOARD_PATTERN = new RegExp(
  `([A-Za-z][^.\\n]*?)\\s*\\b(?:${BOARD_VERB})\\s+(${TRANSIT_REF})([^.\\n]*)`,
  "i"
);

/** "HOGAN alighted from the bus", "HOGAN got off the train". */
export const TRANSIT_LEAVE_PATTERN = new RegExp(
  `([A-Za-z][^.\\n]*?)\\s*\\b(?:${LEAVE_VERB})\\s+(?:off\\s+)?(${TRANSIT_REF})([^.\\n]*)`,
  "i"
);

/** "HOGAN alighted and walked …" — the word alone, when they are already
 * known to be on a bus or train (the caller checks). */
export const TRANSIT_ALIGHT_BARE_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\b(?:disembarked|alighted)\b/i;

export function transitMode(ref: string): TransitMode {
  if (/\btram\b/i.test(ref)) return "tram";
  if (/\b(?:train|railcar|light\s?rail)\b/i.test(ref)) return "train";
  return "bus";
}

const trimEnd = (s: string) => s.replace(/[\s,;:]+$/, "").trim();

/**
 * The place a boarding / alighting sentence names after the vehicle — "at Bus
 * Stop Stirling Highway After Eric Street, NEDLANDS WA (Bus Stop Stirling
 * Highway After Eric Street)" — and how much of `rest` it used (so the caller
 * can cut it out). Empty when the sentence names none. A bracket short form
 * ends the place; with no bracket it ends at a comma, "and" or the end.
 */
export function transitPlaceAfter(rest: string): {
  place: string;
  length: number;
} {
  const m = rest.match(/^\s*,?\s*(?:at|from|outside|near|opposite|beside)\s+/i);
  if (!m) return { place: "", length: 0 };
  const after = rest.slice(m[0].length);
  const bracketed = after.match(/^([^()]*?\([^()]{1,120}\))/);
  if (
    bracketed &&
    !/\s(?:and|then|before|where)\s/i.test(bracketed[1].split("(")[0])
  ) {
    return {
      place: bracketed[1].trim(),
      length: m[0].length + bracketed[1].length,
    };
  }
  const plain = after.match(
    /^(.*?)(?=\s+(?:and|then|before|where)\b|[,;.]|$)/i
  );
  const place = trimEnd(plain?.[1] ?? "");
  return { place, length: m[0].length + (plain?.[1]?.length ?? 0) };
}

export interface TransitBoarding {
  /** Who boarded, as written ("HOGAN and CORNELL"). */
  names: string;
  /** The vehicle as written, article included: "a bus", "the 998 bus". */
  transit: string;
  mode: TransitMode;
  /** Where they boarded ("Bus Stop Stirling Highway …"), when written. */
  place: string;
}

export function matchTransitBoarding(text: string): TransitBoarding | null {
  const m = text.match(TRANSIT_BOARD_PATTERN);
  if (!m) return null;
  // A sentence about a vehicle moving ("Vehicle 1FAT001 … travelled on …").
  if (/\bVehicle\s+[A-Za-z0-9]{5,8}\b/i.test(m[1]) && !/,/.test(m[1]))
    return null;
  const transit = trimEnd(m[2]);
  return {
    names: m[1].trim(),
    transit,
    mode: transitMode(transit),
    place: transitPlaceAfter(m[3] ?? "").place,
  };
}

export interface TransitAlighting {
  names: string;
  /** "the bus"; "" when the row only says "alighted". */
  transit: string;
  mode: TransitMode | null;
  /** Where they got off, when written. */
  place: string;
}

/**
 * Who got off and from what, or null when the sentence isn't about leaving a
 * bus or train. `onTransit` says whether the people the bare word "alighted"
 * could be about are already on one — without it, a bare "alighted" is left to
 * the boat rule (which reads it the same way).
 */
export function matchTransitAlighting(
  text: string,
  onTransit: (names: string) => boolean = () => false
): TransitAlighting | null {
  const m = text.match(TRANSIT_LEAVE_PATTERN);
  if (m) {
    const transit = trimEnd(m[2]);
    return {
      names: m[1].trim(),
      transit,
      mode: transitMode(transit),
      place: transitPlaceAfter(m[3] ?? "").place,
    };
  }
  const bare = text.match(TRANSIT_ALIGHT_BARE_PATTERN);
  if (bare && onTransit(bare[1])) {
    const after = text.slice((bare.index ?? 0) + bare[0].length);
    return {
      names: bare[1].trim(),
      transit: "",
      mode: null,
      place: transitPlaceAfter(after.replace(/^\s+from\b/i, "")).place,
    };
  }
  return null;
}

const BARE_CLAUSE = /\s*\b(?:disembarked|alighted)\b(?:\s+from\b)?/i;

/** The sentence with the getting-off clause (and the place it names) taken
 * out, so what is left reads as walking: "HOGAN alighted from the bus at Bus
 * Stop X (Bus Stop X) and walked [route] towards [location]." → "HOGAN walked
 * [route] towards [location]." */
export function stripTransitAlighting(text: string): string {
  const leave = new RegExp(
    `\\s*\\b(?:${LEAVE_VERB})\\s+(?:off\\s+)?${TRANSIT_REF}`,
    "i"
  );
  const m = text.match(leave);
  let start: number;
  let end: number;
  if (m && m.index !== undefined) {
    start = m.index;
    end = m.index + m[0].length;
  } else {
    const b = text.match(BARE_CLAUSE);
    if (!b || b.index === undefined) return text;
    start = b.index;
    end = b.index + b[0].length;
  }
  const used = transitPlaceAfter(text.slice(end)).length;
  end += used;
  const tail = text.slice(end).replace(/^\s*,?\s*and\b/i, "");
  return `${text.slice(0, start)}${tail}`;
}

/** Short wording for a card or flag: "a bus" stays "a bus". */
export function transitLabelText(transit: string): string {
  return transit.replace(/\s+/g, " ").trim();
}
