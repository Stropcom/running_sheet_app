import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Settings2,
  X,
  ArrowLeft,
  Radio,
  AlertTriangle,
  Home,
  FolderOpen,
  Pencil,
  Check,
  FileText,
  ClipboardCheck,
  CalendarDays,
  FolderSearch,
  BookOpen,
  ScrollText,
  HelpCircle,
  Map as MapIcon,
  ClipboardList,
  Plus,
  ChevronLeft as ChevronLeftIcon,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface IntelMapLocation {
  label: string;
  type: "target_address" | "observation";
  linkedTargets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    operationId: number | null;
    operationName: string | null;
  }>;
  assocPersons: string[];
  assocVehicles: string[];
  linkCount: number;
  lat?: number;
  lng?: number;
}

interface LiveUser {
  userId: number;
  deviceId: string;
  name: string;
  team: "TEAM1" | "TEAM2" | "PTT" | null;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  operationIds: number[];
  updatedAt: number;
}

// ── Quick-link config ──────────────────────────────────────────────────────────
interface QuickLink {
  label: string;
  path: string;
  icon: string; // icon name key
}

const ALL_QUICK_LINK_OPTIONS: QuickLink[] = [
  { label: "Governance", path: "/governance", icon: "ClipboardCheck" },
  { label: "Calendar", path: "/calendar", icon: "CalendarDays" },
  { label: "Shortcuts", path: "/shortcuts", icon: "Zap" },
  { label: "Intel Profiles", path: "/intelligence", icon: "FolderSearch" },
  { label: "Target Registry", path: "/target-registry", icon: "BookOpen" },
  { label: "Audit Log", path: "/audit", icon: "ScrollText" },
  { label: "Draft Mode", path: "/draft", icon: "FileText" },
  { label: "Recycle Bin", path: "/recycle-bin", icon: "Trash2" },
  { label: "Help", path: "/help", icon: "HelpCircle" },
  { label: "My Profile", path: "/profile", icon: "User" },
  { label: "Operation Mgmt", path: "/operation-management", icon: "FolderOpen" },
  { label: "Court", path: "/court/statements", icon: "Scale" },
  { label: "To-Do", path: "/todo", icon: "ClipboardList" },
];

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: "Intel Profiles", path: "/intelligence", icon: "FolderSearch" },
  { label: "Target Registry", path: "/target-registry", icon: "BookOpen" },
  { label: "Governance", path: "/governance", icon: "ClipboardCheck" },
  { label: "Calendar", path: "/calendar", icon: "CalendarDays" },
];

const LS_QUICK_LINKS_KEY = "runlog_map_quick_links";

// ── Helpers ────────────────────────────────────────────────────────────────────
const TEAM_COLOURS: Record<string, string> = {
  TEAM1: "#ec4899", // pink
  TEAM2: "#1976d2", // blue
  PTT:   "#f9a825", // yellow
  null:  "#6b7280", // grey for unassigned
};

function getTeamColour(team: string | null): string {
  return TEAM_COLOURS[team ?? "null"] ?? "#6b7280";
}

