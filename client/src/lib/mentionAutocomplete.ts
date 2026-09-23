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
// Same exclusion extractEntitiesFromText (server/db.ts) applies when
// classifying a bracketed shortForm — kept in sync manually, same
// convention as STREET_TYPE_WORDS below. UM1/UF1/YC1/UCO1-style
// unidentified-male/female, young-child, and undercover-operative
// placeholders are short letter+digit tokens ("UM1" is 3 chars, mixes
// letters and a digit) that otherwise satisfy this trigger's own "looks
// like a rego" shape below, wrongly auto-bracketing a re-mention like
// "Um1 " as "(Vehicle UM1)" — confirmed on a real running sheet, where
// that literal "(Vehicle ...)" bracket then also defeats the server's own
// UM/UF/YC/UCO safeguard (which only catches a BARE "(UM1)" code, not one
// that already says "Vehicle" inside the parens), corrupting the
// Intelligence Folder with a phantom "UM1" vehicle entity.
const NON_VEHICLE_PLACEHOLDER_CODE_RE = /^(?:U[MF]|YC|UCO)\d+$/i;

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
  if (NON_VEHICLE_PLACEHOLDER_CODE_RE.test(word)) return null;
  const wordStart = cursorPos - word.length;
  if (usedVehicleRegos.has(word.toUpperCase())) return null;
  return { word, wordStart };
}

// Same list extractEntitiesFromText (server/db.ts) uses at save time for the
// equivalent classification — kept in sync manually since this is a much
// narrower, live-typing-only check (just the common "<number> <Street>,
// <Suburb> <STATE>" shape, not every edge case the full extractor also
// handles: cnr/lot addresses, terminals, Google-formatted postcodes, ...).
const STREET_TYPE_WORDS =
  "st|street|rd|road|ave|avenue|dr|drive|way|ct|court|pl|place|cl|close|cres|crescent|blvd|boulevard|hwy|highway|fwy|freeway|ln|lane|tce|terrace|pde|parade|cct|circuit|gr|grove|rise|loop|link|walk|track|row|mews|quay|esplanade|promenade";
const AU_STATE_CODES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";
// Segment lengths are capped rather than left open-ended (`*`) so a long
// observation can't make this match run away and grab text from much
// earlier in the sentence than the address actually starts at.
// Group 1 — optional business/place name prefix (e.g. "Blend Cafe, "),
// same shape as GOOGLE_ADDRESS_RE's own businessPrefix group in
// client/src/lib/addressFormat.ts, kept in sync manually so a business
// address gets the same bracket whether it's completed live by this
// space-bar trigger or converted on paste/blur by that function. Group 2
// — the street portion, used as the bracket instead when there's no
// business name.
const ADDRESS_SPACE_COMPLETION_RE = new RegExp(
  `((?:[^,\\d\\n][^,\\n]*,\\s*)?)` +
    `([0-9]{1,5}[A-Za-z]?\\s+[A-Za-z][A-Za-z'\\s]{0,40}?\\b(?:${STREET_TYPE_WORDS}))\\b,\\s*[A-Za-z][A-Za-z'\\s]{0,40}?\\s+(?:${AU_STATE_CODES})$`,
  "i"
);

// Same street-portion shape as above, but for a suburb typed with no state
// code at all ("44 Elvira Street, PALMYRA " rather than "...PALMYRA WA ").
// Without the state code there's no longer an unambiguous "the address is
// definitely finished" marker to anchor on — a state abbreviation never
// occurs in ordinary prose, but an ordinary capitalised word does, so this
// can't safely fire on every space after any old capitalised word the way
// the state-anchored version can. The suburb being typed fully in capitals
// (this app's own convention for every suburb, visible throughout the
// existing training/test fixtures) stands in as that same kind of
// deliberate, non-ordinary-prose signal detectPersonNameSpaceCompletion
// already leans on for an ALL-CAPS surname below — checked as an exact
// case comparison after matching, not via the regex's own "i" flag, so a
// Title Case suburb (still mid-sentence, not a deliberate ALL-CAPS suburb
// entry) doesn't false-trigger.
// Matches only a single trailing word (see the regex itself), but that
// alone doesn't stop it firing on just the FIRST word of a genuine
// multi-word suburb typed with no state ("MOUNT PLEASANT", "EAST
// FREMANTLE") — there's no marker distinguishing "MOUNT" the whole suburb
// from "MOUNT" the first half of one, until the second word arrives, which
// this live-as-you-type check can't see ahead to. Left unguarded, that
// completes early and inserts the bracket mid-suburb ("...MOUNT (1 Smith
// Street) PLEASANT WA"), corrupting the officer's own observation text — a
// worse outcome than just not auto-completing at all. SUBURB_LEAD_WORDS
// below is the guard: a small, deliberately conservative list of words that
// are themselves never a whole WA suburb name, only ever the first half of
// a compound one, checked against the captured word so this only ever
// completes on a word that plausibly IS the whole suburb. A multi-word
// suburb typed with no state still needs the bracket typed by hand (it
// completes correctly the moment a state code is added, via the
// state-anchored regex above).
const SUBURB_LEAD_WORDS = new Set([
  "MOUNT",
  "NORTH",
  "SOUTH",
  "EAST",
  "WEST",
  "PORT",
  "NEW",
  "LAKE",
  "POINT",
  "CAPE",
  "UPPER",
  "LOWER",
  "LITTLE",
  "GREAT",
  "SAINT",
]);
const ADDRESS_SPACE_COMPLETION_NO_STATE_RE = new RegExp(
  `((?:[^,\\d\\n][^,\\n]*,\\s*)?)` +
    `([0-9]{1,5}[A-Za-z]?\\s+[A-Za-z][A-Za-z'\\s]{0,40}?\\b(?:${STREET_TYPE_WORDS}))\\b,\\s*([A-Za-z]{1,}(?:['-][A-Za-z]+)?)$`,
  "i"
);

