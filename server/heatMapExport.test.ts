import { describe, it, expect } from "vitest";
import {
  chooseView,
  connectorBetween,
  findClusters,
  overlayShapesSvg,
  placeInsets,
  project,
  rankLocations,
  worldPoint,
} from "../shared/heatMapExport";

describe("projection matches Google's Web Mercator", () => {
  it("gives Google's published world coordinate for Chicago at zoom 0", () => {
    // From Google's "Map and Tile Coordinates" documentation.
    const p = worldPoint(41.85, -87.65, 0);
    expect(p.x).toBeCloseTo(65.67111111111111, 6);
    expect(p.y).toBeCloseTo(95.17492654697409, 6);
  });

  it("puts the centre of the view at the centre of the picture", () => {
    const size = { width: 720, height: 540 };
    const view = { lat: -32.02, lng: 115.84, zoom: 12 };
    const p = project(view, size, view.lat, view.lng);
    expect(p.x).toBeCloseTo(360, 6);
    expect(p.y).toBeCloseTo(270, 6);
  });

  it("scales by 256 × 2^zoom logical pixels per world, and doubles each zoom", () => {
    const size = { width: 1000, height: 1000 };
    const at = (zoom: number) =>
      project({ lat: 0, lng: 0, zoom }, size, 0, 1).x - 500;
    expect(at(10)).toBeCloseTo((256 * 1024) / 360, 6);
    expect(at(11)).toBeCloseTo(at(10) * 2, 6);
  });

  it("north is up, east is right", () => {
    const size = { width: 400, height: 400 };
    const v = { lat: -32, lng: 115, zoom: 12 };
    const n = project(v, size, -31.99, 115);
    const e = project(v, size, -32, 115.01);
    expect(n.y).toBeLessThan(200);
    expect(e.x).toBeGreaterThan(200);
  });
});

describe("chooseView", () => {
  const size = { width: 720, height: 540 };
  const pts = [
    { lat: -31.9937, lng: 115.7527 },
    { lat: -31.938, lng: 115.873 },
    { lat: -32.064, lng: 115.921 },
  ];

  it("picks an integer zoom with every point inside the picture and padding to spare", () => {
    const v = chooseView(pts, size, 60);
    expect(Number.isInteger(v.zoom)).toBe(true);
    for (const p of pts) {
      const s = project(v, size, p.lat, p.lng);
      expect(s.x).toBeGreaterThanOrEqual(60 - 1e-6);
      expect(s.x).toBeLessThanOrEqual(660 + 1e-6);
      expect(s.y).toBeGreaterThanOrEqual(60 - 1e-6);
      expect(s.y).toBeLessThanOrEqual(480 + 1e-6);
    }
  });

  it("is the tightest such zoom — one more would not fit", () => {
    const v = chooseView(pts, size, 60);
    const tighter = { ...v, zoom: v.zoom + 1 };
    const xs = pts.map(p => project(tighter, size, p.lat, p.lng));
    const fits = xs.every(
      s => s.x >= 60 && s.x <= 660 && s.y >= 60 && s.y <= 480
    );
    expect(fits).toBe(false);
  });

  it("caps the zoom for a single place", () => {
    expect(chooseView([pts[0]], size, 60).zoom).toBe(16);
    expect(chooseView([pts[0]], size, 60, 3, 15).zoom).toBe(15);
  });
});

