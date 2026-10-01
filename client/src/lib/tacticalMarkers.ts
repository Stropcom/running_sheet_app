/**
 * Tactical marker library — traced from the AFP iSurv marker set (see
 * ops session notes for provenance). Mostly fixed-colour raster icons,
 * unlike markerSvgs.ts's recolourable vector shapes — an officer picks one
 * as-is, no colour swatch to apply — EXCEPT the handful flagged
 * recolorable: true below, which get tinted via an SVG <mask> (see
 * getMarkerIconUrl in markerSvgs.ts). This is a 18-icon trial batch, not
 * the full ~420-icon iSurv library — extend TACTICAL_ICONS the same way
 * (key, label, a /tactical-markers/<key>.png in client/public/) once more
 * are traced.
 */

// The recolorable icons' own PNGs live under src/assets, not public/, and
// are imported as real ES modules rather than referenced by path string —
// Vite inlines a file this small (all seven are well under its default
// 4KB assetsInlineLimit) as a base64 data: URI at build time. That inlined
// form is required for the masking technique in getMarkerIconUrl: it
// renders each tinted icon via an SVG wrapped in an <img src="data:...">,
// and a browser loading an SVG that way sandboxes it against loading any
// FURTHER external resource — confirmed by direct testing: pointing the
// mask's <image href> at the same /tactical-markers/<key>.png public path
// the non-recolorable icons use rendered completely blank, every time,
// regardless of colour. A data: URI has no further fetch to sandbox, so
// it works.
import afpPng from "../assets/tactical-markers/afp.png";
import circle1Png from "../assets/tactical-markers/circle_1.png";
import fapAPng from "../assets/tactical-markers/fap_a.png";
import footApproachPng from "../assets/tactical-markers/foot_approach.png";
import fupPng from "../assets/tactical-markers/fup.png";
import dirSierra1Png from "../assets/tactical-markers/dir_sierra_1.png";
import layUpPointPng from "../assets/tactical-markers/lay_up_point.png";

export interface TacticalIcon {
  key: string;
  label: string;
  src: string;
  // True for a simple, single-flat-colour symbol/badge whose colour is
  // arbitrary — safe to let an officer recolour via the same swatch
  // picker Surveillance icons use (see isTacticalIconRecolorable and
  // getMarkerIconUrl in markerSvgs.ts for how, without re-tracing the
  // artwork). Left false/omitted for a realistic vehicle depiction
  // (ambulance, fire truck, police car, Amarok, Bearcat) or an icon whose
  // colour IS part of its meaning (the Red/Blue house pair, the Indicator
  // diamond's four fixed quadrant colours, Hospital's conventional blue
  // cross, Police Station's blue star, Friendly Address's conventional
  // "blue = friendly" convention) — recolouring those would make them
  // misleading rather than useful.
  recolorable?: boolean;
}

export const TACTICAL_ICONS: TacticalIcon[] = [
  { key: "afp", label: "AFP", src: afpPng, recolorable: true },
  {
    key: "a_red_1ae",
    label: "A_Red_1AE",
    src: "/tactical-markers/a_red_1ae.png",
  },
  {
    key: "b_blue_2ae",
    label: "B_Blue_2AE",
    src: "/tactical-markers/b_blue_2ae.png",
  },
  {
    key: "circle_1",
    label: "CIRCLE 1",
    src: circle1Png,
    recolorable: true,
  },
  { key: "hospital", label: "Hospital", src: "/tactical-markers/hospital.png" },
  {
    key: "fap_a",
    label: "FAP - A",
    src: fapAPng,
    recolorable: true,
  },
  { key: "amarok", label: "AMAROK", src: "/tactical-markers/amarok.png" },
  {
    key: "foot_approach",
    label: "Foot Approach",
    src: footApproachPng,
    recolorable: true,
  },
  {
    key: "ambulance",
    label: "Ambulance",
    src: "/tactical-markers/ambulance.png",
  },
  {
    key: "police_car",
    label: "Police Car",
    src: "/tactical-markers/police_car.png",
  },
  {
    key: "fire_truck",
    label: "Fire Truck",
    src: "/tactical-markers/fire_truck.png",
  },
  {
    key: "indicator",
    label: "Indicator",
    src: "/tactical-markers/indicator.png",
  },
  {
    key: "fup",
    label: "FUP",
    src: fupPng,
    recolorable: true,
  },
  { key: "bearcat", label: "BEARCAT", src: "/tactical-markers/bearcat.png" },
  {
    key: "dir_sierra_1",
    label: "DIR SIERRA 1",
    src: dirSierra1Png,
    recolorable: true,
  },
  {
    key: "friendly_address",
    label: "Friendly Address",
    src: "/tactical-markers/friendly_address.png",
  },
  {
    key: "lay_up_point",
    label: "Lay Up Point",
    src: layUpPointPng,
    recolorable: true,
  },
  {
    key: "police_station",
    label: "Police Station",
    src: "/tactical-markers/police_station.png",
  },
];

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

export function isTacticalIconRecolorable(icon: string): boolean {
  return !!TACTICAL_ICON_MAP[icon]?.recolorable;
}
