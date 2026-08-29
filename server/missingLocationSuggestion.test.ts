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

  // Called with no knownLocationShortForms (the default), this check only
  // has the row's own text to go on — a bare, bracket-free mention looks
  // identical to no location at all in isolation. That's expected and
  // correct: pickMissingLocationSuggestion below is what actually supplies
  // the sheet's known short forms, mirroring how getAllIntelligenceEntities'
  // "Pass B" needs the rest of the sheet to recognise a bare re-mention too.
  it("flags a bare, bracket-free location mention when no known short forms are supplied", () => {
    const text =
      "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), parked and unattended in the driveway at 35 Petra Street.";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(true);
  });

  it("stops flagging the row once the confirmed location is appended WITH its own bracket", () => {
    const text =
      "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), parked and unattended in the driveway (35 Petra Street).";
    expect(looksLikeUnlocatedVehiclePresenceRow(text)).toBe(false);
  });

  // The actual mechanism appendLocationSuggestion (SheetDetail.tsx) and
  // appendQeLocationSuggestion (IntelligenceMapping.tsx) rely on: a bare
  // mention is enough, exactly like the vehicle-arriving chip's
  // "subsequent mention, no bracket needed" convention — as long as the
  // location was bracket-introduced SOMEWHERE else in the sheet, which the
  // caller passes in via knownLocationShortForms.
  it("stops flagging the row once its bare mention matches a known short form", () => {
    const text =
      "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), parked and unattended in the driveway at 35 Petra Street.";
    expect(
      looksLikeUnlocatedVehiclePresenceRow(text, ["35 Petra Street"])
    ).toBe(false);
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

  it("prefers a later, different row's location over the commencement row — rolling location, the team may have moved on", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      commencementRow,
      {
        observation:
          "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.",
      },
    ]);
    expect(result?.location).toBe("21 Allora Avenue");
    expect(result?.source).toBe("an earlier row on this sheet");
  });

  it("rolls forward through a depart/arrive sequence to the team's current address, not the original commencement address", () => {
    const result = pickMissingLocationSuggestion(vehiclePresenceText, [
      commencementRow,
      {
        observation:
          "Vehicle 1GDD373, WINMAR driver, TOOLMAN front passenger, departed 45 Burrendah Boulevard and continued via:",
      },
      {
        observation:
          "Vehicle 1GDD373, WINMAR driver, TOOLMAN front passenger, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue).",
      },
    ]);
    expect(result).toEqual({
      location: "21 Allora Avenue",
      source: "an earlier row on this sheet",
    });
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

  // End-to-end regression for the actual reported bug: confirming the
  // prompt appends the suggested location as a bare, bracket-free mention
  // (appendLocationSuggestion/appendQeLocationSuggestion) — this proves
  // that once saved, the SAME row no longer re-triggers the prompt on a
  // later save, because its bare mention of "45 Burrendah Boulevard"
  // matches the short form the commencement row already bracket-introduced.
  it("stops suggesting a location for a row that already has a bare (bracket-free) mention of one", () => {
    const rowAfterConfirming =
      "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), and a silver Ford Everest 4WD, bearing WA registration XCF937 (Vehicle XCF937), parked and unattended in the driveway at 45 Burrendah Boulevard.";
    const result = pickMissingLocationSuggestion(rowAfterConfirming, [
      commencementRow,
    ]);
    expect(result).toBeNull();
  });
});
