import {
  and,
  desc,
  eq,
  inArray,
  ne,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { cosineSimilarity } from "../faceRecognition";

import { addressMatchKey } from "@shared/addressMatchKey";

import {
  pickProfilePhoto,
  type ProfilePhotoCandidate,
} from "@shared/profilePhoto";

import {
  formatIntelVehicle,
  shortPersonDisplayName,
} from "@shared/addressFormat";

import {
  operations,
  rowAttachments,
  attachmentEntityLinks,
  personDetections,
  InsertPersonDetection,
  faceMatchDismissals,
  runningSheets,
  sheetRows,
  targets,
  associates,
  operationTargetLinks,
} from "../../drizzle/schema";

import { getDb } from "./core";
import { getUserByCin } from "./accounts";
import { createNotificationsForUsers } from "./notifications";
import { attachRowMemberCins, normalizeEntityLabel } from "./attachments";

// ─── Person Detections (face recognition) ──────────────────────────────────

export async function createPersonDetection(data: {
  attachmentId: number;
  entityLinkId: number;
  bbox: [number, number, number, number];
  landmarks: [number, number][];
  embedding: number[];
  detectionConfidence: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const insertData: InsertPersonDetection = {
    attachmentId: data.attachmentId,
    entityLinkId: data.entityLinkId,
    bboxX0: data.bbox[0],
    bboxY0: data.bbox[1],
    bboxX1: data.bbox[2],
    bboxY1: data.bbox[3],
    landmarks: JSON.stringify(data.landmarks),
    embedding: JSON.stringify(data.embedding),
    detectionConfidence: data.detectionConfidence,
  };
  try {
    const [result] = await db.insert(personDetections).values(insertData);
    return result.insertId as number;
  } catch (err) {
    // entityLinkId is unique (one detection per link, see schema comment) —
    // a racing duplicate confirm request (see linkAttachmentToEntity) can
    // reach here with the same linkId the other request already saved a
    // detection for. Treat that as already-done rather than erroring.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ER_DUP_ENTRY"
    ) {
      const [existing] = await db
        .select({ id: personDetections.id })
        .from(personDetections)
        .where(eq(personDetections.entityLinkId, data.entityLinkId))
        .limit(1);
      if (existing) return existing.id;
    }
    throw err;
  }
}

export interface FaceMatchCandidate {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
  attachmentId: number;
  photoUrl: string;
  /** Where this candidate photo actually came from — a different running
   * sheet (possibly weeks/months old, on a different operation entirely)
   * the officer confirming a match may have no idea exists. Null sheetId
   * means a manually-uploaded photo not attached to any row; operation
   * info is always present since every attachment has a home Operation. */
  sourceSheetId: number | null;
  sourceSheetTitle: string | null;
  sourceOperationId: number;
  sourceOperationName: string;
}

// Threshold picked from empirical testing against one real multi-face photo
// (same face re-encoded ~0.99, mirrored ~0.89, different people ~0.1-0.3).
// Was lowered to 0.25 after real operational photos showed the on-device
// MobileFace embedding's discriminative margin is narrow under real
// lighting/angle/pose variation (different people ranged roughly -0.06 to
// 0.31, one confirmed same-person cross-photo pair scored 0.45) — 0.25 was
// generous specifically to avoid missing that kind of true match. Raised
// back to 0.35 to cut down on false-positive suggestion volume; re-lower if
// operational use shows genuine matches being missed again. Matches are
// always human-confirmed, never applied automatically, so this only trades
// off review noise vs. recall, never data correctness.
export const FACE_MATCH_THRESHOLD = 0.35;

const FACE_MATCH_MAX_RESULTS = 5;

// Compares a newly-confirmed face's embedding against every other confirmed
// face on file (other Unidentified Person entries and identified
// Targets/Associates alike) and returns the closest candidates above
// threshold, excluding whatever this face's own link is and anything the
// officer has already dismissed as "not a match" against it. Never called
// automatically outside a face-confirm flow, and never applied without a
// human explicitly accepting a specific candidate (see confirmFaceMatch).
export async function findSimilarFaces(
  embedding: number[],
  excludeEntityLinkId: number
): Promise<FaceMatchCandidate[]> {
  const db = await getDb();
  if (!db) return [];

  const dismissals = await db
    .select()
    .from(faceMatchDismissals)
    .where(
      or(
        eq(faceMatchDismissals.entityLinkIdA, excludeEntityLinkId),
        eq(faceMatchDismissals.entityLinkIdB, excludeEntityLinkId)
      )
    );
  const dismissedPartners = new Set<number>();
  for (const d of dismissals) {
    dismissedPartners.add(
      d.entityLinkIdA === excludeEntityLinkId
        ? d.entityLinkIdB
        : d.entityLinkIdA
    );
  }

  const rows = await db
    .select({
      entityLinkId: personDetections.entityLinkId,
      embedding: personDetections.embedding,
      attachmentId: personDetections.attachmentId,
      category: attachmentEntityLinks.category,
      targetId: attachmentEntityLinks.targetId,
      entityLabel: attachmentEntityLinks.entityLabel,
      photoUrl: rowAttachments.url,
      sourceSheetId: sheetRows.sheetId,
      sourceSheetTitle: runningSheets.title,
      sourceOperationId: rowAttachments.operationId,
      sourceOperationName: operations.name,
    })
    .from(personDetections)
    .innerJoin(
      attachmentEntityLinks,
      eq(personDetections.entityLinkId, attachmentEntityLinks.id)
    )
    .innerJoin(
      rowAttachments,
      eq(personDetections.attachmentId, rowAttachments.id)
    )
    // A manually-uploaded photo (see rowAttachments.isManualUpload) has no
    // rowId, so these two are left joins — the candidate still always has
    // a home Operation (rowAttachments.operationId is never null).
    .leftJoin(sheetRows, eq(sheetRows.id, rowAttachments.rowId))
    .leftJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .innerJoin(operations, eq(operations.id, rowAttachments.operationId))
    .where(isNull(rowAttachments.deletedAt));

  const candidates: FaceMatchCandidate[] = [];
  for (const r of rows) {
    if (r.entityLinkId === excludeEntityLinkId) continue;
    if (dismissedPartners.has(r.entityLinkId)) continue;
    const otherEmbedding: number[] = JSON.parse(r.embedding);
    const similarity = cosineSimilarity(embedding, otherEmbedding);
    if (similarity >= FACE_MATCH_THRESHOLD) {
      candidates.push({
        entityLinkId: r.entityLinkId,
        category: r.category,
        targetId: r.targetId,
        entityLabel: r.entityLabel,
        similarity,
        attachmentId: r.attachmentId,
        photoUrl: r.photoUrl,
        sourceSheetId: r.sourceSheetId,
        sourceSheetTitle: r.sourceSheetTitle,
        sourceOperationId: r.sourceOperationId,
        sourceOperationName: r.sourceOperationName,
      });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, FACE_MATCH_MAX_RESULTS);
}

// Officer confirmed "yes, this is the same person" — merges the two links'
// identities. Whichever side carries the stronger identification wins (a
// real Target/Associate outranks an anonymous Unidentified Person
// placeholder), and every link sharing the *weaker* side's identity is
// upgraded to the stronger one — never the other way around. This used to
// unconditionally make the newly-confirmed link adopt the matched link's
// identity on the assumption the new side was "almost always a fresh
// Unidentified Person entry" — which broke exactly when an officer
// positively IDs someone as a Target/Associate and the match happens to be
// an existing Unidentified Person: the fresh Target link got silently
// overwritten back to "unidentified". A confirmed positive ID must never be
// downgraded by a merge, regardless of which side of the match it's on.
const FACE_IDENTITY_PRIORITY: Record<string, number> = {
  unidentified_person: 0,
  associate: 1,
  target: 2,
};

/** Resolves an attachment back to the running-sheet row/sheet it's attached
 * to (if any) — a manually-uploaded photo (see rowAttachments.isManualUpload)
 * may not belong to any row, in which case there's no lock/sheet to guard
 * or notify about. Used by confirmFaceMatch to check whether the row
 * holding an "Unidentified Person" photo is certified/locked before
 * auto-renaming it. */
// Attachments with no row (isManualUpload) return null here -- the inner
// join finds nothing to match against, which is exactly right: a photo
// that was never part of a running sheet row has no row/sheet lock to
// respect.
export async function getAttachmentRowSheetInfo(attachmentId: number): Promise<{
  sheetId: number;
  sheetTitle: string;
  sheetCins: string | null;
  isRowLocked: boolean;
  isSheetClosed: boolean;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      isLocked: sheetRows.isLocked,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
      sheetCins: runningSheets.sheetCins,
      closedAt: runningSheets.closedAt,
    })
    .from(rowAttachments)
    .innerJoin(sheetRows, eq(sheetRows.id, rowAttachments.rowId))
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .where(eq(rowAttachments.id, attachmentId))
    .limit(1);
  if (!row) return null;
  return {
    sheetId: row.sheetId,
    sheetTitle: row.sheetTitle,
    sheetCins: row.sheetCins,
    isRowLocked: row.isLocked,
    isSheetClosed: row.closedAt != null,
  };
}

