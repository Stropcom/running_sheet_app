/**
 * Joining words and punctuation between pieces of an observation an officer
 * has just typed — the small "function words" that hold a sentence together.
 * Three rules, each only ever filling a GAP between two pieces of text; none
 * rewrites, removes or re-cases a word that is already there:
 *
 *  1. Full stop between two whole sentences. When a whole-sentence phrase
 *     ("Surveillance commenced", "Out of sight", "PHOTOGRAPH/S TAKEN", …) is
 *     followed straight away by a capitalised word, the sentence has ended:
 *     "Out of sight Vehicle …" → "Out of sight. Vehicle …".
 *  2. "at" before an address. "Surveillance commenced" / "Surveillance
 *     ceased" followed straight away by a street address gets "at":
 *     "Surveillance commenced 7/31 Marine Parade …" →
 *     "Surveillance commenced at 7/31 Marine Parade …".
 *  3. "and" / commas between people. Two or more people introduced one after
 *     another ("Name SURNAME (SURNAME)") with nothing between them are a list:
 *     "A and B", "A, B and C" (the same shape vehicle lists use).
 *
 * Like the rest of the tidy-up (shared/observationTidy.ts) it is only run on
 * text an officer typed — never on a row a chip or the Target Logger made —
 * and it is cautious: anything it is not sure of is left exactly as written.
 * Pure and deterministic: no AI, same input → same output.
 */
import { FULL_STREET_TYPES } from "./streetTypes";
import type { VehicleEdit } from "./vehicleList";

/** The whole-sentence phrases the standard chips insert. */
export const BUILTIN_SENTENCE_CHIPS: readonly string[] = [
  "Surveillance commenced",
  "Surveillance ceased",
  "Out of sight",
  "Continued out of sight",
  "PHOTOGRAPH/S TAKEN",
];

/** Words a phrase ends on when it is only the start of something longer. */
const JOINERS = new Set(
  (
    "and or but then to at in on of via towards toward from with by the a an " +
    "as while until before after when into onto along past for into over " +
    "under near behind outside inside"
  ).split(" ")
);

/** Capitalised words that open a sentence of their own rather than a name. */
const NOT_A_GIVEN_NAME = new Set(
  (
    "and or but then with while as until before after when seen met observed " +
    "sighted walked entered exited departed arrived left joined spoke " +
    "approached vehicle surveillance out continued photograph male female " +
    "person persons target he she they it the a an"
  ).split(" ")
);

/** Words that plainly open a new sentence after "Surveillance commenced/ceased". */
const NEW_SENTENCE_OPENERS = new Set(
  "vehicle surveillance out continued photograph/s photographs male female".split(
    " "
  )
);

/**
 * Which of the shortcut expansions are whole sentences the joiner may rely on:
 * plain words only (no brackets, commas, digits or [blanks]), starting with a
 * capital, at least two words, and not ending on a joining word. A fragment
 * like "arrived and" or "driver and sole occupant" is never one.
 */
export function wholeSentenceChips(
  expansions: readonly (string | null | undefined)[]
): string[] {
  const out: string[] = [];
  for (const raw of expansions) {
    const text = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!/^[A-Z][A-Za-z/'’-]*(?: [A-Za-z/'’-]+)+$/.test(text)) continue;
    const words = text.split(" ");
    if (words.length > 6) continue;
    if (JOINERS.has(words[words.length - 1].toLowerCase())) continue;
    out.push(text);
  }
  return out;
}

