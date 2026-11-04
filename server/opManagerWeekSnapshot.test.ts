import { describe, expect, it } from "vitest";
import {
  buildWeekSnapshot,
  isEmptySnapshot,
  parseWeekSnapshot,
} from "@shared/opManagerWeekSnapshot";

describe("week snapshot", () => {
  const full = buildWeekSnapshot({
    contacts: [
      { role: "CTO Inspector", userId: 5, phone: "0400", sortOrder: 0 },
    ],
    priority: [
      {
        category: "A-TACC",
        priority: 1,
        operationName: "RAVEN",
        operationId: 9,
        sortOrder: 0,
      },
    ],
    tasking: [
      {
        dayIndex: 2,
        teamRow: "surv1",
        shiftTime: "0600-1400",
        primaryTask: "RAVEN",
      },
    ],
    posted: { postedAt: new Date(1_700_000_000_000), postedBy: 3 },
  });

  it("round-trips through JSON with nothing lost", () => {
    const back = parseWeekSnapshot(JSON.stringify(full));
    expect(back).toEqual(full);
    expect(back.contacts[0]).toEqual({
      role: "CTO Inspector",
      userId: 5,
      customName: null,
      phone: "0400",
      sortOrder: 0,
    });
    expect(back.posted).toEqual({ postedAt: 1_700_000_000_000, postedBy: 3 });
  });

  it("keeps a week that was never posted as not posted", () => {
    const s = buildWeekSnapshot({
      contacts: [],
      priority: [],
      tasking: [],
      posted: null,
    });
    expect(parseWeekSnapshot(JSON.stringify(s)).posted).toBeNull();
    expect(isEmptySnapshot(s)).toBe(true);
    expect(isEmptySnapshot(full)).toBe(false);
  });

  it("restores what it can from a damaged snapshot", () => {
    expect(isEmptySnapshot(parseWeekSnapshot("not json"))).toBe(true);
    const odd = parseWeekSnapshot(
      JSON.stringify({
        contacts: [{ role: "PTT", sortOrder: 1 }, { sortOrder: 2 }, "x"],
        priority: [{ category: "WC" }],
        tasking: [{ dayIndex: 1, teamRow: "ptt" }, { dayIndex: "1" }],
        posted: { postedAt: "now" },
      })
    );
    expect(odd.contacts.map(c => c.role)).toEqual(["PTT"]);
    expect(odd.priority).toEqual([]);
    expect(odd.tasking).toEqual([
      {
        dayIndex: 1,
        teamRow: "ptt",
        shiftTime: null,
        primaryTask: null,
        secondaryTask: null,
        blended: false,
      },
    ]);
    expect(odd.posted).toBeNull();
  });
});
