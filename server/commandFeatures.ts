// Per-Command feature switches (rule and list: shared/commandFeatures.ts).
// Settings are tiny, so they are cached for a couple of seconds and dropped
// whenever they change.

import { TRPCError } from "@trpc/server";
import {
  buildFeatureMatrix,
  featureForPath,
  featuresFor,
  type FeatureMatrix,
  type FeatureSetting,
} from "@shared/commandFeatures";
import { isCommandCode } from "@shared/commands";
import { commandFeatures } from "../drizzle/schema";
import { getDb } from "./db";

let cache: { at: number; matrix: FeatureMatrix } | null = null;
const TTL_MS = 2000;

export function invalidateFeatureCache() {
  cache = null;
}

/** Every Command's switches (on unless a saved setting says off). */
export async function loadFeatureMatrix(): Promise<FeatureMatrix> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.matrix;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(commandFeatures);
  const saved: FeatureSetting[] = rows
    .filter(r => isCommandCode(r.command))
    .map(r => ({
      command: r.command,
      feature: r.feature as FeatureSetting["feature"],
      enabled: r.enabled,
    }));
  const matrix = buildFeatureMatrix(saved);
  cache = { at: Date.now(), matrix };
  return matrix;
}

/** Save changed switches (one row per Command and feature). */
export async function saveFeatureSettings(
  changes: FeatureSetting[],
  byCIN: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const c of changes) {
    await db
      .insert(commandFeatures)
      .values({
        command: c.command,
        feature: c.feature,
        enabled: c.enabled,
        updatedByCIN: byCIN,
      })
      .onDuplicateKeyUpdate({
        set: { enabled: c.enabled, updatedByCIN: byCIN },
      });
  }
  invalidateFeatureCache();
}

/** Refuse a request for a feature the person's Command has switched off. */
export async function enforceFeatureAccess(
  user: { command?: string | null; allRegions?: boolean | null },
  path: string
): Promise<void> {
  const feature = featureForPath(path);
  if (!feature) return;
  if (user.allRegions) return;
  const matrix = await loadFeatureMatrix();
  if (!featuresFor(user, matrix)[feature]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That feature isn't turned on for your Command.",
    });
  }
}
