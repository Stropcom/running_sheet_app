import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { initialShortcutOrder } from "../../shared/rsChips";

import { normaliseTargetBackground } from "@shared/targetBackground";

import {
  applyTargetProjectsToSummary,
  sanitizeTargetSpecialProjects,
} from "@shared/targetStatus";

import {
  bracketCodeFromRegisteredName,
  nameWithoutBornClause,
} from "@shared/addressFormat";

import {
  knownAddressMatches,
  knownPlaceMatches,
  parseKnownAddress,
} from "@shared/knownAddress";

import {
  operations,
  attachmentEntityLinks,
  runningSheets,
  shortcuts,
  InsertShortcut,
  targets,
  InsertTarget,
  targetFieldHistory,
  InsertTargetFieldHistory,
  targetDocumentImports,
  associates,
  InsertAssociate,
  sheetSummaries,
  SheetSummaryEntry,
  targetShortcuts,
  InsertTargetShortcut,
  operationTargetLinks,
  personNameMatchDecisions,
} from "../../drizzle/schema";

import {
  findPossibleDuplicates,
  comparePersonNames,
  type DedupType,
  type DedupCandidateEntity,
} from "../entityDedup";

import { getDb } from "./core";
import {
  getAllIntelligenceEntities,
  invalidateIntelligenceCache,
} from "./reports";
import { normalizeEntityLabel } from "./attachments";
import { computeEntityKey } from "./intelligence";
import {
  SheetSummaryVehicle,
  computeSheetSummaryVehicles,
  getSheetSummary,
  getSheetSummaryEntries,
} from "./governance";
import { getRowsBySheetId, getRunningSheetById } from "./operations";

// ─── Targets ─────────────────────────────────────────────────────────────────

export async function getTargetsByOperation(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get targets by legacy operationId FK AND by operation_target_links (registry-linked)
  // Exclude soft-deleted targets in both paths
  const byFk = await db
    .select()
    .from(targets)
    .where(
      and(eq(targets.operationId, operationId), isNull(targets.deletedAt))
    );
  const linked = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      dep: targets.dep,
      arr: targets.arr,
      extraVehicles: targets.extraVehicles,
      extraAddresses: targets.extraAddresses,
      wildFields: targets.wildFields,
      firstNames: targets.firstNames,
      surname: targets.surname,
      bornDate: targets.bornDate,
      addrUnitNo: targets.addrUnitNo,
      addrHouseNo: targets.addrHouseNo,
      addrStreetName: targets.addrStreetName,
      addrStreetType: targets.addrStreetType,
      addrSuburb: targets.addrSuburb,
      addrState: targets.addrState,
      addrBusinessName: targets.addrBusinessName,
      vehRegistration: targets.vehRegistration,
      vehState: targets.vehState,
      vehColour: targets.vehColour,
      vehMake: targets.vehMake,
      vehModel: targets.vehModel,
      vehType: targets.vehType,
      operationId: targets.operationId,
      createdBy: targets.createdBy,
      createdAt: targets.createdAt,
      updatedAt: targets.updatedAt,
    })
    .from(operationTargetLinks)
    .innerJoin(targets, eq(operationTargetLinks.targetId, targets.id))
    .where(
      and(
        eq(operationTargetLinks.operationId, operationId),
        isNull(targets.deletedAt)
      )
    );
  // Merge, deduplicate by id
  const seen = new Set<number>();
  const all = [];
  for (const t of [...byFk, ...linked]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      all.push(t);
    }
  }
  return all;
}

/** Return all targets across all operations, joined with operation name */
export async function getAllTargets() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: targets.id,
      name: targets.name,
      tgt: targets.tgt,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId, operations.id))
    .where(isNull(targets.deletedAt))
    .orderBy(targets.name);

  // targets.operationId is a nullable legacy column — a registry target's
  // real operations live in operation_target_links. Without this the
  // cross-operation target picker showed no "Op:" label for registry
  // targets and couldn't find them by operation name in its search.
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id));

  const namesByTarget = new Map<number, Set<string>>();
  for (const l of links) {
    if (!l.operationName) continue;
    if (!namesByTarget.has(l.targetId))
      namesByTarget.set(l.targetId, new Set());
    namesByTarget.get(l.targetId)!.add(l.operationName);
  }

  return rows.map(r => {
    const names = new Set(namesByTarget.get(r.id) ?? []);
    // The legacy FK still counts as a link where it's set.
    if (r.operationName) names.add(r.operationName);
    return {
      ...r,
      operationName: names.size ? Array.from(names).join(", ") : null,
    };
  });
}

export async function createTarget(data: InsertTarget) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targets).values(data);
  return { id: (result as any).insertId as number };
}

// ─── Person Identity Links (Target ↔ Associate) ────────────────────────────
// An officer creating a new Target or Associate can confirm that a
// possible-duplicate match really is the same real person as an existing
// Associate/Target elsewhere in the registry. Neither record is converted
// or deleted — both keep existing under their own role — but their shared
// identity fields below are copied in at creation, then kept in sync on
// every later edit to either side (see updateTarget/updateAssociate).
// Linking and syncing both run inside a single DB transaction: if either
// side's write fails, the whole operation rolls back rather than leaving
// the two records out of sync with each other.
const LINKED_SYNC_FIELDS = [
  "firstNames",
  "surname",
  "bornDate",
  "name",
  "tgt",
  "addrUnitNo",
  "addrHouseNo",
  "addrStreetName",
  "addrStreetType",
  "addrSuburb",
  "addrState",
  "addrBusinessName",
  "hbf",
  "hb",
  "vehRegistration",
  "vehState",
  "vehColour",
  "vehMake",
  "vehModel",
  "vehType",
  "v1f",
  "v1",
  "extraAddresses",
  "extraVehicles",
] as const;

type LinkedSyncField = (typeof LINKED_SYNC_FIELDS)[number];

type LinkedSyncData = Partial<Record<LinkedSyncField, string | null>>;

/** Narrows an update payload down to just the fields two linked records
 * share, so a target-only field (dep/arr/wildFields) or associate-only
 * field never gets written to the other side. */
function pickLinkedSyncFields(data: Record<string, unknown>): LinkedSyncData {
  const out: LinkedSyncData = {};
  for (const f of LINKED_SYNC_FIELDS) {
    if (f in data) out[f] = data[f as keyof typeof data] as string | null;
  }
  return out;
}

