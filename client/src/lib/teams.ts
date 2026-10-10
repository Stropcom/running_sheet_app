/**
 * Teams are per-Command records (User Management → Teams): a name, a map pin
 * colour and optional Assumed Identity phones. This is the one place the
 * client reads them from, so the screens that used to hard-code
 * TEAM 1 / TEAM 2 / PTT all agree.
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { CommandCode } from "@shared/commands";
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
