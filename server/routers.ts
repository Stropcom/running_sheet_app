import bcrypt from "bcryptjs";
import heicConvert from "heic-convert";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";
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
  getRunningSheetsByOperations,
  getUserById,
  getUserByUsername,
  removeRowMember,
  reorderRowMembers,
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
  ensureTargetFullyLinked,
  getLinkedOperationsForTarget,
  closeSheet,
  reopenSheet,
  copyRunningSheet,
  moveRunningSheet,
  getAssociationGraph,
  getOperationsByStatus,
  getAllOperations,
  setOperationStatus,
  softDeleteOperation,
  softDeleteSheet,
  softDeleteTarget,
  getRecycleBinItems,
  reinstateOperation,
  reinstateSheet,
  reinstateTarget,
  purgeExpiredRecycleBinItems,
  getIntelTargetProfile,
  getIntelOperationProfile,
  getIntelAssociateProfile,
  getIntelVehicleProfile,
  getIntelLocationProfile,
  getIntelMappingLocations,
  getUserLocations,
  upsertUserLocation,
  clearUserLocation,
  getUserLocationState,
  getCustomMarkers,
  createCustomMarker,
  updateCustomMarker,
  softDeleteCustomMarker,
  reinstateCustomMarker,
  hardDeleteCustomMarker,
  backfillGoogleAddressesInObservations,
  getRsMappingWaypoints,
  upsertRsMappingWaypoint,
  getIncompleteRunningSheets,
  getOutstandingTodosByUser,
  getSidebarOrder,
  setSidebarOrder,
  DEFAULT_SIDEBAR_ORDER,
  getHomePrefs,
  setHomePrefs,
  DEFAULT_TILE_ORDER,
  createRowAttachment,
  getAttachmentsByRowIds,
  getAttachmentById,
  getAttachmentsByOperationId,
  getAttachmentsBySheetId,
  deleteRowAttachment,
  softDeleteAttachment,
  reinstateAttachment,
  linkAttachmentToEntity,
  unlinkAttachmentFromEntity,
  getEntityLinkCounts,
  getAttachmentsForEntity,
} from "./db";

import { makeRequest, type RoadsResult, type DirectionsResult, type GeocodingResult } from "./_core/map";
import { generateStatDecDocx } from "./statDecGenerator";
import { generateWipcRequestDocx } from "./wipcRequestGenerator";
import { vaultEncrypt, vaultDecrypt } from "./wipcVault";
import {
  createWipcAuditEntry,
  getWipcAuditLog,
  upsertWipcOfficerProfile,
  getWipcOfficerProfile,
  listWipcMembers,
  createWipcMember,
  updateWipcMember,
  deleteWipcMember,
  getOpManagerPriorityBoard,
  saveOpManagerPriorityBoard,
  getOpManagerTaskingCalendar,
  saveOpManagerTaskingCell,
  getOpManagerSupervisorContacts,
  saveOpManagerSupervisorContacts,
  getPostedWeeks,
  isWeekPosted,
  markWeekPosted,
  listAllOpManagerWeeks,
  copyOpManagerWeek,
  savePushSubscription,
  removePushSubscription,
} from "./db";
import { sendPushToAll, sendPushToUsers } from "./webPush";

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

/**
 * Throws FORBIDDEN if the operation containing a sheet is not in 'active' status.
 * Used to block all mutations on Before Court / Archive operations.
 */
async function guardActiveOperation(operationId: number) {
  const op = await getOperationById(operationId);
  if (!op) throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found." });
  if (op.status !== "active") {
    const label = op.status === "before_court" ? "Before Court" : "Archive";
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `This operation is in ${label} status. Move it back to Active before making changes.`,
    });
  }
}

