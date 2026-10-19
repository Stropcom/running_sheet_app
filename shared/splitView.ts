/**
 * Rules for the Fly + Nearmap "split view" on the Map page: the small Nearmap
 * window that sits on top of the 3D Fly map (or, swapped, the small Fly window
 * on top of the flat Nearmap map). Pure and deterministic — the window's
 * position and size, what is remembered per device, when the NM button is
 * offered, and how far to zoom the flat map to match the 3D camera. Used by
 * client/src/components/SplitViewFrame.tsx and the Map page; tested in
 * server/splitView.test.ts.
 */

export interface SplitBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const SPLIT_MIN_W = 160;
export const SPLIT_MIN_H = 120;
/** Distance from the map's top-left corner: just under the Centre on me /
 * Follow me buttons (they sit 60px down and are 40px tall), so the window
 * never covers them. */
export const SPLIT_DEFAULT_LEFT = 10;
export const SPLIT_DEFAULT_TOP = 108;

interface Size {
  width: number;
  height: number;
}

const fin = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Where the window starts: top left, about 30% of the map's width, 4:3. */
export function defaultSplitBox(container: Size): SplitBox {
  const width = Math.round(
    Math.min(Math.max(container.width * 0.3, SPLIT_MIN_W), 380)
  );
  return clampSplitBox(
    {
      left: SPLIT_DEFAULT_LEFT,
      top: SPLIT_DEFAULT_TOP,
      width,
      height: Math.round(width * 0.75),
    },
    container
  );
}

/** Keep the window inside the map and no smaller than a thumbnail. */
export function clampSplitBox(box: SplitBox, container: Size): SplitBox {
  const maxW = Math.max(SPLIT_MIN_W, container.width - 8);
  const maxH = Math.max(SPLIT_MIN_H, container.height - 8);
  const width = Math.min(Math.max(box.width, SPLIT_MIN_W), maxW);
  const height = Math.min(Math.max(box.height, SPLIT_MIN_H), maxH);
  const left = Math.min(
    Math.max(box.left, 0),
    Math.max(0, container.width - width)
  );
  const top = Math.min(
    Math.max(box.top, 0),
    Math.max(0, container.height - height)
  );
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** What was saved for this device (anything malformed counts as "nothing saved"). */
export function parseSplitSettings(raw: unknown): {
  on: boolean;
  box: SplitBox | null;
} {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const b = s.nmSplitBox as Record<string, unknown> | undefined;
  const box =
    b && fin(b.left) && fin(b.top) && fin(b.width) && fin(b.height)
      ? {
          left: b.left,
          top: b.top,
          width: b.width,
          height: b.height,
        }
      : null;
  return { on: s.nmSplitOn === true, box };
}

/** The NM button is offered only in Fly, never on a phone, and only when the
 * server has a Nearmap key. */
export function splitViewAvailable(o: {
  flyOpen: boolean;
  phone: boolean;
  nearmapConfigured: boolean;
}): boolean {
  return o.flyOpen && !o.phone && o.nearmapConfigured;
}

/**
 * The flat map zoom that shows about what the 3D camera shows. At straight-down
 * the 3D view covers a ground width of roughly the camera's range, so the zoom
 * is the one where `widthPx` pixels span that many metres. Whole numbers only
 * (the aerial layer is built from fixed zoom levels), clamped to 3–21.
 */
export function zoomForRange(
  rangeM: number,
  latDeg: number,
  widthPx: number
): number {
  if (!fin(rangeM) || rangeM <= 0 || !fin(widthPx) || widthPx <= 0) return 17;
  const cos = Math.max(0.05, Math.cos((latDeg * Math.PI) / 180));
  const z = Math.log2((156543.03392 * cos * widthPx) / rangeM);
  return Math.min(21, Math.max(3, Math.round(z)));
}