export async function updateTarget(
  id: number,
  data: Partial<
    Pick<
      InsertTarget,
      | "name"
      | "tgt"
      | "hbf"
      | "hb"
      | "v1f"
      | "v1"
      | "v2f"
      | "v2"
      | "dep"
      | "arr"
      | "extraVehicles"
      | "wildFields"
      | "firstNames"
      | "surname"
      | "bornDate"
      | "addrUnitNo"
      | "addrHouseNo"
      | "addrStreetName"
      | "addrStreetType"
      | "addrSuburb"
      | "addrState"
      | "addrBusinessName"
      | "vehRegistration"
      | "vehState"
      | "vehColour"
      | "vehMake"
      | "vehModel"
      | "vehType"
      | "extraAddresses"
      | "mdlStatus"
      | "bailStatus"
      | "bailConditions"
      | "bailConditionsText"
      | "specialProjects"
    >
  >,
  /** Set when the officer has explicitly chosen "Add new" over "Edit
   * current" for a given HB/V1/extra-address/extra-vehicle field — see
   * TargetRegistry.tsx. Archives the current value into target_field_history
   * (the same "Previous" record the duplicate-target merge flow already
   * writes) before the new value applies, so a genuine change is preserved
   * while a plain typo-fix isn't. Extra addresses/vehicles are matched by
   * their stable `id` (see ExtraAddress/ExtraVehicle in
   * TargetStructuredFields.tsx), not array position, since entries can be
   * added/removed/reordered around them. */
  options?: {
    isNewAddress?: boolean;
    isNewVehicle?: boolean;
    newExtraAddressIds?: string[];
    newExtraVehicleIds?: string[];
    byCIN?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.transaction(async tx => {
    const hasExtraChanges =
      (options?.newExtraAddressIds?.length ?? 0) > 0 ||
      (options?.newExtraVehicleIds?.length ?? 0) > 0;

    if (options?.isNewAddress || options?.isNewVehicle || hasExtraChanges) {
      const [current] = await tx
        .select()
        .from(targets)
        .where(eq(targets.id, id))
        .limit(1);
      if (current) {
        const now = Date.now();
        const historyRows: InsertTargetFieldHistory[] = [];
        if (
          options?.isNewAddress &&
          current.hbf &&
          current.hbf.trim() &&
          current.hbf.trim() !== (data.hbf ?? "").trim()
        ) {
          historyRows.push({
            targetId: id,
            fieldName: "hbf",
            previousValue: current.hbf,
            supersededAt: now,
            supersededByCIN: options.byCIN ?? null,
          });
        }
        if (
          options?.isNewVehicle &&
          current.v1f &&
          current.v1f.trim() &&
          current.v1f.trim() !== (data.v1f ?? "").trim()
        ) {
          historyRows.push({
            targetId: id,
            fieldName: "v1f",
            previousValue: current.v1f,
            supersededAt: now,
            supersededByCIN: options.byCIN ?? null,
          });
        }

        const parseJsonArray = (
          json: string | null | undefined
        ): Array<{ id?: string; full?: string }> => {
          if (!json) return [];
          try {
            return JSON.parse(json);
          } catch {
            return [];
          }
        };

        if (options?.newExtraAddressIds?.length) {
          const oldEntries = parseJsonArray(current.extraAddresses);
          const newEntries = parseJsonArray(data.extraAddresses);
          for (const entryId of options.newExtraAddressIds) {
            const oldEntry = oldEntries.find(e => e.id === entryId);
            const newEntry = newEntries.find(e => e.id === entryId);
            if (
              oldEntry?.full &&
              oldEntry.full.trim() &&
              oldEntry.full.trim() !== (newEntry?.full ?? "").trim()
            ) {
              historyRows.push({
                targetId: id,
                fieldName: `extraAddress:${entryId}`,
                previousValue: oldEntry.full,
                supersededAt: now,
                supersededByCIN: options.byCIN ?? null,
              });
            }
          }
        }
        if (options?.newExtraVehicleIds?.length) {
          const oldEntries = parseJsonArray(current.extraVehicles);
          const newEntries = parseJsonArray(data.extraVehicles);
          for (const entryId of options.newExtraVehicleIds) {
            const oldEntry = oldEntries.find(e => e.id === entryId);
            const newEntry = newEntries.find(e => e.id === entryId);
            if (
              oldEntry?.full &&
              oldEntry.full.trim() &&
              oldEntry.full.trim() !== (newEntry?.full ?? "").trim()
            ) {
              historyRows.push({
                targetId: id,
                fieldName: `extraVehicle:${entryId}`,
                previousValue: oldEntry.full,
                supersededAt: now,
                supersededByCIN: options.byCIN ?? null,
              });
            }
          }
        }

        if (historyRows.length > 0) {
          await tx.insert(targetFieldHistory).values(historyRows);
        }
      }
    }

    await tx.update(targets).set(data).where(eq(targets.id, id));

    // Propagate shared identity fields to a linked associate, if this target
    // is linked to one — blocking (the whole transaction rolls back) rather
    // than letting the two records drift out of sync.
    const [linkRow] = await tx
      .select({ linkedAssociateId: targets.linkedAssociateId })
      .from(targets)
      .where(eq(targets.id, id))
      .limit(1);
    if (linkRow?.linkedAssociateId) {
      const synced = pickLinkedSyncFields(data);
      if (Object.keys(synced).length > 0) {
        await tx
          .update(associates)
          .set(synced as Partial<InsertAssociate>)
          .where(eq(associates.id, linkRow.linkedAssociateId));
      }
    }

    return { id };
  });

  // TI/LBS/SEEK/CAD changed on the target — open summaries follow it.
  if (data.specialProjects !== undefined) {
    await syncTargetProjectsToOpenSummaries(id);
  }

  return result;
}

/** Saves the freeform Background written in the Target Registry. Plain text
 * only (line breaks kept, nothing else interpreted); an empty value clears it.
 * Returns the stored state so callers can show who/when. */
export async function setTargetBackground(
  id: number,
  background: string,
  byCIN: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const next = normaliseTargetBackground(background);
  const now = Date.now();
  await db
    .update(targets)
    .set({
      registryBackground: next,
      registryBackgroundUpdatedAt: now,
      registryBackgroundUpdatedByCIN: byCIN,
    })
    .where(eq(targets.id, id));
  return {
    registryBackground: next,
    registryBackgroundUpdatedAt: now,
    registryBackgroundUpdatedByCIN: byCIN,
  };
}

export async function getTargetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [result] = await db
    .select()
    .from(targets)
    .where(eq(targets.id, id))
    .limit(1);
  return result;
}

// ─── Target Duplicate Detection & Field-Level Merge ────────────────────────
// Reuses the same deterministic (non-AI) name-similarity heuristic already
// used for Intelligence entity dedup (see entityDedup.ts) — the Target
// Registry has its own separate flow because a target is a structured
// record with several fields, not a single label string, so a match needs
// to resolve field-by-field (see mergeTargetFieldDetails) rather than just
// picking a winner label.

export type TargetFieldName =
  | "name"
  | "tgt"
  | "hbf"
  | "hb"
  | "v1f"
  | "v1"
  | "dep"
  | "arr";

/** Fuzzy-checks a candidate target name against every existing live target's name. Best match first, or null if nothing close enough. */
export async function findPossibleDuplicateTarget(
  name: string,
  excludeId?: number
): Promise<{ id: number; name: string; score: number; reason: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: targets.id, name: targets.name })
    .from(targets)
    .where(isNull(targets.deletedAt));
  const candidates: DedupCandidateEntity[] = rows
    .filter(r => r.id !== excludeId)
    .map(r => ({
      key: String(r.id),
      label: r.name,
      type: "person" as DedupType,
      rowCount: 0,
    }));
  const matches = findPossibleDuplicates(name, "person", "__new__", candidates);
  if (matches.length === 0) return null;
  const best = matches[0];
  return {
    id: Number(best.key),
    name: best.label,
    score: best.score,
    reason: best.reason,
  };
}

export interface PossibleDuplicatePerson {
  type: "target" | "associate";
  id: number;
  name: string;
  score: number;
  reason: string;
}

/** Same fuzzy-match engine as findPossibleDuplicateTarget, but searches
 * BOTH the Target Registry and the Associate Registry as one combined
 * candidate pool — for "does this person already exist anywhere in the
 * registry", not just among other targets. Used by the document-import
 * pipeline: a parsed target name (and every parsed associate name) needs
 * checking against everyone already on file, target or associate, since
 * either could be who the document is actually describing. */
