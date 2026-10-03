import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ZOOM_STEPS, MAX_ZOOM_INDEX } from "@/components/PossibleMatchDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Check,
  X,
  ScanFace,
  User,
  ZoomIn,
  ZoomOut,
  FileText,
  ImageUp,
} from "lucide-react";

export interface FaceMatchSuggestion {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
  /** The already-confirmed photo this upload was matched against, and where
   * it came from — shown beside the new photo so the officer can actually
   * compare the two faces (see findSimilarFaces in server/db.ts). */
  photoUrl: string;
  sourceSheetId: number | null;
  sourceSheetTitle: string | null;
  sourceOperationName: string;
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
  const [, setLocation] = useLocation();
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex];

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
      <DialogContent
        className={`${zoom.dialogClass} max-h-[96vh] overflow-y-auto`}
      >
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

        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex(z => Math.max(0, z - 1))}
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-16 text-center">
            {zoom.label}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={zoomIndex === MAX_ZOOM_INDEX}
            onClick={() => setZoomIndex(z => Math.min(MAX_ZOOM_INDEX, z + 1))}
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-start justify-center gap-4 sm:gap-8">
          <div
            className={`flex flex-col items-center gap-1.5 shrink-0 ${zoom.colClass}`}
          >
            <img
              src={photoUrl}
              alt="Uploaded photo"
              className={`w-full aspect-square rounded-lg border border-border transition-all ${zoom.imgFit}`}
            />
            <span className="text-xs text-muted-foreground">New photo</span>
          </div>
          <div className="text-muted-foreground text-lg shrink-0 self-center">
            ≈
          </div>
          <div
            className={`flex flex-col items-center gap-1.5 shrink-0 ${zoom.colClass}`}
          >
            <img
              src={suggestion.photoUrl}
              alt={suggestion.entityLabel}
              className={`w-full aspect-square rounded-lg border border-border transition-all ${zoom.imgFit}`}
            />
            <span className="text-xs text-muted-foreground text-center break-words w-full">
              {suggestion.entityLabel}
            </span>
            {suggestion.sourceSheetId ? (
              <button
                type="button"
                onClick={() =>
                  setLocation(`/sheet/${suggestion.sourceSheetId}`)
                }
                title={`Open ${suggestion.sourceSheetTitle} — ${suggestion.sourceOperationName}, to see other photos there`}
                className="flex items-center gap-1 text-[10px] text-primary underline underline-offset-2 break-words w-full justify-center"
              >
                <FileText className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words">
                  {suggestion.sourceSheetTitle}
                </span>
              </button>
            ) : (
              <span
                title="Uploaded directly to this operation's Images folder — not attached to a running sheet row"
                className="flex items-center gap-1 text-[10px] text-muted-foreground break-words w-full justify-center"
              >
                <ImageUp className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words">
                  Uploaded · {suggestion.sourceOperationName}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          {CATEGORY_LABEL[suggestion.category] ?? suggestion.category}
          <span className="text-muted-foreground/60">·</span>
          {Math.round(suggestion.similarity * 100)}% similar
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
