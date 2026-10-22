import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSidebarOrder, setSidebarOrder, DEFAULT_SIDEBAR_ORDER } from "../db";

export const sidebarRouter = router({
  getOrder: protectedProcedure.query(async ({ ctx }) => {
    const order = await getSidebarOrder(ctx.user.id);
    return { order, defaultOrder: DEFAULT_SIDEBAR_ORDER };
  }),
  setOrder: protectedProcedure
    .input(z.object({ orderedKeys: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      await setSidebarOrder(ctx.user.id, input.orderedKeys);
      return { ok: true };
    }),
});
