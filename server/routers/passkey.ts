import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isFeatureOwner } from "@shared/commandFeatures";
import {
  ADMIN_CODE_MINUTES,
  PASSWORD_SIGNINS_CHOICES,
  canAdministerPasskey,
  canSeePasskeyPerson,
  passkeyStatus,
} from "@shared/passkeyRules";
import {
  TOO_MANY_MESSAGE,
  accountOf,
  attemptsExhausted,
  beginLogin,
  beginRegistration,
  cancelCodes,
  clearAttempts,
  deviceCounts,
  finishLogin,
  finishRegistration,
  findLiveCode,
  issueCode,
  listDevices,
  liveAdminCodeExpiries,
  loadPasskeySettings,
  markCodeUsed,
  myStatus,
  recordFailedAttempt,
  removeDevice,
  savePasskeySettings,
} from "../passkey";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getAllUsers,
  getUserById,
  getUserByUsername,
  updateUser,
} from "../db";

import {
  adminProcedure,
  startSignedInSession,
  signedInUserShape,
  passkeyPerson,
} from "./_helpers";

// Device-bound sign-in (server/passkey.ts, rules in shared/passkeyRules.ts).
// OFF until the owner switches "Require a passkey for all users" on: while
// it is off nobody is blocked and the screens show nothing.
export const passkeyRouter = router({
  // — Signing in (public) —
  loginOptions: publicProcedure
    .input(z.object({ username: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const username = input.username.trim().toLowerCase();
      const user = await getUserByUsername(username);
      return beginLogin(ctx.req, user && !user.archivedAt ? user : undefined);
    }),

  login: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(64),
        challengeId: z.string().min(8).max(64),
        response: z.any(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const username = input.username.trim().toLowerCase();
      const key = `plogin:${username}`;
      if (attemptsExhausted(key))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: TOO_MANY_MESSAGE,
        });
      const found = await getUserByUsername(username);
      const user = found && !found.archivedAt ? found : undefined;
      const ok = await finishLogin(ctx.req, user, {
        challengeId: input.challengeId,
        response: input.response,
      });
      if (!ok) {
        recordFailedAttempt(key);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Passkey sign-in failed. Try again, or use your password.",
        });
      }
      clearAttempts(key);
      await startSignedInSession(ctx, ok);
      await createAuditLog({
        sheetId: 0,
        userId: ok.id,
        userName: ok.cin ?? "Unknown",
        userCIN: ok.cin,
        action: "passkey_login",
        details: `CIN ${ok.cin ?? "Unknown"} signed in with a passkey`,
        createdAt: Date.now(),
      });
      return { success: true as const, user: signedInUserShape(ok) };
    }),

  // Register a device with a one-time code (locked out, or a new device).
  redeemOptions: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(64),
        code: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const username = input.username.trim().toLowerCase();
      const key = `pcode:${username}`;
      if (attemptsExhausted(key))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: TOO_MANY_MESSAGE,
        });
      const found = await getUserByUsername(username);
      const user = found && !found.archivedAt ? found : undefined;
      const code = user ? await findLiveCode(user.id, input.code) : null;
      if (!user || !code) {
        recordFailedAttempt(key);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That code isn't right, has expired, or was already used. Ask your admin for a new one.",
        });
      }
      return beginRegistration(ctx.req, user);
    }),

  redeem: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(64),
        code: z.string().min(1).max(32),
        challengeId: z.string().min(8).max(64),
        response: z.any(),
        deviceName: z.string().max(64),
        deviceKind: z.enum(["Phone", "Tablet", "Laptop"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const username = input.username.trim().toLowerCase();
      const key = `pcode:${username}`;
      if (attemptsExhausted(key))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: TOO_MANY_MESSAGE,
        });
      const found = await getUserByUsername(username);
      const user = found && !found.archivedAt ? found : undefined;
      const code = user ? await findLiveCode(user.id, input.code) : null;
      if (!user || !code) {
        recordFailedAttempt(key);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That code isn't right, has expired, or was already used. Ask your admin for a new one.",
        });
      }
      await finishRegistration(ctx.req, user, {
        challengeId: input.challengeId,
        response: input.response,
        deviceName: input.deviceName,
        deviceKind: input.deviceKind,
      });
      await markCodeUsed(code.id);
      clearAttempts(key);
      await createAuditLog({
        sheetId: 0,
        userId: user.id,
        userName: user.cin ?? "Unknown",
        userCIN: user.cin,
        action: "passkey_code_used",
        details: `CIN ${user.cin ?? "Unknown"} used a one-time code${code.issuedByCIN ? ` from CIN ${code.issuedByCIN}` : ""} to register a device`,
        createdAt: Date.now(),
      });
      await startSignedInSession(ctx, user);
      return { success: true as const, user: signedInUserShape(user) };
    }),

  // — My own devices (signed in) —
  status: protectedProcedure.query(async ({ ctx }) => myStatus(ctx.user)),

  registerOptions: protectedProcedure.mutation(async ({ ctx }) =>
    beginRegistration(ctx.req, ctx.user)
  ),

  register: protectedProcedure
    .input(
      z.object({
        challengeId: z.string().min(8).max(64),
        response: z.any(),
        deviceName: z.string().max(64),
        deviceKind: z.enum(["Phone", "Tablet", "Laptop"]),
      })
    )
    .mutation(async ({ input, ctx }) =>
      finishRegistration(ctx.req, ctx.user, input)
    ),

  removeMyDevice: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const settings = await loadPasskeySettings();
      const devices = await listDevices(ctx.user.id);
      if (settings.requireAll && !ctx.user.passkeyExempt && devices.length <= 1)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This is your only device. Ask an admin in your region if you need it removed.",
        });
      return removeDevice(input.id, { user: ctx.user });
    }),

  // A code made on one of my own devices, to add another.
  selfCode: protectedProcedure.mutation(async ({ ctx }) => {
    if ((await listDevices(ctx.user.id)).length === 0)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Register a device first.",
      });
    const made = await issueCode(ctx.user.id, "self", ctx.user.cin ?? null);
    await createAuditLog({
      sheetId: 0,
      userId: ctx.user.id,
      userName: ctx.user.cin ?? "Unknown",
      userCIN: ctx.user.cin,
      action: "passkey_code_issued",
      details: `CIN ${ctx.user.cin ?? "Unknown"} made an add-device code on their own device`,
      createdAt: Date.now(),
    });
    return made;
  }),

  // — Admins: people in their own Command (the owner: everyone) —
  people: adminProcedure.query(async ({ ctx }) => {
    const settings = await loadPasskeySettings();
    const everyone = await getAllUsers();
    const me = passkeyPerson(ctx.user);
    const visible = everyone.filter(
      u => !u.archivedAt && canSeePasskeyPerson(me, passkeyPerson(u))
    );
    const ids = visible.map(u => u.id);
    const counts = await deviceCounts(ids);
    const codes = await liveAdminCodeExpiries(ids);
    return {
      settings,
      isOwner: isFeatureOwner(ctx.user),
      people: visible.map(u => {
        const status = passkeyStatus(
          settings,
          accountOf(u, counts.get(u.id) ?? 0)
        );
        return {
          id: u.id,
          cin: u.cin,
          name: u.name,
          role: u.role,
          command: u.command,
          deviceCount: counts.get(u.id) ?? 0,
          exempt: u.passkeyExempt,
          status,
          canAdminister: canAdministerPasskey(me, passkeyPerson(u)),
          codeExpiresAt: codes.get(u.id) ?? null,
        };
      }),
    };
  }),

  issueCode: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const target = await getUserById(input.userId);
      if (
        !target ||
        target.archivedAt ||
        !canAdministerPasskey(passkeyPerson(ctx.user), passkeyPerson(target))
      )
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      const made = await issueCode(target.id, "admin", ctx.user.cin ?? null);
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin,
        action: "passkey_code_issued",
        details: `Admin CIN ${ctx.user.cin ?? "Unknown"} issued a one-time code for CIN ${target.cin ?? "Unknown"} (${ADMIN_CODE_MINUTES} minutes), having verified who they are`,
        createdAt: Date.now(),
      });
      return made;
    }),

  cancelCode: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const target = await getUserById(input.userId);
      if (
        !target ||
        !canAdministerPasskey(passkeyPerson(ctx.user), passkeyPerson(target))
      )
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      await cancelCodes(target.id);
      return { success: true as const };
    }),

  userDevices: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const target = await getUserById(input.userId);
      if (
        !target ||
        !canAdministerPasskey(passkeyPerson(ctx.user), passkeyPerson(target))
      )
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      return (await listDevices(target.id)).map(d => ({
        id: d.id,
        name: d.deviceName,
        kind: d.deviceKind,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
      }));
    }),

  removeUserDevice: adminProcedure
    .input(z.object({ userId: z.number().int(), id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const target = await getUserById(input.userId);
      if (
        !target ||
        !canAdministerPasskey(passkeyPerson(ctx.user), passkeyPerson(target))
      )
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      return removeDevice(input.id, { user: ctx.user, onBehalfOf: target });
    }),

  // — The owner: the switch, the allowance, exemptions —
  setSettings: protectedProcedure
    .input(
      z.object({
        requireAll: z.boolean(),
        maxPasswordSignIns: z
          .number()
          .int()
          .refine(n =>
            (PASSWORD_SIGNINS_CHOICES as readonly number[]).includes(n)
          ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isFeatureOwner(ctx.user))
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      const before = await loadPasskeySettings();
      const { resetCounters } = await savePasskeySettings(
        input,
        ctx.user.cin ?? null
      );
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin,
        action: "passkey_settings_changed",
        details: `Owner CIN ${ctx.user.cin ?? "Unknown"}: Require a passkey for all users ${before.requireAll ? "on" : "off"} → ${input.requireAll ? "on" : "off"}; password-only sign-ins before lockout ${before.maxPasswordSignIns} → ${input.maxPasswordSignIns}${resetCounters ? "; everyone's countdown started from zero" : ""}`,
        createdAt: Date.now(),
      });
      return loadPasskeySettings();
    }),

  setExempt: protectedProcedure
    .input(z.object({ userId: z.number().int(), exempt: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!isFeatureOwner(ctx.user))
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available." });
      const target = await getUserById(input.userId);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Not found." });
      await updateUser(target.id, { passkeyExempt: input.exempt });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin,
        action: "passkey_settings_changed",
        details: `Owner CIN ${ctx.user.cin ?? "Unknown"} ${input.exempt ? "exempted" : "removed the exemption for"} CIN ${target.cin ?? "Unknown"} from the passkey requirement`,
        createdAt: Date.now(),
      });
      return { success: true as const };
    }),
});
