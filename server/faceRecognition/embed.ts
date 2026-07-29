import * as tf from "@tensorflow/tfjs-node";
import path from "path";
import { fileURLToPath } from "url";
import { ALIGN_SIZE } from "./align";

// MobileFace (ArcFace-family) face embedding — 256-d vector, cosine
// similarity comparable. Runs fully offline via @tensorflow/tfjs-node; no
// network calls. See models/NOTICE.md for provenance. Takes raw 0-255 pixel
// values with no normalization — verified empirically against this specific
// converted graph (an initially-tried sibling model, mobilefacenet, turned
// out to produce near input-independent output regardless of preprocessing
// and was discarded; this one gives ~0.99 similarity for the same face
// re-encoded, ~0.89 mirrored, ~0.2 for different people).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH =
  "file://" + path.join(__dirname, "models", "mobileface.json");

let modelPromise: Promise<tf.GraphModel> | null = null;
function getModel(): Promise<tf.GraphModel> {
  if (!modelPromise) modelPromise = tf.loadGraphModel(MODEL_PATH);
  return modelPromise;
}

// Defensive serialization to match detect.ts — avoids relying on concurrent
// execute() calls against the same GraphModel instance being safe.
let runQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = runQueue.then(fn, fn);
  runQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** `aligned` is a 112x112 RGB uint8 raw buffer, e.g. from align.ts. */
export async function embedFace(aligned: Buffer): Promise<number[]> {
  const model = await getModel();

  const floatData = new Float32Array(ALIGN_SIZE * ALIGN_SIZE * 3);
  for (let i = 0; i < floatData.length; i++) {
    floatData[i] = aligned[i];
  }

  return serialize(async () => {
    const input = tf.tensor4d(floatData, [1, ALIGN_SIZE, ALIGN_SIZE, 3]);
    try {
      const output = model.execute(input) as tf.Tensor;
      try {
        const data = await output.data();
        return Array.from(data);
      } finally {
        output.dispose();
      }
    } finally {
      input.dispose();
    }
  });
}
