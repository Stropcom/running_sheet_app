import { describe, expect, it } from "vitest";
import {
  BEHIND_WEIGHT,
  angleDiff,
  bearingDeg,
  compassName,
  directionWeight,
  travelDirection,
  type TrailPoint,
} from "../shared/travelDirection";
import {
  predict,
  type PredictorInput,
  type PredictorPlace,
  type PredictorStop,
} from "../shared/targetPredictor";

const T0 = Date.UTC(2026, 2, 4, 0, 0, 0);
const min = (m: number) => T0 + m * 60_000;
// ~111 m per 0.001 degree of latitude.
const pt = (
  userId: number,
  m: number,
  lat: number,
  lng: number
): TrailPoint => ({
  userId,
  lat,
  lng,
  recordedAt: min(m),
});

describe("bearing helpers", () => {
  it("gives compass bearings", () => {
    const o = { lat: -31.95, lng: 115.86 };
    expect(bearingDeg(o, { lat: -31.9, lng: 115.86 })).toBeCloseTo(0, 0);
    expect(bearingDeg(o, { lat: -31.95, lng: 115.9 })).toBeCloseTo(90, 0);
    expect(bearingDeg(o, { lat: -32.0, lng: 115.86 })).toBeCloseTo(180, 0);
    expect(bearingDeg(o, { lat: -31.95, lng: 115.8 })).toBeCloseTo(270, 0);
  });
  it("measures the smallest angle", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(90, 270)).toBe(180);
  });
  it("names the eight points", () => {
    expect(compassName(0)).toBe("north");
    expect(compassName(44)).toBe("north-east");
    expect(compassName(185)).toBe("south");
    expect(compassName(359)).toBe("north");
  });
});

describe("travelDirection", () => {
  it("reads the heading from net movement inside the window", () => {
    // heading east: longitude rises ~0.003 (~290 m) over 4 minutes
    const d = travelDirection(
      [
        pt(1, 0, -31.95, 115.86),
        pt(1, 2, -31.95, 115.862),
        pt(1, 4, -31.95, 115.863),
      ],
      min(0),
      min(5)
    );
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.bearing).toBeCloseTo(90, 0);
      expect(d.officers).toBe(1);
    }
  });

  it("ignores points outside the five minutes", () => {
    const d = travelDirection(
      [pt(1, -20, -31.9, 115.86), pt(1, -19, -31.91, 115.86)],
      min(0),
      min(5)
    );
    expect(d).toEqual({ ok: false, why: "no-trail" });
  });

  it("gives no direction when the team barely moved", () => {
    const d = travelDirection(
      [pt(1, 0, -31.95, 115.86), pt(1, 4, -31.9501, 115.8601)],
      min(0),
      min(5)
    );
    expect(d).toEqual({ ok: false, why: "too-short" });
  });

  it("needs two points from an officer", () => {
    expect(travelDirection([pt(1, 1, -31.95, 115.86)], min(0), min(5))).toEqual(
      {
        ok: false,
        why: "no-trail",
      }
    );
  });

  it("averages officers who agree and refuses ones who do not", () => {
    const north = (id: number, lng: number) => [
      pt(id, 0, -31.95, lng),
      pt(id, 4, -31.946, lng),
    ];
    const agree = travelDirection(
      [...north(1, 115.86), ...north(2, 115.861)],
      min(0),
      min(5)
    );
    expect(agree.ok && agree.officers).toBe(2);
    const split = travelDirection(
      [
        ...north(1, 115.86),
        pt(2, 0, -31.95, 115.86),
        pt(2, 4, -31.95, 115.866), // east
      ],
      min(0),
      min(5)
    );
    expect(split).toEqual({ ok: false, why: "disagree" });
  });
});

describe("directionWeight", () => {
  const from = { lat: -31.95, lng: 115.86 };
  it("keeps the whole forward half at full weight", () => {
    // heading east: east, north-east and north (90 degrees off) all count
    expect(directionWeight(90, from, { lat: -31.95, lng: 115.9 })).toBe(1);
    expect(directionWeight(90, from, { lat: -31.9, lng: 115.9 })).toBe(1);
    expect(directionWeight(90, from, { lat: -31.9, lng: 115.86 })).toBe(1);
  });
  it("cuts places behind to a quarter but never to nothing", () => {
    expect(directionWeight(90, from, { lat: -31.95, lng: 115.8 })).toBe(
      BEHIND_WEIGHT
    );
    expect(directionWeight(90, from, { lat: -32.0, lng: 115.8 })).toBe(
      BEHIND_WEIGHT
    );
    expect(BEHIND_WEIGHT).toBeGreaterThan(0);
  });
  it("does not judge a place at the same spot", () => {
    expect(directionWeight(90, from, { lat: -31.9501, lng: 115.8601 })).toBe(1);
  });
});

describe("the predictor with a direction", () => {
  // Two places 5 km from the last-seen point, one east and one west, equally
  // common in his history.
  const places: PredictorPlace[] = [
    { placeKey: "gym", name: "Gym", lat: -31.95, lng: 115.8 },
    { placeKey: "cafe", name: "Cafe", lat: -31.95, lng: 115.9 },
    { placeKey: "home", name: "Home", lat: -31.95, lng: 115.85 },
  ];
  const out = (to: string, n: number): PredictorStop[] =>
    Array.from({ length: n }, () => ({
      placeKey: "home",
      weekday: 2,
      dateISO: "2026-01-01",
      startMinutes: 0,
      endMinutes: 505,
      departureLogged: true,
      nextPlaceKey: to,
      nextStartMinutes: 520,
    }));
  const base = (heading: number | null): PredictorInput => ({
    mode: "now",
    stops: [...out("gym", 5), ...out("cafe", 5)],
    places,
    from: { kind: "place", placeKey: "home", minutes: 505, leaving: true },
    nowWeekday: 2,
    nowMinutes: 520,
    area: "main",
    heading,
  });
  const share = (pr: ReturnType<typeof predict>, k: string) =>
    pr.candidates.find(c => c.placeKey === k)?.p ?? 0;

  it("favours the place he was heading towards", () => {
    const none = predict(base(null));
    expect(share(none, "gym")).toBeCloseTo(share(none, "cafe"), 1);
    expect(none.directionApplied).toBe(false);
    const east = predict(base(90));
    expect(east.directionApplied).toBe(true);
    expect(share(east, "cafe")).toBeGreaterThan(share(east, "gym") * 3);
    const west = predict(base(270));
    expect(share(west, "gym")).toBeGreaterThan(share(west, "cafe") * 3);
  });

  it("still gives the place behind some share", () => {
    expect(share(predict(base(90)), "gym")).toBeGreaterThan(0.05);
  });

  it("the shares still add to 100%", () => {
    const pr = predict(base(90));
    expect(pr.candidates.reduce((t, c) => t + c.p, 0)).toBeCloseTo(1);
  });
});
