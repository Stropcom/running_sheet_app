import { describe, expect, it } from "vitest";
import { STRONG_FACE_LIMIT, faceStrength, rankFaces } from "@shared/faceRank";

const face = (
  index: number,
  w: number,
  confidence = 0.99
): {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
} => ({
  index,
  bbox: [0, 0, w, w],
  confidence,
});

describe("rankFaces", () => {
  it("ranks by confidence times size, keeping the faces in their own order", () => {
    const ranked = rankFaces([face(0, 40), face(1, 120), face(2, 80)]);
    expect(ranked.map(f => f.index)).toEqual([0, 1, 2]);
    expect(ranked.map(f => f.rank)).toEqual([3, 1, 2]);
  });

  it("marks only the strongest few as strong", () => {
    const faces = Array.from({ length: 7 }, (_, i) => face(i, 100 - i * 10));
    const ranked = rankFaces(faces);
    expect(STRONG_FACE_LIMIT).toBe(4);
    expect(ranked.filter(f => f.strong).map(f => f.index)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(ranked.filter(f => !f.strong)).toHaveLength(3);
  });

  it("a small sure face can lose to a large less-sure one, and ties keep detector order", () => {
    expect(faceStrength(face(0, 100, 0.8))).toBeGreaterThan(
      faceStrength(face(1, 50, 1))
    );
    const tie = rankFaces([face(0, 60), face(1, 60)]);
    expect(tie.map(f => f.rank)).toEqual([1, 2]);
  });

  it("keeps everything strong when there are few faces, and copes with none", () => {
    expect(rankFaces([face(0, 50), face(1, 60)]).every(f => f.strong)).toBe(
      true
    );
    expect(rankFaces([])).toEqual([]);
  });

  it("honours another limit", () => {
    const ranked = rankFaces([face(0, 90), face(1, 80), face(2, 70)], 2);
    expect(ranked.map(f => f.strong)).toEqual([true, true, false]);
  });
});
