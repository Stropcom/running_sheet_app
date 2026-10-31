/**
 * The time on a new row.
 *
 * A row made with Add Row used to arrive with no time ("Set time"), so every
 * row needed a tap before it could be used. It now arrives stamped with the
 * current Perth time — still editable like any other. Only where that is a fair
 * reading of the officer's intention: a time the caller already gave is never
 * replaced, and a sheet dated some other day (backfilled, or for tomorrow) gets
 * no time at all rather than today's clock on the wrong day. Pure rules — the
 * server's row.create applies them (server/routers/row.ts), so every way of
 * adding a row gets the same.
 */

const PERTH = "Australia/Perth";

/** Minutes after midnight in Perth, and the Perth date, for an instant. */
export function perthMinutesAndDate(now: Date): {
  minutes: number;
  dateISO: string;
} {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "0";
  return {
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** "03:40 PM" — the way a row's time is written everywhere on the sheet. */
export function formatRowTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(m % 60).padStart(2, "0")} ${
    h24 < 12 ? "AM" : "PM"
  }`;
}

export interface RowTime {
  time?: string;
  timeMinutes?: number;
  /** This rule wrote the time. */
  stamped: boolean;
}

export function rowTimeForNewRow(args: {
  now: Date;
  /** The sheet's date (YYYY-MM-DD), when it has one. */
  sheetDate?: string | null;
  time?: string;
  timeMinutes?: number;
}): RowTime {
  const given =
    (args.time !== undefined && args.time.trim() !== "") ||
    args.timeMinutes !== undefined;
  if (given)
    return { time: args.time, timeMinutes: args.timeMinutes, stamped: false };
  const { minutes, dateISO } = perthMinutesAndDate(args.now);
  // A sheet for another day: no time, the officer sets it.
  if (args.sheetDate && args.sheetDate !== dateISO)
    return { time: args.time, timeMinutes: args.timeMinutes, stamped: false };
  return { time: formatRowTime(minutes), timeMinutes: minutes, stamped: true };
}
