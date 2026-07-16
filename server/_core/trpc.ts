import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Procedures still reachable while a user has an outstanding forced
// password change (e.g. a fresh admin-issued temporary password). Keep
// this list to the bare minimum needed to complete the change.
const ALLOWED_DURING_FORCED_PASSWORD_CHANGE = new Set([
  "auth.me",
  "auth.logout",
  "auth.setNewPassword",
]);

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (
    ctx.user.mustChangePassword &&
    !ALLOWED_DURING_FORCED_PASSWORD_CHANGE.has(path)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must set a new password before continuing.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
