// Canonical "walked" narrative patterns for the on-foot mirror of the
// vehicle depart/arrive continuity feature (see vehicleEventPatterns.ts)
// — see server/db.ts's "Walk-In → Walk-Out Continuity" section, the
// authoritative user of these for building RS Quick Entry chips.
//
// Officers exit a parked vehicle, walk on foot to a location, then later
// walk back to the same vehicle. Deliberately scoped to vehicle <-> location
// only (not location <-> location) — see the "Walked in"/"Walked out" chips
// in IntelligenceMapping.tsx, which cross-reference the existing vehicle
// arrival/departure state to know which vehicle a walk-out leads back to.
//
// Both patterns tolerate commas being present or absent around each clause
// (",?\s*") rather than requiring one exact punctuation style — unlike the
// vehicle patterns, there's no normalizeObservationPunctuation pass backing
// these up, and real examples of this narrative have appeared with
// inconsistent comma placement even from the same officer.
//
// WALK_IN_PATTERN's first group captures who's walking (e.g. "KENNEDY and
// JOHNS"), anchored to not cross a "." or newline — this keeps it from
// reaching back into an earlier sentence in the same row (e.g. the vehicle
// arrival narrative that typically precedes it) while still tolerating
// free-text names of any length. getPendingWalkIns reuses this captured
// text verbatim for the "Walked out" chip, on the same names-reuse basis
// VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN already reuses occupantDesc.
//
// The "walked <route>," clause is optional: officers also write the direct
// form with no route at all — "BAIG and JORDAN exited the vehicle, entered
// 193b Stock Road and continued out of sight." Group 2 (the route) is then
// undefined, and the "Walked out" chip simply omits its route.
import {
  canonicalNames,
  companionNames,
  personTokensKnown,
  withCompanionNames as withCompanions,
} from "./companions";
import {
  extractArrivalAddress,
  VEHICLE_DEPART_PATTERN,
  matchVehicleArrival,
  matchVehicleSighting,
} from "./vehicleEventPatterns";
import { extractOccupantNames } from "./occupantNames";
import {
  matchVesselBoarding,
  matchVesselDisembark,
  stripVesselLeave,
  vesselLabel,
} from "./vesselPatterns";
import {
  matchTransitAlighting,
  matchTransitBoarding,
  stripTransitAlighting,
  transitLabelText,
} from "./transitPatterns";
import { expandRowSegments } from "./rowSegments";
import { fullStreetTypes } from "./streetTypes";

// A vehicle as the officer refers to it when someone gets out: "the vehicle",
// or by rego — "Vehicle 1EXP123", "Vehicle 1EXP123 (Vehicle 1EXP123)".
const VEHICLE_REF =
  "(?:the\\s+vehicle|\\(?Vehicle\\s+[A-Za-z0-9]{5,8}\\)?(?:\\s*\\(Vehicle\\s+[A-Za-z0-9]{5,8}\\))?)";

export const WALK_IN_PATTERN = new RegExp(
  "([A-Za-z][^.\\n]*?)\\s*exited\\s+" +
    VEHICLE_REF +
    ",?\\s*(?:walked\\s+(.+?),?\\s*)?entered\\s+(.+?)\\s+and continued out of sight",
  "i"
);

// Alternate walk-in phrasing with no separate "entered <location>" clause —
// the destination is folded straight into the route text instead ("...
// walked towards 45 Francis Street and continued out of sight."). This is a
// real, standard narrative officers write at least as often as the
// "entered <location>" form, but WALK_IN_PATTERN requires that clause
// literally and simply never matches this shape — the row silently never
// registers as a pending walk-in, so no "Walked out" chip is ever offered
// for it. getPendingWalkIns tries WALK_IN_PATTERN first and only falls back
// to this one when that doesn't match, so there's no double-matching.
// Route/destination isn't cleanly separable here (there's no anchor clause
// like "entered" to split on), so extractWalkInTowardsLocation below does
// its own best-effort split off the single captured route clause.
export const WALK_IN_TOWARDS_PATTERN = new RegExp(
  "([A-Za-z][^.\\n]*?)\\s*exited\\s+" +
    VEHICLE_REF +
    ",?\\s*walked\\s+(.+?)\\s+and continued out of sight",
  "i"
);

// Positional/connector phrases officers write between "towards" and the
// actual address ("towards the front of 64 Matheson Road", "towards the
// vicinity of 64 Matheson Road") — stripped so the extracted location
// matches the exact address text used elsewhere (e.g. by a vehicle's own
// "arrived at 64 Matheson Road"), which is a plain string comparison, not
// fuzzy. Applied in a loop since these could in principle stack (a real
// example hasn't been seen, but there's no cost to tolerating it).
//
// Also the ONLY thing standing between a match and a miss for
// WALK_IN_TOWARDS_PATTERN's no-"towards" fallback case ("... walked down
// the driveway of 115 Bateman Road and continued out of sight.") —
// extractWalkInTowardsLocation falls back to the whole captured clause
// when there's no "towards" to split on (see its own comment), so without
// a matching prefix here that whole clause — "down the driveway of 115
// Bateman Road" — becomes the "location", which then never matches the
// vehicle's own plain "115 Bateman Road" address and silently drops the
// "Walked out" chip for it.
const WALK_IN_LOCATION_PREFIX_RE =
  /^(?:the\s+(?:front(?:\s+door)?|back|rear|side)\s+of|the\s+door\s+of|the\s+entrance\s+of|(?:up|down|along)\s+the\s+driveway\s+of|(?:in\s+)?the\s+vicinity\s+of|outside(?:\s+of)?|near|the\s+residence\s+at)\s+/i;

// Best-effort destination extraction from a WALK_IN_TOWARDS_PATTERN route
// clause — e.g. "towards 45 Francis Street" -> "45 Francis Street",
// "across the road towards the residence at 18 Pepperbush Road" ->
// "18 Pepperbush Road". The destination always comes after the LAST
// "towards" in the clause, so strip up to and including that, then drop
// any leading positional phrase (see WALK_IN_LOCATION_PREFIX_RE). Falls
// back to the whole clause when there's no "towards" at all — same trust
// level as extractOccupantNames in IntelligenceMapping.tsx: worst case the
// address match later doesn't line up and the chip just doesn't appear, it
// never inserts anything wrong into the record.
export function extractWalkInTowardsLocation(route: string): string {
  const towardsMatch = route.match(/towards\s+(.+)$/i);
  let location = towardsMatch ? towardsMatch[1] : route;
  let stripped: string;
  while (
    (stripped = location.replace(WALK_IN_LOCATION_PREFIX_RE, "")) !== location
  ) {
    location = stripped;
  }
  return location.trim();
}

// The genuine route/path content of a WALK_IN_TOWARDS_PATTERN clause —
// whatever comes BEFORE "towards", e.g. "across the road" in "across the
// road towards 18 Pepperbush Road". Empty when there's nothing before
// "towards" (e.g. "towards the front of 64 Matheson Road" is pure
// destination, no separate route was ever described).
//
// Reusing the raw captured route clause verbatim in a "Walked out" chip
// (which also states the destination via its own location text) silently
// duplicated the address — "exited 64 Matheson Road and walked towards the
// front of 64 Matheson Road towards Vehicle REGO." A caller building that
// sentence should use THIS instead of the raw clause, and drop the "and
// walked ROUTE" part of the sentence entirely when it's empty, rather than
// reusing the destination-bearing raw text as if it were route content.
export function extractWalkInTowardsRoute(route: string): string {
  const idx = route.search(/\btowards\b/i);
  return idx > 0 ? route.slice(0, idx).trim() : "";
}

