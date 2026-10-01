/**
 * Tactical marker library — traced from the AFP iSurv marker set (see
 * ops session notes for provenance). Fixed-colour raster icons, unlike
 * markerSvgs.ts's recolourable vector shapes: an officer picks one as-is,
 * there's no colour swatch to apply. This is a 18-icon trial batch, not
 * the full ~420-icon iSurv library — extend TACTICAL_ICONS the same way
 * (key, label, a /tactical-markers/<key>.png in client/public/) once more
 * are traced.
 */

export interface TacticalIcon {
  key: string;
  label: string;
  src: string;
}

export const TACTICAL_ICONS: TacticalIcon[] = [
  { key: "afp", label: "AFP", src: "/tactical-markers/afp.png" },
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
  { key: "circle_1", label: "CIRCLE 1", src: "/tactical-markers/circle_1.png" },
  { key: "hospital", label: "Hospital", src: "/tactical-markers/hospital.png" },
  { key: "fap_a", label: "FAP - A", src: "/tactical-markers/fap_a.png" },
  { key: "amarok", label: "AMAROK", src: "/tactical-markers/amarok.png" },
  {
    key: "foot_approach",
    label: "Foot Approach",
    src: "/tactical-markers/foot_approach.png",
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
  { key: "fup", label: "FUP", src: "/tactical-markers/fup.png" },
  { key: "bearcat", label: "BEARCAT", src: "/tactical-markers/bearcat.png" },
  {
    key: "dir_sierra_1",
    label: "DIR SIERRA 1",
    src: "/tactical-markers/dir_sierra_1.png",
  },
  {
    key: "friendly_address",
    label: "Friendly Address",
    src: "/tactical-markers/friendly_address.png",
  },
  {
    key: "lay_up_point",
    label: "Lay Up Point",
    src: "/tactical-markers/lay_up_point.png",
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
