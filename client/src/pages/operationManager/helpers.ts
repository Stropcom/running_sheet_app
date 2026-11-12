// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): small helpers.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import type { TaskingCell } from "./types";

/** "Operation RAVEN + Training", or "no task" — for the blend question. */
export function taskText(c: TaskingCell | undefined): string {
  const p = c?.primaryTask === "Other" ? c.primaryOther : c?.primaryTask;
  const q = c?.secondaryTask === "Other" ? c.secondaryOther : c?.secondaryTask;
  return [p, q].filter(Boolean).join(" + ") || "no task";
}

// ─── Unique ID helper ─────────────────────────────────────────────────────────
let _uid = 0;
export const uid = () => String(++_uid);
