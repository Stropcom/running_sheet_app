import { describe, expect, it } from "vitest";
import { isAreaWithinPlace } from "@shared/insideAreas";
import { scanWalkEvents } from "@shared/walkEventPatterns";

const rows = (...obs: string[]) =>
  obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

describe("isAreaWithinPlace", () => {
  it.each([
    "the elevators",
    "the elevator",
    "a lift",
    "the lifts",
    "the lobby",
    "the foyer",
    "reception",
    "the gym",
    "the pool area",
    "the swimming pool",
    "the 12th floor",
    "level 3",
    "room 1204",
    "the hotel room",
    "the restaurant",
    "the bar",
    "the conference room",
    "the stairs",
  ])("%s is an area within a place", place => {
    expect(isAreaWithinPlace(place)).toBe(true);
  });

  it.each([
    "Crown Towers Perth",
    "Crown Towers lobby",
    "The Camfield",
    "Town Hall",
    "the shop",
    "the car park",
    "13 Denford Street",
    "Elevate Fitness",
    "",
    null,
    "the",
  ])("%s is a place of its own", place => {
    expect(isAreaWithinPlace(place as string | null)).toBe(false);
  });
});

const ARRIVED =
  "Vehicle 1MEN83, MENON driver, VALE front passenger and LANGLEY rear passenger, arrived at Crown Towers Perth (Crown Towers Perth) and stopped in the valet parking area.\n\nMENON, VALE and LANGLEY exited the vehicle, entered Crown Towers Perth and continued out of sight.";

describe("moving about inside a building the people are already in", () => {
  it("a lift does not move them off the building (the real sheet)", () => {
    const { walkIns } = scanWalkEvents(
      rows(
        ARRIVED,
        "MENON, VALE and LANGLEY checked in, entered the elevators and continued out of sight."
      )
    );
    expect(walkIns).toHaveLength(1);
    expect(walkIns[0].location).toBe("Crown Towers Perth");
    expect(walkIns[0].names).toMatch(/MENON/);
    expect(walkIns[0].names).toMatch(/LANGLEY/);
  });

  it.each([
    "MENON, VALE and LANGLEY entered the gym and continued out of sight.",
    "MENON, VALE and LANGLEY entered the pool area and continued out of sight.",
    "MENON, VALE and LANGLEY entered the lobby and continued out of sight.",
  ])("%s", text => {
    const { walkIns } = scanWalkEvents(rows(ARRIVED, text));
    expect(walkIns.map(w => w.location)).toEqual(["Crown Towers Perth"]);
  });

  it("lift, then the gym, then the pool: still in the building", () => {
    const { walkIns, headingTo } = scanWalkEvents(
      rows(
        ARRIVED,
        "MENON, VALE and LANGLEY entered the elevators and continued out of sight.",
        "MENON, VALE and LANGLEY exited the elevators and entered the gym and continued out of sight.",
        "MENON, VALE and LANGLEY exited the gym and entered the pool area and continued out of sight."
      )
    );
    expect(walkIns.map(w => w.location)).toEqual(["Crown Towers Perth"]);
    expect(headingTo).toHaveLength(0);
  });

  it("leaving the building is still leaving it", () => {
    const { walkIns } = scanWalkEvents(
      rows(
        ARRIVED,
        "MENON, VALE and LANGLEY entered the elevators and continued out of sight.",
        "MENON, VALE and LANGLEY exited Crown Towers Perth."
      )
    );
    expect(walkIns).toHaveLength(0);
  });

  it("a named place is a place of its own, as before", () => {
    const { walkIns } = scanWalkEvents(
      rows(
        ARRIVED,
        "MENON, VALE and LANGLEY exited Crown Towers Perth and walked to and entered The Camfield and continued out of sight."
      )
    );
    expect(walkIns.map(w => w.location)).toEqual(["The Camfield"]);
  });

  it("with nobody logged inside anywhere, entering a lift reads as before", () => {
    const { walkIns } = scanWalkEvents(
      rows("MENON entered the elevators and continued out of sight.")
    );
    expect(walkIns.map(w => w.location)).toEqual(["the elevators"]);
  });
});
