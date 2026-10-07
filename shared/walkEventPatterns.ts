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
  VEHICLE_DEPART_PATTERN,
  matchVehicleArrival,
} from "./vehicleEventPatterns";
import { expandRowSegments } from "./rowSegments";

export const WALK_IN_PATTERN =
  /([A-Za-z][^.\n]*?)\s*exited the vehicle,?\s*(?:walked\s+(.+?),?\s*)?entered\s+(.+?)\s+and continued out of sight/i;

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
export const WALK_IN_TOWARDS_PATTERN =
  /([A-Za-z][^.\n]*?)\s*exited the vehicle,?\s*walked\s+(.+?)\s+and continued out of sight/i;

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

export const PERSON_EXIT_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\bexited\s+(?!the\s+vehicle\b)(.+?)\s*,?\s*(?:and\s+)?walked\b([^.\n]*)/i;

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
  /([A-Za-z][^.\n]*?)\s*\bexited\s+([A-Z0-9][^.\n]*?)(?:\s+and\s+(?:walked|entered|continued|got|returned|drove|left)\b|[,.]|$)/;

// Leaving a place and carrying on without saying where to — "exited
// Communicare and walked along Cantonment Street", "departed X and continued
// via ...", "left X and continued walking via ...", "walked out of X and
// walked on". Anything that leaves a place followed by a walking term. The
// walkers are on foot with no destination logged yet, so they are
// "walking" until an entry is. (A vehicle's own departure — "Vehicle 1HIB84,
// BAIG driver, departed X and continued via" — is excluded by the caller: its
// names text names a Vehicle.)
export const PERSON_EXIT_ONWARD_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\b(?:exited|departed|left|walked\s+out\s+of|came\s+out\s+of|emerged\s+from)\s+(?!the\s+vehicle\b)([A-Z0-9][^.\n]*?)\s*,?\s*(?:(?:and|then)\s+)*(?:continued|walking|walked|proceeded|headed|moved\s+on|went|on\s+foot)\b([^.\n]*)/;

/** A place as written inside a longer sentence, reduced to the name later
 * mentions use: its bracket label if it has one, else its first
 * comma-separated segment ("Melville Fish & Chips, 362 Marmion Street,
 * MELVILLE WA" → "Melville Fish & Chips"). */
function placeName(raw: string): string {
  const b = raw.match(/\(([^)]{1,80})\)/);
  if (b) return b[1].trim();
  return raw.split(",")[0].trim();
}

// "BAIG exited the vehicle and walked towards 13 Denford Street." — they left
// a parked vehicle and walked off (no entry yet). Same shape as an exit from an
// address, with the vehicle as the place left. (With an "entered ..." clause
// the row is a walk-in, handled by WALK_IN_PATTERN instead.)
export const PERSON_EXIT_VEHICLE_WALK_PATTERN =
  /([A-Za-z][^.\n]*?)\s*\bexited\s+the\s+vehicle\b,?\s*(?:and\s+)?walked\b([^.\n]*)/i;

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
  return (b ? b[1] : location).trim();
}

/** The place a vehicle's departure row says it left ("... departed 77
 * Reynolds Rd and continued via:"), reduced to its bracket label when written
 * as a full address. Null when none is written. */
