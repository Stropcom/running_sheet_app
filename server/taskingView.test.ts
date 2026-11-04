import { describe, expect, it } from "vitest";
import {
  MAX_EXPORT_VIEWS,
  viewOnPhone,
  cellHasOp,
  formatShiftText,
  parseShiftRange,
  readCell,
  readWeek,
  timelineSpan,
  toggleExportView,
  todayIndex,
  weekDays,
  weekOps,
  weekSummary,
} from "@shared/taskingView";

describe("parseShiftRange", () => {
  it("reads the shift options and typed times as minutes", () => {
    expect(parseShiftRange("0700-1500")).toEqual([420, 900]);
    expect(parseShiftRange("07:00 - 15:00")).toEqual([420, 900]);
    expect(parseShiftRange("1400–2200")).toEqual([840, 1320]);
  });
  it("cuts a shift that runs past midnight at 24:00", () => {
    expect(parseShiftRange("2200-0600")).toEqual([1320, 1440]);
  });
  it("is null for RDO, blank or anything that is not a time", () => {
    expect(parseShiftRange("RDO")).toBeNull();
    expect(parseShiftRange("")).toBeNull();
    expect(parseShiftRange("Custom")).toBeNull();
    expect(parseShiftRange("9900-1500")).toBeNull();
  });
});

describe("formatShiftText", () => {
  it("puts an en dash in a plain range and leaves other text alone", () => {
    expect(formatShiftText("0700-1500")).toBe("0700–1500");
    expect(formatShiftText("RDO")).toBe("RDO");
    expect(formatShiftText("8am to 4pm")).toBe("8am to 4pm");
  });
});

describe("readCell / readWeek", () => {
  it("reads a cell with its typed custom shift and Other task", () => {
    const c = readCell({
      shiftTime: "Custom",
      customTime: "0800-1600",
      primaryTask: "Other",
      primaryOther: "Court",
    });
    expect(c).toMatchObject({
      shift: "0800-1600",
      primary: "Court",
      secondary: "",
      off: false,
      range: [480, 960],
    });
  });
  it("marks RDO and an empty cell", () => {
    expect(readCell({ shiftTime: "RDO" })).toMatchObject({
      off: true,
      range: null,
    });
    expect(readCell(undefined)).toMatchObject({
      shift: "",
      off: false,
      range: null,
    });
  });
  it("gives each team seven cells, Monday first", () => {
    const w = readWeek(
      { "t1-1": { shiftTime: "1400-2200", primaryTask: "RAVEN" } },
      ["t1", "t2"]
    );
    expect(w.t1).toHaveLength(7);
    expect(w.t1[1].primary).toBe("RAVEN");
    expect(w.t2.every(c => c.shift === "")).toBe(true);
  });
});

describe("week helpers", () => {
  const w = readWeek(
    {
      "t1-0": { shiftTime: "RDO" },
      "t1-1": { shiftTime: "1400-2200", primaryTask: "RAVEN" },
      "t1-4": {
        shiftTime: "1000-1800",
        primaryTask: "Admin",
        secondaryTask: "Training",
      },
      "t2-0": {
        shiftTime: "0700-1500",
        primaryTask: "AURORA",
        secondaryTask: "RAVEN",
      },
    },
    ["t1", "t2"]
  );
  it("lists the operations in grid order, primary before secondary", () => {
    expect(weekOps(w)).toEqual(["RAVEN", "Admin", "Training", "AURORA"]);
  });
  it("matches a cell on its primary or secondary", () => {
    expect(cellHasOp(w.t2[0], "RAVEN")).toBe(true);
    expect(cellHasOp(w.t2[0], "AURORA")).toBe(true);
    expect(cellHasOp(w.t2[0], "Admin")).toBe(false);
  });
  it("totals shifts, days off and primary shifts by operation", () => {
    expect(weekSummary(w)).toEqual({
      shifts: 3,
      rdo: 1,
      primaryByOp: { RAVEN: 1, Admin: 1, AURORA: 1 },
    });
  });
  it("finds today's column and dates the week", () => {
    expect(todayIndex("2026-11-02", "2026-11-04")).toBe(2);
    expect(todayIndex("2026-11-02", "2026-11-09")).toBe(-1);
    expect(weekDays("2026-10-26")[6]).toMatchObject({
      name: "Sun",
      day: 1,
      month: "Nov",
      iso: "2026-11-01",
    });
  });
  it("keeps the timeline 05:00 to 23:00 unless a shift needs more", () => {
    expect(timelineSpan(w)).toEqual([300, 1380]);
    const wide = readWeek({ "t1-0": { shiftTime: "0400-2330" } }, ["t1"]);
    expect(timelineSpan(wide)).toEqual([240, 1440]);
  });
});

describe("toggleExportView", () => {
  it("adds and removes, keeping the order ticked", () => {
    expect(toggleExportView([], "a")).toEqual(["a"]);
    expect(toggleExportView(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleExportView(["a", "b"], "a")).toEqual(["b"]);
  });
  it("refuses a third layout and drops nothing", () => {
    expect(toggleExportView(["a", "b"], "c")).toEqual(["a", "b"]);
    expect(MAX_EXPORT_VIEWS).toBe(2);
  });
});

describe("calendar layouts on a phone", () => {
  it("keeps Day tiles and Timeline, and shows Day tiles for any other saved choice", () => {
    expect(viewOnPhone("tile-days")).toBe("tile-days");
    expect(viewOnPhone("cal-timeline")).toBe("cal-timeline");
    expect(viewOnPhone("panel-banded")).toBe("tile-days");
    expect(viewOnPhone("panel-tables")).toBe("tile-days");
    expect(viewOnPhone("something old")).toBe("tile-days");
  });
});
