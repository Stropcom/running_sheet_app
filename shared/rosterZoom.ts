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

/** Reads a saved zoom (a number as text); anything else is 100%. */
export function readSavedZoom(raw: string | null): number {
  if (raw === null) return MAX_ZOOM;
  const n = Number(raw);
  return Number.isFinite(n) ? clampZoom(n) : MAX_ZOOM;
}

/** The date columns are drawn in blocks of this many (the window moves a block
 * at a time, so scrolling does not redraw on every pixel). */
export const WINDOW_BLOCK = 8;
/** One date column across, in pixels at 100%: the cell and the gap after it. */
export const DATE_STRIDE = 71;

/**
 * Where "go to a date" puts it: the SECOND date column from the names (the
 * first is left as a lead-in, so the day before is still in view). One column
 * is DATE_STRIDE × zoom screen pixels, so this is the scroll position for the
 * date at `dayIndex` (0 = the first date on the roster), never below 0. Today
 * and the month arrows both use it.
 */
export const DATE_SLOT_FROM_NAMES = 1;
export function scrollLeftForDay(dayIndex: number, zoom: number): number {
  return Math.max(0, (dayIndex - DATE_SLOT_FROM_NAMES) * DATE_STRIDE * zoom);
}

/** The reverse: the index of the date sitting in that second column when the
 * grid is scrolled to `scrollLeft` (what the month label follows). */
export function dayIndexAtScroll(scrollLeft: number, zoom: number): number {
  return Math.round(scrollLeft / (DATE_STRIDE * zoom)) + DATE_SLOT_FROM_NAMES;
}

/**
 * Which date columns to draw: those on screen plus a margin either side, in
 * whole blocks. `scrollLeft` and `viewWidth` are screen pixels; the grid is
 * zoomed, so a column is DATE_STRIDE × zoom wide. `start` is inclusive and
 * `end` exclusive, both clamped to 0…totalDays.
 */
export function dateWindowFor(
  scrollLeft: number,
  viewWidth: number,
  zoom: number,
  totalDays: number
): { start: number; end: number } {
  const stride = DATE_STRIDE * (zoom > 0 ? zoom : 1);
  const first = Math.floor(Math.max(0, scrollLeft) / stride);
  const visible = Math.ceil(Math.max(0, viewWidth) / stride) + 1;
  const margin = Math.max(WINDOW_BLOCK, Math.ceil(visible / 4));
  const start =
    Math.floor(Math.max(0, first - margin) / WINDOW_BLOCK) * WINDOW_BLOCK;
  const end = Math.min(
    totalDays,
    Math.ceil((first + visible + margin) / WINDOW_BLOCK) * WINDOW_BLOCK
  );
  return { start: Math.min(start, end), end };
}

/** The empty space standing in for the columns not drawn before / after the
 * window. Rows put 3px between items, and a spacer is one more item, so each
 * is 3px short of its columns; a side with nothing left out has no spacer
 * (`null`). */
export function windowSpacers(
  window: { start: number; end: number },
  totalDays: number
): { lead: number | null; trail: number | null } {
  return {
    lead: window.start > 0 ? window.start * DATE_STRIDE - 3 : null,
    trail:
      window.end < totalDays
        ? (totalDays - window.end) * DATE_STRIDE - 3
        : null,
  };
}
