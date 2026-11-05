/**
 * Pure rules behind sliding a shift bar on the CTO Weekly Tasking timeline
 * (client/src/components/opManager/TaskingViews.tsx). An admin grabs a bar and
 * slides it; this works out the new shift text, keeping its length, and which
 * changes are waiting to be saved. Tested in server/taskingTimeline.test.ts.
 */
import { formatShiftText, type TaskingCellInput } from "./taskingView";
import { cellShift } from "./taskingBlend";

/** The ready-made shifts the tasking cell offers (besides RDO and Custom). */
export const SHIFT_PRESETS = [
  "0600-1500", // Day, 9 hours
  "0700-1500", // Admin, 8 hours
  "1000-1800",
  "1300-2200", // Arvo, 9 hours
] as const;

/** A bar slides in steps of this many minutes. */
export const SLIDE_STEP = 30;
/** The earliest and latest a slid shift may start: 05:00 to 23:00. */
export const SLIDE_MIN_START = 5 * 60;
export const SLIDE_MAX_START = 23 * 60;

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (m: number) => `${pad(Math.floor(m / 60) % 24)}${pad(m % 60)}`;

/** A start (minutes after midnight) snapped to the step and kept in range. */
export function snapStart(minutes: number): number {
  const snapped = Math.round(minutes / SLIDE_STEP) * SLIDE_STEP;
  return Math.max(SLIDE_MIN_START, Math.min(SLIDE_MAX_START, snapped));
}

/** How long a shift is, in minutes ("0700-1500" is 480; "2300-0700" is 480
 * too: a finish at or before the start runs past midnight). Null when it is
 * not a time range. */
export function shiftLength(shift: string): number | null {
  const r = readRange(shift);
  if (!r) return null;
  return r[1] > r[0] ? r[1] - r[0] : r[1] + 1440 - r[0];
}

/** "0700-1500", "07:00-15:00" or with spaces / an en dash, as start and end
 * minutes; null when it is not a time range (or an hour is past 23). */
function readRange(shift: string): [number, number] | null {
  const m = /^(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})$/.exec(
    shift.trim()
  );
  if (!m) return null;
  if (+m[1] > 23 || +m[3] > 23 || +m[2] > 59 || +m[4] > 59) return null;
  return [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]];
}

/** The start of a shift in minutes, or null when it is not a time range. */
export function shiftStart(shift: string): number | null {
  return readRange(shift)?.[0] ?? null;
}

/**
 * The shift text after sliding it to start at `startMinutes` (snapped and kept
 * between 05:00 and 23:00), with the same length. A shift that now runs past
 * midnight finishes the next morning ("2300-0700"). Null when the shift is not
 * a time range (RDO, blank, a note), which cannot be slid.
 */
export function slideShift(shift: string, startMinutes: number): string | null {
  const len = shiftLength(shift);
  if (len === null) return null;
  const start = snapStart(startMinutes);
  return `${clock(start)}-${clock(start + len)}`;
}

/** The cell fields for a shift: a ready-made shift stays one, anything else is
 * stored as Custom with its text, the way the edit grid does. */
export function shiftToCellFields(shift: string): {
  shiftTime: string;
  customTime: string;
} {
  return (SHIFT_PRESETS as readonly string[]).includes(shift)
    ? { shiftTime: shift, customTime: "" }
    : { shiftTime: "Custom", customTime: shift };
}

const taskOf = (c: TaskingCellInput | undefined) =>
  [
    c?.primaryTask === "Other" ? c.primaryOther : c?.primaryTask,
    c?.secondaryTask === "Other" ? c.secondaryOther : c?.secondaryTask,
  ].map(x => (x ?? "").trim());

export interface TimelineChange {
  key: string;
  /** What changed, in a sentence for the save bar. */
  text: string;
}

/**
 * The cells of a week that differ between what is saved and what is on screen,
 * as one line each for the save bar, in team then day order. `label` names a
 * team ("Team 1"), `dayName` names a day index ("Mon 02 Nov").
 */
export function describeTimelineChanges(
  saved: Record<string, TaskingCellInput | undefined>,
  current: Record<string, TaskingCellInput | undefined>,
  teamIds: readonly string[],
  label: (teamId: string) => string,
  dayName: (dayIndex: number) => string
): TimelineChange[] {
  const out: TimelineChange[] = [];
  for (const id of teamIds) {
    for (let i = 0; i < 7; i++) {
      const key = `${id}-${i}`;
      const a = saved[key];
      const b = current[key];
      const where = `${dayName(i)}, ${label(id)}`;
      const shiftA = cellShift(a);
      const shiftB = cellShift(b);
      if (shiftA !== shiftB)
        out.push({
          key,
          text: `${where}: ${formatShiftText(shiftA) || "no shift"} to ${formatShiftText(shiftB) || "no shift"}`,
        });
      const [pa, sa] = taskOf(a);
      const [pb, sb] = taskOf(b);
      if (pa !== pb)
        out.push({
          key,
          text: `${where}: operation ${pa || "none"} to ${pb || "none"}`,
        });
      if (sa !== sb)
        out.push({
          key,
          text: `${where}: second task ${sa || "none"} to ${sb || "none"}`,
        });
      if ((a?.blended === true) !== (b?.blended === true))
        out.push({
          key,
          text: `${where}: ${b?.blended ? "blended with its partner team" : "split from its partner team"}`,
        });
    }
  }
  return out;
}

/** The keys of the cells that changed (each once). */
export const changedCellKeys = (changes: readonly TimelineChange[]): string[] =>
  Array.from(new Set(changes.map(c => c.key)));
