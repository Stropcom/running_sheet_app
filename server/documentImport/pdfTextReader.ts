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
import { getDocument, OPS, ImageKind } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { ALL_KNOWN_LABELS, isHeadingLine } from "./targetProfileFieldMap";
import type {
  DocumentReadResult,
  ExtractedDocumentImage,
} from "./documentReadResult";

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

// Single-word labels only (multi-word ones like "LOCATION OF INTEREST"
// need their own dedicated column-splitting, since a label spanning
// several PDF text items can't be recognised by checking one item at a
// time) — used by resplitEmbeddedLabels below to catch a label that
// landed INSIDE another column's own text because the gap in front of it
// was too tight for splitLineIntoColumns' pixel-width threshold to catch
// (found against a real training document whose NAME/ROLE columns sit
// only ~14pt apart — under that threshold's 18pt floor).
const SINGLE_WORD_LABELS = new Set(
  LINE_LABELS.filter(l => !/\s/.test(l)).map(l => l.toUpperCase())
);

// Longest-first so "LOCATION OF INTEREST" is tried before any shorter
// label that happens to be one of its own words.
const LABEL_ALTERNATION = LINE_LABELS.slice()
  .sort((a, b) => b.length - a.length)
  .map(l => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const COLON_LABEL_RE = new RegExp(`^(${LABEL_ALTERNATION})\\s*:\\s*(.+)$`, "i");
// A forced mid-word wrap never resumes with a whole recognised field label
// immediately followed by a word boundary — a genuine leftover word
// fragment is never itself a real word, let alone one of this document
// family's own known field labels (NAME, DOB, VEHICLES, ...). See
// clusterIntoCells' use of this below for the real bug it catches.
const LEADING_LABEL_RE = new RegExp(`^(${LABEL_ALTERNATION})\\b`, "i");

function canonicalLabel(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return LINE_LABELS.find(l => l.toUpperCase() === upper) ?? raw.trim();
}

// Individual words drawn from the app's own known label vocabulary
// (LINE_LABELS split on whitespace), plus a handful of recurring
// document-title/section words seen across real training documents
// (OPERATION, TARGET, PROFILE, VERSION, ASSOCIATE/S) that aren't
// themselves field labels but appear the same way — used as the
// tiebreaker in clusterIntoCells' word-join decision below, see its own
// comment for why a pure pixel-width guess isn't reliable enough on its
// own. Deliberately NOT a general English dictionary: that would risk
// forcing together two genuinely separate real words (a name, a place)
// that just happen to look plausible concatenated — restricting this to
// the app's own controlled vocabulary keeps the false-positive risk near
// zero while still covering every case found so far.
const KNOWN_VOCABULARY_WORDS = new Set(
  LINE_LABELS.flatMap(l => l.toUpperCase().split(/\s+/)).concat([
    "OPERATION",
    "TARGET",
    "PROFILE",
    "VERSION",
    "ASSOCIATE",
    "ASSOCIATES",
  ])
);

// "Associates:" (and close variants) is excluded even though it's a
// standalone colon line too — it introduces a LIST of separate people,
// each with their own name/address/vehicle on their own following lines,
// not one single fact whose value happens to wrap across several lines.
// Eagerly walking its own column here would glue that whole list into one
// cell (see the real training document, Operation COBALT, whose own
// regression test exists specifically to keep "Trent HOLLOWAY" as its own
// separate paragraph line — findAssociateBlocks elsewhere depends on that
// shape to recognise an associate at all).
const LIST_INTRO_LABEL_RE = /^associates?$/i;

/** A standalone "Word(s):" line — nothing else on it — is unambiguously a
 * field label regardless of whether anything else on the page happens to
 * share its y (see clusterIntoCells' own eligibility comment): real prose
 * essentially never ends a whole line at a bare label-shaped colon. */
function isStandaloneColonLabel(text: string): boolean {
  const trimmed = text.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z\s]{0,40}):$/);
  return !!match && !LIST_INTRO_LABEL_RE.test(match[1].trim());
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
 * whatever the intervening row's own cell used). A real training document
 * family (Operation NIGHTJAR/ORCHARD/CROSSWIND/MIRAGE) hard-wraps a
 * 2-line label ("PASSPORT" as "PASSPOR"/"T", "PROMIS ID" as "PROMIS"/"ID")
 * at a 1.38x gap — just outside the previous 1.3 threshold, so the two
 * fragments never rejoined into one cell at all and were left as two
 * separate stray lines. 1.4 covers this without reaching anywhere near
 * the 1.5x+ next-row gap. */
const WRAP_CONTINUATION_MAX_GAP_RATIO = 1.4;
/** A line whose rendered width is at least this fraction of the widest
 * line ever seen starting at the same x is treated as having been packed
 * right up to its column's edge — see clusterIntoCells' own comment for
 * why that's the signal used to tell a forced mid-word break from a real
 * word-boundary wrap. */
const PACKED_WIDTH_RATIO = 0.9;
/** The packed-width signal above is only trustworthy as evidence of a
 * forced MID-WORD break in a column this narrow (in points) or less — see
 * clusterIntoCells' own comment for why. A single ordinary English word
 * essentially never needs more room than this, so a column any wider
 * genuinely had space for multiple whole words on one line; a line that
 * still ends up "packed" there (its width close to the column's own
 * widest-ever line) is exactly what NORMAL word-wrapping produces for
 * every full line of a paragraph except its last — not a sign anything
 * was cut off mid-word. Found against a real training document (NIGHTJAR)
 * whose "Associates:" section runs one long run-on paragraph (name,
 * address, vehicle, mobile, background) all in one ~200pt-wide column:
 * nearly every one of its wrapped lines was "packed" by this ordinary
 * word-wrap definition, so the ratio-only check joined the vehicle
 * sentence's own closing "." straight onto the next fact's label with no
 * space at all ("...wagon.Mobile: 0491...") — not a narrow-grid table cell
 * being hard-wrapped, just two adjacent complete sentences sharing a left
 * margin. */
