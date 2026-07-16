/**
 * AddressAutocompleteInput
 *
 * A drop-in replacement for <Input> that adds Google Places autocomplete.
 * When the user selects a suggestion the address is automatically converted
 * to RS format via convertGoogleAddresses() before being passed to onChange.
 *
 * Props:
 *   value          – controlled value
 *   onChange       – called with the new string (plain text or RS-formatted)
 *   locationBias   – optional { lat, lng } to bias suggestions towards a location
 *   placeholder    – input placeholder text
 *   className      – extra classes forwarded to the wrapper div
 *   inputClassName – extra classes forwarded to the <input> element
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { MapPin } from "lucide-react";
import { convertGoogleAddresses } from "@/lib/addressFormat";

interface Props {
  value: string;
  onChange: (val: string) => void;
  locationBias?: { lat: number; lng: number } | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function AddressAutocompleteInput({
  value,
  onChange,
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

  // Lazy-init the AutocompleteService once Google Maps is loaded
  const getService = useCallback(() => {
    if (!serviceRef.current && typeof google !== "undefined") {
      serviceRef.current = new google.maps.places.AutocompleteService();
    }
    return serviceRef.current;
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

      const request: google.maps.places.AutocompletionRequest = {
        input: val,
        componentRestrictions: { country: "au" },
        types: ["address"],
      };

      // Apply location bias if provided — biases results within ~50 km
      if (locationBias) {
        request.locationBias = new google.maps.Circle({
          center: locationBias,
          radius: 50000, // 50 km
        });
      }

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
      onChange(convertGoogleAddresses(prediction.description));
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const formatted = results[0].formatted_address;
        onChange(convertGoogleAddresses(formatted));
      } else {
        // Fallback to description if geocode fails
        onChange(convertGoogleAddresses(prediction.description));
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
