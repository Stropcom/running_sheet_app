import { describe, expect, it } from "vitest";
import {
  HOUSE_GLOW_PATH,
  TILE_SIZE,
  houseGlowStyle,
  tileShapeFor,
  TILE_STRENGTH,
  hexToRgb,
  placeLinkedToTarget,
  tileStyle,
} from "@shared/targetLocation";

describe("placeLinkedToTarget", () => {
  it("is tied through the target's own place (registry address or a row naming both)", () => {
    expect(placeLinkedToTarget({ linkedTargets: [{ targetId: 7 }] }, 7)).toBe(
      true
    );
  });

  it("is tied through the address of one of the target's registered associates", () => {
    expect(placeLinkedToTarget({ relatedTargetIds: [3, 7] }, 7)).toBe(true);
  });

  it("is not tied to a different target", () => {
    expect(
      placeLinkedToTarget(
        { linkedTargets: [{ targetId: 8 }], relatedTargetIds: [8] },
        7
      )
    ).toBe(false);
  });

  it("counts a marker that has absorbed a tied place nearby", () => {
    expect(
      placeLinkedToTarget(
        {
          linkedTargets: [{ targetId: 8 }],
          secondaryLocs: [{ relatedTargetIds: [7] }],
        },
        7
      )
    ).toBe(true);
  });

  it("marks nothing without a target, or for a place with no ties", () => {
    expect(
      placeLinkedToTarget({ linkedTargets: [{ targetId: 7 }] }, null)
    ).toBe(false);
    expect(
      placeLinkedToTarget({ linkedTargets: [{ targetId: 7 }] }, undefined)
    ).toBe(false);
    expect(placeLinkedToTarget({}, 7)).toBe(false);
    expect(placeLinkedToTarget(null, 7)).toBe(false);
  });
});

describe("tileStyle", () => {
  it("is fixed at 30% strength and 80% size", () => {
    expect(TILE_STRENGTH).toBe(0.3);
    expect(TILE_SIZE).toBe(0.8);
  });

  it("takes the marker's own colour, with no border", () => {
    const red = tileStyle(40, "#E53935")!;
    const purple = tileStyle(40, "#8E24AA")!;
    expect(red.background).toContain("229,57,53");
    expect(red.boxShadow).toContain("229,57,53");
    expect(purple.background).toContain("142,36,170");
    expect(purple.background).not.toContain("229,57,53");
  });

  it("is a rounded square a little bigger than the 40px icon, centred on it", () => {
    const t = tileStyle(40, "#E53935")!;
    expect(t.sizePx).toBe(44.8);
    expect(t.offsetPx).toBe(-2.4);
    expect(t.radiusPx).toBe(9);
  });

  it("gives nothing for a colour it can't read", () => {
    expect(tileStyle(40, "red")).toBeNull();
    expect(hexToRgb("#12")).toBeNull();
    expect(hexToRgb("#212121")).toBe("33,33,33");
  });
});

describe("house glow", () => {
  it("house icons get the house shape, every other icon the square", () => {
    expect(tileShapeFor("house_filled")).toBe("house");
    expect(tileShapeFor("house_outline")).toBe("house");
    expect(tileShapeFor("sedan")).toBe("square");
    expect(tileShapeFor("place_bank")).toBe("square");
    expect(tileShapeFor("")).toBe("square");
  });

  it("sits over the icon and takes the marker's colour at 30% strength", () => {
    const g = houseGlowStyle(40, "#8E24AA")!;
    expect(g.sizePx).toBe(40);
    expect(g.rgb).toBe("142,36,170");
    expect(g.opacity).toBe(0.3);
    expect(HOUSE_GLOW_PATH).toContain("24,4");
  });

  it("reaches as far past the house as the square tile does", () => {
    // Tile overhang past the icon box (2.4px) + the icon's own margin round the
    // house (3.33px) = 5.73px each side, drawn as a 13.76-unit outline.
    expect(houseGlowStyle(40, "#E53935")!.strokeWidth).toBe(13.76);
  });

  it("gives nothing for a colour it can't read", () => {
    expect(houseGlowStyle(40, "red")).toBeNull();
  });
});
