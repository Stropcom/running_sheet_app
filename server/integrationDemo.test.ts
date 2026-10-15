import { describe, expect, it } from "vitest";
import {
  DEMO_BOX_ROUTE,
  DEMO_CAMERAS,
  DEMO_MINUTES,
  DEMO_REGO,
  DEMO_TRACKERS,
  DEMO_VEHICLE_ROUTE,
  bearingAndDistance,
  cameraIsLive,
  cameraRowText,
  demoClock,
  demoPingsForSlot,
  demoSurname,
  metresBetween,
  motionX,
  newestPing,
  pingLabel,
  routePositionAt,
  routeSpeedKmh,
  routeTrailAt,
  sectorPath,
  trackerRowText,
} from "../shared/integrationDemo";

describe("demoClock", () => {
  it("is minutes after 09:00", () => {
    expect(demoClock(0)).toBe("09:00");
    expect(demoClock(27.25)).toBe("09:27");
    expect(demoClock(27.25, true)).toBe("09:27:15");
    expect(demoClock(DEMO_MINUTES)).toBe("09:40");
  });
});

describe("routes", () => {
  it("find where the vehicle is at a time", () => {
    expect(routePositionAt(DEMO_VEHICLE_ROUTE, 0)).toEqual({
      lat: -31.9937,
      lng: 115.7527,
    });
    // parked at the cul-de-sac from 27 to 29:15
    const a = routePositionAt(DEMO_VEHICLE_ROUTE, 27);
    const b = routePositionAt(DEMO_VEHICLE_ROUTE, 29.25);
    expect(metresBetween(a, b)).toBeLessThan(1);
    expect(routePositionAt(DEMO_VEHICLE_ROUTE, 999)).toEqual({
      lat: -32.0522,
      lng: 115.8826,
    });
  });
  it("builds the trail travelled so far ending at the current spot", () => {
    expect(routeTrailAt(DEMO_VEHICLE_ROUTE, 0)).toEqual([]);
    const t = routeTrailAt(DEMO_VEHICLE_ROUTE, 10);
    expect(t.length).toBeGreaterThan(2);
    expect(t[t.length - 1]).toEqual(routePositionAt(DEMO_VEHICLE_ROUTE, 10));
  });
  it("reports a sensible speed, and zero when parked", () => {
    expect(routeSpeedKmh(DEMO_VEHICLE_ROUTE, 10)).toBeGreaterThan(10);
    expect(routeSpeedKmh(DEMO_VEHICLE_ROUTE, 28)).toBe(0);
  });
  it("carries the box with the vehicle after they leave the cul-de-sac", () => {
    expect(
      metresBetween(
        routePositionAt(DEMO_BOX_ROUTE, 36),
        routePositionAt(DEMO_VEHICLE_ROUTE, 36)
      )
    ).toBeLessThan(1);
  });
});

describe("trackers", () => {
  it("offers a vehicle and items", () => {
    expect(DEMO_TRACKERS.filter(t => t.kind === "vehicle")).toHaveLength(1);
    expect(
      DEMO_TRACKERS.filter(t => t.kind === "item").length
    ).toBeGreaterThanOrEqual(2);
  });
  it("writes a draft row for a vehicle and an item", () => {
    expect(trackerRowText(DEMO_TRACKERS[0], 10)).toBe(
      `Vehicle tracker T-014 (${DEMO_REGO}) reported at 09:10.`
    );
    expect(trackerRowText(DEMO_TRACKERS[1], 10)).toBe(
      "Item tracker T-021 (black box) reported at 09:10."
    );
  });
  it("uses a made-up rego", () => {
    expect(DEMO_REGO).toBe("1DEM001");
  });
});

