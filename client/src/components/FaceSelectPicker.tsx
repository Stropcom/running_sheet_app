import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, User } from "lucide-react";
import { PossibleMatchDialog, type PendingMatch } from "@/components/PossibleMatchDialog";

interface DetectedFaceBox {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
}

type FaceSelectPickerProps =
  | {
      mode?: "unidentified";
      attachmentId: number;
      photoUrl: string;
      onDone: () => void;
      onCancel: () => void;
    }
  | {
      mode: "entity";
      attachmentId: number;
      photoUrl: string;
      category: "target" | "associate";
      targetId?: number;
      entityLabel: string;
      onDone: () => void;
      onCancel: () => void;
    };

// Shown when an officer links a photo to Unidentified Person (mode
// "unidentified", the default) or to a known Target/Associate (mode
// "entity"). Detection (RetinaFace) runs server-side and returns bounding
// boxes only — nothing is written to the database, and no identification is
// made, until the officer taps to select which face(s) to confirm.
// Unidentified mode supports selecting more than one face (each becomes its
// own pool entry); entity mode is single-select, since the officer already
// knows which real person the photo is of and is just marking which face
// that is. Either way, a confirmed face is compared against every other
// confirmed face on file — if anything looks similar, a possible-match
// popup follows before this reports done.
export function FaceSelectPicker(props: FaceSelectPickerProps) {
  const { attachmentId, photoUrl, onDone, onCancel } = props;
  const isEntityMode = props.mode === "entity";

  const {
    data: faces,
    isLoading,
    isError,
  } = trpc.attachment.detectFaces.useQuery({ attachmentId });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[] | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const utils = trpc.useUtils();

  const invalidateLinkViews = () => {
    utils.attachment.linksFor.invalidate({ attachmentId });
    utils.attachment.entityLinkCounts.invalidate();
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
    utils.attachment.listUploaded.invalidate();
  };

  const finishWithMatches = (matches: PendingMatch[]) => {
    invalidateLinkViews();
    if (matches.length > 0) setPendingMatches(matches);
    else onDone();
  };

  const confirmUnidentified = trpc.attachment.confirmUnidentifiedPersonFaces.useMutation({
    onSuccess: data => {
      toast.success(
        `Tagged ${data.results.length} Unidentified Person entr${data.results.length === 1 ? "y" : "ies"}`
      );
      finishWithMatches(
        data.results.flatMap(r =>
          r.matches.map(match => ({ newLinkId: r.linkId, newPhotoUrl: photoUrl, match }))
        )
      );
    },
    onError: e => toast.error(e.message),
  });

  const confirmEntity = trpc.attachment.confirmEntityFace.useMutation({
    onSuccess: data => {
      toast.success("Photo linked");
      finishWithMatches(data.matches.map(match => ({ newLinkId: data.linkId, newPhotoUrl: photoUrl, match })));
    },
    onError: e => toast.error(e.message),
  });

  const fallbackMutation = trpc.attachment.linkToEntity.useMutation({
    onSuccess: () => {
      toast.success(isEntityMode ? "Photo linked" : "Tagged as Unidentified Person");
      invalidateLinkViews();
      onDone();
    },
    onError: e => toast.error(e.message),
  });

  const toggle = (index: number) => {
    setSelected(prev => {
      if (isEntityMode) return prev.has(index) ? new Set() : new Set([index]);
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const boxStyles = useMemo(() => {
    if (!faces || !naturalSize) return [];
    return (faces as DetectedFaceBox[]).map(f => {
      const [x0, y0, x1, y1] = f.bbox;
      return {
        index: f.index,
        left: `${(x0 / naturalSize.w) * 100}%`,
        top: `${(y0 / naturalSize.h) * 100}%`,
        width: `${((x1 - x0) / naturalSize.w) * 100}%`,
        height: `${((y1 - y0) / naturalSize.h) * 100}%`,
      };
    });
  }, [faces, naturalSize]);

  const noFacesDetected = isError || (faces && faces.length === 0);
  const confirmPending = confirmUnidentified.isPending || confirmEntity.isPending;

  if (pendingMatches) {
    return <PossibleMatchDialog matches={pendingMatches} onDone={onDone} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {isLoading
          ? "Scanning photo for faces…"
          : isError
            ? `Automatic face detection didn't work for this photo — you can still ${isEntityMode ? "link it" : "tag it as an Unidentified Person"}.`
            : noFacesDetected
              ? `No faces detected automatically — you can still ${isEntityMode ? "link this photo" : "tag this photo as an Unidentified Person"}.`
              : isEntityMode
                ? "Tap the face that is this person."
                : "Tap the face(s) that are the unidentified person. You can select more than one."}
      </p>

      {!noFacesDetected && (
        <div className="relative w-full rounded-lg overflow-hidden border border-border">
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Photo to tag"
            className="w-full block"
            onLoad={e => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
            }}
          />
          {boxStyles.map(b => {
            const isSelected = selected.has(b.index);
            return (
              <button
                key={b.index}
                onClick={() => toggle(b.index)}
                title={isSelected ? "Selected" : "Tap to select this face"}
                className={`absolute border-2 rounded transition-colors ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/25"
                    : "border-amber-400 bg-amber-400/10 hover:bg-amber-400/25"
                }`}
                style={{
                  left: b.left,
                  top: b.top,
                  width: b.width,
                  height: b.height,
                }}
              >
                {isSelected && (
                  <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={confirmPending || fallbackMutation.isPending}
        >
          Cancel
        </Button>
        {noFacesDetected ? (
          <Button
            disabled={fallbackMutation.isPending}
            onClick={() =>
              isEntityMode
                ? fallbackMutation.mutate({
                    attachmentId,
                    category: props.category,
                    targetId: props.targetId,
                    entityLabel: props.entityLabel,
                  })
                : fallbackMutation.mutate({
                    attachmentId,
                    category: "unidentified_person",
                    entityLabel: `Unidentified Person #${attachmentId}-${Date.now()}`,
                  })
            }
            className="gap-1.5"
          >
            <User className="h-3.5 w-3.5" />
            {isEntityMode ? "Link without a face" : "Tag as Unidentified Person"}
          </Button>
        ) : (
          <Button
            disabled={selected.size === 0 || confirmPending}
            onClick={() =>
              isEntityMode
                ? confirmEntity.mutate({
                    attachmentId,
                    faceIndex: Array.from(selected)[0],
                    category: props.category,
                    targetId: props.targetId,
                    entityLabel: props.entityLabel,
                  })
                : confirmUnidentified.mutate({
                    attachmentId,
                    faceIndices: Array.from(selected),
                  })
            }
          >
            {confirmPending ? "Linking…" : isEntityMode ? "Confirm" : `Confirm (${selected.size})`}
          </Button>
        )}
      </div>
    </div>
  );
}
