// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Lock, CheckCircle2, ShieldCheck } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** the legend under the table. */
export function SheetLegend({ s }: { s: SheetScreen }) {
  const { canCertify } = s;
  return (
    <>
      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--certified-color)]" />
          Certified
        </div>
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[var(--certified-color)]" />
          Row locked (all members certified)
        </div>
        {canCertify && (
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Click to certify a member
          </div>
        )}
      </div>
    </>
  );
}
