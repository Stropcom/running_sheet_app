// The "New Intelligence" lines of one running sheet — what the Supervisor Summary
// shows and what the Weekly Report adds up. Pure rules, no database, no AI: the
// same rows give the same lines every time.
//
// Rules it keeps (this is an evidentiary record):
//  - every automatic line is one sentence an officer wrote, shown as written,
//    with the matched words picked out (`highlightSegments`) — never reworded;
//  - the numbers are STRAIGHT COUNTS of what is on the sheet (or, for the
//    Weekly Report, on that week's sheets): "×3 on this sheet" means three lines
//    of the same item or action. Nothing is carried over from other sheets, so
//    nothing can be read as "seen before";
//  - a supervisor can leave an automatic line out (untick) and add their own;
//    hand-added lines count like any other and say who added them;
//  - plain "met / spoke with" is not listed (too common to mean anything on its
//    own); hand-overs, exchanges and brief meetings are.

import {
  CUE_CATEGORY_LABELS,
  findIntelCues,
  findLeftOutSentences,
  type LeftOutSentence,
  type CueCategory,
  type IntelCue,
} from "./intelCues";

export { CUE_CATEGORY_LABELS };
export type { CueCategory };

/** Categories in the order the screen and the PDF list them. */
export const INTEL_CATEGORY_ORDER: CueCategory[] = [
  "items",
  "devices",
  "money",
  "meetings",
  "behaviour",
];

/** Headings that are not listed on their own (see the note at the top). */
const UNLISTED_HEADINGS = new Set(["Met / spoke with"]);

export interface IntelRowInput {
  id: number;
  time?: string | null;
  timeMinutes?: number | null;
  observation?: string | null;
}

export interface ManualIntelInput {
  id: number;
  category: string;
  heading: string;
  text: string;
  time?: string | null;
  timeMinutes?: number | null;
  addedByCIN: string;
}

export interface SheetIntelLine {
  /** Stable id for ticking: "<rowId>:<category>:<group>:<n>" or "m<id>". */
  key: string;
  source: "auto" | "manual";
  manualId?: number;
  rowId?: number;
  category: CueCategory;
  heading: string;
  /** What repeats are counted by (the item without its colour). */
  group: string;
  /** The officer's sentence, exactly as written. */
  sentence: string;
  /** The words that triggered it (for highlighting); empty for hand-added. */
  matched: string;
  /** Wording is unsure ("appeared to", "possibly"). */
  doubtful: boolean;
  /** The officer's own unsure word for the tag ("Appeared", "Possibly"). */
  doubtWord: string | null;
  time: string | null;
  timeMinutes: number | null;
  /** Who added a hand-added line. */
  addedByCIN?: string;
  /** Ticked — goes in the PDF and the Weekly Report. */
  included: boolean;
  /** Straight count of lines of this item or action on the sheet (1 = once). */
  groupCount: number;
}

const CATEGORY_SET = new Set<string>(INTEL_CATEGORY_ORDER);
export function isCueCategory(v: string): v is CueCategory {
  return CATEGORY_SET.has(v);
}

/** Key a cue by its row, kind and nth occurrence in that row, so an unticked
 * line stays unticked if the officer later fixes a typo in the sentence. */
export function cueKey(rowId: number, cue: IntelCue, nth: number): string {
  return `${rowId}:${cue.category}:${cue.group}:${nth}`;
}

export function manualKey(id: number): string {
  return `m${id}`;
}

function manualGroup(heading: string): string {
  return heading.trim().toLowerCase();
}

