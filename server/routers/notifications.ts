import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteReadNotificationsForUser,
  purgeExpiredNotifications,
} from "../db";

// General-purpose inbox any module can write into (opManager's postWeek is
// the first user) — reliable counterpart to browser push, which depends on
// OS permissions/per-device subscriptions and is broken outright on iOS
// Safari unless installed as a home-screen PWA.
export const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Opportunistic purge (no cron — see references/periodic-updates.md),
    // same pattern as recycleBin.list below.
    await purgeExpiredNotifications();
    return getNotificationsForUser(ctx.user.id);
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return { count: await getUnreadNotificationCount(ctx.user.id) };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationRead(input.id, ctx.user.id);
      return { ok: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.id);
    return { ok: true };
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteNotification(input.id, ctx.user.id);
      return { ok: true };
    }),

  clearRead: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteReadNotificationsForUser(ctx.user.id);
    return { ok: true };
  }),
});
