// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTargetTrackingSettings } from "@/lib/targetTrackingSettings";
import { getNativeBackgroundLocation } from "@/lib/nativeLocation";
import { trpc } from "@/lib/trpc";
import { useOwnRowShortcut } from "@/hooks/useOwnRowShortcut";
import { buildMapPeopleLookup, type MapPeopleLookup } from "./infoWindow";
import type { MapBasicsState } from "./useMapBasics";
import type { MapPanesState } from "./useMapPanes";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapAddressSearchState } from "./useMapAddressSearch";

export function useMapData(
  s: Pick<
    MapBasicsState,
    | "selectedOpIds"
    | "opsExplicitlySet"
    | "isInvestigator"
    | "deviceId"
    | "setGpsError"
    | "sharingEnabled"
  > &
    Pick<MapPanesState, "rsSelectedOpId" | "rsSelectedSheetId"> &
    Pick<
      MapPlacingState,
      | "effectiveOpIdsForMarkersRef"
      | "pendingShape"
      | "drawingLine"
      | "mapQeOpen"
    > &
    Pick<
      MapAddressSearchState,
      | "movingMarkerId"
      | "movingIntelLabel"
      | "watchIdRef"
      | "updateLocationMutRef"
      | "clearLocationMutRef"
    >
) {
  const {
    selectedOpIds,
    opsExplicitlySet,
    rsSelectedOpId,
    effectiveOpIdsForMarkersRef,
    movingMarkerId,
    pendingShape,
    drawingLine,
    movingIntelLabel,
    isInvestigator,
    deviceId,
    setGpsError,
    watchIdRef,
    updateLocationMutRef,
    sharingEnabled,
    clearLocationMutRef,
    rsSelectedSheetId,
    mapQeOpen,
  } = s;

  const setOnFootMut = trpc.intelligence.setOnFoot.useMutation();
  const setOnFootMutRef = useRef(setOnFootMut);
  useEffect(() => {
    setOnFootMutRef.current = setOnFootMut;
  });
  // Guards the >15km/h auto-revert (see the live-marker effect) from
  // firing the mutation on every single poll tick while speed stays above
  // the threshold — only fires once per crossing, resetting the moment
  // onFoot next reads back false from the server.
  const onFootAutoRevertingRef = useRef(false);

  // Custom map markers — poll every 5 seconds
  // Filter by selected operations so markers are scoped to the active operation.
  // When no operation is selected in Map Settings but an RS pane operation is active,
  // include rsSelectedOpId so custom markers for that operation are visible.
  // Pass empty array only when the user explicitly cleared the ops selector
  // (that's a deliberate "show nothing" per getCustomMarkers). When there's
  // truly no operation context at all, pass undefined — not [] — so the
  // server takes its "all ops" branch, which is the only one that includes
  // markers with no operation attached. [] and undefined are NOT
  // interchangeable here: getCustomMarkers treats [] as "nothing selected,
  // show nothing" and only shows unscoped markers when operationIds is
  // omitted entirely.
  const effectiveOpIdsForMarkers = useMemo((): number[] | undefined => {
    if (selectedOpIds.length > 0) return selectedOpIds;
    // If user explicitly cleared the selection, show nothing (don't fall back)
    if (opsExplicitlySet) return [];
    if (rsSelectedOpId !== null) return [rsSelectedOpId];
    return undefined;
  }, [selectedOpIds, opsExplicitlySet, rsSelectedOpId]);
  useEffect(() => {
    effectiveOpIdsForMarkersRef.current = effectiveOpIdsForMarkers;
  }, [effectiveOpIdsForMarkers]);
  const utils = trpc.useUtils();
  // A shortcut marked "Own row" (TP, TEXT …): the chip adds a new row with the
  // current time, the target's surname first (shared/shortcutRow.ts).
  const rsOwnRowShortcut = useOwnRowShortcut(sheetId => {
    void utils.row.list.invalidate({ sheetId });
    void utils.row.entityChips.invalidate({ sheetId });
  });
  // Paused while a marker is being dragged/confirmed (movingMarkerId !== null)
  // so the 5s poll can't land mid-move and hand the render effect below a
  // stale (pre-update) position — which snapped the marker straight back to
  // where it started, intermittently, right after "Accept".
  const { data: customMarkers, refetch: refetchCustomMarkers } =
    trpc.customMarker.list.useQuery(
      { operationIds: effectiveOpIdsForMarkers },
      { refetchInterval: movingMarkerId === null ? 5000 : false, enabled: true }
    );
  const createCustomMarkerMut = trpc.customMarker.create.useMutation({
    onSuccess: () => {
      void refetchCustomMarkers();
    },
  });
  const deleteCustomMarkerMut = trpc.customMarker.delete.useMutation({
    onSuccess: () => {
      void refetchCustomMarkers();
    },
  });
  const updateCustomMarkerMut = trpc.customMarker.update.useMutation({
    onMutate: async () => {
      // Belt-and-braces: also cancel any poll already in flight when the
      // move is accepted, so a stale response can't resolve after this
      // mutation's own refetch and undo it.
      await utils.customMarker.list.cancel();
    },
    onSuccess: () => {
      void refetchCustomMarkers();
    },
  });

  // Transparent annotation shapes (circle/rectangle/sector/line) — same
  // operation scoping as custom markers, same reason the poll pauses while
  // one is actively being placed/dragged/drawn.
  const { data: mapShapesData, refetch: refetchMapShapes } =
    trpc.mapShape.list.useQuery(
      { operationIds: effectiveOpIdsForMarkers },
      {
        refetchInterval: !pendingShape && !drawingLine ? 5000 : false,
      }
    );
  const createMapShapeMut = trpc.mapShape.create.useMutation({
    onSuccess: () => void refetchMapShapes(),
  });
  const updateMapShapeMut = trpc.mapShape.update.useMutation({
    onMutate: async () => {
      await utils.mapShape.list.cancel();
    },
    onSuccess: () => void refetchMapShapes(),
  });
  const deleteMapShapeMut = trpc.mapShape.delete.useMutation({
    onSuccess: () => void refetchMapShapes(),
  });
  // Latest map shapes data ref — lets a shape's click listener (attached
  // once, at creation) read this shape's CURRENT saved fields rather than
  // the stale snapshot captured when the listener was first attached — the
  // exact bug this pattern fixed for custom markers earlier.
  const mapShapesDataRef = useRef<any[]>([]);
  useEffect(() => {
    mapShapesDataRef.current = (mapShapesData as any[] | undefined) ?? [];
  }, [mapShapesData]);

  // Manual position/appearance corrections for intel pins (entities mined
  // from observation text) — a move or an icon/colour/rotation change used
  // to only live in an in-memory ref or localStorage, so it never actually
  // persisted past a refresh, let alone showed up on another device. See
  // the intelPinOverrides schema comment.
  const { data: pinOverrides, refetch: refetchPinOverrides } =
    trpc.intelligence.getPinOverrides.useQuery(undefined, {
      // Without this, a correction saved on one device only ever reached
      // another device when that device's own component happened to
      // remount (navigating out of the map and back in) — this query had
      // no poll at all, unlike locations (30s) and customMarkers (5s).
      // Paused during an active move/rotate on THIS device for the same
      // reason customMarkers' poll pauses then — a poll landing mid-drag
      // could hand the render effect a position that hasn't caught up to
      // what's being dragged yet.
      refetchInterval:
        movingMarkerId === null && movingIntelLabel === null ? 5000 : false,
    });
  const pinOverridesRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    const map = new Map<string, any>();
    for (const o of (pinOverrides as any[] | undefined) ?? []) {
      map.set(o.label, o);
    }
    pinOverridesRef.current = map;
  }, [pinOverrides]);

  // Which addresses have at least one linked photo (see the auto-link at
  // upload time in server/attachmentUpload.ts) — drives the marker's photo
  // badge and the popup's "Images" button, both of which are conditional on
  // this rather than always shown. entityLinkCounts already covers every
  // category/entity in one cheap query, so this just filters it down.
  const { data: entityLinkCounts } =
    trpc.attachment.entityLinkCounts.useQuery();
  const photoKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const keys = new Set<string>();
    for (const c of (entityLinkCounts as any[] | undefined) ?? []) {
      if (c.category === "location" && c.count > 0 && c.entityKey)
        keys.add(c.entityKey);
    }
    photoKeysRef.current = keys;
  }, [entityLinkCounts]);
  // Hand-uploaded profile / baseball-card photos of the people living at each
  // address, for the operation(s) selected in the right-hand pane — makes the
  // popup's Images button appear (and open them after the running-sheet
  // photos) without touching the running-sheet photo links above.
  const personPhotoOpIds = effectiveOpIdsForMarkers ?? [];
  const { data: personPhotoData } =
    trpc.attachment.personPhotosByAddress.useQuery(
      { operationIds: personPhotoOpIds },
      { enabled: personPhotoOpIds.length > 0 }
    );
  const personPhotosByKey = useMemo(
    () => new Map((personPhotoData ?? []).map(g => [g.addressKey, g.photos])),
    [personPhotoData]
  );
  // Everyone registered against those operations' targets, with all their
  // registry vehicles — the marker popups list these under each person.
  const { data: registeredPeopleData } =
    trpc.intelligence.registeredPeopleForMap.useQuery(
      { operationIds: personPhotoOpIds },
      { enabled: personPhotoOpIds.length > 0 }
    );
  const registeredPeopleLookupRef = useRef<MapPeopleLookup | undefined>(
    undefined
  );
  registeredPeopleLookupRef.current = useMemo(
    () =>
      registeredPeopleData
        ? buildMapPeopleLookup(registeredPeopleData)
        : undefined,
    [registeredPeopleData]
  );
  const personPhotosByKeyRef = useRef(personPhotosByKey);
  useEffect(() => {
    personPhotosByKeyRef.current = personPhotosByKey;
  }, [personPhotosByKey]);
  const savePinOverrideMut = trpc.intelligence.savePinOverride.useMutation({
    onMutate: async () => {
      await utils.intelligence.getPinOverrides.cancel();
    },
    onSuccess: () => {
      void refetchPinOverrides();
    },
  });

  // Intelligence entities for associate/vehicle dropdowns — not scoped
  // per-operation today, so not offered to Investigator accounts at all
  // (blocked server-side too, not in INVESTIGATOR_ALLOWED_PATHS).
  const { data: intelEntities } = trpc.intelligence.getEntities.useQuery(
    undefined,
    { enabled: !isInvestigator }
  );
  const assocPersonOptions = useMemo(() => {
    if (!intelEntities) return [];
    return (intelEntities as any[])
      .filter((e: any) => e.type === "person")
      .map((e: any) => e.label as string);
  }, [intelEntities]);
  const vehicleOptions = useMemo(() => {
    if (!intelEntities) return [];
    return (intelEntities as any[])
      .filter((e: any) => e.type === "vehicle")
      .map((e: any) => e.label as string);
  }, [intelEntities]);

  // Restore sharing state on mount (per-device)
  const { data: myLocationState } = trpc.intelligence.myLocationState.useQuery(
    { deviceId },
    { enabled: !!deviceId }
  );

  // On mount: if localStorage says sharing was on, start GPS immediately
  // (before server query resolves) so the pin appears without delay.
  const gpsStartedFromCacheRef = useRef(false);

  // ── GPS / Sharing ────────────────────────────────────────────────────────────
  // Keep refs for values used inside watchPosition callback so the callback
  // always sees the latest deviceId and selectedOpIds without needing to
  // re-register the watcher.
  const deviceIdRef = useRef(deviceId);
  const selectedOpIdsRef = useRef(selectedOpIds);

  const startWatching = useCallback(() => {
    // Inside the iPhone/iPad app the app-wide NativeLocationSharing service
    // reports position (including in the background); a second watcher here
    // would send every fix twice.
    if (getNativeBackgroundLocation()) return;
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported on this device.");
      return;
    }
    // Clear any existing watcher before starting a new one
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        setGpsError(null);
        updateLocationMutRef.current.mutate({
          deviceId: deviceIdRef.current,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          operationIds: selectedOpIdsRef.current,
          sharingEnabled: true,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      err => {
        setGpsError(`GPS error: ${err.message}`);
      },
      // maximumAge caps how stale a cached fix the browser may hand back.
      // At 5000 it could serve a 5-second-old position, which alone would
      // stop the 2-second trail sampling on the server from ever seeing
      // 2-second-apart fixes. 1000 keeps them fresh enough to sample.
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }, []);
  useEffect(() => {
    if (sharingEnabled && !gpsStartedFromCacheRef.current) {
      gpsStartedFromCacheRef.current = true;
      startWatching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  // Server reconciliation: once myLocationState arrives, reconcile DB with local intent.
  const sharingRestoredRef = useRef(false);
  useEffect(() => {
    if (!myLocationState || sharingRestoredRef.current) return;
    sharingRestoredRef.current = true;

    const serverSharingOn = myLocationState.sharingEnabled;
    const localSharingOn = sharingEnabled;

    if (serverSharingOn && !localSharingOn) {
      // Stale DB row (browser closed without cleanup) — clear it
      clearLocationMutRef.current.mutate({ deviceId: deviceIdRef.current });
    } else if (localSharingOn && watchIdRef.current === null) {
      // GPS watcher died somehow — restart it
      startWatching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocationState]);

  // showOwnLocation always mirrors sharingEnabled (single toggle)
  const showOwnLocation = sharingEnabled;

  // RS Actions pane — sheets driven by the top Operations filter
  // When selectedOpIds is non-empty, fetch sheets for all selected operations.
  // When selectedOpIds is empty (ops cleared), return no sheets.
  const rsOpIdsForSheets = useMemo(() => selectedOpIds, [selectedOpIds]);
  const { data: rsSheetsData } = trpc.sheet.listByOperations.useQuery(
    { operationIds: rsOpIdsForSheets },
    { enabled: rsOpIdsForSheets.length > 0 }
  );
  // The one operation a newly-placed custom marker should default to —
  // "the active operation" the RS Selection pane is showing. Prefers the
  // currently-selected running sheet's own operation (unambiguous, a sheet
  // always belongs to exactly one operation) over effectiveOpIdsForMarkers'
  // "exactly one op selected in the top filter" heuristic, which silently
  // fell back to no-operation (and so a marker invisible under any
  // operation-filtered view) whenever 0 or 2+ operations were selected
  // there even though a single sheet — and so a single operation — was
  // clearly active in the pane below it.
  const activeMapOperationId = useMemo((): number | null => {
    if (rsSelectedSheetId !== null) {
      const sheet = (rsSheetsData as any[] | undefined)?.find(
        (s: any) => s.id === rsSelectedSheetId
      );
      if (sheet) return sheet.operationId ?? null;
    }
    return selectedOpIds.length === 1 ? selectedOpIds[0] : null;
  }, [rsSelectedSheetId, rsSheetsData, selectedOpIds]);
  // Target Logger switches (per device, set in this pane's Target Logger
  // section). The tracker's data is also loaded while the Target location
  // marker is on, so the flag can follow the selected sheet without the
  // quick-entry popup being open.
  const trackingSettings = useTargetTrackingSettings();
  // The quick-entry popup's Target panel (blue + purple chips) open/closed,
  // remembered per device like the running sheet's own TARGET panel.
  const [qeTargetPanelExpanded, setQeTargetPanelExpanded] = useState<boolean>(
    () => {
      try {
        return (
          localStorage.getItem("runsheet_qe_target_panel_expanded") !== "false"
        );
      } catch {
        return true;
      }
    }
  );
  const rsTrackingActive = mapQeOpen || trackingSettings.location;
  // Vehicles that departed somewhere on THIS sheet and haven't since
  // arrived anywhere — surfaced as a "Vehicle arriving" chip in RS Quick
  // Entry so the officer doesn't have to retype the occupant description.
  // Deliberately scoped to just this sheet, not the whole operation — these
  // are one-shift, one-use chips that don't carry over to the next sheet.
  const { data: rsPendingDeparturesBase } =
    trpc.row.pendingVehicleDepartures.useQuery(
      { sheetId: rsSelectedSheetId ?? 0 },
      {
        enabled: rsTrackingActive && !!rsSelectedSheetId,
        refetchInterval: trackingSettings.location ? 15000 : false,
      }
    );
  // Vehicles that arrived somewhere on this sheet and haven't since
  // departed again — surfaced as a "Vehicle departing" chip so the officer
  // doesn't have to retype the occupant description from the last arrival.
  const { data: rsPendingArrivalsBase } =
    trpc.row.pendingVehicleArrivals.useQuery(
      { sheetId: rsSelectedSheetId ?? 0 },
      {
        enabled: rsTrackingActive && !!rsSelectedSheetId,
        refetchInterval: trackingSettings.location ? 15000 : false,
      }
    );
  // Locations someone walked into on foot on this sheet and hasn't since
  // walked back out of — surfaced as a "Walked out" chip so the officer
  // doesn't have to retype the route back to the vehicle. See
  // getPendingWalkIns.
  const { data: rsPendingWalkInsBase } = trpc.row.pendingWalkIns.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    {
      enabled: rsTrackingActive && !!rsSelectedSheetId,
      refetchInterval: trackingSettings.location ? 15000 : false,
    }
  );
  // Has the surveillance ended — every team member ceased, nobody commenced
  // since (shared/surveillanceState.ts). Ends the Target Logger and greys the
  // target flag.
  const { data: rsSurveillance } = trpc.row.surveillanceState.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    {
      enabled: rsTrackingActive && !!rsSelectedSheetId,
      refetchInterval: trackingSettings.location ? 15000 : false,
    }
  );
  // People who left a location saying where they were going and haven't
  // been logged entering it — the "Entered" card's source (see
  // getPendingHeadingTo).
  const { data: rsPendingHeadingToBase } = trpc.row.pendingHeadingTo.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    {
      enabled: rsTrackingActive && !!rsSelectedSheetId,
      refetchInterval: trackingSettings.location ? 15000 : false,
    }
  );

  return {
    setOnFootMut,
    setOnFootMutRef,
    onFootAutoRevertingRef,
    utils,
    rsOwnRowShortcut,
    customMarkers,
    refetchCustomMarkers,
    createCustomMarkerMut,
    deleteCustomMarkerMut,
    updateCustomMarkerMut,
    mapShapesData,
    createMapShapeMut,
    updateMapShapeMut,
    deleteMapShapeMut,
    mapShapesDataRef,
    pinOverrides,
    refetchPinOverrides,
    pinOverridesRef,
    photoKeysRef,
    personPhotosByKey,
    registeredPeopleData,
    registeredPeopleLookupRef,
    personPhotosByKeyRef,
    savePinOverrideMut,
    deviceIdRef,
    selectedOpIdsRef,
    startWatching,
    showOwnLocation,
    rsSheetsData,
    activeMapOperationId,
    trackingSettings,
    qeTargetPanelExpanded,
    setQeTargetPanelExpanded,
    rsTrackingActive,
    rsPendingDeparturesBase,
    rsPendingArrivalsBase,
    rsPendingWalkInsBase,
    rsSurveillance,
    rsPendingHeadingToBase,
  };
}

export type MapDataState = ReturnType<typeof useMapData>;
