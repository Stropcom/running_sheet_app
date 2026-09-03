// Ego Network layout + print rendering.
//
// Pure, framework-free logic shared by the interactive Ego Network page and
// the Intelligence Package export. It lives outside the page component so
// the package can render a diagram per target without importing a React
// page, and so the on-screen view and the PDF lay out from the same code
// rather than each doing its own trigonometry.

// Same palette/labels as the Association Map — the two views show the same
// entities, so a target has to read as the same colour in both.
export const NODE_COLORS: Record<string, string> = {
  target: "#ef4444",
  person: "#3b82f6",
  vehicle: "#f97316",
  address: "#22c55e",
  business: "#a855f7",
  unknown: "#94a3b8",
};

export const ENTITY_TYPES = [
  "target",
  "person",
  "vehicle",
  "address",
  "business",
] as const;

export const ENTITY_LABELS: Record<string, string> = {
  target: "Targets",
  person: "Associates",
  vehicle: "Vehicles",
  address: "Addresses",
  business: "Businesses",
};

export type EgoNode = {
  id: string;
  label: string;
  type: "target" | "person" | "vehicle" | "address" | "business" | "unknown";
  occurrences: number;
  operationIds: number[];
  operationNames: string[];
  /** Registry target id for target nodes — lets the package centre a
   * diagram on a chosen target without matching on the display label. */
  targetId?: number | null;
};

export type EgoEdge = {
  source: string | EgoNode;
  target: string | EgoNode;
  weight: number;
};

/** Ring 1 holds at most this many entities before the rest collapse behind a
 * "+N more" chip — past roughly this count the ring stops being readable. */
export const RING1_MAX = 12;
/** Ring 2 is denser by nature (every ring-1 entity brings its own), so it
 * truncates harder. */
export const RING2_MAX = 18;

// Upper bounds — the actual radii used are scaled down to fit the canvas
// (see ringRadii below) so ring-1/ring-2 nodes and their labels never run
// past the visible edge on a narrow phone screen.
export const RING1_RADIUS_MAX = 165;
export const RING2_RADIUS_MAX = 290;
/** Reserved for label text extending past a node's centre, plus padding. */
export const RING_LABEL_MARGIN = 110;
export const RING1_RADIUS_MIN = 70;
export const RING2_RADIUS_MIN = 120;

export interface PlacedNode {
  node: EgoNode;
  x: number;
  y: number;
  hop: 1 | 2;
  /** Weight of the edge back toward the centre (hop 1) or toward its ring-1 parent (hop 2). */
  weight: number;
}

export function edgeEnds(e: EgoEdge): [string, string] {
  const s = typeof e.source === "string" ? e.source : e.source.id;
  const t = typeof e.target === "string" ? e.target : e.target.id;
  return [s, t];
}

export interface EgoLayout {
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
export function computeEgoLayout(params: {
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
    // Every ring-1 node owns an angular "slot" — the gap to its neighbours
    // on the ring, minus a little breathing room — and a parent's ring-2
    // cluster is never allowed to spread past its own slot. That's what
    // stops one busy branch's labels from drifting into an adjacent
    // branch's and overlapping it (the reported bug): however many
    // children a parent has, its cluster is geometrically confined to the
    // space between its own ring-1 neighbours. Within that slot the spread
    // still grows with the child count, so a branch with many children
    // fans out further than a quiet one rather than every branch using the
    // same fixed spread regardless of how crowded it actually is.
    const slotHalfWidth =
      ring1.length > 1 ? (Math.PI / ring1.length) * 0.85 : Math.PI * 0.4;
    const byParent = new Map<string, typeof shown>();
    for (const c of shown) {
      if (!byParent.has(c.parent)) byParent.set(c.parent, []);
      byParent.get(c.parent)!.push(c);
    }
    for (const [parentId, kids] of Array.from(byParent.entries())) {
      const base = angleOf.get(parentId) ?? 0;
      const desiredHalfSpread = Math.min(1.1, 0.16 * kids.length);
      const halfSpread = Math.min(slotHalfWidth, desiredHalfSpread);
      kids.forEach((kid, i) => {
        const offset =
          kids.length === 1
            ? 0
            : -halfSpread + (i / (kids.length - 1)) * halfSpread * 2;
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
export function egoNodeRadius(n: EgoNode, hop: 1 | 2) {
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
export function exportRingRadii(ring1Count: number) {
  const ring1 = Math.min(
    EXPORT_RING1_MAX,
    Math.max(EXPORT_RING1_MIN, Math.round((ring1Count * 145) / (2 * Math.PI)))
  );
  return { ring1, ring2: ring1 + EXPORT_RING_GAP };
}

export function escXml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function truncateLabel(s: string, max = EXPORT_LABEL_MAX_CHARS): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Drawn around a (0,0) origin — placed nodes already carry offsets relative
 * to the focus entity — with the viewBox cropped to whatever the graph
 * actually occupies. A fixed canvas would leave a sparse graph (a couple of
 * links, no second ring) stranded in a mostly-empty page, the same way the
 * Association Map's zoom-to-fit used to blow small graphs up.
 */
export function buildEgoNetworkSvg(params: {
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
    (max, p) =>
      Math.max(max, Math.hypot(p.x, p.y) + egoNodeRadius(p.node, p.hop)),
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