describe("clusters", () => {
  it("groups discs that overlap, including through a chain, and ranks groups by visits", () => {
    const projected = [
      { x: 100, y: 100, count: 5 },
      { x: 120, y: 100, count: 4 },
      { x: 140, y: 100, count: 2 },
      { x: 400, y: 300, count: 1 },
      { x: 410, y: 300, count: 1 },
      { x: 700, y: 50, count: 9 },
    ];
    expect(findClusters(projected)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it("finds nothing when no discs overlap", () => {
    expect(
      findClusters([
        { x: 0, y: 0, count: 1 },
        { x: 200, y: 0, count: 1 },
      ])
    ).toEqual([]);
  });
});

describe("placeInsets", () => {
  const main = { width: 720, height: 540 };
  const inset = { width: 250, height: 210 };

  it("uses the top-left corner first, then the top-right", () => {
    const r = placeInsets(main, inset, 2, []);
    expect(r[0]).toMatchObject({ x: 10, y: 10 });
    expect(r[1]).toMatchObject({ x: 720 - 10 - 250, y: 10 });
  });

  it("never covers a place, and falls to the next slot", () => {
    const r = placeInsets(main, inset, 1, [{ x: 100, y: 100 }]);
    expect(r[0]).toMatchObject({ x: 720 - 10 - 250, y: 10 });
  });

  it("never reaches the bottom edge where Google's logo sits", () => {
    const r = placeInsets(main, inset, 4, []);
    for (const s of r) if (s) expect(s.y + s.h).toBeLessThanOrEqual(540 - 30);
  });

  it("leaves an inset out when there is no free slot", () => {
    const blockers = [
      { x: 100, y: 100 },
      { x: 600, y: 100 },
      { x: 100, y: 300 },
      { x: 600, y: 300 },
    ];
    expect(placeInsets(main, inset, 1, blockers)[0]).toBeNull();
  });

  it("never overlaps one inset with another", () => {
    const r = placeInsets(main, inset, 3, []).filter(Boolean) as {
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
    for (let a = 0; a < r.length; a++)
      for (let b = a + 1; b < r.length; b++) {
        const A = r[a];
        const B = r[b];
        const overlap =
          A.x < B.x + B.w &&
          B.x < A.x + A.w &&
          A.y < B.y + B.h &&
          B.y < A.y + A.h;
        expect(overlap).toBe(false);
      }
  });
});

describe("rankLocations", () => {
  it("ranks by visits, busiest first, ties in the order given", () => {
    const r = rankLocations([
      { label: "a", count: 1, lat: 0, lng: 0 },
      { label: "b", count: 5, lat: 0, lng: 0 },
      { label: "c", count: 1, lat: 0, lng: 0 },
    ]);
    expect(r.map(x => `${x.label}${x.rank}`)).toEqual(["b1", "a2", "c3"]);
  });
});

describe("overlay", () => {
  const view = { lat: -32.05, lng: 115.88, zoom: 15 };
  const size = { width: 400, height: 300 };
  const item = (rank: number, count: number, lat: number, lng: number) => ({
    label: `p${rank}`,
    count,
    lat,
    lng,
    rank,
    colour: "#dd3a3a",
  });

  it("draws a circle and a numbered disc per place", () => {
    const svg = overlayShapesSvg(
      view,
      size,
      [item(1, 5, -32.05, 115.88), item(2, 1, -32.0505, 115.8805)],
      5
    );
    expect((svg.match(/<text /g) ?? []).length).toBe(2);
    expect(svg).toContain(">1</text>");
    expect(svg).toContain(">2</text>");
  });

  it("nudges overlapping discs apart and draws a leader line", () => {
    const svg = overlayShapesSvg(
      view,
      size,
      [item(1, 5, -32.05, 115.88), item(2, 4, -32.05, 115.88)],
      5
    );
    expect(svg).toContain("<line ");
  });

  it("draws no leader line when places are well apart", () => {
    const svg = overlayShapesSvg(
      view,
      size,
      [item(1, 5, -32.05, 115.88), item(2, 4, -32.06, 115.9)],
      5
    );
    expect(svg).not.toContain("<line ");
  });

  it("an inset keeps circles at their on-screen minimum, not their real-world size", () => {
    const real = overlayShapesSvg(view, size, [item(1, 5, -32.05, 115.88)], 5);
    const screen = overlayShapesSvg(
      view,
      size,
      [item(1, 5, -32.05, 115.88)],
      5,
      {
        screenSizeOnly: true,
      }
    );
    const r = (s: string) => Number(/<circle[^>]* r="([\d.]+)"/.exec(s)![1]);
    expect(r(screen)).toBeCloseTo(28, 1);
    expect(r(real)).toBeGreaterThan(r(screen));
  });
});

describe("connectorBetween", () => {
  it("runs from one rect's edge to the other's, along the line between their centres", () => {
    const c = connectorBetween(
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 300, y: 0, w: 100, h: 100 }
    );
    expect(c.x1).toBeCloseTo(100, 6);
    expect(c.x2).toBeCloseTo(300, 6);
    expect(c.y1).toBeCloseTo(50, 6);
    expect(c.y2).toBeCloseTo(50, 6);
  });
});
