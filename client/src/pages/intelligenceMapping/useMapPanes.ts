// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useMemo, useRef, useState } from "react";
import { expandIntelVehicleToFullForm } from "@/lib/addressFormat";
import {
  computeUsedBracketCodes,
  computeUsedVehicleRegos,
  computeUsedAddressLabels,
  type PersonMentionSuggestion,
} from "@/lib/mentionAutocomplete";
import { trpc } from "@/lib/trpc";
import { useAddressSuggestField } from "@/components/useAddressSuggestField";
import { useIsMobile } from "@/hooks/useMobile";
import { useIsTouchDevice, useVisualViewportInset } from "./deviceHooks";
import {
  DEFAULT_QUICK_LINKS,
  LS_MAP_SETTINGS_KEY,
  LS_QUICK_LINKS_KEY,
  type QuickLink,
} from "./quickLinks";
import type { MapBasicsState } from "./useMapBasics";

export function useMapPanes(
  s: Pick<MapBasicsState, "isMobile" | "isInvestigator">
) {
  const { isMobile, isInvestigator } = s;

  // On a phone the Map | Sat | Fly toggle becomes an L — Fly drops below Sat —
  // so the column of map buttons under it shifts down by one row.
  const narrowScreen = useIsMobile();
  const rightColShift = narrowScreen ? 42 : 0;

  // Quick-link state
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
    try {
      const saved = localStorage.getItem(LS_QUICK_LINKS_KEY);
      if (saved) return JSON.parse(saved) as QuickLink[];
    } catch {
      /* ignore */
    }
    return DEFAULT_QUICK_LINKS;
  });
  const [editingQuickLinks, setEditingQuickLinks] = useState(false);

  // RS Actions pane state — persisted in localStorage
  const [rsActionsPaneOpen, setRsActionsPaneOpen] = useState(false);
  // On phones and tablets the right pane covers the map; Fly's own controls
  // sit above the 3D view, so they're tucked away while the pane is open.
  const flyChromeHidden = isMobile && rsActionsPaneOpen;
  // Target/Operation profile sub-views shown inline within the right pane
  // (null = normal pane content). Mutually exclusive — opening one clears
  // the other, since both occupy the same pane body.
  const [paneTargetProfileId, setPaneTargetProfileIdRaw] = useState<
    number | null
  >(null);
  const [paneOperationProfileId, setPaneOperationProfileIdRaw] = useState<
    number | null
  >(null);
  // Operation Images, browsed inside the pane the same way the profiles are,
  // rather than navigating away to /images and losing the map. Two levels:
  // the operation's running-sheet folders, then one sheet's photos — mirroring
  // the Images page's own hierarchy (it reuses the very same components).
  const [paneImagesOpId, setPaneImagesOpIdRaw] = useState<number | null>(null);
  const [paneImagesSheetId, setPaneImagesSheetId] = useState<number | null>(
    null
  );
  // The Active running sheet, opened inline (view + edit) within the pane —
  // same idea as the Target/Operation profile sub-views above, so an officer
  // can work the sheet without leaving the map. Unlike those, this renders
  // the full SheetDetail page component itself (embedded mode — see its own
  // props), not a purpose-built read view.
  const [paneSheetDetailId, setPaneSheetDetailIdRaw] = useState<number | null>(
    null
  );
  // Investigator accounts are map-only view + own-location-share — no RS,
  // Images or Profile pane access (server-side, none of the data those
  // panes need is even in their allowlist — see INVESTIGATOR_ALLOWED_PATHS
  // in server/_core/trpc.ts). Rebinding the setters here, once, means every
  // existing trigger throughout this file (pin clicks, list rows, popup
  // buttons) stays untouched and simply becomes a no-op for this role,
  // rather than needing each one individually gated.
  const setPaneTargetProfileId = isInvestigator
    ? () => {}
    : setPaneTargetProfileIdRaw;
  const setPaneOperationProfileId = isInvestigator
    ? () => {}
    : setPaneOperationProfileIdRaw;
  const setPaneImagesOpId = isInvestigator ? () => {} : setPaneImagesOpIdRaw;
  const setPaneSheetDetailId = isInvestigator
    ? () => {}
    : setPaneSheetDetailIdRaw;
  // Pane width — resizable by dragging its left edge, remembered separately for the
  // normal pane content vs. the Target Profile sub-view (which wants more room)
  const [panelWidthNormal, setPanelWidthNormal] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const v = JSON.parse(s).panelWidthNormal;
        if (typeof v === "number") return v;
      }
    } catch {
      /* ignore */
    }
    return 320;
  });
  const [panelWidthProfile, setPanelWidthProfile] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const v = JSON.parse(s).panelWidthProfile;
        if (typeof v === "number") return v;
      }
    } catch {
      /* ignore */
    }
    return 480;
  });
  const paneResizeDraggingRef = useRef(false);
  const PANE_MIN_WIDTH = 288;
  // Any full-pane sub-view (profile, images, or the running sheet) gets the
  // wider remembered width — they're all content to read/browse/edit rather
  // than the compact settings list.
  const paneSubViewOpen =
    paneTargetProfileId !== null ||
    paneOperationProfileId !== null ||
    paneImagesOpId !== null ||
    paneSheetDetailId !== null;
  const activePaneWidth = paneSubViewOpen
    ? panelWidthProfile
    : panelWidthNormal;

  const [rsSelectedOpId, setRsSelectedOpId] = useState<number | null>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).rsSelectedOpId ?? null;
    } catch {
      /* ignore */
    }
    return null;
  });
  const [rsSelectedSheetId, setRsSelectedSheetId] = useState<number | null>(
    () => {
      try {
        const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        if (s) return JSON.parse(s).rsSelectedSheetId ?? null;
      } catch {
        /* ignore */
      }
      return null;
    }
  );
  // Quick-insert chips mined from this sheet's own observations so far
  // (surname / short address / vehicle rego) — same query SheetDetail uses,
  // so both surfaces show the same shared, server-computed chip set.
  const { data: rsEntityChips } = trpc.row.entityChips.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    { enabled: !!rsSelectedSheetId }
  );
  const [rsAddingRow, setRsAddingRow] = useState(false);
  const [rsLastEntry, setRsLastEntry] = useState<{
    id: number;
    label: string;
    time: string;
  } | null>(null);
  // Tap-to-edit on the "Last Entry" confirmation below — a self-contained
  // mini form (its own text + time fields), deliberately NOT reusing the
  // much more elaborate create-a-new-entry state machine (rsInlineLabel/
  // rsInlineText, mention autocomplete, CIN picker, undo stack, vehicle-
  // arrival chips...) a correction to the entry just submitted is a much
  // rarer path than creating a new one, and entangling the two risked
  // regressing the one that matters far more.
  const [rsEditingLastEntry, setRsEditingLastEntry] = useState(false);
  const [rsEditText, setRsEditText] = useState("");
  const [rsEditHour, setRsEditHour] = useState("12");
  const [rsEditMinute, setRsEditMinute] = useState("00");
  const [rsEditPeriod, setRsEditPeriod] = useState("AM");
  const rsUpdateRow = trpc.row.update.useMutation();
  const isTouchDevice = useIsTouchDevice();
  const {
    visibleHeight: vvVisibleHeight,
    keyboardInset: vvKeyboardInset,
    offsetTop: vvOffsetTop,
  } = useVisualViewportInset();

  // Inline observation field state
  const [rsInlineLabel, setRsInlineLabel] = useState<string | null>(null); // null = closed
  const [rsInlineText, setRsInlineText] = useState("");
  const [rsInlineCins, setRsInlineCins] = useState<Set<string>>(new Set()); // selected CINs for the inline entry (multi-select)
  const rsInlineCinsRef = useRef<Set<string>>(new Set()); // ref so mutation callback always sees latest
  // Whether any voice input contributed to the CURRENT (still-open) inline
  // entry — set in handleVoiceTranscript, reset whenever the field opens or
  // closes. Read (not state, to avoid an extra render on every tap) at
  // submit time and threaded through to row.create as `viaVoice`, which
  // appends a note to that row's row_created audit log entry — an
  // evidentiary trail that this observation involved on-device
  // transcription, per CLAUDE.md's audit trail convention. Deliberately a
  // whole-row flag, not per-sentence: text in this field can mix typed and
  // voice-inserted content in one submission, and "this row involved voice
  // input" is the traceability that matters for review, not a precise
  // split of which words came from which source.
  const rsInlineUsedVoiceRef = useRef(false);
  // True once the officer has typed in the box (as opposed to a chip filling it),
  // so the tidy-up pass only ever runs on text they wrote themselves.
  const rsInlineTypedRef = useRef(false);
  const [rsCountdown, setRsCountdown] = useState<number>(30); // countdown seconds
  const rsInlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rsCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const rsInlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  // Address / "@" place suggestions for the observation box.
  const rsAddressField = useAddressSuggestField();
  // Undo history for the observation textarea — snapshots of the text
  // before each chip insert / shortcut expansion / burst of typing, so the
  // undo button can step backwards repeatedly (continuous undo).
  const [rsInlineUndoStack, setRsInlineUndoStack] = useState<string[]>([]);

  // Snapshot the observation text before a change is applied, so undoInlineText
  // can step back to it. Call with the pre-change value.
  const pushInlineUndo = (prevText: string) => {
    setRsInlineUndoStack(stack => [...stack, prevText]);
  };

  // ── RS Quick-entry helper ────────────────────────────────────────────────────
  // Helper: start/restart the 30-second countdown + auto-submit timer
  const startInlineCountdown = () => {
    // Countdown/auto-submit removed — no timer
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current)
      clearInterval(rsCountdownIntervalRef.current);
  };

  const resetInlineTimer = () => {
    startInlineCountdown();
  };
  // How an accepted suggestion lands in the box: as an undo step, caret after it.
  const applyRsAddressPick = (fn: (prev: string) => string, caret: number) => {
    setRsInlineText(prev => {
      pushInlineUndo(prev);
      return fn(prev);
    });
    resetInlineTimer();
    requestAnimationFrame(() => {
      const ta = rsInlineInputRef.current;
      ta?.focus();
      ta?.setSelectionRange(caret, caret);
    });
  };
  // RSQE is built for tapping shortcut chips, not typing — the observation
  // textarea starts read-only (so focusing it, including the auto-focus on
  // open, never summons the on-screen keyboard) until the user taps directly
  // into the field to switch into typing mode.
  const [rsInlineTypingMode, setRsInlineTypingMode] = useState(false);
  const rsInlineTypingPushRef = useRef<number>(0);

  // ── Inline mention autocomplete (person + vehicle) ──────────────────────
  // Same behaviour as SheetDetail's observation field — see
  // client/src/lib/mentionAutocomplete.ts, shared by both surfaces.
  const { data: rsInlineRows } = trpc.row.list.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    { enabled: !!rsSelectedSheetId }
  );
  const rsUsedBracketCodes = useMemo(
    () => computeUsedBracketCodes(rsInlineRows ?? []),
    [rsInlineRows]
  );
  // Names already introduced in full on the sheet AND in the unsaved text in
  // the box — a card's inserted sentence uses short names for those.
  const rsUsedBracketCodesWithDraft = useMemo(
    () =>
      computeUsedBracketCodes([
        ...(rsInlineRows ?? []),
        { observation: rsInlineText },
      ]),
    [rsInlineRows, rsInlineText]
  );
  const rsUsedVehicleRegos = useMemo(
    () => computeUsedVehicleRegos(rsInlineRows ?? []),
    [rsInlineRows]
  );
  const rsUsedAddressLabels = useMemo(
    () => computeUsedAddressLabels(rsInlineRows ?? []),
    [rsInlineRows]
  );
  const [rsMentionWord, setRsMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [rsMentionAnchor, setRsMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rsMentionActiveIndex, setRsMentionActiveIndex] = useState(0);
  const rsMentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [rsMentionQuery, setRsMentionQuery] = useState("");
  const { data: rsMentionResults } =
    trpc.intelligence.searchPersonMentions.useQuery(
      { query: rsMentionQuery },
      { enabled: rsMentionQuery.trim().length >= 2 }
    );
  const rsMentionSuggestions =
    rsMentionQuery.trim().length >= 2 ? (rsMentionResults ?? []) : [];
  const rsConfirmPersonMatch =
    trpc.intelligence.confirmPersonNameMatch.useMutation();

  const [rsVehicleMentionWord, setRsVehicleMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [rsVehicleMentionAnchor, setRsVehicleMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rsVehicleMentionActiveIndex, setRsVehicleMentionActiveIndex] =
    useState(0);
  const rsVehicleMentionDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [rsVehicleMentionQuery, setRsVehicleMentionQuery] = useState("");
  const { data: rsVehicleMentionResults } =
    trpc.intelligence.searchEntities.useQuery(
      {
        type: "vehicle",
        query: rsVehicleMentionQuery,
        excludeTargets: false,
      },
      { enabled: rsVehicleMentionQuery.trim().length >= 2 }
    );
  const rsVehicleMentionSuggestions = (
    rsVehicleMentionQuery.trim().length >= 2
      ? (rsVehicleMentionResults ?? [])
      : []
  ) as { key: string; label: string; rowCount: number }[];

  function closeRsMentionDropdown() {
    setRsMentionWord(null);
    setRsMentionAnchor(null);
    setRsMentionQuery("");
    setRsMentionActiveIndex(0);
    if (rsMentionDebounceRef.current)
      clearTimeout(rsMentionDebounceRef.current);
  }
  function closeRsVehicleMentionDropdown() {
    setRsVehicleMentionWord(null);
    setRsVehicleMentionAnchor(null);
    setRsVehicleMentionQuery("");
    setRsVehicleMentionActiveIndex(0);
    if (rsVehicleMentionDebounceRef.current)
      clearTimeout(rsVehicleMentionDebounceRef.current);
  }

  function selectRsMentionSuggestion(
    s: PersonMentionSuggestion,
    textarea: HTMLTextAreaElement
  ) {
    if (!rsMentionWord) return;
    const insertText = `${s.displayName} (${s.bracketCode})`;
    pushInlineUndo(rsInlineText);
    const newText =
      rsInlineText.slice(0, rsMentionWord.wordStart) +
      insertText +
      rsInlineText.slice(rsMentionWord.wordEnd);
    setRsInlineText(newText);
    if (s.targetId != null || s.associateId != null) {
      rsConfirmPersonMatch.mutate({
        spelling: s.bracketCode,
        targetId: s.targetId ?? undefined,
        associateId: s.associateId ?? undefined,
        correctSpelling: s.bracketCode,
      });
    }
    closeRsMentionDropdown();
    const newPos = rsMentionWord.wordStart + insertText.length;
    resetInlineTimer();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function selectRsVehicleMentionSuggestion(
    s: { key: string; label: string; rowCount: number },
    textarea: HTMLTextAreaElement
  ) {
    if (!rsVehicleMentionWord) return;
    const insertText = expandIntelVehicleToFullForm(s.label);
    pushInlineUndo(rsInlineText);
    const newText =
      rsInlineText.slice(0, rsVehicleMentionWord.wordStart) +
      insertText +
      rsInlineText.slice(rsVehicleMentionWord.wordEnd);
    setRsInlineText(newText);
    closeRsVehicleMentionDropdown();
    const newPos = rsVehicleMentionWord.wordStart + insertText.length;
    resetInlineTimer();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  return {
    narrowScreen,
    rightColShift,
    quickLinks,
    setQuickLinks,
    editingQuickLinks,
    setEditingQuickLinks,
    rsActionsPaneOpen,
    setRsActionsPaneOpen,
    flyChromeHidden,
    paneTargetProfileId,
    paneOperationProfileId,
    paneImagesOpId,
    paneImagesSheetId,
    setPaneImagesSheetId,
    paneSheetDetailId,
    setPaneTargetProfileId,
    setPaneOperationProfileId,
    setPaneImagesOpId,
    setPaneSheetDetailId,
    panelWidthNormal,
    setPanelWidthNormal,
    panelWidthProfile,
    setPanelWidthProfile,
    paneResizeDraggingRef,
    PANE_MIN_WIDTH,
    paneSubViewOpen,
    activePaneWidth,
    rsSelectedOpId,
    rsSelectedSheetId,
    setRsSelectedSheetId,
    rsEntityChips,
    rsAddingRow,
    setRsAddingRow,
    rsLastEntry,
    setRsLastEntry,
    rsEditingLastEntry,
    setRsEditingLastEntry,
    rsEditText,
    setRsEditText,
    rsEditHour,
    setRsEditHour,
    rsEditMinute,
    setRsEditMinute,
    rsEditPeriod,
    setRsEditPeriod,
    rsUpdateRow,
    isTouchDevice,
    vvVisibleHeight,
    vvKeyboardInset,
    vvOffsetTop,
    rsInlineLabel,
    setRsInlineLabel,
    rsInlineText,
    setRsInlineText,
    rsInlineCins,
    setRsInlineCins,
    rsInlineCinsRef,
    rsInlineUsedVoiceRef,
    rsInlineTypedRef,
    setRsCountdown,
    rsInlineTimerRef,
    rsCountdownIntervalRef,
    rsInlineInputRef,
    rsAddressField,
    rsInlineUndoStack,
    setRsInlineUndoStack,
    pushInlineUndo,
    startInlineCountdown,
    resetInlineTimer,
    applyRsAddressPick,
    rsInlineTypingMode,
    setRsInlineTypingMode,
    rsInlineTypingPushRef,
    rsInlineRows,
    rsUsedBracketCodes,
    rsUsedBracketCodesWithDraft,
    rsUsedVehicleRegos,
    rsUsedAddressLabels,
    rsMentionWord,
    setRsMentionWord,
    rsMentionAnchor,
    setRsMentionAnchor,
    rsMentionActiveIndex,
    setRsMentionActiveIndex,
    rsMentionDebounceRef,
    setRsMentionQuery,
    rsMentionSuggestions,
    rsVehicleMentionWord,
    setRsVehicleMentionWord,
    rsVehicleMentionAnchor,
    setRsVehicleMentionAnchor,
    rsVehicleMentionActiveIndex,
    setRsVehicleMentionActiveIndex,
    rsVehicleMentionDebounceRef,
    setRsVehicleMentionQuery,
    rsVehicleMentionSuggestions,
    closeRsMentionDropdown,
    closeRsVehicleMentionDropdown,
    selectRsMentionSuggestion,
    selectRsVehicleMentionSuggestion,
  };
}

export type MapPanesState = ReturnType<typeof useMapPanes>;
