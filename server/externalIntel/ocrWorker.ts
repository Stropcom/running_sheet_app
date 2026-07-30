import { createWorker, type Worker, PSM } from "tesseract.js";
import path from "path";
import { fileURLToPath } from "url";

// Deterministic, fully-offline OCR (Tesseract WASM) — no runtime AI/LLM call,
// see CLAUDE.md Golden Rule. Trained-data file is vendored locally
// (models/eng.traineddata.gz, see models/NOTICE.md); no network fetch.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, "models");

let workerPromise: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      langPath: MODELS_DIR,
      cachePath: MODELS_DIR,
      gzip: true,
      logger: () => {},
    });
  }
  return workerPromise;
}

// tesseract.js workers are not safe for concurrent recognize() calls on the
// same worker — serialize through a queue, same pattern as the face
// detection ONNX session (server/faceRecognition/detect.ts).
let runQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = runQueue.then(fn, fn);
  runQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

/** OCR a full page/region, auto page-segmentation. For narrative/list text. */
export async function ocrPage(image: Buffer | string): Promise<OcrResult> {
  return serialize(async () => {
    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence };
  });
}

/** OCR a single tightly-cropped cell/line. For table-cell value extraction. */
export async function ocrLine(image: Buffer | string): Promise<OcrResult> {
  return serialize(async () => {
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    const { data } = await worker.recognize(image);
    return { text: data.text.trim(), confidence: data.confidence };
  });
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
