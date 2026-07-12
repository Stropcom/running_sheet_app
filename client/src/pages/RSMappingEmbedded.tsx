/**
 * RSMappingEmbedded — the RS Mapping view designed to be embedded inside
 * the Intelligence Folder tab set (no DashboardLayout wrapper).
 *
 * Features:
 * - Operation + running sheet picker
 * - Geocoded numbered waypoints with polyline route
 * - Stacked-pin spidering: when ≥2 waypoints land within 30m of each other
 *   they are fanned out radially so every number is visible and clickable
 * - Popup with: time, address, observation snippet, comment
 * - Edit button → marker appearance dialog (icon, colour, rotation)
 * - Move button → drag-to-move with accept/cancel banner
 * - Add Comment button → free-text dialog
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MapPin,
  ClipboardList,
  Navigation2,
  MessageSquarePlus,
  Pencil,
  X,
  Check,
  Route,
  GitBranch,
} from "lucide-react";
import {
  MARKER_COLOURS,
  MARKER_COLOUR_LABELS,
  MARKER_ICON_LABELS,
  MARKER_ICON_GROUPS,
  getMarkerDataUrl,
  type MarkerColour,
  type MarkerIcon,
} from "@/lib/markerSvgs";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WaypointRow {
  rowId: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  observation: string | null;
  address: string | null;
  addressFull: string | null;
  lat: number | null;
  lng: number | null;
  comment: string | null;
  markerIcon: string | null;
  markerColour: string | null;
  markerRotation: number | null;
  waypointId: number | null;
  segmentType: "normal" | "continued_via" | "coos";
  viaStreets: string[];
  suburbContext: string | null;
}

interface PlacedWaypoint {
  rowId: number;
  index: number;
  address: string;
  addressFull: string | null;
  time: string | null;
  observation: string | null;
  comment: string | null;
  markerIcon: MarkerIcon | null;
  markerColour: MarkerColour | null;
  markerRotation: number;
  waypointId: number | null;
  lat: number;
  lng: number;
  marker: google.maps.marker.AdvancedMarkerElement;
  segmentType: "normal" | "continued_via" | "coos";
  viaStreets: string[];
  suburbContext: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERTH_CENTER = { lat: -31.9505, lng: 115.8605 };
const GEOCODE_DELAY_MS = 220;
/** Two waypoints within this many metres are considered co-located */
const SPIDER_THRESHOLD_M = 100;
/** Max via-waypoints per Directions API request */
const DIRECTIONS_CHUNK_SIZE = 23;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(t: string | null): string {
  return t ?? "—";
}

/** Haversine distance in metres between two lat/lng points */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa = sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

