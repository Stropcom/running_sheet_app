// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): creating an operation and moving between weeks.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { toast } from "sonner";
import { getMondayOfWeek, addWeeks } from "./weekDates";
import type { OpManagerBasicsState } from "./useOpManagerBasics";

export function useOpManagerNav(
  s: Pick<
    OpManagerBasicsState,
    | "createOpMut"
    | "postedWeeksQuery"
    | "isAdmin"
    | "weekStart"
    | "setWeekStart"
    | "opsQuery"
  >
) {
  const {
    createOpMut,
    postedWeeksQuery,
    isAdmin,
    weekStart,
    setWeekStart,
    opsQuery,
  } = s;

  // ── Create operation inline ───────────────────────────────────────────────────
  const handleCreateOp = async (
    name: string,
    onCreated: (id: number, name: string) => void
  ) => {
    if (!name.trim()) return;
    try {
      const trimmedName = name.trim();
      const result = await createOpMut.mutateAsync({
        name: trimmedName,
        promisNumber: "",
        imsNumber: "",
        investigationUnit: "",
      });
      onCreated(result.id, trimmedName);
      toast.success(`Operation "${trimmedName}" created.`);
    } catch {
      toast.error("Failed to create operation.");
    }
  };

  // ── Navigation for non-admins ─────────────────────────────────────────────────
  const postedWeekStarts = (postedWeeksQuery.data ?? []).map(p => p.weekStart);
  const currentWeekStart = getMondayOfWeek(new Date());
  const canViewWeek =
    isAdmin ||
    weekStart === currentWeekStart ||
    postedWeekStarts.includes(weekStart);
  const sortedViewableWeeks = Array.from(
    new Set([currentWeekStart, ...postedWeekStarts])
  ).sort();
  const currentViewIdx = sortedViewableWeeks.indexOf(weekStart);

  const handlePrevWeek = () => {
    if (isAdmin) setWeekStart(ws => addWeeks(ws, -1));
    else if (currentViewIdx > 0)
      setWeekStart(sortedViewableWeeks[currentViewIdx - 1]);
  };
  const handleNextWeek = () => {
    if (isAdmin) setWeekStart(ws => addWeeks(ws, 1));
    else if (currentViewIdx < sortedViewableWeeks.length - 1)
      setWeekStart(sortedViewableWeeks[currentViewIdx + 1]);
  };

  const activeOps = (opsQuery.data ?? [])
    .filter(op => !op.status || op.status === "active")
    .map(op => ({ id: op.id, name: op.name }));

  return {
    handleCreateOp,
    canViewWeek,
    sortedViewableWeeks,
    currentViewIdx,
    handlePrevWeek,
    handleNextWeek,
    activeOps,
  };
}

export type OpManagerNavState = ReturnType<typeof useOpManagerNav>;