const NARROW_JOIN_MAX_WIDTH = 120;
function bucketKey(x: number): number {
  return Math.round(x / COLUMN_X_TOLERANCE) * COLUMN_X_TOLERANCE;
}

function startsWithKnownLabel(items: PositionedItem[]): boolean {
  const text = items
    .map(it => it.str)
    .join("")
    .trimStart();
  return LEADING_LABEL_RE.test(text);
}

/** One table cell, possibly rejoined from several wrapped physical lines —
 * see clusterIntoCells. `firstIdx`/`lastIdx` are its span within the page's
 * own `groupIntoLines` output, used to splice the cell (or the row it ends
 * up in) back into the page's natural reading order. `y` is the cell's own
 * FIRST line — its natural reading-order anchor, kept as the reference
 * point candidate-value searches (recoverCenteredLabelValues) measure
 * distance from. `centerY` is the midpoint between its first and last
 * line, used instead of `y` specifically for deciding which OTHER cells
 * share its row (buildPageUnits) — see centerY's own field comment for
 * why the two need to differ for a short, vertically-centred multi-line
 * cell. */
interface Cell {
  x0: number;
  y: number;
  centerY: number;
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
 * that happens to pack tightly can still misfire (see a real training
 * document, BLUEGUM, where a name line and the following "DOB ..." line
 * both happened to pack tightly purely by coincidence, joining into
 * "HASSANDOB" with no space) — the packed check alone isn't trusted when
 * the next line starts with one of this document family's own known field
 * labels (see startsWithKnownLabel), since a real leftover word fragment
 * from a mid-word break is never itself a whole recognised label — but it
 * resolves every case found in real training documents so far.
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
  // A segment that itself lacks a row-mate can still be a genuine table
  // cell's FIRST line, when its own wrap-continuation is what ends up
  // coinciding with a real row-mate elsewhere — e.g. an address's first
  // line ("14 Bannister Road, CANNING") shares no y with anything else on
  // the page, but its own wrapped second line ("VALE WA 6155.") happens to
  // land at the exact same y as an unrelated column's own first line,
  // purely because two side-by-side wrapped lists (this address column and
  // a neighbouring VEHICLES column) wrap to different line-counts per
  // entry and drift out of sync after their first row. Without this, the
  // first line is never even eligible to start a cell (the loop below
  // skips it via the hasRowMate check), so it can never claim its own
  // continuation before that continuation gets wrongly claimed by whatever
  // unrelated row-mate it happens to coincide with instead. Found against
  // a real training document (Operation COBALT V3) whose VEHICLES and
  // LOCATION OF INTEREST columns sit side by side, each independently
  // wrapping: "1KINGZ (WA) 2021 white BMW X5 4WD" (a complete vehicle
  // entry) ended up with "VALE WA 6155." (the stray second line of a
  // completely different address) appended to it, while that address's own
  // first line was left with no suburb at all.
  //
  // Computed as connected components over the exact same gap/x-bucket
  // adjacency test the main wrap-join loop below already applies (so this
  // can never claim eligibility for a pairing that loop wouldn't also
  // make), then flooded: every segment in a chain containing at least one
  // already-row-mated member becomes eligible too. This only changes WHERE
  // a cell's own wrap-join starts from — never how a join is decided once
  // it starts, which stays exactly the loop below's existing logic.
  const chainEligible = hasRowMate.slice();
  const allChains: { members: number[]; centerY: number }[] = [];
  {
    const byBucket = new Map<number, number[]>();
    segments.forEach((s, idx) => {
      if (s.width <= 0) return;
      const key = bucketKey(s.x0);
      const list = byBucket.get(key);
      if (list) list.push(idx);
      else byBucket.set(key, [idx]);
    });
    for (const idxs of Array.from(byBucket.values())) {
      idxs.sort((a: number, b: number) => segments[b].y - segments[a].y);
      const chains: number[][] = [];
      let current: number[] = [];
      for (const idx of idxs) {
        if (current.length > 0) {
          const prev = segments[current[current.length - 1]];
          const gap = prev.y - segments[idx].y;
          if (
            gap <= 0 ||
            gap > (prev.height || 10) * WRAP_CONTINUATION_MAX_GAP_RATIO
          ) {
            chains.push(current);
            current = [];
          }
        }
        current.push(idx);
      }
      if (current.length > 0) chains.push(current);
      for (const chain of chains) {
        if (chain.some(idx => hasRowMate[idx])) {
          for (const idx of chain) chainEligible[idx] = true;
        }
        allChains.push({
          members: chain,
          centerY:
            (segments[chain[0]].y + segments[chain[chain.length - 1]].y) / 2,
        });
      }
    }
  }

