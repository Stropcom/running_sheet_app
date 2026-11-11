// Geocoded-address cache, keyed by the exact query string sent to
// google.maps.Geocoder — persisted across sessions since a street
// address's lat/lng is effectively permanent, so there is never a reason
// to re-resolve one we've already seen. Without this, renderLocations()
// re-geocodes every intel location from scratch on every poll (every
// location, every ~poll-interval), which is a live network round trip per
// pin even though almost none of them have actually changed — the
// dominant cost of opening the map on any operation with more than a
// handful of locations. Capped so a years-old install doesn't grow this
// unboundedly; oldest entries (by insertion order) are evicted first.
export const GEOCODE_CACHE_KEY = "runlog_geocode_cache_v1";

export const GEOCODE_CACHE_MAX_ENTRIES = 5000;

/** The address string the Geocoder is asked for — same rule the pins use. */
export function geocodeQueryForLabel(label: string): string {
  return label.includes(",") || /\d/.test(label)
    ? `${label}, Western Australia, Australia`
    : `${label}, Perth, Western Australia, Australia`;
}

// Trims oldest entries (Map insertion order) down to the cap, then writes
// the cache to localStorage. Takes the Map directly rather than being a
// hook so it can be called from inside the geocode callback without
// pulling it into a useCallback dependency array.
export function persistGeocodeCache(
  cache: Map<string, google.maps.LatLngLiteral>
) {
  while (cache.size > GEOCODE_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  try {
    localStorage.setItem(
      GEOCODE_CACHE_KEY,
      JSON.stringify(Object.fromEntries(cache))
    );
  } catch {
    /* localStorage quota/access can throw — the in-memory cache still
       speeds up the rest of this session even if it doesn't persist */
  }
}