// Canonical form is "... exited <location> and walked <route> towards
// Vehicle <rego>." — also still matches the older "... exited <location>,
// walked <route>, to Vehicle <rego>." phrasing (comma-separated, "to"
// instead of "towards", no "and") so rows written before this wording was
// standardised keep matching. Don't retire that half without checking
// existing sheets first — this is a legal record, not just app state.
export const WALK_OUT_PATTERN =
  /exited\s+(.+?)\s*,?\s*(?:and\s+)?walked\s+(.+?)\s*,?\s*(?:to|towards)\s+Vehicle\s+([A-Za-z0-9]{5,8})/i;

// ─── People entering and leaving addresses (no vehicle involved) ───────────
// The patterns above are all anchored on a vehicle ("exited the vehicle",
// "towards Vehicle REGO"). Surveillance of an address with no vehicle, or
// people moving from one address to another, never matches them. These add
// the plain forms:
//   "BAIG entered 13 Denford Street and continued out of sight."
//   "BAIG exited 193b Stock Road and walked across the road towards
//    13 Denford Street."
// scanWalkEvents below is the one place that reads all of them (vehicle and
// non-vehicle) over a sheet's rows, so getPendingWalkIns and the "heading
// to" list can never disagree about who is where.

export const PERSON_ENTER_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\bentered\s+(?!the\s+vehicle\b)(.+?)\s+and continued out of sight/i;

// "ROCHA arrived on foot at Bus Stop Grange Drive After Gascoyne Way, COOLOONGUP
// WA (Bus Stop Grange Drive After Gascoyne Way)." — a walker getting to a
// place, the same way a vehicle "arrived at" one. "on foot" is required, so a
// vehicle's own arrival sentence is never read as a person walking.
export const PERSON_ARRIVE_ON_FOOT_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\barrived\s+on\s+foot\s+at\s+([A-Z0-9][^.\n]*?)\s*(?:\s+and\s+(?:continued|then|waited)\b|(?=\.)|$)/;

export const PERSON_EXIT_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\bexited\s+(?!the\s+vehicle\b|\(?Vehicle\s+[A-Za-z0-9]{5,8}\b)(.+?)\s*,?\s*(?:and\s+)?walked\b([^.\n]*)/i;

// A walker already on foot: "BAIG walked [route] towards 13 Denford Street."
// or "BAIG walked towards Vehicle 1ORB419." — no "exited" clause. A vehicle
// destination ends the walk (they are going back to the car); any other
// destination re-points where they are heading.
export const PERSON_WALK_PATTERN = /([A-Za-z][^.\n]*?)\s*\bwalked\b([^.\n]*)/i;

// Looser forms for the many ways officers phrase an entry or exit. Both
// need the place to start with a capital or a number (a named place or a
// street address), so "entered the front passenger seat" or "exited the
// premises" never register as a location, and neither matches a vehicle.
//   "BAIG exited A and walked to and entered Melville Fish & Chips, 362
//    Marmion Street, MELVILLE WA (Melville Fish & Chips)"
export const PERSON_ENTER_ANY_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\bentered\s+([A-Z0-9][^.\n]*?)\s*(?:\s+and\s+continued\s+out\s+of\s+sight|(?=\.)|$)/;
//   "BAIG exited Melville Fish & Chips." / "... and entered Vehicle ..."
export const PERSON_EXIT_ANY_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\bexited\s+([A-Z0-9][^.\n]*?)(?:\s+(?:onto|towards?|along|across|via)\b|\s+and\s+(?:walked|entered|continued|got|returned|drove|left|met|joined|spoke|talked|stood|waited|stopped|greeted|approached|crossed|turned|began|proceeded|headed|moved)\b|[,.]|$)/;

// Leaving a place and carrying on without saying where to — "exited
// Communicare and walked along Cantonment Street", "departed X and continued
// via ...", "left X and continued walking via ...", "walked out of X and
// walked on". Anything that leaves a place followed by a walking term. The
// walkers are on foot with no destination logged yet, so they are
// "walking" until an entry is. (A vehicle's own departure — "Vehicle 1HIB84,
// BAIG driver, departed X and continued via" — is excluded by the caller: its
// names text names a Vehicle.)
export const PERSON_EXIT_ONWARD_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\b(?:exited|departed|left|walked\s+out\s+of|came\s+out\s+of|emerged\s+from)\s+(?!the\s+vehicle\b|\(?Vehicle\s+[A-Za-z0-9]{5,8}\b)([A-Z0-9][^.\n]*?)\s*,?\s*(?:(?:and|then)\s+)*(?:continued|walking|walked|proceeded|headed|moved\s+on|went|on\s+foot)\b([^.\n]*)/;

// Getting into a vehicle however it is worded: "entered the front passenger
// seat of a red Ford Ranger, bearing WA registration 1EXP123 (Vehicle
// 1EXP123)", "got into Vehicle 1ORB419", "boarded Vehicle ...". The vehicle
// is the one named as "Vehicle <rego>" later in the same sentence.
const ENTER_VEHICLE_VERB =
  "(?:entered|got\\s+(?:in|into)|boarded|climbed\\s+(?:in|into)|jumped\\s+(?:in|into))";
/** After "… Vehicle X (Vehicle X)," the sentence goes on to say they got in:
 * "and entered via the driver's door", "and got into it", "and sat in".
 * "entered the car park" is not getting in. */
const GOT_IN_AFTER_VEHICLE =
  /\bVehicle\s+[A-Za-z0-9]{5,8}\)?[^.\n]*?\b(?:entered\s+(?:it\b|the\s+(?:vehicle|car)\b(?!\s+park)|(?:via|through|by)\b|the\s+(?:driver|passenger|front|rear|back)\b)|got\s+(?:in|into)\b|climbed\s+(?:in|into)\b|jumped\s+(?:in|into)\b|sat\s+in\b|seated\b)/i;

export const PERSON_ENTER_VEHICLE_PATTERN = new RegExp(
  "([A-Za-z][^.\\n]*?)\\s*\\b" +
    ENTER_VEHICLE_VERB +
    "\\b[^.\\n]*?\\(?Vehicle\\s+([A-Za-z0-9]{5,8})\\)?",
  "i"
);
const ENTER_VEHICLE_REGO_RE = new RegExp(
  "\\b" +
    ENTER_VEHICLE_VERB +
    "\\b[^.\\n]*?\\(?Vehicle\\s+([A-Za-z0-9]{5,8})\\)?",
  "i"
);

/** A place as written inside a longer sentence, reduced to the name later
 * mentions use: its bracket label if it has one, else its first
 * comma-separated segment ("Melville Fish & Chips, 362 Marmion Street,
 * MELVILLE WA" → "Melville Fish & Chips"). */
function placeName(raw: string): string {
  const b = raw.match(/\(([^)]{1,80})\)/);
  if (b) return fullStreetTypes(b[1].trim());
  return fullStreetTypes(raw.split(",")[0].trim());
}

