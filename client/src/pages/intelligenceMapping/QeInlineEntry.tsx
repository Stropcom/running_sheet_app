// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { ceasePlaceFor } from "@shared/ceaseRow";
import { CeaseRowButton } from "@/components/CeaseRowButton";
import { orderRsChips } from "@shared/rsChips";
import {
  joinObservationPieces,
  justTypedSpaceAfterBracket,
  tidyObservation,
  tidyObservationAtCaret,
} from "@shared/observationTidy";
import { detectUnidentifiedRepeat } from "@shared/unidentified";
import { popupShortAddress } from "@shared/markerLink";
import { locateTargetFromPending } from "@shared/targetPosition";
import { formatIntelVehicle } from "@/lib/addressFormat";
import {
  getCaretPixelPosition,
  detectMentionTrigger,
  detectVehicleMentionTrigger,
  detectAddressSpaceCompletion,
  detectPersonNameSpaceCompletion,
  extractOccupantNames,
} from "@/lib/mentionAutocomplete";
import {} from "@/components/ContinuityCards";
import {} from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  VoiceInputButton,
  QE_HEADER_BUTTON_SIZE,
} from "@/components/VoiceInputButton";
import {
  ChevronDown,
  Send,
  User,
  Undo2,
  Keyboard,
  Car,
  Crosshair,
} from "lucide-react";
import type { MapScreen } from "./useMapScreen";
import { QeAddressCard } from "./QeAddressCard";

