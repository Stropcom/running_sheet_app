import { describe, expect, it } from "vitest";
import { pickCopySourceWeek } from "@shared/opManagerWeeks";

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
