import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  NODE_COLORS,
  ENTITY_TYPES,
  ENTITY_LABELS,
  RING1_MAX,
  liveRingRadii,
  widestGapAngle,
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
import {
  ChevronRight,
  RefreshCw,
  FileDown,
  Radar,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
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
/** Furthest the picture can be pinched or zoomed in on a phone / iPad. */
const MAX_ZOOM = 4;

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

  // Whether anything sits a second step out doesn't depend on the radii, so
  // it is read first and decides how the room is shared between the rings.
  const hasRing2 = useMemo(
    () =>
      hops === 2 &&
      computeEgoLayout({
        focusNode,
        adjacency,
        nodesById,
        hops,
        expandRing1,
        ring1Radius: 1,
        ring2Radius: 1,
      }).placed.some(p => p.hop === 2),
    [focusNode, adjacency, nodesById, hops, expandRing1]
  );

  // The rings are sized to the room the canvas really has, whatever the
  // device (see liveRingRadii): tall and wide screens spread the network out,
  // a phone keeps it on the screen.
  const ringRadii = useMemo(
    () =>
      liveRingRadii({
        width: size.w,
        height: size.h,
        hasRing2,
        compact: isCompact,
      }),
    [size.w, size.h, hasRing2, isCompact]
  );

  // ── Pinch to zoom (phone / iPad) ────────────────────────────────────────
  // The picture is set to fit the screen, with small names; two fingers zoom
  // into it and one finger drags it once zoomed (before that one finger still
  // scrolls the page). The +/−/fit buttons do the same without a touch screen.
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const clampView = useCallback(
    (v: { s: number; x: number; y: number }) => {
      const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
      return {
        s,
        x: Math.min(0, Math.max(size.w - size.w * s, v.x)),
        y: Math.min(0, Math.max(size.h - size.h * s, v.y)),
      };
    },
    [size.w, size.h]
  );
  const zoomBy = useCallback(
    (factor: number) => {
      const v = viewRef.current;
      const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor));
      // About the middle of the canvas.
      const px = (size.w / 2 - v.x) / v.s;
      const py = (size.h / 2 - v.y) / v.s;
      setView(clampView({ s, x: size.w / 2 - px * s, y: size.h / 2 - py * s }));
    },
    [size.w, size.h, clampView]
  );
  // A new focus or reach starts from the whole picture again.
  useEffect(() => {
    setView({ s: 1, x: 0, y: 0 });
  }, [focusId, hops, expandRing1]);

  const movedRef = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isCompact) return;
    let pinch: {
      d: number;
      mx: number;
      my: number;
      v: { s: number; x: number; y: number };
    } | null = null;
    let pan: { x: number; y: number; v: { x: number; y: number } } | null =
      null;
    const rect = () => el.getBoundingClientRect();
    const mid = (t: TouchList) => {
      const r = rect();
      return {
        x: (t[0].clientX + t[1].clientX) / 2 - r.left,
        y: (t[0].clientY + t[1].clientY) / 2 - r.top,
      };
    };
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      movedRef.current = false;
      if (e.touches.length === 2) {
        const m = mid(e.touches);
        pinch = { d: dist(e.touches), mx: m.x, my: m.y, v: viewRef.current };
        pan = null;
      } else if (e.touches.length === 1 && viewRef.current.s > 1) {
        pan = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          v: viewRef.current,
        };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        movedRef.current = true;
        const m = mid(e.touches);
        const s = Math.min(
          MAX_ZOOM,
          Math.max(1, (pinch.v.s * dist(e.touches)) / pinch.d)
        );
        // Keep the spot between the fingers under the fingers.
        const px = (pinch.mx - pinch.v.x) / pinch.v.s;
        const py = (pinch.my - pinch.v.y) / pinch.v.s;
        setView(clampView({ s, x: m.x - px * s, y: m.y - py * s }));
      } else if (e.touches.length === 1 && pan) {
        const dx = e.touches[0].clientX - pan.x;
        const dy = e.touches[0].clientY - pan.y;
        if (Math.hypot(dx, dy) > 6) movedRef.current = true;
        e.preventDefault();
        setView(
          clampView({
            s: viewRef.current.s,
            x: pan.v.x + dx,
            y: pan.v.y + dy,
          })
        );
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) {
        pan = null;
        if (viewRef.current.s < 1.02) setView({ s: 1, x: 0, y: 0 });
        // The tap that ends a drag or pinch must not also pick a node.
        window.setTimeout(() => (movedRef.current = false), 0);
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (movedRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, [isCompact, clampView, mobilePanel]);

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
          xStretch: ringRadii.xStretch,
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
                  data-testid="ego-canvas"
                  style={isCompact ? { touchAction: "pan-x pan-y" } : undefined}
                  className={
                    isCompact
                      ? "relative aspect-square max-h-[80vh] w-full overflow-hidden"
                      : "relative aspect-square max-h-[max(760px,calc(100dvh_-_10rem))] w-full overflow-hidden"
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

                  {!isLoading && focusNode && isCompact && (
                    <div className="absolute right-2 top-2 z-20 flex flex-col gap-1">
                      {[
                        {
                          label: "Zoom in",
                          Icon: ZoomIn,
                          run: () => zoomBy(1.5),
                        },
                        {
                          label: "Zoom out",
                          Icon: ZoomOut,
                          run: () => zoomBy(1 / 1.5),
                        },
                        {
                          label: "Fit to screen",
                          Icon: Maximize2,
                          run: () => setView({ s: 1, x: 0, y: 0 }),
                        },
                      ].map(({ label, Icon, run }) => (
                        <button
                          key={label}
                          type="button"
                          aria-label={label}
                          onClick={run}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm hover:bg-muted"
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  )}

                  {!isLoading && focusNode && (
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
                        transformOrigin: "0 0",
                      }}
                    >
                      <svg
                        width={size.w}
                        height={size.h}
                        className="absolute inset-0"
                      >
                        {/* Hop-distance guides */}
                        <ellipse
                          cx={cx}
                          cy={cy}
                          rx={ringRadii.ring1 * ringRadii.xStretch}
                          ry={ringRadii.ring1}
                          fill="none"
                          style={{ stroke: "var(--border)" }}
                          strokeWidth={1.5}
                          strokeDasharray="5 6"
                        />
                        {hasRing2 && (
                          <ellipse
                            cx={cx}
                            cy={cy}
                            rx={ringRadii.ring2 * ringRadii.xStretch}
                            ry={ringRadii.ring2}
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

                      {/* Ring names, set on their rings in the widest gap
                          between that ring's nodes (never on a node) */}
                      {[
                        { hop: 1 as const, r: ringRadii.ring1, text: "1 hop" },
                        ...(hasRing2
                          ? [
                              {
                                hop: 2 as const,
                                r: ringRadii.ring2,
                                text: "2 hops",
                              },
                            ]
                          : []),
                      ]
                        .filter(() => !isCompact)
                        .map(l => {
                          const angle = widestGapAngle(
                            placed
                              .filter(p => p.hop === l.hop)
                              .map(p =>
                                Math.atan2(p.y, p.x / ringRadii.xStretch)
                              ),
                            Math.PI / 8
                          );
                          return (
                            <span
                              key={l.text}
                              className="pointer-events-none absolute whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground"
                              style={{
                                left:
                                  cx +
                                  l.r * ringRadii.xStretch * Math.cos(angle),
                                top: cy + l.r * Math.sin(angle),
                                transform: "translate(-50%, -50%)",
                              }}
                            >
                              {l.text}
                            </span>
                          );
                        })}

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
                        <span
                          className={`absolute bottom-[calc(100%+6px)] left-1/2 line-clamp-2 w-max -translate-x-1/2 whitespace-normal break-words px-1 text-center font-bold ${isCompact ? "max-w-[120px] text-[10px]" : "max-w-[170px] text-xs"} leading-tight text-foreground [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card),0_0_5px_var(--card)]`}
                        >
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
                            className={`line-clamp-2 whitespace-normal break-words px-1 text-center leading-tight [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card),0_0_5px_var(--card)] ${
                              isCompact ? "text-[10px]" : "text-xs"
                            } ${
                              p.hop === 1
                                ? `font-semibold text-foreground ${isCompact ? "max-w-[88px]" : "max-w-[124px]"}`
                                : `text-muted-foreground ${isCompact ? "max-w-[76px]" : "max-w-[104px]"}`
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
                    </div>
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
