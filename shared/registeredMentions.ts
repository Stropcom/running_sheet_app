// ─── Registered vehicles and addresses named in plain text ──────────────────
// A running sheet row often names a registered vehicle or address WITHOUT a
// bracket introduction — the TGT chip and the Target Logger write
// "Vehicle 1EMB303, SANTOS driving…" and "departed 19 Jacaranda Drive and
// continued via:" and leave it there, because the target card is already the
// introduction. Intelligence used to credit a vehicle or place only when the
// SAME sheet bracketed it, so those rows never counted: the vehicle and the
// home address showed as card-only "Indices" with no sightings.
//
// This is the rule for when plain text counts as naming a REGISTERED vehicle
// or address. It is deliberately narrow (legal risk — err towards missing a
// mention, never inventing one):
//
//   • a vehicle counts only when its exact registration appears, as a whole
//     word, outside any bracket, and is not a measurement ("30cm");
//   • an address counts only when it is number-led, written exactly as the
//     registry holds it (street types in full, any case), not as part of a
//     longer number ("119 …", "2/19 …", "19-21 …"), and not followed by a
//     DIFFERENT capitalised suburb ("19 Jacaranda Drive, BIBRA LAKE" is not
//     the registered "…, ATTADALE").

import { isMeasurementWord } from "./measurementWord";
import { VEHICLE_REGO_PATTERN } from "./vehicleRego";

const PAREN = /\([^()]{1,80}\)/g;

function insideParen(ranges: Array<[number, number]>, s: number, e: number) {
  return ranges.some(([a, b]) => s >= a && e <= b);
}

function parenRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = new RegExp(PAREN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

/**
 * The registered registrations (lower case) that `text` names in plain text,
 * each once. `registered` holds lower-case registration keys.
 */
export function registeredPlatesIn(
  text: string | null | undefined,
  registered: ReadonlySet<string>
): string[] {
  const t = text ?? "";
  if (!t || registered.size === 0) return [];
  const ranges = parenRanges(t);
  const re = new RegExp(VEHICLE_REGO_PATTERN.source, "g");
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const key = m[0].toLowerCase();
    if (!registered.has(key)) continue;
    if (isMeasurementWord(m[0])) continue;
    if (insideParen(ranges, m.index, m.index + m[0].length)) continue;
    found.add(key);
  }
  return Array.from(found);
}

/** The suburb of a registry address label ("19 Jacaranda Drive, ATTADALE WA"
 * → "ATTADALE"), upper-cased, or null when it has none. */
export function registeredSuburb(
  label: string | null | undefined
): string | null {
  const m = (label ?? "")
    .replace(/\s*\([^()]*\)\s*$/, "")
    .match(
      /,\s*([A-Za-z][A-Za-z' -]*?)(?:\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))?\s*$/
    );
  return m ? m[1].trim().toUpperCase() : null;
}

const STATES = new Set(["WA", "NSW", "VIC", "QLD", "SA", "TAS", "NT", "ACT"]);

/**
 * Does `text` name the registered address whose street text is `street`
 * ("19 Jacaranda Drive") in plain text? `suburb` is the registered suburb
 * (upper case) or null when unknown.
 */
export function registeredAddressIn(
  text: string | null | undefined,
  street: string,
  suburb: string | null
): boolean {
  const t = text ?? "";
  const s = street.trim().replace(/\s+/g, " ");
  // Number-led only — a bare name ("HSBC", "the park") is an ordinary word.
  if (!t || !/^\d/.test(s)) return false;
  if (!t.toLowerCase().includes(s.toLowerCase())) return false;
  const escaped = s
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s+");
  const re = new RegExp(`(?<![A-Za-z0-9/\\-])${escaped}(?![A-Za-z0-9])`, "gi");
  const ranges = parenRanges(t);
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const start = m.index;
    const end = start + m[0].length;
    if (insideParen(ranges, start, end)) continue;
    // ", Suburb" straight after the street — it must be the registered one.
    // A capitalised run that ends the segment (or is followed by a state) is
    // read as a suburb, the same convention as shared/suburbMention.ts; a run
    // followed by more words ("…Drive, SANTOS driving") is a person, not a
    // suburb, and does not block the match.
    const after = t
      .slice(end)
      .match(
        /^\s*,\s*((?:[A-Z][A-Za-z'’-]*)(?:\s+[A-Z][A-Za-z'’-]*)*?)(?:\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b[^,.()]*|\s*(?=$|[,.()]))/
      );
    if (after) {
      const words = after[1].trim().split(/\s+/);
      while (words.length && STATES.has(words[words.length - 1].toUpperCase()))
        words.pop();
      const named = words.join(" ").toUpperCase();
      if (named && named !== suburb) continue;
    }
    return true;
  }
  return false;
}
