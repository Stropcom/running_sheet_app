// Proves two versions of the Intelligence entity list are the same.
//
// The list of people, vehicles and places (getAllIntelligenceEntities) is the
// core of the Intelligence module, and the planned redesign (docs/features/
// dev-and-ops.md, "Intelligence redesign plan") must not change a single
// result. This turns an entity list into a canonical form (stable order, set
// semantics where order carries no meaning) and compares two lists in full, so
// "before" and "after" can be checked with zero tolerance. Used by
// scripts/dev/intelligence-snapshot.ts. Pure; no database, no network.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Keys that hold a SET of labels (their order means nothing). */
const SET_LIKE_KEYS = new Set(["aliasLabels"]);

function compareJson(a: Json, b: Json): number {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function canonical(value: unknown, key?: string): Json {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") {
    return typeof value === "number" && !Number.isFinite(value)
      ? null
      : (value as Json);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value.map(v => canonical(v));
    // Occurrences are listed in the order rows were read; the meaning is the
    // set of them, so order them by where they are (sheet, row) then by the
    // rest. Other arrays keep their order unless they are set-like.
    const looksLikeOccurrences =
      items.length > 0 &&
      items.every(
        i =>
          i !== null &&
          typeof i === "object" &&
          !Array.isArray(i) &&
          "rowId" in i
      );
    if (looksLikeOccurrences || (key && SET_LIKE_KEYS.has(key))) {
      return [...items].sort(compareJson);
    }
    return items;
  }
  const out: { [k: string]: Json } = {};
  for (const k of Object.keys(value as object).sort()) {
    const v = (value as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = canonical(v, k);
  }
  return out;
}

/** The identity of an entity in a list (type + short form + target id). */
export function entityKey(e: {
  type?: unknown;
  shortForm?: unknown;
  targetId?: unknown;
  associateId?: unknown;
}): string {
  return [e.type, e.shortForm, e.targetId ?? "", e.associateId ?? ""].join(
    "::"
  );
}

/** An entity list in a stable form: sorted by identity, every object's keys
 * sorted, occurrences ordered by sheet and row. */
export function canonicalizeEntities(entities: unknown[]): Json[] {
  return entities
    .map(e => canonical(e))
    .sort((a, b) =>
      entityKey(a as never) < entityKey(b as never)
        ? -1
        : entityKey(a as never) > entityKey(b as never)
          ? 1
          : compareJson(a, b)
    );
}

export interface EntityDifference {
  key: string;
  kind: "only-in-a" | "only-in-b" | "changed";
  /** For a changed entity: the top-level fields that differ. */
  fields?: string[];
  /** For a changed entity: how many occurrences each side has. */
  occurrences?: [number, number];
}

export interface EntityComparison {
  identical: boolean;
  countA: number;
  countB: number;
  differences: EntityDifference[];
}

export function compareEntityLists(
  a: unknown[],
  b: unknown[]
): EntityComparison {
  const ca = canonicalizeEntities(a);
  const cb = canonicalizeEntities(b);
  // Two entities can share an identity string, so match them in order within
  // each identity.
  const group = (list: Json[]) => {
    const m = new Map<string, Json[]>();
    for (const e of list) {
      const k = entityKey(e as never);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  };
  const ga = group(ca);
  const gb = group(cb);
  const differences: EntityDifference[] = [];
  const keys = new Set<string>(
    Array.from(ga.keys()).concat(Array.from(gb.keys()))
  );
  for (const key of Array.from(keys).sort()) {
    const la = ga.get(key) ?? [];
    const lb = gb.get(key) ?? [];
    const n = Math.max(la.length, lb.length);
    for (let i = 0; i < n; i++) {
      const ea = la[i];
      const eb = lb[i];
      if (ea === undefined) {
        differences.push({ key, kind: "only-in-b" });
      } else if (eb === undefined) {
        differences.push({ key, kind: "only-in-a" });
      } else if (JSON.stringify(ea) !== JSON.stringify(eb)) {
        const oa = ea as { [k: string]: Json };
        const ob = eb as { [k: string]: Json };
        const fields = Array.from(
          new Set([...Object.keys(oa), ...Object.keys(ob)])
        )
          .filter(f => JSON.stringify(oa[f]) !== JSON.stringify(ob[f]))
          .sort();
        const occ = (e: { [k: string]: Json }) =>
          Array.isArray(e.occurrences) ? e.occurrences.length : 0;
        differences.push({
          key,
          kind: "changed",
          fields,
          occurrences: [occ(oa), occ(ob)],
        });
      }
    }
  }
  return {
    identical: differences.length === 0,
    countA: ca.length,
    countB: cb.length,
    differences,
  };
}
