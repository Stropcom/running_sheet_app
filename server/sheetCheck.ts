// "Check Running Sheet" — an on-demand report an author can run against
// their own sheet, at any point, not just an admin-only whole-folder scan.
// Deliberately rule-based/deterministic throughout (see CLAUDE.md's Golden
// Rule) — nothing here is a model. Four categories, combined into one list:
//   - formatting: scopes the existing scanIntelligenceEntities rules
//     (intelligenceScan.ts) down to just this sheet's own entities, rather
//     than the whole Intelligence folder — plus a bracket-balance check
//     (isBracketBalanced), new, catching a malformed "(" / ")" pair
//     directly rather than only via a symptom downstream.
//   - registry: also scanIntelligenceEntities, specifically the possible-
//     typo-of-registry-name rule.
//   - consistency: new — the same real address/vehicle written two
//     different ways across this sheet's own rows (e.g. "1 Smith Street"
//     in one row, "1 SMITH ST" in another; "1CDR890" vs a typo'd
//     "1CDR89") — an exact-normalised-match pass for both types, plus a
//     fuzzy pass for vehicles specifically (checkFuzzyVehicleConsistency).
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
  getAllIntelligenceEntities,
  getObservationTextForSheet,
  scanFindingKey,
  type IntelligenceEntity,
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
      // Unchanged from the whole-folder scan's own key otherwise, so
      // dismissing here also dismisses it there, and vice versa.
      findingKey: scanFindingKey(f.shortForm),
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
  const m = label.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/);
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

/** Normalises a vehicle rego bracket label down to a bare uppercase
 * alphanumeric string, so "1CDR891" and "1 CDR-891" compare equal. */
function normalizeRego(label: string): string {
  return label.replace(/[\s-]/g, "").toUpperCase();
}

function checkConsistencyForType(
  entities: IntelligenceEntity[],
  type: "address" | "vehicle",
  ruleId: string,
  normalize: (label: string) => string | null
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
    const occA = entityA.occurrences[0];
    const occB = entityB.occurrences[0];
    if (!occA || !occB) continue;
    findings.push({
      ruleId,
      category: "consistency",
      reason: `"${entityA.shortForm}" and "${entityB.shortForm}" look like the same ${type} written two different ways on this sheet — pick one so both rows read as the same ${type === "address" ? "location" : "vehicle"}.`,
      rowId: occA.rowId,
      otherRowId: occB.rowId,
      timeMinutes: occA.timeMinutes,
      snippet: `${occA.observationSnippet}`,
      findingKey: `ROW_${occA.rowId}_${occB.rowId}::${entityA.shortForm.trim().toUpperCase()}`,
    });
  }
  return findings;
}

/** A close-but-not-exact rego match on the same sheet — e.g. a real case
 * found in testing: "1CDR890" mentioned correctly earlier, then typed as
 * "1CDR89" (one digit short) later in the same sheet. Deliberately
 * VEHICLES ONLY, not addresses too: two different vehicles legitimately
 * often have very similar-looking regos by pure coincidence (adjacent
 * fleet plates, near-identical personalised plates), same risk profile
 * fuzzy street-name matching would have for two genuinely different but
 * similarly-named streets — scoped down to the one case (regos) actually
 * found to need it, same conservative approach as everywhere else in this
 * file. Reuses findFuzzyMatches — the exact same Step 1 (Local AI Roadmap)
 * matching this app already uses for a possible typo of a registered
 * person's name, applied to a different entity type. Compares NORMALISED
 * regos (see normalizeRego) rather than raw shortForm text, so this never
 * re-reports a pair the exact-match check above already caught (same
 * normalised rego means findFuzzyMatches' own exact-match exclusion skips
 * it) — the two checks are complementary, not overlapping. */
function checkFuzzyVehicleConsistency(
  entities: IntelligenceEntity[]
): SheetCheckFinding[] {
  const vehicles = entities.filter(e => e.type === "vehicle");
  const candidates = vehicles.map((e, i) => ({
    id: String(i),
    label: normalizeRego(e.shortForm),
  }));

  const findings: SheetCheckFinding[] = [];
  const reportedPairs = new Set<string>();
  for (let i = 0; i < vehicles.length; i++) {
    const occA = vehicles[i].occurrences[0];
    if (!occA) continue;
    const query = normalizeRego(vehicles[i].shortForm);
    const others = candidates.filter((_, j) => j !== i);
    const matches = findFuzzyMatches(query, others, DEFAULT_FUZZY_THRESHOLD);
    for (const match of matches) {
      const j = Number(match.id);
      const pairKey = [i, j].sort().join("-");
      if (reportedPairs.has(pairKey)) continue;
      reportedPairs.add(pairKey);
      const occB = vehicles[j].occurrences[0];
      if (!occB) continue;
      findings.push({
        ruleId: "possible-typo-of-vehicle-rego",
        category: "consistency",
        reason: `"${vehicles[i].shortForm}" is close to "${vehicles[j].shortForm}" (${Math.round(match.similarity * 100)}% match) — check whether this is a typo of the same vehicle rather than a different one.`,
        rowId: occA.rowId,
        otherRowId: occB.rowId,
        timeMinutes: occA.timeMinutes,
        snippet: occA.observationSnippet,
        findingKey: `ROW_${occA.rowId}_${occB.rowId}::${query}`,
      });
    }
  }
  return findings;
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
      normalizeStreetLabel
    ),
    ...checkConsistencyForType(
      entities,
      "vehicle",
      "inconsistent-vehicle-format",
      normalizeRego
    ),
    ...checkFuzzyVehicleConsistency(entities),
  ];
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

async function checkSpelling(sheetId: number): Promise<SheetCheckFinding[]> {
  const rows = await getObservationTextForSheet(sheetId);
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
 * that specific symptom for addresses). This check catches the underlying
 * cause directly, on any row, not just ones whose corruption happens to
 * also produce a comma. */
async function checkBracketBalance(
  sheetId: number
): Promise<SheetCheckFinding[]> {
  const rows = await getObservationTextForSheet(sheetId);
  const findings: SheetCheckFinding[] = [];
  for (const row of rows) {
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
  const allEntities = await getAllIntelligenceEntities();
  const scopedEntities = allEntities
    .map(e => scopeEntityToSheet(e, sheetId))
    .filter((e): e is IntelligenceEntity => e !== null);

  const [spelling, bracketBalance] = await Promise.all([
    checkSpelling(sheetId),
    checkBracketBalance(sheetId),
  ]);
  const formattingAndRegistry = checkFormattingAndRegistry(scopedEntities);
  const consistency = checkConsistency(scopedEntities);

  return [
    ...formattingAndRegistry,
    ...bracketBalance,
    ...consistency,
    ...spelling,
  ].sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0));
}
