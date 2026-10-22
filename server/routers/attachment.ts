import { storageGetBytes } from "../storage";
import {
  detectAndEmbedFaces,
  detectFaceBoxes,
  cosineSimilarity,
} from "../faceRecognition";
import { rankFaces } from "@shared/faceRank";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  filterByIntelligenceScope,
  filterByOperationAccess,
  intelligenceOperationIds,
  toAccessUser,
} from "../operationAccess";
import {
  processAttachmentUpload,
  processManualAttachmentUpload,
  AttachmentUploadError,
} from "../attachmentUpload";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getRowById,
  getLinkedOperationsForTarget,
  getAttachmentsByRowIds,
  getAttachmentById,
  getAttachmentsByOperationId,
  getAttachmentCountsByOperation,
  getAttachmentsBySheetId,
  softDeleteAttachment,
  linkAttachmentToEntity,
  unlinkAttachmentFromEntity,
  getEntityLinkById,
  getEntityLinksByAttachmentId,
  getEntityLinkCounts,
  getAttachmentsForEntity,
  getPersonPhotosByAddress,
  getLinkedOperationsForEntity,
  createPersonDetection,
  findSimilarFaces,
  FACE_MATCH_THRESHOLD,
  confirmFaceMatch as confirmFaceMatchDb,
  createFaceMatchDismissal,
  type FaceMatchCandidate,
} from "../db";

import { guardAttachmentRowUnlocked, faceMatchesFor } from "./_helpers";

