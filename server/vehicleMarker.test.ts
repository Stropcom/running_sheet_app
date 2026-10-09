import { describe, expect, it } from "vitest";
import { attachVehicleMarkers, findVehicleMarker } from "@shared/vehicleMarker";
import { locateTarget } from "@shared/targetPosition";
import { scanWalkEvents } from "@shared/walkEventPatterns";
import {
  computePendingVehicleArrivals,
  computePendingVehicleDepartures,
} from "./db";

const marker = (
  id: number,
  label: string | null,
  operationId: number | null = 1,
  address:
    | string
    | null = "170 The Esplanade, SCARBOROUGH WA (170 The Esplanade)"
) => ({ id, label, lat: -31.9 - id / 1000, lng: 115.7, address, operationId });

describe("findVehicleMarker", () => {
  it("finds the marker labelled with the rego, ignoring case and spaces", () => {
    expect(findVehicleMarker([marker(1, "1fac 488")], "1FAC488", 1)?.id).toBe(
      1
    );
    expect(
      findVehicleMarker([marker(1, "Vehicle 1FAC488")], "1FAC488", 1)?.id
    ).toBe(1);
  });
  it("ignores other vehicles, unlabelled markers and other operations", () => {
    expect(findVehicleMarker([marker(1, "1FAC489")], "1FAC488", 1)).toBeNull();
    expect(findVehicleMarker([marker(1, null)], "1FAC488", 1)).toBeNull();
    expect(
      findVehicleMarker([marker(1, "1FAC488", 2)], "1FAC488", 1)
    ).toBeNull();
  });
  it("prefers the sheet's own operation over one with none", () => {
    const m = [marker(1, "1FAC488", null), marker(2, "1FAC488", 1)];
    expect(findVehicleMarker(m, "1FAC488", 1)?.id).toBe(2);
  });
  it("attaches only to placements in a vehicle", () => {
    const out = attachVehicleMarkers(
      [
        { name: "RAHMAN", rego: "1FAC488" },
        { name: "EVANS", rego: "" },
      ],
      [marker(1, "1FAC488")],
      1
    );
    expect(out[0].vehicleMarker?.id).toBe(1);
    expect(out[1].vehicleMarker).toBeUndefined();
  });
});

describe("locateTarget — a vehicle with a marker is at its marker", () => {
  const base = {
    token: "RAHMAN",
    arrivals: [],
    departures: [],
    walkIns: [],
    headingTo: [],
  };
  const vm = {
    lat: -31.91,
    lng: 115.7,
    address: "170 The Esplanade, SCARBOROUGH WA (170 The Esplanade)",
  };

  it("uses the marker when the vehicle has no arrival or departure row", () => {
    const pos = locateTarget({
      ...base,
      placements: [
        {
          name: "RAHMAN",
          rego: "1FAC488",
          rowId: 3,
          inside: true,
          at: "The Lookout Bar Bowling Bites",
          vehicleMarker: vm,
        },
      ],
    });
    expect(pos).toMatchObject({
      place: "170 The Esplanade",
      state: "vehicle",
      marker: { lat: -31.91, lng: 115.7 },
      placeIsEstimate: false,
    });
  });

  it("falls back to where he was last logged, marked as an estimate", () => {
    const pos = locateTarget({
      ...base,
      placements: [
        {
          name: "RAHMAN",
          rego: "1FAC488",
          rowId: 3,
          inside: true,
          at: "The Lookout Bar Bowling Bites",
        },
      ],
    });
    expect(pos).toMatchObject({
      place: "The Lookout Bar Bowling Bites",
      placeIsEstimate: true,
    });
    expect(pos?.marker).toBeUndefined();
  });

  it("logged movement beats the marker: an arrival elsewhere wins", () => {
    const pos = locateTarget({
      ...base,
      arrivals: [
        {
          rego: "1FAC488",
          names: "RAHMAN",
          address: "8 Grace Street",
          rowId: 5,
        },
      ],
      placements: [
        {
          name: "RAHMAN",
          rego: "1FAC488",
          rowId: 3,
          inside: true,
          vehicleMarker: vm,
        },
      ],
    });
    expect(pos).toMatchObject({ place: "8 Grace Street", state: "vehicle" });
    expect(pos?.marker).toBeUndefined();
  });

  it("logged movement beats the marker: a departure keeps its own origin", () => {
    const pos = locateTarget({
      ...base,
      departures: [
        {
          rego: "1FAC488",
          names: "RAHMAN",
          fromAddress: "170 The Esplanade",
          rowId: 4,
        },
      ],
      placements: [
        {
          name: "RAHMAN",
          rego: "1FAC488",
          rowId: 3,
          inside: true,
          vehicleMarker: vm,
        },
      ],
    });
    expect(pos).toMatchObject({ place: "170 The Esplanade", state: "moving" });
    expect(pos?.marker).toBeUndefined();
  });
});