  const segConsumed = new Array(segments.length).fill(false);
  const cells: Cell[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (segConsumed[i]) continue;
    const s0 = segments[i];
    if (s0.width <= 0) continue;
    // Co-occurrence (hasRowMate, extended to chainEligible above) is the
    // main eligibility gate — see the function comment for why a width
    // check here, tried twice, silently dropped genuine table values
    // instead of just mis-joining them. A standalone "Word(s):" line is
    // ALSO always eligible regardless of row-mates: unlike a plain narrow
    // value, a bare label ending a whole line in a colon is unambiguous on
    // its own (see isStandaloneColonLabel), and without this a label whose
    // own value wraps across several lines with nothing else sharing its
    // exact y (a real training document, "Current Address:"/"Warehouse:"
    // each on their own line, their multi-line value immediately below at
    // the same x) is silently skipped entirely — losing the label AND
    // every word of its value, which then sits orphaned as bare paragraph
    // text with no home, while whichever OTHER cell coincidentally shares
    // a wrapped sub-line's y elsewhere on the page (a wholly unrelated
    // block — this page's own real bug, an "1RFK221 (WA) ... Lexus"
    // vehicle line and a "BEACH WA 6020." address fragment landing on
    // the exact same y purely by coincidence of shared line-height) gets
    // wrongly glued to it instead once buildPageUnits groups same-y cells
    // into a "row". Catching the label here first means its own full
    // value gets consumed as part of THIS cell before the outer loop
    // ever reaches that orphaned fragment as its own segment.
    const s0Text = columnText(s0.items);
    if (!chainEligible[i] && !isStandaloneColonLabel(s0Text)) continue;
    segConsumed[i] = true;
    const bucket = bucketKey(s0.x0);
    const items = [...s0.items];
    let lastY = s0.y;
    let lastWidth = s0.width;
    let lastHeight = s0.height;
    let lastSegmentText = s0Text;
    const firstIdx = s0.lineIdx;
    let lastIdx = s0.lineIdx;

    for (let j = i + 1; j < segments.length; j++) {
      if (segConsumed[j]) continue;
      const sj = segments[j];
      if (sj.width <= 0 || bucketKey(sj.x0) !== bucket) continue;
      const gap = lastY - sj.y;
      if (gap <= 0 || gap > lastHeight * WRAP_CONTINUATION_MAX_GAP_RATIO) break;
      const max = colMaxWidth.get(bucket) ?? lastWidth;
      // The width-based guess is a coin flip on a page where the same
      // x-bucket legitimately carries both narrow label cells and much
      // wider values (this column's own "colMaxWidth" then reflects the
      // wide ones, so a genuinely narrow forced mid-word break like
      // "PASSPO"/"RT" or "VEHICLE"/"S" never looks "packed" relative to
      // it) — never trusted on its own in either direction: overridden to
      // FALSE when the next segment itself starts with one of this
      // document family's own known field labels (a real leftover word
      // fragment from a mid-word break is never itself a whole recognised
      // label — see a real training document, BLUEGUM, where a name line
      // and the following "DOB ..." line happened to pack tightly purely
      // by coincidence, joining into "HASSANDOB" with no space), and
      // rescued to TRUE — but only when the width guess said "not
      // packed", never overriding a correct packed=true — when joining
      // without a space produces a real word from the app's own known
      // vocabulary (see KNOWN_VOCABULARY_WORDS) rather than guessing at
      // English generally, which risks forcing together two genuinely
      // separate words that just happen to look plausible joined.
      const widthPacked =
        !startsWithKnownLabel(sj.items) &&
        lastWidth <= NARROW_JOIN_MAX_WIDTH &&
        lastWidth >= max * PACKED_WIDTH_RATIO;
      const sjText = columnText(sj.items);
      const vocabPacked =
        !widthPacked &&
        KNOWN_VOCABULARY_WORDS.has((lastSegmentText + sjText).toUpperCase());
      const packed = widthPacked || vocabPacked;
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
      lastSegmentText = sjText;
      lastIdx = sj.lineIdx;
    }

    cells.push({
      x0: s0.x0,
      y: s0.y,
      centerY: (s0.y + lastY) / 2,
      items,
      firstIdx,
      lastIdx,
    });
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

/** How far vertically (in multiples of the candidate line's own height) a
 * label's value is allowed to sit above/below the label's own y and still
 * count as "this label's own vertically-centred value" — generous enough
 * to cover a 2-3 line value centred beside a single-line label, without
 * reaching far enough to grab an unrelated row several rows away. */
const LABEL_VALUE_VERTICAL_SEARCH_RATIO = 3;

/**
 * Recovers a label cell's own value when it's a vertically-CENTRED
 * multi-line block rather than top-aligned with the label — a different
 * shape of the same underlying layout issue clusterIntoCells' chainEligible
 * mechanism (above) fixes for a wrapped LIST column. There, the label
 * itself was the one missing a row-mate; here it's the opposite: the label
 * ("NAME") sits in a row with plenty of row-mates (ROLE/COB alongside it,
 * all sharing one y), so clusterIntoCells happily turns it into a cell —
 * but its VALUE ("Marcus Andrew" / "VELASCO") straddles the label's own y
 * with NEITHER line sharing it (found against a real training document,
 * Operation COBALT V3, whose NAME value centres precisely between its own
 * two lines rather than starting level with the label the way an earlier
 * version of the same document's layout did — see this file's own test
 * fixtures for both shapes). Since neither value line has a row-mate of
 * its own, clusterIntoCells never turns either into a cell at all, and
 * pairRowCells silently drops a label with no value cell next to it in
 * its row (there being nothing there to find) — losing the whole value.
 *
 * Only ever claims an unconsumed LINE (never a cell already homed
 * elsewhere) sitting in the x-gap between this label and whatever comes
 * next in its own row, within a plausible vertical reach of the row's own
 * y (see LABEL_VALUE_VERTICAL_SEARCH_RATIO) — deliberately conservative:
 * a row with only one cell (the label, nothing else) is left alone
 * entirely (isStandaloneColonLabel's job, not this), and a label whose
 * value gap has nothing unconsumed sitting in it at all is left as the
 * "value not found" case pairRowCells already handles safely.
 *
 * Mutates `consumed` for every line it claims, so buildPageUnits' final
 * pass doesn't ALSO emit them as their own stray paragraph lines, and
 * returns a new synthetic Cell (spliced into the row's own cells, sorted
 * by x0) for each label recovered this way.
 */
/**
 * Reclaims a MULTI-LINE cell (its own centerY != its own first-line y —
 * never a plain single-line cell, which already sits in its correct row)
 * from wherever buildPageUnits' own plain-y row-grouping happened to land
 * it, into an established row whose own y its CENTRE actually aligns
 * with, before either recovery pass below runs. A short, vertically-
 * centred multi-line cell (a 2-3 line value wrapped symmetrically around
 * a row's own y, see Cell's own centerY field comment) still passes
 * clusterIntoCells' chainEligible gate just fine whenever any ONE of its
 * own lines happens to coincide with some unrelated cell elsewhere on the
 * page — it forms a real Cell either way — but its FIRST line (what
 * buildPageUnits' own row-grouping actually compares) can land it in
 * completely the wrong row, paired with some unrelated cell that merely
 * happens to share ITS first line's y. Neither recoverCenteredLabelValues
 * nor recoverMissingLabelColumn can rescue it from there afterwards: both
 * only ever search STILL-UNCONSUMED raw lines, and this cell is already
 * fully formed and consumed, just homed wrong.
 *
 * Found against four real training documents (Operation NIGHTJAR/ORCHARD/
 * CROSSWIND/MIRAGE) whose IDs value and PASSPORT/PROMIS ID's own merged
 * label ended up sharing one wrong row together this way (each keyed off
 * the OTHER's first line, not either's own true row) — not a lonely
 * one-cell row apiece, which an earlier, narrower version of this
 * function only checked for.
 *
 * Deliberately narrower than comparing every cell's centre during
 * buildPageUnits' own row-grouping (tried and reverted): that fixed this
 * exact case but fragmented an unrelated, more tightly-packed real
 * training document (the ORIGINAL Operation COBALT fixture) into far too
 * many tiny rows, several of them losing their own label/value pairing
 * entirely. Restricting this pass to only cells that are genuinely
 * multi-line — leaving every single-line cell's own row-membership
 * exactly as plain-y grouping already decided it — is what keeps it from
 * reaching that same over-eager territory: an ordinary single-line
 * VEHICLES/LOCATION OF INTEREST list entry is never a candidate here at
 * all, however its neighbours land. Only ever moves a cell INTO a row
 * that already has two or more real cells of its own (a genuinely
 * established row), and only when the candidate sits to the right of
 * that row's own leftmost cell — matching the same conservative, row-
 * scoped spirit as the two recovery passes below rather than any
 * page-wide match.
 */
function reclaimOrphanCells(rows: { cells: Cell[]; firstIdx: number }[]): void {
  for (const targetRow of rows) {
    if (targetRow.cells.length < 2) continue;
    // A genuine grid row already has at least one recognised label sitting
    // immediately beside its own value (e.g. "DOB"/"14/03/1985") — the
    // hallmark of a real label/value row, as opposed to two DIFFERENT
    // labels (e.g. "VEHICLES"/"LOCATION OF INTEREST") coincidentally
    // sharing a y with nothing between them at all. Two side-by-side
    // wrapped LIST columns' own headings are exactly this second shape,
    // and are never a genuine target: a vehicle/address list ENTRY (not
    // the heading) is itself a short multi-line cell that can coincide
    // with such a heading pair purely by chance (found against the real
    // Operation COBALT V3 fixture, whose own VEHICLES/LOCATION OF
    // INTEREST headings share a y this way — reclaiming a vehicle entry
    // into that heading pair swallowed it out of the vehicles list
    // entirely). Checked once per row rather than folded into the
    // candidate loop below, since it depends only on the target row's own
    // shape, never on which candidate is being considered.
    const hasGenuineLabelValuePair = targetRow.cells.some((c, idx) => {
      const isLabel = LINE_LABELS.some(
        l => l.toUpperCase() === columnText(c.items).toUpperCase()
      );
      if (!isLabel) return false;
      const next = targetRow.cells[idx + 1];
      return (
        !!next &&
        !LINE_LABELS.some(
          l => l.toUpperCase() === columnText(next.items).toUpperCase()
        )
      );
    });
    if (!hasGenuineLabelValuePair) continue;
    const rowY = targetRow.cells[0].y;
    for (const sourceRow of rows) {
      if (sourceRow === targetRow) continue;
      for (let i = sourceRow.cells.length - 1; i >= 0; i--) {
        const cell = sourceRow.cells[i];
        if (cell.centerY === cell.y) continue;
        if (Math.abs(cell.centerY - rowY) > ROW_Y_TOLERANCE) continue;
        if (cell.x0 < targetRow.cells[0].x0) continue;
        targetRow.cells.push(cell);
        sourceRow.cells.splice(i, 1);
      }
    }
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].cells.length === 0) rows.splice(i, 1);
  }
  for (const row of rows) row.cells.sort((a, b) => a.x0 - b.x0);
}

