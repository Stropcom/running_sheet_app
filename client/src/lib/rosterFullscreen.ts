import { useSyncExternalStore } from "react";

// Full screen on the Team Duty Roster: the toolbar and the "Showing" strip go
// away so the grid reaches up to the RunLog header, and the few controls still
// needed (zoom, Today, Exit) move into that header (a strip on narrower
// screens). It is a view mode for this visit only, so it is not remembered: a
// reload, or leaving the roster, puts everything back.
//
// It lives outside React so the header (DashboardLayout) and the roster page
// can both follow it without the page passing props through the layout.
let on = false;
const listeners = new Set<() => void>();
let todayHandler: (() => void) | null = null;

export const getRosterFullscreen = () => on;

export function setRosterFullscreen(next: boolean) {
  if (next === on) return;
  on = next;
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useRosterFullscreen(): boolean {
  return useSyncExternalStore(subscribe, getRosterFullscreen);
}

/** The roster page says how to scroll to today, so the bar's Today button works
 * from the header. Returns the clean-up. */
export function registerRosterToday(fn: () => void): () => void {
  todayHandler = fn;
  return () => {
    if (todayHandler === fn) todayHandler = null;
  };
}

export function rosterGoToToday() {
  todayHandler?.();
}