function byTime(
  a: { timeMinutes: number | null; rowId?: number; key: string },
  b: { timeMinutes: number | null; rowId?: number; key: string }
): number {
  // Lines without a time go last, in the order they were added.
  const am = a.timeMinutes ?? Number.MAX_SAFE_INTEGER;
  const bm = b.timeMinutes ?? Number.MAX_SAFE_INTEGER;
  if (am !== bm) return am - bm;
  const ar = a.rowId ?? Number.MAX_SAFE_INTEGER;
  const br = b.rowId ?? Number.MAX_SAFE_INTEGER;
  if (ar !== br) return ar - br;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Every New Intelligence line of one sheet, in time order, with the straight
 * count of each item or action. `hiddenKeys` are the lines the supervisor
 * unticked. */
export function buildSheetIntel(args: {
  rows: IntelRowInput[];
  manualLines?: ManualIntelInput[];
  hiddenKeys?: Iterable<string>;
}): SheetIntelLine[] {
  const hidden = new Set(args.hiddenKeys ?? []);
  const lines: SheetIntelLine[] = [];

  for (const row of args.rows) {
    const seen = new Map<string, number>();
    for (const cue of findIntelCues(row.observation)) {
      if (UNLISTED_HEADINGS.has(cue.heading)) continue;
      const base = `${cue.category}:${cue.group}`;
      const nth = seen.get(base) ?? 0;
      seen.set(base, nth + 1);
      const key = cueKey(row.id, cue, nth);
      lines.push({
        key,
        source: "auto",
        rowId: row.id,
        category: cue.category,
        heading: cue.heading,
        group: cue.group,
        sentence: cue.sentence,
        matched: cue.matched,
        doubtful: cue.doubtful,
        doubtWord: cue.doubtWord,
        time: row.time ?? null,
        timeMinutes: row.timeMinutes ?? null,
        included: !hidden.has(key),
        groupCount: 1,
      });
    }
  }

  for (const m of args.manualLines ?? []) {
    if (!isCueCategory(m.category)) continue;
    const key = manualKey(m.id);
    lines.push({
      key,
      source: "manual",
      manualId: m.id,
      category: m.category,
      heading: m.heading,
      group: manualGroup(m.heading),
      sentence: m.text,
      matched: "",
      doubtful: false,
      doubtWord: null,
      time: m.time ?? null,
      timeMinutes: m.timeMinutes ?? null,
      addedByCIN: m.addedByCIN,
      // Hand-added lines are always in the PDF; the supervisor removes one to
      // drop it.
      included: true,
      groupCount: 1,
    });
  }

  lines.sort(byTime);

  const counts = new Map<string, number>();
  for (const l of lines) {
    const g = `${l.category}:${l.group}`;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  for (const l of lines) l.groupCount = counts.get(`${l.category}:${l.group}`)!;
  return lines;
}

/** Sentences on the sheet that were left out on purpose (said not to have
 * happened, or quoted speech), in row order. */
export function leftOutOfSheet(
  rows: IntelRowInput[]
): Array<LeftOutSentence & { rowId: number; time: string | null }> {
  const out: Array<LeftOutSentence & { rowId: number; time: string | null }> =
    [];
  for (const row of rows)
    for (const l of findLeftOutSentences(row.observation))
      out.push({ ...l, rowId: row.id, time: row.time ?? null });
  return out;
}

/** The lines of one category, in time order. */
export function intelByCategory(
  lines: SheetIntelLine[]
): Array<{ category: CueCategory; label: string; lines: SheetIntelLine[] }> {
  return INTEL_CATEGORY_ORDER.map(category => ({
    category,
    label: CUE_CATEGORY_LABELS[category],
    lines: lines.filter(l => l.category === category),
  })).filter(g => g.lines.length > 0);
}

/** A sentence cut into plain and highlighted pieces, for the screen and the
 * PDF. The match is found without regard to capital letters; if it cannot be
 * found (the officer has since edited the row) nothing is highlighted. */
export function highlightSegments(
  sentence: string,
  matched: string
): Array<{ text: string; hit: boolean }> {
  if (!matched) return [{ text: sentence, hit: false }];
  const at = sentence.toLowerCase().indexOf(matched.toLowerCase());
  if (at < 0) return [{ text: sentence, hit: false }];
  const out: Array<{ text: string; hit: boolean }> = [];
  if (at > 0) out.push({ text: sentence.slice(0, at), hit: false });
  out.push({ text: sentence.slice(at, at + matched.length), hit: true });
  if (at + matched.length < sentence.length)
    out.push({ text: sentence.slice(at + matched.length), hit: false });
  return out;
}

// ─── Weekly Report: the "who / what" line ────────────────────────────────────

const CLAUSE_BREAK =
  /;|\s+and\s+then\s+|\s+then\s+|\s+but\s+|\s+while\s+|\s+before\s+|\s+after\s+|\s+and\s+(?=(?:he|she|they|walked|went|entered|exited|returned|drove|got|left|met|spoke|withdrew|deposited|handed|passed|used|placed|put|took|collected)\b)/gi;

const CLAUSE_MAX = 160;

/** The part of the sentence that holds the cue — what happened and, if the
 * officer named anyone, who. Taken word for word from the sentence (never
 * reworded); where the sentence names nobody it still says what happened. */
export function whoWhatClause(sentence: string, matched: string): string {
  const s = sentence.trim().replace(/[.\s]+$/, "");
  const at = matched ? s.toLowerCase().indexOf(matched.toLowerCase()) : -1;
  if (at < 0) return clip(s);
  let start = 0;
  let end = s.length;
  CLAUSE_BREAK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_BREAK.exec(s))) {
    const from = m.index;
    const to = m.index + m[0].length;
    if (to <= at) start = to;
    else if (from >= at + matched.length) {
      end = from;
      break;
    }
    if (m[0].length === 0) CLAUSE_BREAK.lastIndex++;
  }
  return clip(
    s
      .slice(start, end)
      .replace(/[\s,;:]+$/, "")
      .trim()
  );
}

