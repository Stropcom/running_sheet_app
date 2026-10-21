/**
 * The tidy-up pass for an observation an officer has just typed: the fixes
 * they would make by hand, applied in one go.
 *
 *  - vehicles listed one after another get their commas, "and" and "a" / "an"
 *    (shared/vehicleList.ts);
 *  - the small joining words and full stops between pieces — a full stop
 *    between two whole sentences, "at" before an address after "Surveillance
 *    commenced", "and" between people (shared/sentenceJoin.ts);
 *  - one space between words (never a run of two or more);
 *  - a space after a comma that is missing one ("shop,then" → "shop, then");
 *  - slips: a street type glued to the next word ("Streetand"), the same
 *    joining word twice in a row ("and and"), a doubled comma, and a full
 *    stop in the middle of a sentence ("entered. 64 Sewell Street") —
 *    `repairEdits`, run first so the rules below see the corrected text;
 *  - a capital letter at the start of the observation and after each full
 *    stop, "!" or "?" (and at the start of each new line);
 *  - (final pass only) a full stop at the end — never straight after a word
 *    the sentence can't finish on ("entered", "and", "the"…).
 *
 * Deliberately cautious — it never rewrites wording, never lower-cases
 * anything, and leaves alone anything it isn't sure of: a sentence that opens
 * with a colour ("white Lexus …"), a rego or number, a word with a capital
 * inside it ("iPhone"), the text after an abbreviation ("approx. 5 minutes"),
 * and text inside a bracket. It is only ever run on text an officer typed;
 * chips, shortcuts and Target Logger sentences are never passed through it
 * on their own. Pure and deterministic: no AI, same input → same output.
 */
import { sentenceJoinEdits, type SentenceJoinOptions } from "./sentenceJoin";
import { FULL_STREET_TYPES } from "./streetTypes";
import { leadingColourPhrase } from "./vehicleColour";
import {
  applyEdits,
  joinVehicleLists,
  joinVehicleListsAtCaret,
  type VehicleEdit,
} from "./vehicleList";

/** Words that end in a full stop without ending the sentence. */
const ABBREVIATIONS = new Set(
  "etc eg ie vs approx nos dr mr mrs ms jr sr st cnr tel".split(" ")
);

function wordBefore(text: string, index: number): string {
  let i = index;
  while (i > 0 && /[A-Za-z.]/.test(text[i - 1])) i--;
  return text.slice(i, index).replace(/\./g, "").toLowerCase();
}

/** True when `index` is inside a (...) bracket. */
function insideBracket(text: string, index: number): boolean {
  const open = text.lastIndexOf("(", index);
  if (open === -1) return false;
  const close = text.indexOf(")", open);
  return close === -1 || close >= index;
}

/** Whether the word starting at `index` should be left lower case. */
function leaveLowerCase(text: string, index: number): boolean {
  const m = /^\S+/.exec(text.slice(index));
  if (!m) return true;
  const token = m[0];
  if (!/^[a-z]/.test(token)) return true; // already capital, a digit, a bracket…
  if (/\d/.test(token)) return true; // a rego or number
  if (/[A-Z]/.test(token)) return true; // "iPhone"
  // A sentence opening with a colour: "white Lexus …" — the colour rule
  // (shared/vehicleColour.ts) keeps colours lower case.
  if (leadingColourPhrase(text.slice(index))) return true;
  return false;
}

/** Small words that are never said twice running. */
const REPEATABLE_FUNCTION_WORDS =
  "and|the|a|an|of|to|at|with|for|from|or|but".split("|");
const DOUBLED_WORD = new RegExp(
  `\\b(${REPEATABLE_FUNCTION_WORDS.join("|")})((?:[ \\t]+\\1\\b)+)`,
  "gi"
);
/** A street type typed straight into the next word: "Streetand continued". */
const GLUED_STREET_TYPE = new RegExp(
  `\\b(${FULL_STREET_TYPES.join("|")})(and|then)\\b`,
  "g"
);
/** Words that cannot end a sentence: a full stop straight after one is a slip. */
const CANNOT_END_SENTENCE = new RegExp(
  "\\b(entered|and|the|of|to|at|with|for|from|or|but|into|towards|via|onto)\\.(?=[ \\t]+\\S)",
  "g"
);

/** Words an observation can't finish on: "HOGAN entered" is waiting for a
 * place, "… and" for what comes next, so no closing full stop goes after them
 * (the rest of the sentence, or a chip, is still to be added). */
const UNFINISHED_ENDINGS = new Set(
  (
    "entered and the a an of to at with for from or but into towards via " +
    "onto then while who"
  ).split(" ")
);