/**
 * Deterministically completes a street address the instant its suburb (with
 * or without a trailing state code) is finished by a space — "44 Elvira
 * Street, PALMYRA WA " or just "44 Elvira Street, PALMYRA " both trigger on
 * the trailing space, same idea as detectVehicleMentionTrigger but for
 * addresses instead of regos: no registry lookup needed, works for a
 * location that's never been seen before. Returns the street portion
 * (number + name + type) as the bracket code — "(44 Elvira Street)" — UNLESS
 * a business/place name immediately precedes the street number (e.g. "Blend
 * Cafe, 112 Marmion Street, MELVILLE WA"), in which case the business name
 * is the bracket instead ("(Blend Cafe)"), matching how convertGoogleAddresses
 * already brackets a business address on paste or blur — without this, the
 * same address got a different bracket depending on which path produced it.
 */
export function detectAddressSpaceCompletion(
  text: string,
  cursorPos: number,
  usedAddressLabels: Set<string>
): { addressLabel: string } | null {
  // Called from onKeyDown before the just-pressed space actually lands in
  // the text — same convention as detectVehicleMentionTrigger above — so
  // cursorPos is the position right after the last typed character, not
  // after a space that isn't in the string yet.
  // Don't fire if a bracket already immediately follows — avoids double-
  // inserting when editing text that already has one.
  if (text.slice(cursorPos).startsWith("(")) return null;
  const textBefore = text.slice(0, cursorPos);
  let m = textBefore.match(ADDRESS_SPACE_COMPLETION_RE);
  if (!m) {
    const noStateM = textBefore.match(ADDRESS_SPACE_COMPLETION_NO_STATE_RE);
    // Only counts when the suburb capture is genuinely ALL CAPS as typed,
    // and isn't just the first half of a compound suburb name — see
    // ADDRESS_SPACE_COMPLETION_NO_STATE_RE's own comment for why both.
    if (
      noStateM &&
      noStateM[3] === noStateM[3].toUpperCase() &&
      !SUBURB_LEAD_WORDS.has(noStateM[3].toUpperCase())
    ) {
      m = noStateM;
    }
  }
  if (!m) return null;
  const businessName = m[1] ? m[1].replace(/,\s*$/, "").trim() : "";
  const addressLabel = businessName || m[2].trim();
  if (usedAddressLabels.has(addressLabel.toUpperCase())) return null;
  return { addressLabel };
}

/**
 * Deterministically completes a fresh person's name the instant it's
 * finished being typed — the running sheet's own naming convention
 * (capitalised first name, ALL-CAPS surname, e.g. "Jason SMITH") is
 * detectable the same way a rego's letter+digit shape is, so this works
 * for a person who's never been seen before, unlike the registry-search
 * dropdown above which can only suggest someone already known to
 * Intelligence.
 *
 * Handles a middle name too ("Mei Lin CHOW", "Whitney Storm STEWART",
 * "Roger David MOORE") by walking back through as many more
 * capitalised-first-name-shaped words as are actually there, up to 3
 * given names total — the same "2-4 words" convention the save-time
 * name-recovery logic in extractEntitiesFromText (server/db.ts) already
 * uses. Once that walk-back stops (a non-name word, or the start of the
 * text), if there's STILL another capitalised word sitting right before
 * whatever we've consumed, that's a longer run than this can safely
 * resolve — bail rather than risk auto-bracketing a truncated name, same
 * guard detectMentionTrigger above uses for the same reason.
 */
