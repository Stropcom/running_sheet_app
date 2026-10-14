/// <reference types="@types/google.maps" />
/**
 * The Map page's heat map: a soft fade at each place, drawn in the map's own
 * overlay layer so it sits UNDER the pins and never takes a click. Colour is
 * the same cool → hot ramp as the Intelligence Heat Map
 * (lib/heatMapSection.ts); size is shared/heatMapLayout.ts, so a place keeps
 * a minimum on-screen size however far the map is zoomed out and settles to
 * its true area once zoomed in.
 *
 * `google.maps.OverlayView` only exists once the Maps script has loaded, so
 * the subclass is built here inside the effect, never at module scope (same
 * rule as lib/divIconOverlay.ts).
 */
import { useEffect } from "react";
import { heatFadeRadiusPx } from "@shared/heatMapLayout";
import { heatColourFor } from "@/lib/heatMapSection";

export interface MapHeatLocation {
  label: string;
  lat: number;
  lng: number;
  count: number;
}

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** The fade's CSS: strongest in the middle, thinning to nothing at the edge. */
export function fadeBackground(colour: string, strength: number): string {
  const s = Math.max(0, Math.min(1, strength));
  return `radial-gradient(circle closest-side, ${rgba(colour, Math.min(1, s * 1.25))} 0%, ${rgba(colour, s * 0.65)} 45%, ${rgba(colour, 0)} 100%)`;
}

export function MapHeatOverlay({
  map,
  locations,
  strength,
}: {
  map: google.maps.Map | null;
  locations: MapHeatLocation[];
  /** 0–1: how strong the colour is (1 − the Transparency slider). */
  strength: number;
}) {
  useEffect(() => {
    if (!map || !window.google?.maps || locations.length === 0) return;
    const maxCount = Math.max(1, ...locations.map(l => l.count));

    class FadeOverlay extends google.maps.OverlayView {
      private root: HTMLDivElement | null = null;
      private els: HTMLDivElement[] = [];

      onAdd() {
        const root = document.createElement("div");
        root.style.cssText =
          "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";
        this.els = locations.map(l => {
          const el = document.createElement("div");
          el.style.cssText = "position:absolute;pointer-events:none";
          el.style.background = fadeBackground(
            heatColourFor(l.count, maxCount),
            strength
          );
          root.appendChild(el);
          return el;
        });
        // overlayLayer sits under the marker pane, so every pin stays on top.
        this.getPanes()?.overlayLayer.appendChild(root);
        this.root = root;
      }

      draw() {
        const proj = this.getProjection();
        const zoom = map?.getZoom();
        if (!proj || zoom == null) return;
        locations.forEach((l, i) => {
          const pt = proj.fromLatLngToDivPixel(
            new google.maps.LatLng(l.lat, l.lng)
          );
          const el = this.els[i];
          if (!pt || !el) return;
          const r = heatFadeRadiusPx(l.count, maxCount, l.lat, zoom);
          el.style.width = `${2 * r}px`;
          el.style.height = `${2 * r}px`;
          el.style.left = `${pt.x - r}px`;
          el.style.top = `${pt.y - r}px`;
        });
      }

      onRemove() {
        this.root?.remove();
        this.root = null;
        this.els = [];
      }
    }

    const overlay = new FadeOverlay();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, locations, strength]);

  return null;
}
