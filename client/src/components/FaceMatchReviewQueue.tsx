import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  ScanFace,
  FileText,
  ImageUp,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { FaceMatchCandidate } from "@/components/PossibleMatchDialog";

export type { FaceMatchCandidate };

export interface FaceReviewItem {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
  suggestion: FaceMatchCandidate;
}

const CATEGORY_LABEL: Record<string, string> = {
  target: "Target",
  associate: "Associate",
  unidentified_person: "Unidentified Person",
};

// Same zoom steps as PossibleMatchDialog (the existing compare tool this
// mirrors) — see that file's own comment for why each step sets a
// percentage column width plus a matching sm:max-w on the dialog itself
// rather than a fixed px size.
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
    dialogClass: "max-w-sm sm:max-w-sm",
  },
  {
    label: "Medium",
    colClass: "w-[34%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "w-[80vw] max-w-[80vw] sm:max-w-[80vw]",
  },
  {
    label: "Large",
    colClass: "w-[40%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "w-[90vw] max-w-[90vw] sm:max-w-[90vw]",
  },
  {
    label: "X-Large",
    colClass: "w-[44%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "w-[95vw] max-w-[95vw] sm:max-w-[95vw]",
  },
  {
    label: "Maximum",
    colClass: "w-[48%]",
    imgFit: "object-contain bg-muted",
    dialogClass: "w-[99vw] max-w-[99vw] sm:max-w-[99vw]",
  },
];
const MAX_ZOOM_INDEX = ZOOM_STEPS.length - 1;

/**
 * Steps through every detected face in a photo that got a possible-match
 * suggestion (one card at a time — the same accept/reject shape as the old
 * single-face SuggestedFaceMatchDialog), with the full photo shown above
 * each card and a box drawn over every detected face so which one the card
 * is actually talking about is never ambiguous: a plain colour tells the
 * story — green for the face under review, amber for every other
 * detected face — with no label text sitting on top of anyone's face.
 * The compare row below reuses the same zoom control as the app's
 * existing PossibleMatchDialog so the two photos can be sized up for a
 * closer look, not just the small default thumbnails.
 *
 * `allFaces` is every detected face (for drawing every box); `queue` is the
 * subset that actually got a suggestion (what gets stepped through) —
 * queue items not in allFaces would be a caller bug, so allFaces should
 * always be a superset. `alreadyHandled` marks faces resolved before this
 * component mounted (e.g. a primary face already picked elsewhere).
 */
