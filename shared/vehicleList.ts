/**
 * Vehicles written one after another in an observation need list punctuation:
 *
 *   "… (Vehicle 1TDM414) … (Vehicle 1TMD414)"
 *       → "… (Vehicle 1TDM414) and … (Vehicle 1TMD414)"
 *   three or more: commas between them, with "and" before the last —
 *       "A, B and C", "A, B, C and D" (no comma before the "and").
 *
 * A vehicle ends at its "(Vehicle REGO)" bracket; what sits between one
 * bracket and the next is the next vehicle's description. Only a gap that
 * looks like a vehicle description is treated as a list — a sentence like
 * "(Vehicle A) then drove to the shop and later a Ford (Vehicle B)" is left
 * alone. Pure and deterministic: no AI, same input → same output.
 *
 * Used live (on Space after a bracket, and when the field loses focus — the
 * main running sheet and the RS Quick Entry pop-up) and by Check Sheet, which
 * offers a one-tap fix for rows written before this rule.
 */

export interface VehicleEdit {
  /** Where in the original text. */
  start: number;
  end: number;
  insert: string;
}

interface Bracket {
  start: number;
  end: number;
  rego: string;
}

type LinkKind = "bare" | "joined";

interface Link {
  kind: LinkKind;
  /** The separator in the original text, between the two vehicles' text:
   * [sepStart, sepEnd) — whitespace for a bare link, ", " / " and " / ", and "
   * for a joined one. */
  sepStart: number;
  sepEnd: number;
}

export interface VehicleChain {
  /** Bracket of every vehicle in the list, in order. */
  brackets: Bracket[];
  /** links[i] joins vehicle i and i + 1. */
  links: Link[];
}

const BRACKET_RE = /\(Vehicle\s+([^()\n]+?)\s*\)/gi;

/** Words that mean a stretch of text is narrative, not a vehicle description. */
const NOT_A_DESCRIPTION = new Set(
  (
    "a an the and or but then to from into onto in at on by with for of as " +
    "was were is are be been being has had have did do does " +
    "drove driving left leave leaving arrived arriving departed departing " +
    "entered entering exited exiting followed following seen observed " +
    "got get went go walked walking parked parking stopped stopping " +
    "turned turning continued ceased commenced later also near towards " +
    "driver passenger occupant occupied"
  ).split(" ")
);

/** A description that opens with one of these carries on the PREVIOUS vehicle
 * ("White Lexus NX350h (Vehicle NX350H) station sedan, bearing …"), so it is
 * not a new vehicle. */
const BODY_WORDS = new Set(
  (
    "station sedan wagon van ute utility hatch hatchback coupe truck bus suv " +
    "4wd 4x4 motorcycle cab dual convertible"
  ).split(" ")
);

function isDescription(desc: string, rego: string): boolean {
  const d = desc.trim();
  if (d === "") return true; // "(Vehicle A) (Vehicle B)"
  // A bare rego — what the Space-completion writes: "1ABC123 (Vehicle 1ABC123)".
  if (
    d.toUpperCase().replace(/\s+/g, "") ===
    rego.toUpperCase().replace(/\s+/g, "")
  )
    return true;
  if (/[.;:!?\n()]/.test(d)) return false;
  const bearing = /^(.*?),\s*bearing\b/i.exec(d);
  const head = bearing ? bearing[1] : d;
  if (!bearing && /,/.test(d)) return false;
  const words = head.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > (bearing ? 10 : 6)) return false;
  if (BODY_WORDS.has(words[0].toLowerCase())) return false;
  if (
    words.some(w =>
      NOT_A_DESCRIPTION.has(w.toLowerCase().replace(/[^a-z]/g, ""))
    )
  )
    return false;
  if (bearing && d.length > 200) return false;
  return true;
}

function bracketsOf(text: string): Bracket[] {
  const out: Bracket[] = [];
  const re = new RegExp(BRACKET_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, rego: m[1] });
  }
  return out;
}

/** How the gap between two vehicle brackets joins them, or null if it doesn't. */
function classifyGap(text: string, prev: Bracket, next: Bracket): Link | null {
  const gap = text.slice(prev.end, next.start);
  // Already punctuated: ", White Toyota …", " and White Toyota …", ", and …".
  const joined = /^(,\s+and\s+|,\s+|\s+and\s+)/i.exec(gap);
  if (joined) {
    if (!isDescription(gap.slice(joined[0].length), next.rego)) return null;
    return {
      kind: "joined",
      sepStart: prev.end,
      sepEnd: prev.end + joined[0].length,
    };
  }
  // Unpunctuated: spaces/tabs only (a new line is a deliberate break).
  const ws = /^[ \t]+/.exec(gap);
  if (!ws) return null;
  if (!isDescription(gap.slice(ws[0].length), next.rego)) return null;
  return { kind: "bare", sepStart: prev.end, sepEnd: prev.end + ws[0].length };
}

