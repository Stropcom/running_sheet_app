import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  FaceMatchReviewQueue,
  type FaceReviewItem,
  type FaceMatchCandidate,
} from "@/components/FaceMatchReviewQueue";

export interface StagedDetectedFace {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
  suggestion: FaceMatchCandidate | null;
}

export interface StagedFaceResult {
  /** Which detected face is this target/associate — null only if the
   * officer explicitly skipped picking one on a multi-face photo. */
  primaryFaceIndex: number | null;
  /** Set if the primary face was confirmed to also match an existing,
   * different entity already on file (a possible-duplicate heads-up). */
  primaryMatchedEntityLinkId: number | null;
  /** Every other detected face the officer chose to pool as a possible
   * match against an existing entity — faces with no suggestion, or ones
   * the officer skipped, are simply left alone (same as any other
   * undecided face — reachable later via the normal Link panel). */
  otherFaces: Array<{
    faceIndex: number;
    matchedEntityLinkId: number;
  }>;
}

// Runs once, immediately after a photo is picked in the Add Target/Add
// Associate form — before the target/associate itself exists, so nothing
// here writes to the database; it only records which face is the primary
// subject (auto-picked when there's exactly one face) and which faces, if
// any, look like an existing entity already on file. saveStagedImages
// (AddTargetDialog.tsx / TargetRegistry.tsx) turns this into real links
// once the target/associate is actually saved and an attachmentId exists.
//
// A single, unambiguous face is completely silent unless it also matches
// someone on file (same "shortcut, never required" rule as every other
// face-match check in the app) — no tap needed. 2+ faces require one tap
// to say which one is this target/associate (per how this was scoped),
// then offers pooling any of the *other* faces that match someone already
// on file as an additional cross-reference — the "multi-person pooling"
// counterpart to confirmUnidentifiedPersonFaces on the running sheet.
export function StagedPhotoFaceReview({
  photoUrl,
  faces,
  onComplete,
}: {
  photoUrl: string;
  faces: StagedDetectedFace[];
  onComplete: (result: StagedFaceResult) => void;
}) {
  const [primaryFaceIndex, setPrimaryFaceIndex] = useState<number | null>(
    faces.length === 1 ? faces[0].index : null
  );
  const [primaryPicked, setPrimaryPicked] = useState(faces.length <= 1);
  const [primaryMatchedEntityLinkId, setPrimaryMatchedEntityLinkId] = useState<
    number | null
  >(null);
  const [primaryMatchReviewed, setPrimaryMatchReviewed] = useState(false);
  const [otherFaces, setOtherFaces] = useState<StagedFaceResult["otherFaces"]>(
    []
  );
  const [othersReviewed, setOthersReviewed] = useState(false);

  const primaryFace = faces.find(f => f.index === primaryFaceIndex) ?? null;
  const otherDetected = useMemo(
    () => faces.filter(f => f.index !== primaryFaceIndex),
    [faces, primaryFaceIndex]
  );
  const otherQueue = useMemo(
    () =>
      otherDetected.filter(
        (f): f is StagedDetectedFace & { suggestion: FaceMatchCandidate } =>
          f.suggestion !== null
      ) as FaceReviewItem[],
    [otherDetected]
  );

  // Step 1 (only for 2+ faces): tap which face is the actual
  // target/associate. Skippable — a photo the officer just wants attached
  // without pinning a specific face is left with no primary pick at all,
  // same as an ordinary photo with no detected face.
  if (!primaryPicked) {
    const skip = () => {
      setPrimaryFaceIndex(null);
      setPrimaryPicked(true);
    };
    return (
      <Dialog open onOpenChange={o => !o && skip()}>
        <DialogContent className="max-w-sm max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Which face is this person?</DialogTitle>
          </DialogHeader>
          <PrimaryFacePickStep
            photoUrl={photoUrl}
            faces={faces}
            onPick={index => {
              setPrimaryFaceIndex(index);
              setPrimaryPicked(true);
            }}
            onSkip={skip}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2: if the picked primary face itself looks like someone already
  // on file, surface that once before moving on — the single-face
  // counterpart of the queue below.
  if (primaryFace?.suggestion && !primaryMatchReviewed) {
    return (
      <FaceMatchReviewQueue
        photoUrl={photoUrl}
        allFaces={faces}
        queue={[
          {
            index: primaryFace.index,
            bbox: primaryFace.bbox,
            confidence: primaryFace.confidence,
            suggestion: primaryFace.suggestion,
          },
        ]}
        onConfirm={async item => {
          setPrimaryMatchedEntityLinkId(item.suggestion.entityLinkId);
        }}
        onSkip={() => {}}
        onDone={() => setPrimaryMatchReviewed(true)}
      />
    );
  }

  // Step 3: any other detected face that matches someone on file can be
  // pooled as an additional cross-reference on this same photo.
  if (otherQueue.length > 0 && !othersReviewed) {
    return (
      <FaceMatchReviewQueue
        photoUrl={photoUrl}
        allFaces={faces}
        queue={otherQueue}
        alreadyHandled={
          primaryFaceIndex != null ? new Set([primaryFaceIndex]) : undefined
        }
        onConfirm={async item => {
          setOtherFaces(prev => [
            ...prev,
            {
              faceIndex: item.index,
              matchedEntityLinkId: item.suggestion.entityLinkId,
            },
          ]);
        }}
        onSkip={() => {}}
        onDone={() => setOthersReviewed(true)}
      />
    );
  }

  onComplete({ primaryFaceIndex, primaryMatchedEntityLinkId, otherFaces });
  return null;
}

function PrimaryFacePickStep({
  photoUrl,
  faces,
  onPick,
  onSkip,
}: {
  photoUrl: string;
  faces: StagedDetectedFace[];
  onPick: (index: number) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const boxStyles = useMemo(() => {
    if (!naturalSize) return [];
    return faces.map(f => {
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        This photo has {faces.length} faces in it. Tap the one that's actually
        this person.
      </p>

      <div className="relative w-full rounded-lg overflow-hidden border border-border">
        <img
          src={photoUrl}
          alt="Photo to tag"
          className="w-full block"
          onLoad={e => {
            const el = e.currentTarget;
            setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
          }}
        />
        {boxStyles.map(b => {
          const isSelected = selected === b.index;
          return (
            <button
              key={b.index}
              type="button"
              onClick={() => setSelected(b.index)}
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onSkip}>
          Skip — don't pick a face
        </Button>
        <Button
          disabled={selected === null}
          onClick={() => selected !== null && onPick(selected)}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}
