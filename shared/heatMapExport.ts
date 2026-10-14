/**
 * The Heat Map PDF's map, drawn to match the on-screen Heat Map
 * (shared/heatMapLayout.ts): a Google Static Maps picture with NO pins in it,
 * and our own circles, rank numbers and zoomed insets drawn on top as SVG.
 *
 * The whole approach depends on knowing exactly where a latitude/longitude
 * lands on the returned picture. That is plain Web Mercator: at an integer
 * zoom Z the world is 256 × 2^Z logical pixels wide, and the picture's centre
 * is the `center` we asked for. `project` below is that maths, pinned in
 * server/heatMapExport.test.ts against Google's own published reference
 * point. Static Maps only takes INTEGER zooms, so the fit zoom is rounded
 * down; the picture's real size is read from the image itself rather than
 * trusted from what was requested (a plan may clamp it).
 *
 * Pure and deterministic: no network, no AI.
 */
import {
  HEAT_MIN_PX_BASE,
  HEAT_MIN_PX_EXTRA,
  HEAT_NUMBER_DISC_PX,
  heatRadiusMetres,
  metresPerPixel,
  nudgeApart,
} from "./heatMapLayout";

export interface GeoPoint {
  lat: number;
  lng: number;
}
export interface MapView extends GeoPoint {
  /** Integer zoom — Static Maps does not take fractions. */
  zoom: number;
}
export interface PixelSize {
  width: number;
  height: number;
}

const worldSize = (zoom: number) => 256 * Math.pow(2, zoom);

/** Google's "world coordinate" for a point at `zoom` (Web Mercator, 256 px tiles). */
export function worldPoint(
  lat: number,
  lng: number,
  zoom: number
): { x: number; y: number } {
  const s = Math.min(
    0.9999,
    Math.max(-0.9999, Math.sin((lat * Math.PI) / 180))
  );
  return {
    x: ((lng + 180) / 360) * worldSize(zoom),
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(zoom),
  };
}

/** Where a point lands on a picture of `size` (logical px) centred on `view`. */
export function project(
  view: MapView,
  size: PixelSize,
  lat: number,
  lng: number
): { x: number; y: number } {
  const p = worldPoint(lat, lng, view.zoom);
  const c = worldPoint(view.lat, view.lng, view.zoom);
  return { x: size.width / 2 + (p.x - c.x), y: size.height / 2 + (p.y - c.y) };
}

/**
 * The tightest integer zoom (and centre) at which every point sits inside
 * the picture with `pad` logical px to spare. A single point, or a set too
 * tight to separate, is capped at `maxZoom`.
 */
export function chooseView(
  points: readonly GeoPoint[],
  size: PixelSize,
  pad: number,
  minZoom = 3,
  maxZoom = 16
): MapView {
  if (points.length === 0) return { lat: 0, lng: 0, zoom: minZoom };
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centre = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
  let zoom = minZoom;
  for (let z = minZoom; z <= maxZoom; z++) {
    const a = worldPoint(maxLat, minLng, z);
    const b = worldPoint(minLat, maxLng, z);
    if (b.x - a.x <= size.width - 2 * pad && b.y - a.y <= size.height - 2 * pad)
      zoom = z;
    else break;
  }
  return { ...centre, zoom };
}

/**
 * Groups of places whose numbered discs would overlap on the picture
 * (connected through any chain of near neighbours). Only groups of two or
 * more are returned, biggest first (by total visits).
 */
