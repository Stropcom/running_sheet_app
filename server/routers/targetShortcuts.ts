import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getTargetShortcuts,
  createTargetShortcut,
  updateTargetShortcut,
  deleteTargetShortcut,
  getTargetShortcutsForSheet,
} from "../db";

export const targetShortcutsRouter = router({
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
});
