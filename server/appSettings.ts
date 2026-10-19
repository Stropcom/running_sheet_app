// Small owner-set on/off switches that aren't about one Command (table
// app_settings: one row per setting, "true" / "false"). A setting with no row,
// or one that can't be read, is its own default. Cached for a couple of
// seconds and dropped whenever it changes.

import { eq } from "drizzle-orm";
import { appSettings } from "../drizzle/schema";
import { getDb } from "./db";

/** Import Target's on-device document AI check (documentImport/localDocumentAI.ts). */
export const DOCUMENT_AI_SETTING = "documentAiEnabled";

const TTL_MS = 2000;
const cache = new Map<string, { at: number; value: boolean }>();

export function invalidateAppSettings() {
  cache.clear();
}

export async function getBoolSetting(
  key: string,
  fallback: boolean
): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = fallback;
  try {
    const db = await getDb();
    if (db) {
      const [row] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.settingKey, key))
        .limit(1);
      if (row) value = row.settingValue === "true";
    }
  } catch {
    value = fallback;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function setBoolSetting(
  key: string,
  value: boolean,
  byCIN: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(appSettings)
    .values({
      settingKey: key,
      settingValue: String(value),
      updatedByCIN: byCIN,
    })
    .onDuplicateKeyUpdate({
      set: { settingValue: String(value), updatedByCIN: byCIN },
    });
  invalidateAppSettings();
}
