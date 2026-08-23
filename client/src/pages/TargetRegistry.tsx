import { useState, useMemo, useEffect, useRef } from "react";
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
  Users,
  Pencil,
} from "lucide-react";
import { useViewMode } from "@/contexts/ViewModeContext";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  TargetIdentityFields,
  TargetAddressFields,
  TargetVehicleFields,
  EMPTY_NAME_PARTS,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  parseExtraVehicles,
  parseExtraAddresses,
  makeExtraId,
  type ExtraVehicle,
  type ExtraAddress,
} from "@/components/TargetStructuredFields";
import {
  AddTargetDialog,
  type RegistryCreatePayload,
} from "@/components/AddTargetDialog";
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
import {
  PossibleDuplicateAlert,
  type DuplicateWarning,
} from "@/components/PossibleDuplicateAlert";
import { runDuplicateChecks } from "@/lib/duplicateCheck";
import { IndicesBadge } from "@/components/IndicesBadge";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  v2: string | null; // legacy
  dep: string | null;
  arr: string | null;
  extraVehicles: string | null; // JSON: ExtraVehicle[]
  extraAddresses: string | null; // JSON: ExtraAddress[]
  wildFields: string | null; // JSON: WildField[] — deprecated, no longer editable
  firstNames: string | null;
  surname: string | null;
  bornDate: string | null; // ISO yyyy-mm-dd
  addrUnitNo: string | null;
  addrHouseNo: string | null;
  addrStreetName: string | null;
  addrStreetType: string | null;
  addrSuburb: string | null;
  addrState: string | null;
  addrBusinessName: string | null;
  vehRegistration: string | null;
  vehState: string | null;
  vehColour: string | null;
  vehMake: string | null;
  vehModel: string | null;
  vehType: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedOperations: Array<{
    operationId: number;
    operationName: string | null;
  }>;
  isIndicesOnly?: boolean;
};

// Initial lock state for a set of extra address/vehicle entries — "locked"
// (needs an explicit Edit/Add-new choice) when the entry already has a
// composed value, "edit" (freely editable, nothing to preserve) otherwise.
function computeExtraModes<T extends { id: string; full: string }>(
  entries: T[]
): Record<string, "locked" | "edit" | "new"> {
  const modes: Record<string, "locked" | "edit" | "new"> = {};
  for (const e of entries) modes[e.id] = e.full ? "locked" : "edit";
  return modes;
}

