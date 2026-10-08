import { describe, expect, it } from "vitest";
import { attachVehicleMarkers, findVehicleMarker } from "@shared/vehicleMarker";
import { locateTarget } from "@shared/targetPosition";

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

  it("also uses the marker for a vehicle that has a logged arrival", () => {
    const pos = locateTarget({
      ...base,
      arrivals: [
        {
          rego: "1FAC488",
          names: "RAHMAN",
          address: "170 The Esplanade",
          rowId: 2,
        },
      ],
      placements: [
        {
          name: "RAHMAN",
          rego: "1FAC488",
          rowId: 2,
          inside: true,
          vehicleMarker: vm,
        },
      ],
    });
    expect(pos).toMatchObject({
      state: "vehicle",
      marker: { lat: -31.91, lng: 115.7 },
    });
  });
});
