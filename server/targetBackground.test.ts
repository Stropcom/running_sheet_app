import { describe, expect, it } from "vitest";
import {
  TARGET_BACKGROUND_MAX,
  importedBackgroundLabel,
  labelledImportedBackground,
  normaliseTargetBackground,
} from "@shared/targetBackground";

describe("normaliseTargetBackground", () => {
  it("keeps line breaks and paragraph gaps", () => {
    expect(normaliseTargetBackground("One.\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("turns Windows and old-Mac line endings into \\n", () => {
    expect(normaliseTargetBackground("A\r\nB\rC")).toBe("A\nB\nC");
  });

  it("trims outer whitespace but not inner spacing", () => {
    expect(normaliseTargetBackground("  \n a  b \n ")).toBe("a  b");
  });

  it("returns null for empty or whitespace-only text (cleared)", () => {
    expect(normaliseTargetBackground("")).toBeNull();
    expect(normaliseTargetBackground(" \n\t ")).toBeNull();
  });

  it("caps the length", () => {
    const out = normaliseTargetBackground(
      "x".repeat(TARGET_BACKGROUND_MAX + 50)
    );
    expect(out).toHaveLength(TARGET_BACKGROUND_MAX);
  });

  it("does not interpret markup", () => {
    expect(normaliseTargetBackground("<b>hi</b> **x**")).toBe(
      "<b>hi</b> **x**"
    );
  });
});

describe("labelledImportedBackground", () => {
  it("puts the operation's label above the narrative", () => {
    expect(
      labelledImportedBackground("Lives with his mother.", "Op Falcon")
    ).toBe("From Op Falcon document:\nLives with his mother.");
  });

  it("falls back to a plain label when no operation is picked yet", () => {
    expect(importedBackgroundLabel("  ")).toBe("From imported document:");
    expect(labelledImportedBackground("Text", null)).toBe(
      "From imported document:\nText"
    );
  });

  it("gives nothing when the document had no narrative", () => {
    expect(labelledImportedBackground("  \n ", "Op Falcon")).toBe("");
    expect(labelledImportedBackground(undefined, "Op Falcon")).toBe("");
  });

  it("normalises line endings", () => {
    expect(labelledImportedBackground("A\r\nB", "Op X")).toBe(
      "From Op X document:\nA\nB"
    );
  });
});
