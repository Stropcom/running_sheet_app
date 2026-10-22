import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveTrackedTarget } from "@shared/trackedTarget";
import { filterByOperationAccess, toAccessUser } from "../operationAccess";
import {
  buildRunningSheetTitle,
  getTargetTitleBracket,
} from "@shared/runningSheetTitle";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  createRunningSheet,
  recomputeRunningSheetTitle,
  deleteRunningSheet,
  getAllUsers,
  getCertificationsByRowIds,
  getMembersByRowIds,
  getOperationById,
  getRowsBySheetId,
  getRunningSheetById,
  setContinuityDismissal,
  getRunningSheets,
  getRunningSheetsByOperation,
  getRunningSheetsByOperations,
  updateRunningSheet,
  getCinCertStatusForSheet,
  getOutstandingSheetsForCin,
  getTargetById,
  getGovernanceRecord,
  upsertGovernanceRecord,
  computeGovernancePercent,
  computeAllRowsSigned,
  getGovernanceTodoForCin,
  getUnlinkedImagesTodoForCin,
  linkTargetToOperation,
  closeSheet,
  reopenSheet,
  copyRunningSheet,
  moveRunningSheet,
  softDeleteSheet,
  getDismissedFindingKeys,
  dismissScanFinding,
} from "../db";
import { checkRunningSheet } from "../sheetCheck";

import {
  certifierOrAdminProcedure,
  adminProcedure,
  guardActiveOperation,
  guardActiveSheet,
} from "./_helpers";

