import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COLOR_PALETTES } from "@shared/const";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getUserById,
  updateUser,
  listOperationShares,
} from "../db";

export const profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user)
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    // Never return passwordHash to the client
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }),

  /** What other Commands have shared with the signed-in person. */
  mySharedAccess: protectedProcedure.query(async ({ ctx }) => {
    return listOperationShares({ userId: ctx.user.id });
  }),

  updatePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(1, "New password is required."),
        confirmPassword: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New passwords do not match.",
        });
      }
      const user = await getUserById(ctx.user.id);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      const valid = await bcrypt.compare(
        input.currentPassword,
        user.passwordHash
      );
      if (!valid)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect.",
        });
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await updateUser(ctx.user.id, { passwordHash: newHash });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_updated",
        details: `CIN ${ctx.user.cin ?? "Unknown"} changed password`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  updateRosterShiftNotifPref: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await updateUser(ctx.user.id, {
        rosterShiftNotificationsEnabled: input.enabled,
      });
      return { success: true };
    }),

  updateColorPalette: protectedProcedure
    .input(
      z.object({
        palette: z.enum(COLOR_PALETTES.map(p => p.id) as [string, ...string[]]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await updateUser(ctx.user.id, { colorPalette: input.palette });
      return { success: true };
    }),
});
