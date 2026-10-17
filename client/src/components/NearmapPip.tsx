import { useEffect, useRef, useState } from "react";
import { NearmapAgeLabel } from "@/components/NearmapAgeLabel";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { getLastFlyCamera } from "@/components/Map3DView";
import { zoomForRange } from "@shared/splitView";
import { nearmapSpot } from "@shared/nearmapAge";

/** The Nearmap tiles, through our own proxy (the key stays on the server) —
 * the same layer the flat map's NM button adds. */
export function createNearmapLayer(): google.maps.ImageMapType {
  return new google.maps.ImageMapType({
    getTileUrl: (coord, zoom) => {
      if (coord.x < 0 || coord.y < 0) return null;
      return `/api/nearmap/tile?x=${coord.x}&y=${coord.y}&z=${zoom}`;
    },
    tileSize: new google.maps.Size(256, 256),
    name: "Nearmap",
    maxZoom: 21,
    minZoom: 0,
  });
}

/**
 * The aerial picture inside the small window: a flat, top-down map with
 * Nearmap on, kept looking at the same place as the 3D Fly camera. It reads
 * the camera Map3DView already remembers (`getLastFlyCamera`, updated on every
 * move) a few times a second and only moves when the camera has — so a pan or
 * zoom you do in this window stays until Fly moves again. The Follow button in
 * the window's title bar (`follow`, on by default) starts and stops that; turning
 * it back on snaps the window to where Fly is looking. A strip along the bottom
 * says when the photos at the window's centre were taken (NearmapAgeLabel).
 *
 * Built inside an effect, never at module scope (see divIconOverlay.ts for why).
 */
export function NearmapPip({
  initial,
  follow,
}: {
  /** Where to start if Fly has not reported a camera yet. */
  initial: { lat: number; lng: number; range: number };
  /** Keep looking where the 3D camera looks (the Follow button). */
  follow: boolean;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initial);
  const followRef = useRef(follow);
  followRef.current = follow;
  // Set by the map effect; called with `true` to move to Fly's camera now.
  const syncRef = useRef<((force: boolean) => void) | null>(null);
  // Where this window is looking (to the nearest ~500 m), for the date strip.
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null>(
    null
  );

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (cancelled || !window.google?.maps) return;
      const cam = getLastFlyCamera();
      const start = cam
        ? { lat: cam.center.lat, lng: cam.center.lng, range: cam.range }
        : initialRef.current;
      const map = new google.maps.Map(el, {
        center: { lat: start.lat, lng: start.lng },
        zoom: zoomForRange(start.range, start.lat, el.clientWidth || 300),
        mapTypeId: "satellite",
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        keyboardShortcuts: false,
      });
      map.overlayMapTypes.push(createNearmapLayer());

      let last = { lat: start.lat, lng: start.lng, range: start.range };
      const followFly = (force: boolean) => {
        if (!followRef.current) return;
        const c = getLastFlyCamera();
        if (!c) return;
        const moved =
          Math.abs(c.center.lat - last.lat) > 1e-6 ||
          Math.abs(c.center.lng - last.lng) > 1e-6 ||
          Math.abs(c.range - last.range) > 1;
        if (!moved && !force) return;
        last = { lat: c.center.lat, lng: c.center.lng, range: c.range };
        map.setCenter({ lat: c.center.lat, lng: c.center.lng });
        map.setZoom(zoomForRange(c.range, c.center.lat, el.clientWidth || 300));
      };
      syncRef.current = followFly;
      timer = setInterval(() => followFly(false), 400);
      // Report where the window is looking once it settles (its own pan too).
      const reportCentre = () => {
        const c = map.getCenter();
        if (c) setCentre(nearmapSpot(c.lat(), c.lng()));
      };
      map.addListener("idle", reportCentre);
      reportCentre();

      // The window was resized: let the map pick up its new size, keeping its centre.
      ro = new ResizeObserver(() => {
        const c = map.getCenter();
        google.maps.event.trigger(map, "resize");
        if (c) map.setCenter(c);
      });
      ro.observe(el);
    })();
    return () => {
      cancelled = true;
      syncRef.current = null;
      if (timer) clearInterval(timer);
      ro?.disconnect();
    };
  }, []);

  // Follow turned back on: jump straight to where Fly is looking.
  useEffect(() => {
    if (follow) syncRef.current?.(true);
  }, [follow]);

  return (
    <div className="absolute inset-0">
      <div ref={divRef} className="absolute inset-0" />
      <NearmapAgeLabel centre={centre} variant="window" />
    </div>
  );
}
