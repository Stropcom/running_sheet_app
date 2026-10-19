// Which faces in a photo count as the "strongest". A busy street photo can
// hold a dozen faces, most of them bystanders; the picker highlights only the
// strongest few and leaves the rest for the officer to open by hand
// ("Show N more faces"). Strength = how confident the detector is, times how
// big the face is in the photo (a larger face is closer and clearer, so a
// better one to match). Pure and deterministic — same photo, same ranking.

/** How many faces are highlighted without the officer asking for more. */
export const STRONG_FACE_LIMIT = 4;

export interface RankableFace {
  index: number;
  /** [x0, y0, x1, y1] in photo pixels. */
  bbox: [number, number, number, number];
  confidence: number;
}

export function faceStrength(f: Pick<RankableFace, "bbox" | "confidence">) {
  const [x0, y0, x1, y1] = f.bbox;
  return f.confidence * Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/**
 * Adds `rank` (1 = strongest) and `strong` (rank within `limit`) to each face,
 * keeping the faces in their own order — `index` always means the face's
 * position in the detector's output, which every later call relies on.
 * Equal strength: the lower index ranks first.
 */
export function rankFaces<T extends RankableFace>(
  faces: T[],
  limit = STRONG_FACE_LIMIT
): (T & { rank: number; strong: boolean })[] {
  const order = [...faces].sort(
    (a, b) => faceStrength(b) - faceStrength(a) || a.index - b.index
  );
  const rankOf = new Map(order.map((f, i) => [f.index, i + 1]));
  return faces.map(f => {
    const rank = rankOf.get(f.index) ?? faces.length;
    return { ...f, rank, strong: rank <= limit };
  });
}
