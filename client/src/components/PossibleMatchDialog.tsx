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
import { Check, X, Users, User, ZoomIn, ZoomOut } from "lucide-react";

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

// Zoom steps for comparing the two faces — deliberately goes well past a
// simple "expanded" toggle so the officer can get the photos as large as
// the dialog can usefully show. Every class below is a literal string (not
// built from a runtime template) so Tailwind's build-time scanner picks
// them all up regardless of which step is active at render time.
const ZOOM_STEPS: {
  label: string;
  imgClass: string;
  captionClass: string;
  dialogClass: string;
}[] = [
  {
    label: "Small",
    imgClass: "w-28 h-28 object-cover",
    captionClass: "max-w-[120px]",
    dialogClass: "max-w-md",
  },
  {
    label: "Medium",
    imgClass: "w-44 h-44 sm:w-52 sm:h-52 object-contain bg-muted",
    captionClass: "max-w-[180px]",
    dialogClass: "max-w-xl",
  },
  {
    label: "Large",
    imgClass: "w-60 h-60 sm:w-72 sm:h-72 object-contain bg-muted",
    captionClass: "max-w-[220px]",
    dialogClass: "max-w-3xl",
  },
  {
    label: "X-Large",
    imgClass: "w-72 h-72 sm:w-96 sm:h-96 object-contain bg-muted",
    captionClass: "max-w-[280px]",
    dialogClass: "max-w-4xl",
  },
  {
    label: "Maximum",
    imgClass: "w-80 h-80 sm:w-[32rem] sm:h-[32rem] object-contain bg-muted",
    captionClass: "max-w-[340px]",
    dialogClass: "max-w-6xl",
  },
];
const MAX_ZOOM_INDEX = ZOOM_STEPS.length - 1;

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
  const [zoomIndex, setZoomIndex] = useState(0);
  const utils = trpc.useUtils();

  const invalidate = () => {
    utils.attachment.entityLinkCounts.invalidate();
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
  };

  const confirmMatch = trpc.attachment.confirmFaceMatch.useMutation({
    onSuccess: result => {
      if (result.blockedRowLocked) {
        toast.warning(
          "Same person confirmed, but that row is certified/locked — the Author and Team Leader have been notified to review it manually."
        );
      } else {
        toast.success("Linked as the same person");
      }
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
    setZoomIndex(0);
    if (index + 1 >= matches.length) onDone();
    else setIndex(index + 1);
  };

  if (matches.length === 0) return null;
  const current = matches[index];
  const pending = confirmMatch.isPending || dismissMatch.isPending;
  const zoom = ZOOM_STEPS[zoomIndex];

  return (
    <Dialog
      open
      onOpenChange={o => {
        if (!o) onDone();
      }}
    >
      <DialogContent
        className={`${zoom.dialogClass} max-h-[90vh] overflow-y-auto`}
      >
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

        <div className="flex items-center justify-center gap-4 sm:gap-8">
          <div className="flex flex-col items-center gap-1.5">
            <img
              src={current.newPhotoUrl}
              alt="New photo"
              className={`rounded-lg border border-border transition-all ${zoom.imgClass}`}
            />
            <span className="text-xs text-muted-foreground">New photo</span>
          </div>
          <div className="text-muted-foreground text-lg">≈</div>
          <div className="flex flex-col items-center gap-1.5">
            <img
              src={current.match.photoUrl}
              alt={current.match.entityLabel}
              className={`rounded-lg border border-border transition-all ${zoom.imgClass}`}
            />
            <span
              className={`text-xs text-muted-foreground text-center truncate ${zoom.captionClass}`}
            >
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
