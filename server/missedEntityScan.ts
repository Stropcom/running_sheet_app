// Step 2 of the Local AI Roadmap: catch a person mentioned in an
// observation that extractEntitiesFromText's rule-based patterns missed
// entirely (as opposed to intelligenceScan.ts's typo-matching rule, which
// catches a name the rules DID find but which is probably a typo of
// someone already on a registry card). Same "flag for a human to check,
// never change anything automatically" contract as the rest of the
// Intelligence Entity Scan — see intelligenceScan.ts's header comment for
// why that matters on an evidentiary system.
//
// ⚠️ Depends on server/localNER.ts, which has not been run against real
// model weights in this environment (see that file's header and
// scripts/dev/ner-model-setup.md) — treat this as unverified until it has.
import type { ScanFinding } from "./intelligenceScan";
import type { ObservationTextForScan } from "./db";
import { findPersonMentions } from "./localNER";
import { findFuzzyMatches, sharesSignificantWord } from "./fuzzyMatch";

export interface KnownEntityName {
  id: string;
  label: string;
}

/**
 * Compares NER's person-name findings against every name already known to
 * the Intelligence folder (both registry cards and already-mined
 * entities — pass every person-type IntelligenceEntity's shortForm here,
 * not just registry ones, since the point is "did the rules already catch
 * this name in some form", not just "is this a registered target").
 * Checks three ways, cheapest/most certain first: an exact match (case/
 * whitespace-insensitive) is obviously already known and short-circuits
 * everything else; findFuzzyMatches then catches a *close but not
 * identical* match (e.g. the rules already found "J. Smith" and NER found
 * "John Smith" — a typo-shaped overlap, not a miss, so not flagged here;
 * that case is what intelligenceScan.ts's typo rule is for); finally
 * sharesSignificantWord catches a shared name-part a whole-string
 * comparison can miss (different first name, same surname).
 *
 * The exact-match check exists because real running-sheet data found a
 * bug: NER extracted "Stevie RAYSON" *verbatim* — matching an existing
 * associate card of that exact name, word for word — and it still got
 * flagged as new. findFuzzyMatches deliberately excludes exact matches
 * (its own job is finding *typos* of a known name, where an exact match
 * would mean "this isn't a typo, it's the same entity" and so isn't its
 * concern) — but nothing else was checking the exact-match case at all,
 * so on its own findFuzzyMatches silently let a perfect match through as
 * if it were new. This is the real, direct fix; sharesSignificantWord
 * (added at the same time, before this exact case was understood) still
 * earns its place for the genuinely-different-first-name case.
 */
export async function scanForMissedPersonMentions(
  observations: ObservationTextForScan[],
  knownNames: KnownEntityName[]
): Promise<ScanFinding[]> {
  const findingsByName = new Map<string, ScanFinding>();

  for (const obs of observations) {
    let mentions;
    try {
      mentions = await findPersonMentions(obs.observation);
    } catch {
      // Model unavailable/failed on this row — skip it rather than fail
      // the whole scan; getNerModelStatus() is the caller's job to check
      // up front so this shouldn't normally happen.
      continue;
    }

    for (const mention of mentions) {
      const normalizedMention = mention.text.trim().toUpperCase();
      const isExactMatch = knownNames.some(
        n => n.label.trim().toUpperCase() === normalizedMention
      );
      const alreadyKnown =
        isExactMatch ||
        findFuzzyMatches(mention.text, knownNames, 0.75).length > 0 ||
        sharesSignificantWord(mention.text, knownNames);
      if (alreadyKnown) continue;

      const key = mention.text.trim().toUpperCase();
      const existing = findingsByName.get(key);
      const occurrence = {
        sheetId: obs.sheetId,
        sheetTitle: obs.sheetTitle,
        rowId: obs.rowId,
        operationName: obs.operationName,
        observationSnippet: obs.observation.slice(0, 160),
      };

      if (existing) {
        existing.occurrences.push(occurrence);
      } else {
        findingsByName.set(key, {
          ruleId: "possible-missed-person-mention",
          reason: `"${mention.text}" reads like a person's name (${Math.round(mention.score * 100)}% model confidence) but doesn't match anything already in the Intelligence folder — check whether this should be added as a target/associate or linked to an existing one under a different spelling.`,
          type: "person",
          shortForm: mention.text,
          occurrences: [occurrence],
        });
      }
    }
  }

  return Array.from(findingsByName.values());
}
