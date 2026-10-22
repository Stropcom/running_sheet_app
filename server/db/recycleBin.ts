import {
  composeRegistryVehicle,
  describeVehicleInText,
  driverIsTarget,
  driverVehiclesInText,
} from "../vehicleAutoAdd";

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

import {
  operations,
  rowAttachments,
  runningSheets,
  sheetRows,
  targets,
  associates,
  customMapMarkers,
  smeacBriefings,
  ucoGuideBriefings,
  scanFindingDismissals,
} from "../../drizzle/schema";

import { getDb } from "./core";
import { deleteOperation, deleteRunningSheet } from "./operations";
import { deleteTarget, updateTarget } from "./targets";
import { deleteSmeacBriefing, deleteUcoGuideBriefing } from "./court";
import { deleteRowAttachment } from "./attachments";
import { targetVehicleRegos } from "./crossOperation";
import { invalidateIntelligenceCache } from "./reports";

// ─── Recycle Bin ─────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type RecycleBinItem = {
  id: number;
  type:
    | "operation"
    | "sheet"
    | "target"
    | "map_marker"
    | "attachment"
    | "smeac_briefing"
    | "uco_guide";
  label: string;
  sublabel?: string;
  deletedAt: number;
  deletedByCIN: string | null;
  expiresAt: number;
  // For reinstate context
  operationId?: number | null;
  operationName?: string | null;
};

