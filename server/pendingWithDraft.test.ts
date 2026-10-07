import { describe, expect, it } from "vitest";
import {
  computePendingVehicleArrivals,
  computePendingVehicleDepartures,
} from "./db";
import { scanWalkEvents } from "@shared/walkEventPatterns";

const row = (id: number, observation: string) => ({
  id,
  sheetId: 1,
  observation,
});

describe("a draft read as the newest row", () => {
  const saved = [
    row(
      1,
      "Vehicle 1ORB419, BAIG driver and sole occupant, arrived at 24 Harris Street and parked in the street."
    ),
    row(
      2,
      "BAIG exited the vehicle, entered 24 Harris Street and continued out of sight."
    ),
  ];

  it("saved rows alone leave him inside the address", () => {
    expect(scanWalkEvents(saved).walkIns).toMatchObject([
      { location: "24 Harris Street" },
    ]);
  });

  it("a typed walk back to the vehicle puts him out of the address", () => {
    const draft = row(
      Number.MAX_SAFE_INTEGER,
      "BAIG exited 24 Harris Street and walked towards Vehicle 1ORB419."
    );
    expect(scanWalkEvents([...saved, draft]).walkIns).toEqual([]);
  });

  it("two sentences in one draft are read in order", () => {
    const draft = row(
      Number.MAX_SAFE_INTEGER,
      "BAIG exited 24 Harris Street and walked towards Vehicle 1ORB419.\n\nVehicle 1ORB419, BAIG driver and sole occupant, departed 24 Harris Street and continued via:"
    );
    const all = [...saved, draft];
    expect(scanWalkEvents(all).walkIns).toEqual([]);
    expect(computePendingVehicleDepartures(all)).toMatchObject([
      { rego: "1ORB419" },
    ]);
    expect(computePendingVehicleArrivals(all)).toEqual([]);
  });

  it("a typed arrival then an exit-and-walk reads in order", () => {
    const draft = row(
      Number.MAX_SAFE_INTEGER,
      "Vehicle 1ORB419, BAIG driver and sole occupant, arrived at 15 Leach Avenue and parked in the car park.\n\nBAIG exited the vehicle, walked to and entered 21 Leach Avenue and continued out of sight."
    );
    const r = scanWalkEvents([draft]);
    expect(r.walkIns).toMatchObject([{ location: "21 Leach Avenue" }]);
    expect(computePendingVehicleArrivals([draft])).toMatchObject([
      { rego: "1ORB419" },
    ]);
  });
});

describe("arrival rows that continue out of sight", () => {
  it("flags an arrival that says it continued out of sight", () => {
    const [a] = computePendingVehicleArrivals([
      row(
        1,
        "Vehicle 1HIB84, BAIG driver and sole occupant, arrived at 77 Reynolds Rd and continued out of sight."
      ),
    ]);
    expect(a.rego).toBe("1HIB84");
    expect(a.outOfSight).toBe(true);
  });

  it("does not flag an ordinary arrival", () => {
    const [a] = computePendingVehicleArrivals([
      row(
        1,
        "Vehicle 1HIB84, BAIG driver and sole occupant, arrived at 77 Reynolds Rd and parked in the street."
      ),
    ]);
    expect(a.outOfSight).toBe(false);
  });
});
