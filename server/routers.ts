import bcrypt from "bcryptjs";
import { format } from "date-fns";
import { storageGetBytes } from "./storage";
import { detectAndEmbedFaces, cosineSimilarity } from "./faceRecognition";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, SESSION_EXPIRY_MS, COLOR_PALETTES } from "@shared/const";
import { buildRunningSheetTitle } from "@shared/runningSheetTitle";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  processAttachmentUpload,
  processManualAttachmentUpload,
  AttachmentUploadError,
} from "./attachmentUpload";
import { systemRouter } from "./_core/systemRouter";
import {
  getAllCtoRosterTeams,
  getAllCtoRosterMembers,
  getCtoRosterShiftsForDateRange,
  getCtoRosterShiftsForMember,
  upsertCtoRosterShift,
  bulkUpdateCtoRosterShifts,
  bulkCopyCtoRosterShifts,
  addCtoRosterMember,
  deleteCtoRosterMember,
  moveCtoRosterMember,
  changeCtoRosterMemberTeam,
  setCtoRosterMemberExcludedFromCounts,
  getRelevantCtoRosterSecondments,
  createCtoRosterSecondment,
  updateCtoRosterSecondment,
  deleteCtoRosterSecondment,
  reorderCtoRosterMembers,
  writeCtoRosterAudit,
  getAllCtoRosterDrafts,
  getCtoRosterDraftById,
  createCtoRosterDraft,
  createStandaloneCtoRosterDraft,
  deleteCtoRosterDraft,
  renameCtoRosterDraft,
  setCtoRosterDraftTimeframe,
  getCtoRosterDraftShifts,
  upsertCtoRosterDraftShift,
  bulkUpsertCtoRosterDraftShifts,
  getCtoRosterDraftMergeDiff,
  mergeCtoRosterDraft,
  getCtoRosterDraftTeamsAndMembers,
  addCtoRosterDraftTeam,
  renameCtoRosterDraftTeam,
  deleteCtoRosterDraftTeam,
  addCtoRosterDraftMember,
  renameCtoRosterDraftMember,
  deleteCtoRosterDraftMember,
  moveCtoRosterDraftMember,
  saveCtoRosterDraftAsRoster,
  getAllCtoRosterSavedRosters,
  getCtoRosterSavedRosterById,
  deleteCtoRosterSavedRoster,
  renameCtoRosterSavedRoster,
  setCtoRosterSavedRosterTimeframe,
  getCtoRosterSavedRosterTeamsAndMembers,
  getCtoRosterSavedRosterShifts,
  upsertCtoRosterSavedRosterShift,
  bulkUpsertCtoRosterSavedRosterShifts,
  addCtoRosterSavedRosterTeam,
  renameCtoRosterSavedRosterTeam,
  deleteCtoRosterSavedRosterTeam,
  addCtoRosterSavedRosterMember,
  renameCtoRosterSavedRosterMember,
  deleteCtoRosterSavedRosterMember,
  moveCtoRosterSavedRosterMember,
  getAllCtoRosterEbaRules,
  updateCtoRosterEbaRule,
  runCtoRosterEbaCheck,
  getCtoRosterOutlookSettings,
  updateCtoRosterOutlookSettings,
  getCtoRosterAuditLog,
  repeatCtoRosterCycle,
  detectCtoRosterCycle,
  addCtoRosterTeam,
  renameCtoRosterTeam,
  deleteCtoRosterTeam,
  reorderCtoRosterTeams,
  upsertRosterShiftNotification,
  getWeeklyTaskingReport,
} from "./ctoRoster";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import {
  addRowMember,
  createAuditLog,
  createCertification,
  createOperation,
  createRunningSheet,
  recomputeRunningSheetTitle,
  recomputeRunningSheetTitlesForOperation,
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
  getSheetEntityChips,
  getRunningSheetById,
  computeWitnessListData,
  getRunningSheets,
  addDaysISO,
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
  findPossibleDuplicateTarget,
  mergeTargetFieldDetails,
  getTargetFieldHistory,
  setSheetTarget,
  deepSearchOperations,
  getAllIntelligenceEntities,
  getIntelligenceHeatMapLocations,
  getIntelTargetPatternOfLife,
  extractEntitiesFromText,
  checkPossibleDuplicates,
  markEntitiesNotDuplicate,
  mergeEntities,
  unmergeEntity,
  listEntityMerges,
  getKnownPersonNameCorrection,
  checkPossibleTargetMatches,
  confirmPersonNameMatch,
  rejectPersonNameMatch,
  searchIntelligenceEntities,
  listShortcuts,
  createShortcut,
  updateShortcut,
  deleteShortcut,
  getGovernanceRecord,
  upsertGovernanceRecord,
  type GovernanceUpsertInput,
  getGovernanceRecordsBySheetIds,
  computeGovernancePercent,
  getSheetSummary,
  upsertSheetSummary,
  orderTeamCins,
  extractSummaryLocation,
  computeSheetSummaryVehicles,
  getSheetSummaryEntries,
  updateSheetSummaryEntry,
  deleteSheetSummaryEntry,
  getSheetSummarySupportHistory,
  getMostRecentSheetSummaryForOperation,
  getSheetSummariesForOperation,
  getRollupExportData,
  completeSheetSummary,
  reopenSheetSummary,
  addManualSheetSummaryEntry,
  setSheetSummaryEntryTime,
  getGovernanceTodoForCin,
  getUnlinkedImagesTodoForCin,
  getOperationDeleteStats,
  getTargetShortcuts,
  createTargetShortcut,
  updateTargetShortcut,
  deleteTargetShortcut,
  getTargetShortcutsForSheet,
  getAllTargetsForRegistry,
  createRegistryTarget,
  getAssociatesForTarget,
  getAssociatesForTargetWithIndices,
  getAssociateById,
  createAssociate,
  updateAssociate,
  softDeleteAssociate,
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
  getUserLocationHistories,
  getCustomMarkers,
  createCustomMarker,
  updateCustomMarker,
  softDeleteCustomMarker,
  reinstateCustomMarker,
  hardDeleteCustomMarker,
  backfillGoogleAddressesInObservations,
  getOrphanedAttachments,
  purgeOrphanedAttachments,
  getRsMappingWaypoints,
  upsertRsMappingWaypoint,
  geocodeAddressList,
  getIncompleteRunningSheets,
  getOutstandingTodosByUser,
  getWeeklyActivityReport,
  getSidebarOrder,
  setSidebarOrder,
  DEFAULT_SIDEBAR_ORDER,
  createRowAttachment,
  getAttachmentsByRowIds,
  getAttachmentById,
  getAttachmentsByOperationId,
  getAttachmentCountsByOperation,
  getAttachmentsBySheetId,
  deleteRowAttachment,
  softDeleteAttachment,
  reinstateAttachment,
  linkAttachmentToEntity,
  unlinkAttachmentFromEntity,
  getEntityLinksByAttachmentId,
  getEntityLinkCounts,
  getAttachmentsForEntity,
  getLinkedOperationsForEntity,
  createPersonDetection,
  findSimilarFaces,
  FACE_MATCH_THRESHOLD,
  confirmFaceMatch as confirmFaceMatchDb,
  createFaceMatchDismissal,
  type FaceMatchCandidate,
  createNotificationsForUsers,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteReadNotificationsForUser,
  purgeExpiredNotifications,
} from "./db";

import {
  makeRequest,
  type RoadsResult,
  type DirectionsResult,
  type GeocodingResult,
} from "./_core/map";
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
} from "./db";

// ─── Role Guards ──────────────────────────────────────────────────────────────

/** Member or Admin can certify/uncertify */
const certifierOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "member" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Member or Admin role required.",
    });
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
  if (!op)
    throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found." });
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
  if (!sheet)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  await guardActiveOperation(sheet.operationId);
}

