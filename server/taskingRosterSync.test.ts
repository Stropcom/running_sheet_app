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
      fromTime: "06:00",
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
        targets: [T1("2026-11-06", 6)],
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
        fromTimes: "06:00, 13:00",
        fromRest: 0,
        typeChanges: 1,
      },
    ]);
  });
});

describe("a team's rest day that the tasking now has working", () => {
  const base = { members, secondments: [], today: "2026-11-05" };

  it("turns the whole team's Rest Days into a Day shift at the tasking start", () => {
    const changes = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-07", 6)],
      shifts: [shift(1, "2026-11-07", "r"), shift(2, "2026-11-07", "r")],
    });
    expect(changes.map(c => c.memberId)).toEqual([1, 2]);
    expect(changes[0]).toMatchObject({
      fromCode: "r",
      toCode: "d",
      fromTime: "",
      toTime: "06:00",
      storeTime: null,
      fromRest: true,
    });
  });

  it("makes it an Arvo shift for a start at or after midday, with its time kept", () => {
    const [c] = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-07", 14)],
      shifts: [shift(1, "2026-11-07", "r")],
    });
    expect(c).toMatchObject({
      toCode: "a",
      toTime: "14:00",
      storeTime: "14:00",
    });
  });

  it("makes it an Admin shift when the tasking's task is Admin", () => {
    const [c] = planTaskingRosterSync({
      ...base,
      targets: [{ ...T1("2026-11-07", 7), admin: true }],
      shifts: [shift(1, "2026-11-07", "r")],
    });
    expect(c).toMatchObject({
      toCode: "ad",
      toTime: "07:00",
      storeTime: "07:00",
    });
  });

  it("leaves one person's own rest day alone while others in the team are on duty", () => {
    expect(
      planTaskingRosterSync({
        ...base,
        targets: [T1("2026-11-07", 6)],
        shifts: [shift(1, "2026-11-07", "d"), shift(2, "2026-11-07", "r")],
      })
    ).toEqual([]);
  });

  it("changes only the Rest Day members, not Leave, Court, Training, Deployment or On Call", () => {
    const more = [
      ...members,
      { id: 5, name: "Eve", teamId: 10, excludedFromCounts: false },
      { id: 6, name: "Fay", teamId: 10, excludedFromCounts: false },
    ];
    const changes = planTaskingRosterSync({
      ...base,
      members: more,
      targets: [T1("2026-11-07", 6)],
      shifts: [
        shift(1, "2026-11-07", "r"),
        shift(2, "2026-11-07", "l"),
        shift(5, "2026-11-07", "c"),
        shift(6, "2026-11-07", "o"),
      ],
    });
    expect(changes.map(c => c.memberId)).toEqual([1]);
  });

  it("does not touch a person with no roster shift, a past day, someone excluded from counts or another team", () => {
    expect(
      planTaskingRosterSync({
        ...base,
        targets: [T1("2026-11-07", 6), T1("2026-11-04", 6)],
        shifts: [
          shift(1, "2026-11-04", "r"),
          shift(3, "2026-11-07", "r"), // excluded from counts
          shift(4, "2026-11-07", "r"), // Team 2
        ],
      })
    ).toEqual([]);
  });

  it("is summarised as rest-day people, apart from those on duty", () => {
    const changes = planTaskingRosterSync({
      ...base,
      targets: [T1("2026-11-07", 6)],
      shifts: [shift(1, "2026-11-07", "r"), shift(2, "2026-11-07", "r")],
    });
    expect(groupSyncChanges(changes)).toEqual([
      {
        teamName: "Team 1",
        date: "2026-11-07",
        toTime: "06:00",
        members: 2,
        fromTimes: "",
        fromRest: 2,
        typeChanges: 0,
      },
    ]);
  });
});
