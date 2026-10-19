import { describe, expect, it } from "vitest";
import {
  chooseFlagMarker,
  markerFitsState,
  markerKind,
  type FlagMarkerCandidate,
} from "@shared/flagMarker";
import { locateTarget } from "@shared/targetPosition";
import { scanWalkEvents } from "@shared/walkEventPatterns";

const m = (
  id: number,
  over: Partial<FlagMarkerCandidate>
): FlagMarkerCandidate => ({
  id,
  lat: -32 - id / 1000,
  lng: 115.7,
  label: null,
  address: "15 Riverside Road",
  icon: "house_filled",
  operationId: 1,
  ...over,
});

// Newest first, as the markers arrive.
const BOAT = m(3, { icon: "boat", label: "Red vessel" });
const CAR = m(2, { icon: "sedan", label: "1FAT001" });
const HOUSE = m(1, { icon: "house_filled", label: "Left Bank Hotel" });

describe("markerKind", () => {
  it("reads the icon", () => {
    expect(markerKind("boat")).toBe("boat");
    expect(markerKind("boat_cruiser")).toBe("boat");
    expect(markerKind("sedan")).toBe("vehicle");
    expect(markerKind("police_car_top")).toBe("vehicle");
    expect(markerKind("house_filled")).toBe("place");
  });
  it("a rego-only label is a vehicle marker", () => {
    expect(markerKind(null, "1FAT001")).toBe("vehicle");
    expect(markerKind(null, "Left Bank Hotel")).toBe("place");
  });
});

describe("chooseFlagMarker — a car and a boat at the same address", () => {
  const both = [BOAT, CAR];

  it("one marker is simply that marker", () => {
    expect(chooseFlagMarker([BOAT], { state: "walking" })).toMatchObject({
      marker: BOAT,
      why: "only",
      ambiguous: false,
    });
    expect(chooseFlagMarker([], { state: "walking" })).toBeNull();
  });

  it("on foot from the car: the car's own marker, though the boat is newer", () => {
    expect(
      chooseFlagMarker(both, { state: "walking", rego: "1FAT001" })
    ).toMatchObject({ marker: CAR, why: "rego", ambiguous: false });
  });

  it("on a vessel: the boat marker", () => {
    expect(chooseFlagMarker(both, { state: "vessel" })).toMatchObject({
      marker: BOAT,
      why: "boat",
      ambiguous: false,
    });
    // even when the car marker is the newer one
    expect(chooseFlagMarker([CAR, BOAT], { state: "vessel" }).marker).toBe(
      BOAT
    );
  });

  it("in a vehicle with no rego marker: a vehicle marker, not the boat", () => {
    expect(chooseFlagMarker(both, { state: "vehicle" }).marker).toBe(CAR);
    expect(chooseFlagMarker(both, { state: "moving" }).marker).toBe(CAR);
  });

  it("inside or on foot with no vehicle: a place marker, not the car or boat", () => {
    expect(
      chooseFlagMarker([BOAT, CAR, HOUSE], { state: "inside" }).marker
    ).toBe(HOUSE);
    expect(
      chooseFlagMarker([BOAT, CAR, HOUSE], { state: "walking" }).marker
    ).toBe(HOUSE);
  });

  it("still tied: the newest, and it says so", () => {
    const two = [
      m(5, { icon: "house_filled" }),
      m(4, { icon: "house_outline" }),
    ];
    expect(chooseFlagMarker(two, { state: "inside" })).toMatchObject({
      marker: two[0],
      ambiguous: true,
    });
  });

  it("nothing of the right kind: the newest, flagged ambiguous", () => {
    expect(chooseFlagMarker([BOAT, CAR], { state: "inside" })).toMatchObject({
      marker: BOAT,
      why: "newest",
      ambiguous: true,
    });
  });

  it("a rego marker of another operation is not used", () => {
    const other = m(9, { icon: "sedan", label: "1FAT001", operationId: 2 });
    const r = chooseFlagMarker([BOAT, other], {
      state: "walking",
      rego: "1FAT001",
      operationId: 1,
    });
    expect(r?.marker).toBe(BOAT); // falls through to the kind rule (place → newest)
  });
});

describe("the on-foot flag carries the vehicle he left", () => {
  const rows = (...obs: string[]) =>
    obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

  it("departed on foot from the vehicle names that vehicle", () => {
    const scan = scanWalkEvents(
      rows(
        "Vehicle 1FAT001, HOGAN driver, arrived at 15 Riverside Road, EAST FREMANTLE WA (15 Riverside Road) and parked on the street.\n\nHOGAN exited the vehicle and walked along the boat jetty on the Swan River."
      )
    );
    const pos = locateTarget({
      token: "HOGAN",
      arrivals: [
        {
          rego: "1FAT001",
          names: "HOGAN",
          address: "15 Riverside Road",
          rowId: 1,
        },
      ],
      departures: [],
      walkIns: scan.walkIns,
      headingTo: scan.headingTo,
      placements: scan.placements,
    });
    expect(pos).toMatchObject({
      state: "walking",
      label: "departed on foot",
      place: "15 Riverside Road",
      rego: "1FAT001",
    });
  });
});

describe("markerFitsState", () => {
  it("a boat marker is never where someone in or walking to a car is", () => {
    expect(markerFitsState("boat", "vehicle")).toBe(false);
    expect(markerFitsState("boat", "walking")).toBe(false);
    expect(markerFitsState("boat", "vessel")).toBe(true);
  });
  it("a car marker is never where someone on a boat is", () => {
    expect(markerFitsState("vehicle", "vessel")).toBe(false);
    expect(markerFitsState("vehicle", "vehicle")).toBe(true);
    expect(markerFitsState("place", "vessel")).toBe(true);
    expect(markerFitsState("place", "inside")).toBe(true);
  });
});
