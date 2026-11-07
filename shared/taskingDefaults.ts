/**
 * The shifts a week of the CTO Weekly Tasking starts with, before anyone has
 * chosen one.
 *
 *   PTT and Capability   0600-1400 (8 hours) Monday to Friday, RDO Saturday and Sunday
 *   Team 1 and Team 2    alternate weeks: one team is on Days (0600-1500) Monday to
 *                        Friday with RDO at the weekend, the other on Arvos (RDO Monday,
 *                        1300-2200 Tuesday to Thursday, 1000-1800 Friday, RDO at the weekend)
 *
 * PTT and Capability keep their 8-hour shift whatever task they are given
 * (the Admin / operation 8 and 9 hour switch in shared/taskingShiftHours.ts is
 * for Team 1 and Team 2 only). Pure and deterministic; tested in
 * server/taskingDefaults.test.ts.
 */
import { ARVO_SHIFT, DAY_SHIFT } from "./taskingShiftHours";

export const PTT_CAP_SHIFT = "0600-1400";

export type TaskingTeamRow = "surv1" | "surv2" | "ptt" | "cap";

/** Team 1 is on Days the week of 2026-07-20; the two teams swap each week. */
const SURV1_DAY_ANCHOR = "2026-07-20";

/** Whether Team 1 is on Days (and Team 2 on Arvos) in the week starting `weekStart` (a Monday, YYYY-MM-DD). */
export function isSurv1DayShift(weekStart: string): boolean {
  const anchor = new Date(`${SURV1_DAY_ANCHOR}T00:00:00Z`).getTime();
  const ws = new Date(`${weekStart}T00:00:00Z`).getTime();
  const diffWeeks = Math.round((ws - anchor) / (7 * 24 * 3600 * 1000));
  return Math.abs(diffWeeks % 2) === 0;
}

/** PTT and Capability: their shift does not follow the Admin / operation 8 and 9 hour switch. */
export const hasFixedShiftHours = (teamRow: string): boolean =>
  teamRow === "ptt" || teamRow === "cap";

/** The shift a team starts a day of the week with (dayIndex 0 = Monday): "RDO" or "HHMM-HHMM". */
export function defaultTaskingShift(
  teamRow: TaskingTeamRow,
  dayIndex: number,
  weekStart: string
): string {
  if (hasFixedShiftHours(teamRow)) return dayIndex <= 4 ? PTT_CAP_SHIFT : "RDO";
  const surv1IsDay = isSurv1DayShift(weekStart);
  const isDay = teamRow === "surv1" ? surv1IsDay : !surv1IsDay;
  if (isDay) return dayIndex <= 4 ? DAY_SHIFT : "RDO";
  if (dayIndex === 0) return "RDO";
  if (dayIndex >= 1 && dayIndex <= 3) return ARVO_SHIFT;
  if (dayIndex === 4) return "1000-1800";
  return "RDO";
}
