// "Check Running Sheet" — an on-demand report an author can run against
// their own sheet, at any point, not just an admin-only whole-folder scan.
// Deliberately rule-based/deterministic throughout (see CLAUDE.md's Golden
// Rule) — nothing here is a model. Four categories, combined into one list:
//   - formatting: scopes the existing scanIntelligenceEntities rules
//     (intelligenceScan.ts) down to just this sheet's own entities, rather
//     than the whole Intelligence folder — plus a bracket-balance check
//     (isBracketBalanced), new, catching a malformed "(" / ")" pair
//     directly rather than only via a symptom downstream — plus a
//     punctuation-spacing check (checkPunctuationSpacing), new, catching a
//     dangling space left in front of a "." or "," after editing.
//   - registry: also scanIntelligenceEntities, specifically the possible-
//     typo-of-registry-name rule.
//   - consistency: new — the same real address/vehicle/person/business
//     written two different ways across this sheet's own rows (e.g. "1
//     Smith Street" in one row, "1 SMITH ST" in another; "1CDR890" vs a
//     typo'd "1CDR89") — an exact-normalised-match pass for all four
//     types, plus a fuzzy typo-of-the-same-one pass for vehicles/persons/
//     businesses specifically (checkFuzzyConsistencyForType) — addresses
//     are deliberately excluded from the fuzzy pass, since two genuinely
//     different streets coincidentally sound alike far more often than two
//     different vehicles/people/businesses do (see that function's own
//     comment) — plus a bare-mention pass for each type that can be
//     mentioned without ever being bracketed (checkBareAddressConsistency/
//     findSheetBareVehicleEntities/findSheetBareBusinessEntities — see
//     each one's own comment for why a bracket can't be assumed).
//
//     IMPORTANT: consistency reads from getRawSheetEntities, NOT the
//     scopedEntities the two categories above use. getAllIntelligenceEntities
//     (behind scopedEntities) merges an address/vehicle into another
//     whenever one shortForm is a strict prefix of the other — correct for
//     the Intelligence Folder (no duplicate cards), but it silently erased
//     the exact evidence a real bug ("24 Bedford" vs "24 Bedford Street")
//     needed to be caught at all — see getRawSheetEntities' own comment.
//   - spelling: new — a plain, curated list of common English
//     misspellings, checked against the prose OUTSIDE any bracket (bracket
//     content is a name/rego/address code, not prose, and is already
//     covered by the other three categories). Deliberately not a full
//     dictionary/fuzzy check: this app's observation text is full of
//     legitimate jargon, CINs, surnames and shortcut expansions a generic
//     dictionary would flood with false positives — a small list of
//     specific, unambiguous known-wrong spellings has none of that risk,
//     at the cost of only catching what's on the list.
// Grammar was explicitly scoped OUT — there's no deterministic way to
// check it, and doing it with the same small on-device model already used
// for Step 3 of the Local AI Roadmap would bury a low-confidence guess
// under the same "checked" badge as the fully deterministic categories
// here, which is worse than not offering it.
import {
  extractEntitiesFromText,
  getAllIntelligenceEntities,
  getObservationTextForSheet,
  scanFindingKey,
  vehicleRegoKey,
  type IntelligenceEntity,
  type ObservationTextForSheet,
} from "./db";
import { scanIntelligenceEntities } from "./intelligenceScan";
import { findFuzzyMatches, DEFAULT_FUZZY_THRESHOLD } from "./fuzzyMatch";

export type SheetCheckCategory =
  | "formatting"
  | "registry"
  | "consistency"
  | "spelling";

export interface SheetCheckFinding {
  ruleId: string;
  category: SheetCheckCategory;
  reason: string;
  /** The row this finding is about — for a consistency finding spanning
   * two rows, the FIRST (earlier) one; `otherRowId` carries the second. */
  rowId: number;
  otherRowId?: number;
  timeMinutes: number | null;
  snippet: string;
  /** Only set for a spelling finding — safe to auto-apply since it's an
   * exact, unambiguous known-wrong-spelling match, unlike every other
   * category here, which only ever offers "jump to row" since they need a
   * human judgement call. */
  suggestedFix?: { wrong: string; correct: string };
  /** Dismissal identity — the same (ruleId, findingKey) mechanism the
   * whole-folder Intelligence Scan already uses (dismissScanFinding /
   * getDismissedFindingKeys in db.ts). Deliberately just the raw key part
   * here, NOT prefixed with `ruleId` — the caller (routers.ts's sheet.check
   * / dismissCheckFinding) combines `${ruleId}::${findingKey}` itself,
   * matching getDismissedFindingKeys' own join convention; storing the
   * prefix here too would double it up once dismissScanFinding re-derives
   * its own key from this value. formatting/registry findings reuse that
   * mechanism's key unchanged (dismissing one dismisses it there too, and
   * vice versa, since they're the same underlying rule); consistency/
   * spelling findings are scoped to the specific row(s) so dismissing one
   * typo on one row doesn't silently dismiss the same word everywhere it's
   * ever typed correctly. */
  findingKey: string;
}

// ── Formatting / registry — scoped scanIntelligenceEntities ────────────────

function scopeEntityToSheet(
  entity: IntelligenceEntity,
  sheetId: number
): IntelligenceEntity | null {
  const occurrences = entity.occurrences.filter(
    o => o.sheetId === sheetId && o.rowId > 0
  );
  if (occurrences.length === 0) return null;
  return { ...entity, occurrences };
}

// ── Raw, non-merging entity source — for consistency checking ONLY ────────

