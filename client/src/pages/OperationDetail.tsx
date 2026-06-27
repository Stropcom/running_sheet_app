import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Plus,
  FileText,
  ChevronRight,
  Trash2,
  Calendar,
  ArrowLeft,
  FolderOpen,
  Hash,
  Building2,
  UserPlus,
  X,
  Camera,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";

type CinEntry = { cin: string; hasImages: boolean };

export default function OperationDetail() {
  const { isAuthenticated, user } = useAuth();
  const params = useParams<{ id: string }>();
  const operationId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [cinList, setCinList] = useState<CinEntry[]>([]);
  const [cinInput, setCinInput] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: operation, isLoading: opLoading } = trpc.operation.get.useQuery(
    { id: operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  const { data: sheets, isLoading: sheetsLoading } = trpc.sheet.listByOperation.useQuery(
    { operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  const createSheet = trpc.sheet.create.useMutation({
    onSuccess: (data) => {
      utils.sheet.listByOperation.invalidate({ operationId });
      setCreateOpen(false);
      setNewTitle("");
      setCinList([]);
      setCinInput("");
      toast.success("Running sheet created");
      navigate(`/sheet/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => {
      utils.sheet.listByOperation.invalidate({ operationId });
      setDeleteId(null);
      toast.success("Sheet deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAddCin = () => {
    const trimmed = cinInput.trim();
    if (!trimmed) return;
    if (cinList.some((c) => c.cin.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("CIN already added");
      return;
    }
    setCinList((prev) => [...prev, { cin: trimmed, hasImages: false }]);
    setCinInput("");
  };

  const handleRemoveCin = (cin: string) => {
    setCinList((prev) => prev.filter((c) => c.cin !== cin));
  };

  const handleToggleImages = (cin: string) => {
    setCinList((prev) =>
      prev.map((c) => c.cin === cin ? { ...c, hasImages: !c.hasImages } : c)
    );
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createSheet.mutate({
      operationId,
      title: newTitle.trim(),
      sheetCins: cinList.length > 0 ? cinList : undefined,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setNewTitle("");
      setCinList([]);
      setCinInput("");
    }
    setCreateOpen(open);
  };

  const isLoading = opLoading || sheetsLoading;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Operations
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium truncate">
            {opLoading ? "Loading…" : (operation?.name ?? "Operation")}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <FolderOpen className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                {opLoading ? <Skeleton className="h-7 w-48" /> : (operation?.name ?? "Operation")}
              </h1>
            </div>
            {/* Operation metadata */}
            {!opLoading && operation && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 ml-11">
                {operation.promisNumber && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Hash className="w-3.5 h-3.5" />
                    PROMIS: <span className="text-foreground font-medium ml-0.5">{operation.promisNumber}</span>
                  </span>
                )}
                {operation.imsNumber && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Hash className="w-3.5 h-3.5" />
                    IMS: <span className="text-foreground font-medium ml-0.5">{operation.imsNumber}</span>
                  </span>
                )}
                {operation.investigationUnit && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="text-foreground font-medium">{operation.investigationUnit}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Running Sheet
          </Button>
        </div>

        {/* Sheets list */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : !sheets || sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted/40 mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">No running sheets yet</p>
            <p className="text-muted-foreground text-sm mb-4">
              Create the first running sheet for this operation
            </p>
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              New Running Sheet
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sheets.map((sheet) => {
              const parsedCins: CinEntry[] = (() => {
                try { return sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; }
                catch { return []; }
              })();
              return (
                <div
                  key={sheet.id}
                  className="group relative flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-primary/30 transition-all duration-150 cursor-pointer"
                  onClick={() => navigate(`/sheet/${sheet.id}`)}
                >
                  <div className="p-2.5 rounded-lg bg-muted/60 border border-border shrink-0">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-foreground truncate block">{sheet.title}</span>
                    {parsedCins.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {parsedCins.map((c) => (
                          <span
                            key={c.cin}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                              c.hasImages
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                : "border-border bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            {c.cin}
                            {c.hasImages && <Camera className="w-2.5 h-2.5" />}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>Created {format(new Date(sheet.createdAt), "d MMM yyyy, HH:mm")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {user?.role === "admin" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-8 h-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(sheet.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sheets && sheets.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            {sheets.length} running sheet{sheets.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Create Sheet Dialog */}
      <Dialog open={createOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Running Sheet</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Title */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Day 1 — Morning Shift"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>

            {/* Daily CIN list */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Daily CIN Roster <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Add the CINs of all members on duty today. Tick the camera icon if images were taken by that member.
              </p>

              {/* CIN input row */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Enter CIN and press Add"
                  value={cinInput}
                  onChange={(e) => setCinInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCin(); } }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCin}
                  disabled={!cinInput.trim()}
                  className="gap-1.5 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>

              {/* CIN list */}
              {cinList.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>CIN</span>
                    <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> Images</span>
                    <span></span>
                  </div>
                  {cinList.map((entry) => (
                    <div
                      key={entry.cin}
                      className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-sm font-mono font-medium text-foreground">{entry.cin}</span>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={entry.hasImages}
                          onCheckedChange={() => handleToggleImages(entry.cin)}
                          className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveCin(entry.cin)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createSheet.isPending}
            >
              {createSheet.isPending ? "Creating…" : "Create Sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Running Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the running sheet and all its rows, members, and certifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteSheet.mutate({ id: deleteId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
