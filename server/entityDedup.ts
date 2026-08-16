// Deterministic (non-AI) fuzzy-duplicate detection for Intelligence entities.
// Every heuristic here is plain string comparison — Levenshtein distance,
// token overlap, and format-aware normalization — never a model call. This
// keeps the feature compliant with the app's no-runtime-AI rule while still
// catching the near-miss cases exact-key matching (see getAllIntelligenceEntities
// in db.ts) already handles: a vehicle registration transcribed one character
// off, a name with/without a trailing "born ..." clause, an address with/
// without a unit number.

export type DedupType = "person" | "vehicle" | "address" | "business";

export interface DedupCandidateEntity {
  key: string; // normalized "type::shortForm" key, matches IntelProfileEntity.id conventions
  label: string;
  type: DedupType;
  rowCount: number;
}

export interface DuplicateMatch extends DedupCandidateEntity {
  score: number; // 0..1, higher = more likely the same entity
  reason: string; // short human-readable explanation shown in the confirm dialog
}

// ─── Generic string similarity ─────────────────────────────────────────────

/** Standard Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

/** 1.0 = identical, 0.0 = completely different. */
function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Person names ───────────────────────────────────────────────────────────

const NAME_NOISE_WORDS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "the",
  "a",
  "an",
]);

/** Strip a trailing descriptive clause ("JOHN SMITH, born 1 Jan 1980" -> "JOHN SMITH"). */
function nameCore(name: string): string {
  const commaIdx = name.indexOf(",");
  return (commaIdx > 0 ? name.slice(0, commaIdx) : name).trim();
}