export async function getRecycleBinItems(): Promise<RecycleBinItem[]> {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_MS;
  const items: RecycleBinItem[] = [];

  // Deleted operations (not yet permanently purged)
  const deletedOps = await db
    .select()
    .from(operations)
    .where(
      and(
        isNotNull(operations.deletedAt),
        sql`${operations.deletedAt} > ${cutoff}`
      )
    );
  for (const op of deletedOps) {
    items.push({
      id: op.id,
      type: "operation",
      label: op.name,
      sublabel: op.investigationUnit ?? undefined,
      deletedAt: op.deletedAt!,
      deletedByCIN: op.deletedByCIN ?? null,
      expiresAt: op.deletedAt! + SEVEN_DAYS_MS,
    });
  }

  // Deleted running sheets
  const deletedSheets = await db
    .select({
      id: runningSheets.id,
      title: runningSheets.title,
      operationId: runningSheets.operationId,
      operationName: operations.name,
      deletedAt: runningSheets.deletedAt,
      deletedByCIN: runningSheets.deletedByCIN,
    })
    .from(runningSheets)
    .leftJoin(operations, eq(runningSheets.operationId, operations.id))
    .where(
      and(
        isNotNull(runningSheets.deletedAt),
        sql`${runningSheets.deletedAt} > ${cutoff}`
      )
    );
  for (const s of deletedSheets) {
    items.push({
      id: s.id,
      type: "sheet",
      label: s.title,
      sublabel: s.operationName ?? undefined,
      deletedAt: s.deletedAt!,
      deletedByCIN: s.deletedByCIN ?? null,
      expiresAt: s.deletedAt! + SEVEN_DAYS_MS,
      operationId: s.operationId,
      operationName: s.operationName,
    });
  }

  // Deleted targets
  const deletedTargets = await db
    .select()
    .from(targets)
    .where(
      and(isNotNull(targets.deletedAt), sql`${targets.deletedAt} > ${cutoff}`)
    );
  for (const t of deletedTargets) {
    items.push({
      id: t.id,
      type: "target",
      label: t.name,
      sublabel: t.tgt ? `TGT: ${t.tgt}` : undefined,
      deletedAt: t.deletedAt!,
      deletedByCIN: t.deletedByCIN ?? null,
      expiresAt: t.deletedAt! + SEVEN_DAYS_MS,
    });
  }

  // Deleted SMEAC briefings
  const deletedSmeac = await db
    .select({
      id: smeacBriefings.id,
      situation: smeacBriefings.situation,
      operationId: smeacBriefings.operationId,
      operationName: operations.name,
      deletedAt: smeacBriefings.deletedAt,
      deletedByCIN: smeacBriefings.deletedByCIN,
    })
    .from(smeacBriefings)
    .leftJoin(operations, eq(smeacBriefings.operationId, operations.id))
    .where(
      and(
        isNotNull(smeacBriefings.deletedAt),
        sql`${smeacBriefings.deletedAt} > ${cutoff}`
      )
    );
  for (const b of deletedSmeac) {
    items.push({
      id: b.id,
      type: "smeac_briefing",
      label: `SMEAC — ${b.operationName ?? `Operation #${b.operationId}`}`,
      sublabel: b.situation?.trim() || undefined,
      deletedAt: b.deletedAt!,
      deletedByCIN: b.deletedByCIN ?? null,
      expiresAt: b.deletedAt! + SEVEN_DAYS_MS,
      operationId: b.operationId,
      operationName: b.operationName,
    });
  }

  // Deleted UCO Surveillance Deployment Guides
  const deletedUcoGuides = await db
    .select({
      id: ucoGuideBriefings.id,
      opObjective: ucoGuideBriefings.opObjective,
      operationId: ucoGuideBriefings.operationId,
      operationName: operations.name,
      deletedAt: ucoGuideBriefings.deletedAt,
      deletedByCIN: ucoGuideBriefings.deletedByCIN,
    })
    .from(ucoGuideBriefings)
    .leftJoin(operations, eq(ucoGuideBriefings.operationId, operations.id))
    .where(
      and(
        isNotNull(ucoGuideBriefings.deletedAt),
        sql`${ucoGuideBriefings.deletedAt} > ${cutoff}`
      )
    );
  for (const g of deletedUcoGuides) {
    items.push({
      id: g.id,
      type: "uco_guide",
      label: `UCO Guide — ${g.operationName ?? `Operation #${g.operationId}`}`,
      sublabel: g.opObjective?.trim() || undefined,
      deletedAt: g.deletedAt!,
      deletedByCIN: g.deletedByCIN ?? null,
      expiresAt: g.deletedAt! + SEVEN_DAYS_MS,
      operationId: g.operationId,
      operationName: g.operationName,
    });
  }

  // Deleted custom map markers
  const deletedMarkers = await db
    .select()
    .from(customMapMarkers)
    .where(
      and(
        isNotNull(customMapMarkers.deletedAt),
        sql`${customMapMarkers.deletedAt} > ${cutoff}`
      )
    );
  for (const m of deletedMarkers) {
    items.push({
      id: m.id,
      type: "map_marker",
      label: m.label ?? `Marker at ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`,
      sublabel: m.address ?? undefined,
      deletedAt: m.deletedAt!,
      deletedByCIN: m.deletedByCIN ?? null,
      expiresAt: m.deletedAt! + SEVEN_DAYS_MS,
    });
  }

  // Deleted photo attachments — left-joined through sheetRows/runningSheets
  // (present only for row-captured photos) and directly through
  // rowAttachments.operationId (always set, row-captured or manually
  // uploaded) for the operation name, so a manually-uploaded photo with no
  // rowId still surfaces here instead of silently vanishing from the list.
  const deletedAttachments = await db
    .select({
      id: rowAttachments.id,
      deletedAt: rowAttachments.deletedAt,
      deletedByCIN: rowAttachments.deletedByCIN,
      sheetTitle: runningSheets.title,
      rowTime: sheetRows.time,
      operationId: rowAttachments.operationId,
      operationName: operations.name,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .leftJoin(operations, eq(rowAttachments.operationId, operations.id))
    .where(
      and(
        isNotNull(rowAttachments.deletedAt),
        sql`${rowAttachments.deletedAt} > ${cutoff}`
      )
    );
  for (const a of deletedAttachments) {
    items.push({
      id: a.id,
      type: "attachment",
      label: a.sheetTitle ? `Photo — ${a.sheetTitle}` : "Photo — manual upload",
      sublabel: a.rowTime
        ? `${a.operationName ?? ""} · ${a.rowTime}`
        : (a.operationName ?? undefined),
      deletedAt: a.deletedAt!,
      deletedByCIN: a.deletedByCIN ?? null,
      expiresAt: a.deletedAt! + SEVEN_DAYS_MS,
      operationId: a.operationId,
      operationName: a.operationName,
    });
  }

  // Sort newest deleted first
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function reinstateOperation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(operations)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(operations.id, id));
}

export async function reinstateSheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(runningSheets)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(runningSheets.id, id));
}

