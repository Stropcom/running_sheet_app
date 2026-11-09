// How a search result shows the running sheet line it found: a short stretch of
// the officer's own text around the first match, and the pieces to highlight.
// Pure rules (no database), tested in server/searchSnippet.test.ts.

/** The text of a line cut to about `width` characters around the first place
 * `query` appears (case does not matter). A line that is short enough is kept
 * whole. "…" marks where text was cut. The officer's wording is never changed. */
export function snippetAround(
  text: string,
  query: string,
  width = 160
): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= width) return t;
  const q = query.trim().toLowerCase();
  const at = q ? t.toLowerCase().indexOf(q) : -1;
  if (at < 0) return t.slice(0, width).trimEnd() + "…";
  const room = Math.max(0, width - q.length);
  let start = Math.max(0, at - Math.floor(room / 3));
  let end = Math.min(t.length, start + width);
  start = Math.max(0, end - width);
  // Cut on a space where there is one close by, so words are not split.
  if (start > 0) {
    const sp = t.indexOf(" ", start);
    if (sp >= 0 && sp < at) start = sp + 1;
  }
  if (end < t.length) {
    const sp = t.lastIndexOf(" ", end);
    if (sp > at + q.length) end = sp;
  }
  return (
    (start > 0 ? "…" : "") +
    t.slice(start, end).trim() +
    (end < t.length ? "…" : "")
  );
}

/** The snippet split into plain and highlighted pieces — every place the query
 * appears is highlighted. */
export function highlightQuery(
  text: string,
  query: string
): Array<{ text: string; hit: boolean }> {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: Array<{ text: string; hit: boolean }> = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(q, from);
    if (at < 0) break;
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

/** Where a found line is opened: the running sheet, scrolled to that line. */
export function searchHitPath(sheetId: number, rowId: number): string {
  return `/sheet/${sheetId}?highlightRow=${rowId}`;
}
