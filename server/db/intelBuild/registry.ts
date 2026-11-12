// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  operations,
  runningSheets,
  targets,
  TargetType,
  operationTargetLinks,
  entityAliases,
} from "../../../drizzle/schema";
import { normalizeEntityLabel } from "../attachments";
import { IntelligenceEntity, subjectTargetEntityKey } from "../intelligence";
import type { BuildDb } from "./types";

export async function loadRegistry(s: { db: BuildDb }) {
  const { db } = s;

  // "business" and "address" are the same category of location entity from
  // an officer's point of view — which one a given mention gets classified
  // as depends only on whether that particular sentence happened to spell
  // out the street address, not on what the place actually is (see the
  // type classification in extractEntitiesFromText above). Bucket both
  // under the same key prefix everywhere an entity type key gets built
  // below, so a location mentioned once with its street address and once
  // without ("The Reveley, 1 Barrack Street, PERTH WA (The Reveley)" vs
  // just "The Reveley (The Reveley)") merges into one entity instead of
  // forking into two separate profiles for the same real place.
  const locationKeyType = (t: string) => (t === "business" ? "address" : t);

  // Confirmed entity-alias merges (fuzzy-duplicate prompt "Yes", or the manual
  // Merge Entities tool) — fold the loser's occurrences into the winner the
  // same way TGT aliases fold into their canonical target below. loserLabel
  // is attached to the winner entity's aliasLabels ("also known as") the
  // first time an occurrence is redirected through it — see registerOccurrence.
  const aliasRows = await db.select().from(entityAliases);
  const entityAliasMap = new Map<string, { key: string; label: string }>();
  for (const a of aliasRows) {
    const aliasType = locationKeyType(a.type);
    entityAliasMap.set(`${aliasType}::${a.loserKey}`, {
      key: `${aliasType}::${a.winnerKey}`,
      label: a.winnerLabel,
    });
  }

  // When two mentions of the same vehicle merge, prefer whichever actually
  // carries more descriptive detail — not whichever happens to start with
  // the rego. That used to be the tie-break (favouring the "REGO
  // description" form observation text is built in, over a raw target-card
  // field where the rego sits mid-sentence, e.g. "silver Hyundai Santa Fe,
  // bearing WA registration 1ICW519") but it backfired badly: a bare
  // "Vehicle 1GHH000" text mention starts with the rego and so counted as
  // "canonical", letting it beat — and overwrite — a fully-detailed target
  // card ("grey Ford Ranger Utility, bearing WA registration 1GHH000") that
  // doesn't. Strip the rego out of both candidates first and compare what's
  // actually left describing the vehicle; whichever has more wins,
  // regardless of where the rego sits in the string.
  const escapeRegExp = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vehicleDescriptiveLength = (
    shortForm: string,
    regoKey: string
  ): number =>
    shortForm
      .toLowerCase()
      .replace(new RegExp(`\\b${escapeRegExp(regoKey)}\\b`, "i"), "")
      .replace(/[,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  const preferVehicleShortForm = (
    existing: string,
    candidate: string,
    regoKey: string
  ): boolean => {
    const existingLen = vehicleDescriptiveLength(existing, regoKey);
    const candidateLen = vehicleDescriptiveLength(candidate, regoKey);
    if (candidateLen !== existingLen) return candidateLen > existingLen;
    return candidate.length > existing.length;
  };

  // ── 1. Load formal target cards first ─────────────────────────────────────
  // Use leftJoin so registry targets with null operationId are included.
  // Also pull in linked operations via operation_target_links for registry targets.
  const directTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      targetType: targets.targetType,
      surname: targets.surname,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      extraAddresses: targets.extraAddresses,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId!, operations.id))
    .where(isNull(targets.deletedAt));

  // Also load registry-linked targets (via operation_target_links)
  const linkedTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      targetType: targets.targetType,
      surname: targets.surname,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      extraAddresses: targets.extraAddresses,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(
      operationTargetLinks,
      eq(operationTargetLinks.targetId, targets.id)
    )
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(isNull(targets.deletedAt));

  // Merge: for each target, prefer linked operation rows; fall back to direct row
  const seenTargetOpPairs = new Set<string>();
  const targetRows: Array<{
    targetId: number;
    targetName: string;
    targetType: TargetType;
    surname: string | null;
    tgt: string | null;
    hb: string | null;
    v1: string | null;
    v2: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    extraVehicles: string | null;
    extraAddresses: string | null;
    operationId: number | null;
    operationName: string | null;
  }> = [];

  for (const row of linkedTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    seenTargetOpPairs.add(pairKey);
    targetRows.push(row);
  }
  for (const row of directTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    if (!seenTargetOpPairs.has(pairKey)) {
      targetRows.push(row);
    }
  }

  // Find sheets linked to each target (exclude soft-deleted sheets)
  const sheetsByTarget = await db
    .select({
      targetId: runningSheets.targetId,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
    })
    .from(runningSheets)
    .where(
      and(isNotNull(runningSheets.targetId), isNull(runningSheets.deletedAt))
    );

  const targetSheetMap = new Map<
    number,
    Array<{ sheetId: number; sheetTitle: string }>
  >();
  for (const s of sheetsByTarget) {
    if (s.targetId === null) continue;
    if (!targetSheetMap.has(s.targetId)) targetSheetMap.set(s.targetId, []);
    targetSheetMap
      .get(s.targetId)!
      .push({ sheetId: s.sheetId, sheetTitle: s.sheetTitle });
  }

  // The target each sheet was opened for (inverse of targetSheetMap).
  const sheetTargetIdBySheet = new Map<number, number>();
  for (const [tid, list] of Array.from(targetSheetMap.entries()))
    for (const sh of list) sheetTargetIdBySheet.set(sh.sheetId, tid);

  // Build a set of TGT aliases so we can suppress them from observation-derived persons
  // Maps tgtAlias (uppercased) -> canonical full name
  const tgtAliasToFullName = new Map<string, string>();
  // Every target that carries an alias (two targets can share a surname).
  const tgtAliasCandidates = new Map<string, string[]>();
  for (const t of targetRows) {
    if (t.tgt && t.tgt.trim()) {
      const k = t.tgt.trim().toUpperCase();
      tgtAliasToFullName.set(k, t.targetName);
      const list = tgtAliasCandidates.get(k) ?? [];
      if (!list.includes(t.targetName)) list.push(t.targetName);
      tgtAliasCandidates.set(k, list);
    }
  }
  // Same idea for registry associates: maps their bracket surname (e.g.
  // "P.HILL") to the associate's own entity key, so a bare mention of that
  // bracket elsewhere in observation text redirects into this associate's
  // entity instead of spawning a lookalike duplicate.
  const associateAliasToKey = new Map<string, string>();
  // Every registered person (targets and associates) under their surname
  // alias, so a mention that is exactly a *different* registered person with
  // the target's surname ("Hana PARK" vs the target "Soo-Min Hana PARK") is
  // never folded into the target.
  const registeredNamesByAlias = new Map<string, string[]>();
  const noteRegisteredName = (
    alias: string | null | undefined,
    name: string
  ) => {
    const k = (alias ?? "").trim().toUpperCase();
    if (!k || !name) return;
    const list = registeredNamesByAlias.get(k) ?? [];
    list.push(name);
    registeredNamesByAlias.set(k, list);
  };
  for (const t of targetRows) noteRegisteredName(t.tgt, t.targetName);

  const entityMap = new Map<string, IntelligenceEntity>();

  // A person Target's own name, as an ordinary person key, → its target entity.
  // A confirmed merge ("Yes, same person" on the duplicate prompt, or Merge
  // Entities) names the target's NAME as the winner, so mentions redirected
  // through it must land on the target entity itself — not on a second
  // person entity that happens to carry the same name. (The surname-alias
  // fold above can't do this on its own: it refuses a mention whose given
  // name differs, e.g. "Mikayla" vs "Mikala", which is exactly the case a
  // confirmed merge exists to settle.)
  const personTargetByKey = new Map<string, string>();
  for (const t of targetRows) {
    if (t.targetType && t.targetType !== "person") continue;
    personTargetByKey.set(
      `person::${normalizeEntityLabel(t.targetName)}`,
      `target::${t.targetName}`
    );
  }

  // A Vehicle/Location target stands in for the ordinary vehicle/address
  // entity its sightings would otherwise create (see subjectTargetEntityKey).
  // Mentions are folded into the target below, so every target entity has to
  // exist before any mention, registry field or text row is registered.
  const subjectTargetByKey = new Map<string, string>();
  for (const t of targetRows) {
    const subjectKey = subjectTargetEntityKey(t.targetType, t.targetName);
    if (!subjectKey) continue;
    subjectTargetByKey.set(subjectKey, `target::${t.targetName}`);
    const nameKey = `target::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, {
        shortForm: t.targetName,
        type: t.targetType === "vehicle" ? "vehicle" : "address",
        isTarget: true,
        tgtAlias: t.tgt?.trim() || null,
        targetId: t.targetId,
        surname: t.surname,
        occurrences: [],
      });
    }
  }

  return {
    locationKeyType,
    entityAliasMap,
    preferVehicleShortForm,
    targetRows,
    targetSheetMap,
    sheetTargetIdBySheet,
    tgtAliasToFullName,
    tgtAliasCandidates,
    associateAliasToKey,
    registeredNamesByAlias,
    noteRegisteredName,
    entityMap,
    personTargetByKey,
    subjectTargetByKey,
  };
}

export type RegistryState = Awaited<ReturnType<typeof loadRegistry>>;
