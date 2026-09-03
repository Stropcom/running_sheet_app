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
  const slotWidthOf = new Map<string, number>();

  // Work out each ring-1 node's ring-2 children *before* placing ring-1
  // angles, so the angle pass can size each node's angular "slot" to how
  // much it's actually carrying — a leaf branch (no children) only needs
  // room for its own label, while a busy branch needs enough arc for every
  // child to fan out. Splitting the circle evenly regardless of that (the
  // old behaviour) is exactly what produced the reported "squashed" look:
  // a vehicle with five address children got the same sliver as a bare
  // leaf address next to it.
  let ring2Shown: { id: string; parent: string; weight: number }[] = [];
  let hidden2 = 0;
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
    ring2Shown = candidates.slice(0, RING2_MAX);
    hidden2 = candidates.length - ring2Shown.length;
  }
  const childCountByParent = new Map<string, number>();
  for (const c of ring2Shown) {
    childCountByParent.set(
      c.parent,
      (childCountByParent.get(c.parent) ?? 0) + 1
    );
  }

  // Weighted angular slots: a ring-1 node's share of the circle is
  // proportional to 1 + its child count instead of a flat 1/ring1.length,
  // so quiet single-arm branches sit closer together and busy branches get
  // the extra room their fan-out needs. A floor (half of what an even
  // split would have given every node) stops a very busy branch from
  // starving its neighbours down to nothing — any slack clawed back by the
  // floor is taken proportionally from the branches that still have room
  // to spare, not just chopped off the total.
  const n = Math.max(1, ring1.length);
  const uniformWidth = (Math.PI * 2) / n;
  const minWidth = uniformWidth * 0.5;
  const rawWeights = ring1.map(r => 1 + (childCountByParent.get(r.id) ?? 0));
  const rawTotal = rawWeights.reduce((a, b) => a + b, 0) || 1;
  const widths = rawWeights.map(w => (w / rawTotal) * Math.PI * 2);
  let deficit = 0;
  for (let i = 0; i < widths.length; i++) {
    if (widths[i] < minWidth) {
      deficit += minWidth - widths[i];
      widths[i] = minWidth;
    }
  }
  if (deficit > 0) {
    const donorTotal = widths.reduce(
      (sum, w) => sum + (w > minWidth ? w - minWidth : 0),
      0
    );
    if (donorTotal > 0) {
      for (let i = 0; i < widths.length; i++) {
        if (widths[i] > minWidth) {
          const share = (widths[i] - minWidth) / donorTotal;
          widths[i] -= deficit * share;
        }
      }
    }
  }

  let cursor = -Math.PI / 2;
  ring1.forEach((entry, i) => {
    const width = widths[i] ?? uniformWidth;
    const angle = cursor + width / 2;
    cursor += width;
    angleOf.set(entry.id, angle);
    slotWidthOf.set(entry.id, width);
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

  const ring2Parent = new Map<string, string>();
  if (hops === 2) {
    // Fan each parent's children out around that parent's own angle, never
    // past its own weighted slot (minus a little breathing room) — that's
    // what stops one busy branch's labels from drifting into an adjacent
    // branch's and overlapping it. Within the slot the spread still grows
    // with the child count, so a branch with many children fans out
    // further than a quiet one.
    const byParent = new Map<string, typeof ring2Shown>();
    for (const c of ring2Shown) {
      if (!byParent.has(c.parent)) byParent.set(c.parent, []);
      byParent.get(c.parent)!.push(c);
    }
    for (const [parentId, kids] of Array.from(byParent.entries())) {
      const base = angleOf.get(parentId) ?? 0;
      const slotHalfWidth = (slotWidthOf.get(parentId) ?? uniformWidth) * 0.425;
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
/** SVG has no native text wrapping, so labels are hand-wrapped onto at
 * most this many lines (see wrapLabelLines) — one per hop, since ring-2's
 * smaller font fits more characters per line than ring-1's. */
const EXPORT_LABEL_MAX_LINES = 2;
const EXPORT_LABEL_CHARS_PER_LINE_HOP1 = 20;
const EXPORT_LABEL_CHARS_PER_LINE_HOP2 = 17;
const EXPORT_LABEL_CHARS_PER_LINE_CENTRE = 24;
/** Room a centred label needs either side of / below its node — Y accounts
 * for a 2-line label, not just one. */
const EXPORT_LABEL_PAD_X = 115;
const EXPORT_LABEL_PAD_Y = 60;

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

/**
 * Wraps `s` onto at most `maxLines` lines of roughly `maxCharsPerLine`
 * characters each, breaking at word boundaries — SVG <text> has no native
 * wrapping, so the caller renders one <tspan> per returned line. Mirrors
 * the live view's line-clamp-2 behaviour: word-wraps everything first,
 * then only ellipsizes the last kept line if there was more text than fit
 * in maxLines, rather than cutting off mid-word right after maxCharsPerLine
 * the way the old single-line truncateLabel did.
 */
export function wrapLabelLines(
  s: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const words = s.trim().split(/\s+/).filter(Boolean);
  const allLines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      allLines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) allLines.push(current);
  if (allLines.length === 0) return [""];
  if (allLines.length <= maxLines) return allLines;

  const kept = allLines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] =
    last.length >= maxCharsPerLine
      ? `${last.slice(0, maxCharsPerLine - 1)}…`
      : `${last}…`;
  return kept;
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
      const charsPerLine =
        p.hop === 1
          ? EXPORT_LABEL_CHARS_PER_LINE_HOP1
          : EXPORT_LABEL_CHARS_PER_LINE_HOP2;
      const lines = wrapLabelLines(
        p.node.label,
        charsPerLine,
        EXPORT_LABEL_MAX_LINES
      );
      const startY = p.y + r + 13;
      const lineHeight = fontSize + 3;
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${p.x.toFixed(1)}" y="${(startY + i * lineHeight).toFixed(1)}">${escXml(line)}</tspan>`
        )
        .join("");
      return `<g>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${colour}" fill-opacity="${p.hop === 1 ? 1 : 0.75}"/>
      <text text-anchor="middle" font-size="${fontSize}" font-family="-apple-system, 'Segoe UI', Arial, sans-serif" fill="${fill}" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">${tspans}</text>
    </g>`;
    })
    .join("\n    ");

  const centreLines = wrapLabelLines(
    focusNode.label,
    EXPORT_LABEL_CHARS_PER_LINE_CENTRE,
    EXPORT_LABEL_MAX_LINES
  );
  const centreLineHeight = 16;
  const centreTspans = centreLines
    .map(
      (line, i) =>
        `<tspan x="0" y="${46 + i * centreLineHeight}">${escXml(line)}</tspan>`
    )
    .join("");
  const centre = `
    <circle cx="0" cy="0" r="34" fill="${centreColour}" fill-opacity="0.16"/>
    <circle cx="0" cy="0" r="22" fill="${centreColour}"/>
    <text text-anchor="middle" font-size="13" font-weight="700" font-family="-apple-system, 'Segoe UI', Arial, sans-serif" fill="#0f172a" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">${centreTspans}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" style="display:block" preserveAspectRatio="xMidYMid meet">
    <rect x="${-halfW}" y="${-halfH}" width="${halfW * 2}" height="${halfH * 2}" fill="#ffffff"/>
    ${guides}
    ${edgeEls}
    ${centre}
    ${nodeEls}
  </svg>`;
}
