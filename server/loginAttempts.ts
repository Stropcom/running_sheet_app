// Counts password sign-in attempts per address, one for every auth.login call.
//
// The Express limiter in server/_core/index.ts counts HTTP requests, but one
// request can carry many calls (a tRPC batch) and the address it looks at is
// only the start of the path, so a batch that starts with another call, or
// carries a hundred logins, got through it. This counts the calls themselves,
// inside the login procedure. Same limit as the Express one: 20 per 15 minutes
// per address. In memory, so one server process only (as the passkey counters).
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 20;

const hits = new Map<string, number[]>();

/** Records an attempt; false when this address is over the limit. */
export function consumeLoginAttempt(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter(t => now - t < LOGIN_WINDOW_MS);
  if (recent.length >= LOGIN_MAX_ATTEMPTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map small: drop addresses whose attempts have all expired.
  if (hits.size > 5000)
    hits.forEach((times, k) => {
      if (times.every(t => now - t >= LOGIN_WINDOW_MS)) hits.delete(k);
    });
  return true;
}

export function resetLoginAttempts() {
  hits.clear();
}
