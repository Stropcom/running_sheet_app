import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  rowMembers,
  rowAttachments,
  InsertRowAttachment,
  attachmentEntityLinks,
  InsertAttachmentEntityLink,
  runningSheets,
  sheetRows,
} from "../../drizzle/schema";

import { getDb } from "./core";
import { getAllIntelligenceEntities } from "./reports";
import { getMembersByRowId } from "./operations";

// ─── Row Attachments ────────────────────────────────────────────────────────

export async function createRowAttachment(data: InsertRowAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(rowAttachments).values(data);
  return result.insertId as number;
}

// Set once, shortly after upload, by the background face-detection pass —
// see runFaceDetectionForAttachment in attachmentUpload.ts. Drives the
// Governance "Imagery" check's person-link requirement (Governance.tsx).
export async function setAttachmentFaceCount(
  id: number,
  faceCount: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(rowAttachments)
    .set({ faceCount })
    .where(eq(rowAttachments.id, id));
}

// linkedCount = number of Intelligence entity links on each attachment — used
// to require photos be linked to an entity before a Governance row can be
// marked saved, and to show a linked/unlinked badge in the Images gallery and
// on inline running-sheet photo attachments. linkedCategories is the distinct
// set of entity categories ("target"/"vehicle"/"associate"/"location") linked
// to that attachment, so the badge can show which kind of thing a photo is
// linked to at a glance (a category-specific icon when there's exactly one,
// a generic "linked" icon when it spans more than one) without a second
// round-trip per thumbnail. linkedEntities carries the actual label per link
// (target name, vehicle rego, Unidentified Person placeholder, etc.) so
// thumbnails can show *who/what* a photo is linked to, not just that it is.
export async function attachLinkedCounts<T extends { id: number }>(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rows: T[]
): Promise<
  (T & {
    linkedCount: number;
    linkedCategories: string[];
    linkedEntities: Array<{
      category: string;
      label: string;
      targetId: number | null;
    }>;
  })[]
