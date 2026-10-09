// Unidentified people ("unidentified male (UM1)", "unidentified female (UF2)",
// "unidentified child (UC1)", "unidentified person (UP1)") follow the app-wide
// rule for every entity: written in full once, with the short bracketed name;
// from then on referred to ONLY by that short name ("UM1"). These helpers find
// those mentions and apply the rule. Deterministic; no lookups.

const FULL_SOURCE =
  "\\bunidentified\\s+(?:male|female|child|person|adult|juvenile|youth)\\b[^()\\n]*?\\(\\s*([A-Za-z]{1,3}\\d+)\\s*\\)";

export interface UnidentifiedMention {
  start: number;
  end: number;
  /** The mention as written, e.g. "unidentified male (UM1)". */
  full: string;
  /** Upper-case short name, e.g. "UM1". */
  code: string;
}

/** Every full "unidentified <kind> (CODE)" mention in `text`, in order. */
export function findUnidentifiedMentions(text: string): UnidentifiedMention[] {
  const re = new RegExp(FULL_SOURCE, "gi");
  const out: UnidentifiedMention[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      code: m[1].toUpperCase(),
    });
  }
  return out;
}

/** The short names already introduced in full in these rows. */
export function usedUnidentifiedCodes(
  rows: Array<{ observation?: string | null }>
): Set<string> {
  const codes = new Set<string>();
  for (const r of rows) {
    if (!r.observation) continue;
    for (const m of findUnidentifiedMentions(r.observation)) codes.add(m.code);
  }
  return codes;
}

/** Replaces every full mention of a person who has already been introduced
 * (`known`, upper-case codes) — or who is introduced earlier in `text`
 * itself — with the short name. The first mention of a new person stays in
 * full. */
export function shortenRepeatedUnidentified(
  text: string,
  known: Set<string>
): string {
  const seen = new Set(Array.from(known).map(c => c.toUpperCase()));
  let out = "";
  let at = 0;
  for (const m of findUnidentifiedMentions(text)) {
    out += text.slice(at, m.start);
    if (seen.has(m.code)) out += m.code;
    else {
      seen.add(m.code);
      out += m.full;
    }
    at = m.end;
  }
  return out + text.slice(at);
}

/** For live typing: the full mention that ends exactly at the caret, if that
 * person has already been introduced (in `known`, or earlier in the text), so
 * it can be replaced by the short name as the officer finishes the bracket. */
export function detectUnidentifiedRepeat(
  text: string,
  pos: number,
  known: Set<string>
): { start: number; code: string } | null {
  const before = text.slice(0, pos);
  const mentions = findUnidentifiedMentions(before);
  const last = mentions[mentions.length - 1];
  if (!last || last.end !== pos) return null;
  const introducedEarlier =
    known.has(last.code) ||
    mentions.slice(0, -1).some(m => m.code === last.code);
  return introducedEarlier ? { start: last.start, code: last.code } : null;
}