export function extractDepartureAddress(text: string): string | null {
  const m = text.match(
    /\b(?:departed|reversed out of|reversed from)\s+(.+?)(?=\s+(?:and\s+(?:continued|travelled|headed|drove|left)|via|towards)\b|[,.:;\n]|$)/i
  );
  if (!m) return null;
  const place = bracketLabelOrSelf(m[1]).trim();
  return place || null;
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

/** Who is where, from a presence sentence; null when it isn't one. */
export function matchPresenceInside(
  text: string
): { names: string; place: string } | null {
  const bare = matchBareInside(text);
  if (bare) return bare;
  const verb = text.match(PRESENCE_VERB_RE);
  if (!verb || verb.index === undefined) return null;
  const names = cleanWalkerNames(text.slice(0, verb.index).trim());
  // Needs someone named by a capitalised surname (BAIG), and not a
  // negation ("BAIG not observed ...").
  if (!names || surnameTokens(names).length === 0) return null;
  if (/\b(?:not|never|nil|unable)\s*$/i.test(names)) return null;
  const rest = text.slice(verb.index + verb[0].length);
  const m = rest.match(INSIDE_PLACE_RE);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? "").trim();
  if (!raw || /^\(?Vehicle\b/i.test(raw)) return null;
  const place = placeName(raw)
    .replace(/\s+(?:with|and|while|who|as|when)\b.*$/i, "")
    .trim();
  return place ? { names, place } : null;
}

/** "BAIG and JONES inside Communicare, ..." — who is where with no verb at
 * all, the form the "Inside" chip writes. Only when the words before "inside"
 * are just names (no movement or vehicle words), and the place is written. */
function matchBareInside(
  text: string
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
  const place = placeName(m[2].trim())
    .replace(/\s+(?:with|and|while|who|as|when)\b.*$/i, "")
    .trim();
  if (!place || place.startsWith("[")) return null;
  return { names, place };
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
  rowId: number;
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
  // Heading entries are keyed by destination — except an unwritten one
  // ("[location]"), which several different people can share, so those are
  // keyed by who is walking too.
  const headingKey = (dest: string, names: string) =>
    dest.includes("[") ? `${key(dest)}|${key(names)}` : key(dest);
  const lastWalkIn = new Map<string, ScannedWalkIn & { orderIdx: number }>();
  const walkedOut = new Set<string>();
  const heading = new Map<string, ScannedHeadingTo & { orderIdx: number }>();
  const placed = new Map<string, ScannedPlacement>();
  const placePeople = (names: string, rego: string, rowId: number) => {
    for (const p of splitPeopleNames(cleanWalkerNames(names))) {
      const entry = { name: p, rego: rego.toUpperCase(), rowId };
      for (const t of surnameTokens(p)) placed.set(t, entry);
    }
  };
  const noteJoined = (names: string, rego: string, rowId: number) =>
    placePeople(names, rego, rowId);
  // They are on their way to / back in a vehicle, so no longer inside the
  // place they were last logged in, whether or not the row says they left it.
  const leaveAllPlaces = (names: string) => {
    const who = new Set(surnameTokens(names));
    if (who.size === 0) return;
    for (const [k, v] of Array.from(lastWalkIn.entries())) {
      const tokens = surnameTokens(v.names);
      if (tokens.length > 0 && tokens.every(t => who.has(t))) {
        lastWalkIn.delete(k);
      }
    }
  };
  // Drops any "heading to" entry belonging to these people — they have
  // since gone somewhere else or got back to a vehicle.
  const clearHeadingFor = (names: string) => {
    const who = new Set(surnameTokens(names));
    if (who.size === 0) return;
    for (const [k, v] of Array.from(heading.entries())) {
      if (surnameTokens(v.names).some(t => who.has(t))) heading.delete(k);
    }
  };

  expandRowSegments(rows).forEach((row, idx) => {
    const text = row.observation;
    if (!text) return;
    const where = { sheetId: row.sheetId, rowId: row.id, orderIdx: idx };

    const outMatch = text.match(WALK_OUT_PATTERN);
    if (outMatch) {
      walkedOut.add(key(outMatch[1]));
      // They walked back to this vehicle.
      const who = text.match(/([A-Za-z][^.\n]*?)\s*\bexited\b/);
      if (who) noteJoined(who[1], outMatch[3], row.id);
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
    if (exitMatch) {
      const from = exitMatch[2].trim();
      walkedOut.add(key(from));
      const dest = extractExitDestination(exitMatch[3]);
      rowDest = dest;
      rowWalkers = cleanWalkerNames(exitMatch[1]);
      // On foot now, wherever they were (a vehicle below overrides this).
      placePeople(rowWalkers, "", row.id);
      if (dest) {
        heading.set(headingKey(dest, cleanWalkerNames(exitMatch[1])), {
          names: cleanWalkerNames(exitMatch[1]),
          destination: dest,
          from,
          ...where,
        });
      } else {
        // "... walked towards Vehicle X": heading back to the car.
        const reg = exitMatch[3].match(
          /\b(?:towards|to)\s+(?:and\s+entered\s+)?\(?Vehicle\s+([A-Za-z0-9]{5,8})/i
        );
        if (reg) {
          noteJoined(rowWalkers, reg[1], row.id);
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
    }

    const record = (names: string, location: string, route: string) => {
      const k = key(location);
      lastWalkIn.set(k, { names, location, route, ...where });
      walkedOut.delete(k);
      heading.delete(k);
      clearHeadingFor(names);
      placePeople(names, "", row.id);
    };

    const inMatch = text.match(WALK_IN_PATTERN);
    if (inMatch) {
      record(inMatch[1].trim(), inMatch[3].trim(), inMatch[2]?.trim() ?? "");
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
      if (walkMatch) {
        const walkers = cleanWalkerNames(walkMatch[1]);
        // "walked towards Vehicle X", "walked to Vehicle X" and "walked to
        // and entered Vehicle X" all mean they are back at the car.
        const toVehicle =
          /\b(?:towards|to)\s+(?:and\s+entered\s+)?\(?Vehicle\s+[A-Za-z0-9]{5,8}|\bentered\s+\(?Vehicle\s+[A-Za-z0-9]{5,8}/i.test(
            walkMatch[2]
          );
        const dest = toVehicle ? null : extractExitDestination(walkMatch[2]);
        if (toVehicle) {
          const reg = walkMatch[2].match(
            /\b(?:towards|to)\s+(?:and\s+entered\s+)?\(?Vehicle\s+([A-Za-z0-9]{5,8})|\bentered\s+\(?Vehicle\s+([A-Za-z0-9]{5,8})/i
          );
          const rego = reg?.[1] ?? reg?.[2];
          if (rego) {
            noteJoined(walkers, rego, row.id);
            leaveAllPlaces(walkers);
          }
        }
        const previous = Array.from(heading.values()).find(h =>
          surnameTokens(h.names).some(t => surnameTokens(walkers).includes(t))
        );
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

    const directMatch = text.match(PERSON_ENTER_PATTERN);
    if (directMatch) {
      record(
        cleanWalkerNames(directMatch[1]),
        bracketLabelOrSelf(directMatch[2]),
        ""
      );
      return;
    }

    // Any other "entered <Place>" (see PERSON_ENTER_ANY_PATTERN).
    const anyEnter = text.match(PERSON_ENTER_ANY_PATTERN);
    if (anyEnter) {
      if (/^\(?Vehicle\b/i.test(anyEnter[2])) {
        // Back in a vehicle: no longer walking anywhere.
        clearHeadingFor(cleanWalkerNames(anyEnter[1]));
        const reg = anyEnter[2].match(/Vehicle\s+([A-Za-z0-9]{5,8})/i);
        if (reg) {
          noteJoined(anyEnter[1], reg[1], row.id);
          leaveAllPlaces(cleanWalkerNames(anyEnter[1]));
        }
      } else {
        record(cleanWalkerNames(anyEnter[1]), placeName(anyEnter[2]), "");
        return;
      }
    }

    // A sighting: "BAIG seated ... inside <Place>." — inside that place now,
    // and so no longer wherever they were last logged.
    const presence = matchPresenceInside(text);
    if (presence) {
      const who = new Set(surnameTokens(presence.names));
      for (const [k, v] of Array.from(lastWalkIn.entries())) {
        if (k === key(presence.place)) continue;
        const tokens = surnameTokens(v.names);
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
      if (anyExit && !/^\(?Vehicle\b/i.test(anyExit[2])) {
        walkedOut.add(key(placeName(anyExit[2])));
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
    .map(({ orderIdx: _o, ...rest }) => rest);
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
  return name.match(/\b[A-Z][A-Z'-]+\b/g) ?? [];
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
  const onFoot = new Set(onFootNames.flatMap(n => surnameTokens(n)));
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
    const t = surnameTokens(b);
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
 * True when a row's text is one the continuity logic reads as a movement —
 * a vehicle arriving/departing, someone entering, exiting or walking
 * somewhere. Used to tell a row the position logic UNDERSTOOD (so the
 * position it produced is trustworthy) from one that names the target
 * alongside a movement word but matched none of the known phrasings (so the
 * position may be stale).
 */
export function isReadAsMovement(text: string): boolean {
  if (!text) return false;
  if (matchVehicleArrival(text) || VEHICLE_DEPART_PATTERN.test(text)) {
    return true;
  }
  if (
    WALK_OUT_PATTERN.test(text) ||
    WALK_IN_PATTERN.test(text) ||
    WALK_IN_TOWARDS_PATTERN.test(text) ||
    PERSON_ENTER_PATTERN.test(text) ||
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
  if (matchPresenceInside(text)) return true;
  return false;
}
