// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the layout.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
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
  FileText,
  Target as TargetIcon,
} from "lucide-react";
import {
  TargetIdentityFields,
  TargetAddressFields,
  TargetVehicleFields,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  makeExtraId,
  mdlMissing,
} from "@/components/TargetStructuredFields";
import {
  composeTargetName,
  composeAssociateName,
  composeAddress,
} from "@/lib/addressFormat";
import { TargetMergeDialog } from "@/components/TargetMergeDialog";
import { PossibleDuplicateAlert } from "@/components/PossibleDuplicateAlert";
import { OperationPicker } from "@/components/OperationPicker";
import { PhotoOwnerCaption } from "@/components/PhotoOwnerCaption";
import type { StagedImage } from "@/components/ImportTargetDocumentDialog";
import {
  FORM_NESTED_PANEL,
  FORM_NESTED_TITLE,
  FORM_TONES,
} from "@/lib/formKit";
import { AddTargetBackgroundPanel } from "@/components/RegistryBackgroundPanel";
import {
  AddAnotherButton,
  NoneBox,
  SectionPanel,
  StatusMark,
  StepNote,
  StepTabs,
  type TabMark,
  type TabSpec,
} from "@/components/AddTargetKit";
import {
  STEP_LABEL,
  STEP_ORDER,
  addressHasDetail,
  canEnterStep,
  personAddressProblem,
  personIsBlank,
  personIsDone,
  personVehicleProblem,
  sectionStatus,
  stepProblem,
  stepStatus,
  targetAddressProblem,
  targetVehicleProblem,
  type StepKey,
  vehicleIsBlank,
} from "@/lib/addTargetSteps";
import { cn } from "@/lib/utils";
import type { AddTargetScreen } from "./useAddTargetScreen";
import type {
  StagedAssociate,
  AddressSectionConfig,
  VehicleSectionConfig,
} from "./types";
import { computePrimaryIdentity } from "./helpers";

