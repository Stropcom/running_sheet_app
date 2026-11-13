// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placeLinkedToTarget } from "@shared/targetLocation";
import { createTargetLocationTile } from "@/lib/targetLocationTile";
import { transitPlaceFromGoogle } from "@shared/transitPlace";
import { signIconOf, placeSignFor } from "@shared/placeSigns";
import { getMarkerIconUrl, type MarkerColour } from "@/lib/markerSvgs";
import { convertGoogleAddresses } from "@/lib/addressFormat";
import { nearmapSpot } from "@shared/nearmapAge";
import { renderHeadingShapeInner } from "@/lib/pillOptions";
import { getLastFlyCamera, type FlyMarker } from "@/components/Map3DView";
import { composeFlyTeamIcon } from "@/lib/flyMarkerIcon";
import { addressMatchKey } from "@shared/addressMatchKey";
import { markerEntityCount } from "@shared/markerEntityCount";
import { createPhotoPill, normalizeEntityLabelClient } from "./infoWindow";
import { type IntelMapLocation, type LiveUser } from "./mapTypes";
import {
  HEADING_SHAPE_ROTATION_OFFSET_DEG,
  getSonarRingTier,
  getTeamColour,
} from "./pinStyling";
import type { MapSharingState } from "./useMapSharing";
import type { MapBasicsState } from "./useMapBasics";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapRsDraftState } from "./useMapRsDraft";
import type { MapPanesState } from "./useMapPanes";
import type { MapDataState } from "./useMapData";

