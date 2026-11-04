/**
 * Zoom for the Team Duty Roster grid. 100% is the grid as it always was and
 * the default; zooming out shrinks the whole grid (names, dates, cells) so
 * more teams show at once. Pure and tested (server/rosterZoom.test.ts).
 */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 1;
export const ZOOM_STEP = 0.05;
/** Below this the shift names inside the cells are too small to read and are
 * left out (the colours stay). */
export const LABELS_OFF_BELOW = 0.55;

/** A zoom kept inside the limits, in steps of 5%. NaN falls back to 100%. */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return MAX_ZOOM;
  const stepped = Math.round(z / ZOOM_STEP) * ZOOM_STEP;
  return (
    Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, stepped)) * 100) / 100
  );
}

/** One step in or out (`dir` +1 / -1). */
export const stepZoom = (z: number, dir: 1 | -1) =>
  clampZoom(z + dir * ZOOM_STEP);

export const labelsHidden = (z: number) => z < LABELS_OFF_BELOW;

/** The zoom that makes the whole grid fit the height available. The grid's
 * size is in proportion to the zoom, so one measurement is enough:
 * `contentHeight` is its height now, at `currentZoom`. Never zooms in past
 * 100% or out past the minimum. */
export function fitZoom(
  availableHeight: number,
  contentHeight: number,
  currentZoom: number
): number {
  if (!(availableHeight > 0) || !(contentHeight > 0) || !(currentZoom > 0))
    return MAX_ZOOM;
  const atFull = contentHeight / currentZoom;
  // Round DOWN to a step so it really fits.
  const z = Math.floor(availableHeight / atFull / ZOOM_STEP) * ZOOM_STEP;
  return clampZoom(Math.max(MIN_ZOOM, z));
}

/** Reads a saved zoom (a number as text); anything else is 100%. */
export function readSavedZoom(raw: string | null): number {
  if (raw === null) return MAX_ZOOM;
  const n = Number(raw);
  return Number.isFinite(n) ? clampZoom(n) : MAX_ZOOM;
}