export async function findPossibleDuplicatePerson(
  name: string,
  exclude?: { targetId?: number; associateId?: number }
): Promise<PossibleDuplicatePerson | null> {
  const db = await getDb();
  if (!db) return null;
  const [targetRows, associateRows] = await Promise.all([
    db
      .select({ id: targets.id, name: targets.name })
      .from(targets)
      .where(isNull(targets.deletedAt)),
    db
      .select({ id: associates.id, name: associates.name })
      .from(associates)
      .where(isNull(associates.deletedAt)),
  ]);
  const candidates: DedupCandidateEntity[] = [
    ...targetRows
      .filter(r => r.id !== exclude?.targetId)
      .map(r => ({
        key: `target:${r.id}`,
        label: r.name,
        type: "person" as DedupType,
        rowCount: 0,
      })),
    ...associateRows
      .filter(r => r.id !== exclude?.associateId)
      .map(r => ({
        key: `associate:${r.id}`,
        label: r.name,
        type: "person" as DedupType,
        rowCount: 0,
      })),
  ];
  const matches = findPossibleDuplicates(name, "person", "__new__", candidates);
  if (matches.length === 0) return null;
  const best = matches[0];
  const [type, idStr] = best.key.split(":");
  return {
    type: type as "target" | "associate",
    id: Number(idStr),
    name: best.label,
    score: best.score,
    reason: best.reason,
  };
}

/** All recorded "previous" values for a target, most recently superseded first. */
export async function getTargetFieldHistory(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(targetFieldHistory)
    .where(eq(targetFieldHistory.targetId, targetId))
    .orderBy(desc(targetFieldHistory.supersededAt));
}

/**
 * Applies officer-resolved field choices when a new-target entry turned out
 * to match an existing target. For each resolved field, `value` becomes the
 * target's new live value; if `discarded` is also present (a real new-vs-
 * existing conflict, not just filling in a previously-blank field), that
 * losing value is preserved as history rather than dropped — nothing is
 * ever silently overwritten or lost.
 */
export interface ExtraAddressAppend {
  id: string;
  label: string;
  businessName: string;
  unitNo: string;
  houseNo: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  full: string;
  short: string;
}

export async function mergeTargetFieldDetails(
  targetId: number,
  resolutions: { field: TargetFieldName; value: string; discarded?: string }[],
  appendExtraVehicles: { full: string; short: string }[],
  appendWildFields: { label: string; value: string }[],
  byCIN: string | null,
  appendExtraAddresses: ExtraAddressAppend[] = []
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const current = await getTargetById(targetId);
  if (!current) throw new Error("Target not found");

  const now = Date.now();
  const patch: Partial<InsertTarget> = {};
  const historyRows: InsertTargetFieldHistory[] = [];
  for (const r of resolutions) {
    patch[r.field] = r.value;
    if (
      r.discarded &&
      r.discarded.trim() &&
      r.discarded.trim() !== r.value.trim()
    ) {
      historyRows.push({
        targetId,
        fieldName: r.field,
        previousValue: r.discarded,
        supersededAt: now,
        supersededByCIN: byCIN,
      });
    }
  }

  // Extra vehicles / wild fields are purely additive (dynamic lists, not a
  // single value to conflict over) — append anything not already present.
  if (appendExtraVehicles.length > 0) {
    let existing: { full: string; short: string }[] = [];
    try {
      existing = current.extraVehicles ? JSON.parse(current.extraVehicles) : [];
    } catch {
      existing = [];
    }
    const existingKeys = new Set(
      existing.map(v => `${v.full.trim()}|${v.short.trim()}`.toLowerCase())
    );
    const toAdd = appendExtraVehicles.filter(
      v =>
        (v.full.trim() || v.short.trim()) &&
        !existingKeys.has(`${v.full.trim()}|${v.short.trim()}`.toLowerCase())
    );
    if (toAdd.length > 0)
      patch.extraVehicles = JSON.stringify([...existing, ...toAdd]);
  }
  // Extra addresses are just as additive as extra vehicles above, but keep
  // their full structured parts (not just full/short) — TargetAddressFields
  // needs unitNo/houseNo/streetName/streetType/suburb/state to render an
  // editable form afterward, not a single opaque string.
  if (appendExtraAddresses.length > 0) {
    let existing: ExtraAddressAppend[] = [];
    try {
      existing = current.extraAddresses
        ? JSON.parse(current.extraAddresses)
        : [];
    } catch {
      existing = [];
    }
    const existingKeys = new Set(
      existing.map(a => `${a.full.trim()}|${a.short.trim()}`.toLowerCase())
    );
    const toAdd = appendExtraAddresses.filter(
      a =>
        (a.full.trim() || a.short.trim()) &&
        !existingKeys.has(`${a.full.trim()}|${a.short.trim()}`.toLowerCase())
    );
    if (toAdd.length > 0)
      patch.extraAddresses = JSON.stringify([...existing, ...toAdd]);
  }
  if (appendWildFields.length > 0) {
    let existing: { label: string; value: string }[] = [];
    try {
      existing = current.wildFields ? JSON.parse(current.wildFields) : [];
    } catch {
      existing = [];
    }
    const existingKeys = new Set(
      existing.map(w => `${w.label.trim()}|${w.value.trim()}`.toLowerCase())
    );
    const toAdd = appendWildFields.filter(
      w =>
        w.value.trim() &&
        !existingKeys.has(`${w.label.trim()}|${w.value.trim()}`.toLowerCase())
    );
    if (toAdd.length > 0)
      patch.wildFields = JSON.stringify([...existing, ...toAdd]);
  }

  if (Object.keys(patch).length > 0) {
    await db.update(targets).set(patch).where(eq(targets.id, targetId));
  }
  if (historyRows.length > 0) {
    await db.insert(targetFieldHistory).values(historyRows);
  }
  return getTargetById(targetId);
}

export async function softDeleteTarget(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(targets)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(targets.id, id));
}

export async function deleteTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Clear any running sheets that reference this target before deleting
  await db
    .update(runningSheets)
    .set({ targetId: null })
    .where(eq(runningSheets.targetId, id));
  // Remove all operation links for this target
  await db
    .delete(operationTargetLinks)
    .where(eq(operationTargetLinks.targetId, id));
  // Associates always belong to exactly one target and have no life of
  // their own once it's gone — leaving them behind orphaned real rows
  // that getAllIntelligenceEntities() would otherwise keep surfacing as
  // permanent "INDICES" vehicle/address entities with no way to remove them.
  await db.delete(associates).where(eq(associates.targetId, id));
  // Drop the "tagged to this target" links — the underlying photos stay
  // (they still belong to their own operation), just untagged from a
  // target that no longer exists.
  await db
    .delete(attachmentEntityLinks)
    .where(
      and(
        eq(attachmentEntityLinks.category, "target"),
        eq(attachmentEntityLinks.targetId, id)
      )
    );
  // A real bug found in production: a target's document-import snapshots
  // (the parsed document review history — see targetDocumentImports in
  // schema.ts, AddTargetDialog's documentSnapshotJson) have no life of
  // their own once the target is gone either, same reasoning as
  // associates above — left behind, they permanently orphaned the row
  // (targetId carries no DB-level foreign key to enforce this), which is
  // exactly what let a deleted target's imports keep showing forever in
  // the Operation profile's "Imported Documents" dropdown (fixed
  // separately in listTargetDocumentImportsForOperation's own query, but
  // that only hides an orphan, it doesn't stop one accumulating here).
  await db
    .delete(targetDocumentImports)
    .where(eq(targetDocumentImports.targetId, id));
  await db.delete(targets).where(eq(targets.id, id));
}

// ─── Associates ─────────────────────────────────────────────────────────────
// A person linked to a target as a known associate — structured the same
// way as a target (own name/address/vehicle), always belongs to exactly one
// target. See drizzle/schema.ts for the full field list.

export async function getAssociatesForTarget(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(associates)
    .where(and(eq(associates.targetId, targetId), isNull(associates.deletedAt)))
    .orderBy(associates.name);
}

/** Same as getAssociatesForTarget, plus each row's "Indices" (not yet
 * corroborated by a real running-sheet observation) status — for display in
 * the Target Registry's Associates list. */