export function detectPersonNameSpaceCompletion(
  text: string,
  cursorPos: number,
  usedBracketCodes: Set<string>
): { surname: string } | null {
  // Same pre-insertion calling convention as detectAddressSpaceCompletion
  // above — see its comment.
  if (text.slice(cursorPos).startsWith("(")) return null;
  const textBefore = text.slice(0, cursorPos);
  const m = textBefore.match(/\b([A-Z][a-z'-]+)\s+([A-Z]{2,}(?:[-'][A-Z]+)?)$/);
  if (!m || m.index === undefined) return null;

  const givenNameWordRe = /([A-Z][a-z'-]+)\s$/;
  let nameStart = m.index;
  for (let givenNames = 1; givenNames < 3; givenNames++) {
    const prevWord = textBefore.slice(0, nameStart).match(givenNameWordRe);
    if (!prevWord || prevWord.index === undefined) break;
    nameStart = prevWord.index;
  }
  const beforeFullName = textBefore.slice(0, nameStart);
  if (/[A-Z][A-Za-z'-]*\s$/.test(beforeFullName)) return null;

  const surname = m[2];
  if (usedBracketCodes.has(surname.toUpperCase())) return null;
  return { surname };
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

/** Address labels — either a street ("(44 Elvira Street)") or, for a
 * business/place address, its name ("(Blend Cafe)") — already introduced
 * somewhere in a set of rows, for detectAddressSpaceCompletion's
 * suppression. Identified by the bracket immediately following an AU state
 * code, since that's the one shape both an address's street bracket and its
 * business-name bracket always share (see detectAddressSpaceCompletion and
 * convertGoogleAddresses, which both only ever bracket right after the
 * suburb + state) — matching on that instead of the bracket content's own
 * shape is what lets this recognise a business-name bracket too, not just
 * a street one. */
export function computeUsedAddressLabels(
  rows: Array<{ observation?: string | null }>
): Set<string> {
  const labels = new Set<string>();
  const addrRe = new RegExp(
    `(?:${AU_STATE_CODES})\\s*\\(([^()]{1,60})\\)`,
    "gi"
  );
  for (const r of rows) {
    if (!r.observation) continue;
    let m: RegExpExecArray | null;
    addrRe.lastIndex = 0;
    while ((m = addrRe.exec(r.observation)) !== null) {
      labels.add(m[1].trim().toUpperCase());
    }
  }
  return labels;
}

/** Best-effort strip of role descriptors ("driver", "front passenger",
 * "sole occupant", etc.) from a vehicle occupantDesc string (e.g. "HOGAN
 * driver, Denise HOLLY (HOLLY) front passenger") down to just the names
 * ("HOGAN and Denise HOLLY (HOLLY)") — used to pre-fill a "Walked in" chip's
 * names from the vehicle's known occupants. Deliberately best-effort rather
 * than a strict parser: the officer reviews and edits the inserted text
 * before submitting either way, same trust level the occupantDesc text
 * itself already has (it's reused verbatim elsewhere with no validation),
 * so an imperfect strip here is a minor edit, not a silent wrong fact in
 * the record. Shared by the RS Quick Entry map popup and the full sheet
 * table's own continuity chips. */
export function extractOccupantNames(occupantDesc: string): string {
  const ROLE_WORD =
    /\b(?:driver|front passenger|rear passenger|sole occupant|unseen occupants?|passenger)\b/gi;
  return occupantDesc
    .split(",")
    .map(part =>
      part
        .replace(ROLE_WORD, "")
        .replace(/\band\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join(" and ");
}

/** App-wide rule: a person's full name + bracket short-form is only correct
 * on their FIRST mention anywhere in the sheet — every later mention should
 * be short-form only (e.g. "FLETCHER", not "Madeleine Rose FLETCHER
 * (FLETCHER)"). occupantDesc/walk-in names text is reused verbatim from
 * whichever earlier row it was captured from, and that row's own wording is
 * whatever the officer originally typed there — if that was itself a first
 * mention (the common case, since a vehicle's occupants are usually
 * introduced when it first arrives), the full name would otherwise get
 * pasted into every future row a chip inserts it into, compounding
 * indefinitely instead of shortening like a vehicle's own rego already
 * does. Best-effort same as extractOccupantNames: only collapses a "Full
 * Name (CODE)" span whose CODE is already known (via usedBracketCodes) to
 * have appeared somewhere earlier in this sheet — a name genuinely being
 * introduced for the first time here is untouched. */
export function shortenAlreadyMentionedNames(
  text: string,
  usedBracketCodes: Set<string>
): string {
  return text.replace(
    /(?:[A-Z][a-zA-Z'-]*\s+)+\(([A-Z][A-Z'-]*)\)/g,
    (match, code: string) =>
      usedBracketCodes.has(code.toUpperCase()) ? code : match
  );
}
