import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isFeatureOwner } from "@shared/commandFeatures";
import { protectedProcedure, router } from "../_core/trpc";
import { createAuditLog } from "../db";

import { getDocumentAIModelStatus } from "../documentImport/localDocumentAI";
import { AI_TIME_BUDGET_MS } from "../documentImport/aiBudget";
import { getAiStats, resetAiStats } from "../documentImport/aiStats";
import {
  DOCUMENT_AI_SETTING,
  getBoolSetting,
  setBoolSetting,
} from "../appSettings";

// Empties the operational data (server/zeroData.ts). Owner only, with the
// typed word and the owner's password again.
// Turns Import Target's on-device AI check on or off, and shows what it has
// done since the server started, so the owner can judge whether it helps.
export const documentAiRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!isFeatureOwner(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
    }
    return {
      enabled: await getBoolSetting(DOCUMENT_AI_SETTING, true),
      modelStatus: await getDocumentAIModelStatus(),
      budgetSeconds: Math.round(AI_TIME_BUDGET_MS / 1000),
      stats: getAiStats(),
    };
  }),

  set: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!isFeatureOwner(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      }
      const before = await getBoolSetting(DOCUMENT_AI_SETTING, true);
      await setBoolSetting(
        DOCUMENT_AI_SETTING,
        input.enabled,
        ctx.user.cin ?? null
      );
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin,
        action: "document_ai_changed",
        details: `Owner CIN ${ctx.user.cin ?? "Unknown"}: Import Target document AI ${before ? "on" : "off"} → ${input.enabled ? "on" : "off"}`,
        createdAt: Date.now(),
      });
      return { enabled: input.enabled };
    }),

  /** Start the counts again from zero (to compare on against off). */
  resetStats: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isFeatureOwner(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
    }
    resetAiStats();
    return getAiStats();
  }),
});
