// Heat Map export pieces shared by the standalone Heat Map PDF and the
// Intelligence Package.
//
// Only the two inner blocks are shared, not a whole section wrapper: the
// standalone export is A4 landscape and sits the map beside the table, while
// a package page is portrait and stacks them. The map snapshot and the Top
// Locations table are identical in both, so those live here and each host
// arranges them.

import { trpcClient } from "@/lib/trpc";
import {
  INSET_LETTERS,
  chooseView,
  connectorBetween,
  findClusters,
  insetBoxSvg,
  overlayShapesSvg,
  placeInsets,
  project,
  rankLocations,
  type ExportItem,
  type MapView,
  type PixelSize,
  type Rect,
} from "@shared/heatMapExport";

/** Cool → hot, six stops — used for the live map's gradient, the Top
 * Locations intensity dots and the exported static-map pins, so all three
 * read as the same scale. */
export const HEAT_RAMP = [
  "#2f6fed",
  "#1fb6c9",
  "#7bc142",
  "#f2c230",
  "#f0862c",
  "#dd3a3a",
];

/** Ramp colour for one location's visit count, relative to the busiest
 * location in the same set. `maxCount` of 0 falls back to the cool end. */
export function heatColourFor(count: number, maxCount: number): string {
  if (maxCount <= 0) return HEAT_RAMP[0];
  const idx = Math.min(
    HEAT_RAMP.length - 1,
    Math.floor((count / maxCount) * (HEAT_RAMP.length - 1))
  );
  return HEAT_RAMP[idx];
}

export interface HeatMapExportLocation {
  label: string;
  count: number;
  colour: string;
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The static-map snapshot, or a note explaining why there isn't one. */
export function buildHeatMapImageHtml(mapImageDataUrl: string | null): string {
  return mapImageDataUrl
    ? `<img src="${mapImageDataUrl}" style="width:100%;border-radius:6px;display:block" />`
    : `<p class="muted-note">No geocoded locations to plot for this selection.</p>`;
}

/** Top Locations table — rank badge (the number on the map), address,
 * observation count. Ranked busiest first, ties in the order given — the
 * same ranking the map uses (shared/heatMapExport.ts rankLocations). */
export function buildHeatMapLocationsTableHtml(
  locations: HeatMapExportLocation[]
): string {
  if (!locations.length)
    return `<p class="muted-note">No locations found for this selection.</p>`;
  const ranked = locations
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.count - a.l.count || a.i - b.i)
    .map(({ l }, k) => ({ ...l, rank: k + 1 }));
  return `<table class="summary-table">
        <thead><tr><th style="width:34px"></th><th>Location</th><th style="width:90px">Observations</th></tr></thead>
        <tbody>${ranked
          .map(
            l =>
              `<tr><td><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${l.colour};color:${textOnColour(l.colour)};font-size:10.5px;font-weight:700;border:2px solid #fff;box-shadow:0 0 0 1px #9aa3b2">${l.rank}</span></td><td>${esc(l.label)}</td><td>${l.count}</td></tr>`
          )
          .join("")}</tbody>
      </table>`;
}

/** Dark text on a light heat colour (yellow, green, cyan), white otherwise. */
function textOnColour(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1b2333" : "#ffffff";
}

/**
 * Fetches the static-map snapshot for a set of heat map locations.
 *
 * Returns null rather than throwing when the map service can't be reached —
 * the Top Locations table is still worth exporting on its own, so callers
 * fall back to the muted note in the Map block instead of failing the whole
 * document.
 */
export async function fetchHeatMapStaticImage(
  locations: { lat: number; lng: number; count: number }[],
  maxCount: number,
  size = "720x540"
): Promise<string | null> {
  if (!locations.length) return null;
  try {
    const result = await trpcClient.rsMapping.getStaticMapImage.query({
      waypoints: locations.map((l, i) => ({
        lat: l.lat,
        lng: l.lng,
        index: i,
        colour: heatColourFor(l.count, maxCount),
        size: "small" as const,
      })),
      size,
    });
    return result.dataUrl;
  } catch {
    return null;
  }
}

// ─── Map with circles, rank numbers and zoomed insets ───────────────────────
// The export's map used to be a Google Static Maps picture with small coloured
// pins. It is now a pin-free picture with the same circles and rank numbers
// as the on-screen Heat Map drawn over it, plus a zoomed inset for any
// cluster of places that overlap at the full-region view. See
// shared/heatMapExport.ts for the maths. If anything in this path fails, the
// export quietly falls back to the old pin map, so it never ends up without
// a map because of this.

const MAIN_SIZE: PixelSize = { width: 720, height: 540 };
const INSET_SIZE: PixelSize = { width: 250, height: 210 };
const MAX_INSETS = 3;
/** Static Maps is requested with scale=2 (server/routers.ts), so the picture
 * has twice as many pixels as its logical size. */
const STATIC_MAP_SCALE = 2;

async function staticMapPicture(
  view: MapView,
  size: PixelSize
): Promise<{ url: string; size: PixelSize }> {
  const result = await trpcClient.rsMapping.getStaticMapImage.query({
    waypoints: [],
    center: { lat: view.lat, lng: view.lng },
    zoom: view.zoom,
    size: `${size.width}x${size.height}`,
  });
  // Use the picture's own size, not the requested one: if the service clamps
  // it, the centre and zoom still hold, so the maths stays right.
  const actual = await new Promise<PixelSize>((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth / STATIC_MAP_SCALE,
        height: img.naturalHeight / STATIC_MAP_SCALE,
      });
    img.onerror = () => reject(new Error("map picture would not load"));
    img.src = result.dataUrl;
  });
  if (!(actual.width > 0 && actual.height > 0))
    throw new Error("map picture has no size");
  return { url: result.dataUrl, size: actual };
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(3)}%`;

