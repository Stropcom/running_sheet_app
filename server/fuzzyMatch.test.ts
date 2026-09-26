import { describe, it, expect } from "vitest";
import {
  stringSimilarity,
  findFuzzyMatches,
  sharesSignificantWord,
} from "./fuzzyMatch";

describe("stringSimilarity", () => {
  it("scores identical strings (after trim/case-fold) as 1", () => {
    expect(stringSimilarity("John Smith", "  john smith ")).toBe(1);
  });

  it("scores a one-letter-dropped typo highly", () => {
    // "Corola" -> "Corolla": one missing letter out of 7
    expect(stringSimilarity("COROLA", "COROLLA")).toBeCloseTo(0.857, 2);
  });

  it("scores a transposition typo at the threshold boundary", () => {
    // "Jhon Smith" -> "John Smith": one substitution out of 10
    expect(stringSimilarity("Jhon Smith", "John Smith")).toBe(0.8);
  });

  it("scores completely different strings low", () => {
    expect(stringSimilarity("SMITH", "JONES")).toBeLessThan(0.5);
  });
});

describe("findFuzzyMatches", () => {
  const registry = [
    { id: "1", label: "John Smith" },
    { id: "2", label: "Jane Doe" },
    { id: "3", label: "1DHY084" },
  ];

  it("finds a close-but-not-exact match above threshold", () => {
    const results = findFuzzyMatches("Jhon Smith", registry);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("John Smith");
  });

  it("excludes an exact match — that's not a typo, it's the same entity", () => {
    const results = findFuzzyMatches("John Smith", registry);
    expect(results).toHaveLength(0);
  });

  it("returns nothing when no candidate is close enough", () => {
    const results = findFuzzyMatches("Completely Different Name", registry);
    expect(results).toHaveLength(0);
  });

  it("catches a single-digit rego typo", () => {
    const results = findFuzzyMatches("1DHY094", registry);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("1DHY084");
  });

  it("sorts multiple matches best-first", () => {
    // Query vs "...HIX" differs by 1 char (10 chars -> 0.9); vs "...HXX"
    // differs by 2 (-> 0.8) — both clear the threshold, closer one first.
    const results = findFuzzyMatches("ABCDEFGHIJ", [
      { id: "closer", label: "ABCDEFGHIX" },
      { id: "farther", label: "ABCDEFGHXX" },
    ]);
    expect(results.map(r => r.id)).toEqual(["closer", "farther"]);
  });
});

describe("sharesSignificantWord", () => {
  it("catches a full name against a bare-surname registry entry (the real RAYSON case)", () => {
    expect(
      sharesSignificantWord("Stevie RAYSON", [{ id: "1", label: "RAYSON" }])
    ).toBe(true);
  });

  it("catches two different first names sharing the same surname", () => {
    const known = [{ id: "1", label: "RAYSON" }];
    expect(sharesSignificantWord("Stevie RAYSON", known)).toBe(true);
    expect(sharesSignificantWord("Daniel RAYSON", known)).toBe(true);
  });

  it("does not fire on a short word alone (e.g. a stray initial)", () => {
    expect(sharesSignificantWord("H", [{ id: "1", label: "Hogan" }])).toBe(
      false
    );
  });

  it("returns false when nothing overlaps", () => {
    expect(
      sharesSignificantWord("Sarah Connor", [{ id: "1", label: "John Smith" }])
    ).toBe(false);
  });
});
