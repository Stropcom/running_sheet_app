/**
 * Pure geometry/logic for the live-team marker redesign (bench page only —
 * NOT wired into the production pin in IntelligenceMapping.tsx yet). Kept
 * dependency-free so it can be dropped into createUserPinElement later
 * without dragging the bench page along.
 */

export type PaceTier = "stopped" | "a" | "b" | "c";

// Speed thresholds in km/h. "Stopped" mirrors the app's existing
// speed > 0.5 m/s (~1.8 km/h) moving/stationary cutoff exactly, so this is
// a strict refinement of that check, not a different rule.
const STOPPED_MAX_KMH = 1.8;
const TIER_A_MAX_KMH = 50;
const TIER_B_MAX_KMH = 80;

export function getPaceTierFromKmh(speedKmh: number): PaceTier {
  if (speedKmh <= STOPPED_MAX_KMH) return "stopped";
  if (speedKmh <= TIER_A_MAX_KMH) return "a";
  if (speedKmh <= TIER_B_MAX_KMH) return "b";
  return "c";
}

export interface HeadingRotation {
  rotationDeg: number;
  flip: boolean;
}

/**
 * Local rest orientation: the taper's point sits on the RIGHT, which
 * corresponds to heading 90°/East at zero rotation. Rotating by the literal
 * (heading - 90) would read the CIN upside-down for roughly half of all
 * headings, so past ±90° off level the rotation folds back into range and
 * the caller mirrors the taper to the other end instead (see
 * bulletTaperPath's `flip` param) — the tip still tracks true heading, the
 * text just never flips past readable.
 */
export function computeHeadingRotation(headingDeg: number): HeadingRotation {
  const raw = ((((headingDeg - 90 + 180) % 360) + 360) % 360) - 180;
  if (raw > 90) return { rotationDeg: raw - 180, flip: true };
  if (raw < -90) return { rotationDeg: raw + 180, flip: true };
  return { rotationDeg: raw, flip: false };
}

/** Rounded-both-ends pill outline, in the element's own pixel space (top-left origin). */
export function roundedPillPath(width: number, height: number): string {
  const r = height / 2;
  return (
    `M${r},0 L${width - r},0 A${r},${r} 0 0 1 ${width - r},${height} ` +
    `L${r},${height} A${r},${r} 0 0 1 ${r},0 Z`
  );
}

/**
 * Bullet-taper outline: rounded on one end, a gently rounded point (never a
 * sharp vertex) on the other. `flip` puts the point on the left instead of
 * the right, mirroring the geometry directly rather than transform-flipping
 * the whole shape, so callers can rotate this by a small angle and still
 * get pixel-accurate arcs.
 */
export function bulletTaperPath(
  width: number,
  height: number,
  flip: boolean
): string {
  const hh = height / 2;
  const tipRadius = Math.min(3.5, hh - 1);
  const shoulderFrac = 0.62;

  if (!flip) {
    const capCx = hh;
    const shoulder = width * shoulderFrac;
    const dx = width - shoulder;
    const len = Math.hypot(dx, hh);
    const ax = width - (dx / len) * tipRadius;
    const ay = hh - (hh / len) * tipRadius;
    const by = height - ay;
    return (
      `M${capCx},0 L${shoulder.toFixed(1)},0 ` +
      `L${ax.toFixed(1)},${ay.toFixed(1)} ` +
      `A${tipRadius},${tipRadius} 0 0 1 ${ax.toFixed(1)},${by.toFixed(1)} ` +
      `L${shoulder.toFixed(1)},${height} L${capCx},${height} ` +
      `A${hh},${hh} 0 0 1 ${capCx},0 Z`
    );
  }

  const capCx = width - hh;
  const shoulder = width * (1 - shoulderFrac);
  const len = Math.hypot(shoulder, hh);
  const ax = (shoulder / len) * tipRadius;
  const ay = hh - (hh / len) * tipRadius;
  const by = height - ay;
  return (
    `M${capCx},0 L${shoulder.toFixed(1)},0 ` +
    `L${ax.toFixed(1)},${ay.toFixed(1)} ` +
    `A${tipRadius},${tipRadius} 0 0 0 ${ax.toFixed(1)},${by.toFixed(1)} ` +
    `L${shoulder.toFixed(1)},${height} L${capCx},${height} ` +
    `A${hh},${hh} 0 0 0 ${capCx},0 Z`
  );
}

/** CSS class carrying the pace-tier border glow — see index.css for the rules. */
export function pinTierClass(tier: PaceTier): string {
  switch (tier) {
    case "a":
      return "live-pin-tier-a";
    case "b":
      return "live-pin-tier-b";
    case "c":
      return "live-pin-tier-c";
    default:
      return "";
  }
}