// A real bug found in testing: getAllIntelligenceEntities() (used above for
// formatting/registry, and — until this was found — for consistency too)
// has a post-process merge step that absorbs one address/vehicle entity
// into another whenever one shortForm is a strict prefix of the other
// ("24 Bedford" folded into "24 Bedford Street" as the same real-world
// place). That's the RIGHT behaviour for the Intelligence Folder, which
// doesn't want duplicate address cards — but it's exactly the WRONG
// behaviour for Check Sheet: a real malformed bracket ("...24 Bedford
// Street, EAST FREMANTLE WA (24 Bedford)...", the shortform silently
// missing "Street") got fused into the correctly-written "24 Bedford
// Street" entity from other rows BEFORE checkConsistency ever ran, so
// there were no longer two different things to compare — the very
// evidence the check needed had already been erased upstream. This
// builds a completely separate, sheet-scoped entity list straight from
// each row's own text (extractEntitiesFromText), with NO cross-row
// merging beyond grouping identical, EXACT shortForm text together —
// every distinct spelling/shape stays its own entity, so nothing can be
// silently absorbed before a consistency check gets to see it.
//
// Deliberately NOT used for checkFormattingAndRegistry above: that
// still needs getAllIntelligenceEntities' registry-aware entities (the
// possible-typo-of-registry-name rule specifically needs the isTarget/
// isAssociate-flagged entities that only that merged pipeline produces).
function getRawSheetEntities(
  sheetId: number,
  rows: ObservationTextForSheet[]
): IntelligenceEntity[] {
  const byKey = new Map<string, IntelligenceEntity>();
  for (const row of rows) {
    for (const e of extractEntitiesFromText(row.observation)) {
      if (e.type === "unknown") continue;
      const key = `${e.type}::${e.shortForm.trim().toUpperCase()}`;
      const occurrence = {
        sheetId,
        sheetTitle: "",
        operationId: 0,
        operationName: "",
        rowId: row.rowId,
        observationSnippet: row.observation,
        timeMinutes: row.timeMinutes,
        fullDescription: e.fullDescription,
      };
      const existing = byKey.get(key);
      if (existing) existing.occurrences.push(occurrence);
      else
        byKey.set(key, {
          type: e.type,
          shortForm: e.shortForm,
          occurrences: [occurrence],
        });
    }
  }
  return Array.from(byKey.values());
}

// A real bug found in testing: a comma-in-short-form finding on an address
// ("15 Marbella Avenue, SEVILLE GROVE" — a genuine, intentional suburb
// disambiguation, not a bug) kept reappearing after being dismissed.
// getAllIntelligenceEntities() picks the "richest" shortForm it's seen
// across every mention of that address whenever more than one candidate
// exists — which one wins can differ between one check and the next (a
// new row added, occurrences re-scanned in a different order), so the
// SAME real address can legitimately show up with or without its suburb
// clause from one run to the next. Since scanFindingKey hashes the exact
// shortForm text, that made the dismissal key drift too, silently
// un-dismissing something the officer had already dealt with. Stripping
// anything from the first comma onward before keying fixes this: the part
// before a comma (the rego, the name, the street) is the entity's actual
// stable identity — text after it is exactly the part that sometimes
// is and sometimes isn't included — so the key no longer moves even
// though the KEY doesn't affect what's shown in the finding text itself.
// A shortForm with no comma at all is unaffected (the common case).
export function stableDismissKey(shortForm: string): string {
  return scanFindingKey(shortForm.split(",")[0]);
}

function checkFormattingAndRegistry(
  scopedEntities: IntelligenceEntity[]
): SheetCheckFinding[] {
  const findings = scanIntelligenceEntities(scopedEntities);
  return findings.map(f => {
    const first = f.occurrences[0];
    return {
      ruleId: f.ruleId,
      category:
        f.ruleId === "possible-typo-of-registry-name"
          ? "registry"
          : "formatting",
      reason: f.reason,
      rowId: first?.rowId ?? 0,
      timeMinutes: null,
      snippet: first?.observationSnippet ?? "",
      // Deliberately just the raw key part, NOT prefixed with ruleId — see
      // dismissScanFinding/getDismissedFindingKeys in db.ts: the stored
      // findingKey column and the ruleId column are separate, joined with
      // "::" only when read back into an in-memory Set. Storing the prefix
      // here too would double it up once dismissCheckFinding calls
      // dismissScanFinding(ruleId, findingKey, ...), which re-derives its
      // own findingKey from whatever's passed as the second argument.
      // Same key the whole-folder scan itself uses UNLESS shortForm has a
      // comma — see stableDismissKey above for why that case needs its own
      // more stable key. For every comma-free shortForm (the vast
      // majority) this is identical to before, so dismissing here still
      // also dismisses it there, and vice versa.
      findingKey: stableDismissKey(f.shortForm),
    };
  });
}

// ── Consistency — same real address/vehicle, written two different ways ───

// Same short canonical list this app already keeps in more than one place
// (mentionAutocomplete.ts client-side, pdfTextReader.ts server-side) — kept
// in sync manually, same convention as those.
const STREET_TYPE_WORDS = new Set([
  "st",
  "street",
  "rd",
  "road",
  "ave",
  "avenue",
  "dr",
  "drive",
  "way",
  "ct",
  "court",
  "pl",
  "place",
  "cl",
  "close",
  "cres",
  "crescent",
  "blvd",
  "boulevard",
  "hwy",
  "highway",
  "fwy",
  "freeway",
  "ln",
  "lane",
  "tce",
  "terrace",
  "pde",
  "parade",
  "cct",
  "circuit",
  "gr",
  "grove",
  "rise",
  "loop",
  "link",
  "walk",
  "track",
  "row",
  "mews",
  "quay",
  "esplanade",
  "promenade",
]);

/** Normalises a street-address bracket label ("1 Smith Street", "1 SMITH
 * ST") down to a house-number + street-name key with the street-type word
 * dropped and case ignored, so both forms compare equal — the whole point
 * of this check. Returns null for a label that isn't a bare street address
 * (a business-name bracket, an unrecognisable shape), which is never
 * treated as inconsistent with anything. */
function normalizeStreetLabel(label: string): string | null {
  // A real bug found in testing: extractEntitiesFromText routinely
  // enriches a short bracket into "street, SUBURB" ("24 Bedford Street,
  // EAST FREMANTLE") using the surrounding sentence — this team's normal
  // convention (see every real example found this session). Without
  // stripping that suffix first, the street-type word ("Street") is no
  // longer the LAST word once a suburb follows it, so it was never being
  // found/stripped at all — "24 Bedford Street, EAST FREMANTLE" and a
  // plain "24 Bedford Street" normalised to two completely different
  // keys and were never compared as the same address. Stripping from the
  // first comma onward first (the same "core identity vs. sometimes-
  // present suffix" pattern stableDismissKey above already uses, for the
  // same underlying reason) fixes this for every shape at once.
  const core = label.split(",")[0];
  const m = core.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!m) return null;
  const houseNo = m[1].toUpperCase();
  const words = m[2].trim().split(/\s+/);
  if (words.length === 0) return null;
  const lastWord = words[words.length - 1].toLowerCase().replace(/\.$/, "");
  const streetWords = STREET_TYPE_WORDS.has(lastWord)
    ? words.slice(0, -1)
    : words;
  if (streetWords.length === 0) return null;
  return `${houseNo} ${streetWords.join(" ").toUpperCase()}`;
}

