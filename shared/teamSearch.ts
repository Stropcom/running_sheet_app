// Team Search — one search for everyone on the operation.
//
// A search belongs to a running sheet (one shared row: the pin, the time he was
// seen, the pause) but it is shown to everybody who is logged in and has that
// operation selected on the Map, whatever sheet or target they have selected
// themselves. The server only checks that they may reach the operation (the
// normal access rule). These are the rules for which search a screen shows and
// when a new one may start. Deterministic, no outside calls; tests in
// `server/teamSearch.test.ts`.

/** A search nobody has touched for this long is over, so one that was never
 * ended does not keep switching the predictor on for everyone all day. Any
 * change to it (a tap, a time button, pause, resume) starts the clock again. */
export const SEARCH_LIFETIME_MS = 4 * 60 * 60 * 1000;

/** Whether a search last updated at `updatedAtMs` is still running at `nowMs`. */
export function isSearchLive(updatedAtMs: number, nowMs: number): boolean {
  return nowMs - updatedAtMs <= SEARCH_LIFETIME_MS;
}

/** While a search on an operation has been touched within this long, it holds
 * the operation: a search started on another sheet of the same operation joins
 * it instead of starting a second one. After this long untouched, a new start
 * takes over. */
export const SEARCH_PRIORITY_MS = 60 * 60 * 1000;

/** Whether a search last updated at `updatedAtMs` still holds its operation. */
export function holdsPriority(updatedAtMs: number, nowMs: number): boolean {
  return nowMs - updatedAtMs <= SEARCH_PRIORITY_MS;
}

/** The search a screen shows when several are running on the operations it has
 * selected: the one that **started first**. Searches that are no longer live
 * are not considered. Null when there is none. */
export function chooseSearch<
  T extends { startedAtMs: number; updatedAtMs: number },
>(searches: T[], nowMs: number): T | null {
  const live = searches.filter(s => isSearchLive(s.updatedAtMs, nowMs));
  if (live.length === 0) return null;
  return live.reduce((first, s) =>
    s.startedAtMs < first.startedAtMs ? s : first
  );
}
