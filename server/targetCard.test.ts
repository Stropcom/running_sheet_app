import { describe, expect, it } from "vitest";
import {
  companionsOf,
  pickTargetCardKey,
  targetTokenFromTitle,
} from "@shared/targetCard";

describe("targetTokenFromTitle", () => {
  it("reads the surname bracket", () => {
    expect(targetTokenFromTitle("20261006 - 459 - ORCHARD (BAIG)")).toBe(
      "BAIG"
    );
  });
  it("is null with no bracket or a descriptive one", () => {
    expect(targetTokenFromTitle("20261006 - 459 - ORCHARD")).toBeNull();
    expect(targetTokenFromTitle("X (White Hyundai 1ABC123)")).toBeNull();
  });
});

describe("pickTargetCardKey", () => {
  const cards = [
    { key: "veh-1", holds: ["JORDAN"], latestRowId: 5 },
    { key: "foot-A", holds: ["BAIG"], latestRowId: 9 },
  ];
  it("finds the card holding him", () => {
    expect(pickTargetCardKey(cards, "baig")).toBe("foot-A");
  });
  it("is null when nobody holds him", () => {
    expect(pickTargetCardKey(cards, "YATES")).toBeNull();
  });
});

describe("companionsOf", () => {
  it("lists everyone but the target", () => {
    expect(companionsOf(["BAIG", "JORDAN"], "BAIG")).toEqual(["JORDAN"]);
  });
});
