// Part of the operation page (client/src/pages/OperationDetail.tsx): one target's card (expand, edit, delete).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Plus,
  ChevronRight,
  Trash2,
  X,
  Pencil,
  Target,
  Save,
  Car,
  Home,
} from "lucide-react";
import {} from "@/components/ui/select";
import { useState } from "react";
import {
  TargetIdentityFields,
  TargetAddressFields,
  TargetVehicleFields,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  parseExtraVehicles,
  parseExtraAddresses,
  makeExtraId,
  mdlMissing,
  statusPartsFromRecord,
  statusPartsToPayload,
  type ExtraVehicle,
  type ExtraAddress,
  type TargetStatusParts,
} from "@/components/TargetStructuredFields";
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
import { useLocation } from "wouter";
import { toast } from "sonner";

/** Single target card — shows name + structured identity/address/vehicle fields, inline edit, delete */
export function TargetCard({
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
    mdlStatus?: string | null;
    bailStatus?: string | null;
    bailConditions?: string | null;
    bailConditionsText?: string | null;
    specialProjects?: string | null;
    addrUnitNo?: string | null;
    addrHouseNo?: string | null;
    addrStreetName?: string | null;
    addrStreetType?: string | null;
    addrSuburb?: string | null;
    addrState?: string | null;
    addrBusinessName?: string | null;
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
  const [status, setStatus] = useState<TargetStatusParts>(() =>
    statusPartsFromRecord(target)
  );
  const [showMdlError, setShowMdlError] = useState(false);
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
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>(() =>
    parseExtraAddresses(target.extraAddresses)
  );
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(() =>
    parseExtraVehicles(target.extraVehicles)
  );
  const [dirty, setDirty] = useState(false);

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
  const updateAddress = (i: number, patch: Partial<ExtraAddress>) => {
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
    if (mdlMissing(status)) {
      setShowMdlError(true);
      toast.error(
        "Select the target's MDL status (Active, None or Suspended)."
      );
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
      extraAddresses: JSON.stringify(
        extraAddresses.map(ea => ({ ...ea, ...composeAddress(ea) }))
      ),
      extraVehicles: JSON.stringify(
        extraVehicles.map(ev => ({ ...ev, ...composeVehicle(ev) }))
      ),
      firstNames: identity.firstNames || null,
      surname: identity.surname || null,
      bornDate: ddMmYyyyToIso(identity.bornDate) || null,
      ...statusPartsToPayload(status),
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
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      onDeleted();
      toast.success("Target removed from operation");
    },
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
  const mark = (fn: () => void) => {
    fn();
    setDirty(true);
  };

  // Per-target shortcuts
  const { data: targetShortcutList, refetch: refetchShortcuts } =
    trpc.targetShortcuts.list.useQuery(
      { targetId: target.id },
      { enabled: expanded }
    );
  const [newScTrigger, setNewScTrigger] = useState("");
  const [newScExpansion, setNewScExpansion] = useState("");
  const [editingScId, setEditingScId] = useState<number | null>(null);
  const [editScTrigger, setEditScTrigger] = useState("");
  const [editScExpansion, setEditScExpansion] = useState("");
  const createSc = trpc.targetShortcuts.create.useMutation({
    onSuccess: () => {
      refetchShortcuts();
      setNewScTrigger("");
      setNewScExpansion("");
      toast.success("Shortcut added");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateSc = trpc.targetShortcuts.update.useMutation({
    onSuccess: () => {
      refetchShortcuts();
      setEditingScId(null);
      toast.success("Shortcut updated");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const deleteSc = trpc.targetShortcuts.delete.useMutation({
    onSuccess: () => {
      refetchShortcuts();
      toast.success("Shortcut deleted");
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
          <span className="flex-1 font-semibold text-sm text-foreground truncate">
            {target.name}
          </span>
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </div>

        {/* Expanded fields */}
        {expanded && (
          <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border">
            <TargetIdentityFields
              value={identity}
              onChange={v => mark(() => setIdentity(v))}
              status={status}
              onStatusChange={v => mark(() => setStatus(v))}
              showMdlError={showMdlError}
            />

            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Home className="w-3 h-3" /> Home Address
              </p>
              <TargetAddressFields
                value={address}
                onChange={v => mark(() => setAddress(v))}
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/10 p-3">
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
              <div
                key={i}
                className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-2"
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
                  onChange={v => updateAddress(i, v)}
                  label={ea.label}
                  onLabelChange={v => updateAddress(i, { label: v })}
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

            {/* ── Dynamic extra vehicles (V2, V3, …) ── */}
            {extraVehicles.map((ev, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-2"
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
                  onChange={v => updateVehicle(i, v)}
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
              {fromSheetId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    removeFromSheet.mutate({
                      sheetId: fromSheetId,
                      targetId: null,
                    })
                  }
                  disabled={removeFromSheet.isPending}
                >
                  <X className="w-3.5 h-3.5" />
                  {removeFromSheet.isPending
                    ? "Removing…"
                    : "Remove from sheet"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-2 text-amber-700 dark:text-amber-300 hover:text-amber-600 hover:bg-amber-500/10"
                  onClick={() => setConfirmDelete(true)}
                  disabled={removeFromOp.isPending}
                >
                  <X className="w-3.5 h-3.5" />
                  {removeFromOp.isPending
                    ? "Removing…"
                    : "Remove from operation"}
                </Button>
              )}
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

            {/* ── Per-target shortcuts ── */}
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Target Shortcuts
              </p>
              {/* Existing shortcuts */}
              {(targetShortcutList ?? []).map(sc =>
                editingScId === sc.id ? (
                  <div
                    key={sc.id}
                    className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
                  >
                    <div className="flex gap-2">
                      <Input
                        className="w-28 font-mono text-sm"
                        placeholder="trigger"
                        value={editScTrigger}
                        onChange={e => setEditScTrigger(e.target.value)}
                      />
                      <Input
                        className="flex-1 text-sm"
                        placeholder="expansion text"
                        value={editScExpansion}
                        onChange={e => setEditScExpansion(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingScId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateSc.mutate({
                            id: sc.id,
                            trigger: editScTrigger,
                            expansion: editScExpansion,
                          })
                        }
                        disabled={
                          updateSc.isPending ||
                          !editScTrigger ||
                          !editScExpansion
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={sc.id}
                    className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                      {sc.trigger}
                    </span>
                    <span className="flex-1 text-sm text-foreground/80 break-words">
                      {sc.expansion}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditingScId(sc.id);
                          setEditScTrigger(sc.trigger);
                          setEditScExpansion(sc.expansion);
                        }}
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
                    onChange={e => setNewScTrigger(e.target.value)}
                  />
                  <Input
                    className="flex-1 text-sm"
                    placeholder="expansion text"
                    value={newScExpansion}
                    onChange={e => setNewScExpansion(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start gap-1.5"
                  onClick={() =>
                    createSc.mutate({
                      targetId: target.id,
                      trigger: newScTrigger,
                      expansion: newScExpansion,
                    })
                  }
                  disabled={
                    createSc.isPending ||
                    !newScTrigger.trim() ||
                    !newScExpansion.trim()
                  }
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
              This will remove <strong>{target.name}</strong> from this
              operation. The target will remain in the Target Registry and can
              be re-linked at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setConfirmDelete(false);
                removeFromOp.mutate({ targetId: target.id, operationId });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
