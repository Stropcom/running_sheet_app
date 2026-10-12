// Region Search: find an entity (person, vehicle, address) across every
// Command, and say which Commands hold it. Pure and deterministic: the
// server hands it the entities and operations, it groups and filters.
//
// What a search reveals is the same for everyone: the entity, the Command
// holding it, its role there, and the operations. What differs is whether the
// viewer may OPEN it in Intelligence: an operation marked Restricted can only
// be opened from its own Command (or by an all-region admin). The match and
// its details still show, so teams can see an overlap and make contact.
import type { CommandCode } from "./commands";

export type RegionEntityType = "person" | "vehicle" | "address";
export type RegionRole = "Target" | "Associate" | "Mentioned";

export interface RegionSearchEntity {
  shortForm: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  isTarget?: boolean;
  isAssociate?: boolean;
  targetId?: number | null;
  aliasLabels?: string[];
  occurrences: Array<{ operationId: number; rowId: number }>;
}

export interface RegionOperation {
  id: number;
  name: string;
  command: CommandCode;
  restricted: boolean;
}

export interface RegionViewer {
  command: CommandCode;
  allRegions: boolean;
  /** Operations the viewer was given a share for: a restricted operation
   * they hold a share for can be opened. */
  reachableOperationIds?: number[];
}

export interface RegionHit {
  command: CommandCode;
  role: RegionRole;
  operations: Array<{ id: number; name: string; restricted: boolean }>;
  /** May the viewer open this in Intelligence? */
  canOpen: boolean;
}

export interface RegionResult {
  key: string;
  type: RegionEntityType;
  label: string;
  isTarget: boolean;
  targetId: number | null;
  hits: RegionHit[];
}

export const MAX_REGION_RESULTS = 50;

const COMMAND_ORDER: CommandCode[] = [
  "WESTERN",
  "NORTHERN",
  "EASTERN",
  "SOUTHERN",
  "CENTRAL",
];

function entityType(t: RegionSearchEntity["type"]): RegionEntityType | null {
  if (t === "person" || t === "vehicle" || t === "address") return t;
  if (t === "business") return "address";
  return null;
}

/** Every typed word must appear somewhere in the label (or an also-known-as). */
export function matchesQuery(
  entity: RegionSearchEntity,
  query: string
): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const hay = [entity.shortForm, ...(entity.aliasLabels ?? [])]
    .join(" ")
    .toLowerCase();
  return tokens.every(t => hay.includes(t));
}

export function regionSearch(
  entities: RegionSearchEntity[],
  operations: RegionOperation[],
  viewer: RegionViewer,
  opts: { query: string; type?: RegionEntityType; command?: CommandCode }
): RegionResult[] {
  const opById = new Map(operations.map(o => [o.id, o]));
  const reachable = new Set(viewer.reachableOperationIds ?? []);
  const results: RegionResult[] = [];

  for (const e of entities) {
    const type = entityType(e.type);
    if (!type) continue;
    if (opts.type && type !== opts.type) continue;
    if (!matchesQuery(e, opts.query)) continue;

    const byCommand = new Map<
      CommandCode,
      { ops: Map<number, RegionOperation>; registry: boolean }
    >();
    for (const occ of e.occurrences) {
      const op = opById.get(occ.operationId);
      if (!op) continue; // "(Registry)" pseudo-operation 0, or a deleted operation
      const g = byCommand.get(op.command) ?? {
        ops: new Map(),
        registry: false,
      };
      g.ops.set(op.id, op);
      if (occ.rowId === 0) g.registry = true;
      byCommand.set(op.command, g);
    }

    const hits: RegionHit[] = [];
    for (const command of COMMAND_ORDER) {
      const g = byCommand.get(command);
      if (!g) continue;
      if (opts.command && opts.command !== command) continue;
      const operations = Array.from(g.ops.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(o => ({ id: o.id, name: o.name, restricted: o.restricted }));
      // On a registry card for this Command's operation the entity IS the
      // target/associate there; seen only in another Command's rows it is
      // just mentioned.
      const role: RegionRole = g.registry
        ? e.isTarget
          ? "Target"
          : e.isAssociate
            ? "Associate"
            : "Mentioned"
        : "Mentioned";
      hits.push({
        command,
        role,
        operations,
        canOpen:
          viewer.allRegions ||
          command === viewer.command ||
          operations.every(o => !o.restricted || reachable.has(o.id)),
      });
    }
    if (hits.length === 0) continue;

    results.push({
      key: `${e.isTarget ? "target" : type}::${e.shortForm}`,
      type,
      label: e.shortForm,
      isTarget: !!e.isTarget,
      targetId: e.targetId ?? null,
      hits,
    });
  }

  results.sort(
    (a, b) => b.hits.length - a.hits.length || a.label.localeCompare(b.label)
  );
  return results.slice(0, MAX_REGION_RESULTS);
}
