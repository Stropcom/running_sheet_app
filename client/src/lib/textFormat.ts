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
