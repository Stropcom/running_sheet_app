import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useTeamSearch } from "@/lib/teamSearch";

/**
 * Team Search, on every screen: while a search is running for this officer's
 * running sheet and this screen has Show & Share on, the officer is told — with
 * a button to open the map; a screen with it off is offered a Join instead. The
 * notice goes when the search ends or they leave it. Show & Share itself is never touched: it is already on for the
 * device the officer is working on. The Target Predictor, the sheet selection
 * and the Tracks are switched on by the Map page itself. The screen is never
 * taken over, so nobody loses a row they are in the middle of typing. Renders
 * nothing.
 */
export function TeamSearchWatcher() {
  const [location, navigate] = useLocation();
  const { search, key, active, offered, join } = useTeamSearch();
  const onMap = location.startsWith("/intelligence/mapping");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (active && search && key) {
      if (handled.current === key) return;
      handled.current = key;
      if (!onMap)
        toast.message(
          search.startedByCIN
            ? `Search started by ${search.startedByCIN}`
            : "Search started",
          {
            id: `team-search-${key}`,
            description: "Open the map to see the rings and the team's tracks.",
            duration: Infinity,
            closeButton: true,
            action: {
              label: "Open map",
              onClick: () => navigate("/intelligence/mapping"),
            },
          }
        );
      return;
    }
    // Running for this officer but not joined here (Show & Share is off on this
    // screen): offer it, with one tap to join. Nothing is switched on for them.
    if (offered && search && key) {
      if (handled.current === key) return;
      handled.current = key;
      toast.message(
        search.startedByCIN
          ? `Search started by ${search.startedByCIN}`
          : "Search started",
        {
          id: `team-search-${key}`,
          description:
            "Join to see the rings and the team's tracks on this screen.",
          duration: Infinity,
          closeButton: true,
          action: {
            label: "Join",
            onClick: () => {
              join();
              if (!onMap) navigate("/intelligence/mapping");
            },
          },
        }
      );
      return;
    }
    if (handled.current) {
      toast.dismiss(`team-search-${handled.current}`);
      handled.current = null;
    }
  }, [active, offered, search, key, onMap, navigate, join]);

  return null;
}
