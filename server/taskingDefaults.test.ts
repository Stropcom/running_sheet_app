import { describe, expect, it } from "vitest";
import {
  PTT_CAP_SHIFT,
  defaultTaskingShift,
  hasFixedShiftHours,
  isSurv1DayShift,
} from "../shared/taskingDefaults";
import { SHIFT_PRESETS } from "../shared/taskingTimeline";
import { shiftAfterTaskChange } from "../shared/taskingShiftHours";

const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shiftsOf = (team: "surv1" | "surv2" | "ptt" | "cap", weekStart: string) =>
  week.map((_, i) => defaultTaskingShift(team, i, weekStart));

describe("PTT and Capability start the week with an 8-hour shift", () => {
  it("is 0600-1400 Monday to Friday and RDO at the weekend, in every week", () => {
    for (const w of ["2026-07-13", "2026-07-20", "2026-11-16", "2027-01-04"])
      for (const team of ["ptt", "cap"] as const)
        expect(shiftsOf(team, w)).toEqual([
          "0600-1400",
          "0600-1400",
          "0600-1400",
          "0600-1400",
          "0600-1400",
          "RDO",
          "RDO",
        ]);
    expect(PTT_CAP_SHIFT).toBe("0600-1400");
  });

  it("is one of the ready-made shifts the cell offers", () => {
    expect(SHIFT_PRESETS).toContain(PTT_CAP_SHIFT);
  });

  it("keeps its shift length whatever the task: the Admin / operation switch is for Team 1 and 2", () => {
    expect(hasFixedShiftHours("ptt")).toBe(true);
    expect(hasFixedShiftHours("cap")).toBe(true);
    expect(hasFixedShiftHours("surv1")).toBe(false);
    expect(hasFixedShiftHours("surv2")).toBe(false);
    // (the rule itself would lengthen it, which is why they are left out of it)
    expect(shiftAfterTaskChange("0600-1400", "Admin", "RAVEN")).toBe(
      "0600-1500"
    );
  });
});

describe("Team 1 and Team 2 still alternate Days and Arvos", () => {
  it("Team 1 is on Days the anchor week and every second week", () => {
    expect(isSurv1DayShift("2026-07-20")).toBe(true);
    expect(isSurv1DayShift("2026-07-27")).toBe(false);
    expect(isSurv1DayShift("2026-07-13")).toBe(false);
    expect(isSurv1DayShift("2026-08-03")).toBe(true);
  });
  it("gives the Day team 0600-1500 and the Arvo team 1300-2200 with Monday off and a short Friday", () => {
    expect(shiftsOf("surv1", "2026-07-20")).toEqual([
      "0600-1500",
      "0600-1500",
      "0600-1500",
      "0600-1500",
      "0600-1500",
      "RDO",
      "RDO",
    ]);
    expect(shiftsOf("surv2", "2026-07-20")).toEqual([
      "RDO",
      "1300-2200",
      "1300-2200",
      "1300-2200",
      "1000-1800",
      "RDO",
      "RDO",
    ]);
  });
});
