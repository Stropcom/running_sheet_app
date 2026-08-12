import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ChevronRight,
  CheckCircle2,
  Shield,
  Calendar,
  Building2,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ViewToggle } from "@/components/ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";

export default function TodoPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();

  const { data: certify, isLoading } = trpc.sheet.outstandingForMe.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  if (!isAuthenticated) return null;

  const count = certify?.length ?? 0;

  // Group by operation
  const certByOp: Record<number, { operationName: string; sheets: NonNullable<typeof certify> }> = {};
  for (const item of certify ?? []) {
    if (!certByOp[item.operationId]) {
      certByOp[item.operationId] = { operationName: item.operationName, sheets: [] };
    }
    certByOp[item.operationId].sheets.push(item);
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Certify</h1>
            <p className="text-sm text-muted-foreground">
              Running sheet rows awaiting your certification
            </p>
          </div>
          {count > 0 && (
            <Badge
              variant="outline"
              className="border-red-500/40 bg-red-500/10 text-red-400 font-semibold"
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
            <p className="text-base font-semibold text-foreground">All certified!</p>
            <p className="text-sm text-muted-foreground">
              No outstanding certifications for your CIN.
            </p>
          </div>
        )}

        {/* List */}
        {!isLoading && count > 0 && (
          viewMode === "tile" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(certify ?? []).map((item) => (
                <div
                  key={item.sheetId}
                  onClick={() => navigate(`/sheet/${item.sheetId}`)}
                  className="group flex flex-col gap-3 p-5 rounded-xl border border-red-500/30 bg-card hover:bg-red-500/5 hover:border-red-500/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
                      <FileText className="w-5 h-5 text-red-400" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 font-medium shrink-0">
                      {item.uncertifiedRowCount} to certify
                    </span>
                  </div>
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">{item.sheetTitle}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.operationName}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-auto text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>{format(new Date(item.createdAt), "d MMM yyyy")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(certByOp).map(([opId, group]) => (
                <div key={opId} className="rounded-xl border border-border/50 overflow-hidden bg-card">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/20">
                    <Building2 className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.operationName}
                    </span>
                  </div>
                  {group.sheets.map((item) => (
                    <div
                      key={item.sheetId}
                      className="group flex items-center gap-4 px-4 py-3 hover:bg-red-500/5 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                      onClick={() => navigate(`/sheet/${item.sheetId}`)}
                    >
                      <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
                        <FileText className="w-5 h-5 text-red-400" />
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
                      <ChevronRight className="w-4 h-4 text-red-400/50 group-hover:text-red-400 transition-colors shrink-0" />
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
