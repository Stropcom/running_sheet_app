// Deterministic, dependency-free string-similarity check — the "Step 1"
// piece of the Local AI Roadmap (typo tolerance against the existing
// Target/Associate Registry). This is plain, reproducible code, not a
// model: the same two strings always score the same, satisfying CLAUDE.md's
// Golden Rule (no runtime AI/LLM calls) the same way the rest of the
// Intelligence extraction pipeline already does.

/** Classic edit-distance: the minimum number of single-character inserts,
 * deletes or substitutions needed to turn `a` into `b`. */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const insertCost = currentRow[j] + 1;
      const deleteCost = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);
      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

/** 1 = identical (after trimming/case-folding), 0 = completely different.
 * Normalised by the longer string's length so short and long strings are
 * scored on a comparable scale. */
export function stringSimilarity(a: string, b: string): number {
  const normalizedA = a.trim().toUpperCase();
  const normalizedB = b.trim().toUpperCase();
  if (normalizedA === normalizedB) return 1;
  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normalizedA, normalizedB) / maxLen;
}

export interface FuzzyMatchCandidate {
  id: string;
  label: string;
}

export interface FuzzyMatchResult {
  id: string;
  label: string;
  similarity: number;
}

// 0.8 was picked by hand against realistic typo shapes rather than tuned
// against a dataset — "Corola"/"Corolla" (1-char drop, 7 chars) scores
// 0.857; "Jhon Smith"/"John Smith" (1 transposition, 10 chars) scores 0.8
// exactly. Below this, short names start producing coincidental matches
// between genuinely different people rather than typos of the same one.
export const DEFAULT_FUZZY_THRESHOLD = 0.8;

/** Finds candidates close to (but not identical to) `query`, sorted best
 * match first. Excludes exact matches deliberately — an exact match means
 * the two are already the same entity, not a possible typo of one
 * another, so it's the caller's existing exact-match logic that should
 * handle that case, not this one. */
export function findFuzzyMatches(
  query: string,
  candidates: FuzzyMatchCandidate[],
  threshold: number = DEFAULT_FUZZY_THRESHOLD
): FuzzyMatchResult[] {
  const normalizedQuery = query.trim().toUpperCase();
  if (!normalizedQuery) return [];
  const results: FuzzyMatchResult[] = [];
  for (const candidate of candidates) {
    const normalizedLabel = candidate.label.trim().toUpperCase();
    if (!normalizedLabel || normalizedLabel === normalizedQuery) continue;
    const similarity = stringSimilarity(normalizedQuery, normalizedLabel);
    if (similarity >= threshold) {
      results.push({ id: candidate.id, label: candidate.label, similarity });
    }
  }
  return results.sort((a, b) => b.similarity - a.similarity);
}
