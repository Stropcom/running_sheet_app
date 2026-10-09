import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  SHARING_EVENT,
  buildLocationUpdate,
  getNativeBackgroundLocation,
  getOrCreateDeviceId,
  readSelectedOperationIds,
  readSharingFlag,
} from "@/lib/nativeLocation";

/**
 * Keeps the officer's position going to the team map from the iPhone/iPad
 * app, on any screen and with the app in the background or the phone locked
 * (iOS "Always" location). Renders nothing, and does nothing at all outside
 * the app shell, where the browser/PWA keep using the Map page's own
 * watcher.
 *
 * The existing "Share my location" switch on the Map page stays the master
 * switch: this runs only while it is on, sends through the same
 * updateUserLocation call at the same rate as the map (every fix the phone
 * delivers), and stops the moment it is turned off or the officer signs out.
 */
export function NativeLocationSharing() {
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const updateLocation = trpc.intelligence.updateUserLocation.useMutation();
  const updateRef = useRef(updateLocation);
  updateRef.current = updateLocation;

  const userId = (user as { id?: number } | null | undefined)?.id;
  const [sharing, setSharing] = useState(() => readSharingFlag(userId));

  // Follow the switch on the Map page (same tab: our own event; other tabs
  // of a browser don't apply here, but the storage event is harmless).
  useEffect(() => {
    const sync = () => setSharing(readSharingFlag(userId));
    sync();
    window.addEventListener(SHARING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SHARING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  useEffect(() => {
    const plugin = getNativeBackgroundLocation();
    if (!plugin || userId == null || !sharing) return;

    const deviceId = getOrCreateDeviceId();
    let watcherId: string | null = null;
    let cancelled = false;
    let warnedDenied = false;

    const callback = (
      fix?: Parameters<typeof buildLocationUpdate>[0],
      error?: { code?: string; message?: string }
    ) => {
      if (cancelled) return;
      if (error) {
        if (error.code === "NOT_AUTHORIZED" && !warnedDenied) {
          warnedDenied = true;
          toast.error(
            "RunLog can't see your location. In Settings > RunLog > Location, choose Always."
          );
        }
        return;
      }
      if (!fix) return;
      // Re-checked on every fix so a switch-off is honoured at once.
      if (!readSharingFlag(userId)) return;
      updateRef.current.mutate(
        buildLocationUpdate(fix, deviceId, readSelectedOperationIds())
      );
    };

    Promise.resolve(
      plugin.addWatcher(
        {
          // Setting a background message turns on background updates and the
          // "Always" permission request on iOS.
          backgroundMessage: "RunLog is sharing your location with your team.",
          backgroundTitle: "Sharing location",
          requestPermissions: true,
          stale: false,
          // Every fix, as the Map page's watcher does.
          distanceFilter: 0,
        },
        callback
      )
    )
      .then(id => {
        if (cancelled) {
          void plugin.removeWatcher({ id }).catch(() => {});
        } else {
          watcherId = id;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (watcherId)
        void plugin.removeWatcher({ id: watcherId }).catch(() => {});
    };
  }, [userId, sharing]);

  return null;
}
