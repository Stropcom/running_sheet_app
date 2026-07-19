/**
 * AddressAutocompleteInput
 *
 * A drop-in replacement for <Input> that adds Google Places autocomplete.
 * When the user selects a suggestion the address is automatically converted
 * to RS format via convertGoogleAddresses() before being passed to onChange.
 *
 * Location bias priority:
 *   1. Explicit locationBias prop (e.g. map centre when used on the map page)
 *   2. Browser Geolocation API (user's current GPS position)
 *   3. Perth, WA hardcoded fallback (-31.9505, 115.8605)
 *
 * Props:
 *   value          – controlled value
 *   onChange       – called with the new string (plain text or RS-formatted)
 *   locationBias   – optional explicit { lat, lng } override
 *   placeholder    – input placeholder text
 *   className      – extra classes forwarded to the wrapper div
 *   inputClassName – extra classes forwarded to the <input> element
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { MapPin } from "lucide-react";
import { convertGoogleAddresses, extractShortAddress } from "@/lib/addressFormat";

// Perth CBD — used as fallback when no GPS or explicit bias is available
const PERTH_FALLBACK = { lat: -31.9505, lng: 115.8605 };

// ── Google Maps loader (shared with Map.tsx) ──────────────────────────────────
// We need the Maps script on pages that don't have a MapView (e.g. OperationDetail,
// TargetRegistry). We load it lazily here so the autocomplete service is always
// available regardless of which page the component is rendered on.
let _mapsLoadPromise: Promise<void> | null = null;

function ensureMapsLoaded(): Promise<void> {
  // Already loaded
  if (typeof window !== "undefined" && window.google?.maps?.places) {
    return Promise.resolve();
  }
  // Already loading
  if (_mapsLoadPromise) return _mapsLoadPromise;

  _mapsLoadPromise = new Promise<void>((resolve, reject) => {
    // If a Maps script tag already exists (loaded by Map.tsx), wait for it
    const existing = document.querySelector('script[src*="maps/api/js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }

    const apiKey = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
    const forgeBase =
      import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
      "https://forge.butterfly-effect.dev";
    const src = `${forgeBase}/v1/maps/proxy/maps/api/js?key=${apiKey}&v=weekly&libraries=marker,places,geocoding,geometry,routes`;

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return _mapsLoadPromise;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  /** Called with the extracted short-form address when a suggestion is selected (for auto-filling HB) */
  onShortAddress?: (shortVal: string) => void;
  locationBias?: { lat: number; lng: number } | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onShortAddress,
  locationBias,
  placeholder = "Search address…",
  className = "",
  inputClassName = "",
}: Props) {
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Cached GPS position from browser Geolocation (refreshed once per mount)
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Lazy-init the AutocompleteService once Google Maps is loaded
  const getService = useCallback(() => {
    if (!serviceRef.current && typeof google !== "undefined") {
      serviceRef.current = new google.maps.places.AutocompleteService();
    }
    return serviceRef.current;
  }, []);

  // Ensure Google Maps API is loaded (needed on pages without a MapView)
  useEffect(() => {
    ensureMapsLoaded().catch(() => { /* ignore load errors silently */ });
  }, []);

  // Request GPS position once on mount for use as bias centre
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => { /* silently ignore — will fall back to Perth */ },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resolve the best available bias centre:
  //   1. Explicit prop  2. GPS position  3. Perth fallback
  const getBiasCentre = useCallback((): { lat: number; lng: number } => {
    if (locationBias) return locationBias;
    if (gpsRef.current) return gpsRef.current;
    return PERTH_FALLBACK;
  }, [locationBias]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const svc = getService();
      if (!svc) return;

      const centre = getBiasCentre();
      const request: google.maps.places.AutocompletionRequest = {
        input: val,
        componentRestrictions: { country: "au" },
        types: ["address"],
        locationBias: new google.maps.Circle({
          center: centre,
          radius: 50000, // 50 km bias
        }),
      };

      svc.getPlacePredictions(request, (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions);
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      });
    }, 300);
  };

  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    setSuggestions([]);
    setOpen(false);

    // Geocode to get full structured address, then convert to RS format
    if (typeof google === "undefined") {
      const rsFormatted = convertGoogleAddresses(prediction.description);
      onChange(rsFormatted);
      if (onShortAddress) onShortAddress(extractShortAddress(rsFormatted));
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const formatted = results[0].formatted_address;
        const rsFormatted = convertGoogleAddresses(formatted);
        onChange(rsFormatted);
        if (onShortAddress) onShortAddress(extractShortAddress(rsFormatted));
      } else {
        // Fallback to description if geocode fails
        const rsFormatted = convertGoogleAddresses(prediction.description);
        onChange(rsFormatted);
        if (onShortAddress) onShortAddress(extractShortAddress(rsFormatted));
      }
    });
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setSuggestions([]); setOpen(false); }
        }}
        placeholder={placeholder}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${inputClassName}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {open && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
          style={{ maxHeight: "240px", overflowY: "auto" }}
        >
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground border-b border-border/50 last:border-0 flex items-start gap-2 transition-colors"
              onMouseDown={(e) => {
                // Use mousedown so it fires before the input's blur
                e.preventDefault();
                handleSelect(s);
              }}
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="leading-snug">{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
