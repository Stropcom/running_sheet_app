import { drizzle } from "drizzle-orm/mysql2";

import {
  createPool as createPromisePool,
  type PoolConnection,
} from "mysql2/promise";

let _db: ReturnType<typeof drizzle> | null = null;

let _pool: Awaited<ReturnType<typeof createPromisePool>> | null = null;

let _lastConnectAttempt = 0;

const RECONNECT_COOLDOWN_MS = 5000;
// don't retry more than once per 5s
// Caches the in-flight connection attempt so concurrent getDb() callers (e.g.
// several queries fired via Promise.all on a cold start, before any pool
// exists yet) await the same attempt instead of each independently hitting
// the cooldown check below and silently getting null — which previously
// meant only the first of several concurrent queries actually ran, and the
// rest quietly returned empty results with no error.
let _connectingPromise: Promise<ReturnType<typeof drizzle> | null> | null =
  null;

// Managed hosts (e.g. TiDB Cloud) require TLS; a local dev database normally
// isn't configured for it. Only force SSL for non-local hosts so local
// development keeps working without requiring a local SSL setup.
function isLocalDatabaseHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

async function createDbPool(
  retries = 3
): Promise<ReturnType<typeof drizzle> | null> {
  const useSsl = !isLocalDatabaseHost(process.env.DATABASE_URL!);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = createPromisePool({
        uri: process.env.DATABASE_URL!,
        ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 15000,
        // Automatically re-establish broken connections
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      // Verify the connection is actually alive
      await pool.query("SELECT 1");
      _pool = pool;
      console.log(`[Database] Pool created successfully (attempt ${attempt})`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return drizzle(pool as any);
    } catch (error) {
      console.warn(
        `[Database] Connection attempt ${attempt}/${retries} failed:`,
        error
      );
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // backoff: 1s, 2s
      }
    }
  }
  console.error("[Database] All connection attempts failed");
  return null;
}

/**
 * Runs `fn` on one dedicated connection from the pool, for work that needs
 * session state to stay put across statements (e.g. SET FOREIGN_KEY_CHECKS).
 * The connection is always handed back.
 */
export async function withDedicatedConnection<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  if (!(await getDb()) || !_pool) throw new Error("DB unavailable");
  const conn = await _pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

export async function getDb() {
  // If we have a pool, do a lightweight health check to detect stale connections
  if (_db && _pool) {
    try {
      await _pool.query("SELECT 1");
      return _db;
    } catch {
      console.warn("[Database] Pool health check failed — reconnecting...");
      _db = null;
      _pool = null;
    }
  }
  if (!_db && process.env.DATABASE_URL) {
    if (_connectingPromise) return _connectingPromise;
    const now = Date.now();
    if (now - _lastConnectAttempt < RECONNECT_COOLDOWN_MS) {
      // Too soon to retry — return null to avoid hammering the DB
      return null;
    }
    _lastConnectAttempt = now;
    _connectingPromise = createDbPool(3).finally(() => {
      _connectingPromise = null;
    });
    _db = await _connectingPromise;
  }
  return _db;
}
