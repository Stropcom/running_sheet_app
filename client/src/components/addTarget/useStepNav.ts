// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): which section is open, the notes, and Next / Back / Save.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  STEP_LABEL,
  STEP_ORDER,
  canEnterStep,
  firstOpenStep,
  stepProblem,
  type StepKey,
} from "@/lib/addTargetSteps";
import type { StagedPeopleState } from "./useStagedPeople";
import type { TargetFormState } from "./useTargetForm";
import type { ManualImagesState } from "./useManualImages";
import type { SaveFlowState } from "./useSaveFlow";
import type { AddTargetDialogProps } from "./types";

export function useStepNav(
  s: Pick<StagedPeopleState, "stepsInput"> &
    Pick<
      TargetFormState,
      | "step"
      | "lockedNote"
      | "flashFor"
      | "setLockedNote"
      | "setFlashFor"
      | "setStep"
    > &
    Pick<ManualImagesState, "bodyRef"> &
    Pick<AddTargetDialogProps, "onBack"> &
    Pick<SaveFlowState, "resetState" | "handleSave">
) {
  const {
    stepsInput,
    step,
    lockedNote,
    flashFor,
    setLockedNote,
    setFlashFor,
    setStep,
    bodyRef,
    onBack,
    resetState,
    handleSave,
  } = s;

  // ── Tabs, footer and what each one says ──
  const openStep = firstOpenStep(stepsInput);
  const stepIndex = STEP_ORDER.indexOf(step);
  const stepIsLast = stepIndex === STEP_ORDER.length - 1;
  const stepBlocker = stepProblem(stepsInput, step);
  const allDone = openStep === null;

  let noteProblem: string | null = null;
  let noteDone: string | null = null;
  if (lockedNote && lockedNote.open === openStep) noteProblem = lockedNote.text;
  else if (stepBlocker) noteProblem = stepBlocker;
  else if (!stepIsLast)
    noteDone = `This section is done. Next opens ${STEP_LABEL[STEP_ORDER[stepIndex + 1]]}.`;
  else if (allDone) noteDone = "Everything is filled in. You can save.";
  else
    noteProblem = `Go back: ${STEP_LABEL[openStep!]} still needs filling in.`;
  const noteFlash = noteProblem !== null && flashFor === noteProblem;

  const goToStep = (k: StepKey) => {
    if (!canEnterStep(stepsInput, k)) {
      const text = `“${STEP_LABEL[k]}” is locked. Finish “${STEP_LABEL[openStep!]}” first.`;
      setLockedNote({ text, open: openStep });
      setFlashFor(text);
      return;
    }
    setLockedNote(null);
    setFlashFor(null);
    setStep(k);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const handleNextClick = () => {
    if (stepBlocker) {
      setFlashFor(stepBlocker);
      return;
    }
    goToStep(STEP_ORDER[stepIndex + 1]);
  };
  const handleBackClick = () => {
    if (stepIndex > 0) goToStep(STEP_ORDER[stepIndex - 1]);
    else if (onBack) {
      resetState();
      onBack();
    }
  };
  const handleSaveClick = () => {
    if (!allDone) {
      if (noteProblem) setFlashFor(noteProblem);
      return;
    }
    handleSave();
  };

  return {
    stepIndex,
    stepIsLast,
    stepBlocker,
    allDone,
    noteProblem,
    noteDone,
    noteFlash,
    goToStep,
    handleNextClick,
    handleBackClick,
    handleSaveClick,
  };
}

export type StepNavState = ReturnType<typeof useStepNav>;