function EditVsNewNote({ kind }: { kind: "address" | "vehicle" }) {
  return (
    <p className="text-[11px] text-muted-foreground mt-1.5">
      Edit if there's a mistake in the current {kind}. Add new if the Target has{" "}
      {kind === "address" ? "moved addresses" : "changed vehicles"}.
    </p>
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
  const { data: operations } = trpc.operation.list.useQuery(undefined, {
    enabled: open,
  });
  const link = trpc.target.registry.linkToOperation.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
    },
  });
  const unlink = trpc.target.registry.unlinkFromOperation.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
    },
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
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Operations — {targetName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Toggle which operations this target is linked to.
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto py-2">
          {!operations ? (
            <Skeleton className="h-8 w-full" />
          ) : operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No operations found.
            </p>
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
                    <span className="text-xs text-muted-foreground">
                      Click to link
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
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

  // Structured identity/address/vehicle input
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
    businessName: target.addrBusinessName ?? "",
  });
  const [vehicle, setVehicle] = useState<
    StructuredVehicleParts & { vehicleType: string }
  >({
    registration: target.vehRegistration ?? "",
    state: target.vehState ?? "WA",
    colour: target.vehColour ?? "",
    make: target.vehMake ?? "",
    model: target.vehModel ?? "",
    vehicleType: target.vehType ?? "",
  });
  const [dep, setDep] = useState(target.dep ?? "");
  const [arr, setArr] = useState(target.arr ?? "");
  // Dynamic extra addresses/vehicles beyond the primary Home/Vehicle 1
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>(() =>
    parseExtraAddresses(target.extraAddresses)
  );
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(() =>
    parseExtraVehicles(target.extraVehicles)
  );
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Home Address (HB), Vehicle 1 (V1), and every additional address/vehicle
  // entry are "locked" once a value exists — an officer must explicitly
  // choose "Edit current" (in-place correction, no history) or "Add new"
  // (archives the current value as "Previous" before the new one replaces
  // it) rather than freely overtyping, which would silently lose whichever
  // value is discarded either way. Starts straight in edit mode when
  // there's nothing to preserve yet. Extra entries are tracked by their
  // stable `id`, not array position, so the mode map stays correct even as
  // entries are added/removed.
  const [addressMode, setAddressMode] = useState<"locked" | "edit" | "new">(
    target.hbf || target.hb ? "locked" : "edit"
  );
  const [vehicleMode, setVehicleMode] = useState<"locked" | "edit" | "new">(
    target.v1f || target.v1 ? "locked" : "edit"
  );
  const [extraAddressModes, setExtraAddressModes] = useState<
    Record<string, "locked" | "edit" | "new">
  >(() => computeExtraModes(parseExtraAddresses(target.extraAddresses)));
  const [extraVehicleModes, setExtraVehicleModes] = useState<
    Record<string, "locked" | "edit" | "new">
  >(() => computeExtraModes(parseExtraVehicles(target.extraVehicles)));

  // Re-sync editable fields when the underlying record actually changes on
  // the server (e.g. a duplicate-target merge updates it while this card
  // is already mounted, since it's keyed by id and doesn't remount) — the
  // useState initializers above only run once, so without this the card
  // keeps showing whatever was true when it first mounted. Skipped while
  // the user has unsaved local edits so an in-progress edit isn't clobbered
  // by a background refetch.
  useEffect(() => {
    if (dirty) return;
    setIdentity({
      firstNames: target.firstNames ?? "",
      surname: target.surname ?? "",
      bornDate: isoToDdMmYyyy(target.bornDate),
    });
    setAddress({
      unitNo: target.addrUnitNo ?? "",
      houseNo: target.addrHouseNo ?? "",
      streetName: target.addrStreetName ?? "",
      streetType: target.addrStreetType ?? "",
      suburb: target.addrSuburb ?? "",
      state: target.addrState ?? "WA",
      businessName: target.addrBusinessName ?? "",
    });
    setVehicle({
      registration: target.vehRegistration ?? "",
      state: target.vehState ?? "WA",
      colour: target.vehColour ?? "",
      make: target.vehMake ?? "",
      model: target.vehModel ?? "",
      vehicleType: target.vehType ?? "",
    });
    setDep(target.dep ?? "");
    setArr(target.arr ?? "");
    const freshExtraAddresses = parseExtraAddresses(target.extraAddresses);
    const freshExtraVehicles = parseExtraVehicles(target.extraVehicles);
    setExtraAddresses(freshExtraAddresses);
    setExtraVehicles(freshExtraVehicles);
    setAddressMode(target.hbf || target.hb ? "locked" : "edit");
    setVehicleMode(target.v1f || target.v1 ? "locked" : "edit");
    setExtraAddressModes(computeExtraModes(freshExtraAddresses));
    setExtraVehicleModes(computeExtraModes(freshExtraVehicles));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.updatedAt?.getTime()]);

  const mark = (fn: () => void) => {
    fn();
    setDirty(true);
  };

  const startEditAddress = () => {
    setAddressMode("edit");
    setDirty(true);
  };
  const startNewAddress = () => {
    setAddressMode("new");
    setAddress(EMPTY_ADDRESS_PARTS);
    setDirty(true);
  };
  const cancelAddressEdit = () => {
    setAddressMode(target.hbf || target.hb ? "locked" : "edit");
    setAddress({
      unitNo: target.addrUnitNo ?? "",
      houseNo: target.addrHouseNo ?? "",
      streetName: target.addrStreetName ?? "",
      streetType: target.addrStreetType ?? "",
      suburb: target.addrSuburb ?? "",
      state: target.addrState ?? "WA",
      businessName: target.addrBusinessName ?? "",
    });
  };

  const startEditVehicle = () => {
    setVehicleMode("edit");
    setDirty(true);
  };
  const startNewVehicle = () => {
    setVehicleMode("new");
    setVehicle(EMPTY_VEHICLE_PARTS);
    setDirty(true);
  };
  const cancelVehicleEdit = () => {
    setVehicleMode(target.v1f || target.v1 ? "locked" : "edit");
    setVehicle({
      registration: target.vehRegistration ?? "",
      state: target.vehState ?? "WA",
      colour: target.vehColour ?? "",
      make: target.vehMake ?? "",
      model: target.vehModel ?? "",
      vehicleType: target.vehType ?? "",
    });
  };

  const startEditExtraAddress = (id: string) => {
    setExtraAddressModes(m => ({ ...m, [id]: "edit" }));
    setDirty(true);
  };
  const startNewExtraAddress = (id: string) => {
    setExtraAddressModes(m => ({ ...m, [id]: "new" }));
    setExtraAddresses(v =>
      v.map(ea =>
        ea.id === id
          ? { ...EMPTY_ADDRESS_PARTS, id, label: ea.label, full: "", short: "" }
          : ea
      )
    );
    setDirty(true);
  };
  const cancelExtraAddressEdit = (id: string) => {
    const original = parseExtraAddresses(target.extraAddresses).find(
      ea => ea.id === id
    );
    setExtraAddressModes(m => ({
      ...m,
      [id]: original?.full ? "locked" : "edit",
    }));
    if (original) {
      setExtraAddresses(v => v.map(ea => (ea.id === id ? original : ea)));
    }
  };

  const startEditExtraVehicle = (id: string) => {
    setExtraVehicleModes(m => ({ ...m, [id]: "edit" }));
    setDirty(true);
  };
  const startNewExtraVehicle = (id: string) => {
    setExtraVehicleModes(m => ({ ...m, [id]: "new" }));
    setExtraVehicles(v =>
      v.map(ev =>
        ev.id === id ? { ...EMPTY_VEHICLE_PARTS, id, full: "", short: "" } : ev
      )
    );
    setDirty(true);
  };
  const cancelExtraVehicleEdit = (id: string) => {
    const original = parseExtraVehicles(target.extraVehicles).find(
      ev => ev.id === id
    );
    setExtraVehicleModes(m => ({
      ...m,
      [id]: original?.full ? "locked" : "edit",
    }));
    if (original) {
      setExtraVehicles(v => v.map(ev => (ev.id === id ? original : ev)));
    }
  };

  const addAddress = () => {
    const id = makeExtraId();
    setExtraAddresses(v => [
      ...v,
      { ...EMPTY_ADDRESS_PARTS, id, label: "", full: "", short: "" },
    ]);
    setExtraAddressModes(m => ({ ...m, [id]: "edit" }));
    setDirty(true);
  };
  const removeAddress = (i: number) => {
    setExtraAddresses(v => v.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const updateAddress = (i: number, patch: Partial<ExtraAddress>) => {
    setExtraAddresses(v =>
      v.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
    setDirty(true);
  };

  const addVehicle = () => {
    const id = makeExtraId();
    setExtraVehicles(v => [
      ...v,
      { ...EMPTY_VEHICLE_PARTS, id, full: "", short: "" },
    ]);
    setExtraVehicleModes(m => ({ ...m, [id]: "edit" }));
    setDirty(true);
  };
  const removeVehicle = (i: number) => {
    setExtraVehicles(v => v.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const updateVehicle = (i: number, patch: Partial<ExtraVehicle>) => {
    setExtraVehicles(v =>
      v.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
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
    if (addressMode === "new" && !hbf) {
      toast.error(
        "Enter the new Home Address, or click Cancel to keep the current one."
      );
      return;
    }
    if (vehicleMode === "new" && !v1f) {
      toast.error(
        "Enter the new Vehicle 1 details, or click Cancel to keep the current one."
      );
      return;
    }
    const composedExtraAddresses = extraAddresses.map(ea => ({
      ...ea,
      ...composeAddress(ea),
    }));
    const composedExtraVehicles = extraVehicles.map(ev => ({
      ...ev,
      ...composeVehicle(ev),
    }));
    const newExtraAddressIds = composedExtraAddresses
      .filter(ea => extraAddressModes[ea.id] === "new")
      .map(ea => ea.id);
    const newExtraVehicleIds = composedExtraVehicles
      .filter(ev => extraVehicleModes[ev.id] === "new")
      .map(ev => ev.id);
    const blankNewAddress = composedExtraAddresses.find(
      ea => extraAddressModes[ea.id] === "new" && !ea.full
    );
    if (blankNewAddress) {
      toast.error(
        `Enter the new details for "${blankNewAddress.label || "that address"}", or click Cancel to keep the current one.`
      );
      return;
    }
    const blankNewVehicle = composedExtraVehicles.find(
      ev => extraVehicleModes[ev.id] === "new" && !ev.full
    );
    if (blankNewVehicle) {
      toast.error(
        "Enter the new vehicle details, or click Cancel to keep the current one."
      );
      return;
    }
    savedFieldPresence.current = {
      hasAddress: !!hbf,
      hasVehicle: !!v1f,
      extraAddresses: computeExtraModes(composedExtraAddresses),
      extraVehicles: computeExtraModes(composedExtraVehicles),
    };
    update.mutate({
      id: target.id,
      name,
      tgt: tgt || null,
      hbf: hbf || null,
      hb: hb || null,
      v1f: v1f || null,
      v1: v1 || null,
      isNewAddress: addressMode === "new",
      isNewVehicle: vehicleMode === "new",
      newExtraAddressIds,
      newExtraVehicleIds,
      dep: dep || null,
      arr: arr || null,
      extraAddresses: JSON.stringify(composedExtraAddresses),
      extraVehicles: JSON.stringify(composedExtraVehicles),
      firstNames: identity.firstNames || null,
      surname: identity.surname || null,
      bornDate: ddMmYyyyToIso(identity.bornDate) || null,
      addrUnitNo: address.unitNo || null,
      addrHouseNo: address.houseNo || null,
      addrStreetName: address.streetName || null,
      addrStreetType: address.streetType || null,
      addrSuburb: address.suburb || null,
      addrState: address.state || null,
      addrBusinessName: address.businessName || null,
      vehRegistration: vehicle.registration || null,
      vehState: vehicle.state || null,
      vehColour: vehicle.colour || null,
      vehMake: vehicle.make || null,
      vehModel: vehicle.model || null,
      vehType: vehicle.vehicleType || null,
    });
  };

  // Set right before update.mutate() so onSuccess knows whether each
  // address/vehicle just saved actually has a value — lock down when it
  // does, drop back to free-edit when it was cleared to empty (nothing left
  // to protect).
  const savedFieldPresence = useRef<{
    hasAddress: boolean;
    hasVehicle: boolean;
    extraAddresses: Record<string, "locked" | "edit" | "new">;
    extraVehicles: Record<string, "locked" | "edit" | "new">;
  }>({
    hasAddress: false,
    hasVehicle: false,
    extraAddresses: {},
    extraVehicles: {},
  });

  const update = trpc.target.registry.update.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
      utils.target.getById.invalidate({ id: target.id });
      utils.target.listAll.invalidate();
      setDirty(false);
      // Lock everything back down immediately rather than waiting on the
      // target.updatedAt-driven resync effect below — that only fires once
      // the invalidated query actually refetches and this component
      // re-renders with a new prop, which isn't reliably immediate.
      setAddressMode(savedFieldPresence.current.hasAddress ? "locked" : "edit");
      setVehicleMode(savedFieldPresence.current.hasVehicle ? "locked" : "edit");
      setExtraAddressModes(savedFieldPresence.current.extraAddresses);
      setExtraVehicleModes(savedFieldPresence.current.extraVehicles);
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
          <div className="p-2.5 rounded-lg bg-rose-400/10 border border-rose-400/20 shrink-0">
            <Target className="w-5 h-5 text-rose-400" />
          </div>
          <span className="flex-1 font-semibold text-sm text-foreground truncate">
            {target.name}
          </span>
          {target.isIndicesOnly && <IndicesBadge />}
          {/* Linked operations badges */}
          {target.linkedOperations.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1 mr-2">
              {target.linkedOperations.map(op => (
                <Badge
                  key={op.operationId}
                  variant="secondary"
                  className="text-xs gap-1"
                >
                  <BookOpen className="h-3 w-3" />
                  {op.operationName ?? `Op #${op.operationId}`}
                </Badge>
              ))}
            </div>
          )}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onLinkOps}
              title="Link to operations"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </div>

        {/* Expanded inline edit form — identical to OperationDetail */}
        {expanded && (
          <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border/50">
            {/* Linked ops on mobile */}
            {target.linkedOperations.length > 0 && (
              <div className="flex sm:hidden flex-wrap gap-1">
                {target.linkedOperations.map(op => (
                  <Badge
                    key={op.operationId}
                    variant="secondary"
                    className="text-xs gap-1"
                  >
                    <BookOpen className="h-3 w-3" />
                    {op.operationName ?? `Op #${op.operationId}`}
                  </Badge>
                ))}
              </div>
            )}

            <TargetIdentityFields
              value={identity}
              onChange={v => mark(() => setIdentity(v))}
            />

            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Home className="w-3 h-3" /> Home Address
              </p>
              {addressMode === "locked" ? (
                <div className="flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <p className="text-sm text-foreground flex-1">
                      {target.hbf ?? target.hb}
                    </p>
                    <div className="flex gap-1.5 flex-wrap sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-7"
                        onClick={startEditAddress}
                      >
                        <Pencil className="w-3 h-3" /> Edit current HB
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-7"
                        onClick={startNewAddress}
                      >
                        <Plus className="w-3 h-3" /> Add new HB
                      </Button>
                    </div>
                  </div>
                  <EditVsNewNote kind="address" />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {addressMode === "new" && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                      Recording a new Home Address — the current one is kept as
                      "Previous" once you save.
                    </p>
                  )}
                  <TargetAddressFields
                    value={address}
                    onChange={v => mark(() => setAddress(v))}
                  />
                  {(target.hbf || target.hb) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs self-start"
                      onClick={cancelAddressEdit}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Car className="w-3 h-3" /> Vehicle 1
              </p>
              {vehicleMode === "locked" ? (
                <div className="flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <p className="text-sm text-foreground flex-1">
                      {target.v1f ?? target.v1}
                    </p>
                    <div className="flex gap-1.5 flex-wrap sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-7"
                        onClick={startEditVehicle}
                      >
                        <Pencil className="w-3 h-3" /> Edit current V1
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-7"
                        onClick={startNewVehicle}
                      >
                        <Plus className="w-3 h-3" /> Add new V1
                      </Button>
                    </div>
                  </div>
                  <EditVsNewNote kind="vehicle" />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {vehicleMode === "new" && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                      Recording a new Vehicle 1 — the current one is kept as
                      "Previous" once you save.
                    </p>
                  )}
                  <TargetVehicleFields
                    value={vehicle}
                    onChange={v => mark(() => setVehicle(v))}
                  />
                  {(target.v1f || target.v1) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs self-start"
                      onClick={cancelVehicleEdit}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ── Dynamic extra addresses — same lock/Edit/Add-new pattern as
                 Home Address, tracked per entry by its stable id. ── */}
            {extraAddresses.map((ea, i) => {
              const mode = extraAddressModes[ea.id] ?? "edit";
              return (
                <div
                  key={ea.id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Home className="w-3 h-3" /> Additional Address {i + 2}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeAddress(i)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  {mode === "locked" ? (
                    <div className="flex flex-col">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <div className="flex-1">
                          {ea.label && (
                            <p className="text-xs text-muted-foreground">
                              {ea.label}
                            </p>
                          )}
                          <p className="text-sm text-foreground">{ea.full}</p>
                        </div>
                        <div className="flex gap-1.5 flex-wrap sm:shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => startEditExtraAddress(ea.id)}
                          >
                            <Pencil className="w-3 h-3" /> Edit current
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => startNewExtraAddress(ea.id)}
                          >
                            <Plus className="w-3 h-3" /> Add new
                          </Button>
                        </div>
                      </div>
                      <EditVsNewNote kind="address" />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {mode === "new" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                          Recording a new address for this entry — the current
                          one is kept as "Previous" once you save.
                        </p>
                      )}
                      <TargetAddressFields
                        value={ea}
                        onChange={v => updateAddress(i, v)}
                        label={ea.label}
                        onLabelChange={v => updateAddress(i, { label: v })}
                      />
                      {ea.full && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-xs self-start"
                          onClick={() => cancelExtraAddressEdit(ea.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 self-start"
              onClick={addAddress}
            >
              <Plus className="w-3.5 h-3.5" /> Add Address
            </Button>

            {/* ── Dynamic extra vehicles (V2, V3, …) — same pattern ── */}
            {extraVehicles.map((ev, i) => {
              const mode = extraVehicleModes[ev.id] ?? "edit";
              return (
                <div
                  key={ev.id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Car className="w-3 h-3" /> Vehicle {i + 2}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeVehicle(i)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  {mode === "locked" ? (
                    <div className="flex flex-col">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <p className="text-sm text-foreground flex-1">
                          {ev.full}
                        </p>
                        <div className="flex gap-1.5 flex-wrap sm:shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => startEditExtraVehicle(ev.id)}
                          >
                            <Pencil className="w-3 h-3" /> Edit current
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => startNewExtraVehicle(ev.id)}
                          >
                            <Plus className="w-3 h-3" /> Add new
                          </Button>
                        </div>
                      </div>
                      <EditVsNewNote kind="vehicle" />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {mode === "new" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                          Recording a new vehicle for this entry — the current
                          one is kept as "Previous" once you save.
                        </p>
                      )}
                      <TargetVehicleFields
                        value={ev}
                        onChange={v => updateVehicle(i, v)}
                      />
                      {ev.full && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-xs self-start"
                          onClick={() => cancelExtraVehicleEdit(ev.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 self-start"
              onClick={addVehicle}
            >
              <Plus className="w-3.5 h-3.5" /> Add Vehicle
            </Button>

            {/* ── Depart / Arrive ── */}
            {(
              [
                {
                  label: "Depart (DEP)",
                  val: dep,
                  set: (v: string) => mark(() => setDep(v)),
                },
                {
                  label: "Arrive (ARR)",
                  val: arr,
                  set: (v: string) => mark(() => setArr(v)),
                },
              ] as { label: string; val: string; set: (v: string) => void }[]
            ).map(({ label, val, set }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {label}
                </label>
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
                onClick={handleSave}
                disabled={update.isPending || !dirty}
              >
                <Save className="w-3.5 h-3.5" />
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>

            <AssociatesSection targetId={target.id} />
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete target?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{target.name}</strong>{" "}
              from the registry? Any running sheets that referenced this target
              will have their target link cleared. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDelete(false);
                del.mutate({ id: target.id });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Associates ─────────────────────────────────────────────────────────────
// A person linked to a target as a known associate — goes through the same
// controlled Name → Address → Vehicle structured process as a target.

type AssociateRecord = {
  id: number;
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  firstNames: string | null;
  surname: string | null;
  bornDate: string | null;
  addrUnitNo: string | null;
  addrHouseNo: string | null;
  addrStreetName: string | null;
  addrStreetType: string | null;
  addrSuburb: string | null;
  addrState: string | null;
  addrBusinessName: string | null;
  vehRegistration: string | null;
  vehState: string | null;
  vehColour: string | null;
  vehMake: string | null;
  vehModel: string | null;
  vehType: string | null;
  extraAddresses: string | null;
  extraVehicles: string | null;
  isIndicesOnly?: boolean;
};

function AssociateCard({
  targetId,
  associate,
  onCreated,
}: {
  targetId: number;
  associate: AssociateRecord | null; // null = new, unsaved
  onCreated?: () => void;
}) {
  const utils = trpc.useUtils();
  const isNew = associate === null;
  const [expanded, setExpanded] = useState(isNew);

  const [identity, setIdentity] = useState<StructuredNameParts>(() =>
    associate
      ? {
          firstNames: associate.firstNames ?? "",
          surname: associate.surname ?? "",
          bornDate: isoToDdMmYyyy(associate.bornDate),
        }
      : EMPTY_NAME_PARTS
  );
  const [address, setAddress] = useState<StructuredAddressParts>(() =>
    associate
      ? {
          unitNo: associate.addrUnitNo ?? "",
          houseNo: associate.addrHouseNo ?? "",
          streetName: associate.addrStreetName ?? "",
          streetType: associate.addrStreetType ?? "",
          suburb: associate.addrSuburb ?? "",
          state: associate.addrState ?? "WA",
          businessName: associate.addrBusinessName ?? "",
        }
      : EMPTY_ADDRESS_PARTS
  );
  const [vehicle, setVehicle] = useState<
    StructuredVehicleParts & { vehicleType: string }
  >(() =>
    associate
      ? {
          registration: associate.vehRegistration ?? "",
          state: associate.vehState ?? "WA",
          colour: associate.vehColour ?? "",
          make: associate.vehMake ?? "",
          model: associate.vehModel ?? "",
          vehicleType: associate.vehType ?? "",
        }
      : EMPTY_VEHICLE_PARTS
  );
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>(() =>
    associate ? parseExtraAddresses(associate.extraAddresses) : []
  );
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(() =>
    associate ? parseExtraVehicles(associate.extraVehicles) : []
  );
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Possible-duplicate warning (new associates only) — checks name/address/
  // vehicle against every existing target, associate and text-mined entity.
  // Warn-only: an associate's registry profile isn't merged into anything,
  // the officer just confirms it's genuinely a new person before saving.
  const [warnQueue, setWarnQueue] = useState<DuplicateWarning[]>([]);
  const [warnIndex, setWarnIndex] = useState(0);
  const notDuplicateMutation =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();

  const mark = (fn: () => void) => {
    fn();
    setDirty(true);
  };
  const addAddress = () => {
    setExtraAddresses(v => [
      ...v,
      {
        ...EMPTY_ADDRESS_PARTS,
        id: makeExtraId(),
        label: "",
        full: "",
        short: "",
      },
    ]);
    setDirty(true);
  };
  const removeAddress = (i: number) => {
    setExtraAddresses(v => v.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const updateAddressEntry = (i: number, patch: Partial<ExtraAddress>) => {
    setExtraAddresses(v =>
      v.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
    setDirty(true);
  };
  const addVehicle = () => {
    setExtraVehicles(v => [
      ...v,
      { ...EMPTY_VEHICLE_PARTS, id: makeExtraId(), full: "", short: "" },
    ]);
    setDirty(true);
  };
  const removeVehicle = (i: number) => {
    setExtraVehicles(v => v.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const updateVehicleEntry = (i: number, patch: Partial<ExtraVehicle>) => {
    setExtraVehicles(v =>
      v.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
    setDirty(true);
  };

  const createMut = trpc.associate.create.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      toast.success("Associate added");
      onCreated?.();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateMut = trpc.associate.update.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      setDirty(false);
      toast.success("Associate saved");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const deleteMut = trpc.associate.delete.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      toast.success("Associate removed");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const buildPayload = () => {
    const { name, tgt } = composeTargetName(identity);
    const { full: hbf, short: hb } = composeAddress(address);
    const { full: v1f, short: v1 } = composeVehicle(vehicle);
    return {
      name,
      tgt: tgt || null,
      hbf: hbf || null,
      hb: hb || null,
      v1f: v1f || null,
      v1: v1 || null,
      extraAddresses: JSON.stringify(
        extraAddresses.map(ea => ({ ...ea, ...composeAddress(ea) }))
      ),
      extraVehicles: JSON.stringify(
        extraVehicles.map(ev => ({ ...ev, ...composeVehicle(ev) }))
      ),
      firstNames: identity.firstNames || null,
      surname: identity.surname || null,
      bornDate: ddMmYyyyToIso(identity.bornDate) || null,
      addrUnitNo: address.unitNo || null,
      addrHouseNo: address.houseNo || null,
      addrStreetName: address.streetName || null,
      addrStreetType: address.streetType || null,
      addrSuburb: address.suburb || null,
      addrState: address.state || null,
      addrBusinessName: address.businessName || null,
      vehRegistration: vehicle.registration || null,
      vehState: vehicle.state || null,
      vehColour: vehicle.colour || null,
      vehMake: vehicle.make || null,
      vehModel: vehicle.model || null,
      vehType: vehicle.vehicleType || null,
    };
  };

  const createNow = (payload: ReturnType<typeof buildPayload>) => {
    createMut.mutate({ targetId, ...payload });
  };

  const warnPayload = useRef<ReturnType<typeof buildPayload> | null>(null);

  const handleWarnContinue = () => {
    const current = warnQueue[warnIndex];
    if (current) {
      notDuplicateMutation.mutate({
        type: current.kind === "target" ? "person" : current.kind,
        labelA: current.candidateLabel,
        labelB: current.existingLabel,
      });
    }
    const next = warnIndex + 1;
    if (next < warnQueue.length) {
      setWarnIndex(next);
    } else {
      const payload = warnPayload.current;
      setWarnQueue([]);
      setWarnIndex(0);
      if (payload) createNow(payload);
    }
  };

  const handleWarnReview = () => {
    setWarnQueue([]);
    setWarnIndex(0);
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload.name) {
      toast.error("Enter both First Name/s and Surname.");
      return;
    }
    if (!isNew) {
      updateMut.mutate({ id: associate.id, ...payload });
      return;
    }
    const warnings = await runDuplicateChecks(utils, [
      { kind: "target", label: payload.name },
      { kind: "person", label: payload.name },
      { kind: "address", label: payload.hbf ?? "" },
      { kind: "vehicle", label: payload.v1f ?? "" },
      ...extraAddresses.map(ea => ({
        kind: "address" as const,
        label: composeAddress(ea).full,
      })),
      ...extraVehicles.map(ev => ({
        kind: "vehicle" as const,
        label: composeVehicle(ev).full,
      })),
    ]);
    if (warnings.length > 0) {
      warnPayload.current = payload;
      setWarnQueue(warnings);
      setWarnIndex(0);
    } else {
      createNow(payload);
    }
  };

  const saving = createMut.isPending || updateMut.isPending;
  const displayName =
    associate?.name || composeTargetName(identity).name || "New Associate";

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/10 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium truncate">
          {displayName}
        </span>
        {associate?.isIndicesOnly && <IndicesBadge />}
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-border/40">
          <TargetIdentityFields
            value={identity}
            onChange={v => mark(() => setIdentity(v))}
          />

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Home className="w-3 h-3" /> Address
            </p>
            <TargetAddressFields
              value={address}
              onChange={v => mark(() => setAddress(v))}
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Car className="w-3 h-3" /> Vehicle
            </p>
            <TargetVehicleFields
              value={vehicle}
              onChange={v => mark(() => setVehicle(v))}
            />
          </div>

          {extraAddresses.map((ea, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                  <Home className="w-3 h-3" /> Additional Address {i + 2}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => removeAddress(i)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <TargetAddressFields
                value={ea}
                onChange={v => updateAddressEntry(i, v)}
                label={ea.label}
                onLabelChange={v => updateAddressEntry(i, { label: v })}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 self-start"
            onClick={addAddress}
          >
            <Plus className="w-3.5 h-3.5" /> Add Address
          </Button>

          {extraVehicles.map((ev, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                  <Car className="w-3 h-3" /> Vehicle {i + 2}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => removeVehicle(i)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <TargetVehicleFields
                value={ev}
                onChange={v => updateVehicleEntry(i, v)}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 self-start"
            onClick={addVehicle}
          >
            <Plus className="w-3.5 h-3.5" /> Add Vehicle
          </Button>

          <div className="flex items-center justify-between">
            {!isNew && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2 ml-auto"
              onClick={handleSave}
              disabled={saving || (!isNew && !dirty)}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving…" : isNew ? "Add Associate" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {!isNew && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove associate?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove <strong>{associate.name}</strong> as an associate of this
                target? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setConfirmDelete(false);
                  deleteMut.mutate({ id: associate.id });
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <PossibleDuplicateAlert
        warning={warnQueue[warnIndex] ?? null}
        onContinue={handleWarnContinue}
        onReview={handleWarnReview}
      />
    </div>
  );
}

function AssociatesSection({ targetId }: { targetId: number }) {
  const { data: assocList } = trpc.associate.listForTarget.useQuery({
    targetId,
  });
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="mt-2 pt-3 border-t border-border/50 flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Associates
      </p>
      {(assocList ?? []).map(a => (
        <AssociateCard key={a.id} targetId={targetId} associate={a} />
      ))}
      {addingNew && (
        <AssociateCard
          targetId={targetId}
          associate={null}
          onCreated={() => setAddingNew(false)}
        />
      )}
      {!addingNew && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 self-start"
          onClick={() => setAddingNew(true)}
        >
          <Plus className="w-3.5 h-3.5" /> Add Associate
        </Button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TargetRegistryPage() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const { data: targets, isLoading } = trpc.target.registry.list.useQuery();

  const { viewMode } = useViewMode();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"alpha" | "recent" | "operation">(
    "alpha"
  );
  const [showCreate, setShowCreate] = useState(false);
  const [linkTarget, setLinkTarget] = useState<RegistryTarget | null>(null);
  // Store just the id, not a snapshot of the target object — deriving it
  // live from `targets` below means the tile dialog always reflects the
  // latest data (e.g. right after a merge), instead of freezing whatever
  // was true at the moment the tile was clicked.
  const [selectedTileTargetId, setSelectedTileTargetId] = useState<
    number | null
  >(null);
  const selectedTileTarget =
    (targets?.find(t => t.id === selectedTileTargetId) as
      | RegistryTarget
      | undefined) ?? null;

  const createMutation = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
      toast.success("Target added to registry.");
    },
  });

  const filtered = useMemo(() => {
    if (!targets) return [];
    const q = search.trim().toLowerCase();
    const searched = !q
      ? [...targets]
      : targets.filter(
          t =>
            t.name.toLowerCase().includes(q) ||
            (t.tgt ?? "").toLowerCase().includes(q) ||
            (t.hb ?? "").toLowerCase().includes(q) ||
            (t.hbf ?? "").toLowerCase().includes(q) ||
            (t.v1 ?? "").toLowerCase().includes(q) ||
            (t.v1f ?? "").toLowerCase().includes(q) ||
            (t.v2 ?? "").toLowerCase().includes(q) ||
            (t.v2f ?? "").toLowerCase().includes(q) ||
            t.linkedOperations.some(op =>
              (op.operationName ?? "").toLowerCase().includes(q)
            )
        );

    return [...searched].sort((a, b) => {
      if (sortBy === "alpha") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "recent") {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
      if (sortBy === "operation") {
        // Sort by first linked operation name alphabetically; unlinked targets go last
        const aOp =
          a.linkedOperations
            .map(o => o.operationName ?? "")
            .sort((x, y) => x.localeCompare(y))[0] ?? "";
        const bOp =
          b.linkedOperations
            .map(o => o.operationName ?? "")
            .sort((x, y) => x.localeCompare(y))[0] ?? "";
        if (!aOp && bOp) return 1; // a unlinked → goes after b
        if (aOp && !bOp) return -1; // b unlinked → a comes first
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
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-400/10 border border-rose-400/20 shrink-0">
              <BookOpen className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Target Registry
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                All targets are stored here independently. Deleting an operation
                or running sheet does not remove targets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            {filtered.length} of {targets.length} target
            {targets.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              {search
                ? "No targets match your search."
                : "No targets in the registry yet."}
            </p>
            {!search && (
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => setShowCreate(true)}
              >
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
                  <div className="p-2.5 rounded-lg bg-rose-400/10 border border-rose-400/20 shrink-0">
                    <Target className="w-5 h-5 text-rose-400" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-sky-400 hover:bg-sky-500/10"
                    onClick={e => {
                      e.stopPropagation();
                      setLinkTarget(t as RegistryTarget);
                    }}
                    title="Link to operations"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Name */}
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">
                    {t.name}
                  </p>
                  {t.isIndicesOnly && <IndicesBadge />}
                </div>

                {/* Key details */}
                <div className="flex flex-col gap-1 mt-auto">
                  {(t.v1f || t.v1) && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Car className="w-3 h-3 shrink-0" />
                      <span className="truncate text-foreground/80">
                        {t.v1f ?? t.v1}
                      </span>
                    </span>
                  )}
                  {(t.hbf || t.hb) && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Home className="w-3 h-3 shrink-0" />
                      <span className="truncate text-foreground/80">
                        {t.hbf ?? t.hb}
                      </span>
                    </span>
                  )}
                </div>

                {/* Linked operations */}
                {t.linkedOperations.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                    {t.linkedOperations.slice(0, 2).map(op => (
                      <Badge
                        key={op.operationId}
                        variant="secondary"
                        className="text-xs gap-1"
                      >
                        <BookOpen className="h-3 w-3" />
                        {op.operationName ?? `Op #${op.operationId}`}
                      </Badge>
                    ))}
                    {t.linkedOperations.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{t.linkedOperations.length - 2}
                      </Badge>
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
          <Dialog
            open={!!selectedTileTarget}
            onOpenChange={open => {
              if (!open) setSelectedTileTargetId(null);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  {selectedTileTarget.name}
                </DialogTitle>
              </DialogHeader>
              <TargetCard
                target={selectedTileTarget}
                onDeleted={() => {
                  setSelectedTileTargetId(null);
                  utils.target.registry.list.invalidate();
                }}
                onLinkOps={() => {
                  setLinkTarget(selectedTileTarget);
                  setSelectedTileTargetId(null);
                }}
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
        onSave={async payload => {
          await createMutation.mutateAsync(payload);
        }}
      />

      {/* Link to operations */}
      {linkTarget && (
        <LinkOperationDialog
          open={!!linkTarget}
          onClose={() => setLinkTarget(null)}
          targetId={linkTarget.id}
          targetName={linkTarget.name}
          linkedOperationIds={linkTarget.linkedOperations.map(
            o => o.operationId
          )}
        />
      )}
    </DashboardLayout>
  );
}
