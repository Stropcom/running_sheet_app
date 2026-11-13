// Part of the Intelligence page (client/src/pages/Intelligence.tsx): the Operations tab (an operation's card and its entities).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import { formatIntelVehicle } from "@/lib/addressFormat";
import type { EntityType, Entity, OperationSummary } from "./types";
import { INTEL_EXPANDED_OP_KEY } from "./viewState";
import {
  placeLabel,
  TYPE_LABELS,
  TYPE_ICONS,
  TYPE_COLORS,
  uniqueSheets,
  entityPillClass,
} from "./helpers";

// ─── Operations Tab ───────────────────────────────────────────────────────────

export function OperationsTab({
  entities,
  allOps,
  search,
  sortOrder = "az",
  tileView = false,
}: {
  entities: Entity[];
  allOps?: Array<{ id: number; name: string }>;
  search: string;
  sortOrder?: "az" | "recent";
  tileView?: boolean;
}) {
  const [expandedOpId, setExpandedOpId] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem(INTEL_EXPANDED_OP_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (expandedOpId == null)
        sessionStorage.removeItem(INTEL_EXPANDED_OP_KEY);
      else sessionStorage.setItem(INTEL_EXPANDED_OP_KEY, String(expandedOpId));
    } catch {
      /* ignore */
    }
  }, [expandedOpId]);
  const [, navigate] = useLocation();

  const operations = useMemo<OperationSummary[]>(() => {
    const opMap = new Map<number, OperationSummary>();

    // Seed opMap with ALL known operations (so ops with no entities still appear)
    if (allOps) {
      for (const op of allOps) {
        opMap.set(op.id, {
          operationId: op.id,
          operationName: op.name,
          entityCount: 0,
          sheetCount: 0,
          entities: [],
        });
      }
    }

    for (const entity of entities) {
      for (const occ of entity.occurrences) {
        if (!opMap.has(occ.operationId)) {
          opMap.set(occ.operationId, {
            operationId: occ.operationId,
            operationName: occ.operationName,
            entityCount: 0,
            sheetCount: 0,
            entities: [],
          });
        }
        const op = opMap.get(occ.operationId)!;
        // Add entity to this op if not already present
        if (
          !op.entities.find(
            e => e.type === entity.type && e.shortForm === entity.shortForm
          )
        ) {
          op.entities.push(entity);
          op.entityCount += 1;
        }
      }
    }
    // Compute unique sheet count per operation
    const opList: OperationSummary[] = [];
    opMap.forEach(op => {
      const sheetIds = new Set<number>();
      for (const e of op.entities) {
        for (const occ of e.occurrences) {
          if (occ.operationId === op.operationId) sheetIds.add(occ.sheetId);
        }
      }
      op.sheetCount = sheetIds.size;
      opList.push(op);
    });
    // (Registry) — targets/entities not linked to any operation — is excluded
    // from this folder list entirely; it's not a real operation.
    const isRegistry = (op: OperationSummary) =>
      op.operationId === 0 || op.operationName === "(Registry)";
    const normal = opList.filter(op => !isRegistry(op));
    // Get latest sheet title across all entities in an operation (used for recency sort)
    const getLatestSheet = (op: OperationSummary) => {
      let best = "";
      for (const e of op.entities) {
        for (const occ of e.occurrences) {
          if (occ.operationId === op.operationId && occ.sheetTitle > best)
            best = occ.sheetTitle;
        }
      }
      return best;
    };
    return [...normal].sort((a, b) => {
      if (sortOrder === "recent")
        return getLatestSheet(b).localeCompare(getLatestSheet(a));
      return a.operationName.localeCompare(b.operationName); // az (default)
    });
  }, [entities, allOps, sortOrder]);

  const filtered = useMemo(() => {
    if (!search) return operations;
    const q = search.toLowerCase();
    return operations.filter(
      op =>
        op.operationName.toLowerCase().includes(q) ||
        op.entities.some(e => e.shortForm.toLowerCase().includes(q))
    );
  }, [operations, search]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Folder className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No operations found.</p>
      </div>
    );
  }

  // The full entity list for one operation, grouped by type — shared by the
  // list rows and the grid tiles.
  const entityPanel = (op: OperationSummary) => {
    const byType: Partial<Record<EntityType, Entity[]>> = {};
    for (const e of op.entities) {
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type]!.push(e);
    }
    return (
      <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
        {(
          [
            "person",
            "vehicle",
            "address",
            "business",
            "unknown",
          ] as EntityType[]
        ).map(type => {
          const group = byType[type];
          if (!group || group.length === 0) return null;
          return (
            <div key={type}>
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[type]}`}
                >
                  {TYPE_ICONS[type]}
                  {TYPE_LABELS[type]}s
                </span>
                <span className="text-xs text-muted-foreground">
                  {group.length}
                </span>
              </div>
              <div className="rounded-lg border border-border/40 overflow-hidden">
                {group.map((entity, idx) => {
                  const opOccs = entity.occurrences.filter(
                    o => o.operationId === op.operationId
                  );
                  const opSheets = uniqueSheets(opOccs);
                  return (
                    <div
                      key={`${entity.type}::${entity.shortForm}`}
                      className={`flex items-center gap-3 px-3 py-2.5 ${idx < group.length - 1 ? "border-b border-border/30" : ""}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${TYPE_COLORS[type]} shrink-0`}
                      >
                        {TYPE_ICONS[type]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs font-medium text-foreground truncate">
                          {entity.type === "vehicle"
                            ? formatIntelVehicle(
                                entity.shortForm,
                                entity.occurrences[0]?.fullDescription
                              )
                            : entity.type === "address" ||
                                entity.type === "business"
                              ? placeLabel(entity.shortForm)
                              : entity.shortForm}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-foreground">
                          {opOccs.length}×
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {opSheets.length} sheet
                          {opSheets.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (tileView) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {filtered.map(op => (
          <div
            key={op.operationId}
            className="group flex flex-col gap-3 p-5 rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
            onClick={() =>
              navigate(`/intelligence/operation/${op.operationId}`)
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="p-2.5 rounded-lg bg-violet-400/10 border border-violet-400/20 shrink-0">
                <Folder className="w-5 h-5 text-violet-400" />
              </div>
            </div>
            <p className="font-semibold text-foreground leading-tight line-clamp-2">
              {op.operationName}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              {/* The entity count is the button that opens the entity list
                  (the tile itself opens the operation profile). Hidden on
                  phones — the list and its panel are tablet/laptop only. */}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setExpandedOpId(
                    expandedOpId === op.operationId ? null : op.operationId
                  );
                }}
                aria-expanded={expandedOpId === op.operationId}
                title="Show the entity list"
                className={`${entityPillClass(expandedOpId === op.operationId)} max-sm:hidden`}
              >
                <span className="font-bold">{op.entityCount}</span>
                {op.entityCount === 1 ? "entity" : "entities"}
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expandedOpId === op.operationId ? "rotate-180" : ""}`}
                />
              </button>
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {op.sheetCount}
                </span>{" "}
                {op.sheetCount === 1 ? "sheet" : "sheets"}
              </span>
            </div>
            {expandedOpId === op.operationId && (
              <div
                className="-mx-5 -mb-5 cursor-default border-t border-border max-sm:hidden"
                onClick={e => e.stopPropagation()}
              >
                {entityPanel(op)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map(op => {
        const isExpanded = expandedOpId === op.operationId;

        return (
          <div
            key={op.operationId}
            className="rounded-xl border border-border/60 overflow-hidden bg-card"
          >
            <div className="flex items-center gap-2 pr-3">
              <button
                onClick={() =>
                  navigate(`/intelligence/operation/${op.operationId}`)
                }
                title="View Operation Profile"
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/10"
              >
                <div className="p-2.5 rounded-lg bg-violet-400/10 border border-violet-400/20 shrink-0">
                  <Folder className="w-5 h-5 text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-foreground sm:truncate">
                    {op.operationName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {op.sheetCount} {op.sheetCount === 1 ? "sheet" : "sheets"}
                  </p>
                </div>
              </button>
              {/* The entity count is the button that opens the entity list;
                  the row beside it opens the operation profile. Hidden on
                  phones, along with the panel it opens. */}
              <button
                type="button"
                onClick={() =>
                  setExpandedOpId(isExpanded ? null : op.operationId)
                }
                aria-expanded={isExpanded}
                title="Show the entity list"
                className={`${entityPillClass(isExpanded)} justify-center max-sm:hidden sm:min-w-[8.5rem]`}
              >
                <span className="font-bold">{op.entityCount}</span>
                {op.entityCount === 1 ? "entity" : "entities"}
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
              <button
                onClick={() =>
                  navigate(`/intelligence/operation/${op.operationId}`)
                }
                title="View Operation Profile"
                aria-label={`Open ${op.operationName} profile`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10"
              >
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-border max-sm:hidden">
                {entityPanel(op)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
