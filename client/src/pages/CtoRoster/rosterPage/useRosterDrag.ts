// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): member drag-and-drop and the name column width.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useRosterScreen) and its layout is RosterView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useMemo } from "react";
import {
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type { Member } from "./types";
import { SmartPointerSensor, SmartTouchSensor } from "./sensors";
import { TOTAL_DAYS, COL_WIDTH, NAME_COL_WIDTH } from "./gridConstants";
import type { RosterDataState } from "./useRosterData";
import type { RosterGridState } from "./useRosterGrid";

export function useRosterDrag(
  s: Pick<
    RosterDataState,
    | "setActiveDragId"
    | "localMembers"
    | "membersData"
    | "setLocalMembers"
    | "setOverTeamId"
    | "displayMembers"
    | "activeDragId"
    | "reorderMembers"
  > &
    Pick<RosterGridState, "isMobile">
) {
  const {
    setActiveDragId,
    localMembers,
    membersData,
    setLocalMembers,
    setOverTeamId,
    displayMembers,
    activeDragId,
    reorderMembers,
    isMobile,
  } = s;

  // DnD sensors — SmartPointerSensor/SmartTouchSensor skip elements with
  // data-no-dnd="true" (shift cells) so normal taps on iOS are never intercepted.
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(SmartTouchSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
    if (!localMembers && membersData)
      setLocalMembers([...(membersData as Member[])]);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (overId.startsWith("team-zone-"))
      setOverTeamId(parseInt(overId.replace("team-zone-", "")));
    else {
      const overMember = displayMembers.find(m => m.id === over.id);
      if (overMember) setOverTeamId(overMember.teamId);
    }
  };

  const activeMember = activeDragId
    ? displayMembers.find(m => m.id === activeDragId)
    : null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setOverTeamId(null);
    if (!over || !localMembers) return;

    const activeId = active.id as number;
    const overId = String(over.id);
    let targetTeamId: number;
    let insertBeforeMemberId: number | null = null;

    if (overId.startsWith("team-zone-")) {
      targetTeamId = parseInt(overId.replace("team-zone-", ""));
    } else {
      const overMember = localMembers.find(m => m.id === Number(over.id));
      if (!overMember) return;
      targetTeamId = overMember.teamId;
      insertBeforeMemberId = overMember.id;
    }
    if (activeId === insertBeforeMemberId) return;

    // Same-team drags need to know direction: dnd-kit reports `over` as
    // whichever row the pointer currently sits inside, without saying which
    // side of it. Dragging downward past a row should land the dragged
    // member after it (matching where the pointer physically left it);
    // dragging upward should land it before. Comparing original sortOrder
    // tells us which side the drag crossed from.
    const originalActive = localMembers.find(m => m.id === activeId);
    if (!originalActive) return;
    const overOriginalSortOrder =
      insertBeforeMemberId !== null
        ? localMembers.find(m => m.id === insertBeforeMemberId)?.sortOrder
        : undefined;
    const movingDown =
      originalActive.teamId === targetTeamId &&
      overOriginalSortOrder !== undefined &&
      originalActive.sortOrder < overOriginalSortOrder;

    const updated = localMembers.map(m => ({ ...m }));
    const activeMember = updated.find(m => m.id === activeId);
    if (!activeMember) return;
    activeMember.teamId = targetTeamId;

    const teamGroups = new Map<number, Member[]>();
    for (const m of updated) {
      if (!teamGroups.has(m.teamId)) teamGroups.set(m.teamId, []);
      teamGroups.get(m.teamId)!.push(m);
    }
    for (const [teamId, group] of Array.from(teamGroups.entries())) {
      const withoutActive = group
        .filter((m: Member) => m.id !== activeId)
        .sort((a: Member, b: Member) => a.sortOrder - b.sortOrder);
      if (teamId === targetTeamId) {
        let insertIdx = withoutActive.length;
        if (insertBeforeMemberId !== null) {
          const beforeIdx = withoutActive.findIndex(
            (m: Member) => m.id === insertBeforeMemberId
          );
          if (beforeIdx !== -1)
            insertIdx = movingDown ? beforeIdx + 1 : beforeIdx;
        }
        withoutActive.splice(insertIdx, 0, activeMember);
      }
      withoutActive.forEach((m: Member, i: number) => {
        m.sortOrder = i;
      });
    }
    setLocalMembers(updated);
    reorderMembers.mutate(
      updated.map(m => ({ id: m.id, teamId: m.teamId, sortOrder: m.sortOrder }))
    );
  };

  // Mobile name column: shrink to fit the longest member name (+ padding)
  const mobileNameColWidth = useMemo(() => {
    if (!isMobile || !membersData) return NAME_COL_WIDTH;
    const names = (membersData as Member[]).map(m => m.name);
    // Measure using canvas for accuracy
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = "500 14px ui-sans-serif, system-ui, sans-serif";
        const maxTextWidth = Math.max(
          ...names.map(n => ctx.measureText(n).width)
        );
        // Add horizontal padding (12px each side) + 4px buffer, min 80px
        return Math.max(80, Math.ceil(maxTextWidth) + 28);
      }
    } catch {
      /* fallback */
    }
    // Fallback: estimate 8px per char for the longest name
    const longest = Math.max(...names.map(n => n.length));
    return Math.max(80, longest * 8 + 28);
  }, [isMobile, membersData]);

  // Total grid dimensions
  const nameColWidthForGrid = isMobile ? mobileNameColWidth : NAME_COL_WIDTH;
  const totalContentWidth = nameColWidthForGrid + TOTAL_DAYS * COL_WIDTH;

  return {
    sensors,
    handleDragStart,
    handleDragOver,
    activeMember,
    handleDragEnd,
    nameColWidthForGrid,
    totalContentWidth,
  };
}

export type RosterDragState = ReturnType<typeof useRosterDrag>;
