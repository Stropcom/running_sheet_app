import { describe, expect, it } from "vitest";
import {
  pickSubjectCardKey,
  resolveTrackedTarget,
  subjectCompanions,
  trackedTargetCode,
} from "@shared/trackedTarget";
import {
  locateTargetFromPending,
  type TargetPosition,
} from "@shared/targetPosition";
import { scanWalkEvents } from "@shared/walkEventPatterns";
import {
  computePendingVehicleArrivals,
  computePendingVehicleDepartures,
} from "./db";

describe("resolveTrackedTarget", () => {
  it("reads a person from the linked target's surname", () => {
    expect(
      resolveTrackedTarget({
        title: "20261006 - 459 - ORCHARD (BAIG)",
        target: { targetType: "person", surname: "Baig" },
      })
    ).toEqual({ kind: "person", token: "BAIG" });
  });

  it("reads a person from the title when no target is linked", () => {
    expect(
      resolveTrackedTarget({ title: "20261006 - 459 - ORCHARD (BAIG)" })
    ).toEqual({ kind: "person", token: "BAIG" });
  });

  it("reads a vehicle from the linked target's registration", () => {
    expect(
      resolveTrackedTarget({
        title: "x",
        target: { targetType: "vehicle", vehRegistration: "e426 hod" },
      })
    ).toEqual({ kind: "vehicle", rego: "E426HOD" });
  });

  it("reads a vehicle from the title bracket the app writes", () => {
    const t = {
      title: "20261009 - 12 - MECHANICAL (E426HOD WHITE TOYOTA CAMRY SEDAN)",
    };
    expect(resolveTrackedTarget(t)).toEqual({
      kind: "vehicle",
      rego: "E426HOD",
    });
    expect(
      resolveTrackedTarget({
        ...t,
        target: { targetType: "vehicle", vehRegistration: "" },
      })
    ).toEqual({ kind: "vehicle", rego: "E426HOD" });
  });

  it("is a location for a location target, and null with nothing to track", () => {
    expect(
      resolveTrackedTarget({
        title: "x (SSP MECHANICAL)",
        target: { targetType: "location" },
      })
    ).toEqual({ kind: "location" });
    expect(resolveTrackedTarget({ title: "no bracket" })).toBeNull();
    expect(resolveTrackedTarget({ title: "x (Smith Street)" })).toBeNull();
  });

  it("exposes the code a target is named by", () => {
    expect(trackedTargetCode({ kind: "person", token: "BAIG" })).toBe("BAIG");
    expect(trackedTargetCode({ kind: "vehicle", rego: "E426HOD" })).toBe(
      "E426HOD"
    );
    expect(trackedTargetCode({ kind: "location" })).toBeNull();
    expect(trackedTargetCode(null)).toBeNull();
  });
});

describe("pickSubjectCardKey / subjectCompanions", () => {
  const cards = [
    { key: "veh-E426HOD", holds: ["JONES"], latestRowId: 4 },
    { key: "dep-E426HOD", holds: ["JONES"], latestRowId: 8 },
    { key: "veh-1ABC123", holds: ["SMITH"], latestRowId: 9 },
    { key: "foot-A", holds: ["BAIG"], latestRowId: 7 },
  ];
  it("holds a vehicle target in its own newest card", () => {
    expect(
      pickSubjectCardKey(cards, { kind: "vehicle", rego: "E426HOD" })
    ).toBe("dep-E426HOD");
    expect(
      pickSubjectCardKey(cards, { kind: "vehicle", rego: "ZZZ999" })
    ).toBeNull();
  });
  it("holds a person target in the card naming him", () => {
    expect(pickSubjectCardKey(cards, { kind: "person", token: "BAIG" })).toBe(
      "foot-A"
    );
  });
  it("has no card for a location", () => {
    expect(pickSubjectCardKey(cards, { kind: "location" })).toBeNull();
  });
  it("lists occupants with a vehicle and everyone but him with a person", () => {
    const v = { kind: "vehicle", rego: "E426HOD" } as const;
    expect(subjectCompanions(["JONES"], v)).toEqual(["JONES"]);
    expect(
      subjectCompanions(["BAIG", "JORDAN"], { kind: "person", token: "BAIG" })
    ).toEqual(["JORDAN"]);
  });
});

// Reads a whole sheet the way the server does, then locates the target.
function locateSubject(
  subject: Parameters<typeof locateTargetFromPending>[0]["subject"],
  ...obs: string[]
): TargetPosition | null {
  const rows = obs.map((observation, i) => ({
    id: i + 1,
    sheetId: 1,
    observation,
  }));
  const walk = scanWalkEvents(rows);
  return locateTargetFromPending({
    subject,
    arrivals: computePendingVehicleArrivals(rows),
    departures: computePendingVehicleDepartures(rows),
    walkIns: walk.walkIns,
    headingTo: walk.headingTo,
    placements: walk.placements,
    extractNames: d =>
      d
        .replace(/\b(?:driver|sole occupant|front passenger|passenger)\b/gi, "")
        .replace(/\band\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
  });
}

describe("locating a vehicle target", () => {
  const v = { kind: "vehicle", rego: "E426HOD" } as const;
  const parked =
    "Vehicle E426HOD, JONES driver and sole occupant, arrived at SSP Mechanical and parked.";

  it("is parked at the address it arrived at, with its occupant", () => {
    const pos = locateSubject(v, parked);
    expect(pos).toMatchObject({
      state: "vehicle",
      label: "parked",
      rego: "E426HOD",
    });
    expect(pos?.place).toMatch(/SSP Mechanical/i);
    expect(pos?.people[0]).toBe("E426HOD");
    expect(pos?.people.join(" ")).toMatch(/JONES/);
  });

  it("is not located when the vehicle is not in the rows", () => {
    expect(
      locateSubject(
        v,
        "Vehicle 1ABC123, SMITH driver and sole occupant, arrived at 5 Smith Street and parked."
      )
    ).toBeNull();
  });

  it("has no position for a location target", () => {
    expect(locateSubject({ kind: "location" }, parked)).toBeNull();
  });

  it("still locates a person target by surname", () => {
    const pos = locateSubject({ kind: "person", token: "JONES" }, parked);
    expect(pos?.place).toMatch(/SSP Mechanical/i);
  });

  it("the older token form still works", () => {
    const rows = [{ id: 1, sheetId: 1, observation: parked }];
    const walk = scanWalkEvents(rows);
    const pos = locateTargetFromPending({
      token: "jones",
      arrivals: computePendingVehicleArrivals(rows),
      departures: [],
      walkIns: walk.walkIns,
      headingTo: walk.headingTo,
      placements: walk.placements,
      extractNames: d => d,
    });
    expect(pos?.place).toMatch(/SSP Mechanical/i);
  });
});
