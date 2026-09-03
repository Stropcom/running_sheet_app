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

/** How close two lines' left edges need to be (in PDF points) to count as
 * the same visual column. */
const COLUMN_X_TOLERANCE = 3;
/** How close two cells' top edges need to be (in PDF points) to count as
 * the same table row — a genuine row's cells share (almost) exactly one
 * baseline, since they're set with the same font at the same line. */
const ROW_Y_TOLERANCE = 2;
/** A line-to-line vertical gap counts as "the next physical line of the
 * same wrapped cell" only up to this multiple of the line's own text
 * height — comfortably covers normal single-line-spacing (~1.15x height
 * in practice) while staying well short of the gap to an unrelated row
 * further down the same column (typically 1.5x+, since it has to clear
 * whatever the intervening row's own cell used). */
const WRAP_CONTINUATION_MAX_GAP_RATIO = 1.3;
/** A line whose rendered width is at least this fraction of the widest
 * line ever seen starting at the same x is treated as having been packed
 * right up to its column's edge — see clusterIntoCells' own comment for
 * why that's the signal used to tell a forced mid-word break from a real
 * word-boundary wrap. */
const PACKED_WIDTH_RATIO = 0.9;
function bucketKey(x: number): number {
  return Math.round(x / COLUMN_X_TOLERANCE) * COLUMN_X_TOLERANCE;
}

/** One table cell, possibly rejoined from several wrapped physical lines —
 * see clusterIntoCells. `firstIdx`/`lastIdx` are its span within the page's
 * own `groupIntoLines` output, used to splice the cell (or the row it ends
 * up in) back into the page's natural reading order. */
interface Cell {
  x0: number;
  y: number;
  items: PositionedItem[];
  firstIdx: number;
  lastIdx: number;
}

/** One visual column-segment of a raw physical line — a line carrying more
 * than one table cell on it ("NAME  Marcus Andrew   ROLE  Principal...")
 * has to be considered column by column, not as one unit, otherwise a
 * wrapped continuation of a VALUE that isn't the line's own leftmost item
 * (e.g. "VELASCO" wrapping below "Marcus Andrew", itself embedded to the
 * right of "NAME" on that first physical line) can never be matched back
 * to the right column — its parent line's own x0 is "NAME"'s position,
 * nowhere near "VELASCO"'s. `lineIdx` keeps the link back to the raw line
 * (see clusterIntoCells' `consumed` output) this segment came from. */
interface Segment {
  x0: number;
  y: number;
  width: number;
  height: number;
  items: PositionedItem[];
  lineIdx: number;
}

function lineSegments(line: Line, lineIdx: number): Segment[] {
  return splitLineIntoColumns(line.items).map(items => {
    const last = items[items.length - 1];
    const x0 = items[0].x;
    const x1 = last.x + last.width;
    const height =
      Math.max(...items.map(i => i.height || 0)) || items[0].height || 10;
    return { x0, y: line.y, width: x1 - x0, height, items, lineIdx };
  });
}

