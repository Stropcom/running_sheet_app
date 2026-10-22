import { protectedProcedure, router } from "../_core/trpc";
import {
  listTeams,
  getAllUsers,
  visitorTeamMap,
  listTeamIdsWithOnlineMembers,
} from "../db";

export const usersRouter = router({
  /** Returns all registered users as {cin, name, unit} for CIN autocomplete/validation */
  listForCin: protectedProcedure.query(async ({ ctx }) => {
    const all = await getAllUsers();
    const teamName = new Map((await listTeams()).map(t => [t.id, t.name]));
    // A visitor the caller's Command hosts is in that Command's team.
    const hosted = await visitorTeamMap(
      ctx.user.allRegions ? null : ctx.user.command
    );
    return all
      .filter(u => !u.archivedAt)
      .map(u => {
        const teamId = hosted.get(u.id) ?? u.teamId;
        return {
          cin: u.cin,
          name: u.name,
          unit: u.unit ?? "",
          teamId,
          teamName: teamId != null ? (teamName.get(teamId) ?? "") : "",
        };
      });
  }),

  /** Teams, in display order: the caller's Command's (an all-region admin:
   * every Command's — filter by `command`). */
  listTeams: protectedProcedure.query(async ({ ctx }) =>
    ctx.user.allRegions ? listTeams() : listTeams(ctx.user.command)
  ),

  /** Ids of teams that have someone logged in right now — what decides
   * whether an "online" team (Admin, Investigators) shows in Map Settings
   * → Teams. Only the caller's own Command's teams (all-region: every
   * Command's), the same set listTeams returns. */
  teamsWithOnlineMembers: protectedProcedure.query(async ({ ctx }) => {
    const visible = new Set(
      (ctx.user.allRegions
        ? await listTeams()
        : await listTeams(ctx.user.command)
      ).map(t => t.id)
    );
    return (await listTeamIdsWithOnlineMembers()).filter(id => visible.has(id));
  }),
});