/** Normalises a vehicle entity's shortForm down to a bare uppercase rego,
 * so "1CDR891" and "1 CDR-891" compare equal.
 *
 * A real bug found in testing: a text-mined vehicle entity's shortForm is
 * NOT the bare rego — extractEntitiesFromText builds it as "REGO
 * description" whenever it can, e.g. "1CDR890 green Subaru Outback station
 * sedan" (see that function's vehicle branch in db.ts). A naive
 * spaces/hyphens-only strip (this function's original implementation)
 * turned that into "1CDR890GREENSUBARUOUTBACKSTATIONSEDAN" — a string
 * that could never usefully compare against anything, so the vehicle
 * consistency/fuzzy-typo checks below were silently comparing full
 * descriptions instead of regos for every vehicle with a description
 * attached (i.e. most real ones), not just the rare bare-rego mention.
 *
 * Fixed by preferring the WHOLE cleaned label when it's short enough to
 * plausibly BE a bare rego on its own (handles "1CDR891" / "1 CDR-891" /
 * "1CDR-891" — spacing/punctuation variants with nothing else attached),
 * and otherwise reusing vehicleRegoKey — the same rego-extraction this app
 * already uses everywhere else (entity de-duplication, chip search) — to
 * pull just the plate-shaped token out of a longer description. */
function normalizeRego(label: string): string {
  const compact = label.replace(/[\s-]/g, "").toUpperCase();
  if (compact.length <= 10 && /\d/.test(compact) && /[A-Za-z]/i.test(compact)) {
    return compact;
  }
  return vehicleRegoKey(label).toUpperCase();
}

/** Normalises a person bracket label down to letters-only uppercase, so
 * "P.HILL" and "P HILL" compare equal (the punctuation/spacing around the
 * app's own "initial-plus-surname" convention for disambiguating family
 * members — see extractEntitiesFromText). Deliberately does NOT strip the
 * initial itself: "P.HILL" and "HILL" stay distinct, since collapsing them
 * would treat a disambiguated family member as interchangeable with a
 * bare-surname mention of (possibly) someone else. Returns null for
 * anything too short to be meaningful. */
function normalizePersonLabel(label: string): string | null {
  const cleaned = label.replace(/[^A-Za-z]/g, "").toUpperCase();
  return cleaned.length >= 2 ? cleaned : null;
}

/** Normalises a business bracket label down to letters+digits-only
 * uppercase, so "7-Eleven" and "7 Eleven" compare equal but "Coles" and
 * "Coles Rockingham" — a genuinely more specific mention, not just
 * different formatting — stay distinct. */
function normalizeBusinessLabel(label: string): string | null {
  const cleaned = label.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.length >= 2 ? cleaned : null;
}

const CONSISTENCY_TYPE_NOUN: Record<
  "address" | "vehicle" | "person" | "business",
  string
> = {
  address: "location",
  vehicle: "vehicle",
  person: "person",
  business: "business",
};

/** True when two address labels differ ONLY by a trailing ", SUBURB"
 * clause on one side — e.g. "24 Bedford Street, EAST FREMANTLE" vs "24
 * Bedford Street". A real false positive found in testing: once
 * normalizeStreetLabel above was fixed to strip that clause before
 * comparing (so the two get recognised as the same address at all — see
 * its own comment), checkConsistencyForType started flagging that pair
 * as "written two different ways", but including or omitting a suburb
 * disambiguator is normal, deliberate variance for this team (the exact
 * same conclusion already reached for the dismiss-key drift bug on
 * "15 Marbella Avenue, SEVILLE GROVE" — see stableDismissKey above), not
 * a formatting inconsistency to fix. Only the STREET portion (before any
 * comma) needs to match for this to count as trivial; if that itself
 * differs ("1 Smith Street" vs "1 SMITH ST") it's still flagged. */
function isSuburbOnlyVariant(a: string, b: string): boolean {
  return (
    a.split(",")[0].trim().toLowerCase() ===
    b.split(",")[0].trim().toLowerCase()
  );
}

function checkConsistencyForType(
  entities: IntelligenceEntity[],
  type: "address" | "vehicle" | "person" | "business",
  ruleId: string,
  normalize: (label: string) => string | null,
  isTrivialVariant?: (a: string, b: string) => boolean
): SheetCheckFinding[] {
  const groups = new Map<string, IntelligenceEntity[]>();
  for (const e of entities) {
    if (e.type !== type) continue;
    const norm = normalize(e.shortForm);
    if (!norm) continue;
    const list = groups.get(norm);
    if (list) list.push(e);
    else groups.set(norm, [e]);
  }

  const findings: SheetCheckFinding[] = [];
  for (const group of Array.from(groups.values())) {
    const distinctLabels = new Map<string, IntelligenceEntity>();
    for (const e of group) {
      distinctLabels.set(e.shortForm.trim().toUpperCase(), e);
    }
    if (distinctLabels.size < 2) continue;
    const [entityA, entityB] = Array.from(distinctLabels.values());
    if (isTrivialVariant?.(entityA.shortForm, entityB.shortForm)) continue;
    const occA = entityA.occurrences[0];
    const occB = entityB.occurrences[0];
    if (!occA || !occB) continue;
    findings.push({
      ruleId,
      category: "consistency",
      reason: `"${entityA.shortForm}" and "${entityB.shortForm}" look like the same ${type} written two different ways on this sheet — pick one so both rows read as the same ${CONSISTENCY_TYPE_NOUN[type]}.`,
      rowId: occA.rowId,
      otherRowId: occB.rowId,
      timeMinutes: occA.timeMinutes,
      snippet: `${occA.observationSnippet}`,
      findingKey: `ROW_${occA.rowId}_${occB.rowId}::${entityA.shortForm.trim().toUpperCase()}`,
    });
  }
  return findings;
}

/** A close-but-not-exact match on the same sheet for a given entity type —
 * e.g. a real case found in testing: "1CDR890" mentioned correctly
 * earlier, then typed as "1CDR89" (one digit short) later in the same
 * sheet. Originally vehicles-only: two different vehicles legitimately
 * often have very similar-looking regos by pure coincidence (adjacent
 * fleet plates, near-identical personalised plates) — the same risk fuzzy
 * street-name matching would have for two genuinely different but
 * similarly-named streets, which is why addresses are still deliberately
 * excluded from this pass. Person names carry a much lower version of that
 * same coincidence risk (this is the exact same threshold/algorithm this
 * app already uses in production for possible-typo matching against the
 * Target/Associate Registry — see fuzzyMatch.ts's own comment on how 0.8
 * was picked), and business names are typically distinctive enough that a
 * near-miss is far more likely to be a typo than two genuinely different
 * businesses — so both were added alongside vehicles rather than excluded
 * the way addresses are. Compares NORMALISED labels rather than raw
 * shortForm text, so this never re-reports a pair the exact-match check
 * above already caught (same normalised label means findFuzzyMatches' own
 * exact-match exclusion skips it) — the two checks are complementary, not
 * overlapping.
 *
 * `skipPair`, when given, drops a would-be match before it's reported —
 * used for person names to avoid flagging the app's own deliberate
 * "P.HILL" initial-plus-surname convention (see extractEntitiesFromText
 * and normalizePersonLabel above) as a typo: an initialled surname is
 * usually just one or two characters longer than the bare surname it
 * disambiguates from, which routinely clears the 0.8 similarity threshold
 * on a short name ("HILL" vs "PHILL" scores exactly 0.8) even though
 * they're deliberately meant to read as different people. */
