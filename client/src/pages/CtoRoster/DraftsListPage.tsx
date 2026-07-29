import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Plus,
  GitMerge,
  Trash2,
  CalendarDays,
  Clock,
  FileEdit,
  Pencil,
  Layers,
  FilePlus2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid, differenceInDays } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";

function safeFormat(
  d: Date | string | null | undefined,
  fmt: string,
  fallback = ""
): string {
  if (!d) return fallback;
  try {
    const dt = typeof d === "string" ? parseISO(d) : d;
    if (!isValid(dt)) return fallback;
    return format(dt, fmt);
  } catch {
    return fallback;
  }
}

export default function DraftsListPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const draftsQuery = trpc.ctoRoster.draft.list.useQuery();
  const drafts = draftsQuery.data ?? [];

  // ── Create dialog state ──────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [draftType, setDraftType] = useState<"seeded" | "standalone">("seeded");
  const [draftName, setDraftName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ── Rename dialog state ──────────────────────────────────────────────────
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");

  // ── Timeframe dialog state ───────────────────────────────────────────────
  const [timeframeOpen, setTimeframeOpen] = useState(false);
  const [timeframeId, setTimeframeId] = useState<number | null>(null);
  const [tfStart, setTfStart] = useState("");
  const [tfEnd, setTfEnd] = useState("");

  // ── Save-as-roster dialog state ──────────────────────────────────────────
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsDraftId, setSaveAsDraftId] = useState<number | null>(null);
  const [saveAsName, setSaveAsName] = useState("");

  // ── Mutations ────────────────────────────────────────────────────────────
  const createSeededMutation = trpc.ctoRoster.draft.create.useMutation({
    onSuccess: data => {
      toast.success("Draft created!");
      utils.ctoRoster.draft.list.invalidate();
      setCreateOpen(false);
      resetCreateForm();
      navigate(`/cto-roster/draft/${data.draftId}`);
    },
    onError: err => toast.error(err.message),
  });

  const createStandaloneMutation =
    trpc.ctoRoster.draft.createStandalone.useMutation({
      onSuccess: data => {
        toast.success("Standalone draft created!");
        utils.ctoRoster.draft.list.invalidate();
        setCreateOpen(false);
        resetCreateForm();
        navigate(`/cto-roster/draft/${data.draftId}`);
      },
      onError: err => toast.error(err.message),
    });

  const deleteMutation = trpc.ctoRoster.draft.delete.useMutation({
    onSuccess: () => {
      toast.success("Draft deleted.");
      utils.ctoRoster.draft.list.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const renameMutation = trpc.ctoRoster.draft.rename.useMutation({
    onSuccess: () => {
      toast.success("Draft renamed.");
      utils.ctoRoster.draft.list.invalidate();
      setRenameOpen(false);
    },
    onError: err => toast.error(err.message),
  });

  const setTimeframeMutation = trpc.ctoRoster.draft.setTimeframe.useMutation({
    onSuccess: () => {
      toast.success("Timeframe updated.");
      utils.ctoRoster.draft.list.invalidate();
      setTimeframeOpen(false);
    },
    onError: err => toast.error(err.message),
  });

  const saveAsRosterMutation = trpc.ctoRoster.draft.saveAsRoster.useMutation({
    onSuccess: data => {
      toast.success("Saved as roster!");
      utils.ctoRoster.savedRoster.list.invalidate();
      setSaveAsOpen(false);
      setSaveAsName("");
      navigate(`/cto-roster/saved-roster/${data.savedRosterId}`);
    },
    onError: err => toast.error(err.message),
  });

  const resetCreateForm = () => {
    setDraftName("");
    setStartDate("");
    setEndDate("");
    setDraftType("seeded");
  };

  const handleCreate = () => {
    if (!draftName.trim()) {
      toast.error("Draft name is required.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Start and end dates are required.");
      return;
    }
    if (startDate > endDate) {
      toast.error("Start date must be before end date.");
      return;
    }
    if (draftType === "standalone") {
      createStandaloneMutation.mutate({
        name: draftName.trim(),
        startDate,
        endDate,
      });
    } else {
      createSeededMutation.mutate({
        name: draftName.trim(),
        startDate,
        endDate,
      });
    }
  };

  const openRename = (id: number, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameId(id);
    setRenameName(currentName);
    setRenameOpen(true);
  };

  const openTimeframe = (
    id: number,
    start: Date | string,
    end: Date | string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setTimeframeId(id);
    setTfStart(safeFormat(start, "yyyy-MM-dd"));
    setTfEnd(safeFormat(end, "yyyy-MM-dd"));
    setTimeframeOpen(true);
  };

  const openSaveAs = (id: number, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSaveAsDraftId(id);
    setSaveAsName(currentName);
    setSaveAsOpen(true);
  };

  const isAdmin = user?.role === "admin";

  return (
    <DashboardLayout>
      <div className="container max-w-3xl py-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileEdit className="h-6 w-6 text-amber-500" />
              Draft Rosters
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Plan roster changes in a draft before merging or saving as a named
              roster.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              New Draft
            </Button>
          )}
        </div>

        {/* Info banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Two draft types:</strong> <strong>Seeded</strong> drafts
            copy the live roster and can be merged back.{" "}
            <strong>Standalone</strong> drafts have their own teams and members
            — they cannot be merged but can be saved as a named roster for EA
            checking and planning.
          </div>
        </div>

        {/* Draft list */}
        {draftsQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <FileEdit className="h-12 w-12 opacity-30" />
            <div>
              <div className="font-semibold">No drafts yet</div>
              <div className="text-sm">
                Create a draft to start planning roster changes.
              </div>
            </div>
            {isAdmin && (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create first draft
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {drafts.map(draft => {
              const exp = draft.expiresAt
                ? typeof draft.expiresAt === "string"
                  ? parseISO(draft.expiresAt)
                  : (draft.expiresAt as Date)
                : null;
              const daysLeft = exp ? differenceInDays(exp, new Date()) : null;
              const isExpired = daysLeft !== null && daysLeft <= 0;
              const isWarning =
                daysLeft !== null && daysLeft <= 3 && daysLeft > 0;
              const isStandalone = (draft as any).draftType === "standalone";

              return (
                <Card
                  key={draft.id}
                  className={cn(
                    "transition-all hover:shadow-md cursor-pointer",
                    isExpired
                      ? "border-red-300 bg-red-50"
                      : isWarning
                        ? "border-amber-300 bg-amber-50"
                        : ""
                  )}
                  onClick={() => navigate(`/cto-roster/draft/${draft.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base">
                            {draft.name}
                          </span>
                          {isStandalone ? (
                            <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                              <Layers className="h-3 w-3 mr-1" />
                              Standalone
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs text-blue-600 border-blue-200"
                            >
                              <GitMerge className="h-3 w-3 mr-1" />
                              Seeded
                            </Badge>
                          )}
                          {isExpired && (
                            <Badge variant="destructive" className="text-xs">
                              Expired
                            </Badge>
                          )}
                          {isWarning && (
                            <Badge className="text-xs bg-amber-500 text-white">
                              Expires in {daysLeft}d
                            </Badge>
                          )}
                          {!isExpired && !isWarning && daysLeft !== null && (
                            <Badge variant="outline" className="text-xs">
                              Expires {safeFormat(exp, "d MMM")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {safeFormat(draft.startDate, "d MMM yyyy")} –{" "}
                            {safeFormat(draft.endDate, "d MMM yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Created {safeFormat(draft.createdAt, "d MMM yyyy")}
                          </span>
                        </div>
                        {draft.createdByName && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            by {draft.createdByName}
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div
                          className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end"
                          onClick={e => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Rename draft"
                            onClick={e => openRename(draft.id, draft.name, e)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Change timeframe"
                            onClick={e =>
                              openTimeframe(
                                draft.id,
                                draft.startDate,
                                draft.endDate,
                                e
                              )
                            }
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </Button>
                          {isStandalone && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-purple-700 border-purple-200 hover:bg-purple-50"
                              onClick={e => openSaveAs(draft.id, draft.name, e)}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" />
                              Save as Roster
                            </Button>
                          )}
                          {!isStandalone && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() =>
                                navigate(`/cto-roster/draft/${draft.id}/merge`)
                              }
                            >
                              <GitMerge className="h-3.5 w-3.5 mr-1" />
                              Merge
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete draft "${draft.name}"? This cannot be undone.`
                                )
                              ) {
                                deleteMutation.mutate({ draftId: draft.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Create draft dialog ────────────────────────────────────────────── */}
        <Dialog
          open={createOpen}
          onOpenChange={o => {
            setCreateOpen(o);
            if (!o) resetCreateForm();
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New Draft Roster</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {/* Type selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraftType("seeded")}
                  className={cn(
                    "rounded-lg border-2 p-3 text-left transition-all",
                    draftType === "seeded"
                      ? "border-blue-500 bg-blue-50"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-sm mb-1">
                    <GitMerge className="h-4 w-4 text-blue-500" />
                    Seeded
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Copies live roster. Can be merged back.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDraftType("standalone")}
                  className={cn(
                    "rounded-lg border-2 p-3 text-left transition-all",
                    draftType === "standalone"
                      ? "border-purple-500 bg-purple-50"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-sm mb-1">
                    <FilePlus2 className="h-4 w-4 text-purple-500" />
                    Standalone
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Own teams & members. Save as named roster.
                  </div>
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Draft Name</Label>
                <Input
                  placeholder="e.g. August Plan A"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              {draftType === "seeded" && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  This draft will expire in <strong>14 days</strong> if not
                  merged.
                </div>
              )}
              {draftType === "standalone" && (
                <div className="text-xs text-muted-foreground bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  Standalone drafts have their own teams and members. They{" "}
                  <strong>cannot be merged</strong> with the live roster, but
                  can be saved as a named roster and checked with EA Compliance.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  createSeededMutation.isPending ||
                  createStandaloneMutation.isPending
                }
              >
                {createSeededMutation.isPending ||
                createStandaloneMutation.isPending
                  ? "Creating…"
                  : "Create Draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Rename dialog ─────────────────────────────────────────────────── */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Draft</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label>New Name</Label>
              <Input
                className="mt-1.5"
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!renameId || !renameName.trim()) return;
                  renameMutation.mutate({
                    draftId: renameId,
                    name: renameName.trim(),
                  });
                }}
                disabled={renameMutation.isPending}
              >
                {renameMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Timeframe dialog ──────────────────────────────────────────────── */}
        <Dialog open={timeframeOpen} onOpenChange={setTimeframeOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Timeframe</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={tfStart}
                  onChange={e => setTfStart(e.target.value)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={tfEnd}
                  onChange={e => setTfEnd(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTimeframeOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!timeframeId || !tfStart || !tfEnd) return;
                  if (tfStart > tfEnd) {
                    toast.error("Start must be before end.");
                    return;
                  }
                  setTimeframeMutation.mutate({
                    draftId: timeframeId,
                    startDate: tfStart,
                    endDate: tfEnd,
                  });
                }}
                disabled={setTimeframeMutation.isPending}
              >
                {setTimeframeMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Save as Roster dialog ─────────────────────────────────────────── */}
        <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Save as Named Roster</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="text-sm text-muted-foreground">
                This will create a permanent saved roster from this standalone
                draft. The draft will remain unchanged.
              </div>
              <div>
                <Label>Roster Name</Label>
                <Input
                  className="mt-1.5"
                  placeholder="e.g. NAIDOC Week 2025"
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!saveAsDraftId || !saveAsName.trim()) {
                    toast.error("Roster name is required.");
                    return;
                  }
                  saveAsRosterMutation.mutate({
                    draftId: saveAsDraftId,
                    name: saveAsName.trim(),
                  });
                }}
                disabled={saveAsRosterMutation.isPending}
              >
                {saveAsRosterMutation.isPending ? "Saving…" : "Save Roster"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
