import { describe, expect, it } from "vitest";
import { countOverdue, isSheetOverdue } from "@shared/sheetOverdue";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 10, 12, 0, 0);

describe("overdue sheets", () => {
  it("is a sheet not closed 7 days after it was made", () => {
    expect(
      isSheetOverdue({ isClosed: false, createdAt: now - 8 * DAY }, now)
    ).toBe(true);
    expect(
      isSheetOverdue({ isClosed: false, createdAt: now - 7 * DAY }, now)
    ).toBe(false); // exactly 7 days is not yet over
    expect(
      isSheetOverdue({ isClosed: false, createdAt: now - 2 * DAY }, now)
    ).toBe(false);
  });
  it("is never a closed sheet, however old", () => {
    expect(
      isSheetOverdue({ isClosed: true, createdAt: now - 90 * DAY }, now)
    ).toBe(false);
  });
  it("reads dates given as text, a Date or a number, and skips unreadable ones", () => {
    const old = new Date(now - 9 * DAY);
    expect(
      isSheetOverdue({ isClosed: false, createdAt: old.toISOString() }, now)
    ).toBe(true);
    expect(isSheetOverdue({ isClosed: false, createdAt: old }, now)).toBe(true);
    expect(
      isSheetOverdue({ isClosed: false, createdAt: old.getTime() }, now)
    ).toBe(true);
    expect(isSheetOverdue({ isClosed: false, createdAt: null }, now)).toBe(
      false
    );
    expect(
      isSheetOverdue({ isClosed: false, createdAt: "not a date" }, now)
    ).toBe(false);
  });
  it("counts the overdue ones", () => {
    expect(
      countOverdue(
        [
          { isClosed: false, createdAt: now - 10 * DAY },
          { isClosed: false, createdAt: now - 1 * DAY },
          { isClosed: true, createdAt: now - 10 * DAY },
          { isClosed: false, createdAt: now - 30 * DAY },
        ],
        now
      )
    ).toBe(2);
  });
});
