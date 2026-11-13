import { describe, expect, it } from "vitest";
import { detectAddressSpaceCompletion } from "@/lib/mentionAutocomplete";

const none = new Set<string>();
const at = (t: string) => detectAddressSpaceCompletion(t, t.length, none);

describe("detectAddressSpaceCompletion", () => {
  it("brackets a real street address once its suburb is typed", () => {
    expect(at("Entered 44 Elvira Street, PALMYRA WA")).toEqual({
      addressLabel: "44 Elvira Street",
    });
    expect(at("Entered 44 Elvira Street, PALMYRA")).toEqual({
      addressLabel: "44 Elvira Street",
    });
  });

  it("never takes the digits inside a rego for a street number", () => {
    expect(
      at("Vehicle 1EMB303 parked and unattended on Murray Street, PERTH")
    ).toBeNull();
    expect(
      at("Vehicle 1EMB303 parked and unattended on Murray Street, PERTH WA")
    ).toBeNull();
  });

  it("still finds a street number that follows a rego", () => {
    expect(
      at("Vehicle 1EMB303 parked outside 12 Murray Street, PERTH")
    ).toEqual({ addressLabel: "12 Murray Street" });
  });
});
