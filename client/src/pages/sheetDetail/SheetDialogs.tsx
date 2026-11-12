// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { EntityDuplicateDialog } from "@/components/EntityDuplicateDialog";
import { TargetMatchDialog } from "@/components/TargetMatchDialog";
import { CheckRunningSheetDialog } from "@/components/CheckRunningSheetDialog";
import { CrossOperationEntityAlert } from "@/components/CrossOperationEntityAlert";
import { MissingLocationAlert } from "@/components/MissingLocationAlert";
import { VagueVehicleMatchAlert } from "@/components/VagueVehicleMatchAlert";
import { FaceMatchAckDialog } from "@/components/FaceMatchAckDialog";
import type { SheetScreen } from "./useSheetScreen";

/** the duplicate / target-match / missing-location dialogs, face-match and Check Sheet. */
export function SheetDialogs({ s }: { s: SheetScreen }) {
  const {
    sheetId,
    sheetCheckOn,
    setShowCheckSheetDialog,
    dupeQueue,
    dupeIndex,
    dupeDialogOpen,
    setDupeDialogOpen,
    handleDupeDialogResolved,
    handleMissingLocationResolved,
    vagueVehicleBusy,
    handleVagueVehicleResolved,
    handleTargetMatchResolved,
    showCheckSheetDialog,
    handleJumpToCheckRow,
    handleFixCheckFinding,
  } = s;
  return (
    <>
      {(() => {
        const currentDupe = dupeQueue[dupeIndex];
        if (!currentDupe) return null;
        if (currentDupe.kind === "generic") {
          return (
            <EntityDuplicateDialog
              key={dupeIndex}
              open={dupeDialogOpen}
              onOpenChange={setDupeDialogOpen}
              type={currentDupe.type}
              mode="auto"
              candidate={{ label: currentDupe.label, rowCount: 0 }}
              existing={{
                label: currentDupe.match.label,
                rowCount: currentDupe.match.rowCount,
              }}
              reason={currentDupe.match.reason}
              onResolved={handleDupeDialogResolved}
            />
          );
        }
        if (currentDupe.kind === "crossOp") {
          return (
            <CrossOperationEntityAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      type: currentDupe.type,
                      label: currentDupe.label,
                      operationNames: currentDupe.operationNames,
                    }
                  : null
              }
              onAcknowledge={handleDupeDialogResolved}
            />
          );
        }
        if (currentDupe.kind === "missingLocation") {
          return (
            <MissingLocationAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      location: currentDupe.location,
                      source: currentDupe.source,
                    }
                  : null
              }
              onConfirm={() =>
                handleMissingLocationResolved(true, currentDupe.location)
              }
              onDecline={() =>
                handleMissingLocationResolved(false, currentDupe.location)
              }
            />
          );
        }
        if (currentDupe.kind === "vagueVehicle") {
          return (
            <VagueVehicleMatchAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      loserLabel: currentDupe.loserLabel,
                      winnerLabel: currentDupe.winnerLabel,
                      reason: currentDupe.reason,
                    }
                  : null
              }
              busy={vagueVehicleBusy}
              onConfirm={() => handleVagueVehicleResolved(true, currentDupe)}
              onDecline={() => handleVagueVehicleResolved(false, currentDupe)}
            />
          );
        }
        return (
          <TargetMatchDialog
            key={dupeIndex}
            open={dupeDialogOpen}
            onOpenChange={setDupeDialogOpen}
            spelling={currentDupe.rawShortForm}
            match={currentDupe.match}
            onResolved={correctSpelling =>
              handleTargetMatchResolved(
                currentDupe.rawShortForm,
                correctSpelling
              )
            }
          />
        );
      })()}
      {sheetId && <FaceMatchAckDialog sheetId={sheetId} />}
      {sheetId && sheetCheckOn && (
        <CheckRunningSheetDialog
          open={showCheckSheetDialog}
          onClose={() => setShowCheckSheetDialog(false)}
          sheetId={sheetId}
          onJumpToRow={handleJumpToCheckRow}
          onFixFinding={handleFixCheckFinding}
        />
      )}
    </>
  );
}
