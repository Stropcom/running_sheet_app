import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import {
  TodoGroup,
  TodoHeader,
  TodoRow,
  TodoTile,
  TODO_TONES,
} from "@/components/TodoKit";
import {
  ClipboardCheck,
  ChevronRight,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useLocation } from "wouter";
import { format } from "date-fns";

// The Governance folder reads like the Certify page (components/TodoKit.tsx):
// one white card per operation with a grey titled band, each running sheet its
// own bordered row inside it, in the Governance folder's purple.

const TONE = "purple" as const;

/** Completion pill: solid light fill, dark text, full border. */
function PctPill({ percent }: { percent: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${
        percent >= 100
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
          : percent >= 50
            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
            : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300"
      }`}
    >
      {percent}%
    </span>
  );
}

/** "All complete" / "N to review" for one operation. */
function StatusPill({
  needsAttention,
  anyOverdue,
}: {
  needsAttention: number;
  anyOverdue: boolean;
}) {
  if (needsAttention === 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        All complete
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        anyOverdue
          ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300"
          : TODO_TONES[TONE].pill
      }`}
    >
      {anyOverdue && <AlertTriangle className="h-3 w-3" />}
      {needsAttention} to review
    </span>
  );
}

// ── Folder view: one card per operation ───────────────────────────────────────

function OperationGroup({
  operationId,
  operationName,
  onNavigate,
}: {
  operationId: number;
  operationName: string;
  onNavigate: (path: string) => void;
}) {
  const { data: summaries, isLoading } =
    trpc.governance.summaryByOperation.useQuery(
      { operationId },
      { refetchOnWindowFocus: false }
    );

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }
  if (!summaries || summaries.length === 0) return null;

  const needsAttention = summaries.filter(s => !s.isComplete).length;
  const anyOverdue = summaries.some(s => s.isOverdue);

  return (
    <TodoGroup
      tone={TONE}
      name={operationName}
      count={summaries.length}
      badge={
        <StatusPill needsAttention={needsAttention} anyOverdue={anyOverdue} />
      }
    >
      {summaries.map(s => (
        <TodoRow
          key={s.sheetId}
          tone={TONE}
          onClick={() => onNavigate(`/governance/${s.sheetId}`)}
          icon={<FileText className={`h-5 w-5 ${TODO_TONES[TONE].icon}`} />}
          trailing={
            s.isComplete ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ChevronRight
                className={`h-4 w-4 transition-colors ${TODO_TONES[TONE].chevron}`}
              />
            )
          }
        >
          <span className="block truncate text-sm font-semibold text-foreground">
            {s.sheetTitle}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <PctPill percent={s.overallPercent} />
            {s.sheetCreatedAt && (
              <span className="flex items-center gap-1 text-xs text-foreground/70">
                <Calendar className="h-3 w-3" />
                {format(new Date(s.sheetCreatedAt), "d MMM yyyy")}
              </span>
            )}
            {s.isOverdue && (
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                OVERDUE
              </span>
            )}
          </div>
        </TodoRow>
      ))}
    </TodoGroup>
  );
}

// ── Tile view: one tile per operation ─────────────────────────────────────────

function GovernanceTileCard({
  operationId,
  operationName,
  onNavigate,
}: {
  operationId: number;
  operationName: string;
  onNavigate: (path: string) => void;
}) {
  const { data: summaries, isLoading } =
    trpc.governance.summaryByOperation.useQuery(
      { operationId },
      { refetchOnWindowFocus: false }
    );

  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;
  if (!summaries || summaries.length === 0) return null;

  const needsAttention = summaries.filter(s => !s.isComplete).length;
  const anyOverdue = summaries.some(s => s.isOverdue);
  const overallPct = Math.round(
    summaries.reduce((sum, s) => sum + s.overallPercent, 0) / summaries.length
  );
  const bar =
    overallPct === 100
      ? "bg-emerald-500"
      : overallPct >= 50
        ? "bg-sky-500"
        : "bg-rose-500";

  return (
    <TodoTile tone={TONE}>
      <div className="flex items-start justify-between gap-2">
        <div
          className={`shrink-0 rounded-lg border p-2.5 ${TODO_TONES[TONE].iconBox}`}
        >
          <ClipboardCheck className={`h-5 w-5 ${TODO_TONES[TONE].icon}`} />
        </div>
        <StatusPill needsAttention={needsAttention} anyOverdue={anyOverdue} />
      </div>

      <p className="line-clamp-2 font-semibold leading-tight text-foreground">
        {operationName}
      </p>

      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-foreground/70">
            {summaries.length} sheet{summaries.length !== 1 ? "s" : ""}
          </span>
          <PctPill percent={overallPct} />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${bar}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2">
        {summaries.slice(0, 3).map(s => (
          <button
            key={s.sheetId}
            onClick={() => onNavigate(`/governance/${s.sheetId}`)}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted"
          >
            {s.isComplete ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-foreground/60" />
            )}
            <span className="truncate text-xs text-foreground/80">
              {s.sheetTitle}
            </span>
          </button>
        ))}
        {summaries.length > 3 && (
          <p className="pl-1 text-xs text-foreground/70">
            +{summaries.length - 3} more sheets
          </p>
        )}
      </div>
    </TodoTile>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GovernanceListPage() {
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();
  const { data: operations, isLoading } =
    trpc.operation.list.useQuery(undefined);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-3 px-4 py-8">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-4 py-8">
        <TodoHeader
          tone={TONE}
          icon={
            <ClipboardCheck className={`h-5 w-5 ${TODO_TONES[TONE].icon}`} />
          }
          title="Governance"
          subtitle="Running sheet write-off checklist — select a sheet to review"
          count={0}
        />

        {!operations || operations.length === 0 ? (
          <div className="py-16 text-center text-foreground/70">
            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">No operations found.</p>
            <p className="mt-1 text-xs">
              Create an operation and running sheet first.
            </p>
          </div>
        ) : viewMode === "tile" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {operations.map(op => (
              <GovernanceTileCard
                key={op.id}
                operationId={op.id}
                operationName={op.name}
                onNavigate={navigate}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {operations.map(op => (
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
