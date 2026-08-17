import { useMemo, useState } from "react";
import { trpc, trpcClient } from "@/lib/trpc";
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
  type PackageSummaryRow,
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
import {
  buildRollupSheetBlocksHtml,
  formatRollupDate,
  type RollupExportRow,
} from "@/lib/rollupSection";
import { buildProfileTargetBlockHtml } from "@/lib/profileSection";
import {
  heatColourFor,
  buildHeatMapImageHtml,
  buildHeatMapLocationsTableHtml,
  fetchHeatMapStaticImage,
} from "@/lib/heatMapSection";
import { buildPatternOfLifeGridsHtml } from "@/lib/patternOfLifeSection";

type PackageScope = "operation" | "target";

type SectionKey = "profile" | "rollup" | "ego" | "heatmap" | "patternOfLife";

/** Display order for both the contents checklist and the built document —
 * profile/context first, then the deployment record, then the analytical
 * reports. */
const SECTION_ORDER: SectionKey[] = [
  "profile",
  "rollup",
  "ego",
  "heatmap",
  "patternOfLife",
];

const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
  profile: "Registered details, photos, sheets and associations",
  rollup: "Every Supervisor Summary in scope",
  ego: "One diagram per included target, that target centred",
  heatmap: "All-time location activity, mapped and ranked",
  patternOfLife: "One time/location report per included target",
};

/** Hops used for every diagram in a package — direct links only. Second-degree
 * rings make each diagram much larger, and a package already carries one per
 * target, so the printed page stays readable at 1 hop. */
const PACKAGE_HOPS = 1 as const;

