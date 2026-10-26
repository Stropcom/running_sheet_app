// Team Search — one search for the whole team on a running sheet.
//
// "The team" is the CIN roster of the selected running sheet (the daily roster
// kept on the sheet, `runningSheets.sheetCins`), plus whoever started or last
// updated the search. This file is only the rule for who is on it; the server
// asks it, and a test pins it down. Deterministic, no outside calls.

/** The CINs on a sheet's roster (the JSON in `sheetCins`), trimmed and without
 * blanks or repeats. Anything that is not a list of { cin } gives none. */
export function rosterCins(json: string | null | undefined): string[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const e of raw) {
    const cin =
      e &&
      typeof e === "object" &&
      typeof (e as { cin?: unknown }).cin === "string"
        ? (e as { cin: string }).cin.trim()
        : "";
    if (cin && !out.includes(cin)) out.push(cin);
  }
  return out;
}

/** Whether this officer is on the search's team: on the sheet's roster, or the
 * one who started / last changed the search. */
export function isOnSearchTeam(args: {
  cin: string | null | undefined;
  roster: string[];
  updatedByCIN: string | null | undefined;
}): boolean {
  const cin = args.cin?.trim();
  if (!cin) return false;
  return args.roster.includes(cin) || args.updatedByCIN?.trim() === cin;
}

/** The people the search's tracks are drawn for: the roster plus whoever
 * started it, as CINs, without repeats. */
export function teamCinsOf(
  roster: string[],
  updatedByCIN: string | null | undefined
): string[] {
  const out = [...roster];
  const by = updatedByCIN?.trim();
  if (by && !out.includes(by)) out.push(by);
  return out;
}

/** A search nobody has touched for this long is over, so one that was never
 * ended does not keep switching the predictor on for the team all day. Any
 * change to it (a tap, a time button, pause, resume) starts the clock again. */
export const SEARCH_LIFETIME_MS = 4 * 60 * 60 * 1000;

/** Whether a search last updated at `updatedAtMs` is still running at `nowMs`. */
export function isSearchLive(updatedAtMs: number, nowMs: number): boolean {
  return nowMs - updatedAtMs <= SEARCH_LIFETIME_MS;
}

/** Starting Search again joins the search that is already running if it was
 * touched within this long; an older one is replaced by a blank, so a pin from
 * half an hour ago does not come back with a huge ring. */
export const SEARCH_FRESH_MS = 10 * 60 * 1000;

/** Whether a running search last updated at `updatedAtMs` is still fresh. */
export function isSearchFresh(updatedAtMs: number, nowMs: number): boolean {
  return nowMs - updatedAtMs <= SEARCH_FRESH_MS;
}
