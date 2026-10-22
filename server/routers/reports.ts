import { z } from "zod";
import { filterByOperationAccess, toAccessUser } from "../operationAccess";
import { getWeeklyTaskingReport } from "../ctoRoster";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllUsers,
  visitorTeamMap,
  getIncompleteRunningSheets,
  getOutstandingTodosByUser,
  getWeeklyActivityReport,
} from "../db";

export const reportsRouter = router({
  /**
   * Returns all non-deleted, non-closed running sheets with full status info
   * for the Reports page (incomplete sheets).
   */
  incompleteSheets: protectedProcedure.query(async ({ ctx }) => {
    return filterByOperationAccess(
      toAccessUser(ctx.user),
      await getIncompleteRunningSheets(
        ctx.user.allRegions ? null : ctx.user.command
      ),
      r => r.operationId
    );
  }),

  /**
   * Returns all users ranked by total outstanding to-do actions.
   */
  outstandingTodos: protectedProcedure.query(async ({ ctx }) => {
    const rows = await getOutstandingTodosByUser(
      ctx.user.allRegions ? null : ctx.user.command
    );
    if (ctx.user.allRegions) return rows;
    // A ranking of people: your own Command's, plus visitors it hosts in
    // one of its teams.
    const hosted = await visitorTeamMap(ctx.user.command);
    const mine = new Set(
      (await getAllUsers())
        .filter(
          u => (u.command === ctx.user.command || hosted.has(u.id)) && u.cin
        )
        .map(u => u.cin)
    );
    return rows.filter(r => mine.has(r.cin));
  }),

  /** Weekly Activity Report — what the unit did in a given Monday-start week. */
  weeklyActivity: protectedProcedure
    .input(z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input, ctx }) => {
      const report = await getWeeklyActivityReport(input.weekStart);
      return {
        ...report,
        operations: await filterByOperationAccess(
          toAccessUser(ctx.user),
          report.operations,
          o => o.operationId
        ),
      };
    }),

  /** Weekly Tasking Report — what the unit can do in a given Monday-start week. */
  weeklyTasking: protectedProcedure
    .input(z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input }) => {
      return getWeeklyTaskingReport(input.weekStart);
    }),
});
