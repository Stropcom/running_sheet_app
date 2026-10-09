import { describe, expect, it } from "vitest";
import {
  entryMentionsAddress,
  popupShortAddress,
  shortAddressLabel,
} from "@shared/markerLink";

describe("marker link", () => {
  const address = "902 Canning Highway, APPLECROSS WA (902 Canning Highway)";

  it("reads the short address from the bracket label", () => {
    expect(shortAddressLabel(address)).toBe("902 Canning Highway");
    expect(shortAddressLabel("Cheeky Boy Espresso, 31F Ardross Street")).toBe(
      "Cheeky Boy Espresso"
    );
  });

  it("links only when the entry mentions the address", () => {
    expect(
      entryMentionsAddress(
        address,
        "Vehicle 1ABC123 arrived at 902 Canning Highway, APPLECROSS WA (902 Canning Highway)."
      )
    ).toBe("902 Canning Highway");
    expect(
      entryMentionsAddress(address, "Vehicle 1ABC123 arrived at the shop.")
    ).toBeNull();
  });
});

describe("popupShortAddress", () => {
  it("uses the bracket label for a business with no street or suburb", () => {
    expect(
      popupShortAddress(
        "The Lookout Bar Bowling Bites (The Lookout Bar Bowling Bites)"
      )
    ).toBe("The Lookout Bar Bowling Bites");
  });
  it("title-cases an all-capitals bracket and keeps full street types", () => {
    expect(
      popupShortAddress("21 Olding Way, MELVILLE WA (21 OLDING WAY)")
    ).toBe("21 Olding Way");
    expect(popupShortAddress("12 Swan St, PERTH WA (12 SWAN ST)")).toBe(
      "12 Swan Street"
    );
  });
  it("falls back to the first comma part", () => {
    expect(popupShortAddress("5 Hay Street, Perth")).toBe("5 Hay Street");
  });
});
