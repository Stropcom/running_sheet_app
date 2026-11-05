import { describe, expect, it } from "vitest";
import {
  changedCellKeys,
  describeTimelineChanges,
  shiftLength,
  shiftToCellFields,
  slideShift,
  snapStart,
} from "../shared/taskingTimeline";

describe("sliding a shift on the timeline", () => {
  it("snaps the start to 30 minutes and keeps it between 05:00 and 23:00", () => {
    expect(snapStart(7 * 60 + 14)).toBe(7 * 60);
    expect(snapStart(7 * 60 + 16)).toBe(7 * 60 + 30);
    expect(snapStart(60)).toBe(5 * 60);
    expect(snapStart(23 * 60 + 50)).toBe(23 * 60);
  });

  it("reads a shift's length, also across midnight", () => {
    expect(shiftLength("0700-1500")).toBe(480);
    expect(shiftLength("2300-0700")).toBe(480);
    expect(shiftLength("RDO")).toBeNull();
    expect(shiftLength("")).toBeNull();
  });

  it("slides a shift and keeps its length", () => {
    expect(slideShift("0700-1500", 9 * 60 + 30)).toBe("0930-1730");
    expect(slideShift("1400-2200", 5 * 60)).toBe("0500-1300");
  });

  it("lets a shift start at 2300 and finish the next morning", () => {
    expect(slideShift("0700-1500", 23 * 60)).toBe("2300-0700");
    // Past 23:00 is held at 23:00.
    expect(slideShift("0700-1500", 23 * 60 + 40)).toBe("2300-0700");
  });

  it("does not slide an RDO or a blank", () => {
    expect(slideShift("RDO", 8 * 60)).toBeNull();
    expect(slideShift("", 8 * 60)).toBeNull();
  });

  it("stores a ready-made shift as itself and anything else as Custom", () => {
    expect(shiftToCellFields("0700-1500")).toEqual({
      shiftTime: "0700-1500",
      customTime: "",
    });
    expect(shiftToCellFields("0930-1730")).toEqual({
      shiftTime: "Custom",
      customTime: "0930-1730",
    });
  });
});

describe("what is waiting to be saved", () => {
  const label = (id: string) => (id === "surv1" ? "Team 1" : "Team 2");
  const day = (i: number) => ["Mon", "Tue", "Wed"][i] ?? `Day ${i}`;
  const saved = {
    "surv1-0": { shiftTime: "0700-1500", primaryTask: "RAVEN" },
    "surv2-0": { shiftTime: "0700-1500", primaryTask: "RAVEN" },
  };

  it("lists nothing when nothing changed", () => {
    expect(
      describeTimelineChanges(
        saved,
        { ...saved },
        ["surv1", "surv2"],
        label,
        day
      )
    ).toEqual([]);
  });

  it("lists a moved shift, a new operation and a blend", () => {
    const current = {
      "surv1-0": {
        shiftTime: "Custom",
        customTime: "0930-1730",
        primaryTask: "AURORA",
      },
      "surv2-0": {
        shiftTime: "0700-1500",
        primaryTask: "RAVEN",
        blended: true,
      },
    };
    const changes = describeTimelineChanges(
      saved,
      current,
      ["surv1", "surv2"],
      label,
      day
    );
    expect(changes.map(c => c.text)).toEqual([
      "Mon, Team 1: 0700–1500 to 0930–1730",
      "Mon, Team 1: operation RAVEN to AURORA",
      "Mon, Team 2: blended with its partner team",
    ]);
    expect(changedCellKeys(changes)).toEqual(["surv1-0", "surv2-0"]);
  });

  it("treats a custom time equal to a ready-made one as unchanged", () => {
    const current = {
      ...saved,
      "surv1-0": {
        shiftTime: "Custom",
        customTime: "0700-1500",
        primaryTask: "RAVEN",
      },
    };
    expect(
      describeTimelineChanges(saved, current, ["surv1"], label, day)
    ).toEqual([]);
  });
});

describe("shift text typed with colons", () => {
  it("reads and slides 07:00-15:00 the same as 0700-1500", async () => {
    const { shiftStart } = await import("../shared/taskingTimeline");
    expect(shiftLength("07:00-15:00")).toBe(480);
    expect(shiftStart("07:00-15:00")).toBe(420);
    expect(slideShift("07:00-15:00", 8 * 60)).toBe("0800-1600");
  });
});
