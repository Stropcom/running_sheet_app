// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): small pure helpers.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { format, parseISO, isValid } from "date-fns";
import type { Member, Team, Secondment } from "./types";

// Safe format helper — never throws on invalid dates
export function safeFormat(
  d: Date | string | null | undefined,
  fmt: string,
  fallback = ""
): string {
  if (!d) return fallback;
  try {
    const dt = typeof d === "string" ? parseISO(d) : d;
    if (!isValid(dt)) return fallback;
    return format(dt, fmt);
  } catch {
    return fallback;
  }
}

// A member's row is "in scope" for a given date depending on whether it's
// their home-team row or their acting/secondment row:
//  - home row: out of scope (blanked) WHILE the secondment window covers
//    the date — those days belong to the destination team instead.
//  - acting row: out of scope OUTSIDE the secondment window — it only
//    exists to show the days they're actually seconded here.
// No secondment at all -> the row is always in scope (normal behaviour).
export function isDateOutsideRowScope(
  rowMode: "home" | "acting",
  window: { startDate: string; endDate: string } | null | undefined,
  dateStr: string
): boolean {
  if (!window) return false;
  const inWindow = dateStr >= window.startDate && dateStr <= window.endDate;
  return rowMode === "home" ? inWindow : !inWindow;
}

// ON DUTY / ON CALL tally rows need to know, for a specific date, exactly
// who counts toward a team — not just its static member list. A member on
// an active secondment counts for their destination team that day, not
// their home team, so this has to be recomputed per date rather than once
// per team.
export function getEffectiveCountableMembers(
  team: Team,
  dateStr: string,
  allMembers: Member[],
  secondmentByMemberId: Map<number, Secondment>
): Member[] {
  return allMembers.filter(m => {
    if (m.excludedFromCounts) return false;
    const sec = secondmentByMemberId.get(m.id);
    const onSecondmentToday =
      !!sec && dateStr >= sec.startDate && dateStr <= sec.endDate;
    if (onSecondmentToday) return sec!.destinationTeamId === team.id;
    return m.teamId === team.id;
  });
}
