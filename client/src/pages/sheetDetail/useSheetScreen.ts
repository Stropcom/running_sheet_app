// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). This hook is the whole of the screen's state: it calls the six step hooks in order and hands back everything the layout components read. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useSheetData } from "./useSheetData";
import { useRowActions } from "./useRowActions";
import { useRowChecks } from "./useRowChecks";
import { useRowMembers } from "./useRowMembers";
import { useSheetViewState } from "./useSheetViewState";
import { useSheetEditing } from "./useSheetEditing";
import type { SheetDetailProps } from "./types";

/** The state of the running sheet screen: what the step hooks make, plus the props. */
export function useSheetScreen(
  props: SheetDetailProps & { embedded: boolean }
) {
  const props0 = { sheetIdProp: props.sheetIdProp, embedded: props.embedded };
  const sSheetData = useSheetData(props0);
  const sRowActions = useRowActions({ ...props0, ...sSheetData });
  const sRowChecks = useRowChecks({
    ...props0,
    ...sSheetData,
    ...sRowActions,
  });
  const sRowMembers = useRowMembers({
    ...props0,
    ...sSheetData,
    ...sRowActions,
    ...sRowChecks,
  });
  const sSheetViewState = useSheetViewState({
    ...props0,
    ...sSheetData,
    ...sRowActions,
    ...sRowChecks,
    ...sRowMembers,
  });
  const sSheetEditing = useSheetEditing({
    ...props0,
    ...sSheetData,
    ...sRowActions,
    ...sRowChecks,
    ...sRowMembers,
    ...sSheetViewState,
  });

  const state = {
    ...props0,
    ...sSheetData,
    ...sRowActions,
    ...sRowChecks,
    ...sRowMembers,
    ...sSheetViewState,
    ...sSheetEditing,
  };
  const isLoading = state.sheetLoading || state.rowsLoading;
  return { ...state, isLoading };
}

export type SheetScreen = ReturnType<typeof useSheetScreen>;