/**
 * Finds every text segment that's genuinely part of a multi-column table —
 * caught sitting beside a DIFFERENT column at (about) the same y,
 * somewhere on the page (see the co-occurrence check below) — and rejoins
 * each one's word-wrapped continuation lines back into a single cell. For
 * a PDF whose table cells (or a narrow title column) are narrower than
 * some of their own content, see the module comment's own note on genuine
 * multi-column grid tables being out of scope, which this narrows: a
 * document generated with a naive fixed-width text layout (seen in real
 * training documents, e.g. a "TARGET PROFILE" header table with cells
 * barely wider than their label) will hard-wrap a single word with no
 * hyphen and no trailing space at all — "OPERATION" renders as two
 * stacked lines "OPERATI" / "ON" at the exact same x position — which
 * otherwise shatters every downstream heading/label/name match that
 * assumes a "line" is a complete visual unit.
 *
 * Co-occurrence (a real DIFFERENT column caught at this exact row) is the
 * only eligibility signal — deliberately NOT combined with a width check
 * on whether a segment "looks narrow enough to be a cell". Two earlier
 * versions tried exactly that (once globally per x-position, once even
 * per segment) and both silently dropped a genuine, complete table value
 * instead of merely mis-joining it: a value column can coincidentally
 * share its x with a document's own body-paragraph text lower down the
 * page (not a coincidence — a common shared tab-stop), which poisons a
 * global "widest line ever seen at this x" check for every segment in
 * that bucket; and a single value that's simply LONG on its own line
 * (needing no wrap at all, e.g. "Red Mazda 3, WA registration 2XYZ789
 * (Vehicle 2XYZ789)") fails a per-segment width check even though it was
 * never a wrapped cell to begin with. Either way the value never became a
 * cell, so once its own row got built from whatever OTHER segments in the
 * same physical line DID qualify, that whole physical line counted as
 * "claimed" and the value's own leftover segment was never re-emitted
 * anywhere — not mis-parsed, just gone, taking a target's own name or
 * vehicle with it. Co-occurrence alone doesn't have this failure mode: a
 * plain flowing paragraph never has a genuinely different column sitting
 * at the exact same y purely by chance, narrow or not, so nothing further
 * is needed to keep ordinary body text out of the table-reflow path (see
 * the module test fixtures' own ECHOPOINT and COBALT documents, where
 * this is exactly what's being told apart). Width still matters for HOW
 * a cell's own wrap gets rejoined (see the join-heuristic paragraph
 * below) — it just doesn't gate whether a segment enters this function's
 * output at all anymore.
 *
 * Two lines are treated as one (table) cell's wrap when they start at
 * (about) the same x and sit only one line-height apart vertically (see
 * the two tolerances above) — that combination reliably separates "next
 * line of the same wrapped cell" from "next row of the table", which
 * lands either at a different x or with a distinctly bigger gap (having
 * to clear whatever the intervening row used).
 *
 * Whether to rejoin two lines with a space or not can't be read off the
 * text alone — nothing in the PDF marks which wraps happened at a real
 * space and which cut a single word in half, and both shapes occur in the
 * very same document (see the module test fixtures — "New"/"Zealand" is a
 * real word-boundary wrap sitting one row away from the mid-word
 * "PASSPO"/"RT"). The signal used instead is geometric: this generator
 * only breaks a line early, well short of the column's own width, when it
 * ran out of whole words that fit (a real word-boundary wrap, needing a
 * space on rejoin) — a forced mid-word break only happens when a single
 * token doesn't fit the column at all, which packs that line right up to
 * the column's own widest-ever line (needing no space on rejoin, since
 * the two fragments are one word). Not perfect — a word-boundary wrap
 * that happens to pack tightly can still misfire — but it resolves every
 * case found in real training documents so far.
 */
function clusterIntoCells(lines: Line[]): {
  cells: Cell[];
  consumed: boolean[];
} {
  const segments: Segment[] = [];
  lines.forEach((line, i) => segments.push(...lineSegments(line, i)));

  const colMaxWidth = new Map<number, number>();
  for (const s of segments) {
    if (s.width <= 0) continue;
    const key = bucketKey(s.x0);
    colMaxWidth.set(key, Math.max(colMaxWidth.get(key) ?? 0, s.width));
  }

  // A segment counts as sitting IN a table row only if it itself — at its
  // own specific y, not just "this x anywhere on the page" — is caught
  // beside a DIFFERENT column at (about) the same y. Checked per segment
  // rather than aggregated into a page-level set of "table x-positions":
  // a document's own flowing narrative can easily share its left margin
  // with a genuine narrow table elsewhere on the SAME page (the module
  // test fixtures' own COBALT document does exactly this — its "SUMMARY"/
  // "Associates:" narrative starts at the very same x as the header
  // table's own label column) — flagging that whole x-position as
  // "table-like" would sweep the narrative in right along with the real
  // table rows. Only THIS row having a genuine neighbour reliably means
  // THIS row is part of a table. O(n^2) over the page's own segments (at
  // most a few hundred), so cheap in practice.
  const hasRowMate = new Array(segments.length).fill(false);
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].width <= 0) continue;
    const bi = bucketKey(segments[i].x0);
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].width <= 0) continue;
      if (bucketKey(segments[j].x0) === bi) continue;
      if (Math.abs(segments[i].y - segments[j].y) <= ROW_Y_TOLERANCE) {
        hasRowMate[i] = true;
        hasRowMate[j] = true;
      }
    }
  }
  const segConsumed = new Array(segments.length).fill(false);
  const cells: Cell[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (segConsumed[i]) continue;
    const s0 = segments[i];
    // Co-occurrence (hasRowMate) is the only eligibility gate — see the
    // function comment for why a width check here, tried twice, silently
    // dropped genuine table values instead of just mis-joining them.
    if (s0.width <= 0 || !hasRowMate[i]) continue;
    segConsumed[i] = true;
    const bucket = bucketKey(s0.x0);
    const items = [...s0.items];
    let lastY = s0.y;
    let lastWidth = s0.width;
    let lastHeight = s0.height;
    const firstIdx = s0.lineIdx;
    let lastIdx = s0.lineIdx;

    for (let j = i + 1; j < segments.length; j++) {
      if (segConsumed[j]) continue;
      const sj = segments[j];
      if (sj.width <= 0 || bucketKey(sj.x0) !== bucket) continue;
      const gap = lastY - sj.y;
      if (gap <= 0 || gap > lastHeight * WRAP_CONTINUATION_MAX_GAP_RATIO) break;
      const max = colMaxWidth.get(bucket) ?? lastWidth;
      const packed = lastWidth >= max * PACKED_WIDTH_RATIO;
      if (!packed) {
        items.push({
          str: " ",
          x: sj.x0,
          y: sj.y,
          width: 0,
          height: 0,
          hasEOL: false,
        });
      }
      items.push(...sj.items);
      segConsumed[j] = true;
      lastY = sj.y;
      lastWidth = sj.width;
      lastHeight = sj.height || lastHeight;
      lastIdx = sj.lineIdx;
    }

    cells.push({ x0: s0.x0, y: s0.y, items, firstIdx, lastIdx });
  }

  // A raw line only counts as fully folded into cells (safe for
  // buildPageUnits to skip outright) once EVERY segment it contributed is
  // itself part of some cell — a line with even one wide (non-table)
  // segment never enters the loop above at all, so it's correctly left
  // for buildPageUnits' plain-line fallback instead, unmodified.
  const segIdxByLine = new Map<number, number[]>();
  segments.forEach((s, idx) => {
    const list = segIdxByLine.get(s.lineIdx);
    if (list) list.push(idx);
    else segIdxByLine.set(s.lineIdx, [idx]);
  });
  const consumed = lines.map((_, i) => {
    const idxs = segIdxByLine.get(i) ?? [];
    return idxs.length > 0 && idxs.every(idx => segConsumed[idx]);
  });

  return { cells, consumed };
}

