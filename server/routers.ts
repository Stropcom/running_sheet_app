import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addRowMember,
  createAuditLog,
  createCertification,
  createOperation,
  createRunningSheet,
  createSheetRow,
  deactivateAllCertificationsForRow,
  deactivateCertification,
  deleteOperation,
  deleteRunningSheet,
  deleteSheetRow,
  getAllAuditLogs,
  getAllUsers,
  getAuditLogsBySheet,
  getCertificationByMember,
  getCertificationsByRowIds,
  getMembersByRowIds,
  getOperationById,
  getOperations,
  getRowById,
  getRowsBySheetId,
  getRunningSheetById,
  getRunningSheets,
  removeRowMember,
  setRowLocked,
  updateRunningSheet,
  updateSheetRow,
  updateUserRole,
} from "./db";

// ─── Role Guards ──────────────────────────────────────────────────────────────

const certifierOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "certifier" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Certifier or Admin role required." });
  }
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required." });
  }
  return next({ ctx });
});

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Operations ─────────────────────────────────────────────────────────────

  operation: router({
    list: protectedProcedure.query(async () => {
      return getOperations();
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const op = await getOperationById(input.id);
      if (!op) throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found." });
      return op;
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const id = await createOperation({
          name: input.name,
          description: input.description ?? null,
          createdBy: ctx.user.id,
        });
        return { id };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteOperation(input.id);
        return { success: true };
      }),
  }),

  // ─── Running Sheets ─────────────────────────────────────────────────────────

  sheet: router({
    list: protectedProcedure.query(async () => {
      return getRunningSheets();
    }),

    listByOperation: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        const all = await getRunningSheets();
        return all.filter((s) => s.operationId === input.operationId);
      }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const sheet = await getRunningSheetById(input.id);
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
      return sheet;
    }),

    create: protectedProcedure
      .input(z.object({ operationId: z.number(), title: z.string().min(1), description: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const id = await createRunningSheet({
          operationId: input.operationId,
          title: input.title,
          description: input.description ?? null,
          createdBy: ctx.user.id,
        });
        await createAuditLog({
          sheetId: id,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "sheet_created",
          details: `Sheet "${input.title}" created`,
          createdAt: Date.now(),
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string().min(1).optional(), description: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateRunningSheet(id, data);
        await createAuditLog({
          sheetId: id,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "sheet_updated",
          details: `Sheet updated`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteRunningSheet(input.id);
        await createAuditLog({
          sheetId: input.id,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "sheet_deleted",
          details: `Sheet deleted`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
  }),

  // ─── Sheet Rows ─────────────────────────────────────────────────────────────

  row: router({
    listBySheet: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const rows = await getRowsBySheetId(input.sheetId);
        const rowIds = rows.map((r) => r.id);
        const [members, certs] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
        ]);
        return rows.map((row) => ({
          ...row,
          members: members.filter((m) => m.rowId === row.id),
          certifications: certs.filter((c) => c.rowId === row.id),
        }));
      }),

    create: protectedProcedure
      .input(z.object({ sheetId: z.number(), time: z.string().optional(), observation: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const existingRows = await getRowsBySheetId(input.sheetId);
        const nextRowNumber = existingRows.length > 0 ? Math.max(...existingRows.map((r) => r.rowNumber)) + 1 : 1;
        const id = await createSheetRow({
          sheetId: input.sheetId,
          rowNumber: nextRowNumber,
          time: input.time ?? null,
          observation: input.observation ?? null,
          isLocked: false,
        });
        await createAuditLog({
          sheetId: input.sheetId,
          rowId: id,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "row_created",
          details: `Row ${nextRowNumber} created`,
          createdAt: Date.now(),
        });
        return { id, rowNumber: nextRowNumber };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), time: z.string().optional(), observation: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked. Uncertify to edit." });
        const { id, ...data } = input;
        await updateSheetRow(id, data);
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: id,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "row_updated",
          details: `Row ${row.rowNumber} updated`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked. Uncertify to delete." });
        await deleteSheetRow(input.id);
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.id,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "row_deleted",
          details: `Row ${row.rowNumber} deleted`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
  }),

  // ─── Row Members ────────────────────────────────────────────────────────────

  member: router({
    add: protectedProcedure
      .input(z.object({ rowId: z.number(), memberName: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        const id = await addRowMember({ rowId: input.rowId, memberName: input.memberName });
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "member_added",
          details: `Member "${input.memberName}" added to row ${row.rowNumber}`,
          createdAt: Date.now(),
        });
        return { id };
      }),

    remove: protectedProcedure
      .input(z.object({ memberId: z.number(), rowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await removeRowMember(input.memberId);
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "member_removed",
          details: `Member removed from row ${row.rowNumber}`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
  }),

  // ─── Certifications ─────────────────────────────────────────────────────────

  certification: router({
    certify: certifierOrAdminProcedure
      .input(z.object({ rowId: z.number(), memberId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        const existing = await getCertificationByMember(input.rowId, input.memberId);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Member already certified." });

        const now = Date.now();
        await createCertification({
          rowId: input.rowId,
          memberId: input.memberId,
          certifiedByUserId: ctx.user.id,
          certifiedByName: ctx.user.name ?? "Unknown",
          certifiedAt: now,
          isActive: true,
        });

        const [members, certs] = await Promise.all([
          getMembersByRowIds([input.rowId]),
          getCertificationsByRowIds([input.rowId]),
        ]);
        const rowMembers = members.filter((m) => m.rowId === input.rowId);
        const activeCerts = certs.filter((c) => c.rowId === input.rowId && c.isActive);
        const allCertified = rowMembers.length > 0 && rowMembers.every((m) => activeCerts.some((c) => c.memberId === m.id));

        if (allCertified) await setRowLocked(input.rowId, true);

        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          memberId: input.memberId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "certified",
          details: `Member certified by ${ctx.user.name ?? "Unknown"} at ${new Date(now).toISOString()}${allCertified ? " — Row locked" : ""}`,
          createdAt: now,
        });

        return { success: true, rowLocked: allCertified };
      }),

    uncertify: certifierOrAdminProcedure
      .input(z.object({ rowId: z.number(), memberId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        await deactivateCertification(input.rowId, input.memberId);
        await setRowLocked(input.rowId, false);

        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          memberId: input.memberId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "uncertified",
          details: `Certification removed by ${ctx.user.name ?? "Unknown"} — Row unlocked`,
          createdAt: Date.now(),
        });

        return { success: true };
      }),

    uncertifyAll: certifierOrAdminProcedure
      .input(z.object({ rowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        await deactivateAllCertificationsForRow(input.rowId);
        await setRowLocked(input.rowId, false);

        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "uncertified",
          details: `All certifications removed by ${ctx.user.name ?? "Unknown"} — Row unlocked`,
          createdAt: Date.now(),
        });

        return { success: true };
      }),
  }),

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  auditLog: router({
    bySheet: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getAuditLogsBySheet(input.sheetId);
      }),

    all: protectedProcedure.query(async () => {
      return getAllAuditLogs();
    }),
  }),

  // ─── Export ─────────────────────────────────────────────────────────────────

  export: router({
    sheetData: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const sheet = await getRunningSheetById(input.id);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
        const rows = await getRowsBySheetId(input.id);
        const rowIds = rows.map((r) => r.id);
        const [members, certs] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
        ]);
        return {
          sheet,
          rows: rows.map((row) => ({
            ...row,
            members: members.filter((m) => m.rowId === row.id),
            certifications: certs.filter((c) => c.rowId === row.id),
          })),
        };
      }),
  }),

  // ─── Admin ──────────────────────────────────────────────────────────────────

  admin: router({
    listUsers: adminProcedure.query(async () => {
      return getAllUsers();
    }),

    updateUserRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["observer", "certifier", "admin"]) }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
