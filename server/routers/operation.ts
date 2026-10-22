import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COMMAND_CODES, COMMAND_LABELS } from "@shared/commands";
import {
  filterByOperationAccess,
  invalidateAccessCache,
  operationsForUser,
  operationsForMap,
  toAccessUser,
} from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import {
  autoArchiveEligibleOperations,
  createAuditLog,
  createOperation,
  recomputeRunningSheetTitlesForOperation,
  getInvestigatorAllowedOperationIds,
  deleteOperation,
  updateOperation,
  getOperationById,
  getOperations,
  deepSearchOperations,
  getOperationDeleteStats,
  getOperationsByStatus,
  getAllOperations,
  setOperationStatus,
  softDeleteOperation,
} from "../db";

import { adminProcedure } from "./_helpers";

export const operationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await autoArchiveEligibleOperations();
    const all = await getOperations();
    if (ctx.user.role !== "investigator")
      return operationsForUser(toAccessUser(ctx.user), all);
    const allowed = new Set(getInvestigatorAllowedOperationIds(ctx.user));
    return operationsForUser(
      toAccessUser(ctx.user),
      all.filter(op => allowed.has(op.id))
    );
  }),

  /** Operations the Mapping page offers: what they can open, plus what was
   * shared at Investigator level (those carry mapOnly: true). */
  listForMap: protectedProcedure.query(async ({ ctx }) => {
    const all = await getOperations();
    if (ctx.user.role !== "investigator")
      return operationsForMap(toAccessUser(ctx.user), all);
    const allowed = new Set(getInvestigatorAllowedOperationIds(ctx.user));
    return operationsForMap(
      toAccessUser(ctx.user),
      all.filter(op => allowed.has(op.id))
    );
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const op = await getOperationById(input.id);
      if (!op)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operation not found.",
        });
      return op;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        promisNumber: z.string().optional(),
        imsNumber: z.string().optional(),
        investigationUnit: z.string().optional(),
        /** Admins only — see the checks below. */
        command: z.enum(COMMAND_CODES).optional(),
        restricted: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      if (!isAdmin && (input.restricted || input.command)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only an admin can set an operation's Command or mark it Restricted.",
        });
      }
      const id = await createOperation({
        name: input.name,
        promisNumber: input.promisNumber ?? null,
        imsNumber: input.imsNumber ?? null,
        investigationUnit: input.investigationUnit ?? null,
        // An operation belongs to its creator's Command unless an admin
        // says otherwise.
        command: input.command ?? ctx.user.command,
        restricted: input.restricted ?? false,
        createdBy: ctx.user.id,
      });
      if (input.restricted) {
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "operation_updated",
          details: `Operation "${input.name}" (ID ${id}) created as Restricted`,
          createdAt: Date.now(),
        });
      }
      invalidateAccessCache();
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        promisNumber: z.string().optional().nullable(),
        imsNumber: z.string().optional().nullable(),
        investigationUnit: z.string().optional().nullable(),
        /** Admins only — see the checks below. */
        command: z.enum(COMMAND_CODES).optional(),
        restricted: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      if (
        (rest.restricted !== undefined || rest.command !== undefined) &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only an admin can set an operation's Command or mark it Restricted.",
        });
      }
      const before =
        rest.restricted !== undefined || rest.command !== undefined
          ? await getOperationById(id)
          : undefined;
      await updateOperation(id, rest);
      invalidateAccessCache();
      if (
        before &&
        ((rest.restricted !== undefined &&
          rest.restricted !== before.restricted) ||
          (rest.command !== undefined && rest.command !== before.command))
      ) {
        const parts: string[] = [];
        if (
          rest.restricted !== undefined &&
          rest.restricted !== before.restricted
        )
          parts.push(
            rest.restricted ? "marked Restricted" : "no longer Restricted"
          );
        if (rest.command !== undefined && rest.command !== before.command)
          parts.push(
            `moved from ${COMMAND_LABELS[before.command]} to ${COMMAND_LABELS[rest.command]}`
          );
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "operation_updated",
          details: `Operation "${before.name}" (ID ${id}) ${parts.join("; ")}`,
          createdAt: Date.now(),
        });
      }
      // The operation name is baked into every sheet's auto-generated
      // title — resync them all when it changes.
      if (rest.name !== undefined) {
        await recomputeRunningSheetTitlesForOperation(id);
      }
      return { success: true };
    }),

  deleteStats: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getOperationDeleteStats(input.id);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await softDeleteOperation(input.id, ctx.user.cin ?? "Unknown");
      return { success: true };
    }),

  hardDelete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteOperation(input.id);
      return { success: true };
    }),

  deepSearch: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      return filterByOperationAccess(
        toAccessUser(ctx.user),
        await deepSearchOperations(input.query),
        m => m.operationId
      );
    }),

  listByStatus: protectedProcedure
    .input(z.object({ status: z.enum(["active", "before_court", "archive"]) }))
    .query(async ({ input, ctx }) => {
      return operationsForUser(
        toAccessUser(ctx.user),
        await getOperationsByStatus(input.status)
      );
    }),

  listAll: protectedProcedure.query(async ({ ctx }) => {
    return operationsForUser(toAccessUser(ctx.user), await getAllOperations());
  }),

  setStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["active", "before_court", "archive"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const op = await getOperationById(input.id);
      if (!op)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operation not found.",
        });
      const result = await setOperationStatus(input.id, input.status);
      if (!result.success) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot change status: the following running sheets are still open: ${result.blockedSheets?.join(", ")}`,
        });
      }
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "operation_status_changed",
        details: `Operation "${op.name}" status changed to "${input.status}" by ${ctx.user.cin ?? "Unknown"}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),
});
