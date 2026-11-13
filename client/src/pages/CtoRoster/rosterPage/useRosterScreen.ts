// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the whole state, built by calling the step hooks in order.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useRosterScreen) and its layout is RosterView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useRosterGrid } from "./useRosterGrid";
import { useRosterData } from "./useRosterData";
import { useRosterActions } from "./useRosterActions";
import { useRosterDrag } from "./useRosterDrag";

/** The state of the roster page: what the step hooks make, for the view to read. */
export function useRosterScreen() {
  const s0 = useRosterGrid({});
  const s1 = useRosterData({ ...s0 });
  const s2 = useRosterActions({ ...s0, ...s1 });
  const s3 = useRosterDrag({ ...s0, ...s1, ...s2 });
  return { ...s0, ...s1, ...s2, ...s3 };
}

export type RosterScreen = ReturnType<typeof useRosterScreen>;