/** One physical line (ordinary flowing text) or one aligned table row
 * (several cells from different columns sharing the same y) — the page's
 * natural reading-order stream after clusterIntoCells has pulled the
 * narrow-column cells out of it. `idx` is the position (in the page's own
 * groupIntoLines output) this unit occupies, used only to keep units in
 * the page's original top-to-bottom order. */
type PageUnit =
  | { kind: "line"; idx: number; line: Line }
  | { kind: "row"; idx: number; cells: Cell[] };

/**
 * Reduces a page's physical lines to a reading-order stream of PageUnits —
 * ordinary lines untouched, narrow-column cells (see clusterIntoCells)
 * grouped into aligned rows wherever several of them share the same y
 * (a genuine table row, e.g. "NAME  Marcus Andrew   ROLE  Principal..." —
 * two label/value pairs side by side), otherwise passed through as a
 * single-cell "row". A cell/row is spliced back in at the position of its
 * OWN earliest line, so it reads in the same place a plain paragraph line
 * there would have. */
function buildPageUnits(lines: Line[]): PageUnit[] {
  const { cells, consumed } = clusterIntoCells(lines);

  const rows: { cells: Cell[]; firstIdx: number }[] = [];
  const usedCell = new Array(cells.length).fill(false);
  const byY = cells.map((_, i) => i).sort((a, b) => cells[b].y - cells[a].y);
  for (const i of byY) {
    if (usedCell[i]) continue;
    const rowCells = [cells[i]];
    usedCell[i] = true;
    for (const j of byY) {
      if (usedCell[j] || j === i) continue;
      if (Math.abs(cells[j].y - cells[i].y) <= ROW_Y_TOLERANCE) {
        rowCells.push(cells[j]);
        usedCell[j] = true;
      }
    }
    rowCells.sort((a, b) => a.x0 - b.x0);
    rows.push({
      cells: rowCells,
      firstIdx: Math.min(...rowCells.map(c => c.firstIdx)),
    });
  }
  const rowAtIdx = new Map(rows.map(r => [r.firstIdx, r]));

  const units: PageUnit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const row = rowAtIdx.get(i);
    if (row) {
      units.push({ kind: "row", idx: i, cells: row.cells });
      continue;
    }
    if (consumed[i]) continue; // folded into some other cell/row already emitted
    units.push({ kind: "line", idx: i, line: lines[i] });
  }
  return units;
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

