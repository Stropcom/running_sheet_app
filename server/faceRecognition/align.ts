import sharp from "sharp";

// Warps a detected face to the canonical 112x112 pose ArcFace-family models
// expect, using a least-squares similarity transform (rotation + uniform
// scale + translation, no reflection) fit from the 5 RetinaFace landmarks to
// the standard InsightFace/ArcFace reference template — the same alignment
// convention the bundled MobileFaceNet embedding model was trained against.

const ALIGN_SIZE = 112;

// Standard 112x112 ArcFace alignment template (left eye, right eye, nose,
// left mouth corner, right mouth corner).
const REFERENCE_LANDMARKS: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

interface SimilarityTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

// Closed-form least-squares similarity transform via complex-number
// Procrustes: representing each point as x+iy, the optimal complex scalar
// z = s*(cos theta + i sin theta) minimizing sum|dst - z*src - t|^2 is
// z = sum(dstDemean * conj(srcDemean)) / sum(|srcDemean|^2).
function computeSimilarityTransform(
  src: [number, number][],
  dst: [number, number][]
): SimilarityTransform {
  const n = src.length;
  let srcMeanX = 0,
    srcMeanY = 0,
    dstMeanX = 0,
    dstMeanY = 0;
  for (let i = 0; i < n; i++) {
    srcMeanX += src[i][0];
    srcMeanY += src[i][1];
    dstMeanX += dst[i][0];
    dstMeanY += dst[i][1];
  }
  srcMeanX /= n;
  srcMeanY /= n;
  dstMeanX /= n;
  dstMeanY /= n;

  let numRe = 0,
    numIm = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - srcMeanX,
      sy = src[i][1] - srcMeanY;
    const dx = dst[i][0] - dstMeanX,
      dy = dst[i][1] - dstMeanY;
    numRe += dx * sx + dy * sy;
    numIm += dy * sx - dx * sy;
    den += sx * sx + sy * sy;
  }
  const zRe = den > 0 ? numRe / den : 1;
  const zIm = den > 0 ? numIm / den : 0;
  const tx = dstMeanX - (zRe * srcMeanX - zIm * srcMeanY);
  const ty = dstMeanY - (zIm * srcMeanX + zRe * srcMeanY);
  return { a: zRe, b: -zIm, c: zIm, d: zRe, tx, ty };
}

function invert(t: SimilarityTransform): SimilarityTransform {
  const det = t.a * t.d - t.b * t.c;
  const ia = t.d / det,
    ib = -t.b / det,
    ic = -t.c / det,
    id = t.a / det;
  return {
    a: ia,
    b: ib,
    c: ic,
    d: id,
    tx: -(ia * t.tx + ib * t.ty),
    ty: -(ic * t.tx + id * t.ty),
  };
}

function bilinearSample(
  raw: Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number
): [number, number, number] {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return [0, 0, 0];
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1),
    y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0,
    fy = y - y0;
  const at = (px: number, py: number, ch: number) =>
    raw[(py * width + px) * channels + ch];
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const top = at(x0, y0, ch) * (1 - fx) + at(x1, y0, ch) * fx;
    const bottom = at(x0, y1, ch) * (1 - fx) + at(x1, y1, ch) * fx;
    out[ch] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

/** Returns a 112x112 RGB uint8 buffer (raw, HWC) aligned to the canonical pose. */
export async function alignFace(
  imageBuffer: Buffer,
  landmarks: [number, number][]
): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const forward = computeSimilarityTransform(landmarks, REFERENCE_LANDMARKS);
  const inverse = invert(forward);

  const out = Buffer.alloc(ALIGN_SIZE * ALIGN_SIZE * 3);
  for (let oy = 0; oy < ALIGN_SIZE; oy++) {
    for (let ox = 0; ox < ALIGN_SIZE; ox++) {
      const srcX = inverse.a * ox + inverse.b * oy + inverse.tx;
      const srcY = inverse.c * ox + inverse.d * oy + inverse.ty;
      const [r, g, b] = bilinearSample(
        data,
        info.width,
        info.height,
        info.channels,
        srcX,
        srcY
      );
      const idx = (oy * ALIGN_SIZE + ox) * 3;
      out[idx] = Math.round(r);
      out[idx + 1] = Math.round(g);
      out[idx + 2] = Math.round(b);
    }
  }
  return out;
}

export { ALIGN_SIZE };
