/**
 * A vehicle registered in the Target Registry must show its registered target
 * or associate on its profile. The registry text and the vehicle entity are
 * matched on the same keys (vehicleLinkKeys), so a model name written before
 * the rego, or a hyphenated plate, no longer breaks the link.
 */
import { describe, it, expect } from "vitest";
import { vehicleLinkKeys, registryVehicleLinkKeys } from "./db";

const linked = (registry: string, entityLabel: string) => {
  const own = vehicleLinkKeys(entityLabel);
  const reg = registryVehicleLinkKeys({ v1f: registry });
  return Array.from(own).some(k => reg.has(k));
};

describe("registry vehicle → vehicle profile link", () => {
  it("links a plain registered rego", () => {
    expect(
      linked(
        "Blue Mitsubishi Triton Utility, bearing WA registration 1BSY48 (Vehicle 1BSY48)",
        "1BSY48 Blue Mitsubishi Triton Utility"
      )
    ).toBe(true);
  });

  it("links when a model name comes before the rego", () => {
    expect(
      linked(
        "blue Volvo XC90, bearing WA registration 1ABC123 (Vehicle 1ABC123)",
        "1ABC123 blue Volvo XC90"
      )
    ).toBe(true);
    expect(
      linked(
        "Black Lexus NX350h station wagon, bearing WA registration 1NXL350",
        "1NXL350"
      )
    ).toBe(true);
  });

  it("links a hyphenated plate", () => {
    expect(
      linked(
        "white Toyota HiAce Van, bearing WA registration CW-1212",
        "CW-1212 white Toyota HiAce Van"
      )
    ).toBe(true);
  });

  it("links an extra vehicle entry", () => {
    const reg = registryVehicleLinkKeys({
      extraVehicles: JSON.stringify([
        { full: "grey Kia Cerato, bearing WA registration 1KIA777" },
      ]),
    });
    expect(vehicleLinkKeys("1KIA777 grey Kia Cerato").has("1KIA777")).toBe(
      true
    );
    expect(reg.has("1KIA777")).toBe(true);
  });

  it("does not link different vehicles", () => {
    expect(
      linked(
        "blue Volvo XC90, bearing WA registration 1ABC123",
        "1ZZZ999 blue Volvo XC90"
      )
    ).toBe(false);
  });

  it("never lets a colour or make stand in for a plate", () => {
    expect(vehicleLinkKeys("silver Hyundai Getz").has("SILVER")).toBe(false);
  });
});