/** the Quick Entry text box, mention suggestions and target chips on the map. */
export function QeInlineEntry({ s }: { s: MapScreen }) {
  const {
    user,
    rsInlineLabel,
    rsSelectedSheetId,
    rsSheetsData,
    mapQeAddress,
    isTouchDevice,
    rsInlineTypingMode,
    handleVoiceTranscript,
    mapQeShortcutMap,
    toggleInlineTyping,
    undoInlineText,
    rsInlineUndoStack,
    rsInlineInputRef,
    rsInlineText,
    enableInlineTyping,
    rsInlineTypedRef,
    sentenceChips,
    rsInlineTypingPushRef,
    pushInlineUndo,
    setRsInlineText,
    resetInlineTimer,
    rsAddressField,
    closeRsMentionDropdown,
    closeRsVehicleMentionDropdown,
    rsUsedVehicleRegos,
    setRsVehicleMentionWord,
    setRsVehicleMentionActiveIndex,
    setRsVehicleMentionAnchor,
    rsVehicleMentionDebounceRef,
    setRsVehicleMentionQuery,
    rsUsedBracketCodes,
    setRsMentionWord,
    setRsMentionActiveIndex,
    setRsMentionAnchor,
    rsMentionDebounceRef,
    setRsMentionQuery,
    applyRsAddressPick,
    rsVehicleMentionWord,
    rsVehicleMentionSuggestions,
    selectRsVehicleMentionSuggestion,
    rsVehicleMentionActiveIndex,
    rsMentionWord,
    rsMentionSuggestions,
    selectRsMentionSuggestion,
    rsMentionActiveIndex,
    rsUsedAddressLabels,
    rsMentionAnchor,
    rsVehicleMentionAnchor,
    assignedTarget,
    rsEntityChips,
    setQeTargetPanelExpanded,
    qeTargetPanelExpanded,
    generalShortcuts,
    rsOwnRowShortcut,
    rsInlineRows,
    rsSurveillance,
    rsTrackedTarget,
    rsPendingArrivals,
    rsPendingDepartures,
    rsPendingWalkIns,
    rsPendingHeadingTo,
    rsPendingPlacements,
    utils,
    rsInlineCins,
    setRsInlineCins,
    rsInlineCinsRef,
    submitInlineField,
    rsAddingRow,
  } = s;
  return (
    <>
      {rsInlineLabel &&
        (() => {
          const selectedSheet = (rsSheetsData as any[] | undefined)?.find(
            (s: any) => s.id === rsSelectedSheetId
          );
          const rosterCins: string[] = [];
          if (selectedSheet?.sheetCins) {
            try {
              const parsed: Array<{
                cin: string;
                isTeamLeader?: boolean;
              }> =
                typeof selectedSheet.sheetCins === "string"
                  ? JSON.parse(selectedSheet.sheetCins)
                  : selectedSheet.sheetCins;
              parsed
                .sort((a, b) => {
                  if (a.isTeamLeader && !b.isTeamLeader) return -1;
                  if (!a.isTeamLeader && b.isTeamLeader) return 1;
                  const numA = parseInt(a.cin ?? "", 10);
                  const numB = parseInt(b.cin ?? "", 10);
                  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                  return (a.cin ?? "").localeCompare(b.cin ?? "");
                })
                .forEach(c => {
                  if (c.cin) rosterCins.push(c.cin);
                });
            } catch {
              /* ignore */
            }
          }
          const inlineReadOnly = isTouchDevice && !rsInlineTypingMode;
          return (
            <div
              className="rounded-lg border border-border bg-muted/40 p-2.5 md:p-3.5 flex flex-col gap-2 md:gap-2.5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Voice sits right next to the label, not
                                grouped with Keyboard/Undo — it's the
                                primary way of filling this field in a
                                hurry, so it belongs next to what it's
                                filling in, not tucked away on the far
                                side with the secondary controls. */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Observation
                  </span>
                  <VoiceInputButton
                    onTranscript={handleVoiceTranscript}
                    shortcutMap={mapQeShortcutMap}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Only meaningful on touch devices — desktop's
                                  observation field is always editable (see
                                  useIsTouchDevice above), so this toggle
                                  would have nothing to switch there. */}
                  {isTouchDevice && (
                    <button
                      type="button"
                      onClick={toggleInlineTyping}
                      title={
                        rsInlineTypingMode
                          ? "Switch back to chip-click only"
                          : "Switch to keyboard typing"
                      }
                      className={`${QE_HEADER_BUTTON_SIZE} hover:bg-accent/50 ${
                        rsInlineTypingMode
                          ? "border-primary/50 text-primary bg-primary/10"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <Keyboard className="h-4 w-4" />
                      <span className="hidden sm:inline">Keyboard</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={undoInlineText}
                    disabled={rsInlineUndoStack.length === 0}
                    title="Undo"
                    className={`${QE_HEADER_BUTTON_SIZE} border-border text-muted-foreground hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none`}
                  >
                    <Undo2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Undo</span>
                  </button>
                </div>
              </div>
              <textarea
                ref={rsInlineInputRef}
                value={rsInlineText}
                readOnly={inlineReadOnly}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                onClick={() => {
                  if (inlineReadOnly) enableInlineTyping();
                }}
                onChange={e => {
                  let next = e.target.value;
                  // Typed by hand (not added by a chip): the
                  // tidy-up pass may run on this entry.
                  rsInlineTypedRef.current = true;
                  // A space typed right after a bracket tidies
                  // what has been typed so far (vehicle lists,
                  // spaces, capitals — shared/observationTidy.ts).
                  const typedAt = e.target.selectionStart ?? next.length;
                  if (justTypedSpaceAfterBracket(next, typedAt)) {
                    const joined = tidyObservationAtCaret(
                      next,
                      typedAt,
                      false,
                      { sentenceChips }
                    );
                    if (joined.changed) {
                      next = joined.text;
                      const ta = e.target;
                      const caret = joined.caret;
                      requestAnimationFrame(() =>
                        ta.setSelectionRange(caret, caret)
                      );
                    }
                  }
                  const now = Date.now();
                  // Group rapid keystrokes into a single undo step; only
                  // snapshot when there's been a pause since the last one.
                  if (now - rsInlineTypingPushRef.current > 600) {
                    pushInlineUndo(rsInlineText);
                  }
                  rsInlineTypingPushRef.current = now;
                  setRsInlineText(next);
                  resetInlineTimer();

                  const cursorPos = Math.min(
                    e.target.selectionStart ?? next.length,
                    next.length
                  );
                  // A street number + start of a street, or "@"
                  // + a place name, opens the address list and
                  // takes priority over the name/rego triggers.
                  if (rsAddressField.onText(next, cursorPos, e.target)) {
                    closeRsMentionDropdown();
                    closeRsVehicleMentionDropdown();
                    return;
                  }
                  const vehicleTrigger = detectVehicleMentionTrigger(
                    next,
                    cursorPos,
                    rsUsedVehicleRegos
                  );
                  if (vehicleTrigger) {
                    closeRsMentionDropdown();
                    setRsVehicleMentionWord({
                      word: vehicleTrigger.word,
                      wordStart: vehicleTrigger.wordStart,
                      wordEnd: cursorPos,
                    });
                    setRsVehicleMentionActiveIndex(0);
                    setRsVehicleMentionAnchor(
                      getCaretPixelPosition(e.target, cursorPos)
                    );
                    if (rsVehicleMentionDebounceRef.current)
                      clearTimeout(rsVehicleMentionDebounceRef.current);
                    rsVehicleMentionDebounceRef.current = setTimeout(() => {
                      setRsVehicleMentionQuery(vehicleTrigger.word);
                    }, 250);
                  } else {
                    closeRsVehicleMentionDropdown();
                    const trigger = detectMentionTrigger(
                      next,
                      cursorPos,
                      rsUsedBracketCodes
                    );
                    if (!trigger) {
                      closeRsMentionDropdown();
                    } else {
                      setRsMentionWord({
                        word: trigger.word,
                        wordStart: trigger.wordStart,
                        wordEnd: cursorPos,
                      });
                      setRsMentionActiveIndex(0);
                      setRsMentionAnchor(
                        getCaretPixelPosition(e.target, cursorPos)
                      );
                      if (rsMentionDebounceRef.current)
                        clearTimeout(rsMentionDebounceRef.current);
                      rsMentionDebounceRef.current = setTimeout(() => {
                        setRsMentionQuery(trigger.word);
                      }, 250);
                    }
                  }
                }}
                onFocus={resetInlineTimer}
                onBlur={() => {
                  closeRsMentionDropdown();
                  closeRsVehicleMentionDropdown();
                  rsAddressField.close();
                  // Leaving the field tidies what was typed by
                  // hand (vehicle lists, spaces, capitals, closing
                  // full stop). Text made only by chips and the
                  // Target Logger buttons keeps just the vehicle
                  // list punctuation.
                  const tidy = rsInlineTypedRef.current
                    ? tidyObservation(rsInlineText, true, {
                        sentenceChips,
                      })
                    : joinObservationPieces(rsInlineText, {
                        sentenceChips,
                      });
                  if (tidy !== rsInlineText) {
                    pushInlineUndo(rsInlineText);
                    setRsInlineText(tidy);
                  }
                }}
                onKeyDown={e => {
                  if (rsAddressField.onKeyDown(e, applyRsAddressPick)) return;
                  if (
                    rsVehicleMentionWord &&
                    rsVehicleMentionSuggestions.length > 0
                  ) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setRsVehicleMentionActiveIndex(
                        i => (i + 1) % rsVehicleMentionSuggestions.length
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setRsVehicleMentionActiveIndex(
                        i =>
                          (i - 1 + rsVehicleMentionSuggestions.length) %
                          rsVehicleMentionSuggestions.length
                      );
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      selectRsVehicleMentionSuggestion(
                        rsVehicleMentionSuggestions[
                          rsVehicleMentionActiveIndex
                        ],
                        e.currentTarget
                      );
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeRsVehicleMentionDropdown();
                      return;
                    }
                  }
                  if (rsMentionWord && rsMentionSuggestions.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setRsMentionActiveIndex(
                        i => (i + 1) % rsMentionSuggestions.length
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setRsMentionActiveIndex(
                        i =>
                          (i - 1 + rsMentionSuggestions.length) %
                          rsMentionSuggestions.length
                      );
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      selectRsMentionSuggestion(
                        rsMentionSuggestions[rsMentionActiveIndex],
                        e.currentTarget
                      );
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeRsMentionDropdown();
                      return;
                    }
                  }
                  if (e.key === " " || e.key === "Tab") {
                    const textarea = e.currentTarget;
                    const pos = textarea.selectionStart ?? 0;
                    const textBefore = rsInlineText.slice(0, pos);
                    // An unidentified person already introduced in
                    // full is only referred to by the short name:
                    // finishing the full wording again becomes
                    // "UM1".
                    const unidentifiedRepeat =
                      e.key === " " && rsUsedBracketCodes
                        ? detectUnidentifiedRepeat(
                            rsInlineText,
                            pos,
                            rsUsedBracketCodes
                          )
                        : null;
                    if (unidentifiedRepeat) {
                      e.preventDefault();
                      pushInlineUndo(rsInlineText);
                      setRsInlineText(
                        `${rsInlineText.slice(0, unidentifiedRepeat.start)}${unidentifiedRepeat.code} ${rsInlineText.slice(pos)}`
                      );
                      resetInlineTimer();
                      requestAnimationFrame(() => {
                        const newPos =
                          unidentifiedRepeat.start +
                          unidentifiedRepeat.code.length +
                          1;
                        textarea.setSelectionRange(newPos, newPos);
                      });
                      return;
                    }
                    const match = textBefore.match(/(\S+)$/);
                    let expanded = false;
                    if (match) {
                      const word = match[1].toLowerCase();
                      const expansion = mapQeShortcutMap[word];
                      if (expansion) {
                        expanded = true;
                        e.preventDefault();
                        const before = textBefore.slice(
                          0,
                          textBefore.length - match[1].length
                        );
                        const after = rsInlineText.slice(pos);
                        const newText = before + expansion + " " + after;
                        pushInlineUndo(rsInlineText);
                        setRsInlineText(newText);
                        resetInlineTimer();
                        requestAnimationFrame(() => {
                          const newPos = before.length + expansion.length + 1;
                          textarea.setSelectionRange(newPos, newPos);
                        });
                      }
                    }
                    // Deterministic vehicle-bracket completion —
                    // same rule as the registry dropdown above
                    // (detectVehicleMentionTrigger), but fires
                    // unconditionally on Space so a fresh, never-
                    // before-seen rego still gets bracketed, not
                    // just one Intelligence already knows about.
                    if (!expanded && e.key === " " && rsUsedVehicleRegos) {
                      const vehicleTrigger = detectVehicleMentionTrigger(
                        rsInlineText,
                        pos,
                        rsUsedVehicleRegos
                      );
                      if (vehicleTrigger) {
                        expanded = true;
                        e.preventDefault();
                        const { word, wordStart } = vehicleTrigger;
                        const before = rsInlineText.slice(0, wordStart);
                        const after = rsInlineText.slice(pos);
                        const bracket = `(Vehicle ${word.toUpperCase()})`;
                        const newText = `${before}${word} ${bracket} ${after}`;
                        // The bracket is now complete and followed
                        // by a space — tidy what has been typed so
                        // far (vehicle lists, spaces, capitals).
                        const joined = tidyObservationAtCaret(
                          newText,
                          before.length + word.length + 1 + bracket.length + 1,
                          false,
                          { sentenceChips }
                        );
                        pushInlineUndo(rsInlineText);
                        setRsInlineText(joined.text);
                        resetInlineTimer();
                        closeRsVehicleMentionDropdown();
                        requestAnimationFrame(() => {
                          textarea.setSelectionRange(
                            joined.caret,
                            joined.caret
                          );
                        });
                      }
                    }
                    // Same idea, for a street address completed
                    // by its suburb + state (see
                    // detectAddressSpaceCompletion) —
                    // "(44 Elvira Street)".
                    if (!expanded && e.key === " " && rsUsedAddressLabels) {
                      const addressTrigger = detectAddressSpaceCompletion(
                        rsInlineText,
                        pos,
                        rsUsedAddressLabels
                      );
                      if (addressTrigger) {
                        expanded = true;
                        e.preventDefault();
                        const bracket = `(${addressTrigger.addressLabel})`;
                        const before = rsInlineText.slice(0, pos);
                        const after = rsInlineText.slice(pos);
                        const newText = `${before} ${bracket} ${after}`;
                        pushInlineUndo(rsInlineText);
                        setRsInlineText(newText);
                        resetInlineTimer();
                        requestAnimationFrame(() => {
                          const newPos = before.length + 1 + bracket.length + 1;
                          textarea.setSelectionRange(newPos, newPos);
                        });
                      }
                    }
                    // Same idea, for a fresh person's name
                    // completed by its ALL-CAPS surname (see
                    // detectPersonNameSpaceCompletion) —
                    // "(SURNAME)".
                    if (!expanded && e.key === " " && rsUsedBracketCodes) {
                      const personTrigger = detectPersonNameSpaceCompletion(
                        rsInlineText,
                        pos,
                        rsUsedBracketCodes
                      );
                      if (personTrigger) {
                        e.preventDefault();
                        const bracket = `(${personTrigger.surname.toUpperCase()})`;
                        const before = rsInlineText.slice(0, pos);
                        const after = rsInlineText.slice(pos);
                        const newText = `${before} ${bracket} ${after}`;
                        pushInlineUndo(rsInlineText);
                        setRsInlineText(newText);
                        resetInlineTimer();
                        closeRsMentionDropdown();
                        requestAnimationFrame(() => {
                          const newPos = before.length + 1 + bracket.length + 1;
                          textarea.setSelectionRange(newPos, newPos);
                        });
                      }
                    }
                  }
                }}
                placeholder={
                  inlineReadOnly
                    ? "Tap shortcuts below, or tap here to type…"
                    : "Add details (optional)…"
                }
                rows={4}
                className={`w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring md:px-3 md:py-2 md:text-sm lg:min-h-[140px] ${inlineReadOnly ? "cursor-pointer" : ""}`}
              />
              {rsAddressField.element(applyRsAddressPick)}
              {rsMentionWord &&
                rsMentionAnchor &&
                rsMentionSuggestions.length > 0 && (
                  <div
                    className="fixed z-50 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                    style={{
                      top: rsMentionAnchor.top,
                      left: rsMentionAnchor.left,
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}
                  >
                    {rsMentionSuggestions.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                          i === rsMentionActiveIndex
                            ? "bg-accent text-accent-foreground"
                            : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                        onMouseEnter={() => setRsMentionActiveIndex(i)}
                        onMouseDown={e => {
                          e.preventDefault();
                          if (rsInlineInputRef.current)
                            selectRsMentionSuggestion(
                              s,
                              rsInlineInputRef.current
                            );
                        }}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{s.displayName}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {s.rowCount} obs.
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              {rsVehicleMentionWord &&
                rsVehicleMentionAnchor &&
                rsVehicleMentionSuggestions.length > 0 && (
                  <div
                    className="fixed z-50 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                    style={{
                      top: rsVehicleMentionAnchor.top,
                      left: rsVehicleMentionAnchor.left,
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}
                  >
                    {rsVehicleMentionSuggestions.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                          i === rsVehicleMentionActiveIndex
                            ? "bg-accent text-accent-foreground"
                            : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                        onMouseEnter={() => setRsVehicleMentionActiveIndex(i)}
                        onMouseDown={e => {
                          e.preventDefault();
                          if (rsInlineInputRef.current)
                            selectRsVehicleMentionSuggestion(
                              s,
                              rsInlineInputRef.current
                            );
                        }}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {formatIntelVehicle(s.label)}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {s.rowCount} obs.
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              {/* Target panel — the blue shortcut chips and, right
                          under them, the purple entity chips, in a dropdown
                          like the running sheet's TARGET panel. Open/closed
                          is remembered per device. The green addresses stay
                          below it. */}
              {(assignedTarget ||
                (rsEntityChips && rsEntityChips.length > 0)) && (
                <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setQeTargetPanelExpanded(v => {
                        const next = !v;
                        try {
                          localStorage.setItem(
                            "runsheet_qe_target_panel_expanded",
                            String(next)
                          );
                        } catch {}
                        return next;
                      })
                    }
                    aria-expanded={qeTargetPanelExpanded}
                    className="flex w-full min-w-0 select-none items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/20 active:bg-muted/30"
                  >
                    <Crosshair className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {assignedTarget
                        ? `TARGET — ${(assignedTarget as any).name}`
                        : "SHORTCUTS"}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                        qeTargetPanelExpanded ? "" : "-rotate-90"
                      }`}
                    />
                  </button>
                  {qeTargetPanelExpanded && (
                    <div className="flex flex-col gap-1.5 px-3 pb-3">
                      {/* Shortcut buttons */}
                      {(() => {
                        // ── QE chips: exact mirror of main RS chip set, values, and order ──────────
                        // Single source of truth: assignedTarget (target.getById) for all target fields.
                        // Chip set matches SheetDetail exactly: TGT, HBF, HB, V1F, V1, extra vehicles, folder shortcuts.
                        // Order: Shortcuts page order, target chips fixed after SC.
                        const appendText = (text: string) => {
                          pushInlineUndo(rsInlineText);
                          setRsInlineText(prev =>
                            prev ? `${prev} ${text}` : text
                          );
                          resetInlineTimer();
                          rsInlineInputRef.current?.focus();
                        };
                        const t = assignedTarget as any;
                        if (!t) return null;

                        // Extra vehicle chips from JSON (V2F/V2, V3F/V3, …)
                        const extraVehicleChips: Array<{
                          label: string;
                          display: string;
                          getValue: () => string | null;
                        }> = [];
                        try {
                          const evs: Array<{
                            full: string;
                            short: string;
                          }> = JSON.parse(t.extraVehicles ?? "[]");
                          evs.forEach(
                            (
                              ev: { full: string; short: string },
                              i: number
                            ) => {
                              const num = i + 2;
                              if (ev.full)
                                extraVehicleChips.push({
                                  label: `V${num}F`,
                                  display: `V${num}F`,
                                  getValue: () => ev.full,
                                });
                              if (ev.short) {
                                extraVehicleChips.push({
                                  label: `V${num}`,
                                  display: ev.short
                                    ? `V${num} ${ev.short}`
                                    : `V${num}`,
                                  getValue: () => ev.short,
                                });
                              }
                            }
                          );
                        } catch {}

                        // Folder shortcut chips (showInRs=true, exclude legacy 'D')
                        const folderShortcutChips: Array<{
                          label: string;
                          display: string;
                          getValue: () => string | null;
                          shortcutId?: number;
                          startsRow?: boolean;
                        }> = ((generalShortcuts as any[]) ?? [])
                          .filter(
                            (s: any) =>
                              (s.trigger as string).toUpperCase() !== "D" &&
                              !!s.showInRs
                          )
                          .map((s: any) => ({
                            label: (s.trigger as string).toUpperCase(),
                            display: (s.trigger as string).toUpperCase(),
                            getValue: () => s.expansion as string,
                            shortcutId: s.id as number,
                            startsRow: !!s.startsRow,
                          }));

                        // Full chip list — identical order to SheetDetail fields array
                        const allChips: Array<{
                          label: string;
                          display: string;
                          getValue: () => string | null;
                          shortcutId?: number;
                          startsRow?: boolean;
                        }> = [
                          {
                            label: "TGT",
                            display: "TGT",
                            getValue: () => t.tgt ?? null,
                          },
                          {
                            label: "HBF",
                            display: "HBF",
                            getValue: () => t.hbf ?? null,
                          },
                          {
                            label: "HB",
                            display: "HB",
                            getValue: () => t.hb ?? null,
                          },
                          {
                            label: "V1F",
                            display: "V1F",
                            getValue: () => t.v1f ?? null,
                          },
                          {
                            label: "V1",
                            display: t.v1 ? `V1 ${t.v1}` : "V1",
                            getValue: () => t.v1 ?? null,
                          },
                          ...extraVehicleChips,
                          ...folderShortcutChips,
                        ];

                        const available = allChips.filter(
                          s => s.getValue() !== null
                        );
                        if (available.length === 0) return null;

                        // Same order as the main RS (shared/rsChips.ts)
                        const orderedChips = orderRsChips(
                          available,
                          ((generalShortcuts as any[]) ?? []).map(
                            (s: any) => s.trigger as string
                          )
                        );

                        // Display rules — same as SheetDetail:
                        // Vn short (V1/V2/…): show label + rego; everything else: trigger label only
                        const shortcutFolderLabels = new Set(
                          ((generalShortcuts as any[]) ?? []).map((s: any) =>
                            (s.trigger as string).toUpperCase()
                          )
                        );
                        const TRIGGER_ONLY = new Set([
                          "TGT",
                          "HBF",
                          "HB",
                          "V1F",
                        ]);
                        const isVnShort = (lbl: string) => /^V\d+$/.test(lbl);
                        const isVnFull = (lbl: string) => /^V\d+F$/.test(lbl);
                        const isStandard = (lbl: string) =>
                          !isVnShort(lbl) &&
                          (shortcutFolderLabels.has(lbl) ||
                            TRIGGER_ONLY.has(lbl) ||
                            isVnFull(lbl));

                        return (
                          <div className="flex flex-wrap gap-1 md:gap-1.5">
                            {orderedChips.map(s => (
                              <button
                                key={s.label}
                                onClick={() => {
                                  const v = s.getValue();
                                  // "Own row": a new row with the
                                  // current time, the target's
                                  // surname first. No person
                                  // target (or offline): the text
                                  // goes in like any other chip.
                                  if (
                                    s.startsRow &&
                                    s.shortcutId !== undefined &&
                                    navigator.onLine &&
                                    rsSelectedSheetId
                                  ) {
                                    rsOwnRowShortcut.press(
                                      {
                                        sheetId: rsSelectedSheetId,
                                        shortcutId: s.shortcutId,
                                        label: s.label,
                                      },
                                      () => {
                                        if (v) appendText(v);
                                      }
                                    );
                                    return;
                                  }
                                  if (v) appendText(v);
                                }}
                                data-qe-chip={s.label}
                                className="cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                              >
                                {isVnShort(s.label)
                                  ? s.display
                                  : isStandard(s.label)
                                    ? s.label
                                    : s.display}
                              </button>
                            ))}
                            {/* Cease — last of the chips, as on the
                                            running sheet: the ceased row for
                                            everyone still on, only while there
                                            is something to cease. */}
                            {(user?.role === "member" ||
                              user?.role === "admin") &&
                              navigator.onLine &&
                              !!rsSelectedSheetId &&
                              (rsInlineRows?.length ?? 0) > 0 &&
                              !rsSurveillance?.ended && (
                                <CeaseRowButton
                                  sheetId={rsSelectedSheetId}
                                  chipClassName="cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 active:scale-95 transition-all select-none disabled:opacity-50 md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                  getPlace={() =>
                                    ceasePlaceFor(
                                      locateTargetFromPending({
                                        subject: rsTrackedTarget,
                                        arrivals: rsPendingArrivals ?? [],
                                        departures: rsPendingDepartures ?? [],
                                        walkIns: rsPendingWalkIns ?? [],
                                        headingTo: rsPendingHeadingTo ?? [],
                                        placements: rsPendingPlacements ?? [],
                                        extractNames: extractOccupantNames,
                                      }),
                                      rsInlineRows ?? []
                                    )
                                  }
                                  onChanged={() => {
                                    const sheetId = rsSelectedSheetId;
                                    void utils.row.list.invalidate({
                                      sheetId,
                                    });
                                    void utils.row.entityChips.invalidate({
                                      sheetId,
                                    });
                                    void utils.row.pendingVehicleDepartures.invalidate(
                                      { sheetId }
                                    );
                                    void utils.row.pendingVehicleArrivals.invalidate(
                                      { sheetId }
                                    );
                                    void utils.row.pendingWalkIns.invalidate({
                                      sheetId,
                                    });
                                    void utils.row.pendingHeadingTo.invalidate({
                                      sheetId,
                                    });
                                    void utils.row.pendingPlacements.invalidate(
                                      { sheetId }
                                    );
                                    void utils.row.surveillanceState.invalidate(
                                      { sheetId }
                                    );
                                  }}
                                  // The Last Entry banner below shows
                                  // the new row, where it can be edited.
                                  onOpenForTyping={() => {}}
                                />
                              )}
                          </div>
                        );
                      })()}
                      {/* Entity chips — quick-insert shortcuts mined from this sheet's own
                          observations (surname / short address / vehicle rego), shared
                          across every officer on the sheet via the server. */}
                      {rsEntityChips &&
                        rsEntityChips.length > 0 &&
                        (() => {
                          const appendText = (text: string) => {
                            pushInlineUndo(rsInlineText);
                            setRsInlineText(prev =>
                              prev ? `${prev} ${text}` : text
                            );
                            resetInlineTimer();
                            rsInlineInputRef.current?.focus();
                          };
                          return (
                            <div className="flex flex-wrap gap-1 md:gap-1.5">
                              {rsEntityChips.map(chip => (
                                <button
                                  key={chip.key}
                                  onClick={() => appendText(chip.insertValue)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                >
                                  <span className="font-mono normal-case">
                                    {chip.insertValue}
                                  </span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </div>
              )}
              {/* Address chips — full RS address and short street address */}
              {mapQeAddress &&
                (() => {
                  const appendText = (text: string) => {
                    pushInlineUndo(rsInlineText);
                    setRsInlineText(prev => (prev ? `${prev} ${text}` : text));
                    resetInlineTimer();
                    rsInlineInputRef.current?.focus();
                  };
                  // Extract short address from bracket code: e.g. "21 Olding Way, MELVILLE WA (21 OLDING WAY)" → "21 Olding Way"
                  const shortAddr = popupShortAddress(mapQeAddress);
                  return (
                    <div className="flex flex-col gap-1 md:gap-1.5">
                      <button
                        onClick={() => appendText(mapQeAddress)}
                        className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/30 bg-teal-500/5 text-teal-400 hover:bg-teal-500/15 active:scale-[0.98] transition-all md:px-3.5 md:py-2.5"
                      >
                        <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">
                          Full Address
                        </span>
                        <span className="text-[10px] md:text-sm font-mono leading-tight break-all">
                          {mapQeAddress}
                        </span>
                      </button>
                      <button
                        onClick={() => appendText(shortAddr)}
                        className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/20 bg-teal-500/5 text-teal-300 hover:bg-teal-500/10 active:scale-[0.98] transition-all md:px-3.5 md:py-2.5"
                      >
                        <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">
                          Short Address
                        </span>
                        <span className="text-[10px] md:text-sm font-mono leading-tight">
                          {shortAddr}
                        </span>
                      </button>
                    </div>
                  );
                })()}
              {/* Continuity cards — the same "Where now" cards the
                          running sheet shows (ContinuityCards), narrowed to
                          this address: vehicles known to be parked here
                          (plus one whose arrival is typed in the unsaved
                          observation), people inside or heading here, and
                          any vehicle that left somewhere with no arrival
                          logged yet. A tap adds the row straight away
                          (see onAction below) — it writes into the record. */}
              <QeAddressCard s={s} />
              {/* CIN picker — multi-select with TEAM */}
              {rosterCins.length > 0 && (
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  <button
                    onClick={() => {
                      const allSel = rosterCins.every(c => rsInlineCins.has(c));
                      const next = allSel
                        ? new Set<string>()
                        : new Set(rosterCins);
                      setRsInlineCins(next);
                      rsInlineCinsRef.current = next;
                      resetInlineTimer();
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 md:px-3.5 md:py-1.5 md:text-sm ${rosterCins.every(c => rsInlineCins.has(c)) ? "bg-amber-500/20 border-amber-500/60 text-amber-400" : "bg-muted/40 border-amber-500/30 text-amber-500/80 hover:bg-amber-500/10"}`}
                  >
                    TEAM
                  </button>
                  {rosterCins.map(cin => (
                    <button
                      key={cin}
                      onClick={() => {
                        const next = new Set(rsInlineCins);
                        if (next.has(cin)) {
                          next.delete(cin);
                        } else {
                          next.add(cin);
                        }
                        setRsInlineCins(next);
                        rsInlineCinsRef.current = next;
                        resetInlineTimer();
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 md:px-3.5 md:py-1.5 md:text-sm ${rsInlineCins.has(cin) ? "bg-primary/20 border-primary/60 text-primary" : "bg-muted/40 border-border text-foreground/80 hover:bg-muted/70 hover:text-foreground"}`}
                    >
                      {cin}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={submitInlineField}
                  disabled={rsAddingRow}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:gap-1.5"
                >
                  {rsAddingRow ? (
                    <Spinner className="h-3 w-3 md:h-4 md:w-4" />
                  ) : (
                    <Send className="h-3 w-3 md:h-4 md:w-4" />
                  )}
                  Submit
                </button>
              </div>
            </div>
          );
        })()}
    </>
  );
}
