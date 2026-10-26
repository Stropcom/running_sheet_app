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
const JOINED_KEY = "runlog_team_search_joined";
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

function readKey(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}
const readDismissed = () => readKey(DISMISSED_KEY);
const readJoined = () => readKey(JOINED_KEY);

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
  // A search this screen joined by hand (a screen with Show & Share off).
  const [joined, setJoined] = useState<string | null>(readJoined);

  useEffect(() => {
    const sync = () => {
      setDismissed(readDismissed());
      setJoined(readJoined());
    };
    window.addEventListener(DISMISSED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISMISSED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Show & Share on this device: the officer's working device. It is never
  // switched on for them. A screen with it off does not join by itself (it is
  // not the device they are working on), but can join with one tap.
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
  const active = !!search && dismissed !== key && (sharingOn || joined === key);
  /** Running for this officer, but this screen is not in it (Show & Share is
   * off here and it has not been joined): it is offered a Join. */
  const offered = !!search && !active && dismissed !== key;

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
  /** Join the running search on this screen, whatever Show & Share is. */
  const join = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(JOINED_KEY, key);
      window.localStorage.removeItem(DISMISSED_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  }, [key]);

  return {
    search,
    key,
    active,
    offered,
    loaded: query.isSuccess,
    dismiss,
    rejoin,
    join,
  };
}
