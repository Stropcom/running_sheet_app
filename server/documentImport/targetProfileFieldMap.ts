// Orchestrates the individual document-import parsers into the shape the
// review screen needs: turn a target-profile-style .docx's raw table/
// paragraph text (from docxTableReader.ts) into structured fields the Add
// Target form already understands (StructuredNameParts / StructuredAddress-
// Parts / StructuredVehicleParts — see client/src/lib/addressFormat.ts),
// plus whatever this document format carries that the schema has no field
// for yet (PROMIS ID, OCG, COB, ...) shown read-only, plus free-text
// candidate entities for a human to confirm. Nothing here writes to the
// database — this module only produces a proposed shape for the review UI.
import { parseAddressLine, type ParsedAddressLine } from "./addressLineParser";
import { findVehicleLines, type ParsedVehicleLine } from "./vehicleLineParser";
import { scanFreeText, type CandidateEntity } from "./freeTextEntityScan";
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
  /** Person/business/email/phone mentions found in `freeText` — each one is
   * a suggestion for the review screen, not a fact to persist directly. */
  candidateEntities: CandidateEntity[];
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

function splitPersonName(full: string): { firstNames: string; surname: string } {
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
 * preceding label line. */
function parseAddressBlock(text: string): ParsedAddressEntry[] {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const out: ParsedAddressEntry[] = [];
  let pendingLabel = "";
  for (const line of lines) {
    const labelMatch = line.match(/^([A-Za-z][A-Za-z\s]{1,40}):\s*$/);
    if (labelMatch) {
      pendingLabel = labelMatch[1].trim();
      continue;
    }
    const parsed = parseAddressLine(line);
    if (parsed) {
      out.push({ ...parsed, label: pendingLabel });
      pendingLabel = "";
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

  const locationValue = findLabelledValue(rows, "LOCATION OF INTEREST") ?? "";
  const addresses = parseAddressBlock(locationValue);

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
  const candidateEntities = scanFreeText(freeText);

  return {
    name,
    addresses,
    vehicles,
    unmappedFields,
    freeText,
    candidateEntities,
  };
}