export async function getAssociatesForTargetWithIndices(targetId: number) {
  const rows = await getAssociatesForTarget(targetId);
  const allEntities = await getAllIntelligenceEntities();
  const indicesByAssociateId = new Map(
    allEntities
      .filter(e => e.isAssociate && e.associateId != null)
      .map(e => [e.associateId as number, e.isIndicesOnly ?? false])
  );
  return rows.map(a => ({
    ...a,
    isIndicesOnly: indicesByAssociateId.get(a.id) ?? false,
  }));
}

export async function getAssociateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [result] = await db
    .select()
    .from(associates)
    .where(eq(associates.id, id))
    .limit(1);
  return result;
}

export async function createAssociate(data: InsertAssociate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(associates).values(data);
  return { id: (result as any).insertId as number };
}

export async function updateAssociate(
  id: number,
  data: Partial<
    Pick<
      InsertAssociate,
      | "name"
      | "tgt"
      | "firstNames"
      | "surname"
      | "bornDate"
      | "hbf"
      | "hb"
      | "addrUnitNo"
      | "addrHouseNo"
      | "addrStreetName"
      | "addrStreetType"
      | "addrSuburb"
      | "addrState"
      | "addrBusinessName"
      | "v1f"
      | "v1"
      | "vehRegistration"
      | "vehState"
      | "vehColour"
      | "vehMake"
      | "vehModel"
      | "vehType"
      | "extraAddresses"
      | "extraVehicles"
      | "relationship"
    >
  >
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    await tx.update(associates).set(data).where(eq(associates.id, id));

    // Propagate shared identity fields to a linked target, if this
    // associate is linked to one — blocking (the whole transaction rolls
    // back) rather than letting the two records drift out of sync.
    const [linkRow] = await tx
      .select({ linkedTargetId: associates.linkedTargetId })
      .from(associates)
      .where(eq(associates.id, id))
      .limit(1);
    if (linkRow?.linkedTargetId) {
      const synced = pickLinkedSyncFields(data);
      if (Object.keys(synced).length > 0) {
        await tx
          .update(targets)
          .set(synced as Partial<InsertTarget>)
          .where(eq(targets.id, linkRow.linkedTargetId));
      }
    }

    return { id };
  });
}

/**
 * Creates a new Target pre-filled from `data`, linked to an existing
 * Associate record confirmed to be the same real person (see "Person
 * Identity Links" above createTarget). Both records survive independently;
 * only their shared fields (LINKED_SYNC_FIELDS) stay in sync from here on.
 */
export async function createTargetLinkedToAssociate(
  data: Omit<InsertTarget, "operationId"> & { operationId?: number | null },
  existingAssociateId: number
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const [existing] = await tx
      .select({ linkedTargetId: associates.linkedTargetId })
      .from(associates)
      .where(eq(associates.id, existingAssociateId))
      .limit(1);
    if (!existing) throw new Error("Associate not found");
    if (existing.linkedTargetId) {
      throw new Error(
        "This associate is already linked to another target record."
      );
    }
    const [result] = await tx.insert(targets).values({
      ...data,
      operationId: data.operationId ?? null,
      linkedAssociateId: existingAssociateId,
    });
    const newTargetId = (result as any).insertId as number;
    await tx
      .update(associates)
      .set({ linkedTargetId: newTargetId })
      .where(eq(associates.id, existingAssociateId));
    await addReciprocalAssociate(
      tx,
      existingAssociateId,
      newTargetId,
      data.createdBy
    );
    return { id: newTargetId };
  });
}

/**
 * When an associate X (filed under target A) is promoted to its own Target B,
 * A is by definition someone B is associated with, so A is filed as an
 * associate of B too. Runs inside the promotion's transaction.
 *
 * - A's identity fields are copied (LINKED_SYNC_FIELDS) and, when A isn't
 *   already identity-linked to another associate, the new row is linked to A
 *   (A's profile then shares photos and edits with it, like any other
 *   Target ↔ Associate pair). Otherwise it is a plain associate row.
 * - Never duplicates: if B already has an associate row for A — linked to A,
 *   or the same name — live OR soft-deleted, nothing is added (an officer
 *   who removed it keeps it removed).
 * - Skipped when A is gone/deleted or is B itself.
 */
async function addReciprocalAssociate(
  tx: Pick<
    NonNullable<Awaited<ReturnType<typeof getDb>>>,
    "select" | "insert" | "update"
  >,
  promotedAssociateId: number,
  newTargetId: number,
  createdBy: number
): Promise<number | null> {
  const [promoted] = await tx
    .select({ targetId: associates.targetId })
    .from(associates)
    .where(eq(associates.id, promotedAssociateId))
    .limit(1);
  if (!promoted || promoted.targetId === newTargetId) return null;
  const [parent] = await tx
    .select()
    .from(targets)
    .where(and(eq(targets.id, promoted.targetId), isNull(targets.deletedAt)))
    .limit(1);
  if (!parent) return null;

  const existing = await tx
    .select({
      name: associates.name,
      linkedTargetId: associates.linkedTargetId,
    })
    .from(associates)
    .where(eq(associates.targetId, newTargetId));
  const key = normalizeEntityLabel(parent.name);
  if (
    existing.some(
      a =>
        a.linkedTargetId === parent.id || normalizeEntityLabel(a.name) === key
    )
  ) {
    return null;
  }

  const copied: Record<string, unknown> = {};
  for (const f of LINKED_SYNC_FIELDS) {
    copied[f] = (parent as Record<string, unknown>)[f] ?? null;
  }
  const link = parent.linkedAssociateId ? null : parent.id;
  const [result] = await tx.insert(associates).values({
    ...(copied as Partial<InsertAssociate>),
    name: parent.name,
    targetId: newTargetId,
    relationship: "associate",
    linkedTargetId: link,
    createdBy,
  });
  const id = (result as any).insertId as number;
  if (link) {
    await tx
      .update(targets)
      .set({ linkedAssociateId: id })
      .where(eq(targets.id, parent.id));
  }
  return id;
}

/**
 * Creates a new Associate pre-filled from `data`, linked to an existing
 * Target record confirmed to be the same real person. Mirror of
 * createTargetLinkedToAssociate above.
 */
export async function createAssociateLinkedToTarget(
  data: InsertAssociate,
  existingTargetId: number
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const [existing] = await tx
      .select({ linkedAssociateId: targets.linkedAssociateId })
      .from(targets)
      .where(eq(targets.id, existingTargetId))
      .limit(1);
    if (!existing) throw new Error("Target not found");
    if (existing.linkedAssociateId) {
      throw new Error(
        "This target is already linked to another associate record."
      );
    }
    const [result] = await tx.insert(associates).values({
      ...data,
      linkedTargetId: existingTargetId,
    });
    const newAssociateId = (result as any).insertId as number;
    await tx
      .update(targets)
      .set({ linkedAssociateId: newAssociateId })
      .where(eq(targets.id, existingTargetId));
    return { id: newAssociateId };
  });
}

export async function softDeleteAssociate(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(associates)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(associates.id, id));
}

export async function setSheetTarget(sheetId: number, targetId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (targetId !== null) {
    // Verify the target belongs to the same operation as the sheet
    const [sheet] = await db
      .select({ operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(eq(runningSheets.id, sheetId))
      .limit(1);
    if (!sheet) throw new Error("Sheet not found");
    const [target] = await db
      .select({ operationId: targets.operationId })
      .from(targets)
      .where(eq(targets.id, targetId))
      .limit(1);
    if (!target) throw new Error("Target not found");
    // Target Registry: targets are no longer operation-scoped, allow any target on any sheet
  }
  await db
    .update(runningSheets)
    .set({ targetId })
    .where(eq(runningSheets.id, sheetId));
}

// ─── Target Registry ────────────────────────────────────────────────────────

/** Return all targets in the global registry, with their linked operations */
export async function getAllTargetsForRegistry() {
  const db = await getDb();
  if (!db) return [];
  const allTargets = await db
    .select()
    .from(targets)
    .where(isNull(targets.deletedAt))
    .orderBy(targets.name);
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id));

  const linkMap = new Map<
    number,
    Array<{ operationId: number; operationName: string | null }>
  >();
  for (const l of links) {
    if (!linkMap.has(l.targetId)) linkMap.set(l.targetId, []);
    linkMap
      .get(l.targetId)!
      .push({ operationId: l.operationId, operationName: l.operationName });
  }

  const allEntities = await getAllIntelligenceEntities();
  const indicesByTargetId = new Map(
    allEntities
      .filter(e => e.isTarget && e.targetId != null)
      .map(e => [e.targetId as number, e.isIndicesOnly ?? false])
  );

  return allTargets.map(t => ({
    ...t,
    linkedOperations: linkMap.get(t.id) ?? [],
    isIndicesOnly: indicesByTargetId.get(t.id) ?? false,
  }));
}

