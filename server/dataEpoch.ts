// "Data epoch": when the data was last zeroed (Access Management → Zero data).
// Phones and tablets keep unsent drafts in their own offline store; after a
// zero those would replay against records that no longer exist, so every
// device compares this number (sent with auth.me) with the one it last saw and
// throws its local drafts away when it has changed. It is read from the
// "data_zeroed" audit entry written by the zero itself — 0 if never zeroed.

import { and, eq, max } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { getDb } from "./db";

let cache: { at: number; value: number } | null = null;
const TTL_MS = 30_000;

export function invalidateDataEpoch() {
  cache = null;
}

export async function loadDataEpoch(): Promise<number> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const db = await getDb();
  if (!db) return cache?.value ?? 0;
  const [row] = await db
    .select({ at: max(auditLogs.createdAt) })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "data_zeroed")));
  const value = Number(row?.at ?? 0);
  cache = { at: Date.now(), value };
  return value;
}
