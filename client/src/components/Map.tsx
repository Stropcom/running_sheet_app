/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { loadGoogleMaps } from "@/lib/googleMaps";

// Two real Map IDs (Google Cloud Console → Maps Platform → Map Management,
// on the same project the app's Maps API key belongs to), replacing
// "DEMO_MAP_ID" — Google's own testing-only placeholder. Neither Map ID is
// secret (both are visible in any network request the browser makes), so
// they're hardcoded here rather than requiring an env var/redeploy just to
// pick one.
//
// Both exist side by side so getMapRenderPreference() can pick between them
// (default vector — see below). Originally added to chase a marker/label
// zoom-drift bug (AdvancedMarkerElement positioning imprecision, worse
// zoomed out) that turned out to be present under both IDs — i.e. inherent
// to AdvancedMarkerElement itself, not a rendering-mode/Map-ID issue — and
// is now resolved via DivIconOverlay (see CLAUDE.md), so both IDs are kept
// for the actual vector-vs-raster choice (3D tilt, rotation, etc. are
// vector-only), not for bug-chasing.
// Circle/Rectangle/Polygon/Polyline overlays (map shapes) render through a
// different, older system unaffected either way, which is why only
// markers/labels ever visibly drifted while zooming and shapes never did.
const MAP_ID_VECTOR = "1c8d997128c67d9fc1a04b7e"; // "Runlog map" — vector
const MAP_ID_RASTER = "1c8d997128c67d9fa74cfa85"; // "Runlog Map" — raster, guaranteed no vector-drift but no vector-only features (real cloud dark-mode styling, smoother fractional zoom)

// Vector vs raster was previously a live user-facing toggle (to compare the
// two while chasing the AdvancedMarkerElement zoom-drift bug — see the
// "Resolved" note on that in CLAUDE.md, fixed via DivIconOverlay regardless
// of rendering mode). Default is vector: 3D tilt, North-Up, and manual
// rotate-gesture are vector-only features and the deliberate choice is to
// have every officer get them by default, not just whoever happens to have
// an old localStorage value set. Not fully hardcoded, though: a
// ?mapRender=vector or ?mapRender=raster URL param (persisted per-browser
// via localStorage once set) is honoured for a quick one-off check without
// a code change, and an explicit VITE_GOOGLE_MAPS_MAP_ID env var, if ever
// set, overrides both entirely (e.g. to pin a specific ID fleet-wide).
const MAP_RENDER_STORAGE_KEY = "runlog_map_render_pref";
export type MapRenderPreference = "vector" | "raster";

export function getMapRenderPreference(): MapRenderPreference {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(
      "mapRender"
    );
    if (fromQuery === "vector" || fromQuery === "raster") {
      localStorage.setItem(MAP_RENDER_STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    const stored = localStorage.getItem(MAP_RENDER_STORAGE_KEY);
    if (stored === "vector" || stored === "raster") return stored;
  } catch {
    /* localStorage/URL access can throw in some embedded contexts — fall
       back to the default below rather than breaking map load over it. */
  }
  return "vector";
}

function resolveMapId(): string {
  const pinned = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
  if (pinned) return pinned;
  return getMapRenderPreference() === "raster" ? MAP_ID_RASTER : MAP_ID_VECTOR;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  initialMapTypeId?: string;
  // Hides Google's own native Map/Satellite control. Used by pages that
  // render their own compact toggle instead — the native control is fixed
  // at TOP_RIGHT with a "Satellite" label neither of which can be resized,
  // repositioned, or relabelled from here, so a page with other floating UI
  // near that corner (e.g. a search bar) can collide with it on narrow
  // screens no matter how much clearance is reserved for it.
  hideMapTypeControl?: boolean;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  initialMapTypeId,
  hideMapTypeControl = false,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    await loadGoogleMaps();
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapId: resolveMapId(),
      mapTypeId: initialMapTypeId ?? "roadmap",
      mapTypeControl: !hideMapTypeControl,
      mapTypeControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      fullscreenControl: false,
      zoomControl: false,
      streetViewControl: false,
      gestureHandling: "greedy", // one-finger pan on mobile
    });
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div
      ref={mapContainer}
      className={cn("w-full", className || "h-[500px]")}
    />
  );
}
