import { VEHICLE_MAKES_PATTERN } from "@shared/vehicleModel";

import { flattenNestedBrackets } from "@shared/nestedBrackets";

import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";

import {
  regionSearch,
  type RegionEntityType,
  type RegionResult,
  type RegionViewer,
} from "@shared/regionSearch";

import type { CommandCode } from "@shared/commands";

import { VEHICLE_REGO_PATTERN } from "@shared/vehicleRego";

import {
  operations,
  rowMembers,
  runningSheets,
  sheetRows,
  targets,
  targetFieldHistory,
  wipcMembers,
  entityAliases,
  entityDedupDecisions,
} from "../../drizzle/schema";

import {
  findPossibleDuplicates,
  type DedupType,
  type DedupCandidateEntity,
} from "../entityDedup";

import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import {
  getCertificationsByRowIds,
  getMembersByRowIds,
  getOperationById,
  getRowsBySheetId,
  getRunningSheetById,
} from "./operations";
import { getTargetById } from "./targets";
import { getAllIntelligenceEntities } from "./reports";
import { encryptMember } from "./court";
import { OperationEntityPhoto } from "./faces";

// ─── Deep Search ─────────────────────────────────────────────────────────────
// Returns operations that match the query across: operation fields, sheet titles,
// sheet CINs (JSON text), target fields, and observation row text.
// Each matched operation includes a list of match contexts for display.

export type DeepSearchMatch = {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  matchContexts: string[];
  operationStatus: "active" | "before_court" | "archive";
};

