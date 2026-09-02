// Reads a typed-text PDF's real text layer via pdfjs-dist — entirely
// offline, no OCR, no external AI/vision call (see CLAUDE.md's Golden
// Rule). A scanned/photographed PDF has no text layer at all and comes
// back with nothing to read; that's surfaced by the caller as "couldn't
// read this file" rather than pretended to work.
//
// Unlike a .docx, a PDF has no native table markup — text is just glyphs
// positioned at x/y coordinates on a page. docxTableReader.ts can walk a
// real <w:tbl> tree; this has to reconstruct structure from position data
// instead:
//   - text items are grouped into visual lines (pdf.js's own end-of-line
//     signal, with a y-jump as a fallback);
//   - lines are grouped into paragraphs by vertical gap (a bigger-than-
//     normal gap between lines reads as a paragraph break, the same as a
//     blank line would in a .docx);
//   - a line whose first column of text is exactly one of the known
//     target-profile field labels (NAME, DOB, VEHICLES, ROLE, ...),
//     separated from the rest of the line by a colon or by an unusually
//     wide horizontal gap (the two-column "Label | Value" table row the
//     existing .docx template uses, once flattened onto one PDF text
//     line), is reconstructed as a synthetic [label, value] table row —
//     which is what lets targetProfileFieldMap.ts's existing table-lookup
//     logic (findLabelledValue, findFreeTextSection, ...) work unmodified
//     on either format.
// A PDF with a genuine multi-column grid table (more than two columns,
// e.g. the .docx column-headed identity table findIdentityColumnTableValue
// handles) isn't reconstructed here — that's a materially harder
// coordinate-clustering problem, deliberately out of scope for now. Its
// content still comes through as best-effort paragraph text instead of
// being lost, just without the structured label/value lookup.
import { createRequire } from "module";
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ALL_KNOWN_LABELS, isHeadingLine } from "./targetProfileFieldMap";
import type { DocumentReadResult } from "./documentReadResult";

// pdfjs-dist's public type entrypoint doesn't re-export TextItem, so this
// declares only the fields actually read below rather than depending on
// an internal type path that can move between versions.
interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

// pdf.js needs to know where its bundled standard font metrics live when
// running in Node (there's no browser origin to fetch them from relative
// to) — without this it still extracts text correctly, just with a noisy
// console warning on every call.
const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL =
  path.join(
    path.dirname(require.resolve("pdfjs-dist/package.json")),
    "standard_fonts"
  ) + "/";

// "SUBJECT" is a real alternate label targetProfileFieldMap.ts falls back
// to for NAME (a training document used it instead of "NAME") but isn't
// itself in ALL_KNOWN_LABELS, which only lists the labels
// findFreeTextSection needs to recognise as a section-ending stop word —
// added here too so a PDF using that wording still gets picked up.
const LINE_LABELS = Array.from(ALL_KNOWN_LABELS).concat("SUBJECT");

