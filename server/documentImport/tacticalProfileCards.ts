// Reader for the "Tactical Profile" agency template — a document built from
// repeated person CARDS rather than a single NAME/VEHICLES/LOCATION table:
//
//   • a TARGET card: a "Target | <name>" row, "Age / DOB", TELCO (PD/LBS/EBM),
//     a "Target Background" cell (free narrative, then Warnings / Alerts /
//     "WA MDL: …" tacked onto its end), followed by a detail table of
//     "ADDRESSES" (Home Address / Other Frequented), "Registered Vehicles",
//     "Linked Vehicles", "BAIL", "SOCIAL MEDIA", "INTEL", "LIFESTYLE";
//   • an ASSOCIATE card: "<name> | <address>" on the first row, a DOB cell,
//     an "Associate of Target" row, then Warnings / Linked Ops / WA MDL /
//     Registered Vehicles / Linked Vehicles, TELCO, OTHER INFO, SOCIAL MEDIA.
//
// The template ships with several EMPTY cards (it is a form), so a card only
// counts when its name cell actually holds a person's name.
//
// This module only recognises the layout and pulls each card's raw text
// apart by label — it deliberately does NOT parse addresses/vehicles itself;
// targetProfileFieldMap.ts feeds the raw text through the same address and
// vehicle parsers every other format uses, so there's one place that knows
// how to read "7/31 Marine Parade, COTTESLOE WA 6011." Fully deterministic,
// no AI (CLAUDE.md Golden Rule). Adding the next agency's template is a new
// module like this one plus a fixture, not a change to the shared parsers.
import { matchWholeLinePersonName } from "./freeTextEntityScan";
import type { DocumentTable } from "./documentReadResult";

export interface TacticalPersonCard {
  kind: "target" | "associate";
  /** The name as printed, e.g. "Leila Samira HADDAD". */
  name: string;
  /** Normalised to DD/MM/YYYY, or "" when absent/unreadable. */
  dob: string;
  /** Raw text, one entry per line, ready for the address/vehicle parsers. */
  homeAddressText: string;
  otherAddressText: string;
  registeredVehiclesText: string;
  linkedVehiclesText: string;
  /** Raw "WA MDL: …" value, and the bail answer. */
  mdlRaw: string;
  bailRaw: string;
  warnings: string;
  alerts: string;
  socialMedia: string;
  otherInfo: string;
  intel: string;
  /** TELCO / PD / LBS / EBM / MOB values that are actually filled in. */
  telco: Array<{ label: string; value: string }>;
  /** Target only — the "Target Background" narrative, boilerplate removed. */
  background: string;
}

export interface TacticalProfile {
  /** Operation header rows (MAC / TRAFFICKING / 26Z246, IO, Sup …) as
   * label/value pairs, for read-only display. */
  header: Array<{ label: string; value: string }>;
  cards: TacticalPersonCard[];
}

