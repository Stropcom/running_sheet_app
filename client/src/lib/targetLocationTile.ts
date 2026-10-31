import { MARKER_COLOURS, type MarkerColour } from "@/lib/markerSvgs";
import { tileStyle } from "@shared/targetLocation";

/** The Target Location tile: a soft see-through square, in the marker's own
 * colour, centred behind the icon (see shared/targetLocation.ts). Null when
 * the colour isn't one it can read. The caller puts it first in the marker
 * and lifts the icon, count badge and photo pill above it. */
export function createTargetLocationTile(
  iconPx: number,
  colour: MarkerColour
): HTMLDivElement | null {
  const hex = MARKER_COLOURS[colour];
  const t = hex ? tileStyle(iconPx, hex) : null;
  if (!t) return null;
  const tile = document.createElement("div");
  tile.setAttribute("data-target-location-tile", "1");
  tile.style.cssText = `position:absolute;z-index:0;pointer-events:none;left:${t.offsetPx}px;top:${t.offsetPx}px;width:${t.sizePx}px;height:${t.sizePx}px;border-radius:${t.radiusPx}px;background:${t.background};box-shadow:${t.boxShadow};`;
  return tile;
}

/** After an officer changes a marker's colour in place, the tile (if the
 * marker has one) follows it without waiting for a redraw. */
export function recolourTargetLocationTile(
  markerEl: Element | null | undefined,
  colour: MarkerColour
): void {
  const tile = markerEl?.querySelector<HTMLElement>(
    "[data-target-location-tile]"
  );
  const hex = MARKER_COLOURS[colour];
  const t = tile && hex ? tileStyle(40, hex) : null;
  if (!tile || !t) return;
  tile.style.background = t.background;
  tile.style.boxShadow = t.boxShadow;
}
