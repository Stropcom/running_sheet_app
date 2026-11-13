// "Stood out the front" — the target is inside a place, steps out the front
// (to talk on the phone, have a smoke, wait) and has not gone anywhere. He is
// still AT that place, outside it, not "departed on foot" to somewhere unknown:
// the Target Logger shows him out the front of it and offers "Returned inside"
// (walked back to the place) instead of "Entered a location" / "Inside". He can
// still walk on elsewhere or back to a vehicle. Pure and deterministic — what
// the officer wrote decides it, nothing is guessed, and a person is only ever
// read as out the front when a row says so.

// "out the front", "out front", "outside" — never "out of sight".
const OUT_FRONT = String.raw`(?:out\s+(?:the\s+)?front|outside)(?!\s+(?:of\s+sight|(?:of\s+)?(?:the\s+)?(?:vehicle|car)\b|\(?Vehicle\b))`;
const STAY_VERBS = String.raw`(?:stood|stands|standing|waited|waiting|stayed|remained|lingered|loitered)`;
const GO_VERBS = String.raw`(?:went|walked|stepped|came|moved)`;

const STOOD_OUT_FRONT_RE = new RegExp(
  String.raw`\b(?:${STAY_VERBS}|${GO_VERBS})\s+${OUT_FRONT}`,
  "i"
);

/** A row (or the rest of a sentence after "exited <place>") says the person
 * stayed out the front. A row that also says where they walked on to
 * ("towards …") or that they got into a vehicle is not that. */
export function saysStoodOutFront(text: string): boolean {
  if (!STOOD_OUT_FRONT_RE.test(text)) return false;
  return !/\btowards?\b|\bVehicle\s+[A-Za-z0-9]{5,8}\b/i.test(text);
}

// "SANTOS went out the front of 21 Hope Road and stood talking on the phone.",
// "SANTOS stood out the front." — no "exited" in the row. The place, when the
// row names one, follows "of".
const WENT_OUT_FRONT_RE = new RegExp(
  String.raw`([A-Za-z][^.\n]*?)\s*\b(?:${STAY_VERBS}|${GO_VERBS})\s+${OUT_FRONT}(?:\s+of\s+([A-Z0-9][A-Za-z0-9'&.\- ]*?))?(?=\s+(?:and|to|where|while|talking|speaking|on|then)\b|[,.]|$)`,
  "i"
);

export interface WentOutFront {
  names: string;
  /** The place named after "of", when there is one. */
  place: string | null;
}

export function matchWentOutFront(text: string): WentOutFront | null {
  if (!saysStoodOutFront(text)) return null;
  const m = text.match(WENT_OUT_FRONT_RE);
  if (!m) return null;
  // A row that says they exited a place is read by the exit rules instead.
  if (/\bexited\b/i.test(text)) return null;
  return { names: m[1].trim(), place: m[2]?.trim() || null };
}

// "SANTOS walked back to 21 Hope Road and continued out of sight.",
// "SANTOS walked back inside.", "SANTOS returned inside."
const WALKED_BACK_INSIDE_RE =
  /([A-Za-z][^.\n]*?)\s*\b(?:(?:walked|went|came|headed)\s+back|returned)\s+(?:(?:in)?to\s+([A-Z0-9][^.\n]*?)|inside|in)\s*(?:,?\s*and\s+continued\s+out\s+of\s+sight|(?=[.,])|$)/;

export interface WalkedBackInside {
  names: string;
  /** The place named, when there is one ("walked back inside" names none). */
  place: string | null;
}

export function matchWalkedBackInside(text: string): WalkedBackInside | null {
  const m = text.match(WALKED_BACK_INSIDE_RE);
  if (!m) return null;
  return { names: m[1].trim(), place: m[2]?.trim() || null };
}

/** What "Returned inside" writes: back to the place he stood out the front of. */
export function returnedInsideSentence(names: string, place: string): string {
  return `${names} walked back to ${place} and continued out of sight.`;
}
