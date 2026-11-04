/**
 * The overview at the top of the Weekly Surveillance Report: for each
 * operation, each target, the days they were worked with the start and finish
 * time of each, and the total hours. It is for someone who wants the times,
 * days, operations and targets without reading the whole report.
 *
 * Everything here is read straight from the sheets' Supervisor Summary start
 * and finish times (the same ones the report's coverage hours add up) — no
 * estimating. A sheet with no times shows the day and says so, and its hours
 * are left out of the total, exactly as the coverage hours already do.
 * Pure functions, tested in server/weeklyOverview.test.ts.
 */
import { formatClock } from "./placesReport";

export interface OverviewShiftInput {
  /** YYYY-MM-DD the sheet was worked. */
  date: string;
  startMinutes: number | null;
  finishMinutes: number | null;
}

export interface OverviewTargetInput {
  targetName: string | null;
  coverageHours: number | null;
  shifts: readonly OverviewShiftInput[];
}

export interface OverviewOperationInput {
  operationName: string;
  sheetsCount: number;
  rowsCount: number;
  targets: readonly OverviewTargetInput[];
}

/** The label for sheets with no target assigned. */
export const NO_TARGET_LABEL = "No target assigned";

/** "07:00 – 14:00", or what is missing when the Summary has no times. */
export function shiftTimes(s: OverviewShiftInput): string {
  const a = s.startMinutes;
  const b = s.finishMinutes;
  if (a !== null && b !== null) return `${formatClock(a)} – ${formatClock(b)}`;
  if (a !== null) return `${formatClock(a)} – (no finish time)`;
  if (b !== null) return `(no start time) – ${formatClock(b)}`;
  return "times not recorded";
}

/** "8.5 h", or a dash when no hours could be worked out. */
export function hoursText(hours: number | null): string {
  return hours === null ? "—" : `${hours} h`;
}

export interface OverviewTarget {
  name: string;
  /** One line per sheet worked, earliest first. */
  shifts: { date: string; times: string }[];
  hours: number | null;
  /** Distinct days worked. */
  days: number;
}

export interface OverviewOperation {
  operationName: string;
  sheetsCount: number;
  rowsCount: number;
  targets: OverviewTarget[];
  /** Named targets, not counting sheets with no target assigned. */
  targetCount: number;
  /** Distinct days anything was worked on the operation. */
  days: number;
  /** Total of the targets' hours; null when none has any. */
  hours: number | null;
}

export function overviewOperation(
  op: OverviewOperationInput
): OverviewOperation {
  const targets: OverviewTarget[] = op.targets.map(t => ({
    name: t.targetName ?? NO_TARGET_LABEL,
    shifts: [...t.shifts]
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startMinutes ?? 0) - (b.startMinutes ?? 0)
      )
      .map(s => ({ date: s.date, times: shiftTimes(s) })),
    hours: t.coverageHours,
    days: new Set(t.shifts.map(s => s.date)).size,
  }));
  const withHours = op.targets.filter(t => t.coverageHours !== null);
  return {
    operationName: op.operationName,
    sheetsCount: op.sheetsCount,
    rowsCount: op.rowsCount,
    targets,
    targetCount: op.targets.filter(t => t.targetName !== null).length,
    days: new Set(op.targets.flatMap(t => t.shifts.map(s => s.date))).size,
    hours: withHours.length
      ? Math.round(
          withHours.reduce((n, t) => n + (t.coverageHours ?? 0), 0) * 10
        ) / 10
      : null,
  };
}
