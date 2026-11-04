import { useCallback, useState } from "react";
import { clampZoom, readSavedZoom } from "@shared/rosterZoom";

const ZOOM_KEY = "runlog.rosterZoom";
const COLLAPSED_KEY = "runlog.rosterCollapsedTeams";

/** The roster's zoom (100% by default), kept on this device. Storage that is
 * blocked or empty simply gives 100%. */
export function useRosterZoom(): [number, (z: number) => void] {
  const [zoom, setZoomState] = useState<number>(() => {
    try {
      return readSavedZoom(localStorage.getItem(ZOOM_KEY));
    } catch {
      return 1;
    }
  });
  const setZoom = useCallback((z: number) => {
    const next = clampZoom(z);
    setZoomState(next);
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      /* storage blocked: the zoom just is not remembered */
    }
  }, []);
  return [zoom, setZoom];
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
