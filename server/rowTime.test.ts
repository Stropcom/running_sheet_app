import { describe, expect, it } from "vitest";
import {
  formatRowTime,
  perthMinutesAndDate,
  rowTimeForNewRow,
} from "@shared/rowTime";

// Perth is UTC+8 all year, so 07:40 UTC is 03:40 PM in Perth.
const AFTERNOON = new Date("2026-10-30T07:40:00Z");

describe("the time on a new row", () => {
  it("writes the time the way a sheet shows it", () => {
    expect(formatRowTime(15 * 60 + 40)).toBe("03:40 PM");
    expect(formatRowTime(0)).toBe("12:00 AM");
    expect(formatRowTime(12 * 60 + 5)).toBe("12:05 PM");
    expect(formatRowTime(9 * 60 + 7)).toBe("09:07 AM");
    expect(formatRowTime(23 * 60 + 59)).toBe("11:59 PM");
  });

  it("reads the Perth minutes and date of an instant", () => {
    expect(perthMinutesAndDate(AFTERNOON)).toEqual({
      minutes: 15 * 60 + 40,
      dateISO: "2026-10-30",
    });
    // 16:30 UTC is half past midnight the next day in Perth.
    expect(perthMinutesAndDate(new Date("2026-10-30T16:30:00Z"))).toEqual({
      minutes: 30,
      dateISO: "2026-10-31",
    });
  });

  it("stamps the current time on a row made with none, on today's sheet", () => {
    expect(
      rowTimeForNewRow({ now: AFTERNOON, sheetDate: "2026-10-30" })
    ).toEqual({ time: "03:40 PM", timeMinutes: 940, stamped: true });
  });

  it("stamps it on a sheet with no date yet", () => {
    expect(rowTimeForNewRow({ now: AFTERNOON, sheetDate: null }).stamped).toBe(
      true
    );
  });

  it("never replaces a time that was given", () => {
    expect(
      rowTimeForNewRow({
        now: AFTERNOON,
        sheetDate: "2026-10-30",
        time: "01:15 PM",
        timeMinutes: 795,
      })
    ).toEqual({ time: "01:15 PM", timeMinutes: 795, stamped: false });
    // Either one counts as given.
    expect(rowTimeForNewRow({ now: AFTERNOON, timeMinutes: 795 }).stamped).toBe(
      false
    );
    expect(rowTimeForNewRow({ now: AFTERNOON, time: "01:15 PM" }).stamped).toBe(
      false
    );
  });

  it("treats an empty time as none", () => {
    expect(rowTimeForNewRow({ now: AFTERNOON, time: "  " }).stamped).toBe(true);
  });

  it("leaves a sheet for another day without a time", () => {
    for (const sheetDate of ["2026-10-29", "2026-10-31"])
      expect(rowTimeForNewRow({ now: AFTERNOON, sheetDate })).toEqual({
        time: undefined,
        timeMinutes: undefined,
        stamped: false,
      });
  });
});
