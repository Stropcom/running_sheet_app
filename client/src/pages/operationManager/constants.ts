// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the teams, shifts, categories and roles.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { SHIFT_PRESETS } from "@shared/taskingTimeline";
import {} from "@/lib/teams";
import type { TeamRow } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────
export const TEAM_ROWS = ["surv1", "surv2", "ptt", "cap"] as const;
// Matches the CTO Roster's team names exactly (Team 1/Team 2/PTT/Capability)
// so tasking coverage can look up roster minimums by name with no mapping
// table needed — see the roster coverage check below.
export const TEAM_LABELS: Record<TeamRow, string> = {
  surv1: "Team 1",
  surv2: "Team 2",
  ptt: "PTT",
  cap: "Capability",
};
// Fallback minimums (mirrors CTO Roster Outlook's TEAM_MINIMUMS/DEFAULT_MIN)
// — overridden by the admin-configured cto_roster_outlook_settings row.
export const TASKING_TEAM_MIN_FALLBACK: Record<string, number> = {
  "Team 1": 5,
  "Team 2": 5,
  PTT: 2,
  Capability: 1,
};
export const TASKING_DEFAULT_MIN_FALLBACK = 3;
// Short forms for pills and labels. Colours are not here: a team's colour is
// the one set in User Management → Teams (useTeamColour, shared/teamColours.ts).
export const TASKING_AB: Record<TeamRow, string> = {
  surv1: "T1",
  surv2: "T2",
  ptt: "PTT",
  cap: "CAP",
};
export const SHIFT_OPTIONS: string[] = ["RDO", ...SHIFT_PRESETS, "Custom"];
export const CATEGORIES = ["A-TACC 1", "A-TACC 2", "WC", "Other"];
export const REQUEST_TYPES = ["Surv", "PTT", "Capability"];
const SUPERVISOR_ROLES = ["CTO Inspector", "Team 1", "Team 2", "PTT"];
export const ON_CALL_ROLES = [
  "On-Call Supervisor",
  "On-Call PTT",
  "On-Call Cap. Support",
];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
