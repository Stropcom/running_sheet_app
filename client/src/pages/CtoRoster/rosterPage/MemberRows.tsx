// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): a team's drop zone and the member rows.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { memo } from "react";
import { ROSTER_FRAME_EDGE } from "@/components/roster/RosterTeamFrame";
import { opForRosterTile } from "@shared/rosterTaskingOps";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { GripVertical, CheckSquare2, Star } from "lucide-react";
import {
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
} from "@shared/ctoRosterShiftUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Member, ShiftData } from "./types";
import { isDateOutsideRowScope } from "./helpers";
import { DateSpacer } from "./gridConstants";

/* ── Team drop zone ───────────────────────────────────────────────────────── */
export function TeamDropZoneRow({
  teamId,
  totalWidth,
  isActive,
}: {
  teamId: number;
  totalWidth: number;
  isActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `team-zone-${teamId}` });
  return (
    <div
      ref={setNodeRef}
      style={{ width: `${totalWidth}px` }}
      className={cn(
        "h-8 rounded-md border-2 border-dashed transition-all duration-150 mb-[3px]",
        isOver || isActive
          ? "border-primary/60 bg-primary/10"
          : "border-transparent"
      )}
    >
      {(isOver || isActive) && (
        <span className="flex items-center justify-center h-full text-[10px] text-primary/70 font-medium">
          Drop to add to this team
        </span>
      )}
    </div>
  );
}

