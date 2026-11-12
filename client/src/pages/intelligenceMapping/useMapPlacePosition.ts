// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useEffect, useRef } from "react";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import { samePlace } from "@shared/targetPosition";
import {
  MARKER_COLOURS,
  type MarkerColour,
  type MarkerIcon,
} from "@/lib/markerSvgs";
import { convertGoogleAddresses, ensureBracketCode } from "@/lib/addressFormat";
import { toast } from "sonner";
import { geocodeQueryForLabel } from "./geocodeCache";
import { haversineMetres } from "./mapMath";
import { type IntelMapLocation } from "./mapTypes";
import {
  rectanglePolygonPath,
  renderLineIcons,
  sectorPolygonPath,
} from "./shapes";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapBasicsState } from "./useMapBasics";
import type { MapDataState } from "./useMapData";
import type { MapMarkersState } from "./useMapMarkers";
import type { MapReadyState } from "./useMapReady";

export function useMapPlacePosition(
  s: Pick<
    MapPlacingState,
    | "draftShapeOverlayRef"
    | "shapeColour"
    | "shapeOpacity"
    | "shapeLineDashed"
    | "shapeLineArrowEnd"
    | "draftRectRotatedOverlayRef"
    | "drawingLinePointMarkersRef"
    | "drawingLinePreviewRef"
    | "drawingLine"
    | "pendingShape"
    | "sectorDragAnchorRef"
    | "setMapQeAddress"
    | "mapQeMarkerIdRef"
    | "setMapQeLatLng"
    | "setMapQeOpen"
    | "setCmIcon"
    | "setCmColour"
    | "setCmRotation"
    | "setCmLabelOnly"
    | "setCmLabel"
    | "setCmAddress"
    | "setCmNote"
    | "setCmOpId"
    | "setCmPersons"
    | "setCmVehicles"
    | "setCmPersonInput"
    | "setCmVehicleInput"
    | "setEditingMarkerId"
    | "setPendingLatLng"
  > &
    Pick<
      MapAddressSearchState,
      | "mapReady"
      | "infoWindowRef"
      | "customMarkersDataRef"
      | "geocodedIntelRef"
      | "setManualMergePicker"
      | "mergedIntelRef"
      | "locations"
      | "geocoderRef"
      | "setMovingMarkerId"
      | "setPendingMoveAddress"
      | "markersRef"
      | "geocodeCacheRef"
    > &
    Pick<MapBasicsState, "mapRef" | "mapHeadingRef"> &
    Pick<
      MapDataState,
      | "customMarkers"
      | "updateCustomMarkerMut"
      | "refetchCustomMarkers"
      | "deleteCustomMarkerMut"
    > &
    Pick<MapMarkersState, "renderLocations" | "customMarkerMapRefs"> &
    Pick<MapReadyState, "customMarkerImgRefs">
) {
  const {
    draftShapeOverlayRef,
    shapeColour,
    shapeOpacity,
    shapeLineDashed,
    shapeLineArrowEnd,
    draftRectRotatedOverlayRef,
    drawingLinePointMarkersRef,
    drawingLinePreviewRef,
    mapReady,
    mapRef,
    drawingLine,
    pendingShape,
    sectorDragAnchorRef,
    infoWindowRef,
    customMarkers,
    setMapQeAddress,
    mapQeMarkerIdRef,
    setMapQeLatLng,
    setMapQeOpen,
    customMarkersDataRef,
    geocodedIntelRef,
    setManualMergePicker,
    updateCustomMarkerMut,
    refetchCustomMarkers,
    mergedIntelRef,
    locations,
    geocoderRef,
    renderLocations,
    customMarkerMapRefs,
    setMovingMarkerId,
    setPendingMoveAddress,
    mapHeadingRef,
    customMarkerImgRefs,
    deleteCustomMarkerMut,
    setCmIcon,
    setCmColour,
    setCmRotation,
    setCmLabelOnly,
    setCmLabel,
    setCmAddress,
    setCmNote,
    setCmOpId,
    setCmPersons,
    setCmVehicles,
    setCmPersonInput,
    setCmVehicleInput,
    setEditingMarkerId,
    setPendingLatLng,
    markersRef,
    geocodeCacheRef,
  } = s;

  // Pushes a live colour/opacity/dashed/arrow change (from the panel's
  // swatches/slider/switches) onto whichever draft overlay is currently on
  // the map, without recreating it.
  useEffect(() => {
    const overlay = draftShapeOverlayRef.current;
    if (!overlay) return;
    const fillColor = MARKER_COLOURS[shapeColour];
    const opacity = shapeOpacity / 100;
    if (overlay instanceof google.maps.Polyline) {
      // Read the overlay's own live path rather than pendingShape.points —
      // this effect doesn't depend on the path (dragging a vertex touches
      // it far more often than colour/opacity/dashed/arrow, and re-running
      // it on every drag frame would fight the drag), so pendingShape.points
      // can lag a frame or two behind what's actually on the map.
      const path = overlay
        .getPath()
        .getArray()
        .map(p => ({ lat: p.lat(), lng: p.lng() }));
      overlay.setOptions({
        strokeColor: fillColor,
        strokeOpacity: shapeLineDashed ? 0 : opacity,
        icons: renderLineIcons(
          path,
          shapeLineDashed,
          shapeLineArrowEnd,
          fillColor,
          opacity
        ),
      });
    } else if (draftRectRotatedOverlayRef.current) {
      // Rectangle — colour/opacity apply to the visible rotated companion
      // Polygon, not the invisible resize-handle Rectangle beneath it (see
      // the rectangle branch above for why there are two overlays here).
      draftRectRotatedOverlayRef.current.setOptions({
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
      });
    } else {
      overlay.setOptions({
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
      });
    }
  }, [shapeColour, shapeOpacity, shapeLineDashed, shapeLineArrowEnd]);

  // Renders a dot for every point tapped so far while drawing a line (see
  // drawingLinePointMarkersRef above), plus a thin connecting preview once
  // there are at least two — full clear-then-rebuild on every tap, which is
  // cheap at the point counts this feature is used at.
  useEffect(() => {
    drawingLinePointMarkersRef.current.forEach(m => {
      m.map = null;
    });
    drawingLinePointMarkersRef.current = [];
    if (drawingLinePreviewRef.current) {
      drawingLinePreviewRef.current.setMap(null);
      drawingLinePreviewRef.current = null;
    }
    if (!mapReady || !mapRef.current || !drawingLine) return;
    const map = mapRef.current;
    drawingLine.points.forEach((pt, idx) => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:#F9A825;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`;
      const marker = new DivIconOverlay({
        map,
        position: pt,
        content: el,
        title: `Point ${idx + 1}`,
      });
      drawingLinePointMarkersRef.current.push(marker);
    });
    if (drawingLine.points.length >= 2) {
      drawingLinePreviewRef.current = new google.maps.Polyline({
        map,
        path: drawingLine.points,
        strokeColor: "#F9A825",
        strokeOpacity: 0.9,
        strokeWeight: 3,
        clickable: false,
      });
    }
  }, [drawingLine, mapReady]);

  // A sector's geometry is driven by the panel's radius/angle sliders
  // rather than by dragging the polygon itself (see the "not editable"
  // note above) — push those changes onto the draft Polygon's path live.
  useEffect(() => {
    const overlay = draftShapeOverlayRef.current;
    if (!overlay || !pendingShape || pendingShape.shapeType !== "sector")
      return;
    if (!(overlay instanceof google.maps.Polygon)) return;
    const path = sectorPolygonPath(
      { lat: pendingShape.centerLat!, lng: pendingShape.centerLng! },
      pendingShape.radiusMeters!,
      pendingShape.startAngle!,
      pendingShape.endAngle!,
      pendingShape.innerRadiusMeters ?? 0
    );
    overlay.setPath(path);
    // Keep the dragend delta-tracking anchor in sync — this is the only
    // other place path[0]'s position can change without the overlay being
    // recreated (see the dragend handler above).
    sectorDragAnchorRef.current = path[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingShape?.startAngle,
    pendingShape?.endAngle,
    pendingShape?.radiusMeters,
    pendingShape?.innerRadiusMeters,
  ]);

  // Keeps the rectangle's visible rotated companion Polygon (see the
  // rectangle branch of the draft-overlay effect above) in sync with the
  // resize-handle Rectangle's bounds AND the rotation slider — either one
  // changing needs this rebuilt, unlike the handle Rectangle itself, which
  // only needs its own bounds (that's what dragging it already does
  // natively).
  useEffect(() => {
    const poly = draftRectRotatedOverlayRef.current;
    if (!poly || !pendingShape || pendingShape.shapeType !== "rectangle")
      return;
    poly.setPath(
      rectanglePolygonPath(
        pendingShape.neLat!,
        pendingShape.neLng!,
        pendingShape.swLat!,
        pendingShape.swLng!,
        pendingShape.rotation ?? 0
      )
    );
  }, [
    pendingShape?.neLat,
    pendingShape?.neLng,
    pendingShape?.swLat,
    pendingShape?.swLng,
    pendingShape?.rotation,
  ]);

  // Global RS Quick Entry handler for merged marker popup
  useEffect(() => {
    (window as any).__cmRsQuickEntry = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkers as any[] | undefined)?.find(
        (m: any) => m.id === id
      );
      if (!cm) return;
      const address = cm.address || cm.label || "";
      setMapQeAddress(convertGoogleAddresses(address));
      mapQeMarkerIdRef.current = id;
      setMapQeLatLng(
        cm.lat != null && cm.lng != null ? { lat: cm.lat, lng: cm.lng } : null
      );
      setMapQeOpen(true);
    };
    return () => {
      delete (window as any).__cmRsQuickEntry;
    };
  }, [customMarkers, setMapQeAddress, setMapQeOpen]);

  // Global manual merge picker handler — opens the merge picker bottom sheet
  useEffect(() => {
    (window as any).__cmOpenMergePicker = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkersDataRef.current as any[]).find(
        (m: any) => m.id === id
      );
      if (!cm) return;
      // Find all geocoded intel pins within 150m of this custom marker
      const MANUAL_MERGE_RADIUS_M = 150;
      const candidates: Array<{
        loc: IntelMapLocation;
        position: google.maps.LatLngLiteral;
        distanceM: number;
      }> = [];
      geocodedIntelRef.current.forEach(({ loc, position }) => {
        const d = haversineMetres(cm.lat, cm.lng, position.lat, position.lng);
        if (d <= MANUAL_MERGE_RADIUS_M) {
          candidates.push({ loc, position, distanceM: Math.round(d) });
        }
      });
      candidates.sort((a, b) => a.distanceM - b.distanceM);
      setManualMergePicker({ cmId: id, candidates });
    };
    return () => {
      delete (window as any).__cmOpenMergePicker;
    };
  }, []);

  // Global un-merge handler — reverses a manual merge: clears the saved link
  // and rebuilds the pins so the intel pin comes back on the map.
  useEffect(() => {
    (window as any).__cmUnmerge = (id: number) => {
      infoWindowRef.current?.close();
      updateCustomMarkerMut.mutate(
        { id, linkedIntelLabel: null },
        {
          onSuccess: async () => {
            // Wait for the marker list to refresh first, so the rebuild below
            // sees the link gone and does not simply merge it again.
            await refetchCustomMarkers();
            mergedIntelRef.current.clear();
            if (locations && mapRef.current && geocoderRef.current) {
              renderLocations(locations);
            }
            toast.success("Un-merged — the location pin is back on the map");
          },
        }
      );
    };
    return () => {
      delete (window as any).__cmUnmerge;
    };
  }, [locations, renderLocations, refetchCustomMarkers, updateCustomMarkerMut]);

  // Global move marker handler — makes the marker draggable and enters move mode
  useEffect(() => {
    (window as any).__cmStartMove = (id: number) => {
      infoWindowRef.current?.close();
      const marker = customMarkerMapRefs.current.get(id);
      if (!marker) return;
      // Store original position for cancel rollback
      const origPos = marker.position as google.maps.LatLngLiteral | null;
      if (!origPos) return;
      const origLat =
        typeof (origPos as any).lat === "function"
          ? (origPos as any).lat()
          : (origPos as any).lat;
      const origLng =
        typeof (origPos as any).lng === "function"
          ? (origPos as any).lng()
          : (origPos as any).lng;
      // Make marker draggable
      (marker as any).gmpDraggable = true;
      setMovingMarkerId(id);
      setPendingMoveAddress(null);
      // Listen for drag end to reverse geocode new position
      const dragEndListener = marker.addListener("dragend", () => {
        const newPos = marker.position as google.maps.LatLngLiteral | null;
        if (!newPos || !geocoderRef.current) return;
        const newLat =
          typeof (newPos as any).lat === "function"
            ? (newPos as any).lat()
            : (newPos as any).lat;
        const newLng =
          typeof (newPos as any).lng === "function"
            ? (newPos as any).lng()
            : (newPos as any).lng;
        geocoderRef.current.geocode(
          { location: { lat: newLat, lng: newLng } },
          (results, status) => {
            const rawAddr =
              status === "OK" && results && results[0]
                ? results[0].formatted_address
                : `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
            const addr = convertGoogleAddresses(rawAddr);
            setPendingMoveAddress({ lat: newLat, lng: newLng, address: addr });
          }
        );
        // Remove this one-time listener
        google.maps.event.removeListener(dragEndListener);
      });
      // Store original position on the window object for cancel rollback
      (window as any).__cmMoveOrigPos = { id, lat: origLat, lng: origLng };
    };
    return () => {
      delete (window as any).__cmStartMove;
    };
  }, [
    customMarkerMapRefs,
    geocoderRef,
    setMovingMarkerId,
    setPendingMoveAddress,
  ]);

  // Global inline rotation handler for custom marker popup slider.
  // The save is debounced, and the page re-renders every second or so (the
  // location polls), so the handler and its pending save must survive a
  // re-render: it is set up once and reaches the mutation through a ref. (It
  // used to depend on the mutation object, which is a new object on every
  // render — the cleanup then cancelled the pending save, the rotation was
  // never stored, and the next poll redrew the marker north up.)
  const updateCustomMarkerMutRef = useRef(updateCustomMarkerMut);
  updateCustomMarkerMutRef.current = updateCustomMarkerMut;
  useEffect(() => {
    let rotateTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: { id: number; rotation: number } | null = null;
    (window as any).__cmPopupRotate = (id: number, valueStr: string) => {
      const rotation = Number(valueStr);
      // Update the live preview image and degree label in the popup DOM
      const previewImg = document.getElementById(
        `cm-popup-preview-${id}`
      ) as HTMLImageElement | null;
      const degLabel = document.getElementById(
        `cm-popup-deg-${id}`
      ) as HTMLElement | null;
      if (previewImg) previewImg.style.transform = `rotate(${rotation}deg)`;
      if (degLabel) degLabel.textContent = `${rotation}°`;
      // Also rotate the actual map marker element immediately via direct img
      // ref — offset by the map's current heading (not just `rotation`
      // directly), same as the poll-cycle build and the heading_changed
      // listener, so the icon stays glued to the compass direction being
      // dragged to rather than snapping to look right only at heading 0.
      // data-rotation is updated too, so a later heading change (without
      // touching this slider again) keeps compensating from the new value.
      const onMapRotation = rotation - mapHeadingRef.current;
      const markerImg = customMarkerImgRefs.current.get(id);
      if (markerImg) {
        markerImg.dataset.rotation = String(rotation);
        markerImg.style.transform = `rotate(${onMapRotation}deg)`;
      }
      // Fallback: query through content if direct ref not found
      if (!markerImg) {
        const markerEl = customMarkerMapRefs.current.get(id);
        if (markerEl?.content instanceof HTMLElement) {
          const img = markerEl.content.querySelector(
            "img"
          ) as HTMLImageElement | null;
          if (img) {
            img.dataset.rotation = String(rotation);
            img.style.transform = `rotate(${onMapRotation}deg)`;
          }
        }
      }
      // Debounce the DB save so we don't fire on every pixel of drag
      if (rotateTimer) clearTimeout(rotateTimer);
      pending = { id, rotation };
      rotateTimer = setTimeout(() => {
        rotateTimer = null;
        pending = null;
        updateCustomMarkerMutRef.current.mutate({ id, rotation });
      }, 400);
    };
    return () => {
      delete (window as any).__cmPopupRotate;
      // Leaving the page with a save still waiting: send it now.
      if (rotateTimer) clearTimeout(rotateTimer);
      if (pending) updateCustomMarkerMutRef.current.mutate(pending);
    };
  }, []);

  // Global delete handler for custom marker info window
  useEffect(() => {
    (window as any).__deleteCustomMarker = async (id: number) => {
      infoWindowRef.current?.close();
      try {
        await deleteCustomMarkerMut.mutateAsync({ id });
        toast.success("Marker deleted");
      } catch {
        toast.error("Failed to delete marker");
      }
    };
    return () => {
      delete (window as any).__deleteCustomMarker;
    };
  }, [deleteCustomMarkerMut]);

  // Global edit handler for custom marker info window
  useEffect(() => {
    (window as any).__editCustomMarker = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkers as any[] | undefined)?.find(
        (m: any) => m.id === id
      );
      if (!cm) return;
      // Pre-fill all form fields with existing marker data
      setCmIcon((cm.markerIcon as MarkerIcon) ?? "house_filled");
      setCmColour((cm.markerColour as MarkerColour) ?? "red");
      setCmRotation(cm.rotation ?? 0);
      setCmLabelOnly(!!cm.labelOnly);
      setCmLabel(cm.label ?? "");
      setCmAddress(cm.address ?? "");
      setCmNote(cm.note ?? "");
      setCmOpId(cm.operationId ?? null);
      setCmPersons(Array.isArray(cm.assocPersons) ? cm.assocPersons : []);
      setCmVehicles(Array.isArray(cm.assocVehicles) ? cm.assocVehicles : []);
      setCmPersonInput("");
      setCmVehicleInput("");
      setEditingMarkerId(id);
      // Use the marker's lat/lng as the "pending" position to open the form panel
      setPendingLatLng({ lat: cm.lat, lng: cm.lng });
    };
    return () => {
      delete (window as any).__editCustomMarker;
    };
  }, [customMarkers]);

  // Where a named place is on the map: a pin or marker whose title is that
  // place, else the position the geocoder already found for it. Null when
  // neither knows it (nothing is guessed). Kept in a ref so the window-level
  // popup handlers always call the latest one.
  const placePosition = (
    place: string
  ): { lat: number; lng: number } | null => {
    const pins: any[] = [
      ...markersRef.current,
      ...Array.from(customMarkerMapRefs.current.values()),
    ];
    for (const m of pins) {
      if (!m?.title || !m.position || !samePlace(String(m.title), place))
        continue;
      const lat =
        typeof m.position.lat === "function"
          ? m.position.lat()
          : m.position.lat;
      const lng =
        typeof m.position.lng === "function"
          ? m.position.lng()
          : m.position.lng;
      if (typeof lat === "number" && typeof lng === "number")
        return { lat, lng };
    }
    const cached = geocodeCacheRef.current.get(geocodeQueryForLabel(place));
    return cached ? { lat: cached.lat, lng: cached.lng } : null;
  };
  const placePositionRef = useRef(placePosition);
  placePositionRef.current = placePosition;

  // ── Intel pin global handlers ─────────────────────────────────────────────────

  // RS Quick Entry from intel pin popup
  useEffect(() => {
    (window as any).__intelRsQuickEntry = (label: string) => {
      infoWindowRef.current?.close();
      // Ensure the label has a bracket short-form — intel entity labels are already
      // in RS format (suburb UPPERCASE, no postcode) but may lack the bracket code.
      setMapQeAddress(ensureBracketCode(label));
      mapQeMarkerIdRef.current = null;
      setMapQeLatLng(placePositionRef.current(label));
      setMapQeOpen(true);
    };
    return () => {
      delete (window as any).__intelRsQuickEntry;
    };
  }, [setMapQeAddress, setMapQeOpen]);

  return { placePosition };
}

export type MapPlacePositionState = ReturnType<typeof useMapPlacePosition>;
