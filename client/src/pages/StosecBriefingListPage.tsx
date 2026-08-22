import { useLocation } from "wouter";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ShieldAlert, Check } from "lucide-react";

export default function StosecBriefingListPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: briefings, isLoading } = trpc.stosecBriefing.list.useQuery();
  const { data: operations } = trpc.operation.list.useQuery();

  const operationName = (operationId: number) =>
    (operations as any[] | undefined)?.find(o => o.id === operationId)?.name ??
    `Operation #${operationId}`;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Administration</span>
              <span>/</span>
              <span className="text-foreground font-medium">
                STOSEC Briefings
              </span>
            </div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              STOSEC Briefings
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exceptional-use urgent briefings — not a daily tool.
            </p>
          </div>
          {user?.role === "admin" && (
            <Button
              onClick={() => setLocation("/administration/stosec/new")}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Briefing
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !briefings || briefings.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No STOSEC briefings yet.
          </div>
        ) : (
          <div className="space-y-2">
            {briefings.map(b => (
              <button
                key={b.id}
                onClick={() => setLocation(`/administration/stosec/${b.id}`)}
                className="w-full text-left flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold truncate">
                      {operationName(b.operationId)}
                    </p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {b.situation || "No situation summary"}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {b.postedAt
                    ? format(new Date(b.postedAt), "d MMM, h:mm a")
                    : format(new Date(b.createdAt), "d MMM, h:mm a")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
        <Check className="h-2.5 w-2.5" />
        Posted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">
      Draft
    </span>
  );
}
