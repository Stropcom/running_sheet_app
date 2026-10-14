import { describe, it, expect } from "vitest";
import {
  HEAT_NUMBER_DISC_PX,
  heatMinPixels,
  heatRadiusFor,
  heatRadiusMetres,
  metresPerPixel,
  nudgeApart,
} from "../shared/heatMapLayout";

describe("heat circle size", () => {
  it("keeps the real-world size when zoomed in", () => {
    const zoom = 16;
    const lat = -32.05;
    expect(heatRadiusFor(1, 5, lat, zoom)).toBeCloseTo(
      heatRadiusMetres(1, 5),
      6
    );
  });

  it("never drops below the minimum on-screen size when zoomed out", () => {
    const lat = -32.05;
    for (const zoom of [8, 10, 12]) {
      const metres = heatRadiusFor(1, 5, lat, zoom);
      const px = metres / metresPerPixel(lat, zoom);
      expect(px).toBeGreaterThanOrEqual(heatMinPixels(1, 5) - 1e-9);
    }
  });

  it("busier places are bigger at every zoom", () => {
    for (const zoom of [9, 12, 15]) {
      expect(heatRadiusFor(5, 5, -32, zoom)).toBeGreaterThan(
        heatRadiusFor(1, 5, -32, zoom)
      );
    }
  });
});

describe("nudgeApart", () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  it("leaves places that do not overlap exactly where they are", () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 200, y: 10 },
    ];
    expect(nudgeApart(pts)).toEqual(pts);
  });

  it("pushes overlapping and identical points apart", () => {
    const pts = [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 104, y: 98 },
    ];
    const out = nudgeApart(pts);
    for (let a = 0; a < out.length; a++)
      for (let b = a + 1; b < out.length; b++)
        expect(dist(out[a], out[b])).toBeGreaterThanOrEqual(
          HEAT_NUMBER_DISC_PX * 2 - 0.5
        );
  });

  it("is deterministic and does not change its input", () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const first = nudgeApart(pts);
    expect(nudgeApart(pts)).toEqual(first);
    expect(pts).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
  });
});
