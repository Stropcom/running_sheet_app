// Heat Map export pieces shared by the standalone Heat Map PDF and the
// Intelligence Package.
//
// Only the two inner blocks are shared, not a whole section wrapper: the
// standalone export is A4 landscape and sits the map beside the table, while
// a package page is portrait and stacks them. The map snapshot and the Top
// Locations table are identical in both, so those live here and each host
// arranges them.

import { trpcClient } from "@/lib/trpc";

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

/** Top Locations table — colour dot, address, observation count. */
export function buildHeatMapLocationsTableHtml(
  locations: HeatMapExportLocation[]
): string {
  if (!locations.length)
    return `<p class="muted-note">No locations found for this selection.</p>`;
  return `<table class="summary-table">
        <thead><tr><th style="width:28px"></th><th>Location</th><th style="width:90px">Observations</th></tr></thead>
        <tbody>${locations
          .map(
            l =>
              `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${l.colour}"></span></td><td>${esc(l.label)}</td><td>${l.count}</td></tr>`
          )
          .join("")}</tbody>
      </table>`;
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
