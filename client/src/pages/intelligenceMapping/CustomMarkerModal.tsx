// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import {
  getMarkerDataUrl,
  getMarkerIconUrl,
  getMarkerIconLabel,
  MARKER_COLOURS,
  MARKER_COLOUR_LABELS,
  MARKER_ICON_LABELS,
  type MarkerColour,
} from "@/lib/markerSvgs";
import {
  TACTICAL_ICONS,
  TACTICAL_GROUPS,
  TACTICAL_ICONS_BY_GROUP,
  isTacticalIcon,
  type TacticalGroup,
} from "@/lib/tacticalMarkers";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {} from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X } from "lucide-react";
import { SURVEILLANCE_ICONS, TacticalIconGroupTiles } from "./MapControls";
import type { MapScreen } from "./useMapScreen";

/** the custom marker placement modal. */
export function CustomMarkerModal({ s }: { s: MapScreen }) {
  const {
    updateCustomMarkerMut,
    operations,
    pendingLatLng,
    setCmLabel,
    setCmIcon,
    setCmAddress,
    setCmNote,
    setCmRotation,
    setCmLabelOnly,
    setCmOpId,
    setPendingLatLng,
    vvKeyboardInset,
    vvVisibleHeight,
    setEditingMarkerId,
    editingMarkerId,
    cmLabel,
    cmAddress,
    cmNote,
    cmLabelOnly,
    setCmIconFilter,
    cmIconFilter,
    cmIcon,
    cmColour,
    setCmColour,
    cmRotation,
    cmOpId,
    cmSaving,
    setCmSaving,
    cmPersons,
    cmVehicles,
    createCustomMarkerMut,
  } = s;
  return (
    <>
      {/* ── Custom Marker Placement Modal ── */}
      {pendingLatLng && (
        <div
          // fixed, not absolute: this page's <main> (DashboardLayout) sits
          // below a header bar in a flex column and is overflow-hidden, so
          // an `absolute inset-0` here is both the wrong height (bounded
          // by <main>, not the true window) and has anything beyond that
          // bound silently clipped rather than merely mispositioned —
          // which is what made an earlier attempt at keyboard-avoidance
          // here render as "the popup isn't there at all" rather than
          // badly placed. `fixed` escapes both problems by positioning
          // against the real viewport directly, matching what
          // useVisualViewportInset's numbers are computed against. Just a
          // dimmed backdrop + click-to-close now — the sheet inside
          // positions itself (see below), not flex/padding tricks.
          className="fixed inset-0 z-40"
          style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => {
            setPendingLatLng(null);
            setEditingMarkerId(null);
          }}
        >
          <div
            className="fixed left-0 right-0 mx-auto w-full max-w-lg md:max-w-2xl lg:max-w-3xl bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 overflow-y-auto"
            style={{
              bottom: vvKeyboardInset,
              maxHeight: Math.round(vvVisibleHeight * 0.9),
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {editingMarkerId ? "Edit Map Marker" : "Place Map Marker"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}
                </p>
              </div>
              <button
                onClick={() => {
                  setPendingLatLng(null);
                  setEditingMarkerId(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 0. Label — shown at top for quick identification */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Label
              </label>
              <input
                type="text"
                value={cmLabel}
                onChange={e => setCmLabel(e.target.value)}
                placeholder="e.g. Target address, coffee shop..."
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* 0b. Address */}
            <div className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                Address
              </p>
              <input
                type="text"
                value={cmAddress}
                onChange={e => setCmAddress(e.target.value)}
                placeholder="Auto-filled from coordinates…"
                className="w-full text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* 0c. Notes — directly below address */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Notes
              </label>
              <Textarea
                value={cmNote}
                onChange={e => setCmNote(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* 0d. Label only — the marker renders as just its label pill
                  (same look as a shape's note label), no icon underneath.
                  Useful for a plain text callout rather than a
                  house/vehicle/POI icon. */}
            <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-[11px] font-semibold text-foreground">
                  Label Only
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Show just the label as a pill — no marker icon
                </p>
              </div>
              <Switch checked={cmLabelOnly} onCheckedChange={setCmLabelOnly} />
            </div>
            {cmLabelOnly && !cmLabel.trim() && (
              <p className="text-[10px] text-amber-500 -mt-3 mb-4">
                Enter a label above — a Label Only marker with no text has
                nothing to show on the map.
              </p>
            )}

            {/* 1. Icon picker — not shown for a Label Only marker, which
                  has no icon to pick. Flat tile grid within Surveillance
                  (no per-shape-type headings — with only a couple of icons
                  in each, the heading added nothing); a chip per
                  TACTICAL_GROUPS entry otherwise — the tactical library
                  grew from an 18-icon trial to the full ~413-icon traced
                  set (see lib/tacticalMarkers.ts), so one flat "Tactical"
                  tab stopped being usable. "All" shows every chip's icons
                  as its own labelled section rather than one wall of
                  tiles. The tile grid itself scrolls in a fixed-height box
                  so the rest of the dialog (colour, rotation, operation,
                  buttons) stays put. */}
            {!cmLabelOnly && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Marker Icon
                  </p>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {[
                      {
                        key: "all" as const,
                        label: `All (${SURVEILLANCE_ICONS.length + TACTICAL_ICONS.length})`,
                      },
                      {
                        key: "surveillance" as const,
                        label: `Surveillance (${SURVEILLANCE_ICONS.length})`,
                      },
                      ...TACTICAL_GROUPS.map(g => ({
                        key: g.key as "all" | "surveillance" | TacticalGroup,
                        label: `${g.label} (${TACTICAL_ICONS_BY_GROUP[g.key].length})`,
                      })),
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setCmIconFilter(f.key)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap transition-all ${
                          cmIconFilter === f.key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Desktop shows an icon's name on hover (the tile's own
                      title attribute) — there's no hover on a touchscreen,
                      so this is the only way a tapped icon's name is ever
                      shown there. Live, not just on tap: it's really "the
                      currently selected icon's name", which is already
                      correct the instant a tap lands. */}
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Selected:{" "}
                  <span className="font-semibold text-foreground">
                    {getMarkerIconLabel(cmIcon)}
                  </span>
                </p>

                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-accent/10 p-2">
                  <div className="grid grid-cols-6 md:grid-cols-9 lg:grid-cols-11 gap-1.5">
                    {(cmIconFilter === "all" ||
                      cmIconFilter === "surveillance") &&
                      SURVEILLANCE_ICONS.map(iconKey => (
                        <button
                          key={iconKey}
                          onClick={() => setCmIcon(iconKey)}
                          title={MARKER_ICON_LABELS[iconKey]}
                          className={`aspect-square rounded-lg border-2 flex items-center justify-center transition-all ${
                            cmIcon === iconKey
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          <img
                            src={getMarkerDataUrl(iconKey, cmColour)}
                            alt={MARKER_ICON_LABELS[iconKey]}
                            className="w-6 h-6 object-contain"
                          />
                        </button>
                      ))}

                    {TACTICAL_GROUPS.map(g => (
                      <TacticalIconGroupTiles
                        key={g.key}
                        group={g}
                        visible={
                          cmIconFilter === "all" || cmIconFilter === g.key
                        }
                        showHeading={cmIconFilter === "all"}
                        selectedKey={cmIcon}
                        onSelect={setCmIcon}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Colour picker — controls two different things depending
                  on context: it recolours a Surveillance icon shape, AND/OR
                  it sets the background of the label pill that renders
                  under ANY icon (tactical included) once a Label is typed
                  — see the labelText branch in the map-drawing effect
                  above. A Tactical icon's own artwork is fixed-colour and
                  never uses this, but if a Label is also set, the picker is
                  still very much live — it's just controlling the pill, not
                  the icon. Only truly hidden when neither applies: a
                  Tactical icon selected with no Label typed and Label Only
                  off, where nothing on screen would use a colour at all. */}
            {(() => {
              const iconIsTactical = !cmLabelOnly && isTacticalIcon(cmIcon);
              const labelPillShowing = cmLabelOnly || cmLabel.trim() !== "";
              if (iconIsTactical && !labelPillShowing) return null;
              return (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {cmLabelOnly || iconIsTactical ? "Label Colour" : "Colour"}
                  </p>
                  {iconIsTactical && (
                    <p className="text-[10px] text-muted-foreground mb-2">
                      This icon's own colour is fixed — it comes from the
                      Tactical library as-is. The colour below sets your label's
                      pill instead.
                    </p>
                  )}
                  <div className="flex gap-2">
                    {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(
                      col => (
                        <button
                          key={col}
                          onClick={() => setCmColour(col)}
                          title={MARKER_COLOUR_LABELS[col]}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            cmColour === col
                              ? "border-foreground scale-110"
                              : "border-transparent hover:border-foreground/40"
                          }`}
                          style={{ background: MARKER_COLOURS[col] }}
                        />
                      )
                    )}
                  </div>
                  {cmLabelOnly && (
                    <div className="mt-3">
                      <span
                        className="inline-flex items-center max-w-[200px] truncate rounded-full border-[1.5px] px-2.5 py-1 text-[11px] font-bold text-white shadow"
                        style={{
                          background: MARKER_COLOURS[cmColour],
                          borderColor: "rgba(255,255,255,0.7)",
                        }}
                      >
                        {cmLabel.trim() || "(no label)"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. Rotation — not applicable to a Label Only marker. */}
            {!cmLabelOnly && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Rotation — {cmRotation}°
                  </p>
                  {/* Rotated preview */}
                  <div className="shrink-0 flex items-center justify-center w-8 h-8">
                    <img
                      src={getMarkerIconUrl(cmIcon, cmColour)}
                      alt="preview"
                      className="object-contain transition-transform w-8 h-8"
                      style={{ transform: `rotate(${cmRotation}deg)` }}
                    />
                  </div>
                </div>
                {/* Slider — full width */}
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={cmRotation}
                  onChange={e => setCmRotation(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                {/* Quick preset buttons — equal-width tabs spanning the
                      same full width as the slider above. */}
                <div className="grid grid-cols-8 gap-1 mt-2">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                    <button
                      key={deg}
                      onClick={() => setCmRotation(deg)}
                      title={`${deg}°`}
                      className={`h-7 text-[9px] rounded border transition-all ${
                        cmRotation === deg
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      {deg === 0
                        ? "N"
                        : deg === 45
                          ? "NE"
                          : deg === 90
                            ? "E"
                            : deg === 135
                              ? "SE"
                              : deg === 180
                                ? "S"
                                : deg === 225
                                  ? "SW"
                                  : deg === 270
                                    ? "W"
                                    : "NW"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Operation — a marker saved with no operation is hidden
                  from any single/multi-operation-filtered map view (only
                  the "all operations" view shows it), so this needs to be
                  visible and correctable rather than a silent default. The
                  create flows below pre-fill this from the operation(s)
                  currently selected on the map, but that pre-fill can only
                  guess when exactly one operation is in view — with zero or
                  several selected it falls back to "no operation", which is
                  how a newly placed marker was disappearing from view. */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Operation
              </label>
              <Select
                value={cmOpId === null ? "none" : String(cmOpId)}
                onValueChange={v => setCmOpId(v === "none" ? null : Number(v))}
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
              {cmOpId === null && (
                <p className="text-[10px] text-amber-500 mt-1">
                  No operation selected — this marker will only appear in the
                  all-operations map view.
                </p>
              )}
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPendingLatLng(null);
                  setEditingMarkerId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={cmSaving || (cmLabelOnly && !cmLabel.trim())}
                onClick={async () => {
                  if (!pendingLatLng) return;
                  setCmSaving(true);
                  try {
                    if (editingMarkerId !== null) {
                      // Update existing marker
                      await updateCustomMarkerMut.mutateAsync({
                        id: editingMarkerId,
                        markerIcon: cmIcon,
                        markerColour: cmColour,
                        rotation: cmRotation,
                        labelOnly: cmLabelOnly,
                        label: cmLabel.trim() || null,
                        address: cmAddress.trim() || null,
                        note: cmNote.trim() || null,
                        operationId: cmOpId,
                        assocPersons: cmPersons,
                        assocVehicles: cmVehicles,
                      });
                      toast.success("Marker updated");
                    } else {
                      // Create new marker
                      await createCustomMarkerMut.mutateAsync({
                        lat: pendingLatLng.lat,
                        lng: pendingLatLng.lng,
                        markerIcon: cmIcon,
                        markerColour: cmColour,
                        rotation: cmRotation,
                        labelOnly: cmLabelOnly,
                        label: cmLabel.trim() || null,
                        address: cmAddress.trim() || null,
                        note: cmNote.trim() || null,
                        operationId: cmOpId,
                        assocPersons: cmPersons,
                        assocVehicles: cmVehicles,
                      });
                      toast.success("Marker placed");
                    }
                    setPendingLatLng(null);
                    setEditingMarkerId(null);
                    setCmRotation(0);
                    setCmLabelOnly(false);
                  } catch {
                    toast.error(
                      editingMarkerId !== null
                        ? "Failed to update marker"
                        : "Failed to save marker"
                    );
                  } finally {
                    setCmSaving(false);
                  }
                }}
              >
                {cmSaving ? (
                  <Spinner className="h-4 w-4" />
                ) : editingMarkerId !== null ? (
                  "Save Changes"
                ) : (
                  "Place Marker"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
