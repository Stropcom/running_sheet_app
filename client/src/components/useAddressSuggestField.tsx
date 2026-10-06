/**
 * Address / place suggestions for an observation textarea whose text lives in
 * the caller's own state (the map's RS Quick Entry box). Same behaviour as the
 * running sheet's cell: type a street number and the start of a street for
 * known addresses (then Google), or "@" and a name for a place or business.
 * The caller feeds it text changes and key presses, and renders `element`.
 */
import { useRef, useState } from "react";
import { getCaretPixelPosition } from "@/lib/mentionAutocomplete";
import {
  detectAddressSuggestTrigger,
  detectPlaceSuggestTrigger,
} from "@shared/addressSuggestTrigger";
import {
  AddressSuggestDropdown,
  addressSuggestInsertText,
  useAddressSuggestions,
  type AddressSuggestItem,
  type AddressSuggestMode,
} from "@/components/AddressSuggestDropdown";

export function useAddressSuggestField() {
  const [word, setWord] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<AddressSuggestMode>("address");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggest = useAddressSuggestions(query, mode);
  const items = word ? suggest.items : [];
  const open =
    !!word && !!anchor && (items.length > 0 || suggest.offlineNoKnown);

  function close() {
    setWord(null);
    setAnchor(null);
    setQuery("");
    setActiveIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }

  /** Call on every text change. Returns true when an address or place
   * trigger is active, so the caller can skip its other (name/rego) triggers
   * — those would otherwise also fire on a capitalised street word. */
  function onText(
    text: string,
    cursorPos: number,
    textarea: HTMLTextAreaElement
  ): boolean {
    const place = detectPlaceSuggestTrigger(text, cursorPos);
    const addr = place ?? detectAddressSuggestTrigger(text, cursorPos);
    if (!addr) {
      close();
      return false;
    }
    setMode(place ? "place" : "address");
    setWord({ text: addr.text, start: addr.start, end: cursorPos });
    setActiveIndex(0);
    setAnchor(getCaretPixelPosition(textarea, cursorPos));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(addr.text), 150);
    return true;
  }

  /** Replaces the typed fragment with the chosen address. `apply` receives a
   * function over the current text (so a slow Google lookup does not clobber
   * newer typing) and the new caret position. */
  async function pick(
    item: AddressSuggestItem,
    apply: (fn: (prev: string) => string, caret: number) => void
  ) {
    if (!word) return;
    const { start, end } = word;
    suggest.endSession();
    close();
    const insert = await addressSuggestInsertText(item);
    apply(
      prev => prev.slice(0, start) + insert + prev.slice(end),
      start + insert.length
    );
  }

  /** Call from onKeyDown; true when the key was used by the list. */
  function onKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    apply: (fn: (prev: string) => string, caret: number) => void
  ): boolean {
    if (!open || items.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % items.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + items.length) % items.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      void pick(items[Math.min(activeIndex, items.length - 1)], apply);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }
    return false;
  }

  function element(
    apply: (fn: (prev: string) => string, caret: number) => void
  ) {
    if (!open || !anchor) return null;
    return (
      <AddressSuggestDropdown
        anchor={anchor}
        items={items}
        source={suggest.source}
        offlineNoKnown={suggest.offlineNoKnown}
        mode={mode}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        onPick={item => void pick(item, apply)}
      />
    );
  }

  return { onText, onKeyDown, close, element };
}