/** Create a target in the global registry (no operationId required) */
export async function createRegistryTarget(
  data: Omit<InsertTarget, "operationId"> & { operationId?: number | null }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db
    .insert(targets)
    .values({ ...data, operationId: data.operationId ?? null });
  return { id: (result as any).insertId as number };
}

/** Link a target to an operation (idempotent). When the link already exists
 * and a non-empty `background` is supplied — a later document import for a
 * target already linked to this operation — keep the link's background
 * current instead of silently dropping it. This column is only ever "the
 * latest" narrative for the Target profile's background panel; the full
 * version history lives in targetDocumentImports (see
 * recordTargetDocumentImport), which is written alongside this by every
 * import call site. */
export async function linkTargetToOperation(
  targetId: number,
  operationId: number,
  background?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db
    .select({ id: operationTargetLinks.id })
    .from(operationTargetLinks)
    .where(
      and(
        eq(operationTargetLinks.targetId, targetId),
        eq(operationTargetLinks.operationId, operationId)
      )
    )
    .limit(1);
  if (!existing) {
    await db
      .insert(operationTargetLinks)
      .values({ targetId, operationId, background: background || null });
  } else if (background) {
    await db
      .update(operationTargetLinks)
      .set({ background })
      .where(eq(operationTargetLinks.id, existing.id));
    invalidateIntelligenceCache();
  }
}

/** Records one uploaded target-profile document, verbatim as parsed and
 * confirmed by the officer — see targetDocumentImports in schema.ts. Called
 * alongside linkTargetToOperation by every save path that can originate from
 * "Import from Document" (create, createLinkedFromAssociate,
 * mergeFieldDetails) whenever the client actually sent a snapshot. */
export async function recordTargetDocumentImport(data: {
  targetId: number;
  operationId: number;
  uploadedByCIN: string | null;
  snapshotJson: string;
  sourceFileName?: string | null;
  sourceFileUrl?: string | null;
  renderablePdfUrl?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // "Just attach the document" (Parse & extract fields toggled off in
  // ImportTargetDocumentDialog) carries no new reviewed fields — just a
  // copy of the file — so per officer feedback it shouldn't read as a new
  // "Version N" in ImportedDocumentCard's history the way an actual
  // parsed re-import does. Swap it into the most recent existing import
  // for this target+operation instead of appending a row, when one
  // exists — a target's very first import still inserts normally, since
  // there's nothing yet to attach it to.
  let notParsed = false;
  try {
    notParsed = JSON.parse(data.snapshotJson)?.parsed === false;
  } catch {
    notParsed = false;
  }

  if (notParsed) {
    const [latest] = await db
      .select({ id: targetDocumentImports.id })
      .from(targetDocumentImports)
      .where(
        and(
          eq(targetDocumentImports.targetId, data.targetId),
          eq(targetDocumentImports.operationId, data.operationId)
        )
      )
      .orderBy(desc(targetDocumentImports.uploadedAt))
      .limit(1);
    if (latest) {
      await db
        .update(targetDocumentImports)
        .set({
          uploadedByCIN: data.uploadedByCIN,
          uploadedAt: new Date(),
          sourceFileName: data.sourceFileName || null,
          sourceFileUrl: data.sourceFileUrl || null,
          renderablePdfUrl: data.renderablePdfUrl || null,
        })
        .where(eq(targetDocumentImports.id, latest.id));
      return;
    }
  }

  await db.insert(targetDocumentImports).values({
    targetId: data.targetId,
    operationId: data.operationId,
    uploadedByCIN: data.uploadedByCIN,
    snapshotJson: data.snapshotJson,
    sourceFileName: data.sourceFileName || null,
    sourceFileUrl: data.sourceFileUrl || null,
    renderablePdfUrl: data.renderablePdfUrl || null,
  });
}

/** Every document import recorded against an operation, across all its
 * targets, oldest first — backs the Operation profile's "Imported Documents"
 * panel. */
export async function listTargetDocumentImportsForOperation(
  operationId: number
) {
  const db = await getDb();
  if (!db) return [];
  return (
    db
      .select({
        id: targetDocumentImports.id,
        targetId: targetDocumentImports.targetId,
        targetName: targets.name,
        operationId: targetDocumentImports.operationId,
        uploadedByCIN: targetDocumentImports.uploadedByCIN,
        uploadedAt: targetDocumentImports.uploadedAt,
        sourceFileName: targetDocumentImports.sourceFileName,
        sourceFileUrl: targetDocumentImports.sourceFileUrl,
        renderablePdfUrl: targetDocumentImports.renderablePdfUrl,
        snapshotJson: targetDocumentImports.snapshotJson,
      })
      .from(targetDocumentImports)
      // A real bug found in production: deleting a target left its document
      // imports showing forever in the Operation's "Imported Documents"
      // dropdown, since this query never checked whether the target they
      // belonged to had been deleted — unlike every other target-joining
      // query in this file. An INNER join (not the previous leftJoin) plus
      // isNull(targets.deletedAt) below excludes both a soft-deleted
      // target's imports AND a genuinely orphaned import with no target row
      // at all (targetId/operationId carry no DB-level foreign key here,
      // and deleteTarget's hard-purge historically left rows behind — see
      // its own comment) — a leftJoin can't tell those two cases apart from
      // a live one, since a join MISS also comes back with targets.deletedAt
      // as SQL NULL, same as a live target's actual null value.
      .innerJoin(targets, eq(targetDocumentImports.targetId, targets.id))
      .where(
        and(
          eq(targetDocumentImports.operationId, operationId),
          isNull(targets.deletedAt)
        )
      )
      .orderBy(asc(targetDocumentImports.uploadedAt))
  );
}

/** Every document import recorded for one target, oldest first — across all
 * the operations it's linked to when `operationId` is omitted (one query
 * backs the whole Target profile, which lists a background panel per
 * operation, rather than one query per operation), or scoped to just one
 * when given. Backs the Target profile background panel's version history. */
export async function listTargetDocumentImportsForTarget(
  targetId: number,
  operationId?: number
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(targetDocumentImports)
    .where(
      operationId !== undefined
        ? and(
            eq(targetDocumentImports.targetId, targetId),
            eq(targetDocumentImports.operationId, operationId)
          )
        : eq(targetDocumentImports.targetId, targetId)
    )
    .orderBy(asc(targetDocumentImports.uploadedAt));
}

/**
 * Ensure a target is fully linked to both a sheet and its parent operation.
 * Idempotent — safe to call from any entry point.
 *  1. Sets sheet.targetId if not already pointing to this target
 *  2. Creates operationTargetLinks row if missing
 */
export async function ensureTargetFullyLinked(
  targetId: number,
  sheetId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [sheet] = await db
    .select({
      operationId: runningSheets.operationId,
      currentTargetId: runningSheets.targetId,
    })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet) throw new Error("Sheet not found");
  // 1. Link sheet → target
  if (sheet.currentTargetId !== targetId) {
    await db
      .update(runningSheets)
      .set({ targetId })
      .where(eq(runningSheets.id, sheetId));
  }
  // 2. Link target → operation (idempotent)
  await linkTargetToOperation(targetId, sheet.operationId);
}

