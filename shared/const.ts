// Displayed in the sidebar footer so a user can report which build they're
// on. Keep in sync with package.json's "version" — bump both together on
// each shippable change.
export const APP_VERSION = "1.0.1";

export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365; // kept for reference
export const SESSION_EXPIRY_MS = 1000 * 60 * 60 * 12; // 12 hours
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// Accent colour options for the "Appearance" settings — each name maps to
// a `data-palette` value applied to <html> (see index.css for the actual
// colour definitions, in both light and dark variants). "Blue" is the
// original app accent and the default; the rest are calm/muted options.
export const COLOR_PALETTES = [
  { id: "blue", label: "Blue" },
  { id: "sage", label: "Sage" },
  { id: "dusty-blue", label: "Dusty Blue" },
  { id: "lavender", label: "Lavender" },
  { id: "sand", label: "Sand" },
  { id: "pink", label: "Pink" },
  { id: "slate", label: "Slate" },
] as const;
export type ColorPalette = (typeof COLOR_PALETTES)[number]["id"];
export const DEFAULT_COLOR_PALETTE: ColorPalette = "blue";
