/**
 * Pure rules behind the CTO Weekly Tasking views (client/src/components/
 * opManager/TaskingViews.tsx): reading a week's calendar cells, the shift
 * times, today's column, the operations to highlight and the week's totals.
 * Tested in server/taskingView.test.ts.
 */
import { taskingCellText } from "./opManagerWeeks";

export const DAY_NAMES = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface TaskingCellInput {
  shiftTime?: string | null;
  customTime?: string | null;
  primaryTask?: string | null;
  primaryOther?: string | null;
  secondaryTask?: string | null;
  secondaryOther?: string | null;
  /** Surveillance Team 1 and 2 working as one blended team that day. */
  blended?: boolean | null;
}

export interface DayCell {
  /** "0700-1500", "RDO" or "" when nothing is set. */
  shift: string;
  primary: string;
  secondary: string;
  /** Rostered day off. */
  off: boolean;
  /** Start and end in minutes after midnight; null for RDO, blank or unreadable. */
  range: [number, number] | null;
  /** This team is blended with its partner team that day (shared/taskingBlend.ts
   * decides which days are really blended, from both teams' cells). */
  blended: boolean;
}

/** "0700-1500" (also "07:00-15:00", an en dash or spaces) as minutes; null when
 * it is not a time range. A finish before the start runs past midnight and is
 * cut at 24:00 here, so a bar never leaves the day. */
export function parseShiftRange(shift: string): [number, number] | null {
  const m = /^(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})$/.exec(
    shift.trim()
  );
  if (!m) return null;
  const start = +m[1] * 60 + +m[2];
  let end = +m[3] * 60 + +m[4];
  if (+m[1] > 24 || +m[3] > 24 || +m[2] > 59 || +m[4] > 59) return null;
  if (end <= start) end = 1440;
  return [start, Math.min(end, 1440)];
}

/** "0700-1500" shown as "0700–1500"; anything else as it is. */
export function formatShiftText(shift: string): string {
  return /^\d{4}-\d{4}$/.test(shift)
    ? `${shift.slice(0, 4)}–${shift.slice(5)}`
    : shift;
}

export function readCell(cell: TaskingCellInput | undefined): DayCell {
  const t = taskingCellText(cell ?? {});
  const off = t.shift === "RDO";
  return {
    ...t,
    off,
    range: off ? null : parseShiftRange(t.shift),
    blended: cell?.blended === true,
  };
}

/** The week as one row of seven cells for each team id. */
export function readWeek(
  grid: Record<string, TaskingCellInput | undefined>,
  teamIds: readonly string[]
): Record<string, DayCell[]> {
  const out: Record<string, DayCell[]> = {};
  for (const id of teamIds)
    out[id] = DAY_NAMES.map((_, i) => readCell(grid[`${id}-${i}`]));
  return out;
}

/** The seven days of a week, with their date. */
export function weekDays(weekStart: string): {
  name: string;
  day: number;
  month: string;
  iso: string;
}[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  return DAY_NAMES.map((name, i) => {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    return {
      name,
      day: t.getUTCDate(),
      month: MONTHS[t.getUTCMonth()],
      iso: t.toISOString().slice(0, 10),
    };
  });
}

/** Which of the week's seven columns is today (0 = Monday), or -1. */
export function todayIndex(weekStart: string, todayISO: string): number {
  return weekDays(weekStart).findIndex(d => d.iso === todayISO);
}

/** The operations (and other tasks) named in the week, in the order the grid
 * reads: team by team, Monday first, primary before secondary. */
export function weekOps(week: Record<string, DayCell[]>): string[] {
  const seen: string[] = [];
  for (const cells of Object.values(week))
    for (const c of cells)
      for (const name of [c.primary, c.secondary])
        if (name && !seen.includes(name)) seen.push(name);
  return seen;
}

/** Whether a cell is tasked with the operation, primary or secondary. */
export function cellHasOp(c: DayCell, op: string): boolean {
  return c.primary === op || c.secondary === op;
}

export function weekSummary(week: Record<string, DayCell[]>): {
  shifts: number;
  rdo: number;
  primaryByOp: Record<string, number>;
} {
  let shifts = 0;
  let rdo = 0;
  const primaryByOp: Record<string, number> = {};
  for (const cells of Object.values(week))
    for (const c of cells) {
      if (c.off) rdo++;
      else if (c.shift) {
        shifts++;
        if (c.primary)
          primaryByOp[c.primary] = (primaryByOp[c.primary] ?? 0) + 1;
      }
    }
  return { shifts, rdo, primaryByOp };
}

/** The hours the timeline spans: 05:00 to 23:00 as a rule, wider when a shift
 * needs it (whole hours). */
export function timelineSpan(
  week: Record<string, DayCell[]>
): [number, number] {
  let lo = 5 * 60;
  let hi = 23 * 60;
  for (const cells of Object.values(week))
    for (const c of cells)
      if (c.range) {
        lo = Math.min(lo, Math.floor(c.range[0] / 60) * 60);
        hi = Math.max(hi, Math.ceil(c.range[1] / 60) * 60);
      }
  return [lo, hi];
}

/** The most calendar layouts one Export PDF carries. */
export const MAX_EXPORT_VIEWS = 2;

/**
 * Ticking or unticking one layout for the Export PDF. Ticking is refused once
 * `max` are chosen (the box is shown disabled; the choice never silently drops
 * another one), and the list keeps the order the layouts were ticked in.
 */
export function toggleExportView<T>(
  chosen: readonly T[],
  id: T,
  max: number = MAX_EXPORT_VIEWS
): T[] {
  if (chosen.includes(id)) return chosen.filter(x => x !== id);
  if (chosen.length >= max) return [...chosen];
  return [...chosen, id];
}

/** The calendar layouts offered on a phone: the other two (banded columns and
 * schedule tables) are wide tables that do not read well on a narrow screen. */
export const PHONE_VIEWS: readonly string[] = ["tile-days", "cal-timeline"];
export const DEFAULT_PHONE_VIEW = "tile-days";

/** The layout to show on a phone for a saved choice: the choice if a phone
 * offers it, otherwise Day tiles. The saved choice itself is not changed, so
 * the person's laptop still opens on the layout they picked there. */
export function viewOnPhone(view: string): string {
  return PHONE_VIEWS.includes(view) ? view : DEFAULT_PHONE_VIEW;
}
