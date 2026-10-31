import { MARKER_COLOURS, type MarkerColour } from "@/lib/markerSvgs";
import {
  HOUSE_GLOW_PATH,
  houseGlowStyle,
  tileShapeFor,
  tileStyle,
} from "@shared/targetLocation";

const ATTR = "data-target-location-tile";

/** The Target Location ("Target Markers") mark: a soft see-through shape in the
 * marker's own colour, centred behind the icon (rules in
 * shared/targetLocation.ts). A house icon gets a house-shaped glow that turns
 * with the icon; any other icon gets a rounded square. Null when the colour
 * isn't one it can read. The caller puts it first in the marker and lifts the
 * icon, count badge and photo pill above it. */
export function createTargetLocationTile(
  iconPx: number,
  colour: MarkerColour,
  icon: string,
  rotation = 0
): HTMLDivElement | null {
  const hex = MARKER_COLOURS[colour];
  if (!hex) return null;
  const tile = document.createElement("div");
  tile.setAttribute(ATTR, "1");
  if (tileShapeFor(icon) === "house") {
    const g = houseGlowStyle(iconPx, hex);
    if (!g) return null;
    tile.setAttribute("data-shape", "house");
    tile.style.cssText = `position:absolute;z-index:0;pointer-events:none;left:0;top:0;width:${g.sizePx}px;height:${g.sizePx}px;transform:rotate(${rotation}deg);filter:blur(${g.blurPx}px);`;
    tile.innerHTML = `<svg viewBox="0 0 48 48" width="${g.sizePx}" height="${g.sizePx}" style="overflow:visible;display:block" aria-hidden="true"><g opacity="${g.opacity}"><path d="${HOUSE_GLOW_PATH}" fill="rgb(${g.rgb})" stroke="rgb(${g.rgb})" stroke-width="${g.strokeWidth}" stroke-linejoin="round"/></g></svg>`;
    return tile;
  }
  const t = tileStyle(iconPx, hex);
  if (!t) return null;
  tile.setAttribute("data-shape", "square");
  tile.style.cssText = `position:absolute;z-index:0;pointer-events:none;left:${t.offsetPx}px;top:${t.offsetPx}px;width:${t.sizePx}px;height:${t.sizePx}px;border-radius:${t.radiusPx}px;background:${t.background};box-shadow:${t.boxShadow};`;
  return tile;
}

/** After an officer changes a marker's icon or colour in place, its mark (if it
 * has one) follows at once, without waiting for a redraw. */
export function refreshTargetLocationTile(
  markerEl: Element | null | undefined,
  colour: MarkerColour,
  icon: string,
  rotation: number
): void {
  const old = markerEl?.querySelector<HTMLElement>(`[${ATTR}]`);
  if (!markerEl || !old) return;
  const fresh = createTargetLocationTile(40, colour, icon, rotation);
  if (fresh) old.replaceWith(fresh);
}

/** The rotation slider turns the icon; a house glow turns with it. */
export function rotateTargetLocationTile(
  markerEl: Element | null | undefined,
  rotation: number
): void {
  const tile = markerEl?.querySelector<HTMLElement>(
    `[${ATTR}][data-shape="house"]`
  );
  if (tile) tile.style.transform = `rotate(${rotation}deg)`;
}