/** Every run of two or more vehicles written one after another. */
export function findVehicleChains(text: string): VehicleChain[] {
  const brackets = bracketsOf(text);
  const chains: VehicleChain[] = [];
  let cur: VehicleChain | null = null;
  for (let i = 0; i < brackets.length; i++) {
    if (!cur) {
      cur = { brackets: [brackets[i]], links: [] };
      continue;
    }
    const link = classifyGap(
      text,
      cur.brackets[cur.brackets.length - 1],
      brackets[i]
    );
    if (link) {
      cur.links.push(link);
      cur.brackets.push(brackets[i]);
    } else {
      if (cur.brackets.length > 1) chains.push(cur);
      cur = { brackets: [brackets[i]], links: [] };
    }
  }
  if (cur && cur.brackets.length > 1) chains.push(cur);
  return chains;
}

/**
 * The edits that punctuate every list that has an unpunctuated link. A list
 * with at least one bare link is written out in full: ", " between each pair
 * and " and " before the last, so a list that grew one vehicle at a time
 * ("A and B" + C) becomes "A, B and C". A list already fully punctuated is
 * never touched.
 */
export function vehicleListEdits(text: string): VehicleEdit[] {
  const edits: VehicleEdit[] = [];
  for (const chain of findVehicleChains(text)) {
    if (!chain.links.some(l => l.kind === "bare")) continue;
    const last = chain.links.length - 1;
    chain.links.forEach((l, i) => {
      const want = i === last ? " and " : ", ";
      if (text.slice(l.sepStart, l.sepEnd) !== want)
        edits.push({ start: l.sepStart, end: l.sepEnd, insert: want });
    });
  }
  return edits;
}

export function applyEdits(text: string, edits: VehicleEdit[]): string {
  let out = "";
  let at = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    out += text.slice(at, e.start) + e.insert;
    at = e.end;
  }
  return out + text.slice(at);
}

/** The text with every vehicle list punctuated. */
export function joinVehicleLists(text: string): string {
  const edits = vehicleListEdits(text);
  return edits.length ? applyEdits(text, edits) : text;
}

/**
 * Same, for a field being typed in: also says where the caret ends up so the
 * officer's place in the text doesn't move.
 */
export function joinVehicleListsAtCaret(
  text: string,
  caret: number
): { text: string; caret: number; changed: boolean } {
  const edits = vehicleListEdits(text);
  if (edits.length === 0) return { text, caret, changed: false };
  let shift = 0;
  for (const e of edits) {
    if (e.end <= caret) shift += e.insert.length - (e.end - e.start);
    else if (e.start < caret) shift += e.insert.length - (caret - e.start); // caret inside the edit
  }
  return {
    text: applyEdits(text, edits),
    caret: Math.max(0, caret + shift),
    changed: true,
  };
}

/** True when the text just before the caret ends with a vehicle bracket and a space. */
export function justTypedSpaceAfterVehicle(
  text: string,
  caret: number
): boolean {
  return /\(Vehicle\s+[^()\n]+\)[ \t]$/i.test(text.slice(0, caret));
}

/**
 * One finding per list that still needs punctuating, for Check Sheet:
 * `wrong` is the whole list (first bracket to last), `correct` the same
 * stretch punctuated.
 */
export function vehicleListFixes(
  text: string
): Array<{ start: number; end: number; wrong: string; correct: string }> {
  const out: Array<{
    start: number;
    end: number;
    wrong: string;
    correct: string;
  }> = [];
  for (const chain of findVehicleChains(text)) {
    if (!chain.links.some(l => l.kind === "bare")) continue;
    const start = chain.brackets[0].start;
    const end = chain.brackets[chain.brackets.length - 1].end;
    const last = chain.links.length - 1;
    const edits: VehicleEdit[] = [];
    chain.links.forEach((l, i) => {
      const want = i === last ? " and " : ", ";
      if (text.slice(l.sepStart, l.sepEnd) !== want)
        edits.push({
          start: l.sepStart - start,
          end: l.sepEnd - start,
          insert: want,
        });
    });
    const wrong = text.slice(start, end);
    out.push({ start, end, wrong, correct: applyEdits(wrong, edits) });
  }
  return out;
}
