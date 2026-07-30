// Deterministic, regex-based entity extraction from a document's narrative
// text (e.g. the Summary section) — no LLM/NLP model, per CLAUDE.md's Golden
// Rule. Scope is intentionally narrow: these patterns work because AFP-style
// intelligence documents follow specific, recognizable conventions (surname
// in ALL CAPS, "Pty Ltd" company suffixes, standard AU phone/email formats)
// — this is not general-purpose name-spotting in arbitrary prose, and won't
// catch a person or business mentioned in a form these patterns don't cover.

export interface ExtractedEntity {
  type: "person" | "business" | "vehicle" | "address" | "phone" | "email";
  label: string;
}

// "First Middle SURNAME" — one or more capitalized words followed by a
// final ALL-CAPS word, matching the surname-in-caps convention used
// throughout these documents (e.g. "Ryan FORBES", "John Alawishes DOE").
// Matched against text with line breaks intact (not collapsed to spaces) so
// this can't span across what were originally separate lines — e.g. "Ryan
// FORBES" on one line and "Rex Imports..." on the next shouldn't merge.
const PERSON_RE = /\b(?:[A-Z][a-z]+[ \t]+){1,3}[A-Z]{2,}\b/g;

// State/territory abbreviations read as a plausible trailing ALL-CAPS
// "surname" token (e.g. "Bullsbrook WA") — not people, filter them out.
const AU_STATE_ABBREVIATIONS = new Set([
  "WA",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "TAS",
  "NT",
  "ACT",
]);

const BUSINESS_RE =
  /\b[A-Z][A-Za-z0-9&' \t]{2,60}?[ \t](?:Pty\.?[ \t]?Ltd\.?|Ltd\.?|Inc\.?|LLC)\b/g;

const PHONE_RE = /\b0[0-9](?:[ -]?[0-9]){8}\b/g;

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

export function extractEntitiesFromDocumentText(
  text: string
): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  const add = (type: ExtractedEntity["type"], label: string) => {
    const key = `${type}:${label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({ type, label });
  };

  for (const m of Array.from(text.matchAll(PERSON_RE))) {
    const label = m[0].trim();
    const trailingToken = label.split(/\s+/).pop() ?? "";
    if (AU_STATE_ABBREVIATIONS.has(trailingToken)) continue;
    add("person", label);
  }
  for (const m of Array.from(text.matchAll(BUSINESS_RE)))
    add("business", m[0].trim());
  for (const m of Array.from(text.matchAll(PHONE_RE)))
    add("phone", m[0].trim());
  for (const m of Array.from(text.matchAll(EMAIL_RE)))
    add("email", m[0].trim());

  return entities;
}

/** Normalized dedup key — reuses normalizeEntityLabel from server/db.ts, the same normalization getAllIntelligenceEntities() uses, so a mention's key lines up with an existing entity's shortForm regardless of casing/whitespace. */
export function normalizeEntityKey(type: string, label: string): string {
  return `${type}:${label.toLowerCase().replace(/\s+/g, " ").trim()}`;
}
