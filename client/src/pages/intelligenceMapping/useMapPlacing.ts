// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useRef, useState } from "react";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import { type TransitPlace } from "@shared/transitPlace";
import { type PlaceSignIcon } from "@shared/placeSigns";
import { fullStreetTypes } from "@shared/streetTypes";
import { type MarkerColour } from "@/lib/markerSvgs";
import { type TacticalGroup } from "@/lib/tacticalMarkers";
import { trpc } from "@/lib/trpc";
import {
  parseSplitSettings,
  splitViewAvailable,
  type SplitBox,
} from "@shared/splitView";
import { type FlyMarker, type FlyShape } from "@/components/Map3DView";
import { type IntelMapLocation } from "./mapTypes";
import { _getTodayPerthYmd } from "./perthDates";
import { LS_MAP_SETTINGS_KEY } from "./quickLinks";
import {
  DEFAULT_RECT_HALF_SIDE_M,
  DEFAULT_SHAPE_RADIUS_M,
  type ShapeType,
} from "./shapes";
import type { MapPanesState } from "./useMapPanes";

export function useMapPlacing(s: Pick<MapPanesState, "narrowScreen">) {
  const { narrowScreen } = s;

  // Right-pane collapsible RS Quick Entry panel state (separate from modal inline field)
  const [rsQeText, setRsQeText] = useState("");
  const [rsQeCins, setRsQeCins] = useState<Set<string>>(new Set());
  const rsQeInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Custom Marker Placement State ────────────────────────────────────────────
  const [placingMarker, setPlacingMarker] = useState(false); // placement mode active
  const [dismissedNoLocs, setDismissedNoLocs] = useState(false); // user dismissed the empty-state overlay
  const [pendingLatLng, setPendingLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // POI tap: shown when user taps a Google Maps business/POI pin
  const [poiTap, setPoiTap] = useState<{
    lat: number;
    lng: number;
    name: string;
    address: string;
    /** Set when the place is a bus stop or train station: name is then the
     * one wording ("Bus Stop …" / "… Train Station"). */
    transit?: TransitPlace;
    /** Set when the place is a bank, post office, pub, hotel, gym or shopping
     * centre (Google's type, else how it is written): its sign. */
    placeSign?: PlaceSignIcon;
  } | null>(null);
  // Action chooser: shown on tap-and-hold / right-click before user picks RS Quick Entry or Marker/Intel
  // intelLoc is set when the tap is on an intelligence-derived marker (target address / observation)
  const [actionChooser, setActionChooser] = useState<{
    lat: number;
    lng: number;
    address: string;
    intelLoc?: IntelMapLocation;
  } | null>(null);
  // Street View picture-in-picture panel, opened from a marker popup
  const [streetViewPip, setStreetViewPip] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  // "Fly" — the full 3D terrain view (see components/Map3DView.tsx), switched
  // in over the flat map from the Map / Sat / Fly toggle. The flat map stays
  // mounted underneath so leaving Fly puts everything back as it was.
  const [flyView, setFlyView] = useState<{
    center: { lat: number; lng: number };
    range: number;
    tilt: number;
    heading: number;
    markers: FlyMarker[];
    shapes: FlyShape[];
  } | null>(null);
  const [flySelectedId, setFlySelectedId] = useState<string | null>(null);
  // Where the Target location flag is on the flat map right now (null when
  // there isn't one). Fly draws the same flag from this, as a picture.
  const targetFlagFlyRef = useRef<{
    lat: number;
    lng: number;
    emoji: string;
    text: string;
    unsure: boolean;
  } | null>(null);
  // A spot picked with a plain click in Fly — offers "Add here…".
  const [flyPick, setFlyPick] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const flyCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  // Rotations being dragged on Fly's marker card, by marker id, until the
  // saved value has caught up.
  const flyRotOverrideRef = useRef<Map<string, number>>(new Map());
  const flyRotSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fly's North up / 0° tilt buttons (tilt reported by the 3D map).
  const [flyTilt, setFlyTilt] = useState(0);
  const [flyCameraReq, setFlyCameraReq] = useState<{
    heading?: number;
    tilt?: number;
    n: number;
  } | null>(null);
  // Fly's Centre on me / Follow me buttons.
  const [flyFollow, setFlyFollow] = useState(false);
  const [flyCentreReq, setFlyCentreReq] = useState<{
    lat: number;
    lng: number;
    n: number;
  } | null>(null);
  // FLY + NEARMAP split view — a small Nearmap window on top of Fly (the NM
  // button in Fly's right-hand column), movable and resizable like the other
  // picture-in-picture panels. Its Follow button (on by default, and back on
  // whenever the window is reopened) keeps it looking where Fly looks. Whether
  // it is on, and the window's position and size, are remembered per device in
  // runlog_map_settings. The NM button exists only in Fly, never on a phone,
  // and only when the server has a Nearmap key. See shared/splitView.ts.
  const nearmapStatus = trpc.intelligence.nearmapAvailable.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });
  const readSplitSettings = () => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      return parseSplitSettings(s ? JSON.parse(s) : null);
    } catch {
      return parseSplitSettings(null);
    }
  };
  const [splitOn, setSplitOn] = useState<boolean>(() => readSplitSettings().on);
  const [splitBox, setSplitBox] = useState<SplitBox | null>(
    () => readSplitSettings().box
  );
  const [splitFollow, setSplitFollow] = useState(true);
  // Where the flat map is looking (to the nearest ~500 m), for the Nearmap
  // photo-date label — kept only while the Nearmap layer is on.
  const [nearmapCentre, setNearmapCentre] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const splitAvailable = splitViewAvailable({
    flyOpen: !!flyView,
    phone: narrowScreen,
    nearmapConfigured: nearmapStatus.data?.configured === true,
  });
  const splitShown = splitAvailable && splitOn;
  // A reopened window always starts following again.
  useEffect(() => {
    if (!splitShown) setSplitFollow(true);
  }, [splitShown]);
  // Photos picture-in-picture panel, opened from a marker popup's Images
  // button (only shown when that address already has linked photos).
  const [imagesPip, setImagesPip] = useState<{ label: string } | null>(null);
  // RS Quick Entry from map: shown when user picks "RS Quick Entry" from the action chooser
  const [mapQeOpen, setMapQeOpen] = useState(false);
  const [mapQeTimeOverride, setMapQeTimeOverride] = useState<string | null>(
    null
  ); // "HH:MM AM/PM" or null for current time
  const [mapQeHour, setMapQeHour] = useState("12");
  const [mapQeMinute, setMapQeMinute] = useState("00");
  const [mapQePeriod, setMapQePeriod] = useState("AM");
  const [mapQeRowDate, setMapQeRowDate] = useState<string>(() =>
    _getTodayPerthYmd()
  ); // explicit calendar date for the QE row
  const [showMapQeDateStepper, setShowMapQeDateStepper] = useState(false); // toggled by Date button
  const [mapQeSelectOpen, setMapQeSelectOpen] = useState(false);
  const [mapQeAddress, setMapQeAddressRaw] = useState(""); // pre-filled address for the observation
  // Whatever sets the address, street types are written in full ("Street",
  // never "St") — in the address, its bracket short form, and the short
  // address shown below it.
  const setMapQeAddress = useCallback(
    (address: string) => setMapQeAddressRaw(fullStreetTypes(address)),
    []
  );
  // The custom marker an RS Quick Entry was opened from (its popup's RS Quick
  // Entry button), so the entry can stay on that marker (see
  // linkEntryToMarker). Cleared whenever the entry sheet closes.
  const mapQeMarkerIdRef = useRef<number | null>(null);
  // Where on the map the place the entry was opened from is — kept so the
  // cards can offer "Entered here" to someone logged inside a place close by
  // (shared/enterNearby.ts). Null when the opener has no position.
  const [mapQeLatLng, setMapQeLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // Set only when the entry was opened from a tapped place (a business, a bus
  // stop, a station): that tap is where the place's pin goes — see
  // pinAtTappedPlace — rather than wherever its name geocodes to.
  const mapQePoiPosRef = useRef<{ lat: number; lng: number } | null>(null);
  // The sign of that tapped place (a bank, a pub, …), saved with its position.
  const mapQePoiSignRef = useRef<PlaceSignIcon | null>(null);
  useEffect(() => {
    if (!mapQeOpen) {
      mapQeMarkerIdRef.current = null;
      mapQePoiPosRef.current = null;
      mapQePoiSignRef.current = null;
      setMapQeLatLng(null);
    }
  }, [mapQeOpen]);
  // QE chips use the same order as the main RS: the Shortcuts page order, with
  // the target's own chips fixed after SC (see shared/rsChips.ts). Nothing to
  // store or sync here.
  const [cmLabel, setCmLabel] = useState("");
  const [cmAddress, setCmAddress] = useState("");
  const [cmNote, setCmNote] = useState("");
  const [cmOpId, setCmOpId] = useState<number | null>(null);
  const [cmPersons, setCmPersons] = useState<string[]>([]);
  const [cmVehicles, setCmVehicles] = useState<string[]>([]);
  // string, not MarkerIcon — can also hold a tactical marker key (see
  // lib/tacticalMarkers.ts), which has no colour of its own to combine with.
  const [cmIcon, setCmIcon] = useState<string>("house_filled");
  const [cmColour, setCmColour] = useState<MarkerColour>("red");
  const [cmRotation, setCmRotation] = useState(0);
  // Which tab is active in the Marker Icon picker — All/Surveillance keep
  // cmColour meaningful; Tactical hides the colour section entirely since
  // those icons are fixed-colour raster art, not a recolourable shape.
  const [cmIconFilter, setCmIconFilter] = useState<
    "all" | "surveillance" | TacticalGroup
  >("surveillance");
  // "Label only" — the marker renders as just its label pill, no icon (see
  // the Add Shape feature's own note-label pill, which this borrows the
  // look of). Off by default so ordinary icon markers behave as before.
  const [cmLabelOnly, setCmLabelOnly] = useState(false);
  const [cmPersonInput, setCmPersonInput] = useState("");
  const [cmVehicleInput, setCmVehicleInput] = useState("");
  const [cmSaving, setCmSaving] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null);

  // ── Map Shape Placement State ────────────────────────────────────────────────
  // Transparent annotation shapes (circle/rectangle/sector/line) — see the
  // mapShapes schema comment. Purely visual (no target/person/vehicle
  // linkage, unlike custom markers), so the draft state here is deliberately
  // smaller than cm* above.
  // Shown right after "Add Shape Here" — lets the officer pick which of the
  // four shapes to place at the tapped point before a draft overlay appears.
  const [shapeTypePicker, setShapeTypePicker] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // The shape currently being placed (new) or edited (existing) — drives
  // both the live draggable/resizable overlay on the map and the bottom-
  // sheet panel. `id` is null for a new, not-yet-saved shape.
  const [pendingShape, setPendingShape] = useState<{
    id: number | null;
    shapeType: ShapeType;
    centerLat?: number;
    centerLng?: number;
    radiusMeters?: number;
    startAngle?: number;
    endAngle?: number;
    innerRadiusMeters?: number;
    neLat?: number;
    neLng?: number;
    swLat?: number;
    swLng?: number;
    rotation?: number;
    points?: { lat: number; lng: number }[];
  } | null>(null);
  const [shapeColour, setShapeColour] = useState<MarkerColour>("blue");
  const [shapeOpacity, setShapeOpacity] = useState(30); // 0-100 %
  const [shapeLabel, setShapeLabel] = useState("");
  // Line-only styling — see renderLineIcons above.
  const [shapeLineDashed, setShapeLineDashed] = useState(false);
  const [shapeLineArrowEnd, setShapeLineArrowEnd] = useState(false);
  // Mirrors shapeColour/shapeOpacity/shapeLineDashed/shapeLineArrowEnd for
  // the draft line overlay's path-change listener (syncPath, below) — that
  // listener is wired up once per overlay and needs the CURRENT styling
  // whenever a vertex is dragged, not whatever it closed over when the
  // overlay was created, since per-segment arrow offsets (see
  // renderLineIcons) have to be recomputed on every path change to stay
  // correctly positioned as the line is reshaped.
  const shapeLineStyleRef = useRef({
    colour: shapeColour,
    opacity: shapeOpacity,
    dashed: shapeLineDashed,
    arrowEnd: shapeLineArrowEnd,
  });
  useEffect(() => {
    shapeLineStyleRef.current = {
      colour: shapeColour,
      opacity: shapeOpacity,
      dashed: shapeLineDashed,
      arrowEnd: shapeLineArrowEnd,
    };
  }, [shapeColour, shapeOpacity, shapeLineDashed, shapeLineArrowEnd]);
  // A shape saved with no operation is hidden from any single/multi-
  // operation-filtered map view — same "silent default" trap as custom
  // markers had, see the Operation picker in the marker panel below for the
  // full explanation. Needs to be user-visible/correctable rather than
  // derived silently, since the derivation can only guess when exactly one
  // operation is in view.
  const [shapeOpId, setShapeOpId] = useState<number | null>(null);
  const [shapeSaving, setShapeSaving] = useState(false);
  // In-progress line: each map tap while this is set appends a vertex.
  // Kept separate from pendingShape (which only exists once the line has at
  // least its starting point AND the officer has tapped "Finish Line") so
  // the map's click handler can tell "still drawing" apart from "an
  // ordinary tap that should open the action chooser".
  const [drawingLine, setDrawingLine] = useState<{
    points: { lat: number; lng: number }[];
  } | null>(null);
  const draftShapeOverlayRef = useRef<
    | google.maps.Circle
    | google.maps.Rectangle
    | google.maps.Polygon
    | google.maps.Polyline
    | null
  >(null);
  // A sector's draft polygon path[0] means "center" for a plain wedge but
  // "first outer-arc point" once an inner radius is set — kept in sync
  // wherever the path is (re)built, so its dragend handler always has a
  // correct current reference to diff against, even after the officer has
  // toggled the inner-radius slider since the overlay was created (see
  // that handler for why a delta against this ref, not the point's
  // supposed identity, is what actually stays correct).
  const sectorDragAnchorRef = useRef<google.maps.LatLngLiteral | null>(null);
  // A rotated rectangle is edited the same way as a Polygon's rotation
  // can't be dragged natively: the officer still drags a plain axis-aligned
  // google.maps.Rectangle for position/size (draftShapeOverlayRef, kept
  // invisible once rotation != 0), while this companion Polygon is the
  // actual visible, rotated shape — rebuilt from that Rectangle's bounds +
  // the rotation slider (see the two effects below). Only ever non-null
  // while editing a rectangle; null/cleared for every other shape type.
  const draftRectRotatedOverlayRef = useRef<google.maps.Polygon | null>(null);
  // Mirrors drawingLine for the map's click listener (set up once in
  // handleMapReady, so it can't read the state value directly without
  // going stale — same reasoning as customMarkersDataRef above).
  const drawingLineRef = useRef<{
    points: { lat: number; lng: number }[];
  } | null>(null);
  useEffect(() => {
    drawingLineRef.current = drawingLine;
  }, [drawingLine]);
  // Visual reference for each tapped point while drawing a line — before
  // this, nothing marked where a tap actually landed until "Finish" closed
  // the line, so a mis-tap was invisible until the whole line was done. One
  // small dot per point, plus a thin preview connecting them once there are
  // at least two, both cleared and rebuilt on every tap (see the effect
  // near the other draft-shape-overlay effects below).
  const drawingLinePointMarkersRef = useRef<DivIconOverlay[]>([]);
  const drawingLinePreviewRef = useRef<google.maps.Polyline | null>(null);
  // mapShapesDataRef itself is declared below, right after the mapShape
  // query it mirrors (it can't be declared here — mapShapesData doesn't
  // exist yet at this point in the component).

  // Opens the edit panel for an existing shape, populating the draft state
  // from its current saved fields.
  const beginEditShape = useCallback((s: any) => {
    setShapeColour((s.colour as MarkerColour) ?? "blue");
    setShapeOpacity(s.opacity ?? 30);
    setShapeLabel(s.label ?? "");
    setShapeOpId(s.operationId ?? null);
    setShapeLineDashed(s.lineDashed ?? false);
    setShapeLineArrowEnd(s.lineArrowEnd ?? false);
    setPendingShape({
      id: s.id,
      shapeType: s.shapeType,
      centerLat: s.centerLat ?? undefined,
      centerLng: s.centerLng ?? undefined,
      radiusMeters: s.radiusMeters ?? undefined,
      startAngle: s.startAngle ?? undefined,
      endAngle: s.endAngle ?? undefined,
      innerRadiusMeters: s.innerRadiusMeters ?? 0,
      neLat: s.neLat ?? undefined,
      neLng: s.neLng ?? undefined,
      swLat: s.swLat ?? undefined,
      swLng: s.swLng ?? undefined,
      rotation: s.rotation ?? 0,
      points: s.points ?? undefined,
    });
  }, []);
  // Mirrored into a ref so beginCreateShape (declared earlier in the
  // component, before this value exists, and memoized with empty deps) can
  // read the current selection without closing over a stale snapshot from
  // its first render — same pattern as mapShapesDataRef/customMarkersDataRef.
  const effectiveOpIdsForMarkersRef = useRef<number[] | undefined>(undefined);

  // Starts placing a brand-new shape of `type` centred/anchored at the
  // tapped point, with sensible defaults an officer can then drag/resize
  // (circle/rectangle) or adjust via sliders (sector) before saving. Line
  // is different — it has no single "default size", so this instead starts
  // drawingLine's click-to-add-vertex mode rather than an immediate draft.
  const beginCreateShape = useCallback(
    (type: ShapeType, lat: number, lng: number) => {
      setShapeColour("blue");
      setShapeOpacity(30);
      setShapeLabel("");
      setShapeLineDashed(false);
      setShapeLineArrowEnd(false);
      const currentOpIds = effectiveOpIdsForMarkersRef.current;
      setShapeOpId(
        currentOpIds && currentOpIds.length === 1 ? currentOpIds[0] : null
      );
      if (type === "circle") {
        setPendingShape({
          id: null,
          shapeType: "circle",
          centerLat: lat,
          centerLng: lng,
          radiusMeters: DEFAULT_SHAPE_RADIUS_M,
        });
      } else if (type === "rectangle") {
        // Metres-per-degree approximation, fine at the scale this feature
        // operates at (tens to low hundreds of metres) — the officer can
        // drag-resize to the exact area needed afterwards anyway.
        const latOffset = DEFAULT_RECT_HALF_SIDE_M / 111_320;
        const lngOffset =
          DEFAULT_RECT_HALF_SIDE_M /
          (111_320 * Math.cos((lat * Math.PI) / 180));
        setPendingShape({
          id: null,
          shapeType: "rectangle",
          neLat: lat + latOffset,
          neLng: lng + lngOffset,
          swLat: lat - latOffset,
          swLng: lng - lngOffset,
          rotation: 0,
        });
      } else if (type === "sector") {
        setPendingShape({
          id: null,
          shapeType: "sector",
          centerLat: lat,
          centerLng: lng,
          radiusMeters: DEFAULT_SHAPE_RADIUS_M,
          startAngle: 0,
          endAngle: 90,
          innerRadiusMeters: 0,
        });
      } else {
        setDrawingLine({ points: [{ lat, lng }] });
      }
    },
    []
  );

  return {
    placingMarker,
    dismissedNoLocs,
    setDismissedNoLocs,
    pendingLatLng,
    setPendingLatLng,
    poiTap,
    setPoiTap,
    actionChooser,
    setActionChooser,
    streetViewPip,
    setStreetViewPip,
    flyView,
    setFlyView,
    flySelectedId,
    setFlySelectedId,
    targetFlagFlyRef,
    flyPick,
    setFlyPick,
    flyCenterRef,
    flyRotOverrideRef,
    flyRotSaveTimerRef,
    flyTilt,
    setFlyTilt,
    flyCameraReq,
    setFlyCameraReq,
    flyFollow,
    setFlyFollow,
    flyCentreReq,
    setFlyCentreReq,
    splitOn,
    setSplitOn,
    splitBox,
    setSplitBox,
    splitFollow,
    setSplitFollow,
    nearmapCentre,
    setNearmapCentre,
    splitAvailable,
    splitShown,
    imagesPip,
    setImagesPip,
    mapQeOpen,
    setMapQeOpen,
    mapQeTimeOverride,
    setMapQeTimeOverride,
    mapQeHour,
    setMapQeHour,
    mapQeMinute,
    setMapQeMinute,
    mapQePeriod,
    setMapQePeriod,
    mapQeRowDate,
    setMapQeRowDate,
    showMapQeDateStepper,
    setShowMapQeDateStepper,
    setMapQeSelectOpen,
    mapQeAddress,
    setMapQeAddress,
    mapQeMarkerIdRef,
    mapQeLatLng,
    setMapQeLatLng,
    mapQePoiPosRef,
    mapQePoiSignRef,
    cmLabel,
    setCmLabel,
    cmAddress,
    setCmAddress,
    cmNote,
    setCmNote,
    cmOpId,
    setCmOpId,
    cmPersons,
    setCmPersons,
    cmVehicles,
    setCmVehicles,
    cmIcon,
    setCmIcon,
    cmColour,
    setCmColour,
    cmRotation,
    setCmRotation,
    cmIconFilter,
    setCmIconFilter,
    cmLabelOnly,
    setCmLabelOnly,
    setCmPersonInput,
    setCmVehicleInput,
    cmSaving,
    setCmSaving,
    editingMarkerId,
    setEditingMarkerId,
    shapeTypePicker,
    setShapeTypePicker,
    pendingShape,
    setPendingShape,
    shapeColour,
    setShapeColour,
    shapeOpacity,
    setShapeOpacity,
    shapeLabel,
    setShapeLabel,
    shapeLineDashed,
    setShapeLineDashed,
    shapeLineArrowEnd,
    setShapeLineArrowEnd,
    shapeLineStyleRef,
    shapeOpId,
    setShapeOpId,
    shapeSaving,
    setShapeSaving,
    drawingLine,
    setDrawingLine,
    draftShapeOverlayRef,
    sectorDragAnchorRef,
    draftRectRotatedOverlayRef,
    drawingLineRef,
    drawingLinePointMarkersRef,
    drawingLinePreviewRef,
    beginEditShape,
    effectiveOpIdsForMarkersRef,
    beginCreateShape,
  };
}

export type MapPlacingState = ReturnType<typeof useMapPlacing>;
