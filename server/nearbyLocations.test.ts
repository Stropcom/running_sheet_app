import { describe, expect, it } from "vitest";
import {
  NEARBY_MERGE_RADIUS_M,
  distanceBand,
  distanceMetres,
  foldIntoTargetAddresses,
  formatNearbyDistance,
  locationsWithin,
  movedEnough,
  type FoldableLocation,
} from "@shared/nearbyLocations";

// 0.001 degrees of latitude is about 111 m.
const here = { lat: -31.95, lng: 115.86 };
const north = (m: number) => ({ lat: here.lat + m / 111195, lng: here.lng });

describe("distanceMetres", () => {
  it("is zero for the same point and about right for a known offset", () => {
    expect(distanceMetres(here.lat, here.lng, here.lat, here.lng)).toBe(0);
    const p = north(300);
    expect(distanceMetres(here.lat, here.lng, p.lat, p.lng)).toBeCloseTo(
      300,
      -1
    );
  });
});

describe("distanceBand / formatNearbyDistance", () => {
  it("bands at 100 m and 250 m", () => {
    expect(distanceBand(0)).toBe("close");
    expect(distanceBand(100)).toBe("close");
    expect(distanceBand(101)).toBe("mid");
    expect(distanceBand(250)).toBe("mid");
    expect(distanceBand(251)).toBe("far");
    expect(distanceBand(500)).toBe("far");
  });
  it("rounds to whole metres", () => {
    expect(formatNearbyDistance(42.4)).toBe("42 m");
    expect(formatNearbyDistance(119.6)).toBe("120 m");
  });
});

describe("locationsWithin", () => {
  const items = [
    { id: "far", ...north(900) },
    { id: "b", ...north(300) },
    { id: "a", ...north(40) },
    { id: "edge", ...north(499) },
    { id: "just-out", ...north(520) },
  ];
  it("keeps only what is within 500 m, nearest first", () => {
    const out = locationsWithin(items, here);
    expect(out.map(i => i.id)).toEqual(["a", "b", "edge"]);
    expect(out[0].distance).toBeLessThan(out[1].distance);
  });
  it("honours another radius", () => {
    expect(locationsWithin(items, here, 100).map(i => i.id)).toEqual(["a"]);
  });
});

describe("movedEnough", () => {
  it("always redraws the first fix, then only for real movement", () => {
    expect(movedEnough(null, here)).toBe(true);
    expect(movedEnough(here, north(4))).toBe(false);
    expect(movedEnough(here, north(15))).toBe(true);
  });
});

describe("foldIntoTargetAddresses", () => {
  const base = (over: Partial<FoldableLocation>): FoldableLocation => ({
    label: "x",
    type: "observation",
    lat: here.lat,
    lng: here.lng,
    assocPersons: [],
    assocVehicles: [],
    linkedTargets: [],
    linkCount: 0,
    ...over,
  });
  it("folds a close observed location into the target address", () => {
    const target = base({
      label: "12 Harbour Road",
      type: "target_address",
      linkedTargets: [{ targetId: 1 }],
      assocPersons: ["Nadia KOVACS"],
      linkCount: 2,
    });
    const obs = base({
      label: "12 Harbour Road (obs)",
      ...north(NEARBY_MERGE_RADIUS_M - 5),
      assocPersons: ["Tomas VARGA"],
      assocVehicles: ["1ABC123"],
    });
    const out = foldIntoTargetAddresses([target, obs]);
    expect(out).toHaveLength(1);
    expect(out[0].assocPersons).toEqual(["Nadia KOVACS", "Tomas VARGA"]);
    expect(out[0].assocVehicles).toEqual(["1ABC123"]);
    expect(out[0].secondaryLocs).toHaveLength(1);
    expect(out[0].linkCount).toBe(4); // 1 target + 2 people + 1 vehicle
    // inputs are untouched
    expect(target.assocPersons).toEqual(["Nadia KOVACS"]);
  });
  it("keeps a location that is further away on its own", () => {
    const target = base({ label: "T", type: "target_address" });
    const far = base({ label: "F", ...north(NEARBY_MERGE_RADIUS_M + 30) });
    expect(foldIntoTargetAddresses([target, far]).map(l => l.label)).toEqual([
      "T",
      "F",
    ]);
  });
});