export default function IntelPackages() {
  const [scope, setScope] = useState<PackageScope>("operation");
  const [operationId, setOperationId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  /** null = every target (the default); a Set = an explicit subset. */
  const [selectedTargetIds, setSelectedTargetIds] =
    useState<Set<number> | null>(null);
  /** Every section is included by default; officers can drop ones they don't
   * need for a particular package. */
  const [enabledSections, setEnabledSections] = useState<Set<SectionKey>>(
    new Set(SECTION_ORDER)
  );
  const [isBuilding, setIsBuilding] = useState(false);

  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const { data: operations } = trpc.operation.list.useQuery();
  const { data: targets, isLoading: targetsLoading } =
    trpc.target.list.useQuery(
      { operationId: operationId ?? 0 },
      { enabled: operationId != null }
    );

  const { data: opProfile } = trpc.intelligence.operationProfile.useQuery(
    { operationId: operationId ?? 0 },
    { enabled: operationId != null, staleTime: 30_000 }
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

  const toggleSection = (key: SectionKey) => {
    setEnabledSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
      // A lone node with nothing around it still produces a valid diagram,
      // but it's a big empty circle taking most of a page — the note alone
      // carries the same information.
      if (layout.placed.length === 0) {
        blocks.push(`<div class="sub-block">
        <p class="sub-head">${escHtml(t.name)}</p>
        <p class="muted-note">No recorded co-occurrences.</p>
      </div>`);
        continue;
      }

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
        <table class="data-table" style="margin-top:10px">
          <thead><tr><th>Entity</th><th style="width:110px">Type</th><th style="width:110px">Co-occurrences</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
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

  /** Target profiles — the same per-target block the Operation Profile
   * export renders, one per included target. */
  function buildProfileSection(): PackageSection | null {
    const byId = new Map(
      ((opProfile?.targets ?? []) as { targetId: number }[]).map(t => [
        t.targetId,
        t,
      ])
    );
    const blocks = chosenTargets
      .map(t => byId.get(t.id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t, i) => {
        const html = buildProfileTargetBlockHtml(t as any);
        // buildProfileTargetBlockHtml deliberately styles inline rather than
        // with classes (see profileSection.ts), so the page break between
        // targets is added here rather than via a shared CSS rule. The
        // first target doesn't need one — the section itself already
        // starts on a fresh page.
        return i === 0
          ? html
          : `<div style="page-break-before:always;break-before:page">${html}</div>`;
      });
    if (!blocks.length) return null;
    return {
      title: scope === "target" ? "Target Profile" : "Operation Profile",
      html: blocks.join("\n"),
    };
  }

  /** Deployment Rollup — every summary in scope, target-filtered for a
   * target package. Uses the same endpoint as the Operation page's own
   * Rollup export so both stay in step. */
  function buildRollupSection(rows: RollupExportRow[]): PackageSection | null {
    if (!rows.length) return null;
    return {
      title: "Deployment Rollup",
      html: buildRollupSheetBlocksHtml(rows),
    };
  }

  /** Heat Map — one map for the whole scope (the operation, or the single
   * target of a target package), over every sheet rather than a rolling
   * window: a package is a point-in-time record of everything held, not a
   * "last 30 days" view. */
  async function buildHeatMapSection(
    locations: { label: string; count: number; lat: number; lng: number }[]
  ): Promise<PackageSection | null> {
    if (!locations.length) return null;

    const maxCount = Math.max(1, ...locations.map(l => l.count));
    const mapImageDataUrl = await fetchHeatMapStaticImage(locations, maxCount);
    const rows = locations.map(l => ({
      label: l.label,
      count: l.count,
      colour: heatColourFor(l.count, maxCount),
    }));

    return {
      title: "Heat Map",
      html: `<div class="section">
        <div class="section-title">Map</div>
        <div class="section-body">${buildHeatMapImageHtml(mapImageDataUrl)}</div>
      </div>
      <div class="section">
        <div class="section-title">Top Locations</div>
        <div class="section-body">${buildHeatMapLocationsTableHtml(rows)}</div>
      </div>`,
    };
  }

  /** Pattern of Life — one report per included target, same as Ego Network.
   * Unlike the other sections this needs its own server round-trip per
   * target (the association graph and rollup are already fetched whole), so
   * it's only called when the section is actually enabled. */
  async function buildPatternOfLifeSection(): Promise<PackageSection | null> {
    if (!chosenTargets.length || operationId == null) return null;

    const results = await Promise.all(
      chosenTargets.map(t =>
        trpcClient.intelligence.getPatternOfLife.query({
          operationId: operationId!,
          targetId: t.id,
        })
      )
    );

    const blocks: string[] = [];
    const missing: string[] = [];
    chosenTargets.forEach((t, i) => {
      const data = results[i];
      if (!data.sufficientData) {
        missing.push(t.name);
        return;
      }
      blocks.push(`<div class="sub-block">
        <p class="sub-head">${escHtml(t.name)}</p>
        ${buildPatternOfLifeGridsHtml(data)}
      </div>`);
    });

    if (!blocks.length && !missing.length) return null;

    const missingNote = missing.length
      ? `<p class="muted-note">Not enough certified observations yet for: ${escHtml(missing.join(", "))}.</p>`
      : "";

    return {
      title: "Pattern of Life",
      html: `${blocks.join("\n")}${missingNote}`,
    };
  }

  /** Cover-page figures, built from the same data the sections render so the
   * two can't drift. */
  function buildSummaryRows(
    rollupRows: RollupExportRow[],
    heatLocations: { count: number }[]
  ): PackageSummaryRow[] {
    const ymd = (r: RollupExportRow) =>
      r.sheetDate ?? new Date(r.createdAt).toISOString().slice(0, 10);
    const sorted = [...rollupRows].sort((a, b) => ymd(a).localeCompare(ymd(b)));
    const period = sorted.length
      ? sorted.length === 1 || ymd(sorted[0]) === ymd(sorted[sorted.length - 1])
        ? formatRollupDate(sorted[0].sheetDate, sorted[0].createdAt)
        : `${formatRollupDate(sorted[0].sheetDate, sorted[0].createdAt)} to ${formatRollupDate(
            sorted[sorted.length - 1].sheetDate,
            sorted[sorted.length - 1].createdAt
          )}`
      : "—";

    const totalTargets = (targets ?? []).length;
    const names = chosenTargets.map(t => t.name).join("; ");
    // Only say "all"/"n of m" when there was actually a choice to make —
    // "All 1 — <name>" reads as noise on a single-target operation.
    const targetsValue =
      scope === "target"
        ? (chosenTargets[0]?.name ?? "—")
        : totalTargets <= 1
          ? names || "—"
          : chosenTargets.length === totalTargets
            ? `All ${totalTargets} — ${names}`
            : `${chosenTargets.length} of ${totalTargets} — ${names}`;

    const linkedTargets = chosenTargets.filter(t => {
      const n = nodeByTargetId.get(t.id);
      return n && (adjacency.get(n.id)?.length ?? 0) > 0;
    }).length;

    const observations = rollupRows.reduce((n, r) => n + r.entries.length, 0);

    return [
      {
        label: "Package type",
        value: scope === "target" ? "Target package" : "Operation package",
      },
      { label: "Operation", value: operationName || "—" },
      { label: scope === "target" ? "Target" : "Targets", value: targetsValue },
      { label: "Running sheets", value: String(rollupRows.length) },
      { label: "Period covered", value: period },
      { label: "Logged observations", value: String(observations) },
      { label: "Locations mapped", value: String(heatLocations.length) },
      { label: "Ego diagrams", value: String(linkedTargets) },
    ];
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
    if (enabledSections.size === 0) {
      toast.error("Select at least one section to include.");
      return;
    }

    setIsBuilding(true);
    try {
      const scopedTargetId = scope === "target" ? targetId : null;
      const [rollupRows, heatLocations] = await Promise.all([
        trpcClient.summary.exportRollup.query({
          operationId: operationId!,
          targetId: scopedTargetId,
        }),
        trpcClient.intelligence.getHeatMapLocations.query({
          operationId: operationId!,
          targetId: scopedTargetId,
          when: { mode: "all" },
        }),
      ]);

      const sections: PackageSection[] = [];

      if (enabledSections.has("profile")) {
        const profile = buildProfileSection();
        if (profile) sections.push(profile);
      }

      if (enabledSections.has("rollup")) {
        const rollup = buildRollupSection(rollupRows);
        if (rollup) sections.push(rollup);
      }

      if (enabledSections.has("ego")) {
        const ego = buildEgoSection();
        if (ego) sections.push(ego);
      }

      if (enabledSections.has("heatmap")) {
        const heat = await buildHeatMapSection(heatLocations);
        if (heat) sections.push(heat);
      }

      if (enabledSections.has("patternOfLife")) {
        const pol = await buildPatternOfLifeSection();
        if (pol) sections.push(pol);
      }

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
        summaryRows: buildSummaryRows(rollupRows, heatLocations),
        preparedBy: me?.name
          ? `${me.name}${me.cin ? ` (CIN ${me.cin})` : ""}`
          : null,
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

        {/* Contents — selectable so a package can be tailored to what's
            actually needed rather than always carrying everything. */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Package contents
          </p>
          <div className="rounded-lg border border-border divide-y divide-border/60">
            {SECTION_ORDER.map(key => (
              <label
                key={key}
                className="flex items-start gap-2.5 px-3 py-2 text-sm cursor-pointer"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={enabledSections.has(key)}
                  onCheckedChange={() => toggleSection(key)}
                />
                <div className="min-w-0">
                  <div className="font-medium">
                    {key === "profile"
                      ? scope === "target"
                        ? "Target Profile"
                        : "Operation Profile"
                      : key === "rollup"
                        ? "Deployment Rollup"
                        : key === "ego"
                          ? "Ego Network"
                          : key === "heatmap"
                            ? "Heat Map"
                            : "Pattern of Life"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {SECTION_DESCRIPTIONS[key]}
                  </div>
                </div>
              </label>
            ))}
          </div>
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