export const attachmentRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        rowId: z.number(),
        // base64-encoded image data
        dataBase64: z.string().min(1),
        // Deliberately unrestricted — browsers report file.type
        // inconsistently (often empty, e.g. for HEIC on Windows), so this
        // is validated/inferred (with the filename as a fallback) below
        // rather than at the schema level.
        mimeType: z.string(),
        fileName: z.string().optional(),
        caption: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await processAttachmentUpload({
          rowId: input.rowId,
          buffer: Buffer.from(input.dataBase64, "base64"),
          reportedMimeType: input.mimeType,
          fileName: input.fileName,
          caption: input.caption,
          userId: ctx.user.id,
          userCIN: ctx.user.cin ?? undefined,
        });
      } catch (err) {
        if (err instanceof AttachmentUploadError) {
          throw new TRPCError({
            code: err.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  uploadManual: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        rowId: z.number().optional(),
        dataBase64: z.string().min(1),
        mimeType: z.string(),
        fileName: z.string().optional(),
        caption: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await processManualAttachmentUpload({
          operationId: input.operationId,
          rowId: input.rowId,
          buffer: Buffer.from(input.dataBase64, "base64"),
          reportedMimeType: input.mimeType,
          fileName: input.fileName,
          caption: input.caption,
          userId: ctx.user.id,
          userCIN: ctx.user.cin ?? undefined,
        });
      } catch (err) {
        if (err instanceof AttachmentUploadError) {
          throw new TRPCError({
            code: err.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  listByRow: protectedProcedure
    .input(z.object({ rowId: z.number() }))
    .query(async ({ input }) => {
      return getAttachmentsByRowIds([input.rowId]);
    }),

  listByOperation: protectedProcedure
    .input(z.object({ operationId: z.number() }))
    .query(async ({ input }) => {
      return getAttachmentsByOperationId(input.operationId);
    }),

  /** Photo count per operation, for the top-level Images folder list. */
  countsByOperation: protectedProcedure.query(async ({ ctx }) => {
    return filterByOperationAccess(
      toAccessUser(ctx.user),
      await getAttachmentCountsByOperation(),
      r => r.operationId
    );
  }),

  listBySheet: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getAttachmentsBySheetId(input.sheetId);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const attachment = await getAttachmentById(input.id);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      const row =
        attachment.rowId != null
          ? await getRowById(attachment.rowId)
          : undefined;
      await guardAttachmentRowUnlocked(input.id);
      // Soft-delete — goes to the Recycle Bin for 7 days before purge
      await softDeleteAttachment(
        input.id,
        ctx.user.cin ?? ctx.user.username ?? "Unknown"
      );
      if (row) {
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: row.id,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "attachment_deleted",
          details: `Photo removed from row`,
          createdAt: Date.now(),
        });
      } else {
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "attachment_deleted",
          details: `Manually-uploaded photo deleted`,
          createdAt: Date.now(),
        });
      }
      return { success: true };
    }),

  linkToEntity: protectedProcedure
    .input(
      z.object({
        attachmentId: z.number(),
        category: z.enum([
          "target",
          "vehicle",
          "associate",
          "location",
          "unidentified_person",
          "member",
        ]),
        targetId: z.number().optional(),
        entityLabel: z.string().min(1),
        // Set by the Target Registry screens only (see shared/profilePhoto.ts).
        fromRegistry: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.category === "target" && !input.targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "targetId is required for target links.",
        });
      }
      await guardAttachmentRowUnlocked(input.attachmentId);
      const id = await linkAttachmentToEntity(input);
      return { id };
    }),

  unlinkFromEntity: protectedProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(async ({ input }) => {
      const link = await getEntityLinkById(input.linkId);
      if (!link)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Link not found.",
        });
      await guardAttachmentRowUnlocked(link.attachmentId);
      await unlinkAttachmentFromEntity(input.linkId);
      return { success: true };
    }),

  // Every entity a given photo is currently linked to — powers the
  // "Currently linked" list in LinkAttachmentDialog.
  linksFor: protectedProcedure
    .input(z.object({ attachmentId: z.number() }))
    .query(async ({ input }) => {
      return getEntityLinksByAttachmentId(input.attachmentId);
    }),

  entityLinkCounts: protectedProcedure.query(async ({ ctx }) => {
    return getEntityLinkCounts(
      await intelligenceOperationIds(toAccessUser(ctx.user))
    );
  }),

  byEntity: protectedProcedure
    .input(
      z.object({
        category: z.enum([
          "target",
          "vehicle",
          "associate",
          "location",
          "unidentified_person",
        ]),
        targetId: z.number().optional(),
        entityLabel: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return filterByIntelligenceScope(
        toAccessUser(ctx.user),
        await getAttachmentsForEntity(input),
        a => a.operationId
      );
    }),

  // Hand-uploaded photos (profiles / baseball cards) of the people living
  // at each address, for the selected operations — feeds the map's "Images"
  // button alongside the running-sheet photos. See getPersonPhotosByAddress.
  personPhotosByAddress: protectedProcedure
    .input(z.object({ operationIds: z.array(z.number()).max(200) }))
    .query(async ({ input }) => {
      return getPersonPhotosByAddress(input.operationIds);
    }),

  // Operations a given entity is already linked to — used to restrict the
  // manual-upload "link to operation" dropdown for a known Target/Vehicle/
  // Associate/Location. Unidentified Person has no linked operations (it's
  // not yet an identified entity), so the client leaves that dropdown
  // unrestricted with a search bar instead of calling this.
  linkedOperationsForEntity: protectedProcedure
    .input(
      z.object({
        category: z.enum(["target", "vehicle", "associate", "location"]),
        targetId: z.number().optional(),
        entityLabel: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (input.category === "target") {
        if (!input.targetId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "targetId is required.",
          });
        const links = await getLinkedOperationsForTarget(input.targetId);
        return filterByIntelligenceScope(
          toAccessUser(ctx.user),
          links.map(l => ({
            id: l.operationId,
            name: l.operationName ?? "Unknown",
          })),
          o => o.id
        );
      }
      if (!input.entityLabel)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "entityLabel is required.",
        });
      return filterByIntelligenceScope(
        toAccessUser(ctx.user),
        await getLinkedOperationsForEntity(input.category, input.entityLabel),
        o => o.id
      );
    }),

  // Runs RetinaFace detection (+ MobileFace embedding, held server-side
  // only) over a photo so the client can render a tap-to-select overlay
  // per face — nothing is written to the database and no identification
  // is made here. Detection is deterministic, so re-running it in
  // confirmUnidentifiedPersonFaces below reproduces the same ordered face
  // list without needing to cache embeddings between the two calls.
  detectFaces: protectedProcedure
    .input(z.object({ attachmentId: z.number() }))
    .query(async ({ input }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      try {
        const buffer = await storageGetBytes(attachment.key);
        // Boxes only (no embeddings) — see detectFaceBoxes. `rank`/`strong`
        // say which faces are the strongest few (shared/faceRank.ts).
        const faces = await detectFaceBoxes(buffer);
        return rankFaces(
          faces.map((f, index) => ({
            index,
            bbox: f.bbox,
            confidence: f.confidence,
          }))
        );
      } catch (err) {
        console.error("Face detection failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face detection failed.",
        });
      }
    }),

  // Same as detectFaces above, but for a photo that hasn't been uploaded
  // to storage yet — the Upload Photo staging screen runs this the moment
  // a file is picked, so the officer can tap a face before the photo is
  // actually saved (see attachment.uploadManual, called separately once
  // "Confirm upload" is pressed). A mutation, not a query, since it POSTs
  // the full photo bytes rather than referencing an attachmentId. Pure
  // detect-only, same as detectFaces — nothing written.
  detectFacesFromBytes: protectedProcedure
    .input(z.object({ dataBase64: z.string(), mimeType: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const buffer = Buffer.from(input.dataBase64, "base64");
        const faces = await detectFaceBoxes(buffer);
        return rankFaces(
          faces.map((f, index) => ({
            index,
            bbox: f.bbox,
            confidence: f.confidence,
          }))
        );
      } catch (err) {
        console.error("Face detection failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face detection failed.",
        });
      }
    }),

  // The officer has tapped ONE face: who else on file looks like it? Embeds
  // only that face (not every face in the photo) and returns the closest
  // few — with their photo, the person they're filed as, where the photo
  // came from and the similarity score — so the officer can judge for
  // themselves before choosing who it is. Nothing is written and nothing is
  // linked; it's a look, like compareFaces. Only matches from operations
  // this person can reach are returned.
  faceMatches: protectedProcedure
    .input(z.object({ attachmentId: z.number(), faceIndex: z.number() }))
    .query(async ({ input, ctx }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      try {
        const buffer = await storageGetBytes(attachment.key);
        return await faceMatchesFor(ctx.user, buffer, input.faceIndex);
      } catch (err) {
        console.error("Face match lookup failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face match lookup failed.",
        });
      }
    }),

  // Same, for a photo not uploaded yet (the Upload Photo staging screen).
  faceMatchesFromBytes: protectedProcedure
    .input(
      z.object({
        dataBase64: z.string(),
        mimeType: z.string(),
        faceIndex: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const buffer = Buffer.from(input.dataBase64, "base64");
        return await faceMatchesFor(ctx.user, buffer, input.faceIndex);
      } catch (err) {
        console.error("Face match lookup failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face match lookup failed.",
        });
      }
    }),

  // Called once, right after a photo finishes uploading, to offer an
  // immediate shortcut before the officer opens the manual Link dialog at
  // all. Deliberately narrow in scope: only a photo with EXACTLY one
  // detected face gets a suggestion — a multi-face photo falls straight
  // through to today's unchanged manual flow (FaceSelectPicker's
  // multi-select), since auto-suggesting several faces at once from one
  // upload is a bigger UX problem this doesn't attempt to solve. No link
  // or embedding is written here — same "detect only" contract as
  // detectFaces above — so declining the suggestion (or a photo with 0 or
  // 2+ faces) leaves the photo exactly as unlinked as it is today.
  previewFaceMatch: protectedProcedure
    .input(z.object({ attachmentId: z.number() }))
    .query(async ({ input }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      try {
        const buffer = await storageGetBytes(attachment.key);
        const faces = await detectAndEmbedFaces(buffer);
        if (faces.length !== 1)
          return { faceCount: faces.length, suggestion: null };
        const candidates = await findSimilarFaces(faces[0].embedding, -1);
        return { faceCount: 1, suggestion: candidates[0] ?? null };
      } catch (err) {
        console.error("Face detection failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face detection failed.",
        });
      }
    }),

  // Manual "Compare Faces" tool — an officer picks one face from each of
  // 2+ photos (any operation) and gets a pairwise similarity score back.
  // Unlike confirmUnidentifiedPersonFaces/confirmEntityFace, this never
  // writes anything (no entity link, no stored embedding) — it's a
  // one-off comparison, not an identification. Detection re-runs per
  // attachment (cached within the call for repeats) since embeddings are
  // never persisted or sent to the client, matching detectFaces above.
  compareFaces: protectedProcedure
    .input(
      z.object({
        faces: z
          .array(z.object({ attachmentId: z.number(), faceIndex: z.number() }))
          .min(2)
          .max(8),
      })
    )
    .query(async ({ input }) => {
      const detectionCache = new Map<
        number,
        Awaited<ReturnType<typeof detectAndEmbedFaces>>
      >();
      const embeddings: number[][] = [];
      for (const f of input.faces) {
        let faces = detectionCache.get(f.attachmentId);
        if (!faces) {
          const attachment = await getAttachmentById(f.attachmentId);
          if (!attachment)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Attachment not found.",
            });
          try {
            const buffer = await storageGetBytes(attachment.key);
            faces = await detectAndEmbedFaces(buffer);
          } catch (err) {
            console.error("Face detection failed:", err);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Face detection failed.",
            });
          }
          detectionCache.set(f.attachmentId, faces);
        }
        const face = faces[f.faceIndex];
        if (!face)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected face was not found.",
          });
        embeddings.push(face.embedding);
      }

      const results: Array<{
        aIndex: number;
        bIndex: number;
        similarity: number;
        isPossibleMatch: boolean;
      }> = [];
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
          results.push({
            aIndex: i,
            bIndex: j,
            similarity,
            isPossibleMatch: similarity >= FACE_MATCH_THRESHOLD,
          });
        }
      }
      return results;
    }),

  // Officer-confirmed step: for each face index the officer tapped, create
  // its own Unidentified Person pool entry (attachment_entity_links row)
  // plus the stored embedding (person_detections row) that later
  // similarity-search matching will compare against — never automatic.
  confirmUnidentifiedPersonFaces: protectedProcedure
    .input(
      z.object({
        attachmentId: z.number(),
        faceIndices: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      await guardAttachmentRowUnlocked(input.attachmentId);
      let faces;
      try {
        const buffer = await storageGetBytes(attachment.key);
        faces = await detectAndEmbedFaces(buffer);
      } catch (err) {
        console.error("Face detection failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face detection failed.",
        });
      }

      const results: Array<{
        linkId: number;
        index: number;
        matches: FaceMatchCandidate[];
      }> = [];
      for (const idx of input.faceIndices) {
        const face = faces[idx];
        if (!face) continue;
        const linkId = await linkAttachmentToEntity({
          attachmentId: input.attachmentId,
          category: "unidentified_person",
          entityLabel: `Unidentified Person #${input.attachmentId}-${idx}`,
        });
        await createPersonDetection({
          attachmentId: input.attachmentId,
          entityLinkId: linkId,
          bbox: face.bbox,
          landmarks: face.landmarks,
          embedding: face.embedding,
          detectionConfidence: face.confidence,
        });
        const matches = await findSimilarFaces(face.embedding, linkId);
        results.push({ linkId, index: idx, matches });
      }
      if (results.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "None of the selected faces were found.",
        });
      }
      return { results };
    }),

  // Single-face counterpart for Target/Associate links — the officer
  // already knows the identity (they picked it from the list), so this
  // just needs to know which detected face in the photo is that person,
  // then stores its embedding against the normal entity link so later
  // face-confirms elsewhere can suggest a match against a real identity,
  // not just other Unidentified Person entries.
  confirmEntityFace: protectedProcedure
    .input(
      z.object({
        attachmentId: z.number(),
        faceIndex: z.number(),
        category: z.enum(["target", "associate"]),
        targetId: z.number().optional(),
        entityLabel: z.string().min(1),
        fromRegistry: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.category === "target" && !input.targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "targetId is required for target links.",
        });
      }
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      await guardAttachmentRowUnlocked(input.attachmentId);
      let faces;
      try {
        const buffer = await storageGetBytes(attachment.key);
        faces = await detectAndEmbedFaces(buffer);
      } catch (err) {
        console.error("Face detection failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face detection failed.",
        });
      }
      const face = faces[input.faceIndex];
      if (!face)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected face was not found.",
        });

      const linkId = await linkAttachmentToEntity({
        attachmentId: input.attachmentId,
        category: input.category,
        targetId: input.targetId,
        entityLabel: input.entityLabel,
        fromRegistry: input.fromRegistry,
      });
      await createPersonDetection({
        attachmentId: input.attachmentId,
        entityLinkId: linkId,
        bbox: face.bbox,
        landmarks: face.landmarks,
        embedding: face.embedding,
        detectionConfidence: face.confidence,
      });
      const matches = await findSimilarFaces(face.embedding, linkId);
      return { linkId, matches };
    }),

  // Officer confirmed the immediate upload-time suggestion from
  // previewFaceMatch above ("possible match: Bob Smith — Target"). Unlike
  // confirmEntityFace/confirmUnidentifiedPersonFaces, no placeholder link
  // is created first — this attachment joins the matched entity's identity
  // directly in one step, via the exact same linkAttachmentToEntity call
  // the manual flow uses, just pre-filled with the suggested category/
  // target/label instead of an officer picking them from the dialog.
  confirmSuggestedFaceMatch: protectedProcedure
    .input(
      z.object({ attachmentId: z.number(), matchedEntityLinkId: z.number() })
    )
    .mutation(async ({ input }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found.",
        });
      await guardAttachmentRowUnlocked(input.attachmentId);
      const matchedLink = await getEntityLinkById(input.matchedEntityLinkId);
      if (!matchedLink)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Suggested match no longer exists.",
        });
      let faces;
      try {
        const buffer = await storageGetBytes(attachment.key);
        faces = await detectAndEmbedFaces(buffer);
      } catch (err) {
        console.error("Face detection failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Face detection failed.",
        });
      }
      const face = faces[0];
      if (!face)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No face found on this photo — try linking manually.",
        });

      const linkId = await linkAttachmentToEntity({
        attachmentId: input.attachmentId,
        category: matchedLink.category,
        targetId: matchedLink.targetId ?? undefined,
        entityLabel: matchedLink.entityLabel,
      });
      await createPersonDetection({
        attachmentId: input.attachmentId,
        entityLinkId: linkId,
        bbox: face.bbox,
        landmarks: face.landmarks,
        embedding: face.embedding,
        detectionConfidence: face.confidence,
      });
      return {
        linkId,
        category: matchedLink.category,
        entityLabel: matchedLink.entityLabel,
      };
    }),

  // Officer accepted a suggested possible-match — whichever side is the
  // stronger identification (Target/Associate over Unidentified Person)
  // wins the merge (see confirmFaceMatch in db.ts).
  confirmFaceMatch: protectedProcedure
    .input(z.object({ newLinkId: z.number(), matchedLinkId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await confirmFaceMatchDb(
        input.newLinkId,
        input.matchedLinkId
      );
      return { success: true, ...result };
    }),

  // Officer rejected a suggested possible-match — remembered so the same
  // pair isn't suggested again.
  dismissFaceMatch: protectedProcedure
    .input(z.object({ newLinkId: z.number(), matchedLinkId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await createFaceMatchDismissal(
        input.newLinkId,
        input.matchedLinkId,
        ctx.user.cin ?? undefined
      );
      return { success: true };
    }),
});