function clip(s: string): string {
  if (s.length <= CLAUSE_MAX) return s;
  const cut = s.slice(0, CLAUSE_MAX);
  const sp = cut.lastIndexOf(" ");
  return (sp > 80 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

// ─── Weekly Report: add up a week ────────────────────────────────────────────

export interface WeeklyIntelInput {
  category: CueCategory;
  heading: string;
  group: string;
  /** The sentence (or the hand-added wording) and what triggered it. */
  sentence: string;
  matched: string;
  /** The calendar day it happened (YYYY-MM-DD). */
  date: string;
  addedByCIN?: string;
}

export interface WeeklyIntelItem {
  category: CueCategory;
  heading: string;
  group: string;
  /** One grey who / what line — the first (earliest) occurrence this week. */
  line: string;
  /** Days of the week it happened on (YYYY-MM-DD, sorted). */
  dates: string[];
  /** Straight count: how many lines of it this week. */
  count: number;
  /** Set when every line of it was hand-added: who added the first one. */
  addedByCIN?: string;
}

/** Group one week's lines by item or action. Straight counts only. */
export function aggregateWeeklyIntel(
  inputs: WeeklyIntelInput[]
): WeeklyIntelItem[] {
  const sorted = [...inputs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  const byGroup = new Map<string, WeeklyIntelItem>();
  const allManual = new Map<string, boolean>();
  for (const i of sorted) {
    const k = `${i.category}:${i.group}`;
    const manual = !!i.addedByCIN;
    let item = byGroup.get(k);
    if (!item) {
      item = {
        category: i.category,
        heading: i.heading,
        group: i.group,
        line: manual ? i.sentence : whoWhatClause(i.sentence, i.matched),
        dates: [],
        count: 0,
        addedByCIN: manual ? i.addedByCIN : undefined,
      };
      byGroup.set(k, item);
      allManual.set(k, true);
    }
    item.count++;
    if (!item.dates.includes(i.date)) item.dates.push(i.date);
    if (!manual) allManual.set(k, false);
  }
  for (const [k, item] of Array.from(byGroup.entries()))
    if (!allManual.get(k)) item.addedByCIN = undefined;
  const order = new Map(INTEL_CATEGORY_ORDER.map((c, i) => [c, i]));
  return Array.from(byGroup.values()).sort((a, b) => {
    const c = order.get(a.category)! - order.get(b.category)!;
    if (c !== 0) return c;
    if (a.count !== b.count) return b.count - a.count;
    return a.heading < b.heading ? -1 : a.heading > b.heading ? 1 : 0;
  });
}

// ─── Weekly Report: the day boxes ────────────────────────────────────────────

const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Seven boxes, Monday to Sunday, of the week the dates fall in — a box is lit
 * for each day the item happened on. Empty when there are no dates. */
export function weekDayBoxes(
  dates: string[]
): Array<{ letter: string; date: string; on: boolean }> {
  if (dates.length === 0) return [];
  const first = [...dates].sort()[0];
  const d = new Date(`${first}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  const on = new Set(dates);
  return WEEK_LETTERS.map((letter, i) => {
    const day = new Date(d.getTime() + (i - mondayOffset) * 86400000);
    const date = day.toISOString().slice(0, 10);
    return { letter, date, on: on.has(date) };
  });
}
