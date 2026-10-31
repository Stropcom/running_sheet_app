import { describe, expect, it } from "vitest";
import { fillRoute, routeForVehicle } from "@shared/parkingRoute";

const ARRIVAL =
  "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at High Wycombe Bar and Grill, 1 Kalamunda Road, HIGH WYCOMBE WA.";
const WALK_IN =
  "DARYANI exited the vehicle, walked [route], entered High Wycombe Bar and Grill and continued out of sight.";
const WALK_AWAY =
  "DARYANI exited the vehicle and walked [route] towards [location].";

describe("routeForVehicle", () => {
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

  it("ignores a car park that belongs to a different vehicle", () => {
    expect(
      routeForVehicle("1ARD64", [
        "Vehicle 2XYZ99 arrived at the shops. Parked in the car park.",
        `${ARRIVAL} Parked on the street.`,
      ])
    ).toBeNull();
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
