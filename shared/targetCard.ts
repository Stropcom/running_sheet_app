// Picking out the target's own position among the continuity cards. The
// whole point of continuity is to track where the target is and what he is
// likely to do next, so the card holding him leads the band.

/** The target's bracket label from a sheet title like
 * "20261006 - 459 - ORCHARD (BAIG)" — his surname for a person target.
 * Null when there is none, or it is not a plain surname (a vehicle or
 * address target is described in words, and is not tracked this way). */
export function targetTokenFromTitle(
  title: string | null | undefined
): string | null {
  const m = (title ?? "").match(/\(([^()]+)\)\s*$/);
  if (!m) return null;
  const t = m[1].trim();
  return /^[A-Za-z'-]{2,}$/.test(t) ? t.toUpperCase() : null;
}

export interface TargetCardInput {
  key: string;
  /** Capitalised surname tokens of the people this card is about. */
  holds?: string[];
  latestRowId: number;
}

/** The key of the card holding the target, if any. Where more than one
 * does (it should not happen), the one with the newest row wins. */
export function pickTargetCardKey(
  cards: TargetCardInput[],
  token: string
): string | null {
  const t = token.toUpperCase();
  const holding = cards.filter(c =>
    (c.holds ?? []).some(h => h.toUpperCase() === t)
  );
  if (holding.length === 0) return null;
  return holding.reduce((a, b) => (b.latestRowId > a.latestRowId ? b : a)).key;
}

/** Everyone in `people` other than the target. */
export function companionsOf(people: string[], token: string): string[] {
  const t = token.toUpperCase();
  return people.filter(p => !new RegExp(`\\b${t}\\b`, "i").test(p));
}