// A value that means "nothing recorded".
const EMPTY_VALUE_RE =
  /^(nil|n\/?a|none recorded|unknown\s*[–-]\s*nil.*|-+|–+|#|no telco)$/i;
export function isEmptyTacticalValue(v: string): boolean {
  const t = v.trim().replace(/\.$/, "");
  return !t || EMPTY_VALUE_RE.test(t);
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** "14/04/1988", "18/MAR/1988", ": 03/11/1981" → "DD/MM/YYYY", else "". */
export function normaliseTacticalDob(text: string): string {
  const m = text
    .trim()
    .match(/^:?\s*(\d{1,2})[/.\-\s]([A-Za-z]{3,9}|\d{1,2})[/.\-\s](\d{4})\b/);
  if (!m) return "";
  const month = /^\d+$/.test(m[2])
    ? m[2].padStart(2, "0")
    : MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) return "";
  return `${m[1].padStart(2, "0")}/${month}/${m[3]}`;
}

// Label lines inside a card. "ADDRESSES" and the like are the template's own
// section captions (sometimes doubled by a floating text box: "BAIL BAIL").
const SECTION_LABELS = [
  "ADDRESSES",
  "HOME ADDRESS",
  "OTHER FREQUENTED",
  "REGISTERED VEHICLES",
  "LINKED VEHICLES",
  "WARNINGS (RELEVANT)",
  "ALERTS",
  "LINKED OPS",
  "BAIL",
  "SOCIAL MEDIA",
  "OTHER INFO",
  "INTEL",
  "LIFESTYLE",
  "TELCO",
  "INTERCEPT",
  "TARGET BACKGROUND",
] as const;
type SectionLabel = (typeof SECTION_LABELS)[number];
const SECTION_SET = new Set<string>(SECTION_LABELS);

/** "BAIL BAIL" → "BAIL" (a text box and its fallback both rendered). */
function collapseDoubled(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const m = t.match(/^(.+?) \1$/);
  return m ? m[1] : t;
}

function labelOf(line: string): SectionLabel | null {
  const key = collapseDoubled(line).replace(/:$/, "").toUpperCase();
  return SECTION_SET.has(key) ? (key as SectionLabel) : null;
}

/** Flattens a card's cells into a stream of lines, keeping label lines
 * recognisable. A cell that is just a label is emitted as that label; any
 * other cell contributes each of its own lines. */
function streamLines(cells: string[]): string[] {
  const out: string[] = [];
  for (const cell of cells) {
    const text = cell.trim();
    if (!text) continue;
    if (labelOf(text)) {
      out.push(collapseDoubled(text));
      continue;
    }
    for (const line of text.split("\n")) {
      const l = line.trim();
      if (l) out.push(l);
    }
  }
  return out;
}

/** Splits a line stream into label → value lines. A line that merely equals
 * a label starts a new section; everything until the next label belongs to
 * it. "WA MDL: Active" is handled separately by the caller. */
function groupByLabel(lines: string[]): Map<SectionLabel, string[]> {
  const groups = new Map<SectionLabel, string[]>();
  let current: SectionLabel | null = null;
  for (const line of lines) {
    const label = labelOf(line);
    if (label) {
      current = label;
      if (!groups.has(label)) groups.set(label, []);
      continue;
    }
    if (current) groups.get(current)!.push(line);
  }
  return groups;
}

function joinValue(lines: string[] | undefined): string {
  return (lines ?? [])
    .map(l => l.trim())
    .filter(l => l && !isEmptyTacticalValue(l))
    .join("\n");
}

function readTelco(cells: string[]): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const cell of cells) {
    // A cell is "LBS 0477004282" or "LBS\n0477004282" or "PD - #".
    const m = cell.trim().match(/^(PD|LBS|EBM|MOB)\b[\s:-]*([\s\S]*)$/i);
    if (!m) continue;
    const value = m[2].replace(/\s+/g, " ").trim();
    if (!isEmptyTacticalValue(value)) {
      out.push({ label: m[1].toUpperCase(), value });
    }
  }
  return out;
}

function rowHasCell(row: string[], re: RegExp): number {
  return row.findIndex(c => re.test(c.trim()));
}

function tableHasCell(table: DocumentTable, re: RegExp): boolean {
  return table.rows.some(r => rowHasCell(r, re) !== -1);
}

const TARGET_CELL_RE = /^Target$/i;
const ASSOCIATE_CELL_RE = /^Associate of Target$/i;
const DETAIL_CELL_RE =
  /^(ADDRESSES|BAIL|SOCIAL MEDIA|INTEL|LIFESTYLE|Registered Vehicles|Linked Vehicles|Home Address)\b/i;

/** True when the document has the Tactical Profile card signature — an
 * "Associate of Target" cell, or a "Target" cell alongside a TELCO cell. */
export function looksLikeTacticalProfile(tables: DocumentTable[]): boolean {
  return tables.some(
    t =>
      tableHasCell(t, ASSOCIATE_CELL_RE) ||
      (tableHasCell(t, TARGET_CELL_RE) && tableHasCell(t, /^TELCO\b/i))
  );
}

function allCells(tables: DocumentTable[]): string[] {
  return tables.flatMap(t => t.rows.flat());
}

function parseCardBody(
  cells: string[]
): Omit<
  TacticalPersonCard,
  "kind" | "name" | "dob" | "background" | "homeAddressText"
