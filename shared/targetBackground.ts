import { isHeadingLine } from "./textSections";

/**
 * The Target Registry's freeform Background: plain text with line breaks
 * kept, nothing else interpreted. Shared so the server stores exactly what
 * the client previews and the profile pages show.
 */

/** A line this long (or longer) that stops without a full stop was almost
 * certainly wrapped by the source document, not finished by its author. */
const WRAPPED_LINE_MIN_CHARS = 70;

const ENDS_THOUGHT_RE = /[.!?;]["'’”)\]]?$/;

/** Does this line end what it was saying? A full stop, "?", "!" or ";", or a
 * short label ending in a colon ("07 August 2026:"). A long line ending in a
 * colon is a wrapped "Shipment:" / "Telegram:" value, so it is not final. */
function endsThought(line: string): boolean {
  if (ENDS_THOUGHT_RE.test(line)) return true;
  return line.endsWith(":") && line.length < WRAPPED_LINE_MIN_CHARS;
}

/**
 * Puts back the sentences a document's own line wrapping cut in two. A
 * document typed or converted with a hard line break at the end of every
 * visible line arrives as one paragraph per line, so a sentence is split
 * mid-way ("… 76 Almond Street, CANNINGTON WA" / "6107 remains as …").
 * Two neighbouring lines are joined with a single space only when the first
 * clearly did not finish — no full stop (or short colon-ended label) at the
 * end, and not a heading — AND the second plainly carries it on: it starts
 * lower case or with "@", or the first line is long enough to have been
 * wrapped. Short label lines ("Nadia Farah QURESHI", "Mobile: 0491 …")
 * keep their own line, headings keep theirs, and every break that is left
 * stays exactly as it was. No word is changed.
 */
export function reflowWrappedLines(text: string): string {
  const parts = text.split(/(\n+)/);
  // Each entry is one logical line plus the break that came before it.
  const lines: { brk: string; text: string }[] = [];
  let brk = "";
  for (const part of parts) {
    if (/^\n+$/.test(part)) {
      brk = part;
      continue;
    }
    const line = part.trim();
    if (!line) continue;
    const last = lines[lines.length - 1];
    const continues =
      last !== undefined &&
      !endsThought(last.text) &&
      !isHeadingLine(last.text) &&
      !isHeadingLine(line) &&
      (/^[a-z@]/.test(line) || last.text.length >= WRAPPED_LINE_MIN_CHARS);
    if (continues) {
      // Judged as a whole from here on: the joined line ends where the
      // second half ends, and is as long as both halves together.
      last.text = `${last.text} ${line}`;
    } else {
      lines.push({ brk: last === undefined ? "" : brk || "\n", text: line });
    }
    brk = "";
  }
  return lines.map(l => l.brk + l.text).join("");
}

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
  const text = reflowWrappedLines(
    (narrative ?? "").replace(/\r\n?/g, "\n").trim()
  );
  if (!text) return "";
  return `${importedBackgroundLabel(operationName)}\n${text}`;
}
