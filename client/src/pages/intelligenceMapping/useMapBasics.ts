// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { createNearmapLayer } from "@/components/NearmapPip";
import { useAuth } from "@/_core/hooks/useAuth";
import { LS_MAP_SETTINGS_KEY } from "./quickLinks";

export function useMapBasics() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  // Investigator accounts are map-only, locked to their allocated
  // operation(s) — see INVESTIGATOR_ALLOWED_PATHS in server/_core/trpc.ts
  // for the real (server-side) enforcement; everything gated on this flag
  // below is the matching client-side experience, not the boundary itself.
  const isInvestigator = user?.role === "investigator";
  const investigatorOperationIds = useMemo<number[]>(() => {
    if (!isInvestigator || !(user as any)?.investigatorOperationIds) return [];
    try {
      const parsed = JSON.parse((user as any).investigatorOperationIds);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [isInvestigator, user]);

  // SMEAC briefing overlay — opened via ?smeac=<id>, e.g. from the Post
  // notification. Purely additive: doesn't touch any map/marker state below.
  const search = useSearch();
  const smeacId = (() => {
    const raw = new URLSearchParams(search).get("smeac");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const closeSmeacOverlay = () => setLocation("/intelligence/mapping");

  // UCO Surveillance Deployment Guide overlay — opened via ?ucoGuide=<id>,
  // same mechanics as the SMEAC overlay above.
  const ucoGuideId = (() => {
    const raw = new URLSearchParams(search).get("ucoGuide");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const closeUcoGuideOverlay = () => setLocation("/intelligence/mapping");

  // Opened via ?forCapture=1 — see MapSnapshotDialog.tsx's "Open Map in New
  // Tab" button in the SMEAC map-snapshot flow. The whole SPA shares one
  // static <title> (index.html), so a second tab of this same app is
  // otherwise indistinguishable from any other tab in the browser's
  // getDisplayMedia() screen-share picker. Setting a distinct title only
  // while this param is present gives the officer something to look for.
  const forCapture = new URLSearchParams(search).get("forCapture") === "1";
  useEffect(() => {
    if (!forCapture) return;
    const prevTitle = document.title;
    document.title = "RunLog — Map (select this tab)";
    return () => {
      document.title = prevTitle;
    };
  }, [forCapture]);

  // Filter state — persisted in localStorage
  const [selectedOpIds, setSelectedOpIds] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).selectedOpIds ?? [];
    } catch {
      /* ignore */
    }
    return [];
  });
  // Track whether the user has explicitly interacted with the ops selector.
  // When true and selectedOpIds is empty, we show NO markers (user cleared).
  // When false and selectedOpIds is empty, fall back to rsSelectedOpId context.
  const [opsExplicitlySet, setOpsExplicitlySet] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const p = JSON.parse(s);
        return p.opsExplicitlySet ?? false;
      }
    } catch {
      /* ignore */
    }
    return false;
  });
  // Investigator accounts don't get to choose an operation filter at all —
  // it's locked to exactly their grant, overriding whatever a previous
  // (non-investigator) session on this browser left in localStorage. The
  // operation picker itself is hidden for them below (a static label
  // instead), so this is what actually enforces "only their operation" on
  // the client; operation.list, mappingLocations, customMarker.list and
  // mapShape.list all re-enforce the same grant server-side regardless.
  useEffect(() => {
    if (!isInvestigator) return;
    setSelectedOpIds(investigatorOperationIds);
    setOpsExplicitlySet(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInvestigator, investigatorOperationIds]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).selectedTargetIds ?? [];
    } catch {
      /* ignore */
    }
    return [];
  });
  const [opExpanded, setOpExpanded] = useState<Set<number>>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return new Set<number>(JSON.parse(s).opExpanded ?? []);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // Map position memory — persisted in localStorage
  const [mapInitialCenter, setMapInitialCenter] =
    useState<google.maps.LatLngLiteral>(() => {
      try {
        const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        if (s) {
          const p = JSON.parse(s).mapCenter;
          if (p && typeof p.lat === "number" && typeof p.lng === "number")
            return p;
        }
      } catch {
        /* ignore */
      }
      return { lat: -31.9505, lng: 115.8605 };
    });
  const [mapInitialZoom, setMapInitialZoom] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const z = JSON.parse(s).mapZoom;
        if (typeof z === "number") return z;
      }
    } catch {
      /* ignore */
    }
    return 11;
  });
  // Persist the user's chosen map type (roadmap / hybrid). Not plain
  // "satellite" — that's imagery with no street/business/number labels,
  // which isn't usable for this app; "hybrid" is the same imagery with
  // labels overlaid. Anyone with "satellite" already saved (from before
  // this was fixed) gets migrated to "hybrid" on read below.
  const [mapInitialTypeId, setMapInitialTypeId] = useState<string>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const t = JSON.parse(s).mapTypeId;
        if (typeof t === "string") return t === "satellite" ? "hybrid" : t;
      }
    } catch {
      /* ignore */
    }
    return "roadmap";
  });

  // Per-device ID — tab-unique, stored in sessionStorage so each browser tab gets its own ID.
  // This is critical: two tabs logged in as the same user must have different deviceIds so
  // the receiving tab can see the sharing tab's pin without its own sharing being on.
  const [deviceId] = useState<string>(() => {
    const ssKey = `runlog_tab_device_id`;
    const existing = sessionStorage.getItem(ssKey);
    if (existing) return existing;
    const newId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      sessionStorage.setItem(ssKey, newId);
    } catch {
      /* ignore */
    }
    return newId;
  });
  // Keep a ref so GPS callbacks always use the latest value
  // (deviceId is now stable for the tab lifetime, but ref is still needed for the GPS callbacks)
  // No server query needed — the ID is generated client-side per tab.

  // Location sharing state — read from localStorage immediately so the toggle shows the right state
  // before the server query resolves. The server query will confirm/correct it on mount.
  const [sharingEnabled, setSharingEnabled] = useState<boolean>(() => {
    try {
      const key = `runlog_sharing_u${typeof window !== "undefined" ? (localStorage.getItem("runlog_last_user_id") ?? "anon") : "anon"}`;
      const v = localStorage.getItem(key);
      return v === "true";
    } catch {
      return false;
    }
  });
  // Per-user visibility: Set of userIds that are hidden
  const [hiddenUsers, setHiddenUsers] = useState<Set<number>>(new Set());
  // Users currently being "live traced" — draws their recorded trail as a
  // line on the map, colour-matched to their team pin. Not persisted; each
  // session starts with tracing off.
  const [tracedUserIds, setTracedUserIds] = useState<Set<number>>(new Set());
  // Per-team visibility: Set of team keys that are hidden — persisted
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return new Set<string>(JSON.parse(s).hiddenTeams ?? []);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // Per-team collapsed (members hidden): Set of team keys — persisted
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return new Set<string>(JSON.parse(s).collapsedTeams ?? []);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // RS Quick Entry inline panel open/closed — persisted
  const [rsQeExpanded, setRsQeExpanded] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).rsQeExpanded ?? false;
    } catch {
      /* ignore */
    }
    return false;
  });
  const [mapDarkMode, setMapDarkMode] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).mapDarkMode ?? false;
    } catch {
      /* ignore */
    }
    return false;
  });
  // Count badge on the house markers (total distinct entities linked to the
  // marker) — on by default, switchable from Map Settings.
  const [showMarkerEntityCount, setShowMarkerEntityCount] = useState<boolean>(
    () => {
      try {
        const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        if (s) return JSON.parse(s).showMarkerEntityCount ?? true;
      } catch {
        /* ignore */
      }
      return true;
    }
  );
  const showMarkerEntityCountRef = useRef(showMarkerEntityCount);
  showMarkerEntityCountRef.current = showMarkerEntityCount;
  // TARGET LOCATION — a soft tile behind every marker tied to the target of
  // the active running sheet. Off by default, remembered per device.
  const [showTargetLocation, setShowTargetLocation] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).showTargetLocation === true;
    } catch {
      /* ignore */
    }
    return false;
  });
  const showTargetLocationRef = useRef(showTargetLocation);
  showTargetLocationRef.current = showTargetLocation;
  const activeTargetIdRef = useRef<number | null>(null);
  // NEARBY LOCATION — every Intelligence / Target Registry location within
  // 500 m of the officer, as diamonds on top of the normal pins. Off by
  // default; remembered per device like the other Map Settings switches.
  const [nearbyOn, setNearbyOn] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).nearbyOn === true;
    } catch {
      /* ignore */
    }
    return false;
  });
  // HEAT MAP — a soft fade over every place seen for one operation (and
  // optionally one target), all time, under the normal pins. Off by default;
  // the choices are remembered per device like the other Map Settings.
  const readHeatSetting = <T>(key: string, fallback: T): T => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return (JSON.parse(s)[key] as T) ?? fallback;
    } catch {
      /* ignore */
    }
    return fallback;
  };
  const [heatOn, setHeatOn] = useState<boolean>(() =>
    readHeatSetting("heatOn", false)
  );
  // "auto" follows what the top of the pane has selected (the running sheet's
  // operation and target, else the map's operation); choosing something in the
  // Heat Map section overrides it.
  const [heatOpChoice, setHeatOpChoice] = useState<"auto" | number>(() =>
    readHeatSetting<"auto" | number>("heatOpChoice", "auto")
  );
  const [heatTargetChoice, setHeatTargetChoice] = useState<
    "auto" | "all" | number
  >(() => readHeatSetting<"auto" | "all" | number>("heatTargetChoice", "auto"));
  // 0 = full colour, 80 = very faint.
  const [heatTransparency, setHeatTransparency] = useState<number>(() =>
    readHeatSetting("heatTransparency", 30)
  );
  // Bottom-of-screen bar showing the officer's own current street + heading
  // (see StreetHeadingBar) — a display preference like mapDarkMode, not tied
  // to GPS sharing itself, so it follows the same local-only persistence.
  const [showStreetHeadingBar, setShowStreetHeadingBar] = useState<boolean>(
    () => {
      try {
        const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        if (s) return JSON.parse(s).showStreetHeadingBar ?? false;
      } catch {
        /* ignore */
      }
      return false;
    }
  );
  // 3D (tilt) view — only available under vector rendering. Kept in sync
  // with the map's actual tilt via a "tilt_changed" listener (see
  // handleMapReady) so the button reflects reality even if a gesture
  // changes it directly, not just our own button clicks.
  const [is3DActive, setIs3DActive] = useState(false);
  // Current map rotation in degrees — vector rendering also allows
  // rotating the view (Shift+drag on desktop, twist gesture on mobile),
  // which has no reason to auto-reset. Read by createUserPinElement on
  // every marker redraw (a ref, not React state — the heading-group's own
  // rotation needs to account for the map's current on-screen orientation
  // without forcing this whole page to re-render on every heading_changed
  // tick, which is what NorthUpButton exists to avoid — see its own
  // comment). Kept in sync via the "heading_changed" listener below.
  const mapHeadingRef = useRef(0);
  // Ground truth for whether the map can actually rotate. Map.tsx's
  // getMapRenderPreference() (localStorage/URL) only decides which Map ID
  // gets *requested* — Google can still silently instantiate a raster map
  // regardless of that request (e.g. WebGL unavailable on the device, or
  // the vector Map ID failing to load), in which case .setHeading()/
  // .setTilt() become a harmless no-op with no error. That's exactly the
  // earlier bug's failure mode (see MAP_RENDER_STORAGE_KEY's own history
  // in Map.tsx) recurring for a different underlying reason. Synced from
  // the real map.getRenderingType() via a "renderingtype_changed" listener
  // in handleMapReady, not inferred. actualRenderingTypeRef is the ref
  // version for effects that read refs rather than depending on renders;
  // isMapActuallyVector is the state the UI buttons below read for their
  // disabled/title text.
  const actualRenderingTypeRef = useRef<"VECTOR" | "RASTER" | "UNINITIALIZED">(
    "UNINITIALIZED"
  );
  const [isMapActuallyVector, setIsMapActuallyVector] = useState(false);
  // Nearmap aerial-imagery overlay toggle — a google.maps.ImageMapType
  // pushed onto map.overlayMapTypes, requesting tiles from our own
  // /api/nearmap/tile proxy (server/nearmapProxy.ts) rather than Nearmap
  // directly, so the org's Nearmap API key never reaches the browser. Off
  // by default; not persisted, since it's a per-session visual aid rather
  // than a map setting.
  const [nearmapActive, setNearmapActive] = useState(false);
  const nearmapLayerRef = useRef<google.maps.ImageMapType | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  // Adds or removes the Nearmap layer on the flat map (the NM button).
  const setNearmapOverlay = (on: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    if (!on) {
      if (nearmapLayerRef.current) {
        const overlays = map.overlayMapTypes;
        const idx = overlays.getArray().indexOf(nearmapLayerRef.current);
        if (idx !== -1) overlays.removeAt(idx);
        nearmapLayerRef.current = null;
      }
      setNearmapActive(false);
      return;
    }
    if (nearmapLayerRef.current) return;
    const layer = createNearmapLayer();
    map.overlayMapTypes.push(layer);
    nearmapLayerRef.current = layer;
    setNearmapActive(true);
  };
  // Operations dropdown open state
  const [opsDropdownOpen, setOpsDropdownOpen] = useState(false);
  // Operations picker mode: single-select (default, picking replaces the
  // current selection and closes the dropdown — switching operations swaps
  // the map's data outright) vs multi-select (checkboxes accumulate, picked
  // via the "Multi" toggle). Deliberately NOT persisted to localStorage —
  // every fresh visit starts back in single mode, and toggleOp also drops
  // back to single mode on its own once a multi-selection is narrowed down
  // to one (or zero) operations, so "single" is always the resting state.
  const [multiOpMode, setMultiOpMode] = useState(false);
  // Operations picker search filter — cleared whenever the dropdown closes.
  const [opSearchQuery, setOpSearchQuery] = useState("");
  // GPS error
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Whether device supports geolocation
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  return {
    user,
    isInvestigator,
    smeacId,
    closeSmeacOverlay,
    ucoGuideId,
    closeUcoGuideOverlay,
    selectedOpIds,
    setSelectedOpIds,
    opsExplicitlySet,
    setOpsExplicitlySet,
    selectedTargetIds,
    setSelectedTargetIds,
    opExpanded,
    setOpExpanded,
    mapInitialCenter,
    mapInitialZoom,
    mapInitialTypeId,
    setMapInitialTypeId,
    deviceId,
    sharingEnabled,
    setSharingEnabled,
    hiddenUsers,
    setHiddenUsers,
    tracedUserIds,
    setTracedUserIds,
    hiddenTeams,
    setHiddenTeams,
    collapsedTeams,
    setCollapsedTeams,
    rsQeExpanded,
    mapDarkMode,
    setMapDarkMode,
    showMarkerEntityCount,
    setShowMarkerEntityCount,
    showMarkerEntityCountRef,
    showTargetLocation,
    setShowTargetLocation,
    showTargetLocationRef,
    activeTargetIdRef,
    nearbyOn,
    setNearbyOn,
    heatOn,
    setHeatOn,
    heatOpChoice,
    setHeatOpChoice,
    heatTargetChoice,
    setHeatTargetChoice,
    heatTransparency,
    setHeatTransparency,
    showStreetHeadingBar,
    setShowStreetHeadingBar,
    is3DActive,
    setIs3DActive,
    mapHeadingRef,
    actualRenderingTypeRef,
    isMapActuallyVector,
    setIsMapActuallyVector,
    nearmapActive,
    mapRef,
    setNearmapOverlay,
    opsDropdownOpen,
    setOpsDropdownOpen,
    multiOpMode,
    setMultiOpMode,
    opSearchQuery,
    setOpSearchQuery,
    gpsError,
    setGpsError,
    isMobile,
  };
}

export type MapBasicsState = ReturnType<typeof useMapBasics>;
