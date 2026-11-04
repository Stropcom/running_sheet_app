import { useCallback, useState, useSyncExternalStore } from "react";
import { clampZoom, readSavedZoom } from "@shared/rosterZoom";

const ZOOM_KEY = "runlog.rosterZoom";
const COLLAPSED_KEY = "runlog.rosterCollapsedTeams";

// The zoom lives outside React on purpose. The roster grid is thousands of
// cells; if every zoom step re-rendered the page it took seconds. The page
// applies each change straight to the grid instead (RosterPage.tsx), and only
// the zoom control and the scroll bar, which show the number, subscribe.
let currentZoom = (() => {
  try {
    return readSavedZoom(localStorage.getItem(ZOOM_KEY));
  } catch {
    return 1;
  }
})();
const zoomListeners = new Set<(z: number) => void>();

export const getRosterZoom = () => currentZoom;

/** Sets the zoom (kept inside 25-100%), remembers it on this device, and tells
 * whoever is listening. Storage that is blocked just means it is not
 * remembered. */
export function setRosterZoom(z: number) {
  const next = clampZoom(z);
  if (next === currentZoom) return;
  currentZoom = next;
  try {
    localStorage.setItem(ZOOM_KEY, String(next));
  } catch {
    /* not remembered */
  }
  zoomListeners.forEach(fn => fn(next));
}

export function subscribeRosterZoom(fn: (z: number) => void): () => void {
  zoomListeners.add(fn);
  return () => {
    zoomListeners.delete(fn);
  };
}

/** The roster's zoom (100% by default) for a component that shows it. */
export function useRosterZoom(): [number, (z: number) => void] {
  const zoom = useSyncExternalStore(subscribeRosterZoom, getRosterZoom);
  return [zoom, setRosterZoom];
}

/** The teams folded down to their totals on the roster, kept on this device. */
export function useCollapsedTeams(): [Set<number>, (id: number) => void] {
  const [ids, setIds] = useState<Set<number>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      return new Set(
        Array.isArray(raw)
          ? raw.filter((n): n is number => Number.isInteger(n))
          : []
      );
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((id: number) => {
    setIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* not remembered */
      }
      return next;
    });
  }, []);
  return [ids, toggle];
}
