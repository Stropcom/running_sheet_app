/**
 * Tests for pickMissingLocationSuggestion / looksLikeUnlocatedVehiclePresenceRow
 * — the detection behind the "no location on this row" save-time prompt.
 * See the doc comment on findMissingLocationSuggestion in server/db.ts for
 * why this exists: a vehicle-presence row with no location entity of its
 * own never gets linked to that location in the Intelligence
 * folder/map for that specific row, even when a human reader would take
 * the location as obvious from an earlier "Surveillance commenced" row.
 */
import { describe, it, expect } from "vitest";
import {
  looksLikeUnlocatedVehiclePresenceRow,
  pickMissingLocationSuggestion,
} from "./db";

describe("looksLikeUnlocatedVehiclePresenceRow", () => {
  it("flags the user's worked example (two vehicles, static presence, no location)", () => {
    const text =
      "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), and a silver Ford Everest 4WD, bearing WA registration XCF937 (Vehicle XCF937), parked and unattended in the driveway.";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(true);
  });

  it("does not flag a row that already names a location", () => {
    const text =
      "A grey Ford Ranger Utility, bearing WA registration 1FAT007 (Vehicle 1FAT007), parked and unattended in the driveway at 45 Burrendah Boulevard, WILLETTON WA (45 Burrendah Boulevard).";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(false);
  });

  it("does not flag an arrival row (movement verb, own location convention)", () => {
    const text =
      "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(false);
  });

  it("does not flag a departure row (movement verb)", () => {
    const text =
      "Vehicle 1FAT007, HOGAN driver and sole occupant, departed 45 Burrendah Boulevard and continued via:";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(false);
  });

  it("does not flag a row with no vehicle mention at all", () => {
    const text = "Surveillance commenced in the vicinity of the address.";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(false);
  });

  it("does not flag a vehicle row with no static-presence phrasing", () => {
    const text =
      "A grey Ford Ranger Utility, bearing WA registration 1FAT007 (Vehicle 1FAT007), was noted nearby.";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(false);
  });
});

describe("pickMissingLocationSuggestion", () => {
  const commencementRow = {
    observation:
      "Surveillance commenced in the vicinity of 45 Burrendah Boulevard, WILLETTON WA (45 Burrendah Boulevard).",
  };
  const vehiclePresenceText =
    "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), and a silver Ford Everest 4WD, bearing WA registration XCF937 (Vehicle XCF937), parked and unattended in the driveway.";

  it("suggests the Surveillance commencement row's location, street portion only", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      commencementRow,
    ]);
    expect(result).toEqual({
      location: "45 Burrendah Boulevard",
      source: "the Surveillance commencement row",
    });
  });

  it("falls back to the most recent other row with a location when there's no commencement row", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      {
        observation:
          "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.",
      },
      {
        observation:
          "HOGAN exited the vehicle and entered the property unaccompanied.",
      },
    ]);
    expect(result).toEqual({
      location: "21 Allora Avenue",
      source: "an earlier row on this sheet",
    });
  });

  it("prefers the commencement row's location over a later, different row's location", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      commencementRow,
      {
        observation:
          "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.",
      },
    ]);
    expect(result?.location).toBe("45 Burrendah Boulevard");
    expect(result?.source).toBe("the Surveillance commencement row");
  });

  it("suggests a plain business-name location (no address attached) unchanged", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      {
        observation:
          "IOs observed TGT enter Crown Perth Casino (Crown Perth Casino) and remain inside for two hours.",
      },
    ]);
    expect(result).toEqual({
      location: "Crown Perth Casino",
      source: "an earlier row on this sheet",
    });
  });

  it("returns null when no other row has a location to suggest", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      { observation: "HOGAN entered the property unaccompanied." },
    ]);
    expect(result).toBeNull();
  });

  it("returns null when the row itself doesn't match the detection shape", () => {
    const result = pickMissingLocationSuggestion(
      "HOGAN entered the property unaccompanied.",
      [commencementRow]
    );
    expect(result).toBeNull();
  });

  it("ignores rows with no observation text", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      { observation: null },
      commencementRow,
    ]);
    expect(result?.location).toBe("45 Burrendah Boulevard");
  });
});
