// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useEffect, useMemo, useRef, useState } from "react";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import {
  useMustShareLocation,
  useTeams,
  useTeamsWithOnlineMembers,
} from "@/lib/teams";
import { type MarkerColour } from "@/lib/markerSvgs";
import { type TacticalGroup } from "@/lib/tacticalMarkers";
import { trpc } from "@/lib/trpc";
import { GEOCODE_CACHE_KEY } from "./geocodeCache";
import { type IntelMapLocation } from "./mapTypes";
import { LS_MAP_SETTINGS_KEY } from "./quickLinks";
import type { MapBasicsState } from "./useMapBasics";
import type { MapPanesState } from "./useMapPanes";
import type { MapPlacingState } from "./useMapPlacing";

export function useMapAddressSearch(
  s: Pick<
    MapBasicsState,
    | "selectedOpIds"
    | "opsExplicitlySet"
    | "selectedTargetIds"
    | "opExpanded"
    | "hiddenTeams"
    | "collapsedTeams"
    | "rsQeExpanded"
    | "mapDarkMode"
    | "showStreetHeadingBar"
    | "showMarkerEntityCount"
    | "showTargetLocation"
    | "nearbyOn"
    | "heatOn"
    | "heatOpChoice"
    | "heatTargetChoice"
    | "heatTransparency"
    | "mapRef"
    | "user"
    | "sharingEnabled"
    | "isInvestigator"
    | "tracedUserIds"
  > &
    Pick<
      MapPanesState,
      | "rsSelectedOpId"
      | "rsSelectedSheetId"
      | "panelWidthNormal"
      | "panelWidthProfile"
    > &
    Pick<MapPlacingState, "splitOn" | "splitBox">
) {
  const {
    selectedOpIds,
    opsExplicitlySet,
    selectedTargetIds,
    opExpanded,
    rsSelectedOpId,
    rsSelectedSheetId,
    hiddenTeams,
    collapsedTeams,
    rsQeExpanded,
    mapDarkMode,
    panelWidthNormal,
    panelWidthProfile,
    showStreetHeadingBar,
    showMarkerEntityCount,
    showTargetLocation,
    nearbyOn,
    heatOn,
    heatOpChoice,
    heatTargetChoice,
    heatTransparency,
    splitOn,
    splitBox,
    mapRef,
    user,
    sharingEnabled,
    isInvestigator,
    tracedUserIds,
  } = s;

  // Address search bar state
  const [addrSearch, setAddrSearch] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [addrSearchOpen, setAddrSearchOpen] = useState(false);
  const autocompleteServiceRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const addrSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const addrSearchPinRef = useRef<DivIconOverlay | null>(null);

  // Follow-me mode: keeps own tag centred on map
  const [followMode, setFollowMode] = useState(false);
  const followModeRef = useRef(false);
  // Own position ref — updated whenever liveUsers refreshes
  const ownPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  // True while the user has an active pan/zoom gesture on the map (wheel,
  // pinch, drag) — see the wheel/touch/dragstart listeners in
  // handleMapReady. Follow-me's camera tween checks this before starting a
  // new segment and cancels any segment already in flight the instant a
  // gesture begins, because continuously calling map.setCenter() every
  // animation frame otherwise fights the browser's own gesture handling —
  // reported as "can't zoom in/out while Follow Me is on", and a pinch
  // genuinely doesn't register as a zoom change at all if our own script
  // is fighting it for control of the camera on every frame. Clears itself
  // a short quiet period after the last gesture event, so releasing a
  // pinch/drag doesn't immediately yank the camera back mid-release.
  const userMapInteractingRef = useRef(false);
  const userMapInteractingTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // ref for long-press on mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // custom marker map objects
  const customMarkersRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  // Merged intel data: custom marker ID → array of intel locations merged into this marker
  // Multiple intel pins (e.g. target_address + observation) can merge into the same house marker.
  // The array is always sorted with target_address entries first (red takes priority).
  const mergedIntelRef = useRef<Map<number, IntelMapLocation[]>>(new Map());
  // Latest custom markers data ref — kept in sync so placeMarker can access it without stale closure
  const customMarkersDataRef = useRef<any[]>([]);
  // All geocoded intel locations (label → {loc, position, secondaryLocs?}) for manual merge lookup
  const geocodedIntelRef = useRef<
    Map<
      string,
      {
        loc: IntelMapLocation;
        position: google.maps.LatLngLiteral;
        secondaryLocs?: IntelMapLocation[];
      }
    >
  >(new Map());
  // Manual merge picker state: which custom marker is being merged, and nearby intel candidates
  const [manualMergePicker, setManualMergePicker] = useState<{
    cmId: number;
    candidates: Array<{
      loc: IntelMapLocation;
      position: google.maps.LatLngLiteral;
      distanceM: number;
    }>;
  } | null>(null);

  // Move marker state: which marker is being dragged to a new position
  const [movingMarkerId, setMovingMarkerId] = useState<number | null>(null);
  const [pendingMoveAddress, setPendingMoveAddress] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);

  // Intel pin move state (separate from custom marker move — intel pins
  // persist to intelPinOverrides, a different table/flow than customMapMarkers)
  const [movingIntelLabel, setMovingIntelLabel] = useState<string | null>(null);
  const [pendingIntelMoveAddress, setPendingIntelMoveAddress] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  // Manual "refresh map data" button — re-pulls locations/customMarkers/
  // pinOverrides and forces a full pin rebuild, for the case where a pin
  // fails to populate and the officer doesn't want to wait for the next
  // poll (or worse, has to clear and reapply the operation filter to force
  // one — see the mapReady dependency fix on the locations render effect).
  const [mapRefreshing, setMapRefreshing] = useState(false);

  // Intel pin edit dialog state (appearance only — persisted to localStorage)
  const [editingIntelLabel, setEditingIntelLabel] = useState<string | null>(
    null
  );
  // Widened to plain string (not MarkerIcon) so a Tactical icon key — not
  // part of the MarkerIcon enum — can be selected here too, same reasoning
  // as cmIcon above.
  const [intelEditIcon, setIntelEditIcon] = useState<string>("house_filled");
  const [intelEditColour, setIntelEditColour] =
    useState<MarkerColour>("purple");
  const [intelEditRotation, setIntelEditRotation] = useState<number>(0);
  // A free-text caption + note, same fields the Place Map Marker dialog
  // has (cmLabel/cmNote) — added per direct request for parity between
  // the two dialogs. Persisted on intelPinOverrides.customLabel/note,
  // not the override's own `label` column (that's the entity's keyed
  // identifier, e.g. an address string, not something an officer types).
  const [intelEditLabel, setIntelEditLabel] = useState("");
  const [intelEditNote, setIntelEditNote] = useState("");
  const [intelEditIconFilter, setIntelEditIconFilter] = useState<
    "all" | "surveillance" | TacticalGroup
  >("surveillance");

  // Map state
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<DivIconOverlay[]>([]);
  // Direct img element refs for live rotation/icon updates without stale
  // `.content.querySelector` lookups — mirrors customMarkerImgRefs below,
  // keyed by the intel pin's location label (same key markersRef entries
  // are found by via `.title`).
  const intelPinImgRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  // Key: "userId_deviceId" for per-device pins
  const liveMarkersRef = useRef<Map<string, DivIconOverlay>>(new Map());
  // Key: "userId_deviceId" -> the requestAnimationFrame id currently
  // tweening that pin's position (see animateLiveMarkerTo below). Lets a
  // fresh position update cancel an in-flight tween instead of the two
  // fighting each other when a new liveUsers poll lands mid-animation.
  const liveMarkerAnimRef = useRef<Map<string, number>>(new Map());
  // Key: "userId_deviceId" -> performance.now() timestamp of the last
  // position update for that pin, so animateLiveMarkerTo can match each
  // tween's duration to the actual elapsed time rather than a fixed guess.
  const liveMarkerLastUpdateRef = useRef<Map<string, number>>(new Map());
  // Same animateLatLngTo bookkeeping as the two refs above, but for the
  // Follow-me camera itself rather than any one pin — see the follow-mode
  // block in the live-marker effect below. Only one map exists, so a
  // single fixed "own" key is enough (no per-pin keying needed).
  const mapCenterAnimRef = useRef<Map<string, number>>(new Map());
  const mapCenterLastUpdateRef = useRef<Map<string, number>>(new Map());
  // Key: "userId_deviceId" -> which of the pin's three motion states it's
  // currently in ("moving" | "short" | "long", see createUserPinElement)
  // and when that state began. Lets "just stopped" settle to "stopped
  // 10s+" purely from the liveUsers poll (already ~1s) re-running this
  // check, no separate timer needed.
  const motionStateRef = useRef<
    Map<string, { state: "moving" | "short" | "long"; since: number }>
  >(new Map());
  // Key: userId — one trace polyline per traced officer
  const traceLinesRef = useRef<Map<number, google.maps.Polyline>>(new Map());
  // Remembers each user's last-known team so a trace line keeps its colour
  // even if that officer briefly drops out of the live liveUsers list.
  const traceUserTeamRef = useRef<Map<number, { teamColour: string | null }>>(
    new Map()
  );
  // Key: userId -> epoch ms when Track was switched on for that officer, so
  // each line starts where they started rather than showing earlier history.
  const trackStartsRef = useRef<Map<number, number>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  // Persisted address → lat/lng cache (see GEOCODE_CACHE_KEY above) — a Map
  // preserves insertion order, which doubles as the LRU-ish eviction order
  // when trimming to GEOCODE_CACHE_MAX_ENTRIES.
  const geocodeCacheRef = useRef<Map<string, google.maps.LatLngLiteral>>(
    new Map()
  );
  const geocodeQueueRef = useRef<IntelMapLocation[]>([]);
  const geocodeIndexRef = useRef(0);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Load the persisted geocode cache once on mount, before any location
  // ever needs to be geocoded — a plain synchronous read, not a query, so
  // there's no risk of the first renderLocations() call racing ahead of it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<
          string,
          google.maps.LatLngLiteral
        >;
        geocodeCacheRef.current = new Map(Object.entries(parsed));
      }
    } catch {
      /* corrupt/inaccessible localStorage — just start with an empty
         cache, every location simply falls back to a real geocode call */
    }
  }, []);

  // Persist map settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_MAP_SETTINGS_KEY,
        JSON.stringify({
          selectedOpIds,
          opsExplicitlySet,
          selectedTargetIds,
          opExpanded: Array.from(opExpanded),
          rsSelectedOpId,
          rsSelectedSheetId,
          hiddenTeams: Array.from(hiddenTeams),
          collapsedTeams: Array.from(collapsedTeams),
          rsQeExpanded,
          mapDarkMode,
          panelWidthNormal,
          panelWidthProfile,
          showStreetHeadingBar,
          showMarkerEntityCount,
          showTargetLocation,
          nearbyOn,
          heatOn,
          heatOpChoice,
          heatTargetChoice,
          heatTransparency,
          nmSplitOn: splitOn,
          nmSplitBox: splitBox,
        })
      );
      // The browser's "storage" event only reaches OTHER tabs, so tell this
      // tab's header (the Active RS button) that the settings changed.
      window.dispatchEvent(new Event("runlog-map-settings-changed"));
    } catch {
      /* ignore */
    }
  }, [
    selectedOpIds,
    opsExplicitlySet,
    selectedTargetIds,
    opExpanded,
    rsSelectedOpId,
    rsSelectedSheetId,
    hiddenTeams,
    collapsedTeams,
    rsQeExpanded,
    mapDarkMode,
    panelWidthNormal,
    panelWidthProfile,
    showStreetHeadingBar,
    showMarkerEntityCount,
    showTargetLocation,
    nearbyOn,
    heatOn,
    heatOpChoice,
    heatTargetChoice,
    heatTransparency,
    splitOn,
    splitBox,
  ]);

  // Save map center/zoom to localStorage whenever the map stops moving (idle event)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const listener = map.addListener("idle", () => {
      // Follow-me continuously re-centres the map on live GPS updates (see
      // the camera-smoothing effect below), which fires this same "idle"
      // event on every animation frame of that tween — up to ~60x/sec, not
      // once. Persisting each of those transient, tracking-driven centres
      // would spam localStorage for no benefit (nobody wants the map to
      // reopen wherever their last GPS ping happened to be), so skip the
      // write entirely while follow mode is active; it resumes normally
      // the moment the user pans manually or turns follow mode off.
      if (followModeRef.current) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (!center || zoom === undefined) return;
      const lat = center.lat();
      const lng = center.lng();
      try {
        const existing = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(
          LS_MAP_SETTINGS_KEY,
          JSON.stringify({ ...parsed, mapCenter: { lat, lng }, mapZoom: zoom })
        );
      } catch {
        /* ignore */
      }
    });
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [mapReady]);

  // Apply dark/light map style whenever mapDarkMode or mapReady changes
  // Dark mode is applied via CSS filter on the map container div (not setOptions — blocked by mapId)

  // Persist sharing state and current userId so it can be read before auth resolves
  useEffect(() => {
    try {
      if (user?.id) {
        localStorage.setItem("runlog_last_user_id", String(user.id));
        const key = `runlog_sharing_u${user.id}`;
        localStorage.setItem(key, String(sharingEnabled));
      }
    } catch {
      /* ignore */
    }
  }, [sharingEnabled, user?.id]);

  // Data
  const { data: operations, isLoading: opsLoading } =
    trpc.operation.listForMap.useQuery();
  const {
    data: locations,
    isLoading: locsLoading,
    refetch: refetchLocations,
  } = trpc.intelligence.mappingLocations.useQuery(
    {
      operationIds: selectedOpIds.length > 0 ? selectedOpIds : undefined,
      targetIds: selectedTargetIds.length > 0 ? selectedTargetIds : undefined,
    },
    { refetchInterval: 30_000 }
  );

  // Live user locations — poll every 1 second. Investigator accounts DO
  // see everyone's pins here (situational awareness is the point of
  // giving them the map at all) — it's only the Teams PANEL (the
  // sidebar roster with per-team hide/collapse controls) they don't get;
  // see its own "not for Investigator" comment further down.
  const mapTeams = useTeams();
  const onlineTeamIds = useTeamsWithOnlineMembers(!isInvestigator);
  // Their team (Investigators) forces Show & Share on: it switches on by
  // itself and the switch is locked.
  const mustShare = useMustShareLocation();
  const { data: liveUsers } = trpc.intelligence.userLocations.useQuery(
    { operationIds: selectedOpIds },
    { refetchInterval: 1000, enabled: true }
  );

  // Live trails for any officers currently being tracked. Each officer's
  // line starts at the moment Track was switched on for them (see
  // toggleUserTrace) — the query asks for everything since the earliest of
  // those starts, and each officer's points are then clipped to their own
  // start when the line is drawn.
  const traceUserIdsArray = useMemo(
    () => Array.from(tracedUserIds),
    [tracedUserIds]
  );
  // Rounded to the second so the query key doesn't churn on every render
  // (Date.now() as an input would refetch continuously).
  const trackSinceMs = useMemo(() => {
    const starts = traceUserIdsArray
      .map(id => trackStartsRef.current.get(id))
      .filter((t): t is number => typeof t === "number");
    const earliest = starts.length ? Math.min(...starts) : Date.now();
    return Math.floor(earliest / 1000) * 1000;
  }, [traceUserIdsArray]);
  const { data: traceHistories } =
    trpc.intelligence.userLocationHistories.useQuery(
      { userIds: traceUserIdsArray, sinceMs: trackSinceMs },
      { refetchInterval: 3000, enabled: traceUserIdsArray.length > 0 }
    );

  // Mutations — declared early so refs are available to GPS effects below
  const updateLocationMut = trpc.intelligence.updateUserLocation.useMutation();
  const clearLocationMut = trpc.intelligence.clearUserLocation.useMutation();
  const updateLocationMutRef = useRef(updateLocationMut);
  const clearLocationMutRef = useRef(clearLocationMut);
  useEffect(() => {
    updateLocationMutRef.current = updateLocationMut;
  });
  useEffect(() => {
    clearLocationMutRef.current = clearLocationMut;
  });

  // "On Foot" pin state — own pill click opens a popup to toggle it (see
  // the click listener on the own marker below and the MyPillDialog
  // rendered near the end of this component). setOnFootMutRef mirrors the same
  // pattern as updateLocationMutRef, since the auto-revert effect below
  // needs a stable reference to call it from outside the render closure.
  const [onFootPopupOpen, setOnFootPopupOpen] = useState(false);

  return {
    addrSearch,
    setAddrSearch,
    addrSuggestions,
    setAddrSuggestions,
    addrSearchOpen,
    setAddrSearchOpen,
    autocompleteServiceRef,
    addrSearchDebounceRef,
    addrSearchPinRef,
    followMode,
    setFollowMode,
    followModeRef,
    ownPositionRef,
    userMapInteractingRef,
    userMapInteractingTimeoutRef,
    longPressTimerRef,
    mergedIntelRef,
    customMarkersDataRef,
    geocodedIntelRef,
    manualMergePicker,
    setManualMergePicker,
    movingMarkerId,
    setMovingMarkerId,
    pendingMoveAddress,
    setPendingMoveAddress,
    movingIntelLabel,
    setMovingIntelLabel,
    pendingIntelMoveAddress,
    setPendingIntelMoveAddress,
    mapRefreshing,
    setMapRefreshing,
    editingIntelLabel,
    setEditingIntelLabel,
    intelEditIcon,
    setIntelEditIcon,
    intelEditColour,
    setIntelEditColour,
    intelEditRotation,
    setIntelEditRotation,
    intelEditLabel,
    setIntelEditLabel,
    intelEditNote,
    setIntelEditNote,
    intelEditIconFilter,
    setIntelEditIconFilter,
    mapReady,
    setMapReady,
    markersRef,
    intelPinImgRefs,
    liveMarkersRef,
    liveMarkerAnimRef,
    liveMarkerLastUpdateRef,
    mapCenterAnimRef,
    mapCenterLastUpdateRef,
    motionStateRef,
    traceLinesRef,
    traceUserTeamRef,
    trackStartsRef,
    infoWindowRef,
    geocoderRef,
    geocodeCacheRef,
    geocodeQueueRef,
    geocodeIndexRef,
    geocodeTimerRef,
    watchIdRef,
    operations,
    opsLoading,
    locations,
    locsLoading,
    refetchLocations,
    mapTeams,
    onlineTeamIds,
    mustShare,
    liveUsers,
    traceHistories,
    updateLocationMutRef,
    clearLocationMutRef,
    onFootPopupOpen,
    setOnFootPopupOpen,
  };
}

export type MapAddressSearchState = ReturnType<typeof useMapAddressSearch>;
