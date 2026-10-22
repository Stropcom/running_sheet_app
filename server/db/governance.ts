import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { isAttachmentProperlyLinked } from "@shared/attachmentLinking";

import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";

import {
  operations,
  runningSheets,
  governanceRecords,
  GovernanceRecord,
  sheetSummaries,
  SheetSummary,
  InsertSheetSummary,
  sheetSummaryEntries,
  SheetSummaryEntry,
} from "../../drizzle/schema";

import { getDb } from "./core";
import {
  getCertificationsByRowIds,
  getMembersByRowIds,
  getRowsBySheetId,
  getRunningSheetById,
} from "./operations";
import { attachLinkedCounts, getAttachmentsByRowIds } from "./attachments";
import { extractEntitiesFromText } from "./intelligence";
import { getTargetById } from "./targets";

// ─── Governance Records ───────────────────────────────────────────────────────

export async function getGovernanceRecord(
  sheetId: number
): Promise<GovernanceRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(governanceRecords)
    .where(eq(governanceRecords.sheetId, sheetId))
    .limit(1);
  return rows[0] ?? null;
}

export interface ImageryEntry {
  cin: string;
  rowTime: string;
  type: "photo" | "video" | "";
  saved: boolean;
}

export interface GovernanceUpsertInput {
  sheetId: number;
  dueDate?: number | null;
  summaryNotification?: boolean;
  isurvCIN?: string | null;
  isurvName?: string | null;
  sentToIO?: boolean;
  sentToIOCIN?: string | null;
  sentToIOName?: string | null;
  linked?: boolean;
  linkedCIN?: string | null;
  linkedName?: string | null;
  savedInOpFolder?: boolean;
  savedInOpFolderCIN?: string | null;
  savedInOpFolderName?: string | null;
  savedInInvestigatorTransferDrive?: boolean;
  savedInInvestigatorTransferDriveCIN?: string | null;
  savedInInvestigatorTransferDriveName?: string | null;
  imageryTaken?: boolean;
  imageryTakenCIN?: string | null;
  imageryTakenName?: string | null;
  coverPage?: boolean;
  coverPageCIN?: string | null;
  coverPageName?: string | null;
  sheetCell?: string | null;
  imageryEntries?: ImageryEntry[];
  notes?: string | null;
}

export async function upsertGovernanceRecord(
  input: GovernanceUpsertInput
): Promise<GovernanceRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getGovernanceRecord(input.sheetId);
  const imageryJson =
    input.imageryEntries !== undefined
      ? JSON.stringify(input.imageryEntries)
      : undefined;

  if (existing) {
    await db
      .update(governanceRecords)
      .set({
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.summaryNotification !== undefined && {
          isurv: input.summaryNotification,
        }),
        ...(input.isurvCIN !== undefined && { isurvCIN: input.isurvCIN }),
        ...(input.isurvName !== undefined && { isurvName: input.isurvName }),
        ...(input.sentToIO !== undefined && { sentToIO: input.sentToIO }),
        ...(input.sentToIOCIN !== undefined && {
          sentToIOCIN: input.sentToIOCIN,
        }),
        ...(input.sentToIOName !== undefined && {
          sentToIOName: input.sentToIOName,
        }),
        ...(input.linked !== undefined && { linked: input.linked }),
        ...(input.linkedCIN !== undefined && { linkedCIN: input.linkedCIN }),
        ...(input.linkedName !== undefined && { linkedName: input.linkedName }),
        ...(input.savedInOpFolder !== undefined && {
          savedInOpFolder: input.savedInOpFolder,
        }),
        ...(input.savedInOpFolderCIN !== undefined && {
          savedInOpFolderCIN: input.savedInOpFolderCIN,
        }),
        ...(input.savedInOpFolderName !== undefined && {
          savedInOpFolderName: input.savedInOpFolderName,
        }),
        ...(input.savedInInvestigatorTransferDrive !== undefined && {
          savedInInvestigatorTransferDrive:
            input.savedInInvestigatorTransferDrive,
        }),
        ...(input.savedInInvestigatorTransferDriveCIN !== undefined && {
          savedInInvestigatorTransferDriveCIN:
            input.savedInInvestigatorTransferDriveCIN,
        }),
        ...(input.savedInInvestigatorTransferDriveName !== undefined && {
          savedInInvestigatorTransferDriveName:
            input.savedInInvestigatorTransferDriveName,
        }),
        ...(input.imageryTaken !== undefined && {
          imageryTaken: input.imageryTaken,
        }),
        ...(input.imageryTakenCIN !== undefined && {
          imageryTakenCIN: input.imageryTakenCIN,
        }),
        ...(input.imageryTakenName !== undefined && {
          imageryTakenName: input.imageryTakenName,
        }),
        ...(input.coverPage !== undefined && { coverPage: input.coverPage }),
        ...(input.coverPageCIN !== undefined && {
          coverPageCIN: input.coverPageCIN,
        }),
        ...(input.coverPageName !== undefined && {
          coverPageName: input.coverPageName,
        }),
        ...(input.sheetCell !== undefined && { sheetCell: input.sheetCell }),
        ...(imageryJson !== undefined && { imageryEntries: imageryJson }),
        ...(input.notes !== undefined && { notes: input.notes }),
      })
      .where(eq(governanceRecords.sheetId, input.sheetId));
  } else {
    // Default due date: sheet createdAt + 7 days (resolved at call site if not provided)
    await db.insert(governanceRecords).values({
      sheetId: input.sheetId,
      dueDate: input.dueDate ?? null,
      isurv: input.summaryNotification ?? false,
      isurvCIN: input.isurvCIN ?? null,
      isurvName: input.isurvName ?? null,
      sentToIO: input.sentToIO ?? false,
      sentToIOCIN: input.sentToIOCIN ?? null,
      sentToIOName: input.sentToIOName ?? null,
      linked: input.linked ?? false,
      linkedCIN: input.linkedCIN ?? null,
      linkedName: input.linkedName ?? null,
      savedInOpFolder: input.savedInOpFolder ?? false,
      savedInOpFolderCIN: input.savedInOpFolderCIN ?? null,
      savedInOpFolderName: input.savedInOpFolderName ?? null,
      savedInInvestigatorTransferDrive:
        input.savedInInvestigatorTransferDrive ?? false,
      savedInInvestigatorTransferDriveCIN:
        input.savedInInvestigatorTransferDriveCIN ?? null,
      savedInInvestigatorTransferDriveName:
        input.savedInInvestigatorTransferDriveName ?? null,
      imageryTaken: input.imageryTaken ?? false,
      imageryTakenCIN: input.imageryTakenCIN ?? null,
      imageryTakenName: input.imageryTakenName ?? null,
      coverPage: input.coverPage ?? false,
      coverPageCIN: input.coverPageCIN ?? null,
      coverPageName: input.coverPageName ?? null,
      sheetCell: input.sheetCell ?? null,
      imageryEntries: imageryJson ?? null,
      notes: input.notes ?? null,
    });
  }
  return getGovernanceRecord(input.sheetId);
}

