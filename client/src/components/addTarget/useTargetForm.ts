// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the form's own fields, step flags, staged lists and the mutations.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useRef, useEffect } from "react";
import { labelledImportedBackground } from "@shared/targetBackground";
import { trpc } from "@/lib/trpc";
import {
  EMPTY_NAME_PARTS,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  EMPTY_STATUS_PARTS,
  type ExtraAddress,
  type ExtraVehicle,
  type TargetStatusParts,
} from "@/components/TargetStructuredFields";
import {
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import type { TargetType } from "@shared/types";
import { type StepKey } from "@/lib/addTargetSteps";
import type { StagedAssociate, AddTargetDialogProps } from "./types";

export function useTargetForm(
  s: Pick<
    AddTargetDialogProps,
    | "initialOperation"
    | "open"
    | "initialIdentity"
    | "initialStatus"
    | "initialAddress"
    | "initialVehicle"
    | "initialBackground"
    | "initialExtraAddresses"
    | "initialExtraVehicles"
    | "initialAssociates"
  >
) {
  const {
    initialOperation,
    open,
    initialIdentity,
    initialStatus,
    initialAddress,
    initialVehicle,
    initialBackground,
    initialExtraAddresses,
    initialExtraVehicles,
    initialAssociates,
  } = s;

  const [operation, setOperation] = useState<{
    id: number;
    name: string;
  } | null>(() => initialOperation ?? null);
  // Re-applies the page's operation context on every open, not just the
  // first. This dialog mounts once, up-front, alongside its page, so the
  // lazy useState above can capture initialOperation before the page's
  // own operation query has resolved (still name: "") — leaving the
  // field blank on the very first open. resetAndClose below already
  // re-syncs it on close; this covers the initial open too.
  useEffect(() => {
    if (open) setOperation(initialOperation ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
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
  // MDL (compulsory for a person target) and bail — blank until picked.
  const [status, setStatus] = useState<TargetStatusParts>(() => ({
    ...EMPTY_STATUS_PARTS,
    ...(initialStatus ?? {}),
  }));
  const [showMdlError, setShowMdlError] = useState(false);
  const [address, setAddress] = useState<StructuredAddressParts>(
    () => initialAddress ?? EMPTY_ADDRESS_PARTS
  );
  const [vehicle, setVehicle] = useState<
    StructuredVehicleParts & { vehicleType: string }
  >(() => initialVehicle ?? EMPTY_VEHICLE_PARTS);
  // Which tab is showing, and the "nothing to add" boxes that complete a
  // section with no entries (see lib/addTargetSteps.ts for the rules).
  const [step, setStep] = useState<StepKey>("target");
  const [noAddress, setNoAddress] = useState(false);
  const [noVehicle, setNoVehicle] = useState(false);
  const [noResidents, setNoResidents] = useState(false);
  const [noAssociates, setNoAssociates] = useState(false);
  const [noBackground, setNoBackground] = useState(false);
  // "None" ticked under Special Projects (an answer; saved as no projects).
  const [noSpecialProjects, setNoSpecialProjects] = useState(false);
  // Which resident / associate card is open on its tab.
  const [selectedKey, setSelectedKey] = useState<
    Record<"resident" | "associate", string | null>
  >({ resident: null, associate: null });
  // Next was pressed while blocked (the red line gets an outline), and the
  // "that tab is locked" message — each remembered against what was wrong
  // at the time so it clears itself once that changes.
  const [flashFor, setFlashFor] = useState<string | null>(null);
  const [lockedNote, setLockedNote] = useState<{
    text: string;
    open: StepKey | null;
  } | null>(null);
  const [registryBackground, setRegistryBackground] = useState("");
  // A document import's narrative is copied into the Background box, labelled
  // "From <Operation> document:" so a target imported from several operations'
  // documents keeps each story apart. It is re-labelled if the operation
  // changes, but only while the officer hasn't touched the box.
  const seededBackgroundRef = useRef("");
  useEffect(() => {
    if (!open) return;
    const seeded = labelledImportedBackground(
      initialBackground,
      operation?.name
    );
    setRegistryBackground(current =>
      current === seededBackgroundRef.current ? seeded : current
    );
    seededBackgroundRef.current = seeded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBackground, operation?.name]);
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
  const setBackgroundMut = trpc.target.registry.setBackground.useMutation();
  const associateCreateLinkedMut =
    trpc.associate.createLinkedFromTarget.useMutation();
  const uploadImageMut = trpc.attachment.uploadManual.useMutation();
  const confirmEntityFaceMut = trpc.attachment.confirmEntityFace.useMutation();
  const linkToEntityMut = trpc.attachment.linkToEntity.useMutation();

  return {
    operation,
    setOperation,
    targetType,
    setTargetType,
    identity,
    setIdentity,
    status,
    setStatus,
    showMdlError,
    setShowMdlError,
    address,
    setAddress,
    vehicle,
    setVehicle,
    step,
    setStep,
    noAddress,
    setNoAddress,
    noVehicle,
    setNoVehicle,
    noResidents,
    setNoResidents,
    noAssociates,
    setNoAssociates,
    noBackground,
    setNoBackground,
    noSpecialProjects,
    setNoSpecialProjects,
    selectedKey,
    setSelectedKey,
    flashFor,
    setFlashFor,
    lockedNote,
    setLockedNote,
    registryBackground,
    setRegistryBackground,
    seededBackgroundRef,
    extraAddresses,
    setExtraAddresses,
    extraVehicles,
    setExtraVehicles,
    associates,
    setAssociates,
    saving,
    setSaving,
    linking,
    setLinking,
    utils,
    associateCreateMut,
    setBackgroundMut,
    associateCreateLinkedMut,
    uploadImageMut,
    confirmEntityFaceMut,
    linkToEntityMut,
  };
}

export type TargetFormState = ReturnType<typeof useTargetForm>;
