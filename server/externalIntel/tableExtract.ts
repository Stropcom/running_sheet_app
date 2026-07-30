import sharp from "sharp";
import {
  detectHorizontalLines,
  detectVerticalLines,
  cropCell,
  type CellRegion,
} from "./gridExtract";
import { ocrLine } from "./ocrWorker";

function variance(nums: number[]): number {
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
}

/**
 * Border-line detection can pick up extra lines beyond the 6-column
 * label/value grid (e.g. a leading photo/headshot thumbnail column) — how
 * many, and on which side, isn't fixed, so this can't just trim a hardcoded
 * count off one end. Instead, try every contiguous 7-line window and pick
 * the one whose 6 resulting gaps best match the expected pattern: the three
 * label gaps (0,2,4) similar to each other, the three value gaps (1,3,5)
 * similar to each other — a real column grid is consistent that way, noise
 * from a stray extra line isn't.
 */
function pickTableColumnLines(lines: number[]): number[] | null {
  if (lines.length < 7) return null;
  if (lines.length === 7) return lines;

  let best: { window: number[]; score: number } | null = null;
  for (let start = 0; start + 7 <= lines.length; start++) {
    const window = lines.slice(start, start + 7);
    const gaps = window.slice(1).map((x, i) => x - window[i]);
    const labelGaps = [gaps[0], gaps[2], gaps[4]];
    const valueGaps = [gaps[1], gaps[3], gaps[5]];
    const score = variance(labelGaps) + variance(valueGaps);
    if (!best || score < best.score) best = { window, score };
  }
  return best?.window ?? null;
}

// Extracts the "afp_target_profile" template's fixed demographic table
// (NAME/DOB/ALIASES/ROLE/OCG/IDs/COB/PASSPORT/PROMIS ID) — a 3-row, 3
// label-value-pair-per-row grid that always sits near the top of the page,
// right below the document's title bar.
//
// Field labels are NOT OCR'd — the template's field order is fixed and
// known, so once the grid geometry is found, only the value cells (which
// carry the actual information) are OCR'd. This matters: testing showed the
// value cells OCR reliably in isolation (90%+ confidence), while OCRing the
// whole table as one block does not — Tesseract's layout analysis struggles
// with this densely bordered/shaded grid shape.

export const TABLE_ROW_KEYS = [
  ["name", "role", "cob"],
  ["dob", "ocg", "passport"],
  ["aliases", "ids", "promisId"],
] as const;

export type ExtractedTableFields = Partial<
  Record<
    | "name"
    | "dob"
    | "aliases"
    | "role"
    | "cob"
    | "passport"
    | "ocg"
    | "ids"
    | "promisId",
    string
  >
>;

export interface TableExtractResult {
  fields: ExtractedTableFields;
  /** false if grid geometry could not be reliably located — fields will be empty and the document needs manual entry for this table. */
  gridDetected: boolean;
  fieldConfidence: Partial<Record<string, number>>;
}

// The table is expected in the top portion of the page, directly under the
// title bar — restricting the search window avoids picking up ruled lines
// from other sections (Vehicles table, Summary, etc.) further down the page.
const TABLE_SEARCH_HEIGHT_FRACTION = 0.2;

// See MIN_CELL_CONFIDENCE usage below — calibrated against real-photo
// testing where genuinely empty cells scored ~7-19 and real (if imperfect)
// values scored ~46+. Worth revisiting once more real sample documents are
// available rather than just this one.
const MIN_CELL_CONFIDENCE = 30;

export async function extractDemographicTable(
  image: Buffer
): Promise<TableExtractResult> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    return { fields: {}, gridDetected: false, fieldConfidence: {} };
  }

  const searchBottom = Math.round(height * TABLE_SEARCH_HEIGHT_FRACTION);
  const hLines = await detectHorizontalLines(image, 0, searchBottom);

  // Expect exactly 4 lines bounding 3 rows. If detection found something
  // else, don't guess — report as undetected so the officer enters the
  // table manually rather than silently saving wrong values.
  if (hLines.length !== 4) {
    return { fields: {}, gridDetected: false, fieldConfidence: {} };
  }
  const [row0Top, row1Top, row2Top, row3Bottom] = hLines;
  const rowBands: Array<[number, number]> = [
    [row0Top, row1Top],
    [row1Top, row2Top],
    [row2Top, row3Bottom],
  ];

  const rawVLines = await detectVerticalLines(image, rowBands);
  const vLines = pickTableColumnLines(rawVLines);
  if (!vLines) {
    return { fields: {}, gridDetected: false, fieldConfidence: {} };
  }

  const fields: ExtractedTableFields = {};
  const fieldConfidence: Partial<Record<string, number>> = {};

  for (let row = 0; row < 3; row++) {
    const [top, bottom] = rowBands[row];
    const keys = TABLE_ROW_KEYS[row];
    for (let pair = 0; pair < 3; pair++) {
      const key = keys[pair];
      // Each label/value pair spans vLines[pair*2] (label start) to
      // vLines[pair*2 + 2] (next pair start); the value cell is the right
      // half, vLines[pair*2 + 1] to vLines[pair*2 + 2].
      // Inset a few px from the detected border lines — cropping exactly on
      // the border includes its dark pixels in the cell image, which
      // measurably hurt single-line OCR in testing (a solid dark edge right
      // at the crop boundary reads as noise, not just an empty margin).
      const inset = 6;
      const valueLeft = vLines[pair * 2 + 1] + inset;
      const valueRight = vLines[pair * 2 + 2] - inset;
      const region: CellRegion = {
        left: valueLeft,
        top: top + inset,
        width: Math.max(1, valueRight - valueLeft),
        height: Math.max(1, bottom - inset - (top + inset)),
      };
      const cellImage = await cropCell(image, region);
      const { text, confidence } = await ocrLine(cellImage);
      // An empty cell isn't blank pixels — cell shading/border artifacts
      // inside the crop still give Tesseract something to guess at, just
      // with much lower confidence than a real, if imperfect, read (~10-20
      // vs ~45+ in testing). Below this floor, treat it as empty rather
      // than reporting fabricated cell content.
      if (text && confidence >= MIN_CELL_CONFIDENCE) {
        fields[key] = text;
        fieldConfidence[key] = confidence;
      }
    }
  }

  return { fields, gridDetected: true, fieldConfidence };
}
