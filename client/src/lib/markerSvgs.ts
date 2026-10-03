/**
 * Flat top-down shaped map marker SVGs.
 * Each icon is a 48×48 SVG string (no pin drop — just the shape).
 * Colours: red (#E53935), yellow (#F9A825), blue (#1E88E5), purple (#8E24AA)
 */

import { getTacticalIconSrc, getTacticalIconLabel } from "./tacticalMarkers";

export type MarkerColour = "red" | "yellow" | "blue" | "purple" | "black";
export type MarkerIcon =
  | "house_outline"
  | "house_filled"
  | "sedan"
  // suv/ute/van/hatchback stay here (and in getMarkerSvg below) purely so
  // any marker already saved with one of these keys keeps rendering
  // correctly — MARKER_ICON_GROUPS below no longer offers them as a choice
  // for a new/edited marker, per the officer's request to only keep Sedan.
  | "suv"
  | "ute"
  | "van"
  | "hatchback"
  | "arrow_up"
  | "arrow_right"
  // arrow_ne, both dashed-arrow variants, line_straight, and camera_cctv
  // stay here (and in getMarkerSvg/MARKER_ICON_LABELS below) purely so any
  // marker already saved with one of these keys keeps rendering correctly
  // — MARKER_ICON_GROUPS below no longer offers them as a choice for a
  // new/edited marker, per the officer's request to trim the Surveillance
  // picker down. Same pattern as suv/ute/van/hatchback above.
  | "arrow_ne"
  | "arrow_up_dashed"
  | "arrow_right_dashed"
  | "arrow_ne_dashed"
  | "line_straight"
  | "camera_photo"
  | "camera_cctv"
  | "hazard"
  | "coffee"
  | "toilet"
  | "rv"
  | "boat_cruiser"
  // Colour-changeable versions of shapes from the AFP iSurv "Surveillance"
  // marker set (see session notes) — same silhouettes as several fixed
  // Tactical icons (tacticalMarkers.ts), traced from the same source
  // family, but parameterised by the officer's chosen swatch colour here
  // instead of baked in as one fixed colour. Deliberately distinct key
  // names from their Tactical counterparts (circle_x vs x_circle, boat vs
  // vessell, etc) so the two never collide in the shared markerIcon column
  // (see getMarkerIconUrl, which checks Tactical keys first).
  | "circle_x"
  | "ring_1"
  | "ring_2"
  | "ring_3"
  | "ring_4"
  | "ring_5"
  | "oval"
  | "star"
  | "crosshair"
  | "sur_circle"
  | "dashed_line"
  | "drone"
  | "shield_f"
  | "arrow_thin"
  | "boat"
  | "police_car_top"
  | "motorbike"
  | "hospital_cross"
  | "fuel_pump"
  | "fup_badge"
  | "afp_badge"
  // The walking/standing-still person glyphs used for an on-foot live team
  // member pin (see IntelligenceMapping.tsx's liveUser.onFoot rendering,
  // 🚶 for walking / 🧍 for stopped 10s+) — offered as selectable custom
  // markers too. An emoji carries its own fixed colours, so unlike every
  // other icon here the colour swatch has no visible effect on these.
  | "person_foot"
  | "person_standing";

export const MARKER_COLOURS: Record<MarkerColour, string> = {
  red: "#E53935",
  yellow: "#F9A825",
  blue: "#1E88E5",
  purple: "#8E24AA",
  black: "#212121",
};

export const MARKER_COLOUR_LABELS: Record<MarkerColour, string> = {
  red: "Red",
  yellow: "Yellow",
  blue: "Blue",
  purple: "Purple",
  black: "Black",
};

export const MARKER_ICON_LABELS: Record<MarkerIcon, string> = {
  house_outline: "House (outline)",
  house_filled: "House (filled)",
  sedan: "Sedan",
  suv: "SUV / 4WD",
  ute: "Ute / Pickup",
  van: "Van / Wagon",
  hatchback: "Hatchback",
  arrow_up: "Arrow (up)",
  arrow_right: "Arrow (right)",
  arrow_ne: "Arrow (NE)",
  arrow_up_dashed: "Dashed arrow (up)",
  arrow_right_dashed: "Dashed arrow (right)",
  arrow_ne_dashed: "Dashed arrow (NE)",
  line_straight: "Line",
  camera_photo: "Camera",
  camera_cctv: "CCTV Camera",
  hazard: "Hazard",
  coffee: "Coffee",
  toilet: "Toilet",
  rv: "Rendezvous",
  boat_cruiser: "Boat (cruiser)",
  circle_x: "Circled X",
  ring_1: "Circle 1",
  ring_2: "Circle 2",
  ring_3: "Circle 3",
  ring_4: "Circle 4",
  ring_5: "Circle 5",
  oval: "Oval",
  star: "Star",
  crosshair: "Crosshair",
  sur_circle: "Surveillance (SUR)",
  dashed_line: "Dashed Line",
  drone: "Drone",
  shield_f: "Team Shield (F)",
  arrow_thin: "Arrow (Straight)",
  boat: "Boat",
  police_car_top: "Police Car",
  motorbike: "Motorbike",
  hospital_cross: "Hospital",
  fuel_pump: "Petrol Station",
  fup_badge: "FUP",
  afp_badge: "AFP",
  person_foot: "Person (Foot)",
  person_standing: "Person (Standing)",
};

export const MARKER_ICON_GROUPS: { label: string; icons: MarkerIcon[] }[] = [
  { label: "Locations", icons: ["house_outline", "house_filled"] },
  {
    label: "Vehicles",
    icons: ["sedan", "police_car_top", "motorbike", "boat"],
  },
  { label: "Arrow", icons: ["arrow_up", "arrow_right", "arrow_thin"] },
  { label: "Cameras", icons: ["camera_photo"] },
  {
    label: "Points of Interest",
    icons: [
      "hazard",
      "coffee",
      "toilet",
      "rv",
      "boat_cruiser",
      "hospital_cross",
      "fuel_pump",
    ],
  },
  {
    label: "Shapes",
    icons: [
      "circle_x",
      "ring_1",
      "ring_2",
      "ring_3",
      "ring_4",
      "ring_5",
      "oval",
      "star",
      "crosshair",
      "sur_circle",
    ],
  },
  { label: "Badges", icons: ["fup_badge", "afp_badge", "shield_f"] },
  { label: "Indicators", icons: ["dashed_line", "drone"] },
  { label: "People", icons: ["person_foot", "person_standing"] },
];

