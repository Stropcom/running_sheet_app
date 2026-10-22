import type { Express } from "express";
import { getDb } from "./db";

/**
 * A plain "is the database answering?" address for an uptime monitor
 * (DigitalOcean's Uptime check points at /healthz). It is open to anyone and
 * says nothing beyond up or down: no version, no error text. 200 when the
 * database answered in time, 503 when it did not.
 *
 * The answer is kept for a few seconds, so a flood of requests (or several
 * monitoring regions at once) costs the database at most one small query per
 * `cacheMs`, not one per request.
 */
export const HEALTH_TIMEOUT_MS = 3000;
export const HEALTH_CACHE_MS = 5000;

/** True when the database answers within `timeoutMs`. Never throws. */
export async function pingDatabase(
  timeoutMs = HEALTH_TIMEOUT_MS
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // getDb() runs "SELECT 1" on the pool (or reconnects), and gives null
    // when the database cannot be reached.
    const db = await Promise.race([
      getDb(),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return db != null;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function registerHealthRoute(
  app: Express,
  ping: () => Promise<boolean> = pingDatabase,
  cacheMs = HEALTH_CACHE_MS,
  now: () => number = Date.now
) {
  let last: { at: number; ok: boolean } | null = null;
  let inFlight: Promise<boolean> | null = null;

  const check = async (): Promise<boolean> => {
    if (last && now() - last.at < cacheMs) return last.ok;
    if (!inFlight) {
      inFlight = ping()
        .catch(() => false)
        .then(ok => {
          last = { at: now(), ok };
          return ok;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };

  app.get("/healthz", async (_req, res) => {
    const ok = await check();
    res.setHeader("Cache-Control", "no-store");
    res.status(ok ? 200 : 503).json({ ok });
  });
}