> {
  if (rows.length === 0) return [];
  const attachmentIds = rows.map(r => r.id);
  const [linkCounts, linkRows] = await Promise.all([
    db
      .select({
        attachmentId: attachmentEntityLinks.attachmentId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(attachmentEntityLinks)
      .where(inArray(attachmentEntityLinks.attachmentId, attachmentIds))
      .groupBy(attachmentEntityLinks.attachmentId),
    db
      .select({
        attachmentId: attachmentEntityLinks.attachmentId,
        category: attachmentEntityLinks.category,
        entityLabel: attachmentEntityLinks.entityLabel,
        // Only set when category = "target" — the only category linked by a
        // real foreign key rather than normalized label text (see
        // attachmentEntityLinks in drizzle/schema.ts). Threaded through so
        // the client can link straight to /intelligence/target/:id without
        // a second lookup — an associate instead links by its (already
        // known) name via /intelligence/associate/:label.
        targetId: attachmentEntityLinks.targetId,
      })
      .from(attachmentEntityLinks)
      .where(inArray(attachmentEntityLinks.attachmentId, attachmentIds)),
  ]);
  const countMap = new Map(
    linkCounts.map(l => [l.attachmentId, Number(l.count)])
  );
  const categoryMap = new Map<number, string[]>();
  const entityMap = new Map<
    number,
    Array<{ category: string; label: string; targetId: number | null }>
  >();
  for (const l of linkRows) {
    const cats = categoryMap.get(l.attachmentId) ?? [];
    if (!cats.includes(l.category)) cats.push(l.category);
    categoryMap.set(l.attachmentId, cats);
    const ents = entityMap.get(l.attachmentId) ?? [];
    ents.push({
      category: l.category,
      label: l.entityLabel,
      targetId: l.targetId ?? null,
    });
    entityMap.set(l.attachmentId, ents);
  }
  return rows.map(r => ({
    ...r,
    linkedCount: countMap.get(r.id) ?? 0,
    linkedCategories: categoryMap.get(r.id) ?? [],
    linkedEntities: entityMap.get(r.id) ?? [],
  }));
}

export async function getAttachmentsByRowIds(rowIds: number[]) {
  const db = await getDb();
  if (!db || rowIds.length === 0) return [];
  const attachments = await db
    .select()
    .from(rowAttachments)
    .where(
      and(
        inArray(rowAttachments.rowId, rowIds),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(asc(rowAttachments.createdAt));
  return attachLinkedCounts(db, await attachRowMemberCins(db, attachments));
}

export async function getAttachmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(rowAttachments)
    .where(eq(rowAttachments.id, id))
    .limit(1);
  return result[0];
}

// Batches in the CINs of members on each attachment's row (excluding the
// __SPACE__ spacer entry) — used for the "date/time · CIN" caption shown
// under photos, which reflects the observation row, not the upload.
export async function attachRowMemberCins<T extends { rowId: number | null }>(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rows: T[]
): Promise<(T & { memberCINs: string[] })[]> {
  if (rows.length === 0) return [];
  // Manually-uploaded photos may have no row at all — nothing to look up for those.
  const rowIds = Array.from(
    new Set(rows.map(r => r.rowId).filter((id): id is number => id != null))
  );
  const members =
    rowIds.length > 0
      ? await db
          .select({
            rowId: rowMembers.rowId,
            memberName: rowMembers.memberName,
          })
          .from(rowMembers)
          .where(inArray(rowMembers.rowId, rowIds))
      : [];
  const byRow = new Map<number, string[]>();
  for (const m of members) {
    if (m.memberName === "__SPACE__") continue;
    const arr = byRow.get(m.rowId) ?? [];
    arr.push(m.memberName);
    byRow.set(m.rowId, arr);
  }
  return rows.map(r => ({
    ...r,
    memberCINs: r.rowId != null ? (byRow.get(r.rowId) ?? []) : [],
  }));
}

// All attachments across every running sheet in an operation, joined back to
// their row/sheet so the Images folder can show which sheet/row each came from.
export async function getAttachmentsByOperationId(operationId: number) {
  const db = await getDb();
  if (!db) return [];
  // Left-joined: manually-uploaded photos (rowId null) belong to the
  // operation directly via rowAttachments.operationId and have no sheet/row
  // to join through. isNull(runningSheets.deletedAt) still excludes photos
  // whose sheet was soft-deleted, since the join only NULLs out for photos
  // that never had a sheet in the first place.
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      isManualUpload: rowAttachments.isManualUpload,
      url: rowAttachments.url,
      mimeType: rowAttachments.mimeType,
      caption: rowAttachments.caption,
      uploadedByCIN: rowAttachments.uploadedByCIN,
      createdAt: rowAttachments.createdAt,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .where(
      and(
        eq(rowAttachments.operationId, operationId),
        isNull(runningSheets.deletedAt),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(desc(rowAttachments.createdAt));
  return attachLinkedCounts(db, await attachRowMemberCins(db, rows));
}

// Photo count per operation, for the top-level Images folder list badge —
// same live-photo filter as getAttachmentsByOperationId (excludes soft-deleted
// attachments and photos whose row-owning sheet was soft-deleted), grouped
// across every operation in one query rather than N+1 per folder.
export async function getAttachmentCountsByOperation(): Promise<
  { operationId: number; count: number }[]
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      operationId: rowAttachments.operationId,
      count: sql<number>`count(*)`,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .leftJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .where(
      and(isNull(runningSheets.deletedAt), isNull(rowAttachments.deletedAt))
    )
    .groupBy(rowAttachments.operationId);
}

// All attachments on a single running sheet, joined back to their row for a
// time label.
export async function getAttachmentsBySheetId(sheetId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      isManualUpload: rowAttachments.isManualUpload,
      url: rowAttachments.url,
      mimeType: rowAttachments.mimeType,
      caption: rowAttachments.caption,
      uploadedByCIN: rowAttachments.uploadedByCIN,
      createdAt: rowAttachments.createdAt,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .innerJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .where(
      and(eq(sheetRows.sheetId, sheetId), isNull(rowAttachments.deletedAt))
    )
    .orderBy(desc(rowAttachments.createdAt));
  return attachLinkedCounts(db, await attachRowMemberCins(db, rows));
}

// Soft-delete — goes to the Recycle Bin for 7 days before purge
export async function softDeleteAttachment(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(rowAttachments)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(rowAttachments.id, id));
}

export async function reinstateAttachment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(rowAttachments)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(rowAttachments.id, id));
}

// Permanent delete — used when purging expired Recycle Bin items, or by an
// admin hard-deleting straight from the Recycle Bin.
export async function deleteRowAttachment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.attachmentId, id));
  await db.delete(rowAttachments).where(eq(rowAttachments.id, id));
}