/**
 * The edits for slips made while typing, one pass each:
 *  - a street type glued to "and" / "then" ("Streetand" → "Street and");
 *  - the same function word twice or more in a row ("and and" → "and");
 *  - a doubled comma (",," or ", ," → ",");
 *  - a full stop in the middle of a sentence: straight after a joining word
 *    ("walked to the. 64 Smith Street") when a number or a lower-case word
 *    follows, and straight after "entered" only when an address follows
 *    ("entered. 64 Sewell Street"). A name or a capital after "entered." is
 *    left alone — it may be the start of the next sentence.
 * Never touches text inside brackets, never changes a word's spelling or case.
 */
export function repairEdits(text: string): VehicleEdit[] {
  const edits: VehicleEdit[] = [];
  let m: RegExpExecArray | null;

  const doubled = new RegExp(DOUBLED_WORD.source, DOUBLED_WORD.flags);
  while ((m = doubled.exec(text)) !== null) {
    if (insideBracket(text, m.index)) continue;
    edits.push({
      start: m.index + m[1].length,
      end: m.index + m[0].length,
      insert: "",
    });
  }

  const commas = /,(?:[ \t]*,)+/g;
  while ((m = commas.exec(text)) !== null) {
    if (insideBracket(text, m.index)) continue;
    edits.push({ start: m.index, end: m.index + m[0].length, insert: "," });
  }

  const stops = new RegExp(CANNOT_END_SENTENCE.source, "g");
  while ((m = stops.exec(text)) !== null) {
    const stopAt = m.index + m[1].length;
    if (insideBracket(text, stopAt)) continue;
    const next = /^[ \t]+(\S+)(?:[ \t]+(\S+))?/.exec(text.slice(stopAt + 1));
    if (!next) continue;
    const digitLed = /^\d/.test(next[1]);
    const ok =
      m[1] === "entered"
        ? digitLed && !!next[2] && /^[A-Z]/.test(next[2])
        : digitLed || /^[a-z]/.test(next[1]);
    if (ok) edits.push({ start: stopAt, end: stopAt + 1, insert: "" });
  }
  return edits;
}

/** `repairEdits` applied, a glued street type first so what follows it is seen. */
export function repairObservation(text: string): string {
  return repairObservationAtCaret(text, 0).text;
}

/**
 * Every typing-slip edit for `text` in one list, positions in the original
 * text (a glued street type plus `repairEdits`), for Check Sheet to flag on
 * rows written before the live repair existed.
 */
export function slipEdits(text: string): VehicleEdit[] {
  const edits: VehicleEdit[] = [];
  const g = new RegExp(GLUED_STREET_TYPE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    if (insideBracket(text, m.index)) continue;
    const pos = m.index + m[1].length;
    edits.push({ start: pos, end: pos, insert: " " });
  }
  return [...edits, ...repairEdits(text)].sort((a, b) => a.start - b.start);
}

/** Same, for a field being typed in: the caret keeps its place in the text. */
export function repairObservationAtCaret(
  text: string,
  caret: number
): { text: string; caret: number; changed: boolean } {
  let cur = text;
  let at = caret;
  let changed = false;
  const glued: VehicleEdit[] = [];
  const g = new RegExp(GLUED_STREET_TYPE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(cur)) !== null) {
    if (insideBracket(cur, m.index)) continue;
    const pos = m.index + m[1].length;
    glued.push({ start: pos, end: pos, insert: " " });
  }
  if (glued.length) {
    at = shiftCaret(glued, at);
    cur = applyEdits(cur, glued);
    changed = true;
  }
  const rest = repairEdits(cur);
  if (rest.length) {
    at = shiftCaret(rest, at);
    cur = applyEdits(cur, rest);
    changed = true;
  }
  return { text: cur, caret: at, changed };
}

