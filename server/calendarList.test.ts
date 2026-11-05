import { describe, expect, it } from "vitest";
import { dayKey, groupSheetsByDay } from "../shared/calendarList";

const sheet = (y: number, m: number, d: number, title: string) => ({
  start: new Date(y, m, d, 0, 0, 0),
  title,
});

describe("Calendar list view grouping", () => {
  it("formats a day key from local date parts", () => {
    expect(dayKey(new Date(2026, 10, 5))).toBe("2026-11-05");
    expect(dayKey(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("keeps only the chosen month, in date order, empty days left out", () => {
    const groups = groupSheetsByDay(
      [
        sheet(2026, 10, 9, "20261109 - 492 - GREYFIN (ROCKINGHAM)"),
        sheet(2026, 9, 31, "20261031 - 492 - RAVEN (DARLINGTON)"),
        sheet(2026, 10, 2, "20261102 - 484 - RAVEN (MENORA)"),
        sheet(2026, 11, 1, "20261201 - 503 - RAVEN (MIDLAND)"),
      ],
      2026,
      10
    );
    expect(groups.map(g => g.day)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("puts several sheets on one day together, in title order", () => {
    const groups = groupSheetsByDay(
      [
        sheet(2026, 10, 9, "20261109 - 503 - RAVEN (VALE STREET)"),
        sheet(2026, 10, 9, "20261109 - 484 - RAVEN (MENORA)"),
      ],
      2026,
      10
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(i => i.title)).toEqual([
      "20261109 - 484 - RAVEN (MENORA)",
      "20261109 - 503 - RAVEN (VALE STREET)",
    ]);
  });

  it("returns nothing for a month with no sheets", () => {
    expect(groupSheetsByDay([], 2026, 10)).toEqual([]);
  });
});
