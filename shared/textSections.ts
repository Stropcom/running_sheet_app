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
  return /[A-Z]/.test(trimmed);
}
