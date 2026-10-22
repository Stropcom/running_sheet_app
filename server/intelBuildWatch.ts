// An early-warning light for the Intelligence entity build.
//
// The Intelligence list of people, vehicles and places is rebuilt from every
// running sheet row (see getAllIntelligenceEntities). That is fast while there
// is little data and slows in step with the number of rows (measured: roughly
// 0.1 s per 1,000 rows on a development machine, so ~9 s at one year of the
// expected growth, ~40 s at five). This watches each rebuild and writes one
// line to the server log, and a clear WARNING once it is time to start the
// planned redesign — so nobody has to remember to look.
//
// Where to look: `pm2 logs runlog | grep "\[Intelligence\]"`.
// The plan and what to do when the warning appears:
// docs/features/dev-and-ops.md, "Intelligence redesign plan".
//
// Pure functions with the clock passed in, so the rules are tested
// (server/intelBuildWatch.test.ts). No network, no AI: it only reads timings.

/** A single rebuild this slow, or slower, is a warning. */
export const INTEL_BUILD_WARN_MS = 3000;
/** This many running sheet rows or more is a warning, however fast it is. */
export const INTEL_BUILD_WARN_ROWS = 20000;
/** How often an ordinary (healthy) build is written to the log. */
export const OK_LOG_EVERY_MS = 10 * 60 * 1000;
/** How often the warning is repeated (a rebuild happens after every change). */
export const WARN_LOG_EVERY_MS = 30 * 60 * 1000;

export interface IntelBuildReport {
  ms: number;
  /** Running sheet rows at the time (null when the check could not read it). */
  rows: number | null;
  entities: number;
  level: "ok" | "warn";
  message: string;
}

function seconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function describeIntelBuild(
  ms: number,
  rows: number | null,
  entities: number
): IntelBuildReport {
  const slow = ms >= INTEL_BUILD_WARN_MS;
  const big = rows !== null && rows >= INTEL_BUILD_WARN_ROWS;
  const level = slow || big ? "warn" : "ok";
  let message = `[Intelligence] entity build took ${seconds(ms)}${
    rows === null ? "" : ` for ${rows.toLocaleString("en-AU")} rows`
  } (${entities.toLocaleString("en-AU")} entities)`;
  if (level === "warn") {
    const why = [
      slow
        ? `a rebuild now takes ${seconds(ms)} (limit ${seconds(INTEL_BUILD_WARN_MS)})`
        : "",
      big
        ? `there are ${rows!.toLocaleString("en-AU")} rows (limit ${INTEL_BUILD_WARN_ROWS.toLocaleString("en-AU")})`
        : "",
    ]
      .filter(Boolean)
      .join(" and ");
    message += ` — WARNING: ${why}. It is time to start the Intelligence redesign (docs/features/dev-and-ops.md, "Intelligence redesign plan").`;
  }
  return { ms, rows, entities, level, message };
}

let lastLoggedAt = 0;
let lastLoggedLevel: "ok" | "warn" | null = null;
let lastBuild: IntelBuildReport | null = null;

/** Whether this report should be written to the log now (not every rebuild:
 * a rebuild follows every change, so lines are spaced out). */
export function shouldLog(
  report: IntelBuildReport,
  now: number,
  last: { at: number; level: "ok" | "warn" | null }
): boolean {
  if (last.level === null) return true; // the first build of this process
  if (report.level !== last.level) return true; // it just got worse (or better)
  const gap = report.level === "warn" ? WARN_LOG_EVERY_MS : OK_LOG_EVERY_MS;
  return now - last.at >= gap;
}

/** Called after every rebuild. Returns the report; logs it when due. */
export function recordIntelBuild(
  ms: number,
  rows: number | null,
  entities: number,
  now: number = Date.now(),
  log: (level: "ok" | "warn", message: string) => void = (level, message) =>
    level === "warn" ? console.warn(message) : console.log(message)
): IntelBuildReport {
  const report = describeIntelBuild(ms, rows, entities);
  lastBuild = report;
  if (shouldLog(report, now, { at: lastLoggedAt, level: lastLoggedLevel })) {
    log(report.level, report.message);
    lastLoggedAt = now;
    lastLoggedLevel = report.level;
  }
  return report;
}

/** The most recent rebuild this process did (null before the first). */
export function getLastIntelBuild(): IntelBuildReport | null {
  return lastBuild;
}

/** Test helper: forget what has been logged. */
export function resetIntelBuildWatch() {
  lastLoggedAt = 0;
  lastLoggedLevel = null;
  lastBuild = null;
}
