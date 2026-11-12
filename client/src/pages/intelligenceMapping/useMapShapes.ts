// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useCallback, useEffect, useRef } from "react";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import {
  getMarkerIconUrl,
  getMarkerIconLabel,
  MARKER_COLOURS,
  type MarkerColour,
} from "@/lib/markerSvgs";
import { convertGoogleAddresses } from "@/lib/addressFormat";
import { addressMatchKey } from "@shared/addressMatchKey";
import {
  createPhotoPill,
  entityBlocksHtml,
  normalizeEntityLabelClient,
  openInfoWindowDeferred,
  popupPeopleLines,
  popupVehicleLines,
} from "./infoWindow";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapBasicsState } from "./useMapBasics";
import type { MapMarkersState } from "./useMapMarkers";
import type { MapDataState } from "./useMapData";
import type { MapReadyState } from "./useMapReady";
import type { MapPlacingState } from "./useMapPlacing";

export function useMapShapes(
  s: Pick<
    MapAddressSearchState,
    "mapReady" | "infoWindowRef" | "customMarkersDataRef" | "mergedIntelRef"
  > &
    Pick<MapBasicsState, "mapRef" | "mapHeadingRef"> &
    Pick<MapMarkersState, "customMarkerMapRefs"> &
    Pick<
      MapDataState,
      | "customMarkers"
      | "photoKeysRef"
      | "personPhotosByKeyRef"
      | "registeredPeopleLookupRef"
      | "personPhotosByKey"
    > &
    Pick<MapReadyState, "customMarkerImgRefs"> &
    Pick<MapPlacingState, "setActionChooser">
) {
  const {
    mapReady,
    mapRef,
    customMarkerMapRefs,
    customMarkers,
    customMarkerImgRefs,
    mapHeadingRef,
    photoKeysRef,
    personPhotosByKeyRef,
    infoWindowRef,
    customMarkersDataRef,
    mergedIntelRef,
    registeredPeopleLookupRef,
    personPhotosByKey,
    setActionChooser,
  } = s;

  // A small pill of text — used for a shape's note (as its own overlay,
  // nudged beside the shape's anchor point via a CSS transform, since that
  // overlay can't be merged into the shape itself) and for a custom
  // marker's label (passed "none" — it's a plain flex child stacked below
  // the marker's icon in one combined content element instead, or, for a
  // "label only" marker, the marker's only content — see the custom marker
  // rendering effect below, which mirrors createUserPinElement's own
  // plain-content-no-manual-transform approach rather than guessing at
  // AdvancedMarkerElement's default anchor to align two separate overlays).
  const createLabelPillElement = useCallback(
    (
      text: string,
      colour: string,
      transform: string = "translate(12px, -50%)"
    ) => {
      const el = document.createElement("div");
      el.style.cssText = `
      transform: ${transform};
      display: inline-flex;
      align-items: center;
      max-width: 200px;
      background: ${colour};
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      border: 1.5px solid rgba(255,255,255,0.7);
      cursor: pointer;
    `;
      el.textContent = text;
      return el;
    },
    []
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const existing = customMarkerMapRefs.current;
    const incoming = customMarkers ?? [];
    const incomingIds = new Set(incoming.map((m: any) => m.id as number));

    // Remove stale markers
    existing.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.map = null;
        existing.delete(id);
        customMarkerImgRefs.current.delete(id);
      }
    });

    // Add / update markers
    incoming.forEach((outerCm: any) => {
      const labelOnly = !!outerCm.labelOnly;
      const fillColor =
        MARKER_COLOURS[outerCm.markerColour as MarkerColour] ??
        MARKER_COLOURS.red;
      const labelText = (outerCm.label ?? "").trim();
      let content: HTMLElement;
      let rotation = 0;
      if (labelOnly) {
        // "Label only" — the pill itself stands in for the icon; no
        // transform needed, same as the plain (icon-less) pill content
        // createUserPinElement already uses for team member markers
        // elsewhere on this map — trust the same default anchor rather
        // than trying to re-derive it with a manual translate.
        content = createLabelPillElement(
          labelText || "(no label)",
          fillColor,
          "none"
        );
        customMarkerImgRefs.current.delete(outerCm.id);
      } else {
        const dataUrl = getMarkerIconUrl(
          outerCm.markerIcon,
          outerCm.markerColour as MarkerColour
        );
        rotation = (outerCm.rotation ?? 0) as number;
        // Icon and label live in ONE flex column content element rather
        // than as two separately-anchored overlays — align-items:center
        // guarantees the label sits centred under the icon regardless of
        // where Maps' own anchor point for the combined box falls, instead
        // of us having to reverse-engineer that anchor to line up two
        // independent overlays (which is what put the label off to the
        // side of the icon rather than under it).
        const wrapper = document.createElement("div");
        wrapper.style.cssText =
          "display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;";
        // A separate relatively-positioned box just for the icon, not the
        // whole (icon + label pill) wrapper — so the photo badge below
        // anchors to the icon's own corner regardless of whether a label
        // pill is stacked underneath it.
        const iconBox = document.createElement("div");
        iconBox.style.cssText = "position:relative;display:inline-flex;";
        const img = document.createElement("img");
        img.src = dataUrl;
        // data-rotation is the compass angle this icon was placed facing —
        // the heading_changed listener above reads it back to keep the
        // icon glued to that direction as the map rotates, rather than to
        // the screen. The transform itself is offset by the map's CURRENT
        // heading (not just `rotation`) so it's already correct on this
        // build even if the map was rotated before this marker last redrew
        // (e.g. after a poll refresh) — same "subtract the map's heading"
        // math the heading_changed listener uses to keep it that way.
        img.dataset.rotation = String(rotation);
        // Previously sized larger than Surveillance icons to compensate for
        // baked-in margin on the tactical PNGs — removed per direct
        // feedback that it made the raster tactical icons read as
        // oversized/blurry next to the crisp vector Surveillance set.
        const iconPx = 40;
        img.style.cssText = `width:${iconPx}px;height:${iconPx}px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));transform:rotate(${rotation - mapHeadingRef.current}deg);`;
        iconBox.appendChild(img);
        // Store direct img ref for live rotation
        customMarkerImgRefs.current.set(outerCm.id, img);
        // Photo pill — same checks as the intel pin (see photoKeysRef /
        // personPhotosByKeyRef). Keyed on the marker's ADDRESS, not its
        // (often empty, free-text) label — photos link to formatted
        // addresses, so an icon-only marker (e.g. a plain Tactical pin)
        // still shows it when its address has photos on file.
        const cmPhotoPill = createPhotoPill(
          !!outerCm.address &&
            photoKeysRef.current.has(
              normalizeEntityLabelClient(outerCm.address)
            ),
          personPhotosByKeyRef.current.has(addressMatchKey(outerCm.address))
        );
        if (cmPhotoPill) iconBox.appendChild(cmPhotoPill);
        wrapper.appendChild(iconBox);
        if (labelText) {
          wrapper.appendChild(
            createLabelPillElement(labelText, fillColor, "none")
          );
        }
        content = wrapper;
      }

      if (existing.has(outerCm.id)) {
        const m = existing.get(outerCm.id)!;
        m.position = { lat: outerCm.lat, lng: outerCm.lng };
        m.content = content;
      } else {
        const marker = new DivIconOverlay({
          map,
          position: { lat: outerCm.lat, lng: outerCm.lng },
          content,
          title: outerCm.label ?? getMarkerIconLabel(outerCm.markerIcon),
        });
        marker.addListener("click", () => {
          if (!infoWindowRef.current) return;
          // Look up this marker's CURRENT data rather than relying on the
          // snapshot from when this listener was first attached — a
          // marker's click listener is only ever attached once, right
          // here; the `existing.has(outerCm.id)` branch above updates the
          // on-map icon/position on every poll but never re-attaches it.
          // Without this, any edit made after creation (note, label,
          // address, associated persons/vehicles...) never actually shows
          // up in the popup even though the icon on the map updates live.
          const cm =
            customMarkersDataRef.current.find(
              (c: any) => c.id === outerCm.id
            ) ?? outerCm;
          const lat = cm.lat;
          const lng = cm.lng;
          const iconLabel = getMarkerIconLabel(cm.markerIcon);
          const currentRotation = cm.rotation ?? 0;
          const dataUrl = getMarkerIconUrl(
            cm.markerIcon,
            cm.markerColour as MarkerColour
          );
          // Check if intel locations have been merged into this marker (array, target_address first)
          const mergedIntelList = mergedIntelRef.current.get(cm.id) ?? [];
          // Primary merged intel = first entry (target_address if present, else observation)
          const mergedIntel =
            mergedIntelList.length > 0 ? mergedIntelList[0] : null;

          const buildPopupHtml = (rotation: number) => {
            const lines: string[] = [];

            // Type badge row
            const hasMerged = mergedIntelList.length > 0;
            const badgeLabel = hasMerged
              ? "MERGED MARKER"
              : cm.labelOnly
                ? "LABEL"
                : "MAP MARKER";
            const badgeBg = hasMerged ? "#0f766e" : "#374151";
            lines.push(`
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="background:${badgeBg};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${badgeLabel}</span>
                ${cm.labelOnly ? "" : `<span style="font-size:10px;color:#6b7280;">${iconLabel}</span>`}
              </div>
            `);

            // Label
            if (cm.label)
              lines.push(
                `<strong style="font-size:13px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${cm.label}</strong>`
              );

            // Address
            if (cm.address)
              lines.push(
                `<div style="font-size:11px;color:#444;margin-top:2px;">${cm.address}</div>`
              );

            // Notes
            if (cm.note)
              lines.push(
                `<div style="margin-top:6px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Notes</span><p style="font-size:12px;color:#111;margin:2px 0 0;">${cm.note}</p></div>`
              );

            // Persons (from custom marker)
            {
              const cmPeopleHtml = popupPeopleLines(
                (cm.assocPersons ?? []) as string[],
                cm.address ?? "",
                registeredPeopleLookupRef.current,
                "12px"
              );
              if (cmPeopleHtml)
                lines.push(
                  `<div style="margin-top:6px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Persons</span><div style="margin-top:2px">${cmPeopleHtml}</div></div>`
                );
            }

            // Vehicles (from custom marker)
            if (cm.assocVehicles?.length)
              lines.push(
                `<div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Vehicles</span><div style="margin-top:2px">${popupVehicleLines(cm.assocVehicles as string[], "12px")}</div></div>`
              );

            // ── Merged intel section: render each merged entry (target_address first) ──
            for (const intel of mergedIntelList) {
              lines.push(
                `<div style="margin-top:8px;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">${entityBlocksHtml(intel, registeredPeopleLookupRef.current, true)}</div>`
              );
            }
            // ─────────────────────────────────────────────────────────────────────────

            // Rotation slider — not applicable to a "label only" marker,
            // there's no icon to rotate.
            if (!cm.labelOnly) {
              // Same size as Surveillance icons — see the matching note on
              // the map-pin rendering above.
              const popupIconPx = 24;
              lines.push(`
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <img id="cm-popup-preview-${cm.id}" src="${dataUrl}" style="width:${popupIconPx}px;height:${popupIconPx}px;object-fit:contain;flex-shrink:0;transform:rotate(${rotation}deg);transition:transform 0.1s;" />
                  <div style="flex:1;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                      <span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Rotation</span>
                      <span id="cm-popup-deg-${cm.id}" style="font-size:10px;color:#374151;font-weight:600;">${rotation}°</span>
                    </div>
                    <input id="cm-popup-slider-${cm.id}" type="range" min="0" max="359" step="1" value="${rotation}"
                      style="width:100%;accent-color:#6366f1;cursor:pointer;"
                      oninput="window.__cmPopupRotate(${cm.id}, this.value)"
                    />
                  </div>
                </div>
              </div>
            `);
            }

            // ── Action buttons: symmetric grid layout ─────────────────────────────
            const btnBase =
              "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
            const safeLabel = (cm.label ?? "Custom marker").replace(
              /'/g,
              "\\'"
            );
            // Photos link under category "location" keyed by formatted
            // ADDRESS (see ImagesPip's own byEntity query), not by whatever
            // free-text caption a marker's Label field happens to hold —
            // those are two different fields on custom_map_markers. Using
            // cm.label here (as this used to) meant a marker with no label
            // typed — an icon-only pin, exactly what a Tactical marker
            // usually is — could never show its Images button even when
            // its address plainly had photos linked.
            const safeAddress = (cm.address ?? "").replace(/'/g, "\\'");
            const sections: string[] = [];

            // Row 0: RS Quick Entry — always at top, full width
            sections.push(
              `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;"><button onclick="window.__cmRsQuickEntry(${cm.id})" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
            );

            // Row 1: Images — only when this marker's address already has
            // linked photos (silently auto-linked at upload time).
            const cmAddressKey = cm.address
              ? normalizeEntityLabelClient(cm.address)
              : null;
            const cmHasLinkedPhotos =
              !!cmAddressKey && photoKeysRef.current.has(cmAddressKey);
            if (cm.address && !cmHasLinkedPhotos) {
              // Temporary diagnostic (v1.114.3) — user reports the Images
              // button is missing specifically for Tactical-icon markers
              // even when the address visually matches a working
              // Surveillance-icon marker's. This check is identical
              // regardless of markerIcon, so logs the actual normalized
              // key plus every key currently considered "has photos" to
              // see whether they genuinely differ, rather than guessing
              // again. Safe to remove once this is resolved.
              console.debug("[MapMarkerImagesDebug] no photo match", {
                markerId: cm.id,
                markerIcon: cm.markerIcon,
                address: cm.address,
                normalizedAddressKey: cmAddressKey,
                knownPhotoKeys: Array.from(photoKeysRef.current),
              });
            }
            // Profile / baseball-card photos of the people living here — an
            // address on the marker itself, else on a merged target/location.
            const personPhotoAddress = [
              cm.address,
              ...mergedIntelList.map((m: any) => m.label),
            ].find(
              (a): a is string =>
                !!a && personPhotosByKeyRef.current.has(addressMatchKey(a))
            );
            const imagesAddress = cmHasLinkedPhotos
              ? safeAddress
              : (personPhotoAddress ?? "").replace(/'/g, "\\'");
            if (cmHasLinkedPhotos || personPhotoAddress) {
              sections.push(
                `<div style="margin-top:5px;"><button onclick="window.__mapOpenImagesPip('${imagesAddress}')" style="${btnBase}background:#10b981;color:#fff;border:none;font-size:13px;padding:9px 0;">Images</button></div>`
              );
            }

            // Row 2: Navigation — Waze | Street View (2 columns)
            const navBtns = [
              `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
              `<button onclick="window.__mapOpenStreetView(${lat},${lng},'${safeLabel}')" style="${btnBase}background:#4285f4;color:#fff;border:none;">Street View</button>`,
            ];
            sections.push(
              `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`
            );

            // Row 3: Edit | Delete (2 columns)
            const editBtns = [
              `<button onclick="window.__editCustomMarker(${cm.id})" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`,
              `<button onclick="window.__deleteCustomMarker(${cm.id})" style="${btnBase}background:#ef4444;color:#fff;border:none;">Delete</button>`,
            ];
            sections.push(
              `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtns.join("")}</div>`
            );

            // Row 4: Merge | Move — same size as Edit/Delete, 2 columns
            // A manual merge (persisted as linkedIntelLabel) can be reversed;
            // one made automatically because a house marker sits within 40 m
            // of the intel pin cannot, so it stays greyed out.
            const mergeBtn = !mergedIntel
              ? `<button onclick="window.__cmOpenMergePicker(${cm.id})" style="${btnBase}background:#78716c;color:#fff;border:none;">Merge…</button>`
              : cm.linkedIntelLabel
                ? `<button onclick="window.__cmUnmerge(${cm.id})" style="${btnBase}background:#b45309;color:#fff;border:none;">Un-merge</button>`
                : `<button disabled title="Merged automatically — a house marker is within 40 m" style="${btnBase}background:#78716c;color:#fff;border:none;opacity:0.4;cursor:default;">Merged (auto)</button>`;
            const moveBtn = `<button onclick="window.__cmStartMove(${cm.id})" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
            sections.push(
              `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${mergeBtn}${moveBtn}</div>`
            );

            lines.push(sections.join(""));

            return `<div style="font-family:sans-serif;max-width:280px;color:#111;">${lines.join("")}</div>`;
          };

          infoWindowRef.current.setContent(buildPopupHtml(currentRotation));
          infoWindowRef.current.setPosition({ lat, lng });
          openInfoWindowDeferred(infoWindowRef, map);
        });
        existing.set(outerCm.id, marker);
      }
    });
  }, [customMarkers, mapReady, createLabelPillElement, personPhotosByKey]);

  // ── Map shape rendering (persisted shapes) ───────────────────────────────────
  const shapesRef = useRef<
    Map<
      number,
      | google.maps.Circle
      | google.maps.Rectangle
      | google.maps.Polygon
      | google.maps.Polyline
    >
  >(new Map());
  // Floating label pill for a shape's note, keyed the same way — a shape
  // and its label are two separate map overlays (a Circle/Rectangle/etc.
  // can't render text of its own), kept in sync side by side. Built with
  // createLabelPillElement above (shared with the custom-marker label).
  const shapeLabelsRef = useRef<Map<number, DivIconOverlay>>(new Map());

  // A shaded shape is clickable (to open its own edit panel), which by
  // default swallows every mouse/touch gesture over its area before the
  // map underneath ever sees it — so without this, an officer could never
  // reach the map's own action chooser (RS Quick Entry / Add Marker Here /
  // Navigate with Waze) at a point that happens to fall inside a shape.
  // Wires the exact same gesture the open map already uses everywhere else
  // — right-click on desktop, press-and-hold on touch — directly onto each
  // shape overlay instead, so it behaves identically whether or not a
  // shape is there. mousedown/mouseup ARE what touch presses normalize to
  // in the Maps overlay event system, so the same hold-timer works for both.
  const shapeLongPressFiredRef = useRef(false);
  const openActionChooserAtLatLng = useCallback(
    (latLng: google.maps.LatLng) => {
      shapeLongPressFiredRef.current = true;
      // Self-clearing rather than waiting for the next click to consume it
      // — this ref is shared across every shape, so without a short expiry
      // an unrelated later tap on a *different* shape (with no click ever
      // arriving in between, e.g. after a desktop right-click, which never
      // fires a follow-up click at all) would get silently swallowed too.
      setTimeout(() => {
        shapeLongPressFiredRef.current = false;
      }, 350);
      const lat = latLng.lat();
      const lng = latLng.lng();
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        const addr =
          status === "OK" && results && results[0]
            ? results[0].formatted_address
            : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setActionChooser({ lat, lng, address: convertGoogleAddresses(addr) });
      });
    },
    []
  );
  const wireShapeActionChooserGesture = useCallback(
    (
      overlay:
        | google.maps.Circle
        | google.maps.Rectangle
        | google.maps.Polygon
        | google.maps.Polyline
    ) => {
      overlay.addListener("rightclick", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) openActionChooserAtLatLng(e.latLng);
      });
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      overlay.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const latLng = e.latLng;
        pressTimer = setTimeout(() => openActionChooserAtLatLng(latLng), 600);
      });
      overlay.addListener("mouseup", () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });
    },
    [openActionChooserAtLatLng]
  );

  return {
    createLabelPillElement,
    shapesRef,
    shapeLabelsRef,
    shapeLongPressFiredRef,
    wireShapeActionChooserGesture,
  };
}

export type MapShapesState = ReturnType<typeof useMapShapes>;