interface FuzzyCandidate {
  entity: IntelligenceEntity;
  norm: string;
}

function checkFuzzyConsistencyForType(
  entities: IntelligenceEntity[],
  type: "vehicle" | "person" | "business",
  ruleId: string,
  normalize: (label: string) => string | null,
  skipPair?: (a: FuzzyCandidate, b: FuzzyCandidate) => boolean,
  // The literal, as-typed text to offer as a one-click fix — defaults to
  // the entity's shortForm, but vehicles need their extracted rego
  // instead (see normalizeRego's own comment): a vehicle shortForm is
  // often a reconstructed "REGO description", which never appears
  // verbatim in the row's actual text the way the bare rego does.
  getReplacementText: (c: FuzzyCandidate) => string = c => c.entity.shortForm
): SheetCheckFinding[] {
  const candidates = entities
    .filter(e => e.type === type)
    .map(e => ({ entity: e, norm: normalize(e.shortForm) }))
    .filter((c): c is FuzzyCandidate => c.norm !== null);
  const noun = CONSISTENCY_TYPE_NOUN[type];
  const fuzzyCandidates = candidates.map((c, i) => ({
    id: String(i),
    label: c.norm,
  }));

  const findings: SheetCheckFinding[] = [];
  const reportedPairs = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    const occA = candidates[i].entity.occurrences[0];
    if (!occA) continue;
    const query = candidates[i].norm;
    const others = fuzzyCandidates.filter((_, j) => j !== i);
    const matches = findFuzzyMatches(query, others, DEFAULT_FUZZY_THRESHOLD);
    for (const match of matches) {
      const j = Number(match.id);
      if (skipPair?.(candidates[i], candidates[j])) continue;
      const pairKey = [i, j].sort().join("-");
      if (reportedPairs.has(pairKey)) continue;
      reportedPairs.add(pairKey);
      const occB = candidates[j].entity.occurrences[0];
      if (!occB) continue;
      const wrong = getReplacementText(candidates[i]);
      const correct = getReplacementText(candidates[j]);
      findings.push({
        ruleId,
        category: "consistency",
        reason: `"${candidates[i].entity.shortForm}" is close to "${candidates[j].entity.shortForm}" (${Math.round(match.similarity * 100)}% match) — check whether this is a typo of the same ${noun} rather than a different one.`,
        rowId: occA.rowId,
        otherRowId: occB.rowId,
        timeMinutes: occA.timeMinutes,
        snippet: occA.observationSnippet,
        // Offered as "Keep as wrong" / "Change to correct" rather than an
        // auto-applied fix — unlike a spelling typo, either side could
        // genuinely be the correct one, so this only ever pre-fills the
        // edit, it never assumes a direction.
        suggestedFix: wrong !== correct ? { wrong, correct } : undefined,
        findingKey: `ROW_${occA.rowId}_${occB.rowId}::${query}`,
      });
    }
  }
  return findings;
}

/** True when one normalised person label is exactly the other with a short
 * prefix added — the shape of the app's own "P.HILL" initial-plus-surname
 * convention ("HILL" -> "PHILL"), not a typo. Capped at a 2-character
 * prefix so a genuinely different, coincidentally-longer surname ("HILL"
 * vs "HILLS" — a suffix, not a prefix, so unaffected anyway; or two
 * unrelated names that happen to share a tail) isn't swept up. */
function isInitialVariant(a: FuzzyCandidate, b: FuzzyCandidate): boolean {
  const [shorter, longer] =
    a.norm.length <= b.norm.length ? [a.norm, b.norm] : [b.norm, a.norm];
  return (
    longer.length - shorter.length <= 2 &&
    longer.length > shorter.length &&
    longer.endsWith(shorter)
  );
}

/** Counts the real descriptive words in a vehicle shortForm once its own
 * rego is removed — 0 for a bare mention ("1CDR890" or "Vehicle 1CDR890"),
 * several for a described one ("1CDR890 green Subaru Outback station
 * sedan" -> "green"/"Subaru"/"Outback"/"station"/"sedan"). */
function vehicleDescriptionWordCount(shortForm: string, rego: string): number {
  const withoutRego = shortForm.replace(new RegExp(rego, "i"), "");
  return withoutRego
    .trim()
    .split(/\s+/)
    .filter(w => w.replace(/[^A-Za-z]/g, "").length >= 3).length;
}

/** True when BOTH sides of a vehicle fuzzy match carry their own real
 * description, not just a bare rego. A real false-positive found in
 * testing: two genuinely different, adjacently-plated vehicles on the same
 * sheet ("1CDR890 green Subaru Outback station sedan" and "1CDR891
 * burgundy Skoda Octavia hatch" — a real row, both correctly described)
 * scored 86% similar on rego alone and got flagged as a possible typo of
 * each other, exactly the coincidental-adjacent-plate risk this app's own
 * design notes already called out for vehicles. When each vehicle is
 * independently, fully described, a close rego is far more likely to be a
 * coincidence than a typo — so only fire when at least one side is a bare/
 * shorthand re-mention (the actual shape of a genuine typo: the vehicle
 * was already properly described once, and a LATER bare mention of a
 * near-miss rego is what should raise a flag). */
function bothVehiclesIndependentlyDescribed(
  a: FuzzyCandidate,
  b: FuzzyCandidate
): boolean {
  return (
    vehicleDescriptionWordCount(a.entity.shortForm, a.norm) >= 1 &&
    vehicleDescriptionWordCount(b.entity.shortForm, b.norm) >= 1
  );
}

