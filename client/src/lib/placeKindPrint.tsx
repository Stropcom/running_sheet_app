import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  BookMarked,
  Briefcase,
  Coffee,
  Dumbbell,
  Home,
  Landmark,
  MapPin,
  MoonStar,
  Plane,
  ShoppingBag,
  Stethoscope,
  Trees,
  type LucideIcon,
} from "lucide-react";
import type { PlaceKind } from "@shared/placesReport";

/** How each kind of place looks on paper: the same icon and colours the Places
 * page gives it (its Tailwind classes written out as hex, since a printed page
 * has no Tailwind). */
export const KIND_PRINT: Record<
  PlaceKind,
  { Icon: LucideIcon; border: string; bg: string; fg: string }
> = {
  home: { Icon: Home, border: "#6ee7b7", bg: "#ecfdf5", fg: "#047857" },
  work: { Icon: Briefcase, border: "#a5b4fc", bg: "#eef2ff", fg: "#4338ca" },
  gym: { Icon: Dumbbell, border: "#fdba74", bg: "#fff7ed", fg: "#c2410c" },
  food: { Icon: Coffee, border: "#fcd34d", bg: "#fffbeb", fg: "#92400e" },
  shop: { Icon: ShoppingBag, border: "#67e8f9", bg: "#ecfeff", fg: "#155e75" },
  travel: { Icon: Plane, border: "#93c5fd", bg: "#eff6ff", fg: "#1d4ed8" },
  leisure: { Icon: Trees, border: "#d8b4fe", bg: "#faf5ff", fg: "#7e22ce" },
  services: { Icon: Landmark, border: "#5eead4", bg: "#f0fdfa", fg: "#0f766e" },
  worship: { Icon: MoonStar, border: "#6ee7b7", bg: "#ecfdf5", fg: "#047857" },
  health: {
    Icon: Stethoscope,
    border: "#fda4af",
    bg: "#fff1f2",
    fg: "#be123c",
  },
  registered: {
    Icon: BookMarked,
    border: "#c4b5fd",
    bg: "#f5f3ff",
    fg: "#6d28d9",
  },
  other: { Icon: MapPin, border: "#cbd5e1", bg: "#f1f5f9", fg: "#334155" },
};

const cache = new Map<PlaceKind, string>();

/** The kind's icon as an SVG string, for the printable pages (which are plain
 * HTML written into a new window). Rendered once with the same icon the page
 * shows, then kept. */
export function kindIconSvg(kind: PlaceKind): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  // No page to draw on (the unit tests build these pages in Node): the card
  // is the same without its icon.
  if (typeof document === "undefined") return "";
  const { Icon, fg } = KIND_PRINT[kind];
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(<Icon size={19} color={fg} strokeWidth={2} />));
  const svg = host.innerHTML;
  root.unmount();
  cache.set(kind, svg);
  return svg;
}
