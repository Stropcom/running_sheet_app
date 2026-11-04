/**
 * Which earlier week "Copy Last Week" copies from.
 *
 * A week can be listed in the CTO Weekly Tasking folder with nothing but its
 * calendar saved (no supervisor contacts and no priority board), so the most
 * recent *listed* week is not always the one with something to copy. The week
 * to copy from is the most recent week before the new one that has contacts or
 * a priority board. Pure and tested (server/opManagerWeeks.test.ts).
 */
export interface WeekContentCounts {
  weekStart: string; // YYYY-MM-DD (a Monday)
  contacts: number;
  priority: number;
}

export function pickCopySourceWeek(
  weeks: readonly WeekContentCounts[],
  beforeWeekStart: string
): WeekContentCounts | null {
  let best: WeekContentCounts | null = null;
  for (const w of weeks) {
    if (w.weekStart >= beforeWeekStart) continue;
    if (w.contacts + w.priority === 0) continue;
    if (!best || w.weekStart > best.weekStart) best = w;
  }
  return best;
}
