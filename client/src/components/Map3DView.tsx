/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";

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

export interface FlyPin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** CSS colour for the pin. */
  colour: string;
}

interface Map3DViewProps {
  center: { lat: number; lng: number };
  /** Camera distance from the centre, metres. */
  range: number;
  pins: FlyPin[];
  onPinClick: (id: string) => void;
  /** Reports the camera's centre as it moves, so leaving 3D can put the flat
   * map where the officer ended up. */
  onCenterChange: (center: { lat: number; lng: number }) => void;
  className?: string;
}

export function Map3DView({
  center,
  range,
  pins,
  onPinClick,
  onCenterChange,
  className,
}: Map3DViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorText, setErrorText] = useState("");
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  // Latest props for the one-time setup below (re-running it would restart
  // the camera, so pins/center are read once at open — close and reopen
  // Fly to refresh them).
  const initialRef = useRef({ center, range, pins });

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
          tilt: 65,
          heading: 0,
          mode: lib.MapMode?.HYBRID ?? "HYBRID",
        }) as HTMLElement & { center?: any };
        map3d = el;
        el.style.cssText = "display:block;width:100%;height:100%;";
        hostRef.current?.appendChild(el);

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

        // Pins (when this version of the library has 3D markers).
        const Marker = lib.Marker3DInteractiveElement ?? lib.Marker3DElement;
        const PinElement = (window.google.maps as any).marker?.PinElement;
        if (Marker) {
          for (const p of init.pins) {
            try {
              const marker = new Marker({
                position: { lat: p.lat, lng: p.lng, altitude: 0 },
                altitudeMode: "RELATIVE_TO_GROUND",
                extruded: true,
                label: p.label,
              }) as HTMLElement;
              if (PinElement) {
                const pin = new PinElement({
                  background: p.colour,
                  borderColor: "#ffffff",
                  glyphColor: "#ffffff",
                  scale: 1.2,
                });
                marker.append(pin.element ?? pin);
              }
              const onClick = () => onPinClickRef.current(p.id);
              marker.addEventListener("gmp-click", onClick);
              el.append(marker);
            } catch {
              // One pin failing shouldn't lose the rest.
            }
          }
        }
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

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={hostRef} className="absolute inset-0 bg-black" />
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
