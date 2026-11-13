import { and, eq, isNull, or } from "drizzle-orm";
import {
  regionSearch,
  type RegionEntityType,
  type RegionResult,
  type RegionViewer,
} from "@shared/regionSearch";
import type { CommandCode } from "@shared/commands";
import { VEHICLE_REGO_PATTERN } from "@shared/vehicleRego";
import {
  operations,
  wipcMembers,
  entityAliases,
  entityDedupDecisions,
} from "../../drizzle/schema";
import {
  findPossibleDuplicates,
  type DedupType,
  type DedupCandidateEntity,
} from "../entityDedup";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import {
  getCertificationsByRowIds,
  getMembersByRowIds,
  getOperationById,
  getRowsBySheetId,
  getRunningSheetById,
} from "./operations";
import { getTargetById } from "./targets";
import { getAllIntelligenceEntities } from "./reports";
import { encryptMember } from "./court";
import { extractEntitiesFromText } from "./intelligence/entityExtraction";

// Moved into ./intelligence/ — re-exported so every import of this file is unchanged.
export * from "./intelligence/deepSearch";
export * from "./intelligence/entityExtraction";
export * from "./intelligence/profileTypes";
export * from "./intelligence/previousEntities";

export interface IntelligenceEntity {
  shortForm: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  /** True when this entity comes from a formal target card (not just observation text) */
  isTarget?: boolean;
  /** For target entities: the TGT code alias (e.g. "TANG") if set on the target card */
  tgtAlias?: string | null;
  /** For target entities: the numeric DB id of the target record */
  targetId?: number | null;
  /** For target/associate entities: the structured registry surname field
   * (targets.surname / associates.surname) — used for "Sort by Surname" on
   * the Intelligence folder's Targets/Associates tabs, rather than guessing
   * a surname out of the free-text shortForm display name. */
  surname?: string | null;
  /** True when at least one occurrence was extracted with low confidence (type=unknown or ambiguous pattern) */
  lowConfidence?: boolean;
  /** Labels of entities merged into this one via a confirmed duplicate decision. */
  aliasLabels?: string[];
  /** True when this entity comes from a formal registry associate record (not just observation text) */
  isAssociate?: boolean;
  /** For associate entities: the numeric DB id of the associate record */
  associateId?: number | null;
  /** For associate entities: the parent target this associate belongs to */
  associateOfTargetId?: number | null;
  associateOfTargetName?: string | null;
  /**
   * True when every occurrence of this entity is synthetic (rowId 0) — i.e.
   * it exists only because it was typed into the Target Registry (or another
   * non-running-sheet source), and has never actually been mentioned in a
   * real observation row yet. Drives the "Indices" badge: the moment a real
   * (rowId > 0) occurrence appears, this flips to false permanently, since
   * the information is now corroborated by a running sheet.
   */
  isIndicesOnly?: boolean;
  /**
   * Set when this entity's Target/Associate card is linked (via
   * targets.linkedAssociateId / associates.linkedTargetId — see "Person
   * Identity Links" above updateTarget) to a card of the other kind for
   * the same real person. Both entities' occurrences are unioned so
   * either profile shows the complete picture; this points at the other
   * one so the UI can flag "identical profile" and link across.
   */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  occurrences: Array<{
    sheetId: number;
    sheetTitle: string;
    operationId: number;
    operationName: string;
    rowId: number;
    observationSnippet: string;
    timeMinutes: number | null;
    fullDescription: string;
  }>;
}

