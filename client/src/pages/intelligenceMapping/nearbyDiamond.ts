import {
  NEARBY_BAND_COLOURS,
  distanceBand,
  formatNearbyDistance,
} from "@shared/nearbyLocations";
import { type IntelMapLocation } from "./mapTypes";

// ── NEARBY LOCATION diamonds ───────────────────────────────────────────────────
// A diamond (fill = type: red target address, purple associate / observed;
// ring and distance pill = how close: red 100 m or less, amber 250 m, blue
// 500 m). Drawn in addition to the normal pins, under them.
export const NEARBY_HOUSE_GLYPH =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="position:absolute;left:10px;top:10px;fill:#fff;pointer-events:none"><path d="M3 11 12 3l9 8v9h-6v-6H9v6H3z"/></svg>';

export function createNearbyDiamondElement(
  type: IntelMapLocation["type"],
  distance: number
): HTMLElement {
  const el = document.createElement("div");
  el.className = "nearby-diamond";
  el.style.cssText = "position:relative;width:38px;height:38px;cursor:pointer;";
  const shape = document.createElement("div");
  shape.className = "nearby-diamond-shape";
  shape.style.cssText = `position:absolute;inset:5px;transform:rotate(45deg);background:${
    type === "target_address" ? "#dc2626" : "#7c3aed"
  };border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.45);`;
  el.appendChild(shape);
  el.insertAdjacentHTML("beforeend", NEARBY_HOUSE_GLYPH);
  const pill = document.createElement("div");
  pill.className = "nearby-diamond-pill";
  pill.style.cssText =
    "position:absolute;left:50%;top:41px;transform:translateX(-50%);color:#fff;font:800 12px/1.35 system-ui,sans-serif;padding:1px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.4);pointer-events:none;";
  el.appendChild(pill);
  updateNearbyDiamondElement(el, distance);
  return el;
}

/** Re-colours a diamond and rewrites its distance as the officer moves. */
export function updateNearbyDiamondElement(el: HTMLElement, distance: number) {
  const colour = NEARBY_BAND_COLOURS[distanceBand(distance)];
  const shape = el.querySelector<HTMLElement>(".nearby-diamond-shape");
  if (shape) shape.style.border = `3px solid ${colour}`;
  const pill = el.querySelector<HTMLElement>(".nearby-diamond-pill");
  if (pill) {
    pill.style.background = colour;
    pill.textContent = formatNearbyDistance(distance);
  }
  el.classList.toggle("nearby-diamond-close", distance <= 100);
}
