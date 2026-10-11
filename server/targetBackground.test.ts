import { describe, expect, it } from "vitest";
import {
  TARGET_BACKGROUND_MAX,
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
