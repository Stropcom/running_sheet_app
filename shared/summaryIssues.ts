// The Supervisor Summary's Issues: a list of separate issues (like Objectives
// and Critical Decisions), stored as a JSON array of strings in
// sheet_summaries.issues. Summaries written before it became a list hold ONE
// piece of plain text there — that is read as a single issue and is only
// rewritten as a list if the officer edits it. Nothing is migrated.

/** The issues in a stored value, blanks kept (so a half-typed new issue stays
 * on screen). Plain text from before the list is one issue. */
export function parseIssues(raw: string | null | undefined): string[] {
  if (raw == null || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // not JSON: plain text from before Issues was a list
  }
  return [raw];
}

/** The issues that say something (blanks and spaces dropped, text as written). */
export function issuesToShow(raw: string | null | undefined): string[] {
  return parseIssues(raw)
    .map(i => i.trim())
    .filter(Boolean);
}
