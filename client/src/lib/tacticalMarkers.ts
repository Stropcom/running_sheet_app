/**
 * Tactical marker library — traced from the AFP iSurv marker set (docx
 * export of their live map marker library), via a k-means colour
 * segmentation + potrace vectorisation pipeline (see ops session notes
 * for provenance and the pipeline script). Every icon here is a real
 * vector SVG, same as markerSvgs.ts's hand-drawn Surveillance shapes —
 * crisp at any zoom/device-pixel-ratio — rather than a small raster PNG,
 * which is what the very first 18-icon trial batch shipped as and the
 * reason those first 18 ever looked soft on a retina screen. Fixed-
 * colour, unlike the Surveillance set: an officer picks one as-is, no
 * colour swatch to apply.
 *
 * `group` sorts each icon into one of TACTICAL_GROUPS, approved
 * end-to-end against the full ~413-icon source library (574 raw entries
 * in the source doc, minus 161 that were just the same icon re-listed
 * under a second "CT Symbols\" or "Domestic Symbols\" category folder):
 * Target & Associates (4), Tactical (369 — team/callsign colour blocks,
 * cordon & control points, and the generic numbered markers, deliberately
 * one merged heading rather than three), Vehicles (16), Facilities (12,
 * including a handful of general points-of-interest that didn't fit any
 * other heading — Camera, Cell Tower, Coffee Cup, Container, Shopping
 * Centre, Toilets), Other Personnel (12).
 */

import type { TacticalGroup, TacticalIcon } from "./tacticalMarkers/types";
import { ICONS_1 } from "./tacticalMarkers/icons1";
import { ICONS_2 } from "./tacticalMarkers/icons2";
import { ICONS_3 } from "./tacticalMarkers/icons3";

export type { TacticalGroup, TacticalIcon };

export const TACTICAL_GROUPS: { key: TacticalGroup; label: string }[] = [
  { key: "target_associates", label: "Target & Associates" },
  { key: "tactical", label: "Tactical" },
  { key: "vehicles", label: "Vehicles" },
  { key: "facilities", label: "Facilities" },
  { key: "personnel", label: "Other Personnel" },
];

export const TACTICAL_ICONS: TacticalIcon[] = [
  ...ICONS_1,
  ...ICONS_2,
  ...ICONS_3,
];
export const TACTICAL_ICONS_BY_GROUP: Record<TacticalGroup, TacticalIcon[]> =
  TACTICAL_GROUPS.reduce(
    (acc, g) => {
      acc[g.key] = TACTICAL_ICONS.filter(t => t.group === g.key);
      return acc;
    },
    {} as Record<TacticalGroup, TacticalIcon[]>
  );

const TACTICAL_ICON_MAP: Record<string, TacticalIcon> = Object.fromEntries(
  TACTICAL_ICONS.map(t => [t.key, t])
);

export function isTacticalIcon(icon: string): boolean {
  return icon in TACTICAL_ICON_MAP;
}

export function getTacticalIconSrc(icon: string): string | null {
  return TACTICAL_ICON_MAP[icon]?.src ?? null;
}

export function getTacticalIconLabel(icon: string): string | null {
  return TACTICAL_ICON_MAP[icon]?.label ?? null;
}
