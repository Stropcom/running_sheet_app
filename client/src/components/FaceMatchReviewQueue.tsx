import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, ScanFace, FileText, ImageUp } from "lucide-react";
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

/**
 * Steps through every detected face in a photo that got a possible-match
 * suggestion (one card at a time — the same accept/reject shape as the old
 * single-face SuggestedFaceMatchDialog), with the full photo shown above
 * each card and a box drawn over every detected face so which one the card
 * is actually talking about is never ambiguous: the face under review is
 * solid/highlighted, faces already handled are green, everything else is
 * dashed and labelled "not part of this check".
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
  const [pos, setPos] = useState(0);
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

  return (
    <Dialog open onOpenChange={o => !o && onDone()}>
      <DialogContent className="max-w-sm max-h-[92vh] overflow-y-auto">
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

        <p className="text-xs text-muted-foreground bg-sky-500/10 border border-border rounded-lg px-2.5 py-2 leading-relaxed">
          The highlighted box below is the face being compared — any other face
          in this photo is not part of this check.
        </p>

        <div className="relative w-full rounded-lg overflow-hidden border border-border">
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Uploaded photo"
            className="w-full block"
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
            const cls = isCurrent
              ? "border-primary bg-primary/20 shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
              : isHandled
                ? "border-emerald-500 bg-emerald-500/15"
                : "border-muted-foreground/50 bg-muted-foreground/10 border-dashed";
            return (
              <div
                key={b.index}
                className={`absolute border-2 rounded ${cls}`}
                style={{
                  left: b.left,
                  top: b.top,
                  width: b.width,
                  height: b.height,
                }}
              >
                <span
                  className={`absolute top-0.5 left-0.5 text-[7.5px] font-bold font-mono px-1 py-px rounded ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isHandled
                        ? "bg-background border border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "bg-background border border-muted-foreground/50 text-muted-foreground"
                  }`}
                >
                  {isCurrent
                    ? "Comparing now"
                    : isHandled
                      ? "Already linked"
                      : "Other face"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            {cropUrl ? (
              <img
                src={cropUrl}
                alt="Highlighted face, this photo"
                className="h-14 w-14 rounded-md object-cover border border-border"
              />
            ) : (
              <div className="h-14 w-14 rounded-md bg-muted border border-border" />
            )}
            <span className="text-[9.5px] text-muted-foreground text-center leading-tight">
              This photo
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <span className="font-mono font-bold text-primary text-base">
              {pct}%
            </span>
            <span className="text-[8px] uppercase tracking-wide text-muted-foreground">
              similar
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <img
              src={current.suggestion.photoUrl}
              alt={current.suggestion.entityLabel}
              className="h-14 w-14 rounded-md object-cover border border-dashed border-muted-foreground/60"
            />
            <span className="text-[10.5px] font-semibold text-center leading-tight break-words w-full">
              {current.suggestion.entityLabel}
            </span>
            <span className="text-[9px] text-muted-foreground text-center leading-tight">
              {CATEGORY_LABEL[current.suggestion.category] ??
                current.suggestion.category}
            </span>
            {current.suggestion.sourceSheetId ? (
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground break-words w-full justify-center">
                <FileText className="h-2.5 w-2.5 shrink-0" />
                <span className="break-words truncate">
                  {current.suggestion.sourceSheetTitle}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground break-words w-full justify-center">
                <ImageUp className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  {current.suggestion.sourceOperationName}
                </span>
              </span>
            )}
          </div>
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
