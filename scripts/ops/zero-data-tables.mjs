// Which tables "zero the data" clears and which it keeps. Every table in the
// database must be in exactly one list — the script refuses to run otherwise,
// and server/zeroDataTables.test.ts fails when a new table in
// drizzle/schema.ts isn't classified here, so a new table is never wiped (or
// silently kept) by accident.

/** Setup that stays: people, teams, settings, the CTO Roster and its audit
 * log, and the WIPC vault key check (without it the vault can't be read). */
export const KEEP_TABLES = [
  // People, teams and settings
  "users",
  "teams",
  "command_features",
  // Passkey login: people and settings, like the users they belong to.
  "passkey_credentials",
  "passkey_codes",
  "passkey_settings",
  // Owner-set switches (e.g. the Import Target document AI), like the other settings.
  "app_settings",
  "shortcuts",
  "style_guides",
  "style_rules",
  "user_sidebar_order",
  "wipc_officer_profiles",
  "wipc_vault_key_check",
  // The CTO Roster (all of it)
  "cto_roster_teams",
  "cto_roster_members",
  "cto_roster_secondments",
  "cto_roster_shifts",
  "cto_roster_drafts",
  "cto_roster_draft_teams",
  "cto_roster_draft_members",
  "cto_roster_draft_shifts",
  "cto_roster_saved_rosters",
  "cto_roster_saved_roster_teams",
  "cto_roster_saved_roster_members",
  "cto_roster_saved_roster_shifts",
  "cto_roster_audit_log",
  "cto_roster_outlook_settings",
  "cto_roster_eba_rules",
];

/** Operational records that are emptied (and numbered from 1 again). */
export const CLEAR_TABLES = [
  // Operations and running sheets
  "operations",
  "operation_shares",
  "visitor_team_assignments",
  "running_sheets",
  "sheet_rows",
  "row_members",
  "certifications",
  "row_attachments",
  "sub_observations",
  "sub_observation_members",
  "sub_observation_certifications",
  "sheet_summaries",
  "sheet_summary_entries",
  "governance_records",
  "scan_finding_dismissals",
  // Photos and intelligence
  "attachment_entity_links",
  "person_detections",
  "face_match_dismissals",
  "entity_aliases",
  "entity_dedup_decisions",
  "person_name_match_decisions",
  "intelligence_geocode_cache",
  "intel_pin_overrides",
  // Targets
  "targets",
  "associates",
  "target_field_history",
  "operation_target_links",
  "target_document_imports",
  "target_shortcuts",
  // Map
  "custom_map_markers",
  "map_shapes",
  "rs_mapping_waypoints",
  "user_locations",
  "user_location_history",
  // Court
  "wipc_members",
  "wipc_audit_log",
  // Briefings, tasking board, notifications, audit
  "smeac_briefings",
  "smeac_acknowledgements",
  "uco_guide_briefings",
  "uco_guide_acknowledgements",
  "op_manager_priority_rows",
  "op_manager_tasking_cells",
  "op_manager_supervisor_contacts",
  "op_manager_posted_weeks",
  "notifications",
  "audit_logs",
];

/** Tables that exist in the shared database because another branch's
 * migrations were applied to it (the external integrations work,
 * claude/ext-integrations-*), but that aren't in this branch's schema. They
 * are skipped when absent. When one of those branches is merged here, move its
 * tables into KEEP_TABLES / CLEAR_TABLES above (server/zeroDataTables.test.ts
 * fails until you do). */
export const OTHER_BRANCH_KEEP_TABLES = [
  // Integration set-up (provider, status) — no operation references
  "connectors",
];
export const OTHER_BRANCH_CLEAR_TABLES = [
  // Cameras and sensors carry operation ids, which restart at 1 after a zero,
  // so a leftover one would attach itself to a brand-new operation.
  "cameras",
  "signal_sensors",
  "signal_detections",
  "tracked_assets",
  "tracked_asset_positions",
  "external_events",
  "connector_audit_log",
];

/** Everything the script and the in-app Zero data act on. */
export const ALL_KEEP_TABLES = [...KEEP_TABLES, ...OTHER_BRANCH_KEEP_TABLES];
export const ALL_CLEAR_TABLES = [...CLEAR_TABLES, ...OTHER_BRANCH_CLEAR_TABLES];

/** Bookkeeping tables the script never touches. */
export const IGNORED_TABLES = ["__drizzle_migrations"];
