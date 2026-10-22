import { z } from "zod";
import { filterAuditLogs, toAccessUser } from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import { getAllAuditLogs, getAuditLogsBySheet } from "../db";

export const auditLogRouter = router({
  bySheet: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getAuditLogsBySheet(input.sheetId);
    }),

  all: protectedProcedure.query(async ({ ctx }) => {
    return filterAuditLogs(toAccessUser(ctx.user), await getAllAuditLogs());
  }),
});
