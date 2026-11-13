// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the staged associates and residents and their duplicate checks.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useEffect } from "react";
import { toast } from "sonner";
import {} from "lucide-react";
import {
  EMPTY_NAME_PARTS,
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  makeExtraId,
  parseExtraAddresses,
  parseExtraVehicles,
  mdlMissing,
} from "@/components/TargetStructuredFields";
import { composeAssociateName, isoToDdMmYyyy } from "@/lib/addressFormat";
import { parseSpecialProjects } from "@shared/targetStatus";
import { type DuplicateWarning } from "@/components/PossibleDuplicateAlert";
import { runDuplicateChecks } from "@/lib/duplicateCheck";
import { type StepsInput } from "@/lib/addTargetSteps";
import type { TargetFormState } from "./useTargetForm";
import type { SaveFlowState } from "./useSaveFlow";
import type { DuplicateStateState } from "./useDuplicateState";
import type { ManualImagesState } from "./useManualImages";
import type { StagedAssociate, AddTargetDialogProps } from "./types";

export function useStagedPeople(
  s: Pick<
    TargetFormState,
    | "associates"
    | "utils"
    | "setAssociates"
    | "noSpecialProjects"
    | "status"
    | "targetType"
    | "operation"
    | "identity"
    | "address"
    | "extraAddresses"
    | "noAddress"
    | "vehicle"
    | "extraVehicles"
    | "noVehicle"
    | "noResidents"
    | "noAssociates"
    | "registryBackground"
    | "noBackground"
    | "step"
    | "setSelectedKey"
    | "setNoResidents"
    | "setNoAssociates"
  > &
    Pick<
      SaveFlowState,
      "stagedCheckedRef" | "setStagedWarn" | "stagedWarn" | "setStagedLinking"
    > &
    Pick<DuplicateStateState, "notDuplicateMutation"> &
    Pick<ManualImagesState, "setManualImages" | "manualImages"> &
    Pick<AddTargetDialogProps, "open">
) {
  const {
    associates,
    stagedCheckedRef,
    utils,
    setStagedWarn,
    stagedWarn,
    notDuplicateMutation,
    setAssociates,
    setStagedLinking,
    setManualImages,
    noSpecialProjects,
    status,
    targetType,
    operation,
    identity,
    address,
    extraAddresses,
    noAddress,
    vehicle,
    extraVehicles,
    noVehicle,
    noResidents,
    noAssociates,
    registryBackground,
    noBackground,
    open,
    step,
    setSelectedKey,
    manualImages,
    setNoResidents,
    setNoAssociates,
  } = s;

  const checkStagedNameOnBlur = async (key: string) => {
    const a = associates.find(x => x.key === key);
    if (!a) return;
    const { name } = composeAssociateName(a.identity, a.address.businessName);
    if (!name || stagedCheckedRef.current[key] === name) return;
    stagedCheckedRef.current[key] = name;
    try {
      const warnings = await runDuplicateChecks(utils, [
        { kind: "target", label: name },
        { kind: "person", label: name },
      ]);
      if (warnings.length > 0)
        setStagedWarn({ key, queue: warnings, index: 0 });
    } catch {
      // Silent — an early heads-up only; staged people are created after
      // the target saves and can be merged from the registry afterwards.
    }
  };

  const advanceStagedWarn = () =>
    setStagedWarn(w =>
      w && w.index + 1 < w.queue.length ? { ...w, index: w.index + 1 } : null
    );

  const handleStagedWarnContinue = () => {
    const current = stagedWarn?.queue[stagedWarn.index];
    if (current) {
      notDuplicateMutation.mutate({
        type: current.kind === "target" ? "person" : current.kind,
        labelA: current.candidateLabel,
        labelB: current.existingLabel,
      });
    }
    advanceStagedWarn();
  };

  // ── Staged associates / residents ──
  // Both kinds live in the one `associates` array (distinguished by
  // `relationship`) and render through the same card, so a resident is
  // exactly the associate format under a different heading and colour.
  const patchStaged = (key: string, patch: Partial<StagedAssociate>) =>
    setAssociates(list =>
      list.map(item => (item.key === key ? { ...item, ...patch } : item))
    );

  // "Yes — same person": an existing Target is copied into the staged card
  // and linked on save (same outcome as AssociateCard's link-and-copy); a
  // mined mention is folded in as an alias on save; another Associate has
  // no link concept (associates link to Targets, not each other), so it
  // simply carries on as entered.
  const handleStagedWarnYes = async (warning: DuplicateWarning) => {
    const key = stagedWarn?.key;
    if (!key) return;
    setStagedLinking(true);
    try {
      if (warning.linkable?.recordType === "target") {
        const t = await utils.target.getById.fetch({ id: warning.linkable.id });
        if (!t) {
          toast.error("Couldn't load the matched target.");
          return;
        }
        patchStaged(key, {
          linkedTargetId: t.id,
          identity: {
            firstNames: t.firstNames ?? "",
            surname: t.surname ?? "",
            bornDate: isoToDdMmYyyy(t.bornDate),
          },
          address: {
            unitNo: t.addrUnitNo ?? "",
            houseNo: t.addrHouseNo ?? "",
            streetName: t.addrStreetName ?? "",
            streetType: t.addrStreetType ?? "",
            suburb: t.addrSuburb ?? "",
            state: t.addrState ?? "WA",
            businessName: t.addrBusinessName ?? "",
          },
          addressFollowsTarget: false,
          vehicle: {
            registration: t.vehRegistration ?? "",
            state: t.vehState ?? "WA",
            colour: t.vehColour ?? "",
            make: t.vehMake ?? "",
            model: t.vehModel ?? "",
            vehicleType: t.vehType ?? "",
          },
          extraAddresses: parseExtraAddresses(t.extraAddresses),
          extraVehicles: parseExtraVehicles(t.extraVehicles),
        });
        toast.success(
          `Copied from ${t.name} — will be linked as the same person when saved.`
        );
        // The copied name now matches that Target exactly; don't re-ask.
        stagedCheckedRef.current[key] = t.name;
        setStagedWarn(null);
        return;
      }
      if (warning.kind !== "target" && !warning.exact) {
        const a = associates.find(x => x.key === key);
        patchStaged(key, {
          aliasMerges: [
            ...(a?.aliasMerges ?? []),
            {
              type: warning.kind,
              winnerLabel: warning.candidateLabel,
              loserLabel: warning.existingLabel,
            },
          ],
        });
      }
      advanceStagedWarn();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to copy the matched record.");
    } finally {
      setStagedLinking(false);
    }
  };
  const removeStaged = (key: string) => {
    setAssociates(v => v.filter(item => item.key !== key));
    setManualImages(v =>
      v.filter(
        img =>
          !(
            (img.linkTo.type === "associate" &&
              img.linkTo.associateKey === key) ||
            (img.linkTo.type === "item" && img.linkTo.ownerKey === key)
          )
      )
    );
  };

  const STAGED_KINDS = {
    associate: {
      heading: "Associates",
      cardLabel: "Associate",
      addLabel: "Add another associate",
      noneTitle: "No associates",
      noneHint: "Tick if the target has no known associates.",
      tone: "associate" as const,
      photoBorder: "border-violet-500",
      pill: "border-violet-600",
    },
    resident: {
      heading: "Other Home Address Residents",
      cardLabel: "Resident",
      addLabel: "Add another resident",
      noneTitle: "No other residents",
      noneHint: "Tick if nobody else lives at the target’s home address.",
      tone: "resident" as const,
      photoBorder: "border-sky-500",
      pill: "border-sky-600",
    },
  } as const;

  const blankStaged = (kind: "associate" | "resident"): StagedAssociate => ({
    key: makeExtraId(),
    relationship: kind,
    addressFollowsTarget: kind === "resident",
    identity: EMPTY_NAME_PARTS,
    address: EMPTY_ADDRESS_PARTS,
    vehicle: EMPTY_VEHICLE_PARTS,
  });

  const stagedOfKind = (kind: "associate" | "resident") =>
    associates.filter(a => (a.relationship ?? "associate") === kind);

  // A person's name for pills, cards and messages ("Paul HOGAN", or the
  // business that stands in for it).
  const stagedName = (a: StagedAssociate): string => {
    const first = a.identity.firstNames.trim();
    const sur = a.identity.surname.trim().toUpperCase();
    return (
      `${first} ${sur}`.trim() || (a.address.businessName ?? "").trim() || ""
    );
  };

  // Special Projects count as answered once one is ticked or "None" is.
  const projectsAnswered =
    noSpecialProjects ||
    parseSpecialProjects(status.specialProjects).length > 0;

  // Everything the step rules need, in one place (lib/addTargetSteps.ts).
  const stepsInput: StepsInput = {
    targetType,
    hasOperation: !!operation,
    identity,
    mdlChosen: !mdlMissing(status),
    bailChosen: !!status.bailStatus,
    projectsAnswered,
    address,
    extraAddresses,
    noAddress,
    vehicle,
    extraVehicles,
    noVehicle,
    residents: stagedOfKind("resident"),
    noResidents,
    associates: stagedOfKind("associate"),
    noAssociates,
    background: registryBackground,
    noBackground,
    personLabel: (p, kind) =>
      stagedName(p as StagedAssociate) ||
      `New ${kind === "resident" ? "resident" : "associate"}`,
  };

  // Every section of a kind opens with one blank person already showing, so
  // the form is there to fill in (or the "none" box to tick) without hunting
  // for an Add button. Ticking "none" removes it; unticking brings it back.
  useEffect(() => {
    if (!open) return;
    if (step !== "residents" && step !== "associates") return;
    const kind = step === "residents" ? "resident" : "associate";
    if (step === "residents" ? noResidents : noAssociates) return;
    if (stagedOfKind(kind).length > 0) return;
    const fresh = blankStaged(kind);
    setAssociates(v => [...v, fresh]);
    setSelectedKey(k => ({ ...k, [kind]: fresh.key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, associates, noResidents, noAssociates]);

  const hasStagedPhoto = (key: string) =>
    manualImages.some(
      img =>
        (img.linkTo.type === "associate" && img.linkTo.associateKey === key) ||
        (img.linkTo.type === "item" && img.linkTo.ownerKey === key)
    );

  const setNoneForKind = (kind: "associate" | "resident", on: boolean) => {
    if (kind === "resident") setNoResidents(on);
    else setNoAssociates(on);
    if (!on) return;
    // The forms are blank (the box can't be ticked otherwise) — drop them.
    const keys = new Set(stagedOfKind(kind).map(a => a.key));
    setAssociates(v => v.filter(a => !keys.has(a.key)));
  };

  return {
    checkStagedNameOnBlur,
    handleStagedWarnContinue,
    patchStaged,
    handleStagedWarnYes,
    removeStaged,
    STAGED_KINDS,
    blankStaged,
    stagedOfKind,
    stagedName,
    projectsAnswered,
    stepsInput,
    hasStagedPhoto,
    setNoneForKind,
  };
}

export type StagedPeopleState = ReturnType<typeof useStagedPeople>;
