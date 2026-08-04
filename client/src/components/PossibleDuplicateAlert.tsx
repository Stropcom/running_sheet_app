/**
 * Warn-only "possible duplicate" prompt shown when saving a brand-new Target
 * or Associate whose name, address, or vehicle fuzzy-matches something
 * already recorded elsewhere in the app (another target, another associate,
 * or an entity mined from observation text). Unlike the target-vs-target
 * duplicate flow (AddTargetDialog + TargetMergeDialog), this never merges
 * records — a target/associate's structured registry profile is a distinct,
 * valuable thing, and address/vehicle sub-fields don't have field-owning
 * records to merge into. It only asks the officer to confirm before saving,
 * mirroring the row-save duplicate prompt's underlying checks
 * (checkPossibleDuplicates / findPossibleDuplicateTarget).
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
import { AlertTriangle } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

export type DuplicateWarningKind = "target" | "person" | "vehicle" | "address";

export interface DuplicateWarning {
  kind: DuplicateWarningKind;
  candidateLabel: string;
  existingLabel: string;
  reason: string;
}

const KIND_NOUN: Record<DuplicateWarningKind, string> = {
  target: "target",
  person: "person",
  vehicle: "vehicle",
  address: "address",
};

function displayLabel(kind: DuplicateWarningKind, label: string): string {
  if (kind === "vehicle") return formatIntelVehicle(label);
  if (kind === "address") return formatIntelAddress(label);
  return label;
}

export function PossibleDuplicateAlert({
  warning,
  onContinue,
  onReview,
}: {
  warning: DuplicateWarning | null;
  /** "No, this is different" — proceed to the next check (or save). */
  onContinue: () => void;
  /** "Wait, let me check" — stop here, leave the form as-is so the officer can review. */
  onReview: () => void;
}) {
  return (
    <AlertDialog
      open={warning !== null}
      onOpenChange={v => {
        if (!v) onReview();
      }}
    >
      {warning && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              Possible duplicate {KIND_NOUN[warning.kind]}
            </AlertDialogTitle>
            <AlertDialogDescription>
              "{displayLabel(warning.kind, warning.candidateLabel)}" looks like
              it may be the same {KIND_NOUN[warning.kind]} as one already
              recorded,{" "}
              <strong>
                {displayLabel(warning.kind, warning.existingLabel)}
              </strong>{" "}
              ({warning.reason}). Is this actually the same one?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-col gap-2">
            <AlertDialogAction onClick={onContinue} className="w-full">
              No, this is different — continue
            </AlertDialogAction>
            <AlertDialogCancel onClick={onReview} className="w-full mt-0">
              Wait — let me check the existing record first
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
