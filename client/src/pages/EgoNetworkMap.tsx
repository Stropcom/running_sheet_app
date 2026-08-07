import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Search,
  Target,
  User,
  Car,
  MapPin,
  Building2,
  HelpCircle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

// Same palette/labels as the Association Map — the two views show the same
// entities, so a target has to read as the same colour in both.
const NODE_COLORS: Record<string, string> = {
  target: "#ef4444",
  person: "#3b82f6",
  vehicle: "#f97316",
  address: "#22c55e",
  business: "#a855f7",
  unknown: "#94a3b8",
};

const NODE_ICONS: Record<string, React.ReactNode> = {
  target: <Target className="w-3.5 h-3.5" />,
  person: <User className="w-3.5 h-3.5" />,
  vehicle: <Car className="w-3.5 h-3.5" />,
  address: <MapPin className="w-3.5 h-3.5" />,
  business: <Building2 className="w-3.5 h-3.5" />,
  unknown: <HelpCircle className="w-3.5 h-3.5" />,
};

const ENTITY_TYPES = [
  "target",
  "person",
  "vehicle",
  "address",
  "business",
] as const;

const ENTITY_LABELS: Record<string, string> = {
  target: "Targets",
  person: "Associates",
  vehicle: "Vehicles",
  address: "Addresses",
  business: "Businesses",
};

type EgoNode = {
  id: string;
  label: string;
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number;
  operationIds: number[];
  operationNames: string[];
};

type EgoEdge = {
  source: string | EgoNode;
  target: string | EgoNode;
  weight: number;
};

/** Ring 1 holds at most this many entities before the rest collapse behind a
 * "+N more" chip — past roughly this count the ring stops being readable. */
const RING1_MAX = 12;
/** Ring 2 is denser by nature (every ring-1 entity brings its own), so it
 * truncates harder. */
const RING2_MAX = 18;

const RING1_RADIUS = 165;
const RING2_RADIUS = 290;

interface PlacedNode {
  node: EgoNode;
  x: number;
  y: number;
  hop: 1 | 2;
  /** Weight of the edge back toward the centre (hop 1) or toward its ring-1 parent (hop 2). */
  weight: number;
}

function edgeEnds(e: EgoEdge): [string, string] {
  const s = typeof e.source === "string" ? e.source : e.source.id;
  const t = typeof e.target === "string" ? e.target : e.target.id;
  return [s, t];
}

