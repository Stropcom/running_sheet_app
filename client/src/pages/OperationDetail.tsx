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
  Pencil,
  Target,
  Save,
  Search,
  CheckCircle2,
  LockKeyhole,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { CopyMoveSheetDialog } from "@/components/CopyMoveSheetDialog";
import { CopyPlus } from "lucide-react";
import { useLocation, useParams, useSearch } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";

type CinEntry = { cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean };

/** Single target card — shows name + 5 type fields, inline edit, delete */
function TargetCard({
  target,
  operationId,
  onDeleted,
  initialExpanded,
  fromSheetId,
}: {
  target: { id: number; name: string; tgt: string | null; hbf: string | null; hb: string | null; v1f: string | null; v1: string | null; v2f: string | null; v2: string | null; dep: string | null; arr: string | null };
  operationId: number;
  onDeleted: () => void;
  initialExpanded?: boolean;
  fromSheetId?: number;
}) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [name, setName] = useState(target.name);
  const [tgt, setTgt] = useState(target.tgt ?? "");
  const [hbf, setHbf] = useState(target.hbf ?? "");
  const [hb, setHb] = useState(target.hb ?? "");
  const [v1f, setV1f] = useState(target.v1f ?? "");
  const [v1, setV1] = useState(target.v1 ?? "");
  const [v2f, setV2f] = useState(target.v2f ?? "");
  const [v2, setV2] = useState(target.v2 ?? "");
  const [dep, setDep] = useState(target.dep ?? "");
  const [arr, setArr] = useState(target.arr ?? "");
  const [dirty, setDirty] = useState(false);

  const update = trpc.target.update.useMutation({
    onSuccess: () => { utils.target.list.invalidate({ operationId }); setDirty(false); toast.success("Target saved"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const removeFromOp = trpc.target.registry.unlinkFromOperation.useMutation({
    onSuccess: () => { utils.target.list.invalidate({ operationId }); onDeleted(); toast.success("Target removed from operation"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const removeFromSheet = trpc.target.setSheetTarget.useMutation({
    onSuccess: () => {
      toast.success("Target removed from sheet");
      if (fromSheetId) navigate(`/sheet/${fromSheetId}`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const mark = (fn: () => void) => { fn(); setDirty(true); };

  // Per-target shortcuts
  const { data: targetShortcutList, refetch: refetchShortcuts } = trpc.targetShortcuts.list.useQuery(
    { targetId: target.id },
    { enabled: expanded }
  );
  const [newScTrigger, setNewScTrigger] = useState("");
  const [newScExpansion, setNewScExpansion] = useState("");
  const [editingScId, setEditingScId] = useState<number | null>(null);
  const [editScTrigger, setEditScTrigger] = useState("");
  const [editScExpansion, setEditScExpansion] = useState("");
  const createSc = trpc.targetShortcuts.create.useMutation({
    onSuccess: () => { refetchShortcuts(); setNewScTrigger(""); setNewScExpansion(""); toast.success("Shortcut added"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateSc = trpc.targetShortcuts.update.useMutation({
    onSuccess: () => { refetchShortcuts(); setEditingScId(null); toast.success("Shortcut updated"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const deleteSc = trpc.targetShortcuts.delete.useMutation({
    onSuccess: () => { refetchShortcuts(); toast.success("Shortcut deleted"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <>
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Target className="w-4 h-4 text-primary shrink-0" />
        <span className="flex-1 font-semibold text-sm text-foreground truncate">{target.name}</span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border/50">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name, Born</label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          </div>
          {([
            { label: "Target (TGT)",           val: tgt, set: (v: string) => mark(() => setTgt(v)) },
            { label: "Home Address Full (HBF)", val: hbf, set: (v: string) => mark(() => setHbf(v)) },
            { label: "Home (HB)",               val: hb,  set: (v: string) => mark(() => setHb(v)) },
            { label: "Vehicle 1 Full (V1F)",    val: v1f, set: (v: string) => mark(() => setV1f(v)) },
            { label: "Vehicle (V1)",            val: v1,  set: (v: string) => mark(() => setV1(v)) },
            { label: "Vehicle 2 Full (V2F)",    val: v2f, set: (v: string) => mark(() => setV2f(v)) },
            { label: "Vehicle (V2)",            val: v2,  set: (v: string) => mark(() => setV2(v)) },
            { label: "Depart (DEP)",            val: dep, set: (v: string) => mark(() => setDep(v)) },
            { label: "Arrive (ARR)",            val: arr, set: (v: string) => mark(() => setArr(v)) },
          ] as { label: string; val: string; set: (v: string) => void }[]).map(({ label, val, set }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
              <Input value={val} onChange={(e) => set(e.target.value)} />
            </div>
          ))}
          <div className="flex items-center justify-between">
            {fromSheetId ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeFromSheet.mutate({ sheetId: fromSheetId, targetId: null })}
                disabled={removeFromSheet.isPending}
              >
                <X className="w-3.5 h-3.5" />
                {removeFromSheet.isPending ? "Removing…" : "Remove from sheet"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                onClick={() => setConfirmDelete(true)}
                disabled={removeFromOp.isPending}
              >
                <X className="w-3.5 h-3.5" />
                {removeFromOp.isPending ? "Removing…" : "Remove from operation"}
              </Button>
            )}
            <Button size="sm" className="gap-2" onClick={() => update.mutate({ id: target.id, name, tgt, hbf, hb, v1f, v1, v2f, v2, dep, arr })} disabled={update.isPending || !dirty}>
              <Save className="w-3.5 h-3.5" />
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>

          {/* ── Per-target shortcuts ── */}
          <div className="mt-4 pt-4 border-t border-border/50 flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Shortcuts</p>
            {/* Existing shortcuts */}
            {(targetShortcutList ?? []).map((sc) =>
              editingScId === sc.id ? (
                <div key={sc.id} className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="flex gap-2">
                    <Input
                      className="w-28 font-mono text-sm"
                      placeholder="trigger"
                      value={editScTrigger}
                      onChange={(e) => setEditScTrigger(e.target.value)}
                    />
                    <Input
                      className="flex-1 text-sm"
                      placeholder="expansion text"
                      value={editScExpansion}
                      onChange={(e) => setEditScExpansion(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditingScId(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => updateSc.mutate({ id: sc.id, trigger: editScTrigger, expansion: editScExpansion })}
                      disabled={updateSc.isPending || !editScTrigger || !editScExpansion}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={sc.id} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">{sc.trigger}</span>
                  <span className="flex-1 text-sm text-foreground/80 break-words">{sc.expansion}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => { setEditingScId(sc.id); setEditScTrigger(sc.trigger); setEditScExpansion(sc.expansion); }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => deleteSc.mutate({ id: sc.id })}
                      disabled={deleteSc.isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )
            )}
            {/* Add new shortcut */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  className="w-28 font-mono text-sm"
                  placeholder="trigger"
                  value={newScTrigger}
                  onChange={(e) => setNewScTrigger(e.target.value)}
                />
                <Input
                  className="flex-1 text-sm"
                  placeholder="expansion text"
                  value={newScExpansion}
                  onChange={(e) => setNewScExpansion(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="self-start gap-1.5"
                onClick={() => createSc.mutate({ targetId: target.id, trigger: newScTrigger, expansion: newScExpansion })}
                disabled={createSc.isPending || !newScTrigger.trim() || !newScExpansion.trim()}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Shortcut
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove target from operation?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{target.name}</strong> from this operation. The target will remain in the Target Registry and can be re-linked at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => { setConfirmDelete(false); removeFromOp.mutate({ targetId: target.id, operationId }); }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/** Add Target tab panel — lists all targets for the operation, allows adding more */
function TargetPanel({ operationId, autoExpandId, fromSheetId }: { operationId: number; autoExpandId?: number; fromSheetId?: number }) {
  const utils = trpc.useUtils();
  const { data: targets, isLoading } = trpc.target.list.useQuery({ operationId });
  const { data: allTargets } = trpc.target.listAll.useQuery();
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"idle" | "new" | "link">("idle");
  const [linkSearch, setLinkSearch] = useState("");

  const create = trpc.target.create.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      setNewName("");
      setMode("idle");
      toast.success("Target added");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Link = link the existing target record to this operation (no duplication)
  const linkTarget = trpc.target.registry.linkToOperation.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      setMode("idle");
      setLinkSearch("");
      toast.success("Target linked to operation");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Targets already in this operation (to avoid duplicates in link list)
  const existingIds = new Set((targets ?? []).map((t) => t.id));

  // Filter allTargets for the link picker — exclude already-added ones, apply search
  const linkOptions = (allTargets ?? []).filter((t) => {
    if (existingIds.has(t.id)) return false;
    const q = linkSearch.toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.tgt ?? "").toLowerCase().includes(q) ||
      (t.operationName ?? "").toLowerCase().includes(q)
    );
  });

  if (isLoading) return (
    <div className="flex flex-col gap-3">
      {[1,2,3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {targets && targets.length > 0 ? (
        targets.map((t) => (
          <TargetCard key={t.id} target={t} operationId={operationId} onDeleted={() => {}} initialExpanded={autoExpandId === t.id} fromSheetId={fromSheetId} />
        ))
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-3 rounded-xl bg-muted/40 mb-3">
            <Target className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No targets added yet</p>
        </div>
      )}

      {/* Add / Link target forms */}
      {mode === "new" && (
        <div className="flex gap-2 mt-1">
          <Input
            autoFocus
            placeholder="Full name, born (e.g. John SMITH, born 1 Jan 1980)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) create.mutate({ operationId, name: newName.trim() });
              if (e.key === "Escape") setMode("idle");
            }}
          />
          <Button size="sm" onClick={() => newName.trim() && create.mutate({ operationId, name: newName.trim() })} disabled={!newName.trim() || create.isPending}>
            {create.isPending ? "Adding…" : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      )}

      {mode === "link" && (
        <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              className="h-8 text-sm"
              placeholder="Search by name, TGT code or operation…"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
            />
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setMode("idle"); setLinkSearch(""); }}>Cancel</Button>
          </div>
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {linkOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {linkSearch ? "No matching targets" : "All existing targets are already in this operation"}
              </p>
            ) : (
              linkOptions.map((t) => (
                <button
                  key={t.id}
                  className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                  onClick={() => linkTarget.mutate({
                    targetId: t.id,
                    operationId,
                  })}
                  disabled={linkTarget.isPending}
                >
                  <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.tgt ? <span className="font-mono mr-2">TGT: {t.tgt}</span> : null}
                      {t.operationName ? <span>Op: {t.operationName}</span> : null}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setMode("new")}>
            <Plus className="w-3.5 h-3.5" />
            New Target
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setMode("link")}>
            <Search className="w-3.5 h-3.5" />
            Link Existing
          </Button>
        </div>
      )}
    </div>
  );
}


/** Individual sheet card — fetches cert status and highlights green when all CINs certified */
function SheetCard({
  sheet,
  cinNames,
  cinEntries,
  isAdmin,
  targetName,
  onNavigate,
  onDelete,
  onCopyMove,
}: {
  sheet: { id: number; title: string; createdAt: Date; sheetCins?: string | null; closedAt?: number | null; closedByCIN?: string | null };
  cinNames: string[];
  cinEntries?: CinEntry[];
  isAdmin: boolean;
  targetName?: string | null;
  onNavigate: () => void;
  onDelete: () => void;
  onCopyMove: () => void;
}) {
  const { data: certStatus } = trpc.sheet.cinCertStatus.useQuery(
    { sheetId: sheet.id, cins: cinNames },
    { enabled: cinNames.length > 0, staleTime: 30_000 },
  );

  const allCertified =
    cinNames.length > 0 &&
    certStatus !== undefined &&
    certStatus.every((s) => s.certified);

  const isClosed = !!sheet.closedAt;

  return (
    <div
      className={`group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
        isClosed
          ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 opacity-70"
          : allCertified
            ? "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/80"
            : "border-border bg-card hover:bg-accent/20 hover:border-primary/30"
      }`}
      onClick={onNavigate}
    >
      <div className={`p-2.5 rounded-lg border shrink-0 ${
        isClosed ? "bg-slate-200/60 dark:bg-slate-700/40 border-slate-300 dark:border-slate-600" :
        allCertified ? "bg-emerald-500/20 border-emerald-500/40" : "bg-muted/60 border-border"
      }`}>
        {isClosed
          ? <LockKeyhole className="w-5 h-5 text-slate-400" />
          : <FileText className={`w-5 h-5 ${
              allCertified ? "text-black dark:text-emerald-400" : "text-muted-foreground"
            }`} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold truncate ${
            isClosed ? "text-slate-500 dark:text-slate-400" :
            allCertified ? "text-black dark:text-emerald-300" : "text-foreground"
          }`}>{sheet.title}</span>
          {isClosed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-400/50 bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 font-medium shrink-0">
              <LockKeyhole className="w-2.5 h-2.5" />
              CLOSED
            </span>
          )}
        </div>
        {cinNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {cinNames.map((cin) => {
              const certified = certStatus?.find((s) => s.cin === cin)?.certified ?? false;
              const entry = cinEntries?.find((e) => e.cin === cin);
              return (
                <span
                  key={cin}
                  className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border font-mono ${
                    certified
                      ? "border-emerald-500/50 bg-emerald-500/15 text-black dark:text-emerald-400"
                      : "border-red-500/40 bg-red-500/10 text-red-400"
                  }`}
                >
                  {entry?.isTeamLeader && <span className="text-yellow-400" title="Team Leader">★</span>}
                  {entry?.isAuthor && <span className="text-sky-400" title="Author">✏</span>}
                  {cin}
                </span>
              );
            })}
          </div>
        )}
        {targetName && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
            <Target className="w-3 h-3 shrink-0" />
            <span className="truncate">{targetName}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>Created {format(new Date(sheet.createdAt), "d MMM yyyy, HH:mm")}</span>
        </div>
        {isClosed && sheet.closedByCIN && sheet.closedAt && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 dark:text-slate-500">
            <LockKeyhole className="w-3 h-3 shrink-0" />
            <span>Closed by <span className="font-mono font-semibold">{sheet.closedByCIN}</span> on {format(new Date(sheet.closedAt), "d MMM yyyy, HH:mm")}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <>
            {/* Copy/Move always available — even when closed */}
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 text-sky-500 hover:text-sky-400 hover:bg-sky-500/10"
              title="Copy or Move sheet"
              onClick={(e) => { e.stopPropagation(); onCopyMove(); }}
            >
              <CopyPlus className="w-4 h-4" />
            </Button>
            {/* Delete button removed from RS panel — delete is only in the RS Edit dialog */}
          </>
        )}
        <ChevronRight className={`w-4 h-4 transition-colors ${
          isClosed ? "text-slate-400" :
          allCertified ? "text-black dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
        }`} />
      </div>
    </div>
  );
}

export default function OperationDetail() {
  const { isAuthenticated, user } = useAuth();
  const params = useParams<{ id: string }>();
  const operationId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const search = useSearch();

  // Derive active tab and target to auto-expand from URL search params
  const searchParams = new URLSearchParams(search);
  const activeTab = searchParams.get('tab') === 'target' ? 'target' : 'sheets';
  const autoExpandTargetId = searchParams.get('targetId') ? parseInt(searchParams.get('targetId')!, 10) : undefined;
  const fromSheetId = searchParams.get('fromSheet') ? parseInt(searchParams.get('fromSheet')!, 10) : undefined;

  // Create sheet state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTargetId, setNewTargetId] = useState<number | null>(null);
  const [newTargetName, setNewTargetName] = useState("");
  const [targetMode, setTargetMode] = useState<"none" | "new" | "link">("none");
  const [cinList, setCinList] = useState<CinEntry[]>([]);
  const [cinInput, setCinInput] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [sheetSearch, setSheetSearch] = useState("");
  // Copy/Move sheet dialog state
  const [copyMoveSheet, setCopyMoveSheet] = useState<{ id: number; title: string } | null>(null);

  // Edit operation state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPromis, setEditPromis] = useState("");
  const [editIms, setEditIms] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const utils = trpc.useUtils();

  const { data: operation, isLoading: opLoading } = trpc.operation.get.useQuery(
    { id: operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  const { data: sheets, isLoading: sheetsLoading } = trpc.sheet.listByOperation.useQuery(
    { operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  // Fetch targets for this operation (used in create sheet dialog)
  const { data: operationTargets } = trpc.target.list.useQuery(
    { operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  // Fetch ALL targets across all operations for the create-sheet target picker
  const { data: allTargetsForSheet } = trpc.target.listAll.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const [targetSearch, setTargetSearch] = useState("");

  // Fetch all users so we can add a whole team at once
  const { data: allUsers } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  // Populate edit form when operation loads
  useEffect(() => {
    if (operation) {
      setEditName(operation.name ?? "");
      setEditPromis(operation.promisNumber ?? "");
      setEditIms(operation.imsNumber ?? "");
      setEditUnit(operation.investigationUnit ?? "");
    }
  }, [operation]);

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

  const updateOperation = trpc.operation.update.useMutation({
    onSuccess: () => {
      utils.operation.get.invalidate({ id: operationId });
      setEditOpen(false);
      toast.success("Operation updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Delete operation (moved from Home page into Edit dialog)
  const [deleteOpConfirm, setDeleteOpConfirm] = useState(false);
  const { data: deleteOpStats } = trpc.operation.deleteStats.useQuery(
    { id: operationId },
    { enabled: deleteOpConfirm }
  );
  const deleteOp = trpc.operation.delete.useMutation({
    onSuccess: () => {
      toast.success("Operation deleted");
      navigate("/");
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

  const handleAddTeam = (teamKey: "TEAM1" | "TEAM2" | "PTT") => {
    if (!allUsers) { toast.error("User list not available"); return; }
    const members = allUsers.filter((u) => u.team === teamKey);
    if (members.length === 0) { toast.error("No members found in that team"); return; }
    let added = 0;
    setCinList((prev) => {
      let updated = [...prev];
      for (const m of members) {
        if (!updated.some((c) => c.cin.toLowerCase() === m.cin.toLowerCase())) {
          updated = [...updated, { cin: m.cin, hasImages: false, isTeamLeader: false, isAuthor: false }];
          added++;
        }
      }
      return updated;
    });
    if (added === 0) toast.info("All team members already added");
    else toast.success(`Added ${added} member${added !== 1 ? "s" : ""} from ${teamKey.replace("TEAM", "TEAM ")}`); 
  };

  const handleAddCin = () => {
    const trimmed = cinInput.trim();
    if (!trimmed) return;
    if (cinList.some((c) => c.cin.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("CIN already added");
      return;
    }
    setCinList((prev) => [...prev, { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false }]);
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
      targetId: targetMode === "link" ? (newTargetId ?? undefined) : undefined,
      targetName: targetMode === "new" ? (newTargetName.trim() || undefined) : undefined,
      sheetCins: cinList.length > 0 ? cinList : undefined,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setNewTitle("");
      setNewTargetId(null);
      setNewTargetName("");
      setTargetMode("none");
      setTargetSearch("");
      setCinList([]);
      setCinInput("");
    }
    setCreateOpen(open);
  };

  const handleEditSave = () => {
    if (!editName.trim()) return;
    updateOperation.mutate({
      id: operationId,
      name: editName.trim(),
      promisNumber: editPromis.trim() || null,
      imsNumber: editIms.trim() || null,
      investigationUnit: editUnit.trim() || null,
    });
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
              {!opLoading && operation && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-7 h-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditOpen(true)}
                  title="Edit operation details"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
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

        {/* Main tabs: Running Sheets | Add Target */}
        <Tabs value={activeTab} onValueChange={(v) => {
            const sp = new URLSearchParams(window.location.search);
            sp.set("tab", v);
            if (v !== "target") sp.delete("targetId");
            navigate(`/operation/${operationId}?${sp.toString()}`);
          }} className="mt-2">
          <TabsList className="mb-4">
            <TabsTrigger value="sheets">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Running Sheets
            </TabsTrigger>
            <TabsTrigger value="target">
              <Target className="w-3.5 h-3.5 mr-1.5" />
              Add Target
            </TabsTrigger>
          </TabsList>

          {/* ── Running Sheets tab ── */}
          <TabsContent value="sheets">
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
            {/* Search bar */}
            <div className="relative mb-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by title, CIN or target…"
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            {sheets.filter((sheet) => {
              if (!sheetSearch.trim()) return true;
              const q = sheetSearch.trim().toLowerCase();
              if (sheet.title.toLowerCase().includes(q)) return true;
              const cins: CinEntry[] = (() => { try { return sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { return []; } })();
              if (cins.some((c) => c.cin.toLowerCase().includes(q))) return true;
              const tgt = operationTargets?.find((t) => t.id === (sheet as { targetId?: number | null }).targetId);
              if (tgt && tgt.name.toLowerCase().includes(q)) return true;
              return false;
            }).map((sheet) => {
              const parsedCins: CinEntry[] = (() => {
                try {
                  const raw: CinEntry[] = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
                  return [...raw].sort((a, b) => {
                    if (a.isTeamLeader && !b.isTeamLeader) return -1;
                    if (!a.isTeamLeader && b.isTeamLeader) return 1;
                    const aNum = parseInt(a.cin, 10); const bNum = parseInt(b.cin, 10);
                    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                    return a.cin.localeCompare(b.cin);
                  });
                }
                catch { return []; }
              })();
              const cinNames = parsedCins.map((c) => c.cin);
              const assignedTarget = operationTargets?.find((t) => t.id === (sheet as { targetId?: number | null }).targetId);
              return (
                <SheetCard
                  key={sheet.id}
                  sheet={sheet}
                  cinNames={cinNames}
                  cinEntries={parsedCins}
                  isAdmin={user?.role === "admin" || user?.role === "member"}
                  targetName={assignedTarget?.name ?? null}
                  onNavigate={() => navigate(`/sheet/${sheet.id}`)}
                  onDelete={() => setDeleteId(sheet.id)}
                  onCopyMove={() => setCopyMoveSheet({ id: sheet.id, title: sheet.title })}
                />
              );
            })}
          </div>
        )}

        {sheets && sheets.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            {sheets.length} running sheet{sheets.length !== 1 ? "s" : ""}
          </p>
        )}
          </TabsContent>

          {/* ── Add Target tab ── */}
          <TabsContent value="target">
            <TargetPanel operationId={operationId} autoExpandId={autoExpandTargetId} fromSheetId={fromSheetId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Operation Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Operation</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Operation Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Operation name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">PROMIS Number</label>
              <Input
                placeholder="e.g. PROM-2024-001"
                value={editPromis}
                onChange={(e) => setEditPromis(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">IMS Number</label>
              <Input
                placeholder="e.g. IMS-2024-001"
                value={editIms}
                onChange={(e) => setEditIms(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Investigation Unit</label>
              <Input
                placeholder="e.g. Major Crime Unit"
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between w-full">
            <div className="flex-1">
              {user?.role === "admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={() => { setEditOpen(false); setDeleteOpConfirm(true); }}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Operation
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                onClick={handleEditSave}
                disabled={!editName.trim() || updateOperation.isPending}
              >
                {updateOperation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Operation Confirmation */}
      <AlertDialog open={deleteOpConfirm} onOpenChange={(o) => !o && setDeleteOpConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operation?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This action <strong>cannot be undone</strong>. The following will be permanently deleted:</p>
                {deleteOpStats ? (
                  <ul className="text-sm space-y-1 pl-1">
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span><strong>{deleteOpStats.sheetCount}</strong> running sheet{deleteOpStats.sheetCount !== 1 ? "s" : ""}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span><strong>{deleteOpStats.rowCount}</strong> observation row{deleteOpStats.rowCount !== 1 ? "s" : ""}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span><strong>{deleteOpStats.targetCount}</strong> target{deleteOpStats.targetCount !== 1 ? "s" : ""}</span>
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
              onClick={() => deleteOp.mutate({ id: operationId })}
            >
              Delete Operation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

            {/* Target selector — New / Link Existing / None */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Target <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (newTargetId === t.id) { setNewTargetId(null); setTargetMode("none"); }
                      else { setNewTargetId(t.id); setTargetMode("link"); setNewTargetName(""); }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      newTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{t.name}</span>
                    {newTargetId === t.id && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  </button>
                ))}

                {/* New Target inline input */}
                {targetMode === "new" && (
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Full name, born (e.g. John SMITH, born 1 Jan 1980)"
                      value={newTargetName}
                      onChange={(e) => setNewTargetName(e.target.value)}
                      autoFocus
                      className="flex-1"
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setTargetMode("none"); setNewTargetName(""); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {/* Link Existing search panel */}
                {targetMode === "link" && newTargetId === null && (
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <Input
                        autoFocus
                        className="h-8 text-sm"
                        placeholder="Search by name, TGT code or operation…"
                        value={targetSearch}
                        onChange={(e) => setTargetSearch(e.target.value)}
                      />
                      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setTargetMode("none"); setTargetSearch(""); }}>Cancel</Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = targetSearch.toLowerCase();
                        return t.name.toLowerCase().includes(q) || (t.tgt ?? "").toLowerCase().includes(q) || (t.operationName ?? "").toLowerCase().includes(q);
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">{targetSearch ? "No matching targets" : "Start typing to search"}</p>
                      ) : (
                        (allTargetsForSheet ?? []).filter(t => {
                          const q = targetSearch.toLowerCase();
                          return t.name.toLowerCase().includes(q) || (t.tgt ?? "").toLowerCase().includes(q) || (t.operationName ?? "").toLowerCase().includes(q);
                        }).map(t => (
                          <button
                            key={t.id}
                            type="button"
                            className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                            onClick={() => { setNewTargetId(t.id); setTargetSearch(""); setTargetMode("link"); }}
                          >
                            <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t.tgt ? <span className="font-mono mr-2">TGT: {t.tgt}</span> : null}
                                {t.operationName ? <span>Op: {t.operationName}</span> : null}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip */}
                {targetMode === "link" && newTargetId !== null && !(operationTargets ?? []).find(t => t.id === newTargetId) && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{(allTargetsForSheet ?? []).find(t => t.id === newTargetId)?.name}</span>
                    <button type="button" onClick={() => { setNewTargetId(null); setTargetMode("none"); }} className="hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {/* Action buttons */}
                {targetMode !== "new" && !(targetMode === "link" && newTargetId === null) && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => { setTargetMode("new"); setNewTargetId(null); }}>
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => { setTargetMode("link"); setNewTargetId(null); setTargetSearch(""); }}>
                      <Search className="w-3.5 h-3.5" /> Link Existing
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* TEAM */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                TEAM <span className="text-muted-foreground font-normal">(optional)</span>
              </label>

              {/* CIN input row */}
              <div className="flex gap-2 mb-2">
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
              {/* Team group buttons — only shown to admins who have allUsers loaded */}
              {user?.role === "admin" && (
                <div className="flex gap-1.5 mb-3">
                  <span className="text-xs text-muted-foreground self-center mr-1">Add team:</span>
                  {(["TEAM1", "TEAM2", "PTT"] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddTeam(t)}
                      className="text-xs h-7 px-2.5"
                    >
                      {t === "TEAM1" ? "TEAM 1" : t === "TEAM2" ? "TEAM 2" : "PTT"}
                    </Button>
                  ))}
                </div>
              )}

              {/* CIN list */}
              {cinList.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_40px_52px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>CIN</span>
                    <span className="flex items-center gap-1 justify-center" title="Team Leader"><span className="text-yellow-400">★</span> TL</span>
                    <span className="flex items-center gap-1 justify-center" title="Author"><span className="text-sky-400">✏</span> Author</span>
                    <span className="flex items-center justify-center"><Camera className="w-3 h-3" /></span>
                    <span></span>
                  </div>
                  {cinList.map((entry) => (
                    <div
                      key={entry.cin}
                      className="grid grid-cols-[1fr_40px_52px_40px_32px] items-center px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-sm font-mono font-medium text-foreground">{entry.cin}</span>
                      {/* Team Leader — radio: selecting one clears all others */}
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!entry.isTeamLeader}
                          onCheckedChange={() =>
                            setCinList((prev) =>
                              prev.map((c) => ({ ...c, isTeamLeader: c.cin === entry.cin ? !entry.isTeamLeader : false }))
                            )
                          }
                          className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                        />
                      </div>
                      {/* Author — radio: selecting one clears all others */}
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!entry.isAuthor}
                          onCheckedChange={() =>
                            setCinList((prev) =>
                              prev.map((c) => ({ ...c, isAuthor: c.cin === entry.cin ? !entry.isAuthor : false }))
                            )
                          }
                          className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                        />
                      </div>
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

      {/* Copy / Move sheet dialog */}
      {copyMoveSheet && (
        <CopyMoveSheetDialog
          open={copyMoveSheet !== null}
          onOpenChange={(v) => { if (!v) setCopyMoveSheet(null); }}
          sheetId={copyMoveSheet.id}
          sheetTitle={copyMoveSheet.title}
          currentOperationId={operationId}
        />
      )}
    </DashboardLayout>
  );
}