// ─── Governance Summary Helpers ───────────────────────────────────────────────

/** Lightweight summary of a governance record for the list view */
export interface GovernanceSummary {
  sheetId: number;
  overallPercent: number;
  isComplete: boolean;
  isOverdue: boolean;
  dueDate: number | null;
}

export interface RowSignOffRow {
  id: number;
}

export interface RowSignOffMember {
  id: number;
  rowId: number;
  memberName: string;
}

export interface RowSignOffCert {
  rowId: number;
  memberId: number;
  isActive: boolean;
}

// Whether ONE row has been signed off: it has at least one real CIN (a
// spacer entry alone doesn't count, and neither does having none at all --
// a row with no CIN attached has nobody who could certify it, so it's
// unsigned, not exempt) and every one of those CINs has its OWN active
// certification. Deliberately per-member, not "does this row have ANY
// cert at all" -- the latter would let one certified CIN on a row cover
// for another, uncertified, one.
export function isRowSignedOff(
  row: RowSignOffRow,
  members: RowSignOffMember[],
  certs: RowSignOffCert[]
): boolean {
  const rowMembers = members.filter(
    m => m.rowId === row.id && m.memberName !== "__SPACE__"
  );
  return (
    rowMembers.length > 0 &&
    rowMembers.every(m =>
      certs.some(c => c.rowId === row.id && c.memberId === m.id && c.isActive)
    )
  );
}

// Whether EVERY row in a sheet is signed off (see isRowSignedOff) -- the
// single definition of "all signed"/"allSigned" used for closing a sheet,
// the Governance page, and every "outstanding"/"incomplete" report.
// Previously reimplemented separately at each call site and drifted: three
// of five copies flattened members across the whole sheet instead of
// checking per row, so a row with no CIN at all contributed nothing to the
// check and was silently treated as fine rather than blocking; one of
// those three also checked certification at the wrong granularity (row
// has any cert vs. this specific member has their own). Returns true for
// an empty `rows` array (vacuous) -- callers that want "no rows" to mean
// something other than signed decide that themselves, since the two real
// callers disagree on purpose (an empty sheet is fine to close, but
// shouldn't display as 100% governance-complete).
export function computeAllRowsSigned(
  rows: RowSignOffRow[],
  members: RowSignOffMember[],
  certs: RowSignOffCert[]
): boolean {
  return rows.every(row => isRowSignedOff(row, members, certs));
}

/**
 * Compute a governance completion % for a sheet.
 * allSigned must be passed in from the caller (it requires row/cert queries).
 */
export function computeGovernancePercent(
  rec: GovernanceRecord | null | undefined,
  allSigned: boolean
): number {
  if (!rec) return 0;

  // ── Team Leader section (2 items) ──────────────────────────────────────────
  // isurv column stores the summaryNotification value
  const tlFields: boolean[] = [
    !!rec.isurv, // Summary complete
    !!rec.sentToIO, // Sent to IO
  ];

  // ── Operative section (4 items, only countable when allSigned) ─────────────
  // If not all signed, these are all blocked — count them as incomplete
  const opFields: boolean[] = [
    allSigned && !!rec.savedInOpFolder,
    allSigned && !!rec.savedInInvestigatorTransferDrive,
  ];

  // ── Imagery section ────────────────────────────────────────────────────────
  // Derive imageryTaken from sheetCins (client-side) — server stores it in imageryEntries JSON
  // If no imagery was taken (no entries with a CIN), exclude imagery from the total
  let imageryFields: boolean[] = [];
  let entries: { cin?: string; saved?: boolean }[] = [];
  try {
    entries = JSON.parse(rec.imageryEntries ?? "[]");
  } catch {
    entries = [];
  }
  // Only count imagery if at least one entry has a real CIN (blank placeholder rows are ignored)
  const realEntries = entries.filter(e => e.cin && e.cin.trim() !== "");
  const hasImagery = realEntries.length > 0;
  if (hasImagery) {
    imageryFields = realEntries.map(e => !!e.saved);
  }
  // If no real imagery entries, imagery section is N/A — not counted

  const allFields = [...tlFields, ...opFields, ...imageryFields];
  if (allFields.length === 0) return 0;
  return Math.round(
    (allFields.filter(Boolean).length / allFields.length) * 100
  );
}

