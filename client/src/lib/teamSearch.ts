// Team Search — the app-wide side of "one search for the whole team".
//
// Starting Search on a running sheet writes one shared row for the sheet
// (server: intelligence.startTeamSearch). Every officer on that sheet's CIN
// roster polls intelligence.getMyTeamSearch; while a search is running their
// own screen switches the Target Predictor on in Search, selects the sheet on
// the map, turns Show & Share on and draws everyone's Track. This file is the
// polling hook and the small per-device memory (an officer can leave a search
// on their own screen without ending it for the others).
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** How often every screen asks whether a search is running for it. */
export const TEAM_SEARCH_POLL_MS = 8_000;

const DISMISSED_KEY = "runlog_team_search_dismissed";
const PREV_SHARING_KEY = "runlog_team_search_prev_sharing";
const DISMISSED_EVENT = "runlog-team-search-dismissed";

export interface TeamSearch {
  sheetId: number;
  operationId: number;
  targetId: number;
  startedAtMs: number;
  startedByCIN: string | null;
  hasPin: boolean;
  teamUserIds: number[];
}

/** One id per start of a search, so a screen can tell a new one from one it
 * has already dealt with. */
export const searchKey = (s: Pick<TeamSearch, "sheetId" | "startedAtMs">) =>
  `${s.sheetId}:${s.startedAtMs}`;

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The running search for this officer, and whether this screen has taken
 * part ("active") or been told to leave it. */
export function useTeamSearch() {
  const { user } = useAuth();
  const query = trpc.intelligence.getMyTeamSearch.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: TEAM_SEARCH_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const search = (query.data ?? null) as TeamSearch | null;
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

/** What Show & Share was before a search turned it on, so it goes back when the
 * search ends: { key, prev } or null. */
export function rememberPrevSharing(key: string, prev: boolean): void {
  try {
    const cur = window.localStorage.getItem(PREV_SHARING_KEY);
    if (cur && (JSON.parse(cur) as { key?: string }).key === key) return;
    window.localStorage.setItem(
      PREV_SHARING_KEY,
      JSON.stringify({ key, prev })
    );
  } catch {
    /* ignore */
  }
}
export function takePrevSharing(): { key: string; prev: boolean } | null {
  try {
    const cur = window.localStorage.getItem(PREV_SHARING_KEY);
    window.localStorage.removeItem(PREV_SHARING_KEY);
    return cur ? (JSON.parse(cur) as { key: string; prev: boolean }) : null;
  } catch {
    return null;
  }
}
