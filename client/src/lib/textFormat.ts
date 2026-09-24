import { isHeadingLine } from "@shared/textSections";

// The "background"/narrative text parsed from an uploaded document is one
// line per Word paragraph in the source file, joined with a blank line
// between every one — accurate to the document, but when it was composed
// with a line break after nearly every phrase (typical of typing on a
// phone's narrow screen, hitting Enter at the end of each visible line),
// that turns into dozens of one-line paragraphs. Rendered verbatim with
// `white-space: pre-wrap`, that shows as a poem-like column of short,
// hard-broken lines no matter how wide the screen actually is — while a
// document typed as normal flowing paragraphs (a few long ones) wraps to
// fill the available width just fine.
//
// reflowNarrativeText is a DISPLAY-only fix: it folds a paragraph break
// that doesn't follow sentence-ending punctuation back into the next line
// (joined by a space) so the browser's own word-wrap can fill the
// available width, while a paragraph that already ends a sentence keeps
// its own break. It never touches the stored/parsed text itself — callers
// pass the raw field in, this only changes what gets rendered.
export function reflowNarrativeText(text: string): string {
  const paragraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  const merged: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    current = current ? `${current} ${para}` : para;
    if (/[.!?]["'’”)\]]?$/.test(para)) {
      merged.push(current);
      current = "";
    }
  }
  if (current) merged.push(current);
  return merged.join("\n\n");
}

export interface NarrativeSection {
  /** Null for a run of paragraphs before the first heading, or for the
   * whole thing when the text has no heading at all — rendered with no
   * title bar, same as a plain paragraph read today. */
  heading: string | null;
  paragraphs: string[];
}

/** Same fold-until-sentence-end reflow as reflowNarrativeText, but groups
 * the result under its own genuine section headings (see isHeadingLine)
 * instead of flattening everything into one undifferentiated run. Unlike
 * reflowNarrativeText, a heading line is never folded into the paragraph
 * before or after it — "SUMMARY" or "COMMUNICATIONS" always starts its
 * own group instead of getting swallowed into whichever sentence happens
 * to follow it, which is what made the plain reflow unreadable for a
 * multi-section document (every heading word silently became part of the
 * next paragraph's own first sentence). */
export function groupNarrativeIntoSections(text: string): NarrativeSection[] {
  const rawParagraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  const merged: string[] = [];
  let current = "";
  for (const para of rawParagraphs) {
    if (isHeadingLine(para)) {
      if (current) {
        merged.push(current);
        current = "";
      }
      merged.push(para);
      continue;
    }
    current = current ? `${current} ${para}` : para;
    if (/[.!?]["'’”)\]]?$/.test(para)) {
      merged.push(current);
      current = "";
    }
  }
  if (current) merged.push(current);

  const sections: NarrativeSection[] = [];
  let heading: string | null = null;
  let paragraphs: string[] = [];
  for (const p of merged) {
    if (isHeadingLine(p)) {
      if (heading !== null || paragraphs.length > 0) {
        sections.push({ heading, paragraphs });
      }
      heading = p;
      paragraphs = [];
    } else {
      paragraphs.push(p);
    }
  }
  if (heading !== null || paragraphs.length > 0) {
    sections.push({ heading, paragraphs });
  }
  return sections;
}
