/**
 * Shared logic for the inline "mention" autocomplete on running-sheet
 * observation textareas — typing a name suggests a matching person from
 * the Target/Associate Registry, typing a rego suggests a matching vehicle
 * from Intelligence. Used by both the full sheet table (SheetDetail.tsx)
 * and the map's RS Quick Entry popup (IntelligenceMapping.tsx), so the
 * trigger/suppression behaviour is identical on both surfaces.
 */

/** CSS properties that affect text layout/wrapping — copied onto the mirror
 * element getCaretPixelPosition uses to measure where the caret actually
 * falls, so a caret on a wrapped second line doesn't get reported at the
 * end of a single long line. */
const CARET_MIRROR_STYLE_PROPS: (keyof CSSStyleDeclaration)[] = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "wordBreak",
];

/** Pixel position of the caret within a <textarea>, relative to the
 * viewport — used to anchor the mention-suggestion dropdown right under
 * where the officer is typing rather than under the whole field. Standard
 * "mirror element" technique: render the same text in an identically-styled
 * hidden div, then read the offset of a marker span inserted at the caret. */
export function getCaretPixelPosition(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  const div = document.createElement("div");
  const computed = window.getComputedStyle(textarea);
  const style = div.style;
  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.overflowWrap = "break-word";
  for (const prop of CARET_MIRROR_STYLE_PROPS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (style as any)[prop] = computed[prop];
  }
  document.body.appendChild(div);
  div.textContent = textarea.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = textarea.value.slice(position) || ".";
  div.appendChild(span);

  const textareaRect = textarea.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();
  // The span holds ALL remaining text, which itself wraps across however
  // many lines are left — getBoundingClientRect() on it would return the
  // union of every wrapped fragment (so .left collapses to whichever
  // fragment starts furthest left, almost always the line-wrap position,
  // not the caret). getClientRects()[0] is just the first fragment, i.e.
  // exactly where the caret actually is.
  const spanRect = span.getClientRects()[0] ?? span.getBoundingClientRect();
  const lineHeight =
    parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
  const top =
    textareaRect.top +
    (spanRect.top - divRect.top) -
    textarea.scrollTop +
    lineHeight;
  const left =
    textareaRect.left + (spanRect.left - divRect.left) - textarea.scrollLeft;

  document.body.removeChild(div);
  return { top, left };
}

/**
 * Where a mention autocomplete should trigger: the officer is typing the
 * FIRST word of a capitalised name (e.g. "Basil" in "Basil CAT"), and that
 * word isn't already a bracket code used elsewhere in this sheet (already
 * an established person here — re-suggesting on every later bare mention,
 * e.g. typing "CAT" alone in a later row, would just be noise). Returns
 * null when none of that holds, in which case the caller shows no dropdown
 * and the officer just keeps typing normally.
 */
export function detectMentionTrigger(
  text: string,
  cursorPos: number,
  usedBracketCodes: Set<string>
): { word: string; wordStart: number } | null {
  const textBefore = text.slice(0, cursorPos);
  const wordMatch = textBefore.match(/([A-Za-z][A-Za-z'-]*)$/);
  if (!wordMatch) return null;
  const word = wordMatch[1];
  if (word.length < 2 || !/^[A-Z]/.test(word)) return null;
  const wordStart = cursorPos - word.length;
  const beforeWord = textBefore.slice(0, wordStart);
  // A capitalised word immediately before this one (single space between,
  // no intervening punctuation/newline) means this is the second+ word of
  // a name already being typed — the surname — not where the search fires.
  if (/[A-Z][A-Za-z'-]*\s$/.test(beforeWord)) return null;
  if (usedBracketCodes.has(word.toUpperCase())) return null;
  return { word, wordStart };
}

// A WA vehicle registration is the one reliable, unambiguous identifier for
// a vehicle — the description around it (colour, make, model) varies
// between officers ("grey" vs "silver", model guessed vs unknown), but the
// rego doesn't. So unlike the name trigger above, this fires on the rego
// itself rather than trying to recognise the start of a description: a
// token mixing letters and digits (a rego typed in full or mid-way through,
// e.g. "1FCC987" or "1FCC98") wherever it appears in the sentence — which
// naturally covers both "Vehicle 1FCC987 ..." and "...bearing WA
// registration 1FCC987 ..." phrasing, since the trigger doesn't care what
// precedes it.
export function detectVehicleMentionTrigger(
  text: string,
  cursorPos: number,
  usedVehicleRegos: Set<string>
): { word: string; wordStart: number } | null {
  const textBefore = text.slice(0, cursorPos);
  const wordMatch = textBefore.match(/([A-Za-z0-9][A-Za-z0-9-]*)$/);
  if (!wordMatch) return null;
  const word = wordMatch[1];
  if (word.length < 3 || word.length > 8) return null;
  if (!/[A-Za-z]/.test(word) || !/\d/.test(word)) return null;
  const wordStart = cursorPos - word.length;
  if (usedVehicleRegos.has(word.toUpperCase())) return null;
  return { word, wordStart };
}

export interface PersonMentionSuggestion {
  key: string;
  displayName: string;
  bracketCode: string;
  rowCount: number;
  targetId: number | null;
  associateId: number | null;
}

/** Bracket codes (person names, "(SURNAME)") already introduced somewhere
 * in a set of rows — feeds detectMentionTrigger's suppression above: a bare
 * re-mention of an already-linked person shouldn't keep re-triggering the
 * suggestion dropdown. */
export function computeUsedBracketCodes(
  rows: Array<{ observation?: string | null }>
): Set<string> {
  const codes = new Set<string>();
  const bracketRe = /\(([A-Z][A-Za-z'.\s-]{0,39})\)/g;
  for (const r of rows) {
    if (!r.observation) continue;
    let m: RegExpExecArray | null;
    bracketRe.lastIndex = 0;
    while ((m = bracketRe.exec(r.observation)) !== null) {
      codes.add(m[1].trim().toUpperCase());
    }
  }
  return codes;
}

/** Vehicle regos ("(1FCC987)") already introduced somewhere in a set of
 * rows — same idea as computeUsedBracketCodes, for detectVehicleMention
 * Trigger's suppression. */
export function computeUsedVehicleRegos(
  rows: Array<{ observation?: string | null }>
): Set<string> {
  const regos = new Set<string>();
  const regoRe = /\(([0-9][A-Za-z0-9]{2,7})\)/g;
  for (const r of rows) {
    if (!r.observation) continue;
    let m: RegExpExecArray | null;
    regoRe.lastIndex = 0;
    while ((m = regoRe.exec(r.observation)) !== null) {
      regos.add(m[1].trim().toUpperCase());
    }
  }
  return regos;
}