/** Returns all governance records for a list of sheet IDs */
export async function getGovernanceRecordsBySheetIds(
  sheetIds: number[]
): Promise<GovernanceRecord[]> {
  if (sheetIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const { inArray } = await import("drizzle-orm");
  return db
    .select()
    .from(governanceRecords)
    .where(inArray(governanceRecords.sheetId, sheetIds));
}

/**
 * Returns outstanding governance to-do items for a given CIN.
 * - If the CIN is the Team Leader on a sheet: returns TL items (summaryNotification, sentToIO) that are incomplete.
 * - If the CIN is the Author on a sheet: returns Operative items (savedInOpFolder, savedInInvestigatorTransferDrive)
 *   that are incomplete AND the sheet is fully certified.
 * allSigned is computed inline per sheet.
 */
export async function getGovernanceTodoForCin(cin: string): Promise<
  {
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    role: "teamLeader" | "author";
    outstanding: string[];
    allSigned: boolean;
    govPercent?: number;
  }[]
> {
  const db = await getDb();
  if (!db) return [];

  // Find all sheets where this CIN is TL or Author (stored in sheetCins JSON)
  // Exclude soft-deleted sheets so they don't appear in governance to-do
  const allSheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  const relevantSheets = allSheets.filter(s => {
    try {
      const cins: {
        cin: string;
        isTeamLeader?: boolean;
        isAuthor?: boolean;
      }[] = JSON.parse(s.sheetCins ?? "[]");
      return cins.some(c => c.cin === cin && (c.isTeamLeader || c.isAuthor));
    } catch {
      return false;
    }
  });
  if (relevantSheets.length === 0) return [];

  const opIds = Array.from(new Set(relevantSheets.map(s => s.operationId)));

  const [ops, govRecords] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    getGovernanceRecordsBySheetIds(relevantSheets.map(s => s.id)),
  ]);

  // Only process sheets whose operation still exists
  const validOpIds = new Set(ops.map(o => o.id));
  const validSheets = relevantSheets.filter(s => validOpIds.has(s.operationId));
  if (validSheets.length === 0) return [];

  // Compute allSigned per sheet
  const results: Awaited<ReturnType<typeof getGovernanceTodoForCin>> = [];

  for (const sheet of validSheets) {
    const rows = await getRowsBySheetId(sheet.id);
    const rowIds = rows.map(r => r.id);
    const [members, certs] = await Promise.all([
      getMembersByRowIds(rowIds),
      getCertificationsByRowIds(rowIds),
    ]);
    const allSigned =
      rows.length > 0 && computeAllRowsSigned(rows, members, certs);

    const rec = govRecords.find(g => g.sheetId === sheet.id);
    const op = ops.find(o => o.id === sheet.operationId);
    const cinList: {
      cin: string;
      isTeamLeader?: boolean;
      isAuthor?: boolean;
    }[] = (() => {
      try {
        return JSON.parse(sheet.sheetCins ?? "[]");
      } catch {
        return [];
      }
    })();
    const cinEntry = cinList.find(c => c.cin === cin);

    if (cinEntry?.isTeamLeader) {
      const outstanding: string[] = [];
      if (!rec?.isurv) outstanding.push("Summary complete");
      if (!rec?.sentToIO) outstanding.push("Sent to IO");

      // "Ready to close" notification: always shown for open sheets (Team Leader must close)
      const govPercent = computeGovernancePercent(rec ?? null, allSigned);
      if (!sheet.closedAt) {
        outstanding.push("Ready to close");
      }

      if (outstanding.length > 0) {
        results.push({
          sheetId: sheet.id,
          sheetTitle: sheet.title,
          operationId: sheet.operationId,
          operationName: op?.name ?? "Unknown",
          role: "teamLeader",
          outstanding,
          allSigned,
          govPercent,
        });
      }
    }

    if (cinEntry?.isAuthor) {
      // Operative items only actionable once sheet is fully certified
      const outstanding: string[] = [];
      if (allSigned) {
        if (!rec?.savedInOpFolder)
          outstanding.push("Saved in Operation folder");
        if (!rec?.savedInInvestigatorTransferDrive)
          outstanding.push("Saved in Investigator transfer drive");
        // Check imagery entries — any unsaved imagery rows are outstanding for the author
        if (rec?.imageryEntries) {
          try {
            const entries: { saved?: boolean }[] = JSON.parse(
              rec.imageryEntries
            );
            const unsavedCount = entries.filter(e => !e.saved).length;
            if (unsavedCount > 0) {
              outstanding.push(
                `${unsavedCount} imagery entr${unsavedCount === 1 ? "y" : "ies"} not saved`
              );
            }
          } catch {
            /* ignore parse errors */
          }
        }
      } else {
        // Sheet not yet fully certified — flag it as pending certification
        outstanding.push("Sheet not fully certified");
      }
      if (outstanding.length > 0) {
        results.push({
          sheetId: sheet.id,
          sheetTitle: sheet.title,
          operationId: sheet.operationId,
          operationName: op?.name ?? "Unknown",
          role: "author",
          outstanding,
          allSigned,
        });
      }
    }
  }

  return results;
}

/**
 * Returns running sheets authored by this CIN that have one or more photo
 * attachments not yet linked to an Intelligence entity — surfaced to the
 * author as a To-Do item so photos don't get left unlinked.
 */
export async function getUnlinkedImagesTodoForCin(cin: string): Promise<
  {
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    unlinkedCount: number;
  }[]
