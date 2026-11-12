// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the layout.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useRosterScreen) and its layout is RosterView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  RosterScrubber,
  RosterZoomControl,
  RosterFullscreenBar,
} from "@/components/roster/RosterZoomControl";
import {
  ROSTER_FRAME_CHROME,
  ROSTER_FRAME_EDGE,
  RosterTeamBand,
  RosterTeamFrame,
} from "@/components/roster/RosterTeamFrame";
import { teamShowsOnCall } from "@shared/rosterTeams";
import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { setRosterFullscreen } from "@/lib/rosterFullscreen";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckSquare2,
  CalendarDays,
  Maximize2,
  Copy,
  ClipboardPaste,
  Scissors,
} from "lucide-react";
import {
  SHIFT_LABELS,
  ON_DUTY_CODES,
  ON_CALL_CODES,
} from "@shared/ctoRosterShiftUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ShiftCode, Team } from "./types";
import { getEffectiveCountableMembers } from "./helpers";
import {
  MONTHS,
  DateSpacer,
  COL_WIDTH,
  NAME_COL_WIDTH,
  ROW_HEIGHT,
  HEADER_HEIGHT,
} from "./gridConstants";
import { ShiftEditSheet } from "./ShiftEditSheet";
import { BulkApplySheet } from "./BulkApplySheet";
import { BulkCopySheet } from "./BulkCopySheet";
import { TeamDropZoneRow, MemberRow, SortableMemberRow } from "./MemberRows";
import type { RosterScreen } from "./useRosterScreen";

