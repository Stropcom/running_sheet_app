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
  "ABN",
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

// A vehicle make immediately followed by a short ALL-CAPS trim/model code
// reads exactly like "Firstname SURNAME" ("Lexus NX", "Mazda CX") — two
// real false positives found against actual training documents. A document's
// own reference furniture ("Operation BLUEGUM", "Reference BLU-7719") reads
// the same way for the same reason: a Title-Case word immediately followed
// by an ALL-CAPS code. Checked against just the first word of the firstNames
// group, so a genuine person whose real first name happens to also be a
// make (or "Operation"/"Reference") elsewhere isn't affected by this list
// existing.
const PERSON_FIRSTNAME_STOPLIST = new Set([
  "Toyota",
  "Mazda",
  "Honda",
  "Nissan",
  "Ford",
  "Holden",
  "Hyundai",
  "Kia",
  "Subaru",
  "Mitsubishi",
  "Suzuki",
  "Lexus",
  "Isuzu",
  "Volvo",
  "Renault",
  "Peugeot",
  "Skoda",
  "Chrysler",
  "Dodge",
  "Yamaha",
  "Mercedes",
  "Audi",
  "Volkswagen",
  "Kawasaki",
  "Operation",
  "Reference",
  "Case",
  "File",
  "Report",
  "Exhibit",
]);

/** "Firstname [Middlename] SURNAME" — one to three genuinely title-case
 * words (capital first letter, lowercase rest — NOT "[A-Z][a-zA-Z]+", which
 * an all-caps word like "WHITE" also satisfies since it starts with a
 * capital) immediately followed by an all-caps word (optionally hyphenated,
 * e.g. "SMITH-JONES"). Without the lowercase requirement on the leading
 * group, an all-caps suburb with no trailing state code (e.g. "103 Watkins
 * Street, WHITE GUM VALLEY") reads as "Firstname(s) WHITE GUM SURNAME
 * VALLEY" — a real false positive found against an actual training
 * document. */
const PERSON_RE =
  /\b([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2})\s+([A-Z]{2,}(?:-[A-Z]{2,})?)\b/g;

/** Same shape as PERSON_RE but anchored to the WHOLE line — used to detect
 * a name sitting on its own line as the anchor for an "associate block"
 * (name, then its address and/or vehicle on the following lines) rather
 * than scanning it out of running prose. */
const WHOLE_LINE_PERSON_RE =
  /^([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2})\s+([A-Z]{2,}(?:-[A-Z]{2,})?)$/;

const BUSINESS_SUFFIX_RE =
  /\b(Pty\.?\s*Ltd\.?|Ltd\.?|Inc\.?|LLC|Corp\.?|Corporation)\b/i;

/** Same suffix list as BUSINESS_SUFFIX_RE, but captures the business's own
 * name up to and including that suffix — nothing past it. A business is
 * routinely followed on the same line by its address and other unrelated
 * detail ("Pacific Route Services Pty Ltd - Unit 8/41 Walters Drive,
 * OSBORNE PARK WA 6017. ABN training reference: 63 555 281 904."); without
 * this bound, the old whole-line capture folded the address and the ABN
 * clause straight into the "business name" value.
 *
 * Deliberately NOT case-insensitive (no "i" flag) — that flag used to apply
 * to the WHOLE pattern, not just the suffix alternation it was added for,
 * which silently weakened the leading "[A-Z]" to match any letter at all.
 * A real training document (SWITCHBACK) has this exact sentence hard-
 * wrapped mid-word across two PDF lines ("...used in connected\ndocuments.
 * Switchback Systems Pty Ltd..."), and with the match allowed to start on
 * a lowercase letter, it began at "documents." instead of skipping ahead
 * to the real, properly-capitalised start of the business name.
 *
 * Also capped at 25 chars (not 80) before the suffix — long enough for any
 * real multi-word business name ("Pacific Route Services Pty Ltd" (23
 * chars before the suffix), "Crosswind Consulting Pty Ltd" (21),
 * "Mirage Freight Network Pty Ltd" (23), ...) but too tight for a
 * sentence merely MENTIONING a business name partway through, or a list
 * of several name variants strung together with commas ("An invoice
 * issued by Crosswind Consulting Pty Ltd" (42), "Crosswind Alliance,
 * Crosswind Consulting Pty Ltd" (31), "Switchback Systems, Switchback
 * Systems Pty Ltd" (28)) — three more real training documents (MIRAGE,
 * CROSSWIND, SWITCHBACK) each have an "Organisation complexity"-style
 * sentence listing several name variants in a row, and the old 80-char
 * cap let the lazy match run all the way from the sentence's own leading
 * words (or an earlier variant in the list) to the LAST "Pty Ltd" it
 * could reach, rather than stopping at the one genuine business-name
 * mention closest to it. 25 is the tightest round number that still
 * clears every real business name's own char count (max 23 seen so far)
 * while sitting below every "mentions one/lists several" case found (min
 * 28). Tightening the cap forces the failed long attempt to give up and
 * retry from the next candidate start position, which lands on the real
 * name every time in every case found so far. */
