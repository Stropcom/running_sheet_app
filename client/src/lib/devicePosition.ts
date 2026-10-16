/**
 * One shared, lightweight position watch for the address suggestions (every
 * observation cell on a sheet subscribes, but only one browser watch runs).
 * It keeps following the device while a subscriber is mounted and the page is
 * visible, and remembers the last *good* fix — see shared/addressBias.ts for
 * why a poor laptop/VPN guess is ignored. Low-accuracy mode on purpose: the
 * suggestions only need roughly where you are, so this is cheap on battery.
 */
import { acceptFix, chooseBiasCentre, type LatLng } from "@shared/addressBias";

let lastGood: LatLng | null = null;
let watchId: number | null = null;
let subscribers = 0;

function startWatch() {
  if (watchId !== null || subscribers === 0) return;
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (typeof document !== "undefined" && document.hidden) return;
  watchId = navigator.geolocation.watchPosition(
    pos => {
      lastGood = acceptFix(lastGood, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
  );
}

function stopWatch() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function onVisibility() {
  if (document.hidden) stopWatch();
  else startWatch();
}

/** Start following the device; call the returned function to stop. */
export function watchDevicePosition(): () => void {
  subscribers++;
  if (subscribers === 1)
    document.addEventListener("visibilitychange", onVisibility);
  startWatch();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    subscribers--;
    if (subscribers === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
    }
  };
}

/** Where address suggestions should lean right now. */
export function addressBiasCentre(fallback?: LatLng | null): LatLng {
  return chooseBiasCentre(lastGood, fallback);
}