export async function reinstateTarget(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(targets)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(targets.id, id));
}

export async function purgeExpiredRecycleBinItems() {
  const db = await getDb();
  if (!db) return;
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  // Permanently delete expired operations (cascade sheets first)
  const expiredOps = await db
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        isNotNull(operations.deletedAt),
        sql`${operations.deletedAt} <= ${cutoff}`
      )
    );
  for (const op of expiredOps) {
    await deleteOperation(op.id);
  }
  // Permanently delete expired sheets
  const expiredSheets = await db
    .select({ id: runningSheets.id })
    .from(runningSheets)
    .where(
      and(
        isNotNull(runningSheets.deletedAt),
        sql`${runningSheets.deletedAt} <= ${cutoff}`
      )
    );
  for (const s of expiredSheets) {
    await deleteRunningSheet(s.id);
  }
  // Permanently delete expired targets
  const expiredTargets = await db
    .select({ id: targets.id })
    .from(targets)
    .where(
      and(isNotNull(targets.deletedAt), sql`${targets.deletedAt} <= ${cutoff}`)
    );
  for (const t of expiredTargets) {
    await deleteTarget(t.id);
  }
  // Permanently delete expired SMEAC briefings
  const expiredSmeac = await db
    .select({ id: smeacBriefings.id })
    .from(smeacBriefings)
    .where(
      and(
        isNotNull(smeacBriefings.deletedAt),
        sql`${smeacBriefings.deletedAt} <= ${cutoff}`
      )
    );
  for (const b of expiredSmeac) {
    await deleteSmeacBriefing(b.id);
  }
  // Permanently delete expired UCO Surveillance Deployment Guides
  const expiredUcoGuides = await db
    .select({ id: ucoGuideBriefings.id })
    .from(ucoGuideBriefings)
    .where(
      and(
        isNotNull(ucoGuideBriefings.deletedAt),
        sql`${ucoGuideBriefings.deletedAt} <= ${cutoff}`
      )
    );
  for (const g of expiredUcoGuides) {
    await deleteUcoGuideBriefing(g.id);
  }
  // Permanently delete expired photo attachments
  const expiredAttachments = await db
    .select({ id: rowAttachments.id })
    .from(rowAttachments)
    .where(
      and(
        isNotNull(rowAttachments.deletedAt),
        sql`${rowAttachments.deletedAt} <= ${cutoff}`
      )
    );
  for (const a of expiredAttachments) {
    await deleteRowAttachment(a.id);
  }
}

/**
 * Photos left behind by operations/sheets deleted before deleteOperation/
 * deleteRunningSheet/softDeleteOperation/softDeleteSheet cascaded to
 * attachments (a gap that existed until this was added) — still
 * `deletedAt IS NULL` (so still "live" everywhere: Intelligence photo
 * lookups, EntityPhotosSection, etc.) even though their owning operation is
 * gone. Every attachment always has an operationId, so an attachment is
 * orphaned exactly when that operation no longer exists or is itself
 * soft-deleted.
 */
export async function getOrphanedAttachments() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: rowAttachments.id,
      key: rowAttachments.key,
      mimeType: rowAttachments.mimeType,
      isManualUpload: rowAttachments.isManualUpload,
      createdAt: rowAttachments.createdAt,
      operationId: rowAttachments.operationId,
      operationName: operations.name,
      operationDeletedAt: operations.deletedAt,
    })
    .from(rowAttachments)
    .leftJoin(operations, eq(rowAttachments.operationId, operations.id))
    .where(
      and(
        isNull(rowAttachments.deletedAt),
        or(isNull(operations.id), isNotNull(operations.deletedAt))
      )
    );
}

/** Permanently purges every currently-orphaned attachment (see
 * getOrphanedAttachments) — bypasses the normal 7-day Recycle Bin grace
 * period, since these were already deleted (their operation is gone) and
 * simply never got cleaned up. Admin-only, see adminUtils.purgeOrphanedAttachments. */
