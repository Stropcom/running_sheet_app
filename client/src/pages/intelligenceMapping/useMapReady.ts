// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useRef } from "react";
import { DivIconOverlay, wasAnyMarkerJustTapped } from "@/lib/divIconOverlay";
import { transitPlaceFromGoogle } from "@shared/transitPlace";
import { placeSignFor } from "@shared/placeSigns";
import { convertGoogleAddresses } from "@/lib/addressFormat";
import { toast } from "sonner";
import { animateLatLngTo, animateLiveMarkerTo } from "./mapMath";
import { type LiveUser } from "./mapTypes";
import { getTeamColour, teamKeyOf } from "./pinStyling";
import { LS_MAP_SETTINGS_KEY } from "./quickLinks";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapDataState } from "./useMapData";
import type { MapBasicsState } from "./useMapBasics";
import type { MapMarkersState } from "./useMapMarkers";
import type { MapRsDraftState } from "./useMapRsDraft";
import type { MapFlyState } from "./useMapFly";
import type { MapPlacingState } from "./useMapPlacing";

export function useMapReady(
  s: Pick<
    MapAddressSearchState,
    | "customMarkersDataRef"
    | "locations"
    | "geocoderRef"
    | "mergedIntelRef"
    | "mapReady"
    | "liveUsers"
    | "liveMarkersRef"
    | "motionStateRef"
    | "liveMarkerAnimRef"
    | "liveMarkerLastUpdateRef"
    | "ownPositionRef"
    | "followModeRef"
    | "userMapInteractingRef"
    | "mapCenterAnimRef"
    | "mapCenterLastUpdateRef"
    | "traceUserTeamRef"
    | "traceLinesRef"
    | "traceHistories"
    | "trackStartsRef"
    | "infoWindowRef"
    | "autocompleteServiceRef"
    | "setMapReady"
    | "userMapInteractingTimeoutRef"
  > &
    Pick<
      MapDataState,
      | "customMarkers"
      | "registeredPeopleData"
      | "personPhotosByKey"
      | "pinOverrides"
      | "deviceIdRef"
      | "showOwnLocation"
      | "onFootAutoRevertingRef"
      | "setOnFootMutRef"
    > &
    Pick<
      MapBasicsState,
      | "mapRef"
      | "showMarkerEntityCount"
      | "showTargetLocation"
      | "user"
      | "hiddenTeams"
      | "hiddenUsers"
      | "tracedUserIds"
      | "actualRenderingTypeRef"
      | "setIsMapActuallyVector"
      | "setIs3DActive"
      | "mapHeadingRef"
      | "setMapInitialTypeId"
    > &
    Pick<MapMarkersState, "renderLocations"> &
    Pick<MapRsDraftState, "rsTargetData"> &
    Pick<MapFlyState, "createUserPinElement"> &
    Pick<
      MapPlacingState,
      "setActionChooser" | "drawingLineRef" | "setDrawingLine" | "setPoiTap"
    >
) {
  const {
    customMarkersDataRef,
    customMarkers,
    locations,
    mapRef,
    geocoderRef,
    mergedIntelRef,
    renderLocations,
    mapReady,
    showMarkerEntityCount,
    registeredPeopleData,
    showTargetLocation,
    rsTargetData,
    personPhotosByKey,
    pinOverrides,
    liveUsers,
    user,
    deviceIdRef,
    showOwnLocation,
    hiddenTeams,
    hiddenUsers,
    liveMarkersRef,
    motionStateRef,
    liveMarkerAnimRef,
    liveMarkerLastUpdateRef,
    ownPositionRef,
    followModeRef,
    userMapInteractingRef,
    mapCenterAnimRef,
    mapCenterLastUpdateRef,
    onFootAutoRevertingRef,
    setOnFootMutRef,
    createUserPinElement,
    traceUserTeamRef,
    traceLinesRef,
    tracedUserIds,
    traceHistories,
    trackStartsRef,
    infoWindowRef,
    autocompleteServiceRef,
    setMapReady,
    setActionChooser,
    actualRenderingTypeRef,
    setIsMapActuallyVector,
    setIs3DActive,
    mapHeadingRef,
    userMapInteractingTimeoutRef,
    setMapInitialTypeId,
    drawingLineRef,
    setDrawingLine,
    setPoiTap,
  } = s;

  // NOTE: Do NOT call renderLocations here — that would create a loop:
  //   customMarkers changes → renderLocations → geocode → placeMarker stores mergedIntel
  //   → (nothing triggers re-render, but the 5s poll refetches customMarkers) → loop
  // The ref is updated synchronously so placeMarker always reads fresh data.
  useEffect(() => {
    customMarkersDataRef.current = (customMarkers as any[] | undefined) ?? [];
  }, [customMarkers]);

  // Re-render location markers when locations change.
  // After geocoding completes, persisted linkedIntelLabel merges are restored in a second pass
  // (see the geocodeNext callback which calls restorePersistedMerges after the queue drains)
  //
  // mapReady is included (matching the customMarkers effect below) because
  // mapRef/geocoderRef are plain refs, not state — if `locations` resolves
  // BEFORE the Google Maps script finishes loading, this effect's guard
  // fails on that run, and a ref becoming non-null later doesn't by itself
  // trigger anything to re-run. Without mapReady in the deps, nothing then
  // ever re-fires this effect until `locations` itself changes reference
  // again (e.g. clearing and reapplying the operation filter) — which is
  // exactly the "some/all markers don't show up until I reapply the
  // operation" symptom this was causing.
  useEffect(() => {
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
      renderLocations(locations);
    }
  }, [locations, renderLocations, mapReady]);

  // Re-draw location pins once the profile-photo lookup arrives or changes, so
  // the blue half of the photo pill appears without waiting for another refresh.
  // Re-draw the count badges when the toggle flips or the registry data they
  // are built from arrives or changes.
  const entityCountDrawnRef = useRef(false);
  useEffect(() => {
    if (!entityCountDrawnRef.current) {
      entityCountDrawnRef.current = true;
      return;
    }
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
      renderLocations(locations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showMarkerEntityCount,
    registeredPeopleData,
    showTargetLocation,
    rsTargetData?.id,
  ]);

  const hadPersonPhotosRef = useRef(false);
  useEffect(() => {
    // Nothing to draw (and nothing to undo) while there are no profile photos.
    if (personPhotosByKey.size === 0 && !hadPersonPhotosRef.current) return;
    hadPersonPhotosRef.current = personPhotosByKey.size > 0;
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
      renderLocations(locations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personPhotosByKey]);

  // Re-render pins when a pin override changes on ANOTHER device (a move or
  // appearance edit synced in by the poll above). The pinOverridesRef effect
  // keeps the *data* fresh, but nothing else re-draws an already-placed pin
  // from it — without this, a teammate's correction only ever became visible
  // once something else forced a full rebuild (e.g. navigating out of the
  // map and back in), which is exactly the "have to leave and come back for
  // it to take effect" symptom this fixes.
  //
  // Gated on an actual content change, not just a new query response — every
  // 5s poll returns a fresh array reference even when nothing changed, and
  // renderLocations does a full clear-then-rebuild (unlike the customMarkers
  // effect, which diffs in place), so without this every single poll
  // visibly flashed all the pins off and back on again. Skips the very
  // first load too, which the effect above already covers once
  // pinOverridesRef is populated (it runs first — declared earlier in the
  // component).
  const pinOverridesSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pinOverrides) return;
    const signature = JSON.stringify(
      (pinOverrides as any[])
        .map(o => [
          o.label,
          o.lat,
          o.lng,
          o.markerIcon,
          o.markerColour,
          o.rotation,
        ])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    );
    if (pinOverridesSignatureRef.current === null) {
      pinOverridesSignatureRef.current = signature;
      return;
    }
    if (signature === pinOverridesSignatureRef.current) return;
    pinOverridesSignatureRef.current = signature;
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
      renderLocations(locations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinOverrides]);

  // ── Live user marker rendering ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !liveUsers) return;

    const currentUserId = user?.id;
    const currentDeviceId = deviceIdRef.current;
    const visibleUsers = (liveUsers as LiveUser[]).filter(u => {
      // Only hide THIS device's own pin when sharing is off.
      // Same user on a different device (different deviceId) must always show.
      const isThisDevice =
        u.userId === currentUserId && u.deviceId === currentDeviceId;
      if (isThisDevice && !showOwnLocation) return false;
      // Per-team visibility (manual hide buttons in the team list)
      if (hiddenTeams.has(teamKeyOf(u))) return false;
      // Per-user visibility (manual hide button per user)
      if (hiddenUsers.has(u.userId)) return false;
      return true;
    });

    // Remove markers for devices no longer visible
    const visibleKeys = new Set(
      visibleUsers.map(u => `${u.userId}_${u.deviceId}`)
    );
    Array.from(liveMarkersRef.current.entries()).forEach(([key, marker]) => {
      if (!visibleKeys.has(key)) {
        marker.map = null;
        liveMarkersRef.current.delete(key);
        motionStateRef.current.delete(key);
        const frame = liveMarkerAnimRef.current.get(key);
        if (frame != null) cancelAnimationFrame(frame);
        liveMarkerAnimRef.current.delete(key);
        liveMarkerLastUpdateRef.current.delete(key);
      }
    });

    // Track own position and apply follow-mode pan
    const ownEntry = (liveUsers as LiveUser[]).find(
      u => u.userId === currentUserId && u.deviceId === currentDeviceId
    );
    if (ownEntry) {
      ownPositionRef.current = { lat: ownEntry.lat, lng: ownEntry.lng };
      if (
        followModeRef.current &&
        mapRef.current &&
        !userMapInteractingRef.current
      ) {
        // Tween the camera too, not just panTo() straight to the new fix —
        // panTo()'s own built-in animation is a short, fixed-duration ease
        // fired fresh every poll tick, so it finishes and sits still, then
        // hops again next tick: the exact same stop-start stutter the pin
        // itself had before switching to animateLatLngTo. Reusing that
        // same engine here keeps the camera moving continuously in step
        // with the pin it's following, using setCenter() (not panTo())
        // each frame so we're not fighting Google's own separate
        // animation on top of ours. Skipped entirely while the user has an
        // active pan/zoom gesture (userMapInteractingRef) — see that ref's
        // own comment for why: continuously calling setCenter() otherwise
        // fights native gesture handling and a pinch-zoom simply doesn't
        // register at all.
        const map = mapRef.current;
        animateLatLngTo(
          "own",
          () => map.getCenter()?.toJSON() ?? ownPositionRef.current!,
          p => map.setCenter(p),
          { lat: ownEntry.lat, lng: ownEntry.lng },
          mapCenterAnimRef,
          mapCenterLastUpdateRef
        );
      }
      // On Foot auto-revert: speed over 15 km/h switches the pin back to
      // the vehicle arrow automatically — officers forget to switch it
      // back manually after getting back in a car. Fires the mutation
      // once per crossing (onFootAutoRevertingRef), not on every poll tick
      // while speed stays above the threshold; resets the moment the
      // server confirms onFoot is back to false. Deliberately one-way —
      // dropping back under 15 km/h does NOT re-enable On Foot, matching
      // "stays arrow until manually changed again".
      if (ownEntry.onFoot) {
        const ownSpeedKmh = (ownEntry.speed ?? 0) * 3.6;
        if (ownSpeedKmh > 15) {
          if (!onFootAutoRevertingRef.current) {
            onFootAutoRevertingRef.current = true;
            setOnFootMutRef.current.mutate({ onFoot: false });
            toast.info(
              "Speed over 15 km/h — pin switched back to vehicle automatically"
            );
          }
        } else {
          onFootAutoRevertingRef.current = false;
        }
      }
    }

    // Add/update markers for visible devices
    for (const liveUser of visibleUsers) {
      const pinKey = `${liveUser.userId}_${liveUser.deviceId}`;
      const existing = liveMarkersRef.current.get(pinKey);
      try {
        if (existing) {
          // Tween to the new fix instead of jumping — see
          // animateLiveMarkerTo's own comment for why this can't just be a
          // CSS transition (it would also animate during ordinary map pan/
          // zoom, not just data updates).
          animateLiveMarkerTo(
            existing,
            pinKey,
            { lat: liveUser.lat, lng: liveUser.lng },
            liveMarkerAnimRef,
            liveMarkerLastUpdateRef
          );
          // Refresh content to update motion dot
          existing.content = createUserPinElement(liveUser);
        } else {
          const pinEl = createUserPinElement(liveUser);
          const marker = new DivIconOverlay({
            map: mapRef.current,
            position: { lat: liveUser.lat, lng: liveUser.lng },
            content: pinEl,
            title: liveUser.name.toUpperCase(),
            zIndex: 999,
            // "none": createUserPinElement's own puck already centres
            // itself on this overlay's local (0,0) — the default "center"
            // anchor would instead centre the whole pill's bounding box
            // (puck + name label combined), putting the marked position
            // out under the label rather than the officer's actual GPS fix.
            anchor: "none",
          });
          liveMarkersRef.current.set(pinKey, marker);
        }
      } catch (err) {
        console.error(
          "[LiveMarkers] failed to place pin for",
          liveUser.name,
          err
        );
      }
    }
    // mapReady is included so this effect re-runs the moment the map is available,
    // even if liveUsers data arrived before the map was initialised.
  }, [
    liveUsers,
    showOwnLocation,
    hiddenUsers,
    hiddenTeams,
    user,
    createUserPinElement,
    mapReady,
  ]);

  // Remember each live user's team so a trace line keeps its colour even if
  // that officer's pin briefly drops out of the live list (GPS gap, etc.).
  useEffect(() => {
    if (!liveUsers) return;
    for (const u of liveUsers as LiveUser[]) {
      traceUserTeamRef.current.set(u.userId, { teamColour: u.teamColour });
    }
  }, [liveUsers]);

  // ── Live-trace line rendering ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove lines for users no longer being traced
    Array.from(traceLinesRef.current.entries()).forEach(([userId, line]) => {
      if (!tracedUserIds.has(userId)) {
        line.setMap(null);
        traceLinesRef.current.delete(userId);
      }
    });

    if (!traceHistories) return;
    for (const userId of Array.from(tracedUserIds)) {
      const all = (
        traceHistories as Record<
          number,
          { lat: number; lng: number; recordedAt: number }[]
        >
      )[userId];
      // The query fetches from the earliest start across all tracked
      // officers, so clip each one to their own Track-on moment.
      const startedAt = trackStartsRef.current.get(userId) ?? 0;
      const points = (all ?? []).filter(p => p.recordedAt >= startedAt);
      if (points.length < 2) continue;
      const path = points.map(p => ({ lat: p.lat, lng: p.lng }));
      const colour = getTeamColour(
        traceUserTeamRef.current.get(userId) ?? null
      );
      const existing = traceLinesRef.current.get(userId);
      if (existing) {
        existing.setPath(path);
      } else {
        const line = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: colour,
          strokeOpacity: 0.85,
          strokeWeight: 3,
          zIndex: 500,
          map: mapRef.current,
        });
        traceLinesRef.current.set(userId, line);
      }
    }
  }, [traceHistories, tracedUserIds]);
  // Direct img element refs for live rotation without stale content queries
  const customMarkerImgRefs = useRef<Map<number, HTMLImageElement>>(new Map());

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();
      infoWindowRef.current = new google.maps.InfoWindow({
        pixelOffset: new google.maps.Size(0, -40),
      });
      autocompleteServiceRef.current =
        new google.maps.places.AutocompleteService();
      setMapReady(true); // triggers live marker effect to run now that map is available
      if (locations) {
        renderLocations(locations);
      }
      // Right-click: show action chooser (RS Quick Entry | Add Marker Here | Navigate with Waze)
      map.addListener("rightclick", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const addr =
            status === "OK" && results && results[0]
              ? results[0].formatted_address
              : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setActionChooser({ lat, lng, address: convertGoogleAddresses(addr) });
        });
      });

      // Ground truth for whether this map instance can actually rotate —
      // see actualRenderingTypeRef's own comment above. Google can take a
      // moment after map construction to resolve VECTOR vs. RASTER (it
      // starts UNINITIALIZED), and can in principle change later, so this
      // is read live off the map rather than assumed once at mount.
      const syncRenderingType = () => {
        const rt = map.getRenderingType();
        actualRenderingTypeRef.current = rt;
        setIsMapActuallyVector(rt === google.maps.RenderingType.VECTOR);
      };
      syncRenderingType();
      map.addListener("renderingtype_changed", syncRenderingType);

      // Keep the 3D button's on/off state in sync with the map's actual
      // tilt — vector maps also let a user tilt via a two-finger drag
      // (mobile) or Ctrl+drag (desktop) gesture directly, not just our
      // button, and Google can itself reset tilt to 0 in some map-type/
      // zoom combinations that don't support it.
      map.addListener("tilt_changed", () => {
        setIs3DActive((map.getTilt() ?? 0) > 0);
      });

      // Keep the North Up button's rotation/enabled state in sync with the
      // map's actual heading — set both by our own button and by the
      // native Shift+drag / twist rotate gesture. A ref, not React state —
      // see mapHeadingRef's own comment for why (NorthUpButton owns its
      // own separate subscription for the one piece of UI that needs this
      // reactively).
      map.addListener("heading_changed", () => {
        mapHeadingRef.current = map.getHeading() ?? 0;
        // Custom map marker icons are DOM overlays (DivIconOverlay), not
        // symbols the map itself renders — so unlike a native rotated
        // symbol, they don't turn with the map on their own; without this
        // they'd stay glued to the screen instead of the compass direction
        // they were placed facing. Each icon's data-rotation is the angle
        // it was placed at (see the poll-cycle build below and
        // __cmPopupRotate, both of which set it); subtracting the map's
        // current heading is the same "compensate for map rotation" math
        // createUserPinElement already uses for the live-heading arrow
        // (mapHeadingRef's own comment above). Imperative DOM writes, not
        // React state, for the same reason NorthUpButton isolates its own
        // subscription — a rotate gesture can fire this many times a
        // second and re-rendering this whole page on every tick would
        // fight the map's own rendering for the main thread.
        customMarkerImgRefs.current.forEach(img => {
          const base = Number(img.dataset.rotation ?? "0");
          img.style.transform = `rotate(${base - mapHeadingRef.current}deg)`;
        });
      });

      // Let a user gesture (wheel/pinch zoom, drag) immediately take over
      // from Follow-me's own camera tween instead of fighting it — see
      // userMapInteractingRef's own comment. dragstart only fires for a
      // real user-initiated drag (not our own programmatic setCenter
      // calls), so it's a clean signal on top of the raw wheel/touch
      // listeners, which are needed because Maps doesn't expose an
      // equivalent start/end event pair for zoom gestures.
      const markUserMapInteracting = () => {
        userMapInteractingRef.current = true;
        const frame = mapCenterAnimRef.current.get("own");
        if (frame != null) cancelAnimationFrame(frame);
        mapCenterAnimRef.current.delete("own");
        if (userMapInteractingTimeoutRef.current) {
          clearTimeout(userMapInteractingTimeoutRef.current);
        }
        userMapInteractingTimeoutRef.current = setTimeout(() => {
          userMapInteractingRef.current = false;
        }, 500);
      };
      map.addListener("dragstart", markUserMapInteracting);
      const mapDiv = map.getDiv();
      mapDiv.addEventListener("wheel", markUserMapInteracting, {
        passive: true,
      });
      mapDiv.addEventListener("touchstart", markUserMapInteracting, {
        passive: true,
      });
      mapDiv.addEventListener("touchmove", markUserMapInteracting, {
        passive: true,
      });

      // Persist map type (roadmap / satellite) whenever the user switches
      map.addListener("maptypeid_changed", () => {
        const typeId = map.getMapTypeId();
        if (!typeId) return;
        setMapInitialTypeId(typeId);
        try {
          const existing = localStorage.getItem(LS_MAP_SETTINGS_KEY);
          const parsed = existing ? JSON.parse(existing) : {};
          localStorage.setItem(
            LS_MAP_SETTINGS_KEY,
            JSON.stringify({ ...parsed, mapTypeId: typeId })
          );
        } catch {
          /* ignore */
        }
      });

      // Tap anywhere on the map (not on a marker/POI) → close the InfoWindow
      map.addListener(
        "click",
        (e: google.maps.MapMouseEvent & { placeId?: string }) => {
          // While drawing a line, every tap appends a vertex instead of the
          // usual close-InfoWindow / POI-lookup behaviour — including a tap
          // that happens to land on a POI, since the officer is mid-draw.
          if (drawingLineRef.current && e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setDrawingLine(d =>
              d ? { points: [...d.points, { lat, lng }] } : d
            );
            return;
          }
          if (!e.placeId) {
            infoWindowRef.current?.close();
            return;
          }
          if (!e.latLng) return;
          const tapLat = e.latLng.lat();
          const tapLng = e.latLng.lng();
          // Google's own POI hit-testing for the base map runs independently
          // of our DOM overlay markers — it's the Maps SDK's own internal
          // gesture handling on the underlying vector tiles, not something a
          // DOM stopPropagation() on our marker's own click/pointerdown
          // listener can suppress (that only stops the event reaching
          // ancestor DOM listeners; this "click" is a separate MapMouseEvent
          // Maps fires on the map itself whenever a tap lands on a POI,
          // whether or not a marker is drawn on top of it). A prior version
          // of this check compared tapLat/tapLng against our own markers'
          // registered position (within ~40m) instead of the timing check
          // below — that worked for a precise desktop mouse click (which
          // lands right on the marker glyph) but not for a touch tap, which
          // can land on the POI's own label text (rendered offset from the
          // marker icon on the base map) — e.latLng reports wherever the
          // finger actually was, nowhere near the marker's own coordinates,
          // so the distance check silently never matched on mobile. Timing
          // instead of distance: if ANY of our own markers just had a
          // pointerdown (same physical tap, see wasAnyMarkerJustTapped's own
          // comment), skip the POI card regardless of where exactly the
          // reported tap coordinates land — the marker's own popup (which
          // already offers RS Quick Entry/Waze/etc, see its click listener
          // above) is the one that should show, not both.
          if (wasAnyMarkerJustTapped()) {
            e.stop?.();
            return;
          }
          // A tap on any base-map POI always opens our own RS Quick Entry /
          // Marker / Shape / Waze action sheet directly — Google's native
          // info window (name/photo/rating/hours) is suppressed entirely so
          // it never appears instead of, or stacked with, our own popup.
          e.stop?.();
          // Look up the business details via Places API
          const service = new google.maps.places.PlacesService(map);
          service.getDetails(
            {
              placeId: e.placeId,
              fields: ["name", "formatted_address", "types"],
            },
            (place, status) => {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                place
              ) {
                const transit = transitPlaceFromGoogle(
                  place.name ?? "",
                  place.types
                );
                const placeSign = transit
                  ? null
                  : placeSignFor(place.name ?? "", place.types);
                setPoiTap({
                  lat: tapLat,
                  lng: tapLng,
                  name: transit?.label ?? place.name ?? "",
                  address:
                    place.formatted_address ??
                    `${tapLat.toFixed(5)}, ${tapLng.toFixed(5)}`,
                  ...(transit ? { transit } : {}),
                  ...(placeSign ? { placeSign } : {}),
                });
              }
            }
          );
        }
      );
    },
    [locations, renderLocations]
  );

  return { customMarkerImgRefs, handleMapReady };
}

export type MapReadyState = ReturnType<typeof useMapReady>;
