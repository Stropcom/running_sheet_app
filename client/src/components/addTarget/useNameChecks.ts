// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the surname-blur checks and the duplicate warning answers.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useEffect } from "react";
import { toast } from "sonner";
import {
  composeTargetName,
  composeAddress,
  composeVehicle,
} from "@/lib/addressFormat";
import {} from "@/components/TargetMergeDialog";
import { type DuplicateWarning } from "@/components/PossibleDuplicateAlert";
import { runDuplicateChecks } from "@/lib/duplicateCheck";
import {} from "@/components/OperationPicker";
import type { SaveFlowState } from "./useSaveFlow";
import type { TargetFormState } from "./useTargetForm";
import type { DuplicateStateState } from "./useDuplicateState";
import type { ManualImagesState } from "./useManualImages";
import type { WildField, AddTargetDialogProps } from "./types";

export function useNameChecks(
  s: Pick<
    SaveFlowState,
    | "composedName"
    | "lastBlurCheckedNameRef"
    | "personClearedRef"
    | "saveAsNew"
    | "buildLinkedPayload"
    | "saveStagedAssociates"
    | "saveStagedImages"
    | "buildPayload"
    | "finishSaved"
  > &
    Pick<
      TargetFormState,
      | "utils"
      | "operation"
      | "setLinking"
      | "setOperation"
      | "identity"
      | "address"
      | "vehicle"
      | "extraVehicles"
      | "extraAddresses"
    > &
    Pick<
      DuplicateStateState,
      | "setDupMatchFromSave"
      | "setDupMatch"
      | "setWarnFromSave"
      | "setWarnQueue"
      | "setWarnIndex"
      | "setDupCheckedForName"
      | "warnQueue"
      | "warnIndex"
      | "notDuplicateMutation"
      | "warnFromSave"
      | "setPendingAfterOperation"
      | "mergeEntitiesMutation"
      | "dupMatch"
      | "setExistingFull"
      | "setMergeOpen"
      | "pendingAfterOperation"
    > &
    Pick<AddTargetDialogProps, "onSave"> &
    Pick<ManualImagesState, "setManualImages">
) {
  const {
    composedName,
    lastBlurCheckedNameRef,
    utils,
    setDupMatchFromSave,
    setDupMatch,
    setWarnFromSave,
    setWarnQueue,
    setWarnIndex,
    setDupCheckedForName,
    warnQueue,
    warnIndex,
    personClearedRef,
    notDuplicateMutation,
    warnFromSave,
    saveAsNew,
    operation,
    setPendingAfterOperation,
    setLinking,
    onSave,
    buildLinkedPayload,
    saveStagedAssociates,
    saveStagedImages,
    buildPayload,
    mergeEntitiesMutation,
    finishSaved,
    dupMatch,
    setExistingFull,
    setMergeOpen,
    setOperation,
    pendingAfterOperation,
    identity,
    address,
    vehicle,
    extraVehicles,
    extraAddresses,
    setManualImages,
  } = s;

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
    // An exact-name match can't be remembered as "not the same" server-side
    // (same name, nothing to tell apart), so remember it here: Save must not
    // ask the same question again for this name.
    if (current?.kind === "person" && current.exact) {
      personClearedRef.current = current.candidateLabel;
    }
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
        const associateIdByKey = await saveStagedAssociates(result.id);
        await saveStagedImages(result.id, associateIdByKey);
      } else {
        // No registry record to copy from — just a text mention (or, in
        // theory, an associate match this dialog can't link into). Save the
        // target as entered, then fold the mined mention in as an alias so
        // future sightings of it are recognized as this same identity.
        const result = await onSave(buildPayload());
        const associateIdByKey = await saveStagedAssociates(result.id);
        await saveStagedImages(result.id, associateIdByKey);
        if (warning.kind !== "target" && !warning.exact) {
          await mergeEntitiesMutation.mutateAsync({
            type: warning.kind,
            winnerLabel: warning.candidateLabel,
            loserLabel: warning.existingLabel,
          });
        }
      }
      setWarnQueue([]);
      setWarnIndex(0);
      finishSaved();
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
      dep: "",
      arr: "",
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
  const dropItemImages = (ownerKey: string, itemKey: string) =>
    setManualImages(v =>
      v.filter(
        img =>
          !(
            img.linkTo.type === "item" &&
            img.linkTo.ownerKey === ownerKey &&
            img.linkTo.itemKey === itemKey
          )
      )
    );

  return {
    checkNameOnBlur,
    handleWarnContinue,
    handleWarnReview,
    handleWarnLinkAndCopy,
    handleMergeInstead,
    handleOperationChosenForPending,
    mergeIncoming,
    dropItemImages,
  };
}

export type NameChecksState = ReturnType<typeof useNameChecks>;
