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

/** "09 Jan – 15 Jan": the Monday-to-Sunday range a week covers, the way the
 * CTO Weekly Tasking pages name it. */
export function weekRangeLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (t: Date) =>
    `${String(t.getUTCDate()).padStart(2, "0")} ${MONTHS[t.getUTCMonth()]}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Who a posted weekly tasking can be sent to: the people of the Command it
 * belongs to, plus visitors that Command currently hosts (someone another
 * Command shared an operation with, or put in one of its teams). A visitor
 * whose access was revoked is no longer hosted, so is not offered; nor is
 * anyone archived. Used for the "who to notify" list and checked again when
 * the tasking is posted.
 */
export function notifyRecipientIds(
  users: readonly {
    id: number;
    command: string | null;
    archivedAt?: unknown;
  }[],
  command: string,
  hostedVisitorIds: ReadonlySet<number>
): Set<number> {
  const out = new Set<number>();
  for (const u of users) {
    if (u.archivedAt) continue;
    if (u.command === command || hostedVisitorIds.has(u.id)) out.add(u.id);
  }
  return out;
}
