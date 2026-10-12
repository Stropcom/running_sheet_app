import { describe, expect, it } from "vitest";
import {
  extraAddressHeading,
  parseExtraAddresses,
  withAddressLabel,
} from "../shared/extraAddresses";

describe("extra address labels", () => {
  const json = JSON.stringify([
    {
      label: " Work ",
      full: "5 Smith Street, Perth WA 6000",
      short: "5 Smith",
    },
    { label: "", full: "", short: "9 Short Road" },
    { full: "1 Long Avenue, Perth WA 6000" },
  ]);

  it("keeps each label with its address, trimmed, in stored order", () => {
    expect(parseExtraAddresses(json)).toEqual([
      { label: "Work", value: "5 Smith Street, Perth WA 6000" },
      { label: "", value: "9 Short Road" },
      { label: "", value: "1 Long Avenue, Perth WA 6000" },
    ]);
  });

  it("copes with null, empty and malformed JSON", () => {
    expect(parseExtraAddresses(null)).toEqual([]);
    expect(parseExtraAddresses("")).toEqual([]);
    expect(parseExtraAddresses("{nope")).toEqual([]);
  });

  it("heads an address with its label, else Address N", () => {
    expect(extraAddressHeading("Safehouse", 2)).toBe("Safehouse");
    expect(extraAddressHeading("", 3)).toBe("Address 3");
  });

  it("prefixes a label onto the address text only when there is one", () => {
    expect(withAddressLabel("Girlfriend's", "7 Lake Road")).toBe(
      "Girlfriend's — 7 Lake Road"
    );
    expect(withAddressLabel("", "7 Lake Road")).toBe("7 Lake Road");
  });
});
