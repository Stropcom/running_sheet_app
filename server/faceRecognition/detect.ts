import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

// RetinaFace (MobileNet-0.25 backbone) face detector — ported from the
// verified browser reference implementation in the `retinaface` npm package
// (see models/NOTICE.md) so preprocessing/anchors/decoding match exactly
// what the bundled ONNX weights were validated against. Runs fully offline
// via onnxruntime-node; no network calls.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, "models", "retinaface_mnet25.onnx");
const INPUT_SIZE = 640;
const LANDMARKS_SCALE = 0.18181818;
const PROB_THRESHOLD = 0.8;
const NMS_THRESHOLD = 0.4;

let sessionPromise: Promise<ort.InferenceSession> | null = null;
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) sessionPromise = ort.InferenceSession.create(MODEL_PATH);
  return sessionPromise;
}

// onnxruntime-node's InferenceSession.run is not safe to call concurrently
// on the same session — overlapping calls (e.g. two requests landing at
// once, or React Query's dev-mode double-fetch) can hang rather than error.
// Serialize every run through this session with a simple promise-chain queue.
let runQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = runQueue.then(fn, fn);
  runQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface DetectedFace {
  /** [x0, y0, x1, y1] in original image pixel coordinates */
  bbox: [number, number, number, number];
  /** 5 points (both eyes, nose, mouth corners) in original image pixel coordinates */
  landmarks: [number, number][];
  confidence: number;
}

function generateAnchors(
  baseSize: number,
  ratios: number[],
  scales: number[]
): number[][] {
  const cx = baseSize * 0.5;
  const cy = baseSize * 0.5;
  const anchors: number[][] = [];
  for (let i = 0; i < ratios.length; i++) {
    const ar = ratios[i];
    const rW = Math.round(baseSize / Math.sqrt(ar));
    const rH = Math.round(rW * ar);
    for (let j = 0; j < scales.length; j++) {
      const scale = scales[j];
      const rsW = rW * scale * 0.5;
      const rsH = rH * scale * 0.5;
      anchors[i * scales.length + j] = [cx - rsW, cy - rsH, cx + rsW, cy + rsH];
    }
  }
  return anchors;
}

interface RawFace {
  rect: [number, number, number, number];
  landmarks: [number, number][];
  prob: number;
}

function generateProposals(
  anchors: number[][],
  featStride: number,
  scoreData: Float32Array,
  bboxData: Float32Array,
  bboxDims: readonly number[],
  landmarkData: Float32Array,
  probThreshold: number,
  landmarksScale: number
): RawFace[] {
  const w = bboxDims[3];
  const h = bboxDims[2];
  const offset = w * h;
  const numAnchors = anchors.length;
  const faces: RawFace[] = [];

  for (let q = 0; q < numAnchors; q++) {
    const anchor = anchors[q];
    const scoreOffset = (q + numAnchors) * offset;
    const bboxOffset = q * 4 * offset;
    const landmarkOffset = q * 10 * offset;
    const anchorW = anchor[2] - anchor[0];
    const anchorH = anchor[3] - anchor[1];
    let anchorY = anchor[1];
    for (let i = 0; i < h; i++) {
      let anchorX = anchor[0];
      for (let j = 0; j < w; j++) {
        const index = i * w + j;
        const prob = scoreData[scoreOffset + index];
        if (prob >= probThreshold) {
          const dx = bboxData[bboxOffset + index + offset * 0];
          const dy = bboxData[bboxOffset + index + offset * 1];
          const dw = bboxData[bboxOffset + index + offset * 2];
          const dh = bboxData[bboxOffset + index + offset * 3];
          const cx = anchorX + anchorW * 0.5;
          const cy = anchorY + anchorH * 0.5;
          const pbCx = cx + anchorW * dx;
          const pbCy = cy + anchorH * dy;
          const pbW = anchorW * Math.exp(dw);
          const pbH = anchorH * Math.exp(dh);
          const x0 = pbCx - pbW * 0.5;
          const y0 = pbCy - pbH * 0.5;
          const x1 = pbCx + pbW * 0.5;
          const y1 = pbCy + pbH * 0.5;
          const w2 = anchorW * landmarksScale + 1;
          const h2 = anchorH * landmarksScale + 1;
          const landmarks: [number, number][] = [0, 1, 2, 3, 4].map(k => [
            cx + w2 * landmarkData[landmarkOffset + index + offset * (k * 2)],
            cy +
              h2 * landmarkData[landmarkOffset + index + offset * (k * 2 + 1)],
          ]);
          faces.push({ rect: [x0, y0, x1, y1], landmarks, prob });
        }
        anchorX += featStride;
      }
      anchorY += featStride;
    }
  }
  return faces;
}

