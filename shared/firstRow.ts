/**
 * The first row of a running sheet.
 *
 * Nearly always it is "Surveillance commenced in the vicinity of [address]",
 * with the whole team on it. So the first row of a sheet is made with that
 * opening already written (the officer types the address) and every CIN on the
 * sheet's team roster already on it. It only fills in what is missing: text an
 * officer or a chip has already written is never replaced, and a sheet that
 * already has a row is left alone. Pure rules — the server's row.create applies
 * them (server/routers/row.ts), so every way of adding a row gets the same.
 */

export const FIRST_ROW_OBSERVATION =
  "Surveillance commenced in the vicinity of ";

interface RosterEntry {
  cin?: unknown;
  isTeamLeader?: unknown;
}

/** The CINs on a sheet's team roster (the sheet's `sheetCins` JSON), in the
 * order the sheet shows them: team leader first, then by CIN number, then by
 * name. Upper case, each once; anything that is not a CIN is skipped. */
export function rosterCins(sheetCins: string | null | undefined): string[] {
  if (!sheetCins) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(sheetCins);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const entries: { cin: string; lead: boolean }[] = [];
  const seen = new Set<string>();
  for (const e of raw as RosterEntry[]) {
    if (!e || typeof e.cin !== "string") continue;
    const cin = e.cin.trim().toUpperCase();
    if (!cin || cin === "__SPACE__" || seen.has(cin)) continue;
    seen.add(cin);
    entries.push({ cin, lead: e.isTeamLeader === true });
  }
  entries.sort((a, b) => {
    if (a.lead !== b.lead) return a.lead ? -1 : 1;
    const an = parseInt(a.cin, 10);
    const bn = parseInt(b.cin, 10);
    if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
    return a.cin.localeCompare(b.cin);
  });
  return entries.map(e => e.cin);
}

export interface FirstRowFill {
  /** The observation to write: the opening, only when none was given. */
  observation: string | undefined;
  /** CINs to put on the row, in order (empty unless it is the first row). */
  members: string[];
  /** The text was filled in by this rule. */
  filledObservation: boolean;
}

/**
 * @param existingRows rows the sheet already has (0 = this is the first)
 * @param observation  what the caller is creating the row with, if anything
 */
export function firstRowFill(
  existingRows: number,
  sheetCins: string | null | undefined,
  observation: string | undefined
): FirstRowFill {
  if (existingRows > 0)
    return { observation, members: [], filledObservation: false };
  const blank = !observation || observation.trim() === "";
  return {
    observation: blank ? FIRST_ROW_OBSERVATION : observation,
    members: rosterCins(sheetCins),
    filledObservation: blank,
  };
}
