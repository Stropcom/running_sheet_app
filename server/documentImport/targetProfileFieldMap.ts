// Orchestrates the individual document-import parsers into the shape the
// review screen needs: turn a target-profile-style document's raw table/
// paragraph text (from docxTableReader.ts for .docx, pdfTextReader.ts for
// .pdf — both produce the same DocumentReadResult shape) into structured
// fields the Add Target form already understands (StructuredNameParts /
// StructuredAddressParts / StructuredVehicleParts — see
// client/src/lib/addressFormat.ts),
// plus whatever this document format carries that the schema has no field
// for yet (PROMIS ID, OCG, COB, ...) shown read-only, plus free-text
// candidate entities for a human to confirm. Nothing here writes to the
// database — this module only produces a proposed shape for the review UI.
import {
  parseAddressLine,
  parseAddressLineLoose,
  findAddressLines,
  type ParsedAddressLine,
} from "./addressLineParser";
import {
  findVehicleLines,
  parseVehicleLine,
  type ParsedVehicleLine,
} from "./vehicleLineParser";
import {
  scanFreeText,
  matchWholeLinePersonName,
  type CandidateEntity,
} from "./freeTextEntityScan";
import type { DocumentReadResult } from "./documentReadResult";

/** Labels this document format uses for fields the schema has no place for
 * today (see CLAUDE.md's Golden Rule discussion / the "Schema gap" decision
 * for this feature — surfaced read-only, never persisted). "NAME", "DOB",
 * "VEHICLES", "LOCATION OF INTEREST" and "SUMMARY" are handled separately
 * below since they map onto real structured fields instead. */
const UNMAPPED_LABELS = [
  "ROLE",
  "COB",
  "OCG",
  "PASSPORT",
  "ALIASES",
  "IDs",
] as const;

export const ALL_KNOWN_LABELS = new Set<string>([
  "NAME",
  "DOB",
  "VEHICLES",
  "LOCATION OF INTEREST",
  "PROMIS ID",
  "SUMMARY",
  "COMMUNICATIONS",
  ...UNMAPPED_LABELS,
]);

export interface ParsedPersonName {
  firstNames: string;
  surname: string;
  bornDate: string;
  confident: boolean;
}

export interface ParsedAddressEntry extends ParsedAddressLine {
  /** The sub-label this address was found under, e.g. "Current Address",
   * "Previous Address" — blank when the document didn't label it. */
  label: string;
}

export interface UnmappedField {
  label: string;
  value: string;
}

export interface FreeTextAssociate {
  firstNames: string;
  surname: string;
  /** Set instead of firstNames/surname when this associate is a business
   * or place (e.g. "Pacific Route Services Pty Ltd") rather than a person —
   * see findDashSeparatedBusinesses. Empty for a person associate. */
  businessName: string;
  address: ParsedAddressLine | null;
  vehicle: ParsedVehicleLine | null;
}

/** Something the document clearly meant as an address or vehicle — it sat
 * under a recognised label, or looked vehicle-shaped — but that none of the
 * parsers could actually read, so it would otherwise vanish with no trace.
 * Unlike a low-confidence ParsedAddressEntry/ParsedVehicleLine (which still
 * has SOME structured fields filled in), this carries only the raw text:
 * the caller's job is to hand it to the officer as a starting point (e.g.
 * pre-filling one field of a new Extra Address/Vehicle card) rather than
 * make them retype it from the original document. */
export interface UnparsedItem {
  kind: "address" | "vehicle";
  /** The sub-label this was found under, e.g. "Current Address" — blank
   * when there wasn't one (a whole VEHICLES cell with no rego bracket at
   * all has no sub-label to carry). */
  label: string;
  raw: string;
}

export interface TargetProfileImportResult {
  name: ParsedPersonName | null;
  addresses: ParsedAddressEntry[];
  vehicles: ParsedVehicleLine[];
  /** Fields this document carries that the Target Registry schema doesn't
   * have a place for — read-only display only, see the module comment. */
  unmappedFields: UnmappedField[];
  /** The document's free-text narrative (e.g. a "Summary" cell), concatenated
   * in document order. */
  freeText: string;
  /** Person mentions in `freeText` found with their own address and/or
   * vehicle on the following line(s) — e.g. an "Associates:" block. Each
   * one is a suggestion for the review screen, not a fact to persist
   * directly. Persons captured here are excluded from `candidateEntities`
   * below so the same name doesn't surface twice. */
  associateBlocks: FreeTextAssociate[];
  /** Person/business/email/phone mentions found in `freeText` — each one is
   * a suggestion for the review screen, not a fact to persist directly. */
  candidateEntities: CandidateEntity[];
  /** Address/vehicle text the document clearly intended but none of the
   * parsers could read — see UnparsedItem. Always non-empty raw text; the
   * review screen surfaces these explicitly instead of silently dropping
   * them. */
  needsReview: UnparsedItem[];
}

/** Finds every occurrence of `label` as a cell in `rows`, paired with the
 * next cell in that same row — tolerant of merged cells shifting later
 * columns (see DocxTable.rows' own doc comment): this scans cell PAIRS
 * rather than assuming a fixed column index, so a row with one fewer cell
 * than its neighbours (because of a gridSpan merge) still resolves
 * correctly instead of reading the wrong column. */
function findLabelledValue(rows: string[][], label: string): string | null {
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      if (row[i].trim() === label) return row[i + 1] ?? "";
    }
  }
  return null;
}

/** SUMMARY (and similarly shaped free-text sections) is written as its own
 * label row with the actual paragraph text living in the row(s) that
 * follow, at the same column position — not a same-row label/value pair
 * like every other field. Collects every non-empty cell from the rows
 * after the label row until the next recognised label (e.g.
 * "COMMUNICATIONS") is reached. */
