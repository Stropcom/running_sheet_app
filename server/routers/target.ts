import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { TARGET_BACKGROUND_MAX } from "@shared/targetBackground";
import {
  filterByIntelligenceScope,
  filterByOperationAccess,
  scopeRegistryTargets,
  toAccessUser,
} from "../operationAccess";
import { TARGET_TYPES } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import {
  recomputeRunningSheetTitle,
  getAllTargets,
  getTargetsByOperation,
  createTarget,
  updateTarget,
  deleteTarget,
  getTargetById,
  findPossibleDuplicateTarget,
  findPossibleDuplicatePerson,
  mergeTargetFieldDetails,
  getTargetFieldHistory,
  setSheetTarget,
  getAllTargetsForRegistry,
  createRegistryTarget,
  createTargetLinkedToAssociate,
  linkTargetToOperation,
  recordTargetDocumentImport,
  listTargetDocumentImportsForOperation,
  listTargetDocumentImportsForTarget,
  unlinkTargetFromOperation,
  ensureTargetFullyLinked,
  getLinkedOperationsForTarget,
  softDeleteTarget,
} from "../db";

import { readDocxTables } from "../documentImport/docxTableReader";
import { readPdfText } from "../documentImport/pdfTextReader";
import { mapDocumentToTargetProfile } from "../documentImport/targetProfileFieldMap";
import {
  getDocumentAIModelStatus,
  suggestExtractedValue,
  suggestVerifiedCorrection,
} from "../documentImport/localDocumentAI";
import { AI_TIME_BUDGET_MS, withinBudget } from "../documentImport/aiBudget";
import { recordAiImport } from "../documentImport/aiStats";
import { DOCUMENT_AI_SETTING, getBoolSetting } from "../appSettings";
import {
  verifyAISuggestion,
  composeParsedValue,
  type AIAssistOutcome,
} from "../documentImport/documentAIVerify";

import {
  structuredTargetFieldsSchema,
  targetStatusFieldsSchema,
  saveTargetBackgroundWithAudit,
  storeTargetDocumentSourceFile,
} from "./_helpers";

