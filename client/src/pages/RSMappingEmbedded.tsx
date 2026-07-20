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
import { trpcClient } from "@/lib/trpc";
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
  Eye,
  EyeOff,
  FileDown,
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
  rowDate: string | null;
  dayOffset: number;
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
  rowDate: string | null;
  dayOffset: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERTH_CENTER = { lat: -31.9505, lng: 115.8605 };
const GEOCODE_DELAY_MS = 220;
/** Two waypoints within this many metres are considered co-located */
const SPIDER_THRESHOLD_M = 100;
/** Max via-waypoints per Directions API request */
const DIRECTIONS_CHUNK_SIZE = 23;

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Perth date helpers ────────────────────────────────────────────────────────

const RSM_PERTH_TZ = "Australia/Perth";
const RSM_PERTH_OFFSET_SUFFIX = "T00:00:00+08:00";
const RSM_PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;

function rsmFormatPerthDateLabel(ymd: string): string {
  return new Date(`${ymd}${RSM_PERTH_OFFSET_SUFFIX}`)
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: RSM_PERTH_TZ })
    .toUpperCase();
}

function rsmYmdToPerthMs(ymd: string): number {
  return new Date(`${ymd}${RSM_PERTH_OFFSET_SUFFIX}`).getTime();
}

/**
 * Build a Map<rowId, ymd> for all waypoints, using explicit rowDate,
 * legacy dayOffset, or time-regression inference.
 */
function buildWpDateMap(
  waypoints: WaypointRow[],
  sheetCreatedAt: number,
): Map<number, string> {
  const map = new Map<number, string>();
  if (waypoints.length === 0) return map;

  const sheetStartYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: RSM_PERTH_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(sheetCreatedAt));

  let currentYmd = sheetStartYmd;
  let prevMins: number | null = null;

  for (const wp of waypoints) {
    if (wp.rowDate) {
      currentYmd = wp.rowDate;
      prevMins = wp.timeMinutes;
      map.set(wp.rowId, currentYmd);
      continue;
    }
    if (wp.dayOffset > 0) {
      const ms = rsmYmdToPerthMs(sheetStartYmd) + wp.dayOffset * 86400000;
      const d = new Date(ms + RSM_PERTH_OFFSET_MS);
      currentYmd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      prevMins = wp.timeMinutes;
      map.set(wp.rowId, currentYmd);
      continue;
    }
    if (wp.timeMinutes !== null && prevMins !== null && wp.timeMinutes < prevMins - 120) {
      const ms = rsmYmdToPerthMs(currentYmd) + 86400000;
      const d = new Date(ms + RSM_PERTH_OFFSET_MS);
      currentYmd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
    if (wp.timeMinutes !== null) prevMins = wp.timeMinutes;
    map.set(wp.rowId, currentYmd);
  }
  return map;
}

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

/**
 * Builds an offset-badge marker.
 *
 * AdvancedMarkerElement anchors at the BOTTOM-CENTRE of the content element.
 * So: dot MUST be at the bottom-centre of the wrapper.
 * Badge is offset DX px to the right and DY px upward from the dot.
 * A leader line + white halo connects dot to badge.
 *
 * Geometry (all px):
 *   DOT_R  = 4   anchor dot radius
 *   BADGE_R= 10  badge radius (20px diameter)
 *   DX     = 20  badge centre rightward from dot
 *   DY     = 28  badge centre upward from dot
 *
 * Wrapper size:
 *   width  = DOT_R*2 + DX + BADGE_R + extra  (dot at left half, badge extends right)
 *   height = DY + BADGE_R + DOT_R + extra
 *   dot is at (DOT_R + extra/2, height - DOT_R - extra/2)  ← bottom-centre
 */