/** Generate an SVG string for a given icon + colour */
export function getMarkerSvg(icon: MarkerIcon, colour: MarkerColour): string {
  const c = MARKER_COLOURS[colour];
  // Darker shade for shadows/details
  const dark = darken(c, 0.25);
  const light = lighten(c, 0.35);

  switch (icon) {
    case "house_outline":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,4 44,22 40,22 40,44 28,44 28,30 20,30 20,44 8,44 8,22 4,22" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>
      </svg>`;

    case "house_filled":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,4 44,22 40,22 40,44 28,44 28,30 20,30 20,44 8,44 8,22 4,22" fill="${c}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="20" y="30" width="8" height="14" fill="${dark}" rx="1"/>
      </svg>`;

    case "sedan":
      // Top-down (bird's eye) view of a sedan — sleek tapered body
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Car body outline (top-down) -->
        <rect x="10" y="5" width="28" height="38" rx="8" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Roof panel (darker centre rectangle) -->
        <rect x="13" y="14" width="22" height="20" rx="4" fill="${dark}" opacity="0.55"/>
        <!-- Front windscreen -->
        <rect x="13" y="8" width="22" height="8" rx="3" fill="${light}" opacity="0.75"/>
        <!-- Rear windscreen -->
        <rect x="13" y="32" width="22" height="8" rx="3" fill="${light}" opacity="0.55"/>
        <!-- Front-left wheel -->
        <rect x="5" y="8" width="7" height="10" rx="3" fill="#222"/>
        <!-- Front-right wheel -->
        <rect x="36" y="8" width="7" height="10" rx="3" fill="#222"/>
        <!-- Rear-left wheel -->
        <rect x="5" y="30" width="7" height="10" rx="3" fill="#222"/>
        <!-- Rear-right wheel -->
        <rect x="36" y="30" width="7" height="10" rx="3" fill="#222"/>
        <!-- Headlights (front) -->
        <rect x="14" y="5" width="7" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <rect x="27" y="5" width="7" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <!-- Tail lights (rear) -->
        <rect x="14" y="40" width="7" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
        <rect x="27" y="40" width="7" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
      </svg>`;

    case "suv":
      // Top-down bird's eye view of an SUV/4WD — wider, boxier body with chunky tyres
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Wide boxy body -->
        <rect x="7" y="4" width="34" height="40" rx="6" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Roof panel -->
        <rect x="10" y="12" width="28" height="24" rx="3" fill="${dark}" opacity="0.5"/>
        <!-- Front windscreen (wide) -->
        <rect x="10" y="6" width="28" height="8" rx="2" fill="${light}" opacity="0.75"/>
        <!-- Rear windscreen (wide) -->
        <rect x="10" y="34" width="28" height="8" rx="2" fill="${light}" opacity="0.55"/>
        <!-- Front-left wheel (chunky) -->
        <rect x="2" y="7" width="7" height="12" rx="3" fill="#222"/>
        <!-- Front-right wheel (chunky) -->
        <rect x="39" y="7" width="7" height="12" rx="3" fill="#222"/>
        <!-- Rear-left wheel (chunky) -->
        <rect x="2" y="29" width="7" height="12" rx="3" fill="#222"/>
        <!-- Rear-right wheel (chunky) -->
        <rect x="39" y="29" width="7" height="12" rx="3" fill="#222"/>
        <!-- Headlights (wide strip) -->
        <rect x="11" y="4" width="10" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <rect x="27" y="4" width="10" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <!-- Tail lights -->
        <rect x="11" y="41" width="10" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
        <rect x="27" y="41" width="10" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
        <!-- Bull bar / front guard -->
        <rect x="9" y="3" width="30" height="2" rx="1" fill="${dark}" opacity="0.7"/>
      </svg>`;

    case "ute":
      // Top-down bird's eye view of a ute/pickup — cab at front, open tray at rear
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Cab (front half) -->
        <rect x="8" y="4" width="32" height="22" rx="6" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Cab roof -->
        <rect x="11" y="10" width="26" height="12" rx="3" fill="${dark}" opacity="0.5"/>
        <!-- Front windscreen -->
        <rect x="11" y="6" width="26" height="7" rx="2" fill="${light}" opacity="0.75"/>
        <!-- Tray / tub (rear half) — open bed, just outline -->
        <rect x="8" y="27" width="32" height="17" rx="3" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Tray interior (open bed) -->
        <rect x="11" y="29" width="26" height="13" rx="2" fill="${dark}" opacity="0.2"/>
        <!-- Tray divider line (cab-to-tray) -->
        <line x1="8" y1="27" x2="40" y2="27" stroke="${dark}" stroke-width="2"/>
        <!-- Front-left wheel -->
        <rect x="3" y="7" width="7" height="11" rx="3" fill="#222"/>
        <!-- Front-right wheel -->
        <rect x="38" y="7" width="7" height="11" rx="3" fill="#222"/>
        <!-- Rear-left wheel -->
        <rect x="3" y="30" width="7" height="11" rx="3" fill="#222"/>
        <!-- Rear-right wheel -->
        <rect x="38" y="30" width="7" height="11" rx="3" fill="#222"/>
        <!-- Headlights -->
        <rect x="12" y="4" width="8" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <rect x="28" y="4" width="8" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <!-- Tail lights -->
        <rect x="12" y="41" width="8" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
        <rect x="28" y="41" width="8" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
      </svg>`;

    case "van":
      // Top-down bird's eye view of a van/wagon — tall rectangular body, no visible windscreen rake
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Boxy van body (nearly full rectangle) -->
        <rect x="8" y="3" width="32" height="42" rx="4" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Roof (full length, slightly inset) -->
        <rect x="11" y="10" width="26" height="28" rx="2" fill="${dark}" opacity="0.45"/>
        <!-- Front windscreen (narrow rake) -->
        <rect x="11" y="5" width="26" height="6" rx="2" fill="${light}" opacity="0.75"/>
        <!-- Rear doors / window -->
        <rect x="11" y="37" width="26" height="6" rx="2" fill="${light}" opacity="0.5"/>
        <!-- Side sliding door line (left) -->
        <line x1="8" y1="20" x2="8" y2="36" stroke="${dark}" stroke-width="1.5" opacity="0.6"/>
        <!-- Side sliding door line (right) -->
        <line x1="40" y1="20" x2="40" y2="36" stroke="${dark}" stroke-width="1.5" opacity="0.6"/>
        <!-- Front-left wheel -->
        <rect x="3" y="7" width="7" height="11" rx="3" fill="#222"/>
        <!-- Front-right wheel -->
        <rect x="38" y="7" width="7" height="11" rx="3" fill="#222"/>
        <!-- Rear-left wheel -->
        <rect x="3" y="30" width="7" height="11" rx="3" fill="#222"/>
        <!-- Rear-right wheel -->
        <rect x="38" y="30" width="7" height="11" rx="3" fill="#222"/>
        <!-- Headlights -->
        <rect x="12" y="3" width="9" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <rect x="27" y="3" width="9" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <!-- Tail lights -->
        <rect x="12" y="42" width="9" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
        <rect x="27" y="42" width="9" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
      </svg>`;

    case "hatchback":
      // Top-down bird's eye view of a hatchback — shorter body, steeper rear
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Compact body -->
        <rect x="11" y="6" width="26" height="36" rx="7" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Roof panel (shorter) -->
        <rect x="14" y="14" width="20" height="18" rx="3" fill="${dark}" opacity="0.55"/>
        <!-- Front windscreen -->
        <rect x="14" y="8" width="20" height="8" rx="3" fill="${light}" opacity="0.75"/>
        <!-- Rear hatch window (taller than sedan — hatchback style) -->
        <rect x="14" y="30" width="20" height="10" rx="3" fill="${light}" opacity="0.6"/>
        <!-- Front-left wheel -->
        <rect x="6" y="9" width="7" height="10" rx="3" fill="#222"/>
        <!-- Front-right wheel -->
        <rect x="35" y="9" width="7" height="10" rx="3" fill="#222"/>
        <!-- Rear-left wheel -->
        <rect x="6" y="29" width="7" height="10" rx="3" fill="#222"/>
        <!-- Rear-right wheel -->
        <rect x="35" y="29" width="7" height="10" rx="3" fill="#222"/>
        <!-- Headlights -->
        <rect x="15" y="6" width="6" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <rect x="27" y="6" width="6" height="3" rx="1" fill="#FFF9C4" opacity="0.9"/>
        <!-- Tail lights (wider, hatchback style) -->
        <rect x="14" y="39" width="8" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
        <rect x="26" y="39" width="8" height="3" rx="1" fill="#ef4444" opacity="0.85"/>
      </svg>`;

    case "arrow_up":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,4 36,20 29,20 29,44 19,44 19,20 12,20" fill="${c}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/>
      </svg>`;

    case "arrow_right":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="44,24 28,12 28,19 4,19 4,29 28,29 28,36" fill="${c}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/>
      </svg>`;

    case "arrow_ne":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="8" y1="40" x2="40" y2="8" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
        <polygon points="40,8 26,14 34,22" fill="${c}"/>
      </svg>`;

    case "arrow_up_dashed":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="24" y1="40" x2="24" y2="10" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="6 5"/>
        <polygon points="24,4 34,18 14,18" fill="${c}"/>
      </svg>`;

    case "arrow_right_dashed":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="8" y1="24" x2="38" y2="24" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="6 5"/>
        <polygon points="44,24 30,14 30,34" fill="${c}"/>
      </svg>`;

    case "arrow_ne_dashed":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="8" y1="40" x2="34" y2="14" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="6 5"/>
        <polygon points="40,8 26,14 34,22" fill="${c}"/>
      </svg>`;

    case "line_straight":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="24" y1="4" x2="24" y2="44" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
      </svg>`;

    case "camera_photo":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Body -->
        <rect x="4" y="14" width="40" height="26" rx="4" fill="${c}"/>
        <!-- Viewfinder bump -->
        <rect x="16" y="10" width="16" height="6" rx="2" fill="${dark}"/>
        <!-- Lens outer -->
        <circle cx="24" cy="27" r="9" fill="${dark}"/>
        <!-- Lens inner -->
        <circle cx="24" cy="27" r="6" fill="${light}" opacity="0.6"/>
        <!-- Flash -->
        <rect x="6" y="16" width="5" height="4" rx="1" fill="#FFF9C4"/>
      </svg>`;

    case "camera_cctv":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Housing trapezoid -->
        <polygon points="6,16 38,20 38,28 6,32" fill="${c}" stroke="${dark}" stroke-width="1"/>
        <!-- Lens -->
        <circle cx="38" cy="24" r="7" fill="${dark}"/>
        <circle cx="38" cy="24" r="4" fill="${light}" opacity="0.6"/>
        <!-- Mount -->
        <rect x="4" y="22" width="4" height="4" rx="1" fill="${dark}"/>
        <!-- Recording dot -->
        <circle cx="12" cy="24" r="2.5" fill="#E53935"/>
      </svg>`;

    case "hazard":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,4 46,42 2,42" fill="${c}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <text x="24" y="38" text-anchor="middle" font-size="22" font-weight="bold" fill="white" font-family="sans-serif">!</text>
      </svg>`;

    case "coffee":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Cup body -->
        <path d="M8,18 L12,44 H36 L40,18 Z" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Handle -->
        <path d="M40,22 Q50,22 50,30 Q50,38 40,38" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <!-- Steam wisps -->
        <path d="M18,14 Q20,8 18,4" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
        <path d="M24,12 Q26,6 24,2" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
        <path d="M30,14 Q32,8 30,4" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

    case "toilet":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Male figure -->
        <circle cx="14" cy="8" r="4" fill="${c}"/>
        <rect x="11" y="14" width="6" height="12" rx="2" fill="${c}"/>
        <line x1="8" y1="16" x2="20" y2="16" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <line x1="11" y1="26" x2="9" y2="38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <line x1="17" y1="26" x2="19" y2="38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <!-- Female figure -->
        <circle cx="34" cy="8" r="4" fill="${c}"/>
        <polygon points="26,14 42,14 38,30 30,30" fill="${c}"/>
        <line x1="31" y1="30" x2="29" y2="38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <line x1="37" y1="30" x2="39" y2="38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <!-- Divider -->
        <line x1="24" y1="4" x2="24" y2="44" stroke="${dark}" stroke-width="1.5"/>
      </svg>`;

    case "rv":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r="21" fill="${c}" stroke="${dark}" stroke-width="2"/>
        <text x="24" y="31" text-anchor="middle" font-size="18" font-weight="900" fill="white" font-family="sans-serif" letter-spacing="-1">RV</text>
      </svg>`;

    case "boat_cruiser":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <!-- Hull -->
        <path d="M4,30 Q4,40 24,42 Q44,40 44,30 L40,22 L8,22 Z" fill="${c}" stroke="${dark}" stroke-width="1.5"/>
        <!-- Cabin -->
        <rect x="12" y="14" width="24" height="10" rx="3" fill="${dark}"/>
        <!-- Windows -->
        <rect x="15" y="16" width="6" height="5" rx="1" fill="${light}" opacity="0.7"/>
        <rect x="27" y="16" width="6" height="5" rx="1" fill="${light}" opacity="0.7"/>
        <!-- Mast/antenna -->
        <line x1="24" y1="4" x2="24" y2="14" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
        <!-- Wake lines -->
        <path d="M4,36 Q10,34 16,36" fill="none" stroke="white" stroke-width="1" opacity="0.5"/>
        <path d="M32,36 Q38,34 44,36" fill="none" stroke="white" stroke-width="1" opacity="0.5"/>
      </svg>`;

    case "circle_x":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M185 60c-8 2-32 11-38 14-8 4-27 17-34 24-17 16-31 34-39 50-4 7-11 27-14 37-2 9-2 61 0 70 3 10 10 30 14 37 8 16 22 34 39 50 7 7 26 20 34 24 6 3 32 12 40 14 7 1 59 1 66 0 11-2 32-10 42-15 37-20 66-54 79-92 7-20 7-21 7-53 0-21 0-30-1-35-3-10-10-30-14-37-7-16-22-35-38-50-8-7-27-20-35-24-6-3-32-12-40-14-7-1-61-1-68 0m73 18c16 5 22 8 32 13 9 5 22 14 24 17 3 4 3 5-45 53-35 34-47 46-49 46s-14-12-49-46c-48-48-48-49-45-53 2-3 15-12 25-17 8-5 17-8 31-13 14-4 17-4 41-4 22 1 23 1 35 4m74 48c8 9 20 28 24 40 2 3 4 12 6 18l4 11v49l-4 12c-5 17-7 24-13 33-5 9-12 20-16 24-5 5-3 7-54-44-42-43-47-48-47-51 0-2 1-3 4-6 2-1 4-3 5-4s20-21 43-44c29-29 41-41 43-41 1 0 3 1 5 3m-171 45c34 35 46 47 46 49s-12 14-46 49c-50 49-49 49-54 44-4-4-11-15-16-24-6-9-8-16-13-33l-3-12v-49l3-11c5-17 7-24 13-33 5-9 12-20 16-24 5-5 4-6 54 44m107 108c50 49 49 49 45 54-2 2-14 11-23 16-10 5-18 9-34 13l-11 3h-50l-12-3c-22-7-31-11-49-23-8-6-11-9-11-12 0-1 78-81 85-86 1-1 3-3 4-5 3-3 4-4 6-4 3 0 8 5 50 47"/></svg>`;

    case "ring_1":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M180 69c0 1-1 3-2 4 0 2-1 3-1 4-1 0-7 1-14 1h-11l-2 5c-2 3-3 4-6 5-4 1-4 2-6 6l-2 4h-15l-1 4c-2 5-3 6-5 6-3 0-5 2-7 7-1 3-3 4-4 4s-3 1-4 2c-2 1-2 2-2 8v7l-4 2c-3 1-4 2-6 5-1 4-2 5-5 7l-4 1-1 13v12l-4 2c-3 1-5 3-5 3-1 2-1 76 0 78 0 0 2 2 5 3l4 2v12l1 12 4 2c3 2 4 3 5 7 2 3 3 4 6 5l4 2v7c0 6 0 7 2 8 1 1 3 2 4 2s3 1 4 4c2 5 4 7 7 7 2 0 3 1 5 6l1 4h15l2 4c2 4 2 5 6 6 3 1 4 2 6 5l2 4 12 1h12l2 3c1 2 1 4 2 5s6 1 40 1h39l2-3c3-6 2-5 15-6l13-1 1-4c2-3 3-4 6-5 4-1 4-2 6-6l2-4h15l1-4c2-5 3-6 5-6 3 0 5-2 7-7 1-3 3-4 4-4s3-1 4-2c2-1 2-2 2-8v-7l4-2c3-1 4-2 6-5 1-4 2-5 5-7l5-2v-12l1-12 4-2c2-1 4-3 4-3 1-2 1-76 0-78 0 0-2-2-4-3l-4-2-1-12v-13l-5-1c-3-2-4-3-5-7-2-3-3-4-6-5l-4-2v-7c0-6 0-7-2-8-1-1-3-2-4-2s-3-1-4-4c-2-5-4-7-7-7-2 0-3-1-5-6l-1-4h-15l-2-4c-2-4-2-5-6-6-3-1-4-2-6-5l-1-5h-13l-12-1-2-3c-1-1-1-3-2-4s-6-2-40-2c-30 0-39 0-40 1m77 15c1 1 1 3 2 4l2 3 12 1h13l2 4c2 4 3 5 6 6 4 1 5 2 6 6l1 4h14l3 5c1 2 3 4 5 5 5 2 5 3 5 10 0 5 0 6 2 7 1 1 3 2 4 2 2 0 3 2 4 5 2 4 3 5 6 6l4 2v12c0 6 0 12 1 13 0 0 2 2 5 3l4 2v72l-4 2c-3 1-5 3-5 3-1 1-1 7-1 13v12l-4 2c-3 1-4 2-6 6-1 3-2 5-4 5-1 0-3 1-4 2-2 1-2 2-2 7 0 7 0 8-5 10-2 1-4 3-5 5l-3 4-7 1h-7l-1 4c-1 4-2 5-6 6-3 1-4 2-6 6l-2 4h-13c-13 1-12 0-15 6l-2 3h-36c-31 0-36 0-37-1s-1-3-2-5l-2-3h-25l-2-4c-2-4-3-5-6-6-4-1-5-2-6-6l-1-4h-7l-7-1-3-4c-1-2-3-4-5-5-5-2-5-3-5-10 0-5 0-6-2-7-1-1-3-2-4-2-2 0-3-2-4-5-2-4-3-5-6-6l-4-2v-12c0-6 0-12-1-13 0 0-2-2-4-3l-4-2v-72l4-2c2-1 4-3 4-3 1-1 1-7 1-13v-12l4-2c3-1 4-2 6-6 1-3 2-5 4-5 1 0 3-1 4-2 2-1 2-2 2-7 0-7 0-8 5-10 2-1 4-3 5-5l3-5h14l1-4c1-4 2-5 6-6 3-1 4-2 6-6l2-4h12c13 0 14 0 16-5 1-5 0-5 38-5 31 0 36 1 37 2"/><path fill="${c}" d="M216 154c-2 1-5 4-7 7-4 7-13 15-21 19-6 2-7 5-8 13 0 8 1 13 4 14s6 0 14-5c6-5 8-6 9-3 0 1 1 17 2 36 0 25 1 34 2 35s12 2 16 1l6-3 2-2v-52c0-46 0-52-2-56-1-2-2-4-3-5-3-2-11-1-14 1"/></svg>`;

    case "ring_2":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M180 69c0 1-1 3-2 4 0 2-1 3-1 4-1 0-7 1-14 1h-11l-2 5c-2 3-3 4-6 5s-4 2-6 5c-3 4-3 5-9 5h-7l-2 4c-1 3-2 5-5 5-4 2-5 3-7 8-1 2-3 4-4 4s-3 1-4 2c-2 1-2 2-2 7 0 7 0 8-5 10-3 1-4 3-5 6s-2 4-4 5c-5 1-6 2-6 16v11l-4 2c-3 1-5 3-5 3-1 1-1 18-1 39s0 38 1 39c0 0 2 2 5 3l4 2v11c0 14 1 15 6 16 2 1 3 2 4 5s2 5 5 6c5 2 5 3 5 10 0 5 0 6 2 7 1 1 3 2 4 2s3 2 4 4c2 5 3 6 7 7 3 1 4 3 5 6l2 4h7c6 0 6 1 9 5 2 3 3 4 6 5s4 2 6 5l2 4 12 1h12l2 3c1 2 1 4 2 5s6 1 40 1h39l2-3c3-6 2-5 15-6l13-1 1-4c2-3 3-4 6-5s4-2 6-5c3-4 3-5 9-5h7l2-4c1-3 2-5 5-6 4-1 5-2 7-7 1-2 3-4 4-4s3-1 4-2c2-1 2-2 2-7 0-7 0-8 5-10 3-1 4-3 5-6s2-4 4-5c5-1 6-2 6-16l1-11 4-2c2-1 4-3 4-3 1-2 1-76 0-78 0 0-2-2-4-3l-4-2-1-11c0-14-1-15-6-16-2-1-3-2-4-5s-2-5-5-6c-5-2-5-3-5-10 0-5 0-6-2-7-1-1-3-2-4-2s-3-2-4-4c-2-5-3-6-7-8-3 0-4-2-5-5l-2-4h-7c-6 0-6-1-9-5-2-3-3-4-6-5s-4-2-6-5l-1-5h-13l-12-1-2-3c-1-1-1-3-2-4s-6-2-40-2c-30 0-39 0-40 1m77 15c1 1 1 3 2 4l2 3 12 1h13l2 4c2 4 2 5 6 6 3 1 4 2 6 6l2 4h8c5 0 6 1 7 4 2 4 4 6 7 6 3 1 4 3 4 9 0 8 1 9 5 10 3 1 4 2 5 5 2 4 3 5 5 6l4 2c1 1 1 6 1 12 0 7 0 12 1 13 0 0 2 2 5 3l4 2v72l-4 2c-3 1-5 3-5 3-1 1-1 6-1 12 0 7 0 12-1 13l-4 2c-2 1-3 2-5 6-1 3-2 4-5 5-4 1-5 2-5 10 0 6-1 8-4 9-3 0-5 2-7 6-1 3-2 4-7 4h-8l-2 4c-2 4-3 5-6 6-4 1-4 2-6 6l-2 4h-13c-13 1-12 0-15 6l-2 3h-36c-31 0-36 0-37-1s-1-3-2-5l-2-3h-25l-2-4c-2-4-2-5-6-6-3-1-4-2-6-6l-2-4h-7c-6 0-7-1-8-4-2-4-4-6-7-6-3-1-4-3-4-9 0-8-1-9-5-10-3-1-4-2-5-5-2-4-3-5-5-6l-4-2c-1-1-1-6-1-13 0-6 0-11-1-12 0 0-2-2-4-3l-4-2v-72l4-2c2-1 4-3 4-3 1-1 1-6 1-13 0-6 0-11 1-12l4-2c2-1 3-2 5-6 1-3 2-4 5-5 4-1 5-2 5-10 0-6 1-8 4-9 3 0 5-2 7-6 1-3 2-4 8-4h7l2-4c2-4 3-5 6-6 4-1 4-2 6-6l2-4h12c13 0 14 0 16-5 1-5 0-5 38-5 31 0 36 1 37 2"/><path fill="${c}" d="M206 153c-7 3-16 9-20 14-5 7-7 11-7 16 0 6 1 8 6 9 3 0 5 1 7 2 3 2 7 1 10-2 11-13 12-14 19-12 6 2 8 6 7 12-1 4-5 10-21 26-6 7-11 12-20 24-5 5-11 18-11 22s3 7 8 8h34c33-1 35-1 37-8 2-5 0-13-4-16-3-3-4-3-18-3-6 0-11 0-12-1-3-2 1-6 12-17 12-12 17-19 20-30 5-18-2-33-19-41-7-3-8-3-17-4-5 0-10 0-11 1"/></svg>`;

    case "ring_3":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M180 69c0 1-1 3-2 4 0 2-1 3-1 4-1 0-7 1-14 1h-11l-2 5c-2 3-3 4-6 5-4 1-4 2-6 6l-2 4h-15l-1 4c-2 5-3 6-5 6-3 0-5 2-7 7-1 3-3 4-4 4s-3 1-4 2c-2 1-2 2-2 8v7l-4 2c-3 1-4 2-6 5-1 4-2 5-5 7l-4 1-1 13v12l-4 2c-3 1-5 3-5 3-1 2-1 76 0 78 0 0 2 2 5 3l4 2v12l1 12 4 2c3 2 4 3 5 7 2 3 3 4 6 5l4 2v7c0 6 0 7 2 8 1 1 3 2 4 2s3 1 4 4c2 5 4 7 7 7 2 0 3 1 5 6l1 4h15l2 4c2 4 2 5 6 6 3 1 4 2 6 5l2 4 12 1h12l2 3c1 2 1 4 2 5s6 1 40 1h39l2-3c3-6 2-5 15-6l13-1 1-4c2-3 3-4 6-5 4-1 4-2 6-6l2-4h15l1-4c2-5 3-6 5-6 3 0 5-2 7-7 1-3 3-4 4-4s3-1 4-2c2-1 2-2 2-8v-7l4-2c3-1 4-2 6-5 1-4 2-5 5-7l5-2v-12l1-12 4-2c2-1 4-3 4-3 1-2 1-76 0-78 0 0-2-2-4-3l-4-2-1-12v-13l-5-1c-3-2-4-3-5-7-2-3-3-4-6-5l-4-2v-7c0-6 0-7-2-8-1-1-3-2-4-2s-3-1-4-4c-2-5-4-7-7-7-2 0-3-1-5-6l-1-4h-15l-2-4c-2-4-2-5-6-6-3-1-4-2-6-5l-1-5h-13l-12-1-2-3c-1-1-1-3-2-4s-6-2-40-2c-30 0-39 0-40 1m77 15c1 1 1 3 2 4l2 3 12 1h13l2 4c2 4 3 5 6 6 4 1 5 2 6 6l1 4h14l3 5c1 2 3 4 5 5 5 2 5 3 5 10 0 5 0 6 2 7 1 1 3 2 4 2 2 0 3 2 4 5 2 4 3 5 6 6l4 2v12c0 6 0 12 1 13 0 0 2 2 5 3l4 2v72l-4 2c-3 1-5 3-5 3-1 1-1 7-1 13v12l-4 2c-3 1-4 2-6 6-1 3-2 5-4 5-1 0-3 1-4 2-2 1-2 2-2 7 0 7 0 8-5 10-2 1-4 3-5 5l-3 4-7 1h-7l-1 4c-1 4-2 5-6 6-3 1-4 2-6 6l-2 4h-13c-13 1-12 0-15 6l-2 3h-36c-31 0-36 0-37-1s-1-3-2-5l-2-3h-25l-2-4c-2-4-3-5-6-6-4-1-5-2-6-6l-1-4h-7l-7-1-3-4c-1-2-3-4-5-5-5-2-5-3-5-10 0-5 0-6-2-7-1-1-3-2-4-2-2 0-3-2-4-5-2-4-3-5-6-6l-4-2v-12c0-6 0-12-1-13 0 0-2-2-4-3l-4-2v-72l4-2c2-1 4-3 4-3 1-1 1-7 1-13v-12l4-2c3-1 4-2 6-6 1-3 2-5 4-5 1 0 3-1 4-2 2-1 2-2 2-7 0-7 0-8 5-10 2-1 4-3 5-5l3-5h14l1-4c1-4 2-5 6-6 3-1 4-2 6-6l2-4h12c13 0 14 0 16-5 1-5 0-5 38-5 31 0 36 1 37 2"/><path fill="${c}" d="M199 156c-8 3-9 4-14 11-5 8-5 9-5 15 0 7 1 9 8 9 9 2 13 0 19-6 3-4 7-6 8-6 2 0 7 5 7 8 0 4-3 8-8 10-4 3-5 4-7 9-3 7-3 10 0 12 1 1 3 2 4 2 5 0 11 2 14 6 3 3 3 3 3 9s0 6-4 10c-7 7-14 5-23-8-5-7-7-8-16-3-8 5-8 6-8 11s3 10 9 18c6 6 10 8 20 11 8 1 10 1 16 0 9-2 16-5 22-11 5-5 6-7 8-13 5-15 3-26-7-37-6-6-6-9-1-13 4-3 6-9 6-16s-1-9-6-17c-8-9-18-15-29-15-6 0-9 1-16 4"/></svg>`;

    case "ring_4":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M180 69c0 1-1 3-2 4 0 2-1 3-1 4-1 0-7 1-14 1h-11l-2 5c-2 3-3 4-6 5-4 1-4 2-6 6l-2 4h-15l-1 4c-2 5-3 6-5 6-3 0-5 2-7 7-1 3-3 4-4 4s-3 1-4 2c-2 1-2 2-2 8v7l-4 2c-3 1-4 2-6 5-1 4-2 5-5 7l-4 1-1 13v12l-4 2c-3 1-5 3-5 3-1 2-1 76 0 78 0 0 2 2 5 3l4 2v12l1 12 4 2c3 2 4 3 5 7 2 3 3 4 6 5l4 2v7c0 6 0 7 2 8 1 1 3 2 4 2s3 1 4 4c2 5 4 7 7 7 2 0 3 1 5 6l1 4h15l2 4c2 4 2 5 6 6 3 1 4 2 6 5l2 4 12 1h12l2 3c1 2 1 4 2 5s6 1 40 1h39l2-3c3-6 2-5 15-6l13-1 1-4c2-3 3-4 6-5 4-1 4-2 6-6l2-4h15l1-4c2-5 3-6 5-6 3 0 5-2 7-7 1-3 3-4 4-4s3-1 4-2c2-1 2-2 2-8v-7l4-2c3-1 4-2 6-5 1-4 2-5 5-7l5-2v-12l1-12 4-2c2-1 4-3 4-3 1-2 1-76 0-78 0 0-2-2-4-3l-4-2-1-12v-13l-5-1c-3-2-4-3-5-7-2-3-3-4-6-5l-4-2v-7c0-6 0-7-2-8-1-1-3-2-4-2s-3-1-4-4c-2-5-4-7-7-7-2 0-3-1-5-6l-1-4h-15l-2-4c-2-4-2-5-6-6-3-1-4-2-6-5l-1-5h-13l-12-1-2-3c-1-1-1-3-2-4s-6-2-40-2c-30 0-39 0-40 1m77 15c1 1 1 3 2 4l2 3 12 1h13l2 4c2 4 3 5 6 6 4 1 5 2 6 6l1 4h14l3 5c1 2 3 4 5 5 5 2 5 3 5 10 0 5 0 6 2 7 1 1 3 2 4 2 2 0 3 2 4 5 2 4 3 5 6 6l4 2v12c0 6 0 12 1 13 0 0 2 2 5 3l4 2v72l-4 2c-3 1-5 3-5 3-1 1-1 7-1 13v12l-4 2c-3 1-4 2-6 6-1 3-2 5-4 5-1 0-3 1-4 2-2 1-2 2-2 7 0 7 0 8-5 10-2 1-4 3-5 5l-3 4-7 1h-7l-1 4c-1 4-2 5-6 6-3 1-4 2-6 6l-2 4h-13c-13 1-12 0-15 6l-2 3h-36c-31 0-36 0-37-1s-1-3-2-5l-2-3h-25l-2-4c-2-4-3-5-6-6-4-1-5-2-6-6l-1-4h-7l-7-1-3-4c-1-2-3-4-5-5-5-2-5-3-5-10 0-5 0-6-2-7-1-1-3-2-4-2-2 0-3-2-4-5-2-4-3-5-6-6l-4-2v-12c0-6 0-12-1-13 0 0-2-2-4-3l-4-2v-72l4-2c2-1 4-3 4-3 1-1 1-7 1-13v-12l4-2c3-1 4-2 6-6 1-3 2-5 4-5 1 0 3-1 4-2 2-1 2-2 2-7 0-7 0-8 5-10 2-1 4-3 5-5l3-5h14l1-4c1-4 2-5 6-6 3-1 4-2 6-6l2-4h12c13 0 14 0 16-5 1-5 0-5 38-5 31 0 36 1 37 2"/><path fill="${c}" d="M220 158c-4 3-7 6-8 8-7 10-16 23-18 26-1 2-4 5-5 7-1 3-4 7-6 9s-6 7-8 11c-4 6-5 7-5 14 0 10 1 14 4 16 2 1 10 1 20 2 13 0 18 1 19 2 2 1 2 3 2 7 0 5 0 6 2 8 3 3 8 4 15 3h7c1 0 2-3 2-10 1-7 2-10 7-10 2-1 5-2 7-4 3-2 3-3 3-8 0-8-2-12-7-12-4 0-7-2-8-5-1-2-1-15-1-30 0-29-1-32-6-36-4-3-9-3-16 2m-4 48c1 3-2 16-4 18-1 1-6 1-8 0-2 0-2-4-1-7s10-12 11-12 1 1 2 1"/></svg>`;

    case "ring_5":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M182 68c-1 0-3 2-3 5-1 2-3 4-4 4-1 1-6 1-11 1-6-1-11 0-12 0-1 1-2 2-2 4-1 3-4 6-7 6-2 0-3 1-6 6-1 3-2 3-8 3-4 0-7 1-8 1 0 1-1 3-2 5-1 3-2 4-5 5s-4 2-6 6c-1 3-2 4-5 5-5 1-5 2-5 10 0 6-1 6-4 9-3 1-5 3-5 5-1 3-3 4-6 5-2 1-4 3-5 4v12c0 5 0 10-1 11 0 1-2 3-4 3-2 1-4 2-4 3-1 1-1 77 0 78 0 1 2 2 4 3 2 0 4 2 4 3 1 1 1 6 1 11v12c1 1 3 3 5 4 3 1 5 2 6 5 0 2 2 4 5 5 3 3 4 3 4 9 0 8 0 9 5 10 3 1 4 2 5 5 2 4 3 5 6 6s4 2 5 5l2 4c1 1 4 1 8 1 6 0 7 1 8 4 3 5 4 6 6 6 3 0 6 3 7 6 0 2 1 3 2 4 1 0 6 1 12 0 5 0 10 0 11 1 1 0 3 2 4 5 1 2 2 4 3 4h76c1 0 2-2 3-4 1-3 3-5 4-5 1-1 6-1 12-1 5 1 10 0 11 0 1-1 2-2 2-4 1-3 4-6 7-6 2 0 3-1 6-6 1-3 2-4 8-4 4 0 7 0 8-1l2-4c1-3 2-4 5-5s4-2 6-6c1-3 2-4 5-5 5-1 5-2 5-10 0-6 1-6 4-9 3-1 5-3 5-5 1-3 3-4 6-5 2-1 4-3 5-4v-12c0-5 0-10 1-11 0-1 2-3 4-3 2-1 4-2 4-3 1-1 1-77 0-78 0-1-2-2-4-3-2 0-4-2-4-3-1-1-1-6-1-11v-12c-1-1-3-3-5-4-3-1-5-2-6-5 0-2-2-4-5-5-3-3-4-3-4-9 0-8 0-9-5-10-3-1-4-2-5-5-2-4-3-5-6-6s-4-2-5-5c-1-2-2-4-2-5-1 0-4-1-8-1-6 0-7 0-8-3-3-5-4-6-6-6-3 0-6-3-7-6 0-2-1-3-2-4-1 0-6-1-11 0-6 0-11 0-12-1-1 0-3-2-4-5l-2-4zm74 15c1 0 2 2 3 4 1 3 2 5 3 5h23l3 4c2 5 3 6 7 6 2 1 3 2 4 5l2 4c1 1 4 1 8 1h7l1 5c2 3 3 4 6 6 4 1 5 2 5 7v7c0 1 2 3 5 4 3 2 5 3 5 6 1 2 3 4 6 5l4 3v23c1 1 3 3 5 4 2 0 4 2 4 3 1 2 1 68 0 70 0 1-2 3-4 3-2 1-4 3-5 4v23l-4 3c-3 1-5 3-6 5 0 3-2 4-5 6-3 1-5 3-5 4v7c0 5-1 6-5 7-3 2-4 3-6 6l-1 4h-7c-4 0-7 1-8 1 0 1-1 3-2 5-1 3-2 4-4 5-4 0-5 1-7 6l-3 3-11 1h-12c-1 0-2 2-3 4-1 3-3 5-3 5-3 1-70 1-71 0-1 0-3-2-4-5-1-2-2-4-3-4h-12l-11-1-3-3c-2-5-3-6-7-6-2-1-3-2-4-5-1-2-2-4-2-5-1 0-4-1-8-1h-6l-2-4c-2-3-3-4-6-6-4-1-5-2-5-7v-7c0-1-2-3-5-4-3-2-5-3-5-6-1-2-3-4-5-5l-4-3-1-11v-12c-1-1-3-3-5-4-2 0-4-2-4-3-1-2-1-68 0-70 0-1 2-3 4-3 2-1 4-3 5-4v-12l1-11 4-3c2-1 4-3 5-5 0-3 2-4 5-6 3-1 5-3 5-4v-7c0-5 1-6 5-7 3-2 4-3 6-6l2-5h6c4 0 7 0 8-1l2-4c1-3 2-4 4-5 4 0 5-1 7-6l3-4h23c1 0 2-1 3-4 2-6 0-6 39-5z"/><path fill="${c}" d="M204 155c-4 0-8 0-9 1-3 0-7 8-8 16 0 3-1 9-3 13-5 16-6 31-4 34 1 1 4 3 8 4l6 3 11-4c10-3 11-3 15-2 8 2 9 5 9 14-1 8-3 12-8 14-7 3-15 0-18-7-2-4-6-8-8-9s-13 2-16 5c-5 4-3 14 6 25 7 8 9 9 18 11s15 2 24 0c8-2 9-2 16-8 9-9 17-26 16-35-1-7-6-16-11-24-4-5-6-7-12-10-8-4-9-4-15-4-3 1-6 0-7 0-2-1-3-5-1-8 1-2 2-2 18-2 20 1 20 1 21-9 0-7-2-15-5-17-1-1-25-2-43-1"/></svg>`;

    case "boat":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M64 163c-1 1-3 3-4 6-1 5-1 10-1 51 0 42 0 46 1 51 1 3 3 5 4 6s41 1 105 1c96 0 104 0 115-2 7-1 14-2 15-3 2-1 7-1 12-2 12-1 36-9 49-16 9-5 16-12 19-18s3-25 0-31c-7-16-37-32-71-38s-27-6-139-6c-64 0-104 0-105 1m224 19c12 1 20 3 27 6 3 1 8 3 12 3 9 2 12 3 16 6 2 2 5 4 8 5 4 1 13 11 15 16 2 6-5 17-14 21-3 1-7 3-9 5-2 1-7 3-14 4-5 1-12 3-15 4-15 7-22 7-137 7-96 0-99 0-101-2s-2-4-2-37 0-35 2-37 5-2 101-2c59 0 104 0 111 1"/></svg>`;

    case "afp_badge":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M69 99c-4 0-7 1-8 2-3 2-3 23-3 126 0 82 1 108 2 110 0 2 2 3 4 4h157c123 0 155 0 157-1 1-1 2-3 3-5 1-5 1-225 0-230-1-2-2-4-3-5-2-1-34-2-152-2-83 0-154 1-157 1m298 15c2 2 2 210 0 213-2 2-292 2-294 0s-2-212 0-214c1-1 22-1 147-1 130 0 146 0 147 2"/><path fill="${c}" d="M124 160c-2 1-4 3-4 6-1 2-3 7-5 11-2 5-5 12-6 16s-4 10-5 13c-2 3-4 9-5 14s-3 9-5 12c-2 2-3 4-4 6 0 1-1 6-3 10-3 8-2 10 3 12 8 3 18 0 20-5 1-7 4-11 7-13s5-2 16-2c17 0 22 2 24 12 2 6 6 9 13 9 4 0 6-1 8-2 4-3 4-8-1-19-3-5-5-13-6-17s-3-9-5-11c-1-3-4-9-6-14-1-4-3-11-4-13-2-2-4-8-5-13-3-8-4-9-6-11-4-1-18-2-21-1m14 38c2 6 4 13 4 15 0 3-2 5-7 5-7 0-8 0-10-2-1-3-1-3 3-11 2-5 4-9 5-9 1-2 4-1 5 2m61-38c-6 2-6 2-6 33-1 16 0 36 0 46l1 17 3 3c3 2 4 2 9 2 3-1 6-1 8-3s3-2 3-18c0-13 1-16 2-18 2-2 12-3 24-3 10 0 15-1 16-4 1-1 1-4 1-7 0-9-1-9-23-10-15 0-17-1-19-2-3-3-3-8 1-12l3-4h17c14 0 17 0 20-2 6-3 7-12 2-16l-2-3h-28c-16 0-30 1-32 1m87 0c-6 2-6 1-6 24v25c0 8 1 46 2 48 1 5 15 5 20 1 2-3 2-3 2-16s0-13 2-16c3-2 4-2 13-2 11 0 23-2 28-6 4-2 11-11 12-14s1-24 0-27c-2-5-9-13-14-15-4-2-6-2-30-3-14 0-27 0-29 1m44 21c7 2 10 7 9 13-2 5-12 9-23 9-8-1-10-2-12-7s-1-10 2-13 3-3 12-3c5 0 10 0 12 1"/></svg>`;

    case "oval":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M188 101c-18 2-27 4-32 7-4 2-9 4-12 5-3 0-8 3-10 4-3 2-8 5-11 6s-7 3-8 5c-2 2-5 4-7 5-10 8-14 11-19 18-3 4-7 8-7 10-1 1-3 4-5 7-2 2-5 7-6 12-2 4-4 10-5 13-2 6-2 8-2 27s0 21 2 26c1 4 3 10 5 14 1 5 4 10 6 12 2 3 4 6 5 7 0 2 4 6 7 10 5 7 9 10 19 18 2 1 5 3 7 5 1 2 5 4 8 5s8 4 11 6c2 1 7 4 11 5 3 0 8 3 11 4 10 5 34 8 64 8s54-3 64-8c3-1 8-4 12-4 3-1 8-4 11-5 2-2 7-5 10-6s7-3 8-5c2-2 5-4 7-5 10-8 14-11 19-18 3-4 7-8 7-10 1-1 3-4 5-7 2-2 5-7 6-12 2-4 4-10 5-14 2-5 3-7 3-26s-1-21-3-27c-1-3-3-9-5-13-1-5-4-10-6-12-2-3-4-6-5-7 0-2-4-6-7-10-5-7-9-10-19-18-2-1-5-3-7-5-1-2-5-4-8-5s-8-4-10-6c-3-1-8-4-11-5-4 0-9-3-12-4-6-3-16-5-34-7-11-1-52-1-62 0"/><path fill="#fff" d="M183 77c-1 0-4 0-7 1-3 0-5 1-8 4-3 4-4 4-9 4-8-1-16 2-21 7-4 3-5 3-10 4-5 0-6 0-10 5-4 4-4 4-10 5-6 0-5-1-12 8-1 2-3 3-3 3-1 0-4 2-6 5-3 2-6 6-7 7s-5 4-7 8c-3 3-7 6-8 8-1 1-4 3-5 5-3 1-3 2-4 8 0 6-1 6-4 9-5 4-5 6-5 52s0 48 5 52c3 3 4 3 4 9 1 6 1 7 4 8 1 2 4 4 5 5 1 2 5 5 8 8 2 4 6 7 7 8s4 5 7 7c2 3 5 5 6 5 0 0 2 1 3 3 7 9 6 8 12 8 6 1 6 1 10 5 4 5 5 5 10 5 5 1 6 1 10 4 5 5 13 8 21 7 5 0 6 0 9 4 3 3 5 4 9 5 6 1 80 1 86 0 4-1 6-2 9-5 3-4 4-4 9-4 8 1 16-2 21-7 4-3 5-3 10-4 5 0 6 0 10-5 4-4 4-4 10-5 6 0 5 1 12-8 1-2 3-3 3-3 1 0 4-2 6-5 3-2 6-6 7-7s5-4 8-8c2-3 6-6 7-8 1-1 4-3 5-5 3-1 3-2 4-8 0-6 1-6 4-9 5-4 5-6 5-52s0-48-5-52c-3-3-4-3-4-9-1-6-1-7-4-8-1-2-4-4-5-5-1-2-5-5-7-8-3-4-7-7-8-8s-4-5-7-7c-2-3-5-5-6-5 0 0-2-1-3-3-7-9-6-8-12-8-6-1-6-1-10-5-4-5-5-5-10-5-5-1-6-1-10-4-5-5-13-8-21-7-5 0-6 0-9-4-2-2-5-4-7-4-3-1-78-2-82-1m75 18c7 2 16 4 20 4 3 1 8 2 11 4s8 4 12 6c4 1 9 3 10 4s6 3 10 5c3 2 7 5 8 6s4 3 6 4c5 3 16 14 21 20 11 14 22 35 24 45 1 3 1 15 1 27s0 24-1 27c-2 10-12 31-24 45-4 6-18 19-20 19 0 0-3 2-5 4-5 4-25 15-31 17-3 1-7 3-10 5-4 2-9 3-12 4-4 0-13 2-20 4l-13 3h-50l-13-3c-7-2-16-4-19-4-4-1-9-2-12-4s-8-4-12-6c-4-1-9-3-10-4s-6-3-9-5c-4-2-8-5-9-6s-4-3-6-4c-5-3-16-14-21-20-11-14-22-35-24-45-1-7-1-47 0-54 2-10 12-31 24-45 4-6 18-19 20-19 0 0 3-2 5-4 6-5 27-16 33-17 1-1 5-2 8-4s7-4 13-5c5 0 14-2 20-4 10-3 11-3 36-3h26z"/><path fill="${dark}" d="M183 95c-6 2-15 4-20 4-6 1-10 3-13 5s-7 3-8 4c-6 1-27 12-33 17-2 2-5 4-5 4-2 0-16 13-20 19-12 14-22 35-24 45-1 7-1 47 0 54 2 10 13 31 24 45 5 6 16 17 21 20 2 1 5 3 6 4s5 4 9 6c3 2 8 4 9 5s6 3 10 4c4 2 9 4 12 6s8 3 12 4c3 0 12 2 19 4l13 3h50l13-3c7-2 16-4 20-4 3-1 8-2 12-4 3-2 7-4 10-5 6-2 26-13 31-17 2-2 5-4 5-4 2 0 16-13 20-19 12-14 22-35 24-45 1-3 1-15 1-27s0-24-1-27c-2-10-13-31-24-45-5-6-16-17-21-20-2-1-5-3-6-4s-5-4-8-6c-4-2-9-4-10-5s-6-3-10-4c-4-2-9-4-12-6s-8-3-11-4c-4 0-13-2-20-4l-13-3h-26c-25 0-26 0-36 3m67 6c18 2 28 4 34 7 3 1 8 4 12 4 3 1 8 4 11 5 2 2 7 5 10 6s7 3 8 5c2 2 5 4 7 5 10 8 14 11 19 18 3 4 7 8 7 10 1 1 3 4 5 7 2 2 5 7 6 12 2 4 4 10 5 13 2 6 3 8 3 27s-1 21-3 26c-1 4-3 10-5 14-1 5-4 10-6 12-2 3-4 6-5 7 0 2-4 6-7 10-5 7-9 10-19 18-2 1-5 3-7 5-1 2-5 4-8 5s-8 4-10 6c-3 1-8 4-11 5-4 0-9 3-12 4-10 5-34 8-64 8s-54-3-64-8c-3-1-8-4-11-4-4-1-9-4-11-5-3-2-8-5-11-6s-7-3-8-5c-2-2-5-4-7-5-10-8-14-11-19-18-3-4-7-8-7-10-1-1-3-4-5-7-2-2-5-7-6-12-2-4-4-10-5-14-2-5-2-7-2-26s0-21 2-27c1-3 3-9 5-13 1-5 4-10 6-12 2-3 4-6 5-7 0-2 4-6 7-10 5-7 9-10 19-18 2-1 5-3 7-5 1-2 5-4 8-5s8-4 11-6c2-1 7-4 10-4 3-1 8-3 12-5 5-3 14-5 32-7 10-1 51-1 62 0"/></svg>`;

    case "hospital_cross":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M76 65c-1 0-4 1-5 1-6 3-6-7-6 154 0 160 0 151 5 154 2 1 38 1 151 1h147l3-3 4-3V221c0-109 0-148-1-150s-2-4-3-4c-2-1-37-2-147-2zm180 24c2 2 3 2 3 41l1 40 2 3c6 8 5 7 48 8h39l2 3c3 3 3 10 3 40-1 28-1 32-5 34-1 0-19 1-40 1-27 0-39 1-40 2-4 1-8 6-9 9-1 2-1 16-1 38 0 20-1 37-1 38 0 2-2 4-3 5-3 2-5 3-31 3-30 0-37 0-40-3l-2-2-1-39c0-38-1-39-3-42-1-2-4-5-5-6-3-2-4-3-43-3s-39-1-41-3-3-2-3-34c0-34 0-38 5-40 1-1 18-1 38-1s37 0 39-1c4-1 11-8 12-12 1-2 1-19 1-39s0-37 1-38c1-5 4-5 39-5 33 0 33 1 35 3"/><path fill="#fff" d="M71 47c-9 1-10 2-12 6q-3 4.5-6 6c-2 1-4 3-5 4-1 3-1 14-1 157s0 154 1 157c1 1 3 3 5 4q3 1.5 6 6c1 3 3 4 6 5 5 2 305 2 310 0 3-1 5-2 6-5q3-4.5 6-6c2-1 4-3 5-4 1-3 2-14 2-157s-1-154-2-157c-1-1-3-3-5-4q-3-1.5-6-6c-1-2-3-4-5-5-3-1-31-2-151-2-82 0-151 1-154 1m300 20c1 0 2 2 3 4s1 41 1 150v148l-4 3-3 3H221c-113 0-149 0-151-1-5-3-5 6-5-154 0-161 0-151 6-154 1 0 4-1 5-1h148c110 0 145 1 147 2"/><path fill="#fff" d="M185 87c-1 1-3 3-3 4-1 1-1 18-1 38s0 37-1 39c-1 4-8 11-12 12-2 1-19 1-39 1s-37 0-38 1c-5 2-5 6-5 40 0 32 1 32 3 34s2 3 41 3 40 1 43 3c1 1 4 4 5 6 2 3 3 4 3 42l1 39 2 2c3 3 10 3 40 3 26 0 28-1 31-3 1-1 3-3 3-5 0-1 1-18 1-38 0-22 0-36 1-38 1-3 5-8 9-9 1-1 13-2 40-2 21 0 39-1 40-1 4-2 4-6 5-34 0-30 0-37-3-40l-2-3h-39c-43-1-42 0-48-8l-2-3-1-40c0-39-1-39-3-41s-2-3-35-3c-26 0-33 0-36 1"/></svg>`;

    case "police_car_top":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M214 63c-2 1-5 8-6 17-1 4 0 10 4 14s4 5-5 10c-10 6-14 5-12-4 0-5-2-10-9-14-5-3-8-4-11-4-6 0-8 1-9 6-2 5-1 9 5 16 4 6 5 7 11 8 3 1 5 3 6 3 0 2-3 16-4 17s-3 0-6-1c-4-3-6-3-16-3-9 0-11 0-14 2-4 3-5 7-2 12 4 6 14 9 23 5 8-3 10-1 11 11 0 9 2 11 10 16 4 2 7 3 7 4 0 0-1 1-3 1-3 2-7 2-16 2h-12l-8 4c-8 4-9 5-13 11-3 5-6 11-8 15-1 5-3 11-4 13-2 3-3 8-4 11-2 7-10 21-15 26-5 6-6 14-5 36 0 21 1 23 9 31l5 4h96l97-1 4-3c3-1 6-5 7-7 3-5 3-6 4-17 1-8 1-15 0-23-1-12-1-13-5-21-2-4-6-10-9-14-6-8-14-25-16-35-1-5-3-9-6-14-5-7-6-8-14-12l-7-4h-15c-20 0-54-2-55-3-3-1 2-2 16-2 18 0 27-2 32-7 3-4 3-4 3-16 1-7 1-14 1-15 0-4-3-15-7-21-3-5-4-7-10-10-9-4-16-9-16-11l3-3c4-3 6-9 5-14-1-8-3-15-5-16s-8-1-12 0m6 59c3 1 2 3-1 7-5 4-7 9-8 17 0 9-2 12-6 12-6 0-9-4-6-9 1-1 2-7 2-12 2-12 4-15 8-15 6-1 10-1 11 0m47 86c2 2 5 4 5 4 2 0 7 5 8 9 0 2 2 7 4 11 4 9 5 13 3 15s-5 2-68 2c-61 0-66 0-67-2-2-2-1-6 3-15 2-5 4-11 4-13 1-3 5-7 7-7 0 0 2-1 4-3 6-5 5-5 50-5h42zm-99 73c9 2 11 9 7 18-4 7-7 8-18 9-10 0-11 0-14-2-3-3-5-9-5-15 0-4 4-9 7-10 5-1 17-1 23 0m126 0c1 0 3 1 4 3 2 3 2 4 1 10-1 12-3 14-17 14s-19-4-19-16c-1-8 1-11 7-11 4-1 20 0 24 0"/><path fill="${c}" d="M254 86c-8 5-9 8-9 17 1 3 1 7 2 8 2 2 7 2 11 1s16-14 17-18c0-4-2-10-4-11-4-2-10-1-17 3m10 43c-2 1-3 3-4 5-1 3-1 4 1 7 2 4 7 7 15 8 6 0 7 0 11-2 9-4 12-12 5-17-3-2-4-2-14-2-8 0-12 1-14 1M146 340c-12 0-12 1-15 3-2 3-2 4-2 13 1 11 4 18 9 20 10 5 15 5 24-1 7-4 8-7 9-18 1-8 1-11 0-13-2-3-7-5-10-5-2 0-8 1-15 1m128 0c-7 2-7 4-6 16 3 22 11 27 29 18 10-4 12-7 13-18 1-9 0-13-5-15-3-1-26-2-31-1"/><path fill="#fff" d="M214 48c-2 1-4 2-5 5-1 2-3 5-5 6-5 2-7 4-8 8 0 4-2 5-8 2-6-2-17-3-23-1-3 1-5 2-6 5-1 2-4 5-6 6-4 3-6 5-6 11 0 5 2 9 6 11 5 4 7 9 4 12-1 0-5 2-8 3-5 2-7 4-10 7-2 3-5 5-7 6-3 3-5 6-5 11s2 8 6 11c2 1 5 4 6 7 3 4 4 5 8 6 3 1 5 1 5 2 0 2-6 10-9 12-2 1-4 3-5 5s-4 4-6 6c-5 3-6 5-6 11 0 4-1 5-4 8-5 5-7 13-6 21v5l-5 4c-4 4-4 5-5 11 0 6-1 6-4 9-5 4-5 7-5 38 0 30 0 32 6 35 2 1 4 3 5 5s4 5 5 7l3 3 1 14c0 15 1 19 6 21q3 1.5 6 6c3 5 6 6 21 6s18-1 21-6q3-4.5 6-6c5-2 6-6 7-20 0-11 0-14 2-15 2-2 4-2 30-2l27-1 5 4c3 3 6 5 7 6 2 2 2 3 1 6-1 11 1 19 7 22q3 1.5 6 6c3 5 7 6 21 6 15 0 18-1 21-6q3-4.5 6-6c5-2 6-6 6-21l1-14 3-3c1-2 4-5 5-7s3-4 5-5c6-3 6-4 6-41 1-36 0-37-6-42l-5-5c0-2-3-5-4-7-2-2-4-4-4-8-1-5-2-6-6-10l-4-4v-5c1-9-1-15-8-21-3-3-5-6-5-7l-3-3c-4-2-9-9-9-12 0-1 2-2 5-2 3-1 4-3 7-6 1-3 4-6 6-7 4-3 6-6 6-11s-2-8-5-11c-2-1-5-3-7-6-3-3-5-5-10-7-3-1-7-3-8-3-3-3-1-8 4-12 4-2 6-6 6-11 0-6-2-8-6-11-2-1-5-4-6-6-1-3-3-4-6-5-6-2-17-1-23 1-6 3-8 2-8-2-1-4-3-6-8-8-2-1-4-4-5-6-3-5-9-7-17-5m12 15c2 1 4 8 5 16 1 5-1 11-5 14l-3 3c0 2 7 7 16 11 6 3 7 5 10 10 4 6 7 17 7 21 0 1 0 8-1 15 0 12 0 12-3 16-5 5-14 7-32 7-14 0-19 1-16 2 1 1 35 3 55 3h15l7 4c8 4 9 5 14 12 3 5 5 9 6 14 2 10 10 27 16 35 3 4 7 10 9 14 4 8 4 9 5 21 1 8 1 15 0 23-1 11-1 12-4 17-1 2-4 6-7 7l-4 3-97 1h-96l-5-4c-8-8-9-10-9-31-1-22 0-30 5-36 5-5 13-19 15-26 1-3 2-8 4-11 1-2 3-8 4-13 2-4 5-10 8-15 4-6 5-7 13-11l8-4h12c9 0 13 0 16-2 2 0 3-1 3-1 0-1-3-2-7-4-8-5-10-7-10-16-1-12-3-14-11-11-9 4-19 1-23-5-3-5-2-9 2-12 3-2 5-2 14-2 10 0 12 0 16 3 3 1 5 2 6 1s4-15 4-17c-1 0-3-2-6-3-6-1-7-2-11-8-6-7-7-11-5-16 1-5 3-6 9-6 3 0 6 1 11 4 7 4 9 9 9 14-2 9 2 10 12 4 9-5 9-6 5-10s-5-10-4-14c1-9 4-16 6-17 4-1 10-1 12 0m45 20c2 1 4 7 4 11-1 4-13 17-17 18s-9 1-11-1c-1-1-1-5-2-8 0-9 1-12 9-17 7-4 13-5 17-3m21 47c7 5 4 13-5 17-4 2-5 2-11 2-8-1-13-4-15-8-2-3-2-4-1-7 2-5 5-6 18-6 10 0 11 0 14 2M166 340c5 2 6 5 5 17-1 11-2 14-9 18-9 6-14 6-24 1-5-2-8-9-9-20 0-9 0-10 2-13 3-2 3-3 15-3 7 0 13-1 15-1 1 0 3 0 5 1m139 1c5 2 6 6 5 15-1 11-3 14-13 18-18 9-26 4-29-18-1-12-1-14 6-16 5-1 28 0 31 1"/><path fill="#fff" d="M209 122c-4 0-6 3-8 15 0 5-1 11-2 12-3 5 0 9 6 9 4 0 6-3 6-12 1-8 3-13 8-17 6-7 3-9-10-7m-33 83c-2 1-4 3-6 4-2 2-4 3-4 3-2 0-6 4-7 7 0 2-2 8-4 13-4 9-5 13-3 15 1 2 6 2 67 2 63 0 66 0 68-2s1-6-3-15c-2-4-4-9-4-11-1-4-6-9-8-9 0 0-3-2-5-4l-5-4h-42c-30 0-43 0-44 1m-31 76c-3 1-7 6-7 10 0 6 2 12 5 15 3 2 4 2 14 2 11-1 14-2 18-9 4-9 2-16-7-18-6-1-18-1-23 0m125 0c-6 0-8 3-7 11 0 12 5 16 19 16s16-2 17-14c1-6 1-7-1-10-1-2-3-3-4-3-4 0-20-1-24 0"/></svg>`;

    case "motorbike":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M139 95c-1 1 0 2 2 2 3 0 6-1 6-2s-7-1-8 0m32 2c0 1 1 3 1 4 0 4-6 17-8 19-3 2-4 5-5 15-1 7-1 9-3 11-3 3-10 17-10 19 0 1 1 1 4 1 2 0 6 1 8 2 10 5 13 5 22 5 8 0 9 1 12 3 2 2 6 4 8 5 8 4 30 28 39 43 1 3 4 6 7 7 4 2 7 7 8 14 1 4-1 6-5 6s-9 3-9 6c-1 3-2 3-5 3-5 0-10 2-14 5-2 3-6 4-10 5s-8 3-9 4c-5 3-15 5-21 5-5 0-6 0-9 3-4 4-9 6-13 4-2-1-3-3 0-8 1-3 1-8 1-16 0-15 1-18 5-18 3 0 4 2 8 7 5 8 8 9 13 4 2-2 4-3 10-3 9-1 11-2 16-7 3-2 5-3 10-4 7-1 11-4 11-6 0-1-1-2-3-4-5-5-10-4-21 4-2 1-7 3-10 4-7 1-9 3-11 7-1 3-4 4-6 2 0-1-1-4-2-7s-3-7-5-9c-1-2-4-5-4-7-1-2-5-6-8-9-8-8-11-8-15 1-3 5-6 8-9 8-4 0-6-1-8-5-2-5-3-5-11-5-4 0-10-1-14-3-5-1-10-2-12-2-3 0-4 1-8 5-2 3-5 8-7 11-1 3-4 7-6 10-11 16-14 25-14 48 0 15 1 22 4 29 2 2 4 7 6 11 4 7 11 16 20 21 6 4 7 4 15 5 13 0 19-1 26-6 3-2 6-4 7-5 1 0 4-3 6-6s4-6 5-8c1-1 2-5 3-8 2-10 5-13 15-16 5-1 7-2 8-5l2-3h13l13-1 2-4c2-6 1-5 13-3 7 1 8 1 8-5 0-5 0-5 2-6q3-1.5 6 0c2 0 3 1 3 4s0 5-3 8c-2 2-5 4-6 6-3 3-3 3-12 3-10 0-10 0-13 3-4 3-4 3-13 3-10 0-12 0-12 3 0 2 7 3 19 2 10 0 11 0 17 2 7 3 12 4 26 2 8-1 11-2 20-6 5-3 11-5 13-5l4-1 2 9c2 6 4 10 7 13l4 6c0 1 16 13 19 14 5 1 31 1 34 0 5-2 18-12 20-15 1-2 4-6 5-8 2-3 4-7 5-9 0-3 2-9 3-14 3-8 3-9 3-18-1-6-1-10-3-13-3-5-3-7 2-13 3-4 3-5 4-11 0-5 0-6-2-8s-3-2-12-2c-10 0-14-1-14-4s4-5 13-5 13-1 13-4c1-3-1-10-3-14-4-5-5-10-3-17 0-2 1-8 2-12v-7l-3-2c-3-1-4-3-4-5-1-6-3-7-14-8-10 0-15 1-16 4-1 1 3 4 5 4 5 0 9 8 5 11-4 4-15 9-19 9-11 2-12 2-16 6-5 4-6 4-15 6-3 0-8 1-12 3-3 1-6 2-7 2s-11-6-16-10c-2-1-4-4-5-7-2-2-4-6-6-7s-3-3-3-5c0-6 7-7 10-1 3 5 11 5 14 0 1-3 3-4 9-3 9 1 15-5 9-9-3-1-9-2-12-2-2 1-4 3-5 5-4 6-12 6-15-1l-5-5c-1 0-4-3-6-5-4-4-4-4-8-3-5 0-5 0-11-5-5-6-11-9-13-9-1 0-4-2-7-4-4-2-7-4-7-4-1 0-4-1-7-3-7-3-19-14-21-19 0-2-2-3-3-3s-1 0 0 1m28 56c2 2 4 4 4 5 0 2-3 2-5 1-3-2-7-9-7-11 0-1 5 2 8 5m18-2c1 2 2 4 2 5 0 2-1 2-4 2s-4-1-4-3c0-3 2-7 4-7 0 0 2 1 2 3m27 112c2 1 1 4-1 5-2 0-4-2-3-5 1-1 2-1 4 0M123 104s-1 1-1 2 1 1 3 1c1 0 3-1 3-2 0-2-3-2-5-1"/><path fill="${c}" d="M83 143q-1.5 3-3 9c-1 4-2 9-3 11-2 7-1 10 1 11s2 2 1 6c0 5 1 11 4 16l2 3 4-5 5-4h8c8 1 15 0 16-2s1-8 0-10c-2-4-12-7-20-7-3 0-6 0-7-1-1-2 1-5 4-9 4-6 4-9-2-15-3-3-5-5-6-5s-3 1-4 2m26 2c-2 1-2 1 0 7 3 8 3 8 9 12 7 5 8 5 8 0-1-2-1-7-2-11 0-4-1-7-2-8-2-1-11-1-13 0m25 30c-1 0-1 1 0 2 2 0 3-1 1-2 0-1-1-1-1 0"/><path fill="#fff" d="M143 77c-1 0-5 0-7 1-4 0-5 1-8 4-4 4-4 4-10 5-6 0-5 0-12 8-1 2-3 3-3 3-1 0-4 2-6 5-3 2-6 6-7 7-2 1-5 5-7 7-3 3-7 8-10 11-6 6-8 13-7 21 0 5 0 6-3 9-5 4-6 7-6 17s1 14 6 18l3 2-1 14c0 14 0 14-3 17-1 2-4 5-4 7l-5 5c-6 5-7 6-6 41 0 36 0 39 5 43 3 3 4 3 4 9 1 6 1 7 4 8 1 2 4 4 6 6l5 5c0 1 4 4 6 7l6 5 9 1c10 1 28 1 34-1 2-1 5-3 7-5 2-3 3-3 8-4 7 0 8 0 10-6 1-3 3-4 6-6 5-3 6-3 7-9 1-2 2-5 3-5 4-3 16-3 46-3 26 0 36-1 47-3 3 0 4 0 5 4 2 2 4 5 7 6l6 6c1 2 3 4 4 5 1 0 4 2 6 5 3 4 5 5 8 6 6 1 44 1 53 0l8-1 6-5c2-3 6-6 7-7 0-1 3-3 4-5 2-2 5-4 6-6 3-1 3-2 4-8 0-6 1-6 4-9 2-1 3-4 4-6 2-5 2-55 1-66-1-7-1-8-4-11-2-1-4-3-4-4s2-3 4-4c3-3 3-4 4-11 1-11 1-43-1-46-1-2-4-5-12-14-1-1-5-4-7-7l-6-5-8-1c-13-1-70-1-81 1-5 0-11 1-12 2-4 1-11-3-14-8-4-5-4-5-11-5-5-1-5-1-9-5s-5-5-10-6c-4 0-6-2-8-4-2-1-5-3-6-4s-6-5-10-10c-4-4-9-8-11-9q-3-1.5-6-6c-1-2-3-4-5-5-4-1-29-2-33-1m4 18c0 1-3 2-6 2-2 0-3-1-2-2s8-1 8 0m27 4c2 5 14 16 21 19 3 2 6 3 7 3 0 0 3 2 7 4 3 2 6 4 7 4 2 0 8 3 13 9 6 5 6 5 11 5 4-1 4-1 8 3 2 2 5 5 6 5l5 5c3 7 11 7 15 1 1-2 3-4 5-5 3 0 9 1 12 2 6 4 0 10-9 9-6-1-8 0-9 3-3 5-11 5-14 0-3-6-10-5-10 1 0 2 1 4 3 5s4 5 6 7c1 3 3 6 5 7 5 4 15 10 16 10s4-1 7-2c4-2 9-3 12-3 9-2 10-2 15-6 4-4 5-4 16-6 4 0 15-5 19-9 4-3 0-11-5-11-2 0-6-3-5-4 1-3 6-4 16-4 11 1 13 2 14 8 0 2 1 4 4 5l3 2v7c-1 4-2 10-2 12-2 7-1 12 3 17 2 4 4 11 3 14 0 3-4 4-13 4s-13 2-13 5 4 4 14 4c9 0 10 0 12 2s2 3 2 8c-1 6-1 7-4 11-5 6-5 8-2 13 2 3 2 7 3 13 0 9 0 10-3 18-1 5-3 11-3 14-1 2-3 6-5 9-1 2-4 6-5 8-2 3-15 13-20 15-3 1-29 1-34 0-3-1-19-13-19-14l-4-6c-3-3-5-7-7-13l-2-9-4 1c-2 0-8 2-13 5-9 4-12 5-20 6-14 2-19 1-26-2-6-2-7-2-17-2-12 1-19 0-19-2 0-3 2-3 12-3 9 0 9 0 13-3 3-3 3-3 13-3 9 0 9 0 12-3 1-2 4-4 6-6 3-3 3-5 3-8s-1-4-3-4q-3-1.5-6 0c-2 1-2 1-2 6 0 6-1 6-8 5-12-2-11-3-13 3l-2 4-13 1h-13l-2 3c-1 3-3 4-8 5-10 3-13 6-15 16-1 3-2 7-3 8-1 2-3 5-5 8s-5 6-6 6c-1 1-4 3-7 5-7 5-13 6-26 6-8-1-9-1-15-5-9-5-16-14-20-21-2-4-4-9-6-11-3-7-4-14-4-29 0-23 3-32 14-48 2-3 5-7 6-10 2-3 5-8 7-11 4-4 5-5 8-5 2 0 7 1 12 2 4 2 10 3 14 3 8 0 9 0 11 5 2 4 4 5 8 5 3 0 6-3 9-8 4-9 7-9 15-1 3 3 7 7 8 9 0 2 3 5 4 7 2 2 4 6 5 9s2 6 2 7c2 2 5 1 6-2 2-4 4-6 11-7 3-1 8-3 10-4 11-8 16-9 21-4 2 2 3 3 3 4 0 2-4 5-11 6-5 1-7 2-10 4-5 5-7 6-16 7-6 0-8 1-10 3-5 5-8 4-13-4-4-5-5-7-8-7-4 0-5 3-5 18 0 8 0 13-1 16-3 5-2 7 0 8 4 2 9 0 13-4 3-3 4-3 9-3 6 0 16-2 21-5 1-1 5-3 9-4s8-2 10-5c4-3 9-5 14-5 3 0 4 0 5-3 0-3 5-6 9-6s6-2 5-6c-1-7-4-12-8-14-3-1-6-4-7-7-9-15-31-39-39-43-2-1-6-3-8-5-3-2-4-3-12-3-9 0-12 0-22-5-2-1-6-2-8-2-3 0-4 0-4-1 0-2 7-16 10-19 2-2 2-4 3-11 1-10 2-13 5-15 2-2 8-15 8-19 0-1-1-3-1-4-1-1-1-1 0-1s3 1 3 3m-46 6c0 1-2 2-3 2-2 0-3 0-3-1s1-2 1-2c2-1 5-1 5 1m9 26c0 1-1 1-2 1s-2 0-2-1 0-2 2-2 2 1 2 2m-44 15c6 6 6 9 2 15-3 4-5 7-4 9 1 1 4 1 7 1 8 0 18 3 20 7 1 2 1 8 0 10s-8 3-16 2h-8l-5 4-4 5-2-3c-3-5-4-11-4-16 1-4 1-5-1-6s-3-4-1-11c1-2 2-7 3-11 1-7 4-11 7-11 1 0 3 2 6 5m29-1c1 1 2 4 2 8 1 4 1 9 2 11 0 5-1 5-8 0-6-4-6-4-9-12-2-6-2-6 0-7s11-1 13 0m14 32c-1 1-3-1-2-2 0-1 1-1 1 0 1 0 1 1 1 2m62 41c-1 4-5 7-7 6-1 0-2-1-3-2-1-4 1-7 6-7 4 0 4 0 4 3"/><path fill="#fff" d="M191 148c0 2 4 9 7 11 2 1 5 1 5-1s-7-9-10-9c-1-1-2-1-2-1m21 2c-1 1-1 3-1 5s1 3 4 3 4 0 4-2c0-3-3-8-4-8s-2 1-3 2m28 113c-1 3 1 5 3 5 2-1 3-4 1-5s-3-1-4 0"/></svg>`;

    case "fuel_pump":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="48" height="48"><path fill="${c}" d="M98 65c-6 1-19 5-23 8-1 0-3 3-4 5l-2 4v275l2 4c3 7 8 9 21 12l10 2 112 1c70 0 116 0 123-1 10-1 23-5 27-8 2-1 4-4 5-6l3-5V83l-3-4c-3-6-7-9-20-12l-9-2-118-1c-65 0-121 1-124 1m32 12c18 0 36 0 41 1h8l-11 3c-10 2-13 2-47 2-22 0-36 0-36 1-1 1-1 271 0 272 0 1 8 1 17 1 16 1 21 2 21 3s1 1-24 2c-14 1-18 0-21-6-2-3-2-12-2-137 0-123 0-133 2-136 2-5 7-7 14-7 2 1 19 1 38 1m228 1c5 4 5-3 5 142 0 128 0 132-2 136-2 5-8 8-14 7-3-1-10-1-16-1-17-1-18-1-18-2s5-2 24-2c10-1 18-1 19-2s2-270 0-272c0-1-17-1-39-1-21 0-40 0-42-1-3 0-7-1-10-2s-6-2-5-2c0 0 81-2 90-2 3 1 6 1 8 2m-90 10c3 1 4 2 4 4-1 3-11 3-60 3-50-1-53-1-46-6 4-2 13-3 57-3 37 1 42 1 45 2m-4 15q6 4.5 6 15l1 7 10 10c5 6 11 12 12 14 2 4 3 26 2 38-1 6-1 6-2 3-1-1-4-5-7-8-8-6-9-8-10-18 0-5-1-9-1-10-3-4-9 3-7 8v26c0 22 1 24 3 27 2 5 13 20 14 20 2 0 4-4 7-9l2-5v11c1 13 0 17-4 15-3-2-6 0-7 4-1 2-1 11-2 19 0 18 1 23 6 31 3 5 4 5 9 5h7l3-1 2 13c2 13 2 16-3 19-2 1-7 1-85 1-88 0-88 0-91-4s-2-8 0-11c4-3 8-4 19-4 6 0 10 0 12-2 6-3 6 1 6-107 0-106 0-103 5-106s9-3 50-3c37 0 41 1 43 2m-111 3c1 2 1 103 1 198 0 4 0 5-2 6-3 2-6-1-5-9v-99c0-59 0-95 1-96 1-4 4-4 5 0m139 15c0 5 1 6 7 8 2 2 3 3 3 4 0 5-4 4-11-4-4-4-7-7-7-8 0-2 3-5 5-6q3-1.5 3 6m20 26c1 4 2 91 0 94 0 3-2 2-4 0s-2-5-2-47c0-45 0-50 4-50 0 0 1 1 2 3m9 103c1 1 2 9 2 12-2 6-7 1-7-6 0-6 2-8 5-6m-16 10c2 2 4 11 2 13-3 1-7-8-5-12 0-2 1-2 3-1m28 30c-1 13-1 16-3 16-3 0-4-5-4-18 0-11 0-12 2-14l2-2 2 3c1 3 1 7 1 15m-10 26c0 3-3 4-4 2 0-3 1-5 2-5s2 2 2 3m-210 11c2 8-2 13-5 8-2-3-1-11 1-14 1-2 1-2 3-1 0 1 1 4 1 7m195 19c6 1 7 1 4 4-3 4-15 4-101 4-72 0-81-1-84-2-4-2-6-4-5-5 1 0 4-1 7-1 8-1 173-1 179 0"/><path fill="${c}" d="M193 116c-7 1-12 5-15 11-1 2-2 8-2 17 0 17 1 21 6 26 5 6 8 6 37 6 25 0 27 0 32-2 9-4 13-10 11-19-2-8-3-20-2-22 1-7-5-15-14-17-6-1-46-1-53 0m50 16c0 3-3 5-5 2s-1-4 3-4c1 0 2 1 2 2m-42 0c0 1 0 1-1 1s-1 0-1-1 0-1 1-1 1 0 1 1m41 11c0 2 0 3-2 3-1 0-2-1-2-2 0-5 3-5 4-1m2 13c1 1 2 3 2 4 0 4-2 5-7 5-5-1-35-1-37 0-1 0-4 0-6-1-3-1-4-2-4-3 0-4 3-5 23-4 17 1 19 0 22-1 3-2 5-2 7 0m30 155c0 2 2 4 5 4s4-3 1-5c-2-1-5-1-6 1"/><path fill="#fff" d="M71 47c-9 1-10 2-12 6q-3 4.5-6 6c-2 1-4 3-5 4-1 3-1 14-1 157s0 154 1 157c1 1 3 3 5 4q3 1.5 6 6c1 3 3 4 6 5 5 2 305 2 310 0 3-1 5-2 6-5q3-4.5 6-6c2-1 4-3 5-4 1-3 2-14 2-157s-1-154-2-157c-1-1-3-3-5-4q-3-1.5-6-6c-1-2-3-4-5-5-3-1-31-2-151-2-82 0-151 1-154 1m278 20c13 3 17 6 20 12l3 4v273l-3 5c-1 2-3 5-5 6-4 3-17 7-27 8-7 1-53 1-123 1l-112-1-10-2c-13-3-18-5-21-12l-2-4V82l2-4c1-2 3-5 4-5 4-3 17-7 23-8 3 0 59-1 124-1l118 1z"/><path fill="#fff" d="M177 102c-2 0-5 1-6 2-5 3-5 0-5 106 0 108 0 104-6 107-2 2-6 2-12 2-11 0-15 1-19 4-2 3-3 7 0 11s3 4 91 4c78 0 83 0 85-1 5-3 5-6 3-19l-2-13-3 1h-7c-5 0-6 0-9-5-5-8-6-13-6-31 1-8 1-17 2-19 1-4 4-6 7-4 4 2 5-2 4-15v-11l-2 5c-3 5-5 9-7 9-1 0-12-15-14-20-2-3-3-5-3-27v-26c-2-5 4-12 7-8 0 1 1 5 1 10 1 10 2 12 10 18 3 3 6 7 7 8 1 3 1 3 2-3 1-12 0-34-2-38-1-2-7-8-12-14l-10-10-1-7q0-10.5-6-15c-2-1-6-2-43-2-23 0-43 0-44 1m69 14c9 2 15 10 14 17-1 2 0 14 2 22 2 9-2 15-11 19-5 2-7 2-32 2-29 0-32 0-37-6-5-5-6-9-6-26 0-9 1-15 2-17 3-6 8-10 15-11s47-1 53 0m34 194c3 2 2 5-1 5s-5-2-5-4c1-2 4-2 6-1"/><path fill="#fff" d="M302 261c-1 1-1 4 0 6 2 6 6 8 6 2 0-7-5-13-6-8"/><path fill="${c}" d="M83 78c-7 4-7-7-7 141 0 125 0 134 2 137 3 6 7 7 21 6 25-1 24-1 24-2s-5-2-21-3c-9 0-17 0-17-1-1-1-1-271 0-272 0-1 14-1 36-1 34 0 37 0 47-2l11-3h-8c-5-1-23-1-41-1-19 0-36 0-38-1-4 0-6 0-9 2m220-1c-24 0-43 1-43 1-1 0 2 1 5 2s7 2 10 2c2 1 21 1 42 1 22 0 39 0 39 1 2 2 1 271 0 272s-9 1-19 2c-19 0-24 1-24 2s1 1 18 2c6 0 13 0 16 1 6 1 12-2 14-7 2-4 2-8 2-136 0-145 0-138-5-142-4-2-5-2-55-1"/><path fill="${c}" d="M175 87c-9 1-15 5-10 7 2 1 91 1 99 0 6 0 8-1 8-2 0-2-1-3-4-4s-8-1-45-2c-23 0-44 1-48 1m-27 19c-1 1-1 37-1 96v99c-1 8 2 11 5 9 2-1 2-2 2-6 0-95 0-196-1-198-1-4-4-4-5 0m141 9c-2 1-5 4-5 6 0 1 3 4 7 8 7 8 11 9 11 4 0-1-1-2-3-4-6-2-7-3-7-8q0-7.5-3-6m-51 16c-1 1-1 1 0 3 2 3 5 1 5-2 0-1-1-2-2-2-2 0-3 0-3 1m-39 1c0 1 0 1 1 1s1 0 1-1 0-1-1-1-1 0-1 1m40 9c-1 0-1 1-1 3 0 1 1 2 2 2 2 0 2-1 2-3-1-2-2-4-3-2m68 5c-1 2-1 17-1 48 0 42 0 45 2 47s4 3 4 0c2-3 1-90 0-94s-3-4-5-1m-70 10c-3 1-5 2-22 1-20-1-23 0-23 4 0 1 1 2 4 3 2 1 5 1 6 1 2-1 32-1 37 0 5 0 7-1 7-5 0-2-3-6-5-6-1 0-3 1-4 2m80 94c-2 2-1 10 1 13 3 5 6 1 5-8-1-5-3-7-6-5m11 24c-2 2-2 3-2 14 0 13 1 18 4 18 2 0 2-3 3-16 0-8 0-12-1-15l-2-3zm-9 40c0 3 1 5 2 5s2-2 2-3c0-3-3-4-4-2m-210 7c-3 5-2 16 2 16 3 0 4-12 1-17-2-1-2-1-3 1m20 25c-3 0-6 1-7 1-1 1 1 3 5 5 3 1 12 2 84 2 86 0 98 0 101-4 3-3 2-3-4-4s-171-1-179 0"/></svg>`;

    case "fup_badge":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 293.032663 244.458906" width="48" height="48"><g transform="translate(-68.490051,351.804619) scale(0.100000,-0.100000)" fill="${c}"><path d="M767 3513 c-88 -7 -82 63 -82 -918 l0 -860 22 -49 c29 -61 199 -236
268 -275 28 -16 76 -52 108 -80 92 -81 135 -102 229 -110 91 -9 150 -29 188
-66 37 -35 72 -45 165 -45 50 0 120 -8 172 -20 82 -20 99 -20 263 -10 96 6
227 10 290 8 63 -2 153 3 200 10 47 7 128 17 180 21 83 7 108 14 192 54 53 25
111 48 129 52 45 10 80 28 104 55 11 13 47 35 80 50 63 30 121 74 221 170 47
46 67 74 90 132 l29 73 0 875 c0 1014 10 923 -102 933 -70 7 -2661 6 -2746 0z
m2697 -148 c14 -14 15 -105 13 -803 -2 -769 -2 -788 -22 -819 -11 -17 -37 -44
-57 -60 -101 -79 -160 -121 -204 -145 -27 -15 -65 -37 -84 -47 -83 -47 -240
-111 -298 -121 -34 -6 -95 -27 -135 -46 -68 -33 -77 -35 -162 -32 -52 1 -116
-3 -151 -11 -57 -14 -65 -13 -133 9 -66 22 -75 23 -114 10 -23 -7 -80 -14
-127 -15 -47 -2 -113 -3 -148 -5 -67 -2 -55 -6 -200 85 -33 21 -77 37 -120 45
-62 12 -204 62 -227 80 -6 5 -47 22 -92 38 -53 20 -102 47 -138 76 -31 25 -70
54 -86 63 -39 23 -149 157 -158 192 -3 14 -4 358 -1 764 4 641 7 739 20 747 9
6 512 10 1312 10 1156 0 1298 -2 1312 -15z"/><path d="M1108 2978 c-10 -18 -14 -123 -16 -437 -4 -486 -11 -455 100 -449 99
5 101 8 108 184 6 140 7 148 31 166 21 18 34 19 109 14 147 -11 200 16 200
100 0 78 -52 100 -204 88 -74 -6 -84 -4 -108 16 -32 25 -38 72 -12 108 14 21
22 22 160 22 200 0 222 14 212 135 -3 34 -8 43 -38 57 -30 16 -67 18 -282 18
-246 0 -247 0 -260 -22z"/><path d="M1848 2984 c-42 -22 -47 -64 -50 -414 l-2 -245 30 -60 c49 -97 82
-143 114 -160 38 -20 137 -42 225 -50 62 -6 78 -4 145 21 78 31 122 66 175
143 l30 44 0 348 c0 327 -1 348 -19 368 -38 42 -164 20 -181 -31 -4 -13 -10
-156 -14 -318 -4 -204 -10 -302 -18 -316 -7 -12 -27 -34 -45 -49 -26 -22 -39
-26 -71 -22 -46 6 -109 46 -134 84 -16 24 -19 62 -23 329 -5 279 -6 304 -24
323 -23 25 -96 28 -138 5z"/><path d="M2704 2979 c-18 -20 -19 -44 -22 -431 -4 -491 -11 -462 104 -456 104
5 109 12 110 143 2 115 16 155 57 155 12 0 62 5 110 10 72 7 100 15 152 45 99
55 158 150 159 255 1 80 -57 198 -119 240 -80 55 -108 60 -330 60 -193 0 -203
-1 -221 -21z m396 -207 c19 -9 41 -29 50 -44 13 -25 13 -31 0 -55 -22 -41 -74
-63 -146 -63 -51 0 -64 4 -83 24 -12 13 -24 39 -27 58 -5 27 -1 40 21 66 25
30 31 32 88 32 39 0 75 -7 97 -18z"/></g></svg>`;

    case "crosshair":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r="17" fill="none" stroke="${c}" stroke-width="3.5"/>
        <line x1="24" y1="2" x2="24" y2="46" stroke="${c}" stroke-width="3"/>
        <line x1="2" y1="24" x2="46" y2="24" stroke="${c}" stroke-width="3"/>
      </svg>`;

    case "dashed_line":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="24" y1="44" x2="24" y2="10" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/>
        <circle cx="24" cy="6" r="4" fill="${c}"/>
      </svg>`;

    case "shield_f":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,4 44,18 37,43 11,43 4,18" fill="${c}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <text x="24" y="31" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="sans-serif">F</text>
      </svg>`;

    case "drone":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <ellipse cx="14" cy="14" rx="11" ry="7" fill="none" stroke="${c}" stroke-width="3"/>
        <ellipse cx="34" cy="14" rx="11" ry="7" fill="none" stroke="${c}" stroke-width="3"/>
        <line x1="24" y1="14" x2="24" y2="32" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <line x1="14" y1="38" x2="34" y2="38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <line x1="24" y1="32" x2="24" y2="38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
      </svg>`;

    case "star":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,3 29.5,18 46,18.5 33,28.5 37.5,44.5 24,35 10.5,44.5 15,28.5 2,18.5 18.5,18" fill="${c}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>`;

    case "sur_circle":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r="19" fill="none" stroke="${c}" stroke-width="3"/>
        <text x="24" y="29" text-anchor="middle" font-size="13" font-weight="800" fill="${c}" font-family="sans-serif">SUR</text>
      </svg>`;

    case "arrow_thin":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <line x1="24" y1="43" x2="24" y2="14" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <polygon points="24,4 31,17 17,17" fill="${c}"/>
      </svg>`;

    case "person_foot":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <text x="24" y="38" text-anchor="middle" font-size="40">🚶</text>
      </svg>`;

    case "person_standing":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <text x="24" y="38" text-anchor="middle" font-size="40">🧍</text>
      </svg>`;

    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r="20" fill="${c}"/>
      </svg>`;
  }
}

