import { describe, expect, it } from "vitest";
import {
  notifyRecipientIds,
  pickCopySourceWeek,
  weekRangeLabel,
} from "@shared/opManagerWeeks";

const w = (weekStart: string, contacts: number, priority: number) => ({
  weekStart,
  contacts,
  priority,
});

describe("pickCopySourceWeek", () => {
  it("takes the most recent earlier week that has contacts or a priority board", () => {
    expect(
      pickCopySourceWeek(
        [w("2026-10-12", 4, 3), w("2026-10-19", 4, 0), w("2026-10-26", 0, 0)],
        "2026-11-02"
      )
    ).toEqual(w("2026-10-19", 4, 0));
  });

  it("skips a listed week that only has a calendar", () => {
    expect(
      pickCopySourceWeek(
        [w("2026-10-19", 3, 2), w("2026-10-26", 0, 0)],
        "2026-11-02"
      )
    ).toEqual(w("2026-10-19", 3, 2));
  });

  it("never takes the new week itself or a later one", () => {
    expect(
      pickCopySourceWeek(
        [w("2026-11-02", 4, 4), w("2026-11-09", 4, 4)],
        "2026-11-02"
      )
    ).toBeNull();
  });

  it("is null when no earlier week has anything to copy", () => {
    expect(pickCopySourceWeek([], "2026-11-02")).toBeNull();
    expect(
      pickCopySourceWeek([w("2026-10-26", 0, 0)], "2026-11-02")
    ).toBeNull();
  });
});

describe("weekRangeLabel", () => {
  it("names the Monday-to-Sunday range, across a month end too", () => {
    expect(weekRangeLabel("2026-11-02")).toBe("02 Nov – 08 Nov");
    expect(weekRangeLabel("2026-10-26")).toBe("26 Oct – 01 Nov");
    expect(weekRangeLabel("2040-12-31")).toBe("31 Dec – 06 Jan");
  });
});

describe("notifyRecipientIds", () => {
  const users = [
    { id: 1, command: "WESTERN" },
    { id: 2, command: "WESTERN", archivedAt: new Date() },
    { id: 3, command: "EASTERN" }, // another Command, never shared
    { id: 4, command: "EASTERN" }, // another Command, hosted by WESTERN
    { id: 5, command: "WESTERN" },
  ];

  it("is the Command's own people plus the visitors it currently hosts", () => {
    expect(
      Array.from(notifyRecipientIds(users, "WESTERN", new Set([4]))).sort()
    ).toEqual([1, 4, 5]);
  });

  it("drops a visitor whose access was revoked, and anyone archived", () => {
    const ids = notifyRecipientIds(users, "WESTERN", new Set());
    expect(ids.has(4)).toBe(false);
    expect(ids.has(3)).toBe(false);
    expect(ids.has(2)).toBe(false);
  });
});
