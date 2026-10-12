/**
 * The Target Registry's freeform Background: plain text with line breaks
 * kept, nothing else interpreted. Shared so the server stores exactly what
 * the client previews and the profile pages show.
 */

/** Longest Background an officer can save — generous, but bounded so a
 * stray paste can't bloat every profile that renders it. */
export const TARGET_BACKGROUND_MAX = 20000;

/** Normalises what the officer typed: Windows/old-Mac line endings become
 * "\n", outer whitespace is trimmed, the length is capped, and an empty
 * result is null (cleared). */
export function normaliseTargetBackground(input: string): string | null {
  const text = input.replace(/\r\n?/g, "\n").trim();
  return text.length > 0 ? text.slice(0, TARGET_BACKGROUND_MAX) : null;
}
