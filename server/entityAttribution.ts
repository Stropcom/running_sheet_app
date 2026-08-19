// ─── Entity attribution ─────────────────────────────────────────────────────
// One rule, in one place: an entity is only credited with an observation it is
// actually mentioned in.
//
// The rule exists because a running sheet's assigned target records who the
// team set out to watch, not who they saw. A shift spent sitting on a house
// the target never emerges from still logs everyone else who comes and goes —
// associates, their vehicles, the addresses they travel to. Treating "this row
// is on the target's sheet" as "this row is about the target" manufactures a
// pattern of life, a heat map and an association list for someone nobody laid
// eyes on. In a system whose output is evidentiary, that is the worst kind of
// wrong: confident and plausible.
//
// So attribution is drawn strictly from occurrences — the rows where
// getAllIntelligenceEntities' two-pass recognition actually found the entity,
// whether bracket-introduced there ("Ruben SANDWICH (SANDWICH)") or referred
// to bare after an earlier introduction ("SANDWICH departed"). Nothing is
// inferred: no carrying a subject forward across rows, no assuming the target
// is present because a movement they began is still being narrated.
//
// The accepted cost is under-reporting. Where a movement runs across several
// rows and only the first names the target, the later rows don't count. That
// is the deliberate direction of error — omitting a movement the target did
// make is a gap, whereas recording a movement they did not make is a false
// attribution.

/** The fields of an entity occurrence attribution actually depends on. */
export interface AttributableOccurrence {
  /** 0 marks a synthetic occurrence seeded from a registry card rather than a
   * real observation row — never a sighting, so never attributable. */
  rowId: number;
  sheetId: number;
  operationId: number;
}

export interface AttributionScope {
  /** Restrict to occurrences within one operation. */
  operationId?: number;
  /** Restrict to occurrences on these sheets. Omit for app-wide. */
  sheetIds?: Set<number>;
}

/**
 * The rows an entity may be credited with — i.e. the rows it is mentioned in,
 * narrowed to the given scope.
 *
 * An empty result is a real answer, not a failure: an entity never named in
 * any observation has no attributable activity, however many sheets were
 * opened in its name.
 */
export function attributedRowIds(
  occurrences: readonly AttributableOccurrence[] | undefined,
  scope: AttributionScope = {}
): Set<number> {
  const rowIds = new Set<number>();
  for (const occ of occurrences ?? []) {
    if (occ.rowId <= 0) continue;
    if (scope.operationId != null && occ.operationId !== scope.operationId)
      continue;
    if (scope.sheetIds && !scope.sheetIds.has(occ.sheetId)) continue;
    rowIds.add(occ.rowId);
  }
  return rowIds;
}

// ─── Cross-operation awareness ─────────────────────────────────────────────
// findPossibleDuplicates (entityDedup.ts) deliberately skips exact-key
// matches — those already collapse into one shared entity via
// getAllIntelligenceEntities, so from a *recognition* standpoint there is
// nothing to ask about. But that silence is exactly the problem on an
// evidentiary surveillance system: an address, vehicle, or person already
// known from a real observation on a different operation should surface to
// the officer, not merge invisibly. This is that check.

/** The fields of an occurrence a cross-operation check actually needs. */
export interface CrossOperationOccurrence {
  /** 0 marks a synthetic registry-card occurrence — never a real sighting,
   * so never grounds for a cross-operation warning. */
  rowId: number;
  operationId: number;
  operationName: string;
}

/**
 * Every OTHER operation (not `currentOperationId`) that has a real
 * observation of this entity, deduplicated and in first-seen order.
 *
 * An empty result is a real answer: an entity only ever observed on the
 * current operation (or only known from a registry card) has nothing to
 * warn about.
 */
export function crossOperationNames(
  occurrences: readonly CrossOperationOccurrence[] | undefined,
  currentOperationId: number
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const occ of occurrences ?? []) {
    if (occ.rowId <= 0) continue;
    if (occ.operationId === currentOperationId) continue;
    if (seen.has(occ.operationName)) continue;
    seen.add(occ.operationName);
    names.push(occ.operationName);
  }
  return names;
}

// ─── Visits ─────────────────────────────────────────────────────────────────

/** One mention of a location, positioned within its sheet. `order` is the
 * row's index in the sheet as written — not its index among the mentions
 * being collapsed — so interleaved rows belonging to other entities don't
 * disturb the sequence. */
export interface LocationMention {
  entityKey: string;
  sheetId: number;
  order: number;
}

/**
 * Collapses consecutive mentions of the same location into a single visit,
 * returning the first mention of each — which carries that visit's time.
 *
 * A presence at a location is one visit however many rows narrate it:
 *
 *   seen arriving, then departing  → 1
 *   seen departing only            → 1
 *   seen arriving only             → 1
 *
 * A new visit is only counted once a *different* location appears in between,
 * or the sheet changes. Rows belonging to other entities are already filtered
 * out before this runs (see attributedRowIds) and are simply absent from the
 * sequence — so a target seen arriving, an associate seen leaving, and the
 * target then seen departing is still one visit by the target, not two.
 */
export function collapseToVisits<T extends LocationMention>(
  mentions: readonly T[]
): T[] {
  const bySheet = new Map<number, T[]>();
  for (const m of mentions) {
    if (!bySheet.has(m.sheetId)) bySheet.set(m.sheetId, []);
    bySheet.get(m.sheetId)!.push(m);
  }

  const visits: T[] = [];
  for (const sheetMentions of Array.from(bySheet.values())) {
    const ordered = [...sheetMentions].sort((a, b) => a.order - b.order);
    let lastEntityKey: string | null = null;
    for (const m of ordered) {
      if (m.entityKey === lastEntityKey) continue; // still the same visit
      lastEntityKey = m.entityKey;
      visits.push(m);
    }
  }
  return visits;
}
