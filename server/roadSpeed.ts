// The posted speed limit of the road nearest a point. Used by the Map page's
// Target Predictor to pick the kind of area a target was last seen in and how
// fast he can travel there — a lookup of a map fact, not a prediction.
//
// Source, in order:
//   1. the app's own copy of Main Roads Western Australia's Legal Speed Limits
//      (server/speedZoneData.ts) — no outside call, the same answer every time,
//      nothing about where a target was seen leaves the server;
//   2. only when that file is absent AND ROAD_SPEED_GOOGLE=on, Google's Roads
//      API (nearestRoads → speedLimits). It is off by default: Google restricts
//      Speed Limits to accounts with its Asset Tracking licence and refused the
//      owner's project ("Speed limits are not available for this project").
// Anything that goes wrong (no data, no road nearby, no sign on record, Google
// refusing) comes back as a reason and the predictor falls back to the
// officer's own choice; nothing is ever guessed here.
import { ENV } from "./_core/env";
import { makeRequest } from "./_core/map";
import { getSpeedZones } from "./speedZoneData";

export type RoadSpeed =
  | {
      ok: true;
      kph: number;
      /** "posted" = a sign; "default" = no sign, the legal default for the
       * built-up Metropolitan region; "google" = Google's Roads API. */
      source: "posted" | "default" | "google";
      /** The road the limit belongs to (the nearest one to the point). */
      road?: string;
      /** When the speed-zone data was built, YYYY-MM-DD. */
      dataDate?: string;
    }
  | {
      ok: false;
      why:
        | "no-road"
        | "no-limit"
        | "refused"
        | "unavailable"
        | "no-data"
        | "default-unknown";
      /** The road found, when there is one (default-unknown). */
      road?: string;
      dataDate?: string;
      /** Google's own words for a refusal or failure, so the officer (or the
       * owner) can tell a licence problem from a key setting. Never contains
       * the key. */
      detail?: string;
    };

const CACHE_MS = 6 * 60 * 60 * 1000;
const ERROR_CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: RoadSpeed }>();

/** About 11 m: the same stretch of road gives the same answer. */
const keyOf = (lat: number, lng: number) =>
  `${lat.toFixed(4)},${lng.toFixed(4)}`;

class RoadsHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function roadsRequest<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  if (!ENV.googleMapsApiKey) {
    // Through the platform's maps proxy, as the other server-side lookups do.
    try {
      return await makeRequest<T>(path, params);
    } catch (e) {
      const m = /\((\d{3}) /.exec(String((e as Error).message));
      throw new RoadsHttpError(m ? Number(m[1]) : 0, String(e));
    }
  }
  const url = new URL(`https://roads.googleapis.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", ENV.googleMapsApiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new RoadsHttpError(res.status, await res.text());
  return (await res.json()) as T;
}

export async function lookupRoadSpeed(
  lat: number,
  lng: number,
  now: number = Date.now()
): Promise<RoadSpeed> {
  const zones = getSpeedZones(now);
  if (zones) {
    const dataDate = zones.builtAt.toISOString().slice(0, 10);
    const r = zones.nearest(lat, lng);
    if (!r) return { ok: false, why: "no-road", dataDate };
    if (r.kph === null)
      // No sign, outside the Metropolitan region: 50 in a town, 110 in the
      // bush, and the file cannot say which — so no number.
      return { ok: false, why: "default-unknown", road: r.name, dataDate };
    return {
      ok: true,
      kph: r.kph,
      source: r.kind === "posted" ? "posted" : "default",
      road: r.name,
      dataDate,
    };
  }
  if (process.env.ROAD_SPEED_GOOGLE !== "on")
    return { ok: false, why: "no-data" };
  const key = keyOf(lat, lng);
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.value.ok ? CACHE_MS : ERROR_CACHE_MS))
    return hit.value;
  const value = await lookup(lat, lng);
  // Only answers about the road itself are kept for long; an outage is not.
  cache.set(key, { at: now, value });
  return value;
}

/** The message inside a Google error body, cut short, with any key removed. */
function googleMessage(body: string): string {
  let text = body;
  try {
    const j = JSON.parse(body);
    text = j?.error?.message ?? j?.error_message ?? body;
  } catch {
    /* not JSON: use it as it is */
  }
  return String(text)
    .replace(/key=[A-Za-z0-9_-]+/g, "key=…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function lookup(lat: number, lng: number): Promise<RoadSpeed> {
  try {
    const near = await roadsRequest<{
      snappedPoints?: { placeId: string }[];
    }>("/v1/nearestRoads", { points: `${lat},${lng}` });
    const placeId = near.snappedPoints?.[0]?.placeId;
    if (!placeId) return { ok: false, why: "no-road" };
    const limits = await roadsRequest<{
      speedLimits?: { placeId: string; speedLimit: number; units: string }[];
    }>("/v1/speedLimits", { placeId, units: "KPH" });
    const found = limits.speedLimits?.find(s => s.placeId === placeId);
    if (!found || !(found.speedLimit > 0))
      return { ok: false, why: "no-limit" };
    return {
      ok: true,
      source: "google",
      kph:
        found.units === "MPH"
          ? Math.round(found.speedLimit * 1.609344)
          : Math.round(found.speedLimit),
    };
  } catch (e) {
    if (e instanceof RoadsHttpError && (e.status === 403 || e.status === 401))
      return { ok: false, why: "refused", detail: googleMessage(e.message) };
    return {
      ok: false,
      why: "unavailable",
      detail: googleMessage(String((e as Error)?.message ?? e)),
    };
  }
}
