import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, ScanFace, User } from "lucide-react";

export interface FaceMatchSuggestion {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  target: "Target",
  associate: "Associate",
  unidentified_person: "Unidentified Person",
};

// Shown immediately after a photo finishes uploading, only when
// previewFaceMatch found exactly one face AND a similarity match above
// FACE_MATCH_THRESHOLD against a face already confirmed somewhere else in
// the app (see server/routers.ts's previewFaceMatch). A shortcut, never a
// requirement: "Not a match" (or closing the dialog) leaves the photo
// exactly as unlinked as it would be today — the normal Link badge still
// works the same as always, including tagging it Unidentified Person or
// picking a different Target/Associate entirely.
export function SuggestedFaceMatchDialog({
  attachmentId,
  photoUrl,
  suggestion,
  onDone,
}: {
  attachmentId: number;
  photoUrl: string;
  suggestion: FaceMatchSuggestion;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();

  const confirm = trpc.attachment.confirmSuggestedFaceMatch.useMutation({
    onSuccess: data => {
      toast.success(`Linked to ${data.entityLabel}`);
      utils.attachment.linksFor.invalidate({ attachmentId });
      utils.attachment.entityLinkCounts.invalidate();
      utils.attachment.listBySheet.invalidate();
      utils.attachment.listByOperation.invalidate();
      utils.row.list.invalidate();
      onDone();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={o => !o && onDone()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="h-4 w-4 text-primary" />
            Possible match found
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          This photo's face looks similar to a face already confirmed elsewhere
          in the app. Is it the same person?
        </p>

        <div className="flex flex-col items-center gap-2">
          <img
            src={photoUrl}
            alt="Uploaded photo"
            className="w-32 h-32 rounded-lg border border-border object-cover"
          />
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <User className="h-4 w-4 text-muted-foreground" />
            {suggestion.entityLabel}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {CATEGORY_LABEL[suggestion.category] ?? suggestion.category}
            <span className="text-muted-foreground/60">·</span>
            {Math.round(suggestion.similarity * 100)}% similar
          </div>
        </div>

        <div className="flex justify-center gap-2 pt-1">
          <Button
            variant="outline"
            disabled={confirm.isPending}
            onClick={onDone}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Not a match
          </Button>
          <Button
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({
                attachmentId,
                matchedEntityLinkId: suggestion.entityLinkId,
              })
            }
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            {confirm.isPending ? "Linking…" : "Confirm match"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
