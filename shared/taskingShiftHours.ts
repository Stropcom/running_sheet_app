/**
 * Shift lengths on the CTO Weekly Tasking, matching the roster.
 *
 *   Day shift (with an operation)   0600-1500   9 hours
 *   Arvo shift (with an operation)  1300-2200   9 hours
 *   Admin                           0700-1500   8 hours
 *
 * Choosing Admin on a standard Day or Arvo shift makes it the 8-hour Admin
 * shift; changing it from Admin to an operation makes it the 9-hour Day shift
 * again. A shift an officer has set to some other time is never changed.
 * `legacyShiftTo9h` is the one-off conversion of the old 8-hour shifts
 * (0700-1500, 1400-2200) saved before this rule (see the migration
 * `drizzle/0140_nine_hour_day_arvo_shifts.sql` which does the same in SQL for stored weeks).
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

/**
 * The new shift when a team-day's primary task changes, or null when the shift
 * stays as it is.
 *  - to Admin from an operation: a standard Day or Arvo shift becomes 0700-1500;
 *  - from Admin to an operation: 0700-1500 becomes the Day shift 0600-1500.
 */
export function shiftAfterTaskChange(
  shift: string | null | undefined,
  previousTask: string | null | undefined,
  nextTask: string | null | undefined
): string | null {
  const now = normaliseShift(shift);
  const wasAdmin = isAdminTask(previousTask);
  const isAdmin = isAdminTask(nextTask);
  if (isAdmin && !wasAdmin) {
    return now === DAY_SHIFT || now === ARVO_SHIFT ? ADMIN_SHIFT : null;
  }
  if (wasAdmin && !isAdmin && (nextTask ?? "").trim() !== "") {
    return now === ADMIN_SHIFT ? DAY_SHIFT : null;
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
  if (now === "0700-1500") return DAY_SHIFT;
  if (now === "1400-2200") return ARVO_SHIFT;
  return null;
}
