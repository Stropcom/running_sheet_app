import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLocationUpdate,
  getNativeBackgroundLocation,
  readSelectedOperationIds,
  readSharingFlag,
} from "@/lib/nativeLocation";

describe("buildLocationUpdate", () => {
  it("maps a native fix to the map's updateUserLocation input", () => {
    expect(
      buildLocationUpdate(
        {
          latitude: -31.95,
          longitude: 115.86,
          accuracy: 6,
          speed: 1.4,
          bearing: 270,
        },
        "tab_abc",
        [3, 4]
      )
    ).toEqual({
      deviceId: "tab_abc",
      lat: -31.95,
      lng: 115.86,
      operationIds: [3, 4],
      sharingEnabled: true,
      speed: 1.4,
      heading: 270,
      accuracy: 6,
    });
  });

  it("sends null for speed, heading and accuracy the phone doesn't know", () => {
    const u = buildLocationUpdate(
      { latitude: 1, longitude: 2, speed: -1, bearing: null, accuracy: -1 },
      "d",
      []
    );
    expect(u.speed).toBeNull();
    expect(u.heading).toBeNull();
    expect(u.accuracy).toBeNull();
  });
});

describe("outside the iPhone/iPad app", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("there is no native plugin without a window or without the shell", () => {
    expect(getNativeBackgroundLocation()).toBeNull();
    vi.stubGlobal("window", {});
    expect(getNativeBackgroundLocation()).toBeNull();
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, Plugins: {} },
    });
    expect(getNativeBackgroundLocation()).toBeNull();
  });

  it("finds the plugin inside the shell", () => {
    const plugin = { addWatcher: () => "id" };
    vi.stubGlobal("window", {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: { BackgroundGeolocation: plugin },
      },
    });
    expect(getNativeBackgroundLocation()).toBe(plugin);
  });

  it("an app built without the plugin falls back to the browser watcher", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, Plugins: {} },
    });
    expect(getNativeBackgroundLocation()).toBeNull();
  });
});

describe("the Map page's saved state", () => {
  afterEach(() => vi.unstubAllGlobals());
  const store = (items: Record<string, string>) =>
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => items[k] ?? null,
    });

  it("reads the sharing switch per user", () => {
    store({ runlog_sharing_u7: "true", runlog_sharing_u8: "false" });
    expect(readSharingFlag(7)).toBe(true);
    expect(readSharingFlag(8)).toBe(false);
    expect(readSharingFlag(undefined)).toBe(false);
  });

  it("reads the selected operations, ignoring junk", () => {
    store({
      runlog_map_settings: JSON.stringify({ selectedOpIds: [3, "x", 5] }),
    });
    expect(readSelectedOperationIds()).toEqual([3, 5]);
    store({ runlog_map_settings: "not json" });
    expect(readSelectedOperationIds()).toEqual([]);
    store({});
    expect(readSelectedOperationIds()).toEqual([]);
  });
});
