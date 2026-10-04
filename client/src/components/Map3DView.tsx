/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { FLY_ICON_ASPECT } from "@/lib/flyMarkerIcon";

// Full 3D "fly-over" map (Google's photorealistic 3D imagery) — a separate
// map component from the flat google.maps.Map, switched in by the "Fly"
// button on the Intelligence map. Everything is feature-detected: the 3D
// library (`maps3d`) is still evolving and its typings in @types/google.maps
// lag behind it, so this reaches it through importLibrary() as plain objects
// and reports a readable message instead of failing silently when the key,
// project or script version doesn't offer it.
//
// Deliberately never `class X extends google.maps.*` at module scope (see
// CLAUDE.md's note on divIconOverlay.ts) — everything here runs inside an
// effect after the Maps script has loaded.

/** A marker on the 3D map: a picture (the flat map's own icon, with its badges
 * drawn on — see lib/flyMarkerIcon.ts) at a position. */
export interface FlyMarker {
  id: string;
  lat: number;
  lng: number;
  iconUrl: string;
  /** Pixel size of the picture (default 48). */
  size?: number;
  /** Exact picture size in pixels (overrides `size`) — for pictures that
   * aren't the standard marker shape. */
  width?: number;
  height?: number;
  /** Pin the bottom point exactly on the ground (team members), instead of
   * resting just above the roof or tree surface there. */
  onGround?: boolean;
  /** Optional text under the marker (custom marker captions, team names). */
  label?: string;
  /** Moves smoothly to a new position instead of jumping (live team pins). */
  glide?: boolean;
}

/** A drawn area or line on the 3D map. */
export interface FlyShape {
  id: string;
  kind: "polygon" | "line";
  coords: { lat: number; lng: number }[];
  /** Hex colour, e.g. "#2563eb". */
  colour: string;
  /** Fill opacity 0..1 (polygons). */
  opacity: number;
  /** Polygons are drawn as two parts: the "fill" is a flat translucent sheet
   * held above the rooftops and trees, so the shading is even whatever stands
   * on the ground; the "edge" is the outline laid on the ground. */
  part?: "fill" | "edge";
}

/** Height of the shading sheet above the ground, metres. */
const FILL_SHEET_HEIGHT_M = 45;
/** Where the 3D camera was. Kept for the rest of the browser session so
 * reopening Fly returns to where it was left. */
export interface FlyCamera {
  center: { lat: number; lng: number };
  range: number;
  tilt: number;
  heading: number;
}
let lastFlyCamera: FlyCamera | null = null;
export function getLastFlyCamera(): FlyCamera | null {
  return lastFlyCamera;
}

interface Map3DViewProps {
  center: { lat: number; lng: number };
  /** Camera distance from the centre, metres. */
  range: number;
  /** Degrees; 0 = looking straight down. */
  tilt?: number;
  /** Degrees; 0 = north up. */
  heading?: number;
  markers: FlyMarker[];
  shapes: FlyShape[];
  onMarkerClick: (id: string) => void;
  /** Reports the camera's centre as it moves, so leaving 3D can put the flat
   * map where the officer ended up. */
  onCenterChange: (center: { lat: number; lng: number }) => void;
  /** Right-click (desktop) or press-and-hold (touch) at a spot — the same
   * gesture the flat map uses to open its "add here" chooser. */
  onLocationAction?: (lat: number, lng: number) => void;
  /** A click on a business / street number. */
  onPlaceClick?: (lat: number, lng: number, placeId: string) => void;
  /** A plain click on the ground or a building. */
  onGroundClick?: (lat: number, lng: number) => void;
  /** The 3D map never reported a location for a right-click / hold. */
  onActionUnavailable?: () => void;
  /** The camera's heading, rounded to 10°, whenever that rounded value
   * changes — pictures that point somewhere are redrawn for it. */
  onHeadingChange?: (heading: number) => void;
  /** The camera's tilt, rounded to 5°, whenever that rounded value changes. */
  onTiltChange?: (tilt: number) => void;
  /** Turn the camera to a heading and/or tilt (North up, 0° tilt) once per
   * change of `n`, keeping the centre and range. */
  cameraRequest?: { heading?: number; tilt?: number; n: number } | null;
  /** Keep the camera centred on this marker as it moves (Follow me). */
  followId?: string | null;
  /** Fly the camera to a spot once per change of `n` (Centre on me). */
  centerRequest?: { lat: number; lng: number; n: number } | null;
  className?: string;
}