function recoverCenteredLabelValues(
  rows: { cells: Cell[]; firstIdx: number }[],
  lines: Line[],
  consumed: boolean[]
): void {
  for (const row of rows) {
    if (row.cells.length < 2) continue;
    for (let k = 0; k < row.cells.length; k++) {
      const cell = row.cells[k];
      const text = columnText(cell.items);
      if (!LINE_LABELS.some(l => l.toUpperCase() === text.toUpperCase()))
        continue;
      const nextCell = row.cells[k + 1];
      const nextIsLabel =
        nextCell &&
        LINE_LABELS.some(
          l => l.toUpperCase() === columnText(nextCell.items).toUpperCase()
        );
      // A real value cell already sits right after this label — nothing
      // to recover. A next cell that's ITSELF a label means this label's
      // own slot is empty, same as having no next cell at all.
      if (nextCell && !nextIsLabel) continue;

      const cellX1 = cell.items.reduce(
        (max, it) => Math.max(max, it.x + it.width),
        cell.x0
      );
      const gapEnd = nextCell ? nextCell.x0 : Infinity;

      const candidates = lines
        .map((line, idx) => ({ line, idx }))
        .filter(({ line, idx }) => {
          if (consumed[idx] || line.items.length === 0) return false;
          const x0 = line.items[0].x;
          if (x0 < cellX1 || x0 >= gapEnd) return false;
          const height = line.items[0].height || 10;
          return (
            Math.abs(line.y - cell.y) <=
            height * LABEL_VALUE_VERTICAL_SEARCH_RATIO
          );
        });
      if (candidates.length === 0) continue;

      // Group every candidate into its own x-bucket wrap-chain FIRST (the
      // same wrap-continuation gap test clusterIntoCells' own wrap-join
      // uses), then pick whichever CHAIN's own centre sits closest to the
      // label's own y — not whichever single LINE does. A gap can hold
      // more than one genuinely different column's worth of leftover
      // content (e.g. a still-missing value for THIS label sitting beside
      // an entirely different label's own still-missing value further
      // along the same row), and a single stray line from the WRONG
      // column can coincidentally sit closer to this label's own y than
      // this label's own true (multi-line, vertically-centred) value
      // does — its own first line necessarily lands a little off-centre,
      // while an unrelated single-line value can happen to land exactly
      // on it. Comparing whole chains by their own centre, rather than
      // any one line by itself, is what a real training document
      // (Operation NIGHTJAR/ORCHARD/CROSSWIND/MIRAGE) needs: IDs' own
      // 2-line value used to lose out to PROMIS ID's own single-line
      // value sitting a hair closer to the row's own y purely by
      // coincidence, wrongly attributing PROMIS ID's own figure to IDs
      // and leaving PROMIS ID itself without a value to be found at all.
      const byBucket = new Map<number, typeof candidates>();
      for (const c of candidates) {
        const key = bucketKey(c.line.items[0].x);
        const list = byBucket.get(key);
        if (list) list.push(c);
        else byBucket.set(key, [c]);
      }
      const bucketChains = Array.from(byBucket.values()).map(list => {
        const sorted = list.slice().sort((a, b) => b.line.y - a.line.y);
        const chains: (typeof candidates)[] = [];
        let current: typeof candidates = [];
        for (const c of sorted) {
          if (current.length > 0) {
            const prev = current[current.length - 1];
            const prevHeight = prev.line.items[0].height || 10;
            const gap = prev.line.y - c.line.y;
            if (
              gap <= 0 ||
              gap > prevHeight * WRAP_CONTINUATION_MAX_GAP_RATIO
            ) {
              chains.push(current);
              current = [];
            }
          }
          current.push(c);
        }
        if (current.length > 0) chains.push(current);
        return chains;
      });
      const allChains = bucketChains.flat();
      allChains.sort((a, b) => {
        const centerA = (a[0].line.y + a[a.length - 1].line.y) / 2;
        const centerB = (b[0].line.y + b[b.length - 1].line.y) / 2;
        return Math.abs(centerA - cell.y) - Math.abs(centerB - cell.y);
      });
      const chain = allChains[0];
      const seed = chain[0];

      const items: PositionedItem[] = [];
      chain.forEach((c, i) => {
        if (i > 0) {
          items.push({
            str: " ",
            x: c.line.items[0].x,
            y: c.line.y,
            width: 0,
            height: 0,
            hasEOL: false,
          });
        }
        items.push(...c.line.items);
        consumed[c.idx] = true;
      });

      const valueCell: Cell = {
        x0: chain[0].line.items[0].x,
        y: seed.line.y,
        centerY: (chain[0].line.y + chain[chain.length - 1].line.y) / 2,
        items,
        firstIdx: Math.min(...chain.map(c => c.idx)),
        lastIdx: Math.max(...chain.map(c => c.idx)),
      };
      row.cells.splice(k + 1, 0, valueCell);
    }
  }
}

