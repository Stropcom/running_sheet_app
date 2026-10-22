import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCertificationsByRowIds,
  getMembersByRowIds,
  getRowsBySheetId,
  getRunningSheetById,
  getRunningSheetsByOperation,
  getGovernanceRecord,
  upsertGovernanceRecord,
  type GovernanceUpsertInput,
  getGovernanceRecordsBySheetIds,
  computeGovernancePercent,
  computeAllRowsSigned,
  getSheetSummary,
  upsertSheetSummary,
  completeSheetSummary,
  reopenSheetSummary,
} from "../db";

/** RS Governance Folder */
export const governanceRouter = router({
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
          rows.length > 0 && computeAllRowsSigned(rows, allMembers, allCerts);
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
});
