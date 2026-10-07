import { describe, expect, it } from "vitest";
import { entryMentionsAddress, shortAddressLabel } from "@shared/markerLink";

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
