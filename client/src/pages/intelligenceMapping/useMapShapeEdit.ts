// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect } from "react";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import { MARKER_COLOURS, type MarkerColour } from "@/lib/markerSvgs";
import {
  rectanglePolygonPath,
  renderLineIcons,
  sectorPolygonPath,
} from "./shapes";
import type { MapShapesState } from "./useMapShapes";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapBasicsState } from "./useMapBasics";
import type { MapDataState } from "./useMapData";
import type { MapPlacingState } from "./useMapPlacing";

export function useMapShapeEdit(
  s: Pick<
    MapShapesState,
    | "shapeLongPressFiredRef"
    | "shapesRef"
    | "shapeLabelsRef"
    | "wireShapeActionChooserGesture"
    | "createLabelPillElement"
  > &
    Pick<MapAddressSearchState, "mapReady"> &
    Pick<MapBasicsState, "mapRef"> &
    Pick<MapDataState, "mapShapesData" | "mapShapesDataRef"> &
    Pick<
      MapPlacingState,
      | "pendingShape"
      | "beginEditShape"
      | "draftShapeOverlayRef"
      | "shapeColour"
      | "shapeOpacity"
      | "setPendingShape"
      | "draftRectRotatedOverlayRef"
      | "sectorDragAnchorRef"
      | "shapeLineDashed"
      | "shapeLineArrowEnd"
      | "shapeLineStyleRef"
    >
) {
  const {
    shapeLongPressFiredRef,
    mapReady,
    mapRef,
    shapesRef,
    mapShapesData,
    shapeLabelsRef,
    pendingShape,
    mapShapesDataRef,
    beginEditShape,
    wireShapeActionChooserGesture,
    createLabelPillElement,
    draftShapeOverlayRef,
    shapeColour,
    shapeOpacity,
    setPendingShape,
    draftRectRotatedOverlayRef,
    sectorDragAnchorRef,
    shapeLineDashed,
    shapeLineArrowEnd,
    shapeLineStyleRef,
  } = s;

  // Wraps the ordinary "open edit panel" click so a click immediately
  // following a just-fired long-press/right-click (see above) doesn't also
  // pop the edit panel open on top of the action chooser.
  const wireShapeEditClick = useCallback(
    (
      overlay:
        | google.maps.Circle
        | google.maps.Rectangle
        | google.maps.Polygon
        | google.maps.Polyline,
      openEdit: () => void
    ) => {
      overlay.addListener("click", () => {
        if (shapeLongPressFiredRef.current) {
          shapeLongPressFiredRef.current = false;
          return;
        }
        openEdit();
      });
    },
    []
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const existing = shapesRef.current;
    const incoming = (mapShapesData as any[] | undefined) ?? [];
    const incomingIds = new Set(incoming.map((s: any) => s.id as number));

    // Remove stale shapes (deleted, or filtered out by the operation scope)
    existing.forEach((overlay, id) => {
      if (!incomingIds.has(id)) {
        overlay.setMap(null);
        existing.delete(id);
      }
    });
    shapeLabelsRef.current.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.map = null;
        shapeLabelsRef.current.delete(id);
      }
    });

    incoming.forEach((s: any) => {
      // The shape currently being placed/edited is rendered by its own
      // draft overlay (draftShapeOverlayRef, see below) instead — skip it
      // here so the two don't sit on top of each other while the officer
      // is actively adjusting it.
      if (pendingShape && pendingShape.id === s.id) {
        const stale = existing.get(s.id);
        if (stale) {
          stale.setMap(null);
          existing.delete(s.id);
        }
        const staleLabel = shapeLabelsRef.current.get(s.id);
        if (staleLabel) {
          staleLabel.map = null;
          shapeLabelsRef.current.delete(s.id);
        }
        return;
      }

      const fillColor =
        MARKER_COLOURS[s.colour as MarkerColour] ?? MARKER_COLOURS.blue;
      const opacity = (s.opacity ?? 30) / 100;
      const openEdit = () => {
        const latest =
          mapShapesDataRef.current.find((x: any) => x.id === s.id) ?? s;
        beginEditShape(latest);
      };

      if (s.shapeType === "circle") {
        const center = { lat: s.centerLat, lng: s.centerLng };
        let circle = existing.get(s.id) as google.maps.Circle | undefined;
        if (circle) {
          circle.setCenter(center);
          circle.setRadius(s.radiusMeters);
          circle.setOptions({
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
          });
        } else {
          circle = new google.maps.Circle({
            map,
            center,
            radius: s.radiusMeters,
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            clickable: true,
          });
          wireShapeEditClick(circle, openEdit);
          wireShapeActionChooserGesture(circle);
          existing.set(s.id, circle);
        }
      } else if (s.shapeType === "rectangle") {
        // Rendered as a Polygon, not a native google.maps.Rectangle — the
        // latter has no rotation option (see rectanglePolygonPath above).
        // An unrotated rectangle's path is just its 4 corners, so this one
        // code path covers both cases.
        const path = rectanglePolygonPath(
          s.neLat,
          s.neLng,
          s.swLat,
          s.swLng,
          s.rotation ?? 0
        );
        let rectPoly = existing.get(s.id) as google.maps.Polygon | undefined;
        if (rectPoly) {
          rectPoly.setPath(path);
          rectPoly.setOptions({
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
          });
        } else {
          rectPoly = new google.maps.Polygon({
            map,
            paths: path,
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            clickable: true,
          });
          wireShapeEditClick(rectPoly, openEdit);
          wireShapeActionChooserGesture(rectPoly);
          existing.set(s.id, rectPoly);
        }
      } else if (s.shapeType === "sector") {
        const path = sectorPolygonPath(
          { lat: s.centerLat, lng: s.centerLng },
          s.radiusMeters,
          s.startAngle,
          s.endAngle,
          s.innerRadiusMeters ?? 0
        );
        let poly = existing.get(s.id) as google.maps.Polygon | undefined;
        if (poly) {
          poly.setPath(path);
          poly.setOptions({
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
          });
        } else {
          poly = new google.maps.Polygon({
            map,
            paths: path,
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            clickable: true,
          });
          wireShapeEditClick(poly, openEdit);
          wireShapeActionChooserGesture(poly);
          existing.set(s.id, poly);
        }
      } else {
        // line
        const path = (s.points ?? []) as { lat: number; lng: number }[];
        const dashed = !!s.lineDashed;
        const icons = renderLineIcons(
          path,
          dashed,
          !!s.lineArrowEnd,
          fillColor,
          opacity
        );
        let line = existing.get(s.id) as google.maps.Polyline | undefined;
        if (line) {
          line.setPath(path);
          line.setOptions({
            strokeColor: fillColor,
            strokeOpacity: dashed ? 0 : opacity,
            icons,
          });
        } else {
          line = new google.maps.Polyline({
            map,
            path,
            strokeColor: fillColor,
            strokeOpacity: dashed ? 0 : opacity,
            strokeWeight: 4,
            icons,
            clickable: true,
          });
          wireShapeEditClick(line, openEdit);
          wireShapeActionChooserGesture(line);
          existing.set(s.id, line);
        }
      }

      // ── Label pill — floats the shape's note beside its primary point
      // (previously only visible after tapping the shape to edit it), so an
      // officer glancing at the map sees what a shape is for without
      // opening it. A circle/rectangle anchors its label just outside its
      // own bottom edge, centred — clear of the fill entirely, unlike
      // sitting on the center point where it used to compete with whatever
      // was drawn under it. Sector and line keep the original "beside the
      // first point" placement (center for a sector, first vertex for a
      // line) — a sector's own "bottom" isn't a fixed edge the way a
      // circle's or rectangle's is, so there's no equivalent single spot to
      // move it to.
      const labelText = (s.label ?? "").trim();
      const labelIsBottomCentered =
        s.shapeType === "circle" || s.shapeType === "rectangle";
      const labelAnchor: { lat: number; lng: number } | null =
        s.shapeType === "circle"
          ? { lat: s.centerLat - s.radiusMeters / 111_320, lng: s.centerLng }
          : s.shapeType === "sector"
            ? { lat: s.centerLat, lng: s.centerLng }
            : s.shapeType === "rectangle"
              ? s.rotation
                ? // Rotated — "bottom edge, centred" has no single fixed
                  // spot any more, so this falls back to the shape's own
                  // center instead of picking one (arbitrary-looking) corner.
                  { lat: (s.neLat + s.swLat) / 2, lng: (s.neLng + s.swLng) / 2 }
                : { lat: s.swLat, lng: (s.neLng + s.swLng) / 2 }
              : ((s.points ?? [])[0] ?? null);
      const labelTransform = labelIsBottomCentered
        ? "translate(-50%, 12px)"
        : "translate(12px, -50%)";
      const existingLabel = shapeLabelsRef.current.get(s.id);
      if (!labelText || !labelAnchor) {
        if (existingLabel) {
          existingLabel.map = null;
          shapeLabelsRef.current.delete(s.id);
        }
      } else if (existingLabel) {
        existingLabel.position = labelAnchor;
        existingLabel.content = createLabelPillElement(
          labelText,
          fillColor,
          labelTransform
        );
      } else {
        const labelMarker = new DivIconOverlay({
          map,
          position: labelAnchor,
          content: createLabelPillElement(labelText, fillColor, labelTransform),
          zIndex: 500,
          // "none" — createLabelPillElement already sets its own offset
          // transform directly on the content element to nudge the pill
          // beside/below the shape's anchor point; DivIconOverlay must not
          // also apply a centering transform on top of that.
          anchor: "none",
        });
        labelMarker.addListener("click", openEdit);
        shapeLabelsRef.current.set(s.id, labelMarker);
      }
    });
  }, [
    mapShapesData,
    mapReady,
    pendingShape,
    beginEditShape,
    createLabelPillElement,
    wireShapeEditClick,
    wireShapeActionChooserGesture,
  ]);

  // ── Draft shape overlay (create/edit in progress) ────────────────────────────
  // Creates (once, on shape identity/type change) a live editable overlay
  // for whatever's currently being placed or edited, wiring its own
  // drag/resize events straight into pendingShape state. Deliberately does
  // NOT depend on pendingShape's geometry fields — those are the very
  // things these listeners update, and re-running this effect on every one
  // of their changes would tear the overlay down and rebuild it mid-drag.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !pendingShape) {
      if (draftShapeOverlayRef.current) {
        draftShapeOverlayRef.current.setMap(null);
        draftShapeOverlayRef.current = null;
      }
      return;
    }
    const map = mapRef.current;
    const fillColor = MARKER_COLOURS[shapeColour];
    const opacity = shapeOpacity / 100;
    let overlay:
      | google.maps.Circle
      | google.maps.Rectangle
      | google.maps.Polygon
      | google.maps.Polyline;

    if (pendingShape.shapeType === "circle") {
      const circle = new google.maps.Circle({
        map,
        center: { lat: pendingShape.centerLat!, lng: pendingShape.centerLng! },
        radius: pendingShape.radiusMeters!,
        editable: true,
        draggable: true,
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
      circle.addListener("center_changed", () => {
        const c = circle.getCenter();
        if (!c) return;
        setPendingShape(p =>
          p ? { ...p, centerLat: c.lat(), centerLng: c.lng() } : p
        );
      });
      circle.addListener("radius_changed", () => {
        setPendingShape(p =>
          p ? { ...p, radiusMeters: circle.getRadius() } : p
        );
      });
      overlay = circle;
    } else if (pendingShape.shapeType === "rectangle") {
      const bounds = new google.maps.LatLngBounds(
        { lat: pendingShape.swLat!, lng: pendingShape.swLng! },
        { lat: pendingShape.neLat!, lng: pendingShape.neLng! }
      );
      // The interactive drag-corner-to-resize / drag-to-move handle — kept
      // as a plain axis-aligned native Rectangle (position/size are always
      // edited in the shape's own unrotated frame, same as before rotation
      // existed) but invisible aside from a faint reference outline. The
      // actual visible, rotated shape is the companion Polygon below —
      // google.maps.Rectangle has no rotation option, so it can't do double
      // duty as both the handle and the real shape once rotation != 0.
      const rect = new google.maps.Rectangle({
        map,
        bounds,
        editable: true,
        draggable: true,
        fillOpacity: 0,
        strokeColor: "#6b7280",
        strokeOpacity: 0.6,
        strokeWeight: 1,
      });
      rect.addListener("bounds_changed", () => {
        const b = rect.getBounds();
        if (!b) return;
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        setPendingShape(p =>
          p
            ? {
                ...p,
                neLat: ne.lat(),
                neLng: ne.lng(),
                swLat: sw.lat(),
                swLng: sw.lng(),
              }
            : p
        );
      });
      const rotatedPath = rectanglePolygonPath(
        pendingShape.neLat!,
        pendingShape.neLng!,
        pendingShape.swLat!,
        pendingShape.swLng!,
        pendingShape.rotation ?? 0
      );
      const rotatedPoly = new google.maps.Polygon({
        map,
        paths: rotatedPath,
        clickable: false,
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
      draftRectRotatedOverlayRef.current = rotatedPoly;
      overlay = rect;
    } else if (pendingShape.shapeType === "sector") {
      const path = sectorPolygonPath(
        { lat: pendingShape.centerLat!, lng: pendingShape.centerLng! },
        pendingShape.radiusMeters!,
        pendingShape.startAngle!,
        pendingShape.endAngle!,
        pendingShape.innerRadiusMeters ?? 0
      );
      // Not editable (no free-dragging arc vertices) — a sector's shape is
      // controlled entirely by center/radius/angles, adjusted via the panel
      // below, so it always stays a clean pizza slice (or ring band, with
      // an inner radius set) rather than something an officer could
      // accidentally drag into a stray polygon. Still draggable as a
      // whole, which moves its center.
      const poly = new google.maps.Polygon({
        map,
        paths: path,
        editable: false,
        draggable: true,
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
      // sectorPolygonPath's first point is the center for a plain wedge,
      // but the first outer-arc point once an inner radius makes this a
      // ring band with no center vertex at all — so rather than assuming
      // a specific index IS the center, track the delta that same index
      // moved by (uniform for every vertex when the whole polygon is
      // dragged) and apply that delta to the stored center instead. The
      // "before" position comes from sectorDragAnchorRef rather than this
      // path directly, since the radius/angle-sync effect below can move
      // path[0] (e.g. toggling the inner-radius slider off flips it back
      // to the center) without this overlay being recreated.
      sectorDragAnchorRef.current = path[0];
      poly.addListener("dragend", () => {
        const newFirstVertex = poly.getPath().getAt(0);
        const before = sectorDragAnchorRef.current;
        if (!newFirstVertex || !before) return;
        const deltaLat = newFirstVertex.lat() - before.lat;
        const deltaLng = newFirstVertex.lng() - before.lng;
        sectorDragAnchorRef.current = {
          lat: newFirstVertex.lat(),
          lng: newFirstVertex.lng(),
        };
        setPendingShape(p =>
          p
            ? {
                ...p,
                centerLat: (p.centerLat ?? 0) + deltaLat,
                centerLng: (p.centerLng ?? 0) + deltaLng,
              }
            : p
        );
      });
      overlay = poly;
    } else {
      // line
      const line = new google.maps.Polyline({
        map,
        path: pendingShape.points ?? [],
        editable: true,
        draggable: true,
        strokeColor: fillColor,
        strokeOpacity: shapeLineDashed ? 0 : opacity,
        strokeWeight: 4,
        icons: renderLineIcons(
          pendingShape.points ?? [],
          shapeLineDashed,
          shapeLineArrowEnd,
          fillColor,
          opacity
        ),
      });
      const syncPath = () => {
        const pts = line
          .getPath()
          .getArray()
          .map(p => ({ lat: p.lat(), lng: p.lng() }));
        setPendingShape(p => (p ? { ...p, points: pts } : p));
        // Per-segment arrow offsets are percentages of the path's total
        // length at the moment they're computed — reshaping the line by
        // dragging a vertex changes every segment's share of that length,
        // so they need recomputing here too, not just when colour/opacity/
        // dashed/arrow themselves change (see shapeLineStyleRef above).
        const style = shapeLineStyleRef.current;
        line.setOptions({
          icons: renderLineIcons(
            pts,
            style.dashed,
            style.arrowEnd,
            MARKER_COLOURS[style.colour],
            style.opacity / 100
          ),
        });
      };
      line.getPath().addListener("set_at", syncPath);
      line.getPath().addListener("insert_at", syncPath);
      line.getPath().addListener("remove_at", syncPath);
      overlay = line;
    }

    draftShapeOverlayRef.current = overlay;
    const rotatedCompanion = draftRectRotatedOverlayRef.current;
    return () => {
      overlay.setMap(null);
      if (draftShapeOverlayRef.current === overlay) {
        draftShapeOverlayRef.current = null;
      }
      if (rotatedCompanion) {
        rotatedCompanion.setMap(null);
        if (draftRectRotatedOverlayRef.current === rotatedCompanion) {
          draftRectRotatedOverlayRef.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pendingShape?.id, pendingShape?.shapeType]);
}

export type MapShapeEditState = ReturnType<typeof useMapShapeEdit>;
