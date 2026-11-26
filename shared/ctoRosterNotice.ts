// EA s.33(16)(a): "An Employee will be given a minimum of 24 hours notice of
// any change to their normal pattern of attendance." — the pure part of the
// check that finds a change made with less notice than that. The EA also says a
// change is notified by direct verbal communication unless another arrangement
// is mutually agreed, and that the safety net may be breached for an
// Operational Requirement: neither is recorded anywhere, so this only
// IDENTIFIES the breach (a change made less than 24 hours before the shift) and
// leaves it to the supervisor to say it was agreed or operational.
//
// Notice runs from the moment the change was saved to the START of the shift:
// the earlier of the shift that was there and the shift it became (a day that
// was a rest day or on-call, or is made one, counts from midnight on that day).
// Deterministic: only the times written in the roster and its audit log.
import {
  computeShiftInterval,
  shiftToDateRange,
} from "./ctoRosterShiftDuration";

export const MIN_NOTICE_HOURS = 24;

/** A shift as it stood: its code and optional start time. */
export interface NoticeShift {
  code: string | null;
  time: string | null;
  durationHours?: number | null;
}

/** One saved change to one person's shift on one day. */
export interface ShiftChange {
  memberId: number;
  memberName: string;
  shiftDate: string; // YYYY-MM-DD
  /** When the change was saved (ms since the epoch). */
  changedAtMs: number;
  /** What was there before; null when the roster does not record it (a bulk
   * edit) — `beforeKnown` says which. */
  before: NoticeShift | null;
  beforeKnown: boolean;
  /** What it became; code null/"" = the day was cleared. */
  after: NoticeShift;
  /** Who saved it, when known. */
  by: string | null;
  source: "audit" | "row";
}

const clean = (code: string | null | undefined) =>
  (code ?? "").trim().toLowerCase();

/** A rest day or nothing at all: no attendance. (On-call "o" is not: the
 * person is on call that day.) */
const isRestOrNone = (code: string) => code === "" || code === "r";
/** On-call rest ("o") and rest/none have no start time of their own. */
const hasNoStart = (code: string) => isRestOrNone(code) || code === "o";

export interface NoticeResult {
  startsAtMs: number;
  noticeHours: number;
  afterStart: boolean;
}

const startOf = (date: string, s: NoticeShift): number | null => {
  const code = clean(s.code);
  if (hasNoStart(code)) return null;
  return shiftToDateRange(
    date,
    computeShiftInterval(code, s.time, s.durationHours ?? null)
  ).start.getTime();
};

/**
 * The notice given for a change, or null when it is not a change to a pattern
 * of attendance at all: the first time a day is filled in, no real difference,
 * a rest day to nothing (or back), or — when the earlier shift is not recorded —
 * a change TO a rest day / nothing (it may have cancelled a shift, but which
 * one is not known).
 */
export function noticeOfChange(change: ShiftChange): NoticeResult | null {
  const after = clean(change.after.code);
  const before = change.before ? clean(change.before.code) : "";
  if (change.beforeKnown) {
    // A day with nothing there before was being filled in, not changed.
    if (change.before == null || before === "") return null;
    if (
      before === after &&
      (change.before.time ?? null) === (change.after.time ?? null) &&
      (change.before.durationHours ?? null) ===
        (change.after.durationHours ?? null)
    )
      return null;
    if (isRestOrNone(before) && isRestOrNone(after)) return null;
  } else if (isRestOrNone(after)) {
    return null;
  }

  const starts = [
    change.beforeKnown && change.before
      ? startOf(change.shiftDate, change.before)
      : null,
    startOf(change.shiftDate, change.after),
  ].filter((n): n is number => n != null);
  const startsAtMs = starts.length
    ? Math.min(...starts)
    : shiftToDateRange(change.shiftDate, {
        startMin: 0,
        durationHours: 0,
        isOnCall: false,
        missingRequiredTime: false,
      }).start.getTime();
  const noticeHours = (startsAtMs - change.changedAtMs) / 3_600_000;
  return { startsAtMs, noticeHours, afterStart: noticeHours <= 0 };
}

/** The change as words: "d 06:00", "r", "no shift". */
export function describeShift(s: NoticeShift | null): string {
  if (!s) return "an earlier shift";
  const code = clean(s.code);
  if (!code) return "no shift";
  return s.time ? `${code} ${s.time}` : code;
}
