import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: { googleMapsApiKey: "test-key", forgeApiUrl: "", forgeApiKey: "" },
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SpeedZoneBuilder } from "../shared/speedZones";
import { lookupRoadSpeed } from "./roadSpeed";
import { resetSpeedZonesForTests } from "./speedZoneData";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let calls: string[] = [];
function stubFetch(handler: (url: URL) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => {
      calls.push(u);
      return handler(new URL(u));
    })
  );
}

let n = 0;
// A different spot each time, so the answer cache never carries over.
const spot = () => ({ lat: -31 - ++n * 0.01, lng: 115.8 });

beforeEach(() => {
  vi.unstubAllGlobals();
  resetSpeedZonesForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ROAD_SPEED_GOOGLE;
  delete process.env.SPEED_ZONES_FILE;
  resetSpeedZonesForTests();
});

describe("lookupRoadSpeed through Google (only when switched on and no data file)", () => {
  beforeEach(() => {
    process.env.ROAD_SPEED_GOOGLE = "on";
    process.env.SPEED_ZONES_FILE = path.join(
      os.tmpdir(),
      "no-such-speed-zones.bin"
    );
  });

  it("finds the nearest road, then its posted limit, on the Roads API host", async () => {
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "road1" }] })
        : json({
            speedLimits: [{ placeId: "road1", speedLimit: 80, units: "KPH" }],
          })
    );
    const { lat, lng } = spot();
    expect(await lookupRoadSpeed(lat, lng)).toEqual({
      ok: true,
      kph: 80,
      source: "google",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("https://roads.googleapis.com/v1/nearestRoads");
    expect(calls[0]).toContain(`points=${lat}%2C${lng}`);
    expect(calls[1]).toContain("/v1/speedLimits");
    expect(calls[1]).toContain("placeId=road1");
    expect(calls[1]).toContain("units=KPH");
    expect(calls[1]).toContain("key=test-key");
  });

  it("answers the same stretch of road from memory", async () => {
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "r" }] })
        : json({
            speedLimits: [{ placeId: "r", speedLimit: 60, units: "KPH" }],
          })
    );
    const { lat, lng } = spot();
    await lookupRoadSpeed(lat, lng);
    const before = calls.length;
    expect(await lookupRoadSpeed(lat + 0.00001, lng)).toEqual({
      ok: true,
      kph: 60,
      source: "google",
    });
    expect(calls.length).toBe(before);
  });

  it("converts miles per hour", async () => {
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "m" }] })
        : json({
            speedLimits: [{ placeId: "m", speedLimit: 50, units: "MPH" }],
          })
    );
    const { lat, lng } = spot();
    expect(await lookupRoadSpeed(lat, lng)).toEqual({
      ok: true,
      kph: 80,
      source: "google",
    });
  });

  it("says so when there is no road, or no limit on record", async () => {
    stubFetch(() => json({}));
    const a = spot();
    expect(await lookupRoadSpeed(a.lat, a.lng)).toEqual({
      ok: false,
      why: "no-road",
    });
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "x" }] })
        : json({})
    );
    const b = spot();
    expect(await lookupRoadSpeed(b.lat, b.lng)).toEqual({
      ok: false,
      why: "no-limit",
    });
  });

  it("says refused when the key is not allowed to use Speed Limits", async () => {
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "x" }] })
        : json({ error: { status: "PERMISSION_DENIED" } }, 403)
    );
    const { lat, lng } = spot();
    const r = await lookupRoadSpeed(lat, lng);
    expect(r).toMatchObject({ ok: false, why: "refused" });
  });

  it("passes on Google's own message, with the key removed", async () => {
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "x" }] })
        : json(
            {
              error: {
                message:
                  "Speed limits requires the Asset Tracking licence. See https://x/?key=AIzaSyABC-def_123",
              },
            },
            403
          )
    );
    const { lat, lng } = spot();
    const r = await lookupRoadSpeed(lat, lng);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toContain("Asset Tracking licence");
      expect(r.detail).not.toContain("AIzaSy");
    }
  });

  it("says unavailable when Google cannot be reached, and never throws", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });
    const { lat, lng } = spot();
    expect(await lookupRoadSpeed(lat, lng)).toMatchObject({
      ok: false,
      why: "unavailable",
    });
  });

  it("retries a failed lookup after a few minutes, not straight away", async () => {
    stubFetch(() => {
      throw new Error("down");
    });
    const { lat, lng } = spot();
    const t0 = 1_000_000;
    await lookupRoadSpeed(lat, lng, t0);
    const after = calls.length;
    await lookupRoadSpeed(lat, lng, t0 + 60_000);
    expect(calls.length).toBe(after);
    await lookupRoadSpeed(lat, lng, t0 + 6 * 60_000);
    expect(calls.length).toBeGreaterThan(after);
  });
});