/** Renders one line's items to plain text, and — if it carries one or more
 * labelled fields — also as synthetic [label, value] table rows. Tries the
 * simpler colon-separated shape first ("NAME: John Smith", however many
 * text items that string happens to be split across), then falls back to
 * position-based column splitting.
 *
 * The column-split path returns as many [label, value] pairs as the line
 * actually has: a genuine two-column table row (one label, one value) is
 * the common case, but a grid-table layout — several label/value pairs
 * side by side on one physical row, e.g. "NAME  Marcus Andrew   ROLE
 * Principal COB..." — is walked as one label per recognised label column,
 * with everything up to the NEXT recognised label column claimed as that
 * label's own value. Without this, only the first pair would be kept and
 * every later label on the same row would be swallowed into the first
 * value instead of read as its own field. */
function readLine(items: PositionedItem[]): {
  text: string;
  rows: string[][] | null;
} {
  const text = columnText(items);
  if (!text) return { text: "", rows: null };

  const colonMatch = text.match(COLON_LABEL_RE);
  if (colonMatch) {
    return {
      text,
      rows: [[canonicalLabel(colonMatch[1]), colonMatch[2].trim()]],
    };
  }

  const columns = splitLineIntoColumns(items);
  if (columns.length >= 2) {
    const labelIdxs: number[] = [];
    for (let i = 0; i < columns.length; i++) {
      const t = columnText(columns[i]);
      if (LINE_LABELS.some(l => l.toUpperCase() === t.toUpperCase())) {
        labelIdxs.push(i);
      }
    }
    if (labelIdxs.length > 0) {
      const rows: string[][] = [];
      for (let k = 0; k < labelIdxs.length; k++) {
        const startIdx = labelIdxs[k];
        const endIdx =
          k + 1 < labelIdxs.length ? labelIdxs[k + 1] : columns.length;
        const label = columnText(columns[startIdx]);
        const value = columns
          .slice(startIdx + 1, endIdx)
          .map(columnText)
          .filter(Boolean)
          .join(" ");
        if (value) rows.push([canonicalLabel(label), value]);
      }
      if (rows.length > 0) return { text, rows };
    }
  }

  return { text, rows: null };
}

/** Turns an aligned table row's cells (see buildPageUnits) into
 * [label, value] pairs — the grid-table equivalent of readLine's own
 * gap-based column pairing above, but without needing to re-derive
 * "columns" from a horizontal-gap guess: buildPageUnits has already
 * grouped genuinely distinct columns into their own cells, so this just
 * walks them left to right, claiming every cell up to the next
 * recognised label as that label's value. Returns null (rather than an
 * empty array) when none of the row's cells look like a label at all, so
 * the caller can fall back to treating the row as flowing text instead —
 * a row is only ever built because cells happened to share a y, which
 * doesn't guarantee they're actually a labelled row. */
function pairRowCells(cells: Cell[]): string[][] | null {
  const texts = cells.map(c => columnText(c.items));
  const labelIdxs: number[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (LINE_LABELS.some(l => l.toUpperCase() === texts[i].toUpperCase())) {
      labelIdxs.push(i);
    }
  }
  if (labelIdxs.length === 0) return null;
  const rows: string[][] = [];
  for (let k = 0; k < labelIdxs.length; k++) {
    const startIdx = labelIdxs[k];
    const endIdx = k + 1 < labelIdxs.length ? labelIdxs[k + 1] : texts.length;
    const value = texts
      .slice(startIdx + 1, endIdx)
      .filter(Boolean)
      .join(" ");
    if (value) rows.push([canonicalLabel(texts[startIdx]), value]);
  }
  return rows.length > 0 ? rows : null;
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

      for (const unit of buildPageUnits(groupIntoLines(items))) {
        // A "row" (2+ narrow-column cells sharing a y — see
        // buildPageUnits) is tried as a genuine multi-label grid row
        // first; a lone cell or a row with no recognised label falls
        // back to readLine's own colon/gap-based reading over the same
        // items, exactly as a plain physical line would use.
        let text: string;
        let rows: string[][] | null;
        let y: number;
        if (unit.kind === "row") {
          const flat = unit.cells.flatMap(c => c.items);
          const read = readLine(flat);
          text = read.text;
          rows = pairRowCells(unit.cells) ?? read.rows;
          y = unit.cells[0].y;
        } else {
          const read = readLine(unit.line.items);
          text = read.text;
          rows = read.rows;
          y = unit.line.y;
        }
        if (!text) {
          flushParagraph();
          prevLineY = null;
          continue;
        }
        if (rows) {
          tableRows.push(...rows);
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
        const gap = prevLineY !== null ? Math.abs(prevLineY - y) : prevLineGap;
        if (prevLineY !== null && gap > prevLineGap * 1.6) {
          flushParagraph();
        }
        paragraphBuffer.push(text);
        prevLineY = y;
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
