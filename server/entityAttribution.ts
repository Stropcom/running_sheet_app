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
