import { describe, expect, it } from "vitest";
import {
  GAP_MINUTES,
  ROUTE_GAP,
  ROUTE_RED,
  staticMapInput,
  buildDayRoute,
  legText,
  pinLabel,
  routeDays,
  routeSegments,
  stopTimes,
  type DayRoutePlace,
} from "@shared/dayRoute";
import type { PlaceVisit } from "@shared/placesReport";

const DAY = "2026-11-03";
let rowId = 0;
function visit(
  placeKey: string,
  start: number | null,
  end: number | null,
  extra: Partial<PlaceVisit> = {}
): PlaceVisit {
  return {
    placeKey,
    sheetId: 1,
    sheetTitle: "Sheet 3 Nov",
    rowId: ++rowId,
    dateISO: DAY,
    startMinutes: start,
    endMinutes: end,
    endDayOffset: 0,
    dwellMinutes: start !== null && end !== null ? end - start : null,
    ...extra,
  };
}
const t = (h: number, m = 0) => h * 60 + m;
function place(
  placeKey: string,
  visits: PlaceVisit[],
  name = placeKey
): DayRoutePlace {
  return { placeKey, name, kind: "other", visits };
}

describe("buildDayRoute", () => {
  it("orders stops by time across places, numbers pins by first visit", () => {
    const home = place("home", [
      visit("home", t(6, 42), t(7, 18)),
      visit("home", t(13, 10), t(15)),
    ]);
    const cafe = place("cafe", [visit("cafe", t(7, 41), t(8, 5))]);
    const r = buildDayRoute([cafe, home], DAY)!;
    expect(r.stops.map(s => s.placeKey)).toEqual(["home", "cafe", "home"]);
    expect(r.stops.map(s => s.pin)).toEqual(["1", "2", "1"]);
    expect(r.stops.map(s => s.visitNo)).toEqual([1, 1, 2]);
    expect(r.stats).toMatchObject({ stops: 3, places: 2, returns: 1 });
    expect(r.stats.minutesAtPlaces).toBe(36 + 24 + 110);
  });

  it("marks a stretch of an hour or more with no rows as a gap", () => {
    const a = place("a", [visit("a", t(8, 31), t(9, 40))]);
    const b = place("b", [visit("b", t(11, 5), t(12, 30))]);
    const c = place("c", [visit("c", t(12, 50), t(13))]);
    const r = buildDayRoute([a, b, c], DAY)!;
    expect(r.legs[0]).toEqual({
      kind: "gap",
      minutes: 85,
      fromMinutes: t(9, 40),
      toMinutes: t(11, 5),
    });
    expect(r.legs[1]).toEqual({ kind: "travel", minutes: 20 });
    expect(r.stats.gaps).toBe(1);
    expect(legText(r.legs[0])).toBe("No rows for 1 h 25 min (09:40 to 11:05)");
    expect(legText(r.legs[1])).toBe("20 min between places");
  });

  it("treats exactly the gap length as a gap, one minute less as travel", () => {
    const a = place("a", [visit("a", t(8), t(9))]);
    const b = place("b", [visit("b", t(9) + GAP_MINUTES, t(11))]);
    expect(buildDayRoute([a, b], DAY)!.legs[0].kind).toBe("gap");
    const c = place("c", [visit("c", t(9) + GAP_MINUTES - 1, t(11))]);
    expect(buildDayRoute([a, c], DAY)!.legs[0].kind).toBe("travel");
  });

  it("never guesses the time after a stop with no departure logged", () => {
    const a = place("a", [visit("a", t(8), null)]);
    const b = place("b", [visit("b", t(8, 30), t(9))]);
    const r = buildDayRoute([a, b], DAY)!;
    expect(r.legs[0]).toEqual({ kind: "unknown" });
    expect(r.stops[0].dwellMinutes).toBeNull();
    expect(r.stats.minutesAtPlaces).toBe(30);
    expect(stopTimes(r.stops[0])).toBe("08:00 (no departure logged)");
    expect(stopTimes(r.stops[1])).toBe("08:30 to 09:00");
  });

  it("joins a hand-over between sheets at the same place into one stop", () => {
    const a = place("home", [
      visit("home", t(6), null, { sheetId: 1, rowId: 1 }),
      visit("home", t(7), t(9), { sheetId: 2, rowId: 50 }),
    ]);
    const r = buildDayRoute([a], DAY)!;
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0]).toMatchObject({
      startMinutes: t(6),
      endMinutes: t(9),
      dwellMinutes: 180,
      rowId: 1,
    });
  });

  it("places a stop that opens with the target leaving at its departure", () => {
    const a = place("a", [visit("a", null, t(6, 30))]);
    const b = place("b", [visit("b", t(7), t(8))]);
    const r = buildDayRoute([b, a], DAY)!;
    expect(r.stops.map(s => s.placeKey)).toEqual(["a", "b"]);
    expect(stopTimes(r.stops[0])).toBe("left 06:30");
  });

  it("shows a departure after midnight with a +1, and measures to it", () => {
    const a = place("a", [
      visit("a", t(22), t(1), { endDayOffset: 1, dwellMinutes: 180 }),
    ]);
    const r = buildDayRoute([a], DAY)!;
    expect(stopTimes(r.stops[0])).toBe("22:00 to 01:00 +1");
  });

  it("only takes the chosen day, and is null for a quiet day", () => {
    const a = place("a", [
      visit("a", t(8), t(9)),
      visit("a", t(8), t(9), { dateISO: "2026-11-04" }),
    ]);
    expect(buildDayRoute([a], DAY)!.stops).toHaveLength(1);
    expect(buildDayRoute([a], "2026-11-05")).toBeNull();
  });

  it("lists the days with visits, newest first", () => {
    const a = place("a", [
      visit("a", t(8), t(9)),
      visit("a", t(8), t(9), { dateISO: "2026-11-04" }),
      visit("a", t(10), t(11), { dateISO: "2026-11-04" }),
    ]);
    expect(routeDays([a])).toEqual([
      { dateISO: "2026-11-04", stops: 2 },
      { dateISO: DAY, stops: 1 },
    ]);
  });
});

