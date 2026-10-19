import { describe, expect, it } from "vitest";
import { matchVehicleSighting } from "@shared/vehicleEventPatterns";
import { isReadAsMovement, scanWalkEvents } from "@shared/walkEventPatterns";
import { computePendingVehicleDepartures } from "./db";

const rows = (...obs: string[]) =>
  obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

const ENTERED =
  "HOGAN entered 27 Olding Way, MELVILLE WA (27 Olding Way) and continued out of sight.";
const DEPARTED =
  "Vehicle 1FAT001, unseen occupant/s, departed 27 Olding Way and continued via:";
const SIGHTING =
  "Vehicle 1FAT001, HOGAN driver and sole occupant, travelled on Leach Highway, FREMANTLE and continued via:";

describe("matchVehicleSighting", () => {
  it("reads who is in a vehicle on the move and where", () => {
    expect(matchVehicleSighting(SIGHTING)).toEqual({
      rego: "1FAT001",
      occupantDesc: "HOGAN driver and sole occupant",
      route: "Leach Highway, FREMANTLE",
    });
  });

  it("also reads the bracket form and a full stop ending", () => {
    expect(
      matchVehicleSighting(
        "(Vehicle 1FAT001) HOGAN driver, travelled along Leach Highway."
      )
    ).toMatchObject({ rego: "1FAT001", route: "Leach Highway" });
  });

  it("leaves departures and arrivals to their own rules", () => {
    expect(matchVehicleSighting(DEPARTED)).toBeNull();
    expect(
      matchVehicleSighting(
        "Vehicle 1FAT001, HOGAN driver, travelled on Leach Highway and arrived at 5 Smith Street"
      )
    ).toBeNull();
    expect(matchVehicleSighting("HOGAN travelled on Leach Highway")).toBeNull();
  });

  it("counts as a read movement, so the tracker doesn't warn", () => {
    expect(isReadAsMovement(SIGHTING)).toBe(true);
  });
});

describe("a departed vehicle whose occupants are then identified", () => {
  it("learns who is in it and where it is, until it arrives", () => {
    const pending = computePendingVehicleDepartures(rows(DEPARTED, SIGHTING));
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      rego: "1FAT001",
      occupantDesc: "HOGAN driver and sole occupant",
      fromAddress: "27 Olding Way",
      via: "Leach Highway, FREMANTLE",
      viaRowId: 2,
    });
  });

  it("keeps 'unseen' when the sighting names nobody", () => {
    const pending = computePendingVehicleDepartures(
      rows(
        DEPARTED,
        "Vehicle 1FAT001, unseen occupant/s, travelled on Leach Highway, FREMANTLE and continued via:"
      )
    );
    expect(pending[0].occupantDesc).toBe("unseen occupant/s");
    expect(pending[0].via).toBe("Leach Highway, FREMANTLE");
  });

  it("is gone once it arrives, and a sighting before any departure is ignored", () => {
    expect(
      computePendingVehicleDepartures(
        rows(
          DEPARTED,
          SIGHTING,
          "Vehicle 1FAT001, HOGAN driver and sole occupant, arrived at 5 Smith Street, FREMANTLE WA (5 Smith Street)"
        )
      )
    ).toEqual([]);
    expect(computePendingVehicleDepartures(rows(SIGHTING))).toEqual([]);
  });
});

describe("scanWalkEvents — identified in the vehicle", () => {
  it("takes him out of the place he was inside and puts him in the vehicle", () => {
    const before = scanWalkEvents(rows(ENTERED, DEPARTED));
    // Unseen occupants: nothing says he left the address.
    expect(before.walkIns).toMatchObject([{ location: "27 Olding Way" }]);

    const after = scanWalkEvents(rows(ENTERED, DEPARTED, SIGHTING));
    expect(after.walkIns).toEqual([]);
    expect(after.placements).toMatchObject([
      {
        name: "HOGAN",
        rego: "1FAT001",
        inside: true,
        via: "Leach Highway, FREMANTLE",
      },
    ]);
  });

  it("doesn't move anyone for a sighting that names nobody", () => {
    const scan = scanWalkEvents(
      rows(
        ENTERED,
        DEPARTED,
        "Vehicle 1FAT001, unseen occupant/s, travelled on Leach Highway, FREMANTLE and continued via:"
      )
    );
    expect(scan.walkIns).toMatchObject([{ location: "27 Olding Way" }]);
  });
});