/** Notifies a running sheet's Author and Team Leader (see sheetCins'
 * isAuthor/isTeamLeader flags) via the app's in-app notification system.
 * Deduplicates in case the same officer holds both roles. */
async function notifySheetAuthorAndTeamLeader(
  sheetCinsJson: string | null,
  params: { title: string; body: string; url: string }
) {
  let roster: { cin: string; isTeamLeader?: boolean; isAuthor?: boolean }[] =
    [];
  try {
    roster = sheetCinsJson ? JSON.parse(sheetCinsJson) : [];
  } catch {
    roster = [];
  }
  const cins = Array.from(
    new Set(
      roster
        .filter(c => c.isAuthor || c.isTeamLeader)
        .map(c => c.cin)
        .filter(Boolean)
    )
  );
  if (cins.length === 0) return;
  const users = await Promise.all(cins.map(cin => getUserByCin(cin)));
  const userIds = Array.from(
    new Set(users.filter((u): u is NonNullable<typeof u> => !!u).map(u => u.id))
  );
  if (userIds.length === 0) return;
  await createNotificationsForUsers(userIds, {
    ...params,
    sourceModule: "faceRecognition",
  });
}

export async function confirmFaceMatch(
  newLinkId: number,
  matchedLinkId: number
): Promise<{ applied: boolean; blockedRowLocked: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [newLink] = await db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, newLinkId))
    .limit(1);
  const [matched] = await db
    .select()
    .from(attachmentEntityLinks)
    .where(eq(attachmentEntityLinks.id, matchedLinkId))
    .limit(1);
  if (!newLink) throw new Error("New entity link not found");
  if (!matched) throw new Error("Matched entity link not found");

  const newPriority = FACE_IDENTITY_PRIORITY[newLink.category] ?? 0;
  const matchedPriority = FACE_IDENTITY_PRIORITY[matched.category] ?? 0;
  // Ties (including the common Unidentified-Person-joins-an-existing-
  // Unidentified-Person-pool case) favor the matched/existing side, so a
  // single freshly-confirmed face doesn't rename an already-established pool.
  const [winner, loser] =
    newPriority > matchedPriority ? [newLink, matched] : [matched, newLink];

  // A genuine identification — an Unidentified Person pool resolving to a
  // real Target/Associate — is the only case that needs a lock guard and a
  // notification. entityKey is unique per (attachmentId, faceIndex) for
  // unidentified_person links (see the dedup index above), so the loser
  // side here is always exactly the one photo/face being confirmed.
  const isRealIdentification =
    loser.category === "unidentified_person" &&
    winner.category !== "unidentified_person";

  const loserRowInfo = isRealIdentification
    ? await getAttachmentRowSheetInfo(loser.attachmentId)
    : null;
  const loserRowLocked =
    !!loserRowInfo?.isRowLocked || !!loserRowInfo?.isSheetClosed;

  const loserGroupWhere =
    loser.category === "target"
      ? and(
          eq(attachmentEntityLinks.category, "target"),
          eq(attachmentEntityLinks.targetId, loser.targetId ?? -1)
        )
      : and(
          eq(attachmentEntityLinks.category, loser.category),
          eq(attachmentEntityLinks.entityKey, loser.entityKey ?? "")
        );

  // Certified rows are evidentiary — a Facial Recognition match must never
  // silently rewrite one. Skip the rename and fall through to the
  // "needs manual review" notification below instead.
  if (!(isRealIdentification && loserRowLocked)) {
    await db
      .update(attachmentEntityLinks)
      .set({
        category: winner.category,
        targetId: winner.targetId,
        entityKey: winner.entityKey,
        entityLabel: winner.entityLabel,
      })
      .where(loserGroupWhere);
  }

  if (isRealIdentification && loserRowInfo) {
    const winnerRowInfo = await getAttachmentRowSheetInfo(winner.attachmentId);
    const otherSheetClause = winnerRowInfo
      ? `an image in '${winnerRowInfo.sheetTitle}'`
      : "a linked photo";
    const url = `/sheet/${loserRowInfo.sheetId}`;
    if (loserRowLocked) {
      await notifySheetAuthorAndTeamLeader(loserRowInfo.sheetCins, {
        title: "Facial Recognition match needs review — row is certified",
        body: `An unidentified Person in Running Sheet '${loserRowInfo.sheetTitle}' has a possible Facial Recognition match (${winner.entityLabel}) from ${otherSheetClause}, but the row is certified/locked so it could not be updated automatically. You need to review '${loserRowInfo.sheetTitle}' and confirm manually.`,
        url,
      });
    } else {
      await notifySheetAuthorAndTeamLeader(loserRowInfo.sheetCins, {
        title: "Unidentified person identified via Facial Recognition",
        body: `An unidentified Person in Running Sheet '${loserRowInfo.sheetTitle}' has been identified through Facial Recognition from ${otherSheetClause}. You need to review '${loserRowInfo.sheetTitle}'.`,
        url,
      });
    }
  }

  return {
    applied: !(isRealIdentification && loserRowLocked),
    blockedRowLocked: isRealIdentification && loserRowLocked,
  };
}

