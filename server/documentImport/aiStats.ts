// What the on-device document AI check has done since the server started, so the
// owner can tell whether it ever adds anything (Access Management → Document AI).
// In memory only: it starts again from zero on every restart, and nothing here
// is stored or sent anywhere.

export interface AiImportRecord {
  /** Which way the AI step went for this import. */
  mode: "off" | "unavailable" | "ran";
  /** Model checks that were started. */
  calls: number;
  /** The model's reading agreed with the rules' own. */
  confirmed: number;
  /** The model offered a reading that parsed (a different one, or one for text
   * the rules couldn't read at all). */
  suggested: number;
  /** Stopped by the time limit, or skipped while an earlier call was running. */
  stoppedEarly: boolean;
  /** Time spent in the AI step. */
  aiMs: number;
  /** Time for the whole import. */
  totalMs: number;
}

export interface AiStats {
  imports: number;
  /** Imports where the AI step was switched off, or the model isn't installed. */
  withoutAi: number;
  /** Imports where the AI step ran (even if it found nothing to check). */
  withAi: number;
  /** Of those, how many had anything for the model to look at. */
  checked: number;
  calls: number;
  confirmed: number;
  suggested: number;
  stoppedEarly: number;
  aiMs: number;
  /** Total time of imports with / without the AI step, for comparing. */
  totalMsWithAi: number;
  totalMsWithoutAi: number;
  since: number;
}

const blank = (): AiStats => ({
  imports: 0,
  withoutAi: 0,
  withAi: 0,
  checked: 0,
  calls: 0,
  confirmed: 0,
  suggested: 0,
  stoppedEarly: 0,
  aiMs: 0,
  totalMsWithAi: 0,
  totalMsWithoutAi: 0,
  since: Date.now(),
});

let stats = blank();

export function recordAiImport(r: AiImportRecord) {
  stats.imports++;
  if (r.mode === "ran") {
    stats.withAi++;
    if (r.calls > 0) stats.checked++;
    stats.calls += r.calls;
    stats.confirmed += r.confirmed;
    stats.suggested += r.suggested;
    if (r.stoppedEarly) stats.stoppedEarly++;
    stats.aiMs += r.aiMs;
    stats.totalMsWithAi += r.totalMs;
  } else {
    stats.withoutAi++;
    stats.totalMsWithoutAi += r.totalMs;
  }
}

export function getAiStats(): AiStats {
  return { ...stats };
}

export function resetAiStats() {
  stats = blank();
}
