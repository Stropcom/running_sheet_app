// Orchestrates the individual document-import parsers into the shape the
// review screen needs: turn a target-profile-style .docx's raw table/
// paragraph text (from docxTableReader.ts) into structured fields the Add
// Target form already understands (StructuredNameParts / StructuredAddress-
// Parts / StructuredVehicleParts — see client/src/lib/addressFormat.ts),
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
import type { DocxReadResult } from "./docxTableReader";

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

const ALL_KNOWN_LABELS = new Set<string>([
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
function isHeadingLine(line: string): boolean {
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
function findAllParagraphSections(result: DocxReadResult): ParagraphSection[] {
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
  tables: DocxReadResult["tables"]
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

    let address: ParsedAddressLine | null = null;
    let vehicle: ParsedVehicleLine | null = null;
    let j = i + 1;
    while (j < lines.length && j < i + 3 && (!address || !vehicle)) {
      if (!address) {
        const a = parseAddressLine(lines[j]) ?? parseAddressLineLoose(lines[j]);
        if (a) {
          address = a;
          j++;
          continue;
        }
      }
      if (!vehicle) {
        const v = parseVehicleLine(lines[j]);
        if (v) {
          vehicle = v;
          j++;
          continue;
        }
      }
      break;
    }

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

const DASH_ASSOCIATE_RE =
  /^([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2}\s+[A-Z]{2,}(?:-[A-Z]{2,})?)\s*[-–]\s*(.+)$/;

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
// real whitespace on both sides (unlike DASH_ASSOCIATE_RE/DASH_BUSINESS_RE,
// which don't need this guard — their ALL-CAPS-surname/legal-suffix
// requirement already rules out the case below): being the loosest of the
// three dash matchers, this one would otherwise also match a compact
// reference/event code with no legal name shape at all ("BLU-E01",
// "Reference BLU-7719") as if the hyphen were the "Name - detail"
// separator, corrupting whatever real address/vehicle text followed it
// elsewhere in the same paragraph.
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
  tables: DocxReadResult["tables"]
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
      const dobMatch = section.lines.join("\n").match(DOB_RE);
      return {
        firstNames: person.firstNames,
        surname: person.surname,
        bornDate: dobMatch ? dobMatch[1] : "",
        confident: !!(person.firstNames && person.surname),
      };
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

export function mapDocxToTargetProfile(
  result: DocxReadResult
): TargetProfileImportResult {
  const rows = result.tables.flatMap(t => t.rows);
  const paragraphSections = findAllParagraphSections(result);

  // A real training document ("LANTERN") uses "SUBJECT" as the table label
  // for the person's name instead of "NAME" — same field, different word.
  // Tried second so a document that genuinely has both keeps "NAME" as the
  // authoritative one.
  const nameValue =
    findLabelledValue(rows, "NAME") ?? findLabelledValue(rows, "SUBJECT");
  const dobValue = findLabelledValue(rows, "DOB") ?? "";
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
        const dobMatch = identityColumn.cell.match(DOB_RE);
        name = {
          firstNames,
          surname,
          bornDate: dobMatch ? dobMatch[1] : "",
          confident: !!(firstNames && surname),
        };
      }
    }
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

  // Associates: two different physical shapes a document groups a name
  // with its own address/vehicle — a vertical block (name, then address,
  // then vehicle, each its own line) or one dense paragraph ("Name -
  // address. Vehicle: X. ..."). Merged and deduped by name since which
  // shape a document uses is a document-wide choice, not something either
  // matcher can tell in advance — trying both and keeping whichever fires
  // costs nothing when only one shape is actually present.
  const associateBlocks = dedupeBy(
    [
      ...findAssociateTableRows(result.tables),
      ...findAssociateBlocks(freeText),
      ...findDashSeparatedAssociates(freeText),
      ...findDashSeparatedBusinesses(freeText),
      ...findDashSeparatedEntities(freeText),
    ],
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
