import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { broadcastSharing, readSharingFlag } from "@/lib/nativeLocation";
import {
  rememberPrevSharing,
  takePrevSharing,
  useTeamSearch,
} from "@/lib/teamSearch";

/**
 * Team Search, on every screen: while a search is running for this officer's
 * running sheet, Show & Share is switched on (so the team's tracks have
 * somewhere to come from), the officer is told, and when the search ends or
 * they leave it Show & Share goes back to what it was. The Target Predictor,
 * the sheet selection and the Tracks are switched on by the Map page itself.
 * Renders nothing.
 */
export function TeamSearchWatcher() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { search, key, active } = useTeamSearch();
  const userId = user?.id;
  const onMap = location.startsWith("/intelligence/mapping");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (userId == null) return;
    if (active && search && key) {
      if (handled.current === key) return;
      handled.current = key;
      rememberPrevSharing(key, readSharingFlag(userId));
      broadcastSharing(userId, true);
      // Not on the Map: say so, and offer it. The screen is never taken over,
      // so nobody loses a row they are in the middle of typing.
      if (!onMap)
        toast.message(
          search.startedByCIN
            ? `Search started by ${search.startedByCIN}`
            : "Search started",
          {
            id: `team-search-${key}`,
            description:
              "Your location is being shared with the team. Open the map to see the rings and everyone's track.",
            duration: Infinity,
            action: {
              label: "Open map",
              onClick: () => navigate("/intelligence/mapping"),
            },
          }
        );
      return;
    }
    // Ended (or left): put Show & Share back to what it was.
    if (handled.current) {
      const was = takePrevSharing();
      if (was && was.prev === false) broadcastSharing(userId, false);
      toast.dismiss(`team-search-${handled.current}`);
      handled.current = null;
    }
  }, [active, search, key, userId, onMap, navigate]);

  return null;
}