> & { homeAddressText: string } {
  const lines = streamLines(cells);

  // "WA MDL: Active" sits inline as its own line (the value after the colon),
  // sometimes with the value on the next line ("WA MDL:\nWA DL 7421908").
  let mdlRaw = "";
  const mdlIdx = lines.findIndex(l => /^WA\s*MDL\b/i.test(l));
  if (mdlIdx !== -1) {
    const inline = lines[mdlIdx].replace(/^WA\s*MDL\s*:?\s*/i, "").trim();
    if (inline) mdlRaw = inline;
    else if (
      lines[mdlIdx + 1] &&
      !labelOf(lines[mdlIdx + 1]) &&
      !/^WA\s*MDL/i.test(lines[mdlIdx + 1])
    ) {
      mdlRaw = lines[mdlIdx + 1].trim();
    }
    // Take the MDL line out so it isn't mistaken for a value of the label
    // above it (e.g. the tail of "Alerts").
    lines.splice(mdlIdx, 1);
  }

  const groups = groupByLabel(lines);
  return {
    homeAddressText: joinValue(groups.get("HOME ADDRESS")),
    otherAddressText: (groups.get("OTHER FREQUENTED") ?? [])
      .map(l => l.trim())
      .filter(Boolean)
      .join("\n"),
    registeredVehiclesText: joinValue(groups.get("REGISTERED VEHICLES")),
    linkedVehiclesText: joinValue(groups.get("LINKED VEHICLES")),
    mdlRaw,
    bailRaw: joinValue(groups.get("BAIL")),
    warnings: joinValue(groups.get("WARNINGS (RELEVANT)")),
    alerts: joinValue(groups.get("ALERTS")),
    socialMedia: joinValue(groups.get("SOCIAL MEDIA")),
    otherInfo: joinValue(groups.get("OTHER INFO")).replace(/\n/g, " "),
    intel: joinValue(groups.get("INTEL")),
    telco: readTelco(cells),
  };
}

/** The "Target Background" cell: narrative first, then the standard tail
 * ("Click here for full TRF", Warnings, Alerts, WA MDL). Splits off the
 * tail so the narrative stays clean. */
function splitBackgroundCell(cell: string): {
  background: string;
  tail: string;
} {
  const body = cell.replace(/^\s*Target Background\s*/i, "");
  const tailStart = body.search(
    /(?:^|\n)\s*(?:Click here for full TRF\s*\n+\s*)?Warnings \(relevant\)/i
  );
  if (tailStart === -1) {
    return {
      background: body.replace(/Click here for full TRF/gi, "").trim(),
      tail: "",
    };
  }
  return {
    background: body
      .slice(0, tailStart)
      .replace(/Click here for full TRF/gi, "")
      .trim(),
    tail: body.slice(tailStart),
  };
}

function nameFromRow(row: string[], labelIdx: number): string {
  for (let i = labelIdx + 1; i < row.length; i++) {
    const v = row[i].trim();
    if (v) return matchWholeLinePersonName(v) ? v : "";
  }
  return "";
}

