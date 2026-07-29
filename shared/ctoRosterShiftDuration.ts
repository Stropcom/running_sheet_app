/**
 * CTO Roster — shift duration engine, ported verbatim from roster_app's
 * shared/shiftDuration.ts. Computes the start time (minutes from midnight)
 * and duration (hours) for any shift based on its code and optional chip
 * time override. Pure, deterministic, no DB/LLM involvement — feeds the EBA
 * compliance engine (server/ctoRosterEbaEngine.ts).
 *
 * Rules:
 *   d    – 9 h, default start 06:00
 *   a    – 9 h, default start 13:00
 *   ad   – 8 h, from chip time (default 10:00)
 *   doc  – on-call: underlying shift = Day (9h from chip, default 06:00)
 *   aoc  – on-call: underlying shift = Afternoon (9h from chip, default 13:00)
 *   adoc – on-call: underlying shift = Admin (8h from chip, default 10:00)
 *   o    – rest day (plain on-call / weekend on-call) — 0h for rule purposes
 *   tt   – 8 h, from chip time
 *   l    – 24 h full day (no start time)
 *   c    – 8 h, fixed 07:00
 *   r    – 0 h (rest day, not a working shift)
 *   dep  – 9 h, from chip time (treated same as day shift)
 */

export interface ShiftInterval {
  /** Start time as minutes from midnight on the shift date */
  startMin: number;
  /** Duration in hours */
  durationHours: number;
  /** Whether this is an on-call shift */
  isOnCall: boolean;
  /** Whether a chip time is required but missing */
  missingRequiredTime: boolean;
}

/** Parse a "HH:MM" string to minutes from midnight. Returns null if invalid. */
export function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Default start times (minutes from midnight) per shift code */
const DEFAULT_START_MIN: Record<string, number | null> = {
  d: 6 * 60,
  a: 13 * 60,
  ad: 10 * 60,
  doc: 6 * 60,
  adoc: 10 * 60,
  aoc: 13 * 60,
  o: null,
  tt: null,
  l: 0,
  c: 7 * 60,
  r: null,
  dep: 6 * 60,
};

/** Duration in hours per shift code */
const BASE_DURATION_HOURS: Record<string, number> = {
  d: 9,
  a: 9,
  ad: 8,
  doc: 9,
  adoc: 8,
  aoc: 9,
  o: 0,
  tt: 8,
  l: 24,
  c: 8,
  r: 0,
  dep: 9,
};

const ON_CALL_CODES = new Set(["o", "doc", "adoc", "aoc"]);

/**
 * Compute the interval for a single shift.
 * @param code  Shift code (e.g. "d", "aoc")
 * @param chipTime  Optional override time string "HH:MM" from the shift chip
 */
export function computeShiftInterval(code: string, chipTime?: string | null): ShiftInterval {
  const c = code.toLowerCase();
  const isOnCall = ON_CALL_CODES.has(c);

  if (c === "r" || c === "o") {
    return { startMin: 0, durationHours: 0, isOnCall: c === "o", missingRequiredTime: false };
  }

  const chipMin = parseTime(chipTime);
  const defaultMin = DEFAULT_START_MIN[c] ?? null;
  const missingRequiredTime = false; // chip time is optional; defaults apply
  const startMin = chipMin ?? defaultMin ?? 0;
  const durationHours = BASE_DURATION_HOURS[c] ?? 8;

  return { startMin, durationHours, isOnCall, missingRequiredTime };
}

/**
 * Given a shift date (YYYY-MM-DD) and interval, return the UTC-equivalent
 * start and end as Date objects (treating the date as local midnight).
 */
export function shiftToDateRange(shiftDate: string, interval: ShiftInterval): { start: Date; end: Date } {
  const [y, mo, d] = shiftDate.split("-").map(Number);
  const base = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const start = new Date(base.getTime() + interval.startMin * 60_000);
  const end = new Date(start.getTime() + interval.durationHours * 3_600_000);
  return { start, end };
}
