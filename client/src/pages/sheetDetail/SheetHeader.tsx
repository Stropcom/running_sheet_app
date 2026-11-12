// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Download,
  FileText,
  Pencil,
  ClipboardCheck,
  NotebookText,
  LockKeyhole,
  LockKeyholeOpen,
} from "lucide-react";
import { WifiOff, RefreshCw } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** the title row, Close / Export and the Running Sheet / Summary / Governance tabs. */
export function SheetHeader({ s }: { s: SheetScreen }) {
  const {
    sheetLoading,
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
    embedded,
  } = s;

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
  return (
    <>
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
                      No internet connection. Changes are saved locally and will
                      sync automatically when you reconnect.
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
                            canCloseSheet && closeSheet.mutate({ id: sheetId })
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
              onClick={() => navigate(`/summary/${sheetId}`, { replace: true })}
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
    </>
  );
}
