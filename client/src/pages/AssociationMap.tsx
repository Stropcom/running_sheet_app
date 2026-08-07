import { useCallback, useEffect, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ForceGraph2D from "react-force-graph-2d";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  ChevronRight,
  Target,
  User,
  Car,
  MapPin,
  Building2,
  HelpCircle,
} from "lucide-react";

// ── Colour palette ────────────────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
  target:   "#ef4444",
  person:   "#3b82f6",
  vehicle:  "#f97316",
  address:  "#22c55e",
  business: "#a855f7",
  unknown:  "#94a3b8",
};

const NODE_ICONS: Record<string, React.ReactNode> = {
  target:   <Target className="w-3.5 h-3.5" />,
  person:   <User className="w-3.5 h-3.5" />,
  vehicle:  <Car className="w-3.5 h-3.5" />,
  address:  <MapPin className="w-3.5 h-3.5" />,
  business: <Building2 className="w-3.5 h-3.5" />,
  unknown:  <HelpCircle className="w-3.5 h-3.5" />,
};

const ENTITY_TYPES = ["target", "person", "vehicle", "address", "business"] as const;
const ENTITY_LABELS: Record<string, string> = {
  target: "Targets", person: "Associates", vehicle: "Vehicles",
  address: "Addresses", business: "Businesses",
};

type AssocNode = {
  id: string; label: string;
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number; operationIds: number[]; operationNames: string[];
  // force-graph internal
  x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number;
};

type AssocEdge = { source: string | AssocNode; target: string | AssocNode; weight: number };

