// Where an "address suggestion" should open in a running-sheet observation:
// the officer has typed a street number and the start of a street name
// ("13 D", "47 Cooper", "2/144 Banni") and the cursor is still at the end of
// that. Pure and deterministic, so it can be tested without the browser.
//
// Numbers are everywhere in observations (times, ages, counts, regos), so the
// word after the number has to look like the start of a street, not "males",
// "minutes" or "persons" — see NOT_A_STREET.

/** Words that follow a number in ordinary prose, never a street name. */
const NOT_A_STREET = new Set([
  "males",
  "male",
  "females",
  "female",
  "persons",
  "person",
  "people",
  "children",
  "child",
  "occupants",
  "occupant",
  "vehicles",
  "vehicle",
  "minutes",
  "minute",
  "mins",
  "min",
  "hours",
  "hour",
  "hrs",
  "seconds",
  "metres",
  "meters",
  "kilometres",
  "km",
  "kms",
  "m",
  "cm",
  "mm",
  "kg",
  "years",
  "year",
  "yrs",
  "old",
  "am",
  "pm",
  "hrs",
  "bags",
  "bag",
  "boxes",
  "box",
  "cars",
  "car",
  "times",
  "x",
  "of",
  "and",
  "to",
  "in",
  "on",
  "at",
  "the",
  "a",
  "an",
  "from",
  "with",
  "by",
  "for",
  "unknown",
  "other",
  "more",
  "further",
  "additional",
  "different",
  "separate",
  "several",
]);

export interface AddressSuggestTrigger {
  /** The text typed so far, e.g. "13 D". */
  text: string;
  /** Where it starts in the observation. */
  start: number;
}

export function detectAddressSuggestTrigger(
  text: string,
  cursorPos: number
): AddressSuggestTrigger | null {
  const before = text.slice(0, cursorPos);
  // A street number (with optional letter or unit), a space, then 1–2 words
  // beginning the street name — and nothing after it, so the cursor is still
  // at the end of what's being typed.
  const m = before.match(
    /(?:^|[\s,])(\d{1,4}[A-Za-z]?(?:\/\d{1,4})?\s+[A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*)?)$/
  );
  if (!m) return null;
  const typed = m[1];
  const start = before.length - typed.length;
  // Not inside a bracket being typed, e.g. "(34 Pilbara St".
  if (/\([^)]*$/.test(before.slice(0, start))) return null;
  // Not the number of an address that's already complete ("…, WA (13 Den").
  const words = typed.split(/\s+/);
  const firstWord = words[1]?.toLowerCase() ?? "";
  if (NOT_A_STREET.has(firstWord)) return null;
  // The second street word, if any, must not be prose either ("12 Smith and").
  const secondWord = words[2]?.toLowerCase();
  if (secondWord && NOT_A_STREET.has(secondWord)) {
    return { text: words.slice(0, 2).join(" "), start };
  }
  // A bare number-plus-initial ("13 D") is fine, but a single letter followed
  // by more words that aren't a street is not.
  if (firstWord.length < 1) return null;
  return { text: typed, start };
}