/** Pure — no DB — directly testable, see sheetCheck.test.ts. */
export function checkConsistency(
  entities: IntelligenceEntity[]
): SheetCheckFinding[] {
  return [
    ...checkConsistencyForType(
      entities,
      "address",
      "inconsistent-address-format",
      normalizeStreetLabel,
      isSuburbOnlyVariant
    ),
    ...checkConsistencyForType(
      entities,
      "vehicle",
      "inconsistent-vehicle-format",
      normalizeRego
    ),
    ...checkConsistencyForType(
      entities,
      "person",
      "inconsistent-person-format",
      normalizePersonLabel
    ),
    ...checkConsistencyForType(
      entities,
      "business",
      "inconsistent-business-format",
      normalizeBusinessLabel
    ),
    ...checkFuzzyConsistencyForType(
      entities,
      "vehicle",
      "possible-typo-of-vehicle-rego",
      normalizeRego,
      bothVehiclesIndependentlyDescribed,
      c => c.norm
    ),
    ...checkFuzzyConsistencyForType(
      entities,
      "person",
      "possible-typo-of-person-name",
      normalizePersonLabel,
      isInitialVariant
    ),
    ...checkFuzzyConsistencyForType(
      entities,
      "business",
      "possible-typo-of-business-name",
      normalizeBusinessLabel
    ),
  ];
}

// ── Bare-prose address consistency — no bracket required ──────────────────