> {
  const db = await getDb();
  if (!db) return [];

  const allSheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  const authoredSheets = allSheets.filter(s => {
    try {
      const cins: { cin: string; isAuthor?: boolean }[] = JSON.parse(
        s.sheetCins ?? "[]"
      );
      return cins.some(c => c.cin === cin && c.isAuthor);
    } catch {
      return false;
    }
  });
  if (authoredSheets.length === 0) return [];

  const opIds = Array.from(new Set(authoredSheets.map(s => s.operationId)));
  const ops = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, opIds));
  const validOpIds = new Set(ops.map(o => o.id));
  const validSheets = authoredSheets.filter(s => validOpIds.has(s.operationId));
  if (validSheets.length === 0) return [];

  const results: Awaited<ReturnType<typeof getUnlinkedImagesTodoForCin>> = [];

  for (const sheet of validSheets) {
    const rows = await getRowsBySheetId(sheet.id);
    const rowIds = rows.map(r => r.id);
    const attachments = await getAttachmentsByRowIds(rowIds);
    if (attachments.length === 0) continue;
    const withLinkCounts = await attachLinkedCounts(db, attachments);
    const unlinkedCount = withLinkCounts.filter(
      a => !isAttachmentProperlyLinked(a)
    ).length;
    if (unlinkedCount === 0) continue;

    const op = ops.find(o => o.id === sheet.operationId);
    results.push({
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      operationId: sheet.operationId,
      operationName: op?.name ?? "Unknown",
      unlinkedCount,
    });
  }

  return results;
}

// ─── Sheet Summary ──────────────────────────────────────────────────────────

export async function getSheetSummary(
  sheetId: number
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sheetSummaries)
    .where(eq(sheetSummaries.sheetId, sheetId))
    .limit(1);
  return rows[0] ?? null;
}

export interface SheetSummaryUpsertInput {
  sheetId: number;
  teamLabel?: string | null;
  teamCins?: string | null;
  operationName?: string | null;
  dayDate?: string | null;
  startTime?: string | null;
  finishTime?: string | null;
  startTimeEdited?: boolean;
  finishTimeEdited?: boolean;
  targetName?: string | null;
  location?: string | null;
  dismissedVehicleKeys?: string | null;
  ioSupport?: string | null;
  intelSupport?: string | null;
  specialProjects?: string | null;
  ioContactTiming?: string | null;
  ioContactMethod?: string | null;
  objectives?: string | null;
  criticalDecisions?: string | null;
  issues?: string | null;
  lastEditedByCIN?: string | null;
}

export async function upsertSheetSummary(
  input: SheetSummaryUpsertInput
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getSheetSummary(input.sheetId);
  const { sheetId, ...fields } = input;

  if (existing) {
    const patch: Partial<InsertSheetSummary> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (patch as any)[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(sheetSummaries)
        .set(patch)
        .where(eq(sheetSummaries.sheetId, sheetId));
    }
  } else {
    await db.insert(sheetSummaries).values({ sheetId, ...fields });
  }
  return getSheetSummary(sheetId);
}

/** Locks the summary — sets completedAt/completedByCIN, clears any prior reopen record. */
export async function completeSheetSummary(
  sheetId: number,
  cin: string
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(sheetSummaries)
    .set({
      completedAt: Date.now(),
      completedByCIN: cin,
      reopenedAt: null,
      reopenedByCIN: null,
    })
    .where(eq(sheetSummaries.sheetId, sheetId));
  return getSheetSummary(sheetId);
}

/** Unlocks the summary — clears completedAt/completedByCIN, stamps who reopened it. */
export async function reopenSheetSummary(
  sheetId: number,
  cin: string
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(sheetSummaries)
    .set({
      completedAt: null,
      completedByCIN: null,
      reopenedAt: Date.now(),
      reopenedByCIN: cin,
    })
    .where(eq(sheetSummaries.sheetId, sheetId));
  return getSheetSummary(sheetId);
}

/** Sort CINs ascending by their numeric portion (e.g. "QA1" < "TA01" < "BS12"); falls back to plain string compare when neither has digits. */
export function sortCinsNumerically(cins: string[]): string[] {
  return [...cins].sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10);
    const nb = parseInt(b.replace(/\D/g, ""), 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

/** Team-leader-first, then ascending-numeric-CIN ordering for the Summary tab's Team Members field. */
export function orderTeamCins(
  sheetCins: { cin: string; isTeamLeader?: boolean }[]
): string[] {
  const leaders = sheetCins.filter(c => c.isTeamLeader).map(c => c.cin);
  const others = sheetCins.filter(c => !c.isTeamLeader).map(c => c.cin);
  return [...sortCinsNumerically(leaders), ...sortCinsNumerically(others)];
}

/** Location for the Summary tab: the RS row whose observation mentions "surveillance commenced" — an address entity extracted from it if found, otherwise the raw row text. Null if no such row exists. */
export function extractSummaryLocation(
  rows: { observation: string | null }[]
): string | null {
  const row = rows.find(r =>
    (r.observation ?? "").toLowerCase().includes("surveillance commenced")
  );
  if (!row?.observation) return null;
  const entities = extractEntitiesFromText(row.observation);
  const address = entities.find(e => e.type === "address");
  return address
    ? address.shortForm || address.fullDescription
    : row.observation;
}

export interface SheetSummaryVehicle {
  key: string;
  label: string;
}

/** Vehicles for the Summary tab: Target Registry vehicles (v1f/v1, v2f/v2, extraVehicles) plus vehicles mentioned in RS row text, minus any the supervisor has dismissed. Always computed live, never stored. */
export function computeSheetSummaryVehicles(
  target:
    | {
        v1f: string | null;
        v1: string | null;
        v2f: string | null;
        v2: string | null;
        extraVehicles: string | null;
      }
    | null
    | undefined,
  rows: { observation: string | null }[],
  dismissedKeys: string[]
): SheetSummaryVehicle[] {
  const vehicles: SheetSummaryVehicle[] = [];
  const seen = new Set<string>();
  const add = (key: string, label: string) => {
    const normalized = label.trim().toLowerCase();
    if (!label.trim() || seen.has(normalized)) return;
    seen.add(normalized);
    vehicles.push({ key, label: label.trim() });
  };

  if (target) {
    const v1 = target.v1f?.trim() || target.v1?.trim();
    if (v1) add("target:v1", formatIntelVehicle(v1));
    const v2 = target.v2f?.trim() || target.v2?.trim();
    if (v2) add("target:v2", formatIntelVehicle(v2));
    if (target.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          target.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const label = ev.full?.trim() || ev.short?.trim();
          if (label) add(`target:extra${idx}`, formatIntelVehicle(label));
        });
      } catch {
        // ignore malformed JSON
      }
    }
  }

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    for (const e of entities) {
      if (e.type !== "vehicle") continue;
      const label = e.shortForm || e.fullDescription;
      if (!label) continue;
      add(`rs:${label.trim().toLowerCase()}`, label);
    }
  }

  const dismissed = new Set(dismissedKeys);
  return vehicles.filter(v => !dismissed.has(v.key));
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A small fixed set of officer-facing shorthand the Summary tab writes back
 * out — not the full `shortcuts` table (that also has phrases like
 * "Surveillance commenced in the vicinity of" that stay spelled out in a
 * Summary), just the specific abbreviations investigators expect to read:
 * driver/sole occupant, front passenger, parked/unattended, continued out
 * of sight. Case-insensitive, whole-phrase match.
 */