/** The roster page's layout. */
export function RosterView({ s }: { s: RosterScreen }) {
  const {
    fullscreen,
    setBulkMode,
    setBulkCopyMode,
    setSelectedCells,
    setCopiedBlock,
    setClipboard,
    goToPrevMonth,
    visibleMonthIndex,
    goToNextMonth,
    isAdmin,
    scrollToDate,
    today,
    bulkMode,
    selectedCells,
    bulkCopyMode,
    handleCopyBlock,
    copiedBlock,
    setBulkSheetOpen,
    clipboard,
    scrollRef,
    handleScroll,
    handleGridPointerDown,
    handleGridPointerMove,
    handleGridPointerUp,
    isLoading,
    isMobile,
    gridContentRef,
    totalContentWidth,
    nameColWidthForGrid,
    spacers,
    windowDates,
    teamsData,
    displayMembers,
    secondmentByMemberId,
    teamColourOf,
    collapsedTeams,
    toggleTeam,
    shiftMap,
    handleCellTap,
    handleCellPointerDown,
    handleCellPointerEnter,
    handleCopyCell,
    handlePasteCell,
    issueCells,
    teamOpsByName,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    overTeamId,
    activeDragId,
    activeMember,
    scrollLeft,
    setScrollLeft,
    editSheet,
    setEditSheet,
    updateShift,
    handleSaveAnnotation,
    issuesByCell,
    bulkSheetOpen,
    handleBulkApply,
    bulkCopyOpen,
    setBulkCopyOpen,
    bulkCopy,
  } = s;

  return (
    <DashboardLayout>
      <div
        className={cn(
          "flex flex-col select-none",
          fullscreen ? "px-2 py-1.5" : "px-4 py-3"
        )}
        style={{
          height: "calc(100vh - 0px)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* ── Full screen on a phone or tablet: the controls that are left, as
            a strip (a laptop, or a phone turned sideways, has them in the
            RunLog header bar) ─────────── */}
        {fullscreen && (
          <div className="roster-fs-strip mb-1.5 flex-shrink-0">
            <RosterFullscreenBar variant="strip" />
          </div>
        )}
        {/* ── Toolbar (gone in full screen) ─────────────────────────────────── */}
        <div
          className={cn(
            "flex flex-col gap-1.5 mb-3 flex-shrink-0",
            fullscreen && "hidden"
          )}
        >
          {/* Row 1: title + Full screen */}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight mr-auto">
              Team Duty Roster
            </h1>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => {
                // Bulk modes and a held clipboard need the toolbar, which is
                // hidden in full screen, so they are put away first.
                setBulkMode(false);
                setBulkCopyMode(false);
                setSelectedCells(new Map());
                setCopiedBlock(null);
                setClipboard(null);
                setRosterFullscreen(true);
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Full screen
            </Button>
          </div>
          {/* Row 2: month nav and the zoom slider. Then Today, Bulk Edit and
              Bulk Copy: on a phone they drop to their own row as equal thirds
              (they used to be squeezed onto the month picker's line and
              overlapped it); from tablet width up they stay in the one row. */}
          <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
            {/* Month navigator */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToPrevMonth}
                disabled={visibleMonthIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[76px] text-center tabular-nums">
                {MONTHS[visibleMonthIndex]}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToNextMonth}
                disabled={visibleMonthIndex === MONTHS.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Tablet and laptop: at the right end of this line, straight
                under Full screen. A phone keeps it beside the month. */}
            <RosterZoomControl className="sm:order-last sm:ml-auto" />
            <div
              className={cn(
                "grid basis-full gap-1.5 sm:contents",
                isAdmin ? "grid-cols-3" : "grid-cols-1"
              )}
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs flex-shrink-0 whitespace-nowrap"
                onClick={() => scrollToDate(today)}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Today
              </Button>
              {isAdmin && (
                <>
                  {/* Bulk Edit */}
                  <button
                    onClick={() => {
                      setBulkMode(v => !v);
                      setSelectedCells(new Map());
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors h-8",
                      bulkMode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <CheckSquare2 className="h-3.5 w-3.5" />
                    {bulkMode ? `${selectedCells.size} sel` : "Bulk Edit"}
                  </button>
                  {/* Bulk Copy */}
                  <button
                    onClick={() => {
                      if (bulkCopyMode) {
                        setBulkCopyMode(false);
                        setSelectedCells(new Map());
                      } else {
                        setBulkCopyMode(true);
                        setBulkMode(false);
                        setSelectedCells(new Map());
                        setCopiedBlock(null);
                      }
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors h-8",
                      bulkCopyMode
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    {bulkCopyMode ? `${selectedCells.size} sel` : "Bulk Copy"}
                  </button>
                </>
              )}
            </div>
            {/* Copy block button */}
            {bulkCopyMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={handleCopyBlock}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy ({selectedCells.size})
              </Button>
            )}
            {/* Paste indicator */}
            {isAdmin && copiedBlock && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium h-8">
                <ClipboardPaste className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  Block ready ({copiedBlock.cells.length}) — tap paste start
                </span>
                <span className="sm:hidden">
                  {copiedBlock.cells.length} ready
                </span>
                <button
                  onClick={() => setCopiedBlock(null)}
                  className="ml-1 text-blue-400 hover:text-blue-700"
                >
                  ×
                </button>
              </div>
            )}
            {/* Apply shift button */}
            {bulkMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBulkSheetOpen(true)}
              >
                Apply ({selectedCells.size})
              </Button>
            )}
            {/* Clipboard indicator */}
            {isAdmin && clipboard && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium h-8">
                <ClipboardPaste className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  Clipboard:{" "}
                  {SHIFT_LABELS[clipboard.code as keyof typeof SHIFT_LABELS] ??
                    clipboard.code}
                </span>
                <span className="sm:hidden">
                  {SHIFT_LABELS[clipboard.code as keyof typeof SHIFT_LABELS] ??
                    clipboard.code}
                </span>
                <button
                  onClick={() => setClipboard(null)}
                  className="ml-1 text-amber-400 hover:text-amber-700"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Single scroll container — both axes ───────────────────────────── */}
        {/*
          The key to true frozen panes:
          - This outer div is the ONLY scroll container (overflow: auto on both axes)
          - The date header row uses `position: sticky; top: 0` → stays at top on vertical scroll
          - Each name cell uses `position: sticky; left: 0` → stays at left on horizontal scroll
          - Both freeze simultaneously because they share the same scroll container
      */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerUp}
          className={cn(
            "flex-1 min-h-0 overflow-auto cursor-grab active:cursor-grabbing"
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-md" />
              ))}
            </div>
          ) : isMobile ? (
            // On mobile: render grid WITHOUT DndContext to avoid iOS Pointer Events crash.
            // Drag-to-reorder is a desktop-only admin feature.
            <div
              ref={gridContentRef}
              style={{
                minWidth: `${totalContentWidth + ROSTER_FRAME_CHROME}px`,
              }}
              className="relative pb-2"
            >
              {/* ── Frozen date header row ─────────────────────────────────── */}
              <div
                className="flex gap-[3px] mb-[3px]"
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 30,
                  background: "var(--color-background)",
                  paddingBottom: "2px",
                  paddingLeft: ROSTER_FRAME_EDGE,
                }}
              >
                {/* The month sits in the frozen corner, above "Member": it
                    follows the scroll, and it is still there in full screen
                    (where the month picker is hidden). A floating badge over
                    the day headers was tried and covered them. */}
                <div
                  className="flex-shrink-0 flex flex-col items-start justify-center gap-0.5 px-2 bg-card rounded-md shadow-sm border border-border/50 font-semibold text-foreground text-sm leading-none"
                  style={{
                    width: `${nameColWidthForGrid}px`,
                    height: `${HEADER_HEIGHT}px`,
                    position: "sticky",
                    left: ROSTER_FRAME_EDGE,
                    zIndex: 40,
                    background: "var(--color-card)",
                  }}
                >
                  <span
                    data-testid="roster-month-corner"
                    className="text-xs font-bold text-primary whitespace-nowrap"
                  >
                    {MONTHS[visibleMonthIndex]}
                  </span>
                  <span>Member</span>
                </div>
                <DateSpacer width={spacers.lead} />
                {windowDates.map(d => {
                  const ds = format(d, "yyyy-MM-dd");
                  const isToday = ds === today;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isMonthStart = d.getDate() === 1;
                  return (
                    <div
                      key={ds}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center justify-center rounded-md text-center relative",
                        isToday
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : isWeekend
                            ? "bg-muted/60 text-muted-foreground"
                            : "bg-card text-foreground border border-border/50 shadow-sm"
                      )}
                      style={{
                        width: `${COL_WIDTH}px`,
                        height: `${HEADER_HEIGHT}px`,
                      }}
                    >
                      {isMonthStart && (
                        <span className="absolute -top-0.5 left-0 right-0 text-[8px] font-bold text-primary/70 uppercase tracking-wider text-center leading-none">
                          {format(d, "MMM")}
                        </span>
                      )}
                      <span className="text-[9px] uppercase tracking-wide opacity-60 leading-none mt-1">
                        {format(d, "EEE")}
                      </span>
                      <span className="text-xs font-bold leading-none mt-0.5">
                        {format(d, "d")}
                      </span>
                    </div>
                  );
                })}
                <DateSpacer width={spacers.trail} />
              </div>

              {/* ── Team sections ─────────────────────────────────────────── */}
              {((teamsData as Team[]) ?? []).map(team => {
                const teamMembers = displayMembers.filter(
                  m => m.teamId === team.id
                );
                // Members from OTHER teams currently (or upcoming-ly)
                // seconded into this one — they get an extra "Acting" row
                // here, on top of their normal row in their home team.
                const secondedInMembers = displayMembers.filter(
                  m =>
                    m.teamId !== team.id &&
                    secondmentByMemberId.get(m.id)?.destinationTeamId ===
                      team.id
                );
                const isSurveillance =
                  team.name === "Team 1" || team.name === "Team 2";
                return (
                  <RosterTeamFrame
                    key={team.id}
                    colour={teamColourOf(team.name)}
                  >
                    {/* Team band: name, member count, fold arrow */}
                    <RosterTeamBand
                      colour={teamColourOf(team.name)}
                      name={team.name}
                      memberCount={teamMembers.length}
                      collapsed={collapsedTeams.has(team.id)}
                      onToggle={() => toggleTeam(team.id)}
                      nameColWidth={nameColWidthForGrid}
                    />

                    {/* Member rows (no DnD on mobile) */}
                    {!collapsedTeams.has(team.id) &&
                      teamMembers.map(member => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          allDates={windowDates}
                          spacers={spacers}
                          today={today}
                          shiftMap={shiftMap}
                          isAdmin={isAdmin}
                          bulkMode={bulkMode}
                          bulkCopyMode={bulkCopyMode}
                          copiedBlock={copiedBlock}
                          selectedCells={selectedCells}
                          nameColWidth={nameColWidthForGrid}
                          colWidth={COL_WIDTH}
                          rowHeight={ROW_HEIGHT}
                          clipboard={clipboard}
                          onCellTap={handleCellTap}
                          onCellPointerDown={handleCellPointerDown}
                          onCellPointerEnter={handleCellPointerEnter}
                          onCopyCell={handleCopyCell}
                          onPasteCell={handlePasteCell}
                          secondmentWindow={secondmentByMemberId.get(member.id)}
                          issueCells={issueCells}
                          teamOps={teamOpsByName.get(team.name)}
                        />
                      ))}

                    {/* Acting (secondment) rows */}
                    {!collapsedTeams.has(team.id) &&
                      secondedInMembers.map(member => (
                        <MemberRow
                          key={`acting-${member.id}`}
                          member={member}
                          allDates={windowDates}
                          spacers={spacers}
                          today={today}
                          shiftMap={shiftMap}
                          isAdmin={isAdmin}
                          bulkMode={bulkMode}
                          bulkCopyMode={bulkCopyMode}
                          copiedBlock={copiedBlock}
                          selectedCells={selectedCells}
                          nameColWidth={nameColWidthForGrid}
                          colWidth={COL_WIDTH}
                          rowHeight={ROW_HEIGHT}
                          clipboard={clipboard}
                          onCellTap={handleCellTap}
                          onCellPointerDown={handleCellPointerDown}
                          onCellPointerEnter={handleCellPointerEnter}
                          onCopyCell={handleCopyCell}
                          onPasteCell={handlePasteCell}
                          rowMode="acting"
                          secondmentWindow={secondmentByMemberId.get(member.id)}
                          issueCells={issueCells}
                          teamOps={teamOpsByName.get(team.name)}
                        />
                      ))}

                    {/* On Duty row */}
                    <div className="flex gap-[3px] mt-[3px] mb-2">
                      <div
                        className="flex-shrink-0 flex items-center whitespace-nowrap px-2 h-9 rounded-md font-bold text-[10px] uppercase tracking-wider text-slate-600 bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        style={{
                          width: `${nameColWidthForGrid}px`,
                          position: "sticky",
                          left: ROSTER_FRAME_EDGE,
                          zIndex: 20,
                        }}
                      >
                        On Duty
                      </div>
                      <DateSpacer width={spacers.lead} />
                      {windowDates.map(d => {
                        const ds = format(d, "yyyy-MM-dd");
                        const isToday = ds === today;
                        const count = getEffectiveCountableMembers(
                          team,
                          ds,
                          displayMembers,
                          secondmentByMemberId
                        ).filter(m =>
                          ON_DUTY_CODES.has(
                            shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                          )
                        ).length;
                        const numClass = isSurveillance
                          ? count > 5
                            ? "text-emerald-700 dark:text-emerald-400"
                            : count === 5
                              ? "text-amber-600 dark:text-yellow-400"
                              : count >= 1
                                ? "text-red-600 dark:text-red-400"
                                : "text-slate-400 dark:text-slate-600"
                          : count >= 5
                            ? "text-emerald-700 dark:text-emerald-400"
                            : count >= 1
                              ? "text-slate-700 dark:text-slate-300"
                              : "text-slate-400 dark:text-slate-600";
                        return (
                          <div
                            key={ds}
                            className={cn(
                              "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                              isToday
                                ? "bg-primary/25"
                                : "bg-slate-200 dark:bg-slate-800/70"
                            )}
                            style={{ width: `${COL_WIDTH}px` }}
                          >
                            <span
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                numClass
                              )}
                            >
                              {count}
                            </span>
                          </div>
                        );
                      })}
                      <DateSpacer width={spacers.trail} />
                    </div>

                    {/* On Call row */}
                    {teamShowsOnCall(team.name) && (
                      <div className="flex gap-[3px] mt-[3px] mb-2">
                        <div
                          className="flex-shrink-0 flex items-center whitespace-nowrap px-2 h-9 rounded-md font-bold text-[10px] uppercase tracking-wider text-slate-600 bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                          style={{
                            width: `${nameColWidthForGrid}px`,
                            position: "sticky",
                            left: ROSTER_FRAME_EDGE,
                            zIndex: 20,
                          }}
                        >
                          On Call
                        </div>
                        <DateSpacer width={spacers.lead} />
                        {windowDates.map(d => {
                          const ds = format(d, "yyyy-MM-dd");
                          const isToday = ds === today;
                          const count = getEffectiveCountableMembers(
                            team,
                            ds,
                            displayMembers,
                            secondmentByMemberId
                          ).filter(m =>
                            ON_CALL_CODES.has(
                              shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                            )
                          ).length;
                          const numClass =
                            count >= 5
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400";
                          return (
                            <div
                              key={ds}
                              className={cn(
                                "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                                isToday
                                  ? "bg-primary/25"
                                  : "bg-slate-200 dark:bg-slate-700/60"
                              )}
                              style={{ width: `${COL_WIDTH}px` }}
                            >
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  numClass
                                )}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                        <DateSpacer width={spacers.trail} />
                      </div>
                    )}
                  </RosterTeamFrame>
                );
              })}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* Grid: min-width forces horizontal scroll when content overflows */}
              <div
                ref={gridContentRef}
                style={{
                  minWidth: `${totalContentWidth + ROSTER_FRAME_CHROME}px`,
                  // As wide as the rows (the columns' gaps are not in
                  // totalContentWidth), so each team card spans them all.
                  width: "max-content",
                }}
                className="relative pb-2"
              >
                {/* ── Frozen date header row ─────────────────────────────────── */}
                <div
                  className="flex gap-[3px] mb-[3px]"
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 30,
                    background: "var(--color-background)",
                    paddingBottom: "2px",
                    paddingLeft: ROSTER_FRAME_EDGE,
                  }}
                >
                  {/* Corner cell — frozen top-left */}
                  <div
                    className="flex-shrink-0 flex items-center px-3 bg-card rounded-md shadow-sm border border-border/50 font-semibold text-foreground text-sm"
                    style={{
                      width: `${NAME_COL_WIDTH}px`,
                      height: `${HEADER_HEIGHT}px`,
                      position: "sticky",
                      left: ROSTER_FRAME_EDGE,
                      zIndex: 40,
                      background: "var(--color-card)",
                    }}
                  >
                    Member
                  </div>
                  {/* Floating month badge — pinned just right of the frozen
                      Member column so it stays on-screen the whole time you
                      scroll horizontally through dates, instead of only
                      being visible via the toolbar's month label above.
                      width: 0 keeps it out of the flex layout's width
                      calculation so it doesn't push the date columns over. */}
                  <div
                    style={{
                      position: "sticky",
                      left: `calc(${NAME_COL_WIDTH + 10}px + ${ROSTER_FRAME_EDGE})`,
                      width: 0,
                      height: `${HEADER_HEIGHT}px`,
                      zIndex: 35,
                    }}
                    className="flex items-center pointer-events-none"
                  >
                    <span className="whitespace-nowrap rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 shadow-md">
                      {MONTHS[visibleMonthIndex]}
                    </span>
                  </div>
                  {/* Date columns */}
                  <DateSpacer width={spacers.lead} />
                  {windowDates.map(d => {
                    const ds = format(d, "yyyy-MM-dd");
                    const isToday = ds === today;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isMonthStart = d.getDate() === 1;
                    return (
                      <div
                        key={ds}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center justify-center rounded-md text-center relative",
                          isToday
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : isWeekend
                              ? "bg-muted/60 text-muted-foreground"
                              : "bg-card text-foreground border border-border/50 shadow-sm"
                        )}
                        style={{
                          width: `${COL_WIDTH}px`,
                          height: `${HEADER_HEIGHT}px`,
                        }}
                      >
                        {isMonthStart && (
                          <span className="absolute -top-0.5 left-0 right-0 text-[8px] font-bold text-primary/70 uppercase tracking-wider text-center leading-none">
                            {format(d, "MMM")}
                          </span>
                        )}
                        <span className="text-[9px] uppercase tracking-wide opacity-60 leading-none mt-1">
                          {format(d, "EEE")}
                        </span>
                        <span className="text-xs font-bold leading-none mt-0.5">
                          {format(d, "d")}
                        </span>
                      </div>
                    );
                  })}
                  <DateSpacer width={spacers.trail} />
                </div>

                {/* ── Team sections ─────────────────────────────────────────── */}
                {((teamsData as Team[]) ?? []).map(team => {
                  const teamMembers = displayMembers.filter(
                    m => m.teamId === team.id
                  );
                  // Members from OTHER teams currently (or upcoming-ly)
                  // seconded into this one — they get an extra "Acting" row
                  // here, on top of their normal row in their home team.
                  const secondedInMembers = displayMembers.filter(
                    m =>
                      m.teamId !== team.id &&
                      secondmentByMemberId.get(m.id)?.destinationTeamId ===
                        team.id
                  );
                  const isDropTarget =
                    overTeamId === team.id && activeDragId !== null;
                  const isSurveillance =
                    team.name === "Team 1" || team.name === "Team 2";

                  return (
                    <RosterTeamFrame
                      key={team.id}
                      colour={teamColourOf(team.name)}
                    >
                      {/* Team band: name, member count, fold arrow */}
                      <RosterTeamBand
                        colour={teamColourOf(team.name)}
                        name={team.name}
                        memberCount={teamMembers.length}
                        collapsed={collapsedTeams.has(team.id)}
                        onToggle={() => toggleTeam(team.id)}
                        nameColWidth={NAME_COL_WIDTH}
                        highlight={isDropTarget}
                      />

                      {/* Member rows */}
                      <SortableContext
                        items={teamMembers.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {!collapsedTeams.has(team.id) &&
                          teamMembers.map(member => (
                            <SortableMemberRow
                              key={member.id}
                              member={member}
                              allDates={windowDates}
                              spacers={spacers}
                              today={today}
                              shiftMap={shiftMap}
                              isAdmin={isAdmin}
                              isDragging={activeDragId === member.id}
                              bulkMode={bulkMode}
                              bulkCopyMode={bulkCopyMode}
                              copiedBlock={copiedBlock}
                              selectedCells={selectedCells}
                              nameColWidth={NAME_COL_WIDTH}
                              colWidth={COL_WIDTH}
                              rowHeight={ROW_HEIGHT}
                              clipboard={clipboard}
                              onCellTap={handleCellTap}
                              onCellPointerDown={handleCellPointerDown}
                              onCellPointerEnter={handleCellPointerEnter}
                              onCopyCell={handleCopyCell}
                              onPasteCell={handlePasteCell}
                              secondmentWindow={secondmentByMemberId.get(
                                member.id
                              )}
                              issueCells={issueCells}
                              teamOps={teamOpsByName.get(team.name)}
                            />
                          ))}
                        {isAdmin && activeDragId !== null && (
                          <TeamDropZoneRow
                            key={`dropzone-${team.id}`}
                            teamId={team.id}
                            totalWidth={totalContentWidth}
                            isActive={isDropTarget}
                          />
                        )}
                      </SortableContext>

                      {/* Acting (secondment) rows — not part of the
                          SortableContext above, since they don't actually
                          belong to this team's member order. */}
                      {!collapsedTeams.has(team.id) &&
                        secondedInMembers.map(member => (
                          <MemberRow
                            key={`acting-${member.id}`}
                            member={member}
                            allDates={windowDates}
                            spacers={spacers}
                            today={today}
                            shiftMap={shiftMap}
                            isAdmin={isAdmin}
                            bulkMode={bulkMode}
                            bulkCopyMode={bulkCopyMode}
                            copiedBlock={copiedBlock}
                            selectedCells={selectedCells}
                            nameColWidth={NAME_COL_WIDTH}
                            colWidth={COL_WIDTH}
                            rowHeight={ROW_HEIGHT}
                            clipboard={clipboard}
                            onCellTap={handleCellTap}
                            onCellPointerDown={handleCellPointerDown}
                            onCellPointerEnter={handleCellPointerEnter}
                            onCopyCell={handleCopyCell}
                            onPasteCell={handlePasteCell}
                            rowMode="acting"
                            secondmentWindow={secondmentByMemberId.get(
                              member.id
                            )}
                            issueCells={issueCells}
                            teamOps={teamOpsByName.get(team.name)}
                          />
                        ))}

                      {/* On Duty row */}
                      <div className="flex gap-[3px] mt-[3px] mb-2">
                        <div
                          className="flex-shrink-0 flex items-center px-3 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest text-slate-600 bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                          style={{
                            width: `${NAME_COL_WIDTH}px`,
                            position: "sticky",
                            left: ROSTER_FRAME_EDGE,
                            zIndex: 20,
                          }}
                        >
                          On Duty
                        </div>
                        <DateSpacer width={spacers.lead} />
                        {windowDates.map(d => {
                          const ds = format(d, "yyyy-MM-dd");
                          const isToday = ds === today;
                          const count = getEffectiveCountableMembers(
                            team,
                            ds,
                            displayMembers,
                            secondmentByMemberId
                          ).filter(m =>
                            ON_DUTY_CODES.has(
                              shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                            )
                          ).length;
                          const numClass = isSurveillance
                            ? count > 5
                              ? "text-emerald-700 dark:text-emerald-400"
                              : count === 5
                                ? "text-amber-600 dark:text-yellow-400"
                                : count >= 1
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-slate-400 dark:text-slate-600"
                            : count >= 5
                              ? "text-emerald-700 dark:text-emerald-400"
                              : count >= 1
                                ? "text-slate-700 dark:text-slate-300"
                                : "text-slate-400 dark:text-slate-600";
                          return (
                            <div
                              key={ds}
                              className={cn(
                                "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                                isToday
                                  ? "bg-primary/25"
                                  : "bg-slate-200 dark:bg-slate-800/70"
                              )}
                              style={{ width: `${COL_WIDTH}px` }}
                            >
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  numClass
                                )}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                        <DateSpacer width={spacers.trail} />
                      </div>

                      {/* On Call row */}
                      {teamShowsOnCall(team.name) && (
                        <div className="flex gap-[3px] mt-[3px] mb-2">
                          <div
                            className="flex-shrink-0 flex items-center px-3 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest text-slate-600 bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                            style={{
                              width: `${NAME_COL_WIDTH}px`,
                              position: "sticky",
                              left: ROSTER_FRAME_EDGE,
                              zIndex: 20,
                            }}
                          >
                            On Call
                          </div>
                          <DateSpacer width={spacers.lead} />
                          {windowDates.map(d => {
                            const ds = format(d, "yyyy-MM-dd");
                            const isToday = ds === today;
                            const count = getEffectiveCountableMembers(
                              team,
                              ds,
                              displayMembers,
                              secondmentByMemberId
                            ).filter(m =>
                              ON_CALL_CODES.has(
                                shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                              )
                            ).length;
                            const numClass =
                              count >= 5
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400";
                            return (
                              <div
                                key={ds}
                                className={cn(
                                  "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                                  isToday
                                    ? "bg-primary/25"
                                    : "bg-slate-200 dark:bg-slate-700/60"
                                )}
                                style={{ width: `${COL_WIDTH}px` }}
                              >
                                <span
                                  className={cn(
                                    "text-sm font-bold tabular-nums",
                                    numClass
                                  )}
                                >
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                          <DateSpacer width={spacers.trail} />
                        </div>
                      )}
                    </RosterTeamFrame>
                  );
                })}
              </div>

              <DragOverlay>
                {activeMember ? (
                  <div
                    className="flex items-center gap-2 px-3 h-11 bg-card border border-primary/40 rounded-md shadow-xl text-sm font-medium"
                    style={{ width: `${NAME_COL_WIDTH}px` }}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {activeMember.name}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* ── Bottom slider (Excel-style) ────────────────────────────────────── */}
        <div className="flex-shrink-0 pt-2 pb-1 px-1">
          <RosterScrubber
            scrollLeft={scrollLeft}
            baseWidth={
              totalContentWidth + ROSTER_FRAME_CHROME - nameColWidthForGrid
            }
            onScrub={v => {
              setScrollLeft(v);
              if (scrollRef.current) scrollRef.current.scrollLeft = v;
            }}
          />
        </div>

        {/* ── Cell edit sheet ───────────────────────────────────────────────── */}
        {editSheet && (
          <ShiftEditSheet
            open={editSheet.open}
            memberName={editSheet.memberName}
            date={editSheet.date}
            currentCode={editSheet.currentCode}
            currentComment={editSheet.currentComment}
            currentIsActing={editSheet.currentIsActing}
            currentShiftTime={editSheet.currentShiftTime}
            currentShiftDurationHours={editSheet.currentShiftDurationHours}
            isAdmin={isAdmin}
            onClose={() => setEditSheet(null)}
            onSaveShift={(code, shiftTime, shiftDurationHours) => {
              updateShift.mutate({
                memberId: editSheet.memberId,
                shiftDate: editSheet.date,
                shiftCode: code as ShiftCode,
                shiftTime: shiftTime ?? null,
                shiftDurationHours: shiftDurationHours ?? null,
                memberName: editSheet.memberName,
              });
            }}
            onSaveAnnotation={(comment, isActing) =>
              handleSaveAnnotation(
                editSheet.memberId,
                editSheet.date,
                editSheet.currentCode,
                comment,
                isActing
              )
            }
            onCopyShift={() => {
              const shift = shiftMap
                .get(editSheet.memberId)
                ?.get(editSheet.date);
              handleCopyCell(shift);
            }}
            issues={issuesByCell.get(`${editSheet.memberId}-${editSheet.date}`)}
          />
        )}

        {/* ── Bulk apply sheet ──────────────────────────────────────────────── */}
        <BulkApplySheet
          open={bulkSheetOpen}
          count={selectedCells.size}
          onClose={() => setBulkSheetOpen(false)}
          onApply={handleBulkApply}
        />

        <BulkCopySheet
          open={bulkCopyOpen}
          members={displayMembers}
          onClose={() => setBulkCopyOpen(false)}
          onCopy={(sourceMemberId, targetMemberIds, startDate, endDate) =>
            bulkCopy.mutate({
              sourceMemberId,
              targetMemberIds,
              startDate,
              endDate,
            })
          }
          isLoading={bulkCopy.isPending}
        />
      </div>
    </DashboardLayout>
  );
}
