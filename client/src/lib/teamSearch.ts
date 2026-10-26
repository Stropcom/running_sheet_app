// Team Search — the app-side of "one search for everyone on the operation".
//
// Starting Search on a running sheet writes one shared row for the sheet
// (server: intelligence.startTeamSearch). Every screen that is logged in and has
// that operation selected on the Map polls intelligence.getMyTeamSearch and,
// while one is running, switches the Target Predictor on in Search by itself —
// whatever sheet or target that screen has selected, and whether or not its
// Show & Share is on. Nothing asks to join and nothing is switched on for
// anyone's location. This file is the polling hook and the small per-screen
// memory of a search this screen has left (turning the predictor off leaves it
// on this screen only).
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** How often the Map page asks whether a search is running. */
export const TEAM_SEARCH_POLL_MS = 8_000;

const DISMISSED_KEY = "runlog_team_search_dismissed";
const DISMISSED_EVENT = "runlog-team-search-dismissed";

export interface TeamSearch {
  sheetId: number;
  operationId: number;
  targetId: number;
  startedAtMs: number;
  startedByCIN: string | null;
  hasPin: boolean;
}

/** One id per search (a new row for every start), so a screen can tell a new
 * one from one it has already dealt with or left. */
export const searchKey = (s: Pick<TeamSearch, "sheetId" | "startedAtMs">) =>
  `${s.sheetId}:${s.startedAtMs}`;

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The search running on the operations this screen has selected (the first
 * one started, if several), and whether this screen is in it ("active") or has
 * left it. */
export function useTeamSearch(operationIds: number[]) {
  const { user } = useAuth();
  const query = trpc.intelligence.getMyTeamSearch.useQuery(
    { operationIds },
    {
      enabled: !!user && operationIds.length > 0,
      refetchInterval: TEAM_SEARCH_POLL_MS,
      refetchOnWindowFocus: true,
      retry: false,
    }
  );
  const search = (
    operationIds.length > 0 ? (query.data ?? null) : null
  ) as TeamSearch | null;
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  useEffect(() => {
    const sync = () => setDismissed(readDismissed());
    window.addEventListener(DISMISSED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISMISSED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const key = search ? searchKey(search) : null;
  const active = !!search && dismissed !== key;

  /** Leave this search on this screen only; the others carry on. */
  const dismiss = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, key);
    } catch {
      /* private window: it just comes back on the next poll */
    }
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  }, [key]);
  /** Take part again after leaving. */
  const rejoin = useCallback(() => {
    try {
      window.localStorage.removeItem(DISMISSED_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  }, []);

  return {
    search,
    key,
    active,
    loaded: query.isSuccess,
    dismiss,
    rejoin,
  };
}
