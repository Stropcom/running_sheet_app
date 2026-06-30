import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Calendar,
  Building2,
  ShieldCheck,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useState } from "react";

// ─── Section toggle wrapper ───────────────────────────────────────────────────

function SectionBlock({
  title,
  icon,
  count,
  accentClass,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  accentClass: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card/60 hover:bg-card/80 transition-colors"
      >
        <div className={`p-1.5 rounded-lg ${accentClass}`}>{icon}</div>
        <span className="flex-1 text-left text-sm font-semibold text-foreground">{title}</span>
        {count > 0 && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${accentClass} border-current`}>
            {count}
          </Badge>
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="divide-y divide-border/30">{children}</div>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TodoPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const { data: certify, isLoading: certLoading } = trpc.sheet.outstandingForMe.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const { data: govTodo, isLoading: govLoading } = trpc.sheet.governanceTodo.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  if (!isAuthenticated) return null;

  const isLoading = certLoading || govLoading;
  const totalCount = (certify?.length ?? 0) + (govTodo?.length ?? 0);

  // Group certify items by operation
  const certByOp: Record<number, { operationName: string; sheets: NonNullable<typeof certify> }> = {};
  for (const item of certify ?? []) {
    if (!certByOp[item.operationId]) {
      certByOp[item.operationId] = { operationName: item.operationName, sheets: [] };
    }
    certByOp[item.operationId].sheets.push(item);
  }

  // Group governance items by operation
  const govByOp: Record<number, { operationName: string; items: NonNullable<typeof govTodo> }> = {};
  for (const item of govTodo ?? []) {
    if (!govByOp[item.operationId]) {
      govByOp[item.operationId] = { operationName: item.operationName, items: [] };
    }
    govByOp[item.operationId].items.push(item);
  }

  const allDone = !isLoading && totalCount === 0;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
            <ClipboardList className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">To-Do</h1>
            <p className="text-sm text-muted-foreground">
              Outstanding certifications and governance tasks
            </p>
          </div>
          {totalCount > 0 && (
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 bg-amber-500/10 text-amber-400 font-semibold"
            >
              {totalCount} item{totalCount !== 1 ? "s" : ""}
            </Badge>
          )}
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
        {allDone && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-base font-semibold text-foreground">All caught up!</p>
            <p className="text-sm text-muted-foreground">
              No outstanding certifications or governance tasks.
            </p>
          </div>
        )}

        {/* Content */}
        {!isLoading && totalCount > 0 && (
          <div className="flex flex-col gap-4">

            {/* ── Certify section ── */}
            <SectionBlock
              title="Certify"
              icon={<ShieldCheck className="w-4 h-4 text-amber-400" />}
              count={certify?.length ?? 0}
              accentClass="bg-amber-500/15 text-amber-400"
              defaultOpen={true}
            >
              {(certify?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  No outstanding certifications
                </div>
              ) : (
                Object.entries(certByOp).map(([opId, group]) => (
                  <div key={opId}>
                    {/* Operation label */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/20">
                      <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.operationName}
                      </span>
                    </div>
                    {group.sheets.map((item) => (
                      <div
                        key={item.sheetId}
                        className="group flex items-center gap-4 px-4 py-3 hover:bg-amber-500/5 transition-colors cursor-pointer"
                        onClick={() => navigate(`/sheet/${item.sheetId}`)}
                      >
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                          <FileText className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-foreground truncate block">
                            {item.sheetTitle}
                          </span>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 font-medium">
                              {item.uncertifiedRowCount} row{item.uncertifiedRowCount !== 1 ? "s" : ""} to certify
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(item.createdAt), "d MMM yyyy")}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400/50 group-hover:text-amber-400 transition-colors shrink-0" />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </SectionBlock>

            {/* ── RS Governance section ── */}
            <SectionBlock
              title="RS Governance"
              icon={<ClipboardCheck className="w-4 h-4 text-violet-400" />}
              count={govTodo?.length ?? 0}
              accentClass="bg-violet-500/15 text-violet-400"
              defaultOpen={true}
            >
              {(govTodo?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  No outstanding governance tasks
                </div>
              ) : (
                Object.entries(govByOp).map(([opId, group]) => (
                  <div key={opId}>
                    {/* Operation label */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/20">
                      <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.operationName}
                      </span>
                    </div>
                    {group.items.map((item, idx) => (
                      <div
                        key={`${item.sheetId}-${idx}`}
                        className="group flex items-start gap-4 px-4 py-3 hover:bg-violet-500/5 transition-colors cursor-pointer"
                        onClick={() => navigate(`/governance/${item.sheetId}`)}
                      >
                        <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 shrink-0 mt-0.5">
                          {item.role === "teamLeader" ? (
                            <ClipboardCheck className="w-4 h-4 text-violet-400" />
                          ) : (
                            <FileText className="w-4 h-4 text-violet-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-foreground truncate block">
                            {item.sheetTitle}
                          </span>
                          {/* Outstanding items list */}
                          <div className="mt-1 flex flex-col gap-0.5">
                            {item.outstanding.map((task, ti) => (
                              <span
                                key={ti}
                                className={`flex items-center gap-1.5 text-xs ${
                                  task === "Sheet not fully certified"
                                    ? "text-amber-400"
                                    : "text-rose-400"
                                }`}
                              >
                                {task === "Sheet not fully certified" ? (
                                  <Lock className="w-3 h-3 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                )}
                                {task}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-violet-400/50 group-hover:text-violet-400 transition-colors shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </SectionBlock>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
