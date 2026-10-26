import { describe, expect, it } from "vitest";
import { fullAddressForGeocode } from "@shared/geocodeQuery";

describe("fullAddressForGeocode", () => {
  it("takes the written street and suburb when a mention has one", () => {
    expect(fullAddressForGeocode(["Terminal 4, Perth Airport WA"])).toBe(
      "Terminal 4, Perth Airport WA"
    );
  });

  it("skips mentions with no suburb and state, and finds a later one", () => {
    expect(
      fullAddressForGeocode([
        "Terminal 4",
        "",
        null,
        "  Terminal 4, Perth Airport WA  ",
      ])
    ).toBe("Terminal 4, Perth Airport WA");
  });

  it("returns null when no mention has a suburb and state", () => {
    expect(fullAddressForGeocode(["Terminal 4", "Middleton Park"])).toBeNull();
    expect(fullAddressForGeocode([])).toBeNull();
  });
});
