import { describe, expect, it } from "vitest";
import {
  matchUnattendedVehicles,
  matchVehicleArrival,
} from "../shared/vehicleEventPatterns";
import { computePendingVehicleArrivals } from "./db";
import { extractOccupantNames } from "../shared/occupantNames";

const ROW =
  "Vehicle 1EMB303 parked and unattended on Murray Street, PERTH, in the vicinity of Dental Boutique Perth.";

describe("matchUnattendedVehicles", () => {
  it("reads the rego and the place after 'in the vicinity of'", () => {
    expect(matchUnattendedVehicles(ROW)).toEqual({
      regos: ["1EMB303"],
      address: "Dental Boutique Perth",
    });
  });

  it("reads a driveway address and every vehicle on the row", () => {
    const text =
      "A Blue Volvo XC60 (Vehicle 1SEA310) and a White BMW (Vehicle 1BLM92), parked and unattended in the driveway at 12 Marine Parade.";
    expect(matchUnattendedVehicles(text)).toEqual({
      regos: ["1SEA310", "1BLM92"],
      address: "12 Marine Parade",
    });
  });

  it("prefers the bracket short form of a first-mention place", () => {
    const text =
      "Vehicle 1EMB303 parked and unattended near Dental Boutique Perth, 634 Murray Street, WEST PERTH WA (Dental Boutique Perth).";
    expect(matchUnattendedVehicles(text)?.address).toBe(
      "Dental Boutique Perth"
    );
  });

  it("reads nothing without a place, without a plate, or without 'unattended'", () => {
    expect(
      matchUnattendedVehicles(
        "Vehicle 1EMB303 parked and unattended on Murray Street, PERTH."
      )
    ).toBeNull();
    expect(
      matchUnattendedVehicles(
        "Vehicle parked and unattended at 12 Smith Street."
      )
    ).toBeNull();
    expect(
      matchUnattendedVehicles("Vehicle 1EMB303 parked at 12 Smith Street.")
    ).toBeNull();
  });

  it("is still not an arrival (nobody was seen arriving)", () => {
    expect(matchVehicleArrival(ROW)).toBeNull();
  });
});

describe("computePendingVehicleArrivals with an unattended vehicle", () => {
  const rows = (...obs: string[]) =>
    obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

  it("lists it as parked at the place, flagged unattended, nobody seen in it", () => {
    const [a] = computePendingVehicleArrivals(rows(ROW));
    expect(a).toMatchObject({
      rego: "1EMB303",
      address: "Dental Boutique Perth",
      unattended: true,
      rowId: 1,
    });
    expect(extractOccupantNames(a.occupantDesc)).toBe("");
  });

  it("drops it once the vehicle departs", () => {
    expect(
      computePendingVehicleArrivals(
        rows(
          ROW,
          "Vehicle 1EMB303, SANTOS driver and sole occupant, departed Dental Boutique Perth and continued via:"
        )
      )
    ).toEqual([]);
  });

  it("a real arrival is not flagged unattended", () => {
    const [a] = computePendingVehicleArrivals(
      rows(
        "Vehicle 1ABC123, SANTOS driver and sole occupant, arrived at Dental Boutique Perth."
      )
    );
    expect(a.unattended).toBeUndefined();
  });
});