/**
 * Recovers an entire MISSING label+value column in a row's own trailing
 * gap — a further variant of the same vertically-centred layout issue
 * recoverCenteredLabelValues (above) fixes for a value alone, but here the
 * LABEL itself never became a cell at all: its own hard-wrap (e.g.
 * "PASSPORT" as "PASSPOR"/"T", "PROMIS ID" as "PROMIS"/"ID") sits
 * vertically centred on the row's own y with NEITHER of its own lines
 * landing on it, so clusterIntoCells' hasRowMate/chainEligible mechanism —
 * which needs at least one line of a cell to share a row-mate — never
 * turns it into a cell to begin with. recoverCenteredLabelValues can't
 * help either: it only searches for a value once given an already-formed
 * label cell, and there is none here for it to start from.
 *
 * Found against four real training documents (Operation NIGHTJAR/ORCHARD/
 * CROSSWIND/MIRAGE) whose PASSPORT/PROMIS ID grid column worked by sheer
 * coincidence on two of the four (one of the label's own hard-wrapped
 * lines happened to land within ROW_Y_TOLERANCE of an unrelated cell
 * elsewhere on the page) and silently failed on the other two — the
 * label's own two fragments were left as bare orphaned paragraph text,
 * and its value ended up glued onto the row's own last real cell instead
 * (pairRowCells has no way to know an unrecognised trailing cell isn't
 * just a continuation of the one before it).
 *
 * Deliberately scoped to only the row's own trailing gap (from its last
 * known cell's x1 out to the page's right edge) and only the row's own
 * vertical reach (LABEL_VALUE_VERTICAL_SEARCH_RATIO around its own y) —
 * the same two safety properties recoverCenteredLabelValues already
 * relies on — rather than any page-wide coincidental-centre match, which
 * is exactly the shape of match clusterIntoCells' own chainEligible flood
 * has to avoid making across two independently-wrapping LIST columns (the
 * COBALT V3 bug). An earlier attempt at this fix granted chainEligible to
 * any two same-length short wrap-chains whose centres coincided ANYWHERE
 * on the page; it fixed this row but wrongly merged unrelated VEHICLES/
 * LOCATION OF INTEREST list entries the same way COBALT V3 did, so it was
 * reverted in favour of this row-scoped, gap-scoped version instead. Only
 * ever proceeds once the candidate label text is confirmed against the
 * app's own known label vocabulary (LINE_LABELS) — never guesses at an
 * unrecognised word — which is what keeps this from firing on an ordinary
 * narrative row that happens to have short wrapped fragments nearby.
 */