function nameTokens(name: string): string[] {
  return nameCore(name)
    .toUpperCase()
    .replace(/[^A-Z\s'-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0 && !NAME_NOISE_WORDS.has(w.toLowerCase()));
}

export function comparePersonNames(
  a: string,
  b: string
): { score: number; reason: string } | null {
  const tokensA = nameTokens(a);
  const tokensB = nameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return null;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const [smaller, larger] =
    tokensA.length <= tokensB.length ? [setA, setB] : [setB, setA];
  const overlap = Array.from(smaller).filter(t => larger.has(t)).length;

  // One name's tokens are fully contained in the other's (e.g. "JASON SMITH"
  // vs "JASON SMITH" + a trailing detail clause already stripped above, or
  // "J SMITH" missing a middle name present in the other).
  if (
    overlap === smaller.size &&
    smaller.size >= 1 &&
    (smaller.size >= 2 || larger.size <= 2)
  ) {
    return {
      score: 0.9,
      reason:
        "Same name, one has extra detail (e.g. a trailing clause or extra name part)",
    };
  }

  const coreA = tokensA.join(" ");
  const coreB = tokensB.join(" ");
  const ratio = similarityRatio(coreA, coreB);
  if (ratio >= 0.82) {
    return { score: ratio, reason: "Very similar spelling" };
  }

  // Same surname (last token) + first-name initial match — catches
  // "J SMITH" vs "JASON SMITH" style shorthand.
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const surnameA = tokensA[tokensA.length - 1];
    const surnameB = tokensB[tokensB.length - 1];
    if (surnameA === surnameB) {
      const firstA = tokensA[0];
      const firstB = tokensB[0];
      if (
        firstA[0] === firstB[0] &&
        (firstA.length === 1 || firstB.length === 1)
      ) {
        return {
          score: 0.8,
          reason: "Same surname, first name may be abbreviated",
        };
      }
    }
  }

  return null;
}

// ─── Vehicles ────────────────────────────────────────────────────────────────

const REGO_PATTERN = /\b\d[A-Za-z]{2,3}\d{3}\b/;

function extractRego(shortForm: string): string | null {
  const m = shortForm.match(REGO_PATTERN);
  return m ? m[0].toUpperCase() : null;
}

function compareVehicles(
  a: string,
  b: string
): { score: number; reason: string } | null {
  const regoA = extractRego(a);
  const regoB = extractRego(b);
  if (regoA && regoB) {
    if (regoA === regoB) return null; // exact rego match — already auto-merged, not a "possible" duplicate
    const distance = levenshtein(regoA, regoB);
    if (distance === 1) {
      return {
        score: 0.85,
        reason: `Registration differs by one character (${regoA} vs ${regoB})`,
      };
    }
    if (distance === 2 && regoA.length === regoB.length) {
      return {
        score: 0.7,
        reason: `Registration differs by two characters (${regoA} vs ${regoB})`,
      };
    }
    return null;
  }
  // No rego on one/both sides (e.g. a bare description) — fall back to overall similarity.
  const ratio = similarityRatio(a.toUpperCase(), b.toUpperCase());
  if (ratio >= 0.85)
    return { score: ratio, reason: "Very similar vehicle description" };
  return null;
}

// ─── Addresses ───────────────────────────────────────────────────────────────

const UNIT_PREFIX =
  /^(?:unit|lot|apt|apartment|suite|ste)\s*\d+[a-z]?[,\s]*|^\d{1,4}[a-z]?\/(?=\d)/i;

function addressCore(address: string): string {
  return address
    .replace(UNIT_PREFIX, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compareAddresses(
  a: string,
  b: string
): { score: number; reason: string } | null {
  const coreA = addressCore(a);
  const coreB = addressCore(b);
  if (!coreA || !coreB) return null;
  if (coreA === coreB && a.trim().toLowerCase() !== b.trim().toLowerCase()) {
    return {
      score: 0.88,
      reason: "Same address, differs only by a unit/lot number",
    };
  }
  const ratio = similarityRatio(coreA, coreB);
  if (ratio >= 0.9) return { score: ratio, reason: "Very similar address" };
  return null;
}

// ─── Businesses ──────────────────────────────────────────────────────────────

const BUSINESS_SUFFIX =
  /\s*[,&]?\s*\b(pty\.?\s*ltd\.?|ltd\.?|llc|inc\.?|corp\.?|co\.?)\s*$/i;

function businessCore(name: string): string {
  let s = name.trim();
  // Strip repeatedly in case of "Pty Ltd" style compound suffixes.
  let prev;
  do {
    prev = s;
    s = s.replace(BUSINESS_SUFFIX, "").trim();
  } while (s !== prev);
  return s.toLowerCase();
}

function compareBusinesses(
  a: string,
  b: string
): { score: number; reason: string } | null {
  const coreA = businessCore(a);
  const coreB = businessCore(b);
  if (coreA === coreB && a.trim().toLowerCase() !== b.trim().toLowerCase()) {
    return {
      score: 0.9,
      reason:
        "Same business name, differs only by a legal suffix (e.g. Pty Ltd)",
    };
  }
  const ratio = similarityRatio(coreA, coreB);
  if (ratio >= 0.85) return { score: ratio, reason: "Very similar name" };
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

function compareByType(
  type: DedupType,
  a: string,
  b: string
): { score: number; reason: string } | null {
  switch (type) {
    case "person":
      return comparePersonNames(a, b);
    case "vehicle":
      return compareVehicles(a, b);
    case "address":
      return compareAddresses(a, b);
    case "business":
      return compareBusinesses(a, b);
  }
}

/**
 * Compares `candidateLabel` (a newly-entered entity, not yet saved as an
 * alias/merge decision) against every existing entity of the same type and
 * returns near-miss matches, best first. Exact matches are excluded — those
 * already collapse into one entity via getAllIntelligenceEntities' key
 * normalization, so there is nothing to prompt about. Pairs already excluded
 * by the caller (via `entity_dedup_decisions` "not a duplicate" records)
 * should be filtered out of `existingEntities` before calling this.
 */
export function findPossibleDuplicates(
  candidateLabel: string,
  candidateType: DedupType,
  candidateKey: string,
  existingEntities: DedupCandidateEntity[]
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const existing of existingEntities) {
    if (existing.type !== candidateType) continue;
    if (existing.key === candidateKey) continue; // exact same normalized key — not "possible", it's certain
    const result = compareByType(candidateType, candidateLabel, existing.label);
    if (result) {
      matches.push({ ...existing, score: result.score, reason: result.reason });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}
