// Part of the Intelligence page (client/src/pages/Intelligence.tsx): remembering the list view (tab, filters) in sessionStorage.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import type { SavedIntelView } from "./types";

// ── Remembering the list view ────────────────────────────────────────────
// Opening a profile and pressing Back used to land on a freshly-mounted
// Intelligence page — Operations tab, filters cleared, scrolled to the top.
// The list view's choices are kept in sessionStorage (this browser tab only)
// and restored when the page is opened again.
const INTEL_VIEW_KEY = "runlog.intelligence.view";
export const INTEL_EXPANDED_OP_KEY = "runlog.intelligence.expandedOp";
export const INTEL_TABS: readonly string[] = [
  "operations",
  "targets",
  "associates",
  "vehicle",
  "locations",
  "all",
  "heatmap",
  "places",
  "dayRoute",
  "visualRs",
  "patternOfLife",
  "egonet",
  "packages",
];
export function readIntelView(): SavedIntelView {
  try {
    const raw = sessionStorage.getItem(INTEL_VIEW_KEY);
    return raw ? (JSON.parse(raw) as SavedIntelView) : {};
  } catch {
    return {};
  }
}
export function writeIntelView(patch: SavedIntelView) {
  try {
    sessionStorage.setItem(
      INTEL_VIEW_KEY,
      JSON.stringify({ ...readIntelView(), ...patch })
    );
  } catch {
    /* storage unavailable — the view just isn't remembered */
  }
}
