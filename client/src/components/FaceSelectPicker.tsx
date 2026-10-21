import { triageMatches } from "@shared/faceMatchTriage";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useMemo, useRef, useState } from "react";
import type { MouseEventHandler } from "react";
import { toast } from "sonner";
import { Check, User } from "lucide-react";
import {
  PossibleMatchDialog,
  type PendingMatch,
} from "@/components/PossibleMatchDialog";
import { visibleFaces, type DetectedFaceBox } from "@/components/TapSelectFace";

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
  // The face most recently tapped on — the one the "similar faces on file"
  // panel is about — and whether the faces beyond the strongest few are shown.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[] | null>(
    null
  );
  const imgRef = useRef<HTMLImageElement>(null);
  const utils = trpc.useUtils();
  // confirmPending only flips true once React commits the mutation's isPending
  // state — async relative to the click itself — so a fast double-tap (common
  // on the touchscreen devices this is used on) can fire twice before the
  // button disables, creating two confirmed entries for the same face. This
  // ref is set synchronously in the click handler to close that window.
  const submittingRef = useRef(false);

  const invalidateLinkViews = () => {
    utils.attachment.linksFor.invalidate({ attachmentId });
    utils.attachment.entityLinkCounts.invalidate();
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
  };

  const finishWithMatches = (matches: PendingMatch[]) => {
    invalidateLinkViews();
    if (matches.length > 0) setPendingMatches(matches);
    else onDone();
  };

  const confirmUnidentified =
    trpc.attachment.confirmUnidentifiedPersonFaces.useMutation({
      onSuccess: data => {
        toast.success(
          `Tagged ${data.results.length} Unidentified Person entr${data.results.length === 1 ? "y" : "ies"}`
        );
        finishWithMatches(
          data.results.flatMap(r =>
            r.matches.map(match => ({
              newLinkId: r.linkId,
              newPhotoUrl: photoUrl,
              match,
            }))
          )
        );
      },
      onError: e => {
        submittingRef.current = false;
        toast.error(e.message);
      },
    });

  const dismissSettled = trpc.attachment.dismissFaceMatch.useMutation();

  const confirmEntity = trpc.attachment.confirmEntityFace.useMutation({
    onSuccess: data => {
      toast.success("Photo linked");
      // The photo is confirmed as this person: their other photos, and
      // lower-scoring matches under another name, need no question
      // (shared/faceMatchTriage.ts).
      const chosen =
        props.mode === "entity"
          ? {
              category: props.category,
              targetId: props.targetId,
              entityLabel: props.entityLabel,
            }
          : null;
      const triage = triageMatches(data.matches, {}, chosen);
      for (const c of triage.dismiss) {
        dismissSettled.mutate({
          newLinkId: data.linkId,
          matchedLinkId: c.entityLinkId,
        });
      }
      const ask = new Set(triage.ask.map(c => c.entityLinkId));
      finishWithMatches(
        data.matches
          .filter(m => ask.has(m.entityLinkId))
          .map(match => ({
            newLinkId: data.linkId,
            newPhotoUrl: photoUrl,
            match,
          }))
      );
    },
    onError: e => {
      submittingRef.current = false;
      toast.error(e.message);
    },
  });

  const fallbackMutation = trpc.attachment.linkToEntity.useMutation({
    onSuccess: () => {
      toast.success(
        isEntityMode ? "Photo linked" : "Tagged as Unidentified Person"
      );
      invalidateLinkViews();
      onDone();
    },
    onError: e => {
      submittingRef.current = false;
      toast.error(e.message);
    },
  });

  const guardedSubmit =
    (fn: () => void): MouseEventHandler =>
    () => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      fn();
    };

  const toggle = (index: number) => {
    setFocusIndex(selected.has(index) ? null : index);
    setSelected(prev => {
      if (isEntityMode) return prev.has(index) ? new Set() : new Set([index]);
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const allFaces = (faces ?? []) as DetectedFaceBox[];
  const extraFaces = allFaces.filter(f => f.strong === false).length;

  const boxStyles = useMemo(() => {
    if (!faces || !naturalSize) return [];
    return visibleFaces(allFaces, showAll, selected).map(f => {
      const [x0, y0, x1, y1] = f.bbox;
      return {
        index: f.index,
        strong: f.strong !== false,
        rank: f.rank,
        left: `${(x0 / naturalSize.w) * 100}%`,
        top: `${(y0 / naturalSize.h) * 100}%`,
        width: `${((x1 - x0) / naturalSize.w) * 100}%`,
        height: `${((y1 - y0) / naturalSize.h) * 100}%`,
      };
    });
  }, [faces, naturalSize, showAll, selected]);

  const noFacesDetected = isError || (faces && faces.length === 0);
  const confirmPending =
    confirmUnidentified.isPending || confirmEntity.isPending;

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
                    : b.strong
                      ? "border-amber-400 bg-amber-400/10 hover:bg-amber-400/25"
                      : "border-dashed border-slate-400 bg-slate-400/10 hover:bg-slate-400/25"
                }`}
                style={{
                  left: b.left,
                  top: b.top,
                  width: b.width,
                  height: b.height,
                }}
              >
                {b.strong && b.rank != null && (
                  <span className="absolute -top-2 -left-2 h-5 min-w-5 px-1 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                    {b.rank}
                  </span>
                )}
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

      {!noFacesDetected && extraFaces > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="self-start text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          {showAll
            ? "Hide the other faces"
            : `Show ${extraFaces} more face${extraFaces === 1 ? "" : "s"}`}
        </button>
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
            onClick={guardedSubmit(() =>
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
                    entityLabel: `Unidentified Person #${attachmentId}`,
                  })
            )}
            className="gap-1.5"
          >
            <User className="h-3.5 w-3.5" />
            {isEntityMode
              ? "Link without a face"
              : "Tag as Unidentified Person"}
          </Button>
        ) : (
          <Button
            disabled={selected.size === 0 || confirmPending}
            onClick={guardedSubmit(() =>
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
            )}
          >
            {confirmPending
              ? "Linking…"
              : isEntityMode
                ? "Confirm"
                : `Confirm (${selected.size})`}
          </Button>
        )}
      </div>
    </div>
  );
}
