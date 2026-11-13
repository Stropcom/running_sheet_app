// Part of the Intelligence queries (server/db/intelligence.ts): rule-based entity extraction from observation text (people, vehicles, addresses, places).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { VEHICLE_MAKES_PATTERN } from "@shared/vehicleModel";
import { flattenNestedBrackets } from "@shared/nestedBrackets";
import { isMeasurementWord } from "@shared/measurementWord";

// What may sit between a business's name and its street address: a shop /
// unit / level number, or the centre the premises are in. One or two such
// comma-separated segments.
const PREMISES_SEGMENT_RE_SRC =
  ",\\s*(?:(?:shop|unit|suite|level|kiosk|tenancy|store|lot|stall|booth|office)\\b[^,]{0,40}|[^,]{0,40}\\b(?:centre|center|plaza|mall|arcade|square|market|markets|complex|building|tower|village|precinct)\\b)";

const PREMISES_GAP_RE = new RegExp(
  `^(?:${PREMISES_SEGMENT_RE_SRC}){1,2}$`,
  "i"
);

/** Whether the text between a business's name and its street address is only
 * premises detail: a shop / unit / centre (PREMISES_GAP_RE), or one or two
 * short comma-separated segments written like a name or a code — "T5004",
 * "Westfield", "Level 2" — never narrative (lower-case words). */
function isPremisesGap(gap: string): boolean {
  if (PREMISES_GAP_RE.test(gap)) return true;
  const parts = gap.split(",");
  if (parts[0].trim() !== "") return false;
  const segments = parts.slice(1).map(p => p.trim());
  if (segments.length < 1 || segments.length > 2) return false;
  return segments.every(seg => {
    if (!seg) return false;
    const words = seg.split(/\s+/);
    return (
      words.length <= 5 &&
      words.every(w => /^[A-Z0-9]/.test(w) || /^(?:of|the|and|&)$/i.test(w))
    );
  });
}

/**
 * Extract bracketed entities from a single observation string.
 * Pattern: any text followed by (ShortForm) — the short form is the entity identifier.
 * We classify by heuristics on the preceding context words.
 */
