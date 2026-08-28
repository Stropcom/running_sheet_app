// Scans a block of unlabelled free-text prose (a document's "Summary" /
// narrative paragraph, as opposed to its labelled table fields) for
// candidate person, business, email, and phone mentions. This is
// deliberately NOT a reuse of server/db.ts's extractEntitiesFromText: that
// function's whole match is built around a trailing "(ShortForm)" bracket
// (its core pattern is `([^()]{3,120}?)\s*\(([^()]{1,80})\)`), which is how
// entities are written *within a running sheet observation* — a target
// profile document's free text has no such convention (e.g. "Ryan FORBES"
// appears bare, with no bracket), so it needs its own line/word-shaped
// matchers instead. Every candidate here is exactly that — a candidate —
// meant for a human to confirm or discard on the review screen, not to be
// persisted directly; false positives are an acceptable, expected cost of
// catching the "sometimes it's not consistent" cases regex alone can't
// perfectly disambiguate (see the "irregular" phone-number case below).

export type CandidateEntityType = "person" | "business" | "email" | "phone";

export interface CandidateEntity {
  type: CandidateEntityType;
  value: string;
  confidence: "high" | "low";
  raw: string;
}

const AU_STATES = new Set([
  "WA",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "TAS",
  "NT",
  "ACT",
]);

// Common all-caps tokens that show up right after a title-case word in this
// kind of document without being a surname — state codes (handled above via
// AU_STATES) plus a handful of recurring acronyms/labels seen in target
// profile documents. Extend as new false positives turn up in real
// documents; this list only needs to be "good enough" since every match is
// reviewed by a person before it's kept.
const PERSON_SURNAME_STOPLIST = new Set([
  "LTD",
  "PTY",
  "INC",
  "LLC",
  "CORP",
  "ABF",
  "EES",
  "ID",
  "IDs",
  "DOB",
  "COB",
  "OCG",
  "WIPC",
  "GPS",
  "CCTV",
  "PROMIS",
]);

/** "Firstname [Middlename] SURNAME" — one to three title-case words
 * immediately followed by an all-caps word (optionally hyphenated, e.g.
 * "SMITH-JONES"). */
const PERSON_RE =
  /\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})\s+([A-Z]{2,}(?:-[A-Z]{2,})?)\b/g;

const BUSINESS_SUFFIX_RE =
  /\b(Pty\.?\s*Ltd\.?|Ltd\.?|Inc\.?|LLC|Corp\.?|Corporation)\b/i;

const LABELLED_EMAIL_RE = /^\s*Email\s*:\s*(.+?)\s*$/gim;
const BARE_EMAIL_RE = /\b[\w.+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}\b/g;

const LABELLED_PHONE_RE = /^\s*(?:Mobile|Phone|Tel|Contact)\s*:\s*(.+?)\s*$/gim;
// Deliberately not anchored to a label: catches the same shape even when a
// second mention of a number is folded into a sentence with a stray
// non-digit character stuck to the front (e.g. "recorded his number as
// x451307354") — exactly the inconsistent-formatting case this scanner
// exists for. Lower confidence than a labelled match, never suppressed by
// one, since a second, differently-formatted number for the same person is
// a real, distinct fact to surface, not noise to dedupe away.
const LOOSE_MOBILE_RE = /(?<!\d)0?4\d{8}(?!\d)/g;

/** Bare "Firstname SURNAME" mentions — always low confidence; there is no
 * label to lean on, only shape. */
export function findCandidatePersons(text: string): CandidateEntity[] {
  const out: CandidateEntity[] = [];
  PERSON_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERSON_RE.exec(text)) !== null) {
    const surname = m[2];
    if (AU_STATES.has(surname) || PERSON_SURNAME_STOPLIST.has(surname))
      continue;
    out.push({
      type: "person",
      value: `${m[1]} ${surname}`,
      confidence: "low",
      raw: m[0],
    });
  }
  return out;
}

/** A whole line carrying a business-entity suffix (Pty Ltd, Inc, LLC, ...)
 * is treated as the business name in full — matches how these documents
 * actually write a business (its own line, no other content). */
export function findCandidateBusinesses(text: string): CandidateEntity[] {
  const out: CandidateEntity[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || !BUSINESS_SUFFIX_RE.test(line)) continue;
    out.push({ type: "business", value: line, confidence: "high", raw: line });
  }
  return out;
}

export function findCandidateEmails(text: string): CandidateEntity[] {
  const out: CandidateEntity[] = [];
  const seen = new Set<string>();

  LABELLED_EMAIL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LABELLED_EMAIL_RE.exec(text)) !== null) {
    const value = m[1].trim();
    if (!value) continue;
    seen.add(value.toLowerCase());
    out.push({ type: "email", value, confidence: "high", raw: m[0].trim() });
  }

  // A bare (unlabelled) email only ever matches the real @-shape — an
  // obfuscated form like "nameATdomain.com" has no shape to catch without a
  // label, which the block above already handles.
  BARE_EMAIL_RE.lastIndex = 0;
  while ((m = BARE_EMAIL_RE.exec(text)) !== null) {
    if (seen.has(m[0].toLowerCase())) continue;
    seen.add(m[0].toLowerCase());
    out.push({ type: "email", value: m[0], confidence: "low", raw: m[0] });
  }

  return out;
}

export function findCandidatePhones(text: string): CandidateEntity[] {
  const out: CandidateEntity[] = [];
  const seen = new Set<string>();

  LABELLED_PHONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LABELLED_PHONE_RE.exec(text)) !== null) {
    const value = m[1].trim();
    if (!value) continue;
    seen.add(value.replace(/\D/g, ""));
    out.push({ type: "phone", value, confidence: "high", raw: m[0].trim() });
  }

  LOOSE_MOBILE_RE.lastIndex = 0;
  while ((m = LOOSE_MOBILE_RE.exec(text)) !== null) {
    const digits = m[0].replace(/\D/g, "");
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push({ type: "phone", value: m[0], confidence: "low", raw: m[0] });
  }

  return out;
}

/** Runs every detector over one block of text and returns all candidates,
 * in detector order (person, business, email, phone) — the orchestrator
 * (targetProfileFieldMap.ts) is responsible for merging this with the
 * table-derived fields and address/vehicle line parses, and for de-duping
 * anything that shape-matches a value already captured elsewhere. */
export function scanFreeText(text: string): CandidateEntity[] {
  return [
    ...findCandidatePersons(text),
    ...findCandidateBusinesses(text),
    ...findCandidateEmails(text),
    ...findCandidatePhones(text),
  ];
}
