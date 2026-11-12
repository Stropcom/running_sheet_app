// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the grid's dates and sizes.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { ROSTER_START, ROSTER_END } from "@shared/ctoRosterShiftUtils";
import { eachDayOfInterval, parseISO } from "date-fns";

export const MONTHS = [
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
];

export const ROSTER_START_DATE = parseISO(ROSTER_START);
export const ROSTER_END_DATE = parseISO(ROSTER_END);
export const ALL_DATES = eachDayOfInterval({
  start: ROSTER_START_DATE,
  end: ROSTER_END_DATE,
});
export const TOTAL_DAYS = ALL_DATES.length;

/** Empty space standing in for date columns that are not drawn. */
export function DateSpacer({ width }: { width: number | null }) {
  return width === null ? null : (
    <div aria-hidden style={{ width, flexShrink: 0 }} />
  );
}
export const COL_WIDTH = 68; // px per date column
export const NAME_COL_WIDTH = 152; // px for frozen name column
export const ROW_HEIGHT = 48; // px per member row
export const HEADER_HEIGHT = 44;
