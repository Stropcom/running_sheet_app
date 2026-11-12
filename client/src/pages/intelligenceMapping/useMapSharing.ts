// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useMemo, useRef } from "react";
import { signIconOf } from "@shared/placeSigns";
import {
  SHARING_EVENT,
  broadcastSharing,
  readSharingFlag,
} from "@/lib/nativeLocation";
import {
  getMarkerIconUrl,
  MARKER_COLOURS,
  type MarkerColour,
} from "@/lib/markerSvgs";
import {
  NO_AUTO_TRACK,
  autoTrackStep,
  type AutoTrackState,
} from "@shared/autoTrack";
import { type FlyMarker, type FlyShape } from "@/components/Map3DView";
import {
  composeFlyIcon,
  composeFlyTeamPin,
  composeFlyTargetFlag,
} from "@/lib/flyMarkerIcon";
import { FLY_COMPASS_FIXED_ICONS } from "@/lib/flyCompassFixed";
import { addressMatchKey } from "@shared/addressMatchKey";
import { markerEntityCount } from "@shared/markerEntityCount";
import { normalizeEntityLabelClient } from "./infoWindow";
import { type LiveUser } from "./mapTypes";
import {
  HEADING_SHAPE_ROTATION_OFFSET_DEG,
  getTeamColour,
  teamKeyOf,
} from "./pinStyling";
import { rectanglePolygonPath, sectorPolygonPath } from "./shapes";
import type { MapDataState } from "./useMapData";
import type { MapBasicsState } from "./useMapBasics";
import type { MapRsDraftState } from "./useMapRsDraft";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapPlacingState } from "./useMapPlacing";

