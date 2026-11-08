import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import {
  createAuditLog,
  createCertification,
  deactivateAllCertificationsForRow,
  deactivateCertification,
  getCertificationByMember,
  getCertificationsByRowIds,
  getMembersByCINAndSheet,
  getMembersByRowIds,
  getRowById,
  setRowLocked,
} from "../db";

import {
  certifierOrAdminProcedure,
  guardActiveSheet,
  guardLiveSheet,
} from "./_helpers";

export const certificationRouter = router({
  certify: certifierOrAdminProcedure
    .input(z.object({ rowId: z.number(), memberId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.rowId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

      await guardLiveSheet(row.sheetId);
      // The CIN being signed must really be on this row (and a spacer is not
      // a person) — for every role, not just members.
      const members = await getMembersByRowIds([input.rowId]);
      const member = members.find(m => m.id === input.memberId);
      if (!member || member.memberName === "__SPACE__")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found on this row.",
        });
      // Member role: can only certify their own CIN
      if (ctx.user.role === "member") {
        const userCIN = ctx.user.cin ?? ctx.user.username ?? "";
        if (member.memberName.toLowerCase() !== userCIN.toLowerCase()) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only certify your own CIN.",
          });
        }
      }

      const existing = await getCertificationByMember(
        input.rowId,
        input.memberId
      );
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Member already certified.",
        });

      const now = Date.now();
      const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
      await createCertification({
        rowId: input.rowId,
        memberId: input.memberId,
        certifiedByUserId: ctx.user.id,
        certifiedByName: ctx.user.name ?? "Unknown",
        certifiedByCIN: certifierCIN,
        certifiedAt: now,
        isActive: true,
      });

      const [membersNow, certs] = await Promise.all([
        getMembersByRowIds([input.rowId]),
        getCertificationsByRowIds([input.rowId]),
      ]);
      // Exclude spacer entries from certification checks
      const rowMembers = membersNow.filter(
        m => m.rowId === input.rowId && m.memberName !== "__SPACE__"
      );
      const activeCerts = certs.filter(
        c => c.rowId === input.rowId && c.isActive
      );
      const allCertified =
        rowMembers.length > 0 &&
        rowMembers.every(m => activeCerts.some(c => c.memberId === m.id));

      if (allCertified) await setRowLocked(input.rowId, true);

      await createAuditLog({
        sheetId: row.sheetId,
        rowId: input.rowId,
        memberId: input.memberId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: certifierCIN,
        action: "certified",
        details: `Certified by CIN ${certifierCIN} at ${new Date(now).toISOString()}${allCertified ? " — Row locked" : ""}`,
        createdAt: now,
      });

      return { success: true, rowLocked: allCertified };
    }),

  certifyAllForCin: certifierOrAdminProcedure
    .input(z.object({ sheetId: z.number(), cin: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await guardLiveSheet(input.sheetId);
      // Member role: can only certify their own CIN
      if (ctx.user.role === "member") {
        const userCIN = ctx.user.cin ?? ctx.user.username ?? "";
        if (input.cin.toLowerCase() !== userCIN.toLowerCase()) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only certify your own CIN.",
          });
        }
      }
      const members = await getMembersByCINAndSheet(input.sheetId, input.cin);
      const uncertifiedMembers = [];
      for (const member of members) {
        if (member.rowIsLocked) continue; // skip already fully-locked rows
        const existing = await getCertificationByMember(
          member.rowId,
          member.id
        );
        if (existing) continue; // already certified
        uncertifiedMembers.push(member);
      }

      const now = Date.now();
      const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
      let certifiedCount = 0;

      for (const member of uncertifiedMembers) {
        await createCertification({
          rowId: member.rowId,
          memberId: member.id,
          certifiedByUserId: ctx.user.id,
          certifiedByName: ctx.user.name ?? "Unknown",
          certifiedByCIN: certifierCIN,
          certifiedAt: now,
          isActive: true,
        });
        certifiedCount++;

        // Check if this row is now fully certified and should be locked
        const [rowMembers, rowCerts] = await Promise.all([
          getMembersByRowIds([member.rowId]),
          getCertificationsByRowIds([member.rowId]),
        ]);
        // Exclude spacer entries from certification checks
        const realMembers = rowMembers.filter(
          m => m.memberName !== "__SPACE__"
        );
        const allCertified =
          realMembers.length > 0 &&
          realMembers.every(m =>
            rowCerts.some(c => c.memberId === m.id && c.isActive)
          );
        if (allCertified) await setRowLocked(member.rowId, true);

        const row = await getRowById(member.rowId);
        if (row) {
          await createAuditLog({
            sheetId: input.sheetId,
            rowId: member.rowId,
            memberId: member.id,
            userId: ctx.user.id,
            userName: ctx.user.cin ?? "Unknown",
            userCIN: certifierCIN,
            action: "certified",
            details: `Bulk certified by CIN ${certifierCIN} for CIN ${input.cin}${allCertified ? " — Row locked" : ""}`,
            createdAt: now,
          });
        }
      }

      return { success: true, certifiedCount };
    }),

  uncertify: certifierOrAdminProcedure
    .input(z.object({ rowId: z.number(), memberId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.rowId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

      // Taking a signature away changes the record: the sheet must be open
      // (a closed sheet is reopened first) and live.
      await guardActiveSheet(row.sheetId);
      const rowMembers = await getMembersByRowIds([input.rowId]);
      if (!rowMembers.some(m => m.id === input.memberId))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found on this row.",
        });
      // Member role: can only unlock rows that contain their own CIN
      if (ctx.user.role === "member") {
        const userCIN = (ctx.user.cin ?? ctx.user.username ?? "").toLowerCase();
        const hasCIN = rowMembers.some(
          m => m.memberName.toLowerCase() === userCIN
        );
        if (!hasCIN)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only unlock rows that contain your CIN.",
          });
      }

      await deactivateCertification(input.rowId, input.memberId);
      await setRowLocked(input.rowId, false);

      const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
      await createAuditLog({
        sheetId: row.sheetId,
        rowId: input.rowId,
        memberId: input.memberId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: certifierCIN,
        action: "uncertified",
        details: `Certification removed by CIN ${certifierCIN} — Row unlocked`,
        createdAt: Date.now(),
      });

      return { success: true };
    }),

  uncertifyAll: certifierOrAdminProcedure
    .input(z.object({ rowId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.rowId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });

      await guardActiveSheet(row.sheetId);
      // Member role: can only bulk-unlock rows that contain their own CIN
      if (ctx.user.role === "member") {
        const rowMembers = await getMembersByRowIds([input.rowId]);
        const userCIN = (ctx.user.cin ?? ctx.user.username ?? "").toLowerCase();
        const hasCIN = rowMembers.some(
          m => m.memberName.toLowerCase() === userCIN
        );
        if (!hasCIN)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only unlock rows that contain your CIN.",
          });
      }

      await deactivateAllCertificationsForRow(input.rowId);
      await setRowLocked(input.rowId, false);

      const certifierCIN = ctx.user.cin ?? ctx.user.username ?? "Unknown";
      await createAuditLog({
        sheetId: row.sheetId,
        rowId: input.rowId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: certifierCIN,
        action: "uncertified",
        details: `All certifications removed by CIN ${certifierCIN} — Row unlocked`,
        createdAt: Date.now(),
      });

      return { success: true };
    }),
});
