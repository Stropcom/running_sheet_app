// Perth calendar-day helpers for the running sheet (everything on a sheet is
// in Perth time).

export const PERTH_TIME_ZONE = "Australia/Perth";
export const PERTH_OFFSET_SUFFIX = "T00:00:00+08:00";

export function ymdToPerthMs(ymd: string) {
  return new Date(`${ymd}${PERTH_OFFSET_SUFFIX}`).getTime();
}

export const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 in milliseconds

export function addDaysToYmd(ymd: string, days: number) {
  // ymdToPerthMs gives Perth midnight as UTC ms (e.g. 2026-07-19 00:00 AWST = 2026-07-18 16:00 UTC).
  // After adding N days we must shift by +8h before reading UTC date components so that
  // the UTC year/month/day equals the Perth calendar date (otherwise +1 day stays on the same UTC date).
  const perthMs = ymdToPerthMs(ymd) + days * 86400000;
  const d = new Date(perthMs + PERTH_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function formatPerthDateLabel(ymd: string) {
  return new Date(`${ymd}${PERTH_OFFSET_SUFFIX}`)
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: PERTH_TIME_ZONE,
    })
    .toUpperCase();
}

export function getTodayPerthYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === "year")?.value ?? "1970";
  const month = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}
