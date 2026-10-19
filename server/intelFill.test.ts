import { describe, expect, it } from "vitest";
import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";

// What the Summary's Tracker / Coyotes / LD boxes write when a suggestion is
// picked: the short wording the Intelligence folder uses.
describe("short Intelligence wording for the Summary special-project boxes", () => {
  it("a vehicle is its rego then its description, with no 'bearing … (Vehicle …)'", () => {
    expect(
      formatIntelVehicle(
        "red Holden Monaro coupe, bearing WA registration 1FAT001 (Vehicle 1FAT001)"
      )
    ).toBe("1FAT001 red Holden Monaro coupe");
    expect(formatIntelVehicle("Vehicle 1FAT001")).toBe("1FAT001");
  });

  it("an address is the street and suburb only, with no state and no bracket", () => {
    expect(
      formatIntelAddress("57 Howe Street, OSBORNE PARK WA (57 Howe Street)")
    ).toBe("57 Howe Street, OSBORNE PARK");
    expect(formatIntelAddress("57 Howe Street, Osborne Park WA")).toBe(
      "57 Howe Street, OSBORNE PARK"
    );
  });

  it("a business keeps its name and address", () => {
    expect(
      formatIntelAddress("Yo-Chi, 5/36 South Terrace, FREMANTLE WA (Yo-Chi)")
    ).toBe("Yo-Chi, 5/36 South Terrace, FREMANTLE");
  });
});