const BUSINESS_NAME_RE = new RegExp(
  `\\b([A-Z][A-Za-z0-9&.,'\\s]{1,25}?\\s*${BUSINESS_SUFFIX_RE.source})`
);

// Domain requires one-or-more "label." groups before the final TLD segment
// — a single "[A-Za-z0-9-]+\.[A-Za-z]{2,}" only matches the first
// label+TLD of a multi-part domain (e.g. stops at "riverfreight.com" inside
// "riverfreight.com.au"), which for an email already caught by
// LABELLED_EMAIL_RE produces a spurious second, truncated "low confidence"
// entry for the exact same address instead of being recognised as a
// duplicate.
const EMAIL_SHAPE = "[\\w.+-]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}";
// Bounded to one whitespace-delimited token (\S+), not ".+?...$" — the
// value has to stay unbounded-by-shape so a genuinely obfuscated email
// ("reximportsausATgmail.com", no "@" at all — see this module's own
// "captures the obfuscated email verbatim via its label" test) is still
// captured purely on the strength of its "Email:" label, but a PDF import
// can land "Email: " and the very next fact on the SAME reading-order
// line with no real line break at all (no "\n" for the old ".+?...$"
// pattern's "$" to anchor against), which ran the value all the way to
// the end of an entire paragraph instead of stopping at the email — a
// real training document (SEASTAR) produced a labelled "email" whose
// value was the real address plus an entire following narrative sentence
// about a different person and vehicle. Stopping at the first run of
// non-whitespace fixes that without giving up the obfuscated-shape case,
// since both a real email and this document family's own obfuscated form
// are always written as a single token with no internal whitespace.
const LABELLED_EMAIL_RE = /^\s*Email\s*:\s*(\S+)/gim;
const BARE_EMAIL_RE = new RegExp(`\\b${EMAIL_SHAPE}\\b`, "g");

// The value stops at a trailing "; email ..." clause rather than swallowing
// it — "Contact:" (unlike "Mobile"/"Phone"/"Tel") is loose enough to
// introduce more than just a phone number on the same line ("Contact:
// Mobile 0491 570 121; email marcus.dunn@bluegum.example."), and without
// this the whole remainder of the line becomes the "phone" value.
const LABELLED_PHONE_RE =
  /^\s*(?:Mobile|Phone|Tel|Contact)\s*:\s*(.+?)(?:\s*;.*)?\s*$/gim;
// Deliberately not anchored to a label: catches the same shape even when a
// second mention of a number is folded into a sentence with a stray
// non-digit character stuck to the front (e.g. "recorded his number as
// x451307354") — exactly the inconsistent-formatting case this scanner
// exists for. Lower confidence than a labelled match, never suppressed by
// one, since a second, differently-formatted number for the same person is
// a real, distinct fact to surface, not noise to dedupe away.
const LOOSE_MOBILE_RE = /(?<!\d)0?4\d{8}(?!\d)/g;

function isRejectedSurname(surname: string): boolean {
  return AU_STATES.has(surname) || PERSON_SURNAME_STOPLIST.has(surname);
}

function isRejectedFirstname(firstNames: string): boolean {
  const firstWord = firstNames.trim().split(/\s+/)[0] ?? "";
  return PERSON_FIRSTNAME_STOPLIST.has(firstWord);
}

