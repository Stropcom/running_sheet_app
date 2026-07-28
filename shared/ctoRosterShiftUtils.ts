// CTO Roster — shift code metadata, ported from roster_app's shared/shiftUtils.ts.
// Colours live in client/src/index.css as --shift-* CSS variables / .shift-*
// utility classes (same palette, ported verbatim).

export const SHIFT_CODES = ["d", "a", "r", "o", "l", "c", "tt", "dep", "doc", "adoc", "ad", "aoc"] as const;
export type ShiftCode = typeof SHIFT_CODES[number];

/** Full human-readable label for each shift code */
export const SHIFT_LABELS: Record<ShiftCode, string> = {
  d: "Day",
  a: "Arvo",
  r: "Rest Day",
  o: "On Call",
  l: "Leave",
  c: "Court",
  tt: "Training",
  dep: "Deployment",
  doc: "Day on-call",
  adoc: "Admin",
  ad: "Admin",
  aoc: "Arvo on-call",
};

/** Default start time for each shift code */
export const SHIFT_TIMES: Record<ShiftCode, string> = {
  d: "07:00",
  a: "13:00",
  r: "",
  o: "",
  l: "",
  c: "",
  tt: "",
  dep: "",
  doc: "07:00",
  adoc: "10:00",
  ad: "10:00",
  aoc: "14:00",
};

/** CSS utility class for each shift code (see index.css) */
export function shiftClass(code: string): string {
  const map: Record<string, string> = {
    d: "shift-d",
    a: "shift-a",
    r: "shift-r",
    o: "shift-o",
    l: "shift-l",
    c: "shift-c",
    tt: "shift-tt",
    dep: "shift-dep",
    doc: "shift-doc",
    adoc: "shift-adoc",
    ad: "shift-ad",
    aoc: "shift-aoc",
  };
  return map[code.toLowerCase()] ?? "bg-muted text-muted-foreground";
}

/** Shift codes that count as "on duty" for the summary row */
export const ON_DUTY_CODES = new Set(["d", "a", "ad", "adoc", "aoc", "doc"]);

/** Shift codes that count as "on call" for the on-call total row */
export const ON_CALL_CODES = new Set(["o", "doc", "adoc", "aoc"]);

export const ROSTER_START = "2026-05-18";
export const ROSTER_END = "2026-12-31";

export const TEAM_NAMES = ["Team 1", "Team 2", "PTT", "Capability"] as const;
