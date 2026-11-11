// ── Perth date helpers (shared with SheetDetail logic) ───────────────────────
export const _PERTH_OFFSET_SUFFIX = "T00:00:00+08:00";

export const _PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;

export const _PERTH_TIME_ZONE = "Australia/Perth";

export function _ymdToPerthMs(ymd: string) {
  return new Date(`${ymd}${_PERTH_OFFSET_SUFFIX}`).getTime();
}

export function _addDaysToYmd(ymd: string, days: number) {
  const perthMs = _ymdToPerthMs(ymd) + days * 86400000;
  const d = new Date(perthMs + _PERTH_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function _formatPerthDateLabel(ymd: string) {
  return new Date(`${ymd}${_PERTH_OFFSET_SUFFIX}`)
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: _PERTH_TIME_ZONE,
    })
    .toUpperCase();
}

export function _getTodayPerthYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: _PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === "year")?.value ?? "1970";
  const month = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}
