/**
 * Add Target dialog — full structured Name → Address → Vehicle entry for a
 * brand-new target, shared between the Target Registry page and Operation
 * Detail's "Add Target" flow so a target can't be created anywhere in the
 * app via a bare free-text name field. Includes the same possible-duplicate
 * detection/merge flow either caller wants: `onSave` receives the composed
 * payload for the caller to `create.mutateAsync`, while the duplicate check
 * and field-level merge (against an existing target) are handled internally.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, X, Home, Car, AlertTriangle, Merge } from "lucide-react";
import {
  TargetIdentityFields,
  TargetAddressFields,
  TargetVehicleFields,
  EMPTY_NAME_PARTS,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  type ExtraAddress,
  type ExtraVehicle,
} from "@/components/TargetStructuredFields";
import {
  composeTargetName,
  composeAddress,
  composeVehicle,
  ddMmYyyyToIso,
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import {
  TargetMergeDialog,
  type ExistingTargetLike,
} from "@/components/TargetMergeDialog";

// Referenced only for the merge dialog's incoming.wildFields shape — Wild
// Fields is deprecated app-wide, this dialog never collects one, but the
// merge dialog's existing interface still expects the key.
type WildField = { label: string; value: string };

export interface RegistryCreatePayload {
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  dep: string | null;
  arr: string | null;
  extraAddresses: string;
  extraVehicles: string;
  firstNames: string | null;
  surname: string | null;
  bornDate: string | null;
  addrUnitNo: string | null;
  addrHouseNo: string | null;
  addrStreetName: string | null;
  addrStreetType: string | null;
  addrSuburb: string | null;
  addrState: string | null;
  vehRegistration: string | null;
  vehState: string | null;
  vehColour: string | null;
  vehMake: string | null;
  vehModel: string | null;
  vehType: string | null;
}

export function AddTargetDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: RegistryCreatePayload) => Promise<void>;
}) {
  const [identity, setIdentity] =
    useState<StructuredNameParts>(EMPTY_NAME_PARTS);
  const [address, setAddress] =
    useState<StructuredAddressParts>(EMPTY_ADDRESS_PARTS);
  const [vehicle, setVehicle] = useState<
    StructuredVehicleParts & { vehicleType: string }
  >(EMPTY_VEHICLE_PARTS);
  const [dep, setDep] = useState("");
  const [arr, setArr] = useState("");
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>([]);
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>([]);
  const [saving, setSaving] = useState(false);
  const utils = trpc.useUtils();

  // ── Possible-duplicate detection (fires on Save, not while typing) ──
  // A name that fuzzy-matches an existing target offers a merge instead of
  // silently creating a lookalike duplicate record.
  const [dupMatch, setDupMatch] = useState<{
    id: number;
    name: string;
    reason: string;
  } | null>(null);
  const [existingFull, setExistingFull] = useState<ExistingTargetLike | null>(
    null
  );
  const [mergeOpen, setMergeOpen] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);

  const resetAndClose = () => {
    setIdentity(EMPTY_NAME_PARTS);
    setAddress(EMPTY_ADDRESS_PARTS);
    setVehicle(EMPTY_VEHICLE_PARTS);
    setDep("");
    setArr("");
    setExtraAddresses([]);
    setExtraVehicles([]);
    setDupMatch(null);
    setExistingFull(null);
    setMergeOpen(false);
    onClose();
  };

  const buildPayload = (): RegistryCreatePayload => {
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
    };
  };

  const saveAsNew = async () => {
    setSaving(true);
    try {
      await onSave(buildPayload());
      resetAndClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save target.");
    } finally {
      setSaving(false);
    }
  };

  const composedName = composeTargetName(identity).name;

  const handleSave = async () => {
    if (!composedName) {
      toast.error("Enter both First Name/s and Surname.");
      return;
    }
    setCheckingDup(true);
    try {
      const match = await utils.target.registry.findPossibleDuplicate.fetch({
        name: composedName,
      });
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
    if (!full) {
      toast.error("Couldn't load the existing target.");
      return;
    }
    setExistingFull(full);
    setDupMatch(null);
    setMergeOpen(true);
  };

  // Composed strings for the merge dialog — same convention as a saved
  // target, so it can compare field-by-field against the existing record.
  const mergeIncoming = () => {
    const { name, tgt } = composeTargetName(identity);
    const { full: hbf, short: hb } = composeAddress(address);
    const { full: v1f, short: v1 } = composeVehicle(vehicle);
    return {
      name,
      tgt,
      hbf,
      hb,
      v1f,
      v1,
      dep,
      arr,
      extraVehicles: extraVehicles.map(ev => {
        const c = composeVehicle(ev);
        return { full: c.full, short: c.short };
      }),
      wildFields: [] as WildField[],
    };
  };

  return (
    <>
      <Dialog
        open={open && !mergeOpen}
        onOpenChange={v => {
          if (!v) resetAndClose();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Target to Registry</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <TargetIdentityFields value={identity} onChange={setIdentity} />

            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Home className="w-3 h-3" /> Home Address
              </p>
              <TargetAddressFields value={address} onChange={setAddress} />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Car className="w-3 h-3" /> Vehicle 1
              </p>
              <TargetVehicleFields value={vehicle} onChange={setVehicle} />
            </div>

            {/* Dynamic extra addresses */}
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
                    onClick={() =>
                      setExtraAddresses(v => v.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <TargetAddressFields
                  value={ea}
                  onChange={v =>
                    setExtraAddresses(list =>
                      list.map((item, idx) =>
                        idx === i ? { ...item, ...v } : item
                      )
                    )
                  }
                  label={ea.label}
                  onLabelChange={v =>
                    setExtraAddresses(list =>
                      list.map((item, idx) =>
                        idx === i ? { ...item, label: v } : item
                      )
                    )
                  }
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 self-start"
              onClick={() =>
                setExtraAddresses(v => [
                  ...v,
                  { ...EMPTY_ADDRESS_PARTS, label: "", full: "", short: "" },
                ])
              }
            >
              <Plus className="w-3.5 h-3.5" /> Add Address
            </Button>

            {/* Dynamic extra vehicles */}
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
                    onClick={() =>
                      setExtraVehicles(v => v.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <TargetVehicleFields
                  value={ev}
                  onChange={v =>
                    setExtraVehicles(list =>
                      list.map((item, idx) =>
                        idx === i ? { ...item, ...v } : item
                      )
                    )
                  }
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 self-start"
              onClick={() =>
                setExtraVehicles(v => [
                  ...v,
                  { ...EMPTY_VEHICLE_PARTS, full: "", short: "" },
                ])
              }
            >
              <Plus className="w-3.5 h-3.5" /> Add Vehicle
            </Button>

            {/* Depart / Arrive */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Depart (DEP)
              </label>
              <Input value={dep} onChange={e => setDep(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Arrive (ARR)
              </label>
              <Input value={arr} onChange={e => setArr(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={resetAndClose}
              disabled={saving || checkingDup}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || checkingDup}>
              {checkingDup ? "Checking…" : saving ? "Saving…" : "Save Target"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Possible duplicate — asks before either creating a lookalike or merging */}
      <AlertDialog
        open={dupMatch !== null}
        onOpenChange={v => {
          if (!v) setDupMatch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              Possible duplicate target
            </AlertDialogTitle>
            <AlertDialogDescription>
              "{composedName}" looks like it may be the same person as an
              existing target, <strong>{dupMatch?.name}</strong> (
              {dupMatch?.reason}). Is this the same person?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-col gap-2">
            <Button onClick={handleMergeInstead} className="w-full">
              <Merge className="w-4 h-4 mr-1.5" /> Yes — merge details
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setDupMatch(null);
                saveAsNew();
              }}
            >
              No, different person — create new
            </Button>
            <AlertDialogCancel
              onClick={() => setDupMatch(null)}
              className="w-full mt-0"
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Field-level merge into the existing target */}
      {existingFull && (
        <TargetMergeDialog
          open={mergeOpen}
          onOpenChange={v => {
            setMergeOpen(v);
            if (!v) setExistingFull(null);
          }}
          existing={existingFull}
          incoming={mergeIncoming()}
          onMerged={() => {
            utils.target.registry.list.invalidate();
            resetAndClose();
          }}
        />
      )}
    </>
  );
}