// Everything above this point only ever looks at BRACKETED entities — the
// `(SHORTFORM)` convention (see CLAUDE.md) extractEntitiesFromText relies
// on. A real sheet found in testing wrote an address in plain prose with
// no bracket at all in either mention — "...in the vicinity of 58 Kintail
// ." in one row, "...arrived at 58 Kintail Road" in another — so it never
// became an IntelligenceEntity and the checks above had nothing to
// compare. This is a separate, narrower pass: it looks directly at the raw
// observation text for a NUMBER + Capitalised-Word(s) phrase immediately
// following a small set of prepositions officers actually use to introduce
// a location ("at", "outside", "vicinity of", ...), regardless of whether
// it's ever bracketed. To keep false positives at zero, it only ever
// produces a finding when it finds a PAIR sharing the same normalised key
// (reusing normalizeStreetLabel above) where one mention has a street-type
// word and the other doesn't — an address that's merely mentioned once,
// bracketed or not, is never flagged on its own.
const ADDRESS_PREPOSITION_RE =
  /\b(?:at|outside|near|towards|opposite|vicinity of|corner of|address(?:\s+of)?)\s+(\d{1,5}[A-Za-z]?(?:\s+[A-Z][A-Za-z'-]*){1,4})/gi;

// The other real shape this team's own writing convention actually uses —
// found in testing: "Blend Cafe and Pizza Bar, 356 Marmion, MELVILLE WA"
// introduces the address straight after a comma (no preposition at all,
// usually right after a business name). Anchored on the comma + a leading
// number rather than any specific preceding word, since the text before
// the comma varies (a business name, a suburb, another street) — the
// leading digit is what reliably marks this as a street address rather
// than some other comma-separated clause.
const ADDRESS_COMMA_RE =
  /,\s*(\d{1,5}[A-Za-z]?(?:\s+[A-Z][A-Za-z'-]*){1,4})\b/g;

export interface BareAddressMention {
  raw: string;
  normKey: string;
  hasStreetType: boolean;
}

/** Pure — no DB — directly testable. */
export function findBareAddressMentions(text: string): BareAddressMention[] {
  const withoutBrackets = text.replace(/\([^()]*\)/g, m =>
    " ".repeat(m.length)
  );
  const out: BareAddressMention[] = [];
  const seen = new Set<number>();
  for (const source of [ADDRESS_PREPOSITION_RE, ADDRESS_COMMA_RE]) {
    const re = new RegExp(source.source, source.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(withoutBrackets)) !== null) {
      if (seen.has(m.index)) continue;
      seen.add(m.index);
      const raw = m[1].trim();
      const normKey = normalizeStreetLabel(raw);
      if (!normKey) continue;
      const words = raw.split(/\s+/);
      const lastWord = words[words.length - 1].toLowerCase().replace(/\.$/, "");
      out.push({
        raw,
        normKey,
        hasStreetType: STREET_TYPE_WORDS.has(lastWord),
      });
    }
  }
  return out;
}

function checkBareAddressConsistency(
  rows: ObservationTextForSheet[]
): SheetCheckFinding[] {
  interface Entry {
    rowId: number;
    timeMinutes: number | null;
    raw: string;
    observation: string;
  }
  const withTypeByKey = new Map<string, Entry>();
  const withoutTypeByKey = new Map<string, Entry>();
  for (const row of rows) {
    for (const mention of findBareAddressMentions(row.observation)) {
      const entry: Entry = {
        rowId: row.rowId,
        timeMinutes: row.timeMinutes,
        raw: mention.raw,
        observation: row.observation,
      };
      const target = mention.hasStreetType ? withTypeByKey : withoutTypeByKey;
      if (!target.has(mention.normKey)) target.set(mention.normKey, entry);
    }
  }

  const findings: SheetCheckFinding[] = [];
  for (const [normKey, withoutType] of Array.from(withoutTypeByKey.entries())) {
    const withType = withTypeByKey.get(normKey);
    if (!withType || withType.rowId === withoutType.rowId) continue;
    findings.push({
      ruleId: "incomplete-address-missing-street-type",
      category: "consistency",
      reason: `"${withoutType.raw}" doesn't include a street type — "${withType.raw}" is used elsewhere on this sheet and looks like the same address. Confirm it's the same place and make the wording consistent.`,
      rowId: withoutType.rowId,
      otherRowId: withType.rowId,
      timeMinutes: withoutType.timeMinutes,
      snippet:
        withoutType.observation.length > 140
          ? `${withoutType.observation.slice(0, 140)}…`
          : withoutType.observation,
      // Offered as "Keep as wrong" / "Change to correct" — unlike the
      // exact-match address-format check, here one side is unambiguously
      // more complete (has a street type, the other doesn't), so this is
      // worth pre-filling as a real edit rather than only Jump/Dismiss.
      suggestedFix: { wrong: withoutType.raw, correct: withType.raw },
      findingKey: `ROW_${withoutType.rowId}_${withType.rowId}::${withoutType.raw.trim().toUpperCase()}`,
    });
  }
  return findings;
}

// ── Bare-prose vehicle mentions — no bracket required ──────────────────────

// Same gap as the bare-address case above, found in testing the same way: a
// deliberately-planted incorrect rego ("Vehicle 1CDR80" vs the correct
// "1CDR890" mentioned — bracketed — elsewhere on the sheet) went uncaught
// because that ONE mention was never bracketed, so it never became an
// IntelligenceEntity for the fuzzy vehicle-rego check to compare against.
// Rather than duplicating the exact-match/fuzzy consistency logic a third
// time, this builds SYNTHETIC vehicle entities straight from raw prose
// ("Vehicle " immediately followed by a rego-shaped token) and merges them
// into the same entity list checkConsistency already runs against — so a
// bare mention gets the exact same exact-match AND fuzzy-typo treatment a
// bracketed one does, for free. Anchored on the literal word "Vehicle"
// (the convention every real mention in this app's text actually uses)
// rather than scanning for rego-shaped tokens anywhere, to keep this at
// effectively zero false-positive risk.
const BARE_VEHICLE_RE = /\bVehicle\s+(\d[A-Za-z]{2,3}[-\s]?\d{2,4})\b/gi;

/** Pure — no DB — directly testable. */
export function findBareVehicleMentions(text: string): string[] {
  const withoutBrackets = text.replace(/\([^()]*\)/g, m =>
    "#".repeat(m.length)
  );
  const out: string[] = [];
  const re = new RegExp(BARE_VEHICLE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutBrackets)) !== null) {
    out.push(m[1].toUpperCase());
  }
  return out;
}

/** `knownRegoKeys` — the normalised regos of vehicles already properly
 * bracketed somewhere on the sheet. A real bug found in testing: without
 * deduping, one synthetic entity was created per ROW a bare rego appeared
 * in — so a rego mentioned bare across several rows produced several
 * near-identical entities, and comparing each of those against every
 * occurrence of the real (also often multi-row) rego produced a
 * combinatorial explosion of near-duplicate findings for what was really
 * one typo. Fixed by keeping at most ONE synthetic entity per distinct
 * bare rego value on the sheet, and skipping a bare mention entirely when
 * its rego already exactly matches a known bracketed entity — that's not
 * new information, just a repeat mention of an already-correct vehicle,
 * and including it anyway would still have produced a redundant duplicate
 * finding alongside the one the real bracketed entity already generates. */
function findSheetBareVehicleEntities(
  sheetId: number,
  rows: ObservationTextForSheet[],
  knownRegoKeys: Set<string>
): IntelligenceEntity[] {
  const byRego = new Map<string, IntelligenceEntity>();
  for (const row of rows) {
    for (const raw of findBareVehicleMentions(row.observation)) {
      const key = normalizeRego(raw);
      if (knownRegoKeys.has(key)) continue;
      if (byRego.has(key)) continue;
      byRego.set(key, {
        type: "vehicle",
        shortForm: raw,
        occurrences: [
          {
            sheetId,
            sheetTitle: "",
            operationId: 0,
            operationName: "",
            rowId: row.rowId,
            observationSnippet: row.observation,
            timeMinutes: row.timeMinutes,
            fullDescription: raw,
          },
        ],
      });
    }
  }
  return Array.from(byRego.values());
}

// ── Bare-prose business mentions — no bracket required ─────────────────────

// Same gap as addresses/vehicles, found in testing the same way: a
// business's name was typo'd on a LATER, bare (unbracketed) re-mention —
// "entered Blend Caf and Pizza Bar" instead of "Blend Cafe and Pizza Bar",
// correctly bracketed elsewhere on the sheet. Unlike vehicles/addresses,
// business mentions have no reliable single anchor word ("Vehicle ", "at ")
// to scan for — so instead this extracts any capitalised-word PHRASE (2+
// real words, tolerating "and"/"of"/"the"/"&" as connectors, matching how
// business names are actually written — "Blend Caf and Pizza Bar" is one
// phrase despite the lowercase "and" in the middle) from a row's bare
// text, then only keeps it if it's actually CLOSE to a business already
// known from a real bracket on this sheet — never flagged just for
// existing, only for looking like a near-miss of something already
// established. That keeps this safe against the obvious false-positive
// risk (street names, narrative phrases) the same way every other bare-
// mention check in this file stays safe: a finding only ever fires when
// there's a genuine pair to compare, not from a candidate existing alone.
const BARE_BUSINESS_PHRASE_RE =
  /\b[A-Z][A-Za-z'-]*(?:\s+(?:and|of|the|&)\s+[A-Z][A-Za-z'-]*|\s+[A-Z][A-Za-z'-]*)+\b/g;

/** Pure — no DB — directly testable. `knownBusinessNames` are the
 * shortForms of businesses already bracketed somewhere on the sheet —
 * only a candidate phrase that's a CLOSE (fuzzy) but not exact match to
 * one of these is returned. */
export function findBareBusinessMentions(
  text: string,
  knownBusinessNames: string[]
): string[] {
  if (knownBusinessNames.length === 0) return [];
  const withoutBrackets = text.replace(/\([^()]*\)/g, m =>
    "#".repeat(m.length)
  );
  const candidates = knownBusinessNames.map((label, i) => ({
    id: String(i),
    label,
  }));
  const out: string[] = [];
  const re = new RegExp(BARE_BUSINESS_PHRASE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutBrackets)) !== null) {
    const phrase = m[0].trim();
    // ALL-CAPS is a surname/code by this app's own convention (same
    // reasoning as checkSpellingInText) — never a business name.
    if (phrase === phrase.toUpperCase()) continue;
    const wordCount = phrase
      .split(/\s+/)
      .filter(w => w.replace(/[^A-Za-z]/g, "").length >= 2).length;
    if (wordCount < 2) continue;
    if (knownBusinessNames.some(k => k.toLowerCase() === phrase.toLowerCase()))
      continue;
    const matches = findFuzzyMatches(
      phrase,
      candidates,
      DEFAULT_FUZZY_THRESHOLD
    );
    if (matches.length > 0) out.push(phrase);
  }
  return out;
}

function findSheetBareBusinessEntities(
  sheetId: number,
  rows: ObservationTextForSheet[],
  knownBusinessNames: string[]
): IntelligenceEntity[] {
  if (knownBusinessNames.length === 0) return [];
  const byPhrase = new Map<string, IntelligenceEntity>();
  for (const row of rows) {
    for (const phrase of findBareBusinessMentions(
      row.observation,
      knownBusinessNames
    )) {
      const key = phrase.toUpperCase();
      if (byPhrase.has(key)) continue;
      byPhrase.set(key, {
        type: "business",
        shortForm: phrase,
        occurrences: [
          {
            sheetId,
            sheetTitle: "",
            operationId: 0,
            operationName: "",
            rowId: row.rowId,
            observationSnippet: row.observation,
            timeMinutes: row.timeMinutes,
            fullDescription: phrase,
          },
        ],
      });
    }
  }
  return Array.from(byPhrase.values());
}

// ── Punctuation spacing — a raw structural check, not entity-mining ───────

/** A space directly before a sentence punctuation mark — almost always
 * leftover from editing (a word or phrase deleted without removing the
 * space in front of the full stop/comma that followed it), the exact shape
 * found in testing ("...58 Kintail ." after "Road" was deleted). Pure — no
 * DB — directly testable.
 *
 * Bracket content is blanked out before scanning (bracket text is an
 * entity code, not prose, same reasoning as checkSpellingInText) — but
 * with a non-space filler, NOT spaces. A real bug found in testing: this
 * app's own bracket convention is written as "Description (SHORTFORM)."/
 * "(SHORTFORM),", the closing paren directly abutting the following
 * punctuation with no real space between them — blanking the bracket with
 * spaces left a run of padding spaces immediately in front of that
 * punctuation, which this check then misread as a real space-before-
 * punctuation defect on essentially every bracketed entity mention
 * followed by punctuation, not just the genuine "58 Kintail ." shape it
 * was meant to catch. */
export function findSpaceBeforePunctuation(
  text: string
): Array<{ index: number }> {
  const withoutBrackets = text.replace(/\([^()]*\)/g, m =>
    "#".repeat(m.length)
  );
  const out: Array<{ index: number }> = [];
  const re = /[ \t]+[.,;:!?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutBrackets)) !== null) {
    out.push({ index: m.index });
  }
  return out;
}

