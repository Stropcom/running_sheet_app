// Pill options for the Map page's "My Pill" popup and the live pin it styles.
// The shape drawn here is the one the live pin itself draws, so the popup can
// never drift out of sync with what renders on the map.

export type PinHeadingShape =
  | "arrow"
  | "dart"
  | "cursor"
  | "finger"
  | "up_arrow_emoji"
  | "rocket"
  | "airplane"
  | "pizza"
  | "car"
  | "racing_car"
  | "motorcycle"
  | "truck"
  | "police_car";

// Returns the shape's own markup (not yet rotated — the caller wraps this
// in a rotated container, see createUserPinElement) for whichever
// pinVehicleIcon the officer has picked. car/racing_car/motorcycle/truck/
// police_car aren't built yet (reserved for a future side-view-vehicle
// mode, see their own comment in schema.ts) — falls through to the default
// arrow rather than rendering nothing if one is ever set.
export function renderHeadingShapeInner(shape: PinHeadingShape): string {
  const shadow = "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));";
  const svg = (points: string) =>
    `<svg viewBox="0 0 24 24" width="25" height="25" style="overflow:visible;${shadow}"><polygon points="${points}" fill="#16a34a"/></svg>`;
  const glyph = (emoji: string) =>
    `<span style="font-size:20px;line-height:25px;width:25px;height:25px;display:block;text-align:center;${shadow}">${emoji}</span>`;
  switch (shape) {
    case "dart":
      return svg("12 1 20 22 12 16 4 22");
    case "cursor":
      return svg("5 2 5 20 9.5 15.5 12.5 22 15.5 20.5 12.5 14 19 14");
    case "finger":
      return glyph("☝️");
    case "up_arrow_emoji":
      return glyph("⬆️");
    case "rocket":
      return glyph("🚀");
    case "airplane":
      return glyph("✈️");
    case "pizza":
      return glyph("🍕");
    default:
      return svg("12 2 19 21 12 17 5 21 12 2");
  }
}

// Pin-customise popup's colour picker — a fixed 10-swatch palette rather
// than a free colour input, so every officer's pill stays legible (white
// text on top) and visually distinct from the others at a glance. Values
// are what gets stored in users.pinColor and read straight back for the
// pill's background — see PIN_COLOUR_SWATCHES' own comment in schema.ts.
export const PIN_COLOUR_SWATCHES: { hex: string; name: string }[] = [
  { hex: "#ec4899", name: "Pink" },
  { hex: "#1976d2", name: "Blue" },
  { hex: "#f9a825", name: "Yellow" },
  { hex: "#16a34a", name: "Green" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#7c3aed", name: "Purple" },
  { hex: "#0891b2", name: "Teal" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#4f46e5", name: "Indigo" },
  { hex: "#57534e", name: "Slate" },
];

// Pin-customise popup's Wheels-mode heading-shape picker — every
// non-reserved pinVehicleIcon value (arrow is the default, the other seven
// picked from the "Heading Shape Ideas" artifact) with a human label for
// the button's title/aria-label. Preview markup for each comes straight
// from renderHeadingShapeInner, so the popup can never drift out of sync
// with what actually renders on the live pin.
export const HEADING_SHAPE_OPTIONS: {
  key: PinHeadingShape;
  label: string;
}[] = [
  { key: "arrow", label: "Arrow (default)" },
  { key: "dart", label: "Dart" },
  { key: "cursor", label: "Cursor" },
  { key: "finger", label: "Index finger" },
  { key: "up_arrow_emoji", label: "Up arrow" },
  { key: "rocket", label: "Rocket" },
  { key: "airplane", label: "Airplane" },
  { key: "pizza", label: "Pizza slice" },
];
