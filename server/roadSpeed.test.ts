import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: { googleMapsApiKey: "test-key", forgeApiUrl: "", forgeApiKey: "" },
}));

import { lookupRoadSpeed } from "./roadSpeed";

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

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("lookupRoadSpeed", () => {
  it("finds the nearest road, then its posted limit, on the Roads API host", async () => {
    stubFetch(url =>
      url.pathname === "/v1/nearestRoads"
        ? json({ snappedPoints: [{ placeId: "road1" }] })
        : json({
            speedLimits: [{ placeId: "road1", speedLimit: 80, units: "KPH" }],
          })
    );
    const { lat, lng } = spot();
    expect(await lookupRoadSpeed(lat, lng)).toEqual({ ok: true, kph: 80 });
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
    expect(await lookupRoadSpeed(lat, lng)).toEqual({ ok: true, kph: 80 });
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