export function useMapSharing(
  s: Pick<
    MapDataState,
    | "deviceIdRef"
    | "selectedOpIdsRef"
    | "startWatching"
    | "registeredPeopleLookupRef"
    | "pinOverridesRef"
    | "photoKeysRef"
    | "personPhotosByKeyRef"
    | "showOwnLocation"
    | "trackingSettings"
    | "mapShapesDataRef"
  > &
    Pick<
      MapBasicsState,
      | "deviceId"
      | "selectedOpIds"
      | "user"
      | "sharingEnabled"
      | "setSharingEnabled"
      | "isMobile"
      | "setGpsError"
      | "setTracedUserIds"
      | "showMarkerEntityCountRef"
      | "hiddenTeams"
      | "hiddenUsers"
    > &
    Pick<MapRsDraftState, "ownUserIdRef" | "predictor"> &
    Pick<
      MapAddressSearchState,
      | "liveUsers"
      | "watchIdRef"
      | "clearLocationMutRef"
      | "mustShare"
      | "trackStartsRef"
      | "traceLinesRef"
      | "geocodedIntelRef"
      | "customMarkersDataRef"
      | "motionStateRef"
    > &
    Pick<MapPlacingState, "flyRotOverrideRef" | "targetFlagFlyRef">
) {
  const {
    deviceIdRef,
    deviceId,
    selectedOpIdsRef,
    selectedOpIds,
    ownUserIdRef,
    user,
    liveUsers,
    watchIdRef,
    clearLocationMutRef,
    sharingEnabled,
    mustShare,
    setSharingEnabled,
    isMobile,
    setGpsError,
    startWatching,
    predictor,
    trackStartsRef,
    setTracedUserIds,
    traceLinesRef,
    registeredPeopleLookupRef,
    flyRotOverrideRef,
    geocodedIntelRef,
    pinOverridesRef,
    showMarkerEntityCountRef,
    photoKeysRef,
    personPhotosByKeyRef,
    customMarkersDataRef,
    showOwnLocation,
    hiddenTeams,
    hiddenUsers,
    motionStateRef,
    targetFlagFlyRef,
    trackingSettings,
    mapShapesDataRef,
  } = s;

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);
  useEffect(() => {
    selectedOpIdsRef.current = selectedOpIds;
  }, [selectedOpIds]);
  useEffect(() => {
    ownUserIdRef.current = user?.id;
  }, [user?.id]);

  // This device's own entry in the live-users list — same data driving the
  // rotating arrow on the caller's own pin, reused here for the Street &
  // Heading bar (see StreetHeadingBar) instead of rotating a marker.
  const ownLiveEntry = useMemo(() => {
    if (!liveUsers) return null;
    return (
      (liveUsers as LiveUser[]).find(
        u => u.userId === user?.id && u.deviceId === deviceIdRef.current
      ) ?? null
    );
  }, [liveUsers, user?.id]); // no deps — uses refs only

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearLocationMutRef.current.mutate({ deviceId: deviceIdRef.current });
  }, []);

  // The switch is also in the top banner (the operation name), which only
  // changes the flag and says so. Follow it here, so the GPS starts and stops
  // exactly as it does from the switch in this page's side panel.
  const sharingRef = useRef(sharingEnabled); // no deps — uses refs only

  const handleSharingToggle = (checked: boolean) => {
    // Locked on for a team that must share.
    if (!checked && mustShare) return;
    setSharingEnabled(checked);
    sharingRef.current = checked;
    // Tell the app-wide location service at once (it follows this switch).
    broadcastSharing(user?.id, checked);
    if (checked) {
      if (!isMobile && !mustShare) {
        setGpsError(
          "Location sharing is designed for mobile devices. Your desktop location may be inaccurate."
        );
      } else {
        setGpsError(null);
      }
      startWatching();
    } else {
      setGpsError(null);
      stopWatching();
    }
  };
  sharingRef.current = sharingEnabled;
  const handleSharingToggleRef = useRef(handleSharingToggle);
  handleSharingToggleRef.current = handleSharingToggle;
  useEffect(() => {
    if (!user?.id) return;
    const follow = () => {
      const on = readSharingFlag(user.id);
      if (on !== sharingRef.current) handleSharingToggleRef.current(on);
    };
    window.addEventListener(SHARING_EVENT, follow);
    return () => window.removeEventListener(SHARING_EVENT, follow);
  }, [user?.id]);

  // Cross-tab sync: deviceId is deliberately per-TAB (see its declaration
  // above), so a second tab left open on the same device/browser runs its
  // own independent GPS watcher, seeded from the same per-user
  // "runlog_sharing_u{id}" localStorage flag at ITS OWN mount time. Turning
  // sharing off in the tab you're looking at only ever stopped THAT tab's
  // watcher and cleared THAT tab's row — an older/background tab never
  // learned sharing was turned off, so it kept pushing fresh GPS fixes
  // under its own deviceId and its pin never disappeared from the map
  // ("leftover pill" even with sharing showing off in the active tab). The
  // browser's native `storage` event fires in every OTHER same-origin tab
  // (never the tab that made the write) whenever localStorage changes, so
  // listening for it here lets a background tab notice the flag flipped to
  // false and stop itself too.
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (!user?.id || e.key !== `runlog_sharing_u${user.id}`) return;
      const turnedOffElsewhere = e.newValue === "false";
      if (turnedOffElsewhere && sharingEnabled && !mustShare) {
        setSharingEnabled(false);
        setGpsError(null);
        stopWatching();
      }
    }
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [user?.id, sharingEnabled, stopWatching, mustShare]);

  // A team that must share (Investigators): sharing switches on by itself as
  // soon as they are on the app, and stays on.
  useEffect(() => {
    if (mustShare && !sharingEnabled) handleSharingToggle(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mustShare, sharingEnabled]);

  // While a Search is shown on this screen, everyone's Track (the trail drawn
  // here) is switched on by itself, from the moment the search started — for
  // everyone sharing their location on the operation. A device with its location
  // off is not in the live list, so it is never tracked. The Search switches a
  // Track on once and never holds it on: switching one off, from the Teams panel
  // or from My Pill, keeps it off for that Search (see shared/autoTrack.ts).
  // Ending the search does not take the Tracks away.
  const teamSearch = predictor.team;
  const autoTrackRef = useRef<AutoTrackState>(NO_AUTO_TRACK);
  const liveIdsKey = Array.from(
    new Set(((liveUsers as LiveUser[] | undefined) ?? []).map(u => u.userId))
  )
    .sort((a, b) => a - b)
    .join(",");
  useEffect(() => {
    const searchKey =
      teamSearch.active && teamSearch.search ? teamSearch.key : null;
    const { next, add } = autoTrackStep(
      autoTrackRef.current,
      searchKey,
      liveIdsKey ? liveIdsKey.split(",").map(Number) : []
    );
    autoTrackRef.current = next;
    if (!add.length || !teamSearch.search) return;
    for (const id of add)
      if (!trackStartsRef.current.has(id))
        trackStartsRef.current.set(id, teamSearch.search.startedAtMs);
    setTracedUserIds(prev => {
      const out = new Set(prev);
      for (const id of add) out.add(id);
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSearch.active, teamSearch.key, liveIdsKey]);

  // Update operationIds in the DB when selectedOpIds change while sharing
  useEffect(() => {
    if (sharingEnabled && watchIdRef.current !== null) {
      // Re-upsert with updated operationIds (lat/lng will be updated on next GPS ping)
      // We don't have current lat/lng here, so just update on next GPS event — no action needed
    }
  }, [selectedOpIds, sharingEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      traceLinesRef.current.forEach(line => line.setMap(null));
      traceLinesRef.current.clear();
    };
  }, []);
  // The 3D camera's heading (to 10°), so team arrows point the right way on
  // screen however the view is turned.
  const flyHeadingRef = useRef(0);

  // ── Click-outside to close panels ──────────────────────────────────────────
  // Only collapses the default Map Settings content — once a sub-view
  // (Target/Operation Profile, Images, or the Running Sheet) is open, it
  // stays open until its own back arrow / X is used. Without this guard, a
  // stray tap on the visible slice of map beside the pane would silently
  // discard whatever the officer was viewing or editing.
  // Everything the 3D view shows, built from the same data as the flat map:
  // each marker is the flat map's own icon (with the entity-count badge and
  // photo pill drawn on), plus drawn shapes and the live team.
  const buildFlySnapshot = async (): Promise<{
    markers: FlyMarker[];
    shapes: FlyShape[];
  }> => {
    const markers: FlyMarker[] = [];
    const jobs: Promise<void>[] = [];
    const registry = registeredPeopleLookupRef.current;
    const addIcon = (
      id: string,
      lat: number,
      lng: number,
      iconName: string,
      colourName: string,
      rotation: number,
      count: number,
      countColour: string,
      rs: boolean,
      profile: boolean,
      label?: string,
      labelOnly?: boolean
    ) => {
      jobs.push(
        composeFlyIcon({
          iconUrl: getMarkerIconUrl(iconName, colourName as MarkerColour),
          // Most icons are drawn upright as saved. The few that must keep a
          // fixed compass heading (FLY_COMPASS_FIXED_ICONS) are counter-
          // turned by the 3D view's heading, as on the flat map. A rotation
          // being dragged on the card shows straight away, ahead of the
          // saved value.
          rotation:
            (flyRotOverrideRef.current.get(id) ?? rotation) -
            (FLY_COMPASS_FIXED_ICONS.has(iconName) ? flyHeadingRef.current : 0),
          count,
          countColour,
          runningSheetPhotos: rs,
          profilePhotos: profile,
          // The flat map's caption pill: marker-coloured, under the icon.
          label,
          labelColour: label ? countColour : undefined,
          labelOnly: !!label && !!labelOnly,
        }).then(pic => {
          markers.push({
            id,
            lat,
            lng,
            iconUrl: pic.url,
            width: pic.width,
            height: pic.height,
          });
        })
      );
    };

    geocodedIntelRef.current.forEach((entry, label) => {
      const override = pinOverridesRef.current.get(label);
      const isTarget = entry.loc.type === "target_address";
      addIcon(
        `intel:${label}`,
        entry.position.lat,
        entry.position.lng,
        override?.markerIcon ?? signIconOf(label) ?? "house_filled",
        override?.markerColour ?? (isTarget ? "red" : "purple"),
        override?.rotation ?? 0,
        showMarkerEntityCountRef.current
          ? markerEntityCount(
              { ...entry.loc, secondaryLocs: entry.secondaryLocs },
              registry
            )
          : 0,
        isTarget ? "#dc2626" : "#7c3aed",
        photoKeysRef.current.has(normalizeEntityLabelClient(label)),
        personPhotosByKeyRef.current.has(addressMatchKey(label))
      );
    });

    for (const cm of customMarkersDataRef.current) {
      if (typeof cm?.lat !== "number" || typeof cm?.lng !== "number") continue;
      addIcon(
        `cm:${cm.id}`,
        cm.lat,
        cm.lng,
        cm.markerIcon ?? "pin",
        cm.markerColour ?? "blue",
        cm.rotation ?? 0,
        0,
        // The marker's own colour — the same fill the flat map's caption
        // pill uses — for the pill and the tail.
        MARKER_COLOURS[cm.markerColour as MarkerColour] ?? MARKER_COLOURS.red,
        !!cm.address &&
          photoKeysRef.current.has(normalizeEntityLabelClient(cm.address)),
        !!cm.address &&
          personPhotosByKeyRef.current.has(addressMatchKey(cm.address)),
        (cm.label ?? "").trim() || (cm.labelOnly ? "(no label)" : undefined),
        !!cm.labelOnly
      );
    }

    // Live team members, with the same hide/show choices as the flat map.
    for (const u of (liveUsers as LiveUser[] | undefined) ?? []) {
      const isThisDevice =
        u.userId === user?.id && u.deviceId === deviceIdRef.current;
      if (isThisDevice && !showOwnLocation) continue;
      if (hiddenTeams.has(teamKeyOf(u))) continue;
      if (hiddenUsers.has(u.userId)) continue;
      // Same look as the flat map: name pill, with the state marker (heading
      // shape / green dot / red dot / walking figure) resting on the spot.
      const pinKey = `${u.userId}_${u.deviceId}`;
      const speedKmh = (u.speed ?? 0) * 3.6;
      const state: "moving" | "short" | "long" =
        u.speed != null && u.speed > 0.5
          ? "moving"
          : (motionStateRef.current.get(pinKey)?.state ?? "short") === "long"
            ? "long"
            : "short";
      const heading = u.heading ?? 0;
      const pin = composeFlyTeamPin({
        name: u.name.toUpperCase(),
        colour: u.pinColor ?? getTeamColour(u, u.role),
        state,
        onFoot: u.onFoot,
        // Walk or run is all the picture needs from the speed, and the
        // rotation is rounded to 10°: a picture that changed with every GPS
        // wobble would be rebuilt on every refresh instead of just gliding.
        speedKmh: speedKmh > 5 ? 10 : 0,
        rotation:
          Math.round(
            (heading -
              flyHeadingRef.current +
              (HEADING_SHAPE_ROTATION_OFFSET_DEG[u.pinVehicleIcon] ?? 0)) /
              10
          ) * 10,
        shape: u.pinVehicleIcon,
        faceEast: Math.sin((heading * Math.PI) / 180) > 0,
      });
      markers.push({
        id: `team:${pinKey}`,
        lat: u.lat,
        lng: u.lng,
        iconUrl: pin.url,
        width: pin.width,
        height: pin.height,
        onGround: true,
        glide: true,
      });
    }

    await Promise.all(jobs);

    // The target's location flag, riding above the pin on the same spot (the
    // pin's own picture height says how far up it must be lifted).
    const flag = targetFlagFlyRef.current;
    if (flag && trackingSettings.location) {
      const pin = markers.find(
        m =>
          (m.id.startsWith("intel:") || m.id.startsWith("cm:")) &&
          Math.abs(m.lat - flag.lat) < 2e-5 &&
          Math.abs(m.lng - flag.lng) < 2e-5
      );
      const pic = composeFlyTargetFlag({
        emoji: flag.emoji,
        text: flag.text,
        unsure: flag.unsure,
        lift: pin?.height ? pin.height - 5 : 81,
      });
      if (pic.url) {
        markers.push({
          id: "targetflag",
          lat: flag.lat,
          lng: flag.lng,
          iconUrl: pic.url,
          width: pic.width,
          height: pic.height,
          inert: true,
        });
      }
    }
    markers.sort((a, b) => a.id.localeCompare(b.id));

    // Drawn shapes → 3D polygons and lines.
    const shapes: FlyShape[] = [];
    // A polygon is two 3D parts: an even shading sheet above the roofs, and
    // the outline on the ground.
    const pushPolygon = (
      id: string,
      coords: { lat: number; lng: number }[],
      colour: string,
      opacity: number
    ) => {
      shapes.push({
        id: `${id}#fill`,
        kind: "polygon",
        part: "fill",
        coords,
        colour,
        opacity,
      });
      shapes.push({
        id: `${id}#edge`,
        kind: "polygon",
        part: "edge",
        coords,
        colour,
        opacity,
      });
    };
    for (const sh of mapShapesDataRef.current) {
      const colour =
        MARKER_COLOURS[sh.colour as MarkerColour] ?? MARKER_COLOURS.blue;
      const opacity = (sh.opacity ?? 30) / 100;
      const centre = { lat: sh.centerLat, lng: sh.centerLng };
      if (sh.shapeType === "circle") {
        const c = new google.maps.LatLng(centre.lat, centre.lng);
        const coords = Array.from({ length: 72 }, (_, i) => {
          const pt = google.maps.geometry.spherical.computeOffset(
            c,
            sh.radiusMeters,
            i * 5
          );
          return { lat: pt.lat(), lng: pt.lng() };
        });
        pushPolygon(`shape:${sh.id}`, coords, colour, opacity);
      } else if (sh.shapeType === "rectangle") {
        pushPolygon(
          `shape:${sh.id}`,
          rectanglePolygonPath(
            sh.neLat,
            sh.neLng,
            sh.swLat,
            sh.swLng,
            sh.rotation ?? 0
          ),
          colour,
          opacity
        );
      } else if (sh.shapeType === "sector") {
        pushPolygon(
          `shape:${sh.id}`,
          sectorPolygonPath(
            centre,
            sh.radiusMeters,
            sh.startAngle,
            sh.endAngle,
            sh.innerRadiusMeters ?? 0
          ),
          colour,
          opacity
        );
      } else {
        const pts = (sh.points ?? []) as { lat: number; lng: number }[];
        if (pts.length >= 2)
          shapes.push({
            id: `shape:${sh.id}`,
            kind: "line",
            coords: pts,
            colour,
            opacity,
          });
      }
    }
    return { markers, shapes };
  };

  return {
    ownLiveEntry,
    handleSharingToggle,
    teamSearch,
    autoTrackRef,
    flyHeadingRef,
    buildFlySnapshot,
  };
}

export type MapSharingState = ReturnType<typeof useMapSharing>;
