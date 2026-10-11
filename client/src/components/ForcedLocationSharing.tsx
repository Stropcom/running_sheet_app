import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMustShareLocation } from "@/lib/teams";
import {
  SHARING_EVENT,
  broadcastSharing,
  readSharingFlag,
} from "@/lib/nativeLocation";

/**
 * For a team whose location sharing is forced on (Investigators): the
 * Show & Share switch is turned on the moment they are on the app, on any
 * screen, and put back on if anything turns it off. The iPhone/iPad app's
 * NativeLocationSharing then reports their position (also in the
 * background); in a browser the Map page does, locked on. Renders nothing.
 */
export function ForcedLocationSharing() {
  const { user } = useAuth();
  const mustShare = useMustShareLocation();
  const userId = user?.id;

  useEffect(() => {
    if (!mustShare || userId == null) return;
    const keepOn = () => {
      if (!readSharingFlag(userId)) broadcastSharing(userId, true);
    };
    keepOn();
    window.addEventListener(SHARING_EVENT, keepOn);
    window.addEventListener("storage", keepOn);
    return () => {
      window.removeEventListener(SHARING_EVENT, keepOn);
      window.removeEventListener("storage", keepOn);
    };
  }, [mustShare, userId]);

  return null;
}
