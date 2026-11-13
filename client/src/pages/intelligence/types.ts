// Part of the Intelligence page (client/src/pages/Intelligence.tsx): the types shared by the Intelligence page's pieces.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType =
  | "person"
  | "vehicle"
  | "address"
  | "business"
  | "unknown";
export type TabView =
  | "operations"
  | "targets"
  | "associates"
  | "vehicle"
  | "locations"
  | "all"
  | "heatmap"
  | "places"
  | "dayRoute"
  | "patternOfLife"
  | "egonet"
  | "packages";
export interface SavedIntelView {
  tab?: string;
  search?: string;
  datePreset?: string;
  customFrom?: string;
  customTo?: string;
  sortOrder?: string;
  opSortOrder?: string;
  filterOperationId?: number | null;
  scroll?: Record<string, number>;
}

export interface Occurrence {
  sheetId: number;
  sheetTitle: string;
  operationId: number;
  operationName: string;
  rowId: number;
  observationSnippet: string;
  timeMinutes: number | null;
  fullDescription: string;
}

export interface Entity {
  shortForm: string;
  type: EntityType;
  isTarget?: boolean;
  tgtAlias?: string | null;
  targetId?: number | null;
  lowConfidence?: boolean;
  isIndicesOnly?: boolean;
  /** Registry surname (targets.surname / associates.surname) — powers
   * "Sort by Surname" on the Targets/Associates tabs. */
  surname?: string | null;
  occurrences: Occurrence[];
}

export interface OperationSummary {
  operationId: number;
  operationName: string;
  entityCount: number;
  sheetCount: number;
  entities: Entity[];
}

// ─── Date filter helpers ──────────────────────────────────────────────────────

export type DatePreset = "all" | "1w" | "1m" | "3m" | "6m" | "custom";