// Structured input fields shared by target.create/update and
// target.registry.create/update (and the associate.* router) — the raw
// controlled parts a Target/Associate's name/tgt, hbf/hb, v1f/v1 are
// composed from client-side, kept here so re-editing later starts from the
// same structured values instead of just the composed strings.
const structuredTargetFieldsSchema = {
  firstNames: z.string().optional().nullable(),
  surname: z.string().optional().nullable(),
  bornDate: z.string().optional().nullable(), // ISO yyyy-mm-dd
  addrUnitNo: z.string().optional().nullable(),
  addrHouseNo: z.string().optional().nullable(),
  addrStreetName: z.string().optional().nullable(),
  addrStreetType: z.string().optional().nullable(),
  addrSuburb: z.string().optional().nullable(),
  addrState: z.string().optional().nullable(),
  vehRegistration: z.string().optional().nullable(),
  vehState: z.string().optional().nullable(),
  vehColour: z.string().optional().nullable(),
  vehMake: z.string().optional().nullable(),
  vehModel: z.string().optional().nullable(),
  vehType: z.string().optional().nullable(),
  extraAddresses: z.string().optional().nullable(), // JSON array of {label?,unitNo,houseNo,streetName,streetType,suburb,state,full,short}
};

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ─── Profile ─────────────────────────────────────────────────────────────────

  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      // Never return passwordHash to the client
      const { passwordHash: _ph, ...safe } = user;
      return safe;
    }),

    updatePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(1, "New password is required."),
          confirmPassword: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.newPassword !== input.confirmPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New passwords do not match.",
          });
        }
        const user = await getUserById(ctx.user.id);
        if (!user)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found.",
          });
        const valid = await bcrypt.compare(
          input.currentPassword,
          user.passwordHash
        );
        if (!valid)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect.",
          });
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

    updateRosterShiftNotifPref: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await updateUser(ctx.user.id, {
          rosterShiftNotificationsEnabled: input.enabled,
        });
        return { success: true };
      }),

    updateColorPalette: protectedProcedure
      .input(
        z.object({
          palette: z.enum(
            COLOR_PALETTES.map(p => p.id) as [string, ...string[]]
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await updateUser(ctx.user.id, { colorPalette: input.palette });
        return { success: true };
      }),
  }),

  // ─── Auth ────────────────────────────────────────────────────────────────────

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(
        z.object({ username: z.string().min(1), password: z.string().min(1) })
      )
      .mutation(async ({ input, ctx }) => {
        let user;
        try {
          user = await getUserByUsername(input.username.trim().toLowerCase());
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "The server is temporarily unavailable. Please wait a moment and try again.",
          });
        }
        if (!user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid username or password.",
          });

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid username or password.",
          });

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
      .input(
        z.object({
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters."),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await updateUser(ctx.user.id, {
          passwordHash,
          mustChangePassword: false,
        });
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
        })
      )
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
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          promisNumber: z.string().optional().nullable(),
          imsNumber: z.string().optional().nullable(),
          investigationUnit: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await updateOperation(id, rest);
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
      .query(async ({ input }) => {
        return deepSearchOperations(input.query);
      }),

    listByStatus: protectedProcedure
      .input(
        z.object({ status: z.enum(["active", "before_court", "archive"]) })
      )
      .query(async ({ input }) => {
        return getOperationsByStatus(input.status);
      }),

    listAll: protectedProcedure.query(async () => {
      return getAllOperations();
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
          targetSurname: target?.surname ?? null,
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
      return getOutstandingSheetsForCin(cin);
    }),

    governanceTodo: protectedProcedure.query(async ({ ctx }) => {
      const cin = ctx.user.cin;
      if (!cin) return [];
      return getGovernanceTodoForCin(cin);
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
          const certRowIds = new Set(certs.map(c => c.rowId));
          // A row is certified if every non-spacer member in that row has an active cert
          const nonSpacerMembers = members.filter(
            m => m.memberName !== "__SPACE__"
          );
          const allMembersCertified = nonSpacerMembers.every(m =>
            certRowIds.has(m.rowId)
          );
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
  }),

  // ─── Sheet Rows ──────────────────────────────────────────────────────────────

  row: router({
    list: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const rows = await getRowsBySheetId(input.sheetId);
        const rowIds = rows.map(r => r.id);
        const [members, certs, attachments] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
          getAttachmentsByRowIds(rowIds),
        ]);
        return rows.map(row => ({
          ...row,
          members: members.filter(m => m.rowId === row.id),
          certifications: certs.filter(c => c.rowId === row.id && c.isActive),
          attachments: attachments.filter(a => a.rowId === row.id),
        }));
      }),

    // Quick-insert chips (person/vehicle/address/business) mined from this
    // sheet's own observations so far — see getSheetEntityChips.
    entityChips: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getSheetEntityChips(input.sheetId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          sheetId: z.number(),
          time: z.string().optional(),
          timeMinutes: z.number().optional(),
          dayOffset: z.number().optional(),
          rowDate: z.string().optional(),
          observation: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await guardActiveSheet(input.sheetId);
        const existingRows = await getRowsBySheetId(input.sheetId);
        const rowNumber = existingRows.length + 1;
        // A row always gets a concrete rowDate at creation, even when the
        // caller doesn't supply one — derived from the sheet's picker date
        // (sheetDate), never left to be inferred later from createdAt, which
        // is just when this DB row happened to be inserted and can differ
        // from the sheet's actual calendar date (e.g. a sheet backfilled for
        // a past/future date). Legacy sheets with no sheetDate yet are the
        // only case this still leaves null.
        let rowDate = input.rowDate;
        if (!rowDate) {
          const sheet = await getRunningSheetById(input.sheetId);
          if (sheet?.sheetDate) {
            rowDate = addDaysISO(sheet.sheetDate, input.dayOffset ?? 0);
          }
        }
        const id = await createSheetRow({
          sheetId: input.sheetId,
          rowNumber,
          time: input.time,
          timeMinutes: input.timeMinutes,
          dayOffset: input.dayOffset ?? 0,
          rowDate,
          observation: input.observation,
          isLocked: false,
        });
        await createAuditLog({
          sheetId: input.sheetId,
          rowId: id,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "row_created",
          details: `Row ${rowNumber} created`,
          createdAt: Date.now(),
        });
        return { id, rowNumber };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          time: z.string().optional(),
          timeMinutes: z.number().optional(),
          dayOffset: z.number().optional(),
          rowDate: z.string().optional(),
          observation: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Row is locked. Uncertify to edit.",
          });
        const { id, ...data } = input;
        await updateSheetRow(id, data);
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: id,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "row_updated",
          details: `Row updated`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.id);
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked)
          throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await deleteSheetRow(input.id);
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.id,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "row_deleted",
          details: `Row deleted`,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
  }),

  // ─── Row Attachments (photos) ───────────────────────────────────────────────

  attachment: router({
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
    countsByOperation: protectedProcedure.query(async () => {
      return getAttachmentCountsByOperation();
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
          ]),
          targetId: z.number().optional(),
          entityLabel: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        if (input.category === "target" && !input.targetId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "targetId is required for target links.",
          });
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

    // Every entity a given photo is currently linked to — powers the
    // "Currently linked" list in LinkAttachmentDialog.
    linksFor: protectedProcedure
      .input(z.object({ attachmentId: z.number() }))
      .query(async ({ input }) => {
        return getEntityLinksByAttachmentId(input.attachmentId);
      }),

    entityLinkCounts: protectedProcedure.query(async () => {
      return getEntityLinkCounts();
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
      .query(async ({ input }) => {
        return getAttachmentsForEntity(input);
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
      .query(async ({ input }) => {
        if (input.category === "target") {
          if (!input.targetId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "targetId is required.",
            });
          const links = await getLinkedOperationsForTarget(input.targetId);
          return links.map(l => ({
            id: l.operationId,
            name: l.operationName ?? "Unknown",
          }));
        }
        if (!input.entityLabel)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "entityLabel is required.",
          });
        return getLinkedOperationsForEntity(input.category, input.entityLabel);
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
          const faces = await detectAndEmbedFaces(buffer);
          return faces.map((f, index) => ({
            index,
            bbox: f.bbox,
            confidence: f.confidence,
          }));
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
            .array(
              z.object({ attachmentId: z.number(), faceIndex: z.number() })
            )
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

    // Officer accepted a suggested possible-match — whichever side is the
    // stronger identification (Target/Associate over Unidentified Person)
    // wins the merge (see confirmFaceMatch in db.ts).
    confirmFaceMatch: protectedProcedure
      .input(z.object({ newLinkId: z.number(), matchedLinkId: z.number() }))
      .mutation(async ({ input }) => {
        await confirmFaceMatchDb(input.newLinkId, input.matchedLinkId);
        return { success: true };
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
  }),

  // ─── Row Members ─────────────────────────────────────────────────────────────

  member: router({
    add: protectedProcedure
      .input(z.object({ rowId: z.number(), memberName: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked)
          throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        const SPACER = "__SPACE__";
        const cinUpper = input.memberName.trim().toUpperCase();
        // Allow spacer entries; validate all real CINs against registered users
        if (cinUpper !== SPACER) {
          const allRegisteredUsers = await getAllUsers();
          const registeredCins = new Set(
            allRegisteredUsers.map(u => u.cin.toUpperCase())
          );
          if (!registeredCins.has(cinUpper)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `CIN "${cinUpper}" is not a registered user. Only registered CINs can be added.`,
            });
          }
        }
        // Assign sortOrder = current max + 1 so new entries go to the bottom
        const existingMembers = await getMembersByRowIds([input.rowId]);
        const maxOrder = existingMembers.reduce(
          (m, e) => Math.max(m, (e as any).sortOrder ?? 0),
          0
        );
        const id = await addRowMember({
          rowId: input.rowId,
          memberName: cinUpper,
          sortOrder: maxOrder + 1,
        });
        if (cinUpper !== SPACER) {
          await createAuditLog({
            sheetId: row.sheetId,
            rowId: input.rowId,
            memberId: id,
            userId: ctx.user.id,
            userName: ctx.user.cin ?? "Unknown",
            userCIN: ctx.user.cin ?? undefined,
            action: "member_added",
            details: `CIN ${cinUpper} added to row`,
            createdAt: Date.now(),
          });
        }
        return { id };
      }),

    reorder: protectedProcedure
      .input(z.object({ rowId: z.number(), orderedIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked)
          throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await reorderRowMembers(input.rowId, input.orderedIds);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number(), rowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const row = await getRowById(input.rowId);
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
        await guardActiveSheet(row.sheetId);
        if (row.isLocked)
          throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
        await removeRowMember(input.id);
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          memberId: input.id,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "member_removed",
          details: `CIN removed from row`,
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
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        // Member role: can only certify their own CIN
        if (ctx.user.role === "member") {
          const members = await getMembersByRowIds([input.rowId]);
          const member = members.find(m => m.id === input.memberId);
          if (!member)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Member not found.",
            });
          const userCIN = ctx.user.cin ?? ctx.user.username ?? "";
          if (member.memberName.toLowerCase() !== userCIN.toLowerCase()) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only certify your own CIN.",
            });
          }
        }

        const existing = await getCertificationByMember(
          input.rowId,
          input.memberId
        );
        if (existing)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Member already certified.",
          });

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
        const rowMembers = members.filter(
          m => m.rowId === input.rowId && m.memberName !== "__SPACE__"
        );
        const activeCerts = certs.filter(
          c => c.rowId === input.rowId && c.isActive
        );
        const allCertified =
          rowMembers.length > 0 &&
          rowMembers.every(m => activeCerts.some(c => c.memberId === m.id));

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
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only certify your own CIN.",
            });
          }
        }
        const members = await getMembersByCINAndSheet(input.sheetId, input.cin);
        const uncertifiedMembers = [];
        for (const member of members) {
          if (member.rowIsLocked) continue; // skip already fully-locked rows
          const existing = await getCertificationByMember(
            member.rowId,
            member.id
          );
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
          const realMembers = rowMembers.filter(
            m => m.memberName !== "__SPACE__"
          );
          const allCertified =
            realMembers.length > 0 &&
            realMembers.every(m =>
              rowCerts.some(c => c.memberId === m.id && c.isActive)
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
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        // Member role: can only unlock rows that contain their own CIN
        if (ctx.user.role === "member") {
          const rowMembers = await getMembersByRowIds([input.rowId]);
          const userCIN = (
            ctx.user.cin ??
            ctx.user.username ??
            ""
          ).toLowerCase();
          const hasCIN = rowMembers.some(
            m => m.memberName.toLowerCase() === userCIN
          );
          if (!hasCIN)
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only unlock rows that contain your CIN.",
            });
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
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

        // Member role: can only bulk-unlock rows that contain their own CIN
        if (ctx.user.role === "member") {
          const rowMembers = await getMembersByRowIds([input.rowId]);
          const userCIN = (
            ctx.user.cin ??
            ctx.user.username ??
            ""
          ).toLowerCase();
          const hasCIN = rowMembers.some(
            m => m.memberName.toLowerCase() === userCIN
          );
          if (!hasCIN)
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only unlock rows that contain your CIN.",
            });
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

  // ─── In-app Notifications ───────────────────────────────────────────────────
  // General-purpose inbox any module can write into (opManager's postWeek is
  // the first user) — reliable counterpart to browser push, which depends on
  // OS permissions/per-device subscriptions and is broken outright on iOS
  // Safari unless installed as a home-screen PWA.
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Opportunistic purge (no cron — see references/periodic-updates.md),
      // same pattern as recycleBin.list below.
      await purgeExpiredNotifications();
      return getNotificationsForUser(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return { count: await getUnreadNotificationCount(ctx.user.id) };
    }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id, ctx.user.id);
        return { ok: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { ok: true };
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteNotification(input.id, ctx.user.id);
        return { ok: true };
      }),

    clearRead: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteReadNotificationsForUser(ctx.user.id);
      return { ok: true };
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
        if (!sheet)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Sheet not found.",
          });
        const operation = sheet.operationId
          ? await getOperationById(sheet.operationId)
          : null;
        const target = sheet.targetId
          ? await getTargetById(sheet.targetId)
          : null;
        const rows = await getRowsBySheetId(input.id);
        const rowIds = rows.map(r => r.id);
        const [members, certs, attachments] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
          getAttachmentsByRowIds(rowIds),
        ]);
        return {
          sheet,
          operation,
          targetFullName: target?.name ?? sheet.targetName ?? null,
          rows: rows.map(row => ({
            ...row,
            members: members.filter(m => m.rowId === row.id),
            certifications: certs.filter(c => c.rowId === row.id),
            attachments: attachments.filter(a => a.rowId === row.id),
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
      .input(
        z.object({
          name: z.string().min(1),
          cin: z.string().min(1),
          unit: z.string().optional(),
          team: z.enum(["TEAM1", "TEAM2", "PTT"]).optional(),
          phone: z.string().optional(),
          username: z.string().min(1),
          password: z.string().min(1),
          role: z.enum(["observer", "member", "admin"]),
        })
      )
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
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          cin: z.string().min(1).optional(),
          unit: z.string().optional(),
          team: z.enum(["TEAM1", "TEAM2", "PTT"]).nullable().optional(),
          phone: z.string().nullable().optional(),
          username: z.string().min(1).optional(),
          password: z.string().min(1).optional(),
          role: z.enum(["observer", "member", "admin"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, password, ...rest } = input;
        const updateData: Record<string, unknown> = { ...rest };
        if (password) {
          updateData.passwordHash = await bcrypt.hash(password, 12);
        }
        if (rest.cin) updateData.cin = rest.cin.toUpperCase();
        if (rest.username)
          updateData.username = rest.username.trim().toLowerCase();
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
        if (input.id === ctx.user.id)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete your own account.",
          });
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
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["observer", "member", "admin"]),
        })
      )
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
      return all.map(u => ({
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
        // Title's (TARGET) segment is auto-derived — resync it.
        await recomputeRunningSheetTitle(input.sheetId);
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
        .input(
          z.object({
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
            ...structuredTargetFieldsSchema,
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { linkToOperationId, ...data } = input;
          const result = await createRegistryTarget({
            ...data,
            createdBy: ctx.user.id,
          });
          if (linkToOperationId) {
            await linkTargetToOperation(result.id, linkToOperationId);
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
          })
        )
        .mutation(async ({ input, ctx }) => {
          return mergeTargetFieldDetails(
            input.targetId,
            input.resolutions,
            input.appendExtraVehicles ?? [],
            input.appendWildFields ?? [],
            ctx.user.cin ?? null
          );
        }),

      /** "Previous" values recorded when a field was resolved in favor of the other side during a merge — never deleted, just superseded. */
      getFieldHistory: protectedProcedure
        .input(z.object({ targetId: z.number() }))
        .query(async ({ input }) => {
          return getTargetFieldHistory(input.targetId);
        }),
    }),
  }),

  // ─── Associates ──────────────────────────────────────────────────────────────
  // A person linked to a target as a known associate — structured the same
  // way as a target (own name/address/vehicle), via the same controlled
  // Name → Address → Vehicle process.

  associate: router({
    /** List associates for a target */
    listForTarget: protectedProcedure
      .input(z.object({ targetId: z.number() }))
      .query(async ({ input }) => {
        return getAssociatesForTargetWithIndices(input.targetId);
      }),

    /** Get a single associate by id */
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return (await getAssociateById(input.id)) ?? null;
      }),

    /** Create a new associate of a target */
    create: protectedProcedure
      .input(
        z.object({
          targetId: z.number(),
          name: z.string().min(1).max(255),
          tgt: z.string().optional().nullable(),
          hbf: z.string().optional().nullable(),
          hb: z.string().optional().nullable(),
          v1f: z.string().optional().nullable(),
          v1: z.string().optional().nullable(),
          extraVehicles: z.string().optional().nullable(),
          ...structuredTargetFieldsSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        return createAssociate({ ...input, createdBy: ctx.user.id });
      }),

    /** Update an associate */
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
          extraVehicles: z.string().optional().nullable(),
          ...structuredTargetFieldsSchema,
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updateAssociate(id, data);
      }),

    /** Delete (soft) an associate */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await softDeleteAssociate(input.id, ctx.user.cin ?? "Unknown");
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
      .input(
        z.object({
          trigger: z.string().min(1).max(64).toLowerCase(),
          expansion: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await createShortcut({
          trigger: input.trigger.toLowerCase(),
          expansion: input.expansion,
          createdBy: ctx.user.id,
        });
        return { success: true };
      }),
    /** Update a shortcut — admin only */
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          trigger: z.string().min(1).max(64).optional(),
          expansion: z.string().min(1).optional(),
          showInRs: z.boolean().optional(),
        })
      )
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
    getDeviceToken: protectedProcedure.query(async ({ ctx }) => {
      // Parse cookies manually from the raw header (no cookie-parser middleware)
      const cookieHeader = ctx.req.headers.cookie || "";
      const cookies: Record<string, string> = {};
      cookieHeader.split(";").forEach(part => {
        const [k, ...v] = part.trim().split("=");
        if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
      });
      const existing = cookies["runlog_device_token"];
      if (existing && existing.length > 8) {
        return { deviceToken: existing };
      }
      // Generate a new stable token
      const token = `dt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      // Set as a long-lived non-httpOnly cookie so JS can read it
      const isSecure =
        ctx.req.protocol === "https" ||
        ((ctx.req.headers["x-forwarded-proto"] as string) || "").includes(
          "https"
        );
      const cookieVal = `runlog_device_token=${token}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=None${isSecure ? "; Secure" : ""}`;
      ctx.res.setHeader("Set-Cookie", cookieVal);
      return { deviceToken: token };
    }),

    /** List all extracted entities from all observation rows */
    getEntities: protectedProcedure.query(async () => {
      return getAllIntelligenceEntities();
    }),

    /** Heat Map: location visit counts + coordinates for one Operation,
     * optionally narrowed to one Target, over a When window. */
    getHeatMapLocations: protectedProcedure
      .input(
        z.object({
          operationId: z.number(),
          targetId: z.number().nullable().optional(),
          when: z.discriminatedUnion("mode", [
            z.object({ mode: z.literal("sheet"), sheetId: z.number() }),
            z.object({ mode: z.literal("all") }),
            z.object({ mode: z.literal("last7") }),
            z.object({ mode: z.literal("last30") }),
            z.object({
              mode: z.literal("custom"),
              startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            }),
          ]),
        })
      )
      .query(async ({ input }) => {
        return getIntelligenceHeatMapLocations(input);
      }),

    /** Pattern of Life: time/location analysis for one target within one
     * operation — activity by day & time, where & when (location × time),
     * and home presence/departure-return times. */
    getPatternOfLife: protectedProcedure
      .input(z.object({ operationId: z.number(), targetId: z.number() }))
      .query(async ({ input }) => {
        const result = await getIntelTargetPatternOfLife(
          input.operationId,
          input.targetId
        );
        if (!result)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Operation or target not found.",
          });
        return result;
      }),

    /** Association graph — nodes and weighted edges from entity co-occurrence */
    getAssociationGraph: protectedProcedure
      .input(
        z.object({
          operationIds: z.array(z.number()).optional(),
        })
      )
      .query(async ({ input }) => {
        return getAssociationGraph(input.operationIds);
      }),

    /** Target intelligence profile */
    targetProfile: protectedProcedure
      .input(z.object({ targetId: z.number() }))
      .query(async ({ input }) => {
        const profile = await getIntelTargetProfile(input.targetId);
        if (!profile)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target not found.",
          });
        return profile;
      }),

    /** Operation intelligence profile */
    operationProfile: protectedProcedure
      .input(z.object({ operationId: z.number() }))
      .query(async ({ input }) => {
        const profile = await getIntelOperationProfile(input.operationId);
        if (!profile)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Operation not found.",
          });
        return profile;
      }),

    /** Associate intelligence profile (by label/name) */
    associateProfile: protectedProcedure
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => {
        const profile = await getIntelAssociateProfile(input.label);
        if (!profile)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Associate not found.",
          });
        return profile;
      }),

    /** Vehicle intelligence profile (by label) */
    vehicleProfile: protectedProcedure
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => {
        const profile = await getIntelVehicleProfile(input.label);
        if (!profile)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found.",
          });
        return profile;
      }),

    /** Location intelligence profile (by label) */
    locationProfile: protectedProcedure
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => {
        const profile = await getIntelLocationProfile(input.label);
        if (!profile)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Location not found.",
          });
        return profile;
      }),

    /** Intelligence mapping — all locations with linked targets/associates/vehicles */
    mappingLocations: protectedProcedure
      .input(
        z.object({
          operationIds: z.array(z.number()).optional(),
          targetIds: z.array(z.number()).optional(),
        })
      )
      .query(async ({ input }) => {
        return getIntelMappingLocations(input.operationIds, input.targetIds);
      }),

    /** Live user locations — operation-scoped, sharing-enabled users only */
    userLocations: protectedProcedure
      .input(
        z.object({
          operationIds: z.array(z.number()).default([]),
        })
      )
      .query(async ({ input }) => {
        return getUserLocations(input.operationIds);
      }),

    /** Update (upsert) the caller's location and sharing preference */
    updateUserLocation: protectedProcedure
      .input(
        z.object({
          deviceId: z.string(),
          lat: z.number(),
          lng: z.number(),
          operationIds: z.array(z.number()).default([]),
          sharingEnabled: z.boolean(),
          speed: z.number().nullable().optional(),
          heading: z.number().nullable().optional(),
          accuracy: z.number().nullable().optional(),
        })
      )
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
          input.accuracy ?? null
        );
        return { ok: true };
      }),

    /** Recorded trail for the given users since sinceMs — powers the map's live-trace lines */
    userLocationHistories: protectedProcedure
      .input(
        z.object({
          userIds: z.array(z.number()),
          sinceMs: z.number(),
        })
      )
      .query(async ({ input }) => {
        return getUserLocationHistories(input.userIds, input.sinceMs);
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

    /** Preview the entities a chunk of observation text would extract, without saving anything. */
    previewEntities: protectedProcedure
      .input(z.object({ text: z.string() }))
      .query(async ({ input }) => {
        return extractEntitiesFromText(input.text);
      }),

    /** Fuzzy-duplicate check for a not-yet-saved entity label — backs the live confirm-dialog prompt. */
    checkPossibleDuplicates: protectedProcedure
      .input(
        z.object({
          type: z.enum(["person", "vehicle", "address", "business"]),
          label: z.string().min(1),
        })
      )
      .query(async ({ input }) => {
        return checkPossibleDuplicates(input.type, input.label);
      }),

    /** Records "these are NOT the same entity" so the prompt never asks about this pair again. */
    markEntitiesNotDuplicate: protectedProcedure
      .input(
        z.object({
          type: z.enum(["person", "vehicle", "address", "business"]),
          labelA: z.string().min(1),
          labelB: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await markEntitiesNotDuplicate(
          input.type,
          input.labelA,
          input.labelB,
          ctx.user.cin ?? undefined
        );
        return { ok: true };
      }),

    /** Confirms two entities are the same — used by both the auto-prompt "Yes" and the manual Merge Entities tool. */
    mergeEntities: protectedProcedure
      .input(
        z.object({
          type: z.enum(["person", "vehicle", "address", "business"]),
          winnerLabel: z.string().min(1),
          loserLabel: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          await mergeEntities(
            input.type,
            input.winnerLabel,
            input.loserLabel,
            ctx.user.cin ?? undefined
          );
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Merge failed.",
          });
        }
        return { ok: true };
      }),

    /** Reverses a previous merge. */
    unmergeEntity: protectedProcedure
      .input(
        z.object({
          type: z.enum(["person", "vehicle", "address", "business"]),
          loserKey: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        await unmergeEntity(input.type, input.loserKey);
        return { ok: true };
      }),

    /** Lists all confirmed entity merges (most recent first) — backs an "undo merge" view. */
    listEntityMerges: protectedProcedure.query(async () => {
      return listEntityMerges();
    }),

    /** Silent lookup: has this exact spelling already been confirmed against a Target/Associate? Backs auto-correcting a row's text on save without re-prompting. */
    getKnownPersonNameCorrection: protectedProcedure
      .input(z.object({ spelling: z.string().min(1) }))
      .query(async ({ input }) => {
        return getKnownPersonNameCorrection(input.spelling);
      }),

    /** Fuzzy-match a not-yet-saved person mention against the Target/Associate Registry — backs the save-time "is this an existing Target?" prompt. */
    checkPossibleTargetMatches: protectedProcedure
      .input(z.object({ label: z.string().min(1) }))
      .query(async ({ input }) => {
        return checkPossibleTargetMatches(input.label);
      }),

    /** Confirms a spelling belongs to an existing Target/Associate — this and future exact matches auto-correct silently from now on. */
    confirmPersonNameMatch: protectedProcedure
      .input(
        z.object({
          spelling: z.string().min(1),
          targetId: z.number().optional(),
          associateId: z.number().optional(),
          correctSpelling: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!input.targetId && !input.associateId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Either targetId or associateId is required.",
          });
        }
        await confirmPersonNameMatch({
          ...input,
          decidedByCIN: ctx.user.cin ?? undefined,
        });
        return { ok: true };
      }),

    /** Records "not the same person" so this exact pairing isn't asked about again. */
    rejectPersonNameMatch: protectedProcedure
      .input(
        z.object({
          spelling: z.string().min(1),
          targetId: z.number().optional(),
          associateId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!input.targetId && !input.associateId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Either targetId or associateId is required.",
          });
        }
        await rejectPersonNameMatch({
          ...input,
          decidedByCIN: ctx.user.cin ?? undefined,
        });
        return { ok: true };
      }),

    /** Substring search over existing entities of one type — backs the manual Merge Entities picker and the Target Registry autocomplete. */
    searchEntities: protectedProcedure
      .input(
        z.object({
          type: z.enum(["person", "vehicle", "address", "business"]),
          query: z.string().default(""),
          excludeTargets: z.boolean().default(true),
        })
      )
      .query(async ({ input }) => {
        return searchIntelligenceEntities(
          input.type,
          input.query,
          input.excludeTargets
        );
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
          const dueDate =
            new Date(sheet.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000;
          record = await upsertGovernanceRecord({
            sheetId: input.sheetId,
            dueDate,
          });
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
        const sheetIds = sheets.map(s => s.id);
        const rowIds: number[] = [];
        const rowsBySheet: Record<number, { id: number }[]> = {};
        for (const s of sheets) {
          const rows = await getRowsBySheetId(s.id);
          rowsBySheet[s.id] = rows;
          rows.forEach(r => rowIds.push(r.id));
        }
        const [allMembers, allCerts, govRecords] = await Promise.all([
          getMembersByRowIds(rowIds),
          getCertificationsByRowIds(rowIds),
          getGovernanceRecordsBySheetIds(sheetIds),
        ]);
        return sheets.map(sheet => {
          const rows = rowsBySheet[sheet.id] ?? [];
          const allSigned =
            rows.length > 0 &&
            rows.every(r => {
              const members = allMembers.filter(m => m.rowId === r.id);
              return (
                members.length > 0 &&
                members.every(m =>
                  allCerts.some(
                    c => c.rowId === r.id && c.memberId === m.id && c.isActive
                  )
                )
              );
            });
          const rec = govRecords.find(g => g.sheetId === sheet.id) ?? null;
          const percent = computeGovernancePercent(rec, allSigned);
          const isOverdue =
            rec?.dueDate != null && Date.now() > rec.dueDate && percent < 100;
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
      .input(
        z.object({
          sheetId: z.number(),
          dueDate: z.number().nullable().optional(),
          summaryNotification: z.boolean().optional(),
          sentToIO: z.boolean().optional(),
          linked: z.boolean().optional(),
          savedInOpFolder: z.boolean().optional(),
          savedInInvestigatorTransferDrive: z.boolean().optional(),
          imageryTaken: z.boolean().optional(),
          coverPage: z.boolean().optional(),
          // Which field was toggled (so server can attach CIN automatically)
          toggledField: z
            .enum([
              "summaryNotification",
              "sentToIO",
              "linked",
              "savedInOpFolder",
              "savedInInvestigatorTransferDrive",
              "imageryTaken",
              "coverPage",
            ])
            .optional(),
          // New value of the toggled field (true = ticked, false = unticked)
          toggledValue: z.boolean().optional(),
          sheetCell: z.string().nullable().optional(),
          imageryEntries: z
            .array(
              z.object({
                cin: z.string(),
                rowTime: z.string(),
                type: z.enum(["photo", "video", ""]),
                saved: z.boolean(),
              })
            )
            .optional(),
          notes: z.string().nullable().optional(),
        })
      )
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
            linked: "linkedCIN",
            savedInOpFolder: "savedInOpFolderCIN",
            savedInInvestigatorTransferDrive:
              "savedInInvestigatorTransferDriveCIN",
            imageryTaken: "imageryTakenCIN",
            coverPage: "coverPageCIN",
          };
          const nameFieldMap: Record<string, keyof GovernanceUpsertInput> = {
            summaryNotification: "isurvName",
            sentToIO: "sentToIOName",
            linked: "linkedName",
            savedInOpFolder: "savedInOpFolderName",
            savedInInvestigatorTransferDrive:
              "savedInInvestigatorTransferDriveName",
            imageryTaken: "imageryTakenName",
            coverPage: "coverPageName",
          };
          const cinField = cinFieldMap[input.toggledField];
          const nameField = nameFieldMap[input.toggledField];
          if (cinField)
            (cinUpdate as Record<string, string | null>)[cinField] = cinValue;
          if (nameField)
            (cinUpdate as Record<string, string | null>)[nameField] = nameValue;
        }
        const record = await upsertGovernanceRecord({
          ...input,
          ...cinUpdate,
        } as Parameters<typeof upsertGovernanceRecord>[0]);

        // Keep the RS Summary tab's own complete/reopen state in sync with
        // this checkbox, and vice versa (see summary.complete/summary.reopen
        // below) — the two are meant to always agree.
        if (input.toggledField === "summaryNotification") {
          const existingSummary = await getSheetSummary(input.sheetId);
          if (input.toggledValue) {
            if (!existingSummary)
              await upsertSheetSummary({ sheetId: input.sheetId });
            if (!existingSummary?.completedAt)
              await completeSheetSummary(input.sheetId, userCIN);
          } else if (existingSummary?.completedAt) {
            await reopenSheetSummary(input.sheetId, userCIN);
          }
        }
        return record;
      }),
  }),

  // ─── Sheet Summary ──────────────────────────────────────────────────────────
  summary: router({
    /** Get (or auto-create, prepopulated from the sheet) the summary for a sheet */
    getBySheet: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });
        let record = await getSheetSummary(input.sheetId);

        // Start/finish time track the RS's own first/last timed row until
        // the supervisor manually edits one — same "sync until touched"
        // rule as sheetSummaryEntries.edited.
        const rows = await getRowsBySheetId(input.sheetId);
        const timedRows = rows
          .filter(r => r.time)
          .sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0));
        const derivedStartTime = timedRows[0]?.time ?? null;
        const derivedFinishTime = timedRows[timedRows.length - 1]?.time ?? null;

        if (!record) {
          const operation = sheet.operationId
            ? await getOperationById(sheet.operationId)
            : null;
          const target = sheet.targetId
            ? await getTargetById(sheet.targetId)
            : null;
          let cinRoster: { cin: string; isTeamLeader?: boolean }[] = [];
          try {
            cinRoster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
          } catch {
            cinRoster = [];
          }

          // Team label: derived from CTO Roster team membership by CIN —
          // "Team 1"/"Team 2" if every CIN on the sheet belongs to the same
          // roster team, "Blended" if they span more than one, null if none
          // of the CINs are found on the roster at all.
          const [rosterMembers, rosterTeams] = await Promise.all([
            getAllCtoRosterMembers(),
            getAllCtoRosterTeams(),
          ]);
          const teamNameByCin = new Map(
            rosterMembers.map(m => [
              m.cin,
              rosterTeams.find(t => t.id === m.teamId)?.name,
            ])
          );
          const matchedTeamNames = new Set(
            cinRoster
              .map(c => teamNameByCin.get(c.cin))
              .filter((n): n is string => !!n)
          );
          const teamLabel =
            matchedTeamNames.size === 1
              ? Array.from(matchedTeamNames)[0]
              : matchedTeamNames.size > 1
                ? "Blended"
                : null;

          // Carry forward Investigator, Intel Support, Special Projects and
          // Objectives from the most recent summary for the SAME target on
          // this Operation (falls back to the most recent summary on the
          // Operation when this sheet has no target) — everything else
          // (including the Communication section) starts fresh on a new
          // summary.
          const priorSummary = sheet.operationId
            ? await getMostRecentSheetSummaryForOperation(
                sheet.operationId,
                input.sheetId,
                sheet.targetId ?? null
              )
            : null;

          record = await upsertSheetSummary({
            sheetId: input.sheetId,
            teamLabel,
            teamCins: orderTeamCins(cinRoster).join(", ") || null,
            operationName: operation?.name ?? null,
            dayDate: sheet.sheetDate
              ? format(new Date(`${sheet.sheetDate}T00:00:00`), "d MMMM yyyy")
              : format(new Date(sheet.createdAt), "d MMMM yyyy"),
            startTime: derivedStartTime,
            finishTime: derivedFinishTime,
            targetName: target?.name ?? sheet.targetName ?? null,
            location: extractSummaryLocation(rows),
            ioSupport: priorSummary?.ioSupport ?? null,
            intelSupport: priorSummary?.intelSupport ?? null,
            specialProjects: priorSummary?.specialProjects ?? null,
            objectives: priorSummary?.objectives ?? null,
          });
        } else {
          const patch: {
            sheetId: number;
            startTime?: string | null;
            finishTime?: string | null;
          } = { sheetId: input.sheetId };
          if (
            !record.startTimeEdited &&
            record.startTime !== derivedStartTime
          ) {
            patch.startTime = derivedStartTime;
          }
          if (
            !record.finishTimeEdited &&
            record.finishTime !== derivedFinishTime
          ) {
            patch.finishTime = derivedFinishTime;
          }
          if (patch.startTime !== undefined || patch.finishTime !== undefined) {
            record = await upsertSheetSummary(patch);
          }
        }
        return record;
      }),

    /** Every sheet's Supervisor Summary for an operation, newest first — the Deployment Rollup tab */
    listByOperation: protectedProcedure
      .input(
        z.object({
          operationId: z.number(),
          targetId: z.number().nullable().optional(),
        })
      )
      .query(async ({ input }) => {
        return getSheetSummariesForOperation(
          input.operationId,
          input.targetId ?? null
        );
      }),

    /** Same rows as listByOperation, but with each sheet's entries table and
     * computed vehicle list attached — feeds the Rollup PDF export, which
     * needs every card's full expanded content in one round-trip. */
    exportRollup: protectedProcedure
      .input(
        z.object({
          operationId: z.number(),
          targetId: z.number().nullable().optional(),
        })
      )
      .query(async ({ input }) => {
        return getRollupExportData(input.operationId, input.targetId ?? null);
      }),

    /** Update summary fields (free text, save-as-you-go) */
    update: protectedProcedure
      .input(
        z.object({
          sheetId: z.number(),
          teamLabel: z.string().nullable().optional(),
          teamCins: z.string().nullable().optional(),
          operationName: z.string().nullable().optional(),
          dayDate: z.string().nullable().optional(),
          startTime: z.string().nullable().optional(),
          finishTime: z.string().nullable().optional(),
          targetName: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          ioSupport: z.string().nullable().optional(),
          intelSupport: z.string().nullable().optional(),
          specialProjects: z.string().nullable().optional(),
          ioContactTiming: z.string().nullable().optional(),
          ioContactMethod: z.string().nullable().optional(),
          objectives: z.string().nullable().optional(),
          criticalDecisions: z.string().nullable().optional(),
          issues: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getSheetSummary(input.sheetId);
        if (existing?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is complete — reopen it before editing.",
          });
        }
        const userCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        return upsertSheetSummary({
          ...input,
          lastEditedByCIN: userCIN,
          // A manual edit here sticks — stop auto-syncing that field from
          // the RS's rows (see getBySheet).
          ...(input.startTime !== undefined ? { startTimeEdited: true } : {}),
          ...(input.finishTime !== undefined ? { finishTimeEdited: true } : {}),
        });
      }),

    /** Team Leader (or Admin) acknowledges the summary is complete — locks it */
    complete: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });

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
                "Only the listed Team Leader or an Admin can complete this summary.",
            });
          }
        }

        const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
        const record = await completeSheetSummary(input.sheetId, cin);
        // Keep Governance's "Summary complete" checkbox in sync — see the
        // reverse cascade in governance.update.
        await upsertGovernanceRecord({
          sheetId: input.sheetId,
          summaryNotification: true,
          isurvCIN: cin,
          isurvName: ctx.user.name ?? cin,
        });
        await createAuditLog({
          sheetId: input.sheetId,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "summary_completed",
          details: `Summary marked complete by ${cin}`,
          createdAt: Date.now(),
        });
        return record;
      }),

    /** Reopens a completed summary — any Member or Admin, same as reopening a running sheet */
    reopen: certifierOrAdminProcedure
      .input(z.object({ sheetId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });
        const existing = await getSheetSummary(input.sheetId);
        if (!existing?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is not complete.",
          });
        }
        const cin = ctx.user.cin ?? ctx.user.name ?? "Unknown";
        const record = await reopenSheetSummary(input.sheetId, cin);
        // Keep Governance's "Summary complete" checkbox in sync — see the
        // reverse cascade in governance.update.
        await upsertGovernanceRecord({
          sheetId: input.sheetId,
          summaryNotification: false,
          isurvCIN: null,
          isurvName: null,
        });
        await createAuditLog({
          sheetId: input.sheetId,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "summary_reopened",
          details: `Summary reopened by ${cin}`,
          createdAt: Date.now(),
        });
        return record;
      }),

    /** Computed (never stored) vehicle list: Target Registry vehicles + RS-mentioned vehicles, minus dismissed */
    getVehicles: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        const sheet = await getRunningSheetById(input.sheetId);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });
        const [target, rows, record] = await Promise.all([
          sheet.targetId ? getTargetById(sheet.targetId) : null,
          getRowsBySheetId(input.sheetId),
          getSheetSummary(input.sheetId),
        ]);
        let dismissed: string[] = [];
        try {
          dismissed = record?.dismissedVehicleKeys
            ? JSON.parse(record.dismissedVehicleKeys)
            : [];
        } catch {
          dismissed = [];
        }
        return computeSheetSummaryVehicles(target ?? null, rows, dismissed);
      }),

    /** Dismiss one computed vehicle entry so it stops reappearing on this sheet's Summary tab */
    dismissVehicle: protectedProcedure
      .input(z.object({ sheetId: z.number(), key: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const record = await getSheetSummary(input.sheetId);
        if (record?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is complete — reopen it before editing.",
          });
        }
        let dismissed: string[] = [];
        try {
          dismissed = record?.dismissedVehicleKeys
            ? JSON.parse(record.dismissedVehicleKeys)
            : [];
        } catch {
          dismissed = [];
        }
        if (!dismissed.includes(input.key)) dismissed.push(input.key);
        const userCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
        await upsertSheetSummary({
          sheetId: input.sheetId,
          dismissedVehicleKeys: JSON.stringify(dismissed),
          lastEditedByCIN: userCIN,
        });
        return { success: true };
      }),

    /** Previously-used IO/Intel support names on this Operation, for autocomplete */
    getSupportHistory: protectedProcedure
      .input(
        z.object({
          operationId: z.number(),
          field: z.enum(["ioSupport", "intelSupport"]),
        })
      )
      .query(async ({ input }) => {
        return getSheetSummarySupportHistory(input.operationId, input.field);
      }),

    /** Per-RS-row summary lines (auto-syncs new rows, never touches edited/deleted ones) */
    getEntries: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getSheetSummaryEntries(input.sheetId);
      }),

    /** Add a blank, manually-added summary line for additional information */
    addEntry: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .mutation(async ({ input }) => {
        const record = await getSheetSummary(input.sheetId);
        if (record?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is complete — reopen it before editing.",
          });
        }
        return addManualSheetSummaryEntry(input.sheetId);
      }),

    /** Edit a single summary line */
    updateEntry: protectedProcedure
      .input(
        z.object({ sheetId: z.number(), id: z.number(), text: z.string() })
      )
      .mutation(async ({ input }) => {
        const record = await getSheetSummary(input.sheetId);
        if (record?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is complete — reopen it before editing.",
          });
        }
        await updateSheetSummaryEntry(input.id, input.text);
        return { success: true };
      }),

    /** Set a manually-added summary line's time — sorts it into place among the row-linked lines */
    setEntryTime: protectedProcedure
      .input(
        z.object({
          sheetId: z.number(),
          id: z.number(),
          time: z.string(),
          timeMinutes: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const record = await getSheetSummary(input.sheetId);
        if (record?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is complete — reopen it before editing.",
          });
        }
        await setSheetSummaryEntryTime(input.id, input.time, input.timeMinutes);
        return { success: true };
      }),

    /** Delete a single summary line (soft — it will never be regenerated) */
    deleteEntry: protectedProcedure
      .input(z.object({ sheetId: z.number(), id: z.number() }))
      .mutation(async ({ input }) => {
        const record = await getSheetSummary(input.sheetId);
        if (record?.completedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Summary is complete — reopen it before editing.",
          });
        }
        await deleteSheetSummaryEntry(input.id);
        return { success: true };
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
      .input(
        z.object({
          targetId: z.number(),
          trigger: z.string().min(1).max(64),
          expansion: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return createTargetShortcut({
          ...input,
          trigger: input.trigger.toLowerCase(),
          createdBy: ctx.user.id,
        });
      }),
    /** Update a target shortcut */
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          trigger: z.string().min(1).max(64).optional(),
          expansion: z.string().min(1).optional(),
        })
      )
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
       * shift occurs on the server (which runs in UTC). Operations have no
       * picker-set date field of their own, so this title-regex approach is
       * still the right one for them.
       */
      function dayStartFromTitleOrDate(
        title: string,
        createdAt: number | Date
      ): number {
        const m = title.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) {
          // Parse directly as UTC midnight — no timezone shift
          return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        }
        // No date prefix: use UTC date components of createdAt to avoid server-TZ shift
        const d = new Date(
          typeof createdAt === "number" ? createdAt : createdAt.getTime()
        );
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      }

      /** UTC-safe day start from a YYYY-MM-DD string. */
      function dayStartFromISODate(dateISO: string): number {
        const [y, mo, da] = dateISO.split("-").map(Number);
        return Date.UTC(y, mo - 1, da);
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
        // Read the sheet's picker date directly rather than re-deriving it
        // by parsing the title (title is generated from sheetDate, so this
        // used to happen to agree, but only by coincidence of format — this
        // reads the source field). Legacy sheets predating sheetDate still
        // fall back to the title/createdAt parse.
        const dayStart = sheet.sheetDate
          ? dayStartFromISODate(sheet.sheetDate)
          : dayStartFromTitleOrDate(sheet.title, sheet.createdAt);
        const op = operations.find(o => o.id === sheet.operationId);
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
        const sheets = await Promise.all(
          input.sheetIds.map(id => getRunningSheetById(id))
        );
        const validSheets = sheets.filter(Boolean) as NonNullable<
          Awaited<ReturnType<typeof getRunningSheetById>>
        >[];

        // Build per-CIN data, tracking qualifying vs excluded rows
        const cinMap = new Map<
          string,
          {
            surveillanceDates: number[];
            authorDates: number[];
            imageDates: number[];
            hasQualifyingRow: boolean;
            exclusionReasons: Set<string>;
          }
        >();

        for (const sheet of validSheets) {
          const sheetDate = sheet.sheetDate
            ? new Date(`${sheet.sheetDate}T00:00:00+08:00`).getTime()
            : new Date(sheet.createdAt).setHours(0, 0, 0, 0);
          let roster: {
            cin: string;
            hasImages?: boolean;
            isAuthor?: boolean;
          }[] = [];
          try {
            roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
          } catch {
            roster = [];
          }

          // Fetch rows for this sheet to apply exclusion rules
          const rows = await getRowsBySheetId(sheet.id);
          const rowIds = rows.map(r => r.id);
          const members =
            rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];

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
              const prevObs = (
                sortedRows[i - 1].observation ?? ""
              ).toLowerCase();
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
              .filter(m => m.memberName.toUpperCase() === cinUpper)
              .map(m => m.rowId);

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
        const userByCin = new Map(allUsers.map(u => [u.cin.toUpperCase(), u]));

        return Array.from(cinMap.entries())
          .map(([cin, data]) => {
            const user = userByCin.get(cin);
            // Build exclusion reason string if CIN has no qualifying rows
            let excludedReason: string | null = null;
            if (!data.hasQualifyingRow) {
              const reasons = Array.from(data.exclusionReasons);
              if (
                reasons.includes("surveillance-marker") &&
                reasons.includes("travelled-via")
              ) {
                excludedReason =
                  "Only appears in Surveillance Commenced/Ceased and Travelled Via rows";
              } else if (reasons.includes("surveillance-marker")) {
                excludedReason =
                  "Only appears in Surveillance Commenced/Ceased rows";
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
          })
          .sort((a, b) => a.cin.localeCompare(b.cin));
      }),

    /**
     * Generates a Base64-encoded .docx for the given CIN across the selected sheets.
     * Returns { filename, base64 } for each requested CIN.
     * CINs that only appear in excluded rows (Surveillance Commenced/Ceased or Travelled Via)
     * are skipped and returned in the `skipped` array with a reason.
     */
    generate: protectedProcedure
      .input(
        z.object({
          sheetIds: z.array(z.number()).min(1),
          cins: z.array(z.string()).min(1),
          operationName: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { generateStatementDocx } = await import("./statementGenerator");
        const JSZip = (await import("jszip")).default;

        const sheets = await Promise.all(
          input.sheetIds.map(id => getRunningSheetById(id))
        );
        const validSheets = sheets.filter(Boolean) as NonNullable<
          Awaited<ReturnType<typeof getRunningSheetById>>
        >[];

        const allUsers = await getAllUsers();
        const userByCin = new Map(allUsers.map(u => [u.cin.toUpperCase(), u]));

        // Build per-CIN data from sheets, applying exclusion rules
        // surveillanceDays: one entry per sheet, carrying date, isAuthor flag, and image times for that CIN
        const cinMap = new Map<
          string,
          {
            surveillanceDays: {
              date: number;
              isAuthor: boolean;
              imageTimes: string[];
            }[];
            hasQualifyingRow: boolean;
            exclusionReasons: Set<string>;
          }
        >();

        // Photo/video observation keyword pattern (matches PT shortcut expansion and variants)
        const PHOTO_PATTERN = /photograph|photo\/s|pt\b|video|image/i;

        for (const sheet of validSheets) {
          // Read the sheet's picker date directly (falls back to createdAt
          // only for legacy sheets predating sheetDate) — not the title,
          // which is only ever a rendering of this same field.
          let sheetDate: number;
          if (sheet.sheetDate) {
            const [y, mo, da] = sheet.sheetDate.split("-").map(Number);
            sheetDate = Date.UTC(y, mo - 1, da);
          } else {
            const d = new Date(
              sheet.createdAt instanceof Date
                ? sheet.createdAt.getTime()
                : sheet.createdAt
            );
            sheetDate = Date.UTC(
              d.getUTCFullYear(),
              d.getUTCMonth(),
              d.getUTCDate()
            );
          }

          let roster: {
            cin: string;
            hasImages?: boolean;
            isAuthor?: boolean;
          }[] = [];
          try {
            roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
          } catch {
            roster = [];
          }

          const rows = await getRowsBySheetId(sheet.id);
          const rowIds = rows.map(r => r.id);
          const members =
            rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];
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
              const prevObs = (
                sortedRows[i - 1].observation ?? ""
              ).toLowerCase();
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
              .filter(m => m.memberName.toUpperCase() === cinUpper)
              .map(m => m.rowId);

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

        const requestedCins = input.cins.map(c => c.toUpperCase());
        const results: { cin: string; filename: string; base64: string }[] = [];
        const skipped: { cin: string; reason: string }[] = [];

        for (const cin of requestedCins) {
          const data = cinMap.get(cin);
          if (!data) continue;

          // Skip CINs with no qualifying rows
          if (!data.hasQualifyingRow) {
            const reasons = Array.from(data.exclusionReasons);
            let reason = "No qualifying observation rows found";
            if (
              reasons.includes("surveillance-marker") &&
              reasons.includes("travelled-via")
            ) {
              reason =
                "Only appears in Surveillance Commenced/Ceased and Travelled Via rows";
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
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No matching CINs found in the selected sheets.",
          });
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

        return {
          results,
          skipped,
          zipBase64,
          operationName: input.operationName,
          producedAt,
        };
      }),
  }),

  // ─── Witness List ─────────────────────────────────────────────────────────
  witnessList: router({
    /**
     * Returns the same structured witness-list data the .docx generator uses
     * (see computeWitnessListData in db.ts), for the client-side PDF export —
     * both paths classify witnesses identically since they share this function.
     */
    getData: protectedProcedure
      .input(
        z.object({
          sheetIds: z.array(z.number()).min(1),
          operationName: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        return computeWitnessListData(
          input.sheetIds,
          input.operationName,
          ctx.user.cin ?? "UNKNOWN"
        );
      }),

    /**
     * Generates a witness list document for the selected running sheets.
     * Primary witnesses: CINs that appear on at least one non-excluded row.
     * Secondary witnesses: CINs that ONLY appear on excluded rows (travelled via,
     *   surveillance commenced/ceased).
     * Returns a base64-encoded .docx.
     */
    generate: protectedProcedure
      .input(
        z.object({
          sheetIds: z.array(z.number()).min(1),
          operationName: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { generateWitnessListDocx } = await import(
          "./witnessListGenerator"
        );

        const data = await computeWitnessListData(
          input.sheetIds,
          input.operationName,
          ctx.user.cin ?? "UNKNOWN"
        );
        const buf = await generateWitnessListDocx(data);

        const filename = `WitnessList_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date(data.producedAt).toISOString().slice(0, 10)}.docx`;
        return {
          filename,
          base64: buf.toString("base64"),
          producedAt: data.producedAt,
        };
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
        // Read the sheet's picker date directly, falling back to createdAt
        // only for legacy sheets predating sheetDate.
        const getDate = (s: (typeof sheets)[0]) => {
          if (s.sheetDate) {
            const [y, mo, da] = s.sheetDate.split("-").map(Number);
            return Date.UTC(y, mo - 1, da);
          }
          return s.createdAt instanceof Date
            ? s.createdAt.getTime()
            : new Date(s.createdAt).getTime();
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
        })
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
          members: z
            .array(
              z.object({
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
              })
            )
            .default([]),
        })
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
        await createWipcAuditEntry({
          userId: ctx.user.id,
          action: "GENERATE_WIPC",
          detail: input.operationName,
        });
        return { filename, base64: buf.toString("base64"), producedAt };
      }),

    // ── Vault: Officer Profile ─────────────────────────────────────────────────
    getOfficerProfile: protectedProcedure.query(async ({ ctx }) => {
      await createWipcAuditEntry({
        userId: ctx.user.id,
        action: "READ_OFFICER",
      });
      return getWipcOfficerProfile(ctx.user.id);
    }),

    saveOfficerProfile: protectedProcedure
      .input(
        z.object({
          fullName: z.string().min(1),
          afpId: z.string().min(1),
          workLocation: z.string().optional(),
          portfolio: z.string().optional(),
          contactNumber: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertWipcOfficerProfile(ctx.user.id, input);
        await createWipcAuditEntry({
          userId: ctx.user.id,
          action: "SAVE_OFFICER",
        });
        return { ok: true };
      }),

    // ── Vault: Member Registry (admin only) ───────────────────────────────────
    listMembers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required for WIPC member registry",
        });
      await createWipcAuditEntry({
        userId: ctx.user.id,
        action: "READ_MEMBERS",
      });
      return listWipcMembers();
    }),

    saveMember: protectedProcedure
      .input(
        z.object({
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
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        if (input.id) {
          await updateWipcMember(input.id, input);
          await createWipcAuditEntry({
            userId: ctx.user.id,
            action: "UPDATE_MEMBER",
            targetId: input.id,
            detail: "updated",
          });
          return { ok: true, id: input.id };
        } else {
          const result = await createWipcMember(ctx.user.id, input);
          await createWipcAuditEntry({
            userId: ctx.user.id,
            action: "SAVE_MEMBER",
            detail: "created",
          });
          return { ok: true, id: (result as { insertId?: number })?.insertId };
        }
      }),

    deleteMember: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        await createWipcAuditEntry({
          userId: ctx.user.id,
          action: "DELETE_MEMBER",
          targetId: input.id,
        });
        await deleteWipcMember(input.id);
        return { ok: true };
      }),

    getVaultAuditLog: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
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
      .input(
        z.object({
          type: z.enum([
            "operation",
            "sheet",
            "target",
            "map_marker",
            "attachment",
          ]),
          id: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.type === "operation") await reinstateOperation(input.id);
        else if (input.type === "sheet") await reinstateSheet(input.id);
        else if (input.type === "map_marker")
          await reinstateCustomMarker(input.id);
        else if (input.type === "attachment")
          await reinstateAttachment(input.id);
        else await reinstateTarget(input.id);
        return { success: true };
      }),
    hardDelete: adminProcedure
      .input(
        z.object({
          type: z.enum([
            "operation",
            "sheet",
            "target",
            "map_marker",
            "attachment",
          ]),
          id: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.type === "operation") {
          await deleteOperation(input.id);
          await createAuditLog({
            sheetId: 0,
            userId: ctx.user.id,
            userName: ctx.user.cin ?? "Unknown",
            userCIN: ctx.user.cin ?? undefined,
            action: "operation_status_changed",
            details: `Operation permanently deleted from Recycle Bin by CIN ${ctx.user.cin ?? "Unknown"}`,
            createdAt: Date.now(),
          });
        } else if (input.type === "sheet") {
          await deleteRunningSheet(input.id);
          await createAuditLog({
            sheetId: input.id,
            userId: ctx.user.id,
            userName: ctx.user.cin ?? "Unknown",
            userCIN: ctx.user.cin ?? undefined,
            action: "sheet_deleted",
            details: `Sheet permanently deleted from Recycle Bin`,
            createdAt: Date.now(),
          });
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
      .input(
        z.object({
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
        })
      )
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
      .input(
        z.object({
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
        })
      )
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
      .input(
        z.object({
          waypoints: z.array(
            z.object({
              lat: z.number(),
              lng: z.number(),
              index: z.number(),
              colour: z.string().optional(),
              label: z.string().optional(), // single-char label override (A-Z)
              size: z.enum(["tiny", "small", "mid"]).optional(), // Static Maps marker size — omit for the default full-size pin
            })
          ),
          center: z.object({ lat: z.number(), lng: z.number() }).optional(),
          zoom: z.number().optional(),
          size: z.string().optional(),
          routePath: z.string().optional(), // pipe-separated lat,lng pairs for route polyline
        })
      )
      .query(async ({ input }) => {
        const { ENV } = await import("./_core/env");
        // A directly-owned Google Maps Platform key takes priority over the
        // Manus forge proxy, so this works outside the Manus hosting environment.
        const url = ENV.googleMapsApiKey
          ? new URL("https://maps.googleapis.com/maps/api/staticmap")
          : new URL(
              `${ENV.forgeApiUrl.replace(/\/+$/, "")}/v1/maps/proxy/maps/api/staticmap`
            );
        url.searchParams.append("key", ENV.googleMapsApiKey || ENV.forgeApiKey);

        // Size defaults to 800x500 landscape for PDF
        const size = input.size ?? "800x500";
        url.searchParams.append("size", size);
        url.searchParams.append("maptype", "roadmap");
        url.searchParams.append("scale", "2");

        // Center / zoom — auto-fit if not provided
        if (input.center) {
          url.searchParams.append(
            "center",
            `${input.center.lat},${input.center.lng}`
          );
        }
        if (input.zoom !== undefined) {
          url.searchParams.append("zoom", String(input.zoom));
        }

        // Add route polyline path if provided
        if (input.routePath) {
          url.searchParams.append(
            "path",
            `color:0x1E88E5C0|weight:3|${input.routePath}`
          );
        }

        // Add markers for each waypoint. Static Maps' `label` only accepts a
        // single character — silently truncating a longer label (e.g. index
        // "14" → "1") is misleading, so it's only sent when it's already
        // exactly one character; otherwise the marker is drawn unlabelled.
        for (const wp of input.waypoints) {
          const colour = wp.colour ? wp.colour.replace("#", "0x") : "0x6366f1";
          const sizePart = wp.size ? `size:${wp.size}|` : "";
          const labelPart =
            wp.label && wp.label.length === 1 ? `label:${wp.label}|` : "";
          const markerSpec = `${sizePart}color:${colour}|${labelPart}${wp.lat},${wp.lng}`;
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

    /** Geocodes a plain list of address strings (cache-first, same geocoder
     * as the Heat Map) — used by the Supervisor Summary export to plot its
     * own Location column on a map page. */
    geocodeAddresses: protectedProcedure
      .input(z.object({ addresses: z.array(z.string()) }))
      .query(async ({ input }) => {
        return geocodeAddressList(input.addresses);
      }),

    getWaypoints: protectedProcedure
      .input(z.object({ sheetId: z.number() }))
      .query(async ({ input }) => {
        return getRsMappingWaypoints(input.sheetId);
      }),
    upsertWaypoint: protectedProcedure
      .input(
        z.object({
          sheetId: z.number(),
          rowId: z.number(),
          lat: z.number().optional().nullable(),
          lng: z.number().optional().nullable(),
          comment: z.string().optional().nullable(),
          markerIcon: z.string().optional().nullable(),
          markerColour: z.string().optional().nullable(),
          markerRotation: z.number().optional().nullable(),
        })
      )
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

    /** Weekly Activity Report — what the unit did in a given Monday-start week. */
    weeklyActivity: protectedProcedure
      .input(z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => {
        return getWeeklyActivityReport(input.weekStart);
      }),

    /** Weekly Tasking Report — what the unit can do in a given Monday-start week. */
    weeklyTasking: protectedProcedure
      .input(z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => {
        return getWeeklyTaskingReport(input.weekStart);
      }),
  }),

  // ─── Operation Manager ─────────────────────────────────────────────────────
  opManager: router({
    listUsers: certifierOrAdminProcedure.query(async () => {
      const users = await getAllUsers();
      return users.map(u => ({
        id: u.id,
        name: u.name,
        cin: u.cin ?? null,
        phone: u.phone ?? null,
      }));
    }),

    getPriorityBoard: certifierOrAdminProcedure
      .input(z.object({ weekStart: z.string() }))
      .query(async ({ input }) => {
        return getOpManagerPriorityBoard(input.weekStart);
      }),

    savePriorityBoard: certifierOrAdminProcedure
      .input(
        z.object({
          weekStart: z.string(),
          rows: z.array(
            z.object({
              id: z.number().optional(),
              category: z.string(),
              priority: z.number(),
              operationId: z.number().nullable().optional(),
              operationName: z.string().nullable().optional(),
              team: z.string().nullable().optional(),
              requestType: z.string().nullable().optional(),
              sortOrder: z.number(),
            })
          ),
        })
      )
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
      .input(
        z.object({
          weekStart: z.string(),
          dayIndex: z.number().min(0).max(6),
          teamRow: z.string(),
          shiftTime: z.string().nullable().optional(),
          primaryTask: z.string().nullable().optional(),
          secondaryTask: z.string().nullable().optional(),
        })
      )
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
      .input(
        z.object({
          weekStart: z.string(),
          contacts: z.array(
            z.object({
              id: z.number().optional(),
              role: z.string(),
              userId: z.number().nullable().optional(),
              customName: z.string().nullable().optional(),
              phone: z.string().nullable().optional(),
              sortOrder: z.number(),
            })
          ),
        })
      )
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
      .input(
        z.object({
          weekStart: z.string(),
          userIds: z.array(z.number()).optional(), // if provided, notify only these users
        })
      )
      .mutation(async ({ ctx, input }) => {
        await markWeekPosted(input.weekStart, ctx.user.id);
        const weekLabel = new Date(
          input.weekStart + "T00:00:00Z"
        ).toLocaleDateString("en-AU", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
        const title = "New CTO Tasking Posted";
        const body = `CTO Tasking for the week of ${weekLabel} has been posted.`;
        const url = "/operation-manager";
        // In-app inbox only — browser push was removed (unreliable: depends
        // on OS permissions/per-device subscriptions, broken outright on iOS
        // Safari unless installed as a home-screen PWA). See notifications
        // router / drizzle schema comment.
        const targetUserIds =
          input.userIds && input.userIds.length > 0
            ? input.userIds
            : (await getAllUsers()).map(u => u.id);
        await createNotificationsForUsers(targetUserIds, {
          title,
          body,
          url,
          sourceModule: "opManager",
        }).catch(err =>
          console.warn(
            "[Notifications] Failed to create in-app notifications:",
            err
          )
        );
        return { ok: true, notified: targetUserIds.length };
      }),
  }),

  // ─── CTO Roster ─────────────────────────────────────────────────────────────
  // Ported from the standalone roster_app. Editing stays admin-only, matching
  // that app's own access model (unlike opManager's tasking board above,
  // which any full-access user can edit) — see the merge plan for why.
  ctoRoster: router({
    teams: router({
      list: protectedProcedure.query(async () => {
        return getAllCtoRosterTeams();
      }),

      /** Add a new team to the live roster — admin only */
      add: adminProcedure
        .input(z.object({ name: z.string().min(1).max(64) }))
        .mutation(async ({ input }) => {
          const id = await addCtoRosterTeam(input.name);
          return { success: true, id };
        }),

      rename: adminProcedure
        .input(
          z.object({ teamId: z.number(), name: z.string().min(1).max(64) })
        )
        .mutation(async ({ input }) => {
          await renameCtoRosterTeam(input.teamId, input.name);
          return { success: true };
        }),

      /** Refuses to delete a team that still has members */
      delete: adminProcedure
        .input(z.object({ teamId: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterTeam(input.teamId);
          return { success: true };
        }),

      reorder: adminProcedure
        .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
        .mutation(async ({ input }) => {
          await reorderCtoRosterTeams(input);
          return { success: true };
        }),
    }),

    members: router({
      list: protectedProcedure.query(async () => {
        return getAllCtoRosterMembers();
      }),

      /** Add an existing RunLog user (by CIN) to the roster — admin only */
      add: adminProcedure
        .input(z.object({ cin: z.string().min(1), teamId: z.number() }))
        .mutation(async ({ input }) => {
          const memberId = await addCtoRosterMember(input.cin, input.teamId);
          return { success: true, memberId };
        }),

      /** Delete a member and optionally their shifts — admin only */
      delete: adminProcedure
        .input(
          z.object({
            memberId: z.number(),
            deleteShifts: z.boolean().default(true),
          })
        )
        .mutation(async ({ input }) => {
          await deleteCtoRosterMember(input.memberId, input.deleteShifts);
          return { success: true };
        }),

      /** Move a member to a different team — admin only */
      move: adminProcedure
        .input(
          z.object({
            memberId: z.number(),
            teamId: z.number(),
            sortOrder: z.number().optional(),
          })
        )
        .mutation(async ({ input }) => {
          await moveCtoRosterMember(
            input.memberId,
            input.teamId,
            input.sortOrder
          );
          return { success: true };
        }),

      /** Reorder members within or across teams — admin only */
      reorder: adminProcedure
        .input(
          z.array(
            z.object({
              id: z.number(),
              teamId: z.number(),
              sortOrder: z.number(),
            })
          )
        )
        .mutation(async ({ input }) => {
          await reorderCtoRosterMembers(input);
          return { success: true };
        }),

      /** Change a member's team, clearing future shifts except the codes to keep — admin only */
      changeTeam: adminProcedure
        .input(
          z.object({
            memberId: z.number(),
            newTeamId: z.number(),
            keepShiftCodes: z.array(z.string()),
            keepAllShifts: z.boolean().default(false),
          })
        )
        .mutation(async ({ input }) => {
          await changeCtoRosterMemberTeam(
            input.memberId,
            input.newTeamId,
            input.keepShiftCodes,
            input.keepAllShifts
          );
          return { success: true };
        }),

      /** Exclude/include a member from ON DUTY / ON CALL headcount totals — admin only */
      setExcludedFromCounts: adminProcedure
        .input(z.object({ memberId: z.number(), excluded: z.boolean() }))
        .mutation(async ({ input }) => {
          await setCtoRosterMemberExcludedFromCounts(
            input.memberId,
            input.excluded
          );
          return { success: true };
        }),
    }),

    /** Temporary acting-team assignments (e.g. acting OIC for two weeks) — admin only for writes */
    secondments: router({
      list: protectedProcedure.query(async () => {
        return getRelevantCtoRosterSecondments();
      }),

      create: adminProcedure
        .input(
          z.object({
            memberId: z.number(),
            destinationTeamId: z.number(),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const id = await createCtoRosterSecondment(
            input.memberId,
            input.destinationTeamId,
            input.startDate,
            input.endDate,
            ctx.user.cin ?? null
          );
          return { success: true, id };
        }),

      update: adminProcedure
        .input(
          z.object({
            id: z.number(),
            destinationTeamId: z.number(),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .mutation(async ({ input }) => {
          await updateCtoRosterSecondment(
            input.id,
            input.destinationTeamId,
            input.startDate,
            input.endDate
          );
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterSecondment(input.id);
          return { success: true };
        }),
    }),

    roster: router({
      /** All shifts for a date range — the admin grid view */
      getRange: protectedProcedure
        .input(z.object({ startDate: z.string(), endDate: z.string() }))
        .query(async ({ input }) => {
          return getCtoRosterShiftsForDateRange(input.startDate, input.endDate);
        }),

      /** Shifts for the logged-in officer's own roster entry (by CIN) */
      myShifts: protectedProcedure
        .input(
          z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          })
        )
        .query(async ({ ctx, input }) => {
          const members = await getAllCtoRosterMembers();
          const me = members.find(m => m.cin === ctx.user.cin);
          if (!me) return [];
          return getCtoRosterShiftsForMember(
            me.id,
            input.startDate,
            input.endDate
          );
        }),

      /** Update a single shift cell — admin only */
      updateShift: adminProcedure
        .input(
          z.object({
            memberId: z.number(),
            shiftDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
            shiftCode: z.enum([
              "d",
              "a",
              "r",
              "o",
              "l",
              "c",
              "tt",
              "dep",
              "doc",
              "adoc",
              "ad",
              "aoc",
              "",
            ]),
            comment: z.string().nullable().optional(),
            isActing: z.boolean().optional(),
            memberName: z.string().optional(),
            shiftTime: z.string().nullable().optional(),
            /** 8/9hr override, currently only offered on "dep" (Deployment) shifts */
            shiftDurationHours: z.number().nullable().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const existing = await getCtoRosterShiftsForMember(
            input.memberId,
            input.shiftDate,
            input.shiftDate
          );
          const oldShift = existing.find(s => s.shiftDate === input.shiftDate);
          const changed =
            (oldShift?.shiftCode ?? "") !== input.shiftCode ||
            (oldShift?.shiftTime ?? null) !== (input.shiftTime ?? null) ||
            (oldShift?.isActing ?? false) !== (input.isActing ?? false) ||
            (oldShift?.comment ?? null) !== (input.comment ?? null) ||
            (oldShift?.shiftDurationHours ?? null) !==
              (input.shiftDurationHours ?? null);
          await upsertCtoRosterShift(
            input.memberId,
            input.shiftDate,
            input.shiftCode,
            ctx.user.id,
            input.comment,
            input.isActing,
            input.shiftTime,
            input.shiftDurationHours
          );
          writeCtoRosterAudit({
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "upsert_shift",
            memberId: input.memberId,
            memberName: input.memberName ?? null,
            shiftDate: input.shiftDate,
            oldValue: oldShift
              ? JSON.stringify({
                  shiftCode: oldShift.shiftCode,
                  shiftTime: oldShift.shiftTime,
                  isActing: oldShift.isActing,
                  comment: oldShift.comment,
                  shiftDurationHours: oldShift.shiftDurationHours,
                })
              : null,
            newValue: JSON.stringify({
              shiftCode: input.shiftCode,
              shiftTime: input.shiftTime ?? null,
              isActing: input.isActing ?? false,
              comment: input.comment ?? null,
              shiftDurationHours: input.shiftDurationHours ?? null,
            }),
          });
          if (changed) {
            upsertRosterShiftNotification({
              memberId: input.memberId,
              actingUserId: ctx.user.id,
              kind: "count",
              count: 1,
              startDate: input.shiftDate,
              endDate: input.shiftDate,
            }).catch(err =>
              console.warn("[Notifications] Roster shift notify failed:", err)
            );
          }
          return { success: true };
        }),

      /** Bulk update shifts for a member across multiple dates — admin only */
      bulkUpdate: adminProcedure
        .input(
          z.object({
            memberId: z.number(),
            memberName: z.string().optional(),
            dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
            shiftCode: z.enum([
              "d",
              "a",
              "r",
              "o",
              "l",
              "c",
              "tt",
              "dep",
              "doc",
              "adoc",
              "ad",
              "aoc",
              "",
            ]),
            isActing: z.boolean().optional(),
            shiftTime: z.string().nullable().optional(),
            /** 8/9hr override, currently only offered on "dep" (Deployment) shifts */
            shiftDurationHours: z.number().nullable().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const sortedDates = [...input.dates].sort();
          const existing = await getCtoRosterShiftsForMember(
            input.memberId,
            sortedDates[0],
            sortedDates[sortedDates.length - 1]
          );
          const existingByDate = new Map(existing.map(s => [s.shiftDate, s]));
          const changedDates = input.dates.filter(d => {
            const old = existingByDate.get(d);
            return (
              (old?.shiftCode ?? "") !== input.shiftCode ||
              (old?.shiftTime ?? null) !== (input.shiftTime ?? null) ||
              (old?.isActing ?? false) !== (input.isActing ?? false) ||
              (old?.shiftDurationHours ?? null) !==
                (input.shiftDurationHours ?? null)
            );
          });
          await bulkUpdateCtoRosterShifts(
            input.dates.map(d => ({
              memberId: input.memberId,
              shiftDate: d,
              shiftCode: input.shiftCode,
              updatedBy: ctx.user.id,
              isActing: input.isActing,
              shiftTime: input.shiftTime,
              shiftDurationHours: input.shiftDurationHours,
            }))
          );
          writeCtoRosterAudit({
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "bulk_update",
            memberId: input.memberId,
            memberName: input.memberName ?? null,
            detail: `${input.dates.length} shifts set to ${input.shiftCode || "(clear)"}${input.isActing ? " [acting]" : ""}`,
          });
          if (changedDates.length > 0) {
            const sortedChanged = [...changedDates].sort();
            upsertRosterShiftNotification({
              memberId: input.memberId,
              actingUserId: ctx.user.id,
              kind: "count",
              count: sortedChanged.length,
              startDate: sortedChanged[0],
              endDate: sortedChanged[sortedChanged.length - 1],
            }).catch(err =>
              console.warn("[Notifications] Roster shift notify failed:", err)
            );
          }
          return { success: true, count: input.dates.length };
        }),

      /** Copy shifts from one member to multiple targets for a date range — admin only */
      bulkCopy: adminProcedure
        .input(
          z.object({
            sourceMemberId: z.number(),
            sourceMemberName: z.string().optional(),
            targetMemberIds: z.array(z.number()).min(1),
            targetMemberNames: z.array(z.string()).optional(),
            startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const { count, changedByMember } = await bulkCopyCtoRosterShifts(
            input.sourceMemberId,
            input.targetMemberIds,
            input.startDate,
            input.endDate,
            ctx.user.id
          );
          writeCtoRosterAudit({
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "bulk_copy",
            memberId: input.sourceMemberId,
            memberName: input.sourceMemberName ?? null,
            detail: `Copied ${count} shifts to [${(input.targetMemberNames ?? []).join(", ")}] from ${input.startDate} to ${input.endDate}`,
          });
          // Notify each target whose own shifts actually changed — never the
          // source member, and never a target whose copied cells matched
          // what was already there.
          changedByMember.forEach((changed, memberId) => {
            upsertRosterShiftNotification({
              memberId,
              actingUserId: ctx.user.id,
              kind: "count",
              count: changed,
              startDate: input.startDate,
              endDate: input.endDate,
            }).catch(err =>
              console.warn("[Notifications] Roster shift notify failed:", err)
            );
          });
          return { success: true, count };
        }),

      /**
       * Read-only preview of a member's detected cycle (start/end/length +
       * day-by-day pattern), so the admin can verify it before applying —
       * catches a stray blank cell at either edge silently corrupting the
       * detected boundary.
       */
      detectCycle: adminProcedure
        .input(z.object({ memberId: z.number() }))
        .query(async ({ input }) => detectCtoRosterCycle(input.memberId)),

      /**
       * Detects a member's existing shift pattern (their earliest-to-latest
       * *coded* span) and repeats it forward to fillUntilDate, optionally
       * copying the result to every other member of the same team.
       * cycleStartDate/cycleEndDate let the admin override the auto-detected
       * boundary after reviewing the detectCycle preview.
       */
      repeatCycle: adminProcedure
        .input(
          z.object({
            sourceMemberId: z.number(),
            sourceMemberName: z.string().optional(),
            fillUntilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            copyToTeam: z.boolean(),
            cycleStartDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            cycleEndDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const result = await repeatCtoRosterCycle(
            input.sourceMemberId,
            input.fillUntilDate,
            input.copyToTeam,
            ctx.user.id,
            input.cycleStartDate,
            input.cycleEndDate
          );
          writeCtoRosterAudit({
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "repeat_cycle",
            memberId: input.sourceMemberId,
            memberName: input.sourceMemberName ?? null,
            detail:
              `Repeated ${result.cycleLengthDays}-day cycle (${result.cycleStart} to ${result.cycleEnd}) through ${input.fillUntilDate}` +
              (input.copyToTeam
                ? `, copied to ${result.membersUpdated} teammate(s)`
                : ""),
          });
          result.changedByMember.forEach((change, memberId) => {
            upsertRosterShiftNotification({
              memberId,
              actingUserId: ctx.user.id,
              kind: "count",
              count: change.count,
              startDate: change.startDate,
              endDate: change.endDate,
            }).catch(err =>
              console.warn("[Notifications] Roster shift notify failed:", err)
            );
          });
          const { changedByMember: _changedByMember, ...publicResult } = result;
          return publicResult;
        }),
    }),

    // "What-if" planning. Seeded drafts snapshot the live roster over a date
    // range and can be merged back with conflict detection; standalone
    // drafts are a blank slate that can only be archived as a saved roster.
    draft: router({
      list: adminProcedure.query(async () => getAllCtoRosterDrafts()),

      get: adminProcedure
        .input(z.object({ draftId: z.number() }))
        .query(
          async ({ input }) =>
            (await getCtoRosterDraftById(input.draftId)) ?? null
        ),

      create: adminProcedure
        .input(
          z.object({
            name: z.string().min(1).max(128),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const draftId = await createCtoRosterDraft(
            input.name,
            input.startDate,
            input.endDate,
            ctx.user.id,
            ctx.user.name
          );
          return { draftId };
        }),

      createStandalone: adminProcedure
        .input(
          z.object({
            name: z.string().min(1).max(128),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const draftId = await createStandaloneCtoRosterDraft(
            input.name,
            input.startDate,
            input.endDate,
            ctx.user.id,
            ctx.user.name
          );
          return { draftId };
        }),

      delete: adminProcedure
        .input(z.object({ draftId: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterDraft(input.draftId);
          return { success: true };
        }),

      rename: adminProcedure
        .input(
          z.object({ draftId: z.number(), name: z.string().min(1).max(128) })
        )
        .mutation(async ({ input }) => {
          await renameCtoRosterDraft(input.draftId, input.name);
          return { success: true };
        }),

      setTimeframe: adminProcedure
        .input(
          z.object({
            draftId: z.number(),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .mutation(async ({ input }) => {
          await setCtoRosterDraftTimeframe(
            input.draftId,
            input.startDate,
            input.endDate
          );
          return { success: true };
        }),

      getShifts: adminProcedure
        .input(z.object({ draftId: z.number() }))
        .query(async ({ input }) => getCtoRosterDraftShifts(input.draftId)),

      upsertShift: adminProcedure
        .input(
          z.object({
            draftId: z.number(),
            memberId: z.number(),
            shiftDate: z.string(),
            shiftCode: z.string(),
            shiftTime: z.string().nullable().optional(),
            comment: z.string().nullable().optional(),
            isActing: z.boolean().optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          await upsertCtoRosterDraftShift(
            input.draftId,
            input.memberId,
            input.shiftDate,
            input.shiftCode,
            ctx.user.id,
            input.comment,
            input.isActing,
            input.shiftTime
          );
          return { success: true };
        }),

      bulkUpsert: adminProcedure
        .input(
          z.object({
            draftId: z.number(),
            shifts: z.array(
              z.object({
                memberId: z.number(),
                shiftDate: z.string(),
                shiftCode: z.string(),
                shiftTime: z.string().nullable().optional(),
                isActing: z.boolean().optional(),
              })
            ),
            actingOnly: z.boolean().optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          return bulkUpsertCtoRosterDraftShifts(
            input.draftId,
            input.shifts,
            ctx.user.id,
            input.actingOnly
          );
        }),

      getMergeDiff: adminProcedure
        .input(z.object({ draftId: z.number() }))
        .query(async ({ input }) => getCtoRosterDraftMergeDiff(input.draftId)),

      merge: adminProcedure
        .input(
          z.object({
            draftId: z.number(),
            resolutions: z
              .array(
                z.object({
                  memberId: z.number(),
                  shiftDate: z.string(),
                  resolution: z.enum(["draft", "live"]),
                })
              )
              .optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const result = await mergeCtoRosterDraft(
            input.draftId,
            input.resolutions,
            ctx.user.id
          );
          const draft = await getCtoRosterDraftById(input.draftId);
          writeCtoRosterAudit({
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "draft_merge",
            detail: `Merged draft "${draft?.name ?? input.draftId}" (${result.applied} cells applied, ${result.skipped} skipped)`,
          });
          // Generic message only — a merge can touch many cells across many
          // dates, so an exact per-shift count isn't worth tracking here.
          for (const memberId of result.affectedMemberIds) {
            upsertRosterShiftNotification({
              memberId,
              actingUserId: ctx.user.id,
              kind: "generic",
            }).catch(err =>
              console.warn("[Notifications] Roster shift notify failed:", err)
            );
          }
          return result;
        }),

      getTeamsAndMembers: adminProcedure
        .input(z.object({ draftId: z.number() }))
        .query(async ({ input }) =>
          getCtoRosterDraftTeamsAndMembers(input.draftId)
        ),

      addTeam: adminProcedure
        .input(
          z.object({ draftId: z.number(), name: z.string().min(1).max(64) })
        )
        .mutation(async ({ input }) => ({
          id: await addCtoRosterDraftTeam(input.draftId, input.name),
        })),

      renameTeam: adminProcedure
        .input(
          z.object({ teamId: z.number(), name: z.string().min(1).max(64) })
        )
        .mutation(async ({ input }) => {
          await renameCtoRosterDraftTeam(input.teamId, input.name);
          return { success: true };
        }),

      deleteTeam: adminProcedure
        .input(z.object({ teamId: z.number(), draftId: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterDraftTeam(input.teamId, input.draftId);
          return { success: true };
        }),

      addMember: adminProcedure
        .input(
          z.object({
            draftId: z.number(),
            teamId: z.number(),
            name: z.string().min(1).max(128),
          })
        )
        .mutation(async ({ input }) => ({
          id: await addCtoRosterDraftMember(
            input.draftId,
            input.teamId,
            input.name
          ),
        })),

      renameMember: adminProcedure
        .input(
          z.object({ memberId: z.number(), name: z.string().min(1).max(128) })
        )
        .mutation(async ({ input }) => {
          await renameCtoRosterDraftMember(input.memberId, input.name);
          return { success: true };
        }),

      deleteMember: adminProcedure
        .input(z.object({ memberId: z.number(), draftId: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterDraftMember(input.memberId, input.draftId);
          return { success: true };
        }),

      moveMember: adminProcedure
        .input(z.object({ memberId: z.number(), newTeamId: z.number() }))
        .mutation(async ({ input }) => {
          await moveCtoRosterDraftMember(input.memberId, input.newTeamId);
          return { success: true };
        }),

      saveAsRoster: adminProcedure
        .input(
          z.object({ draftId: z.number(), name: z.string().min(1).max(128) })
        )
        .mutation(async ({ input, ctx }) => {
          const savedRosterId = await saveCtoRosterDraftAsRoster(
            input.draftId,
            input.name,
            ctx.user.id,
            ctx.user.name
          );
          const draft = await getCtoRosterDraftById(input.draftId);
          writeCtoRosterAudit({
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "save_as_roster",
            detail: `Saved draft "${draft?.name ?? input.draftId}" as roster "${input.name}"`,
          });
          return { savedRosterId };
        }),
    }),

    // Named, permanent point-in-time roster archives — produced by "Save as
    // Roster" from a standalone draft. Frozen free-text snapshot, not
    // CIN-linked (see schema comment on ctoRosterSavedRosterMembers).
    savedRoster: router({
      list: adminProcedure.query(async () => getAllCtoRosterSavedRosters()),

      get: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const roster = await getCtoRosterSavedRosterById(input.id);
          if (!roster) throw new TRPCError({ code: "NOT_FOUND" });
          return roster;
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterSavedRoster(input.id);
          return { success: true };
        }),

      rename: adminProcedure
        .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
        .mutation(async ({ input }) => {
          await renameCtoRosterSavedRoster(input.id, input.name);
          return { success: true };
        }),

      setTimeframe: adminProcedure
        .input(
          z.object({
            id: z.number(),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .mutation(async ({ input }) => {
          await setCtoRosterSavedRosterTimeframe(
            input.id,
            input.startDate,
            input.endDate
          );
          return { success: true };
        }),

      getTeamsAndMembers: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) =>
          getCtoRosterSavedRosterTeamsAndMembers(input.id)
        ),

      getShifts: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => getCtoRosterSavedRosterShifts(input.id)),

      upsertShift: adminProcedure
        .input(
          z.object({
            savedRosterId: z.number(),
            memberId: z.number(),
            shiftDate: z.string(),
            shiftCode: z.string(),
            shiftTime: z.string().nullable().optional(),
            comment: z.string().nullable().optional(),
            isActing: z.boolean().optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          await upsertCtoRosterSavedRosterShift(
            input.savedRosterId,
            input.memberId,
            input.shiftDate,
            input.shiftCode,
            ctx.user.id,
            input.comment,
            input.isActing,
            input.shiftTime
          );
          return { success: true };
        }),

      bulkUpsert: adminProcedure
        .input(
          z.object({
            savedRosterId: z.number(),
            shifts: z.array(
              z.object({
                memberId: z.number(),
                shiftDate: z.string(),
                shiftCode: z.string(),
                shiftTime: z.string().nullable().optional(),
                isActing: z.boolean().optional(),
              })
            ),
          })
        )
        .mutation(async ({ input, ctx }) => {
          await bulkUpsertCtoRosterSavedRosterShifts(
            input.savedRosterId,
            input.shifts,
            ctx.user.id
          );
          return { success: true };
        }),

      addTeam: adminProcedure
        .input(
          z.object({
            savedRosterId: z.number(),
            name: z.string().min(1).max(64),
          })
        )
        .mutation(async ({ input }) => ({
          id: await addCtoRosterSavedRosterTeam(
            input.savedRosterId,
            input.name
          ),
        })),

      renameTeam: adminProcedure
        .input(
          z.object({ teamId: z.number(), name: z.string().min(1).max(64) })
        )
        .mutation(async ({ input }) => {
          await renameCtoRosterSavedRosterTeam(input.teamId, input.name);
          return { success: true };
        }),

      deleteTeam: adminProcedure
        .input(z.object({ teamId: z.number(), savedRosterId: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterSavedRosterTeam(
            input.teamId,
            input.savedRosterId
          );
          return { success: true };
        }),

      addMember: adminProcedure
        .input(
          z.object({
            savedRosterId: z.number(),
            teamId: z.number(),
            name: z.string().min(1).max(128),
          })
        )
        .mutation(async ({ input }) => ({
          id: await addCtoRosterSavedRosterMember(
            input.savedRosterId,
            input.teamId,
            input.name
          ),
        })),

      renameMember: adminProcedure
        .input(
          z.object({ memberId: z.number(), name: z.string().min(1).max(128) })
        )
        .mutation(async ({ input }) => {
          await renameCtoRosterSavedRosterMember(input.memberId, input.name);
          return { success: true };
        }),

      deleteMember: adminProcedure
        .input(z.object({ memberId: z.number(), savedRosterId: z.number() }))
        .mutation(async ({ input }) => {
          await deleteCtoRosterSavedRosterMember(
            input.memberId,
            input.savedRosterId
          );
          return { success: true };
        }),

      moveMember: adminProcedure
        .input(z.object({ memberId: z.number(), newTeamId: z.number() }))
        .mutation(async ({ input }) => {
          await moveCtoRosterSavedRosterMember(input.memberId, input.newTeamId);
          return { success: true };
        }),
    }),

    // EA compliance rule engine — pure, deterministic (see ctoRosterEbaEngine.ts),
    // no runtime AI/LLM involvement, per the Golden Rule in CLAUDE.md.
    eba: router({
      listRules: adminProcedure.query(async () => getAllCtoRosterEbaRules()),

      updateRule: adminProcedure
        .input(
          z.object({
            id: z.number(),
            isActive: z.boolean().optional(),
            thresholdValue: z.number().nullable().optional(),
            thresholdValue2: z.number().nullable().optional(),
            description: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          await updateCtoRosterEbaRule(input.id, input);
          return { success: true };
        }),

      runCheck: adminProcedure
        .input(
          z.object({
            scope: z.enum(["main", "draft", "custom", "saved"]),
            draftId: z.number().optional(),
            savedRosterId: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          if (input.scope === "draft" && !input.draftId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "draftId required for draft scope",
            });
          if (input.scope === "saved" && !input.savedRosterId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "savedRosterId required for saved scope",
            });
          return runCtoRosterEbaCheck(
            input.scope,
            input.draftId,
            input.savedRosterId,
            input.startDate,
            input.endDate
          );
        }),

      // Live findings against the main roster, for the red-dot overlay on the
      // roster grid — recomputed from current shift data on every call, so a
      // finding disappears as soon as its underlying shifts are fixed.
      liveFindings: adminProcedure.query(async () =>
        runCtoRosterEbaCheck("main")
      ),
    }),

    // Team coverage minimums shown on the roster "Outlook" projection view.
    outlookSettings: router({
      get: protectedProcedure.query(async () => getCtoRosterOutlookSettings()),

      update: adminProcedure
        .input(
          z.object({
            teamMinimums: z.record(z.string(), z.number().min(0).max(99)),
            onCallMin: z.number().min(0).max(99),
            combinedMin: z.number().min(0).max(99),
          })
        )
        .mutation(async ({ input }) => {
          await updateCtoRosterOutlookSettings(
            input.teamMinimums,
            input.onCallMin,
            input.combinedMin
          );
          return { success: true };
        }),
    }),

    audit: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(500).default(100),
            offset: z.number().min(0).default(0),
            userId: z.number().optional(),
            action: z.string().optional(),
          })
        )
        .query(async ({ input }) => {
          return getCtoRosterAuditLog(
            input.limit,
            input.offset,
            input.userId,
            input.action
          );
        }),
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
      .input(
        z.object({
          departAddress: z.string().min(1),
          arriveAddress: z.string().min(1),
          // Raw observation text from surrounding rows — used to extract suburb directly
          // from the text (e.g. "arrived at 288 Canning Highway, BICTON WA") which is
          // more reliable than geocoding when addresses straddle suburb boundaries.
          departObsText: z.string().optional(),
          arriveObsText: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // ── Helper: geocode an address string → LatLng ──────────────────────
        async function geocodeAddress(
          address: string
        ): Promise<{ lat: number; lng: number; suburb: string } | null> {
          try {
            const result = await makeRequest<GeocodingResult>(
              "/maps/api/geocode/json",
              {
                address: address + ", Western Australia, Australia",
                region: "au",
              }
            );
            if (result.status !== "OK" || !result.results.length) return null;
            const loc = result.results[0].geometry.location;
            // Extract suburb (locality) from address components
            const components = result.results[0].address_components;
            const localityComp = components.find(c =>
              c.types.includes("locality")
            );
            const suburb = localityComp
              ? localityComp.long_name.toUpperCase()
              : "";
            return { lat: loc.lat, lng: loc.lng, suburb };
          } catch {
            return null;
          }
        }

        // ── Helper: strip HTML tags from Directions step instructions ────────
        function stripHtml(html: string): string {
          return html
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        // ── Helper: extract road name from a Directions step ─────────────────
        // Google Directions steps have html_instructions like:
        //   "Turn left onto <b>Canning Highway</b>"
        //   "Merge onto <b>Canning Hwy</b>/<wbr/><b>State Route 6</b>"
        //   "Head north on <b>Stock Road</b>"
        // We extract the first meaningful bold segment (road name), ignoring
        // state/national route numbers and directional words.
        // Google's Directions steps often abbreviate the road type ("Scott St",
        // "Kalamunda Rd") — expand it to the full word for the RS street list.
        // Case-sensitive since Google always returns these Title-Cased.
        function expandRoadAbbreviation(name: string): string {
          return name
            .replace(/\bRd\b/g, "Road")
            .replace(/\bSt\b/g, "Street")
            .replace(/\bAve\b/g, "Avenue")
            .replace(/\bDr\b/g, "Drive")
            .replace(/\bHwy\b/g, "Highway")
            .replace(/\bFwy\b/g, "Freeway")
            .replace(/\bTce\b/g, "Terrace")
            .replace(/\bPde\b/g, "Parade")
            .replace(/\bCct\b/g, "Circuit")
            .replace(/\bGr\b/g, "Grove")
            .replace(/\bLn\b/g, "Lane")
            .replace(/\bPl\b/g, "Place")
            .replace(/\bCt\b/g, "Court")
            .replace(/\bCl\b/g, "Close")
            .replace(/\bCres\b/g, "Crescent")
            .replace(/\bBlvd\b/g, "Boulevard")
            .replace(/\bEsp\b/g, "Esplanade");
        }

        function extractRoadName(htmlInstructions: string): string | null {
          const boldRe = /<b>([^<]+)<\/b>/g;
          const boldMatches: string[] = [];
          let bm: RegExpExecArray | null;
          while ((bm = boldRe.exec(htmlInstructions)) !== null)
            boldMatches.push(bm[1].trim());

          // Filter out: directional words, ordinal numbers, compass directions,
          // and ALL route/highway number codes in any form:
          //   "State Route 6", "State Rte 6", "State Rte60", "National Route 1",
          //   "National Highway 1", "Federal Route 1", "A1", "M2", bare numbers.
          const isJunk = (s: string) =>
            /^(left|right|north|south|east|west|northeast|northwest|southeast|southwest|slight|sharp|u-turn)$/i.test(
              s
            ) ||
            /^\d+(st|nd|rd|th)$/i.test(s) ||
            /^(state|national|federal|nat|natl)\s*(route|rte|rte\.?|highway|hwy|road|rd)\s*\d+/i.test(
              s
            ) ||
            /^(route|rte)\s*\d+/i.test(s) ||
            /^[A-Z]{1,2}\d+$/.test(s) ||
            /^\d+$/.test(s);

          // Prefer the first non-junk bold segment (road name comes first in Google's instructions)
          const roadName = boldMatches.find(m => m.length > 2 && !isJunk(m));
          if (roadName) return expandRoadAbbreviation(roadName);

          // The final step is often a pure arrival note with no road name at
          // all, e.g. "Destination will be on the left" — that's navigation
          // narration, not a street, and must never be extracted as one.
          const plain = stripHtml(htmlInstructions);
          if (/\bwill be on the (left|right)\b/i.test(plain)) return null;

          // Fallback: plain text, take everything after the last preposition.
          // Still subject to the same junk filter — otherwise a step whose only
          // bold segment was a filtered-out route/highway number (e.g. "Merge
          // onto National Highway 94") falls through here and slips the numbered
          // highway back in via the unfiltered plain text. \b word boundaries
          // stop "on" from matching mid-word (e.g. the "on" ending "Destination").
          const ontoMatch = plain.match(/\b(?:onto|on|toward)\s+(.+)$/i);
          if (ontoMatch) {
            const candidate = ontoMatch[1].replace(/\s*\/.*$/, "").trim();
            if (candidate.length > 2 && !isJunk(candidate))
              return expandRoadAbbreviation(candidate);
          }
          return null;
        }

        // ── Helper: extract suburb from geocoded reverse lookup at a LatLng ──
        async function reverseGeocodeSuburb(
          lat: number,
          lng: number
        ): Promise<string> {
          try {
            const result = await makeRequest<GeocodingResult>(
              "/maps/api/geocode/json",
              {
                latlng: `${lat},${lng}`,
                result_type: "locality",
                region: "au",
              }
            );
            if (result.status !== "OK" || !result.results.length) return "";
            const components = result.results[0].address_components;
            const localityComp = components.find(c =>
              c.types.includes("locality")
            );
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
            message:
              "Could not geocode one or both addresses. Please check the surrounding rows have valid addresses.",
          });
        }

        // ── 2. Call Directions API ───────────────────────────────────────────
        const directions = await makeRequest<DirectionsResult>(
          "/maps/api/directions/json",
          {
            origin: `${departGeo.lat},${departGeo.lng}`,
            destination: `${arriveGeo.lat},${arriveGeo.lng}`,
            mode: "driving",
            region: "au",
          }
        );

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
            message:
              "Could not extract street names from the route. Please enter the streets manually.",
          });
        }

        // ── 4. Get suburbs for first and last road ───────────────────────────
        // Priority order for suburb:
        //   1. Extract directly from raw observation text (most reliable — the text
        //      already contains the correct suburb e.g. "BICTON WA", "MOUNT LAWLEY").
        //   2. Fall back to suburb from geocoded address components.
        function extractSuburbFromText(text: string): string {
          if (!text) return "";
          // Match ALL-CAPS suburb name after a comma, optionally followed by WA.
          // e.g. ", BICTON WA", ", MOUNT LAWLEY WA", ", ARDROSS (".
          // The suburb must be immediately followed by "(", end-of-line/string, or
          // punctuation (after the optional "WA") — not just any whitespace — so
          // an earlier all-caps alias in the same sentence (e.g. "1ADF124, DRAGON
          // driver...") doesn't get mistaken for the suburb before the real one
          // ("...Road, HIGH WYCOMBE WA (16 Newburn Road)...") is reached.
          const m = text.match(
            /,\s*([A-Z][A-Z ]{1,30}?)(?:\s+(?:WA|Western Australia))?\s*(?=[(.,\n]|$)/
          );
          if (m)
            return m[1]
              .trim()
              .replace(/\s+WA$/, "")
              .trim();
          return "";
        }

        const firstSuburb =
          (input.departObsText
            ? extractSuburbFromText(input.departObsText)
            : "") || departGeo.suburb;
        const lastSuburb =
          (input.arriveObsText
            ? extractSuburbFromText(input.arriveObsText)
            : "") || arriveGeo.suburb;

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
            lines.push(
              suburb ? `${name}, ${suburb}, whereat;` : `${name}, whereat;`
            );
          } else if (i === 0) {
            lines.push(firstSuburb ? `${name}, ${firstSuburb},` : `${name},`);
          } else if (i === roadNames.length - 1) {
            lines.push(
              lastSuburb
                ? `${name}, ${lastSuburb}, whereat;`
                : `${name}, whereat;`
            );
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

    /** Photos whose owning operation is gone (soft-deleted or hard-deleted)
     * but that never got cleaned up themselves — see getOrphanedAttachments. */
    getOrphanedAttachments: adminProcedure.query(async () => {
      return getOrphanedAttachments();
    }),

    /** Permanently purges every currently-orphaned attachment. Bypasses the
     * normal 7-day Recycle Bin grace period since these were already
     * deleted along with their operation, just never actually removed. */
    purgeOrphanedAttachments: adminProcedure.mutation(async () => {
      const count = await purgeOrphanedAttachments();
      return { purged: count };
    }),
  }),
});
export type AppRouter = typeof appRouter;
