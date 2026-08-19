/**
 * Informational (not a merge decision) alert shown when an entity an officer
 * just typed on a running sheet row — a person, vehicle, or address/business
 * — is the exact same entity already known from a real observation on a
 * DIFFERENT operation. Separate from PossibleDuplicateAlert/
 * EntityDuplicateDialog, which handle near-miss "is this the same thing?"
 * questions and deliberately skip exact matches (those already auto-merge
 * into one shared entity via getAllIntelligenceEntities' key normalization).
 * This is the notification for that exact-match case, which otherwise
 * happens completely silently — see checkCrossOperationEntity in db.ts.
 *
 * Nothing to decide here, just acknowledge — the entity already IS shared
 * across operations at the data level; this only makes that visible.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldAlert } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

export type CrossOperationEntityType =
  | "person"
  | "vehicle"
  | "address"
  | "business";

export interface CrossOperationWarning {
  type: CrossOperationEntityType;
  label: string;
  operationNames: string[];
}

const TYPE_NOUN: Record<CrossOperationEntityType, string> = {
  person: "person",
  vehicle: "vehicle",
  address: "location",
  business: "location",
};

function displayLabel(type: CrossOperationEntityType, label: string): string {
  if (type === "vehicle") return formatIntelVehicle(label);
  if (type === "address") return formatIntelAddress(label);
  return label;
}

export function CrossOperationEntityAlert({
  warning,
  onAcknowledge,
}: {
  warning: CrossOperationWarning | null;
  onAcknowledge: () => void;
}) {
  return (
    <AlertDialog
      open={!!warning}
      onOpenChange={open => !open && onAcknowledge()}
    >
      {warning && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              Already recorded on another operation
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  The {TYPE_NOUN[warning.type]}{" "}
                  <strong className="text-foreground">
                    {displayLabel(warning.type, warning.label)}
                  </strong>{" "}
                  is already a recorded entity on{" "}
                  {warning.operationNames.length === 1
                    ? "another operation"
                    : "other operations"}
                  :
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {warning.operationNames.map(name => (
                    <li key={name} className="text-foreground font-medium">
                      {name}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  This row will still save normally — this is just to make sure
                  you're aware.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onAcknowledge}>
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
