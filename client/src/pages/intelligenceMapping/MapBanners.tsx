// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { formatIntelAddress } from "@/lib/addressFormat";
import {} from "@/components/ui/select";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { MapScreen } from "./useMapScreen";

/** the manual merge picker and the move-marker banners. */
export function MapBanners({ s }: { s: MapScreen }) {
  const {
    geocodedIntelRef,
    savePinOverrideMut,
    updateCustomMarkerMut,
    manualMergePicker,
    setManualMergePicker,
    mergedIntelRef,
    markersRef,
    movingMarkerId,
    pendingMoveAddress,
    customMarkerMapRefs,
    setMovingMarkerId,
    setPendingMoveAddress,
    movingIntelLabel,
    pendingIntelMoveAddress,
    setMovingIntelLabel,
    setPendingIntelMoveAddress,
  } = s;
  return (
    <>
      {/* ── Manual Merge Picker ── */}
      {manualMergePicker && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setManualMergePicker(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Manual Merge
                </p>
                <p className="text-sm font-semibold text-foreground">
                  Select an Intel Pin to merge with
                </p>
              </div>
              <button
                onClick={() => setManualMergePicker(null)}
                className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {manualMergePicker.candidates.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  No intel pins found within 150m of this marker.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Intel pins must be visible on the map (not already merged) to
                  appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {manualMergePicker.candidates.map(c => (
                  <button
                    key={c.loc.label}
                    onClick={() => {
                      // Perform the merge: append intel data to the custom marker's merged list
                      const enriched = {
                        ...c.loc,
                        lat: c.position.lat,
                        lng: c.position.lng,
                      };
                      const existingList =
                        mergedIntelRef.current.get(manualMergePicker.cmId) ??
                        [];
                      if (!existingList.find(e => e.label === enriched.label)) {
                        existingList.push(enriched);
                        existingList.sort((a, b) => {
                          if (
                            a.type === "target_address" &&
                            b.type !== "target_address"
                          )
                            return -1;
                          if (
                            a.type !== "target_address" &&
                            b.type === "target_address"
                          )
                            return 1;
                          return 0;
                        });
                        mergedIntelRef.current.set(
                          manualMergePicker.cmId,
                          existingList
                        );
                      }
                      // Remove the intel pin from the map
                      const pinIdx = markersRef.current.findIndex(m => {
                        const pos = m.position as
                          | google.maps.LatLng
                          | google.maps.LatLngLiteral
                          | null;
                        if (!pos) return false;
                        const lat =
                          typeof (pos as any).lat === "function"
                            ? (pos as any).lat()
                            : (pos as any).lat;
                        const lng =
                          typeof (pos as any).lng === "function"
                            ? (pos as any).lng()
                            : (pos as any).lng;
                        return (
                          Math.abs(lat - c.position.lat) < 0.00001 &&
                          Math.abs(lng - c.position.lng) < 0.00001
                        );
                      });
                      if (pinIdx !== -1) {
                        markersRef.current[pinIdx].map = null;
                        markersRef.current.splice(pinIdx, 1);
                      }
                      // Also remove from geocodedIntelRef so it doesn't show in future merge pickers
                      geocodedIntelRef.current.delete(c.loc.label);
                      // Persist the merge to the database so it survives page reloads
                      updateCustomMarkerMut.mutate({
                        id: manualMergePicker.cmId,
                        linkedIntelLabel: c.loc.label,
                      });
                      setManualMergePicker(null);
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 active:scale-[0.98] transition-all px-4 py-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                        {c.loc.type === "target_address"
                          ? "Target Address"
                          : c.loc.type === "associate_address"
                            ? "Associate Address"
                            : "Observed Location"}
                      </p>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {formatIntelAddress(c.loc.label)}
                      </p>
                      {c.loc.linkedTargets?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.loc.linkedTargets
                            .map((t: any) => t.name)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {c.distanceM}m away
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Move Marker Banner ── */}
      {movingMarkerId !== null && (
        <div className="absolute top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 pointer-events-none">
          <div
            className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden"
            style={{ background: "rgba(3,105,161,0.97)" }}
          >
            {pendingMoveAddress === null ? (
              /* Phase 1: dragging */
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-semibold text-white">
                  Drag marker to new position
                </p>
                <button
                  onClick={() => {
                    // Cancel: snap marker back to original position
                    const orig = (window as any).__cmMoveOrigPos;
                    if (orig && orig.id === movingMarkerId) {
                      const marker = customMarkerMapRefs.current.get(orig.id);
                      if (marker) {
                        marker.position = { lat: orig.lat, lng: orig.lng };
                        (marker as any).gmpDraggable = false;
                      }
                    }
                    setMovingMarkerId(null);
                    setPendingMoveAddress(null);
                    delete (window as any).__cmMoveOrigPos;
                  }}
                  className="flex-shrink-0 text-white/80 hover:text-white text-xs font-medium bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Phase 2: confirm new address */
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 mb-0.5">
                  Move to
                </p>
                <p className="text-sm font-semibold text-white mb-3 leading-snug">
                  {pendingMoveAddress.address}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (
                        movingMarkerId === null ||
                        pendingMoveAddress === null
                      )
                        return;
                      updateCustomMarkerMut.mutate({
                        id: movingMarkerId,
                        lat: pendingMoveAddress.lat,
                        lng: pendingMoveAddress.lng,
                        address: pendingMoveAddress.address,
                      });
                      const marker =
                        customMarkerMapRefs.current.get(movingMarkerId);
                      if (marker) (marker as any).gmpDraggable = false;
                      setMovingMarkerId(null);
                      setPendingMoveAddress(null);
                      delete (window as any).__cmMoveOrigPos;
                      toast.success("Marker moved");
                    }}
                    className="flex-1 text-sm font-semibold text-white bg-white/25 hover:bg-white/35 rounded-xl py-2 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      // Cancel: snap marker back to original position
                      const orig = (window as any).__cmMoveOrigPos;
                      if (orig && orig.id === movingMarkerId) {
                        const marker = customMarkerMapRefs.current.get(orig.id);
                        if (marker) {
                          marker.position = { lat: orig.lat, lng: orig.lng };
                          (marker as any).gmpDraggable = false;
                        }
                      }
                      setMovingMarkerId(null);
                      setPendingMoveAddress(null);
                      delete (window as any).__cmMoveOrigPos;
                    }}
                    className="flex-1 text-sm font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Intel Pin Move Banner ── */}
      {movingIntelLabel !== null && (
        <div className="absolute top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 pointer-events-none">
          <div
            className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden"
            style={{ background: "rgba(3,105,161,0.97)" }}
          >
            {pendingIntelMoveAddress === null ? (
              /* Phase 1: dragging */
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-semibold text-white">
                  Drag marker to new position
                </p>
                <button
                  onClick={() => {
                    // Cancel: snap marker back to original position
                    const orig = (window as any).__intelMoveOrigPos;
                    if (orig && orig.label === movingIntelLabel) {
                      const marker = markersRef.current.find(
                        (m: any) => m.title === orig.label
                      );
                      if (marker) {
                        marker.position = { lat: orig.lat, lng: orig.lng };
                        (marker as any).gmpDraggable = false;
                      }
                    }
                    setMovingIntelLabel(null);
                    setPendingIntelMoveAddress(null);
                    delete (window as any).__intelMoveOrigPos;
                  }}
                  className="flex-shrink-0 text-white/80 hover:text-white text-xs font-medium bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Phase 2: confirm new address */
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 mb-0.5">
                  Move to
                </p>
                <p className="text-sm font-semibold text-white mb-3 leading-snug">
                  {pendingIntelMoveAddress.address}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (
                        movingIntelLabel === null ||
                        pendingIntelMoveAddress === null
                      )
                        return;
                      // Accept: update geocodedIntelRef so the new
                      // position is used immediately (this render), and
                      // persist it server-side so it's still there on the
                      // next redraw and on every other device — see
                      // intelPinOverrides.
                      const entry =
                        geocodedIntelRef.current.get(movingIntelLabel);
                      if (entry) {
                        geocodedIntelRef.current.set(movingIntelLabel, {
                          ...entry,
                          position: {
                            lat: pendingIntelMoveAddress.lat,
                            lng: pendingIntelMoveAddress.lng,
                          },
                        });
                      }
                      savePinOverrideMut.mutate({
                        label: movingIntelLabel,
                        lat: pendingIntelMoveAddress.lat,
                        lng: pendingIntelMoveAddress.lng,
                        address: pendingIntelMoveAddress.address,
                      });
                      const marker = markersRef.current.find(
                        (m: any) => m.title === movingIntelLabel
                      );
                      if (marker) (marker as any).gmpDraggable = false;
                      setMovingIntelLabel(null);
                      setPendingIntelMoveAddress(null);
                      delete (window as any).__intelMoveOrigPos;
                      toast.success("Marker moved");
                    }}
                    className="flex-1 text-sm font-semibold text-white bg-white/25 hover:bg-white/35 rounded-xl py-2 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      const orig = (window as any).__intelMoveOrigPos;
                      if (orig && orig.label === movingIntelLabel) {
                        const marker = markersRef.current.find(
                          (m: any) => m.title === orig.label
                        );
                        if (marker) {
                          marker.position = { lat: orig.lat, lng: orig.lng };
                          (marker as any).gmpDraggable = false;
                        }
                      }
                      setMovingIntelLabel(null);
                      setPendingIntelMoveAddress(null);
                      delete (window as any).__intelMoveOrigPos;
                    }}
                    className="flex-1 text-sm font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
