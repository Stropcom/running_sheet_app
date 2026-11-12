// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the layout.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRight,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Send,
  Eye,
  Edit2,
  Download,
  CheckCircle2,
  Copy,
  RefreshCw,
  FolderOpen,
  CalendarPlus,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DeleteWeekDialog } from "@/components/opManager/DeleteWeekDialog";
import { BlendTeamsDialog } from "@/components/opManager/BlendTeamsDialog";
import { RosterSyncDialog } from "@/components/opManager/RosterSyncDialog";
import { changedCellKeys } from "@shared/taskingTimeline";
import { cellShift, tasksDiffer } from "@shared/taskingBlend";
import { ExportTaskingDialog } from "@/components/opManager/ExportTaskingDialog";
import { weekDays } from "@shared/taskingView";
import { TaskingCalendarViews } from "@/components/opManager/TaskingViews";
import type { TeamRow } from "./types";
import { TEAM_LABELS, DAYS } from "./constants";
import { addWeeks, addDaysUTC, formatWeekLabel } from "./weekDates";
import { taskText, uid } from "./helpers";
import { PageHeader } from "./PageHeader";
import { ContactRoleCard } from "./ContactRoleCard";
import { CoverageWarningBadge } from "./CoverageWarningBadge";
import { PriorityRowEditor } from "./PriorityRowEditor";
import { OnCallEntryEditor } from "./OnCallEntryEditor";
import { FullViewOnCall, FullViewPriority } from "./FullView";
import type { OpManagerScreen } from "./useOpManagerScreen";

