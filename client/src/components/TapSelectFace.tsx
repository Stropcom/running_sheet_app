import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { FaceMatchPreview } from "@/components/FaceMatchPreview";
import type { TriageChosen } from "@shared/faceMatchTriage";
import type { FaceMatchCandidate } from "@/components/PossibleMatchDialog";

export interface DetectedFaceBox {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
  /** 1 = strongest face in the photo, and whether it is among the strongest
   * few (shared/faceRank.ts). Absent for a caller that doesn't rank. */
  rank?: number;
  strong?: boolean;
}

/** The faces to draw: the strongest few, plus every other face once the
 * officer asks for them (and whichever one they have selected). Faces with no
 * ranking are all shown. */
export function visibleFaces<T extends DetectedFaceBox>(
  faces: T[],
  showAll: boolean,
  selected: ReadonlySet<number> | number | null
): T[] {
  const isSel = (i: number) =>
    typeof selected === "number"
      ? selected === i
      : selected instanceof Set
        ? selected.has(i)
        : false;
  return faces.filter(
    f => f.strong === undefined || f.strong || showAll || isSel(f.index)
  );
}

/**
 * Shows a photo with a tappable box over every detected face — the single
 * building block behind "tap the face first" everywhere a photo gets linked
 * to an entity (Upload Photo, and the Link photo to entity panel reached via
 * the amber pill on both the Images folder and the running sheet). Single-
 * select only for now: tapping a face selects it, tapping it again clears
 * the selection, tapping a different face moves the selection there.
 *
 * Detection itself is the caller's job (a photo not yet uploaded has no
 * attachmentId to detect from — see detectFacesFromBytes vs detectFaces) —
 * this component only ever renders whatever `faces` it's given.
 */
export function TapSelectFace({
  photoUrl,
  faces,
  loading,
  selectedIndex,
  onSelect,
  matches,
  matchesLoading,
  matchesError,
  matchAnswers,
  matchChosen,
  onMatchAnswer,
}: {
  photoUrl: string;
  faces: DetectedFaceBox[];
  loading?: boolean;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** Similar faces on file for the selected face — opened automatically in the
   * match pop-up when the caller supplies a lookup (matchesLoading / matchesError describe it). */
  matches?: FaceMatchCandidate[];
  matchesLoading?: boolean;
  matchesError?: boolean;
  /** Answers given so far for the selected face's matches, and where new ones go. */
  matchAnswers?: Record<number, "same" | "different">;
  /** Who the photo is being linked to, when picked (see faceMatchTriage). */
  matchChosen?: TriageChosen | null;
  onMatchAnswer?: (
    match: FaceMatchCandidate,
    answer: "same" | "different"
  ) => void;
}) {
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const extra = faces.filter(f => f.strong === false).length;
  const shown = useMemo(
    () => visibleFaces(faces, showAll, selectedIndex),
    [faces, showAll, selectedIndex]
  );

  const boxStyles = useMemo(() => {
    if (!naturalSize) return [];
    return shown.map(f => {
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
  }, [shown, naturalSize]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative w-full rounded-lg overflow-hidden border border-border">
        <img
          src={photoUrl}
          alt="Photo"
          className="w-full block"
          onLoad={e => {
            const el = e.currentTarget;
            setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
          }}
        />
        {boxStyles.map(b => {
          const isSelected = b.index === selectedIndex;
          return (
            <button
              key={b.index}
              type="button"
              onClick={() => onSelect(isSelected ? null : b.index)}
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
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="self-start text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          {showAll
            ? "Hide the other faces"
            : `Show ${extra} more face${extra === 1 ? "" : "s"}`}
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Scanning photo for faces…"
          : faces.length === 0
            ? "No faces detected automatically — you can still link this photo without picking one."
            : selectedIndex != null
              ? "Face selected — now pick who it is below."
              : extra > 0
                ? `Tap one of the ${faces.length - extra} strongest faces to select it, or show the other ${extra}.`
                : "Tap a face to select it, then pick who it is below."}
      </p>
      {selectedIndex != null &&
        (matchesLoading || matchesError || matches !== undefined) && (
          <FaceMatchPreview
            photoUrl={photoUrl}
            faceKey={selectedIndex}
            bbox={faces.find(f => f.index === selectedIndex)?.bbox}
            matches={matches}
            loading={matchesLoading}
            error={matchesError}
            answers={matchAnswers ?? {}}
            chosen={matchChosen ?? null}
            onAnswer={onMatchAnswer ?? (() => {})}
          />
        )}
    </div>
  );
}