function nmsSortedBboxes(faces: RawFace[], nmsThreshold: number): number[] {
  const picked: number[] = [];
  const areas = faces.map(
    f => (f.rect[2] - f.rect[0]) * (f.rect[3] - f.rect[1])
  );
  for (let i = 0; i < faces.length; i++) {
    const a = faces[i];
    let keep = true;
    for (const j of picked) {
      const b = faces[j];
      const interArea =
        Math.max(
          0,
          Math.min(a.rect[2], b.rect[2]) - Math.max(a.rect[0], b.rect[0])
        ) *
        Math.max(
          0,
          Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[1], b.rect[1])
        );
      const unionArea = areas[i] + areas[j] - interArea;
      if (interArea / unionArea > nmsThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) picked.push(i);
  }
  return picked;
}

/** Resizes into the top-left of a 640x640 canvas (matching the reference
 * implementation's canvas draw — no centering), padded with black. Returns
 * the raw RGB buffer plus the scale factor needed to map detections back to
 * original image coordinates. */
async function preprocessImage(
  buffer: Buffer
): Promise<{ data: Buffer; scale: number }> {
  const meta = await sharp(buffer).metadata();
  const origWidth = meta.width ?? INPUT_SIZE;
  const origHeight = meta.height ?? INPUT_SIZE;
  const scale = Math.min(INPUT_SIZE / origWidth, INPUT_SIZE / origHeight);
  const resizedW = Math.max(1, Math.floor(origWidth * scale));
  const resizedH = Math.max(1, Math.floor(origHeight * scale));

  const { data } = await sharp(buffer)
    .rotate() // apply EXIF orientation before anything else
    .removeAlpha()
    .toColorspace("srgb")
    .resize(resizedW, resizedH, { fit: "fill" })
    .extend({
      top: 0,
      left: 0,
      bottom: INPUT_SIZE - resizedH,
      right: INPUT_SIZE - resizedW,
      background: { r: 0, g: 0, b: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, scale };
}

export async function detectFaces(buffer: Buffer): Promise<DetectedFace[]> {
  const session = await getSession();
  const { data: rgb, scale } = await preprocessImage(buffer);

  // HWC uint8 RGB -> NCHW float32, raw 0-255 range (matches the reference
  // implementation's preprocessing exactly — this model was not trained
  // with mean-subtracted/normalized inputs).
  const len = INPUT_SIZE * INPUT_SIZE;
  const chw = new Float32Array(len * 3);
  for (let i = 0; i < len; i++) {
    chw[i] = rgb[i * 3];
    chw[i + len] = rgb[i * 3 + 1];
    chw[i + len * 2] = rgb[i * 3 + 2];
  }

  const inputTensor = new ort.Tensor("float32", chw, [
    1,
    3,
    INPUT_SIZE,
    INPUT_SIZE,
  ]);
  const results = await serialize(() => session.run({ data: inputTensor }));

  const proposals: RawFace[] = [];
  const strides: Array<{ stride: number; scales: number[] }> = [
    { stride: 32, scales: [32, 16] },
    { stride: 16, scales: [8, 4] },
    { stride: 8, scales: [2, 1] },
  ];
  for (const { stride, scales } of strides) {
    const score = results[`face_rpn_cls_prob_reshape_stride${stride}`];
    const bbox = results[`face_rpn_bbox_pred_stride${stride}`];
    const landmark = results[`face_rpn_landmark_pred_stride${stride}`];
    const anchors = generateAnchors(16, [1], scales);
    proposals.push(
      ...generateProposals(
        anchors,
        stride,
        score.data as Float32Array,
        bbox.data as Float32Array,
        bbox.dims,
        landmark.data as Float32Array,
        PROB_THRESHOLD,
        LANDMARKS_SCALE
      )
    );
  }

  proposals.sort((a, b) => b.prob - a.prob);
  const picked = nmsSortedBboxes(proposals, NMS_THRESHOLD);

  return picked.map(i => {
    const f = proposals[i];
    const clampX = (v: number) =>
      Math.max(Math.min(v, INPUT_SIZE - 1), 0) / scale;
    const clampY = (v: number) =>
      Math.max(Math.min(v, INPUT_SIZE - 1), 0) / scale;
    return {
      bbox: [
        clampX(f.rect[0]),
        clampY(f.rect[1]),
        clampX(f.rect[2]),
        clampY(f.rect[3]),
      ],
      landmarks: f.landmarks.map(
        ([x, y]) => [clampX(x), clampY(y)] as [number, number]
      ),
      confidence: f.prob,
    };
  });
}
