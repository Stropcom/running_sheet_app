// Bus stops and train stations on the map. Google lists them as places of a
// transit type; RunLog writes them the same way every time so the observation,
// the bracket short form, the map pin and the Target Logger all agree:
//
//   bus stop       → "Bus Stop Stirling Highway After Eric Street"
//   train station  → "Fremantle Train Station"
//
// Deterministic: the place's types and name only, no lookups, no AI.

export type TransitKind = "bus" | "train";

const TRAIN_TYPES = new Set([
  "train_station",
  "subway_station",
  "light_rail_station",
]);
const BUS_TYPES = new Set(["bus_station", "bus_stop"]);

// Abbreviations agencies use in stop names. Only expanded where they cannot be
// part of a name — at the end ("Eric St"), or in front of a position word
// ("Stirling Hwy After Eric St") — so "St Kilda" and "Dr Smith" are safe.
const STREET_ABBREVIATIONS: Record<string, string> = {
  st: "Street",
  rd: "Road",
  ave: "Avenue",
  av: "Avenue",
  dr: "Drive",
  hwy: "Highway",
  ct: "Court",
  pl: "Place",
  cres: "Crescent",
  blvd: "Boulevard",
  tce: "Terrace",
  pde: "Parade",
  ln: "Lane",
  cl: "Close",
  cct: "Circuit",
  fwy: "Freeway",
  gr: "Grove",
  esp: "Esplanade",
  pwy: "Parkway",
  wy: "Way",
  pkwy: "Parkway",
  bvd: "Boulevard",
};
const POSITION_WORDS = new Set([
  "after",
  "before",
  "opp",
  "opposite",
  "near",
  "at",
  "stand",
  "stop",
  "platform",
  "cnr",
  "corner",
  "and",
  "&",
  "o/s",
  "outside",
  "adj",
  "beside",
]);

/** "Stirling Hwy After Eric St" → "Stirling Highway After Eric Street". */
export function expandStopName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const bare = w.replace(/[.,]+$/, "");
      const full = STREET_ABBREVIATIONS[bare.toLowerCase()];
      if (!full) return w;
      const next = words[i + 1];
      const atEnd = i === words.length - 1;
      const beforePosition = !!next && POSITION_WORDS.has(next.toLowerCase());
      // "St" alone at the very front is a name ("St Kilda"), never a street.
      if (i === 0) return w;
      return atEnd || beforePosition ? full : w;
    })
    .join(" ");
}

