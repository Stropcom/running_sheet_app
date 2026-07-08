import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
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
}

interface LiveUser {
  userId: number;
  name: string;
  team: "TEAM1" | "TEAM2" | "PTT" | null;
  lat: number;
  lng: number;
  operationIds: number[];
  updatedAt: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const TEAM_COLOURS: Record<string, string> = {
  TEAM1: "#e91e8c", // magenta
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

  // Location sharing state
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [showOwnLocation, setShowOwnLocation] = useState(true);
  // Per-user visibility: Set of userIds that are hidden
  const [hiddenUsers, setHiddenUsers] = useState<Set<number>>(new Set());
  // Per-team visibility: Set of team keys that are hidden
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set());
  // GPS error
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Whether device supports geolocation
  const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // Map state
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const liveMarkersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
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

  // Live user locations — poll every 15 seconds
  const { data: liveUsers } = trpc.intelligence.userLocations.useQuery(
    { operationIds: selectedOpIds },
    { refetchInterval: 15000, enabled: true }
  );

  // Restore sharing state on mount
  const { data: myLocationState } = trpc.intelligence.myLocationState.useQuery();
  useEffect(() => {
    if (myLocationState) {
      setSharingEnabled(myLocationState.sharingEnabled);
    }
  }, [myLocationState]);

  // Mutations
  const updateLocationMut = trpc.intelligence.updateUserLocation.useMutation();
  const clearLocationMut = trpc.intelligence.clearUserLocation.useMutation();

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
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          operationIds: selectedOpIds,
          sharingEnabled: true,
        });
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, [selectedOpIds, updateLocationMut]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearLocationMut.mutate();
  }, [clearLocationMut]);

  const handleSharingToggle = (checked: boolean) => {
    setSharingEnabled(checked);
    if (checked) {
      if (!isMobile) {
        setGpsError("Location sharing is designed for mobile devices. Your desktop location may be inaccurate.");
      }
      startWatching();
    } else {
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
    const initials = label.split(" ").map(w => w[0]).join("").slice(0, 2);

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;`;

    const pin = document.createElement("div");
    pin.style.cssText = `
      min-width:36px;height:36px;
      border-radius:18px 18px 18px 0;
      transform:rotate(-45deg);
      background:${color};
      border:2px solid #fff;
      box-shadow:0 2px 10px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      padding:0 6px;
    `;

    const inner = document.createElement("div");
    inner.style.cssText = `transform:rotate(45deg);color:#fff;font-size:10px;font-weight:800;line-height:1;white-space:nowrap;letter-spacing:0.03em;`;
    inner.textContent = initials;
    pin.appendChild(inner);

    // Name label below pin
    const nameTag = document.createElement("div");
    nameTag.style.cssText = `
      margin-top:2px;
      background:${color};
      color:#fff;
      font-size:9px;
      font-weight:700;
      padding:1px 5px;
      border-radius:3px;
      white-space:nowrap;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      letter-spacing:0.04em;
    `;
    nameTag.textContent = label;

    el.appendChild(pin);
    el.appendChild(nameTag);
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
      infoWindowRef.current.setContent(buildInfoWindowContent(loc));
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

    // Remove markers for users no longer visible
    const visibleIds = new Set(visibleUsers.map(u => u.userId));
    Array.from(liveMarkersRef.current.entries()).forEach(([uid, marker]) => {
      if (!visibleIds.has(uid)) {
        marker.map = null;
        liveMarkersRef.current.delete(uid);
      }
    });

    // Add/update markers for visible users
    for (const liveUser of visibleUsers) {
      const existing = liveMarkersRef.current.get(liveUser.userId);
      if (existing) {
        existing.position = { lat: liveUser.lat, lng: liveUser.lng };
      } else {
        const pinEl = createUserPinElement(liveUser);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: liveUser.lat, lng: liveUser.lng },
          content: pinEl,
          title: liveUser.name.toUpperCase(),
          zIndex: 999,
        });
        liveMarkersRef.current.set(liveUser.userId, marker);
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

  return (
    <div className="flex w-full overflow-hidden" style={{ height: "calc(100vh - 0px)" }}>
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

            {/* Share my location toggle */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-foreground">Share my location</span>
              <Switch
                checked={sharingEnabled}
                onCheckedChange={handleSharingToggle}
                className="scale-90"
              />
            </div>

            {/* GPS error / desktop warning */}
            {gpsError && (
              <div className="flex items-start gap-1.5 mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-amber-400 leading-tight">{gpsError}</span>
              </div>
            )}

            {/* Show own location toggle (only when sharing) */}
            {sharingEnabled && (
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">Show my pin</span>
                <Switch
                  checked={showOwnLocation}
                  onCheckedChange={setShowOwnLocation}
                  className="scale-90"
                />
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
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: TEAM_COLOURS.TEAM1 }} />
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
      </div>
    </div>
  );
}
