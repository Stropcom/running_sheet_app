/**
 * Flat top-down shaped map marker SVGs.
 * Each icon is a 48×48 SVG string (no pin drop — just the shape).
 * Colours: red (#E53935), yellow (#F9A825), blue (#1E88E5), purple (#8E24AA)
 */

export type MarkerColour = "red" | "yellow" | "blue" | "purple" | "black";
export type MarkerIcon =
  | "house_outline"
  | "house_filled"
  | "sedan"
  | "arrow_up"
  | "arrow_right"
  | "arrow_ne"
  | "camera_photo"
  | "camera_cctv"
  | "hazard"
  | "coffee"
  | "toilet"
  | "rv"
  | "boat_cruiser";

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
  arrow_up: "Arrow (up)",
  arrow_right: "Arrow (right)",
  arrow_ne: "Arrow (NE)",
  camera_photo: "Camera",
  camera_cctv: "CCTV Camera",
  hazard: "Hazard",
  coffee: "Coffee",
  toilet: "Toilet",
  rv: "Rendezvous",
  boat_cruiser: "Boat (cruiser)",
};

export const MARKER_ICON_GROUPS: { label: string; icons: MarkerIcon[] }[] = [
  { label: "Locations", icons: ["house_outline", "house_filled"] },
  { label: "Vehicles", icons: ["sedan"] },
  { label: "Directions", icons: ["arrow_up", "arrow_right", "arrow_ne"] },
  { label: "Surveillance", icons: ["camera_photo", "camera_cctv"] },
  { label: "Points of Interest", icons: ["hazard", "coffee", "toilet", "rv", "boat_cruiser"] },
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
      // Top-down (bird's eye) view of a sedan
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
export function getMarkerDataUrl(icon: MarkerIcon, colour: MarkerColour): string {
  return svgToDataUrl(getMarkerSvg(icon, colour));
}

// ─── Colour utilities ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
