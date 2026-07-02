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
  getAllTargets,
  getTargetsByOperation,
  createTarget,
  updateTarget,
  deleteTarget,
  getTargetById,
  setSheetTarget,
  deepSearchOperations,
  getAllIntelligenceEntities,
  listShortcuts,
  createShortcut,
  updateShortcut,
  deleteShortcut,
  getGovernanceRecord,
  upsertGovernanceRecord,
  type GovernanceUpsertInput,
  getGovernanceRecordsBySheetIds,
  computeGovernancePercent,
  getGovernanceTodoForCin,
  getOperationDeleteStats,
  getTargetShortcuts,
  createTargetShortcut,
  updateTargetShortcut,
  deleteTargetShortcut,
  getTargetShortcutsForSheet,
  getAllTargetsForRegistry,
  createRegistryTarget,
  linkTargetToOperation,
  unlinkTargetFromOperation,
  getLinkedOperationsForTarget,
  closeSheet,
  reopenSheet,
} from "./db";

// ─── Role Guards ──────────────────────────────────────────────────────────────

/** Member or Admin can certify/uncertify */
const certifierOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "member" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Member or Admin role required." });
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

    deleteStats: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getOperationDeleteStats(input.id);
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
        targetName: z.string().optional().nullable(),
        sheetCins: z.array(z.object({ cin: z.string(), hasImages: z.boolean(), isTeamLeader: z.boolean().optional(), isAuthor: z.boolean().optional() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // If a new target name is provided, create a real registry target and link it to the operation
        let resolvedTargetId = input.targetId ?? null;
        if (!resolvedTargetId && input.targetName?.trim()) {
          const newTarget = await createRegistryTarget({ name: input.targetName.trim(), createdBy: ctx.user.id });
          await linkTargetToOperation(newTarget.id, input.operationId);
          resolvedTargetId = newTarget.id;
        }
        const id = await createRunningSheet({
          operationId: input.operationId,
          title: input.title,
          targetId: resolvedTargetId,
          targetName: null,
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
        const { id, sheetCins, targetName, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };
        // Validate roster CINs against registered users
        if (sheetCins && sheetCins.length > 0) {
          const allRegisteredUsers = await getAllUsers();
          const registeredCins = new Set(allRegisteredUsers.map((u) => u.cin.toUpperCase()));
          const invalid = sheetCins.filter((e) => !registeredCins.has(e.cin.toUpperCase()));
          if (invalid.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `The following CINs are not registered users: ${invalid.map((e) => e.cin).join(", ")}` });
          }
        }
        if (sheetCins !== undefined) data.sheetCins = JSON.stringify(sheetCins);
        // If a new target name is provided, create a real registry target and link it to the sheet's operation
        if (targetName?.trim()) {
          const sheet = await getRunningSheetById(id);
          if (sheet?.operationId) {
            const newTarget = await createRegistryTarget({ name: targetName.trim(), createdBy: ctx.user.id });
            await linkTargetToOperation(newTarget.id, sheet.operationId);
            data.targetId = newTarget.id;
          }
          data.targetName = null;
        } else if (targetName === null) {
          data.targetName = null;
        }
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

    governanceTodo: protectedProcedure.query(async ({ ctx }) => {
      const cin = ctx.user.cin;
      if (!cin) return [];
      return getGovernanceTodoForCin(cin);
    }),

    close: certifierOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getRunningSheetById(input.id);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
        if (sheet.closedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Sheet is already closed." });
        const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
        await closeSheet(input.id, cin);
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_closed", details: `Sheet closed by ${cin}`, createdAt: Date.now() });
        return { success: true };
      }),

    reopen: certifierOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getRunningSheetById(input.id);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
        if (!sheet.closedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Sheet is not closed." });
        await reopenSheet(input.id);
        // Reset operative section checkboxes — sheet has changed so they must be re-verified
        await upsertGovernanceRecord({
          sheetId: input.id,
          savedAsWord: false,
          savedAsPdf: false,
          uploadedToPromis: false,
          savedInOpFolder: false,
          savedAsWordCIN: null,
          savedAsPdfCIN: null,
          uploadedToPromisCIN: null,
          savedInOpFolderCIN: null,
        });
        const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.name ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_reopened", details: `Sheet reopened by ${cin}`, createdAt: Date.now() });
        return { success: true };
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
        // Validate CIN against registered users
        const allRegisteredUsers = await getAllUsers();
        const cinUpper = input.memberName.trim().toUpperCase();
        const registeredCins = new Set(allRegisteredUsers.map((u) => u.cin.toUpperCase()));
        if (!registeredCins.has(cinUpper)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `CIN "${cinUpper}" is not a registered user. Only registered CINs can be added.` });
        }
        const id = await addRowMember({ rowId: input.rowId, memberName: cinUpper });
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

        // Member role: can only certify their own CIN
        if (ctx.user.role === "member") {
          const members = await getMembersByRowIds([input.rowId]);
          const member = members.find((m) => m.id === input.memberId);
          if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
          const userCIN = ctx.user.cin ?? ctx.user.username ?? "";
          if (member.memberName.toLowerCase() !== userCIN.toLowerCase()) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only certify your own CIN." });
          }
        }

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
        // Member role: can only certify their own CIN
        if (ctx.user.role === "member") {
          const userCIN = ctx.user.cin ?? ctx.user.username ?? "";
          if (input.cin.toLowerCase() !== userCIN.toLowerCase()) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only certify your own CIN." });
          }
        }
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

        // Member role: can only unlock rows that contain their own CIN
        if (ctx.user.role === "member") {
          const rowMembers = await getMembersByRowIds([input.rowId]);
          const userCIN = (ctx.user.cin ?? ctx.user.username ?? "").toLowerCase();
          const hasCIN = rowMembers.some((m) => m.memberName.toLowerCase() === userCIN);
          if (!hasCIN) throw new TRPCError({ code: "FORBIDDEN", message: "You can only unlock rows that contain your CIN." });
        }

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

        // Member role: can only bulk-unlock rows that contain their own CIN
        if (ctx.user.role === "member") {
          const rowMembers = await getMembersByRowIds([input.rowId]);
          const userCIN = (ctx.user.cin ?? ctx.user.username ?? "").toLowerCase();
          const hasCIN = rowMembers.some((m) => m.memberName.toLowerCase() === userCIN);
          if (!hasCIN) throw new TRPCError({ code: "FORBIDDEN", message: "You can only unlock rows that contain your CIN." });
        }

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
        const target = sheet.targetId ? await getTargetById(sheet.targetId) : null;
        const rows = await getRowsBySheetId(input.id);
        const rowIds = rows.map((r) => r.id);
        const [members, certs] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
        ]);
        return {
          sheet,
          operation,
          targetFullName: target?.name ?? sheet.targetName ?? null,
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
        role: z.enum(["observer", "member", "admin"]),
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
        role: z.enum(["observer", "member", "admin"]).optional(),
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
      .input(z.object({ userId: z.number(), role: z.enum(["observer", "member", "admin"]) }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),
  // ─── Users (public list for CIN validation) ────────────────────────────────

  users: router({
    /** Returns all registered users as {cin, name, unit} for CIN autocomplete/validation */
    listForCin: protectedProcedure.query(async () => {
      const all = await getAllUsers();
      return all.map((u) => ({
        cin: u.cin,
        name: u.name,
        unit: u.unit ?? "",
        team: u.team ?? "",
      }));
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
        hbf: z.string().optional(),
        v1f: z.string().optional(),
        v2f: z.string().optional(),
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
        hbf: z.string().optional(),
        v1f: z.string().optional(),
        v2f: z.string().optional(),
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

    /** List all targets across all operations (for cross-op linking) */
    listAll: protectedProcedure.query(async () => {
      return getAllTargets();
    }),

    /** Get a single target by ID */
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getTargetById(input.id) ?? null;
      }),

    /** Set the target for a running sheet */
    setSheetTarget: protectedProcedure
      .input(z.object({ sheetId: z.number(), targetId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        await setSheetTarget(input.sheetId, input.targetId);
        return { success: true };
      }),

    // ─── Target Registry sub-router ─────────────────────────────────────────────────────────────────────────
    registry: router({
      /** List all targets in the global registry with linked operations */
      list: protectedProcedure.query(async () => {
        return getAllTargetsForRegistry();
      }),

      /** Create a new target in the global registry */
      create: protectedProcedure
        .input(z.object({
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
          linkToOperationId: z.number().optional().nullable(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { linkToOperationId, ...data } = input;
          const result = await createRegistryTarget({ ...data, createdBy: ctx.user.id });
          if (linkToOperationId) {
            await linkTargetToOperation(result.id, linkToOperationId);
          }
          return result;
        }),

      /** Update a target in the registry */
      update: protectedProcedure
        .input(z.object({
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
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          return updateTarget(id, data);
        }),

      /** Delete a target from the registry (removes all operation links too) */
      delete: protectedProcedure
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
        .query(async ({ input }) => {
          return getLinkedOperationsForTarget(input.targetId);
        }),
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

  /** RS Governance Folder */
  governance: router({
    /** Get (or auto-create) governance record for a sheet */
    getBySheet: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });
        let record = await getGovernanceRecord(input.sheetId);
        if (!record) {
          // Auto-create with due date = sheet createdAt + 7 days
          const dueDate = new Date(sheet.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000;
          record = await upsertGovernanceRecord({ sheetId: input.sheetId, dueDate });
        }
        if (!record) return null;
        // Map legacy DB column isurv → summaryNotification for the client
        return { ...record, summaryNotification: record.isurv };
      }),

    /** Governance completion summary for all sheets in an operation */
    summaryByOperation: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        const sheets = await getRunningSheetsByOperation(input.operationId);
        if (!sheets.length) return [];
        const sheetIds = sheets.map((s) => s.id);
        const rowIds: number[] = [];
        const rowsBySheet: Record<number, { id: number }[]> = {};
        for (const s of sheets) {
          const rows = await getRowsBySheetId(s.id);
          rowsBySheet[s.id] = rows;
          rows.forEach((r) => rowIds.push(r.id));
        }
        const [allMembers, allCerts, govRecords] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
          getGovernanceRecordsBySheetIds(sheetIds),
        ]);
        return sheets.map((sheet) => {
          const rows = rowsBySheet[sheet.id] ?? [];
          const allSigned = rows.length > 0 && rows.every((r) => {
            const members = allMembers.filter((m) => m.rowId === r.id);
            return members.length > 0 && members.every((m) =>
              allCerts.some((c) => c.rowId === r.id && c.memberId === m.id && c.isActive)
            );
          });
          const rec = govRecords.find((g) => g.sheetId === sheet.id) ?? null;
          const percent = computeGovernancePercent(rec, allSigned);
          const isOverdue = rec?.dueDate != null && Date.now() > rec.dueDate && percent < 100;
          return {
            sheetId: sheet.id,
            sheetTitle: sheet.title,
            sheetCreatedAt: sheet.createdAt,
            overallPercent: percent,
            isComplete: percent === 100,
            isOverdue,
            dueDate: rec?.dueDate ?? null,
          };
        });
      }),

    /** Update governance record fields */
    update: protectedProcedure
      .input(z.object({
        sheetId: z.number(),
        dueDate: z.number().nullable().optional(),
        summaryNotification: z.boolean().optional(),
        sentToIO: z.boolean().optional(),
        savedAsWord: z.boolean().optional(),
        savedAsPdf: z.boolean().optional(),
        uploadedToPromis: z.boolean().optional(),
        linked: z.boolean().optional(),
        savedInOpFolder: z.boolean().optional(),
        imageryTaken: z.boolean().optional(),
        coverPage: z.boolean().optional(),
        // Which field was toggled (so server can attach CIN automatically)
        toggledField: z.enum([
          "summaryNotification", "sentToIO", "savedAsWord", "savedAsPdf",
          "uploadedToPromis", "linked", "savedInOpFolder", "imageryTaken", "coverPage"
        ]).optional(),
        // New value of the toggled field (true = ticked, false = unticked)
        toggledValue: z.boolean().optional(),
        sheetCell: z.string().nullable().optional(),
        imageryEntries: z.array(z.object({
          cin: z.string(),
          rowTime: z.string(),
          type: z.enum(["photo", "video", ""]),
          saved: z.boolean(),
        })).optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        // Build CIN update: set CIN when ticking, clear when unticking
        const cinUpdate: Partial<GovernanceUpsertInput> = {};
        if (input.toggledField && input.toggledValue !== undefined) {
          const cinValue = input.toggledValue ? userCIN : null;
          const cinFieldMap: Record<string, keyof GovernanceUpsertInput> = {
            summaryNotification: "isurvCIN",
            sentToIO: "sentToIOCIN",
            savedAsWord: "savedAsWordCIN",
            savedAsPdf: "savedAsPdfCIN",
            uploadedToPromis: "uploadedToPromisCIN",
            linked: "linkedCIN",
            savedInOpFolder: "savedInOpFolderCIN",
            imageryTaken: "imageryTakenCIN",
            coverPage: "coverPageCIN",
          };
          const cinField = cinFieldMap[input.toggledField];
          if (cinField) (cinUpdate as Record<string, string | null>)[cinField] = cinValue;
        }
        const record = await upsertGovernanceRecord({ ...input, ...cinUpdate } as Parameters<typeof upsertGovernanceRecord>[0]);
        return record;
      }),
  }),

  // ─── Target Shortcuts ───────────────────────────────────────────────────────────────
  targetShortcuts: router({
    /** List shortcuts for a specific target */
    list: protectedProcedure
      .input(z.object({ targetId: z.number() }))
      .query(async ({ input }) => {
        return getTargetShortcuts(input.targetId);
      }),
    /** Create a target shortcut */
    create: protectedProcedure
      .input(z.object({
        targetId: z.number(),
        trigger: z.string().min(1).max(64),
        expansion: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        return createTargetShortcut({ ...input, trigger: input.trigger.toLowerCase(), createdBy: ctx.user.id });
      }),
    /** Update a target shortcut */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        trigger: z.string().min(1).max(64).optional(),
        expansion: z.string().min(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.trigger) data.trigger = data.trigger.toLowerCase();
        return updateTargetShortcut(id, data);
      }),
    /** Delete a target shortcut */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTargetShortcut(input.id);
        return { success: true };
      }),
    /** Get shortcuts for the target assigned to a sheet (used by observation form) */
    listForSheet: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getTargetShortcutsForSheet(input.sheetId);
      }),
  }),

  // ─── Calendar ───────────────────────────────────────────────────────────────
  calendar: router({
    /** Return all operations and running sheets as calendar events */
    events: protectedProcedure.query(async () => {
      const operations = await getOperations();
      const sheets = await getRunningSheets();
      const events: {
        id: string;
        title: string;
        start: number;
        end: number;
        type: "operation" | "sheet";
        operationId: number | null;
        sheetId: number | null;
        operationName: string | null;
      }[] = [];

      for (const op of operations) {
        const ts = new Date(op.createdAt).getTime();
        events.push({
          id: `op-${op.id}`,
          title: op.name,
          start: ts,
          end: ts + 60 * 60 * 1000, // 1-hour block
          type: "operation",
          operationId: op.id,
          sheetId: null,
          operationName: op.name,
        });
      }

      for (const sheet of sheets) {
        const ts = new Date(sheet.createdAt).getTime();
        const op = operations.find((o) => o.id === sheet.operationId);
        events.push({
          id: `sheet-${sheet.id}`,
          title: sheet.title,
          start: ts,
          end: ts + 60 * 60 * 1000,
          type: "sheet",
          operationId: sheet.operationId ?? null,
          sheetId: sheet.id,
          operationName: op?.name ?? null,
        });
      }

      return events;
    }),
  }),

  // ─── Court Statements ────────────────────────────────────────────────────────

  statement: router({
    /**
     * Returns the data needed to generate statements for the given sheets.
     * For each CIN found in the selected sheets, returns surveillance dates,
     * author dates, and image dates.
     */
    previewData: protectedProcedure
      .input(z.object({ sheetIds: z.array(z.number()).min(1) }))
      .query(async ({ input }) => {
        const sheets = await Promise.all(input.sheetIds.map((id) => getRunningSheetById(id)));
        const validSheets = sheets.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>[];

        // Build per-CIN data
        const cinMap = new Map<string, { surveillanceDates: number[]; authorDates: number[]; imageDates: number[] }>();

        for (const sheet of validSheets) {
          const sheetDate = new Date(sheet.createdAt).setHours(0, 0, 0, 0);
          let roster: { cin: string; hasImages?: boolean; isAuthor?: boolean }[] = [];
          try { roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { roster = []; }

          for (const entry of roster) {
            const cinUpper = entry.cin.toUpperCase();
            if (!cinMap.has(cinUpper)) cinMap.set(cinUpper, { surveillanceDates: [], authorDates: [], imageDates: [] });
            const data = cinMap.get(cinUpper)!;
            data.surveillanceDates.push(sheetDate);
            if (entry.isAuthor) data.authorDates.push(sheetDate);
            if (entry.hasImages) data.imageDates.push(sheetDate);
          }
        }

        // Resolve CIN → name from users table
        const allUsers = await getAllUsers();
        const userByCin = new Map(allUsers.map((u) => [u.cin.toUpperCase(), u]));

        return Array.from(cinMap.entries()).map(([cin, data]) => {
          const user = userByCin.get(cin);
          return {
            cin,
            name: user?.name ?? cin,
            surveillanceDates: data.surveillanceDates,
            authorDates: data.authorDates,
            imageDates: data.imageDates,
          };
        }).sort((a, b) => a.cin.localeCompare(b.cin));
      }),

    /**
     * Generates a Base64-encoded .docx for the given CIN across the selected sheets.
     * Returns { filename, base64 } for each requested CIN.
     */
    generate: protectedProcedure
      .input(z.object({
        sheetIds: z.array(z.number()).min(1),
        cins: z.array(z.string()).min(1),
        operationName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { generateStatementDocx } = await import("./statementGenerator");
        const JSZip = (await import("jszip")).default;

        const sheets = await Promise.all(input.sheetIds.map((id) => getRunningSheetById(id)));
        const validSheets = sheets.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>[];

        const allUsers = await getAllUsers();
        const userByCin = new Map(allUsers.map((u) => [u.cin.toUpperCase(), u]));

        // Build per-CIN data from sheets
        const cinMap = new Map<string, { surveillanceDates: number[]; authorDates: number[]; imageDates: number[] }>();
        for (const sheet of validSheets) {
          const sheetDate = new Date(sheet.createdAt).setHours(0, 0, 0, 0);
          let roster: { cin: string; hasImages?: boolean; isAuthor?: boolean }[] = [];
          try { roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { roster = []; }
          for (const entry of roster) {
            const cinUpper = entry.cin.toUpperCase();
            if (!cinMap.has(cinUpper)) cinMap.set(cinUpper, { surveillanceDates: [], authorDates: [], imageDates: [] });
            const data = cinMap.get(cinUpper)!;
            data.surveillanceDates.push(sheetDate);
            if (entry.isAuthor) data.authorDates.push(sheetDate);
            if (entry.hasImages) data.imageDates.push(sheetDate);
          }
        }

        const certifierUser = userByCin.get(ctx.user.cin?.toUpperCase() ?? "");
        const certifierCin = ctx.user.cin ?? "UNKNOWN";
        const certifierName = certifierUser?.name ?? ctx.user.name ?? "Unknown";
        const producedAt = Date.now();

        const requestedCins = input.cins.map((c) => c.toUpperCase());
        const results: { cin: string; filename: string; base64: string }[] = [];

        for (const cin of requestedCins) {
          const data = cinMap.get(cin);
          if (!data) continue;
          const user = userByCin.get(cin);
          const name = user?.name ?? cin;
          const buf = await generateStatementDocx({
            cin,
            name,
            operationName: input.operationName,
            surveillanceDates: data.surveillanceDates,
            authorDates: data.authorDates,
            imageDates: data.imageDates,
            certifierCin,
            certifierName,
            producedAt,
          });
          const filename = `Statement_${cin}_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
          results.push({ cin, filename, base64: buf.toString("base64") });
        }

        if (results.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No matching CINs found in the selected sheets." });
        }

        // If multiple, also produce a ZIP
        let zipBase64: string | null = null;
        if (results.length > 1) {
          const zip = new JSZip();
          for (const r of results) {
            zip.file(r.filename, Buffer.from(r.base64, "base64"));
          }
          const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
          zipBase64 = zipBuf.toString("base64");
        }

        return { results, zipBase64, operationName: input.operationName, producedAt };
      }),
  }),
});
export type AppRouter = typeof appRouter;
