import { describe, expect, it } from "vitest";
import {
  fullAddressForGeocode,
  fullDescriptionsByLabel,
} from "@shared/geocodeQuery";

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

describe("fullDescriptionsByLabel (Summary map)", () => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  it("finds the fuller address written for a bare place label", () => {
    const m = fullDescriptionsByLabel(
      [
        {
          type: "address",
          shortForm: "Terminal 4, Terminal 4",
          fullDescription: "Terminal 4, Perth Airport WA",
        },
        { type: "person", shortForm: "VALE", fullDescription: "Elliot Vale" },
      ],
      norm
    );
    const full = fullAddressForGeocode(
      m.get(norm("Terminal 4, Terminal 4")) ?? []
    );
    expect(full).toBe("Terminal 4, Perth Airport WA");
    expect(m.has("vale")).toBe(false);
  });
  it("gives nothing for a label no row wrote, so it is geocoded as written", () => {
    const m = fullDescriptionsByLabel([], norm);
    expect(fullAddressForGeocode(m.get("terminal 4") ?? [])).toBeNull();
  });
});