/** Build a data URL from an SVG string for use in Google Maps markers */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Get a data URL for a given icon + colour */
export function getMarkerDataUrl(
  icon: MarkerIcon,
  colour: MarkerColour
): string {
  return svgToDataUrl(getMarkerSvg(icon, colour));
}

/**
 * Same shape as getMarkerDataUrl, but also resolves a tactical marker key
 * (see lib/tacticalMarkers.ts) — a fixed-colour raster icon with no colour
 * of its own to apply, unlike every MarkerIcon here. Every call site that
 * renders a saved custom_map_markers row (picker previews, the actual pin
 * drawn on the map, edit-dialog previews) should go through this rather
 * than getMarkerDataUrl directly, since markerIcon on that table is a
 * free-text column that can hold either kind of key. Takes `icon` as a
 * plain string (not the narrower MarkerIcon type) for exactly that reason.
 */
export function getMarkerIconUrl(icon: string, colour: MarkerColour): string {
  const tacticalSrc = getTacticalIconSrc(icon);
  if (tacticalSrc) return tacticalSrc;
  return getMarkerDataUrl(icon as MarkerIcon, colour);
}

/** Same fallback-lookup pattern as getMarkerIconUrl, for a marker's display
 * label (map pin title, info-window heading) rather than its image. */
export function getMarkerIconLabel(icon: string): string {
  return (
    getTacticalIconLabel(icon) ?? MARKER_ICON_LABELS[icon as MarkerIcon] ?? icon
  );
}

// ─── Colour utilities ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map(v =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}