export function FaceMatchReviewQueue({
  photoUrl,
  allFaces,
  queue,
  alreadyHandled,
  onConfirm,
  onSkip,
  onDone,
}: {
  photoUrl: string;
  allFaces: Array<{ index: number; bbox: [number, number, number, number] }>;
  queue: FaceReviewItem[];
  alreadyHandled?: Set<number>;
  onConfirm: (item: FaceReviewItem) => Promise<void>;
  onSkip: (item: FaceReviewItem) => void;
  onDone: () => void;
}) {
  const [, setLocation] = useLocation();
  const [pos, setPos] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [handledInSession, setHandledInSession] = useState<Set<number>>(
    new Set()
  );

  const current = queue[pos];

  const boxStyles = useMemo(() => {
    if (!naturalSize) return [];
    return allFaces.map(f => {
      const [x0, y0, x1, y1] = f.bbox;
      return {
        index: f.index,
        left: `${(x0 / naturalSize.w) * 100}%`,
        top: `${(y0 / naturalSize.h) * 100}%`,
        width: `${((x1 - x0) / naturalSize.w) * 100}%`,
        height: `${((y1 - y0) / naturalSize.h) * 100}%`,
      };
    });
  }, [allFaces, naturalSize]);

  const cropDataUrl = (
    img: HTMLImageElement,
    bbox: [number, number, number, number]
  ): string | null => {
    try {
      const [x0, y0, x1, y1] = bbox;
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
      return null;
    }
  };

  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // The <img> only fires onLoad once (src never changes across the whole
  // queue — it's the same photo for every face) — recompute the crop from
  // the already-loaded element whenever the queue advances to a new face.
  useEffect(() => {
    if (!naturalSize || !imgRef.current || !current) return;
    setCropUrl(cropDataUrl(imgRef.current, current.bbox));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize, current?.index]);

  if (!current) return null;

  const advance = () => {
    setPending(false);
    setCropUrl(null);
    setZoomIndex(0);
    if (pos + 1 >= queue.length) onDone();
    else setPos(pos + 1);
  };

  const handleSkip = () => {
    onSkip(current);
    advance();
  };

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm(current);
      setHandledInSession(prev => new Set(prev).add(current.index));
      advance();
    } catch {
      setPending(false);
    }
  };

  const pct = Math.round(current.suggestion.similarity * 100);
  const zoom = ZOOM_STEPS[zoomIndex];

  return (
    <Dialog open onOpenChange={o => !o && onDone()}>
      <DialogContent
        className={`${zoom.dialogClass} max-h-[92vh] overflow-y-auto`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="flex items-center gap-2">
              <ScanFace className="h-4 w-4 text-primary" />
              Possible match found
            </span>
            {queue.length > 1 && (
              <span className="text-[10.5px] font-mono font-normal text-muted-foreground rounded-full border border-border bg-muted/40 px-2 py-0.5">
                {pos + 1} of {queue.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground bg-sky-500/10 border border-border rounded-lg px-2.5 py-2 leading-relaxed flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border-2 border-emerald-500 shrink-0" />
            Face being compared
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border-2 border-amber-500 shrink-0" />
            Other face — not part of this check
          </span>
        </p>

        <div className="relative w-full">
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Uploaded photo"
            className="w-full block rounded-lg border border-border"
            onLoad={e => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
              setCropUrl(cropDataUrl(el, current.bbox));
            }}
          />
          {boxStyles.map(b => {
            const isCurrent = b.index === current.index;
            const isHandled =
              handledInSession.has(b.index) || alreadyHandled?.has(b.index);
            const cls =
              isCurrent || isHandled
                ? "border-emerald-500"
                : "border-amber-500";
            return (
              <div
                key={b.index}
                className={`absolute border-[3px] rounded ${cls}`}
                style={{
                  left: b.left,
                  top: b.top,
                  width: b.width,
                  height: b.height,
                }}
              >
                {isHandled && !isCurrent && (
                  <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            );
          })}
        </div>

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
            {cropUrl ? (
              <img
                src={cropUrl}
                alt="Highlighted face, this photo"
                className={`w-full aspect-square rounded-lg border border-border transition-all ${zoom.imgFit}`}
              />
            ) : (
              <div className="w-full aspect-square rounded-lg border border-border bg-muted" />
            )}
            <span className="text-xs text-muted-foreground">This photo</span>
          </div>
          <div className="text-muted-foreground text-lg shrink-0 self-center">
            ≈
          </div>
          <div
            className={`flex flex-col items-center gap-1.5 shrink-0 ${zoom.colClass}`}
          >
            <img
              src={current.suggestion.photoUrl}
              alt={current.suggestion.entityLabel}
              className={`w-full aspect-square rounded-lg border border-border transition-all ${zoom.imgFit}`}
            />
            <span className="text-xs text-muted-foreground text-center break-words w-full">
              {current.suggestion.entityLabel}
            </span>
            {current.suggestion.sourceSheetId ? (
              <button
                type="button"
                onClick={() =>
                  setLocation(`/sheet/${current.suggestion.sourceSheetId}`)
                }
                title={`Open ${current.suggestion.sourceSheetTitle} — ${current.suggestion.sourceOperationName}, to see other photos there`}
                className="flex items-center gap-1 text-[10px] text-primary underline underline-offset-2 break-words w-full justify-center"
              >
                <FileText className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words">
                  {current.suggestion.sourceSheetTitle}
                </span>
              </button>
            ) : (
              <span
                title="Uploaded directly to this operation's Images folder — not attached to a running sheet row"
                className="flex items-center gap-1 text-[10px] text-muted-foreground break-words w-full justify-center"
              >
                <ImageUp className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words">
                  {current.suggestion.sourceOperationName}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {CATEGORY_LABEL[current.suggestion.category] ??
            current.suggestion.category}
          <span className="text-muted-foreground/60">·</span>
          {pct}% similar
        </div>

        <div className="flex justify-center gap-2 pt-1">
          <Button
            variant="outline"
            disabled={pending}
            onClick={handleSkip}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Not a match
          </Button>
          <Button
            disabled={pending}
            onClick={handleConfirm}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            {pending ? "Linking…" : "Confirm match"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
