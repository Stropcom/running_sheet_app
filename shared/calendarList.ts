/**
 * The Calendar page's List view: the running sheets of one month, grouped by
 * day (days with no sheet are left out), in date order, sheets within a day in
 * title order. Pure so it can be tested; the page only draws it.
 */

/** A date as YYYY-MM-DD in the viewer's own time zone (what the grid shows). */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type CalendarDayGroup<T> = { day: string; date: Date; items: T[] };

/** `month` is 0-11, as in `Date`. */
export function groupSheetsByDay<T extends { start: Date; title: string }>(
  items: T[],
  year: number,
  month: number
): CalendarDayGroup<T>[] {
  const byDay = new Map<string, CalendarDayGroup<T>>();
  for (const item of items) {
    const d = item.start;
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const key = dayKey(d);
    let group = byDay.get(key);
    if (!group) {
      group = {
        day: key,
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        items: [],
      };
      byDay.set(key, group);
    }
    group.items.push(item);
  }
  const groups = Array.from(byDay.values()).sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0
  );
  for (const g of groups) {
    g.items.sort((a, b) => a.title.localeCompare(b.title));
  }
  return groups;
}
