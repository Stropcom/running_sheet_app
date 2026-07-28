import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Check, ScanFace } from "lucide-react";
import { useMemo, useState } from "react";

interface Slot {
  key: string;
  operationId: number | null;
  attachmentId: number | null;
  photoUrl: string | null;
  faceIndex: number | null;
}

let slotSeq = 0;
function makeEmptySlot(): Slot {
  slotSeq += 1;
  return { key: `slot-${slotSeq}`, operationId: null, attachmentId: null, photoUrl: null, faceIndex: null };
}

const MAX_SLOTS = 6;

// One photo-picking + face-tapping cell — mirrors the Operation dropdown +
// photo grid from UploadImageDialog, and the tap-to-select face overlay
// from FaceSelectPicker, but simplified to single-select-one-face with no
// mutation at the end (this tool never writes anything, see CompareFacesDialog).
function CompareSlot({
  slot,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  slot: Slot;
  index: number;
  canRemove: boolean;
  onChange: (next: Slot) => void;
  onRemove: () => void;
}) {
  const { data: operations } = trpc.operation.list.useQuery();
  const { data: photos, isLoading: photosLoading } = trpc.attachment.listByOperation.useQuery(
    { operationId: slot.operationId ?? -1 },
    { enabled: slot.operationId != null }
  );
  const {
    data: faces,
    isLoading: facesLoading,
    isError: facesError,
  } = trpc.attachment.detectFaces.useQuery(
    { attachmentId: slot.attachmentId ?? -1 },
    { enabled: slot.attachmentId != null }
  );

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const boxStyles = useMemo(() => {
    if (!faces || !naturalSize) return [];
    return (faces as Array<{ index: number; bbox: [number, number, number, number] }>).map(f => {
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

  const noFacesDetected = facesError || (faces && faces.length === 0);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3 relative">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Photo {index + 1}
        </p>
        {canRemove && (
          <button
            onClick={onRemove}
            title="Remove this photo"
            className="h-5 w-5 rounded-full bg-muted hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {slot.attachmentId == null ? (
        <>
          <Select
            value={slot.operationId != null ? String(slot.operationId) : undefined}
            onValueChange={v => onChange({ ...slot, operationId: Number(v) })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select operation…" />
            </SelectTrigger>
            <SelectContent>
              {(operations as any[] | undefined ?? []).map(o => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {slot.operationId != null && (
            <div className="max-h-48 overflow-y-auto grid grid-cols-3 gap-1.5">
              {photosLoading ? (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-4">Loading…</p>
              ) : !photos || photos.length === 0 ? (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-4">No photos in this operation</p>
              ) : (
                (photos as any[]).map(p => (
                  <button
                    key={p.id}
                    onClick={() => onChange({ ...slot, attachmentId: p.id, photoUrl: p.url, faceIndex: null })}
                    className="aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-colors shrink-0"
                  >
                    <img src={p.url} alt="Photo" className="w-full h-full object-cover" />
                  </button>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {facesLoading
              ? "Scanning photo for faces…"
              : noFacesDetected
                ? "No faces detected in this photo."
                : slot.faceIndex != null
                  ? "Face selected."
                  : "Tap the face to compare."}
          </p>
          <div className="relative w-full rounded-lg overflow-hidden border border-border">
            <img
              src={slot.photoUrl ?? undefined}
              alt="Photo to compare"
              className="w-full block"
              onLoad={e => {
                const el = e.currentTarget;
                setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
              }}
            />
            {boxStyles.map(b => {
              const isSelected = slot.faceIndex === b.index;
              return (
                <button
                  key={b.index}
                  onClick={() => onChange({ ...slot, faceIndex: b.index })}
                  title={isSelected ? "Selected" : "Tap to select this face"}
                  className={`absolute border-2 rounded transition-colors ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/25"
                      : "border-amber-400 bg-amber-400/10 hover:bg-amber-400/25"
                  }`}
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...slot, attachmentId: null, photoUrl: null, faceIndex: null })}
          >
            Change photo
          </Button>
        </>
      )}
    </div>
  );
}

export function CompareFacesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(() => [makeEmptySlot(), makeEmptySlot()]);

  const readySlots = slots.filter(s => s.attachmentId != null && s.faceIndex != null);
  const allReady = readySlots.length === slots.length && slots.length >= 2;

  const { data: results, isFetching } = trpc.attachment.compareFaces.useQuery(
    { faces: readySlots.map(s => ({ attachmentId: s.attachmentId!, faceIndex: s.faceIndex! })) },
    { enabled: allReady }
  );

  const reset = () => {
    setSlots([makeEmptySlot(), makeEmptySlot()]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="h-5 w-5" />
            Compare Faces
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          Pick a photo and tap a face in each slot below — any operation. This
          only compares faces on request; nothing is saved or linked.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map((slot, idx) => (
            <CompareSlot
              key={slot.key}
              slot={slot}
              index={idx}
              canRemove={slots.length > 2}
              onChange={next => setSlots(prev => prev.map(s => (s.key === slot.key ? next : s)))}
              onRemove={() => setSlots(prev => prev.filter(s => s.key !== slot.key))}
            />
          ))}
        </div>

        {slots.length < MAX_SLOTS && (
          <Button
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => setSlots(prev => [...prev, makeEmptySlot()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add another photo
          </Button>
        )}

        {allReady && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Results
            </p>
            {isFetching ? (
              <p className="text-sm text-muted-foreground text-center py-4">Comparing…</p>
            ) : (
              (results ?? []).map((r, idx) => {
                const a = readySlots[r.aIndex];
                const b = readySlots[r.bIndex];
                return (
                  <div key={idx} className="flex items-center justify-center gap-4 py-2">
                    <img src={a.photoUrl ?? undefined} alt="Photo A" className="w-20 h-20 rounded-lg object-cover border border-border" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-muted-foreground text-lg">≈</span>
                      <span className={`text-sm font-semibold ${r.isPossibleMatch ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {Math.round(r.similarity * 100)}% similar
                      </span>
                      {r.isPossibleMatch && (
                        <span className="text-[10px] text-emerald-500">Possible match</span>
                      )}
                    </div>
                    <img src={b.photoUrl ?? undefined} alt="Photo B" className="w-20 h-20 rounded-lg object-cover border border-border" />
                  </div>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
