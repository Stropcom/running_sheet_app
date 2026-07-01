import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
  User,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type RegistryTarget = {
  id: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  v2f: string | null;
  v2: string | null;
  dep: string | null;
  arr: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedOperations: Array<{ operationId: number; operationName: string | null }>;
};

// ─── Target Form ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  tgt: "",
  hbf: "",
  hb: "",
  v1f: "",
  v1: "",
  v2f: "",
  v2: "",
  dep: "",
  arr: "",
};

type TargetForm = typeof EMPTY_FORM;

function TargetFormDialog({
  open,
  onClose,
  initial,
  onSave,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<TargetForm>;
  onSave: (data: TargetForm) => Promise<void>;
  title: string;
}) {
  const [form, setForm] = useState<TargetForm>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens with new initial values
  const handleOpen = () => {
    setForm({ ...EMPTY_FORM, ...initial });
  };

  const set = (field: keyof TargetForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Target name is required.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save target.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Target Name *</Label>
            <Input value={form.name} onChange={set("name")} placeholder="e.g. ALPHA or John Smith" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">TGT — Person Details</Label>
            <Input value={form.tgt} onChange={set("tgt")} placeholder="Full name, DOB, description…" />
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Home Address</p>
            <div className="space-y-2">
              <Input value={form.hbf} onChange={set("hbf")} placeholder="HBF — Full home address" />
              <Input value={form.hb} onChange={set("hb")} placeholder="HB — Short / area" />
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vehicle 1</p>
            <div className="space-y-2">
              <Input value={form.v1f} onChange={set("v1f")} placeholder="V1F — Full vehicle description" />
              <Input value={form.v1} onChange={set("v1")} placeholder="V1 — Short (reg / make)" />
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vehicle 2</p>
            <div className="space-y-2">
              <Input value={form.v2f} onChange={set("v2f")} placeholder="V2F — Full vehicle description" />
              <Input value={form.v2} onChange={set("v2")} placeholder="V2 — Short (reg / make)" />
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Locations</p>
            <div className="space-y-2">
              <Input value={form.dep} onChange={set("dep")} placeholder="DEP — Depart address" />
              <Input value={form.arr} onChange={set("arr")} placeholder="ARR — Arrive address" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link to Operation Dialog ─────────────────────────────────────────────────

function LinkOperationDialog({
  open,
  onClose,
  targetId,
  targetName,
  linkedOperationIds,
}: {
  open: boolean;
  onClose: () => void;
  targetId: number;
  targetName: string;
  linkedOperationIds: number[];
}) {
  const utils = trpc.useUtils();
  const { data: operations } = trpc.operation.list.useQuery(undefined, { enabled: open });
  const link = trpc.target.registry.linkToOperation.useMutation({
    onSuccess: () => { utils.target.registry.list.invalidate(); },
  });
  const unlink = trpc.target.registry.unlinkFromOperation.useMutation({
    onSuccess: () => { utils.target.registry.list.invalidate(); },
  });

  const handleToggle = async (operationId: number, isLinked: boolean) => {
    try {
      if (isLinked) {
        await unlink.mutateAsync({ targetId, operationId });
        toast.success("Unlinked from operation.");
      } else {
        await link.mutateAsync({ targetId, operationId });
        toast.success("Linked to operation.");
      }
    } catch {
      toast.error("Failed to update link.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Operations — {targetName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Toggle which operations this target is linked to.</p>
        <div className="space-y-2 max-h-64 overflow-y-auto py-2">
          {!operations ? (
            <Skeleton className="h-8 w-full" />
          ) : operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operations found.</p>
          ) : (
            operations.map(op => {
              const isLinked = linkedOperationIds.includes(op.id);
              return (
                <div
                  key={op.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                    isLinked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => handleToggle(op.id, isLinked)}
                >
                  <span className="text-sm font-medium">{op.name}</span>
                  {isLinked ? (
                    <Badge variant="default" className="text-xs gap-1">
                      <Link2 className="h-3 w-3" /> Linked
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Click to link</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Target Card ──────────────────────────────────────────────────────────────

function TargetCard({
  target,
  onEdit,
  onDelete,
  onLinkOps,
}: {
  target: RegistryTarget;
  onEdit: () => void;
  onDelete: () => void;
  onLinkOps: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const fields = [
    { label: "TGT", value: target.tgt },
    { label: "HBF", value: target.hbf },
    { label: "HB", value: target.hb },
    { label: "V1F", value: target.v1f },
    { label: "V1", value: target.v1 },
    { label: "V2F", value: target.v2f },
    { label: "V2", value: target.v2 },
    { label: "DEP", value: target.dep },
    { label: "ARR", value: target.arr },
  ].filter(f => f.value && f.value.trim());

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{target.name}</p>
          {target.tgt && (
            <p className="text-xs text-muted-foreground truncate">{target.tgt}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLinkOps} title="Link to operations">
            <Link2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit target">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} title="Delete target">
            <Trash2 className="h-4 w-4" />
          </Button>
          {fields.length > 0 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Linked operations */}
      {target.linkedOperations.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {target.linkedOperations.map(op => (
            <Badge key={op.operationId} variant="secondary" className="text-xs gap-1">
              <BookOpen className="h-3 w-3" />
              {op.operationName ?? `Op #${op.operationId}`}
            </Badge>
          ))}
        </div>
      )}

      {/* Expanded fields */}
      {expanded && fields.length > 0 && (
        <div className="border-t border-border px-4 py-3 grid grid-cols-1 gap-2">
          {fields.map(f => (
            <div key={f.label} className="flex gap-2 text-sm">
              <span className="font-mono text-xs font-semibold text-primary w-8 shrink-0 pt-0.5">{f.label}</span>
              <span className="text-muted-foreground">{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TargetRegistryPage() {
  const utils = trpc.useUtils();
  const { data: targets, isLoading } = trpc.target.registry.list.useQuery();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<RegistryTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegistryTarget | null>(null);
  const [linkTarget, setLinkTarget] = useState<RegistryTarget | null>(null);

  const createMutation = trpc.target.registry.create.useMutation({
    onSuccess: () => { utils.target.registry.list.invalidate(); toast.success("Target added to registry."); },
  });
  const updateMutation = trpc.target.registry.update.useMutation({
    onSuccess: () => { utils.target.registry.list.invalidate(); toast.success("Target updated."); },
  });
  const deleteMutation = trpc.target.registry.delete.useMutation({
    onSuccess: () => { utils.target.registry.list.invalidate(); toast.success("Target deleted from registry."); },
  });

  const filtered = useMemo(() => {
    if (!targets) return [];
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.tgt ?? "").toLowerCase().includes(q) ||
      (t.hb ?? "").toLowerCase().includes(q) ||
      (t.hbf ?? "").toLowerCase().includes(q) ||
      (t.v1 ?? "").toLowerCase().includes(q) ||
      (t.v1f ?? "").toLowerCase().includes(q) ||
      (t.v2 ?? "").toLowerCase().includes(q) ||
      (t.v2f ?? "").toLowerCase().includes(q) ||
      t.linkedOperations.some(op => (op.operationName ?? "").toLowerCase().includes(q))
    );
  }, [targets, search]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Target Registry</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All targets are stored here independently. Deleting an operation or running sheet does not remove targets.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Target
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search targets by name, details, or linked operation…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Stats */}
        {targets && (
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {targets.length} target{targets.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <User className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              {search ? "No targets match your search." : "No targets in the registry yet."}
            </p>
            {!search && (
              <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Add First Target
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => (
              <TargetCard
                key={t.id}
                target={t as RegistryTarget}
                onEdit={() => setEditTarget(t as RegistryTarget)}
                onDelete={() => setDeleteTarget(t as RegistryTarget)}
                onLinkOps={() => setLinkTarget(t as RegistryTarget)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <TargetFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Target to Registry"
        onSave={async (form) => {
          await createMutation.mutateAsync({
            name: form.name,
            tgt: form.tgt || null,
            hbf: form.hbf || null,
            hb: form.hb || null,
            v1f: form.v1f || null,
            v1: form.v1 || null,
            v2f: form.v2f || null,
            v2: form.v2 || null,
            dep: form.dep || null,
            arr: form.arr || null,
          });
        }}
      />

      {/* Edit dialog */}
      {editTarget && (
        <TargetFormDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          title={`Edit Target — ${editTarget.name}`}
          initial={{
            name: editTarget.name,
            tgt: editTarget.tgt ?? "",
            hbf: editTarget.hbf ?? "",
            hb: editTarget.hb ?? "",
            v1f: editTarget.v1f ?? "",
            v1: editTarget.v1 ?? "",
            v2f: editTarget.v2f ?? "",
            v2: editTarget.v2 ?? "",
            dep: editTarget.dep ?? "",
            arr: editTarget.arr ?? "",
          }}
          onSave={async (form) => {
            await updateMutation.mutateAsync({
              id: editTarget.id,
              name: form.name,
              tgt: form.tgt || null,
              hbf: form.hbf || null,
              hb: form.hb || null,
              v1f: form.v1f || null,
              v1: form.v1 || null,
              v2f: form.v2f || null,
              v2: form.v2 || null,
              dep: form.dep || null,
              arr: form.arr || null,
            });
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Target?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> from the registry. Any running sheets that referenced this target will have their target link cleared. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteMutation.mutateAsync({ id: deleteTarget.id });
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link to operations */}
      {linkTarget && (
        <LinkOperationDialog
          open={!!linkTarget}
          onClose={() => setLinkTarget(null)}
          targetId={linkTarget.id}
          targetName={linkTarget.name}
          linkedOperationIds={linkTarget.linkedOperations.map(o => o.operationId)}
        />
      )}
    </DashboardLayout>
  );
}