export const sheetRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return filterByOperationAccess(
      toAccessUser(ctx.user),
      await getRunningSheets(),
      s => s.operationId
    );
  }),

  listByOperation: protectedProcedure
    .input(z.object({ operationId: z.number() }))
    .query(async ({ input }) => {
      return getRunningSheetsByOperation(input.operationId);
    }),

  listByOperations: protectedProcedure
    .input(z.object({ operationIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      return getRunningSheetsByOperations(input.operationIds);
    }),

  /** Stops or resumes tracking one continuity card ("Where now" band) on
   * a sheet — shared by everyone on it. rowId null resumes. */
  setContinuityDismissal: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        key: z.string().min(1).max(200),
        rowId: z.number().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      return setContinuityDismissal(input.sheetId, input.key, input.rowId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const sheet = await getRunningSheetById(input.id);
      if (!sheet)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sheet not found.",
        });
      return sheet;
    }),

  /** What this sheet tracks — a person (by surname), a vehicle (by rego) or
   * a location — worked out from its linked Target Registry entry by the
   * one shared rule (shared/trackedTarget.ts). The sheet's tracker cards,
   * the map's location flag and the map popup all read this, so they agree
   * on what the target is. Null when the sheet has no trackable target. */
  trackedTarget: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      const sheet = await getRunningSheetById(input.sheetId);
      if (!sheet) return null;
      const target = sheet.targetId
        ? await getTargetById(sheet.targetId)
        : undefined;
      return resolveTrackedTarget({ title: sheet.title, target });
    }),

  create: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        sheetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        targetId: z.number().optional().nullable(),
        sheetCins: z
          .array(
            z.object({
              cin: z.string(),
              hasImages: z.boolean(),
              isTeamLeader: z.boolean().optional(),
              isAuthor: z.boolean().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await guardActiveOperation(input.operationId);
      // A target is always created (with full structured detail) via the
      // Add Target dialog before this runs — here we only ever link an
      // already-real target, never create one from a bare name.
      if (input.targetId) {
        await linkTargetToOperation(input.targetId, input.operationId);
      }
      // Title is auto-generated (DATE - AUTHOR CIN - OPERATION (TARGET)),
      // never free-typed — see shared/runningSheetTitle.ts. Missing pieces
      // (no author yet, no target) are left out, not blocked on.
      const [operation, target] = await Promise.all([
        getOperationById(input.operationId),
        input.targetId ? getTargetById(input.targetId) : null,
      ]);
      const authorCIN = input.sheetCins?.find(c => c.isAuthor)?.cin ?? null;
      const title = buildRunningSheetTitle({
        sheetDate: input.sheetDate,
        authorCIN,
        operationName: operation?.name ?? "Untitled Operation",
        targetBracketLabel: getTargetTitleBracket(target ?? null),
      });
      const id = await createRunningSheet({
        operationId: input.operationId,
        title,
        sheetDate: input.sheetDate,
        targetId: input.targetId ?? null,
        targetName: null,
        sheetCins: input.sheetCins ? JSON.stringify(input.sheetCins) : null,
        createdBy: ctx.user.id,
      });
      await createAuditLog({
        sheetId: id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_created",
        details: `Sheet "${title}" created`,
        createdAt: Date.now(),
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        sheetDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        sheetCins: z
          .array(
            z.object({
              cin: z.string(),
              hasImages: z.boolean(),
              isTeamLeader: z.boolean().optional(),
              isAuthor: z.boolean().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await guardActiveSheet(input.id);
      const { id, sheetCins, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      // Validate roster CINs against registered users
      if (sheetCins && sheetCins.length > 0) {
        const allRegisteredUsers = await getAllUsers();
        const registeredCins = new Set(
          allRegisteredUsers.map(u => u.cin.toUpperCase())
        );
        const invalid = sheetCins.filter(
          e => !registeredCins.has(e.cin.toUpperCase())
        );
        if (invalid.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The following CINs are not registered users: ${invalid.map(e => e.cin).join(", ")}`,
          });
        }
      }
      if (sheetCins !== undefined) data.sheetCins = JSON.stringify(sheetCins);
      await updateRunningSheet(id, data);
      // Title is auto-generated — resync it whenever anything it's built
      // from (date, author) changes.
      if (sheetCins !== undefined || input.sheetDate !== undefined) {
        await recomputeRunningSheetTitle(id);
      }
      await createAuditLog({
        sheetId: id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_updated",
        details: `Sheet updated`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await softDeleteSheet(input.id, ctx.user.cin ?? "Unknown");
      await createAuditLog({
        sheetId: input.id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_deleted",
        details: `Sheet moved to Recycle Bin`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  hardDelete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteRunningSheet(input.id);
      await createAuditLog({
        sheetId: input.id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_deleted",
        details: `Sheet permanently deleted`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  /** Returns per-CIN certification status for a sheet's TEAM roster. */
  cinCertStatus: protectedProcedure
    .input(z.object({ sheetId: z.number(), cins: z.array(z.string()) }))
    .query(async ({ input }) => {
      return getCinCertStatusForSheet(input.sheetId, input.cins);
    }),

  /**
   * Returns all sheets that have uncertified rows for the current user's CIN.
   * Used by the To-Do page.
   */
  outstandingForMe: protectedProcedure.query(async ({ ctx }) => {
    const cin = ctx.user.cin;
    if (!cin) return [];
    return filterByOperationAccess(
      toAccessUser(ctx.user),
      await getOutstandingSheetsForCin(cin),
      s => s.operationId
    );
  }),

  governanceTodo: protectedProcedure.query(async ({ ctx }) => {
    const cin = ctx.user.cin;
    if (!cin) return [];
    return filterByOperationAccess(
      toAccessUser(ctx.user),
      await getGovernanceTodoForCin(cin),
      s => s.operationId
    );
  }),

  /**
   * Returns sheets authored by the current CIN that have photo attachments
   * not yet linked to an Intelligence entity. Used by the To-Do page.
   */
  unlinkedImagesTodo: protectedProcedure.query(async ({ ctx }) => {
    const cin = ctx.user.cin;
    if (!cin) return [];
    return getUnlinkedImagesTodoForCin(cin);
  }),

  close: certifierOrAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const sheet = await getRunningSheetById(input.id);
      if (!sheet)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sheet not found.",
        });
      if (sheet.closedAt)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sheet is already closed.",
        });

      // ── Permission: only Team Leader CIN or Admin can close ────────────────
      if (ctx.user.role !== "admin") {
        const userCin = ctx.user.cin ?? "";
        let sheetCins: { cin: string; isTeamLeader?: boolean }[] = [];
        try {
          sheetCins = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
        } catch {
          sheetCins = [];
        }
        const isTeamLeader = sheetCins.some(
          c => c.isTeamLeader && c.cin === userCin
        );
        if (!isTeamLeader) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the listed Team Leader or an Admin can close this running sheet.",
          });
        }
      }

      // ── Validate all rows are certified ────────────────────────────────────
      const rows = await getRowsBySheetId(input.id);
      const rowIds = rows.map(r => r.id);
      let allSigned = false;
      if (rowIds.length > 0) {
        const [members, certs] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
        ]);
        allSigned = computeAllRowsSigned(rows, members, certs);
      } else {
        // No rows — treat as all signed (empty sheet)
        allSigned = true;
      }

      if (!allSigned) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All rows must be certified before closing.",
        });
      }

      // ── Validate governance is 100% ────────────────────────────────────────
      const govRecord = await getGovernanceRecord(input.id);
      const govPercent = computeGovernancePercent(govRecord, allSigned);
      if (govPercent < 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Governance must be 100% complete before closing.",
        });
      }

      const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
      await closeSheet(input.id, cin);
      await createAuditLog({
        sheetId: input.id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_closed",
        details: `Sheet closed by ${cin}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  reopen: certifierOrAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const sheet = await getRunningSheetById(input.id);
      if (!sheet)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sheet not found.",
        });
      if (!sheet.closedAt)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sheet is not closed.",
        });
      await reopenSheet(input.id);
      // Reset operative section checkboxes — sheet has changed so they must be re-verified
      await upsertGovernanceRecord({
        sheetId: input.id,
        savedInOpFolder: false,
        savedInInvestigatorTransferDrive: false,
        savedInOpFolderCIN: null,
        savedInInvestigatorTransferDriveCIN: null,
      });
      const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
      await createAuditLog({
        sheetId: input.id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_reopened",
        details: `Sheet reopened by ${cin}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  /**
   * Move a running sheet to a different operation.
   * The sheet itself (rows, members, governance) is unchanged — only its operationId changes.
   */
  move: certifierOrAdminProcedure
    .input(
      z.object({
        sheetId: z.number(),
        targetOperationId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await getRunningSheetById(input.sheetId);
      if (!sheet)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Running sheet not found.",
        });
      if (sheet.operationId === input.targetOperationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sheet is already in that operation.",
        });
      }
      await moveRunningSheet(input.sheetId, input.targetOperationId);
      const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
      await createAuditLog({
        sheetId: input.sheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_moved",
        details: `Sheet moved to operation ${input.targetOperationId} by ${cin}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  /**
   * Copy a running sheet (and all its rows + row_members) to a different operation.
   * Certifications and governance records are NOT copied — the copy starts fresh.
   * Returns the new sheet ID.
   */
  copy: certifierOrAdminProcedure
    .input(
      z.object({
        sheetId: z.number(),
        targetOperationId: z.number(),
        newTitle: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await getRunningSheetById(input.sheetId);
      if (!sheet)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Running sheet not found.",
        });
      const newSheetId = await copyRunningSheet(
        input.sheetId,
        input.targetOperationId,
        ctx.user.id,
        input.newTitle
      );
      const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
      await createAuditLog({
        sheetId: newSheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_copied",
        details: `Sheet copied from sheet ${input.sheetId} to operation ${input.targetOperationId} by ${cin}`,
        createdAt: Date.now(),
      });
      return { success: true, newSheetId };
    }),

  /** "Check Running Sheet" — an on-demand report any logged-in author can
   * run against their own sheet, at any point (not just an admin-only
   * whole-folder scan) — see sheetCheck.ts for the four rule-based
   * categories this covers. Nothing here changes automatically; every
   * finding is the author's to act on or dismiss. */
  check: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      const allFindings = await checkRunningSheet(input.sheetId);
      const dismissed = await getDismissedFindingKeys();
      const findings = allFindings.filter(
        f => !dismissed.has(`${f.ruleId}::${f.findingKey}`)
      );
      return { findings };
    }),

  /** Dismisses one "Check Running Sheet" finding — reuses the same
   * (ruleId, findingKey) dismissal table the admin-only Intelligence
   * Scan already uses (see intelligence.dismissScanFinding); a
   * formatting/registry finding dismissed here is also dismissed there,
   * since it's the same underlying rule, just viewed scoped to one
   * sheet. */
  dismissCheckFinding: protectedProcedure
    .input(z.object({ ruleId: z.string(), findingKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await dismissScanFinding(input.ruleId, input.findingKey, ctx.user.cin);
      return { success: true };
    }),
});