// "BAIG exited the vehicle and walked towards 13 Denford Street." — they left
// a parked vehicle and walked off (no entry yet). Same shape as an exit from an
// address, with the vehicle as the place left. (With an "entered ..." clause
// the row is a walk-in, handled by WALK_IN_PATTERN instead.)
export const PERSON_EXIT_VEHICLE_WALK_PATTERN = new RegExp(
  "([A-Za-z][^.\\n]*?)\\s*\\bexited\\s+" +
    VEHICLE_REF +
    ",?\\s*(?:and\\s+)?walked\\b([^.\\n]*)",
  "i"
);

/** The walkers' names, with anything from an "exited"/"walked" clause on
 * cut off — a lazy capture can otherwise swallow the start of the same
 * sentence ("BAIG exited A, walked across the road,"). */
export function cleanWalkerNames(raw: string): string {
  return raw
    .replace(/\s*,?\s*(?:and\s+)?(?:then\s+)?\b(?:exited|walked)\b.*$/i, "")
    .replace(/[\s,]+$/, "")
    .trim();
}

/** A location written as a full address ("13 Denford Street, KENWICK WA
 * (13 Denford Street)") is reduced to its bracket label, which is what later
 * mentions and the other continuity logic use. */
export function bracketLabelOrSelf(location: string): string {
  const b = location.match(/\(([^)]{1,80})\)/);
  return fullStreetTypes((b ? b[1] : location).trim());
}

/** The place a vehicle's departure row says it left ("... departed 77
 * Reynolds Rd and continued via:"), reduced to its bracket label when written
 * as a full address. Null when none is written. */
export function extractDepartureAddress(text: string): string | null {
  const m = text.match(
    /\b(?:departed|reversed out of|reversed from)\s+(.+?)(?=\s+(?:and\s+(?:continued|travelled|headed|drove|left)|via|towards)\b|[,.:;\n]|$)/i
  );
  if (!m) return null;
  const place = bracketLabelOrSelf(m[1])
    .replace(/(?:\s+and)+$/i, "")
    .trim();
  return place ? fullStreetTypes(place) : null;
}

/** Where an "exited X and walked ..." clause says the walkers were heading,
 * or null when it names no destination or the destination is a vehicle
 * (that case is WALK_OUT_PATTERN's). `rest` is the text after "walked". */
export function extractExitDestination(rest: string): string | null {
  // "... towards 13 Denford Street" — or, when the officer wrote a plain
  // "to", "... walked through the carpark to Melville Fish & Chips, ...". A
  // bare "to" only counts when a proper name or street number follows it
  // ("to the car park" names no place).
  const towards = rest.match(/\btowards\s+(.+)$/i);
  const bareTo = towards ? null : rest.match(/\bto\s+(?=[A-Z0-9])(.+)$/);
  const tail = (towards ?? bareTo)?.[1];
  if (!tail) return null;
  const dest = bracketLabelOrSelf(
    extractWalkInTowardsLocation(
      tail
        .replace(/[\s,]*\bentered\b.*$/i, "")
        .replace(/\s+and\s+continued\b.*$/i, "")
        .replace(/[\s,]+$/, "")
    )
  );
  if (!dest || /^Vehicle\b/i.test(dest)) return null;
  return dest;
}

// "... entered and continued out of sight." — an entry with no place named
// after "entered": the place is the one the same sentence just walked to
// ("... walked through the carpark to Melville Fish & Chips, 362 Marmion
// Street, MELVILLE WA (Melville Fish & Chips), entered and continued out of
// sight.").
export const PERSON_ENTER_BARE_PATTERN =
  /\bentered\s+(?:it\s+)?and\s+continued\s+out\s+of\s+sight/i;

// ─── Sightings: "BAIG seated at a table having a meal inside Bull Creek Tavern."
// A row that says where someone IS, with no sentence about how they got there:
// "seated inside", "observed inside", "remains inside", "seen in the beer
// garden of <Place>". Read as being inside that place, the same as having
// walked in. Only "inside"/"within" a named place, or "in the <area> of/at
// <Place>", counts — a bare "seen in Marmion Street" names a street, not a
// building, and "seen in the car park" names no place at all.

const PRESENCE_VERB_RE =
  /\b(?:remains?|remained|remaining|seated|sitting|standing|observed|seen|sighted|present|waiting|dining|eating|drinking|located|having\s+(?:a\s+)?(?:meal|drink|coffee|lunch|dinner|breakfast))\b/i;
const INSIDE_PLACE_RE =
  /\b(?:inside|within)\s+(?:the\s+)?([A-Z0-9][^.;\n]*)|\bin\s+the\s+[a-z][a-z ]{1,40}?\s+(?:of|at)\s+(?:the\s+)?([A-Z0-9][^.;\n]*)/;

/** The place from the text after "inside": anything that follows the place
 * itself ("... with Jason JOHNSON (JOHNSON)", "... while ...", "... and
 * spoke to ...") is cut off FIRST — otherwise a person's bracket
 * ("(JOHNSON)") is read as the place's own short name. A place's own "and"
 * ("Melville Fish and Chips") stays. */
function presencePlace(raw: string): string {
  const place = cutAtDescription(
    raw
      .replace(/\s+(?:with|while|who|as|when|accompanied|together)\b.*$/i, "")
      .replace(/\s+and\s+(?=[a-z]).*$/, "")
  );
  return placeName(place.trim()).trim();
}

// Words that may sit inside a place's own name in lower case ("Melville Fish
// and Chips", "Hotel de Ville", "Kinky Lizard Cafe on Mews") — kept only when a
// capitalised word follows ("Gino's at the bar" stops at "at").
const PLACE_NAME_CONNECTOR_RE =
  /^(?:and|of|the|de|la|le|du|del|von|van|on|at|in|by|near|upon)$/;

/**
 * A place name is written in capitals / digits; what the people were DOING
 * there follows in lower case ("Flight Club Fremantle playing darts",
 * "Gino's at the bar", "Bull Creek Tavern for lunch"). Keeps the leading run of
 * name words and stops at the first lower-case word that isn't a name
 * connector, so the place stays the place they entered and the activity never
 * turns it into a different (un-geocodable) location.
 */