export function findClusters(
  projected: readonly { x: number; y: number; count: number }[],
  minDistance = HEAT_NUMBER_DISC_PX * 2 + 3
): number[][] {
  const n = projected.length;
  const parent = projected.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      if (
        Math.hypot(
          projected[a].x - projected[b].x,
          projected[a].y - projected[b].y
        ) < minDistance
      )
        parent[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  return Array.from(groups.values())
    .filter(g => g.length >= 2)
    .sort(
      (g1, g2) =>
        g2.reduce((s, i) => s + projected[i].count, 0) -
        g1.reduce((s, i) => s + projected[i].count, 0)
    );
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where to put insets on the main picture: the top corners first, then
 * stacked beneath them — never the bottom edge (Google's logo and copyright
 * sit there and must stay visible), never over a place (or its disc), and
 * never over each other. Returns one rect per inset that fits, in order;
 * an inset that finds no free slot is simply left out.
 */
export function placeInsets(
  main: PixelSize,
  insetSize: PixelSize,
  count: number,
  avoid: readonly { x: number; y: number }[],
  margin = 10
): (Rect | null)[] {
  const { width: iw, height: ih } = insetSize;
  const slots: Rect[] = [
    { x: margin, y: margin, w: iw, h: ih },
    { x: main.width - margin - iw, y: margin, w: iw, h: ih },
    { x: margin, y: margin * 2 + ih, w: iw, h: ih },
    { x: main.width - margin - iw, y: margin * 2 + ih, w: iw, h: ih },
  ];
  const clearOfPlaces = (r: Rect) =>
    r.y + r.h <= main.height - 30 &&
    !avoid.some(p =>
      overlaps(r, {
        x: p.x - HEAT_NUMBER_DISC_PX - 8,
        y: p.y - HEAT_NUMBER_DISC_PX - 8,
        w: (HEAT_NUMBER_DISC_PX + 8) * 2,
        h: (HEAT_NUMBER_DISC_PX + 8) * 2,
      })
    );
  const used: Rect[] = [];
  const out: (Rect | null)[] = [];
  for (let i = 0; i < count; i++) {
    const slot = slots.find(
      s => clearOfPlaces(s) && !used.some(u => overlaps(s, u))
    );
    if (slot) used.push(slot);
    out.push(slot ?? null);
  }
  return out;
}

export interface ExportItem {
  label: string;
  count: number;
  lat: number;
  lng: number;
  rank: number;
  colour: string;
}

/** Ranks places by visits, busiest first; ties keep the order given. */
export function rankLocations<
  T extends { label: string; count: number; lat: number; lng: number },
>(locations: readonly T[]): (T & { rank: number })[] {
  return locations
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.count - a.l.count || a.i - b.i)
    .map(({ l }, k) => ({ ...l, rank: k + 1 }));
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface OverlayOptions {
  /** Draw each circle at its on-screen minimum only (insets), not its
   * real-world size. */
  screenSizeOnly?: boolean;
}

/**
 * The SVG (in picture-logical px, so it scales with the picture) that draws
 * the circles, leader lines and numbered discs for `items` on a picture of
 * `size` centred on `view`. Overlapping discs are nudged apart with a thin
 * line and a small dot back to the true spot.
 */
export function overlayShapesSvg(
  view: MapView,
  size: PixelSize,
  items: readonly ExportItem[],
  maxCount: number,
  opts: OverlayOptions = {}
): string {
  const pts = items.map(it => project(view, size, it.lat, it.lng));
  const nudged = nudgeApart(pts);
  const frac = (c: number) => (maxCount > 0 ? c / maxCount : 0);
  const radius = (it: ExportItem) => {
    const minPx = HEAT_MIN_PX_BASE + frac(it.count) * HEAT_MIN_PX_EXTRA;
    if (opts.screenSizeOnly) return minPx;
    const real =
      heatRadiusMetres(it.count, maxCount) / metresPerPixel(it.lat, view.zoom);
    return Math.max(real, minPx);
  };
  const order = items.map((_, i) => i);
  const f = (n: number) => n.toFixed(1);
  let svg = "";
  // busier places underneath so a small one is never hidden
  [...order]
    .sort((a, b) => items[b].count - items[a].count)
    .forEach(i => {
      svg += `<circle cx="${f(pts[i].x)}" cy="${f(pts[i].y)}" r="${f(radius(items[i]))}" fill="${items[i].colour}" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.95" stroke-width="3"/>`;
    });
  order.forEach(i => {
    if (Math.hypot(nudged[i].x - pts[i].x, nudged[i].y - pts[i].y) > 4)
      svg +=
        `<line x1="${f(pts[i].x)}" y1="${f(pts[i].y)}" x2="${f(nudged[i].x)}" y2="${f(nudged[i].y)}" stroke="#1b2333" stroke-opacity="0.6" stroke-width="2"/>` +
        `<circle cx="${f(pts[i].x)}" cy="${f(pts[i].y)}" r="3" fill="#1b2333"/>`;
  });
  // rank 1 drawn last so it is on top
  [...order]
    .sort((a, b) => items[b].rank - items[a].rank)
    .forEach(i => {
      svg +=
        `<circle cx="${f(nudged[i].x)}" cy="${f(nudged[i].y)}" r="11" fill="#ffffff" stroke="${items[i].colour}" stroke-width="2.5"/>` +
        `<text x="${f(nudged[i].x)}" y="${f(nudged[i].y)}" dy="0.35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#1b2333">${items[i].rank}</text>`;
    });
  return svg;
}

/** Points where the line between two rects' centres leaves `a` and enters `b`. */
export function connectorBetween(
  a: Rect,
  b: Rect
): { x1: number; y1: number; x2: number; y2: number } {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const edge = (
    r: Rect,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const tx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
    const ty = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
    const t = Math.min(tx, ty);
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  const p1 = edge(a, ac, bc);
  const p2 = edge(b, bc, ac);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

export const INSET_LETTERS = ["A", "B", "C"] as const;

/** The dashed box (and its letter tag) marking what an inset covers on the main picture. */
export function insetBoxSvg(box: Rect, letter: string): string {
  const f = (n: number) => n.toFixed(1);
  return (
    `<rect x="${f(box.x)}" y="${f(box.y)}" width="${f(box.w)}" height="${f(box.h)}" fill="none" stroke="#1b2333" stroke-width="2.5" stroke-dasharray="6 4"/>` +
    `<rect x="${f(box.x)}" y="${f(box.y - 17)}" width="20" height="17" fill="#1b2333"/>` +
    `<text x="${f(box.x + 10)}" y="${f(box.y - 8.5)}" dy="0.35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#ffffff">${esc(letter)}</text>`
  );
}
