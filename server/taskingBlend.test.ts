import { describe, expect, it } from "vitest";
import {
  blendFields,
  blendPartner,
  cellShift,
  isBlendDay,
  isBlendTeam,
  shouldAskBlend,
  tasksDiffer,
} from "@shared/taskingBlend";
import { readCell, readWeek } from "@shared/taskingView";

describe("blended days", () => {
  it("knows the two teams and each one's partner", () => {
    expect(isBlendTeam("surv1")).toBe(true);
    expect(isBlendTeam("ptt")).toBe(false);
    expect(blendPartner("surv1")).toBe("surv2");
    expect(blendPartner("surv2")).toBe("surv1");
  });

  it("reads a custom shift as its time", () => {
    expect(cellShift({ shiftTime: "Custom", customTime: " 0800-1600 " })).toBe(
      "0800-1600"
    );
    expect(cellShift({ shiftTime: "0600-1400" })).toBe("0600-1400");
    expect(cellShift(undefined)).toBe("");
  });

  it("only treats a day as blended when both teams carry the flag", () => {
    const grid = {
      "surv1-0": { shiftTime: "0600-1400", blended: true },
      "surv2-0": { shiftTime: "0600-1400", blended: true },
      "surv1-1": { shiftTime: "0600-1400", blended: true },
      "surv2-1": { shiftTime: "0600-1400" },
    };
    const week = readWeek(grid, ["surv1", "surv2"]);
    expect(isBlendDay(week, 0)).toBe(true);
    expect(isBlendDay(week, 1)).toBe(false);
    expect(isBlendDay(week, 2)).toBe(false);
    expect(readCell({ blended: true }).blended).toBe(true);
    expect(readCell({}).blended).toBe(false);
  });

  it("asks only when both teams are on the same working shift", () => {
    const a = { shiftTime: "0600-1400" };
    expect(
      shouldAskBlend({ surv1: a, surv2: { ...a }, declinedShift: null })
    ).toBe(true);
    // different shifts, RDO or blank: no question
    expect(
      shouldAskBlend({
        surv1: a,
        surv2: { shiftTime: "1400-2200" },
        declinedShift: null,
      })
    ).toBe(false);
    expect(
      shouldAskBlend({
        surv1: { shiftTime: "RDO" },
        surv2: { shiftTime: "RDO" },
        declinedShift: null,
      })
    ).toBe(false);
    expect(shouldAskBlend({ surv1: {}, surv2: {}, declinedShift: null })).toBe(
      false
    );
    // custom times that match count as the same shift
    expect(
      shouldAskBlend({
        surv1: { shiftTime: "Custom", customTime: "0800-1600" },
        surv2: { shiftTime: "Custom", customTime: "0800-1600" },
        declinedShift: null,
      })
    ).toBe(true);
  });

  it("does not ask again after No for that shift, nor when already blended", () => {
    const a = { shiftTime: "0600-1400" };
    expect(
      shouldAskBlend({ surv1: a, surv2: a, declinedShift: "0600-1400" })
    ).toBe(false);
    expect(
      shouldAskBlend({ surv1: a, surv2: a, declinedShift: "1000-1800" })
    ).toBe(true);
    expect(
      shouldAskBlend({
        surv1: { ...a, blended: true },
        surv2: { ...a, blended: true },
        declinedShift: null,
      })
    ).toBe(false);
  });

  it("tells when the two teams' tasks differ", () => {
    expect(
      tasksDiffer(
        { primaryTask: "Operation RAVEN" },
        { primaryTask: "Operation RAVEN" }
      )
    ).toBe(false);
    expect(
      tasksDiffer(
        { primaryTask: "Operation RAVEN" },
        { primaryTask: "Operation FALCON" }
      )
    ).toBe(true);
    expect(
      tasksDiffer(
        { primaryTask: "Other", primaryOther: "Court" },
        { primaryTask: "Other", primaryOther: "Court " }
      )
    ).toBe(false);
    expect(tasksDiffer({}, { secondaryTask: "Training" })).toBe(true);
  });

  it("copies the shared fields from the kept cell", () => {
    expect(
      blendFields({
        shiftTime: "Custom",
        customTime: "0800-1600",
        primaryTask: "Other",
        primaryOther: "Court",
      })
    ).toMatchObject({
      shiftTime: "Custom",
      customTime: "0800-1600",
      primaryTask: "Other",
      primaryOther: "Court",
      secondaryTask: null,
    });
  });
});