/**
 * Merges address/vehicle entities of one type where one shortForm is a
 * strict prefix of another (e.g. "1 Smith Street" absorbed into "1 Smith
 * Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux") — the same
 * real-world thing recognised twice: once from a registry card, once from
 * observation text, under two different labels. Exported and pure (no DB)
 * so this can be tested directly — see entityMerge.test.ts.
 *
 * IMPORTANT constraints:
 *   - Only meaningful for "address" and "vehicle" types (NOT persons or
 *     businesses) because person names share common prefixes legitimately
 *     (SMITH vs SMITH JONES) — callers should only invoke this for a group
 *     that's already been filtered to one of those two types.
 *   - isTarget entities are never passed to this pass.
 *   - The shorter form must end at a natural word boundary in the longer
 *     form (space, comma, semicolon, dash, or slash) to avoid false merges.
 *
 * `absorbed` is tracked by entity object, not by shortForm string: when a
 * registry entity and a text-mined entity for the same place format to the
 * exact same label — the normal case once registry addresses are tidied for
 * display (see 17e2229) — a string-keyed set can't tell "the entity that got
 * absorbed" from "the entity it was absorbed into"; they're the same string.
 * That collision used to silently drop the merged survivor (all its
 * occurrences included) from the output entirely, precisely whenever a
 * registry card and an observation-derived mention of the same address
 * coincided — the case that matters most.
 */
export function mergeContainedEntities(
  group: IntelligenceEntity[],
  entityType: "address" | "vehicle"
): IntelligenceEntity[] {
  // Sort by shortForm length descending so longer (fuller) versions come first
  const sorted = [...group].sort(
    (a, b) => b.shortForm.length - a.shortForm.length
  );
  const absorbed = new Set<IntelligenceEntity>();
  const survivors: IntelligenceEntity[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const longer = sorted[i];
    const longerLower = longer.shortForm.toLowerCase().trim();
    if (absorbed.has(longer)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const shorter = sorted[j];
      const shorterLower = shorter.shortForm.toLowerCase().trim();
      if (absorbed.has(shorter)) continue;

      // For vehicles: also absorb when the shorter shortForm appears ANYWHERE inside
      // the longer (e.g. "ABC 123" inside "silver Toyota Hilux bearing ABC 123").
      // For addresses: keep the original prefix-only rule.
      const isContained =
        entityType === "vehicle"
          ? (() => {
              const idx = longerLower.indexOf(shorterLower);
              if (idx === -1) return false;
              // Must be at a word boundary on both sides
              const before =
                idx === 0 || /[\s,;\-/(]/.test(longerLower[idx - 1]);
              const after =
                idx + shorterLower.length === longerLower.length ||
                /[\s,;\-/)]/.test(longerLower[idx + shorterLower.length]);
              return before && after;
            })()
          : longerLower.startsWith(shorterLower) &&
            (longerLower.length === shorterLower.length ||
              /^[\s,;\-/]/.test(longerLower.slice(shorterLower.length)));
      if (isContained) {
        // Merge shorter's occurrences into longer, deduplicating by sheetId+rowId+snippet
        const existingKeys = new Set(
          longer.occurrences.map(
            (o: IntelligenceEntity["occurrences"][0]) =>
              `${o.sheetId}::${o.rowId}::${o.observationSnippet}`
          )
        );
        for (const occ of shorter.occurrences) {
          const occKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
          if (!existingKeys.has(occKey)) {
            longer.occurrences.push(occ);
            existingKeys.add(occKey);
          }
        }
        if (shorter.aliasLabels?.length) {
          longer.aliasLabels = longer.aliasLabels ?? [];
          for (const label of shorter.aliasLabels) {
            if (!longer.aliasLabels.includes(label))
              longer.aliasLabels.push(label);
          }
        }
        // For vehicles: when merging, prefer the entity with a richer display name
        // (one that includes colour/make/model) over a bare rego or "Vehicle REGO" form.
        // The longer entity (sorted by shortForm length) is usually richer, so we keep it.
        // Exception: if the longer entity is actually a bare rego and the shorter has
        // a richer description (colour+make), swap them.
        if (entityType === "vehicle") {
          const longerHasDesc = /[a-z]/i.test(
            longer.shortForm.replace(/^\d[A-Z]{2,3}\d{3}\s*/i, "")
          );
          const shorterHasDesc = /[a-z]/i.test(
            shorter.shortForm.replace(/^\d[A-Z]{2,3}\d{3}\s*/i, "")
          );
          if (!longerHasDesc && shorterHasDesc) {
            longer.shortForm = shorter.shortForm;
          }
        }
        absorbed.add(shorter);
      }
    }

    // Only keep this entity if it was NOT itself absorbed by a longer one
    if (!absorbed.has(longer)) {
      survivors.push(longer);
    }
  }

  return survivors;
}

