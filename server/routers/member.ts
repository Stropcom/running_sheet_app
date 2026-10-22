import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  addRowMember,
  createAuditLog,
  getAllUsers,
  getMembersByRowIds,
  getRowById,
  removeRowMember,
  reorderRowMembers,
  reconcileRowPhotoMemberLinks,
  unlinkRowPhotosFromCin,
} from "../db";

import { guardActiveSheet } from "./_helpers";

export const memberRouter = router({
  add: protectedProcedure
    .input(z.object({ rowId: z.number(), memberName: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.rowId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
      await guardActiveSheet(row.sheetId);
      if (row.isLocked)
        throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
      const SPACER = "__SPACE__";
      const cinUpper = input.memberName.trim().toUpperCase();
      // Allow spacer entries; validate all real CINs against registered users
      if (cinUpper !== SPACER) {
        const allRegisteredUsers = await getAllUsers();
        const registeredCins = new Set(
          allRegisteredUsers.map(u => u.cin.toUpperCase())
        );
        if (!registeredCins.has(cinUpper)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `CIN "${cinUpper}" is not a registered user. Only registered CINs can be added.`,
          });
        }
      }
      // Assign sortOrder = current max + 1 so new entries go to the bottom
      const existingMembers = await getMembersByRowIds([input.rowId]);
      const maxOrder = existingMembers.reduce(
        (m, e) => Math.max(m, (e as any).sortOrder ?? 0),
        0
      );
      const id = await addRowMember({
        rowId: input.rowId,
        memberName: cinUpper,
        sortOrder: maxOrder + 1,
      });
      if (cinUpper !== SPACER) {
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: input.rowId,
          memberId: id,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "member_added",
          details: `CIN ${cinUpper} added to row`,
          createdAt: Date.now(),
        });
        const existingRealCins = existingMembers
          .map(m => m.memberName)
          .filter(name => name !== "__SPACE__");
        if (existingRealCins.length === 1) {
          // Row is going from exactly one real CIN to two — whatever
          // "member" link its photos have was only ever an unconfirmed
          // guess (auto-linked because there was nothing else it could be
          // at the time — see autoLinkAttachmentToRowMemberIfSingle/
          // reconcileRowPhotoMemberLinks in db.ts), not something an
          // officer actually chose. Now that it's genuinely ambiguous
          // which of the two CINs the photo belongs to, that guess
          // shouldn't silently keep counting as "linked" — unlink it so
          // the amber "Needs CIN link" placeholder reappears and the
          // officer picks via LinkAttachmentDialog's CIN section, same as
          // any other 2+-member row.
          unlinkRowPhotosFromCin(input.rowId, existingRealCins[0]).catch(
            err => {
              console.error("[member.add] unlinkRowPhotosFromCin failed:", err);
            }
          );
        } else {
          // Row was at 0 real CINs (now 1) or already 2+ (still 2+) —
          // either way, reconcile is the right call: it only actually
          // links anything when the row ends up at exactly one CIN, and
          // no-ops otherwise. See its own comment in db.ts.
          reconcileRowPhotoMemberLinks(input.rowId).catch(err => {
            console.error(
              "[member.add] reconcileRowPhotoMemberLinks failed:",
              err
            );
          });
        }
      }
      return { id };
    }),

  reorder: protectedProcedure
    .input(z.object({ rowId: z.number(), orderedIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.rowId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
      await guardActiveSheet(row.sheetId);
      if (row.isLocked)
        throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
      await reorderRowMembers(input.rowId, input.orderedIds);
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number(), rowId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.rowId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
      await guardActiveSheet(row.sheetId);
      if (row.isLocked)
        throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
      // Captured before the delete below — needed to unlink any photo
      // that was linked to this specific CIN (see unlinkRowPhotosFromCin).
      const removedMember = (await getMembersByRowIds([input.rowId])).find(
        m => m.id === input.id
      );
      await removeRowMember(input.id);
      await createAuditLog({
        sheetId: row.sheetId,
        rowId: input.rowId,
        memberId: input.id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "member_removed",
        details: `CIN removed from row`,
        createdAt: Date.now(),
      });
      if (removedMember && removedMember.memberName !== "__SPACE__") {
        // A photo linked to this CIN no longer has a valid link (the CIN
        // it named isn't on the row any more) — unlink it, then re-run
        // the same single-CIN auto-link the add path uses, in case the
        // row now has exactly one other real CIN left.
        unlinkRowPhotosFromCin(input.rowId, removedMember.memberName)
          .then(() => reconcileRowPhotoMemberLinks(input.rowId))
          .catch(err => {
            console.error(
              "[member.remove] unlink/reconcile row photo member links failed:",
              err
            );
          });
      }
      return { success: true };
    }),
});
