import { describe, expect, it } from "vitest";
import {
  composeRegistryVehicle,
  describeVehicleInText,
  driverIsTarget,
  driverVehiclesInText,
} from "./vehicleAutoAdd";

const HOGAN = { surname: "HOGAN", name: "Paul HOGAN, born 4 July 1957 (HOGAN)" };

describe("driverVehiclesInText — who is driving", () => {
  it("reads the driver written after a vehicle mention", () => {
    expect(
      driverVehiclesInText(
        "Vehicle 1TDM414, HOGAN driver and sole occupant, travelled on Leach Highway, FREMANTLE and continued via:"
      )
    ).toEqual([{ rego: "1TDM414", driverName: "HOGAN" }]);
    expect(
      driverVehiclesInText(
        "A white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414), Paul HOGAN (HOGAN) driver, CORNELL front passenger, arrived at 15 Riverside Road."
      )
    ).toEqual([{ rego: "1TDM414", driverName: "Paul HOGAN (HOGAN)" }]);
  });

  it("ignores passengers, unseen occupants and unnamed drivers", () => {
    expect(driverVehiclesInText("Vehicle 1TDM414, CORNELL driver, HOGAN front passenger, arrived at X.").map(d => d.driverName)).toEqual(["CORNELL"]);
    expect(driverVehiclesInText("Vehicle 1TDM414, unseen occupant/s, departed 27 Olding Way and continued via:")).toEqual([]);
    expect(driverVehiclesInText("Vehicle 1TDM414, male driver, arrived at X.")).toEqual([]);
    expect(driverVehiclesInText("Vehicle 1TDM414, UM1 driver, arrived at X.")).toEqual([]);
    expect(driverVehiclesInText("HOGAN walked to Vehicle 1TDM414 and entered.")).toEqual([]);
  });

  it("keeps each vehicle's own driver in a sentence with two", () => {
    const r = driverVehiclesInText(
      "Vehicle 1AAA111, HOGAN driver, arrived at X and Vehicle 2BBB222, CORNELL driver, parked at Y."
    );
    expect(r).toEqual([
      { rego: "1AAA111", driverName: "HOGAN" },
      { rego: "2BBB222", driverName: "CORNELL" },
    ]);
  });
});

describe("driverIsTarget — the driver is this registered person", () => {
  it("matches the surname in capitals with a compatible given name", () => {
    expect(driverIsTarget("HOGAN", HOGAN)).toBe(true);
    expect(driverIsTarget("Paul HOGAN (HOGAN)", HOGAN)).toBe(true);
    expect(driverIsTarget("P HOGAN", HOGAN)).toBe(true);
  });
  it("never matches a lower-case surname, another surname or a different person", () => {
    expect(driverIsTarget("hogan", HOGAN)).toBe(false);
    expect(driverIsTarget("CORNELL", HOGAN)).toBe(false);
    expect(driverIsTarget("Lawrence HOGAN", HOGAN)).toBe(false);
    expect(driverIsTarget("Paul HOGAN", { surname: null, name: "x" })).toBe(false);
  });
  it("does not fold in a different registered person with the same surname", () => {
    const park = { surname: "PARK", name: "Soo-Min Hana PARK (PARK)" };
    expect(driverIsTarget("Hana PARK", park, ["Hana PARK, born 1 May 1990 (PARK)"])).toBe(false);
    expect(driverIsTarget("Hana PARK", park, [])).toBe(true);
  });
});

describe("describeVehicleInText — what the row says about the vehicle", () => {
  it("reads colour, make, model and body type, with the model not taken for a plate", () => {
    expect(
      describeVehicleInText(
        "A blue Mercedes Benz C200, sedan, bearing WA registration 1FAB007 (Vehicle 1FAB007), parked in the driveway.",
        "1FAB007"
      )
    ).toEqual({ state: "WA", colour: "blue", make: "Mercedes Benz", model: "C200", vehicleType: "Sedan" });
    expect(
      describeVehicleInText(
        "HOGAN walked to a white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414), HOGAN driver, arrived.",
        "1TDM414"
      )
    ).toEqual({ state: "WA", colour: "white", make: "Lexus", model: "NX350h", vehicleType: "station sedan" });
  });

  it("reads the right vehicle in a list, and an interstate plate's state", () => {
    const text =
      "A white Lexus NX350h, bearing WA registration 1AAA111 (Vehicle 1AAA111), a grey Ford Ranger utility, bearing VIC registration TFG414 (Vehicle TFG414), parked.";
    expect(describeVehicleInText(text, "TFG414")).toEqual({ state: "VIC", colour: "grey", make: "Ford", model: "Ranger", vehicleType: "Utility" });
    expect(describeVehicleInText(text, "1AAA111")?.make).toBe("Lexus");
  });

  it("returns nothing when the row only names the rego", () => {
    expect(describeVehicleInText("Vehicle 1TDM414, HOGAN driver, arrived at X.", "1TDM414")).toBeNull();
    expect(describeVehicleInText("HOGAN walked to Vehicle 1TDM414 (Vehicle 1TDM414) and entered.", "1TDM414")).toBeNull();
  });

  it("fills only what is stated", () => {
    const only = describeVehicleInText("a black Toyota, bearing WA registration 1ABC234 (Vehicle 1ABC234)", "1ABC234");
    expect(only).toEqual({ state: "WA", colour: "black", make: "Toyota", model: "", vehicleType: "" });
  });
});

describe("composeRegistryVehicle", () => {
  it("composes the Add Target wording", () => {
    const e = composeRegistryVehicle(
      "1FAB007",
      { state: "WA", colour: "blue", make: "Mercedes Benz", model: "C200", vehicleType: "Sedan" },
      "x1"
    );
    expect(e.full).toBe("blue Mercedes Benz C200 Sedan, bearing WA registration 1FAB007 (Vehicle 1FAB007)");
    expect(e.short).toBe("Vehicle 1FAB007");
    expect(e.registration).toBe("1FAB007");
  });
  it("still files a vehicle the row never described", () => {
    const e = composeRegistryVehicle("1TDM414", null, "x2");
    expect(e.full).toBe("bearing WA registration 1TDM414 (Vehicle 1TDM414)");
    expect(e.colour).toBe("");
  });
});
