// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import {
  MARKER_COLOURS,
  MARKER_COLOUR_LABELS,
  type MarkerColour,
} from "@/lib/markerSvgs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { X } from "lucide-react";
import { DEFAULT_SHAPE_RADIUS_M, SHAPE_TYPE_LABELS } from "./shapes";
import type { MapScreen } from "./useMapScreen";

/** the shape placement / edit panel. */
export function ShapePlacementPanel({ s }: { s: MapScreen }) {
  const {
    operations,
    setPendingShape,
    pendingShape,
    shapeLabel,
    setShapeLabel,
    setShapeColour,
    shapeColour,
    shapeOpacity,
    setShapeOpacity,
    shapeLineDashed,
    setShapeLineDashed,
    shapeLineArrowEnd,
    setShapeLineArrowEnd,
    shapeOpId,
    setShapeOpId,
    shapeSaving,
    setShapeSaving,
    deleteMapShapeMut,
    updateMapShapeMut,
    createMapShapeMut,
  } = s;
  return (
    <>
      {/* ── Shape Placement / Edit Panel ──
            Deliberately NOT a blocking modal (no full-screen backdrop) —
            unlike the custom-marker placement panel, which just edits
            fields for a marker already fixed at the tapped point, a shape
            has to stay draggable/resizable ON THE MAP while this is open
            (the draft overlay effect above made it editable). A full
            backdrop would sit on top of the map and swallow every drag
            before it ever reached the shape — see movingMarkerId's own
            banner below for the same pointer-events-none wrapper /
            pointer-events-auto card pattern already used for exactly this
            "map must stay interactive underneath" situation. */}
      {pendingShape && (
        <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 max-h-[55vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {pendingShape.id ? "Edit Shape" : "Place Shape"} —{" "}
                  {SHAPE_TYPE_LABELS[pendingShape.shapeType]}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {pendingShape.shapeType === "circle" ||
                  pendingShape.shapeType === "sector"
                    ? "Drag the shape to move it, or drag its edge to resize."
                    : pendingShape.shapeType === "rectangle"
                      ? "Drag a corner to resize, or drag the shape to move it."
                      : "Drag any point to reshape the line."}
                </p>
              </div>
              <button
                onClick={() => setPendingShape(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Label */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Label (optional)
              </label>
              <input
                type="text"
                value={shapeLabel}
                onChange={e => setShapeLabel(e.target.value)}
                placeholder="e.g. Search area, No-go zone, Line of sight…"
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Colour picker */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Colour
              </p>
              <div className="flex gap-2">
                {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(col => (
                  <button
                    key={col}
                    onClick={() => setShapeColour(col)}
                    title={MARKER_COLOUR_LABELS[col]}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      shapeColour === col
                        ? "border-foreground scale-110"
                        : "border-transparent hover:border-foreground/40"
                    }`}
                    style={{ background: MARKER_COLOURS[col] }}
                  />
                ))}
              </div>
            </div>

            {/* Opacity */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {pendingShape.shapeType === "line"
                  ? "Line opacity"
                  : "Fill opacity"}{" "}
                — {shapeOpacity}%
              </p>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={shapeOpacity}
                onChange={e => setShapeOpacity(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Line-only: dashed stroke, and an arrowhead at the last
                  point to show a direction of travel. */}
            {pendingShape.shapeType === "line" && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-foreground">
                    Dashed
                  </p>
                  <Switch
                    checked={shapeLineDashed}
                    onCheckedChange={setShapeLineDashed}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">
                      Arrow at end
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Shows a direction of travel
                    </p>
                  </div>
                  <Switch
                    checked={shapeLineArrowEnd}
                    onCheckedChange={setShapeLineArrowEnd}
                  />
                </div>
              </div>
            )}

            {/* Sector-only: radius + angle sliders (the shape isn't
                  freely draggable-edge like circle/rectangle, so these are
                  its only resize controls). */}
            {pendingShape.shapeType === "sector" && (
              <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Radius — {Math.round(pendingShape.radiusMeters ?? 0)}m
                  </p>
                  <input
                    type="range"
                    min={20}
                    max={3000}
                    step={10}
                    value={pendingShape.radiusMeters ?? DEFAULT_SHAPE_RADIUS_M}
                    onChange={e => {
                      const nextRadius = Number(e.target.value);
                      setPendingShape(p =>
                        p
                          ? {
                              ...p,
                              radiusMeters: nextRadius,
                              // An inner radius can never exceed the outer
                              // one — clamp it down if the officer shrinks
                              // the outer radius past it, rather than
                              // leaving an invalid/inverted ring band.
                              innerRadiusMeters: Math.min(
                                p.innerRadiusMeters ?? 0,
                                nextRadius
                              ),
                            }
                          : p
                      );
                    }}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Inner radius —{" "}
                    {Math.round(pendingShape.innerRadiusMeters ?? 0)}m
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-1">
                    0 draws a full wedge to the center point; anything higher
                    cuts the tip off into an arc band.
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(
                      20,
                      Math.round(
                        pendingShape.radiusMeters ?? DEFAULT_SHAPE_RADIUS_M
                      )
                    )}
                    step={10}
                    value={pendingShape.innerRadiusMeters ?? 0}
                    onChange={e =>
                      setPendingShape(p =>
                        p
                          ? {
                              ...p,
                              innerRadiusMeters: Number(e.target.value),
                            }
                          : p
                      )
                    }
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Start angle — {Math.round(pendingShape.startAngle ?? 0)}°
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={pendingShape.startAngle ?? 0}
                    onChange={e =>
                      setPendingShape(p =>
                        p ? { ...p, startAngle: Number(e.target.value) } : p
                      )
                    }
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    End angle — {Math.round(pendingShape.endAngle ?? 90)}°
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={pendingShape.endAngle ?? 90}
                    onChange={e =>
                      setPendingShape(p =>
                        p ? { ...p, endAngle: Number(e.target.value) } : p
                      )
                    }
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            )}

            {/* Rectangle-only: rotation. Position/size still come from
                  dragging the shape's corners/edges in its own unrotated
                  frame (see the rectangle branch of the draft-overlay
                  effect) — this slider spins the visible shape around its
                  center independently of that, same pattern as the sector
                  sliders just above. */}
            {pendingShape.shapeType === "rectangle" && (
              <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Rotation — {Math.round(pendingShape.rotation ?? 0)}°
                </p>
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={pendingShape.rotation ?? 0}
                  onChange={e =>
                    setPendingShape(p =>
                      p ? { ...p, rotation: Number(e.target.value) } : p
                    )
                  }
                  className="w-full accent-primary"
                />
              </div>
            )}

            {/* Operation — a shape saved with no operation is hidden from
                  any single/multi-operation-filtered map view (only the
                  "all operations" view shows it), same trap this fix closed
                  for custom markers — see the Operation picker in the
                  marker panel further down for the full explanation. */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Operation
              </label>
              <Select
                value={shapeOpId === null ? "none" : String(shapeOpId)}
                onValueChange={v =>
                  setShapeOpId(v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="No operation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No operation</SelectItem>
                  {(operations as any[] | undefined)?.map(op => (
                    <SelectItem key={op.id} value={String(op.id)}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shapeOpId === null && (
                <p className="text-[10px] text-amber-500 mt-1">
                  No operation selected — this shape will only appear in the
                  all-operations map view.
                </p>
              )}
            </div>

            {/* Save / Cancel / Delete */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPendingShape(null)}
              >
                Cancel
              </Button>
              {pendingShape.id !== null && (
                <Button
                  variant="destructive"
                  disabled={shapeSaving}
                  onClick={async () => {
                    if (pendingShape.id === null) return;
                    setShapeSaving(true);
                    try {
                      await deleteMapShapeMut.mutateAsync({
                        id: pendingShape.id,
                      });
                      toast.success("Shape deleted");
                      setPendingShape(null);
                    } catch {
                      toast.error("Couldn't delete shape");
                    } finally {
                      setShapeSaving(false);
                    }
                  }}
                >
                  Delete
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={shapeSaving}
                onClick={async () => {
                  setShapeSaving(true);
                  try {
                    const common = {
                      colour: shapeColour,
                      opacity: shapeOpacity,
                      label: shapeLabel.trim() || null,
                      operationId: shapeOpId,
                      centerLat: pendingShape.centerLat ?? null,
                      centerLng: pendingShape.centerLng ?? null,
                      radiusMeters: pendingShape.radiusMeters ?? null,
                      startAngle: pendingShape.startAngle ?? null,
                      endAngle: pendingShape.endAngle ?? null,
                      innerRadiusMeters: pendingShape.innerRadiusMeters ?? null,
                      neLat: pendingShape.neLat ?? null,
                      neLng: pendingShape.neLng ?? null,
                      swLat: pendingShape.swLat ?? null,
                      swLng: pendingShape.swLng ?? null,
                      rotation: pendingShape.rotation ?? 0,
                      points: pendingShape.points ?? [],
                      lineDashed: shapeLineDashed,
                      lineArrowEnd: shapeLineArrowEnd,
                    };
                    if (pendingShape.id !== null) {
                      await updateMapShapeMut.mutateAsync({
                        id: pendingShape.id,
                        ...common,
                      });
                      toast.success("Shape updated");
                    } else {
                      await createMapShapeMut.mutateAsync({
                        shapeType: pendingShape.shapeType,
                        ...common,
                      });
                      toast.success("Shape placed");
                    }
                    setPendingShape(null);
                  } catch {
                    toast.error("Couldn't save shape");
                  } finally {
                    setShapeSaving(false);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
