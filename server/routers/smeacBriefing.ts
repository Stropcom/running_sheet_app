import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { filterByOperationAccess, toAccessUser } from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getOperationById,
  getTargetById,
  createSmeacBriefingDraft,
  updateSmeacBriefing,
  getSmeacBriefingById,
  listSmeacBriefings,
  postSmeacBriefing,
  softDeleteSmeacBriefing,
  acknowledgeSmeacBriefing,
  getSmeacAcknowledgementForUser,
  getSmeacAcknowledgements,
  getSmeacRosterPrefill,
  type SmeacTeamSlot,
} from "../db";

import { adminProcedure, smeacBriefingFieldsSchema } from "./_helpers";

// Exceptional-use urgent briefing — see drizzle/schema.ts. Creating/posting
// is admin-gated (it lives under Administration and notifies every user);
// viewing and acknowledging is open to any logged-in user once posted.
export const smeacBriefingRouter = router({
  create: adminProcedure
    .input(z.object(smeacBriefingFieldsSchema))
    .mutation(async ({ ctx, input }) => {
      const id = await createSmeacBriefingDraft(input, ctx.user.id);
      return { id };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), ...smeacBriefingFieldsSchema }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSmeacBriefing(id, data);
      return { ok: true };
    }),

  // Uploads a map snapshot's image bytes and returns its URL — kept
  // separate from create/update since a brand-new briefing has no id yet
  // (see SmeacBriefingForm.tsx), and this doesn't need one either; the
  // returned url just rides into create/update like any other field once
  // the officer saves.
  uploadMapSnapshot: adminProcedure
    .input(
      z.object({
        dataBase64: z.string().min(1),
        mimeType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.dataBase64, "base64");
      const { url } = await storagePut(
        `smeac-briefings/snapshots/${Date.now()}-map-snapshot.jpg`,
        buffer,
        input.mimeType || "image/jpeg"
      );
      return { url };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const briefing = await getSmeacBriefingById(input.id);
      if (!briefing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Briefing not found.",
        });
      const [operation, target, myAck, acks] = await Promise.all([
        getOperationById(briefing.operationId),
        briefing.targetId ? getTargetById(briefing.targetId) : null,
        getSmeacAcknowledgementForUser(
          briefing.id,
          ctx.user.id,
          briefing.revision
        ),
        getSmeacAcknowledgements(briefing.id, briefing.revision),
      ]);
      return {
        ...briefing,
        operationName: operation?.name ?? "Unknown operation",
        target: target ?? null,
        myAcknowledgedAt: myAck?.acknowledgedAt ?? null,
        acknowledgedCount: acks.length,
        // CINs are unique per user, so this doubles as a per-slot lookup
        // for the "which team member pills have acknowledged" display.
        acknowledgedCins: acks.map(a => a.cin),
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await filterByOperationAccess(
      toAccessUser(ctx.user),
      await listSmeacBriefings(),
      r => r.operationId
    );
    // Drafts are only visible to their own creator; posted is visible to all.
    return rows.filter(
      r => r.status === "posted" || r.createdBy === ctx.user.id
    );
  }),

  getRosterPrefill: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      const slots: SmeacTeamSlot[] = await getSmeacRosterPrefill(input.sheetId);
      return slots;
    }),

  post: adminProcedure
    .input(
      z.object({ id: z.number(), userIds: z.array(z.number()).optional() })
    )
    .mutation(async ({ ctx, input }) => {
      const briefing = await getSmeacBriefingById(input.id);
      if (!briefing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Briefing not found.",
        });
      const operation = await getOperationById(briefing.operationId);
      const opName = operation?.name ?? "operation";
      const notified = await postSmeacBriefing(
        input.id,
        ctx.user.cin ?? "Unknown",
        {
          title: `SMEAC — ${opName}`,
          body:
            briefing.situation?.slice(0, 160) ||
            "An urgent briefing has been posted.",
          url: `/intelligence/mapping?smeac=${input.id}`,
        },
        input.userIds
      );
      if (!notified)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Briefing not found.",
        });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "smeac_briefing_posted",
        details: `SMEAC briefing ${briefing.status === "posted" ? "re-posted" : "posted"} for operation "${opName}" — notified ${notified.length} users`,
        createdAt: Date.now(),
      });
      return { ok: true, notified: notified.length };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await softDeleteSmeacBriefing(input.id, ctx.user.cin ?? "Unknown");
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "smeac_briefing_deleted",
        details: `SMEAC briefing #${input.id} deleted`,
        createdAt: Date.now(),
      });
      return { ok: true };
    }),

  acknowledge: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const briefing = await getSmeacBriefingById(input.id);
      if (!briefing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Briefing not found.",
        });
      const ack = await acknowledgeSmeacBriefing(
        input.id,
        ctx.user.id,
        ctx.user.cin ?? "Unknown",
        briefing.revision
      );
      return ack;
    }),
});
