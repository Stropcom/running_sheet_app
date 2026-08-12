import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ChevronRight,
  CheckCircle2,
  Link2Off,
  Building2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useViewMode } from "@/contexts/ViewModeContext";

export default function TodoImagesPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();

  const { data: unlinked, isLoading } = trpc.sheet.unlinkedImagesTodo.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  if (!isAuthenticated) return null;

  const count = unlinked?.length ?? 0;

  // Group by operation
  const unlinkedByOp: Record<number, { operationName: string; sheets: NonNullable<typeof unlinked> }> = {};
  for (const item of unlinked ?? []) {
    if (!unlinkedByOp[item.operationId]) {
      unlinkedByOp[item.operationId] = { operationName: item.operationName, sheets: [] };
    }
    unlinkedByOp[item.operationId].sheets.push(item);
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
            <Link2Off className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Link Images</h1>
            <p className="text-sm text-muted-foreground">
              Photos on your running sheets not yet linked to an entity
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
            <p className="text-base font-semibold text-foreground">All images linked!</p>
            <p className="text-sm text-muted-foreground">
              No unlinked photos on running sheets you authored.
            </p>
          </div>
        )}

        {/* List */}
        {!isLoading && count > 0 && (
          viewMode === "tile" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(unlinked ?? []).map((item) => (
                <div
                  key={item.sheetId}
                  onClick={() => navigate(`/images/${item.operationId}/${item.sheetId}`)}
                  className="group flex flex-col gap-3 p-5 rounded-xl border border-amber-500/30 bg-card hover:bg-amber-500/5 hover:border-amber-500/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                      <FileText className="w-4 h-4 text-amber-400" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 font-medium shrink-0">
                      {item.unlinkedCount} unlinked
                    </span>
                  </div>
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">{item.sheetTitle}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.operationName}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              {Object.entries(unlinkedByOp).map(([opId, group]) => (
                <div key={opId}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/20">
                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.operationName}
                    </span>
                  </div>
                  {group.sheets.map((item) => (
                    <div
                      key={item.sheetId}
                      className="group flex items-center gap-4 px-4 py-3 hover:bg-amber-500/5 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                      onClick={() => navigate(`/images/${item.operationId}/${item.sheetId}`)}
                    >
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                        <FileText className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm text-foreground truncate block">
                          {item.sheetTitle}
                        </span>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 font-medium">
                            {item.unlinkedCount} photo{item.unlinkedCount !== 1 ? "s" : ""} not linked
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-400/50 group-hover:text-amber-400 transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
