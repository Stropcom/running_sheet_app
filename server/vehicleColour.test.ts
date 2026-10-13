import { describe, expect, it } from "vitest";
import {
  lowerVehicleColour,
  lowercaseLeadingColour,
} from "../shared/vehicleColour";
import { formatIntelVehicle } from "../shared/addressFormat";
import {
  composeVehicle,
  composeVehicleTargetName,
} from "../client/src/lib/addressFormat";

describe("vehicle colour is always lower case", () => {
  it("lowerVehicleColour trims and lower-cases a Colour field", () => {
    expect(lowerVehicleColour("  White ")).toBe("white");
    expect(lowerVehicleColour("DARK BLUE")).toBe("dark blue");
    expect(lowerVehicleColour(null)).toBe("");
  });

  it("lowercaseLeadingColour handles an optional rego, shades and pairs", () => {
    expect(lowercaseLeadingColour("White Lexus NX350h")).toBe(
      "white Lexus NX350h"
    );
    expect(lowercaseLeadingColour("1ABC123 Dark Blue Toyota Hilux")).toBe(
      "1ABC123 dark blue Toyota Hilux"
    );
    expect(lowercaseLeadingColour("Black and Silver Ford Ranger")).toBe(
      "black and silver Ford Ranger"
    );
    expect(lowercaseLeadingColour("Silver")).toBe("silver");
  });

  it("leaves anything that doesn't open with a colour alone", () => {
    expect(lowercaseLeadingColour("Toyota Hilux")).toBe("Toyota Hilux");
    expect(lowercaseLeadingColour("Blackburn Road")).toBe("Blackburn Road");
    expect(lowercaseLeadingColour("1ABC123")).toBe("1ABC123");
    expect(lowercaseLeadingColour("")).toBe("");
  });

  it("composeVehicle writes the colour in lower case in V1F", () => {
    const v = composeVehicle({
      registration: "1tdm414",
      state: "WA",
      colour: "White",
      make: "Lexus",
      model: "NX350h",
      vehicleType: "station sedan",
    });
    expect(v.full).toBe(
      "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)"
    );
  });

  it("a vehicle target's name uses the lower-case colour too", () => {
    const t = composeVehicleTargetName({
      registration: "1abc123",
      state: "WA",
      colour: "Red",
      make: "Holden",
      model: "Commodore",
    });
    expect(t.name).toBe("1ABC123 red Holden Commodore");
  });

  it("the Intelligence folder shows the colour in lower case", () => {
    expect(
      formatIntelVehicle(
        "White Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)"
      )
    ).toBe("1TDM414 white Lexus NX350h station sedan");
    expect(
      formatIntelVehicle(
        "Vehicle 1TDM414",
        "Silver Ford Transit Van, bearing WA registration 1TDM414 (Vehicle 1TDM414)"
      )
    ).toBe("1TDM414 silver Ford Transit Van");
    expect(formatIntelVehicle("Vehicle 1TDM414")).toBe("1TDM414");
  });
});