export function useMapFly(
  s: Pick<MapSharingState, "buildFlySnapshot" | "flyHeadingRef"> &
    Pick<
      MapBasicsState,
      | "mapRef"
      | "nearmapActive"
      | "showMarkerEntityCountRef"
      | "showTargetLocationRef"
      | "activeTargetIdRef"
      | "mapHeadingRef"
    > &
    Pick<
      MapPlacingState,
      | "flyCenterRef"
      | "setFlySelectedId"
      | "setFlyTilt"
      | "setFlyView"
      | "flyView"
      | "setNearmapCentre"
      | "flyPick"
      | "setFlyPick"
      | "setActionChooser"
      | "setPoiTap"
      | "setFlyFollow"
    > &
    Pick<
      MapAddressSearchState,
      | "infoWindowRef"
      | "mapReady"
      | "liveUsers"
      | "markersRef"
      | "intelPinImgRefs"
      | "geocodeTimerRef"
      | "motionStateRef"
      | "setOnFootPopupOpen"
    > &
    Pick<MapRsDraftState, "predictorOn" | "ownUserIdRef"> &
    Pick<
      MapPanesState,
      | "rsActionsPaneOpen"
      | "paneTargetProfileId"
      | "paneOperationProfileId"
      | "paneImagesOpId"
      | "paneSheetDetailId"
      | "setRsActionsPaneOpen"
    > &
    Pick<
      MapDataState,
      | "registeredPeopleLookupRef"
      | "pinOverridesRef"
      | "photoKeysRef"
      | "personPhotosByKeyRef"
      | "deviceIdRef"
    >
) {
  const {
    buildFlySnapshot,
    mapRef,
    flyCenterRef,
    setFlySelectedId,
    infoWindowRef,
    flyHeadingRef,
    setFlyTilt,
    setFlyView,
    flyView,
    nearmapActive,
    mapReady,
    setNearmapCentre,
    flyPick,
    liveUsers,
    setFlyPick,
    setActionChooser,
    setPoiTap,
    setFlyFollow,
    predictorOn,
    rsActionsPaneOpen,
    paneTargetProfileId,
    paneOperationProfileId,
    paneImagesOpId,
    paneSheetDetailId,
    setRsActionsPaneOpen,
    markersRef,
    intelPinImgRefs,
    geocodeTimerRef,
    showMarkerEntityCountRef,
    registeredPeopleLookupRef,
    pinOverridesRef,
    showTargetLocationRef,
    activeTargetIdRef,
    photoKeysRef,
    personPhotosByKeyRef,
    motionStateRef,
    mapHeadingRef,
    ownUserIdRef,
    deviceIdRef,
    setOnFootPopupOpen,
  } = s;

  // Latest builder for the refresh timer below (it closes over current state).
  const buildFlySnapshotRef = useRef(buildFlySnapshot);
  buildFlySnapshotRef.current = buildFlySnapshot;
  const [flyHeadingQ, setFlyHeadingQ] = useState(0);

  const openFly = async () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (!c) return;
    const zoom = map.getZoom() ?? 15;
    flyCenterRef.current = null;
    setFlySelectedId(null);
    infoWindowRef.current?.close();
    const snap = await buildFlySnapshot();
    // First open of the session: straight down, north up, over the flat
    // map's view. After that, reopen exactly where Fly was left.
    const saved = getLastFlyCamera();
    flyHeadingRef.current = Math.round((saved?.heading ?? 0) / 10) * 10;
    setFlyHeadingQ(((flyHeadingRef.current % 360) + 360) % 360);
    setFlyTilt(Math.round((saved?.tilt ?? 0) / 5) * 5);
    setFlyView({
      center: saved?.center ?? { lat: c.lat(), lng: c.lng() },
      // About 5 km of camera distance at zoom 15, doubling per zoom level out.
      range:
        saved?.range ??
        Math.min(2_000_000, Math.max(200, 163_840_000 / 2 ** zoom)),
      tilt: saved?.tilt ?? 0,
      heading: saved?.heading ?? 0,
      ...snap,
    });
  };
  // While in Fly, pick up changes (new pins, moved team members, edited
  // shapes) every few seconds without restarting the camera.
  const flyOpen = !!flyView;
  // Nearmap on: note where the flat map is looking, so the label can say when
  // the photos there were taken (see NearmapAgeLabel).
  useEffect(() => {
    const map = mapRef.current;
    if (!nearmapActive || !map || !mapReady) {
      setNearmapCentre(null);
      return;
    }
    const note = () => {
      const c = map.getCenter();
      if (c) setNearmapCentre(nearmapSpot(c.lat(), c.lng()));
    };
    note();
    const listener = map.addListener("idle", note);
    return () => listener.remove();
  }, [nearmapActive, mapReady]);
  const flyMarkers = useMemo<FlyMarker[]>(() => {
    if (!flyView) return [];
    if (!flyPick) return flyView.markers;
    return [
      ...flyView.markers,
      {
        id: "pick:spot",
        lat: flyPick.lat,
        lng: flyPick.lng,
        iconUrl: composeFlyTeamIcon("#f59e0b"),
        size: 44,
      },
    ];
  }, [flyView, flyPick]);
  const flyTickRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!flyOpen) return;
    let cancelled = false;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const snap = await buildFlySnapshotRef.current();
        if (cancelled) return;
        setFlyView(prev => {
          if (!prev) return prev;
          const sig = (x: unknown) => JSON.stringify(x);
          if (
            sig(prev.markers) === sig(snap.markers) &&
            sig(prev.shapes) === sig(snap.shapes)
          )
            return prev;
          return { ...prev, ...snap };
        });
      } finally {
        busy = false;
      }
    };
    flyTickRef.current = () => void tick();
    const timer = window.setInterval(tick, 5000);
    // Redraw the pointing pictures straight away when the view is turned.
    void tick();
    return () => {
      cancelled = true;
      flyTickRef.current = null;
      window.clearInterval(timer);
    };
  }, [flyOpen, flyHeadingQ]);
  // Team positions arrive about once a second — pass each fix on to the 3D
  // map as it lands so the pins glide continuously, instead of waiting for
  // the 5-second sweep above.
  useEffect(() => {
    if (flyOpen) flyTickRef.current?.();
  }, [liveUsers, flyOpen]);
  // Fly's "add here" gestures open the same sheets the flat map does.
  const flyOpenActionChooser = (lat: number, lng: number) => {
    setFlyPick(null);
    new google.maps.Geocoder().geocode(
      { location: { lat, lng } },
      (results, status) => {
        const addr =
          status === "OK" && results && results[0]
            ? results[0].formatted_address
            : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setActionChooser({ lat, lng, address: convertGoogleAddresses(addr) });
      }
    );
  };
  const flyOpenPlace = (lat: number, lng: number, placeId: string) => {
    if (!mapRef.current) return;
    setFlyPick(null);
    new google.maps.places.PlacesService(mapRef.current).getDetails(
      { placeId, fields: ["name", "formatted_address", "types"] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          const transit = transitPlaceFromGoogle(place.name ?? "", place.types);
          const placeSign = transit
            ? null
            : placeSignFor(place.name ?? "", place.types);
          setPoiTap({
            lat,
            lng,
            name: transit?.label ?? place.name ?? "",
            address:
              place.formatted_address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            ...(transit ? { transit } : {}),
            ...(placeSign ? { placeSign } : {}),
          });
        }
      }
    );
  };
  const closeFly = () => {
    if (flyCenterRef.current) mapRef.current?.setCenter(flyCenterRef.current);
    setFlyView(null);
    setFlySelectedId(null);
    setFlyPick(null);
    setFlyFollow(false);
  };

  const handleMapAreaClick = useCallback(() => {
    // While Search is on, the pane stays open until it is
    // closed with its X: taps on the map set where the target was last seen
    // and must not close the pane that is asking for it.
    if (predictorOn) return;
    if (
      rsActionsPaneOpen &&
      paneTargetProfileId === null &&
      paneOperationProfileId === null &&
      paneImagesOpId === null &&
      paneSheetDetailId === null
    ) {
      setRsActionsPaneOpen(false);
    }
  }, [
    predictorOn,
    rsActionsPaneOpen,
    paneTargetProfileId,
    paneOperationProfileId,
    paneImagesOpId,
    paneSheetDetailId,
  ]);

  // ── Map pin rendering ────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    for (const m of markersRef.current) {
      m.map = null;
    }
    markersRef.current = [];
    intelPinImgRefs.current.clear();
    if (geocodeTimerRef.current) {
      clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = null;
    }
  }, []);

  const createPinElement = useCallback((loc: IntelMapLocation) => {
    const isTarget = loc.type === "target_address";
    const count = showMarkerEntityCountRef.current
      ? markerEntityCount(loc, registeredPeopleLookupRef.current)
      : 0;

    // Apply any saved appearance override (icon/colour/rotation) — server-
    // persisted (see intelPinOverrides), same override the popup's rotation
    // slider and Edit dialog save to — so a customization set once actually
    // survives the pin being recreated (map data refresh, filter changes,
    // etc.) AND shows up for every officer on every device, not just the
    // one that set it.
    const override = pinOverridesRef.current.get(loc.label);
    const icon: string =
      override?.markerIcon ?? signIconOf(loc.label) ?? "house_filled";
    const colour: MarkerColour =
      (override?.markerColour as MarkerColour) ?? (isTarget ? "red" : "purple");
    const rotation = override?.rotation ?? 0;

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;`;

    // Target Location: a soft tile in the marker's own colour behind it, when
    // the place is tied to the target of the active running sheet.
    if (
      showTargetLocationRef.current &&
      placeLinkedToTarget(loc, activeTargetIdRef.current)
    ) {
      const tile = createTargetLocationTile(40, colour, icon, rotation);
      if (tile) el.appendChild(tile);
    }

    const img = document.createElement("img");
    img.src = getMarkerIconUrl(icon, colour);
    // Previously sized a few px larger than Surveillance icons to
    // compensate for baked-in transparent margin on the tactical PNGs —
    // removed per direct feedback that it made the raster tactical icons
    // read as oversized/blurry next to the crisp vector Surveillance set.
    // Same size for both now (see the matching note on the custom map
    // marker pin rendering and the picker's tactical tile size).
    const iconPx = 40;
    img.style.cssText = `width:${iconPx}px;height:${iconPx}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));display:block;transform:rotate(${rotation}deg);position:relative;z-index:1;`;
    el.appendChild(img);
    // Direct img ref for live rotation/icon updates — avoids stale
    // `.content.querySelector` lookups (see intelPinImgRefs declaration).
    intelPinImgRefs.current.set(loc.label, img);

    if (count > 0) {
      const badge = document.createElement("div");
      badge.style.cssText = `
        position:absolute;top:-5px;right:-5px;z-index:2;
        background:${isTarget ? "#dc2626" : "#7c3aed"};
        color:#fff;font-size:11px;font-weight:700;
        min-width:18px;height:18px;
        border-radius:9px;padding:0 3px;
        display:flex;align-items:center;justify-content:center;
        border:1.5px solid #fff;
        box-shadow:0 1px 3px rgba(0,0,0,0.3);
      `;
      badge.textContent = String(count);
      el.appendChild(badge);
    }

    // Photo pill across the bottom edge — running-sheet photos (green half,
    // see photoKeysRef) and/or profile photos of the people living here
    // (blue half). Purely informational at a glance; the popup's own Images
    // button is what actually opens them.
    const pinPhotoPill = createPhotoPill(
      photoKeysRef.current.has(normalizeEntityLabelClient(loc.label)),
      personPhotosByKeyRef.current.has(addressMatchKey(loc.label))
    );
    if (pinPhotoPill) {
      pinPhotoPill.style.zIndex = "2";
      el.appendChild(pinPhotoPill);
    }
    return el;
  }, []);

  // Three motion states, shown via a small indicator fused into the name
  // pill's left edge: an arrow (Navigation2's own polygon — the same shape
  // as the Follow-me/North-Up buttons, not a plain triangle) rotated to
  // heading while moving; a green dot the moment someone stops; settling
  // to a red dot once they've been still 10s+. No white backing ring
  // behind it — colour alone carries the state. The indicator's CENTRE,
  // not the pill's bounding box, is the officer's actual GPS position —
  // the pill is a label that extends out from that point, so the marker
  // is placed with anchor:"none" (see the live-marker effect below) and
  // the indicator centres itself on the overlay's local (0,0) via its own
  // translate, independent of the pill's width/height entirely.
  const createUserPinElement = useCallback((liveUser: LiveUser) => {
    const color = liveUser.pinColor ?? getTeamColour(liveUser, liveUser.role);
    const label = liveUser.name.toUpperCase();
    const pinKey = `${liveUser.userId}_${liveUser.deviceId}`;
    const isMoving = liveUser.speed != null && liveUser.speed > 0.5;
    const now = Date.now();
    const prevMotion = motionStateRef.current.get(pinKey);
    let motionState: "moving" | "short" | "long";
    let since: number;
    if (isMoving) {
      motionState = "moving";
      since = now;
    } else if (!prevMotion || prevMotion.state === "moving") {
      // Just transitioned to stopped (or first time seen already stopped —
      // we don't know how long, so the 10s clock starts from now).
      motionState = "short";
      since = now;
    } else {
      since = prevMotion.since;
      motionState = now - since >= 10_000 ? "long" : "short";
    }
    motionStateRef.current.set(pinKey, { state: motionState, since });

    const el = document.createElement("div");
    el.style.cssText = `position:relative;cursor:pointer;`;

    // Name pill — thinner, symmetric top/bottom padding (was heavier on the
    // bottom to balance an underline bar this redesign already removed,
    // which left the text looking off-centre) — only padding-left stays
    // enlarged, to clear the indicator.
    const pill = document.createElement("div");
    pill.style.cssText = `
      position:absolute;
      left:-9px;
      top:0;
      transform:translateY(-50%);
      display:inline-flex;
      align-items:center;
      background:${color};
      color:#fff;
      font-size:10px;
      font-weight:800;
      padding:3px 10px 3px 17px;
      border-radius:20px;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.40);
      letter-spacing:0.06em;
      border:1.5px solid rgba(255,255,255,0.60);
      z-index:1;
    `;
    pill.textContent = label;

    // Bare indicator — no white backing ring. Positioned identically to the
    // old puck (centred on the overlay's local (0,0), i.e. the true GPS
    // fix) but with nothing behind the arrow/dot itself; colour alone now
    // carries the state.
    const indicator = document.createElement("div");
    indicator.style.cssText = `
      position:absolute;
      left:0;
      top:0;
      transform:translate(-50%,-50%);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:2;
    `;
    if (liveUser.onFoot) {
      // On-foot mode: a walking-person glyph entirely replaces the vehicle
      // arrow — no heading rotation (a pedestrian has no "nose direction"
      // the way a vehicle does) and no sonar rings (vehicle-speed themed,
      // 80km/h+, meaningless on foot). Direction of travel is instead a
      // simple east/west mirror — see the sin(heading) comment below —
      // rather than a full compass rotation, which would tip a side-view
      // glyph over the same way the vehicle emoji options did. Always the
      // plain neutral glyph — the gender/skin-tone modifier picker was
      // removed (see the pin-customise popup below), so this no longer
      // varies per officer.
      const speedKmh = (liveUser.speed ?? 0) * 3.6;
      let glyph: string;
      if (motionState === "long") {
        glyph = "🧍"; // stopped 10s+ — same trigger as the vehicle red dot
      } else if (speedKmh > 5) {
        glyph = "🏃"; // moving faster than a walking pace
      } else {
        glyph = "🚶"; // walking (also covers "just stopped", under 10s)
      }
      // The 🚶/🏃/🧍 glyphs render already facing left/west by default in
      // the platform emoji font (confirmed on iOS), so no mirror is needed
      // for westward travel — only eastward travel needs a horizontal
      // flip. sin(heading) > 0 means the heading has an eastward component
      // (the 0-180° half of the compass, measured clockwise from north);
      // <= 0 means westward or due north/south, which defaults to the
      // glyph's own native west-facing pose rather than remembering a
      // "last known side" — a deliberate simplification, since that
      // ambiguous case only ever lasts one frame in practice and isn't
      // worth extra state to smooth over.
      const heading = liveUser.heading ?? 0;
      const faceEast = Math.sin((heading * Math.PI) / 180) > 0;
      indicator.innerHTML = `<span style="font-size:26px;line-height:32px;width:32px;height:32px;display:block;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));transform:scaleX(${faceEast ? -1 : 1});">${glyph}</span>`;
    } else if (motionState === "moving") {
      // Screen rotation, not raw compass bearing: the arrow/rings need to
      // point the right way relative to the map as currently displayed,
      // which drifts from true north whenever a manual rotate gesture has
      // the map itself rotated. Subtracting the map's
      // own current heading converts "true compass bearing" into "on-screen
      // angle" — at mapHeadingRef 0 (North Up, the default) this is a no-op.
      // The shape's own rotation offset (non-zero for a handful of emoji
      // shapes that aren't drawn pointing up by default) is added on top,
      // inside the same rotated wrapper as the rings — see
      // HEADING_SHAPE_ROTATION_OFFSET_DEG's own comment for why that's
      // correct for the rings too, not just the shape.
      const trueHeading = (liveUser.heading ?? 0) - mapHeadingRef.current;
      const shapeOffset =
        HEADING_SHAPE_ROTATION_OFFSET_DEG[liveUser.pinVehicleIcon] ?? 0;
      const rotationDeg = trueHeading + shapeOffset;
      const speedKmh = (liveUser.speed ?? 0) * 3.6;
      const ringTier = getSonarRingTier(speedKmh);
      // Directional "sonar" rings above 80 km/h: half-circles (clipped to
      // their own top half in this un-rotated local space, matching the
      // arrow's own "points up at 0deg" polygon) that rotate together with
      // the shape inside the same heading-group, so the pulse only fans out
      // toward the direction of travel rather than in every direction.
      let ringsHtml = "";
      if (ringTier != null) {
        const staggerMs = ringTier.durationMs / 3;
        ringsHtml = [0, 1, 2]
          .map(
            i =>
              `<span style="position:absolute;left:50%;top:50%;width:25px;height:25px;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #16a34a;clip-path:inset(0 0 50% 0);--sonar-max-size:${ringTier.maxSizePx}px;animation:teamPinSonarRing ${ringTier.durationMs}ms cubic-bezier(0.2,0.6,0.35,1) infinite;animation-delay:${i * staggerMs}ms;z-index:-1;"></span>`
          )
          .join("");
      }
      indicator.innerHTML = `
        <div style="position:relative;width:25px;height:25px;transform:rotate(${rotationDeg}deg);transform-origin:center;">
          ${ringsHtml}
          ${renderHeadingShapeInner(liveUser.pinVehicleIcon)}
        </div>
      `;
    } else {
      const dotColour = motionState === "short" ? "#22c55e" : "#dc2626";
      const dot = document.createElement("div");
      dot.style.cssText = `width:14px;height:14px;border-radius:50%;background:${dotColour};box-shadow:0 1px 3px rgba(0,0,0,0.45);`;
      indicator.appendChild(dot);
    }

    el.appendChild(pill);
    el.appendChild(indicator);

    // Own pin only: tap/click opens the pin-customise popup (currently
    // just the On Foot toggle). Attached directly to this content element
    // rather than via DivIconOverlay's own "click" listener (used
    // elsewhere for the map's native POI click-suppression) — this
    // function reruns on every poll tick for existing markers too (see
    // `existing.content = createUserPinElement(...)`), which swaps in a
    // whole new content element each time, so the listener is naturally
    // "re-added" as a side effect of that regeneration, not something
    // this needs to manage separately.
    const isOwnPin =
      liveUser.userId === ownUserIdRef.current &&
      liveUser.deviceId === deviceIdRef.current;
    if (isOwnPin) {
      el.addEventListener("click", e => {
        e.stopPropagation();
        setOnFootPopupOpen(true);
      });
    }

    return el;
  }, []);

  return {
    flyHeadingQ,
    setFlyHeadingQ,
    openFly,
    flyMarkers,
    flyTickRef,
    flyOpenActionChooser,
    flyOpenPlace,
    closeFly,
    handleMapAreaClick,
    clearMarkers,
    createPinElement,
    createUserPinElement,
  };
}

export type MapFlyState = ReturnType<typeof useMapFly>;
