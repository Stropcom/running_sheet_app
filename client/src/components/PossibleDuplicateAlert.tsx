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
 *
 * Exception: a "person" match against a real Associate record, or a
 * "target" match against a real Target record (not just a text mention),
 * carries `linkable` — enabling a third option, "Yes, same person — link
 * and copy", that creates the new record pre-filled from the matched one
 * and links the two (see AddTargetDialog.tsx / TargetRegistry.tsx's
 * handleWarnLinkAndCopy). Both records still survive independently; only
 * their shared identity fields stay in sync afterwards.
 */

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Link2 } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

export type DuplicateWarningKind = "target" | "person" | "vehicle" | "address";

export interface DuplicateWarning {
  kind: DuplicateWarningKind;
  candidateLabel: string;
  existingLabel: string;
  reason: string;
  /** Set only when the match is a real Target/Associate registry record
   * (not a plain-text mention) — enables "link and copy". */
  linkable?: { recordType: "target" | "associate"; id: number } | null;
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
  onLinkAndCopy,
  linking,
}: {
  warning: DuplicateWarning | null;
  /** "No, this is different" — proceed to the next check (or save). */
  onContinue: () => void;
  /** "Wait, let me check" — stop here, leave the form as-is so the officer can review. */
  onReview: () => void;
  /** "Yes, same person — link and copy" — only called when warning.linkable is set. */
  onLinkAndCopy?: (linkable: {
    recordType: "target" | "associate";
    id: number;
  }) => void;
  /** True while the link-and-copy save is in flight — disables all three buttons. */
  linking?: boolean;
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
          <div className="flex flex-col gap-2">
            {warning.linkable && onLinkAndCopy && (
              <Button
                onClick={() => onLinkAndCopy(warning.linkable!)}
                disabled={linking}
                className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Link2 className="w-4 h-4" />
                Yes, same person — link and copy
              </Button>
            )}
            <Button onClick={onContinue} disabled={linking} className="w-full">
              No, this is different — continue
            </Button>
            <AlertDialogCancel
              onClick={onReview}
              disabled={linking}
              className="w-full mt-0"
            >
              Wait — let me check the existing record first
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
