// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): pasting, tapping and pointer handling, saving shifts and notes, bulk apply and copy.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useRosterScreen) and its layout is RosterView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useCallback, useEffect } from "react";
import { SHIFT_LABELS } from "@shared/ctoRosterShiftUtils";
import { toast } from "sonner";
import { format } from "date-fns";
import type { ShiftCode, ShiftData } from "./types";
import { ALL_DATES } from "./gridConstants";
import type { RosterGridState } from "./useRosterGrid";
import type { RosterDataState } from "./useRosterData";

export function useRosterActions(
  s: Pick<
    RosterGridState,
    "scrolledToToday" | "scrollRef" | "scrollToDate" | "today"
  > &
    Pick<
      RosterDataState,
      | "shiftsData"
      | "copiedBlock"
      | "visualRowMembers"
      | "updateShift"
      | "setCopiedBlock"
      | "bulkCopyMode"
      | "setSelectedCells"
      | "bulkMode"
      | "setEditSheet"
      | "isDraggingSelection"
      | "setClipboard"
      | "clipboard"
      | "selectedCells"
      | "shiftMap"
      | "setBulkSheetOpen"
      | "setBulkMode"
      | "bulkUpdate"
      | "setBulkCopyMode"
    >
) {
  const {
    scrolledToToday,
    shiftsData,
    scrollRef,
    scrollToDate,
    today,
    copiedBlock,
    visualRowMembers,
    updateShift,
    setCopiedBlock,
    bulkCopyMode,
    setSelectedCells,
    bulkMode,
    setEditSheet,
    isDraggingSelection,
    setClipboard,
    clipboard,
    selectedCells,
    shiftMap,
    setBulkSheetOpen,
    setBulkMode,
    bulkUpdate,
    setBulkCopyMode,
  } = s;

  // Scroll to today once data has loaded — fires on first non-empty shiftsData
  useEffect(() => {
    if (scrolledToToday.current) return;
    if (!shiftsData || !scrollRef.current) return;
    // Opened from a tasking-calendar breach dot: /cto-roster?date=YYYY-MM-DD.
    let linked: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get("date");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) linked = q;
    } catch {
      /* no query string */
    }
    const raf = requestAnimationFrame(() => {
      scrollToDate(linked ?? today);
      scrolledToToday.current = true;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsData]);
  const handlePasteBlock = useCallback(
    (targetMemberId: number, targetDate: string) => {
      if (!copiedBlock) return;
      const { cells, memberIds, dates } = copiedBlock;
      // Use visualRowMembers (team-grouped order) so row deltas match the grid
      const anchorMemberIdx = visualRowMembers.findIndex(
        m => m.id === memberIds[0]
      );
      const anchorDateIdx = ALL_DATES.findIndex(
        d => format(d, "yyyy-MM-dd") === dates[0]
      );
      const targetMemberIdx = visualRowMembers.findIndex(
        m => m.id === targetMemberId
      );
      const targetDateIdx = ALL_DATES.findIndex(
        d => format(d, "yyyy-MM-dd") === targetDate
      );
      const rowDelta = targetMemberIdx - anchorMemberIdx;
      const colDelta = targetDateIdx - anchorDateIdx;
      let pasted = 0;
      for (const cell of cells) {
        const srcMemberIdx = visualRowMembers.findIndex(
          m => m.id === cell.memberId
        );
        const srcDateIdx = ALL_DATES.findIndex(
          d => format(d, "yyyy-MM-dd") === cell.date
        );
        const dstMemberIdx = srcMemberIdx + rowDelta;
        const dstDateIdx = srcDateIdx + colDelta;
        if (dstMemberIdx < 0 || dstMemberIdx >= visualRowMembers.length)
          continue;
        if (dstDateIdx < 0 || dstDateIdx >= ALL_DATES.length) continue;
        const dstMember = visualRowMembers[dstMemberIdx];
        const dstDate = format(ALL_DATES[dstDateIdx], "yyyy-MM-dd");
        updateShift.mutate({
          memberId: dstMember.id,
          shiftDate: dstDate,
          shiftCode: cell.shiftCode as ShiftCode,
          comment: cell.comment || null,
          isActing: cell.isActing,
          shiftTime: cell.shiftTime,
          shiftDurationHours: cell.shiftDurationHours,
        });
        pasted++;
      }
      toast.success(`Pasted ${pasted} cell${pasted !== 1 ? "s" : ""}`);
      setCopiedBlock(null);
    },
    [copiedBlock, visualRowMembers, updateShift]
  );

  const handleCellTap = useCallback(
    (
      memberId: number,
      memberName: string,
      date: string,
      shift: ShiftData | undefined
    ) => {
      // Paste block: click on any cell to set paste-start position
      if (copiedBlock) {
        handlePasteBlock(memberId, date);
        return;
      }
      // Bulk copy selection mode
      if (bulkCopyMode) {
        const key = `${memberId}-${date}`;
        setSelectedCells(prev => {
          const next = new Map(prev);
          if (next.has(key)) next.delete(key);
          else next.set(key, { memberId, date });
          return next;
        });
        return;
      }
      // Bulk edit selection mode
      if (bulkMode) {
        const key = `${memberId}-${date}`;
        setSelectedCells(prev => {
          const next = new Map(prev);
          if (next.has(key)) next.delete(key);
          else next.set(key, { memberId, date });
          return next;
        });
        return;
      }
      setEditSheet({
        open: true,
        memberId,
        memberName,
        date,
        currentCode: shift?.shiftCode ?? "",
        currentComment: shift?.comment ?? "",
        currentIsActing: shift?.isActing ?? false,
        currentShiftTime: shift?.shiftTime ?? null,
        currentShiftDurationHours: shift?.shiftDurationHours ?? null,
      });
    },
    [bulkMode, bulkCopyMode, copiedBlock, handlePasteBlock]
  );

  const handleCellPointerDown = useCallback(
    (memberId: number, date: string) => {
      if (!bulkMode && !bulkCopyMode) return;
      isDraggingSelection.current = true;
      const key = `${memberId}-${date}`;
      setSelectedCells(prev => {
        const next = new Map(prev);
        if (next.has(key)) next.delete(key);
        else next.set(key, { memberId, date });
        return next;
      });
    },
    [bulkMode, bulkCopyMode]
  );

  const handleCellPointerEnter = useCallback(
    (memberId: number, date: string) => {
      if ((!bulkMode && !bulkCopyMode) || !isDraggingSelection.current) return;
      const key = `${memberId}-${date}`;
      setSelectedCells(prev => {
        const next = new Map(prev);
        next.set(key, { memberId, date });
        return next;
      });
    },
    [bulkMode, bulkCopyMode]
  );
  const handlePointerUp = useCallback(() => {
    isDraggingSelection.current = false;
  }, []);
  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerUp]);

  const handleSaveShift = useCallback(
    (memberId: number, date: string, code: string) => {
      updateShift.mutate({
        memberId,
        shiftDate: date,
        shiftCode: code as ShiftCode,
      });
    },
    [updateShift]
  );

  const handleSaveAnnotation = useCallback(
    (
      memberId: number,
      date: string,
      currentCode: string,
      comment: string | null,
      isActing: boolean
    ) => {
      updateShift.mutate({
        memberId,
        shiftDate: date,
        shiftCode: currentCode as ShiftCode,
        comment,
        isActing,
      });
    },
    [updateShift]
  );

  const handleCopyCell = useCallback((shift: ShiftData | undefined) => {
    if (!shift?.shiftCode) {
      toast.error("Nothing to copy — cell is empty");
      return;
    }
    setClipboard({
      code: shift.shiftCode,
      comment: shift.comment ?? "",
      isActing: shift.isActing ?? false,
    });
    toast.success(
      `Copied: ${SHIFT_LABELS[shift.shiftCode as keyof typeof SHIFT_LABELS] ?? shift.shiftCode}`
    );
  }, []);

  const handlePasteCell = useCallback(
    (memberId: number, date: string) => {
      if (!clipboard) {
        toast.error("Nothing in clipboard — copy a shift first");
        return;
      }
      updateShift.mutate({
        memberId,
        shiftDate: date,
        shiftCode: clipboard.code as ShiftCode,
        comment: clipboard.comment || null,
        isActing: clipboard.isActing,
      });
      toast.success(
        `Pasted: ${SHIFT_LABELS[clipboard.code as keyof typeof SHIFT_LABELS] ?? clipboard.code}`
      );
    },
    [clipboard, updateShift]
  );

  const handleBulkApply = useCallback(
    (
      code: ShiftCode | null,
      isActing: boolean,
      actingOnly: boolean,
      shiftTime: string | null,
      shiftDurationHours: number | null
    ) => {
      if (selectedCells.size === 0) return;
      if (actingOnly) {
        // Acting-only: update each cell individually preserving its current shift code
        for (const { memberId, date } of Array.from(selectedCells.values())) {
          const currentCode =
            shiftMap.get(memberId)?.get(date)?.shiftCode ?? "";
          updateShift.mutate({
            memberId,
            shiftDate: date,
            shiftCode: currentCode as ShiftCode,
            isActing,
          });
        }
        setSelectedCells(new Map());
        setBulkSheetOpen(false);
        setBulkMode(false);
        return;
      }
      const byMember = new Map<number, string[]>();
      for (const { memberId, date } of Array.from(selectedCells.values())) {
        if (!byMember.has(memberId)) byMember.set(memberId, []);
        byMember.get(memberId)!.push(date);
      }
      for (const [memberId, dates] of Array.from(byMember.entries())) {
        bulkUpdate.mutate({
          memberId,
          dates,
          shiftCode: code as ShiftCode,
          isActing,
          shiftTime,
          shiftDurationHours,
        });
      }
    },
    [selectedCells, bulkUpdate, updateShift, shiftMap]
  );

  // Excel-style bulk copy: copy the selected block, then paste at a target cell
  const handleCopyBlock = useCallback(() => {
    if (selectedCells.size === 0) return;
    const cells = Array.from(selectedCells.values());
    // Sort member IDs by visual row order (team grouping), not flat sortOrder
    const memberIds = Array.from(new Set(cells.map(c => c.memberId))).sort(
      (a, b) => {
        const ai = visualRowMembers.findIndex(m => m.id === a);
        const bi = visualRowMembers.findIndex(m => m.id === b);
        return ai - bi;
      }
    );
    const dates = Array.from(new Set(cells.map(c => c.date))).sort();
    const enriched = cells.map(c => ({
      ...c,
      shiftCode: shiftMap.get(c.memberId)?.get(c.date)?.shiftCode ?? "",
      comment: shiftMap.get(c.memberId)?.get(c.date)?.comment ?? "",
      isActing: shiftMap.get(c.memberId)?.get(c.date)?.isActing ?? false,
      shiftTime: shiftMap.get(c.memberId)?.get(c.date)?.shiftTime ?? null,
      shiftDurationHours:
        shiftMap.get(c.memberId)?.get(c.date)?.shiftDurationHours ?? null,
    }));
    setCopiedBlock({ cells: enriched, memberIds, dates });
    setBulkCopyMode(false);
    setSelectedCells(new Map());
    toast.success(
      `Block copied (${cells.length} cell${cells.length !== 1 ? "s" : ""}) — click a cell to paste`
    );
  }, [selectedCells, shiftMap, visualRowMembers]);

  return {
    handleCellTap,
    handleCellPointerDown,
    handleCellPointerEnter,
    handleSaveAnnotation,
    handleCopyCell,
    handlePasteCell,
    handleBulkApply,
    handleCopyBlock,
  };
}

export type RosterActionsState = ReturnType<typeof useRosterActions>;
