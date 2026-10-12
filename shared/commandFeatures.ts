/**
 * Features that can be switched on or off for a whole Command.
 *
 * Every Command starts with everything on. One person (the owner below)
 * changes the switches, from the bottom of Access Management. Off means the
 * feature is gone from that Command's menu and screens, and the server refuses
 * its requests from that Command's people. Nothing is deleted, so switching it
 * back on brings everything back. An all-region admin always keeps every
 * feature.
 */
import { COMMAND_CODES, type CommandCode } from "./commands";

/** Only this person sees and changes the switches (server and screen). */
export const COMMAND_FEATURES_OWNER_CIN = "459";

export const FEATURE_KEYS = ["tasking", "roster", "import", "crash"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureInfo {
  key: FeatureKey;
  name: string;
  note: string;
  /** A caution shown under the note. */
  warn?: string;
}

export const FEATURES: FeatureInfo[] = [
  {
    key: "tasking",
    name: "CTO Weekly Tasking",
    note: "The Op Manager weekly tasking board and its report.",
  },
  {
    key: "roster",
    name: "CTO Roster",
    note: "Shift roster, drafts, saved rosters and the roster audit log.",
  },
  {
    key: "import",
    name: "Import Target",
    note: "Upload a document to fill in the registry.",
    warn: "Other regions' document styles may not read reliably.",
  },
  {
    key: "crash",
    name: "Vehicle Crash",
    note: "The Crash Helper.",
  },
];

export function isFeatureKey(v: unknown): v is FeatureKey {
  return (
    typeof v === "string" && (FEATURE_KEYS as readonly string[]).includes(v)
  );
}

/** What is saved: only the switches that were turned OFF need a row. */
export interface FeatureSetting {
  command: CommandCode;
  feature: FeatureKey;
  enabled: boolean;
}

export type FeatureMatrix = Record<CommandCode, Record<FeatureKey, boolean>>;

/** Every Command × feature, on unless a saved setting says off. */
export function buildFeatureMatrix(saved: FeatureSetting[]): FeatureMatrix {
  const matrix = {} as FeatureMatrix;
  for (const c of COMMAND_CODES) {
    matrix[c] = {} as Record<FeatureKey, boolean>;
    for (const f of FEATURE_KEYS) matrix[c][f] = true;
  }
  for (const s of saved) {
    if (matrix[s.command] && isFeatureKey(s.feature))
      matrix[s.command][s.feature] = s.enabled;
  }
  return matrix;
}

/** What one person can use: an all-region admin keeps everything; everyone
 * else gets their own Command's switches. */
export function featuresFor(
  user: { command?: string | null; allRegions?: boolean | null },
  matrix: FeatureMatrix
): Record<FeatureKey, boolean> {
  const all = Object.fromEntries(FEATURE_KEYS.map(f => [f, true])) as Record<
    FeatureKey,
    boolean
  >;
  if (user.allRegions) return all;
  const row = matrix[user.command as CommandCode];
  return row ? { ...all, ...row } : all;
}

export function isFeatureOwner(user: {
  cin?: string | null;
  role?: string | null;
}) {
  return user.role === "admin" && user.cin === COMMAND_FEATURES_OWNER_CIN;
}

/** Which feature a server request belongs to (null: not switchable). */
export function featureForPath(path: string): FeatureKey | null {
  if (path === "reports.weeklyTasking") return "tasking";
  if (path.startsWith("opManager.") && path !== "opManager.listUsers")
    return "tasking";
  if (path.startsWith("ctoRoster.")) return "roster";
  if (path === "target.registry.parseDocument") return "import";
  return null;
}
