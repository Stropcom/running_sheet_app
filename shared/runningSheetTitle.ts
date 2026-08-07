// Running sheet titles are auto-generated, not free-typed — see CLAUDE.md
// for the format. Any piece not yet known at the time of generation is
// simply left out, so the title starts minimal and fills in as the sheet's
// date/author/target become known (re-run this after any of those change).

/** "2026-08-07" -> "20260807" */
function reverseDateISO(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

/** Perth-anchored (+08:00, no DST) YYYY-MM-DD for a JS Date — same anchoring
 * approach used elsewhere (db.ts's toPerthDateISO) so a sheet inserted just
 * after local midnight in Perth doesn't fall back to the wrong UTC day. */
export function perthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildRunningSheetTitle(params: {
  /** YYYY-MM-DD. Falls back to createdAt (Perth-anchored) for sheets predating sheetDate. */
  sheetDate: string | null;
  createdAt?: Date | null;
  authorCIN?: string | null;
  operationName: string;
  targetSurname?: string | null;
}): string {
  const dateISO =
    params.sheetDate ??
    (params.createdAt ? perthDateISO(params.createdAt) : null);

  const parts: string[] = [];
  if (dateISO) parts.push(reverseDateISO(dateISO));
  if (params.authorCIN?.trim())
    parts.push(params.authorCIN.trim().toUpperCase());
  parts.push(params.operationName.trim());

  const base = parts.join(" - ");
  return params.targetSurname?.trim()
    ? `${base} (${params.targetSurname.trim().toUpperCase()})`
    : base;
}