export default function EgoNetworkMap() {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hops, setHops] = useState<1 | 2>(1);
  const [pickerSearch, setPickerSearch] = useState("");
  const [expandRing1, setExpandRing1] = useState(false);
  // null = every operation. Scoping here narrows the whole view at once —
  // the graph, the focus-entity list, and the rings all come off this query.
  const [operationId, setOperationId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const { data: operations } = trpc.operation.list.useQuery();

  const {
    data: graphData,
    isLoading,
    refetch,
  } = trpc.intelligence.getAssociationGraph.useQuery(
    { operationIds: operationId != null ? [operationId] : undefined },
    { staleTime: 30_000 }
  );

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const nodesById = useMemo(() => {
    const m = new Map<string, EgoNode>();
    for (const n of (graphData?.nodes ?? []) as EgoNode[]) m.set(n.id, n);
    return m;
  }, [graphData]);

  /** id -> [{ otherId, weight }] adjacency, built once per graph load. */
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

  // Default the focus to the best-connected entity so the view isn't empty
  // on first open — the officer can pick a different one from the list.
  // This also re-picks when the operation filter changes and the entity
  // currently in focus isn't part of the newly-scoped graph, rather than
  // leaving the canvas blank on a focus that no longer exists.
  useEffect(() => {
    if (!graphData?.nodes?.length) return;
    if (focusId && nodesById.has(focusId)) return;
    let best: string | null = null;
    let bestCount = -1;
    for (const n of graphData.nodes as EgoNode[]) {
      const c = adjacency.get(n.id)?.length ?? 0;
      if (c > bestCount) {
        bestCount = c;
        best = n.id;
      }
    }
    setFocusId(best);
  }, [graphData, adjacency, nodesById, focusId]);

  useEffect(() => {
    setExpandRing1(false);
  }, [focusId, hops]);

  const focusNode = focusId ? (nodesById.get(focusId) ?? null) : null;

  /**
   * Concentric-ring layout. Ring 1 is the focus entity's direct
   * co-occurrences, spaced evenly around it. Ring 2 (when 2 hops are shown)
   * is everything one step further out, placed near the angle of whichever
   * ring-1 entity introduced it — so a cluster stays visually attached to
   * its parent instead of scattering.
   */
  const { placed, ring1Ids, hiddenRing1Count, hiddenRing2Count, edges } =
    useMemo(() => {
      if (!focusNode) {
        return {
          placed: [] as PlacedNode[],
          ring1Ids: [] as string[],
          hiddenRing1Count: 0,
          hiddenRing2Count: 0,
          edges: [] as {
            from: PlacedNode | null;
            to: PlacedNode;
            hop: 1 | 2;
          }[],
        };
      }

      const ring1All = adjacency.get(focusNode.id) ?? [];
      const ring1Limit = expandRing1 ? ring1All.length : RING1_MAX;
      const ring1 = ring1All.slice(0, ring1Limit);
      const hidden1 = ring1All.length - ring1.length;

      const seen = new Set<string>([focusNode.id, ...ring1.map(r => r.id)]);
      const placedNodes: PlacedNode[] = [];
      const angleOf = new Map<string, number>();

      ring1.forEach((entry, i) => {
        const angle =
          (i / Math.max(1, ring1.length)) * Math.PI * 2 - Math.PI / 2;
        angleOf.set(entry.id, angle);
        const node = nodesById.get(entry.id);
        if (!node) return;
        placedNodes.push({
          node,
          x: Math.cos(angle) * RING1_RADIUS,
          y: Math.sin(angle) * RING1_RADIUS,
          hop: 1,
          weight: entry.weight,
        });
      });

      let hidden2 = 0;
      const ring2Parent = new Map<string, string>();
      if (hops === 2) {
        const candidates: { id: string; parent: string; weight: number }[] = [];
        for (const parent of ring1) {
          for (const nb of adjacency.get(parent.id) ?? []) {
            if (seen.has(nb.id)) continue;
            seen.add(nb.id);
            candidates.push({
              id: nb.id,
              parent: parent.id,
              weight: nb.weight,
            });
          }
        }
        candidates.sort((a, b) => b.weight - a.weight);
        const shown = candidates.slice(0, RING2_MAX);
        hidden2 = candidates.length - shown.length;

        // Fan each parent's children out around that parent's own angle.
        const byParent = new Map<string, typeof shown>();
        for (const c of shown) {
          if (!byParent.has(c.parent)) byParent.set(c.parent, []);
          byParent.get(c.parent)!.push(c);
        }
        for (const [parentId, kids] of Array.from(byParent.entries())) {
          const base = angleOf.get(parentId) ?? 0;
          const spread = Math.min(0.9, 0.28 * kids.length);
          kids.forEach((kid, i) => {
            const offset =
              kids.length === 1
                ? 0
                : -spread / 2 + (i / (kids.length - 1)) * spread;
            const angle = base + offset;
            const node = nodesById.get(kid.id);
            if (!node) return;
            ring2Parent.set(kid.id, parentId);
            placedNodes.push({
              node,
              x: Math.cos(angle) * RING2_RADIUS,
              y: Math.sin(angle) * RING2_RADIUS,
              hop: 2,
              weight: kid.weight,
            });
          });
        }
      }

      const byId = new Map(placedNodes.map(p => [p.node.id, p]));
      const edgeList: {
        from: PlacedNode | null;
        to: PlacedNode;
        hop: 1 | 2;
      }[] = [];
      for (const p of placedNodes) {
        if (p.hop === 1) {
          edgeList.push({ from: null, to: p, hop: 1 });
        } else {
          const parentId = ring2Parent.get(p.node.id);
          const parent = parentId ? (byId.get(parentId) ?? null) : null;
          if (parent) edgeList.push({ from: parent, to: p, hop: 2 });
        }
      }

      return {
        placed: placedNodes,
        ring1Ids: ring1.map(r => r.id),
        hiddenRing1Count: hidden1,
        hiddenRing2Count: hidden2,
        edges: edgeList,
      };
    }, [focusNode, adjacency, nodesById, hops, expandRing1]);

  const cx = size.w / 2;
  const cy = size.h / 2;

  const pickerResults = useMemo(() => {
    const all = (graphData?.nodes ?? []) as EgoNode[];
    const q = pickerSearch.trim().toLowerCase();
    const filtered = q
      ? all.filter(n => n.label.toLowerCase().includes(q))
      : all;
    return [...filtered]
      .sort(
        (a, b) =>
          (adjacency.get(b.id)?.length ?? 0) -
          (adjacency.get(a.id)?.length ?? 0)
      )
      .slice(0, 60);
  }, [graphData, pickerSearch, adjacency]);

  const ring1Placed = placed.filter(p => p.hop === 1);

  const recenter = useCallback((id: string) => setFocusId(id), []);

  const radiusFor = (n: EgoNode, hop: 1 | 2) => {
    const base = Math.max(5, Math.min(11, 4 + Math.log1p(n.occurrences) * 2));
    return hop === 1 ? base : base * 0.72;
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <span className="text-sm font-semibold text-foreground mr-1">
          Ego Network
        </span>
        <Separator orientation="vertical" className="h-5" />

        <Select
          value={operationId != null ? String(operationId) : "all"}
          onValueChange={v => setOperationId(v === "all" ? null : Number(v))}
        >
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All operations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All operations</SelectItem>
            {(operations ?? []).map(op => (
              <SelectItem key={op.id} value={String(op.id)}>
                {op.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Focus:</span>
          <span className="font-semibold text-foreground">
            {focusNode ? focusNode.label : "—"}
          </span>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Hop depth */}
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {([1, 2] as const).map(h => (
            <button
              key={h}
              onClick={() => setHops(h)}
              className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                hops === h
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/30"
              }`}
            >
              {h} hop{h > 1 ? "s" : ""}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: focus entity picker ──────────────────────────────────── */}
        <div className="w-56 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Focus entity
            </p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="Search entities…"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {pickerResults.length === 0 && (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  No entities match that search.
                </p>
              )}
              {pickerResults.map(n => (
                <button
                  key={n.id}
                  onClick={() => recenter(n.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                    n.id === focusId
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent/30"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: NODE_COLORS[n.type] ?? NODE_COLORS.unknown,
                    }}
                  />
                  <span className="flex-1 min-w-0 text-xs truncate">
                    {n.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    {adjacency.get(n.id)?.length ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t border-border p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Legend
            </p>
            {ENTITY_TYPES.map(t => (
              <div
                key={t}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: NODE_COLORS[t] }}
                />
                {ENTITY_LABELS[t]}
              </div>
            ))}
            <div className="mt-2 text-xs text-muted-foreground/60">
              Inner ring = direct links. Outer ring = one step further.
            </div>
          </div>
        </div>

        {/* ── Ring canvas ─────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-[#0f1117]"
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          )}

          {!isLoading && !focusNode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <p className="text-sm">No entities available.</p>
              <p className="text-xs">
                Pick a focus entity from the list once observations have been
                logged.
              </p>
            </div>
          )}

          {!isLoading && focusNode && (
            <>
              <svg width={size.w} height={size.h} className="absolute inset-0">
                {/* Hop-distance guides */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={RING1_RADIUS}
                  fill="none"
                  stroke="#262b36"
                  strokeDasharray="4 4"
                />
                {hops === 2 && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={RING2_RADIUS}
                    fill="none"
                    stroke="#262b36"
                    strokeDasharray="4 4"
                  />
                )}

                {/* Edges */}
                {edges.map((e, i) => {
                  const x1 = e.from ? cx + e.from.x : cx;
                  const y1 = e.from ? cy + e.from.y : cy;
                  const x2 = cx + e.to.x;
                  const y2 = cy + e.to.y;
                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={e.hop === 1 ? "#cbd5e1" : "#3f4653"}
                      strokeWidth={
                        e.hop === 1
                          ? Math.max(1, Math.min(4, e.to.weight * 0.9))
                          : 1.2
                      }
                      strokeOpacity={e.hop === 1 ? 0.85 : 0.5}
                    />
                  );
                })}

                {/* Centre glow */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={30}
                  fill={NODE_COLORS[focusNode.type] ?? NODE_COLORS.unknown}
                  fillOpacity={0.16}
                />
              </svg>

              {/* Centre node */}
              <div
                className="absolute flex flex-col items-center gap-1.5 pointer-events-none"
                style={{
                  left: cx,
                  top: cy,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: 44,
                    height: 44,
                    background:
                      NODE_COLORS[focusNode.type] ?? NODE_COLORS.unknown,
                  }}
                />
                <span className="text-xs font-bold text-white bg-[#0f1117]/80 px-2 py-0.5 rounded whitespace-nowrap max-w-[220px] truncate">
                  {focusNode.label}
                </span>
              </div>

              {/* Ring nodes */}
              {placed.map(p => (
                <button
                  key={p.node.id}
                  onClick={() => recenter(p.node.id)}
                  title={`${p.node.label} — click to focus`}
                  className="absolute flex flex-col items-center gap-1 group"
                  style={{
                    left: cx + p.x,
                    top: cy + p.y,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span
                    className="rounded-full transition-transform group-hover:scale-125"
                    style={{
                      width: radiusFor(p.node, p.hop) * 2,
                      height: radiusFor(p.node, p.hop) * 2,
                      background:
                        NODE_COLORS[p.node.type] ?? NODE_COLORS.unknown,
                      opacity: p.hop === 1 ? 1 : 0.72,
                    }}
                  />
                  <span
                    className={`whitespace-nowrap px-1.5 py-0.5 rounded bg-[#0f1117]/75 max-w-[150px] truncate ${
                      p.hop === 1
                        ? "text-[10.5px] text-slate-200"
                        : "text-[9.5px] text-slate-400"
                    }`}
                  >
                    {p.node.label}
                  </span>
                </button>
              ))}

              {/* "+N more" chip for a crowded inner ring */}
              {hiddenRing1Count > 0 && (
                <button
                  onClick={() => setExpandRing1(true)}
                  className="absolute text-[10px] px-2 py-1 rounded-full border border-dashed border-slate-500 text-slate-300 hover:bg-slate-700/40 transition-colors"
                  style={{
                    left: cx,
                    top: cy + RING1_RADIUS + 34,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  +{hiddenRing1Count} more direct
                </button>
              )}

              {/* Stats overlay */}
              <div className="absolute bottom-3 left-3 text-xs text-slate-500 pointer-events-none">
                {ring1Placed.length} direct
                {hops === 2 &&
                  ` · ${placed.length - ring1Placed.length} second-degree`}
                {hiddenRing2Count > 0 && ` · ${hiddenRing2Count} not shown`}
              </div>
            </>
          )}
        </div>

        {/* ── Right: focus detail ─────────────────────────────────────────── */}
        {focusNode && (
          <div className="w-64 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-3 py-3 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span style={{ color: NODE_COLORS[focusNode.type] }}>
                    {NODE_ICONS[focusNode.type]}
                  </span>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: NODE_COLORS[focusNode.type] }}
                  >
                    {ENTITY_LABELS[focusNode.type] ?? focusNode.type}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground leading-tight break-words">
                  {focusNode.label}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {focusNode.occurrences} occurrence
                  {focusNode.occurrences !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {focusNode.operationNames.length > 0 && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Operations
                </p>
                <div className="flex flex-wrap gap-1">
                  {focusNode.operationNames.map((name, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-xs px-1.5 py-0.5"
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Direct links ({ring1Ids.length + hiddenRing1Count})
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {placed.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1 py-2">
                    This entity has no recorded co-occurrences.
                  </p>
                )}
                {placed.map(p => (
                  <button
                    key={p.node.id}
                    onClick={() => recenter(p.node.id)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/30 transition-colors ${
                      p.hop === 2 ? "opacity-60" : ""
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background:
                          NODE_COLORS[p.node.type] ?? NODE_COLORS.unknown,
                      }}
                    />
                    <span className="flex-1 min-w-0 text-xs text-foreground truncate">
                      {p.node.label}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 font-mono">
                      {p.hop === 1 ? `${p.weight}×` : "2nd"}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
