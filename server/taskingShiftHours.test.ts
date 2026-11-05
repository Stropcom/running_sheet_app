import { describe, expect, it } from "vitest";
import {
  ADMIN_SHIFT,
  ARVO_SHIFT,
  DAY_SHIFT,
  legacyShiftTo9h,
  normaliseShift,
  shiftAfterTaskChange,
} from "../shared/taskingShiftHours";
import { shiftLength } from "../shared/taskingTimeline";
import { SHIFT_TIMES } from "../shared/ctoRosterShiftUtils";

describe("tasking shift hours", () => {
  it("Day and Arvo are 9 hours, Admin 8, and match the roster's starts", () => {
    expect(shiftLength(DAY_SHIFT)).toBe(9 * 60);
    expect(shiftLength(ARVO_SHIFT)).toBe(9 * 60);
    expect(shiftLength(ADMIN_SHIFT)).toBe(8 * 60);
    expect(SHIFT_TIMES.d).toBe("06:00");
    expect(SHIFT_TIMES.doc).toBe("06:00");
    expect(SHIFT_TIMES.a).toBe("13:00");
    expect(SHIFT_TIMES.aoc).toBe("13:00");
  });

  it("reads shifts written in other ways", () => {
    expect(normaliseShift("06:00 – 15:00")).toBe("0600-1500");
    expect(normaliseShift("RDO")).toBe("RDO");
    expect(normaliseShift(null)).toBe("");
  });

  it("choosing Admin makes a 9-hour shift 8 hours", () => {
    // the standard Day becomes the 0700-1500 Admin shift
    expect(shiftAfterTaskChange("0600-1500", "RAVEN", "Admin")).toBe(
      ADMIN_SHIFT
    );
    expect(shiftAfterTaskChange("0600-1500", null, "admin")).toBe(ADMIN_SHIFT);
    // any other 9-hour shift keeps its start and loses its last hour
    expect(shiftAfterTaskChange("1300-2200", "RAVEN", "Admin")).toBe(
      "1300-2100"
    );
    expect(shiftAfterTaskChange("0800-1700", "RAVEN", "Admin")).toBe(
      "0800-1600"
    );
  });

  it("changing from Admin to an operation makes an 8-hour shift 9 hours", () => {
    expect(shiftAfterTaskChange("0700-1500", "Admin", "RAVEN")).toBe(DAY_SHIFT);
    expect(shiftAfterTaskChange("0700-1500", "Admin", "Other")).toBe(DAY_SHIFT);
    // the Friday shifts: start kept, a hour added
    expect(shiftAfterTaskChange("0600-1400", "Admin", "AURORA")).toBe(
      "0600-1500"
    );
    expect(shiftAfterTaskChange("1300-2100", "Admin", "AURORA")).toBe(
      "1300-2200"
    );
    expect(shiftAfterTaskChange("1000-1800", "Admin", "RAVEN")).toBe(
      "1000-1900"
    );
  });

  it("going to Admin and back returns to where it started", () => {
    for (const start of ["0600-1500", "1300-2200"]) {
      const admin = shiftAfterTaskChange(start, "RAVEN", "Admin")!;
      expect(shiftAfterTaskChange(admin, "Admin", "RAVEN")).toBe(start);
    }
  });

  it("leaves other shift lengths and other changes alone", () => {
    expect(shiftAfterTaskChange("0600-1600", "RAVEN", "Admin")).toBeNull(); // 10 h
    expect(shiftAfterTaskChange("0600-1600", "Admin", "RAVEN")).toBeNull();
    expect(shiftAfterTaskChange("0600-1400", "RAVEN", "Admin")).toBeNull(); // already 8 h
    expect(shiftAfterTaskChange("0600-1500", "Admin", "RAVEN")).toBeNull(); // already 9 h
    // operation to operation, Admin to Admin, RDO, clearing the task
    expect(shiftAfterTaskChange("0600-1500", "RAVEN", "FALCON")).toBeNull();
    expect(shiftAfterTaskChange("0700-1500", "Admin", "Admin")).toBeNull();
    expect(shiftAfterTaskChange("RDO", "RAVEN", "Admin")).toBeNull();
    expect(shiftAfterTaskChange("0700-1500", "Admin", "")).toBeNull();
    expect(shiftAfterTaskChange("0700-1500", "Admin", null)).toBeNull();
  });

  it("converts old 8-hour shifts to 9 hours, except Admin", () => {
    expect(legacyShiftTo9h("0700-1500", "RAVEN")).toBe(DAY_SHIFT);
    expect(legacyShiftTo9h("07:00-15:00", null)).toBe(DAY_SHIFT);
    expect(legacyShiftTo9h("1400-2200", "FALCON")).toBe(ARVO_SHIFT);
    expect(legacyShiftTo9h("0700-1500", "Admin")).toBeNull();
    expect(legacyShiftTo9h("0600-1400", "RAVEN")).toBe(DAY_SHIFT);
    expect(legacyShiftTo9h("1300-2100", "RAVEN")).toBe(ARVO_SHIFT);
    expect(legacyShiftTo9h("1300-2100", "Admin")).toBeNull();
    expect(legacyShiftTo9h("1000-1800", "RAVEN")).toBeNull();
    expect(legacyShiftTo9h("RDO", "RAVEN")).toBeNull();
    expect(legacyShiftTo9h("0600-1500", "RAVEN")).toBeNull();
  });
});
