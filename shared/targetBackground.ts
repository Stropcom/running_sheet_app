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

/** The heading put above a document's narrative when it is copied into the
 * Background, so a target imported from several operations' documents keeps
 * each story apart: "From Operation X document:". With no operation name
 * (not picked yet) it reads "From imported document:". */
export function importedBackgroundLabel(operationName?: string | null): string {
  const name = operationName?.trim();
  return name ? `From ${name} document:` : "From imported document:";
}

/** The document's narrative with its label above it, ready to drop into the
 * Background box. An empty narrative gives "" (nothing to seed). */
export function labelledImportedBackground(
  narrative: string | null | undefined,
  operationName?: string | null
): string {
  const text = (narrative ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  return `${importedBackgroundLabel(operationName)}\n${text}`;
}
