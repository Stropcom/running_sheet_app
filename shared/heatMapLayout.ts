/**
 * Sizing and spacing rules for the Heat Map's circles (client/src/pages/
 * IntelligenceHeatMap.tsx). Pure functions so the rules can be tested.
 *
 * The circles are sized in metres, so zoomed out to fit a whole region a
 * one-visit place shrank to a few pixels. Each circle now keeps a MINIMUM
 * on-screen size at every zoom (busier places are still larger), and every
 * place carries its rank number — the same number as the Top Locations list.
 * Places that land on top of each other at a wide zoom have their numbers
 * nudged apart, with a thin line back to the true spot.
 */

/** The real-world radius a circle has when zoomed in far enough to show it. */
export const HEAT_RADIUS_MIN_M = 120;
export const HEAT_RADIUS_MAX_M = 550;

/** The smallest on-screen radius (pixels) a circle may shrink to. */
export const HEAT_MIN_PX_BASE = 14;
export const HEAT_MIN_PX_EXTRA = 14;

/** Radius of the numbered disc drawn at each place, in pixels. */
export const HEAT_NUMBER_DISC_PX = 12;

/** Metres covered by one pixel at `lat` and `zoom` (256 px tiles). */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** The circle's real-world radius from its visit count. */
export function heatRadiusMetres(count: number, maxCount: number): number {
  const frac = maxCount > 0 ? count / maxCount : 0;
  return HEAT_RADIUS_MIN_M + frac * (HEAT_RADIUS_MAX_M - HEAT_RADIUS_MIN_M);
}

/** The circle's smallest on-screen radius in pixels. */
export function heatMinPixels(count: number, maxCount: number): number {
  const frac = maxCount > 0 ? count / maxCount : 0;
  return HEAT_MIN_PX_BASE + frac * HEAT_MIN_PX_EXTRA;
}

/**
 * The radius (metres) to draw at this zoom: the real-world size, or the
 * minimum on-screen size if that is bigger.
 */
export function heatRadiusFor(
  count: number,
  maxCount: number,
  lat: number,
  zoom: number
): number {
  return Math.max(
    heatRadiusMetres(count, maxCount),
    heatMinPixels(count, maxCount) * metresPerPixel(lat, zoom)
  );
}

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Moves points apart until no two of their discs (radius `radius` each, plus
 * `gap`) overlap. Deterministic: points on exactly the same spot are pushed
 * apart in a direction taken from their order. Points that never overlap are
 * returned exactly where they were.
 */
export function nudgeApart(
  points: readonly PixelPoint[],
  radius = HEAT_NUMBER_DISC_PX,
  gap = 3,
  passes = 40
): PixelPoint[] {
  const out = points.map(p => ({ x: p.x, y: p.y }));
  const need = radius * 2 + gap;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let a = 0; a < out.length; a++) {
      for (let b = a + 1; b < out.length; b++) {
        const dx = out[b].x - out[a].x;
        const dy = out[b].y - out[a].y;
        const d = Math.hypot(dx, dy);
        if (d >= need) continue;
        let ux: number;
        let uy: number;
        if (d < 0.5) {
          ux = Math.cos(a * 2.399 + b);
          uy = Math.sin(a * 2.399 + b);
        } else {
          ux = dx / d;
          uy = dy / d;
        }
        const push = (need - d) / 2;
        out[a].x -= ux * push;
        out[a].y -= uy * push;
        out[b].x += ux * push;
        out[b].y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * The radius (pixels) of a place's soft fade on the Map page: at least
 * `HEAT_FADE_MIN_PX_BASE` (more for busier places) however far the map is
 * zoomed out, growing with the real-world area once zoomed in. A fade needs
 * more room than a hard-edged circle because it thins out towards the edge.
 */
export const HEAT_FADE_MIN_PX_BASE = 34;
export const HEAT_FADE_MIN_PX_EXTRA = 30;
export const HEAT_FADE_REAL_SCALE = 1.5;
/** Never larger than this on screen, so zoomed right in a fade doesn't wash
 * over the whole map. */
export const HEAT_FADE_MAX_PX = 320;

export function heatFadeRadiusPx(
  count: number,
  maxCount: number,
  lat: number,
  zoom: number
): number {
  const frac = maxCount > 0 ? count / maxCount : 0;
  const real =
    (heatRadiusMetres(count, maxCount) * HEAT_FADE_REAL_SCALE) /
    metresPerPixel(lat, zoom);
  return Math.min(
    HEAT_FADE_MAX_PX,
    Math.max(real, HEAT_FADE_MIN_PX_BASE + frac * HEAT_FADE_MIN_PX_EXTRA)
  );
}
