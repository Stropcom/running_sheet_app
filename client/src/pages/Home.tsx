import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Search, FolderOpen, ChevronRight, Trash2, Calendar, Hash, Building2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPromis, setNewPromis] = useState("");
  const [newIms, setNewIms] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: deleteStats } = trpc.operation.deleteStats.useQuery(
    { id: deleteId! },
    { enabled: deleteId !== null }
  );

  const utils = trpc.useUtils();

  const { data: operations, isLoading } = trpc.operation.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: deepResults, isFetching: deepFetching } = trpc.operation.deepSearch.useQuery(
    { query: search },
    { enabled: isAuthenticated && search.trim().length > 0 }
  );

  const createOp = trpc.operation.create.useMutation({
    onSuccess: () => {
      utils.operation.list.invalidate();
      setCreateOpen(false);
      setNewName("");
      setNewPromis("");
      setNewIms("");
      setNewUnit("");
      toast.success("Operation created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteOp = trpc.operation.delete.useMutation({
    onSuccess: () => {
      utils.operation.list.invalidate();
      setDeleteId(null);
      toast.success("Operation deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // When a search query is active, use deep search results; otherwise show all operations
  const isSearching = search.trim().length > 0;
  const filtered = isSearching
    ? (deepResults ?? []).map((r) => ({
        id: r.operationId,
        name: r.operationName,
        promisNumber: r.promisNumber,
        imsNumber: r.imsNumber,
        investigationUnit: r.investigationUnit,
        matchContexts: r.matchContexts,
        createdAt: new Date(),
      }))
    : (operations ?? []).map((op) => ({ ...op, matchContexts: [] as string[] }));

  const handleCreate = () => {
    if (!newName.trim()) return;
    createOp.mutate({
      name: newName.trim(),
      promisNumber: newPromis.trim() || undefined,
      imsNumber: newIms.trim() || undefined,
      investigationUnit: newUnit.trim() || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Operations</h1>
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Operation
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search operations, sheets, targets, CINs, observations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {deepFetching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">Searching…</span>
          )}
        </div>

        {/* Operations list */}
        {isLoading || (isSearching && deepFetching && !deepResults) ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
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
              {search ? "Try a different search term" : "Create your first operation to get started"}
            </p>
            {!search && (
              <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                New Operation
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((op) => (
              <div
                key={op.id}
                className="group relative flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-primary/30 transition-all duration-150 cursor-pointer"
                onClick={() => navigate(`/operation/${op.id}`)}
              >
                {/* Icon */}
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                  <FolderOpen className="w-5 h-5 text-primary" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground truncate">{op.name}</span>
                  </div>
                  {/* Metadata badges */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                    {op.promisNumber && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="w-3 h-3" />
                        PROMIS: <span className="text-foreground font-medium ml-0.5">{op.promisNumber}</span>
                      </span>
                    )}
                    {op.imsNumber && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="w-3 h-3" />
                        IMS: <span className="text-foreground font-medium ml-0.5">{op.imsNumber}</span>
                      </span>
                    )}
                    {op.investigationUnit && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        <span className="text-foreground font-medium">{op.investigationUnit}</span>
                      </span>
                    )}
                  </div>
                  {(op as { matchContexts?: string[] }).matchContexts && (op as { matchContexts?: string[] }).matchContexts!.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(op as { matchContexts?: string[] }).matchContexts!.slice(0, 3).map((ctx, i) => (
                        <span key={i} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {ctx}
                        </span>
                      ))}
                      {(op as { matchContexts?: string[] }).matchContexts!.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{(op as { matchContexts?: string[] }).matchContexts!.length - 3} more</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>Created {format(new Date(op.createdAt), "d MMM yyyy")}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {user?.role === "admin" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(op.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Operation</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Operation Name <span className="text-destructive">*</span>
              </label>
              <Input

                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                PROMIS Number <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input

                value={newPromis}
                onChange={(e) => setNewPromis(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                IMS Number <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input

                value={newIms}
                onChange={(e) => setNewIms(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Investigation Unit <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input

                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createOp.isPending}
            >
              {createOp.isPending ? "Creating…" : "Create Operation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operation?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This action <strong>cannot be undone</strong>. The following will be permanently deleted:</p>
                {deleteStats ? (
                  <ul className="text-sm space-y-1 pl-1">
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span><strong>{deleteStats.sheetCount}</strong> running sheet{deleteStats.sheetCount !== 1 ? "s" : ""}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span><strong>{deleteStats.rowCount}</strong> observation row{deleteStats.rowCount !== 1 ? "s" : ""}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span><strong>{deleteStats.targetCount}</strong> target{deleteStats.targetCount !== 1 ? "s" : ""}</span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading details…</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteOp.mutate({ id: deleteId })}
            >
              Delete Operation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
