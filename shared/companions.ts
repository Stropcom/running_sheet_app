// Who is WITH someone, from the words of one sentence — the single rule the
// Target Logger cards and the target flag use whenever a row says people were
// together ("seated inside <Place> with Hye Jin PARK (PARK) at a table",
// "entered <Place> and sat at a table with NGUYEN", "in the company of EVANS",
// "together with …", "alongside …", "met with …", "spoke to …").
//
// Why one rule: this used to be written twice (once for "inside <Place> with
// …", once for "entered <Place> and sat with …") and each phrasing that
// officers actually use but neither covered ("seated with PARK inside …", "in
// company with …", the target's own name typed "Doyle" not "DOYLE") left a
// person out of the card and the flag. New phrasings are added HERE, with a
// test, and every path picks them up.
//
// Deterministic: capitals-surnames and the short names of unidentified people
// (UM1) only — never a guess about a lower-case word.

/** All-capital words that are not people ("WA", "CCTV", "ATM", …). */
const NOT_A_PERSON = new Set([
  "WA",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "TAS",
  "NT",
  "ACT",
  "AM",
  "PM",
  "ID",
  "TV",
  "CCTV",
  "ATM",
  "CBD",
  "GPS",
  "PIN",
  "ANZ",
  "NAB",
  "BOQ",
  "HSBC",
  "KFC",
  "BP",
  "RS",
  "RV",
  "UK",
  "USA",
  "PDF",
  "DVD",
  "LPO",
  "SUV",
  "UTE",
  "CIN",
  "OIC",
  "IO",
  "IOS",
  "PTT",
  "AFP",
  "WAPOL",
  "TGT",
  "HBF",
  "HB",
  "SC",
  "OOS",
  "COOS",
]);

/** The surname-style tokens of a name: surnames are written in capitals
 * ("BAIG", "Denise HOLLY (HOLLY)"), and an unidentified person has a short
 * name with a digit (UM1, UF2, UC1, UP1). */
export function personTokens(name: string): string[] {
  const raw = name.match(/\b[A-Z][A-Z'-]+\b|\bU[MFCP]\d+\b/g) ?? [];
  return raw.filter(t => !NOT_A_PERSON.has(t));
}

/** Every word of a name in upper case, whatever case it was typed in. */
export function nameWordsUpper(name: string): string[] {
  return (name.match(/U[MFCP]\d+|[A-Za-z][A-Za-z'-]+/gi) ?? []).map(w =>
    w.toUpperCase()
  );
}

/** Surnames written in capitals anywhere in these texts — a person typed in
 * mixed case ("Doyle") is still that person when the same surname is written
 * in capitals elsewhere on the sheet ("DOYLE driver and sole occupant"). */
export function knownSurnamesOf(texts: Iterable<string | null | undefined>) {
  const out = new Set<string>();
  for (const t of Array.from(texts)) {
    if (t) for (const s of personTokens(t)) out.add(s);
  }
  return out;
}

/** Person tokens of a stretch of text, counting a mixed-case surname that is
 * known from elsewhere ("Doyle" when DOYLE is on the sheet). */
export function personTokensKnown(
  text: string,
  known?: ReadonlySet<string>
): string[] {
  const out = personTokens(text);
  if (known) {
    for (const w of nameWordsUpper(text)) {
      if (known.has(w) && !out.includes(w)) out.push(w);
    }
  }
  return out;
}

/** Upper-cases the words of `names` that are known surnames, so "Doyle" shows
 * as "DOYLE" on the card and the flag like every other person. */
export function canonicalNames(
  names: string,
  known?: ReadonlySet<string>
): string {
  if (!known || known.size === 0) return names;
  return names.replace(/[A-Za-z][A-Za-z'-]+/g, w =>
    known.has(w.toUpperCase()) ? w.toUpperCase() : w
  );
}

// What ends the stretch of text that names the companion: the place, a
// preposition that starts the next fact ("at a table", "inside …"), a verb that
// starts what they did next, or the end of the sentence.
const COMPANION_END_RE =
  /\s+(?:inside|within|outside|near|at|in|on|by|having|while|who|as|when|and\s+(?:then|continued|walked|exited|left|departed|entered|spoke|talked|met)|then)\b|[.;\n]/i;

// The phrases that introduce a companion.
const TOGETHER_RE =
  /\b(?:in\s+(?:the\s+)?company\s+(?:of|with)|accompanied\s+by|together\s+with|along\s+with|alongside|joined\s+by|sharing\s+(?:a|the)\s+table\s+with|at\s+(?:a|the|their)\s+table\s+with)\s+/gi;
// A sitting / meeting / eating / talking verb, then "with" (or "to"): the
// verb is what makes a bare "with" mean company.
const VERB_WITH_RE =
  /\b(?:seated|sitting|sat|standing|stood|dining|dined|eating|ate|drinking|drank|talking|talked|speaking|spoke|conversing|conversed|chatting|chatted|meeting|met|(?:having|had|have)\s+(?:a\s+)?(?:meal|drink|coffee|lunch|dinner|breakfast|conversation|chat))\b[^.;\n]*?\b(?:with|alongside|to)\s+/gi;
// "met X" / "joined X" straight onto the name.
const MET_RE = /\b(?:met|joined|meeting)\s+(?!with\b)/gi;
const BARE_WITH_RE = /\bwith\s+/gi;

function segmentAfter(text: string, from: number): string {
  const rest = text.slice(from);
  const end = rest.search(COMPANION_END_RE);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * The people a sentence says were with someone, other than those already
 * named (`already`). `bareWith` allows a plain "with <NAME>" to count — only
 * for a sentence that already says where people ARE ("inside <Place> with
 * EVANS"); a sentence about walking in needs one of the phrases above, so
 * "entered Bar One with a CCTV camera" adds nobody.
 */
export function companionNames(
  text: string,
  already: string,
  opts: { bareWith?: boolean; known?: ReadonlySet<string> } = {}
): string[] {
  const have = new Set(personTokensKnown(already, opts.known));
  const out: string[] = [];
  const take = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const seg = segmentAfter(text, m.index + m[0].length);
      for (const t of personTokensKnown(seg, opts.known)) {
        if (!have.has(t) && !out.includes(t)) out.push(t);
      }
      if (m[0].length === 0) re.lastIndex++;
    }
  };
  take(TOGETHER_RE);
  take(VERB_WITH_RE);
  take(MET_RE);
  if (opts.bareWith) take(BARE_WITH_RE);
  return out;
}

/** "NAMES and X and Y" — the people on the card and the flag. */
export const withCompanionNames = (names: string, more: string[]) =>
  more.length > 0 ? `${names} and ${more.join(" and ")}` : names;
