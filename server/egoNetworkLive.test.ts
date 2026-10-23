import { describe, expect, it } from "vitest";
import {
  LIVE_RING2_CAP,
  LIVE_STRETCH_MAX,
  LIVE_STRETCH_MIN,
  RING1_RADIUS_MIN,
  RING2_RADIUS_MIN,
  computeEgoLayout,
  liveRingRadii,
  widestGapAngle,
  type EgoNode,
} from "../client/src/lib/egoNetworkLayout";

describe("liveRingRadii (the on-screen Ego Network)", () => {
  it("spreads out on a big, wide canvas instead of stopping at the old fixed size", () => {
    const r = liveRingRadii({ width: 1370, height: 1140, hasRing2: true });
    expect(r.ring2).toBeGreaterThan(290); // the old fixed maximum
    expect(r.ring1).toBeGreaterThan(165);
    expect(r.ring2).toBeLessThanOrEqual(LIVE_RING2_CAP);
    expect(r.xStretch).toBeGreaterThan(1);
  });

  it("uses spare width by stretching sideways, never beyond the limit", () => {
    const wide = liveRingRadii({ width: 3000, height: 700, hasRing2: true });
    expect(wide.xStretch).toBe(LIVE_STRETCH_MAX);
    const square = liveRingRadii({ width: 736, height: 736, hasRing2: true });
    // Near enough a circle on a square canvas (labels need a little more side
    // room than top-and-bottom room, so it is a touch under 1).
    expect(square.xStretch).toBeGreaterThan(0.8);
    expect(square.xStretch).toBeLessThan(1.1);
  });

  it("keeps a narrow phone inside its screen, squeezing no further than the limit", () => {
    const phone = liveRingRadii({ width: 340, height: 574, hasRing2: true });
    expect(phone.xStretch).toBe(LIVE_STRETCH_MIN);
    expect(phone.ring1).toBeGreaterThanOrEqual(RING1_RADIUS_MIN);
    expect(phone.ring2).toBeGreaterThanOrEqual(RING2_RADIUS_MIN);
  });

  it("on a phone or iPad it is a true circle that fits the smaller side", () => {
    const phone = liveRingRadii({
      width: 340,
      height: 340,
      hasRing2: true,
      compact: true,
    });
    expect(phone.xStretch).toBe(1);
    // Room each side is half the width less space for a (small) name.
    expect(phone.ring2).toBeLessThanOrEqual(340 / 2);
    expect(phone.ring2).toBeGreaterThanOrEqual(RING2_RADIUS_MIN - 1);
    const tall = liveRingRadii({
      width: 340,
      height: 700,
      hasRing2: false,
      compact: true,
    });
    expect(tall.xStretch).toBe(1);
    // Limited by the narrow side, not the tall one.
    expect(tall.ring1).toBeLessThan(340 / 2);
  });

  it("with only one ring in use, ring 1 takes nearly all the room", () => {
    const one = liveRingRadii({ width: 900, height: 760, hasRing2: false });
    const two = liveRingRadii({ width: 900, height: 760, hasRing2: true });
    expect(one.ring1).toBeGreaterThan(two.ring1);
    expect(one.ring1).toBeLessThanOrEqual(760 / 2);
  });

  it("copes with a canvas that has not been measured yet", () => {
    const r = liveRingRadii({ width: 0, height: 0, hasRing2: true });
    expect(Number.isFinite(r.ring1)).toBe(true);
    expect(Number.isFinite(r.ring2)).toBe(true);
    expect(r.xStretch).toBe(1);
  });
});

describe("widestGapAngle", () => {
  it("falls back when there are no nodes", () => {
    expect(widestGapAngle([], 0.4)).toBe(0.4);
  });

  it("sits in the middle of the widest empty stretch", () => {
    // Nodes at 0, 90 and 180 degrees: the empty half is 180..360.
    const a = widestGapAngle([0, Math.PI / 2, Math.PI], 0);
    expect(a).toBeCloseTo((Math.PI * 3) / 2, 5);
  });

  it("handles negative angles and wrap-around", () => {
    const a = widestGapAngle([-0.1, 0.1], 0);
    expect(Math.cos(a)).toBeLessThan(-0.9); // opposite side from the nodes
  });
});

describe("computeEgoLayout xStretch", () => {
  const mk = (id: string): EgoNode => ({
    id,
    label: id,
    type: "address",
    occurrences: 1,
    operationIds: [],
    operationNames: [],
  });
  const focus = mk("f");
  const ids = ["a", "b", "c", "d"];
  const nodesById = new Map([focus, ...ids.map(mk)].map(n => [n.id, n]));
  const adjacency = new Map([
    ["f", ids.map(id => ({ id, weight: 1 }))],
    ...ids.map(id => [id, [{ id: "f", weight: 1 }]] as const),
  ]);
  const layout = (xStretch?: number) =>
    computeEgoLayout({
      focusNode: focus,
      adjacency,
      nodesById,
      hops: 1,
      expandRing1: false,
      ring1Radius: 100,
      ring2Radius: 200,
      xStretch,
    });

  it("leaves the export's layout alone when not asked to stretch", () => {
    const plain = layout();
    const one = layout(1);
    expect(plain.placed.map(p => [p.x, p.y])).toEqual(
      one.placed.map(p => [p.x, p.y])
    );
  });

  it("stretches x only", () => {
    const plain = layout(1).placed;
    const wide = layout(1.5).placed;
    wide.forEach((p, i) => {
      expect(p.x).toBeCloseTo(plain[i].x * 1.5, 6);
      expect(p.y).toBeCloseTo(plain[i].y, 6);
    });
  });
});
