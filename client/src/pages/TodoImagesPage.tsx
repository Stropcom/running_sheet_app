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
  Link2Off,
  Building2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useViewMode } from "@/contexts/ViewModeContext";

export default function TodoImagesPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { viewMode } = useViewMode();

  const { data: unlinked, isLoading } = trpc.sheet.unlinkedImagesTodo.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    }
  );

  if (!isAuthenticated) return null;

  const count = unlinked?.length ?? 0;

  // Group by operation
  const unlinkedByOp: Record<
    number,
    { operationName: string; sheets: NonNullable<typeof unlinked> }
  > = {};
  for (const item of unlinked ?? []) {
    if (!unlinkedByOp[item.operationId]) {
      unlinkedByOp[item.operationId] = {
        operationName: item.operationName,
        sheets: [],
      };
    }
    unlinkedByOp[item.operationId].sheets.push(item);
  }

  return (
    <DashboardLayout>
      <div className="px-4 py-8">
        <TodoHeader
          tone="amber"
          icon={
            <Link2Off className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          }
          title="Link Images"
          subtitle="Photos on your running sheets not yet linked to an entity"
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
              All images linked!
            </p>
            <p className="text-sm text-foreground/70">
              No unlinked photos on running sheets you authored.
            </p>
          </div>
        )}

        {/* List */}
        {!isLoading &&
          count > 0 &&
          (viewMode === "tile" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(unlinked ?? []).map(item => (
                <TodoTile
                  key={item.sheetId}
                  tone="amber"
                  onClick={() =>
                    navigate(`/images/${item.operationId}/${item.sheetId}`)
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <TodoPill tone="amber">
                      {item.unlinkedCount} unlinked
                    </TodoPill>
                  </div>
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">
                    {item.sheetTitle}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-foreground/70">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.operationName}</span>
                  </div>
                </TodoTile>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(unlinkedByOp).map(([opId, group]) => (
                <TodoGroup
                  key={opId}
                  tone="amber"
                  name={group.operationName}
                  count={group.sheets.length}
                >
                  {group.sheets.map(item => (
                    <TodoRow
                      key={item.sheetId}
                      tone="amber"
                      onClick={() =>
                        navigate(`/images/${item.operationId}/${item.sheetId}`)
                      }
                      icon={
                        <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      }
                      trailing={
                        <ChevronRight className="w-4 h-4 text-amber-500/70 group-hover:text-amber-600 transition-colors" />
                      }
                    >
                      <span className="font-semibold text-sm text-foreground truncate block">
                        {item.sheetTitle}
                      </span>
                      <div className="mt-1">
                        <TodoPill tone="amber">
                          {item.unlinkedCount} photo
                          {item.unlinkedCount !== 1 ? "s" : ""} not linked
                        </TodoPill>
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