/** Unlink a target from an operation */
export async function unlinkTargetFromOperation(
  targetId: number,
  operationId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(operationTargetLinks)
    .where(
      and(
        eq(operationTargetLinks.targetId, targetId),
        eq(operationTargetLinks.operationId, operationId)
      )
    );
}

/** Get all operations linked to a target */
export async function getLinkedOperationsForTarget(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(operationTargetLinks)
    .leftJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(eq(operationTargetLinks.targetId, targetId));
}

// ─── Shortcuts ───────────────────────────────────────────────────────────────

export async function listShortcuts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(shortcuts)
    .orderBy(shortcuts.sortOrder, shortcuts.trigger);
}

export async function createShortcut(
  data: Omit<InsertShortcut, "id" | "createdAt" | "updatedAt" | "sortOrder">
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // A new shortcut goes to the end of the list (and so the end of the chips).
  const [last] = await db
    .select({ max: sql<number>`COALESCE(MAX(${shortcuts.sortOrder}), 0)` })
    .from(shortcuts);
  await db
    .insert(shortcuts)
    .values({ ...data, sortOrder: Number(last?.max ?? 0) + 1 });
}

/** Save a new Shortcuts-page order. `ids` is every shortcut, first to last. */
export async function reorderShortcuts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(shortcuts)
        .set({ sortOrder: i + 1 })
        .where(eq(shortcuts.id, ids[i]));
    }
  });
}

/**
 * Give every shortcut that has no place yet a position: the first time round
 * (the column was added with everything at 0) that is the order the chips used
 * to appear on the main running sheet, then the rest A to Z. A shortcut added
 * later by startup (a missing default) goes after the ones already placed.
 */
export async function ensureShortcutOrder() {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({
      id: shortcuts.id,
      trigger: shortcuts.trigger,
      sortOrder: shortcuts.sortOrder,
    })
    .from(shortcuts);
  const unplaced = rows.filter(r => r.sortOrder <= 0);
  if (unplaced.length === 0) return;
  const start = Math.max(0, ...rows.map(r => r.sortOrder));
  await db.transaction(async tx => {
    for (const o of initialShortcutOrder(unplaced)) {
      await tx
        .update(shortcuts)
        .set({ sortOrder: start + o.sortOrder })
        .where(eq(shortcuts.id, o.id));
    }
  });
  console.log(
    `[Shortcuts] Placed ${unplaced.length} shortcut(s) in the chip order`
  );
}

export async function updateShortcut(
  id: number,
  data: { trigger?: string; expansion?: string; showInRs?: boolean }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(shortcuts).set(data).where(eq(shortcuts.id, id));
}

export async function deleteShortcut(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(shortcuts).where(eq(shortcuts.id, id));
}

/** Seed the default shortcuts if the table is empty. Called at server startup. */
export async function seedShortcutsIfEmpty(systemUserId: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: shortcuts.id })
    .from(shortcuts)
    .limit(1);
  if (existing.length > 0) return;
  const defaults = [
    { trigger: "sc", expansion: "Surveillance commenced in the vicinity of" },
    { trigger: "rack", expansion: "Surveillance ceased in the vicinity of" },
    { trigger: "oos", expansion: "Out of sight" },
    { trigger: "coos", expansion: "Continued out of sight" },
    { trigger: "pt", expansion: "PHOTOGRAPH/S TAKEN" },
  ];
  for (const s of defaults) {
    await db
      .insert(shortcuts)
      .values({ ...s, createdBy: systemUserId })
      .catch(() => {
        /* ignore duplicate */
      });
  }
}

/**
 * Ensure specific default shortcuts exist — inserts each if its trigger is not already present.
 * Safe to call on every startup even when the table already has rows.
 */
export async function ensureDefaultShortcuts(systemUserId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Shortcuts] DB unavailable, skipping ensureDefaultShortcuts");
    return;
  }
  const required = [
    { trigger: "sc", expansion: "Surveillance commenced in the vicinity of" },
    { trigger: "rack", expansion: "Surveillance ceased in the vicinity of" },
    { trigger: "oos", expansion: "Out of sight" },
    { trigger: "coos", expansion: "Continued out of sight" },
    { trigger: "pt", expansion: "PHOTOGRAPH/S TAKEN" },
    { trigger: "dso", expansion: "driver and sole occupant" },
    { trigger: "d", expansion: "departed and" },
    { trigger: "ar", expansion: "arrived and" },
  ];
  const existing = await db
    .select({ trigger: shortcuts.trigger })
    .from(shortcuts);
  const existingTriggers = new Set(existing.map(s => s.trigger.toLowerCase()));
  for (const s of required) {
    if (!existingTriggers.has(s.trigger.toLowerCase())) {
      try {
        await db.insert(shortcuts).values({ ...s, createdBy: systemUserId });
        console.log(`[Shortcuts] Inserted default shortcut: ${s.trigger}`);
      } catch (err) {
        console.error(
          `[Shortcuts] Failed to insert shortcut '${s.trigger}':`,
          err
        );
      }
    }
  }
  console.log(
    `[Shortcuts] ensureDefaultShortcuts complete. Existing: [${Array.from(existingTriggers).join(", ")}]`
  );
}

// ─── Person Name Match (Target/Associate Registry spelling correction) ────
// Distinct from the entityAliases merge system above: that links two ordinary
// text-mined entities without touching the observation text. This checks a
// not-yet-saved person mention against the formal Target/Associate Registry
// and, when confirmed, corrects the row's own text to the registered
// spelling before it's saved — see routers.ts row.update's use of this.

export interface PersonTargetMatch {
  targetId?: number;
  associateId?: number;
  name: string;
  tgtAlias: string | null;
  /** The registry's own structured surname field (targets.surname /
   * associates.surname) — the actual bracket code to suggest when there's
   * no tgtAlias, since `name` is the full registered name with no bracket
   * of its own to extract one from (see the real bug this fixed: the
   * client used to fall back to bracketing the WHOLE name, e.g. "(Declan
   * WESTBROOK)", instead of just the surname, "(WESTBROOK)"). Null for a
   * business-name associate, which has no surname to fall back to. */
  surname: string | null;
  score: number;
  reason: string;
}

/** Silent auto-correction lookup: has this exact spelling already been
 * confirmed against a Target/Associate? Used to rewrite the observation text
 * at save time without prompting again — the "remembered" half of the
 * spellcheck-style flow the officer confirms once. */
export async function getKnownPersonNameCorrection(spelling: string): Promise<{
  correctSpelling: string;
  targetId: number | null;
  associateId: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const norm = spelling.trim().toUpperCase();
  if (!norm) return null;
  const rows = await db
    .select()
    .from(personNameMatchDecisions)
    .where(
      and(
        eq(personNameMatchDecisions.decision, "confirmed"),
        eq(personNameMatchDecisions.spelling, norm)
      )
    )
    .limit(1);
  if (!rows.length || !rows[0].correctSpelling) return null;
  return {
    correctSpelling: rows[0].correctSpelling,
    targetId: rows[0].targetId,
    associateId: rows[0].associateId,
  };
}

/** Fuzzy-match a not-yet-saved person mention against the Target/Associate
 * Registry — backs the save-time "is this an existing Target?" prompt.
 * Excludes anything that already exactly matches a registered TGT/associate
 * alias (that already auto-links silently via getAllIntelligenceEntities,
 * nothing to ask) and anything with a prior decision recorded for this exact
 * (spelling, target/associate) pairing, confirmed or rejected. */
