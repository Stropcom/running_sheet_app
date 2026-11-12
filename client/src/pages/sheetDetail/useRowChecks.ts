// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen used to be one
// 4,900-line function; its state and handlers are now these step hooks, called in this order:
// useSheetData → useRowActions → useRowChecks → useRowMembers → useSheetViewState → useSheetEditing.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { trpc } from "@/lib/trpc";
import { type DedupType } from "@/components/EntityDuplicateDialog";
import { useCommandFeature } from "@/lib/commandFeatures";
import { useState, useCallback, useRef } from "react";
import { bracketCodeFromRegisteredName } from "@shared/addressFormat";
import { toast } from "sonner";
import type { SheetDataState } from "./useSheetData";
import type { RowActionsState } from "./useRowActions";
import type { RowSaveInput, PendingDupe } from "./types";

export function useRowChecks(
  s: Pick<SheetDataState, "rows" | "isOnline" | "utils" | "sheet" | "sheetId"> &
    Pick<RowActionsState, "updateRow">
) {
  const { rows, updateRow, isOnline, utils, sheet, sheetId } = s;

  // ── "Check Running Sheet" — jump to / fix a finding ─────────────────────
  // Scrolls to the row (see the "sheet-row-{id}" id added to each <tr>) and
  // briefly highlights it so it's obvious which row the finding was about,
  // rather than just landing there silently.
  const handleJumpToCheckRow = (rowId: number) => {
    setShowCheckSheetDialog(false);
    window.setTimeout(() => {
      const el = document.getElementById(`sheet-row-${rowId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-check-highlight");
      window.setTimeout(() => el.classList.remove("row-check-highlight"), 2000);
    }, 150);
  };

  // Applies a "Check Running Sheet" text fix directly — same as editing the
  // row by hand, just a single first-occurrence text replace rather than
  // the whole dupe-check flow (neither a dictionary spelling correction
  // nor removing a duplicated bracket fragment is a new entity to check
  // for duplicates against). Generic despite the name of the thing it's
  // fixing varying by finding category — every category that offers a Fix
  // button (spelling, duplicate-bracket-fragment) reduces to the same
  // "replace this exact substring" operation.
  const handleFixCheckFinding = (
    rowId: number,
    wrong: string,
    correct: string
  ) => {
    const row = rows?.find(r => r.id === rowId);
    if (!row || row.observation == null) return;
    if (!row.observation.includes(wrong)) {
      toast.error(
        "That row's text has changed since the check ran — re-check the sheet."
      );
      return;
    }
    updateRow.mutate({
      id: rowId,
      observation: row.observation.replace(wrong, correct),
    });
  };
  const [dupeQueue, setDupeQueue] = useState<PendingDupe[]>([]);
  const [dupeIndex, setDupeIndex] = useState(0);
  const [dupeDialogOpen, setDupeDialogOpen] = useState(false);
  const [showCheckSheetDialog, setShowCheckSheetDialog] = useState(false);
  // Check Sheet is off by default (shared/commandFeatures.ts): it reads the
  // whole Intelligence list and is far too slow on a large archive.
  const sheetCheckOn = useCommandFeature("sheetCheck");
  // A ref, not state: only ever read/written synchronously within the
  // dedupe-resolution handlers below, never rendered — a ref avoids the
  // stale-closure trap of reading state that was just set in the same tick
  // (e.g. applying a spelling correction, then immediately saving).
  const pendingSaveInputRef = useRef<RowSaveInput | null>(null);
  const [vagueVehicleBusy, setVagueVehicleBusy] = useState(false);
  const mergeEntitiesMut = trpc.intelligence.mergeEntities.useMutation();
  const markEntitiesNotDuplicateMut =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();

  function applyBracketCorrection(
    text: string,
    rawShortForm: string,
    correctSpelling: string
  ): string {
    // Defensive: a "remembered" correction (getKnownPersonNameCorrection)
    // might still be a full "Name, born DATE (BRACKET)" saved before
    // TargetMatchDialog started reducing it to just the bracket code — never
    // let a bracket nest inside the bracket it's replacing.
    const safeSpelling = correctSpelling.includes("(")
      ? bracketCodeFromRegisteredName(correctSpelling)
      : correctSpelling;
    const escaped = rawShortForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(
      new RegExp(`\\(${escaped}\\)`, "g"),
      `(${safeSpelling})`
    );
  }

  // Appends " at <location>" to the end of the observation, ahead of any
  // trailing sentence punctuation — used when the officer confirms the
  // MissingLocationAlert prompt. Deliberately WITHOUT brackets, matching
  // the vehicle-arriving chip's "subsequent mention" convention
  // (isAddressAlreadyMentioned in server/db.ts) exactly — a bare mention of
  // an address already bracket-introduced elsewhere in the sheet is picked
  // up by getAllIntelligenceEntities' "Pass B" scan the same way theirs is,
  // and looksLikeUnlocatedVehiclePresenceRow (server/db.ts) knows to check
  // for that bare mention too, so this row correctly stops being flagged
  // without needing its own bracket — see missingLocationSuggestion.test.ts.
  function appendLocationSuggestion(text: string, location: string): string {
    const trimmed = text.trimEnd();
    const trailingPunct = trimmed.match(/([.:])\s*$/);
    if (trailingPunct) {
      return `${trimmed.slice(0, -1)} at ${location}${trailingPunct[1]}`;
    }
    return `${trimmed} at ${location}.`;
  }

  const updateRowWithDupeCheck = useCallback(
    async (input: RowSaveInput) => {
      // Offline, or no meaningful observation text — nothing to fuzzy-check, save directly.
      if (!isOnline || !input.observation || !input.observation.trim()) {
        updateRow.mutate(input);
        return;
      }
      try {
        const extracted = await utils.intelligence.previewEntities.fetch({
          text: input.observation,
        });
        const relevant = extracted.filter(e => e.type !== "unknown");
        const queue: PendingDupe[] = [];
        const seen = new Set<string>();
        let correctedObservation = input.observation;

        for (const e of relevant) {
          const dedupeKey = `${e.type}::${e.shortForm.toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          // Independent of the near-duplicate checks below (and of whichever
          // branch they take) — always runs, for every entity type: is this
          // exact entity already a real sighting on a different operation?
          // Its own try/catch, deliberately separate from the outer one:
          // a failure here must never skip the person/generic checks below
          // for the rest of this row's entities.
          if (sheet?.operationId) {
            try {
              const crossOp =
                await utils.intelligence.checkCrossOperationEntity.fetch({
                  type: e.type as DedupType,
                  label: e.shortForm,
                  operationId: sheet.operationId,
                });
              if (crossOp) {
                queue.push({
                  kind: "crossOp",
                  type: e.type as DedupType,
                  label: e.shortForm,
                  operationNames: crossOp.operationNames,
                });
              }
            } catch (err) {
              console.warn("checkCrossOperationEntity failed", err);
            }
          }
          if (e.type === "person") {
            // Already confirmed before (the "spellcheck remembers" case) —
            // silently correct the text, no prompt.
            const known =
              await utils.intelligence.getKnownPersonNameCorrection.fetch({
                spelling: e.rawShortForm,
              });
            if (known) {
              correctedObservation = applyBracketCorrection(
                correctedObservation,
                e.rawShortForm,
                known.correctSpelling
              );
              continue;
            }
            // Close-but-not-exact match to an existing Target/Associate —
            // ask, rather than silently linking or silently missing it.
            const targetMatches =
              await utils.intelligence.checkPossibleTargetMatches.fetch({
                label: e.shortForm,
              });
            if (targetMatches.length > 0) {
              queue.push({
                kind: "target",
                rawShortForm: e.rawShortForm,
                match: targetMatches[0],
              });
              continue;
            }
          }

          const matches =
            await utils.intelligence.checkPossibleDuplicates.fetch({
              type: e.type as DedupType,
              label: e.shortForm,
            });
          if (matches.length > 0) {
            queue.push({
              kind: "generic",
              type: e.type as DedupType,
              label: e.shortForm,
              match: matches[0],
            });
          }
        }

        // A vehicle-presence row with no location of its own — see
        // findMissingLocationSuggestion. Checked against the fully
        // corrected text (after any spelling fixes above), and only once
        // sheetId is known.
        if (sheetId) {
          try {
            const missingLocation = await utils.row.checkMissingLocation.fetch({
              sheetId,
              observation: correctedObservation,
              excludeRowId: input.id,
            });
            if (missingLocation) {
              queue.push({
                kind: "missingLocation",
                location: missingLocation.location,
                source: missingLocation.source,
              });
            }
          } catch (err) {
            console.warn("checkMissingLocation failed", err);
          }

          // A vehicle with a real registration that might be the same car
          // as an earlier no-rego sighting on this sheet — see
          // findVagueVehicleMatch. Confirming links the two entities via
          // mergeEntities without touching any row's text.
          try {
            const vagueVehicle = await utils.row.checkVagueVehicleMatch.fetch({
              sheetId,
              observation: correctedObservation,
              excludeRowId: input.id,
            });
            if (vagueVehicle) {
              queue.push({
                kind: "vagueVehicle",
                loserLabel: vagueVehicle.loserLabel,
                winnerLabel: vagueVehicle.winnerLabel,
                reason: vagueVehicle.reason,
              });
            }
          } catch (err) {
            console.warn("checkVagueVehicleMatch failed", err);
          }
        }

        const correctedInput = { ...input, observation: correctedObservation };
        if (queue.length === 0) {
          updateRow.mutate(correctedInput);
          return;
        }
        pendingSaveInputRef.current = correctedInput;
        setDupeQueue(queue);
        setDupeIndex(0);
        setDupeDialogOpen(true);
      } catch {
        // If the duplicate check itself fails for any reason, don't block the save.
        updateRow.mutate(input);
      }
    },
    [isOnline, updateRow, utils, sheet?.operationId, sheetId]
  );

  function handleTargetMatchResolved(
    rawShortForm: string,
    correctSpelling: string | undefined
  ) {
    if (correctSpelling && pendingSaveInputRef.current?.observation) {
      pendingSaveInputRef.current = {
        ...pendingSaveInputRef.current,
        observation: applyBracketCorrection(
          pendingSaveInputRef.current.observation,
          rawShortForm,
          correctSpelling
        ),
      };
    }
    handleDupeDialogResolved();
  }

  function handleMissingLocationResolved(
    addLocation: boolean,
    location: string
  ) {
    if (addLocation && pendingSaveInputRef.current?.observation) {
      pendingSaveInputRef.current = {
        ...pendingSaveInputRef.current,
        observation: appendLocationSuggestion(
          pendingSaveInputRef.current.observation,
          location
        ),
      };
    }
    handleDupeDialogResolved();
  }

  async function handleVagueVehicleResolved(
    confirmed: boolean,
    warning: { loserLabel: string; winnerLabel: string }
  ) {
    setVagueVehicleBusy(true);
    try {
      if (confirmed) {
        await mergeEntitiesMut.mutateAsync({
          type: "vehicle",
          winnerLabel: warning.winnerLabel,
          loserLabel: warning.loserLabel,
        });
      } else {
        await markEntitiesNotDuplicateMut.mutateAsync({
          type: "vehicle",
          labelA: warning.winnerLabel,
          labelB: warning.loserLabel,
        });
      }
    } catch (err) {
      console.warn("vague vehicle match resolution failed", err);
    } finally {
      setVagueVehicleBusy(false);
    }
    handleDupeDialogResolved();
  }

  function handleDupeDialogResolved() {
    const nextIndex = dupeIndex + 1;
    if (nextIndex < dupeQueue.length) {
      setDupeIndex(nextIndex);
      setDupeDialogOpen(true);
    } else {
      setDupeDialogOpen(false);
      setDupeQueue([]);
      setDupeIndex(0);
      if (pendingSaveInputRef.current) {
        updateRow.mutate(pendingSaveInputRef.current);
        pendingSaveInputRef.current = null;
      }
    }
  }

  return {
    handleJumpToCheckRow,
    handleFixCheckFinding,
    dupeQueue,
    dupeIndex,
    dupeDialogOpen,
    setDupeDialogOpen,
    showCheckSheetDialog,
    setShowCheckSheetDialog,
    sheetCheckOn,
    vagueVehicleBusy,
    updateRowWithDupeCheck,
    handleTargetMatchResolved,
    handleMissingLocationResolved,
    handleVagueVehicleResolved,
    handleDupeDialogResolved,
  };
}

export type RowChecksState = ReturnType<typeof useRowChecks>;