function recoverMissingLabelColumn(
  rows: { cells: Cell[]; firstIdx: number }[],
  lines: Line[],
  consumed: boolean[]
): void {
  for (const row of rows) {
    if (row.cells.length < 2) continue;

    // This row's own LAST recognised label — not necessarily its last
    // cell outright. buildPageUnits' own centerY-based row grouping can
    // already have pulled the missing label's VALUE into this row on its
    // own (its middle line coincidentally sharing a row-mate elsewhere —
    // the very reason the label/value pair worked by accident on two of
    // the four real documents this was found against), even though the
    // label itself never formed a cell — leaving that value sitting as an
    // unrecognised trailing cell nobody claims. When that's happened, the
    // search below only needs to find the missing LABEL in the gap before
    // it, not search for a value that's already present.
    let lastLabelIdx = -1;
    for (let k = 0; k < row.cells.length; k++) {
      const text = columnText(row.cells[k].items);
      if (LINE_LABELS.some(l => l.toUpperCase() === text.toUpperCase())) {
        lastLabelIdx = k;
      }
    }
    if (lastLabelIdx === -1) continue;
    const lastLabelCell = row.cells[lastLabelIdx];

    // The label's OWN value is presumed to be exactly the single cell
    // right after it (every other label/value pairing in this file makes
    // the same one-cell assumption — see recoverCenteredLabelValues'
    // `nextCell`). Anything past THAT is the true leftover/orphan zone
    // this function's own search should start from — not the label's own
    // x1, which would otherwise re-scan straight through that already-
    // legitimate value cell as if it were unclaimed.
    const ownValueCell = row.cells[lastLabelIdx + 1];
    const searchStartCell = ownValueCell ?? lastLabelCell;
    const searchStartX1 = searchStartCell.items.reduce(
      (max, it) => Math.max(max, it.x + it.width),
      searchStartCell.x0
    );

    const orphanIdx = ownValueCell ? lastLabelIdx + 2 : lastLabelIdx + 1;
    const afterCell = row.cells[orphanIdx];
    const afterIsLabel =
      afterCell &&
      LINE_LABELS.some(
        l => l.toUpperCase() === columnText(afterCell.items).toUpperCase()
      );
    const orphanValueCell = afterCell && !afterIsLabel ? afterCell : null;

    const searchEndX = orphanValueCell ? orphanValueCell.x0 : Infinity;
    const rowY = lastLabelCell.centerY;

    type Candidate = { line: Line; idx: number };
    const candidates: Candidate[] = lines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line, idx }) => {
        if (consumed[idx] || line.items.length === 0) return false;
        const x0 = line.items[0].x;
        if (x0 < searchStartX1 || x0 >= searchEndX) return false;
        const height = line.items[0].height || 10;
        return (
          Math.abs(line.y - rowY) <= height * LABEL_VALUE_VERTICAL_SEARCH_RATIO
        );
      });
    if (candidates.length === 0) continue;

    const byBucket = new Map<number, Candidate[]>();
    for (const c of candidates) {
      const key = bucketKey(c.line.items[0].x);
      const list = byBucket.get(key);
      if (list) list.push(c);
      else byBucket.set(key, [c]);
    }
    const chains: Candidate[][] = [];
    for (const list of Array.from(byBucket.values())) {
      list.sort((a, b) => b.line.y - a.line.y);
      let current: Candidate[] = [];
      for (const c of list) {
        if (current.length > 0) {
          const prev = current[current.length - 1];
          const prevHeight = prev.line.items[0].height || 10;
          const gap = prev.line.y - c.line.y;
          if (gap <= 0 || gap > prevHeight * WRAP_CONTINUATION_MAX_GAP_RATIO) {
            chains.push(current);
            current = [];
          }
        }
        current.push(c);
      }
      if (current.length > 0) chains.push(current);
    }
    chains.sort((a, b) => a[0].line.items[0].x - b[0].line.items[0].x);
    if (chains.length === 0) continue;

    const labelChain = chains[0];
    const labelFragments = labelChain.map(c => columnText(c.line.items));
    const matchedLabel = LINE_LABELS.find(
      l =>
        l.toUpperCase() === labelFragments.join("").toUpperCase() ||
        l.toUpperCase() === labelFragments.join(" ").toUpperCase()
    );
    if (!matchedLabel) continue;

    const buildCell = (chain: Candidate[]): Cell => {
      const items: PositionedItem[] = [];
      chain.forEach((c, i) => {
        if (i > 0) {
          items.push({
            str: " ",
            x: c.line.items[0].x,
            y: c.line.y,
            width: 0,
            height: 0,
            hasEOL: false,
          });
        }
        items.push(...c.line.items);
        consumed[c.idx] = true;
      });
      return {
        x0: chain[0].line.items[0].x,
        y: chain[0].line.y,
        centerY: (chain[0].line.y + chain[chain.length - 1].line.y) / 2,
        items,
        firstIdx: Math.min(...chain.map(c => c.idx)),
        lastIdx: Math.max(...chain.map(c => c.idx)),
      };
    };

    const labelCell = buildCell(labelChain);
    // Replace the raw joined fragments with the label's own canonical
    // text: labelFragments.join("")/join(" ") above only decided WHETHER
    // this is a real known label, not which of the two joins is right for
    // display — "PASSPOR"+"T" needs no space, "PROMIS"+"ID" needs one, and
    // there is no reliable geometric signal to tell them apart the way
    // clusterIntoCells' own packed-width heuristic does for ordinary
    // values (see its own comment) — the label vocabulary match already
    // resolves that ambiguity outright, so use it directly.
    labelCell.items = [
      {
        str: matchedLabel,
        x: labelCell.x0,
        y: labelCell.y,
        width: 0,
        height: 0,
        hasEOL: false,
      },
    ];
    row.cells.push(labelCell);

    // Only search for a fresh value chain when there wasn't already an
    // orphan value cell sitting in the row for this label to claim —
    // searching again here would just rediscover (and duplicate) it,
    // since the candidate search above is bounded to end at its own x0.
    if (!orphanValueCell) {
      const valueChain = chains[1];
      if (valueChain) {
        row.cells.push(buildCell(valueChain));
      }
    }
    row.cells.sort((a, b) => a.x0 - b.x0);
  }
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

  // reclaimOrphanCells first: a value cell whose own wrap lands it in its
  // OWN single-cell row (nothing else shares its first line's exact y)
  // needs to already be sitting in the right row before either recovery
  // pass below gets a chance to search for it — neither one looks at
  // already-FORMED cells, only still-unconsumed raw lines, so a value
  // that's already a cell (just in the wrong row) is invisible to both.
  reclaimOrphanCells(rows);
  // recoverCenteredLabelValues first: it only ever touches a value for a
  // label that's ALREADY a cell (e.g. IDs' own value, itself vertically
  // centred), picking the single candidate closest to that label's own y
  // and following just its own x-bucket's wrap chain — so it can't be
  // confused by a genuinely different label's own gap sitting further
  // along the same row. recoverMissingLabelColumn's search is coarser (it
  // doesn't yet know which label a candidate belongs to until it tries to
  // match one), so running it first — before IDs has its own value —
  // finds IDs' OWN still-missing value sitting closest to the row and
  // wrongly reads it as PROMIS ID's missing label.
  recoverCenteredLabelValues(rows, lines, consumed);
  recoverMissingLabelColumn(rows, lines, consumed);

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
  return resplitEmbeddedLabels(columns);
}