export async function checkPossibleTargetMatches(
  label: string
): Promise<PersonTargetMatch[]> {
  const db = await getDb();
  if (!db) return [];
  const labelUpper = label.trim().toUpperCase();
  if (!labelUpper) return [];

  const allEntities = await getAllIntelligenceEntities();
  const registryEntities = allEntities.filter(e => e.isTarget || e.isAssociate);

  // Already an exact alias match — the existing tgtAlias/associate-alias
  // mechanism already folds this into the target/associate silently.
  if (
    registryEntities.some(
      e => e.tgtAlias && e.tgtAlias.trim().toUpperCase() === labelUpper
    )
  ) {
    return [];
  }

  const decisions = await db
    .select()
    .from(personNameMatchDecisions)
    .where(eq(personNameMatchDecisions.spelling, labelUpper));
  const decidedTargetIds = new Set(
    decisions.filter(d => d.targetId != null).map(d => d.targetId)
  );
  const decidedAssociateIds = new Set(
    decisions.filter(d => d.associateId != null).map(d => d.associateId)
  );

  const results: PersonTargetMatch[] = [];
  for (const e of registryEntities) {
    if (e.isTarget && e.targetId != null && decidedTargetIds.has(e.targetId))
      continue;
    if (
      e.isAssociate &&
      e.associateId != null &&
      decidedAssociateIds.has(e.associateId)
    )
      continue;

    const candidateNames = [e.shortForm, e.tgtAlias].filter(
      (v): v is string => !!v && v.trim().length > 0
    );
    let best: { score: number; reason: string } | null = null;
    for (const c of candidateNames) {
      const cmp = comparePersonNames(label, c);
      if (cmp && (!best || cmp.score > best.score)) best = cmp;
    }
    if (!best) continue;

    results.push({
      targetId: e.isTarget ? (e.targetId ?? undefined) : undefined,
      associateId: e.isAssociate ? (e.associateId ?? undefined) : undefined,
      name: e.shortForm,
      tgtAlias: e.tgtAlias ?? null,
      surname: e.surname ?? null,
      score: best.score,
      reason: best.reason,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

async function upsertPersonNameMatchDecision(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  correctSpelling?: string;
  decidedByCIN: string | undefined;
  decision: "confirmed" | "rejected";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const norm = data.spelling.trim().toUpperCase();
  const existing = await db
    .select()
    .from(personNameMatchDecisions)
    .where(
      and(
        eq(personNameMatchDecisions.spelling, norm),
        data.targetId != null
          ? eq(personNameMatchDecisions.targetId, data.targetId)
          : eq(personNameMatchDecisions.associateId, data.associateId!)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(personNameMatchDecisions)
      .set({
        decision: data.decision,
        correctSpelling: data.correctSpelling ?? null,
        decidedByCIN: data.decidedByCIN,
        decidedAt: Date.now(),
      })
      .where(eq(personNameMatchDecisions.id, existing[0].id));
  } else {
    await db.insert(personNameMatchDecisions).values({
      spelling: norm,
      targetId: data.targetId ?? null,
      associateId: data.associateId ?? null,
      decision: data.decision,
      correctSpelling: data.correctSpelling ?? null,
      decidedByCIN: data.decidedByCIN,
      decidedAt: Date.now(),
    });
  }
}

/** Records a confirmed spelling correction against a Target/Associate — this
 * exact spelling auto-corrects silently on every future save from now on. */
export async function confirmPersonNameMatch(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  correctSpelling: string;
  decidedByCIN: string | undefined;
}): Promise<void> {
  await upsertPersonNameMatchDecision({ ...data, decision: "confirmed" });
}

/** Records "not the same person" so this exact (spelling, target/associate)
 * pairing isn't asked about again. */
export async function rejectPersonNameMatch(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  decidedByCIN: string | undefined;
}): Promise<void> {
  await upsertPersonNameMatchDecision({
    spelling: data.spelling,
    targetId: data.targetId,
    associateId: data.associateId,
    decidedByCIN: data.decidedByCIN,
    decision: "rejected",
  });
}

/**
 * Search existing entities of one type by substring — backs the manual Merge
 * Entities picker (excludeTargets: true, the default) and the Target
 * Registry name/vehicle autocomplete (excludeTargets: false — that feature's
 * whole point is suggesting entities already seen in observations, and most
 * of those worth adding as a Target have often already been promoted to one
 * elsewhere, so filtering them out there defeats the feature).
 */
export async function searchIntelligenceEntities(
  type: DedupType,
  query: string,
  excludeTargets = true
): Promise<DedupCandidateEntity[]> {
  const allEntities = await getAllIntelligenceEntities();
  const q = query.trim().toLowerCase();
  return allEntities
    .filter(
      e =>
        (!excludeTargets || !e.isTarget) &&
        e.type === type &&
        (!q || e.shortForm.toLowerCase().includes(q))
    )
    .map(e => ({
      key: computeEntityKey(type, e.shortForm),
      label: e.shortForm,
      type,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
    }))
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 25);
}

export interface PersonMentionSuggestion {
  key: string;
  /** The name portion an officer would write before the bracket, e.g. "Basil CAT". */
  displayName: string;
  /** The bracket code to write it with, e.g. "CAT". */
  bracketCode: string;
  rowCount: number;
  /** Exactly one of these is set — which Registry record this suggestion is,
   * so selecting it can immediately record the same confirmed link
   * checkPossibleTargetMatches' save-time prompt would otherwise still ask
   * for, rather than asking again for a person the officer just picked by
   * name. */
  targetId: number | null;
  associateId: number | null;
}

/**
 * Live "as you type" suggestions for the observation field's inline mention
 * autocomplete — scoped to registered Target/Associate Registry people only
 * (not bare text-mined mentions), since only a registry entry reliably
 * carries a clean "Name, born DATE (BRACKET)" shape to split into a display
 * name and bracket code. A bare text-mined person's bracket code isn't
 * recoverable from the merged entity alone, and registry entries are also
 * exactly the ones worth proactively linking to as an officer types.
 */
export async function searchRegisteredPersonMentions(
  query: string
): Promise<PersonMentionSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const allEntities = await getAllIntelligenceEntities();
  return allEntities
    .filter(
      e =>
        e.type === "person" &&
        (e.isTarget || e.isAssociate) &&
        e.shortForm.toLowerCase().includes(q)
    )
    .map(e => ({
      key: computeEntityKey("person", e.shortForm),
      displayName: nameWithoutBornClause(e.shortForm),
      bracketCode: bracketCodeFromRegisteredName(e.shortForm),
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
      targetId: e.isTarget ? (e.targetId ?? null) : null,
      associateId: e.isAssociate ? (e.associateId ?? null) : null,
    }))
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 8);
}

export interface KnownAddressSuggestion {
  key: string;
  /** Intelligence display form, e.g. "13 Denford Street, KENWICK". */
  label: string;
  businessName: string;
  street: string;
  suburb: string;
  rowCount: number;
}

/**
 * Live "as you type" suggestions for addresses the app already knows —
 * every address/business entity Intelligence has seen (observations plus
 * Target/Associate registry cards) whose street starts with what the officer
 * has typed ("13 Den" → "13 Denford Street, KENWICK"). Deterministic string
 * matching only; the Google fallback for addresses the app doesn't know yet
 * runs in the browser against the map service.
 */
