import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoGroup, TodoHeader, TodoRow, TodoTile } from "@/components/TodoKit";
import {
  FileText,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Building2,
  AlertTriangle,
  Lock,
  LockOpen,
} from "lucide-react";
import { useLocation } from "wouter";
import { useViewMode } from "@/contexts/ViewModeContext";

type GovItem = {
  role: string;
  govPercent?: number;
  outstanding: string[];
};

/** Team Leader / Author badge — solid light fill, dark text, full border. */
function RoleBadge({ role, full }: { role: string; full?: boolean }) {
  const isTL = role === "teamLeader";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
        isTL
          ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300"
          : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
      }`}
    >
      {isTL ? (full ? "Team Leader" : "TL") : "Author"}
    </span>
  );
}

/** Governance completion percentage pill. */
function PctPill({ percent }: { percent: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-bold leading-none ${
        percent >= 100
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300"
          : percent >= 50
            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300"
            : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/20 dark:text-slate-300"
      }`}
    >
      {percent}%
    </span>
  );
}

/** The outstanding-task lines for a sheet (all of them, or the first `max`). */
function TaskLines({ item, max }: { item: GovItem; max?: number }) {
  const tasks = max ? item.outstanding.slice(0, max) : item.outstanding;
  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task, ti) => {
        const isReadyToClose = task === "Ready to close";
        const isReadyLabel = isReadyToClose && item.govPercent === 100;
        const isNotReadyLabel = isReadyToClose && (item.govPercent ?? 0) < 100;
        const isCertify = task === "Sheet not fully certified";
        const displayTask = isNotReadyLabel ? "Not ready to close" : task;
        return (
          <span
            key={ti}
            className={`flex items-center gap-1.5 text-xs ${
              isReadyLabel
                ? "font-semibold text-emerald-700 dark:text-emerald-400"
                : isNotReadyLabel
                  ? "font-semibold text-rose-700 dark:text-rose-400"
                  : isCertify
                    ? "font-medium text-cyan-700 dark:text-cyan-400"
                    : "font-medium text-rose-700 dark:text-rose-400"
            }`}
          >
            {isReadyLabel ? (
              <LockOpen className="w-3.5 h-3.5 shrink-0" />
            ) : isCertify ? (
              <Lock className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            )}
            {displayTask}
            {isReadyToClose && item.govPercent !== undefined && (
              <PctPill percent={item.govPercent} />
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function TodoGovernancePage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();

  const { data: govTodo, isLoading } = trpc.sheet.governanceTodo.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    }
  );

  if (!isAuthenticated) return null;

  // Show all items with outstanding tasks — regardless of allSigned status.
  // allSigned only controls which tasks are actionable, not whether the item appears.
  const outstanding = govTodo?.filter(g => g.outstanding.length > 0) ?? [];
  const count = outstanding.length;

  // Group by operation
  const govByOp: Record<
    number,
    { operationName: string; items: typeof outstanding }
  > = {};
  for (const item of outstanding) {
    if (!govByOp[item.operationId]) {
      govByOp[item.operationId] = {
        operationName: item.operationName,
        items: [],
      };
    }
    govByOp[item.operationId].items.push(item);
  }

  return (
    <DashboardLayout>
      <div className="px-4 py-8">
        <TodoHeader
          tone="blue"
          icon={
            <ClipboardCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          }
          title="RS Governance"
          subtitle="Running sheets with outstanding governance tasks"
          count={count}
        />

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {/* All done */}
        {!isLoading && count === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="p-4 rounded-full border border-emerald-300 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-base font-semibold text-foreground">
              All governance tasks complete!
            </p>
            <p className="text-sm text-foreground/70">
              No outstanding governance tasks for your CIN.
            </p>
          </div>
        )}

        {/* Tiles */}
        {!isLoading && count > 0 && viewMode === "tile" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outstanding.map((item, idx) => (
              <TodoTile
                key={`${item.sheetId}-${idx}`}
                tone="blue"
                onClick={() => navigate(`/governance/${item.sheetId}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="shrink-0 rounded-lg border border-blue-300 bg-blue-50 p-2.5 dark:border-blue-400/30 dark:bg-blue-400/10">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <RoleBadge role={item.role} />
                    {item.role === "teamLeader" &&
                      item.govPercent !== undefined && (
                        <PctPill percent={item.govPercent} />
                      )}
                  </div>
                </div>
                <p className="font-semibold text-foreground leading-tight line-clamp-2">
                  {item.sheetTitle}
                </p>
                <div className="flex items-center gap-1 text-xs text-foreground/70">
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{item.operationName}</span>
                </div>
                <div className="mt-auto">
                  <TaskLines item={item} max={3} />
                </div>
              </TodoTile>
            ))}
          </div>
        )}

        {/* Folder view */}
        {!isLoading && count > 0 && viewMode === "folder" && (
          <div className="space-y-3">
            {Object.entries(govByOp).map(([opId, group]) => (
              <TodoGroup
                key={opId}
                tone="blue"
                name={group.operationName}
                count={group.items.length}
              >
                {group.items.map((item, idx) => (
                  <TodoRow
                    key={`${item.sheetId}-${idx}`}
                    tone="blue"
                    onClick={() => navigate(`/governance/${item.sheetId}`)}
                    icon={
                      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    }
                    trailing={
                      <ChevronRight className="w-4 h-4 text-blue-500/70 group-hover:text-blue-600 transition-colors" />
                    }
                  >
                    <span className="font-semibold text-sm text-foreground truncate block">
                      {item.sheetTitle}
                    </span>
                    <div className="mt-1 mb-2">
                      <RoleBadge role={item.role} full />
                    </div>
                    <TaskLines item={item} />
                  </TodoRow>
                ))}
              </TodoGroup>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
