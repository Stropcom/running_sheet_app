
import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { MapView } from "@/components/Map";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  ClipboardList,
  Navigation2,
  MessageSquarePlus,
  X,
  Check,
  Route,
  GitBranch,
} from "lucide-react";

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
  waypointId: number | null;
  segmentType: "normal" | "continued_via" | "coos";
  viaStreets: string[];
  suburbContext: string | null;
}

interface PlacedWaypoint {
  rowId: number;
  index: number; // 1-based sequence
  address: string;
  addressFull: string | null;
  time: string | null;
  observation: string | null;
  comment: string | null;
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
const GEOCODE_DELAY_MS = 220; // stay under 50 req/s quota
// Max waypoints per Directions API request (Google limit is 25 including origin/dest)
const DIRECTIONS_CHUNK_SIZE = 23;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(t: string | null): string {
  if (!t) return "—";
  return t;
}

function buildNumberPin(index: number, isFirst: boolean, isLast: boolean): HTMLElement {
  const el = document.createElement("div");
  let bg = "#6366f1"; // indigo default
  if (isFirst) bg = "#16a34a"; // green = start
  if (isLast) bg = "#dc2626";  // red = end
  el.style.cssText = `
    width:28px;height:28px;border-radius:50%;
    background:${bg};color:#fff;
    font-size:11px;font-weight:700;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
    cursor:pointer;
    user-select:none;
  `;
  el.textContent = String(index);
  return el;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RSMapping() {
  const [, setLocation] = useLocation();

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

  // Route tracing state
  const [traceRouteEnabled, setTraceRouteEnabled] = useState(false);
  const [tracing, setTracing] = useState(false);
  const tracePolylinesRef = useRef<(google.maps.Polyline | google.maps.DirectionsRenderer)[]>([]);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

  // Move-marker state
  const [movingRowId, setMovingRowId] = useState<number | null>(null);
  const [pendingMove, setPendingMove] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const movingMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const movingOrigPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Comment dialog state
  const [commentDialog, setCommentDialog] = useState<{ rowId: number; sheetId: number; existing: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  // Loading state
  const [geocoding, setGeocoding] = useState(false);
  // Track placed waypoint count as state so the Trace Route button renders
  const [waypointCount, setWaypointCount] = useState(0);

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

  // ── Polyline update (straight-line fallback) ─────────────────────────────────

  const updatePolyline = useCallback(() => {
    if (!mapRef.current) return;
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

  // ── Route tracing ─────────────────────────────────────────────────────────────

  /**
   * Build a Directions API request for a single segment (from → via streets → to).
   * Returns a DirectionsRenderer placed on the map, or null on failure.
   */
  const traceSegment = useCallback(async (
    origin: google.maps.LatLngLiteral,
    destination: google.maps.LatLngLiteral,
    viaStreets: string[],
    suburbContext: string | null,
  ): Promise<google.maps.DirectionsRenderer | null> => {
    if (!directionsServiceRef.current || !mapRef.current) return null;

    // Build waypoints from street names, adding suburb context for better geocoding
    const waypts: google.maps.DirectionsWaypoint[] = viaStreets
      .slice(0, DIRECTIONS_CHUNK_SIZE)
      .map((street) => ({
        location: suburbContext ? `${street}, ${suburbContext}` : street,
        stopover: false,
      }));

    return new Promise((resolve) => {
      directionsServiceRef.current!.route(
        {
          origin,
          destination,
          waypoints: waypts,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false, // preserve the order the target actually drove
        },
        (result, status) => {
          if (status !== google.maps.DirectionsStatus.OK || !result) {
            resolve(null);
            return;
          }
          const renderer = new google.maps.DirectionsRenderer({
            map: mapRef.current!,
            directions: result,
            suppressMarkers: true, // we have our own numbered pins
            polylineOptions: {
              strokeColor: "#f59e0b", // amber — distinct from the straight-line indigo
              strokeOpacity: 0.9,
              strokeWeight: 4,
            },
          });
          resolve(renderer);
        }
      );
    });
  }, []);

  /**
   * Draw a dashed line between two points (used for COOS / OOS segments).
   */
  const drawDashedSegment = useCallback((
    from: google.maps.LatLngLiteral,
    to: google.maps.LatLngLiteral,
  ): google.maps.Polyline => {
    return new google.maps.Polyline({
      path: [from, to],
      geodesic: true,
      strokeColor: "#94a3b8", // slate — muted dashed line
      strokeOpacity: 0,
      strokeWeight: 0,
      icons: [{
        icon: {
          path: "M 0,-1 0,1",
          strokeOpacity: 0.8,
          strokeColor: "#94a3b8",
          strokeWeight: 3,
          scale: 4,
        },
        offset: "0",
        repeat: "20px",
      }],
      map: mapRef.current!,
    });
  }, []);

  const runTraceRoute = useCallback(async () => {
    if (!mapRef.current) return;
    clearTraceLines();
    const wps = placedWaypointsRef.current;
    if (wps.length < 2) return;

    setTracing(true);

    // Hide the straight-line polyline while trace route is active
    polylineRef.current?.setMap(null);

    const newItems: (google.maps.Polyline | google.maps.DirectionsRenderer)[] = [];

    for (let i = 0; i < wps.length - 1; i++) {
      const from = { lat: wps[i].lat, lng: wps[i].lng };
      const to = { lat: wps[i + 1].lat, lng: wps[i + 1].lng };
      const seg = wps[i].segmentType;

      if (seg === "continued_via" && wps[i].viaStreets.length > 0) {
        const renderer = await traceSegment(from, to, wps[i].viaStreets, wps[i].suburbContext);
        if (renderer) {
          newItems.push(renderer);
        } else {
          // Fallback: draw a regular solid line if Directions API fails
          const fallback = new google.maps.Polyline({
            path: [from, to],
            geodesic: true,
            strokeColor: "#f59e0b",
            strokeOpacity: 0.6,
            strokeWeight: 3,
            map: mapRef.current,
          });
          newItems.push(fallback);
          toast.warning(`Could not trace route for stop ${i + 1} — drawing straight line`);
        }
      } else if (seg === "coos") {
        const dashed = drawDashedSegment(from, to);
        newItems.push(dashed);
      } else {
        // Normal segment: solid indigo line (same as the base polyline)
        const line = new google.maps.Polyline({
          path: [from, to],
          geodesic: true,
          strokeColor: "#6366f1",
          strokeOpacity: 0.75,
          strokeWeight: 3,
          map: mapRef.current,
        });
        newItems.push(line);
      }
    }

    tracePolylinesRef.current = newItems;
    setTracing(false);
  }, [clearTraceLines, traceSegment, drawDashedSegment]);

  // Re-run trace whenever toggle is turned on (or waypoints change while on)
  useEffect(() => {
    if (!mapReady) return;
    if (traceRouteEnabled && placedWaypointsRef.current.length >= 2 && !geocoding) {
      void runTraceRoute();
    } else if (!traceRouteEnabled) {
      clearTraceLines();
      // Restore the straight-line polyline
      if (polylineRef.current && mapRef.current) {
        polylineRef.current.setMap(mapRef.current);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceRouteEnabled, mapReady]);

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

    // Segment badge
    let segBadge = "";
    if (wp.segmentType === "continued_via" && wp.viaStreets.length > 0) {
      segBadge = `<div style="margin-top:5px;padding:4px 6px;background:#fef3c7;border:1px solid #fcd34d;border-radius:4px;font-size:10px;color:#92400e;">
        <span style="font-weight:700;">Via:</span> ${wp.viaStreets.slice(0, 4).join(" → ")}${wp.viaStreets.length > 4 ? " …" : ""}
      </div>`;
    } else if (wp.segmentType === "coos") {
      segBadge = `<div style="margin-top:5px;padding:4px 6px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;font-size:10px;color:#475569;">
        <span style="font-weight:700;">Next:</span> Continued out of sight (dashed line)
      </div>`;
    }

    const lat = wp.lat;
    const lng = wp.lng;

    const html = `
      <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:290px;padding:4px 0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="background:${badgeColor};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;">${badgeLabel}</span>
          <span style="font-size:11px;color:#888;">${formatTime(wp.time)}</span>
        </div>
        <strong style="font-size:13px;color:#111;display:block;margin-bottom:2px;">${wp.address}</strong>
        ${obsSnippet}
        ${commentHtml}
        ${segBadge}
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <a href="/sheet/${sheetId}#row-${wp.rowId}"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
            ✏️ Edit
          </a>
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
          <a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank"
             style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 10px;background:#00bcd4;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
            Waze
          </a>
          <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank"
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
  // Use a ref so the recursive setTimeout always calls the *latest* closure —
  // avoids stale-closure bugs where updatePolyline / runTraceRoute captured at
  // mount time point to no-ops.

  const geocodeNextRef = useRef<() => void>(() => {});

  const geocodeNextImpl = () => {
    const queue = geocodeQueueRef.current;
    const idx = geocodeIndexRef.current;

    if (idx >= queue.length) {
      setGeocoding(false);
      // Update waypointCount state here (not per-marker) so it fires on the
      // stable geocodeNext callback and always reflects the final placed count
      setWaypointCount(placedWaypointsRef.current.length);
      updatePolyline();
      // Fit bounds
      if (mapRef.current && placedWaypointsRef.current.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        placedWaypointsRef.current.forEach((w) => bounds.extend({ lat: w.lat, lng: w.lng }));
        mapRef.current.fitBounds(bounds, 60);
      }
      // Auto-run trace route if toggle is already on
      if (traceRouteEnabled && placedWaypointsRef.current.length >= 2) {
        void runTraceRoute();
      }
      return;
    }

    const row = queue[idx];
    geocodeIndexRef.current = idx + 1;

    // If row has a persisted lat/lng, use it directly
    if (row.lat != null && row.lng != null) {
      placeWaypointMarker(row, row.lat, row.lng);
      geocodeTimerRef.current = setTimeout(() => geocodeNextRef.current(), 0);
      return;
    }

    const addressQuery = row.addressFull || row.address || "";
    if (!addressQuery || !geocoderRef.current) {
      geocodeTimerRef.current = setTimeout(() => geocodeNextRef.current(), GEOCODE_DELAY_MS);
      return;
    }

    geocoderRef.current.geocode({ address: addressQuery }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const pos = results[0].geometry.location;
        placeWaypointMarker(row, pos.lat(), pos.lng());
      }
      geocodeTimerRef.current = setTimeout(() => geocodeNextRef.current(), GEOCODE_DELAY_MS);
    });
  };

  // Keep the ref pointing at the latest impl on every render (cheap)
  geocodeNextRef.current = geocodeNextImpl;

  // Stable entry-point used by the start-geocoding useEffect
  const geocodeNext = useCallback(() => geocodeNextRef.current(), []);

  function placeWaypointMarker(row: WaypointRow, lat: number, lng: number) {
    if (!mapRef.current) return;
    const total = geocodeQueueRef.current.length;
    const index = placedWaypointsRef.current.length + 1;
    const isFirst = index === 1;
    const isLast = index === total;

    const pinEl = buildNumberPin(index, isFirst, isLast);
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

    // Capture sheetId in closure
    const sheetId = selectedSheetId!;
    marker.addListener("click", () => openPopup(wp, sheetId));
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
      movingMarkerRef.current = wp.marker;
      wp.marker.gmpDraggable = true;
      setMovingRowId(rowId);
      setPendingMove(null);

      wp.marker.addListener("dragend", (e: google.maps.MapMouseEvent) => {
        const lat = e.latLng!.lat();
        const lng = e.latLng!.lng();
        // Reverse geocode
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

    return () => {
      delete (window as any).__rsmStartMove;
      delete (window as any).__rsmAddComment;
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
          // Update in-memory
          wp.lat = pendingMove.lat;
          wp.lng = pendingMove.lng;
          wp.marker.position = { lat: pendingMove.lat, lng: pendingMove.lng };
          wp.marker.gmpDraggable = false;
          updatePolyline();
          if (traceRouteEnabled) void runTraceRoute();
          toast.success("Waypoint moved");
          setMovingRowId(null);
          setPendingMove(null);
          movingMarkerRef.current = null;
        },
      }
    );
  }, [pendingMove, movingRowId, selectedSheetId, upsertWaypoint, updatePolyline, traceRouteEnabled, runTraceRoute]);

  const cancelMove = useCallback(() => {
    if (!movingRowId) return;
    const wp = placedWaypointsRef.current.find((w) => w.rowId === movingRowId);
    if (wp && movingOrigPosRef.current) {
      wp.marker.position = movingOrigPosRef.current;
      wp.marker.gmpDraggable = false;
    }
    setMovingRowId(null);
    setPendingMove(null);
    movingMarkerRef.current = null;
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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeSheets = (sheetsData as any[] | undefined)?.filter((s: any) => !s.deletedAt) ?? [];
  const selectedSheet = activeSheets.find((s: any) => s.id === selectedSheetId);

  // Count how many waypoints have via-street data (for the toggle label)
  // waypointCount is used as a dependency to ensure these recompute after geocoding
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const viaSegmentCount = waypointCount > 0 ? placedWaypointsRef.current.filter(
    (w) => w.segmentType === "continued_via" && w.viaStreets.length > 0
  ).length : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const coosSegmentCount = waypointCount > 0 ? placedWaypointsRef.current.filter(
    (w) => w.segmentType === "coos"
  ).length : 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="flex flex-col h-screen overflow-hidden bg-background">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setLocation("/intelligence/mapping")}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-indigo-500" />
            <h1 className="text-base font-semibold">RS Mapping</h1>
          </div>
          {selectedSheet && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{selectedSheet.title}</span>
          )}
          {(geocoding || tracing) && (
            <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              <span>{tracing ? "Tracing route…" : "Plotting route…"}</span>
            </div>
          )}
        </div>

        {/* ── Picker bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0 flex-wrap">
          <Select
            value={selectedOpId !== null ? String(selectedOpId) : ""}
            onValueChange={(val) => {
              setSelectedOpId(Number(val));
              setSelectedSheetId(null);
              clearMap();
            }}
          >
            <SelectTrigger className="h-8 text-xs w-48">
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
              onValueChange={(val) => {
                setSelectedSheetId(Number(val));
              }}
            >
              <SelectTrigger className="h-8 text-xs w-56">
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

          {/* Trace Route toggle — only shown when waypoints are loaded */}
          {selectedSheetId && !geocoding && waypointCount >= 2 && (
            <button
              onClick={() => setTraceRouteEnabled((v) => !v)}
              disabled={tracing}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
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

          {/* Empty state overlay */}
          {!selectedSheetId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
              <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Select an operation and running sheet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">The target's route will be plotted automatically</p>
            </div>
          )}

          {/* Loading overlay */}
          {wpLoading && selectedSheetId && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-5 py-3 shadow-lg">
                <Spinner className="h-4 w-4" />
                <span className="text-sm font-medium">Loading waypoints…</span>
              </div>
            </div>
          )}

          {/* No-waypoints notice */}
          {!wpLoading && selectedSheetId && !geocoding && waypointCount === 0 && (waypoints as any[])?.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No location entries found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Observations with bracketed addresses will appear here</p>
            </div>
          )}

          {/* Legend */}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCommentDialog(null)}
                  disabled={commentSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveComment}
                  disabled={commentSaving}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {commentSaving ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
