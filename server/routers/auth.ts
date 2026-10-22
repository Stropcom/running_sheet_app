import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { loadFeatureMatrix } from "../commandFeatures";
import { loadDataEpoch } from "../dataEpoch";
import { featuresFor, isFeatureOwner } from "@shared/commandFeatures";
import { getSessionCookieOptions } from "../_core/cookies";
import { decidePasswordSignIn, warningText } from "@shared/passkeyRules";
import { accountOf, listDevices, loadPasskeySettings } from "../passkey";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
  getUserByUsername,
  updateUser,
  mustShareLocation,
} from "../db";

import { startSignedInSession, signedInUserShape } from "./_helpers";

export const authRouter = router({
  me: publicProcedure.query(async opts => {
    const user = opts.ctx.user;
    if (!user) return user;
    // Also says whether their team forces location sharing on (the app
    // turns Show & Share on and locks it) — read here, not from the team
    // list, because map-only Investigator accounts can't list teams.
    return {
      ...user,
      mustShareLocation: await mustShareLocation(user),
      // Which switchable features their Command has on, and whether they
      // are the person who changes the switches (see shared/commandFeatures.ts).
      features: featuresFor(user, await loadFeatureMatrix()),
      isFeatureOwner: isFeatureOwner(user),
      // When the data was last zeroed — devices drop their offline drafts
      // when it changes (server/dataEpoch.ts).
      dataEpoch: await loadDataEpoch(),
    };
  }),

  login: publicProcedure
    .input(
      z.object({ username: z.string().min(1), password: z.string().min(1) })
    )
    .mutation(async ({ input, ctx }) => {
      let user;
      try {
        user = await getUserByUsername(input.username.trim().toLowerCase());
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The server is temporarily unavailable. Please wait a moment and try again.",
        });
      }
      if (!user)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password.",
        });

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password.",
        });

      if (user.archivedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account has been archived. Contact an administrator.",
        });

      // Passkey rollout (shared/passkeyRules.ts). A no-op while the owner's
      // switch is off: the decision is then always "allow".
      const decision = decidePasswordSignIn(
        await loadPasskeySettings(),
        accountOf(user, (await listDevices(user.id)).length)
      );
      if (decision.kind === "refuse_has_passkey") {
        return {
          success: false as const,
          blocked: {
            kind: "has_passkey" as const,
            message:
              "Your account uses a passkey, so your password alone is no longer accepted. Sign in with your passkey on a registered device, or ask an admin in your region for a one-time code to register this device.",
          },
        };
      }
      if (decision.kind === "lock") {
        await updateUser(user.id, { passkeyLocked: true });
        await createAuditLog({
          sheetId: 0,
          userId: user.id,
          userName: user.cin ?? "Unknown",
          userCIN: user.cin,
          action: "passkey_locked",
          details: `CIN ${user.cin ?? "Unknown"} locked out: no passkey set up after the allowed password sign-ins`,
          createdAt: Date.now(),
        });
        return {
          success: false as const,
          blocked: {
            kind: "locked" as const,
            message:
              "Your account is locked because you didn't set up a passkey. Contact an admin in your region. They will give you a one-time code to register this device.",
          },
        };
      }
      let passkeyWarning: { left: number; message: string } | undefined;
      if (decision.kind === "allow_warn") {
        await updateUser(user.id, {
          passkeyPasswordSignIns: user.passkeyPasswordSignIns + 1,
        });
        passkeyWarning = {
          left: decision.left,
          message: warningText(decision.left),
        };
      }

      await startSignedInSession(ctx, user);

      // Audit login
      await createAuditLog({
        sheetId: 0,
        userId: user.id,
        userName: user.cin ?? "Unknown",
        userCIN: user.cin,
        action: "user_login",
        details: `CIN ${user.cin ?? "Unknown"} logged in`,
        createdAt: Date.now(),
      });

      return {
        success: true as const,
        user: signedInUserShape(user),
        passkeyWarning,
      };
    }),

  setNewPassword: protectedProcedure
    .input(
      z.object({
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters."),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await updateUser(ctx.user.id, {
        passwordHash,
        mustChangePassword: false,
      });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "password_changed",
        details: `CIN ${ctx.user.cin ?? "Unknown"} set a new password`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) {
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_logout",
        details: `CIN ${ctx.user.cin ?? "Unknown"} logged out`,
        createdAt: Date.now(),
      });
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
