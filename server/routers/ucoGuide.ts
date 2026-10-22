import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { filterByOperationAccess, toAccessUser } from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getOperationById,
  getTargetById,
  createUcoGuideDraft,
  updateUcoGuideBriefing,
  getUcoGuideBriefingById,
  listUcoGuideBriefings,
  postUcoGuideBriefing,
  setUcoGuideLevel,
  softDeleteUcoGuideBriefing,
  acknowledgeUcoGuideBriefing,
  getUcoGuideAcknowledgementForUser,
  getUcoGuideAcknowledgements,
  getUcoGuideRosterPrefill,
} from "../db";

import { adminProcedure, ucoGuideBriefingFieldsSchema } from "./_helpers";

export const ucoGuideRouter = router({
  create: adminProcedure
    .input(z.object(ucoGuideBriefingFieldsSchema))
    .mutation(async ({ ctx, input }) => {
      const id = await createUcoGuideDraft(input, ctx.user.id);
      return { id };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), ...ucoGuideBriefingFieldsSchema }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateUcoGuideBriefing(id, data);
      return { ok: true };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const guide = await getUcoGuideBriefingById(input.id);
      if (!guide)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Guide not found.",
        });
      const [operation, target, myAck, acks] = await Promise.all([
        getOperationById(guide.operationId),
        guide.targetId ? getTargetById(guide.targetId) : null,
        getUcoGuideAcknowledgementForUser(
          guide.id,
          ctx.user.id,
          guide.revision
        ),
        getUcoGuideAcknowledgements(guide.id, guide.revision),
      ]);
      return {
        ...guide,
        operationName: operation?.name ?? "Unknown operation",
        target: target ?? null,
        myAcknowledgedAt: myAck?.acknowledgedAt ?? null,
        acknowledgedCount: acks.length,
        acknowledgedCins: acks.map(a => a.cin),
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await filterByOperationAccess(
      toAccessUser(ctx.user),
      await listUcoGuideBriefings(),
      r => r.operationId
    );
    return rows.filter(
      r => r.status === "posted" || r.createdBy === ctx.user.id
    );
  }),

  getRosterPrefill: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => getUcoGuideRosterPrefill(input.sheetId)),

  post: adminProcedure
    .input(z.object({ id: z.number(), userIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const guide = await getUcoGuideBriefingById(input.id);
      if (!guide)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Guide not found.",
        });
      const operation = await getOperationById(guide.operationId);
      const opName = operation?.name ?? "operation";
      const result = await postUcoGuideBriefing(
        input.id,
        ctx.user.cin ?? "Unknown",
        {
          title: `UCO Surveillance Deployment Guide — ${opName}`,
          body: "A UCO deployment guide has been posted for your review.",
          url: `/intelligence/mapping?ucoGuide=${input.id}`,
        },
        input.userIds
      );
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Guide not found.",
        });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "uco_guide_posted",
        details: `UCO Guide ${guide.status === "posted" ? "re-posted" : "posted"} for operation "${opName}" — notified ${result.notifiedUserIds.length} users`,
        createdAt: Date.now(),
      });
      return { ok: true, notified: result.notifiedUserIds.length };
    }),

  setLevel: protectedProcedure
    .input(z.object({ id: z.number(), level: z.number().min(1).max(5) }))
    .mutation(async ({ input }) => {
      await setUcoGuideLevel(input.id, input.level);
      return { ok: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await softDeleteUcoGuideBriefing(input.id, ctx.user.cin ?? "Unknown");
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "uco_guide_deleted",
        details: `UCO Guide #${input.id} deleted`,
        createdAt: Date.now(),
      });
      return { ok: true };
    }),

  acknowledge: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const guide = await getUcoGuideBriefingById(input.id);
      if (!guide)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Guide not found.",
        });
      const ack = await acknowledgeUcoGuideBriefing(
        input.id,
        ctx.user.id,
        ctx.user.cin ?? "Unknown",
        guide.revision
      );
      return ack;
    }),
});