const SUMMARY_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bdriver and sole occupant\b/gi, "DSO"],
  [/\bfront passenger\b/gi, "FP"],
  [/\bparked and unattended\b/gi, "PU"],
  [/\bcontinued out of sight\b/gi, "COOS"],
];

/**
 * Rewrites one RS row's observation text into the shorthand style
 * investigators actually write Summaries in — not a verbatim copy, and not
 * an attempt at general rewriting (that would need real language
 * understanding, which this app's Golden Rule rules out at runtime; text
 * that doesn't match one of these specific, deterministic patterns is left
 * exactly as written). Rules, applied in order:
 *
 *  1. Every bracket-introduced address/vehicle mention becomes its
 *     Intelligence short form (formatIntelAddress/formatIntelVehicle —
 *     the same functions the Intelligence folder itself uses), e.g.
 *     "44 Elvira Street, PALMYRA WA (44 Elvira Street)" -> "44 Elvira
 *     Street, PALMYRA", "...bearing WA registration 1FAT004 (Vehicle
 *     1FAT004)" -> "1FAT004 ...".
 *  2. A bare "Vehicle <rego>" mention (already introduced earlier in the
 *     sheet, so it shows up here without its own bracket) drops the word
 *     "Vehicle" — just the rego.
 *  3. The sheet's own target — by TGT alias, whether bracket-introduced or
 *     a bare re-mention — becomes "TGT".
 *  4. DSO / FP / PU / COOS (see SUMMARY_ABBREVIATIONS above).
 *  5. "departed ... continued via:" — the from-address in between is
 *     dropped (it was just stated, or is the previous line's location) —
 *     becomes "departed, travelled to:".
 *  6. "PHOTOGRAPH/S TAKEN" is dropped entirely — investigators reading a
 *     Summary don't need this noted, it's implicit in the photo count.
 */
function buildSummaryAbbreviatedText(
  observation: string,
  tgtAlias: string | null
): string {
  let text = observation;

  // 1. Bracket-introduced address/vehicle mentions -> Intelligence short form.
  const entities = extractEntitiesFromText(text);
  const typeByRawShortForm = new Map(
    entities.map(e => [e.rawShortForm.trim().toUpperCase(), e.type])
  );
  const bracketPattern = /([^()]{3,120}?)\s*\(([^()]{1,80})\)/g;
  let rebuilt = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = bracketPattern.exec(text)) !== null) {
    const [full, , bracketContent] = match;
    const type = typeByRawShortForm.get(bracketContent.trim().toUpperCase());
    let replacement = full;
    if (type === "address") {
      replacement = formatIntelAddress(full);
    } else if (type === "vehicle") {
      replacement = formatIntelVehicle(bracketContent.trim(), text);
    }
    rebuilt += text.slice(lastIndex, match.index) + replacement;
    lastIndex = match.index + full.length;
  }
  rebuilt += text.slice(lastIndex);
  text = rebuilt;

  // 2. Bare "Vehicle <rego>" (already introduced earlier in the sheet) -> just the rego.
  text = text.replace(/\bVehicle\s+([A-Z0-9]{4,8})\b/gi, "$1");

  // 3. The sheet's own target's alias -> "TGT".
  if (tgtAlias && tgtAlias.trim()) {
    text = text.replace(
      new RegExp(`\\b${escapeRegExp(tgtAlias.trim())}\\b`, "g"),
      "TGT"
    );
  }

  // 4. Fixed abbreviations.
  for (const [pattern, replacement] of SUMMARY_ABBREVIATIONS) {
    text = text.replace(pattern, replacement);
  }

  // 5. "departed ... continued via:" -> "departed, travelled to:" — the
  // from-address in between (bracket-introduced or bare) is dropped, along
  // with any comma immediately preceding "departed" in the source sentence.
  text = text.replace(
    /,?\s*\bdeparted\b\s*(?:and\s+)?.*?,?\s*(?:and\s+)?continued via:/gi,
    " departed, travelled to:"
  );

  // 6. Drop "PHOTOGRAPH/S TAKEN" entirely.
  text = text.replace(/\s*PHOTOGRAPH\/?S?\s+TAKEN\.?/gi, "");

  // Cleanup: collapse stray whitespace/punctuation left by the removals above.
  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  return text;
}

