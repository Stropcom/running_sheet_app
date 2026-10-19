// Getting onto and off a boat or vessel, read from an observation sentence.
// Deterministic regular expressions — no lookups, no AI. Used by
// scanWalkEvents (shared/walkEventPatterns.ts) to put a person "on a vessel"
// until a later row puts them somewhere else, and by isReadAsMovement so the
// tracker doesn't warn that such a row "wasn't read as a move".

/** Words for a craft that people get onto. */
const VESSEL_NOUN =
  "vessel|boat|yacht|ship|ferry|dinghy|jet\\s?ski|catamaran|cruiser|speedboat|sailboat|trawler|tinny|skiff|houseboat|runabout|kayak|canoe";

// A craft word that is really part of a place: "the boat ramp", "boat shed",
// "the Fremantle Boat Pens", "a ship's chandlery". Never read as a vessel.
const NOT_A_VESSEL_PLACE =
  "(?!\\s+(?:shed|ramp|club|harbou?r|pens?|yard|hire|show|licen[cs]e|trailer|storage|car\\s?park|park|landing|lagoon|jetty|marina|terminal|sales|dealer|builders?|chandlery|repairs?|wharf|dock))";

/** "a vessel", "the white yacht", "a 10 metre catamaran" — up to four words
 * of description in front of the craft word. */
const VESSEL_REF = `(?:a|an|the|their|his|her|another)\\s+(?:[\\w'’-]+\\s+){0,4}?(?:${VESSEL_NOUN})\\b${NOT_A_VESSEL_PLACE}`;

const BOARD_VERB =
  "boarded|embarked(?:\\s+(?:on|onto|upon))?|entered|climbed\\s+(?:aboard|onto|on\\s+board|into)|stepped\\s+(?:aboard|onto|on\\s+board|into)|got\\s+(?:aboard|onto|on\\s+board|into|on)|went\\s+(?:aboard|on\\s+board)|jumped\\s+(?:aboard|onto|into)";

const LEAVE_VERB =
  "disembarked(?:\\s+from)?|alighted(?:\\s+from)?|got\\s+off|stepped\\s+off|climbed\\s+off|jumped\\s+off|exited|left|walked\\s+off";

/** "HOGAN boarded a vessel at the end of the jetty." */
export const VESSEL_BOARD_PATTERN = new RegExp(
  `([A-Za-z][^.\\n]*?)\\s*\\b(?:${BOARD_VERB})\\s+(?:aboard\\s+|onto\\s+|on\\s+board\\s+)?(${VESSEL_REF})([^.\\n]*)`,
  "i"
);

/** "HOGAN disembarked from the vessel", "HOGAN got off the boat". */
export const VESSEL_LEAVE_PATTERN = new RegExp(
  `([A-Za-z][^.\\n]*?)\\s*\\b(?:${LEAVE_VERB})\\s+(?:off\\s+)?(${VESSEL_REF})`,
  "i"
);

/** "HOGAN disembarked and walked along the jetty" — the word alone is enough. */
export const VESSEL_DISEMBARK_BARE_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\b(?:disembarked|alighted)\b/i;

export interface VesselBoarding {
  /** Who boarded, as written ("HOGAN and CORNELL"). */
  names: string;
  /** The craft as written, article included: "a vessel", "the white yacht". */
  vessel: string;
  /** What came after it in the sentence ("at the end of the jetty"). */
  rest: string;
}

const trimEnd = (s: string) => s.replace(/[\s,;:]+$/, "").trim();

export function matchVesselBoarding(text: string): VesselBoarding | null {
  const m = text.match(VESSEL_BOARD_PATTERN);
  if (!m) return null;
  // "Vehicle 1FAT001, HOGAN driver, boarded a vessel" is still a person
  // boarding; but a sentence about a vehicle moving is not.
  if (/\bVehicle\s+[A-Za-z0-9]{5,8}\b/i.test(m[1]) && !/,/.test(m[1]))
    return null;
  const vessel = trimEnd(m[2]);
  return { names: m[1].trim(), vessel, rest: trimEnd(m[3] ?? "") };
}

/** Who got off and from what ("the boat"; "" when the row only says
 * "disembarked"), or null when the sentence isn't about leaving a vessel. */
export function matchVesselDisembark(
  text: string
): { names: string; vessel: string } | null {
  const m = text.match(VESSEL_LEAVE_PATTERN);
  if (m) return { names: m[1].trim(), vessel: trimEnd(m[2]) };
  const bare = text.match(VESSEL_DISEMBARK_BARE_PATTERN);
  if (bare) return { names: bare[1].trim(), vessel: "" };
  return null;
}

const LEAVE_CLAUSE = new RegExp(
  `\\s*\\b(?:${LEAVE_VERB})\\s+(?:off\\s+)?${VESSEL_REF}(?:\\s+and\\b)?`,
  "i"
);
const DISEMBARK_BARE_CLAUSE =
  /\s*\b(?:disembarked|alighted)\b(?:\s+from\b)?(?:\s+and\b)?/i;

/** The sentence with the getting-off clause taken out, so what is left can be
 * read as walking: "HOGAN disembarked from the boat and walked [route]
 * towards [location]." → "HOGAN walked [route] towards [location]." (the
 * walker is then just HOGAN, not "HOGAN disembarked from the boat and"). */
export function stripVesselLeave(text: string): string {
  if (LEAVE_CLAUSE.test(text)) return text.replace(LEAVE_CLAUSE, "");
  return text.replace(DISEMBARK_BARE_CLAUSE, "");
}

/** Short wording for a flag or card: "a vessel" → "a vessel", "the white
 * yacht, named Sea Breeze" stays as written. */
export function vesselLabel(vessel: string): string {
  return vessel.replace(/\s+/g, " ").trim();
}