function buildNumberPin(index: number, isFirst: boolean, isLast: boolean): HTMLElement {
  let bg = "#6366f1";
  if (isFirst) bg = "#16a34a";
  if (isLast) bg = "#dc2626";

  const DX = 20;       // badge centre rightward from dot
  const DY = 28;       // badge centre upward from dot
  const BADGE_R = 10;  // badge radius → 20px diameter
  const DOT_R = 4;     // anchor dot radius
  const PAD = 3;       // extra padding so circles don't clip

  // AdvancedMarkerElement anchors at the BOTTOM-CENTRE of the wrapper element.
  // Therefore: dot MUST be at x = svgW/2 (horizontal centre), y = svgH - PAD (near bottom).
  //
  // The badge extends DX right and DY up from the dot.
  // Right side needs: DX + BADGE_R + PAD from dot centre.
  // Left side needs: DOT_R + PAD from dot centre (just enough for the dot circle).
  // To keep dot at centre, make both halves equal to the larger side.
  const halfW = DX + BADGE_R + PAD;   // right side dominates
  const svgW = halfW * 2;              // dot at x = halfW (= svgW/2) ✓
  const svgH = DY + BADGE_R + DOT_R + PAD * 2;

  // Dot at bottom-centre of wrapper
  const dotCx = halfW;                 // = svgW / 2 exactly
  const dotCy = svgH - DOT_R - PAD;

  // Badge centre: dot + offset
  const badgeCx = dotCx + DX;
  const badgeCy = dotCy - DY;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = [
    "position:relative",
    `width:${svgW}px`,
    `height:${svgH}px`,
    "cursor:pointer",
    "user-select:none",
  ].join(";");

  // SVG: white halo + coloured leader line + anchor dot
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(svgW));
  svg.setAttribute("height", String(svgH));
  svg.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;overflow:visible;";

  // White halo for visibility on any map background
  const lineHalo = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineHalo.setAttribute("x1", String(dotCx));
  lineHalo.setAttribute("y1", String(dotCy));
  lineHalo.setAttribute("x2", String(badgeCx));
  lineHalo.setAttribute("y2", String(badgeCy));
  lineHalo.setAttribute("stroke", "#fff");
  lineHalo.setAttribute("stroke-width", "3");
  lineHalo.setAttribute("stroke-opacity", "0.75");
  svg.appendChild(lineHalo);

  // Coloured leader line
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(dotCx));
  line.setAttribute("y1", String(dotCy));
  line.setAttribute("x2", String(badgeCx));
  line.setAttribute("y2", String(badgeCy));
  line.setAttribute("stroke", bg);
  line.setAttribute("stroke-width", "1.5");
  line.setAttribute("stroke-opacity", "0.9");
  svg.appendChild(line);

  // Anchor dot at exact coordinate
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", String(dotCx));
  dot.setAttribute("cy", String(dotCy));
  dot.setAttribute("r", String(DOT_R));
  dot.setAttribute("fill", bg);
  dot.setAttribute("stroke", "#fff");
  dot.setAttribute("stroke-width", "1.5");
  svg.appendChild(dot);

  wrapper.appendChild(svg);

  // Badge div (positioned absolutely over the SVG)
  const badge = document.createElement("div");
  badge.style.cssText = [
    "position:absolute",
    `width:${BADGE_R * 2}px`,
    `height:${BADGE_R * 2}px`,
    `left:${badgeCx - BADGE_R}px`,
    `top:${badgeCy - BADGE_R}px`,
    "border-radius:50%",
    `background:${bg}`,
    "color:#fff",
    "font-size:9px",
    "font-weight:700",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "border:1.5px solid #fff",
    "box-shadow:0 1px 4px rgba(0,0,0,0.4)",
    "pointer-events:auto",
  ].join(";");
  badge.textContent = String(index);
  wrapper.appendChild(badge);

  return wrapper;
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

  // Waypoint count as state (so waypoint counter renders after geocoding)
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

  // Visual RS mode
  const [visualRsMode, setVisualRsMode] = useState(false);
  const visualOverlaysRef = useRef<google.maps.OverlayView[]>([]);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

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
    setMapReady(true);
  }, []);

  // ── Clear map ────────────────────────────────────────────────────────────────

  const clearMap = useCallback(() => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = [];
    placedWaypointsRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    infoWindowRef.current?.close();
    setWaypointCount(0);
  }, []);

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

    // Build date label for this waypoint
    const sheetCreatedAt = (sheetsData as any[] | undefined)?.find((s: any) => s.id === sheetId)?.createdAt ?? Date.now();
    const wpDateMap = buildWpDateMap(placedWaypointsRef.current as unknown as WaypointRow[], sheetCreatedAt);
    const wpYmd = wpDateMap.get(wp.rowId);
    const sheetStartYmd = new Intl.DateTimeFormat("en-CA", { timeZone: RSM_PERTH_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(sheetCreatedAt));
    const dateLabel = wpYmd && wpYmd !== sheetStartYmd ? rsmFormatPerthDateLabel(wpYmd) : null;

    const commentHtml = wp.comment
      ? `<div style="margin-top:6px;padding:6px 8px;background:#fef9c3;border-left:3px solid #ca8a04;border-radius:0 4px 4px 0;font-size:11px;color:#78350f;">${wp.comment}</div>`
      : "";

    const obsSnippet = wp.observation
      ? `<div style="margin-top:4px;font-size:11px;color:#555;line-height:1.4;max-height:60px;overflow:hidden;">${wp.observation.substring(0, 180)}${wp.observation.length > 180 ? "…" : ""}</div>`
      : "";

    const dateHtml = dateLabel
      ? `<span style="font-size:9px;color:#7c3aed;font-weight:700;background:#ede9fe;border-radius:3px;padding:1px 5px;margin-left:4px;">${dateLabel}</span>`
      : "";

    const html = `
      <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:280px;padding:4px 0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="background:${badgeColor};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;">${badgeLabel}</span>
          <span style="font-size:11px;color:#888;">${formatTime(wp.time)}</span>${dateHtml}
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

    const rawQuery = row.addressFull || row.address || "";
    if (!rawQuery || !geocoderRef.current) {
      geocodeTimerRef.current = setTimeout(geocodeNext, GEOCODE_DELAY_MS);
      return;
    }

    // Append ", Perth WA" to addresses that don't already contain a state code,
    // so ambiguous street names resolve to Western Australia instead of overseas.
    const hasState = /\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/.test(rawQuery);
    const addressQuery = hasState ? rawQuery : `${rawQuery}, Perth WA`;

    geocoderRef.current.geocode(
      { address: addressQuery, componentRestrictions: { country: "au" } },
      (results, status) => {
      if (status === "OK" && results && results[0]) {
        const pos = results[0].geometry.location;
        placeWaypointMarker(row, pos.lat(), pos.lng(), idx);
      }
      geocodeTimerRef.current = setTimeout(geocodeNext, GEOCODE_DELAY_MS);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatePolyline, setWaypointCount]);

  function placeWaypointMarker(row: WaypointRow, lat: number, lng: number, queueIndex?: number) {
    if (!mapRef.current) return;
    const total = geocodeQueueRef.current.length;
    // Use the pre-assigned queue position (1-based) so numbers always reflect
    // the chronological RS order, regardless of geocoding completion order.
    const index = queueIndex != null ? queueIndex + 1 : placedWaypointsRef.current.length + 1;
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
      rowDate: row.rowDate ?? null,
      dayOffset: row.dayOffset ?? 0,
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
          "width:20px",
          "height:20px",
          "border-radius:50%",
          `background:${bg}`,
          "color:#fff",
          "font-size:9px",
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

    // Sort ALL rows by rowNumber first so the time-regression inference in
    // buildWpDateMap always runs in the correct entry sequence.
    const allRows = [...(waypoints as WaypointRow[])].sort((a, b) => a.rowNumber - b.rowNumber);
    const addressRows = allRows.filter((w) => w.address);
    if (addressRows.length === 0) {
      setGeocoding(false);
      return;
    }

    // Sort by effective date+time so multi-day sheets are numbered correctly.
    // Build the date map using ALL rows (including non-address rows) so the
    // time-regression inference has full context, then sort address rows only.
    const sheetCreatedAt = (sheetsData as any[] | undefined)?.find((s: any) => s.id === selectedSheetId)?.createdAt ?? Date.now();
    const dateMap = buildWpDateMap(allRows, sheetCreatedAt);

    const sortedQueue = [...addressRows].sort((a, b) => {
      const ymdA = dateMap.get(a.rowId) ?? "";
      const ymdB = dateMap.get(b.rowId) ?? "";
      if (ymdA !== ymdB) return ymdA < ymdB ? -1 : 1;
      // Same date: sort by timeMinutes (nulls last)
      const tA = a.timeMinutes ?? 9999;
      const tB = b.timeMinutes ?? 9999;
      if (tA !== tB) return tA - tB;
      // Same time: preserve original rowNumber order
      return a.rowNumber - b.rowNumber;
    });

    geocodeQueueRef.current = sortedQueue;
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

  // ── Visual RS overlays ────────────────────────────────────────────────────────

  const clearVisualOverlays = useCallback(() => {
    visualOverlaysRef.current.forEach((ov) => ov.setMap(null));
    visualOverlaysRef.current = [];
  }, []);

  const buildVisualOverlays = useCallback(() => {
    if (!mapRef.current) return;
    clearVisualOverlays();
    const placed = placedWaypointsRef.current;
    if (placed.length === 0) return;

    // Build date map for all placed waypoints
    const overlaySheetCreatedAt = (sheetsData as any[] | undefined)?.find((s: any) => s.id === selectedSheetId)?.createdAt ?? Date.now();
    const overlayDateMap = buildWpDateMap(placed as unknown as WaypointRow[], overlaySheetCreatedAt);
    const overlaySheetStartYmd = new Intl.DateTimeFormat("en-CA", { timeZone: RSM_PERTH_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(overlaySheetCreatedAt));

    placed.forEach((wp) => {
      const overlay = new google.maps.OverlayView();
      const lat = wp.lat;
      const lng = wp.lng;
      const time = wp.time ?? "—";
      const address = wp.address;
      const index = wp.index;
      const total = placed.length;
      const isFirst = index === 1;
      const isLast = index === total;
      const badgeColor = isFirst ? "#16a34a" : isLast ? "#dc2626" : "#6366f1";

      // Date label for overlay (only show if different from sheet start day)
      const wpYmd = overlayDateMap.get(wp.rowId);
      const overlayDateLabel = wpYmd && wpYmd !== overlaySheetStartYmd ? rsmFormatPerthDateLabel(wpYmd) : null;

      let div: HTMLDivElement | null = null;

      overlay.onAdd = function () {
        div = document.createElement("div");
        div.style.cssText = [
          "position:absolute",
          "background:rgba(255,255,255,0.95)",
          "border:1.5px solid " + badgeColor,
          "border-radius:5px",
          "padding:2px 5px",
          "font-family:system-ui,sans-serif",
          "font-size:8px",
          "line-height:1.35",
          "max-width:140px",
          "min-width:60px",
          "box-shadow:0 2px 6px rgba(0,0,0,0.15)",
          "pointer-events:none",
          "white-space:normal",
          "word-break:break-word",
          "z-index:10",
          "transform:translate(-50%, calc(-100% - 26px))",
        ].join(";");
        div.innerHTML = [
          `<div style="font-weight:700;color:${badgeColor};font-size:9px;">#${index} · ${time}${overlayDateLabel ? ` <span style="color:#7c3aed;font-size:7.5px;">(${overlayDateLabel})</span>` : ""}</div>`,
          `<div style="color:#111;font-size:7.5px;margin-top:1px;">${address}</div>`,
        ].join("");
        const panes = this.getPanes()!;
        panes.floatPane.appendChild(div);
      };

      overlay.draw = function () {
        if (!div) return;
        const proj = this.getProjection();
        if (!proj) return;
        const point = proj.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng));
        if (!point) return;
        div.style.left = point.x + "px";
        div.style.top = point.y + "px";
      };

      overlay.onRemove = function () {
        if (div && div.parentNode) div.parentNode.removeChild(div);
        div = null;
      };

      overlay.setMap(mapRef.current!);
      visualOverlaysRef.current.push(overlay);
    });
  }, [clearVisualOverlays]);

  // Toggle Visual RS mode
  useEffect(() => {
    if (visualRsMode) {
      buildVisualOverlays();
    } else {
      clearVisualOverlays();
    }
  }, [visualRsMode, buildVisualOverlays, clearVisualOverlays]);

  // Rebuild overlays when waypoints change while Visual RS is active
  useEffect(() => {
    if (visualRsMode && !geocoding) {
      buildVisualOverlays();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocoding]);

  // ── PDF export for Visual RS ──────────────────────────────────────────────────

  const [pdfExporting, setPdfExporting] = useState(false);

  const exportVisualRsPdf = useCallback(async () => {
    const placed = placedWaypointsRef.current;
    if (placed.length === 0) { toast.error("No waypoints to export"); return; }
    if (!mapContainerRef.current) { toast.error("Map container not ready"); return; }

    setPdfExporting(true);
    toast.info("Capturing map screenshot…");

    let mapImageDataUrl = "";
    try {
      // Use the server-side Static Maps proxy so we get a real map image
      // (html2canvas fails on Google Maps tiles due to CORS)
      const liveMap = mapRef.current;
      const center = liveMap?.getCenter();
      const zoom = liveMap?.getZoom();

      // Build waypoint list with colours matching the on-screen markers
      const COLOUR_HEX: Record<string, string> = {
        red: "#E53935", yellow: "#F9A825", blue: "#1E88E5",
        purple: "#8E24AA", black: "#212121",
      };
      const waypointList = placed.map((wp, i) => ({
        lat: wp.lat,
        lng: wp.lng,
        index: wp.index,
        colour: i === 0 ? "#22c55e"                          // first = green
               : i === placed.length - 1 ? "#E53935"         // last = red
               : COLOUR_HEX[wp.markerColour ?? "blue"] ?? "#1E88E5",
      }));

      // Fetch the clean base map (no markers) so we can draw our own markers on canvas.
      // MUST pass explicit center+zoom so the static map extent matches the live map
      // (without them, Static Maps auto-fits to a different extent and the projection is wrong).
      // Compute bounds-based center+zoom from waypoints if live map values are unavailable.
      let exportCenter = center ? { lat: center.lat(), lng: center.lng() } : null;
      let exportZoom = zoom ?? null;
      if (!exportCenter || exportZoom == null) {
        // Fallback: compute from waypoint bounds
        const lats = waypointList.map((w) => w.lat);
        const lngs = waypointList.map((w) => w.lng);
        exportCenter = {
          lat: (Math.min(...lats) + Math.max(...lats)) / 2,
          lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        };
        // Rough zoom from span
        const latSpan = Math.max(...lats) - Math.min(...lats);
        const lngSpan = Math.max(...lngs) - Math.min(...lngs);
        const span = Math.max(latSpan, lngSpan);
        exportZoom = span < 0.01 ? 15 : span < 0.05 ? 13 : span < 0.2 ? 11 : span < 0.5 ? 10 : 9;
      }

      const result = await trpcClient.rsMapping.getStaticMapImage.query({
        waypoints: [],   // no markers from Static Maps — we draw them ourselves on canvas
        center: exportCenter,
        zoom: exportZoom,
        size: "800x1000",
      });

      // Draw waypoints + route line on top of the static map using Canvas
      const baseImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = result.dataUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(baseImg, 0, 0);

      // Project lat/lng to pixel using Mercator (matching Static Maps scale=2).
      // Use exportCenter/exportZoom — the exact values sent to the Static Maps request.
      const mapZoom = exportZoom!;
      const mapCenterLat = exportCenter!.lat;
      const mapCenterLng = exportCenter!.lng;
      const TILE_SIZE = 256;
      const scale = 2; // scale=2 in Static Maps request
      const mapW = canvas.width;
      const mapH = canvas.height;

      const mercatorProject = (lat: number, lng: number): { x: number; y: number } => {
        const siny = Math.sin((lat * Math.PI) / 180);
        const clampedSiny = Math.min(Math.max(siny, -0.9999), 0.9999);
        const worldX = TILE_SIZE * (0.5 + lng / 360);
        const worldY = TILE_SIZE * (0.5 - Math.log((1 + clampedSiny) / (1 - clampedSiny)) / (4 * Math.PI));
        return { x: worldX, y: worldY };
      };

      const mapScale = scale * Math.pow(2, mapZoom);
      const centerWorld = mercatorProject(mapCenterLat, mapCenterLng);

      const latLngToCanvas = (lat: number, lng: number): { x: number; y: number } => {
        const world = mercatorProject(lat, lng);
        return {
          x: mapW / 2 + (world.x - centerWorld.x) * mapScale / TILE_SIZE,
          y: mapH / 2 + (world.y - centerWorld.y) * mapScale / TILE_SIZE,
        };
      };

      // Draw route polyline
      if (waypointList.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(99,102,241,0.8)";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        const first = latLngToCanvas(waypointList[0].lat, waypointList[0].lng);
        ctx.moveTo(first.x, first.y);
        for (let wi = 1; wi < waypointList.length; wi++) {
          const pt = latLngToCanvas(waypointList[wi].lat, waypointList[wi].lng);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      // Draw each waypoint: dot + leader line + badge (matching live map style)
      const DX_C = 18 * scale;
      const DY_C = 30 * scale;
      const BADGE_R_C = 10 * scale;
      const DOT_R_C = 4 * scale;
      const FONT_SIZE_C = 9 * scale;

      for (const wp of waypointList) {
        const { x, y } = latLngToCanvas(wp.lat, wp.lng);
        const colour = wp.colour ?? "#6366f1";
        const badgeCx = x + DX_C;
        const badgeCy = y - DY_C;

        // Leader line
        ctx.beginPath();
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5 * scale;
        ctx.globalAlpha = 0.85;
        ctx.moveTo(x, y);
        ctx.lineTo(badgeCx, badgeCy);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Anchor dot
        ctx.beginPath();
        ctx.arc(x, y, DOT_R_C, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();

        // Badge circle
        ctx.beginPath();
        ctx.arc(badgeCx, badgeCy, BADGE_R_C, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();

        // Badge number
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${FONT_SIZE_C}px system-ui,sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(wp.index), badgeCx, badgeCy);
      }

      mapImageDataUrl = canvas.toDataURL("image/png");
    } catch (err) {
      console.warn("Static map image failed:", err);
      toast.warning("Map image unavailable — PDF will include a placeholder");
    }

    const exportSheetCreatedAt = (sheetsData as any[] | undefined)?.find((s: any) => s.id === selectedSheetId)?.createdAt ?? Date.now();
    const exportDateMap = buildWpDateMap(placed as unknown as WaypointRow[], exportSheetCreatedAt);
    const exportSheetStartYmd = new Intl.DateTimeFormat("en-CA", { timeZone: RSM_PERTH_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(exportSheetCreatedAt));
    const exportIsMultiDay = Array.from(exportDateMap.values()).some((ymd) => ymd !== exportSheetStartYmd);

    const rows = placed.map((wp) => ({
      index: wp.index,
      time: wp.time ?? "—",
      date: (() => { const y = exportDateMap.get(wp.rowId); return y && y !== exportSheetStartYmd ? rsmFormatPerthDateLabel(y) : ""; })(),
      address: wp.address,
      observation: wp.observation ?? "",
    }));

    const sheetTitle = (sheetsData as any[] | undefined)?.find((s: any) => s.id === selectedSheetId)?.title ?? "Running Sheet";
    const opName = (operations as any[] | undefined)?.find((o: any) => o.id === selectedOpId)?.name ?? "";
    const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" });

    const tableRows = rows.map((r) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#6366f1;text-align:center;white-space:nowrap;">${r.index}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-weight:600;">${r.time}${r.date ? `<br><span style="font-size:8px;color:#7c3aed;font-weight:700;">${r.date}</span>` : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.address}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${r.observation}</td>
      </tr>
    `).join("");
    void exportIsMultiDay; // used via r.date above

    const mapSection = mapImageDataUrl
      ? `<img src="${mapImageDataUrl}" style="width:100%;flex:1;object-fit:contain;display:block;" />`
      : `<div style="flex:1;background:#f3f4f6;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;">Map capture unavailable</div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Visual RS — ${sheetTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; font-size: 11px; color: #111; background: #fff; }
  /* ── Page 1: full-width map ── */
  .map-page {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    break-after: page;
  }
  .map-header { background: #1e1b4b; color: #fff; padding: 12px 20px; flex-shrink: 0; }
  .map-header h1 { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .map-header p { font-size: 10px; color: rgba(255,255,255,0.65); }
  .map-image-wrap { flex: 1; overflow: hidden; display: flex; }
  /* ── Page 2: waypoint table ── */
  .table-page { padding: 16px 20px 24px; }
  .table-header { background: #1e1b4b; color: #fff; padding: 10px 20px; margin: -16px -20px 14px; }
  .table-header h2 { font-size: 13px; font-weight: 700; margin-bottom: 1px; }
  .table-header p { font-size: 9px; color: rgba(255,255,255,0.65); }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #6366f1; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1e1b4b; color: #fff; padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4 portrait; margin: 8mm; }
    .map-page { height: 100vh; page-break-after: always; break-after: page; }
  }
</style>
</head>
<body>
<!-- PAGE 1: Full-width map -->
<div class="map-page">
  <div class="map-header">
    <h1>Visual RS — ${sheetTitle}</h1>
    <p>${opName} · Generated: ${generatedAt}</p>
  </div>
  <div class="map-image-wrap">
    ${mapSection}
  </div>
</div>
<!-- PAGE 2: Waypoint table -->
<div class="table-page">
  <div class="table-header">
    <h2>Visual RS — ${sheetTitle}</h2>
    <p>${opName} · Generated: ${generatedAt} · Page 2 of 2</p>
  </div>
  <div class="section-title">Running Sheet Entries (${rows.length} waypoints)</div>
  <table>
    <thead><tr><th style="width:36px">#</th><th style="width:56px">Time</th><th style="width:32%">Address</th><th>Observation</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>
</body></html>`;

    setPdfExporting(false);
    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup blocked — allow popups and try again"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 800);
  }, [placedWaypointsRef, mapContainerRef, sheetsData, selectedSheetId, operations, selectedOpId]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeSheets = (sheetsData as any[] | undefined)?.filter((s: any) => !s.deletedAt) ?? [];
  const selectedSheet = activeSheets.find((s: any) => s.id === selectedSheetId);

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

        {geocoding && (
          <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
            <Spinner className="h-3.5 w-3.5" />
            <span>Plotting route…</span>
          </div>
        )}

        {selectedSheetId && !geocoding && (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-indigo-500" />
              <span>{waypointCount} waypoints</span>
            </div>
            {waypointCount > 0 && (
              <>
                <button
                  onClick={() => setVisualRsMode((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    visualRsMode
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                      : "bg-card text-foreground border-border hover:bg-accent"
                  }`}
                >
                  {visualRsMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  Visual RS
                </button>
                {visualRsMode && (
                  <button
                    onClick={() => { void exportVisualRsPdf(); }}
                    disabled={pdfExporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-card text-foreground border-border hover:bg-accent transition-all disabled:opacity-60"
                  >
                    {pdfExporting ? <Spinner className="h-3.5 w-3.5" /> : <FileDown className="h-3.5 w-3.5" />}
                    {pdfExporting ? "Capturing…" : "Export PDF"}
                  </button>
                )}
              </>
            )}
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
      <div className="flex-1 relative overflow-hidden" ref={mapContainerRef}>
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

            </div>
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
