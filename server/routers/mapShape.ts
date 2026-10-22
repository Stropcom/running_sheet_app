import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getInvestigatorAllowedOperationIds,
  getMapShapes,
  createMapShape,
  updateMapShape,
  softDeleteMapShape,
} from "../db";

// Transparent annotation shapes (circle/rectangle/sector/line) drawn on the
// Intelligence Mapping page — purely visual, no target/person/vehicle
// linkage (unlike customMarker above). See the mapShapes schema comment
// for which geometry fields apply to which shapeType.
export const mapShapeRouter = router({
  list: protectedProcedure
    .input(z.object({ operationIds: z.array(z.number()).optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "investigator") {
        return getMapShapes(getInvestigatorAllowedOperationIds(ctx.user));
      }
      return getMapShapes(input.operationIds);
    }),

  create: protectedProcedure
    .input(
      z.object({
        shapeType: z.enum(["circle", "rectangle", "sector", "line"]),
        colour: z.string().min(1),
        opacity: z.number().min(0).max(100).optional(),
        label: z.string().optional().nullable(),
        operationId: z.number().optional().nullable(),
        centerLat: z.number().optional().nullable(),
        centerLng: z.number().optional().nullable(),
        radiusMeters: z.number().optional().nullable(),
        startAngle: z.number().optional().nullable(),
        endAngle: z.number().optional().nullable(),
        innerRadiusMeters: z.number().optional().nullable(),
        neLat: z.number().optional().nullable(),
        neLng: z.number().optional().nullable(),
        swLat: z.number().optional().nullable(),
        swLng: z.number().optional().nullable(),
        rotation: z.number().optional().nullable(),
        points: z
          .array(z.object({ lat: z.number(), lng: z.number() }))
          .optional(),
        lineDashed: z.boolean().optional(),
        lineArrowEnd: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await createMapShape({
        createdBy: ctx.user.id,
        shapeType: input.shapeType,
        colour: input.colour,
        opacity: input.opacity,
        label: input.label ?? null,
        operationId: input.operationId ?? null,
        centerLat: input.centerLat ?? null,
        centerLng: input.centerLng ?? null,
        radiusMeters: input.radiusMeters ?? null,
        startAngle: input.startAngle ?? null,
        endAngle: input.endAngle ?? null,
        innerRadiusMeters: input.innerRadiusMeters ?? null,
        neLat: input.neLat ?? null,
        neLng: input.neLng ?? null,
        swLat: input.swLat ?? null,
        swLng: input.swLng ?? null,
        rotation: input.rotation ?? null,
        points: input.points ?? [],
        lineDashed: input.lineDashed,
        lineArrowEnd: input.lineArrowEnd,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        colour: z.string().optional(),
        opacity: z.number().min(0).max(100).optional(),
        label: z.string().optional().nullable(),
        operationId: z.number().optional().nullable(),
        centerLat: z.number().optional().nullable(),
        centerLng: z.number().optional().nullable(),
        radiusMeters: z.number().optional().nullable(),
        startAngle: z.number().optional().nullable(),
        endAngle: z.number().optional().nullable(),
        innerRadiusMeters: z.number().optional().nullable(),
        neLat: z.number().optional().nullable(),
        neLng: z.number().optional().nullable(),
        swLat: z.number().optional().nullable(),
        swLng: z.number().optional().nullable(),
        rotation: z.number().optional().nullable(),
        points: z
          .array(z.object({ lat: z.number(), lng: z.number() }))
          .optional(),
        lineDashed: z.boolean().optional(),
        lineArrowEnd: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await updateMapShape(id, rest);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const cin = ctx.user.cin ?? ctx.user.name ?? "unknown";
      await softDeleteMapShape(input.id, cin);
      return { success: true };
    }),
});
