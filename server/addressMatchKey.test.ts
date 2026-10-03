import { describe, it, expect } from "vitest";
import { addressMatchKey } from "@shared/addressMatchKey";

describe("addressMatchKey", () => {
  it("reduces every spelling of the same address to one key", () => {
    const k = addressMatchKey("17 Riversdale Road, BURSWOOD");
    expect(k).toBe("17 riversdale road|burswood");
    expect(
      addressMatchKey("17 Riversdale Rd, BURSWOOD WA (17 Riversdale Rd)")
    ).toBe(k);
    expect(addressMatchKey("17 Riversdale Road, Burswood WA 6100")).toBe(k);
    expect(addressMatchKey("Some Cafe, 17 Riversdale Road, BURSWOOD")).toBe(k);
  });

  it("keeps the unit and suburb so different households don't match", () => {
    expect(addressMatchKey("3/12 Smith Street, MELVILLE")).not.toBe(
      addressMatchKey("5/12 Smith Street, MELVILLE")
    );
    expect(addressMatchKey("12 Smith Street, MELVILLE")).not.toBe(
      addressMatchKey("3/12 Smith Street, MELVILLE")
    );
    expect(addressMatchKey("12 Smith Street, MELVILLE")).not.toBe(
      addressMatchKey("12 Smith Street, PERTH")
    );
  });

  it("reads unit prefixes the same way", () => {
    const k = addressMatchKey("3/12 Smith Street, MELVILLE");
    expect(addressMatchKey("Unit 3, 12 Smith St, MELVILLE WA")).toBe(k);
    expect(addressMatchKey("U3/12 Smith St, MELVILLE")).toBe(k);
  });

  it("returns empty when there is no house number", () => {
    expect(addressMatchKey("Blend Cafe")).toBe("");
    expect(addressMatchKey("")).toBe("");
    expect(addressMatchKey(null)).toBe("");
  });
});

import { shortPersonDisplayName } from "@shared/addressFormat";

describe("shortPersonDisplayName", () => {
  it("drops the born clause and the surname bracket", () => {
    expect(
      shortPersonDisplayName("Min Jae KIM, born 25 August 1980 (KIM)")
    ).toBe("Min Jae KIM");
    expect(shortPersonDisplayName("Min Jae KIM")).toBe("Min Jae KIM");
    expect(shortPersonDisplayName("Target 1")).toBe("Target 1");
  });
});
