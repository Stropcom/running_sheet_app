// Part of the Target Registry page (client/src/pages/TargetRegistry.tsx): one registry target's card (details, vehicles, photos, linked operations).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
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
import {} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Link2,
  ChevronRight,
  BookOpen,
  Save,
  Target,
  Car,
  Home,
  Pencil,
} from "lucide-react";
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
  formatBail,
  formatSpecialProjects,
  mdlLabel,
} from "@shared/targetStatus";
import {
  EntityPhotoUpload,
  useEntityPhotoSaver,
  useEntityPhotos,
} from "@/components/EntityPhotoUpload";
import type { SavedEntityLabels } from "@shared/entityPhotoSlots";
import { computePrimaryIdentity } from "@/components/AddTargetDialog";
import {
  composeAddress,
  composeVehicle,
  isoToDdMmYyyy,
  ddMmYyyyToIso,
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import { IndicesBadge } from "@/components/IndicesBadge";
import { RegistryBackgroundPanel } from "@/components/RegistryBackgroundPanel";
import { FORM_TONES } from "@/lib/formKit";
import { cn } from "@/lib/utils";
import type { RegistryTarget } from "./types";
import {
  targetTypeIcon,
  computeExtraModes,
  EditVsNewNote,
} from "./registryHelpers";
import { AssociatesSection } from "./AssociatesSection";

// ─── Target Card (inline edit, same as OperationDetail) ───────────────────────

export function TargetCard({
  target,
  onDeleted,
  defaultExpanded = false,
}: {
  target: RegistryTarget;
  onDeleted: () => void;
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
  const [status, setStatus] = useState<TargetStatusParts>(() =>
    statusPartsFromRecord(target)
  );
  // Flips on after a save attempt with MDL unanswered, to show the inline error.
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
  // Dynamic extra addresses/vehicles beyond the primary Home/Vehicle 1
  const [extraAddresses, setExtraAddresses] = useState<ExtraAddress[]>(() =>
    parseExtraAddresses(target.extraAddresses)
  );
  const [extraVehicles, setExtraVehicles] = useState<ExtraVehicle[]>(() =>
    parseExtraVehicles(target.extraVehicles)
  );
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // "Upload Image" in each entity's edit form (see EntityPhotoUpload): photos
  // are picked while editing and uploaded + linked once Save succeeds, by the
  // labels as saved (photoPlan, set in handleSave).
  const entityPhotos = useEntityPhotos();
  const photoOperationId = target.linkedOperations[0]?.operationId ?? null;
  const saveEntityPhotos = useEntityPhotoSaver({
    operationId: photoOperationId,
    person: { category: "target", targetId: target.id },
  });
  const photoPlan = useRef<SavedEntityLabels | null>(null);
  const photoDisabledReason = photoOperationId
    ? undefined
    : "Link this target to an operation to add photos here — or add them from its Images folder.";
  const addEntityPhoto = (
    slot: string,
    img: { dataBase64: string; mimeType: string }
  ) => {
    entityPhotos.add(slot, img);
    setDirty(true);
  };

  // Home Address (HB), Vehicle 1 (V1), and every additional address/vehicle
  // entry are "locked" once a value exists — an officer must explicitly
  // choose "Edit current" (in-place correction, no history) or "Add new"
  // (archives the current value as "Previous" before the new one replaces
  // it) rather than freely overtyping, which would silently lose whichever
  // value is discarded either way. Starts straight in edit mode when
  // there's nothing to preserve yet. Extra entries are tracked by their
  // stable `id`, not array position, so the mode map stays correct even as
  // entries are added/removed.
  // Name has no "Add new" option like Address/Vehicle do — a name change is
  // always correcting a mistake, not the target becoming a different person,
  // so there's no "Previous" value worth preserving in target_field_history.
  // Just a single Edit toggle for the same locked/at-a-glance look as the
  // other panels.
  const [nameMode, setNameMode] = useState<"locked" | "edit">(
    target.name ? "locked" : "edit"
  );
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
    setStatus(statusPartsFromRecord(target));
    setShowMdlError(false);
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
    setNameMode(target.name ? "locked" : "edit");
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

  const startEditName = () => {
    setNameMode("edit");
    setDirty(true);
  };
  const cancelNameEdit = () => {
    entityPhotos.removeSlot("name");
    setNameMode("locked");
    setIdentity({
      firstNames: target.firstNames ?? "",
      surname: target.surname ?? "",
      bornDate: isoToDdMmYyyy(target.bornDate),
    });
    setStatus(statusPartsFromRecord(target));
    setShowMdlError(false);
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
    entityPhotos.removeSlot("address");
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
  const removePrimaryVehicle = () => {
    setVehicle(EMPTY_VEHICLE_PARTS);
    setVehicleMode("edit");
    setDirty(true);
  };
  const cancelVehicleEdit = () => {
    entityPhotos.removeSlot("vehicle");
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
  const cancelExtraAddressEdit = (id: string) => {
    entityPhotos.removeSlot(`xa:${id}`);
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
  const cancelExtraVehicleEdit = (id: string) => {
    entityPhotos.removeSlot(`xv:${id}`);
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
    const gone = extraAddresses[i];
    if (gone) entityPhotos.removeSlot(`xa:${gone.id}`);
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
    const gone = extraVehicles[i];
    if (gone) entityPhotos.removeSlot(`xv:${gone.id}`);
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
    // name/tgt come from whichever fields are this target's PRIMARY
    // identity — Identity for a Person target (unchanged), but Vehicle 1 /
    // Home Address for a Vehicle/Location target, since editing e.g. this
    // target's own registration needs to update its registry name and
    // Running Sheet title bracket too, not just v1f — see
    // computePrimaryIdentity's own comment in AddTargetDialog.tsx.
    const { name, tgt } = computePrimaryIdentity(
      target.targetType,
      identity,
      address,
      vehicle
    );
    if (!name) {
      toast.error(
        target.targetType === "vehicle"
          ? "Enter Registration, Colour, Make and Model."
          : target.targetType === "location"
            ? "Enter House No, Street Name, Street Type and Suburb."
            : "Enter both First Name/s and Surname."
      );
      return;
    }
    // MDL is compulsory for a person target — open the Name panel so the
    // dropdown (and its error) is actually in front of the officer.
    if (target.targetType === "person" && mdlMissing(status)) {
      setShowMdlError(true);
      setNameMode("edit");
      toast.error(
        "Select the target's MDL status (Active, None or Suspended)."
      );
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
    photoPlan.current = {
      name,
      hbf: hbf || null,
      v1f: v1f || null,
      extraAddresses: composedExtraAddresses,
      extraVehicles: composedExtraVehicles,
    };
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
      ...(target.targetType === "person" ? statusPartsToPayload(status) : {}),
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
      if (photoPlan.current && entityPhotos.photos.length > 0) {
        void saveEntityPhotos(entityPhotos.photos, photoPlan.current);
        entityPhotos.clear();
      }
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
            {targetTypeIcon(target.targetType)}
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

            {target.targetType === "person" && (
              <div className={cn(FORM_TONES.person.panel, "p-3")}>
                <p className={FORM_TONES.person.band}>
                  <Target className="w-3 h-3" />
                  Name
                  {target.linkedAssociateId && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] gap-1 font-medium normal-case tracking-normal ml-1"
                      title="This target's name/address/vehicle stay in sync with a linked Associate record elsewhere in the registry — the same real person, filed both ways."
                    >
                      <Link2 className="h-2.5 w-2.5" /> Linked to an associate
                    </Badge>
                  )}
                </p>
                {nameMode === "locked" ? (
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <div className="flex-1 flex flex-col gap-0.5">
                      <p className="text-sm text-foreground">{target.name}</p>
                      <p
                        className={`text-xs ${target.mdlStatus ? "text-muted-foreground" : "text-destructive"}`}
                      >
                        MDL:{" "}
                        {target.mdlStatus
                          ? mdlLabel(target.mdlStatus)
                          : "not set — required"}
                      </p>
                      {target.bailStatus && (
                        <p className="text-xs text-muted-foreground">
                          Bail: {formatBail(target)}
                        </p>
                      )}
                      {formatSpecialProjects(target.specialProjects) && (
                        <p className="text-xs text-muted-foreground">
                          Special projects:{" "}
                          {formatSpecialProjects(target.specialProjects)}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7 sm:shrink-0"
                      onClick={startEditName}
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <TargetIdentityFields
                      value={identity}
                      onChange={v => mark(() => setIdentity(v))}
                      status={status}
                      onStatusChange={v => mark(() => setStatus(v))}
                      showMdlError={showMdlError}
                    />
                    <EntityPhotoUpload
                      slot={"name"}
                      photos={entityPhotos.photos}
                      onAdd={addEntityPhoto}
                      onRemove={entityPhotos.remove}
                      tone="person"
                      ownerLabel={target.name || "This target"}
                      disabledReason={photoDisabledReason}
                    />
                    {target.name && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs self-start"
                        onClick={cancelNameEdit}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className={cn(FORM_TONES.address.panel, "p-3")}>
              <p className={FORM_TONES.address.band}>
                <Home className="w-3 h-3" />
                {target.targetType === "location"
                  ? "Location Identity"
                  : "Home Address"}
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
                  <EntityPhotoUpload
                    slot={"address"}
                    photos={entityPhotos.photos}
                    onAdd={addEntityPhoto}
                    onRemove={entityPhotos.remove}
                    tone="address"
                    ownerLabel={"Home address"}
                    disabledReason={photoDisabledReason}
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

            {/* ── Dynamic extra addresses — same lock/Edit/Add-new pattern as
                 Home Address, tracked per entry by its stable id. ── */}
            {extraAddresses.map((ea, i) => {
              const mode = extraAddressModes[ea.id] ?? "edit";
              return (
                <div
                  key={ea.id}
                  className={cn(
                    FORM_TONES.address.panel,
                    "p-3 flex flex-col gap-2"
                  )}
                >
                  <div className={FORM_TONES.address.band}>
                    <Home className="w-3 h-3" /> Additional Address {i + 2}
                  </div>
                  {mode === "locked" ? (
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
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                          onClick={() => removeAddress(i)}
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <TargetAddressFields
                        value={ea}
                        onChange={v => updateAddress(i, v)}
                        label={ea.label}
                        onLabelChange={v => updateAddress(i, { label: v })}
                      />
                      <EntityPhotoUpload
                        slot={`xa:${ea.id}`}
                        photos={entityPhotos.photos}
                        onAdd={addEntityPhoto}
                        onRemove={entityPhotos.remove}
                        tone="address"
                        ownerLabel={ea.label || `Address ${i + 2}`}
                        disabledReason={photoDisabledReason}
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

            <div className={cn(FORM_TONES.vehicle.panel, "p-3")}>
              <p className={FORM_TONES.vehicle.band}>
                <Car className="w-3 h-3" />
                {target.targetType === "vehicle"
                  ? "Vehicle Identity"
                  : "Vehicle 1"}
              </p>
              {vehicleMode === "locked" ? (
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
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                      onClick={removePrimaryVehicle}
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <TargetVehicleFields
                    value={vehicle}
                    onChange={v => mark(() => setVehicle(v))}
                  />
                  <EntityPhotoUpload
                    slot={"vehicle"}
                    photos={entityPhotos.photos}
                    onAdd={addEntityPhoto}
                    onRemove={entityPhotos.remove}
                    tone="vehicle"
                    ownerLabel={"Vehicle 1"}
                    disabledReason={photoDisabledReason}
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

            {/* ── Dynamic extra vehicles (V2, V3, …) — same pattern ── */}
            {extraVehicles.map((ev, i) => {
              const mode = extraVehicleModes[ev.id] ?? "edit";
              return (
                <div
                  key={ev.id}
                  className={cn(
                    FORM_TONES.vehicle.panel,
                    "p-3 flex flex-col gap-2"
                  )}
                >
                  <div className={FORM_TONES.vehicle.band}>
                    <Car className="w-3 h-3" /> Vehicle {i + 2}
                  </div>
                  {mode === "locked" ? (
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
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                          onClick={() => removeVehicle(i)}
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <TargetVehicleFields
                        value={ev}
                        onChange={v => updateVehicle(i, v)}
                      />
                      <EntityPhotoUpload
                        slot={`xv:${ev.id}`}
                        photos={entityPhotos.photos}
                        onAdd={addEntityPhoto}
                        onRemove={entityPhotos.remove}
                        tone="vehicle"
                        ownerLabel={`Vehicle ${i + 2}`}
                        disabledReason={photoDisabledReason}
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

            <AssociatesSection
              targetId={target.id}
              operationId={target.linkedOperations[0]?.operationId ?? null}
              targetAddress={{
                unitNo: target.addrUnitNo ?? "",
                houseNo: target.addrHouseNo ?? "",
                streetName: target.addrStreetName ?? "",
                streetType: target.addrStreetType ?? "",
                suburb: target.addrSuburb ?? "",
                state: target.addrState ?? "WA",
                // Not copied: a business/place name stands in for a
                // person's name on an associate card (composeAssociateName).
                businessName: "",
              }}
            />

            <RegistryBackgroundPanel
              targetId={target.id}
              background={target.registryBackground ?? null}
              updatedAt={target.registryBackgroundUpdatedAt ?? null}
              updatedByCIN={target.registryBackgroundUpdatedByCIN ?? null}
              operationNames={target.linkedOperations
                .map(o => o.operationName)
                .filter((n): n is string => !!n)}
            />

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
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
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
