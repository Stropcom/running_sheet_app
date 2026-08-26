/**
 * Tests for normalizeObservationPunctuation — the save-time punctuation
 * fixer applied in createSheetRow/updateSheetRow. See the doc comment on
 * that function in server/db.ts for why these two rules exist (the second
 * one is load-bearing for VEHICLE_DEPART_PATTERN/
 * VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN, not just cosmetic).
 */
import { describe, it, expect } from "vitest";
import { normalizeObservationPunctuation } from "./db";

describe("normalizeObservationPunctuation — vehicle bracket comma", () => {
  it("inserts a comma when the bracket is glued directly to the next word (the real AMAZE bug)", () => {
    const input =
      "A grey Ford Ranger Utility, bearing WA registration 1FAT007 (Vehicle 1FAT007)and a red Holden Monaro coupe, bearing WA registration HOGES (Vehicle HOGES) parked and unattended in the driveway.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toContain("(Vehicle 1FAT007), and a red Holden Monaro");
  });

  it("inserts a comma when the bracket is followed by a space then a word", () => {
    const input =
      "parked outside (Vehicle 1ABC123) and departed shortly after.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "parked outside (Vehicle 1ABC123), and departed shortly after."
    );
  });

  it("does not double up a comma that's already there", () => {
    const input =
      "bearing WA registration 1ABC123 (Vehicle 1ABC123), driven by REID (REID).";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(input);
  });

  it("leaves a bracket already followed by a period alone", () => {
    const input = "parked and unattended in the driveway (Vehicle 1ABC123).";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(input);
  });

  it("leaves a bracket at the very end of the text alone (no dangling trailing comma)", () => {
    const input = "bearing WA registration 1ABC123 (Vehicle 1ABC123)";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(input);
  });

  it("leaves a bracket immediately followed by a paragraph break alone", () => {
    const input =
      "bearing WA registration 1ABC123 (Vehicle 1ABC123)\n\nHOGAN exited the vehicle.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(input);
  });
});

describe("normalizeObservationPunctuation — rego + departed/arrived comma", () => {
  it("inserts both missing commas (real AMAZE row 3 shape)", () => {
    const input =
      "Vehicle 1FAT007 HOGAN driver and sole occupant departed 45 Burrendah Boulevard and continued via:";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "Vehicle 1FAT007, HOGAN driver and sole occupant, departed 45 Burrendah Boulevard and continued via:"
    );
  });

  it("inserts only the rego comma when the departed/arrived comma is already present", () => {
    const input =
      "Vehicle 1FAT007 HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway."
    );
  });

  it("is a no-op when both commas are already correct (the user's target example)", () => {
    const input =
      "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(input);
  });

  it("handles multiple comma-separated occupants without needing a phrase list", () => {
    const input =
      "Vehicle 1FAT007 HOGAN driver, OWEN front passenger, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "Vehicle 1FAT007, HOGAN driver, OWEN front passenger, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway."
    );
  });

  it("handles unseen-occupant phrasing without needing a phrase list", () => {
    const input =
      "Vehicle 1FAT007 with unseen occupant/s arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "Vehicle 1FAT007, with unseen occupant/s, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway."
    );
  });

  it("fixes two separate depart/arrive events in the same row independently (real AMAZE row 5 shape)", () => {
    const input =
      "Vehicle 1FAB456 HOGAN driver and sole occupant, departed and continued out of sight. \n\nVehicle 1FAT007 HOGAN driver and sole occupant, departed Cafe Guilty Pleasure Mount Lawley and continued via:";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "Vehicle 1FAB456, HOGAN driver and sole occupant, departed and continued out of sight. \n\nVehicle 1FAT007, HOGAN driver and sole occupant, departed Cafe Guilty Pleasure Mount Lawley and continued via:"
    );
  });

  it("does not reach across a paragraph break to a later, unrelated departed/arrived (mirrors the real parsing patterns' single-line reach)", () => {
    const input =
      "Vehicle 1ABC123 parked outside the address.\n\nA short time later, an unrelated vehicle arrived nearby.";
    const result = normalizeObservationPunctuation(input);
    // No comma inserted after "Vehicle 1ABC123" here — "arrived" is on a
    // different line and isn't part of this vehicle's own narrative, same
    // as VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN would treat it.
    expect(result).toBe(input);
  });

  it("leaves text with neither keyword untouched", () => {
    const input =
      "Vehicle 1ABC123 (Vehicle 1ABC123) parked and unattended in the driveway.";
    const result = normalizeObservationPunctuation(input);
    // The bracket-comma rule still applies; there's no departed/arrived to fix.
    expect(result).toBe(
      "Vehicle 1ABC123 (Vehicle 1ABC123), parked and unattended in the driveway."
    );
  });
});
