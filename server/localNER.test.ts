import { describe, it, expect } from "vitest";
import { mergePersonTokenTags } from "./localNER";

// mergePersonTokenTags is the one piece of server/localNER.ts that's
// testable without the real model weights (which this sandbox can't
// fetch — see scripts/dev/ner-model-setup.md) — it's pure token-shape
// reconstruction, no model call. The rest of the file (getNerPipeline,
// findPersonMentions) needs verifying against a real model run before
// being trusted; this at least locks down the part that can be checked
// now.

describe("mergePersonTokenTags", () => {
  it("passes through a single-word name at high confidence", () => {
    const mentions = mergePersonTokenTags([
      { entity: "B-PER", word: "Sarah", score: 0.998 },
      { entity: "B-LOC", word: "London", score: 0.999 },
    ]);
    expect(mentions).toEqual([{ text: "Sarah", score: 0.998 }]);
  });

  it("merges a two-word name (B-PER followed by I-PER)", () => {
    const mentions = mergePersonTokenTags([
      { entity: "B-PER", word: "Sarah", score: 0.99 },
      { entity: "I-PER", word: "Connor", score: 0.97 },
      { entity: "O", word: "walked", score: 0.5 },
    ]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].text).toBe("Sarah Connor");
    expect(mentions[0].score).toBeCloseTo(0.98, 2);
  });

  it("rejoins a WordPiece-split name with no space before a ## piece", () => {
    const mentions = mergePersonTokenTags([
      { entity: "B-PER", word: "John", score: 0.95 },
      { entity: "I-PER", word: "##son", score: 0.93 },
    ]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].text).toBe("Johnson");
  });

  it("splits two separate names not joined by I-PER", () => {
    const mentions = mergePersonTokenTags([
      { entity: "B-PER", word: "Alice", score: 0.99 },
      { entity: "O", word: "and", score: 0.5 },
      { entity: "B-PER", word: "Bob", score: 0.98 },
    ]);
    expect(mentions.map(m => m.text)).toEqual(["Alice", "Bob"]);
  });

  it("drops a name below the confidence threshold", () => {
    const mentions = mergePersonTokenTags([
      { entity: "B-PER", word: "Maybe", score: 0.4 },
    ]);
    expect(mentions).toHaveLength(0);
  });

  it("ignores non-person entities entirely", () => {
    const mentions = mergePersonTokenTags([
      { entity: "B-LOC", word: "London", score: 0.99 },
      { entity: "B-ORG", word: "WA Police", score: 0.97 },
    ]);
    expect(mentions).toHaveLength(0);
  });

  it("treats a stray I-PER with nothing open as a span start, not a drop", () => {
    const mentions = mergePersonTokenTags([
      { entity: "I-PER", word: "Smith", score: 0.9 },
    ]);
    expect(mentions).toEqual([{ text: "Smith", score: 0.9 }]);
  });

  it("returns nothing for an empty token list", () => {
    expect(mergePersonTokenTags([])).toEqual([]);
  });
});
