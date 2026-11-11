import { describe, expect, it } from "vitest";
import {
  notifyRecipientIds,
  pickCopySourceWeek,
  taskingCellText,
  taskingNotificationUrl,
  taskingWeekFromSearch,
  taskingWeekUrl,
  weekRangeLabel,
} from "@shared/opManagerWeeks";

const w = (weekStart: string, contacts: number, priority: number) => ({
  weekStart,
  contacts,
  priority,
});

describe("pickCopySourceWeek", () => {
  it("takes the most recent earlier week that has contacts or a priority board", () => {
    expect(
      pickCopySourceWeek(
        [w("2026-10-12", 4, 3), w("2026-10-19", 4, 0), w("2026-10-26", 0, 0)],
        "2026-11-02"
      )
    ).toEqual(w("2026-10-19", 4, 0));
  });

  it("skips a listed week that only has a calendar", () => {
    expect(
      pickCopySourceWeek(
        [w("2026-10-19", 3, 2), w("2026-10-26", 0, 0)],
        "2026-11-02"
      )
    ).toEqual(w("2026-10-19", 3, 2));
  });

  it("never takes the new week itself or a later one", () => {
    expect(
      pickCopySourceWeek(
        [w("2026-11-02", 4, 4), w("2026-11-09", 4, 4)],
        "2026-11-02"
      )
    ).toBeNull();
  });

  it("is null when no earlier week has anything to copy", () => {
    expect(pickCopySourceWeek([], "2026-11-02")).toBeNull();
    expect(
      pickCopySourceWeek([w("2026-10-26", 0, 0)], "2026-11-02")
    ).toBeNull();
  });
});

describe("weekRangeLabel", () => {
  it("names the Monday-to-Sunday range, across a month end too", () => {
    expect(weekRangeLabel("2026-11-02")).toBe("02 Nov – 08 Nov");
    expect(weekRangeLabel("2026-10-26")).toBe("26 Oct – 01 Nov");
    expect(weekRangeLabel("2040-12-31")).toBe("31 Dec – 06 Jan");
  });
});

describe("notifyRecipientIds", () => {
  const users = [
    { id: 1, command: "WESTERN" },
    { id: 2, command: "WESTERN", archivedAt: new Date() },
    { id: 3, command: "EASTERN" }, // another Command, never shared
    { id: 4, command: "EASTERN" }, // another Command, hosted by WESTERN
    { id: 5, command: "WESTERN" },
  ];

  it("is the Command's own people plus the visitors it currently hosts", () => {
    expect(
      Array.from(notifyRecipientIds(users, "WESTERN", new Set([4]))).sort()
    ).toEqual([1, 4, 5]);
  });

  it("drops a visitor whose access was revoked, and anyone archived", () => {
    const ids = notifyRecipientIds(users, "WESTERN", new Set());
    expect(ids.has(4)).toBe(false);
    expect(ids.has(3)).toBe(false);
    expect(ids.has(2)).toBe(false);
  });
});

describe("taskingCellText", () => {
  it("reads a plain cell as it is stored", () => {
    expect(
      taskingCellText({
        shiftTime: "0700-1500",
        primaryTask: "RAVEN",
        secondaryTask: "Training",
      })
    ).toEqual({ shift: "0700-1500", primary: "RAVEN", secondary: "Training" });
  });
  it("uses the typed time for a custom shift and the typed text for Other", () => {
    expect(
      taskingCellText({
        shiftTime: "Custom",
        customTime: "0800-1600",
        primaryTask: "Other",
        primaryOther: "Court",
        secondaryTask: "Other",
      })
    ).toEqual({ shift: "0800-1600", primary: "Court", secondary: "" });
  });
  it("is empty for an empty cell", () => {
    expect(taskingCellText({})).toEqual({
      shift: "",
      primary: "",
      secondary: "",
    });
  });
});

describe("opening a posted tasking from its notification", () => {
  it("the link names the week", () => {
    expect(taskingWeekUrl("2026-06-08")).toBe(
      "/operation-manager?week=2026-06-08"
    );
  });

  it("reads the week back from the page address", () => {
    expect(taskingWeekFromSearch("?week=2026-06-08")).toBe("2026-06-08");
    expect(taskingWeekFromSearch("week=2026-06-08")).toBe("2026-06-08");
    expect(taskingWeekFromSearch("?x=1&week=2026-06-08&y=2")).toBe(
      "2026-06-08"
    );
  });

  it("asks for nothing when there is no week or it is not a real date", () => {
    expect(taskingWeekFromSearch("")).toBeNull();
    expect(taskingWeekFromSearch(null)).toBeNull();
    expect(taskingWeekFromSearch("?week=")).toBeNull();
    expect(taskingWeekFromSearch("?week=2026-13-01")).toBeNull();
    expect(taskingWeekFromSearch("?week=2026-02-30")).toBeNull();
    expect(taskingWeekFromSearch("?week=junk")).toBeNull();
    expect(taskingWeekFromSearch("?weekend=2026-06-08")).toBeNull();
  });

  it("a notification that already names its week keeps its link", () => {
    expect(
      taskingNotificationUrl({
        url: "/operation-manager?week=2026-06-08",
        sourceModule: "opManager",
        body: "CTO Tasking for the week of 08 Jun 2026 has been posted.",
      })
    ).toBe("/operation-manager?week=2026-06-08");
  });

  it("an older tasking notification opens its week from its wording", () => {
    const old = (body: string) =>
      taskingNotificationUrl({
        url: "/operation-manager",
        sourceModule: "opManager",
        body,
      });
    expect(
      old("CTO Tasking for the week of 08 Jun 2026 has been posted.")
    ).toBe("/operation-manager?week=2026-06-08");
    expect(
      old("CTO Tasking for the week of 7 Sept 2026 has been posted.")
    ).toBe("/operation-manager?week=2026-09-07");
    expect(
      old("CTO Tasking for the week of 28 Dec 2026 has been posted.")
    ).toBe("/operation-manager?week=2026-12-28");
  });

  it("falls back to the folder when the wording has no readable week", () => {
    expect(
      taskingNotificationUrl({
        url: "/operation-manager",
        sourceModule: "opManager",
        body: "CTO Tasking has been posted.",
      })
    ).toBe("/operation-manager");
    expect(
      taskingNotificationUrl({
        url: "/operation-manager",
        sourceModule: "opManager",
        body: "CTO Tasking for the week of 31 Feb 2026 has been posted.",
      })
    ).toBe("/operation-manager");
  });

  it("another module's notification is left alone", () => {
    expect(
      taskingNotificationUrl({
        url: "/operation-manager",
        sourceModule: "other",
        body: "the week of 08 Jun 2026",
      })
    ).toBe("/operation-manager");
    expect(
      taskingNotificationUrl({ url: "/sheet/12", sourceModule: "x", body: "" })
    ).toBe("/sheet/12");
    expect(taskingNotificationUrl({ url: null })).toBeNull();
  });
});
