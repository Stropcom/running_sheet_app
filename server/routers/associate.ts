import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAssociateLinkedToTarget,
  getAssociatesForTargetWithIndices,
  getAssociateById,
  createAssociate,
  updateAssociate,
  softDeleteAssociate,
} from "../db";

import { structuredTargetFieldsSchema } from "./_helpers";

// A person linked to a target as a known associate — structured the same
// way as a target (own name/address/vehicle), via the same controlled
// Name → Address → Vehicle process.
export const associateRouter = router({
  /** List associates for a target */
  listForTarget: protectedProcedure
    .input(z.object({ targetId: z.number() }))
    .query(async ({ input }) => {
      return getAssociatesForTargetWithIndices(input.targetId);
    }),

  /** Get a single associate by id */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return (await getAssociateById(input.id)) ?? null;
    }),

  /** Create a new associate of a target */
  create: protectedProcedure
    .input(
      z.object({
        targetId: z.number(),
        name: z.string().min(1).max(255),
        tgt: z.string().optional().nullable(),
        hbf: z.string().optional().nullable(),
        hb: z.string().optional().nullable(),
        v1f: z.string().optional().nullable(),
        v1: z.string().optional().nullable(),
        extraVehicles: z.string().optional().nullable(),
        // "associate" (default) or "resident" — an "Other Home Address
        // Resident" is filed in the same table, same shape, but shown in
        // its own section on the target. See associates.relationship.
        relationship: z.enum(["associate", "resident"]).optional(),
        ...structuredTargetFieldsSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      return createAssociate({ ...input, createdBy: ctx.user.id });
    }),

  /** Create a new associate of `targetId`, linked to a DIFFERENT existing
   * Target record confirmed to be the same real person — the "Yes, same
   * person — link and copy" resolution on the possible-duplicate prompt.
   * `targetId` (who this associate is filed under) and `existingTargetId`
   * (the other Target record that's the same person) are deliberately
   * separate — see server/db.ts's createAssociateLinkedToTarget. */
  createLinkedFromTarget: protectedProcedure
    .input(
      z.object({
        targetId: z.number(),
        name: z.string().min(1).max(255),
        tgt: z.string().optional().nullable(),
        hbf: z.string().optional().nullable(),
        hb: z.string().optional().nullable(),
        v1f: z.string().optional().nullable(),
        v1: z.string().optional().nullable(),
        extraVehicles: z.string().optional().nullable(),
        existingTargetId: z.number(),
        relationship: z.enum(["associate", "resident"]).optional(),
        ...structuredTargetFieldsSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { existingTargetId, ...data } = input;
      return createAssociateLinkedToTarget(
        { ...data, createdBy: ctx.user.id },
        existingTargetId
      );
    }),

  /** Update an associate */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        tgt: z.string().optional().nullable(),
        hbf: z.string().optional().nullable(),
        hb: z.string().optional().nullable(),
        v1f: z.string().optional().nullable(),
        v1: z.string().optional().nullable(),
        extraVehicles: z.string().optional().nullable(),
        // Re-file between Associates and Other Home Address Residents.
        relationship: z.enum(["associate", "resident"]).optional(),
        ...structuredTargetFieldsSchema,
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateAssociate(id, data);
    }),

  /** Delete (soft) an associate */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await softDeleteAssociate(input.id, ctx.user.cin ?? "Unknown");
      return { success: true };
    }),
});
