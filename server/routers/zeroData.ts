import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { zeroData, zeroDataPreview } from "../zeroData";
import { ZERO_CONFIRM_WORD } from "@shared/zeroDataAreas";
import { isFeatureOwner } from "@shared/commandFeatures";
import { protectedProcedure, router } from "../_core/trpc";
import { getUserById } from "../db";

export const zeroDataRouter = router({
  preview: protectedProcedure.query(async ({ ctx }) => {
    if (!isFeatureOwner(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
    }
    return zeroDataPreview();
  }),

  run: protectedProcedure
    .input(
      z.object({
        confirm: z.string(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isFeatureOwner(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      }
      if (input.confirm.trim() !== ZERO_CONFIRM_WORD) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type ${ZERO_CONFIRM_WORD} to confirm.`,
        });
      }
      const me = await getUserById(ctx.user.id);
      if (!me || !(await bcrypt.compare(input.password, me.passwordHash))) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "That password isn't right. Nothing was cleared.",
        });
      }
      try {
        return await zeroData({ id: ctx.user.id, cin: ctx.user.cin ?? null });
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : "Couldn't clear the data.",
        });
      }
    }),
});
