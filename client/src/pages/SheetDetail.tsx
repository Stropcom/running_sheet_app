import { ClearInputButton } from "@/components/ClearInputButton";
import { fillRoute } from "@shared/parkingRoute";
import { seatedOccupantWording, seatsOf } from "@shared/vehicleSeats";
import { orderRsChips } from "@shared/rsChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import CinInput from "@/components/CinInput";
import { endedContinuityCard } from "@/lib/surveillanceCard";
import { CeaseRowButton } from "@/components/CeaseRowButton";
import {
  samePlace,
  targetEmoji,
  vehiclesPeopleCanReach,
} from "@shared/targetPosition";
import {
  alightedWording,
  onTransitCards,
  transitBoardActions,
} from "@/lib/transitCards";
import { shortAddressLabel } from "@shared/markerLink";
import {
  occupantsToVehicle,
  occupantWording,
  vehicleOccupants as sharedVehicleOccupants,
  occupantsStillInVehicle,
  splitPeopleNames,
  surnameTokens,
  isReadAsMovement,
} from "@shared/walkEventPatterns";
import { knownSurnamesOf } from "@shared/companions";
import {
  pickSubjectCardKey,
  subjectCompanions,
  trackedTargetCode,
} from "@shared/trackedTarget";
import {
  ContinuityCards,
  type ContinuityCardData,
} from "@/components/ContinuityCards";
import { EntityDuplicateDialog } from "@/components/EntityDuplicateDialog";
import { TargetMatchDialog } from "@/components/TargetMatchDialog";
import { CheckRunningSheetDialog } from "@/components/CheckRunningSheetDialog";
import { CrossOperationEntityAlert } from "@/components/CrossOperationEntityAlert";
import { MissingLocationAlert } from "@/components/MissingLocationAlert";
import { VagueVehicleMatchAlert } from "@/components/VagueVehicleMatchAlert";
import { FaceMatchAckDialog } from "@/components/FaceMatchAckDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Lock,
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Download,
  FileText,
  Pencil,
  Camera,
  X,
  Search,
  Users,
  ArrowUpDown,
  Target,
  ClipboardCheck,
  NotebookText,
  LockKeyhole,
  LockKeyholeOpen,
  Tag,
  Undo2,
} from "lucide-react";
import React from "react";
import {
  extractOccupantNames,
  shortenAlreadyMentionedNames,
} from "@/lib/mentionAutocomplete";
import { toast } from "sonner";
import { WifiOff, RefreshCw, ChevronDown } from "lucide-react";
import {
  AddTargetDialog,
  type RegistryCreatePayload,
} from "@/components/AddTargetDialog";
import {
  PERTH_TIME_ZONE,
  addDaysToYmd,
  formatPerthDateLabel,
} from "./sheetDetail/perthDates";
import { CinCertifyCell } from "./sheetDetail/CinCertify";
import { ObservationAttachments } from "./sheetDetail/ObservationAttachments";
import { TimePickerCell } from "./sheetDetail/TimePickerCell";
import { EditableCell, ShortcutChip } from "./sheetDetail/EditableCell";
import { useSheetData } from "./sheetDetail/useSheetData";
import { useRowActions } from "./sheetDetail/useRowActions";
import { useRowChecks } from "./sheetDetail/useRowChecks";
import { useRowMembers } from "./sheetDetail/useRowMembers";
import { useSheetViewState } from "./sheetDetail/useSheetViewState";
import { useSheetEditing } from "./sheetDetail/useSheetEditing";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SheetDetail({
  sheetIdProp,
  embedded = false,
}: {
  /** Overrides the route param — used when this is rendered inside another
   * page's panel (see the map's RS Actions pane) rather than at its own
   * /sheet/:id route. */
  sheetIdProp?: number;
  /** True when rendered inside another page's panel instead of its own
   * route — hides the page chrome (back arrow, close/export controls, the
   * Summary/Governance tabs that would navigate the whole app away from the
   * host page) since the host page supplies its own header and close
   * control instead. */
  embedded?: boolean;
} = {}) {
  const props0 = { sheetIdProp, embedded };
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

  const {
    isAuthenticated,
    sheetLoading,
    rowsLoading,
    isClosed,
    openEditSheet,
    sheet,
    isOnline,
    syncStatus,
    hasPendingOfflineChanges,
    canManageClose,
    reopenSheet,
    sheetId,
    canCloseSheet,
    closeSheet,
    canCloseByRole,
    allRowsCertified,
    govComplete,
    sheetCheckOn,
    setShowCheckSheetDialog,
    exportFetching,
    handleExport,
    navigate,
    parsedRoster,
    teamPanelExpanded,
    setTeamPanelExpanded,
    cinFullyCertified,
    openEditRoster,
    canCertify,
    certifyAllForCin,
    autoImageCins,
    assignedTarget,
    entityChips,
    pendingArrivals,
    pendingDepartures,
    pendingWalkIns,
    pendingHeadingTo,
    shortcutsData,
    usedBracketCodes,
    usedBracketCodesWithDraft,
    rows,
    pendingPlacements,
    trackedTarget,
    surveillance,
    targetPosition,
    focusedTextareaRef,
    _addRowOnline,
    setJustAddedRowId,
    _deleteRowOnline,
    setTargetPanelExpanded,
    targetPanelExpanded,
    ownRowShortcut,
    ceaseAvailable,
    ceasePlace,
    invalidateRows,
    ceaseOpenForTyping,
    trackingSettings,
    continuityDismissed,
    setContinuityDismissal,
    canEdit,
    addRow,
    sortReversed,
    toggleSortReversed,
    undoStack,
    handleUndo,
    searchQuery,
    setSearchQuery,
    filteredRows,
    rowDayOffsetMap,
    sheetHasCrossedMidnight,
    updateRow,
    tvLoadingRowId,
    justAddedRowId,
    justAddedKeyboard,
    setJustAddedKeyboard,
    updateRowWithDupeCheck,
    setTvLoadingRowId,
    getTravelledViaStreets,
    rosterCinList,
    addMember,
    shortcutMap,
    usedVehicleRegos,
    usedAddressLabels,
    uploadAttachment,
    deleteAttachment,
    uncertifyAll,
    removeMember,
    certify,
    uncertify,
    deleteRow,
    editSheetOpen,
    setEditSheetOpen,
    editSheetDate,
    setEditSheetDate,
    operationTargets,
    editSelectedTargetId,
    setEditSelectedTargetId,
    setEditTargetMode,
    editTargetMode,
    editTargetSearch,
    setEditTargetSearch,
    allTargetsForSheet,
    setEditCreateTargetDialogOpen,
    user,
    deleteSheet,
    setSheetTarget,
    updateSheet,
    editCreateTargetDialogOpen,
    sheetOperation,
    createLinkedTargetForEditSheet,
    createTargetForEditSheet,
    editRosterOpen,
    setEditRosterOpen,
    rosterInput,
    setRosterInput,
    setRosterInputValid,
    handleAddRosterCin,
    rosterInputValid,
    allUsers,
    myTeams,
    handleAddRosterTeam,
    rosterList,
    setRosterList,
    dupeQueue,
    dupeIndex,
    dupeDialogOpen,
    setDupeDialogOpen,
    handleDupeDialogResolved,
    handleMissingLocationResolved,
    vagueVehicleBusy,
    handleVagueVehicleResolved,
    handleTargetMatchResolved,
    showCheckSheetDialog,
    handleJumpToCheckRow,
    handleFixCheckFinding,
  } = {
    ...sSheetData,
    ...sRowActions,
    ...sRowChecks,
    ...sRowMembers,
    ...sSheetViewState,
    ...sSheetEditing,
  };

  if (!isAuthenticated) return null;

  const isLoading = sheetLoading || rowsLoading;

  // The CLOSED badge is the same in both spots — it's a status indicator,
  // not an action button, so it doesn't need to match Close/Export's size.
  const closedBadge = (
    <Badge
      variant="secondary"
      className="gap-1.5 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0"
    >
      <LockKeyhole className="w-3 h-3" />
      CLOSED
    </Badge>
  );

  // Rendered next to the title on lg+ (single-row header) as a compact
  // icon-only button — there's no Close/Export alongside it there to match.
  const editOrClosedBadgeCompact = (
    <>
      {!isClosed && (
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={openEditSheet}
          title="Edit sheet title"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      )}
      {isClosed && closedBadge}
    </>
  );

  // Rendered on mobile instead, grouped with Close/Export on the header's
  // second row — sized to match those (size="sm" + label) rather than the
  // compact icon button, so the three read as one evenly-matched row.
  const editOrClosedBadgeFull = (
    <>
      {!isClosed && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={openEditSheet}
        >
          <Pencil className="w-4 h-4" />
          Edit
        </Button>
      )}
      {isClosed && closedBadge}
    </>
  );

  const Chrome = embedded ? React.Fragment : DashboardLayout;
  return (
    <Chrome>
      <div className={embedded ? "p-4" : "p-6 lg:p-8"}>
        {/* Header — hidden when embedded: the host panel (see the map's RS
            Actions pane) supplies its own title/close control, and the
            back arrow / Summary / Governance tabs here all navigate the
            whole app away from that panel, which would defeat its "stays
            open until explicitly closed" behaviour. */}
        {!embedded && (
          <>
            {/* lg+ (genuine laptop width): one row — back-arrow/title/
                edit-or-badge on the left, Close/Export pushed right by
                lg:ml-auto on the actions row. Below lg: two rows instead.
                This used to switch at sm (640px), which a phone in
                landscape clears easily (most run 700-930px) — landscape
                phones were dropping into the "one row" layout meant for
                real desktop width, and there wasn't room there for both
                Close and Export next to the title, so the action buttons
                wrapped onto their own line anyway, just awkwardly. lg
                (1024px) reliably excludes phones in either orientation and
                iPad portrait (768px), so they all get the deliberate
                two-row treatment instead. Row 1 there is just back-arrow +
                title — the title wraps instead of truncating below lg
                (lg:truncate only kicks in at lg+, where the row has enough
                width that one line is realistic) so the full title is
                always readable, not cut off with "…". The edit-pencil/
                CLOSED badge moves down to sit with Close/Export on row 2,
                sized to match them there (editOrClosedBadgeFull) instead of
                the compact icon button used next to the title on lg+, and
                grouped with them (no gap-widening ml-auto between) so the
                row reads as one evenly-matched set — left-aligned, under
                the back-arrow/title above it, not floating off to the
                right. */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 mb-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  {sheetLoading ? (
                    <Skeleton className="h-7 w-64" />
                  ) : (
                    <>
                      <div className="min-w-0">
                        <h1 className="text-base lg:text-xl font-semibold text-foreground lg:truncate">
                          {sheet?.title}
                        </h1>
                      </div>
                      {sheet && (
                        <div className="hidden lg:flex items-center gap-2">
                          {editOrClosedBadgeCompact}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap lg:ml-auto">
                {sheet && !sheetLoading && (
                  <div className="flex lg:hidden items-center gap-2">
                    {editOrClosedBadgeFull}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Offline indicator */}
                  {!isOnline && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-medium">
                          {syncStatus === "syncing" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <WifiOff className="w-3.5 h-3.5" />
                          )}
                          {hasPendingOfflineChanges
                            ? "Offline — changes queued"
                            : "Offline"}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        No internet connection. Changes are saved locally and
                        will sync automatically when you reconnect.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Close / Reopen button */}
                  {canManageClose &&
                    (isClosed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                            onClick={() => reopenSheet.mutate({ id: sheetId })}
                            disabled={reopenSheet.isPending}
                          >
                            <LockKeyholeOpen className="w-4 h-4" />
                            Reopen
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Reopen this running sheet for editing
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-2 ${
                              canCloseSheet
                                ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                : "opacity-40 cursor-not-allowed"
                            }`}
                            onClick={() =>
                              canCloseSheet &&
                              closeSheet.mutate({ id: sheetId })
                            }
                            disabled={!canCloseSheet || closeSheet.isPending}
                          >
                            <LockKeyhole className="w-4 h-4" />
                            Close
                            <span className="hidden lg:inline"> Sheet</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canCloseSheet
                            ? "Close and lock this running sheet"
                            : !canCloseByRole
                              ? "Only the Team Leader or Admin can close this sheet"
                              : !allRowsCertified
                                ? "All rows must be certified before closing"
                                : !govComplete
                                  ? "Governance must be 100% complete before closing"
                                  : "Close sheet"}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  {sheetCheckOn && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setShowCheckSheetDialog(true)}
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      Check
                      <span className="hidden lg:inline"> Sheet</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={exportFetching}
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4" />
                    {exportFetching ? (
                      "Preparing..."
                    ) : (
                      <>
                        Export<span className="hidden lg:inline"> PDF</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 border-b border-border">
              <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors">
                <FileText className="w-4 h-4" />
                Running Sheet
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  navigate(`/summary/${sheetId}`, { replace: true })
                }
              >
                <NotebookText className="w-4 h-4" />
                Summary
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  navigate(`/governance/${sheetId}`, { replace: true })
                }
              >
                <ClipboardCheck className="w-4 h-4" />
                Governance
              </button>
            </div>
          </>
        )}

        {/* Closed banner */}
        {isClosed && sheet && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 px-4 py-3">
            <LockKeyhole className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                This running sheet is closed and locked
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Closed by{" "}
                <span className="font-mono font-semibold">
                  {sheet.closedByCIN}
                </span>
                {" on "}
                {new Date(sheet.closedAt!).toLocaleString()}
              </p>
            </div>
            {canManageClose && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 shrink-0"
                onClick={() => reopenSheet.mutate({ id: sheetId })}
                disabled={reopenSheet.isPending}
              >
                <LockKeyholeOpen className="w-3.5 h-3.5" />
                Reopen
              </Button>
            )}
          </div>
        )}

        {/* Daily Roster Panel with Certify All — collapsible, matching target panel style */}
        {(parsedRoster.length > 0 || true) && (
          <div className="mb-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            {/* Header row — same structure as target panel: collapse button + separate pencil button */}
            <div className="flex items-center">
              <button
                className="flex-1 flex items-center gap-2 px-4 py-3 bg-muted/60 hover:bg-muted active:bg-muted transition-colors select-none text-left min-w-0"
                onClick={() => {
                  const next = !teamPanelExpanded;
                  setTeamPanelExpanded(next);
                  try {
                    localStorage.setItem(
                      "runsheet_team_panel_expanded",
                      String(next)
                    );
                  } catch {}
                }}
              >
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[13px] font-bold uppercase tracking-wide text-foreground truncate flex-1">
                  TEAM — CERTIFY
                </span>
                {/* Certified count badge */}
                {parsedRoster.length > 0 && (
                  <span className="text-xs font-mono text-muted-foreground mr-1">
                    {cinFullyCertified.size}/{parsedRoster.length}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${teamPanelExpanded ? "" : "-rotate-90"}`}
                />
              </button>
              {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
              {sheet && (
                <button
                  className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border bg-muted/60 hover:bg-muted rounded-tr-lg"
                  onClick={openEditRoster}
                  title="Edit TEAM"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Collapsible CIN badges */}
            {teamPanelExpanded && (
              <div className="px-4 py-3">
                {parsedRoster.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {parsedRoster.map(entry => (
                      <button
                        key={entry.cin}
                        onClick={() =>
                          canCertify
                            ? certifyAllForCin.mutate({
                                sheetId,
                                cin: entry.cin,
                              })
                            : undefined
                        }
                        disabled={certifyAllForCin.isPending || !canCertify}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
                          cinFullyCertified.has(entry.cin)
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                            : canCertify
                              ? "border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-foreground"
                              : "border-border bg-muted/40 text-foreground cursor-default"
                        }`}
                        title={`${canCertify ? "Certify all rows for " : ""}CIN ${entry.cin}${entry.isTeamLeader ? " (Team Leader)" : ""}${entry.isAuthor ? " (Author)" : ""}`}
                      >
                        <ShieldCheck
                          className={`w-3 h-3 ${cinFullyCertified.has(entry.cin) ? "text-emerald-500" : "text-primary"}`}
                        />
                        {entry.isTeamLeader && (
                          <span className="text-yellow-400" title="Team Leader">
                            ★
                          </span>
                        )}
                        {entry.isAuthor && (
                          <span
                            className="text-sky-400"
                            title="Running Sheet Author"
                          >
                            ✏️
                          </span>
                        )}
                        {entry.cin}
                        {(entry.hasImages || autoImageCins.has(entry.cin)) && (
                          <Camera className="w-3 h-3 text-amber-400" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No team members added — tap the pencil to add CINs.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* TARGET Panel — target card fields (when assigned) plus entity
            chips mined from this sheet's own observations, in one panel so
            officers see every quick-insert chip together. */}
        {((sheet?.targetId && assignedTarget) ||
          (entityChips && entityChips.length > 0) ||
          (pendingArrivals && pendingArrivals.length > 0) ||
          (pendingDepartures && pendingDepartures.length > 0) ||
          (pendingWalkIns && pendingWalkIns.length > 0) ||
          (pendingHeadingTo && pendingHeadingTo.length > 0)) &&
          (() => {
            const t = assignedTarget;
            const hasTarget = !!(sheet?.targetId && t);
            // Build dynamic extra vehicle fields from JSON
            const extraVehicleFields: {
              label: string;
              value: string | null;
            }[] = [];
            if (t) {
              try {
                const evs: Array<{ full: string; short: string }> = JSON.parse(
                  (t as any).extraVehicles ?? "[]"
                );
                evs.forEach((ev, i) => {
                  const num = i + 2;
                  if (ev.full)
                    extraVehicleFields.push({
                      label: `V${num}F`,
                      value: ev.full,
                    });
                  if (ev.short)
                    extraVehicleFields.push({
                      label: `V${num}`,
                      value: ev.short,
                    });
                });
              } catch {}
            }
            const fields: {
              label: string;
              value: string | null;
              shortcutId?: number;
              startsRow?: boolean;
            }[] = t
              ? [
                  { label: "TGT", value: t.tgt },
                  { label: "HBF", value: t.hbf },
                  { label: "HB", value: t.hb },
                  { label: "V1F", value: t.v1f },
                  { label: "V1", value: t.v1 ?? null },
                  ...extraVehicleFields,
                  // All shortcut-folder triggers as chips — only those with showInRs=true, exclude legacy 'D' chip
                  ...(shortcutsData ?? [])
                    .filter(
                      s => s.trigger.toUpperCase() !== "D" && !!s.showInRs
                    )
                    .map(s => ({
                      label: s.trigger.toUpperCase(),
                      value: s.expansion,
                      shortcutId: s.id,
                      startsRow: !!s.startsRow,
                    })),
                ]
              : [];
            const hasAnyField = fields.some(f => f.value);
            // The cards below word names against everything written so far,
            // including the unsaved text.
            const usedBracketCodes = usedBracketCodesWithDraft;
            const hasEntityChips = !!(entityChips && entityChips.length > 0);
            // Continuity chips — same underlying "pending" data as the RS
            // Quick Entry map popup's continuity chips (see the queries
            // above), adapted for a surface with no single selected address:
            // "Vehicle departing" and "Walked in" both use a pending
            // arrival's own already-known address, so they need no
            // placeholder; "Vehicle arriving" has no way to know a
            // not-yet-observed destination, so it uses a literal
            // "[location]" placeholder to type over — the same pattern the
            // popup already uses for "[route]", which is equally unknowable
            // in advance.
            const vehicleArrivingChips = (pendingDepartures ?? []).map(d => ({
              key: `arr-${d.rego}`,
              rego: d.rego,
              text: `Vehicle ${d.rego}, ${shortenAlreadyMentionedNames(d.occupantDesc, usedBracketCodes)}, arrived at [location]`,
            }));
            const vehicleDepartingChips = (pendingArrivals ?? []).map(a => ({
              key: `dep-${a.rego}`,
              rego: a.rego,
              text: `Vehicle ${a.rego}, ${shortenAlreadyMentionedNames(a.occupantDesc, usedBracketCodes)}, departed ${a.address} and continued via:`,
            }));
            const walkedOutChips = (pendingWalkIns ?? []).flatMap(w => {
              const arrivalsHere = (pendingArrivals ?? []).filter(
                a =>
                  a.address.trim().toLowerCase() ===
                  w.location.trim().toLowerCase()
              );
              const names = shortenAlreadyMentionedNames(
                w.names,
                usedBracketCodes
              );
              // w.route is only ever genuine route/path text (e.g. "across
              // the road") — never the destination, which would duplicate
              // the address already stated via w.location. It's empty
              // whenever the walk-in had no separate route content at all.
              return arrivalsHere.map(a => ({
                key: `wo-${w.location}-${a.rego}`,
                rego: a.rego,
                text: w.route
                  ? `${names} exited ${w.location} and walked ${w.route} towards Vehicle ${a.rego}.`
                  : `${names} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
              }));
            });
            // People on foot with no vehicle: someone who walked into a
            // location and hasn't left it can be logged leaving it for
            // another address ("[location]" and "[route]" are literal text
            // to type over, as with "Vehicle arriving"), and someone logged
            // as heading for an address can be logged entering it.
            const leftAddressChips = (pendingWalkIns ?? []).map(w => ({
              key: `la-${w.location}`,
              rego: "",
              label: w.location,
              text: `${shortenAlreadyMentionedNames(w.names, usedBracketCodes)} exited ${w.location} and walked [route] towards [location].`,
            }));
            const enteredChips = (pendingHeadingTo ?? []).map(h => ({
              key: `en-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
              rego: "",
              label: h.destination,
              text: `${shortenAlreadyMentionedNames(h.names, usedBracketCodes)} entered ${h.destination} and continued out of sight.`,
            }));
            // ── Continuity cards ────────────────────────────────────────
            // Same pending data and sentences as the chips above, grouped
            // per vehicle / group of people (see ContinuityCards).
            const rowTime = (id: number) =>
              rows?.find(r => r.id === id)?.time ?? null;
            const sinceText = (id: number) => {
              const t = rowTime(id);
              return t ? ` · since ${t}` : "";
            };
            const sameAddr = (a: string, b: string) =>
              a.trim().toLowerCase() === b.trim().toLowerCase();
            const cardAction = (
              chip: { key: string; text: string } | undefined,
              label: string
            ) => (chip ? [{ key: chip.key, label, text: chip.text }] : []);
            const continuityCards: ContinuityCardData[] = [];
            const walkInsAtVehicle = new Set<string>();
            // Everyone currently logged as inside an address or walking
            // somewhere is NOT in a vehicle, whatever the vehicle's arrival
            // row says.
            const onFootNames = [
              ...(pendingWalkIns ?? []).map(w => w.names),
              ...(pendingHeadingTo ?? []).map(h => h.names),
            ];
            // Who is in a vehicle: those its own row names, plus anyone
            // logged walking to / getting into it — and a person is only in
            // the vehicle the most recent row puts them in (see
            // vehicleOccupants).
            const allVehicleRows = [
              ...(pendingArrivals ?? []).map(a => ({
                rego: a.rego,
                rowId: a.rowId,
                names: extractOccupantNames(a.occupantDesc),
              })),
              ...(pendingDepartures ?? []).map(d => ({
                rego: d.rego,
                rowId: d.rowId,
                names: extractOccupantNames(d.occupantDesc),
              })),
            ];
            // Parked vehicles people on foot could walk to: only those at the
            // address their latest vehicle journey ended (see
            // vehiclesPeopleCanReach), not ones left behind earlier.
            const reachableVehicles = (people: string, fallbackPlace: string) =>
              vehiclesPeopleCanReach({
                people,
                arrivals: (pendingArrivals ?? []).map(a => ({
                  ...a,
                  names: extractOccupantNames(a.occupantDesc),
                })),
                placements: pendingPlacements ?? [],
                fallbackPlace,
              });
            const vehicleOccupants = (
              desc: string,
              rego: string,
              rowId: number
            ) =>
              sharedVehicleOccupants(
                { rego, rowId, names: extractOccupantNames(desc) },
                onFootNames,
                pendingPlacements ?? [],
                allVehicleRows
              );
            // Who is out of sight at an address after a vehicle arrived and
            // "continued out of sight" there (and has not since been placed
            // anywhere by a later row).
            const oosPeopleOf = (
              b: NonNullable<typeof pendingArrivals>[number]
            ) => {
              if (!b.outOfSight) return [];
              if (
                (pendingWalkIns ?? []).some(w =>
                  sameAddr(w.location, b.address)
                )
              )
                return [];
              const people = occupantsStillInVehicle(
                extractOccupantNames(b.occupantDesc),
                []
              );
              return people.filter(
                n =>
                  !(pendingPlacements ?? []).some(
                    pl =>
                      pl.rowId > b.rowId &&
                      surnameTokens(n).some(t =>
                        surnameTokens(pl.name).includes(t)
                      )
                  )
              );
            };
            (pendingArrivals ?? []).forEach(a => {
              const insideHere = (pendingWalkIns ?? []).filter(w =>
                sameAddr(w.location, a.address)
              );
              const rego = a.rego;
              const occupants = vehicleOccupants(
                a.occupantDesc,
                a.rego,
                a.rowId
              );
              const inCar = occupants.length > 0;
              // Those a later row only had walking TOWARDS the vehicle — in it
              // or next to it, the row doesn't say.
              const toNames = occupantsToVehicle(
                { rego: a.rego, rowId: a.rowId },
                occupants,
                pendingPlacements ?? []
              );
              const inNames = occupants.filter(o => !toNames.includes(o));
              // Where each sits, when the rows say — "MENON (driver)".
              const seatMap = seatsOf({
                desc: a.occupantDesc,
                descRowId: a.rowId,
                rego,
                occupants,
                placements: pendingPlacements ?? [],
              });
              const withSeat = (n: string) =>
                seatMap.has(n) ? `${n} (${seatMap.get(n)})` : n;
              // People inside this address take over the card only when
              // nobody is left in the vehicle; when some got out and others
              // stayed, the vehicle keeps its own card for those still in it
              // and the people inside get a card of their own.
              const inside = insideHere.length > 0 && !inCar;
              if (inside)
                insideHere.forEach(w => walkInsAtVehicle.add(w.location));
              // "... arrived and continued out of sight": nobody can say
              // whether anyone is still in it until someone is seen again,
              // so no walked-away / walked-in options are offered.
              // The target is then placed at the address, out of sight: the
              // next steps are to walk out to the vehicle, walk somewhere
              // else, or leave in a vehicle. Not once a later row has put
              // those people anywhere.
              const arrivalPeople = occupantsStillInVehicle(
                extractOccupantNames(a.occupantDesc),
                []
              );
              const movedOn = (pendingPlacements ?? []).some(
                pl =>
                  pl.rowId > a.rowId &&
                  arrivalPeople.some(n =>
                    surnameTokens(n).some(t =>
                      surnameTokens(pl.name).includes(t)
                    )
                  )
              );
              const outOfSight = a.outOfSight && !inside && !movedOn;
              const oosNames = shortenAlreadyMentionedNames(
                arrivalPeople.join(" and "),
                usedBracketCodes
              );
              const otherOosPeople = inside
                ? []
                : (pendingArrivals ?? [])
                    .filter(
                      o => o.rego !== a.rego && sameAddr(o.address, a.address)
                    )
                    .flatMap(oosPeopleOf);
              const carNames = shortenAlreadyMentionedNames(
                occupants.join(" and "),
                usedBracketCodes
              );
              // Everyone known to be in it, or "unseen occupant/s" when nobody
              // is — the usual wording for a departure whose occupants
              // weren't seen.
              const departingAction = {
                key: `dep-${rego}`,
                label: "Vehicle Depart",
                // Everyone known to be in it, or "unseen occupant/s" when
                // nobody is — the usual wording for a departure whose
                // occupants weren't seen.
                text: `Vehicle ${rego}, ${
                  inCar && !outOfSight
                    ? shortenAlreadyMentionedNames(
                        occupantWording(a.occupantDesc, occupants) ??
                          // Someone joined after the arrival: say where each
                          // sits when the rows say (driver, front passenger,
                          // rear passenger), else just the names.
                          seatedOccupantWording({
                            desc: a.occupantDesc,
                            descRowId: a.rowId,
                            rego,
                            occupants,
                            placements: pendingPlacements ?? [],
                          }) ??
                          carNames,
                        usedBracketCodes
                      )
                    : "unseen occupant/s"
                }, departed ${a.address} and continued via:`,
              };
              // Most likely next step first: parked with someone in it, the
              // vehicle leaves or they walk in; with someone inside the
              // address, they walk back out to it or on elsewhere.
              const actions = inside
                ? [
                    ...walkedOutChips
                      .filter(c =>
                        insideHere.some(
                          w => c.key === `wo-${w.location}-${rego}`
                        )
                      )
                      .map(c => ({
                        key: c.key,
                        label: "Walked to Vehicle",
                        text: c.text,
                      })),
                    ...insideHere.flatMap(w =>
                      cardAction(
                        leftAddressChips.find(
                          c => c.key === `la-${w.location}`
                        ),
                        "Left address"
                      )
                    ),
                    departingAction,
                  ]
                : outOfSight && arrivalPeople.length > 0
                  ? [
                      {
                        key: `wov-oos-${rego}`,
                        label: "Walked to Vehicle",
                        text: `${oosNames} exited ${a.address} and walked towards Vehicle ${rego}.`,
                      },
                      {
                        key: `la-oos-${rego}`,
                        label: "Walked away",
                        text: `${oosNames} exited ${a.address} and walked [route] towards [location].`,
                      },
                      departingAction,
                    ]
                  : otherOosPeople.length > 0
                    ? [
                        // Someone is out of sight at this address after
                        // arriving in another vehicle: he could just as well
                        // walk out to THIS one.
                        {
                          key: `wov-oos-${rego}`,
                          label: "Walked to Vehicle",
                          text: `${shortenAlreadyMentionedNames(otherOosPeople.join(" and "), usedBracketCodes)} exited ${a.address} and walked towards Vehicle ${rego}.`,
                        },
                        departingAction,
                      ]
                    : [
                        departingAction,
                        ...(inCar && !inside && !outOfSight
                          ? [
                              // Left the vehicle and walked off somewhere other
                              // than here (a car park or street space).
                              {
                                key: `wa-${rego}`,
                                label: "Walked away",
                                rego,
                                text: `${carNames} exited the vehicle and walked [route] towards [location].`,
                              },
                              {
                                key: `wi-${rego}`,
                                label: "Walked in",
                                rego,
                                text: `${carNames} exited the vehicle, walked [route], entered ${a.address} and continued out of sight.`,
                              },
                            ]
                          : []),
                      ];
              continuityCards.push({
                key: `veh-${rego}`,
                title: rego,
                pill: "Parked",
                who: inside
                  ? `${insideHere.map(w => w.names).join("; ")} inside the address`
                  : outOfSight
                    ? inCar
                      ? `${occupants.join(", ")} out of sight at the address`
                      : "Out of sight since arriving"
                    : inCar
                      ? [
                          inNames.length
                            ? `${inNames.map(withSeat).join(", ")} in the vehicle`
                            : "",
                          toNames.length
                            ? `${toNames.join(", ")} to vehicle`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("; ")
                      : "Nobody in the vehicle",
                state: `${a.address}${sinceText(a.rowId)}`,
                actions,
                latestRowId: Math.max(a.rowId, ...insideHere.map(w => w.rowId)),
                holds: [...occupants, ...insideHere.map(w => w.names)].flatMap(
                  n => surnameTokens(n)
                ),
                people: inside
                  ? insideHere.flatMap(w => splitPeopleNames(w.names))
                  : occupants,
                locus: inside
                  ? {
                      headline: `Inside ${a.address}`,
                      sub: `On foot${sinceText(Math.max(...insideHere.map(w => w.rowId)))}`,
                    }
                  : outOfSight
                    ? {
                        headline: `Out of sight at ${a.address}`,
                        sub: `Arrived in ${rego}${sinceText(a.rowId)}`,
                      }
                    : {
                        headline: inCar
                          ? inNames.length
                            ? `In ${rego}`
                            : `To vehicle ${rego}`
                          : `${rego} unattended`,
                        sub: `Parked at ${a.address}${sinceText(a.rowId)}`,
                      },
              });
            });
            // "From <place> · 09:16 PM" for a vehicle that has left and has no
            // arrival logged yet.
            const departedState = (d: {
              fromAddress?: string | null;
              rowId: number;
            }) =>
              [
                d.fromAddress ? `From ${d.fromAddress}` : "",
                rowTime(d.rowId) ?? "",
              ]
                .filter(Boolean)
                .join(" · ") || "No arrival logged yet";
            (pendingDepartures ?? []).forEach(d => {
              const chip = vehicleArrivingChips.find(c => c.rego === d.rego);
              if (!chip) return;
              // A later row saw it on the move ("... HOGAN driver and sole
              // occupant, travelled on Leach Highway ..."): where it is now,
              // on top of where it left from.
              const travelling = d.via
                ? `Travelling on ${d.via}${d.viaRowId ? ` · ${rowTime(d.viaRowId) ?? ""}` : ""}`.replace(
                    / · $/,
                    ""
                  )
                : "";
              const leftFrom = departedState(d);
              const stateLine = travelling
                ? `${travelling} — ${leftFrom.charAt(0).toLowerCase()}${leftFrom.slice(1)}`
                : leftFrom;
              continuityCards.push({
                key: `dep-${d.rego}`,
                title: d.rego,
                pill: "Departed",
                attn: true,
                who: vehicleOccupants(d.occupantDesc, d.rego, d.rowId).length
                  ? vehicleOccupants(d.occupantDesc, d.rego, d.rowId).join(", ")
                  : extractOccupantNames(d.occupantDesc) ||
                    "Occupants not seen",
                state: stateLine,
                actions: cardAction(chip, "Vehicle arriving"),
                latestRowId: Math.max(d.rowId, d.viaRowId ?? 0),
                ...(() => {
                  const inCar = vehicleOccupants(
                    d.occupantDesc,
                    d.rego,
                    d.rowId
                  );
                  return {
                    holds: inCar.flatMap(n => surnameTokens(n)),
                    people: inCar,
                    locus: travelling
                      ? {
                          headline: inCar.length
                            ? `In ${d.rego}`
                            : `Departed in ${d.rego}`,
                          sub: `${travelling} — ${leftFrom.charAt(0).toLowerCase()}${leftFrom.slice(1)}`,
                        }
                      : {
                          headline: `Departed in ${d.rego}`,
                          sub: leftFrom,
                        },
                  };
                })(),
              });
            });
            (pendingWalkIns ?? [])
              .filter(w => !walkInsAtVehicle.has(w.location))
              .forEach(w => {
                const chip = leftAddressChips.find(
                  c => c.key === `la-${w.location}`
                );
                continuityCards.push({
                  key: `foot-${w.location}`,
                  title: w.names,
                  pill: "Inside",
                  who: `Inside ${w.location}`,
                  state: `On foot${sinceText(w.rowId)}`,
                  actions: [
                    ...cardAction(chip, "Left address"),
                    // Logged at a bus stop or train station: boarding.
                    ...transitBoardActions({
                      keyBase: w.location,
                      names: shortenAlreadyMentionedNames(
                        w.names,
                        usedBracketCodes
                      ),
                      place: w.location,
                    }),
                    // Back to a parked vehicle from here.
                    ...reachableVehicles(w.names, w.location).map(a => ({
                      key: `wov-${w.location}-${a.rego}`,
                      label: `Walked to ${a.rego}`,
                      text: `${shortenAlreadyMentionedNames(w.names, usedBracketCodes)} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
                    })),
                  ],
                  latestRowId: w.rowId,
                  holds: surnameTokens(w.names),
                  people: splitPeopleNames(w.names),
                  locus: {
                    headline: `Inside ${w.location}`,
                    sub: `On foot${sinceText(w.rowId)}`,
                  },
                });
              });
            (pendingHeadingTo ?? []).forEach(h => {
              const chip = enteredChips.find(
                c =>
                  c.key ===
                  `en-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`
              );
              if (!chip) return;
              const walkers = shortenAlreadyMentionedNames(
                h.names,
                usedBracketCodes
              );
              const destKnown = !h.destination.includes("[");
              // On foot, the next step is one of: enter where they were
              // heading, walk on to somewhere else, or walk back towards a
              // vehicle that is parked.
              continuityCards.push({
                key: `head-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                title: h.names,
                pill: h.fromTransit
                  ? "Alighted"
                  : h.fromVessel
                    ? "Disembarked"
                    : "Departed on foot",
                attn: true,
                who: destKnown ? `Walking to ${h.destination}` : "On foot",
                state: `${alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`}${sinceText(h.rowId)}`,
                actions: [
                  ...cardAction(
                    chip,
                    destKnown ? "Entered" : "Entered a location"
                  ),
                  {
                    key: `in-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                    label: "Inside",
                    text: `${walkers} inside ${destKnown ? h.destination : "[location]"} [observation].`,
                  },
                  {
                    key: `wk-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                    label: "Walked to another location",
                    text: `${walkers} walked [route] towards [location].`,
                  },
                  // Heading for, or just got off at, a bus stop or train
                  // station: boarding.
                  ...transitBoardActions({
                    keyBase: `h-${h.destination}-${h.names}`,
                    names: walkers,
                    place: destKnown ? h.destination : h.from,
                  }),
                  ...reachableVehicles(h.names, h.from).map(a => ({
                    key: `wv-${a.rego}`,
                    label: `Walked to ${a.rego}`,
                    text: `${walkers} walked towards Vehicle ${a.rego}.`,
                  })),
                ],
                latestRowId: h.rowId,
                holds: surnameTokens(h.names),
                people: splitPeopleNames(h.names),
                locus: {
                  headline: (() => {
                    const how = h.fromTransit
                      ? "Alighted, on foot"
                      : h.fromVessel
                        ? "Disembarked, on foot"
                        : "Departed on foot";
                    return destKnown ? `${how} to ${h.destination}` : how;
                  })(),
                  sub: `${alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`}${sinceText(h.rowId)}`,
                },
              });
            });
            // People who got into a vehicle that has no arrival or departure
            // row of its own ("entered a gold BMW ... (Vehicle 1FAB888)"):
            // their position is where they were last logged, until a row
            // says where the vehicle went.
            {
              const logged = new Set(
                [...(pendingArrivals ?? []), ...(pendingDepartures ?? [])].map(
                  v => v.rego.toUpperCase()
                )
              );
              const byRego = new Map<
                string,
                NonNullable<typeof pendingPlacements>
              >();
              for (const p of pendingPlacements ?? []) {
                if (!p.rego || p.inside === false) continue;
                if (logged.has(p.rego.toUpperCase())) continue;
                byRego.set(p.rego, [...(byRego.get(p.rego) ?? []), p]);
              }
              byRego.forEach((ps, rego) => {
                const names = ps.map(p => p.name);
                // A vehicle with a marker on the map is at that marker; else
                // where they were last logged.
                const markerAddr = ps.find(p => p.vehicleMarker?.address)
                  ?.vehicleMarker?.address;
                const at = markerAddr
                  ? shortAddressLabel(markerAddr)
                  : ps.find(p => p.at)?.at;
                const atMarker = !!ps.find(p => p.vehicleMarker);
                const rowId = Math.max(...ps.map(p => p.rowId));
                continuityCards.push({
                  key: `vnl-${rego}`,
                  title: rego,
                  pill: "In vehicle",
                  attn: true,
                  who: `${(() => {
                    const seats = seatsOf({
                      desc: "",
                      descRowId: 0,
                      rego,
                      occupants: names,
                      placements: ps,
                    });
                    return names
                      .map(n => (seats.has(n) ? `${n} (${seats.get(n)})` : n))
                      .join(", ");
                  })()} in the vehicle`,
                  state: `${at ? `${atMarker ? "At" : "Last seen at"} ${at}` : "Position not logged"}${sinceText(rowId)}`,
                  actions: [
                    {
                      key: `vnl-dep-${rego}`,
                      label: "Vehicle departing",
                      text: `Vehicle ${rego}, ${
                        seatedOccupantWording({
                          desc: "",
                          descRowId: 0,
                          rego,
                          occupants: names,
                          placements: ps,
                        }) ?? names.join(", ")
                      }, departed ${at ?? "[location]"} and continued via:`,
                    },
                  ],
                  latestRowId: rowId,
                  holds: names.flatMap(n => surnameTokens(n)),
                  people: names,
                  locus: {
                    headline: `In ${rego}`,
                    sub: `${at ? `${atMarker ? "At" : "Last seen at"} ${at}` : "Position not logged"}${sinceText(rowId)}`,
                  },
                });
              });
            }
            // People aboard a boat or vessel ("boarded a vessel at the end of
            // the jetty"): where it is can't be told from the row, so it is
            // where they were last logged, until a row says they got off.
            {
              const byVessel = new Map<
                string,
                NonNullable<typeof pendingPlacements>
              >();
              for (const p of pendingPlacements ?? []) {
                if (!p.vessel) continue;
                const k = p.vessel.toLowerCase();
                byVessel.set(k, [...(byVessel.get(k) ?? []), p]);
              }
              byVessel.forEach((ps, vk) => {
                const vessel = ps[0].vessel ?? vk;
                const names = ps.map(p => p.name);
                const at = ps.find(p => p.at)?.at;
                const rowId = Math.max(...ps.map(p => p.rowId));
                const where = at
                  ? `Last seen at ${at}${sinceText(rowId)}`
                  : `Position not logged${sinceText(rowId)}`;
                continuityCards.push({
                  key: `vsl-${vk}`,
                  title: names.join(" and "),
                  pill: "On a vessel",
                  attn: true,
                  who: `${names.join(", ")} on ${vessel}`,
                  state: where,
                  actions: [
                    {
                      key: `vsl-off-${vk}`,
                      label: "Disembarked",
                      text: `${shortenAlreadyMentionedNames(names.join(" and "), usedBracketCodes)} disembarked from ${vessel} and walked [route] towards [location].`,
                    },
                  ],
                  latestRowId: rowId,
                  holds: names.flatMap(n => surnameTokens(n)),
                  people: names,
                  locus: { headline: `On ${vessel}`, sub: where },
                });
              });
            }
            // People aboard a bus, train or tram ("boarded a bus at Bus Stop
            // …"): until a row says they got off.
            continuityCards.push(
              ...onTransitCards({
                placements: pendingPlacements ?? [],
                sinceText,
                shorten: n => shortenAlreadyMentionedNames(n, usedBracketCodes),
              })
            );
            // The card holding the TARGET leads the band as its tracker: a
            // person's by surname, a vehicle's by its plate (shared rule:
            // trackedTarget). A location target has nothing that moves.
            const targetCode = trackedTargetCode(trackedTarget);
            const targetWho = trackedTarget?.kind === "vehicle" ? "it" : "he";
            // Safety net for phrasing the position logic doesn't read: the
            // newest row that names the target alongside a movement word
            // but matched none of the known movement phrasings. If it is
            // newer than what the tracker is based on, the position shown
            // may be stale, so say so rather than state it plainly. A row the
            // logic DID read (even one that doesn't change the card, such as
            // walking back towards a vehicle) never triggers this.
            const targetRe = targetCode
              ? new RegExp(`\\b${targetCode}\\b`, "i")
              : null;
            const knownSurnames = knownSurnamesOf(
              (rows ?? []).map(r => r.observation)
            );
            const latestMove =
              targetRe && rows
                ? rows
                    .filter(
                      r =>
                        !!r.observation &&
                        targetRe.test(r.observation) &&
                        !isReadAsMovement(r.observation, knownSurnames) &&
                        /\b(entered|exited|walked|left|arrived|departed|drove|travelled|stopped|parked|inside|seated|sitting|standing|seen|sighted|remains|remained)\b/i.test(
                          r.observation
                        )
                    )
                    .reduce<
                      NonNullable<typeof rows>[number] | null
                    >((a, b) => (!a || b.id > a.id ? b : a), null)
                : null;
            const staleWarn = (basedOnRowId: number) =>
              latestMove && latestMove.id > basedOnRowId
                ? `The ${latestMove.time ?? "latest"} row names ${targetCode} after this, but wasn't read as a move — check where ${targetWho} is.`
                : undefined;
            if (targetCode && continuityCards.length > 0) {
              const targetKey = pickSubjectCardKey(
                continuityCards,
                trackedTarget
              );
              const held = continuityCards.find(c => c.key === targetKey);
              if (held) {
                held.isTarget = true;
                held.warn = staleWarn(held.latestRowId);
                held.companions = subjectCompanions(
                  held.people ?? [],
                  trackedTarget
                ).join(", ");
                // Took over from another sheet: say where the picture came from.
                if (surveillance?.handover && held.locus)
                  held.locus = {
                    ...held.locus,
                    sub: `${held.locus.sub} · Handed over from ${surveillance.handover.title}`,
                  };
              } else {
                // Cards exist but none names him: say so rather than leave
                // the band looking as if it were about someone else.
                continuityCards.push({
                  key: "target-not-located",
                  title: targetCode,
                  pill: "Not located",
                  attn: true,
                  who: "Position not logged",
                  state: `No logged movement names ${targetCode} yet`,
                  actions: [],
                  latestRowId: Number.MAX_SAFE_INTEGER,
                  isTarget: true,
                  warn: staleWarn(0),
                  locus: {
                    headline: "Position not logged",
                    sub: `No logged movement names ${targetCode} yet`,
                  },
                });
              }
            }
            // Every member of the team has ceased: the live cards give way to
            // one grey card saying so, with the last place he was seen.
            if (surveillance?.ended) {
              continuityCards.length = 0;
              continuityCards.push(
                endedContinuityCard({
                  who: targetCode ?? "Team",
                  time: surveillance.endedAtTime,
                  position: targetPosition,
                })
              );
            }
            // Tapping a card action adds the sentence as its own row, stamped
            // with the current (Perth) time — so the time of the event is
            // captured the moment it happens — and it can be edited like any
            // other row afterwards. Falls back to inserting the text (the
            // old behaviour) when that would be wrong: offline (the offline
            // queue doesn't carry observation text) or on a sheet dated for
            // a different day than today.
            // Types text into a controlled textarea so React sees it (same
            // execCommand / native-setter approach insertAtFocused uses).
            const typeInto = (
              el: HTMLTextAreaElement | HTMLInputElement,
              insert: string
            ) => {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              try {
                document.execCommand("insertText", false, insert);
              } catch {
                const setter =
                  Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                  )?.set ||
                  Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                  )?.set;
                if (setter) {
                  setter.call(
                    el,
                    el.value.slice(0, start) + insert + el.value.slice(end)
                  );
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            };
            // The observation cell that is open for editing right now, if
            // any. focusedTextareaRef also remembers cells that have since
            // closed, so it must still be attached and the active element.
            const openObservationCell = (): HTMLTextAreaElement | null => {
              const el = focusedTextareaRef.current;
              return el &&
                el.tagName === "TEXTAREA" &&
                el.isConnected &&
                document.activeElement === el
                ? (el as HTMLTextAreaElement)
                : null;
            };
            const addContinuityEntry = (text: string) => {
              // Rule 1: a cell is open → the sentence goes into it as the
              // next paragraph, at the end of what's already written.
              const open = openObservationCell();
              if (open) {
                const v = open.value;
                const lead = !v
                  ? ""
                  : v.endsWith("\n\n")
                    ? ""
                    : v.endsWith("\n")
                      ? "\n"
                      : "\n\n";
                open.focus();
                open.setSelectionRange(v.length, v.length);
                typeInto(open, lead + text);
                return;
              }
              // Rule 2: no cell open → it becomes its own row. Vehicles stay
              // written as plain "Vehicle 1ORB419", exactly as the cards
              // phrase them.
              const perth = (opts: Intl.DateTimeFormatOptions) =>
                new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Australia/Perth",
                  ...opts,
                }).formatToParts(new Date());
              const part = (
                parts: Intl.DateTimeFormatPart[],
                type: string
              ): string => parts.find(p => p.type === type)?.value ?? "";
              const d = perth({
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const todayYmd = `${part(d, "year")}-${part(d, "month")}-${part(d, "day")}`;
              const forToday =
                !sheet?.sheetDate || sheet.sheetDate === todayYmd;
              if (!isOnline || !forToday) {
                insertAtFocused(text);
                if (!forToday) {
                  toast.info(
                    "This sheet is dated for another day, so the text was added to the row you're editing instead."
                  );
                }
                return;
              }
              const t = perth({
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const h24 = parseInt(part(t, "hour"), 10) % 24;
              const min = parseInt(part(t, "minute"), 10);
              const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
              const timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
              _addRowOnline
                .mutateAsync({
                  sheetId,
                  time: timeStr,
                  timeMinutes: h24 * 60 + min,
                  observation: text,
                })
                .then(created => {
                  // Leave the new row open, so the next tap adds to it as the
                  // next paragraph.
                  setJustAddedRowId(created.id);
                  // If the row never appears to open (e.g. it is locked), do
                  // not leave the request lying in wait.
                  setTimeout(() => setJustAddedRowId(null), 6000);
                  toast.success(`Added ${timeStr}`, {
                    description: "Edit it any time from the row.",
                    duration: 9000,
                    action: {
                      label: "Undo",
                      onClick: () =>
                        _deleteRowOnline.mutate({ id: created.id }),
                    },
                  });
                })
                .catch(() => {
                  /* the mutation's own onError already showed the message */
                });
            };
            const hasContinuityChips = continuityCards.length > 0;
            const insertAtFocused = (text: string) => {
              const el = focusedTextareaRef.current;
              if (!el) return;
              el.focus();
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              const before = el.value.slice(0, start);
              const after = el.value.slice(end);
              const insert =
                before && !before.endsWith(" ") ? ` ${text}` : text;
              try {
                document.execCommand("insertText", false, insert);
              } catch {
                const nativeInputValueSetter =
                  Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                  )?.set ||
                  Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                  )?.set;
                if (nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, before + insert + after);
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            };
            const showTargetPanel = !!(
              (sheet?.targetId && assignedTarget) ||
              (entityChips && entityChips.length > 0)
            );
            return (
              <>
                {showTargetPanel && (
                  <div className="mb-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                    {/* Header — always visible. Tapping the main area toggles collapse; pencil navigates to edit */}
                    <div className="flex items-center">
                      <button
                        className="flex-1 flex items-center gap-2 px-4 py-3 bg-muted/60 hover:bg-muted active:bg-muted transition-colors select-none text-left min-w-0"
                        onClick={() =>
                          setTargetPanelExpanded(v => {
                            const next = !v;
                            try {
                              localStorage.setItem(
                                "runsheet_target_panel_expanded",
                                String(next)
                              );
                            } catch {}
                            return next;
                          })
                        }
                      >
                        {hasTarget ? (
                          <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-[13px] font-bold uppercase tracking-wide text-foreground truncate flex-1">
                          {hasTarget ? `TARGET — ${t!.name}` : "SHORTCUTS"}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${targetPanelExpanded ? "" : "-rotate-90"}`}
                        />
                      </button>
                      {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
                      {hasTarget && (
                        <button
                          className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border bg-muted/60 hover:bg-muted rounded-tr-lg"
                          onClick={() =>
                            navigate(
                              `/operation/${sheet!.operationId}?tab=target&targetId=${t!.id}&fromSheet=${sheetId}`
                            )
                          }
                          title="Edit Target"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Collapsible details */}
                    {targetPanelExpanded &&
                      (() => {
                        // Shortcut chips follow the Shortcuts page order; the
                        // target's own chips (HBF, vehicles, TGT, HB) are a
                        // fixed block straight after SC (shared/rsChips.ts).
                        const orderedFields = orderRsChips(
                          fields.filter(f => f.value),
                          (shortcutsData ?? []).map(s => s.trigger)
                        );
                        return (
                          <div className="px-4 pb-3 border-t border-border/40">
                            {hasAnyField &&
                              (() => {
                                const shortcutFolderLabels = new Set(
                                  (shortcutsData ?? []).map(s =>
                                    s.trigger.toUpperCase()
                                  )
                                );
                                const TRIGGER_ONLY_LABELS = new Set([
                                  "TGT",
                                  "HBF",
                                  "HB",
                                  "V1F",
                                  "V2F",
                                ]);
                                return (
                                  <>
                                    <div className="flex flex-wrap gap-1.5 pt-2">
                                      {orderedFields.map(f => {
                                        const insertIntoFocused = () => {
                                          const el = focusedTextareaRef.current;
                                          if (el) {
                                            el.focus();
                                            const start =
                                              el.selectionStart ??
                                              el.value.length;
                                            const end =
                                              el.selectionEnd ??
                                              el.value.length;
                                            const before = el.value.slice(
                                              0,
                                              start
                                            );
                                            const after = el.value.slice(end);
                                            const insert =
                                              before && !before.endsWith(" ")
                                                ? ` ${f.value!}`
                                                : f.value!;
                                            try {
                                              document.execCommand(
                                                "insertText",
                                                false,
                                                insert
                                              );
                                            } catch {
                                              const nativeInputValueSetter =
                                                Object.getOwnPropertyDescriptor(
                                                  window.HTMLTextAreaElement
                                                    .prototype,
                                                  "value"
                                                )?.set ||
                                                Object.getOwnPropertyDescriptor(
                                                  window.HTMLInputElement
                                                    .prototype,
                                                  "value"
                                                )?.set;
                                              if (nativeInputValueSetter) {
                                                nativeInputValueSetter.call(
                                                  el,
                                                  before + insert + after
                                                );
                                                el.dispatchEvent(
                                                  new Event("input", {
                                                    bubbles: true,
                                                  })
                                                );
                                              }
                                            }
                                          }
                                        };
                                        const isVnShort = /^V\d+$/.test(
                                          f.label
                                        );
                                        const isVnFull = /^V\d+F$/.test(
                                          f.label
                                        );
                                        const isStandard =
                                          !isVnShort &&
                                          (shortcutFolderLabels.has(f.label) ||
                                            TRIGGER_ONLY_LABELS.has(f.label) ||
                                            isVnFull);
                                        return (
                                          <ShortcutChip
                                            key={f.label}
                                            label={f.label}
                                            value={f.value}
                                            showValue={isVnShort || !isStandard}
                                            onInsert={() =>
                                              f.startsRow &&
                                              f.shortcutId !== undefined &&
                                              isOnline
                                                ? ownRowShortcut.press(
                                                    {
                                                      sheetId,
                                                      shortcutId: f.shortcutId,
                                                      label: f.label,
                                                    },
                                                    insertIntoFocused
                                                  )
                                                : insertIntoFocused()
                                            }
                                          />
                                        );
                                      })}
                                      {/* Cease — last of the chips, in the same
                                          look. Press it for the ceased row. */}
                                      {ceaseAvailable && (
                                        <CeaseRowButton
                                          sheetId={sheetId}
                                          getPlace={ceasePlace}
                                          onChanged={invalidateRows}
                                          onOpenForTyping={ceaseOpenForTyping}
                                        />
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            {/* Entity chips — quick-insert shortcuts mined from this sheet's own
                        observations (surname / short address / vehicle rego), one line
                        under the fixed chips above, shared across every officer viewing
                        the sheet since they come from the server, not a per-device setting. */}
                            {hasEntityChips && (
                              <div className="flex flex-wrap gap-1.5 pt-2">
                                {entityChips!.map(chip => {
                                  const insertIntoFocused = () => {
                                    const el = focusedTextareaRef.current;
                                    if (!el) return;
                                    el.focus();
                                    const start =
                                      el.selectionStart ?? el.value.length;
                                    const end =
                                      el.selectionEnd ?? el.value.length;
                                    const before = el.value.slice(0, start);
                                    const after = el.value.slice(end);
                                    const insert =
                                      before && !before.endsWith(" ")
                                        ? ` ${chip.insertValue}`
                                        : chip.insertValue;
                                    try {
                                      document.execCommand(
                                        "insertText",
                                        false,
                                        insert
                                      );
                                    } catch {
                                      const nativeInputValueSetter =
                                        Object.getOwnPropertyDescriptor(
                                          window.HTMLTextAreaElement.prototype,
                                          "value"
                                        )?.set ||
                                        Object.getOwnPropertyDescriptor(
                                          window.HTMLInputElement.prototype,
                                          "value"
                                        )?.set;
                                      if (nativeInputValueSetter) {
                                        nativeInputValueSetter.call(
                                          el,
                                          before + insert + after
                                        );
                                        el.dispatchEvent(
                                          new Event("input", { bubbles: true })
                                        );
                                      }
                                    }
                                  };
                                  return (
                                    <button
                                      key={chip.key}
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={insertIntoFocused}
                                      title={`Insert: ${chip.insertValue}`}
                                      className="inline-flex items-center px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none cursor-pointer"
                                    >
                                      {targetPosition?.place &&
                                        samePlace(
                                          chip.insertValue,
                                          targetPosition.place
                                        ) && (
                                          <span
                                            className="mr-1 text-xs"
                                            title={`Target ${targetPosition.label}`}
                                          >
                                            {targetEmoji(
                                              targetPosition.state,
                                              targetPosition.transitMode
                                            )}
                                          </span>
                                        )}
                                      <span className="text-xs font-mono font-bold max-w-[140px] truncate">
                                        {chip.insertValue}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                )}
                {/* Continuity cards sit between the chip panel and the rows,
                    and show whether or not the panel above is expanded. */}
                {hasContinuityChips && trackingSettings.tracking && (
                  <div className={showTargetPanel ? "mb-4 -mt-2" : "mb-4"}>
                    <ContinuityCards
                      busy={_addRowOnline.isPending}
                      cards={continuityCards}
                      dismissed={continuityDismissed}
                      onDismiss={(key, rowId) =>
                        setContinuityDismissal.mutate({ sheetId, key, rowId })
                      }
                      onRestore={key =>
                        setContinuityDismissal.mutate({
                          sheetId,
                          key,
                          rowId: null,
                        })
                      }
                      onAction={(text, _mode, rego) =>
                        addContinuityEntry(
                          fillRoute(text, rego, [
                            ...[...(rows ?? [])]
                              .sort(
                                (a, b) =>
                                  (a.rowNumber ?? 0) - (b.rowNumber ?? 0)
                              )
                              .map(r => r.observation),
                            // What is typed in the open box right now.
                            openObservationCell()?.value,
                          ])
                        )
                      }
                    />
                  </div>
                )}
              </>
            );
          })()}

        {/* Search bar + sort toggle + add row — stays at the top of the
            screen while the rows scroll underneath (the page's one scroll
            container is <main>, see DashboardLayout). A solid ground and a
            thin line under it keep the rows from showing through. */}
        <div
          data-testid="sheet-toolbar"
          className="sticky top-0 z-30 -mx-1 mb-3 flex items-center gap-2 border-b border-border bg-background px-1 py-2"
        >
          {/* Add Row — moved here, left of sort toggle, hidden when sheet is closed or read-only */}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => addRow.mutate({ sheetId })}
              disabled={addRow.isPending}
            >
              <Plus className="w-4 h-4" />
              Add<span className="hidden sm:inline"> Row</span>
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`shrink-0 ${sortReversed ? "border-primary text-primary" : ""}`}
                onClick={toggleSortReversed}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {sortReversed
                ? "Showing newest first — click to show oldest first"
                : "Showing oldest first — click to show newest first"}
            </TooltipContent>
          </Tooltip>
          {/* Undo last edit — laptop/iPad only, hidden on mobile */}
          {canEdit && undoStack.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 hidden sm:inline-flex"
                  onClick={handleUndo}
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo last edit</TooltipContent>
            </Tooltip>
          )}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by time, observation, or CIN…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="md:rounded-xl md:border md:border-border overflow-hidden md:bg-card">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  No rows yet. Click "Add Row" to begin.
                </p>
              </div>
            ) : (
              <table className="running-sheet-table running-sheet-cards w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="w-32">Time</th>
                    <th>Observation</th>
                    <th className="w-28">CIN</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && searchQuery ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-12 text-center text-sm text-muted-foreground italic"
                      >
                        No rows match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.reduce(
                      (
                        acc: React.ReactNode[],
                        row: NonNullable<typeof rows>[0],
                        idx: number
                      ) => {
                        // ── Date-divider: insert a separator row when the day offset changes ──
                        // In ascending order: divider goes BEFORE the first day-N row.
                        // In reversed order: divider goes AFTER the last day-N row (i.e. before
                        // the current row which belongs to an earlier day).
                        if (row.timeMinutes != null) {
                          const prevTimedRow = [...filteredRows]
                            .slice(0, idx)
                            .reverse()
                            .find(
                              (r: NonNullable<typeof rows>[0]) =>
                                r.timeMinutes != null
                            );
                          if (prevTimedRow) {
                            const prevDay =
                              rowDayOffsetMap.get(prevTimedRow.id) ?? 0;
                            const curDay = rowDayOffsetMap.get(row.id) ?? 0;
                            if (curDay !== prevDay) {
                              // The divider label always shows the HIGHER day (the later calendar day)
                              const laterDay = Math.max(prevDay, curDay);
                              // Prefer an explicit rowDate from a row on that day
                              const rowOnLaterDay = filteredRows.find(
                                (r: NonNullable<typeof rows>[0]) =>
                                  (rowDayOffsetMap.get(r.id) ?? 0) ===
                                    laterDay && (r as any).rowDate
                              );
                              let label: string;
                              if (
                                rowOnLaterDay &&
                                (rowOnLaterDay as any).rowDate
                              ) {
                                label = formatPerthDateLabel(
                                  (rowOnLaterDay as any).rowDate as string
                                );
                              } else if (sheet?.sheetDate) {
                                label = formatPerthDateLabel(
                                  addDaysToYmd(sheet.sheetDate, laterDay)
                                );
                              } else {
                                const sheetStartMs = sheet?.createdAt
                                  ? new Date(sheet.createdAt).getTime()
                                  : Date.now();
                                const labelDate = new Date(
                                  sheetStartMs + laterDay * 24 * 60 * 60 * 1000
                                );
                                label = labelDate
                                  .toLocaleDateString("en-AU", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    timeZone: PERTH_TIME_ZONE,
                                  })
                                  .toUpperCase();
                              }
                              const dividerRow = (
                                <tr
                                  key={`divider-${row.id}`}
                                  className="date-divider-row"
                                >
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-px bg-border" />
                                      <span className="text-xs font-semibold tracking-widest text-muted-foreground whitespace-nowrap">
                                        {label}
                                      </span>
                                      <div className="flex-1 h-px bg-border" />
                                    </div>
                                  </td>
                                </tr>
                              );
                              // Always insert divider before the current row.
                              // In ascending: divider sits above the first day-N row.
                              // In reversed: the reduce sees rows newest-first, so the day
                              // boundary is detected when we hit the first lower-day row;
                              // inserting the divider before that row places it correctly
                              // between the higher-day rows above and lower-day rows below.
                              acc.push(dividerRow);
                            }
                          }
                        }
                        acc.push(
                          <tr
                            key={row.id}
                            id={`sheet-row-${row.id}`}
                            className={
                              row.isLocked ? "row-locked" : "hover:bg-accent/20"
                            }
                          >
                            {/* Time */}
                            <td>
                              <TimePickerCell
                                value={row.time}
                                locked={row.isLocked || !canEdit}
                                dayOffset={(row as any).dayOffset ?? 0}
                                rowDate={(row as any).rowDate ?? null}
                                inferredRowDate={(() => {
                                  if (!sheetHasCrossedMidnight) return null;
                                  // Compute inferred date from day offset +
                                  // the sheet's picker date (falling back to
                                  // creation date only for legacy sheets with
                                  // no sheetDate).
                                  const dayOff =
                                    rowDayOffsetMap.get(row.id) ?? 0;
                                  if (sheet?.sheetDate) {
                                    return addDaysToYmd(
                                      sheet.sheetDate,
                                      dayOff
                                    );
                                  }
                                  const sheetStartMs = sheet?.createdAt
                                    ? new Date(sheet.createdAt).getTime()
                                    : Date.now();
                                  const d = new Date(
                                    sheetStartMs + dayOff * 86400000
                                  );
                                  return new Intl.DateTimeFormat("en-CA", {
                                    timeZone: PERTH_TIME_ZONE,
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                  }).format(d);
                                })()}
                                sheetHasCrossedMidnight={
                                  sheetHasCrossedMidnight
                                }
                                sheetDate={sheet?.sheetDate ?? null}
                                sheetCreatedAt={
                                  sheet?.createdAt
                                    ? new Date(sheet.createdAt).getTime()
                                    : null
                                }
                                onSave={(display, mins, dayOff, rd) =>
                                  updateRow.mutate({
                                    id: row.id,
                                    time: display,
                                    timeMinutes: mins,
                                    dayOffset: dayOff,
                                    rowDate: rd,
                                  })
                                }
                              />
                            </td>

                            {/* Observation — reserves ~2 blank lines below
                              the text so rows read with breathing room
                              between them, on screen and not just in the
                              printed/exported sheet. Uses an inline style
                              rather than the pb-10 utility class: the
                              global ".running-sheet-table td" rule in
                              index.css sets its own "padding" shorthand
                              (including padding-bottom), and that selector
                              (class+element) has higher CSS specificity
                              than a bare Tailwind utility class, so pb-10
                              was silently losing to it and never actually
                              applying — confirmed as a real, reported bug,
                              not just a theoretical risk. An inline style
                              always wins regardless of selector
                              specificity, so don't "clean this up" back to
                              a className without re-checking that. */}
                            <td style={{ paddingBottom: "2.5rem" }}>
                              {tvLoadingRowId === row.id ? (
                                <div className="flex items-center gap-2 py-2 px-1 text-sm text-muted-foreground">
                                  <svg
                                    className="animate-spin h-4 w-4 shrink-0"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                    />
                                  </svg>
                                  Fetching route streets…
                                </div>
                              ) : (
                                <EditableCell
                                  value={row.observation}
                                  rowId={row.id}
                                  autoEdit={justAddedRowId === row.id}
                                  autoEditKeyboard={justAddedKeyboard}
                                  onAutoEdited={() => {
                                    setJustAddedRowId(null);
                                    setJustAddedKeyboard(false);
                                  }}
                                  locked={row.isLocked || !canEdit}
                                  multiline
                                  placeholder="Enter observation…"
                                  onSave={val => {
                                    // ── TV trigger: detect case-insensitive "tv" as the entire cell value ──
                                    if (val.trim().toLowerCase() === "tv") {
                                      // Find this row's index in filteredRows
                                      const rowIdx = filteredRows.findIndex(
                                        (r: NonNullable<typeof rows>[0]) =>
                                          r.id === row.id
                                      );
                                      if (rowIdx < 0) {
                                        updateRowWithDupeCheck({
                                          id: row.id,
                                          observation: val,
                                        });
                                        return;
                                      }
                                      // Get the row immediately before and after in the display list
                                      const prevRow =
                                        rowIdx > 0
                                          ? filteredRows[rowIdx - 1]
                                          : null;
                                      const nextRow =
                                        rowIdx < filteredRows.length - 1
                                          ? filteredRows[rowIdx + 1]
                                          : null;
                                      if (!prevRow || !nextRow) {
                                        toast.error(
                                          "TV auto-fill: no surrounding rows found. Add a departing row above and arriving row below first."
                                        );
                                        updateRowWithDupeCheck({
                                          id: row.id,
                                          observation: val,
                                        });
                                        return;
                                      }
                                      // Extract address text from surrounding observation cells.
                                      // The observation text is a full sentence like:
                                      //   "Vehicle 1ICW519 STROP driver and sole occupant, departed 27 Olding Way, MELVILLE WA (27 Olding Way)"
                                      // Strategy (in priority order):
                                      //   1. Bracket code at end of text: "(27 Olding Way)" → "27 Olding Way"
                                      //   2. Street number pattern anywhere in text: "27 Olding Way" extracted from sentence
                                      //   3. "departed <Name>"/"arrived at <Name>" clause — a bare business/
                                      //      location name with no house number (e.g. "departed Attadale
                                      //      Kitchen and continued via:") — isolates just the name so the
                                      //      enrichment lookup below can actually find it. Without this the
                                      //      whole noisy sentence fell through to step 4 and got sent to
                                      //      Google's geocoder as-is, which only "worked" by luck when the
                                      //      business happened to be famous enough (a Bunnings, a well-known
                                      //      cafe) for Google's fuzzy matching to find it buried in the noise
                                      //      — a real but less-indexed business (e.g. a small local cafe)
                                      //      geocoded to a wrong, unrelated street instead.
                                      //   4. Full first line as last resort
                                      const prevObs = prevRow.observation ?? "";
                                      const nextObs = nextRow.observation ?? "";

                                      const extractAddressFromObs = (
                                        obs: string
                                      ): string => {
                                        if (!obs) return "";
                                        // 1. Bracket code at end: (27 Olding Way)
                                        const bracketMatch =
                                          obs.match(/\(([^)]{3,80})\)\s*$/);
                                        if (bracketMatch)
                                          return bracketMatch[1].trim();
                                        // 2. Street number pattern: digits followed by street name.
                                        //    Matches things like "27 Olding Way", "131A Lakey Street", "3/12 Smith St".
                                        //    Extra words must also be capitalised so this stops at the street name
                                        //    instead of swallowing trailing sentence text like "and continued via"
                                        //    (lowercase words never continue a street name).
                                        const streetMatch = obs.match(
                                          /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/
                                        );
                                        if (streetMatch)
                                          return streetMatch[1].trim();
                                        // 3. "departed <Name>" / "arrived at <Name>" clause — a bare
                                        //    business/location name, no house number. Stops at the next
                                        //    clause boundary (comma, full stop, "and", or end of string).
                                        const clauseMatch = obs.match(
                                          /\b(?:departed|arrived at)\s+([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,5})(?=\s*(?:,|\.|;|:|and\b|$))/
                                        );
                                        if (clauseMatch)
                                          return clauseMatch[1].trim();
                                        // 4. Last resort: full text (server will try to geocode it)
                                        return obs.split("\n")[0].trim();
                                      };

                                      // A bare street mention like "departed 45 Scott Street and continued
                                      // via:" has no suburb, which Google's geocoder often can't resolve on
                                      // its own. Scan every row in the sheet for a bracketed full address
                                      // sighting of the same street (e.g. "45 Scott Street, KOONGAMIA WA (45
                                      // Scott Street)") and prefer that — same enrichment the RS Map feature
                                      // already does for its own address matching.
                                      const knownAddressMap = new Map<
                                        string,
                                        string
                                      >();
                                      const bracketedAddrRe =
                                        /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3},\s*[A-Z][A-Z ]{1,30}(?:\s+WA)?)\s*\(([^)]{3,80})\)/g;
                                      for (const r of filteredRows) {
                                        if (!r.observation) continue;
                                        bracketedAddrRe.lastIndex = 0;
                                        let m: RegExpExecArray | null;
                                        while (
                                          (m = bracketedAddrRe.exec(
                                            r.observation
                                          )) !== null
                                        ) {
                                          const key = m[2].trim().toLowerCase();
                                          if (!knownAddressMap.has(key))
                                            knownAddressMap.set(
                                              key,
                                              m[1].trim()
                                            );
                                        }
                                      }
                                      // Exact match first (the common case once extractAddressFromObs
                                      // isolates the name cleanly); falls back to a substring search so an
                                      // imperfectly-isolated candidate (e.g. step 4's whole-line fallback)
                                      // still finds a known name buried inside it, rather than sending the
                                      // raw noisy sentence to Google and hoping its fuzzy matching gets
                                      // lucky. Guarded to keys of 4+ characters to avoid a short/common
                                      // name spuriously matching unrelated text.
                                      const enrichAddress = (
                                        addr: string
                                      ): string => {
                                        const lower = addr.toLowerCase();
                                        const exact =
                                          knownAddressMap.get(lower);
                                        if (exact) return exact;
                                        const substringMatch = Array.from(
                                          knownAddressMap.entries()
                                        ).find(
                                          ([key]) =>
                                            key.length > 3 &&
                                            lower.includes(key)
                                        );
                                        if (substringMatch)
                                          return substringMatch[1];
                                        return addr;
                                      };

                                      const departAddr = enrichAddress(
                                        extractAddressFromObs(prevObs)
                                      );
                                      const arriveAddr = enrichAddress(
                                        extractAddressFromObs(nextObs)
                                      );
                                      if (!departAddr || !arriveAddr) {
                                        toast.error(
                                          "TV auto-fill: could not extract addresses from surrounding rows."
                                        );
                                        updateRowWithDupeCheck({
                                          id: row.id,
                                          observation: val,
                                        });
                                        return;
                                      }
                                      // Show spinner and call the server
                                      setTvLoadingRowId(row.id);
                                      getTravelledViaStreets.mutate(
                                        {
                                          departAddress: departAddr,
                                          arriveAddress: arriveAddr,
                                          // Pass full observation text so server can extract
                                          // the correct suburb directly from the text
                                          departObsText: prevObs,
                                          arriveObsText: nextObs,
                                        },
                                        {
                                          onSuccess: data => {
                                            setTvLoadingRowId(null);
                                            updateRowWithDupeCheck({
                                              id: row.id,
                                              observation: data.streets,
                                            });
                                            toast.success(
                                              "Travelled via streets auto-filled"
                                            );
                                            // TV means the whole team travelled together — auto-add any
                                            // roster CINs not already on this row, sequenced the same way
                                            // as the "★ Add all team CINs" dropdown option below.
                                            if (rosterCinList.length > 0) {
                                              const existingNames = new Set(
                                                row.members.map(
                                                  m => m.memberName
                                                )
                                              );
                                              const missingCins =
                                                rosterCinList.filter(
                                                  cin => !existingNames.has(cin)
                                                );
                                              const addSequentially = (
                                                cins: string[],
                                                idx: number
                                              ) => {
                                                if (idx >= cins.length) return;
                                                addMember.mutate({
                                                  rowId: row.id,
                                                  memberName: cins[idx],
                                                });
                                                setTimeout(
                                                  () =>
                                                    addSequentially(
                                                      cins,
                                                      idx + 1
                                                    ),
                                                  80
                                                );
                                              };
                                              addSequentially(missingCins, 0);
                                            }
                                          },
                                          onError: () => {
                                            setTvLoadingRowId(null);
                                            // Error toast already shown by mutation onError
                                            updateRowWithDupeCheck({
                                              id: row.id,
                                              observation: val,
                                            });
                                          },
                                        }
                                      );
                                      return;
                                    }
                                    // Normal save
                                    updateRowWithDupeCheck({
                                      id: row.id,
                                      observation: val,
                                    });
                                  }}
                                  shortcuts={shortcutMap}
                                  usedBracketCodes={usedBracketCodes}
                                  usedVehicleRegos={usedVehicleRegos}
                                  usedAddressLabels={usedAddressLabels}
                                />
                              )}
                              <ObservationAttachments
                                row={row}
                                canEdit={canEdit && !row.isLocked}
                                onUpload={(rowId, blob, mimeType, fileName) =>
                                  uploadAttachment.mutateAsync({
                                    rowId,
                                    blob,
                                    mimeType,
                                    fileName,
                                  })
                                }
                                onDelete={id => deleteAttachment.mutate({ id })}
                                uploading={uploadAttachment.isPending}
                                deletePending={deleteAttachment.isPending}
                                operationId={sheet?.operationId}
                              />
                            </td>

                            {/* CIN / Certify */}
                            <td>
                              <CinCertifyCell
                                row={row}
                                canEdit={canEdit}
                                canCertify={canCertify}
                                onAddMember={(rowId, name) =>
                                  addMember.mutate({ rowId, memberName: name })
                                }
                                onRemoveMember={(id, rowId) => {
                                  const rowData = rows?.find(
                                    r => r.id === rowId
                                  );
                                  if (rowData?.isLocked) {
                                    // Row is locked — uncertify all first, then remove
                                    uncertifyAll.mutate(
                                      { rowId },
                                      {
                                        onSuccess: () =>
                                          removeMember.mutate({ id, rowId }),
                                      }
                                    );
                                  } else {
                                    removeMember.mutate({ id, rowId });
                                  }
                                }}
                                onCertify={(rowId, memberId) =>
                                  certify.mutate({ rowId, memberId })
                                }
                                onUncertify={(rowId, memberId) =>
                                  uncertify.mutate({ rowId, memberId })
                                }
                                onUncertifyAll={rowId =>
                                  uncertifyAll.mutate({ rowId })
                                }
                                onDeleteRow={
                                  canCertify
                                    ? rowId => {
                                        if (confirm("Delete this row?"))
                                          deleteRow.mutate({ id: rowId });
                                      }
                                    : undefined
                                }
                                rosterCins={rosterCinList}
                              />
                            </td>
                          </tr>
                        );
                        return acc;
                      },
                      [] as React.ReactNode[]
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--certified-color)]" />
            Certified
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[var(--certified-color)]" />
            Row locked (all members certified)
          </div>
          {canCertify && (
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Click to certify a member
            </div>
          )}
        </div>
      </div>
      {/* Edit Sheet Title Dialog */}
      <Dialog open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sheet Details</DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={editSheetDate}
                onChange={e => setEditSheetDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                The sheet's title is generated automatically from this date, the
                author, operation and target.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Target
              </label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (editSelectedTargetId === t.id) {
                        setEditSelectedTargetId(null);
                        setEditTargetMode("none");
                      } else {
                        setEditSelectedTargetId(t.id);
                        setEditTargetMode("link");
                      }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      editSelectedTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">
                      {t.name}
                    </span>
                    {editSelectedTargetId === t.id && (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    )}
                  </button>
                ))}

                {/* Link Existing search panel */}
                {editTargetMode === "link" && editSelectedTargetId === null && (
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="relative flex-1">
                        <Input
                          autoFocus
                          className="h-8 w-full pr-8 text-sm"
                          placeholder="Search by name, TGT code or operation…"
                          value={editTargetSearch}
                          onChange={e => setEditTargetSearch(e.target.value)}
                        />
                        <ClearInputButton
                          value={editTargetSearch}
                          onClear={() => setEditTargetSearch("")}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => {
                          setEditTargetMode("none");
                          setEditTargetSearch("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = editTargetSearch.toLowerCase();
                        return (
                          t.name.toLowerCase().includes(q) ||
                          (t.tgt ?? "").toLowerCase().includes(q) ||
                          (t.operationName ?? "").toLowerCase().includes(q)
                        );
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {editTargetSearch
                            ? "No matching targets"
                            : "Start typing to search"}
                        </p>
                      ) : (
                        (allTargetsForSheet ?? [])
                          .filter(t => {
                            const q = editTargetSearch.toLowerCase();
                            return (
                              t.name.toLowerCase().includes(q) ||
                              (t.tgt ?? "").toLowerCase().includes(q) ||
                              (t.operationName ?? "").toLowerCase().includes(q)
                            );
                          })
                          .map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                              onClick={() => {
                                setEditSelectedTargetId(t.id);
                                setEditTargetSearch("");
                                setEditTargetMode("link");
                              }}
                            >
                              <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {t.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t.tgt ? (
                                    <span className="font-mono mr-2">
                                      TGT: {t.tgt}
                                    </span>
                                  ) : null}
                                  {t.operationName ? (
                                    <span>Op: {t.operationName}</span>
                                  ) : null}
                                </p>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip (not from operation) */}
                {editTargetMode === "link" &&
                  editSelectedTargetId !== null &&
                  !(operationTargets ?? []).find(
                    t => t.id === editSelectedTargetId
                  ) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                      <Target className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">
                        {
                          (allTargetsForSheet ?? []).find(
                            t => t.id === editSelectedTargetId
                          )?.name
                        }
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditSelectedTargetId(null);
                          setEditTargetMode("none");
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                {/* Action buttons */}
                {!(
                  editTargetMode === "link" && editSelectedTargetId === null
                ) && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setEditCreateTargetDialogOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setEditTargetMode("link");
                        setEditSelectedTargetId(null);
                        setEditTargetSearch("");
                      }}
                    >
                      <Search className="w-3.5 h-3.5" /> Link Existing
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Delete button — bottom left, admin only */}
            {user?.role === "admin" && (
              <Button
                variant="ghost"
                className="sm:mr-auto text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                disabled={deleteSheet.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Move "${sheet?.title}" to the Recycle Bin? It can be restored from there.`
                    )
                  ) {
                    deleteSheet.mutate({ id: sheetId });
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleteSheet.isPending ? "Deleting…" : "Delete Sheet"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                // Apply target change first if needed
                const currentTargetId = sheet?.targetId ?? null;
                const newTargetId =
                  editTargetMode === "link" ? editSelectedTargetId : null;
                if (
                  editTargetMode === "link" &&
                  newTargetId !== currentTargetId
                ) {
                  setSheetTarget.mutate({ sheetId, targetId: newTargetId });
                } else if (
                  editTargetMode === "none" &&
                  editSelectedTargetId === null &&
                  currentTargetId !== null
                ) {
                  setSheetTarget.mutate({ sheetId, targetId: null });
                }
                updateSheet.mutate({
                  id: sheetId,
                  sheetDate: editSheetDate,
                });
              }}
              disabled={!editSheetDate || updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Target — same structured Add Target dialog used everywhere else */}
      <AddTargetDialog
        open={editCreateTargetDialogOpen}
        onClose={() => setEditCreateTargetDialogOpen(false)}
        initialOperation={
          sheet
            ? { id: sheet.operationId, name: sheetOperation?.name ?? "" }
            : undefined
        }
        onSave={async (payload: RegistryCreatePayload) => {
          const { existingAssociateId, ...rest } = payload;
          const result = existingAssociateId
            ? await createLinkedTargetForEditSheet.mutateAsync({
                ...rest,
                existingAssociateId,
              })
            : await createTargetForEditSheet.mutateAsync(rest);
          setEditSelectedTargetId(result.id);
          setEditTargetMode("link");
          return result;
        }}
      />

      {/* Edit Roster Dialog */}
      <Dialog open={editRosterOpen} onOpenChange={setEditRosterOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit TEAM</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              Add or remove CINs from today’s team. Mark the Team Leader and
              Running Sheet Author. The camera is added automatically for anyone
              on a row with a photo or video, or tick it if images were taken by
              that member.
            </p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <CinInput
                  value={rosterInput}
                  onChange={setRosterInput}
                  onValidCin={cin => {
                    setRosterInput(cin);
                    setRosterInputValid(true);
                  }}
                  onInvalidCin={() => setRosterInputValid(false)}
                  placeholder="Enter CIN and press Add"
                  showValidation
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRosterCin}
                disabled={!rosterInputValid}
                className="gap-1.5 shrink-0 mt-0.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
            {allUsers &&
              myTeams.length > 0 &&
              allUsers.some(u => u.teamId != null) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Add team:
                  </span>
                  {myTeams.map(t => (
                    <Button
                      key={t.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs font-semibold"
                      onClick={() => handleAddRosterTeam(t.id)}
                    >
                      {t.name.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}
            {rosterList.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
                  <span className="flex items-center">CIN</span>
                  <span
                    className="flex items-center justify-center"
                    title="Team Leader"
                  >
                    <span className="text-yellow-400 text-sm">★</span>
                  </span>
                  <span
                    className="flex items-center justify-center"
                    title="Running Sheet Author"
                  >
                    <span className="text-sky-400 text-sm">✏</span>
                  </span>
                  <span
                    className="flex items-center justify-center"
                    title="Images taken"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </span>
                  <span></span>
                </div>
                {rosterList.map(entry => (
                  <div
                    key={entry.cin}
                    className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <span className="flex items-center text-sm font-mono font-medium text-foreground">
                      {entry.cin}
                    </span>
                    {/* Team Leader — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isTeamLeader}
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c => ({
                              ...c,
                              isTeamLeader:
                                c.cin === entry.cin
                                  ? !entry.isTeamLeader
                                  : false,
                            }))
                          )
                        }
                        className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                      />
                    </div>
                    {/* Author — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isAuthor}
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c => ({
                              ...c,
                              isAuthor:
                                c.cin === entry.cin ? !entry.isAuthor : false,
                            }))
                          )
                        }
                        className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                      />
                    </div>
                    {/* Images */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={
                          entry.hasImages || autoImageCins.has(entry.cin)
                        }
                        disabled={autoImageCins.has(entry.cin)}
                        title={
                          autoImageCins.has(entry.cin)
                            ? "Added automatically — on a row with images"
                            : "Images taken"
                        }
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c =>
                              c.cin === entry.cin
                                ? { ...c, hasImages: !c.hasImages }
                                : c
                            )
                          )
                        }
                        className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() =>
                          setRosterList(prev =>
                            prev.filter(c => c.cin !== entry.cin)
                          )
                        }
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No CINs in team yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRosterOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Sort before saving: TL first, then numerically
                const sorted = [...rosterList].sort((a, b) => {
                  if (a.isTeamLeader && !b.isTeamLeader) return -1;
                  if (!a.isTeamLeader && b.isTeamLeader) return 1;
                  const aNum = parseInt(a.cin, 10);
                  const bNum = parseInt(b.cin, 10);
                  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                  return a.cin.localeCompare(b.cin);
                });
                updateSheet.mutate({ id: sheetId, sheetCins: sorted });
              }}
              disabled={updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save TEAM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(() => {
        const currentDupe = dupeQueue[dupeIndex];
        if (!currentDupe) return null;
        if (currentDupe.kind === "generic") {
          return (
            <EntityDuplicateDialog
              key={dupeIndex}
              open={dupeDialogOpen}
              onOpenChange={setDupeDialogOpen}
              type={currentDupe.type}
              mode="auto"
              candidate={{ label: currentDupe.label, rowCount: 0 }}
              existing={{
                label: currentDupe.match.label,
                rowCount: currentDupe.match.rowCount,
              }}
              reason={currentDupe.match.reason}
              onResolved={handleDupeDialogResolved}
            />
          );
        }
        if (currentDupe.kind === "crossOp") {
          return (
            <CrossOperationEntityAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      type: currentDupe.type,
                      label: currentDupe.label,
                      operationNames: currentDupe.operationNames,
                    }
                  : null
              }
              onAcknowledge={handleDupeDialogResolved}
            />
          );
        }
        if (currentDupe.kind === "missingLocation") {
          return (
            <MissingLocationAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      location: currentDupe.location,
                      source: currentDupe.source,
                    }
                  : null
              }
              onConfirm={() =>
                handleMissingLocationResolved(true, currentDupe.location)
              }
              onDecline={() =>
                handleMissingLocationResolved(false, currentDupe.location)
              }
            />
          );
        }
        if (currentDupe.kind === "vagueVehicle") {
          return (
            <VagueVehicleMatchAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      loserLabel: currentDupe.loserLabel,
                      winnerLabel: currentDupe.winnerLabel,
                      reason: currentDupe.reason,
                    }
                  : null
              }
              busy={vagueVehicleBusy}
              onConfirm={() => handleVagueVehicleResolved(true, currentDupe)}
              onDecline={() => handleVagueVehicleResolved(false, currentDupe)}
            />
          );
        }
        return (
          <TargetMatchDialog
            key={dupeIndex}
            open={dupeDialogOpen}
            onOpenChange={setDupeDialogOpen}
            spelling={currentDupe.rawShortForm}
            match={currentDupe.match}
            onResolved={correctSpelling =>
              handleTargetMatchResolved(
                currentDupe.rawShortForm,
                correctSpelling
              )
            }
          />
        );
      })()}
      {sheetId && <FaceMatchAckDialog sheetId={sheetId} />}
      {sheetId && sheetCheckOn && (
        <CheckRunningSheetDialog
          open={showCheckSheetDialog}
          onClose={() => setShowCheckSheetDialog(false)}
          sheetId={sheetId}
          onJumpToRow={handleJumpToCheckRow}
          onFixFinding={handleFixCheckFinding}
        />
      )}
    </Chrome>
  );
}
