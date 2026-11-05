import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  opForRosterTile,
  opsByTeam,
  postedTaskingOps,
} from "../shared/rosterTaskingOps";

const cells = [
  {
    weekStart: "2026-11-02",
    dayIndex: 0,
    teamRow: "surv1",
    primaryTask: "RAVEN",
  },
  {
    weekStart: "2026-11-02",
    dayIndex: 3,
    teamRow: "ptt",
    primaryTask: " AURORA ",
  },
  { weekStart: "2026-11-02", dayIndex: 1, teamRow: "surv2", primaryTask: null },
  { weekStart: "2026-11-02", dayIndex: 2, teamRow: "cap", primaryTask: "" },
  {
    weekStart: "2026-11-09",
    dayIndex: 0,
    teamRow: "surv1",
    primaryTask: "FALCON",
  },
];
const posted = new Set(["2026-11-02"]);

describe("posted tasking operations for the roster", () => {
  it("adds days without timezone slips", () => {
    expect(addDaysISO("2026-11-02", 3)).toBe("2026-11-05");
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("uses posted weeks only, and only cells that name an operation", () => {
    const ops = postedTaskingOps(cells, posted, "2026-01-01", "2026-12-31");
    expect(ops).toEqual([
      { date: "2026-11-02", teamRow: "surv1", primary: "RAVEN" },
      { date: "2026-11-05", teamRow: "ptt", primary: "AURORA" },
    ]); // FALCON's week is not posted
  });

  it("keeps to the dates asked for", () => {
    const ops = postedTaskingOps(cells, posted, "2026-11-04", "2026-11-30");
    expect(ops.map(o => o.primary)).toEqual(["AURORA"]);
  });

  it("groups by roster team name and date", () => {
    const by = opsByTeam(
      postedTaskingOps(cells, posted, "2026-01-01", "2026-12-31")
    );
    expect(by.get("Team 1")).toEqual({ "2026-11-02": "RAVEN" });
    expect(by.get("PTT")).toEqual({ "2026-11-05": "AURORA" });
    expect(by.has("Capability")).toBe(false);
  });

  it("shows on a tile only when the person is on duty", () => {
    const team = { "2026-11-02": "RAVEN" };
    for (const code of ["d", "a", "ad", "doc", "aoc", "adoc"])
      expect(opForRosterTile(team, code, "2026-11-02")).toBe("RAVEN");
    for (const code of ["r", "l", "o", "c", "tt", "dep", ""])
      expect(opForRosterTile(team, code, "2026-11-02")).toBe("");
    expect(opForRosterTile(team, "d", "2026-11-03")).toBe("");
    expect(opForRosterTile(undefined, "d", "2026-11-02")).toBe("");
  });
});
