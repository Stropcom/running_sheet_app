// ─── Who marked an imagery row Saved ────────────────────────────────────────
// The Governance page's Imagery section lists a row for each CIN's photos and
// videos, each with a Saved tick. The Team Leader items show who ticked them
// (CIN and name); the Saved tick now does the same. The server works it out,
// never the screen, so the name on a row is always the officer who really
// pressed it: when a row goes from not-saved to saved it takes the signed-in
// officer's CIN and name; while it stays saved it keeps them; when it is
// un-saved they are cleared. A row that was already saved before this was
// recorded stays without a name (it is not known, and none is guessed).
// Pure and tested (server/imageryStamp.test.ts).

export interface StampableImageryEntry {
  cin: string;
  rowTime: string;
  saved: boolean;
  savedByCIN?: string | null;
  savedByName?: string | null;
}

const keyOf = (e: { cin: string; rowTime: string }) => `${e.cin}||${e.rowTime}`;

/**
 * `incoming` entries from the screen, stamped against what is already stored.
 * Any name the screen sent is ignored; only `existing` and `who` count.
 */
export function stampImagerySaved<T extends StampableImageryEntry>(
  existing: readonly StampableImageryEntry[],
  incoming: readonly T[],
  who: { cin: string; name: string }
): T[] {
  const before = new Map(existing.map(e => [keyOf(e), e]));
  return incoming.map(e => {
    const { savedByCIN: _c, savedByName: _n, ...rest } = e;
    if (!e.saved) return { ...rest, saved: false } as unknown as T;
    const prev = before.get(keyOf(e));
    if (prev?.saved) {
      return {
        ...rest,
        ...(prev.savedByCIN ? { savedByCIN: prev.savedByCIN } : {}),
        ...(prev.savedByName ? { savedByName: prev.savedByName } : {}),
      } as unknown as T;
    }
    return {
      ...rest,
      savedByCIN: who.cin,
      savedByName: who.name,
    } as unknown as T;
  });
}