function checkPunctuationSpacing(
  rows: ObservationTextForSheet[]
): SheetCheckFinding[] {
  const findings: SheetCheckFinding[] = [];
  for (const row of rows) {
    for (const hit of findSpaceBeforePunctuation(row.observation)) {
      const start = Math.max(0, hit.index - 30);
      const end = Math.min(row.observation.length, hit.index + 31);
      const snippet = `${start > 0 ? "…" : ""}${row.observation.slice(start, end)}${end < row.observation.length ? "…" : ""}`;
      findings.push({
        ruleId: "space-before-punctuation",
        category: "formatting",
        reason: `There's a space before punctuation here — usually leftover from deleting a word without removing the space in front of it.`,
        rowId: row.rowId,
        timeMinutes: row.timeMinutes,
        snippet,
        findingKey: `ROW_${row.rowId}::SPACE_BEFORE_PUNCT::${hit.index}`,
      });
    }
  }
  return findings;
}

// ── Spelling — a curated list of common, unambiguous English misspellings ─

// Deliberately not exhaustive and deliberately not a general dictionary —
// see the module comment above for why. Each entry is a word that is
// (a) never correct in standard English, and (b) not a plausible surname,
// place name or piece of police jargon that could false-positive — picked
// to keep this at zero real-world noise rather than maximum coverage.
export const COMMON_MISSPELLINGS: Record<string, string> = {
  recieved: "received",
  recieve: "receive",
  recieveing: "receiving",
  recieving: "receiving",
  occured: "occurred",
  occurance: "occurrence",
  seperate: "separate",
  seperated: "separated",
  seperately: "separately",
  definately: "definitely",
  untill: "until",
  wierd: "weird",
  beleive: "believe",
  beleived: "believed",
  acommodate: "accommodate",
  accomodate: "accommodate",
  arguement: "argument",
  calender: "calendar",
  concious: "conscious",
  desicion: "decision",
  dissapear: "disappear",
  dissapeared: "disappeared",
  enviroment: "environment",
  existance: "existence",
  goverment: "government",
  gaurd: "guard",
  independant: "independent",
  intial: "initial",
  intially: "initially",
  liason: "liaison",
  maintainance: "maintenance",
  neccessary: "necessary",
  noticable: "noticeable",
  ocassion: "occasion",
  particurlarly: "particularly",
  posession: "possession",
  posessions: "possessions",
  preceeding: "preceding",
  proceded: "proceeded",
  pursuade: "persuade",
  reccommend: "recommend",
  reccomend: "recommend",
  relevent: "relevant",
  succesful: "successful",
  succesfully: "successfully",
  surveilance: "surveillance",
  surveillence: "surveillance",
  suspicous: "suspicious",
  suspiciious: "suspicious",
  tommorow: "tomorrow",
  tommorrow: "tomorrow",
  vehical: "vehicle",
  vehicel: "vehicle",
  vecile: "vehicle",
  witheld: "withheld",
  withdrawl: "withdrawal",
  aquired: "acquired",
  aquire: "acquire",
  publically: "publicly",
  begining: "beginning",
  comitted: "committed",
  commited: "committed",
  enterance: "entrance",
  idenitfied: "identified",
  indentified: "identified",
  identifed: "identified",
  imediately: "immediately",
  immediatly: "immediately",
  premisis: "premises",
  premisses: "premises",
  querey: "query",
  wittness: "witness",
  witnessess: "witnesses",
  aproached: "approached",
  approched: "approached",
  arrivded: "arrived",
  attened: "attended",
  attendence: "attendance",
  behavour: "behaviour",
  compleated: "completed",
  concerened: "concerned",
  descibed: "described",
  desribed: "described",
  enterd: "entered",
  informtion: "information",
  observd: "observed",
  obsevation: "observation",
  obervation: "observation",
  occassion: "occasion",
  occassionally: "occasionally",
  paticular: "particular",
  suround: "surround",
  travled: "travelled",
  wistness: "witness",
  contnued: "continued",
  contnue: "continue",
  contnues: "continues",
  arriv: "arrived",
};

function applyCasing(correct: string, original: string): string {
  if (original === original.toUpperCase()) return correct.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return correct[0].toUpperCase() + correct.slice(1);
  }
  return correct;
}

/** Checks one row's observation text for a known common misspelling —
 * outside any bracket, since bracket content is an entity code (a name,
 * rego, address label), not prose, and covered by the other check
 * categories instead. Pure, no DB — directly testable. */
export function checkSpellingInText(
  text: string
): Array<{ wrong: string; correct: string; index: number }> {
  const withoutBrackets = text.replace(/\([^()]*\)/g, m =>
    " ".repeat(m.length)
  );
  const out: Array<{ wrong: string; correct: string; index: number }> = [];
  const wordRe = /[A-Za-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(withoutBrackets)) !== null) {
    const word = m[0];
    // ALL-CAPS words are surnames/codes by this app's own convention (see
    // detectPersonNameSpaceCompletion, mentionAutocomplete.ts) — never
    // checked, same reasoning as skipping bracket content.
    if (word === word.toUpperCase()) continue;
    const correct = COMMON_MISSPELLINGS[word.toLowerCase()];
    if (!correct) continue;
    out.push({
      wrong: word,
      correct: applyCasing(correct, word),
      index: m.index,
    });
  }
  return out;
}