describe("the whole journey: marker, then departure, then arrival elsewhere", () => {
  const sheet = [
    "RAHMAN, EVANS and TAYLOR entered a red Ford Ranger Utility, bearing WA registartion 1FAC488 (Vehicle 1FAC488).",
    "Vehicle 1FAC488, RAHMAN, EVANS, TAYLOR, departed 170 The Esplanade and continued via:",
    "Vehicle 1FAC488, RAHMAN, EVANS, TAYLOR, arrived at 8 Grace Street, SCARBOROUGH WA (8 Grace Street) and parked in the driveway.",
  ].map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));
  const vm = {
    lat: 1,
    lng: 2,
    address: "170 The Esplanade, SCARBOROUGH WA (170 The Esplanade)",
  };

  const locateAt = (n: number) => {
    const rows = sheet.slice(0, n);
    const walk = scanWalkEvents(rows);
    return locateTarget({
      token: "RAHMAN",
      arrivals: computePendingVehicleArrivals(rows as any).map((a: any) => ({
        rego: a.rego,
        names: "RAHMAN, EVANS, TAYLOR",
        address: a.address,
        rowId: a.rowId,
      })),
      departures: computePendingVehicleDepartures(rows as any).map(
        (d: any) => ({
          rego: d.rego,
          names: "RAHMAN, EVANS, TAYLOR",
          fromAddress: d.fromAddress,
          rowId: d.rowId,
        })
      ),
      walkIns: walk.walkIns,
      headingTo: walk.headingTo,
      placements: walk.placements.map(p =>
        p.rego ? { ...p, vehicleMarker: vm } : p
      ),
    });
  };

  it("in the vehicle with no movement logged: at its marker", () => {
    expect(locateAt(1)).toMatchObject({
      place: "170 The Esplanade",
      marker: { lat: 1, lng: 2 },
    });
  });
  it("after it departs: at the place it left", () => {
    expect(locateAt(2)).toMatchObject({
      place: "170 The Esplanade",
      state: "moving",
    });
    expect(locateAt(2)?.marker).toBeUndefined();
  });
  it("after it arrives at 8 Grace Street: there, not on the marker", () => {
    expect(locateAt(3)).toMatchObject({
      place: "8 Grace Street",
      state: "vehicle",
    });
    expect(locateAt(3)?.marker).toBeUndefined();
  });
});

describe("a vehicle that arrives and goes out of sight with its occupants", () => {
  const row = {
    id: 1,
    sheetId: 1,
    observation:
      "Vehicle 1FAC488, RAHMAN driver, EVANS front passenger, TAYLOR rear passenger, arrived at Rendezvous Hotel Perth Scarborough, 148 The Esplanade, SCARBOROUGH WA (Rendezvous Hotel Perth Scarborough), entered the car park and continued out of sight.",
  };
  it("puts the target out of sight at that address, with his companions", () => {
    const walk = scanWalkEvents([row]);
    const pos = locateTarget({
      token: "RAHMAN",
      arrivals: computePendingVehicleArrivals([row] as any).map((a: any) => ({
        rego: a.rego,
        names: "RAHMAN, EVANS, TAYLOR",
        address: a.address,
        rowId: a.rowId,
        outOfSight: a.outOfSight,
      })),
      departures: [],
      walkIns: walk.walkIns,
      headingTo: walk.headingTo,
      placements: walk.placements,
    });
    expect(pos).toMatchObject({
      place: "Rendezvous Hotel Perth Scarborough",
      state: "oos",
      label: "out of sight",
      people: ["RAHMAN", "EVANS", "TAYLOR"],
    });
  });
});
