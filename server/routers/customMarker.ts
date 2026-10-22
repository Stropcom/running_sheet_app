import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getInvestigatorAllowedOperationIds,
  getCustomMarkers,
  createCustomMarker,
  updateCustomMarker,
  softDeleteCustomMarker,
} from "../db";

export const customMarkerRouter = router({
  list: protectedProcedure
    .input(z.object({ operationIds: z.array(z.number()).optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "investigator") {
        return getCustomMarkers(getInvestigatorAllowedOperationIds(ctx.user));
      }
      return getCustomMarkers(input.operationIds);
    }),

  create: protectedProcedure
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        markerIcon: z.string().min(1),
        markerColour: z.string().min(1),
        label: z.string().optional().nullable(),
        labelOnly: z.boolean().optional(),
        address: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
        operationId: z.number().optional().nullable(),
        targetId: z.number().optional().nullable(),
        assocPersons: z.array(z.string()).optional(),
        assocVehicles: z.array(z.string()).optional(),
        rotation: z.number().min(0).max(359).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await createCustomMarker({
        createdBy: ctx.user.id,
        lat: input.lat,
        lng: input.lng,
        markerIcon: input.markerIcon,
        markerColour: input.markerColour,
        label: input.label ?? null,
        labelOnly: input.labelOnly ?? false,
        address: input.address ?? null,
        note: input.note ?? null,
        operationId: input.operationId ?? null,
        targetId: input.targetId ?? null,
        assocPersons: input.assocPersons ?? [],
        assocVehicles: input.assocVehicles ?? [],
        rotation: input.rotation ?? 0,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().optional().nullable(),
        labelOnly: z.boolean().optional(),
        address: z.string().optional().nullable(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        markerIcon: z.string().optional(),
        markerColour: z.string().optional(),
        note: z.string().optional().nullable(),
        operationId: z.number().optional().nullable(),
        targetId: z.number().optional().nullable(),
        assocPersons: z.array(z.string()).optional(),
        assocVehicles: z.array(z.string()).optional(),
        rotation: z.number().min(0).max(359).optional(),
        linkedIntelLabel: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await updateCustomMarker(id, rest);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const cin = ctx.user.cin ?? ctx.user.name ?? "unknown";
      await softDeleteCustomMarker(input.id, cin);
      return { success: true };
    }),
});