async function guardActiveSheet(sheetId: number) {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  await guardActiveOperation(sheet.operationId);
}

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
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_updated",
          details: `CIN ${ctx.user.cin ?? "Unknown"} changed password`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    uploadWallpaper: protectedProcedure
      .input(z.object({
        // base64-encoded image data
        dataBase64: z.string().min(1),
        mimeType: z.string().regex(/^image\/(jpeg|png|webp|gif)$/, "Only JPEG, PNG, WebP or GIF images are allowed."),
        opacity: z.number().int().min(0).max(100).default(40),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.dataBase64, "base64");
        // Limit to 5 MB
        if (buffer.byteLength > 5 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Wallpaper image must be under 5 MB." });
        }
        const ext = input.mimeType.split("/")[1];
        const key = `wallpapers/user-${ctx.user.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        await updateUser(ctx.user.id, { wallpaperUrl: url, wallpaperOpacity: input.opacity });
        return { url, opacity: input.opacity };
      }),

    clearWallpaper: protectedProcedure
      .mutation(async ({ ctx }) => {
        await updateUser(ctx.user.id, { wallpaperUrl: null, wallpaperOpacity: 40 });
        return { success: true };
      }),

    updateWallpaperOpacity: protectedProcedure
      .input(z.object({ opacity: z.number().int().min(0).max(100) }))
      .mutation(async ({ input, ctx }) => {
        await updateUser(ctx.user.id, { wallpaperOpacity: input.opacity });
        return { success: true };
      }),
  }),


  // ─── Auth ────────────────────────────────────────────────────────────────────

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        let user;
        try {
          user = await getUserByUsername(input.username.trim().toLowerCase());
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The server is temporarily unavailable. Please wait a moment and try again.",
          });
        }
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });

        // Create session token using the existing SDK (using username as openId-equivalent)
        const sessionToken = await sdk.createSessionToken(user.username, {
          name: user.name,
          expiresInMs: SESSION_EXPIRY_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: SESSION_EXPIRY_MS,
        });

        // Audit login
        await createAuditLog({
          sheetId: 0,
          userId: user.id,
          userName: user.cin ?? "Unknown",
          userCIN: user.cin,
          action: "user_login",
          details: `CIN ${user.cin ?? "Unknown"} logged in`,
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
            mustChangePassword: user.mustChangePassword,
          },
        };
      }),

    setNewPassword: protectedProcedure
      .input(z.object({ newPassword: z.string().min(8, "Password must be at least 8 characters.") }))
      .mutation(async ({ input, ctx }) => {
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await updateUser(ctx.user.id, { passwordHash, mustChangePassword: false });
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "password_changed",
          details: `CIN ${ctx.user.cin ?? "Unknown"} set a new password`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user) {
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "user_logout",
          details: `CIN ${ctx.user.cin ?? "Unknown"} logged out`,
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
      .query(async ({ input }) => {
        return deepSearchOperations(input.query);
      }),

    listByStatus: protectedProcedure
      .input(z.object({ status: z.enum(["active", "before_court", "archive"]) }))
      .query(async ({ input }) => {
        return getOperationsByStatus(input.status);
      }),

    listAll: protectedProcedure.query(async () => {
      return getAllOperations();
    }),

    setStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["active", "before_court", "archive"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const op = await getOperationById(input.id);
        if (!op) throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found." });
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

    listByOperations: protectedProcedure
      .input(z.object({ operationIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        return getRunningSheetsByOperations(input.operationIds);
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
        await guardActiveOperation(input.operationId);
        // Resolve target: create new if name provided, or use existing targetId
        let resolvedTargetId = input.targetId ?? null;
        if (!resolvedTargetId && input.targetName?.trim()) {
          const newTarget = await createRegistryTarget({ name: input.targetName.trim(), createdBy: ctx.user.id });
          await linkTargetToOperation(newTarget.id, input.operationId);
          resolvedTargetId = newTarget.id;
        } else if (resolvedTargetId) {
          // Existing target selected — ensure operation link exists
          await linkTargetToOperation(resolvedTargetId, input.operationId);
        }
        const id = await createRunningSheet({
          operationId: input.operationId,
          title: input.title,
          targetId: resolvedTargetId,
          targetName: null,
          sheetCins: input.sheetCins ? JSON.stringify(input.sheetCins) : null,
          createdBy: ctx.user.id,
        });
        await createAuditLog({ sheetId: id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_created", details: `Sheet "${input.title}" created`, createdAt: Date.now() });
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
        await guardActiveSheet(input.id);
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
        await createAuditLog({ sheetId: id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_updated", details: `Sheet updated`, createdAt: Date.now() });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await softDeleteSheet(input.id, ctx.user.cin ?? "Unknown");
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_deleted", details: `Sheet moved to Recycle Bin`, createdAt: Date.now() });
        return { success: true };
      }),

    hardDelete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteRunningSheet(input.id);
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_deleted", details: `Sheet permanently deleted`, createdAt: Date.now() });
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

        // ── Permission: only Team Leader CIN or Admin can close ────────────────
        if (ctx.user.role !== "admin") {
          const userCin = ctx.user.cin ?? "";
          let sheetCins: { cin: string; isTeamLeader?: boolean }[] = [];
          try { sheetCins = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { sheetCins = []; }
          const isTeamLeader = sheetCins.some((c) => c.isTeamLeader && c.cin === userCin);
          if (!isTeamLeader) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only the listed Team Leader or an Admin can close this running sheet.",
            });
          }
        }

        // ── Validate all rows are certified ────────────────────────────────────
        const rows = await getRowsBySheetId(input.id);
        const rowIds = rows.map((r) => r.id);
        let allSigned = false;
        if (rowIds.length > 0) {
          const [members, certs] = await Promise.all([
            getMembersByRowIds(rowIds),
            getCertificationsByRowIds(rowIds),
          ]);
          const certRowIds = new Set(certs.map((c) => c.rowId));
          // A row is certified if every non-spacer member in that row has an active cert
          const nonSpacerMembers = members.filter((m) => m.memberName !== "__SPACE__");
          const allMembersCertified = nonSpacerMembers.every((m) => certRowIds.has(m.rowId));
          allSigned = nonSpacerMembers.length === 0 || allMembersCertified;
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
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_closed", details: `Sheet closed by ${cin}`, createdAt: Date.now() });
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
        await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_reopened", details: `Sheet reopened by ${cin}`, createdAt: Date.now() });
        return { success: true };
      }),

    /**
     * Move a running sheet to a different operation.
     * The sheet itself (rows, members, governance) is unchanged — only its operationId changes.
     */
    move: certifierOrAdminProcedure
      .input(z.object({
        sheetId: z.number(),
        targetOperationId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Running sheet not found." });
        if (sheet.operationId === input.targetOperationId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sheet is already in that operation." });
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
      .input(z.object({
        sheetId: z.number(),
        targetOperationId: z.number(),
        newTitle: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Running sheet not found." });
        const newSheetId = await copyRunningSheet(input.sheetId, input.targetOperationId, ctx.user.id, input.newTitle);
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
  }),

  // ─── Sheet Rows ──────────────────────────────────────────────────────────────

  row: router({
    list: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const rows = await getRowsBySheetId(input.sheetId);
        const rowIds = rows.map((r) => r.id);
        const [members, certs, attachments] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
          getAttachmentsByRowIds(rowIds),
        ]);
        return rows.map((row) => ({
          ...row,
          members: members.filter((m) => m.rowId === row.id),
          certifications: certs.filter((c) => c.rowId === row.id && c.isActive),
          attachments: attachments.filter((a) => a.rowId === row.id),
        }));
      }),

    create: protectedProcedure
      .input(z.object({ sheetId: z.number(), time: z.string().optional(), timeMinutes: z.number().optional(), dayOffset: z.number().optional(), rowDate: z.string().optional(), observation: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await guardActiveSheet(input.sheetId);
        const existingRows = await getRowsBySheetId(input.sheetId);
        const rowNumber = existingRows.length + 1;
        const id = await createSheetRow({ sheetId: input.sheetId, rowNumber, time: input.time, timeMinutes: input.timeMinutes, dayOffset: input.dayOffset ?? 0, rowDate: input.rowDate, observation: input.observation, isLocked: false });
        await createAuditLog({ sheetId: input.sheetId, rowId: id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "row_created", details: `Row ${rowNumber} created`, createdAt: Date.now() });
        return { id, rowNumber };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), time: z.string().optional(), timeMinutes: z.number().optional(), dayOffset: z.number().optional(), rowDate: z.string().optional(), observation: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked. Uncertify to edit." });
        const { id, ...data } = input;
        await updateSheetRow(id, data);
        await createAuditLog({ sheetId: row.sheetId, rowId: id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "row_updated", details: `Row updated`, createdAt: Date.now() });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await deleteSheetRow(input.id);
        await createAuditLog({ sheetId: row.sheetId, rowId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "row_deleted", details: `Row deleted`, createdAt: Date.now() });
        return { success: true };
      }),
  }),

  // ─── Row Attachments (photos) ───────────────────────────────────────────────

  attachment: router({
    upload: protectedProcedure
      .input(z.object({
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
      }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        let buffer: Buffer = Buffer.from(input.dataBase64, "base64");
        // Limit to 10 MB — photos taken on a phone can run larger than the 5MB wallpaper cap
        if (buffer.byteLength > 10 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Photo must be under 10 MB." });
        }

        // The browser's reported type isn't always trustworthy (or present
        // at all), so fall back to the filename extension when it doesn't
        // look like a real image mimeType.
        const EXT_TO_MIME: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
        };
        const fileExt = (input.fileName ?? "").split(".").pop()?.toLowerCase();
        let mimeType = /^image\//.test(input.mimeType)
          ? input.mimeType
          : (fileExt && EXT_TO_MIME[fileExt]) || input.mimeType;

        const isHeic = /^image\/hei[cf]$/i.test(mimeType) || /\.hei[cf]$/i.test(input.fileName ?? "");
        if (isHeic) {
          try {
            buffer = await heicConvert({ buffer, format: "JPEG", quality: 0.9 });
          } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Could not read that HEIC/HEIF photo." });
          }
          mimeType = "image/jpeg";
        }

        if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only JPEG, PNG, WebP, GIF, or HEIC/HEIF images are allowed." });
        }

        const ext = mimeType.split("/")[1];
        const key = `row-attachments/sheet-${row.sheetId}/row-${row.id}/${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, mimeType);
        const id = await createRowAttachment({
          rowId: input.rowId,
          key,
          url,
          mimeType,
          caption: input.caption,
          uploadedBy: ctx.user.id,
          uploadedByCIN: ctx.user.cin ?? undefined,
        });
        await createAuditLog({ sheetId: row.sheetId, rowId: row.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "attachment_added", details: `Photo attached to row`, createdAt: Date.now() });
        return { id, url };
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

    listBySheet: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getAttachmentsBySheetId(input.sheetId);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const attachment = await getAttachmentById(input.id);
        if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found." });
        const row = await getRowById(attachment.rowId);
        // Soft-delete — goes to the Recycle Bin for 7 days before purge
        await softDeleteAttachment(input.id, ctx.user.cin ?? ctx.user.username ?? "Unknown");
        if (row) {
          await createAuditLog({ sheetId: row.sheetId, rowId: row.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "attachment_deleted", details: `Photo removed from row`, createdAt: Date.now() });
        }
        return { success: true };
      }),

    linkToEntity: protectedProcedure
      .input(z.object({
        attachmentId: z.number(),
        category: z.enum(["target", "vehicle", "associate", "location"]),
        targetId: z.number().optional(),
        entityLabel: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        if (input.category === "target" && !input.targetId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "targetId is required for target links." });
        }
        const id = await linkAttachmentToEntity(input);
        return { id };
      }),

    unlinkFromEntity: protectedProcedure
      .input(z.object({ linkId: z.number() }))
      .mutation(async ({ input }) => {
        await unlinkAttachmentFromEntity(input.linkId);
        return { success: true };
      }),

    entityLinkCounts: protectedProcedure.query(async () => {
      return getEntityLinkCounts();
    }),

    byEntity: protectedProcedure
      .input(z.object({
        category: z.enum(["target", "vehicle", "associate", "location"]),
        targetId: z.number().optional(),
        entityLabel: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return getAttachmentsForEntity(input);
      }),
  }),

  // ─── Row Members ─────────────────────────────────────────────────────────────

  member: router({
    add: protectedProcedure
      .input(z.object({ rowId: z.number(), memberName: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        const SPACER = "__SPACE__";
        const cinUpper = input.memberName.trim().toUpperCase();
        // Allow spacer entries; validate all real CINs against registered users
        if (cinUpper !== SPACER) {
          const allRegisteredUsers = await getAllUsers();
          const registeredCins = new Set(allRegisteredUsers.map((u) => u.cin.toUpperCase()));
          if (!registeredCins.has(cinUpper)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `CIN "${cinUpper}" is not a registered user. Only registered CINs can be added.` });
          }
        }
        // Assign sortOrder = current max + 1 so new entries go to the bottom
        const existingMembers = await getMembersByRowIds([input.rowId]);
        const maxOrder = existingMembers.reduce((m, e) => Math.max(m, (e as any).sortOrder ?? 0), 0);
        const id = await addRowMember({ rowId: input.rowId, memberName: cinUpper, sortOrder: maxOrder + 1 });
        if (cinUpper !== SPACER) {
          await createAuditLog({ sheetId: row.sheetId, rowId: input.rowId, memberId: id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "member_added", details: `CIN ${cinUpper} added to row`, createdAt: Date.now() });
        }
        return { id };
      }),

    reorder: protectedProcedure
      .input(z.object({ rowId: z.number(), orderedIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await reorderRowMembers(input.rowId, input.orderedIds);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number(), rowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await removeRowMember(input.id);
        await createAuditLog({ sheetId: row.sheetId, rowId: input.rowId, memberId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "member_removed", details: `CIN removed from row`, createdAt: Date.now() });
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
        // Exclude spacer entries from certification checks
        const rowMembers = members.filter((m) => m.rowId === input.rowId && m.memberName !== "__SPACE__");
        const activeCerts = certs.filter((c) => c.rowId === input.rowId && c.isActive);
        const allCertified = rowMembers.length > 0 && rowMembers.every((m) => activeCerts.some((c) => c.memberId === m.id));

        if (allCertified) await setRowLocked(input.rowId, true);

        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          memberId: input.memberId,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: certifierCIN,
          action: "certified",
          details: `Certified by CIN ${certifierCIN} at ${new Date(now).toISOString()}${allCertified ? " — Row locked" : ""}`,
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
          // Exclude spacer entries from certification checks
          const realMembers = rowMembers.filter((m) => m.memberName !== "__SPACE__");
          const allCertified = realMembers.length > 0 && realMembers.every((m) =>
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
              userName: ctx.user.cin ?? "Unknown",
              userCIN: certifierCIN,
              action: "certified",
              details: `Bulk certified by CIN ${certifierCIN} for CIN ${input.cin}${allCertified ? " — Row locked" : ""}`,
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
          userName: ctx.user.cin ?? "Unknown",
          userCIN: certifierCIN,
          action: "uncertified",
          details: `Certification removed by CIN ${certifierCIN} — Row unlocked`,
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
          userName: ctx.user.cin ?? "Unknown",
          userCIN: certifierCIN,
          action: "uncertified",
          details: `All certifications removed by CIN ${certifierCIN} — Row unlocked`,
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
        const [members, certs, attachments] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
          getAttachmentsByRowIds(rowIds),
        ]);
        return {
          sheet,
          operation,
          targetFullName: target?.name ?? sheet.targetName ?? null,
          rows: rows.map((row) => ({
            ...row,
            members: members.filter((m) => m.rowId === row.id),
            certifications: certs.filter((c) => c.rowId === row.id),
            attachments: attachments.filter((a) => a.rowId === row.id),
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
        phone: z.string().optional(),
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
          phone: input.phone || null,
          username: input.username.trim().toLowerCase(),
          passwordHash,
          role: input.role,
          loginMethod: "local",
          lastSignedIn: new Date(),
          // Admin-set password is a temporary one — force a real password
          // to be chosen on first login.
          mustChangePassword: true,
        });
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
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
        phone: z.string().nullable().optional(),
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
          userName: ctx.user.cin ?? "Unknown",
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
          userName: ctx.user.cin ?? "Unknown",
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
        extraVehicles: z.string().optional(), // JSON array of {full,short}
        wildFields: z.string().optional(),    // JSON array of {label,value}
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
        extraVehicles: z.string().optional().nullable(),
        wildFields: z.string().optional().nullable(),
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
          extraVehicles: z.string().optional().nullable(),
          wildFields: z.string().optional().nullable(),
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
          extraVehicles: z.string().optional().nullable(),
          wildFields: z.string().optional().nullable(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          return updateTarget(id, data);
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
        showInRs: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.trigger) data.trigger = data.trigger.toLowerCase();
        await updateShortcut(id, data);
        return { success: true };
      }),
    /** Toggle whether a shortcut appears as a chip in RS and RS QE — any authenticated user */
    toggleRs: protectedProcedure
      .input(z.object({ id: z.number(), showInRs: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateShortcut(input.id, { showInRs: input.showInRs });
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
    /**
     * Returns a stable device token for this browser, creating one if it doesn't exist.
     * The token is stored in an httpOnly cookie so it survives localStorage clears.
     * This is used as the deviceId for location sharing.
     */
    getDeviceToken: protectedProcedure
      .query(async ({ ctx }) => {
        // Parse cookies manually from the raw header (no cookie-parser middleware)
        const cookieHeader = ctx.req.headers.cookie || '';
        const cookies: Record<string, string> = {};
        cookieHeader.split(';').forEach((part) => {
          const [k, ...v] = part.trim().split('=');
          if (k) cookies[k.trim()] = decodeURIComponent(v.join('='));
        });
        const existing = cookies['runlog_device_token'];
        if (existing && existing.length > 8) {
          return { deviceToken: existing };
        }
        // Generate a new stable token
        const token = `dt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        // Set as a long-lived non-httpOnly cookie so JS can read it
        const isSecure = ctx.req.protocol === 'https' ||
          (ctx.req.headers['x-forwarded-proto'] as string || '').includes('https');
        const cookieVal = `runlog_device_token=${token}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=None${isSecure ? '; Secure' : ''}`;
        ctx.res.setHeader('Set-Cookie', cookieVal);
        return { deviceToken: token };
      }),

    /** List all extracted entities from all observation rows */
    getEntities: protectedProcedure
      .query(async () => {
        return getAllIntelligenceEntities();
      }),

    /** Association graph — nodes and weighted edges from entity co-occurrence */
    getAssociationGraph: protectedProcedure
      .input(z.object({
        operationIds: z.array(z.number()).optional(),
      }))
      .query(async ({ input }) => {
        return getAssociationGraph(input.operationIds);
      }),

    /** Target intelligence profile */
    targetProfile: protectedProcedure
      .input(z.object({ targetId: z.number() }))
      .query(async ({ input }) => {
        const profile = await getIntelTargetProfile(input.targetId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Target not found." });
        return profile;
      }),

    /** Operation intelligence profile */
    operationProfile: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        const profile = await getIntelOperationProfile(input.operationId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found." });
        return profile;
      }),

    /** Associate intelligence profile (by label/name) */
    associateProfile: protectedProcedure
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => {
        const profile = await getIntelAssociateProfile(input.label);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Associate not found." });
        return profile;
      }),

    /** Vehicle intelligence profile (by label) */
    vehicleProfile: protectedProcedure
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => {
        const profile = await getIntelVehicleProfile(input.label);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found." });
        return profile;
      }),

    /** Location intelligence profile (by label) */
    locationProfile: protectedProcedure
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => {
        const profile = await getIntelLocationProfile(input.label);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Location not found." });
        return profile;
      }),

    /** Intelligence mapping — all locations with linked targets/associates/vehicles */
    mappingLocations: protectedProcedure
      .input(z.object({
        operationIds: z.array(z.number()).optional(),
        targetIds: z.array(z.number()).optional(),
      }))
      .query(async ({ input }) => {
        return getIntelMappingLocations(input.operationIds, input.targetIds);
      }),

    /** Live user locations — operation-scoped, sharing-enabled users only */
    userLocations: protectedProcedure
      .input(z.object({
        operationIds: z.array(z.number()).default([]),
      }))
      .query(async ({ input }) => {
        return getUserLocations(input.operationIds);
      }),

    /** Update (upsert) the caller's location and sharing preference */
    updateUserLocation: protectedProcedure
      .input(z.object({
        deviceId: z.string(),
        lat: z.number(),
        lng: z.number(),
        operationIds: z.array(z.number()).default([]),
        sharingEnabled: z.boolean(),
        speed: z.number().nullable().optional(),
        heading: z.number().nullable().optional(),
        accuracy: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserLocation(
          ctx.user.id,
          input.deviceId,
          input.lat,
          input.lng,
          input.operationIds,
          input.sharingEnabled,
          input.speed ?? null,
          input.heading ?? null,
          input.accuracy ?? null,
        );
        return { ok: true };
      }),

    /** Get the target details (DEP/ARR/etc.) for a specific running sheet */
    getSheetTarget: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet || !sheet.targetId) return null;
        const target = await getTargetById(sheet.targetId);
        if (!target) return null;
        return {
          id: target.id,
          name: target.name,
          tgt: target.tgt,
          dep: target.dep,
          arr: target.arr,
          hb: target.hb,
          hbf: target.hbf,
          v1: target.v1,
          v1f: target.v1f,
          v2: target.v2,
          v2f: target.v2f,
          extraVehicles: target.extraVehicles ?? null,
          wildFields: target.wildFields ?? null,
        };
      }),

    /** Disable location sharing for the caller (for this device) */
    clearUserLocation: protectedProcedure
      .input(z.object({ deviceId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await clearUserLocation(ctx.user.id, input.deviceId);
        return { ok: true };
      }),

    /** Get the caller's current sharing state for this device (for restoring toggle on load) */
    myLocationState: protectedProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ ctx, input }) => {
        return getUserLocationState(ctx.user.id, input.deviceId);
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
        const userName = ctx.user.name ?? ctx.user.username ?? "Unknown";
        // Build CIN + Name update: set when ticking, clear when unticking
        const cinUpdate: Partial<GovernanceUpsertInput> = {};
        if (input.toggledField && input.toggledValue !== undefined) {
          const cinValue = input.toggledValue ? userCIN : null;
          const nameValue = input.toggledValue ? userName : null;
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
          const nameFieldMap: Record<string, keyof GovernanceUpsertInput> = {
            summaryNotification: "isurvName",
            sentToIO: "sentToIOName",
            savedAsWord: "savedAsWordName",
            savedAsPdf: "savedAsPdfName",
            uploadedToPromis: "uploadedToPromisName",
            linked: "linkedName",
            savedInOpFolder: "savedInOpFolderName",
            imageryTaken: "imageryTakenName",
            coverPage: "coverPageName",
          };
          const cinField = cinFieldMap[input.toggledField];
          const nameField = nameFieldMap[input.toggledField];
          if (cinField) (cinUpdate as Record<string, string | null>)[cinField] = cinValue;
          if (nameField) (cinUpdate as Record<string, string | null>)[nameField] = nameValue;
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

      /**
       * Extract a UTC-safe day start from a title that begins with YYYYMMDD,
       * e.g. "20260702 - FOREST (OSBORNE)" → 2026-07-02T00:00:00Z.
       * Falls back to the UTC date of the createdAt timestamp so no timezone
       * shift occurs on the server (which runs in UTC).
       */
      function dayStartFromTitleOrDate(title: string, createdAt: number | Date): number {
        const m = title.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) {
          // Parse directly as UTC midnight — no timezone shift
          return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        }
        // No date prefix: use UTC date components of createdAt to avoid server-TZ shift
        const d = new Date(typeof createdAt === "number" ? createdAt : createdAt.getTime());
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      }

      for (const op of operations) {
        const dayStart = dayStartFromTitleOrDate(op.name, op.createdAt);
        events.push({
          id: `op-${op.id}`,
          title: op.name,
          start: dayStart,
          end: dayStart,
          type: "operation",
          operationId: op.id,
          sheetId: null,
          operationName: op.name,
        });
      }

      for (const sheet of sheets) {
        const dayStart = dayStartFromTitleOrDate(sheet.title, sheet.createdAt);
        const op = operations.find((o) => o.id === sheet.operationId);
        events.push({
          id: `sheet-${sheet.id}`,
          title: sheet.title,
          start: dayStart,
          end: dayStart,
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
     * author dates, image dates, and an optional exclusion reason.
     *
     * Exclusion rules (CIN gets no statement if ALL its row appearances are excluded):
     *   1. "Surveillance Commenced" / "Surveillance Ceased" rows — not real observations
     *   2. "Travelled Via" rows — observation ends in "whereat" AND the immediately
     *      preceding row (by sort order) contains "continued via:" in its observation
     */
    previewData: protectedProcedure
      .input(z.object({ sheetIds: z.array(z.number()).min(1) }))
      .query(async ({ input }) => {
        const sheets = await Promise.all(input.sheetIds.map((id) => getRunningSheetById(id)));
        const validSheets = sheets.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>[];

        // Build per-CIN data, tracking qualifying vs excluded rows
        const cinMap = new Map<string, {
          surveillanceDates: number[];
          authorDates: number[];
          imageDates: number[];
          hasQualifyingRow: boolean;
          exclusionReasons: Set<string>;
        }>();

        for (const sheet of validSheets) {
          const sheetDate = new Date(sheet.createdAt).setHours(0, 0, 0, 0);
          let roster: { cin: string; hasImages?: boolean; isAuthor?: boolean }[] = [];
          try { roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { roster = []; }

          // Fetch rows for this sheet to apply exclusion rules
          const rows = await getRowsBySheetId(sheet.id);
          const rowIds = rows.map((r) => r.id);
          const members = rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];

          // Build sorted row list for "previous row" lookups
          const sortedRows = [...rows]; // already sorted by timeMinutes/rowNumber from db

          // Determine which rows are "excluded" observation types
          const excludedRowIds = new Set<number>();
          const excludedRowReasons = new Map<number, string>();

          for (let i = 0; i < sortedRows.length; i++) {
            const row = sortedRows[i];
            const obs = (row.observation ?? "").trim();

            // Rule 1: Surveillance Commenced / Surveillance Ceased
            const isSurveillanceMarker =
              /^surveillance commenced/i.test(obs) ||
              /^surveillance ceased/i.test(obs);
            if (isSurveillanceMarker) {
              excludedRowIds.add(row.id);
              excludedRowReasons.set(row.id, "surveillance-marker");
              continue;
            }

            // Rule 2: Travelled Via — ends in "whereat" (optionally followed by : or ;)
            //         AND the previous row contains "continued via" (followed by : or ;)
            const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
            if (endsInWhereat && i > 0) {
              const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
              if (/continued via[;:]/.test(prevObs)) {
                excludedRowIds.add(row.id);
                excludedRowReasons.set(row.id, "travelled-via");
              }
            }
          }

          // For each roster CIN, check if they appear in any qualifying row
          for (const entry of roster) {
            const cinUpper = entry.cin.toUpperCase();
            if (!cinMap.has(cinUpper)) {
              cinMap.set(cinUpper, {
                surveillanceDates: [],
                authorDates: [],
                imageDates: [],
                hasQualifyingRow: false,
                exclusionReasons: new Set(),
              });
            }
            const data = cinMap.get(cinUpper)!;
            data.surveillanceDates.push(sheetDate);
            if (entry.isAuthor) data.authorDates.push(sheetDate);
            if (entry.hasImages) data.imageDates.push(sheetDate);

            // Check if this CIN appears in any qualifying (non-excluded) row
            const cinRowIds = members
              .filter((m) => m.memberName.toUpperCase() === cinUpper)
              .map((m) => m.rowId);

            for (const rowId of cinRowIds) {
              if (!excludedRowIds.has(rowId)) {
                data.hasQualifyingRow = true;
              } else {
                const reason = excludedRowReasons.get(rowId);
                if (reason) data.exclusionReasons.add(reason);
              }
            }

            // If CIN has no row appearances at all in this sheet, still mark as qualifying
            // (they're on the roster — the sheet itself counts as a surveillance date)
            if (cinRowIds.length === 0) {
              data.hasQualifyingRow = true;
            }
          }
        }

        // Resolve CIN → name from users table
        const allUsers = await getAllUsers();
        const userByCin = new Map(allUsers.map((u) => [u.cin.toUpperCase(), u]));

        return Array.from(cinMap.entries()).map(([cin, data]) => {
          const user = userByCin.get(cin);
          // Build exclusion reason string if CIN has no qualifying rows
          let excludedReason: string | null = null;
          if (!data.hasQualifyingRow) {
            const reasons = Array.from(data.exclusionReasons);
            if (reasons.includes("surveillance-marker") && reasons.includes("travelled-via")) {
              excludedReason = "Only appears in Surveillance Commenced/Ceased and Travelled Via rows";
            } else if (reasons.includes("surveillance-marker")) {
              excludedReason = "Only appears in Surveillance Commenced/Ceased rows";
            } else if (reasons.includes("travelled-via")) {
              excludedReason = "Only appears in Travelled Via rows";
            } else {
              excludedReason = "No qualifying observation rows found";
            }
          }
          return {
            cin,
            name: user?.name ?? cin,
            surveillanceDates: data.surveillanceDates,
            authorDates: data.authorDates,
            imageDates: data.imageDates,
            excludedReason,
          };
        }).sort((a, b) => a.cin.localeCompare(b.cin));
      }),

    /**
     * Generates a Base64-encoded .docx for the given CIN across the selected sheets.
     * Returns { filename, base64 } for each requested CIN.
     * CINs that only appear in excluded rows (Surveillance Commenced/Ceased or Travelled Via)
     * are skipped and returned in the `skipped` array with a reason.
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

        // Build per-CIN data from sheets, applying exclusion rules
        // surveillanceDays: one entry per sheet, carrying date, isAuthor flag, and image times for that CIN
        const cinMap = new Map<string, {
          surveillanceDays: { date: number; isAuthor: boolean; imageTimes: string[] }[];
          hasQualifyingRow: boolean;
          exclusionReasons: Set<string>;
        }>();

        // Photo/video observation keyword pattern (matches PT shortcut expansion and variants)
        const PHOTO_PATTERN = /photograph|photo\/s|pt\b|video|image/i;

        for (const sheet of validSheets) {
          // Derive date from YYYYMMDD prefix in title (same logic as calendar events)
          let sheetDate: number;
          const titleMatch = sheet.title.match(/^(\d{4})(\d{2})(\d{2})/);
          if (titleMatch) {
            sheetDate = Date.UTC(Number(titleMatch[1]), Number(titleMatch[2]) - 1, Number(titleMatch[3]));
          } else {
            const d = new Date(sheet.createdAt instanceof Date ? sheet.createdAt.getTime() : sheet.createdAt);
            sheetDate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          }

          let roster: { cin: string; hasImages?: boolean; isAuthor?: boolean }[] = [];
          try { roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { roster = []; }

          const rows = await getRowsBySheetId(sheet.id);
          const rowIds = rows.map((r) => r.id);
          const members = rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];
          const sortedRows = [...rows];

          const excludedRowIds = new Set<number>();
          const excludedRowReasons = new Map<number, string>();

          for (let i = 0; i < sortedRows.length; i++) {
            const row = sortedRows[i];
            const obs = (row.observation ?? "").trim();
            const isSurveillanceMarker =
              /^surveillance commenced/i.test(obs) ||
              /^surveillance ceased/i.test(obs);
            if (isSurveillanceMarker) {
              excludedRowIds.add(row.id);
              excludedRowReasons.set(row.id, "surveillance-marker");
              continue;
            }
            const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
            if (endsInWhereat && i > 0) {
              const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
              if (/continued via[;:]/.test(prevObs)) {
                excludedRowIds.add(row.id);
                excludedRowReasons.set(row.id, "travelled-via");
              }
            }
          }

          // Build a map of rowId → time string for photo rows
          const photoRowTimes = new Map<number, string>();
          for (const row of sortedRows) {
            const obs = (row.observation ?? "").trim();
            if (PHOTO_PATTERN.test(obs) && row.time) {
              photoRowTimes.set(row.id, row.time);
            }
          }

          for (const entry of roster) {
            const cinUpper = entry.cin.toUpperCase();
            if (!cinMap.has(cinUpper)) {
              cinMap.set(cinUpper, {
                surveillanceDays: [],
                hasQualifyingRow: false,
                exclusionReasons: new Set(),
              });
            }
            const data = cinMap.get(cinUpper)!;

            const cinRowIds = members
              .filter((m) => m.memberName.toUpperCase() === cinUpper)
              .map((m) => m.rowId);

            // Collect image times: rows where this CIN is a member AND row has photo observation
            const imageTimes: string[] = [];
            for (const rowId of cinRowIds) {
              const t = photoRowTimes.get(rowId);
              if (t) imageTimes.push(t);
            }

            data.surveillanceDays.push({
              date: sheetDate,
              isAuthor: !!entry.isAuthor,
              imageTimes,
            });

            for (const rowId of cinRowIds) {
              if (!excludedRowIds.has(rowId)) {
                data.hasQualifyingRow = true;
              } else {
                const reason = excludedRowReasons.get(rowId);
                if (reason) data.exclusionReasons.add(reason);
              }
            }
            if (cinRowIds.length === 0) {
              data.hasQualifyingRow = true;
            }
          }
        }

        const certifierUser = userByCin.get(ctx.user.cin?.toUpperCase() ?? "");
        const certifierCin = ctx.user.cin ?? "UNKNOWN";
        const certifierName = certifierUser?.name ?? ctx.user.name ?? "Unknown";
        const producedAt = Date.now();

        const requestedCins = input.cins.map((c) => c.toUpperCase());
        const results: { cin: string; filename: string; base64: string }[] = [];
        const skipped: { cin: string; reason: string }[] = [];

        for (const cin of requestedCins) {
          const data = cinMap.get(cin);
          if (!data) continue;

          // Skip CINs with no qualifying rows
          if (!data.hasQualifyingRow) {
            const reasons = Array.from(data.exclusionReasons);
            let reason = "No qualifying observation rows found";
            if (reasons.includes("surveillance-marker") && reasons.includes("travelled-via")) {
              reason = "Only appears in Surveillance Commenced/Ceased and Travelled Via rows";
            } else if (reasons.includes("surveillance-marker")) {
              reason = "Only appears in Surveillance Commenced/Ceased rows";
            } else if (reasons.includes("travelled-via")) {
              reason = "Only appears in Travelled Via rows";
            }
            skipped.push({ cin, reason });
            continue;
          }

          const user = userByCin.get(cin);
          const name = user?.name ?? cin;
          const buf = await generateStatementDocx({
            cin,
            name,
            operationName: input.operationName,
            surveillanceDays: data.surveillanceDays,
            certifierCin,
            certifierName,
            producedAt,
          });
          const filename = `Statement_${cin}_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
          results.push({ cin, filename, base64: buf.toString("base64") });
        }

        if (results.length === 0 && skipped.length === 0) {
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

        return { results, skipped, zipBase64, operationName: input.operationName, producedAt };
      }),
  }),

  // ─── Witness List ─────────────────────────────────────────────────────────
  witnessList: router({
    /**
     * Generates a witness list document for the selected running sheets.
     * Primary witnesses: CINs that appear on at least one non-excluded row.
     * Secondary witnesses: CINs that ONLY appear on excluded rows (travelled via,
     *   surveillance commenced/ceased).
     * Returns a base64-encoded .docx.
     */
    generate: protectedProcedure
      .input(z.object({
        sheetIds: z.array(z.number()).min(1),
        operationName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { generateWitnessListDocx } = await import("./witnessListGenerator");

        const sheets = await Promise.all(input.sheetIds.map((id) => getRunningSheetById(id)));
        const validSheets = sheets.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>[];

        // Sort sheets by date (YYYYMMDD prefix or createdAt)
        const getSheetDate = (sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>) => {
          const m = sheet.title.match(/^(\d{4})(\d{2})(\d{2})/);
          if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          const d = new Date(sheet.createdAt instanceof Date ? sheet.createdAt.getTime() : sheet.createdAt);
          return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        };
        validSheets.sort((a, b) => getSheetDate(a) - getSheetDate(b));

        const allUsers = await getAllUsers();
        const userByCin = new Map(allUsers.map((u) => [u.cin.toUpperCase(), u]));

        // Helper to classify rows for a sheet
        const classifyRows = async (sheet: NonNullable<Awaited<ReturnType<typeof getRunningSheetById>>>) => {
          const rows = await getRowsBySheetId(sheet.id);
          const sortedRows = [...rows];
          const excludedRowIds = new Set<number>();

          for (let i = 0; i < sortedRows.length; i++) {
            const row = sortedRows[i];
            const obs = (row.observation ?? "").trim();
            // Surveillance commenced/ceased
            if (/^surveillance commenced/i.test(obs) || /^surveillance ceased/i.test(obs)) {
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

          const rowIds = rows.map((r) => r.id);
          const members = rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];
          return { excludedRowIds, members };
        };

        // Build per-sheet witness data
        type SheetWitnesses = {
          sheetTitle: string;
          sheetDate: number;
          primary: string[];
          secondary: string[];
        };

        const sheetWitnessList: SheetWitnesses[] = [];

        // Overall sets (across all sheets)
        const overallPrimarySet = new Set<string>();
        const overallSecondarySet = new Set<string>();

        for (const sheet of validSheets) {
          const sheetDate = getSheetDate(sheet);
          let roster: { cin: string }[] = [];
          try { roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { roster = []; }

          const { excludedRowIds, members } = await classifyRows(sheet);

          // For each CIN in roster, determine primary vs secondary
          const primarySet = new Set<string>();
          const secondarySet = new Set<string>();

          for (const entry of roster) {
            const cinUpper = entry.cin.toUpperCase();
            const cinRowIds = members
              .filter((m) => m.memberName.toUpperCase() === cinUpper)
              .map((m) => m.rowId);

            if (cinRowIds.length === 0) {
              // On roster but no rows — treat as secondary (on duty, no observations)
              secondarySet.add(cinUpper);
              continue;
            }

            const hasQualifyingRow = cinRowIds.some((id) => !excludedRowIds.has(id));
            if (hasQualifyingRow) {
              primarySet.add(cinUpper);
            } else {
              secondarySet.add(cinUpper);
            }
          }

          // A CIN that is primary on ANY sheet is overall primary
          Array.from(primarySet).forEach((cin) => {
            overallPrimarySet.add(cin);
            overallSecondarySet.delete(cin); // remove from secondary if they were added there
          });
          Array.from(secondarySet).forEach((cin) => {
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

        const producedAt = Date.now();
        const certifierCin = ctx.user.cin ?? "UNKNOWN";

        const buf = await generateWitnessListDocx({
          operationName: input.operationName,
          overallPrimary: Array.from(overallPrimarySet).sort(),
          overallSecondary: Array.from(overallSecondarySet).sort(),
          sheets: sheetWitnessList,
          producedAt,
          certifierCin,
          userByCin,
        });

        const filename = `WitnessList_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date(producedAt).toISOString().slice(0, 10)}.docx`;
        return { filename, base64: buf.toString("base64"), producedAt };
      }),
  }),

  // ─── WIPC (Witness Identity Protection Certificates) ───────────────────────────────────

  wipc: router({
    /** Returns the first and last running sheet dates for an operation (for deployment date auto-fill) */
    getOperationSheetDates: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        const sheets = await getRunningSheetsByOperation(input.operationId);
        if (!sheets || sheets.length === 0) return { start: null, end: null };
        // Extract date from YYYYMMDD prefix in title, fall back to createdAt
        const getDate = (s: typeof sheets[0]) => {
          const m = s.title.match(/^(\d{4})(\d{2})(\d{2})/);
          if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          return s.createdAt instanceof Date ? s.createdAt.getTime() : new Date(s.createdAt).getTime();
        };
        const dates = sheets.map(getDate).sort((a, b) => a - b);
        const toISO = (ts: number) => {
          const d = new Date(ts);
          const y = d.getUTCFullYear();
          const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
          const dy = String(d.getUTCDate()).padStart(2, "0");
          return `${y}-${mo}-${dy}`;
        };
        return { start: toISO(dates[0]), end: toISO(dates[dates.length - 1]) };
      }),

    generateStatDec: protectedProcedure
      .input(
        z.object({
          operationName: z.string().min(1),
          declarantFullName: z.string().min(1),
          witnessFullName: z.string().min(1),
          declarationDate: z.string().min(1), // ISO date string e.g. "2026-07-04"
        }),
      )
      .mutation(async ({ input }) => {
        const producedAt = Date.now();
        const buf = await generateStatDecDocx({
          declarantFullName: input.declarantFullName,
          witnessFullName: input.witnessFullName,
          declaredBeforeName: input.declarantFullName,
          declarationDate: input.declarationDate,
        });
        const filename = `StatDec_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${input.declarationDate}.docx`;
        return { filename, base64: buf.toString("base64"), producedAt };
      }),

    generateWipcRequest: protectedProcedure
      .input(
        z.object({
          operationName: z.string().min(1),
          operationDetails: z.string().default(""),
          courtDate: z.string().min(1),
          courtLocation: z.string().min(1),
          requestingCommander: z.string().min(1),
          assistantCommissioner: z.string().min(1),
          isUrgent: z.boolean(),
          requestingOfficerFullName: z.string().min(1),
          requestingOfficerAfpId: z.string().min(1),
          requestingOfficerWorkLocation: z.string().min(1),
          requestingOfficerPortfolio: z.string().min(1),
          requestingOfficerContact: z.string().min(1),
          members: z.array(z.object({
            fullName: z.string(),
            dob: z.string(),
            afpId: z.string(),
            isUco: z.boolean(),
            isOco: z.boolean(),
            isCin: z.boolean(),
            cinNumber: z.string(),
            aiInitials: z.string(),
            aiKnownAs: z.string(),
            deploymentStart: z.string(),
            deploymentEnd: z.string(),
          })).default([]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const producedAt = Date.now();
        const buf = await generateWipcRequestDocx({
          operationName: input.operationName,
          operationDetails: input.operationDetails,
          courtDate: input.courtDate,
          courtLocation: input.courtLocation,
          requestingCommander: input.requestingCommander,
          assistantCommissioner: input.assistantCommissioner,
          isUrgent: input.isUrgent,
          requestingOfficerFullName: input.requestingOfficerFullName,
          requestingOfficerAfpId: input.requestingOfficerAfpId,
          requestingOfficerWorkLocation: input.requestingOfficerWorkLocation,
          requestingOfficerPortfolio: input.requestingOfficerPortfolio,
          requestingOfficerContact: input.requestingOfficerContact,
          members: input.members,
        });
        const filename = `WIPCRequest_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${input.courtDate}.docx`;
        // Audit log the generation
        await createWipcAuditEntry({ userId: ctx.user.id, action: "GENERATE_WIPC", detail: input.operationName });
        return { filename, base64: buf.toString("base64"), producedAt };
      }),

    // ── Vault: Officer Profile ─────────────────────────────────────────────────
    getOfficerProfile: protectedProcedure.query(async ({ ctx }) => {
      await createWipcAuditEntry({ userId: ctx.user.id, action: "READ_OFFICER" });
      return getWipcOfficerProfile(ctx.user.id);
    }),

    saveOfficerProfile: protectedProcedure
      .input(z.object({
        fullName: z.string().min(1),
        afpId: z.string().min(1),
        workLocation: z.string().optional(),
        portfolio: z.string().optional(),
        contactNumber: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertWipcOfficerProfile(ctx.user.id, input);
        await createWipcAuditEntry({ userId: ctx.user.id, action: "SAVE_OFFICER" });
        return { ok: true };
      }),

    // ── Vault: Member Registry (admin only) ───────────────────────────────────
    listMembers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required for WIPC member registry" });
      await createWipcAuditEntry({ userId: ctx.user.id, action: "READ_MEMBERS" });
      return listWipcMembers();
    }),

    saveMember: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        fullName: z.string().min(1),
        dob: z.string().optional(),
        afpId: z.string().min(1),
        cinNumber: z.string().optional(),
        aiInitials: z.string().optional(),
        aiKnownAs: z.string().optional(),
        isUco: z.boolean().default(false),
        isOco: z.boolean().default(false),
        isCin: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        if (input.id) {
          await updateWipcMember(input.id, input);
          await createWipcAuditEntry({ userId: ctx.user.id, action: "UPDATE_MEMBER", targetId: input.id, detail: "updated" });
          return { ok: true, id: input.id };
        } else {
          const result = await createWipcMember(ctx.user.id, input);
          await createWipcAuditEntry({ userId: ctx.user.id, action: "SAVE_MEMBER", detail: "created" });
          return { ok: true, id: (result as { insertId?: number })?.insertId };
        }
      }),

    deleteMember: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        await createWipcAuditEntry({ userId: ctx.user.id, action: "DELETE_MEMBER", targetId: input.id });
        await deleteWipcMember(input.id);
        return { ok: true };
      }),

    getVaultAuditLog: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      return getWipcAuditLog(500);
    }),
  }),

  // ─── Recycle Bin ──────────────────────────────────────────────────────────────
  recycleBin: router({
    list: protectedProcedure.query(async () => {
      await purgeExpiredRecycleBinItems();
      return getRecycleBinItems();
    }),
    reinstate: protectedProcedure
      .input(z.object({ type: z.enum(["operation", "sheet", "target", "map_marker", "attachment"]), id: z.number() }))
      .mutation(async ({ input }) => {
        if (input.type === "operation") await reinstateOperation(input.id);
        else if (input.type === "sheet") await reinstateSheet(input.id);
        else if (input.type === "map_marker") await reinstateCustomMarker(input.id);
        else if (input.type === "attachment") await reinstateAttachment(input.id);
        else await reinstateTarget(input.id);
        return { success: true };
      }),
    hardDelete: adminProcedure
      .input(z.object({ type: z.enum(["operation", "sheet", "target", "map_marker", "attachment"]), id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.type === "operation") {
          await deleteOperation(input.id);
          await createAuditLog({ sheetId: 0, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "operation_status_changed", details: `Operation permanently deleted from Recycle Bin by CIN ${ctx.user.cin ?? "Unknown"}`, createdAt: Date.now() });
        } else if (input.type === "sheet") {
          await deleteRunningSheet(input.id);
          await createAuditLog({ sheetId: input.id, userId: ctx.user.id, userName: ctx.user.cin ?? "Unknown", userCIN: ctx.user.cin ?? undefined, action: "sheet_deleted", details: `Sheet permanently deleted from Recycle Bin`, createdAt: Date.now() });
        } else if (input.type === "map_marker") {
          await hardDeleteCustomMarker(input.id);
        } else if (input.type === "attachment") {
          await deleteRowAttachment(input.id);
        } else {
          await deleteTarget(input.id);
        }
        return { success: true };
      }),
  }),
  // ─── Custom Map Markers ──────────────────────────────────────────────────────

  customMarker: router({
    list: protectedProcedure
      .input(z.object({ operationIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        return getCustomMarkers(input.operationIds);
      }),

    create: protectedProcedure
      .input(z.object({
        lat: z.number(),
        lng: z.number(),
        markerIcon: z.string().min(1),
        markerColour: z.string().min(1),
        label: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
        operationId: z.number().optional().nullable(),
        targetId: z.number().optional().nullable(),
        assocPersons: z.array(z.string()).optional(),
        assocVehicles: z.array(z.string()).optional(),
        rotation: z.number().min(0).max(359).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createCustomMarker({
          createdBy: ctx.user.id,
          lat: input.lat,
          lng: input.lng,
          markerIcon: input.markerIcon,
          markerColour: input.markerColour,
          label: input.label ?? null,
          address: input.address ?? null,
          note: input.note ?? null,
          operationId: input.operationId ?? null,
          targetId: input.targetId ?? null,
          assocPersons: input.assocPersons ?? [],
          assocVehicles: input.assocVehicles ?? [],
          rotation: input.rotation ?? 0,
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        markerIcon: z.string().optional(),
        markerColour: z.string().optional(),
        note: z.string().optional().nullable(),
        operationId: z.number().optional().nullable(),
        targetId: z.number().optional().nullable(),
        assocPersons: z.array(z.string()).optional(),
        assocVehicles: z.array(z.string()).optional(),
        rotation: z.number().min(0).max(359).optional(),
        linkedIntelLabel: z.string().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await updateCustomMarker(id, rest);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const cin = ctx.user.cin ?? ctx.user.name ?? "unknown";
        await softDeleteCustomMarker(input.id, cin);
        return { success: true };
      }),
  }),

  // ─── RS Mapping ──────────────────────────────────────────────────────────────────
  rsMapping: router({
    getStaticMapImage: protectedProcedure
      .input(z.object({
        waypoints: z.array(z.object({
          lat: z.number(),
          lng: z.number(),
          index: z.number(),
          colour: z.string().optional(),
          label: z.string().optional(),  // single-char label override (A-Z)
        })),
        center: z.object({ lat: z.number(), lng: z.number() }).optional(),
        zoom: z.number().optional(),
        size: z.string().optional(),
        routePath: z.string().optional(),  // pipe-separated lat,lng pairs for route polyline
      }))
      .query(async ({ input }) => {
        const { ENV } = await import("./_core/env");
        // A directly-owned Google Maps Platform key takes priority over the
        // Manus forge proxy, so this works outside the Manus hosting environment.
        const url = ENV.googleMapsApiKey
          ? new URL("https://maps.googleapis.com/maps/api/staticmap")
          : new URL(`${ENV.forgeApiUrl.replace(/\/+$/, "")}/v1/maps/proxy/maps/api/staticmap`);
        url.searchParams.append("key", ENV.googleMapsApiKey || ENV.forgeApiKey);

        // Size defaults to 800x500 landscape for PDF
        const size = input.size ?? "800x500";
        url.searchParams.append("size", size);
        url.searchParams.append("maptype", "roadmap");
        url.searchParams.append("scale", "2");

        // Center / zoom — auto-fit if not provided
        if (input.center) {
          url.searchParams.append("center", `${input.center.lat},${input.center.lng}`);
        }
        if (input.zoom !== undefined) {
          url.searchParams.append("zoom", String(input.zoom));
        }

        // Add route polyline path if provided
        if (input.routePath) {
          url.searchParams.append("path", `color:0x1E88E5C0|weight:3|${input.routePath}`);
        }

        // Add markers for each waypoint — use label override if provided (must be single char)
        for (const wp of input.waypoints) {
          const colour = wp.colour ? wp.colour.replace("#", "0x") : "0x6366f1";
          const labelChar = wp.label ? wp.label.charAt(0) : String(wp.index).charAt(0);
          const markerSpec = `color:${colour}|label:${labelChar}|${wp.lat},${wp.lng}`;
          url.searchParams.append("markers", markerSpec);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          const errText = await response.text();
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Static Maps API failed: ${response.status} ${errText.slice(0, 200)}`,
          });
        }

        const contentType = response.headers.get("content-type") ?? "image/png";
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUrl = `data:${contentType};base64,${base64}`;
        return { dataUrl };
      }),

    getWaypoints: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getRsMappingWaypoints(input.sheetId);
      }),
    upsertWaypoint: protectedProcedure
      .input(z.object({
        sheetId: z.number(),
        rowId: z.number(),
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
        comment: z.string().optional().nullable(),
        markerIcon: z.string().optional().nullable(),
        markerColour: z.string().optional().nullable(),
        markerRotation: z.number().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await upsertRsMappingWaypoint({
          sheetId: input.sheetId,
          rowId: input.rowId,
          createdBy: ctx.user.id,
          lat: input.lat,
          lng: input.lng,
          comment: input.comment,
          markerIcon: input.markerIcon,
          markerColour: input.markerColour,
          markerRotation: input.markerRotation,
        });
        return { id };
      }),

  }),
  // ─── Sidebar Preferences ──────────────────────────────────────────────────
  sidebar: router({
    getOrder: protectedProcedure.query(async ({ ctx }) => {
      const order = await getSidebarOrder(ctx.user.id);
      return { order, defaultOrder: DEFAULT_SIDEBAR_ORDER };
    }),
    setOrder: protectedProcedure
      .input(z.object({ orderedKeys: z.array(z.string()) }))
      .mutation(async ({ input, ctx }) => {
        await setSidebarOrder(ctx.user.id, input.orderedKeys);
        return { ok: true };
      }),
    getHomePrefs: protectedProcedure.query(async ({ ctx }) => {
      const prefs = await getHomePrefs(ctx.user.id);
      return { ...prefs, defaultTileOrder: DEFAULT_TILE_ORDER };
    }),
    setHomePrefs: protectedProcedure
      .input(z.object({
        mode: z.enum(["folder", "tile"]).optional(),
        tileOrder: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await setHomePrefs(ctx.user.id, input);
        return { ok: true };
      }),
  }),

  // ─── Reports ────────────────────────────────────────────────────────────────
  reports: router({
    /**
     * Returns all non-deleted, non-closed running sheets with full status info
     * for the Reports page (incomplete sheets).
     */
    incompleteSheets: protectedProcedure.query(async () => {
      return getIncompleteRunningSheets();
    }),

    /**
     * Returns all users ranked by total outstanding to-do actions.
     */
    outstandingTodos: protectedProcedure.query(async () => {
      return getOutstandingTodosByUser();
    }),
  }),

  // ─── Operation Manager ─────────────────────────────────────────────────────
  opManager: router({
    listUsers: certifierOrAdminProcedure.query(async () => {
      const users = await getAllUsers();
      return users.map((u) => ({ id: u.id, name: u.name, cin: u.cin ?? null, phone: u.phone ?? null }));
    }),

    getPriorityBoard: certifierOrAdminProcedure
      .input(z.object({ weekStart: z.string() }))
      .query(async ({ input }) => {
        return getOpManagerPriorityBoard(input.weekStart);
      }),

    savePriorityBoard: certifierOrAdminProcedure
      .input(z.object({
        weekStart: z.string(),
        rows: z.array(z.object({
          id: z.number().optional(),
          category: z.string(),
          priority: z.number(),
          operationId: z.number().nullable().optional(),
          operationName: z.string().nullable().optional(),
          team: z.string().nullable().optional(),
          requestType: z.string().nullable().optional(),
          sortOrder: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        await saveOpManagerPriorityBoard(input.weekStart, input.rows);
        return { ok: true };
      }),

    getTaskingCalendar: certifierOrAdminProcedure
      .input(z.object({ weekStart: z.string() }))
      .query(async ({ input }) => {
        return getOpManagerTaskingCalendar(input.weekStart);
      }),

    saveTaskingCell: certifierOrAdminProcedure
      .input(z.object({
        weekStart: z.string(),
        dayIndex: z.number().min(0).max(6),
        teamRow: z.string(),
        shiftTime: z.string().nullable().optional(),
        primaryTask: z.string().nullable().optional(),
        secondaryTask: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { weekStart, dayIndex, teamRow, ...data } = input;
        await saveOpManagerTaskingCell(weekStart, dayIndex, teamRow, data);
        return { ok: true };
      }),

    getSupervisorContacts: certifierOrAdminProcedure
      .input(z.object({ weekStart: z.string() }))
      .query(async ({ input }) => {
        return getOpManagerSupervisorContacts(input.weekStart);
      }),

    saveSupervisorContacts: certifierOrAdminProcedure
      .input(z.object({
        weekStart: z.string(),
        contacts: z.array(z.object({
          id: z.number().optional(),
          role: z.string(),
          userId: z.number().nullable().optional(),
          customName: z.string().nullable().optional(),
          phone: z.string().nullable().optional(),
          sortOrder: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        await saveOpManagerSupervisorContacts(input.weekStart, input.contacts);
        return { ok: true };
      }),


    // ── All weeks folder list ──────────────────────────────────────────────────
    listAllWeeks: protectedProcedure.query(async () => {
      return listAllOpManagerWeeks();
    }),

    copyWeek: adminProcedure
      .input(z.object({ fromWeekStart: z.string(), toWeekStart: z.string() }))
      .mutation(async ({ input }) => {
        return copyOpManagerWeek(input.fromWeekStart, input.toWeekStart);
      }),

    // ── Posted weeks ──────────────────────────────────────────────────────────
    getPostedWeeks: protectedProcedure.query(async () => {
      return getPostedWeeks();
    }),

    isWeekPosted: protectedProcedure
      .input(z.object({ weekStart: z.string() }))
      .query(async ({ input }) => {
        return { posted: await isWeekPosted(input.weekStart) };
      }),

    postWeek: adminProcedure
      .input(z.object({
        weekStart: z.string(),
        userIds: z.array(z.number()).optional(), // if provided, notify only these users
      }))
      .mutation(async ({ ctx, input }) => {
        await markWeekPosted(input.weekStart, ctx.user.id);
        const weekLabel = new Date(input.weekStart + "T00:00:00Z").toLocaleDateString("en-AU", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
        });
        const title = "New CTO Tasking Posted";
        const body = `CTO Tasking for the week of ${weekLabel} has been posted.`;
        const url = "/operation-manager";
        if (input.userIds && input.userIds.length > 0) {
          await sendPushToUsers(input.userIds, title, body, url)
            .catch((err) => console.warn("[Push] Failed to send targeted notifications:", err));
        } else {
          await sendPushToAll(title, body, url)
            .catch((err) => console.warn("[Push] Failed to send notifications:", err));
        }
        return { ok: true };
      }),

    // ── Push subscriptions ────────────────────────────────────────────────────
    subscribePush: protectedProcedure
      .input(z.object({
        endpoint: z.string(),
        p256dh: z.string(),
        auth: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await savePushSubscription(ctx.user.id, input.endpoint, input.p256dh, input.auth);
        return { ok: true };
      }),

    unsubscribePush: protectedProcedure
      .input(z.object({ endpoint: z.string() }))
      .mutation(async ({ input }) => {
        await removePushSubscription(input.endpoint);
        return { ok: true };
      }),
  }),

  // ─── Travelled Via Auto-fill ────────────────────────────────────────────────
  travelledVia: router({
    /**
     * Given two address strings (departure and arrival), geocodes them, calls
     * the Google Directions API, and returns a formatted street list in the
     * prescribed RS format:
     *   First Street, SUBURB,
     *   Middle Street,
     *   Last Street, SUBURB, whereat;
     */
    getStreets: protectedProcedure
      .input(z.object({
        departAddress: z.string().min(1),
        arriveAddress: z.string().min(1),
        // Raw observation text from surrounding rows — used to extract suburb directly
        // from the text (e.g. "arrived at 288 Canning Highway, BICTON WA") which is
        // more reliable than geocoding when addresses straddle suburb boundaries.
        departObsText: z.string().optional(),
        arriveObsText: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // TEMP DIAGNOSTIC — remove once the "tv" geocoding issue is confirmed fixed.
        console.log("[tv-geocode] input:", { departAddress: input.departAddress, arriveAddress: input.arriveAddress });
        // ── Helper: geocode an address string → LatLng ──────────────────────
        async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; suburb: string } | null> {
          const fullQuery = address + ", Western Australia, Australia";
          try {
            const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
              address: fullQuery,
              region: "au",
            });
            // TEMP DIAGNOSTIC — remove once the "tv" geocoding issue is confirmed fixed.
            console.log("[tv-geocode]", { query: fullQuery, status: result.status, resultCount: result.results?.length ?? 0 });
            if (result.status !== "OK" || !result.results.length) return null;
            const loc = result.results[0].geometry.location;
            // Extract suburb (locality) from address components
            const components = result.results[0].address_components;
            const localityComp = components.find((c) => c.types.includes("locality"));
            const suburb = localityComp ? localityComp.long_name.toUpperCase() : "";
            return { lat: loc.lat, lng: loc.lng, suburb };
          } catch (err) {
            // TEMP DIAGNOSTIC — remove once the "tv" geocoding issue is confirmed fixed.
            console.log("[tv-geocode] THREW:", { query: fullQuery, error: err instanceof Error ? err.message : String(err) });
            return null;
          }
        }

        // ── Helper: strip HTML tags from Directions step instructions ────────
        function stripHtml(html: string): string {
          return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }

        // ── Helper: extract road name from a Directions step ─────────────────
        // Google Directions steps have html_instructions like:
        //   "Turn left onto <b>Canning Highway</b>"
        //   "Merge onto <b>Canning Hwy</b>/<wbr/><b>State Route 6</b>"
        //   "Head north on <b>Stock Road</b>"
        // We extract the first meaningful bold segment (road name), ignoring
        // state/national route numbers and directional words.
        function extractRoadName(htmlInstructions: string): string | null {
          const boldRe = /<b>([^<]+)<\/b>/g;
          const boldMatches: string[] = [];
          let bm: RegExpExecArray | null;
          while ((bm = boldRe.exec(htmlInstructions)) !== null) boldMatches.push(bm[1].trim());

          // Filter out: directional words, ordinal numbers, compass directions,
          // and ALL route/highway number codes in any form:
          //   "State Route 6", "State Rte 6", "State Rte60", "National Route 1",
          //   "National Highway 1", "Federal Route 1", "A1", "M2", bare numbers.
          const isJunk = (s: string) =>
            /^(left|right|north|south|east|west|northeast|northwest|southeast|southwest|slight|sharp|u-turn)$/i.test(s) ||
            /^\d+(st|nd|rd|th)$/i.test(s) ||
            /^(state|national|federal|nat|natl)\s*(route|rte|rte\.?|highway|hwy|road|rd)\s*\d+/i.test(s) ||
            /^(route|rte)\s*\d+/i.test(s) ||
            /^[A-Z]{1,2}\d+$/.test(s) ||
            /^\d+$/.test(s);

          // Prefer the first non-junk bold segment (road name comes first in Google's instructions)
          const roadName = boldMatches.find((m) => m.length > 2 && !isJunk(m));
          if (roadName) return roadName;

          // Fallback: plain text, take everything after the last preposition
          const plain = stripHtml(htmlInstructions);
          const ontoMatch = plain.match(/(?:onto|on|toward)\s+(.+)$/i);
          if (ontoMatch) {
            return ontoMatch[1].replace(/\s*\/.*$/, "").trim();
          }
          return null;
        }

        // ── Helper: extract suburb from geocoded reverse lookup at a LatLng ──
        async function reverseGeocodeSuburb(lat: number, lng: number): Promise<string> {
          try {
            const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
              latlng: `${lat},${lng}`,
              result_type: "locality",
              region: "au",
            });
            if (result.status !== "OK" || !result.results.length) return "";
            const components = result.results[0].address_components;
            const localityComp = components.find((c) => c.types.includes("locality"));
            return localityComp ? localityComp.long_name.toUpperCase() : "";
          } catch {
            return "";
          }
        }

        // ── 1. Geocode both addresses ────────────────────────────────────────
        const [departGeo, arriveGeo] = await Promise.all([
          geocodeAddress(input.departAddress),
          geocodeAddress(input.arriveAddress),
        ]);

        if (!departGeo || !arriveGeo) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not geocode one or both addresses. Please check the surrounding rows have valid addresses.",
          });
        }

        // ── 2. Call Directions API ───────────────────────────────────────────
        const directions = await makeRequest<DirectionsResult>("/maps/api/directions/json", {
          origin: `${departGeo.lat},${departGeo.lng}`,
          destination: `${arriveGeo.lat},${arriveGeo.lng}`,
          mode: "driving",
          region: "au",
        });

        if (directions.status !== "OK" || !directions.routes.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Directions API returned no route (status: ${directions.status}). Try entering the addresses manually.`,
          });
        }

        const steps = directions.routes[0].legs[0].steps;

        // ── 3. Extract unique road names in order ────────────────────────────
        const roadNames: string[] = [];
        for (const step of steps) {
          const name = extractRoadName(step.html_instructions);
          if (name && name !== roadNames[roadNames.length - 1]) {
            roadNames.push(name);
          }
        }

        if (roadNames.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not extract street names from the route. Please enter the streets manually.",
          });
        }

        // ── 4. Get suburbs for first and last road ───────────────────────────
        // Priority order for suburb:
        //   1. Extract directly from raw observation text (most reliable — the text
        //      already contains the correct suburb e.g. "BICTON WA", "MOUNT LAWLEY").
        //   2. Fall back to suburb from geocoded address components.
        function extractSuburbFromText(text: string): string {
          if (!text) return "";
          // Match ALL-CAPS suburb name after a comma, optionally followed by WA
          // e.g. ", BICTON WA", ", MOUNT LAWLEY WA", ", ARDROSS ("
          const m = text.match(/,\s*([A-Z][A-Z ]{1,30})(?:\s+WA|\s+Western Australia)?(?:[\s,)\n]|$)/);
          if (m) return m[1].trim().replace(/\s+WA$/, "").trim();
          return "";
        }

        const firstSuburb =
          (input.departObsText ? extractSuburbFromText(input.departObsText) : "") ||
          departGeo.suburb;
        const lastSuburb =
          (input.arriveObsText ? extractSuburbFromText(input.arriveObsText) : "") ||
          arriveGeo.suburb;

        // ── 5. Format the street list ────────────────────────────────────────
        // Format:
        //   First Street, SUBURB,
        //   Middle Street,
        //   Last Street, SUBURB, whereat;
        const lines: string[] = [];
        for (let i = 0; i < roadNames.length; i++) {
          const name = roadNames[i];
          if (i === 0 && roadNames.length === 1) {
            // Only one street — combine first+last format
            const suburb = firstSuburb || lastSuburb;
            lines.push(suburb ? `${name}, ${suburb}, whereat;` : `${name}, whereat;`);
          } else if (i === 0) {
            lines.push(firstSuburb ? `${name}, ${firstSuburb},` : `${name},`);
          } else if (i === roadNames.length - 1) {
            lines.push(lastSuburb ? `${name}, ${lastSuburb}, whereat;` : `${name}, whereat;`);
          } else {
            lines.push(`${name},`);
          }
        }

        return { streets: lines.join("\n") };
      }),
  }),

  // ─── Admin Utilities ────────────────────────────────────────────────────────
  adminUtils: router({
    backfillGoogleAddresses: adminProcedure.mutation(async () => {
      const result = await backfillGoogleAddressesInObservations();
      return result;
    }),
  }),
});
export type AppRouter = typeof appRouter;
