import { useEffect, useRef, useState } from "react";

const MOVE_THRESHOLD_METERS = 40;

function headingToCompassLabel(deg: number): string {
  const dirs = [
    "North",
    "Northeast",
    "East",
    "Southeast",
    "South",
    "Southwest",
    "West",
    "Northwest",
  ];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const dLat = (b.lat - a.lat) * mPerDegLat;
  const dLng = (b.lng - a.lng) * mPerDegLng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Bottom-of-map bar showing the officer's own current street + direction of
// travel. Reuses the same lat/lng/heading already tracked for the live
// team-member pins (see IntelligenceMapping.tsx's own live-location entry)
// — this just displays it as text instead of rotating a marker. Only
// re-reverse-geocodes when the position has moved far enough to plausibly
// be on a different street, not on every GPS tick, so it doesn't hammer the
// Geocoding API for no benefit.
export function StreetHeadingBar({
  lat,
  lng,
  heading,
}: {
  lat: number;
  lng: number;
  heading: number | null;
}) {
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const lastGeocodedRef = useRef<{ lat: number; lng: number } | null>(null);
  const [streetName, setStreetName] = useState<string | null>(null);

  useEffect(() => {
    if (!window.google?.maps) return;
    if (!geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
    const last = lastGeocodedRef.current;
    if (last && metersBetween(last, { lat, lng }) < MOVE_THRESHOLD_METERS) {
      return;
    }
    lastGeocodedRef.current = { lat, lng };
    geocoderRef.current.geocode(
      { location: { lat, lng } },
      (results, status) => {
        if (status !== "OK" || !results || !results[0]) return;
        const route = results[0].address_components?.find(c =>
          c.types.includes("route")
        );
        setStreetName(route?.long_name ?? results[0].formatted_address ?? null);
      }
    );
  }, [lat, lng]);

  if (!streetName) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/95 backdrop-blur-sm border border-border shadow-lg max-w-[calc(100%-24px)] pointer-events-none">
      <span className="text-xs font-bold text-foreground truncate">
        {streetName}
      </span>
      {heading != null && (
        <>
          <span className="text-muted-foreground/50 font-bold shrink-0">–</span>
          <span className="text-xs font-bold text-sky-500 whitespace-nowrap shrink-0">
            {headingToCompassLabel(heading)}
          </span>
        </>
      )}
    </div>
  );
}
