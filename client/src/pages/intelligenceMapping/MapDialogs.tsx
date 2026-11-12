// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { MissingLocationAlert } from "@/components/MissingLocationAlert";
import { VagueVehicleMatchAlert } from "@/components/VagueVehicleMatchAlert";
import { MyPillDialog } from "@/components/MyPillDialog";
import { type LiveUser } from "./mapTypes";
import type { MapScreen } from "./useMapScreen";

/** the duplicate-vehicle dialog and the My Pill dialog. */
export function MapDialogs({ s }: { s: MapScreen }) {
  const {
    user,
    setOnFootPopupOpen,
    liveUsers,
    isInvestigator,
    tracedUserIds,
    predictor,
    qeDupeQueue,
    qeDupeIndex,
    qeDupeDialogOpen,
    handleQeMissingLocationResolved,
    qeVagueVehicleBusy,
    handleQeVagueVehicleResolved,
    onFootPopupOpen,
    deviceId,
    setTrackAll,
    setOnFootMut,
  } = s;
  return (
    <>
      {(() => {
        const currentQeDupe = qeDupeQueue[qeDupeIndex];
        if (!currentQeDupe) return null;
        if (currentQeDupe.kind === "missingLocation") {
          return (
            <MissingLocationAlert
              key={qeDupeIndex}
              warning={
                qeDupeDialogOpen
                  ? {
                      location: currentQeDupe.location,
                      source: currentQeDupe.source,
                    }
                  : null
              }
              onConfirm={() =>
                handleQeMissingLocationResolved(true, currentQeDupe.location)
              }
              onDecline={() =>
                handleQeMissingLocationResolved(false, currentQeDupe.location)
              }
            />
          );
        }
        return (
          <VagueVehicleMatchAlert
            key={qeDupeIndex}
            warning={
              qeDupeDialogOpen
                ? {
                    loserLabel: currentQeDupe.loserLabel,
                    winnerLabel: currentQeDupe.winnerLabel,
                    reason: currentQeDupe.reason,
                  }
                : null
            }
            busy={qeVagueVehicleBusy}
            onConfirm={() => handleQeVagueVehicleResolved(true, currentQeDupe)}
            onDecline={() => handleQeVagueVehicleResolved(false, currentQeDupe)}
          />
        );
      })()}

      {/* "My Pill" — opened by tapping your own name pill on the map. */}
      <MyPillDialog
        open={onFootPopupOpen}
        onOpenChange={setOnFootPopupOpen}
        own={(liveUsers as LiveUser[] | undefined)?.find(
          u => u.userId === user?.id && u.deviceId === deviceId
        )}
        isInvestigator={isInvestigator}
        tracking={tracedUserIds.size > 0}
        onSetTracking={setTrackAll}
        predictor={predictor}
        onSetOnFoot={onFoot => setOnFootMut.mutate({ onFoot })}
      />
    </>
  );
}
