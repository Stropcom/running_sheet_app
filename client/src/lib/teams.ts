/**
 * Teams are per-Command records (User Management → Teams): a name, a map pin
 * colour and optional Assumed Identity phones. This is the one place the
 * client reads them from, so the screens that used to hard-code
 * TEAM 1 / TEAM 2 / PTT all agree.
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DEFAULT_COMMAND,
  isCommandCode,
  type CommandCode,
} from "@shared/commands";
import { getPickedRosterCommand } from "@/lib/rosterCommand";
import { teamColourFor } from "@shared/teamColours";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type TeamRow =
  inferRouterOutputs<AppRouter>["users"]["listTeams"][number];

/** Colours offered when making a team (any #rrggbb is accepted). */
export const TEAM_SWATCHES = [
  "#ec4899",
  "#1976d2",
  "#f9a825",
  "#16a34a",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#dc2626",
  "#65a30d",
  "#374151",
];

/** Pin colour for someone with no team (or a team with no colour set). */
export const NO_TEAM_COLOUR = "#6b7280";

/** The caller's Command's teams (an all-region admin gets every Command's —
 * pass `command` to narrow), in display order. */
export function useTeams(command?: CommandCode): TeamRow[] {
  const { data } = trpc.users.listTeams.useQuery(undefined, {
    staleTime: 60_000,
  });
  const all = data ?? [];
  return command ? all.filter(t => t.command === command) : all;
}

/** The signed-in person's own Command's teams, in display order. */
export function useMyTeams(): TeamRow[] {
  const { user } = useAuth();
  const all = useTeams();
  return user ? all.filter(t => t.command === user.command) : [];
}

/** Ids of teams that have someone logged in right now (see
 * shared/teamMap.ts) — decides whether an "online" team shows on the map.
 * `enabled` is false for map-only Investigator accounts, which can't list
 * teams. */
export function useTeamsWithOnlineMembers(enabled = true): Set<number> {
  const { data } = trpc.users.teamsWithOnlineMembers.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  });
  return new Set(data ?? []);
}

/** True when the signed-in person's team forces their location sharing on
 * (Investigators): it switches on at login and can't be switched off. */
export function useMustShareLocation(): boolean {
  const { user } = useAuth();
  return (
    (user as { mustShareLocation?: boolean } | null)?.mustShareLocation === true
  );
}

/**
 * The colour of a team by its NAME, as set in User Management → Teams for the
 * roster / tasking Command being shown (the caller's own, or the one an
 * all-region admin picked). Change a team's colour there and every screen that
 * uses this changes with it. A name with no matching team keeps its standing
 * colour (shared/teamColours.ts).
 */
export function useTeamColour(): (teamName: string) => string {
  const { user } = useAuth();
  const home: CommandCode =
    user && isCommandCode(user.command) ? user.command : DEFAULT_COMMAND;
  const command: CommandCode =
    user?.allRegions === true ? (getPickedRosterCommand() ?? home) : home;
  const teams = useTeams(command);
  return (teamName: string) => teamColourFor(teams, teamName);
}