// Longest-first so "LOCATION OF INTEREST" is tried before any shorter
// label that happens to be one of its own words.
const LABEL_ALTERNATION = LINE_LABELS.slice()
  .sort((a, b) => b.length - a.length)
  .map(l => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const COLON_LABEL_RE = new RegExp(`^(${LABEL_ALTERNATION})\\s*:\\s*(.+)$`, "i");

function canonicalLabel(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return LINE_LABELS.find(l => l.toUpperCase() === upper) ?? raw.trim();
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

interface Line {
  y: number;
  items: PositionedItem[];
}

/** Groups a page's text items (already in reading order from pdf.js) into
 * visual lines, using pdf.js's own hasEOL flag as the primary signal and a
 * y-jump as a fallback for the rare document where that flag is absent
 * (e.g. a rotated or unusually constructed page). */
function groupIntoLines(items: PositionedItem[]): Line[] {
  const lines: Line[] = [];
  let current: PositionedItem[] = [];
  let currentY: number | null = null;
  for (const item of items) {
    if (
      current.length > 0 &&
      currentY !== null &&
      Math.abs(item.y - currentY) > 2
    ) {
      lines.push({ y: currentY, items: current });
      current = [];
    }
    current.push(item);
    currentY = item.y;
    if (item.hasEOL) {
      lines.push({ y: currentY, items: current });
      current = [];
      currentY = null;
    }
  }
  if (current.length > 0 && currentY !== null) {
    lines.push({ y: currentY, items: current });
  }
  return lines;
}

/** Splits one line's items into visual "columns" — runs of items with no
 * unusually large horizontal gap between them. A gap counts as a column
 * break either because the next item starts well past where the previous
 * one ended, or because the gap is itself represented as a single
 * whitespace-only item stretched across it (how some PDF generators, e.g.
 * a table cell exported from Word, render the space between columns). The
 * threshold scales with the line's own text height so it adapts to
 * whatever font size the document actually uses, rather than assuming a
 * fixed point size. */
function splitLineIntoColumns(items: PositionedItem[]): PositionedItem[][] {
  const avgHeight =
    items.reduce((sum, it) => sum + (it.height || 0), 0) / (items.length || 1);
  const threshold = Math.max(18, (avgHeight || 10) * 3);

  const columns: PositionedItem[][] = [];
  let current: PositionedItem[] = [];
  let runningEndX: number | null = null;

  for (const item of items) {
    const isWideBlank = item.str.trim() === "" && item.width > threshold;
    const gap = runningEndX === null ? 0 : item.x - runningEndX;
    if (isWideBlank || gap > threshold) {
      if (current.length > 0) columns.push(current);
      current = [];
      // A wide blank item itself is the separator, not part of either
      // column's text — don't carry it into the next column, and don't
      // let it establish runningEndX (that would make the *next* real
      // gap measurement wrong).
      runningEndX = isWideBlank ? null : item.x + item.width;
      if (!isWideBlank) current.push(item);
      continue;
    }
    current.push(item);
    runningEndX = item.x + item.width;
  }
  if (current.length > 0) columns.push(current);
  return columns;
}

function columnText(items: PositionedItem[]): string {
  return items
    .map(i => i.str)
    .join("")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Renders one line's items to plain text, and — if it's a labelled
 * field — also as a synthetic [label, value] table row. Tries the
 * simpler colon-separated shape first ("NAME: John Smith", however many
 * text items that string happens to be split across), then falls back to
 * position-based column splitting for a genuine two-column table row with
 * no colon at all. */
function readLine(items: PositionedItem[]): {
  text: string;
  row: string[] | null;
} {
  const text = columnText(items);
  if (!text) return { text: "", row: null };

  const colonMatch = text.match(COLON_LABEL_RE);
  if (colonMatch) {
    return { text, row: [canonicalLabel(colonMatch[1]), colonMatch[2].trim()] };
  }

  const columns = splitLineIntoColumns(items);
  if (columns.length >= 2) {
    const label = columnText(columns[0]);
    if (LINE_LABELS.some(l => l.toUpperCase() === label.toUpperCase())) {
      const value = columns.slice(1).map(columnText).filter(Boolean).join(" ");
      if (value) return { text, row: [canonicalLabel(label), value] };
    }
  }

  return { text, row: null };
}

/** Reads every page's text from a PDF's bytes, reconstructing labelled
 * lines as synthetic table rows and everything else as paragraph text
 * (see the module comment). Returns an empty result (not a thrown error)
 * for a corrupt, unreadable, or password-protected file, or one with no
 * text layer at all (a scanned image) — the caller surfaces that as
 * "couldn't read this file" rather than a crash, the same tolerant-
 * failure pattern docxTableReader.ts uses. */
export async function readPdfText(buffer: Buffer): Promise<DocumentReadResult> {
  try {
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      // Errors only — a corrupt/non-PDF upload otherwise logs pdf.js's own
      // internal "indexing all objects" recovery-attempt warnings straight
      // to the server console before this function's catch below quietly
      // turns it into an empty result.
      verbosity: 0,
    }).promise;

    const tableRows: string[][] = [];
    const paragraphs: string[] = [];
    let paragraphBuffer: string[] = [];
    let prevLineY: number | null = null;
    let prevLineGap = 14;

    const flushParagraph = () => {
      if (paragraphBuffer.length > 0) {
        paragraphs.push(paragraphBuffer.join("\n"));
        paragraphBuffer = [];
      }
    };

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items: PositionedItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue; // TextMarkedContent carries no position
        const item = raw as unknown as RawTextItem;
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          hasEOL: item.hasEOL,
        });
      }

      for (const line of groupIntoLines(items)) {
        const { text, row } = readLine(line.items);
        if (!text) {
          flushParagraph();
          prevLineY = null;
          continue;
        }
        if (row) {
          tableRows.push(row);
          flushParagraph();
          prevLineY = null;
          continue;
        }
        // A section-heading line ("VEHICLES", "SUMMARY", "LOCATION OF
        // INTEREST", ...) needs to become its own paragraph regardless of
        // how much vertical whitespace surrounds it — a real Word document
        // gets that for free (a heading is always its own paragraph
        // object), but flowed PDF text often gives a heading only a normal
        // line-height gap from the content around it, well under the
        // blank-line threshold below. Without this, findParagraphSection/
        // findSubjectFromParagraphs (which key off a heading being its own
        // paragraph) never see it, and the section it introduces silently
        // falls back to the much weaker whole-document narrative scan.
        if (isHeadingLine(text)) {
          flushParagraph();
          paragraphs.push(text);
          prevLineY = null;
          continue;
        }
        const gap =
          prevLineY !== null ? Math.abs(prevLineY - line.y) : prevLineGap;
        if (prevLineY !== null && gap > prevLineGap * 1.6) {
          flushParagraph();
        }
        paragraphBuffer.push(text);
        prevLineY = line.y;
        if (gap > 0) prevLineGap = gap;
      }
      flushParagraph();
      prevLineY = null;
    }

    if (tableRows.length === 0 && paragraphs.length === 0) {
      return { tables: [], paragraphs: [] };
    }
    return {
      tables: tableRows.length > 0 ? [{ rows: tableRows }] : [],
      paragraphs,
    };
  } catch {
    return { tables: [], paragraphs: [] };
  }
}
