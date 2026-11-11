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

/**
 * What one calendar cell of the CTO Weekly Tasking reads as: its shift
 * ("Custom" is the typed time), its primary task and its secondary task ("Other"
 * is the typed text). Used by the full view and the export, so they agree.
 */
export function taskingCellText(cell: {
  shiftTime?: string | null;
  customTime?: string | null;
  primaryTask?: string | null;
  primaryOther?: string | null;
  secondaryTask?: string | null;
  secondaryOther?: string | null;
}): { shift: string; primary: string; secondary: string } {
  return {
    shift:
      cell.shiftTime === "Custom"
        ? (cell.customTime ?? "Custom")
        : (cell.shiftTime ?? ""),
    primary:
      cell.primaryTask === "Other"
        ? (cell.primaryOther ?? "")
        : (cell.primaryTask ?? ""),
    secondary:
      cell.secondaryTask === "Other"
        ? (cell.secondaryOther ?? "")
        : (cell.secondaryTask ?? ""),
  };
}

// ─── Opening a posted tasking from its notification ─────────────────────────
// "New CTO Tasking Posted" used to link to the CTO Weekly Tasking folder, so
// the officer then had to find the week in the list. The link now names the
// week, and the page opens that week's tasking (the document) straight away.

const TASKING_PATH = "/operation-manager";

/** The link a "tasking posted" notification carries for a week. */
export function taskingWeekUrl(weekStart: string): string {
  return `${TASKING_PATH}?week=${weekStart}`;
}

/** The week a page address asks for ("?week=2026-06-08"), or null when it asks
 * for none or the value is not a real calendar date. */
export function taskingWeekFromSearch(
  search: string | null | undefined
): string | null {
  const m = /(?:^|[?&])week=(\d{4})-(\d{2})-(\d{2})(?:&|$)/.exec(search ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (
    t.getUTCFullYear() !== y ||
    t.getUTCMonth() !== mo - 1 ||
    t.getUTCDate() !== d
  )
    return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Where a notification should take the officer. A tasking-posted notification
 * made before the link named its week ("/operation-manager", body "CTO Tasking
 * for the week of 08 Jun 2026 has been posted.") is read the same way, so the
 * ones already in the inbox open the document too. Anything else keeps its own
 * link; null when it has none.
 */
export function taskingNotificationUrl(n: {
  url?: string | null;
  sourceModule?: string | null;
  body?: string | null;
}): string | null {
  const url = n.url ?? null;
  if (!url) return null;
  if (url !== TASKING_PATH || n.sourceModule !== "opManager") return url;
  const m = /\bweek of (\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4})\b/.exec(
    n.body ?? ""
  );
  if (!m) return url;
  const month = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
  if (month < 0) return url;
  const iso = `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return taskingWeekFromSearch(`?week=${iso}`) ? taskingWeekUrl(iso) : url;
}
