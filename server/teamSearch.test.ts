import { describe, expect, it } from "vitest";
import {
  SEARCH_LIFETIME_MS,
  isOnSearchTeam,
  isSearchLive,
  rosterCins,
  teamCinsOf,
} from "../shared/teamSearch";

describe("Team Search: who is on the team", () => {
  it("reads the sheet's CIN roster, trimmed, without blanks or repeats", () => {
    expect(
      rosterCins(
        JSON.stringify([
          { cin: " 459 ", isTeamLeader: true },
          { cin: "212" },
          { cin: "459" },
          { cin: "" },
          { nope: 1 },
          null,
        ])
      )
    ).toEqual(["459", "212"]);
  });

  it("an empty, missing or broken roster is no team", () => {
    expect(rosterCins(null)).toEqual([]);
    expect(rosterCins("")).toEqual([]);
    expect(rosterCins("not json")).toEqual([]);
    expect(rosterCins('{"cin":"1"}')).toEqual([]);
  });

  it("a CIN is on the team when it is on the roster or started the search", () => {
    const roster = ["459", "212"];
    expect(isOnSearchTeam({ cin: "212", roster, updatedByCIN: null })).toBe(
      true
    );
    expect(isOnSearchTeam({ cin: "777", roster, updatedByCIN: "777" })).toBe(
      true
    );
    // Not on the roster and not the one who set it: not on the team.
    expect(isOnSearchTeam({ cin: "888", roster, updatedByCIN: "777" })).toBe(
      false
    );
    expect(isOnSearchTeam({ cin: null, roster, updatedByCIN: null })).toBe(
      false
    );
    // A near miss is not a match.
    expect(isOnSearchTeam({ cin: "45", roster, updatedByCIN: null })).toBe(
      false
    );
  });

  it("the tracks are drawn for the roster plus whoever started the search", () => {
    expect(teamCinsOf(["459", "212"], "777")).toEqual(["459", "212", "777"]);
    expect(teamCinsOf(["459"], "459")).toEqual(["459"]);
    expect(teamCinsOf([], null)).toEqual([]);
  });

  it("a search nobody has touched for four hours is over", () => {
    const now = 1_000_000_000_000;
    expect(isSearchLive(now - 60_000, now)).toBe(true);
    expect(isSearchLive(now - SEARCH_LIFETIME_MS, now)).toBe(true);
    expect(isSearchLive(now - SEARCH_LIFETIME_MS - 1, now)).toBe(false);
  });
});
