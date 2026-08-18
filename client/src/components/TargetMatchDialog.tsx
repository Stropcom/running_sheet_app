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

  const correctSpelling =
    match.tgtAlias || bracketCodeFromRegisteredName(match.name);

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
            {match.reason}. Is "{spelling}" the same person as existing{" "}
            {match.targetId ? "Target" : "Associate"}{" "}
            <strong>{match.name}</strong>?
          </DialogDescription>
        </DialogHeader>

        {correctSpelling.toUpperCase() !== spelling.trim().toUpperCase() && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              If yes, this row will be recorded as
            </p>
            <p className="text-foreground">
              "…({correctSpelling})…" instead of "…({spelling})…"
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground italic">
          This only corrects the spelling in the row you're saving right now,
          before it's certified. Confirming also means "{spelling}" auto-links
          to {match.name} on every future row, without asking again.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleNo} disabled={busy}>
            No, different person
          </Button>
          <Button onClick={handleYes} disabled={busy}>
            Yes, correct it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
