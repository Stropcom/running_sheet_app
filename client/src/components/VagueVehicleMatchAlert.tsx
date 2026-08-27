/**
 * Confirm dialog shown before saving a row that fully identifies a vehicle
 * (a real registration) which might be the same car as an earlier vague
 * sighting on the same sheet — "(Vehicle White Hyundai)", registration not
 * observed at the time. See findVagueVehicleMatch in server/db.ts.
 *
 * Unlike MissingLocationAlert, confirming here doesn't touch the row being
 * saved at all (or any other row's text) — it calls the same
 * intelligence.mergeEntities mutation the manual "Merge Entities" tool
 * uses, which only affects how the Intelligence folder/map link the two
 * sightings together. The running sheet itself stays exactly as each
 * officer wrote it, permanently.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link2 } from "lucide-react";
import { formatIntelVehicle } from "@/lib/addressFormat";

export interface VagueVehicleWarning {
  loserLabel: string;
  winnerLabel: string;
  reason: string;
}

export function VagueVehicleMatchAlert({
  warning,
  onConfirm,
  onDecline,
  busy,
}: {
  warning: VagueVehicleWarning | null;
  onConfirm: () => void;
  onDecline: () => void;
  busy?: boolean;
}) {
  return (
    <AlertDialog
      open={!!warning}
      onOpenChange={open => !open && !busy && onDecline()}
    >
      {warning && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-amber-600" />
              Same vehicle as an earlier sighting?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Is{" "}
                  <strong className="text-foreground">
                    {formatIntelVehicle(warning.winnerLabel)}
                  </strong>{" "}
                  the same vehicle as{" "}
                  <strong className="text-foreground">
                    {formatIntelVehicle(warning.loserLabel)}
                  </strong>{" "}
                  mentioned earlier in this sheet, before its registration was
                  known ({warning.reason})?
                </p>
                <p className="text-muted-foreground">
                  This won't change what's written on either row — it only links
                  the two sightings under this vehicle's registration in the
                  Intelligence folder and map.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDecline} disabled={busy}>
              No, different vehicle
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} disabled={busy}>
              Yes, same vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
