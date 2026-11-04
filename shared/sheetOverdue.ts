/**
 * Overdue running sheets. An incomplete sheet is one that has not been closed;
 * it is overdue when it has still not been closed 7 days after it was made.
 * Pure and tested (server/sheetOverdue.test.ts); used by the Outstanding
 * Actions summary banner.
 */
export const OVERDUE_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a sheet is overdue at `now` (ms): not closed, and made more than 7
 * days ago. A sheet with no readable date is not counted. */
export function isSheetOverdue(
  sheet: { isClosed: boolean; createdAt: string | number | Date | null },
  now: number
): boolean {
  if (sheet.isClosed || sheet.createdAt === null) return false;
  const made = new Date(sheet.createdAt).getTime();
  if (!Number.isFinite(made)) return false;
  return now - made > OVERDUE_AFTER_DAYS * DAY_MS;
}

/** How many of the sheets are overdue at `now`. */
export function countOverdue(
  sheets: readonly {
    isClosed: boolean;
    createdAt: string | number | Date | null;
  }[],
  now: number
): number {
  return sheets.filter(s => isSheetOverdue(s, now)).length;
}
