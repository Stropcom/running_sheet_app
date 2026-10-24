// How the tables that "Zero data" clears are described to the person
// pressing the button (Access Management → Zero data). The tables themselves
// are listed in scripts/ops/zero-data-tables.mjs (the one source, shared
// with the command-line script); every table there must appear in exactly one
// area here — server/zeroDataTables.test.ts fails otherwise.

export interface ZeroArea {
  label: string;
  tables: string[];
}

export const ZERO_AREAS: ZeroArea[] = [
  {
    label: "Operations and sharing",
    tables: ["operations", "operation_shares", "visitor_team_assignments"],
  },
  {
    label: "Running sheets and rows",
    tables: [
      "running_sheets",
      "sheet_rows",
      "row_members",
      "certifications",
      "sub_observations",
      "sub_observation_members",
      "sub_observation_certifications",
      "sheet_summaries",
      "sheet_summary_entries",
      "governance_records",
      "scan_finding_dismissals",
    ],
  },
  {
    label: "Photos and documents",
    tables: [
      "row_attachments",
      "attachment_entity_links",
      "person_detections",
      "face_match_dismissals",
      "target_document_imports",
    ],
  },
  {
    label: "Target Registry",
    tables: [
      "targets",
      "associates",
      "target_field_history",
      "operation_target_links",
      "target_shortcuts",
    ],
  },
  {
    label: "Intelligence",
    tables: [
      "entity_aliases",
      "entity_dedup_decisions",
      "person_name_match_decisions",
      "intelligence_geocode_cache",
      "intel_pin_overrides",
      "target_place_labels",
    ],
  },
  {
    label: "Map",
    tables: [
      "custom_map_markers",
      "map_shapes",
      "rs_mapping_waypoints",
      "user_locations",
      "user_location_history",
    ],
  },
  {
    label: "Court (WIPC members)",
    tables: ["wipc_members", "wipc_audit_log"],
  },
  {
    label: "Briefings",
    tables: [
      "smeac_briefings",
      "smeac_acknowledgements",
      "uco_guide_briefings",
      "uco_guide_acknowledgements",
    ],
  },
  {
    label: "Weekly Tasking board",
    tables: [
      "op_manager_priority_rows",
      "op_manager_tasking_cells",
      "op_manager_supervisor_contacts",
      "op_manager_posted_weeks",
    ],
  },
  {
    label: "Integrations (cameras, trackers, signals)",
    tables: [
      "cameras",
      "signal_sensors",
      "signal_detections",
      "tracked_assets",
      "tracked_asset_positions",
      "external_events",
      "connector_audit_log",
    ],
  },
  {
    label: "Notifications and audit log",
    tables: ["notifications", "audit_logs"],
  },
];

/** What stays, in words (shown beside the counts). */
export const ZERO_KEPT = [
  "Users and teams",
  "Command features",
  "Shortcuts and style guides",
  "Sidebar order",
  "WIPC officer profiles",
  "The whole CTO Roster",
  "Integration connectors",
] as const;

/** The word the person types to confirm. */
export const ZERO_CONFIRM_WORD = "ZERO";

/** Rows per area, from per-table counts (a table with no count counts 0). */
export function areaTotals(
  counts: Record<string, number>
): { label: string; rows: number }[] {
  return ZERO_AREAS.map(a => ({
    label: a.label,
    rows: a.tables.reduce((n, t) => n + (counts[t] ?? 0), 0),
  }));
}

/** "12.4 MB" for a byte count. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