export function extractEntitiesFromText(text: string): Array<{
  shortForm: string;
  rawShortForm: string;
  fullDescription: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  confidence: "high" | "medium" | "low";
}> {
  const results: Array<{
    shortForm: string;
    rawShortForm: string; // the exact bracketed token before name-recovery
    fullDescription: string;
    type: "person" | "vehicle" | "address" | "business" | "unknown";
    confidence: "high" | "medium" | "low";
  }> = [];

  // A place name with a bracket of its own ("… Expert Centre (Tellerless)")
  // is read as plain words first (shared/nestedBrackets.ts).
  text = flattenNestedBrackets(text);
  // Match: some preceding text (fullDescription) immediately followed by (ShortForm)
  const pattern = /([^()]{3,120}?)\s*\(([^()]{1,80})\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // The capture group above (`[^()]{3,120}?`) has no sentence-boundary
    // anchor, so for a bracket that follows an earlier BARE (bracket-less)
    // mention of the same token in a prior sentence — e.g. "...walked
    // towards Vehicle 1IZQ515. Placed the shopping in the boot of Vehicle
    // 1IZQ515 (Vehicle 1IZQ515)..." — it can balloon backward up to 120
    // chars, across the full stop, into that unrelated earlier sentence.
    // Confirmed root cause of a real corruption: the vehicle-description
    // reconstruction below (`type === "vehicle"`) finds the FIRST
    // occurrence of the rego inside that bled text via indexOf — which was
    // the earlier sentence's bare mention, not the real one right before
    // this bracket — and built a garbled description ("1IZQ515 car park
    // towards Vehicle") out of unrelated narrative prose, which then won
    // the merge against the vehicle's real, already-on-file description
    // ("1IZQ515 red Renault Koleos SUV") purely by being longer. Scoping to
    // the last sentence here (same logic the address branch below already
    // used, but only for its own classification test, not for the value
    // stored/reconstructed from) fixes this at the source for every entity
    // type, not just addresses.
    const rawFullDescription = match[1].trim();
    const fullDescription = (
      rawFullDescription.split(/(?<=[.!?])\s+/).pop() ?? rawFullDescription
    ).trim();
    const shortForm = match[2].trim();

    // Skip empty or very short short-forms
    if (shortForm.length < 2) continue;
    // Skip if shortForm looks like a time (e.g. "08:00")
    if (/^\d{1,2}:\d{2}$/.test(shortForm)) continue;
    // Skip UM/UF/YC/UCO references (e.g. "UM1", "UF1", "YC1", "UCO1") —
    // unidentified male/female, young child, and undercover operative
    // placeholders that are not recorded in the intelligence folder by
    // design. UF/YC/UCO were all missing until it was reported that "a
    // young girl (UF1)" was falling through to the vehicle catch-all
    // instead (a short all-caps/digit bracket with no other classification
    // matches WA_REGO's personalised-plate shape, same failure mode as the
    // Basil CAT bug above).
    //
    // Tested against the bracket with a leading "Vehicle "/"Veh " stripped,
    // not just shortForm as typed — a real running sheet was found with a
    // literal "(Vehicle UM1)" bracket (the client's space-bar rego
    // auto-bracket feature treats any short letter+digit token as a
    // candidate rego and doesn't know UM1 is a person placeholder — fixed
    // separately in mentionAutocomplete.ts's detectVehicleMentionTrigger),
    // and the word "vehicle" baked directly into shortForm made the
    // literal "^(?:U[MF]|YC|UCO)\d+$" test below miss entirely, so this
    // bracket fell through to the vehicle classification purely because it
    // contains the word "vehicle" — creating a phantom "UM1" vehicle in the
    // Intelligence Folder. This check is defense-in-depth against that
    // shape however it enters the text (typo, voice, a future client
    // change), and — since the Intelligence Folder's entity list is
    // computed live from extractEntitiesFromText on every read, not
    // persisted — fixing it here also clears the phantom entity and any
    // description corruption it caused for an already-recorded row,
    // without altering the stored observation text itself.
    const placeholderCandidate = shortForm.replace(/^vehicle\s+/i, "").trim();
    if (/^(?:U[MFCP]|YC|UCO)\d+$/i.test(placeholderCandidate)) continue;
    // "(Vehicle 30CM)": the sheet's space-bar rego bracket once took a
    // measurement ("approx 30cm") for a plate. Never a vehicle — and, like the
    // placeholder above, this clears it for a row already recorded that way.
    if (isMeasurementWord(placeholderCandidate)) continue;
    // Any "unidentified <male|female|child|person|adult|juvenile|youth>
    // (CODE)" is a placeholder for someone who has not been identified, whatever
    // short name it was given — never recorded in the Intelligence folder.
    if (
      /\bunidentified\s+(?:male|female|child|person|adult|juvenile|youth)\b[^()]*$/i.test(
        fullDescription
      )
    )
      continue;

    const lowerFull = fullDescription.toLowerCase();
    const lowerShort = shortForm.toLowerCase();
    // Vehicle-keyword detection is scoped to just the clause immediately
    // before the bracket (last comma/semicolon-separated segment), not the
    // whole preceding sentence. Running sheet rows routinely describe several
    // entities in one sentence — e.g. "Vehicle 1GDA876, EWEN driver, Jason
    // SMITH (SMITH), departed..." — and without this scoping, the vehicle
    // keyword from an earlier, unrelated clause leaks into the classification
    // of a person's bracketed name later in the same sentence.
    const lastClause = (
      fullDescription.split(/[,;]/).pop() ?? fullDescription
    ).trim();
    const lowerLastClause = lastClause.toLowerCase();
    // Address detection (below) is scoped to the last SENTENCE before the
    // bracket, not the whole fullDescription — a legitimate address
    // routinely spans a comma ("44 Smith Street, PALMYRA WA"), so it can't
    // be scoped as tightly as the clause-level vehicle check above, but it
    // should never span a full stop into an unrelated earlier sentence.
    // Without this, a row that opens with a plain-prose address statement
    // and no bracket of its own ("Vehicles visible at 81 Redmond Road.")
    // followed by the row's first bracketed entity — e.g. a vehicle,
    // "A green Toyota Prado, bearing WA registration WTQ304 (Vehicle
    // WTQ304)" — lets the regex's fullDescription capture balloon backward
    // across the sentence boundary (nothing bounds it until it hits the
    // opening "(" or the 120-char cap), and the leading sentence's address
    // pattern gets misapplied to the vehicle.
    const lastSentence = (
      fullDescription.split(/(?<=[.!?])\s+/).pop() ?? fullDescription
    ).trim();

    let type: "person" | "vehicle" | "address" | "business" | "unknown" =
      "unknown";

    // ── Address-format detection (highest priority) ──────────────────────────
    // If the full description (before the parenthesis) contains a street address
    // pattern — e.g. "1200 Leach Highway, MYAREE" — classify as address regardless
    // of whether the word "vehicle" appears elsewhere in the sentence.
    // Also classify airport terminals, train stations, bus stops, ports, and
    // numbered terminals (e.g. "Terminal 2", "Gate 3", "Platform 5") as addresses.
    // Also handles cnr/corner-of addresses and lot numbers.
    const STREET_TYPE_WORDS =
      "st|street|rd|road|ave|avenue|dr|drive|way|ct|court|pl|place|cl|close|cres|crescent|blvd|boulevard|hwy|highway|fwy|freeway|ln|lane|tce|terrace|pde|parade|cct|circuit|gr|grove|rise|loop|link|walk|track|row|mews|quay|esplanade|promenade";
    const STREET_TYPES = new RegExp(`\\b(${STREET_TYPE_WORDS})\\b`, "i");
    const addressInFull =
      // Reuses the same STREET_TYPE_WORDS list as STREET_TYPES below rather
      // than a second, separately-maintained word list — a previous
      // hand-typed duplicate here was missing several words STREET_TYPES
      // already had (esplanade, promenade, quay, grove, rise, loop, link,
      // walk, track, row, mews, and every abbreviated form), so a full
      // street address in the sentence using one of those went completely
      // undetected as an address and fell through to being classified as
      // a bare business name instead (e.g. "Balthazar, 6 The Esplanade,
      // PERTH WA (Balthazar)" — no postcode, no other address signal, and
      // "esplanade" wasn't in the old inline list).
      new RegExp(
        `\\b\\d{1,5}[A-Za-z]?\\s+\\w[\\w\\s]*(${STREET_TYPE_WORDS})\\b`,
        "i"
      ).test(lastSentence) ||
      STREET_TYPES.test(shortForm) ||
      /^\d{1,5}\s/.test(shortForm) ||
      // cnr / corner of addresses: "cnr Smith St and Jones Ave"
      /^(cnr|corner of|corner)\b/i.test(shortForm) ||
      /^(cnr|corner of|corner)\b/i.test(lastSentence) ||
      // Lot numbers: "Lot 42 Smith Road"
      /^lot\s+\d+/i.test(shortForm) ||
      // Google Maps formatted addresses: "131 Lakey St, Southern River WA 6110, Australia"
      // Pattern: number + street name + suburb + STATE + postcode (+ optional ", Australia")
      /\b\d{1,5}[A-Za-z]?\/\d{1,5}\s/.test(shortForm) || // unit/number e.g. "3/12 Smith St"
      /\b\d{1,5}[A-Za-z]?\/\d{1,5}\s/.test(lastSentence) ||
      /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
        shortForm
      ) ||
      /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
        lastSentence
      ) ||
      /,\s*Australia\s*$/.test(shortForm) ||
      /,\s*Australia\s*$/.test(lastSentence) ||
      // Airport terminals, train stations, bus stops, ports, gates, platforms.
      // "station" is excluded when it's followed by "wagon"/"sedan" — that's
      // the vehicle body-style term ("station wagon"/"station sedan"), not a
      // transit station, and would otherwise misclassify a vehicle mention
      // like "...Passat station sedan, bearing WA registration 1DHY084
      // (Vehicle 1DHY084)..." as an address before the vehicle keywords
      // ("registration", "Vehicle") are even considered — address detection
      // runs first, so this exclusion has to live here rather than being
      // resolved by the vehicle-keyword check further down.
      /\b(terminal|gate|platform|pier|bay|berth|concourse|departure|arrival|lounge)\s+\d/i.test(
        shortForm
      ) ||
      /\b(airport|station(?!\s+(?:wagon|sedan)\b)|terminus|port|wharf|depot|interchange|shopping centre|shopping center|shopping mall|mall|plaza|precinct)\b/i.test(
        shortForm
      ) ||
      /\b(airport|station(?!\s+(?:wagon|sedan)\b)|terminus|port|wharf|depot|interchange)\b/i.test(
        lastSentence
      );

    // ── WA vehicle registration patterns ─────────────────────────────────────
    // WA standard: 1ABC234 (digit + 3 letters + 3 digits) or older ABC-123 / ABC 123
    // Also: 1AB 234, personalised plates (letters only up to 6 chars)
    const WA_REGO =
      /^\d[A-Z]{2,3}\d{3}$|^[A-Z]{1,3}[-\s]?\d{3}$|^[A-Z0-9]{2,7}$/.test(
        shortForm.replace(/\s/g, "").toUpperCase()
      );
    // Broader vehicle make/model keywords
    const VEHICLE_MAKES = VEHICLE_MAKES_PATTERN;
    const VEHICLE_BODY =
      /\b(vehicle|car|truck|van|ute|sedan|hatchback|suv|wagon|coupe|convertible|roadster|pickup|4wd|4x4|cab|dual cab|single cab|tray|flatbed|panel van|people mover|minivan|bus|minibus|motorcycle|motorbike|bike|scooter|quad|atv|boat|trailer|caravan|motorhome|rv|bearing|registration|rego|reg|plate|plated)\b/i;
    // A shortForm that looks like an all-caps person name (letters/spaces/
    // hyphens/apostrophes/periods only, no digits) should never be classified
    // as a vehicle just because "vehicle" or a make appears somewhere in the
    // same clause — see the guard on the VEHICLE_BODY/MAKES branch below.
    // Periods are allowed for the "P.HILL" initial-plus-surname convention
    // officers use to disambiguate family members sharing a surname.
    const shortFormLooksLikeName =
      /^[A-Z][A-Z\s'.-]{1,40}$/.test(shortForm) && !/\d/.test(shortForm);
    // A shortForm with mixed-case proper-noun capitalisation (e.g. "Coles",
    // "Woolworths") is a business name, not a vehicle — real WA rego plates
    // are always written in ALL CAPS in these narratives ("1IZQ515",
    // "WTQ304"), never Title Case. Without this guard the personalised-
    // plate catch-all below (`^[A-Z0-9]{2,7}$`) swallows any short
    // mixed-case business name the same way it used to swallow all-caps
    // person surnames (see shortFormLooksLikeName above) — e.g. "...did
    // general grocery shopping Coles, Lakelands Shopping Centre (Coles)."
    // got misfiled as a vehicle instead of a business.
    const shortFormLooksLikeBusiness = /[A-Z][a-z]/.test(shortForm);

    // ── Confidence scoring ────────────────────────────────────────────────────
    let confidence: "high" | "medium" | "low" = "low";

    if (addressInFull) {
      type = "address";
      // High confidence if has number + street type or state/postcode; medium for cnr/lot/airport
      if (
        /\b\d{1,5}[A-Za-z]?\s+\w/.test(shortForm) &&
        STREET_TYPES.test(shortForm)
      )
        confidence = "high";
      else if (
        /,\s*[A-Za-z][\w\s]+\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}/.test(
          shortForm
        )
      )
        confidence = "high";
      else confidence = "medium";
    }
    // Vehicle: the clause immediately before the bracket mentions vehicle
    // keywords OR shortForm matches rego/make. BUT only when the full
    // description does NOT look like an address, AND the shortForm itself
    // doesn't look like an all-caps person name (e.g. "Exited the vehicle
    // and met with Keanu REEVES (REEVES)" — no comma separates "vehicle"
    // from the name that follows it in the same clause, so without this
    // guard the leftover word "vehicle" wrongly classifies REEVES as a
    // vehicle. Same exclusion the WA_REGO branch below already applies.
    else if (
      !shortFormLooksLikeName &&
      (VEHICLE_BODY.test(lowerLastClause) ||
        VEHICLE_MAKES.test(lowerLastClause) ||
        VEHICLE_MAKES.test(lowerShort))
    ) {
      type = "vehicle";
      if (
        VEHICLE_BODY.test(lowerLastClause) &&
        (VEHICLE_MAKES.test(lowerLastClause) || VEHICLE_MAKES.test(lowerShort))
      )
        confidence = "high";
      else confidence = "medium";
    }
    // WA rego plate in shortForm — strong vehicle signal
    else if (
      WA_REGO &&
      !shortFormLooksLikeName &&
      !shortFormLooksLikeBusiness
    ) {
      // Only treat as rego if it doesn't look like an all-caps name. This used
      // to require 4+ letters to count as "looks like a name", which let any
      // short (2-3 letter) all-caps bracket code — a perfectly ordinary short
      // surname like "CAT", "FOX", "LEE", "COX" — fall through and match the
      // personalised-plate branch of WA_REGO (`^[A-Z0-9]{2,7}$`) instead of
      // being classified as a person. That misclassification was silent but
      // significant: a person entity classified as a vehicle never runs
      // through the person-specific fuzzy-match check against the Target/
      // Associate Registry (see checkPossibleTargetMatches / SheetDetail's
      // updateRowWithDupeCheck), so the "possible duplicate" prompt never
      // fired even for an exact match. Reusing shortFormLooksLikeName (already
      // used one branch up for the same purpose) excludes any all-caps,
      // digit-free bracket code regardless of length, which is what "looks
      // like a name" actually means here. shortFormLooksLikeBusiness excludes
      // the mixed-case equivalent — a business name — the same way.
      type = "vehicle";
      confidence = "medium";
    }
    // Person: shortForm is all-caps word(s) with no digits, no street number
    // pattern — periods allowed for "P.HILL" initial-plus-surname short forms
    // (see shortFormLooksLikeName above).
    else if (
      /^[A-Z][A-Z\s'.-]{1,40}$/.test(shortForm) &&
      !/\d/.test(shortForm) &&
      !STREET_TYPES.test(shortForm)
    ) {
      type = "person";
      // High confidence if shortForm is 2 words (first + surname) or matches name-recovery
      const wordCount = shortForm.trim().split(/\s+/).length;
      confidence = wordCount >= 2 ? "high" : "medium";
    }
    // Address: shortForm starts with a number or contains street type
    else if (/^\d/.test(shortForm) || STREET_TYPES.test(shortForm)) {
      type = "address";
      confidence = "medium";
    }
    // Business: shortForm contains a proper noun (mixed case or known business words)
    else if (
      /[A-Z][a-z]/.test(shortForm) ||
      /\b(hotel|motel|cafe|restaurant|shop|store|centre|center|gym|club|bar|pub|servo|service station|petrol|chemist|pharmacy|hospital|clinic|school|college|university|church|mosque|temple|park|reserve|oval|stadium|arena|theatre|cinema|library|museum|gallery|council|police|fire|ambulance|court|prison|jail|detention)\b/i.test(
        lowerShort
      )
    ) {
      type = "business";
      confidence =
        /\b(hotel|motel|cafe|restaurant|shop|store|centre|center|gym|club|bar|pub|servo|service station|petrol|chemist|pharmacy|hospital|clinic|school|college|university|church|mosque|temple|park|reserve|oval|stadium|arena|theatre|cinema|library|museum|gallery|council|police|fire|ambulance|court|prison|jail|detention)\b/i.test(
          lowerShort
        )
          ? "high"
          : "medium";
    } else {
      // unknown — low confidence
      confidence = "low";
    }

    // For person entities: prefer the full name (fullDescription) over the bracketed
    // shortForm. E.g. "Jason JOHNSON (JOHNSON)" → use "Jason JOHNSON", not "JOHNSON".
    // Only apply when fullDescription looks like a name: 2–5 words, letters/spaces/hyphens/apostrophes only,
    // and the shortForm is a suffix/subset of the fullDescription.
    //
    // For address entities: recover the properly-formatted address from fullDescription.
    // The bracket short form is always ALL-CAPS abbreviated (e.g. "4 GLYDE ST") which is
    // correct for geocoding but wrong for display. We extract the address from the text
    // before the bracket and format it as "4 Glyde Street, EAST FREMANTLE".
    let displayName = shortForm;
    if (type === "address") {
      // Try to extract a properly-formatted address from fullDescription.
      // fullDescription is the text immediately before the bracket, e.g.:
      //   "...arrived at 4 Glyde St, East Fremantle WA"
      //   "Vehicle 1FAB007, REID driver and sole occupant, arrived at 146 Marine Parade, Cottesloe WA"
      // Strategy: find the last occurrence of a street-number pattern in fullDescription
      // and take everything from there to the end as the address.
      const AU_STATES_ADDR = /\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/;

      // Title-case a word in a street name context:
      //  - State codes (WA, NSW, etc.) stay ALL-CAPS
      //  - Street type abbreviations (St, Rd, Ave, etc.) become Title Case
      //  - All other words become Title Case
      const titleCaseStreetWord = (w: string): string => {
        if (/^\d+$/.test(w)) return w; // digits unchanged
        // Unit-letter-suffixed street numbers (e.g. "61a" → "61A") keep the
        // digits and uppercase the trailing letter.
        if (/^\d+[A-Za-z]$/.test(w))
          return w.slice(0, -1) + w.slice(-1).toUpperCase();
        if (/^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i.test(w)) return w.toUpperCase(); // state codes
        // Street type abbreviations → Title Case (e.g. ST→St, RD→Rd, AVE→Ave)
        if (
          /^(ST|RD|AVE|DR|CT|PL|CL|CRES|BLVD|HWY|FWY|LN|TCE|PDE|CCT|GR|CNR|WY|LOOP|RISE|RIDGE|GROVE|MEWS|CLOSE|PLACE|COURT|LANE|TERRACE|PARADE|CIRCUIT|GREEN|CORNER)$/i.test(
            w
          )
        ) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      };

      // Find the last address-like segment in fullDescription.
      // Supports standard addresses AND intersections (e.g. "Kent St & Queens Park Rd, Wilson WA").
      // Two patterns tried in order:
      //  1. Standard: starts with a street number or cnr/corner prefix
      //  2. Intersection: "Street Type & Street Type, Suburb STATE"
      const STREET_TYPES_RE =
        "(?:St|Rd|Ave|Dr|Hwy|Fwy|Tce|Pde|Cct|Gr|Ln|Pl|Ct|Cl|Cres|Blvd|Way|Loop|Rise|Mews|Close|Place|Court|Lane|Terrace|Parade|Circuit|Green|Corner)";
      // The street-number prefix must be preceded by a word boundary (start of string,
      // space, comma, or punctuation) to prevent partial rego digits (e.g. "905" from
      // "1HTU905") from being mistaken for a street number.
      // The unit/number alternative allows an optional "Shop"/"Unit"/"Suite"/
      // "Level" premises-descriptor prefix, and one optional extra "/44" or
      // "-44" range segment after the unit/number pair (e.g. "Shop 1/42/44
      // Gugeri Street" — unit 1, at a property spanning 42/44). Without the
      // range segment, the whole address was unreachable: its number
      // segments are separated by "/" rather than whitespace/comma, so
      // neither the "\d/\d\s" nor the bare "\d\s" alternative below can
      // start a match anywhere inside it (every digit run is preceded by
      // "/", never the required word boundary) — extraction silently fell
      // back to the bracket's short form alone, and a business's short form
      // is its own name (see convertGoogleAddresses), so this showed up as
      // a location with no address at all rather than a malformed one.
      // Without the premises-descriptor prefix, the address itself is
      // recoverable but the business-name-prefix recovery below no longer
      // finds the business name directly abutting it ("...Pronto Butcher,
      // Shop 1/42/44...", not "...Pronto Butcher, 1/42/44...") and silently
      // drops the name instead.
      const standardAddrRe =
        /(?:^|(?<=[\s,;]))((?:cnr\s+of\s+|cnr\s+|corner\s+of\s+|lot\s+\d+\s+|(?:shop\s+|unit\s+|suite\s+|level\s+)?\d{1,5}[A-Za-z]?\/\d{1,5}(?:[\/-]\d{1,5}[A-Za-z]?)?\s+|\d{1,5}[A-Za-z]?\s+)[A-Za-z][\w\s&]*(?:,\s*[A-Za-z][\w\s]+)?(?:\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))?(?:\s+\d{4})?(?:,\s*Australia)?)$/i;
      const intersectionAddrRe = new RegExp(
        `[A-Za-z][\\w\\s]+\\s+${STREET_TYPES_RE}\\s*&\\s*[A-Za-z][\\w\\s]+\\s+${STREET_TYPES_RE}(?:,\\s*[A-Za-z][\\w\\s]+)?(?:\\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))?(?:\\s+\\d{4})?(?:,\\s*Australia)?$`,
        "i"
      );
      const standardMatch = fullDescription.match(standardAddrRe);
      const addrMatch =
        (standardMatch ? [standardMatch[1] ?? standardMatch[0]] : null) ||
        fullDescription.match(intersectionAddrRe);
      if (addrMatch) {
        let addrText = addrMatch[0].trim();
        // Strip postcode and ", Australia"
        addrText = addrText.replace(/,?\s*Australia\s*$/i, "").trim();
        addrText = addrText.replace(/\s+\d{4}\s*$/, "").trim();
        // Split into parts: street part(s) and suburb+state part
        const commaParts = addrText.split(",");
        if (commaParts.length >= 2) {
          const lastPart = commaParts[commaParts.length - 1].trim();
          const stateMatch = lastPart.match(
            /^(.+?)\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i
          );
          if (stateMatch) {
            // Title-case the street part(s), CAPS the suburb
            const streetParts = commaParts
              .slice(0, -1)
              .map(p => p.trim().replace(/\b(\w+)/g, titleCaseStreetWord));
            const suburb = stateMatch[1].trim().toUpperCase();
            displayName = [...streetParts, " " + suburb].join(",");
          } else if (AU_STATES_ADDR.test(lastPart)) {
            // Last part is just a state — drop it
            const streetParts = commaParts
              .slice(0, -1)
              .map(p => p.trim().replace(/\b(\w+)/g, titleCaseStreetWord));
            displayName = streetParts.join(",").trim();
          } else {
            // No state found — just title-case the whole thing
            displayName = addrText.replace(/\b(\w+)/g, titleCaseStreetWord);
          }
        } else {
          // Single part (no comma) — title-case it
          displayName = addrText.replace(/\b(\w+)/g, titleCaseStreetWord);
        }
      } else {
        // Fallback: title-case the shortForm itself (it's all-caps abbreviated)
        // e.g. "4 GLYDE ST" → "4 Glyde St"
        displayName = shortForm.replace(/\b(\w+)/g, titleCaseStreetWord);
      }

      // Business location recovery: for business addresses the bracket short
      // form is the business name itself (e.g. "Bicton Tavern, 1 Point Walter
      // Road, BICTON WA (Bicton Tavern)"), not a street code, so the regex
      // above only recovers the street+suburb portion. Narrative text before
      // the address (e.g. "IOs observed the subject enter Bicton Tavern, ...")
      // has no reliable delimiter marking where the business name starts, so
      // rather than trying to parse it out, check whether the text
      // immediately before the recovered address — after stripping the
      // separating comma — ends with the (already known) shortForm at a word
      // boundary. If so, restore it as a prefix so the Intelligence display
      // reads "Bicton Tavern, 1 Point Walter Road, BICTON" instead of
      // dropping the business name.
      const addrStartIdx = fullDescription.lastIndexOf(
        addrMatch ? addrMatch[0] : ""
      );
      if (addrStartIdx > 0) {
        const beforeAddr = fullDescription
          .slice(0, addrStartIdx)
          .replace(/,\s*$/, "");
        const lowerBefore = beforeAddr.toLowerCase();
        const lowerName = shortForm.toLowerCase();
        // The name usually sits straight in front of the address; a shop
        // number or the centre it is in may come between them ("Commonwealth
        // Bank East Victoria Park Branch, Shop 19 The Park Centre, 789
        // Albany Highway, …"). Those segments stay in the label, so it reads
        // the way the officer's text does and the map finds it by name.
        let nameStart = -1;
        if (lowerBefore.endsWith(lowerName)) {
          nameStart = beforeAddr.length - shortForm.length;
        } else {
          const at = lowerBefore.lastIndexOf(lowerName);
          if (at >= 0 && isPremisesGap(beforeAddr.slice(at + shortForm.length)))
            nameStart = at;
        }
        if (nameStart >= 0) {
          const boundaryOk =
            nameStart === 0 || /\s/.test(beforeAddr[nameStart - 1]);
          if (boundaryOk) {
            const matchedName = beforeAddr.slice(nameStart);
            displayName = `${matchedName}, ${displayName.trim()}`;
          }
        }
      }
    } else if (type === "vehicle") {
      // For vehicle entities: build a display name as "REGO <description as written>".
      // The shortForm is typically "Vehicle REGO" (e.g. "Vehicle 1FBP509") or just the rego.
      // The fullDescription is the text immediately before the bracket, e.g.:
      //   "A white Toyota Landcruiser, bearing WA registration 1FBP509"
      //   "black Subaru WRX, bearing WA registration 1FDD444"
      //   "1HTU905" (bare rego, no description)
      //
      // Previously this reconstructed the description by matching against
      // hardcoded lists of car makes/models/body-types — which silently
      // dropped anything not on those lists: motorcycle makes ("Harley
      // Davidson"), motorcycle models ("Fatboy"), car models missing from the
      // list ("Monaro"), multi-word makes ("Mercedes Benz"), etc. Instead,
      // keep the description exactly as the officer wrote it: everything
      // before the rego mention, minus the trailing "bearing WA
      // registration"/"registration"/"rego"/"reg"/"plate" boilerplate clause.

      // Step 1: extract raw rego
      const rawRego = shortForm.replace(/^vehicle\s+/i, "").trim();

      // Everything below assumes rawRego IS a real registration and
      // searches for that exact text inside fullDescription to find where
      // the description ends. That assumption breaks for a vague/no-rego
      // sighting bracketed with a make/model instead of a plate — e.g.
      // "(Vehicle White Hyundai)" on "a white Hyundai Santa Fe,
      // registration unable to be observed" — where "White Hyundai" is
      // also a substring of the description itself, so regoIdx lands
      // mid-sentence and truncates descSource to a fragment ("a"). A real
      // WA rego is short and never spells out a recognised make, so guard
      // the whole reconstruction on that instead of assuming every bracket
      // is a plate.
      const rawRegoCompact = rawRego.replace(/\s/g, "").toUpperCase();
      const rawRegoLooksLikeRealRego =
        /^\d[A-Z]{2,3}\d{3}$/.test(rawRegoCompact) ||
        (/^[A-Z0-9]{2,7}$/.test(rawRegoCompact) &&
          !VEHICLE_MAKES_PATTERN.test(rawRego));

      if (!rawRegoLooksLikeRealRego) {
        // Descriptive bracket, not a real rego — the bracket text itself
        // (minus the "Vehicle " prefix) already IS the description; there's
        // nothing in fullDescription to reconstruct around.
        displayName = rawRego || shortForm;
      } else {
        // Step 2: find the description text — everything before the rego
        // mention. If the rego quoted in the text doesn't match the bracket's
        // rego (e.g. a typo), regoIdx is -1 and the whole fullDescription is
        // used instead — the boilerplate-stripping step below also swallows a
        // trailing rego-shaped token in that case, so the mismatched number
        // doesn't leak into the description either way.
        const regoIdx = fullDescription
          .toUpperCase()
          .indexOf(rawRego.toUpperCase());
        let descSource =
          regoIdx > 0 ? fullDescription.slice(0, regoIdx) : fullDescription;
        // "...walked towards Vehicle 1MEN83 (Vehicle 1MEN83)": the bracket only
        // repeats the "Vehicle REGO" written just before it (a vehicle sentence
        // or chip), so there is NO description in front of it. Without this the
        // whole sentence up to the rego ("exited Crown Towers Perth and walked
        // towards Vehicle") was kept as the vehicle's description and showed in
        // the Intelligence folder as "1MEN83 exited Crown Towers Perth and walked
        // towards Vehicle". A real description never ends with the word
        // "Vehicle" straight before the plate ("a grey Toyota, bearing WA
        // registration 1ABC123", "grey Toyota 1ABC123").
        if (
          new RegExp(
            `\\bvehicle\\s+${rawRego.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
            "i"
          ).test(fullDescription)
        )
          descSource = "";

        const STATE_CODES = "WA|NSW|VIC|QLD|SA|TAS|NT|ACT";
        descSource = descSource
          .replace(
            new RegExp(
              `[,;]?\\s*(?:bearing\\s+)?(?:(?:${STATE_CODES})\\s+)?(?:regist[a-z]*|rego|reg\\.?|plated?)\\s*:?\\s*(?:\\d[A-Za-z0-9]{2,7})?\\s*$`,
              "i"
            ),
            ""
          )
          .replace(/[,;]\s*$/, "")
          .trim()
          // Strip a leading inter-clause separator left over when two
          // vehicles are described in one sentence — "...1ABC123), and
          // orange Porsche Mecan SUV, bearing WA registration 1DEF456
          // (Vehicle 1DEF456)" — the regex boundary between the two bracket
          // matches starts the second vehicle's fullDescription right after
          // the first bracket, comma (and "and", when the officer wrote one)
          // included. A vehicle description never legitimately starts with a
          // bare comma either — e.g. "...(Vehicle 1FRU77), White Isuzu D-MAX
          // Utility, bearing..." with no "and" between the two vehicles
          // — so strip a leading comma/semicolon unconditionally, then a
          // leading "and" on whatever's left. Doesn't depend on an article
          // ("a"/"an"/"the") following it like the cut below does, since an
          // officer doesn't always write one.
          .replace(/^[,;]\s*/, "")
          .replace(/^and\s+/i, "");

        // A real vehicle description is a short noun phrase (colour + make +
        // model + trim + body, typically 2-5 words). When an officer embeds
        // that same phrase in a longer narrative sentence instead of writing
        // it tersely — "WINMAR and LOWE walked through the car park to a blue
        // Mercedes Benz C250 sedan, bearing WA registration 1HFD521" — keeping
        // the whole clause up to the rego drags the narrative prose in too.
        // Cut at the LAST standalone article ("a"/"an"/"the") — that's
        // reliably where the noun phrase describing the vehicle starts, since
        // narrative lead-ins almost always end "...to a", "...into an",
        // "...near the", etc. Falls back to a generous word-count cap when no
        // article is present, as a backstop against unbounded narrative text
        // with no article at all.
        const articlePattern = /\b(?:a|an|the)\s+(?=\S)/gi;
        let lastArticleEnd = -1;
        let articleMatch: RegExpExecArray | null;
        while ((articleMatch = articlePattern.exec(descSource)) !== null) {
          lastArticleEnd = articleMatch.index + articleMatch[0].length;
        }
        if (lastArticleEnd >= 0) {
          descSource = descSource.slice(lastArticleEnd);
        } else {
          const words = descSource.split(/\s+/).filter(Boolean);
          if (words.length > 8) descSource = words.slice(-8).join(" ");
        }
        descSource = descSource
          .replace(/^vehicle\s+/i, "")
          .replace(/\s+/g, " ")
          .trim();

        if (rawRego && rawRego !== shortForm) {
          // Had "Vehicle REGO" format — use rego + description as written
          displayName = descSource ? `${rawRego} ${descSource}` : rawRego;
        } else if (descSource) {
          // shortForm is already just the rego
          displayName = `${rawRego} ${descSource}`;
        }
        // else: keep displayName = shortForm (bare rego, no description available)
      }
    } else if (type === "person") {
      // Extract the last 2-4 words immediately before the bracket — these are most
      // likely to be the full name. E.g. "Observed Jason JOHNSON (JOHNSON)" →
      // fullDescription = "Observed Jason JOHNSON", last 2 words = "Jason JOHNSON".
      // Words that are NOT part of a person's name (verbs, prepositions, articles, etc.)
      const NON_NAME_WORDS = new Set([
        "with",
        "the",
        "a",
        "an",
        "and",
        "or",
        "at",
        "to",
        "from",
        "in",
        "on",
        "of",
        "front",
        "back",
        "side",
        "door",
        "gate",
        "exit",
        "entry",
        "via",
        "near",
        "by",
        "into",
        "out",
        "up",
        "down",
        "off",
        "over",
        "under",
        "through",
        "along",
        "exited",
        "entered",
        "walked",
        "ran",
        "drove",
        "observed",
        "seen",
        "met",
        "approached",
        "departed",
        "arrived",
        "left",
        "attended",
        "accompanied",
        "was",
        "were",
        "is",
        "are",
        "had",
        "has",
        "been",
        "being",
        "then",
        "also",
        "who",
        "whom",
        "which",
        "that",
        "this",
        "these",
        "those",
      ]);
      // "P.HILL"-style short forms (one or more initials + period + surname,
      // used to disambiguate family members sharing a surname) never appear
      // verbatim in the full name ("Peter HILL" has no "P.HILL" substring),
      // so recognise them separately: the candidate's last word must match
      // the surname and its first word must start with the first initial.
      const initialSurnameMatch = shortForm.match(
        /^((?:[A-Z]\.)+)([A-Z]{2,})$/
      );

      // Officers sometimes type the registry's own "Full Name, born <date>"
      // convention directly into free-text narrative (e.g. "Heath HARRIS,
      // born 12 March 2000 (HARRIS)"). Left alone, the trailing date's
      // digits break the last-N-words candidate search below before it
      // ever reaches the actual name — every candidate window still
      // containing a date word fails the all-letters "looksLikeName" check,
      // so name recovery falls all the way back to the bare shortForm
      // ("HARRIS") instead of "Heath HARRIS". Strip the ", born ..." clause
      // first, same convention targetCoreName() already assumes for
      // registry-typed names.
      const bornClauseIdx = fullDescription.search(/,\s*born\b/i);
      const nameSource =
        bornClauseIdx > 0
          ? fullDescription.slice(0, bornClauseIdx)
          : fullDescription;
      const words = nameSource.trim().split(/\s+/);
      // Try last 4, 3, 2 words in order — use the longest that contains shortForm
      // AND where every word looks like a name word (not a common English word)
      let bestName = "";
      for (let take = Math.min(4, words.length); take >= 2; take--) {
        const candidate = words.slice(-take).join(" ");
        // Candidate must be all letters/spaces/hyphens/apostrophes (a name, not a sentence)
        const looksLikeName =
          /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'\-]{1,60}$/.test(candidate);
        // None of the candidate words should be a common non-name word
        const candidateWords = candidate.toLowerCase().split(/\s+/);
        const hasNonNameWord = candidateWords.some(w => NON_NAME_WORDS.has(w));
        // shortForm must be contained within the candidate (case-insensitive),
        // or — for "P.HILL" style short forms — the candidate's surname and
        // first initial must match.
        const candidateWordsUpper = candidate.toUpperCase().split(/\s+/);
        const shortInCandidate =
          candidate.toUpperCase().includes(shortForm.toUpperCase()) ||
          (initialSurnameMatch !== null &&
            candidateWordsUpper[candidateWordsUpper.length - 1] ===
              initialSurnameMatch[2] &&
            candidateWordsUpper[0].startsWith(initialSurnameMatch[1][0]));
        if (looksLikeName && !hasNonNameWord && shortInCandidate) {
          bestName = candidate;
          break;
        }
      }
      if (bestName) displayName = bestName;
    }

    results.push({
      shortForm: displayName,
      rawShortForm: shortForm,
      // A person listed after another ("A and B", "A, B and C") would
      // otherwise carry the list's own joining word or comma at the front of
      // their description. It is never part of the description.
      fullDescription:
        type === "person"
          ? fullDescription.replace(/^[\s,;]*(?:and\s+)?/i, "")
          : fullDescription,
      type,
      confidence,
    });
  }

  return results;
}

// A target's registered name is often followed by descriptive detail
// ("JOHN SMITH, born 1 Jan 1980") — take everything before the first comma
// as the "core" name to compare against observation-derived person entities.
export function targetCoreName(name: string): string {
  const commaIdx = name.indexOf(",");
  return (commaIdx > 0 ? name.slice(0, commaIdx) : name).trim().toLowerCase();
}
