import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Users, User } from "lucide-react";

export interface FaceMatchCandidate {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
  attachmentId: number;
  photoUrl: string;
}

export interface PendingMatch {
  newLinkId: number;
  newPhotoUrl: string;
  match: FaceMatchCandidate;
}

const CATEGORY_LABEL: Record<string, string> = {
  target: "Target",
  associate: "Associate",
  unidentified_person: "Unidentified Person",
};

// Steps through every possible-match candidate surfaced after confirming
// face(s) — one candidate at a time, always requiring an explicit human
// Confirm or Not a match tap. Never applies a match automatically.
export function PossibleMatchDialog({
  matches,
  onDone,
}: {
  matches: PendingMatch[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const utils = trpc.useUtils();

  const invalidate = () => {
    utils.attachment.entityLinkCounts.invalidate();
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
  };

  const confirmMatch = trpc.attachment.confirmFaceMatch.useMutation({
    onSuccess: () => {
      toast.success("Linked as the same person");
      invalidate();
      advance();
    },
    onError: e => toast.error(e.message),
  });

  const dismissMatch = trpc.attachment.dismissFaceMatch.useMutation({
    onSuccess: () => advance(),
    onError: e => toast.error(e.message),
  });

  const advance = () => {
    if (index + 1 >= matches.length) onDone();
    else setIndex(index + 1);
  };

  if (matches.length === 0) return null;
  const current = matches[index];
  const pending = confirmMatch.isPending || dismissMatch.isPending;

  return (
    <Dialog
      open
      onOpenChange={o => {
        if (!o) onDone();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Possible match
            {matches.length > 1 ? ` (${index + 1} of ${matches.length})` : ""}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          This face looks similar to an existing entry. Is it the same person?
        </p>

        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <img
              src={current.newPhotoUrl}
              alt="New photo"
              className="w-28 h-28 rounded-lg object-cover border border-border"
            />
            <span className="text-xs text-muted-foreground">New photo</span>
          </div>
          <div className="text-muted-foreground text-lg">≈</div>
          <div className="flex flex-col items-center gap-1.5">
            <img
              src={current.match.photoUrl}
              alt={current.match.entityLabel}
              className="w-28 h-28 rounded-lg object-cover border border-border"
            />
            <span className="text-xs text-muted-foreground text-center max-w-[120px] truncate">
              {current.match.entityLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          {CATEGORY_LABEL[current.match.category] ?? current.match.category}
          <span className="text-muted-foreground/60">·</span>
          {Math.round(current.match.similarity * 100)}% similar
        </div>

        <div className="flex justify-center gap-2 pt-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              dismissMatch.mutate({
                newLinkId: current.newLinkId,
                matchedLinkId: current.match.entityLinkId,
              })
            }
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Not a match
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              confirmMatch.mutate({
                newLinkId: current.newLinkId,
                matchedLinkId: current.match.entityLinkId,
              })
            }
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Same person
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
