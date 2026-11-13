import DashboardLayout from "@/components/DashboardLayout";
import React from "react";
import { useSheetScreen } from "./sheetDetail/useSheetScreen";
import { SheetHeader } from "./sheetDetail/SheetHeader";
import { ClosedBanner } from "./sheetDetail/ClosedBanner";
import { RosterPanel } from "./sheetDetail/RosterPanel";
import { TargetPanel } from "./sheetDetail/TargetPanel";
import { RowsToolbar } from "./sheetDetail/RowsToolbar";
import { RowsTable } from "./sheetDetail/RowsTable";
import { SheetLegend } from "./sheetDetail/SheetLegend";
import { EditSheetDialog } from "./sheetDetail/EditSheetDialog";
import { NewTargetDialog } from "./sheetDetail/NewTargetDialog";
import { EditRosterDialog } from "./sheetDetail/EditRosterDialog";
import { SheetDialogs } from "./sheetDetail/SheetDialogs";
import { ObservationKeyboardProvider } from "@/contexts/ObservationKeyboardContext";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SheetDetail({
  sheetIdProp,
  embedded = false,
}: {
  /** Overrides the route param — used when this is rendered inside another
   * page's panel (see the map's RS Actions pane) rather than at its own
   * /sheet/:id route. */
  sheetIdProp?: number;
  /** True when rendered inside another page's panel instead of its own
   * route — hides the page chrome (back arrow, close/export controls, the
   * Summary/Governance tabs that would navigate the whole app away from the
   * host page) since the host page supplies its own header and close
   * control instead. */
  embedded?: boolean;
} = {}) {
  const s = useSheetScreen({ sheetIdProp, embedded });

  if (!s.isAuthenticated) return null;

  const Chrome = embedded ? React.Fragment : DashboardLayout;
  return (
    <Chrome>
      <ObservationKeyboardProvider>
        <div className={embedded ? "p-4" : "p-6 lg:p-8"}>
          <SheetHeader s={s} />
          <ClosedBanner s={s} />
          <RosterPanel s={s} />
          <TargetPanel s={s} />
          <RowsToolbar s={s} />
          <RowsTable s={s} />
          <SheetLegend s={s} />
        </div>
      </ObservationKeyboardProvider>
      <EditSheetDialog s={s} />
      <NewTargetDialog s={s} />
      <EditRosterDialog s={s} />
      <SheetDialogs s={s} />
    </Chrome>
  );
}
