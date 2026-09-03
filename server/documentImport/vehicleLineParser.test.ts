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

  // Regression: all three of these used to collapse into one garbage
  // "vehicle" — the comma before vehicle 2's bracket broke the anchor
  // entirely, and vehicle 3 has no "(STATE)" bracket at all, so both
  // vanished into vehicle 1's description instead of being recognised as
  // separate entries.
  it("splits three vehicles: bracketed, comma-before-bracket, and no bracket at all", () => {
    const text =
      "1KINGZ (WA) 2021 white BMW X5 4WD\n\n" +
      "SLICK1, (WA) 2019 black Audi RS3 hatch\n\n" +
      "1FAD378 red Ford Ranger utility";
    const result = findVehicleLines(text);
    expect(result).toHaveLength(3);

    expect(result[0]).toMatchObject({
      registration: "1KINGZ",
      state: "WA",
      year: "2021",
      colour: "White",
      make: "BMW",
      model: "X5",
      vehicleType: "4WD",
      confident: true,
    });

    expect(result[1]).toMatchObject({
      registration: "SLICK1",
      state: "WA",
      year: "2019",
      colour: "Black",
      make: "Audi",
      model: "RS3",
      vehicleType: "hatch",
      confident: true,
    });

    // No "(STATE)" bracket in the source text — a standard-shaped rego
    // still anchors on its own, but state is left blank rather than
    // guessed, same as every other field this parser can't find.
    expect(result[2]).toMatchObject({
      registration: "1FAD378",
      state: "",
      year: "",
      colour: "Red",
      make: "Ford",
      model: "Ranger",
      vehicleType: "Utility",
      confident: true,
    });
  });

  it("doesn't false-positive a rego-shaped word inside another vehicle's own description", () => {
    // "1ABC123" only ever appears mid-sentence, never at the start of its
    // own line — should NOT be treated as a second vehicle.
    const text =
      "SLICK1 (WA) 2019 black Audi RS3 hatch, previously seen near 1ABC123 Smith Street.";
    const result = findVehicleLines(text);
    expect(result).toHaveLength(1);
    expect(result[0].registration).toBe("SLICK1");
  });

  // Regression: an interstate/fleet-style registration with an internal
  // hyphen ("CW-1212") anchored on just "1212", silently dropping the
  // "CW-" prefix -- the anchor's own token pattern had no way to include a
  // hyphen. Found against a real training document (CROSSWIND) that
  // deliberately used this format to test registration handling.
  it("keeps a hyphenated registration's own prefix instead of anchoring on the digits alone", () => {
    const result = findVehicleLines(
      "CW-1212 (NSW) 2019 white Toyota HiAce van."
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      registration: "CW-1212",
      state: "NSW",
      make: "Toyota",
      model: "HiAce van",
    });
  });

  // Regression: a PDF-import artifact can land an entirely unrelated
  // sentence right after a vehicle's own description in the same text,
  // separated by nothing but the vehicle's own closing "." and a single
  // space (see pdfTextReader.ts's own regression test for how that
  // happens — a table row with two value columns, neither a recognised
  // label on its own). Without a sentence-boundary cutoff, that trailing
  // sentence has no vehicle anchor of its own to stop at and gets
  // swallowed whole into the model field.
  it("stops a vehicle's own description at its first sentence-ending period, not at the next anchor or end of text", () => {
    const text =
      "1TLN902 (WA) 2023 black Lexus NX350h wagon. Current Address: 41 Arbour Street, COMO WA 6152.";
    const result = findVehicleLines(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      registration: "1TLN902",
      colour: "Black",
      make: "Lexus",
      model: "NX350h",
      confident: true,
      raw: "1TLN902 (WA) 2023 black Lexus NX350h wagon.",
    });
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
