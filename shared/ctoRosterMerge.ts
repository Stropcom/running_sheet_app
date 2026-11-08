// When has the live roster changed since a draft was seeded from it?
//
// Merging a draft writes the draft's cell over the live one. That is only safe
// when nobody changed the live cell after the draft copied it — otherwise the
// merge would silently undo their change, so the admin has to choose. A change
// to ONLY the start time of a shift (same code, new time) is a change too: it
// used to be missed because only the code was compared.

type Cell =
  | { shiftCode?: string | null; shiftTime?: string | null }
  | undefined;

/** True when the live cell is not what the draft was seeded with (code or
 * time). `seeded` is the draft's snapshot of that cell, if it had one. */
export function liveChangedSinceSeed(live: Cell, seeded: Cell): boolean {
  const code = (c: Cell) => c?.shiftCode ?? "";
  const time = (c: Cell) => c?.shiftTime ?? null;
  return code(live) !== code(seeded) || time(live) !== time(seeded);
}
