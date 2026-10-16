/**
 * Where Google address suggestions should lean ("bias") while an officer types
 * an address into an observation. Only a preference — Google still returns
 * matches from elsewhere in Australia — so the point is to be roughly right,
 * not exact, and never to be confidently wrong.
 *
 * A phone's GPS reports an accuracy of metres. A laptop has no GPS: its
 * browser guesses from Wi-Fi (tens of metres to a few hundred) or, failing
 * that, from the internet address (kilometres, and the wrong city on a VPN,
 * hotspot or office network). So a position is only used when the browser says
 * it is accurate enough (`USABLE_FIX_ACCURACY_M`); otherwise the bias stays on
 * the last good position, then the fallback, then Perth. Pure and
 * deterministic: no AI, same input → same output.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** A position as the browser reports it; accuracy is the radius in metres. */
export interface PositionFix extends LatLng {
  accuracy?: number | null;
}

export const PERTH_FALLBACK: LatLng = { lat: -31.9505, lng: 115.8605 };

/** How far Google looks around the centre first, in metres. */
export const BIAS_RADIUS_M = 50000;

/** Worse than this (an internet-address guess) is not trusted. */
export const USABLE_FIX_ACCURACY_M = 2000;

export function isUsableFix(fix: PositionFix | null | undefined): boolean {
  if (!fix) return false;
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return false;
  if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return false;
  // No accuracy figure at all is as good as unknown — do not trust it.
  if (typeof fix.accuracy !== "number" || !Number.isFinite(fix.accuracy))
    return false;
  return fix.accuracy <= USABLE_FIX_ACCURACY_M;
}

/** The position to remember after `fix` arrives: it replaces the last good one
 * only when it is itself good — a poor reading never discards a good one. */
export function acceptFix(
  lastGood: LatLng | null,
  fix: PositionFix | null | undefined
): LatLng | null {
  return fix && isUsableFix(fix) ? { lat: fix.lat, lng: fix.lng } : lastGood;
}

/** Where the suggestions lean: last good position, else `fallback`, else Perth. */
export function chooseBiasCentre(
  lastGood: LatLng | null,
  fallback?: LatLng | null
): LatLng {
  return lastGood ?? fallback ?? PERTH_FALLBACK;
}
