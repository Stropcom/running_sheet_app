import { inArray, sql } from "drizzle-orm";
import { scopeEntities } from "@shared/operationAccess";
import { intelScope } from "../intelScope";
import {
  FingerprintCache,
  fingerprintSql,
  fingerprintFromRow,
  type Fingerprint,
} from "../intelCache";
import { runningSheets } from "../../drizzle/schema";
import { recordIntelBuild } from "../intelBuildWatch";
import { getDb } from "./core";
import { IntelligenceEntity } from "./intelligence";
import { loadRegistry } from "./intelBuild/registry";
import { addTargetCards } from "./intelBuild/targetCards";
import { addAssociateCards } from "./intelBuild/associateCards";
import { prepareOccurrences } from "./intelBuild/occurrences";
import { findRegisteredMentions } from "./intelBuild/registeredMentions";
import { scanSheets } from "./intelBuild/sheetPass";
import { mergeAndLink } from "./intelBuild/finish";

// The unscoped entity set is remembered for a short while and reused only when
// the source tables haven't changed (server/intelCache.ts). Everyone gets a
// copy the per-request scope below is applied to that copy.
const intelEntityCache = new FingerprintCache<IntelligenceEntity[]>(v =>
  structuredClone(v)
);

/** Drop the remembered set after a write the change check can't see (an
 * in-place update of a link or alias row). */
export function invalidateIntelligenceCache() {
  intelEntityCache.invalidate();
}

async function loadAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  let fp: Fingerprint | null = null;
  try {
    const db = await getDb();
    if (db) {
      const [rows] = (await db.execute(
        sql.raw(fingerprintSql())
      )) as unknown as [Record<string, unknown>[]];
      fp = fingerprintFromRow(rows?.[0]);
    }
  } catch {
    fp = null; // the check failed: build fresh, remember nothing
  }
  return intelEntityCache.get(fp, async () => {
    // Time each real rebuild (not a cache hit) so the log warns when it is
    // time to start the Intelligence redesign (server/intelBuildWatch.ts).
    const started = Date.now();
    const built = await buildAllIntelligenceEntities();
    recordIntelBuild(Date.now() - started, fp ? fp.rows : null, built.length);
    return built;
  });
}

export async function getAllIntelligenceEntities(opts?: {
  /** Skip the per-request Intelligence scope (Region Search only). */
  unscoped?: boolean;
}) {
  const all = await loadAllIntelligenceEntities();
  const scope = intelScope.getStore();
  if (!scope || opts?.unscoped) return all;
  // A registry target's occurrences carry operation 0 even when its running
  // sheet sits inside a hidden operation, so hide by the sheet as well.
  const hiddenIds = Array.from(scope.hiddenOperationIds);
  const db = hiddenIds.length > 0 ? await getDb() : null;
  const hiddenSheets = new Set<number>();
  if (db) {
    const rows = await db
      .select({ id: runningSheets.id })
      .from(runningSheets)
      .where(inArray(runningSheets.operationId, hiddenIds));
    for (const r of rows) hiddenSheets.add(r.id);
  }
  return scopeEntities(all, scope.hiddenOperationIds, hiddenSheets);
}

async function buildAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  const db = await getDb();
  if (!db) return [];

  const s0 = { db };
  const s_registry = await loadRegistry(s0);
  addTargetCards({ ...s0, ...s_registry });
  await addAssociateCards({ ...s0, ...s_registry });
  const s_occurrences = await prepareOccurrences({ ...s0, ...s_registry });
  const s_registeredMentions = findRegisteredMentions({
    ...s0,
    ...s_registry,
    ...s_occurrences,
  });
  scanSheets({
    ...s0,
    ...s_registry,
    ...s_occurrences,
    ...s_registeredMentions,
  });
  return await mergeAndLink({
    ...s0,
    ...s_registry,
    ...s_occurrences,
    ...s_registeredMentions,
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────
