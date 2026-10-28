import { describe, expect, it } from "vitest";
import {
  FIRST_ROW_OBSERVATION,
  firstRowFill,
  rosterCins,
} from "@shared/firstRow";

const roster = (entries: { cin: string; isTeamLeader?: boolean }[]): string =>
  JSON.stringify(entries.map(e => ({ hasImages: false, ...e })));

describe("rosterCins", () => {
  it("puts the team leader first, then CIN numbers in order", () => {
    expect(
      rosterCins(
        roster([
          { cin: "20" },
          { cin: "5" },
          { cin: "12", isTeamLeader: true },
          { cin: "7" },
        ])
      )
    ).toEqual(["12", "5", "7", "20"]);
  });

  it("puts names that are not numbers after, by name, and writes them upper case", () => {
    expect(
      rosterCins(roster([{ cin: "bravo" }, { cin: "3" }, { cin: "Alpha" }]))
    ).toEqual(["3", "ALPHA", "BRAVO"]);
  });

  it("lists each CIN once and skips blanks and spacers", () => {
    expect(
      rosterCins(
        roster([
          { cin: "5" },
          { cin: " 5 " },
          { cin: "" },
          { cin: "__SPACE__" },
        ])
      )
    ).toEqual(["5"]);
  });

  it("is empty for no roster or one it cannot read", () => {
    expect(rosterCins(null)).toEqual([]);
    expect(rosterCins("")).toEqual([]);
    expect(rosterCins("not json")).toEqual([]);
    expect(rosterCins('{"cin":"5"}')).toEqual([]);
  });
});

describe("firstRowFill", () => {
  const team = roster([{ cin: "9" }, { cin: "4", isTeamLeader: true }]);

  it("writes the opening and puts the whole team on the first row", () => {
    expect(firstRowFill(0, team, undefined)).toEqual({
      observation: FIRST_ROW_OBSERVATION,
      members: ["4", "9"],
      filledObservation: true,
    });
    expect(FIRST_ROW_OBSERVATION).toBe(
      "Surveillance commenced in the vicinity of "
    );
  });

  it("treats a blank observation as none", () => {
    expect(firstRowFill(0, team, "   ").observation).toBe(
      FIRST_ROW_OBSERVATION
    );
  });

  it("never replaces text that was given, but still puts the team on the first row", () => {
    expect(firstRowFill(0, team, "Observed a car.")).toEqual({
      observation: "Observed a car.",
      members: ["4", "9"],
      filledObservation: false,
    });
  });

  it("leaves a sheet that already has a row alone", () => {
    expect(firstRowFill(1, team, undefined)).toEqual({
      observation: undefined,
      members: [],
      filledObservation: false,
    });
    expect(firstRowFill(5, team, "Text").observation).toBe("Text");
  });

  it("writes the opening even when the sheet has no team roster", () => {
    expect(firstRowFill(0, null, undefined)).toEqual({
      observation: FIRST_ROW_OBSERVATION,
      members: [],
      filledObservation: true,
    });
  });
});
