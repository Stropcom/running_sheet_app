// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseFlagMarker,
  markerFitsState,
  markerKind,
} from "@shared/flagMarker";
import { findVehicleMarker } from "@shared/vehicleMarker";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import {
  samePlace,
  shortUnidentified,
  targetEmoji,
} from "@shared/targetPosition";
import { trackedTargetCode } from "@shared/trackedTarget";
import { addressMatchKey } from "@shared/addressMatchKey";
import { toast } from "sonner";
import { persistGeocodeCache } from "./geocodeCache";
import {
  buildInfoWindowContent,
  normalizeEntityLabelClient,
  openInfoWindowDeferred,
} from "./infoWindow";
import { haversineMetres } from "./mapMath";
import { type IntelMapLocation } from "./mapTypes";
import type { MapBasicsState } from "./useMapBasics";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapFlyState } from "./useMapFly";
import type { MapDataState } from "./useMapData";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapRsDraftState } from "./useMapRsDraft";
import type { MapPanesState } from "./useMapPanes";

export function useMapMarkers(
  s: Pick<MapBasicsState, "mapRef"> &
    Pick<
      MapAddressSearchState,
      | "customMarkersDataRef"
      | "mergedIntelRef"
      | "markersRef"
      | "geocodedIntelRef"
      | "infoWindowRef"
      | "geocodeIndexRef"
      | "geocodeQueueRef"
      | "geocodeTimerRef"
      | "geocoderRef"
      | "geocodeCacheRef"
      | "setMapRefreshing"
      | "refetchLocations"
      | "mapReady"
      | "locations"
    > &
    Pick<MapFlyState, "createPinElement" | "clearMarkers" | "flyTickRef"> &
    Pick<
      MapDataState,
      | "pinOverridesRef"
      | "photoKeysRef"
      | "personPhotosByKeyRef"
      | "registeredPeopleLookupRef"
      | "refetchCustomMarkers"
      | "refetchPinOverrides"
      | "trackingSettings"
      | "rsSurveillance"
      | "customMarkers"
    > &
    Pick<MapPlacingState, "targetFlagFlyRef"> &
    Pick<MapRsDraftState, "rsTargetPosition" | "rsTrackedTarget"> &
    Pick<MapPanesState, "rsSelectedSheetId" | "rsSelectedOpId">
) {
  const {
    mapRef,
    customMarkersDataRef,
    mergedIntelRef,
    markersRef,
    geocodedIntelRef,
    createPinElement,
    infoWindowRef,
    pinOverridesRef,
    photoKeysRef,
    personPhotosByKeyRef,
    registeredPeopleLookupRef,
    geocodeIndexRef,
    geocodeQueueRef,
    geocodeTimerRef,
    geocoderRef,
    geocodeCacheRef,
    clearMarkers,
    setMapRefreshing,
    refetchLocations,
    refetchCustomMarkers,
    refetchPinOverrides,
    targetFlagFlyRef,
    flyTickRef,
    rsTargetPosition,
    rsTrackedTarget,
    trackingSettings,
    rsSelectedSheetId,
    mapReady,
    rsSelectedOpId,
    rsSurveillance,
    locations,
    customMarkers,
  } = s;

  const placeMarker = useCallback(
    (loc: IntelMapLocation, position: google.maps.LatLngLiteral) => {
      if (!mapRef.current) return;

      // ── Smart merge: only merge/suppress when a HOUSE-type custom marker is within 40m ──
      // Non-house markers (cars, arrows, cameras, etc.) let the intel pin render normally.
      const HOUSE_ICONS: string[] = ["house_outline", "house_filled"];
      const MERGE_RADIUS_M = 40;
      const nearbyHouseCm = customMarkersDataRef.current.find(
        (cm: any) =>
          HOUSE_ICONS.includes(cm.markerIcon) &&
          haversineMetres(position.lat, position.lng, cm.lat, cm.lng) <=
            MERGE_RADIUS_M
      );

      if (nearbyHouseCm) {
        // Merge intel data into the house custom marker's popup and suppress the intel pin.
        // Multiple intel pins can merge into the same house marker (e.g. target_address + observation).
        // target_address entries always sort first so red takes priority in the popup.
        const enriched = { ...loc, lat: position.lat, lng: position.lng };
        const existing = mergedIntelRef.current.get(nearbyHouseCm.id) ?? [];
        // Avoid duplicates by label
        if (!existing.find(e => e.label === enriched.label)) {
          existing.push(enriched);
          // Sort: target_address first, then observation
          existing.sort((a, b) => {
            if (a.type === "target_address" && b.type !== "target_address")
              return -1;
            if (a.type !== "target_address" && b.type === "target_address")
              return 1;
            return 0;
          });
          mergedIntelRef.current.set(nearbyHouseCm.id, existing);
        }
        return; // suppress intel pin — the house marker absorbs it
      }

      // ── Intel-pin same-position deduplication ────────────────────────────────────
      // When a target_address pin has already been placed at this location, absorb any
      // incoming observation pin into it (merge data + update badge) rather than
      // placing a second overlapping purple pin. The target_address pin always wins.
      // Because the server now sorts target_address first, the red pin is always placed
      // before the purple one arrives.
      const INTEL_DEDUP_RADIUS_M = 20;
      if (loc.type === "observation" || loc.type === "associate_address") {
        const nearbyTargetMarkerIdx = markersRef.current.findIndex((m: any) => {
          const pos = m.position as
            | google.maps.LatLng
            | google.maps.LatLngLiteral
            | null;
          if (!pos) return false;
          const mLat =
            typeof (pos as any).lat === "function"
              ? (pos as any).lat()
              : (pos as any).lat;
          const mLng =
            typeof (pos as any).lng === "function"
              ? (pos as any).lng()
              : (pos as any).lng;
          // Check if this marker is a target_address intel pin (stored in geocodedIntelRef)
          const entry = geocodedIntelRef.current.get(m.title ?? "");
          return (
            entry?.loc.type === "target_address" &&
            haversineMetres(position.lat, position.lng, mLat, mLng) <=
              INTEL_DEDUP_RADIUS_M
          );
        });

        if (nearbyTargetMarkerIdx !== -1) {
          const targetMarker = markersRef.current[nearbyTargetMarkerIdx];
          const targetEntry = geocodedIntelRef.current.get(
            targetMarker.title ?? ""
          );
          if (targetEntry) {
            // Merge observation data into the target_address loc
            const merged = targetEntry.loc;
            // Merge assocPersons
            for (const p of loc.assocPersons) {
              if (!merged.assocPersons.includes(p)) merged.assocPersons.push(p);
            }
            // Merge assocVehicles
            for (const v of loc.assocVehicles) {
              if (!merged.assocVehicles.includes(v))
                merged.assocVehicles.push(v);
            }
            // Merge linkedTargets
            for (const t of loc.linkedTargets) {
              if (
                !merged.linkedTargets.find(lt => lt.targetId === t.targetId)
              ) {
                merged.linkedTargets.push(t);
              }
            }
            // Store the observation as a secondary merged entry on the target pin
            if (!targetEntry.secondaryLocs) targetEntry.secondaryLocs = [];
            (targetEntry as any).secondaryLocs.push({
              ...loc,
              lat: position.lat,
              lng: position.lng,
            });
            // Recompute linkCount and update the badge on the existing marker
            merged.linkCount =
              merged.linkedTargets.length +
              merged.assocPersons.length +
              merged.assocVehicles.length;
            const newPinEl = createPinElement({
              ...merged,
              secondaryLocs: targetEntry.secondaryLocs,
            });
            targetMarker.content = newPinEl;
            // Update geocodedIntelRef so the click handler has fresh data
            geocodedIntelRef.current.set(targetMarker.title ?? "", {
              loc: merged,
              position: targetEntry.position,
              secondaryLocs: (targetEntry as any).secondaryLocs,
            });
          }
          return; // suppress the observation pin
        }
      }
      // ─────────────────────────────────────────────────────────────────────────────

      // Store geocoded position for manual merge lookup (all non-suppressed intel pins)
      geocodedIntelRef.current.set(loc.label, { loc, position });
      // ────────────────────────────────────────────────────────────────────────────────

      const pinEl = createPinElement(loc);
      const marker = new DivIconOverlay({
        map: mapRef.current,
        position,
        content: pinEl,
        title: loc.label,
      });
      marker.addListener("click", () => {
        // Go straight to the intel info popup (no intermediate action chooser)
        const enriched = { ...loc, lat: position.lat, lng: position.lng };
        const entry = geocodedIntelRef.current.get(loc.label);
        const secondaryLocs = (entry as any)?.secondaryLocs ?? [];
        const fullEnriched = { ...enriched, secondaryLocs };
        if (!infoWindowRef.current) {
          infoWindowRef.current = new google.maps.InfoWindow({
            pixelOffset: new google.maps.Size(0, -40),
          });
        }
        infoWindowRef.current.setContent(
          buildInfoWindowContent(
            fullEnriched,
            pinOverridesRef.current.get(loc.label),
            photoKeysRef.current.has(normalizeEntityLabelClient(loc.label)) ||
              personPhotosByKeyRef.current.has(addressMatchKey(loc.label)),
            registeredPeopleLookupRef.current
          )
        );
        infoWindowRef.current.setPosition({
          lat: position.lat,
          lng: position.lng,
        });
        openInfoWindowDeferred(infoWindowRef, mapRef.current!);
      });
      markersRef.current.push(marker);
    },
    [createPinElement, buildInfoWindowContent]
  );

  // Runs after one queue item has been placed (or skipped) — restores
  // persisted linkedIntelLabel merges once the whole queue has drained, or
  // schedules the next item.
  const advanceGeocodeQueue = useCallback(() => {
    const isLast = geocodeIndexRef.current >= geocodeQueueRef.current.length;
    if (isLast) {
      // Restore persisted linkedIntelLabel merges for custom markers that have one saved
      const allIntel = geocodedIntelRef.current;
      customMarkersDataRef.current.forEach((cm: any) => {
        if (cm.linkedIntelLabel) {
          const entry = allIntel.get(cm.linkedIntelLabel);
          if (entry) {
            const existing = mergedIntelRef.current.get(cm.id) ?? [];
            const enriched = {
              ...entry.loc,
              lat: entry.position.lat,
              lng: entry.position.lng,
            };
            if (!existing.find(e => e.label === enriched.label)) {
              // Remove the intel pin from the map and merge its data into the custom marker
              const pinIdx = markersRef.current.findIndex(
                (m: any) => m.title === cm.linkedIntelLabel
              );
              if (pinIdx !== -1) {
                markersRef.current[pinIdx].map = null;
                markersRef.current.splice(pinIdx, 1);
              }
              existing.push(enriched);
              existing.sort((a, b) => {
                if (a.type === "target_address" && b.type !== "target_address")
                  return -1;
                if (a.type !== "target_address" && b.type === "target_address")
                  return 1;
                return 0;
              });
              mergedIntelRef.current.set(cm.id, existing);
            }
          }
        }
      });
    } else {
      geocodeTimerRef.current = setTimeout(geocodeNext, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geocodeNext = useCallback(() => {
    const queue = geocodeQueueRef.current;
    if (!geocoderRef.current) return;

    // Drain every item that doesn't need an actual network call — a manual
    // pin-move override or an address already in the geocode cache — in one
    // synchronous pass, with no artificial delay between them (the 50ms
    // pacing in advanceGeocodeQueue only exists to avoid hammering the
    // Geocoder API back-to-back; it serves no purpose between two placements
    // that never touch the network at all). Stop and hand off to the
    // network path the moment we hit a real cache miss, so we still only
    // ever have one live geocode request in flight.
    while (geocodeIndexRef.current < queue.length) {
      const idx = geocodeIndexRef.current;
      const loc = queue[idx];
      geocodeIndexRef.current = idx + 1;

      // A manually-moved position (see intelPinOverrides) takes priority
      // over the geocoded address. Without this, the next time this
      // location's queue runs (every poll) it would re-geocode from the
      // address string and snap straight back to where the address
      // geocodes to, undoing the move a moment after it last "took".
      const override = pinOverridesRef.current.get(loc.label);
      if (override?.lat != null && override?.lng != null) {
        placeMarker(loc, { lat: override.lat, lng: override.lng });
        continue;
      }

      const query =
        loc.label.includes(",") || /\d/.test(loc.label)
          ? `${loc.label}, Western Australia, Australia`
          : `${loc.label}, Perth, Western Australia, Australia`;

      const cached = geocodeCacheRef.current.get(query);
      if (cached) {
        placeMarker(loc, cached);
        continue;
      }

      geocoderRef.current.geocode({ address: query }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const pos = results[0].geometry.location;
          const resolved = { lat: pos.lat(), lng: pos.lng() };
          geocodeCacheRef.current.set(query, resolved);
          persistGeocodeCache(geocodeCacheRef.current);
          placeMarker(loc, resolved);
        }
        advanceGeocodeQueue();
      });
      return;
    }
    advanceGeocodeQueue();
  }, [placeMarker, advanceGeocodeQueue]);

  const renderLocations = useCallback(
    (locs: IntelMapLocation[]) => {
      clearMarkers();
      geocodedIntelRef.current.clear(); // reset geocoded positions so manual merge sees fresh data
      if (!locs || locs.length === 0 || !geocoderRef.current) return;
      geocodeQueueRef.current = locs;
      geocodeIndexRef.current = 0;
      geocodeTimerRef.current = setTimeout(geocodeNext, 200);
    },
    [clearMarkers, geocodeNext]
  );

  // Manual "refresh map data" button (see mapRefreshing declaration) —
  // re-pulls locations/customMarkers/pinOverrides and force-rebuilds the
  // pins from the fresh data, rather than waiting on the next poll or
  // relying on a query's data reference actually changing.
  const handleRefreshMapData = useCallback(async () => {
    setMapRefreshing(true);
    try {
      const [freshLocations] = await Promise.all([
        refetchLocations(),
        refetchCustomMarkers(),
        refetchPinOverrides(),
      ]);
      mergedIntelRef.current.clear();
      if (freshLocations.data) renderLocations(freshLocations.data);
      toast.success("Map refreshed");
    } catch {
      toast.error("Failed to refresh the map");
    } finally {
      setMapRefreshing(false);
    }
  }, [
    refetchLocations,
    refetchCustomMarkers,
    refetchPinOverrides,
    renderLocations,
  ]);

  // Keep customMarkersDataRef in sync so placeMarker can access latest data without stale closure
  // ── Target location flag ──
  // A flag (emoji for his state, name, state, time) hovering over the pin of
  // the place the target is at, on the selected sheet. It is its own overlay
  // at that pin's position, so redrawing the pins never disturbs it. The
  // place is matched to a pin by name; pins are placed as their addresses
  // geocode, so the match is retried for a short while until one turns up.
  // No pin for the place, no flag.
  const targetFlagRef = useRef<DivIconOverlay | null>(null);
  // Why the flag is or isn't showing — shown under the Target location switch
  // in the right-hand pane, so a missing flag explains itself.
  const [targetFlagStatus, setTargetFlagStatus] = useState("");

  // ── Custom marker rendering ────────────────────────────────────────────────
  const customMarkerMapRefs = useRef<Map<number, DivIconOverlay>>(new Map());
  useEffect(() => {
    const removeFlag = () => {
      if (targetFlagRef.current) {
        targetFlagRef.current.map = null;
        targetFlagRef.current = null;
      }
      if (targetFlagFlyRef.current) {
        targetFlagFlyRef.current = null;
        flyTickRef.current?.();
      }
    };
    const pos = rsTargetPosition;
    const token = trackedTargetCode(rsTrackedTarget);
    if (!trackingSettings.location) {
      setTargetFlagStatus("");
    } else if (!rsSelectedSheetId) {
      setTargetFlagStatus("Select a running sheet in the Active RS pane.");
    } else if (rsTrackedTarget?.kind === "location") {
      setTargetFlagStatus(
        "This sheet's target is a location — it doesn't move, so there is no flag to follow."
      );
    } else if (!token) {
      setTargetFlagStatus(
        "This sheet's title has no target in brackets at the end — a surname, e.g. (BAIG), or a registration, e.g. (ABC123) — so there is nothing to flag."
      );
    } else if (!pos) {
      setTargetFlagStatus(
        `The sheet doesn't say where ${token} is yet — no movement, arrival or sighting names ${token}.`
      );
    } else if (!pos.place && !pos.marker) {
      setTargetFlagStatus(
        `${token} is ${pos.label}, but no place is written to put the flag on.`
      );
    } else if (!mapReady || !mapRef.current) {
      setTargetFlagStatus("");
    }
    if (!mapReady || !mapRef.current || (!pos?.place && !pos?.marker)) {
      removeFlag();
      return;
    }
    const place = pos.place ?? "the vehicle's marker";
    // Said under the Target location switch when several markers matched the
    // place and one had to be picked (see shared/flagMarker.ts).
    let pickNote = "";
    const findPin = (): google.maps.LatLngLiteral | null => {
      pickNote = "";
      // A vehicle with its own marker is where that marker is — whatever
      // address the rows give.
      if (pos.marker && pos.state === "vehicle") return pos.marker;
      const markerData = customMarkersDataRef.current as any[];
      // On foot from a vehicle that has its own marker: he left from THAT
      // marker, not from some other marker that resolves to the same address
      // (a boat and a car at 15 Riverside Road).
      if (pos.rego && pos.state === "walking") {
        const own = findVehicleMarker(
          markerData,
          pos.rego,
          rsSelectedOpId ?? null
        );
        if (own) return { lat: own.lat, lng: own.lng };
      }
      // Every custom marker that carries the place — its own address, the
      // address it is linked to, or a location merged into it. More than one
      // can: the flag then goes on the most specific one for what the target
      // is doing (his vehicle's marker, the boat he is on, a place marker
      // when he is inside or on foot) instead of whichever came first.
      const carrying = markerData.filter((cm: any) => {
        if (cm?.lat == null || cm?.lng == null) return false;
        const names: string[] = [
          cm.address,
          cm.linkedIntelLabel,
          ...(mergedIntelRef.current.get(cm.id) ?? []).map((e: any) => e.label),
        ].filter(Boolean);
        return names.some(n => samePlace(String(n), place));
      });
      // A marker that can't be where he is (a boat marker when he is in a car,
      // a car marker when he is on a boat) is never the flag's spot, even as
      // the only marker carrying the place.
      const unfit = new Set<number>(
        markerData
          .filter(
            (cm: any) =>
              !markerFitsState(
                markerKind(cm.markerIcon ?? null, cm.label ?? null),
                pos.state
              )
          )
          .map((cm: any) => cm.id)
      );
      const fitting = carrying.filter((cm: any) => !unfit.has(cm.id));
      if (fitting.length !== carrying.length) {
        carrying.length = 0;
        carrying.push(...fitting);
      }
      if (carrying.length > 1) {
        const choice = chooseFlagMarker(
          carrying.map((cm: any) => ({
            id: cm.id,
            lat: cm.lat,
            lng: cm.lng,
            label: cm.label ?? null,
            address: cm.address ?? null,
            icon: cm.markerIcon ?? null,
            operationId: cm.operationId ?? null,
          })),
          {
            state: pos.state,
            rego: pos.rego,
            operationId: rsSelectedOpId ?? null,
          }
        );
        if (choice) {
          if (choice.ambiguous)
            pickNote = ` ${carrying.length} markers share this address, so the flag is on the newest ${markerKind(choice.marker.icon, choice.marker.label)} marker.`;
          return { lat: choice.marker.lat, lng: choice.marker.lng };
        }
      }
      const pins: any[] = [
        ...markersRef.current,
        ...Array.from(customMarkerMapRefs.current.entries())
          .filter(([id]) => !unfit.has(id))
          .map(([, overlay]) => overlay),
      ];
      for (const m of pins) {
        if (m?.title && m.position && samePlace(String(m.title), place)) {
          return m.position as google.maps.LatLngLiteral;
        }
      }
      if (carrying.length === 1)
        return { lat: carrying[0].lat, lng: carrying[0].lng };
      return null;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const attempt = (n: number) => {
      if (cancelled) return;
      const at = findPin();
      if (!at) {
        if (n < 20) timer = setTimeout(() => attempt(n + 1), 1500);
        else
          setTargetFlagStatus(
            `${token} is ${pos.label} at "${place}", but no pin or marker on the map matches that place. A new address only gets a pin once it has been located on the map.`
          );
        return;
      }
      setTargetFlagStatus(
        `Showing ${token} at "${place}" — ${pos.label}.${pickNote}`
      );
      removeFlag();
      const flag = document.createElement("div");
      flag.style.cssText =
        "position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 26px));" +
        "pointer-events:none;display:flex;flex-direction:column;align-items:center;";
      const pill = document.createElement("div");
      const ended = !!rsSurveillance?.ended;
      const unsure = pos.state === "oos" || ended;
      pill.style.cssText =
        "display:flex;align-items:center;gap:6px;white-space:nowrap;" +
        "background:#fff;color:#14181d;border:2px " +
        (unsure ? "dashed" : "solid") +
        (ended ? " #6b7280" : " #e11d48") +
        ";border-radius:999px;padding:3px 10px 3px 7px;" +
        "font:600 11px/1.2 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3);";
      const em = document.createElement("span");
      em.textContent = ended ? "⏹" : targetEmoji(pos.state, pos.transitMode);
      em.style.cssText = "font-size:15px;";
      const label = document.createElement("span");
      const who = (token ?? "Target").toUpperCase();
      // Everyone with him (the vehicle's occupants, or those inside /
      // walking with him), the target first — as on the tracker card.
      label.textContent = shortUnidentified(
        `${pos.people.length ? pos.people.join(", ") : who} · ${
          ended
            ? `ceased${rsSurveillance?.endedAtTime ? ` at ${rsSurveillance.endedAtTime}` : ""}`
            : pos.label
        }`
      );
      pill.appendChild(em);
      pill.appendChild(label);
      const stem = document.createElement("div");
      stem.style.cssText = `width:2px;height:8px;background:${ended ? "#6b7280" : "#e11d48"};border-radius:1px;`;
      flag.appendChild(pill);
      flag.appendChild(stem);
      targetFlagRef.current = new DivIconOverlay({
        map: mapRef.current,
        position: at,
        content: flag,
        anchor: "none",
        zIndex: 5000,
        title: "Target location",
      });
      // The same flag for Fly (see buildFlySnapshot).
      const lat = typeof at.lat === "function" ? (at as any).lat() : at.lat;
      const lng = typeof at.lng === "function" ? (at as any).lng() : at.lng;
      targetFlagFlyRef.current = {
        lat,
        lng,
        emoji: ended ? "⏹" : targetEmoji(pos.state, pos.transitMode),
        text: label.textContent ?? "",
        unsure,
      };
      flyTickRef.current?.();
    };
    setTargetFlagStatus(`Looking for "${place}" on the map…`);
    attempt(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      removeFlag();
    };
  }, [
    mapReady,
    rsTargetPosition,
    rsSurveillance?.ended,
    rsSurveillance?.endedAtTime,
    rsTrackedTarget,
    rsSelectedSheetId,
    rsSelectedOpId,
    locations,
    customMarkers,
    trackingSettings.location,
  ]);

  return {
    renderLocations,
    handleRefreshMapData,
    targetFlagStatus,
    customMarkerMapRefs,
  };
}

export type MapMarkersState = ReturnType<typeof useMapMarkers>;