export async function purgeOrphanedAttachments(): Promise<number> {
  const orphans = await getOrphanedAttachments();
  for (const a of orphans) {
    await deleteRowAttachment(a.id);
  }
  return orphans.length;
}

export interface ObservationTextForScan {
  rowId: number;
  sheetId: number;
  sheetTitle: string;
  operationName: string;
  observation: string;
}

/** Raw observation text for Step 2 of the Local AI Roadmap's
 * missed-entity scan (see missedEntityScan.ts) — deliberately separate
 * from getAllIntelligenceEntities, which returns already-*mined* entities,
 * not the source text a second pass needs to re-scan for what the
 * rule-based extractor may have missed entirely. Live operations only
 * (isNull(deletedAt) on both tables) — same convention as every other
 * live query in this file. */
export async function getObservationTextForEntityScan(): Promise<
  ObservationTextForScan[]
> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      rowId: sheetRows.id,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      operationName: operations.name,
      observation: sheetRows.observation,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .innerJoin(operations, eq(runningSheets.operationId, operations.id))
    .where(
      and(
        isNull(runningSheets.deletedAt),
        isNull(operations.deletedAt),
        isNotNull(sheetRows.observation)
      )
    );

  return rows.filter(
    (r): r is ObservationTextForScan =>
      !!r.observation && r.observation.trim().length > 0
  );
}

export interface ObservationTextForSheet {
  rowId: number;
  timeMinutes: number | null;
  observation: string;
}

/** Same idea as getObservationTextForEntityScan above, scoped to one sheet
 * — backs sheetCheck.ts's "Check Running Sheet" spelling pass, which an
 * author runs on demand against their own sheet rather than the whole
 * folder. No deletedAt filtering needed here (unlike the whole-folder
 * version): a sheet the caller can already fetch rows for is live by
 * construction. */
export async function getObservationTextForSheet(
  sheetId: number
): Promise<ObservationTextForSheet[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      rowId: sheetRows.id,
      timeMinutes: sheetRows.timeMinutes,
      observation: sheetRows.observation,
    })
    .from(sheetRows)
    .where(eq(sheetRows.sheetId, sheetId));

  return rows.filter(
    (r): r is ObservationTextForSheet =>
      !!r.observation && r.observation.trim().length > 0
  );
}

/**
 * A registered target seen DRIVING a vehicle that isn't on his registry is
 * filed there automatically, as his next vehicle (V1 when he has none), filled
 * in with whatever the row says about it — colour, make, model, body type.
 * Runs after a row is saved (`createSheetRow` / `updateSheetRow`); never
 * throws, because a failure here must not lose the officer's row. The rules
 * (driver only, the sheet's own target, capitals surname, nothing guessed) are
 * in server/vehicleAutoAdd.ts. On an edit only a driver that the old text did
 * not already name is considered, so a vehicle an officer removed from the
 * registry doesn't come back every time the row is touched again.
 */