/** One marker on the 3D map, with the state that lets it glide. */
interface MarkerEntry {
  el: HTMLElement;
  /** Everything about the marker except where it is — a change here means
   * the picture changed, and the element is rebuilt. */
  sig: string;
  /** Where it is drawn right now (mid-glide this lags the target). */
  cur: { lat: number; lng: number };
  anim: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    start: number;
    dur: number;
  } | null;
  lastMoveAt: number;
  glide: boolean;
  onGround: boolean;
}

/** A jump bigger than this snaps instead of gliding (a reconnect, a corrected
 * fix) — gliding that far would look like teleporting in slow motion. */
const GLIDE_SNAP_M = 150;

function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng =
    (b.lng - a.lng) *
    111_320 *
    Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function Map3DView({
  center,
  range,
  tilt = 0,
  heading = 0,
  markers,
  shapes,
  onMarkerClick,
  onCenterChange,
  onLocationAction,
  onPlaceClick,
  onGroundClick,
  onActionUnavailable,
  onHeadingChange,
  onTiltChange,
  cameraRequest,
  followId,
  centerRequest,
  className,
}: Map3DViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorText, setErrorText] = useState("");
  // Small read-out of what the 3D camera is actually doing (and any error the
  // 3D element reports), so a flat-looking result can be diagnosed from a
  // screenshot instead of guessed at.
  const [debug, setDebug] = useState("");
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;
  const gestureRef = useRef({
    onLocationAction,
    onPlaceClick,
    onGroundClick,
    onActionUnavailable,
  });
  gestureRef.current = {
    onLocationAction,
    onPlaceClick,
    onGroundClick,
    onActionUnavailable,
  };
  // Latest props for the one-time camera setup below (re-running it would
  // restart the camera) — markers and shapes are applied by the sync effect.
  const initialRef = useRef({ center, range, tilt, heading });
  const latestRef = useRef({ markers, shapes });
  latestRef.current = { markers, shapes };
  // Set by the setup effect once the 3D element exists; (re)applies the
  // markers and shapes in latestRef, touching only what changed.
  const syncRef = useRef<(() => void) | null>(null);
  const followIdRef = useRef<string | null>(followId ?? null);
  followIdRef.current = followId ?? null;
  // Set by the setup effect: (re)starts the per-frame loop, and flies the
  // camera to a spot while holding Follow off for a moment so the two don't
  // fight.
  const onTiltChangeRef = useRef(onTiltChange);
  onTiltChangeRef.current = onTiltChange;
  const turnToRef = useRef<
    ((o: { heading?: number; tilt?: number }) => void) | null
  >(null);
  const kickRef = useRef<(() => void) | null>(null);
  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const markerPosRef = useRef<
    ((id: string) => { lat: number; lng: number } | null) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    let map3d: HTMLElement | null = null;
    const cleanups: Array<() => void> = [];

    (async () => {
      try {
        await loadGoogleMaps();
        const importLibrary = (
          window.google?.maps as unknown as {
            importLibrary?: (name: string) => Promise<any>;
          }
        )?.importLibrary;
        if (!importLibrary) {
          throw new Error(
            "This version of the Google Maps script has no importLibrary()."
          );
        }
        const lib = await importLibrary.call(window.google.maps, "maps3d");
        if (cancelled) return;
        const Map3DElement = lib?.Map3DElement;
        if (!Map3DElement) {
          throw new Error(
            "The 3D maps library (Map3DElement) isn't available on this map connection."
          );
        }
        const init = initialRef.current;
        const el = new Map3DElement({
          center: { lat: init.center.lat, lng: init.center.lng, altitude: 0 },
          range: init.range,
          tilt: init.tilt,
          heading: init.heading,
          mode: lib.MapMode?.HYBRID ?? "HYBRID",
        }) as HTMLElement & { center?: any };
        map3d = el;
        el.style.cssText = "display:block;width:100%;height:100%;";
        hostRef.current?.appendChild(el);

        const apiVersion =
          (window.google?.maps as unknown as { version?: string })?.version ??
          "?";
        const describe = (note = "") => {
          const e = el as any;
          const r = typeof e.range === "number" ? Math.round(e.range) : "?";
          const t = typeof e.tilt === "number" ? Math.round(e.tilt) : "?";
          const h = typeof e.heading === "number" ? Math.round(e.heading) : "?";
          setDebug(
            `3D · tilt ${t}° · heading ${h}° · range ${r} m · API ${apiVersion}${note ? ` · ${note}` : ""}`
          );
        };
        describe();
        for (const evt of [
          "gmp-tiltchange",
          "gmp-headingchange",
          "gmp-rangechange",
          "gmp-steadychange",
        ]) {
          const fn = () => describe();
          el.addEventListener(evt, fn);
          cleanups.push(() => el.removeEventListener(evt, fn));
        }
        const onErr = (ev: Event) => {
          const detail = (ev as CustomEvent).detail;
          describe(`error: ${detail?.message ?? ev.type}`);
        };
        el.addEventListener("gmp-error", onErr);
        cleanups.push(() => el.removeEventListener("gmp-error", onErr));

        // Set the camera as properties as well as via the constructor
        // options, so the requested tilt and heading really apply.
        try {
          (el as any).tilt = init.tilt;
          (el as any).heading = init.heading;
          (el as any).range = init.range;
        } catch {
          /* property not settable on this version */
        }

        // Remember the camera so reopening Fly later in this session returns
        // to where it was left.
        const rememberCamera = () => {
          const e = el as any;
          const c = e.center;
          if (
            c &&
            typeof c.lat === "number" &&
            typeof c.lng === "number" &&
            typeof e.range === "number" &&
            typeof e.tilt === "number" &&
            typeof e.heading === "number"
          ) {
            lastFlyCamera = {
              center: { lat: c.lat, lng: c.lng },
              range: e.range,
              tilt: e.tilt,
              heading: e.heading,
            };
          }
        };
        for (const evt of [
          "gmp-centerchange",
          "gmp-rangechange",
          "gmp-tiltchange",
          "gmp-headingchange",
        ]) {
          el.addEventListener(evt, rememberCamera);
          cleanups.push(() => el.removeEventListener(evt, rememberCamera));
        }
        let lastHeadingQ = Math.round(init.heading / 10) * 10;
        const reportHeading = () => {
          const h = (el as any).heading;
          if (typeof h !== "number") return;
          const q = (Math.round(h / 10) * 10 + 360) % 360;
          if (q !== lastHeadingQ) {
            lastHeadingQ = q;
            onHeadingChangeRef.current?.(q);
          }
        };
        el.addEventListener("gmp-headingchange", reportHeading);
        cleanups.push(() =>
          el.removeEventListener("gmp-headingchange", reportHeading)
        );
        let lastTiltQ = Math.round(init.tilt / 5) * 5;
        const reportTilt = () => {
          const t = (el as any).tilt;
          if (typeof t !== "number") return;
          const q = Math.round(t / 5) * 5;
          if (q !== lastTiltQ) {
            lastTiltQ = q;
            onTiltChangeRef.current?.(q);
          }
        };
        el.addEventListener("gmp-tiltchange", reportTilt);
        cleanups.push(() =>
          el.removeEventListener("gmp-tiltchange", reportTilt)
        );
        turnToRef.current = o => {
          const e = el as any;
          const c = e.center;
          if (!c) return;
          let heading = e.heading;
          if (typeof o.heading === "number" && typeof heading === "number") {
            // The short way round, not a full spin.
            heading += ((o.heading - heading + 540) % 360) - 180;
          }
          try {
            e.flyCameraTo({
              endCamera: {
                center: { lat: c.lat, lng: c.lng, altitude: c.altitude ?? 0 },
                tilt: typeof o.tilt === "number" ? o.tilt : e.tilt,
                heading,
                range: e.range,
              },
              durationMillis: 700,
            });
          } catch {
            try {
              if (typeof o.heading === "number") e.heading = o.heading;
              if (typeof o.tilt === "number") e.tilt = o.tilt;
            } catch {
              /* nothing more to try */
            }
          }
        };
        cleanups.push(() => {
          turnToRef.current = null;
        });
        cleanups.push(rememberCamera);

        // Camera centre → flat map position on exit.
        const onCenter = () => {
          const c = el.center;
          if (c && typeof c.lat === "number" && typeof c.lng === "number")
            onCenterChangeRef.current({ lat: c.lat, lng: c.lng });
        };
        el.addEventListener("gmp-centerchange", onCenter);
        cleanups.push(() =>
          el.removeEventListener("gmp-centerchange", onCenter)
        );

        // ── Clicks and the "add here" gestures ───────────────────────────
        // The 3D element reports where a click landed (gmp-click) but has no
        // pixel→position lookup, so right-click and press-and-hold are
        // recognised on the page and then matched with the 3D element's own
        // click report for that same gesture.
        const intent = { until: 0, handled: false };
        const armIntent = (ms: number) => {
          intent.until = Date.now() + ms;
          intent.handled = false;
          window.setTimeout(() => {
            if (!intent.handled && Date.now() >= intent.until) {
              gestureRef.current.onActionUnavailable?.();
            }
          }, ms + 100);
        };
        // A click on a marker also reaches the map's own click listener, as a
        // click "on the ground" — so a marker click is noted here and the map
        // listener ignores it (otherwise selecting a marker offers to add one).
        const markerClick = { at: 0 };
        const onMapClick = (ev: any) => {
          if (Date.now() - markerClick.at < 500) return;
          if (ev?.target && ev.target !== el) return;
          const pos = ev?.position;
          const lat = typeof pos?.lat === "function" ? pos.lat() : pos?.lat;
          const lng = typeof pos?.lng === "function" ? pos.lng() : pos?.lng;
          if (typeof lat !== "number" || typeof lng !== "number") return;
          if (Date.now() < intent.until) {
            intent.until = 0;
            intent.handled = true;
            gestureRef.current.onLocationAction?.(lat, lng);
            return;
          }
          if (ev.placeId) {
            gestureRef.current.onPlaceClick?.(lat, lng, ev.placeId);
            return;
          }
          gestureRef.current.onGroundClick?.(lat, lng);
        };
        el.addEventListener("gmp-click", onMapClick);
        cleanups.push(() => el.removeEventListener("gmp-click", onMapClick));

        const host = hostRef.current;
        if (host) {
          let holdTimer: number | null = null;
          let startX = 0;
          let startY = 0;
          const clearHold = () => {
            if (holdTimer != null) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
          };
          const onDown = (e: PointerEvent) => {
            startX = e.clientX;
            startY = e.clientY;
            if (e.pointerType === "touch" || e.pointerType === "pen") {
              clearHold();
              holdTimer = window.setTimeout(() => {
                holdTimer = null;
                navigator.vibrate?.(30);
                // Wait for the lift-off click report, which comes after the hold.
                armIntent(4000);
              }, 600);
            } else if (e.button === 2) {
              armIntent(900);
            }
          };
          const onMove = (e: PointerEvent) => {
            if (
              holdTimer != null &&
              Math.hypot(e.clientX - startX, e.clientY - startY) > 10
            )
              clearHold();
          };
          const onContextMenu = (e: Event) => {
            e.preventDefault();
            if (Date.now() >= intent.until) armIntent(900);
          };
          host.addEventListener("pointerdown", onDown, true);
          host.addEventListener("pointermove", onMove, true);
          host.addEventListener("pointerup", clearHold, true);
          host.addEventListener("pointercancel", clearHold, true);
          host.addEventListener("contextmenu", onContextMenu, true);
          cleanups.push(() => {
            clearHold();
            host.removeEventListener("pointerdown", onDown, true);
            host.removeEventListener("pointermove", onMove, true);
            host.removeEventListener("pointerup", clearHold, true);
            host.removeEventListener("pointercancel", clearHold, true);
            host.removeEventListener("contextmenu", onContextMenu, true);
          });
        }

        // ── Markers and shapes, kept in step with the props ──────────────
        const MarkerCtor =
          lib.Marker3DInteractiveElement ?? lib.Marker3DElement;
        const PolygonCtor = lib.Polygon3DElement;
        const PolylineCtor = lib.Polyline3DElement;
        const markerEls = new Map<string, MarkerEntry>();
        const shapeEls = new Map<string, { el: HTMLElement; sig: string }>();

        const buildMarker = (
          m: FlyMarker,
          at: { lat: number; lng: number }
        ): HTMLElement | null => {
          if (!MarkerCtor) return null;
          // The picture's tail-end dot marks the exact spot. It rests just
          // above the surface there (roof, tree or ground), not under it:
          // a marker buried under a rooftop is drawn faded by the 3D map,
          // which is what made markers fade out as the camera came close.
          const marker = new MarkerCtor({
            position: {
              lat: at.lat,
              lng: at.lng,
              altitude: m.onGround ? 0 : 3,
            },
            altitudeMode: m.onGround ? "CLAMP_TO_GROUND" : "RELATIVE_TO_MESH",
            drawsWhenOccluded: true,
            sizePreserved: true,
            ...(m.label ? { label: m.label } : {}),
          }) as HTMLElement;
          const size = m.size ?? 48;
          const tpl = document.createElement("template");
          const img = document.createElement("img");
          img.src = m.iconUrl;
          img.width = m.width ?? size;
          img.height = m.height ?? Math.round(size * FLY_ICON_ASPECT);
          tpl.content.append(img);
          marker.append(tpl);
          marker.addEventListener("gmp-click", (e: Event) => {
            markerClick.at = Date.now();
            e.stopPropagation();
            onMarkerClickRef.current(m.id);
          });
          return marker;
        };

        const buildShape = (s: FlyShape): HTMLElement | null => {
          const coords = s.coords.map(c => ({
            lat: c.lat,
            lng: c.lng,
            altitude: 0,
          }));
          if (s.kind === "polygon" && PolygonCtor) {
            if (s.part === "fill") {
              return new PolygonCtor({
                outerCoordinates: coords.map(c => ({
                  ...c,
                  altitude: FILL_SHEET_HEIGHT_M,
                })),
                fillColor: hexToRgba(s.colour, s.opacity),
                strokeColor: "rgba(0, 0, 0, 0)",
                strokeWidth: 0,
                altitudeMode: "RELATIVE_TO_GROUND",
                drawsOccludedSegments: true,
              }) as HTMLElement;
            }
            return new PolygonCtor({
              outerCoordinates: coords,
              fillColor: "rgba(0, 0, 0, 0)",
              strokeColor: hexToRgba(s.colour, 0.95),
              strokeWidth: 4,
              // Flat on the ground, however the buildings and trees stand.
              altitudeMode: "CLAMP_TO_GROUND",
              // Keep drawing the outline where a building or tree is in front
              // of it — otherwise the edge shows as broken dashes.
              drawsOccludedSegments: true,
            }) as HTMLElement;
          }
          if (s.kind === "line" && PolylineCtor) {
            return new PolylineCtor({
              coordinates: coords,
              strokeColor: hexToRgba(s.colour, 0.95),
              strokeWidth: 6,
              altitudeMode: "CLAMP_TO_GROUND",
              drawsOccludedSegments: true,
            }) as HTMLElement;
          }
          return null;
        };

        const syncItems = <T extends { id: string }>(
          wanted: T[],
          have: Map<string, { el: HTMLElement; sig: string }>,
          build: (item: T) => HTMLElement | null
        ) => {
          const keep = new Set(wanted.map(w => w.id));
          for (const [id, entry] of Array.from(have)) {
            if (!keep.has(id)) {
              entry.el.remove();
              have.delete(id);
            }
          }
          for (const item of wanted) {
            const sig = JSON.stringify(item);
            const prev = have.get(item.id);
            if (prev && prev.sig === sig) continue;
            prev?.el.remove();
            try {
              const built = build(item);
              if (built) {
                el.append(built);
                have.set(item.id, { el: built, sig });
              } else {
                have.delete(item.id);
              }
            } catch {
              // One item failing shouldn't lose the rest.
              have.delete(item.id);
            }
          }
        };

        // ── Gliding and following ────────────────────────────────────────
        // One animation-frame loop moves every gliding marker toward its
        // latest fix at constant speed, over the time since the previous fix
        // (so it arrives just as the next one lands — no stop-start), and
        // keeps the camera on the followed marker.
        let raf = 0;
        let interacting = false;
        let interactTimer: number | null = null;
        let holdFollowUntil = 0;
        let lastFollowed: { lat: number; lng: number } | null = null;
        const placeMarker = (
          e: MarkerEntry,
          p: { lat: number; lng: number }
        ) => {
          e.cur = p;
          try {
            (e.el as any).position = {
              lat: p.lat,
              lng: p.lng,
              altitude: e.onGround ? 0 : 3,
            };
          } catch {
            /* position not settable on this version */
          }
        };
        const frame = (now: number) => {
          raf = 0;
          let moving = false;
          for (const e of Array.from(markerEls.values())) {
            const a = e.anim;
            if (!a) continue;
            const t = Math.min(1, (now - a.start) / a.dur);
            placeMarker(e, {
              lat: a.from.lat + (a.to.lat - a.from.lat) * t,
              lng: a.from.lng + (a.to.lng - a.from.lng) * t,
            });
            if (t < 1) moving = true;
            else e.anim = null;
          }
          const fid = followIdRef.current;
          if (fid) {
            const e = markerEls.get(fid);
            if (e && !interacting && Date.now() >= holdFollowUntil) {
              if (
                !lastFollowed ||
                lastFollowed.lat !== e.cur.lat ||
                lastFollowed.lng !== e.cur.lng
              ) {
                lastFollowed = { lat: e.cur.lat, lng: e.cur.lng };
                try {
                  (el as any).center = {
                    lat: e.cur.lat,
                    lng: e.cur.lng,
                    altitude: 0,
                  };
                } catch {
                  /* centre not settable on this version */
                }
              }
            }
          }
          if (moving || followIdRef.current) raf = requestAnimationFrame(frame);
        };
        const kick = () => {
          if (!raf) raf = requestAnimationFrame(frame);
        };
        kickRef.current = kick;
        markerPosRef.current = id => markerEls.get(id)?.cur ?? null;
        flyToRef.current = (lat, lng) => {
          holdFollowUntil = Date.now() + 1100;
          lastFollowed = null;
          const c = { lat, lng, altitude: 0 };
          const e = el as any;
          try {
            e.flyCameraTo({
              endCamera: {
                center: c,
                tilt: e.tilt,
                heading: e.heading,
                range: e.range,
              },
              durationMillis: 900,
            });
          } catch {
            try {
              e.center = c;
            } catch {
              /* nothing more to try */
            }
          }
          kick();
        };
        // A finger or mouse on the map suspends Follow (and lets go a moment
        // after) so dragging and pinching aren't fought frame by frame.
        const holdInteract = (ms: number) => {
          interacting = true;
          if (interactTimer != null) window.clearTimeout(interactTimer);
          interactTimer = window.setTimeout(() => {
            interacting = false;
            interactTimer = null;
            lastFollowed = null;
          }, ms);
        };
        const onPress = () => holdInteract(1_000_000);
        const onRelease = () => holdInteract(700);
        const onWheel = () => holdInteract(700);
        if (host) {
          host.addEventListener("pointerdown", onPress, true);
          host.addEventListener("pointerup", onRelease, true);
          host.addEventListener("pointercancel", onRelease, true);
          host.addEventListener("wheel", onWheel, true);
        }
        cleanups.push(() => {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          if (interactTimer != null) window.clearTimeout(interactTimer);
          kickRef.current = null;
          flyToRef.current = null;
          markerPosRef.current = null;
          host?.removeEventListener("pointerdown", onPress, true);
          host?.removeEventListener("pointerup", onRelease, true);
          host?.removeEventListener("pointercancel", onRelease, true);
          host?.removeEventListener("wheel", onWheel, true);
        });

        const syncMarkers = (wanted: FlyMarker[]) => {
          const keep = new Set(wanted.map(w => w.id));
          for (const [id, entry] of Array.from(markerEls)) {
            if (!keep.has(id)) {
              entry.el.remove();
              markerEls.delete(id);
            }
          }
          const now = performance.now();
          for (const m of wanted) {
            const { lat, lng, ...rest } = m;
            const sig = JSON.stringify(rest);
            const target = { lat, lng };
            const prev = markerEls.get(m.id);
            if (prev && prev.sig === sig) {
              // Same picture — only the position may have moved.
              if (prev.cur.lat === lat && prev.cur.lng === lng && !prev.anim)
                continue;
              const last = prev.anim?.to ?? prev.cur;
              if (last.lat === lat && last.lng === lng) continue;
              if (!m.glide || distanceM(prev.cur, target) > GLIDE_SNAP_M) {
                prev.anim = null;
                placeMarker(prev, target);
              } else {
                prev.anim = {
                  from: { ...prev.cur },
                  to: target,
                  start: now,
                  dur: Math.min(Math.max(now - prev.lastMoveAt, 400), 3000),
                };
                kick();
              }
              prev.lastMoveAt = now;
              continue;
            }
            // New marker, or its picture changed: build it at the spot it's
            // drawn at now (so it carries on gliding), then let go of the old.
            const at = prev ? prev.cur : target;
            try {
              const built = buildMarker(m, at);
              if (built) {
                el.append(built);
                if (prev) {
                  const old = prev.el;
                  window.setTimeout(() => old.remove(), 150);
                }
                const entry: MarkerEntry = {
                  el: built,
                  sig,
                  cur: { ...at },
                  anim: null,
                  lastMoveAt: prev?.lastMoveAt ?? now,
                  glide: !!m.glide,
                  onGround: !!m.onGround,
                };
                markerEls.set(m.id, entry);
                if (at.lat !== lat || at.lng !== lng) {
                  const far = distanceM(at, target) > GLIDE_SNAP_M;
                  if (!m.glide || far) placeMarker(entry, target);
                  else {
                    entry.anim = {
                      from: { ...at },
                      to: target,
                      start: now,
                      dur: Math.min(
                        Math.max(now - entry.lastMoveAt, 400),
                        3000
                      ),
                    };
                    entry.lastMoveAt = now;
                    kick();
                  }
                }
              } else {
                prev?.el.remove();
                markerEls.delete(m.id);
              }
            } catch {
              // One item failing shouldn't lose the rest.
              prev?.el.remove();
              markerEls.delete(m.id);
            }
          }
        };

        syncRef.current = () => {
          syncItems(latestRef.current.shapes, shapeEls, buildShape);
          syncMarkers(latestRef.current.markers);
        };
        syncRef.current();
        cleanups.push(() => {
          syncRef.current = null;
        });
        if (followIdRef.current) kick();

        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorText(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach(fn => fn());
      map3d?.remove();
    };
  }, []);

  // Apply new markers/shapes (refresh while in Fly) once the 3D map exists.
  useEffect(() => {
    syncRef.current?.();
  }, [markers, shapes]);

  // Follow me: fly to the marker once, then the frame loop keeps the camera
  // on it.
  useEffect(() => {
    kickRef.current?.();
    if (!followId) return;
    const at = markerPosRef.current?.(followId);
    if (at) flyToRef.current?.(at.lat, at.lng);
  }, [followId]);

  // North up / 0° tilt.
  useEffect(() => {
    if (!cameraRequest) return;
    turnToRef.current?.({
      heading: cameraRequest.heading,
      tilt: cameraRequest.tilt,
    });
  }, [cameraRequest?.n]);

  // Centre on me: fly to the requested spot.
  useEffect(() => {
    if (!centerRequest) return;
    flyToRef.current?.(centerRequest.lat, centerRequest.lng);
  }, [centerRequest?.n]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={hostRef} className="absolute inset-0 bg-black" />
      {status === "ready" && debug && (
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white/90 pointer-events-none max-w-[70%] truncate">
          {debug}
        </div>
      )}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-white text-sm pointer-events-none">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading 3D terrain…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
          <div className="max-w-sm text-sm text-white space-y-2">
            <p className="font-semibold">3D terrain isn't available yet</p>
            <p className="text-white/80">{errorText}</p>
            <p className="text-white/60 text-xs">
              Tap Map or Sat to return to the flat map.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
