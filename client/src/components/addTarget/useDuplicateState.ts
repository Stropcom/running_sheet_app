// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the possible-duplicate and image-duplicate state.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { type ExistingTargetLike } from "@/components/TargetMergeDialog";
import { type DuplicateWarning } from "@/components/PossibleDuplicateAlert";
import {} from "@/components/OperationPicker";

export function useDuplicateState(s: {}) {
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

  return {
    dupMatch,
    setDupMatch,
    existingFull,
    setExistingFull,
    mergeOpen,
    setMergeOpen,
    checkingDup,
    setCheckingDup,
    dupMatchFromSave,
    setDupMatchFromSave,
    dupCheckedForName,
    setDupCheckedForName,
    pendingAfterOperation,
    setPendingAfterOperation,
    warnQueue,
    setWarnQueue,
    warnIndex,
    setWarnIndex,
    warnFromSave,
    setWarnFromSave,
    notDuplicateMutation,
    mergeEntitiesMutation,
    duplicateImageKeys,
    setDuplicateImageKeys,
    checkingImageDuplicates,
    setCheckingImageDuplicates,
    imageChoices,
    setImageChoices,
  };
}

export type DuplicateStateState = ReturnType<typeof useDuplicateState>;
