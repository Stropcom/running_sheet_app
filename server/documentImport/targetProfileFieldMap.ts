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
 * not consistent") preceded by its own "<Something>:" label line, e.g.
 * "Current Address:\n3 Appletree Place, Woodvale WA 6026.". Falls back to
 * an unlabelled entry when a line matches the address shape with no
 * preceding label line. A line that follows a label but matches neither
 * parseAddressLine nor its loose fallback (e.g. a corner address with no
 * house number, "Cnr Smith St and Jones Ave, SUBURB WA") used to be
 * silently dropped — now it's reported via `unparsed` instead, so the
 * officer sees "we found a Current Address, couldn't read it" rather than
 * nothing at all. */
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
    const labelMatch = line.match(/^([A-Za-z][A-Za-z\s]{1,40}):\s*$/);
    if (labelMatch) {
      pendingLabel = labelMatch[1].trim();
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
        address,
        vehicle,
      });
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
export function mapDocxToTargetProfile(
  result: DocxReadResult
): TargetProfileImportResult {
  const rows = result.tables.flatMap(t => t.rows);

  const nameValue = findLabelledValue(rows, "NAME");
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
  }

  const vehiclesValue = findLabelledValue(rows, "VEHICLES") ?? "";
  const vehicles = findVehicleLines(vehiclesValue);
  const unparsedVehicles = findUnparsedVehicleItems(vehiclesValue, vehicles);

  const locationValue = findLabelledValue(rows, "LOCATION OF INTEREST") ?? "";
  const { addresses, unparsed: unparsedAddresses } =
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
  const associateBlocks = findAssociateBlocks(freeText);
  const blockNames = new Set(
    associateBlocks.map(a => `${a.firstNames} ${a.surname}`)
  );
  const candidateEntities = scanFreeText(freeText).filter(
    c => !(c.type === "person" && blockNames.has(c.value))
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