export async function autoRegisterDriverVehicles(
  sheetId: number,
  text: string,
  previousText = ""
): Promise<void> {
  try {
    const drivers = driverVehiclesInText(text);
    if (drivers.length === 0) return;
    const seenBefore = new Set(
      driverVehiclesInText(previousText).map(d => `${d.rego}|${d.driverName}`)
    );
    const fresh = drivers.filter(
      d => !seenBefore.has(`${d.rego}|${d.driverName}`)
    );
    if (fresh.length === 0) return;

    const db = await getDb();
    if (!db) return;
    const [sheet] = await db
      .select({ targetId: runningSheets.targetId })
      .from(runningSheets)
      .where(eq(runningSheets.id, sheetId))
      .limit(1);
    if (!sheet?.targetId) return;
    const [target] = await db
      .select()
      .from(targets)
      .where(and(eq(targets.id, sheet.targetId), isNull(targets.deletedAt)))
      .limit(1);
    if (!target || target.targetType !== "person") return;

    const others = (
      await db
        .select({ name: associates.name })
        .from(associates)
        .where(eq(associates.targetId, target.id))
    ).map(a => a.name);

    const known = targetVehicleRegos(target);
    let extras: unknown[] = [];
    try {
      extras = JSON.parse(target.extraVehicles ?? "[]");
    } catch {
      extras = [];
    }
    let v1Empty = !(
      (target.v1f ?? "").trim() ||
      (target.v1 ?? "").trim() ||
      (target.vehRegistration ?? "").trim()
    );
    let sheetRows_: ObservationTextForSheet[] | null = null;
    const patch: Record<string, string | null> = {};
    let extrasChanged = false;

    for (const d of fresh) {
      if (known.has(d.rego)) continue;
      if (!driverIsTarget(d.driverName, target, others)) continue;
      // What the row says about the vehicle; failing that, the sheet's other
      // rows (a vehicle is often described once and named bare afterwards).
      let seen = describeVehicleInText(text, d.rego);
      if (!seen) {
        sheetRows_ ??= await getObservationTextForSheet(sheetId);
        for (const r of sheetRows_) {
          seen = describeVehicleInText(r.observation, d.rego);
          if (seen) break;
        }
      }
      const entry = composeRegistryVehicle(
        d.rego,
        seen,
        `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      );
      known.add(d.rego);
      if (v1Empty && extras.length === 0) {
        v1Empty = false;
        patch.v1f = entry.full;
        patch.v1 = entry.short;
        patch.vehRegistration = entry.registration;
        patch.vehState = entry.state;
        patch.vehColour = entry.colour || null;
        patch.vehMake = entry.make || null;
        patch.vehModel = entry.model || null;
        patch.vehType = entry.vehicleType || null;
      } else {
        extras.push(entry);
        extrasChanged = true;
      }
    }
    if (extrasChanged) patch.extraVehicles = JSON.stringify(extras);
    if (Object.keys(patch).length === 0) return;
    await updateTarget(target.id, patch as Parameters<typeof updateTarget>[1]);
    invalidateIntelligenceCache();
  } catch (err) {
    console.error("[autoRegisterDriverVehicles]", err);
  }
}

/** The assigned target's registry surname for a sheet, if any — backs
 * sheetCheck.ts's bare-person-typo check. The TGT themselves is never
 * expected to appear in a "(BRACKET)" the way an associate/vehicle/
 * address mined from prose would — their identity already comes from the
 * target card, not the bracket convention — so a typo of their name can
 * only ever be caught by comparing directly against this registry field,
 * never against other bracket-mined entities. Returns null when the sheet
 * has no assigned target, or the target has no surname recorded (legacy/
 * free-text-only target cards). */
export async function getSheetTargetSurname(
  sheetId: number
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const [sheet] = await db
    .select({ targetId: runningSheets.targetId })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet?.targetId) return null;

  const [target] = await db
    .select({ surname: targets.surname })
    .from(targets)
    .where(eq(targets.id, sheet.targetId))
    .limit(1);
  return target?.surname?.trim() || null;
}

/** Normalises a finding's display name into the same identity key used to
 * both dedupe it within one scan run and record/check its dismissal —
 * trim + uppercase, same as fuzzyMatch.ts's own normalisation, so "Jhon
 * Smith" dismissed once doesn't reappear re-cased on the next run. */
export function scanFindingKey(shortForm: string): string {
  return shortForm.trim().toUpperCase();
}

/** Every (ruleId, findingKey) an admin has dismissed — checked by
 * runEntityScan/runMissedEntityScan before returning findings, so a
 * dismissed one doesn't keep reappearing on every future scan. */
export async function getDismissedFindingKeys(): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({
      ruleId: scanFindingDismissals.ruleId,
      findingKey: scanFindingDismissals.findingKey,
    })
    .from(scanFindingDismissals);
  return new Set(rows.map(r => `${r.ruleId}::${r.findingKey}`));
}

/** Idempotent — dismissing an already-dismissed finding just refreshes who/
 * when rather than erroring on the unique (ruleId, findingKey) index. */
export async function dismissScanFinding(
  ruleId: string,
  shortForm: string,
  dismissedByCIN: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const findingKey = scanFindingKey(shortForm);
  await db
    .insert(scanFindingDismissals)
    .values({ ruleId, findingKey, dismissedByCIN })
    .onDuplicateKeyUpdate({
      set: { dismissedByCIN, dismissedAt: new Date() },
    });
}
