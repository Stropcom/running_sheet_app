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
    // Deliberately avoids any of Rule 3's departed/arrived-family keywords
    // right after the bracket — this test isolates Rule 1 only; Rule 3's
    // own behaviour (bracket + real occupant content + keyword) is covered
    // separately below.
    const input = "parked outside (Vehicle 1ABC123) and remained stationary.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "parked outside (Vehicle 1ABC123), and remained stationary."
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

describe("normalizeObservationPunctuation — Rule 3: bracket-first-mention rego + departed/arrived comma", () => {
  // Real bug report: a vehicle recorded for the first time AS it arrives
  // (full description + bracket code declared in the same sentence, no
  // earlier bare "Vehicle REGO" mention for Rule 2 to have already fixed)
  // never got its "Vehicle departing" continuity chip offered later,
  // because nothing inserted the comma VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN
  // needs between the occupant description and "arrived".
  it("inserts the missing comma for a bracket-first-mention arrival (the real reported bug)", () => {
    const input =
      "A white Toyota Hilux utility, bearing WA registration 1IUP467 (Vehicle 1IUP467), unseen occupant/s arrived at 115 Bateman Road, entered the driveway and continued out of sight.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "A white Toyota Hilux utility, bearing WA registration 1IUP467 (Vehicle 1IUP467), unseen occupant/s, arrived at 115 Bateman Road, entered the driveway and continued out of sight."
    );
  });

  // The same shape for a departure — a vehicle sitting unseen (e.g. in a
  // garage) that's only ever recorded for the first time as it departs.
  it("inserts the missing comma for a bracket-first-mention departure", () => {
    const input =
      "A white Toyota Hilux utility, bearing WA registration 1IUP467 (Vehicle 1IUP467), unseen occupant/s departed 115 Bateman Road and continued via:";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "A white Toyota Hilux utility, bearing WA registration 1IUP467 (Vehicle 1IUP467), unseen occupant/s, departed 115 Bateman Road and continued via:"
    );
  });

  it("is a no-op when the second comma is already present", () => {
    const input =
      "bearing WA registration 1IUP467 (Vehicle 1IUP467), unseen occupant/s, arrived at 115 Bateman Road.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(input);
  });

  it("recognises 'reversed'/'exited'/'parked'/'stopped', not just 'departed'/'arrived'", () => {
    expect(
      normalizeObservationPunctuation(
        "1IUP467 (Vehicle 1IUP467) HOGAN driver reversed the driveway"
      )
    ).toBe("1IUP467 (Vehicle 1IUP467), HOGAN driver, reversed the driveway");
    expect(
      normalizeObservationPunctuation(
        "1IUP467 (Vehicle 1IUP467) HOGAN driver parked outside"
      )
    ).toBe("1IUP467 (Vehicle 1IUP467), HOGAN driver, parked outside");
  });

  // Regression for the fix's own false-positive, caught by a real failing
  // test before landing on the final regex: a bracket sitting directly
  // against the keyword with no real occupant content between them (only
  // Rule 1's own whitespace) must not get a spurious second comma.
  it("does not insert a redundant comma when there is no real occupant content", () => {
    const input =
      "Vehicle 1ABC123 (Vehicle 1ABC123) parked and unattended in the driveway.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "Vehicle 1ABC123 (Vehicle 1ABC123), parked and unattended in the driveway."
    );
  });

  // A LATER, unrelated vehicle's own bracket must not get swallowed into
  // an earlier bracket's "occupants" — mirrors Rule 2's own guard against
  // the same class of bug for bare mentions.
  it("does not cross into a second, different vehicle's bracket", () => {
    const input =
      "(Vehicle 1ABC123), a Grey Volkswagen Transporter van, bearing WA registration 1STAR6 (Vehicle 1STAR6), unseen occupant/s arrived at 12 Marine Parade.";
    const result = normalizeObservationPunctuation(input);
    expect(result).toBe(
      "(Vehicle 1ABC123), a Grey Volkswagen Transporter van, bearing WA registration 1STAR6 (Vehicle 1STAR6), unseen occupant/s, arrived at 12 Marine Parade."
    );
  });
});
