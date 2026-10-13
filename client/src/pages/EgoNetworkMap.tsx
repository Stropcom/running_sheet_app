import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  NODE_COLORS,
  ENTITY_TYPES,
  ENTITY_LABELS,
  RING1_MAX,
  RING1_RADIUS_MAX,
  RING2_RADIUS_MAX,
  RING_LABEL_MARGIN,
  RING1_RADIUS_MIN,
  RING2_RADIUS_MIN,
  computeEgoLayout,
  egoNodeRadius,
  edgeEnds,
  exportRingRadii,
  buildEgoNetworkSvg,
  escXml,
  type EgoNode,
  type EgoEdge,
  type EgoLayout,
} from "@/lib/egoNetworkLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, RefreshCw, FileDown, Radar } from "lucide-react";
import {
  ROW_ITEM,
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import { FORM_LABEL } from "@/lib/formKit";
import { displayPersonName } from "@/components/ProfileKit";

/** Group headers for the focus-entity dropdown — matches the Intelligence
 * Folder's own tab label ("Locations") rather than ENTITY_LABELS' plural
 * "Addresses", which is used elsewhere (the legend, PDF export). */
const DROPDOWN_GROUP_LABELS: Record<string, string> = {
  ...ENTITY_LABELS,
  address: "Locations",
};

function exportEgoNetworkPdf(params: {
  focusNode: EgoNode;
  layout: EgoLayout;
  radii: { ring1: number; ring2: number };
  hops: 1 | 2;
  operationName: string | null;
}) {
  const { focusNode, layout, radii, hops, operationName } = params;

  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";

  const svg = buildEgoNetworkSvg({ focusNode, layout, radii });
  const ring1 = layout.placed.filter(p => p.hop === 1);
  const ring2 = layout.placed.filter(p => p.hop === 2);

  const linkRows = layout.placed
    .map(
      p =>
        `<tr><td>${escXml(p.node.label)}</td><td>${escXml(ENTITY_LABELS[p.node.type] ?? p.node.type)}</td><td>${p.hop === 1 ? `${p.weight}&times;` : "2nd degree"}</td></tr>`
    )
    .join("");

  const legend = ENTITY_TYPES.map(
    t =>
      `<span class="legend-item"><span class="legend-dot" style="background:${NODE_COLORS[t]}"></span>${escXml(ENTITY_LABELS[t])}</span>`
  ).join("");

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const statsLine = [
    `${ring1.length} direct link${ring1.length !== 1 ? "s" : ""}`,
    hops === 2 ? `${ring2.length} second-degree` : null,
    layout.hiddenRing1Count > 0
      ? `${layout.hiddenRing1Count} direct not shown`
      : null,
    layout.hiddenRing2Count > 0
      ? `${layout.hiddenRing2Count} second-degree not shown`
      : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Ego Network — ${escXml(focusNode.label)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page{ margin:14mm 12mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:22px 32px 20px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:12px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.main-title { font-size:24px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:15px; font-weight:600; margin-top:8px; }
.sheet-name { font-size:11px; opacity:0.7; margin-top:6px; }
.content { padding:18px 32px 8px; }
.section { margin-bottom:14px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:7px 14px; background:${BLUE_LIGHT} !important; border-bottom:1px solid ${GREY_BORDER}; }
.section-body { padding:12px 14px; }
.detail-grid { display:grid; grid-template-columns:130px 1fr; gap:0; font-size:10.5px; }
.detail-grid > div { padding:4px 6px; }
.detail-grid > div:nth-child(4n+1), .detail-grid > div:nth-child(4n+2) { background:#f8fafc; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${GREY_TEXT}; }
.diagram-wrap { padding:4px 10px 10px; }
.stats-line { text-align:center; font-size:10px; color:#64748b; padding-bottom:8px; }
.legend { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; padding:10px 0 2px; border-top:1px solid ${GREY_BORDER}; }
.legend-item { display:inline-flex; align-items:center; gap:6px; font-size:10px; color:#475569; }
.legend-dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
.links-table { width:100%; border-collapse:collapse; border:1.5px solid ${BLUE_DARK}; }
.links-table th { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:6px 8px; border-bottom:2px solid ${BLUE_DARK}; border-right:1px solid #c7d5ee; }
.links-table th:last-child, .links-table td:last-child { border-right:none; }
.links-table td { vertical-align:top; font-size:10.5px; padding:6px 8px; border-bottom:1px solid ${GREY_BORDER}; border-right:1px solid ${GREY_BORDER}; }
.links-table tbody tr:last-child td { border-bottom:none; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
.footer-note { margin:10px 32px 0; padding:12px 0 18px; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
.footer-band { background:${BLUE_DARK} !important; color:#fff !important; padding:8px 32px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .section-title { background:${BLUE_LIGHT} !important; } .links-table th { background:${BLUE_LIGHT} !important; } .footer-band { background:${BLUE_DARK} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Ego Network</div>
  <div class="op-date-line">${escXml(focusNode.label)}</div>
  <div class="sheet-name">${escXml(operationName ?? "All operations")} &middot; ${hops} hop${hops > 1 ? "s" : ""}</div>
</div>
<div class="content">
  <div class="section">
    <div class="section-title">Focus Entity</div>
    <div class="section-body">
      <div class="detail-grid">
        <div class="detail-label">Entity</div><div class="detail-value">${escXml(focusNode.label)}</div>
        <div class="detail-label">Type</div><div class="detail-value">${escXml(ENTITY_LABELS[focusNode.type] ?? focusNode.type)}</div>
        <div class="detail-label">Occurrences</div><div class="detail-value">${focusNode.occurrences}</div>
        <div class="detail-label">Operations</div><div class="detail-value">${escXml(focusNode.operationNames.join(", ") || "—")}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Association Diagram</div>
    <div class="diagram-wrap">
      ${svg}
      <div class="stats-line">${statsLine}</div>
      <div class="legend">${legend}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Linked Entities (${layout.placed.length})</div>
    <div class="section-body">
      ${
        layout.placed.length
          ? `<table class="links-table">
        <thead><tr><th>Entity</th><th style="width:110px">Type</th><th style="width:110px">Co-occurrences</th></tr></thead>
        <tbody>${linkRows}</tbody>
      </table>`
          : `<p class="muted-note">This entity has no recorded co-occurrences.</p>`
      }
    </div>
  </div>

  <div class="footer-note">Generated: ${generatedAt}</div>
</div>
<div class="footer-band"><span></span><span class="footer-protected">Protected</span><span>RunLog</span></div>
${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

/** Below this width the three-column layout (entity list / map / detail
 * panel) has nowhere near enough room — the two fixed-width side panels
 * alone (224px + 256px) already exceed a phone's viewport, so the map ends
 * up with zero space and never renders. Covers phone and iPad portrait;
 * iPad landscape and up keep the normal three-column view. */
const COMPACT_BREAKPOINT = 1024;

function useCompactLayout() {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const onChange = () => setIsCompact(window.innerWidth < COMPACT_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isCompact;
}

export default function EgoNetworkMap({
  initialOperationId = null,
  initialSheetId = null,
}: {
  /** Pre-scopes the view on first render — e.g. a "View on Ego Network"
   * link from a Running Sheet page. Read once via useState's lazy
   * initializer, not kept in sync afterwards: the officer's own dropdown
   * choices should win from that point on, not get silently overwritten
   * by a stale prop if the parent re-renders. */
  initialOperationId?: number | null;
  initialSheetId?: number | null;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hops, setHops] = useState<1 | 2>(1);
  const [expandRing1, setExpandRing1] = useState(false);
  const isCompact = useCompactLayout();
  // Which single panel is shown in compact mode — defaults to the map since
  // that's the point of the page; picking an entity from the dropdown jumps
  // here automatically so the officer isn't left staring at the picker.
  const [mobilePanel, setMobilePanel] = useState<"info" | "map">("map");
  // null = every operation. Scoping here narrows the whole view at once —
  // the graph, the focus-entity list, and the rings all come off this query.
  const [operationId, setOperationId] = useState<number | null>(
    initialOperationId
  );
  // null = every sheet in the scoped operation(s). A running sheet only
  // makes sense to pick once its parent operation is picked — the dropdown
  // that lists them is disabled until then — so this always resets when
  // operationId changes rather than silently scoping to a sheet from a
  // now-deselected operation.
  const [sheetId, setSheetId] = useState<number | null>(initialSheetId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Rings are sized to whatever room the canvas actually has (min of its
  // width/height, both of which are now always equal — see the canvas div
  // below, which is a square: full width, height matching via aspect-square
  // on desktop, or genuinely fills the compact panel). Full-size whenever
  // that's at least RING2_RADIUS_MAX, scaled down together (keeping
  // proportions) only when the canvas is smaller than that — e.g. a narrow
  // phone — so the outermost nodes and their labels never run off the edge.
  const ringRadii = useMemo(() => {
    const avail = Math.min(size.w, size.h) / 2 - RING_LABEL_MARGIN;
    const scale = Math.min(1, avail / RING2_RADIUS_MAX);
    return {
      ring1: Math.max(RING1_RADIUS_MIN, RING1_RADIUS_MAX * scale),
      ring2: Math.max(RING2_RADIUS_MIN, RING2_RADIUS_MAX * scale),
    };
  }, [size.w, size.h]);

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: sheetsInOperation } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId ?? -1 },
    { enabled: operationId != null }
  );

  // A picked sheet already implies its operation, so the query scopes to
  // just the sheet rather than both — passing operationIds too would be
  // redundant, not stricter (a sheet can't span operations).
  const {
    data: graphData,
    isLoading,
    refetch,
  } = trpc.intelligence.getAssociationGraph.useQuery(
    {
      operationIds:
        sheetId == null && operationId != null ? [operationId] : undefined,
      sheetIds: sheetId != null ? [sheetId] : undefined,
    },
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

  // Focus starts blank — every scope dropdown (Operation, Running Sheet,
  // Focus Entity) defaults to nothing selected, and the officer picks a
  // focus explicitly rather than the view silently landing on whichever
  // entity happens to be best-connected. This only ever *clears* the
  // focus (never auto-picks one) when it falls outside a newly-scoped
  // graph, so switching Operation/Running Sheet doesn't leave the canvas
  // pointing at an entity that's no longer in view.
  useEffect(() => {
    if (focusId && graphData?.nodes?.length && !nodesById.has(focusId)) {
      setFocusId(null);
    }
  }, [graphData, nodesById, focusId]);

  useEffect(() => {
    setExpandRing1(false);
  }, [focusId, hops]);

  const focusNode = focusId ? (nodesById.get(focusId) ?? null) : null;

  const { placed, ring1Ids, hiddenRing1Count, hiddenRing2Count, edges } =
    useMemo(
      () =>
        computeEgoLayout({
          focusNode,
          adjacency,
          nodesById,
          hops,
          expandRing1,
          ring1Radius: ringRadii.ring1,
          ring2Radius: ringRadii.ring2,
        }),
      [focusNode, adjacency, nodesById, hops, expandRing1, ringRadii]
    );

  const cx = size.w / 2;
  const cy = size.h / 2;

  // Grouped for the plain focus-entity dropdown — Targets, Associates,
  // Vehicles, Locations, Businesses (ENTITY_TYPES' order), each sorted by
  // connection count so the best-linked entities sit at the top of their
  // group. Any type outside that fixed list (shouldn't normally occur) is
  // appended under its own group rather than silently dropped.
  const entityGroups = useMemo(() => {
    const all = (graphData?.nodes ?? []) as EgoNode[];
    const byType = new Map<string, EgoNode[]>();
    for (const n of all) {
      if (!byType.has(n.type)) byType.set(n.type, []);
      byType.get(n.type)!.push(n);
    }
    const orderedTypes = [
      ...ENTITY_TYPES,
      ...Array.from(byType.keys()).filter(
        t => !(ENTITY_TYPES as readonly string[]).includes(t)
      ),
    ];
    return orderedTypes
      .map(type => ({
        type,
        label: DROPDOWN_GROUP_LABELS[type] ?? type,
        nodes: (byType.get(type) ?? []).sort(
          (a, b) =>
            (adjacency.get(b.id)?.length ?? 0) -
            (adjacency.get(a.id)?.length ?? 0)
        ),
      }))
      .filter(g => g.nodes.length > 0);
  }, [graphData, adjacency]);

  const ring1Placed = placed.filter(p => p.hop === 1);

  const recenter = useCallback((id: string) => setFocusId(id), []);

  const radiusFor = egoNodeRadius;

  /** A name as it reads on the canvas: no ", born …" and no repeated
   * "(SURNAME)" — the list beside it keeps the full form. */
  const canvasName = (label: string) =>
    displayPersonName(label).replace(/\s*\([^()]*\)\s*$/, "");

  // Recomputed at the fixed print radii rather than reusing `placed` — the
  // on-screen layout is scaled to the viewport, so exporting it directly
  // would bake the current window size into the PDF.
  const handleExport = useCallback(() => {
    if (!focusNode) return;
    // How many entities land on ring 1 is independent of the radius, so the
    // count can be measured up front and the rings sized to suit it.
    const ring1Count = Math.min(
      adjacency.get(focusNode.id)?.length ?? 0,
      expandRing1 ? Number.MAX_SAFE_INTEGER : RING1_MAX
    );
    const radii = exportRingRadii(ring1Count);
    const exportLayout = computeEgoLayout({
      focusNode,
      adjacency,
      nodesById,
      hops,
      expandRing1,
      ring1Radius: radii.ring1,
      ring2Radius: radii.ring2,
    });
    const scopedOperationName =
      operationId != null
        ? ((operations ?? []).find(o => o.id === operationId)?.name ?? null)
        : null;
    const scopedSheetTitle =
      sheetId != null
        ? ((sheetsInOperation ?? []).find(s => s.id === sheetId)?.title ?? null)
        : null;
    exportEgoNetworkPdf({
      focusNode,
      layout: exportLayout,
      radii,
      hops,
      operationName: scopedSheetTitle ?? scopedOperationName,
    });
  }, [
    focusNode,
    adjacency,
    nodesById,
    hops,
    expandRing1,
    operationId,
    operations,
    sheetId,
    sheetsInOperation,
  ]);

  const directCount = ring1Ids.length + hiddenRing1Count;

  /** The focus entity's direct links, ranked: click one to re-centre on it. */
  const linksPanel = (
    <aside
      aria-label="Direct links"
      className={
        isCompact
          ? "flex flex-col"
          : "flex w-[320px] shrink-0 flex-col border-l border-border"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/70 px-3.5 py-2.5">
        <span className="text-[13px] font-bold uppercase tracking-wide text-foreground">
          Direct links
        </span>
        {focusNode && <span className={SECTION_COUNT}>{directCount}</span>}
      </div>
      <div className="flex max-h-[420px] min-h-[120px] flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">
        {!focusNode && (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            Pick a focus entity above to see its direct links.
          </p>
        )}
        {focusNode && placed.length === 0 && (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            This entity has no recorded co-occurrences.
          </p>
        )}
        {placed.map(p => (
          <button
            key={p.node.id}
            onClick={() => recenter(p.node.id)}
            title={`${p.node.label} — click to focus`}
            className={`${ROW_ITEM} grid w-full grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${
              p.hop === 2 ? "opacity-70" : ""
            }`}
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{
                background: NODE_COLORS[p.node.type] ?? NODE_COLORS.unknown,
              }}
            />
            <span className="min-w-0">
              <span className="block break-words text-[13px] font-semibold leading-snug text-foreground">
                {displayPersonName(p.node.label)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {ENTITY_LABELS[p.node.type] ?? p.node.type}
                {p.hop === 2 ? " · second degree" : ""}
              </span>
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
              {p.hop === 1 ? `${p.weight}×` : ""}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>
    </aside>
  );

  /** Colour key, as a strip under the canvas. */
  const legendStrip = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
      {ENTITY_TYPES.map(t => (
        <span
          key={t}
          className="inline-flex items-center gap-1.5 font-semibold"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: NODE_COLORS[t] }}
          />
          {ENTITY_LABELS[t]}
        </span>
      ))}
      <span className="sm:ml-auto">
        Inner ring = direct links. Outer ring = one step further.
      </span>
    </div>
  );

  return (
    <section className={SECTION_CARD} aria-labelledby="ego-network-title">
      {/* ── Title band: what this is, how much is shown, the two actions ── */}
      <div className={`${SECTION_BAND} flex-wrap justify-between`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="ego-network-title" className={SECTION_TITLE}>
            Ego Network
          </h2>
          {focusNode && (
            <span className={SECTION_COUNT}>
              {directCount} direct link{directCount === 1 ? "" : "s"}
              {hops === 2 &&
                ` · ${placed.length - ring1Placed.length} second-degree`}
              {hiddenRing2Count > 0 && ` · ${hiddenRing2Count} not shown`}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-9 min-w-28 gap-1.5"
            disabled={!focusNode}
            onClick={handleExport}
          >
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
          <Button
            variant="outline"
            className="h-9 min-w-28 gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters: equal columns ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={FORM_LABEL}>Operation</span>
          <Select
            value={operationId != null ? String(operationId) : "all"}
            onValueChange={v => {
              setOperationId(v === "all" ? null : Number(v));
              setSheetId(null);
            }}
          >
            <SelectTrigger className="h-10 w-full">
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
        </div>

        {/* Running sheet only makes sense once an operation narrows the
            list — disabled rather than hidden so the control doesn't jump
            around as the officer picks an operation. */}
        <div className="flex min-w-0 flex-col gap-1">
          <span className={FORM_LABEL}>Running sheet</span>
          <Select
            value={sheetId != null ? String(sheetId) : "all"}
            onValueChange={v => setSheetId(v === "all" ? null : Number(v))}
            disabled={operationId == null}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All running sheets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All running sheets</SelectItem>
              {(sheetsInOperation ?? []).map(s => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Focus entity — right after the Operation / Running Sheet scope so
            all three read as one "narrow down, then pick" group. */}
        <div className="flex min-w-0 flex-col gap-1">
          <span className={FORM_LABEL}>Focus entity</span>
          <Select
            value={focusId ?? undefined}
            onValueChange={v => {
              recenter(v);
              if (isCompact) setMobilePanel("map");
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Select focus entity…" />
            </SelectTrigger>
            <SelectContent>
              {entityGroups.map(g => (
                <SelectGroup key={g.type}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.nodes.map(n => (
                    <SelectItem key={n.id} value={n.id}>
                      {displayPersonName(n.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Hop depth: two equal halves */}
        <div className="flex min-w-0 flex-col gap-1">
          <span className={FORM_LABEL} id="ego-reach-label">
            Reach
          </span>
          <div
            role="group"
            aria-labelledby="ego-reach-label"
            className="grid h-10 grid-cols-2 overflow-hidden rounded-md border border-input bg-background"
          >
            {([1, 2] as const).map(h => (
              <button
                key={h}
                type="button"
                aria-pressed={hops === h}
                onClick={() => setHops(h)}
                className={`border-r border-input text-sm font-bold transition-colors last:border-r-0 ${
                  hops === h
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted/60"
                }`}
              >
                {h} hop{h > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Compact panel switcher — phone/iPad only ────────────────────── */}
      {isCompact && (
        <div className="flex flex-col gap-1 pb-3">
          <span className={FORM_LABEL}>Show</span>
          <Select
            value={mobilePanel}
            onValueChange={v => setMobilePanel(v as typeof mobilePanel)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Direct links</SelectItem>
              <SelectItem value="map">Map</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Canvas beside the ranked links (stacked on phone / iPad) ───── */}
      <div className="-mx-4 -mb-4 flex flex-col overflow-hidden border-t border-border">
        <div className={isCompact ? "" : "flex"}>
          {(!isCompact || mobilePanel === "map") && (
            <div className="min-w-0 flex-1">
              {/* Square, not "fill whatever's left" — a wide-but-short
                  desktop viewport used to clip 2nd-hop nodes at the top and
                  bottom while leaving spare room left and right. The
                  compact (phone/iPad) panel is a fixed tall box instead. */}
              <div className="bg-muted/40">
                <div
                  ref={containerRef}
                  className={
                    isCompact
                      ? "relative h-[68vh] min-h-[420px] w-full overflow-hidden"
                      : "relative aspect-square max-h-[760px] w-full overflow-hidden"
                  }
                >
                  {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <Spinner className="h-8 w-8 text-primary" />
                    </div>
                  )}

                  {!isLoading && !focusNode && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
                      <Radar className="h-8 w-8 opacity-40" />
                      <p className="text-sm font-medium">
                        {graphData?.nodes?.length
                          ? "No entity focused."
                          : "No entities available."}
                      </p>
                      <p className="text-sm">
                        {graphData?.nodes?.length
                          ? "Pick a focus entity from the list above."
                          : "Pick a focus entity once observations have been logged."}
                      </p>
                    </div>
                  )}

                  {!isLoading && focusNode && (
                    <>
                      <svg
                        width={size.w}
                        height={size.h}
                        className="absolute inset-0"
                      >
                        {/* Hop-distance guides */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={ringRadii.ring1}
                          fill="none"
                          style={{ stroke: "var(--border)" }}
                          strokeWidth={1.5}
                          strokeDasharray="5 6"
                        />
                        {hops === 2 && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={ringRadii.ring2}
                            fill="none"
                            style={{ stroke: "var(--border)" }}
                            strokeWidth={1.5}
                            strokeDasharray="5 6"
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
                              style={{
                                stroke:
                                  e.hop === 1
                                    ? "var(--muted-foreground)"
                                    : "var(--border)",
                              }}
                              strokeLinecap="round"
                              strokeWidth={
                                e.hop === 1
                                  ? Math.max(
                                      1.5,
                                      Math.min(5, e.to.weight * 0.9)
                                    )
                                  : 1.4
                              }
                              strokeOpacity={e.hop === 1 ? 0.6 : 0.9}
                            />
                          );
                        })}

                        {/* Centre glow */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={34}
                          fill={
                            NODE_COLORS[focusNode.type] ?? NODE_COLORS.unknown
                          }
                          fillOpacity={0.18}
                        />
                      </svg>

                      {/* Ring names, set on their rings between two spokes */}
                      {[
                        { r: ringRadii.ring1, text: "1 hop", show: true },
                        {
                          r: ringRadii.ring2,
                          text: "2 hops",
                          show: hops === 2,
                        },
                      ]
                        .filter(l => l.show && !isCompact)
                        .map(l => (
                          <span
                            key={l.text}
                            className="pointer-events-none absolute whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground"
                            style={{
                              left: cx + l.r * Math.cos(Math.PI / 8),
                              top: cy + l.r * Math.sin(Math.PI / 8),
                              transform: "translate(-50%, -50%)",
                            }}
                          >
                            {l.text}
                          </span>
                        ))}

                      {/* Centre node: the circle sits exactly on the centre
                          (the edges run from it); the name sits above it, so
                          it can never run into a ring node's own label. */}
                      <div
                        className="pointer-events-none absolute"
                        style={{
                          left: cx,
                          top: cy,
                          transform: "translate(-50%, -50%)",
                        }}
                      >
                        <span
                          className="block rounded-full border-[3px] border-card"
                          style={{
                            width: 44,
                            height: 44,
                            background:
                              NODE_COLORS[focusNode.type] ??
                              NODE_COLORS.unknown,
                          }}
                        />
                        <span className="absolute bottom-[calc(100%+6px)] left-1/2 line-clamp-2 w-max max-w-[170px] -translate-x-1/2 whitespace-normal break-words px-1 text-center text-xs font-bold leading-tight text-foreground [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card),0_0_5px_var(--card)]">
                          {canvasName(focusNode.label)}
                        </span>
                      </div>

                      {/* Ring nodes */}
                      {placed.map(p => (
                        <button
                          key={p.node.id}
                          onClick={() => recenter(p.node.id)}
                          title={`${p.node.label} — click to focus`}
                          className="group absolute flex flex-col items-center gap-1"
                          style={{
                            left: cx + p.x,
                            top: cy + p.y,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <span
                            className="rounded-full border-[3px] border-card transition-transform group-hover:scale-125"
                            style={{
                              width: radiusFor(p.node, p.hop) * 2,
                              height: radiusFor(p.node, p.hop) * 2,
                              background:
                                NODE_COLORS[p.node.type] ?? NODE_COLORS.unknown,
                              opacity: p.hop === 1 ? 1 : 0.8,
                            }}
                          />
                          {/* Wraps up to 2 lines (line-clamp-2) instead of
                              truncating to one — a narrower max-width for
                              hop-2 keeps each label's own footprint smaller,
                              which combined with computeEgoLayout's
                              per-parent slot bound is what stops a busy
                              branch's labels overlapping its neighbours'. */}
                          <span
                            className={`line-clamp-2 whitespace-normal break-words px-1 text-center text-xs leading-tight [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card),0_0_5px_var(--card)] ${
                              p.hop === 1
                                ? "max-w-[124px] font-semibold text-foreground"
                                : "max-w-[104px] text-muted-foreground"
                            }`}
                          >
                            {canvasName(p.node.label)}
                          </span>
                        </button>
                      ))}

                      {/* "+N more" chip for a crowded inner ring */}
                      {hiddenRing1Count > 0 && (
                        <button
                          onClick={() => setExpandRing1(true)}
                          className="absolute rounded-full border border-dashed border-muted-foreground bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          style={{
                            left: cx,
                            top: cy + ringRadii.ring1 + 34,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          +{hiddenRing1Count} more direct
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {legendStrip}
            </div>
          )}

          {(!isCompact || mobilePanel === "info") && linksPanel}
        </div>
      </div>
    </section>
  );
}
