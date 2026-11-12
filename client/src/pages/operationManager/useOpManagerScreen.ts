// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the whole state, built by calling the step hooks in order.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useOpManagerBasics } from "./useOpManagerBasics";
import { useOpManagerWeek } from "./useOpManagerWeek";
import { useOpManagerEditing } from "./useOpManagerEditing";
import { useOpManagerWeeks } from "./useOpManagerWeeks";
import { useOpManagerNav } from "./useOpManagerNav";

/** The state of the Op Manager page: what the step hooks make, for the view to read. */
export function useOpManagerScreen() {
  const s0 = useOpManagerBasics({});
  const s1 = useOpManagerWeek({ ...s0 });
  const s2 = useOpManagerEditing({ ...s0, ...s1 });
  const s3 = useOpManagerWeeks({ ...s0, ...s1, ...s2 });
  const s4 = useOpManagerNav({ ...s0, ...s1, ...s2, ...s3 });
  return { ...s0, ...s1, ...s2, ...s3, ...s4 };
}

export type OpManagerScreen = ReturnType<typeof useOpManagerScreen>;
