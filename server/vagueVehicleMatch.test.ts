/**
 * Tests for the vague-vehicle-match feature: detecting a real-rego vehicle
 * entry that might be the same car as an earlier no-rego sighting on the
 * same sheet ("(Vehicle White Hyundai)"), so the officer can be offered a
 * merge — see the doc comment on findVagueVehicleMatch in server/db.ts and
 * compareVehicleDescriptions in server/entityDedup.ts for why this needs a
 * dedicated word-overlap comparison rather than the existing
 * character-similarity vehicle comparator.
 */
import { describe, it, expect } from "vitest";
import { pickVagueVehicleMatches } from "./db";
import { compareVehicleDescriptions } from "./entityDedup";

describe("compareVehicleDescriptions", () => {
  it("matches the user's worked example (vague bracket vs full description)", () => {
    const result = compareVehicleDescriptions(
      "white Hyundai Santa Fe, bearing WA registration 1FAD234 Vehicle 1FAD234",
      "a white Hyundai Santa Fe, registration unable to be observed Vehicle White Hyundai"
    );
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThanOrEqual(0.7);
  });

  it("matches a shorter vague description contained in a fuller one", () => {
    const result = compareVehicleDescriptions(
      "white Hyundai Santa Fe, bearing WA registration 1FAD234",
      "white Hyundai"
    );
    expect(result).not.toBeNull();
  });

  it("does not match two unrelated vehicles", () => {
    const result = compareVehicleDescriptions(
      "white Hyundai Santa Fe, bearing WA registration 1FAD234",
      "a black Ford Ranger, registration unable to be observed"
    );
    expect(result).toBeNull();
  });

  it("returns null for empty descriptive content on either side", () => {
    const result = compareVehicleDescriptions(
      "bearing WA registration 1FAD234",
      "registration unable to be observed"
    );
    expect(result).toBeNull();
  });
});

describe("pickVagueVehicleMatches", () => {
  const vagueRow = {
    observation:
      "a white Hyundai Santa Fe, registration unable to be observed (Vehicle White Hyundai)",
  };
  const newVehicleText =
    "white Hyundai Santa Fe, bearing WA registration 1FAD234 (Vehicle 1FAD234) parked in the driveway.";

  it("finds the vague match for the user's worked example", () => {
    const result = pickVagueVehicleMatches(newVehicleText, [vagueRow]);
    expect(result).toHaveLength(1);
    expect(result[0].loserLabel).toBe("White Hyundai");
    expect(result[0].winnerLabel).toBe("1FAD234 white Hyundai Santa Fe");
  });

  it("detects a vague vehicle via the bracket-contains-a-make signal alone (no 'not observed' phrase)", () => {
    const result = pickVagueVehicleMatches(newVehicleText, [
      {
        observation:
          "a white Hyundai Santa Fe was seen parked (Vehicle White Hyundai) outside the address.",
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it("detects a vague vehicle via the 'no rego observed' phrase alone, without a make in the bracket", () => {
    // Bracket itself carries no make word — only the "rego unable to be
    // seen" phrase signal fires detection here.
    const result = pickVagueVehicleMatches(newVehicleText, [
      {
        observation:
          "a white Hyundai Santa Fe, rego unable to be seen (Vehicle Sighting1) parked in the driveway.",
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it("does not match a vehicle that already has a real rego", () => {
    const result = pickVagueVehicleMatches(newVehicleText, [
      {
        observation:
          "a white Hyundai Santa Fe, bearing WA registration 1FAD234 (Vehicle 1FAD234) parked in the driveway.",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("does not match an unrelated vague vehicle", () => {
    const result = pickVagueVehicleMatches(newVehicleText, [
      {
        observation:
          "a black Ford Ranger, registration unable to be observed (Vehicle Black Ranger) parked outside.",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("returns nothing when the new row has no real-rego vehicle at all", () => {
    const result = pickVagueVehicleMatches(
      "a white Hyundai Santa Fe, registration unable to be observed (Vehicle White Hyundai) parked in the driveway.",
      [vagueRow]
    );
    expect(result).toHaveLength(0);
  });

  it("ignores rows with no observation text", () => {
    const result = pickVagueVehicleMatches(newVehicleText, [
      { observation: null },
      vagueRow,
    ]);
    expect(result).toHaveLength(1);
  });
});