/** The Op Manager page's layout. */
export function OpManagerView({ s }: { s: OpManagerScreen }) {
  const {
    blendAsk,
    TEAM_COLOURS,
    weekStart,
    taskingGrid,
    blendDay,
    keepApart,
    rosterAsk,
    setRosterAsk,
    notifyDialogOpen,
    setNotifyDialogOpen,
    notifyRecipients,
    selectedUserIds,
    setSelectedUserIds,
    handleConfirmNotify,
    postWeekMut,
    deleteWeekFor,
    setDeleteWeekFor,
    refreshRosterViews,
    setViewMode,
    viewMode,
    allWeeksQuery,
    navigate,
    isAdmin,
    setNewWeekDialogOpen,
    setWeekStart,
    newWeekDialogOpen,
    nextNewWeekStart,
    handleCopyLastWeek,
    isCreatingWeek,
    copySource,
    handleCreateBlankWeek,
    editingCal,
    handlePrevWeek,
    handleNextWeek,
    currentViewIdx,
    sortedViewableWeeks,
    isSavingTasking,
    cancelEditing,
    isPosted,
    timelineChanges,
    saveTimelineChanges,
    setExportDialogOpen,
    postWithRosterCheck,
    postedQuery,
    canViewWeek,
    onCallEntries,
    contacts,
    usersQuery,
    priorityRows,
    taskingTeams,
    taskingIssueCount,
    taskingCoverage,
    taskingBreaches,
    taskingBreachCount,
    setEditingCal,
    activeOps,
    slideTeamShift,
    setTeamShift,
    pickSecondOp,
    pickTeamOp,
    handleCreateOp,
    splitDay,
    exportDialogOpen,
    handleExportTasking,
    weekHasNoContactsOrPriority,
    emptyWeekSourceQuery,
    handleFillFromEarlierWeek,
    isFillingWeek,
    activeTab,
    setActiveTab,
    saveDetails,
    saveContactsMut,
    savePriorityMut,
    setContacts,
    setOnCallEntries,
    addPriorityRow,
    updatePriorityRow,
    removePriorityRow,
  } = s;

  // ── Post & Notify user-selection dialog ─────────────────────────────────────────
  // Shared between the "view" and "edit" mode returns below (both are early
  // returns from this component, so the dialog must be rendered in whichever
  // branch is actually mounted, not just one of them — otherwise clicking
  // "Post & Notify" from view mode sets notifyDialogOpen but there's no
  // <Dialog> mounted anywhere to show it).
  const blendDialog = (
    <BlendTeamsDialog
      open={blendAsk !== null}
      colours={[TEAM_COLOURS.surv1.border, TEAM_COLOURS.surv2.border]}
      dayLabel={
        blendAsk === null
          ? ""
          : (() => {
              const d = weekDays(weekStart)[blendAsk];
              return `${d.name} ${String(d.day).padStart(2, "0")} ${d.month}`;
            })()
      }
      shift={cellShift(taskingGrid[`surv1-${blendAsk ?? 0}`])}
      tasks={{
        surv1: taskText(taskingGrid[`surv1-${blendAsk ?? 0}`]),
        surv2: taskText(taskingGrid[`surv2-${blendAsk ?? 0}`]),
        differ: tasksDiffer(
          taskingGrid[`surv1-${blendAsk ?? 0}`],
          taskingGrid[`surv2-${blendAsk ?? 0}`]
        ),
      }}
      onYes={keep => blendDay(blendAsk ?? 0, keep)}
      onNo={() => keepApart(blendAsk ?? 0)}
    />
  );

  const rosterSyncDialog = (
    <RosterSyncDialog
      open={rosterAsk !== null}
      groups={rosterAsk?.groups ?? []}
      members={rosterAsk?.members ?? 0}
      onYes={() => {
        rosterAsk?.answer(true);
        setRosterAsk(null);
      }}
      onNo={() => {
        rosterAsk?.answer(false);
        setRosterAsk(null);
      }}
    />
  );

  const notifyDialog = (
    <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select who to notify</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-1 max-h-72 overflow-y-auto">
          {/* Select All toggle */}
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Checkbox
              id="notify-all"
              checked={
                notifyRecipients.length > 0 &&
                selectedUserIds.size === notifyRecipients.length
              }
              onCheckedChange={checked => {
                if (checked) {
                  setSelectedUserIds(new Set(notifyRecipients.map(u => u.id)));
                } else {
                  setSelectedUserIds(new Set());
                }
              }}
            />
            <Label
              htmlFor="notify-all"
              className="font-semibold cursor-pointer"
            >
              Select All
            </Label>
          </div>
          {/* User list sorted: CIN 667 first, then ascending */}
          {[...notifyRecipients]
            .sort((a, b) => {
              const cinA = a.cin ?? "";
              const cinB = b.cin ?? "";
              if (cinA === "667" && cinB !== "667") return -1;
              if (cinB === "667" && cinA !== "667") return 1;
              return cinA.localeCompare(cinB, undefined, { numeric: true });
            })
            .map(u => (
              <div key={u.id} className="flex items-center gap-2 py-1">
                <Checkbox
                  id={`notify-user-${u.id}`}
                  checked={selectedUserIds.has(u.id)}
                  onCheckedChange={checked => {
                    setSelectedUserIds(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(u.id);
                      else next.delete(u.id);
                      return next;
                    });
                  }}
                />
                <Label
                  htmlFor={`notify-user-${u.id}`}
                  className="cursor-pointer flex items-center gap-2"
                >
                  <span className="font-mono text-xs text-muted-foreground w-10">
                    {u.cin ?? "—"}
                  </span>
                  <span>{u.name}</span>
                </Label>
              </div>
            ))}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotifyDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirmNotify}
            disabled={postWeekMut.isPending}
            className="gap-1"
          >
            <Send className="h-3.5 w-3.5" />
            Post & Notify ({selectedUserIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ── Delete a weekly tasking (admin) ─────────────────────────────────────────────
  // Rendered in the folder, view and edit branches alike (each is an early
  // return), so it is mounted wherever the Delete button was pressed.
  const deleteWeekDialog = (
    <DeleteWeekDialog
      weekStart={deleteWeekFor}
      label={deleteWeekFor ? formatWeekLabel(deleteWeekFor) : ""}
      onOpenChange={open => {
        if (!open) setDeleteWeekFor(null);
      }}
      onDeleted={() => {
        void refreshRosterViews();
        setViewMode("folder");
      }}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // FOLDER VIEW (landing page)
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === "folder") {
    const allWeeks = allWeeksQuery.data ?? [];
    return (
      <DashboardLayout>
        <div className="min-h-full bg-background text-foreground">
          {/* Header */}
          <div className="border-b border-border bg-card">
            <div className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                  <h1 className="whitespace-nowrap text-lg font-semibold">
                    CTO Weekly Tasking
                  </h1>
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  className="w-full gap-1 sm:w-auto"
                  onClick={() => setNewWeekDialogOpen(true)}
                >
                  <CalendarPlus className="h-4 w-4" />
                  New CTO Weekly Tasking
                </Button>
              )}
            </div>
          </div>

          {/* Week list */}
          <div className="px-4 py-6">
            {allWeeksQuery.isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                Loading…
              </div>
            ) : allWeeks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                <FolderOpen className="h-12 w-12 opacity-30" />
                <p className="text-base font-medium">
                  No weekly tasking sheets yet.
                </p>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setNewWeekDialogOpen(true)}
                    className="gap-1"
                  >
                    <CalendarPlus className="h-4 w-4" /> Create First Week
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {allWeeks.map((week, idx) => (
                  <div
                    key={week.weekStart}
                    className="flex items-stretch gap-2"
                  >
                    <button
                      onClick={() => {
                        setWeekStart(week.weekStart);
                        setViewMode("view");
                      }}
                      className="min-w-0 flex-1 text-left rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between group"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                        <div>
                          <p className="font-medium text-sm">
                            CTO Weekly Tasking —{" "}
                            <span className="whitespace-nowrap">
                              {formatWeekLabel(week.weekStart)}
                            </span>
                          </p>
                          {week.postedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Posted{" "}
                              {new Date(week.postedAt).toLocaleDateString(
                                "en-AU",
                                { dateStyle: "medium" }
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                        {idx === 0 && (
                          <span className="whitespace-nowrap text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                            Latest
                          </span>
                        )}
                        {week.posted ? (
                          <span className="whitespace-nowrap text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Posted
                          </span>
                        ) : (
                          <span className="whitespace-nowrap text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                            Draft
                          </span>
                        )}
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors sm:ml-0" />
                      </div>
                    </button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Delete the weekly tasking for ${formatWeekLabel(week.weekStart)}`}
                        title="Delete this weekly tasking"
                        onClick={() => setDeleteWeekFor(week.weekStart)}
                        className="h-auto w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New week dialog */}
          <Dialog open={newWeekDialogOpen} onOpenChange={setNewWeekDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>New CTO Weekly Tasking</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Creating week:{" "}
                <span className="font-semibold text-foreground">
                  {formatWeekLabel(nextNewWeekStart)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Shift times are always auto-populated from the rotation
                schedule. You can change them manually after creating.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleCopyLastWeek}
                  disabled={isCreatingWeek || !copySource}
                  className="gap-2 justify-start"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  <div className="text-left">
                    <p className="font-medium">Copy Last Week</p>
                    <p className="text-xs text-muted-foreground font-normal">
                      {copySource
                        ? `Copies contacts & priority board from ${formatWeekLabel(copySource.weekStart)}`
                        : "No earlier week has contacts or a priority board to copy"}
                    </p>
                  </div>
                </Button>
                <Button
                  onClick={handleCreateBlankWeek}
                  disabled={isCreatingWeek}
                  className="gap-2 justify-start"
                  variant="outline"
                >
                  <CalendarPlus className="h-4 w-4" />
                  <div className="text-left">
                    <p className="font-medium">Create New</p>
                    <p className="text-xs text-muted-foreground font-normal">
                      Start with a blank sheet
                    </p>
                  </div>
                </Button>
              </div>
              {isCreatingWeek && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Creating…
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        {deleteWeekDialog}
      </DashboardLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FULL VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === "view") {
    return (
      <DashboardLayout>
        <div
          className={`min-h-full bg-background text-foreground ${editingCal ? "pb-24" : ""}`}
        >
          <div className="no-print">
            <PageHeader
              weekStart={weekStart}
              onPrev={handlePrevWeek}
              onNext={handleNextWeek}
              prevDisabled={!isAdmin && currentViewIdx <= 0}
              nextDisabled={
                !isAdmin && currentViewIdx >= sortedViewableWeeks.length - 1
              }
              onBack={() => setViewMode("folder")}
              rightSlot={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isAdmin && editingCal && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden md:inline-flex"
                        disabled={isSavingTasking}
                        onClick={cancelEditing}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant={isPosted ? "outline" : "default"}
                        disabled={
                          isSavingTasking || timelineChanges.length === 0
                        }
                        onClick={() => void saveTimelineChanges(false)}
                        className="hidden gap-1 md:inline-flex"
                      >
                        <Save className="h-3.5 w-3.5" />{" "}
                        {isPosted ? "Save" : "Save draft"}
                      </Button>
                      {isPosted && (
                        <Button
                          size="sm"
                          disabled={
                            isSavingTasking || timelineChanges.length === 0
                          }
                          onClick={() => void saveTimelineChanges(true)}
                          className="hidden gap-1 md:inline-flex"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Save and re-post
                        </Button>
                      )}
                    </>
                  )}
                  {isAdmin && !editingCal && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewMode("edit")}
                        className="gap-1"
                        title="On-call, contacts and the priority board"
                      >
                        Edit Contacts &amp; Priorities
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExportDialogOpen(true)}
                        className="gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> Export PDF
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void postWithRosterCheck()}
                        disabled={postWeekMut.isPending}
                        className="gap-1"
                        variant={
                          postedQuery.data?.posted ? "outline" : "default"
                        }
                      >
                        {postWeekMut.isPending ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : postedQuery.data?.posted ? (
                          <RefreshCw className="h-3.5 w-3.5" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {postedQuery.data?.posted
                          ? "Re-post & Notify"
                          : "Post & Notify"}
                      </Button>
                    </>
                  )}
                </div>
              }
            />
          </div>

          {/* Branded hero banner */}
          <style>{`@media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 6mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .print-scale { transform: scale(0.72); transform-origin: top left; width: 139%; } }`}</style>
          <div
            className="print:block"
            style={{
              background:
                "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            }}
          >
            <div className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  CTO Weekly Tasking
                </h1>
                <span className="text-sm text-blue-200">
                  {formatWeekLabel(weekStart)}
                </span>
                {postedQuery.data && !isPosted && (
                  <span
                    data-testid="week-draft-badge"
                    className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950"
                  >
                    Draft, not posted
                  </span>
                )}
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1">
                <p className="text-xs text-blue-400">
                  {new Date().toLocaleDateString("en-AU", {
                    dateStyle: "long",
                  })}
                </p>
              </div>
            </div>
          </div>

          {!canViewWeek ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <p className="text-base font-medium">
                No tasking posted for this week yet.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4 print:p-0 print-scale">
              <FullViewOnCall
                onCallEntries={onCallEntries}
                contacts={contacts}
                users={usersQuery.data ?? []}
              />
              <FullViewPriority priorityRows={priorityRows} />
              <TaskingCalendarViews
                weekStart={weekStart}
                teams={taskingTeams}
                grid={taskingGrid}
                issueCount={taskingIssueCount}
                counts={taskingCoverage}
                breaches={taskingBreaches}
                breachCount={taskingBreachCount}
                onOpenRoster={i =>
                  navigate(`/cto-roster?date=${addDaysUTC(weekStart, i)}`)
                }
                toolbarAction={
                  isAdmin && !editingCal ? (
                    <Button
                      variant="outline"
                      className="h-9 shrink-0 gap-1"
                      onClick={() => setEditingCal(true)}
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit Tasking
                    </Button>
                  ) : undefined
                }
                edit={
                  isAdmin && editingCal
                    ? {
                        editable: true,
                        ops: activeOps.map(o => o.name),
                        onSlide: slideTeamShift,
                        onShift: setTeamShift,
                        onSecond: pickSecondOp,
                        onOp: pickTeamOp,
                        onCreateOp: name =>
                          new Promise<string | null>(resolve => {
                            void handleCreateOp(name, (_, made) =>
                              resolve(made)
                            ).then(() => resolve(null));
                          }),
                        onSplit: splitDay,
                        changed: new Set(changedCellKeys(timelineChanges)),
                      }
                    : undefined
                }
                renderWarning={(teamId, dayIndex, primary) => {
                  const cv = taskingCoverage[`${teamId}-${dayIndex}`];
                  return cv?.short ? (
                    <CoverageWarningBadge
                      teamName={TEAM_LABELS[teamId as TeamRow]}
                      day={DAYS[dayIndex]}
                      onDuty={cv.onDuty}
                      min={cv.min}
                      primaryTask={primary || null}
                    />
                  ) : null;
                }}
              />
            </div>
          )}
        </div>
        {isAdmin && editingCal && timelineChanges.length > 0 && (
          <div
            role="region"
            aria-label="Unsaved timeline changes"
            className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-amber-500 bg-card px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.18)] print:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-semibold">
                  {timelineChanges.length === 1
                    ? "1 change"
                    : `${timelineChanges.length} changes`}{" "}
                  (not saved yet)
                </p>
                <p
                  className="line-clamp-2 text-xs text-muted-foreground"
                  title={timelineChanges.map(c => c.text).join("\n")}
                >
                  {timelineChanges.map(c => c.text).join("  •  ")}
                </p>
              </div>
              {/* Save and Save and re-post are here on every screen (in reach
                  as the page scrolls) and also at the top of the page; Cancel
                  is only down here on a phone. */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 md:hidden"
                  disabled={isSavingTasking}
                  onClick={cancelEditing}
                >
                  Cancel
                </Button>
                <Button
                  variant={isPosted ? "outline" : "default"}
                  size="sm"
                  className="h-9"
                  disabled={isSavingTasking}
                  onClick={() => void saveTimelineChanges(false)}
                >
                  {isPosted ? "Save" : "Save draft"}
                </Button>
                {isPosted && (
                  <Button
                    size="sm"
                    className="h-9 gap-1"
                    disabled={isSavingTasking}
                    onClick={() => void saveTimelineChanges(true)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Save and re-post
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        {isAdmin && editingCal && timelineChanges.length === 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 py-3 print:hidden md:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Editing. No changes yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={cancelEditing}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {blendDialog}
        {rosterSyncDialog}
        {notifyDialog}
        <ExportTaskingDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          onExport={handleExportTasking}
        />
        {deleteWeekDialog}
      </DashboardLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT VIEW (admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="min-h-full bg-background text-foreground">
        <PageHeader
          weekStart={weekStart}
          onPrev={() => setWeekStart(ws => addWeeks(ws, -1))}
          onNext={() => setWeekStart(ws => addWeeks(ws, 1))}
          onBack={() => setViewMode("folder")}
          rightSlot={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode("view")}
                className="gap-1"
              >
                <Eye className="h-3.5 w-3.5" /> Full View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteWeekFor(weekStart)}
                className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          }
        />

        {weekHasNoContactsOrPriority && emptyWeekSourceQuery.data && (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <span>
              This week has no contacts or priority board yet. The latest
              earlier week with them is{" "}
              <b>{formatWeekLabel(emptyWeekSourceQuery.data.weekStart)}</b>.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFillFromEarlierWeek}
              disabled={isFillingWeek}
              className="gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              {isFillingWeek ? "Copying…" : "Copy them in"}
            </Button>
          </div>
        )}

        <div className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 w-full grid grid-cols-3">
              <TabsTrigger value="oncall">On-Call</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="priority">Priority</TabsTrigger>
            </TabsList>

            {/* ── Contacts ──────────────────────────────────────────────────── */}
            <TabsContent value="contacts" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Supervisor Contacts</h2>
                <Button
                  size="sm"
                  onClick={saveDetails}
                  disabled={
                    saveContactsMut.isPending || savePriorityMut.isPending
                  }
                  className="gap-1"
                >
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {["CTO Inspector", "PTT"].map(role => (
                    <ContactRoleCard
                      key={role}
                      role={role}
                      contacts={contacts}
                      setContacts={setContacts}
                      users={usersQuery.data ?? []}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  {["Team 1", "Team 2"].map(role => (
                    <ContactRoleCard
                      key={role}
                      role={role}
                      contacts={contacts}
                      setContacts={setContacts}
                      users={usersQuery.data ?? []}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ── On-Call ───────────────────────────────────────────────────── */}
            <TabsContent value="oncall" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">On-Call Supervisor</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setOnCallEntries(prev => [
                        ...prev,
                        {
                          localId: uid(),
                          role: "On-Call Supervisor",
                          userId: null,
                          mobile: null,
                          isOnCall: true,
                          dayScope: "full",
                        },
                      ])
                    }
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveDetails}
                    disabled={
                      saveContactsMut.isPending || savePriorityMut.isPending
                    }
                    className="gap-1"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              </div>
              {onCallEntries.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="mb-3">No on-call entries yet.</p>
                  <Button
                    size="sm"
                    onClick={() =>
                      setOnCallEntries([
                        {
                          localId: uid(),
                          role: "On-Call Supervisor",
                          userId: null,
                          mobile: null,
                          isOnCall: true,
                          dayScope: "full",
                        },
                      ])
                    }
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Entry
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {onCallEntries.map(entry => (
                    <OnCallEntryEditor
                      key={entry.localId}
                      entry={entry}
                      onChange={patch =>
                        setOnCallEntries(prev =>
                          prev.map(e =>
                            e.localId === entry.localId ? { ...e, ...patch } : e
                          )
                        )
                      }
                      onRemove={() =>
                        setOnCallEntries(prev =>
                          prev.filter(e => e.localId !== entry.localId)
                        )
                      }
                      users={usersQuery.data ?? []}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Priority Board ────────────────────────────────────────────── */}
            <TabsContent value="priority" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Priority Board</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addPriorityRow}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveDetails}
                    disabled={
                      saveContactsMut.isPending || savePriorityMut.isPending
                    }
                    className="gap-1"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              </div>
              {priorityRows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="mb-3">No priority rows yet.</p>
                  <Button size="sm" onClick={addPriorityRow} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add First Row
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {priorityRows.map((row, idx) => (
                    <PriorityRowEditor
                      key={row.localId}
                      row={row}
                      idx={idx}
                      onChange={patch => updatePriorityRow(row.localId, patch)}
                      onRemove={() => removePriorityRow(row.localId)}
                      opOptions={activeOps}
                      onCreateOp={handleCreateOp}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {blendDialog}
      {rosterSyncDialog}
      {notifyDialog}
      {deleteWeekDialog}
    </DashboardLayout>
  );
}
