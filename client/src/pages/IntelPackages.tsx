import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDown } from "lucide-react";
import {
  buildPackageDocument,
  openPrintPreview,
  escHtml,
  type PackageSection,
} from "@/lib/intelPackage";
import {
  computeEgoLayout,
  exportRingRadii,
  buildEgoNetworkSvg,
  edgeEnds,
  RING1_MAX,
  NODE_COLORS,
  ENTITY_TYPES,
  ENTITY_LABELS,
  type EgoNode,
  type EgoEdge,
} from "@/lib/egoNetworkLayout";

type PackageScope = "operation" | "target";

/** Hops used for every diagram in a package — direct links only. Second-degree
 * rings make each diagram much larger, and a package already carries one per
 * target, so the printed page stays readable at 1 hop. */
const PACKAGE_HOPS = 1 as const;

export default function IntelPackages() {
  const [scope, setScope] = useState<PackageScope>("operation");
  const [operationId, setOperationId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  /** null = every target (the default); a Set = an explicit subset. */
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<number> | null>(
    null
  );
  const [isBuilding, setIsBuilding] = useState(false);

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: targets, isLoading: targetsLoading } =
    trpc.target.list.useQuery(
      { operationId: operationId ?? 0 },
      { enabled: operationId != null }
    );

  const { data: graphData } = trpc.intelligence.getAssociationGraph.useQuery(
    { operationIds: operationId != null ? [operationId] : undefined },
    { enabled: operationId != null, staleTime: 30_000 }
  );

  const operationName =
    (operations ?? []).find(o => o.id === operationId)?.name ?? "";

  // ── Ego graph indexes (same shape the Ego Network page builds) ──────────
  const nodesById = useMemo(() => {
    const m = new Map<string, EgoNode>();
    for (const n of (graphData?.nodes ?? []) as EgoNode[]) m.set(n.id, n);
    return m;
  }, [graphData]);

  const adjacency = useMemo(() => {
    const m = new Map<string, { id: string; weight: number }[]>();
    for (const e of (graphData?.edges ?? []) as EgoEdge[]) {
      const [s, t] = edgeEnds(e);
      if (!m.has(s)) m.set(s, []);
      if (!m.has(t)) m.set(t, []);
      m.get(s)!.push({ id: t, weight: e.weight });
      m.get(t)!.push({ id: s, weight: e.weight });
    }
    for (const list of Array.from(m.values()))
      list.sort((a, b) => b.weight - a.weight);
    return m;
  }, [graphData]);

  /** Registry target id -> its node in the co-occurrence graph. */
  const nodeByTargetId = useMemo(() => {
    const m = new Map<number, EgoNode>();
    for (const n of (graphData?.nodes ?? []) as EgoNode[]) {
      if (n.type === "target" && n.targetId != null) m.set(n.targetId, n);
    }
    return m;
  }, [graphData]);

  /** Targets actually going into the package, in list order. */
  const chosenTargets = useMemo(() => {
    const all = targets ?? [];
    if (scope === "target") {
      const t = all.find(x => x.id === targetId);
      return t ? [t] : [];
    }
    if (selectedTargetIds === null) return all;
    return all.filter(t => selectedTargetIds.has(t.id));
  }, [targets, scope, targetId, selectedTargetIds]);

  const toggleTarget = (id: number) => {
    setSelectedTargetIds(prev => {
      const base = prev ?? new Set((targets ?? []).map(t => t.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    selectedTargetIds === null ||
    (targets ?? []).every(t => selectedTargetIds.has(t.id));

  // ── Section builders ────────────────────────────────────────────────────

  const legendHtml = ENTITY_TYPES.map(
    t =>
      `<span class="legend-item"><span class="legend-dot" style="background:${NODE_COLORS[t]}"></span>${escHtml(ENTITY_LABELS[t])}</span>`
  ).join("");

  function buildEgoSection(): PackageSection | null {
    const blocks: string[] = [];
    const missing: string[] = [];

    for (const t of chosenTargets) {
      const focusNode = nodeByTargetId.get(t.id);
      if (!focusNode) {
        // A target with no observed co-occurrences has no node in the graph.
        // Say so rather than silently dropping it from the package.
        missing.push(t.name);
        continue;
      }
      const ring1Count = Math.min(
        adjacency.get(focusNode.id)?.length ?? 0,
        RING1_MAX
      );
      const radii = exportRingRadii(ring1Count);
      const layout = computeEgoLayout({
        focusNode,
        adjacency,
        nodesById,
        hops: PACKAGE_HOPS,
        expandRing1: false,
        ring1Radius: radii.ring1,
        ring2Radius: radii.ring2,
      });
      const svg = buildEgoNetworkSvg({ focusNode, layout, radii });
      const ring1 = layout.placed.filter(p => p.hop === 1);
      const rows = layout.placed
        .map(
          p =>
            `<tr><td>${escHtml(p.node.label)}</td><td>${escHtml(ENTITY_LABELS[p.node.type] ?? p.node.type)}</td><td>${p.weight}&times;</td></tr>`
        )
        .join("");

      blocks.push(`<div class="sub-block">
        <p class="sub-head">${escHtml(t.name)}</p>
        ${svg}
        <div class="stats-line">${ring1.length} direct link${ring1.length !== 1 ? "s" : ""}${layout.hiddenRing1Count > 0 ? ` &middot; ${layout.hiddenRing1Count} not shown` : ""}</div>
        <div class="legend">${legendHtml}</div>
        ${
          layout.placed.length
            ? `<table class="data-table" style="margin-top:10px">
          <thead><tr><th>Entity</th><th style="width:110px">Type</th><th style="width:110px">Co-occurrences</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
            : `<p class="muted-note">No recorded co-occurrences.</p>`
        }
      </div>`);
    }

    if (!blocks.length && !missing.length) return null;

    const missingNote = missing.length
      ? `<p class="muted-note">No observed co-occurrences yet for: ${escHtml(missing.join(", "))}.</p>`
      : "";

    return {
      title: "Ego Networks",
      html: `${blocks.join("\n")}${missingNote}`,
    };
  }

  // ── Export ──────────────────────────────────────────────────────────────

  async function handleExport() {
    if (operationId == null) {
      toast.error("Pick an operation first.");
      return;
    }
    if (scope === "target" && targetId == null) {
      toast.error("Pick a target first.");
      return;
    }
    if (scope === "operation" && chosenTargets.length === 0) {
      toast.error("Select at least one target to include.");
      return;
    }

    setIsBuilding(true);
    try {
      const sections: PackageSection[] = [];
      const ego = buildEgoSection();
      if (ego) sections.push(ego);

      if (!sections.length) {
        toast.error("Nothing to export for this selection yet.");
        return;
      }

      const subjectName =
        scope === "target"
          ? (chosenTargets[0]?.name ?? "Target")
          : operationName;
      const meta =
        scope === "target"
          ? `Target Package — ${operationName}`
          : `Operation Package — ${chosenTargets.length} target${chosenTargets.length !== 1 ? "s" : ""}`;

      const html = buildPackageDocument({
        docTitle: `RunLog Intelligence Package — ${subjectName}`,
        coverTitle: "Intelligence Package",
        coverSubject: subjectName,
        coverMeta: meta,
        sections,
      });
      if (!openPrintPreview(html)) {
        toast.error("Pop-up blocked. Please allow pop-ups and try again.");
      }
    } catch {
      toast.error("Couldn't build the package — please try again.");
    } finally {
      setIsBuilding(false);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <span className="text-sm font-semibold text-foreground mr-1">
          Intelligence Packages
        </span>
        <div className="h-5 w-px bg-border shrink-0" />
        <p className="text-xs text-muted-foreground">
          Build a single PDF from the intelligence held on an operation or a
          target.
        </p>
      </div>

      <div className="p-4 max-w-2xl w-full mx-auto flex flex-col gap-5">
        {/* Scope */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Package type
          </p>
          <RadioGroup
            value={scope}
            onValueChange={v => setScope(v as PackageScope)}
            className="gap-2.5"
          >
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <RadioGroupItem value="operation" />
              Operation package — the whole operation
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <RadioGroupItem value="target" />
              Target package — one target only
            </label>
          </RadioGroup>
        </div>

        {/* Operation */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Operation
          </p>
          <Select
            value={operationId != null ? String(operationId) : undefined}
            onValueChange={v => {
              setOperationId(Number(v));
              setTargetId(null);
              setSelectedTargetIds(null);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choose an operation…" />
            </SelectTrigger>
            <SelectContent>
              {(operations ?? []).map(op => (
                <SelectItem key={op.id} value={String(op.id)}>
                  {op.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target selection */}
        {operationId != null && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {scope === "target" ? "Target" : "Targets to include"}
            </p>

            {targetsLoading ? (
              <Skeleton className="h-9 w-full rounded-md" />
            ) : (targets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This operation has no targets yet.
              </p>
            ) : scope === "target" ? (
              <Select
                value={targetId != null ? String(targetId) : undefined}
                onValueChange={v => setTargetId(Number(v))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a target…" />
                </SelectTrigger>
                <SelectContent>
                  {(targets ?? []).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border/60">
                <label className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() =>
                      setSelectedTargetIds(allSelected ? new Set() : null)
                    }
                  />
                  <span className="font-medium">All targets</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {chosenTargets.length} of {(targets ?? []).length}
                  </span>
                </label>
                {(targets ?? []).map(t => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={
                        selectedTargetIds === null ||
                        selectedTargetIds.has(t.id)
                      }
                      onCheckedChange={() => toggleTarget(t.id)}
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contents preview */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Package contents
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li>
              Ego Network — one diagram per included target, that target
              centred
            </li>
          </ul>
        </div>

        <Button
          onClick={handleExport}
          disabled={isBuilding || operationId == null}
          className="gap-2 self-start"
        >
          <FileDown className="w-4 h-4" />
          {isBuilding ? "Building…" : "Export Package"}
        </Button>
      </div>
    </div>
  );
}
