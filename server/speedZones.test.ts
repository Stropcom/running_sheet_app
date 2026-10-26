import { describe, expect, it } from "vitest";
import {
  SNAP_METRES,
  SpeedZoneBuilder,
  SpeedZoneIndex,
  parseSpeedLimitText,
} from "../shared/speedZones";

const DEFAULT =
  "50km/h applies in built up areas or 110km/h outside built up areas";

// Lines in the shape of the real Main Roads WA download (one road per line).
const feature = (
  name: string,
  limit: string,
  region: string,
  coords: number[][],
  type: "LineString" | "MultiLineString" = "LineString"
) =>
  JSON.stringify({
    type: "Feature",
    properties: {
      ROAD: "1",
      ROAD_NAME: name,
      COMMON_USAGE_NAME: name,
      NETWORK_TYPE: "Local Road",
      RA_NAME: region,
      SPEED_LIMIT: limit,
    },
    geometry: { type, coordinates: coords },
  }) + ",";

// Hacket Rd — the first road in the owner's real file (default text, South West).
const REAL_HACKET = `{"type":"Feature","properties":{"ROAD":"2110042","ROAD_NAME":"Hacket Rd","COMMON_USAGE_NAME":"Hacket Rd","START_SLK":0.0,"END_SLK":1.15,"CWY":"Single","NETWORK_TYPE":"Local Road","RA_NO":"02","RA_NAME":"South West","LG_NO":"211","LG_NAME":"Harvey","SPEED_LIMIT":"${DEFAULT}","ROUTE_NE_ID":218243,"OBJECTID":30405221},"geometry":{"type":"LineString","coordinates":[[115.896999,-33.080650999136573],[115.89194,-33.088332999136519],[115.891914,-33.088372999136475]]}},`;

describe("parseSpeedLimitText", () => {
  it("reads a posted limit", () => {
    expect(parseSpeedLimitText("60km/h", "Metropolitan")).toEqual({
      kph: 60,
      kind: "posted",
    });
    expect(parseSpeedLimitText("110km/h", "Wheatbelt")?.kph).toBe(110);
    expect(parseSpeedLimitText("10km/h", null)?.kph).toBe(10);
  });

  it("the default text is 50 in the Metropolitan region and unknown elsewhere", () => {
    expect(parseSpeedLimitText(DEFAULT, "Metropolitan")).toEqual({
      kph: 50,
      kind: "default",
    });
    expect(parseSpeedLimitText(DEFAULT, "South West")).toEqual({
      kph: null,
      kind: "unknown-default",
    });
    expect(parseSpeedLimitText(DEFAULT, null)?.kind).toBe("unknown-default");
  });

  it("does not guess at text it does not know", () => {
    expect(
      parseSpeedLimitText("School Zone: 40km/h", "Metropolitan")
    ).toBeNull();
    expect(parseSpeedLimitText("", "Metropolitan")).toBeNull();
    expect(parseSpeedLimitText(null, null)).toBeNull();
  });
});

function build(lines: string[], opts = {}) {
  const b = new SpeedZoneBuilder(opts);
  b.addLine("{");
  b.addLine('"type": "FeatureCollection",');
  b.addLine('"features": [');
  for (const l of lines) b.addLine(l);
  b.addLine("]");
  b.addLine("}");
  return { bytes: b.finish(), stats: b.stats };
}

