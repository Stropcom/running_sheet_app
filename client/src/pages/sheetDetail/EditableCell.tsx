import { trpc } from "@/lib/trpc";
import {
  AddressSuggestDropdown,
  addressSuggestInsertText,
  useAddressSuggestions,
  type AddressSuggestItem,
  type AddressSuggestMode,
} from "@/components/AddressSuggestDropdown";
import {
  detectAddressSuggestTrigger,
  detectPlaceSuggestTrigger,
} from "@shared/addressSuggestTrigger";
import {
  justTypedSpaceAfterBracket,
  tidyObservation,
  tidyObservationAtCaret,
} from "@shared/observationTidy";
import { wholeSentenceChips } from "@shared/sentenceJoin";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { detectUnidentifiedRepeat } from "@shared/unidentified";
import { User, Car } from "lucide-react";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useObservationFocus } from "@/contexts/ObservationFocusContext";
import { useIsTouchDevice } from "../intelligenceMapping/deviceHooks";
import { useObservationKeyboard } from "@/contexts/ObservationKeyboardContext";
import {
  convertGoogleAddresses,
  formatIntelVehicle,
  expandIntelVehicleToFullForm,
} from "@/lib/addressFormat";
import {
  getCaretPixelPosition,
  detectMentionTrigger,
  detectVehicleMentionTrigger,
  detectAddressSpaceCompletion,
  detectPersonNameSpaceCompletion,
  type PersonMentionSuggestion,
} from "@/lib/mentionAutocomplete";

// ─── Editable Cell ────────────────────────────────────────────────────────────

