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

  it("choosing Admin makes a standard Day or Arvo shift 0700-1500", () => {
    expect(shiftAfterTaskChange("0600-1500", "RAVEN", "Admin")).toBe(
      ADMIN_SHIFT
    );
    expect(shiftAfterTaskChange("1300-2200", "RAVEN", "admin")).toBe(
      ADMIN_SHIFT
    );
    expect(shiftAfterTaskChange("0600-1500", null, "Admin")).toBe(ADMIN_SHIFT);
  });

  it("changing from Admin to an operation makes it the 9-hour Day shift", () => {
    expect(shiftAfterTaskChange("0700-1500", "Admin", "RAVEN")).toBe(DAY_SHIFT);
    expect(shiftAfterTaskChange("0700-1500", "Admin", "Other")).toBe(DAY_SHIFT);
  });

  it("leaves other shifts and other changes alone", () => {
    // a shift set to some other time is never changed
    expect(shiftAfterTaskChange("0930-1730", "RAVEN", "Admin")).toBeNull();
    expect(shiftAfterTaskChange("1000-1800", "Admin", "RAVEN")).toBeNull();
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
    expect(legacyShiftTo9h("1000-1800", "RAVEN")).toBeNull();
    expect(legacyShiftTo9h("RDO", "RAVEN")).toBeNull();
    expect(legacyShiftTo9h("0600-1500", "RAVEN")).toBeNull();
  });
});
