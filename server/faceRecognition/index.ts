import { detectFaces, type DetectedFace } from "./detect";
import { alignFace } from "./align";
import { embedFace } from "./embed";

export type { DetectedFace };
export { cosineSimilarity } from "./similarity";

export interface FaceWithEmbedding extends DetectedFace {
  embedding: number[];
}

/** Detects every face in a photo and computes its embedding — the "possible
 * faces" list shown by the multi-face-select picker. Nothing here writes to
 * the database or makes an identification; that only happens once an
 * officer confirms which face(s) correspond to the entity being linked. */
export async function detectAndEmbedFaces(
  imageBuffer: Buffer
): Promise<FaceWithEmbedding[]> {
  const faces = await detectFaces(imageBuffer);
  const results: FaceWithEmbedding[] = [];
  for (const face of faces) {
    const aligned = await alignFace(imageBuffer, face.landmarks);
    const embedding = await embedFace(aligned);
    results.push({ ...face, embedding });
  }
  return results;
}
