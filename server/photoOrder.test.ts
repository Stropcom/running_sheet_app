import { describe, expect, it } from "vitest";
import { orderPhotosLikeProfile } from "../shared/photoOrder";

const board = [
  { targetId: 1, associates: [{ name: "Anna ONE" }, { name: "Ben TWO" }] },
  { targetId: 2, associates: [{ name: "Cara THREE" }] },
];
const photo = (id: number, ...links: Array<[string, string, number?]>) => ({
  id,
  linkedEntities: links.map(([category, label, targetId]) => ({
    category,
    label,
    targetId: targetId ?? null,
  })),
});

describe("orderPhotosLikeProfile", () => {
  it("puts each target first, then their associates, then the next target", () => {
    const photos = [
      photo(1, ["associate", "cara three"]),
      photo(2, ["target", "Two", 2]),
      photo(3, ["associate", "Ben  TWO"]),
      photo(4, ["target", "One", 1]),
      photo(5, ["associate", "Anna ONE"]),
    ];
    expect(orderPhotosLikeProfile(photos, board).map(p => p.id)).toEqual([
      4, 5, 3, 2, 1,
    ]);
  });

  it("leaves unlinked and unrelated photos after the board, in their own order", () => {
    const photos = [
      photo(1),
      photo(2, ["vehicle", "1ABC123"]),
      photo(3, ["target", "One", 1]),
      photo(4, ["associate", "Someone ELSE"]),
    ];
    expect(orderPhotosLikeProfile(photos, board).map(p => p.id)).toEqual([
      3, 1, 2, 4,
    ]);
  });

  it("keeps arrival order for photos of the same person, and uses the earliest link", () => {
    const photos = [
      photo(1, ["target", "One", 1]),
      photo(2, ["associate", "Cara THREE"], ),
      photo(3, ["target", "One", 1]),
      photo(4, ["associate", "Cara THREE"], ["associate", "Anna ONE"]),
    ];
    expect(orderPhotosLikeProfile(photos, board).map(p => p.id)).toEqual([
      1, 3, 4, 2,
    ]);
  });

  it("changes nothing with no targets", () => {
    const photos = [photo(2), photo(1)];
    expect(orderPhotosLikeProfile(photos, []).map(p => p.id)).toEqual([2, 1]);
  });
});
