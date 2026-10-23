import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHROME_STYLES,
  COLOR_PALETTES,
  DEFAULT_CHROME_STYLE,
  DEFAULT_COLOR_PALETTE,
  normalizeChromeStyle,
  normalizeColorPalette,
} from "../shared/const";

const css = readFileSync("client/src/index.css", "utf8");

describe("colour palettes", () => {
  it("offers Harbour Teal and Monochrome, and no longer Federal Navy or Graphite", () => {
    const ids = COLOR_PALETTES.map(p => p.id) as string[];
    expect(ids).toContain("harbour-teal");
    expect(ids).toContain("monochrome");
    expect(ids).not.toContain("federal-navy");
    expect(ids).not.toContain("graphite");
    expect(ids).toHaveLength(6);
  });

  it("reads a removed or unknown saved palette as the default", () => {
    expect(normalizeColorPalette("federal-navy")).toBe(DEFAULT_COLOR_PALETTE);
    expect(normalizeColorPalette("graphite")).toBe(DEFAULT_COLOR_PALETTE);
    expect(normalizeColorPalette(null)).toBe(DEFAULT_COLOR_PALETTE);
    expect(normalizeColorPalette(undefined)).toBe(DEFAULT_COLOR_PALETTE);
    expect(normalizeColorPalette("monochrome")).toBe("monochrome");
    expect(normalizeColorPalette("harbour-teal")).toBe("harbour-teal");
  });

  it("has a light and a dark CSS block for every palette except the default, and none for removed ones", () => {
    for (const { id } of COLOR_PALETTES) {
      if (id === DEFAULT_COLOR_PALETTE) continue;
      expect(css, `${id} dark`).toContain(`.dark[data-palette="${id}"]`);
      expect(css, `${id} light`).toContain(
        `:root:not(.dark)[data-palette="${id}"]`
      );
    }
    expect(css).not.toContain('data-palette="federal-navy"');
    expect(css).not.toContain('data-palette="graphite"');
  });
});

describe("header and left side panel style", () => {
  it("defaults to dark and reads anything but 'light' as dark", () => {
    expect(DEFAULT_CHROME_STYLE).toBe("dark");
    expect(CHROME_STYLES.map(c => c.id)).toEqual(["dark", "light"]);
    expect(normalizeChromeStyle(null)).toBe("dark");
    expect(normalizeChromeStyle("")).toBe("dark");
    expect(normalizeChromeStyle("sepia")).toBe("dark");
    expect(normalizeChromeStyle("light")).toBe("light");
  });

  it("the light rules come after every palette block (same specificity, later wins)", () => {
    const light = css.indexOf(':root:not(.dark)[data-chrome="light"] {');
    expect(light).toBeGreaterThan(-1);
    for (const { id } of COLOR_PALETTES) {
      if (id === DEFAULT_COLOR_PALETTE) continue;
      expect(css.lastIndexOf(`[data-palette="${id}"]`)).toBeLessThan(light);
    }
  });

  it("the light panel deepens the folder colours inside the chrome only", () => {
    const match = css.match(
      /(:root:not\(\.dark\)\[data-chrome="light"\])\s+:is\(header\.app-chrome, \[data-sidebar="sidebar"\]\)\s*\{/
    );
    // Light mode only, and only inside the header and the side panel.
    expect(match).not.toBeNull();
    const rule = match!.index!;
    const body = css.slice(rule, css.indexOf("}", rule));
    // Every hue the folders use is redefined, and only light mode is touched.
    for (const hue of [
      "red",
      "orange",
      "amber",
      "emerald",
      "teal",
      "cyan",
      "blue",
      "indigo",
      "violet",
      "purple",
      "rose",
    ]) {
      expect(body, hue).toContain(`--color-${hue}-400`);
    }
  });
});
