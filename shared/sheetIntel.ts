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
//  - one thing in one sentence is one line: "new laptop box", the "box" and the
//    "laptop" inside it are folded into the longest wording (`foldCuesInSentence`),
//    and what was folded stays on the line ("Also picked up") — grouped, never
//    dropped;
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

/** A cue folded into a longer one from the same sentence ("laptop" inside "new
 * laptop box"). Kept on the line so nothing picked up is lost. */
export interface FoldedCue {
  category: CueCategory;
  heading: string;
  group: string;
  matched: string;
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
  /** Shorter pickups of the same thing in the same sentence, folded into this
   * line (never dropped). Empty for hand-added lines. */
  alsoMatched: FoldedCue[];
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

// ─── One thing in one sentence is one line ───────────────────────────────────

const CATEGORY_RANK = new Map(INTEL_CATEGORY_ORDER.map((c, i) => [c, i]));

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordRe(s: string, flags = "gi"): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9])${escapeRe(s.trim()).replace(/\s+/g, "\\s+")}(?![A-Za-z0-9])`,
    flags
  );
}

function countIn(text: string, term: string): number {
  return (text.match(wordRe(term)) ?? []).length;
}

/** `inner` is `outer` or a run of its words ("laptop" in "new laptop box"). */
function wordsWithin(outer: string, inner: string): boolean {
  const o = outer.trim();
  const i = inner.trim();
  return !!i && wordRe(i, "i").test(o);
}

/** May `c` be folded into the longer cue `l` of the same sentence?
 *  - the same kind (items, devices, …) and `c` is just the item's own noun
 *    ("box" beside "new laptop box" — the same box), or `c`'s words are inside
 *    `l`'s ("laptop box" beside "new laptop box");
 *  - an item and a device only when the device word sits inside the item's
 *    wording ("laptop" inside "new laptop box") and appears nowhere else in the
 *    sentence — a laptop used on its own later in the sentence stays its own
 *    line;
 *  - money, meetings and behaviour never fold into anything else, and nothing
 *    folds into them. Two different things of the same kind ("red box", "blue
 *    box") stay two lines. */
function mayFold(l: IntelCue, c: IntelCue, sentence: string): boolean {
  const sameKind = l.category === c.category;
  const objectKinds =
    (l.category === "items" || l.category === "devices") &&
    (c.category === "items" || c.category === "devices");
  if (!sameKind && !objectKinds) return false;
  const bare = c.matched.trim().toLowerCase();
  if (
    sameKind &&
    l.category === "items" &&
    c.group === l.group &&
    bare === c.group
  )
    return true;
  if (!wordsWithin(l.matched, c.matched)) return false;
  if (sameKind) return true;
  // Item ↔ device: every mention of the word must be inside the longer wording.
  const inside =
    countIn(l.matched, c.matched) * Math.max(1, countIn(sentence, l.matched));
  return countIn(sentence, c.matched) <= inside;
}

/** The cues of ONE sentence with each shorter pickup of the same thing folded
 * into the longest wording. Every input cue ends up either as a leader or in
 * exactly one leader's `also` — none is dropped. Leaders keep the order they
 * came in. Pure. */
export function foldCuesInSentence(
  cues: IntelCue[]
): Array<{ cue: IntelCue; also: IntelCue[] }> {
  if (cues.length < 2) return cues.map(cue => ({ cue, also: [] }));
  const order = cues
    .map((cue, i) => ({ cue, i }))
    .sort((a, b) => {
      const d = b.cue.matched.trim().length - a.cue.matched.trim().length;
      if (d !== 0) return d;
      const r =
        CATEGORY_RANK.get(a.cue.category)! - CATEGORY_RANK.get(b.cue.category)!;
      if (r !== 0) return r;
      return a.i - b.i;
    });
  const leaders: Array<{ cue: IntelCue; i: number; also: IntelCue[] }> = [];
  for (const { cue, i } of order) {
    const into = leaders.find(l => mayFold(l.cue, cue, cue.sentence));
    if (into) into.also.push(cue);
    else leaders.push({ cue, i, also: [] });
  }
  return leaders
    .sort((a, b) => a.i - b.i)
    .map(({ cue, also }) => ({ cue, also }));
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
    // Keys are worked out over EVERY cue first, so an unticked line keeps its
    // key whatever gets folded into it.
    const keyed = findIntelCues(row.observation)
      .filter(cue => !UNLISTED_HEADINGS.has(cue.heading))
      .map(cue => {
        const base = `${cue.category}:${cue.group}`;
        const nth = seen.get(base) ?? 0;
        seen.set(base, nth + 1);
        return { cue, key: cueKey(row.id, cue, nth) };
      });
    const keyOf = new Map(keyed.map(k => [k.cue, k.key]));
    // Fold one sentence at a time (its cues are together, in order).
    const bySentence = new Map<string, IntelCue[]>();
    for (const { cue } of keyed) {
      const list = bySentence.get(cue.sentence);
      if (list) list.push(cue);
      else bySentence.set(cue.sentence, [cue]);
    }
    const folded = Array.from(bySentence.values()).flatMap(foldCuesInSentence);
    for (const { cue, also } of folded) {
      const key = keyOf.get(cue)!;
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
        alsoMatched: also.map(a => ({
          category: a.category,
          heading: a.heading,
          group: a.group,
          matched: a.matched,
        })),
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
      alsoMatched: [],
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
 * found (the officer has since edited the row) nothing is highlighted. Words
 * folded into the line (`also`) are picked out wherever they stand in the
 * sentence, so "placed the box" is marked beside "new laptop box". */
export function highlightSegments(
  sentence: string,
  matched: string,
  also: readonly string[] = []
): Array<{ text: string; hit: boolean }> {
  if (!matched) return [{ text: sentence, hit: false }];
  const at = sentence.toLowerCase().indexOf(matched.toLowerCase());
  if (at < 0) return [{ text: sentence, hit: false }];
  const ranges: Array<[number, number]> = [[at, at + matched.length]];
  for (const term of also) {
    if (!term.trim()) continue;
    const re = wordRe(term);
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence)))
      ranges.push([m.index, m.index + m[0].length]);
  }
  ranges.sort((x, y) => x[0] - y[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Array<{ text: string; hit: boolean }> = [];
  let pos = 0;
  for (const [from, to] of merged) {
    if (from > pos) out.push({ text: sentence.slice(pos, from), hit: false });
    out.push({ text: sentence.slice(from, to), hit: true });
    pos = to;
  }
  if (pos < sentence.length)
    out.push({ text: sentence.slice(pos), hit: false });
  return out;
}

/** "Laptop (Devices)" / "Box" — a folded pickup, named for the line's tag. The
 * kind is added only when it differs from the line's own. */
export function foldedLabel(f: FoldedCue, lineCategory: CueCategory): string {
  return f.category === lineCategory
    ? f.heading
    : `${f.heading} (${CUE_CATEGORY_LABELS[f.category]})`;
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
  /** Pickups folded into this line (see `foldCuesInSentence`). */
  also?: FoldedCue[];
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
  /** What else those lines picked up in the same sentences (folded in, never
   * dropped), as tag text, in first-seen order. */
  also: string[];
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
        also: [],
        addedByCIN: manual ? i.addedByCIN : undefined,
      };
      byGroup.set(k, item);
      allManual.set(k, true);
    }
    item.count++;
    for (const f of i.also ?? []) {
      const label = foldedLabel(f, i.category);
      if (!item.also.includes(label)) item.also.push(label);
    }
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