function findFreeTextSection(rows: string[][], label: string): string {
  const labelRowIndex = rows.findIndex(r => r.some(c => c.trim() === label));
  if (labelRowIndex === -1) return "";
  const parts: string[] = [];
  for (let i = labelRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.some(c => ALL_KNOWN_LABELS.has(c.trim()))) break;
    for (const cell of row) {
      const text = cell.trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n\n");
}

/** A document written as headed paragraphs rather than a table — "1.
 * SUBJECT", "VEHICLES", "LOCATIONS OF INTEREST" each sitting on their own
 * paragraph with the actual content in the paragraphs underneath — needs a
 * different route to the same NAME/VEHICLES/LOCATION OF INTEREST fields
 * findLabelledValue reads from a table row. One heading paragraph followed
 * by every paragraph up to the next heading (or end of document). */
interface ParagraphSection {
  heading: string;
  lines: string[];
}

/** A paragraph the document intends as a section heading, not body text.
 * Deliberately permissive — a numbered heading ("1. SUBJECT", "2. VEHICLE
 * & LOCATION OVERVIEW") or a short, mostly-capitalised line with no
 * sentence-ending punctuation ("VEHICLES", "LOCATIONS OF INTEREST",
 * "ASSOCIATES, BUSINESSES & CONTACTS") — rather than a fixed label list,
 * since real documents word these differently ("VEHICLES" vs "Vehicles of
 * Interest"). A line with any lowercase letter is never a heading by this
 * definition, which is what keeps this from misfiring on ordinary body
 * text (an associate's name-and-address paragraph always has lowercase
 * words in it somewhere). */
export function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 70) return false;
  if (/^\d+[.)]\s*\S/.test(trimmed)) return true;
  // A bare "Target"/"Subject" line is a real heading in some document
  // families even though it isn't ALL-CAPS like every other heading here
  // — e.g. a real training document (QUARRY) bundles the whole subject
  // card into one table cell as "Target\nOliver James BISHOP\nDOB: ...".
  // Matched by exact word rather than loosening the general ALL-CAPS rule
  // below, which would risk misreading an ordinary Title Case sentence
  // fragment elsewhere as a heading.
  if (/^(target|subject|person of interest)$/i.test(trimmed)) return true;
  // A "Label: value" content line (a DOB, an ID number, a phone) is never
  // a heading, even when the value itself happens to contain no lowercase
  // letters (a date, a numeric ID) — without this, "DOB: 03/11/1990" or
  // "PROMIS ID: 9084417" reads as a heading under the ALL-CAPS rule below,
  // splitting a real section (e.g. the "Target" subject card above) apart
  // right after its first line. None of this document family's actual
  // headings use a colon.
  if (trimmed.includes(":")) return false;
  if (/[a-z]/.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return /[A-Z]/.test(trimmed);
}

function splitParagraphsIntoSections(paragraphs: string[]): ParagraphSection[] {
  const sections: ParagraphSection[] = [];
  let current: ParagraphSection | null = null;
  for (const p of paragraphs) {
    if (isHeadingLine(p)) {
      current = { heading: p.trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(p);
    }
  }
  return sections;
}

/** The joined body text of the first paragraph section whose heading
 * matches `keyword` — the paragraph-based equivalent of findLabelledValue
 * for a document with no table at all. Empty string when no such section
 * exists, matching findLabelledValue's own "not found" contract (`?? ""`
 * at every call site). */
function findParagraphSection(
  sections: ParagraphSection[],
  keyword: RegExp
): string {
  const match = sections.find(s => keyword.test(s.heading));
  return match ? match.lines.join("\n") : "";
}

/** Every heading→content section found either among top-level paragraphs
 * (splitParagraphsIntoSections over result.paragraphs) or self-contained
 * inside ONE table cell — a genuinely different shape from the row-pair
 * "label cell | value cell" findLabelledValue reads: a 2-column table can
 * just as easily put a bold mini-heading plus its own list of lines in
 * EACH cell side by side (a "VEHICLES" cell next to a "LOCATIONS OF
 * INTEREST" cell, each cell's own paragraphs already flattened into one
 * newline-joined string by docxTableReader.ts) instead of pairing a label
 * cell with a separate value cell in the same row. Both shapes end up
 * queryable through the one findParagraphSection lookup below. */
function findAllParagraphSections(
  result: DocumentReadResult
): ParagraphSection[] {
  const sections = splitParagraphsIntoSections(result.paragraphs);
  for (const table of result.tables) {
    for (const row of table.rows) {
      for (const cell of row) {
        sections.push(...splitParagraphsIntoSections(cell.split("\n")));
      }
    }
  }
  return sections;
}

function splitPersonName(full: string): {
  firstNames: string;
  surname: string;
} {
  const trimmed = full.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstNames: trimmed, surname: "" };
  const last = words[words.length - 1];
  if (last.length >= 2 && /^[A-Z][A-Z'-]*$/.test(last)) {
    return { firstNames: words.slice(0, -1).join(" "), surname: last };
  }
  return { firstNames: trimmed, surname: "" };
}

/** A "LOCATION OF INTEREST"-style cell lists one or more addresses, each
 * usually (but not always — see the module comment about "sometimes it's
 * not consistent") preceded by its own "<Something>:" label — either on
 * its own line ("Current Address:\n3 Appletree Place, Woodvale WA 6026.")
 * or, just as often in a headed-paragraph-style document, on the SAME
 * line as the address itself ("Current Address: 27 Davy Street, ALFRED
 * COVE WA 6154."). Falls back to an unlabelled entry when a line matches
 * the address shape with no label at all. A line that follows/carries a
 * label but matches neither parseAddressLine nor its loose fallback (e.g.
 * a corner address with no house number, "Cnr Smith St and Jones Ave,
 * SUBURB WA") used to be silently dropped — now it's reported via
 * `unparsed` instead, so the officer sees "we found a Current Address,
 * couldn't read it" rather than nothing at all. */
function parseAddressBlock(text: string): {
  addresses: ParsedAddressEntry[];
  unparsed: UnparsedItem[];
} {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const addresses: ParsedAddressEntry[] = [];
  const unparsed: UnparsedItem[] = [];
  let pendingLabel = "";
  for (const line of lines) {
    const labelMatch = line.match(/^([A-Za-z][A-Za-z\s]{1,40}):\s*(.*)$/);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      const rest = labelMatch[2].trim();
      if (!rest) {
        // Label-only line — the address itself is on the line(s) after it.
        pendingLabel = label;
        continue;
      }
      // Label and address share one line — parse the remainder directly
      // under this label rather than waiting for a line that never comes.
      const parsed = parseAddressLine(rest) ?? parseAddressLineLoose(rest);
      if (parsed) {
        addresses.push({ ...parsed, label });
      } else {
        unparsed.push({ kind: "address", label, raw: rest });
      }
      pendingLabel = "";
      continue;
    }
    const parsed = parseAddressLine(line) ?? parseAddressLineLoose(line);
    if (parsed) {
      addresses.push({ ...parsed, label: pendingLabel });
    } else {
      unparsed.push({ kind: "address", label: pendingLabel, raw: line });
    }
    pendingLabel = "";
  }
  return { addresses, unparsed };
}

const ADDRESS_ROW_LABEL_RE = /\b(address|location|site)\b/i;

