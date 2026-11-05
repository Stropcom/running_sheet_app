import { describe, expect, it } from "vitest";
import {
  codeForStart,
  groupSyncChanges,
  planTaskingRosterSync,
  toClock,
} from "../shared/taskingRosterSync";

const members = [
  { id: 1, name: "Ann", teamId: 10, excludedFromCounts: false },
  { id: 2, name: "Ben", teamId: 10, excludedFromCounts: false },
  { id: 3, name: "Cat", teamId: 10, excludedFromCounts: true },
  { id: 4, name: "Dan", teamId: 20, excludedFromCounts: false },
];
const shift = (
  memberId: number,
  shiftDate: string,
  shiftCode: string,
  shiftTime: string | null = null
) => ({
  memberId,
  shiftDate,
  shiftCode,
  shiftTime,
});
const T1 = (date: string, h: number, m = 0) => ({
  teamId: 10,
  teamName: "Team 1",
  date,
  startMinutes: h * 60 + m,
});

describe("start time to shift type", () => {
  it("makes a start at or after midday an afternoon shift", () => {
    expect(codeForStart("d", 12 * 60)).toBe("a");
    expect(codeForStart("d", 14 * 60)).toBe("a");
    expect(codeForStart("a", 9 * 60)).toBe("d");
    expect(codeForStart("a", 11 * 60 + 59)).toBe("d");
    expect(codeForStart("doc", 13 * 60)).toBe("aoc");
    expect(codeForStart("aoc", 7 * 60)).toBe("doc");
  });
  it("keeps an Admin shift's type", () => {
    expect(codeForStart("ad", 14 * 60)).toBe("ad");
    expect(codeForStart("adoc", 7 * 60)).toBe("adoc");
  });
  it("writes a clock", () => {
    expect(toClock(9 * 60 + 30)).toBe("09:30");
    expect(toClock(23 * 60)).toBe("23:00");
  });
});

describe("who and what changes", () => {
  const base = { members, secondments: [], today: "2026-11-05" };

  it("changes the on-duty members of the team and nobody else", () => {
    const changes = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-06", 9)],
      shifts: [
        shift(1, "2026-11-06", "d"),
        shift(2, "2026-11-06", "r"), // rest day: not on duty
        shift(3, "2026-11-06", "d"), // excluded from counts
        shift(4, "2026-11-06", "d"), // another team
      ],
    });
    expect(changes.map(c => c.memberId)).toEqual([1]);
    expect(changes[0]).toMatchObject({
      fromCode: "d",
      toCode: "d",
      fromTime: "07:00",
      toTime: "09:00",
      storeTime: "09:00",
    });
  });

  it("turns a Day into an Arvo for a start at or after midday", () => {
    const [c] = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-06", 14)],
      shifts: [shift(1, "2026-11-06", "d")],
    });
    expect(c).toMatchObject({ fromCode: "d", toCode: "a", toTime: "14:00" });
  });

  it("stores no override when the time is the new type's usual start", () => {
    const [c] = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-06", 13)],
      shifts: [shift(1, "2026-11-06", "d")],
    });
    expect(c).toMatchObject({ toCode: "a", storeTime: null });
  });

  it("leaves a shift that already starts at the tasking time alone", () => {
    expect(
      planTaskingRosterSync({
        ...base,
        targets: [T1("2026-11-06", 7)],
        shifts: [shift(1, "2026-11-06", "d")],
      })
    ).toEqual([]);
    expect(
      planTaskingRosterSync({
        ...base,
        targets: [T1("2026-11-06", 9)],
        shifts: [shift(1, "2026-11-06", "d", "09:00")],
      })
    ).toEqual([]);
  });

  it("never touches past days, today is included", () => {
    const changes = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-04", 9), T1("2026-11-05", 9)],
      shifts: [shift(1, "2026-11-04", "d"), shift(1, "2026-11-05", "d")],
    });
    expect(changes.map(c => c.date)).toEqual(["2026-11-05"]);
  });

  it("counts a seconded member for the team they are seconded to", () => {
    const secondments = [
      {
        memberId: 4,
        destinationTeamId: 10,
        startDate: "2026-11-06",
        endDate: "2026-11-07",
      },
    ];
    const changes = planTaskingRosterSync({
      members,
      secondments,
      today: "2026-11-05",
      targets: [T1("2026-11-06", 9), T1("2026-11-09", 9)],
      shifts: [
        shift(4, "2026-11-06", "d"),
        shift(4, "2026-11-09", "d"),
        shift(1, "2026-11-06", "d"),
      ],
    });
    // On the 6th Dan is Team 1's; on the 9th he is back in his own team.
    expect(changes.map(c => `${c.memberId}@${c.date}`).sort()).toEqual([
      "1@2026-11-06",
      "4@2026-11-06",
    ]);
  });

  it("keeps an Admin shift's type and only moves its time", () => {
    const [c] = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-06", 14)],
      shifts: [shift(1, "2026-11-06", "ad")],
    });
    expect(c).toMatchObject({ fromCode: "ad", toCode: "ad", toTime: "14:00" });
  });
});

describe("the question's summary", () => {
  it("groups by day and team and counts type changes", () => {
    const changes = planTaskingRosterSync({
      members,
      secondments: [],
      today: "2026-11-05",
      targets: [T1("2026-11-06", 14)],
      shifts: [shift(1, "2026-11-06", "d"), shift(2, "2026-11-06", "a")],
    });
    expect(groupSyncChanges(changes)).toEqual([
      {
        teamName: "Team 1",
        date: "2026-11-06",
        toTime: "14:00",
        members: 2,
        fromTimes: "07:00, 13:00",
        typeChanges: 1,
      },
    ]);
  });
});