export const targetRouter = router({
  /** List all targets for an operation */
  list: protectedProcedure
    .input(z.object({ operationId: z.number() }))
    .query(async ({ input }) => {
      return getTargetsByOperation(input.operationId);
    }),

  /** Create a new target */
  create: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        name: z.string().min(1).max(255),
        tgt: z.string().optional().nullable(),
        hb: z.string().optional().nullable(),
        v1: z.string().optional().nullable(),
        v2: z.string().optional().nullable(),
        hbf: z.string().optional().nullable(),
        v1f: z.string().optional().nullable(),
        v2f: z.string().optional().nullable(),
        dep: z.string().optional().nullable(),
        arr: z.string().optional().nullable(),
        extraVehicles: z.string().optional().nullable(), // JSON array of {full,short,...structured}
        wildFields: z.string().optional().nullable(), // JSON array of {label,value}
        ...structuredTargetFieldsSchema,
        ...targetStatusFieldsSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createTarget({ ...input, createdBy: ctx.user.id });
    }),

  /** Update an existing target */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        tgt: z.string().optional().nullable(),
        hb: z.string().optional().nullable(),
        v1: z.string().optional().nullable(),
        v2: z.string().optional().nullable(),
        hbf: z.string().optional().nullable(),
        v1f: z.string().optional().nullable(),
        v2f: z.string().optional().nullable(),
        dep: z.string().optional().nullable(),
        arr: z.string().optional().nullable(),
        extraVehicles: z.string().optional().nullable(),
        wildFields: z.string().optional().nullable(),
        ...structuredTargetFieldsSchema,
        ...targetStatusFieldsSchema,
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateTarget(id, data);
    }),

  /** Delete a target */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteTarget(input.id);
      return { success: true };
    }),

  /** List all targets across all operations (for cross-op linking) */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    return filterByOperationAccess(
      toAccessUser(ctx.user),
      await getAllTargets(),
      t => t.operationId
    );
  }),

  /** Get a single target by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getTargetById(input.id) ?? null;
    }),

  /** Set the target for a running sheet — also ensures operation link exists */
  setSheetTarget: protectedProcedure
    .input(z.object({ sheetId: z.number(), targetId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      if (input.targetId !== null) {
        // ensureTargetFullyLinked: sets sheet.targetId AND creates operation↔target link
        await ensureTargetFullyLinked(input.targetId, input.sheetId);
      } else {
        await setSheetTarget(input.sheetId, null);
      }
      // Title's (TARGET) segment is auto-derived — resync it.
      await recomputeRunningSheetTitle(input.sheetId);
      return { success: true };
    }),

  // ─── Target Registry sub-router ─────────────────────────────────────────────────────────────────────────
  registry: router({
    /** List all targets in the global registry with linked operations */
    list: protectedProcedure.query(async ({ ctx }) => {
      return scopeRegistryTargets(
        toAccessUser(ctx.user),
        await getAllTargetsForRegistry()
      );
    }),

    /** Create a new target in the global registry */
    create: protectedProcedure
      .input(
        z.object({
          // What this target record identifies — see targets.targetType's
          // own comment in schema.ts. Optional so the DB default
          // ("person") still applies for any caller that predates this.
          targetType: z.enum(TARGET_TYPES).optional(),
          name: z.string().min(1).max(255),
          tgt: z.string().optional().nullable(),
          hbf: z.string().optional().nullable(),
          hb: z.string().optional().nullable(),
          v1f: z.string().optional().nullable(),
          v1: z.string().optional().nullable(),
          v2f: z.string().optional().nullable(),
          v2: z.string().optional().nullable(),
          dep: z.string().optional().nullable(),
          arr: z.string().optional().nullable(),
          extraVehicles: z.string().optional().nullable(),
          wildFields: z.string().optional().nullable(),
          // Every target must belong to at least one operation — see
          // CLAUDE.md/the OperationPicker in AddTargetDialog, the only
          // client-side path to this procedure.
          linkToOperationId: z.number(),
          // The document's free-text narrative, when this target came
          // from a document import — stored on the (target, operation)
          // link as its "{Operation name} background".
          background: z.string().optional().nullable(),
          // The freeform Background typed in Add Target to Registry —
          // plain text, stored on the target itself (targets.registryBackground).
          registryBackground: z
            .string()
            .max(TARGET_BACKGROUND_MAX)
            .optional()
            .nullable(),
          // The full parsed document snapshot (name/addresses/vehicles/
          // associates/background), verbatim as the officer reviewed it —
          // present only when this save came from "Import from Document".
          // Recorded as its own version, alongside the background above,
          // rather than folded into the target's live fields. See
          // targetDocumentImports in schema.ts.
          documentSnapshotJson: z.string().optional().nullable(),
          documentSourceFileName: z.string().optional().nullable(),
          // The original uploaded file's raw bytes, so the officer can
          // later re-view the actual PDF/DOCX (not just the parsed
          // fields) from the Imported Documents panel — see storagePut
          // below and targetDocumentImports.sourceFileUrl in schema.ts.
          documentSourceFileBase64: z.string().optional().nullable(),
          documentSourceFileMimeType: z.string().optional().nullable(),
          ...structuredTargetFieldsSchema,
          ...targetStatusFieldsSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        const {
          linkToOperationId,
          background,
          registryBackground,
          documentSnapshotJson,
          documentSourceFileName,
          documentSourceFileBase64,
          documentSourceFileMimeType,
          ...data
        } = input;
        const result = await createRegistryTarget({
          ...data,
          createdBy: ctx.user.id,
        });
        await linkTargetToOperation(result.id, linkToOperationId, background);
        if (registryBackground?.trim()) {
          await saveTargetBackgroundWithAudit(
            ctx.user,
            { id: result.id, name: data.name },
            registryBackground
          );
        }
        if (documentSnapshotJson) {
          let sourceFileUrl: string | null = null;
          let renderablePdfUrl: string | null = null;
          if (documentSourceFileBase64) {
            const stored = await storeTargetDocumentSourceFile({
              targetId: result.id,
              fileName: documentSourceFileName,
              base64: documentSourceFileBase64,
              mimeType: documentSourceFileMimeType,
            });
            sourceFileUrl = stored.sourceFileUrl;
            renderablePdfUrl = stored.renderablePdfUrl;
          }
          await recordTargetDocumentImport({
            targetId: result.id,
            operationId: linkToOperationId,
            uploadedByCIN: ctx.user.cin ?? null,
            snapshotJson: documentSnapshotJson,
            sourceFileName: documentSourceFileName,
            sourceFileUrl,
            renderablePdfUrl,
          });
        }
        return result;
      }),

    /** Create a new target, linked to an existing Associate confirmed to
     * be the same real person — the "Yes, same person — link and copy"
     * resolution on the possible-duplicate prompt. Both records survive;
     * see server/db.ts's createTargetLinkedToAssociate. */
    createLinkedFromAssociate: protectedProcedure
      .input(
        z.object({
          targetType: z.enum(TARGET_TYPES).optional(),
          name: z.string().min(1).max(255),
          tgt: z.string().optional().nullable(),
          hbf: z.string().optional().nullable(),
          hb: z.string().optional().nullable(),
          v1f: z.string().optional().nullable(),
          v1: z.string().optional().nullable(),
          v2f: z.string().optional().nullable(),
          v2: z.string().optional().nullable(),
          dep: z.string().optional().nullable(),
          arr: z.string().optional().nullable(),
          extraVehicles: z.string().optional().nullable(),
          wildFields: z.string().optional().nullable(),
          // Every target must belong to at least one operation — see
          // CLAUDE.md/the OperationPicker in AddTargetDialog, the only
          // client-side path to this procedure.
          linkToOperationId: z.number(),
          // The document's free-text narrative, when this target came
          // from a document import — stored on the (target, operation)
          // link as its "{Operation name} background".
          background: z.string().optional().nullable(),
          // See target.registry.create's registryBackground.
          registryBackground: z
            .string()
            .max(TARGET_BACKGROUND_MAX)
            .optional()
            .nullable(),
          // See target.registry.create's documentSnapshotJson.
          documentSnapshotJson: z.string().optional().nullable(),
          documentSourceFileName: z.string().optional().nullable(),
          documentSourceFileBase64: z.string().optional().nullable(),
          documentSourceFileMimeType: z.string().optional().nullable(),
          existingAssociateId: z.number(),
          ...structuredTargetFieldsSchema,
          ...targetStatusFieldsSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        const {
          linkToOperationId,
          background,
          registryBackground,
          documentSnapshotJson,
          documentSourceFileName,
          documentSourceFileBase64,
          documentSourceFileMimeType,
          existingAssociateId,
          ...data
        } = input;
        const result = await createTargetLinkedToAssociate(
          { ...data, createdBy: ctx.user.id },
          existingAssociateId
        );
        await linkTargetToOperation(result.id, linkToOperationId, background);
        if (registryBackground?.trim()) {
          await saveTargetBackgroundWithAudit(
            ctx.user,
            { id: result.id, name: data.name },
            registryBackground
          );
        }
        if (documentSnapshotJson) {
          let sourceFileUrl: string | null = null;
          let renderablePdfUrl: string | null = null;
          if (documentSourceFileBase64) {
            const stored = await storeTargetDocumentSourceFile({
              targetId: result.id,
              fileName: documentSourceFileName,
              base64: documentSourceFileBase64,
              mimeType: documentSourceFileMimeType,
            });
            sourceFileUrl = stored.sourceFileUrl;
            renderablePdfUrl = stored.renderablePdfUrl;
          }
          await recordTargetDocumentImport({
            targetId: result.id,
            operationId: linkToOperationId,
            uploadedByCIN: ctx.user.cin ?? null,
            snapshotJson: documentSnapshotJson,
            sourceFileName: documentSourceFileName,
            sourceFileUrl,
            renderablePdfUrl,
          });
        }
        return result;
      }),

    /** Update a target in the registry */
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          tgt: z.string().optional().nullable(),
          hbf: z.string().optional().nullable(),
          hb: z.string().optional().nullable(),
          v1f: z.string().optional().nullable(),
          v1: z.string().optional().nullable(),
          v2f: z.string().optional().nullable(),
          v2: z.string().optional().nullable(),
          dep: z.string().optional().nullable(),
          arr: z.string().optional().nullable(),
          extraVehicles: z.string().optional().nullable(),
          wildFields: z.string().optional().nullable(),
          /** True when the officer chose "Add new HB" / "Add new V1" over
           * "Edit current" — archives the current hbf/v1f as "Previous"
           * before this update applies. See TargetRegistry.tsx. */
          isNewAddress: z.boolean().optional(),
          isNewVehicle: z.boolean().optional(),
          /** Stable `id`s (see ExtraAddress/ExtraVehicle) of extra
           * address/vehicle entries where the officer chose "Add new"
           * over "Edit current" — same archiving behaviour, per entry. */
          newExtraAddressIds: z.array(z.string()).optional(),
          newExtraVehicleIds: z.array(z.string()).optional(),
          ...structuredTargetFieldsSchema,
          ...targetStatusFieldsSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        const {
          id,
          isNewAddress,
          isNewVehicle,
          newExtraAddressIds,
          newExtraVehicleIds,
          ...data
        } = input;
        return updateTarget(id, data, {
          isNewAddress,
          isNewVehicle,
          newExtraAddressIds,
          newExtraVehicleIds,
          byCIN: ctx.user.cin ?? undefined,
        });
      }),

    /** Saves the freeform Background written on the Target Registry card.
     * One per target: it shows on the Target profile and on the Operation
     * profile of every operation the target is linked to. Plain text only. */
    setBackground: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          background: z.string().max(TARGET_BACKGROUND_MAX),
          /** "append" adds the text after whatever the target already has
           * (used when a Background typed in Add Target is merged into an
           * existing target); the default replaces it. */
          mode: z.enum(["replace", "append"]).default("replace"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "observer") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Observers can't edit a target's Background.",
          });
        }
        const before = await getTargetById(input.id);
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target not found",
          });
        }
        const existing = before.registryBackground?.trim();
        const next =
          input.mode === "append" && existing
            ? `${existing}\n\n${input.background.trim()}`
            : input.background;
        const saved = await saveTargetBackgroundWithAudit(
          ctx.user,
          before,
          next
        );
        return saved;
      }),

    /** Delete a target from the registry (soft-delete → Recycle Bin) */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await softDeleteTarget(input.id, ctx.user.cin ?? "Unknown");
        return { success: true };
      }),
    hardDelete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTarget(input.id);
        return { success: true };
      }),

    /** Link a target to an operation */
    linkToOperation: protectedProcedure
      .input(z.object({ targetId: z.number(), operationId: z.number() }))
      .mutation(async ({ input }) => {
        await linkTargetToOperation(input.targetId, input.operationId);
        return { success: true };
      }),

    /** Unlink a target from an operation */
    unlinkFromOperation: protectedProcedure
      .input(z.object({ targetId: z.number(), operationId: z.number() }))
      .mutation(async ({ input }) => {
        await unlinkTargetFromOperation(input.targetId, input.operationId);
        return { success: true };
      }),

    /** Get all operations linked to a target */
    getLinkedOperations: protectedProcedure
      .input(z.object({ targetId: z.number() }))
      .query(async ({ input, ctx }) => {
        return filterByIntelligenceScope(
          toAccessUser(ctx.user),
          await getLinkedOperationsForTarget(input.targetId),
          l => l.operationId
        );
      }),

    /** Fuzzy-checks a candidate name against existing targets — backs the "possible duplicate" prompt when adding a new target. */
    findPossibleDuplicate: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          excludeId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return findPossibleDuplicateTarget(input.name, input.excludeId);
      }),

    /** Same fuzzy check as findPossibleDuplicate above, but against the
     * combined Target + Associate registry — used by the document-import
     * pipeline, where a parsed name (target or associate) could already
     * be on file as either kind. */
    findPossibleDuplicatePerson: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          excludeTargetId: z.number().optional(),
          excludeAssociateId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return findPossibleDuplicatePerson(input.name, {
          targetId: input.excludeTargetId,
          associateId: input.excludeAssociateId,
        });
      }),

    /** Applies officer-resolved field choices when a new target entry is merged into an existing one instead of creating a duplicate. */
    mergeFieldDetails: protectedProcedure
      .input(
        z.object({
          targetId: z.number(),
          resolutions: z.array(
            z.object({
              field: z.enum([
                "name",
                "tgt",
                "hbf",
                "hb",
                "v1f",
                "v1",
                "dep",
                "arr",
              ]),
              value: z.string(),
              discarded: z.string().optional(),
            })
          ),
          appendExtraVehicles: z
            .array(z.object({ full: z.string(), short: z.string() }))
            .optional(),
          appendWildFields: z
            .array(z.object({ label: z.string(), value: z.string() }))
            .optional(),
          appendExtraAddresses: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                businessName: z.string(),
                unitNo: z.string(),
                houseNo: z.string(),
                streetName: z.string(),
                streetType: z.string(),
                suburb: z.string(),
                state: z.string(),
                full: z.string(),
                short: z.string(),
              })
            )
            .optional(),
          // Every target must belong to at least one operation — merging
          // into an existing target doesn't exempt it from that, and if
          // the existing target isn't already linked to the operation the
          // officer picked on AddTargetDialog's OperationPicker, this is
          // what creates that link.
          linkToOperationId: z.number(),
          // The document's free-text narrative, when this merge came from
          // a document import — stored on the (target, operation) link
          // the same way a plain create would.
          background: z.string().optional().nullable(),
          // See target.registry.create's documentSnapshotJson.
          documentSnapshotJson: z.string().optional().nullable(),
          documentSourceFileName: z.string().optional().nullable(),
          documentSourceFileBase64: z.string().optional().nullable(),
          documentSourceFileMimeType: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await mergeTargetFieldDetails(
          input.targetId,
          input.resolutions,
          input.appendExtraVehicles ?? [],
          input.appendWildFields ?? [],
          ctx.user.cin ?? null,
          input.appendExtraAddresses ?? []
        );
        await linkTargetToOperation(
          input.targetId,
          input.linkToOperationId,
          input.background
        );
        if (input.documentSnapshotJson) {
          let sourceFileUrl: string | null = null;
          let renderablePdfUrl: string | null = null;
          if (input.documentSourceFileBase64) {
            const stored = await storeTargetDocumentSourceFile({
              targetId: input.targetId,
              fileName: input.documentSourceFileName,
              base64: input.documentSourceFileBase64,
              mimeType: input.documentSourceFileMimeType,
            });
            sourceFileUrl = stored.sourceFileUrl;
            renderablePdfUrl = stored.renderablePdfUrl;
          }
          await recordTargetDocumentImport({
            targetId: input.targetId,
            operationId: input.linkToOperationId,
            uploadedByCIN: ctx.user.cin ?? null,
            snapshotJson: input.documentSnapshotJson,
            sourceFileName: input.documentSourceFileName,
            sourceFileUrl,
            renderablePdfUrl,
          });
        }
        return result;
      }),

    /** "Previous" values recorded when a field was resolved in favor of the other side during a merge — never deleted, just superseded. */
    getFieldHistory: protectedProcedure
      .input(z.object({ targetId: z.number() }))
      .query(async ({ input }) => {
        return getTargetFieldHistory(input.targetId);
      }),

    /** Every document import recorded against one operation, across all
     * its targets — backs the Operation profile's "Imported Documents"
     * panel. */
    documentImportsForOperation: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        return listTargetDocumentImportsForOperation(input.operationId);
      }),

    /** Every document import recorded for one target — across all its
     * operations when operationId is omitted, or scoped to one when given.
     * Backs the Target profile background panel's version history. */
    documentImportsForTarget: protectedProcedure
      .input(
        z.object({ targetId: z.number(), operationId: z.number().optional() })
      )
      .query(async ({ input }) => {
        return listTargetDocumentImportsForTarget(
          input.targetId,
          input.operationId
        );
      }),

    /** Parses an uploaded .docx or .pdf target-profile document into a
     * proposed set of structured fields for the review screen (see
     * server/documentImport/) — deterministic table/text parsing only,
     * no AI/LLM call, per CLAUDE.md's Golden Rule. Nothing is persisted
     * here — the officer reviews and confirms the parsed fields, then
     * saves through the normal create/update mutations above, which are
     * what actually store the original file's bytes (see
     * documentSourceFileBase64 on target.registry.create). Which reader
     * runs is decided by the
     * uploaded file's own name — the client never asks the officer to
     * choose a document type. */
    parseDocument: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1),
          dataBase64: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const startedAt = Date.now();
        const buffer = Buffer.from(input.dataBase64, "base64");
        const isPdf = /\.pdf$/i.test(input.fileName);
        const read = isPdf
          ? await readPdfText(buffer)
          : await readDocxTables(buffer);
        if (read.tables.length === 0 && read.paragraphs.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: isPdf
              ? "Couldn't read any text in this PDF — it may be a scanned image with no selectable text, which isn't supported yet."
              : "Couldn't read this file as a Word document (.docx).",
          });
        }
        const readMs = Date.now() - startedAt;
        const mapped = mapDocumentToTargetProfile(read);

        // Local AI Roadmap Step 3 — additive only, never replaces what
        // the rule-based mapper above already produced, and never shown
        // unverified: every model reply is re-parsed through the same
        // deterministic parsers the rest of this pipeline trusts before
        // it's returned (documentAIVerify.ts's verifyAISuggestion) — "AI
        // proposes, deterministic code disposes". One shared call budget
        // (MAX_AI_CALLS) across both passes so a pathological document
        // can't turn one upload into dozens of sequential model
        // inference calls on a resource-constrained droplet — run one at
        // a time, not in parallel, for the same reason. Tightened from
        // the previous model's budget of 10 now that each call is
        // against a meaningfully heavier model:
        //   1. needsReview items — text the rules recognised as clearly
        //      meant to be an address/vehicle but couldn't parse at all.
        //      Extractive task — there's no existing reading to compare
        //      against, so the outcome is only ever "declined" or
        //      "suggested", never "confirmed".
        //   2. Low-confidence pass — an address/vehicle the rules DID
        //      parse but flagged !confident (see ParsedAddressLine /
        //      ParsedVehicleLine's own doc comments) gets independently
        //      re-checked too, since "the rules produced something" and
        //      "the rules got it right" aren't the same guarantee — a
        //      confident field is trusted as-is and never re-checked
        //      here, keeping this to the genuinely shaky subset rather
        //      than re-running the model over the whole document.
        //      Verify-and-correct task — the model is told the rules'
        //      own reading and asked to confirm or correct it, so this
        //      pass alone can come back "confirmed" (AI independently
        //      agrees with the rules).
        const MAX_AI_CALLS = 8;
        // The owner's switch (Access Management → Document AI): off skips the
        // whole AI step, so imports use only the rules' own reading.
        const aiSwitchedOn = await getBoolSetting(DOCUMENT_AI_SETTING, true);
        const aiModelStatus: "ready" | "missing" | "incomplete" | "off" =
          aiSwitchedOn ? await getDocumentAIModelStatus() : "off";
        let aiCallsUsed = 0;

        const aiSuggestions: Array<{
          kind: "address" | "vehicle";
          label: string;
          raw: string;
          outcome: AIAssistOutcome;
        }> = [];
        // Parallel to mapped.addresses/mapped.vehicles — "declined" at
        // an index also covers "not checked" (confident, or the call
        // budget ran out), since both mean the same thing to the review
        // screen: nothing to show beyond the rules' own reading.
        const addressAiOutcomes: AIAssistOutcome[] = [];
        const vehicleAiOutcomes: AIAssistOutcome[] = [];

        // The AI pass has a total time limit (see documentImport/aiBudget.ts):
        // past it, or while an earlier document's model call is still
        // running, the remaining checks are simply not made ("declined"),
        // and the rules' own reading is returned as it always is.
        const aiDeadline = Date.now() + AI_TIME_BUDGET_MS;
        const aiStartedAt = Date.now();
        let aiSkipped: "budget" | "busy" | "error" | null = null;
        const askModel = async (
          call: () => Promise<string | null>
        ): Promise<string | null> => {
          if (aiSkipped === "budget" || aiSkipped === "busy") return null;
          const r = await withinBudget(aiDeadline, call);
          if (r.ok) return r.value;
          aiSkipped = r.reason;
          return null;
        };

        if (aiModelStatus === "ready") {
          for (const item of mapped.needsReview) {
            if (aiCallsUsed >= MAX_AI_CALLS) break;
            aiCallsUsed++;
            const raw = await askModel(() =>
              suggestExtractedValue(item.kind, item.label, item.raw)
            );
            const outcome: AIAssistOutcome = raw
              ? verifyAISuggestion(item.kind, raw, null)
              : { status: "declined" };
            aiSuggestions.push({
              kind: item.kind,
              label: item.label,
              raw: item.raw,
              outcome,
            });
          }
          for (const a of mapped.addresses) {
            if (a.confident || aiCallsUsed >= MAX_AI_CALLS) {
              addressAiOutcomes.push({ status: "declined" });
              continue;
            }
            aiCallsUsed++;
            const currentValue = composeParsedValue("address", a);
            const raw = await askModel(() =>
              suggestVerifiedCorrection("address", a.label, a.raw, currentValue)
            );
            addressAiOutcomes.push(
              raw
                ? verifyAISuggestion("address", raw, currentValue)
                : { status: "declined" }
            );
          }
          for (const v of mapped.vehicles) {
            if (v.confident || aiCallsUsed >= MAX_AI_CALLS) {
              vehicleAiOutcomes.push({ status: "declined" });
              continue;
            }
            aiCallsUsed++;
            const currentValue = composeParsedValue("vehicle", v);
            const raw = await askModel(() =>
              suggestVerifiedCorrection("vehicle", "", v.raw, currentValue)
            );
            vehicleAiOutcomes.push(
              raw
                ? verifyAISuggestion("vehicle", raw, currentValue)
                : { status: "declined" }
            );
          }
        } else {
          mapped.addresses.forEach(() =>
            addressAiOutcomes.push({ status: "declined" })
          );
          mapped.vehicles.forEach(() =>
            vehicleAiOutcomes.push({ status: "declined" })
          );
        }

        const countOutcomes = (o: AIAssistOutcome[]) => ({
          confirmed: o.filter(x => x.status === "confirmed").length,
          suggested: o.filter(x => x.status === "suggested").length,
        });
        const oc = [
          countOutcomes(aiSuggestions.map(x => x.outcome)),
          countOutcomes(addressAiOutcomes),
          countOutcomes(vehicleAiOutcomes),
        ];
        recordAiImport({
          mode:
            aiModelStatus === "off"
              ? "off"
              : aiModelStatus === "ready"
                ? "ran"
                : "unavailable",
          calls: aiCallsUsed,
          confirmed: oc.reduce((n, x) => n + x.confirmed, 0),
          suggested: oc.reduce((n, x) => n + x.suggested, 0),
          stoppedEarly: aiSkipped === "budget" || aiSkipped === "busy",
          aiMs: Date.now() - aiStartedAt,
          totalMs: Date.now() - startedAt,
        });

        console.log(
          `[ImportTarget] ${input.fileName} (${Math.round(buffer.length / 1024)} KB): ` +
            `read ${readMs} ms, AI model ${aiModelStatus}, ${aiCallsUsed} AI check(s) ` +
            `in ${Date.now() - aiStartedAt} ms${aiSkipped ? ` (stopped early: ${aiSkipped})` : ""}, ` +
            `total ${Date.now() - startedAt} ms`
        );

        return {
          ...mapped,
          aiModelStatus,
          aiSuggestions,
          addressAiOutcomes,
          vehicleAiOutcomes,
        };
      }),
  }),
});
