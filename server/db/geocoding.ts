import { eq } from "drizzle-orm";
import { makeRequest, type GeocodingResult } from "../_core/map";
import {
  fullAddressForGeocode,
  fullDescriptionsByLabel,
} from "@shared/geocodeQuery";
import { intelligenceGeocodeCache } from "../../drizzle/schema";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import { extractEntitiesFromText } from "./intelligence";
import { getRowsBySheetId } from "./operations";

/** Cache-first geocoding for intel addresses — geocodes once via Google's
 * Geocoding API and persists the result, so re-opening the Heat Map doesn't
 * re-geocode the same addresses every time. */
export async function resolveLatLng(
  addressKey: string,
  rawAddress: string
): Promise<{ lat: number; lng: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const cached = await db
    .select({
      lat: intelligenceGeocodeCache.lat,
      lng: intelligenceGeocodeCache.lng,
    })
    .from(intelligenceGeocodeCache)
    .where(eq(intelligenceGeocodeCache.addressKey, addressKey))
    .limit(1);
  if (cached.length) return cached[0];

  try {
    const result = await makeRequest<GeocodingResult>(
      "/maps/api/geocode/json",
      { address: rawAddress + ", Western Australia, Australia", region: "au" }
    );
    if (result.status !== "OK" || !result.results.length) return null;
    const loc = result.results[0].geometry.location;
    await db
      .insert(intelligenceGeocodeCache)
      .values({ addressKey, lat: loc.lat, lng: loc.lng })
      .onDuplicateKeyUpdate({
        set: { lat: loc.lat, lng: loc.lng, resolvedAt: new Date() },
      });
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

/** Geocode a place the sheets name, preferring the fuller "<street>, SUBURB
 * STATE" the officer wrote before its bracket (same rule as the Location
 * profile) over the bare short form, which for a place name like "Terminal 4"
 * can resolve anywhere in the State. A fuller address is cached under its own
 * key, so a wrong position cached earlier for the bare label is never reused. */
export async function resolvePlaceLatLng(
  addressKey: string,
  label: string,
  fullDescriptions: readonly string[]
): Promise<{ lat: number; lng: number } | null> {
  const full = fullAddressForGeocode(fullDescriptions);
  if (!full) return resolveLatLng(addressKey, label);
  return resolveLatLng(normalizeEntityLabel(full).slice(0, 500), full);
}

/** Batch-geocode a list of raw address strings via the same cache-first
 * geocoder as the Heat Map, deduping repeats — used by the Supervisor
 * Summary export to plot its own Location column on a map page rather than
 * re-deriving addresses from row text. */
export async function geocodeAddressList(
  addresses: string[]
): Promise<{ address: string; lat: number; lng: number }[]> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of addresses) {
    const address = raw.trim();
    if (!address) continue;
    const key = normalizeEntityLabel(address);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }

  const results = await Promise.all(
    unique.map(async address => {
      const coords = await resolveLatLng(
        normalizeEntityLabel(address),
        address
      );
      if (!coords) return null;
      return { address, lat: coords.lat, lng: coords.lng };
    })
  );

  return results.filter(
    (r): r is { address: string; lat: number; lng: number } => r !== null
  );
}

/** The Supervisor Summary export's map: geocodes each Location the Summary
 * shows, but uses the fuller "<street>, SUBURB STATE" the officer wrote for it
 * on this sheet when there is one (same rule as the Heat Map and the Location
 * profile). A bare place name such as "Terminal 4, Terminal 4" would otherwise
 * be placed anywhere in the State. A location with no fuller form is geocoded
 * as written, as before. */
export async function geocodeSummaryAddresses(
  sheetId: number,
  addresses: string[]
): Promise<{ address: string; lat: number; lng: number }[]> {
  const rows = await getRowsBySheetId(sheetId);
  const entities = rows.flatMap(r =>
    r.observation ? extractEntitiesFromText(r.observation) : []
  );
  const fullByLabel = fullDescriptionsByLabel(entities, normalizeEntityLabel);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of addresses) {
    const address = raw.trim();
    const key = normalizeEntityLabel(address);
    if (!address || seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }

  const results = await Promise.all(
    unique.map(async address => {
      const key = normalizeEntityLabel(address);
      const coords = await resolvePlaceLatLng(
        key,
        address,
        fullByLabel.get(key) ?? []
      );
      if (!coords) return null;
      return { address, lat: coords.lat, lng: coords.lng };
    })
  );
  return results.filter(
    (r): r is { address: string; lat: number; lng: number } => r !== null
  );
}

// ─── Pattern of Life ────────────────────────────────────────────────────────
// Time/location analysis for one target within one operation — reuses the
// same entity extraction, "qualifying mention" gating same-address
// visit-collapsing as the Heat Map above, plus the pure bucketing/interval
// functions in ./patternOfLife.ts, rather than re-deriving any of it.