export default function AssociationMap() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  // Label bounding boxes already drawn this frame — reset each frame via
  // onRenderFramePre, checked in paintNode so overlapping labels don't pile
  // into an unreadable stack when the graph is dense.
  const labelRectsRef = useRef<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const resetLabelRects = useCallback(() => {
    labelRectsRef.current = [];
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [selectedOpIds, setSelectedOpIds] = useState<number[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    new Set(ENTITY_TYPES)
  );
  const [minConnections, setMinConnections] = useState(0);

  // ── Selected node ─────────────────────────────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<AssocNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightEdges, setHighlightEdges] = useState<Set<string>>(new Set());

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: operations } = trpc.operation.list.useQuery();
  const { data: graphData, isLoading, refetch } = trpc.intelligence.getAssociationGraph.useQuery(
    { operationIds: selectedOpIds.length > 0 ? selectedOpIds : undefined },
    { staleTime: 30_000 }
  );

  // ── Responsive canvas size ─────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Build filtered graph data ──────────────────────────────────────────────
  const { nodes, links, connectionCount } = (() => {
    if (!graphData) return { nodes: [], links: [], connectionCount: new Map<string, number>() };

    // Count connections per node
    const connCount = new Map<string, number>();
    for (const e of graphData.edges) {
      const s = typeof e.source === "string" ? e.source : (e.source as AssocNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as AssocNode).id;
      connCount.set(s, (connCount.get(s) ?? 0) + 1);
      connCount.set(t, (connCount.get(t) ?? 0) + 1);
    }

    // Filter nodes by type and min connections
    const filteredNodeIds = new Set(
      graphData.nodes
        .filter((n) => enabledTypes.has(n.type) && (minConnections === 0 || (connCount.get(n.id) ?? 0) >= minConnections))
        .map((n) => n.id)
    );

    // Sorted by occurrence count descending — nodes are painted in this
    // order, and the label collision check (see paintNode) lets earlier
    // (busier) nodes' labels win, so the most relevant labels are the ones
    // that stay visible when the graph is dense.
    const filteredNodes = graphData.nodes
      .filter((n) => filteredNodeIds.has(n.id))
      .sort((a, b) => b.occurrences - a.occurrences);

    // Only include edges where both endpoints are in filtered set
    const filteredLinks = graphData.edges.filter((e) => {
      const s = typeof e.source === "string" ? e.source : (e.source as AssocNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as AssocNode).id;
      return filteredNodeIds.has(s) && filteredNodeIds.has(t);
    });

    return { nodes: filteredNodes, links: filteredLinks, connectionCount: connCount };
  })();

  // ── Node click handler ────────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: AssocNode) => {
    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
      setHighlightNodes(new Set());
      setHighlightEdges(new Set());
      return;
    }
    setSelectedNode(node);
    const connectedIds = new Set<string>([node.id]);
    const edgeKeys = new Set<string>();
    for (const link of links) {
      const s = typeof link.source === "string" ? link.source : (link.source as AssocNode).id;
      const t = typeof link.target === "string" ? link.target : (link.target as AssocNode).id;
      if (s === node.id || t === node.id) {
        connectedIds.add(s);
        connectedIds.add(t);
        edgeKeys.add(`${s}|||${t}`);
        edgeKeys.add(`${t}|||${s}`);
      }
    }
    setHighlightNodes(connectedIds);
    setHighlightEdges(edgeKeys);
  }, [selectedNode, links]);

  // ── Background click to deselect ──────────────────────────────────────────
  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightEdges(new Set());
  }, []);

  // force-graph auto-zooms to fit the settled node positions once the
  // simulation cools — for a small/sparse graph (few nodes, so they settle
  // close together) that fit can land on a very high zoom factor, which
  // blows up both the nodes and their now-proportionally-scaled labels well
  // past a readable size. Clamp back down to a sane maximum right after the
  // engine stops, rather than fighting a zoom the user picked themselves.
  const MAX_AUTO_ZOOM = 2.2;
  const handleEngineStop = useCallback(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const currentZoom = fg.zoom();
    if (currentZoom > MAX_AUTO_ZOOM) {
      fg.zoom(MAX_AUTO_ZOOM, 0);
    }
  }, []);

  // ── Node paint ────────────────────────────────────────────────────────────
  const paintNode = useCallback((node: AssocNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const baseRadius = Math.max(4, Math.min(12, 4 + Math.log1p(node.occurrences) * 2));
    const radius = isSelected ? baseRadius * 1.4 : baseRadius;
    const color = NODE_COLORS[node.type] ?? NODE_COLORS.unknown;
    const alpha = isHighlighted ? 1 : 0.15;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow for selected/highlighted
    if (isSelected || (highlightNodes.size > 0 && highlightNodes.has(node.id) && node.id !== selectedNode?.id)) {
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius * 2, 0, 2 * Math.PI);
      ctx.fillStyle = color + "33";
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // White border for selected
    if (isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }
    ctx.restore();

    // Label — sized in plain world units (no `/globalScale`) so it scales
    // down together with the node radius when zoomed out, instead of
    // staying a constant screen size while the nodes shrink underneath it.
    // The old `10 / globalScale` formula did the opposite — it held text at
    // a fixed ~10px on screen regardless of zoom, so at the initial
    // zoomed-to-fit view (where nodes render small) the text towered over
    // the nodes and every label collided with its neighbours. Skipped
    // entirely if it would overlap a label an earlier (busier) node already
    // drew this frame — see labelRectsRef — as a backstop for genuinely
    // dense clusters even at a single zoom level.
    ctx.save();
    ctx.globalAlpha = isHighlighted ? 1 : 0.15;
    const fontSize = isSelected ? 5 : 4;
    ctx.font = `${isSelected ? "bold " : ""}${fontSize}px sans-serif`;
    const label = node.label.length > 16 ? node.label.slice(0, 15) + "…" : node.label;
    const textWidth = ctx.measureText(label).width;
    const padX = 1.5;
    const padY = 0.75;
    const labelY = node.y! + radius + 1.5;
    const rect = {
      x1: node.x! - textWidth / 2 - padX,
      y1: labelY - padY,
      x2: node.x! + textWidth / 2 + padX,
      y2: labelY + fontSize + padY,
    };
    const collides = labelRectsRef.current.some(
      (r) => rect.x1 < r.x2 && rect.x2 > r.x1 && rect.y1 < r.y2 && rect.y2 > r.y1
    );
    if (!collides || isSelected) {
      labelRectsRef.current.push(rect);

      // Background pill so text stays legible over links/other nodes
      const rr = Math.min(1, (rect.x2 - rect.x1) / 2);
      ctx.fillStyle = "rgba(15,17,23,0.78)";
      ctx.beginPath();
      ctx.moveTo(rect.x1 + rr, rect.y1);
      ctx.arcTo(rect.x2, rect.y1, rect.x2, rect.y2, rr);
      ctx.arcTo(rect.x2, rect.y2, rect.x1, rect.y2, rr);
      ctx.arcTo(rect.x1, rect.y2, rect.x1, rect.y1, rr);
      ctx.arcTo(rect.x1, rect.y1, rect.x2, rect.y1, rr);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isHighlighted ? "#ffffff" : "#94a3b8";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, node.x!, labelY);
    }
    ctx.restore();
  }, [highlightNodes, selectedNode]);

  // ── Link paint ────────────────────────────────────────────────────────────
  const paintLink = useCallback((link: AssocEdge, ctx: CanvasRenderingContext2D) => {
    const sourceNode = typeof link.source === "string" ? null : (link.source as AssocNode);
    const targetNode = typeof link.target === "string" ? null : (link.target as AssocNode);
    if (!sourceNode || !targetNode) return;
    if (sourceNode.x == null || sourceNode.y == null || targetNode.x == null || targetNode.y == null) return;

    const edgeKey1 = `${sourceNode.id}|||${targetNode.id}`;
    const edgeKey2 = `${targetNode.id}|||${sourceNode.id}`;
    const isHighlighted = highlightEdges.size === 0 || highlightEdges.has(edgeKey1) || highlightEdges.has(edgeKey2);

    ctx.save();
    ctx.globalAlpha = isHighlighted ? Math.min(0.9, 0.2 + link.weight * 0.15) : 0.05;
    ctx.strokeStyle = isHighlighted ? "#94a3b8" : "#475569";
    ctx.lineWidth = Math.max(0.5, Math.min(4, link.weight * 0.8));
    ctx.beginPath();
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);
    ctx.stroke();
    ctx.restore();
  }, [highlightEdges]);

  // ── Connected nodes for detail panel ─────────────────────────────────────
  const connectedNodes = selectedNode
    ? links
        .map((l) => {
          const s = typeof l.source === "string" ? l.source : (l.source as AssocNode).id;
          const t = typeof l.target === "string" ? l.target : (l.target as AssocNode).id;
          const weight = l.weight;
          if (s === selectedNode.id) return { id: t, weight };
          if (t === selectedNode.id) return { id: s, weight };
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => (b!.weight - a!.weight))
        .map((c) => ({
          node: nodes.find((n) => n.id === c!.id),
          weight: c!.weight,
        }))
        .filter((c) => c.node)
    : [];

  const toggleOp = (id: number) =>
    setSelectedOpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleType = (t: string) =>
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  return (
    <div className="flex flex-col h-full">
      {/* ── Top filter bar ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <span className="text-sm font-semibold text-foreground mr-1">Association Map</span>
          {/* Plain divider, not Separator — its h-full default beats a "h-5"
              override once this bar wraps to multiple lines (see the same
              note in EgoNetworkMap.tsx for the full explanation). */}
          <div className="h-5 w-px bg-border shrink-0" />

          {/* Entity type toggles */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ENTITY_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                  enabledTypes.has(t)
                    ? "border-current opacity-100"
                    : "opacity-30 border-border"
                }`}
                style={{ color: NODE_COLORS[t], borderColor: enabledTypes.has(t) ? NODE_COLORS[t] : undefined }}
              >
                {ENTITY_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border shrink-0" />

          {/* Min connections */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Min links:</span>
            <input
              type="range" min={0} max={10} value={minConnections}
              onChange={(e) => setMinConnections(Number(e.target.value))}
              className="w-20 accent-primary"
            />
            <span className="w-4 text-center font-mono">{minConnections}</span>
          </div>

          <div className="h-5 w-px bg-border shrink-0" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-auto">
            <Button size="icon" variant="ghost" className="w-7 h-7"
              onClick={() => graphRef.current?.zoom(1.5, 300)}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7"
              onClick={() => graphRef.current?.zoom(0.67, 300)}>
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7"
              onClick={() => graphRef.current?.zoomToFit(400, 40)}>
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7"
              onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Left sidebar — operation filter ──────────────────────────── */}
          <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operations</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedOpIds.length === 0 ? "All operations" : `${selectedOpIds.length} selected`}
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                <button
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors ${
                    selectedOpIds.length === 0
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent/30"
                  }`}
                  onClick={() => setSelectedOpIds([])}
                >
                  All Operations
                </button>
                {operations?.map((op) => (
                  <button
                    key={op.id}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                      selectedOpIds.includes(op.id)
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-muted-foreground hover:bg-accent/30"
                    }`}
                    onClick={() => toggleOp(op.id)}
                  >
                    <Checkbox
                      checked={selectedOpIds.includes(op.id)}
                      className="w-3 h-3 shrink-0"
                      onCheckedChange={() => toggleOp(op.id)}
                    />
                    <span className="truncate">{op.name}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>

            {/* Legend */}
            <div className="border-t border-border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Legend</p>
              {ENTITY_TYPES.map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NODE_COLORS[t] }} />
                  {ENTITY_LABELS[t]}
                </div>
              ))}
              <div className="mt-2 text-xs text-muted-foreground/60">
                Thicker lines = more co-occurrences
              </div>
            </div>
          </div>

          {/* ── Graph canvas ─────────────────────────────────────────────── */}
          <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0f1117]">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            )}
            {!isLoading && nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <p className="text-sm">No entities found for the selected filters.</p>
                <p className="text-xs">Try selecting different operations or lowering the minimum links.</p>
              </div>
            )}
            {!isLoading && nodes.length > 0 && (
              <ForceGraph2D
                ref={graphRef}
                width={dimensions.w}
                height={dimensions.h}
                graphData={{ nodes: nodes as AssocNode[], links }}
                nodeId="id"
                nodeLabel={(n) => {
                  const node = n as AssocNode;
                  return `${node.label}\n${ENTITY_LABELS[node.type] ?? node.type} — ${node.occurrences} occurrence${node.occurrences !== 1 ? "s" : ""}`;
                }}
                nodeCanvasObject={paintNode as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
                nodeCanvasObjectMode={() => "replace"}
                linkCanvasObjectMode={() => "replace"}
                linkCanvasObject={paintLink as (link: object, ctx: CanvasRenderingContext2D) => void}
                onNodeClick={handleNodeClick as (node: object) => void}
                onBackgroundClick={handleBackgroundClick}
                onEngineStop={handleEngineStop}
                onRenderFramePre={resetLabelRects}
                linkDirectionalParticles={0}
                cooldownTicks={120}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                backgroundColor="#0f1117"
              />
            )}

            {/* Stats overlay */}
            {!isLoading && nodes.length > 0 && (
              <div className="absolute bottom-3 left-3 text-xs text-slate-500 pointer-events-none">
                {nodes.length} nodes · {links.length} connections
                {selectedOpIds.length > 0 && ` · ${selectedOpIds.length} operation${selectedOpIds.length !== 1 ? "s" : ""}`}
              </div>
            )}
          </div>

          {/* ── Right detail panel ───────────────────────────────────────── */}
          {selectedNode && (
            <div className="w-64 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
              <div className="flex items-start justify-between px-3 py-3 border-b border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span style={{ color: NODE_COLORS[selectedNode.type] }}>
                      {NODE_ICONS[selectedNode.type]}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: NODE_COLORS[selectedNode.type] }}>
                      {ENTITY_LABELS[selectedNode.type] ?? selectedNode.type}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-foreground leading-tight break-words">
                    {selectedNode.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedNode.occurrences} occurrence{selectedNode.occurrences !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="w-6 h-6 shrink-0 ml-2"
                  onClick={() => { setSelectedNode(null); setHighlightNodes(new Set()); setHighlightEdges(new Set()); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Operations */}
              {selectedNode.operationNames.length > 0 && (
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Operations</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.operationNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-xs px-1.5 py-0.5">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Connections */}
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Connections ({connectedNodes.length})
                </p>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-0.5">
                  {connectedNodes.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1 py-2">No connections in current view.</p>
                  )}
                  {connectedNodes.map(({ node, weight }, i) => (
                    <button
                      key={i}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/30 transition-colors"
                      onClick={() => node && handleNodeClick(node)}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: NODE_COLORS[node!.type] ?? NODE_COLORS.unknown }} />
                      <span className="flex-1 min-w-0 text-xs text-foreground truncate">{node!.label}</span>
                      <span className="text-xs text-muted-foreground shrink-0 font-mono">{weight}×</span>
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