/**
 * Splits one RS row into the Summary line's three fields — time, location,
 * and just the "what happened" text — kept separate (rather than
 * concatenated into one string) so the PDF export can render them as
 * distinct Time / Address / Observation table columns without the address
 * being duplicated inside the observation text.
 */
function buildSummaryEntryFields(
  row: {
    time: string | null;
    observation: string | null;
  },
  tgtAlias: string | null
): { text: string; location: string | null } {
  const raw = row.observation ?? "";
  const entities = extractEntitiesFromText(raw);
  const location = entities.find(e => e.type === "address");

  return {
    text: buildSummaryAbbreviatedText(raw, tgtAlias),
    location: location ? location.shortForm || location.fullDescription : null,
  };
}

/**
 * A row that is nothing but the "Travelled Via" route mechanics — the bare
 * "continued via:" trigger, its paired street-list row, a self-contained
 * "continued via: <streets>, whereat" row, or the "tv" shortcut's own
 * auto-fill — carries no observational content of its own, so it never
 * gets a Summary line. This is deliberately narrower than "the row mentions
 * continued via" — a row that WRAPS a via clause in real narrative (e.g.
 * "departed 44 Smith St and continued via: Jones Ave, whereat continued
 * surveillance") still gets a line; only the via clause inside it is
 * shortened, by buildSummaryAbbreviatedText's "departed ... continued via:"
 * step. A blanket exclusion on any row mentioning "continued via" would
 * silently drop that real narrative along with the route detail.
 *
 * The "tv" shortcut (see travelledVia.getStreets in routers.ts) replaces a
 * row's whole text with just the street list itself — no "continued via"
 * wording anywhere, e.g.:
 *   Canning Highway, BICTON,
 *   Stock Road,
 *   Leach Highway, MYAREE, whereat;
 * The two regex checks above never matched this shape (they both require
 * the text to START with "continued via"), so every "tv"-filled row was
 * silently falling through into the Summary as a normal entry — the third
 * check below is specifically for it: every line but the last ends in a
 * bare trailing comma, and the last ends with a comma immediately before
 * "whereat" (the generator's own closing word) and nothing else. A real
 * narrative row that happens to use the word "whereat" always has more
 * text after it, so this doesn't risk swallowing one.
 */
export function isPureTravelledViaRow(observation: string): boolean {
  const trimmed = observation.trim();
  if (!trimmed) return false;
  if (/^continued via[;:]\s*$/i.test(trimmed)) return true;
  if (/^continued via[;:].*\bwhereat[;:.,]?\s*$/i.test(trimmed)) return true;

  const lines = trimmed
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1];
  if (!/,\s*whereat[;:.,]?$/i.test(last)) return false;
  return lines.slice(0, -1).every(line => /,$/.test(line));
}

function isPureTravelledViaFollowUp(
  observation: string,
  previousObservation: string | null
): boolean {
  if (!previousObservation) return false;
  if (!/^continued via[;:]\s*$/i.test(previousObservation.trim())) return false;
  return /whereat[;:.,]?\s*$/i.test(observation.trim());
}

/**
 * Returns the Summary tab's per-row entry list, first append-only syncing in
 * any RS row with real observation text that doesn't have an entry yet —
 * except pure "Travelled Via" street-list rows (see isPureTravelledViaRow),
 * which are skipped entirely; a witness/supervisor reading the Summary
 * doesn't need the turn-by-turn route, same reasoning Court Statements
 * already apply (routers.ts's statement.previewData). That check only ever
 * gates new inserts — an existing line is never removed or regenerated,
 * even if a later edit makes its row match the pattern. Existing entries
 * (including ones the supervisor has edited or soft-deleted) are never
 * touched or regenerated either way.
 *
 * While the summary is marked complete, none of this runs at all — no new
 * lines are added and no existing ones are refreshed, even if RS rows keep
 * changing. Reopening the summary resumes syncing from where it left off.
 */
