import { describe, expect, it } from "vitest";
import {
  NO_TARGET_LABEL,
  hoursText,
  overviewOperation,
  shiftTimes,
} from "@shared/weeklyOverview";

const t = (h: number, m = 0) => h * 60 + m;

describe("shiftTimes", () => {
  it("shows start and finish as 24-hour clock times", () => {
    expect(
      shiftTimes({
        date: "2026-10-21",
        startMinutes: t(7),
        finishMinutes: t(14, 10),
      })
    ).toBe("07:00 – 14:10");
  });
  it("says what is missing rather than guessing it", () => {
    expect(
      shiftTimes({ date: "d", startMinutes: t(7), finishMinutes: null })
    ).toBe("07:00 – (no finish time)");
    expect(
      shiftTimes({ date: "d", startMinutes: null, finishMinutes: t(14) })
    ).toBe("(no start time) – 14:00");
    expect(
      shiftTimes({ date: "d", startMinutes: null, finishMinutes: null })
    ).toBe("times not recorded");
  });
});

describe("hoursText", () => {
  it("shows hours, or a dash with none", () => {
    expect(hoursText(8.5)).toBe("8.5 h");
    expect(hoursText(0)).toBe("0 h");
    expect(hoursText(null)).toBe("—");
  });
});

describe("overviewOperation", () => {
  const op = {
    operationName: "AURORA",
    sheetsCount: 3,
    rowsCount: 71,
    targets: [
      {
        targetName: "Amadou TRAORE",
        coverageHours: 15.5,
        shifts: [
          { date: "2026-10-22", startMinutes: t(13), finishMinutes: t(21, 30) },
          { date: "2026-10-21", startMinutes: t(7), finishMinutes: t(14) },
        ],
      },
      {
        targetName: "Kieran DOYLE",
        coverageHours: null,
        shifts: [
          { date: "2026-10-21", startMinutes: null, finishMinutes: null },
        ],
      },
      { targetName: null, coverageHours: 2, shifts: [] },
    ],
  };

  it("lists each target with its days and times, earliest first, and its hours", () => {
    const o = overviewOperation(op);
    expect(o.targets[0]).toEqual({
      name: "Amadou TRAORE",
      shifts: [
        { date: "2026-10-21", times: "07:00 – 14:00" },
        { date: "2026-10-22", times: "13:00 – 21:30" },
      ],
      hours: 15.5,
      days: 2,
    });
    expect(o.targets[1].shifts).toEqual([
      { date: "2026-10-21", times: "times not recorded" },
    ]);
    expect(o.targets[1].hours).toBeNull();
  });

  it("names sheets with no target, and counts only named targets", () => {
    const o = overviewOperation(op);
    expect(o.targets[2].name).toBe(NO_TARGET_LABEL);
    expect(o.targetCount).toBe(2);
  });

  it("totals the days worked and the hours, leaving out targets with none", () => {
    const o = overviewOperation(op);
    expect(o.days).toBe(2);
    expect(o.hours).toBe(17.5);
    expect(o.sheetsCount).toBe(3);
    expect(
      overviewOperation({ ...op, targets: [op.targets[1]] }).hours
    ).toBeNull();
  });
});
