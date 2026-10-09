// Background location for the iPhone/iPad shell (see ios-shell/README.md).
//
// In a browser, RunLog reports the officer's position from the Map page with
// navigator.geolocation, which stops the moment the page is left or the app
// goes to the background. The native shell adds a plugin that keeps location
// running ("Always" permission), and the app-wide NativeLocationSharing
// component feeds its fixes into the same updateUserLocation call the map
// uses. Everything here is inert outside the shell: the plugin isn't there,
// so getNativeBackgroundLocation() is null and the browser/PWA behave exactly
// as before.
//
// The plugin is reached through the global the shell's native bridge injects
// (window.Capacitor.Plugins), so the website needs no Capacitor dependency.

/** One position as the native plugin reports it. Speed is metres per second,
 * bearing degrees from north — the same units as the browser's
 * GeolocationCoordinates (speed, heading). */
export interface NativeFix {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  bearing?: number | null;
  time?: number | null;
}

export interface NativeLocationError {
  code?: string;
  message?: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: Record<string, unknown>,
    callback: (fix?: NativeFix, error?: NativeLocationError) => void
  ): Promise<string> | string;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

/** localStorage key the Map page keeps the per-user sharing switch in. */
export const sharingKey = (userId: number | string) =>
  `runlog_sharing_u${userId}`;
/** Fired on window whenever the sharing switch changes, so the app-wide
 * service hears about it even though the switch lives on the Map page. */
export const SHARING_EVENT = "runlog:sharing-changed";
/** Where the Map page keeps its settings (selected operations among them). */
export const MAP_SETTINGS_KEY = "runlog_map_settings";
/** Per-tab device id shared with the Map page. */
export const DEVICE_ID_KEY = "runlog_tab_device_id";

/** The native background-location plugin, or null when not running inside
 * the shell (or when the shell was built without it). */
export function getNativeBackgroundLocation(): BackgroundGeolocationPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: Record<string, unknown>;
      };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const plugin = cap.Plugins?.BackgroundGeolocation;
  return plugin ? (plugin as BackgroundGeolocationPlugin) : null;
}

/** Whether the officer has location sharing switched on. */
export function readSharingFlag(userId: number | string | undefined): boolean {
  if (userId == null) return false;
  try {
    return localStorage.getItem(sharingKey(userId)) === "true";
  } catch {
    return false;
  }
}

/** Records the sharing switch and tells the app-wide service straight away. */
export function broadcastSharing(
  userId: number | string | undefined,
  on: boolean
): void {
  if (userId == null) return;
  try {
    localStorage.setItem(sharingKey(userId), String(on));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(SHARING_EVENT));
  } catch {
    /* ignore */
  }
}

/** The operations the Map page last had selected (what sharing is scoped to). */
export function readSelectedOperationIds(): number[] {
  try {
    const raw = localStorage.getItem(MAP_SETTINGS_KEY);
    if (!raw) return [];
    const ids = (JSON.parse(raw) as { selectedOpIds?: unknown }).selectedOpIds;
    return Array.isArray(ids)
      ? ids.filter((n): n is number => typeof n === "number")
      : [];
  } catch {
    return [];
  }
}

/** The per-tab device id the Map page uses, created the same way if the
 * service gets there first. */
export function getOrCreateDeviceId(): string {
  try {
    const existing = sessionStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** A native fix as the input updateUserLocation takes — the same fields the
 * map's browser watcher sends (speed, heading and accuracy are null when the
 * phone doesn't know them). */
export function buildLocationUpdate(
  fix: NativeFix,
  deviceId: string,
  operationIds: number[]
) {
  const num = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  return {
    deviceId,
    lat: fix.latitude,
    lng: fix.longitude,
    operationIds,
    sharingEnabled: true,
    speed: num(fix.speed),
    heading: num(fix.bearing),
    accuracy: num(fix.accuracy),
  };
}
