/**
 * The fuller address to geocode for a place the running sheets name.
 *
 * An entity's short form is often just a place or business name ("Terminal 4",
 * "Balthazar") with no street or suburb, which the Geocoding API cannot place
 * on its own — it can land anywhere in the State. The free text written just
 * before the entity's bracket is "<street>, SUBURB STATE" when the officer gave
 * one, so that is what the Location profile and the Heat Map both geocode.
 * One rule here so the two can never disagree about where a place is.
 */

const SUBURB_STATE_RE =
  /,\s*[A-Za-z][\w\s]*?\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/;

// The app writes a suburb in capitals ("…, 39 Salamanca Place, HOBART"), so a
// description ending in one is a street address even when no state was written.
const CAPS_SUBURB_TAIL_RE = /,\s*[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+)*$/;

/** The first description that carries a "<…>, SUBURB STATE" tail, trimmed;
 * failing that, the first with a "<…>, SUBURB" tail (a suburb in capitals, no
 * state written — the state then comes from `geocodeQueryFor`'s hint). Null
 * when none does (the caller then geocodes the bare label as before). */
export function fullAddressForGeocode(
  fullDescriptions: readonly (string | null | undefined)[]
): string | null {
  for (const text of fullDescriptions) {
    if (text && SUBURB_STATE_RE.test(text)) return text.trim();
  }
  for (const text of fullDescriptions) {
    if (text && CAPS_SUBURB_TAIL_RE.test(text.trim())) return text.trim();
  }
  return null;
}

// ─── Which State a geocoder query names ─────────────────────────────────────
// The app is used across all of Australia: the six States and the two
// mainland Territories (NT, ACT). The geocoder used to add ", Western
// Australia, Australia" to EVERY address, so "39 Salamanca Place, HOBART TAS"
// was asked for as "… TAS, Western Australia" and a Melbourne address likewise
// — pins for operations outside WA landed in the wrong place. Now an address
// that names its State keeps it; one that names none takes the State the rest
// of the sheet is in (`hint`); with neither it is asked for as "…, Australia"
// — no State is ever assumed.

export type AuState =
  | "WA"
  | "NSW"
  | "VIC"
  | "QLD"
  | "SA"
  | "TAS"
  | "NT"
  | "ACT";

const STATE_NAMES: Record<AuState, string> = {
  WA: "Western Australia",
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  TAS: "Tasmania",
  NT: "Northern Territory",
  ACT: "Australian Capital Territory",
};

export const AU_STATES = Object.keys(STATE_NAMES) as AuState[];

export const stateName = (state: AuState): string => STATE_NAMES[state];

const FULL_NAMES =
  "Western Australia|New South Wales|Victoria|Queensland|South Australia|Tasmania|Northern Territory|Australian Capital Territory";

// A State written the usual way anywhere in the text: the code in capitals
// ("HOBART TAS", "Melbourne VIC 3000"). Two-letter codes are never read in
// lower case (WA, SA, NT are ordinary-looking words).
const STATE_CODE_RE = /\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/g;
// A State written the other ways, only as the LAST thing in the address — an
// optional postcode and ", Australia" may follow: "…, Tasmania 7000",
// "Collingwood Victoria", "…, Hobart Tas", "…, Parramatta N.S.W.". Anywhere
// else "Victoria" is a street or a suburb ("Victoria Street", "Victoria
// Park"), never the State.
const STATE_TAIL_RE = new RegExp(
  `(?:,|\\s)\\s*(${FULL_NAMES}|N\\.?S\\.?W\\.?|Vic\\.?|Qld\\.?|Tas\\.?|A\\.?C\\.?T\\.?)(?:\\s+\\d{4})?\\s*(?:,\\s*Australia)?\\s*$`,
  "i"
);

function codeOfName(word: string): AuState | null {
  const w = word.toLowerCase().replace(/\./g, "");
  for (const k of AU_STATES)
    if (STATE_NAMES[k].toLowerCase() === w || k.toLowerCase() === w) return k;
  return null;
}

/** The State an address names, or null when it names none: the last state code
 * written in capitals, else a full name or abbreviation closing the address.
 * A vehicle's "bearing WA registration" is never part of a place, and
 * "Victoria Street" is not a State. */
export function stateOfAddress(
  text: string | null | undefined
): AuState | null {
  if (!text) return null;
  const tail = text.match(STATE_TAIL_RE);
  if (tail) {
    const code = codeOfName(tail[1]);
    // a lower-case two-letter word at the end is not a State code ("sa")
    if (code && (tail[1].length > 2 || tail[1] === tail[1].toUpperCase()))
      return code;
  }
  let found: AuState | null = null;
  for (const m of Array.from(text.matchAll(STATE_CODE_RE)))
    found = m[1] as AuState;
  return found;
}

/** The State most of a sheet's written places are in (ties: the first met), or
 * null when none names one — the hint for the places that name no State. */
export function dominantState(
  texts: readonly (string | null | undefined)[]
): AuState | null {
  const counts = new Map<AuState, number>();
  for (const t of texts) {
    const s = stateOfAddress(t);
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: AuState | null = null;
  for (const [s, n] of Array.from(counts))
    if (!best || n > (counts.get(best) ?? 0)) best = s;
  return best;
}

/** What to ask the geocoder, and the cache key to keep the answer under.
 * The key is the plain one when the State is WA (answers cached before this
 * rule were asked as WA, so they stay valid) and carries the State otherwise —
 * a position cached for the old "…, Western Australia" query is never reused
 * for an address in another State. */
export function geocodeQueryFor(
  text: string,
  key: string,
  hint?: AuState | null
): { query: string; key: string; state: AuState } {
  const named = stateOfAddress(text);
  const state: AuState = named ?? hint ?? "WA";
  const bare = text
    .replace(/,?\s*Australia\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const query = named
    ? `${bare}, Australia`
    : `${bare}, ${STATE_NAMES[state]}, Australia`;
  const suffix = state === "WA" ? "" : `|${state}`;
  return { query, key: `${key}${suffix}`.slice(0, 500), state };
}

/** Groups the written forms of each place by the place's label, so a caller
 * that only has the label (the Supervisor Summary's Location column) can find
 * the fuller "<street>, SUBURB STATE" the officer wrote for it. `normalize` is
 * the same label key the Heat Map uses. Only address / business places count. */
export function fullDescriptionsByLabel(
  entities: readonly {
    type: string;
    shortForm: string;
    fullDescription: string;
  }[],
  normalize: (label: string) => string
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of entities) {
    if (e.type !== "address" && e.type !== "business") continue;
    const key = normalize(e.shortForm);
    const list = out.get(key);
    if (list) list.push(e.fullDescription);
    else out.set(key, [e.fullDescription]);
  }
  return out;
}
