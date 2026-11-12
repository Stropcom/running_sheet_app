// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the types the Op Manager's pieces share.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { TEAM_ROWS } from "./constants";

export type TeamRow = (typeof TEAM_ROWS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PriorityRow {
  localId: string;
  id?: number;
  category: string;
  priority: number;
  operationId?: number | null;
  operationName?: string | null;
  team?: string | null;
  requestType?: string | null;
  sortOrder: number;
}

export interface TaskingCell {
  shiftTime?: string | null;
  customTime?: string;
  primaryTask?: string | null;
  primaryOther?: string;
  secondaryTask?: string | null;
  secondaryOther?: string;
  /** Team 1 and Team 2 working as one blended team that day (both cells). */
  blended?: boolean;
}

export interface ContactEntry {
  localId: string;
  id?: number;
  role: string;
  userId?: number | null;
  phone?: string | null;
  sortOrder: number;
}

export interface OnCallEntry {
  localId: string;
  id?: number;
  role: string;
  userId?: number | null;
  mobile?: string | null;
  isOnCall: boolean;
  dayScope: string;
}