export async function getSheetSummaryEntries(
  sheetId: number
): Promise<SheetSummaryEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const summary = await getSheetSummary(sheetId);
  const isComplete = !!summary?.completedAt;

  // The sheet's own target's TGT alias (e.g. "MAY") — used to rewrite their
  // name down to "TGT" in the shorthand Summary text (see
  // buildSummaryAbbreviatedText). Not every sheet has a linked target.
  const sheet = await getRunningSheetById(sheetId);
  const target = sheet?.targetId ? await getTargetById(sheet.targetId) : null;
  const tgtAlias = target?.tgt?.trim() || null;

  const allRows = await getRowsBySheetId(sheetId);
  // Rows with real content — used both for deciding which rows need a new
  // line and for sort order / for deciding whether an existing line's row
  // is still genuinely there.
  const contentRows = allRows.filter(r => (r.observation ?? "").trim());
  const contentRowById = new Map(contentRows.map(r => [r.id, r]));

  const pureTravelledViaRowIds = new Set<number>();
  for (let i = 0; i < allRows.length; i++) {
    const obs = allRows[i].observation ?? "";
    if (!obs.trim()) continue;
    const prevObs = i > 0 ? allRows[i - 1].observation : null;
    if (
      isPureTravelledViaRow(obs) ||
      isPureTravelledViaFollowUp(obs, prevObs)
    ) {
      pureTravelledViaRowIds.add(allRows[i].id);
    }
  }

  const existing = await db
    .select()
    .from(sheetSummaryEntries)
    .where(eq(sheetSummaryEntries.sheetId, sheetId));

  let all = existing;

  if (!isComplete) {
    const existingRowIds = new Set(existing.map(e => e.rowId));
    const missing = contentRows.filter(
      r => !existingRowIds.has(r.id) && !pureTravelledViaRowIds.has(r.id)
    );
    if (missing.length > 0) {
      await db.insert(sheetSummaryEntries).values(
        missing.map(r => {
          const fields = buildSummaryEntryFields(r, tgtAlias);
          return {
            sheetId,
            rowId: r.id,
            text: fields.text,
            location: fields.location,
            time: r.time,
            timeMinutes: r.timeMinutes,
          };
        })
      );
      all = await db
        .select()
        .from(sheetSummaryEntries)
        .where(eq(sheetSummaryEntries.sheetId, sheetId));
    }

    // Keep unedited row-linked lines synced with their source row — editing
    // an RS row (e.g. adding a vehicle mention) should flow through to a
    // Summary line the supervisor hasn't touched. A line that's been edited
    // stays exactly as the supervisor left it, no matter what happens to the
    // row afterward.
    const pendingUpdates: Promise<unknown>[] = [];
    all = all.map(e => {
      if (e.edited || e.rowId == null) return e;
      const row = contentRowById.get(e.rowId);
      if (!row) {
        if (e.deleted) return e;
        pendingUpdates.push(
          db
            .update(sheetSummaryEntries)
            .set({ deleted: true })
            .where(eq(sheetSummaryEntries.id, e.id))
        );
        return { ...e, deleted: true };
      }
      const fields = buildSummaryEntryFields(row, tgtAlias);
      const changed =
        fields.text !== e.text ||
        fields.location !== e.location ||
        row.time !== e.time ||
        row.timeMinutes !== e.timeMinutes;
      if (!changed) return e;
      pendingUpdates.push(
        db
          .update(sheetSummaryEntries)
          .set({
            text: fields.text,
            location: fields.location,
            time: row.time,
            timeMinutes: row.timeMinutes,
          })
          .where(eq(sheetSummaryEntries.id, e.id))
      );
      return {
        ...e,
        text: fields.text,
        location: fields.location,
        time: row.time,
        timeMinutes: row.timeMinutes,
      };
    });
    if (pendingUpdates.length > 0) await Promise.all(pendingUpdates);
  }

  const rowOrder = new Map(contentRows.map((r, idx) => [r.id, idx]));
  // Row-linked lines sort by their source row's position. Manually-added
  // lines (rowId null) with no time yet sort above everything else, newest
  // first — "adds the row to the top and stays there until a time is
  // added" — via a negative key derived from id (higher id = added later =
  // more negative = further toward the top). Once a manual line has a time,
  // it's slotted in among the row-linked lines by comparing that time
  // against each row's own time.
  const sortKey = (e: SheetSummaryEntry): number => {
    if (e.rowId != null) {
      return rowOrder.has(e.rowId)
        ? rowOrder.get(e.rowId)!
        : contentRows.length + e.id;
    }
    if (e.timeMinutes == null) return -1 - e.id;
    let idx = 0;
    for (const r of contentRows) {
      if (r.timeMinutes != null && r.timeMinutes <= e.timeMinutes) idx++;
      else break;
    }
    return idx - 0.5;
  };
  return all.filter(e => !e.deleted).sort((a, b) => sortKey(a) - sortKey(b));
}

/** Adds a blank, manually-added summary line (not tied to any RS row) for additional information the supervisor wants to note. */
export async function addManualSheetSummaryEntry(
  sheetId: number
): Promise<SheetSummaryEntry | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db
    .insert(sheetSummaryEntries)
    .values({ sheetId, rowId: null, text: "" });
  const [row] = await db
    .select()
    .from(sheetSummaryEntries)
    .where(eq(sheetSummaryEntries.id, result.insertId as number))
    .limit(1);
  return row ?? null;
}

export async function updateSheetSummaryEntry(
  id: number,
  text: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetSummaryEntries)
    .set({ text, edited: true })
    .where(eq(sheetSummaryEntries.id, id));
}

/** Sets a manually-added summary line's time, which is what lets it sort into place among the row-linked lines instead of staying pinned at the top. */
export async function setSheetSummaryEntryTime(
  id: number,
  time: string,
  timeMinutes: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetSummaryEntries)
    .set({ time, timeMinutes })
    .where(eq(sheetSummaryEntries.id, id));
}

export async function deleteSheetSummaryEntry(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sheetSummaryEntries)
    .set({ deleted: true })
    .where(eq(sheetSummaryEntries.id, id));
}

