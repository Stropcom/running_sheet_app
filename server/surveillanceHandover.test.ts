import { describe, expect, it } from "vitest";
import { isHandover, surveillancePlace } from "@shared/surveillanceHandover";
import { samePlace } from "@shared/targetPosition";

describe("surveillancePlace", () => {
  it("reads the place after the phrase", () => {
    expect(
      surveillancePlace(
        "Surveillance ceased in the vicinity of 7 Mariner Place.",
        "ceased"
      )
    ).toBe("7 Mariner Place");
    expect(
      surveillancePlace(
        "Surveillance commenced at 7 Mariner Place, COOLOONGUP WA (7 Mariner Place).",
        "commenced"
      )
    ).toBe("7 Mariner Place, COOLOONGUP WA (7 Mariner Place)");
  });
  it("is null with no place, or the other phrase", () => {
    expect(surveillancePlace("Surveillance ceased.", "ceased")).toBeNull();
    expect(
      surveillancePlace("Surveillance commenced at 5 Smith Street.", "ceased")
    ).toBeNull();
    expect(surveillancePlace(null, "ceased")).toBeNull();
  });
});

describe("isHandover — time and place must both match", () => {
  const base = {
    endedAtMinutes: 1000,
    endedPlaces: ["7 Mariner Place"],
    commencedAtMinutes: 1000,
    commencedPlace: "7 Mariner Place, COOLOONGUP WA (7 Mariner Place)",
  };
  it("matches at the same minute and one minute either side", () => {
    expect(isHandover(base, samePlace)).toBe(true);
    expect(isHandover({ ...base, commencedAtMinutes: 1001 }, samePlace)).toBe(
      true
    );
    expect(isHandover({ ...base, commencedAtMinutes: 999 }, samePlace)).toBe(
      true
    );
  });
  it("does not match two minutes apart", () => {
    expect(isHandover({ ...base, commencedAtMinutes: 1002 }, samePlace)).toBe(
      false
    );
    expect(isHandover({ ...base, commencedAtMinutes: 998 }, samePlace)).toBe(
      false
    );
  });
  it("does not match a different place", () => {
    expect(
      isHandover(
        { ...base, commencedPlace: "9 Other Road, KWINANA WA" },
        samePlace
      )
    ).toBe(false);
  });
  it("matches the target's last-known place when the ceased row names none", () => {
    expect(
      isHandover({ ...base, endedPlaces: ["", "7 Mariner Place"] }, samePlace)
    ).toBe(true);
  });
  it("needs every fact", () => {
    expect(isHandover({ ...base, endedAtMinutes: null }, samePlace)).toBe(
      false
    );
    expect(isHandover({ ...base, commencedPlace: null }, samePlace)).toBe(
      false
    );
    expect(isHandover({ ...base, endedPlaces: [] }, samePlace)).toBe(false);
  });
});
