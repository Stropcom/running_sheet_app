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
 *  - a capital letter at the start of the observation and after each full
 *    stop, "!" or "?" (and at the start of each new line);
 *  - (final pass only) a full stop at the end.
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
    if (
      words.length >= 2 &&
      /[A-Za-z0-9)]/.test(last) &&
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
  let out = joinVehicleLists(text);
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
  let cur = v.text;
  let at = v.caret;
  let changed = v.changed;
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