/** Catches a recognised single-word label (see SINGLE_WORD_LABELS) that
 * ended up merged into an earlier column's own text — the gap in front of
 * it was real but too narrow for splitLineIntoColumns' own pixel-width
 * threshold to treat as a column break. Content, not geometry, is the
 * stronger signal here: "...KADER" immediately followed by the exact word
 * "ROLE" is never genuinely part of the same value, regardless of how
 * tight the gap between them was set. Only ever splits BEFORE an embedded
 * label that isn't already a column's own first item, so a column that's
 * already correctly just the label on its own is left untouched. */
function resplitEmbeddedLabels(
  columns: PositionedItem[][]
): PositionedItem[][] {
  const result: PositionedItem[][] = [];
  for (const col of columns) {
    let start = 0;
    for (let k = 1; k < col.length; k++) {
      const text = col[k].str.trim().toUpperCase();
      if (!text || !SINGLE_WORD_LABELS.has(text)) continue;
      let end = k;
      while (end > start && col[end - 1].str.trim() === "") end--;
      if (end > start) result.push(col.slice(start, end));
      start = k;
    }
    if (start < col.length) result.push(col.slice(start));
  }
  return result;
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
// Below this, in either dimension, an embedded image is treated as
// decorative (a letterhead logo, a signature scrawl, a divider rule) rather
// than a genuine subject photo worth running through face recognition —
// same threshold and reasoning as MIN_IMAGE_DIMENSION in
// docxTableReader.ts.
const MIN_IMAGE_DIMENSION = 120;

// Minimal duck-typed surface of PDFPageProxy actually used below, following
// the same pattern as RawTextItem above — pdfjs-dist's public type
// entrypoint doesn't cleanly re-export PDFPageProxy from this module path.
interface PageImageSource {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get(objId: string, callback: (data: unknown) => void): unknown };
}

interface RawPdfImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

function isRawPdfImage(v: unknown): v is RawPdfImage {
  const r = v as RawPdfImage | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.width === "number" &&
    typeof r.height === "number" &&
    // pdf.js's Node (non-canvas) fallback path decodes an RGB_24BPP/
    // RGBA_32BPP image into a Uint8ClampedArray, not a plain Uint8Array —
    // this interface's own field type already said so (see RawPdfImage
    // above), but this guard only ever checked the plain-Uint8Array case,
    // so every real photo silently failed the check and got skipped as if
    // it weren't an image at all. Real regression: found against two
    // actual training PDFs (each with one genuine embedded photo) that
    // both decoded this way, extracting zero images from either.
    (r.data instanceof Uint8Array || r.data instanceof Uint8ClampedArray)
  );
}