// Officer confirmed "no, not the same person" — stored unordered (smaller id
// first) so findSimilarFaces only needs one OR lookup to check both directions.
export async function createFaceMatchDismissal(
  entityLinkIdA: number,
  entityLinkIdB: number,
  cin?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [a, b] =
    entityLinkIdA < entityLinkIdB
      ? [entityLinkIdA, entityLinkIdB]
      : [entityLinkIdB, entityLinkIdA];
  await db
    .insert(faceMatchDismissals)
    .values({ entityLinkIdA: a, entityLinkIdB: b, dismissedByCIN: cin });
}

// One row per distinct linked entity with its photo count — used to show a
// camera badge on Intelligence Folder rows without an N+1 query per entity.
export async function getEntityLinkCounts(
  /** Only count photos on these operations (null/undefined = all). */
  allowedOperationIds?: Set<number> | null
) {
  const db = await getDb();
  if (!db) return [];
  if (allowedOperationIds && allowedOperationIds.size === 0) return [];
  return db
    .select({
      category: attachmentEntityLinks.category,
      targetId: attachmentEntityLinks.targetId,
      entityKey: attachmentEntityLinks.entityKey,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(attachmentEntityLinks)
    .innerJoin(
      rowAttachments,
      eq(attachmentEntityLinks.attachmentId, rowAttachments.id)
    )
    .where(
      and(
        isNull(rowAttachments.deletedAt),
        // An item photo is not an Intelligence entity: it has no profile, so
        // it never counts here (shared/attachmentLinking.ts).
        ne(attachmentEntityLinks.category, "item"),
        allowedOperationIds
          ? inArray(rowAttachments.operationId, Array.from(allowedOperationIds))
          : undefined
      )
    )
    .groupBy(
      attachmentEntityLinks.category,
      attachmentEntityLinks.targetId,
      attachmentEntityLinks.entityKey
    );
}

// All photos linked to one entity, joined back to row/sheet for display.
export async function getAttachmentsForEntity(params: {
  category:
    | "target"
    | "vehicle"
    | "associate"
    | "location"
    | "unidentified_person";
  targetId?: number;
  entityLabel?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const entityKey = params.entityLabel
    ? normalizeEntityLabel(params.entityLabel)
    : null;
  // A Target and an Associate that are the same person (the "Identical
  // profile" link) share their photos: whichever record a photo was linked to,
  // both show it. See identityLinkedCounterparts.
  const other =
    params.category === "target" || params.category === "associate"
      ? await identityLinkedCounterparts(db, params.category, {
          targetId: params.targetId,
          entityKey,
        })
      : { targetIds: [], associateKeys: [] };
  const own =
    params.category === "target"
      ? eq(attachmentEntityLinks.targetId, params.targetId ?? -1)
      : eq(attachmentEntityLinks.entityKey, entityKey ?? "");
  const links = await db
    .select()
    .from(attachmentEntityLinks)
    .where(
      or(
        and(eq(attachmentEntityLinks.category, params.category), own),
        other.targetIds.length > 0
          ? and(
              eq(attachmentEntityLinks.category, "target"),
              inArray(attachmentEntityLinks.targetId, other.targetIds)
            )
          : undefined,
        other.associateKeys.length > 0
          ? and(
              eq(attachmentEntityLinks.category, "associate"),
              inArray(attachmentEntityLinks.entityKey, other.associateKeys)
            )
          : undefined
      )
    );
  if (links.length === 0) return [];
  const attachmentIds = Array.from(new Set(links.map(l => l.attachmentId)));
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      operationId: rowAttachments.operationId,
      isManualUpload: rowAttachments.isManualUpload,
      url: rowAttachments.url,
      mimeType: rowAttachments.mimeType,
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
        inArray(rowAttachments.id, attachmentIds),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(desc(rowAttachments.createdAt));
  const withCins = await attachRowMemberCins(db, rows);
  return withCins.map(r => {
    // Prefer the link on the record being asked about, else the other half's.
    const mine = links.filter(l => l.attachmentId === r.id);
    const link = mine.find(l => l.category === params.category) ?? mine[0];
    return { ...r, linkId: link.id, fromRegistry: link.fromRegistry };
  });
}

/**
 * The other half of a Person Identity Link. A registry Associate that has been
 * made a Target (or the reverse) is one real person kept as two records
 * (`targets.linkedAssociateId` / `associates.linkedTargetId`), and the app
 * combines what it knows across both — but photos are linked to ONE record
 * (a target by id, an associate by label), so a photo uploaded to the
 * associate never reached the target's profile. This returns the other half's
 * photo keys: for a target, the linked associate's label key; for an
 * associate (by label key), the target ids it is linked to. Only linked
 * records are ever returned, so an unrelated person with the same name is
 * never mixed in.
 */
async function identityLinkedCounterparts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  category: "target" | "associate",
  ref: { targetId?: number; entityKey: string | null }
): Promise<{ targetIds: number[]; associateKeys: string[] }> {
  if (category === "target") {
    if (ref.targetId == null) return { targetIds: [], associateKeys: [] };
    const rows = await db
      .select({ name: associates.name })
      .from(targets)
      .innerJoin(associates, eq(targets.linkedAssociateId, associates.id))
      .where(eq(targets.id, ref.targetId));
    return {
      targetIds: [],
      associateKeys: rows.map(r => normalizeEntityLabel(r.name)),
    };
  }
  if (!ref.entityKey) return { targetIds: [], associateKeys: [] };
  const linked = await db
    .select({ name: associates.name, targetId: associates.linkedTargetId })
    .from(associates)
    .where(
      and(isNotNull(associates.linkedTargetId), isNull(associates.deletedAt))
    );
  const ids = linked
    .filter(a => normalizeEntityLabel(a.name) === ref.entityKey)
    .map(a => a.targetId as number);
  return { targetIds: Array.from(new Set(ids)), associateKeys: [] };
}

/** Photos of the people who live at each address, for the map's "Images"
 * button — only photos that were uploaded by hand (profile / baseball-card
 * imports, "Upload Image" on a target or associate), never the running-sheet
 * row photos, which the location link already covers. Scoped to the targets
 * linked to `operationIds` and their associates / residents.
 *
 * Each person counts at ONE address: a target's home address; an associate's
 * or resident's home address, else the first of their other addresses. Keyed
 * by shared/addressMatchKey so the client can look up a pin's address. */
export async function getPersonPhotosByAddress(operationIds: number[]): Promise<
  Array<{
    addressKey: string;
    photos: Array<{
      id: number;
      url: string;
      personLabel: string;
      createdAt: Date | null;
      isMain: boolean;
    }>;
  }>
> {
  const db = await getDb();
  if (!db || operationIds.length === 0) return [];

  const targetRows = await db
    .selectDistinct({
      id: targets.id,
      name: targets.name,
      firstNames: targets.firstNames,
      surname: targets.surname,
      hbf: targets.hbf,
      hb: targets.hb,
    })
    .from(operationTargetLinks)
    .innerJoin(targets, eq(operationTargetLinks.targetId, targets.id))
    .where(
      and(
        inArray(operationTargetLinks.operationId, operationIds),
        isNull(targets.deletedAt)
      )
    );
  if (targetRows.length === 0) return [];
  const targetIds = targetRows.map(t => t.id);

  const associateRows = await db
    .select({
      name: associates.name,
      firstNames: associates.firstNames,
      surname: associates.surname,
      hbf: associates.hbf,
      hb: associates.hb,
      extraAddresses: associates.extraAddresses,
    })
    .from(associates)
    .where(
      and(inArray(associates.targetId, targetIds), isNull(associates.deletedAt))
    );

  const shortName = (
    firstNames: string | null,
    surname: string | null,
    fallback: string
  ) => {
    const first = (firstNames ?? "").trim().split(/\s+/)[0] ?? "";
    if (first && surname) return `${first} ${surname.trim()}`;
    return (
      fallback
        .replace(/\s*\([^()]*\)\s*$/, "")
        .split(/,\s*born\b/i)[0]
        .split(",")[0]
        .trim() || fallback
    );
  };
  const firstExtraAddress = (json: string | null): string => {
    try {
      const eas: Array<{ full?: string; short?: string }> = JSON.parse(
        json ?? "[]"
      );
      for (const ea of eas) {
        const v = ea.full || ea.short;
        if (v) return v;
      }
    } catch {
      /* malformed JSON — no address */
    }
    return "";
  };

  type Person = { addressKey: string; label: string };
  const targetPeople = new Map<number, Person>();
  for (const t of targetRows) {
    const addressKey = addressMatchKey(t.hbf || t.hb);
    if (addressKey)
      targetPeople.set(t.id, {
        addressKey,
        label: shortName(t.firstNames, t.surname, t.name),
      });
  }
  // associate photos link by the normalized associate name (see
  // linkAttachmentToEntity's entityKey)
  const associatePeople = new Map<string, Person>();
  for (const a of associateRows) {
    const addressKey = addressMatchKey(
      a.hbf || a.hb || firstExtraAddress(a.extraAddresses)
    );
    if (addressKey)
      associatePeople.set(normalizeEntityLabel(a.name), {
        addressKey,
        label: shortName(a.firstNames, a.surname, a.name),
      });
  }
  if (targetPeople.size === 0 && associatePeople.size === 0) return [];

  const links = await db
    .select({
      attachmentId: attachmentEntityLinks.attachmentId,
      category: attachmentEntityLinks.category,
      targetId: attachmentEntityLinks.targetId,
      entityKey: attachmentEntityLinks.entityKey,
      fromRegistry: attachmentEntityLinks.fromRegistry,
    })
    .from(attachmentEntityLinks)
    .where(
      or(
        and(
          eq(attachmentEntityLinks.category, "target"),
          inArray(attachmentEntityLinks.targetId, targetIds)
        ),
        associatePeople.size > 0
          ? and(
              eq(attachmentEntityLinks.category, "associate"),
              inArray(
                attachmentEntityLinks.entityKey,
                Array.from(associatePeople.keys())
              )
            )
          : undefined
      )
    );
  if (links.length === 0) return [];

  const photoRows = await db
    .select({
      id: rowAttachments.id,
      url: rowAttachments.url,
      createdAt: rowAttachments.createdAt,
    })
    .from(rowAttachments)
    .where(
      and(
        inArray(
          rowAttachments.id,
          links.map(l => l.attachmentId)
        ),
        eq(rowAttachments.isManualUpload, true),
        isNull(rowAttachments.deletedAt)
      )
    )
    .orderBy(desc(rowAttachments.createdAt));
  const photoById = new Map(photoRows.map(p => [p.id, p]));

  type MapPhoto = {
    id: number;
    url: string;
    personLabel: string;
    createdAt: Date | null;
    /** The person's main profile photo (registry photo first — see
     * shared/profilePhoto.ts); the map's Images viewer leads with these. */
    isMain: boolean;
  };
  // Each person's main photo, picked from everything linked to them.
  const candidatesByPerson = new Map<string, ProfilePhotoCandidate[]>();
  const personKeyOf = (l: (typeof links)[number]) =>
    l.category === "target" ? `t:${l.targetId}` : `a:${l.entityKey}`;
  for (const l of links) {
    const photo = photoById.get(l.attachmentId);
    if (!photo) continue;
    const key = personKeyOf(l);
    const list = candidatesByPerson.get(key) ?? [];
    list.push({
      id: photo.id,
      fromRegistry: l.fromRegistry,
      createdAt: photo.createdAt,
    });
    candidatesByPerson.set(key, list);
  }
  const byAddress = new Map<string, Map<number, MapPhoto>>();
  for (const l of links) {
    const photo = photoById.get(l.attachmentId);
    if (!photo) continue;
    const person =
      l.category === "target"
        ? targetPeople.get(l.targetId ?? -1)
        : associatePeople.get(l.entityKey ?? "");
    if (!person) continue;
    const forAddress =
      byAddress.get(person.addressKey) ?? new Map<number, MapPhoto>();
    const personMain = pickProfilePhoto(
      candidatesByPerson.get(personKeyOf(l)) ?? []
    );
    const isMain = personMain?.id === photo.id;
    const seen = forAddress.get(photo.id);
    // One photo linked to a target AND the same person as an associate shows
    // once (and counts as main if it is main for either).
    if (seen) {
      if (isMain) seen.isMain = true;
    } else {
      forAddress.set(photo.id, {
        id: photo.id,
        url: photo.url,
        personLabel: person.label,
        createdAt: photo.createdAt ?? null,
        isMain,
      });
    }
    byAddress.set(person.addressKey, forAddress);
  }
  return Array.from(byAddress, ([addressKey, photos]) => ({
    addressKey,
    // Main profile photos first (by name), then the rest newest first.
    photos: Array.from(photos.values()).sort((a, b) =>
      a.isMain !== b.isMain
        ? a.isMain
          ? -1
          : 1
        : a.isMain
          ? a.personLabel.localeCompare(b.personLabel)
          : (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    ),
  }));
}

/** Every person registered against the selected operations' targets — the
 * targets themselves plus their associates and other home address residents
 * — with ALL the vehicles on their registry record, for the map popups. Each
 * carries the key of the one address they count at (see
 * getPersonPhotosByAddress) so a pin can find the people living there. */
export async function getRegisteredPeopleForMap(
  operationIds: number[]
): Promise<
  Array<{
    name: string;
    role: "target" | "resident" | "associate";
    addressKey: string;
    vehicles: string[];
  }>
> {
  const db = await getDb();
  if (!db || operationIds.length === 0) return [];

  const targetRows = await db
    .selectDistinct({
      id: targets.id,
      name: targets.name,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      extraVehicles: targets.extraVehicles,
    })
    .from(operationTargetLinks)
    .innerJoin(targets, eq(operationTargetLinks.targetId, targets.id))
    .where(
      and(
        inArray(operationTargetLinks.operationId, operationIds),
        isNull(targets.deletedAt)
      )
    );
  if (targetRows.length === 0) return [];

  const associateRows = await db
    .select({
      name: associates.name,
      relationship: associates.relationship,
      hbf: associates.hbf,
      hb: associates.hb,
      v1f: associates.v1f,
      v1: associates.v1,
      extraVehicles: associates.extraVehicles,
      extraAddresses: associates.extraAddresses,
    })
    .from(associates)
    .where(
      and(
        inArray(
          associates.targetId,
          targetRows.map(t => t.id)
        ),
        isNull(associates.deletedAt)
      )
    );

  const vehiclesOf = (r: {
    v1f?: string | null;
    v1?: string | null;
    v2f?: string | null;
    v2?: string | null;
    extraVehicles?: string | null;
  }): string[] => {
    const out: string[] = [];
    const add = (v?: string | null) => {
      const t = v?.trim();
      if (!t) return;
      const shown = formatIntelVehicle(t);
      if (shown && !out.includes(shown)) out.push(shown);
    };
    add(r.v1f || r.v1);
    add(r.v2f || r.v2);
    try {
      const extras: Array<{ full?: string; short?: string }> = JSON.parse(
        r.extraVehicles ?? "[]"
      );
      for (const ev of extras) add(ev.full || ev.short);
    } catch {
      /* malformed JSON — no extra vehicles */
    }
    return out;
  };
  const firstExtraAddress = (json: string | null): string => {
    try {
      const eas: Array<{ full?: string; short?: string }> = JSON.parse(
        json ?? "[]"
      );
      for (const ea of eas) {
        const v = ea.full || ea.short;
        if (v) return v;
      }
    } catch {
      /* malformed JSON — no address */
    }
    return "";
  };

  return [
    ...targetRows.map(t => ({
      name: shortPersonDisplayName(t.name),
      role: "target" as const,
      addressKey: addressMatchKey(t.hbf || t.hb),
      vehicles: vehiclesOf(t),
    })),
    ...associateRows.map(a => ({
      name: shortPersonDisplayName(a.name),
      role:
        a.relationship === "resident"
          ? ("resident" as const)
          : ("associate" as const),
      addressKey: addressMatchKey(
        a.hbf || a.hb || firstExtraAddress(a.extraAddresses)
      ),
      vehicles: vehiclesOf(a),
    })),
  ];
}

export interface OperationEntityPhoto {
  id: number;
  url: string;
  rowId: number | null;
  rowTime: string | null;
  rowDate: string | null;
  memberCINs: string[];
}

// Batched photo lookup for an Operation profile: given the targets in the
// operation and the (normalized) labels of every associated vehicle/
// associate/location shown against those targets, returns photos grouped
// by targetId and by "category::entityKey" so the profile can slot each
// entity's linked photos into its own section in one pass.
export async function getAttachmentsForOperationEntities(
  targetIds: number[],
  entityKeys: { vehicle: string[]; associate: string[]; location: string[] }
): Promise<{
  targetPhotos: Map<number, OperationEntityPhoto[]>;
  entityPhotos: Map<string, OperationEntityPhoto[]>;
}> {
  const empty = {
    targetPhotos: new Map<number, OperationEntityPhoto[]>(),
    entityPhotos: new Map<string, OperationEntityPhoto[]>(),
  };
  const db = await getDb();
  if (!db) return empty;

  // A target that is the same person as a registry associate also gets that
  // associate's photos (see identityLinkedCounterparts).
  const linkedAssociateKeyByTarget = new Map<number, string>();
  if (targetIds.length) {
    const linkedRows = await db
      .select({ targetId: targets.id, name: associates.name })
      .from(targets)
      .innerJoin(associates, eq(targets.linkedAssociateId, associates.id))
      .where(inArray(targets.id, targetIds));
    for (const r of linkedRows)
      linkedAssociateKeyByTarget.set(r.targetId, normalizeEntityLabel(r.name));
  }
  const associateKeysWanted = Array.from(
    new Set([
      ...entityKeys.associate,
      ...Array.from(linkedAssociateKeyByTarget.values()),
    ])
  );
  const conditions = [];
  if (targetIds.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "target"),
        inArray(attachmentEntityLinks.targetId, targetIds)
      )
    );
  if (entityKeys.vehicle.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "vehicle"),
        inArray(attachmentEntityLinks.entityKey, entityKeys.vehicle)
      )
    );
  if (associateKeysWanted.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "associate"),
        inArray(attachmentEntityLinks.entityKey, associateKeysWanted)
      )
    );
  if (entityKeys.location.length)
    conditions.push(
      and(
        eq(attachmentEntityLinks.category, "location"),
        inArray(attachmentEntityLinks.entityKey, entityKeys.location)
      )
    );
  if (!conditions.length) return empty;

  const links = await db
    .select()
    .from(attachmentEntityLinks)
    .where(or(...conditions));
  if (!links.length) return empty;

  const attachmentIds = Array.from(new Set(links.map(l => l.attachmentId)));
  const rows = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      url: rowAttachments.url,
      rowTime: sheetRows.time,
      rowDate: sheetRows.rowDate,
    })
    .from(rowAttachments)
    .leftJoin(sheetRows, eq(rowAttachments.rowId, sheetRows.id))
    .where(
      and(
        inArray(rowAttachments.id, attachmentIds),
        isNull(rowAttachments.deletedAt)
      )
    );
  const withCins = await attachRowMemberCins(db, rows);
  const byAttachmentId = new Map(withCins.map(r => [r.id, r]));

  const targetPhotos = new Map<number, OperationEntityPhoto[]>();
  const entityPhotos = new Map<string, OperationEntityPhoto[]>();
  for (const link of links) {
    const photo = byAttachmentId.get(link.attachmentId);
    if (!photo) continue;
    if (link.category === "target" && link.targetId != null) {
      const arr = targetPhotos.get(link.targetId) ?? [];
      arr.push(photo);
      targetPhotos.set(link.targetId, arr);
    } else if (link.entityKey) {
      const key = `${link.category}::${link.entityKey}`;
      const arr = entityPhotos.get(key) ?? [];
      arr.push(photo);
      entityPhotos.set(key, arr);
    }
  }
  // Slot each identity-linked associate's photos into its target's list too,
  // once per photo.
  for (const [targetId, key] of Array.from(linkedAssociateKeyByTarget)) {
    const extra = entityPhotos.get(`associate::${key}`) ?? [];
    if (extra.length === 0) continue;
    const arr = targetPhotos.get(targetId) ?? [];
    const have = new Set(arr.map(p => p.id));
    for (const p of extra) if (!have.has(p.id)) arr.push(p);
    targetPhotos.set(targetId, arr);
  }
  return { targetPhotos, entityPhotos };
}
