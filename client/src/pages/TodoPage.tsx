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
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

export default function TodoPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();

  const { data: outstanding, isLoading } = trpc.sheet.outstandingForMe.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  if (!isAuthenticated) return null;

  // Group by operation
  const grouped: Record<
    number,
    { operationName: string; sheets: NonNullable<typeof outstanding> }
  > = {};
  if (outstanding) {
    for (const item of outstanding) {
      if (!grouped[item.operationId]) {
        grouped[item.operationId] = { operationName: item.operationName, sheets: [] };
      }
      grouped[item.operationId].sheets.push(item);
    }
  }
  const groupEntries = Object.entries(grouped);

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
              Running sheets with rows you still need to certify
            </p>
          </div>
          {outstanding && outstanding.length > 0 && (
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 bg-amber-500/10 text-amber-400 font-semibold"
            >
              {outstanding.length} sheet{outstanding.length !== 1 ? "s" : ""}
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

        {/* Empty state */}
        {!isLoading && outstanding?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-base font-semibold text-foreground">All caught up!</p>
            <p className="text-sm text-muted-foreground">
              You have no outstanding certifications.
            </p>
          </div>
        )}

        {/* Grouped sheet list */}
        {!isLoading && groupEntries.length > 0 && (
          <div className="flex flex-col gap-6">
            {groupEntries.map(([opId, group]) => (
              <div key={opId}>
                {/* Operation header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
                    {group.operationName}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {group.sheets.map((item) => (
                    <div
                      key={item.sheetId}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all duration-150 cursor-pointer"
                      onClick={() => navigate(`/sheet/${item.sheetId}`)}
                    >
                      {/* Icon */}
                      <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 shrink-0">
                        <FileText className="w-5 h-5 text-amber-400" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-foreground truncate block">
                          {item.sheetTitle}
                        </span>
                        {item.targetName && (
                          <span className="text-xs text-muted-foreground truncate block">
                            Target: {item.targetName}
                          </span>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 font-medium">
                            {item.uncertifiedRowCount} row{item.uncertifiedRowCount !== 1 ? "s" : ""} to certify
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(item.createdAt), "d MMM yyyy, HH:mm")}
                          </span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ChevronRight className="w-4 h-4 text-amber-400/60 group-hover:text-amber-400 transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