/** Pulls every embedded photo out of one PDF page's own content stream. A
 * PDF has no separate "media" folder like a .docx (see the module comment)
 * — an image is one of the drawing operators making up the page itself, so
 * this walks the compiled operator list pdf.js already builds for text
 * extraction, looking for paintImageXObject/paintImageXObjectRepeat calls,
 * then resolves each one's decoded pixel data via page.objs (pdf.js decodes
 * the image's own encoding — JPEG/FlateDecode/etc — into this raw form
 * itself; nothing here re-implements image decoding). Running in Node (no
 * OffscreenCanvas global) keeps pdf.js on its plain-object fallback path —
 * {width, height, kind, data} — rather than the browser-only ImageBitmap
 * path, so this never depends on a canvas library. Best-effort: one bad
 * image, or a page whose operator list can't be walked, is skipped rather
 * than failing the whole read. */
async function extractPdfPageImages(
  page: PageImageSource
): Promise<ExtractedDocumentImage[]> {
  const images: ExtractedDocumentImage[] = [];
  try {
    const opList = await page.getOperatorList();
    const seen = new Set<string>();
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintImageXObjectRepeat)
        continue;
      const objId = opList.argsArray[i]?.[0];
      if (typeof objId !== "string" || seen.has(objId)) continue;
      seen.add(objId);
      try {
        const raw = await new Promise<unknown>(resolve =>
          page.objs.get(objId, resolve)
        );
        if (!isRawPdfImage(raw)) continue;
        if (raw.width < MIN_IMAGE_DIMENSION || raw.height < MIN_IMAGE_DIMENSION)
          continue;
        const channels =
          raw.kind === ImageKind.RGBA_32BPP
            ? 4
            : raw.kind === ImageKind.RGB_24BPP
              ? 3
              : null;
        // GRAYSCALE_1BPP (bit-packed) or unrecognised — skip rather than
        // risk mis-decoding raw bytes with the wrong channel count.
        if (channels === null) continue;
        const png = await sharp(Buffer.from(raw.data), {
          raw: { width: raw.width, height: raw.height, channels },
        })
          .png()
          .toBuffer();
        images.push({
          dataBase64: png.toString("base64"),
          mimeType: "image/png",
          width: raw.width,
          height: raw.height,
        });
      } catch {
        // One undecodable image shouldn't drop the rest of the page.
      }
    }
  } catch {
    // Operator list couldn't be built for this page — no images from it.
  }
  return images;
}

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
    const images: ExtractedDocumentImage[] = [];
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
      images.push(...(await extractPdfPageImages(page)));
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
        // first; a row with no recognised label falls back to being read
        // as one flowing text line — but joined cell by cell (each cell's
        // own columnText), never by flattening every cell's raw items
        // into one array first. pdf.js glyphs carry no space between two
        // adjacent CELLS' text (there was never a real character in that
        // horizontal gap, just column spacing) — readLine's own
        // columnText concatenates raw item strings with nothing inserted,
        // so flattening across a cell boundary glues one cell's trailing
        // word straight onto the next cell's first word. Concretely: a
        // VEHICLES cell's own value sharing a row with an unrelated
        // "Current Address:" cell (a genuine 2-column LOCATION OF
        // INTEREST layout, see the module's own regression test) becomes
        // "...wagon.Current Address:..." with no space or break of any
        // kind — which then can't be told apart from one continuous
        // sentence by anything downstream (findVehicleLines' own
        // sentence-boundary cut relies on a real space following the
        // vehicle's closing "."), so the unrelated address text gets
        // silently absorbed into the vehicle's own model field. Joining
        // per-cell text with an explicit space avoids the glue entirely.
        let text: string;
        let rows: string[][] | null;
        let y: number;
        if (unit.kind === "row") {
          // A row whose every cell is itself a bare recognised label (no
          // value cell alongside any of them in THIS row) is two or more
          // section headings that happen to share a y purely because
          // they're each vertically centred beside their own tall,
          // multi-line value elsewhere on the page (e.g. "VEHICLES" and
          // "LOCATION OF INTEREST" sitting side by side, their actual
          // values several lines below) — not one combined heading.
          // Emitting each as its own heading paragraph, rather than
          // falling through to the flattened "VEHICLES LOCATION OF
          // INTEREST" single-line join below, matters beyond cosmetics:
          // findParagraphSection's own heading regexes are substring
          // matches (VEHICLES_HEADING_RE, LOCATION_HEADING_RE), so a
          // combined heading like that satisfies BOTH — pulling the exact
          // same following paragraphs in as both this target's VEHICLES
          // value and its LOCATION OF INTEREST value, corrupting the
          // latter with vehicle text parseAddressBlock can't read (and
          // reports as a confusing duplicate needsReview entry).
          const cellTexts = unit.cells.map(c => columnText(c.items));
          if (
            cellTexts.length > 1 &&
            cellTexts.every(t =>
              LINE_LABELS.some(l => l.toUpperCase() === t.toUpperCase())
            )
          ) {
            flushParagraph();
            for (const t of cellTexts) paragraphs.push(canonicalLabel(t));
            prevLineY = null;
            continue;
          }
          text = unit.cells
            .map(c => columnText(c.items))
            .filter(Boolean)
            .join(" ");
          rows = pairRowCells(unit.cells);
          if (!rows) {
            const colonMatch = text.match(COLON_LABEL_RE);
            if (colonMatch) {
              rows = [[canonicalLabel(colonMatch[1]), colonMatch[2].trim()]];
            }
          }
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
      // No real text layer — this is a scanned/photographed PDF (already
      // unsupported, see the module comment), where any "image" the walk
      // above found is the whole page scan itself, not a discrete subject
      // photo, so images are deliberately discarded here too.
      return { tables: [], paragraphs: [], images: [] };
    }
    return {
      tables: tableRows.length > 0 ? [{ rows: tableRows }] : [],
      paragraphs,
      images,
    };
  } catch {
    return { tables: [], paragraphs: [], images: [] };
  }
}
