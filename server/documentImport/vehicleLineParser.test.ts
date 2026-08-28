import { describe, it, expect } from "vitest";
import { findVehicleLines, parseVehicleLine } from "./vehicleLineParser";

// The real VEHICLES cell text from the training fixture (see
// docxTableReader.test.ts) — two vehicles, blank-line separated, the second
// one a personalised plate with no trailing digits.
const VEHICLES_CELL =
  "1ABC123 (WA) 2022 black Toyota Landcruiser station sedan.\n\n" +
  "1KEEPUP (WA) 2023 black Yamaha YZF motorcycle.";

describe("findVehicleLines", () => {
  it("splits the fixture's two-vehicle cell into two confident entries", () => {
    const result = findVehicleLines(VEHICLES_CELL);
    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      registration: "1ABC123",
      state: "WA",
      year: "2022",
      colour: "Black",
      make: "Toyota",
      model: "Landcruiser",
      vehicleType: "station sedan",
      confident: true,
    });

    expect(result[1]).toMatchObject({
      registration: "1KEEPUP",
      state: "WA",
      year: "2023",
      colour: "Black",
      make: "Yamaha",
      model: "YZF",
      vehicleType: "Motorbike",
      confident: true,
    });
  });

  it("returns an empty array when no anchor is present", () => {
    expect(findVehicleLines("no vehicle described here")).toEqual([]);
  });
});

describe("parseVehicleLine", () => {
  it("parses just the first entry", () => {
    const result = parseVehicleLine(VEHICLES_CELL);
    expect(result).not.toBeNull();
    expect(result!.registration).toBe("1ABC123");
  });

  it("returns null when nothing matches", () => {
    expect(parseVehicleLine("nothing to see")).toBeNull();
  });

  it("leaves vehicleType blank and stays unconfident for an unrecognised type word", () => {
    const result = parseVehicleLine("XYZ789 (NSW) red Holden Commodore zonk");
    expect(result).not.toBeNull();
    expect(result!.vehicleType).toBe("");
    expect(result!.make).toBe("Holden");
    expect(result!.model).toBe("Commodore zonk");
    expect(result!.confident).toBe(true);
  });
});
