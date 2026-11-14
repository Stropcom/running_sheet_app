import { describe, expect, it } from "vitest";
import {
  chooseZoom,
  inPicture,
  projectToPicture,
  webMercatorBBox,
  type PictureView,
} from "@shared/staticMapProject";

const perth = { lat: -31.95, lng: 115.86 };
const view = (zoom: number): PictureView => ({
  center: perth,
  zoom,
  width: 360,
  height: 220,
});

describe("projectToPicture", () => {
  it("puts the centre in the middle of the picture", () => {
    const p = projectToPicture(perth, view(17));
    expect(p.x).toBeCloseTo(180, 6);
    expect(p.y).toBeCloseTo(110, 6);
  });
  it("puts east to the right and north up, about 0.9 px per metre at zoom 17 in Perth", () => {
    // 0.001 degrees of longitude is ~94 m at this latitude.
    const east = projectToPicture(
      { ...perth, lng: perth.lng + 0.001 },
      view(17)
    );
    expect(east.x).toBeGreaterThan(180);
    expect(east.y).toBeCloseTo(110, 6);
    const north = projectToPicture(
      { ...perth, lat: perth.lat + 0.001 },
      view(17)
    );
    expect(north.y).toBeLessThan(110);
    // Zoom 17 is ~1.19 m per pixel at the equator, ~1.01 at -32 degrees.
    const metres = 0.001 * 111320 * Math.cos((perth.lat * Math.PI) / 180);
    expect(east.x - 180).toBeCloseTo(metres / 1.0128, 0);
  });
  it("doubles the distance for each zoom level", () => {
    const a = projectToPicture({ ...perth, lng: perth.lng + 0.0005 }, view(16));
    const b = projectToPicture({ ...perth, lng: perth.lng + 0.0005 }, view(17));
    expect((b.x - 180) / (a.x - 180)).toBeCloseTo(2, 6);
  });
});

describe("inPicture / chooseZoom", () => {
  it("knows what is inside the picture", () => {
    expect(inPicture(perth, view(17))).toBe(true);
    expect(inPicture({ ...perth, lng: perth.lng + 0.05 }, view(17))).toBe(
      false
    );
  });
  it("fits two points that are a few hundred metres apart, and one point at the top zoom", () => {
    expect(chooseZoom([perth], { width: 360, height: 220 })).toBe(18);
    const other = { lat: perth.lat + 0.002, lng: perth.lng + 0.003 };
    const z = chooseZoom([perth, other], { width: 360, height: 220 });
    expect(z).toBeLessThan(18);
    const centre = {
      lat: (perth.lat + other.lat) / 2,
      lng: (perth.lng + other.lng) / 2,
    };
    const v = { center: centre, zoom: z, width: 360, height: 220 };
    expect(inPicture(perth, v, 40) && inPicture(other, v, 40)).toBe(true);
  });
});

describe("webMercatorBBox", () => {
  it("is centred on the point and wider than tall for a wide picture", () => {
    const b = webMercatorBBox(view(17));
    expect(b.maxX - b.minX).toBeCloseTo((360 / 220) * (b.maxY - b.minY), 3);
    // Perth in EPSG:3857: x = 115.86 deg * R * pi/180 = ~12,897,476 m.
    expect((b.minX + b.maxX) / 2).toBeCloseTo(12897476, 0);
  });
});
