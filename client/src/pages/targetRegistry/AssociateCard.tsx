// Part of the Target Registry page (client/src/pages/TargetRegistry.tsx): one associate's or resident's card.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Link2,
  ChevronRight,
  Save,
  X,
  Car,
  Home,
  Users,
  Pencil,
  Image as ImageIcon,
} from "lucide-react";
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
  EntityPhotoUpload,
  useEntityPhotoSaver,
  useEntityPhotos,
} from "@/components/EntityPhotoUpload";
import type { SavedEntityLabels } from "@shared/entityPhotoSlots";
import { readImageFile } from "@/components/AddTargetDialog";
import {
  composeAssociateName,
  composeAddress,
  composeVehicle,
  isSameHomeAddress,
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
import { PhotoOwnerCaption } from "@/components/PhotoOwnerCaption";
import { FORM_TONES } from "@/lib/formKit";
import { cn } from "@/lib/utils";
import type { AssociateRecord, PersonKind } from "./types";
import { computeExtraModes, PERSON_KIND_LABEL } from "./registryHelpers";

export function AssociateCard({
  targetId,
  associate,
  operationId,
  onCreated,
  relationship: newRelationship = "associate",
  defaultAddress,
  targetAddress,
}: {
  targetId: number;
  associate: AssociateRecord | null; // null = new, unsaved
  operationId: number | null;
  onCreated?: () => void;
  /** Which kind a NEW card creates (an existing record keeps its own). */
  relationship?: PersonKind;
  /** Pre-fills a NEW card's Home Address — used for Other Home Address
   * Residents, who by definition live at the target's home address. */
  defaultAddress?: StructuredAddressParts;
  /** The target's saved Home Address — an associate saved at this address
   * is offered a move to Other Home Address Residents. */
  targetAddress?: StructuredAddressParts;
}) {
  const utils = trpc.useUtils();
  const isNew = associate === null;
  const relationship: PersonKind = associate
    ? associate.relationship === "resident"
      ? "resident"
      : "associate"
    : newRelationship;
  const kindLabel = PERSON_KIND_LABEL[relationship];
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
      : (defaultAddress ?? EMPTY_ADDRESS_PARTS)
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

  // Upload Image (Person Identity's counterpart for an associate, see
  // AddTargetDialog.tsx). A new, unsaved associate has no id/entityLabel
  // yet, so a picked photo is staged here and only actually uploaded +
  // auto-linked once the create mutation below succeeds and a real name
  // exists to link against — same "wait for it to exist" reasoning as
  // AddTargetDialog's saveStagedImages. An already-saved associate has a
  // stable name already, so its photo uploads and links immediately.
  const [manualImages, setManualImages] = useState<
    { key: string; dataBase64: string; mimeType: string }[]
  >([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const manualImageInputRef = useRef<HTMLInputElement>(null);
  const uploadImageMut = trpc.attachment.uploadManual.useMutation();
  const confirmEntityFaceMut = trpc.attachment.confirmEntityFace.useMutation();
  const linkToEntityMut = trpc.attachment.linkToEntity.useMutation();

  // "Upload Image" in the Address / Vehicle edit forms (see
  // EntityPhotoUpload): picked while editing, uploaded + linked once Save
  // succeeds, by the labels as saved (photoPlan, set in buildPayload). The
  // person's own Upload Image above is separate and unchanged.
  const entityPhotos = useEntityPhotos();
  const saveEntityPhotos = useEntityPhotoSaver({
    operationId: operationId ?? null,
    person: { category: "associate" },
  });
  const photoPlan = useRef<SavedEntityLabels | null>(null);
  const photoDisabledReason = operationId
    ? undefined
    : "This target isn't linked to an operation yet — add photos from its Images folder.";
  const addEntityPhoto = (
    slot: string,
    img: { dataBase64: string; mimeType: string }
  ) => {
    entityPhotos.add(slot, img);
    setDirty(true);
  };

  const uploadAndLinkPhoto = async (
    img: { dataBase64: string; mimeType: string },
    entityLabel: string
  ) => {
    if (!operationId) return;
    const uploaded = await uploadImageMut.mutateAsync({
      operationId,
      dataBase64: img.dataBase64,
      mimeType: img.mimeType,
      fileName: `associate-photo-${Date.now()}.png`,
    });
    let faces: { index: number }[] = [];
    try {
      faces = await utils.attachment.detectFaces.fetch({
        attachmentId: uploaded.id,
      });
    } catch {
      faces = [];
    }
    if (faces.length === 1) {
      await confirmEntityFaceMut.mutateAsync({
        attachmentId: uploaded.id,
        faceIndex: faces[0].index,
        category: "associate",
        entityLabel,
        fromRegistry: true,
      });
    } else {
      await linkToEntityMut.mutateAsync({
        attachmentId: uploaded.id,
        category: "associate",
        entityLabel,
        fromRegistry: true,
      });
    }
  };

  // Runs once a new associate has actually been created (see createMut/
  // createLinkedMut onSuccess below) — uploads and links every photo
  // staged while the officer was still filling in the form.
  const savePendingPhotos = async (entityLabel: string) => {
    if (photoPlan.current && entityPhotos.photos.length > 0) {
      const photos = entityPhotos.photos;
      entityPhotos.clear();
      await saveEntityPhotos(photos, {
        ...photoPlan.current,
        name: entityLabel,
      });
    }
    if (manualImages.length === 0) return;
    const toUpload = manualImages;
    // Cleared up front so a second Save never uploads them again.
    setManualImages([]);
    let failed = 0;
    for (const img of toUpload) {
      try {
        await uploadAndLinkPhoto(img, entityLabel);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      toast.error(
        `Associate saved, but ${failed} photo${failed > 1 ? "s" : ""} failed to save — add ${failed > 1 ? "them" : "it"} from the target's Images folder.`
      );
    }
  };

  const handleImageSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (!operationId) {
      toast.error(
        "This target isn't linked to an operation yet — add photos from the target's Images folder instead."
      );
      return;
    }
    let img: { dataBase64: string; mimeType: string };
    try {
      img = await readImageFile(file);
    } catch {
      toast.error("Could not read that image.");
      return;
    }
    // Staged either way — a photo is never uploaded on pick. It shows as a
    // thumbnail and goes up with the card's own Save (savePendingPhotos).
    setManualImages(v => [...v, { key: makeExtraId(), ...img }]);
    if (!isNew) setDirty(true);
  };

  // Same locked/at-a-glance look as the Target's own panels, but simpler:
  // just Edit + Remove, no "Add new" — associates have no
  // target_field_history equivalent to archive a "Previous" value into, so
  // there's nothing for a second button to do.
  //
  // Checked against the composed hbf/hb and v1f/v1 fields first, but falls
  // back to composing from the structured columns (address/vehicle state,
  // already initialized from those columns above) for records where the
  // structured fields were saved but the composed text wasn't — otherwise
  // those records show as unlocked with no lock button to correct, despite
  // clearly having a value.
  // A new card always opens straight into edit, even when its address is
  // pre-filled (a resident's, from the target) — there's nothing saved yet
  // to lock.
  const [addressMode, setAddressMode] = useState<"locked" | "edit">(
    !isNew && (associate?.hbf || associate?.hb || composeAddress(address).full)
      ? "locked"
      : "edit"
  );
  const [vehicleMode, setVehicleMode] = useState<"locked" | "edit">(
    associate?.v1f || associate?.v1 || composeVehicle(vehicle).full
      ? "locked"
      : "edit"
  );
  const [extraAddressModes, setExtraAddressModes] = useState<
    Record<string, "locked" | "edit" | "new">
  >(() => computeExtraModes(parseExtraAddresses(associate?.extraAddresses)));
  const [extraVehicleModes, setExtraVehicleModes] = useState<
    Record<string, "locked" | "edit" | "new">
  >(() => computeExtraModes(parseExtraVehicles(associate?.extraVehicles)));

  const startEditAddress = () => {
    setAddressMode("edit");
    setDirty(true);
  };
  const removePrimaryAddress = () => {
    setAddress(EMPTY_ADDRESS_PARTS);
    setAddressMode("edit");
    setDirty(true);
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
  const startEditExtraAddress = (id: string) => {
    setExtraAddressModes(m => ({ ...m, [id]: "edit" }));
    setDirty(true);
  };
  const startEditExtraVehicle = (id: string) => {
    setExtraVehicleModes(m => ({ ...m, [id]: "edit" }));
    setDirty(true);
  };

  // ── Possible-duplicate warning (new associates only) — checks name/address/
  // vehicle against every existing target, associate and text-mined entity.
  // Warn-only: an associate's registry profile isn't merged into anything,
  // the officer just confirms it's genuinely a new person before saving.
  const [warnQueue, setWarnQueue] = useState<DuplicateWarning[]>([]);
  const [warnIndex, setWarnIndex] = useState(0);
  const notDuplicateMutation =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();
  const mergeEntitiesMutation = trpc.intelligence.mergeEntities.useMutation();

  const mark = (fn: () => void) => {
    fn();
    setDirty(true);
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
  const updateAddressEntry = (i: number, patch: Partial<ExtraAddress>) => {
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
  const updateVehicleEntry = (i: number, patch: Partial<ExtraVehicle>) => {
    setExtraVehicles(v =>
      v.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
    setDirty(true);
  };

  // Shown after an existing associate is saved at the target's home address
  // — never moved silently, since it changes how they're filed on the record.
  const [offerMove, setOfferMove] = useState(false);
  const moveMut = trpc.associate.update.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      setOfferMove(false);
      toast.success("Moved to Other Home Address Residents");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const createMut = trpc.associate.create.useMutation({
    onSuccess: (created, vars) => {
      utils.associate.listForTarget.invalidate({ targetId });
      toast.success(`${kindLabel} added`);
      // Same offer as the banner below, as a toast — this card is replaced by
      // the saved one as soon as it's created.
      if (
        relationship === "associate" &&
        targetAddress &&
        vars.addrHouseNo &&
        isSameHomeAddress(
          {
            unitNo: vars.addrUnitNo ?? "",
            houseNo: vars.addrHouseNo ?? "",
            streetName: vars.addrStreetName ?? "",
            streetType: vars.addrStreetType ?? "",
            suburb: vars.addrSuburb ?? "",
          },
          targetAddress
        )
      ) {
        toast("Same address as the target.", {
          description: "Move to Other Home Address Residents?",
          duration: 15000,
          action: {
            label: "Move",
            onClick: () =>
              moveMut.mutate({ id: created.id, relationship: "resident" }),
          },
        });
      }
      onCreated?.();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const createLinkedMut = trpc.associate.createLinkedFromTarget.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      toast.success(`${kindLabel} added and linked to the existing target`);
      onCreated?.();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateMut = trpc.associate.update.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      setDirty(false);
      toast.success(`${kindLabel} saved`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const deleteMut = trpc.associate.delete.useMutation({
    onSuccess: () => {
      utils.associate.listForTarget.invalidate({ targetId });
      toast.success(`${kindLabel} removed`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const buildPayload = () => {
    const { name, tgt } = composeAssociateName(identity, address.businessName);
    const { full: hbf, short: hb } = composeAddress(address);
    const { full: v1f, short: v1 } = composeVehicle(vehicle);
    // What a photo staged in an Address / Vehicle edit form links to once this
    // is saved (see savePendingPhotos).
    photoPlan.current = {
      name: name || null,
      hbf: hbf || null,
      v1f: v1f || null,
      extraAddresses: extraAddresses.map(ea => ({
        id: ea.id,
        full: composeAddress(ea).full,
      })),
      extraVehicles: extraVehicles.map(ev => ({
        id: ev.id,
        full: composeVehicle(ev).full,
      })),
    };
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
    createMut.mutate(
      { targetId, relationship, ...payload },
      { onSuccess: () => savePendingPhotos(payload.name) }
    );
  };

  const warnPayload = useRef<ReturnType<typeof buildPayload> | null>(null);

  // Name last run through the possible-duplicate check (on Surname blur, or
  // at Save) — so Save doesn't ask the same name question again once the
  // officer has already answered it.
  const checkedNameRef = useRef("");

  // Early check for a NEW card, fired when the officer tabs out of the
  // Surname field — same behaviour as the Add Target dialog's own Surname
  // blur: surface a name match against existing targets, associates and
  // mined people straight away rather than only at Save. Silent on
  // no-match/failure. warnPayload stays null on this path, so "No,
  // different" just closes the prompt instead of saving.
  const checkNameOnBlur = async () => {
    if (!isNew) return;
    const { name } = composeAssociateName(identity, address.businessName);
    if (!name || name === checkedNameRef.current) return;
    checkedNameRef.current = name;
    try {
      const warnings = await runDuplicateChecks(utils, [
        { kind: "target", label: name },
        { kind: "person", label: name },
      ]);
      if (warnings.length > 0) {
        warnPayload.current = null;
        setWarnQueue(warnings);
        setWarnIndex(0);
      }
    } catch {
      // Silent — Save still runs the full check.
    }
  };

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

  const [linking, setLinking] = useState(false);

  const handleWarnLinkAndCopy = async (warning: DuplicateWarning) => {
    // This card only ever creates an Associate, so the only registry record
    // it can link-and-copy from is an existing Target — a "person" match
    // against another Associate has no field-copy concept here (associates
    // link to a Target, not to each other), so that falls into the same
    // create-as-entered-and-alias path as a plain text mention below.
    if (warning.linkable?.recordType !== "target") {
      // Save-time prompts stash the payload; a Surname-blur prompt hasn't,
      // so build it from the form as it stands.
      const payload = warnPayload.current ?? buildPayload();
      if (!payload.name) return;
      setLinking(true);
      try {
        createNow(payload);
        if (warning.kind !== "target" && !warning.exact) {
          await mergeEntitiesMutation.mutateAsync({
            type: warning.kind,
            winnerLabel: warning.candidateLabel,
            loserLabel: warning.existingLabel,
          });
        }
        setWarnQueue([]);
        setWarnIndex(0);
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to link and copy.");
      } finally {
        setLinking(false);
      }
      return;
    }
    setLinking(true);
    try {
      const target = await utils.target.getById.fetch({
        id: warning.linkable.id,
      });
      if (!target) {
        toast.error("Couldn't load the matched target.");
        return;
      }
      createLinkedMut.mutate(
        {
          targetId,
          relationship,
          name: target.name,
          tgt: target.tgt,
          hbf: target.hbf,
          hb: target.hb,
          v1f: target.v1f,
          v1: target.v1,
          extraAddresses: target.extraAddresses ?? "[]",
          extraVehicles: target.extraVehicles ?? "[]",
          firstNames: target.firstNames,
          surname: target.surname,
          bornDate: target.bornDate,
          addrUnitNo: target.addrUnitNo,
          addrHouseNo: target.addrHouseNo,
          addrStreetName: target.addrStreetName,
          addrStreetType: target.addrStreetType,
          addrSuburb: target.addrSuburb,
          addrState: target.addrState,
          addrBusinessName: target.addrBusinessName,
          vehRegistration: target.vehRegistration,
          vehState: target.vehState,
          vehColour: target.vehColour,
          vehMake: target.vehMake,
          vehModel: target.vehModel,
          vehType: target.vehType,
          existingTargetId: target.id,
        },
        { onSuccess: () => savePendingPhotos(target.name) }
      );
      setWarnQueue([]);
      setWarnIndex(0);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to link and copy.");
    } finally {
      setLinking(false);
    }
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload.name) {
      toast.error(
        "Enter both First Name/s and Surname, or a Business/Place name."
      );
      return;
    }
    if (!isNew) {
      // Offer the move only when this save is what brought the address to
      // the target's home address (not on every later edit of the same card).
      const nowHome =
        relationship === "associate" &&
        !!targetAddress &&
        isSameHomeAddress(address, targetAddress);
      const wasHome =
        !!targetAddress &&
        isSameHomeAddress(
          {
            unitNo: associate.addrUnitNo ?? "",
            houseNo: associate.addrHouseNo ?? "",
            streetName: associate.addrStreetName ?? "",
            streetType: associate.addrStreetType ?? "",
            suburb: associate.addrSuburb ?? "",
          },
          targetAddress
        );
      updateMut.mutate(
        { id: associate.id, ...payload },
        {
          onSuccess: () => {
            setOfferMove(nowHome && !wasHome);
            void savePendingPhotos(payload.name);
          },
        }
      );
      return;
    }
    const warnings = await runDuplicateChecks(utils, [
      // Name already answered on Surname blur — don't ask again.
      ...(checkedNameRef.current === payload.name
        ? []
        : [
            { kind: "target" as const, label: payload.name },
            { kind: "person" as const, label: payload.name },
          ]),
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
    associate?.name ||
    composeAssociateName(identity, address.businessName).name ||
    `New ${kindLabel}`;

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
        {associate?.linkedTargetId && (
          <Badge
            variant="secondary"
            className="text-[10px] gap-1 font-medium normal-case tracking-normal"
            title="This associate's name/address/vehicle stay in sync with a linked Target record elsewhere in the registry — the same real person, filed both ways."
          >
            <Link2 className="h-2.5 w-2.5" /> Linked
          </Badge>
        )}
        {associate?.isIndicesOnly && <IndicesBadge />}
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-border/40">
          {offerMove && !isNew && (
            <div
              className={cn(
                FORM_TONES.resident.panel,
                "p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              )}
            >
              <div className="text-sm">
                <p className="font-semibold text-rose-700 dark:text-rose-400">
                  Same address as the target.
                </p>
                <p className="text-muted-foreground">
                  Move {associate.name} to Other Home Address Residents?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-64 sm:shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOfferMove(false)}
                  disabled={moveMut.isPending}
                >
                  Keep as Associate
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    moveMut.mutate({
                      id: associate.id,
                      relationship: "resident",
                    })
                  }
                  disabled={moveMut.isPending}
                >
                  {moveMut.isPending ? "Moving…" : "Move"}
                </Button>
              </div>
            </div>
          )}
          <TargetIdentityFields
            value={identity}
            onChange={v => mark(() => setIdentity(v))}
            onSurnameBlur={checkNameOnBlur}
          />

          <div className="flex flex-col gap-2">
            <input
              ref={manualImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelected}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 self-start"
              disabled={uploadingPhoto}
              onClick={() => manualImageInputRef.current?.click()}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {uploadingPhoto ? "Uploading…" : "Upload Image"}
            </Button>
            {manualImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {manualImages.map(img => (
                  <div
                    key={img.key}
                    className="flex flex-col items-center gap-1 w-16"
                  >
                    <div className="relative rounded-md overflow-hidden border-2 border-violet-500">
                      <img
                        src={`data:${img.mimeType};base64,${img.dataBase64}`}
                        alt="Uploaded"
                        className="w-16 h-16 object-cover block"
                      />
                      <button
                        type="button"
                        title="Remove this photo"
                        onClick={() =>
                          setManualImages(v => v.filter(i => i.key !== img.key))
                        }
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <PhotoOwnerCaption label={displayName} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-bold text-foreground/80 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Home className="w-3 h-3" /> Address
            </p>
            {addressMode === "locked" ? (
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                <p className="text-sm text-foreground flex-1">
                  {associate?.hbf ??
                    associate?.hb ??
                    composeAddress(address).full}
                </p>
                <div className="flex gap-1.5 flex-wrap sm:shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-7"
                    onClick={startEditAddress}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                    onClick={removePrimaryAddress}
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
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
                  ownerLabel={"Address"}
                  disabledReason={photoDisabledReason}
                />
                {!isNew &&
                  (associate?.hbf ||
                    associate?.hb ||
                    composeAddress(address).full) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs self-start"
                      onClick={() => {
                        entityPhotos.removeSlot("address");
                        setAddressMode("locked");
                      }}
                    >
                      Cancel
                    </Button>
                  )}
              </div>
            )}
          </div>

          {extraAddresses.map((ea, i) => {
            const mode = extraAddressModes[ea.id] ?? "edit";
            return (
              <div
                key={ea.id}
                className="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2"
              >
                <span className="text-xs font-bold text-foreground/80 uppercase tracking-wide flex items-center gap-1.5">
                  <Home className="w-3 h-3" /> Additional Address {i + 2}
                </span>
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
                      onChange={v => updateAddressEntry(i, v)}
                      label={ea.label}
                      onLabelChange={v => updateAddressEntry(i, { label: v })}
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

          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-bold text-foreground/80 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Car className="w-3 h-3" /> Vehicle
            </p>
            {vehicleMode === "locked" ? (
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                <p className="text-sm text-foreground flex-1">
                  {associate?.v1f ??
                    associate?.v1 ??
                    composeVehicle(vehicle).full}
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
                {(associate?.v1f ||
                  associate?.v1 ||
                  composeVehicle(vehicle).full) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs self-start"
                    onClick={() => {
                      entityPhotos.removeSlot("vehicle");
                      setVehicleMode("locked");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>

          {extraVehicles.map((ev, i) => {
            const mode = extraVehicleModes[ev.id] ?? "edit";
            return (
              <div
                key={ev.id}
                className="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2"
              >
                <span className="text-xs font-bold text-foreground/80 uppercase tracking-wide flex items-center gap-1.5">
                  <Car className="w-3 h-3" /> Vehicle {i + 2}
                </span>
                {mode === "locked" ? (
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <p className="text-sm text-foreground flex-1">{ev.full}</p>
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
                      onChange={v => updateVehicleEntry(i, v)}
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
              {saving ? "Saving…" : isNew ? `Add ${kindLabel}` : "Save"}
            </Button>
          </div>
        </div>
      )}

      {!isNew && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {kindLabel.toLowerCase()}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Remove <strong>{associate.name}</strong> as{" "}
                {relationship === "resident" ? "a resident" : "an associate"} of
                this target? This cannot be undone.
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
        creates="associate"
        onContinue={handleWarnContinue}
        onReview={handleWarnReview}
        onLinkAndCopy={handleWarnLinkAndCopy}
        linking={linking}
      />
    </div>
  );
}
