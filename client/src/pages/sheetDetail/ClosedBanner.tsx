// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Button } from "@/components/ui/button";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** the banner shown on a closed sheet. */
export function ClosedBanner({ s }: { s: SheetScreen }) {
  const { isClosed, sheet, canManageClose, reopenSheet, sheetId } = s;
  return (
    <>
      {/* Closed banner */}
      {isClosed && sheet && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 px-4 py-3">
          <LockKeyhole className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              This running sheet is closed and locked
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Closed by{" "}
              <span className="font-mono font-semibold">
                {sheet.closedByCIN}
              </span>
              {" on "}
              {new Date(sheet.closedAt!).toLocaleString()}
            </p>
          </div>
          {canManageClose && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 shrink-0"
              onClick={() => reopenSheet.mutate({ id: sheetId })}
              disabled={reopenSheet.isPending}
            >
              <LockKeyholeOpen className="w-3.5 h-3.5" />
              Reopen
            </Button>
          )}
        </div>
      )}
    </>
  );
}
