import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { getLastFlyCamera } from "@/components/Map3DView";
import { zoomForRange } from "@shared/splitView";

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
 * zoom you do in this window stays until Fly moves again.
 *
 * Built inside an effect, never at module scope (see divIconOverlay.ts for why).
 */
export function NearmapPip({
  initial,
}: {
  /** Where to start if Fly has not reported a camera yet. */
  initial: { lat: number; lng: number; range: number };
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initial);

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
      const follow = () => {
        const c = getLastFlyCamera();
        if (!c) return;
        const moved =
          Math.abs(c.center.lat - last.lat) > 1e-6 ||
          Math.abs(c.center.lng - last.lng) > 1e-6 ||
          Math.abs(c.range - last.range) > 1;
        if (!moved) return;
        last = { lat: c.center.lat, lng: c.center.lng, range: c.range };
        map.setCenter({ lat: c.center.lat, lng: c.center.lng });
        map.setZoom(zoomForRange(c.range, c.center.lat, el.clientWidth || 300));
      };
      timer = setInterval(follow, 400);

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
      if (timer) clearInterval(timer);
      ro?.disconnect();
    };
  }, []);

  return <div ref={divRef} className="absolute inset-0" />;
}
