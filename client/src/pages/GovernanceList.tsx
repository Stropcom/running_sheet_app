import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ClipboardCheck,
  ChevronRight,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { ViewToggle } from "@/components/ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";

// ── Colour helpers ────────────────────────────────────────────────────────────

function percentColor(pct: number) {
  if (pct === 100) return "text-emerald-500";
  if (pct >= 50) return "text-cyan-500";
  return "text-rose-500";
}

function percentBg(pct: number) {
  if (pct === 100) return "bg-emerald-500";
  if (pct >= 50) return "bg-cyan-500";
  return "bg-rose-500";
}

// ── OperationGroup ────────────────────────────────────────────────────────────

function OperationGroup({
  operationId,
  operationName,
  onNavigate,
}: {
  operationId: number;
  operationName: string;
  onNavigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: summaries, isLoading } = trpc.governance.summaryByOperation.useQuery(
    { operationId },
    { refetchOnWindowFocus: false }
  );

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }
  if (!summaries || summaries.length === 0) return null;

  // Operation-level indicator: how many sheets need attention
  const needsAttention = summaries.filter((s) => !s.isComplete).length;
  const allDone = needsAttention === 0;
  const anyOverdue = summaries.some((s) => s.isOverdue);

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
      {/* Operation header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/30 hover:bg-muted/50 transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-semibold text-foreground flex-1 text-left">
          {operationName}
        </span>

        {/* Operation-level status badge */}
        {allDone ? (
          <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30 border">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            All complete
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              anyOverdue
                ? "border-rose-500/40 text-rose-500"
                : "border-cyan-500/40 text-cyan-500"
            }`}
          >
            {anyOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
            {needsAttention} sheet{needsAttention !== 1 ? "s" : ""} need attention
          </Badge>
        )}

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Sheet rows */}
      {expanded && (
        <div className="divide-y divide-border/20">
          {summaries.map((s) => (
            <button
              key={s.sheetId}
              onClick={() => onNavigate(`/governance/${s.sheetId}`)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
            >
              {/* Mini progress bar */}
              <div className="w-10 h-10 shrink-0 relative flex items-center justify-center">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted/30"
                  />
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    strokeWidth="3"
                    strokeDasharray={`${(s.overallPercent / 100) * 94.25} 94.25`}
                    strokeLinecap="round"
                    className={percentColor(s.overallPercent)}
                    stroke="currentColor"
                  />
                </svg>
                <span className={`absolute text-[9px] font-bold ${percentColor(s.overallPercent)}`}>
                  {s.overallPercent}%
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.sheetTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.sheetCreatedAt
                    ? format(new Date(s.sheetCreatedAt), "dd MMM yyyy")
                    : ""}
                  {s.isOverdue && (
                    <span className="ml-2 text-rose-500 font-medium">OVERDUE</span>
                  )}
                </p>
              </div>

              {s.isComplete ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tile Grid ────────────────────────────────────────────────────────────────

function GovernanceTileGrid({
  operations,
  onNavigate,
}: {
  operations: Array<{ id: number; name: string }>;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {operations.map((op) => (
        <GovernanceTileCard key={op.id} operationId={op.id} operationName={op.name} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function GovernanceTileCard({
  operationId,
  operationName,
  onNavigate,
}: {
  operationId: number;
  operationName: string;
  onNavigate: (path: string) => void;
}) {
  const { data: summaries, isLoading } = trpc.governance.summaryByOperation.useQuery(
    { operationId },
    { refetchOnWindowFocus: false }
  );

  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;
  if (!summaries || summaries.length === 0) return null;

  const needsAttention = summaries.filter((s) => !s.isComplete).length;
  const allDone = needsAttention === 0;
  const anyOverdue = summaries.some((s) => s.isOverdue);
  const overallPct = summaries.length > 0
    ? Math.round(summaries.reduce((sum, s) => sum + s.overallPercent, 0) / summaries.length)
    : 0;

  return (
    <div className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="p-2 rounded-lg bg-purple-400/10 border border-purple-400/20 shrink-0">
          <ClipboardCheck className="w-4 h-4 text-purple-400" />
        </div>
        {allDone ? (
          <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30 border shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" />All complete
          </Badge>
        ) : (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${
            anyOverdue ? "border-rose-500/40 text-rose-500" : "border-cyan-500/40 text-cyan-500"
          }`}>
            {anyOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
            {needsAttention} need attention
          </Badge>
        )}
      </div>

      {/* Name */}
      <p className="font-semibold text-foreground leading-tight line-clamp-2">{operationName}</p>

      {/* Progress bar */}
      <div className="mt-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{summaries.length} sheet{summaries.length !== 1 ? "s" : ""}</span>
          <span className={`text-xs font-semibold ${
            overallPct === 100 ? "text-emerald-500" : overallPct >= 50 ? "text-cyan-500" : "text-rose-500"
          }`}>{overallPct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overallPct === 100 ? "bg-emerald-500" : overallPct >= 50 ? "bg-cyan-500" : "bg-rose-500"
            }`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Sheet list (compact) */}
      <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
        {summaries.slice(0, 3).map((s) => (
          <button
            key={s.sheetId}
            onClick={() => onNavigate(`/governance/${s.sheetId}`)}
            className="flex items-center gap-2 text-left hover:bg-accent/30 rounded px-1 py-0.5 transition-colors"
          >
            {s.isComplete
              ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            }
            <span className="text-xs text-foreground/80 truncate">{s.sheetTitle}</span>
          </button>
        ))}
        {summaries.length > 3 && (
          <p className="text-[10px] text-muted-foreground pl-1">+{summaries.length - 3} more sheets</p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GovernanceListPage() {
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();
  const { data: operations, isLoading } = trpc.operation.list.useQuery(undefined);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-400/10 border border-purple-400/20 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">Governance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Running sheet write-off checklist — select a sheet to review
            </p>
          </div>
          <ViewToggle />
        </div>

        {!operations || operations.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No operations found.</p>
            <p className="text-xs mt-1">Create an operation and running sheet first.</p>
          </div>
        ) : viewMode === "tile" ? (
          <GovernanceTileGrid operations={operations} onNavigate={navigate} />
        ) : (
          <div className="space-y-4">
            {operations.map((op) => (
              <OperationGroup
                key={op.id}
                operationId={op.id}
                operationName={op.name}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
