import { describe, expect, it } from "vitest";
import { fillRoute, parkingForVehicle } from "@shared/parkingRoute";

const ARRIVAL =
  "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at High Wycombe Bar and Grill, 1 Kalamunda Road, HIGH WYCOMBE WA.";
const WALK_IN =
  "DARYANI exited the vehicle, walked [route], entered High Wycombe Bar and Grill and continued out of sight.";
const WALK_AWAY =
  "DARYANI exited the vehicle and walked [route] towards [location].";

const routeForVehicle = (rego: string, texts: (string | null)[]) =>
  parkingForVehicle(rego, texts)?.walkIn ?? null;

describe("where the vehicle is parked", () => {
  it("reads the car park from the sentence after the arrival", () => {
    expect(
      routeForVehicle("1ARD64", [`${ARRIVAL} Parked in the car park.`])
    ).toBe("through the car park");
  });

  it("reads it when parking is in the arrival sentence itself", () => {
    expect(
      routeForVehicle("1ARD64", [
        "Vehicle 1ARD64 arrived at the Bar and parked in the car park.",
      ])
    ).toBe("through the car park");
  });

  it("works from live text that is not saved anywhere else", () => {
    expect(
      routeForVehicle("1ARD64", [
        "Earlier row.",
        `${ARRIVAL}\n\nParked in the carpark.`,
      ])
    ).toBe("through the car park");
  });

  it("ignores a car park that belongs to a different vehicle (this one is on the street)", () => {
    expect(
      routeForVehicle("1ARD64", [
        "Vehicle 2XYZ99 arrived at the shops. Parked in the car park.",
        `${ARRIVAL} Parked on the street.`,
      ])
    ).toBe("to");
  });

  it("matches the registration however it is spaced or cased", () => {
    expect(
      routeForVehicle("1ard 64", [
        "Vehicle 1ARD64 arrived at the shops. Parked in the car park.",
      ])
    ).toBe("through the car park");
  });

  it("does not treat a street called Car Park Road as a car park", () => {
    expect(
      routeForVehicle("1ARD64", [
        "Vehicle 1ARD64 arrived at 5 Car Park Road, PERTH WA.",
      ])
    ).toBeNull();
  });

  it("says nothing when the sheet doesn't say", () => {
    expect(routeForVehicle("1ARD64", [ARRIVAL])).toBeNull();
    expect(routeForVehicle("1ARD64", [])).toBeNull();
    expect(
      routeForVehicle("", [`${ARRIVAL} Parked in the car park.`])
    ).toBeNull();
  });
});

describe("fillRoute", () => {
  const texts = [`${ARRIVAL} Parked in the car park.`];

  it("fills Walked in and Walked away", () => {
    expect(fillRoute(WALK_IN, "1ARD64", texts)).toBe(
      "DARYANI exited the vehicle, walked through the car park, entered High Wycombe Bar and Grill and continued out of sight."
    );
    expect(fillRoute(WALK_AWAY, "1ARD64", texts)).toBe(
      "DARYANI exited the vehicle and walked through the car park towards [location]."
    );
  });

  it("leaves [route] as it was when nothing matches", () => {
    expect(fillRoute(WALK_IN, "1ARD64", [ARRIVAL])).toBe(WALK_IN);
    expect(fillRoute(WALK_IN, undefined, texts)).toBe(WALK_IN);
  });

  it("leaves text without a placeholder alone", () => {
    expect(fillRoute("Vehicle departed.", "1ARD64", texts)).toBe(
      "Vehicle departed."
    );
  });
});

describe("parked on the street", () => {
  const STREET_ARRIVAL =
    "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at Laika Coffee, 11 Lathlain Place, LATHLAIN WA (Laika Coffee) and parked on the street.";
  const IN =
    "DARYANI exited the vehicle, walked [route], entered Laika Coffee and continued out of sight.";
  const AWAY =
    "DARYANI exited the vehicle and walked [route] towards [location].";

  it("Walked in reads 'walked to, entered …'", () => {
    expect(fillRoute(IN, "1ARD64", [STREET_ARRIVAL])).toBe(
      "DARYANI exited the vehicle, walked to, entered Laika Coffee and continued out of sight."
    );
  });

  it("Walked away drops the placeholder rather than writing 'to towards'", () => {
    expect(fillRoute(AWAY, "1ARD64", [STREET_ARRIVAL])).toBe(
      "DARYANI exited the vehicle and walked towards [location]."
    );
  });

  it("reads the other ways of saying it", () => {
    for (const parked of [
      "parked on the road",
      "parked along the kerb",
      "parked on Smith Street",
      "parked on the verge",
    ])
      expect(
        fillRoute(IN, "1ARD64", [
          `Vehicle 1ARD64 arrived at the shops and ${parked}.`,
        ])
      ).toContain("walked to, entered");
  });

  it("is not a car park, and a street and a car park together are left for the officer", () => {
    expect(fillRoute(IN, "1ARD64", [STREET_ARRIVAL])).not.toContain("car park");
    expect(
      fillRoute(IN, "1ARD64", [
        "Vehicle 1ARD64 arrived at the shops and parked on the road near the car park.",
      ])
    ).toBe(IN);
  });
});

describe("only the vehicle's latest arrival counts", () => {
  const IN =
    "DARYANI exited the vehicle, walked [route], entered Laika Coffee and continued out of sight.";
  // From a real sheet: an earlier visit walked through a car park to the vehicle.
  const EARLIER =
    "DARYANI exited Boab Tavern and walked through the car park towards Vehicle 1ARD64. Vehicle 1ARD64 departed Boab Tavern and continued via:";
  const EARLIER_ARRIVAL =
    "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at Boab Tavern. Parked in the car park.";

  it("an earlier car park does not leak into a later arrival on the street", () => {
    expect(
      fillRoute(IN, "1ARD64", [
        EARLIER_ARRIVAL,
        EARLIER,
        "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at Laika Coffee and parked on the street.",
      ])
    ).toBe(
      "DARYANI exited the vehicle, walked to, entered Laika Coffee and continued out of sight."
    );
  });

  it("a later arrival that says nothing about parking leaves [route] for the officer", () => {
    expect(
      fillRoute(IN, "1ARD64", [
        EARLIER_ARRIVAL,
        "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at Laika Coffee.",
      ])
    ).toBe(IN);
  });

  it("a walk to the vehicle says nothing about where it is parked", () => {
    expect(fillRoute(IN, "1ARD64", [EARLIER])).toBe(IN);
  });
});