/** Offset a lat/lng by dx/dy metres */
function offsetLatLng(lat: number, lng: number, dxM: number, dyM: number): { lat: number; lng: number } {
  const dLat = dyM / 111320;
  const dLng = dxM / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

function buildNumberPin(index: number, isFirst: boolean, isLast: boolean): HTMLElement {
  const el = document.createElement("div");
  let bg = "#6366f1";
  if (isFirst) bg = "#16a34a";
  if (isLast) bg = "#dc2626";
  el.style.cssText = `
    width:28px;height:28px;border-radius:50%;
    background:${bg};color:#fff;
    font-size:11px;font-weight:700;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
    cursor:pointer;user-select:none;
  `;
  el.textContent = String(index);
  return el;
}

function buildCustomPin(icon: MarkerIcon, colour: MarkerColour, rotation: number, index: number): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:relative;cursor:pointer;";

  const img = document.createElement("img");
  img.src = getMarkerDataUrl(icon, colour);
  img.style.cssText = `width:36px;height:36px;transform:rotate(${rotation}deg);display:block;`;
  wrapper.appendChild(img);

  // Small index badge
  const badge = document.createElement("div");
  badge.style.cssText = `
    position:absolute;top:-6px;right:-6px;
    width:16px;height:16px;border-radius:50%;
    background:#6366f1;color:#fff;
    font-size:9px;font-weight:700;
    display:flex;align-items:center;justify-content:center;
    border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);
  `;
  badge.textContent = String(index);
  wrapper.appendChild(badge);
  return wrapper;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RSMappingEmbedded() {
  // Picker state
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);

  // Map state
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const placedWaypointsRef = useRef<PlacedWaypoint[]>([]);
  const geocodeQueueRef = useRef<WaypointRow[]>([]);
  const geocodeIndexRef = useRef(0);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  // Move-marker state
  const [movingRowId, setMovingRowId] = useState<number | null>(null);
  const [pendingMove, setPendingMove] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const movingOrigPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Route tracing state
  const [traceRouteEnabled, setTraceRouteEnabled] = useState(false);
  const [tracing, setTracing] = useState(false);
  const tracePolylinesRef = useRef<(google.maps.Polyline | google.maps.DirectionsRenderer)[]>([]);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

  // Waypoint count as state (so Trace Route button renders after geocoding)
  const [waypointCount, setWaypointCount] = useState(0);

  // Comment dialog state
  const [commentDialog, setCommentDialog] = useState<{ rowId: number; sheetId: number; existing: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  // Edit (marker appearance) dialog state
  const [editDialog, setEditDialog] = useState<{ rowId: number; sheetId: number } | null>(null);
  const [editIcon, setEditIcon] = useState<MarkerIcon>("arrow_up");
  const [editColour, setEditColour] = useState<MarkerColour>("blue");
  const [editRotation, setEditRotation] = useState(0);
  const [editSaving, setEditSaving] = useState(false);

  // Loading state
  const [geocoding, setGeocoding] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: operations, isLoading: opsLoading } = trpc.operation.list.useQuery();

  const { data: sheetsData } = trpc.sheet.listByOperation.useQuery(
    { operationId: selectedOpId! },
    { enabled: selectedOpId !== null }
  );

  const { data: waypoints, isLoading: wpLoading, refetch: refetchWaypoints } = trpc.rsMapping.getWaypoints.useQuery(
    { sheetId: selectedSheetId! },
    { enabled: selectedSheetId !== null }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const upsertWaypoint = trpc.rsMapping.upsertWaypoint.useMutation({
    onSuccess: () => { void refetchWaypoints(); },
    onError: (e) => { toast.error(e.message); },
  });

  // ── Map init ─────────────────────────────────────────────────────────────────

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    infoWindowRef.current = new google.maps.InfoWindow();
    directionsServiceRef.current = new google.maps.DirectionsService();
    setMapReady(true);
  }, []);

  // ── Clear map ────────────────────────────────────────────────────────────────

  const clearTraceLines = useCallback(() => {
    tracePolylinesRef.current.forEach((item) => {
      if (item instanceof google.maps.Polyline) {
        item.setMap(null);
      } else {
        (item as google.maps.DirectionsRenderer).setMap(null);
      }
    });
    tracePolylinesRef.current = [];
  }, []);

  const clearMap = useCallback(() => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = [];
    placedWaypointsRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    clearTraceLines();
    infoWindowRef.current?.close();
    setWaypointCount(0);
  }, [clearTraceLines]);

  // ── Polyline update ──────────────────────────────────────────────────────────

  const updatePolyline = useCallback(() => {
    if (!mapRef.current) return;
    // Use original (pre-spider) positions for the route line
    const path = placedWaypointsRef.current.map((w) => ({ lat: w.lat, lng: w.lng }));
    if (polylineRef.current) {
      polylineRef.current.setPath(path);
    } else {
      polylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: "#6366f1",
        strokeOpacity: 0.75,
        strokeWeight: 3,
        map: mapRef.current,
      });
    }
  }, []);

  // ── Open popup ───────────────────────────────────────────────────────────────

  const openPopup = useCallback((wp: PlacedWaypoint, sheetId: number) => {
    if (!infoWindowRef.current || !mapRef.current) return;

    const total = placedWaypointsRef.current.length;
    const isFirst = wp.index === 1;
    const isLast = wp.index === total;
    const badgeColor = isFirst ? "#16a34a" : isLast ? "#dc2626" : "#6366f1";
    const badgeLabel = isFirst ? "START" : isLast ? "END" : `STOP ${wp.index}`;

    const commentHtml = wp.comment
      ? `<div style="margin-top:6px;padding:6px 8px;background:#fef9c3;border-left:3px solid #ca8a04;border-radius:0 4px 4px 0;font-size:11px;color:#78350f;">${wp.comment}</div>`
      : "";

    const obsSnippet = wp.observation
      ? `<div style="margin-top:4px;font-size:11px;color:#555;line-height:1.4;max-height:60px;overflow:hidden;">${wp.observation.substring(0, 180)}${wp.observation.length > 180 ? "…" : ""}</div>`
      : "";

    const html = `
      <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:280px;padding:4px 0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="background:${badgeColor};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;">${badgeLabel}</span>
          <span style="font-size:11px;color:#888;">${formatTime(wp.time)}</span>
        </div>
        <strong style="font-size:13px;color:#111;display:block;margin-bottom:2px;">${wp.address}</strong>
        ${obsSnippet}
        ${commentHtml}
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <button onclick="window.__rsmEditMarker(${wp.rowId},${sheetId})"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#16a34a;color:#fff;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;width:100%;">
            ✏️ Edit
          </button>
          <button onclick="window.__rsmStartMove(${wp.rowId})"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#0ea5e9;color:#fff;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;width:100%;">
            📍 Move
          </button>
        </div>
        <div style="margin-top:6px;">
          <button onclick="window.__rsmAddComment(${wp.rowId},${sheetId},'${encodeURIComponent(wp.comment ?? '')}')"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#7c3aed;color:#fff;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;width:100%;">
            💬 Add Comment
          </button>
        </div>
        <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <a href="https://waze.com/ul?ll=${wp.lat},${wp.lng}&navigate=yes" target="_blank"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#00bcd4;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
            Waze
          </a>
          <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${wp.lat},${wp.lng}" target="_blank"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#4285f4;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
            Street View
          </a>
        </div>
      </div>
    `;

    infoWindowRef.current.setContent(html);
    infoWindowRef.current.open({ map: mapRef.current, anchor: wp.marker });
  }, []);

  // ── Geocode queue ─────────────────────────────────────────────────────────────

  const geocodeNext = useCallback(() => {
    const queue = geocodeQueueRef.current;
    const idx = geocodeIndexRef.current;
    if (idx >= queue.length) {
      setGeocoding(false);
      // Group co-located pins into horizontal pills before drawing polyline
      groupNearbyMarkers();
      updatePolyline();
      setWaypointCount(placedWaypointsRef.current.length);
      if (mapRef.current && placedWaypointsRef.current.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        placedWaypointsRef.current.forEach((w) => bounds.extend({ lat: w.lat, lng: w.lng }));
        mapRef.current.fitBounds(bounds, 60);
      }
      return;
    }

    const row = queue[idx];
    geocodeIndexRef.current = idx + 1;

    if (row.lat != null && row.lng != null) {
      placeWaypointMarker(row, row.lat, row.lng);
      geocodeTimerRef.current = setTimeout(geocodeNext, 0);
      return;
    }

    const addressQuery = row.addressFull || row.address || "";
    if (!addressQuery || !geocoderRef.current) {
      geocodeTimerRef.current = setTimeout(geocodeNext, GEOCODE_DELAY_MS);
      return;
    }

    geocoderRef.current.geocode({ address: addressQuery }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const pos = results[0].geometry.location;
        placeWaypointMarker(row, pos.lat(), pos.lng());
      }
      geocodeTimerRef.current = setTimeout(geocodeNext, GEOCODE_DELAY_MS);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatePolyline, setWaypointCount]);

  function placeWaypointMarker(row: WaypointRow, lat: number, lng: number) {
    if (!mapRef.current) return;
    const total = geocodeQueueRef.current.length;
    const index = placedWaypointsRef.current.length + 1;
    const isFirst = index === 1;
    const isLast = index === total;

    const icon = (row.markerIcon as MarkerIcon | null) ?? null;
    const colour = (row.markerColour as MarkerColour | null) ?? null;
    const rotation = row.markerRotation ?? 0;

    const pinEl = (icon && colour)
      ? buildCustomPin(icon, colour, rotation, index)
      : buildNumberPin(index, isFirst, isLast);

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef.current,
      position: { lat, lng },
      content: pinEl,
      gmpDraggable: false,
      title: row.address ?? "",
    });

    const wp: PlacedWaypoint = {
      rowId: row.rowId,
      index,
      address: row.address ?? "",
      addressFull: row.addressFull,
      time: row.time,
      observation: row.observation,
      comment: row.comment,
      markerIcon: icon,
      markerColour: colour,
      markerRotation: rotation,
      waypointId: row.waypointId,
      lat,
      lng,
      marker,
      segmentType: row.segmentType ?? "normal",
      viaStreets: row.viaStreets ?? [],
      suburbContext: row.suburbContext ?? null,
    };

    placedWaypointsRef.current.push(wp);
    markersRef.current.push(marker);

    const sheetId = selectedSheetId!;
    marker.addListener("click", () => openPopup(wp, sheetId));
  }

  /**
   * After all pins are placed, detect groups of pins within SPIDER_THRESHOLD_M
   * of each other and fan them out radially so every number is visible.
   */
  function groupNearbyMarkers() {
    if (!mapRef.current) return;
    const placed = placedWaypointsRef.current;
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const visited = new Set<number>();
    const sheetId = selectedSheetId!;

    for (let i = 0; i < placed.length; i++) {
      if (visited.has(i)) continue;
      const normI = normalise(placed[i].address);
      const group: number[] = [i];

      for (let j = i + 1; j < placed.length; j++) {
        if (visited.has(j)) continue;
        const sameAddr = normI.length > 0 && normalise(placed[j].address) === normI;
        const nearby = distanceM(placed[i], placed[j]) < SPIDER_THRESHOLD_M;
        if (sameAddr || nearby) {
          group.push(j);
          visited.add(j);
        }
      }
      visited.add(i);
      if (group.length < 2) continue;

      // Sort by sequence order
      group.sort((a, b) => placed[a].index - placed[b].index);

      // Compute centroid
      const centLat = group.reduce((s, idx) => s + placed[idx].lat, 0) / group.length;
      const centLng = group.reduce((s, idx) => s + placed[idx].lng, 0) / group.length;

      // Remove individual markers
      group.forEach((idx) => {
        placed[idx].marker.map = null;
        const mi = markersRef.current.indexOf(placed[idx].marker);
        if (mi !== -1) markersRef.current.splice(mi, 1);
      });

      // Build horizontal pill
      const pill = document.createElement("div");
      pill.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:0",
        "background:rgba(255,255,255,0.92)",
        "border-radius:20px",
        "padding:2px",
        "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
        "border:2px solid #fff",
      ].join(";");

      group.forEach((wpIdx, pillIdx) => {
        const wp = placed[wpIdx];
        const total = geocodeQueueRef.current.length;
        const isFirst = wp.index === 1;
        const isLast = wp.index === total;
        let bg = "#6366f1";
        if (isFirst) bg = "#16a34a";
        if (isLast) bg = "#dc2626";

        if (pillIdx > 0) {
          const connector = document.createElement("div");
          connector.style.cssText = "width:6px;height:3px;background:#d1d5db;flex-shrink:0;";
          pill.appendChild(connector);
        }

        const circle = document.createElement("div");
        circle.style.cssText = [
          "width:28px",
          "height:28px",
          "border-radius:50%",
          `background:${bg}`,
          "color:#fff",
          "font-size:11px",
          "font-weight:700",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "cursor:pointer",
          "user-select:none",
          "flex-shrink:0",
        ].join(";");
        circle.textContent = String(wp.index);
        circle.addEventListener("click", (e) => {
          e.stopPropagation();
          openPopup(wp, sheetId);
        });
        pill.appendChild(circle);
      });

      // Place single group marker at centroid
      const groupMarker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: centLat, lng: centLng },
        content: pill,
        gmpDraggable: false,
        title: group.map((idx) => placed[idx].address).join(" / "),
      });
      markersRef.current.push(groupMarker);

      // Update each wp's marker reference so Move still works
      group.forEach((idx) => {
        placed[idx].marker = groupMarker;
      });
    }
  }

  // ── Render waypoints when data arrives ───────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !waypoints || !selectedSheetId) return;
    clearMap();

    const queue = (waypoints as WaypointRow[]).filter((w) => w.address);
    if (queue.length === 0) {
      setGeocoding(false);
      return;
    }

    geocodeQueueRef.current = queue;
    geocodeIndexRef.current = 0;
    setGeocoding(true);
    geocodeNext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, waypoints, selectedSheetId]);

  // ── Global handlers for info window buttons ───────────────────────────────────

  useEffect(() => {
    (window as any).__rsmStartMove = (rowId: number) => {
      infoWindowRef.current?.close();
      const wp = placedWaypointsRef.current.find((w) => w.rowId === rowId);
      if (!wp || !mapRef.current) return;

      movingOrigPosRef.current = { lat: wp.lat, lng: wp.lng };
      wp.marker.gmpDraggable = true;
      setMovingRowId(rowId);
      setPendingMove(null);

      wp.marker.addListener("dragend", (e: google.maps.MapMouseEvent) => {
        const lat = e.latLng!.lat();
        const lng = e.latLng!.lng();
        geocoderRef.current?.geocode({ location: { lat, lng } }, (results, status) => {
          const addr = (status === "OK" && results?.[0]) ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setPendingMove({ lat, lng, address: addr });
        });
      });
    };

    (window as any).__rsmAddComment = (rowId: number, sheetId: number, encodedComment: string) => {
      infoWindowRef.current?.close();
      const existing = decodeURIComponent(encodedComment);
      setCommentDialog({ rowId, sheetId, existing });
      setCommentText(existing);
    };

    (window as any).__rsmEditMarker = (rowId: number, sheetId: number) => {
      infoWindowRef.current?.close();
      const wp = placedWaypointsRef.current.find((w) => w.rowId === rowId);
      setEditIcon(wp?.markerIcon ?? "arrow_up");
      setEditColour(wp?.markerColour ?? "blue");
      setEditRotation(wp?.markerRotation ?? 0);
      setEditDialog({ rowId, sheetId });
    };

    return () => {
      delete (window as any).__rsmStartMove;
      delete (window as any).__rsmAddComment;
      delete (window as any).__rsmEditMarker;
    };
  }, []);

  // ── Accept move ───────────────────────────────────────────────────────────────

  const acceptMove = useCallback(() => {
    if (!pendingMove || !movingRowId || !selectedSheetId) return;
    const wp = placedWaypointsRef.current.find((w) => w.rowId === movingRowId);
    if (!wp) return;

    upsertWaypoint.mutate(
      { sheetId: selectedSheetId, rowId: movingRowId, lat: pendingMove.lat, lng: pendingMove.lng, comment: wp.comment },
      {
        onSuccess: () => {
          wp.lat = pendingMove.lat;
          wp.lng = pendingMove.lng;
          wp.marker.position = { lat: pendingMove.lat, lng: pendingMove.lng };
          wp.marker.gmpDraggable = false;
          updatePolyline();
          toast.success("Waypoint moved");
          setMovingRowId(null);
          setPendingMove(null);
        },
      }
    );
  }, [pendingMove, movingRowId, selectedSheetId, upsertWaypoint, updatePolyline]);

  const cancelMove = useCallback(() => {
    if (!movingRowId) return;
    const wp = placedWaypointsRef.current.find((w) => w.rowId === movingRowId);
    if (wp && movingOrigPosRef.current) {
      wp.marker.position = movingOrigPosRef.current;
      wp.marker.gmpDraggable = false;
    }
    setMovingRowId(null);
    setPendingMove(null);
  }, [movingRowId]);

  // ── Save comment ──────────────────────────────────────────────────────────────

  const saveComment = useCallback(() => {
    if (!commentDialog) return;
    setCommentSaving(true);
    const wp = placedWaypointsRef.current.find((w) => w.rowId === commentDialog.rowId);
    upsertWaypoint.mutate(
      {
        sheetId: commentDialog.sheetId,
        rowId: commentDialog.rowId,
        lat: wp?.lat ?? null,
        lng: wp?.lng ?? null,
        comment: commentText.trim() || null,
      },
      {
        onSuccess: () => {
          if (wp) wp.comment = commentText.trim() || null;
          toast.success("Comment saved");
          setCommentSaving(false);
          setCommentDialog(null);
        },
        onError: () => { setCommentSaving(false); },
      }
    );
  }, [commentDialog, commentText, upsertWaypoint]);

  // ── Save marker edit ──────────────────────────────────────────────────────────

  const saveEdit = useCallback(() => {
    if (!editDialog) return;
    setEditSaving(true);
    const wp = placedWaypointsRef.current.find((w) => w.rowId === editDialog.rowId);
    upsertWaypoint.mutate(
      {
        sheetId: editDialog.sheetId,
        rowId: editDialog.rowId,
        lat: wp?.lat ?? null,
        lng: wp?.lng ?? null,
        comment: wp?.comment ?? null,
        markerIcon: editIcon,
        markerColour: editColour,
        markerRotation: editRotation,
      },
      {
        onSuccess: () => {
          if (wp) {
            wp.markerIcon = editIcon;
            wp.markerColour = editColour;
            wp.markerRotation = editRotation;
            // Rebuild the marker element
            const total = placedWaypointsRef.current.length;
            const isFirst = wp.index === 1;
            const isLast = wp.index === total;
            const newEl = buildCustomPin(editIcon, editColour, editRotation, wp.index);
            wp.marker.content = newEl;
            // Re-attach click listener
            wp.marker.addListener("click", () => openPopup(wp, editDialog.sheetId));
            void 0;
          }
          toast.success("Marker updated");
          setEditSaving(false);
          setEditDialog(null);
        },
        onError: () => { setEditSaving(false); },
      }
    );
  }, [editDialog, editIcon, editColour, editRotation, upsertWaypoint, openPopup]);

  // ── Trace Route ──────────────────────────────────────────────────────────────

  const runTraceRoute = useCallback(() => {
    if (!mapRef.current || !directionsServiceRef.current) return;
    const placed = placedWaypointsRef.current;
    if (placed.length < 2) return;

    clearTraceLines();
    polylineRef.current?.setMap(null);
    setTracing(true);

    const segments: { from: PlacedWaypoint; to: PlacedWaypoint; viaStreets: string[]; isCoos: boolean }[] = [];
    for (let i = 0; i < placed.length - 1; i++) {
      const from = placed[i];
      const to = placed[i + 1];
      // The "to" waypoint carries the segment type (continued_via / coos)
      const isCoos = to.segmentType === "coos";
      const viaStreets = to.segmentType === "continued_via" ? to.viaStreets : [];
      segments.push({ from, to, viaStreets, isCoos });
    }

    let pending = segments.length;
    const done = () => { if (--pending === 0) setTracing(false); };

    segments.forEach((seg) => {
      if (seg.isCoos || seg.viaStreets.length === 0) {
        // Draw straight dashed line
        const line = new google.maps.Polyline({
          path: [{ lat: seg.from.lat, lng: seg.from.lng }, { lat: seg.to.lat, lng: seg.to.lng }],
          geodesic: true,
          strokeColor: seg.isCoos ? "#94a3b8" : "#6366f1",
          strokeOpacity: seg.isCoos ? 0 : 0.7,
          strokeWeight: seg.isCoos ? 2 : 3,
          icons: seg.isCoos ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "16px" }] : undefined,
          map: mapRef.current!,
        });
        tracePolylinesRef.current.push(line);
        done();
        return;
      }

      // Build waypoints from viaStreets
      const suburbHint = seg.to.suburbContext ? `, ${seg.to.suburbContext}` : "";
      const viaWaypoints = seg.viaStreets.slice(0, DIRECTIONS_CHUNK_SIZE).map((street) => ({
        location: `${street}${suburbHint}`,
        stopover: false,
      }));

      directionsServiceRef.current!.route(
        {
          origin: { lat: seg.from.lat, lng: seg.from.lng },
          destination: { lat: seg.to.lat, lng: seg.to.lng },
          waypoints: viaWaypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          avoidHighways: false,
          avoidTolls: false,
        },
        (result, status) => {
          if (status === "OK" && result) {
            const renderer = new google.maps.DirectionsRenderer({
              map: mapRef.current!,
              directions: result,
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: "#f59e0b",
                strokeOpacity: 0.85,
                strokeWeight: 4,
              },
            });
            tracePolylinesRef.current.push(renderer as any);
          } else {
            // Fallback to straight amber line
            const line = new google.maps.Polyline({
              path: [{ lat: seg.from.lat, lng: seg.from.lng }, { lat: seg.to.lat, lng: seg.to.lng }],
              geodesic: true,
              strokeColor: "#f59e0b",
              strokeOpacity: 0.7,
              strokeWeight: 3,
              map: mapRef.current!,
            });
            tracePolylinesRef.current.push(line);
            if (seg.viaStreets.length > 0) toast.warning(`Could not trace route for segment to ${seg.to.address}`);
          }
          done();
        }
      );
    });
  }, [clearTraceLines]);

  // Toggle trace route on/off
  useEffect(() => {
    if (!mapRef.current) return;
    if (traceRouteEnabled) {
      runTraceRoute();
    } else {
      clearTraceLines();
      updatePolyline();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceRouteEnabled]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeSheets = (sheetsData as any[] | undefined)?.filter((s: any) => !s.deletedAt) ?? [];
  const selectedSheet = activeSheets.find((s: any) => s.id === selectedSheetId);

  const viaSegmentCount = waypointCount > 0 ? placedWaypointsRef.current.filter(
    (w) => w.segmentType === "continued_via" && w.viaStreets.length > 0
  ).length : 0;
  const coosSegmentCount = waypointCount > 0 ? placedWaypointsRef.current.filter(
    (w) => w.segmentType === "coos"
  ).length : 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Picker bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0 flex-wrap">
        <Route className="h-4 w-4 text-indigo-500 shrink-0" />
        <Select
          value={selectedOpId !== null ? String(selectedOpId) : ""}
          onValueChange={(val) => {
            setSelectedOpId(Number(val));
            setSelectedSheetId(null);
            clearMap();
          }}
        >
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="1. Choose operation…" />
          </SelectTrigger>
          <SelectContent>
            {opsLoading && <SelectItem value="__loading" disabled>Loading…</SelectItem>}
            {(operations as any[] | undefined)?.map((op: any) => (
              <SelectItem key={op.id} value={String(op.id)} className="text-xs">{op.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedOpId !== null && (
          <Select
            value={selectedSheetId !== null ? String(selectedSheetId) : ""}
            onValueChange={(val) => setSelectedSheetId(Number(val))}
          >
            <SelectTrigger className="h-8 text-xs w-52">
              <SelectValue placeholder="2. Choose running sheet…" />
            </SelectTrigger>
            <SelectContent>
              {activeSheets.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)} className="text-xs">
                  {s.title || `Sheet #${s.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedSheet && (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{selectedSheet.title}</span>
        )}

        {(geocoding || tracing) && (
          <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
            <Spinner className="h-3.5 w-3.5" />
            <span>{tracing ? "Tracing route…" : "Plotting route…"}</span>
          </div>
        )}

        {/* Trace Route toggle */}
        {selectedSheetId && !geocoding && waypointCount >= 2 && (
          <button
            onClick={() => setTraceRouteEnabled((v) => !v)}
            disabled={tracing}
            className={`${!(geocoding || tracing) ? "ml-auto" : ""} flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              traceRouteEnabled
                ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600"
            }`}
            title={traceRouteEnabled ? "Switch back to straight-line view" : "Trace actual route using street data from running sheet"}
          >
            <GitBranch className="h-3.5 w-3.5" />
            {tracing ? "Tracing…" : traceRouteEnabled ? "Route Traced" : "Trace Route"}
          </button>
        )}

        {selectedSheetId && !geocoding && !traceRouteEnabled && (
          <div className={`${waypointCount >= 2 ? "" : "ml-auto"} flex items-center gap-1.5 text-xs text-muted-foreground`}>
            <MapPin className="h-3.5 w-3.5 text-indigo-500" />
            <span>{waypointCount} waypoints</span>
          </div>
        )}
      </div>

      {/* ── Move banner ─────────────────────────────────────────────────────── */}
      {movingRowId !== null && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-600 text-white text-sm font-medium shrink-0 z-10">
          <Navigation2 className="h-4 w-4 shrink-0" />
          {pendingMove ? (
            <>
              <span className="flex-1 truncate">Move to: {pendingMove.address}?</span>
              <button
                onClick={acceptMove}
                className="flex items-center gap-1 px-3 py-1 bg-white text-sky-700 rounded-md text-xs font-bold hover:bg-sky-50 transition-colors"
              >
                <Check className="h-3.5 w-3.5" /> Accept
              </button>
              <button
                onClick={cancelMove}
                className="flex items-center gap-1 px-3 py-1 bg-sky-700 text-white rounded-md text-xs font-bold hover:bg-sky-800 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </>
          ) : (
            <>
              <span className="flex-1">Drag waypoint to new position…</span>
              <button
                onClick={cancelMove}
                className="flex items-center gap-1 px-3 py-1 bg-sky-700 text-white rounded-md text-xs font-bold hover:bg-sky-800 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <MapView
          className="w-full h-full"
          initialCenter={PERTH_CENTER}
          initialZoom={13}
          onMapReady={handleMapReady}
        />

        {!selectedSheetId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
            <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Select an operation and running sheet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">The target's route will be plotted automatically</p>
          </div>
        )}

        {wpLoading && selectedSheetId && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm pointer-events-none">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-5 py-3 shadow-lg">
              <Spinner className="h-4 w-4" />
              <span className="text-sm font-medium">Loading waypoints…</span>
            </div>
          </div>
        )}

        {!wpLoading && selectedSheetId && !geocoding && placedWaypointsRef.current.length === 0 && (waypoints as any[])?.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
            <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No location entries found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Observations with bracketed addresses will appear here</p>
          </div>
        )}

        {waypointCount > 0 && !geocoding && (
          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-md">
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-green-600 border-2 border-white shadow" />
                  <span>Start</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-indigo-500 border-2 border-white shadow" />
                  <span>Stop</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow" />
                  <span>End</span>
                </div>
              </div>
              {traceRouteEnabled && (
                <div className="flex items-center gap-3 border-t border-border pt-1.5 mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-8 h-1 rounded bg-amber-400" />
                    <span>Via route{viaSegmentCount > 0 ? ` (${viaSegmentCount})` : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-8 h-0.5 border-t-2 border-dashed border-slate-400" />
                    <span>OOS{coosSegmentCount > 0 ? ` (${coosSegmentCount})` : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-8 h-1 rounded bg-indigo-500" />
                    <span>Direct</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trace route info banner */}
        {traceRouteEnabled && !tracing && waypointCount >= 2 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
            <GitBranch className="h-3.5 w-3.5" />
            Route traced from running sheet
            {viaSegmentCount > 0 && ` · ${viaSegmentCount} via segment${viaSegmentCount > 1 ? "s" : ""}`}
            {coosSegmentCount > 0 && ` · ${coosSegmentCount} OOS`}
          </div>
        )}
      </div>

      {/* ── Comment dialog ───────────────────────────────────────────────────── */}
      {commentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquarePlus className="h-5 w-5 text-violet-500" />
              <h2 className="text-base font-semibold">Add Comment</h2>
            </div>
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Enter a comment for this waypoint…"
              className="min-h-[100px] text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCommentDialog(null)} disabled={commentSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveComment} disabled={commentSaving} className="bg-violet-600 hover:bg-violet-700 text-white">
                {commentSaving ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit marker dialog ───────────────────────────────────────────────── */}
      {editDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Pencil className="h-5 w-5 text-green-600" />
              <h2 className="text-base font-semibold">Edit Marker</h2>
              <button onClick={() => setEditDialog(null)} className="ml-auto p-1 rounded hover:bg-accent">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Colour picker */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">COLOUR</p>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColour(c)}
                    title={MARKER_COLOUR_LABELS[c]}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${editColour === c ? "border-foreground scale-110 shadow-md" : "border-transparent"}`}
                    style={{ background: MARKER_COLOURS[c] }}
                  />
                ))}
              </div>
            </div>

            {/* Icon picker */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">ICON</p>
              {MARKER_ICON_GROUPS.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="text-[10px] text-muted-foreground mb-1.5">{group.label}</p>
                  <div className="flex gap-2 flex-wrap">
                    {group.icons.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setEditIcon(icon)}
                        title={MARKER_ICON_LABELS[icon]}
                        className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${editIcon === icon ? "border-primary bg-primary/10" : "border-border bg-muted/40 hover:bg-muted"}`}
                      >
                        <img
                          src={getMarkerDataUrl(icon, editColour)}
                          alt={MARKER_ICON_LABELS[icon]}
                          className="w-6 h-6"
                          style={{ transform: `rotate(${editRotation}deg)` }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Rotation */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-muted-foreground">ROTATION</p>
                <span className="text-xs text-muted-foreground">{editRotation}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={359}
                value={editRotation}
                onChange={(e) => setEditRotation(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-muted/40 border border-border">
              <img
                src={getMarkerDataUrl(editIcon, editColour)}
                alt="preview"
                className="w-10 h-10"
                style={{ transform: `rotate(${editRotation}deg)` }}
              />
              <div>
                <p className="text-xs font-semibold">{MARKER_ICON_LABELS[editIcon]}</p>
                <p className="text-[10px] text-muted-foreground">{MARKER_COLOUR_LABELS[editColour]} · {editRotation}°</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditDialog(null)} disabled={editSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={editSaving} className="bg-green-600 hover:bg-green-700 text-white">
                {editSaving ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