export function readTacticalProfile(
  tables: DocumentTable[]
): TacticalProfile | null {
  if (!looksLikeTacticalProfile(tables)) return null;

  const isCardStart = (t: DocumentTable) =>
    tableHasCell(t, TARGET_CELL_RE) || tableHasCell(t, ASSOCIATE_CELL_RE);
  const isDetail = (t: DocumentTable) => tableHasCell(t, DETAIL_CELL_RE);

  const cards: TacticalPersonCard[] = [];
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    if (!isCardStart(t)) continue;

    // The card's detail tables: the contiguous run of label-bearing tables
    // right after it (stopping at the next card or any unrelated table).
    const scope: DocumentTable[] = [t];
    for (let j = i + 1; j < tables.length; j++) {
      if (isCardStart(tables[j]) || !isDetail(tables[j])) break;
      scope.push(tables[j]);
    }
    const cells = allCells(scope);

    if (tableHasCell(t, ASSOCIATE_CELL_RE)) {
      // Associate card: "<name> | <address>" leads the first row.
      const first = t.rows.find(r => r.some(c => c.trim())) ?? [];
      const name = first[0]?.trim() ?? "";
      if (!name || !matchWholeLinePersonName(name)) continue;
      const dobCell = cells.find(c => normaliseTacticalDob(c));
      const body = parseCardBody(cells.slice(1));
      cards.push({
        kind: "associate",
        name,
        dob: dobCell ? normaliseTacticalDob(dobCell) : "",
        ...body,
        // The address sits beside the name on the card's first row.
        homeAddressText: first[1]?.trim() ?? "",
        background: "",
      });
      continue;
    }

    // Target card: "Target | <name>" row.
    let name = "";
    let dob = "";
    for (const row of t.rows) {
      const tIdx = rowHasCell(row, TARGET_CELL_RE);
      if (tIdx !== -1 && !name) name = nameFromRow(row, tIdx);
      const dIdx = rowHasCell(row, /^DOB$/i);
      if (dIdx !== -1 && !dob) {
        const v = row.slice(dIdx + 1).find(c => c.trim());
        if (v) dob = normaliseTacticalDob(v);
      }
    }
    if (!name) continue;
    const bgCell = cells.find(c => /^\s*Target Background/i.test(c)) ?? "";
    const { background, tail } = splitBackgroundCell(bgCell);
    const bodyCells = cells.filter(c => !/^\s*Target Background/i.test(c));
    if (tail) bodyCells.push(tail);
    const body = parseCardBody(bodyCells);
    cards.push({
      kind: "target",
      name,
      dob,
      ...body,
      background,
    });
  }

  // Operation header — first table: "MAC | TRAFFICKING | 26Z246 | | 07/AUG/2026",
  // then "IO | <name> <number>", "Sup | <name> <number>".
  const header: Array<{ label: string; value: string }> = [];
  const head = tables.find(t => tableHasCell(t, /^IO$/i)) ?? tables[0];
  if (head) {
    const first = head.rows[0]?.map(c => c.trim()).filter(Boolean) ?? [];
    if (first.length)
      header.push({ label: "Operation", value: first.join(" · ") });
    for (const row of head.rows.slice(1)) {
      const label = row[0]?.trim();
      const value = row
        .slice(1)
        .find(c => c.trim())
        ?.trim();
      if (label && value) header.push({ label, value });
    }
  }

  return { header, cards };
}

/** The agency's licence wording → our three MDL statuses (decided with the
 * officer): Active → active; Cancelled / Suspended → suspended; Expired,
 * Never Held, Revoked, Learners and Nil/None → none. Unrecognised wording
 * stays blank (and is shown read-only) rather than being guessed. */
export function mapMdlStatus(
  raw: string
): "active" | "none" | "suspended" | "" {
  const t = raw.trim().replace(/\.$/, "");
  if (!t) return "";
  if (/\b(suspend|cancel)/i.test(t)) return "suspended";
  if (/^active\b/i.test(t)) return "active";
  if (/\b(expired|never held|revoked|learners?|nil|none)\b/i.test(t))
    return "none";
  return "";
}

/** "None"/"Nil"/"No" → not on bail. "Yes" (optionally "Yes – <conditions>")
 * → on bail. Anything else stays blank for the officer to answer. */
export function mapBail(raw: string): {
  bailStatus: "yes" | "no" | "";
  bailConditions: "yes" | "no" | "";
  bailConditionsText: string;
} {
  const t = raw.trim().replace(/\.$/, "");
  if (/^(none|nil|no|n\/?a)$/i.test(t)) {
    return { bailStatus: "no", bailConditions: "", bailConditionsText: "" };
  }
  const yes = t.match(/^yes\b[\s:,–-]*(.*)$/i);
  if (yes) {
    const rest = yes[1].trim();
    return rest
      ? { bailStatus: "yes", bailConditions: "yes", bailConditionsText: rest }
      : { bailStatus: "yes", bailConditions: "", bailConditionsText: "" };
  }
  return { bailStatus: "", bailConditions: "", bailConditionsText: "" };
}
