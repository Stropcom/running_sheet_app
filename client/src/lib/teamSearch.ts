// Team Search — the app-wide side of "one search for the whole team".
//
// Starting Search on a running sheet writes one shared row for the sheet
// (server: intelligence.startTeamSearch). Every officer on that sheet's CIN
// roster polls intelligence.getMyTeamSearch; while a search is running their
// own screen switches the Target Predictor on in Search, selects the sheet on
// the map and draws everyone's Track. Only a screen that already has Show &
// Share on takes part — that is the device the officer is working on — so
// nobody ends up with two name tags on the map. This file is the polling hook
// and the small per-device memory (an officer can leave a search on their own
// screen without ending it for the others).
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SHARING_EVENT, readSharingFlag } from "@/lib/nativeLocation";

/** How often every screen asks whether a search is running for it. */
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

  // Show & Share on this device: the officer's working device. It is never
  // switched on for them; a screen with it off simply stays out of the search.
  const userId = user?.id;
  const [sharingOn, setSharingOn] = useState<boolean>(() =>
    readSharingFlag(userId)
  );
  useEffect(() => {
    const sync = () => setSharingOn(readSharingFlag(userId));
    sync();
    window.addEventListener(SHARING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SHARING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  const key = search ? searchKey(search) : null;
  const active = !!search && dismissed !== key && sharingOn;

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
