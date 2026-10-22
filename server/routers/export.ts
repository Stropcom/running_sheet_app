import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCertificationsByRowIds,
  getMembersByRowIds,
  getOperationById,
  getRowsBySheetId,
  getRunningSheetById,
  getTargetById,
  getAttachmentsByRowIds,
} from "../db";

import { getIntelExportData } from "../db";

import { adminProcedure } from "./_helpers";

export const exportRouter = router({
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

  /** Structured JSON-ready data for Administration → Intel Export: the
   * selected running sheet(s) verbatim, and the intelligence mined from
   * them — nothing from the Court module.
   * Admin-only: this is data meant to leave the organisation. */
  intelExportData: adminProcedure
    .input(z.object({ sheetIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      return getIntelExportData(input.sheetIds);
    }),
});