// A relationship word instead of (or alongside) "Associates:" — a document
// doesn't always label who someone is with a role like "Associate", it just
// says how they're related to the target: "Mum", "Dad", "Sister", etc.
// There's no schema field for the relationship itself (per the "treat them
// as associates for now" decision), so this list exists purely to
// RECOGNISE the name next to one of these words, not to record the
// relationship anywhere.
const RELATIONSHIP_WORDS = new Set([
  "mum",
  "mother",
  "dad",
  "father",
  "sister",
  "brother",
  "wife",
  "husband",
  "partner",
  "son",
  "daughter",
  "cousin",
  "uncle",
  "aunt",
  "auntie",
  "nephew",
  "niece",
  "grandmother",
  "grandfather",
  "nan",
  "nanna",
  "pop",
  "stepmother",
  "stepfather",
  "stepson",
  "stepdaughter",
  "stepsister",
  "stepbrother",
  "girlfriend",
  "boyfriend",
  "fiancee",
  "fiance",
  "friend",
  "associate",
  "colleague",
]);

/** Strips a leading or trailing relationship-word label from a line before
 * name-matching, e.g. "Mum - Jane SMITH", "Dad: John SMITH",
 * "Jane SMITH (Mum)", "Jane SMITH - Sister" all reduce to "Jane SMITH". A
 * relationship word sitting on its OWN line (no name on the same line)
 * doesn't need this — matchWholeLinePersonName already returns null for it
 * (a single word never satisfies the firstname+surname shape), so
 * findAssociateBlocks just skips it and picks up the name on the next
 * line as usual. */
function stripRelationshipLabel(line: string): string {
  let s = line.trim();
  const leading = s.match(/^([A-Za-z]+)\s*[-–:,]\s*(.+)$/);
  if (leading && RELATIONSHIP_WORDS.has(leading[1].toLowerCase())) {
    s = leading[2].trim();
  }
  const trailingParen = s.match(/^(.+?)\s*\(([A-Za-z]+)\)$/);
  if (trailingParen && RELATIONSHIP_WORDS.has(trailingParen[2].toLowerCase())) {
    s = trailingParen[1].trim();
  }
  const trailingDash = s.match(/^(.+?)\s*[-–:,]\s*([A-Za-z]+)$/);
  if (trailingDash && RELATIONSHIP_WORDS.has(trailingDash[2].toLowerCase())) {
    s = trailingDash[1].trim();
  }
  return s;
}

/** Matches a single line that is ENTIRELY a "Firstname [Middlename]
 * SURNAME" name and nothing else — used to anchor an "associate block" (a
 * name on its own line, followed by that person's address and/or vehicle
 * on the next line or two — see targetProfileFieldMap.ts's
 * findAssociateBlocks) rather than picking a name out of running prose. A
 * relationship word attached to the same line (see RELATIONSHIP_WORDS) is
 * stripped first so "Mum - Jane SMITH" still anchors a block the same way
 * a bare "Jane SMITH" or an "Associates:"-labelled one does. */
export function matchWholeLinePersonName(
  line: string
): { firstNames: string; surname: string } | null {
  const m = stripRelationshipLabel(line).match(WHOLE_LINE_PERSON_RE);
  if (!m) return null;
  const surname = m[2];
  if (isRejectedSurname(surname) || isRejectedFirstname(m[1])) return null;
  return { firstNames: m[1], surname };
}

/** Bare "Firstname SURNAME" mentions — always low confidence; there is no
 * label to lean on, only shape. */
export function findCandidatePersons(text: string): CandidateEntity[] {
  const out: CandidateEntity[] = [];
  PERSON_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERSON_RE.exec(text)) !== null) {
    const surname = m[2];
    if (isRejectedSurname(surname) || isRejectedFirstname(m[1])) continue;
    out.push({
      type: "person",
      value: `${m[1]} ${surname}`,
      confidence: "low",
      raw: m[0],
    });
  }
  return out;
}

/** A line carrying a business-entity suffix (Pty Ltd, Inc, LLC, ...) —
 * BUSINESS_NAME_RE bounds the captured name to that suffix, so a business
 * name sharing its line with an address or other detail (the common case —
 * see BUSINESS_NAME_RE's own comment) surfaces as just the name, not the
 * whole line. `raw` keeps the full line for context on the review screen. */
export function findCandidateBusinesses(text: string): CandidateEntity[] {
  const out: CandidateEntity[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(BUSINESS_NAME_RE);
    if (!m) continue;
    out.push({
      type: "business",
      value: m[1].trim(),
      confidence: "high",
      raw: line,
    });
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
