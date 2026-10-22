import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COMMAND_CODES } from "@shared/commands";
import { loadFeatureMatrix, saveFeatureSettings } from "../commandFeatures";
import { FEATURE_KEYS, isFeatureOwner } from "@shared/commandFeatures";
import { protectedProcedure, router } from "../_core/trpc";
import { createAuditLog } from "../db";

// On/off switches per Command (shared/commandFeatures.ts). Only the owner
// sees or changes them; everyone else's own switches arrive with auth.me.
export const commandFeaturesRouter = router({
  all: protectedProcedure.query(async ({ ctx }) => {
    if (!isFeatureOwner(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
    }
    return loadFeatureMatrix();
  }),

  set: protectedProcedure
    .input(
      z.array(
        z.object({
          command: z.enum(COMMAND_CODES),
          feature: z.enum(FEATURE_KEYS),
          enabled: z.boolean(),
        })
      )
    )
    .mutation(async ({ input, ctx }) => {
      if (!isFeatureOwner(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      }
      const before = await loadFeatureMatrix();
      // Only what actually changes is saved and logged.
      const changes = input.filter(
        c => before[c.command][c.feature] !== c.enabled
      );
      if (changes.length > 0) {
        await saveFeatureSettings(changes, ctx.user.cin ?? null);
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? null,
          action: "command_feature_changed",
          details: changes
            .map(
              c => `${c.feature} ${c.enabled ? "on" : "off"} for ${c.command}`
            )
            .join("; "),
          createdAt: Date.now(),
        });
      }
      return loadFeatureMatrix();
    }),
});
