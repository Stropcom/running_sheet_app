import { useCallback, useState } from "react";

/** The ways the CTO Weekly Tasking calendar can be shown (full view) and
 * exported (up to two of them in one PDF). A choice saved for a layout that no
 * longer exists falls back to the default. */
export const TASKING_VIEWS = [
  { id: "panel-banded", label: "Team Rows" },
  { id: "panel-tables", label: "Team Tables" },
  { id: "tile-days", label: "Calendar" },
  { id: "cal-timeline", label: "Timeline" },
] as const;
export type TaskingViewId = (typeof TASKING_VIEWS)[number]["id"];

export const DEFAULT_TASKING_VIEW: TaskingViewId = "panel-banded";
const KEY = "runlog.taskingView";

export function isTaskingView(v: unknown): v is TaskingViewId {
  return TASKING_VIEWS.some(x => x.id === v);
}

/** The last view the person chose on this device; the default when nothing is
 * saved or storage is unavailable (private window, blocked site data). */
export function readTaskingView(): TaskingViewId {
  try {
    const v = localStorage.getItem(KEY);
    if (isTaskingView(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_TASKING_VIEW;
}

export function useTaskingView(): [TaskingViewId, (v: TaskingViewId) => void] {
  const [view, setView] = useState<TaskingViewId>(readTaskingView);
  const choose = useCallback((v: TaskingViewId) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* storage unavailable: the choice lasts until the page closes */
    }
  }, []);
  return [view, choose];
}
