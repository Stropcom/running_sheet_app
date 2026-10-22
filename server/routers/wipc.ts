import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { commandsOfUsers } from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import { getRunningSheetsByOperation } from "../db";

import { generateStatDecDocx } from "../statDecGenerator";
import { generateWipcRequestDocx } from "../wipcRequestGenerator";
import {
  createWipcAuditEntry,
  getWipcAuditLog,
  upsertWipcOfficerProfile,
  getWipcOfficerProfile,
  listWipcMembers,
  createWipcMember,
  updateWipcMember,
  deleteWipcMember,
} from "../db";

import { assertCanManageWipcMember } from "./_helpers";

export const wipcRouter = router({
  /** Returns the first and last running sheet dates for an operation (for deployment date auto-fill) */
  getOperationSheetDates: protectedProcedure
    .input(z.object({ operationId: z.number() }))
    .query(async ({ input }) => {
      const sheets = await getRunningSheetsByOperation(input.operationId);
      if (!sheets || sheets.length === 0) return { start: null, end: null };
      // Read the sheet's picker date directly, falling back to createdAt
      // only for legacy sheets predating sheetDate.
      const getDate = (s: (typeof sheets)[0]) => {
        if (s.sheetDate) {
          const [y, mo, da] = s.sheetDate.split("-").map(Number);
          return Date.UTC(y, mo - 1, da);
        }
        return s.createdAt instanceof Date
          ? s.createdAt.getTime()
          : new Date(s.createdAt).getTime();
      };
      const dates = sheets.map(getDate).sort((a, b) => a - b);
      const toISO = (ts: number) => {
        const d = new Date(ts);
        const y = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dy = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${mo}-${dy}`;
      };
      return { start: toISO(dates[0]), end: toISO(dates[dates.length - 1]) };
    }),

  generateStatDec: protectedProcedure
    .input(
      z.object({
        operationName: z.string().min(1),
        declarantFullName: z.string().min(1),
        witnessFullName: z.string().min(1),
        declarationDate: z.string().min(1), // ISO date string e.g. "2026-07-04"
      })
    )
    .mutation(async ({ input }) => {
      const producedAt = Date.now();
      const buf = await generateStatDecDocx({
        declarantFullName: input.declarantFullName,
        witnessFullName: input.witnessFullName,
        declaredBeforeName: input.declarantFullName,
        declarationDate: input.declarationDate,
      });
      const filename = `StatDec_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${input.declarationDate}.docx`;
      return { filename, base64: buf.toString("base64"), producedAt };
    }),

  generateWipcRequest: protectedProcedure
    .input(
      z.object({
        operationName: z.string().min(1),
        operationDetails: z.string().default(""),
        courtDate: z.string().min(1),
        courtLocation: z.string().min(1),
        requestingCommander: z.string().min(1),
        assistantCommissioner: z.string().min(1),
        isUrgent: z.boolean(),
        requestingOfficerFullName: z.string().min(1),
        requestingOfficerAfpId: z.string().min(1),
        requestingOfficerWorkLocation: z.string().min(1),
        requestingOfficerPortfolio: z.string().min(1),
        requestingOfficerContact: z.string().min(1),
        members: z
          .array(
            z.object({
              fullName: z.string(),
              dob: z.string(),
              afpId: z.string(),
              isUco: z.boolean(),
              isOco: z.boolean(),
              isCin: z.boolean(),
              cinNumber: z.string(),
              aiInitials: z.string(),
              aiKnownAs: z.string(),
              deploymentStart: z.string(),
              deploymentEnd: z.string(),
            })
          )
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const producedAt = Date.now();
      const buf = await generateWipcRequestDocx({
        operationName: input.operationName,
        operationDetails: input.operationDetails,
        courtDate: input.courtDate,
        courtLocation: input.courtLocation,
        requestingCommander: input.requestingCommander,
        assistantCommissioner: input.assistantCommissioner,
        isUrgent: input.isUrgent,
        requestingOfficerFullName: input.requestingOfficerFullName,
        requestingOfficerAfpId: input.requestingOfficerAfpId,
        requestingOfficerWorkLocation: input.requestingOfficerWorkLocation,
        requestingOfficerPortfolio: input.requestingOfficerPortfolio,
        requestingOfficerContact: input.requestingOfficerContact,
        members: input.members,
      });
      const filename = `WIPCRequest_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${input.courtDate}.docx`;
      // Audit log the generation
      await createWipcAuditEntry({
        userId: ctx.user.id,
        action: "GENERATE_WIPC",
        detail: input.operationName,
      });
      return { filename, base64: buf.toString("base64"), producedAt };
    }),

  // ── Vault: Officer Profile ─────────────────────────────────────────────────
  getOfficerProfile: protectedProcedure.query(async ({ ctx }) => {
    await createWipcAuditEntry({
      userId: ctx.user.id,
      action: "READ_OFFICER",
    });
    return getWipcOfficerProfile(ctx.user.id);
  }),

  saveOfficerProfile: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(1),
        afpId: z.string().min(1),
        workLocation: z.string().optional(),
        portfolio: z.string().optional(),
        contactNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertWipcOfficerProfile(ctx.user.id, input);
      await createWipcAuditEntry({
        userId: ctx.user.id,
        action: "SAVE_OFFICER",
      });
      return { ok: true };
    }),

  // ── Vault: Member Registry (admin only) ───────────────────────────────────
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required for WIPC member registry",
      });
    await createWipcAuditEntry({
      userId: ctx.user.id,
      action: "READ_MEMBERS",
    });
    const members = await listWipcMembers();
    if (ctx.user.allRegions) return members;
    const commands = await commandsOfUsers();
    return members.filter(m => commands.get(m.createdBy) === ctx.user.command);
  }),

  saveMember: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        fullName: z.string().min(1),
        dob: z.string().optional(),
        afpId: z.string().min(1),
        cinNumber: z.string().optional(),
        aiInitials: z.string().optional(),
        aiKnownAs: z.string().optional(),
        isUco: z.boolean().default(false),
        isOco: z.boolean().default(false),
        isCin: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      if (input.id) {
        await assertCanManageWipcMember(ctx.user, input.id);
        await updateWipcMember(input.id, input);
        await createWipcAuditEntry({
          userId: ctx.user.id,
          action: "UPDATE_MEMBER",
          targetId: input.id,
          detail: "updated",
        });
        return { ok: true, id: input.id };
      } else {
        const result = await createWipcMember(ctx.user.id, input);
        await createWipcAuditEntry({
          userId: ctx.user.id,
          action: "SAVE_MEMBER",
          detail: "created",
        });
        return { ok: true, id: (result as { insertId?: number })?.insertId };
      }
    }),

  deleteMember: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      await createWipcAuditEntry({
        userId: ctx.user.id,
        action: "DELETE_MEMBER",
        targetId: input.id,
      });
      await assertCanManageWipcMember(ctx.user, input.id);
      await deleteWipcMember(input.id);
      return { ok: true };
    }),

  getVaultAuditLog: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    return getWipcAuditLog(500);
  }),
});
