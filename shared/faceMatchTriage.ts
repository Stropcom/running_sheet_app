// Which possible face matches are worth asking the officer about, once they
// have answered some of them. One rule for the early pop-up (before the photo
// is saved), the pop-up after it is saved, and the saving step itself, so they
// never disagree:
//
//   • Once a photo is confirmed as a named person (a target or associate —
//     "Yes, same person" on one of their photos, or picked in the link list),
//     their OTHER photos are not asked about: it is already them.
//   • Once a person has been answered "different", their other photos are not
//     asked about either — it is the same person the officer already said no to.
//   • Once a photo is confirmed as a named person, a face on file under a
//     DIFFERENT name is not asked about unless it is a very close match
//     (HIGH_CONFLICT_SIMILARITY) — below that it is simply a different person.
//     A very close match under another name is still worth a look: two
//     registry records may be the same person.
//
// Unidentified Person entries are never skipped on these grounds (each is its
// own record, and one could be the confirmed person). Deterministic: same
// answers, same questions; no lookups, no AI.

/** A match under another name must score at least this to be asked about once
 * the photo is confirmed as a named person. */
export const HIGH_CONFLICT_SIMILARITY = 0.5;

export type MatchDecision = "same" | "different";

export interface TriageCandidate {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  /** 0–1. */
  similarity: number;
}

export interface TriageChosen {
  category: string;
  targetId?: number | null;
  entityLabel?: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Who a candidate / chosen entry is: a target by id, an associate by name; an
 * Unidentified Person is only itself (one key per link). */
export function identityKey(
  c: {
    category: string;
    targetId?: number | null;
    entityLabel?: string | null;
  },
  entityLinkId?: number
): string {
  if (c.category === "target") {
    return c.targetId != null
      ? `target:${c.targetId}`
      : `target-name:${norm(c.entityLabel)}`;
  }
  if (c.category === "associate") return `associate:${norm(c.entityLabel)}`;
  return `unidentified:${entityLinkId ?? norm(c.entityLabel)}`;
}

const isNamedKey = (key: string) => !key.startsWith("unidentified:");

/** What to do with a candidate without asking, given who is decided so far
 * (identity key → decision); null means ask. */
export function autoDecision(
  c: TriageCandidate,
  decided: Readonly<Record<string, MatchDecision>>
): MatchDecision | null {
  const key = identityKey(c, c.entityLinkId);
  if (decided[key]) return decided[key];
  if (
    isNamedKey(key) &&
    c.similarity < HIGH_CONFLICT_SIMILARITY &&
    Object.entries(decided).some(
      ([k, v]) => v === "same" && k !== key && isNamedKey(k)
    )
  )
    return "different";
  return null;
}

export interface TriageResult<T> {
  /** Still worth asking the officer. */
  ask: T[];
  /** Already them: the officer's own "same", or another photo of the person
   * they confirmed. Nothing more to ask or record. */
  same: T[];
  /** Not them: answered "different", another photo of someone answered
   * "different", or a different named person below the high-score bar —
   * recorded as "not a match" so it is not offered again. */
  dismiss: T[];
}

/**
 * Sorts candidates into ask / same / dismiss.
 * `answers` are the officer's explicit answers by matched link id; `chosen` is
 * who the photo is being linked to (when picked).
 */
export function triageMatches<T extends TriageCandidate>(
  candidates: readonly T[],
  answers: Readonly<Record<number, MatchDecision>>,
  chosen: TriageChosen | null
): TriageResult<T> {
  const decided: Record<string, MatchDecision> = {};
  const chosenKey =
    chosen && chosen.category !== "unidentified_person"
      ? identityKey(chosen)
      : null;
  if (chosenKey) decided[chosenKey] = "same";
  for (const c of candidates) {
    const a = answers[c.entityLinkId];
    if (!a) continue;
    const key = identityKey(c, c.entityLinkId);
    if (a === "different") {
      if (decided[key] !== "same") decided[key] = "different";
    } else if (
      key === chosenKey ||
      (chosen?.category === "unidentified_person" &&
        c.category === "unidentified_person")
    ) {
      decided[key] = "same";
    }
  }
  const out: TriageResult<T> = { ask: [], same: [], dismiss: [] };
  for (const c of candidates) {
    const a = answers[c.entityLinkId];
    const key = identityKey(c, c.entityLinkId);
    // The officer's own answer is never overridden: "different" stands, and a
    // "same" that doesn't fit who the photo was linked to is asked again.
    const auto: MatchDecision | null =
      a === "different"
        ? "different"
        : a === "same"
          ? decided[key] === "same"
            ? "same"
            : null
          : autoDecision(c, decided);
    if (auto === "same") out.same.push(c);
    else if (auto === "different") out.dismiss.push(c);
    else out.ask.push(c);
  }
  return out;
}
