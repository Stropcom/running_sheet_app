import { ClearInputButton } from "@/components/ClearInputButton";
import { fillRoute } from "@shared/parkingRoute";
import { ceasePlaceFor } from "@shared/ceaseRow";
import { CeaseRowButton } from "@/components/CeaseRowButton";
import { refreshTargetLocationTile } from "@/lib/targetLocationTile";
import { TargetLocationSection } from "@/components/TargetLocationSection";
import { orderRsChips } from "@shared/rsChips";
import {
  joinObservationPieces,
  justTypedSpaceAfterBracket,
  tidyObservation,
  tidyObservationAtCaret,
} from "@shared/observationTidy";
import {
  matchVehicleArrival,
  extractArrivalAddress,
} from "@shared/vehicleEventPatterns";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import { detectUnidentifiedRepeat } from "@shared/unidentified";
import {
  alightedWording,
  onTransitCards,
  transitBoardActions,
} from "@/lib/transitCards";
import { transitKindOfPlace } from "@shared/transitPlace";
import { seatedOccupantWording, seatsOf } from "@shared/vehicleSeats";
import { signIconOf } from "@shared/placeSigns";
import { enterNearbyOffers } from "@shared/enterNearby";
import { endedContinuityCard } from "@/lib/surveillanceCard";
import { popupShortAddress } from "@shared/markerLink";
import {
  locateTargetFromPending,
  vehiclesPeopleCanReach,
} from "@shared/targetPosition";
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
import {
  convertGoogleAddresses,
  formatIntelAddress,
  formatIntelVehicle,
} from "@/lib/addressFormat";
import {
  getCaretPixelPosition,
  detectMentionTrigger,
  detectVehicleMentionTrigger,
  detectAddressSpaceCompletion,
  detectPersonNameSpaceCompletion,
  extractOccupantNames,
  shortenAlreadyMentionedNames,
} from "@/lib/mentionAutocomplete";
import { MissingLocationAlert } from "@/components/MissingLocationAlert";
import { VagueVehicleMatchAlert } from "@/components/VagueVehicleMatchAlert";
import { SplitViewFrame } from "@/components/SplitViewFrame";
import { NearmapPip } from "@/components/NearmapPip";
import { NearmapAgeLabel } from "@/components/NearmapAgeLabel";
import {
  occupantsToVehicle,
  occupantWording,
  vehicleOccupants as sharedVehicleOccupants,
  occupantsStillInVehicle,
  splitPeopleNames,
  surnameTokens,
} from "@shared/walkEventPatterns";
import {
  pickSubjectCardKey,
  subjectCompanions,
  trackedTargetCode,
} from "@shared/trackedTarget";
import {
  ContinuityCards,
  type ContinuityCardData,
} from "@/components/ContinuityCards";
import { MyPillDialog } from "@/components/MyPillDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { MapView } from "@/components/Map";
import { SmeacMapOverlay } from "@/components/SmeacMapOverlay";
import { StreetViewPip } from "@/components/StreetViewPip";
import { Map3DView } from "@/components/Map3DView";
import { ImagesPip } from "@/components/ImagesPip";
import { addressMatchKey } from "@shared/addressMatchKey";
import { StreetHeadingBar } from "@/components/StreetHeadingBar";
import { UcoGuideMapOverlay } from "@/components/UcoGuideMapOverlay";
import { TargetProfileContent } from "@/components/TargetProfileContent";
import { OperationProfileContent } from "@/components/OperationProfileContent";
import SheetDetail from "@/pages/SheetDetail";
// The Images page's own folder/gallery levels, reused verbatim so the pane and
// the full page can't drift apart.
import { SheetFolderList, SheetGallery } from "@/pages/ImagesPage";
import { DocumentZoomViewer } from "@/components/DocumentZoomViewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { MapHeatOverlay } from "@/components/MapHeatOverlay";
import {
  TargetPredictorOverlay,
  TargetPredictorPinPopup,
  TargetPredictorSection,
} from "@/components/TargetPredictor";
import { HEAT_RAMP } from "@/lib/heatMapSection";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  VoiceInputButton,
  QE_HEADER_BUTTON_SIZE,
} from "@/components/VoiceInputButton";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Settings2,
  X,
  Radio,
  AlertTriangle,
  FolderOpen,
  Check,
  FolderSearch,
  ClipboardList,
  Send,
  User,
  Search,
  LocateFixed,
  Navigation2,
  ExternalLink,
  Clock,
  Image as ImageIcon,
  Undo2,
  Keyboard,
  Car,
  RefreshCw,
  Shapes,
  Circle as CircleIcon,
  Square,
  PieChart,
  Route,
  Compass,
  Crosshair,
  Hash,
  Pencil,
  Flame,
} from "lucide-react";
import {
  FlyRotationSlider,
  NorthUpButton,
  SURVEILLANCE_ICONS,
  TacticalIconGroupTiles,
} from "./intelligenceMapping/MapControls";
import {
  cardAddressMatch,
  poiAddressOf,
} from "./intelligenceMapping/addressMatch";
import {
  entityBlocksHtml,
  normalizeEntityLabelClient,
} from "./intelligenceMapping/infoWindow";
import { type LiveUser } from "./intelligenceMapping/mapTypes";
import {
  _addDaysToYmd,
  _formatPerthDateLabel,
  _getTodayPerthYmd,
} from "./intelligenceMapping/perthDates";
import {
  ALL_QUICK_LINK_OPTIONS,
  ICON_MAP,
  LS_QUICK_LINKS_KEY,
  type QuickLink,
} from "./intelligenceMapping/quickLinks";
import {
  DEFAULT_SHAPE_RADIUS_M,
  SHAPE_TYPE_LABELS,
} from "./intelligenceMapping/shapes";
import { useMapScreen } from "./intelligenceMapping/useMapScreen";

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IntelligenceMapping() {
  const s = useMapScreen();
  const {
    rsActionsPaneOpen,
    setRsActionsPaneOpen,
    handleMapAreaClick,
    smeacId,
    closeSmeacOverlay,
    ucoGuideId,
    closeUcoGuideOverlay,
    locsLoading,
    dismissedNoLocs,
    locations,
    customMarkers,
    selectedOpIds,
    selectedTargetIds,
    setDismissedNoLocs,
    placingMarker,
    mapDarkMode,
    drawingLineRef,
    longPressTimerRef,
    mapRef,
    setActionChooser,
    handleMapReady,
    mapInitialCenter,
    mapInitialZoom,
    mapInitialTypeId,
    flyView,
    flyChromeHidden,
    narrowScreen,
    openFly,
    closeFly,
    handleRefreshMapData,
    mapRefreshing,
    rightColShift,
    isMapActuallyVector,
    is3DActive,
    setIs3DActive,
    setNearmapOverlay,
    nearmapActive,
    ownPositionRef,
    followMode,
    setFollowMode,
    followModeRef,
    addrSearch,
    setAddrSearch,
    addrSearchDebounceRef,
    setAddrSuggestions,
    setAddrSearchOpen,
    autocompleteServiceRef,
    addrSuggestions,
    addrSearchPinRef,
    addrSearchOpen,
    geocoderRef,
    flyHeadingRef,
    setFlyHeadingQ,
    flyMarkers,
    setFlyTilt,
    flyCameraReq,
    flyFollow,
    user,
    deviceIdRef,
    flyCentreReq,
    setFlyPick,
    setFlySelectedId,
    setOnFootPopupOpen,
    flyOpenActionChooser,
    flyOpenPlace,
    flyCenterRef,
    splitShown,
    splitBox,
    splitFollow,
    setSplitFollow,
    setSplitBox,
    setSplitOn,
    flyHeadingQ,
    setFlyCameraReq,
    flyTilt,
    splitAvailable,
    splitOn,
    ownLiveEntry,
    showOwnLocation,
    setFlyCentreReq,
    setFlyFollow,
    flySelectedId,
    geocodedIntelRef,
    customMarkersDataRef,
    liveUsers,
    photoKeysRef,
    personPhotosByKeyRef,
    registeredPeopleLookupRef,
    pinOverridesRef,
    flyRotOverrideRef,
    flyTickRef,
    flyRotSaveTimerRef,
    savePinOverrideMut,
    updateCustomMarkerMut,
    setStreetViewPip,
    flyPick,
    mapReady,
    streetViewPip,
    imagesPip,
    personPhotosByKey,
    setImagesPip,
    nearmapCentre,
    heatOn,
    isInvestigator,
    showStreetHeadingBar,
    paneResizeDraggingRef,
    isMobile,
    activePaneWidth,
    PANE_MIN_WIDTH,
    paneSubViewOpen,
    setPanelWidthProfile,
    setPanelWidthNormal,
    paneTargetProfileId,
    setPaneTargetProfileId,
    paneOperationProfileId,
    setPaneOperationProfileId,
    paneImagesOpId,
    paneImagesSheetId,
    setPaneImagesSheetId,
    setPaneImagesOpId,
    paneSheetDetailId,
    setPaneSheetDetailId,
    rsInlineLabel,
    closeInlineField,
    setMapDarkMode,
    opsLoading,
    operations,
    opsDropdownOpen,
    setOpsDropdownOpen,
    setOpSearchQuery,
    multiOpMode,
    setMultiOpMode,
    clearAll,
    opSearchQuery,
    opTargetMap,
    opExpanded,
    handleOpRowClick,
    setOpExpanded,
    toggleTarget,
    rsSelectedSheetId,
    setRsSelectedSheetId,
    setRsLastEntry,
    setRsEditingLastEntry,
    rsSheetsData,
    handleSharingToggle,
    sharingEnabled,
    mustShare,
    gpsError,
    teamRows,
    collapsedTeams,
    setCollapsedTeams,
    toggleTeamVisibility,
    hiddenTeams,
    toggleUserTrace,
    tracedUserIds,
    toggleUserVisibility,
    hiddenUsers,
    unassignedLiveUsers,
    trackingSettings,
    targetFlagStatus,
    predictor,
    rsTargetData,
    activeMapOperationId,
    rsSelectedOpId,
    rsSelectedSheetTitle,
    showTargetLocation,
    setShowTargetLocation,
    setShowStreetHeadingBar,
    setNearbyOn,
    nearbyOn,
    setHeatOn,
    heatOpChoice,
    setHeatOpChoice,
    setHeatTargetChoice,
    heatOpName,
    heatTargetChoice,
    heatDefaultTargetName,
    heatTargets,
    heatTransparency,
    setHeatTransparency,
    heatError,
    heatLocations,
    setShowMarkerEntityCount,
    showMarkerEntityCount,
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
    vvKeyboardInset,
    vvOffsetTop,
    vvVisibleHeight,
    mapQeAddress,
    mapQeHour,
    setMapQeSelectOpen,
    setMapQeHour,
    setMapQeTimeOverride,
    mapQeMinute,
    mapQePeriod,
    setMapQeMinute,
    setMapQePeriod,
    setShowMapQeDateStepper,
    showMapQeDateStepper,
    setMapQeRowDate,
    mapQeRowDate,
    isTouchDevice,
    rsInlineTypingMode,
    handleVoiceTranscript,
    mapQeShortcutMap,
    toggleInlineTyping,
    undoInlineText,
    rsInlineUndoStack,
    rsInlineInputRef,
    rsInlineText,
    enableInlineTyping,
    rsInlineTypedRef,
    sentenceChips,
    rsInlineTypingPushRef,
    pushInlineUndo,
    setRsInlineText,
    resetInlineTimer,
    rsAddressField,
    closeRsMentionDropdown,
    closeRsVehicleMentionDropdown,
    rsUsedVehicleRegos,
    setRsVehicleMentionWord,
    setRsVehicleMentionActiveIndex,
    setRsVehicleMentionAnchor,
    rsVehicleMentionDebounceRef,
    setRsVehicleMentionQuery,
    rsUsedBracketCodes,
    setRsMentionWord,
    setRsMentionActiveIndex,
    setRsMentionAnchor,
    rsMentionDebounceRef,
    setRsMentionQuery,
    applyRsAddressPick,
    rsVehicleMentionWord,
    rsVehicleMentionSuggestions,
    selectRsVehicleMentionSuggestion,
    rsVehicleMentionActiveIndex,
    rsMentionWord,
    rsMentionSuggestions,
    selectRsMentionSuggestion,
    rsMentionActiveIndex,
    rsUsedAddressLabels,
    rsMentionAnchor,
    rsVehicleMentionAnchor,
    assignedTarget,
    rsEntityChips,
    setQeTargetPanelExpanded,
    qeTargetPanelExpanded,
    generalShortcuts,
    rsOwnRowShortcut,
    rsInlineRows,
    rsSurveillance,
    rsTrackedTarget,
    rsPendingArrivals,
    rsPendingDepartures,
    rsPendingWalkIns,
    rsPendingHeadingTo,
    rsPendingPlacements,
    utils,
    rsAddressMentionedData,
    rsUsedBracketCodesWithDraft,
    mapQeLatLng,
    placePosition,
    rsTargetPosition,
    rsContinuityDismissed,
    setContinuityDismissal,
    rsInlineCins,
    setRsInlineCins,
    rsInlineCinsRef,
    submitInlineField,
    rsAddingRow,
    rsLastEntry,
    rsEditingLastEntry,
    openLastEntryEdit,
    rsEditHour,
    setRsEditHour,
    rsEditMinute,
    setRsEditMinute,
    rsEditPeriod,
    setRsEditPeriod,
    rsEditText,
    setRsEditText,
    cancelLastEntryEdit,
    rsUpdateRow,
    saveLastEntryEdit,
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
    qeDupeQueue,
    qeDupeIndex,
    qeDupeDialogOpen,
    handleQeMissingLocationResolved,
    qeVagueVehicleBusy,
    handleQeVagueVehicleResolved,
    onFootPopupOpen,
    deviceId,
    setTrackAll,
    setOnFootMut,
  } = s;

  return (
    <DashboardLayout
      fillViewport
      rightPaneToggle={{
        isOpen: rsActionsPaneOpen,
        onToggle: () => setRsActionsPaneOpen(o => !o),
      }}
    >
      <div className="relative flex w-full h-full overflow-hidden">
        {/* ── Map Area ── */}
        <div className="flex-1 relative" onClick={handleMapAreaClick}>
          {/* SMEAC briefing overlay — docked over the map, not a separate
            page, so the live map stays visible/usable underneath. Inserted
            first (position:absolute ignores DOM order) with a z-index above
            the map's own floating controls so it always paints on top. */}
          {smeacId && (
            <SmeacMapOverlay briefingId={smeacId} onClose={closeSmeacOverlay} />
          )}
          {ucoGuideId && (
            <UcoGuideMapOverlay
              briefingId={ucoGuideId}
              onClose={closeUcoGuideOverlay}
            />
          )}

          {/* Loading overlay */}
          {locsLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
              <div className="flex flex-col items-center gap-3">
                <Spinner className="h-8 w-8" />
                <p className="text-sm text-muted-foreground">
                  Loading intelligence locations…
                </p>
              </div>
            </div>
          )}

          {/* Empty state — only show when there are also no custom markers, and user hasn't dismissed it */}
          {!locsLoading &&
            !dismissedNoLocs &&
            locations &&
            locations.length === 0 &&
            !(customMarkers && customMarkers.length > 0) && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
                <div className="relative bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2.5 shadow-md text-center max-w-[260px] flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {selectedOpIds.length > 0 || selectedTargetIds.length > 0
                      ? "No locations found for selected filters."
                      : "Select operations or targets in Map Settings to show locations."}
                  </p>
                  <button
                    onClick={() => setDismissedNoLocs(true)}
                    className="flex-shrink-0 ml-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

          {/* Placement mode indicator */}
          {placingMarker && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none">
              Tap &amp; hold to place marker
            </div>
          )}

          <div
            className="w-full h-full"
            style={
              mapDarkMode
                ? { filter: "brightness(0.6) invert(1) hue-rotate(180deg)" }
                : undefined
            }
            onTouchStart={e => {
              if (e.touches.length !== 1) return;
              // A long-press while drawing a line would pop the action
              // chooser open mid-draw — ordinary taps are how the officer
              // adds vertices in that mode, so suppress it here.
              if (drawingLineRef.current) return;
              const touch = e.touches[0];
              longPressTimerRef.current = setTimeout(() => {
                // Get map coordinates from touch position
                if (!mapRef.current) return;
                const mapDiv = mapRef.current.getDiv();
                const rect = mapDiv.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                const proj = mapRef.current.getProjection();
                if (!proj) return;
                const bounds = mapRef.current.getBounds();
                if (!bounds) return;
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                const mapWidth = rect.width;
                const mapHeight = rect.height;
                const lng = sw.lng() + (x / mapWidth) * (ne.lng() - sw.lng());
                const lat = ne.lat() - (y / mapHeight) * (ne.lat() - sw.lat());
                // Reverse geocode, then show action chooser
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode(
                  { location: { lat, lng } },
                  (results, status) => {
                    const addr =
                      status === "OK" && results && results[0]
                        ? results[0].formatted_address
                        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                    setActionChooser({
                      lat,
                      lng,
                      address: convertGoogleAddresses(addr),
                    });
                  }
                );
              }, 600);
            }}
            onTouchEnd={() => {
              if (longPressTimerRef.current)
                clearTimeout(longPressTimerRef.current);
            }}
            onTouchMove={() => {
              if (longPressTimerRef.current)
                clearTimeout(longPressTimerRef.current);
            }}
          >
            <MapView
              onMapReady={handleMapReady}
              className="w-full h-full"
              initialCenter={mapInitialCenter}
              initialZoom={mapInitialZoom}
              initialMapTypeId={mapInitialTypeId}
              hideMapTypeControl
              showStreetViewControl
            />

            {/* Map / Sat toggle — top-right, replaces Google's native
              mapTypeControl (see Map.tsx) so it can sit at a predictable,
              compact size next to the search bar instead of the SDK's own
              wider "Map"/"Satellite" control, which doesn't shrink or
              relabel and collided with the search bar on narrow screens. */}
            <div
              className={`absolute ${flyView && !flyChromeHidden ? "z-40" : "z-20"} pointer-events-auto flex ${
                narrowScreen
                  ? "flex-col items-end gap-1"
                  : "items-center bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden"
              }`}
              style={
                narrowScreen
                  ? { top: "10px", right: "10px" }
                  : { top: "10px", right: "10px", height: "36px" }
              }
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const renderOpt = (
                  opt: { id: "roadmap" | "hybrid" | "fly"; label: string },
                  divider: boolean
                ) => {
                  const active =
                    opt.id === "fly"
                      ? !!flyView
                      : !flyView && mapInitialTypeId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === "fly") {
                          if (!flyView) openFly();
                          return;
                        }
                        closeFly();
                        mapRef.current?.setMapTypeId(opt.id);
                      }}
                      className={`h-full text-xs font-semibold transition-colors ${
                        narrowScreen ? "w-11" : "px-3"
                      } ${
                        active
                          ? "bg-sky-600 text-white"
                          : "text-gray-600 hover:bg-gray-50"
                      } ${divider ? "border-r border-gray-200" : ""}`}
                    >
                      {opt.label}
                    </button>
                  );
                };
                const opts = [
                  { id: "roadmap", label: "Map" },
                  { id: "hybrid", label: "Sat" },
                  { id: "fly", label: "Fly" },
                ] as const;
                if (!narrowScreen)
                  return opts.map((o, i) => renderOpt(o, i < 2));
                // Phone: Map | Sat on top, Fly under Sat — an L, each piece
                // the same button width.
                const pill =
                  "flex h-9 items-center bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden";
                return (
                  <>
                    <div className={pill}>
                      {renderOpt(opts[0], true)}
                      {renderOpt(opts[1], false)}
                    </div>
                    <div className={pill}>{renderOpt(opts[2], false)}</div>
                  </>
                );
              })()}
            </div>

            {/* Refresh map data — right below the Map/Sat toggle. A pin can
              occasionally fail to populate (or only some do) if the
              locations query resolves before the map itself is ready; this
              gives officers an immediate, guaranteed fix instead of having
              to clear and reapply the operation filter to force one. */}
            <button
              onClick={e => {
                e.stopPropagation();
                void handleRefreshMapData();
              }}
              disabled={mapRefreshing}
              className="absolute z-20 pointer-events-auto flex items-center justify-center bg-white rounded-lg shadow-md border border-gray-200 h-9 w-9 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
              style={{ top: `${52 + rightColShift}px`, right: "10px" }}
              aria-label="Refresh map data"
              title="Refresh map data"
            >
              <RefreshCw
                className={`h-4 w-4 ${mapRefreshing ? "animate-spin" : ""}`}
              />
            </button>

            {/* 3D (tilt) toggle — right below Refresh. Tilt only works
              under vector rendering (see Map.tsx's MAP_ID_VECTOR/
              MAP_ID_RASTER); disabled with an explanatory title under
              raster so tapping it doesn't silently do nothing. */}
            <button
              onClick={e => {
                e.stopPropagation();
                if (!mapRef.current || !isMapActuallyVector) return;
                const next = is3DActive ? 0 : 45;
                mapRef.current.setTilt(next);
                setIs3DActive(next > 0);
              }}
              disabled={!isMapActuallyVector}
              className={`absolute z-20 pointer-events-auto flex items-center justify-center rounded-lg shadow-md border h-9 w-9 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                is3DActive
                  ? "bg-sky-600 border-sky-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
              style={{ top: `${94 + rightColShift}px`, right: "10px" }}
              aria-label="Toggle 3D view"
              title={
                isMapActuallyVector
                  ? is3DActive
                    ? "Switch to flat (2D) view"
                    : "Switch to 3D (tilted) view"
                  : "3D view requires Vector map rendering, which isn't available on this device"
              }
            >
              3D
            </button>

            {/* North Up — right below the 3D toggle. Vector rendering
              allows rotating the map (Shift+drag on desktop, twist gesture
              on mobile) with no auto-reset, so this re-aligns it on
              demand. The Navigation2 arrow visually rotates to point at
              true north given the map's current heading, so it doubles as
              a compass, not just a button. Its own component — see
              NorthUpButton's comment for why this isn't inline state on
              this page anymore. */}
            <NorthUpButton
              map={mapRef.current}
              isMapActuallyVector={isMapActuallyVector}
              top={130 + rightColShift}
            />

            {/* Nearmap aerial overlay — right below North Up. Adds/removes
              a google.maps.ImageMapType layer requesting tiles from our own
              /api/nearmap/tile proxy; the layer itself has no opinion on
              whether Nearmap is actually configured server-side — a
              misconfigured or missing NEARMAP_API_KEY just means every
              tile request 500s and the overlay silently shows nothing on
              top of the base map, so toggling it off again always works
              regardless. */}
            <button
              onClick={e => {
                e.stopPropagation();
                if (!mapRef.current) return;
                setNearmapOverlay(!nearmapActive);
              }}
              className={`absolute z-20 pointer-events-auto flex items-center justify-center rounded-lg shadow-md border h-9 w-9 text-[9px] font-bold leading-tight transition-colors ${
                nearmapActive
                  ? "bg-sky-600 border-sky-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
              style={{ top: `${166 + rightColShift}px`, right: "10px" }}
              aria-label="Toggle Nearmap aerial imagery"
              title={
                nearmapActive
                  ? "Hide Nearmap aerial imagery"
                  : "Show Nearmap aerial imagery"
              }
            >
              NM
            </button>

            {/* Centre on me / Follow me floating buttons — top-left below search bar */}
            <div
              className="absolute z-20 pointer-events-auto flex gap-1"
              style={{ top: "60px", left: "10px" }}
            >
              {/* Centre on me */}
              <button
                title="Centre on my location"
                onClick={e => {
                  e.stopPropagation();
                  if (!ownPositionRef.current) {
                    toast.error(
                      "Location not available — enable location sharing first"
                    );
                    return;
                  }
                  mapRef.current?.panTo(ownPositionRef.current);
                }}
                className="flex items-center justify-center bg-white rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                style={{ width: "40px", height: "40px" }}
              >
                <LocateFixed className="w-5 h-5 text-sky-600" />
              </button>
              {/* Follow me toggle */}
              <button
                title={
                  followMode
                    ? "Stop following my location"
                    : "Follow my location"
                }
                onClick={e => {
                  e.stopPropagation();
                  if (!followMode && !ownPositionRef.current) {
                    toast.error(
                      "Location not available — enable location sharing first"
                    );
                    return;
                  }
                  const next = !followMode;
                  setFollowMode(next);
                  followModeRef.current = next;
                  if (next && ownPositionRef.current) {
                    mapRef.current?.panTo(ownPositionRef.current);
                  }
                }}
                className={`flex items-center justify-center rounded-lg shadow-md border transition-colors ${
                  followMode
                    ? "bg-sky-600 border-sky-700 hover:bg-sky-700"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
                style={{ width: "40px", height: "40px" }}
              >
                <Navigation2
                  className={`w-5 h-5 ${followMode ? "text-white" : "text-sky-600"}`}
                />
              </button>
            </div>

            {/* Floating address search bar — top-left, next to our own Map/Sat
              toggle above (a fixed ~76px, unlike Google's native control it
              replaces). Capping maxWidth to leave that clearance keeps them
              apart at any viewport width without a resize listener. */}
            <div
              className="absolute z-20 pointer-events-auto"
              style={{ top: "10px", left: "10px" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="relative">
                <div
                  className="flex items-center bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden"
                  style={{
                    height: "40px",
                    minWidth: "160px",
                    maxWidth: "min(260px, calc(100vw - 120px))",
                  }}
                >
                  <Search className="w-4 h-4 text-gray-400 ml-3 shrink-0" />
                  <input
                    type="text"
                    value={addrSearch}
                    placeholder="Search address or business…"
                    className="flex-1 px-2 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
                    style={{ height: "40px" }}
                    onChange={e => {
                      const val = e.target.value;
                      setAddrSearch(val);
                      if (addrSearchDebounceRef.current)
                        clearTimeout(addrSearchDebounceRef.current);
                      if (!val.trim()) {
                        setAddrSuggestions([]);
                        setAddrSearchOpen(false);
                        return;
                      }
                      addrSearchDebounceRef.current = setTimeout(() => {
                        if (!autocompleteServiceRef.current) return;
                        const mapCentre = mapRef.current?.getCenter();
                        // No `types` restriction — Google Places only allows one
                        // type-category filter at a time (or none), and omitting
                        // it is the only way to get both street addresses and
                        // business/establishment results in the same search.
                        const addrRequest: google.maps.places.AutocompletionRequest =
                          {
                            input: val,
                            componentRestrictions: { country: "au" },
                          };
                        if (mapCentre) {
                          addrRequest.locationBias = new google.maps.Circle({
                            center: {
                              lat: mapCentre.lat(),
                              lng: mapCentre.lng(),
                            },
                            radius: 50000, // 50 km bias around current map centre
                          });
                        }
                        autocompleteServiceRef.current.getPlacePredictions(
                          addrRequest,
                          (predictions, status) => {
                            if (
                              status ===
                                google.maps.places.PlacesServiceStatus.OK &&
                              predictions
                            ) {
                              setAddrSuggestions(predictions);
                              setAddrSearchOpen(true);
                            } else {
                              setAddrSuggestions([]);
                              setAddrSearchOpen(false);
                            }
                          }
                        );
                      }, 300);
                    }}
                    onFocus={() => {
                      if (addrSuggestions.length > 0) setAddrSearchOpen(true);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Escape") {
                        setAddrSearch("");
                        setAddrSuggestions([]);
                        setAddrSearchOpen(false);
                      }
                    }}
                  />
                  {addrSearch && (
                    <button
                      className="mr-2 text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setAddrSearch("");
                        setAddrSuggestions([]);
                        setAddrSearchOpen(false);
                        if (addrSearchPinRef.current) {
                          addrSearchPinRef.current.map = null;
                          addrSearchPinRef.current = null;
                        }
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {addrSearchOpen && addrSuggestions.length > 0 && (
                  <div
                    className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
                    style={{ minWidth: "260px", maxWidth: "320px", zIndex: 30 }}
                  >
                    {addrSuggestions.map(s => (
                      <button
                        key={s.place_id}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-start gap-2"
                        onClick={() => {
                          setAddrSearch(s.description);
                          setAddrSuggestions([]);
                          setAddrSearchOpen(false);
                          // Geocode the selected place and pan map
                          if (!geocoderRef.current || !mapRef.current) return;
                          geocoderRef.current.geocode(
                            { placeId: s.place_id },
                            (results, status) => {
                              if (status === "OK" && results && results[0]) {
                                const loc = results[0].geometry.location;
                                mapRef.current!.panTo(loc);
                                mapRef.current!.setZoom(17);
                                // Drop a temporary search pin
                                if (addrSearchPinRef.current) {
                                  addrSearchPinRef.current.map = null;
                                }
                                const pinEl = document.createElement("div");
                                pinEl.innerHTML = `<div style="width:36px;height:36px;background:#4285f4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`;
                                const pin = new DivIconOverlay({
                                  map: mapRef.current!,
                                  position: { lat: loc.lat(), lng: loc.lng() },
                                  content: pinEl,
                                  title: s.description,
                                });
                                addrSearchPinRef.current = pin;
                                // Clicking the blue pin shows the action chooser
                                pin.addListener("gmp-click", () => {
                                  setActionChooser({
                                    lat: loc.lat(),
                                    lng: loc.lng(),
                                    address: convertGoogleAddresses(
                                      s.description
                                    ),
                                  });
                                });
                              }
                            }
                          );
                        }}
                      >
                        <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <span className="leading-snug">{s.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {flyView && (
            <>
              <Map3DView
                className="absolute inset-0 z-30"
                center={flyView.center}
                range={flyView.range}
                tilt={flyView.tilt}
                heading={flyView.heading}
                onHeadingChange={h => {
                  flyHeadingRef.current = h;
                  setFlyHeadingQ(h);
                }}
                markers={flyMarkers}
                shapes={flyView.shapes}
                onTiltChange={setFlyTilt}
                cameraRequest={flyCameraReq}
                followId={
                  flyFollow && user
                    ? `team:${user.id}_${deviceIdRef.current}`
                    : null
                }
                centerRequest={flyCentreReq}
                onMarkerClick={id => {
                  setFlyPick(null);
                  // Your own pill opens "My Pill", as on the
                  // flat map.
                  if (user && id === `team:${user.id}_${deviceIdRef.current}`) {
                    setFlySelectedId(null);
                    setOnFootPopupOpen(true);
                    return;
                  }
                  setFlySelectedId(id);
                }}
                onLocationAction={flyOpenActionChooser}
                onPlaceClick={flyOpenPlace}
                onGroundClick={(lat, lng) => {
                  setFlySelectedId(null);
                  setFlyPick({ lat, lng });
                }}
                onActionUnavailable={() =>
                  toast.info(
                    "The 3D map didn't report that spot. Tap the spot once, then choose Add here."
                  )
                }
                onCenterChange={c => {
                  flyCenterRef.current = c;
                }}
              />
              {/* Fly + Nearmap split view: the small movable, resizable
                Nearmap window, with a Follow button and the photo date. */}
              {splitShown && flyView && (
                <SplitViewFrame
                  box={splitBox}
                  title="Nearmap"
                  following={splitFollow}
                  onFollowChange={setSplitFollow}
                  onBoxChange={setSplitBox}
                  onClose={() => setSplitOn(false)}
                >
                  <NearmapPip
                    follow={splitFollow}
                    initial={{
                      lat: flyView.center.lat,
                      lng: flyView.center.lng,
                      range: flyView.range,
                    }}
                  />
                </SplitViewFrame>
              )}
              {/* North up and 0° tilt — under the Map | Sat | Fly toggle */}
              <div
                className={`absolute z-40 pointer-events-auto flex flex-col gap-1 ${flyChromeHidden ? "hidden" : ""}`}
                style={{ top: `${52 + rightColShift}px`, right: "10px" }}
              >
                <button
                  title={
                    flyHeadingQ === 0 ? "Already North Up" : "Turn to North Up"
                  }
                  disabled={flyHeadingQ === 0}
                  onClick={e => {
                    e.stopPropagation();
                    setFlyCameraReq(prev => ({
                      heading: 0,
                      n: (prev?.n ?? 0) + 1,
                    }));
                  }}
                  className="flex items-center justify-center bg-white rounded-lg shadow-md border border-gray-200 h-9 w-9 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Turn the 3D view to North Up"
                >
                  <Navigation2
                    className="w-4 h-4 text-sky-600 transition-transform"
                    style={{ transform: `rotate(${-flyHeadingQ}deg)` }}
                  />
                </button>
                <button
                  title={
                    flyTilt === 0
                      ? "Already looking straight down"
                      : "Look straight down (0° tilt)"
                  }
                  disabled={flyTilt === 0}
                  onClick={e => {
                    e.stopPropagation();
                    setFlyCameraReq(prev => ({
                      tilt: 0,
                      n: (prev?.n ?? 0) + 1,
                    }));
                  }}
                  className="flex items-center justify-center bg-white rounded-lg shadow-md border border-gray-200 h-9 w-9 text-[11px] font-bold text-sky-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Look straight down, 0 degree tilt"
                >
                  0°
                </button>
                {splitAvailable && (
                  <button
                    title={
                      splitOn
                        ? "Hide the Nearmap window"
                        : "Show the Nearmap window"
                    }
                    aria-label={
                      splitOn
                        ? "Hide the Nearmap window"
                        : "Show the Nearmap window"
                    }
                    aria-pressed={splitOn}
                    onClick={e => {
                      e.stopPropagation();
                      setSplitOn(v => !v);
                    }}
                    className={`flex items-center justify-center rounded-lg shadow-md border h-9 w-9 text-[9px] font-bold leading-tight transition-colors ${
                      splitOn
                        ? "bg-sky-600 border-sky-600 text-white"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    NM
                  </button>
                )}
              </div>
              {/* Centre on me / Follow me — same two buttons as the flat map */}
              <div
                className={`absolute z-40 pointer-events-auto flex gap-1 ${flyChromeHidden ? "hidden" : ""}`}
                style={{ top: "60px", left: "10px" }}
              >
                <button
                  title="Centre on my location"
                  onClick={e => {
                    e.stopPropagation();
                    if (!ownLiveEntry || !showOwnLocation) {
                      toast.error(
                        "Location not available — enable location sharing first"
                      );
                      return;
                    }
                    setFlyCentreReq(prev => ({
                      lat: ownLiveEntry.lat,
                      lng: ownLiveEntry.lng,
                      n: (prev?.n ?? 0) + 1,
                    }));
                  }}
                  className="flex items-center justify-center bg-white rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                  style={{ width: "40px", height: "40px" }}
                >
                  <LocateFixed className="w-5 h-5 text-sky-600" />
                </button>
                <button
                  title={
                    flyFollow
                      ? "Stop following my location"
                      : "Follow my location"
                  }
                  onClick={e => {
                    e.stopPropagation();
                    if (!flyFollow && (!ownLiveEntry || !showOwnLocation)) {
                      toast.error(
                        "Location not available — enable location sharing first"
                      );
                      return;
                    }
                    setFlyFollow(f => !f);
                  }}
                  className={`flex items-center justify-center rounded-lg shadow-md border transition-colors ${
                    flyFollow
                      ? "bg-sky-600 border-sky-700 hover:bg-sky-700"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                  style={{ width: "40px", height: "40px" }}
                >
                  <Navigation2
                    className={`w-5 h-5 ${flyFollow ? "text-white" : "text-sky-600"}`}
                  />
                </button>
              </div>
              {(() => {
                if (!flySelectedId) return null;
                const kind = flySelectedId.slice(0, flySelectedId.indexOf(":"));
                const key = flySelectedId.slice(flySelectedId.indexOf(":") + 1);
                const entry =
                  kind === "intel" ? geocodedIntelRef.current.get(key) : null;
                const cm =
                  kind === "cm"
                    ? customMarkersDataRef.current.find(
                        (c: any) => String(c.id) === key
                      )
                    : null;
                const member =
                  kind === "team"
                    ? ((liveUsers as LiveUser[] | undefined) ?? []).find(
                        u => `${u.userId}_${u.deviceId}` === key
                      )
                    : null;
                if (!entry && !cm && !member) return null;
                const lat = entry
                  ? entry.position.lat
                  : cm
                    ? cm.lat
                    : member!.lat;
                const lng = entry
                  ? entry.position.lng
                  : cm
                    ? cm.lng
                    : member!.lng;
                const photoLabel = entry
                  ? entry.loc.label
                  : (cm?.address ?? "");
                const hasPhotos =
                  !!photoLabel &&
                  (photoKeysRef.current.has(
                    normalizeEntityLabelClient(photoLabel)
                  ) ||
                    personPhotosByKeyRef.current.has(
                      addressMatchKey(photoLabel)
                    ));
                const html = entry
                  ? entityBlocksHtml(
                      entry.loc,
                      registeredPeopleLookupRef.current
                    )
                  : member
                    ? `<strong style="font-size:13px">${member.name}</strong><div style="font-size:12px;color:#555">${member.teamName ?? "Team member"}</div>`
                    : `<strong style="font-size:13px">${cm.label ?? "Marker"}</strong>${
                        cm.address
                          ? `<div style="font-size:12px">${cm.address}</div>`
                          : ""
                      }${
                        cm.note
                          ? `<div style="font-size:12px;margin-top:4px">${cm.note}</div>`
                          : ""
                      }`;
                const bridge = window as any;
                const btn =
                  "flex-1 text-center text-xs font-semibold rounded-md py-2 text-white";
                const streetLabel = entry
                  ? formatIntelAddress(entry.loc.label)
                  : (cm?.label ?? member?.name ?? "Street View");
                // Edit / Move work on the flat map: Edit opens its dialog
                // here; Move returns to the flat map and starts the move.
                const startMove = () => {
                  closeFly();
                  window.setTimeout(() => {
                    if (entry) bridge.__intelStartMove?.(entry.loc.label);
                    else if (cm) bridge.__cmStartMove?.(cm.id);
                  }, 400);
                };
                return (
                  <div
                    className={`absolute z-40 left-3 bottom-3 w-[min(22rem,calc(100%-1.5rem))] rounded-lg bg-white text-gray-900 shadow-xl border border-gray-200 p-3 ${flyChromeHidden ? "hidden" : ""}`}
                  >
                    <button
                      onClick={() => setFlySelectedId(null)}
                      className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                      aria-label="Close details"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div
                      className="pr-6 max-h-48 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                    {(cm || (entry && entry.loc.type !== "target_address")) &&
                      (() => {
                        const override = entry
                          ? pinOverridesRef.current.get(entry.loc.label)
                          : null;
                        const iconName = entry
                          ? (override?.markerIcon ??
                            signIconOf(entry.loc.label) ??
                            "house_filled")
                          : (cm.markerIcon ?? "pin");
                        const colourName = entry
                          ? (override?.markerColour ?? "purple")
                          : (cm.markerColour ?? "blue");
                        return (
                          <FlyRotationSlider
                            key={flySelectedId}
                            initial={
                              flyRotOverrideRef.current.get(flySelectedId) ??
                              (entry ? override?.rotation : cm.rotation) ??
                              0
                            }
                            iconUrl={getMarkerIconUrl(
                              iconName,
                              colourName as MarkerColour
                            )}
                            onChange={rotation => {
                              const id = flySelectedId;
                              flyRotOverrideRef.current.set(id, rotation);
                              flyTickRef.current?.();
                              if (flyRotSaveTimerRef.current)
                                clearTimeout(flyRotSaveTimerRef.current);
                              flyRotSaveTimerRef.current = setTimeout(() => {
                                const done = () =>
                                  window.setTimeout(() => {
                                    flyRotOverrideRef.current.delete(id);
                                    flyTickRef.current?.();
                                  }, 1500);
                                if (entry)
                                  savePinOverrideMut.mutate(
                                    { label: entry.loc.label, rotation },
                                    { onSettled: done }
                                  );
                                else
                                  updateCustomMarkerMut.mutate(
                                    { id: cm.id, rotation },
                                    { onSettled: done }
                                  );
                              }, 400);
                            }}
                          />
                        );
                      })()}
                    {!member && (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          className={`${btn} bg-indigo-500`}
                          onClick={() =>
                            entry
                              ? bridge.__intelRsQuickEntry?.(entry.loc.label)
                              : bridge.__cmRsQuickEntry?.(cm.id)
                          }
                        >
                          RS Quick Entry
                        </button>
                        {hasPhotos && (
                          <button
                            className={`${btn} bg-emerald-500`}
                            onClick={() =>
                              bridge.__mapOpenImagesPip?.(photoLabel)
                            }
                          >
                            Images
                          </button>
                        )}
                        <a
                          className={`${btn} bg-cyan-500`}
                          href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Waze
                        </a>
                      </div>
                    )}
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        className={`${btn} bg-blue-500`}
                        onClick={() =>
                          setStreetViewPip({ lat, lng, label: streetLabel })
                        }
                      >
                        Street View
                      </button>
                      {!member && (
                        <>
                          <button
                            className={`${btn} bg-green-600`}
                            onClick={() =>
                              entry
                                ? bridge.__intelOpenEditDialog?.(
                                    entry.loc.label
                                  )
                                : bridge.__editCustomMarker?.(cm.id)
                            }
                          >
                            Edit
                          </button>
                          <button
                            className={`${btn} bg-sky-700`}
                            onClick={startMove}
                          >
                            Move…
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              {flyPick && !flySelectedId && (
                <div
                  className={`absolute z-40 left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-2 rounded-lg bg-white text-gray-900 shadow-xl border border-gray-200 px-3 py-2 ${flyChromeHidden ? "hidden" : ""}`}
                >
                  <span className="text-xs text-gray-600">Selected spot</span>
                  <button
                    className="rounded-md bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5"
                    onClick={() =>
                      flyOpenActionChooser(flyPick.lat, flyPick.lng)
                    }
                  >
                    Add here…
                  </button>
                  <button
                    onClick={() => setFlyPick(null)}
                    className="h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}

          <StreetViewPip
            map={mapReady ? mapRef.current : null}
            request={streetViewPip}
            onClose={() => setStreetViewPip(null)}
          />

          {imagesPip && (
            <ImagesPip
              label={imagesPip.label}
              personPhotos={personPhotosByKey.get(
                addressMatchKey(imagesPip.label)
              )}
              onClose={() => setImagesPip(null)}
            />
          )}

          {/* Nearmap photo date — bottom-left, only while Nearmap is on over the
              flat map (in Fly the small window carries its own date strip).
              Sits above Google's logo, and above the Heat Map key when that
              is showing too. */}
          {nearmapActive && !flyView && nearmapCentre && (
            <div
              className={`absolute left-3 z-20 max-w-[calc(100%-1.5rem)] pointer-events-none ${
                heatOn && !isInvestigator ? "bottom-[8.5rem]" : "bottom-9"
              }`}
            >
              <NearmapAgeLabel centre={nearmapCentre} variant="map" />
            </div>
          )}

          {/* Heat Map key — bottom-left, only while the heat map is on. Sits
              above Google's own logo/copyright strip, and is hidden while a
              Fly-mode card is using that corner. */}
          {heatOn && !isInvestigator && !flySelectedId && (
            <div className="absolute left-3 bottom-9 z-20 w-48 rounded-lg border border-border bg-card px-3 py-2 shadow-sm pointer-events-none">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Observation density
              </p>
              <div
                className="h-2 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${HEAT_RAMP.join(",")})`,
                }}
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Fewer</span>
                <span>More</span>
              </div>
            </div>
          )}

          {showStreetHeadingBar && ownLiveEntry && (
            <StreetHeadingBar
              lat={ownLiveEntry.lat}
              lng={ownLiveEntry.lng}
              heading={ownLiveEntry.heading}
            />
          )}

          {/* RS Actions pane is now opened via the header folder-expander icon
            (DashboardLayout's rightPaneToggle prop) instead of a draggable
            side tab — see the DashboardLayout invocation below. */}
        </div>

        {/* ── RS Actions Right Pane ──
           z-30 + full viewport width on mobile: the map's floating overlays
           (search bar, locate buttons, bottom pill bar) are absolutely
           positioned within Map Area and don't shrink/clip with it, so on a
           narrow screen a partial-width pane still leaves them spilling over
           its content underneath. The left pane never showed this because it
           opens flush against the same top-left corner those specific
           overlays already anchor to, so it happens to cover them outright;
           the right pane has no such natural overlap, so it needs to be
           explicit here — full width (nothing beside it to spill into) and a
           z-index above the overlays' z-20 (nothing paints over it either),
           giving it the same "full vision" the left pane already has. */}
        <div
          data-testid="right-pane"
          data-open={rsActionsPaneOpen ? "true" : "false"}
          className={`relative flex h-full flex-col border-l-[3px] border-primary/40 bg-card shadow-2xl flex-shrink-0 ${
            rsActionsPaneOpen ? "z-30" : ""
          } ${
            paneResizeDraggingRef.current ? "" : "transition-all duration-200"
          } ${rsActionsPaneOpen ? "rounded-l-2xl" : "overflow-hidden"}`}
          style={{
            width: rsActionsPaneOpen
              ? isMobile
                ? "100vw"
                : `${activePaneWidth}px`
              : 0,
            minWidth: rsActionsPaneOpen
              ? isMobile
                ? "100vw"
                : `${PANE_MIN_WIDTH}px`
              : 0,
          }}
        >
          {/* Resize handle — drag left edge to widen/narrow the pane (mouse or touch). Not on mobile: the pane is full-width there, nothing to resize against. */}
          {rsActionsPaneOpen && !isMobile && (
            <div
              className="absolute -left-1.5 top-0 bottom-0 w-3 z-10 flex items-center justify-center cursor-col-resize touch-none select-none group"
              title="Drag to resize"
              onMouseDown={e => {
                e.stopPropagation();
                paneResizeDraggingRef.current = true;
                const startX = e.clientX;
                const startWidth = activePaneWidth;
                const onMove = (me: MouseEvent) => {
                  const delta = startX - me.clientX;
                  const maxW = Math.max(
                    PANE_MIN_WIDTH,
                    Math.min(720, window.innerWidth - 320)
                  );
                  const next = Math.min(
                    maxW,
                    Math.max(PANE_MIN_WIDTH, startWidth + delta)
                  );
                  if (paneSubViewOpen) setPanelWidthProfile(next);
                  else setPanelWidthNormal(next);
                };
                const onUp = () => {
                  paneResizeDraggingRef.current = false;
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
              onTouchStart={e => {
                e.stopPropagation();
                paneResizeDraggingRef.current = true;
                const startX = e.touches[0].clientX;
                const startWidth = activePaneWidth;
                const onMove = (te: TouchEvent) => {
                  const delta = startX - te.touches[0].clientX;
                  const maxW = Math.max(
                    PANE_MIN_WIDTH,
                    Math.min(720, window.innerWidth - 320)
                  );
                  const next = Math.min(
                    maxW,
                    Math.max(PANE_MIN_WIDTH, startWidth + delta)
                  );
                  if (paneSubViewOpen) setPanelWidthProfile(next);
                  else setPanelWidthNormal(next);
                };
                const onEnd = () => {
                  paneResizeDraggingRef.current = false;
                  document.removeEventListener("touchmove", onMove);
                  document.removeEventListener("touchend", onEnd);
                };
                document.addEventListener("touchmove", onMove, {
                  passive: true,
                });
                document.addEventListener("touchend", onEnd);
              }}
            >
              <div className="w-1 h-12 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
            </div>
          )}

          {/* Pane Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-primary/20 flex-shrink-0 bg-primary/[0.06]">
            {paneTargetProfileId !== null ? (
              <button
                onClick={() => setPaneTargetProfileId(null)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-violet-500 flex-shrink-0" />
                <User className="h-4 w-4 text-violet-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Target Profile
                </span>
              </button>
            ) : paneOperationProfileId !== null ? (
              <button
                onClick={() => setPaneOperationProfileId(null)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Operation Profile
                </span>
              </button>
            ) : paneImagesOpId !== null ? (
              <button
                onClick={() => {
                  // Back steps one level at a time: a sheet's photos -> that
                  // operation's sheet folders -> out to the settings list.
                  if (paneImagesSheetId !== null) setPaneImagesSheetId(null);
                  else setPaneImagesOpId(null);
                }}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-cyan-500 flex-shrink-0" />
                <ImageIcon className="h-4 w-4 text-cyan-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Operation Images
                </span>
              </button>
            ) : paneSheetDetailId !== null ? (
              <button
                onClick={() => setPaneSheetDetailId(null)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-teal-500 flex-shrink-0" />
                <ClipboardList className="h-4 w-4 text-teal-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Running Sheet
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <span className="font-bold text-sm tracking-tight">
                  Map Settings
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl flex-shrink-0"
              onClick={() => {
                setRsActionsPaneOpen(false);
                setPaneTargetProfileId(null);
                setPaneOperationProfileId(null);
                setPaneImagesOpId(null);
                setPaneImagesSheetId(null);
                setPaneSheetDetailId(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Pane Body */}
          {paneTargetProfileId !== null ? (
            <div className="flex-1 overflow-hidden">
              <DocumentZoomViewer contentWidth={768} className="w-full h-full">
                <TargetProfileContent targetId={paneTargetProfileId} />
              </DocumentZoomViewer>
            </div>
          ) : paneOperationProfileId !== null ? (
            <div className="flex-1 overflow-hidden">
              <DocumentZoomViewer contentWidth={768} className="w-full h-full">
                <OperationProfileContent operationId={paneOperationProfileId} />
              </DocumentZoomViewer>
            </div>
          ) : paneImagesOpId !== null ? (
            // The Images page's own two levels, rendered inline. Plain scroll
            // rather than DocumentZoomViewer: this is an interactive gallery
            // (upload, link, delete, lightbox), not a document to zoom.
            <div className="flex-1 overflow-y-auto">
              {paneImagesSheetId !== null ? (
                <SheetGallery
                  operationId={paneImagesOpId}
                  sheetId={paneImagesSheetId}
                  onBack={() => setPaneImagesSheetId(null)}
                  hideBackButton
                />
              ) : (
                <SheetFolderList
                  operationId={paneImagesOpId}
                  onBack={() => setPaneImagesOpId(null)}
                  onSelect={id => setPaneImagesSheetId(id)}
                  hideBackButton
                />
              )}
            </div>
          ) : paneSheetDetailId !== null ? (
            // The full SheetDetail page component itself, embedded — plain
            // scroll rather than DocumentZoomViewer since it's an
            // interactive edit surface (rows, certification, roster), not a
            // document to zoom. `embedded` hides its own page chrome (back
            // arrow, Summary/Governance tabs) since this pane already
            // supplies a header/close control and those would otherwise
            // navigate the whole app away from the map.
            <div className="flex-1 overflow-y-auto">
              <SheetDetail sheetIdProp={paneSheetDetailId} embedded />
            </div>
          ) : (
            <div
              className="flex-1 overflow-y-auto"
              onClick={() => {
                if (rsInlineLabel) closeInlineField();
              }}
            >
              {/* ── MAP THEME toggle ── */}
              <div className="px-3 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Map Theme
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-medium transition-colors ${!mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      Light
                    </span>
                    <Switch
                      checked={mapDarkMode}
                      onCheckedChange={setMapDarkMode}
                      className="scale-90"
                    />
                    <span
                      className={`text-[11px] font-medium transition-colors ${mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      Dark
                    </span>
                  </div>
                </div>
              </div>

              {/* ── OPERATIONS section ── */}
              <div className="px-3 py-3 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                  Operations
                </span>
                {opsLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Spinner className="h-4 w-4" />
                  </div>
                ) : !operations || operations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    No operations found.
                  </p>
                ) : isInvestigator ? (
                  // Investigator accounts don't get a picker at all — just a
                  // static readout of their allocated operation(s), locked
                  // by the effect above and re-enforced server-side.
                  <div className="w-full px-3 py-2 rounded-xl border-2 border-purple-500/30 bg-purple-500/5 text-xs text-foreground">
                    {(operations as any[])
                      .filter((op: any) => selectedOpIds.includes(op.id))
                      .map((op: any) => op.name)
                      .join(", ") || "No operation allocated"}
                  </div>
                ) : (
                  <Popover
                    open={opsDropdownOpen}
                    onOpenChange={open => {
                      setOpsDropdownOpen(open);
                      if (!open) setOpSearchQuery("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-border bg-background hover:bg-accent/50 active:scale-[0.98] transition-all text-left">
                        <span className="text-xs text-foreground truncate flex-1">
                          {selectedOpIds.length === 0
                            ? "Select operation…"
                            : selectedOpIds.length ===
                                (operations as any[]).length
                              ? "All operations"
                              : (operations as any[])
                                  .filter((op: any) =>
                                    selectedOpIds.includes(op.id)
                                  )
                                  .map((op: any) => op.name)
                                  .join(", ")}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-2 rounded-xl border-2 border-border shadow-xl"
                      align="end"
                    >
                      <div className="flex items-center justify-between px-1 pb-2 border-b border-border mb-2">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {multiOpMode
                            ? "Select Operations"
                            : "Select Operation"}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setMultiOpMode(v => !v)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                              multiOpMode
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                : "text-muted-foreground hover:text-foreground border-border hover:bg-accent/50"
                            }`}
                          >
                            Multi
                          </button>
                          <button
                            onClick={clearAll}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="relative mb-1.5">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          value={opSearchQuery}
                          onChange={e => setOpSearchQuery(e.target.value)}
                          placeholder="Search operations…"
                          className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <ClearInputButton
                          value={opSearchQuery}
                          onClear={() => setOpSearchQuery("")}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                        {(operations as any[])
                          .filter((op: any) =>
                            op.name
                              .toLowerCase()
                              .includes(opSearchQuery.trim().toLowerCase())
                          )
                          .map(op => {
                            const opTargets = opTargetMap.get(op.id) ?? [];
                            const isOpSelected = selectedOpIds.includes(op.id);
                            const isExpanded = opExpanded.has(op.id);
                            return (
                              <div key={op.id}>
                                <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors">
                                  <Checkbox
                                    id={`rp-op-${op.id}`}
                                    checked={isOpSelected}
                                    onCheckedChange={() =>
                                      handleOpRowClick(op.id)
                                    }
                                    className="h-4 w-4"
                                  />
                                  <label
                                    htmlFor={`rp-op-${op.id}`}
                                    className="flex-1 text-sm cursor-pointer truncate font-medium"
                                  >
                                    {op.name}
                                  </label>
                                  {opTargets.length > 0 && (
                                    <button
                                      onClick={() =>
                                        setOpExpanded(prev => {
                                          const next = new Set(prev);
                                          next.has(op.id)
                                            ? next.delete(op.id)
                                            : next.add(op.id);
                                          return next;
                                        })
                                      }
                                      className="text-muted-foreground hover:text-foreground p-0.5"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                                {isExpanded && opTargets.length > 0 && (
                                  <div className="ml-6 pl-2 border-l border-border/50 flex flex-col gap-0.5 mb-1">
                                    {opTargets.map(t => (
                                      <div
                                        key={t.id}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/40 transition-colors"
                                      >
                                        <Checkbox
                                          id={`rp-tgt-${t.id}`}
                                          checked={selectedTargetIds.includes(
                                            t.id
                                          )}
                                          onCheckedChange={() =>
                                            toggleTarget(t.id)
                                          }
                                          className="h-3.5 w-3.5"
                                        />
                                        <label
                                          htmlFor={`rp-tgt-${t.id}`}
                                          className="text-xs cursor-pointer truncate text-muted-foreground"
                                        >
                                          {t.name}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        {(operations as any[]).filter((op: any) =>
                          op.name
                            .toLowerCase()
                            .includes(opSearchQuery.trim().toLowerCase())
                        ).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            No operations match "{opSearchQuery}".
                          </p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* ── RS SELECTION section ── */}
              <div className="px-3 py-3 border-b border-border space-y-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  RS Selection
                </span>

                {/* No ops selected — prompt user */}
                {selectedOpIds.length === 0 && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Select an operation above to see available running sheets.
                  </p>
                )}

                {/* Running sheet selector — driven by top Operations filter */}
                {selectedOpIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={
                        rsSelectedSheetId !== null
                          ? String(rsSelectedSheetId)
                          : ""
                      }
                      onValueChange={val => {
                        setRsSelectedSheetId(Number(val));
                        setRsLastEntry(null);
                        setRsEditingLastEntry(false);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9 text-xs rounded-xl border-2">
                        <SelectValue placeholder="Choose running sheet…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(rsSheetsData ?? [])
                          .filter((s: any) => !s.closedAt && !s.deletedAt)
                          .map((s: any) => (
                            <SelectItem
                              key={s.id}
                              value={String(s.id)}
                              className="text-xs"
                            >
                              {s.title || `Sheet #${s.id}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {rsSelectedSheetId !== null && (
                      <button
                        onClick={() => {
                          setRsSelectedSheetId(null);
                          setRsLastEntry(null);
                          setRsEditingLastEntry(false);
                        }}
                        className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border-2 border-border bg-muted/40 hover:bg-destructive/20 hover:border-destructive/40 active:scale-95 transition-all"
                        title="Clear running sheet selection"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}

                {/* Open the selected sheet inline (view + edit) without
                    leaving the map — same "colour-coded link" pattern as
                    the Operation Profile / Images links below, so this
                    reads as one consistent set of pane shortcuts. Unlike
                    those, stays open until the pane's own back arrow / X is
                    used (not on a map tap), since it's an active edit
                    surface, not a read view. */}
                {rsSelectedSheetId !== null && (
                  <button
                    onClick={() => {
                      setPaneSheetDetailId(rsSelectedSheetId);
                      setPaneTargetProfileId(null);
                      setPaneOperationProfileId(null);
                      setPaneImagesOpId(null);
                      setPaneImagesSheetId(null);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 active:scale-[0.98] transition-all min-w-0"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-teal-500 truncate flex-1 text-left">
                      Open Running Sheet
                    </span>
                    <ExternalLink className="h-3 w-3 text-teal-500/60 flex-shrink-0" />
                  </button>
                )}

                {/* RS Quick Entry is reached via the map's own action
                    chooser / POI tap sheets, or a marker's own popup —
                    no dedicated entry point needed here. */}
              </div>
              {/* end RS Selection */}

              {/* ── PROFILES (one per selected operation, driven by the
                Operations filter above — not the RS selection, so it's
                available as soon as an operation is picked even with no
                running sheet chosen yet, and shows one link per operation
                when more than one is selected) ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Profiles
                </span>
                {selectedOpIds.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Select an operation above to open its profile.
                  </p>
                ) : (
                  (operations as any[] | undefined)
                    ?.filter((op: any) => selectedOpIds.includes(op.id))
                    .map((op: any) => (
                      <button
                        key={op.id}
                        onClick={() => {
                          setPaneOperationProfileId(op.id);
                          setPaneTargetProfileId(null);
                          setPaneImagesOpId(null);
                          setPaneImagesSheetId(null);
                          setPaneSheetDetailId(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 active:scale-[0.98] transition-all min-w-0"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-blue-500 truncate flex-1 text-left">
                          {op.name}
                        </span>
                        <ExternalLink className="h-3 w-3 text-blue-500/60 flex-shrink-0" />
                      </button>
                    ))
                )}
              </div>
              {/* end Profiles */}

              {/* ── IMAGES (one per selected operation, same
                Operations-filter-driven pattern as Profiles above, and
                labelled with the operation's own name rather than a
                generic "Operation Images" so multiple operations' links
                are distinguishable) ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Images
                </span>
                {selectedOpIds.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Select an operation above to open its images.
                  </p>
                ) : (
                  (operations as any[] | undefined)
                    ?.filter((op: any) => selectedOpIds.includes(op.id))
                    .map((op: any) => (
                      <button
                        key={op.id}
                        onClick={() => {
                          setPaneImagesOpId(op.id);
                          setPaneImagesSheetId(null);
                          setPaneTargetProfileId(null);
                          setPaneOperationProfileId(null);
                          setPaneSheetDetailId(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 active:scale-[0.98] transition-all min-w-0"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-cyan-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-cyan-500 truncate flex-1 text-left">
                          {op.name} Images
                        </span>
                        <ExternalLink className="h-3 w-3 text-cyan-500/60 flex-shrink-0" />
                      </button>
                    ))
                )}
              </div>
              {/* end Images */}

              {/* ── LOCATION (own section, so sharing your position is a
                deliberate act with its own heading rather than a small switch
                tucked into the Teams header) ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Location
                </span>
                <button
                  onClick={() => handleSharingToggle(!sharingEnabled)}
                  disabled={mustShare}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 disabled:cursor-default disabled:opacity-100 disabled:active:scale-100 ${
                    sharingEnabled
                      ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={sharingEnabled}
                >
                  <Radio
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      sharingEnabled
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      sharingEnabled ? "text-emerald-500" : "text-foreground"
                    }`}
                  >
                    Show &amp; Share
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      sharingEnabled
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {sharingEnabled ? "On" : "Off"}
                  </span>
                </button>
              </div>
              {/* end Location */}

              {/* ── TEAMS (Live Location) — the roster PANEL (per-team
                  hide/collapse, member list) isn't shown to Investigator
                  accounts, but their map still renders every officer's
                  live pin same as everyone else's (see the userLocations
                  query above) — they just can't filter/hide by team from
                  here, and don't get the Location section's page-mate
                  wall-of-names view either. */}
              {!isInvestigator && (
                <div className="px-3 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        TEAMS
                      </span>
                    </div>
                  </div>

                  {/* GPS error */}
                  {gpsError && (
                    <div className="flex items-start gap-1.5 mb-3 p-2.5 rounded-xl border-2 border-amber-500/30 bg-amber-500/10">
                      <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-[10px] text-amber-400 leading-tight">
                        {gpsError}
                      </span>
                    </div>
                  )}

                  {/* Team rows — collapsible with memory */}
                  <div className="flex flex-col gap-2">
                    {teamRows.map(
                      ({ key, label, colour, users: teamUsers }) => {
                        const isCollapsed = collapsedTeams.has(key);
                        return (
                          <div
                            key={key}
                            className="rounded-xl border-2 border-border overflow-hidden"
                          >
                            {/* Team header — tap to collapse/expand */}
                            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                              <button
                                onClick={() =>
                                  setCollapsedTeams(prev => {
                                    const next = new Set(prev);
                                    next.has(key)
                                      ? next.delete(key)
                                      : next.add(key);
                                    return next;
                                  })
                                }
                                className="flex items-center gap-2 flex-1 min-w-0"
                              >
                                <div
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ background: colour }}
                                />
                                <span
                                  className="text-[11px] font-semibold"
                                  style={{ color: colour }}
                                >
                                  {label}
                                </span>
                                {teamUsers.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ({teamUsers.length})
                                  </span>
                                )}
                                {isCollapsed ? (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                                )}
                              </button>
                              <button
                                onClick={() => toggleTeamVisibility(key)}
                                className="ml-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0 px-2.5 py-1 rounded-md border border-border/50 bg-background/50 transition-colors"
                              >
                                {hiddenTeams.has(key) ? "Show" : "Hide"}
                              </button>
                            </div>
                            {/* Team members — shown when not collapsed */}
                            {!isCollapsed && (
                              <div className="px-3 py-2 border-t border-border bg-card">
                                {teamUsers.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic">
                                    No units online
                                  </p>
                                ) : (
                                  <div className="flex flex-col gap-0.5">
                                    {teamUsers.map(u => (
                                      <div
                                        key={u.userId}
                                        className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30"
                                      >
                                        <span className="text-[11px] text-foreground font-medium truncate">
                                          {u.name.toUpperCase()}
                                          {u.userId === user?.id && (
                                            <span className="ml-1 text-[9px] text-muted-foreground">
                                              (you)
                                            </span>
                                          )}
                                        </span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <button
                                            onClick={() =>
                                              toggleUserTrace(u.userId)
                                            }
                                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                                              tracedUserIds.has(u.userId)
                                                ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                                                : "border-border/50 text-muted-foreground hover:text-foreground bg-background/50"
                                            }`}
                                          >
                                            {tracedUserIds.has(u.userId)
                                              ? "Tracking"
                                              : "Track"}
                                          </button>
                                          <button
                                            onClick={() =>
                                              toggleUserVisibility(u.userId)
                                            }
                                            className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
                                          >
                                            {hiddenUsers.has(u.userId)
                                              ? "Show"
                                              : "Hide"}
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}

                    {/* Unassigned users */}
                    {unassignedLiveUsers.length > 0 &&
                      (() => {
                        const isCollapsed = collapsedTeams.has("null");
                        return (
                          <div className="rounded-xl border-2 border-border overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                              <button
                                onClick={() =>
                                  setCollapsedTeams(prev => {
                                    const next = new Set(prev);
                                    next.has("null")
                                      ? next.delete("null")
                                      : next.add("null");
                                    return next;
                                  })
                                }
                                className="flex items-center gap-2 flex-1 min-w-0"
                              >
                                <div className="w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0" />
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  Unassigned
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  ({unassignedLiveUsers.length})
                                </span>
                                {isCollapsed ? (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                                )}
                              </button>
                              <button
                                onClick={() => toggleTeamVisibility("null")}
                                className="ml-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0 px-2.5 py-1 rounded-md border border-border/50 bg-background/50 transition-colors"
                              >
                                {hiddenTeams.has("null") ? "Show" : "Hide"}
                              </button>
                            </div>
                            {!isCollapsed && (
                              <div className="px-3 py-2 border-t border-border bg-card">
                                <div className="flex flex-col gap-0.5">
                                  {unassignedLiveUsers.map(u => (
                                    <div
                                      key={u.userId}
                                      className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30"
                                    >
                                      <span className="text-[11px] text-foreground font-medium truncate">
                                        {u.name.toUpperCase()}
                                        {u.userId === user?.id && (
                                          <span className="ml-1 text-[9px] text-muted-foreground">
                                            (you)
                                          </span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                          onClick={() =>
                                            toggleUserTrace(u.userId)
                                          }
                                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                                            tracedUserIds.has(u.userId)
                                              ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                                              : "border-border/50 text-muted-foreground hover:text-foreground bg-background/50"
                                          }`}
                                        >
                                          {tracedUserIds.has(u.userId)
                                            ? "Tracking"
                                            : "Track"}
                                        </button>
                                        <button
                                          onClick={() =>
                                            toggleUserVisibility(u.userId)
                                          }
                                          className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                          {hiddenUsers.has(u.userId)
                                            ? "Show"
                                            : "Hide"}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                </div>
              )}
              {/* end TEAMS */}

              {/* ── TARGET LOGGER — same on/off pattern as the sections
                above. The first switch is the whole feature (the Target
                logger panel on the running sheet and in the quick-entry
                popup); the second is the flag marking where the target is,
                and only applies while tracking is on. Per device. ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Target Logger
                </span>
                {[
                  {
                    key: "tracking",
                    label: "Target logger",
                    on: trackingSettings.tracking,
                    toggle: () =>
                      trackingSettings.setTracking(!trackingSettings.tracking),
                    disabled: false,
                    Icon: Crosshair,
                  },
                  {
                    key: "location",
                    label: "Target location",
                    on: trackingSettings.location,
                    toggle: () =>
                      trackingSettings.setLocation(
                        !trackingSettings.locationSetting
                      ),
                    disabled: !trackingSettings.tracking,
                    Icon: MapPin,
                  },
                ].map(({ key, label, on, toggle, disabled, Icon }) => (
                  <button
                    key={key}
                    onClick={toggle}
                    disabled={disabled}
                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 disabled:opacity-50 disabled:active:scale-100 ${
                      on
                        ? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
                        : "border-border bg-card hover:bg-accent/40"
                    }`}
                    aria-pressed={on}
                    title={
                      disabled ? "Turn Target logger on to use this" : undefined
                    }
                  >
                    <Icon
                      className={`h-3.5 w-3.5 flex-shrink-0 ${
                        on ? "text-sky-500" : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold truncate flex-1 text-left ${
                        on ? "text-sky-500" : "text-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                        on ? "text-sky-500" : "text-muted-foreground"
                      }`}
                    >
                      {on ? "On" : "Off"}
                    </span>
                  </button>
                ))}
                {!trackingSettings.tracking && (
                  <p className="text-[11px] text-muted-foreground">
                    Target location needs Target logger on.
                  </p>
                )}
                {trackingSettings.location && targetFlagStatus && (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {targetFlagStatus}
                  </p>
                )}
              </div>
              {/* end Target Logger */}

              {/* ── SEARCH — one button, off by default. On: a search for the
                team on the selected sheet's target — a pin where he was last
                seen and two rings round it for how far he could have got.
                Plain arithmetic, nothing sent anywhere. Not for map-only
                Investigator accounts (the history isn't open to them). ── */}
              {!isInvestigator && (
                <TargetPredictorSection
                  p={predictor}
                  targetName={rsTargetData?.name ?? null}
                  operationName={
                    (
                      (operations ?? []) as Array<{ id: number; name: string }>
                    ).find(
                      o => o.id === (activeMapOperationId ?? rsSelectedOpId)
                    )?.name ?? null
                  }
                  sheetTitle={rsSelectedSheetTitle ?? null}
                />
              )}
              {/* end Search */}

              {/* ── TARGET LOCATION — one switch, off by default. On: the
                markers tied to the target of the active running sheet (by the
                Target Registry or its running sheets) get a soft tile in their
                own colour. Not for map-only Investigator accounts. ── */}
              {!isInvestigator && (
                <TargetLocationSection
                  on={showTargetLocation}
                  onToggle={() => setShowTargetLocation(v => !v)}
                  targetName={rsTargetData?.name ?? null}
                  hasSheet={rsSelectedSheetId !== null}
                />
              )}
              {/* end Target Location */}

              {/* ── STREET & HEADING — own section, same on/off pattern as
                Location's "Show & Share" above: a deliberate toggle with
                its own heading rather than a switch buried elsewhere. ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Street &amp; Heading
                </span>
                <button
                  onClick={() => setShowStreetHeadingBar(!showStreetHeadingBar)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                    showStreetHeadingBar
                      ? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={showStreetHeadingBar}
                >
                  <Compass
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      showStreetHeadingBar
                        ? "text-sky-500"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      showStreetHeadingBar ? "text-sky-500" : "text-foreground"
                    }`}
                  >
                    Current Street &amp; Direction
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      showStreetHeadingBar
                        ? "text-sky-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {showStreetHeadingBar ? "On" : "Off"}
                  </span>
                </button>
              </div>
              {/* end Street & Heading */}

              {/* ── NEARBY LOCATION — one switch, off by default. On: every
                Intelligence Folder / Target Registry location within 500 m
                of you is shown as a diamond, with a translucent 500 m area,
                in addition to the normal pins. ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Nearby Location
                </span>
                <button
                  onClick={() => setNearbyOn(v => !v)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                    nearbyOn
                      ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={nearbyOn}
                >
                  <LocateFixed
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      nearbyOn ? "text-amber-500" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      nearbyOn ? "text-amber-500" : "text-foreground"
                    }`}
                  >
                    Nearby location
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      nearbyOn ? "text-amber-500" : "text-muted-foreground"
                    }`}
                  >
                    {nearbyOn ? "On" : "Off"}
                  </span>
                </button>
              </div>
              {/* end Nearby Location */}

              {/* ── HEAT MAP — one switch, off by default. On: a soft fade
                at every place seen for the chosen operation (and target),
                all time, under the normal pins. Not for map-only
                Investigator accounts (the report's data isn't open to them). ── */}
              {!isInvestigator && (
                <div className="px-3 py-3 border-b border-border space-y-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                    Heat Map
                  </span>
                  <button
                    onClick={() => setHeatOn(v => !v)}
                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                      heatOn
                        ? "border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20"
                        : "border-border bg-card hover:bg-accent/40"
                    }`}
                    aria-pressed={heatOn}
                  >
                    <Flame
                      className={`h-3.5 w-3.5 flex-shrink-0 ${
                        heatOn ? "text-orange-500" : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold truncate flex-1 text-left ${
                        heatOn ? "text-orange-500" : "text-foreground"
                      }`}
                    >
                      Heat map
                    </span>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                        heatOn ? "text-orange-500" : "text-muted-foreground"
                      }`}
                    >
                      {heatOn ? "On" : "Off"}
                    </span>
                  </button>
                  {heatOn && (
                    <div className="space-y-2">
                      <Select
                        value={
                          heatOpChoice === "auto"
                            ? "auto"
                            : String(heatOpChoice)
                        }
                        onValueChange={v => {
                          setHeatOpChoice(v === "auto" ? "auto" : Number(v));
                          setHeatTargetChoice("auto");
                        }}
                      >
                        <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                          <SelectValue placeholder="Operation…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            Current{heatOpName ? ` — ${heatOpName}` : ""}
                          </SelectItem>
                          {(
                            (operations ?? []) as Array<{
                              id: number;
                              name: string;
                            }>
                          ).map(o => (
                            <SelectItem key={o.id} value={String(o.id)}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={
                          heatTargetChoice === "auto"
                            ? "auto"
                            : String(heatTargetChoice)
                        }
                        onValueChange={v =>
                          setHeatTargetChoice(
                            v === "auto" || v === "all" ? v : Number(v)
                          )
                        }
                      >
                        <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                          <SelectValue placeholder="Target…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            Current — {heatDefaultTargetName ?? "All targets"}
                          </SelectItem>
                          <SelectItem value="all">All targets</SelectItem>
                          {(
                            (heatTargets ?? []) as Array<{
                              id: number;
                              name: string;
                            }>
                          ).map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Transparency
                          </span>
                          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                            {heatTransparency}%
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={80}
                          step={5}
                          value={[heatTransparency]}
                          onValueChange={v => setHeatTransparency(v[0] ?? 30)}
                          aria-label="Heat map transparency"
                        />
                      </div>
                      {heatError && (
                        <p className="text-[11px] leading-snug text-red-500">
                          The heat map isn&apos;t available for this operation.
                        </p>
                      )}
                      {!heatError &&
                        heatLocations &&
                        heatLocations.length === 0 && (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Nothing to show for this selection.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              )}
              {/* end Heat Map */}

              {/* ── MARKER ENTITY COUNT — same on/off pattern as Street &
                Heading: the number on a house marker is the total distinct
                people and vehicles linked to it. ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Marker Entity Count
                </span>
                <button
                  onClick={() =>
                    setShowMarkerEntityCount(!showMarkerEntityCount)
                  }
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                    showMarkerEntityCount
                      ? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={showMarkerEntityCount}
                >
                  <Hash
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      showMarkerEntityCount
                        ? "text-sky-500"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      showMarkerEntityCount ? "text-sky-500" : "text-foreground"
                    }`}
                  >
                    Entity count on markers
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      showMarkerEntityCount
                        ? "text-sky-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {showMarkerEntityCount ? "On" : "Off"}
                  </span>
                </button>
              </div>
              {/* end Marker Entity Count */}
            </div>
          )}
          {/* end Pane Body */}
        </div>
        {/* end RS Actions Right Pane */}

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
                    Choose up to 3 custom shortcut folders (laptop: 3, tablet:
                    2, mobile: 1)
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
                  const iconColour =
                    iconEntry?.colour ?? "text-muted-foreground";
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
                {quickLinks.length}/2 slots used — Operations and active sheet
                are always shown
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
                  setDrawingLine(d =>
                    d ? { points: d.points.slice(0, -1) } : d
                  )
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
                      value={
                        pendingShape.radiusMeters ?? DEFAULT_SHAPE_RADIUS_M
                      }
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
                        innerRadiusMeters:
                          pendingShape.innerRadiusMeters ?? null,
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
                    Intel pins must be visible on the map (not already merged)
                    to appear here.
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
                        if (
                          !existingList.find(e => e.label === enriched.label)
                        ) {
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
                          const marker = customMarkerMapRefs.current.get(
                            orig.id
                          );
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
                    {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(
                      col => (
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
                      )
                    )}
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
                      img.src = getMarkerIconUrl(
                        intelEditIcon,
                        intelEditColour
                      );
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

        {/* ── Map RS Quick Entry Modal ── */}
        {mapQeOpen && (
          // fixed, not absolute: DashboardLayout's <main> is overflow-hidden,
          // so an `absolute inset-0` descendant is bounded by it rather than
          // the true window — and the inner card's height was pinned to a
          // static `90vh`/`92vh`, computed against the full layout viewport,
          // which mobile Safari/Chrome don't shrink when the on-screen
          // keyboard opens (only `window.visualViewport` does). Combined,
          // that left the card sized for a screen that no longer matched
          // what was actually visible above the keyboard: the observation
          // textarea itself stayed compact, but the rest of the oversized
          // card rendered as a large blank gap next to the keyboard rather
          // than shrinking to fit. Same fix already applied to the Custom
          // Marker Placement Modal further below — `fixed` escapes the
          // clipping, and `useVisualViewportInset`'s `vvVisibleHeight` caps
          // the card against the keyboard-adjusted visible height instead.
          <div
            className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-3 pt-6 md:p-4 md:pt-10"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
              // Keyboard open and the visible area panned down the page: fit
              // the overlay to exactly the visible area above the keyboard,
              // so the card isn't left floating with a blank band beneath it.
              ...(vvKeyboardInset > 0 || vvOffsetTop > 1
                ? {
                    top: vvOffsetTop,
                    bottom: "auto",
                    height: vvVisibleHeight,
                  }
                : {}),
            }}
            onClick={() => {
              setMapQeOpen(false);
              setMapQeAddress("");
              setRsEditingLastEntry(false);
              closeInlineField();
            }}
          >
            <div
              className="no-scrollbar w-full max-w-lg md:max-w-3xl lg:max-w-5xl bg-card border border-border rounded-2xl shadow-2xl p-5 pb-6 md:p-6 lg:p-8 overflow-y-auto"
              style={{ maxHeight: Math.round(vvVisibleHeight * 0.9) }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4 lg:mb-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm md:text-base lg:text-lg font-bold text-foreground">
                    RS Quick Entry
                  </p>
                  <p className="text-[11px] md:text-xs lg:text-sm text-muted-foreground mt-0.5 truncate">
                    {mapQeAddress}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMapQeOpen(false);
                    setMapQeAddress("");
                    setRsEditingLastEntry(false);
                    closeInlineField();
                  }}
                  className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </div>

              {/* Time picker — slim inline row with Now + Date buttons */}
              <div className="flex items-center gap-1 md:gap-1.5 mb-2 lg:mb-3 flex-wrap">
                <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-[10px] md:text-xs text-muted-foreground font-medium mr-0.5">
                  Time:
                </span>
                {/* Hour */}
                <Select
                  value={mapQeHour}
                  onOpenChange={o => setMapQeSelectOpen(o)}
                  onValueChange={v => {
                    setMapQeHour(v);
                    setMapQeTimeOverride(
                      `${String(parseInt(v)).padStart(2, "0")}:${mapQeMinute} ${mapQePeriod}`
                    );
                  }}
                >
                  <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                      h => (
                        <SelectItem
                          key={h}
                          value={h}
                          className="font-mono text-xs"
                        >
                          {String(parseInt(h)).padStart(2, "0")}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-mono text-[11px] md:text-sm">
                  :
                </span>
                {/* Minute */}
                <Select
                  value={mapQeMinute}
                  onOpenChange={o => setMapQeSelectOpen(o)}
                  onValueChange={v => {
                    setMapQeMinute(v);
                    setMapQeTimeOverride(
                      `${String(parseInt(mapQeHour)).padStart(2, "0")}:${v} ${mapQePeriod}`
                    );
                  }}
                >
                  <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 60 }, (_, i) =>
                      String(i).padStart(2, "0")
                    ).map(m => (
                      <SelectItem
                        key={m}
                        value={m}
                        className="font-mono text-xs"
                      >
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* AM/PM */}
                <Select
                  value={mapQePeriod}
                  onOpenChange={o => setMapQeSelectOpen(o)}
                  onValueChange={v => {
                    setMapQePeriod(v);
                    setMapQeTimeOverride(
                      `${String(parseInt(mapQeHour)).padStart(2, "0")}:${mapQeMinute} ${v}`
                    );
                  }}
                >
                  <SelectTrigger className="w-14 h-6 text-[11px] px-1.5 py-0 md:w-16 md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM" className="text-xs">
                      AM
                    </SelectItem>
                    <SelectItem value="PM" className="text-xs">
                      PM
                    </SelectItem>
                  </SelectContent>
                </Select>
                {/* Now button — inline */}
                <button
                  type="button"
                  onClick={() => {
                    const n = new Date();
                    const h24 = n.getHours();
                    const min = n.getMinutes();
                    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                    const ampm = h24 < 12 ? "AM" : "PM";
                    setMapQeHour(String(h12));
                    setMapQeMinute(String(min).padStart(2, "0"));
                    setMapQePeriod(ampm);
                    setMapQeTimeOverride(
                      `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`
                    );
                  }}
                  className="h-6 px-2 text-[10px] font-medium rounded border border-border bg-muted/30 hover:bg-accent/50 active:scale-95 transition-all whitespace-nowrap md:h-8 md:px-3 md:text-xs"
                >
                  Now
                </button>
                {/* Date button — toggles stepper */}
                <button
                  type="button"
                  onClick={() => setShowMapQeDateStepper(v => !v)}
                  className={`h-6 px-2 text-[10px] font-medium rounded border transition-all whitespace-nowrap active:scale-95 md:h-8 md:px-3 md:text-xs ${
                    showMapQeDateStepper
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/30 hover:bg-accent/50"
                  }`}
                >
                  Date
                </button>
              </div>

              {/* Date stepper — only visible when Date button is toggled on */}
              {showMapQeDateStepper && (
                <div className="flex items-center justify-between mb-2 px-1 py-1 rounded-md border border-border/70 bg-muted/30">
                  <button
                    type="button"
                    className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() =>
                      setMapQeRowDate(_addDaysToYmd(mapQeRowDate, -1))
                    }
                  >
                    ◀
                  </button>
                  <span className="text-[11px] font-semibold tracking-widest text-foreground font-mono">
                    {_formatPerthDateLabel(mapQeRowDate)}
                  </span>
                  <button
                    type="button"
                    className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() =>
                      setMapQeRowDate(_addDaysToYmd(mapQeRowDate, 1))
                    }
                  >
                    ▶
                  </button>
                </div>
              )}

              {/* No sheet selected warning */}
              {rsSelectedSheetId === null ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 md:px-4 md:py-4 text-center">
                  <p className="text-xs md:text-sm font-semibold text-amber-400 mb-1">
                    No running sheet selected
                  </p>
                  <p className="text-[11px] md:text-xs text-muted-foreground">
                    Select an operation and running sheet in the right panel
                    first, then tap &amp; hold the map again.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {/* ARR panel removed per user request */}

                  {/* Inline observation field */}
                  {rsInlineLabel &&
                    (() => {
                      const selectedSheet = (
                        rsSheetsData as any[] | undefined
                      )?.find((s: any) => s.id === rsSelectedSheetId);
                      const rosterCins: string[] = [];
                      if (selectedSheet?.sheetCins) {
                        try {
                          const parsed: Array<{
                            cin: string;
                            isTeamLeader?: boolean;
                          }> =
                            typeof selectedSheet.sheetCins === "string"
                              ? JSON.parse(selectedSheet.sheetCins)
                              : selectedSheet.sheetCins;
                          parsed
                            .sort((a, b) => {
                              if (a.isTeamLeader && !b.isTeamLeader) return -1;
                              if (!a.isTeamLeader && b.isTeamLeader) return 1;
                              const numA = parseInt(a.cin ?? "", 10);
                              const numB = parseInt(b.cin ?? "", 10);
                              if (!isNaN(numA) && !isNaN(numB))
                                return numA - numB;
                              return (a.cin ?? "").localeCompare(b.cin ?? "");
                            })
                            .forEach(c => {
                              if (c.cin) rosterCins.push(c.cin);
                            });
                        } catch {
                          /* ignore */
                        }
                      }
                      const inlineReadOnly =
                        isTouchDevice && !rsInlineTypingMode;
                      return (
                        <div
                          className="rounded-lg border border-border bg-muted/40 p-2.5 md:p-3.5 flex flex-col gap-2 md:gap-2.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            {/* Voice sits right next to the label, not
                                grouped with Keyboard/Undo — it's the
                                primary way of filling this field in a
                                hurry, so it belongs next to what it's
                                filling in, not tucked away on the far
                                side with the secondary controls. */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                Observation
                              </span>
                              <VoiceInputButton
                                onTranscript={handleVoiceTranscript}
                                shortcutMap={mapQeShortcutMap}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              {/* Only meaningful on touch devices — desktop's
                                  observation field is always editable (see
                                  useIsTouchDevice above), so this toggle
                                  would have nothing to switch there. */}
                              {isTouchDevice && (
                                <button
                                  type="button"
                                  onClick={toggleInlineTyping}
                                  title={
                                    rsInlineTypingMode
                                      ? "Switch back to chip-click only"
                                      : "Switch to keyboard typing"
                                  }
                                  className={`${QE_HEADER_BUTTON_SIZE} hover:bg-accent/50 ${
                                    rsInlineTypingMode
                                      ? "border-primary/50 text-primary bg-primary/10"
                                      : "border-border text-muted-foreground"
                                  }`}
                                >
                                  <Keyboard className="h-4 w-4" />
                                  <span className="hidden sm:inline">
                                    Keyboard
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={undoInlineText}
                                disabled={rsInlineUndoStack.length === 0}
                                title="Undo"
                                className={`${QE_HEADER_BUTTON_SIZE} border-border text-muted-foreground hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none`}
                              >
                                <Undo2 className="h-4 w-4" />
                                <span className="hidden sm:inline">Undo</span>
                              </button>
                            </div>
                          </div>
                          <textarea
                            ref={rsInlineInputRef}
                            value={rsInlineText}
                            readOnly={inlineReadOnly}
                            autoCapitalize="off"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            onClick={() => {
                              if (inlineReadOnly) enableInlineTyping();
                            }}
                            onChange={e => {
                              let next = e.target.value;
                              // Typed by hand (not added by a chip): the
                              // tidy-up pass may run on this entry.
                              rsInlineTypedRef.current = true;
                              // A space typed right after a bracket tidies
                              // what has been typed so far (vehicle lists,
                              // spaces, capitals — shared/observationTidy.ts).
                              const typedAt =
                                e.target.selectionStart ?? next.length;
                              if (justTypedSpaceAfterBracket(next, typedAt)) {
                                const joined = tidyObservationAtCaret(
                                  next,
                                  typedAt,
                                  false,
                                  { sentenceChips }
                                );
                                if (joined.changed) {
                                  next = joined.text;
                                  const ta = e.target;
                                  const caret = joined.caret;
                                  requestAnimationFrame(() =>
                                    ta.setSelectionRange(caret, caret)
                                  );
                                }
                              }
                              const now = Date.now();
                              // Group rapid keystrokes into a single undo step; only
                              // snapshot when there's been a pause since the last one.
                              if (now - rsInlineTypingPushRef.current > 600) {
                                pushInlineUndo(rsInlineText);
                              }
                              rsInlineTypingPushRef.current = now;
                              setRsInlineText(next);
                              resetInlineTimer();

                              const cursorPos = Math.min(
                                e.target.selectionStart ?? next.length,
                                next.length
                              );
                              // A street number + start of a street, or "@"
                              // + a place name, opens the address list and
                              // takes priority over the name/rego triggers.
                              if (
                                rsAddressField.onText(next, cursorPos, e.target)
                              ) {
                                closeRsMentionDropdown();
                                closeRsVehicleMentionDropdown();
                                return;
                              }
                              const vehicleTrigger =
                                detectVehicleMentionTrigger(
                                  next,
                                  cursorPos,
                                  rsUsedVehicleRegos
                                );
                              if (vehicleTrigger) {
                                closeRsMentionDropdown();
                                setRsVehicleMentionWord({
                                  word: vehicleTrigger.word,
                                  wordStart: vehicleTrigger.wordStart,
                                  wordEnd: cursorPos,
                                });
                                setRsVehicleMentionActiveIndex(0);
                                setRsVehicleMentionAnchor(
                                  getCaretPixelPosition(e.target, cursorPos)
                                );
                                if (rsVehicleMentionDebounceRef.current)
                                  clearTimeout(
                                    rsVehicleMentionDebounceRef.current
                                  );
                                rsVehicleMentionDebounceRef.current =
                                  setTimeout(() => {
                                    setRsVehicleMentionQuery(
                                      vehicleTrigger.word
                                    );
                                  }, 250);
                              } else {
                                closeRsVehicleMentionDropdown();
                                const trigger = detectMentionTrigger(
                                  next,
                                  cursorPos,
                                  rsUsedBracketCodes
                                );
                                if (!trigger) {
                                  closeRsMentionDropdown();
                                } else {
                                  setRsMentionWord({
                                    word: trigger.word,
                                    wordStart: trigger.wordStart,
                                    wordEnd: cursorPos,
                                  });
                                  setRsMentionActiveIndex(0);
                                  setRsMentionAnchor(
                                    getCaretPixelPosition(e.target, cursorPos)
                                  );
                                  if (rsMentionDebounceRef.current)
                                    clearTimeout(rsMentionDebounceRef.current);
                                  rsMentionDebounceRef.current = setTimeout(
                                    () => {
                                      setRsMentionQuery(trigger.word);
                                    },
                                    250
                                  );
                                }
                              }
                            }}
                            onFocus={resetInlineTimer}
                            onBlur={() => {
                              closeRsMentionDropdown();
                              closeRsVehicleMentionDropdown();
                              rsAddressField.close();
                              // Leaving the field tidies what was typed by
                              // hand (vehicle lists, spaces, capitals, closing
                              // full stop). Text made only by chips and the
                              // Target Logger buttons keeps just the vehicle
                              // list punctuation.
                              const tidy = rsInlineTypedRef.current
                                ? tidyObservation(rsInlineText, true, {
                                    sentenceChips,
                                  })
                                : joinObservationPieces(rsInlineText, {
                                    sentenceChips,
                                  });
                              if (tidy !== rsInlineText) {
                                pushInlineUndo(rsInlineText);
                                setRsInlineText(tidy);
                              }
                            }}
                            onKeyDown={e => {
                              if (
                                rsAddressField.onKeyDown(e, applyRsAddressPick)
                              )
                                return;
                              if (
                                rsVehicleMentionWord &&
                                rsVehicleMentionSuggestions.length > 0
                              ) {
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setRsVehicleMentionActiveIndex(
                                    i =>
                                      (i + 1) %
                                      rsVehicleMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setRsVehicleMentionActiveIndex(
                                    i =>
                                      (i -
                                        1 +
                                        rsVehicleMentionSuggestions.length) %
                                      rsVehicleMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  selectRsVehicleMentionSuggestion(
                                    rsVehicleMentionSuggestions[
                                      rsVehicleMentionActiveIndex
                                    ],
                                    e.currentTarget
                                  );
                                  return;
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  closeRsVehicleMentionDropdown();
                                  return;
                                }
                              }
                              if (
                                rsMentionWord &&
                                rsMentionSuggestions.length > 0
                              ) {
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setRsMentionActiveIndex(
                                    i => (i + 1) % rsMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setRsMentionActiveIndex(
                                    i =>
                                      (i - 1 + rsMentionSuggestions.length) %
                                      rsMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  selectRsMentionSuggestion(
                                    rsMentionSuggestions[rsMentionActiveIndex],
                                    e.currentTarget
                                  );
                                  return;
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  closeRsMentionDropdown();
                                  return;
                                }
                              }
                              if (e.key === " " || e.key === "Tab") {
                                const textarea = e.currentTarget;
                                const pos = textarea.selectionStart ?? 0;
                                const textBefore = rsInlineText.slice(0, pos);
                                // An unidentified person already introduced in
                                // full is only referred to by the short name:
                                // finishing the full wording again becomes
                                // "UM1".
                                const unidentifiedRepeat =
                                  e.key === " " && rsUsedBracketCodes
                                    ? detectUnidentifiedRepeat(
                                        rsInlineText,
                                        pos,
                                        rsUsedBracketCodes
                                      )
                                    : null;
                                if (unidentifiedRepeat) {
                                  e.preventDefault();
                                  pushInlineUndo(rsInlineText);
                                  setRsInlineText(
                                    `${rsInlineText.slice(0, unidentifiedRepeat.start)}${unidentifiedRepeat.code} ${rsInlineText.slice(pos)}`
                                  );
                                  resetInlineTimer();
                                  requestAnimationFrame(() => {
                                    const newPos =
                                      unidentifiedRepeat.start +
                                      unidentifiedRepeat.code.length +
                                      1;
                                    textarea.setSelectionRange(newPos, newPos);
                                  });
                                  return;
                                }
                                const match = textBefore.match(/(\S+)$/);
                                let expanded = false;
                                if (match) {
                                  const word = match[1].toLowerCase();
                                  const expansion = mapQeShortcutMap[word];
                                  if (expansion) {
                                    expanded = true;
                                    e.preventDefault();
                                    const before = textBefore.slice(
                                      0,
                                      textBefore.length - match[1].length
                                    );
                                    const after = rsInlineText.slice(pos);
                                    const newText =
                                      before + expansion + " " + after;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length + expansion.length + 1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                                // Deterministic vehicle-bracket completion —
                                // same rule as the registry dropdown above
                                // (detectVehicleMentionTrigger), but fires
                                // unconditionally on Space so a fresh, never-
                                // before-seen rego still gets bracketed, not
                                // just one Intelligence already knows about.
                                if (
                                  !expanded &&
                                  e.key === " " &&
                                  rsUsedVehicleRegos
                                ) {
                                  const vehicleTrigger =
                                    detectVehicleMentionTrigger(
                                      rsInlineText,
                                      pos,
                                      rsUsedVehicleRegos
                                    );
                                  if (vehicleTrigger) {
                                    expanded = true;
                                    e.preventDefault();
                                    const { word, wordStart } = vehicleTrigger;
                                    const before = rsInlineText.slice(
                                      0,
                                      wordStart
                                    );
                                    const after = rsInlineText.slice(pos);
                                    const bracket = `(Vehicle ${word.toUpperCase()})`;
                                    const newText = `${before}${word} ${bracket} ${after}`;
                                    // The bracket is now complete and followed
                                    // by a space — tidy what has been typed so
                                    // far (vehicle lists, spaces, capitals).
                                    const joined = tidyObservationAtCaret(
                                      newText,
                                      before.length +
                                        word.length +
                                        1 +
                                        bracket.length +
                                        1,
                                      false,
                                      { sentenceChips }
                                    );
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(joined.text);
                                    resetInlineTimer();
                                    closeRsVehicleMentionDropdown();
                                    requestAnimationFrame(() => {
                                      textarea.setSelectionRange(
                                        joined.caret,
                                        joined.caret
                                      );
                                    });
                                  }
                                }
                                // Same idea, for a street address completed
                                // by its suburb + state (see
                                // detectAddressSpaceCompletion) —
                                // "(44 Elvira Street)".
                                if (
                                  !expanded &&
                                  e.key === " " &&
                                  rsUsedAddressLabels
                                ) {
                                  const addressTrigger =
                                    detectAddressSpaceCompletion(
                                      rsInlineText,
                                      pos,
                                      rsUsedAddressLabels
                                    );
                                  if (addressTrigger) {
                                    expanded = true;
                                    e.preventDefault();
                                    const bracket = `(${addressTrigger.addressLabel})`;
                                    const before = rsInlineText.slice(0, pos);
                                    const after = rsInlineText.slice(pos);
                                    const newText = `${before} ${bracket} ${after}`;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length + 1 + bracket.length + 1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                                // Same idea, for a fresh person's name
                                // completed by its ALL-CAPS surname (see
                                // detectPersonNameSpaceCompletion) —
                                // "(SURNAME)".
                                if (
                                  !expanded &&
                                  e.key === " " &&
                                  rsUsedBracketCodes
                                ) {
                                  const personTrigger =
                                    detectPersonNameSpaceCompletion(
                                      rsInlineText,
                                      pos,
                                      rsUsedBracketCodes
                                    );
                                  if (personTrigger) {
                                    e.preventDefault();
                                    const bracket = `(${personTrigger.surname.toUpperCase()})`;
                                    const before = rsInlineText.slice(0, pos);
                                    const after = rsInlineText.slice(pos);
                                    const newText = `${before} ${bracket} ${after}`;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    closeRsMentionDropdown();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length + 1 + bracket.length + 1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                              }
                            }}
                            placeholder={
                              inlineReadOnly
                                ? "Tap shortcuts below, or tap here to type…"
                                : "Add details (optional)…"
                            }
                            rows={4}
                            className={`w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring md:px-3 md:py-2 md:text-sm lg:min-h-[140px] ${inlineReadOnly ? "cursor-pointer" : ""}`}
                          />
                          {rsAddressField.element(applyRsAddressPick)}
                          {rsMentionWord &&
                            rsMentionAnchor &&
                            rsMentionSuggestions.length > 0 && (
                              <div
                                className="fixed z-50 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                                style={{
                                  top: rsMentionAnchor.top,
                                  left: rsMentionAnchor.left,
                                  maxHeight: "220px",
                                  overflowY: "auto",
                                }}
                              >
                                {rsMentionSuggestions.map((s, i) => (
                                  <button
                                    key={s.key}
                                    type="button"
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                                      i === rsMentionActiveIndex
                                        ? "bg-accent text-accent-foreground"
                                        : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                                    }`}
                                    onMouseEnter={() =>
                                      setRsMentionActiveIndex(i)
                                    }
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      if (rsInlineInputRef.current)
                                        selectRsMentionSuggestion(
                                          s,
                                          rsInlineInputRef.current
                                        );
                                    }}
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="truncate">
                                        {s.displayName}
                                      </span>
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {s.rowCount} obs.
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          {rsVehicleMentionWord &&
                            rsVehicleMentionAnchor &&
                            rsVehicleMentionSuggestions.length > 0 && (
                              <div
                                className="fixed z-50 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                                style={{
                                  top: rsVehicleMentionAnchor.top,
                                  left: rsVehicleMentionAnchor.left,
                                  maxHeight: "220px",
                                  overflowY: "auto",
                                }}
                              >
                                {rsVehicleMentionSuggestions.map((s, i) => (
                                  <button
                                    key={s.key}
                                    type="button"
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                                      i === rsVehicleMentionActiveIndex
                                        ? "bg-accent text-accent-foreground"
                                        : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                                    }`}
                                    onMouseEnter={() =>
                                      setRsVehicleMentionActiveIndex(i)
                                    }
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      if (rsInlineInputRef.current)
                                        selectRsVehicleMentionSuggestion(
                                          s,
                                          rsInlineInputRef.current
                                        );
                                    }}
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="truncate">
                                        {formatIntelVehicle(s.label)}
                                      </span>
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {s.rowCount} obs.
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          {/* Target panel — the blue shortcut chips and, right
                          under them, the purple entity chips, in a dropdown
                          like the running sheet's TARGET panel. Open/closed
                          is remembered per device. The green addresses stay
                          below it. */}
                          {(assignedTarget ||
                            (rsEntityChips && rsEntityChips.length > 0)) && (
                            <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  setQeTargetPanelExpanded(v => {
                                    const next = !v;
                                    try {
                                      localStorage.setItem(
                                        "runsheet_qe_target_panel_expanded",
                                        String(next)
                                      );
                                    } catch {}
                                    return next;
                                  })
                                }
                                aria-expanded={qeTargetPanelExpanded}
                                className="flex w-full min-w-0 select-none items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/20 active:bg-muted/30"
                              >
                                <Crosshair className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {assignedTarget
                                    ? `TARGET — ${(assignedTarget as any).name}`
                                    : "SHORTCUTS"}
                                </span>
                                <ChevronDown
                                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                    qeTargetPanelExpanded ? "" : "-rotate-90"
                                  }`}
                                />
                              </button>
                              {qeTargetPanelExpanded && (
                                <div className="flex flex-col gap-1.5 px-3 pb-3">
                                  {/* Shortcut buttons */}
                                  {(() => {
                                    // ── QE chips: exact mirror of main RS chip set, values, and order ──────────
                                    // Single source of truth: assignedTarget (target.getById) for all target fields.
                                    // Chip set matches SheetDetail exactly: TGT, HBF, HB, V1F, V1, extra vehicles, folder shortcuts.
                                    // Order: Shortcuts page order, target chips fixed after SC.
                                    const appendText = (text: string) => {
                                      pushInlineUndo(rsInlineText);
                                      setRsInlineText(prev =>
                                        prev ? `${prev} ${text}` : text
                                      );
                                      resetInlineTimer();
                                      rsInlineInputRef.current?.focus();
                                    };
                                    const t = assignedTarget as any;
                                    if (!t) return null;

                                    // Extra vehicle chips from JSON (V2F/V2, V3F/V3, …)
                                    const extraVehicleChips: Array<{
                                      label: string;
                                      display: string;
                                      getValue: () => string | null;
                                    }> = [];
                                    try {
                                      const evs: Array<{
                                        full: string;
                                        short: string;
                                      }> = JSON.parse(t.extraVehicles ?? "[]");
                                      evs.forEach(
                                        (
                                          ev: { full: string; short: string },
                                          i: number
                                        ) => {
                                          const num = i + 2;
                                          if (ev.full)
                                            extraVehicleChips.push({
                                              label: `V${num}F`,
                                              display: `V${num}F`,
                                              getValue: () => ev.full,
                                            });
                                          if (ev.short) {
                                            extraVehicleChips.push({
                                              label: `V${num}`,
                                              display: ev.short
                                                ? `V${num} ${ev.short}`
                                                : `V${num}`,
                                              getValue: () => ev.short,
                                            });
                                          }
                                        }
                                      );
                                    } catch {}

                                    // Folder shortcut chips (showInRs=true, exclude legacy 'D')
                                    const folderShortcutChips: Array<{
                                      label: string;
                                      display: string;
                                      getValue: () => string | null;
                                      shortcutId?: number;
                                      startsRow?: boolean;
                                    }> = ((generalShortcuts as any[]) ?? [])
                                      .filter(
                                        (s: any) =>
                                          (
                                            s.trigger as string
                                          ).toUpperCase() !== "D" &&
                                          !!s.showInRs
                                      )
                                      .map((s: any) => ({
                                        label: (
                                          s.trigger as string
                                        ).toUpperCase(),
                                        display: (
                                          s.trigger as string
                                        ).toUpperCase(),
                                        getValue: () => s.expansion as string,
                                        shortcutId: s.id as number,
                                        startsRow: !!s.startsRow,
                                      }));

                                    // Full chip list — identical order to SheetDetail fields array
                                    const allChips: Array<{
                                      label: string;
                                      display: string;
                                      getValue: () => string | null;
                                      shortcutId?: number;
                                      startsRow?: boolean;
                                    }> = [
                                      {
                                        label: "TGT",
                                        display: "TGT",
                                        getValue: () => t.tgt ?? null,
                                      },
                                      {
                                        label: "HBF",
                                        display: "HBF",
                                        getValue: () => t.hbf ?? null,
                                      },
                                      {
                                        label: "HB",
                                        display: "HB",
                                        getValue: () => t.hb ?? null,
                                      },
                                      {
                                        label: "V1F",
                                        display: "V1F",
                                        getValue: () => t.v1f ?? null,
                                      },
                                      {
                                        label: "V1",
                                        display: t.v1 ? `V1 ${t.v1}` : "V1",
                                        getValue: () => t.v1 ?? null,
                                      },
                                      ...extraVehicleChips,
                                      ...folderShortcutChips,
                                    ];

                                    const available = allChips.filter(
                                      s => s.getValue() !== null
                                    );
                                    if (available.length === 0) return null;

                                    // Same order as the main RS (shared/rsChips.ts)
                                    const orderedChips = orderRsChips(
                                      available,
                                      ((generalShortcuts as any[]) ?? []).map(
                                        (s: any) => s.trigger as string
                                      )
                                    );

                                    // Display rules — same as SheetDetail:
                                    // Vn short (V1/V2/…): show label + rego; everything else: trigger label only
                                    const shortcutFolderLabels = new Set(
                                      ((generalShortcuts as any[]) ?? []).map(
                                        (s: any) =>
                                          (s.trigger as string).toUpperCase()
                                      )
                                    );
                                    const TRIGGER_ONLY = new Set([
                                      "TGT",
                                      "HBF",
                                      "HB",
                                      "V1F",
                                    ]);
                                    const isVnShort = (lbl: string) =>
                                      /^V\d+$/.test(lbl);
                                    const isVnFull = (lbl: string) =>
                                      /^V\d+F$/.test(lbl);
                                    const isStandard = (lbl: string) =>
                                      !isVnShort(lbl) &&
                                      (shortcutFolderLabels.has(lbl) ||
                                        TRIGGER_ONLY.has(lbl) ||
                                        isVnFull(lbl));

                                    return (
                                      <div className="flex flex-wrap gap-1 md:gap-1.5">
                                        {orderedChips.map(s => (
                                          <button
                                            key={s.label}
                                            onClick={() => {
                                              const v = s.getValue();
                                              // "Own row": a new row with the
                                              // current time, the target's
                                              // surname first. No person
                                              // target (or offline): the text
                                              // goes in like any other chip.
                                              if (
                                                s.startsRow &&
                                                s.shortcutId !== undefined &&
                                                navigator.onLine &&
                                                rsSelectedSheetId
                                              ) {
                                                rsOwnRowShortcut.press(
                                                  {
                                                    sheetId: rsSelectedSheetId,
                                                    shortcutId: s.shortcutId,
                                                    label: s.label,
                                                  },
                                                  () => {
                                                    if (v) appendText(v);
                                                  }
                                                );
                                                return;
                                              }
                                              if (v) appendText(v);
                                            }}
                                            data-qe-chip={s.label}
                                            className="cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                          >
                                            {isVnShort(s.label)
                                              ? s.display
                                              : isStandard(s.label)
                                                ? s.label
                                                : s.display}
                                          </button>
                                        ))}
                                        {/* Cease — last of the chips, as on the
                                            running sheet: the ceased row for
                                            everyone still on, only while there
                                            is something to cease. */}
                                        {(user?.role === "member" ||
                                          user?.role === "admin") &&
                                          navigator.onLine &&
                                          !!rsSelectedSheetId &&
                                          (rsInlineRows?.length ?? 0) > 0 &&
                                          !rsSurveillance?.ended && (
                                            <CeaseRowButton
                                              sheetId={rsSelectedSheetId}
                                              chipClassName="cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 active:scale-95 transition-all select-none disabled:opacity-50 md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                              getPlace={() =>
                                                ceasePlaceFor(
                                                  locateTargetFromPending({
                                                    subject: rsTrackedTarget,
                                                    arrivals:
                                                      rsPendingArrivals ?? [],
                                                    departures:
                                                      rsPendingDepartures ?? [],
                                                    walkIns:
                                                      rsPendingWalkIns ?? [],
                                                    headingTo:
                                                      rsPendingHeadingTo ?? [],
                                                    placements:
                                                      rsPendingPlacements ?? [],
                                                    extractNames:
                                                      extractOccupantNames,
                                                  }),
                                                  rsInlineRows ?? []
                                                )
                                              }
                                              onChanged={() => {
                                                const sheetId =
                                                  rsSelectedSheetId;
                                                void utils.row.list.invalidate({
                                                  sheetId,
                                                });
                                                void utils.row.entityChips.invalidate(
                                                  { sheetId }
                                                );
                                                void utils.row.pendingVehicleDepartures.invalidate(
                                                  { sheetId }
                                                );
                                                void utils.row.pendingVehicleArrivals.invalidate(
                                                  { sheetId }
                                                );
                                                void utils.row.pendingWalkIns.invalidate(
                                                  { sheetId }
                                                );
                                                void utils.row.pendingHeadingTo.invalidate(
                                                  { sheetId }
                                                );
                                                void utils.row.pendingPlacements.invalidate(
                                                  { sheetId }
                                                );
                                                void utils.row.surveillanceState.invalidate(
                                                  { sheetId }
                                                );
                                              }}
                                              // The Last Entry banner below shows
                                              // the new row, where it can be edited.
                                              onOpenForTyping={() => {}}
                                            />
                                          )}
                                      </div>
                                    );
                                  })()}
                                  {/* Entity chips — quick-insert shortcuts mined from this sheet's own
                          observations (surname / short address / vehicle rego), shared
                          across every officer on the sheet via the server. */}
                                  {rsEntityChips &&
                                    rsEntityChips.length > 0 &&
                                    (() => {
                                      const appendText = (text: string) => {
                                        pushInlineUndo(rsInlineText);
                                        setRsInlineText(prev =>
                                          prev ? `${prev} ${text}` : text
                                        );
                                        resetInlineTimer();
                                        rsInlineInputRef.current?.focus();
                                      };
                                      return (
                                        <div className="flex flex-wrap gap-1 md:gap-1.5">
                                          {rsEntityChips.map(chip => (
                                            <button
                                              key={chip.key}
                                              onClick={() =>
                                                appendText(chip.insertValue)
                                              }
                                              className="px-2 py-0.5 rounded text-[10px] font-bold border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                            >
                                              <span className="font-mono normal-case">
                                                {chip.insertValue}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Address chips — full RS address and short street address */}
                          {mapQeAddress &&
                            (() => {
                              const appendText = (text: string) => {
                                pushInlineUndo(rsInlineText);
                                setRsInlineText(prev =>
                                  prev ? `${prev} ${text}` : text
                                );
                                resetInlineTimer();
                                rsInlineInputRef.current?.focus();
                              };
                              // Extract short address from bracket code: e.g. "21 Olding Way, MELVILLE WA (21 OLDING WAY)" → "21 Olding Way"
                              const shortAddr = popupShortAddress(mapQeAddress);
                              return (
                                <div className="flex flex-col gap-1 md:gap-1.5">
                                  <button
                                    onClick={() => appendText(mapQeAddress)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/30 bg-teal-500/5 text-teal-400 hover:bg-teal-500/15 active:scale-[0.98] transition-all md:px-3.5 md:py-2.5"
                                  >
                                    <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">
                                      Full Address
                                    </span>
                                    <span className="text-[10px] md:text-sm font-mono leading-tight break-all">
                                      {mapQeAddress}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => appendText(shortAddr)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/20 bg-teal-500/5 text-teal-300 hover:bg-teal-500/10 active:scale-[0.98] transition-all md:px-3.5 md:py-2.5"
                                  >
                                    <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">
                                      Short Address
                                    </span>
                                    <span className="text-[10px] md:text-sm font-mono leading-tight">
                                      {shortAddr}
                                    </span>
                                  </button>
                                </div>
                              );
                            })()}
                          {/* Continuity cards — the same "Where now" cards the
                          running sheet shows (ContinuityCards), narrowed to
                          this address: vehicles known to be parked here
                          (plus one whose arrival is typed in the unsaved
                          observation), people inside or heading here, and
                          any vehicle that left somewhere with no arrival
                          logged yet. A tap adds the row straight away
                          (see onAction below) — it writes into the record. */}
                          {mapQeAddress &&
                            (() => {
                              const shortAddr = popupShortAddress(mapQeAddress);
                              // First mention of an address on this sheet is
                              // written in full (with its bracket short-form,
                              // which Intelligence relies on to register the
                              // location); later mentions use the short form.
                              const arriveAddr =
                                rsAddressMentionedData?.mentioned
                                  ? shortAddr
                                  : mapQeAddress;
                              const names = (n: string) =>
                                shortenAlreadyMentionedNames(
                                  n,
                                  rsUsedBracketCodesWithDraft
                                );
                              // The entry was opened from a bus stop or a
                              // train station: people on foot board there
                              // rather than "enter" it.
                              const clickedTransit =
                                transitKindOfPlace(shortAddr);
                              const cards: ContinuityCardData[] = [];

                              // Vehicles that left somewhere and have no
                              // arrival logged — any of them could be
                              // arriving here.
                              // Anyone logged as inside an address or walking
                              // somewhere is NOT in a vehicle, whatever the
                              // vehicle's arrival row says.
                              const onFootNames = [
                                ...(rsPendingWalkIns ?? []).map(w => w.names),
                                ...(rsPendingHeadingTo ?? []).map(h => h.names),
                              ];
                              // Who is in a vehicle: those its own row names,
                              // plus anyone logged walking to / getting into
                              // it — and a person is only in the vehicle the
                              // most recent row puts them in.
                              const allVehicleRows = [
                                ...(rsPendingArrivals ?? []).map(a => ({
                                  rego: a.rego,
                                  rowId: a.rowId,
                                  names: extractOccupantNames(a.occupantDesc),
                                })),
                                ...(rsPendingDepartures ?? []).map(d => ({
                                  rego: d.rego,
                                  rowId: d.rowId,
                                  names: extractOccupantNames(d.occupantDesc),
                                })),
                              ];
                              // Parked vehicles people on foot could walk to:
                              // only those at the address their latest
                              // vehicle journey ended, not ones left behind
                              // earlier (see vehiclesPeopleCanReach).
                              const reachableVehicles = (
                                people: string,
                                fallbackPlace: string
                              ) =>
                                vehiclesPeopleCanReach({
                                  people,
                                  arrivals: (rsPendingArrivals ?? []).map(
                                    a => ({
                                      ...a,
                                      names: extractOccupantNames(
                                        a.occupantDesc
                                      ),
                                    })
                                  ),
                                  placements: rsPendingPlacements ?? [],
                                  fallbackPlace,
                                });
                              const vehicleOccupants = (
                                desc: string,
                                rego: string,
                                rowId: number
                              ) =>
                                sharedVehicleOccupants(
                                  {
                                    rego,
                                    rowId,
                                    names: extractOccupantNames(desc),
                                  },
                                  onFootNames,
                                  rsPendingPlacements ?? [],
                                  allVehicleRows
                                );
                              (rsPendingDepartures ?? []).forEach(d => {
                                const movingOcc = vehicleOccupants(
                                  d.occupantDesc,
                                  d.rego,
                                  d.rowId
                                );
                                cards.push({
                                  key: `dep-${d.rego}`,
                                  title: d.rego,
                                  pill: "Departed",
                                  attn: true,
                                  who: movingOcc.length
                                    ? movingOcc.join(", ")
                                    : extractOccupantNames(d.occupantDesc) ||
                                      "Occupants not seen",
                                  state: d.via
                                    ? `Travelling on ${d.via}${
                                        d.fromAddress
                                          ? ` — from ${d.fromAddress}`
                                          : ""
                                      }`
                                    : d.fromAddress
                                      ? `From ${d.fromAddress}`
                                      : "No arrival logged yet",
                                  holds: movingOcc.length
                                    ? movingOcc.flatMap(n => surnameTokens(n))
                                    : surnameTokens(d.occupantDesc),
                                  people: movingOcc.length
                                    ? movingOcc
                                    : splitPeopleNames(
                                        extractOccupantNames(d.occupantDesc)
                                      ),
                                  locus: {
                                    headline:
                                      d.via && movingOcc.length
                                        ? `In ${d.rego}`
                                        : `Departed in ${d.rego}`,
                                    sub: d.via
                                      ? `Travelling on ${d.via}${
                                          d.fromAddress
                                            ? ` — from ${d.fromAddress}`
                                            : ""
                                        }`
                                      : d.fromAddress
                                        ? `From ${d.fromAddress}`
                                        : "No arrival logged yet",
                                  },
                                  actions: [
                                    {
                                      key: `arr-${d.rego}`,
                                      label: "Arrived here",
                                      text: `Vehicle ${d.rego}, ${names(d.occupantDesc)}, arrived at ${arriveAddr}`,
                                    },
                                  ],
                                  latestRowId: d.rowId,
                                });
                              });

                              // Vehicles here: saved arrivals at this
                              // address, plus a vehicle-arrival sentence
                              // already typed into THIS unsaved observation
                              // (so the walk-in options appear in the same
                              // row, as officers write it).
                              const here = new Map<
                                string,
                                {
                                  rego: string;
                                  occupantDesc: string;
                                  rowId: number;
                                  saved: boolean;
                                  outOfSight: boolean;
                                }
                              >();
                              (rsPendingArrivals ?? [])
                                .filter(a =>
                                  cardAddressMatch(a.address, shortAddr)
                                )
                                .forEach(a =>
                                  here.set(a.rego, {
                                    rego: a.rego,
                                    occupantDesc: a.occupantDesc,
                                    rowId: a.rowId,
                                    saved: true,
                                    outOfSight: a.outOfSight,
                                  })
                                );
                              const draftArrive =
                                matchVehicleArrival(rsInlineText);
                              if (draftArrive) {
                                const draftAddress =
                                  extractArrivalAddress(rsInlineText);
                                if (
                                  draftAddress &&
                                  cardAddressMatch(draftAddress, shortAddr)
                                ) {
                                  here.set(draftArrive.rego, {
                                    rego: draftArrive.rego,
                                    occupantDesc: draftArrive.occupantDesc,
                                    // A just-typed arrival is never hidden
                                    // by an older dismissal.
                                    rowId: Number.MAX_SAFE_INTEGER,
                                    saved: false,
                                    outOfSight: /\bout of sight\b/i.test(
                                      rsInlineText
                                    ),
                                  });
                                }
                              }
                              const insideHere = (
                                rsPendingWalkIns ?? []
                              ).filter(w =>
                                cardAddressMatch(w.location, shortAddr)
                              );
                              const leftAddressText = (w: {
                                names: string;
                                location: string;
                              }) =>
                                `${names(w.names)} exited ${w.location} and walked [route] towards [location].`;
                              // Whether the people inside this address are
                              // shown on a vehicle's card (nobody left in the
                              // vehicle) or on a card of their own.
                              let insideOnVehicleCard = false;
                              Array.from(here.values()).forEach(v => {
                                const occupants = vehicleOccupants(
                                  v.occupantDesc,
                                  v.rego,
                                  v.rowId
                                );
                                const inCar = occupants.length > 0;
                                // Those a later row only had walking TOWARDS
                                // the vehicle — in it or next to it.
                                const toNames = occupantsToVehicle(
                                  { rego: v.rego, rowId: v.rowId },
                                  occupants,
                                  rsPendingPlacements ?? []
                                );
                                const inNames = occupants.filter(
                                  o => !toNames.includes(o)
                                );
                                // Where each sits, when the rows say.
                                const seatMap = seatsOf({
                                  desc: v.occupantDesc,
                                  descRowId: v.rowId,
                                  rego: v.rego,
                                  occupants,
                                  placements: rsPendingPlacements ?? [],
                                });
                                const withSeat = (n: string) =>
                                  seatMap.has(n)
                                    ? `${n} (${seatMap.get(n)})`
                                    : n;
                                // People inside take over the card only when
                                // nobody is left in the vehicle; when some got
                                // out and others stayed, the vehicle keeps a
                                // card for those still in it.
                                const inside = insideHere.length > 0 && !inCar;
                                if (inside) insideOnVehicleCard = true;
                                // "... arrived and continued out of sight":
                                // nobody can say whether anyone is still in
                                // it until someone is seen again, so no
                                // walked-away / walked-in options.
                                // The target is then placed at the address, out of
                                // sight: the next steps are to walk out to the
                                // vehicle, walk somewhere else, or leave in a
                                // vehicle. Not once a later row has put those
                                // people anywhere.
                                const arrivalPeople = occupantsStillInVehicle(
                                  extractOccupantNames(v.occupantDesc),
                                  []
                                );
                                const movedOn = (
                                  rsPendingPlacements ?? []
                                ).some(
                                  pl =>
                                    pl.rowId > v.rowId &&
                                    arrivalPeople.some(n =>
                                      surnameTokens(n).some(t =>
                                        surnameTokens(pl.name).includes(t)
                                      )
                                    )
                                );
                                const outOfSight =
                                  v.outOfSight && !inside && !movedOn;
                                const occNames = names(occupants.join(" and "));
                                const actions: ContinuityCardData["actions"] =
                                  [];
                                if (v.saved) {
                                  actions.push({
                                    key: `dep-${v.rego}`,
                                    label: "Vehicle Depart",
                                    // Everyone known to be in it, or
                                    // "unseen occupant/s" when nobody is.
                                    text: `Vehicle ${v.rego}, ${
                                      inCar && !outOfSight
                                        ? names(
                                            occupantWording(
                                              v.occupantDesc,
                                              occupants
                                            ) ??
                                              seatedOccupantWording({
                                                desc: v.occupantDesc,
                                                descRowId: v.rowId,
                                                rego: v.rego,
                                                occupants,
                                                placements:
                                                  rsPendingPlacements ?? [],
                                              }) ??
                                              occNames
                                          )
                                        : "unseen occupant/s"
                                    }, departed ${shortAddr} and continued via:`,
                                  });
                                }
                                if (outOfSight && arrivalPeople.length > 0) {
                                  const oosNames = names(
                                    arrivalPeople.join(" and ")
                                  );
                                  // Walk out to the vehicle or on elsewhere,
                                  // ahead of Vehicle departing.
                                  actions.unshift(
                                    {
                                      key: `wov-oos-${v.rego}`,
                                      label: "Walked to Vehicle",
                                      mode: "paragraph",
                                      text: `${oosNames} exited ${shortAddr} and walked towards Vehicle ${v.rego}.`,
                                    },
                                    {
                                      key: `la-oos-${v.rego}`,
                                      label: "Walked away",
                                      mode: "paragraph",
                                      text: `${oosNames} exited ${shortAddr} and walked [route] towards [location].`,
                                    }
                                  );
                                } else if (!inside) {
                                  // Someone is out of sight at this address
                                  // after arriving in another vehicle: he
                                  // could just as well walk out to THIS one.
                                  const otherOos = Array.from(here.values())
                                    .filter(o => o.rego !== v.rego)
                                    .flatMap(o => {
                                      if (!o.outOfSight) return [];
                                      return occupantsStillInVehicle(
                                        extractOccupantNames(o.occupantDesc),
                                        []
                                      ).filter(
                                        n =>
                                          !(rsPendingPlacements ?? []).some(
                                            pl =>
                                              pl.rowId > o.rowId &&
                                              surnameTokens(n).some(t =>
                                                surnameTokens(pl.name).includes(
                                                  t
                                                )
                                              )
                                          )
                                      );
                                    });
                                  if (otherOos.length > 0) {
                                    actions.unshift({
                                      key: `wov-oos-${v.rego}`,
                                      label: "Walked to Vehicle",
                                      mode: "paragraph",
                                      text: `${names(otherOos.join(" and "))} exited ${shortAddr} and walked towards Vehicle ${v.rego}.`,
                                    });
                                  }
                                }
                                if (inCar && !inside && !outOfSight) {
                                  // Left the vehicle and walked off somewhere
                                  // other than here, or walked in here.
                                  actions.push(
                                    {
                                      key: `wa-${v.rego}`,
                                      label: "Walked away",
                                      rego: v.rego,
                                      mode: "paragraph",
                                      text: `${occNames} exited the vehicle and walked [route] towards [location].`,
                                    },
                                    {
                                      key: `wir-${v.rego}`,
                                      label: "Walked in",
                                      rego: v.rego,
                                      mode: "paragraph",
                                      text: `${occNames} exited the vehicle, walked [route], entered ${shortAddr} and continued out of sight.`,
                                    }
                                  );
                                }
                                if (inside) {
                                  const w = insideHere[0];
                                  const walkOutNames = names(w.names);
                                  actions.push({
                                    key: `wo-${v.rego}`,
                                    label: "Walked to Vehicle",
                                    // w.route is only ever genuine route text,
                                    // never the destination (that is shortAddr).
                                    text: w.route
                                      ? `${walkOutNames} exited ${shortAddr} and walked ${w.route} towards Vehicle ${v.rego}.`
                                      : `${walkOutNames} exited ${shortAddr} and walked towards Vehicle ${v.rego}.`,
                                  });
                                  actions.push({
                                    key: `la-${v.rego}`,
                                    label: "Left address",
                                    text: leftAddressText(w),
                                  });
                                }
                                cards.push({
                                  key: `veh-${v.rego}`,
                                  title: v.rego,
                                  pill: "Parked",
                                  who: inside
                                    ? `${insideHere.map(w => w.names).join("; ")} inside the address`
                                    : outOfSight
                                      ? inCar
                                        ? `${occupants.join(", ")} out of sight at the address`
                                        : "Out of sight since arriving"
                                      : inCar
                                        ? [
                                            inNames.length
                                              ? `${inNames.map(withSeat).join(", ")} in the vehicle`
                                              : "",
                                            toNames.length
                                              ? `${toNames.join(", ")} to vehicle`
                                              : "",
                                          ]
                                            .filter(Boolean)
                                            .join("; ")
                                        : "Nobody in the vehicle",
                                  state: shortAddr,
                                  actions,
                                  latestRowId: Math.max(
                                    v.rowId,
                                    ...insideHere.map(w => w.rowId)
                                  ),
                                  holds: [
                                    ...occupants,
                                    ...insideHere.map(w => w.names),
                                  ].flatMap(n => surnameTokens(n)),
                                  people: inside
                                    ? insideHere.flatMap(w =>
                                        splitPeopleNames(w.names)
                                      )
                                    : occupants,
                                  locus: inside
                                    ? {
                                        headline: `Inside ${shortAddr}`,
                                        sub: "On foot",
                                      }
                                    : outOfSight
                                      ? {
                                          headline: `Out of sight at ${shortAddr}`,
                                          sub: `Arrived in ${v.rego}`,
                                        }
                                      : {
                                          headline: inCar
                                            ? inNames.length
                                              ? `In ${v.rego}`
                                              : `To vehicle ${v.rego}`
                                            : `${v.rego} unattended`,
                                          sub: `Parked at ${shortAddr}`,
                                        },
                                });
                              });

                              // Someone logged inside a place close to the one
                              // clicked (a shop in the centre they are in): this
                              // pin is where they may have gone ("Entered here").
                              // Only ever from a map click — nothing is added to
                              // the cards otherwise (shared/enterNearby.ts).
                              {
                                const homes = [
                                  (assignedTarget as any)?.hbf,
                                  (assignedTarget as any)?.hb,
                                ].filter(Boolean) as string[];
                                enterNearbyOffers({
                                  walkIns: (rsPendingWalkIns ?? []).map(w => ({
                                    names: w.names,
                                    location: w.location,
                                    rowId: w.rowId,
                                  })),
                                  clicked: mapQeLatLng,
                                  clickedAddress: shortAddr,
                                  same: cardAddressMatch,
                                  positionOf: placePosition,
                                  exclude: place =>
                                    homes.some(h => cardAddressMatch(h, place)),
                                }).forEach(o =>
                                  cards.push({
                                    key: `enter-${o.names}-${o.inside}-${shortAddr}`,
                                    title: o.names,
                                    pill: "Inside",
                                    who: `Inside ${o.inside}`,
                                    state: "On foot",
                                    holds: surnameTokens(o.names),
                                    people: splitPeopleNames(o.names),
                                    locus: {
                                      headline: `Inside ${o.inside}`,
                                      sub: "On foot",
                                    },
                                    actions: [
                                      {
                                        key: `ent-${o.inside}-${shortAddr}`,
                                        label: "Entered here",
                                        text: `${names(o.names)} entered ${arriveAddr} and continued out of sight.`,
                                      },
                                    ],
                                    latestRowId: o.rowId,
                                  })
                                );
                              }

                              // People on foot inside this address with no
                              // vehicle here.
                              if (!insideOnVehicleCard) {
                                insideHere.forEach(w =>
                                  cards.push({
                                    key: `foot-${w.location}`,
                                    title: w.names,
                                    pill: "Inside",
                                    who: `Inside ${w.location}`,
                                    state: "On foot",
                                    holds: surnameTokens(w.names),
                                    people: splitPeopleNames(w.names),
                                    locus: {
                                      headline: `Inside ${w.location}`,
                                      sub: "On foot",
                                    },
                                    actions: [
                                      {
                                        key: `la-${w.location}`,
                                        label: "Left address",
                                        text: leftAddressText(w),
                                      },
                                      // At a bus stop or train station.
                                      ...transitBoardActions({
                                        keyBase: w.location,
                                        names: names(w.names),
                                        place: w.location,
                                      }),
                                      // Back to a parked vehicle from here.
                                      ...reachableVehicles(
                                        w.names,
                                        w.location
                                      ).map(a => ({
                                        key: `wov-${w.location}-${a.rego}`,
                                        label: `Walked to ${a.rego}`,
                                        text: `${names(w.names)} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
                                      })),
                                    ],
                                    latestRowId: w.rowId,
                                  })
                                );
                              }

                              // People on foot: this pin is where they may
                              // have got to, whatever they said they were
                              // heading for — the same as a vehicle that left
                              // somewhere, which can arrive at any pin. Their
                              // own destination, when it is this place, keeps
                              // its "Entered" / "Inside" wording.
                              (rsPendingHeadingTo ?? []).forEach(h => {
                                const unwritten = h.destination.includes("[");
                                const isDest =
                                  !unwritten &&
                                  cardAddressMatch(h.destination, shortAddr);
                                // This pin, rather than where they said.
                                const here = !isDest;
                                const keyTail = unwritten ? `-${h.names}` : "";
                                const how = h.fromTransit
                                  ? "Alighted, on foot"
                                  : h.fromVessel
                                    ? "Disembarked, on foot"
                                    : "Departed on foot";
                                const left =
                                  alightedWording(h)?.left ??
                                  `Left ${h.fromVessel ?? h.from}`;
                                const nm = names(h.names);
                                cards.push({
                                  key: `head-${h.destination}${keyTail}`,
                                  title: h.names,
                                  pill: h.fromTransit
                                    ? "Alighted"
                                    : h.fromVessel
                                      ? "Disembarked"
                                      : "Departed on foot",
                                  attn: true,
                                  who: unwritten
                                    ? "On foot"
                                    : `Walking to ${h.destination}`,
                                  state: left,
                                  holds: surnameTokens(h.names),
                                  people: splitPeopleNames(h.names),
                                  locus: {
                                    headline: unwritten
                                      ? how
                                      : `${how} to ${h.destination}`,
                                    sub: left,
                                  },
                                  actions: [
                                    // Got to this place on foot: any place —
                                    // a street corner, a bus stop, a station.
                                    ...(here
                                      ? [
                                          {
                                            key: `arr-${h.names}-${shortAddr}`,
                                            label: "Arrived here",
                                            text: `${nm} arrived on foot at ${arriveAddr}.`,
                                          },
                                        ]
                                      : []),
                                    // A bus stop or train station: boarding.
                                    ...(clickedTransit && here
                                      ? transitBoardActions({
                                          keyBase: `here-${h.names}-${shortAddr}`,
                                          names: nm,
                                          place: arriveAddr,
                                        })
                                      : []),
                                    // Going into it ("Entered"), or into a
                                    // place that is not a stop or station.
                                    ...(clickedTransit && here
                                      ? []
                                      : [
                                          {
                                            key: `en-${h.destination}${keyTail}`,
                                            label: here
                                              ? "Entered here"
                                              : "Entered",
                                            text: `${nm} entered ${
                                              here ? arriveAddr : h.destination
                                            } and continued out of sight.`,
                                          },
                                          {
                                            key: `in-${h.destination}${keyTail}`,
                                            label: here
                                              ? "Inside here"
                                              : "Inside",
                                            text: `${nm} inside ${
                                              here ? arriveAddr : h.destination
                                            } [observation].`,
                                          },
                                        ]),
                                    {
                                      key: `wk-${h.destination}${keyTail}`,
                                      label: "Walked to another location",
                                      text: `${nm} walked [route] towards [location].`,
                                    },
                                    // Heading for a stop or station they said,
                                    // or just got off at one.
                                    ...(clickedTransit && here
                                      ? []
                                      : transitBoardActions({
                                          keyBase: `h-${h.destination}-${h.names}`,
                                          names: nm,
                                          place: unwritten
                                            ? h.from
                                            : h.destination,
                                        })),
                                    ...reachableVehicles(h.names, h.from).map(
                                      a => ({
                                        key: `wv-${a.rego}`,
                                        label: `Walked to ${a.rego}`,
                                        text: `${nm} walked towards Vehicle ${a.rego}.`,
                                      })
                                    ),
                                  ],
                                  latestRowId: h.rowId,
                                });
                              });

                              // People aboard a boat or vessel: shown
                              // wherever the sheet is, until a row says they
                              // got off.
                              {
                                const byVessel = new Map<
                                  string,
                                  NonNullable<typeof rsPendingPlacements>
                                >();
                                for (const p of rsPendingPlacements ?? []) {
                                  if (!p.vessel) continue;
                                  const k = p.vessel.toLowerCase();
                                  byVessel.set(k, [
                                    ...(byVessel.get(k) ?? []),
                                    p,
                                  ]);
                                }
                                byVessel.forEach((ps, vk) => {
                                  const vessel = ps[0].vessel ?? vk;
                                  const crew = ps.map(p => p.name);
                                  const at = ps.find(p => p.at)?.at;
                                  const where = at
                                    ? `Last seen at ${at}`
                                    : "Position not logged";
                                  cards.push({
                                    key: `vsl-${vk}`,
                                    title: crew.join(" and "),
                                    pill: "On a vessel",
                                    attn: true,
                                    who: `${crew.join(", ")} on ${vessel}`,
                                    state: where,
                                    holds: crew.flatMap(n => surnameTokens(n)),
                                    people: crew,
                                    locus: {
                                      headline: `On ${vessel}`,
                                      sub: where,
                                    },
                                    actions: [
                                      {
                                        key: `vsl-off-${vk}`,
                                        label: "Disembarked",
                                        text: `${names(crew.join(" and "))} disembarked from ${vessel} and walked [route] towards [location].`,
                                      },
                                    ],
                                    latestRowId: Math.max(
                                      ...ps.map(p => p.rowId)
                                    ),
                                  });
                                });
                              }

                              // People aboard a bus, train or tram: shown
                              // wherever the sheet is, until a row says they
                              // got off.
                              cards.push(
                                ...onTransitCards({
                                  placements: rsPendingPlacements ?? [],
                                  shorten: names,
                                  hereAddress: clickedTransit
                                    ? arriveAddr
                                    : undefined,
                                })
                              );

                              // The card holding the target leads, as its
                              // tracker (person or vehicle; same rule as the
                              // sheet and the flag).
                              {
                                const tKey = pickSubjectCardKey(
                                  cards,
                                  rsTrackedTarget
                                );
                                const held = cards.find(c => c.key === tKey);
                                if (held) {
                                  held.isTarget = true;
                                  held.companions = subjectCompanions(
                                    held.people ?? [],
                                    rsTrackedTarget
                                  ).join(", ");
                                  // Took over from another sheet: say where
                                  // the picture came from.
                                  if (rsSurveillance?.handover && held.locus)
                                    held.locus = {
                                      ...held.locus,
                                      sub: `${held.locus.sub} · Handed over from ${rsSurveillance.handover.title}`,
                                    };
                                }
                              }

                              // Every member of the team has ceased: one grey
                              // card replaces the live ones.
                              if (rsSurveillance?.ended) {
                                cards.length = 0;
                                cards.push(
                                  endedContinuityCard({
                                    who:
                                      trackedTargetCode(rsTrackedTarget) ??
                                      "Team",
                                    time: rsSurveillance.endedAtTime,
                                    position: rsTargetPosition,
                                  })
                                );
                              }
                              if (
                                cards.length === 0 ||
                                !trackingSettings.tracking
                              )
                                return null;
                              return (
                                <ContinuityCards
                                  cards={cards}
                                  dismissed={rsContinuityDismissed}
                                  onDismiss={(key, rowId) =>
                                    rsSelectedSheetId &&
                                    setContinuityDismissal.mutate({
                                      sheetId: rsSelectedSheetId,
                                      key,
                                      rowId,
                                    })
                                  }
                                  onRestore={key =>
                                    rsSelectedSheetId &&
                                    setContinuityDismissal.mutate({
                                      sheetId: rsSelectedSheetId,
                                      key,
                                      rowId: null,
                                    })
                                  }
                                  // Puts the sentence into the observation box
                                  // for the officer to review and edit; nothing
                                  // is saved until Submit. With text already
                                  // there it goes in as the next paragraph.
                                  onAction={(rawText, _mode, rego) => {
                                    const text = fillRoute(rawText, rego, [
                                      ...[...(rsInlineRows ?? [])]
                                        .sort(
                                          (a, b) =>
                                            (a.rowNumber ?? 0) -
                                            (b.rowNumber ?? 0)
                                        )
                                        .map(r => r.observation),
                                      // What is typed in the box right now.
                                      rsInlineText,
                                    ]);
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(prev => {
                                      if (!prev.trim()) return text;
                                      const lead = prev.endsWith("\n\n")
                                        ? ""
                                        : prev.endsWith("\n")
                                          ? "\n"
                                          : "\n\n";
                                      return `${prev}${lead}${text}`;
                                    });
                                    resetInlineTimer();
                                    rsInlineInputRef.current?.focus();
                                  }}
                                />
                              );
                            })()}
                          {/* CIN picker — multi-select with TEAM */}
                          {rosterCins.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 md:gap-2">
                              <button
                                onClick={() => {
                                  const allSel = rosterCins.every(c =>
                                    rsInlineCins.has(c)
                                  );
                                  const next = allSel
                                    ? new Set<string>()
                                    : new Set(rosterCins);
                                  setRsInlineCins(next);
                                  rsInlineCinsRef.current = next;
                                  resetInlineTimer();
                                }}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 md:px-3.5 md:py-1.5 md:text-sm ${rosterCins.every(c => rsInlineCins.has(c)) ? "bg-amber-500/20 border-amber-500/60 text-amber-400" : "bg-muted/40 border-amber-500/30 text-amber-500/80 hover:bg-amber-500/10"}`}
                              >
                                TEAM
                              </button>
                              {rosterCins.map(cin => (
                                <button
                                  key={cin}
                                  onClick={() => {
                                    const next = new Set(rsInlineCins);
                                    if (next.has(cin)) {
                                      next.delete(cin);
                                    } else {
                                      next.add(cin);
                                    }
                                    setRsInlineCins(next);
                                    rsInlineCinsRef.current = next;
                                    resetInlineTimer();
                                  }}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 md:px-3.5 md:py-1.5 md:text-sm ${rsInlineCins.has(cin) ? "bg-primary/20 border-primary/60 text-primary" : "bg-muted/40 border-border text-foreground/80 hover:bg-muted/70 hover:text-foreground"}`}
                                >
                                  {cin}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={submitInlineField}
                              disabled={rsAddingRow}
                              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:gap-1.5"
                            >
                              {rsAddingRow ? (
                                <Spinner className="h-3 w-3 md:h-4 md:w-4" />
                              ) : (
                                <Send className="h-3 w-3 md:h-4 md:w-4" />
                              )}
                              Submit
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Quick action buttons removed per user request */}

                  {/* Last entry confirmation — tap to quickly correct the
                      time/text just submitted and save again, rather than
                      going to the Running Sheet to fix a typo. */}
                  {rsLastEntry && !rsEditingLastEntry && (
                    <button
                      type="button"
                      onClick={openLastEntryEdit}
                      className="w-full text-left rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 md:px-3.5 md:py-3 hover:bg-green-500/15 active:scale-[0.99] transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-green-400">
                          Last Entry
                        </p>
                        <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5 text-green-400/70 flex-shrink-0" />
                      </div>
                      <p className="text-[11px] md:text-sm font-mono text-foreground">
                        {rsLastEntry.time} — {rsLastEntry.label}
                      </p>
                    </button>
                  )}

                  {rsLastEntry && rsEditingLastEntry && (
                    <div className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 md:px-3.5 md:py-3 flex flex-col gap-2">
                      <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-green-400">
                        Editing Last Entry
                      </p>
                      <div className="flex items-center gap-1 md:gap-1.5 flex-wrap">
                        <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
                        <Select
                          value={rsEditHour}
                          onValueChange={setRsEditHour}
                        >
                          <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) =>
                              String(i + 1)
                            ).map(h => (
                              <SelectItem
                                key={h}
                                value={h}
                                className="font-mono text-xs"
                              >
                                {String(parseInt(h)).padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground font-mono text-[11px] md:text-sm">
                          :
                        </span>
                        <Select
                          value={rsEditMinute}
                          onValueChange={setRsEditMinute}
                        >
                          <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 60 }, (_, i) =>
                              String(i).padStart(2, "0")
                            ).map(m => (
                              <SelectItem
                                key={m}
                                value={m}
                                className="font-mono text-xs"
                              >
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={rsEditPeriod}
                          onValueChange={setRsEditPeriod}
                        >
                          <SelectTrigger className="w-14 h-6 text-[11px] px-1.5 py-0 md:w-16 md:h-8 md:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AM" className="text-xs">
                              AM
                            </SelectItem>
                            <SelectItem value="PM" className="text-xs">
                              PM
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={rsEditText}
                        onChange={e => setRsEditText(e.target.value)}
                        rows={3}
                        className="text-[11px] md:text-sm font-mono"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelLastEntryEdit}
                          disabled={rsUpdateRow.isPending}
                          className="rounded-md px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveLastEntryEdit}
                          disabled={rsUpdateRow.isPending || !rsEditText.trim()}
                          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:gap-1.5"
                        >
                          {rsUpdateRow.isPending ? (
                            <Spinner className="h-3 w-3 md:h-4 md:w-4" />
                          ) : (
                            <Send className="h-3 w-3 md:h-4 md:w-4" />
                          )}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

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
                    {pendingLatLng.lat.toFixed(5)},{" "}
                    {pendingLatLng.lng.toFixed(5)}
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
                <Switch
                  checked={cmLabelOnly}
                  onCheckedChange={setCmLabelOnly}
                />
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
                      {cmLabelOnly || iconIsTactical
                        ? "Label Colour"
                        : "Colour"}
                    </p>
                    {iconIsTactical && (
                      <p className="text-[10px] text-muted-foreground mb-2">
                        This icon's own colour is fixed — it comes from the
                        Tactical library as-is. The colour below sets your
                        label's pill instead.
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
                  onValueChange={v =>
                    setCmOpId(v === "none" ? null : Number(v))
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
      </div>

      {(() => {
        const currentQeDupe = qeDupeQueue[qeDupeIndex];
        if (!currentQeDupe) return null;
        if (currentQeDupe.kind === "missingLocation") {
          return (
            <MissingLocationAlert
              key={qeDupeIndex}
              warning={
                qeDupeDialogOpen
                  ? {
                      location: currentQeDupe.location,
                      source: currentQeDupe.source,
                    }
                  : null
              }
              onConfirm={() =>
                handleQeMissingLocationResolved(true, currentQeDupe.location)
              }
              onDecline={() =>
                handleQeMissingLocationResolved(false, currentQeDupe.location)
              }
            />
          );
        }
        return (
          <VagueVehicleMatchAlert
            key={qeDupeIndex}
            warning={
              qeDupeDialogOpen
                ? {
                    loserLabel: currentQeDupe.loserLabel,
                    winnerLabel: currentQeDupe.winnerLabel,
                    reason: currentQeDupe.reason,
                  }
                : null
            }
            busy={qeVagueVehicleBusy}
            onConfirm={() => handleQeVagueVehicleResolved(true, currentQeDupe)}
            onDecline={() => handleQeVagueVehicleResolved(false, currentQeDupe)}
          />
        );
      })()}

      {/* "My Pill" — opened by tapping your own name pill on the map. */}
      <MyPillDialog
        open={onFootPopupOpen}
        onOpenChange={setOnFootPopupOpen}
        own={(liveUsers as LiveUser[] | undefined)?.find(
          u => u.userId === user?.id && u.deviceId === deviceId
        )}
        isInvestigator={isInvestigator}
        tracking={tracedUserIds.size > 0}
        onSetTracking={setTrackAll}
        predictor={predictor}
        onSetOnFoot={onFoot => setOnFootMut.mutate({ onFoot })}
      />
    </DashboardLayout>
  );
}
