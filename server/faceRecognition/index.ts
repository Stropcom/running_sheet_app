import { createHash } from "node:crypto";
import type { DetectedFace } from "./detect";

export type { DetectedFace };
export { cosineSimilarity } from "./similarity";

export interface FaceWithEmbedding extends DetectedFace {
  embedding: number[];
}

// Attempt to load the native face recognition modules. These depend on
// onnxruntime-node and @tensorflow/tfjs-node which require glibc and native
// binaries. In environments where those are unavailable (e.g. Alpine-based
// containers), the import will fail — we catch that and fall back to a
// no-op implementation so the server starts cleanly.
let _detectAndEmbedFaces: ((buf: Buffer) => Promise<FaceWithEmbedding[]>) | null = null;
let _detectOnly: ((buf: Buffer) => Promise<DetectedFace[]>) | null = null;
let _embedOne: ((buf: Buffer, face: DetectedFace) => Promise<number[]>) | null = null;

const _initPromise: Promise<void> = (async () => {
  try {
    const detect = await import("./detect");
    const align = await import("./align");
    const embed = await import("./embed");

    _detectOnly = (imageBuffer: Buffer) => detect.detectFaces(imageBuffer);
    _embedOne = async (imageBuffer: Buffer, face: DetectedFace) =>
      embed.embedFace(await align.alignFace(imageBuffer, face.landmarks));

    _detectAndEmbedFaces = async (imageBuffer: Buffer): Promise<FaceWithEmbedding[]> => {
      const faces = await detect.detectFaces(imageBuffer);
      const results: FaceWithEmbedding[] = [];
      for (const face of faces) {
        const aligned = await align.alignFace(imageBuffer, face.landmarks);
        const embedding = await embed.embedFace(aligned);
        results.push({ ...face, embedding });
      }
      return results;
    };
  } catch (err) {
    console.warn(
      "[FaceRecognition] Native modules unavailable — face detection disabled.",
      err instanceof Error ? err.message : String(err)
    );
  }
})();

/** Detects every face in a photo and computes its embedding.
 * Returns an empty array if native face recognition modules are unavailable. */
export async function detectAndEmbedFaces(
  imageBuffer: Buffer
): Promise<FaceWithEmbedding[]> {
  await _initPromise;
  if (!_detectAndEmbedFaces) return [];
  return _detectAndEmbedFaces(imageBuffer);
}

// Detection only — boxes and landmarks, no embeddings. Embedding is the
// expensive part and is only needed for a face the officer actually picks (to
// look for matches or store it), so a photo's face COUNT and the tap-a-face
// boxes never need it. A small cache keyed by the photo's bytes means a run of
// taps on one photo detects it once; detection is deterministic, so a cached
// answer is the same answer.
const DETECT_CACHE_MAX = 8;
const DETECT_CACHE_TTL_MS = 10 * 60 * 1000;
const detectCache = new Map<string, { at: number; faces: DetectedFace[] }>();

export async function detectFaceBoxes(
  imageBuffer: Buffer
): Promise<DetectedFace[]> {
  await _initPromise;
  if (!_detectOnly) return [];
  const key = createHash("sha1").update(imageBuffer).digest("hex");
  const hit = detectCache.get(key);
  if (hit && Date.now() - hit.at < DETECT_CACHE_TTL_MS) return hit.faces;
  const faces = await _detectOnly(imageBuffer);
  detectCache.set(key, { at: Date.now(), faces });
  while (detectCache.size > DETECT_CACHE_MAX) {
    const oldest = detectCache.keys().next().value;
    if (oldest === undefined) break;
    detectCache.delete(oldest);
  }
  return faces;
}

/** The embedding of ONE detected face (the `index`th box from
 * detectFaceBoxes). Null when it isn't there or recognition is unavailable. */
export async function embedFaceAt(
  imageBuffer: Buffer,
  index: number
): Promise<FaceWithEmbedding | null> {
  await _initPromise;
  if (!_embedOne) return null;
  const face = (await detectFaceBoxes(imageBuffer))[index];
  if (!face) return null;
  return { ...face, embedding: await _embedOne(imageBuffer, face) };
}