export async function deepSearchOperations(
  query: string
): Promise<DeepSearchMatch[]> {
  const db = await getDb();
  if (!db || !query.trim()) return [];

  const q = `%${query.trim().toLowerCase()}%`;

  // 1. Operations that match on their own fields (case-insensitive via LOWER)
  const opMatches = await db
    .select()
    .from(operations)
    .where(
      or(
        like(sql`LOWER(${operations.name})`, q),
        like(sql`LOWER(COALESCE(${operations.promisNumber}, ''))`, q),
        like(sql`LOWER(COALESCE(${operations.imsNumber}, ''))`, q),
        like(sql`LOWER(COALESCE(${operations.investigationUnit}, ''))`, q)
      )
    );

  // 2. Sheets that match on title or sheetCins JSON text
  const sheetMatches = await db
    .select({
      operationId: runningSheets.operationId,
      title: runningSheets.title,
      sheetCins: runningSheets.sheetCins,
    })
    .from(runningSheets)
    .where(
      and(
        isNull(runningSheets.deletedAt),
        or(
          like(sql`LOWER(${runningSheets.title})`, q),
          like(sql`LOWER(COALESCE(${runningSheets.sheetCins}, ''))`, q)
        )
      )
    );

  // 3. Targets that match on any field
  const targetMatches = await db
    .select({
      operationId: targets.operationId,
      name: targets.name,
      tgt: targets.tgt,
      hbf: targets.hbf,
      hb: targets.hb,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      dep: targets.dep,
      arr: targets.arr,
    })
    .from(targets)
    .where(
      and(
        isNull(targets.deletedAt),
        or(
          like(sql`LOWER(${targets.name})`, q),
          like(sql`LOWER(COALESCE(${targets.tgt}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.hb}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v1}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v2}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.hbf}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v1f}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.v2f}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.dep}, ''))`, q),
          like(sql`LOWER(COALESCE(${targets.arr}, ''))`, q)
        )
      )
    );

  // 4. Observation rows that match
  const rowMatches = await db
    .select({
      sheetId: sheetRows.sheetId,
      observation: sheetRows.observation,
      time: sheetRows.time,
    })
    .from(sheetRows)
    .where(like(sql`LOWER(COALESCE(${sheetRows.observation}, ''))`, q));

  // 5. Row members (CIN in row) that match
  const memberMatches = await db
    .select({ rowId: rowMembers.rowId, memberName: rowMembers.memberName })
    .from(rowMembers)
    .where(like(sql`LOWER(${rowMembers.memberName})`, q));

  // Resolve sheetId → operationId for row/member matches
  const rowSheetIds = Array.from(new Set(rowMatches.map(r => r.sheetId)));
  const memberRowIds = Array.from(new Set(memberMatches.map(m => m.rowId)));
  let memberSheetIds: number[] = [];
  const memberRowToSheetMap: Record<number, number> = {}; // rowId -> sheetId
  if (memberRowIds.length > 0) {
    const memberRows = await db
      .select({ id: sheetRows.id, sheetId: sheetRows.sheetId })
      .from(sheetRows)
      .where(inArray(sheetRows.id, memberRowIds));
    memberRows.forEach(r => {
      memberRowToSheetMap[r.id] = r.sheetId;
    });
    memberSheetIds = Array.from(new Set(memberRows.map(r => r.sheetId)));
  }
  const allSheetIds = Array.from(new Set([...rowSheetIds, ...memberSheetIds]));
  let sheetOpMap: Record<number, number> = {};
  if (allSheetIds.length > 0) {
    const sheetRows2 = await db
      .select({ id: runningSheets.id, operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(inArray(runningSheets.id, allSheetIds));
    sheetRows2.forEach(s => {
      sheetOpMap[s.id] = s.operationId;
    });
  }

  // Collect all matching operationIds with context labels
  const matchMap = new Map<number, Set<string>>();

  const ensure = (id: number) => {
    if (!matchMap.has(id)) matchMap.set(id, new Set());
  };

  opMatches.forEach(op => {
    ensure(op.id);
    matchMap.get(op.id)!.add("Operation details");
  });

  sheetMatches.forEach(s => {
    // s.operationId IS the operationId directly from runningSheets.operationId
    const opId = s.operationId;
    ensure(opId);
    matchMap.get(opId)!.add(`Sheet: ${s.title}`);
  });

  targetMatches.forEach(t => {
    if (t.operationId === null) return;
    ensure(t.operationId);
    matchMap.get(t.operationId)!.add(`Target: ${t.name}`);
  });

  rowMatches.forEach(r => {
    const opId = sheetOpMap[r.sheetId];
    if (!opId) return;
    ensure(opId);
    const snippet = (r.observation ?? "").slice(0, 60);
    matchMap
      .get(opId)!
      .add(`Observation: "${snippet}${snippet.length === 60 ? "…" : ""}"`);
  });

  memberMatches.forEach(m => {
    const sheetId = memberRowToSheetMap[m.rowId];
    if (!sheetId) return;
    const opId = sheetOpMap[sheetId];
    if (!opId) return;
    ensure(opId);
    matchMap.get(opId)!.add(`CIN: ${m.memberName}`);
  });

  // Fetch full operation records for all matched ids
  const matchedIds = Array.from(matchMap.keys());
  if (matchedIds.length === 0) return [];

  const matchedOps = await db
    .select()
    .from(operations)
    .where(inArray(operations.id, matchedIds));

  return matchedOps.map(op => ({
    operationId: op.id,
    operationName: op.name,
    promisNumber: op.promisNumber ?? null,
    imsNumber: op.imsNumber ?? null,
    investigationUnit: op.investigationUnit ?? null,
    matchContexts: Array.from(matchMap.get(op.id) ?? []),
    operationStatus: (op.status ?? "active") as
      | "active"
      | "before_court"
      | "archive",
  }));
}

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

export interface IntelligenceEntity {
  shortForm: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  /** True when this entity comes from a formal target card (not just observation text) */
  isTarget?: boolean;
  /** For target entities: the TGT code alias (e.g. "TANG") if set on the target card */
  tgtAlias?: string | null;
  /** For target entities: the numeric DB id of the target record */
  targetId?: number | null;
  /** For target/associate entities: the structured registry surname field
   * (targets.surname / associates.surname) — used for "Sort by Surname" on
   * the Intelligence folder's Targets/Associates tabs, rather than guessing
   * a surname out of the free-text shortForm display name. */
  surname?: string | null;
  /** True when at least one occurrence was extracted with low confidence (type=unknown or ambiguous pattern) */
  lowConfidence?: boolean;
  /** Labels of entities merged into this one via a confirmed duplicate decision. */
  aliasLabels?: string[];
  /** True when this entity comes from a formal registry associate record (not just observation text) */
  isAssociate?: boolean;
  /** For associate entities: the numeric DB id of the associate record */
  associateId?: number | null;
  /** For associate entities: the parent target this associate belongs to */
  associateOfTargetId?: number | null;
  associateOfTargetName?: string | null;
  /**
   * True when every occurrence of this entity is synthetic (rowId 0) — i.e.
   * it exists only because it was typed into the Target Registry (or another
   * non-running-sheet source), and has never actually been mentioned in a
   * real observation row yet. Drives the "Indices" badge: the moment a real
   * (rowId > 0) occurrence appears, this flips to false permanently, since
   * the information is now corroborated by a running sheet.
   */
  isIndicesOnly?: boolean;
  /**
   * Set when this entity's Target/Associate card is linked (via
   * targets.linkedAssociateId / associates.linkedTargetId — see "Person
   * Identity Links" above updateTarget) to a card of the other kind for
   * the same real person. Both entities' occurrences are unioned so
   * either profile shows the complete picture; this points at the other
   * one so the UI can flag "identical profile" and link across.
   */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  occurrences: Array<{
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    rowId: number;
    observationSnippet: string;
    timeMinutes: number | null;
    fullDescription: string;
  }>;
}

/**
 * Merges address/vehicle entities of one type where one shortForm is a
 * strict prefix of another (e.g. "1 Smith Street" absorbed into "1 Smith
 * Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux") — the same
 * real-world thing recognised twice: once from a registry card, once from
 * observation text, under two different labels. Exported and pure (no DB)
 * so this can be tested directly — see entityMerge.test.ts.
 *
 * IMPORTANT constraints:
 *   - Only meaningful for "address" and "vehicle" types (NOT persons or
 *     businesses) because person names share common prefixes legitimately
 *     (SMITH vs SMITH JONES) — callers should only invoke this for a group
 *     that's already been filtered to one of those two types.
 *   - isTarget entities are never passed to this pass.
 *   - The shorter form must end at a natural word boundary in the longer
 *     form (space, comma, semicolon, dash, or slash) to avoid false merges.
 *
 * `absorbed` is tracked by entity object, not by shortForm string: when a
 * registry entity and a text-mined entity for the same place format to the
 * exact same label — the normal case once registry addresses are tidied for
 * display (see 17e2229) — a string-keyed set can't tell "the entity that got
 * absorbed" from "the entity it was absorbed into"; they're the same string.
 * That collision used to silently drop the merged survivor (all its
 * occurrences included) from the output entirely, precisely whenever a
 * registry card and an observation-derived mention of the same address
 * coincided — the case that matters most.
 */
export function mergeContainedEntities(
  group: IntelligenceEntity[],
  entityType: "address" | "vehicle"
): IntelligenceEntity[] {
  // Sort by shortForm length descending so longer (fuller) versions come first
  const sorted = [...group].sort(
    (a, b) => b.shortForm.length - a.shortForm.length
  );
  const absorbed = new Set<IntelligenceEntity>();
  const survivors: IntelligenceEntity[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const longer = sorted[i];
    const longerLower = longer.shortForm.toLowerCase().trim();
    if (absorbed.has(longer)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const shorter = sorted[j];
      const shorterLower = shorter.shortForm.toLowerCase().trim();
      if (absorbed.has(shorter)) continue;

      // For vehicles: also absorb when the shorter shortForm appears ANYWHERE inside
      // the longer (e.g. "ABC 123" inside "silver Toyota Hilux bearing ABC 123").
      // For addresses: keep the original prefix-only rule.
      const isContained =
        entityType === "vehicle"
          ? (() => {
              const idx = longerLower.indexOf(shorterLower);
              if (idx === -1) return false;
              // Must be at a word boundary on both sides
              const before =
                idx === 0 || /[\s,;\-/(]/.test(longerLower[idx - 1]);
              const after =
                idx + shorterLower.length === longerLower.length ||
                /[\s,;\-/)]/.test(longerLower[idx + shorterLower.length]);
              return before && after;
            })()
          : longerLower.startsWith(shorterLower) &&
            (longerLower.length === shorterLower.length ||
              /^[\s,;\-/]/.test(longerLower.slice(shorterLower.length)));
      if (isContained) {
        // Merge shorter's occurrences into longer, deduplicating by sheetId+rowId+snippet
        const existingKeys = new Set(
          longer.occurrences.map(
            (o: IntelligenceEntity["occurrences"][0]) =>
              `${o.sheetId}::${o.rowId}::${o.observationSnippet}`
          )
        );
        for (const occ of shorter.occurrences) {
          const occKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
          if (!existingKeys.has(occKey)) {
            longer.occurrences.push(occ);
            existingKeys.add(occKey);
          }
        }
        if (shorter.aliasLabels?.length) {
          longer.aliasLabels = longer.aliasLabels ?? [];
          for (const label of shorter.aliasLabels) {
            if (!longer.aliasLabels.includes(label))
              longer.aliasLabels.push(label);
          }
        }
        // For vehicles: when merging, prefer the entity with a richer display name
        // (one that includes colour/make/model) over a bare rego or "Vehicle REGO" form.
        // The longer entity (sorted by shortForm length) is usually richer, so we keep it.
        // Exception: if the longer entity is actually a bare rego and the shorter has
        // a richer description (colour+make), swap them.
        if (entityType === "vehicle") {
          const longerHasDesc = /[a-z]/i.test(
            longer.shortForm.replace(/^\d[A-Z]{2,3}\d{3}\s*/i, "")
          );
          const shorterHasDesc = /[a-z]/i.test(
            shorter.shortForm.replace(/^\d[A-Z]{2,3}\d{3}\s*/i, "")
          );
          if (!longerHasDesc && shorterHasDesc) {
            longer.shortForm = shorter.shortForm;
          }
        }
        absorbed.add(shorter);
      }
    }

    // Only keep this entity if it was NOT itself absorbed by a longer one
    if (!absorbed.has(longer)) {
      survivors.push(longer);
    }
  }

  return survivors;
}

// Vehicles are uniquely identified by their registration, not by whatever
// descriptive text happens to surround it in a given mention. The same car
// can show up as "1ADF124" (bare), "Vehicle 1ADF124" (chip insert),
// "1ADF124 red Ford Territory" (built from observation text), or "silver
// Hyundai Santa Fe, bearing WA registration 1ICW519" (raw target-card V1F
// field) — all textually very different despite being the same physical
// vehicle, which previously produced separate duplicate entities. Extract
// the WA-plate-shaped token (if any) and key on that alone so every
// mention of the same vehicle collapses into one entity; the richest
// available description is still kept for display (see "prefer longer
// shortForm" below).
export function vehicleRegoKey(text: string): string {
  const m = text.match(VEHICLE_REGO_PATTERN);
  return (m ? m[0] : text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extracts the trailing "(<short form>)" bracket content from a composed
 * HBF-style address string (e.g. "6 Shearman Street, ATTADALE WA (6
 * Shearman Street)" -> "6 shearman street") — the same short text an
 * observation row's own "(ShortForm)" bracket would contain for the same
 * address. Registry address fields must key on this, not the full
 * street/suburb/state description, or a registry-sourced address entity can
 * never match (and therefore never get corroborated by) a text-mined
 * mention of the same real-world address. Falls back to the whole
 * (normalized) string when there's no trailing bracket, e.g. legacy
 * free-text data entered before the structured address fields existed.
 */
export function addressBracketKey(text: string): string {
  const m = text.match(/\(([^()]{1,120})\)\s*$/);
  return (m ? m[1] : text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * A Vehicle or Location TARGET is itself the subject, so it is stored as the
 * entity `target::<name>`. Observation text that mentions that same vehicle
 * (by rego) or place (by its bracket short form) is mined into an ordinary
 * `vehicle::<rego>` / `address::<short form>` entity, which left the target
 * listed twice: once as the target card ("Indices" only, no sightings) and
 * once as an ordinary vehicle/address with all the sightings.
 *
 * This is the ordinary entity key such a target stands in for, so
 * getAllIntelligenceEntities can fold those mentions into the target
 * instead. Null when the target isn't a vehicle with a rego or a location,
 * or has nothing to key on (a vehicle target named only by description).
 */
export function subjectTargetEntityKey(
  targetType: string | null | undefined,
  targetName: string
): string | null {
  if (targetType === "vehicle") {
    const m = targetName.match(VEHICLE_REGO_PATTERN);
    return m ? `vehicle::${m[0].toLowerCase()}` : null;
  }
  if (targetType === "location") {
    const k = addressBracketKey(targetName);
    return k ? `address::${k}` : null;
  }
  return null;
}

/** Same "type::normalizedShortForm" key scheme getAllIntelligenceEntities uses internally. */
export function computeEntityKey(type: DedupType, shortForm: string): string {
  const norm =
    type === "vehicle"
      ? vehicleRegoKey(shortForm)
      : normalizeEntityLabel(shortForm);
  return `${type}::${norm}`;
}

export interface SheetEntityChip {
  key: string;
  type: "person" | "vehicle" | "address" | "business";
  /** The short bracket token as typed — surname / rego / short address — inserted when the chip is tapped. */
  insertValue: string;
  /** The fuller recovered name/description shown on the chip button itself. */
  display: string;
  occurrenceCount: number;
}

// Surfaces a quick-tap chip for every distinct person/vehicle/address/business
// mentioned in this sheet's observations so far, reusing the same
// "Full description (SHORT)" bracket convention extractEntitiesFromText
// already parses — e.g. "Jason JOHNSON (JOHNSON)" surfaces a JOHNSON chip,
// "white Toyota Landcruiser (1FBP509)" surfaces a 1FBP509 chip. Scoped to
// just this sheet's rows (not the whole operation/registry), computed on
// read rather than stored, so every officer viewing the sheet sees the same
// chips — not a per-device thing. Low-confidence extractions are excluded
// to keep the chip bar from filling with noise from ambiguous text.
//
// Anything already covered by the sheet's assigned target card (TGT/HB/
// V1/V2.../DEP/ARR/wild fields — the blue chips) is skipped, since those
// already have their own chip; these purple chips are for genuinely new
// information logged in this sheet, not a duplicate of the target card.
export async function getSheetEntityChips(
  sheetId: number
): Promise<SheetEntityChip[]> {
  const [rows, sheet] = await Promise.all([
    getRowsBySheetId(sheetId),
    getRunningSheetById(sheetId),
  ]);

  const targetKeys = new Set<string>();
  if (sheet?.targetId) {
    const t = await getTargetById(sheet.targetId);
    if (t) {
      const addKey = (type: DedupType, v?: string | null) => {
        if (v) targetKeys.add(computeEntityKey(type, v));
      };
      addKey("person", t.tgt);
      addKey("address", t.hb);
      addKey("address", t.dep);
      addKey("address", t.arr);
      addKey("vehicle", t.v1);
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(
          t.extraVehicles ?? "[]"
        );
        evs.forEach(ev => addKey("vehicle", ev.short));
      } catch {}
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(
          t.wildFields ?? "[]"
        );
        // A wild field's type isn't known ahead of time, so cover all three —
        // an accidental cross-type key collision on arbitrary text is negligible.
        wfs.forEach(wf => {
          addKey("person", wf.value);
          addKey("vehicle", wf.value);
          addKey("address", wf.value);
        });
      } catch {}
    }
  }

  const byKey = new Map<string, SheetEntityChip>();

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    for (const e of entities) {
      if (e.confidence === "low") continue;
      if (e.type === "unknown") continue;
      const key = computeEntityKey(e.type, e.rawShortForm);
      if (targetKeys.has(key)) continue;
      const existing = byKey.get(key);
      if (existing) {
        existing.occurrenceCount++;
        if (e.shortForm.length > existing.display.length)
          existing.display = e.shortForm;
      } else {
        byKey.set(key, {
          key,
          type: e.type,
          insertValue: e.rawShortForm,
          display: e.shortForm,
          occurrenceCount: 1,
        });
      }
    }
  }

  // Group by type — vehicles, then persons, then locations, then business —
  // preserving each entity's original generation order within its group
  // (Array.prototype.sort is a stable sort, so equal-type items keep their
  // relative Map-insertion order rather than being re-sorted by name/count).
  const TYPE_ORDER: Record<SheetEntityChip["type"], number> = {
    vehicle: 0,
    person: 1,
    address: 2,
    business: 3,
  };
  return Array.from(byKey.values())
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .slice(0, 24);
}

// ─── Entity Deduplication ───────────────────────────────────────────────────
// Deterministic fuzzy-duplicate detection and manual/confirmed merging for
// non-target Intelligence entities (person/vehicle/address/business). See
// server/entityDedup.ts for the matching heuristics themselves — everything
// here is plain DB plumbing around entity_aliases / entity_dedup_decisions.

/** Bare normalized key (no "type::" prefix) — what entity_aliases/entity_dedup_decisions store. */
export function normOnly(type: DedupType, shortForm: string): string {
  return type === "vehicle"
    ? vehicleRegoKey(shortForm)
    : normalizeEntityLabel(shortForm);
}

export interface DuplicateMatchResult {
  key: string;
  label: string;
  type: DedupType;
  rowCount: number;
  score: number;
  reason: string;
  associateId?: number | null;
  associateOfTargetId?: number | null;
  /** True when the label is the SAME normalized name, not a near miss. Only
   * returned when the caller asks for exact matches (`includeExact`). */
  exact?: boolean;
}

/**
 * Fuzzy-matches a candidate label (not yet saved as an entity — this is
 * called as an officer types/saves an observation row) against every
 * existing entity of the same type, excluding pairs already confirmed as
 * distinct via a previous "No" answer.
 */
export async function checkPossibleDuplicates(
  type: DedupType,
  label: string,
  opts: { includeExact?: boolean } = {}
): Promise<DuplicateMatchResult[]> {
  const db = await getDb();
  if (!db) return [];
  const candidateCombinedKey = computeEntityKey(type, label);
  const candidateBareKey = normOnly(type, label);

  // Already a confirmed alias (either side) — getAllIntelligenceEntities will
  // silently fold this into its winner, so there's nothing new to ask about.
  const existingAlias = await db
    .select()
    .from(entityAliases)
    .where(
      and(
        eq(entityAliases.type, type),
        or(
          eq(entityAliases.loserKey, candidateBareKey),
          eq(entityAliases.winnerKey, candidateBareKey)
        )
      )
    )
    .limit(1);
  if (existingAlias.length > 0) return [];

  const allEntities = await getAllIntelligenceEntities();
  const candidates: DedupCandidateEntity[] = allEntities
    .filter(e => !e.isTarget && e.type === type)
    .map(e => ({
      key: computeEntityKey(type, e.shortForm),
      label: e.shortForm,
      type,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
      associateId: e.isAssociate ? e.associateId : null,
      associateOfTargetId: e.isAssociate ? e.associateOfTargetId : null,
    }));

  const decisions = await db
    .select()
    .from(entityDedupDecisions)
    .where(eq(entityDedupDecisions.type, type));
  const decidedDifferentBareKeys = new Set<string>();
  for (const d of decisions) {
    if (d.keyA === candidateBareKey) decidedDifferentBareKeys.add(d.keyB);
    else if (d.keyB === candidateBareKey) decidedDifferentBareKeys.add(d.keyA);
  }
  const filtered = candidates.filter(
    c => !decidedDifferentBareKeys.has(normOnly(type, c.label))
  );

  const fuzzy: DuplicateMatchResult[] = findPossibleDuplicates(
    label,
    type,
    candidateCombinedKey,
    filtered
  );
  if (!opts.includeExact) return fuzzy;
  // The row-save prompt leaves an exact match out — the same name simply
  // collapses into one entity there. But when REGISTERING a record for a
  // person who is already in the Intelligence folder (an associate, or
  // someone mined from rows), an exact name is the strongest match there is
  // and the officer must be told, so it leads the list.
  const exact: DuplicateMatchResult[] = candidates
    .filter(c => c.key === candidateCombinedKey)
    .map(c => ({
      ...c,
      score: 1,
      reason: "same name already recorded",
      exact: true,
    }));
  return [...exact, ...fuzzy];
}

/**
 * Region Search: which Commands hold an entity (person, vehicle, address).
 * Every signed-in user sees the same matches and details; restricted
 * operations only differ in whether `canOpen` is true (see shared/regionSearch).
 */
export async function searchRegions(
  viewer: RegionViewer,
  opts: { query: string; type?: RegionEntityType; command?: CommandCode }
): Promise<RegionResult[]> {
  const db = await getDb();
  if (!db) return [];
  const [entities, ops] = await Promise.all([
    getAllIntelligenceEntities({ unscoped: true }),
    db
      .select({
        id: operations.id,
        name: operations.name,
        command: operations.command,
        restricted: operations.restricted,
      })
      .from(operations)
      .where(isNull(operations.deletedAt)),
  ]);
  return regionSearch(entities, ops, viewer, opts);
}

// ─── Association Graph ───────────────────────────────────────────────────────

export interface AssocNode {
  id: string; // e.g. "person::SAM JACK"
  label: string; // display label
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number; // total times seen
  operationIds: number[];
  operationNames: string[];
  /** Registry target id when this node is a target, else null. Lets callers
   * (e.g. the Intelligence Package, which centres a diagram on each chosen
   * target) match a target to its node by id instead of by display label. */
  targetId: number | null;
}

export interface AssocEdge {
  source: string; // node id
  target: string; // node id
  weight: number; // number of rows where both appear together
}

export interface AssociationGraph {
  nodes: AssocNode[];
  edges: AssocEdge[];
}

/**
 * Co-occurrence graph for the Association Map / Ego Network.
 *
 * Built on getAllIntelligenceEntities() — the same two-pass, alias-merged
 * pipeline the Intelligence folder's own entity list uses — rather than
 * running extractEntitiesFromText() per row. That distinction is the whole
 * point: extractEntitiesFromText only recognises entities that are
 * bracket-introduced in the row it is handed, but the running sheet
 * convention is to bracket-introduce an entity once and then refer to it
 * bare ("HOGAN entered Vehicle 1FAD093"). Per-row extraction therefore sees
 * at most one entity in almost every row, finds no pairs, and produces a
 * graph with zero edges. Grouping the resolved entities' own occurrences by
 * rowId picks up those bare re-mentions and yields the real co-occurrences.
 *
 * Occurrences with rowId 0 are synthetic — they come from a Target Registry
 * card rather than an observation — so they make an entity appear as a node
 * but never manufacture an edge.
 */
export async function getAssociationGraph(
  operationIds?: number[],
  sheetIds?: number[]
): Promise<AssociationGraph> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const scoped = operationIds && operationIds.length > 0 ? operationIds : null;
  const sheetScoped = sheetIds && sheetIds.length > 0 ? sheetIds : null;
  const entities = await getAllIntelligenceEntities();

  const nodeMap = new Map<string, AssocNode>();
  // rowId -> node ids mentioned in that row
  const rowMembers = new Map<number, Set<string>>();

  for (const entity of entities) {
    // A Target and Associate card confirmed as the same real person (see
    // identicalProfile in getAllIntelligenceEntities) already carry the
    // same unioned occurrences — represent them as ONE combined node
    // (the Target side) rather than two nodes for one person. Skip the
    // Associate side here; its occurrences are already fully reflected via
    // the Target node below.
    if (entity.isAssociate && entity.identicalProfile?.type === "target") {
      continue;
    }

    const type: AssocNode["type"] = entity.isTarget
      ? "target"
      : (entity.type as AssocNode["type"]);
    const nodeId = entity.isTarget
      ? `target::${entity.shortForm}`
      : `${entity.type}::${entity.shortForm.toLowerCase()}`;

    const relevant = entity.occurrences.filter(
      o =>
        (!scoped || scoped.includes(o.operationId)) &&
        (!sheetScoped || sheetScoped.includes(o.sheetId))
    );
    if (relevant.length === 0) continue;

    let node = nodeMap.get(nodeId);
    if (!node) {
      node = {
        id: nodeId,
        label: entity.shortForm,
        type,
        occurrences: 0,
        operationIds: [],
        operationNames: [],
        targetId: entity.isTarget ? (entity.targetId ?? null) : null,
      };
      nodeMap.set(nodeId, node);
    }

    for (const occ of relevant) {
      node.occurrences++;
      if (!node.operationIds.includes(occ.operationId)) {
        node.operationIds.push(occ.operationId);
        node.operationNames.push(occ.operationName);
      }
      // rowId 0 is a registry-card mention, not a real observation — it
      // makes the entity visible but must not create a co-occurrence.
      if (occ.rowId > 0) {
        if (!rowMembers.has(occ.rowId)) rowMembers.set(occ.rowId, new Set());
        rowMembers.get(occ.rowId)!.add(nodeId);
      }
    }
  }

  // Every pair of entities sharing a row is one co-occurrence.
  const edgeWeight = new Map<string, number>();
  for (const members of Array.from(rowMembers.values())) {
    const ids = Array.from(members);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|||");
        edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: AssocEdge[] = [];
  for (const [key, weight] of Array.from(edgeWeight.entries())) {
    const [source, target] = key.split("|||");
    edges.push({ source, target, weight });
  }

  // A registry-only entity has real presence in the app even with no
  // observation behind it yet — keep it visible rather than showing 0.
  for (const node of Array.from(nodeMap.values())) {
    if (node.occurrences === 0) node.occurrences = 1;
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

// ─── Intel Export ───────────────────────────────────────────────────────────
// Structured JSON/CSV data for handing running-sheet content and its mined
// intelligence to another agency's system — Administration → Intel Export.
// Deliberately independent of the Court module (Statement/Witness List/
// WIPC generators) — this reads straight from running sheets and the
// Intelligence entity index, nothing here is ever built from Court output.
// CINs are exported as recorded (no WIPC redaction).

export interface IntelExportRunningSheet {
  operation: {
    id: number;
    name: string;
    promisNumber: string | null;
    imsNumber: string | null;
    investigationUnit: string | null;
  } | null;
  sheet: {
    id: number;
    title: string;
    sheetDate: string | null;
    status: "open" | "closed";
    closedAt: number | null;
    closedByCIN: string | null;
    targetId: number | null;
    targetName: string | null;
    roster: { cin: string; isTeamLeader: boolean }[];
  };
  rows: {
    rowNumber: number;
    date: string | null;
    time: string | null;
    observation: string | null;
    membersPresent: string[];
    certifications: { cin: string; certifiedAt: string }[];
    isLocked: boolean;
  }[];
}

export interface IntelExportEntity {
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  shortForm: string;
  isRegisteredTarget: boolean;
  registryId: number | null;
  occurrences: {
    sheetId: number;
    sheetTitle: string;
    rowNumber: number | null;
    time: string | null;
    snippet: string;
  }[];
}

/** Builds both Intel Export documents (the running sheet(s) themselves, and
 * the intelligence mined from them) for a set of running sheets — the
 * caller decides which of the two, and in which format(s), to actually
 * download. */
export async function getIntelExportData(sheetIds: number[]): Promise<{
  runningSheets: IntelExportRunningSheet[];
  intelEntities: IntelExportEntity[];
}> {
  const runningSheets: IntelExportRunningSheet[] = [];
  const rowMetaById = new Map<
    number,
    {
      sheetId: number;
      sheetTitle: string;
      rowNumber: number;
      time: string | null;
    }
  >();

  for (const sheetId of sheetIds) {
    const sheet = await getRunningSheetById(sheetId);
    if (!sheet) continue;
    const operation = sheet.operationId
      ? await getOperationById(sheet.operationId)
      : null;
    const rows = await getRowsBySheetId(sheetId);
    const rowIds = rows.map(r => r.id);
    const [members, certs] = await Promise.all([
      getMembersByRowIds(rowIds),
      getCertificationsByRowIds(rowIds),
    ]);

    let roster: { cin: string; isTeamLeader: boolean }[] = [];
    try {
      const raw: Array<{ cin: string; isTeamLeader?: boolean }> = JSON.parse(
        sheet.sheetCins ?? "[]"
      );
      roster = raw.map(c => ({
        cin: c.cin,
        isTeamLeader: !!c.isTeamLeader,
      }));
    } catch {
      roster = [];
    }

    rows.forEach(row => {
      rowMetaById.set(row.id, {
        sheetId,
        sheetTitle: sheet.title,
        rowNumber: row.rowNumber,
        time: row.time,
      });
    });

    runningSheets.push({
      operation: operation
        ? {
            id: operation.id,
            name: operation.name,
            promisNumber: operation.promisNumber ?? null,
            imsNumber: operation.imsNumber ?? null,
            investigationUnit: operation.investigationUnit ?? null,
          }
        : null,
      sheet: {
        id: sheet.id,
        title: sheet.title,
        sheetDate: sheet.sheetDate,
        status: sheet.closedAt ? "closed" : "open",
        closedAt: sheet.closedAt ?? null,
        closedByCIN: sheet.closedByCIN ?? null,
        targetId: sheet.targetId ?? null,
        targetName: sheet.targetName ?? null,
        roster,
      },
      rows: rows.map(row => ({
        rowNumber: row.rowNumber,
        date: row.rowDate ?? sheet.sheetDate ?? null,
        time: row.time,
        observation: row.observation,
        membersPresent: members
          .filter(m => m.rowId === row.id)
          .map(m => m.memberName),
        certifications: certs
          .filter(c => c.rowId === row.id && c.isActive)
          .map(c => ({
            cin: c.certifiedByCIN,
            certifiedAt: new Date(c.certifiedAt).toISOString(),
          })),
        isLocked: row.isLocked,
      })),
    });
  }

  const sheetIdSet = new Set(sheetIds);
  const allEntities = await getAllIntelligenceEntities();
  const intelEntities: IntelExportEntity[] = [];
  for (const e of allEntities) {
    const relevantOccurrences = e.occurrences.filter(
      o => sheetIdSet.has(o.sheetId) && o.rowId > 0
    );
    if (relevantOccurrences.length === 0) continue;
    intelEntities.push({
      type: e.type,
      shortForm: e.shortForm,
      isRegisteredTarget: !!e.isTarget || !!e.isAssociate,
      registryId: e.isTarget
        ? (e.targetId ?? null)
        : e.isAssociate
          ? (e.associateId ?? null)
          : null,
      occurrences: relevantOccurrences.map(o => {
        const meta = rowMetaById.get(o.rowId);
        return {
          sheetId: o.sheetId,
          sheetTitle: o.sheetTitle,
          rowNumber: meta?.rowNumber ?? null,
          time: meta?.time ?? null,
          snippet: o.observationSnippet,
        };
      }),
    });
  }

  return { runningSheets, intelEntities };
}

/** Save a new WIPC member (encrypted) — admin only */
export async function createWipcMember(
  createdBy: number,
  data: {
    fullName: string;
    dob?: string;
    afpId: string;
    cinNumber?: string;
    aiInitials?: string;
    aiKnownAs?: string;
    isUco?: boolean;
    isOco?: boolean;
    isCin?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  const [result] = await db.insert(wipcMembers).values({
    createdBy,
    fullName: encrypted.fullName as string,
    afpId: encrypted.afpId as string,
    dob: encrypted.dob as string | undefined,
    cinNumber: encrypted.cinNumber as string | undefined,
    aiInitials: encrypted.aiInitials as string | undefined,
    aiKnownAs: encrypted.aiKnownAs as string | undefined,
    isUco: data.isUco ?? false,
    isOco: data.isOco ?? false,
    isCin: data.isCin ?? true,
  });
  return result;
}

/** Update an existing WIPC member (encrypted) — admin only */
export async function updateWipcMember(
  id: number,
  data: Partial<{
    fullName: string;
    dob: string;
    afpId: string;
    cinNumber: string;
    aiInitials: string;
    aiKnownAs: string;
    isUco: boolean;
    isOco: boolean;
    isCin: boolean;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  await db
    .update(wipcMembers)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(wipcMembers.id, id));
}

/** Delete a WIPC member — admin only */
export async function deleteWipcMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(wipcMembers).where(eq(wipcMembers.id, id));
}

// ─── Intelligence Profile Queries ─────────────────────────────────────────────
// Correct association logic: an entity is an "operational associate" of a target
// ONLY if it appears in an observation row on a running sheet where that target
// is the LINKED TARGET (runningSheets.targetId = target.id).
// Co-membership in the same operation is NOT sufficient.

export interface IntelProfileEntity {
  id: string;
  label: string;
  type: "target" | "person" | "vehicle" | "address" | "business";
  targetId?: number;
  sheetIds: number[];
  operationIds: number[];
  rowCount: number;
  /** Only populated on the Operation profile — photos linked to this entity. */
  photos?: OperationEntityPhoto[];
  /** True when this vehicle/location matches a value superseded by a target-merge (see target_field_history). */
  isPrevious?: boolean;
}

/** A cross-operation link discovered because a DIFFERENT target/associate
 * registers the same vehicle rego or the same address as this one — e.g.
 * two independent targets on two different operations both have the same
 * car registered. Distinct from a "mentioned" link (which needs the other
 * record's name to actually appear in this one's observation text): this
 * fires purely from registry field overlap, so it catches cases where
 * there's no shared observation text linking the two records at all. */
export interface SharedEntityCrossLink {
  /** Absent when this link came from the vehicle/address itself being
   * independently sighted on another operation, rather than from another
   * specific target/associate registering the same vehicle/address. */
  targetId?: number;
  targetName?: string;
  operationId: number;
  operationName: string;
  via: "vehicle" | "address" | "associate";
  /** Exactly what is shared, for the tooltip/chip: the registration number(s)
   * for a vehicle, the address(es) in full for an address, the person's name
   * for an associate. Several shared things of one kind are joined. */
  sharedValue: string;
}

export interface IntelTargetProfile {
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  v2f: string | null;
  v2: string | null;
  /** Extra vehicles beyond V1: JSON array of {full: string, short: string} */
  extraVehicles: string | null;
  /** Extra addresses beyond HBF: JSON array of {full: string, short: string, ...} */
  extraAddresses: string | null;
  dep: string | null;
  arr: string | null;
  operations: Array<{
    id: number;
    name: string;
    /** The document's free-text narrative, verbatim, when this target was
     * created via document import for this operation — shown read-only on
     * the profile as "{Operation name} background". Null otherwise. */
    background: string | null;
  }>;
  /** Cross-operation links found via a shared registered vehicle/address —
   * see SharedEntityCrossLink. */
  sharedEntityLinks: SharedEntityCrossLink[];
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  /** Sheets this target is NOT formally assigned to (no runningSheets.targetId
   * link) but whose observation text mentions them by name — e.g. as a
   * passenger/associate on someone else's running sheet. Sourced from the
   * same name-matched entity data that already powers the Intelligence
   * Folder and Ego Network, so it stays consistent with what those show. */
  mentionedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  observationCount: number;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  /** True until this target has appeared in at least one real running-sheet
   * observation — i.e. everything known about them so far came from the
   * Target Registry (or another non-RS source), not from the field. */
  isIndicesOnly: boolean;
  /** Present when this target is linked (Person Identity Links) to a
   * Registry Associate record confirmed to be the same real person — both
   * profiles show identical combined intelligence; the UI uses this to
   * flag it and link across. */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  /** Associates recorded directly on this target in the Target Registry — a
   * guaranteed link (not inferred from observation-text co-occurrence). */
  registryAssociates: Array<{
    id: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    hb: string | null;
    v1f: string | null;
    v1: string | null;
    /** JSON [{full, short}] — the registry record's further addresses. */
    extraAddresses: string | null;
    isIndicesOnly: boolean;
    /** "associate" or "resident" (Other Home Address Resident). */
    relationship: string;
  }>;
  /** Person-target status from the registry — null until an officer sets it. */
  mdlStatus: string | null;
  bailStatus: string | null;
  bailConditions: string | null;
  bailConditionsText: string | null;
  /** JSON [{key, detail}] — TI / LBS / SEEK / CAD. */
  specialProjects: string | null;
  /** Freeform Background written in the Target Registry — null until set. */
  registryBackground: string | null;
  registryBackgroundUpdatedAt: number | null;
  registryBackgroundUpdatedByCIN: string | null;
}

export interface IntelOperationProfile {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  linkedSheets: Array<{
    id: number;
    title: string;
    targetId: number | null;
    targetName: string | null;
  }>;
  targets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    /** Extra vehicles beyond V1/V2: JSON array of {full, short}. Kept in
     * sync with the Target profile's own Registered Details — see
     * IntelTargetProfile.extraVehicles. */
    extraVehicles: string | null;
    /** Extra addresses beyond HBF: JSON array of {full, short, ...}. */
    extraAddresses: string | null;
    dep: string | null;
    arr: string | null;
    linkedSheets: Array<{ id: number; title: string }>;
    assocPersons: IntelProfileEntity[];
    assocVehicles: IntelProfileEntity[];
    assocLocations: IntelProfileEntity[];
    photos: OperationEntityPhoto[];
    isIndicesOnly: boolean;
    /** Associates recorded directly on this target in the Target Registry —
     * same guaranteed (not inferred) link as IntelTargetProfile.registryAssociates. */
    /** Person-target status from the registry — null until an officer sets it. */
    mdlStatus: string | null;
    bailStatus: string | null;
    bailConditions: string | null;
    bailConditionsText: string | null;
    /** JSON [{key, detail}] — TI / LBS / SEEK / CAD. */
    specialProjects: string | null;
    /** Freeform Background from the Target Registry — null until set. */
    registryBackground: string | null;
    registryBackgroundUpdatedAt: number | null;
    registryBackgroundUpdatedByCIN: string | null;
    registryAssociates: Array<{
      id: number;
      name: string;
      tgt: string | null;
      hbf: string | null;
      hb: string | null;
      v1f: string | null;
      v1: string | null;
      extraAddresses: string | null;
      isIndicesOnly: boolean;
      relationship: string;
    }>;
  }>;
  /** Cross-operation links found for any target in this operation — a
   * shared registered vehicle/address with a target on a DIFFERENT
   * operation. otherOperationId/otherOperationName refer to that other
   * operation, not this one. */
  crossOperationLinks: Array<{
    targetId: number;
    targetName: string;
    otherOperationId: number;
    otherOperationName: string;
    via: "vehicle" | "address" | "associate";
    sharedValue: string;
  }>;
}

export interface IntelAssociateProfile {
  label: string;
  type: "person" | "business";
  linkedTargets: Array<{
    targetId: number;
    name: string;
    operationId: number;
    operationName: string;
  }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocLocations: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  /** Cross-operation links found via a shared registered vehicle/address —
   * see SharedEntityCrossLink. */
  sharedEntityLinks: SharedEntityCrossLink[];
  /** True until this associate has appeared in at least one real running-sheet
   * observation — i.e. everything known about them so far came from the
   * Target Registry (or another non-RS source), not from the field. */
  isIndicesOnly: boolean;
  /** Present when this associate is linked (Person Identity Links) to a
   * Target record confirmed to be the same real person — both profiles
   * show identical combined intelligence; the UI uses this to flag it and
   * link across. */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  /** Present when this associate has a formal Target Registry record — its
   * own structured identity/address/vehicle, not just text-mined mentions. */
  registryAssociateId?: number | null;
  firstNames?: string | null;
  surname?: string | null;
  bornDate?: string | null;
  hbf?: string | null;
  hb?: string | null;
  v1f?: string | null;
  v1?: string | null;
  /** JSON [{full, short}] — the registry record's further addresses / vehicles. */
  extraAddresses?: string | null;
  extraVehicles?: string | null;
}

export interface IntelVehicleProfile {
  label: string;
  firstObservation: string | null;
  /** Every registered target/associate that lists this vehicle — a rego can
   * legitimately be registered by more than one record (e.g. two
   * independent targets on two different operations both have the same
   * car), so this must never be narrowed to "the first match". */
  linkedTargets: Array<{ targetId: number; name: string }>;
  /** Every registered associate that lists this vehicle — mirrors
   * linkedTargets above but for an associate's own vehicle field. */
  linkedAssociates: Array<{
    associateId: number;
    name: string;
    targetId: number;
    targetName: string;
  }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  /** True when this vehicle itself matches a value superseded by a target-merge. */
  isPrevious?: boolean;
  /** True until this vehicle has appeared in at least one real running-sheet
   * observation — i.e. it's only known from a Target/Associate registry field. */
  isIndicesOnly: boolean;
}

export interface IntelLocationProfile {
  label: string;
  /** A fuller "<street>, SUBURB STATE" form of this address, recovered from
   * an occurrence's free text, for geocoding — `label` alone is often just
   * a business/place name (see composeAddress's bracketCode) with no
   * suburb or street, which is far too ambiguous to geocode reliably. */
  fullAddress: string | null;
  linkedTargets: Array<{ targetId: number; name: string }>;
  /** Every registered associate that lists this address — mirrors
   * linkedTargets above but for an associate's own address field. */
  linkedAssociates: Array<{
    associateId: number;
    name: string;
    targetId: number;
    targetName: string;
  }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  /** True when this location itself matches a value superseded by a target-merge. */
  isPrevious?: boolean;
  /** True until this location has appeared in at least one real running-sheet
   * observation — i.e. it's only known from a Target/Associate registry field. */
  isIndicesOnly: boolean;
}

// A target's registered name is often followed by descriptive detail
// ("JOHN SMITH, born 1 Jan 1980") — take everything before the first comma
// as the "core" name to compare against observation-derived person entities.
export function targetCoreName(name: string): string {
  const commaIdx = name.indexOf(",");
  return (commaIdx > 0 ? name.slice(0, commaIdx) : name).trim().toLowerCase();
}

// ─── "Previous" entity propagation (target-merge history) ─────────────────
// A vehicle/address superseded during a duplicate-target merge (see
// mergeTargetFieldDetails) should read as "Previous" everywhere it shows up
// as an associated-entity chip across Intelligence profiles, not just on
// the target's own Registered Details — otherwise the same real vehicle/
// address can appear both "current" and unmarked-stale elsewhere, which is
// exactly the confusion this is meant to prevent. Matching is by
// registration (vehicles) / normalized address core (locations) rather
// than exact string equality, since the free-text entity mined from an
// observation rarely matches the manually-typed V1F/HBF field byte-for-byte.

export function extractRegoUpper(text: string): string | null {
  const m = text.match(VEHICLE_REGO_PATTERN);
  return m ? m[0].toUpperCase() : null;
}

// Normalizes down to just the street segment (house number + street name),
// dropping suburb/state/postcode/bracket-code — so a manually-typed HBF value
// ("6 Shearman Street, ATTADALE WA (6 Shearman Street)") and a free-text
// entity mined from an observation ("6 Shearman Street, ATTADALE" or just
// "6 Shearman Street") reduce to the same comparable core regardless of which
// optional parts either side happens to include.
export function addressCoreLower(text: string): string {
  // Prefer the canonical bracket short-form when present (mirrors the
  // client's extractShortAddress) — it's just the street, no suburb/state.
  const bracketMatch = text.match(/\(([^)]{1,120})\)\s*$/);
  const base = bracketMatch ? bracketMatch[1] : text;
  return base
    .replace(/,?\s*(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s*\d{0,4}\s*$/i, "")
    .replace(
      /^(?:unit|lot|apt|apartment|suite|ste)\s*\d+[a-z]?[,\s]*|^\d{1,4}[a-z]?\/(?=\d)/i,
      ""
    )
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function getPreviousEntityMatchers(): Promise<{
  vehicleRegos: Set<string>;
  addressCores: Set<string>;
}> {
  const db = await getDb();
  if (!db) return { vehicleRegos: new Set(), addressCores: new Set() };
  const rows = await db.select().from(targetFieldHistory);
  const vehicleRegos = new Set<string>();
  const addressCores = new Set<string>();
  for (const r of rows) {
    if (r.fieldName === "v1f" || r.fieldName === "v1") {
      const rego = extractRegoUpper(r.previousValue);
      if (rego) vehicleRegos.add(rego);
    } else if (r.fieldName === "hbf" || r.fieldName === "hb") {
      const core = addressCoreLower(r.previousValue);
      if (core) addressCores.add(core);
    }
  }
  return { vehicleRegos, addressCores };
}

/** Mutates matching vehicle/location entities in place, flagging isPrevious. */
export function markPreviousEntities(
  assocVehicles: IntelProfileEntity[],
  assocLocations: IntelProfileEntity[],
  matchers: { vehicleRegos: Set<string>; addressCores: Set<string> }
): void {
  for (const v of assocVehicles) {
    const rego = extractRegoUpper(v.label);
    if (rego && matchers.vehicleRegos.has(rego)) v.isPrevious = true;
  }
  for (const l of assocLocations) {
    const core = addressCoreLower(l.label);
    if (matchers.addressCores.has(core)) l.isPrevious = true;
  }
}
