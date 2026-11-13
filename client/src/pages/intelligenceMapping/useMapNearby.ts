// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rotateTargetLocationTile } from "@/lib/targetLocationTile";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import {
  NEARBY_RADIUS_M,
  foldIntoTargetAddresses,
  locationsWithin,
  movedEnough,
} from "@shared/nearbyLocations";
import { type MarkerColour } from "@/lib/markerSvgs";
import { convertGoogleAddresses } from "@/lib/addressFormat";
import { trpc } from "@/lib/trpc";
import { addressMatchKey } from "@shared/addressMatchKey";
import { toast } from "sonner";
import { geocodeQueryForLabel, persistGeocodeCache } from "./geocodeCache";
import {
  buildInfoWindowContent,
  buildMapPeopleLookup,
  normalizeEntityLabelClient,
  openInfoWindowDeferred,
  type MapPeopleLookup,
} from "./infoWindow";
import { type IntelMapLocation } from "./mapTypes";
import {
  createNearbyDiamondElement,
  updateNearbyDiamondElement,
} from "./nearbyDiamond";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapDataState } from "./useMapData";
import type { MapBasicsState } from "./useMapBasics";
import type { MapRsDraftState } from "./useMapRsDraft";

export function useMapNearby(
  s: Pick<
    MapAddressSearchState,
    | "infoWindowRef"
    | "setIntelEditIcon"
    | "setIntelEditColour"
    | "setIntelEditRotation"
    | "setIntelEditLabel"
    | "setIntelEditNote"
    | "setEditingIntelLabel"
    | "intelPinImgRefs"
    | "markersRef"
    | "setMovingIntelLabel"
    | "setPendingIntelMoveAddress"
    | "geocoderRef"
    | "operations"
    | "mapReady"
    | "geocodeCacheRef"
  > &
    Pick<MapPlacingState, "setStreetViewPip" | "setImagesPip"> &
    Pick<
      MapDataState,
      | "pinOverridesRef"
      | "savePinOverrideMut"
      | "pinOverrides"
      | "photoKeysRef"
      | "personPhotosByKeyRef"
      | "registeredPeopleLookupRef"
    > &
    Pick<MapBasicsState, "nearbyOn" | "setNearbyOn" | "mapRef"> &
    Pick<MapRsDraftState, "clearAll">
) {
  const {
    infoWindowRef,
    setStreetViewPip,
    setImagesPip,
    setIntelEditIcon,
    setIntelEditColour,
    setIntelEditRotation,
    pinOverridesRef,
    setIntelEditLabel,
    setIntelEditNote,
    setEditingIntelLabel,
    savePinOverrideMut,
    intelPinImgRefs,
    markersRef,
    setMovingIntelLabel,
    setPendingIntelMoveAddress,
    geocoderRef,
    operations,
    nearbyOn,
    setNearbyOn,
    mapReady,
    geocodeCacheRef,
    pinOverrides,
    mapRef,
    photoKeysRef,
    personPhotosByKeyRef,
    registeredPeopleLookupRef,
    clearAll,
  } = s;

  // Open Street View picture-in-picture from a marker popup's Street View button
  useEffect(() => {
    (window as any).__mapOpenStreetView = (
      lat: number,
      lng: number,
      label: string
    ) => {
      infoWindowRef.current?.close();
      setStreetViewPip({ lat, lng, label });
    };
    return () => {
      delete (window as any).__mapOpenStreetView;
    };
  }, []);

  // Open the photos picture-in-picture from a marker popup's Images button
  useEffect(() => {
    (window as any).__mapOpenImagesPip = (label: string) => {
      infoWindowRef.current?.close();
      setImagesPip({ label });
    };
    return () => {
      delete (window as any).__mapOpenImagesPip;
    };
  }, []);

  // Open edit dialog for intel pin (icon/colour/rotation only)
  useEffect(() => {
    (window as any).__intelOpenEditDialog = (label: string) => {
      infoWindowRef.current?.close();
      // Load current appearance from localStorage
      let icon: string = "house_filled";
      let colour: MarkerColour = "purple";
      let rotation = 0;
      try {
        const stored = localStorage.getItem(`runlog_intel_appearance_${label}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.icon) icon = parsed.icon as string;
          if (parsed.colour) colour = parsed.colour as MarkerColour;
          if (typeof parsed.rotation === "number") rotation = parsed.rotation;
        }
      } catch {
        /* ignore */
      }
      setIntelEditIcon(icon);
      setIntelEditColour(colour);
      setIntelEditRotation(rotation);
      // customLabel/note only ever live server-side (see intelPinOverrides)
      // — no legacy localStorage copy to fall back to, unlike icon/colour/
      // rotation above.
      const override = pinOverridesRef.current.get(label);
      setIntelEditLabel(override?.customLabel ?? "");
      setIntelEditNote(override?.note ?? "");
      setEditingIntelLabel(label);
    };
    return () => {
      delete (window as any).__intelOpenEditDialog;
    };
  }, []);

  // Inline rotation handler for intel pin popup slider — set up once, with the
  // mutation reached through a ref, for the reason given above
  // (__cmPopupRotate): a re-render must not cancel the pending save.
  const savePinOverrideMutRef = useRef(savePinOverrideMut);
  savePinOverrideMutRef.current = savePinOverrideMut;
  useEffect(() => {
    let intelRotateTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: { label: string; rotation: number } | null = null;
    (window as any).__intelPopupRotate = (label: string, valueStr: string) => {
      const rotation = Number(valueStr);
      const encodedLabel = encodeURIComponent(label);
      // Update popup preview image and degree label
      const previewImg = document.getElementById(
        `intel-popup-preview-${encodedLabel}`
      ) as HTMLImageElement | null;
      const degLabel = document.getElementById(
        `intel-popup-deg-${encodedLabel}`
      ) as HTMLElement | null;
      if (previewImg) previewImg.style.transform = `rotate(${rotation}deg)`;
      if (degLabel) degLabel.textContent = `${rotation}°`;
      // Update the actual map marker element — direct img ref first (avoids
      // stale `.content.querySelector` lookups after a marker gets
      // recreated), falling back to querySelector if the ref isn't set.
      // Note: `filter:drop-shadow(...)` is applied once at creation time
      // via the img's base cssText — it must not be mixed into `transform`
      // here, drop-shadow() isn't a valid transform function and doing so
      // makes the browser silently reject the whole transform value.
      const directImg = intelPinImgRefs.current.get(label);
      if (directImg) {
        directImg.style.transform = `rotate(${rotation}deg)`;
        rotateTargetLocationTile(directImg.parentElement, rotation);
      } else {
        const markerEntry = markersRef.current.find(
          (m: any) => m.title === label
        );
        if (markerEntry?.content instanceof HTMLElement) {
          const img = markerEntry.content.querySelector(
            "img"
          ) as HTMLImageElement | null;
          if (img) img.style.transform = `rotate(${rotation}deg)`;
        }
      }
      // Debounce the DB save so we don't fire on every pixel of drag —
      // same pattern as the custom marker rotation slider (__cmPopupRotate).
      if (intelRotateTimer) clearTimeout(intelRotateTimer);
      pending = { label, rotation };
      intelRotateTimer = setTimeout(() => {
        intelRotateTimer = null;
        pending = null;
        savePinOverrideMutRef.current.mutate({ label, rotation });
      }, 400);
    };
    return () => {
      delete (window as any).__intelPopupRotate;
      if (intelRotateTimer) clearTimeout(intelRotateTimer);
      if (pending) savePinOverrideMutRef.current.mutate(pending);
    };
  }, []);

  // ── NEARBY LOCATION ──────────────────────────────────────────────────────────
  // Needs: the officer's own position (its own GPS watch, so it works whether
  // or not Show & Share is on), every location they can reach (not just the
  // operations selected on the map), each one's coordinates (the same
  // geocoding + local cache the normal pins use), then the ones within 500 m
  // drawn as diamonds with a translucent 500 m circle. Clicking a diamond
  // opens the same popup a normal pin does. Nothing here runs while it is off.
  const nearbyMarkersRef = useRef<Map<string, DivIconOverlay>>(new Map());

  // Move intel pin handler
  useEffect(() => {
    (window as any).__intelStartMove = (label: string) => {
      infoWindowRef.current?.close();
      // A normal pin, or (when only NEARBY LOCATION is showing it) the diamond.
      const marker =
        markersRef.current.find((m: any) => m.title === label) ??
        nearbyMarkersRef.current.get(label);
      if (!marker) return;
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
      (marker as any).gmpDraggable = true;
      setMovingIntelLabel(label);
      setPendingIntelMoveAddress(null);
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
            setPendingIntelMoveAddress({
              lat: newLat,
              lng: newLng,
              address: addr,
            });
          }
        );
        google.maps.event.removeListener(dragEndListener);
      });
      (window as any).__intelMoveOrigPos = {
        label,
        lat: origLat,
        lng: origLng,
      };
    };
    return () => {
      delete (window as any).__intelStartMove;
    };
  }, []);
  const nearbyCircleRef = useRef<google.maps.Circle | null>(null);
  const nearbyWithinRef = useRef<Map<string, IntelMapLocation>>(new Map());
  const nearbyFailedRef = useRef<Set<string>>(new Set());
  const [nearbyPos, setNearbyPos] = useState<google.maps.LatLngLiteral | null>(
    null
  );
  const [nearbyCoords, setNearbyCoords] = useState<
    Map<string, google.maps.LatLngLiteral>
  >(new Map());
  const nearbyOpIds = useMemo(
    () => ((operations ?? []) as Array<{ id: number }>).map(o => o.id),
    [operations]
  );
  // Every operation they can reach — not just the ones selected on the map.
  const { data: nearbyAll } = trpc.intelligence.mappingLocations.useQuery(
    { operationIds: nearbyOpIds },
    {
      enabled: nearbyOn && nearbyOpIds.length > 0,
      refetchInterval: 120_000,
    }
  );
  const nearbyRegistryOpIds = nearbyOpIds.slice(0, 200);
  const { data: nearbyPeople } =
    trpc.intelligence.registeredPeopleForMap.useQuery(
      { operationIds: nearbyRegistryOpIds },
      { enabled: nearbyOn && nearbyRegistryOpIds.length > 0 }
    );
  const nearbyRegistryRef = useRef<MapPeopleLookup | undefined>(undefined);
  nearbyRegistryRef.current = useMemo(
    () => (nearbyPeople ? buildMapPeopleLookup(nearbyPeople) : undefined),
    [nearbyPeople]
  );
  const { data: nearbyPersonPhotos } =
    trpc.attachment.personPhotosByAddress.useQuery(
      { operationIds: nearbyRegistryOpIds },
      { enabled: nearbyOn && nearbyRegistryOpIds.length > 0 }
    );
  const nearbyPhotoKeysRef = useRef<Set<string>>(new Set());
  nearbyPhotoKeysRef.current = useMemo(
    () => new Set((nearbyPersonPhotos ?? []).map(g => g.addressKey)),
    [nearbyPersonPhotos]
  );

  // The officer's own position — only while NEARBY LOCATION is on.
  useEffect(() => {
    if (!nearbyOn) {
      setNearbyPos(null);
      return;
    }
    if (!navigator.geolocation) {
      toast.error(
        "This device can't give its position, so Nearby Location is off."
      );
      setNearbyOn(false);
      return;
    }
    let last: google.maps.LatLngLiteral | null = null;
    let warned = false;
    const id = navigator.geolocation.watchPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (movedEnough(last, p)) {
          last = p;
          setNearbyPos(p);
        }
      },
      err => {
        if (warned) return;
        warned = true;
        toast.error(`Nearby Location can't see your position: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [nearbyOn]);

  // Coordinates for every location: a manually-moved position first, then the
  // geocode cache, then the Geocoder (a few a second, remembered afterwards).
  useEffect(() => {
    if (!nearbyOn || !nearbyAll || !mapReady) return;
    const geocoder = geocoderRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resolved = new Map<string, google.maps.LatLngLiteral>();
    const pending: IntelMapLocation[] = [];
    for (const loc of nearbyAll as IntelMapLocation[]) {
      const ov = pinOverridesRef.current.get(loc.label);
      if (ov?.lat != null && ov?.lng != null) {
        resolved.set(loc.label, { lat: ov.lat, lng: ov.lng });
        continue;
      }
      const query = geocodeQueryForLabel(loc.label);
      const cached = geocodeCacheRef.current.get(query);
      if (cached) {
        resolved.set(loc.label, cached);
      } else if (!nearbyFailedRef.current.has(query)) {
        pending.push(loc);
      }
    }
    setNearbyCoords(new Map(resolved));
    if (!geocoder || pending.length === 0) return;
    let index = 0;
    let unflushed = 0;
    const flush = () => {
      if (unflushed > 0) {
        persistGeocodeCache(geocodeCacheRef.current);
        setNearbyCoords(new Map(resolved));
        unflushed = 0;
      }
    };
    const step = () => {
      if (cancelled) return;
      if (index >= pending.length) {
        flush();
        return;
      }
      const loc = pending[index++];
      const query = geocodeQueryForLabel(loc.label);
      geocoder.geocode({ address: query }, (results, status) => {
        if (cancelled) return;
        if (status === "OK" && results && results[0]) {
          const at = results[0].geometry.location;
          const pos = { lat: at.lat(), lng: at.lng() };
          geocodeCacheRef.current.set(query, pos);
          resolved.set(loc.label, pos);
          if (++unflushed >= 5) flush();
        } else if (status === "OVER_QUERY_LIMIT") {
          index--; // try this one again, slower
          timer = setTimeout(step, 2000);
          return;
        } else {
          nearbyFailedRef.current.add(query);
        }
        timer = setTimeout(step, 300);
      });
    };
    step();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      flush();
    };
  }, [nearbyOn, nearbyAll, mapReady, pinOverrides]);

  // The same popup a normal pin opens.
  const openNearbyPopup = useCallback((label: string) => {
    const loc = nearbyWithinRef.current.get(label);
    if (!loc || !mapRef.current || loc.lat == null || loc.lng == null) return;
    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow({
        pixelOffset: new google.maps.Size(0, -40),
      });
    }
    infoWindowRef.current.setContent(
      buildInfoWindowContent(
        loc,
        pinOverridesRef.current.get(label),
        photoKeysRef.current.has(normalizeEntityLabelClient(label)) ||
          nearbyPhotoKeysRef.current.has(addressMatchKey(label)) ||
          personPhotosByKeyRef.current.has(addressMatchKey(label)),
        nearbyRegistryRef.current ?? registeredPeopleLookupRef.current
      )
    );
    infoWindowRef.current.setPosition({ lat: loc.lat, lng: loc.lng });
    openInfoWindowDeferred(infoWindowRef, mapRef.current);
  }, []);

  // Draw (and keep up to date) the circle and the diamonds.
  useEffect(() => {
    const clearAll = () => {
      nearbyMarkersRef.current.forEach(m => {
        m.map = null;
      });
      nearbyMarkersRef.current.clear();
      nearbyWithinRef.current.clear();
      if (nearbyCircleRef.current) {
        nearbyCircleRef.current.setMap(null);
        nearbyCircleRef.current = null;
      }
    };
    const map = mapRef.current;
    if (!nearbyOn || !mapReady || !map || !nearbyPos) {
      clearAll();
      return;
    }
    // The translucent 500 m area. Not clickable, so taps pass through to the
    // map and the pins.
    if (!nearbyCircleRef.current) {
      nearbyCircleRef.current = new google.maps.Circle({
        map,
        center: nearbyPos,
        radius: NEARBY_RADIUS_M,
        strokeColor: "#d97706",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.12,
        clickable: false,
      });
    } else {
      nearbyCircleRef.current.setCenter(nearbyPos);
    }
    const located: IntelMapLocation[] = [];
    for (const l of (nearbyAll as IntelMapLocation[] | undefined) ?? []) {
      const c = nearbyCoords.get(l.label);
      if (c) located.push({ ...l, lat: c.lat, lng: c.lng });
    }
    const within = locationsWithin(
      foldIntoTargetAddresses(
        located as Array<IntelMapLocation & { lat: number; lng: number }>
      ),
      nearbyPos
    );
    nearbyWithinRef.current = new Map(within.map(l => [l.label, l]));
    const keep = new Set<string>();
    for (const loc of within) {
      keep.add(loc.label);
      const position = { lat: loc.lat, lng: loc.lng };
      const existing = nearbyMarkersRef.current.get(loc.label);
      if (existing) {
        existing.position = position;
        updateNearbyDiamondElement(existing.content, loc.distance);
        continue;
      }
      const marker = new DivIconOverlay({
        map,
        position,
        content: createNearbyDiamondElement(loc.type, loc.distance),
        title: loc.label,
        // Under the normal pins: the diamond shows around one that is already
        // on the map, and stands alone where there isn't one.
        zIndex: -1,
      });
      marker.addListener("click", () => openNearbyPopup(loc.label));
      nearbyMarkersRef.current.set(loc.label, marker);
    }
    nearbyMarkersRef.current.forEach((m, label) => {
      if (!keep.has(label)) {
        m.map = null;
        nearbyMarkersRef.current.delete(label);
      }
    });
  }, [nearbyOn, mapReady, nearbyPos, nearbyAll, nearbyCoords, openNearbyPopup]);

  return { nearbyMarkersRef, nearbyCircleRef };
}

export type MapNearbyState = ReturnType<typeof useMapNearby>;
