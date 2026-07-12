import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  FolderOpen,
  Scale,
  Archive,
  ChevronRight,
  FileText,
  Building2,
  RotateCcw,
  ArrowRightLeft,
  CheckCircle2,
  Lock,
  Plus,
  Search,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { ViewToggle } from "@/components/ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";

type OpStatus = "before_court" | "archive";
type TargetStatus = "before_court" | "archive" | "active";

function StatusBadge({ status }: { status: TargetStatus }) {
  if (status === "before_court") {
    return (
      <Badge className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-300 border-violet-500/30 border font-semibold">
        Before Court
      </Badge>
    );
  }
  if (status === "archive") {
    return (
      <Badge className="text-[10px] px-1.5 py-0.5 bg-slate-500/20 text-slate-400 border-slate-500/30 border font-semibold">
        Archive
      </Badge>
    );
  }
  return null;
}

function OperationCard({
  op,
  onMoveToActive,
  onMoveTo,
  isAdmin,
}: {
  op: { id: number; name: string; status: string; promisNumber?: string | null; imsNumber?: string | null };
  onMoveToActive: () => void;
  onMoveTo: (status: OpStatus) => void;
  isAdmin: boolean;
}) {
  const [, navigate] = useLocation();
  const { data: sheets, isLoading: sheetsLoading } = trpc.sheet.listByOperation.useQuery(
    { operationId: op.id },
    { staleTime: 30_000 }
  );

  const sheetCount = sheets?.length ?? 0;

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* Operation header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/30">
        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-sm text-foreground flex-1 truncate">{op.name}</span>
        <StatusBadge status={op.status as TargetStatus} />
        {op.promisNumber && (
          <span className="text-[10px] text-muted-foreground hidden sm:block">PROMIS: {op.promisNumber}</span>
        )}
      </div>

      {/* Running sheets list */}
      <div className="divide-y divide-border/20">
        {sheetsLoading ? (
          <div className="px-4 py-3">
            <Skeleton className="h-5 w-48" />
          </div>
        ) : sheetCount === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground italic">No running sheets</div>
        ) : (
          sheets?.map((sheet) => (
            <div
              key={sheet.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors cursor-pointer group"
              onClick={() => navigate(`/sheet/${sheet.id}`)}
            >
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground flex-1 truncate">{sheet.title}</span>
              {sheet.closedAt ? (
                <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
              ) : null}
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </div>
          ))
        )}
      </div>

      {/* Action footer — admin only */}
      {isAdmin && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/10 border-t border-border/20 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            onClick={onMoveToActive}
          >
            <RotateCcw className="w-3 h-3" />
            Move to Active
          </Button>
          {op.status === "before_court" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7 border-slate-500/40 text-slate-400 hover:bg-slate-500/10"
              onClick={() => onMoveTo("archive")}
            >
              <Archive className="w-3 h-3" />
              Move to Archive
            </Button>
          )}
          {op.status === "archive" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
              onClick={() => onMoveTo("before_court")}
            >
              <Scale className="w-3 h-3" />
              Move to Before Court
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function OpManageTile({
  op,
  isAdmin,
  onMoveToActive,
  onMoveTo,
}: {
  op: { id: number; name: string; status: string; promisNumber?: string | null; imsNumber?: string | null };
  isAdmin: boolean;
  onMoveToActive: () => void;
  onMoveTo: (status: OpStatus) => void;
}) {
  const [, navigate] = useLocation();
  const { data: sheets, isLoading: sheetsLoading } = trpc.sheet.listByOperation.useQuery(
    { operationId: op.id },
    { staleTime: 30_000 }
  );
  const sheetCount = sheets?.length ?? 0;
  const closedCount = sheets?.filter((s) => !!s.closedAt).length ?? 0;

  return (
    <div className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
      <div className="flex items-start justify-between gap-2">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <StatusBadge status={op.status as TargetStatus} />
      </div>
      <p className="font-semibold text-foreground leading-tight line-clamp-2">{op.name}</p>
      {op.promisNumber && (
        <p className="text-xs text-muted-foreground">PROMIS: {op.promisNumber}</p>
      )}
      {sheetsLoading ? (
        <div className="h-4 w-24 rounded bg-muted/40 animate-pulse" />
      ) : (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span><span className="font-semibold text-foreground">{sheetCount}</span> sheet{sheetCount !== 1 ? "s" : ""}</span>
          <span><span className="font-semibold text-emerald-400">{closedCount}</span> closed</span>
        </div>
      )}
      {!sheetsLoading && sheetCount > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
          {sheets?.slice(0, 3).map((s) => (
            <button key={s.id} onClick={() => navigate(`/sheet/${s.id}`)}
              className="flex items-center gap-2 text-left hover:bg-accent/30 rounded px-1 py-0.5 transition-colors">
              {s.closedAt ? <Lock className="w-3 h-3 text-muted-foreground shrink-0" /> : <FileText className="w-3 h-3 text-muted-foreground shrink-0" />}
              <span className="text-xs text-foreground/80 truncate">{s.title}</span>
            </button>
          ))}
          {sheetCount > 3 && <p className="text-[10px] text-muted-foreground pl-1">+{sheetCount - 3} more</p>}
        </div>
      )}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-2 mt-auto">
          <Button size="sm" variant="outline"
            className="gap-1 text-xs h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            onClick={onMoveToActive}>
            <RotateCcw className="w-3 h-3" />Active
          </Button>
          {op.status === "before_court" && (
            <Button size="sm" variant="outline"
              className="gap-1 text-xs h-7 border-slate-500/40 text-slate-400 hover:bg-slate-500/10"
              onClick={() => onMoveTo("archive")}>
              <Archive className="w-3 h-3" />Archive
            </Button>
          )}
          {op.status === "archive" && (
            <Button size="sm" variant="outline"
              className="gap-1 text-xs h-7 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
              onClick={() => onMoveTo("before_court")}>
              <Scale className="w-3 h-3" />Before Court
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function OperationManagementPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const { data: beforeCourtOps, isLoading: bcLoading } = trpc.operation.listByStatus.useQuery(
    { status: "before_court" },
    { enabled: isAuthenticated, staleTime: 30_000 }
  );
  const { data: archiveOps, isLoading: archLoading } = trpc.operation.listByStatus.useQuery(
    { status: "archive" },
    { enabled: isAuthenticated, staleTime: 30_000 }
  );
  // Active operations — for the "move here" picker
  const { data: activeOps } = trpc.operation.list.useQuery(undefined, {
    enabled: isAuthenticated && isAdmin,
    staleTime: 30_000,
  });

  const setStatus = trpc.operation.setStatus.useMutation({
    onSuccess: () => {
      utils.operation.listByStatus.invalidate();
      utils.operation.list.invalidate();
      toast.success("Operation status updated");
      setConfirm(null);
      setPickerOpen(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setConfirm(null);
    },
  });

  const [confirm, setConfirm] = useState<{
    opId: number;
    opName: string;
    targetStatus: "active" | "before_court" | "archive";
  } | null>(null);

  // Picker dialog state: which tab is picking ("before_court" | "archive")
  const [pickerOpen, setPickerOpen] = useState<OpStatus | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const { viewMode } = useViewMode();

  const pickerOps = (activeOps ?? []).filter((op) =>
    op.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  if (!isAuthenticated) return null;

  const bcCount = beforeCourtOps?.length ?? 0;
  const archCount = archiveOps?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30">
            <ArrowRightLeft className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Archive</h1>
            <p className="text-sm text-muted-foreground">
              Manage operation status — Before Court and Archive
            </p>
          </div>
          <ViewToggle />
        </div>

        {/* Info banner */}
        <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300 leading-relaxed">
          <strong>Note:</strong> Operations in Before Court or Archive are read-only. Running sheets can only be exported for printing. To make changes, move the operation back to Active first. Only Admins can change operation status.
        </div>

        <Tabs defaultValue="before_court">
          <TabsList className="mb-5">
            <TabsTrigger value="before_court" className="gap-2">
              <Scale className="w-3.5 h-3.5" />
              Before Court
              {bcCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                  {bcCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="archive" className="gap-2">
              <Archive className="w-3.5 h-3.5" />
              Archive
              {archCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                  {archCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Before Court tab */}
          <TabsContent value="before_court">
            {/* Add operation button */}
            {isAdmin && (
              <div className="mb-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:text-violet-200"
                  onClick={() => { setPickerSearch(""); setPickerOpen("before_court"); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Move Active Operation to Before Court
                </Button>
              </div>
            )}
            {bcLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : bcCount === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="p-4 rounded-full bg-violet-500/10 border border-violet-500/20">
                  <CheckCircle2 className="w-8 h-8 text-violet-400" />
                </div>
                <p className="text-base font-semibold text-foreground">No operations Before Court</p>
                <p className="text-sm text-muted-foreground">
                  Use the button above to move an active operation here.
                </p>
              </div>
            ) : viewMode === "tile" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {beforeCourtOps?.map((op) => (
                  <OpManageTile key={op.id} op={op} isAdmin={isAdmin}
                    onMoveToActive={() => setConfirm({ opId: op.id, opName: op.name, targetStatus: "active" })}
                    onMoveTo={(s) => setConfirm({ opId: op.id, opName: op.name, targetStatus: s })} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {beforeCourtOps?.map((op) => (
                  <OperationCard
                    key={op.id}
                    op={op}
                    isAdmin={isAdmin}
                    onMoveToActive={() =>
                      setConfirm({ opId: op.id, opName: op.name, targetStatus: "active" })
                    }
                    onMoveTo={(s) =>
                      setConfirm({ opId: op.id, opName: op.name, targetStatus: s })
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Archive tab */}
          <TabsContent value="archive">
            {/* Add operation button */}
            {isAdmin && (
              <div className="mb-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-slate-500/40 text-slate-300 hover:bg-slate-500/10 hover:text-slate-200"
                  onClick={() => { setPickerSearch(""); setPickerOpen("archive"); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Move Active Operation to Archive
                </Button>
              </div>
            )}
            {archLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : archCount === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="p-4 rounded-full bg-slate-500/10 border border-slate-500/20">
                  <CheckCircle2 className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-base font-semibold text-foreground">No archived operations</p>
                <p className="text-sm text-muted-foreground">
                  Use the button above to move an active operation here.
                </p>
              </div>
            ) : viewMode === "tile" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archiveOps?.map((op) => (
                  <OpManageTile key={op.id} op={op} isAdmin={isAdmin}
                    onMoveToActive={() => setConfirm({ opId: op.id, opName: op.name, targetStatus: "active" })}
                    onMoveTo={(s) => setConfirm({ opId: op.id, opName: op.name, targetStatus: s })} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {archiveOps?.map((op) => (
                  <OperationCard
                    key={op.id}
                    op={op}
                    isAdmin={isAdmin}
                    onMoveToActive={() =>
                      setConfirm({ opId: op.id, opName: op.name, targetStatus: "active" })
                    }
                    onMoveTo={(s) =>
                      setConfirm({ opId: op.id, opName: op.name, targetStatus: s })
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Operation picker dialog — select active op to move */}
      <Dialog open={pickerOpen !== null} onOpenChange={(o) => !o && setPickerOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pickerOpen === "before_court" ? "Move to Before Court" : "Move to Archive"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Select an active operation to move. All running sheets must be closed before the move is allowed.
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search operations…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
              {pickerOps.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No active operations found</p>
              ) : (
                pickerOps.map((op) => (
                  <button
                    key={op.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/30 transition-colors text-left w-full group"
                    onClick={() => {
                      setPickerOpen(null);
                      setConfirm({ opId: op.id, opName: op.name, targetStatus: pickerOpen! });
                    }}
                  >
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{op.name}</p>
                      {op.promisNumber && (
                        <p className="text-[10px] text-muted-foreground">PROMIS: {op.promisNumber}</p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPickerOpen(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Operation Status?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Move <strong>{confirm?.opName}</strong> to{" "}
                  <strong>
                    {confirm?.targetStatus === "active"
                      ? "Active"
                      : confirm?.targetStatus === "before_court"
                        ? "Before Court"
                        : "Archive"}
                  </strong>
                  ?
                </p>
                {confirm?.targetStatus !== "active" && (
                  <p className="text-amber-400 text-xs">
                    All running sheets must be closed before this operation can be moved. If any are open, the move will be blocked.
                  </p>
                )}
                {confirm?.targetStatus === "active" && (
                  <p className="text-emerald-400 text-xs">
                    The operation will return to the main Operations folder and become fully editable again.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirm &&
                setStatus.mutate({ id: confirm.opId, status: confirm.targetStatus })
              }
              disabled={setStatus.isPending}
            >
              {setStatus.isPending ? "Moving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