/** Some documents put their whole address register as a real table — each
 * row its own (sub-label, address) pair, e.g. a row literally
 * `["Current Address", "64 Matheson Road, APPLECROSS WA 6153."]` — rather
 * than bundling every address into one "LOCATION OF INTEREST" cell's text
 * (parseAddressBlock's shape) or a paragraph section. Detected by the
 * row's own first cell containing "address"/"location"/"site" — the same
 * vocabulary parseAddressBlock's inline "Label: value" shape already
 * recognises — then reconstructed into that exact "Label: value" line
 * format so both table shapes share one parser rather than needing a
 * second one. */
function findAddressRegisterRows(rows: string[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    if (row.length < 2) continue;
    const label = row[0].trim();
    const value = row[1].trim();
    if (!label || !value || !ADDRESS_ROW_LABEL_RE.test(label)) continue;
    lines.push(`${label}: ${value}`);
  }
  return lines.join("\n");
}

/** Some documents put their known associates/entities in a real table —
 * a "PERSON / ENTITY | RELATIONSHIP | LOCATION / VEHICLE | CONTACT /
 * IDENTIFIER"-style header row, then one row per associate — rather than
 * a dash-separated or vertical-block paragraph (see findAssociateBlocks/
 * findDashSeparated*). Detected by header keywords rather than exact
 * column names, since real documents word these differently. The name
 * column may hold a person ("Emily Grace TAN" — matched the same way
 * every other person-shaped name in this file is) or a business/place
 * with no such shape ("Blue Arc Imports Pty Ltd") — businessName takes
 * its place, same convention as findDashSeparatedBusinesses. The detail
 * column can bundle an address AND a vehicle on separate lines within the
 * one cell; relationship/contact columns have no field to carry them, so
 * — same "only keep what has somewhere to go" rule every matcher here
 * follows — they're simply never claimed. */
function findAssociateTableRows(
  tables: DocumentReadResult["tables"]
): FreeTextAssociate[] {
  const out: FreeTextAssociate[] = [];
  for (const table of tables) {
    if (table.rows.length < 2) continue;
    const header = table.rows[0];
    const nameColIdx = header.findIndex(c =>
      /PERSON|ENTITY|ASSOCIATE/i.test(c)
    );
    const detailColIdx = header.findIndex(c =>
      /LOCATION|ADDRESS|VEHICLE/i.test(c)
    );
    if (nameColIdx === -1 || detailColIdx === -1) continue;

    for (let i = 1; i < table.rows.length; i++) {
      const row = table.rows[i];
      const nameCell = (row[nameColIdx] ?? "").trim();
      if (!nameCell) continue;

      let address: ParsedAddressLine | null = null;
      let vehicle: ParsedVehicleLine | null = null;
      for (const line of (row[detailColIdx] ?? "").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!address) {
          address = parseAddressLine(trimmed) ?? parseAddressLineLoose(trimmed);
        }
        if (!vehicle) vehicle = parseVehicleLine(trimmed);
      }
      if (!address && !vehicle) continue;

      const person = matchWholeLinePersonName(nameCell);
      out.push(
        person
          ? {
              firstNames: person.firstNames,
              surname: person.surname,
              businessName: "",
              address,
              vehicle,
            }
          : {
              firstNames: "",
              surname: "",
              businessName: nameCell,
              address,
              vehicle,
            }
      );
    }
  }
  return out;
}

/** Scans free text for a name sitting on its own line, immediately
 * followed (within the next couple of lines) by that person's address
 * and/or vehicle — the shape a target profile document uses for an
 * "Associates:" block, e.g.:
 *   David GRAY
 *   103 Watkins Street, WHITE GUM VALLEY
 *   1GHF389 (WA) red BYD Sealion 6
 * Falls back from parseAddressLine (requires a state code) to
 * parseAddressLineLoose (defaults to WA) since these lines don't always
 * carry one — see addressLineParser.ts's own comment on that. A name with
 * neither an address nor a vehicle following it is left for
 * findCandidatePersons to pick up as a bare mention instead — this
 * function only claims names it can attach something concrete to. */
function findAssociateBlocks(text: string): FreeTextAssociate[] {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const out: FreeTextAssociate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const person = matchWholeLinePersonName(lines[i]);
    if (!person) continue;

    // The next couple of lines, split into sentences and searched TOGETHER
    // as one pool (see extractAddressAndVehicleFromSentences) rather than
    // one line at a time with an early advance — a name's address AND
    // vehicle routinely sit in the very same dense paragraph right after
    // it (e.g. "9 Vela Court, JANDAKOT WA 6164. 1OKS19 (WA) 2021 silver
    // Hyundai i30 hatch. At 1128 hours, ..."), and a version that found
    // the address there and immediately advanced past it without also
    // checking that same paragraph for a vehicle sent the search into the
    // FOLLOWING paragraph instead — which can easily belong to a totally
    // different associate — and silently attributed that other person's
    // own vehicle to this one.
    //
    // Widening this to 3 lines was tried (to reach a vehicle sitting past
    // an intervening "DOB <date>" line in one DOCX document's own vertical
    // block) and reverted: it fixed that one case but reopened exactly the
    // cross-associate misattribution this window exists to prevent, in
    // TWO other real training documents (NIGHTJAR: MERCER's own vehicle
    // got duplicated onto AHERN's entry too; HARBOUR: a wholly new,
    // spurious associate appeared that wasn't there before). Missing data
    // (a null vehicle) is the safer failure for an evidentiary system than
    // wrong data (someone else's vehicle attributed to this person), so
    // this stays at 2 lines — the DOB-interleaved DOCX case is a known,
    // accepted gap rather than worth the regression.
    const windowSentences = lines
      .slice(i + 1, Math.min(i + 3, lines.length))
      .flatMap(splitIntoSentences);
    const { address, vehicle } = extractAddressAndVehicleFromSentences(
      windowSentences,
      person.surname
    );

    if (address || vehicle) {
      out.push({
        firstNames: person.firstNames,
        surname: person.surname,
        businessName: "",
        address,
        vehicle,
      });
    }
  }
  return out;
}

