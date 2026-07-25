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
import { AlertTriangle, Merge } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

// Shared by both the auto-detected "possible duplicate" prompt (shown as an
// officer saves an observation row) and the manual Merge Entities tool on the
// Intelligence page — both end up doing the same underlying merge, just with
// a different starting step.

export type DedupType = "person" | "vehicle" | "address" | "business";

export interface DedupEntityRef {
  label: string;
  rowCount: number;
}

interface EntityDuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: DedupType;
  /** "auto" starts with a Yes/No question; "manual" goes straight to picking the canonical entity. */
  mode: "auto" | "manual";
  candidate: DedupEntityRef;
  existing: DedupEntityRef;
  /** Shown in auto mode — the fuzzy-match heuristic's explanation (e.g. "Very similar spelling"). */
  reason?: string;
  onResolved?: (result: "merged" | "not-duplicate" | "cancelled") => void;
}

function displayLabel(type: DedupType, label: string): string {
  if (type === "vehicle") return formatIntelVehicle(label);
  if (type === "address") return formatIntelAddress(label);
  return label;
}

const TYPE_NOUN: Record<DedupType, string> = {
  person: "person",
  vehicle: "vehicle",
  address: "location",
  business: "location",
};

export function EntityDuplicateDialog({
  open,
  onOpenChange,
  type,
  mode,
  candidate,
  existing,
  reason,
  onResolved,
}: EntityDuplicateDialogProps) {
  const defaultWinner: "candidate" | "existing" =
    existing.rowCount >= candidate.rowCount ? "existing" : "candidate";
  const [step, setStep] = useState<"ask" | "pick">(
    mode === "manual" ? "pick" : "ask"
  );
  const [winnerSide, setWinnerSide] = useState<"candidate" | "existing">(
    defaultWinner
  );

  const utils = trpc.useUtils();
  const mergeMutation = trpc.intelligence.mergeEntities.useMutation();
  const notDuplicateMutation =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();
  const busy = mergeMutation.isPending || notDuplicateMutation.isPending;

  function resetAndClose(result: "merged" | "not-duplicate" | "cancelled") {
    onOpenChange(false);
    setStep(mode === "manual" ? "pick" : "ask");
    setWinnerSide(defaultWinner);
    onResolved?.(result);
  }

  async function handleNotDuplicate() {
    try {
      await notDuplicateMutation.mutateAsync({
        type,
        labelA: candidate.label,
        labelB: existing.label,
      });
    } catch {
      toast.error("Failed to record — please try again.");
      return;
    }
    resetAndClose("not-duplicate");
  }

  async function handleConfirmMerge() {
    const winner = winnerSide === "candidate" ? candidate : existing;
    const loser = winnerSide === "candidate" ? existing : candidate;
    try {
      await mergeMutation.mutateAsync({
        type,
        winnerLabel: winner.label,
        loserLabel: loser.label,
      });
      toast.success(`Merged into "${displayLabel(type, winner.label)}"`);
      await utils.intelligence.getEntities.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed.");
      return;
    }
    resetAndClose("merged");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) resetAndClose("cancelled");
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            {step === "ask" ? "Possible duplicate entity" : "Confirm merge"}
          </DialogTitle>
          {step === "ask" && (
            <DialogDescription>
              {reason ? `${reason}. ` : ""}Is this the same {TYPE_NOUN[type]} as
              an entity already recorded?
            </DialogDescription>
          )}
          {step === "pick" && (
            <DialogDescription>
              Which one should be kept as the main entity going forward?
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-1">
          {[
            {
              side: "candidate" as const,
              entity: candidate,
              label: mode === "manual" ? "Entity 1" : "New entry",
            },
            {
              side: "existing" as const,
              entity: existing,
              label: mode === "manual" ? "Entity 2" : "Existing entity",
            },
          ].map(({ side, entity, label }) => (
            <label
              key={side}
              className={`rounded-lg border p-3 flex flex-col gap-1 transition-colors ${
                step === "pick" ? "cursor-pointer" : ""
              } ${step === "pick" && winnerSide === side ? "border-primary bg-primary/5" : "border-border/60"}`}
              onClick={() => step === "pick" && setWinnerSide(side)}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                {step === "pick" && (
                  <input
                    type="radio"
                    name="entity-duplicate-winner"
                    checked={winnerSide === side}
                    onChange={() => setWinnerSide(side)}
                  />
                )}
              </div>
              <p className="text-sm font-medium text-foreground break-words">
                {displayLabel(type, entity.label)}
              </p>
              <p className="text-xs text-muted-foreground">
                {entity.rowCount} observation{entity.rowCount !== 1 ? "s" : ""}
              </p>
            </label>
          ))}
        </div>

        {step === "pick" && (
          <p className="text-xs text-muted-foreground italic">
            The other entity's label is kept as an "also known as" on the
            surviving one — nothing is deleted, and this can be undone later.
          </p>
        )}

        <DialogFooter className="gap-2">
          {step === "ask" ? (
            <>
              <Button
                variant="outline"
                onClick={handleNotDuplicate}
                disabled={busy}
              >
                No, different {TYPE_NOUN[type]}
              </Button>
              <Button onClick={() => setStep("pick")} disabled={busy}>
                Yes, same — merge
              </Button>
            </>
          ) : (
            <>
              {mode === "auto" && (
                <Button
                  variant="ghost"
                  onClick={() => setStep("ask")}
                  disabled={busy}
                >
                  Back
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => resetAndClose("cancelled")}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={handleConfirmMerge} disabled={busy}>
                <Merge className="w-4 h-4 mr-1.5" /> Confirm Merge
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
