import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { filterByOperationAccess, toAccessUser } from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  deleteOperation,
  deleteRunningSheet,
  deleteTarget,
  getRecycleBinItems,
  reinstateOperation,
  reinstateSheet,
  reinstateTarget,
  purgeExpiredRecycleBinItems,
  reinstateCustomMarker,
  hardDeleteCustomMarker,
  deleteRowAttachment,
  reinstateAttachment,
  reinstateSmeacBriefing,
  deleteSmeacBriefing,
  reinstateUcoGuideBriefing,
  deleteUcoGuideBriefing,
  reinstateOpManagerWeek,
  hardDeleteOpManagerWeek,
} from "../db";

import { adminProcedure } from "./_helpers";

export const recycleBinRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await purgeExpiredRecycleBinItems();
    // Deleted weekly taskings are for admins, who manage the tasking board.
    const items = (await getRecycleBinItems()).filter(
      i => i.type !== "weekly_tasking" || ctx.user.role === "admin"
    );
    const me = toAccessUser(ctx.user);
    // An operation's own entry follows its id; everything else follows the
    // operation it belonged to. Items with neither (e.g. a deleted target)
    // can't be placed, so they stay with admins when access is restricted.
    const allowed = await filterByOperationAccess(me, items, i =>
      i.type === "operation" ? i.id : (i.operationId ?? -1)
    );
    const placed = new Set(
      allowed.filter(i => i.type === "operation" || i.operationId != null)
    );
    const everything = allowed.length === items.length;
    return everything
      ? items
      : items.filter(
          i =>
            placed.has(i) ||
            (ctx.user.role === "admin" &&
              i.type !== "operation" &&
              i.operationId == null)
        );
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
          "smeac_briefing",
          "uco_guide",
          "weekly_tasking",
        ]),
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.type === "weekly_tasking") {
        if (ctx.user.role !== "admin")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only an admin can reinstate a weekly tasking.",
          });
        const result = await reinstateOpManagerWeek(input.id);
        if (!result.ok)
          throw new TRPCError({
            code: result.reason === "gone" ? "NOT_FOUND" : "CONFLICT",
            message:
              result.reason === "gone"
                ? "That weekly tasking is no longer in the Recycle Bin."
                : "A weekly tasking for that week has been made since. Delete it first, then reinstate this one.",
          });
        return { success: true };
      }
      if (input.type === "operation") await reinstateOperation(input.id);
      else if (input.type === "sheet") await reinstateSheet(input.id);
      else if (input.type === "map_marker")
        await reinstateCustomMarker(input.id);
      else if (input.type === "attachment") await reinstateAttachment(input.id);
      else if (input.type === "smeac_briefing")
        await reinstateSmeacBriefing(input.id);
      else if (input.type === "uco_guide")
        await reinstateUcoGuideBriefing(input.id);
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
          "smeac_briefing",
          "uco_guide",
          "weekly_tasking",
        ]),
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.type === "weekly_tasking") {
        await hardDeleteOpManagerWeek(input.id);
      } else if (input.type === "operation") {
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
      } else if (input.type === "smeac_briefing") {
        await deleteSmeacBriefing(input.id);
      } else if (input.type === "uco_guide") {
        await deleteUcoGuideBriefing(input.id);
      } else {
        await deleteTarget(input.id);
      }
      return { success: true };
    }),
});
