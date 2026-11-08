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
  isInRecycleBin,
} from "../db";

import { adminProcedure } from "./_helpers";

const BIN_TYPES = [
  "operation",
  "sheet",
  "target",
  "map_marker",
  "attachment",
  "smeac_briefing",
  "uco_guide",
  "weekly_tasking",
] as const;

const BIN_LABEL: Record<(typeof BIN_TYPES)[number], string> = {
  operation: "Operation",
  sheet: "Running sheet",
  target: "Target",
  map_marker: "Map marker",
  attachment: "Photo",
  smeac_briefing: "SMEAC briefing",
  uco_guide: "UCO guide",
  weekly_tasking: "Weekly tasking",
};

/** Restore and "delete forever" are for items that are in the bin. */
async function requireInBin(type: (typeof BIN_TYPES)[number], id: number) {
  if (!(await isInRecycleBin(type, id)))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That item is not in the Recycle Bin.",
    });
}

/** Every restore and permanent delete is written to the audit log. */
async function auditBin(
  ctx: { user: { id: number; cin?: string | null } },
  action: "recycle_bin_restored" | "recycle_bin_deleted",
  type: (typeof BIN_TYPES)[number],
  id: number
) {
  const cin = ctx.user.cin ?? "Unknown";
  await createAuditLog({
    sheetId: type === "sheet" ? id : 0,
    userId: ctx.user.id,
    userName: cin,
    userCIN: ctx.user.cin ?? undefined,
    action,
    details: `${BIN_LABEL[type]} ${id} ${action === "recycle_bin_restored" ? "restored from" : "permanently deleted from"} the Recycle Bin by CIN ${cin}`,
    createdAt: Date.now(),
  });
}

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
        type: z.enum(BIN_TYPES),
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireInBin(input.type, input.id);
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
        await auditBin(ctx, "recycle_bin_restored", input.type, input.id);
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
      await auditBin(ctx, "recycle_bin_restored", input.type, input.id);
      return { success: true };
    }),
  hardDelete: adminProcedure
    .input(
      z.object({
        type: z.enum(BIN_TYPES),
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only an item that is in the bin can be deleted forever.
      await requireInBin(input.type, input.id);
      if (input.type === "weekly_tasking") {
        await hardDeleteOpManagerWeek(input.id);
      } else if (input.type === "operation") {
        await deleteOperation(input.id);
      } else if (input.type === "sheet") {
        await deleteRunningSheet(input.id);
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
      await auditBin(ctx, "recycle_bin_deleted", input.type, input.id);
      return { success: true };
    }),
});
