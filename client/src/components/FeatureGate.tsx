import type { ComponentType } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useCommandFeature } from "@/lib/commandFeatures";
import type { FeatureKey } from "@shared/commandFeatures";
import { FEATURES } from "@shared/commandFeatures";

/** Shown instead of a page whose feature is switched off for this Command. */
function FeatureOff({ feature }: { feature: FeatureKey }) {
  const name = FEATURES.find(f => f.key === feature)?.name ?? "This feature";
  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">
          {name} isn't turned on
        </h1>
        <p className="text-sm text-muted-foreground">
          Your Command doesn't use this feature. Ask your administrator if you
          need it.
        </p>
      </div>
    </DashboardLayout>
  );
}

/**
 * Wraps a page so it only opens when its feature is on for the person's
 * Command (the server refuses the feature's requests as well — this is just
 * what they see). Call it once per page, at module level, so the wrapped
 * component stays the same between renders.
 */
export function gatedByFeature(
  feature: FeatureKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Page: ComponentType<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ComponentType<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function Gated(props: any) {
    const on = useCommandFeature(feature);
    return on ? <Page {...props} /> : <FeatureOff feature={feature} />;
  };
}