function checkSpelling(rows: ObservationTextForSheet[]): SheetCheckFinding[] {
  const findings: SheetCheckFinding[] = [];
  for (const row of rows) {
    const hits = checkSpellingInText(row.observation);
    for (const hit of hits) {
      const start = Math.max(0, hit.index - 30);
      const end = Math.min(
        row.observation.length,
        hit.index + hit.wrong.length + 30
      );
      const snippet = `${start > 0 ? "…" : ""}${row.observation.slice(start, end)}${end < row.observation.length ? "…" : ""}`;
      findings.push({
        ruleId: "common-misspelling",
        category: "spelling",
        reason: `"${hit.wrong}" — did you mean "${hit.correct}"?`,
        rowId: row.rowId,
        timeMinutes: row.timeMinutes,
        snippet,
        suggestedFix: { wrong: hit.wrong, correct: hit.correct },
        findingKey: `ROW_${row.rowId}::${hit.wrong.toUpperCase()}::${hit.index}`,
      });
    }
  }
  return findings;
}

// ── Bracket balance — a raw structural check, not an entity-mining one ────

// A bracketed entity code immediately followed by the SAME text again with
// a dangling extra ")" — "(24 Bedford Street) 24 Bedford Street)" — the
// exact real case found in testing. Almost always a duplicate left over
// from editing (retyping over a selection that didn't fully clear, an
// autocomplete firing twice), never a legitimate shape on its own, so —
// unlike every other structural finding here — this one is safe to offer
// a one-click fix for: drop the duplicate + its orphaned ")", keeping just
// the first, correctly-bracketed copy. Content capped at 80 chars mainly
// to keep the match bounded, not because a real bracket code gets that
// long.
const DUPLICATE_BRACKET_RE = /\(([^()]{2,80})\)\s+\1\)/;

/** Pure — no DB — directly testable. Returns the exact span to replace
 * (`wrong`) and what it should become (`correct`), or null if this row
 * doesn't have this specific shape. */
export function findDuplicateBracketFragment(
  text: string
): { wrong: string; correct: string; index: number } | null {
  const m = text.match(DUPLICATE_BRACKET_RE);
  if (!m || m.index === undefined) return null;
  return { wrong: m[0], correct: `(${m[1]})`, index: m.index };
}

/** True when every "(" in the text has a matching ")" and none closes
 * before it opens — checked as running depth, not just equal counts, so
 * ")(" (equal counts, still broken) is caught too. Pure — no DB — directly
 * testable. */
export function isBracketBalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/** Real case found in testing: a malformed observation with a duplicated
 * address fragment and an orphaned extra ")" — "...(24 Bedford Street) 24
 * Bedford Street)." — which extractEntitiesFromText silently read as an
 * address entity with the wrong shortForm rather than failing loudly (see
 * the comma-in-short-form rule above, which now also happens to catch
 * that specific symptom for addresses). Tries the specific, fixable
 * duplicate-fragment shape first (findDuplicateBracketFragment) — precise
 * wording, one-click Fix — and only falls back to the generic "brackets
 * don't match up" finding for anything else unbalanced, so a row already
 * caught precisely isn't also flagged vaguely. */
function checkBracketBalance(
  rows: ObservationTextForSheet[]
): SheetCheckFinding[] {
  const findings: SheetCheckFinding[] = [];
  for (const row of rows) {
    const duplicate = findDuplicateBracketFragment(row.observation);
    if (duplicate) {
      findings.push({
        ruleId: "duplicate-bracket-fragment",
        category: "formatting",
        reason: `"${duplicate.correct}" appears to be duplicated — "${duplicate.wrong}" — likely retyped without fully clearing the first copy.`,
        rowId: row.rowId,
        timeMinutes: row.timeMinutes,
        snippet: row.observation,
        suggestedFix: { wrong: duplicate.wrong, correct: duplicate.correct },
        findingKey: `ROW_${row.rowId}::DUPLICATE::${duplicate.index}`,
      });
      continue;
    }
    if (isBracketBalanced(row.observation)) continue;
    findings.push({
      ruleId: "unbalanced-brackets",
      category: "formatting",
      reason: `This row's brackets don't match up — a "(" is missing its ")" (or the reverse) — usually a duplicated or cut-off entity code from editing.`,
      rowId: row.rowId,
      timeMinutes: row.timeMinutes,
      snippet:
        row.observation.length > 140
          ? `${row.observation.slice(0, 140)}…`
          : row.observation,
      findingKey: `ROW_${row.rowId}::UNBALANCED`,
    });
  }
  return findings;
}

// ── Orchestrator ────────────────────────────────────────────────────────

export async function checkRunningSheet(
  sheetId: number
): Promise<SheetCheckFinding[]> {
  // Rows are fetched ONCE and passed to every check below — they all used
  // to independently re-fetch the same sheet's observation text (a real,
  // avoidable inefficiency found while rebuilding this: up to 7 identical
  // DB round-trips for one Check Sheet click). Only getAllIntelligenceEntities
  // is a genuine separate async DB call now.
  const [allEntities, rows] = await Promise.all([
    getAllIntelligenceEntities(),
    getObservationTextForSheet(sheetId),
  ]);
  const scopedEntities = allEntities
    .map(e => scopeEntityToSheet(e, sheetId))
    .filter((e): e is IntelligenceEntity => e !== null);
  const rawEntities = getRawSheetEntities(sheetId, rows);
  const knownVehicleRegoKeys = new Set(
    rawEntities
      .filter(e => e.type === "vehicle")
      .map(e => normalizeRego(e.shortForm))
  );
  const knownBusinessNames = rawEntities
    .filter(e => e.type === "business")
    .map(e => e.shortForm);

  const spelling = checkSpelling(rows);
  const bracketBalance = checkBracketBalance(rows);
  const bareAddressConsistency = checkBareAddressConsistency(rows);
  const punctuationSpacing = checkPunctuationSpacing(rows);
  const bareVehicleEntities = findSheetBareVehicleEntities(
    sheetId,
    rows,
    knownVehicleRegoKeys
  );
  const bareBusinessEntities = findSheetBareBusinessEntities(
    sheetId,
    rows,
    knownBusinessNames
  );
  const formattingAndRegistry = checkFormattingAndRegistry(scopedEntities);
  const consistency = checkConsistency([
    ...rawEntities,
    ...bareVehicleEntities,
    ...bareBusinessEntities,
  ]);

  return [
    ...formattingAndRegistry,
    ...bracketBalance,
    ...punctuationSpacing,
    ...consistency,
    ...bareAddressConsistency,
    ...spelling,
  ].sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0));
}
