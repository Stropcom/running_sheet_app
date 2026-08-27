import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  X,
  Users,
  User,
  ZoomIn,
  ZoomOut,
  FileText,
  ImageUp,
} from "lucide-react";

export interface FaceMatchCandidate {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
  attachmentId: number;
  photoUrl: string;
  /** Where this candidate photo actually came from — a different running
   * sheet the officer confirming a match may have no idea exists. Null
   * sourceSheetId means a manually-uploaded photo not attached to any row. */
  sourceSheetId: number | null;
  sourceSheetTitle: string | null;
  sourceOperationId: number;
  sourceOperationName: string;
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
// the dialog can usefully show. Each photo's column width is a PERCENTAGE
// of the row (not a fixed px size) so two of them plus the gap always fit
// side by side within whatever width the dialog actually rendered at — a
// fixed-px size at high zoom could exceed the dialog on a narrower screen,
// which used to force the pair to squeeze (pre-shrink-0) or wrap onto two
// lines (post-shrink-0) instead of staying side by side. Every class below
// is a literal string (not built from a runtime template) so Tailwind's
// build-time scanner picks them all up regardless of which step is active.
const ZOOM_STEPS: {
  label: string;
  colClass: string;
  imgFit: string;
  dialogClass: string;
}[] = [
  {
    label: "Small",
    colClass: "w-28",
    imgFit: "object-cover",
    dialogClass: "max-w-md",
  },
  {
    label: "Medium",
    colClass: "w-[30%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "max-w-2xl",
  },
  {
    label: "Large",
    colClass: "w-[36%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "max-w-4xl",
  },
  {
    label: "X-Large",
    colClass: "w-[40%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "max-w-5xl",
  },
  {
    label: "Maximum",
    colClass: "w-[42%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "max-w-7xl",
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
  const [, setLocation] = useLocation();
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

        <div className="flex items-start justify-center gap-4 sm:gap-8">
          <div
            className={`flex flex-col items-center gap-1.5 shrink-0 ${zoom.colClass}`}
          >
            <img
              src={current.newPhotoUrl}
              alt="New photo"
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
              src={current.match.photoUrl}
              alt={current.match.entityLabel}
              className={`w-full aspect-square rounded-lg border border-border transition-all ${zoom.imgFit}`}
            />
            <span className="text-xs text-muted-foreground text-center break-words w-full">
              {current.match.entityLabel}
            </span>
            {current.match.sourceSheetId ? (
              <button
                type="button"
                onClick={() =>
                  setLocation(`/sheet/${current.match.sourceSheetId}`)
                }
                title={`Open ${current.match.sourceSheetTitle} — ${current.match.sourceOperationName}, to see other photos there`}
                className="flex items-center gap-1 text-[10px] text-primary underline underline-offset-2 break-words w-full justify-center"
              >
                <FileText className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words">
                  {current.match.sourceSheetTitle}
                </span>
              </button>
            ) : (
              <span
                title="Uploaded directly to this operation's Images folder — not attached to a running sheet row"
                className="flex items-center gap-1 text-[10px] text-muted-foreground break-words w-full justify-center"
              >
                <ImageUp className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words">
                  Uploaded · {current.match.sourceOperationName}
                </span>
              </span>
            )}
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
