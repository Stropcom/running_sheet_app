import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import {
  addRowMember,
  createAuditLog,
  createCertification,
  createOperation,
  createRunningSheet,
  createSheetRow,
  createUser,
  deactivateAllCertificationsForRow,
  deactivateCertification,
  deleteOperation,
  updateOperation,
  deleteRunningSheet,
  deleteSheetRow,
  deleteUser,
  getAllAuditLogs,
  getAllUsers,
  getAuditLogsBySheet,
  getCertificationByMember,
  getCertificationsByRowIds,
  getMembersByCINAndSheet,
  getMembersByRowIds,
  getOperationById,
  getOperations,
  getRowById,
  getRowsBySheetId,
  getRunningSheetById,
  getRunningSheets,
  getRunningSheetsByOperation,
  getUserById,
  getUserByUsername,
  removeRowMember,
  setRowLocked,
  updateRunningSheet,
  updateSheetRow,
  updateUser,
  updateUserRole,
  getCinCertStatusForSheet,
  getOutstandingSheetsForCin,
  getTargetsByOperation,
  createTarget,
  updateTarget,
  deleteTarget,
  setSheetTarget,
  deepSearchOperations,
  getAllIntelligenceEntities,
  listShortcuts,
  createShortcut,
  updateShortcut,
  deleteShortcut,
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

  // ─── Profile ─────────────────────────────────────────────────────────────────

  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      // Never return passwordHash to the client
      const { passwordHash: _ph, ...safe } = user;
      return safe;
    }),

    updatePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(1, "New password is required."),
        confirmPassword: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.newPassword !== input.confirmPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "New passwords do not match." });
        }
        const user = await getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
        const newHash = await bcrypt.hash(input.newPassword, 12);
        await updateUser(ctx.user.id, { passwordHash: newHash });
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_updated",
          details: `User ${ctx.user.name} changed their password`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
  }),


  // ─── Auth ────────────────────────────────────────────────────────────────────

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByUsername(input.username.trim().toLowerCase());
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });

        // Create session token using the existing SDK (using username as openId-equivalent)
        const sessionToken = await sdk.createSessionToken(user.username, {
          name: user.name,
          expiresInMs: 365 * 24 * 60 * 60 * 1000,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });

        // Audit login
        await createAuditLog({
          sheetId: 0,
          userId: user.id,
          userName: user.name,
          userCIN: user.cin,
          action: "user_login",
          details: `User ${user.name} (CIN: ${user.cin}) logged in`,
          createdAt: Date.now(),
        });

        return {
          success: true,
          user: {
            id: user.id,
            name: user.name,
            cin: user.cin,
            unit: user.unit,
            role: user.role,
            username: user.username,
          },
        };
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user) {
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_logout",
          details: `User ${ctx.user.name} logged out`,
          createdAt: Date.now(),
        });
      }
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
      .input(z.object({
        name: z.string().min(1),
        promisNumber: z.string().optional(),
        imsNumber: z.string().optional(),
        investigationUnit: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createOperation({
          name: input.name,
          promisNumber: input.promisNumber ?? null,
          imsNumber: input.imsNumber ?? null,
          investigationUnit: input.investigationUnit ?? null,
          createdBy: ctx.user.id,
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        promisNumber: z.string().optional().nullable(),
        imsNumber: z.string().optional().nullable(),
        investigationUnit: z.string().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await updateOperation(id, rest);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteOperation(input.id);
        return { success: true };
      }),

    deepSearch: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return deepSearchOperations(input.query);
      }),
  }),

  // ─── Running Sheets ──────────────────────────────────────────────────────────

  sheet: router({
    list: protectedProcedure.query(async () => {
      return getRunningSheets();
    }),

    listByOperation: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        return getRunningSheetsByOperation(input.operationId);
      }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const sheet = await getRunningSheetById(input.id);
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
      return sheet;
    }),

    create: protectedProcedure
      .input(z.object({
        operationId: z.number(),
        title: z.string().min(1),
        targetId: z.number().optional().nullable(),
        sheetCins: z.array(z.object({ cin: z.string(), hasImages: z.boolean(), isTeamLeader: z.boolean().optional(), isAuthor: z.boolean().optional() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createRunningSheet({
          operationId: input.operationId,
          title: input.title,
          targetId: input.targetId ?? null,
          sheetCins: input.sheetCins ? JSON.stringify(input.sheetCins) : null,
          createdBy: ctx.user.id,
        });
        await createAuditLog({ sheetId: id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_created", details: `Sheet "${input.title}" created`, createdAt: Date.now() });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        targetName: z.string().optional().nullable(),
        sheetCins: z.array(z.object({ cin: z.string(), hasImages: z.boolean(), isTeamLeader: z.boolean().optional(), isAuthor: z.boolean().optional() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, sheetCins, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };
        if (sheetCins !== undefined) data.sheetCins = JSON.stringify(sheetCins);
        await updateRunningSheet(id, data);
        await createAuditLog({ sheetId: id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_updated", details: `Sheet updated`, createdAt: Date.now() });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteRunningSheet(input.id);
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_deleted", details: `Sheet deleted`, createdAt: Date.now() });
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
      return getOutstandingSheetsForCin(cin);
    }),
  }),

  // ─── Sheet Rows ──────────────────────────────────────────────────────────────

  row: router({
    list: protectedProcedure
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
          certifications: certs.filter((c) => c.rowId === row.id && c.isActive),
        }));
      }),

    create: protectedProcedure
      .input(z.object({ sheetId: z.number(), time: z.string().optional(), observation: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const existingRows = await getRowsBySheetId(input.sheetId);
        const rowNumber = existingRows.length + 1;
        const id = await createSheetRow({ sheetId: input.sheetId, rowNumber, time: input.time, observation: input.observation, isLocked: false });
        await createAuditLog({ sheetId: input.sheetId, rowId: id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "row_created", details: `Row ${rowNumber} created`, createdAt: Date.now() });
        return { id, rowNumber };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), time: z.string().optional(), timeMinutes: z.number().optional(), observation: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked. Uncertify to edit." });
        const { id, ...data } = input;
        await updateSheetRow(id, data);
        await createAuditLog({ sheetId: row.sheetId, rowId: id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "row_updated", details: `Row updated`, createdAt: Date.now() });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await deleteSheetRow(input.id);
        await createAuditLog({ sheetId: row.sheetId, rowId: input.id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "row_deleted", details: `Row deleted`, createdAt: Date.now() });
        return { success: true };
      }),
  }),

  // ─── Row Members ─────────────────────────────────────────────────────────────

  member: router({
    add: protectedProcedure
      .input(z.object({ rowId: z.number(), memberName: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        const id = await addRowMember({ rowId: input.rowId, memberName: input.memberName });
        await createAuditLog({ sheetId: row.sheetId, rowId: input.rowId, memberId: id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "member_added", details: `CIN ${input.memberName} added to row`, createdAt: Date.now() });
        return { id };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number(), rowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await removeRowMember(input.id);
        await createAuditLog({ sheetId: row.sheetId, rowId: input.rowId, memberId: input.id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "member_removed", details: `CIN removed from row`, createdAt: Date.now() });
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
        const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        await createCertification({
          rowId: input.rowId,
          memberId: input.memberId,
          certifiedByUserId: ctx.user.id,
          certifiedByName: ctx.user.name ?? "Unknown",
          certifiedByCIN: certifierCIN,
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
          userCIN: certifierCIN,
          action: "certified",
          details: `Certified by ${ctx.user.name} (CIN: ${certifierCIN}) at ${new Date(now).toISOString()}${allCertified ? " — Row locked" : ""}`,
          createdAt: now,
        });

        return { success: true, rowLocked: allCertified };
      }),

    certifyAllForCin: certifierOrAdminProcedure
      .input(z.object({ sheetId: z.number(), cin: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const members = await getMembersByCINAndSheet(input.sheetId, input.cin);
        const uncertifiedMembers = [];
        for (const member of members) {
          if (member.rowIsLocked) continue; // skip already fully-locked rows
          const existing = await getCertificationByMember(member.rowId, member.id);
          if (existing) continue; // already certified
          uncertifiedMembers.push(member);
        }

        const now = Date.now();
        const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        let certifiedCount = 0;

        for (const member of uncertifiedMembers) {
          await createCertification({
            rowId: member.rowId,
            memberId: member.id,
            certifiedByUserId: ctx.user.id,
            certifiedByName: ctx.user.name ?? "Unknown",
            certifiedByCIN: certifierCIN,
            certifiedAt: now,
            isActive: true,
          });
          certifiedCount++;

          // Check if this row is now fully certified and should be locked
          const [rowMembers, rowCerts] = await Promise.all([
            getMembersByRowIds([member.rowId]),
            getCertificationsByRowIds([member.rowId]),
          ]);
          const allCertified = rowMembers.length > 0 && rowMembers.every((m) =>
            rowCerts.some((c) => c.memberId === m.id && c.isActive)
          );
          if (allCertified) await setRowLocked(member.rowId, true);

          const row = await getRowById(member.rowId);
          if (row) {
            await createAuditLog({
              sheetId: input.sheetId,
              rowId: member.rowId,
              memberId: member.id,
              userId: ctx.user.id,
              userName: ctx.user.name ?? "Unknown",
              userCIN: certifierCIN,
              action: "certified",
              details: `Bulk certified by ${ctx.user.name} (CIN: ${certifierCIN}) for CIN ${input.cin}${allCertified ? " — Row locked" : ""}`,
              createdAt: now,
            });
          }
        }

        return { success: true, certifiedCount };
      }),

    uncertify: certifierOrAdminProcedure
      .input(z.object({ rowId: z.number(), memberId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        await deactivateCertification(input.rowId, input.memberId);
        await setRowLocked(input.rowId, false);

        const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          memberId: input.memberId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: certifierCIN,
          action: "uncertified",
          details: `Certification removed by ${ctx.user.name} (CIN: ${certifierCIN}) — Row unlocked`,
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

        const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: certifierCIN,
          action: "uncertified",
          details: `All certifications removed by ${ctx.user.name} (CIN: ${certifierCIN}) — Row unlocked`,
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
        const operation = sheet.operationId ? await getOperationById(sheet.operationId) : null;
        const rows = await getRowsBySheetId(input.id);
        const rowIds = rows.map((r) => r.id);
        const [members, certs] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
        ]);
        return {
          sheet,
          operation,
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

    createUser: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        cin: z.string().min(1),
        unit: z.string().optional(),
        team: z.enum(["TEAM1", "TEAM2", "PTT"]).optional(),
        username: z.string().min(1),
        password: z.string().min(1),
        role: z.enum(["observer", "certifier", "admin"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const passwordHash = await bcrypt.hash(input.password, 12);
        const id = await createUser({
          name: input.name,
          cin: input.cin.toUpperCase(),
          unit: input.unit,
          team: input.team,
          username: input.username.trim().toLowerCase(),
          passwordHash,
          role: input.role,
          loginMethod: "local",
          lastSignedIn: new Date(),
        });
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_created",
          details: `User "${input.name}" (CIN: ${input.cin}) created with role "${input.role}"`,
          createdAt: Date.now(),
        });
        return { id };
      }),

    updateUser: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        cin: z.string().min(1).optional(),
        unit: z.string().optional(),
        team: z.enum(["TEAM1", "TEAM2", "PTT"]).nullable().optional(),
        username: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        role: z.enum(["observer", "certifier", "admin"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, password, ...rest } = input;
        const updateData: Record<string, unknown> = { ...rest };
        if (password) {
          updateData.passwordHash = await bcrypt.hash(password, 12);
        }
        if (rest.cin) updateData.cin = rest.cin.toUpperCase();
        if (rest.username) updateData.username = rest.username.trim().toLowerCase();
        await updateUser(id, updateData as Parameters<typeof updateUser>[1]);
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_updated",
          details: `User ID ${id} profile updated`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    deleteUser: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete your own account." });
        await deleteUser(input.id);
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_deleted",
          details: `User ID ${input.id} deleted`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    updateUserRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["observer", "certifier", "admin"]) }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),
  // ─── Targets ─────────────────────────────────────────────────────────────────

  target: router({
    /** List all targets for an operation */
    list: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        return getTargetsByOperation(input.operationId);
      }),

    /** Create a new target */
    create: protectedProcedure
      .input(z.object({
        operationId: z.number(),
        name: z.string().min(1).max(255),
        tgt: z.string().optional(),
        hb: z.string().optional(),
        v1: z.string().optional(),
        v2: z.string().optional(),
        wb: z.string().optional(),
        dep: z.string().optional(),
        arr: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createTarget({ ...input, createdBy: ctx.user.id });
      }),

    /** Update an existing target */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        tgt: z.string().optional(),
        hb: z.string().optional(),
        v1: z.string().optional(),
        v2: z.string().optional(),
        wb: z.string().optional(),
        dep: z.string().optional(),
        arr: z.string().optional(),
      }))
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

    /** Set the target for a running sheet */
    setSheetTarget: protectedProcedure
      .input(z.object({ sheetId: z.number(), targetId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        await setSheetTarget(input.sheetId, input.targetId);
        return { success: true };
      }),
  }),
  // ─── Shortcuts ───────────────────────────────────────────────────────────────

  shortcuts: router({
    /** List all shortcuts — available to all authenticated users */
    list: protectedProcedure.query(async () => {
      return listShortcuts();
    }),
    /** Create a new shortcut — admin only */
    create: adminProcedure
      .input(z.object({
        trigger: z.string().min(1).max(64).toLowerCase(),
        expansion: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        await createShortcut({ trigger: input.trigger.toLowerCase(), expansion: input.expansion, createdBy: ctx.user.id });
        return { success: true };
      }),
    /** Update a shortcut — admin only */
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        trigger: z.string().min(1).max(64).optional(),
        expansion: z.string().min(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.trigger) data.trigger = data.trigger.toLowerCase();
        await updateShortcut(id, data);
        return { success: true };
      }),
    /** Delete a shortcut — admin only */
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteShortcut(input.id);
        return { success: true };
      }),
  }),
  /** Intelligence Folder */
  intelligence: router({
    /** List all extracted entities from all observation rows */
    getEntities: protectedProcedure
      .query(async () => {
        return getAllIntelligenceEntities();
      }),
  }),
});
export type AppRouter = typeof appRouter;