/* ── Plain member row (mobile — no DnD hooks) ────────────────────────────── */
export const MemberRow = memo(function MemberRow({
  member,
  allDates,
  spacers,
  today,
  shiftMap,
  isAdmin,
  bulkMode,
  bulkCopyMode,
  copiedBlock,
  selectedCells,
  nameColWidth,
  colWidth,
  rowHeight,
  clipboard,
  onCellTap,
  onCellPointerDown,
  onCellPointerEnter,
  onCopyCell,
  onPasteCell,
  rowMode = "home",
  secondmentWindow,
  issueCells,
  teamOps,
}: {
  member: Member;
  allDates: Date[];
  /** Empty space for the date columns left out of the window (RosterPage). */
  spacers: { lead: number | null; trail: number | null };
  today: string;
  shiftMap: Map<number, Map<string, ShiftData>>;
  isAdmin: boolean;
  bulkMode: boolean;
  bulkCopyMode: boolean;
  copiedBlock: {
    cells: {
      memberId: number;
      date: string;
      shiftCode: string;
      comment: string;
      isActing: boolean;
    }[];
    memberIds: number[];
    dates: string[];
  } | null;
  selectedCells: Map<string, { memberId: number; date: string }>;
  nameColWidth: number;
  colWidth: number;
  rowHeight: number;
  clipboard: { code: string; comment: string; isActing: boolean } | null;
  onCellTap: (
    memberId: number,
    memberName: string,
    date: string,
    shift: ShiftData | undefined
  ) => void;
  onCellPointerDown: (memberId: number, date: string) => void;
  onCellPointerEnter: (memberId: number, date: string) => void;
  onCopyCell: (shift: ShiftData | undefined) => void;
  onPasteCell: (memberId: number, date: string) => void;
  /** "acting" = this is a secondment row rendered in the destination team, not the member's home team. */
  rowMode?: "home" | "acting";
  secondmentWindow?: { startDate: string; endDate: string } | null;
  /** Cell keys ("memberId-date") with a live EA compliance finding. */
  issueCells?: Set<string>;
  /** Operation each date for this row's team (posted tasking), for the tile. */
  teamOps?: Record<string, string>;
}) {
  return (
    <div style={{ display: "flex", gap: "3px", marginBottom: "3px" }}>
      {/* Frozen name cell */}
      <div
        className={cn(
          "flex-shrink-0 flex items-center bg-card rounded-md shadow-sm border border-border/50 overflow-hidden",
          member.excludedFromCounts && "opacity-50"
        )}
        style={{
          width: `${nameColWidth}px`,
          height: `${rowHeight}px`,
          position: "sticky",
          left: ROSTER_FRAME_EDGE,
          zIndex: 10,
          background: "var(--color-card)",
        }}
      >
        <span
          className="flex-1 truncate text-sm font-medium text-foreground pl-3 pr-2"
          title={
            member.excludedFromCounts
              ? "Excluded from ON DUTY / ON CALL counts — change in CTO Roster → Members"
              : undefined
          }
        >
          {member.name}
          {rowMode === "acting" && (
            <Badge
              variant="outline"
              className="ml-1.5 text-[9px] h-4 px-1 font-normal align-middle"
            >
              Acting
            </Badge>
          )}
        </span>
      </div>

      {/* Shift cells */}
      <DateSpacer width={spacers.lead} />
      {allDates.map(d => {
        const ds = format(d, "yyyy-MM-dd");
        if (isDateOutsideRowScope(rowMode, secondmentWindow, ds)) {
          return (
            <div
              key={ds}
              style={{
                width: `${colWidth}px`,
                height: `${rowHeight}px`,
                flexShrink: 0,
              }}
              className="rounded-md bg-muted/10"
            />
          );
        }
        const shift = shiftMap.get(member.id)?.get(ds);
        const code = shift?.shiftCode ?? "";
        const isToday = ds === today;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const cellKey = `${member.id}-${ds}`;
        const isSelected = selectedCells.has(cellKey);
        const hasComment = !!shift?.comment;
        // The operation this team is tasked on that day (posted tasking only).
        const taskedOp = opForRosterTile(teamOps, code, ds);
        const hasIssue = !!issueCells?.has(cellKey);
        const isActing = shift?.isActing ?? false;
        const label = SHIFT_LABELS[code as keyof typeof SHIFT_LABELS];
        const time =
          shift?.shiftTime ??
          SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ??
          "";
        const isPasteMode =
          !!clipboard && isAdmin && !bulkMode && !bulkCopyMode && !copiedBlock;
        const isBlockPasteMode = !!copiedBlock && isAdmin;
        const isBulkCopySelected = bulkCopyMode && isSelected;
        return (
          <button
            key={ds}
            style={{
              width: `${colWidth}px`,
              height: `${rowHeight}px`,
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            className={cn(
              "rounded-md relative overflow-hidden transition-all duration-100 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isPasteMode && "cursor-copy",
              isBlockPasteMode && "cursor-crosshair",
              code
                ? cn(shiftClass(code), "shadow-sm")
                : cn(
                    isToday
                      ? "bg-primary/10"
                      : isWeekend
                        ? "bg-muted/40"
                        : "bg-muted/20",
                    "hover:bg-muted/50"
                  ),
              isToday && code && "ring-2 ring-primary ring-offset-1",
              isActing && !isSelected && "ring-2 ring-amber-400 ring-offset-1",
              isSelected &&
                !isBulkCopySelected &&
                "ring-2 ring-primary ring-offset-1 brightness-90",
              isBulkCopySelected &&
                "ring-2 ring-blue-400 ring-offset-1 brightness-90"
            )}
            onClick={() => {
              if (isPasteMode) {
                onPasteCell(member.id, ds);
                return;
              }
              onCellTap(member.id, member.name, ds, shift);
            }}
            onContextMenu={e => {
              if (isAdmin && !bulkMode && !bulkCopyMode) {
                e.preventDefault();
                onCopyCell(shift);
              }
            }}
            onPointerDown={e => {
              e.stopPropagation();
              onCellPointerDown(member.id, ds);
            }}
            onPointerEnter={() => onCellPointerEnter(member.id, ds)}
          >
            {taskedOp && !isSelected && (
              <span
                className="roster-cell-op absolute inset-x-1 top-[10px] bottom-[11px] flex items-center justify-center text-center text-[8px] leading-[9px] font-semibold opacity-95 overflow-hidden"
                title={`Tasked: ${taskedOp}`}
              >
                {/* Two words that do not fit on one line: the second goes on a
                    second line; a longer name is cut with an ellipsis. */}
                <span className="line-clamp-2 [overflow-wrap:anywhere]">
                  {taskedOp}
                </span>
              </span>
            )}
            {code && !isSelected && (
              <span className="roster-cell-label absolute inset-x-1 bottom-1 text-[7px] leading-tight opacity-90 truncate text-center block font-medium">
                {label}
                {time ? ` · ${time}` : ""}
              </span>
            )}
            {(hasComment || hasIssue) && !isSelected && (
              <span className="absolute top-1 right-1 flex items-center gap-0.5">
                {hasIssue && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-red-500 ring-1 ring-white/80 shadow-sm"
                    title="EA compliance issue"
                  />
                )}
                {hasComment && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
                )}
              </span>
            )}
            {isActing && !isSelected && (
              <span className="absolute top-1 left-1">
                <Star className="w-2.5 h-2.5 text-amber-300 fill-amber-300 drop-shadow" />
              </span>
            )}
            {isSelected && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-5 h-5 rounded-full bg-primary/90 flex items-center justify-center shadow-sm">
                  <CheckSquare2 className="w-3 h-3 text-white" />
                </span>
              </span>
            )}
            {!code && !isSelected && isAdmin && (
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/20 text-base font-light">
                +
              </span>
            )}
          </button>
        );
      })}
      <DateSpacer width={spacers.trail} />
    </div>
  );
});