export async function searchKnownAddresses(
  query: string,
  places = false
): Promise<KnownAddressSuggestion[]> {
  const q = query.trim();
  if (q.length < (places ? 2 : 3)) return [];
  const allEntities = await getAllIntelligenceEntities();
  const seen = new Set<string>();
  const out: KnownAddressSuggestion[] = [];
  for (const e of allEntities) {
    if (e.type !== "address" && e.type !== "business") continue;
    if (
      places
        ? !knownPlaceMatches(q, e.shortForm)
        : !knownAddressMatches(q, e.shortForm)
    )
      continue;
    const parts = parseKnownAddress(e.shortForm);
    if (!parts) continue;
    const dedupe = `${parts.street}|${parts.suburb}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      key: computeEntityKey(e.type, e.shortForm),
      label: e.shortForm,
      businessName: parts.businessName,
      street: parts.street,
      suburb: parts.suburb,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
    });
  }
  return out.sort((a, b) => b.rowCount - a.rowCount).slice(0, 6);
}

// ─── Special projects: Target Registry ↔ Sheet Summary sync ────────────────
// TI / LBS / SEEK / CAD live on the target (targets.specialProjects) AND on
// each running sheet's summary (sheet_summaries.specialProjects), and an
// edit to either side is mirrored to the other. Only those four keys sync —
// the summary's Tracker/LD/Coyotes/Other are per-deployment and untouched.
// A COMPLETED summary is a locked record of that day and is never rewritten;
// every open summary for the target follows the registry.

/** Pushes a target's projects onto every open (not completed) summary of a
 * running sheet belonging to that target, optionally skipping one sheet (the
 * one the edit came from). Only writes a summary that actually changes. */
export async function syncTargetProjectsToOpenSummaries(
  targetId: number,
  exceptSheetId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [target] = await db
    .select({ specialProjects: targets.specialProjects })
    .from(targets)
    .where(eq(targets.id, targetId))
    .limit(1);
  if (!target) return;
  const rows = await db
    .select({ summary: sheetSummaries })
    .from(sheetSummaries)
    .innerJoin(runningSheets, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(
      and(
        eq(runningSheets.targetId, targetId),
        isNull(sheetSummaries.completedAt)
      )
    );
  for (const { summary } of rows) {
    if (exceptSheetId !== undefined && summary.sheetId === exceptSheetId)
      continue;
    const next = applyTargetProjectsToSummary(
      summary.specialProjects,
      target.specialProjects
    );
    if ((next ?? null) === (summary.specialProjects ?? null)) continue;
    await db
      .update(sheetSummaries)
      .set({ specialProjects: next })
      .where(eq(sheetSummaries.id, summary.id));
  }
}

/** A summary's Special Projects were edited: copy its TI/LBS/SEEK/CAD to the
 * sheet's target, then let every other open summary of that target follow.
 * No-op for a sheet with no target. */
export async function syncSummaryProjectsToTarget(
  sheetId: number,
  summaryProjectsRaw: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [sheet] = await db
    .select({ targetId: runningSheets.targetId })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet?.targetId) return;
  await db
    .update(targets)
    .set({ specialProjects: sanitizeTargetSpecialProjects(summaryProjectsRaw) })
    .where(eq(targets.id, sheet.targetId));
  await syncTargetProjectsToOpenSummaries(sheet.targetId, sheetId);
}

export interface OperationSummaryRollupRow {
  sheetId: number;
  sheetTitle: string;
  sheetDate: string | null;
  createdAt: Date;
  targetId: number | null;
  targetName: string | null;
  teamLabel: string | null;
  teamCins: string | null;
  startTime: string | null;
  finishTime: string | null;
  location: string | null;
  ioSupport: string | null;
  intelSupport: string | null;
  ioContactTiming: string | null;
  ioContactMethod: string | null;
  objectives: string | null;
  specialProjects: string | null;
  criticalDecisions: string | null;
  issues: string | null;
  completedAt: number | null;
}

/**
 * Every running sheet's Supervisor Summary for an operation (optionally
 * narrowed to one target), newest first — the "Deployment Rollup" view. Only
 * sheets that already have a summary record are included (a sheet nobody has
 * opened the Summary tab on yet has nothing to roll up).
 */
export async function getSheetSummariesForOperation(
  operationId: number,
  targetId?: number | null
): Promise<OperationSummaryRollupRow[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(runningSheets.operationId, operationId),
    isNull(runningSheets.deletedAt),
  ];
  if (targetId) conditions.push(eq(runningSheets.targetId, targetId));

  const rows = await db
    .select({
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
      sheetDate: runningSheets.sheetDate,
      createdAt: runningSheets.createdAt,
      targetId: runningSheets.targetId,
      summary: sheetSummaries,
    })
    .from(runningSheets)
    .innerJoin(sheetSummaries, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(and(...conditions))
    .orderBy(desc(runningSheets.sheetDate), desc(runningSheets.id));

  return rows.map(r => ({
    sheetId: r.sheetId,
    sheetTitle: r.sheetTitle,
    sheetDate: r.sheetDate,
    createdAt: r.createdAt,
    targetId: r.targetId,
    targetName: r.summary.targetName,
    teamLabel: r.summary.teamLabel,
    teamCins: r.summary.teamCins,
    startTime: r.summary.startTime,
    finishTime: r.summary.finishTime,
    location: r.summary.location,
    ioSupport: r.summary.ioSupport,
    intelSupport: r.summary.intelSupport,
    ioContactTiming: r.summary.ioContactTiming,
    ioContactMethod: r.summary.ioContactMethod,
    objectives: r.summary.objectives,
    specialProjects: r.summary.specialProjects,
    criticalDecisions: r.summary.criticalDecisions,
    issues: r.summary.issues,
    completedAt: r.summary.completedAt,
  }));
}

export interface RollupExportRow extends OperationSummaryRollupRow {
  entries: SheetSummaryEntry[];
  vehicles: SheetSummaryVehicle[];
}

/**
 * Same rows as getSheetSummariesForOperation, but with each sheet's
 * summary-entries table and computed vehicle list attached — everything the
 * Deployment Rollup's expanded card view shows, for every sheet at once, so
 * the PDF export doesn't need one round-trip per sheet.
 */
export async function getRollupExportData(
  operationId: number,
  targetId?: number | null
): Promise<RollupExportRow[]> {
  const rows = await getSheetSummariesForOperation(operationId, targetId);
  return Promise.all(
    rows.map(async r => {
      const [entries, sheet, record, allRows] = await Promise.all([
        getSheetSummaryEntries(r.sheetId),
        getRunningSheetById(r.sheetId),
        getSheetSummary(r.sheetId),
        getRowsBySheetId(r.sheetId),
      ]);
      const target = sheet?.targetId
        ? await getTargetById(sheet.targetId)
        : null;
      let dismissed: string[] = [];
      try {
        dismissed = record?.dismissedVehicleKeys
          ? JSON.parse(record.dismissedVehicleKeys)
          : [];
      } catch {
        dismissed = [];
      }
      const vehicles = computeSheetSummaryVehicles(
        target ?? null,
        allRows,
        dismissed
      );
      return { ...r, entries, vehicles };
    })
  );
}

// ─── Target Shortcuts ─────────────────────────────────────────────────────────

export async function getTargetShortcuts(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(targetShortcuts)
    .where(eq(targetShortcuts.targetId, targetId));
}

export async function createTargetShortcut(data: InsertTargetShortcut) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targetShortcuts).values(data);
  return { id: (result as { insertId: number }).insertId };
}

export async function updateTargetShortcut(
  id: number,
  data: Partial<Pick<InsertTargetShortcut, "trigger" | "expansion">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targetShortcuts).set(data).where(eq(targetShortcuts.id, id));
  return { id };
}

export async function deleteTargetShortcut(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(targetShortcuts).where(eq(targetShortcuts.id, id));
}

export async function getTargetShortcutsForSheet(sheetId: number) {
  // Returns target shortcuts for the target assigned to the given sheet
  const db = await getDb();
  if (!db) return [];
  const sheet = await db
    .select({ targetId: runningSheets.targetId })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet[0]?.targetId) return [];
  return db
    .select()
    .from(targetShortcuts)
    .where(eq(targetShortcuts.targetId, sheet[0].targetId));
}
