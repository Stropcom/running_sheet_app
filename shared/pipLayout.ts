// Where a picture-in-picture panel (Street View, Photos) opens on the Map page.
// One rule for both, so they land in the same place: the top-left, just under
// the Follow me / Centre on me buttons (top 60px + 40px high). When another
// panel is already open there, the new one goes beside it (to its right, on the
// same row, side by side across the top); if there is no room to the right, it
// goes on the next row down. Pure and deterministic — the browser measures, this
// decides. A panel the officer has dragged somewhere is never moved; this is
// only the position a panel opens at.

export interface PipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Under the Follow me row: left 10, top 110 (the Photos panel's old spot). */
export const PIP_START = { left: 10, top: 110 } as const;
export const PIP_GAP = 10;
export const PIP_MARGIN = 8;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const overlaps = (a: PipRect, b: PipRect, gap: number) =>
  a.left < b.left + b.width + gap &&
  a.left + a.width + gap > b.left &&
  a.top < b.top + b.height + gap &&
  a.top + a.height + gap > b.top;

export function defaultPipPosition(args: {
  container: { width: number; height: number };
  size: { width: number; height: number };
  /** The other panels open right now, in the container's own coordinates. */
  others: PipRect[];
  start?: { left: number; top: number };
  gap?: number;
  margin?: number;
}): { left: number; top: number } {
  const {
    container,
    size,
    others,
    start = PIP_START,
    gap = PIP_GAP,
    margin = PIP_MARGIN,
  } = args;
  let left = start.left;
  let top = start.top;
  for (let guard = 0; guard < 24; guard++) {
    const here: PipRect = { left, top, width: size.width, height: size.height };
    const hit = others.filter(o => overlaps(here, o, gap));
    if (hit.length === 0) break;
    // Beside the right-most panel in the way, on this row, if it fits...
    const rightEdge = Math.max(...hit.map(o => o.left + o.width)) + gap;
    if (rightEdge + size.width <= container.width - margin) {
      left = rightEdge;
      continue;
    }
    // ...otherwise the next row down, back at the left.
    left = start.left;
    top = Math.max(...hit.map(o => o.top + o.height)) + gap;
  }
  return {
    left: clamp(
      left,
      margin,
      Math.max(margin, container.width - size.width - margin)
    ),
    top: clamp(
      top,
      margin,
      Math.max(margin, container.height - size.height - margin)
    ),
  };
}