/* ── Sortable member row ──────────────────────────────────────────────────── */
export const SortableMemberRow = memo(function SortableMemberRow({
  member,
  allDates,
  spacers,
  today,
  shiftMap,
  isAdmin,
  isDragging,
  bulkMode,
  bulkCopyMode,
  copiedBlock,
  selectedCells,
  nameColWidth,
  colWidth,
  rowHeight,
  clipboard,
  onCellTap,
  onCellPointerDown,
  onCellPointerEnter,
  onCopyCell,
  onPasteCell,
  secondmentWindow,
  issueCells,
  teamOps,
}: {
  member: Member;
  allDates: Date[];
  /** Empty space for the date columns left out of the window (RosterPage). */
  spacers: { lead: number | null; trail: number | null };
  today: string;
  shiftMap: Map<number, Map<string, ShiftData>>;
  isAdmin: boolean;
  isDragging: boolean;
  bulkMode: boolean;
  bulkCopyMode: boolean;
  copiedBlock: {
    cells: {
      memberId: number;
      date: string;
      shiftCode: string;
      comment: string;
      isActing: boolean;
    }[];
    memberIds: number[];
    dates: string[];
  } | null;
  selectedCells: Map<string, { memberId: number; date: string }>;
  nameColWidth: number;
  colWidth: number;
  rowHeight: number;
  clipboard: { code: string; comment: string; isActing: boolean } | null;
  onCellTap: (
    memberId: number,
    memberName: string,
    date: string,
    shift: ShiftData | undefined
  ) => void;
  onCellPointerDown: (memberId: number, date: string) => void;
  onCellPointerEnter: (memberId: number, date: string) => void;
  onCopyCell: (shift: ShiftData | undefined) => void;
  onPasteCell: (memberId: number, date: string) => void;
  /** This member's own secondment, if any — their home-team cells blank out during it. */
  secondmentWindow?: { startDate: string; endDate: string } | null;
  /** Cell keys ("memberId-date") with a live EA compliance finding. */
  issueCells?: Set<string>;
  /** Operation each date for this row's team (posted tasking), for the tile. */
  teamOps?: Record<string, string>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: member.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: "flex", gap: "3px", marginBottom: "3px" }}
      className={cn(isDragging && "opacity-30")}
    >
      {/* Frozen name cell */}
      <div
        className={cn(
          "flex-shrink-0 flex items-center bg-card rounded-md shadow-sm border border-border/50 overflow-hidden",
          member.excludedFromCounts && "opacity-50"
        )}
        style={{
          width: `${nameColWidth}px`,
          height: `${rowHeight}px`,
          position: "sticky",
          left: ROSTER_FRAME_EDGE,
          zIndex: 10,
          background: "var(--color-card)",
        }}
      >
        {isAdmin && (
          <button
            {...attributes}
            {...listeners}
            className="flex-shrink-0 flex items-center justify-center w-8 h-full text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors focus:outline-none touch-none"
            tabIndex={-1}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <span
          className={cn(
            "flex-1 truncate text-sm font-medium text-foreground pr-2",
            !isAdmin && "pl-3"
          )}
          title={
            member.excludedFromCounts
              ? "Excluded from ON DUTY / ON CALL counts — change in CTO Roster → Members"
              : undefined
          }
        >
          {member.name}
        </span>
      </div>

      {/* Shift cells */}
      <DateSpacer width={spacers.lead} />
      {allDates.map(d => {
        const ds = format(d, "yyyy-MM-dd");
        if (isDateOutsideRowScope("home", secondmentWindow, ds)) {
          return (
            <div
              key={ds}
              style={{
                width: `${colWidth}px`,
                height: `${rowHeight}px`,
                flexShrink: 0,
              }}
              className="rounded-md bg-muted/10"
            />
          );
        }
        const shift = shiftMap.get(member.id)?.get(ds);
        const code = shift?.shiftCode ?? "";
        const isToday = ds === today;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const cellKey = `${member.id}-${ds}`;
        const isSelected = selectedCells.has(cellKey);
        const hasComment = !!shift?.comment;
        // The operation this team is tasked on that day (posted tasking only).
        const taskedOp = opForRosterTile(teamOps, code, ds);
        const hasIssue = !!issueCells?.has(cellKey);
        const isActing = shift?.isActing ?? false;
        const label = SHIFT_LABELS[code as keyof typeof SHIFT_LABELS];
        const time =
          shift?.shiftTime ??
          SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ??
          "";
        const isPasteMode =
          !!clipboard && isAdmin && !bulkMode && !bulkCopyMode && !copiedBlock;
        const isBlockPasteMode = !!copiedBlock && isAdmin;
        const isBulkCopySelected = bulkCopyMode && isSelected;
        return (
          <button
            key={ds}
            data-no-dnd="true"
            style={{
              width: `${colWidth}px`,
              height: `${rowHeight}px`,
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            className={cn(
              "rounded-md relative overflow-hidden transition-all duration-100 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isPasteMode && "cursor-copy",
              isBlockPasteMode && "cursor-crosshair",
              code
                ? cn(shiftClass(code), "shadow-sm")
                : cn(
                    isToday
                      ? "bg-primary/10"
                      : isWeekend
                        ? "bg-muted/40"
                        : "bg-muted/20",
                    "hover:bg-muted/50"
                  ),
              isToday && code && "ring-2 ring-primary ring-offset-1",
              isActing && !isSelected && "ring-2 ring-amber-400 ring-offset-1",
              isSelected &&
                !isBulkCopySelected &&
                "ring-2 ring-primary ring-offset-1 brightness-90",
              isBulkCopySelected &&
                "ring-2 ring-blue-400 ring-offset-1 brightness-90"
            )}
            onClick={() => {
              if (isPasteMode) {
                onPasteCell(member.id, ds);
                return;
              }
              onCellTap(member.id, member.name, ds, shift);
            }}
            onContextMenu={e => {
              if (isAdmin && !bulkMode && !bulkCopyMode) {
                e.preventDefault();
                onCopyCell(shift);
              }
            }}
            onPointerDown={e => {
              e.stopPropagation();
              onCellPointerDown(member.id, ds);
            }}
            onPointerEnter={() => onCellPointerEnter(member.id, ds)}
          >
            {taskedOp && !isSelected && (
              <span
                className="roster-cell-op absolute inset-x-1 top-[10px] bottom-[11px] flex items-center justify-center text-center text-[8px] leading-[9px] font-semibold opacity-95 overflow-hidden"
                title={`Tasked: ${taskedOp}`}
              >
                {/* Two words that do not fit on one line: the second goes on a
                    second line; a longer name is cut with an ellipsis. */}
                <span className="line-clamp-2 [overflow-wrap:anywhere]">
                  {taskedOp}
                </span>
              </span>
            )}
            {code && !isSelected && (
              <span className="roster-cell-label absolute inset-x-1 bottom-1 text-[7px] leading-tight opacity-90 truncate text-center block font-medium">
                {label}
                {time ? ` · ${time}` : ""}
              </span>
            )}
            {(hasComment || hasIssue) && !isSelected && (
              <span className="absolute top-1 right-1 flex items-center gap-0.5">
                {hasIssue && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-red-500 ring-1 ring-white/80 shadow-sm"
                    title="EA compliance issue"
                  />
                )}
                {hasComment && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
                )}
              </span>
            )}
            {isActing && !isSelected && (
              <span className="absolute top-1 left-1">
                <Star className="w-2.5 h-2.5 text-amber-300 fill-amber-300 drop-shadow" />
              </span>
            )}
            {isSelected && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-5 h-5 rounded-full bg-primary/90 flex items-center justify-center shadow-sm">
                  <CheckSquare2 className="w-3 h-3 text-white" />
                </span>
              </span>
            )}
            {!code && !isSelected && isAdmin && (
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/20 text-base font-light">
                +
              </span>
            )}
          </button>
        );
      })}
      <DateSpacer width={spacers.trail} />
    </div>
  );
});