// ─── Attachment Entity Links ────────────────────────────────────────────────
// Matches the same normalization getAllIntelligenceEntities() uses to
// de-duplicate vehicle/associate/location entities, so a link's entityKey
// lines up with entity.shortForm regardless of casing/whitespace.
export function normalizeEntityLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function linkAttachmentToEntity(data: {
  attachmentId: number;
  category:
    | "target"
    | "vehicle"
    | "associate"
    | "location"
    | "unidentified_person"
    | "member"
    | "item";
  targetId?: number;
  entityLabel: string;
  /** Added through the Target Registry — wins the profile photo. */
  fromRegistry?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const entityKey =
    data.category === "target" ? null : normalizeEntityLabel(data.entityLabel);
  const findExisting = () =>
    db
      .select({ id: attachmentEntityLinks.id })
      .from(attachmentEntityLinks)
      .where(
        and(
          eq(attachmentEntityLinks.attachmentId, data.attachmentId),
          eq(attachmentEntityLinks.category, data.category),
          data.category === "target"
            ? eq(attachmentEntityLinks.targetId, data.targetId ?? -1)
            : eq(attachmentEntityLinks.entityKey, entityKey ?? "")
        )
      )
      .limit(1);
  // Avoid duplicate links to the same entity
  const existing = await findExisting();
  if (existing.length > 0) {
    // A photo already linked elsewhere that the registry now claims.
    if (data.fromRegistry) {
      await db
        .update(attachmentEntityLinks)
        .set({ fromRegistry: true })
        .where(eq(attachmentEntityLinks.id, existing[0].id));
    }
    return existing[0].id;
  }
  const insertData: InsertAttachmentEntityLink = {
    attachmentId: data.attachmentId,
    category: data.category,
    targetId: data.category === "target" ? data.targetId : null,
    entityKey,
    entityLabel: data.entityLabel,
    fromRegistry: data.fromRegistry ?? false,
  };
  try {
    const [result] = await db.insert(attachmentEntityLinks).values(insertData);
    return result.insertId as number;
  } catch (err) {
    // The check above is a plain SELECT-then-INSERT, so two requests for the
    // same face landing close together (e.g. a fast double-tap on the
    // face-select Confirm button) can both pass it before either commits.
    // The unique index on (attachmentId, category, entityKey) is the real
    // guard — on conflict, the other request won the race, so reuse its row.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ER_DUP_ENTRY" &&
      entityKey !== null
    ) {
      const raceWinner = await findExisting();
      if (raceWinner.length > 0) return raceWinner[0].id;
    }
    throw err;
  }
}

// ─── Auto-link photos to their row's address ───────────────────────────────
// A photo attached to a running sheet row gets silently linked to the same
// "location" entity the map/Intelligence Folder already track for that
// row's address — no separate officer action, no visible UI of its own.
// The link only starts mattering later, when the map checks whether a given
// pin has any linked photos (see attachment.byEntity / getAttachmentsForEntity).
//
// Resolved via getAllIntelligenceEntities — the same function the map and
// Intelligence Folder already use — rather than re-deriving a key from just
// this row's own text. A row very often only mentions an address's raw
// short form, with the full bracketed introduction sitting in an earlier
// row of the same sheet ("arrived at 92 Waterloo Street, TUART HILL WA (92
// Waterloo Street)..." in one row, then a photo taken several rows later on
// a row that only says "92 Waterloo Street" with no bracket of its own).
// getAllIntelligenceEntities already resolves that bare mention back to the
// one canonical entity the earlier bracket established (its own "Pass B"
// dictionary matching) — reusing that real resolution, instead of scanning
// this row's text in isolation, is what guarantees the link lands under the
// exact key the map pin already uses, and that a photo two rows away from
// its address's only bracket still finds it.
async function findCanonicalLocationForRow(
  rowId: number
): Promise<string | null> {
  const entities = await getAllIntelligenceEntities();
  const entity = entities.find(
    e =>
      (e.type === "address" || e.type === "business") &&
      e.occurrences.some(o => o.rowId === rowId)
  );
  return entity ? entity.shortForm : null;
}

