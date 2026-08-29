import { describe, it, expect } from "vitest";
import { parseAddressLine, findAddressLines } from "./addressLineParser";

describe("parseAddressLine", () => {
  it("parses a simple house/street/suburb/state/postcode address", () => {
    const result = parseAddressLine("3 Appletree Place, Woodvale WA 6026");
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      houseNo: "3",
      unitNo: "",
      streetName: "Appletree",
      streetType: "Place",
      suburb: "WOODVALE",
      state: "WA",
      confident: true,
    });
  });

  it("parses a multi-word street name", () => {
    const result = parseAddressLine("58 Explorer Street, Yanchep WA 6035");
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      houseNo: "58",
      streetName: "Explorer",
      streetType: "Street",
      suburb: "YANCHEP",
      state: "WA",
      confident: true,
    });
  });

  it("parses a multi-word highway type without a postcode", () => {
    const result = parseAddressLine(
      "2299 Great Northern Highway, Bullsbrook WA"
    );
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      houseNo: "2299",
      streetName: "Great Northern",
      streetType: "Highway",
      suburb: "BULLSBROOK",
      state: "WA",
      confident: true,
    });
  });

  it("finds an address embedded mid-sentence in free text", () => {
    const text =
      "...held at EES Shipping (EES Shipment S00084692) 16 Baling Street, Cockburn Central WA was searched...";
    const matches = findAddressLines(text);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]).toMatchObject({
      houseNo: "16",
      streetName: "Baling",
      streetType: "Street",
      suburb: "COCKBURN CENTRAL",
      state: "WA",
      confident: true,
    });
  });

  it("returns null when nothing address-shaped is present", () => {
    expect(parseAddressLine("no address here at all")).toBeNull();
  });

  it("splits a unit/house token", () => {
    const result = parseAddressLine("4/12 Smith Street, Belmont WA 6104");
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      unitNo: "4",
      houseNo: "12",
      streetName: "Smith",
      streetType: "Street",
      suburb: "BELMONT",
      state: "WA",
    });
  });

  it("marks an unrecognised street type as not confident", () => {
    const result = parseAddressLine("10 Nowhere Zonk, Perth WA 6000");
    expect(result).not.toBeNull();
    expect(result!.confident).toBe(false);
    expect(result!.streetType).toBe("");
  });

  // Every unit-number convention seen in real documents: "Unit N, ",
  // bare "N, " (no keyword at all — an officer's own shorthand for the
  // same thing), the existing slash form "N/", and "U" as a one-letter
  // abbreviation of "Unit" in front of either separator.
  describe("unit number conventions", () => {
    const expected = {
      unitNo: "3",
      houseNo: "7",
      streetName: "Ord",
      streetType: "Street",
      suburb: "WEST PERTH",
      state: "WA",
      confident: true,
    };

    it.each([
      ["Unit 3, 7 Ord Street, WEST PERTH WA 6005."],
      ["3, 7 Ord Street, WEST PERTH WA 6005."],
      ["3/7 Ord Street, WEST PERTH WA 6005."],
      ["U3, 7 Ord Street, WEST PERTH WA 6005."],
      ["U3/7 Ord Street, WEST PERTH WA 6005."],
      // Case-insensitive, matching however an officer happens to type it.
      ["unit 3, 7 Ord Street, WEST PERTH WA 6005."],
      ["u3/7 Ord Street, WEST PERTH WA 6005."],
    ])("recognises %j", text => {
      const result = parseAddressLine(text);
      expect(result).not.toBeNull();
      expect(result).toMatchObject(expected);
    });

    it("leaves unitNo blank for a plain address with no unit — the comma/slash check must not false-positive", () => {
      const result = parseAddressLine(
        "45 Burrendah Boulevard, WILLETTON WA 6155"
      );
      expect(result).toMatchObject({ unitNo: "", houseNo: "45" });
    });
  });
});