describe("lookupRoadSpeed from the app's own speed-zone data", () => {
  const DEFAULT =
    "50km/h applies in built up areas or 110km/h outside built up areas";
  const road = (name: string, limit: string, region: string, c: number[][]) =>
    JSON.stringify({
      type: "Feature",
      properties: {
        COMMON_USAGE_NAME: name,
        RA_NAME: region,
        SPEED_LIMIT: limit,
      },
      geometry: { type: "LineString", coordinates: c },
    }) + ",";
  let file = "";
  beforeEach(() => {
    const b = new SpeedZoneBuilder();
    b.addLine(
      road("Great Eastern Hwy", "80km/h", "Metropolitan", [
        [115.9, -31.95],
        [115.91, -31.95],
      ])
    );
    b.addLine(
      road("Smith St", DEFAULT, "Metropolitan", [
        [115.905, -31.96],
        [115.905, -31.955],
      ])
    );
    b.addLine(
      road("Hacket Rd", DEFAULT, "South West", [
        [115.89, -33.08],
        [115.9, -33.08],
      ])
    );
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spz-")), "z.bin");
    fs.writeFileSync(file, b.finish());
    process.env.SPEED_ZONES_FILE = file;
  });

  it("gives a posted limit, with the road and no call to Google", async () => {
    stubFetch(() => {
      throw new Error("must not be called");
    });
    const r = await lookupRoadSpeed(-31.95, 115.905);
    expect(r).toMatchObject({
      ok: true,
      kph: 80,
      source: "posted",
      road: "Great Eastern Hwy",
    });
    expect(calls).toHaveLength(0);
  });

  it("gives 50 for the default in the Metropolitan region, labelled as the default", async () => {
    expect(await lookupRoadSpeed(-31.9575, 115.905)).toMatchObject({
      ok: true,
      kph: 50,
      source: "default",
      road: "Smith St",
    });
  });

  it("gives no number for the default outside it, but names the road", async () => {
    expect(await lookupRoadSpeed(-33.08, 115.895)).toEqual(
      expect.objectContaining({
        ok: false,
        why: "default-unknown",
        road: "Hacket Rd",
      })
    );
  });

  it("says no road when nothing is within the snap distance", async () => {
    expect(await lookupRoadSpeed(-31.9, 115.9)).toMatchObject({
      ok: false,
      why: "no-road",
    });
  });

  it("carries the date the data was built", async () => {
    const r = await lookupRoadSpeed(-31.95, 115.905);
    expect(r.ok && r.dataDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("picks up a refreshed file without a restart", async () => {
    expect(await lookupRoadSpeed(-31.95, 115.905)).toMatchObject({ kph: 80 });
    const b = new SpeedZoneBuilder();
    b.addLine(
      road("Great Eastern Hwy", "60km/h", "Metropolitan", [
        [115.9, -31.95],
        [115.91, -31.95],
      ])
    );
    fs.writeFileSync(file, b.finish());
    // Within a minute the old copy is still used; after that the new one is.
    expect(
      await lookupRoadSpeed(-31.95, 115.905, Date.now() + 5_000)
    ).toMatchObject({ kph: 80 });
    expect(
      await lookupRoadSpeed(-31.95, 115.905, Date.now() + 120_000)
    ).toMatchObject({ kph: 60 });
  });
});

describe("lookupRoadSpeed with no data and Google off (the default)", () => {
  it("says there is no data and calls nobody", async () => {
    process.env.SPEED_ZONES_FILE = path.join(
      os.tmpdir(),
      "no-such-speed-zones.bin"
    );
    stubFetch(() => {
      throw new Error("must not be called");
    });
    expect(await lookupRoadSpeed(-31.95, 115.9)).toEqual({
      ok: false,
      why: "no-data",
    });
    expect(calls).toHaveLength(0);
  });

  it("a damaged file is treated as no data, not a crash", async () => {
    const f = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "spz-")),
      "bad.bin"
    );
    fs.writeFileSync(f, "not a speed zone file at all, not even close to one");
    process.env.SPEED_ZONES_FILE = f;
    expect(await lookupRoadSpeed(-31.95, 115.9)).toEqual({
      ok: false,
      why: "no-data",
    });
  });
});
