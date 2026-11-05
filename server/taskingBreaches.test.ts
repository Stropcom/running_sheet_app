import { describe, expect, it } from "vitest";
import {
  distinctBreachCount,
  taskingBreachCells,
  type BreachFindingInput,
} from "../shared/taskingBreaches";

const teams = [
  { id: 1, name: "Team 1" },
  { id: 2, name: "Team 2" },
];
const members = [
  { id: 10, teamId: 1 },
  { id: 11, teamId: 1 },
  { id: 12, teamId: 2, excludedFromCounts: true },
];
const week = ["2026-11-02", "2026-11-03", "2026-11-04"];
const names = ["Team 1", "Team 2"];
const finding = (
  over: Partial<BreachFindingInput> = {}
): BreachFindingInput => ({
  ruleKey: "min_rest",
  ruleTitle: "Minimum rest",
  eaReference: "cl 12.3",
  memberId: 10,
  memberName: "A Member",
  dates: ["2026-11-03"],
  detail: "Only 8h between shifts",
  severity: "error",
  ...over,
});
const codes = (map: Record<string, string>) => (id: number, d: string) =>
  map[`${id}|${d}`] ?? "";

describe("taskingBreachCells", () => {
  it("marks the member's team on the day the finding names", () => {
    const r = taskingBreachCells(
      [finding()],
      teams,
      members,
      [],
      codes({ "10|2026-11-03": "d" }),
      names,
      week
    );
    expect(Object.keys(r)).toEqual(["Team 1|2026-11-03"]);
    expect(r["Team 1|2026-11-03"][0].ruleTitle).toBe("Minimum rest");
  });

  it("does not mark a day the member is not on duty", () => {
    const r = taskingBreachCells(
      [finding()],
      teams,
      members,
      [],
      codes({ "10|2026-11-03": "r" }),
      names,
      week
    );
    expect(r).toEqual({});
  });

  it("ignores days outside the shown week and unknown members", () => {
    const r = taskingBreachCells(
      [finding({ dates: ["2026-10-20"] }), finding({ memberId: 99 })],
      teams,
      members,
      [],
      codes({ "10|2026-10-20": "d", "99|2026-11-03": "d" }),
      names,
      week
    );
    expect(r).toEqual({});
  });

  it("leaves out members excluded from counts", () => {
    const r = taskingBreachCells(
      [finding({ memberId: 12 })],
      teams,
      members,
      [],
      codes({ "12|2026-11-03": "d" }),
      names,
      week
    );
    expect(r).toEqual({});
  });

  it("follows a secondment to the destination team for its dates only", () => {
    const sec = [
      {
        memberId: 10,
        destinationTeamId: 2,
        startDate: "2026-11-03",
        endDate: "2026-11-03",
      },
    ];
    const r = taskingBreachCells(
      [finding({ dates: ["2026-11-02", "2026-11-03"] })],
      teams,
      members,
      sec,
      codes({ "10|2026-11-02": "d", "10|2026-11-03": "a" }),
      names,
      week
    );
    expect(Object.keys(r).sort()).toEqual([
      "Team 1|2026-11-02",
      "Team 2|2026-11-03",
    ]);
  });

  it("lists errors first, counts distinct findings, and does not repeat one", () => {
    const f1 = finding({ severity: "warning", memberId: 11, memberName: "B" });
    const f2 = finding();
    const r = taskingBreachCells(
      [f1, f2, f2],
      teams,
      members,
      [],
      codes({ "10|2026-11-03": "d", "11|2026-11-03": "d" }),
      names,
      week
    );
    const list = r["Team 1|2026-11-03"];
    expect(list).toHaveLength(2);
    expect(list[0].severity).toBe("error");
    expect(distinctBreachCount(r)).toBe(2);
  });
});
