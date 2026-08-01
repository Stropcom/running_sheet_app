/**
 * Single shared Google Maps script loader for the whole app.
 *
 * Previously Map.tsx and AddressAutocompleteInput.tsx each loaded the script
 * independently — Map.tsx injected a fresh <script> on every mount and
 * removed it once loaded, while AddressAutocompleteInput cached its own
 * promise so pages without a map (Target Registry, Operation profile) could
 * still get autocomplete. That promise cache never reset on failure: if the
 * load ever failed or raced with a script tag that had already fired its
 * `load` event before the listener attached, autocomplete silently died for
 * the rest of that page session with no way to recover — which is why it
 * "only worked if the map had already loaded" and sometimes not even then.
 *
 * This loader is the single source of truth: it injects the script at most
 * once, every caller shares the same promise, and a failed load clears the
 * cache so the next call retries instead of staying stuck.
 */

declare global {
  interface Window {
    google?: typeof google;
  }
}

const DIRECT_GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;
const MAPS_SCRIPT_SRC = DIRECT_GOOGLE_MAPS_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${DIRECT_GOOGLE_MAPS_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,routes`
  : `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,routes`;

let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No window"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MAPS_SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.google?.maps?.places) resolve();
      else
        reject(
          new Error("Google Maps script loaded but places library unavailable")
        );
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  // Let the next caller retry instead of being stuck on a dead promise.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
