/**
 * Is a capital word part of a suburb, not a person?
 *
 * Surnames are written in capitals on a running sheet ("DARYANI departed"), and
 * so are suburbs ("345 Kalamunda Road, MAIDA VALE WA"). A registered person
 * whose surname is VALE was therefore credited with every row at an address in
 * Maida Vale — and listed as seen at the Advent Park pin — because the bare
 * capital word "VALE" matched. A surname inside a suburb is not a mention of the
 * person, so those matches are skipped (the same direction of error the rest of
 * Intelligence takes: under-report, never invent a link).
 *
 * A capital word is read as part of a suburb when the run of capital words it
 * sits in (words separated by one space) either
 *   (a) is followed, within the run, by a state ("MAIDA VALE WA", "…NSW 2000"),
 *       or
 *   (b) comes straight after a street type and a comma and ends the address
 *       segment ("…Kalamunda Road, MAIDA VALE (Advent Park)", "…Road, MAIDA VALE.").
 * Anything else — "Elliot VALE departed", "met VALE at the park", "Smith
 * Street, VALE arrived" — is left as a possible person. Pure and deterministic.
 */

const STATES = new Set(["WA", "NSW", "VIC", "QLD", "SA", "TAS", "NT", "ACT"]);

const STREET_TYPE_THEN_COMMA =
  /\b(?:street|road|avenue|drive|highway|way|court|place|crescent|boulevard|terrace|parade|lane|close|circuit|freeway|grove|esplanade|parkway|loop|rise|walk|promenade|mews|st|rd|ave|av|dr|hwy|ct|pl|cres|blvd|tce|pde|ln|cl|cct|fwy|gr|esp)\s*,\s*$/i;

interface Token {
  text: string;
  start: number;
  end: number;
}

/** True when the text at [start, end) lies inside a suburb written in capitals. */
export function insideCapsSuburb(
  text: string,
  start: number,
  end: number
): boolean {
  const tokens: Token[] = [];
  const re = /\b[A-Z][A-Z'’-]*\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null)
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });

  // Runs of capital words one space apart.
  const runs: Token[][] = [];
  for (const t of tokens) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (prev && text.slice(prev.end, t.start) === " ") run.push(t);
    else runs.push([t]);
  }

  for (const run of runs) {
    const hit = run.findIndex(t => t.start < end && t.end > start);
    if (hit < 0) continue;
    // (a) a state follows the matched word in the same run.
    if (run.slice(hit + 1).some(t => STATES.has(t.text))) return true;
    // (b) after "<street type>, " and ending the address segment.
    const runStart = run[0].start;
    const runEnd = run[run.length - 1].end;
    if (
      STREET_TYPE_THEN_COMMA.test(text.slice(0, runStart)) &&
      /^\s*(?:$|[,.()])/.test(text.slice(runEnd))
    )
      return true;
  }
  return false;
}
