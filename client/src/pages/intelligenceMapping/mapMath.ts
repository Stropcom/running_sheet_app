import { DivIconOverlay } from "@/lib/divIconOverlay";

// ── Haversine distance helper (metres) ───────────────────────────────────────
export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Shared tween engine behind both animateLiveMarkerTo (a pin's position)
// and the follow-mode camera smoothing in the live-marker effect (the
// map's centre) — linearly interpolates a {lat,lng} from wherever
// `getCurrent()` says it actually is right now to `to`, via
// requestAnimationFrame, calling `setPosition` every frame. Cancels any
// tween already in flight for the same `key` (a fresh update landing
// mid-animation) via the caller-supplied animRef, so the two don't fight
// each other.
//
// Two things matter for this to read as one continuous motion rather than
// a repeating stop-start stutter, both learned the hard way from an
// initial version of the pin tween that used a fixed-duration ease-out:
//
//  1. Linear, not eased. An ease-out tween decelerates to a dead stop at
//     t=1, right as the NEXT tween needs to start again at full speed
//     (ease-out's velocity at t=0 is steep) — chaining ease-out segments
//     back to back creates a real velocity discontinuity at every
//     boundary, which reads as a little jerk even when the timing lines
//     up perfectly. Constant velocity per segment keeps speed roughly
//     continuous across boundaries instead.
//  2. Duration matched to the ACTUAL elapsed time since the last update
//     for this key (via lastUpdateRef), not a fixed guess. The poll fires
//     nominally every 1s, but tab throttling and network jitter routinely
//     widen that gap — a fixed shorter duration finishes early and leaves
//     the thing being animated sitting completely motionless until the
//     next real update lands, which is a genuine full stop, not just a
//     perceived one.
//
// A large jump (a device reconnecting far from its last known position, a
// corrected/stale fix) still snaps instantly instead of tweening —
// animating that slowly would look like teleporting in slow motion, not
// smooth continuous travel.
export function animateLatLngTo(
  key: string,
  getCurrent: () => google.maps.LatLngLiteral,
  setPosition: (p: google.maps.LatLngLiteral) => void,
  to: google.maps.LatLngLiteral,
  animRef: { current: Map<string, number> },
  lastUpdateRef: { current: Map<string, number> },
  snapDistanceM = 150
): void {
  const existingFrame = animRef.current.get(key);
  if (existingFrame != null) cancelAnimationFrame(existingFrame);

  const from = getCurrent();
  const distanceM = haversineMetres(from.lat, from.lng, to.lat, to.lng);
  const now = performance.now();
  const lastUpdateAt = lastUpdateRef.current.get(key);
  lastUpdateRef.current.set(key, now);

  if (distanceM > snapDistanceM) {
    setPosition(to);
    animRef.current.delete(key);
    return;
  }

  // Clamped so a very first update (no prior timestamp) falls back to the
  // nominal 1s poll cadence, and any freak multi-second gap (e.g. the tab
  // was backgrounded) doesn't produce an absurdly slow crawl.
  const durationMs =
    lastUpdateAt != null
      ? Math.min(Math.max(now - lastUpdateAt, 400), 3000)
      : 1000;

  const startTime = now;
  const step = (frameNow: number) => {
    const t = Math.min(1, (frameNow - startTime) / durationMs);
    setPosition({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
    if (t < 1) {
      animRef.current.set(key, requestAnimationFrame(step));
    } else {
      animRef.current.delete(key);
    }
  };
  animRef.current.set(key, requestAnimationFrame(step));
}

// Eases a live team pin's DivIconOverlay smoothly from its current position
// to a new one, instead of jumping instantly — the underlying GPS fix only
// arrives once a second (see the userLocations query's refetchInterval), so
// without this every pin visibly hops on each poll tick. See
// animateLatLngTo above for how and why.
export function animateLiveMarkerTo(
  marker: DivIconOverlay,
  pinKey: string,
  to: google.maps.LatLngLiteral,
  animRef: { current: Map<string, number> },
  lastUpdateRef: { current: Map<string, number> }
): void {
  animateLatLngTo(
    pinKey,
    () => marker.position,
    p => {
      marker.position = p;
    },
    to,
    animRef,
    lastUpdateRef
  );
}
