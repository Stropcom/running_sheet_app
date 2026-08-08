import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  FileDown,
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

// Upper bounds — the actual radii used are scaled down to fit the canvas
// (see ringRadii below) so ring-1/ring-2 nodes and their labels never run
// past the visible edge on a narrow phone screen.
const RING1_RADIUS_MAX = 165;
const RING2_RADIUS_MAX = 290;
/** Reserved for label text extending past a node's centre, plus padding. */
const RING_LABEL_MARGIN = 110;
const RING1_RADIUS_MIN = 70;
const RING2_RADIUS_MIN = 120;

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

interface EgoLayout {
  placed: PlacedNode[];
  ring1Ids: string[];
  hiddenRing1Count: number;
  hiddenRing2Count: number;
  edges: { from: PlacedNode | null; to: PlacedNode; hop: 1 | 2 }[];
}

/**
 * Concentric-ring layout. Ring 1 is the focus entity's direct
 * co-occurrences, spaced evenly around it. Ring 2 (when 2 hops are shown)
 * is everything one step further out, placed near the angle of whichever
 * ring-1 entity introduced it — so a cluster stays visually attached to
 * its parent instead of scattering.
 *
 * Pure and radius-agnostic so the on-screen view (which scales its rings to
 * the viewport) and the PDF export (fixed print canvas) lay out identically
 * from the same code rather than each doing its own trigonometry.
 */
function computeEgoLayout(params: {
  focusNode: EgoNode | null;
  adjacency: Map<string, { id: string; weight: number }[]>;
  nodesById: Map<string, EgoNode>;
  hops: 1 | 2;
  expandRing1: boolean;
  ring1Radius: number;
  ring2Radius: number;
}): EgoLayout {
  const {
    focusNode,
    adjacency,
    nodesById,
    hops,
    expandRing1,
    ring1Radius,
    ring2Radius,
  } = params;

  if (!focusNode) {
    return {
      placed: [],
      ring1Ids: [],
      hiddenRing1Count: 0,
      hiddenRing2Count: 0,
      edges: [],
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
    const angle = (i / Math.max(1, ring1.length)) * Math.PI * 2 - Math.PI / 2;
    angleOf.set(entry.id, angle);
    const node = nodesById.get(entry.id);
    if (!node) return;
    placedNodes.push({
      node,
      x: Math.cos(angle) * ring1Radius,
      y: Math.sin(angle) * ring1Radius,
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
        candidates.push({ id: nb.id, parent: parent.id, weight: nb.weight });
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
          x: Math.cos(angle) * ring2Radius,
          y: Math.sin(angle) * ring2Radius,
          hop: 2,
          weight: kid.weight,
        });
      });
    }
  }

  const byId = new Map(placedNodes.map(p => [p.node.id, p]));
  const edgeList: { from: PlacedNode | null; to: PlacedNode; hop: 1 | 2 }[] =
    [];
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
}

/** Node radius by occurrence count — shared by the live view and the export. */
function egoNodeRadius(n: EgoNode, hop: 1 | 2) {
  const base = Math.max(5, Math.min(11, 4 + Math.log1p(n.occurrences) * 2));
  return hop === 1 ? base : base * 0.72;
}

// ── PDF export ───────────────────────────────────────────────────────────────
// The ring diagram is redrawn as a standalone SVG rather than screenshotting
// the live view: the on-screen version is a mix of an <svg> (rings/edges) and
// absolutely-positioned DOM nodes, and it's sized to the viewport, so a
// capture would be raster, fuzzy in print, and different on every screen.
// Re-rendering from computeEgoLayout at a fixed print canvas gives vector
// output that's identical every time — the same reasoning behind the Heat
// Map export using a static map image instead of capturing its live map.

const EXPORT_RING1_MIN = 170;
const EXPORT_RING1_MAX = 330;
/**
 * Ring 2 sits a fixed distance outside ring 1 rather than a multiple of it.
 * As a ratio, a wide ring 1 pushed ring 2 out far enough that one lone
 * second-degree node stretched the whole canvas, and since the diagram is
 * scaled to fit the page that shrank every ring-1 label with it.
 */
const EXPORT_RING_GAP = 150;
/** SVG can't ellipsize text, so long labels are cut to fit their slice. */
const EXPORT_LABEL_MAX_CHARS = 26;
/** Room a centred label needs either side of / below its node. */
const EXPORT_LABEL_PAD_X = 115;
const EXPORT_LABEL_PAD_Y = 46;