describe("pinLabel", () => {
  it("runs 1-9 then A-Z, and never a wrong character past that", () => {
    expect(pinLabel(0)).toBe("1");
    expect(pinLabel(8)).toBe("9");
    expect(pinLabel(9)).toBe("A");
    expect(pinLabel(34)).toBe("Z");
    expect(pinLabel(35)).toBe("");
  });
});

describe("routeSegments", () => {
  it("joins stops that have a position, and colours a gap leg as a gap", () => {
    const a = place("a", [visit("a", t(8), t(9))]);
    const b = place("b", [visit("b", t(9, 20), t(10))]);
    const c = place("c", [visit("c", t(12), t(13))]);
    const r = buildDayRoute([a, b, c], DAY)!;
    const pos: Record<string, { lat: number; lng: number }> = {
      a: { lat: -31.9, lng: 115.8 },
      b: { lat: -31.95, lng: 115.85 },
      c: { lat: -31.94, lng: 115.95 },
    };
    const segs = routeSegments(r, k => pos[k]);
    expect(segs.map(s => s.gap)).toEqual([false, true]);
    // A stop with no position breaks the line there — no invented point.
    expect(routeSegments(r, k => (k === "b" ? null : pos[k]))).toEqual([]);
  });

  it("draws no line between two stops at the same spot", () => {
    const a = place("a", [visit("a", t(8), t(9))]);
    const b = place("b", [visit("b", t(9, 20), t(10))]);
    const r = buildDayRoute([a, b], DAY)!;
    expect(routeSegments(r, () => ({ lat: 1, lng: 2 }))).toEqual([]);
  });
});

describe("staticMapInput", () => {
  const a = place("a", [visit("a", t(8), t(9))]);
  const b = place("b", [visit("b", t(9, 20), t(10))]);
  const c = place("c", [visit("c", t(12), t(13))]);
  const pos: Record<string, { lat: number; lng: number }> = {
    a: { lat: -31.9, lng: 115.8 },
    b: { lat: -31.95, lng: 115.85 },
    c: { lat: -31.94, lng: 115.95 },
  };

  it("pins each place once with its label, red travel and amber gap lines", () => {
    const r = buildDayRoute([a, b, c], DAY)!;
    const m = staticMapInput(r, k => pos[k])!;
    expect(m.waypoints.map(w => w.label)).toEqual(["1", "2", "3"]);
    expect(m.paths.map(p => p.colour)).toEqual([ROUTE_RED, ROUTE_GAP]);
    expect(m.center).toBeUndefined();
  });

  it("leaves out a place that has no position, and is null with none", () => {
    const r = buildDayRoute([a, b, c], DAY)!;
    const m = staticMapInput(r, k => (k === "b" ? null : pos[k]))!;
    expect(m.waypoints.map(w => w.label)).toEqual(["1", "3"]);
    expect(m.paths).toEqual([]);
    expect(staticMapInput(r, () => null)).toBeNull();
  });

  it("gives a one-place day a centre and zoom", () => {
    const r = buildDayRoute([a], DAY)!;
    const m = staticMapInput(r, k => pos[k])!;
    expect(m.center).toEqual(pos.a);
    expect(m.zoom).toBe(15);
  });
});
