/**
 * How old the Nearmap photos on the map are: the capture date Nearmap's
 * Coverage service reports for a spot, turned into a short label ("14 Mar 2026
 * · 7 months old") and an age band (green under 6 months, amber 6–12 months,
 * red over 12). Pure and deterministic — used by the server (to read the date
 * out of Nearmap's answer) and by components/NearmapAgeLabel.tsx. Tested in
 * server/nearmapAge.test.ts.
 */

export type NearmapAgeBand = "green" | "amber" | "red";

export interface NearmapAge {
  /** "14 Mar 2026". */
  dateLabel: string;
  /** "7 months old". */
  ageText: string;
  /** Compact, for a small window: "7 mo". */
  shortAge: string;
  band: NearmapAgeBand;
  /** Whole calendar months since the capture date. */
  months: number;
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
const DAY_MS = 86_400_000;

/** "2026-03-14" (or an ISO timestamp) → that day at UTC midnight, or null. */
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1 ? null : d;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The label for a capture date, as of `now`; null when the date is unreadable. */
export function describeNearmapAge(
  captureDate: string,
  now: Date
): NearmapAge | null {
  const d = parseDay(captureDate);
  if (!d) return null;
  const today = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const days = Math.max(
    0,
    Math.round((today.getTime() - d.getTime()) / DAY_MS)
  );
  let months =
    (today.getUTCFullYear() - d.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - d.getUTCMonth());
  if (today.getUTCDate() < d.getUTCDate()) months -= 1;
  months = Math.max(0, months);

  let ageText: string;
  let shortAge: string;
  if (days < 14) {
    ageText = days === 0 ? "today" : `${plural(days, "day")} old`;
    shortAge = days === 0 ? "today" : `${days} d`;
  } else if (months < 3) {
    const w = Math.round(days / 7);
    ageText = `${plural(w, "week")} old`;
    shortAge = `${w} wk`;
  } else if (months < 12) {
    ageText = `${plural(months, "month")} old`;
    shortAge = `${months} mo`;
  } else if (months < 24) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    ageText = `${plural(y, "year")}${m ? ` ${plural(m, "month")}` : ""} old`;
    shortAge = `${y} yr${m ? ` ${m} mo` : ""}`;
  } else {
    const y = Math.floor(months / 12);
    ageText = `${plural(y, "year")} old`;
    shortAge = `${y} yr`;
  }
  return {
    dateLabel: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    ageText,
    shortAge,
    band: months < 6 ? "green" : months < 12 ? "amber" : "red",
    months,
  };
}

/** The newest capture date ("YYYY-MM-DD") in a Nearmap Coverage answer, whatever
 * order the surveys come back in; null when there is none. */
export function latestCaptureDate(json: unknown): string | null {
  const surveys = (json as { surveys?: unknown })?.surveys;
  if (!Array.isArray(surveys)) return null;
  let best: string | null = null;
  for (const s of surveys) {
    const raw = (s as { captureDate?: unknown })?.captureDate;
    if (typeof raw !== "string" || !parseDay(raw)) continue;
    const day = raw.slice(0, 10);
    if (best === null || day > best) best = day;
  }
  return best;
}

/** A spot rounded to about 500 m, so the same neighbourhood asks (and caches)
 * once. */
export function nearmapSpot(
  lat: number,
  lng: number
): { lat: number; lng: number } {
  const r = (n: number) => Math.round(n / 0.005) * 0.005;
  return {
    lat: Number(r(lat).toFixed(3)),
    lng: Number(r(lng).toFixed(3)),
  };
}