/** Previously-used IO/Intel support names for the same Operation, for the Summary tab's autocomplete. */
export async function getSheetSummarySupportHistory(
  operationId: number,
  field: "ioSupport" | "intelSupport"
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      value:
        field === "ioSupport"
          ? sheetSummaries.ioSupport
          : sheetSummaries.intelSupport,
    })
    .from(sheetSummaries)
    .innerJoin(runningSheets, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(eq(runningSheets.operationId, operationId));

  const names = new Set<string>();
  for (const r of rows) {
    if (!r.value) continue;
    for (const name of r.value.split(",")) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * The most recently-created summary on the same Operation (excluding this
 * sheet), used to carry forward Investigator, Intel Support, Special
 * Projects, and Objectives into a newly-created summary. Everything else
 * (Location, Team, Target, the Communication section, Critical Decisions,
 * Issues) starts blank/derived fresh per the supervisor's spec.
 */
/**
 * Donor sheet for carry-forward fields (Investigator, Intel Support, Special
 * Projects, Objectives — see summary.getBySheet). When this sheet has a
 * target, only a summary for that SAME target counts — Special Projects
 * ticked for one target shouldn't leak onto the next summary for a
 * different target just because it happens to be the most recently created
 * sheet in the operation. Falls back to the most recent summary anywhere in
 * the operation when this sheet has no target to scope by.
 */
export async function getMostRecentSheetSummaryForOperation(
  operationId: number,
  excludeSheetId: number,
  targetId?: number | null
): Promise<SheetSummary | null> {
  const db = await getDb();
  if (!db) return null;
  const conditions = [
    eq(runningSheets.operationId, operationId),
    sql`${runningSheets.id} != ${excludeSheetId}`,
  ];
  if (targetId) conditions.push(eq(runningSheets.targetId, targetId));
  const rows = await db
    .select({ summary: sheetSummaries })
    .from(sheetSummaries)
    .innerJoin(runningSheets, eq(sheetSummaries.sheetId, runningSheets.id))
    .where(and(...conditions))
    .orderBy(desc(runningSheets.createdAt))
    .limit(1);
  return rows[0]?.summary ?? null;
}

// ─── Witness List ───────────────────────────────────────────────────────────

export interface WitnessListSheetData {
  sheetTitle: string;
  sheetDate: number;
  primary: string[];
  secondary: string[];
}

export interface WitnessListData {
  operationName: string;
  overallPrimary: string[];
  overallSecondary: string[];
  sheets: WitnessListSheetData[];
  producedAt: number;
  certifierCin: string;
}

// Primary witnesses: CINs that appear on at least one non-excluded row.
// Secondary witnesses: CINs that ONLY appear on excluded rows (travelled via,
// surveillance commenced/ceased). Shared by the .docx generator (witnessList.generate)
// and the PDF export (witnessList.getData) so both read the exact same classification.
export async function computeWitnessListData(
  sheetIds: number[],
  operationName: string,
  certifierCin: string
): Promise<WitnessListData> {
  const sheets = await Promise.all(sheetIds.map(id => getRunningSheetById(id)));
  const validSheets = sheets.filter(Boolean) as NonNullable<
    Awaited<ReturnType<typeof getRunningSheetById>>
  >[];

  // Sort sheets by date — read sheetDate directly (the source the title's
  // date prefix is itself generated from) rather than re-deriving it by
  // regex-parsing the title, falling back to createdAt for legacy sheets
  // with no sheetDate.
  const getSheetDate = (
    sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>
  ) => {
    if (sheet.sheetDate) {
      const [y, mo, da] = sheet.sheetDate.split("-").map(Number);
      return Date.UTC(y, mo - 1, da);
    }
    const d = new Date(
      sheet.createdAt instanceof Date
        ? sheet.createdAt.getTime()
        : sheet.createdAt
    );
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  validSheets.sort((a, b) => getSheetDate(a) - getSheetDate(b));

  // Helper to classify rows for a sheet
  const classifyRows = async (
    sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>
  ) => {
    const rows = await getRowsBySheetId(sheet.id);
    const sortedRows = [...rows];
    const excludedRowIds = new Set<number>();

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const obs = (row.observation ?? "").trim();
      // Surveillance commenced/ceased
      if (
        /^surveillance commenced/i.test(obs) ||
        /^surveillance ceased/i.test(obs)
      ) {
        excludedRowIds.add(row.id);
        continue;
      }
      // Travelled via — ends in "whereat" (optionally followed by : or ;)
      //                AND previous row contains "continued via" (followed by : or ;)
      if (/whereat[;:]?\s*$/i.test(obs) && i > 0) {
        const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
        if (/continued via[;:]/.test(prevObs)) {
          excludedRowIds.add(row.id);
        }
      }
    }

    const rowIds = rows.map(r => r.id);
    const members = rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];
    return { excludedRowIds, members };
  };

  const sheetWitnessList: WitnessListSheetData[] = [];

  // Overall sets (across all sheets)
  const overallPrimarySet = new Set<string>();
  const overallSecondarySet = new Set<string>();

  for (const sheet of validSheets) {
    const sheetDate = getSheetDate(sheet);
    let roster: { cin: string }[] = [];
    try {
      roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
    } catch {
      roster = [];
    }

    const { excludedRowIds, members } = await classifyRows(sheet);

    // For each CIN in roster, determine primary vs secondary
    const primarySet = new Set<string>();
    const secondarySet = new Set<string>();

    for (const entry of roster) {
      const cinUpper = entry.cin.toUpperCase();
      const cinRowIds = members
        .filter(m => m.memberName.toUpperCase() === cinUpper)
        .map(m => m.rowId);

      if (cinRowIds.length === 0) {
        // On roster but no rows — treat as secondary (on duty, no observations)
        secondarySet.add(cinUpper);
        continue;
      }

      const hasQualifyingRow = cinRowIds.some(id => !excludedRowIds.has(id));
      if (hasQualifyingRow) {
        primarySet.add(cinUpper);
      } else {
        secondarySet.add(cinUpper);
      }
    }

    // A CIN that is primary on ANY sheet is overall primary
    Array.from(primarySet).forEach(cin => {
      overallPrimarySet.add(cin);
      overallSecondarySet.delete(cin); // remove from secondary if they were added there
    });
    Array.from(secondarySet).forEach(cin => {
      if (!overallPrimarySet.has(cin)) {
        overallSecondarySet.add(cin);
      }
    });

    sheetWitnessList.push({
      sheetTitle: sheet.title,
      sheetDate,
      primary: Array.from(primarySet).sort(),
      secondary: Array.from(secondarySet).sort(),
    });
  }

  return {
    operationName,
    overallPrimary: Array.from(overallPrimarySet).sort(),
    overallSecondary: Array.from(overallSecondarySet).sort(),
    sheets: sheetWitnessList,
    producedAt: Date.now(),
    certifierCin,
  };
}
