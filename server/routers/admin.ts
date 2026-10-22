import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COMMAND_CODES, COMMAND_LABELS } from "@shared/commands";
import {
  canShareOperation,
  SHARE_LEVELS,
  SHARE_LEVEL_LABEL,
  type ShareLevel,
} from "@shared/operationAccess";
import { invalidateAccessCache, toAccessUser } from "../operationAccess";
import { router } from "../_core/trpc";
import {
  createAuditLog,
  createUser,
  listTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  teamNameTaken,
  archiveUser,
  restoreUser,
  deleteUser,
  getAllUsers,
  getOperationById,
  getUserById,
  updateUser,
  updateUserRole,
  listOperationShares,
  upsertOperationShare,
  deleteOperationShare,
  getOperationShareRow,
  listVisitorTeams,
  setVisitorTeam,
  clearVisitorTeamIfNoShares,
} from "../db";

import {
  adminProcedure,
  assertCanManageUser,
  teamInput,
  assertTeamFitsCommand,
  assertCanManageTeam,
  noAllRegionAdminYet,
} from "./_helpers";

export const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    // Never send password hashes to the browser, even to an admin — every
    // admin can now see people from every Command.
    const teamName = new Map((await listTeams()).map(t => [t.id, t.name]));
    return (await getAllUsers()).map(
      ({ passwordHash: _passwordHash, legacyTeam: _legacy, ...rest }) => ({
        ...rest,
        teamName:
          rest.teamId != null ? (teamName.get(rest.teamId) ?? null) : null,
      })
    );
  }),

  // ─── Teams (per Command) ────────────────────────────────────────────────
  createTeam: adminProcedure
    .input(
      z.object({
        command: z.enum(COMMAND_CODES).optional(),
        ...teamInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const command = input.command ?? ctx.user.command;
      if (!ctx.user.allRegions && command !== ctx.user.command) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Only a ${COMMAND_LABELS[command]} admin can add its teams.`,
        });
      }
      if (await teamNameTaken(command, input.name)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${COMMAND_LABELS[command]} already has a team called "${input.name}".`,
        });
      }
      const id = await createTeam({
        command,
        name: input.name,
        colour: input.colour ?? null,
        aiPhones: input.aiPhones ?? [],
        mapVisibility: input.mapVisibility,
        forceShare: input.forceShare,
        offerOnNewSheet: input.offerOnNewSheet,
      });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_updated",
        details: `Team "${input.name}" added to ${COMMAND_LABELS[command]}`,
        createdAt: Date.now(),
      });
      return { id };
    }),

  updateTeam: adminProcedure
    .input(z.object({ id: z.number(), ...teamInput }))
    .mutation(async ({ input, ctx }) => {
      const team = await assertCanManageTeam(ctx.user, input.id);
      if (
        input.name !== team.name &&
        (await teamNameTaken(team.command, input.name, team.id))
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${COMMAND_LABELS[team.command]} already has a team called "${input.name}".`,
        });
      }
      await updateTeam(team.id, {
        name: input.name,
        colour: input.colour ?? null,
        aiPhones: input.aiPhones ?? [],
        mapVisibility: input.mapVisibility,
        forceShare: input.forceShare,
        offerOnNewSheet: input.offerOnNewSheet,
      });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_updated",
        details: `Team "${team.name}" (${COMMAND_LABELS[team.command]}) updated${input.name !== team.name ? ` — now "${input.name}"` : ""}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  deleteTeam: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const team = await assertCanManageTeam(ctx.user, input.id);
      const moved = await deleteTeam(team.id);
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_updated",
        details: `Team "${team.name}" (${COMMAND_LABELS[team.command]}) deleted; ${moved} ${moved === 1 ? "person" : "people"} now have no team`,
        createdAt: Date.now(),
      });
      return { success: true, moved };
    }),

  // ─── Sharing operations across Commands ────────────────────────────────
  // An admin of the Command that owns an operation gives named people in
  // other Commands access to it. Rule: shared/operationAccess.ts.

  /** Shares this admin may see: what their Command shared out, and what
   * reaches their Command's people (an all-region admin: all). */
  listShares: adminProcedure.query(async ({ ctx }) => {
    const all = await listOperationShares();
    if (ctx.user.allRegions) return all;
    // What this Command shared out, and what reaches its own people.
    return all.filter(
      s =>
        s.fromCommand === ctx.user.command || s.userCommand === ctx.user.command
    );
  }),

  /** Shares that reach one person, as far as this admin may see them: what
   * their own Command shared, plus anything shared INTO their Command that
   * reaches this person. Other Commands' sharing stays private. */
  userShares: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const [target, rows] = await Promise.all([
        getUserById(input.userId),
        listOperationShares({ userId: input.userId }),
      ]);
      if (!target) return [];
      return rows.filter(
        r =>
          ctx.user.allRegions ||
          r.fromCommand === ctx.user.command ||
          target.command === ctx.user.command
      );
    }),

  /** Which of the hosting Command's teams each visitor is in. An admin
   * sees their own Command's (an all-region admin: every Command's). */
  listVisitorTeams: adminProcedure.query(async ({ ctx }) =>
    listVisitorTeams(ctx.user.allRegions ? null : ctx.user.command)
  ),

  /** Put a visitor (someone this Command shared access with) in one of its
   * teams, or take them out (teamId null). Their own team is untouched. */
  setVisitorTeam: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        teamId: z.number().nullable(),
        /** The hosting Command. Defaults to the admin's own; only an
         * all-region admin may name another. */
        command: z.enum(COMMAND_CODES).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const command = input.command ?? ctx.user.command;
      if (!ctx.user.allRegions && command !== ctx.user.command) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Only a ${COMMAND_LABELS[command]} admin can put visitors in its teams.`,
        });
      }
      const visitor = await getUserById(input.userId);
      if (!visitor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Person not found.",
        });
      }
      const shared = await listOperationShares({
        userId: input.userId,
        fromCommand: command,
      });
      if (shared.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${visitor.name} hasn't been given access to ${COMMAND_LABELS[command]} operations, so they aren't a visitor there.`,
        });
      }
      let teamLabel = "no team";
      if (input.teamId != null) {
        await assertTeamFitsCommand(input.teamId, command);
        teamLabel = `"${(await getTeamById(input.teamId))?.name ?? "?"}"`;
      }
      await setVisitorTeam({
        userId: input.userId,
        command,
        teamId: input.teamId,
        assignedByCIN: ctx.user.cin ?? "Unknown",
      });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_updated",
        details: `Visitor ${visitor.name} (CIN: ${visitor.cin ?? "?"}) put in ${COMMAND_LABELS[command]} team: ${teamLabel}`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  createShares: adminProcedure
    .input(
      z.object({
        userIds: z.array(z.number()).min(1).max(300),
        scope: z.enum(["all", "operations"]),
        operationIds: z.array(z.number()).optional(),
        /** Which Command's operations "all" means. Defaults to the admin's
         * own; only an all-region admin may name another. */
        fromCommand: z.enum(COMMAND_CODES).optional(),
        level: z.enum(SHARE_LEVELS as [ShareLevel, ...ShareLevel[]]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const me = toAccessUser(ctx.user);
      const targets: Array<{
        operationId: number | null;
        fromCommand: (typeof COMMAND_CODES)[number] | null;
        label: string;
        owner: (typeof COMMAND_CODES)[number];
      }> = [];
      if (input.scope === "all") {
        const from = input.fromCommand ?? ctx.user.command;
        if (!canShareOperation(me, { id: 0, command: from })) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Only a ${COMMAND_LABELS[from]} admin can share its operations.`,
          });
        }
        targets.push({
          operationId: null,
          fromCommand: from,
          label: `every ${COMMAND_LABELS[from]} operation`,
          owner: from,
        });
      } else {
        const ids = Array.from(new Set(input.operationIds ?? []));
        if (ids.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pick at least one operation to share.",
          });
        }
        for (const id of ids) {
          const op = await getOperationById(id);
          if (!op || op.deletedAt) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "An operation you picked no longer exists.",
            });
          }
          if (!canShareOperation(me, { id: op.id, command: op.command })) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Only a ${COMMAND_LABELS[op.command]} admin can share ${op.name}.`,
            });
          }
          targets.push({
            operationId: op.id,
            fromCommand: null,
            label: op.name,
            owner: op.command,
          });
        }
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const sharedWith: string[] = [];
      for (const userId of Array.from(new Set(input.userIds))) {
        const person = await getUserById(userId);
        if (!person || person.archivedAt) {
          skipped++;
          continue;
        }
        sharedWith.push(person.cin ?? person.name);
        for (const t of targets) {
          // Sharing with someone in the owning Command changes nothing —
          // they already have it.
          if (person.command === t.owner) {
            skipped++;
            continue;
          }
          const r = await upsertOperationShare({
            operationId: t.operationId,
            fromCommand: t.fromCommand,
            userId,
            level: input.level,
            sharedByCIN: ctx.user.cin ?? "Unknown",
          });
          if (r === "created") created++;
          else updated++;
        }
      }
      invalidateAccessCache();
      if (created + updated > 0) {
        await createAuditLog({
          sheetId: 0,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "operation_shared",
          details: `Shared ${targets.map(t => t.label).join(", ")} at ${SHARE_LEVEL_LABEL[input.level]} with ${sharedWith.length} ${sharedWith.length === 1 ? "person" : "people"} (CIN: ${sharedWith.join(", ")})`,
          createdAt: Date.now(),
        });
      }
      return { created, updated, skipped };
    }),

  revokeShare: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const share = await getOperationShareRow(input.id);
      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found.",
        });
      }
      if (!ctx.user.allRegions && share.fromCommand !== ctx.user.command) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Only a ${COMMAND_LABELS[share.fromCommand]} admin can revoke this.`,
        });
      }
      await deleteOperationShare(input.id);
      // No access left from that Command: no longer a visitor in its team.
      await clearVisitorTeamIfNoShares(share.userId, share.fromCommand);
      invalidateAccessCache();
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "operation_share_revoked",
        details: `Revoked access to ${share.operationName ?? `every ${COMMAND_LABELS[share.fromCommand]} operation`} from ${share.userName} (CIN: ${share.userCIN ?? "?"})`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  getUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const user = await getUserById(input.id);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      const { passwordHash: _passwordHash, ...safe } = user;
      return safe;
    }),

  createUser: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        cin: z.string().min(1),
        unit: z.string().optional(),
        command: z.enum(COMMAND_CODES).optional(),
        allRegions: z.boolean().optional(),
        teamId: z.number().nullable().optional(),
        phone: z.string().optional(),
        username: z.string().min(1),
        password: z.string().min(1),
        role: z.enum(["observer", "member", "admin", "investigator"]),
        investigatorOperationIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.allRegions) {
        if (input.command && input.command !== ctx.user.command) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only an all-region admin can add people to another Command. Make yourself one on your profile first.",
          });
        }
        if (input.allRegions && !(await noAllRegionAdminYet())) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only an all-region admin can make another one.",
          });
        }
      }
      const newCommand = input.command ?? ctx.user.command;
      if (input.teamId != null)
        await assertTeamFitsCommand(input.teamId, newCommand);
      const passwordHash = await bcrypt.hash(input.password, 12);
      const id = await createUser({
        name: input.name,
        cin: input.cin.toUpperCase(),
        unit: input.unit,
        command: newCommand,
        allRegions:
          input.role === "admin" ? (input.allRegions ?? false) : false,
        teamId: input.teamId ?? null,
        phone: input.phone || null,
        username: input.username.trim().toLowerCase(),
        passwordHash,
        role: input.role,
        investigatorOperationIds:
          input.role === "investigator"
            ? JSON.stringify(input.investigatorOperationIds ?? [])
            : null,
        loginMethod: "local",
        lastSignedIn: new Date(),
        // Admin-set password is a temporary one — force a real password
        // to be chosen on first login.
        mustChangePassword: true,
      });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_created",
        details: `User "${input.name}" (CIN: ${input.cin}) created with role "${input.role}"`,
        createdAt: Date.now(),
      });
      return { id };
    }),

  updateUser: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        cin: z.string().min(1).optional(),
        unit: z.string().optional(),
        command: z.enum(COMMAND_CODES).optional(),
        allRegions: z.boolean().optional(),
        teamId: z.number().nullable().optional(),
        phone: z.string().nullable().optional(),
        username: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        role: z
          .enum(["observer", "member", "admin", "investigator"])
          .optional(),
        investigatorOperationIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, password, investigatorOperationIds, ...rest } = input;
      await assertCanManageUser(ctx.user, id);
      if (!ctx.user.allRegions) {
        const current = await getUserById(id);
        if (rest.command && current && rest.command !== current.command) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only an all-region admin can move someone to another Command.",
          });
        }
        // Only a CHANGE to the all-region flag matters (saving a profile
        // sends the unchanged value back).
        if (
          rest.allRegions !== undefined &&
          current &&
          rest.allRegions !== current.allRegions &&
          !(rest.allRegions && (await noAllRegionAdminYet()))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only an all-region admin can change who is one.",
          });
        }
      }
      const updateData: Record<string, unknown> = { ...rest };
      // A team belongs to one Command: keep the pair consistent.
      {
        const current = await getUserById(id);
        const finalCommand = rest.command ?? current?.command;
        if (rest.teamId != null && finalCommand) {
          await assertTeamFitsCommand(rest.teamId, finalCommand);
        } else if (
          rest.teamId === undefined &&
          rest.command &&
          current &&
          rest.command !== current.command
        ) {
          // Moved to another Command without a new team: they leave theirs.
          updateData.teamId = null;
        }
      }
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 12);
      }
      // All-region is an admin-only setting; dropping the admin role drops it.
      if (rest.role && rest.role !== "admin") updateData.allRegions = false;
      if (rest.cin) updateData.cin = rest.cin.toUpperCase();
      if (rest.username)
        updateData.username = rest.username.trim().toLowerCase();
      if (rest.role === "investigator") {
        updateData.investigatorOperationIds = JSON.stringify(
          investigatorOperationIds ?? []
        );
      } else if (rest.role) {
        // Switched away from Investigator — drop the stale grant list.
        updateData.investigatorOperationIds = null;
      } else if (investigatorOperationIds !== undefined) {
        updateData.investigatorOperationIds = JSON.stringify(
          investigatorOperationIds
        );
      }
      await updateUser(id, updateData as Parameters<typeof updateUser>[1]);
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_updated",
        details: `User ID ${id} profile updated`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete your own account.",
        });
      await assertCanManageUser(ctx.user, input.id);
      await deleteUser(input.id);
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_deleted",
        details: `User ID ${input.id} deleted`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["observer", "member", "admin"]),
      })
    )
    .mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  /** Reversible — signs the officer out and hides them from CIN pickers
   * (adding to a team/operation/running sheet) without touching anything
   * already recorded against their CIN. See archivedAt's own comment on
   * the users table for why this isn't a 4th `role` value. */
  archiveUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot archive your own account.",
        });
      await assertCanManageUser(ctx.user, input.id);
      await archiveUser(input.id, ctx.user.cin ?? "Unknown");
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_archived",
        details: `User ID ${input.id} archived`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),

  restoreUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCanManageUser(ctx.user, input.id);
      await restoreUser(input.id);
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "user_restored",
        details: `User ID ${input.id} restored from archive`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),
});
