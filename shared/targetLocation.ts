/**
 * Target Location (Map Settings): which map markers belong to the target of the
 * active running sheet, and how they are marked.
 *
 * A marker is tied to a target when the Target Registry or a running sheet says
 * so: the target's own registered addresses, the address of one of the target's
 * registered associates, or a place that a row of the target's sheets names
 * together with the target (the server collects these on each place as
 * `linkedTargets` and `relatedTargetIds`, see server/db/mapping.ts). Nothing is
 * guessed from names or distance. A marker that has absorbed nearby places
 * (`secondaryLocs`) counts when any of them is tied. Pure rules, tested in
 * server/targetLocation.test.ts.
 *
 * The mark is a soft see-through shape behind the marker in the marker's own
 * colour — no border, one fixed strength and size, on or off only. A house
 * marker gets a house-shaped glow that follows its outline; every other icon
 * gets a rounded square.
 */

export interface TargetLocationPlace {
  linkedTargets?: readonly { targetId: number }[];
  relatedTargetIds?: readonly number[];
  secondaryLocs?: readonly TargetLocationPlace[];
}

/** True when the place (or any place merged into its marker) is tied to this
 * target. No target (no running sheet, or one without a target) marks nothing. */
export function placeLinkedToTarget(
  place: TargetLocationPlace | null | undefined,
  targetId: number | null | undefined
): boolean {
  if (!place || targetId == null) return false;
  if (place.relatedTargetIds?.includes(targetId)) return true;
  if (place.linkedTargets?.some(t => t.targetId === targetId)) return true;
  return (
    place.secondaryLocs?.some(s => placeLinkedToTarget(s, targetId)) ?? false
  );
}

/** How solid the tint is (0–1), and the tile's size as a fraction of the full
 * tile (1.4 × the icon's width): 30% and 80%, fixed — there are no options. */
export const TILE_STRENGTH = 0.3;
export const TILE_SIZE = 0.8;

/** The marker's own colour as "r,g,b" from "#rrggbb"; null when it isn't one. */
export function hexToRgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export interface TileStyle {
  /** Side of the tile in px, for an icon `iconPx` wide. */
  sizePx: number;
  /** Offset of the tile's top-left from the icon's top-left (negative = outside). */
  offsetPx: number;
  radiusPx: number;
  background: string;
  boxShadow: string;
}

/** The tile's look for an icon `iconPx` wide and a marker colour `#rrggbb`;
 * null for a colour that can't be read. The tile reaches .2 of the icon past it
 * on every side at full size, scaled by TILE_SIZE about the icon's centre. */
export function tileStyle(iconPx: number, markerHex: string): TileStyle | null {
  const rgb = hexToRgb(markerHex);
  if (!rgb) return null;
  const a = TILE_STRENGTH;
  const full = iconPx * 1.4;
  const sizePx = Math.round(full * TILE_SIZE * 10) / 10;
  return {
    sizePx,
    offsetPx: Math.round(((iconPx - sizePx) / 2) * 10) / 10,
    radiusPx: Math.round(iconPx * 0.28 * TILE_SIZE * 10) / 10,
    background: `linear-gradient(150deg, rgba(${rgb},${+(a * 1.25).toFixed(3)}), rgba(${rgb},${+(a * 0.75).toFixed(3)}))`,
    boxShadow: `0 0 ${Math.round(iconPx * 0.16 * TILE_SIZE * 10) / 10}px rgba(${rgb},${+(a * 0.9).toFixed(3)})`,
  };
}

/** Icons that get the house-shaped glow; everything else gets the square. */
const HOUSE_ICONS = new Set(["house_filled", "house_outline"]);

export type TileShape = "house" | "square";

export function tileShapeFor(icon: string): TileShape {
  return HOUSE_ICONS.has(icon) ? "house" : "square";
}

/** The house marker's silhouette (no door), in the icon's own 48 × 48 box —
 * the same outline as the house icon in lib/markerSvgs.ts. */
export const HOUSE_GLOW_PATH = "M24,4 44,22 40,22 40,44 8,44 8,22 4,22Z";

export interface HouseGlowStyle {
  /** The drawing sits exactly over the icon (same size, no offset). */
  sizePx: number;
  /** Width of the thick rounded outline, in the 48 × 48 drawing's units. */
  strokeWidth: number;
  rgb: string;
  opacity: number;
  blurPx: number;
}

/** The house glow for an icon `iconPx` wide. It reaches as far past the house's
 * edge as the square tile does (the tile's overhang past the icon box plus the
 * icon's own margin round the house), so the two read as the same size. */
export function houseGlowStyle(
  iconPx: number,
  markerHex: string
): HouseGlowStyle | null {
  const rgb = hexToRgb(markerHex);
  if (!rgb) return null;
  const tileOverhang = (iconPx * 1.4 * TILE_SIZE - iconPx) / 2;
  const iconMargin = (iconPx * 4) / 48;
  const reachPx = tileOverhang + iconMargin;
  const unitPx = iconPx / 48;
  return {
    sizePx: iconPx,
    strokeWidth: Math.round(((2 * reachPx) / unitPx) * 100) / 100,
    rgb,
    opacity: TILE_STRENGTH,
    blurPx: Math.round(iconPx * 0.015 * 100) / 100,
  };
}
