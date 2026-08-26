/**
 * Confirm dialog shown before saving a row that describes vehicle(s)
 * present/parked with no location mentioned in that row's own text — see
 * findMissingLocationSuggestion in server/db.ts for why this matters
 * beyond readability (it's what links the vehicles to the location in the
 * Intelligence folder/map for this specific row). Unlike
 * CrossOperationEntityAlert (informational-only, one "Understood" button),
 * this is an actual decision: add the suggested location, or save as
 * typed. Either way the officer's own words are the ones that end up in
 * the record — this never silently rewrites anything.
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
import { MapPin } from "lucide-react";

export interface MissingLocationWarning {
  location: string;
  source: string;
}

export function MissingLocationAlert({
  warning,
  onConfirm,
  onDecline,
}: {
  warning: MissingLocationWarning | null;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  return (
    <AlertDialog open={!!warning} onOpenChange={open => !open && onDecline()}>
      {warning && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-600" />
              No location on this row
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This row mentions a vehicle but doesn't name a location. Add{" "}
                  <strong className="text-foreground">
                    {warning.location}
                  </strong>{" "}
                  (established via {warning.source})?
                </p>
                <p className="text-muted-foreground">
                  Without it, these vehicles won't be linked to that location in
                  the Intelligence folder or map for this row.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDecline}>
              No, leave as typed
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              Add {warning.location}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