function buildInfoWindowContent(loc: IntelMapLocation): string {
  const isTarget = loc.type === "target_address";
  const headerBg = isTarget ? "#dc2626" : "#7c3aed";

  let html = `
    <div style="font-family:system-ui,sans-serif;min-width:260px;max-width:340px;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.25);">
      <div style="background:${headerBg};padding:10px 14px;">
        <div style="color:#fff;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;margin-bottom:2px;">
          ${isTarget ? "Target Address" : "Observed Location"}
        </div>
        <div style="color:#fff;font-size:15px;font-weight:700;line-height:1.3;">${loc.label}</div>
      </div>
      <div style="padding:10px 14px;background:#fff;">
  `;

  if (isTarget && loc.linkedTargets.length > 0) {
    for (const t of loc.linkedTargets) {
      html += `
        <div style="border:1px solid #fca5a5;border-radius:6px;padding:8px 10px;margin-bottom:8px;background:#fff5f5;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="background:#dc2626;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:1px 5px;letter-spacing:0.06em;">TARGET</span>
            <span style="font-size:13px;font-weight:700;color:#1e293b;">${t.name}</span>
          </div>
          ${t.tgt ? `<div style="font-size:11px;color:#64748b;margin-bottom:3px;">TGT: ${t.tgt}</div>` : ""}
          ${t.hbf ? `<div style="font-size:11px;color:#475569;display:flex;align-items:flex-start;gap:4px;margin-bottom:2px;"><span style="color:#dc2626;margin-top:1px;">⌂</span><span>${t.hbf}</span></div>` : ""}
          ${t.v1f ? `<div style="font-size:11px;color:#475569;display:flex;align-items:flex-start;gap:4px;margin-bottom:2px;"><span style="color:#f59e0b;margin-top:1px;">⊕</span><span>${t.v1f}</span></div>` : ""}
          ${t.v2f ? `<div style="font-size:11px;color:#475569;display:flex;align-items:flex-start;gap:4px;margin-bottom:2px;"><span style="color:#f59e0b;margin-top:1px;">⊕</span><span>${t.v2f}</span></div>` : ""}
          ${t.operationName ? `<div style="font-size:10px;color:#94a3b8;margin-top:3px;">Op: ${t.operationName}</div>` : ""}
        </div>
      `;
    }
  }

  const hasAssoc = loc.assocPersons.length > 0 || loc.assocVehicles.length > 0;
  if (hasAssoc) {
    if (isTarget && loc.linkedTargets.length > 0) {
      html += `<div style="border-top:1px solid #e2e8f0;margin:6px 0 8px;"></div>`;
    }
    if (loc.assocPersons.length > 0) {
      html += `<div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Associates</div>`;
      for (const p of loc.assocPersons) {
        html += `<div style="font-size:12px;color:#1e293b;padding:2px 0;display:flex;align-items:center;gap:5px;"><span style="color:#3b82f6;">👤</span>${p}</div>`;
      }
    }
    if (loc.assocVehicles.length > 0) {
      html += `<div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.07em;margin:6px 0 4px;">Vehicles</div>`;
      for (const v of loc.assocVehicles) {
        html += `<div style="font-size:12px;color:#1e293b;padding:2px 0;display:flex;align-items:center;gap:5px;"><span style="color:#f59e0b;">🚗</span>${v}</div>`;
      }
    }
  }

  if (!isTarget && loc.linkedTargets.length > 0) {
    html += `<div style="border-top:1px solid #e2e8f0;margin:6px 0 8px;"></div>`;
    html += `<div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Linked Targets</div>`;
    for (const t of loc.linkedTargets) {
      html += `<div style="font-size:12px;color:#1e293b;padding:2px 0;display:flex;align-items:center;gap:5px;"><span style="color:#dc2626;">🎯</span>${t.name}</div>`;
    }
  }

  // Waze navigation button — only shown when coordinates are available
  if (loc.lat != null && loc.lng != null) {
    const wazeUrl = `https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes`;
    html += `
      <div style="border-top:1px solid #e2e8f0;margin-top:10px;padding-top:10px;">
        <a
          href="${wazeUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display:flex;align-items:center;justify-content:center;gap:8px;
            background:#05c8f7;color:#fff;
            border-radius:6px;padding:8px 12px;
            font-size:12px;font-weight:700;letter-spacing:0.04em;
            text-decoration:none;
            box-shadow:0 2px 6px rgba(5,200,247,0.35);
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C7.03 2 3 6.03 3 11c0 3.1 1.53 5.84 3.88 7.54L6 22l3.37-1.12A9.04 9.04 0 0 0 12 21c4.97 0 9-4.03 9-9s-4.03-10-9-10zm0 16c-1.18 0-2.31-.27-3.32-.74l-.24-.11-2.47.82.59-2.38-.16-.25A7.02 7.02 0 0 1 5 11c0-3.86 3.14-7 7-7s7 3.14 7 7-3.14 7-7 7z"/></svg>
          Navigate in Waze
        </a>
      </div>
    `;
  }

  html += `</div></div>`;
  return html;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IntelligenceMapping() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Filter state
  const [selectedOpIds, setSelectedOpIds] = useState<number[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([]);
  const [opExpanded, setOpExpanded] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Per-device ID — persisted in localStorage so each browser/device is unique
  const deviceId = useMemo(() => {
    let id = localStorage.getItem("runlog_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("runlog_device_id", id);
    }
    return id;
  }, []);

  // Location sharing state
  const [sharingEnabled, setSharingEnabled] = useState(false);
  // Per-user visibility: Set of userIds that are hidden
  const [hiddenUsers, setHiddenUsers] = useState<Set<number>>(new Set());
  // Per-team visibility: Set of team keys that are hidden
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set());
  // GPS error
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Whether device supports geolocation
  const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // Quick-link state
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
    try {
      const saved = localStorage.getItem(LS_QUICK_LINKS_KEY);
      if (saved) return JSON.parse(saved) as QuickLink[];
    } catch { /* ignore */ }
    return DEFAULT_QUICK_LINKS;
  });
  const [editingQuickLinks, setEditingQuickLinks] = useState(false);

  // RS Actions pane state
  const [rsActionsPaneOpen, setRsActionsPaneOpen] = useState(false);
  const [rsSelectedOpId, setRsSelectedOpId] = useState<number | null>(null);
  const [rsSelectedSheetId, setRsSelectedSheetId] = useState<number | null>(null);
  const [rsAddingRow, setRsAddingRow] = useState(false);
  const [rsLastEntry, setRsLastEntry] = useState<{ label: string; time: string } | null>(null);

  // Map state
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  // Key: "userId_deviceId" for per-device pins
  const liveMarkersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const geocodeQueueRef = useRef<IntelMapLocation[]>([]);
  const geocodeIndexRef = useRef(0);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Data
  const { data: operations, isLoading: opsLoading } = trpc.operation.list.useQuery();
  const { data: locations, isLoading: locsLoading } = trpc.intelligence.mappingLocations.useQuery({
    operationIds: selectedOpIds.length > 0 ? selectedOpIds : undefined,
    targetIds: selectedTargetIds.length > 0 ? selectedTargetIds : undefined,
  });

  // Live user locations — poll every 1 second
  const { data: liveUsers } = trpc.intelligence.userLocations.useQuery(
    { operationIds: selectedOpIds },
    { refetchInterval: 1000, enabled: true }
  );

  // Restore sharing state on mount (per-device)
  const { data: myLocationState } = trpc.intelligence.myLocationState.useQuery(
    { deviceId },
    { enabled: !!deviceId }
  );
  useEffect(() => {
    if (myLocationState) {
      setSharingEnabled(myLocationState.sharingEnabled);
    }
  }, [myLocationState]);

  // showOwnLocation always mirrors sharingEnabled (single toggle)
  const showOwnLocation = sharingEnabled;

  // Mutations
  const updateLocationMut = trpc.intelligence.updateUserLocation.useMutation();
  const clearLocationMut = trpc.intelligence.clearUserLocation.useMutation();

  // RS Actions pane — sheets for selected operation
  const { data: rsSheetsData } = trpc.sheet.listByOperation.useQuery(
    { operationId: rsSelectedOpId! },
    { enabled: rsSelectedOpId !== null }
  );
  // RS Actions pane — target for selected sheet
  const { data: rsTargetData } = trpc.intelligence.getSheetTarget.useQuery(
    { sheetId: rsSelectedSheetId! },
    { enabled: rsSelectedSheetId !== null }
  );
  // RS Actions pane — create row mutation
  const rsCreateRow = trpc.row.create.useMutation({
    onSuccess: (_data, vars) => {
      const now = new Date();
      const h24 = now.getHours();
      const min = now.getMinutes();
      const timeStr = `${String(h24 % 12 === 0 ? 12 : h24 % 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
      setRsLastEntry({ label: vars.observation ?? "Entry", time: timeStr });
      setRsAddingRow(false);
      toast.success("RS entry added");
    },
    onError: (e) => {
      setRsAddingRow(false);
      toast.error(e.message);
    },
  });

  // Targets per operation
  const { data: allTargets } = trpc.target.registry.list.useQuery();
  const opTargetMap = new Map<number, Array<{ id: number; name: string }>>();
  if (allTargets) {
    for (const t of allTargets as any[]) {
      const opId = t.operationId;
      if (!opId) continue;
      if (!opTargetMap.has(opId)) opTargetMap.set(opId, []);
      opTargetMap.get(opId)!.push({ id: t.id, name: t.name });
    }
  }

  // ── Filter handlers ──────────────────────────────────────────────────────────
  const toggleOp = (opId: number) => {
    setSelectedOpIds(prev => {
      const next = prev.includes(opId) ? prev.filter(id => id !== opId) : [...prev, opId];
      if (!next.includes(opId)) {
        const opTargets = opTargetMap.get(opId) ?? [];
        setSelectedTargetIds(tPrev => tPrev.filter(tid => !opTargets.find(t => t.id === tid)));
      }
      return next;
    });
  };

  const toggleTarget = (targetId: number) => {
    setSelectedTargetIds(prev =>
      prev.includes(targetId) ? prev.filter(id => id !== targetId) : [...prev, targetId]
    );
  };

  const selectAllOps = () => {
    if (!operations) return;
    setSelectedOpIds(operations.map((op: any) => op.id));
  };

  const clearAll = () => {
    setSelectedOpIds([]);
    setSelectedTargetIds([]);
  };

  // ── GPS / Sharing ────────────────────────────────────────────────────────────
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported on this device.");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        updateLocationMut.mutate({
          deviceId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          operationIds: selectedOpIds,
          sharingEnabled: true,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, [deviceId, selectedOpIds, updateLocationMut]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearLocationMut.mutate({ deviceId });
  }, [clearLocationMut, deviceId]);

  const handleSharingToggle = (checked: boolean) => {
    setSharingEnabled(checked);
    if (checked) {
      if (!isMobile) {
        setGpsError("Location sharing is designed for mobile devices. Your desktop location may be inaccurate.");
      } else {
        setGpsError(null);
      }
      startWatching();
    } else {
      setGpsError(null);
      stopWatching();
    }
  };

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
    };
  }, []);

  // ── Click-outside to close panel ────────────────────────────────────────────
  const handleMapAreaClick = useCallback(() => {
    if (sidebarOpen) setSidebarOpen(false);
  }, [sidebarOpen]);

  // ── Map pin rendering ────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    for (const m of markersRef.current) {
      m.map = null;
    }
    markersRef.current = [];
    if (geocodeTimerRef.current) {
      clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = null;
    }
  }, []);

  const createPinElement = useCallback((loc: IntelMapLocation) => {
    const isTarget = loc.type === "target_address";
    const color = isTarget ? "#dc2626" : "#7c3aed";
    const count = loc.linkCount;

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;`;

    const pin = document.createElement("div");
    pin.style.cssText = `
      width:32px;height:32px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:${color};
      border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    `;

    const inner = document.createElement("div");
    inner.style.cssText = `transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700;line-height:1;`;
    inner.textContent = count > 0 ? String(count) : "";
    pin.appendChild(inner);
    el.appendChild(pin);
    return el;
  }, []);

  const createUserPinElement = useCallback((liveUser: LiveUser) => {
    const color = getTeamColour(liveUser.team);
    const label = liveUser.name.toUpperCase();
    // Motion: speed > 0.5 m/s = moving (green dot), otherwise stopped (grey dot)
    const isMoving = liveUser.speed != null && liveUser.speed > 0.5;
    const dotColor = isMoving ? "#22c55e" : "#9ca3af";

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;`;

    // Pill-shaped name tag with motion dot on left
    const pill = document.createElement("div");
    pill.style.cssText = `
      display:flex;
      align-items:center;
      background:${color};
      color:#fff;
      font-size:12px;
      font-weight:800;
      padding:5px 12px 5px 7px;
      border-radius:20px;
      white-space:nowrap;
      box-shadow:0 2px 10px rgba(0,0,0,0.45);
      letter-spacing:0.06em;
      border:2px solid rgba(255,255,255,0.65);
      gap:6px;
    `;

    // Motion indicator dot
    const dot = document.createElement("div");
    dot.style.cssText = `
      width:9px;
      height:9px;
      border-radius:50%;
      background:${dotColor};
      flex-shrink:0;
      border:1.5px solid rgba(255,255,255,0.75);
      box-shadow:0 0 4px ${isMoving ? "rgba(34,197,94,0.7)" : "rgba(0,0,0,0.2)"};
    `;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = label;

    pill.appendChild(dot);
    pill.appendChild(nameSpan);
    el.appendChild(pill);
    return el;
  }, []);

  const placeMarker = useCallback((loc: IntelMapLocation, position: google.maps.LatLngLiteral) => {
    if (!mapRef.current) return;
    const pinEl = createPinElement(loc);
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef.current,
      position,
      content: pinEl,
      title: loc.label,
    });
    marker.addListener("click", () => {
      if (!infoWindowRef.current) {
        infoWindowRef.current = new google.maps.InfoWindow();
      }
      // Enrich loc with resolved coordinates for Waze link
      const enriched = { ...loc, lat: position.lat, lng: position.lng };
      infoWindowRef.current.setContent(buildInfoWindowContent(enriched));
      infoWindowRef.current.open({ map: mapRef.current!, anchor: marker });
    });
    markersRef.current.push(marker);
  }, [createPinElement]);

  const geocodeNext = useCallback(() => {
    const queue = geocodeQueueRef.current;
    const idx = geocodeIndexRef.current;
    if (idx >= queue.length || !geocoderRef.current) return;

    const loc = queue[idx];
    geocodeIndexRef.current = idx + 1;

    const query = loc.label.includes(",") || /\d/.test(loc.label)
      ? `${loc.label}, Western Australia, Australia`
      : `${loc.label}, Perth, Western Australia, Australia`;

    geocoderRef.current.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const pos = results[0].geometry.location;
        placeMarker(loc, { lat: pos.lat(), lng: pos.lng() });
      }
      geocodeTimerRef.current = setTimeout(geocodeNext, 50);
    });
  }, [placeMarker]);

  const renderLocations = useCallback((locs: IntelMapLocation[]) => {
    clearMarkers();
    if (!locs || locs.length === 0 || !geocoderRef.current) return;
    geocodeQueueRef.current = locs;
    geocodeIndexRef.current = 0;
    geocodeTimerRef.current = setTimeout(geocodeNext, 200);
  }, [clearMarkers, geocodeNext]);

  // Re-render location markers when locations change
  useEffect(() => {
    if (locations && mapRef.current && geocoderRef.current) {
      renderLocations(locations);
    }
  }, [locations, renderLocations]);

  // ── Live user marker rendering ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !liveUsers) return;

    const currentUserId = user?.id;
    const visibleUsers = (liveUsers as LiveUser[]).filter((u) => {
      // Own location: respect showOwnLocation toggle
      if (u.userId === currentUserId && !showOwnLocation) return false;
      // Per-team visibility
      const teamKey = u.team ?? "null";
      if (hiddenTeams.has(teamKey)) return false;
      // Per-user visibility
      if (hiddenUsers.has(u.userId)) return false;
      return true;
    });

    // Remove markers for devices no longer visible
    const visibleKeys = new Set(visibleUsers.map(u => `${u.userId}_${u.deviceId}`));
    Array.from(liveMarkersRef.current.entries()).forEach(([key, marker]) => {
      if (!visibleKeys.has(key)) {
        marker.map = null;
        liveMarkersRef.current.delete(key);
      }
    });

    // Add/update markers for visible devices
    for (const liveUser of visibleUsers) {
      const pinKey = `${liveUser.userId}_${liveUser.deviceId}`;
      const existing = liveMarkersRef.current.get(pinKey);
      if (existing) {
        existing.position = { lat: liveUser.lat, lng: liveUser.lng };
        // Refresh content to update motion dot
        existing.content = createUserPinElement(liveUser);
      } else {
        const pinEl = createUserPinElement(liveUser);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: liveUser.lat, lng: liveUser.lng },
          content: pinEl,
          title: liveUser.name.toUpperCase(),
          zIndex: 999,
        });
        liveMarkersRef.current.set(pinKey, marker);
      }
    }
  }, [liveUsers, showOwnLocation, hiddenUsers, hiddenTeams, user, createUserPinElement]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    infoWindowRef.current = new google.maps.InfoWindow();
    if (locations) {
      renderLocations(locations);
    }
  }, [locations, renderLocations]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const targetPins = locations?.filter(l => l.type === "target_address").length ?? 0;
  const obsPins = locations?.filter(l => l.type === "observation").length ?? 0;

  // ── Group live users by team for the settings panel ──────────────────────────
  const liveUsersByTeam = {
    TEAM1: [] as LiveUser[],
    TEAM2: [] as LiveUser[],
    PTT:   [] as LiveUser[],
    unassigned: [] as LiveUser[],
  };
  if (liveUsers) {
    for (const u of liveUsers as LiveUser[]) {
      if (u.team === "TEAM1") liveUsersByTeam.TEAM1.push(u);
      else if (u.team === "TEAM2") liveUsersByTeam.TEAM2.push(u);
      else if (u.team === "PTT") liveUsersByTeam.PTT.push(u);
      else liveUsersByTeam.unassigned.push(u);
    }
  }

  const toggleTeamVisibility = (teamKey: string) => {
    setHiddenTeams(prev => {
      const next = new Set(prev);
      next.has(teamKey) ? next.delete(teamKey) : next.add(teamKey);
      return next;
    });
  };

  const toggleUserVisibility = (userId: number) => {
    setHiddenUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  // ── RS Quick-entry helper ────────────────────────────────────────────────────
  const addQuickRsEntry = (observation: string) => {
    if (!rsSelectedSheetId) return;
    const now = new Date();
    const h24 = now.getHours();
    const min = now.getMinutes();
    const totalMins = h24 * 60 + min;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
    setRsAddingRow(true);
    rsCreateRow.mutate({ sheetId: rsSelectedSheetId, time: timeStr, timeMinutes: totalMins, observation });
  };

  return (
    <div className="relative flex w-full overflow-hidden" style={{ height: "calc(100vh - 0px)" }}>
      {/* ── Side Panel ── */}
      <div
        ref={panelRef}
        className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
          sidebarOpen ? "w-72 min-w-[18rem]" : "w-0 min-w-0 overflow-hidden"
        }`}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Map Settings</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Back link */}
        <div className="px-3 py-2 border-b border-border/50">
          <button
            onClick={() => setLocation("/intelligence")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Intel Profiles
          </button>
        </div>

        {/* Stats */}
        {locations && (
          <div className="px-4 py-2 border-b border-border/50 flex gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-xs text-muted-foreground">{targetPins} target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
              <span className="text-xs text-muted-foreground">{obsPins} observed</span>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Operations / Target selectors ── */}
          <div className="px-3 py-2 border-b border-border/50">
            {opsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            ) : !operations || operations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No operations found.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Operations</span>
                  <div className="flex gap-2">
                    <button onClick={selectAllOps} className="text-[10px] text-blue-400 hover:text-blue-300">All</button>
                    <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  {(operations as any[]).map((op) => {
                    const opTargets = opTargetMap.get(op.id) ?? [];
                    const isOpSelected = selectedOpIds.includes(op.id);
                    const isExpanded = opExpanded.has(op.id);
                    return (
                      <div key={op.id}>
                        <div className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-accent/50 transition-colors">
                          <Checkbox
                            id={`op-${op.id}`}
                            checked={isOpSelected}
                            onCheckedChange={() => toggleOp(op.id)}
                            className="h-3.5 w-3.5"
                          />
                          <label htmlFor={`op-${op.id}`} className="flex-1 text-sm cursor-pointer truncate">
                            {op.name}
                          </label>
                          {opTargets.length > 0 && (
                            <button
                              onClick={() => setOpExpanded(prev => {
                                const next = new Set(prev);
                                next.has(op.id) ? next.delete(op.id) : next.add(op.id);
                                return next;
                              })}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                        {isExpanded && opTargets.length > 0 && (
                          <div className="ml-5 pl-2 border-l border-border/50 flex flex-col gap-0.5 mb-1">
                            {opTargets.map((t) => (
                              <div key={t.id} className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-accent/40 transition-colors">
                                <Checkbox
                                  id={`tgt-${t.id}`}
                                  checked={selectedTargetIds.includes(t.id)}
                                  onCheckedChange={() => toggleTarget(t.id)}
                                  className="h-3 w-3"
                                />
                                <label htmlFor={`tgt-${t.id}`} className="text-xs cursor-pointer truncate text-muted-foreground">
                                  {t.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Field Units (Live Location) ── */}
          <div className="px-3 py-3 border-b border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Field Units</span>
            </div>

            {/* Share my location toggle (also shows own pin) */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-foreground">Share &amp; show my location</span>
              <Switch
                checked={sharingEnabled}
                onCheckedChange={handleSharingToggle}
                className="scale-90"
              />
            </div>

            {/* GPS error / desktop warning */}
            {gpsError && (
              <div className="flex items-start gap-1.5 mb-3 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-amber-400 leading-tight">{gpsError}</span>
              </div>
            )}

            {/* Team colour legend + per-team/user toggles */}
            {[
              { key: "TEAM1", label: "Team 1", colour: TEAM_COLOURS.TEAM1, users: liveUsersByTeam.TEAM1 },
              { key: "TEAM2", label: "Team 2", colour: TEAM_COLOURS.TEAM2, users: liveUsersByTeam.TEAM2 },
              { key: "PTT",   label: "PTT",    colour: TEAM_COLOURS.PTT,   users: liveUsersByTeam.PTT },
            ].map(({ key, label, colour, users: teamUsers }) => (
              <div key={key} className="mb-2">
                {/* Team header row */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour }} />
                    <span className="text-[11px] font-semibold" style={{ color: colour }}>{label}</span>
                    {teamUsers.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">({teamUsers.length})</span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleTeamVisibility(key)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {hiddenTeams.has(key) ? "Show" : "Hide"}
                  </button>
                </div>

                {/* Per-user rows */}
                {teamUsers.length > 0 && !hiddenTeams.has(key) && (
                  <div className="ml-4 flex flex-col gap-0.5">
                    {teamUsers.map((u) => (
                      <div key={u.userId} className="flex items-center justify-between px-1 py-0.5 rounded hover:bg-accent/30">
                        <span className="text-[11px] text-foreground font-medium truncate">
                          {u.name.toUpperCase()}
                          {u.userId === user?.id && (
                            <span className="ml-1 text-[9px] text-muted-foreground">(you)</span>
                          )}
                        </span>
                        <button
                          onClick={() => toggleUserVisibility(u.userId)}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-2 flex-shrink-0"
                        >
                          {hiddenUsers.has(u.userId) ? "Show" : "Hide"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* No users online in this team */}
                {teamUsers.length === 0 && (
                  <div className="ml-4 text-[10px] text-muted-foreground/50 italic pb-0.5">No units online</div>
                )}
              </div>
            ))}

            {/* Unassigned users */}
            {liveUsersByTeam.unassigned.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-muted-foreground">Unassigned</span>
                    <span className="text-[10px] text-muted-foreground">({liveUsersByTeam.unassigned.length})</span>
                  </div>
                  <button
                    onClick={() => toggleTeamVisibility("null")}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {hiddenTeams.has("null") ? "Show" : "Hide"}
                  </button>
                </div>
                {!hiddenTeams.has("null") && (
                  <div className="ml-4 flex flex-col gap-0.5">
                    {liveUsersByTeam.unassigned.map((u) => (
                      <div key={u.userId} className="flex items-center justify-between px-1 py-0.5 rounded hover:bg-accent/30">
                        <span className="text-[11px] text-foreground font-medium truncate">
                          {u.name.toUpperCase()}
                          {u.userId === user?.id && (
                            <span className="ml-1 text-[9px] text-muted-foreground">(you)</span>
                          )}
                        </span>
                        <button
                          onClick={() => toggleUserVisibility(u.userId)}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-2 flex-shrink-0"
                        >
                          {hiddenUsers.has(u.userId) ? "Show" : "Hide"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Legend ── */}
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Legend</p>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-600 border border-white shadow-sm flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Target registered address</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-purple-700 border border-white shadow-sm flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Observed location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ background: TEAM_COLOURS.TEAM1 }} />
              <span className="text-xs text-muted-foreground">Team 1 unit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: TEAM_COLOURS.TEAM2 }} />
              <span className="text-xs text-muted-foreground">Team 2 unit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: TEAM_COLOURS.PTT }} />
              <span className="text-xs text-muted-foreground">PTT unit</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Map Area ── */}
      <div className="flex-1 relative" onClick={handleMapAreaClick}>

        {/* Collapsed panel arrow tab — positioned on left edge, vertically centred, above map type controls */}
        {!sidebarOpen && (
          <button
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
            className="absolute left-0 z-10 flex items-center justify-center bg-card border border-l-0 border-border shadow-md hover:bg-accent transition-colors"
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              width: "20px",
              height: "56px",
              borderRadius: "0 6px 6px 0",
            }}
            title="Open Map Settings"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}

        {/* Loading overlay */}
        {locsLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="h-8 w-8" />
              <p className="text-sm text-muted-foreground">Loading intelligence locations…</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!locsLoading && locations && locations.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-card border border-border rounded-xl px-8 py-6 shadow-lg text-center max-w-xs">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No locations to display</p>
              <p className="text-xs text-muted-foreground">
                {selectedOpIds.length > 0 || selectedTargetIds.length > 0
                  ? "No locations found for the selected filters."
                  : "Select operations or targets in Map Settings to show locations on the map."}
              </p>
            </div>
          </div>
        )}

        <MapView
          onMapReady={handleMapReady}
          className="w-full h-full"
          initialCenter={{ lat: -31.9505, lng: 115.8605 }}
          initialZoom={11}
        />

        {/* RS Actions pane toggle tab — right edge, vertically centred */}
        {!rsActionsPaneOpen && (
          <button
            onClick={(e) => { e.stopPropagation(); setRsActionsPaneOpen(true); }}
            className="absolute right-0 z-10 flex items-center justify-center bg-card border border-r-0 border-border shadow-md hover:bg-accent transition-colors"
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              width: "20px",
              height: "56px",
              borderRadius: "6px 0 0 6px",
            }}
            title="Open RS Actions"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── RS Actions Right Pane ── */}
      <div
        className={`flex flex-col border-l border-border bg-card transition-all duration-200 ${
          rsActionsPaneOpen ? "w-80 min-w-[20rem]" : "w-0 min-w-0 overflow-hidden"
        }`}
      >
        {/* Pane Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">RS Actions</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRsActionsPaneOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Pane Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Step 1: Choose Operation */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">1. Choose Operation</p>
            <Select
              value={rsSelectedOpId !== null ? String(rsSelectedOpId) : ""}
              onValueChange={(val) => {
                setRsSelectedOpId(Number(val));
                setRsSelectedSheetId(null);
                setRsLastEntry(null);
              }}
            >
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue placeholder="Select operation…" />
              </SelectTrigger>
              <SelectContent>
                {(operations ?? []).map((op: any) => (
                  <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Choose Running Sheet */}
          {rsSelectedOpId !== null && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">2. Choose Running Sheet</p>
              <Select
                value={rsSelectedSheetId !== null ? String(rsSelectedSheetId) : ""}
                onValueChange={(val) => {
                  setRsSelectedSheetId(Number(val));
                  setRsLastEntry(null);
                }}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="Select running sheet…" />
                </SelectTrigger>
                <SelectContent>
                  {(rsSheetsData ?? []).filter((s: any) => !s.closedAt && !s.deletedAt).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.title || `Sheet #${s.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Target details + shortcuts */}
          {rsSelectedSheetId !== null && (
            <div className="space-y-3">
              {/* Target info strip */}
              {rsTargetData && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Target</p>
                  <p className="text-sm font-semibold text-foreground">{rsTargetData.name}</p>
                  {rsTargetData.tgt && <p className="text-xs text-muted-foreground">TGT: {rsTargetData.tgt}</p>}
                </div>
              )}

              {/* Separator */}
              <div className="border-t border-border" />

              {/* DEP shortcut */}
              {rsTargetData?.dep && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-orange-500/15 text-orange-500 rounded px-1.5 py-0.5 mb-1">DEP</span>
                      <p className="text-xs text-foreground font-mono leading-snug">{rsTargetData.dep}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8 gap-1.5 text-xs"
                    disabled={rsAddingRow}
                    onClick={() => addQuickRsEntry(rsTargetData!.dep!)}
                  >
                    {rsAddingRow ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    Add DEP Entry
                  </Button>
                </div>
              )}

              {/* ARR shortcut */}
              {rsTargetData?.arr && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-green-500/15 text-green-500 rounded px-1.5 py-0.5 mb-1">ARR</span>
                      <p className="text-xs text-foreground font-mono leading-snug">{rsTargetData.arr}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8 gap-1.5 text-xs"
                    disabled={rsAddingRow}
                    onClick={() => addQuickRsEntry(rsTargetData!.arr!)}
                  >
                    {rsAddingRow ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    Add ARR Entry
                  </Button>
                </div>
              )}

              {/* No target or no DEP/ARR */}
              {!rsTargetData && (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">No target linked to this running sheet.</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">DEP and ARR shortcuts require a target with those fields set.</p>
                </div>
              )}
              {rsTargetData && !rsTargetData.dep && !rsTargetData.arr && (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">Target has no DEP or ARR values set.</p>
                </div>
              )}

              {/* Other Entry shortcut — always shown once sheet is selected */}
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="mb-2">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-blue-500/15 text-blue-400 rounded px-1.5 py-0.5 mb-1">OTHER</span>
                  <p className="text-xs text-muted-foreground">Records a timestamped entry with the text \"Other entry\" in the observation column.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 gap-1.5 text-xs"
                  disabled={rsAddingRow}
                  onClick={() => addQuickRsEntry("Other entry")}
                >
                  {rsAddingRow ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  Add Other Entry
                </Button>
              </div>

              {/* Last entry confirmation */}
              {rsLastEntry && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-green-400 mb-0.5">Last Entry Added</p>
                  <p className="text-xs font-mono text-foreground">{rsLastEntry.time}</p>
                  <p className="text-xs text-muted-foreground truncate">{rsLastEntry.label}</p>
                </div>
              )}

              {/* Link to full RS */}
              <button
                onClick={() => setLocation(`/sheet/${rsSelectedSheetId}`)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <ArrowLeft className="h-3 w-3 rotate-180" />
                Open full running sheet
              </button>
            </div>
          )}

          {/* Placeholder when nothing selected */}
          {rsSelectedOpId === null && (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
              <ClipboardList className="h-10 w-10 text-muted-foreground/25" />
              <p className="text-sm text-muted-foreground">Select an operation and running sheet to use quick RS shortcuts.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Quick-Link Banner ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-1 px-2 py-1.5"
        style={{
          background: "rgba(15,17,23,0.88)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Permanent: Home */}
        <button
          onClick={() => setLocation("/")}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all min-w-[52px]"
        >
          <Home className="h-4 w-4 text-white/80" />
          <span className="text-[10px] font-semibold text-white/70 leading-none">Home</span>
        </button>

        <div className="w-px h-6 bg-white/10 mx-0.5" />

        {/* Permanent: Operations */}
        <button
          onClick={() => setLocation("/")}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all min-w-[52px]"
        >
          <FolderOpen className="h-4 w-4 text-blue-400" />
          <span className="text-[10px] font-semibold text-blue-300/80 leading-none">Operations</span>
        </button>

        <div className="w-px h-6 bg-white/10 mx-0.5" />

        {/* 4 flexible quick-link slots */}
        {quickLinks.slice(0, 4).map((ql, idx) => (
          <button
            key={idx}
            onClick={() => setLocation(ql.path)}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all min-w-[52px]"
          >
            <FolderSearch className="h-4 w-4 text-white/60" />
            <span className="text-[10px] font-medium text-white/55 leading-none truncate max-w-[56px]">{ql.label}</span>
          </button>
        ))}

        <div className="w-px h-6 bg-white/10 mx-0.5" />

        {/* Edit button */}
        <button
          onClick={() => setEditingQuickLinks(true)}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all min-w-[44px]"
          title="Customise quick links"
        >
          <Pencil className="h-3.5 w-3.5 text-white/40" />
          <span className="text-[10px] text-white/35 leading-none">Edit</span>
        </button>
      </div>

      {/* ── Quick-Link Editor Modal ── */}
      {editingQuickLinks && (
        <div
          className="absolute inset-0 z-30 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={() => setEditingQuickLinks(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">Customise Quick Links</p>
                <p className="text-xs text-muted-foreground mt-0.5">Choose up to 4 folders for the map banner</p>
              </div>
              <button
                onClick={() => setEditingQuickLinks(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {ALL_QUICK_LINK_OPTIONS.map((opt) => {
                const isSelected = quickLinks.some(q => q.path === opt.path);
                return (
                  <button
                    key={opt.path}
                    onClick={() => {
                      setQuickLinks(prev => {
                        let next: QuickLink[];
                        if (isSelected) {
                          next = prev.filter(q => q.path !== opt.path);
                        } else if (prev.length < 4) {
                          next = [...prev, opt];
                        } else {
                          // Replace last slot
                          next = [...prev.slice(0, 3), opt];
                        }
                        localStorage.setItem(LS_QUICK_LINKS_KEY, JSON.stringify(next));
                        return next;
                      });
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      isSelected
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-accent/30 border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    }`}
                  >
                    <FolderSearch className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground/60 mt-3 text-center">
              {quickLinks.length}/4 slots used — Home and Operations are always shown
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
