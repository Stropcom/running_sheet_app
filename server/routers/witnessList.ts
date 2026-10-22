import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { computeWitnessListData } from "../db";

export const witnessListRouter = router({
  /**
   * Returns the same structured witness-list data the .docx generator uses
   * (see computeWitnessListData in db.ts), for the client-side PDF export —
   * both paths classify witnesses identically since they share this function.
   */
  getData: protectedProcedure
    .input(
      z.object({
        sheetIds: z.array(z.number()).min(1),
        operationName: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      return computeWitnessListData(
        input.sheetIds,
        input.operationName,
        ctx.user.cin ?? "UNKNOWN"
      );
    }),

  /**
   * Generates a witness list document for the selected running sheets.
   * Primary witnesses: CINs that appear on at least one non-excluded row.
   * Secondary witnesses: CINs that ONLY appear on excluded rows (travelled via,
   *   surveillance commenced/ceased).
   * Returns a base64-encoded .docx.
   */
  generate: protectedProcedure
    .input(
      z.object({
        sheetIds: z.array(z.number()).min(1),
        operationName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { generateWitnessListDocx } = await import(
        "../witnessListGenerator"
      );

      const data = await computeWitnessListData(
        input.sheetIds,
        input.operationName,
        ctx.user.cin ?? "UNKNOWN"
      );
      const buf = await generateWitnessListDocx(data);

      const filename = `WitnessList_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date(data.producedAt).toISOString().slice(0, 10)}.docx`;
      return {
        filename,
        base64: buf.toString("base64"),
        producedAt: data.producedAt,
      };
    }),
});
