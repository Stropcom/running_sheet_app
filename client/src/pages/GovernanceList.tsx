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
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";

// ── Colour helpers ────────────────────────────────────────────────────────────

function percentColor(pct: number) {
  if (pct === 100) return "text-emerald-500";
  if (pct >= 50) return "text-amber-500";
  return "text-rose-500";
}

function percentBg(pct: number) {
  if (pct === 100) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
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
  const [expanded, setExpanded] = useState(true);

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
    <div className="rounded-xl border border-border/50 overflow-hidden">
      {/* Operation header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/30 hover:bg-muted/50 transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
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
                : "border-amber-500/40 text-amber-500"
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GovernanceListPage() {
  const [, navigate] = useLocation();
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
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Governance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Running sheet write-off checklist — select a sheet to review
            </p>
          </div>
        </div>

        {!operations || operations.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No operations found.</p>
            <p className="text-xs mt-1">Create an operation and running sheet first.</p>
          </div>
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