export function EditableCell({
  value,
  locked,
  multiline,
  placeholder,
  onSave,
  shortcuts,
  usedBracketCodes,
  usedVehicleRegos,
  usedAddressLabels,
  rowId,
  autoEdit,
  autoEditKeyboard,
  onAutoEdited,
}: {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  value: string | null;
  locked: boolean;
  multiline?: boolean;
  placeholder?: string;
  onSave: (val: string) => void;
  shortcuts?: Record<string, string>;
  /** Bracket codes already used elsewhere in this sheet — enables the
   * inline name-mention autocomplete when provided (multiline only). */
  usedBracketCodes?: Set<string>;
  /** Vehicle regos already used elsewhere in this sheet — enables the
   * inline vehicle-mention autocomplete when provided (multiline only). */
  usedVehicleRegos?: Set<string>;
  /** Address labels already used elsewhere in this sheet — enables the
   * deterministic address-bracket auto-insert (multiline only). */
  usedAddressLabels?: Set<string>;
  /** This cell's row id — tagged onto the textarea so the continuity cards
   * can tell which saved row an open edit replaces. */
  rowId?: number;
  /** Open this cell for editing as soon as it appears (a continuity card has
   * just created the row), so the next tap adds to it as the next paragraph.
   * Opened without the on-screen keyboard until the officer taps into it. */
  autoEdit?: boolean;
  /** With autoEdit: keep the on-screen keyboard (the officer is about to type
   * the rest of the text) and put the caret at the end. */
  autoEditKeyboard?: boolean;
  onAutoEdited?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // The shortcut chips that are whole sentences — the tidy-up puts a full stop
  // between two of them (shared/sentenceJoin.ts).
  const sentenceChips = useMemo(
    () => wholeSentenceChips(Object.values(shortcuts ?? {})),
    [shortcuts]
  );
  // Opened by a card tap: focus it without raising the on-screen keyboard
  // (inputMode "none") until the officer actually taps into the text.
  const [noKeyboard, setNoKeyboard] = useState(false);
  // Phone / tablet (no physical keyboard): an observation opens without the
  // on-screen keyboard, so the chips and the row stay in view while chips are
  // tapped; the keyboard icon in the sheet's toolbar switches the keyboard on
  // and off (ObservationKeyboardContext). Tapping in the text does nothing
  // special. Laptop / desktop always type straight away.
  const isTouch = useIsTouchDevice();
  const {
    keyboardOn,
    resetKeyboard,
    setKeyboardApplier,
    clearKeyboardApplier,
  } = useObservationKeyboard();
  // No keyboard for this field: on a touch device while the icon is off; on a
  // laptop only for the cell a card opened (it types once clicked).
  const keyboardBlocked = isTouch ? !keyboardOn : noKeyboard;
  // True for the instant the field is blurred and re-focused to raise the
  // keyboard, so that is not mistaken for the officer leaving the cell.
  const refocusingRef = useRef(false);
  // The keyboard icon was tapped while this cell is open: blur and focus the
  // field again with the new input mode (in the tap, as a browser requires),
  // keeping the caret. The re-focus is not mistaken for leaving the cell.
  const applyKeyboard = useRef((on: boolean) => {
    const el = textareaRef.current;
    if (!el) return;
    const from = el.selectionStart ?? el.value.length;
    const to = el.selectionEnd ?? from;
    refocusingRef.current = true;
    el.inputMode = on ? "" : "none";
    el.blur();
    el.focus();
    el.setSelectionRange(from, to);
    refocusingRef.current = false;
  }).current;
  useEffect(() => () => clearKeyboardApplier(applyKeyboard), []);
  // The caret goes to the end of the text when the cell opens by itself.
  const [caretToEnd, setCaretToEnd] = useState(false);
  useEffect(() => {
    if (autoEdit && !locked && multiline) {
      // Touch: the keyboard icon decides. Laptop / desktop keep what the
      // caller asked for.
      setNoKeyboard(isTouch ? false : !autoEditKeyboard);
      setCaretToEnd(true);
      setEditing(true);
      onAutoEdited?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);
  const [draft, setDraft] = useState(value ?? "");
  const { notifyObservationFocus, notifyObservationBlur } =
    useObservationFocus();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Inline mention autocomplete ─────────────────────────────────────────
  const [mentionWord, setMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const { data: mentionResults } =
    trpc.intelligence.searchPersonMentions.useQuery(
      { query: mentionQuery },
      { enabled: mentionQuery.trim().length >= 2 }
    );
  const mentionSuggestions: PersonMentionSuggestion[] =
    mentionQuery.trim().length >= 2 ? (mentionResults ?? []) : [];
  // Picking a suggestion here is at least as deliberate a confirmation as
  // clicking "Yes" on the save-time TargetMatchDialog prompt — recording
  // the same decision immediately means that prompt doesn't fire again for
  // a person the officer just identified by name.
  const confirmPersonMatch =
    trpc.intelligence.confirmPersonNameMatch.useMutation();

  function closeMentionDropdown() {
    setMentionWord(null);
    setMentionAnchor(null);
    setMentionQuery("");
    setMentionActiveIndex(0);
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
  }

  // ── Inline vehicle-mention autocomplete ─────────────────────────────────
  // Mirrors the person-mention block above, but triggers on a rego-shaped
  // token instead of a capitalised name (see detectVehicleMentionTrigger),
  // and searches the same Intelligence entity index the Target Registry's
  // vehicle autocomplete already uses (trpc.intelligence.searchEntities).
  const [vehicleMentionWord, setVehicleMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [vehicleMentionAnchor, setVehicleMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [vehicleMentionActiveIndex, setVehicleMentionActiveIndex] = useState(0);
  const vehicleMentionDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [vehicleMentionQuery, setVehicleMentionQuery] = useState("");
  const { data: vehicleMentionResults } =
    trpc.intelligence.searchEntities.useQuery(
      { type: "vehicle", query: vehicleMentionQuery, excludeTargets: false },
      { enabled: vehicleMentionQuery.trim().length >= 2 }
    );
  const vehicleMentionSuggestions = (
    vehicleMentionQuery.trim().length >= 2 ? (vehicleMentionResults ?? []) : []
  ) as { key: string; label: string; rowCount: number }[];

  function closeVehicleMentionDropdown() {
    setVehicleMentionWord(null);
    setVehicleMentionAnchor(null);
    setVehicleMentionQuery("");
    setVehicleMentionActiveIndex(0);
    if (vehicleMentionDebounceRef.current)
      clearTimeout(vehicleMentionDebounceRef.current);
  }

  // ── Inline address suggestions ──────────────────────────────────────────
  // Typing a street number + the start of a street ("13 Den") lists known
  // addresses; once none are known, Google addresses (see
  // AddressSuggestDropdown). Takes precedence over the name trigger, which
  // would otherwise also fire on the capitalised street word.
  const [addressWord, setAddressWord] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [addressAnchor, setAddressAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [addressActiveIndex, setAddressActiveIndex] = useState(0);
  const [addressQuery, setAddressQuery] = useState("");
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addressMode, setAddressMode] = useState<AddressSuggestMode>("address");
  const addressSuggest = useAddressSuggestions(addressQuery, addressMode);
  const addressItems = addressWord ? addressSuggest.items : [];
  const addressOpen =
    !!addressWord &&
    !!addressAnchor &&
    (addressItems.length > 0 || addressSuggest.offlineNoKnown);

  // While the list is open, keep it glued under the caret as the row or page
  // scrolls and as the on-screen keyboard resizes the visible area.
  useEffect(() => {
    if (!addressOpen) return;
    let raf = 0;
    const update = () => {
      const t = textareaRef.current;
      if (!t) return;
      setAddressAnchor(
        getCaretPixelPosition(t, t.selectionStart ?? t.value.length)
      );
    };
    // Deferred two frames: when the keyboard opens or the visible area pans,
    // the app shell (DashboardLayout's setVh) re-positions itself in its own
    // viewport listener, which runs after this one — measuring straight away
    // reads the caret from the old layout and leaves the list misplaced.
    const refresh = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(update);
      });
    };
    window.addEventListener("scroll", refresh, true);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", refresh, true);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [addressOpen]);

  function closeAddressDropdown() {
    setAddressWord(null);
    setAddressAnchor(null);
    setAddressQuery("");
    setAddressActiveIndex(0);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
  }

  async function selectAddressSuggestion(
    item: AddressSuggestItem,
    textarea: HTMLTextAreaElement
  ) {
    if (!addressWord) return;
    const { start, end } = addressWord;
    addressSuggest.endSession();
    closeAddressDropdown();
    const insertText = await addressSuggestInsertText(item);
    // A Google business needs a moment to resolve its street address, so
    // splice into whatever the draft is by then rather than a stale copy.
    setDraft(d => d.slice(0, start) + insertText + d.slice(end));
    const newPos = start + insertText.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function handleObservationInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    let val = e.target.value;
    let cursorPos = e.target.selectionStart ?? val.length;
    // A space typed right after a bracket tidies what has been typed so far:
    // vehicle lists, one space between words, capitals, a space after commas
    // (shared/observationTidy.ts). The closing full stop waits for the end.
    if (justTypedSpaceAfterBracket(val, cursorPos)) {
      const joined = tidyObservationAtCaret(val, cursorPos, false, {
        sentenceChips,
      });
      if (joined.changed) {
        val = joined.text;
        cursorPos = joined.caret;
        const ta = e.target;
        const caret = joined.caret;
        requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
      }
    }
    setDraft(val);

    if (usedVehicleRegos) {
      const vehicleTrigger = detectVehicleMentionTrigger(
        val,
        cursorPos,
        usedVehicleRegos
      );
      if (vehicleTrigger) {
        closeMentionDropdown();
        setVehicleMentionWord({
          word: vehicleTrigger.word,
          wordStart: vehicleTrigger.wordStart,
          wordEnd: cursorPos,
        });
        setVehicleMentionActiveIndex(0);
        setVehicleMentionAnchor(getCaretPixelPosition(e.target, cursorPos));
        if (vehicleMentionDebounceRef.current)
          clearTimeout(vehicleMentionDebounceRef.current);
        vehicleMentionDebounceRef.current = setTimeout(() => {
          setVehicleMentionQuery(vehicleTrigger.word);
        }, 250);
        return;
      }
      closeVehicleMentionDropdown();
    }

    if (usedAddressLabels) {
      // "@" asks for a place/business by name; otherwise a street number
      // plus the start of a street asks for an address.
      const placeTrigger = detectPlaceSuggestTrigger(val, cursorPos);
      const addrTrigger =
        placeTrigger ?? detectAddressSuggestTrigger(val, cursorPos);
      if (addrTrigger) {
        closeMentionDropdown();
        setAddressMode(placeTrigger ? "place" : "address");
        setAddressWord({
          text: addrTrigger.text,
          start: addrTrigger.start,
          end: cursorPos,
        });
        setAddressActiveIndex(0);
        setAddressAnchor(getCaretPixelPosition(e.target, cursorPos));
        if (addressDebounceRef.current)
          clearTimeout(addressDebounceRef.current);
        addressDebounceRef.current = setTimeout(() => {
          setAddressQuery(addrTrigger.text);
        }, 150);
        return;
      }
      closeAddressDropdown();
    }

    if (!usedBracketCodes) return;
    const trigger = detectMentionTrigger(val, cursorPos, usedBracketCodes);
    if (!trigger) {
      closeMentionDropdown();
      return;
    }
    setMentionWord({
      word: trigger.word,
      wordStart: trigger.wordStart,
      wordEnd: cursorPos,
    });
    setMentionActiveIndex(0);
    setMentionAnchor(getCaretPixelPosition(e.target, cursorPos));
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    mentionDebounceRef.current = setTimeout(() => {
      setMentionQuery(trigger.word);
    }, 250);
  }

  function selectMentionSuggestion(
    s: PersonMentionSuggestion,
    textarea: HTMLTextAreaElement
  ) {
    if (!mentionWord) return;
    const insertText = `${s.displayName} (${s.bracketCode})`;
    const newDraft =
      draft.slice(0, mentionWord.wordStart) +
      insertText +
      draft.slice(mentionWord.wordEnd);
    setDraft(newDraft);
    if (s.targetId != null || s.associateId != null) {
      confirmPersonMatch.mutate({
        spelling: s.bracketCode,
        targetId: s.targetId ?? undefined,
        associateId: s.associateId ?? undefined,
        correctSpelling: s.bracketCode,
      });
    }
    closeMentionDropdown();
    const newPos = mentionWord.wordStart + insertText.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function selectVehicleMentionSuggestion(
    s: { key: string; label: string; rowCount: number },
    textarea: HTMLTextAreaElement
  ) {
    if (!vehicleMentionWord) return;
    // s.label is the rego (Intelligence's stored short-form for a vehicle);
    // expand it back to the full RS narrative convention, same as picking a
    // vehicle in the Target Registry's autocomplete does.
    const insertText = expandIntelVehicleToFullForm(s.label);
    const newDraft =
      draft.slice(0, vehicleMentionWord.wordStart) +
      insertText +
      draft.slice(vehicleMentionWord.wordEnd);
    setDraft(newDraft);
    closeVehicleMentionDropdown();
    const newPos = vehicleMentionWord.wordStart + insertText.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  // Sync draft with incoming value prop whenever the cell is not being edited.
  // This ensures that after an external update (e.g. TV auto-fill saving new text),
  // clicking into the cell shows the newly saved content rather than the stale draft.
  useEffect(() => {
    if (!editing) {
      setDraft(value ?? "");
    }
  }, [value, editing]);

  const commit = (finalDraft?: string) => {
    const val = finalDraft !== undefined ? finalDraft : draft;
    // Always call onSave for TV trigger (so it fires even if value hasn't changed)
    if (val !== (value ?? "") || val.trim().toLowerCase() === "tv") onSave(val);
    setEditing(false);
  };

  /** Auto-expand shortcut triggers on Space or Tab, or — on Space only —
   * deterministically complete a fresh vehicle registration, street
   * address, or person's name into its bracket the instant it's typed.
   * Unlike the registry search dropdowns above (which can only suggest an
   * entity already known to Intelligence), these work for something
   * that's never been seen before — exactly the first-sighting case an
   * officer is describing from scratch. */
  const handleShortcutKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key !== " " && e.key !== "Tab") return;
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart ?? 0;
    const textBefore = draft.slice(0, pos);

    // An unidentified person already introduced in full ("unidentified male
    // (UM1)" written earlier) is only ever referred to by the short name:
    // finishing the full wording again becomes "UM1".
    if (e.key === " " && usedBracketCodes) {
      const repeat = detectUnidentifiedRepeat(draft, pos, usedBracketCodes);
      if (repeat) {
        e.preventDefault();
        const newText = `${draft.slice(0, repeat.start)}${repeat.code} ${draft.slice(pos)}`;
        setDraft(newText);
        requestAnimationFrame(() => {
          const newPos = repeat.start + repeat.code.length + 1;
          textarea.setSelectionRange(newPos, newPos);
        });
        return;
      }
    }

    if (shortcuts) {
      // Find the last word before the cursor
      const match = textBefore.match(/(\S+)$/);
      if (match) {
        const word = match[1].toLowerCase();
        const expansion = shortcuts[word];
        if (expansion) {
          e.preventDefault();
          const before = textBefore.slice(
            0,
            textBefore.length - match[1].length
          );
          const after = draft.slice(pos);
          const newText = before + expansion + " " + after;
          setDraft(newText);
          // Restore cursor position after the expansion
          requestAnimationFrame(() => {
            const newPos = before.length + expansion.length + 1;
            textarea.setSelectionRange(newPos, newPos);
          });
          return;
        }
      }
    }

    if (e.key !== " ") return;

    // Reuses the same "does this look like a rego" rule the live
    // registry-search dropdown uses (see detectVehicleMentionTrigger), so
    // a word never triggers one behaviour but not the other. Already
    // bracket-introduced regos are skipped too — a later bare re-mention
    // of the same vehicle shouldn't get a second bracket, matching the
    // running sheet's own "introduce once, refer to bare after" convention.
    const vehicleTrigger = usedVehicleRegos
      ? detectVehicleMentionTrigger(draft, pos, usedVehicleRegos)
      : null;
    if (vehicleTrigger) {
      e.preventDefault();
      const { word, wordStart } = vehicleTrigger;
      const before = draft.slice(0, wordStart);
      const after = draft.slice(pos);
      const bracket = `(Vehicle ${word.toUpperCase()})`;
      const newText = `${before}${word} ${bracket} ${after}`;
      // The bracket is now complete and followed by a space — tidy what has
      // been typed so far (a vehicle listed straight after another gets
      // "and" / a comma and its "a" / "an").
      const joined = tidyObservationAtCaret(
        newText,
        before.length + word.length + 1 + bracket.length + 1,
        false,
        { sentenceChips }
      );
      setDraft(joined.text);
      closeVehicleMentionDropdown();
      requestAnimationFrame(() => {
        textarea.setSelectionRange(joined.caret, joined.caret);
      });
      return;
    }

    // Same idea, for a street address completed by its suburb + state
    // (see detectAddressSpaceCompletion) — "(44 Elvira Street)".
    const addressTrigger = usedAddressLabels
      ? detectAddressSpaceCompletion(draft, pos, usedAddressLabels)
      : null;
    if (addressTrigger) {
      e.preventDefault();
      const bracket = `(${addressTrigger.addressLabel})`;
      const before = draft.slice(0, pos);
      const after = draft.slice(pos);
      const newText = `${before} ${bracket} ${after}`;
      setDraft(newText);
      requestAnimationFrame(() => {
        const newPos = before.length + 1 + bracket.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      });
      return;
    }

    // Same idea, for a fresh person's name completed by its ALL-CAPS
    // surname (see detectPersonNameSpaceCompletion) — "(SURNAME)".
    const personTrigger = usedBracketCodes
      ? detectPersonNameSpaceCompletion(draft, pos, usedBracketCodes)
      : null;
    if (personTrigger) {
      e.preventDefault();
      const bracket = `(${personTrigger.surname.toUpperCase()})`;
      const before = draft.slice(0, pos);
      const after = draft.slice(pos);
      const newText = `${before} ${bracket} ${after}`;
      setDraft(newText);
      closeMentionDropdown();
      requestAnimationFrame(() => {
        const newPos = before.length + 1 + bracket.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      });
    }
  };

  if (locked) {
    return (
      <span className="text-sm text-muted-foreground whitespace-pre-wrap">
        {value || <span className="italic opacity-40">{placeholder}</span>}
      </span>
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <>
          <Textarea
            ref={textareaRef}
            autoFocus
            data-obs-cell="true"
            data-row-id={rowId}
            inputMode={keyboardBlocked ? "none" : undefined}
            // Laptop / desktop, a cell a card opened: clicking into the text is
            // the officer choosing to type, so the keyboard is allowed again.
            // (A touch device never gets here: its keyboard icon decides.) The
            // field is already focused (without a keyboard), and a browser only
            // raises the keyboard on a fresh focus, so it is blurred and focused
            // again — the same way the Map's Quick Entry does it.
            onClick={e => {
              if (isTouch || !noKeyboard) return;
              const el = e.currentTarget;
              const from = el.selectionStart ?? el.value.length;
              const to = el.selectionEnd ?? from;
              setNoKeyboard(false);
              requestAnimationFrame(() => {
                refocusingRef.current = true;
                el.inputMode = "";
                el.blur();
                el.focus();
                el.setSelectionRange(from, to);
                refocusingRef.current = false;
              });
            }}
            onFocus={e => {
              if (refocusingRef.current) return;
              if (isTouch) setKeyboardApplier(applyKeyboard);
              notifyObservationFocus();
              // A cell opened by a card tap (or opened by itself on a new first
              // row) starts with the caret at the end, ready for the next
              // paragraph.
              if (noKeyboard || caretToEnd) {
                const len = e.currentTarget.value.length;
                e.currentTarget.setSelectionRange(len, len);
                setCaretToEnd(false);
              }
            }}
            value={draft}
            onChange={handleObservationInput}
            onPaste={e => {
              // Auto-convert Google Maps addresses pasted into the observation field
              const pasted = e.clipboardData.getData("text");
              const converted = convertGoogleAddresses(pasted);
              if (converted !== pasted) {
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart ?? draft.length;
                const end = ta.selectionEnd ?? draft.length;
                const newText =
                  draft.slice(0, start) + converted + draft.slice(end);
                setDraft(newText);
              }
            }}
            onBlur={() => {
              if (refocusingRef.current) return;
              clearKeyboardApplier(applyKeyboard);
              // The row closed: the keyboard goes back to off (touch devices).
              if (isTouch) resetKeyboard();
              // A click on a suggestion fires its own onMouseDown (which
              // preventDefault's) before this blur — so by the time blur
              // actually runs here, mentionWord is only still set if focus
              // left for some other reason, in which case the dropdown
              // should just close rather than block the save.
              closeMentionDropdown();
              closeVehicleMentionDropdown();
              closeAddressDropdown();
              notifyObservationBlur();
              // Leaving the field tidies the observation the officer typed:
              // Google addresses to RS format, then the tidy-up pass (vehicle
              // lists, spaces, capitals, closing full stop). A cell opened and
              // left without any change is never touched, so rows made by the
              // chips or the Target Logger stay exactly as they were.
              const edited = draft !== (value ?? "");
              const converted = convertGoogleAddresses(draft);
              const conv = edited
                ? tidyObservation(converted, true, { sentenceChips })
                : converted;
              if (conv !== draft) {
                setDraft(conv);
                commit(conv);
              } else {
                commit(draft);
              }
            }}
            onKeyDown={e => {
              if (addressOpen && addressItems.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAddressActiveIndex(i => (i + 1) % addressItems.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAddressActiveIndex(
                    i => (i - 1 + addressItems.length) % addressItems.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectAddressSuggestion(
                    addressItems[
                      Math.min(addressActiveIndex, addressItems.length - 1)
                    ],
                    e.currentTarget
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeAddressDropdown();
                  return;
                }
              }
              if (vehicleMentionWord && vehicleMentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setVehicleMentionActiveIndex(
                    i => (i + 1) % vehicleMentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setVehicleMentionActiveIndex(
                    i =>
                      (i - 1 + vehicleMentionSuggestions.length) %
                      vehicleMentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectVehicleMentionSuggestion(
                    vehicleMentionSuggestions[vehicleMentionActiveIndex],
                    e.currentTarget
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeVehicleMentionDropdown();
                  return;
                }
              }
              if (mentionWord && mentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionActiveIndex(
                    i => (i + 1) % mentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionActiveIndex(
                    i =>
                      (i - 1 + mentionSuggestions.length) %
                      mentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectMentionSuggestion(
                    mentionSuggestions[mentionActiveIndex],
                    e.currentTarget
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeMentionDropdown();
                  return;
                }
              }
              handleShortcutKeyDown(
                e as React.KeyboardEvent<HTMLTextAreaElement>
              );
              if (e.key === "Escape") {
                setDraft(value ?? "");
                setEditing(false);
              }
            }}
            className="text-sm min-h-[60px] resize-none"
            placeholder={placeholder}
          />
          {addressOpen && addressAnchor && (
            <AddressSuggestDropdown
              anchor={addressAnchor}
              items={addressItems}
              source={addressSuggest.source}
              offlineNoKnown={addressSuggest.offlineNoKnown}
              mode={addressMode}
              activeIndex={addressActiveIndex}
              onActiveIndexChange={setAddressActiveIndex}
              onPick={item => {
                if (textareaRef.current)
                  selectAddressSuggestion(item, textareaRef.current);
              }}
            />
          )}
          {mentionWord && mentionAnchor && mentionSuggestions.length > 0 && (
            <div
              className="fixed z-50 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
              style={{
                top: mentionAnchor.top,
                left: mentionAnchor.left,
                maxHeight: "220px",
                overflowY: "auto",
              }}
            >
              {mentionSuggestions.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                    i === mentionActiveIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  onMouseEnter={() => setMentionActiveIndex(i)}
                  onMouseDown={e => {
                    // mousedown fires before the textarea's blur, so this
                    // beats the onBlur close/save above.
                    e.preventDefault();
                    if (textareaRef.current)
                      selectMentionSuggestion(s, textareaRef.current);
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
          {vehicleMentionWord &&
            vehicleMentionAnchor &&
            vehicleMentionSuggestions.length > 0 && (
              <div
                className="fixed z-50 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                style={{
                  top: vehicleMentionAnchor.top,
                  left: vehicleMentionAnchor.left,
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                {vehicleMentionSuggestions.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                      i === vehicleMentionActiveIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                    onMouseEnter={() => setVehicleMentionActiveIndex(i)}
                    onMouseDown={e => {
                      // mousedown fires before the textarea's blur, so this
                      // beats the onBlur close/save above.
                      e.preventDefault();
                      if (textareaRef.current)
                        selectVehicleMentionSuggestion(s, textareaRef.current);
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
        </>
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className="h-8 text-sm"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      className="text-sm cursor-text hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 min-h-[1.75rem] transition-colors whitespace-pre-wrap"
      onClick={() => {
        // Touch: open the observation with the caret at the end; whether the
        // keyboard comes up is the toolbar's keyboard icon (see isTouch above).
        if (multiline && isTouch) setCaretToEnd(true);
        setEditing(true);
      }}
    >
      {value || (
        <span className="text-muted-foreground italic text-xs">
          {placeholder}
        </span>
      )}
    </div>
  );
}

// ── ShortcutChip — a quick-insert chip in the target / shortcuts panel ──────
// Fixed in place: the order comes from the Shortcuts page (see
// shared/rsChips.ts), so there is nothing to drag.
export function ShortcutChip({
  label,
  value,
  showValue,
  onInsert,
}: {
  label: string;
  value?: string | null;
  showValue: boolean;
  onInsert: () => void;
}) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onInsert}
      title={`Insert: ${value}`}
      className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/8 hover:bg-primary/15 active:scale-95 transition-all select-none cursor-pointer"
    >
      <span className="text-xs font-bold text-primary uppercase tracking-wide">
        {label}
      </span>
      {showValue && value && (
        <span className="text-xs font-mono text-foreground/80 max-w-[160px] truncate">
          {value}
        </span>
      )}
    </button>
  );
}
