// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): reset, build the payloads and save the target, its associates and photos.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  EMPTY_NAME_PARTS,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  EMPTY_STATUS_PARTS,
  mdlMissing,
  statusPartsToPayload,
} from "@/components/TargetStructuredFields";
import {
  composeTargetName,
  composeAssociateName,
  composeAddress,
  composeVehicle,
  ddMmYyyyToIso,
} from "@/lib/addressFormat";
import { type DuplicateWarning } from "@/components/PossibleDuplicateAlert";
import { runDuplicateChecks } from "@/lib/duplicateCheck";
import {} from "@/components/OperationPicker";
import type {
  DocumentImportPrefill,
  StagedImage,
} from "@/components/ImportTargetDocumentDialog";
import type { TargetFormState } from "./useTargetForm";
import type { ManualImagesState } from "./useManualImages";
import type { DuplicateStateState } from "./useDuplicateState";
import type {
  RegistryCreatePayload,
  StagedAssociate,
  AddTargetDialogProps,
} from "./types";
import {
  isPartialAddress,
  isPartialVehicle,
  computePrimaryIdentity,
  base64ToArrayBuffer,
  sha256Hex,
} from "./helpers";

export function useSaveFlow(
  s: Pick<
    TargetFormState,
    | "address"
    | "setOperation"
    | "setTargetType"
    | "setIdentity"
    | "setStatus"
    | "setShowMdlError"
    | "setAddress"
    | "setVehicle"
    | "setStep"
    | "setNoAddress"
    | "setNoVehicle"
    | "setNoResidents"
    | "setNoAssociates"
    | "setNoBackground"
    | "setNoSpecialProjects"
    | "setSelectedKey"
    | "setFlashFor"
    | "setLockedNote"
    | "setExtraAddresses"
    | "setExtraVehicles"
    | "setAssociates"
    | "setRegistryBackground"
    | "seededBackgroundRef"
    | "setLinking"
    | "operation"
    | "targetType"
    | "identity"
    | "vehicle"
    | "registryBackground"
    | "extraAddresses"
    | "extraVehicles"
    | "status"
    | "associates"
    | "associateCreateLinkedMut"
    | "associateCreateMut"
    | "utils"
    | "uploadImageMut"
    | "linkToEntityMut"
    | "confirmEntityFaceMut"
    | "setSaving"
  > &
    Pick<
      AddTargetDialogProps,
      | "initialOperation"
      | "onClose"
      | "onSaved"
      | "initialBackground"
      | "initialDocumentSnapshot"
      | "initialImages"
      | "onSave"
    > &
    Pick<
      ManualImagesState,
      "setManualImages" | "setManualImageTarget" | "manualImages"
    > &
    Pick<
      DuplicateStateState,
      | "setDupMatch"
      | "setDupMatchFromSave"
      | "setDupCheckedForName"
      | "setExistingFull"
      | "setMergeOpen"
      | "setWarnQueue"
      | "setWarnIndex"
      | "setWarnFromSave"
      | "setPendingAfterOperation"
      | "mergeEntitiesMutation"
      | "imageChoices"
      | "duplicateImageKeys"
      | "dupCheckedForName"
      | "setCheckingDup"
    >
) {
  const {
    address,
    setOperation,
    initialOperation,
    setTargetType,
    setIdentity,
    setStatus,
    setShowMdlError,
    setAddress,
    setVehicle,
    setStep,
    setNoAddress,
    setNoVehicle,
    setNoResidents,
    setNoAssociates,
    setNoBackground,
    setNoSpecialProjects,
    setSelectedKey,
    setFlashFor,
    setLockedNote,
    setExtraAddresses,
    setExtraVehicles,
    setAssociates,
    setRegistryBackground,
    seededBackgroundRef,
    setManualImages,
    setManualImageTarget,
    setDupMatch,
    setDupMatchFromSave,
    setDupCheckedForName,
    setExistingFull,
    setMergeOpen,
    setWarnQueue,
    setWarnIndex,
    setWarnFromSave,
    setLinking,
    setPendingAfterOperation,
    onClose,
    operation,
    onSaved,
    targetType,
    identity,
    vehicle,
    initialBackground,
    registryBackground,
    initialDocumentSnapshot,
    extraAddresses,
    extraVehicles,
    status,
    associates,
    associateCreateLinkedMut,
    associateCreateMut,
    mergeEntitiesMutation,
    initialImages,
    imageChoices,
    manualImages,
    utils,
    uploadImageMut,
    linkToEntityMut,
    duplicateImageKeys,
    confirmEntityFaceMut,
    setSaving,
    onSave,
    dupCheckedForName,
    setCheckingDup,
  } = s;

  // Early check, fired when the officer tabs out of the Surname field —
  // catches an obvious duplicate person before any address/vehicle detail
  // gets typed in, rather than only at Save after that work is already
  // done. Silent on no-match/failure; the popup only interrupts when
  // there's actually something to confirm.
  //
  // v1.31.0 shipped this checking only target-vs-target
  // (findPossibleDuplicate) — real-world gap found in v1.33.3: a name that
  // already exists as a registered Associate, or as a person already mined
  // from observation text (e.g. "Heath HARRIS" sitting in the Intelligence
  // folder's Associates tab without yet being a registered Target), was
  // never caught here at all — that was a *different* check
  // (runDuplicateChecks's "person" kind) that only ran inside handleSave's
  // secondary pass at Save. Fixed by having this same blur handler also
  // run that person-vs-associate check below.
  //
  // Side effect: PossibleDuplicateAlert's warnQueue can now open mid-form
  // instead of only right before saving, so its "No, this is different —
  // continue" button can no longer unconditionally jump to saveAsNew() once
  // the queue empties (see handleWarnContinue) — the officer may not have
  // filled in address/vehicle/operation yet. warnFromSave gates that: only
  // true when the queue came from handleSave's own runSecondaryChecks, not
  // from this early check.
  const lastBlurCheckedNameRef = useRef("");
  // A name the officer has already answered "No, different" for as an exact
  // match in the person check (see handleWarnContinue).
  const personClearedRef = useRef("");

  // A staged resident that still follows the target takes the target's
  // current Home Address (business name excluded — on an associate card it
  // stands in for the person's name, see composeAssociateName).
  const effectiveStaged = (a: StagedAssociate): StagedAssociate =>
    a.addressFollowsTarget
      ? { ...a, address: { ...address, businessName: "" } }
      : a;

  // ── Possible-duplicate check for staged associates / residents ──
  // Same trigger as the target's own Surname field: fires the moment a
  // staged person's Surname loses focus, searching targets, associates and
  // mined people already in the app. Kept separate from the target's own
  // warnQueue since the answers mean different things (see below).
  const [stagedWarn, setStagedWarn] = useState<{
    key: string;
    queue: DuplicateWarning[];
    index: number;
  } | null>(null);
  const [stagedLinking, setStagedLinking] = useState(false);
  const stagedCheckedRef = useRef<Record<string, string>>({});

  const resetState = () => {
    setOperation(initialOperation ?? null);
    setTargetType("person");
    setIdentity(EMPTY_NAME_PARTS);
    setStatus(EMPTY_STATUS_PARTS);
    setShowMdlError(false);
    setAddress(EMPTY_ADDRESS_PARTS);
    setVehicle(EMPTY_VEHICLE_PARTS);
    setStep("target");
    setNoAddress(false);
    setNoVehicle(false);
    setNoResidents(false);
    setNoAssociates(false);
    setNoBackground(false);
    setNoSpecialProjects(false);
    setSelectedKey({ resident: null, associate: null });
    setFlashFor(null);
    setLockedNote(null);
    setExtraAddresses([]);
    setExtraVehicles([]);
    setAssociates([]);
    setRegistryBackground("");
    seededBackgroundRef.current = "";
    setStagedWarn(null);
    stagedCheckedRef.current = {};
    setManualImages([]);
    setManualImageTarget(null);
    setDupMatch(null);
    setDupMatchFromSave(false);
    setDupCheckedForName("");
    lastBlurCheckedNameRef.current = "";
    setExistingFull(null);
    setMergeOpen(false);
    setWarnQueue([]);
    setWarnIndex(0);
    setWarnFromSave(false);
    setLinking(false);
    setPendingAfterOperation(null);
  };

  const resetAndClose = () => {
    resetState();
    onClose();
  };

  // A target (and its staged associates/photos) was actually saved — close
  // as usual, then let the document-import queue move on to the next one.
  // When the caller supplies onSaved it owns what happens next (including
  // closing); otherwise this is just a normal close.
  const finishSaved = () => {
    const savedOperation = operation;
    resetState();
    if (onSaved) onSaved(savedOperation);
    else onClose();
  };

  // documentSnapshotJson is a permanent version-history record (see
  // targetDocumentImports in schema.ts, shown on the Target/Operation
  // profile's Imported Documents panel) — but a kept photo already gets its
  // own durable copy as a real Attachment once saved (see
  // saveStagedImages), so storing the same base64 bytes a second time here
  // would just bloat that JSON column for no reason and duplicate the
  // photo. Same reasoning for the original document's own bytes — those go
  // through storagePut and are referenced by sourceFileUrl (see buildPayload
  // below), not embedded in this JSON column. Strip both before persisting
  // the snapshot.
  const documentSnapshotForHistory = (
    prefill: DocumentImportPrefill
  ): DocumentImportPrefill => ({
    ...prefill,
    images: [],
    sourceFileBase64: "",
  });

  const buildPayload = (): RegistryCreatePayload => {
    const { name, tgt } = computePrimaryIdentity(
      targetType,
      identity,
      address,
      vehicle
    );
    const { full: hbf, short: hb } = composeAddress(address);
    const { full: v1f, short: v1 } = composeVehicle(vehicle);
    return {
      linkToOperationId: operation!.id,
      background: initialBackground?.trim() || null,
      registryBackground: registryBackground.trim() || null,
      documentSnapshotJson: initialDocumentSnapshot
        ? JSON.stringify(documentSnapshotForHistory(initialDocumentSnapshot))
        : null,
      documentSourceFileName: initialDocumentSnapshot?.sourceFileName || null,
      documentSourceFileBase64:
        initialDocumentSnapshot?.sourceFileBase64 || null,
      documentSourceFileMimeType:
        initialDocumentSnapshot?.sourceFileMimeType || null,
      targetType,
      name,
      tgt: tgt || null,
      hbf: hbf || null,
      hb: hb || null,
      v1f: v1f || null,
      v1: v1 || null,
      dep: null,
      arr: null,
      extraAddresses: JSON.stringify(
        extraAddresses.map(ea => ({ ...ea, ...composeAddress(ea) }))
      ),
      extraVehicles: JSON.stringify(
        extraVehicles.map(ev => ({ ...ev, ...composeVehicle(ev) }))
      ),
      firstNames: identity.firstNames || null,
      surname: identity.surname || null,
      bornDate: ddMmYyyyToIso(identity.bornDate) || null,
      ...(targetType === "person" ? statusPartsToPayload(status) : {}),
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
  // Returns the staged→real id mapping for whichever associates saved
  // successfully, so saveStagedImages can resolve a photo staged as
  // "associate X" to that associate's actual id — associates must exist
  // before a photo can be linked to one, which is exactly why this always
  // runs (and is awaited) before saveStagedImages at every call site.
  const saveStagedAssociates = async (
    targetId: number
  ): Promise<Record<string, number>> => {
    const toCreate = associates
      .map(rawAssoc => {
        const a = effectiveStaged(rawAssoc);
        const { name, tgt } = composeAssociateName(
          a.identity,
          a.address.businessName
        );
        if (!name) return null;
        const { full: hbf, short: hb } = composeAddress(a.address);
        const { full: v1f, short: v1 } = composeVehicle(a.vehicle);
        // Extras that composed to nothing (left blank, or only partly
        // filled in) are dropped rather than saved as empty entries.
        const extraAddrs = (a.extraAddresses ?? [])
          .map(ea => ({ ...ea, ...composeAddress(ea) }))
          .filter(ea => ea.full);
        const extraVehs = (a.extraVehicles ?? [])
          .map(ev => ({ ...ev, ...composeVehicle(ev) }))
          .filter(ev => ev.full);
        return {
          key: a.key,
          linkedTargetId: a.linkedTargetId ?? null,
          aliasMerges: a.aliasMerges ?? [],
          payload: {
            targetId,
            relationship: a.relationship ?? ("associate" as const),
            extraAddresses: extraAddrs.length
              ? JSON.stringify(extraAddrs)
              : null,
            extraVehicles: extraVehs.length ? JSON.stringify(extraVehs) : null,
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
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (toCreate.length === 0) return {};
    const results = await Promise.allSettled(
      toCreate.map(item =>
        item.linkedTargetId
          ? associateCreateLinkedMut.mutateAsync({
              ...item.payload,
              existingTargetId: item.linkedTargetId,
            })
          : associateCreateMut.mutateAsync(item.payload)
      )
    );
    const idByKey: Record<string, number> = {};
    let failed = 0;
    const aliasJobs: Promise<unknown>[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        idByKey[toCreate[i].key] = r.value.id;
        for (const m of toCreate[i].aliasMerges) {
          aliasJobs.push(mergeEntitiesMutation.mutateAsync(m).catch(() => {}));
        }
      } else {
        failed++;
      }
    });
    await Promise.all(aliasJobs);
    if (failed > 0) {
      toast.error(
        `Target saved, but ${failed} associate${failed > 1 ? "s" : ""} failed to save — add ${failed > 1 ? "them" : "it"} from the target's card in the registry.`
      );
    }
    return idByKey;
  };

  // The full label (what the Vehicle / Location profile keys its photos by)
  // of the vehicle or address a staged photo belongs to; "" when that entry
  // hasn't composed into a full vehicle/address.
  const resolveItemLabel = (
    l: Extract<StagedImage["linkTo"], { type: "item" }>
  ): string => {
    const staged =
      l.ownerKey === "target"
        ? null
        : (associates.find(a => a.key === l.ownerKey) ?? null);
    if (l.ownerKey !== "target" && !staged) return "";
    if (l.category === "vehicle") {
      const item =
        l.itemKey === "primary"
          ? staged
            ? staged.vehicle
            : vehicle
          : (staged ? (staged.extraVehicles ?? []) : extraVehicles).find(
              x => x.id === l.itemKey
            );
      return item ? composeVehicle(item).full : "";
    }
    const item =
      l.itemKey === "primary"
        ? staged
          ? effectiveStaged(staged).address
          : address
        : (staged ? (staged.extraAddresses ?? []) : extraAddresses).find(
            x => x.id === l.itemKey
          );
    return item ? composeAddress(item).full : "";
  };

  // Uploads every image the officer kept on the import review screen
  // against the just-saved target's Operation, then runs on-device face
  // recognition (server/faceRecognition/ — no external AI/LLM call, see
  // CLAUDE.md's Golden Rule) so the photo is registered against the right
  // person automatically. Only auto-registers when exactly one face is
  // detected — a document photo is almost always a single portrait/mugshot,
  // but zero faces (a non-portrait scan) or 2+ (a group photo, where which
  // face is this target is genuinely ambiguous) still gets the photo
  // attached to the target, just without a face embedding recorded; an
  // officer can tag a specific face from the target's own Images folder
  // afterward the same way any manually-uploaded photo is tagged
  // (UploadImageDialog/FaceSelectPicker). Same best-effort-per-item,
  // Promise.allSettled-style failure handling as saveStagedAssociates above
  // — one bad photo shouldn't stop the rest from saving.
  const saveStagedImages = async (
    targetId: number,
    associateIdByKey: Record<string, number> = {}
  ) => {
    const toSave = [
      ...(initialImages ?? []).filter(img => imageChoices[img.key] ?? true),
      ...manualImages,
    ];
    if (toSave.length === 0) return;
    const opId = operation?.id;
    if (!opId) return; // OperationPicker is required before any save path reaches here
    const { name: targetEntityLabel } = computePrimaryIdentity(
      targetType,
      identity,
      address,
      vehicle
    );
    // A photo that is byte-for-byte one the entity already has is not saved
    // again. This is the safety net behind the Photos review UI (which only
    // catches a target's duplicates once a fuzzy name/DOB match has named a
    // candidate), and it covers every place a photo can land: the target, an
    // associate (linked by name), and a vehicle / address photo. Importing the
    // same document twice, or the same photo appearing twice in a batch, no
    // longer leaves several identical copies on the same person. Checked
    // against the REAL saved entity each save path already has in hand.
    const photoHashCache = new Map<string, Promise<Set<string>>>();
    const existingHashes = (
      cat: "target" | "associate" | "vehicle" | "location",
      tId: number | undefined,
      label: string | undefined
    ): Promise<Set<string>> => {
      const k = `${cat}|${tId ?? ""}|${label ?? ""}`;
      let p = photoHashCache.get(k);
      if (!p) {
        p = (async () => {
          try {
            const existing = await utils.attachment.byEntity.fetch({
              category: cat,
              ...(tId !== undefined ? { targetId: tId } : {}),
              // A target is found by id; the other kinds by their name / label.
              ...(label && cat !== "target" ? { entityLabel: label } : {}),
            });
            const hashes = await Promise.all(
              (existing ?? []).map(async (e: any) => {
                try {
                  const buf = await (await fetch(e.url)).arrayBuffer();
                  return await sha256Hex(buf);
                } catch {
                  return null;
                }
              })
            );
            return new Set(hashes.filter((h): h is string => !!h));
          } catch {
            return new Set<string>();
          }
        })();
        photoHashCache.set(k, p);
      }
      return p;
    };
    /** True when this entity already has this exact photo; otherwise
     * remembers it, so a repeat later in the same batch is caught too. */
    const alreadyHas = async (
      cat: "target" | "associate" | "vehicle" | "location",
      tId: number | undefined,
      label: string | undefined,
      img: { dataBase64: string }
    ): Promise<boolean> => {
      const own = await sha256Hex(base64ToArrayBuffer(img.dataBase64)).catch(
        () => null
      );
      if (!own) return false;
      const hashes = await existingHashes(cat, tId, label);
      if (hashes.has(own)) return true;
      hashes.add(own);
      return false;
    };
    let failed = 0;
    for (const img of toSave) {
      try {
        // A photo staged as "this is associate X" only actually links to
        // that associate if X saved successfully (see saveStagedAssociates'
        // return) — otherwise it falls back to the target rather than
        // silently disappearing.
        let category: "target" | "associate" = "target";
        let linkedTargetId: number | undefined = targetId;
        let entityLabel = targetEntityLabel;
        const linkTo = img.linkTo;
        // A photo of one vehicle / address: linked by that vehicle's or
        // address's own label (the same way the Vehicle / Location profile
        // reads its photos). Falls back to the target if the entry never
        // composed into a full label, so the photo isn't lost.
        if (linkTo.type === "item") {
          const itemLabel = resolveItemLabel(linkTo);
          if (
            itemLabel &&
            (await alreadyHas(linkTo.category, undefined, itemLabel, img))
          )
            continue;
          const uploadedItem = await uploadImageMut.mutateAsync({
            operationId: opId,
            dataBase64: img.dataBase64,
            mimeType: img.mimeType,
            fileName: `${linkTo.category}-photo-${img.key}.png`,
          });
          await linkToEntityMut.mutateAsync(
            itemLabel
              ? {
                  attachmentId: uploadedItem.id,
                  category: linkTo.category,
                  entityLabel: itemLabel,
                  fromRegistry: true,
                }
              : {
                  attachmentId: uploadedItem.id,
                  category: "target" as const,
                  targetId,
                  entityLabel: targetEntityLabel,
                  fromRegistry: true,
                }
          );
          continue;
        }
        if (linkTo.type === "associate") {
          const associateId = associateIdByKey[linkTo.associateKey];
          const staged = associates.find(a => a.key === linkTo.associateKey);
          if (associateId && staged) {
            const { name } = composeAssociateName(
              staged.identity,
              staged.address.businessName
            );
            if (name) {
              category = "associate";
              linkedTargetId = undefined;
              entityLabel = name;
            }
          }
        } else if (linkTo.type === "existingAssociate") {
          // Associates link by normalized name text, not a real id (see
          // linkAttachmentToEntity in db.ts) — the id on this variant is
          // just provenance, entityLabel is what actually matters here.
          category = "associate";
          linkedTargetId = undefined;
          entityLabel = linkTo.entityLabel;
        }
        // The officer's own explicit override stands: if the pre-emptive check
        // flagged this photo as a duplicate of the target's and they re-ticked
        // it anyway, that is a deliberate second copy, not a gap to close.
        const deliberateCopy =
          category === "target" && duplicateImageKeys.has(img.key);
        if (
          !deliberateCopy &&
          (await alreadyHas(category, linkedTargetId, entityLabel, img))
        )
          continue;
        const uploaded = await uploadImageMut.mutateAsync({
          operationId: opId,
          dataBase64: img.dataBase64,
          mimeType: img.mimeType,
          fileName: `imported-photo-${img.key}.png`,
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
            category,
            targetId: linkedTargetId,
            entityLabel,
            fromRegistry: true,
          });
        } else {
          await linkToEntityMut.mutateAsync({
            attachmentId: uploaded.id,
            category,
            targetId: linkedTargetId,
            entityLabel,
            fromRegistry: true,
          });
        }
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      toast.error(
        `Target saved, but ${failed} photo${failed > 1 ? "s" : ""} failed to save — add ${failed > 1 ? "them" : "it"} from the target's Images folder.`
      );
    }
  };

  const saveAsNew = async () => {
    setSaving(true);
    try {
      const result = await onSave(buildPayload());
      const associateIdByKey = await saveStagedAssociates(result.id);
      await saveStagedImages(result.id, associateIdByKey);
      finishSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save target.");
    } finally {
      setSaving(false);
    }
  };

  // Builds the create payload for "Yes, same person — link and copy": every
  // shared identity field comes from the matched Associate record, not
  // whatever the officer had typed in this form.
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
    registryBackground: registryBackground.trim() || null,
    documentSnapshotJson: initialDocumentSnapshot
      ? JSON.stringify(documentSnapshotForHistory(initialDocumentSnapshot))
      : null,
    documentSourceFileName: initialDocumentSnapshot?.sourceFileName || null,
    documentSourceFileBase64: initialDocumentSnapshot?.sourceFileBase64 || null,
    documentSourceFileMimeType:
      initialDocumentSnapshot?.sourceFileMimeType || null,
    // Only reachable via the person-duplicate-match flow, which is skipped
    // entirely for a Vehicle/Location target (see composedName below) — so
    // targetType is always "person" by the time this runs.
    targetType: "person",
    name: associate.name,
    tgt: associate.tgt,
    hbf: associate.hbf,
    hb: associate.hb,
    v1f: associate.v1f,
    v1: associate.v1,
    dep: null,
    arr: null,
    extraAddresses: associate.extraAddresses ?? "[]",
    extraVehicles: associate.extraVehicles ?? "[]",
    firstNames: associate.firstNames,
    surname: associate.surname,
    bornDate: associate.bornDate,
    // MDL/bail aren't shared with the Associate record — they come from
    // what the officer entered here.
    ...statusPartsToPayload(status),
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

  // The PRIMARY identity for this target, per its targetType — what
  // actually gets saved as name/tgt (see buildPayload) and what gates
  // whether there's enough to save at all (see handleSave).
  const primaryComposedName = computePrimaryIdentity(
    targetType,
    identity,
    address,
    vehicle
  ).name;
  // The composed PERSON name from the Identity fields specifically — used
  // only for the possible-duplicate-PERSON flow (checkNameOnBlur,
  // handleSave's findPossibleDuplicate check, the merge/link-and-copy
  // dialogs). Forced empty for a Vehicle/Location target even if the
  // optional "Link a known person" fields are filled in: that flow exists
  // to catch a duplicate Target/Associate record for the same real person,
  // which doesn't apply when the person is only an optional attribute of
  // this target rather than the target itself — same reasoning as the
  // Sort-by-Surname/name-typo checks not applying either.
  const composedName =
    targetType === "person" ? composeTargetName(identity).name : "";

  const runSecondaryChecks = async () => {
    const { full: hbf } = composeAddress(address);
    const { full: v1f } = composeVehicle(vehicle);
    const warnings = await runDuplicateChecks(utils, [
      ...(personClearedRef.current === composedName
        ? []
        : [{ kind: "person" as const, label: composedName }]),
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
      setWarnFromSave(true);
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
    if (!primaryComposedName) {
      toast.error(
        targetType === "vehicle"
          ? "Enter Registration, Colour, Make and Model."
          : targetType === "location"
            ? "Enter House No, Street Name, Street Type and Suburb."
            : "Enter both First Name/s and Surname."
      );
      return;
    }
    if (targetType === "person" && mdlMissing(status)) {
      setShowMdlError(true);
      toast.error(
        "Select the target's MDL status (Active, None or Suspended)."
      );
      return;
    }
    // Block the save outright rather than silently dropping a partially-
    // filled address/vehicle — see isPartialAddress/isPartialVehicle's own
    // comment for the real case this catches (a document-import vehicle
    // missing just its colour, which used to save with no error and then
    // vanish everywhere).
    const incomplete: string[] = [];
    if (isPartialAddress(address)) incomplete.push("Home Address");
    extraAddresses.forEach((ea, i) => {
      if (isPartialAddress(ea))
        incomplete.push(ea.label || `Additional Address ${i + 2}`);
    });
    if (isPartialVehicle(vehicle)) incomplete.push("Vehicle 1");
    extraVehicles.forEach((ev, i) => {
      if (isPartialVehicle(ev)) incomplete.push(`Vehicle ${i + 2}`);
    });
    if (incomplete.length > 0) {
      toast.error(
        `${incomplete.join(", ")} ${incomplete.length > 1 ? "are" : "is"} missing a required field and won't save as ${incomplete.length > 1 ? "they" : "it"} ${incomplete.length > 1 ? "are" : "is"} — fill in the missing detail(s) or remove the card before saving.`
      );
      return;
    }
    // No person name to duplicate-check for a Vehicle/Location target (see
    // composedName's own comment) — skip straight to the address/vehicle
    // secondary checks, which still apply regardless of type.
    // Otherwise: already resolved for this exact name at the surname
    // field's onBlur (no match, or the officer already said "different
    // person") — don't ask again.
    if (!composedName || composedName === dupCheckedForName) {
      await runSecondaryChecks();
      return;
    }
    setCheckingDup(true);
    try {
      const match = await utils.target.registry.findPossibleDuplicate.fetch({
        name: composedName,
      });
      if (match) {
        setDupMatchFromSave(true);
        setDupMatch(match);
      } else {
        setDupCheckedForName(composedName);
        await runSecondaryChecks();
      }
    } catch {
      // If the duplicate check itself fails, don't block the save.
      await saveAsNew();
    } finally {
      setCheckingDup(false);
    }
  };

  return {
    lastBlurCheckedNameRef,
    personClearedRef,
    effectiveStaged,
    stagedWarn,
    setStagedWarn,
    stagedLinking,
    setStagedLinking,
    stagedCheckedRef,
    resetState,
    resetAndClose,
    finishSaved,
    documentSnapshotForHistory,
    buildPayload,
    saveStagedAssociates,
    saveStagedImages,
    saveAsNew,
    buildLinkedPayload,
    composedName,
    runSecondaryChecks,
    handleSave,
  };
}

export type SaveFlowState = ReturnType<typeof useSaveFlow>;