/**
 * The map block for an export: the picture with circles, rank numbers and
 * insets drawn on it. Never throws; falls back to the old pin map, then to
 * the "No geocoded locations" note.
 */
export async function fetchHeatMapMapHtml(
  locations: { label: string; lat: number; lng: number; count: number }[],
  maxCount: number
): Promise<string> {
  if (!locations.length) return buildHeatMapImageHtml(null);
  try {
    const items: ExportItem[] = rankLocations(locations).map(l => ({
      ...l,
      colour: heatColourFor(l.count, maxCount),
    }));
    const view = chooseView(items, MAIN_SIZE, 70);
    const main = await staticMapPicture(view, MAIN_SIZE);
    const projected = items.map(it => ({
      ...project(view, main.size, it.lat, it.lng),
      count: it.count,
    }));

    // One inset per cluster of places that overlap on the main picture.
    const clusters = findClusters(projected).slice(0, MAX_INSETS);
    const wanted = clusters
      .map(idx => {
        const members = idx.map(i => items[i]);
        const iv = chooseView(members, INSET_SIZE, 40, view.zoom, 17);
        return iv.zoom > view.zoom ? { idx, members, view: iv } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const pics = await Promise.all(
      wanted.map(w => staticMapPicture(w.view, INSET_SIZE).catch(() => null))
    );
    const ready = wanted
      .map((w, i) => ({ ...w, pic: pics[i] }))
      .filter(
        (w): w is typeof w & { pic: NonNullable<typeof w.pic> } =>
          w.pic !== null
      );
    const slots = placeInsets(
      main.size,
      ready[0]?.pic.size ?? INSET_SIZE,
      ready.length,
      projected
    );
    const placed = ready
      .map((w, i) => ({ ...w, slot: slots[i] }))
      .filter((w): w is typeof w & { slot: Rect } => w.slot !== null)
      .map((w, i) => ({ ...w, letter: INSET_LETTERS[i] }));

    let mainSvg = overlayShapesSvg(view, main.size, items, maxCount);
    for (const w of placed) {
      const pts = w.idx.map(i => projected[i]);
      const box: Rect = {
        x: Math.min(...pts.map(p => p.x)) - 30,
        y: Math.min(...pts.map(p => p.y)) - 30,
        w: Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)) + 60,
        h: Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y)) + 60,
      };
      const c = connectorBetween(box, w.slot);
      mainSvg +=
        `<line x1="${c.x1.toFixed(1)}" y1="${c.y1.toFixed(1)}" x2="${c.x2.toFixed(1)}" y2="${c.y2.toFixed(1)}" stroke="#1b2333" stroke-opacity="0.6" stroke-width="1.5"/>` +
        insetBoxSvg(box, w.letter);
    }
    const insetsHtml = placed
      .map(w => {
        const { slot, pic, letter } = w;
        return (
          `<div style="position:absolute;left:${pct(slot.x, main.size.width)};top:${pct(slot.y, main.size.height)};width:${pct(slot.w, main.size.width)};height:${pct(slot.h, main.size.height)};box-sizing:border-box;border:3px solid #1b2333;border-radius:6px;overflow:hidden;background:#fff">` +
          `<div style="position:absolute;left:0;top:0;right:0;bottom:0">` +
          `<img src="${pic.url}" style="display:block;width:100%;height:100%" />` +
          `<svg viewBox="0 0 ${pic.size.width} ${pic.size.height}" style="position:absolute;left:0;top:0;width:100%;height:100%">${overlayShapesSvg(w.view, pic.size, items, maxCount, { screenSizeOnly: true })}</svg>` +
          `<div style="position:absolute;left:0;top:0;right:0;background:#1b2333;color:#fff;font:700 9px Arial,sans-serif;letter-spacing:0.05em;padding:2px 6px;line-height:1.3">${letter} &middot; ZOOMED IN</div>` +
          `</div></div>`
        );
      })
      .join("");
    return (
      `<div style="position:relative;width:100%;aspect-ratio:${main.size.width} / ${main.size.height};line-height:0">` +
      `<img src="${main.url}" style="display:block;width:100%;height:100%;border-radius:6px" />` +
      `<svg viewBox="0 0 ${main.size.width} ${main.size.height}" style="position:absolute;left:0;top:0;width:100%;height:100%">${mainSvg}</svg>` +
      insetsHtml +
      `</div>`
    );
  } catch {
    return buildHeatMapImageHtml(
      await fetchHeatMapStaticImage(locations, maxCount)
    );
  }
}