// A street word, then a position word: how an agency names a stop.
const AGENCY_STOP_NAME =
  /^[A-Za-z' -]+\b(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Hwy|Highway|Wy|Way|Pl|Place|Ct|Court|Cres|Crescent|Ln|Lane|Tce|Terrace|Pde|Parade|Blvd|Boulevard|Cl|Close|Cct|Circuit|Fwy|Freeway)\s+(?:After|Before|Opp|Opposite|Near|Stand\s+\d+|Stop\s+\d+)\b/i;

export interface TransitPlace {
  kind: TransitKind;
  /** The one wording used everywhere: "Bus Stop …" / "… Train Station". */
  label: string;
}

/**
 * What a tapped place is, from its Google types (and its name when Google
 * only says "transit_station"). Null when it is not a bus stop or station.
 */
export function transitPlaceFromGoogle(
  name: string,
  types: readonly string[] | undefined | null
): TransitPlace | null {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const t = new Set((types ?? []).map(x => x.toLowerCase()));
  const has = (set: Set<string>) => Array.from(t).some(x => set.has(x));

  let kind: TransitKind | null = null;
  if (has(TRAIN_TYPES)) kind = "train";
  else if (has(BUS_TYPES)) kind = "bus";
  else if (t.has("transit_station")) {
    // Only the generic type: a rail word says train; anything else — a stop
    // named for a street and a position ("Grange Dr After Gascoyne Wy") — is
    // a bus stop, which is what nearly every such place is.
    if (/\b(?:railway|rail|train|station|stn)\b/i.test(clean)) kind = "train";
    else kind = "bus";
  }
  // No transit type at all, but the name is how an agency writes a stop — a
  // street and where along it: "Grange Dr After Gascoyne Wy", "Hay St Stand 5".
  if (!kind && AGENCY_STOP_NAME.test(clean)) kind = "bus";
  if (!kind) return null;
  return { kind, label: transitLabel(kind, clean) };
}

/** The one wording for a stop or station name. */
export function transitLabel(kind: TransitKind, name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (kind === "bus") {
    // "Bus Stop 12345" / "Bus Stop Stirling Hwy After Eric St" / a bare street
    // name — always "Bus Stop <where>", never "Bus Stop Bus Stop …".
    const where = clean
      .replace(/^bus\s+(?:stop|stand|bay)\b[\s:,-]*/i, "")
      .replace(/\s+bus\s+(?:stop|stand|bay)$/i, "")
      .trim();
    return `Bus Stop ${expandStopName(where || clean)}`.trim();
  }
  // "Fremantle Station" / "Fremantle Railway Station" / "Perth Underground"
  // → "<Place> Train Station".
  const base = clean
    .replace(/\s+(?:railway|rail|train)\s+station$/i, "")
    .replace(/\s+station$/i, "")
    .replace(/\s+(?:railway|rail)$/i, "")
    .trim();
  return `${base || clean} Train Station`;
}

/**
 * Whether a written place is a bus stop or a train station, by its wording.
 * Used by the Target Logger to offer "Boarded a bus / a train" for someone
 * logged at one. Never guesses: a place that doesn't say so is not transit.
 */
export function transitKindOfPlace(place: string): TransitKind | null {
  const p = (place ?? "").trim();
  if (!p) return null;
  if (/^bus\s+(?:stop|stand|bay|station|interchange)\b/i.test(p)) return "bus";
  if (/\bbus\s+(?:station|interchange|stand)\b|\bbusport\b/i.test(p))
    return "bus";
  // Only "train / railway / rail station": a bare "… Station" could be a
  // police station or a petrol station.
  if (/\b(?:train|railway|rail)\s+station\b/i.test(p)) return "train";
  return null;
}

const STATES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";

/**
 * The full address for a tapped bus stop or train station, written the way
 * every first mention of a place is — "<label>, SUBURB WA (<label>)" — from
 * Google's formatted address ("Stirling Hwy, Nedlands WA 6009, Australia").
 * A stop (or a park, a reserve, a street corner) has no street number, so the
 * label itself carries the place; no postcode and no "Australia". Null when
 * the address has a street number: the usual business-address wording already
 * handles that, so the caller uses it.
 */
export function transitFullAddress(
  label: string,
  googleAddress: string
): string | null {
  const parts = (googleAddress ?? "")
    .split(",")
    .map(p => p.trim())
    .filter(p => p && !/^australia$/i.test(p));
  if (parts.length === 0 || !label.trim()) return null;
  const suburbIdx = parts.findIndex(p =>
    new RegExp(`^.+?\\s+(?:${STATES})(?:\\s+\\d{4})?$`).test(p)
  );
  if (suburbIdx < 0) return null;
  // Any street number (or unit number) in front of the suburb: not a
  // numberless place, so the usual business-address wording is used.
  if (parts.slice(0, suburbIdx).some(p => /\d/.test(p))) return null;
  // An intersection ("Kent St &, Queens Park Rd, …") keeps its streets.
  if (parts.slice(0, suburbIdx).some(p => /&|\bcnr\b|\//i.test(p))) return null;
  const suburbState = parts[suburbIdx].match(
    new RegExp(`^(.+?)\\s+(${STATES})(?:\\s+\\d{4})?$`)
  )!;
  return `${label}, ${suburbState[1].toUpperCase()} ${suburbState[2]} (${label})`;
}
