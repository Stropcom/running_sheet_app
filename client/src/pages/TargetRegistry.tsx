import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Trash2,
  Link2,
  ChevronRight,
  BookOpen,
  Save,
  Target,
  X,
  ArrowDownAZ,
  Clock,
  Folder,
  Car,
  Home,
  Hash,
  AlertTriangle,
  Merge,
} from "lucide-react";
import { ViewToggle } from "@/components/ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";
import { EntityAutocompleteInput } from "@/components/EntityAutocompleteInput";
import { extractShortVehicle, extractShortTarget, extractShortAddress } from "@/lib/addressFormat";
import { TargetMergeDialog, type ExistingTargetLike } from "@/components/TargetMergeDialog";

// ─── Types ───────────────────────────────────────────────────────────────────

type ExtraVehicle = { full: string; short: string };
type WildField = { label: string; value: string };

type RegistryTarget = {
  id: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  v2f: string | null; // legacy
  v2: string | null;  // legacy
  dep: string | null;
  arr: string | null;
  extraVehicles: string | null; // JSON: ExtraVehicle[]
  wildFields: string | null;    // JSON: WildField[]
  createdAt: Date;
  updatedAt: Date;
  linkedOperations: Array<{ operationId: number; operationName: string | null }>;
};

function parseExtraVehicles(json: string | null | undefined): ExtraVehicle[] {
  if (!json) return [];
  try { return JSON.parse(json) as ExtraVehicle[]; } catch { return []; }
}
function parseWildFields(json: string | null | undefined): WildField[] {
  if (!json) return [];
  try { return JSON.parse(json) as WildField[]; } catch { return []; }
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

// ─── Target Card (inline edit, same as OperationDetail) ───────────────────────

function TargetCard({
  target,
  onDeleted,
  onLinkOps,
  defaultExpanded = false,
}: {
  target: RegistryTarget;
  onDeleted: () => void;
  onLinkOps: () => void;
  defaultExpanded?: boolean;
}) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Editable fields
  const [name, setName] = useState(target.name);
  const [tgt, setTgt] = useState(target.tgt ?? "");
  const [hbf, setHbf] = useState(target.hbf ?? "");
  const [hb, setHb] = useState(target.hb ?? "");
  const [v1f, setV1f] = useState(target.v1f ?? "");
  const [v1, setV1] = useState(target.v1 ?? "");
  const [dep, setDep] = useState(target.dep ?? "");
  const [arr, setArr] = useState(target.arr ?? "");
  // Dynamic extra vehicles (V2+): initialise from extraVehicles JSON, falling back to legacy v2f/v2
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(() => {
    const parsed = parseExtraVehicles(target.extraVehicles);
    if (parsed.length > 0) return parsed;
    // Migrate legacy v2f/v2 if present
    if (target.v2f || target.v2) return [{ full: target.v2f ?? "", short: target.v2 ?? "" }];
    return [];
  });
  // Numbered wild fields (#1, #2, …)
  const [wildFields, setWildFields] = useState<WildField[]>(() => parseWildFields(target.wildFields));
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-sync editable fields when the underlying record actually changes on
  // the server (e.g. a duplicate-target merge updates it while this card
  // is already mounted, since it's keyed by id and doesn't remount) — the
  // useState initializers above only run once, so without this the card
  // keeps showing whatever was true when it first mounted. Skipped while
  // the user has unsaved local edits so an in-progress edit isn't clobbered
  // by a background refetch.
  useEffect(() => {
    if (dirty) return;
    setName(target.name);
    setTgt(target.tgt ?? "");
    setHbf(target.hbf ?? "");
    setHb(target.hb ?? "");
    setV1f(target.v1f ?? "");
    setV1(target.v1 ?? "");
    setDep(target.dep ?? "");
    setArr(target.arr ?? "");
    const parsedVehicles = parseExtraVehicles(target.extraVehicles);
    setExtraVehicles(
      parsedVehicles.length > 0
        ? parsedVehicles
        : target.v2f || target.v2
          ? [{ full: target.v2f ?? "", short: target.v2 ?? "" }]
          : []
    );
    setWildFields(parseWildFields(target.wildFields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.updatedAt?.getTime()]);

  const mark = (fn: () => void) => { fn(); setDirty(true); };

  const addVehicle = () => { setExtraVehicles(v => [...v, { full: "", short: "" }]); setDirty(true); };
  const removeVehicle = (i: number) => { setExtraVehicles(v => v.filter((_, idx) => idx !== i)); setDirty(true); };
  const updateVehicle = (i: number, field: 'full' | 'short', val: string) => {
    setExtraVehicles(v => v.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
    setDirty(true);
  };
  const update = trpc.target.registry.update.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
      utils.target.getById.invalidate({ id: target.id });
      utils.target.listAll.invalidate();
      setDirty(false);
      toast.success("Target saved");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const del = trpc.target.registry.delete.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
      onDeleted();
      toast.success("Target deleted");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <>
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <Target className="w-4 h-4 text-primary shrink-0" />
        <span className="flex-1 font-semibold text-sm text-foreground truncate">{target.name}</span>
        {/* Linked operations badges */}
        {target.linkedOperations.length > 0 && (
          <div className="hidden sm:flex flex-wrap gap-1 mr-2">
            {target.linkedOperations.map(op => (
              <Badge key={op.operationId} variant="secondary" className="text-xs gap-1">
                <BookOpen className="h-3 w-3" />
                {op.operationName ?? `Op #${op.operationId}`}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLinkOps} title="Link to operations">
            <Link2 className="h-4 w-4" />
          </Button>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>

      {/* Expanded inline edit form — identical to OperationDetail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border/50">
          {/* Linked ops on mobile */}
          {target.linkedOperations.length > 0 && (
            <div className="flex sm:hidden flex-wrap gap-1">
              {target.linkedOperations.map(op => (
                <Badge key={op.operationId} variant="secondary" className="text-xs gap-1">
                  <BookOpen className="h-3 w-3" />
                  {op.operationName ?? `Op #${op.operationId}`}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name, Born</label>
            <EntityAutocompleteInput
              entityType="person"
              value={name}
              onChange={v => { setName(v); setDirty(true); }}
              onBlur={(e) => {
                const short = extractShortTarget(e.target.value);
                if (short && !tgt) mark(() => setTgt(short));
              }}
            />
          </div>
          {/* Target (TGT) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target (TGT)</label>
            <Input value={tgt} onChange={e => mark(() => setTgt(e.target.value))} />
          </div>

          {/* Home Address Full (HBF) — with Google Places autocomplete */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Home Address Full (HBF)</label>
            <AddressAutocompleteInput
              value={hbf}
              onChange={(v) => mark(() => setHbf(v))}
              onShortAddress={(short) => { if (!hb) mark(() => setHb(short)); }}
              onBlur={(e) => {
                const short = extractShortAddress(e.target.value);
                if (short && !hb) mark(() => setHb(short));
              }}
              placeholder="Search or type address…"
            />
          </div>

          {/* Home (HB) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Home (HB)</label>
            <Input value={hb} onChange={e => mark(() => setHb(e.target.value))} />
          </div>

          {/* Vehicle 1 Full (V1F) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle 1 Full (V1F)</label>
            <EntityAutocompleteInput
              entityType="vehicle"
              value={v1f}
              onChange={v => mark(() => setV1f(v))}
              onBlur={(e) => {
                const short = extractShortVehicle(e.target.value);
                if (short && !v1) mark(() => setV1(short));
              }}
            />
          </div>

          {/* Vehicle (V1) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle (V1)</label>
            <Input value={v1} onChange={e => mark(() => setV1(e.target.value))} />
          </div>

          {/* ── Dynamic extra vehicles (V2, V3, …) ── */}
          {extraVehicles.map((ev, i) => {
            const num = i + 2; // V2, V3, …
            return (
              <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                    <Car className="w-3 h-3" /> Vehicle {num}
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeVehicle(i)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle {num} Full (V{num}F)</label>
                  <EntityAutocompleteInput
                    entityType="vehicle"
                    value={ev.full}
                    onChange={v => updateVehicle(i, 'full', v)}
                    onBlur={(e) => {
                      const short = extractShortVehicle(e.target.value);
                      if (short && !ev.short) updateVehicle(i, 'short', short);
                    }}
                    placeholder="Full description…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle {num} (V{num})</label>
                  <Input value={ev.short} onChange={e => updateVehicle(i, 'short', e.target.value)} placeholder="Short (e.g. rego)…" />
                </div>
              </div>
            );
          })}
          <Button size="sm" variant="outline" className="gap-1.5 self-start" onClick={addVehicle}>
            <Plus className="w-3.5 h-3.5" /> Add Vehicle
          </Button>

          {/* ── Depart / Arrive ── */}
          {([
            { label: "Depart (DEP)", val: dep, set: (v: string) => mark(() => setDep(v)) },
            { label: "Arrive (ARR)", val: arr, set: (v: string) => mark(() => setArr(v)) },
          ] as { label: string; val: string; set: (v: string) => void }[]).map(({ label, val, set }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
              <Input value={val} onChange={e => set(e.target.value)} />
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Target
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => update.mutate({
                id: target.id, name,
                tgt: tgt || null, hbf: hbf || null, hb: hb || null,
                v1f: v1f || null, v1: v1 || null,
                dep: dep || null, arr: arr || null,
                extraVehicles: JSON.stringify(extraVehicles),
                wildFields: JSON.stringify(wildFields),
              })}
              disabled={update.isPending || !dirty}
            >
              <Save className="w-3.5 h-3.5" />
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete target?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{target.name}</strong> from the registry? Any running sheets that referenced this target will have their target link cleared. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { setConfirmDelete(false); del.mutate({ id: target.id }); }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Add Target Dialog ────────────────────────────────────────────────────────

const EMPTY_FORM = { name: "", tgt: "", hbf: "", hb: "", v1f: "", v1: "", dep: "", arr: "" };
type TargetForm = typeof EMPTY_FORM;

function AddTargetDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: TargetForm & { extraVehicles: ExtraVehicle[]; wildFields: WildField[] }) => Promise<void>;
}) {
  const [form, setForm] = useState<TargetForm>(EMPTY_FORM);
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>([]);
  const [wildFields, setWildFields] = useState<WildField[]>([]);
  const [saving, setSaving] = useState(false);
  const utils = trpc.useUtils();

  // ── Possible-duplicate detection (fires on Save, not while typing) ──
  // A name that fuzzy-matches an existing target offers a merge instead of
  // silently creating a lookalike duplicate record.
  const [dupMatch, setDupMatch] = useState<{ id: number; name: string; reason: string } | null>(null);
  const [existingFull, setExistingFull] = useState<ExistingTargetLike | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setExtraVehicles([]);
    setWildFields([]);
    setDupMatch(null);
    setExistingFull(null);
    setMergeOpen(false);
    onClose();
  };

  const setField = (field: keyof TargetForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const saveAsNew = async () => {
    setSaving(true);
    try {
      await onSave({ ...form, extraVehicles, wildFields });
      resetAndClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save target.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Target name is required."); return; }
    setCheckingDup(true);
    try {
      const match = await utils.target.registry.findPossibleDuplicate.fetch({ name: form.name });
      if (match) {
        setDupMatch(match);
      } else {
        await saveAsNew();
      }
    } catch {
      // If the duplicate check itself fails, don't block the save.
      await saveAsNew();
    } finally {
      setCheckingDup(false);
    }
  };

  const handleMergeInstead = async () => {
    if (!dupMatch) return;
    const full = await utils.target.getById.fetch({ id: dupMatch.id });
    if (!full) { toast.error("Couldn't load the existing target."); return; }
    setExistingFull(full);
    setDupMatch(null);
    setMergeOpen(true);
  };

  return (
    <>
    <Dialog open={open && !mergeOpen} onOpenChange={v => { if (!v) resetAndClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Target to Registry</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name, Born *</label>
            <EntityAutocompleteInput
              entityType="person"
              value={form.name}
              onChange={v => setForm(f => ({ ...f, name: v }))}
              onBlur={(e) => {
                const short = extractShortTarget(e.target.value);
                if (short) setForm(f => ({ ...f, tgt: f.tgt || short }));
              }}
              placeholder="e.g. John SMITH, born 1 Jan 1980"
              autoFocus
            />
          </div>
          {/* Target (TGT) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target (TGT)</label>
            <Input value={form.tgt} onChange={setField("tgt")} />
          </div>

          {/* Home Address Full (HBF) — with Google Places autocomplete */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Home Address Full (HBF)</label>
            <AddressAutocompleteInput
              value={form.hbf}
              onChange={(v) => setForm(f => ({ ...f, hbf: v }))}
              onShortAddress={(short) => setForm(f => ({ ...f, hb: f.hb || short }))}
              onBlur={(e) => {
                const short = extractShortAddress(e.target.value);
                if (short) setForm(f => ({ ...f, hb: f.hb || short }));
              }}
              placeholder="Search or type address…"
            />
          </div>

          {/* Home (HB) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Home (HB)</label>
            <Input value={form.hb} onChange={setField("hb")} />
          </div>

          {/* Vehicle 1 Full (V1F) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle 1 Full (V1F)</label>
            <EntityAutocompleteInput
              entityType="vehicle"
              value={form.v1f}
              onChange={v => setForm(f => ({ ...f, v1f: v }))}
              onBlur={(e) => {
                const short = extractShortVehicle(e.target.value);
                if (short) setForm(f => ({ ...f, v1: f.v1 || short }));
              }}
            />
          </div>

          {/* Vehicle (V1) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle (V1)</label>
            <Input value={form.v1} onChange={setField("v1")} />
          </div>

          {/* Dynamic extra vehicles */}
          {extraVehicles.map((ev, i) => {
            const num = i + 2;
            return (
              <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5"><Car className="w-3 h-3" /> Vehicle {num}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setExtraVehicles(v => v.filter((_, idx) => idx !== i))}><X className="w-3 h-3" /></Button>
                </div>
                <EntityAutocompleteInput
                  entityType="vehicle"
                  value={ev.full}
                  onChange={v => setExtraVehicles(list => list.map((item, idx) => idx === i ? { ...item, full: v } : item))}
                  onBlur={(e) => {
                    const short = extractShortVehicle(e.target.value);
                    if (short) setExtraVehicles(v => v.map((item, idx) => idx === i ? { ...item, short: item.short || short } : item));
                  }}
                  placeholder={`Vehicle ${num} Full (V${num}F)…`}
                />
                <Input value={ev.short} onChange={e => setExtraVehicles(v => v.map((item, idx) => idx === i ? { ...item, short: e.target.value } : item))} placeholder={`Vehicle ${num} (V${num})…`} />
              </div>
            );
          })}
          <Button size="sm" variant="outline" className="gap-1.5 self-start" onClick={() => setExtraVehicles(v => [...v, { full: "", short: "" }])}>
            <Plus className="w-3.5 h-3.5" /> Add Vehicle
          </Button>

          {/* Wild fields */}
          {wildFields.map((wf, i) => (
            <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-500 uppercase tracking-wide flex items-center gap-1.5"><Hash className="w-3 h-3" /> Wild Field {wf.label}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setWildFields(v => v.filter((_, idx) => idx !== i).map((f, idx) => ({ ...f, label: `#${idx + 1}` })))}><X className="w-3 h-3" /></Button>
              </div>
              <Input value={wf.value} onChange={e => setWildFields(v => v.map((item, idx) => idx === i ? { ...item, value: e.target.value } : item))} placeholder={`${wf.label} value…`} />
            </div>
          ))}
          <Button size="sm" variant="outline" className="gap-1.5 self-start border-amber-500/40 text-amber-500 hover:bg-amber-500/10" onClick={() => setWildFields(v => [...v, { label: `#${v.length + 1}`, value: "" }])}>
            <Hash className="w-3.5 h-3.5" /> Add Wild Field
          </Button>

          {/* Depart / Arrive */}
          {([
            { label: "Depart (DEP)", field: "dep" as keyof TargetForm },
            { label: "Arrive (ARR)", field: "arr" as keyof TargetForm },
          ]).map(({ label, field }) => (
            <div key={field} className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
              <Input value={form[field]} onChange={setField(field)} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={saving || checkingDup}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || checkingDup}>
            {checkingDup ? "Checking…" : saving ? "Saving…" : "Save Target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Possible duplicate — asks before either creating a lookalike or merging */}
    <AlertDialog open={dupMatch !== null} onOpenChange={v => { if (!v) setDupMatch(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            Possible duplicate target
          </AlertDialogTitle>
          <AlertDialogDescription>
            "{form.name}" looks like it may be the same person as an existing target, <strong>{dupMatch?.name}</strong> ({dupMatch?.reason}). Is this the same person?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col sm:flex-col gap-2">
          <Button onClick={handleMergeInstead} className="w-full">
            <Merge className="w-4 h-4 mr-1.5" /> Yes — merge details
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setDupMatch(null); saveAsNew(); }}
          >
            No, different person — create new
          </Button>
          <AlertDialogCancel onClick={() => setDupMatch(null)} className="w-full mt-0">
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Field-level merge into the existing target */}
    {existingFull && (
      <TargetMergeDialog
        open={mergeOpen}
        onOpenChange={v => { setMergeOpen(v); if (!v) setExistingFull(null); }}
        existing={existingFull}
        incoming={{ ...form, extraVehicles, wildFields }}
        onMerged={() => {
          utils.target.registry.list.invalidate();
          resetAndClose();
        }}
      />
    )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TargetRegistryPage() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const { data: targets, isLoading } = trpc.target.registry.list.useQuery();

  const { viewMode } = useViewMode();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"alpha" | "recent" | "operation">("alpha");
  const [showCreate, setShowCreate] = useState(false);
  const [linkTarget, setLinkTarget] = useState<RegistryTarget | null>(null);
  // Store just the id, not a snapshot of the target object — deriving it
  // live from `targets` below means the tile dialog always reflects the
  // latest data (e.g. right after a merge), instead of freezing whatever
  // was true at the moment the tile was clicked.
  const [selectedTileTargetId, setSelectedTileTargetId] = useState<number | null>(null);
  const selectedTileTarget =
    (targets?.find(t => t.id === selectedTileTargetId) as RegistryTarget | undefined) ?? null;

  const createMutation = trpc.target.registry.create.useMutation({
    onSuccess: () => { utils.target.registry.list.invalidate(); toast.success("Target added to registry."); },
  });

  const filtered = useMemo(() => {
    if (!targets) return [];
    const q = search.trim().toLowerCase();
    const searched = !q ? [...targets] : targets.filter(t =>
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

    return [...searched].sort((a, b) => {
      if (sortBy === "alpha") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "recent") {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === "operation") {
        // Sort by first linked operation name alphabetically; unlinked targets go last
        const aOp = a.linkedOperations
          .map(o => o.operationName ?? "")
          .sort((x, y) => x.localeCompare(y))[0] ?? "";
        const bOp = b.linkedOperations
          .map(o => o.operationName ?? "")
          .sort((x, y) => x.localeCompare(y))[0] ?? "";
        if (!aOp && bOp) return 1;   // a unlinked → goes after b
        if (aOp && !bOp) return -1;  // b unlinked → a comes first
        const opCmp = aOp.localeCompare(bOp);
        return opCmp !== 0 ? opCmp : a.name.localeCompare(b.name); // tie-break by name
      }
      return 0;
    });
  }, [targets, search, sortBy]);

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
          <div className="flex items-center gap-2">
            <ViewToggle />
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Add Target
            </Button>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search targets by name, details, or linked operation…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Sort toggle buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant={sortBy === "alpha" ? "default" : "outline"}
              className="gap-1.5 h-9 px-3 text-xs"
              onClick={() => setSortBy("alpha")}
              title="Sort A–Z"
            >
              <ArrowDownAZ className="w-3.5 h-3.5" />
              A–Z
            </Button>
            <Button
              size="sm"
              variant={sortBy === "recent" ? "default" : "outline"}
              className="gap-1.5 h-9 px-3 text-xs"
              onClick={() => setSortBy("recent")}
              title="Sort by most recently updated"
            >
              <Clock className="w-3.5 h-3.5" />
              Recent
            </Button>
            <Button
              size="sm"
              variant={sortBy === "operation" ? "default" : "outline"}
              className="gap-1.5 h-9 px-3 text-xs"
              onClick={() => setSortBy("operation")}
              title="Sort by operation name"
            >
              <Folder className="w-3.5 h-3.5" />
              Operation
            </Button>
          </div>
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
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              {search ? "No targets match your search." : "No targets in the registry yet."}
            </p>
            {!search && (
              <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Add First Target
              </Button>
            )}
          </div>
        ) : viewMode === "tile" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <div
                key={t.id}
                className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                onClick={() => setSelectedTileTargetId(t.id)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                    <Target className="w-4 h-4 text-primary" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-sky-400 hover:bg-sky-500/10"
                    onClick={e => { e.stopPropagation(); setLinkTarget(t as RegistryTarget); }}
                    title="Link to operations"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Name */}
                <p className="font-semibold text-foreground leading-tight line-clamp-2">{t.name}</p>

                {/* Key details */}
                <div className="flex flex-col gap-1 mt-auto">
                  {(t.v1f || t.v1) && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Car className="w-3 h-3 shrink-0" />
                      <span className="truncate text-foreground/80">{t.v1f ?? t.v1}</span>
                    </span>
                  )}
                  {(t.hbf || t.hb) && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Home className="w-3 h-3 shrink-0" />
                      <span className="truncate text-foreground/80">{t.hbf ?? t.hb}</span>
                    </span>
                  )}
                </div>

                {/* Linked operations */}
                {t.linkedOperations.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                    {t.linkedOperations.slice(0, 2).map(op => (
                      <Badge key={op.operationId} variant="secondary" className="text-xs gap-1">
                        <BookOpen className="h-3 w-3" />
                        {op.operationName ?? `Op #${op.operationId}`}
                      </Badge>
                    ))}
                    {t.linkedOperations.length > 2 && (
                      <Badge variant="outline" className="text-xs">+{t.linkedOperations.length - 2}</Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => (
              <TargetCard
                key={t.id}
                target={t as RegistryTarget}
                onDeleted={() => {}}
                onLinkOps={() => setLinkTarget(t as RegistryTarget)}
              />
            ))}
          </div>
        )}

      {/* Tile view — target detail dialog */}
      {selectedTileTarget && (
        <Dialog open={!!selectedTileTarget} onOpenChange={(open) => { if (!open) setSelectedTileTargetId(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                {selectedTileTarget.name}
              </DialogTitle>
            </DialogHeader>
            <TargetCard
              target={selectedTileTarget}
              onDeleted={() => { setSelectedTileTargetId(null); utils.target.registry.list.invalidate(); }}
              onLinkOps={() => { setLinkTarget(selectedTileTarget); setSelectedTileTargetId(null); }}
              defaultExpanded
            />
          </DialogContent>
        </Dialog>
      )}
      </div>

      {/* Add Target dialog */}
      <AddTargetDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={async (form) => {
          await createMutation.mutateAsync({
            name: form.name,
            tgt: form.tgt || null,
            hbf: form.hbf || null,
            hb: form.hb || null,
            v1f: form.v1f || null,
            v1: form.v1 || null,
            dep: form.dep || null,
            arr: form.arr || null,
            extraVehicles: JSON.stringify(form.extraVehicles),
            wildFields: JSON.stringify(form.wildFields),
          });
        }}
      />

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