export interface SentenceJoinOptions {
  /** More whole-sentence phrases (see wholeSentenceChips); the built-in ones always apply. */
  sentenceChips?: readonly string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function insideBracket(text: string, index: number): boolean {
  const open = text.lastIndexOf("(", index);
  if (open === -1) return false;
  const close = text.indexOf(")", open);
  return close === -1 || close >= index;
}

// ─── 1. full stop between two whole sentences ──────────────────────────────

function fullStopEdits(text: string, chips: readonly string[]): VehicleEdit[] {
  const at = new Set<number>();
  for (const chip of chips) {
    const body = chip.trim().split(/\s+/).map(escapeRe).join("\\s+");
    const re = new RegExp(
      `(?<![A-Za-z0-9/'’-])${body}(?![A-Za-z0-9/'’-])`,
      "gi"
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const end = m.index + m[0].length;
      if (insideBracket(text, m.index)) continue;
      const next = /^[ \t]+([A-Z][A-Za-z'’/-]*)/.exec(text.slice(end));
      if (!next) continue; // end of text, a digit, punctuation, lower case…
      if (JOINERS.has(next[1].toLowerCase())) continue;
      // "Surveillance commenced/ceased" usually takes a place straight after
      // it ("… Southlands"), so only treat the next word as a new sentence
      // when it plainly opens one.
      if (
        /^surveillance\s/i.test(chip) &&
        !NEW_SENTENCE_OPENERS.has(next[1].toLowerCase())
      )
        continue;
      at.add(end);
    }
  }
  return Array.from(at).map(end => ({ start: end, end, insert: "." }));
}

// ─── 2. "at" before an address ─────────────────────────────────────────────

const ADDRESS_AFTER = new RegExp(
  "^[ \\t]+\\d{1,5}[A-Za-z]?(?:\\/\\d{1,5}[A-Za-z]?)?[ \\t]+" +
    "(?:[A-Z][A-Za-z'’-]*[ \\t]+){1,4}?" +
    `(?:${FULL_STREET_TYPES.join("|")})\\b`,
  "i"
);

function atAddressEdits(text: string): VehicleEdit[] {
  const edits: VehicleEdit[] = [];
  const re = /(?<![A-Za-z0-9])Surveillance[ \t]+(?:commenced|ceased)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (insideBracket(text, m.index)) continue;
    if (ADDRESS_AFTER.test(text.slice(end)))
      edits.push({ start: end, end, insert: " at" });
  }
  return edits;
}

// ─── 3. "and" / commas between people ──────────────────────────────────────

const PERSON = new RegExp(
  "(?<![A-Za-z'’(-])((?:[A-Z][a-z'’-]+[ \\t]+){1,3}[A-Z][A-Z'’-]+" +
    "(?:,[ \\t]*born[ \\t]+\\d{1,2}[ \\t]+[A-Za-z]+[ \\t]+\\d{4})?" +
    "[ \\t]*\\([A-Z][A-Za-z'’. -]{0,30}\\))",
  "g"
);

interface PersonSpan {
  start: number;
  end: number;
}

function personSpans(text: string): PersonSpan[] {
  const spans: PersonSpan[] = [];
  PERSON.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERSON.exec(text)) !== null) {
    let start = m.index;
    const end = m.index + m[0].length;
    // Drop leading words that open a sentence rather than name a person
    // ("Seen Karim Elias NAJJAR (NAJJAR)").
    let phrase = m[0];
    for (;;) {
      const first = /^([A-Za-z'’-]+)[ \t]+(?=\S)/.exec(phrase);
      if (!first || !NOT_A_GIVEN_NAME.has(first[1].toLowerCase())) break;
      start += first[0].length;
      phrase = phrase.slice(first[0].length);
    }
    // Needs at least one given name left: "Given SURNAME (…)".
    if (!/^[A-Z][a-z'’-]+[ \t]+/.test(phrase)) continue;
    spans.push({ start, end });
  }
  return spans;
}

function personListEdits(text: string): VehicleEdit[] {
  const spans = personSpans(text);
  const edits: VehicleEdit[] = [];
  let chain: PersonSpan[] = [];
  const flush = () => {
    if (chain.length >= 2) {
      const gaps = chain.slice(1).map((s, i) => ({
        start: chain[i].end,
        end: s.start,
      }));
      const bare = gaps.some(g => /^[ \t]*$/.test(text.slice(g.start, g.end)));
      if (bare) {
        gaps.forEach((g, i) => {
          const want = i === gaps.length - 1 ? " and " : ", ";
          if (text.slice(g.start, g.end) !== want)
            edits.push({ start: g.start, end: g.end, insert: want });
        });
      }
    }
    chain = [];
  };
  for (const s of spans) {
    const prev = chain[chain.length - 1];
    if (!prev) {
      chain = [s];
      continue;
    }
    const gap = text.slice(prev.end, s.start);
    if (
      /^(?:[ \t]*|[ \t]*,[ \t]*|[ \t]+and[ \t]+|[ \t]*,[ \t]*and[ \t]+)$/i.test(
        gap
      )
    )
      chain.push(s);
    else {
      flush();
      chain = [s];
    }
  }
  flush();
  return edits;
}

/** Every joining edit for `text`, in order and not overlapping. */
export function sentenceJoinEdits(
  text: string,
  opts: SentenceJoinOptions = {}
): VehicleEdit[] {
  if (!text) return [];
  const chips = [...BUILTIN_SENTENCE_CHIPS, ...(opts.sentenceChips ?? [])];
  return [
    ...fullStopEdits(text, chips),
    ...atAddressEdits(text),
    ...personListEdits(text),
  ].sort((a, b) => a.start - b.start);
}