// Vehicles are uniquely identified by their registration, not by whatever
// descriptive text happens to surround it in a given mention. The same car
// can show up as "1ADF124" (bare), "Vehicle 1ADF124" (chip insert),
// "1ADF124 red Ford Territory" (built from observation text), or "silver
// Hyundai Santa Fe, bearing WA registration 1ICW519" (raw target-card V1F
// field) — all textually very different despite being the same physical
// vehicle, which previously produced separate duplicate entities. Extract
// the WA-plate-shaped token (if any) and key on that alone so every
// mention of the same vehicle collapses into one entity; the richest
// available description is still kept for display (see "prefer longer
// shortForm" below).
export function vehicleRegoKey(text: string): string {
  const m = text.match(VEHICLE_REGO_PATTERN);
  return (m ? m[0] : text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extracts the trailing "(<short form>)" bracket content from a composed
 * HBF-style address string (e.g. "6 Shearman Street, ATTADALE WA (6
 * Shearman Street)" -> "6 shearman street") — the same short text an
 * observation row's own "(ShortForm)" bracket would contain for the same
 * address. Registry address fields must key on this, not the full
 * street/suburb/state description, or a registry-sourced address entity can
 * never match (and therefore never get corroborated by) a text-mined
 * mention of the same real-world address. Falls back to the whole
 * (normalized) string when there's no trailing bracket, e.g. legacy
 * free-text data entered before the structured address fields existed.
 */
export function addressBracketKey(text: string): string {
  const m = text.match(/\(([^()]{1,120})\)\s*$/);
  return (m ? m[1] : text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * A Vehicle or Location TARGET is itself the subject, so it is stored as the
 * entity `target::<name>`. Observation text that mentions that same vehicle
 * (by rego) or place (by its bracket short form) is mined into an ordinary
 * `vehicle::<rego>` / `address::<short form>` entity, which left the target
 * listed twice: once as the target card ("Indices" only, no sightings) and
 * once as an ordinary vehicle/address with all the sightings.
 *
 * This is the ordinary entity key such a target stands in for, so
 * getAllIntelligenceEntities can fold those mentions into the target
 * instead. Null when the target isn't a vehicle with a rego or a location,
 * or has nothing to key on (a vehicle target named only by description).
 */
export function subjectTargetEntityKey(
  targetType: string | null | undefined,
  targetName: string
): string | null {
  if (targetType === "vehicle") {
    const m = targetName.match(VEHICLE_REGO_PATTERN);
    return m ? `vehicle::${m[0].toLowerCase()}` : null;
  }
  if (targetType === "location") {
    const k = addressBracketKey(targetName);
    return k ? `address::${k}` : null;
  }
  return null;
}

/** Same "type::normalizedShortForm" key scheme getAllIntelligenceEntities uses internally. */
export function computeEntityKey(type: DedupType, shortForm: string): string {
  const norm =
    type === "vehicle"
      ? vehicleRegoKey(shortForm)
      : normalizeEntityLabel(shortForm);
  return `${type}::${norm}`;
}

export interface SheetEntityChip {
  key: string;
  type: "person" | "vehicle" | "address" | "business";
  /** The short bracket token as typed — surname / rego / short address — inserted when the chip is tapped. */
  insertValue: string;
  /** The fuller recovered name/description shown on the chip button itself. */
  display: string;
  occurrenceCount: number;
}

// Surfaces a quick-tap chip for every distinct person/vehicle/address/business
// mentioned in this sheet's observations so far, reusing the same
// "Full description (SHORT)" bracket convention extractEntitiesFromText
// already parses — e.g. "Jason JOHNSON (JOHNSON)" surfaces a JOHNSON chip,
// "white Toyota Landcruiser (1FBP509)" surfaces a 1FBP509 chip. Scoped to
// just this sheet's rows (not the whole operation/registry), computed on
// read rather than stored, so every officer viewing the sheet sees the same
// chips — not a per-device thing. Low-confidence extractions are excluded
// to keep the chip bar from filling with noise from ambiguous text.
//
// Anything already covered by the sheet's assigned target card (TGT/HB/
// V1/V2.../DEP/ARR/wild fields — the blue chips) is skipped, since those
// already have their own chip; these purple chips are for genuinely new
// information logged in this sheet, not a duplicate of the target card.
export async function getSheetEntityChips(
  sheetId: number
): Promise<SheetEntityChip[]> {
  const [rows, sheet] = await Promise.all([
    getRowsBySheetId(sheetId),
    getRunningSheetById(sheetId),
  ]);

  const targetKeys = new Set<string>();
  if (sheet?.targetId) {
    const t = await getTargetById(sheet.targetId);
    if (t) {
      const addKey = (type: DedupType, v?: string | null) => {
        if (v) targetKeys.add(computeEntityKey(type, v));
      };
      addKey("person", t.tgt);
      addKey("address", t.hb);
      addKey("address", t.dep);
      addKey("address", t.arr);
      addKey("vehicle", t.v1);
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(
          t.extraVehicles ?? "[]"
        );
        evs.forEach(ev => addKey("vehicle", ev.short));
      } catch {}
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(
          t.wildFields ?? "[]"
        );
        // A wild field's type isn't known ahead of time, so cover all three —
        // an accidental cross-type key collision on arbitrary text is negligible.
        wfs.forEach(wf => {
          addKey("person", wf.value);
          addKey("vehicle", wf.value);
          addKey("address", wf.value);
        });
      } catch {}
    }
  }

  const byKey = new Map<string, SheetEntityChip>();

  for (const row of rows) {
    if (!row.observation) continue;
    const entities = extractEntitiesFromText(row.observation);
    for (const e of entities) {
      if (e.confidence === "low") continue;
      if (e.type === "unknown") continue;
      const key = computeEntityKey(e.type, e.rawShortForm);
      if (targetKeys.has(key)) continue;
      const existing = byKey.get(key);
      if (existing) {
        existing.occurrenceCount++;
        if (e.shortForm.length > existing.display.length)
          existing.display = e.shortForm;
      } else {
        byKey.set(key, {
          key,
          type: e.type,
          insertValue: e.rawShortForm,
          display: e.shortForm,
          occurrenceCount: 1,
        });
      }
    }
  }

  // Group by type — vehicles, then persons, then locations, then business —
  // preserving each entity's original generation order within its group
  // (Array.prototype.sort is a stable sort, so equal-type items keep their
  // relative Map-insertion order rather than being re-sorted by name/count).
  const TYPE_ORDER: Record<SheetEntityChip["type"], number> = {
    vehicle: 0,
    person: 1,
    address: 2,
    business: 3,
  };
  return Array.from(byKey.values())
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .slice(0, 24);
}

// ─── Entity Deduplication ───────────────────────────────────────────────────
// Deterministic fuzzy-duplicate detection and manual/confirmed merging for
// non-target Intelligence entities (person/vehicle/address/business). See
// server/entityDedup.ts for the matching heuristics themselves — everything
// here is plain DB plumbing around entity_aliases / entity_dedup_decisions.

/** Bare normalized key (no "type::" prefix) — what entity_aliases/entity_dedup_decisions store. */
export function normOnly(type: DedupType, shortForm: string): string {
  return type === "vehicle"
    ? vehicleRegoKey(shortForm)
    : normalizeEntityLabel(shortForm);
}

export interface DuplicateMatchResult {
  key: string;
  label: string;
  type: DedupType;
  rowCount: number;
  score: number;
  reason: string;
  associateId?: number | null;
  associateOfTargetId?: number | null;
  /** True when the label is the SAME normalized name, not a near miss. Only
   * returned when the caller asks for exact matches (`includeExact`). */
  exact?: boolean;
}

/**
 * Fuzzy-matches a candidate label (not yet saved as an entity — this is
 * called as an officer types/saves an observation row) against every
 * existing entity of the same type, excluding pairs already confirmed as
 * distinct via a previous "No" answer.
 */
export async function checkPossibleDuplicates(
  type: DedupType,
  label: string,
  opts: { includeExact?: boolean } = {}
): Promise<DuplicateMatchResult[]> {
  const db = await getDb();
  if (!db) return [];
  const candidateCombinedKey = computeEntityKey(type, label);
  const candidateBareKey = normOnly(type, label);

  // Already a confirmed alias (either side) — getAllIntelligenceEntities will
  // silently fold this into its winner, so there's nothing new to ask about.
  const existingAlias = await db
    .select()
    .from(entityAliases)
    .where(
      and(
        eq(entityAliases.type, type),
        or(
          eq(entityAliases.loserKey, candidateBareKey),
          eq(entityAliases.winnerKey, candidateBareKey)
        )
      )
    )
    .limit(1);
  if (existingAlias.length > 0) return [];

  const allEntities = await getAllIntelligenceEntities();
  const candidates: DedupCandidateEntity[] = allEntities
    .filter(e => !e.isTarget && e.type === type)
    .map(e => ({
      key: computeEntityKey(type, e.shortForm),
      label: e.shortForm,
      type,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
      associateId: e.isAssociate ? e.associateId : null,
      associateOfTargetId: e.isAssociate ? e.associateOfTargetId : null,
    }));

  const decisions = await db
    .select()
    .from(entityDedupDecisions)
    .where(eq(entityDedupDecisions.type, type));
  const decidedDifferentBareKeys = new Set<string>();
  for (const d of decisions) {
    if (d.keyA === candidateBareKey) decidedDifferentBareKeys.add(d.keyB);
    else if (d.keyB === candidateBareKey) decidedDifferentBareKeys.add(d.keyA);
  }
  const filtered = candidates.filter(
    c => !decidedDifferentBareKeys.has(normOnly(type, c.label))
  );

  const fuzzy: DuplicateMatchResult[] = findPossibleDuplicates(
    label,
    type,
    candidateCombinedKey,
    filtered
  );
  if (!opts.includeExact) return fuzzy;
  // The row-save prompt leaves an exact match out — the same name simply
  // collapses into one entity there. But when REGISTERING a record for a
  // person who is already in the Intelligence folder (an associate, or
  // someone mined from rows), an exact name is the strongest match there is
  // and the officer must be told, so it leads the list.
  const exact: DuplicateMatchResult[] = candidates
    .filter(c => c.key === candidateCombinedKey)
    .map(c => ({
      ...c,
      score: 1,
      reason: "same name already recorded",
      exact: true,
    }));
  return [...exact, ...fuzzy];
}

/**
 * Region Search: which Commands hold an entity (person, vehicle, address).
 * Every signed-in user sees the same matches and details; restricted
 * operations only differ in whether `canOpen` is true (see shared/regionSearch).
 */
export async function searchRegions(
  viewer: RegionViewer,
  opts: { query: string; type?: RegionEntityType; command?: CommandCode }
): Promise<RegionResult[]> {
  const db = await getDb();
  if (!db) return [];
  const [entities, ops] = await Promise.all([
    getAllIntelligenceEntities({ unscoped: true }),
    db
      .select({
        id: operations.id,
        name: operations.name,
        command: operations.command,
        restricted: operations.restricted,
      })
      .from(operations)
      .where(isNull(operations.deletedAt)),
  ]);
  return regionSearch(entities, ops, viewer, opts);
}

// ─── Association Graph ───────────────────────────────────────────────────────

export interface AssocNode {
  id: string; // e.g. "person::SAM JACK"
  label: string; // display label
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number; // total times seen
  operationIds: number[];
  operationNames: string[];
  /** Registry target id when this node is a target, else null. Lets callers
   * (e.g. the Intelligence Package, which centres a diagram on each chosen
   * target) match a target to its node by id instead of by display label. */
  targetId: number | null;
}

export interface AssocEdge {
  source: string; // node id
  target: string; // node id
  weight: number; // number of rows where both appear together
}

export interface AssociationGraph {
  nodes: AssocNode[];
  edges: AssocEdge[];
}

/**
 * Co-occurrence graph for the Association Map / Ego Network.
 *
 * Built on getAllIntelligenceEntities() — the same two-pass, alias-merged
 * pipeline the Intelligence folder's own entity list uses — rather than
 * running extractEntitiesFromText() per row. That distinction is the whole
 * point: extractEntitiesFromText only recognises entities that are
 * bracket-introduced in the row it is handed, but the running sheet
 * convention is to bracket-introduce an entity once and then refer to it
 * bare ("HOGAN entered Vehicle 1FAD093"). Per-row extraction therefore sees
 * at most one entity in almost every row, finds no pairs, and produces a
 * graph with zero edges. Grouping the resolved entities' own occurrences by
 * rowId picks up those bare re-mentions and yields the real co-occurrences.
 *
 * Occurrences with rowId 0 are synthetic — they come from a Target Registry
 * card rather than an observation — so they make an entity appear as a node
 * but never manufacture an edge.
 */
export async function getAssociationGraph(
  operationIds?: number[],
  sheetIds?: number[]
): Promise<AssociationGraph> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const scoped = operationIds && operationIds.length > 0 ? operationIds : null;
  const sheetScoped = sheetIds && sheetIds.length > 0 ? sheetIds : null;
  const entities = await getAllIntelligenceEntities();

  const nodeMap = new Map<string, AssocNode>();
  // rowId -> node ids mentioned in that row
  const rowMembers = new Map<number, Set<string>>();

  for (const entity of entities) {
    // A Target and Associate card confirmed as the same real person (see
    // identicalProfile in getAllIntelligenceEntities) already carry the
    // same unioned occurrences — represent them as ONE combined node
    // (the Target side) rather than two nodes for one person. Skip the
    // Associate side here; its occurrences are already fully reflected via
    // the Target node below.
    if (entity.isAssociate && entity.identicalProfile?.type === "target") {
      continue;
    }

    const type: AssocNode["type"] = entity.isTarget
      ? "target"
      : (entity.type as AssocNode["type"]);
    const nodeId = entity.isTarget
      ? `target::${entity.shortForm}`
      : `${entity.type}::${entity.shortForm.toLowerCase()}`;

    const relevant = entity.occurrences.filter(
      o =>
        (!scoped || scoped.includes(o.operationId)) &&
        (!sheetScoped || sheetScoped.includes(o.sheetId))
    );
    if (relevant.length === 0) continue;

    let node = nodeMap.get(nodeId);
    if (!node) {
      node = {
        id: nodeId,
        label: entity.shortForm,
        type,
        occurrences: 0,
        operationIds: [],
        operationNames: [],
        targetId: entity.isTarget ? (entity.targetId ?? null) : null,
      };
      nodeMap.set(nodeId, node);
    }

    for (const occ of relevant) {
      node.occurrences++;
      if (!node.operationIds.includes(occ.operationId)) {
        node.operationIds.push(occ.operationId);
        node.operationNames.push(occ.operationName);
      }
      // rowId 0 is a registry-card mention, not a real observation — it
      // makes the entity visible but must not create a co-occurrence.
      if (occ.rowId > 0) {
        if (!rowMembers.has(occ.rowId)) rowMembers.set(occ.rowId, new Set());
        rowMembers.get(occ.rowId)!.add(nodeId);
      }
    }
  }

  // Every pair of entities sharing a row is one co-occurrence.
  const edgeWeight = new Map<string, number>();
  for (const members of Array.from(rowMembers.values())) {
    const ids = Array.from(members);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|||");
        edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: AssocEdge[] = [];
  for (const [key, weight] of Array.from(edgeWeight.entries())) {
    const [source, target] = key.split("|||");
    edges.push({ source, target, weight });
  }

  // A registry-only entity has real presence in the app even with no
  // observation behind it yet — keep it visible rather than showing 0.
  for (const node of Array.from(nodeMap.values())) {
    if (node.occurrences === 0) node.occurrences = 1;
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

// ─── Intel Export ───────────────────────────────────────────────────────────
// Structured JSON/CSV data for handing running-sheet content and its mined
// intelligence to another agency's system — Administration → Intel Export.
// Deliberately independent of the Court module (Statement/Witness List/
// WIPC generators) — this reads straight from running sheets and the
// Intelligence entity index, nothing here is ever built from Court output.
// CINs are exported as recorded (no WIPC redaction).

export interface IntelExportRunningSheet {
  operation: {
    id: number;
    name: string;
    promisNumber: string | null;
    imsNumber: string | null;
    investigationUnit: string | null;
  } | null;
  sheet: {
    id: number;
    title: string;
    sheetDate: string | null;
    status: "open" | "closed";
    closedAt: number | null;
    closedByCIN: string | null;
    targetId: number | null;
    targetName: string | null;
    roster: { cin: string; isTeamLeader: boolean }[];
  };
  rows: {
    rowNumber: number;
    date: string | null;
    time: string | null;
    observation: string | null;
    membersPresent: string[];
    certifications: { cin: string; certifiedAt: string }[];
    isLocked: boolean;
  }[];
}

export interface IntelExportEntity {
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  shortForm: string;
  isRegisteredTarget: boolean;
  registryId: number | null;
  occurrences: {
    sheetId: number;
    sheetTitle: string;
    rowNumber: number | null;
    time: string | null;
    snippet: string;
  }[];
}

/** Builds both Intel Export documents (the running sheet(s) themselves, and
 * the intelligence mined from them) for a set of running sheets — the
 * caller decides which of the two, and in which format(s), to actually
 * download. */
export async function getIntelExportData(sheetIds: number[]): Promise<{
  runningSheets: IntelExportRunningSheet[];
  intelEntities: IntelExportEntity[];
}> {
  const runningSheets: IntelExportRunningSheet[] = [];
  const rowMetaById = new Map<
    number,
    {
      sheetId: number;
      sheetTitle: string;
      rowNumber: number;
      time: string | null;
    }
  >();

  for (const sheetId of sheetIds) {
    const sheet = await getRunningSheetById(sheetId);
    if (!sheet) continue;
    const operation = sheet.operationId
      ? await getOperationById(sheet.operationId)
      : null;
    const rows = await getRowsBySheetId(sheetId);
    const rowIds = rows.map(r => r.id);
    const [members, certs] = await Promise.all([
      getMembersByRowIds(rowIds),
      getCertificationsByRowIds(rowIds),
    ]);

    let roster: { cin: string; isTeamLeader: boolean }[] = [];
    try {
      const raw: Array<{ cin: string; isTeamLeader?: boolean }> = JSON.parse(
        sheet.sheetCins ?? "[]"
      );
      roster = raw.map(c => ({
        cin: c.cin,
        isTeamLeader: !!c.isTeamLeader,
      }));
    } catch {
      roster = [];
    }

    rows.forEach(row => {
      rowMetaById.set(row.id, {
        sheetId,
        sheetTitle: sheet.title,
        rowNumber: row.rowNumber,
        time: row.time,
      });
    });

    runningSheets.push({
      operation: operation
        ? {
            id: operation.id,
            name: operation.name,
            promisNumber: operation.promisNumber ?? null,
            imsNumber: operation.imsNumber ?? null,
            investigationUnit: operation.investigationUnit ?? null,
          }
        : null,
      sheet: {
        id: sheet.id,
        title: sheet.title,
        sheetDate: sheet.sheetDate,
        status: sheet.closedAt ? "closed" : "open",
        closedAt: sheet.closedAt ?? null,
        closedByCIN: sheet.closedByCIN ?? null,
        targetId: sheet.targetId ?? null,
        targetName: sheet.targetName ?? null,
        roster,
      },
      rows: rows.map(row => ({
        rowNumber: row.rowNumber,
        date: row.rowDate ?? sheet.sheetDate ?? null,
        time: row.time,
        observation: row.observation,
        membersPresent: members
          .filter(m => m.rowId === row.id)
          .map(m => m.memberName),
        certifications: certs
          .filter(c => c.rowId === row.id && c.isActive)
          .map(c => ({
            cin: c.certifiedByCIN,
            certifiedAt: new Date(c.certifiedAt).toISOString(),
          })),
        isLocked: row.isLocked,
      })),
    });
  }

  const sheetIdSet = new Set(sheetIds);
  const allEntities = await getAllIntelligenceEntities();
  const intelEntities: IntelExportEntity[] = [];
  for (const e of allEntities) {
    const relevantOccurrences = e.occurrences.filter(
      o => sheetIdSet.has(o.sheetId) && o.rowId > 0
    );
    if (relevantOccurrences.length === 0) continue;
    intelEntities.push({
      type: e.type,
      shortForm: e.shortForm,
      isRegisteredTarget: !!e.isTarget || !!e.isAssociate,
      registryId: e.isTarget
        ? (e.targetId ?? null)
        : e.isAssociate
          ? (e.associateId ?? null)
          : null,
      occurrences: relevantOccurrences.map(o => {
        const meta = rowMetaById.get(o.rowId);
        return {
          sheetId: o.sheetId,
          sheetTitle: o.sheetTitle,
          rowNumber: meta?.rowNumber ?? null,
          time: meta?.time ?? null,
          snippet: o.observationSnippet,
        };
      }),
    });
  }

  return { runningSheets, intelEntities };
}

/** Save a new WIPC member (encrypted) — admin only */
export async function createWipcMember(
  createdBy: number,
  data: {
    fullName: string;
    dob?: string;
    afpId: string;
    cinNumber?: string;
    aiInitials?: string;
    aiKnownAs?: string;
    isUco?: boolean;
    isOco?: boolean;
    isCin?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  const [result] = await db.insert(wipcMembers).values({
    createdBy,
    fullName: encrypted.fullName as string,
    afpId: encrypted.afpId as string,
    dob: encrypted.dob as string | undefined,
    cinNumber: encrypted.cinNumber as string | undefined,
    aiInitials: encrypted.aiInitials as string | undefined,
    aiKnownAs: encrypted.aiKnownAs as string | undefined,
    isUco: data.isUco ?? false,
    isOco: data.isOco ?? false,
    isCin: data.isCin ?? true,
  });
  return result;
}

/** Update an existing WIPC member (encrypted) — admin only */
export async function updateWipcMember(
  id: number,
  data: Partial<{
    fullName: string;
    dob: string;
    afpId: string;
    cinNumber: string;
    aiInitials: string;
    aiKnownAs: string;
    isUco: boolean;
    isOco: boolean;
    isCin: boolean;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptMember({ ...data }) as typeof data;
  await db
    .update(wipcMembers)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(wipcMembers.id, id));
}

/** Delete a WIPC member — admin only */
export async function deleteWipcMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(wipcMembers).where(eq(wipcMembers.id, id));
}
