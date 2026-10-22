import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllCtoRosterTeams,
  getAllCtoRosterMembers,
  getCtoRosterMembersByCin,
  getCtoRosterCandidates,
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
} from "../ctoRoster";
import { protectedProcedure, router } from "../_core/trpc";

import { adminProcedure } from "./_helpers";

// Ported from the standalone roster_app. Editing stays admin-only, matching
// that app's own access model (unlike opManager's tasking board above,
// which any full-access user can edit) — see the merge plan for why.
export const ctoRosterRouter = router({
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
      .input(z.object({ teamId: z.number(), name: z.string().min(1).max(64) }))
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

    /** Who can be added to this Command's roster (not already on it): its
     * own people, and visitors from other Commands — admin only */
    candidates: adminProcedure.query(async () => getCtoRosterCandidates()),

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
        // Their own entries, whichever Commands' rosters they are on (a
        // visitor can be on their own and on a host Command's).
        const mine = ctx.user.cin
          ? await getCtoRosterMembersByCin(ctx.user.cin)
          : [];
        const shifts = await Promise.all(
          mine.map(me =>
            getCtoRosterShiftsForMember(me.id, input.startDate, input.endDate)
          )
        );
        return shifts
          .flat()
          .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
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
      .input(z.object({ draftId: z.number(), name: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => ({
        id: await addCtoRosterDraftTeam(input.draftId, input.name),
      })),

    renameTeam: adminProcedure
      .input(z.object({ teamId: z.number(), name: z.string().min(1).max(64) }))
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
        id: await addCtoRosterSavedRosterTeam(input.savedRosterId, input.name),
      })),

    renameTeam: adminProcedure
      .input(z.object({ teamId: z.number(), name: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => {
        await renameCtoRosterSavedRosterTeam(input.teamId, input.name);
        return { success: true };
      }),

    deleteTeam: adminProcedure
      .input(z.object({ teamId: z.number(), savedRosterId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCtoRosterSavedRosterTeam(input.teamId, input.savedRosterId);
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
});
