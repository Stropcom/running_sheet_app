import { describe, expect, it } from "vitest";
import {
  highlightQuery,
  searchHitPath,
  snippetAround,
} from "../shared/searchSnippet";

describe("snippetAround", () => {
  it("keeps a short line whole, wording unchanged", () => {
    expect(
      snippetAround("FRASER carried a brown suitcase.", "brown suitcase")
    ).toBe("FRASER carried a brown suitcase.");
  });
  it("tidies only the spacing", () => {
    expect(snippetAround("a   b\n c", "b")).toBe("a b c");
  });
  it("cuts a long line around the first match and marks the cuts", () => {
    const long =
      "word ".repeat(60) +
      "FRASER retrieved the brown suitcase from the boot. " +
      "tail ".repeat(60);
    const s = snippetAround(long, "brown suitcase", 120);
    expect(s.toLowerCase()).toContain("brown suitcase");
    expect(s.length).toBeLessThanOrEqual(124);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
  it("does not split a word at the cut", () => {
    const long =
      "alpha beta gamma delta ".repeat(20) +
      "NEEDLE here " +
      "omega ".repeat(40);
    const s = snippetAround(long, "needle", 80);
    const inner = s.replace(/^…/, "").replace(/…$/, "");
    for (const w of inner.split(" "))
      expect(w).toMatch(/^(alpha|beta|gamma|delta|NEEDLE|here|omega)$/);
  });
  it("a long line with no match starts from the beginning", () => {
    const s = snippetAround("x".repeat(50) + " " + "y".repeat(300), "zzz", 100);
    expect(s.startsWith("xxxx")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("highlightQuery", () => {
  it("highlights every place it appears, whatever the capitals", () => {
    expect(
      highlightQuery("Brown suitcase and a brown SUITCASE", "brown suitcase")
    ).toEqual([
      { text: "Brown suitcase", hit: true },
      { text: " and a ", hit: false },
      { text: "brown SUITCASE", hit: true },
    ]);
  });
  it("no query or no match gives the text plain", () => {
    expect(highlightQuery("abc", "")).toEqual([{ text: "abc", hit: false }]);
    expect(highlightQuery("abc", "x")).toEqual([{ text: "abc", hit: false }]);
  });
});

describe("searchHitPath", () => {
  it("opens the sheet scrolled to the line", () => {
    expect(searchHitPath(12, 345)).toBe("/sheet/12?highlightRow=345");
  });
});
