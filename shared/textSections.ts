// Shared between server/documentImport/targetProfileFieldMap.ts (splitting a
// document's own paragraph flow at genuine section boundaries while
// mapping it into structured fields) and the client's Background-text
// display (client/src/lib/textFormat.ts), so both agree on what counts as
// a real section heading rather than ordinary narrative prose.

/** A bare "Target"/"Subject" line is a real heading in some document
 * families even though it isn't ALL-CAPS like every other heading here —
 * e.g. a real training document (QUARRY) bundles the whole subject card
 * into one table cell as "Target\nOliver James BISHOP\nDOB: ...". Matched
 * by exact word rather than loosening the general ALL-CAPS rule below,
 * which would risk misreading an ordinary Title Case sentence fragment
 * elsewhere as a heading. */
const BARE_SUBJECT_HEADING_RE = /^(target|subject|person of interest)$/i;

/** Detects a short, standalone line as a genuine section heading (e.g.
 * "SUMMARY", "COMMUNICATIONS", "VEHICLES") as opposed to ordinary body
 * prose. A "Label: value" content line (a DOB, an ID number, a phone) is
 * never a heading, even when the value itself happens to contain no
 * lowercase letters (a date, a numeric ID) — without this, "DOB:
 * 03/11/1990" or "PROMIS ID: 9084417" reads as a heading under the
 * ALL-CAPS rule below, splitting a real section apart right after its
 * first line. None of this document family's actual headings use a
 * colon. */
export function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 70) return false;
  if (/^\d+[.)]\s*\S/.test(trimmed)) return true;
  if (BARE_SUBJECT_HEADING_RE.test(trimmed)) return true;
  if (trimmed.includes(":")) return false;
  if (/[a-z]/.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  // A "LABEL value" line with no colon (a DOB written as "DOB 21/12/1989"
  // rather than "DOB: 21/12/1989") has no lowercase letters either, so
  // without this it reads as a heading under the ALL-CAPS rule below —
  // wrongly splitting an Associates prose block right after this data
  // line (found against a real training document, Operation CROSSWIND,
  // whose Associates text restates a person's own DOB this way). Scoped to
  // an actual date pattern rather than "any digit" — a real heading can
  // legitimately carry a plain number ("SUMMARY - VERSION 3"), just never
  // a date.
  if (/\d{1,4}[/-]\d{1,2}[/-]\d{2,4}/.test(trimmed)) return false;
  return /[A-Z]/.test(trimmed);
}

/** Matches a document's own "VEHICLES" section heading — shared so the
 * client's Background-text display (ImportedDocumentCard.tsx) can drop a
 * Background section that's just the same VEHICLES content already shown
 * in the structured Vehicles list above it, without duplicating this
 * pattern out of sync with the server's own targetProfileFieldMap.ts. */
export const VEHICLES_HEADING_RE = /^VEHICLES?\b/i;

/** Matches a document's own "LOCATION OF INTEREST"/"ADDRESSES" section
 * heading — same sharing reason as VEHICLES_HEADING_RE above, for the
 * structured Addresses list. */
export const LOCATION_HEADING_RE = /LOCATIONS?\s+OF\s+INTEREST|^ADDRESSES?\b/i;
