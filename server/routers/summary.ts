import { format } from "date-fns";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  mergeSpecialProjects,
  parseSpecialProjects,
  applyTargetProjectsToSummary,
} from "@shared/targetStatus";
import { getAllCtoRosterTeams, getAllCtoRosterMembers } from "../ctoRoster";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getOperationById,
  getRowsBySheetId,
  getRunningSheetById,
  getTargetById,
  upsertGovernanceRecord,
  getSheetSummary,
  upsertSheetSummary,
  syncSummaryProjectsToTarget,
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
  getSheetIntelHiddenKeys,
  setSheetIntelHiddenKeys,
  getSheetIntelManualLines,
  getSheetIntelManualLine,
  addSheetIntelManualLine,
  updateSheetIntelManualLine,
  deleteSheetIntelManualLine,
  getSheetNewEntities,
} from "../db";
import { formatRowTime } from "@shared/rowTime";
import {
  buildSheetIntel,
  isCueCategory,
  leftOutOfSheet,
} from "@shared/sheetIntel";

import {
  assertCanCompleteSummary,
  certifierOrAdminProcedure,
} from "./_helpers";

// ─── New Intelligence helpers ────────────────────────────────────────────────

const intelLineInput = z.object({
  category: z.string().refine(isCueCategory, "Unknown category"),
  heading: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(2000),
  /** Minutes after midnight; null = no time. */
  timeMinutes: z.number().int().min(0).max(1439).nullable().optional(),
});

function intelLineFields(input: z.infer<typeof intelLineInput>) {
  const minutes = input.timeMinutes ?? null;
  return {
    category: input.category,
    heading: input.heading.trim(),
    text: input.text.trim(),
    time: minutes === null ? null : formatRowTime(minutes),
    timeMinutes: minutes,
  };
}

function intelUserCIN(user: {
  cin?: string | null;
  username?: string | null;
  name?: string | null;
}): string {
  return user.cin ?? user.username ?? user.name ?? "Unknown";
}

/** The New Intelligence section is locked while the summary is complete. */
async function assertIntelOpen(sheetId: number) {
  const record = await getSheetSummary(sheetId);
  if (record?.completedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Summary is complete — reopen it before editing.",
    });
  }
}

/** A hand-added line may be changed by whoever added it, or an admin; and the
 * line must belong to the sheet the request names. */
async function assertCanChangeIntelLine(
  user: {
    role?: string | null;
    cin?: string | null;
    username?: string | null;
    name?: string | null;
  },
  sheetId: number,
  id: number
) {
  const line = await getSheetIntelManualLine(id);
  if (!line || line.sheetId !== sheetId)
    throw new TRPCError({ code: "NOT_FOUND" });
  if (user.role !== "admin" && line.addedByCIN !== intelUserCIN(user))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only the officer who added this line (or an admin) can change it.",
    });
  return line;
}

