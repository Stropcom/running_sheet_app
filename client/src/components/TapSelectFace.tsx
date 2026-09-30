import { useMemo, useState } from "react";
import { Check } from "lucide-react";

export interface DetectedFaceBox {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
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
}: {
  photoUrl: string;
  faces: DetectedFaceBox[];
  loading?: boolean;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
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
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Scanning photo for faces…"
          : faces.length === 0
            ? "No faces detected automatically — you can still link this photo without picking one."
            : selectedIndex != null
              ? "Face selected — now pick who it is below."
              : "Tap a face to select it, then pick who it is below."}
      </p>
    </div>
  );
}
