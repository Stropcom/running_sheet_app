// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { refreshTargetLocationTile } from "@/lib/targetLocationTile";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X } from "lucide-react";
import { SURVEILLANCE_ICONS, TacticalIconGroupTiles } from "./MapControls";
import type { MapScreen } from "./useMapScreen";

/** the Intelligence pin edit dialog. */
export function IntelPinEditDialog({ s }: { s: MapScreen }) {
  const {
    savePinOverrideMut,
    markersRef,
    editingIntelLabel,
    setEditingIntelLabel,
    intelEditLabel,
    setIntelEditLabel,
    intelEditNote,
    setIntelEditNote,
    setIntelEditIconFilter,
    intelEditIconFilter,
    intelEditIcon,
    setIntelEditIcon,
    intelEditColour,
    setIntelEditColour,
    intelEditRotation,
    setIntelEditRotation,
    intelPinImgRefs,
  } = s;
  return (
    <>
      {/* ── Intel Pin Edit Dialog ── */}
      {editingIntelLabel !== null && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setEditingIntelLabel(null)}
        >
          <div
            className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Edit Marker Appearance
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[260px]">
                  {editingIntelLabel}
                </p>
              </div>
              <button
                onClick={() => setEditingIntelLabel(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Label + Notes — same two fields the Place Map Marker
                  dialog has (see its own "0."/"0c." comments), added here
                  per direct request for parity between the two dialogs.
                  This pin's real name/address is already the subtitle
                  above; these are a free-text caption and a one-line note
                  an officer can add on top of that, same as a custom
                  marker's label/note. */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Label
              </label>
              <input
                type="text"
                value={intelEditLabel}
                onChange={e => setIntelEditLabel(e.target.value)}
                placeholder="Optional custom label..."
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Notes
              </label>
              <Textarea
                value={intelEditNote}
                onChange={e => setIntelEditNote(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Icon picker — same filter-chip + flat scrollable grid as
                  the Place Map Marker dialog (see its own comment for why:
                  no per-shape-type headings within Surveillance, a chip
                  per TACTICAL_GROUPS entry instead — the tactical library
                  grew from an 18-icon trial to the full ~413-icon traced
                  set, so "Tactical" alone is no longer a single flat tab;
                  "All" shows every chip's icons as its own labelled
                  section, in TACTICAL_GROUPS order, rather than one
                  undifferentiated wall of tiles). */}
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
                      onClick={() => setIntelEditIconFilter(f.key)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap transition-all ${
                        intelEditIconFilter === f.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* See the matching comment on the Place Map Marker
                    dialog's own copy of this line — no hover on a
                    touchscreen, so this is the only way a tapped icon's
                    name is ever shown there. */}
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Selected:{" "}
                <span className="font-semibold text-foreground">
                  {getMarkerIconLabel(intelEditIcon)}
                </span>
              </p>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-accent/10 p-2">
                <div className="grid grid-cols-6 md:grid-cols-9 lg:grid-cols-11 gap-1.5">
                  {(intelEditIconFilter === "all" ||
                    intelEditIconFilter === "surveillance") &&
                    SURVEILLANCE_ICONS.map(iconKey => (
                      <button
                        key={iconKey}
                        onClick={() => setIntelEditIcon(iconKey)}
                        title={MARKER_ICON_LABELS[iconKey]}
                        className={`aspect-square rounded-lg border-2 flex items-center justify-center transition-all ${
                          intelEditIcon === iconKey
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/50"
                        }`}
                      >
                        <img
                          src={getMarkerDataUrl(iconKey, intelEditColour)}
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
                        intelEditIconFilter === "all" ||
                        intelEditIconFilter === g.key
                      }
                      showHeading={intelEditIconFilter === "all"}
                      selectedKey={intelEditIcon}
                      onSelect={setIntelEditIcon}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Colour picker — a Tactical icon's artwork is fixed-colour,
                  and unlike a custom map marker, an intel pin has no label
                  pill either, so there's nothing left for this to control
                  once a Tactical icon is selected — hidden in that case
                  rather than shown with no visible effect. */}
            {!isTacticalIcon(intelEditIcon) && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Colour
                </p>
                <div className="flex gap-2">
                  {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(col => (
                    <button
                      key={col}
                      onClick={() => setIntelEditColour(col)}
                      title={MARKER_COLOUR_LABELS[col]}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        intelEditColour === col
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-foreground/40"
                      }`}
                      style={{ background: MARKER_COLOURS[col] }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Rotation */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Rotation — {intelEditRotation}°
              </p>
              <div className="flex items-center gap-3">
                <div className="shrink-0 flex items-center justify-center w-10 h-10">
                  <img
                    src={getMarkerIconUrl(intelEditIcon, intelEditColour)}
                    alt="preview"
                    className="object-contain transition-transform w-8 h-8"
                    style={{ transform: `rotate(${intelEditRotation}deg)` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={intelEditRotation}
                  onChange={e => setIntelEditRotation(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <div className="flex gap-1">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                    <button
                      key={deg}
                      onClick={() => setIntelEditRotation(deg)}
                      title={`${deg}°`}
                      className={`w-6 h-6 text-[9px] rounded border transition-all ${
                        intelEditRotation === deg
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
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingIntelLabel(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!editingIntelLabel) return;
                  // Persist server-side so it survives a redraw and shows
                  // up for every officer on every device, not just this one.
                  savePinOverrideMut.mutate({
                    label: editingIntelLabel,
                    markerIcon: intelEditIcon,
                    markerColour: intelEditColour,
                    rotation: intelEditRotation,
                    customLabel: intelEditLabel.trim(),
                    note: intelEditNote.trim(),
                  });
                  // Update the actual map marker element immediately —
                  // direct img ref first, querySelector fallback (see
                  // intelPinImgRefs declaration).
                  const directImg =
                    intelPinImgRefs.current.get(editingIntelLabel);
                  const img =
                    directImg ??
                    (() => {
                      const markerEntry = markersRef.current.find(
                        (m: any) => m.title === editingIntelLabel
                      );
                      return markerEntry?.content instanceof HTMLElement
                        ? (markerEntry.content.querySelector(
                            "img"
                          ) as HTMLImageElement | null)
                        : null;
                    })();
                  if (img) {
                    img.src = getMarkerIconUrl(intelEditIcon, intelEditColour);
                    img.style.width = "40px";
                    img.style.height = "40px";
                    img.style.transform = `rotate(${intelEditRotation}deg)`;
                    refreshTargetLocationTile(
                      img.parentElement,
                      intelEditColour as MarkerColour,
                      intelEditIcon,
                      intelEditRotation
                    );
                  }
                  setEditingIntelLabel(null);
                  toast.success("Marker appearance saved");
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