function cutAtDescription(text: string): string {
  const words = text.trim().split(/\s+/);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^[a-z]/.test(w.replace(/^[("'\u2018\u201C]+/, ""))) {
      const next = words[i + 1];
      const connector =
        PLACE_NAME_CONNECTOR_RE.test(w) &&
        next !== undefined &&
        /^[("'\u2018\u201C]*[A-Z0-9]/.test(next);
      if (!connector) break;
    }
    kept.push(w);
  }
  return kept.join(" ");
}

/** Who is where, from a presence sentence; null when it isn't one. */
export function matchPresenceInside(
  text: string,
  known?: ReadonlySet<string>
): { names: string; place: string } | null {
  const bare = matchBareInside(text, known);
  if (bare) return bare;
  const verb = text.match(PRESENCE_VERB_RE);
  if (!verb || verb.index === undefined) return null;
  const names = canonicalNames(
    cleanWalkerNames(text.slice(0, verb.index).trim()),
    known
  );
  // Needs someone named by a capitalised surname (BAIG) — or a surname typed
  // in mixed case ("Doyle") that is written in capitals elsewhere on the
  // sheet (`known`) — and not a negation ("BAIG not observed ...").
  if (!names || personTokensKnown(names, known).length === 0) return null;
  if (/\b(?:not|never|nil|unable)\s*$/i.test(names)) return null;
  const rest = text.slice(verb.index + verb[0].length);
  const m = rest.match(INSIDE_PLACE_RE);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? "").trim();
  if (!raw || /^\(?Vehicle\b/i.test(raw)) return null;
  const place = presencePlace(raw);
  // Everyone the sentence says is with them — before the place ("seated with
  // PARK inside …") or after it ("… inside … with PARK at a table").
  return place
    ? {
        names: withCompanions(
          names,
          companionNames(rest, names, { bareWith: true, known })
        ),
        place,
      }
    : null;
}

/** "BAIG and JONES inside Communicare, ..." — who is where with no verb at
 * all, the form the "Inside" chip writes. Only when the words before "inside"
 * are just names (no movement or vehicle words), and the place is written. */
function matchBareInside(
  text: string,
  known?: ReadonlySet<string>
): { names: string; place: string } | null {
  const m = text.match(
    /^\s*([^.\n]*?)\s+(?:inside|within)\s+(?:the\s+)?([A-Z0-9][^.;\n]*)/
  );
  if (!m) return null;
  const names = cleanWalkerNames(m[1].trim());
  // Only names before "inside": every word capitalised (a surname, a given
  // name, a bracket code) or "and" — never a sentence about what they did.
  if (
    !names ||
    surnameTokens(names).length === 0 ||
    !/^[A-Z][A-Za-z'\u2019()-]*(?:[\s,&]+(?:and\s+)?[A-Z][A-Za-z'\u2019()-]*)*$/.test(
      m[1].trim()
    )
  )
    return null;
  const place = presencePlace(m[2].trim());
  if (!place || place.startsWith("[")) return null;
  return {
    names: withCompanions(
      names,
      companionNames(text, names, { bareWith: true, known })
    ),
    place,
  };
}

export interface WalkScanRow {
  id: number;
  sheetId: number;
  observation: string | null;
}

export interface ScannedWalkIn {
  names: string;
  location: string;
  route: string;
  sheetId: number;
  rowId: number;
}

export interface ScannedHeadingTo {
  names: string;
  /** Where they said they were heading, e.g. "13 Denford Street". */
  destination: string;
  /** Where they left, e.g. "193b Stock Road". */
  from: string;
  /** They got off a boat or vessel ("the boat") and are now on foot. */
  fromVessel?: string;
  /** They got off a bus or train ("the bus", "the 998 train") and are now on
   * foot. */
  fromTransit?: string;
  sheetId: number;
  rowId: number;
}

/**
 * Reads a sheet's rows in order and returns, most recent first:
 *  - walkIns: people who went into a location and have not since left it
 *  - headingTo: people who left a location saying where they were going and
 *    have not since been logged entering it
 */
export interface ScannedPlacement {
  /** The person as written, e.g. "BAIG". */
  name: string;
  /** The vehicle they walked to / got into; "" when the row put them
   * somewhere else (inside a place, on foot). */
  rego: string;
  /** In the vehicle (got in, entered it), as opposed to only walking towards
   * it — which could mean in it or next to it. True for anywhere that is not
   * a vehicle. */
  inside: boolean;
  rowId: number;
  /** The last place they were logged at before this (where they were seen
   * last), when one is known — a vehicle with no arrival row of its own is
   * taken to be around there. */
  at?: string;
  /** Where the vehicle was travelling when a row identified them in it
   * ("Leach Highway, FREMANTLE"). */
  via?: string;
  /** On a boat or vessel ("a vessel", "the white yacht"), as the row wrote
   * it. Set with `rego` "" — they are aboard, not in a vehicle — and with
   * `at` as where they were last logged (where it is taken to be). */
  vessel?: string;
  /** On a bus, train or tram ("a bus", "the 998 train"), as the row wrote it.
   * Set with `rego` "" — they are aboard, not in a car — and with `at` as
   * where they boarded (the stop or station), when a row says. */
  transit?: string;
}

export function scanWalkEvents(rows: WalkScanRow[]): {
  walkIns: ScannedWalkIn[];
  headingTo: ScannedHeadingTo[];
  /** The latest place each person was put by a row — in a vehicle (rego set)
   * or elsewhere (rego ""). Lets a vehicle's occupants include someone who
   * walked to it even when its own rows say "occupant/s not observed", and
   * drop someone who has since been seen anywhere else. */
  placements: ScannedPlacement[];
} {
  const key = (s: string) => s.trim().toLowerCase();
  // People are matched by surname. A surname typed in mixed case ("Johnson")
  // still counts when the same surname is written in capitals anywhere on the
  // sheet ("JOHNSON rear passenger").
  const knownSurnames = new Set(
    rows.flatMap(r => surnameTokens(r.observation ?? ""))
  );
  const tok = (names: string): string[] => {
    const out = surnameTokens(names);
    for (const w of nameWords(names)) {
      if (knownSurnames.has(w) && !out.includes(w)) out.push(w);
    }
    return out;
  };
  // A "names" capture that holds "Vehicle <rego>" is a vehicle's own sentence
  // ("Vehicle 1FAC488, RAHMAN driver, ... arrived at X, entered the car park
  // and continued out of sight"): the vehicle moved, nobody walked. It is
  // never a list of people on foot.
  const isVehicleSubject = (names: string) =>
    /\bVehicle\s+[A-Za-z0-9]{5,8}\b/i.test(names);
  // Heading entries are keyed by destination — except an unwritten one
  // ("[location]"), which several different people can share, so those are
  // keyed by who is walking too.
  const headingKey = (dest: string, names: string) =>
    dest.includes("[") ? `${key(dest)}|${key(names)}` : key(dest);
  const lastWalkIn = new Map<string, ScannedWalkIn & { orderIdx: number }>();
  const walkedOut = new Set<string>();
  const heading = new Map<string, ScannedHeadingTo & { orderIdx: number }>();
  // Rows where someone got off a boat, and from what — a walk read from the
  // same row is "disembarked, on foot" (fromVessel on the heading).
  const disembarkRows = new Map<number, string>();
  // The same for getting off a bus or train: what they got off, and where.
  const alightRows = new Map<number, { transit: string; place: string }>();
  const placed = new Map<string, ScannedPlacement>();
  // The last place each person was logged at (a surname token → the place).
  const lastAt = new Map<string, string>();
  const setAt = (names: string, place: string) => {
    const where = place.trim();
    if (!where || where.startsWith("[")) return;
    for (const t of tok(names)) lastAt.set(t, where);
  };
  const placePeople = (
    names: string,
    rego: string,
    rowId: number,
    inside = true,
    via?: string,
    vessel?: string,
    transit?: string
  ) => {
    for (const p of splitPeopleNames(cleanWalkerNames(names))) {
      const at = tok(p)
        .map(t => lastAt.get(t))
        .find(Boolean);
      const entry: ScannedPlacement = {
        name: p,
        rego: rego.toUpperCase(),
        rowId,
        inside,
        ...(at ? { at } : {}),
        ...(via ? { via } : {}),
        ...(vessel ? { vessel } : {}),
        ...(transit ? { transit } : {}),
      };
      for (const t of tok(p)) placed.set(t, entry);
    }
  };
  // Who the previous sentence was about — "They walked along ... and got into
  // Vehicle X" carries on from "RAHMAN exited A and met an unidentified male
  // (UM1) out the front." (everyone named in that sentence, so UM1 too).
  let lastActors = "";
  const PRONOUN_RE = /^(?:they|both|the\s+(?:two|pair|group)|he|she)$/i;
  const resolveWho = (names: string) => {
    const n = cleanWalkerNames(names);
    return PRONOUN_RE.test(n) && lastActors ? lastActors : n;
  };
  const noteActors = (names: string, sentence: string) => {
    const base = cleanWalkerNames(names);
    if (!base || PRONOUN_RE.test(base)) return;
    const extra = (sentence.match(/\bU[MFCP]\d+\b/g) ?? []).filter(
      c => !tok(base).includes(c)
    );
    lastActors = [base, ...extra].join(" and ");
  };
  const noteJoined = (
    names: string,
    rego: string,
    rowId: number,
    inside = true
  ) => placePeople(names, rego, rowId, inside);
  // They are on their way to / back in a vehicle, so no longer inside the
  // place they were last logged in, whether or not the row says they left it.
  const leaveAllPlaces = (names: string) => {
    const who = new Set(tok(names));
    if (who.size === 0) return;
    for (const [k, v] of Array.from(lastWalkIn.entries())) {
      const tokens = tok(v.names);
      if (tokens.length > 0 && tokens.every(t => who.has(t))) {
        lastWalkIn.delete(k);
      }
    }
  };
  // Some or all of the people logged inside a place walk out of it. When only
  // some do, the rest are still inside.
  const leavePlace = (place: string, walkers: string) => {
    const k = key(place);
    const who = new Set(tok(walkers));
    const cur = lastWalkIn.get(k);
    if (cur && who.size > 0) {
      const all = splitPeopleNames(cur.names);
      const remaining = all.filter(p => !tok(p).some(t => who.has(t)));
      if (remaining.length > 0 && remaining.length < all.length) {
        lastWalkIn.set(k, { ...cur, names: remaining.join(" and ") });
        return;
      }
    }
    walkedOut.add(k);
  };
  // Drops any "heading to" entry belonging to these people — they have
  // since gone somewhere else or got back to a vehicle.
  const clearHeadingFor = (names: string) => {
    const who = new Set(tok(names));
    if (who.size === 0) return;
    for (const [k, v] of Array.from(heading.entries())) {
      if (tok(v.names).some(t => who.has(t))) heading.delete(k);
    }
  };

  expandRowSegments(rows).forEach((row, idx) => {
    // Street types are read in full ("Robert St" = "Robert Street"), so a
    // place written both ways across rows is still one place.
    let text = fullStreetTypes(row.observation ?? "");
    if (!text) return;
    const where = { sheetId: row.sheetId, rowId: row.id, orderIdx: idx };

    // A vehicle arriving at an address with named people in it puts them there:
    // it is where they were last logged (a later boarding, or a walk away from
    // the vehicle, is "from" here). Without this the logger kept an older place
    // ("Last seen at DRIVO Carpark") and the flag went to it.
    const arrival = matchVehicleArrival(text);
    if (arrival) {
      const arrivedAt = extractArrivalAddress(text);
      const arrivedPeople = splitPeopleNames(
        extractOccupantNames(arrival.occupantDesc)
      ).filter(p => !isUnseenOccupants(p));
      if (arrivedAt && arrivedPeople.length > 0)
        setAt(arrivedPeople.join(" and "), bracketLabelOrSelf(arrivedAt));
    }

    // A vehicle seen on the move that names who is in it ("Vehicle 1FAT001,
    // HOGAN driver and sole occupant, travelled on Leach Highway, FREMANTLE
    // and continued via:"): they are in that vehicle now, so no longer inside
    // the place they were last logged at, and no longer walking anywhere.
    const sighting = matchVehicleSighting(text);
    if (sighting) {
      const people = splitPeopleNames(
        extractOccupantNames(sighting.occupantDesc)
      ).filter(p => !isUnseenOccupants(p));
      if (people.length > 0) {
        const who = people.join(" and ");
        placePeople(who, sighting.rego, row.id, true, sighting.route);
        leaveAllPlaces(who);
        clearHeadingFor(who);
      }
      return;
    }

    // A vehicle departure that names who is in it ("Vehicle 1FAT001, HOGAN
    // driver, CORNELL front passenger, departed DRIVO Carpark and continued
    // via:"): the later row wins, so they are in the vehicle now and no longer
    // "inside" the place an earlier row put them. Unseen occupants say
    // nothing about anyone, so those leave the walk-ins alone.
    const departure = text.match(VEHICLE_DEPART_PATTERN);
    if (departure) {
      const people = splitPeopleNames(
        extractOccupantNames(departure[2])
      ).filter(p => !isUnseenOccupants(p) && !/\bunidentified\b/i.test(p));
      if (people.length > 0) {
        const who = people.join(" and ");
        const leftFrom = extractDepartureAddress(text);
        if (leftFrom) setAt(who, bracketLabelOrSelf(leftFrom));
        placePeople(who, departure[1].toUpperCase(), row.id, true);
        leaveAllPlaces(who);
        clearHeadingFor(who);
      }
    }

    // Getting onto a bus or train ("HOGAN boarded a bus at Bus Stop Stirling
    // Highway After Eric Street ..."): aboard until a later row puts them
    // somewhere else. Where they boarded is where they were last logged.
    const tBoarding = matchTransitBoarding(text);
    if (tBoarding) {
      const who = resolveWho(tBoarding.names);
      if (who && !isVehicleSubject(who)) {
        if (tBoarding.place) setAt(who, bracketLabelOrSelf(tBoarding.place));
        placePeople(
          who,
          "",
          row.id,
          true,
          undefined,
          undefined,
          transitLabelText(tBoarding.transit)
        );
        leaveAllPlaces(who);
        clearHeadingFor(who);
        noteActors(tBoarding.names, text);
        return;
      }
    }
    // Getting off ("alighted from the bus at Bus Stop …", "got off the
    // train"): on foot from where they got off. The word alone ("alighted and
    // walked …") counts only for someone already on a bus or train.
    const tAlighting = matchTransitAlighting(text, names =>
      tok(cleanWalkerNames(names)).some(t => !!placed.get(t)?.transit)
    );
    if (tAlighting) {
      const who = resolveWho(tAlighting.names);
      if (who && !isVehicleSubject(who)) {
        const was =
          tAlighting.transit ||
          tok(who)
            .map(t => placed.get(t)?.transit)
            .find(Boolean) ||
          "the bus";
        const place = tAlighting.place
          ? bracketLabelOrSelf(tAlighting.place)
          : (tok(who)
              .map(t => lastAt.get(t))
              .find(Boolean) ?? "");
        if (place) setAt(who, place);
        placePeople(who, "", row.id, true);
        noteActors(tAlighting.names, text);
        alightRows.set(row.id, { transit: was, place });
        clearHeadingFor(who);
        // On foot from the stop, nowhere named yet — a walk written in the
        // same row replaces this and keeps the place it left.
        heading.set(headingKey("[location]", who), {
          names: who,
          destination: "[location]",
          from: place,
          ...where,
        });
        text = stripTransitAlighting(text);
      }
    }

    // Getting onto a boat or vessel ("HOGAN boarded a vessel at the end of
    // the jetty."): they are aboard now — not inside a place, not walking —
    // until a later row puts them somewhere else. Getting off ("disembarked",
    // "got off the boat") puts them back on foot; whatever else the sentence
    // says ("... and walked along the jetty") is still read below.
    const boarding = matchVesselBoarding(text);
    if (boarding) {
      const who = resolveWho(boarding.names);
      if (who && !isVehicleSubject(who)) {
        placePeople(
          who,
          "",
          row.id,
          true,
          undefined,
          vesselLabel(boarding.vessel)
        );
        leaveAllPlaces(who);
        clearHeadingFor(who);
        noteActors(boarding.names, text);
        return;
      }
    }
    const disembark = matchVesselDisembark(text);
    if (disembark) {
      const who = resolveWho(disembark.names);
      if (who && !isVehicleSubject(who)) {
        placePeople(who, "", row.id, true);
        noteActors(disembark.names, text);
        disembarkRows.set(row.id, disembark.vessel || "the vessel");
        // Read what is left as ordinary walking, so the walker is "HOGAN",
        // not "HOGAN disembarked from the boat and".
        text = stripVesselLeave(text);
      }
    }

    const outMatch = text.match(WALK_OUT_PATTERN);
    if (outMatch) {
      leavePlace(
        outMatch[1],
        text.match(/([A-Za-z][^.\n]*?)\s*\bexited\b/)?.[1] ?? ""
      );
      // They walked back to this vehicle.
      const who = text.match(/([A-Za-z][^.\n]*?)\s*\bexited\b/);
      // Walked towards it — not necessarily in it.
      if (who) noteJoined(who[1], outMatch[3], row.id, false);
      return;
    }

    // The place this row says they walked to, and who walked — used if the
    // same row then says they "entered and continued out of sight".
    let rowDest: string | null = null;
    let rowWalkers = "";

    // A non-vehicle exit. Not a `return`: the same row can go on to say
    // where they entered next. Also leaving a place and carrying on with no
    // "walked" (see PERSON_EXIT_ONWARD_PATTERN).
    let exitMatch: RegExpMatchArray | null = text.match(PERSON_EXIT_PATTERN);
    if (!exitMatch) {
      const onward = text.match(PERSON_EXIT_ONWARD_PATTERN);
      if (onward && !/\bVehicle\b/i.test(onward[1])) exitMatch = onward;
    }
    if (exitMatch && isVehicleSubject(exitMatch[1])) exitMatch = null;
    if (exitMatch) {
      const from = exitMatch[2].trim();
      leavePlace(from, cleanWalkerNames(exitMatch[1]));
      const dest = extractExitDestination(exitMatch[3]);
      rowDest = dest;
      rowWalkers = cleanWalkerNames(exitMatch[1]);
      noteActors(exitMatch[1], text);
      setAt(rowWalkers, bracketLabelOrSelf(from));
      // On foot now, wherever they were (a vehicle below overrides this).
      placePeople(rowWalkers, "", row.id);
      // Walked back to, or got into, a vehicle: they are in it, not walking.
      const enteredReg = exitMatch[3].match(ENTER_VEHICLE_REGO_RE)?.[1];
      const towardsReg = exitMatch[3].match(
        /\b(?:towards|to)\s+(and\s+entered\s+)?\(?Vehicle\s+([A-Za-z0-9]{5,8})/i
      );
      const vehReg = enteredReg ?? towardsReg?.[2];
      if (vehReg) {
        // Got in, versus only walking towards it.
        noteJoined(
          rowWalkers,
          vehReg,
          row.id,
          !!enteredReg || !!towardsReg?.[1]
        );
        leaveAllPlaces(rowWalkers);
      } else if (dest) {
        heading.set(headingKey(dest, cleanWalkerNames(exitMatch[1])), {
          names: cleanWalkerNames(exitMatch[1]),
          destination: dest,
          from,
          ...where,
        });
      } else if (rowWalkers) {
        // Walking on with no destination written: on foot, heading
        // "[location]" until an entry says where.
        clearHeadingFor(rowWalkers);
        heading.set(headingKey("[location]", rowWalkers), {
          names: rowWalkers,
          destination: "[location]",
          from,
          ...where,
        });
      }
    }

    // Getting into a vehicle with no exit in the row ("BAIG got into
    // Vehicle 1ABC23").
    if (!exitMatch) {
      const ev = text.match(PERSON_ENTER_VEHICLE_PATTERN);
      if (ev && !/\bVehicle\b/i.test(ev[1])) {
        const who = resolveWho(ev[1]);
        if (who) {
          noteJoined(who, ev[2], row.id);
          leaveAllPlaces(who);
          clearHeadingFor(who);
        }
      }
    }

    const record = (names: string, location: string, route: string) => {
      setAt(names, location);
      const k = key(location);
      lastWalkIn.set(k, { names, location, route, ...where });
      walkedOut.delete(k);
      heading.delete(k);
      clearHeadingFor(names);
      placePeople(names, "", row.id);
    };

    const inMatch = text.match(WALK_IN_PATTERN);
    if (inMatch) {
      record(
        inMatch[1].trim(),
        bracketLabelOrSelf(inMatch[3].trim()),
        inMatch[2]?.trim() ?? ""
      );
      return;
    }
    const towardsMatch = text.match(WALK_IN_TOWARDS_PATTERN);
    if (towardsMatch) {
      const rawRoute = towardsMatch[2].trim();
      record(
        towardsMatch[1].trim(),
        extractWalkInTowardsLocation(rawRoute),
        extractWalkInTowardsRoute(rawRoute)
      );
      return;
    }
    // Left a parked vehicle and walked off: they are now walking, heading
    // for the named place, or just away ("[location]" until it is written).
    const vehicleWalk = text.match(PERSON_EXIT_VEHICLE_WALK_PATTERN);
    if (vehicleWalk && !/\bentered\b/i.test(vehicleWalk[2])) {
      const walkers = cleanWalkerNames(vehicleWalk[1]);
      const dest = extractExitDestination(vehicleWalk[2]) ?? "[location]";
      clearHeadingFor(walkers);
      placePeople(walkers, "", row.id);
      heading.set(headingKey(dest, walkers), {
        names: walkers,
        destination: dest,
        from: "the vehicle",
        ...where,
      });
      return;
    }

    // Already on foot (no "exited" in the row): back to a vehicle, or on to
    // another place.
    if (!exitMatch) {
      const walkMatch = text.match(PERSON_WALK_PATTERN);
      if (walkMatch && !isVehicleSubject(walkMatch[1])) {
        const walkers = resolveWho(walkMatch[1]);
        // "walked towards Vehicle X", "walked to Vehicle X" and "walked to
        // and entered Vehicle X" all mean they are back at the car.
        const toVehicle =
          /\b(?:towards|to)\s+(?:and\s+entered\s+)?\(?Vehicle\s+[A-Za-z0-9]{5,8}|\bentered\s+\(?Vehicle\s+[A-Za-z0-9]{5,8}/i.test(
            walkMatch[2]
          );
        const dest = toVehicle ? null : extractExitDestination(walkMatch[2]);
        if (toVehicle) {
          const reg = walkMatch[2].match(
            /\b(?:towards|to)\s+(and\s+entered\s+)?\(?Vehicle\s+([A-Za-z0-9]{5,8})|\bentered\s+\(?Vehicle\s+([A-Za-z0-9]{5,8})/i
          );
          const rego = reg?.[2] ?? reg?.[3];
          if (rego) {
            // "walked towards Vehicle X" is not "got into Vehicle X" — unless
            // the same sentence then says they got in ("… to Vehicle X, and
            // entered via the driver's door").
            noteJoined(
              walkers,
              rego,
              row.id,
              !!reg?.[1] ||
                !!reg?.[3] ||
                GOT_IN_AFTER_VEHICLE.test(walkMatch[2])
            );
            leaveAllPlaces(walkers);
          }
        }
        const previous = Array.from(heading.values()).find(h =>
          tok(h.names).some(t => tok(walkers).includes(t))
        );
        // Getting off a bus or train and walking on with no place written
        // keeps the "on foot from the stop" entry made above.
        if (!(alightRows.has(row.id) && !dest && !toVehicle))
          clearHeadingFor(walkers);
        rowDest = dest;
        rowWalkers = walkers;
        if (dest) {
          placePeople(walkers, "", row.id);
          heading.set(headingKey(dest, walkers), {
            names: walkers,
            destination: dest,
            from: previous?.from ?? "",
            ...where,
          });
        }
      }
    }

    // "... walked to X, entered and continued out of sight." — they are now
    // inside X, not merely heading there.
    if (rowDest && PERSON_ENTER_BARE_PATTERN.test(text)) {
      record(rowWalkers, rowDest, "");
      return;
    }

    // "ROCHA arrived on foot at <place>.": at that place now, on foot.
    const arrivedOnFoot = text.match(PERSON_ARRIVE_ON_FOOT_PATTERN);
    if (arrivedOnFoot && !isVehicleSubject(arrivedOnFoot[1])) {
      record(
        cleanWalkerNames(arrivedOnFoot[1]),
        bracketLabelOrSelf(arrivedOnFoot[2]),
        ""
      );
      return;
    }

    const directMatch = text.match(PERSON_ENTER_PATTERN);
    if (directMatch && !isVehicleSubject(directMatch[1])) {
      const walkers = cleanWalkerNames(directMatch[1]);
      record(
        withCompanions(
          walkers,
          companionNames(directMatch[2], walkers, { known: knownSurnames })
        ),
        bracketLabelOrSelf(directMatch[2]),
        ""
      );
      return;
    }

    // Any other "entered <Place>" (see PERSON_ENTER_ANY_PATTERN).
    const anyEnter = text.match(PERSON_ENTER_ANY_PATTERN);
    if (anyEnter && !isVehicleSubject(anyEnter[1])) {
      if (/^\(?Vehicle\b/i.test(anyEnter[2])) {
        // Back in a vehicle: no longer walking anywhere.
        clearHeadingFor(cleanWalkerNames(anyEnter[1]));
        const reg = anyEnter[2].match(/Vehicle\s+([A-Za-z0-9]{5,8})/i);
        if (reg) {
          noteJoined(anyEnter[1], reg[1], row.id);
          leaveAllPlaces(cleanWalkerNames(anyEnter[1]));
        }
      } else {
        const walkers = cleanWalkerNames(anyEnter[1]);
        record(
          withCompanions(
            walkers,
            companionNames(anyEnter[2], walkers, { known: knownSurnames })
          ),
          placeName(anyEnter[2]),
          ""
        );
        return;
      }
    }

    // A sighting: "BAIG seated ... inside <Place>." — inside that place now,
    // and so no longer wherever they were last logged.
    const presence = matchPresenceInside(text, knownSurnames);
    if (presence && !isVehicleSubject(presence.names)) {
      const who = new Set(tok(presence.names));
      for (const [k, v] of Array.from(lastWalkIn.entries())) {
        if (k === key(presence.place)) continue;
        const tokens = tok(v.names);
        if (tokens.length > 0 && tokens.every(t => who.has(t))) {
          lastWalkIn.delete(k);
        }
      }
      record(presence.names, presence.place, "");
      return;
    }

    // A plain exit with no "walked" after it (see PERSON_EXIT_ANY_PATTERN).
    if (!exitMatch) {
      const anyExit = text.match(PERSON_EXIT_ANY_PATTERN);
      if (
        anyExit &&
        !/^\(?Vehicle\b/i.test(anyExit[2]) &&
        !isVehicleSubject(anyExit[1])
      ) {
        const walkers = cleanWalkerNames(anyExit[1]);
        const from = placeName(anyExit[2]);
        leavePlace(from, walkers);
        setAt(walkers, from);
        placePeople(walkers, "", row.id);
        noteActors(anyExit[1], text);
        // Out of the place and not into a vehicle: on foot, with nothing
        // said about where to — "departed on foot" from that place until a
        // later row says where they went.
        if (
          walkers &&
          !PRONOUN_RE.test(walkers) &&
          !/\bVehicle\b|\bentered\b|\bboarded\b|\b(?:got|climbed|jumped)\s+(?:in|into)\b/i.test(
            text
          )
        ) {
          clearHeadingFor(walkers);
          heading.set(headingKey("[location]", walkers), {
            names: walkers,
            destination: "[location]",
            from,
            ...where,
          });
        }
      }
    }
  });

  const byRecent = <T extends { orderIdx: number }>(a: T, b: T) =>
    b.orderIdx - a.orderIdx;
  const walkIns = Array.from(lastWalkIn.entries())
    .filter(([k]) => !walkedOut.has(k))
    .map(([, v]) => v)
    .sort(byRecent)
    .map(({ orderIdx: _o, ...rest }) => rest);
  const headingTo = Array.from(heading.values())
    .sort(byRecent)
    .map(({ orderIdx: _o, ...rest }) => {
      const alight = alightRows.get(rest.rowId);
      if (alight)
        return {
          ...rest,
          from: rest.from || alight.place,
          fromTransit: alight.transit,
        };
      return disembarkRows.has(rest.rowId)
        ? { ...rest, fromVessel: disembarkRows.get(rest.rowId)! }
        : rest;
    });
  return {
    walkIns,
    headingTo,
    placements: Array.from(new Set(placed.values())),
  };
}

/** Splits a names string ("BAIG and JORDAN", "HOGAN, Denise HOLLY (HOLLY)")
 * into one entry per person. */
export function splitPeopleNames(names: string): string[] {
  return names
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map(n => n.trim())
    .filter(Boolean);
}

/** The surname-style tokens of a name: the sheet convention writes surnames
 * in capitals ("BAIG", "Denise HOLLY (HOLLY)"), so matching on those avoids
 * confusing two people who share a first name. */
export function surnameTokens(name: string): string[] {
  // A surname (BAIG), or the short name of an unidentified person (UM1, UF2,
  // UC1, UP1), which has a digit and so is not a plain capitalised word.
  return name.match(/\b[A-Z][A-Z'-]+\b|\bU[MFCP]\d+\b/g) ?? [];
}

/** Every word of a name in upper case, whatever case it was typed in — so
 * "Johnson" typed in a sentence can be matched to the "JOHNSON" a vehicle's
 * occupants were written with. Includes the short names of unidentified
 * people (UM1). Matching only, never shown. */
export function nameWords(name: string): string[] {
  return (name.match(/U[MFCP]\d+|[A-Za-z][A-Za-z'-]+/gi) ?? []).map(w =>
    w.toUpperCase()
  );
}

/**
 * Of the people a vehicle's occupant description names, who is still
 * in it? Anyone currently logged as inside an address or walking somewhere
 * (`onFootNames`) has left the vehicle — a parked vehicle's arrival row
 * still lists them, so without this the vehicle card keeps saying they are
 * in the car after they have walked off.
 */
export function occupantsStillInVehicle(
  occupantNames: string,
  onFootNames: string[]
): string[] {
  const onFoot = new Set(onFootNames.flatMap(n => nameWords(n)));
  return splitPeopleNames(occupantNames).filter(
    p => !isUnseenOccupants(p) && !surnameTokens(p).some(t => onFoot.has(t))
  );
}

/** "occupant/s not observed", "unseen occupant/s" — a placeholder for people
 * who were not seen, not a person. */
export function isUnseenOccupants(p: string): boolean {
  return (
    /occupant/i.test(p) && /\b(?:not\s+(?:observed|seen)|unseen)\b/i.test(p)
  );
}

/** Merges two lists of people, dropping a second entry whose surname is
 * already in the first. */
export function mergePeople(a: string[], b: string[]): string[] {
  const out = [...a];
  const have = new Set(a.flatMap(n => surnameTokens(n)));
  for (const p of b) {
    const tokens = surnameTokens(p);
    if (tokens.length > 0 && tokens.some(t => have.has(t))) continue;
    out.push(p);
    tokens.forEach(t => have.add(t));
  }
  return out;
}

/** A vehicle row (arrival or departure) as the cards see it. */
export interface VehicleOccupantSource {
  rego: string;
  rowId: number;
  /** Occupant names as that row wrote them (already extracted). */
  names: string;
}

/**
 * Who is in a vehicle, with a person only ever in ONE vehicle — the one the
 * most recent row puts them in. The vehicle's own row names its occupants,
 * and anyone logged walking to / getting into it (`placements`) is added; but
 * a person a LATER row puts anywhere else — another vehicle, inside a place,
 * on foot — is no longer in it, and one this vehicle's row names has left a vehicle they
 * joined before it.
 */
export function vehicleOccupants(
  self: VehicleOccupantSource,
  onFootNames: string[],
  placements: { name: string; rego: string; rowId: number }[],
  all: VehicleOccupantSource[]
): string[] {
  const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();
  const overlaps = (a: string, b: string) => {
    const t = nameWords(b);
    return surnameTokens(a).some(x => t.includes(x));
  };
  const own = occupantsStillInVehicle(self.names, onFootNames).filter(
    p =>
      !placements.some(
        j =>
          !same(j.rego, self.rego) &&
          j.rowId > self.rowId &&
          overlaps(p, j.name)
      )
  );
  const joinedHere = placements
    .filter(j => same(j.rego, self.rego))
    .filter(
      j =>
        !all.some(
          o =>
            !same(o.rego, self.rego) &&
            o.rowId > j.rowId &&
            overlaps(j.name, o.names)
        )
    )
    .map(j => j.name);
  return mergePeople(
    own,
    occupantsStillInVehicle(joinedHere.join(" and "), onFootNames)
  );
}

/**
 * Of a vehicle's occupants, those a later row only had walking TOWARDS it
 * ("BAIG walked towards Vehicle 1EXP123") rather than getting in — they could
 * be in it or next to it, so they are described as "to vehicle", not "in".
 */
export function occupantsToVehicle(
  self: { rego: string; rowId: number },
  occupants: string[],
  placements: {
    name: string;
    rego: string;
    rowId: number;
    inside?: boolean;
  }[]
): string[] {
  return occupants.filter(o =>
    placements.some(
      p =>
        p.inside === false &&
        p.rego.toUpperCase() === self.rego.toUpperCase() &&
        p.rowId > self.rowId &&
        surnameTokens(o).some(t => nameWords(p.name).includes(t))
    )
  );
}

/**
 * The vehicle's occupants as originally worded ("BAIG driver UM1 front
 * passenger and JOHNSON rear passenger"), cut down to those still in it, so a
 * departure keeps the officer's own roles. The whole wording when nobody has
 * left; just the parts for those who remain when someone has; null when it
 * can't be done cleanly (a part names both someone who left and someone who
 * stayed, or a remaining person isn't in the wording) — the caller then lists
 * their names instead.
 */
export function occupantWording(
  desc: string,
  remaining: string[]
): string | null {
  const keep = new Set(remaining.flatMap(r => surnameTokens(r)));
  if (keep.size === 0) return null;
  const parts = desc.split(/\s*,\s*|\s+and\s+/i).filter(p => p.trim());
  const inDesc = new Set(parts.flatMap(p => surnameTokens(p)));
  if (Array.from(keep).some(t => !inDesc.has(t))) return null;
  const kept: string[] = [];
  let dropped = false;
  for (const part of parts) {
    const t = surnameTokens(part);
    if (t.length === 0) {
      kept.push(part.trim());
    } else if (t.every(x => keep.has(x))) {
      kept.push(part.trim());
    } else if (t.some(x => keep.has(x))) {
      return null;
    } else {
      dropped = true;
    }
  }
  return dropped ? kept.join(", ") : desc.trim();
}

/**
 * True when a row's text is one the continuity logic reads as a movement —
 * a vehicle arriving/departing, someone entering, exiting or walking
 * somewhere. Used to tell a row the position logic UNDERSTOOD (so the
 * position it produced is trustworthy) from one that names the target
 * alongside a movement word but matched none of the known phrasings (so the
 * position may be stale).
 */
export function isReadAsMovement(
  text: string,
  known?: ReadonlySet<string>
): boolean {
  if (!text) return false;
  if (
    matchVehicleArrival(text) ||
    VEHICLE_DEPART_PATTERN.test(text) ||
    matchVehicleSighting(text) ||
    matchVesselBoarding(text) ||
    matchVesselDisembark(text) ||
    matchTransitBoarding(text) ||
    matchTransitAlighting(text)
  ) {
    return true;
  }
  if (
    WALK_OUT_PATTERN.test(text) ||
    WALK_IN_PATTERN.test(text) ||
    WALK_IN_TOWARDS_PATTERN.test(text) ||
    PERSON_ENTER_PATTERN.test(text) ||
    PERSON_ARRIVE_ON_FOOT_PATTERN.test(text) ||
    PERSON_EXIT_PATTERN.test(text) ||
    (PERSON_EXIT_ONWARD_PATTERN.test(text) &&
      !/\bVehicle\b/i.test(text.split(/\b(?:exited|departed|left)\b/i)[0])) ||
    PERSON_EXIT_VEHICLE_WALK_PATTERN.test(text) ||
    PERSON_WALK_PATTERN.test(text)
  ) {
    return true;
  }
  const enter = text.match(PERSON_ENTER_ANY_PATTERN);
  if (enter && !/^\(?Vehicle\b/i.test(enter[2])) return true;
  const exit = text.match(PERSON_EXIT_ANY_PATTERN);
  if (exit && !/^\(?Vehicle\b/i.test(exit[2])) return true;
  if (matchPresenceInside(text, known)) return true;
  return false;
}
