import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateOperationDialog } from "@/components/CreateOperationDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Plus,
  Search,
  FolderOpen,
  ChevronRight,
  Trash2,
  Calendar,
  Hash,
  Building2,
  Scale,
  Archive,
  WifiOff,
  LayoutGrid,
} from "lucide-react";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import { useOffline } from "@/contexts/OfflineContext";
import {
  saveOperationsListCache,
  getOperationsListCache,
  type CachedOperationSummary,
} from "@/lib/offlineStore";

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: deleteStats } = trpc.operation.deleteStats.useQuery(
    { id: deleteId! },
    { enabled: deleteId !== null }
  );

  const utils = trpc.useUtils();

  const { viewMode } = useViewMode();
  const { isOnline } = useOffline();
  const [cachedOps, setCachedOps] = useState<CachedOperationSummary[] | null>(
    null
  );

  const { data: operations, isLoading } = trpc.operation.list.useQuery(
    undefined,
    {
      enabled: isAuthenticated && isOnline,
    }
  );

  // Cache operations list when loaded online
  useEffect(() => {
    if (operations && isOnline) {
      const toCache: CachedOperationSummary[] = operations.map(op => ({
        id: op.id,
        name: op.name,
        promisNumber: op.promisNumber,
        imsNumber: op.imsNumber,
        unit: op.investigationUnit,
        status: "active",
        createdAt:
          op.createdAt instanceof Date
            ? op.createdAt.getTime()
            : Number(op.createdAt),
      }));
      saveOperationsListCache(toCache).catch(() => {});
    }
  }, [operations, isOnline]);

  // Load cached ops for offline fallback
  useEffect(() => {
    if (!isOnline) {
      getOperationsListCache()
        .then(cached => {
          if (cached) setCachedOps(cached);
        })
        .catch(() => {});
    }
  }, [isOnline]);

  const { data: deepResults, isFetching: deepFetching } =
    trpc.operation.deepSearch.useQuery(
      { query: search },
      { enabled: isAuthenticated && search.trim().length > 0 }
    );

  const deleteOp = trpc.operation.delete.useMutation({
    onSuccess: () => {
      utils.operation.list.invalidate();
      setDeleteId(null);
      toast.success("Operation deleted");
    },
    onError: e => toast.error(e.message),
  });

  // When a search query is active, use deep search results; otherwise show all operations
  const isSearching = search.trim().length > 0;
  // When offline, use cached operations list as fallback
  const displayOps = isOnline
    ? (operations ?? [])
    : (cachedOps?.map(op => ({
        id: op.id,
        name: op.name,
        promisNumber: op.promisNumber ?? null,
        imsNumber: op.imsNumber ?? null,
        investigationUnit: op.unit ?? null,
        createdAt: new Date(op.createdAt),
      })) ?? []);

  const filtered =
    isSearching && isOnline
      ? (deepResults ?? []).map(r => ({
          id: r.operationId,
          name: r.operationName,
          promisNumber: r.promisNumber,
          imsNumber: r.imsNumber,
          investigationUnit: r.investigationUnit,
          matchContexts: r.matchContexts,
          createdAt: new Date(),
          operationStatus: r.operationStatus as
            | "active"
            | "before_court"
            | "archive",
        }))
      : displayOps.map(op => ({
          ...op,
          matchContexts: [] as string[],
          operationStatus: "active" as const,
        }));

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Operations
            </h1>
            {!isOnline && (
              <Badge
                variant="outline"
                className="gap-1 text-amber-600 border-amber-300 bg-amber-50"
              >
                <WifiOff className="w-3 h-3" />
                Offline
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setCreateOpen(true)}
              disabled={!isOnline}
              title={
                !isOnline ? "Cannot create operations while offline" : undefined
              }
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Operation</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search operations, sheets, targets, CINs, observations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
          {deepFetching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">
              Searching…
            </span>
          )}
        </div>

        {/* Operations list */}
        {(isOnline && isLoading) ||
        (isSearching && deepFetching && !deepResults) ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted/40 mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">
              {search ? "No operations match your search" : "No operations yet"}
            </p>
            <p className="text-muted-foreground text-sm mb-4">
              {search
                ? "Try a different search term"
                : "Create your first operation to get started"}
            </p>
            {!search && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="w-4 h-4" />
                New Operation
              </Button>
            )}
          </div>
        ) : viewMode === "tile" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(op => (
              <div
                key={op.id}
                className={`group relative flex flex-col gap-3 p-5 rounded-xl border bg-card hover:bg-accent/20 transition-all duration-150 cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                  (op as any).operationStatus &&
                  (op as any).operationStatus !== "active"
                    ? "border-violet-500/30 hover:border-violet-500/50 opacity-80"
                    : "border-border hover:border-primary/30"
                }`}
                onClick={() => {
                  const status = (op as any).operationStatus;
                  if (status === "before_court" || status === "archive") {
                    navigate("/operation-management");
                  } else {
                    navigate(`/operation/${op.id}`);
                  }
                }}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2.5 rounded-lg bg-blue-700/10 border border-blue-700/20 shrink-0">
                    <LayoutGrid className="w-5 h-5 text-blue-700" />
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {(op as any).operationStatus === "before_court" && (
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-300 border-violet-500/30 border font-semibold">
                        <Scale className="w-2.5 h-2.5 mr-1" />
                        Before Court
                      </Badge>
                    )}
                    {(op as any).operationStatus === "archive" && (
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-slate-500/20 text-slate-400 border-slate-500/30 border font-semibold">
                        <Archive className="w-2.5 h-2.5 mr-1" />
                        Archive
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Operation name */}
                <div>
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">
                    {op.name}
                  </p>
                </div>

                {/* Metadata */}
                <div className="flex flex-col gap-1 mt-auto">
                  {op.promisNumber && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Hash className="w-3 h-3 shrink-0" />
                      PROMIS:{" "}
                      <span className="text-foreground font-medium ml-0.5 truncate">
                        {op.promisNumber}
                      </span>
                    </span>
                  )}
                  {op.imsNumber && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Hash className="w-3 h-3 shrink-0" />
                      IMS:{" "}
                      <span className="text-foreground font-medium ml-0.5 truncate">
                        {op.imsNumber}
                      </span>
                    </span>
                  )}
                  {op.investigationUnit && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span className="text-foreground font-medium truncate">
                        {op.investigationUnit}
                      </span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {format(new Date(op.createdAt), "d MMM yyyy")}
                  </span>
                </div>

                {/* Match contexts */}
                {(op as { matchContexts?: string[] }).matchContexts &&
                  (op as { matchContexts?: string[] }).matchContexts!.length >
                    0 && (
                    <div className="flex flex-wrap gap-1">
                      {(op as { matchContexts?: string[] })
                        .matchContexts!.slice(0, 2)
                        .map((ctx, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                          >
                            {ctx}
                          </span>
                        ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(op => (
              <div
                key={op.id}
                className={`group relative flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/20 transition-all duration-150 cursor-pointer ${
                  (op as any).operationStatus &&
                  (op as any).operationStatus !== "active"
                    ? "border-violet-500/30 hover:border-violet-500/50 opacity-80"
                    : "border-border hover:border-primary/30"
                }`}
                onClick={() => {
                  const status = (op as any).operationStatus;
                  if (status === "before_court" || status === "archive") {
                    navigate("/operation-management");
                  } else {
                    navigate(`/operation/${op.id}`);
                  }
                }}
              >
                {/* Icon */}
                <div className="p-2.5 rounded-lg bg-blue-700/10 border border-blue-700/20 shrink-0">
                  <FolderOpen className="w-5 h-5 text-blue-700" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">
                      {op.name}
                    </span>
                    {(op as any).operationStatus === "before_court" && (
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-300 border-violet-500/30 border font-semibold shrink-0">
                        <Scale className="w-2.5 h-2.5 mr-1" />
                        Before Court
                      </Badge>
                    )}
                    {(op as any).operationStatus === "archive" && (
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-slate-500/20 text-slate-400 border-slate-500/30 border font-semibold shrink-0">
                        <Archive className="w-2.5 h-2.5 mr-1" />
                        Archive
                      </Badge>
                    )}
                  </div>
                  {/* Metadata badges */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                    {op.promisNumber && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="w-3 h-3" />
                        PROMIS:{" "}
                        <span className="text-foreground font-medium ml-0.5">
                          {op.promisNumber}
                        </span>
                      </span>
                    )}
                    {op.imsNumber && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="w-3 h-3" />
                        IMS:{" "}
                        <span className="text-foreground font-medium ml-0.5">
                          {op.imsNumber}
                        </span>
                      </span>
                    )}
                    {op.investigationUnit && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        <span className="text-foreground font-medium">
                          {op.investigationUnit}
                        </span>
                      </span>
                    )}
                  </div>
                  {(op as { matchContexts?: string[] }).matchContexts &&
                    (op as { matchContexts?: string[] }).matchContexts!.length >
                      0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(op as { matchContexts?: string[] })
                          .matchContexts!.slice(0, 3)
                          .map((ctx, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                            >
                              {ctx}
                            </span>
                          ))}
                        {(op as { matchContexts?: string[] }).matchContexts!
                          .length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +
                            {(op as { matchContexts?: string[] }).matchContexts!
                              .length - 3}{" "}
                            more
                          </span>
                        )}
                      </div>
                    )}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>
                      Created {format(new Date(op.createdAt), "d MMM yyyy")}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            {isSearching
              ? `${filtered.length} operation${filtered.length !== 1 ? "s" : ""} matched`
              : `${filtered.length} of ${operations?.length ?? 0} operations`}
          </p>
        )}
      </div>

      {/* Create Operation Dialog */}
      <CreateOperationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => utils.operation.list.invalidate()}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={o => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operation?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This action <strong>cannot be undone</strong>. The following
                  will be permanently deleted:
                </p>
                {deleteStats ? (
                  <ul className="text-sm space-y-1 pl-1">
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span>
                        <strong>{deleteStats.sheetCount}</strong> running sheet
                        {deleteStats.sheetCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span>
                        <strong>{deleteStats.rowCount}</strong> observation row
                        {deleteStats.rowCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span>
                        <strong>{deleteStats.targetCount}</strong> target
                        {deleteStats.targetCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Loading details…
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteId !== null && deleteOp.mutate({ id: deleteId })
              }
            >
              Delete Operation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