export async function autoLinkAttachmentToRowAddresses(
  attachmentId: number,
  rowId: number
): Promise<void> {
  const entityLabel = await findCanonicalLocationForRow(rowId);
  if (!entityLabel) return;
  await linkAttachmentToEntity({
    attachmentId,
    category: "location",
    entityLabel,
  });
}

// ─── Auto-link photos to their row's sole CIN ──────────────────────────────
// A photo attached to a row with exactly one member on it gets silently
// linked to that member's CIN, same "no separate officer action" pattern as
// the location auto-link above — there's no ambiguity about who the photo
// should be attributed to when only one CIN is on the row. A row with 0 or
// 2+ real members (excluding the "__SPACE__" spacer row) is left alone: the
// officer picks which member(s) via LinkAttachmentDialog's own CIN section
// in the 2+ case, and there's nothing to attribute in the 0 case.
async function getSingleRowMemberCin(rowId: number): Promise<string | null> {
  const members = await getMembersByRowId(rowId);
  const cins = members
    .map(m => m.memberName)
    .filter(name => name !== "__SPACE__");
  return cins.length === 1 ? cins[0] : null;
}

export async function autoLinkAttachmentToRowMemberIfSingle(
  attachmentId: number,
  rowId: number
): Promise<void> {
  const cin = await getSingleRowMemberCin(rowId);
  if (!cin) return;
  await linkAttachmentToEntity({
    attachmentId,
    category: "member",
    entityLabel: cin,
  });
}

// Called whenever a row's member list changes (added or removed — see
// unlinkRowPhotosFromCin below for the removed-CIN side of that) —
// retroactively applies the same single-CIN rule above to every one of the
// row's EXISTING photos, not just a freshly-uploaded one: if the row now has
// exactly one real CIN, links it to any photo that doesn't already have a
// "member" link (e.g. a photo uploaded before any CIN was on the row, or
// one just unlinked by unlinkRowPhotosFromCin). Never touches a photo that
// already has a different member link — that would mean 2+ members are (or
// were) on the row and an officer picked one specifically, which this
// leaves alone.
export async function reconcileRowPhotoMemberLinks(
  rowId: number
): Promise<void> {
  const cin = await getSingleRowMemberCin(rowId);
  if (!cin) return;
  const attachments = await getAttachmentsByRowIds([rowId]);
  for (const a of attachments) {
    if (!a.linkedCategories.includes("member")) {
      await linkAttachmentToEntity({
        attachmentId: a.id,
        category: "member",
        entityLabel: cin,
      });
    }
  }
}

// Called when a specific CIN is removed from a row's member list (member.
// remove, before this the row may have had that CIN auto-linked to one or
// more of its photos — see reconcileRowPhotoMemberLinks/
// autoLinkAttachmentToRowMemberIfSingle) — unlinks any of the row's photos
// from exactly that CIN, since the link is no longer valid: the CIN it
// named isn't on the row any more. The amber "Needs CIN link" placeholder
// (LinkedEntityPills) then reappears on that photo, and if the row still
// has exactly one other real CIN, reconcileRowPhotoMemberLinks (called
// right after this, same mutation) picks it up automatically. Only removes
// links matching the removed CIN specifically — a different member's link
// on the same photo is untouched.
export async function unlinkRowPhotosFromCin(
  rowId: number,
  cin: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const attachments = await getAttachmentsByRowIds([rowId]);
  if (attachments.length === 0) return;
  const attachmentIds = attachments.map(a => a.id);
  await db
    .delete(attachmentEntityLinks)
    .where(
      and(
        inArray(attachmentEntityLinks.attachmentId, attachmentIds),
        eq(attachmentEntityLinks.category, "member"),
        eq(attachmentEntityLinks.entityKey, normalizeEntityLabel(cin))
      )
    );
}

export async function unlinkAttachmentFromEntity(linkId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, linkId));
}

// Used by attachment.unlinkFromEntity's row-lock guard, which only has the
// link id (not the attachment id) to work from.
export async function getEntityLinkById(linkId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [link] = await db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, linkId))
    .limit(1);
  return link;
}

export async function getEntityLinksByAttachmentId(attachmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.attachmentId, attachmentId));
}
