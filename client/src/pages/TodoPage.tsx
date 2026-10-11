import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TodoGroup,
  TodoHeader,
  TodoPill,
  TodoRow,
  TodoTile,
} from "@/components/TodoKit";
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
import { useViewMode } from "@/contexts/ViewModeContext";

export default function TodoPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();

  const { data: certify, isLoading } = trpc.sheet.outstandingForMe.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    }
  );

  if (!isAuthenticated) return null;

  const count = certify?.length ?? 0;

  // Group by operation
  const certByOp: Record<
    number,
    { operationName: string; sheets: NonNullable<typeof certify> }
  > = {};
  for (const item of certify ?? []) {
    if (!certByOp[item.operationId]) {
      certByOp[item.operationId] = {
        operationName: item.operationName,
        sheets: [],
      };
    }
    certByOp[item.operationId].sheets.push(item);
  }

  return (
    <DashboardLayout>
      <div className="px-4 py-8">
        <TodoHeader
          tone="red"
          icon={<Shield className="w-5 h-5 text-red-600 dark:text-red-400" />}
          title="Certify"
          subtitle="Running sheet rows awaiting your certification"
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
              All certified!
            </p>
            <p className="text-sm text-foreground/70">
              No outstanding certifications for your CIN.
            </p>
          </div>
        )}

        {/* List */}
        {!isLoading &&
          count > 0 &&
          (viewMode === "tile" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(certify ?? []).map(item => (
                <TodoTile
                  key={item.sheetId}
                  tone="red"
                  onClick={() => navigate(`/sheet/${item.sheetId}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="shrink-0 rounded-lg border border-red-300 bg-red-50 p-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                      <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <TodoPill tone="red">
                      {item.uncertifiedRowCount} to certify
                    </TodoPill>
                  </div>
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">
                    {item.sheetTitle}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-foreground/70">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.operationName}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-auto text-xs text-foreground/70">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {format(new Date(item.createdAt), "d MMM yyyy")}
                    </span>
                  </div>
                </TodoTile>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(certByOp).map(([opId, group]) => (
                <TodoGroup
                  key={opId}
                  tone="red"
                  name={group.operationName}
                  count={group.sheets.length}
                >
                  {group.sheets.map(item => (
                    <TodoRow
                      key={item.sheetId}
                      tone="red"
                      onClick={() => navigate(`/sheet/${item.sheetId}`)}
                      icon={
                        <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
                      }
                      trailing={
                        <ChevronRight className="w-4 h-4 text-red-500/70 group-hover:text-red-600 transition-colors" />
                      }
                    >
                      <span className="font-semibold text-sm text-foreground truncate block">
                        {item.sheetTitle}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <TodoPill tone="red">
                          {item.uncertifiedRowCount} row
                          {item.uncertifiedRowCount !== 1 ? "s" : ""} to certify
                        </TodoPill>
                        <span className="flex items-center gap-1 text-xs text-foreground/70">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(item.createdAt), "d MMM yyyy")}
                        </span>
                      </div>
                    </TodoRow>
                  ))}
                </TodoGroup>
              ))}
            </div>
          ))}
      </div>
    </DashboardLayout>
  );
}
