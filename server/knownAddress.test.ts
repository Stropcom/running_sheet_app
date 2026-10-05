import { describe, expect, it } from "vitest";
import {
  buildSheetAddressText,
  knownAddressMatches,
  parseKnownAddress,
} from "@shared/knownAddress";

describe("parseKnownAddress", () => {
  it("splits a plain address", () => {
    expect(parseKnownAddress("13 Denford Street, KENWICK")).toEqual({
      businessName: "",
      street: "13 Denford Street",
      suburb: "KENWICK",
    });
  });
  it("splits a business address", () => {
    expect(parseKnownAddress("Blend Cafe, 1 Smith Street, MELVILLE")).toEqual({
      businessName: "Blend Cafe",
      street: "1 Smith Street",
      suburb: "MELVILLE",
    });
  });
  it("returns null for a business with no street number", () => {
    expect(parseKnownAddress("Blend Cafe")).toBeNull();
  });
  it("handles units and a trailing state", () => {
    expect(parseKnownAddress("2/144 Banning Road, EAST PERTH WA")).toEqual({
      businessName: "",
      street: "2/144 Banning Road",
      suburb: "EAST PERTH",
    });
  });
});

describe("knownAddressMatches", () => {
  it("matches a street prefix, case-insensitively", () => {
    expect(knownAddressMatches("13 den", "13 Denford Street, KENWICK")).toBe(
      true
    );
    expect(
      knownAddressMatches("13 Denford St", "13 Denford Street, KENWICK")
    ).toBe(true);
  });
  it("does not match a different number or street", () => {
    expect(knownAddressMatches("14 Den", "13 Denford Street, KENWICK")).toBe(
      false
    );
    expect(knownAddressMatches("13 Smi", "13 Denford Street, KENWICK")).toBe(
      false
    );
  });
});

describe("buildSheetAddressText", () => {
  const plain = parseKnownAddress("13 Denford Street, KENWICK")!;
  const biz = parseKnownAddress("Blend Cafe, 1 Smith Street, MELVILLE")!;
  it("writes the full sheet form with its bracket", () => {
    expect(buildSheetAddressText(plain)).toBe(
      "13 Denford Street, KENWICK WA (13 Denford Street)"
    );
    expect(buildSheetAddressText(biz)).toBe(
      "Blend Cafe, 1 Smith Street, MELVILLE WA (Blend Cafe)"
    );
  });
});
