// Displayed in the sidebar footer so a user can report which build they're
// on. Keep in sync with package.json's "version" — bump both together on
// each shippable change.
export const APP_VERSION = "1.10.1";

export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365; // kept for reference
export const SESSION_EXPIRY_MS = 1000 * 60 * 60 * 12; // 12 hours
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// Full colour theme options for the "Appearance" settings — each name maps
// to a `data-palette` value applied to <html> (see index.css for the actual
// colour definitions, in both light and dark variants). Unlike the old
// accent-only picker this replaced, each option here re-themes the whole
// surface (background, sidebar, borders) as well as the accent, not just a
// single hue. "Steel Blue" is the original app look and the default; the
// rest are full alternate directions.
export const COLOR_PALETTES = [
  { id: "steel-blue", label: "Steel Blue" },
  { id: "federal-navy", label: "Federal Navy" },
  { id: "graphite", label: "Graphite" },
  { id: "phosphor", label: "Phosphor" },
  { id: "amber-console", label: "Amber Console" },
  { id: "case-file", label: "Case File" },
] as const;
export type ColorPalette = (typeof COLOR_PALETTES)[number]["id"];
export const DEFAULT_COLOR_PALETTE: ColorPalette = "steel-blue";
