/**
 * Add Target dialog — full structured Name → Address → Vehicle entry for a
 * brand-new target, shared between the Target Registry page and Operation
 * Detail's "Add Target" flow so a target can't be created anywhere in the
 * app via a bare free-text name field. Includes the same possible-duplicate
 * detection/merge flow either caller wants: `onSave` receives the composed
 * payload for the caller to `create.mutateAsync`, while the duplicate check
 * and field-level merge (against an existing target) are handled internally.
 */

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Plus,
  X,
  Home,
  Car,
  Users,
  AlertTriangle,
  Merge,
  User,
  MapPin,
  Check,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
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
  composeVehicleTargetName,
  composeLocationTargetName,
  ddMmYyyyToIso,
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import type { TargetType } from "@shared/types";
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
import type {
  DocumentImportPrefill,
  StagedImage,
} from "@/components/ImportTargetDocumentDialog";

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
  targetType: TargetType;
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

/** The composed name/tgt for whichever fields are this Target's PRIMARY
 * identity, chosen by targetType — composeTargetName(identity) for a
 * Person (unchanged), composeVehicleTargetName(vehicle) for a Vehicle,
 * composeLocationTargetName(address) for a Location. Both name and tgt
 * come back as empty strings until that type's own required fields are
 * filled in, same as composeTargetName already does for Person. */