/**
 * Ring 1 grows with how many entities sit on it. Unlike the on-screen view
 * — where the rings shrink to fit a viewport and overlapping labels are
 * tolerable because you can pan/zoom/see colour — a printed page has to be
 * readable as-is. A truncated label runs ~145px wide, so each node needs
 * roughly that much arc: radius ≈ count × 145 / 2π.
 */
function exportRingRadii(ring1Count: number) {
  const ring1 = Math.min(
    EXPORT_RING1_MAX,
    Math.max(EXPORT_RING1_MIN, Math.round((ring1Count * 145) / (2 * Math.PI)))
  );
  return { ring1, ring2: ring1 + EXPORT_RING_GAP };
}

function escXml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(s: string, max = EXPORT_LABEL_MAX_CHARS): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Drawn around a (0,0) origin — placed nodes already carry offsets relative
 * to the focus entity — with the viewBox cropped to whatever the graph
 * actually occupies. A fixed canvas would leave a sparse graph (a couple of
 * links, no second ring) stranded in a mostly-empty page, the same way the
 * Association Map's zoom-to-fit used to blow small graphs up.
 */
function buildEgoNetworkSvg(params: {
  focusNode: EgoNode;
  layout: EgoLayout;
  radii: { ring1: number; ring2: number };
}): string {
  const { focusNode, layout, radii } = params;
  const { placed, edges } = layout;

  const centreColour = NODE_COLORS[focusNode.type] ?? NODE_COLORS.unknown;
  const hasRing1 = placed.some(p => p.hop === 1);
  const hasRing2 = placed.some(p => p.hop === 2);

  // Crop to content: the furthest node out, not the nominal ring radius, so
  // a 2-hop view with no second-degree hits doesn't reserve ring-2 space.
  const contentR = placed.reduce(
    (max, p) => Math.max(max, Math.hypot(p.x, p.y) + egoNodeRadius(p.node, p.hop)),
    hasRing1 ? radii.ring1 : 60
  );
  const halfW = Math.max(180, contentR + EXPORT_LABEL_PAD_X);
  const halfH = Math.max(110, contentR + EXPORT_LABEL_PAD_Y);
  const viewBox = `${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`;

  // Guide rings only where that ring is actually populated.
  const guides = `
    ${hasRing1 ? `<circle cx="0" cy="0" r="${radii.ring1}" fill="none" stroke="#e2e8f0" stroke-dasharray="5 5"/>` : ""}
    ${hasRing2 ? `<circle cx="0" cy="0" r="${radii.ring2}" fill="none" stroke="#e2e8f0" stroke-dasharray="5 5"/>` : ""}`;

  const edgeEls = edges
    .map(e => {
      const x1 = e.from ? e.from.x : 0;
      const y1 = e.from ? e.from.y : 0;
      const stroke = e.hop === 1 ? "#64748b" : "#cbd5e1";
      const width =
        e.hop === 1 ? Math.max(1, Math.min(4, e.to.weight * 0.9)) : 1.2;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${e.to.x.toFixed(1)}" y2="${e.to.y.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${e.hop === 1 ? 0.85 : 0.6}"/>`;
    })
    .join("\n    ");

  // Labels carry a white halo (paint-order: stroke) so they stay readable
  // where they cross an edge or another ring's label.
  const nodeEls = placed
    .map(p => {
      const r = egoNodeRadius(p.node, p.hop);
      const colour = NODE_COLORS[p.node.type] ?? NODE_COLORS.unknown;
      const fontSize = p.hop === 1 ? 11 : 10;
      const fill = p.hop === 1 ? "#1e293b" : "#64748b";
      return `<g>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${colour}" fill-opacity="${p.hop === 1 ? 1 : 0.75}"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y + r + 13).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-family="-apple-system, 'Segoe UI', Arial, sans-serif" fill="${fill}" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">${escXml(truncateLabel(p.node.label))}</text>
    </g>`;
    })
    .join("\n    ");

  const centre = `
    <circle cx="0" cy="0" r="34" fill="${centreColour}" fill-opacity="0.16"/>
    <circle cx="0" cy="0" r="22" fill="${centreColour}"/>
    <text x="0" y="46" text-anchor="middle" font-size="13" font-weight="700" font-family="-apple-system, 'Segoe UI', Arial, sans-serif" fill="#0f172a" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">${escXml(truncateLabel(focusNode.label, 34))}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" style="display:block" preserveAspectRatio="xMidYMid meet">
    <rect x="${-halfW}" y="${-halfH}" width="${halfW * 2}" height="${halfH * 2}" fill="#ffffff"/>
    ${guides}
    ${edgeEls}
    ${centre}
    ${nodeEls}
  </svg>`;
}

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

export default function EgoNetworkMap() {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hops, setHops] = useState<1 | 2>(1);
  const [pickerSearch, setPickerSearch] = useState("");
  const [expandRing1, setExpandRing1] = useState(false);
  const isCompact = useCompactLayout();
  // Which single panel is shown in compact mode — defaults to the map since
  // that's the point of the page; picking an entity from the list jumps
  // here automatically so the officer isn't left staring at the list.
  const [mobilePanel, setMobilePanel] = useState<"entities" | "map" | "details">(
    "map"
  );
  // null = every operation. Scoping here narrows the whole view at once —
  // the graph, the focus-entity list, and the rings all come off this query.
  const [operationId, setOperationId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Desktop/laptop always gets the full-size rings — that layout already had
  // enough canvas room and was correct as-is. Only compact (phone/iPad
  // portrait) layouts scale the rings down together (keeping their
  // proportions) so the outermost nodes — and their labels — stay within the
  // canvas instead of running off the edge on a narrow screen.
  const ringRadii = useMemo(() => {
    if (!isCompact) {
      return { ring1: RING1_RADIUS_MAX, ring2: RING2_RADIUS_MAX };
    }
    const avail = Math.min(size.w, size.h) / 2 - RING_LABEL_MARGIN;
    const scale = Math.min(1, avail / RING2_RADIUS_MAX);
    return {
      ring1: Math.max(RING1_RADIUS_MIN, RING1_RADIUS_MAX * scale),
      ring2: Math.max(RING2_RADIUS_MIN, RING2_RADIUS_MAX * scale),
    };
  }, [isCompact, size.w, size.h]);

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

  const radiusFor = egoNodeRadius;

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
    exportEgoNetworkPdf({
      focusNode,
      layout: exportLayout,
      radii,
      hops,
      operationName:
        operationId != null
          ? ((operations ?? []).find(o => o.id === operationId)?.name ?? null)
          : null,
    });
  }, [
    focusNode,
    adjacency,
    nodesById,
    hops,
    expandRing1,
    operationId,
    operations,
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <span className="text-sm font-semibold text-foreground mr-1">
          Ego Network
        </span>
        {/* Plain divider, not the shared Separator component — Separator's
            own data-[orientation=vertical]:h-full default beats a "h-5"
            override in the generated CSS, and h-full inside a *wrapping*
            flex row (this bar wraps to several lines on narrow screens)
            resolves to a wildly oversized height, throwing off every row
            after it. */}
        <div className="h-5 w-px bg-border shrink-0" />

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

        <div className="h-5 w-px bg-border shrink-0" />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Focus:</span>
          <span className="font-semibold text-foreground">
            {focusNode ? focusNode.label : "—"}
          </span>
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

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

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={!focusNode}
            onClick={handleExport}
          >
            <FileDown className="w-3.5 h-3.5" />
            Export
          </Button>
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

      {/* ── Compact panel switcher — phone/iPad only ────────────────────── */}
      {isCompact && (
        <div className="px-4 py-2 border-b border-border bg-card shrink-0">
          <Select
            value={mobilePanel}
            onValueChange={v => setMobilePanel(v as typeof mobilePanel)}
          >
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entities">Focus entity list</SelectItem>
              <SelectItem value="map">Map</SelectItem>
              <SelectItem value="details" disabled={!focusNode}>
                Direct links
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: focus entity picker ──────────────────────────────────── */}
        {(!isCompact || mobilePanel === "entities") && (
        <div className={isCompact ? "w-full flex flex-col overflow-hidden" : "w-56 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden"}>
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
                  onClick={() => {
                    recenter(n.id);
                    if (isCompact) setMobilePanel("map");
                  }}
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
        )}

        {/* ── Ring canvas ─────────────────────────────────────────────────── */}
        {(!isCompact || mobilePanel === "map") && (
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
                  r={ringRadii.ring1}
                  fill="none"
                  stroke="#262b36"
                  strokeDasharray="4 4"
                />
                {hops === 2 && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={ringRadii.ring2}
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
                    top: cy + ringRadii.ring1 + 34,
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
        )}

        {/* ── Right: focus detail ─────────────────────────────────────────── */}
        {(!isCompact || mobilePanel === "details") && focusNode && (
          <div className={isCompact ? "w-full flex flex-col overflow-hidden" : "w-64 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden"}>
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
