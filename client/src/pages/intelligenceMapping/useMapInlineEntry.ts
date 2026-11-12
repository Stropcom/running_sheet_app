// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useEffect } from "react";
import {
  joinObservationPieces,
  tidyObservation,
} from "@shared/observationTidy";
import { shortenAlreadyMentionedNames } from "@/lib/mentionAutocomplete";
import { toast } from "sonner";
import { cardAddressMatch } from "./addressMatch";
import { _getTodayPerthYmd } from "./perthDates";
import type { MapPanesState } from "./useMapPanes";
import type { MapRsDraftState } from "./useMapRsDraft";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapPinsState } from "./useMapPins";
import type { MapDataState } from "./useMapData";
import type { MapAddressSearchState } from "./useMapAddressSearch";

export function useMapInlineEntry(
  s: Pick<
    MapPanesState,
    | "rsInlineLabel"
    | "rsInlineText"
    | "rsInlineTypedRef"
    | "rsInlineCinsRef"
    | "rsInlineUsedVoiceRef"
    | "setRsInlineTypingMode"
    | "rsInlineInputRef"
    | "rsInlineTypingMode"
    | "setRsInlineUndoStack"
    | "setRsInlineText"
    | "resetInlineTimer"
    | "rsUsedBracketCodesWithDraft"
    | "pushInlineUndo"
    | "rsSelectedSheetId"
    | "setRsInlineLabel"
    | "setRsInlineCins"
    | "startInlineCountdown"
    | "rsLastEntry"
    | "setRsEditText"
    | "setRsEditHour"
    | "setRsEditMinute"
    | "setRsEditPeriod"
    | "setRsEditingLastEntry"
    | "rsEditText"
    | "rsEditHour"
    | "rsEditMinute"
    | "rsEditPeriod"
    | "rsUpdateRow"
    | "setRsLastEntry"
  > &
    Pick<
      MapRsDraftState,
      | "sentenceChips"
      | "rsPendingDepartures"
      | "rsAddressMentionedData"
      | "rsQeShortAddr"
      | "rsPendingArrivals"
      | "qeDupeIndex"
      | "qeDupeQueue"
      | "setQeDupeIndex"
      | "setQeDupeDialogOpen"
      | "setQeDupeQueue"
      | "qePendingEntryRef"
      | "setQeVagueVehicleBusy"
      | "mergeEntitiesMut"
      | "markEntitiesNotDuplicateMut"
    > &
    Pick<
      MapPlacingState,
      | "mapQeTimeOverride"
      | "mapQeRowDate"
      | "mapQeAddress"
      | "setMapQeHour"
      | "setMapQeMinute"
      | "setMapQePeriod"
      | "setMapQeTimeOverride"
      | "mapQeOpen"
      | "setMapQeRowDate"
      | "setShowMapQeDateStepper"
    > &
    Pick<
      MapPinsState,
      "closeInlineField" | "addQuickRsEntryWithChecks" | "addQuickRsEntry"
    > &
    Pick<MapDataState, "rsSheetsData" | "utils"> &
    Pick<MapAddressSearchState, "refetchLocations">
) {
  const {
    rsInlineLabel,
    rsInlineText,
    rsInlineTypedRef,
    sentenceChips,
    rsInlineCinsRef,
    mapQeTimeOverride,
    mapQeRowDate,
    rsInlineUsedVoiceRef,
    closeInlineField,
    addQuickRsEntryWithChecks,
    setRsInlineTypingMode,
    rsInlineInputRef,
    rsInlineTypingMode,
    setRsInlineUndoStack,
    setRsInlineText,
    resetInlineTimer,
    mapQeAddress,
    rsPendingDepartures,
    rsUsedBracketCodesWithDraft,
    rsAddressMentionedData,
    rsQeShortAddr,
    rsPendingArrivals,
    pushInlineUndo,
    setMapQeHour,
    setMapQeMinute,
    setMapQePeriod,
    setMapQeTimeOverride,
    rsSelectedSheetId,
    setRsInlineLabel,
    setRsInlineCins,
    startInlineCountdown,
    mapQeOpen,
    rsSheetsData,
    setMapQeRowDate,
    setShowMapQeDateStepper,
    rsLastEntry,
    setRsEditText,
    setRsEditHour,
    setRsEditMinute,
    setRsEditPeriod,
    setRsEditingLastEntry,
    rsEditText,
    rsEditHour,
    rsEditMinute,
    rsEditPeriod,
    rsUpdateRow,
    setRsLastEntry,
    refetchLocations,
    utils,
    qeDupeIndex,
    qeDupeQueue,
    setQeDupeIndex,
    setQeDupeDialogOpen,
    setQeDupeQueue,
    qePendingEntryRef,
    addQuickRsEntry,
    setQeVagueVehicleBusy,
    mergeEntitiesMut,
    markEntitiesNotDuplicateMut,
  } = s;

  const submitInlineField = () => {
    if (!rsInlineLabel) return;
    const finalText = rsInlineText.trim()
      ? rsInlineTypedRef.current
        ? tidyObservation(rsInlineText.trim(), true, { sentenceChips })
        : joinObservationPieces(rsInlineText.trim(), { sentenceChips })
      : rsInlineLabel;
    // Capture CINs and the voice-usage flag BEFORE closeInlineField clears
    // both refs.
    const cinsToAttach = new Set(rsInlineCinsRef.current);
    const timeOverride = mapQeTimeOverride;
    const rowDateOverride = mapQeRowDate;
    const viaVoice = rsInlineUsedVoiceRef.current;
    closeInlineField();
    void addQuickRsEntryWithChecks(
      finalText,
      cinsToAttach,
      timeOverride,
      rowDateOverride,
      viaVoice
    );
  };

  // Switches the observation field from tap-only to typing mode, then
  // re-focuses it — blur+focus (not just focus) is needed because the field
  // may already be focused as read-only, and browsers only summon the
  // on-screen keyboard on a fresh focus event against an editable field.
  const enableInlineTyping = () => {
    setRsInlineTypingMode(true);
    requestAnimationFrame(() => {
      const el = rsInlineInputRef.current;
      if (el) {
        el.blur();
        el.focus();
      }
    });
  };

  // Explicit on/off control for the same tap-only/typing switch as
  // enableInlineTyping above — lets a touch-device officer deliberately
  // drop back to chip-click-only instead of typing mode being one-way.
  const toggleInlineTyping = () => {
    if (rsInlineTypingMode) {
      setRsInlineTypingMode(false);
      rsInlineInputRef.current?.blur();
    } else {
      enableInlineTyping();
    }
  };

  // Steps the observation text back one snapshot at a time — repeated taps
  // keep undoing further back, all the way to the empty starting text.
  const undoInlineText = () => {
    setRsInlineUndoStack(stack => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setRsInlineText(restored);
      return stack.slice(0, -1);
    });
    resetInlineTimer();
  };

  // Voice-trigger for the "Vehicle arriving"/"Vehicle departing" chips —
  // lets an officer say e.g. "1IZQ515 arriving" or "vehicle departing"
  // instead of tapping the chip by hand. On a match this returns the exact
  // same canned sentence the chip button itself would insert (reusing the
  // occupant description and correct full/short address form via the same
  // rsQeShortAddr/rsAddressMentionedData/shortenAlreadyMentionedNames the
  // chip JSX below uses), rather than whatever words Whisper actually
  // heard — keeping the wording consistent with every other way this
  // sentence gets written, and correct even if Whisper mangled the rest of
  // what was said. The rego match works against the ALREADY shortcut-
  // expanded transcript (VoiceInputButton runs applyShortcutsToTranscript
  // before this fires), so saying a target's own vehicle shortcut (e.g.
  // "v1") is enough — its expansion already embeds the literal rego text.
  // Only fires on an unambiguous match: either the rego is mentioned and
  // identifies exactly one pending vehicle, or no rego is mentioned but
  // there's exactly one pending chip of that kind anyway. Anything more
  // ambiguous (or no trigger word at all) falls through to inserting the
  // transcript verbatim, same as before this feature existed.
  const detectVehicleEventVoiceTrigger = (
    transcript: string
  ): string | null => {
    const normalized = transcript.toLowerCase();
    if (!mapQeAddress) return null;

    if (/\barriv(?:ing|ed|es)\b/.test(normalized)) {
      const candidates = (rsPendingDepartures ?? []).filter(d =>
        normalized.includes(d.rego.toLowerCase())
      );
      const match =
        candidates.length === 1
          ? candidates[0]
          : candidates.length === 0 && rsPendingDepartures?.length === 1
            ? rsPendingDepartures[0]
            : null;
      if (match) {
        const occupantDesc = shortenAlreadyMentionedNames(
          match.occupantDesc,
          rsUsedBracketCodesWithDraft
        );
        const arriveAddr = rsAddressMentionedData?.mentioned
          ? rsQeShortAddr
          : mapQeAddress;
        return `Vehicle ${match.rego}, ${occupantDesc}, arrived at ${arriveAddr}`;
      }
    }

    if (/\bdepart(?:ing|ed|s)\b/.test(normalized)) {
      const arrivalsHere = (rsPendingArrivals ?? []).filter(a =>
        cardAddressMatch(a.address, rsQeShortAddr)
      );
      const candidates = arrivalsHere.filter(a =>
        normalized.includes(a.rego.toLowerCase())
      );
      const match =
        candidates.length === 1
          ? candidates[0]
          : candidates.length === 0 && arrivalsHere.length === 1
            ? arrivalsHere[0]
            : null;
      if (match) {
        const occupantDesc = shortenAlreadyMentionedNames(
          match.occupantDesc,
          rsUsedBracketCodesWithDraft
        );
        return `Vehicle ${match.rego}, ${occupantDesc}, departed ${rsQeShortAddr} and continued via:`;
      }
    }

    return null;
  };

  // Inserts a voice transcript at the cursor (or appends if the field
  // isn't focused) — same before/after split + undo-stack pattern as the
  // shortcut-expansion handler below, just triggered by VoiceInputButton
  // instead of a keystroke. Shortcut expansion (mapQeShortcutMap) already
  // ran on the transcript before this fires — see VoiceInputButton's
  // shortcutMap prop.
  const handleVoiceTranscript = (text: string, recordingStartedAt: Date) => {
    rsInlineUsedVoiceRef.current = true;
    const insertText = detectVehicleEventVoiceTrigger(text) ?? text;
    const textarea = rsInlineInputRef.current;
    const pos = textarea?.selectionStart ?? rsInlineText.length;
    const before = rsInlineText.slice(0, pos);
    const after = rsInlineText.slice(pos);
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
    const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
    const newText = `${before}${needsSpaceBefore ? " " : ""}${insertText}${needsSpaceAfter ? " " : ""}${after}`;
    pushInlineUndo(rsInlineText);
    setRsInlineText(newText);
    resetInlineTimer();
    requestAnimationFrame(() => {
      const newPos =
        before.length + (needsSpaceBefore ? 1 : 0) + insertText.length;
      textarea?.setSelectionRange(newPos, newPos);
      textarea?.focus();
    });

    // Pre-fill the time picker from when recording actually started, not
    // when transcription finished — same "Now" button logic (see the
    // inline Time picker further down) but anchored to the moment the
    // officer began speaking about the event rather than whenever WASM
    // inference happens to wrap up, which can trail by several seconds.
    const h24 = recordingStartedAt.getHours();
    const min = recordingStartedAt.getMinutes();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    setMapQeHour(String(h12));
    setMapQeMinute(String(min).padStart(2, "0"));
    setMapQePeriod(ampm);
    setMapQeTimeOverride(
      `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`
    );
  };

  const openInlineField = (label: string) => {
    if (!rsSelectedSheetId) return;
    setRsInlineLabel(label);
    setRsInlineText("");
    setRsInlineCins(new Set());
    rsInlineCinsRef.current = new Set();
    rsInlineUsedVoiceRef.current = false;
    setRsInlineTypingMode(false);
    setRsInlineUndoStack([]);
    // Focus the textarea after render
    setTimeout(() => rsInlineInputRef.current?.focus(), 50);
    // Start auto-submit countdown
    startInlineCountdown();
  };

  // Auto-open the inline observation field whenever the RS Quick Entry sheet opens
  // (replaces the old trigger buttons — the full form appears immediately)
  useEffect(() => {
    if (mapQeOpen && rsSelectedSheetId) {
      // Reset time picker to current time on each open
      const now = new Date();
      const h24 = now.getHours();
      const min = now.getMinutes();
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const ampm = h24 < 12 ? "AM" : "PM";
      setMapQeHour(String(h12));
      setMapQeMinute(String(min).padStart(2, "0"));
      setMapQePeriod(ampm);
      setMapQeTimeOverride(
        `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`
      );
      // Default date to the RS creation date (Perth) so operators don't accidentally log on the wrong day
      const selectedSheet = (rsSheetsData as any[] | undefined)?.find(
        (s: any) => s.id === rsSelectedSheetId
      );
      if (selectedSheet?.createdAt) {
        const sheetDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Australia/Perth",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(selectedSheet.createdAt));
        setMapQeRowDate(sheetDate);
      } else {
        setMapQeRowDate(_getTodayPerthYmd());
      }
      setShowMapQeDateStepper(false); // always start with stepper hidden
      // Use a small delay so the sheet has rendered before we set focus
      setTimeout(() => {
        setRsInlineLabel("Entry");
        setRsInlineText("");
        setRsInlineCins(new Set());
        rsInlineCinsRef.current = new Set();
        rsInlineUsedVoiceRef.current = false;
        setRsInlineTypingMode(false);
        setTimeout(() => rsInlineInputRef.current?.focus(), 80);
      }, 50);
    }
    if (!mapQeOpen) {
      // Clear the inline field when the sheet closes
      setRsInlineLabel(null);
      setRsInlineText("");
    }
  }, [mapQeOpen, rsSelectedSheetId, rsSheetsData]);

  // Tap-to-edit on the "Last Entry" banner — see rsEditingLastEntry's own
  // declaration for why this is a separate mini form rather than routing
  // back through the create-a-new-entry flow. Pre-fills from rsLastEntry's
  // own already-recorded text/time, not from whatever a wall-clock "now"
  // would give.
  const openLastEntryEdit = () => {
    if (!rsLastEntry) return;
    setRsEditText(rsLastEntry.label);
    const match = rsLastEntry.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      setRsEditHour(String(parseInt(match[1])));
      setRsEditMinute(match[2]);
      setRsEditPeriod(match[3].toUpperCase());
    }
    setRsEditingLastEntry(true);
  };

  const cancelLastEntryEdit = () => {
    setRsEditingLastEntry(false);
  };

  const saveLastEntryEdit = () => {
    if (!rsLastEntry || !rsEditText.trim()) return;
    // Same AM/PM -> 24h conversion addQuickRsEntry uses above, kept
    // separate rather than extracted into a shared helper — a two-line
    // calculation isn't worth the indirection for its one other call site.
    let h = parseInt(rsEditHour);
    const m = parseInt(rsEditMinute);
    if (rsEditPeriod === "PM" && h !== 12) h += 12;
    if (rsEditPeriod === "AM" && h === 12) h = 0;
    const totalMins = h * 60 + m;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const timeStr = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${rsEditPeriod}`;
    const trimmed = rsEditText.trim();
    rsUpdateRow.mutate(
      {
        id: rsLastEntry.id,
        time: timeStr,
        timeMinutes: totalMins,
        observation: trimmed,
      },
      {
        onSuccess: () => {
          setRsLastEntry({ id: rsLastEntry.id, label: trimmed, time: timeStr });
          setRsEditingLastEntry(false);
          toast.success("Entry updated");
          void refetchLocations();
          if (rsSelectedSheetId) {
            void utils.row.entityChips.invalidate({
              sheetId: rsSelectedSheetId,
            });
          }
        },
        onError: e => toast.error(e.message),
      }
    );
  };

  // Appends " at <location>" to the end of the observation, ahead of any
  // trailing sentence punctuation — used when the officer confirms the
  // MissingLocationAlert prompt. Mirrors appendLocationSuggestion in
  // SheetDetail.tsx (kept local rather than shared — it's a single small
  // pure function with no other dependencies). Deliberately WITHOUT
  // brackets, matching the vehicle-arriving chip's "subsequent mention"
  // convention — a bare mention of an address already bracket-introduced
  // elsewhere in the sheet is picked up by getAllIntelligenceEntities'
  // "Pass B" scan, and looksLikeUnlocatedVehiclePresenceRow (server/db.ts)
  // checks for that bare mention too, so this row correctly stops being
  // flagged without needing its own bracket — see
  // missingLocationSuggestion.test.ts.
  const appendQeLocationSuggestion = (
    text: string,
    location: string
  ): string => {
    const trimmed = text.trimEnd();
    const trailingPunct = trimmed.match(/([.:])\s*$/);
    if (trailingPunct) {
      return `${trimmed.slice(0, -1)} at ${location}${trailingPunct[1]}`;
    }
    return `${trimmed} at ${location}.`;
  };

  function handleQeDupeResolved() {
    const nextIndex = qeDupeIndex + 1;
    if (nextIndex < qeDupeQueue.length) {
      setQeDupeIndex(nextIndex);
      setQeDupeDialogOpen(true);
    } else {
      setQeDupeDialogOpen(false);
      setQeDupeQueue([]);
      setQeDupeIndex(0);
      const pending = qePendingEntryRef.current;
      qePendingEntryRef.current = null;
      if (pending) {
        addQuickRsEntry(
          pending.observation,
          pending.cinsToAttach,
          pending.timeOverride,
          pending.rowDateOverride,
          pending.viaVoice
        );
      }
    }
  }

  function handleQeMissingLocationResolved(
    addLocation: boolean,
    location: string
  ) {
    if (addLocation && qePendingEntryRef.current) {
      qePendingEntryRef.current = {
        ...qePendingEntryRef.current,
        observation: appendQeLocationSuggestion(
          qePendingEntryRef.current.observation,
          location
        ),
      };
    }
    handleQeDupeResolved();
  }

  async function handleQeVagueVehicleResolved(
    confirmed: boolean,
    warning: { loserLabel: string; winnerLabel: string }
  ) {
    setQeVagueVehicleBusy(true);
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
      setQeVagueVehicleBusy(false);
    }
    handleQeDupeResolved();
  }

  return {
    submitInlineField,
    enableInlineTyping,
    toggleInlineTyping,
    undoInlineText,
    handleVoiceTranscript,
    openLastEntryEdit,
    cancelLastEntryEdit,
    saveLastEntryEdit,
    handleQeMissingLocationResolved,
    handleQeVagueVehicleResolved,
  };
}

export type MapInlineEntryState = ReturnType<typeof useMapInlineEntry>;