export function computePrimaryIdentity(
  targetType: TargetType,
  identity: StructuredNameParts,
  address: StructuredAddressParts,
  vehicle: StructuredVehicleParts & { vehicleType: string }
): { name: string; tgt: string } {
  if (targetType === "vehicle") return composeVehicleTargetName(vehicle);
  if (targetType === "location") return composeLocationTargetName(address);
  return composeTargetName(identity);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
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
  initialImages,
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
  /** Photos the officer chose to keep on the import review screen — same
   * one-time-seed treatment as the other initial* import fields: read
   * directly (no local state), uploaded and run through face recognition
   * against the just-saved target once it exists (see saveStagedImages). */
  initialImages?: StagedImage[];
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
  // What this Target record identifies — defaults to Person, the only
  // option before this existed, so every existing flow (document import,
  // possible-duplicate merge, etc.) is unaffected unless an officer
  // deliberately switches it. Vehicle/Location reuse the exact same
  // vehicle/address state below as their PRIMARY identity (promoted from
  // "optional attribute of a person" to "the subject itself") rather than
  // introducing separate fields — see composeVehicleTargetName/
  // composeLocationTargetName in addressFormat.ts.
  const [targetType, setTargetType] = useState<TargetType>("person");
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
  const uploadImageMut = trpc.attachment.uploadManual.useMutation();
  const confirmEntityFaceMut = trpc.attachment.confirmEntityFace.useMutation();
  const linkToEntityMut = trpc.attachment.linkToEntity.useMutation();

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
  // Set only when dupMatch was raised by handleSave (not the early
  // on-blur check below) — "No, different person" needs to know whether
  // to carry on into the save pipeline or just close the prompt and let
  // the officer keep filling in the form.
  const [dupMatchFromSave, setDupMatchFromSave] = useState(false);
  // The name the duplicate check has already resolved for (no match, or a
  // match the officer confirmed was a different person) — lets handleSave
  // skip re-asking about a name that was already cleared at the surname
  // field's onBlur, instead of prompting the same question twice.
  const [dupCheckedForName, setDupCheckedForName] = useState("");
  // Both "Yes, same person — continue" and "Yes, same person — link and copy" need
  // an Operation picked before they can proceed (the merge/link links the
  // existing record to it) — but the duplicate check that offers them
  // fires on the Surname field's blur, routinely before the officer has
  // reached the OperationPicker further down the form. A real bug found
  // in production: this used to just error and abort, dead-ending the
  // flow — re-blurring the same (now-unchanged) surname never re-raises
  // the same prompt (see lastBlurCheckedNameRef), so there was no way
  // back into it short of clearing and retyping the name. Fixed as a
  // flow-through instead: remember which action was trying to proceed,
  // pop the normal OperationPicker right there, and continue straight
  // into that action the moment one is chosen.
  const [pendingAfterOperation, setPendingAfterOperation] = useState<
    | { kind: "merge" }
    | { kind: "linkAndCopy"; warning: DuplicateWarning }
    | null
  >(null);

  // ── Secondary duplicate check (name-as-person/address/vehicle), only run
  // once the target-vs-target check above has cleared — catches e.g. this
  // "new" target actually being a known associate, or its address/vehicle
  // matching one already recorded elsewhere. Warn-only: unlike the
  // target-vs-target case there's no record to merge into, so the officer
  // just confirms and moves on.
  const [warnQueue, setWarnQueue] = useState<DuplicateWarning[]>([]);
  const [warnIndex, setWarnIndex] = useState(0);
  // Set only when the current warnQueue came from handleSave's full
  // secondary check — "No, this is different" only carries on into
  // actually saving when that's true; the early on-blur check below
  // raises the same queue/dialog just to surface a match sooner, not to
  // push the officer toward saving before the rest of the form is filled in.
  const [warnFromSave, setWarnFromSave] = useState(false);
  const notDuplicateMutation =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();
  const mergeEntitiesMutation = trpc.intelligence.mergeEntities.useMutation();

  // ── Duplicate-photo detection for staged import images ──
  // A document re-imported for a target that already exists (dupMatch) very
  // often still embeds the exact same photo it did last time — nothing
  // upstream (the parser, the review screen) has any way to know that, since
  // neither one has visibility into what's already in the target's Images
  // folder. Once dupMatch names a candidate existing target, fetch its
  // current photos and hash-compare each one (SHA-256 over the raw bytes,
  // client-side, no server change needed) against every staged image's own
  // bytes — a genuinely identical photo re-encodes to byte-identical PNG
  // data every time (see docxTableReader.ts/pdfTextReader.ts), so this is an
  // exact-match check, not a fuzzy one. Matches default to unchecked in the
  // Photos section below, same as a matched associate defaults to "skip"
  // territory — the officer can still re-tick one deliberately.
  const [duplicateImageKeys, setDuplicateImageKeys] = useState<Set<string>>(
    new Set()
  );
  const [checkingImageDuplicates, setCheckingImageDuplicates] = useState(false);
  const [imageChoices, setImageChoices] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const candidateTargetId = dupMatch?.id;
    const staged = initialImages ?? [];
    if (!candidateTargetId || staged.length === 0) return;
    let cancelled = false;
    (async () => {
      setCheckingImageDuplicates(true);
      try {
        const existingPhotos = await utils.attachment.byEntity.fetch({
          category: "target",
          targetId: candidateTargetId,
        });
        if (cancelled || !existingPhotos || existingPhotos.length === 0) return;
        const existingHashes = await Promise.all(
          existingPhotos.map(async (p: any) => {
            try {
              const buf = await (await fetch(p.url)).arrayBuffer();
              return await sha256Hex(buf);
            } catch {
              return null;
            }
          })
        );
        const existingHashSet = new Set(
          existingHashes.filter((h): h is string => !!h)
        );
        if (existingHashSet.size === 0) return;
        const dupes = new Set<string>();
        for (const img of staged) {
          try {
            const hash = await sha256Hex(base64ToArrayBuffer(img.dataBase64));
            if (existingHashSet.has(hash)) dupes.add(img.key);
          } catch {
            // Couldn't hash this one — leave it kept rather than guess.
          }
        }
        if (!cancelled && dupes.size > 0) {
          setDuplicateImageKeys(dupes);
          setImageChoices(prev => {
            const next = { ...prev };
            dupes.forEach(key => {
              next[key] = false;
            });
            return next;
          });
        }
      } finally {
        if (!cancelled) setCheckingImageDuplicates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupMatch?.id]);

  const resetAndClose = () => {
    setOperation(initialOperation ?? null);
    setTargetType("person");
    setIdentity(EMPTY_NAME_PARTS);
    setAddress(EMPTY_ADDRESS_PARTS);
    setVehicle(EMPTY_VEHICLE_PARTS);
    setDep("");
    setArr("");
    setExtraAddresses([]);
    setExtraVehicles([]);
    setAssociates([]);
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
    onClose();
  };

  // documentSnapshotJson is a permanent version-history record (see
  // targetDocumentImports in schema.ts, shown on the Target/Operation
  // profile's Imported Documents panel) — but a kept photo already gets its
  // own durable copy as a real Attachment once saved (see
  // saveStagedImages), so storing the same base64 bytes a second time here
  // would just bloat that JSON column for no reason and duplicate the
  // photo. Strip it before persisting the snapshot.
  const documentSnapshotForHistory = (
    prefill: DocumentImportPrefill
  ): DocumentImportPrefill => ({ ...prefill, images: [] });

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
      documentSnapshotJson: initialDocumentSnapshot
        ? JSON.stringify(documentSnapshotForHistory(initialDocumentSnapshot))
        : null,
      documentSourceFileName: initialDocumentSnapshot?.sourceFileName || null,
      targetType,
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
  const saveStagedImages = async (targetId: number) => {
    const toSave = (initialImages ?? []).filter(
      img => imageChoices[img.key] ?? true
    );
    if (toSave.length === 0) return;
    const opId = operation?.id;
    if (!opId) return; // OperationPicker is required before any save path reaches here
    const { name: entityLabel } = computePrimaryIdentity(
      targetType,
      identity,
      address,
      vehicle
    );
    let failed = 0;
    for (const img of toSave) {
      try {
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
            category: "target",
            targetId,
            entityLabel,
          });
        } else {
          await linkToEntityMut.mutateAsync({
            attachmentId: uploaded.id,
            category: "target",
            targetId,
            entityLabel,
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
      await saveStagedAssociates(result.id);
      await saveStagedImages(result.id);
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
      ? JSON.stringify(documentSnapshotForHistory(initialDocumentSnapshot))
      : null,
    documentSourceFileName: initialDocumentSnapshot?.sourceFileName || null,
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
  const checkNameOnBlur = async () => {
    if (!composedName || composedName === lastBlurCheckedNameRef.current)
      return;
    lastBlurCheckedNameRef.current = composedName;
    try {
      const match = await utils.target.registry.findPossibleDuplicate.fetch({
        name: composedName,
      });
      if (match) {
        setDupMatchFromSave(false);
        setDupMatch(match);
        return;
      }
      // No target-vs-target match — this name might still already be a
      // known Associate, or a person already mined from observation text
      // (e.g. "Heath HARRIS" showing up in the Intelligence folder's
      // Associates tab without yet being a registered Target). That's the
      // same check handleSave's fuller secondary pass performs later; run
      // it here too so it surfaces right after the name rather than only
      // after address/vehicle/etc. get typed in as well.
      const warnings = await runDuplicateChecks(utils, [
        { kind: "person", label: composedName },
      ]);
      if (warnings.length > 0) {
        setWarnFromSave(false);
        setWarnQueue(warnings);
        setWarnIndex(0);
      } else {
        setDupCheckedForName(composedName);
      }
    } catch {
      // Silent — this is just an early heads-up; handleSave's own check
      // still runs as the real gate before saving.
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
      // Only the save-time check should carry on into actually saving —
      // the early on-blur check just needed an answer, not a reason to
      // jump ahead of the rest of the form (address/vehicle/operation may
      // not even be filled in yet).
      if (warnFromSave) await saveAsNew();
    }
  };

  const handleWarnReview = () => {
    setWarnQueue([]);
    setWarnIndex(0);
  };

  const handleWarnLinkAndCopy = async (warning: DuplicateWarning) => {
    // Same unguarded-operation shape as handleMergeInstead below — this is
    // reachable from the same early on-blur duplicate check, before the
    // officer has necessarily picked an Operation yet, and both
    // buildPayload/buildLinkedPayload further down assert operation!.id.
    // Flow through to the OperationPicker prompt instead of erroring —
    // see pendingAfterOperation's own comment.
    if (!operation) {
      setPendingAfterOperation({ kind: "linkAndCopy", warning });
      return;
    }
    setLinking(true);
    try {
      // This dialog only ever creates a Target, so the only registry record
      // it can link-and-copy from is an existing Associate (a "target"
      // match here would mean two Targets share a name, which is the
      // separate merge flow above, not this one).
      if (warning.linkable?.recordType === "associate") {
        const associate = await utils.associate.getById.fetch({
          id: warning.linkable.id,
        });
        if (!associate) {
          toast.error("Couldn't load the matched associate.");
          return;
        }
        const result = await onSave(buildLinkedPayload(associate));
        await saveStagedAssociates(result.id);
        await saveStagedImages(result.id);
      } else {
        // No registry record to copy from — just a text mention (or, in
        // theory, an associate match this dialog can't link into). Save the
        // target as entered, then fold the mined mention in as an alias so
        // future sightings of it are recognized as this same identity.
        const result = await onSave(buildPayload());
        await saveStagedAssociates(result.id);
        await saveStagedImages(result.id);
        if (warning.kind !== "target") {
          await mergeEntitiesMutation.mutateAsync({
            type: warning.kind,
            winnerLabel: warning.candidateLabel,
            loserLabel: warning.existingLabel,
          });
        }
      }
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
    // A real bug found in production: the duplicate-match check fires as
    // soon as Surname loses focus, which routinely happens before the
    // officer has picked an Operation further down the form — but the
    // merge itself needs to link the existing target to that operation
    // (see TargetMergeDialog's linkToOperationId), so proceeding with no
    // operation selected crashed on operation!.id. Flow through to the
    // OperationPicker prompt instead of erroring and dead-ending the flow
    // — see pendingAfterOperation's own comment.
    if (!operation) {
      setPendingAfterOperation({ kind: "merge" });
      return;
    }
    const full = await utils.target.getById.fetch({ id: dupMatch.id });
    if (!full) {
      toast.error("Couldn't load the existing target.");
      return;
    }
    setExistingFull(full);
    setDupMatch(null);
    setMergeOpen(true);
  };

  // Fires once the officer picks (or creates) an Operation in the
  // pendingAfterOperation prompt — just sets it as the form's Operation,
  // the same as picking it up in the main form would. The effect below
  // does the actual continuing, deliberately NOT done synchronously here:
  // handleWarnLinkAndCopy's buildPayload/buildLinkedPayload read
  // `operation` directly, and re-invoking it in the same tick as
  // setOperation would still see the OLD (null) value — a plain JS
  // closure captured at this render, not a live reference — since
  // setState only takes effect on the NEXT render, not immediately. The
  // effect only runs after that next render has actually happened, so
  // everything it calls sees the real, updated operation.
  const handleOperationChosenForPending = (op: {
    id: number;
    name: string;
  }) => {
    setOperation(op);
  };

  useEffect(() => {
    if (!operation || !pendingAfterOperation) return;
    const pending = pendingAfterOperation;
    setPendingAfterOperation(null);
    if (pending.kind === "merge") {
      handleMergeInstead();
    } else {
      handleWarnLinkAndCopy(pending.warning);
    }
    // Only re-run when `operation` itself changes — pendingAfterOperation
    // flips to null as this same effect's first act, which must not
    // re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation]);

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

  // The Address and Vehicle sections split into their PRIMARY box (one
  // element, placed side by side with Person Identity in the responsive
  // grid below) and their dynamic extras (a variable-length list, always
  // full-width beneath the grid regardless of screen size) — whichever one
  // is this target's PRIMARY identity (Home Address/Location Identity for
  // a Location target, Vehicle 1/Vehicle Identity for a Vehicle target)
  // renders first, instead of always in the same fixed Address-then-Vehicle
  // order that only made sense when a target was always a person and both
  // were just optional attributes of them.
  const addressPrimaryBox = (
    <div className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3">
      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <Home className="w-3 h-3" />
        {targetType === "location" ? "Location Identity" : "Home Address"}
      </p>
      <TargetAddressFields value={address} onChange={setAddress} />
    </div>
  );

  const addressExtras = (
    <>
      {/* Dynamic extra addresses */}
      {extraAddresses.map((ea, i) => (
        <div
          key={i}
          className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
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
                list.map((item, idx) => (idx === i ? { ...item, ...v } : item))
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
    </>
  );

  const vehiclePrimaryBox = (
    <div className="rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 p-3">
      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <Car className="w-3 h-3" />
        {targetType === "vehicle" ? "Vehicle Identity" : "Vehicle 1"}
      </p>
      <TargetVehicleFields value={vehicle} onChange={setVehicle} />
    </div>
  );

  const vehicleExtras = (
    <>
      {/* Dynamic extra vehicles */}
      {extraVehicles.map((ev, i) => (
        <div
          key={i}
          className="rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
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
                list.map((item, idx) => (idx === i ? { ...item, ...v } : item))
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
    </>
  );

  return (
    <>
      <Dialog
        open={open && !mergeOpen}
        onOpenChange={v => {
          if (!v) resetAndClose();
        }}
      >
        <DialogContent className="md:max-w-2xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Target Type
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType("person")}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
                    targetType === "person"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <User className="w-4 h-4" />
                  Person
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("vehicle")}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
                    targetType === "vehicle"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <Car className="w-4 h-4" />
                  Vehicle
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("location")}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
                    targetType === "location"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  Location
                </button>
              </div>
            </div>

            {/* Stacked vertically, one full-width box per row — same as the
                dynamic extras (additional addresses/vehicles) below, so
                the whole dialog reads as one consistent list rather than
                the primary boxes sitting apart in a grid while everything
                else stacks. The wider dialog width (see DialogContent's
                className) still gives each box more breathing room on
                iPad/laptop, just without splitting them into columns. */}
            {targetType === "person" && (
              <div className="rounded-lg border border-l-4 border-sky-500/30 border-l-sky-500 bg-sky-500/5 p-3">
                <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <User className="w-3 h-3" />
                  Person Identity
                </p>
                <TargetIdentityFields
                  value={identity}
                  onChange={setIdentity}
                  onSurnameBlur={checkNameOnBlur}
                />
              </div>
            )}

            {targetType === "vehicle" ? (
              <>
                {vehiclePrimaryBox}
                {addressPrimaryBox}
              </>
            ) : (
              <>
                {addressPrimaryBox}
                {vehiclePrimaryBox}
              </>
            )}

            {targetType === "vehicle" ? (
              <>
                {vehicleExtras}
                {addressExtras}
              </>
            ) : (
              <>
                {addressExtras}
                {vehicleExtras}
              </>
            )}

            {/* Associates — same position as AssociatesSection on the
                saved target's own card (server/db.ts requires a real
                targetId, so these are staged here and created right after
                the target itself saves). */}
            <div className="mt-2 rounded-lg border border-l-4 border-violet-500/30 border-l-violet-500 bg-violet-500/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide flex items-center gap-1.5">
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

            {/* Photos — staged from a document import (see
                ImportTargetDocumentDialog.tsx). Duplicate-photo detection
                only has a target to compare against once dupMatch names one
                (see the effect above) — a photo the target already has on
                file defaults unticked, same "officer stays in control"
                pattern as a matched associate defaulting to skip. */}
            {(initialImages ?? []).length > 0 && (
              <div className="mt-2 rounded-lg border border-l-4 border-indigo-500/30 border-l-indigo-500 bg-indigo-500/5 p-3 flex flex-col gap-2.5">
                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> Photos
                </p>
                {checkingImageDuplicates && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking for photos already on file…
                  </p>
                )}
                <div className="flex flex-wrap gap-2.5">
                  {(initialImages ?? []).map(img => {
                    const kept = imageChoices[img.key] ?? true;
                    const isDup = duplicateImageKeys.has(img.key);
                    return (
                      <button
                        key={img.key}
                        type="button"
                        onClick={() =>
                          setImageChoices(prev => ({
                            ...prev,
                            [img.key]: !kept,
                          }))
                        }
                        title={
                          kept
                            ? "Tap to discard this photo"
                            : "Tap to keep this photo"
                        }
                        className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                          kept
                            ? "border-indigo-500"
                            : "border-border opacity-40 grayscale"
                        }`}
                      >
                        <img
                          src={`data:${img.mimeType};base64,${img.dataBase64}`}
                          alt="Extracted from document"
                          className="w-20 h-20 object-cover block"
                        />
                        {kept && (
                          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {isDup && (
                          <span className="absolute bottom-0 left-0 right-0 bg-amber-500 text-white text-[8px] font-bold text-center py-0.5 leading-none">
                            ALREADY HAVE
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Depart / Arrive — simple single-line fields, so they pair up
                side by side from sm rather than needing the wider md/lg
                grid the bordered identity boxes above need room for. */}
            <div className="grid gap-3 sm:grid-cols-2">
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
        open={dupMatch !== null && !pendingAfterOperation}
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
              <Merge className="w-4 h-4 mr-1.5" /> Yes, same person — continue
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setDupCheckedForName(composedName);
                setDupMatch(null);
                // Only the save-time check should carry on into actually
                // saving — the early on-blur check just needed an answer,
                // not a reason to jump ahead of the rest of the form.
                if (dupMatchFromSave) runSecondaryChecks();
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
        warning={pendingAfterOperation ? null : (warnQueue[warnIndex] ?? null)}
        creates="target"
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
              ? JSON.stringify(
                  documentSnapshotForHistory(initialDocumentSnapshot)
                )
              : null
          }
          documentSourceFileName={
            initialDocumentSnapshot?.sourceFileName || null
          }
          onMerged={async targetId => {
            // A real bug found in production: merging into an EXISTING
            // target (the path a document re-import takes whenever it
            // matches one already in the registry) never saved the
            // associates staged from that document at all — only saveAsNew
            // and the link-and-copy flow called saveStagedAssociates, so a
            // newly-mentioned associate the officer confirmed "Create as
            // new" for on the review screen silently never became a real
            // Associate record, despite showing up fine in the Imported
            // Documents diff (which only reflects the parsed snapshot, not
            // the registry).
            await saveStagedAssociates(targetId);
            await saveStagedImages(targetId);
            utils.target.registry.list.invalidate();
            utils.associate.listForTarget.invalidate();
            utils.intelligence.targetProfile.invalidate();
            utils.intelligence.operationProfile.invalidate();
            resetAndClose();
          }}
        />
      )}

      {/* Operation prompt — flow-through for merge/link-and-copy when the
          duplicate check resolved before an Operation was picked yet. */}
      <Dialog
        open={pendingAfterOperation !== null}
        onOpenChange={v => {
          if (!v) setPendingAfterOperation(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select an Operation</DialogTitle>
            <DialogDescription>
              Choose which operation to link{" "}
              {pendingAfterOperation?.kind === "merge"
                ? dupMatch?.name
                : "this target"}{" "}
              to before continuing.
            </DialogDescription>
          </DialogHeader>
          <OperationPicker
            value={operation}
            onChange={handleOperationChosenForPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