describe("phone pings", () => {
  it("are CAD wedges and LBS/SEEK arcs, never points", () => {
    for (const slot of [0, 1, 2]) {
      for (const p of demoPingsForSlot(slot)) {
        if (p.type === "CAD") expect(p.innerM).toBe(0);
        else expect(p.innerM).toBeGreaterThan(0);
        expect(p.outerM).toBeGreaterThan(p.innerM);
        expect(p.half).toBeGreaterThan(0);
      }
    }
  });
  it("puts the vehicle inside the pings of the first target", () => {
    for (const p of demoPingsForSlot(0)) {
      const g = bearingAndDistance(
        p.tower,
        routePositionAt(DEMO_VEHICLE_ROUTE, p.at)
      );
      expect(g.distance).toBeGreaterThanOrEqual(p.innerM);
      expect(g.distance).toBeLessThanOrEqual(p.outerM);
      const diff = Math.abs(((g.bearing - p.bearing + 540) % 360) - 180);
      expect(diff).toBeLessThanOrEqual(p.half);
    }
  });
  it("gives each later target its own pings, away from the first", () => {
    const a = demoPingsForSlot(1);
    const b = demoPingsForSlot(2);
    expect(a[0].id).not.toBe(b[0].id);
    expect(a[0].tower.lng).not.toBe(b[0].tower.lng);
  });
  it("shows only the newest ping so far", () => {
    const pings = demoPingsForSlot(0);
    expect(newestPing(pings, 4)).toBeNull();
    expect(newestPing(pings, 5)?.at).toBe(5);
    expect(newestPing(pings, 22)?.at).toBe(21);
    expect(newestPing(pings, 40)?.at).toBe(33);
  });
  it("draws a wedge from the cell site and an arc as a band", () => {
    const wedge = sectorPath(
      {
        tower: { lat: -32, lng: 115.8 },
        bearing: 90,
        half: 30,
        innerM: 0,
        outerM: 1000,
      },
      10
    );
    expect(wedge[0]).toEqual({ lat: -32, lng: 115.8 });
    expect(wedge).toHaveLength(12);
    for (const pt of wedge.slice(1))
      expect(metresBetween({ lat: -32, lng: 115.8 }, pt)).toBeCloseTo(1000, -1);
    const arc = sectorPath(
      {
        tower: { lat: -32, lng: 115.8 },
        bearing: 90,
        half: 30,
        innerM: 600,
        outerM: 1000,
      },
      10
    );
    expect(arc).toHaveLength(22);
    const dists = arc.map(p => metresBetween({ lat: -32, lng: 115.8 }, p));
    expect(Math.min(...dists)).toBeCloseTo(600, -1);
    expect(Math.max(...dists)).toBeCloseTo(1000, -1);
  });
  it("labels a ping with the SURNAME and the time", () => {
    expect(pingLabel("MERCER", { at: 27 })).toBe("MERCER 09:27");
  });
});

describe("demoSurname", () => {
  it("takes the capitalised surname from a registry name", () => {
    expect(demoSurname("Leila Samira HADDAD")).toBe("HADDAD");
    expect(demoSurname("Karim Elias NAJJAR (NAJJAR)")).toBe("NAJJAR");
    expect(demoSurname("Soo-Min Hana PARK")).toBe("PARK");
  });
  it("falls back to the last word in capitals", () => {
    expect(demoSurname("john smith")).toBe("SMITH");
    expect(demoSurname("")).toBe("");
  });
});

describe("cameras", () => {
  it("are one Clay and one T-Box, with addresses written in full", () => {
    expect(DEMO_CAMERAS.map(c => c.type).sort()).toEqual(["Clay", "T-Box"]);
    for (const c of DEMO_CAMERAS)
      expect(c.address).not.toMatch(/\b(St|Rd|Ave|Blvd|Ct)\b\.?,/);
  });
  it("move a car and a person across the picture as scripted", () => {
    const clay = DEMO_CAMERAS[0];
    expect(motionX(clay.car, 20)).toBeNull();
    expect(motionX(clay.car, 28)).toBeCloseTo(0.45);
    expect(motionX(clay.person, 27)).toBeNull();
    expect(motionX(clay.person, 27.5)).toBeGreaterThan(0.45);
    expect(motionX(clay.person, 28)).toBeNull(); // inside the house
    expect(motionX(clay.car, 31)).toBeNull(); // driven off
  });
  it("glow for a minute after each event", () => {
    const clay = DEMO_CAMERAS[0];
    expect(cameraIsLive(clay, 26)).toBe(false);
    expect(cameraIsLive(clay, 27.5)).toBe(true);
    expect(cameraIsLive(clay, 31)).toBe(false);
  });
  it("write a draft row naming the camera, address and what it saw", () => {
    const clay = DEMO_CAMERAS[0];
    expect(cameraRowText(clay, clay.events[2])).toBe(
      "Milestone camera Clay 1, 7 Banksia Court, BRENTWOOD: Person 1 enters the house."
    );
  });
});
