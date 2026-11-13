// The tactical marker library (client/src/lib/tacticalMarkers.ts): 413 traced
// icons, a fixed order, every one with its SVG file. Written before the file
// was split into chunks (v2.83.33) so the split can be shown not to change it.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TACTICAL_GROUPS,
  TACTICAL_ICONS,
  TACTICAL_ICONS_BY_GROUP,
  getTacticalIconLabel,
  getTacticalIconSrc,
  isTacticalIcon,
} from "../client/src/lib/tacticalMarkers";

describe("tactical marker library", () => {
  it("has the 413 icons, each key once, in the groups it is sorted into", () => {
    expect(TACTICAL_ICONS).toHaveLength(413);
    expect(new Set(TACTICAL_ICONS.map(t => t.key)).size).toBe(413);
    const groups = TACTICAL_GROUPS.map(g => g.key);
    expect(groups).toEqual([
      "target_associates",
      "tactical",
      "vehicles",
      "facilities",
      "personnel",
    ]);
    for (const t of TACTICAL_ICONS) expect(groups).toContain(t.group);
    expect(
      TACTICAL_GROUPS.map(g => TACTICAL_ICONS_BY_GROUP[g.key].length)
    ).toEqual([4, 369, 16, 12, 12]);
  });

  it("every icon has its SVG file", () => {
    for (const t of TACTICAL_ICONS) {
      expect(t.src).toBe(`/tactical-markers/${t.key}.svg`);
      expect(existsSync(join("client/public", t.src)), t.src).toBe(true);
    }
  });

  it("keeps the same icons in the same order", () => {
    const h = createHash("sha256")
      .update(JSON.stringify(TACTICAL_ICONS))
      .digest("hex");
    expect(h).toBe("9fe976b76fedc5fd005c16cad8563c42c13d24012e42d45dfc0b68b1efb82424");
  });

  it("looks icons up by key", () => {
    expect(isTacticalIcon("west")).toBe(true);
    expect(isTacticalIcon("nope")).toBe(false);
    expect(getTacticalIconSrc("west")).toBe("/tactical-markers/west.svg");
    expect(getTacticalIconLabel("west")).toBe("WEST");
    expect(getTacticalIconSrc("nope")).toBeNull();
  });
});
