// Which switchable features the signed-in person's Command has on (rule:
// shared/commandFeatures.ts). Arrives with auth.me; everything reads as on
// until it has loaded, so nothing flickers away.
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DEFAULT_OFF_FEATURES,
  FEATURE_KEYS,
  type FeatureKey,
} from "@shared/commandFeatures";

// Everything reads as on until auth.me has loaded — except the features that
// start off, which stay hidden so they never flicker in.
const ALL_ON = Object.fromEntries(
  FEATURE_KEYS.map(k => [k, !DEFAULT_OFF_FEATURES.includes(k)])
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
