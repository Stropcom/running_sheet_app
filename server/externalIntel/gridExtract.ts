import sharp from "sharp";

// Deterministic table-grid detection via pixel-projection analysis (a
// classical, non-AI computer-vision technique — no model, no network call).
// A printed table's ruled border lines are near-continuously dark across an
// entire row/column; body text is not (it's dark only in short, localized
// bursts). That contrast is what separates real border lines from noise.

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

async function toRawGreyscale(image: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const DARK_THRESHOLD = 140;
const ROW_LINE_FRACTION = 0.5;
const COL_LINE_FRACTION = 0.85;
const LINE_MERGE_GAP = 5;
// A real ruled border is 1-3px thick. A solid dark block much thicker than
// that (a title banner, a shaded header bar) isn't a border line — but its
// trailing edge (where dark content ends and the table interior begins) is
// still a meaningful boundary, so use that edge rather than the block's
// center, which can land well outside the actual table.
const THICK_BLOCK_THRESHOLD = 10;

function mergeAdjacent(positions: number[], maxGap: number): number[] {
  const groups: number[][] = [];
  for (const p of positions) {
    const last = groups[groups.length - 1];
    if (last && p - last[last.length - 1] <= maxGap) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }
  return groups.map(g =>
    g.length > THICK_BLOCK_THRESHOLD
      ? g[g.length - 1]
      : Math.round(g.reduce((a, b) => a + b, 0) / g.length)
  );
}

/**
 * Finds horizontal ruled-line y-positions within [yTop, yBottom) of the
 * whole image width. Used to locate a table's row boundaries.
 */
export async function detectHorizontalLines(
  image: Buffer,
  yTop: number,
  yBottom: number
): Promise<number[]> {
  const { data, width } = await toRawGreyscale(image);
  const candidates: number[] = [];
  for (let y = yTop; y < yBottom; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < DARK_THRESHOLD) dark++;
    }
    if (dark / width > ROW_LINE_FRACTION) candidates.push(y);
  }
  return mergeAdjacent(candidates, LINE_MERGE_GAP);
}

/**
 * Finds vertical ruled-line x-positions that hold across every one of the
 * given row bands (a real column border spans the full table height; a
 * false positive from text in one row won't line up in the others).
 */
export async function detectVerticalLines(
  image: Buffer,
  rowBands: Array<[number, number]>
): Promise<number[]> {
  const { data, width } = await toRawGreyscale(image);

  const perRowCandidates = rowBands.map(([yTop, yBottom]) => {
    const h = yBottom - yTop;
    const set = new Set<number>();
    for (let x = 0; x < width; x++) {
      let dark = 0;
      for (let y = yTop; y < yBottom; y++) {
        if (data[y * width + x] < DARK_THRESHOLD) dark++;
      }
      if (dark / h > COL_LINE_FRACTION) set.add(x);
    }
    return set;
  });

  const confirmed: number[] = [];
  for (let x = 0; x < width; x++) {
    const inAllRows = perRowCandidates.every(
      s => s.has(x) || s.has(x - 1) || s.has(x + 1)
    );
    if (inAllRows) confirmed.push(x);
  }
  return mergeAdjacent(confirmed, LINE_MERGE_GAP);
}

export interface CellRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Crops a single cell region out of the source image as its own PNG buffer. */
export async function cropCell(
  image: Buffer,
  region: CellRegion
): Promise<Buffer> {
  return sharp(image).extract(region).toBuffer();
}
