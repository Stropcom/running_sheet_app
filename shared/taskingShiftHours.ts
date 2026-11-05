/**
 * Shift lengths on the CTO Weekly Tasking, matching the roster.
 *
 *   Day shift (with an operation)   0600-1500   9 hours
 *   Arvo shift (with an operation)  1300-2200   9 hours
 *   Admin                           0700-1500   8 hours (an Arvo Admin 1300-2100)
 *
 * Choosing Admin makes a 9-hour shift 8 hours; changing it from Admin to an
 * operation makes an 8-hour shift 9 hours again (see shiftAfterTaskChange for
 * which end moves). A shift of any other length is never changed.
 * `legacyShiftTo9h` is the one-off conversion of the old 8-hour shifts
 * (0700-1500, 1400-2200) saved before this rule (see the migrations
 * `drizzle/0140_…` and `0141_…`, which do the same in SQL for stored weeks).
 * Pure and deterministic; tested in server/taskingShiftHours.test.ts.
 */
import { shiftStart, shiftLength } from "./taskingTimeline";

export const DAY_SHIFT = "0600-1500";
export const ARVO_SHIFT = "1300-2200";
export const ADMIN_SHIFT = "0700-1500";

/** The shift as "HHMM-HHMM" ("07:00-15:00", spaces and an en dash are read), or
 * the text unchanged when it is not a time range. */
export function normaliseShift(shift: string | null | undefined): string {
  const text = (shift ?? "").trim();
  const start = shiftStart(text);
  const len = shiftLength(text);
  if (start === null || len === null) return text;
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
  return `${hhmm(start)}-${hhmm(start + len)}`;
}

export const isAdminTask = (task: string | null | undefined): boolean =>
  (task ?? "").trim().toLowerCase() === "admin";

/** "HHMM-HHMM" for a start and a length in minutes (past midnight wraps). */
function shiftText(startMin: number, lengthMin: number): string {
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
  return `${hhmm(startMin)}-${hhmm(startMin + lengthMin)}`;
}

/**
 * The new shift when a team-day's primary task changes, or null when the shift
 * stays as it is. Admin is 8 hours, an operation 9:
 *  - to Admin from an operation: the standard Day 0600-1500 becomes 0700-1500;
 *    any other 9-hour shift loses its last hour and keeps its start (the Arvo
 *    1300-2200 becomes 1300-2100);
 *  - from Admin to an operation: 0700-1500 becomes the Day shift 0600-1500; any
 *    other 8-hour shift gains an hour and keeps its start (0600-1400 becomes
 *    0600-1500, 1300-2100 becomes 1300-2200).
 * A shift of any other length is never changed.
 */
export function shiftAfterTaskChange(
  shift: string | null | undefined,
  previousTask: string | null | undefined,
  nextTask: string | null | undefined
): string | null {
  const now = normaliseShift(shift);
  const start = shiftStart(now);
  const len = shiftLength(now);
  if (start === null || len === null) return null;
  const wasAdmin = isAdminTask(previousTask);
  const isAdmin = isAdminTask(nextTask);
  if (isAdmin && !wasAdmin) {
    if (now === DAY_SHIFT) return ADMIN_SHIFT;
    return len === 9 * 60 ? shiftText(start, 8 * 60) : null;
  }
  if (wasAdmin && !isAdmin && (nextTask ?? "").trim() !== "") {
    if (now === ADMIN_SHIFT) return DAY_SHIFT;
    return len === 8 * 60 ? shiftText(start, 9 * 60) : null;
  }
  return null;
}

/** An old 8-hour shift saved before the 9-hour rule, as its 9-hour version;
 * Admin and every other time are left alone (null). */
export function legacyShiftTo9h(
  shift: string | null | undefined,
  primaryTask: string | null | undefined
): string | null {
  if (isAdminTask(primaryTask)) return null;
  const now = normaliseShift(shift);
  if (now === "0700-1500" || now === "0600-1400") return DAY_SHIFT;
  if (now === "1400-2200" || now === "1300-2100") return ARVO_SHIFT;
  return null;
}