export const summaryRouter = router({
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
          // The prior summary's projects, with TI/LBS/SEEK/CAD set to
          // exactly what the Target Registry says (the registry and the
          // summaries stay in step — see syncTargetProjectsToOpenSummaries).
          specialProjects: target
            ? applyTargetProjectsToSummary(
                priorSummary?.specialProjects ?? null,
                target.specialProjects ?? null
              )
            : (priorSummary?.specialProjects ?? null),
          objectives: priorSummary?.objectives ?? null,
        });
      } else {
        const patch: {
          sheetId: number;
          startTime?: string | null;
          finishTime?: string | null;
          location?: string | null;
          specialProjects?: string | null;
        } = { sheetId: input.sheetId };
        if (!record.startTimeEdited && record.startTime !== derivedStartTime) {
          patch.startTime = derivedStartTime;
        }
        if (
          !record.finishTimeEdited &&
          record.finishTime !== derivedFinishTime
        ) {
          patch.finishTime = derivedFinishTime;
        }
        // Location has no "edited" flag (unlike start/finish time), so
        // once it has any value — auto-derived or typed by a supervisor —
        // further RS edits never silently overwrite it. But if it's still
        // empty (e.g. this summary was first opened, and so auto-created,
        // before the "surveillance commenced" row was logged), pick the
        // location up as soon as that row exists rather than leaving it
        // blank forever.
        if (!record.location) {
          const derivedLocation = extractSummaryLocation(rows);
          if (derivedLocation) patch.location = derivedLocation;
        }
        // Special Projects: a summary whose list is still empty (opened
        // before the target's projects were set, or none were carried
        // over) picks up the target's TI/LBS/SEEK/CAD now. Once it has
        // any entry the supervisor owns the list — a project they
        // unticked is never silently re-added.
        if (
          !record.completedAt &&
          parseSpecialProjects(record.specialProjects).length === 0 &&
          sheet.targetId
        ) {
          const t = await getTargetById(sheet.targetId);
          const fromTarget = mergeSpecialProjects(
            null,
            t?.specialProjects ?? null
          );
          if (fromTarget) patch.specialProjects = fromTarget;
        }
        if (
          patch.startTime !== undefined ||
          patch.finishTime !== undefined ||
          patch.location !== undefined ||
          patch.specialProjects !== undefined
        ) {
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
      const saved = await upsertSheetSummary({
        ...input,
        lastEditedByCIN: userCIN,
        // A manual edit here sticks — stop auto-syncing that field from
        // the RS's rows (see getBySheet).
        ...(input.startTime !== undefined ? { startTimeEdited: true } : {}),
        ...(input.finishTime !== undefined ? { finishTimeEdited: true } : {}),
      });
      // TI/LBS/SEEK/CAD edited here also change the Target Registry (and,
      // through it, the target's other open summaries).
      if (input.specialProjects !== undefined) {
        await syncSummaryProjectsToTarget(input.sheetId, input.specialProjects);
      }
      return saved;
    }),

  /** Team Leader (or Admin) acknowledges the summary is complete — locks it */
  complete: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCanCompleteSummary(ctx.user, input.sheetId);

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
    .input(z.object({ sheetId: z.number(), id: z.number(), text: z.string() }))
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

  // ─── New Intelligence (bottom of the Supervisor Summary) ───────────────────
  // The automatic lines are worked out from the rows each time (nothing is
  // stored for them but the supervisor's unticks); officers can add their own.
  // Once the summary is complete the whole section is locked until it is
  // reopened, exactly like the rest of the summary.

  /** Everything the New Intelligence section shows for one sheet. */
  getIntel: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const sheet = await getRunningSheetById(input.sheetId);
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });
      const [rows, manual, hidden, record, newThisShift] = await Promise.all([
        getRowsBySheetId(input.sheetId),
        getSheetIntelManualLines(input.sheetId),
        getSheetIntelHiddenKeys(input.sheetId),
        getSheetSummary(input.sheetId),
        getSheetNewEntities(input.sheetId),
      ]);
      const me = intelUserCIN(ctx.user);
      const isAdmin = ctx.user.role === "admin";
      const lines = buildSheetIntel({
        rows,
        manualLines: manual,
        hiddenKeys: hidden,
      }).map(l => ({
        ...l,
        // The officer who added a hand-added line, or an admin, may edit or
        // remove it (while the summary is open).
        editable: l.source === "manual" && (isAdmin || l.addedByCIN === me),
      }));
      return {
        lines,
        newThisShift,
        leftOut: leftOutOfSheet(rows),
        locked: !!record?.completedAt,
      };
    }),

  /** Tick or untick an automatic line (unticked lines stay out of the PDF and the Weekly Report). */
  setIntelIncluded: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        key: z.string().min(1).max(200),
        included: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertIntelOpen(input.sheetId);
      const [rows, manual, hidden] = await Promise.all([
        getRowsBySheetId(input.sheetId),
        getSheetIntelManualLines(input.sheetId),
        getSheetIntelHiddenKeys(input.sheetId),
      ]);
      const current = new Set(
        buildSheetIntel({ rows, manualLines: manual })
          .filter(l => l.source === "auto")
          .map(l => l.key)
      );
      if (!current.has(input.key))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That line is no longer on this sheet.",
        });
      // Keep only keys that still exist, so the list cannot grow for ever.
      const next = new Set(hidden.filter(k => current.has(k)));
      if (input.included) next.delete(input.key);
      else next.add(input.key);
      await setSheetIntelHiddenKeys(
        input.sheetId,
        Array.from(next),
        intelUserCIN(ctx.user)
      );
      return { success: true };
    }),

  /** Add a New Intelligence line by hand. */
  addIntelLine: protectedProcedure
    .input(intelLineInput.extend({ sheetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertIntelOpen(input.sheetId);
      const cin = intelUserCIN(ctx.user);
      const line = await addSheetIntelManualLine(
        input.sheetId,
        intelLineFields(input),
        cin
      );
      await createAuditLog({
        sheetId: input.sheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_updated",
        details: `New Intelligence line added by ${cin}: ${input.heading.trim()}`,
        createdAt: Date.now(),
      });
      return line;
    }),

  /** Edit a hand-added line — the officer who added it, or an admin. */
  updateIntelLine: protectedProcedure
    .input(intelLineInput.extend({ sheetId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertIntelOpen(input.sheetId);
      await assertCanChangeIntelLine(ctx.user, input.sheetId, input.id);
      await updateSheetIntelManualLine(input.id, intelLineFields(input));
      await createAuditLog({
        sheetId: input.sheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_updated",
        details: `New Intelligence line edited by ${intelUserCIN(ctx.user)}: ${input.heading.trim()}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  /** Remove a hand-added line — the officer who added it, or an admin. */
  removeIntelLine: protectedProcedure
    .input(z.object({ sheetId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertIntelOpen(input.sheetId);
      const line = await assertCanChangeIntelLine(
        ctx.user,
        input.sheetId,
        input.id
      );
      await deleteSheetIntelManualLine(input.id);
      await createAuditLog({
        sheetId: input.sheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "sheet_updated",
        details: `New Intelligence line removed by ${intelUserCIN(ctx.user)}: ${line.heading}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),
});