/** The edits for one pass over `text`. `final` also adds the closing full stop. */
export function tidyEdits(text: string, final: boolean): VehicleEdit[] {
  const edits: VehicleEdit[] = [];
  const n = text.length;

  // One space between words (not at the start or end of a line, and not a
  // deliberate run of indentation).
  const spaces = /(?<=\S)[ \t]{2,}(?=\S)/g;
  let m: RegExpExecArray | null;
  while ((m = spaces.exec(text)) !== null)
    edits.push({ start: m.index, end: m.index + m[0].length, insert: " " });

  // A space after a comma that has none: "a,b" → "a, b" (never "1,000").
  const commas = /(?<=[A-Za-z)]),(?=[A-Za-z(])/g;
  while ((m = commas.exec(text)) !== null)
    edits.push({ start: m.index + 1, end: m.index + 1, insert: " " });

  // A capital at the start, after . ! ? and at the start of each line.
  const starts: number[] = [];
  const firstLetter = /\S/.exec(text);
  if (firstLetter) starts.push(firstLetter.index);
  const afterStop = /([A-Za-z)"'])([.!?])([ \t]+)(?=\S)/g;
  while ((m = afterStop.exec(text)) !== null) {
    const stopAt = m.index + 1;
    if (m[2] === "." && ABBREVIATIONS.has(wordBefore(text, stopAt))) continue;
    // a single capital letter before the stop is an initial ("J. Smith")
    if (m[2] === "." && /(?:^|[\s(])[A-Z]$/.test(text.slice(0, stopAt)))
      continue;
    starts.push(stopAt + 1 + m[3].length);
  }
  const lines = /\n[ \t]*(?=\S)/g;
  while ((m = lines.exec(text)) !== null) starts.push(m.index + m[0].length);
  for (const at of starts) {
    if (at >= n || insideBracket(text, at)) continue;
    if (leaveLowerCase(text, at)) continue;
    edits.push({ start: at, end: at + 1, insert: text[at].toUpperCase() });
  }

  // The closing full stop (only when finishing the observation).
  if (final) {
    const trimmed = text.replace(/\s+$/, "");
    const words = trimmed.split(/\s+/).filter(Boolean);
    const last = trimmed[trimmed.length - 1];
    const lastWord = (words[words.length - 1] ?? "").toLowerCase();
    if (
      words.length >= 2 &&
      /[A-Za-z0-9)]/.test(last) &&
      !UNFINISHED_ENDINGS.has(lastWord) &&
      !(words.length === 1 && trimmed.toLowerCase() === "tv")
    )
      edits.push({
        start: trimmed.length,
        end: trimmed.length,
        insert: ".",
      });
  }
  return edits;
}

/** The observation tidied: vehicle lists first, then joining words, then the rules above. */
export function tidyObservation(
  text: string,
  final = false,
  opts: SentenceJoinOptions = {}
): string {
  if (!text) return text;
  // "tv" on its own is a trigger the running sheet acts on — never touched.
  if (text.trim().toLowerCase() === "tv") return text;
  let out = repairObservation(joinVehicleLists(text));
  const joins = sentenceJoinEdits(out, opts);
  if (joins.length) out = applyEdits(out, joins);
  const edits = tidyEdits(out, final);
  return edits.length ? applyEdits(out, edits) : out;
}

/**
 * Only the joining of pieces — vehicle lists and the joining words — without
 * the capitals, spacing and full-stop fixes. For text assembled purely from
 * chips and Target Logger buttons, where nothing was typed to tidy.
 */
export function joinObservationPieces(
  text: string,
  opts: SentenceJoinOptions = {}
): string {
  if (!text || text.trim().toLowerCase() === "tv") return text;
  const out = joinVehicleLists(text);
  const joins = sentenceJoinEdits(out, opts);
  return joins.length ? applyEdits(out, joins) : out;
}

/** Where a caret at `caret` ends up after `edits` are applied. */
function shiftCaret(edits: VehicleEdit[], caret: number): number {
  let shift = 0;
  for (const e of edits) {
    if (e.end <= caret) shift += e.insert.length - (e.end - e.start);
    else if (e.start < caret) shift += e.insert.length - (caret - e.start);
  }
  return Math.max(0, caret + shift);
}

/** Same, for a field being typed in: the caret keeps its place in the text. */
export function tidyObservationAtCaret(
  text: string,
  caret: number,
  final = false,
  opts: SentenceJoinOptions = {}
): { text: string; caret: number; changed: boolean } {
  if (text.trim().toLowerCase() === "tv")
    return { text, caret, changed: false };
  const v = joinVehicleListsAtCaret(text, caret);
  const r = repairObservationAtCaret(v.text, v.caret);
  let cur = r.text;
  let at = r.caret;
  let changed = v.changed || r.changed;
  const joins = sentenceJoinEdits(cur, opts);
  if (joins.length) {
    cur = applyEdits(cur, joins);
    at = shiftCaret(joins, at);
    changed = true;
  }
  const edits = tidyEdits(cur, final);
  if (edits.length === 0) return { text: cur, caret: at, changed };
  return {
    text: applyEdits(cur, edits),
    caret: shiftCaret(edits, at),
    changed: true,
  };
}

/** True when the text just before the caret ends with a closing bracket and a space. */
export function justTypedSpaceAfterBracket(
  text: string,
  caret: number
): boolean {
  return /\)[ \t]$/.test(text.slice(0, caret));
}
