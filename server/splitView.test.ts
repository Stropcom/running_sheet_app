import { describe, it, expect } from "vitest";
import {
  SPLIT_MIN_H,
  SPLIT_MIN_W,
  clampSplitBox,
  defaultSplitBox,
  parseSplitSettings,
  splitViewAvailable,
  zoomForRange,
} from "../shared/splitView";

describe("defaultSplitBox", () => {
  it("starts in the top left, under the Centre on me / Follow me buttons", () => {
    const b = defaultSplitBox({ width: 1000, height: 700 });
    expect(b.left).toBe(10);
    expect(b.top).toBe(108);
    expect(b.width).toBe(300);
    expect(b.height).toBe(225);
  });
  it("stays inside a small map and never goes below the minimum size", () => {
    const b = defaultSplitBox({ width: 400, height: 300 });
    expect(b.width).toBeGreaterThanOrEqual(SPLIT_MIN_W);
    expect(b.left + b.width).toBeLessThanOrEqual(400);
    expect(b.top + b.height).toBeLessThanOrEqual(300);
  });
});

describe("clampSplitBox", () => {
  const c = { width: 800, height: 600 };
  it("keeps the window inside the map", () => {
    expect(
      clampSplitBox({ left: 900, top: 900, width: 300, height: 200 }, c)
    ).toEqual({
      left: 500,
      top: 400,
      width: 300,
      height: 200,
    });
    expect(
      clampSplitBox({ left: -50, top: -5, width: 300, height: 200 }, c)
    ).toMatchObject({
      left: 0,
      top: 0,
    });
  });
  it("never shrinks below a thumbnail or grows past the map", () => {
    const small = clampSplitBox({ left: 0, top: 0, width: 10, height: 10 }, c);
    expect(small.width).toBe(SPLIT_MIN_W);
    expect(small.height).toBe(SPLIT_MIN_H);
    const big = clampSplitBox(
      { left: 0, top: 0, width: 5000, height: 5000 },
      c
    );
    expect(big.width).toBe(792);
    expect(big.height).toBe(592);
  });
});

describe("parseSplitSettings", () => {
  it("reads what was saved", () => {
    expect(
      parseSplitSettings({
        nmSplitOn: true,
        nmSplitBox: { left: 5, top: 6, width: 300, height: 200 },
      })
    ).toEqual({ on: true, box: { left: 5, top: 6, width: 300, height: 200 } });
  });
  it("treats a new device or bad data as off with no saved position", () => {
    for (const raw of [
      undefined,
      null,
      {},
      "x",
      { nmSplitOn: "yes" },
      { nmSplitBox: { left: "a" } },
    ])
      expect(parseSplitSettings(raw)).toEqual({ on: false, box: null });
    expect(
      parseSplitSettings({
        nmSplitBox: { left: NaN, top: 0, width: 1, height: 1 },
      }).box
    ).toBeNull();
  });
});

describe("splitViewAvailable", () => {
  it("needs Fly, not a phone, and a Nearmap key", () => {
    expect(
      splitViewAvailable({
        flyOpen: true,
        phone: false,
        nearmapConfigured: true,
      })
    ).toBe(true);
    expect(
      splitViewAvailable({
        flyOpen: false,
        phone: false,
        nearmapConfigured: true,
      })
    ).toBe(false);
    expect(
      splitViewAvailable({
        flyOpen: true,
        phone: true,
        nearmapConfigured: true,
      })
    ).toBe(false);
    expect(
      splitViewAvailable({
        flyOpen: true,
        phone: false,
        nearmapConfigured: false,
      })
    ).toBe(false);
  });
});

describe("zoomForRange", () => {
  it("a closer camera gives a higher zoom, a farther one a lower zoom", () => {
    const near = zoomForRange(200, -32, 300);
    const mid = zoomForRange(1000, -32, 300);
    const far = zoomForRange(10000, -32, 300);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
  it("gives a street-level zoom for a few hundred metres", () => {
    expect(zoomForRange(300, -31.95, 300)).toBe(17);
  });
  it("stays within 3 to 21 and falls back on bad input", () => {
    expect(zoomForRange(1, 0, 5000)).toBe(21);
    expect(zoomForRange(5_000_000, 0, 100)).toBe(3);
    expect(zoomForRange(NaN, 0, 300)).toBe(17);
    expect(zoomForRange(0, 0, 300)).toBe(17);
  });
});