describe("building and reading the speed-zone file", () => {
  const lines = [
    REAL_HACKET,
    // Great Eastern Hwy-ish, 80 km/h, Metropolitan: runs west to east.
    feature("Great Eastern Hwy", "80km/h", "Metropolitan", [
      [115.9, -31.95],
      [115.91, -31.95],
    ]),
    // A cross street, default text in Metropolitan => 50.
    feature("Smith St", DEFAULT, "Metropolitan", [
      [115.905, -31.96],
      [115.905, -31.95],
    ]),
    // Freeway, 100 km/h, as a MultiLineString.
    feature(
      "Kwinana Fwy",
      "100km/h",
      "Metropolitan",
      [
        [
          [115.8, -32.0],
          [115.8, -31.99],
        ],
        [
          [115.8, -31.99],
          [115.8, -31.98],
        ],
      ] as unknown as number[][],
      "MultiLineString"
    ),
    // Text we do not understand — left out, not guessed.
    feature("Odd Rd", "Variable", "Metropolitan", [
      [115.7, -31.9],
      [115.71, -31.9],
    ]),
  ];

  it("keeps the roads it understands and says what it left out", () => {
    const { stats } = build(lines);
    expect(stats.linesRead).toBe(5);
    expect(stats.roads).toBe(5); // Hacket, GE Hwy, Smith, 2 x Kwinana pieces
    expect(stats.notUnderstood).toBe(1);
    expect(stats.posted).toBe(3);
    expect(stats.defaultMetro).toBe(1);
    expect(stats.defaultUnknown).toBe(1);
  });

  it("finds the nearest road and its limit", () => {
    const idx = new SpeedZoneIndex(build(lines).bytes);
    const onHwy = idx.nearest(-31.95, 115.9025);
    expect(onHwy).toMatchObject({
      name: "Great Eastern Hwy",
      kph: 80,
      kind: "posted",
    });
    expect(onHwy!.distM).toBeLessThan(1);
    const onFwy = idx.nearest(-31.985, 115.8);
    expect(onFwy).toMatchObject({ name: "Kwinana Fwy", kph: 100 });
  });

  it("a default road in Metropolitan gives 50, one elsewhere gives no number", () => {
    const idx = new SpeedZoneIndex(build(lines).bytes);
    expect(idx.nearest(-31.955, 115.905)).toMatchObject({
      name: "Smith St",
      kph: 50,
      kind: "default",
    });
    expect(idx.nearest(-33.085, 115.894)).toMatchObject({
      name: "Hacket Rd",
      kph: null,
      kind: "unknown-default",
    });
  });

  it("picks the nearer of two roads at a corner", () => {
    const idx = new SpeedZoneIndex(build(lines).bytes);
    // 10 m south of the highway, 380 m west of Smith St.
    const r = idx.nearest(-31.95009, 115.9025);
    expect(r?.name).toBe("Great Eastern Hwy");
    expect(r!.distM).toBeGreaterThan(5);
    expect(r!.distM).toBeLessThan(15);
  });

  it("finds nothing when no road is within the snap distance", () => {
    const idx = new SpeedZoneIndex(build(lines).bytes);
    // About 100 m north of the highway.
    expect(idx.nearest(-31.9491, 115.9025)).toBeNull();
    expect(SNAP_METRES).toBe(40);
    // Nowhere near any data.
    expect(idx.nearest(-20, 125)).toBeNull();
  });

  it("can be limited to an area", () => {
    const { stats } = build(lines, { bbox: [115.89, -31.97, 115.92, -31.94] });
    expect(stats.roads).toBe(2); // the highway and Smith St only
    expect(stats.outsideArea).toBeGreaterThan(0);
  });

  it("rejects a file that is not one of ours", () => {
    expect(() => new SpeedZoneIndex(new Uint8Array(64))).toThrow();
  });

  it("an empty file is fine and finds nothing", () => {
    const idx = new SpeedZoneIndex(build([]).bytes);
    expect(idx.nearest(-31.95, 115.9)).toBeNull();
  });

  it("agrees with a brute-force search on many random roads", () => {
    // 400 short random segments in a 0.05 degree box.
    let seed = 7;
    const rnd = () =>
      (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const segs: number[][][] = [];
    const ls: string[] = [];
    for (let i = 0; i < 400; i++) {
      const x = 115.8 + rnd() * 0.05;
      const y = -32 + rnd() * 0.05;
      const c = [
        [x, y],
        [x + (rnd() - 0.5) * 0.004, y + (rnd() - 0.5) * 0.004],
      ];
      segs.push(c);
      ls.push(feature(`R${i}`, `${50 + (i % 6) * 10}km/h`, "Metropolitan", c));
    }
    const idx = new SpeedZoneIndex(build(ls).bytes);
    const cos = Math.cos((-31.975 * Math.PI) / 180);
    const brute = (lat: number, lng: number) => {
      let best = { name: "", d: Infinity };
      segs.forEach((c, i) => {
        const ax = (Math.round(c[0][0] * 1e5) / 1e5 - lng) * 111000 * cos;
        const ay = (Math.round(c[0][1] * 1e5) / 1e5 - lat) * 111000;
        const bx = (Math.round(c[1][0] * 1e5) / 1e5 - lng) * 111000 * cos;
        const by = (Math.round(c[1][1] * 1e5) / 1e5 - lat) * 111000;
        const vx = bx - ax,
          vy = by - ay;
        const l2 = vx * vx + vy * vy;
        let t = l2 === 0 ? 0 : -(ax * vx + ay * vy) / l2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(ax + t * vx, ay + t * vy);
        if (d < best.d) best = { name: `R${i}`, d };
      });
      return best;
    };
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      const lng = 115.8 + rnd() * 0.05;
      const lat = -32 + rnd() * 0.05;
      const want = brute(lat, lng);
      const got = idx.nearest(lat, lng, 200);
      if (want.d <= 195) {
        expect(got?.name).toBe(want.name);
        checked++;
      } else if (want.d > 205) {
        expect(got).toBeNull();
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