/** The Add Target dialog's layout: the section builders and the dialog itself. */
export function AddTargetView({ s }: { s: AddTargetScreen }) {
  const {
    dropItemImages,
    STAGED_KINDS,
    address,
    stagedName,
    patchStaged,
    effectiveStaged,
    removeStaged,
    checkStagedNameOnBlur,
    stagedOfKind,
    noResidents,
    noAssociates,
    selectedKey,
    hasStagedPhoto,
    stepsInput,
    setNoneForKind,
    setSelectedKey,
    blankStaged,
    setAssociates,
    associates,
    manualImages,
    triggerManualImageUpload,
    setManualImages,
    targetType,
    identity,
    vehicle,
    status,
    projectsAnswered,
    setIdentity,
    checkNameOnBlur,
    setStatus,
    showMdlError,
    noSpecialProjects,
    setNoSpecialProjects,
    setAddress,
    extraAddresses,
    setExtraAddresses,
    noAddress,
    setNoAddress,
    setVehicle,
    extraVehicles,
    setExtraVehicles,
    noVehicle,
    setNoVehicle,
    operation,
    setOperation,
    saving,
    checkingDup,
    setTargetType,
    initialImages,
    checkingImageDuplicates,
    imageChoices,
    duplicateImageKeys,
    setImageChoices,
    open,
    mergeOpen,
    resetAndClose,
    manualImageInputRef,
    handleManualImageSelected,
    step,
    goToStep,
    bodyRef,
    registryBackground,
    setRegistryBackground,
    noBackground,
    setNoBackground,
    noteProblem,
    noteDone,
    noteFlash,
    stepIndex,
    handleBackClick,
    onBack,
    stepIsLast,
    handleSaveClick,
    allDone,
    handleNextClick,
    stepBlocker,
    dupMatch,
    pendingAfterOperation,
    setDupMatch,
    composedName,
    handleMergeInstead,
    setDupCheckedForName,
    dupMatchFromSave,
    runSecondaryChecks,
    warnQueue,
    warnIndex,
    handleWarnContinue,
    handleWarnReview,
    handleWarnLinkAndCopy,
    linking,
    stagedWarn,
    handleStagedWarnContinue,
    setStagedWarn,
    handleStagedWarnYes,
    stagedLinking,
    existingFull,
    setMergeOpen,
    setExistingFull,
    mergeIncoming,
    initialBackground,
    initialDocumentSnapshot,
    documentSnapshotForHistory,
    saveStagedAssociates,
    saveStagedImages,
    setBackgroundMut,
    utils,
    finishSaved,
    setPendingAfterOperation,
    handleOperationChosenForPending,
  } = s;

  // ── Sections shared by the target and by every resident / associate ──
  // Each section opens with its first form already on screen (no Add button
  // to hunt for), has an "Add another …" button at its bottom, and is only
  // complete once filled in or its "nothing to add" box is ticked (the rules
  // live in lib/addTargetSteps.ts). Every vehicle and address can have a photo.
  const itemPhoto = (
    category: "vehicle" | "location",
    ownerKey: string,
    itemKey: string
  ) =>
    manualImageUploadSection(
      { type: "item", category, ownerKey, itemKey },
      "border-border"
    );

  const renderAddressSection = (c: AddressSectionConfig) => {
    const following = !!c.follows?.on;
    const noneOn = !!c.none?.checked;
    const all = [c.primary, ...c.extras];
    return (
      <SectionPanel
        icon={<Home className="w-3.5 h-3.5" />}
        title={c.title}
        tone="address"
        status={following ? "done" : sectionStatus(c.problem, noneOn)}
        count={following || noneOn ? 0 : all.filter(addressHasDetail).length}
      >
        {c.follows && (
          <NoneBox
            checked={c.follows.on}
            onChange={c.follows.onChange}
            title="Lives at the target’s address"
            hint={c.follows.text}
          />
        )}
        {!following && (
          <>
            {c.none && (
              <NoneBox
                checked={c.none.checked}
                onChange={c.none.onChange}
                title="No known address"
                hint={`Tick if nothing is known about where ${c.who} lives.`}
                locked={all.some(addressHasDetail)}
                needed={!noneOn && !!c.problem}
              />
            )}
            <div
              className={cn("flex flex-col gap-3", noneOn && "opacity-45")}
              inert={noneOn}
            >
              <div className={cn(FORM_NESTED_PANEL, "p-3 flex flex-col gap-3")}>
                <p className={cn(FORM_NESTED_TITLE, "mb-0")}>
                  <Home className="w-3 h-3" /> {c.firstTitle}
                </p>
                <TargetAddressFields value={c.primary} onChange={c.onPrimary} />
                {itemPhoto("location", c.ownerKey, "primary")}
              </div>
              {c.extras.map((ea, i) => (
                <div
                  key={ea.id}
                  className={cn(FORM_NESTED_PANEL, "p-3 flex flex-col gap-3")}
                >
                  <div className="flex items-center justify-between">
                    <p className={cn(FORM_NESTED_TITLE, "mb-0")}>
                      <Home className="w-3 h-3" /> Address {i + 2}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      aria-label={`Remove address ${i + 2}`}
                      onClick={() => {
                        c.onExtras(c.extras.filter(x => x.id !== ea.id));
                        dropItemImages(c.ownerKey, ea.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <TargetAddressFields
                    value={ea}
                    onChange={v =>
                      c.onExtras(
                        c.extras.map(x => (x.id === ea.id ? { ...x, ...v } : x))
                      )
                    }
                    label={ea.label}
                    onLabelChange={v =>
                      c.onExtras(
                        c.extras.map(x =>
                          x.id === ea.id ? { ...x, label: v } : x
                        )
                      )
                    }
                  />
                  {itemPhoto("location", c.ownerKey, ea.id)}
                </div>
              ))}
              <AddAnotherButton
                disabled={noneOn}
                onClick={() =>
                  c.onExtras([
                    ...c.extras,
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
                Add another address
              </AddAnotherButton>
            </div>
          </>
        )}
      </SectionPanel>
    );
  };

  const renderVehicleSection = (c: VehicleSectionConfig) => {
    const noneOn = !!c.none?.checked;
    const all = [c.primary, ...c.extras];
    return (
      <SectionPanel
        icon={<Car className="w-3.5 h-3.5" />}
        title={c.title}
        tone="vehicle"
        status={sectionStatus(c.problem, noneOn)}
        count={noneOn ? 0 : all.filter(v => !vehicleIsBlank(v)).length}
      >
        {c.none && (
          <NoneBox
            checked={c.none.checked}
            onChange={c.none.onChange}
            title="No known vehicles"
            hint={`Tick if ${c.who} has no vehicle to record.`}
            locked={all.some(v => !vehicleIsBlank(v))}
            needed={!noneOn && !!c.problem}
          />
        )}
        <div
          className={cn("flex flex-col gap-3", noneOn && "opacity-45")}
          inert={noneOn}
        >
          <div className={cn(FORM_NESTED_PANEL, "p-3 flex flex-col gap-3")}>
            <p className={cn(FORM_NESTED_TITLE, "mb-0")}>
              <Car className="w-3 h-3" /> {c.firstTitle}
            </p>
            <TargetVehicleFields value={c.primary} onChange={c.onPrimary} />
            {itemPhoto("vehicle", c.ownerKey, "primary")}
          </div>
          {c.extras.map((ev, i) => (
            <div
              key={ev.id}
              className={cn(FORM_NESTED_PANEL, "p-3 flex flex-col gap-3")}
            >
              <div className="flex items-center justify-between">
                <p className={cn(FORM_NESTED_TITLE, "mb-0")}>
                  <Car className="w-3 h-3" /> Vehicle {i + 2}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  aria-label={`Remove vehicle ${i + 2}`}
                  onClick={() => {
                    c.onExtras(c.extras.filter(x => x.id !== ev.id));
                    dropItemImages(c.ownerKey, ev.id);
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <TargetVehicleFields
                value={ev}
                onChange={v =>
                  c.onExtras(
                    c.extras.map(x => (x.id === ev.id ? { ...x, ...v } : x))
                  )
                }
              />
              {itemPhoto("vehicle", c.ownerKey, ev.id)}
            </div>
          ))}
          <AddAnotherButton
            disabled={noneOn}
            onClick={() =>
              c.onExtras([
                ...c.extras,
                {
                  ...EMPTY_VEHICLE_PARTS,
                  id: makeExtraId(),
                  full: "",
                  short: "",
                },
              ])
            }
          >
            Add another vehicle
          </AddAnotherButton>
        </div>
      </SectionPanel>
    );
  };

  function renderPersonCard(
    kind: "associate" | "resident",
    assoc: StagedAssociate,
    index: number
  ) {
    const cfg = STAGED_KINDS[kind];
    const nameOk = !!composeAssociateName(
      assoc.identity,
      assoc.address.businessName
    ).name;
    const targetAddressText = composeAddress(address).full
      ? `${address.houseNo} ${address.streetName} ${address.streetType}, ${address.suburb}`
      : "The target’s address isn’t filled in yet";
    return (
      <div
        key={assoc.key}
        className={cn(FORM_TONES[cfg.tone].panel, "p-3 flex flex-col gap-3")}
      >
        <div
          className={cn(
            FORM_TONES[cfg.tone].band,
            "mb-0 justify-between gap-2"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Users className="w-3.5 h-3.5 shrink-0" /> {cfg.cardLabel}{" "}
            {index + 1}
            <span className="truncate font-bold normal-case tracking-normal text-foreground">
              {stagedName(assoc)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 normal-case tracking-normal">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() =>
                patchStaged(
                  assoc.key,
                  kind === "resident"
                    ? {
                        relationship: "associate",
                        // Keep the address the resident was showing (the
                        // target's) as their own.
                        address: effectiveStaged(assoc).address,
                        addressFollowsTarget: false,
                      }
                    : { relationship: "resident" }
                )
              }
            >
              {kind === "resident" ? "Move to Associates" : "Move to Residents"}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 text-destructive hover:text-destructive"
              aria-label={`Remove ${cfg.cardLabel.toLowerCase()}`}
              onClick={() => removeStaged(assoc.key)}
            >
              <X className="w-3 h-3" />
            </Button>
          </span>
        </div>

        <SectionPanel
          icon={<User className="w-3.5 h-3.5" />}
          title="Person"
          tone={cfg.tone}
          status={nameOk ? "done" : "todo"}
        >
          <TargetIdentityFields
            value={assoc.identity}
            onChange={v => patchStaged(assoc.key, { identity: v })}
            onSurnameBlur={() => checkStagedNameOnBlur(assoc.key)}
          />
          {manualImageUploadSection(
            { type: "associate", associateKey: assoc.key },
            cfg.photoBorder
          )}
        </SectionPanel>

        {renderAddressSection({
          ownerKey: assoc.key,
          title: "Addresses",
          firstTitle: "Home address",
          who: "this person",
          primary: assoc.address,
          onPrimary: v =>
            patchStaged(assoc.key, { address: v, addressFollowsTarget: false }),
          extras: assoc.extraAddresses ?? [],
          onExtras: next => patchStaged(assoc.key, { extraAddresses: next }),
          none: {
            checked: !!assoc.noAddress,
            onChange: on => patchStaged(assoc.key, { noAddress: on }),
          },
          problem: personAddressProblem(assoc),
          follows:
            kind === "resident"
              ? {
                  on: !!assoc.addressFollowsTarget,
                  text: targetAddressText,
                  onChange: on =>
                    patchStaged(
                      assoc.key,
                      on
                        ? { addressFollowsTarget: true, noAddress: false }
                        : {
                            addressFollowsTarget: false,
                            // Start from the target's address so only the
                            // difference needs typing.
                            address: { ...address, businessName: "" },
                          }
                    ),
                }
              : undefined,
        })}

        {renderVehicleSection({
          ownerKey: assoc.key,
          title: "Vehicles",
          firstTitle: "Vehicle 1",
          who: "this person",
          primary: assoc.vehicle,
          onPrimary: v => patchStaged(assoc.key, { vehicle: v }),
          extras: assoc.extraVehicles ?? [],
          onExtras: next => patchStaged(assoc.key, { extraVehicles: next }),
          none: {
            checked: !!assoc.noVehicle,
            onChange: on => patchStaged(assoc.key, { noVehicle: on }),
          },
          problem: personVehicleProblem(assoc),
        })}
      </div>
    );
  }

  // The Residents and Associates tabs: the "nothing to add" box, then a grid
  // of buttons (one per person, plus "Add another"), then the chosen
  // person's card with its first form already open.
  function renderPeopleStep(kind: "associate" | "resident") {
    const cfg = STAGED_KINDS[kind];
    const list = stagedOfKind(kind);
    const none = kind === "resident" ? noResidents : noAssociates;
    const current = list.find(a => a.key === selectedKey[kind]) ?? list[0];
    const locked = list.some(a => !personIsBlank(a) || hasStagedPhoto(a.key));
    const problem = stepProblem(
      stepsInput,
      kind === "resident" ? "residents" : "associates"
    );
    return (
      <div className="flex flex-col gap-3">
        <NoneBox
          checked={none}
          onChange={on => setNoneForKind(kind, on)}
          title={cfg.noneTitle}
          hint={cfg.noneHint}
          locked={locked}
          lockedHint="Clear the entries below to tick this."
          needed={!none && !!problem}
        />
        <div
          className={cn("flex flex-col gap-3", none && "opacity-45")}
          inert={none}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(a => {
              const isCurrent = current?.key === a.key;
              const addrText = a.addressFollowsTarget
                ? "At the target’s address"
                : a.noAddress
                  ? "No known address"
                  : addressHasDetail(a.address)
                    ? `${a.address.houseNo} ${a.address.streetName}, ${a.address.suburb}`.trim()
                    : "No address yet";
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setSelectedKey(k => ({ ...k, [kind]: a.key }))}
                  className={cn(
                    "flex min-h-[3.25rem] items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50",
                    isCurrent ? cn("border-2", cfg.pill) : "border-border"
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-sm">
                      {stagedName(a) || `New ${cfg.cardLabel.toLowerCase()}`}
                    </b>
                    <span className="truncate text-xs text-muted-foreground">
                      {addrText}
                    </span>
                  </span>
                  <StatusMark mark={personIsDone(a) ? "done" : "todo"} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                const next = blankStaged(kind);
                setAssociates(v => [...v, next]);
                setSelectedKey(k => ({ ...k, [kind]: next.key }));
              }}
              className="flex min-h-[3.25rem] items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-card px-3 py-2 text-sm font-bold transition-colors hover:bg-muted/50"
            >
              <Plus className="h-4 w-4" /> {cfg.addLabel}
            </button>
          </div>
          {current && renderPersonCard(kind, current, list.indexOf(current))}
        </div>
      </div>
    );
  }

  // Who a staged photo is of, for the name printed under its thumbnail.
  const photoOwnerLabel = (linkTo: StagedImage["linkTo"]): string => {
    if (linkTo.type === "existingAssociate") return linkTo.entityLabel;
    if (linkTo.type === "item")
      return linkTo.category === "vehicle" ? "This vehicle" : "This address";
    if (linkTo.type === "associate") {
      const staged = associates.find(a => a.key === linkTo.associateKey);
      if (staged) {
        const { name } = composeAssociateName(
          staged.identity,
          staged.address.businessName
        );
        if (name) return name;
      }
      return "This associate";
    }
    return "This target";
  };

  // Upload Image control shared by Person Identity and each associate's
  // identity box — stages the picked file into manualImages (linked by
  // "target" or that associate's staged key) and shows what's staged so
  // far, with a remove option before save. The actual upload + auto-link
  // happens in saveStagedImages once the target/associate has a real id.
  function manualImageUploadSection(
    linkTo: StagedImage["linkTo"],
    accentBorderClass: string
  ) {
    const matches = (img: StagedImage) => {
      if (linkTo.type === "target") return img.linkTo.type === "target";
      if (linkTo.type === "associate")
        return (
          img.linkTo.type === "associate" &&
          img.linkTo.associateKey === linkTo.associateKey
        );
      if (linkTo.type === "item")
        return (
          img.linkTo.type === "item" &&
          img.linkTo.category === linkTo.category &&
          img.linkTo.ownerKey === linkTo.ownerKey &&
          img.linkTo.itemKey === linkTo.itemKey
        );
      return false;
    };
    const staged = manualImages.filter(matches);
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 self-start"
          onClick={() => triggerManualImageUpload(linkTo)}
        >
          <ImageIcon className="w-3.5 h-3.5" /> Upload Image
        </Button>
        {staged.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {staged.map(img => (
              <div
                key={img.key}
                className="flex flex-col items-center gap-1 w-16"
              >
                <div
                  className={`relative rounded-md overflow-hidden border-2 ${accentBorderClass}`}
                >
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
                <PhotoOwnerCaption label={photoOwnerLabel(img.linkTo)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  const TAB_ICONS: Record<StepKey, React.ReactNode> = {
    target: <TargetIcon className="h-4 w-4" />,
    residents: <Users className="h-4 w-4" />,
    associates: <Users className="h-4 w-4" />,
    background: <FileText className="h-4 w-4" />,
  };
  const tabs: TabSpec[] = STEP_ORDER.map(k => ({
    key: k,
    label: STEP_LABEL[k],
    icon: TAB_ICONS[k],
    mark: (canEnterStep(stepsInput, k)
      ? stepStatus(stepsInput, k)
      : "locked") as TabMark,
  }));

  const whoLabel =
    targetType === "person"
      ? `${identity.firstNames.trim()} ${identity.surname.trim().toUpperCase()}`.trim()
      : computePrimaryIdentity(targetType, identity, address, vehicle).name;

  // ── The Target tab ──
  const personIdentityBox = (
    <SectionPanel
      icon={<User className="w-3.5 h-3.5" />}
      title="Person Identity"
      tone="person"
      status={
        composeTargetName(identity).name &&
        !mdlMissing(status) &&
        !!status.bailStatus &&
        projectsAnswered
          ? "done"
          : "todo"
      }
    >
      <TargetIdentityFields
        value={identity}
        onChange={setIdentity}
        onSurnameBlur={checkNameOnBlur}
        status={status}
        onStatusChange={setStatus}
        showMdlError={showMdlError}
        flagUnanswered={false}
        requiredAnswers
        projectsNone={noSpecialProjects}
        onProjectsNoneChange={setNoSpecialProjects}
      />
      {manualImageUploadSection({ type: "target" }, "border-rose-500")}
    </SectionPanel>
  );

  const addressesBox = renderAddressSection({
    ownerKey: "target",
    title:
      targetType === "location"
        ? "Location Identity"
        : targetType === "vehicle"
          ? "Registered Address"
          : "Addresses",
    firstTitle:
      targetType === "location"
        ? "Location"
        : targetType === "vehicle"
          ? "Registered address"
          : "Home address",
    who: targetType === "vehicle" ? "the vehicle’s keeper" : "the target",
    primary: address,
    onPrimary: setAddress,
    extras: extraAddresses,
    onExtras: setExtraAddresses,
    none:
      targetType === "location"
        ? null
        : { checked: noAddress, onChange: setNoAddress },
    problem: targetAddressProblem(stepsInput),
  });

  const vehiclesBox = renderVehicleSection({
    ownerKey: "target",
    title: targetType === "vehicle" ? "Vehicle Identity" : "Vehicles",
    firstTitle: targetType === "vehicle" ? "Vehicle" : "Vehicle 1",
    who: "the target",
    primary: vehicle,
    onPrimary: setVehicle,
    extras: extraVehicles,
    onExtras: setExtraVehicles,
    none:
      targetType === "vehicle"
        ? null
        : { checked: noVehicle, onChange: setNoVehicle },
    problem: targetVehicleProblem(stepsInput),
  });

  const targetTab = (
    <div className="flex flex-col gap-3">
      <SectionPanel
        icon={<TargetIcon className="w-3.5 h-3.5" />}
        title="What is the target?"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
            Operation <span className="text-destructive">*</span>
          </label>
          <OperationPicker
            value={operation}
            onChange={setOperation}
            disabled={saving || checkingDup}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
            Target Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["person", "Person", User],
                ["vehicle", "Vehicle", Car],
                ["location", "Location", MapPin],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTargetType(value)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
                  targetType === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </SectionPanel>

      {targetType === "person" && personIdentityBox}
      {targetType === "vehicle" ? (
        <>
          {vehiclesBox}
          {addressesBox}
        </>
      ) : (
        <>
          {addressesBox}
          {vehiclesBox}
        </>
      )}

      {/* Photos — staged from a document import (see
          ImportTargetDocumentDialog.tsx). Duplicate-photo detection only
          has a target to compare against once dupMatch names one (see the
          effect above) — a photo the target already has on file defaults
          unticked, same "officer stays in control" pattern as a matched
          associate defaulting to skip. */}
      {(initialImages ?? []).length > 0 && (
        <div
          className={cn(
            FORM_TONES.photo.panel,
            "mt-2 p-3 flex flex-col gap-2.5"
          )}
        >
          <p className={FORM_TONES.photo.band}>
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
              const ownerLabel = photoOwnerLabel(img.linkTo);
              return (
                <div
                  key={img.key}
                  className="flex flex-col items-center gap-1 w-20"
                >
                  <button
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
                        ? "border-cyan-500"
                        : "border-border opacity-40 grayscale"
                    }`}
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.dataBase64}`}
                      alt="Extracted from document"
                      className="w-20 h-20 object-cover block"
                    />
                    {kept && (
                      <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                    {isDup && (
                      <span className="absolute bottom-0 left-0 right-0 bg-amber-500 text-white text-[8px] font-bold text-center py-0.5 leading-none">
                        ALREADY HAVE
                      </span>
                    )}
                  </button>
                  <span
                    className="text-[10px] leading-tight text-center text-muted-foreground break-words w-full"
                    title={ownerLabel}
                  >
                    {ownerLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog
        open={open && !mergeOpen}
        onOpenChange={v => {
          if (!v) resetAndClose();
        }}
      >
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0 h-[min(92dvh,860px)] max-sm:h-dvh max-sm:max-h-none max-sm:max-w-full max-sm:rounded-none sm:max-w-xl md:max-w-2xl lg:max-w-5xl bold-entered"
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6">
            <DialogTitle>Add Target to Registry</DialogTitle>
            <DialogDescription className="sr-only">
              Fill in each tab, or tick that there is nothing to add, to
              continue.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={manualImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleManualImageSelected}
          />
          <StepTabs tabs={tabs} current={step} onSelect={goToStep} />
          <div
            ref={bodyRef}
            className="flex-1 min-h-0 overflow-y-auto wide-scrollbar bg-muted/40 px-4 py-4 sm:px-6"
          >
            {step === "target" && targetTab}
            {step === "residents" && renderPeopleStep("resident")}
            {step === "associates" && renderPeopleStep("associate")}
            {step === "background" && (
              <AddTargetBackgroundPanel
                value={registryBackground}
                onChange={setRegistryBackground}
                none={noBackground}
                onNoneChange={on => {
                  setNoBackground(on);
                }}
              />
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2 border-t bg-muted/60 px-4 py-3 sm:px-6">
            <StepNote
              problem={noteProblem}
              doneText={noteDone}
              flash={noteFlash}
            />
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <span className="truncate text-sm text-muted-foreground">
                <b className="text-foreground">
                  {whoLabel || `New ${targetType} target`}
                </b>{" "}
                · step {stepIndex + 1} of {STEP_ORDER.length}
              </span>
              <div className="grid grid-cols-3 gap-2 lg:flex">
                <Button
                  variant="outline"
                  className="lg:min-w-28"
                  onClick={resetAndClose}
                  disabled={saving || checkingDup}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="lg:min-w-28"
                  onClick={handleBackClick}
                  disabled={
                    saving || checkingDup || (stepIndex === 0 && !onBack)
                  }
                >
                  ← Back
                </Button>
                {stepIsLast ? (
                  <Button
                    className="lg:min-w-28 aria-disabled:opacity-50"
                    onClick={handleSaveClick}
                    aria-disabled={!allDone}
                    disabled={saving || checkingDup}
                  >
                    {checkingDup
                      ? "Checking…"
                      : saving
                        ? "Saving…"
                        : "Save Target"}
                  </Button>
                ) : (
                  <Button
                    className="lg:min-w-28 aria-disabled:opacity-50"
                    onClick={handleNextClick}
                    aria-disabled={!!stepBlocker}
                    disabled={saving || checkingDup}
                  >
                    <span>
                      Next
                      <span className="max-sm:hidden">
                        : {STEP_LABEL[STEP_ORDER[stepIndex + 1]]}
                      </span>{" "}
                      →
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </div>
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
              existing target, <strong>{dupMatch?.name}</strong>. Is this the
              same person?
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

      {/* Possible-duplicate prompt for a staged associate/resident's name */}
      <PossibleDuplicateAlert
        warning={
          stagedWarn ? (stagedWarn.queue[stagedWarn.index] ?? null) : null
        }
        creates="associate"
        onContinue={handleStagedWarnContinue}
        onReview={() => setStagedWarn(null)}
        onLinkAndCopy={handleStagedWarnYes}
        linking={stagedLinking}
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
          documentSourceFileBase64={
            initialDocumentSnapshot?.sourceFileBase64 || null
          }
          documentSourceFileMimeType={
            initialDocumentSnapshot?.sourceFileMimeType || null
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
            const associateIdByKey = await saveStagedAssociates(targetId);
            await saveStagedImages(targetId, associateIdByKey);
            // A Background typed here is added after whatever the existing
            // target already has (never overwriting it).
            const typedBackground = registryBackground.trim();
            if (typedBackground) {
              try {
                await setBackgroundMut.mutateAsync({
                  id: targetId,
                  background: typedBackground,
                  mode: "append",
                });
              } catch (err: any) {
                toast.error(
                  `Merged, but the Background could not be saved: ${err?.message ?? "unknown error"}`
                );
              }
            }
            utils.target.registry.list.invalidate();
            utils.associate.listForTarget.invalidate();
            utils.intelligence.targetProfile.invalidate();
            utils.intelligence.operationProfile.invalidate();
            finishSaved();
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
