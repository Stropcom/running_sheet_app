import { describe, expect, it } from "vitest";
import {
  noticeOfChange,
  describeShift,
  type ShiftChange,
} from "@shared/ctoRosterNotice";
import { runEbaChecks } from "./ctoRosterEbaEngine";

// Local-time dates, as the server (forced to Perth) reads the roster.
const at = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};
const D = "2040-06-04";
const change = (over: Partial<ShiftChange>): ShiftChange => ({
  memberId: 1,
  memberName: "E2E Officer",
  shiftDate: D,
  changedAtMs: at("2040-06-03", 8),
  before: { code: "d", time: null },
  beforeKnown: true,
  after: { code: "a", time: null },
  by: "Sgt Admin",
  source: "audit",
  ...over,
});

describe("noticeOfChange — s.33(16)(a), 24 hours notice", () => {
  it("measures from the change to the start of the shift (Day starts 06:00)", () => {
    const short = noticeOfChange(
      change({
        before: { code: "r", time: null },
        after: { code: "d", time: null },
        changedAtMs: at("2040-06-03", 8),
      })
    )!;
    expect(short.noticeHours).toBeCloseTo(22, 5);
    expect(short.afterStart).toBe(false);
    const enough = noticeOfChange(
      change({
        before: { code: "r", time: null },
        after: { code: "d", time: null },
        changedAtMs: at("2040-06-02", 18),
      })
    )!;
    expect(enough.noticeHours).toBeCloseTo(36, 5);
  });
  it("counts from the earlier of the old and the new start", () => {
    // Day (06:00) changed to a 14:00 start: the person was expecting 06:00.
    const n = noticeOfChange(
      change({
        before: { code: "d", time: null },
        after: { code: "d", time: "14:00" },
        changedAtMs: at("2040-06-03", 10),
      })
    )!;
    expect(n.noticeHours).toBeCloseTo(20, 5);
  });
  it("a shift cancelled to a rest day counts from the shift that was there", () => {
    const n = noticeOfChange(
      change({
        before: { code: "a", time: null },
        after: { code: "r", time: null },
        changedAtMs: at("2040-06-03", 20),
      })
    )!;
    expect(n.noticeHours).toBeCloseTo(17, 5);
  });
  it("rest to on-call (and back) counts from midnight on that day", () => {
    const n = noticeOfChange(
      change({
        before: { code: "r", time: null },
        after: { code: "o", time: null },
        changedAtMs: at("2040-06-03", 6),
      })
    )!;
    expect(n.noticeHours).toBeCloseTo(18, 5);
    expect(
      noticeOfChange(
        change({
          before: { code: "o", time: null },
          after: { code: "r", time: null },
        })
      )
    ).not.toBeNull();
  });
  it("a change made after the shift started is flagged as such", () => {
    const n = noticeOfChange(
      change({
        before: { code: "d", time: null },
        after: { code: "a", time: null },
        changedAtMs: at(D, 7),
      })
    )!;
    expect(n.afterStart).toBe(true);
    expect(n.noticeHours).toBeLessThan(0);
  });
  it("is not a change: first filling in a day, no difference, rest to nothing", () => {
    expect(noticeOfChange(change({ before: null }))).toBeNull();
    expect(
      noticeOfChange(change({ before: { code: "", time: null } }))
    ).toBeNull();
    expect(
      noticeOfChange(
        change({
          before: { code: "d", time: "06:00" },
          after: { code: "d", time: "06:00" },
        })
      )
    ).toBeNull();
    expect(
      noticeOfChange(
        change({
          before: { code: "r", time: null },
          after: { code: "", time: null },
        })
      )
    ).toBeNull();
    expect(
      noticeOfChange(
        change({
          before: { code: "", time: null },
          after: { code: "r", time: null },
        })
      )
    ).toBeNull();
  });
  it("when the earlier shift is not recorded, judges a change to a working shift by its start and ignores a change to a rest day", () => {
    const worked = noticeOfChange(
      change({
        before: null,
        beforeKnown: false,
        after: { code: "a", time: null },
        changedAtMs: at("2040-06-03", 20),
        source: "row",
      })
    )!;
    expect(worked.noticeHours).toBeCloseTo(17, 5); // 13:00 the next day
    expect(
      noticeOfChange(
        change({
          before: null,
          beforeKnown: false,
          after: { code: "r", time: null },
          source: "row",
        })
      )
    ).toBeNull();
  });
  it("describes shifts in words", () => {
    expect(describeShift({ code: "D", time: "06:30" })).toBe("d 06:30");
    expect(describeShift({ code: "", time: null })).toBe("no shift");
    expect(describeShift(null)).toBe("an earlier shift");
  });
});

const rule = (over: Record<string, unknown> = {}) =>
  ({
    id: 1,
    ruleKey: "min_notice_of_change",
    title: "Minimum notice of a change to attendance",
    description: null,
    eaReference: "s.33(16)(a)",
    thresholdValue: 24,
    thresholdValue2: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as any;

describe("the notice rule in the EA engine", () => {
  it("finds a change with under 24 hours notice, naming the person, the date and the hours", () => {
    const f = runEbaChecks(
      [],
      [rule()],
      [
        change({
          before: { code: "r", time: null },
          after: { code: "d", time: null },
        }),
      ]
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      ruleKey: "min_notice_of_change",
      eaReference: "s.33(16)(a)",
      memberId: 1,
      dates: [D],
      severity: "warning",
    });
    expect(f[0].detail).toContain("22 hours before it started");
    expect(f[0].detail).toContain("from r to d");
    expect(f[0].detail).toContain("by Sgt Admin");
  });
  it("says so when the change was made after the shift started, and keeps a past date", () => {
    const f = runEbaChecks(
      [],
      [rule()],
      [change({ changedAtMs: at(D, 9), shiftDate: D })]
    );
    expect(f).toHaveLength(1);
    expect(f[0].detail).toContain("after the shift had started");
  });
  it("finds nothing with enough notice, with the rule off, or with no changes", () => {
    const ok = change({ changedAtMs: at("2040-06-01", 8) });
    expect(runEbaChecks([], [rule()], [ok])).toEqual([]);
    expect(runEbaChecks([], [rule({ isActive: false })], [change({})])).toEqual(
      []
    );
    expect(runEbaChecks([], [rule()], [])).toEqual([]);
  });
  it("uses the rule's own threshold", () => {
    const c = change({
      before: { code: "r", time: null },
      after: { code: "d", time: null },
      changedAtMs: at("2040-06-03", 8),
    }); // 22 hours
    expect(runEbaChecks([], [rule({ thresholdValue: 12 })], [c])).toEqual([]);
    expect(runEbaChecks([], [rule({ thresholdValue: 48 })], [c])).toHaveLength(
      1
    );
  });
  it("describes a bulk-edit change whose earlier shift is not recorded", () => {
    const f = runEbaChecks(
      [],
      [rule()],
      [
        change({
          before: null,
          beforeKnown: false,
          after: { code: "a", time: null },
          changedAtMs: at("2040-06-03", 20),
          by: null,
          source: "row",
        }),
      ]
    );
    expect(f).toHaveLength(1);
    expect(f[0].detail).toContain("the earlier shift is not recorded");
  });
});
