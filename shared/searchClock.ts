// Search — the clock the rings run on.
//
// The rings grow with the time since he was last seen. That time is kept to
// the second (epoch milliseconds) so they can grow every 15 seconds from the
// exact moment: choosing "Now" starts at nothing, and "2 min" starts two
// minutes in. Pausing holds the clock at the moment it was paused. Pure
// functions, no outside calls; the Target Predictor feeds the result into
// `predict()` as minutes after midnight (Perth).

/** How often the rings are redrawn while the predictor is on. */
export const RING_REFRESH_MS = 15_000;

/** The "seen how long ago" buttons, in minutes. */
export const SEEN_AGO_MINUTES = [0, 1, 2, 3, 5] as const;

export interface SearchElapsed {
  /** The moment the clock stands at: now, or the moment it was paused. */
  effectiveNowMs: number;
  /** Minutes since he was last seen at that moment (never negative). */
  elapsedMinutes: number;
  /** Held by a pause. */
  paused: boolean;
}

/** Where the clock stands for a sighting at `seenAtMs`, paused at `pausedAtMs`
 * (null = not paused), looked at `nowMs`. A pause before the sighting, or one
 * in the future, is trimmed to the range between the two. */
export function searchElapsed(
  seenAtMs: number,
  pausedAtMs: number | null,
  nowMs: number
): SearchElapsed {
  const paused = pausedAtMs !== null;
  const stop = paused
    ? Math.min(Math.max(pausedAtMs as number, seenAtMs), nowMs)
    : nowMs;
  const effectiveNowMs = Math.max(stop, seenAtMs);
  return {
    effectiveNowMs,
    elapsedMinutes: Math.max(0, (effectiveNowMs - seenAtMs) / 60_000),
    paused,
  };
}

/** The moment `agoMinutes` before `nowMs`. */
export const seenAgo = (agoMinutes: number, nowMs: number): number =>
  nowMs - agoMinutes * 60_000;

/** A time kept only in minutes after midnight (an older shared row) as epoch
 * milliseconds, on the given Perth date (YYYY-MM-DD). */
export function msFromPerthMinutes(dateISO: string, minutes: number): number {
  return Date.parse(`${dateISO}T00:00:00+08:00`) + Math.round(minutes) * 60_000;
}
