import { useAuth } from "@/_core/hooks/useAuth";
import { trpc, trpcClient } from "@/lib/trpc";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { buildRunningSheetTitle } from "@shared/runningSheetTitle";
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
import { ViewToggle } from "@/components/ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";
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
  LayoutGrid,
  Car,
  Home,
  History,
  ArrowUpDown,
  ChevronDown,
  FileDown,
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
import { useState, useEffect, type ReactNode } from "react";
import { CopyMoveSheetDialog } from "@/components/CopyMoveSheetDialog";
import {
  TargetIdentityFields,
  TargetAddressFields,
  TargetVehicleFields,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  parseExtraVehicles,
  parseExtraAddresses,
  type ExtraVehicle,
  type ExtraAddress,
} from "@/components/TargetStructuredFields";
import { AddTargetDialog, type RegistryCreatePayload } from "@/components/AddTargetDialog";
import {
  composeTargetName,
  composeAddress,
  composeVehicle,
  isoToDdMmYyyy,
  ddMmYyyyToIso,
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import { CopyPlus } from "lucide-react";
import { useLocation, useParams, useSearch } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";

type CinEntry = { cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean };

/** Single target card — shows name + structured identity/address/vehicle fields, inline edit, delete */
function TargetCard({
  target,
  operationId,
  onDeleted,
  initialExpanded,
  fromSheetId,
}: {
  target: {
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
    extraVehicles?: string | null;
    extraAddresses?: string | null;
    firstNames?: string | null;
    surname?: string | null;
    bornDate?: string | null;
    addrUnitNo?: string | null;
    addrHouseNo?: string | null;
    addrStreetName?: string | null;
    addrStreetType?: string | null;
    addrSuburb?: string | null;
    addrState?: string | null;
    vehRegistration?: string | null;
    vehState?: string | null;
    vehColour?: string | null;
    vehMake?: string | null;
    vehModel?: string | null;
    vehType?: string | null;
  };
  operationId: number;
  onDeleted: () => void;
  initialExpanded?: boolean;
  fromSheetId?: number;
}) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [identity, setIdentity] = useState<StructuredNameParts>({
    firstNames: target.firstNames ?? "",
    surname: target.surname ?? "",
    bornDate: isoToDdMmYyyy(target.bornDate),
  });
  const [address, setAddress] = useState<StructuredAddressParts>({
    unitNo: target.addrUnitNo ?? "",
    houseNo: target.addrHouseNo ?? "",
    streetName: target.addrStreetName ?? "",
    streetType: target.addrStreetType ?? "",
    suburb: target.addrSuburb ?? "",
    state: target.addrState ?? "WA",
  });
  const [vehicle, setVehicle] = useState<StructuredVehicleParts & { vehicleType: string }>({
    registration: target.vehRegistration ?? "",
    state: target.vehState ?? "WA",
    colour: target.vehColour ?? "",
    make: target.vehMake ?? "",
    model: target.vehModel ?? "",
    vehicleType: target.vehType ?? "",
  });
  const [dep, setDep] = useState(target.dep ?? "");
  const [arr, setArr] = useState(target.arr ?? "");
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>(() =>
    parseExtraAddresses(target.extraAddresses)
  );
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(() =>
    parseExtraVehicles(target.extraVehicles)
  );
  const [dirty, setDirty] = useState(false);

  const addAddress = () => {
    setExtraAddresses(v => [...v, { ...EMPTY_ADDRESS_PARTS, label: "", full: "", short: "" }]);
    setDirty(true);
  };
  const removeAddress = (i: number) => {
    setExtraAddresses(v => v.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const updateAddress = (i: number, patch: Partial<ExtraAddress>) => {
    setExtraAddresses(v => v.map((item, idx) => idx === i ? { ...item, ...patch } : item));
    setDirty(true);
  };
  const addVehicle = () => {
    setExtraVehicles(v => [...v, { ...EMPTY_VEHICLE_PARTS, full: "", short: "" }]);
    setDirty(true);
  };
  const removeVehicle = (i: number) => {
    setExtraVehicles(v => v.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const updateVehicle = (i: number, patch: Partial<ExtraVehicle>) => {
    setExtraVehicles(v => v.map((item, idx) => idx === i ? { ...item, ...patch } : item));
    setDirty(true);
  };

  const handleSave = () => {
    const { name, tgt } = composeTargetName(identity);
    if (!name) {
      toast.error("Enter both First Name/s and Surname.");
      return;
    }
    const { full: hbf, short: hb } = composeAddress(address);
    const { full: v1f, short: v1 } = composeVehicle(vehicle);
    update.mutate({
      id: target.id,
      name,
      tgt: tgt || null,
      hbf: hbf || null,
      hb: hb || null,
      v1f: v1f || null,
      v1: v1 || null,
      dep: dep || null,
      arr: arr || null,
      extraAddresses: JSON.stringify(extraAddresses.map(ea => ({ ...ea, ...composeAddress(ea) }))),
      extraVehicles: JSON.stringify(extraVehicles.map(ev => ({ ...ev, ...composeVehicle(ev) }))),
      firstNames: identity.firstNames || null,
      surname: identity.surname || null,
      bornDate: ddMmYyyyToIso(identity.bornDate) || null,
      addrUnitNo: address.unitNo || null,
      addrHouseNo: address.houseNo || null,
      addrStreetName: address.streetName || null,
      addrStreetType: address.streetType || null,
      addrSuburb: address.suburb || null,
      addrState: address.state || null,
      vehRegistration: vehicle.registration || null,
      vehState: vehicle.state || null,
      vehColour: vehicle.colour || null,
      vehMake: vehicle.make || null,
      vehModel: vehicle.model || null,
      vehType: vehicle.vehicleType || null,
    });
  };

  const update = trpc.target.update.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      utils.target.getById.invalidate({ id: target.id });
      utils.target.listAll.invalidate();
      setDirty(false);
      toast.success("Target saved");
    },
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
          <TargetIdentityFields
            value={identity}
            onChange={v => mark(() => setIdentity(v))}
          />

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Home className="w-3 h-3" /> Home Address
            </p>
            <TargetAddressFields
              value={address}
              onChange={v => mark(() => setAddress(v))}
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Car className="w-3 h-3" /> Vehicle 1
            </p>
            <TargetVehicleFields
              value={vehicle}
              onChange={v => mark(() => setVehicle(v))}
            />
          </div>

          {/* ── Dynamic extra addresses ── */}
          {extraAddresses.map((ea, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                  <Home className="w-3 h-3" /> Additional Address {i + 2}
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeAddress(i)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <TargetAddressFields
                value={ea}
                onChange={v => updateAddress(i, v)}
                label={ea.label}
                onLabelChange={v => updateAddress(i, { label: v })}
              />
            </div>
          ))}
          <Button size="sm" variant="outline" className="gap-1.5 self-start" onClick={addAddress}>
            <Plus className="w-3.5 h-3.5" /> Add Address
          </Button>

          {/* ── Dynamic extra vehicles (V2, V3, …) ── */}
          {extraVehicles.map((ev, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                  <Car className="w-3 h-3" /> Vehicle {i + 2}
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeVehicle(i)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <TargetVehicleFields value={ev} onChange={v => updateVehicle(i, v)} />
            </div>
          ))}
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
            <Button
              size="sm" className="gap-2"
              onClick={handleSave}
              disabled={update.isPending || !dirty}
            >
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
  const [mode, setMode] = useState<"idle" | "link">("idle");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const create = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      utils.target.listAll.invalidate();
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
      <AddTargetDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={async (payload: RegistryCreatePayload) => {
          await create.mutateAsync({ ...payload, linkToOperationId: operationId });
        }}
      />

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
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddDialogOpen(true)}>
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

// ── Deployment Rollup ────────────────────────────────────────────────────────
// A chronological (newest-first) read view over every running sheet's
// Supervisor Summary for this operation — lets a supervisor scan how a
// deployment has progressed across 20-50+ sheets without opening each one.

// sheetDate (when present) is a plain "yyyy-MM-dd" string with no time
// component — reformatted with a string split rather than round-tripping
// through `new Date()`, which parses a bare date as UTC midnight and could
// shift the displayed day depending on the browser's local timezone offset.
function formatRollupDate(
  sheetDate: string | null,
  createdAt: Date | string
): string {
  const ymd = sheetDate ?? format(new Date(createdAt), "yyyy-MM-dd");
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}-${m}-${y}` : ymd;
}

function parseRollupJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function DeploymentRollupPanel({
  operationId,
  operationName,
  targets,
}: {
  operationId: number;
  operationName?: string | null;
  targets?: { id: number; name: string }[];
}) {
  const [targetFilter, setTargetFilter] = useState<number | null>(null);
  // Server returns newest-first (same direction the Running Sheets tab
  // lists sheets in); this just reverses that array for a chronological,
  // oldest-first read — no extra round-trip needed.
  const [sortAsc, setSortAsc] = useState(false);
  // Accordion — opening a card closes whichever one was open before it, so
  // only one is expanded at a time while stepping through a deployment.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const toggleExpanded = (sheetId: number) => {
    setExpandedId(prev => (prev === sheetId ? null : sheetId));
  };

  const { data: rows, isLoading } = trpc.summary.listByOperation.useQuery({
    operationId,
    targetId: targetFilter,
  });
  const displayRows = sortAsc && rows ? [...rows].reverse() : rows;

  const showTargetFilter = (targets?.length ?? 0) > 1;

  // ── PDF export dialog ────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"operation" | "target">(
    "operation"
  );
  const [exportTargetId, setExportTargetId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (exportMode === "target" && !exportTargetId) {
      toast.error("Pick a target to export.");
      return;
    }
    setIsExporting(true);
    try {
      const exportRows = await trpcClient.summary.exportRollup.query({
        operationId,
        targetId: exportMode === "target" ? exportTargetId : null,
      });
      if (exportRows.length === 0) {
        toast.error("No Supervisor Summaries to export for this selection.");
        return;
      }
      const targetName =
        exportMode === "target"
          ? (targets?.find(t => t.id === exportTargetId)?.name ?? null)
          : null;
      buildRollupExportPdf({
        operationName: operationName ?? "Operation",
        targetName,
        rows: exportRows,
      });
      setExportOpen(false);
    } catch {
      toast.error("Couldn't build the export — please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {showTargetFilter ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Target
            </label>
            <Select
              value={targetFilter ? String(targetFilter) : "all"}
              onValueChange={v =>
                setTargetFilter(v === "all" ? null : Number(v))
              }
            >
              <SelectTrigger className="h-8 w-[220px] text-sm">
                <SelectValue placeholder="All targets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                {targets?.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div />
        )}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setExportOpen(true)}
        >
          <FileDown className="w-3.5 h-3.5" />
          Export
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <History className="w-8 h-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm">
            No Supervisor Summaries yet. Once a running sheet's Summary tab
            has been opened, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {rows.length} summar{rows.length !== 1 ? "ies" : "y"}
            </p>
            <button
              onClick={() => setSortAsc(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1 rounded-md border border-border/50 hover:border-border bg-background hover:bg-muted/40"
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortAsc ? "Oldest first" : "Newest first"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(displayRows ?? []).map(r => (
              <DeploymentRollupCard
                key={r.sheetId}
                row={r}
                expanded={expandedId === r.sheetId}
                onToggle={() => toggleExpanded(r.sheetId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Deployment Rollup</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <RadioGroup
              value={exportMode}
              onValueChange={v => setExportMode(v as "operation" | "target")}
              className="gap-2.5"
            >
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <RadioGroupItem value="operation" />
                Operation export — every summary in this operation
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <RadioGroupItem value="target" />
                Target export — one target only
              </label>
            </RadioGroup>

            {exportMode === "target" && (
              <Select
                value={exportTargetId ? String(exportTargetId) : undefined}
                onValueChange={v => setExportTargetId(Number(v))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a target…" />
                </SelectTrigger>
                <SelectContent>
                  {targets?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting} className="gap-1.5">
              <FileDown className="w-3.5 h-3.5" />
              {isExporting ? "Building…" : "Export PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Shape returned by summary.listByOperation — kept local since it's only
// consumed here.
type RollupRow = {
  sheetId: number;
  sheetDate: string | null;
  createdAt: Date | string;
  targetName: string | null;
  teamLabel: string | null;
  teamCins: string | null;
  startTime: string | null;
  finishTime: string | null;
  location: string | null;
  ioSupport: string | null;
  intelSupport: string | null;
  ioContactTiming: string | null;
  ioContactMethod: string | null;
  objectives: string | null;
  specialProjects: string | null;
  criticalDecisions: string | null;
  issues: string | null;
  completedAt: number | null;
};

type RollupExportRow = RollupRow & {
  entries: { id: number; time: string | null; location: string | null; text: string }[];
  vehicles: { key: string; label: string }[];
};

// ── Rollup PDF export ────────────────────────────────────────────────────────
// Same dark-blue-banner / light-blue-section visual language as the
// Supervisor Summary export (SheetSummary.tsx's exportSummaryToPDF) — every
// row here is that same set of sections (Deployment/Vehicle/Investigator/
// Special Projects/Objectives/Critical Decisions/Summary/Issues), just one
// block per sheet with a page break between sheets instead of one sheet at
// a time.
function buildRollupExportPdf(params: {
  operationName: string;
  targetName: string | null;
  rows: RollupExportRow[];
}) {
  const { operationName, targetName, rows } = params;
  const esc = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";

  const detailRow = (label: string, value: string | null) =>
    value && value.trim()
      ? `<div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value)}</div>`
      : "";

  const section = (title: string, bodyHtml: string) =>
    bodyHtml
      ? `<div class="section"><div class="section-title">${esc(title)}</div><div class="section-body">${bodyHtml}</div></div>`
      : "";

  const sheetBlocks = rows
    .map((r, i) => {
      const objectives = parseRollupJsonArray<string>(r.objectives).filter(o =>
        o.trim()
      );
      const specialProjects = parseRollupJsonArray<{
        key: string;
        detail: string;
      }>(r.specialProjects);
      const criticalDecisions = parseRollupJsonArray<string>(
        r.criticalDecisions
      ).filter(c => c.trim());
      const communicationParts = [r.ioContactTiming, r.ioContactMethod].filter(
        (p): p is string => !!p && !!p.trim()
      );
      const isComplete = !!r.completedAt;

      const vehiclesHtml = r.vehicles.length
        ? `<div class="chip-list">${r.vehicles.map(v => `<span class="chip">${esc(v.label)}</span>`).join("")}</div>`
        : `<p class="muted-note">No vehicles found in the Target Registry or running sheet text.</p>`;

      const specialProjectsHtml = specialProjects.length
        ? `<div class="chip-list">${specialProjects
            .map(
              p =>
                `<span class="chip"><strong>${esc(p.key)}</strong>${p.detail?.trim() ? `<span class="chip-detail"> — ${esc(p.detail)}</span>` : ""}</span>`
            )
            .join("")}</div>`
        : `<p class="muted-note">None recorded.</p>`;

      const objectivesHtml = objectives.length
        ? `<ol class="numbered-list">${objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ol>`
        : `<p class="muted-note">None recorded.</p>`;

      const criticalDecisionsHtml = criticalDecisions.length
        ? `<ol class="numbered-list">${criticalDecisions.map(d => `<li>${esc(d)}</li>`).join("")}</ol>`
        : `<p class="muted-note">None recorded.</p>`;

      const summaryHtml = r.entries.length
        ? `<table class="summary-table">
            <thead><tr><th style="width:70px">Time</th><th style="width:28%">Address</th><th>Observation</th></tr></thead>
            <tbody>${r.entries
              .map(
                e =>
                  `<tr><td>${esc(e.time || "—")}</td><td>${esc(e.location || "")}</td><td>${esc(e.text)}</td></tr>`
              )
              .join("")}</tbody>
          </table>`
        : `<p class="muted-note">No running sheet rows yet.</p>`;

      return `<div class="sheet-block${i > 0 ? " page-break" : ""}">
        <div class="sheet-header">
          <div class="sheet-header-main">
            <span class="sheet-date">${esc(formatRollupDate(r.sheetDate, r.createdAt))}</span>
            ${r.teamLabel ? `<span class="sheet-chip">${esc(r.teamLabel)}</span>` : ""}
            ${r.startTime || r.finishTime ? `<span class="sheet-time">${esc(r.startTime ?? "?")}–${esc(r.finishTime ?? "?")}</span>` : ""}
            <span class="status-pill ${isComplete ? "status-complete" : "status-open"}">${isComplete ? "Complete" : "Open"}</span>
          </div>
          ${r.targetName ? `<div class="sheet-target">${esc(r.targetName)}</div>` : ""}
        </div>
        <div class="content">
          ${section(
            "Deployment",
            `<div class="detail-grid">
              ${detailRow("Team", r.teamLabel)}
              ${detailRow("Team Members CIN", r.teamCins)}
              ${detailRow("Start time", r.startTime)}
              ${detailRow("Finish time", r.finishTime)}
              ${detailRow("Target (TGT)", r.targetName)}
              ${detailRow("Location", r.location)}
            </div>`
          )}
          ${section("Vehicle", vehiclesHtml)}
          ${section(
            "Investigator",
            r.ioSupport?.trim() || communicationParts.length || r.intelSupport?.trim()
              ? `<div class="detail-grid">
                  ${detailRow("Investigator", r.ioSupport)}
                  ${communicationParts.length ? detailRow("Contacted", communicationParts.join(" — ")) : ""}
                  ${detailRow("Intel Support", r.intelSupport)}
                </div>`
              : `<p class="muted-note">None recorded.</p>`
          )}
          ${section("Special Projects", specialProjectsHtml)}
          ${section("Objectives", objectivesHtml)}
          ${section("Critical Decisions", criticalDecisionsHtml)}
          ${section("Summary", summaryHtml)}
          ${section("Issues", r.issues?.trim() ? `<p>${esc(r.issues)}</p>` : "")}
        </div>
      </div>`;
    })
    .join("");

  const scopeLine = targetName ? `Target: ${targetName}` : "All targets";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Deployment Rollup — ${esc(operationName)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page{ margin:20mm 15mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:26px 32px 22px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.main-title { font-size:26px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:16px; font-weight:600; margin-top:8px; }
.sheet-name { font-size:11px; opacity:0.65; margin-top:6px; }
.sheet-block { border-top:6px solid ${BLUE_DARK}; }
.sheet-header { padding:16px 32px 10px; }
.sheet-header-main { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.sheet-date { font-size:15px; font-weight:700; color:${GREY_TEXT}; }
.sheet-chip { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:3px 8px; border-radius:5px; background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; border:1px solid ${BLUE_MID}; }
.sheet-time { font-size:11px; color:#64748b; }
.sheet-target { font-size:11px; font-weight:700; color:${GREY_TEXT}; margin-top:4px; }
.status-pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-left:auto}
.status-complete{background:#dcfce7 !important;color:#15803d !important;border:1px solid #86efac}
.status-open{background:#fef3c7 !important;color:#92400e !important;border:1px solid #fcd34d}
.content { padding:8px 32px 26px; }
.section { margin-bottom:14px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:7px 14px; background:${BLUE_LIGHT} !important; border-bottom:1px solid ${GREY_BORDER}; }
.section-body { padding:12px 14px; }
.page-break { page-break-before:always; break-before:page; }
.detail-grid { display:grid; grid-template-columns:130px 1fr; gap:0; font-size:10.5px; }
.detail-grid > div { padding:4px 6px; }
.detail-grid > div:nth-child(4n+1), .detail-grid > div:nth-child(4n+2) { background:#f8fafc; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${GREY_TEXT}; }
.chip-list { display:flex; flex-wrap:wrap; gap:6px; }
.chip { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; border:1px solid ${BLUE_MID}; border-radius:6px; padding:4px 10px; font-size:10px; font-weight:600; }
.chip-detail { font-weight:400; color:#475569; }
.numbered-list { list-style:none; counter-reset:item; }
.numbered-list li { counter-increment:item; display:flex; align-items:flex-start; gap:8px; margin-bottom:7px; font-size:10.5px; }
.numbered-list li:last-child { margin-bottom:0; }
.numbered-list li::before { content:counter(item); flex-shrink:0; width:16px; height:16px; border-radius:50%; background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
.summary-table { width:100%; border-collapse:collapse; border:1.5px solid ${BLUE_DARK}; }
.summary-table th { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:6px 8px; border-bottom:2px solid ${BLUE_DARK}; border-right:1px solid #c7d5ee; }
.summary-table th:last-child, .summary-table td:last-child { border-right:none; }
.summary-table td { vertical-align:top; font-size:10.5px; padding:6px 8px; border-bottom:1px solid ${GREY_BORDER}; border-right:1px solid ${GREY_BORDER}; }
.summary-table tbody tr:last-child td { border-bottom:none; }
.footer-band { background:${BLUE_DARK} !important; color:#fff !important; padding:8px 32px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }
.footer-note { margin:14px 32px 0; padding:12px 0 20px; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .section-title { background:${BLUE_LIGHT} !important; } .chip { background:${BLUE_LIGHT} !important; } .numbered-list li::before { background:${BLUE_LIGHT} !important; } .summary-table th { background:${BLUE_LIGHT} !important; } .footer-band { background:${BLUE_DARK} !important; } .sheet-chip { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Deployment Rollup</div>
  <div class="op-date-line">${esc(operationName)}</div>
  <div class="sheet-name">${esc(scopeLine)} &middot; ${rows.length} summar${rows.length !== 1 ? "ies" : "y"}</div>
</div>
${sheetBlocks}
<div class="footer-note">Generated: ${generatedAt}</div>
<div class="footer-band"><span></span><span class="footer-protected">Protected</span><span>RunLog</span></div>
${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

function RollupDetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </>
  );
}

function RollupSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <div className="px-3 py-1.5 bg-primary/5 border-b border-border/70">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function DeploymentRollupCard({
  row: r,
  expanded,
  onToggle,
}: {
  row: RollupRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const objectives = parseRollupJsonArray<string>(r.objectives).filter(o =>
    o.trim()
  );
  const specialProjects = parseRollupJsonArray<{ key: string; detail: string }>(
    r.specialProjects
  );
  const criticalDecisions = parseRollupJsonArray<string>(
    r.criticalDecisions
  ).filter(c => c.trim());
  const hasIssues = !!(r.issues && r.issues.trim());
  const isComplete = !!r.completedAt;

  const { data: entries, isLoading: entriesLoading } =
    trpc.summary.getEntries.useQuery({ sheetId: r.sheetId }, { enabled: expanded });
  const { data: vehicles, isLoading: vehiclesLoading } =
    trpc.summary.getVehicles.useQuery({ sheetId: r.sheetId }, { enabled: expanded });

  const communicationParts = [r.ioContactTiming, r.ioContactMethod]
    .filter((p): p is string => !!p && !!p.trim());

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
              />
              <span className="text-sm font-semibold text-foreground">
                {formatRollupDate(r.sheetDate, r.createdAt)}
              </span>
              {r.teamLabel && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                  {r.teamLabel}
                </span>
              )}
              {(r.startTime || r.finishTime) && (
                <span className="text-xs text-muted-foreground">
                  {r.startTime ?? "?"}–{r.finishTime ?? "?"}
                </span>
              )}
            </div>
            {r.targetName && (
              <p className="text-xs font-bold text-foreground truncate pl-5 mt-0.5">
                {r.targetName}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${
              isComplete
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
            }`}
          >
            {isComplete ? "Complete" : "Open"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5 border-t border-border/70 pt-3">
          <RollupSection title="Deployment">
            <div className="grid grid-cols-[130px_1fr] gap-y-1.5 text-xs">
              <RollupDetailRow label="Team" value={r.teamLabel} />
              <RollupDetailRow label="Team Members CIN" value={r.teamCins} />
              <RollupDetailRow label="Start time" value={r.startTime} />
              <RollupDetailRow label="Finish time" value={r.finishTime} />
              <RollupDetailRow label="Target (TGT)" value={r.targetName} />
              <RollupDetailRow label="Location" value={r.location} />
            </div>
          </RollupSection>

          <RollupSection title="Vehicle">
            {vehiclesLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : vehicles && vehicles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {vehicles.map(v => (
                  <span
                    key={v.key}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-medium"
                  >
                    {v.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No vehicles found in the Target Registry or running sheet text.
              </p>
            )}
          </RollupSection>

          <RollupSection title="Investigator">
            {r.ioSupport?.trim() || r.intelSupport?.trim() || communicationParts.length ? (
              <div className="grid grid-cols-[130px_1fr] gap-y-1.5 text-xs">
                <RollupDetailRow label="Investigator" value={r.ioSupport} />
                {communicationParts.length > 0 && (
                  <RollupDetailRow
                    label="Contacted"
                    value={communicationParts.join(" — ")}
                  />
                )}
                <RollupDetailRow label="Intel Support" value={r.intelSupport} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">None recorded.</p>
            )}
          </RollupSection>

          <RollupSection title="Special Projects">
            {specialProjects.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {specialProjects.map(p => (
                  <span
                    key={p.key}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"
                  >
                    <strong>{p.key}</strong>
                    {p.detail?.trim() && (
                      <span className="font-normal"> — {p.detail}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">None recorded.</p>
            )}
          </RollupSection>

          <RollupSection title="Objectives">
            {objectives.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-foreground">
                {objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground italic">None recorded.</p>
            )}
          </RollupSection>

          <RollupSection title="Critical Decisions">
            {criticalDecisions.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-foreground">
                {criticalDecisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground italic">None recorded.</p>
            )}
          </RollupSection>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5 px-1">
              Summary
            </div>
            {entriesLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : entries && entries.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary/5 border-b border-border/70">
                      <th className="text-left font-bold uppercase tracking-wide text-[9.5px] text-primary px-2 py-1.5 w-[64px]">
                        Time
                      </th>
                      <th className="text-left font-bold uppercase tracking-wide text-[9.5px] text-primary px-2 py-1.5 w-[26%]">
                        Address
                      </th>
                      <th className="text-left font-bold uppercase tracking-wide text-[9.5px] text-primary px-2 py-1.5">
                        Observation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-b border-border/50 last:border-b-0">
                        <td className="align-top px-2 py-1.5 text-muted-foreground">
                          {e.time || "—"}
                        </td>
                        <td className="align-top px-2 py-1.5 text-muted-foreground">
                          {e.location || ""}
                        </td>
                        <td className="align-top px-2 py-1.5 text-foreground">
                          {e.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">
                No running sheet rows yet.
              </p>
            )}
          </div>

          <RollupSection title="Issues">
            {hasIssues ? (
              <p className="text-xs text-foreground whitespace-pre-wrap">{r.issues}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">None recorded.</p>
            )}
          </RollupSection>
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

/** Tile view card for a running sheet — with cert status, all CINs, colour coding and role icons */
function SheetTileCard({
  sheet,
  cinNames,
  cinEntries,
  targetName,
  isAdmin,
  onNavigate,
  onCopyMove,
}: {
  sheet: { id: number; title: string; createdAt: Date; sheetCins?: string | null; closedAt?: number | null; closedByCIN?: string | null };
  cinNames: string[];
  cinEntries?: CinEntry[];
  targetName?: string | null;
  isAdmin: boolean;
  onNavigate: () => void;
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
      onClick={onNavigate}
      className={`group flex flex-col gap-3 p-5 rounded-xl border cursor-pointer hover:-translate-y-0.5 transition-all duration-150 ${
        isClosed
          ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 opacity-70"
          : allCertified
            ? "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/80 hover:shadow-md"
            : "border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md"
      }`}
    >
      {/* Header row: icon + CLOSED badge + copy-move button */}
      <div className="flex items-start justify-between gap-2">
        <div className={`p-2 rounded-lg border shrink-0 ${
          isClosed ? "bg-slate-200/60 dark:bg-slate-700/40 border-slate-300 dark:border-slate-600"
          : allCertified ? "bg-emerald-500/20 border-emerald-500/40"
          : "bg-primary/10 border-primary/20"
        }`}>
          {isClosed
            ? <LockKeyhole className="w-4 h-4 text-slate-400" />
            : <FileText className={`w-4 h-4 ${allCertified ? "text-emerald-400" : "text-primary"}`} />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isClosed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-400/50 bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 font-medium">
              <LockKeyhole className="w-2.5 h-2.5" />CLOSED
            </span>
          )}
          {allCertified && !isClosed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 text-emerald-400 font-medium">
              ✓ CERTIFIED
            </span>
          )}
          {isAdmin && (
            <Button size="icon" variant="ghost" className="w-7 h-7 text-sky-500 hover:text-sky-400 hover:bg-sky-500/10"
              onClick={(e) => { e.stopPropagation(); onCopyMove(); }}
              title="Copy or Move sheet">
              <CopyPlus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Sheet title */}
      <p className={`font-semibold leading-tight line-clamp-2 ${
        isClosed ? "text-slate-500 dark:text-slate-400"
        : allCertified ? "text-emerald-300"
        : "text-foreground"
      }`}>{sheet.title}</p>

      {/* Target */}
      {targetName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Target className="w-3 h-3 shrink-0" />
          <span className="truncate">{targetName}</span>
        </div>
      )}

      {/* CIN chips — all shown, colour coded, with role icons */}
      {cinNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cinNames.map((cin) => {
            const certified = certStatus?.find((s) => s.cin === cin)?.certified ?? false;
            const entry = cinEntries?.find((e) => e.cin === cin);
            return (
              <span
                key={cin}
                className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border font-mono ${
                  certified
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                    : "border-red-500/40 bg-red-500/10 text-red-400"
                }`}
              >
                {entry?.isTeamLeader && <span className="text-yellow-400" title="Team Leader">★</span>}
                {entry?.isAuthor && <span className="text-sky-400" title="Author">✏</span>}
                {entry?.hasImages && <span className="text-violet-400" title="Has images">📷</span>}
                {cin}
              </span>
            );
          })}
        </div>
      )}

      {/* Footer: date */}
      <div className="flex items-center gap-1 mt-auto text-xs text-muted-foreground">
        <Calendar className="w-3 h-3" />
        <span>{format(new Date(sheet.createdAt), "d MMM yyyy")}</span>
        {sheet.closedAt && sheet.closedByCIN && (
          <span className="ml-2 text-slate-400">· Closed by <span className="font-mono">{sheet.closedByCIN}</span></span>
        )}
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
  const tabParam = searchParams.get('tab');
  const activeTab =
    tabParam === 'target' ? 'target' : tabParam === 'rollup' ? 'rollup' : 'sheets';
  const autoExpandTargetId = searchParams.get('targetId') ? parseInt(searchParams.get('targetId')!, 10) : undefined;
  const fromSheetId = searchParams.get('fromSheet') ? parseInt(searchParams.get('fromSheet')!, 10) : undefined;

  // Create sheet state
  const [createOpen, setCreateOpen] = useState(false);
  const [newSheetDate, setNewSheetDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newTargetId, setNewTargetId] = useState<number | null>(null);
  const [targetMode, setTargetMode] = useState<"none" | "link">("none");
  const [createTargetDialogOpen, setCreateTargetDialogOpen] = useState(false);
  const [cinList, setCinList] = useState<CinEntry[]>([]);
  const [cinInput, setCinInput] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [sheetSearch, setSheetSearch] = useState("");
  const { viewMode } = useViewMode();
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

  // Full record for the selected target — used only for the title preview
  // below (the list queries above don't carry surname on every row).
  const { data: newSheetTarget } = trpc.target.getById.useQuery(
    { id: newTargetId ?? 0 },
    { enabled: !!newTargetId }
  );

  const newSheetTitlePreview = buildRunningSheetTitle({
    sheetDate: newSheetDate || null,
    authorCIN: cinList.find(c => c.isAuthor)?.cin ?? null,
    operationName: operation?.name ?? "…",
    targetSurname:
      targetMode === "link" ? (newSheetTarget?.surname ?? null) : null,
  });

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
      setNewSheetDate(new Date().toISOString().slice(0, 10));
      setCinList([]);
      setCinInput("");
      toast.success("Running sheet created");
      navigate(`/sheet/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  // New Target from within the "New Running Sheet" dialog — same structured
  // Add Target dialog as everywhere else, linked straight to this operation.
  const createTargetForSheet = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      utils.target.listAll.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
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
    if (!newSheetDate) return;
    createSheet.mutate({
      operationId,
      sheetDate: newSheetDate,
      targetId: targetMode === "link" ? (newTargetId ?? undefined) : undefined,
      sheetCins: cinList.length > 0 ? cinList : undefined,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setNewSheetDate(new Date().toISOString().slice(0, 10));
      setNewTargetId(null);
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
          <div className="flex items-center gap-2 shrink-0">
            <ViewToggle />
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Running Sheet</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Main tabs: Running Sheets | Deployment Rollup */}
        <Tabs value={activeTab} onValueChange={(v) => {
            const sp = new URLSearchParams(window.location.search);
            sp.set("tab", v);
            if (v !== "target") sp.delete("targetId");
            navigate(`/operation/${operationId}?${sp.toString()}`);
          }} className="mt-2">
          <div className="flex items-center gap-2 mb-4">
            <TabsList>
              <TabsTrigger value="sheets">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Running Sheets</span>
                <span className="sm:hidden">Sheets</span>
              </TabsTrigger>
              <TabsTrigger value="rollup">
                <History className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Deployment Rollup</span>
                <span className="sm:hidden">Rollup</span>
              </TabsTrigger>
              {/* No visible "Add Target" trigger — target creation/editing
                  lives in the New Running Sheet dialog, the Edit Running
                  Sheet target-edit pencil, and the Target Registry page.
                  The tab/content itself (TabsContent value="target" below)
                  stays wired up so those deep links (?tab=target&targetId=…)
                  still land on the same TargetPanel as before. */}
            </TabsList>
            {/* Back to Running Sheet — shown when navigated here from a sheet */}
            {fromSheetId && (
              <button
                onClick={() => navigate(`/sheet/${fromSheetId}`)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md border border-border/50 hover:border-border bg-background hover:bg-muted/40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Running Sheet
              </button>
            )}
          </div>

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
        ) : (() => {
          const filteredSheets = sheets.filter((sheet) => {
            if (!sheetSearch.trim()) return true;
            const q = sheetSearch.trim().toLowerCase();
            if (sheet.title.toLowerCase().includes(q)) return true;
            const cins: CinEntry[] = (() => { try { return sheet.sheetCins ? JSON.parse(sheet.sheetCins) : []; } catch { return []; } })();
            if (cins.some((c) => c.cin.toLowerCase().includes(q))) return true;
            const tgt = operationTargets?.find((t) => t.id === (sheet as { targetId?: number | null }).targetId);
            if (tgt && tgt.name.toLowerCase().includes(q)) return true;
            return false;
          });
          return (
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
            {viewMode === "tile" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSheets.map((sheet) => {
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
                    } catch { return []; }
                  })();
                  const cinNames = parsedCins.map((c) => c.cin);
                  const assignedTarget = operationTargets?.find((t) => t.id === (sheet as { targetId?: number | null }).targetId);
                  return (
                    <SheetTileCard
                      key={sheet.id}
                      sheet={sheet}
                      cinNames={cinNames}
                      cinEntries={parsedCins}
                      targetName={assignedTarget?.name}
                      isAdmin={user?.role === "admin" || user?.role === "member"}
                      onNavigate={() => navigate(`/sheet/${sheet.id}`)}
                      onCopyMove={() => setCopyMoveSheet({ id: sheet.id, title: sheet.title })}
                    />
                  );
                })}
              </div>
            ) : (
              filteredSheets.map((sheet) => {
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
              })
            )}
          </div>
          );
        })()}

        {sheets && sheets.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            {sheets.length} running sheet{sheets.length !== 1 ? "s" : ""}
          </p>
        )}
          </TabsContent>

          {/* ── Deployment Rollup tab ── */}
          <TabsContent value="rollup">
            <DeploymentRollupPanel
              operationId={operationId}
              operationName={operation?.name}
              targets={operationTargets}
            />
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
            {/* Date — the sheet's title is generated from this + the
                Author/Target below, not typed in directly. */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={newSheetDate}
                onChange={(e) => setNewSheetDate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5 font-mono truncate">
                {newSheetTitlePreview}
              </p>
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
                      else { setNewTargetId(t.id); setTargetMode("link"); }
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
                {!(targetMode === "link" && newTargetId === null) && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setCreateTargetDialogOpen(true)}>
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
              disabled={!newSheetDate || createSheet.isPending}
            >
              {createSheet.isPending ? "Creating…" : "Create Sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Target — same structured Add Target dialog used everywhere else */}
      <AddTargetDialog
        open={createTargetDialogOpen}
        onClose={() => setCreateTargetDialogOpen(false)}
        onSave={async (payload: RegistryCreatePayload) => {
          const result = await createTargetForSheet.mutateAsync({
            ...payload,
            linkToOperationId: operationId,
          });
          setNewTargetId(result.id);
          setTargetMode("link");
        }}
      />

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
