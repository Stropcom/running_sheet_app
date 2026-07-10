import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { ViewToggle } from "@/components/ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";

export default function TodoGovernancePage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();

  const { data: govTodo, isLoading } = trpc.sheet.governanceTodo.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  if (!isAuthenticated) return null;

  // Show all items with outstanding tasks — regardless of allSigned status.
  // allSigned only controls which tasks are actionable, not whether the item appears.
  const outstanding = govTodo?.filter((g) => g.outstanding.length > 0) ?? [];
  const count = outstanding.length;

  // Group by operation
  const govByOp: Record<number, { operationName: string; items: typeof outstanding }> = {};
  for (const item of outstanding) {
    if (!govByOp[item.operationId]) {
      govByOp[item.operationId] = { operationName: item.operationName, items: [] };
    }
    govByOp[item.operationId].items.push(item);
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
            <ClipboardCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">RS Governance</h1>
            <p className="text-sm text-muted-foreground">
              Running sheets with outstanding governance tasks
            </p>
          </div>
          {count > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-400 font-semibold"
            >
              {count} sheet{count !== 1 ? "s" : ""}
            </Badge>
          )}
          <ViewToggle />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {/* All done */}
        {!isLoading && count === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-base font-semibold text-foreground">All governance tasks complete!</p>
            <p className="text-sm text-muted-foreground">
              No outstanding governance tasks for your CIN.
            </p>
          </div>
        )}

        {/* List */}
        {!isLoading && count > 0 && viewMode === "tile" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outstanding.map((item, idx) => (
              <div
                key={`${item.sheetId}-${idx}`}
                onClick={() => navigate(`/governance/${item.sheetId}`)}
                className="group flex flex-col gap-3 p-5 rounded-xl border border-amber-500/30 bg-card hover:bg-amber-500/5 hover:border-amber-500/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                    <FileText className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                      item.role === "teamLeader"
                        ? "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                        : "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                    }`}>
                      {item.role === "teamLeader" ? "TL" : "Author"}
                    </span>
                    {item.role === "teamLeader" && item.govPercent !== undefined && (
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        item.govPercent >= 100
                          ? "bg-emerald-500/20 text-emerald-300"
                          : item.govPercent >= 50
                            ? "bg-sky-500/20 text-sky-300"
                            : "bg-slate-500/20 text-slate-400"
                      }`}>
                        {item.govPercent}%
                      </span>
                    )}
                  </div>
                </div>
                <p className="font-semibold text-foreground leading-tight line-clamp-2">{item.sheetTitle}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{item.operationName}</span>
                </div>
                <div className="flex flex-col gap-0.5 mt-auto">
                  {item.outstanding.slice(0, 3).map((task, ti) => {
                    const isReadyToClose = task === "Ready to close";
                    const isReadyLabel = isReadyToClose && item.govPercent === 100;
                    const isNotReadyLabel = isReadyToClose && (item.govPercent ?? 0) < 100;
                    const displayTask = isNotReadyLabel ? "Not ready to close" : task;
                    return (
                      <span key={ti} className={`flex items-center gap-1 text-xs ${
                        isReadyLabel ? "text-emerald-400 font-medium" :
                        isNotReadyLabel ? "text-rose-400 font-medium" :
                        task === "Sheet not fully certified" ? "text-amber-400" : "text-rose-400"
                      }`}>
                        {isReadyLabel ? <LockOpen className="w-3 h-3 shrink-0" /> :
                         isNotReadyLabel ? <AlertTriangle className="w-3 h-3 shrink-0" /> :
                         task === "Sheet not fully certified" ? <Lock className="w-3 h-3 shrink-0" /> :
                         <AlertTriangle className="w-3 h-3 shrink-0" />}
                        {displayTask}
                        {isReadyToClose && item.govPercent !== undefined && (
                          <span className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                            item.govPercent >= 100 ? "bg-emerald-500/20 text-emerald-300" :
                            item.govPercent >= 50 ? "bg-sky-500/20 text-sky-300" :
                            "bg-slate-500/20 text-slate-400"
                          }`}>
                            {item.govPercent}%
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {!isLoading && count > 0 && viewMode === "folder" && (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            {Object.entries(govByOp).map(([opId, group]) => (
              <div key={opId}>
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/20">
                  <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.operationName}
                  </span>
                </div>
                {group.items.map((item, idx) => (
                  <div
                    key={`${item.sheetId}-${idx}`}
                    className="group flex items-start gap-4 px-4 py-3 hover:bg-amber-500/5 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                    onClick={() => navigate(`/governance/${item.sheetId}`)}
                  >
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-foreground truncate block">
                        {item.sheetTitle}
                      </span>
                      {/* Role badge — shown between title and task items */}
                      <span
                        className={`inline-flex items-center mt-0.5 mb-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                          item.role === "teamLeader"
                            ? "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                            : "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                        }`}
                      >
                        {item.role === "teamLeader" ? "Team Leader" : "Author"}
                      </span>
                      <div className="mt-0 flex flex-col gap-0.5">
                        {item.outstanding.map((task, ti) => {
                          const isReadyToClose = task === "Ready to close";
                          const isReadyLabel = isReadyToClose && item.govPercent === 100;
                          const isNotReadyLabel = isReadyToClose && (item.govPercent ?? 0) < 100;
                          const displayTask = isNotReadyLabel ? "Not ready to close" : task;
                          return (
                          <span
                            key={ti}
                            className={`flex items-center gap-1.5 text-xs ${
                              isReadyLabel
                                ? "text-emerald-400 font-medium"
                                : isNotReadyLabel
                                  ? "text-rose-400 font-medium"
                                  : task === "Sheet not fully certified"
                                    ? "text-amber-400"
                                    : "text-rose-400"
                            }`}
                          >
                            {isReadyLabel ? (
                              <LockOpen className="w-3 h-3 shrink-0" />
                            ) : isNotReadyLabel ? (
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                            ) : task === "Sheet not fully certified" ? (
                              <Lock className="w-3 h-3 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                            )}
                            {displayTask}
                            {isReadyToClose && item.govPercent !== undefined && (
                              <span
                                className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                                  item.govPercent >= 100
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : item.govPercent >= 50
                                      ? "bg-sky-500/20 text-sky-300"
                                      : "bg-slate-500/20 text-slate-400"
                                }`}
                              >
                                {item.govPercent}%
                              </span>
                            )}
                          </span>
                          );
                        })}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400/50 group-hover:text-amber-400 transition-colors shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
