// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the whole state, built by calling the step hooks in order.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useTargetForm } from "./useTargetForm";
import { useDuplicateState } from "./useDuplicateState";
import { useManualImages } from "./useManualImages";
import { useSaveFlow } from "./useSaveFlow";
import { useNameChecks } from "./useNameChecks";
import { useStagedPeople } from "./useStagedPeople";
import { useStepNav } from "./useStepNav";
import type { AddTargetDialogProps } from "./types";

/** The state of the Add Target dialog: what the step hooks make, plus the props. */
export function useAddTargetScreen(props: AddTargetDialogProps) {
  const s0 = useTargetForm({ ...props });
  const s1 = useDuplicateState({ ...props, ...s0 });
  const s2 = useManualImages({ ...props, ...s0, ...s1 });
  const s3 = useSaveFlow({ ...props, ...s0, ...s1, ...s2 });
  const s4 = useNameChecks({ ...props, ...s0, ...s1, ...s2, ...s3 });
  const s5 = useStagedPeople({ ...props, ...s0, ...s1, ...s2, ...s3, ...s4 });
  const s6 = useStepNav({ ...props, ...s0, ...s1, ...s2, ...s3, ...s4, ...s5 });
  return { ...props, ...s0, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6 };
}

export type AddTargetScreen = ReturnType<typeof useAddTargetScreen>;
