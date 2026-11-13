// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { MapHeatOverlay } from "@/components/MapHeatOverlay";
import {
  TargetPredictorOverlay,
  TargetPredictorPinPopup,
} from "@/components/TargetPredictor";
import {
  MapPin,
  X,
  Check,
  FolderSearch,
  ClipboardList,
  Navigation2,
  Shapes,
  Circle as CircleIcon,
  Square,
  PieChart,
  Route,
} from "lucide-react";
import { poiAddressOf } from "./addressMatch";
import {
  ALL_QUICK_LINK_OPTIONS,
  ICON_MAP,
  LS_QUICK_LINKS_KEY,
  type QuickLink,
} from "./quickLinks";
import { SHAPE_TYPE_LABELS } from "./shapes";
import type { MapScreen } from "./useMapScreen";

/** the Search and Heat Map layers, Quick-Link editor, POI tap sheet, action chooser, shape picker and line-drawing indicator. */
export function MapPopups({ s }: { s: MapScreen }) {
  const {
    mapRef,
    setActionChooser,
    flyView,
    closeFly,
    flyCenterRef,
    mapReady,
    heatOn,
    isInvestigator,
    predictor,
    activeMapOperationId,
    heatTransparency,
    heatError,
    heatLocations,
    editingQuickLinks,
    setEditingQuickLinks,
    quickLinks,
    setQuickLinks,
    poiTap,
    pendingLatLng,
    mapQeOpen,
    actionChooser,
    setPoiTap,
    setMapQeAddress,
    setMapQeLatLng,
    mapQePoiPosRef,
    mapQePoiSignRef,
    setMapQeOpen,
    setCmLabel,
    setCmIcon,
    setCmAddress,
    setCmNote,
    setCmPersons,
    setCmVehicles,
    setCmRotation,
    setCmLabelOnly,
    setCmPersonInput,
    setCmVehicleInput,
    setCmOpId,
    setPendingLatLng,
    setShapeTypePicker,
    shapeTypePicker,
    beginCreateShape,
    drawingLine,
    setPendingShape,
    setDrawingLine,
  } = s;
  return (
    <>
      {/* Search rings and pin — adds a layer to the map, draws nothing itself. */}
      <TargetPredictorOverlay
        p={predictor}
        map={mapReady && !isInvestigator ? mapRef.current : null}
      />
      {/* The popup that opens when the red last-seen diamond is tapped. */}
      <TargetPredictorPinPopup p={predictor} />

      {/* Heat Map overlay — draws nothing itself, it adds a layer to the map. */}
      <MapHeatOverlay
        map={mapReady && heatOn && !isInvestigator ? mapRef.current : null}
        locations={heatOn && !heatError ? (heatLocations ?? []) : []}
        strength={1 - heatTransparency / 100}
      />

      {/* ── Quick-Link Editor Modal ── */}
      {editingQuickLinks && (
        <div
          className="absolute inset-0 z-30 flex items-end justify-center"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setEditingQuickLinks(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Customise Quick Links
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose up to 3 custom shortcut folders (laptop: 3, tablet: 2,
                  mobile: 1)
                </p>
              </div>
              <button
                onClick={() => setEditingQuickLinks(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {ALL_QUICK_LINK_OPTIONS.map(opt => {
                const isSelected = quickLinks.some(q => q.path === opt.path);
                const iconEntry = ICON_MAP[opt.icon];
                const IconComp = iconEntry?.Icon ?? FolderSearch;
                const iconColour = iconEntry?.colour ?? "text-muted-foreground";
                return (
                  <button
                    key={opt.path}
                    onClick={() => {
                      setQuickLinks(prev => {
                        let next: QuickLink[];
                        if (isSelected) {
                          next = prev.filter(q => q.path !== opt.path);
                        } else if (prev.length < 3) {
                          next = [...prev, opt];
                        } else {
                          // Replace last slot
                          next = [...prev.slice(0, 2), opt];
                        }
                        localStorage.setItem(
                          LS_QUICK_LINKS_KEY,
                          JSON.stringify(next)
                        );
                        return next;
                      });
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      isSelected
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-accent/30 border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    }`}
                  >
                    <IconComp
                      className={`h-3.5 w-3.5 flex-shrink-0 ${iconColour}`}
                    />
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 ml-auto flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              {quickLinks.length}/2 slots used — Operations and active sheet are
              always shown
            </p>
          </div>
        </div>
      )}

      {/* ── POI Tap Bottom Sheet ── */}
      {poiTap && !pendingLatLng && !mapQeOpen && !actionChooser && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setPoiTap(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                  {poiTap.transit?.kind === "bus"
                    ? "Bus Stop"
                    : poiTap.transit?.kind === "train"
                      ? "Train Station"
                      : "Business / Place"}
                </p>
                <p className="text-sm font-bold text-foreground leading-snug">
                  {poiTap.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {poiTap.address}
                </p>
              </div>
              <button
                onClick={() => setPoiTap(null)}
                className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* RS Quick Entry */}
              <button
                onClick={() => {
                  setMapQeAddress(poiAddressOf(poiTap));
                  setMapQeLatLng({ lat: poiTap.lat, lng: poiTap.lng });
                  mapQePoiPosRef.current = {
                    lat: poiTap.lat,
                    lng: poiTap.lng,
                  };
                  mapQePoiSignRef.current = poiTap.placeSign ?? null;
                  setMapQeOpen(true);
                  setPoiTap(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all px-4 py-5"
              >
                <ClipboardList className="h-7 w-7 text-primary" />
                <span className="text-sm font-bold text-foreground">
                  RS Quick Entry
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  Add a running sheet entry for this location
                </span>
              </button>
              {/* Add Marker Here */}
              <button
                onClick={() => {
                  const rsAddress = poiAddressOf(poiTap);
                  setCmLabel(poiTap.name);
                  // A tapped bus stop or train station is its own sign.
                  if (poiTap.transit)
                    setCmIcon(
                      poiTap.transit.kind === "bus"
                        ? "bus_stop"
                        : "train_station"
                    );
                  else if (poiTap.placeSign) setCmIcon(poiTap.placeSign);
                  setCmAddress(rsAddress);
                  setCmNote("");
                  setCmPersons([]);
                  setCmVehicles([]);
                  setCmRotation(0);
                  setCmLabelOnly(false);
                  setCmPersonInput("");
                  setCmVehicleInput("");
                  setCmOpId(activeMapOperationId);
                  setPendingLatLng({ lat: poiTap.lat, lng: poiTap.lng });
                  setPoiTap(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
              >
                <MapPin className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">
                  Add Marker Here
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  Place a custom marker at this business
                </span>
              </button>
            </div>
            {/* Add Shape Here — full-width below the grid */}
            <button
              onClick={() => {
                setShapeTypePicker({ lat: poiTap.lat, lng: poiTap.lng });
                setPoiTap(null);
              }}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-3"
            >
              <Shapes className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">
                Add Shape Here
              </span>
            </button>
            {/* Navigate with Waze — full-width below the grid */}
            <a
              href={`https://waze.com/ul?ll=${poiTap?.lat},${poiTap?.lng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setPoiTap(null)}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-95 transition-all px-4 py-3"
            >
              <Navigation2 className="h-5 w-5 text-cyan-400" />
              <span className="text-sm font-bold text-foreground">
                Navigate with Waze
              </span>
            </a>
          </div>
        </div>
      )}

      {/* ── Action Chooser Bottom Sheet ── */}
      {actionChooser && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setActionChooser(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Map Location
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {actionChooser.address}
                </p>
              </div>
              <button
                onClick={() => setActionChooser(null)}
                className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* RS Quick Entry */}
              <button
                onClick={() => {
                  setMapQeAddress(actionChooser.address);
                  setMapQeLatLng({
                    lat: actionChooser.lat,
                    lng: actionChooser.lng,
                  });
                  setMapQeOpen(true);
                  setActionChooser(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all px-4 py-5"
              >
                <ClipboardList className="h-7 w-7 text-primary" />
                <span className="text-sm font-bold text-foreground">
                  RS Quick Entry
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  Add a running sheet entry for this location
                </span>
              </button>
              {/* Add Marker Here */}
              <button
                onClick={() => {
                  setCmLabel("");
                  setCmAddress(actionChooser.address);
                  setCmNote("");
                  setCmPersons([]);
                  setCmVehicles([]);
                  setCmRotation(0);
                  setCmLabelOnly(false);
                  setCmPersonInput("");
                  setCmVehicleInput("");
                  setCmOpId(activeMapOperationId);
                  setPendingLatLng({
                    lat: actionChooser.lat,
                    lng: actionChooser.lng,
                  });
                  setActionChooser(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
              >
                <MapPin className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">
                  Add Marker Here
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  Place a custom marker at this location
                </span>
              </button>
            </div>
            {/* Add Shape Here — full-width below the grid */}
            <button
              onClick={() => {
                // Shapes are drawn and edited on the flat map, so Fly steps
                // back to it, centred on this spot, first.
                if (flyView) {
                  flyCenterRef.current = {
                    lat: actionChooser.lat,
                    lng: actionChooser.lng,
                  };
                  mapRef.current?.setZoom(17);
                  closeFly();
                }
                setShapeTypePicker({
                  lat: actionChooser.lat,
                  lng: actionChooser.lng,
                });
                setActionChooser(null);
              }}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-3"
            >
              <Shapes className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">
                Add Shape Here
              </span>
            </button>
            {/* Navigate with Waze — full-width below the grid */}
            <a
              href={`https://waze.com/ul?ll=${actionChooser.lat},${actionChooser.lng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setActionChooser(null)}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-95 transition-all px-4 py-3"
            >
              <Navigation2 className="h-5 w-5 text-cyan-400" />
              <span className="text-sm font-bold text-foreground">
                Navigate with Waze
              </span>
            </a>
          </div>
        </div>
      )}

      {/* ── Shape Type Picker ── */}
      {shapeTypePicker && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setShapeTypePicker(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Add Shape
                </p>
                <p className="text-sm font-semibold text-foreground">
                  Choose a shape
                </p>
              </div>
              <button
                onClick={() => setShapeTypePicker(null)}
                className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { type: "circle" as const, Icon: CircleIcon },
                  { type: "rectangle" as const, Icon: Square },
                  { type: "sector" as const, Icon: PieChart },
                  { type: "line" as const, Icon: Route },
                ] as const
              ).map(({ type, Icon }) => (
                <button
                  key={type}
                  onClick={() => {
                    beginCreateShape(
                      type,
                      shapeTypePicker.lat,
                      shapeTypePicker.lng
                    );
                    setShapeTypePicker(null);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
                >
                  <Icon className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">
                    {SHAPE_TYPE_LABELS[type]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Line drawing indicator ── */}
      {drawingLine && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 rounded-full shadow-lg">
          <span>Tap the map to add points ({drawingLine.points.length})</span>
          {drawingLine.points.length >= 2 && (
            <button
              onClick={() => {
                setPendingShape({
                  id: null,
                  shapeType: "line",
                  points: drawingLine.points,
                });
                setDrawingLine(null);
              }}
              className="rounded-full bg-primary-foreground text-primary px-2.5 py-0.5 text-[11px] font-bold"
            >
              Finish
            </button>
          )}
          {drawingLine.points.length > 1 && (
            <button
              onClick={() =>
                setDrawingLine(d => (d ? { points: d.points.slice(0, -1) } : d))
              }
              className="rounded-full border border-primary-foreground/50 px-2.5 py-0.5 text-[11px] font-bold"
            >
              Undo point
            </button>
          )}
          <button
            onClick={() => setDrawingLine(null)}
            className="rounded-full border border-primary-foreground/50 px-2.5 py-0.5 text-[11px] font-bold"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
