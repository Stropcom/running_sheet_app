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
import { Plus, X, Home, Car, Users, AlertTriangle, Merge } from "lucide-react";
import {
  TargetIdentityFields,
  TargetAddressFields,
  TargetVehicleFields,
  EMPTY_NAME_PARTS,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  makeExtraId,
  type ExtraAddress,
  type ExtraVehicle,
} from "@/components/TargetStructuredFields";
import {
  composeTargetName,
  composeAssociateName,
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
import {
  PossibleDuplicateAlert,
  type DuplicateWarning,
} from "@/components/PossibleDuplicateAlert";
import { runDuplicateChecks } from "@/lib/duplicateCheck";
import { OperationPicker } from "@/components/OperationPicker";
import type { DocumentImportPrefill } from "@/components/ImportTargetDocumentDialog";

// Referenced only for the merge dialog's incoming.wildFields shape — Wild
// Fields is deprecated app-wide, this dialog never collects one, but the
// merge dialog's existing interface still expects the key.
type WildField = { label: string; value: string };

export interface RegistryCreatePayload {
  /** Every target must belong to at least one operation now — chosen (or
   * created inline) via the OperationPicker at the top of this dialog. */
  linkToOperationId: number;
  /** The document's free-text narrative, if this target was created via
   * document import — stored against the (target, operation) link as its
   * "{Operation name} background", read-only, shown on the Target profile.
   * Null for a manually-added target, or an import with no narrative. */
  background: string | null;
  /** The full parsed document snapshot, verbatim as the officer reviewed it
   * on the import review screen — present only when this save came from
   * "Import from Document". Recorded as its own version alongside
   * `background` above; see targetDocumentImports in schema.ts. */
  documentSnapshotJson: string | null;
  documentSourceFileName: string | null;
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
  addrBusinessName: string | null;
  vehRegistration: string | null;
  vehState: string | null;
  vehColour: string | null;
  vehMake: string | null;
  vehModel: string | null;
  vehType: string | null;
  /** Set only for the "Yes, same person — link and copy" resolution — the
   * caller should create this target via
   * `target.registry.createLinkedFromAssociate` instead of the plain
   * `create`, passing this through. Absent on a normal save. */
  existingAssociateId?: number | null;
}

// A person the officer wants to record as an associate of this brand-new
// target, staged locally (no associate row exists yet — associates always
// belong to a real targetId) and created right after the target itself
// saves successfully. Same three-part shape (identity/address/vehicle) as
// the target's own fields, reusing the identical field components.
export interface StagedAssociate {
  key: string;
  identity: StructuredNameParts;
  address: StructuredAddressParts;
  vehicle: StructuredVehicleParts & { vehicleType: string };
}

export function AddTargetDialog({
  open,
  onClose,
  onSave,
  initialOperation,
  initialIdentity,
  initialAddress,
  initialVehicle,
  initialExtraAddresses,
  initialExtraVehicles,
  initialAssociates,
  initialBackground,
  initialDocumentSnapshot,
}: {
  open: boolean;
  onClose: () => void;
  /** Resolves with the newly-created (or linked) target's id, so this
   * dialog can create any staged associates against it once the target
   * itself is safely saved. */
  onSave: (data: RegistryCreatePayload) => Promise<{ id: number }>;
  /** The operation this dialog was opened from (Operation Detail / a running
   * sheet already know it) — pre-fills the required OperationPicker, but the
   * officer can still change it. Undefined when there's no page context
   * (the global Target Registry) — the picker starts blank and must be
   * chosen before saving. Unlike the initial* import fields below, this is
   * standing page context, not a one-time seed — restored on cancel/reset
   * rather than cleared, since the dialog isn't remounted between opens on
   * these pages. */
  initialOperation?: { id: number; name: string } | null;
  /** Pre-fills the form from a parsed document import (see
   * ImportTargetDocumentDialog.tsx) instead of starting blank. Read once
   * via lazy state init — the caller re-mounts this dialog with a fresh
   * `key` for each import so a later plain "Add Target" open isn't stuck
   * showing a previous import's values. */
  initialIdentity?: StructuredNameParts;
  initialAddress?: StructuredAddressParts;
  initialVehicle?: StructuredVehicleParts & { vehicleType: string };
  initialExtraAddresses?: ExtraAddress[];
  initialExtraVehicles?: ExtraVehicle[];
  initialAssociates?: StagedAssociate[];
  /** The document's free-text narrative — carried straight through to the
   * saved target's "{Operation name} background" (see RegistryCreatePayload
   * .background), same one-time-seed treatment as the other initial* import
   * fields. */
  initialBackground?: string;
  /** The full prefill this dialog was opened with, when it came from a
   * document import — recorded verbatim alongside the target on save (see
   * RegistryCreatePayload.documentSnapshotJson) rather than re-derived from
   * whatever the officer edits into the form fields below. Same one-time-
   * seed treatment as the other initial* import fields: read once, not
   * kept in sync with later edits in this dialog. */
  initialDocumentSnapshot?: DocumentImportPrefill | null;
}) {
  const [operation, setOperation] = useState<{
    id: number;
    name: string;
  } | null>(() => initialOperation ?? null);
  const [identity, setIdentity] = useState<StructuredNameParts>(
    () => initialIdentity ?? EMPTY_NAME_PARTS
  );
  const [address, setAddress] = useState<StructuredAddressParts>(
    () => initialAddress ?? EMPTY_ADDRESS_PARTS
  );
  const [vehicle, setVehicle] = useState<
    StructuredVehicleParts & { vehicleType: string }
  >(() => initialVehicle ?? EMPTY_VEHICLE_PARTS);
  const [dep, setDep] = useState("");
  const [arr, setArr] = useState("");
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>(
    () => initialExtraAddresses ?? []
  );
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(
    () => initialExtraVehicles ?? []
  );
  const [associates, setAssociates] = useState<StagedAssociate[]>(
    () => initialAssociates ?? []
  );
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const utils = trpc.useUtils();
  const associateCreateMut = trpc.associate.create.useMutation();

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

  // ── Secondary duplicate check (name-as-person/address/vehicle), only run
  // once the target-vs-target check above has cleared — catches e.g. this
  // "new" target actually being a known associate, or its address/vehicle
  // matching one already recorded elsewhere. Warn-only: unlike the
  // target-vs-target case there's no record to merge into, so the officer
  // just confirms and moves on.
  const [warnQueue, setWarnQueue] = useState<DuplicateWarning[]>([]);
  const [warnIndex, setWarnIndex] = useState(0);
  const notDuplicateMutation =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();

  const resetAndClose = () => {
    setOperation(initialOperation ?? null);
    setIdentity(EMPTY_NAME_PARTS);
    setAddress(EMPTY_ADDRESS_PARTS);
    setVehicle(EMPTY_VEHICLE_PARTS);
    setDep("");
    setArr("");
    setExtraAddresses([]);
    setExtraVehicles([]);
    setAssociates([]);
    setDupMatch(null);
    setExistingFull(null);
    setMergeOpen(false);
    setWarnQueue([]);
    setWarnIndex(0);
    setLinking(false);
    onClose();
  };

  const buildPayload = (): RegistryCreatePayload => {
    const { name, tgt } = composeTargetName(identity);
    const { full: hbf, short: hb } = composeAddress(address);
    const { full: v1f, short: v1 } = composeVehicle(vehicle);
    return {
      linkToOperationId: operation!.id,
      background: initialBackground?.trim() || null,
      documentSnapshotJson: initialDocumentSnapshot
        ? JSON.stringify(initialDocumentSnapshot)
        : null,
      documentSourceFileName: initialDocumentSnapshot?.sourceFileName || null,
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
      addrBusinessName: address.businessName || null,
      vehRegistration: vehicle.registration || null,
      vehState: vehicle.state || null,
      vehColour: vehicle.colour || null,
      vehMake: vehicle.make || null,
      vehModel: vehicle.model || null,
      vehType: vehicle.vehicleType || null,
    };
  };

  // Creates every staged associate against the just-saved target. Skips any
  // entry with no name AND no business/place name (an officer who tapped
  // "Add Associate" but left it blank shouldn't get an error) — a business
  // name stands in for a person's First Name/s + Surname, see
  // composeAssociateName. Deliberately doesn't run the possible-duplicate
  // check AssociateCard's own save does — with several associates possibly
  // staged at once that flow doesn't fit well inside this dialog; a genuine
  // duplicate can still be merged afterward from the Target Registry the
  // same way any other duplicate is.
  const saveStagedAssociates = async (targetId: number) => {
    const toCreate = associates
      .map(a => {
        const { name, tgt } = composeAssociateName(
          a.identity,
          a.address.businessName
        );
        if (!name) return null;
        const { full: hbf, short: hb } = composeAddress(a.address);
        const { full: v1f, short: v1 } = composeVehicle(a.vehicle);
        return {
          targetId,
          name,
          tgt: tgt || null,
          hbf: hbf || null,
          hb: hb || null,
          v1f: v1f || null,
          v1: v1 || null,
          firstNames: a.identity.firstNames || null,
          surname: a.identity.surname || null,
          bornDate: ddMmYyyyToIso(a.identity.bornDate) || null,
          addrUnitNo: a.address.unitNo || null,
          addrHouseNo: a.address.houseNo || null,
          addrStreetName: a.address.streetName || null,
          addrStreetType: a.address.streetType || null,
          addrSuburb: a.address.suburb || null,
          addrState: a.address.state || null,
          addrBusinessName: a.address.businessName || null,
          vehRegistration: a.vehicle.registration || null,
          vehState: a.vehicle.state || null,
          vehColour: a.vehicle.colour || null,
          vehMake: a.vehicle.make || null,
          vehModel: a.vehicle.model || null,
          vehType: a.vehicle.vehicleType || null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (toCreate.length === 0) return;
    const results = await Promise.allSettled(
      toCreate.map(payload => associateCreateMut.mutateAsync(payload))
    );
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(
        `Target saved, but ${failed} associate${failed > 1 ? "s" : ""} failed to save — add ${failed > 1 ? "them" : "it"} from the target's card in the registry.`
      );
    }
  };

  const saveAsNew = async () => {
    setSaving(true);
    try {
      const result = await onSave(buildPayload());
      await saveStagedAssociates(result.id);
      resetAndClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save target.");
    } finally {
      setSaving(false);
    }
  };

  // Builds the create payload for "Yes, same person — link and copy": every
  // shared identity field comes from the matched Associate record, not
  // whatever the officer had typed in this form — DEP/ARR (target-only,
  // an associate has no equivalent) stay whatever the officer entered here.
  const buildLinkedPayload = (associate: {
    id: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    hb: string | null;
    v1f: string | null;
    v1: string | null;
    extraAddresses: string | null;
    extraVehicles: string | null;
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
  }): RegistryCreatePayload => ({
    linkToOperationId: operation!.id,
    background: initialBackground?.trim() || null,
    documentSnapshotJson: initialDocumentSnapshot
      ? JSON.stringify(initialDocumentSnapshot)
      : null,
    documentSourceFileName: initialDocumentSnapshot?.sourceFileName || null,
    name: associate.name,
    tgt: associate.tgt,
    hbf: associate.hbf,
    hb: associate.hb,
    v1f: associate.v1f,
    v1: associate.v1,
    dep: dep || null,
    arr: arr || null,
    extraAddresses: associate.extraAddresses ?? "[]",
    extraVehicles: associate.extraVehicles ?? "[]",
    firstNames: associate.firstNames,
    surname: associate.surname,
    bornDate: associate.bornDate,
    addrUnitNo: associate.addrUnitNo,
    addrHouseNo: associate.addrHouseNo,
    addrStreetName: associate.addrStreetName,
    addrStreetType: associate.addrStreetType,
    addrSuburb: associate.addrSuburb,
    addrState: associate.addrState,
    addrBusinessName: associate.addrBusinessName,
    vehRegistration: associate.vehRegistration,
    vehState: associate.vehState,
    vehColour: associate.vehColour,
    vehMake: associate.vehMake,
    vehModel: associate.vehModel,
    vehType: associate.vehType,
    existingAssociateId: associate.id,
  });

  const composedName = composeTargetName(identity).name;

  const runSecondaryChecks = async () => {
    const { full: hbf } = composeAddress(address);
    const { full: v1f } = composeVehicle(vehicle);
    const warnings = await runDuplicateChecks(utils, [
      { kind: "person", label: composedName },
      { kind: "address", label: hbf },
      { kind: "vehicle", label: v1f },
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
      setWarnQueue(warnings);
      setWarnIndex(0);
    } else {
      await saveAsNew();
    }
  };

  const handleSave = async () => {
    if (!operation) {
      toast.error("Select an operation for this target.");
      return;
    }
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
        await runSecondaryChecks();
      }
    } catch {
      // If the duplicate check itself fails, don't block the save.
      await saveAsNew();
    } finally {
      setCheckingDup(false);
    }
  };

  const handleWarnContinue = async () => {
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
      setWarnQueue([]);
      setWarnIndex(0);
      await saveAsNew();
    }
  };

  const handleWarnReview = () => {
    setWarnQueue([]);
    setWarnIndex(0);
  };

  const handleWarnLinkAndCopy = async (linkable: {
    recordType: "target" | "associate";
    id: number;
  }) => {
    // This dialog only ever creates a Target, so the only linkable match it
    // can offer is an existing Associate record (a "target" match here
    // would mean two Targets share a name, which is the separate merge
    // flow above, not this one).
    if (linkable.recordType !== "associate") return;
    setLinking(true);
    try {
      const associate = await utils.associate.getById.fetch({
        id: linkable.id,
      });
      if (!associate) {
        toast.error("Couldn't load the matched associate.");
        return;
      }
      const result = await onSave(buildLinkedPayload(associate));
      await saveStagedAssociates(result.id);
      setWarnQueue([]);
      setWarnIndex(0);
      resetAndClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to link and copy.");
    } finally {
      setLinking(false);
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
      extraAddresses: extraAddresses.map(ea => {
        const c = composeAddress(ea);
        return {
          ...ea,
          businessName: ea.businessName ?? "",
          full: c.full,
          short: c.short,
        };
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
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Operation <span className="text-destructive">*</span>
              </label>
              <OperationPicker
                value={operation}
                onChange={setOperation}
                disabled={saving || checkingDup}
              />
            </div>

            <TargetIdentityFields value={identity} onChange={setIdentity} />

            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Home className="w-3 h-3" /> Home Address
              </p>
              <TargetAddressFields value={address} onChange={setAddress} />
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
                  {
                    ...EMPTY_ADDRESS_PARTS,
                    id: makeExtraId(),
                    label: "",
                    full: "",
                    short: "",
                  },
                ])
              }
            >
              <Plus className="w-3.5 h-3.5" /> Add Address
            </Button>

            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Car className="w-3 h-3" /> Vehicle 1
              </p>
              <TargetVehicleFields value={vehicle} onChange={setVehicle} />
            </div>

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
                  {
                    ...EMPTY_VEHICLE_PARTS,
                    id: makeExtraId(),
                    full: "",
                    short: "",
                  },
                ])
              }
            >
              <Plus className="w-3.5 h-3.5" /> Add Vehicle
            </Button>

            {/* Associates — same position as AssociatesSection on the
                saved target's own card (server/db.ts requires a real
                targetId, so these are staged here and created right after
                the target itself saves). */}
            <div className="mt-2 pt-3 border-t border-border/50 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Associates
              </p>
              {associates.map((assoc, i) => (
                <div
                  key={assoc.key}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> Associate {i + 1}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() =>
                        setAssociates(v => v.filter((_, idx) => idx !== i))
                      }
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <TargetIdentityFields
                    value={assoc.identity}
                    onChange={v =>
                      setAssociates(list =>
                        list.map((item, idx) =>
                          idx === i ? { ...item, identity: v } : item
                        )
                      )
                    }
                  />
                  <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <Home className="w-3 h-3" /> Home Address
                    </p>
                    <TargetAddressFields
                      value={assoc.address}
                      onChange={v =>
                        setAssociates(list =>
                          list.map((item, idx) =>
                            idx === i ? { ...item, address: v } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <Car className="w-3 h-3" /> Vehicle 1
                    </p>
                    <TargetVehicleFields
                      value={assoc.vehicle}
                      onChange={v =>
                        setAssociates(list =>
                          list.map((item, idx) =>
                            idx === i ? { ...item, vehicle: v } : item
                          )
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 self-start"
                onClick={() =>
                  setAssociates(v => [
                    ...v,
                    {
                      key: makeExtraId(),
                      identity: EMPTY_NAME_PARTS,
                      address: EMPTY_ADDRESS_PARTS,
                      vehicle: EMPTY_VEHICLE_PARTS,
                    },
                  ])
                }
              >
                <Plus className="w-3.5 h-3.5" /> Add Associate
              </Button>
            </div>

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
                runSecondaryChecks();
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

      {/* Secondary duplicate checks — address/vehicle/name-as-person */}
      <PossibleDuplicateAlert
        warning={warnQueue[warnIndex] ?? null}
        onContinue={handleWarnContinue}
        onReview={handleWarnReview}
        onLinkAndCopy={handleWarnLinkAndCopy}
        linking={linking}
      />

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
          linkToOperationId={operation!.id}
          background={initialBackground?.trim() || null}
          documentSnapshotJson={
            initialDocumentSnapshot
              ? JSON.stringify(initialDocumentSnapshot)
              : null
          }
          documentSourceFileName={
            initialDocumentSnapshot?.sourceFileName || null
          }
          onMerged={() => {
            utils.target.registry.list.invalidate();
            resetAndClose();
          }}
        />
      )}
    </>
  );
}
