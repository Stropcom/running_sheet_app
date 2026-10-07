/**
 * Target Tracking switches, set in the map's right-hand pane and read by the
 * running sheet, the quick-entry popup and the map:
 *  - tracking: the whole feature — the Target tracker panel and everything
 *    built on it. Off, the panel is not drawn at all.
 *  - location: the flag marking where the target is on the map and on the
 *    sheet's address chips. Only applies while tracking is on.
 * Per device (localStorage), like the pane's other toggles. Both default on.
 */
import { useCallback, useSyncExternalStore } from "react";

const KEY_TRACKING = "runlog_target_tracking_on";
const KEY_LOCATION = "runlog_target_location_on";
const EVENT = "runlog-target-tracking-changed";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function write(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTargetTrackingSettings() {
  const tracking = useSyncExternalStore(
    subscribe,
    () => read(KEY_TRACKING),
    () => true
  );
  const location = useSyncExternalStore(
    subscribe,
    () => read(KEY_LOCATION),
    () => true
  );
  const setTracking = useCallback((on: boolean) => write(KEY_TRACKING, on), []);
  const setLocation = useCallback((on: boolean) => write(KEY_LOCATION, on), []);
  return {
    tracking,
    /** The location marker, which only shows while tracking is on. */
    location: tracking && location,
    /** The location switch's own setting, for showing it while greyed out. */
    locationSetting: location,
    setTracking,
    setLocation,
  };
}
