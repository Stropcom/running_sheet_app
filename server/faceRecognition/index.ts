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

const _initPromise: Promise<void> = (async () => {
  try {
    const detect = await import("./detect");
    const align = await import("./align");
    const embed = await import("./embed");

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
