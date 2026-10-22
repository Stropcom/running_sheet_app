// Which switchable features the signed-in person's Command has on (rule:
// shared/commandFeatures.ts). Arrives with auth.me; everything reads as on
// until it has loaded, so nothing flickers away.
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FEATURE_KEYS,
  isDefaultOff,
  type FeatureKey,
} from "@shared/commandFeatures";

// Before auth.me has loaded: everything on, except default-off features (so a
// default-off button never flashes up for a moment).
const ALL_ON = Object.fromEntries(
  FEATURE_KEYS.map(k => [k, !isDefaultOff(k)])
) as Record<FeatureKey, boolean>;

export function useCommandFeatures(): Record<FeatureKey, boolean> {
  const { user } = useAuth();
  const f = (user as { features?: Record<FeatureKey, boolean> } | null)
    ?.features;
  return f ? { ...ALL_ON, ...f } : ALL_ON;
}

export function useCommandFeature(key: FeatureKey): boolean {
  return useCommandFeatures()[key];
}

/** True for the one person who changes the switches. */
export function useIsFeatureOwner(): boolean {
  const { user } = useAuth();
  return (user as { isFeatureOwner?: boolean } | null)?.isFeatureOwner === true;
}
