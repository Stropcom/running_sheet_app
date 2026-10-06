import { describe, expect, it } from "vitest";
import { bracketVehicleReferences } from "@shared/vehicleEventPatterns";
import {
  VEHICLE_DEPART_PATTERN,
  matchVehicleArrival,
} from "@shared/vehicleEventPatterns";

describe("bracketVehicleReferences", () => {
  it("brackets a leading vehicle reference", () => {
    expect(
      bracketVehicleReferences(
        "Vehicle 1ORB419, BAIG driver and sole occupant, departed 18 Saffron Court and continued via:"
      )
    ).toBe(
      "(Vehicle 1ORB419), BAIG driver and sole occupant, departed 18 Saffron Court and continued via:"
    );
  });

  it("brackets a vehicle named later in the sentence", () => {
    expect(
      bracketVehicleReferences(
        "BAIG exited Blend Cafe and walked towards Vehicle 1ORB419."
      )
    ).toBe("BAIG exited Blend Cafe and walked towards (Vehicle 1ORB419).");
  });

  it("leaves already-bracketed references and plain 'vehicle' alone", () => {
    const s = "(Vehicle 1ORB419), BAIG exited the vehicle, entered X.";
    expect(bracketVehicleReferences(s)).toBe(s);
  });

  it("does not touch a word after Vehicle that is not a rego", () => {
    expect(bracketVehicleReferences("Vehicle departing now")).toBe(
      "Vehicle departing now"
    );
  });

  it("keeps the departure/arrival patterns matching the bracketed form", () => {
    const dep = bracketVehicleReferences(
      "Vehicle 1ORB419, BAIG driver and sole occupant, departed 18 Saffron Court and continued via:"
    );
    expect(dep.match(VEHICLE_DEPART_PATTERN)?.[1]).toBe("1ORB419");
    const arr = bracketVehicleReferences(
      "Vehicle 1ORB419, BAIG driver and sole occupant, arrived at 13 Denford Street"
    );
    expect(matchVehicleArrival(arr)?.rego).toBe("1ORB419");
  });
});
