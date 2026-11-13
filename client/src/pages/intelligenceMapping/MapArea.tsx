// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { DivIconOverlay } from "@/lib/divIconOverlay";
import { signIconOf } from "@shared/placeSigns";
import { getMarkerIconUrl, type MarkerColour } from "@/lib/markerSvgs";
import {
  convertGoogleAddresses,
  formatIntelAddress,
} from "@/lib/addressFormat";
import { SplitViewFrame } from "@/components/SplitViewFrame";
import { NearmapPip } from "@/components/NearmapPip";
import { NearmapAgeLabel } from "@/components/NearmapAgeLabel";
import { MapView } from "@/components/Map";
import { SmeacMapOverlay } from "@/components/SmeacMapOverlay";
import { StreetViewPip } from "@/components/StreetViewPip";
import { Map3DView } from "@/components/Map3DView";
import { ImagesPip } from "@/components/ImagesPip";
import { addressMatchKey } from "@shared/addressMatchKey";
import { StreetHeadingBar } from "@/components/StreetHeadingBar";
import { UcoGuideMapOverlay } from "@/components/UcoGuideMapOverlay";
import {} from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {} from "@/components/ui/select";
import { HEAT_RAMP } from "@/lib/heatMapSection";
import { toast } from "sonner";
import {
  MapPin,
  X,
  Search,
  LocateFixed,
  Navigation2,
  RefreshCw,
} from "lucide-react";
import { FlyRotationSlider, NorthUpButton } from "./MapControls";
import { entityBlocksHtml, normalizeEntityLabelClient } from "./infoWindow";
import { type LiveUser } from "./mapTypes";
import type { MapScreen } from "./useMapScreen";

/** the map itself: briefing overlays, the Google map, Fly view, Street View, the Images pop-up and the floating map keys. */
export function MapArea({ s }: { s: MapScreen }) {
  const {
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
  } = s;
  return (
    <>
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
              if (!narrowScreen) return opts.map((o, i) => renderOpt(o, i < 2));
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
                followMode ? "Stop following my location" : "Follow my location"
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
              const photoLabel = entry ? entry.loc.label : (cm?.address ?? "");
              const hasPhotos =
                !!photoLabel &&
                (photoKeysRef.current.has(
                  normalizeEntityLabelClient(photoLabel)
                ) ||
                  personPhotosByKeyRef.current.has(
                    addressMatchKey(photoLabel)
                  ));
              const html = entry
                ? entityBlocksHtml(entry.loc, registeredPeopleLookupRef.current)
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
                              ? bridge.__intelOpenEditDialog?.(entry.loc.label)
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
                  onClick={() => flyOpenActionChooser(flyPick.lat, flyPick.lng)}
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
    </>
  );
}