/** Splits `text` on sentence-ending periods, dropping empty fragments —
 * used to pull one dense associate paragraph ("Name - address. Vehicle:
 * X. Mobile: Y. Email: Z.") apart into fact-sized pieces before parsing
 * each one on its own. Parsing the whole run-on remainder in one go would
 * let a vehicle's parsed "model" field swallow the phone/email text that
 * follows it in the same paragraph, since none of the individual line
 * parsers know where their own fact actually ends inside a longer string.
 * Also splits on a semicolon (e.g. "... utility.; Suite 4/88 ...", "HASSAN;
 * DUNN; 1DUN44 (WA) ...") — some documents use it as a clause separator
 * within one dense sentence rather than only between sentences, and without
 * this a period immediately followed by a semicolon (no space between
 * them) isn't recognised as a sentence break at all, so the next clause
 * gets swallowed into whatever fact was being parsed out of the previous
 * one. */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/[.;](?:\s+|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Same short state list every other document-import module keeps its own
// local copy of (see e.g. vehicleLineParser.ts/addressLineParser.ts/
// freeTextEntityScan.ts's own AU_STATES) — used here only to exempt a
// vehicle's own "(WA)" state bracket from mentionsOtherSurname's bare-
// ALL-CAPS-token scan below, not to validate an address.
const AU_STATE_CODES = new Set([
  "WA",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "TAS",
  "NT",
  "ACT",
]);

/** True when `sentence` contains a bare ALL-CAPS surname-shaped token (2+
 * letters, optionally hyphenated) that ISN'T `ownSurname` and isn't an AU
 * state code, checked ONLY in the text before the sentence's own vehicle
 * registration (its first digit — a rego always starts with or otherwise
 * contains one, e.g. "1CAL19", "1GHF389", while an ordinary English name
 * never does) — the signal used by extractAddressAndVehicleFromSentences
 * to tell an associate's OWN vehicle sentence ("MCKENZIE departed in
 * 1OLI77 (WA) ...") apart from one that's actually describing a DIFFERENT
 * named person's action instead ("REID arrived in 1CAL19 (WA) ...") in the
 * middle of the same run-on paragraph (see that function's own comment for
 * the real document this was found against). Scoping the scan to before
 * the rego is what keeps this from also false-positiving on an ALL-CAPS
 * token that's legitimately part of the vehicle description ITSELF, e.g.
 * a make like "BYD" in "1GHF389 (WA) red BYD Sealion 6" — nothing about a
 * person ever appears after the rego in this document family's own
 * "<rego> (<STATE>) <description>" convention. */
function mentionsOtherSurname(sentence: string, ownSurname: string): boolean {
  const own = ownSurname.toUpperCase();
  const regoIdx = sentence.search(/\d/);
  const beforeRego = regoIdx === -1 ? sentence : sentence.slice(0, regoIdx);
  const tokens = beforeRego.match(/\b[A-Z]{2,}(?:-[A-Z]{2,})?\b/g) ?? [];
  return tokens.some(t => t !== own && !AU_STATE_CODES.has(t));
}

/** Scans `sentences` (see splitIntoSentences) in order for the FIRST
 * address and the FIRST vehicle — the "keep whichever comes first, never
 * overwrite once found" rule every associate matcher in this file follows
 * — factored out since findAssociateBlocks, findDashSeparatedAssociates
 * and findLeadingNameAssociates all needed the exact same scan. A vehicle-
 * bearing sentence is skipped (left for a LATER sentence to supply the
 * vehicle instead, not just discarded outright) when it names a DIFFERENT
 * surname-shaped person rather than `ownSurname` — a real training
 * document (IRONBARK) interleaves an associate's own facts with a
 * sentence describing the TARGET's own vehicle in between ("MCKENZIE met
 * REID at <address>. REID arrived in <REID's own vehicle>. MCKENZIE
 * departed in <MCKENZIE's own vehicle>."). Without this, the FIRST
 * vehicle-shaped sentence found (REID's, not MCKENZIE's) got silently
 * misattributed to MCKENZIE instead — worse than finding no vehicle at
 * all for an evidentiary system. The address itself is deliberately NOT
 * filtered the same way: a sentence establishing where two people met is
 * legitimately about both of them at once ("MCKENZIE met REID at 7
 * Seabrook Lane...") and shouldn't be thrown away just for mentioning
 * someone else by name too. */
function extractAddressAndVehicleFromSentences(
  sentences: string[],
  ownSurname: string
): { address: ParsedAddressLine | null; vehicle: ParsedVehicleLine | null } {
  let address: ParsedAddressLine | null = null;
  let vehicle: ParsedVehicleLine | null = null;
  for (const sentence of sentences) {
    if (!address) {
      address = parseAddressLine(sentence) ?? parseAddressLineLoose(sentence);
    }
    if (!vehicle && !mentionsOtherSurname(sentence, ownSurname)) {
      vehicle = parseVehicleLine(sentence);
    }
  }
  return { address, vehicle };
}

// The dash separator requires REAL whitespace on both sides (\s+, not
// \s*) -- without it, a hyphenated surname with no spaces around its own
// internal hyphen ("EL-SAYED") can satisfy this pattern on its own: the
// surname group's optional "(?:-[A-Z]{2,})?" suffix greedily tries to
// consume that hyphen first, but when nothing after it looks like this
// line's own "- detail" separator, the regex engine backtracks and un-
// commits that optional group, leaving the surname's OWN internal hyphen
// free to satisfy "\s*[-–]\s*" instead -- silently truncating the surname
// ("EL" instead of "EL-SAYED") and starting the "detail" half mid-word
// ("SAYED met ..." instead of the real remainder). Requiring real
// whitespace around the separator removes that ambiguity entirely, since
// a hyphenated surname is never written with spaces around its own
// internal hyphen. Every real "Name - detail" convention seen in an
// actual training document already uses a spaced dash, so this loses
// nothing legitimate.
const DASH_ASSOCIATE_RE =
  /^([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2}\s+[A-Z]{2,}(?:-[A-Z]{2,})?)\s+[-–]\s+(.+)$/;

/** A second "associate block" shape, alongside findAssociateBlocks' vertical
 * one (name on its own line, then address/vehicle each on their own line
 * below it): one dense paragraph per associate instead — "Benjamin Cole
 * WATTS - 44 Brandon Street, SOUTH PERTH WA 6151. Vehicle: 1BCW552 (WA)
 * 2021 grey Toyota RAV4 wagon. Mobile: ... Email: ...." — the shape an
 * "ASSOCIATES, BUSINESSES & CONTACTS"-style section commonly uses instead.
 * Only claims a paragraph that both matches the "Name - ..." shape AND
 * yields at least an address or a vehicle from splitting the remainder
 * into sentences — same "only claim what it can attach something concrete
 * to" rule findAssociateBlocks itself follows, so a genuinely unrelated
 * "Name - some other sentence" line is left alone for findCandidatePersons
 * to pick up as an ordinary bare mention instead. The all-caps-surname
 * shape this regex requires also keeps it from matching a business line —
 * "West Coast Device Supply - Shop 3/220 ..." has no ALL-CAPS final word,
 * so it never reaches the name check at all. */
function findDashSeparatedAssociates(text: string): FreeTextAssociate[] {
  const out: FreeTextAssociate[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(DASH_ASSOCIATE_RE);
    if (!m) continue;
    const person = matchWholeLinePersonName(m[1]);
    if (!person) continue;

    const { address, vehicle } = extractAddressAndVehicleFromSentences(
      splitIntoSentences(m[2]),
      person.surname
    );

    if (address || vehicle) {
      out.push({
        firstNames: person.firstNames,
        surname: person.surname,
        businessName: "",
        address,
        vehicle,
      });
    }
  }
  return out;
}

// A person's name sitting at the very START of a line/paragraph with more
// text immediately following on the SAME line — no dash needed (unlike
// DASH_ASSOCIATE_RE), just whitespace — and an optional "Associates:"/
// "Associate:" section label consumed right in front of it. This is the
// shape a target-profile document's very FIRST listed associate almost
// always uses: the section's own "Associates:" intro sentence doubles as
// that first entry, e.g. "Associates: Madeleine Rose FLETCHER 63 Osprey
// Drive, YANGEBUP WA 6164. 1MRF63 (WA) 2020 blue Mazda CX-5 wagon. On 18
// August 2026, ..." — with no name-only line anywhere for
// findAssociateBlocks to anchor on, and no dash for findDashSeparatedAssociates
// to anchor on either, that first associate had no matcher that could ever
// find them at all; they fell all the way through to a bare, low-
// confidence candidateEntity mention with no address or vehicle attached.
const LEADING_NAME_RE =
  /^(?:Associates?:\s*)?([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2}\s+[A-Z]{2,}(?:-[A-Z]{2,})?)\s+(.+)$/;

/** A third "associate block" shape: see LEADING_NAME_RE. Deliberately tried
 * only on a per-line basis, matching at the START of that line only (never
 * scanning mid-line/mid-paragraph for a second embedded name) — so a
 * narrative sentence mentioning the target by name mid-paragraph ("CROSS
 * met Madeleine Rose FLETCHER near the loading area.") is never mistaken
 * for a NEW associate's own leading declaration; a line has to open with
 * the name-shape itself. Same "only claim what it can attach something
 * concrete to" rule every matcher here follows. */
function findLeadingNameAssociates(text: string): FreeTextAssociate[] {
  const out: FreeTextAssociate[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(LEADING_NAME_RE);
    if (!m) continue;
    const person = matchWholeLinePersonName(m[1]);
    if (!person) continue;

    const { address, vehicle } = extractAddressAndVehicleFromSentences(
      splitIntoSentences(m[2]),
      person.surname
    );

    if (address || vehicle) {
      out.push({
        firstNames: person.firstNames,
        surname: person.surname,
        businessName: "",
        address,
        vehicle,
      });
    }
  }
  return out;
}

// Same suffix list BUSINESS_SUFFIX_RE/BUSINESS_NAME_RE (freeTextEntityScan.ts)
// use, but anchored the same way DASH_ASSOCIATE_RE is: "<name incl. suffix>
// - <rest of the line>". A lazy name capture up to and including the first
// suffix match, exactly like BUSINESS_NAME_RE, so a business name doesn't
// swallow anything past its own suffix.
const DASH_BUSINESS_RE =
  /^([A-Z][A-Za-z0-9&.,'\s]{1,80}?\s*(?:Pty\.?\s*Ltd\.?|Ltd\.?|Inc\.?|LLC|Corp\.?|Corporation))\.?\s*[-–]\s*(.+)$/i;

/** A business/place name (see DASH_BUSINESS_RE) followed by its own address
 * on the same line, dash-separated — "Pacific Route Services Pty Ltd -
 * Unit 8/41 Walters Drive, OSBORNE PARK WA 6017. ABN training reference: 63
 * 555 281 904." Mirrors findDashSeparatedAssociates' shape for a person,
 * but for an entity with no first name/surname to give: businessName takes
 * their place, and — since only the first sentence of the remainder that
 * actually parses as an address or vehicle gets kept, same as the person
 * version — a trailing "ABN training reference: ..." clause is simply
 * never claimed by anything, rather than being folded into the name. */
function findDashSeparatedBusinesses(text: string): FreeTextAssociate[] {
  const out: FreeTextAssociate[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(DASH_BUSINESS_RE);
    if (!m) continue;
    const businessName = m[1].trim();

    let address: ParsedAddressLine | null = null;
    let vehicle: ParsedVehicleLine | null = null;
    for (const sentence of splitIntoSentences(m[2])) {
      if (!address) {
        address = parseAddressLine(sentence) ?? parseAddressLineLoose(sentence);
      }
      if (!vehicle) {
        vehicle = parseVehicleLine(sentence);
      }
    }

    if (address || vehicle) {
      out.push({ firstNames: "", surname: "", businessName, address, vehicle });
    }
  }
  return out;
}

// Deliberately looser than DASH_BUSINESS_RE — no required legal suffix —
// since a real business is just as often written under its plain trading
// name ("Westline Freight Solutions") as its registered one ("... Pty
// Ltd"). Anchored to the start of the line, one associate per line by this
// section's own convention, so it can't reach backward across unrelated
// text the way a scan across a whole paragraph could. The dash requires
// real whitespace on both sides — same reason DASH_ASSOCIATE_RE now does
// too (see its own comment for the "EL-SAYED" backtracking bug this
// guards against): being the loosest of the three dash matchers, this one
// would otherwise also match a compact reference/event code with no legal
// name shape at all ("BLU-E01", "Reference BLU-7719") as if the hyphen
// were the "Name - detail" separator, corrupting whatever real address/
// vehicle text followed it elsewhere in the same paragraph.
const DASH_ENTITY_RE =
  /^([A-Z][A-Za-z0-9&'.]*(?:\s+[A-Za-z0-9&'.]+){0,5})\s+[-–]\s+(.+)$/;

/** Last-resort dash-separated shape, tried only once both
 * findDashSeparatedAssociates (needs a trailing ALL-CAPS surname) and
 * findDashSeparatedBusinesses (needs a Pty Ltd/Ltd/Inc/... suffix) have
 * already failed on a line — see DASH_ENTITY_RE. A title-case run with no
 * ALL-CAPS surname is never a person under this document family's own
 * naming convention, so whatever this catches is treated as a
 * business/place associate — businessName, same as
 * findDashSeparatedBusinesses. Only claims a line whose remainder actually
 * yields a real address or vehicle, same "only claim what it can attach
 * something concrete to" rule every matcher in this file follows — a
 * title-case phrase followed by an unrelated dash-joined sentence is left
 * alone. */
function findDashSeparatedEntities(text: string): FreeTextAssociate[] {
  const out: FreeTextAssociate[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (DASH_ASSOCIATE_RE.test(line) || DASH_BUSINESS_RE.test(line)) continue;
    const m = line.match(DASH_ENTITY_RE);
    if (!m) continue;
    const businessName = m[1].trim();

    let address: ParsedAddressLine | null = null;
    let vehicle: ParsedVehicleLine | null = null;
    for (const sentence of splitIntoSentences(m[2])) {
      if (!address) {
        address = parseAddressLine(sentence) ?? parseAddressLineLoose(sentence);
      }
      if (!vehicle) {
        vehicle = parseVehicleLine(sentence);
      }
    }

    if (address || vehicle) {
      out.push({ firstNames: "", surname: "", businessName, address, vehicle });
    }
  }
  return out;
}

const STATE_BRACKET_RE = /\(\s*(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s*\)/g;

/** Two distinct ways a VEHICLES cell can lose a vehicle entirely rather
 * than just parsing it badly:
 *   1. The whole cell has non-empty text but findVehicleLines found no
 *      "<token> (<STATE>)" anchor anywhere in it at all — e.g. "Rego
 *      1MXP920, red Mazda 3 hatch" (no state bracket) or a rego mentioned
 *      with the state spelled out instead of bracketed. Nothing gets
 *      produced for this case today, so the whole cell is reported as one
 *      unparsed item.
 *   2. A vehicle DID anchor, but its raw text still contains a SECOND
 *      "(<STATE>)"-shaped bracket beyond its own anchor — the signature of
 *      a second vehicle whose own anchor was broken by punctuation
 *      vehicleLineParser.ts doesn't already tolerate (it handles a comma —
 *      "SLICK1, (WA) ..." — directly now, so this is the fallback for
 *      anything stranger still slipping through). That vehicle's whole raw
 *      text is reported so the officer can see the buried second mention. */
function findUnparsedVehicleItems(
  vehiclesValue: string,
  vehicles: ParsedVehicleLine[]
): UnparsedItem[] {
  const trimmed = vehiclesValue.trim();
  if (!trimmed) return [];
  if (vehicles.length === 0) {
    return [{ kind: "vehicle", label: "", raw: trimmed }];
  }
  const out: UnparsedItem[] = [];
  for (const v of vehicles) {
    const matches = v.raw.match(STATE_BRACKET_RE);
    if (matches && matches.length > 1) {
      out.push({ kind: "vehicle", label: "", raw: v.raw });
    }
  }
  return out;
}

/** Maps a .docx read result (docxTableReader.ts's output) onto the shape
 * the document-import review screen needs. Best-effort throughout: a field
 * this document doesn't happen to carry, or writes in a shape these parsers
 * don't recognise, is simply absent from the result rather than guessed —
 * the officer fills it in on the review screen. */
const DOB_RE = /\bDOB\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i;
// A written-month date ("DOB 06 December 1982") — a real training document
// (IRONBARK) uses this instead of the numeric d/m/y shape DOB_RE alone
// recognises. Normalised to the same DD/MM/YYYY shape as every other date
// this pipeline produces, rather than passed through as prose, so the
// review screen's Date of birth field reads consistently regardless of
// which shape the source document happened to use.
const DOB_PROSE_RE =
  /\bDOB\s*:?\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i;
const MONTH_NUMBERS: Record<string, string> = {
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

/** Finds a DOB in `text`, trying the numeric d/m/y shape first and the
 * written-month shape second (see DOB_PROSE_RE) — always returned as
 * DD/MM/YYYY regardless of which shape matched. */
function matchDob(text: string): string {
  const numeric = text.match(DOB_RE);
  if (numeric) return numeric[1];
  const prose = text.match(DOB_PROSE_RE);
  if (prose) {
    const month = MONTH_NUMBERS[prose[2].slice(0, 3).toLowerCase()];
    if (month) return `${prose[1].padStart(2, "0")}/${month}/${prose[3]}`;
  }
  return "";
}

// Same two date shapes DOB_RE/DOB_PROSE_RE recognise, but anchored to the
// START of the string with no "DOB" label required — the caller already
// got this value from a DOB table row via findLabelledValue, which has
// already stripped the label off, so requiring it again (as matchDob
// does, since IT scans a wider block of free text that still carries the
// label inline) would never match.
const BARE_DOB_NUMERIC_RE = /^\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/;
const BARE_DOB_PROSE_RE =
  /^\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i;

/** Extracts just the leading date out of a DOB table row's own value. On
 * a narrow multi-column grid PDF (see clusterIntoCells' own comment in
 * pdfTextReader.ts) a value cell can occasionally overrun into the next
 * field's text before the column mismatch that would normally stop it —
 * "18 August 1984 OCG Harbour Syndicate PASSP ORT UAE Passport N7843 021"
 * for a DOB row that should have been just the date. Passing that whole
 * string through as-is doesn't just read oddly, it fails the review
 * screen's date validation outright and blocks the officer from
 * continuing. Falls back to the value unchanged if it doesn't start with
 * a recognisable date at all, rather than discarding a value in some
 * other shape this doesn't yet handle. */
function extractLeadingDob(value: string): string {
  const trimmed = value.trim();
  const numeric = trimmed.match(BARE_DOB_NUMERIC_RE);
  if (numeric) return numeric[1];
  const prose = trimmed.match(BARE_DOB_PROSE_RE);
  if (prose) {
    const month = MONTH_NUMBERS[prose[2].slice(0, 3).toLowerCase()];
    if (month) return `${prose[1].padStart(2, "0")}/${month}/${prose[3]}`;
  }
  return trimmed;
}

const SUBJECT_HEADING_RE = /SUBJECT|TARGET|PERSON\s+OF\s+INTEREST/i;
const VEHICLES_HEADING_RE = /^VEHICLES?\b/i;
const LOCATION_HEADING_RE = /LOCATIONS?\s+OF\s+INTEREST|^ADDRESSES?\b/i;
const IDENTITY_HEADER_RE = /^(PRIMARY\s+IDENTITY|IDENTITY|SUBJECT|NAME)$/i;

/** A fourth identity shape, alongside a NAME/SUBJECT label:value row
 * (findLabelledValue) and a SUBJECT/TARGET heading with the name on its own
 * paragraph (findSubjectFromParagraphs): a column-HEADED identity table —
 * a header row naming each field ("PRIMARY IDENTITY | OPERATIONAL
 * DESCRIPTION | REFERENCE IDENTIFIERS"), then one data row underneath
 * carrying the actual values, name included — rather than a label sitting
 * in the same row as its own value. Tried last, only once neither of the
 * other two shapes found anything, since a document that already has a
 * plain NAME row should never fall through to this. The name column's cell
 * often bundles more than the name alone ("Leila Mariam HASSAN\nDOB 27 July
 * 1991\nCOB Australia", one fact per line) — the first line is the name,
 * the whole cell is returned too so the caller can still pull a DOB (via
 * DOB_RE, same as findSubjectFromParagraphs) out of the lines underneath. */
function findIdentityColumnTableValue(
  tables: DocumentReadResult["tables"]
): { nameLine: string; cell: string } | null {
  for (const table of tables) {
    if (table.rows.length < 2) continue;
    const header = table.rows[0];
    const idx = header.findIndex(c => IDENTITY_HEADER_RE.test(c.trim()));
    if (idx === -1) continue;
    const cell = (table.rows[1][idx] ?? "").trim();
    const nameLine = cell.split("\n")[0]?.trim();
    if (nameLine) return { nameLine, cell };
  }
  return null;
}

/** When there's no table NAME row at all, a headed-paragraph document
 * (e.g. "1. SUBJECT" followed by the person's name on its own paragraph,
 * then "DOB: 27/06/1993 | COB: ... " on the next) still names its subject
 * unambiguously — it's just organised by heading instead of by table row.
 * Takes the first whole-line name match under a SUBJECT/TARGET/PERSON OF
 * INTEREST heading, and a DOB found anywhere in that same section's text. */
function findSubjectFromParagraphs(
  sections: ParagraphSection[]
): ParsedPersonName | null {
  // More than one section heading can match SUBJECT_HEADING_RE — a
  // document's own title line ("PERSON OF INTEREST PROFILE - TRAINING
  // DATA") matches just as well as a real "Target"/"Subject" card heading
  // further down, but carries no lines under it. Try every match in order
  // rather than stopping at the first (a real training document — QUARRY —
  // has exactly this: the title comes first, empty, and the real subject
  // card is a later section).
  for (const section of sections.filter(s =>
    SUBJECT_HEADING_RE.test(s.heading)
  )) {
    for (const line of section.lines) {
      const person = matchWholeLinePersonName(line);
      if (!person) continue;
      return {
        firstNames: person.firstNames,
        surname: person.surname,
        bornDate: matchDob(section.lines.join("\n")),
        confident: !!(person.firstNames && person.surname),
      };
    }
  }
  return null;
}

// Matches an inline "Subject: <name>" narrative label anywhere in a
// paragraph — the fourth shape a document declares its primary identity
// in, after a NAME/SUBJECT table row, a bare "Subject" heading paragraph
// (findSubjectFromParagraphs), and a column-headed identity table
// (findIdentityColumnTableValue). Seen in a real training document (a
// short "OPERATION IRONBARK" narrative brief opening with "Subject:
// Callum Peter REID • Reporting period: 04–19 August 2026") — without
// this, the document's actual subject never becomes the primary NAME at
// all and instead falls through to the free-text associate scan, showing
// up as just another "Associate Found" alongside everyone else they're
// mentioned with.
const INLINE_SUBJECT_RE = /\bSUBJECT\s*:\s*([^\n]+)/i;

/** Finds an inline "Subject: <name>" mention across every paragraph (see
 * INLINE_SUBJECT_RE). This is a much higher false-positive-risk context
 * than a table cell — an ordinary quoted email header's own "Subject: RE:
 * quarterly review" line matches the same label — so this only ever
 * trusts what matchWholeLinePersonName's strict Firstname [Middlename]
 * SURNAME shape accepts, after cutting the captured text at the first
 * bullet/dash separator that introduces trailing detail ("• Reporting
 * period: ..."), rather than treating everything after the colon as the
 * name. */
function findInlineSubjectMention(
  paragraphs: string[]
): ParsedPersonName | null {
  for (const paragraph of paragraphs) {
    for (const line of paragraph.split("\n")) {
      const m = line.match(INLINE_SUBJECT_RE);
      if (!m) continue;
      const candidate = m[1].split(/\s*[•|]\s*|\s+[-–]\s+/)[0].trim();
      const person = matchWholeLinePersonName(candidate);
      if (person) {
        return {
          firstNames: person.firstNames,
          surname: person.surname,
          bornDate: "",
          confident: !!(person.firstNames && person.surname),
        };
      }
    }
  }
  return null;
}

/** Deduplicates a list of parsed vehicles/addresses by a caller-supplied
 * key — used only for the free-text last-resort scan below, where the same
 * real-world vehicle or address is often mentioned more than once across a
 * document's narrative sections (e.g. a vehicle named once under a
 * "VEHICLES" heading and again in an activity log entry). The labelled/
 * headed extraction paths above never need this: each of their sources is
 * read once, so there's nothing to collide with. */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function mapDocumentToTargetProfile(
  result: DocumentReadResult
): TargetProfileImportResult {
  const rows = result.tables.flatMap(t => t.rows);
  const paragraphSections = findAllParagraphSections(result);

  // A real training document ("LANTERN") uses "SUBJECT" as the table label
  // for the person's name instead of "NAME" — same field, different word.
  // Tried second so a document that genuinely has both keeps "NAME" as the
  // authoritative one.
  //
  // "SUBJECT" is ambiguous in a way "NAME" isn't, though: it's also the
  // column-header title of a genuine column-headed identity table (a real
  // training document — IRONBARK — has one: "SUBJECT | IDENTIFIERS |
  // CONTACT CHANNELS" as the header row, the actual name one row further
  // down under that same column — see findIdentityColumnTableValue).
  // findLabelledValue pairs "SUBJECT" with whatever cell sits right next
  // to it with no awareness of that shape, so on a header row it grabs the
  // NEXT COLUMN'S header ("IDENTIFIERS") instead of a name. Only trust the
  // "SUBJECT" pairing when the paired value actually looks like a person's
  // name; otherwise fall through so findIdentityColumnTableValue below can
  // read the real column-headed shape instead.
  const subjectCellValue = findLabelledValue(rows, "SUBJECT");
  const nameValue =
    findLabelledValue(rows, "NAME") ??
    (subjectCellValue && matchWholeLinePersonName(subjectCellValue)
      ? subjectCellValue
      : null);
  // A separate "DOB" table row is the common shape, but a column-headed
  // identity table (IRONBARK) instead carries it inline inside the same
  // multi-line SUBJECT cell as the name itself ("Callum Peter REID\nDOB 06
  // December 1982\n...") — fall back to scanning that cell's own text
  // before giving up. The DOB row's own value goes through
  // extractLeadingDob rather than being used as-is — see its own comment
  // for why a narrow multi-column grid PDF can occasionally leave trailing
  // garbage from the next field on this specific row.
  const dobRowValue = findLabelledValue(rows, "DOB");
  const dobValue = dobRowValue
    ? extractLeadingDob(dobRowValue)
    : matchDob(nameValue ?? "");
  let name: ParsedPersonName | null = null;
  if (nameValue) {
    const { firstNames, surname } = splitPersonName(nameValue);
    name = {
      firstNames,
      surname,
      bornDate: dobValue,
      confident: !!(firstNames && surname),
    };
  } else {
    // No NAME table row at all — this document may be organised as headed
    // paragraphs instead (see findSubjectFromParagraphs), or as a
    // column-headed identity table (see findIdentityColumnTableValue).
    name = findSubjectFromParagraphs(paragraphSections);
    if (!name) {
      const identityColumn = findIdentityColumnTableValue(result.tables);
      if (identityColumn) {
        const { firstNames, surname } = splitPersonName(
          identityColumn.nameLine
        );
        name = {
          firstNames,
          surname,
          bornDate: matchDob(identityColumn.cell),
          confident: !!(firstNames && surname),
        };
      }
    }
  }
  if (!name) {
    name = findInlineSubjectMention(result.paragraphs);
  }

  let vehiclesValue = findLabelledValue(rows, "VEHICLES") ?? "";
  if (!vehiclesValue) {
    vehiclesValue = findParagraphSection(
      paragraphSections,
      VEHICLES_HEADING_RE
    );
  }
  let vehicles = findVehicleLines(vehiclesValue);
  const unparsedVehicles = findUnparsedVehicleItems(vehiclesValue, vehicles);

  let locationValue = findLabelledValue(rows, "LOCATION OF INTEREST") ?? "";
  if (!locationValue) {
    locationValue = findParagraphSection(
      paragraphSections,
      LOCATION_HEADING_RE
    );
  }
  if (!locationValue) {
    locationValue = findAddressRegisterRows(rows);
  }
  let { addresses, unparsed: unparsedAddresses } =
    parseAddressBlock(locationValue);

  const unmappedFields: UnmappedField[] = [];
  const promisId = findLabelledValue(rows, "PROMIS ID");
  if (promisId) unmappedFields.push({ label: "PROMIS ID", value: promisId });
  for (const label of UNMAPPED_LABELS) {
    const value = findLabelledValue(rows, label);
    if (value) unmappedFields.push({ label, value });
  }

  const freeTextFromTable = findFreeTextSection(rows, "SUMMARY");
  const freeText = [freeTextFromTable, ...result.paragraphs]
    .filter(Boolean)
    .join("\n\n");

  // Last resort — neither a table cell nor a paragraph heading gave any
  // vehicles/addresses at all, so this document doesn't even label these
  // sections. Scan the narrative opportunistically rather than showing the
  // officer nothing, one sentence of one paragraph at a time — NOT the
  // whole joined freeText in one call, which would let findVehicleLines/
  // findAddressLines slice all the way to the next anchor found anywhere
  // later in an entirely unrelated later paragraph, swallowing everything
  // in between into one garbled entry. Deduped since the same real vehicle
  // or address is often mentioned again in narrative/activity text
  // elsewhere in the document. Never runs when the labelled/headed paths
  // above already found something, so a well-structured document never
  // gets a second, redundant pass over its own already-correctly-parsed
  // entries.
  if (vehicles.length === 0 || addresses.length === 0) {
    const narrativeParagraphs = [
      ...freeTextFromTable.split("\n\n"),
      ...result.paragraphs,
    ].filter(Boolean);
    const sentences = narrativeParagraphs.flatMap(splitIntoSentences);
    if (vehicles.length === 0) {
      vehicles = dedupeBy(
        sentences.flatMap(findVehicleLines),
        v => v.registration
      );
    }
    if (addresses.length === 0) {
      addresses = dedupeBy(
        sentences.flatMap(findAddressLines).map(a => ({ ...a, label: "" })),
        a => `${a.houseNo}|${a.streetName}|${a.suburb}`
      );
    }
  }

  // Associates: three different physical shapes a document groups a name
  // with its own address/vehicle — a vertical block (name, then address,
  // then vehicle, each its own line), one dense paragraph with a dash
  // ("Name - address. Vehicle: X. ..."), or one dense paragraph with no
  // dash at all, the name simply leading straight into its own address on
  // the same line (see LEADING_NAME_RE — the shape a document's very first
  // listed associate almost always uses, its own name embedded right in
  // the "Associates:" intro sentence). Merged and deduped by name since
  // which shape a document uses is a document-wide choice, not something
  // any one matcher can tell in advance — trying all four and keeping
  // whichever fire costs nothing when only one or two are actually
  // present. Filters out the target's own name in case a narrative
  // sentence happens to open with it in a shape one of these matchers
  // would otherwise mistake for a new associate declaring itself —
  // findLeadingNameAssociates in particular has no way to know a
  // sentence's leading name is the document's own subject rather than
  // someone new.
  const associateBlocks = dedupeBy(
    [
      ...findAssociateTableRows(result.tables),
      ...findAssociateBlocks(freeText),
      ...findDashSeparatedAssociates(freeText),
      ...findLeadingNameAssociates(freeText),
      ...findDashSeparatedBusinesses(freeText),
      ...findDashSeparatedEntities(freeText),
    ].filter(
      a =>
        !name ||
        a.businessName ||
        a.firstNames !== name.firstNames ||
        a.surname !== name.surname
    ),
    a => a.businessName || `${a.firstNames} ${a.surname}`
  );
  const excludedPersonNames = new Set(
    associateBlocks.map(a => `${a.firstNames} ${a.surname}`)
  );
  if (name) excludedPersonNames.add(`${name.firstNames} ${name.surname}`);
  const excludedBusinessNames = associateBlocks
    .map(a => a.businessName)
    .filter(Boolean);
  // The same real person/business/email/phone is routinely named more than
  // once across a document's different sections (an entity register table,
  // a narrative paragraph, a communications table, a cross-reference list
  // all naming the same three people) — dedupe by type+value so the review
  // screen shows each one once, not once per section it happens to appear
  // in.
  const candidateEntities = dedupeBy(
    scanFreeText(freeText).filter(c => {
      if (c.type === "person") return !excludedPersonNames.has(c.value);
      if (c.type === "business")
        return !excludedBusinessNames.some(b => c.value.startsWith(b));
      return true;
    }),
    c => `${c.type}:${c.value.toLowerCase()}`
  );

  return {
    name,
    addresses,
    vehicles,
    unmappedFields,
    freeText,
    associateBlocks,
    candidateEntities,
    needsReview: [...unparsedAddresses, ...unparsedVehicles],
  };
}
