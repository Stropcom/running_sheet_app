// Order photos the way the Operation profile's Photoboard lays people out:
// each target first, then that target's registered associates and residents,
// then the next target and theirs. A photo takes the place of the earliest
// person it is linked to; a photo with no link to anyone on the board (an
// unlinked upload, a vehicle or location photo) goes after them all. Ties —
// and the unplaced photos — keep the order they arrived in (newest first), so
// this only ever moves photos that can be tied to someone. Deterministic,
// no lookups beyond the data passed in.

export interface PhotoBoardTarget {
  targetId: number;
  /** Registered associates and residents, in profile order. */
  associates: ReadonlyArray<{ name: string }>;
}

export interface PhotoLink {
  category: string;
  label: string;
  targetId?: number | null;
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The Photoboard slot (0, 1, 2 …) of each target and associate. */
function buildSlots(targets: readonly PhotoBoardTarget[]) {
  const byTarget = new Map<number, number>();
  const byAssociate = new Map<string, number>();
  let slot = 0;
  for (const t of targets) {
    if (!byTarget.has(t.targetId)) byTarget.set(t.targetId, slot);
    slot++;
    for (const a of t.associates) {
      const key = normalise(a.name);
      if (key && !byAssociate.has(key)) byAssociate.set(key, slot);
      slot++;
    }
  }
  return { byTarget, byAssociate };
}

export function orderPhotosLikeProfile<
  T extends { linkedEntities?: readonly PhotoLink[] | null },
>(photos: readonly T[], targets: readonly PhotoBoardTarget[]): T[] {
  if (!targets.length) return [...photos];
  const { byTarget, byAssociate } = buildSlots(targets);
  const rank = (p: T): number => {
    let best = Infinity;
    for (const e of p.linkedEntities ?? []) {
      let s: number | undefined;
      if (e.category === "target" && e.targetId != null)
        s = byTarget.get(e.targetId);
      else if (e.category === "associate") s = byAssociate.get(normalise(e.label));
      if (s !== undefined && s < best) best = s;
    }
    return best;
  };
  return photos
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map(x => x.p);
}
