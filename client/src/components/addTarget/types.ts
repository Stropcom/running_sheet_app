// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the types it shares.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {} from "lucide-react";
import {
  type ExtraAddress,
  type ExtraVehicle,
} from "@/components/TargetStructuredFields";
import {
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import type { TargetType } from "@shared/types";
import {} from "@/components/OperationPicker";
import type {
  DocumentImportPrefill,
  StagedImage,
} from "@/components/ImportTargetDocumentDialog";

// Referenced only for the merge dialog's incoming.wildFields shape — Wild
// Fields is deprecated app-wide, this dialog never collects one, but the
// merge dialog's existing interface still expects the key.
export type WildField = { label: string; value: string };

export interface RegistryCreatePayload {
  /** Every target must belong to at least one operation now — chosen (or
   * created inline) via the OperationPicker at the top of this dialog. */
  linkToOperationId: number;
  /** The document's free-text narrative, if this target was created via
   * document import — stored against the (target, operation) link as its
   * "{Operation name} background", read-only, shown on the Target profile.
   * Null for a manually-added target, or an import with no narrative. */
  background: string | null;
  /** The freeform Background typed in this dialog (plain text), saved on the
   * target itself (targets.registryBackground) and shown on its profile and
   * on every linked operation's profile. Null/absent when left empty. */
  registryBackground?: string | null;
  /** The full parsed document snapshot, verbatim as the officer reviewed it
   * on the import review screen — present only when this save came from
   * "Import from Document". Recorded as its own version alongside
   * `background` above; see targetDocumentImports in schema.ts. */
  documentSnapshotJson: string | null;
  documentSourceFileName: string | null;
  /** The original uploaded file's raw bytes/mime type — see storagePut in
   * server/routers.ts's target.registry.create — so the officer can later
   * re-view the actual document, not just its parsed fields. Null for a
   * manually-added target, or when the officer's browser session lost the
   * bytes (see ImportTargetDocumentDialog's sourceFile state). */
  documentSourceFileBase64: string | null;
  documentSourceFileMimeType: string | null;
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
  mdlStatus?: "active" | "none" | "suspended" | null;
  bailStatus?: "yes" | "no" | null;
  bailConditions?: "yes" | "no" | null;
  bailConditionsText?: string | null;
  specialProjects?: string | null;
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
  /** "associate" (default) or "resident" — an Other Home Address Resident,
   * staged in its own section above Associates but saved through the same
   * associate.create mutation (see associates.relationship). */
  relationship?: "associate" | "resident";
  identity: StructuredNameParts;
  address: StructuredAddressParts;
  vehicle: StructuredVehicleParts & { vehicleType: string };
  /** "Add Address" / "Add Vehicle" entries beyond the primary ones, same
   * shape as the target's own extras. */
  extraAddresses?: ExtraAddress[];
  extraVehicles?: ExtraVehicle[];
  /** Residents only: while true, the Home Address shown and saved is the
   * target's own (live, as it's typed). Editing the resident's address
   * flips this off so it can differ. */
  addressFollowsTarget?: boolean;
  /** "No known address" / "No known vehicle" ticked on this person — the
   * section is complete with nothing entered (see lib/addTargetSteps.ts). */
  noAddress?: boolean;
  noVehicle?: boolean;
  /** Set when the officer confirmed the Surname-blur match is the same
   * person as this existing Target — saved via createLinkedFromTarget. */
  linkedTargetId?: number | null;
  /** Mined-mention matches the officer confirmed as the same person —
   * folded in as aliases (intelligence.mergeEntities) once saved. */
  aliasMerges?: Array<{
    type: "person" | "vehicle" | "address";
    winnerLabel: string;
    loserLabel: string;
  }>;
}

// What one Addresses / Vehicles section needs to render — the same shape
// serves the target itself and every resident / associate card (see
// renderAddressSection / renderVehicleSection inside AddTargetDialog).
export interface AddressSectionConfig {
  /** "target" or a staged person's key — scopes the photos on its entries. */
  ownerKey: string;
  title: string;
  firstTitle: string;
  /** "the target", "this person" — reads in "where … lives". */
  who: string;
  primary: StructuredAddressParts;
  onPrimary: (v: StructuredAddressParts) => void;
  extras: ExtraAddress[];
  onExtras: (next: ExtraAddress[]) => void;
  /** The "No known address" box; null when the address IS the target. */
  none: { checked: boolean; onChange: (on: boolean) => void } | null;
  problem: string | null;
  /** Residents only: "Lives at the target's address". */
  follows?: { on: boolean; text: string; onChange: (on: boolean) => void };
}
export interface VehicleSectionConfig {
  ownerKey: string;
  title: string;
  firstTitle: string;
  who: string;
  primary: StructuredVehicleParts & { vehicleType: string };
  onPrimary: (v: StructuredVehicleParts & { vehicleType: string }) => void;
  extras: ExtraVehicle[];
  onExtras: (next: ExtraVehicle[]) => void;
  /** The "No known vehicles" box; null when the vehicle IS the target. */
  none: { checked: boolean; onChange: (on: boolean) => void } | null;
  problem: string | null;
}
/** What the Add Target dialog is given. */
export type AddTargetDialogProps = {
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
  /** MDL / bail answers read from an imported document, when it stated them
   * in wording that maps cleanly. Read once on mount, like the other
   * initial* props. */
  initialStatus?: DocumentImportPrefill["status"];
  /** Called once after a target has actually been saved (not on cancel), in
   * place of onClose — lets the document-import queue move on to the next
   * target, or close when there isn't one. */
  onSaved?: (savedOperation: { id: number; name: string } | null) => void;
  /** Document-import only: go back to the import review screen instead of
   * cancelling. Shown as a Back button beside Save Target. */
  onBack?: () => void;
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
};
