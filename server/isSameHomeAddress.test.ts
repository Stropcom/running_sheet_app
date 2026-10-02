import { describe, expect, it } from "vitest";
import { isSameHomeAddress } from "@/lib/addressFormat";

const addr = (o: Partial<Record<string, string>> = {}) => ({
  unitNo: "",
  houseNo: "12",
  streetName: "Smith",
  streetType: "Street",
  suburb: "Fremantle",
  ...o,
});

describe("isSameHomeAddress", () => {
  it("matches the same house, ignoring case and street-type abbreviation", () => {
    expect(isSameHomeAddress(addr(), addr())).toBe(true);
    expect(
      isSameHomeAddress(
        addr(),
        addr({ streetName: "SMITH", streetType: "St", suburb: "FREMANTLE" })
      )
    ).toBe(true);
    expect(isSameHomeAddress(addr(), addr({ streetType: "" }))).toBe(true);
  });

  it("treats different units, houses, streets, suburbs or types as different", () => {
    expect(
      isSameHomeAddress(addr({ unitNo: "3" }), addr({ unitNo: "5" }))
    ).toBe(false);
    expect(isSameHomeAddress(addr({ unitNo: "3" }), addr())).toBe(false);
    expect(isSameHomeAddress(addr(), addr({ houseNo: "14" }))).toBe(false);
    expect(isSameHomeAddress(addr(), addr({ streetName: "Jones" }))).toBe(
      false
    );
    expect(isSameHomeAddress(addr(), addr({ suburb: "Bibra Lake" }))).toBe(
      false
    );
    expect(isSameHomeAddress(addr(), addr({ streetType: "Road" }))).toBe(false);
  });

  it("never matches an incomplete address", () => {
    expect(
      isSameHomeAddress(addr({ houseNo: "" }), addr({ houseNo: "" }))
    ).toBe(false);
    expect(isSameHomeAddress(addr({ suburb: "" }), addr({ suburb: "" }))).toBe(
      false
    );
  });
});
