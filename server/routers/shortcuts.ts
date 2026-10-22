import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listShortcuts,
  reorderShortcuts,
  createShortcut,
  updateShortcut,
  deleteShortcut,
} from "../db";

import { adminProcedure } from "./_helpers";

export const shortcutsRouter = router({
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
  /** Save the Shortcuts-page order (which is also the order of the chips in
   * the running sheet and RS QE) — admin only, like add / edit. `ids` must be
   * every shortcut, first to last. */
  reorder: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(1000) }))
    .mutation(async ({ input }) => {
      const current = await listShortcuts();
      const have = new Set(current.map(s => s.id));
      if (
        new Set(input.ids).size !== input.ids.length ||
        input.ids.length !== have.size ||
        input.ids.some(id => !have.has(id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The shortcut list changed — refresh and try again.",
        });
      }
      await reorderShortcuts(input.ids);
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
});
