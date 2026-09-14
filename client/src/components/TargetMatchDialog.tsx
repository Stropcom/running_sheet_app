import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserCheck } from "lucide-react";
import { bracketCodeFromRegisteredName } from "@shared/addressFormat";

// Shown at row-save time when a newly-typed person name closely resembles an
// existing Target/Associate but doesn't exactly match their registered
// short-form — e.g. "LOCKET" vs the registered "LOCKETT". Distinct from
// EntityDuplicateDialog (which links two ordinary text-mined entities
// without touching the observation text): confirming here corrects the
// row's own text to the registered spelling before it saves, since this is
// a pre-certification correction the officer is actively approving, not a
// retroactive edit of a saved record.

export interface TargetMatchCandidate {
  targetId?: number;
  associateId?: number;
  name: string;
  tgtAlias: string | null;
  surname: string | null;
  reason: string;
}

interface TargetMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The as-typed bracket short-form, e.g. "LOCKET". */
  spelling: string;
  match: TargetMatchCandidate;
  /** Called with the corrected spelling once confirmed, so the caller can
   * rewrite the pending observation text before saving. Called with
   * undefined on "No"/cancel — nothing to correct. */
  onResolved: (correctSpelling: string | undefined) => void;
}

export function TargetMatchDialog({
  open,
  onOpenChange,
  spelling,
  match,
  onResolved,
}: TargetMatchDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirmMutation =
    trpc.intelligence.confirmPersonNameMatch.useMutation();
  const rejectMutation = trpc.intelligence.rejectPersonNameMatch.useMutation();

  // Real bug this fixed: `match.name` is the full registered name with no
  // trailing "(BRACKET)" of its own (e.g. "Declan WESTBROOK", not "Declan
  // WESTBROOK (WESTBROOK)"), so bracketCodeFromRegisteredName's own
  // extraction never found anything to extract and silently fell back to
  // the WHOLE name — a row got corrected to "(Declan WESTBROOK)" instead of
  // just "(WESTBROOK)". match.surname (the registry's own structured
  // surname field) is the real bracket code; bracketCodeFromRegisteredName
  // stays only as a last-resort fallback for the rare case a match has no
  // surname on file at all (a business-name associate).
  const correctSpelling =
    match.tgtAlias ||
    match.surname ||
    bracketCodeFromRegisteredName(match.name);

  async function handleYes() {
    setBusy(true);
    try {
      await confirmMutation.mutateAsync({
        spelling,
        targetId: match.targetId,
        associateId: match.associateId,
        correctSpelling,
      });
    } catch {
      toast.error("Failed to record — please try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onOpenChange(false);
    onResolved(correctSpelling);
  }

  async function handleNo() {
    setBusy(true);
    try {
      await rejectMutation.mutateAsync({
        spelling,
        targetId: match.targetId,
        associateId: match.associateId,
      });
    } catch {
      toast.error("Failed to record — please try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onOpenChange(false);
    onResolved(undefined);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) {
          onOpenChange(false);
          onResolved(undefined);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary shrink-0" />
            Possible match to existing Target
          </DialogTitle>
          <DialogDescription>
            "{spelling}" looks like it could be existing{" "}
            {match.targetId ? "Target" : "Associate"}{" "}
            <strong>{match.name}</strong> ({match.reason.toLowerCase()}).
          </DialogDescription>
        </DialogHeader>

        {correctSpelling.toUpperCase() !== spelling.trim().toUpperCase() && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Suggested change to this row
            </p>
            <p className="text-foreground">
              "…({correctSpelling})…" — instead of what you typed, "…(
              {spelling})…"
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground italic">
          Accepting only fixes this row's spelling, before it's certified — but
          it also means "{spelling}" auto-links to {match.name} on every future
          row, without asking again. Choose "Continue as entered" if this is
          actually a different person.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleNo} disabled={busy}>
            Continue as entered
          </Button>
          <Button onClick={handleYes} disabled={busy}>
            Accept suggested change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
