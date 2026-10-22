import { router } from "../_core/trpc";
import {
  backfillGoogleAddressesInObservations,
  getOrphanedAttachments,
  purgeOrphanedAttachments,
} from "../db";

import { adminProcedure, requireAllRegions } from "./_helpers";

export const adminUtilsRouter = router({
  backfillGoogleAddresses: adminProcedure.mutation(async ({ ctx }) => {
    requireAllRegions(ctx.user);
    const result = await backfillGoogleAddressesInObservations();
    return result;
  }),

  /** Photos whose owning operation is gone (soft-deleted or hard-deleted)
   * but that never got cleaned up themselves — see getOrphanedAttachments. */
  getOrphanedAttachments: adminProcedure.query(async ({ ctx }) => {
    requireAllRegions(ctx.user);
    return getOrphanedAttachments();
  }),

  /** Permanently purges every currently-orphaned attachment. Bypasses the
   * normal 7-day Recycle Bin grace period since these were already
   * deleted along with their operation, just never actually removed. */
  purgeOrphanedAttachments: adminProcedure.mutation(async ({ ctx }) => {
    requireAllRegions(ctx.user);
    const count = await purgeOrphanedAttachments();
    return { purged: count };
  }),
});
