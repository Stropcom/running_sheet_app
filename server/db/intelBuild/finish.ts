// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import { and, isNotNull, isNull } from "drizzle-orm";
import { targets } from "../../../drizzle/schema";
import { IntelligenceEntity, mergeContainedEntities } from "../intelligence";
import type { RegistryState } from "./registry";
import type { BuildDb } from "./types";

export async function mergeAndLink(
  s: { db: BuildDb } & Pick<RegistryState, "entityMap">
) {
  const { db, entityMap } = s;

  // ── 4. Post-process: merge address and vehicle entities where one shortForm is a
  //       strict prefix of another (e.g. "1 Smith Street" absorbed into
  //       "1 Smith Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux").
  //       See mergeContainedEntities above for the algorithm itself.
  // ─────────────────────────────────────────────────────────────────────────────

  // Separate target entities (keyed as target::) from non-target entities
  const nonTargetEntities = Array.from(entityMap.entries())
    .filter(([key]) => !key.startsWith("target::"))
    .map(([, entity]) => entity);

  const targetEntities = Array.from(entityMap.entries())
    .filter(([key]) => key.startsWith("target::"))
    .map(([, entity]) => entity);

  // Group non-target entities by type
  const byType = new Map<string, IntelligenceEntity[]>();
  for (const entity of nonTargetEntities) {
    const t = entity.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(entity);
  }

  const mergedMap = new Map<string, IntelligenceEntity>();

  for (const [entityType, group] of Array.from(byType.entries())) {
    // Only apply prefix-merge to addresses and vehicles
    if (entityType !== "address" && entityType !== "vehicle") {
      // For all other types, just add them as-is
      for (const entity of group) {
        const k = `${entity.type}::${entity.shortForm.toLowerCase().trim()}`;
        mergedMap.set(k, entity);
      }
      continue;
    }

    for (const survivor of mergeContainedEntities(group, entityType)) {
      const mergeKey = `${survivor.type}::${survivor.shortForm.toLowerCase().trim()}`;
      mergedMap.set(mergeKey, survivor);
    }
  }

  // Add target entities back — they were never in byType
  for (const entity of targetEntities) {
    const k = `target::${entity.shortForm}`;
    mergedMap.set(k, entity);
  }

  // ── Person Identity Links: mirror intelligence across a linked pair ────────
  // A Target card and a Registry Associate card can be confirmed as the same
  // real person (targets.linkedAssociateId / associates.linkedTargetId — see
  // "Person Identity Links" above updateTarget). Both records intentionally
  // stay as separate profiles (a Target and an Associate are different
  // roles), but neither one should be missing intelligence the other has —
  // so union their occurrences onto both entities, and mark each with a
  // pointer to its identical twin so the UI can flag it.
  const linkedPairRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      associateId: targets.linkedAssociateId,
    })
    .from(targets)
    .where(
      and(isNull(targets.deletedAt), isNotNull(targets.linkedAssociateId))
    );

  for (const pair of linkedPairRows) {
    if (!pair.associateId) continue;
    const targetEntity = mergedMap.get(`target::${pair.targetName}`);
    const associateEntity = Array.from(mergedMap.values()).find(
      e => e.isAssociate && e.associateId === pair.associateId
    );
    if (!targetEntity || !associateEntity) continue;

    const seen = new Set<string>();
    const combined: IntelligenceEntity["occurrences"] = [];
    for (const occ of [
      ...targetEntity.occurrences,
      ...associateEntity.occurrences,
    ]) {
      const dedupeKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      combined.push(occ);
    }
    targetEntity.occurrences = combined;
    associateEntity.occurrences = combined.slice();

    targetEntity.identicalProfile = {
      type: "associate",
      id: associateEntity.associateId!,
      label: associateEntity.shortForm,
    };
    associateEntity.identicalProfile = {
      type: "target",
      id: targetEntity.targetId!,
      label: targetEntity.shortForm,
    };

    // A registry field (V1F/HBF/etc.) shared by this linked pair produces
    // its own "Target card" occurrence from the target's own record AND a
    // separate "Associate card" occurrence from the associate's own record
    // on whatever vehicle/address entity that field's value keys into —
    // even though both describe the exact same real-world fact for the
    // exact same person (see updateTarget's Person Identity Link sync).
    // When neither side has any real operation touchpoint of its own, that
    // duplication is harmless — it's still just one true Indices-only fact.
    // But once EITHER side carries a real operation (e.g. the associate's
    // parent target is tasked to an operation while the linked target
    // itself is a bare registry entry), the other side's "(Registry)"
    // fallback occurrence for that same synced field is a redundant
    // restatement, not a second independent cross-operation touchpoint —
    // left in place it inflated e.g. a vehicle's "linked operations" with a
    // phantom "(Registry)" badge alongside the real one. combined (just
    // assigned above) already carries the union of both sides' own PERSON
    // occurrences, so it's the right place to check for real exposure.
    const identityHasRealOp = combined.some(o => o.operationId !== 0);
    if (identityHasRealOp) {
      const targetCardPrefix = `Target card — ${targetEntity.shortForm} [`;
      const associateCardPrefix = `Associate card — ${associateEntity.shortForm} [`;
      for (const entity of Array.from(mergedMap.values())) {
        if (entity.type !== "vehicle" && entity.type !== "address") continue;
        entity.occurrences = entity.occurrences.filter(o => {
          if (o.rowId !== 0 || o.operationId !== 0) return true;
          return (
            !o.observationSnippet.startsWith(targetCardPrefix) &&
            !o.observationSnippet.startsWith(associateCardPrefix)
          );
        });
      }
    }
  }

  // "Indices" flag — computed last, once every occurrence (registry-injected
  // and text-mined alike) has been assembled and merged above.
  const finalEntities = Array.from(mergedMap.values());
  for (const entity of finalEntities) {
    entity.isIndicesOnly =
      entity.occurrences.length > 0 &&
      entity.occurrences.every(o => o.rowId === 0);
  }

  return finalEntities;
}
