import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMarkerDataUrl, getMarkerSvg, MARKER_COLOURS, MARKER_COLOUR_LABELS, MARKER_ICON_GROUPS, MARKER_ICON_LABELS, type MarkerColour, type MarkerIcon } from "@/lib/markerSvgs";
import { convertGoogleAddresses } from "@/lib/addressFormat";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Send,
  Zap,
  Scale,
  ArrowRightLeft,
  Trash2,
  WifiOff,
  User,
  Network,
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

// Icon component + colour for each quick-link option
const ICON_MAP: Record<string, { Icon: React.ComponentType<{ className?: string }>; colour: string }> = {
  ClipboardCheck: { Icon: ClipboardCheck, colour: "text-purple-400" },
  CalendarDays:   { Icon: CalendarDays,   colour: "text-cyan-400" },
  Zap:            { Icon: Zap,            colour: "text-yellow-400" },
  FolderSearch:   { Icon: FolderSearch,   colour: "text-violet-400" },
  BookOpen:       { Icon: BookOpen,       colour: "text-rose-400" },
  ScrollText:     { Icon: ScrollText,     colour: "text-slate-400" },
  FileText:       { Icon: FileText,       colour: "text-orange-400" },
  Trash2:         { Icon: Trash2,         colour: "text-red-400" },
  HelpCircle:     { Icon: HelpCircle,     colour: "text-sky-400" },
  User:           { Icon: User,           colour: "text-lime-400" },
  FolderOpen:     { Icon: FolderOpen,     colour: "text-teal-400" },
  Scale:          { Icon: Scale,          colour: "text-amber-400" },
  ClipboardList:  { Icon: ClipboardList,  colour: "text-amber-400" },
  ArrowRightLeft: { Icon: ArrowRightLeft, colour: "text-teal-400" },
  Network:        { Icon: Network,        colour: "text-emerald-400" },
  WifiOff:        { Icon: WifiOff,        colour: "text-orange-400" },
};

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
  { label: "Operation Mgmt", path: "/operation-management", icon: "ArrowRightLeft" },
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
const LS_MAP_SETTINGS_KEY = "runlog_map_settings";

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
  const accentColor = isTarget ? "#dc2626" : "#7c3aed";
  const typeLabel = isTarget ? "TARGET ADDRESS" : "OBSERVED LOCATION";

  const lines: string[] = [];

  // Type badge + label
  lines.push(`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <span style="background:${accentColor};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${typeLabel}</span>
    </div>
    <strong style="font-size:13px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${loc.label}</strong>
  `);

  // Linked target details (for target_address)
  if (isTarget && loc.linkedTargets.length > 0) {
    for (const t of loc.linkedTargets) {
      lines.push(`<div style="margin-top:6px;padding:6px 8px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;">`);
      lines.push(`<div style="font-size:12px;font-weight:700;color:#111;margin-bottom:2px;">${t.name}</div>`);
      if (t.tgt) lines.push(`<div style="font-size:11px;color:#444;margin-bottom:1px;">TGT: ${t.tgt}</div>`);
      if (t.hbf) lines.push(`<div style="font-size:11px;color:#555;margin-bottom:1px;">HBF: ${t.hbf}</div>`);
      if (t.v1f) lines.push(`<div style="font-size:11px;color:#555;margin-bottom:1px;">V1F: ${t.v1f}</div>`);
      if (t.v2f) lines.push(`<div style="font-size:11px;color:#555;margin-bottom:1px;">V2F: ${t.v2f}</div>`);
      if (t.operationName) lines.push(`<div style="font-size:10px;color:#888;margin-top:2px;">Op: ${t.operationName}</div>`);
      lines.push(`</div>`);
    }
  }

  // Linked targets (for observation)
  if (!isTarget && loc.linkedTargets.length > 0) {
    lines.push(`<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Linked Targets</span>`);
    for (const t of loc.linkedTargets) {
      lines.push(`<div style="font-size:12px;color:#111;padding:1px 0;">${t.name}</div>`);
    }
    lines.push(`</div>`);
  }

  // Associated persons
  if (loc.assocPersons.length > 0) {
    lines.push(`<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Persons</span><p style="font-size:12px;color:#111;margin:2px 0 0">${loc.assocPersons.join(", ")}</p></div>`);
  }

  // Associated vehicles
  if (loc.assocVehicles.length > 0) {
    lines.push(`<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Vehicles</span><p style="font-size:12px;color:#111;margin:2px 0 0">${loc.assocVehicles.join(", ")}</p></div>`);
  }

  // Action buttons row
  const btnRow: string[] = [];
  if (loc.lat != null && loc.lng != null) {
    const lat = loc.lat;
    const lng = loc.lng;
    btnRow.push(`<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="font-size:11px;padding:4px 10px;background:#00bcd4;color:#fff;border-radius:4px;text-decoration:none">Waze</a>`);
    btnRow.push(`<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="font-size:11px;padding:4px 10px;background:#4285f4;color:#fff;border-radius:4px;text-decoration:none">Street View</a>`);
  }
  if (isTarget && loc.linkedTargets.length > 0) {
    for (const t of loc.linkedTargets) {
      btnRow.push(`<button onclick="window.__editTargetFromMap(${t.targetId})" style="font-size:11px;padding:4px 10px;background:#16a34a;color:#fff;border-radius:4px;border:none;cursor:pointer">Edit ${t.name}</button>`);
    }
  } else if (!isTarget) {
    const encodedLabel = encodeURIComponent(loc.label);
    btnRow.push(`<a href="/intelligence/location/${encodedLabel}" style="font-size:11px;padding:4px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none">View Profile</a>`);
  }
  if (btnRow.length > 0) {
    lines.push(`<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${btnRow.join("")}</div>`);
  }

  return `<div style="font-family:sans-serif;max-width:260px;color:#111">${lines.join("")}</div>`;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IntelligenceMapping() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Filter state — persisted in localStorage
  const [selectedOpIds, setSelectedOpIds] = useState<number[]>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).selectedOpIds ?? []; } catch { /* ignore */ } return [];
  });
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).selectedTargetIds ?? []; } catch { /* ignore */ } return [];
  });
  const [opExpanded, setOpExpanded] = useState<Set<number>>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return new Set<number>(JSON.parse(s).opExpanded ?? []); } catch { /* ignore */ } return new Set();
  });
  // Left pane starts closed — user opens it when needed. Never auto-open on navigation.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Per-device ID — tab-unique, stored in sessionStorage so each browser tab gets its own ID.
  // This is critical: two tabs logged in as the same user must have different deviceIds so
  // the receiving tab can see the sharing tab's pin without its own sharing being on.
  const [deviceId] = useState<string>(() => {
    const ssKey = `runlog_tab_device_id`;
    const existing = sessionStorage.getItem(ssKey);
    if (existing) return existing;
    const newId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try { sessionStorage.setItem(ssKey, newId); } catch { /* ignore */ }
    return newId;
  });
  // Keep a ref so GPS callbacks always use the latest value
  // (deviceId is now stable for the tab lifetime, but ref is still needed for the GPS callbacks)
  // No server query needed — the ID is generated client-side per tab.

  // Location sharing state — read from localStorage immediately so the toggle shows the right state
  // before the server query resolves. The server query will confirm/correct it on mount.
  const [sharingEnabled, setSharingEnabled] = useState<boolean>(() => {
    try {
      const key = `runlog_sharing_u${typeof window !== 'undefined' ? (localStorage.getItem('runlog_last_user_id') ?? 'anon') : 'anon'}`;
      const v = localStorage.getItem(key);
      return v === 'true';
    } catch { return false; }
  });
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

  // RS Actions pane state — persisted in localStorage
  const [rsActionsPaneOpen, setRsActionsPaneOpen] = useState(false);
  const [rsSelectedOpId, setRsSelectedOpId] = useState<number | null>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).rsSelectedOpId ?? null; } catch { /* ignore */ } return null;
  });
  const [rsSelectedSheetId, setRsSelectedSheetId] = useState<number | null>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).rsSelectedSheetId ?? null; } catch { /* ignore */ } return null;
  });
  const [rsAddingRow, setRsAddingRow] = useState(false);
  const [rsLastEntry, setRsLastEntry] = useState<{ label: string; time: string } | null>(null);

  // Inline observation field state
  const [rsInlineLabel, setRsInlineLabel] = useState<string | null>(null); // null = closed
  const [rsInlineText, setRsInlineText] = useState("");
  const [rsInlineCin, setRsInlineCin] = useState<string | null>(null); // selected CIN for the inline entry
  const rsInlineCinRef = useRef<string | null>(null); // ref so mutation callback always sees latest
  const [rsCountdown, setRsCountdown] = useState<number>(30); // countdown seconds
  const rsInlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rsCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rsInlineInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Custom Marker Placement State ────────────────────────────────────────────
  const [placingMarker, setPlacingMarker] = useState(false); // placement mode active
  const [pendingLatLng, setPendingLatLng] = useState<{ lat: number; lng: number } | null>(null);
  // Action chooser: shown on tap-and-hold / right-click before user picks RS Quick Entry or Marker/Intel
  // intelLoc is set when the tap is on an intelligence-derived marker (target address / observation)
  const [actionChooser, setActionChooser] = useState<{ lat: number; lng: number; address: string; intelLoc?: IntelMapLocation } | null>(null);
  // RS Quick Entry from map: shown when user picks "RS Quick Entry" from the action chooser
  const [mapQeOpen, setMapQeOpen] = useState(false);
  const [mapQeAddress, setMapQeAddress] = useState(""); // pre-filled address for the observation
  const [cmLabel, setCmLabel] = useState("");
  const [cmAddress, setCmAddress] = useState("");
  const [cmNote, setCmNote] = useState("");
  const [cmOpId, setCmOpId] = useState<number | null>(null);
  const [cmPersons, setCmPersons] = useState<string[]>([]);
  const [cmVehicles, setCmVehicles] = useState<string[]>([]);
  const [cmIcon, setCmIcon] = useState<MarkerIcon>("house_filled");
  const [cmColour, setCmColour] = useState<MarkerColour>("red");
  const [cmRotation, setCmRotation] = useState(0);
  const [cmPersonInput, setCmPersonInput] = useState("");
  const [cmVehicleInput, setCmVehicleInput] = useState("");
  const [cmSaving, setCmSaving] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null);
  // Target edit dialog state
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [etName, setEtName] = useState("");
  const [etTgt, setEtTgt] = useState("");
  const [etHbf, setEtHbf] = useState("");
  const [etHb, setEtHb] = useState("");
  const [etV1f, setEtV1f] = useState("");
  const [etV1, setEtV1] = useState("");
  const [etV2f, setEtV2f] = useState("");
  const [etV2, setEtV2] = useState("");
  const [etDep, setEtDep] = useState("");
  const [etArr, setEtArr] = useState("");
  const [etSaving, setEtSaving] = useState(false);
  // ref for long-press on mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // custom marker map objects
  const customMarkersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());

  // Map state
  const [mapReady, setMapReady] = useState(false);
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

  // Persist map settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(LS_MAP_SETTINGS_KEY, JSON.stringify({
        selectedOpIds,
        selectedTargetIds,
        opExpanded: Array.from(opExpanded),
        rsSelectedOpId,
        rsSelectedSheetId,
      }));
    } catch { /* ignore */ }
  }, [selectedOpIds, selectedTargetIds, opExpanded, rsSelectedOpId, rsSelectedSheetId]);

  // Persist sharing state and current userId so it can be read before auth resolves
  useEffect(() => {
    try {
      if (user?.id) {
        localStorage.setItem('runlog_last_user_id', String(user.id));
        const key = `runlog_sharing_u${user.id}`;
        localStorage.setItem(key, String(sharingEnabled));
      }
    } catch { /* ignore */ }
  }, [sharingEnabled, user?.id]);

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

  // Mutations — declared early so refs are available to GPS effects below
  const updateLocationMut = trpc.intelligence.updateUserLocation.useMutation();
  const clearLocationMut = trpc.intelligence.clearUserLocation.useMutation();
  const updateLocationMutRef = useRef(updateLocationMut);
  const clearLocationMutRef = useRef(clearLocationMut);
  useEffect(() => { updateLocationMutRef.current = updateLocationMut; });
  useEffect(() => { clearLocationMutRef.current = clearLocationMut; });

  // Custom map markers — poll every 5 seconds
  // Pass operationIds filter but also always fetch null-op markers so manually placed
  // markers without an operation are never hidden by the filter.
  const { data: customMarkers, refetch: refetchCustomMarkers } = trpc.customMarker.list.useQuery(
    { operationIds: undefined }, // always fetch all; filter display in UI if needed
    { refetchInterval: 5000, enabled: true }
  );
  const createCustomMarkerMut = trpc.customMarker.create.useMutation({
    onSuccess: () => { void refetchCustomMarkers(); },
  });
  const deleteCustomMarkerMut = trpc.customMarker.delete.useMutation({
    onSuccess: () => { void refetchCustomMarkers(); },
  });
  const updateCustomMarkerMut = trpc.customMarker.update.useMutation({
    onSuccess: () => { void refetchCustomMarkers(); },
  });
  const utils = trpc.useUtils();
  const updateTargetMut = trpc.target.registry.update.useMutation({
    onSuccess: () => {
      void utils.target.registry.list.invalidate();
      void utils.intelligence.mappingLocations.invalidate();
      setEditingTargetId(null);
      setEtSaving(false);
      toast.success("Target saved");
    },
    onError: (e) => { setEtSaving(false); toast.error(e.message); },
  });

  // Intelligence entities for associate/vehicle dropdowns
  const { data: intelEntities } = trpc.intelligence.getEntities.useQuery();
  const assocPersonOptions = useMemo(() => {
    if (!intelEntities) return [];
    return (intelEntities as any[]).filter((e: any) => e.type === "person").map((e: any) => e.label as string);
  }, [intelEntities]);
  const vehicleOptions = useMemo(() => {
    if (!intelEntities) return [];
    return (intelEntities as any[]).filter((e: any) => e.type === "vehicle").map((e: any) => e.label as string);
  }, [intelEntities]);

  // Restore sharing state on mount (per-device)
  const { data: myLocationState } = trpc.intelligence.myLocationState.useQuery(
    { deviceId },
    { enabled: !!deviceId }
  );

  // On mount: if localStorage says sharing was on, start GPS immediately
  // (before server query resolves) so the pin appears without delay.
  const gpsStartedFromCacheRef = useRef(false);
  useEffect(() => {
    if (sharingEnabled && !gpsStartedFromCacheRef.current) {
      gpsStartedFromCacheRef.current = true;
      startWatching();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  // Server reconciliation: once myLocationState arrives, reconcile DB with local intent.
  const sharingRestoredRef = useRef(false);
  useEffect(() => {
    if (!myLocationState || sharingRestoredRef.current) return;
    sharingRestoredRef.current = true;

    const serverSharingOn = myLocationState.sharingEnabled;
    const localSharingOn = sharingEnabled;

    if (serverSharingOn && !localSharingOn) {
      // Stale DB row (browser closed without cleanup) — clear it
      clearLocationMutRef.current.mutate({ deviceId: deviceIdRef.current });
    } else if (localSharingOn && watchIdRef.current === null) {
      // GPS watcher died somehow — restart it
      startWatching();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocationState]);

  // showOwnLocation always mirrors sharingEnabled (single toggle)
  const showOwnLocation = sharingEnabled;

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
  const rsAddMember = trpc.member.add.useMutation();

  const rsCreateRow = trpc.row.create.useMutation();

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
  // Keep refs for values used inside watchPosition callback so the callback
  // always sees the latest deviceId and selectedOpIds without needing to
  // re-register the watcher.
  const deviceIdRef = useRef(deviceId);
  const selectedOpIdsRef = useRef(selectedOpIds);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
  useEffect(() => { selectedOpIdsRef.current = selectedOpIds; }, [selectedOpIds]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported on this device.");
      return;
    }
    // Clear any existing watcher before starting a new one
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        updateLocationMutRef.current.mutate({
          deviceId: deviceIdRef.current,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          operationIds: selectedOpIdsRef.current,
          sharingEnabled: true,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }, []); // no deps — uses refs only

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearLocationMutRef.current.mutate({ deviceId: deviceIdRef.current });
  }, []); // no deps — uses refs only

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

  // ── Click-outside to close panels ──────────────────────────────────────────
  const handleMapAreaClick = useCallback(() => {
    if (sidebarOpen) setSidebarOpen(false);
    if (rsActionsPaneOpen) setRsActionsPaneOpen(false);
  }, [sidebarOpen, rsActionsPaneOpen]);

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
    const colour = isTarget ? "red" : "purple" as "red" | "purple";
    const count = loc.linkCount;

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;`;

    const img = document.createElement("img");
    img.src = getMarkerDataUrl("house_filled", colour);
    img.style.cssText = `width:40px;height:40px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));display:block;`;
    el.appendChild(img);

    if (count > 0) {
      const badge = document.createElement("div");
      badge.style.cssText = `
        position:absolute;top:-4px;right:-4px;
        background:${isTarget ? "#dc2626" : "#7c3aed"};
        color:#fff;font-size:10px;font-weight:700;
        min-width:16px;height:16px;
        border-radius:8px;padding:0 3px;
        display:flex;align-items:center;justify-content:center;
        border:1.5px solid #fff;
        box-shadow:0 1px 3px rgba(0,0,0,0.3);
      `;
      badge.textContent = String(count);
      el.appendChild(badge);
    }
    return el;
  }, []);

  const createUserPinElement = useCallback((liveUser: LiveUser) => {
    const color = getTeamColour(liveUser.team);
    const label = liveUser.name.toUpperCase();
    // Motion: speed > 0.5 m/s = moving (green underline), otherwise stopped (grey underline)
    const isMoving = liveUser.speed != null && liveUser.speed > 0.5;
    const underlineColor = isMoving ? "#22c55e" : "#9ca3af";

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;`;

    // Pill-shaped name tag — slightly smaller than before
    const pill = document.createElement("div");
    pill.style.cssText = `
      position:relative;
      display:inline-flex;
      align-items:center;
      background:${color};
      color:#fff;
      font-size:10px;
      font-weight:800;
      padding:3px 10px 5px 10px;
      border-radius:20px;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.40);
      letter-spacing:0.06em;
      border:1.5px solid rgba(255,255,255,0.60);
      overflow:hidden;
    `;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = label;
    nameSpan.style.cssText = `position:relative;z-index:1;`;

    // Thin underline at the bottom of the pill indicating motion state
    const underline = document.createElement("div");
    underline.style.cssText = `
      position:absolute;
      bottom:0;
      left:0;
      right:0;
      height:3px;
      background:${underlineColor};
      border-radius:0 0 20px 20px;
      opacity:0.9;
    `;

    pill.appendChild(nameSpan);
    pill.appendChild(underline);
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
      // Show the two-option action chooser (RS Quick Entry | Intel)
      // The Intel option will open the existing info popup with all data intact
      const enriched = { ...loc, lat: position.lat, lng: position.lng };
      setActionChooser({ lat: position.lat, lng: position.lng, address: loc.label, intelLoc: enriched });
    });
    markersRef.current.push(marker);
  }, [createPinElement, setActionChooser]);

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
    const currentDeviceId = deviceIdRef.current;
    const visibleUsers = (liveUsers as LiveUser[]).filter((u) => {
      // Only hide THIS device's own pin when sharing is off.
      // Same user on a different device (different deviceId) must always show.
      const isThisDevice = u.userId === currentUserId && u.deviceId === currentDeviceId;
      if (isThisDevice && !showOwnLocation) return false;
      // Per-team visibility (manual hide buttons in the team list)
      const teamKey = u.team ?? "null";
      if (hiddenTeams.has(teamKey)) return false;
      // Per-user visibility (manual hide button per user)
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
      try {
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
      } catch (err) {
        console.error('[LiveMarkers] failed to place pin for', liveUser.name, err);
      }
    }
  // mapReady is included so this effect re-runs the moment the map is available,
  // even if liveUsers data arrived before the map was initialised.
  }, [liveUsers, showOwnLocation, hiddenUsers, hiddenTeams, user, createUserPinElement, mapReady]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true); // triggers live marker effect to run now that map is available
    if (locations) {
      renderLocations(locations);
    }
    // Right-click / tap-and-hold: show action chooser (RS Quick Entry or Marker)
    map.addListener("rightclick", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      // Reverse geocode to get address, then show chooser
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        const addr = (status === "OK" && results && results[0]) ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setActionChooser({ lat, lng, address: addr });
      });
    });
  }, [locations, renderLocations]);

  // ── Custom marker rendering ────────────────────────────────────────────────
  const customMarkerMapRefs = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());

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
      }
    });

    // Add / update markers
    incoming.forEach((cm: any) => {
      const dataUrl = getMarkerDataUrl(cm.markerIcon as MarkerIcon, cm.markerColour as MarkerColour);
      const rotation = (cm.rotation ?? 0) as number;
      const el = document.createElement("div");
      el.style.cssText = "width:40px;height:40px;cursor:pointer;";
      const img = document.createElement("img");
      img.src = dataUrl;
      img.style.cssText = `width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));transform:rotate(${rotation}deg);`;
      el.appendChild(img);

      if (existing.has(cm.id)) {
        const m = existing.get(cm.id)!;
        m.position = { lat: cm.lat, lng: cm.lng };
        m.content = el;
      } else {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: cm.lat, lng: cm.lng },
          content: el,
          title: cm.label ?? MARKER_ICON_LABELS[cm.markerIcon as MarkerIcon],
        });
        marker.addListener("click", () => {
          if (!infoWindowRef.current) return;
          const lines: string[] = [];
          if (cm.label) lines.push(`<strong style="font-size:13px;color:#111">${cm.label}</strong>`);
          if (cm.address) lines.push(`<div style="font-size:11px;color:#444;margin-top:2px">${cm.address}</div>`);
          if (cm.note) lines.push(`<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Notes</span><p style="font-size:12px;color:#111;margin:2px 0 0">${cm.note}</p></div>`);
          if (cm.assocPersons?.length) lines.push(`<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Persons</span><p style="font-size:12px;color:#111;margin:2px 0 0">${(cm.assocPersons as string[]).join(", ")}</p></div>`);
          if (cm.assocVehicles?.length) lines.push(`<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Vehicles</span><p style="font-size:12px;color:#111;margin:2px 0 0">${(cm.assocVehicles as string[]).join(", ")}</p></div>`);
          const lat = cm.lat;
          const lng = cm.lng;
          lines.push(`<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="font-size:11px;padding:4px 10px;background:#00bcd4;color:#fff;border-radius:4px;text-decoration:none">Waze</a>
            <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="font-size:11px;padding:4px 10px;background:#4285f4;color:#fff;border-radius:4px;text-decoration:none">Street View</a>
            <button onclick="window.__editCustomMarker(${cm.id})" style="font-size:11px;padding:4px 10px;background:#16a34a;color:#fff;border-radius:4px;border:none;cursor:pointer">Edit</button>
            <button onclick="window.__deleteCustomMarker(${cm.id})" style="font-size:11px;padding:4px 10px;background:#ef4444;color:#fff;border-radius:4px;border:none;cursor:pointer">Delete</button>
          </div>`);
          infoWindowRef.current.setContent(`<div style="font-family:sans-serif;max-width:240px;color:#111">${lines.join("")}</div>`);
          infoWindowRef.current.open(map, marker);
        });
        existing.set(cm.id, marker);
      }
    });
  }, [customMarkers, mapReady]);

  // Global delete handler for custom marker info window
  useEffect(() => {
    (window as any).__deleteCustomMarker = async (id: number) => {
      infoWindowRef.current?.close();
      try {
        await deleteCustomMarkerMut.mutateAsync({ id });
        toast.success("Marker deleted");
      } catch {
        toast.error("Failed to delete marker");
      }
    };
    return () => { delete (window as any).__deleteCustomMarker; };
  }, [deleteCustomMarkerMut]);

  // Global edit handler for target-address markers
  useEffect(() => {
    (window as any).__editTargetFromMap = (targetId: number) => {
      infoWindowRef.current?.close();
      const t = (allTargets as any[] | undefined)?.find((t: any) => t.id === targetId);
      if (!t) return;
      setEtName(t.name ?? "");
      setEtTgt(t.tgt ?? "");
      setEtHbf(t.hbf ?? "");
      setEtHb(t.hb ?? "");
      setEtV1f(t.v1f ?? "");
      setEtV1(t.v1 ?? "");
      setEtV2f(t.v2f ?? "");
      setEtV2(t.v2 ?? "");
      setEtDep(t.dep ?? "");
      setEtArr(t.arr ?? "");
      setEditingTargetId(targetId);
    };
    return () => { delete (window as any).__editTargetFromMap; };
  }, [allTargets]);

  // Global edit handler for custom marker info window
  useEffect(() => {
    (window as any).__editCustomMarker = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkers as any[] | undefined)?.find((m: any) => m.id === id);
      if (!cm) return;
      // Pre-fill all form fields with existing marker data
      setCmIcon((cm.markerIcon as MarkerIcon) ?? "house_filled");
      setCmColour((cm.markerColour as MarkerColour) ?? "red");
      setCmRotation(cm.rotation ?? 0);
      setCmLabel(cm.label ?? "");
      setCmAddress(cm.address ?? "");
      setCmNote(cm.note ?? "");
      setCmOpId(cm.operationId ?? null);
      setCmPersons(Array.isArray(cm.assocPersons) ? cm.assocPersons : []);
      setCmVehicles(Array.isArray(cm.assocVehicles) ? cm.assocVehicles : []);
      setCmPersonInput("");
      setCmVehicleInput("");
      setEditingMarkerId(id);
      // Use the marker's lat/lng as the "pending" position to open the form panel
      setPendingLatLng({ lat: cm.lat, lng: cm.lng });
    };
    return () => { delete (window as any).__editCustomMarker; };
  }, [customMarkers]);

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
  // Helper: start/restart the 30-second countdown + auto-submit timer
  const startInlineCountdown = () => {
    // Clear existing timers
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current) clearInterval(rsCountdownIntervalRef.current);
    // Reset countdown display
    setRsCountdown(30);
    // Tick every second
    rsCountdownIntervalRef.current = setInterval(() => {
      setRsCountdown(prev => {
        if (prev <= 1) {
          if (rsCountdownIntervalRef.current) clearInterval(rsCountdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    // Auto-submit after 30 s
    rsInlineTimerRef.current = setTimeout(() => {
      submitInlineField();
    }, 30000);
  };

  const closeInlineField = () => {
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current) clearInterval(rsCountdownIntervalRef.current);
    setRsInlineLabel(null);
    setRsInlineText("");
    setRsInlineCin(null);
    rsInlineCinRef.current = null;
    setRsCountdown(30);
  };

  const submitInlineField = () => {
    if (!rsInlineLabel) return;
    const finalText = rsInlineText.trim() ? `${rsInlineLabel} — ${rsInlineText.trim()}` : rsInlineLabel;
    // Capture CIN BEFORE closeInlineField clears the ref
    const cinToAttach = rsInlineCinRef.current;
    closeInlineField();
    addQuickRsEntry(finalText, cinToAttach);
  };

  const resetInlineTimer = () => {
    startInlineCountdown();
  };

  const openInlineField = (label: string) => {
    if (!rsSelectedSheetId) return;
    setRsInlineLabel(label);
    setRsInlineText("");
    setRsInlineCin(null);
    rsInlineCinRef.current = null;
    // Focus the textarea after render
    setTimeout(() => rsInlineInputRef.current?.focus(), 50);
    // Start auto-submit countdown
    startInlineCountdown();
  };

  const addQuickRsEntry = (observation: string, cinToAttach?: string | null) => {
    if (!rsSelectedSheetId) return;
    const now = new Date();
    const h24 = now.getHours();
    const min = now.getMinutes();
    const totalMins = h24 * 60 + min;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
    setRsAddingRow(true);
    // Store the CIN in a local variable captured by the mutation callback
    const cin = cinToAttach ?? null;
    rsCreateRow.mutate(
      { sheetId: rsSelectedSheetId, time: timeStr, timeMinutes: totalMins, observation },
      {
        onSuccess: (data, vars) => {
          const now2 = new Date();
          const h24b = now2.getHours();
          const minb = now2.getMinutes();
          const timeStr2 = `${String(h24b % 12 === 0 ? 12 : h24b % 12).padStart(2, "0")}:${String(minb).padStart(2, "0")} ${h24b < 12 ? "AM" : "PM"}`;
          setRsLastEntry({ label: vars.observation ?? "Entry", time: timeStr2 });
          setRsAddingRow(false);
          // Attach the CIN if one was selected — use the locally captured variable, not the ref
          if (cin && (data as any)?.id) {
            rsAddMember.mutate({ rowId: (data as any).id, memberName: cin });
          }
          toast.success("RS entry added");
        },
        onError: (e) => {
          setRsAddingRow(false);
          toast.error(e.message);
        },
      }
    );
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

        {/* Placement mode indicator */}
        {placingMarker && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none">
            Tap &amp; hold to place marker
          </div>
        )}

        <div
          className="w-full h-full"
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
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
              geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                const addr = (status === "OK" && results && results[0]) ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                setActionChooser({ lat, lng, address: addr });
              });
            }, 600);
          }}
          onTouchEnd={() => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          }}
          onTouchMove={() => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          }}
        >
          <MapView
            onMapReady={handleMapReady}
            className="w-full h-full"
            initialCenter={{ lat: -31.9505, lng: 115.8605 }}
            initialZoom={11}
          />
        </div>

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

        {/* Pane Body — compact layout */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" onClick={() => { if (rsInlineLabel) closeInlineField(); }}>

          {/* Step 1 + 2: selectors in a compact stack */}
          <div className="space-y-2">
            <Select
              value={rsSelectedOpId !== null ? String(rsSelectedOpId) : ""}
              onValueChange={(val) => {
                setRsSelectedOpId(Number(val));
                setRsSelectedSheetId(null);
                setRsLastEntry(null);
              }}
            >
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="1. Choose operation…" />
              </SelectTrigger>
              <SelectContent>
                {(operations ?? []).map((op: any) => (
                  <SelectItem key={op.id} value={String(op.id)} className="text-xs">{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {rsSelectedOpId !== null && (
              <Select
                value={rsSelectedSheetId !== null ? String(rsSelectedSheetId) : ""}
                onValueChange={(val) => {
                  setRsSelectedSheetId(Number(val));
                  setRsLastEntry(null);
                }}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="2. Choose running sheet…" />
                </SelectTrigger>
                <SelectContent>
                  {(rsSheetsData ?? []).filter((s: any) => !s.closedAt && !s.deletedAt).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-xs">{s.title || `Sheet #${s.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Sheet selected — show actions */}
          {rsSelectedSheetId !== null && (
            <div className="space-y-2">
              {/* Sheet link + target strip in one compact row */}
              <div className="flex items-center gap-2">
                {rsSheetsData && (() => {
                  const sheet = (rsSheetsData as any[]).find((s: any) => s.id === rsSelectedSheetId);
                  return sheet ? (
                    <button
                      onClick={() => setLocation(`/sheet/${rsSelectedSheetId}`)}
                      className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors min-w-0"
                    >
                      <MapIcon className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-primary truncate">{sheet.title || `Sheet #${sheet.id}`}</span>
                    </button>
                  ) : null;
                })()}
                {rsTargetData && (
                  <div className="flex-shrink-0 rounded-md border border-border bg-muted/30 px-2 py-1">
                    <p className="text-[10px] font-bold text-foreground leading-none">{rsTargetData.tgt ?? rsTargetData.name}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-border" />

              {/* DEP / ARR — shown if target has them */}
              {(rsTargetData?.dep || rsTargetData?.arr) && (
                <div className="grid grid-cols-2 gap-1.5">
                  {rsTargetData?.dep && (
                    <button
                      disabled={rsAddingRow}
                      onClick={() => {
                        if (rsInlineLabel === rsTargetData!.dep!) {
                          closeInlineField();
                        } else {
                          openInlineField(rsTargetData!.dep!);
                        }
                      }}
                      className={`flex flex-col items-start gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 active:scale-95 transition-all px-2.5 py-2 disabled:opacity-50 ${rsInlineLabel === rsTargetData!.dep! ? "ring-1 ring-orange-400" : ""}`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wide text-orange-400">DEP</span>
                      <span className="text-[10px] text-foreground font-mono leading-tight line-clamp-2">{rsTargetData.dep}</span>
                    </button>
                  )}
                  {rsTargetData?.arr && (
                    <button
                      disabled={rsAddingRow}
                      onClick={() => {
                        if (rsInlineLabel === rsTargetData!.arr!) {
                          closeInlineField();
                        } else {
                          openInlineField(rsTargetData!.arr!);
                        }
                      }}
                      className={`flex flex-col items-start gap-0.5 rounded-md border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 active:scale-95 transition-all px-2.5 py-2 disabled:opacity-50 ${rsInlineLabel === rsTargetData!.arr! ? "ring-1 ring-green-400" : ""}`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wide text-green-400">ARR</span>
                      <span className="text-[10px] text-foreground font-mono leading-tight line-clamp-2">{rsTargetData.arr}</span>
                    </button>
                  )}
                </div>
              )}

              {/* No target / no DEP+ARR notice */}
              {!rsTargetData && (
                <p className="text-[11px] text-muted-foreground text-center py-1">No target linked — DEP/ARR unavailable.</p>
              )}

              {/* Inline observation field — shown when a quick action button is tapped */}
              {rsInlineLabel && (() => {
                // Parse roster CINs from the selected sheet
                const selectedSheet = (rsSheetsData as any[] | undefined)?.find((s: any) => s.id === rsSelectedSheetId);
                const rosterCins: string[] = [];
                if (selectedSheet?.sheetCins) {
                  try {
                    const parsed: Array<{ cin: string; isTeamLeader?: boolean }> = typeof selectedSheet.sheetCins === "string"
                      ? JSON.parse(selectedSheet.sheetCins)
                      : selectedSheet.sheetCins;
                    parsed
                      .sort((a, b) => (b.isTeamLeader ? 1 : 0) - (a.isTeamLeader ? 1 : 0))
                      .forEach(c => { if (c.cin) rosterCins.push(c.cin); });
                  } catch { /* ignore */ }
                }
                return (
                  <div
                    className="rounded-lg border border-border bg-muted/40 p-2.5 flex flex-col gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{rsInlineLabel}</span>
                      <button onClick={closeInlineField} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <textarea
                      ref={rsInlineInputRef}
                      value={rsInlineText}
                      onChange={(e) => { setRsInlineText(e.target.value); resetInlineTimer(); }}
                      onFocus={resetInlineTimer}
                      onBlur={() => { /* keep timer running on blur */ }}
                      placeholder="Add details (optional)…"
                      rows={2}
                      className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {/* CIN picker row */}
                    {rosterCins.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rosterCins.map((cin) => (
                          <button
                            key={cin}
                            onClick={() => {
                              const next = rsInlineCin === cin ? null : cin;
                              setRsInlineCin(next);
                              rsInlineCinRef.current = next;
                              resetInlineTimer();
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all active:scale-95 ${
                              rsInlineCin === cin
                                ? "bg-primary/20 border-primary/60 text-primary"
                                : "bg-muted/40 border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            }`}
                          >
                            {cin}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      {/* Countdown ring */}
                      <div className="flex items-center gap-1.5">
                        <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/20" />
                          <circle
                            cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2"
                            strokeDasharray={`${2 * Math.PI * 8}`}
                            strokeDashoffset={`${2 * Math.PI * 8 * (1 - rsCountdown / 30)}`}
                            className={rsCountdown <= 10 ? "text-red-400" : "text-primary"}
                            style={{ transition: "stroke-dashoffset 1s linear" }}
                          />
                        </svg>
                        <span className={`text-[10px] font-mono tabular-nums ${rsCountdown <= 10 ? "text-red-400" : "text-muted-foreground"}`}>{rsCountdown}s</span>
                      </div>
                      <button
                        onClick={submitInlineField}
                        disabled={rsAddingRow}
                        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {rsAddingRow ? <Spinner className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                        Submit
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Quick action buttons — 2-column grid */}
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { label: "Vehicle Arrive",  text: "Vehicle arrive",  colour: "blue" },
                  { label: "Vehicle Depart",  text: "Vehicle depart",  colour: "purple" },
                  { label: "Person Arrive",   text: "Person arrive",   colour: "teal" },
                  { label: "Person Depart",   text: "Person depart",   colour: "rose" },
                  { label: "Other Entry",     text: "Other entry",     colour: "slate" },
                ] as const).map(({ label, text, colour }) => {
                  const colourMap: Record<string, string> = {
                    blue:   "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400",
                    purple: "border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-purple-400",
                    teal:   "border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 text-teal-400",
                    rose:   "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400",
                    slate:  "border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground",
                  };
                  const isActive = rsInlineLabel === text;
                  return (
                    <button
                      key={label}
                      disabled={rsAddingRow}
                      onClick={() => {
                        if (isActive) {
                          closeInlineField();
                        } else {
                          openInlineField(text);
                        }
                      }}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-md border active:scale-95 transition-all px-2 py-2.5 disabled:opacity-50 ${colourMap[colour]} ${isActive ? "ring-1 ring-current" : ""}`}
                    >
                      {rsAddingRow && isActive ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      <span className="text-[10px] font-semibold leading-tight text-center">{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Last entry confirmation */}
              {rsLastEntry && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-green-400 mb-0.5">Last Entry</p>
                  <p className="text-[11px] font-mono text-foreground">{rsLastEntry.time} — {rsLastEntry.label}</p>
                </div>
              )}


            </div>
          )}

          {/* Placeholder when nothing selected */}
          {rsSelectedOpId === null && (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
              <ClipboardList className="h-8 w-8 text-muted-foreground/25" />
              <p className="text-xs text-muted-foreground">Select an operation and running sheet to use quick RS shortcuts.</p>
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
        {/* Permanent: Operations */}
        <button
          onClick={() => setLocation("/")}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all min-w-[52px]"
        >
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="text-[10px] font-semibold text-blue-300/80 leading-none">Operations</span>
        </button>

        <div className="w-px h-6 bg-white/10 mx-0.5" />

        {/* 4 flexible quick-link slots */}
        {quickLinks.slice(0, 4).map((ql, idx) => {
          const iconEntry = ICON_MAP[ql.icon];
          const IconComp = iconEntry?.Icon ?? FolderSearch;
          const iconColour = iconEntry?.colour ?? "text-white/60";
          return (
            <button
              key={idx}
              onClick={() => setLocation(ql.path)}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all min-w-[52px]"
            >
              <IconComp className={`h-4 w-4 ${iconColour}`} />
              <span className="text-[10px] font-medium text-white/55 leading-none truncate max-w-[56px]">{ql.label}</span>
            </button>
          );
        })}

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
                const iconEntry = ICON_MAP[opt.icon];
                const IconComp = iconEntry?.Icon ?? FolderSearch;
                const iconColour = iconEntry?.colour ?? "text-muted-foreground";
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
                    <IconComp className={`h-3.5 w-3.5 flex-shrink-0 ${iconColour}`} />
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

      {/* ── Action Chooser Bottom Sheet ── */}
      {actionChooser && !pendingLatLng && !mapQeOpen && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => setActionChooser(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Address preview */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Tapped Location</p>
                <p className="text-sm font-semibold text-foreground leading-snug">{actionChooser.address}</p>
              </div>
              <button onClick={() => setActionChooser(null)} className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* RS Quick Entry — always shown */}
              <button
                onClick={() => {
                  setMapQeAddress(convertGoogleAddresses(actionChooser.address));
                  setMapQeOpen(true);
                  setActionChooser(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all px-4 py-5"
              >
                <ClipboardList className="h-7 w-7 text-primary" />
                <span className="text-sm font-bold text-foreground">RS Quick Entry</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Add a running sheet entry for this location</span>
              </button>

              {/* Intel — shown for intelligence-derived markers (target address / observation) */}
              {actionChooser.intelLoc ? (
                <button
                  onClick={() => {
                    const enriched = actionChooser.intelLoc!;
                    if (!infoWindowRef.current) {
                      infoWindowRef.current = new google.maps.InfoWindow();
                    }
                    infoWindowRef.current.setContent(buildInfoWindowContent(enriched));
                    infoWindowRef.current.setPosition({ lat: enriched.lat!, lng: enriched.lng! });
                    infoWindowRef.current.open(mapRef.current!);
                    setActionChooser(null);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 active:scale-95 transition-all px-4 py-5 ${
                    actionChooser.intelLoc.type === "target_address"
                      ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
                      : "border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/10"
                  }`}
                >
                  <FolderSearch className={`h-7 w-7 ${actionChooser.intelLoc.type === "target_address" ? "text-red-500" : "text-purple-500"}`} />
                  <span className="text-sm font-bold text-foreground">Intel</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    {actionChooser.intelLoc.type === "target_address" ? "View target address info" : "View observed location info"}
                  </span>
                </button>
              ) : (
                /* Marker — shown for blank map taps */
                <button
                  onClick={() => {
                    const { lat, lng, address } = actionChooser;
                    setCmLabel(""); setCmAddress(address); setCmNote(""); setCmPersons([]); setCmVehicles([]); setCmRotation(0);
                    setCmPersonInput(""); setCmVehicleInput("");
                    // Pre-fill operation from the active filter so the marker appears in the list
                    setCmOpId(selectedOpIds.length === 1 ? selectedOpIds[0] : (rsSelectedOpId ?? null));
                    setPendingLatLng({ lat, lng });
                    setActionChooser(null);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
                >
                  <MapPin className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">Marker</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">Place a custom map marker here</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Map RS Quick Entry Modal ── */}
      {mapQeOpen && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => { setMapQeOpen(false); setMapQeAddress(""); closeInlineField(); }}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">RS Quick Entry</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{mapQeAddress}</p>
              </div>
              <button onClick={() => { setMapQeOpen(false); setMapQeAddress(""); closeInlineField(); }} className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* No sheet selected warning */}
            {rsSelectedSheetId === null ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-center">
                <p className="text-xs font-semibold text-amber-400 mb-1">No running sheet selected</p>
                <p className="text-[11px] text-muted-foreground">Select an operation and running sheet in the right panel first, then tap &amp; hold the map again.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Sheet + target strip */}
                <div className="flex items-center gap-2">
                  {rsSheetsData && (() => {
                    const sheet = (rsSheetsData as any[]).find((s: any) => s.id === rsSelectedSheetId);
                    return sheet ? (
                      <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-primary/30 bg-primary/5 min-w-0">
                        <MapIcon className="h-3 w-3 text-primary flex-shrink-0" />
                        <span className="text-[11px] font-semibold text-primary truncate">{sheet.title || `Sheet #${sheet.id}`}</span>
                      </div>
                    ) : null;
                  })()}
                  {rsTargetData && (
                    <div className="flex-shrink-0 rounded-md border border-border bg-muted/30 px-2 py-1">
                      <p className="text-[10px] font-bold text-foreground leading-none">{rsTargetData.tgt ?? rsTargetData.name}</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border" />

                {/* DEP / ARR */}
                {(rsTargetData?.dep || rsTargetData?.arr) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {rsTargetData?.dep && (
                      <button
                        disabled={rsAddingRow}
                        onClick={() => {
                          const obs = `${rsTargetData!.dep!} — ${mapQeAddress}`;
                          if (rsInlineLabel === obs) { closeInlineField(); } else { openInlineField(obs); }
                        }}
                        className={`flex flex-col items-start gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 active:scale-95 transition-all px-2.5 py-2 disabled:opacity-50 ${rsInlineLabel?.startsWith(rsTargetData!.dep!) ? "ring-1 ring-orange-400" : ""}`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wide text-orange-400">DEP</span>
                        <span className="text-[10px] text-foreground font-mono leading-tight line-clamp-2">{rsTargetData.dep}</span>
                      </button>
                    )}
                    {rsTargetData?.arr && (
                      <button
                        disabled={rsAddingRow}
                        onClick={() => {
                          const obs = `${rsTargetData!.arr!} — ${mapQeAddress}`;
                          if (rsInlineLabel === obs) { closeInlineField(); } else { openInlineField(obs); }
                        }}
                        className={`flex flex-col items-start gap-0.5 rounded-md border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 active:scale-95 transition-all px-2.5 py-2 disabled:opacity-50 ${rsInlineLabel?.startsWith(rsTargetData!.arr!) ? "ring-1 ring-green-400" : ""}`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wide text-green-400">ARR</span>
                        <span className="text-[10px] text-foreground font-mono leading-tight line-clamp-2">{rsTargetData.arr}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Inline observation field */}
                {rsInlineLabel && (() => {
                  const selectedSheet = (rsSheetsData as any[] | undefined)?.find((s: any) => s.id === rsSelectedSheetId);
                  const rosterCins: string[] = [];
                  if (selectedSheet?.sheetCins) {
                    try {
                      const parsed: Array<{ cin: string; isTeamLeader?: boolean }> = typeof selectedSheet.sheetCins === "string"
                        ? JSON.parse(selectedSheet.sheetCins)
                        : selectedSheet.sheetCins;
                      parsed.sort((a, b) => (b.isTeamLeader ? 1 : 0) - (a.isTeamLeader ? 1 : 0)).forEach(c => { if (c.cin) rosterCins.push(c.cin); });
                    } catch { /* ignore */ }
                  }
                  return (
                    <div className="rounded-lg border border-border bg-muted/40 p-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{rsInlineLabel}</span>
                        <button onClick={closeInlineField} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <textarea
                        ref={rsInlineInputRef}
                        value={rsInlineText}
                        onChange={(e) => { setRsInlineText(e.target.value); resetInlineTimer(); }}
                        onFocus={resetInlineTimer}
                        placeholder="Add details (optional)…"
                        rows={2}
                        className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      {rosterCins.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rosterCins.map((cin) => (
                            <button key={cin} onClick={() => { const next = rsInlineCin === cin ? null : cin; setRsInlineCin(next); rsInlineCinRef.current = next; resetInlineTimer(); }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all active:scale-95 ${rsInlineCin === cin ? "bg-primary/20 border-primary/60 text-primary" : "bg-muted/40 border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
                              {cin}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/20" />
                            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2"
                              strokeDasharray={`${2 * Math.PI * 8}`}
                              strokeDashoffset={`${2 * Math.PI * 8 * (1 - rsCountdown / 30)}`}
                              className={rsCountdown <= 10 ? "text-red-400" : "text-primary"}
                              style={{ transition: "stroke-dashoffset 1s linear" }}
                            />
                          </svg>
                          <span className={`text-[10px] font-mono tabular-nums ${rsCountdown <= 10 ? "text-red-400" : "text-muted-foreground"}`}>{rsCountdown}s</span>
                        </div>
                        <button onClick={submitInlineField} disabled={rsAddingRow}
                          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50">
                          {rsAddingRow ? <Spinner className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                          Submit
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Quick action buttons */}
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { label: "Vehicle Arrive",  text: "Vehicle arrive",  colour: "blue" },
                    { label: "Vehicle Depart",  text: "Vehicle depart",  colour: "purple" },
                    { label: "Person Arrive",   text: "Person arrive",   colour: "teal" },
                    { label: "Person Depart",   text: "Person depart",   colour: "rose" },
                    { label: "Other Entry",     text: "Other entry",     colour: "slate" },
                  ] as const).map(({ label, text, colour }) => {
                    const colourMap: Record<string, string> = {
                      blue:   "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400",
                      purple: "border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-purple-400",
                      teal:   "border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 text-teal-400",
                      rose:   "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400",
                      slate:  "border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground",
                    };
                    // Pre-append address to the observation text
                    const obsText = `${text} — ${mapQeAddress}`;
                    const isActive = rsInlineLabel === obsText;
                    return (
                      <button key={label} disabled={rsAddingRow}
                        onClick={() => { if (isActive) { closeInlineField(); } else { openInlineField(obsText); } }}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-md border active:scale-95 transition-all px-2 py-2.5 disabled:opacity-50 ${colourMap[colour]} ${isActive ? "ring-1 ring-current" : ""}`}>
                        {rsAddingRow && isActive ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        <span className="text-[10px] font-semibold leading-tight text-center">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Last entry confirmation */}
                {rsLastEntry && (
                  <div className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-green-400 mb-0.5">Last Entry</p>
                    <p className="text-[11px] font-mono text-foreground">{rsLastEntry.time} — {rsLastEntry.label}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Custom Marker Placement Modal ── */}
      {pendingLatLng && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => { setPendingLatLng(null); setEditingMarkerId(null); }}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">{editingMarkerId ? "Edit Map Marker" : "Place Map Marker"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}
                </p>
              </div>
              <button onClick={() => { setPendingLatLng(null); setEditingMarkerId(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 0. Address — shown at top so user can verify before filling other fields */}
            <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Address</p>
              <input
                type="text"
                value={cmAddress}
                onChange={(e) => setCmAddress(e.target.value)}
                placeholder="Auto-filled from coordinates…"
                className="w-full text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* 1. Icon picker */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Marker Icon</p>
              <div className="space-y-3">
                {MARKER_ICON_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] text-muted-foreground/70 mb-1.5">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.icons.map((iconKey) => (
                        <button
                          key={iconKey}
                          onClick={() => setCmIcon(iconKey as MarkerIcon)}
                          title={MARKER_ICON_LABELS[iconKey as MarkerIcon]}
                          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                            cmIcon === iconKey
                              ? "border-primary bg-primary/10 scale-110"
                              : "border-border bg-accent/30 hover:border-primary/50"
                          }`}
                        >
                          <img
                            src={getMarkerDataUrl(iconKey as MarkerIcon, cmColour)}
                            alt={MARKER_ICON_LABELS[iconKey as MarkerIcon]}
                            className="w-7 h-7 object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Colour picker */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Colour</p>
              <div className="flex gap-2">
                {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map((col) => (
                  <button
                    key={col}
                    onClick={() => setCmColour(col)}
                    title={MARKER_COLOUR_LABELS[col]}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      cmColour === col ? "border-foreground scale-110" : "border-transparent hover:border-foreground/40"
                    }`}
                    style={{ background: MARKER_COLOURS[col] }}
                  />
                ))}
              </div>
            </div>

            {/* 3. Rotation */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rotation — {cmRotation}°</p>
              <div className="flex items-center gap-3">
                {/* Rotated preview */}
                <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                  <img
                    src={getMarkerDataUrl(cmIcon, cmColour)}
                    alt="preview"
                    className="w-8 h-8 object-contain transition-transform"
                    style={{ transform: `rotate(${cmRotation}deg)` }}
                  />
                </div>
                {/* Slider */}
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={cmRotation}
                  onChange={(e) => setCmRotation(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                {/* Quick preset buttons */}
                <div className="flex gap-1">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setCmRotation(deg)}
                      title={`${deg}°`}
                      className={`w-6 h-6 text-[9px] rounded border transition-all ${
                        cmRotation === deg ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      {deg === 0 ? "N" : deg === 45 ? "NE" : deg === 90 ? "E" : deg === 135 ? "SE" : deg === 180 ? "S" : deg === 225 ? "SW" : deg === 270 ? "W" : "NW"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Label */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Location / Business Name</label>
              <input
                type="text"
                value={cmLabel}
                onChange={(e) => setCmLabel(e.target.value)}
                placeholder="e.g. Target address, coffee shop..."
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* 5. Operation */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Operation</label>
              <Select
                value={cmOpId !== null ? String(cmOpId) : ""}
                onValueChange={(v) => setCmOpId(v ? Number(v) : null)}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select operation..." />
                </SelectTrigger>
                <SelectContent>
                  {(operations as any[] | undefined)?.map((op: any) => (
                    <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 6. Person(s) */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Person(s) it relates to</label>
              <div className="flex gap-2 mb-1.5">
                <input
                  type="text"
                  value={cmPersonInput}
                  onChange={(e) => setCmPersonInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && cmPersonInput.trim()) {
                      setCmPersons(prev => [...prev, cmPersonInput.trim()]);
                      setCmPersonInput("");
                    }
                  }}
                  list="cm-person-list"
                  placeholder="Type name or select..."
                  className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <datalist id="cm-person-list">
                  {assocPersonOptions.map((p) => <option key={p} value={p} />)}
                </datalist>
                <button
                  onClick={() => { if (cmPersonInput.trim()) { setCmPersons(prev => [...prev, cmPersonInput.trim()]); setCmPersonInput(""); } }}
                  className="px-3 py-2 text-xs bg-primary/20 text-primary rounded-md hover:bg-primary/30"
                >Add</button>
              </div>
              {cmPersons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cmPersons.map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-accent/50 border border-border rounded-full px-2.5 py-1">
                      {p}
                      <button onClick={() => setCmPersons(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 7. Vehicle(s) */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Vehicle(s) it relates to</label>
              <div className="flex gap-2 mb-1.5">
                <input
                  type="text"
                  value={cmVehicleInput}
                  onChange={(e) => setCmVehicleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && cmVehicleInput.trim()) {
                      setCmVehicles(prev => [...prev, cmVehicleInput.trim()]);
                      setCmVehicleInput("");
                    }
                  }}
                  list="cm-vehicle-list"
                  placeholder="Type rego/description or select..."
                  className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <datalist id="cm-vehicle-list">
                  {vehicleOptions.map((v) => <option key={v} value={v} />)}
                </datalist>
                <button
                  onClick={() => { if (cmVehicleInput.trim()) { setCmVehicles(prev => [...prev, cmVehicleInput.trim()]); setCmVehicleInput(""); } }}
                  className="px-3 py-2 text-xs bg-primary/20 text-primary rounded-md hover:bg-primary/30"
                >Add</button>
              </div>
              {cmVehicles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cmVehicles.map((v, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-accent/50 border border-border rounded-full px-2.5 py-1">
                      {v}
                      <button onClick={() => setCmVehicles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 8. Notes */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
              <Textarea
                value={cmNote}
                onChange={(e) => setCmNote(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setPendingLatLng(null); setEditingMarkerId(null); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={cmSaving}
                onClick={async () => {
                  if (!pendingLatLng) return;
                  setCmSaving(true);
                  try {
                    if (editingMarkerId !== null) {
                      // Update existing marker
                      await updateCustomMarkerMut.mutateAsync({
                        id: editingMarkerId,
                        markerIcon: cmIcon,
                        markerColour: cmColour,
                        rotation: cmRotation,
                        label: cmLabel.trim() || null,
                        address: cmAddress.trim() || null,
                        note: cmNote.trim() || null,
                        operationId: cmOpId,
                        assocPersons: cmPersons,
                        assocVehicles: cmVehicles,
                      });
                      toast.success("Marker updated");
                    } else {
                      // Create new marker
                      await createCustomMarkerMut.mutateAsync({
                        lat: pendingLatLng.lat,
                        lng: pendingLatLng.lng,
                        markerIcon: cmIcon,
                        markerColour: cmColour,
                        rotation: cmRotation,
                        label: cmLabel.trim() || null,
                        address: cmAddress.trim() || null,
                        note: cmNote.trim() || null,
                        operationId: cmOpId,
                        assocPersons: cmPersons,
                        assocVehicles: cmVehicles,
                      });
                      toast.success("Marker placed");
                    }
                    setPendingLatLng(null);
                    setEditingMarkerId(null);
                    setCmRotation(0);
                  } catch {
                    toast.error(editingMarkerId !== null ? "Failed to update marker" : "Failed to save marker");
                  } finally {
                    setCmSaving(false);
                  }
                }}
              >
                {cmSaving ? <Spinner className="h-4 w-4" /> : editingMarkerId !== null ? "Save Changes" : "Place Marker"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Target Edit Dialog ── */}
      <Dialog open={editingTargetId !== null} onOpenChange={(open) => { if (!open) setEditingTargetId(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Target</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {([
              { label: "Full Name, Born", val: etName, set: setEtName },
              { label: "Target (TGT)", val: etTgt, set: setEtTgt },
              { label: "Home Address Full (HBF)", val: etHbf, set: setEtHbf },
              { label: "Home (HB)", val: etHb, set: setEtHb },
              { label: "Vehicle 1 Full (V1F)", val: etV1f, set: setEtV1f },
              { label: "Vehicle (V1)", val: etV1, set: setEtV1 },
              { label: "Vehicle 2 Full (V2F)", val: etV2f, set: setEtV2f },
              { label: "Vehicle (V2)", val: etV2, set: setEtV2 },
              { label: "Depart (DEP)", val: etDep, set: setEtDep },
              { label: "Arrive (ARR)", val: etArr, set: setEtArr },
            ] as { label: string; val: string; set: (v: string) => void }[]).map(({ label, val, set }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
                <Input value={val} onChange={e => set(e.target.value)} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTargetId(null)}>Cancel</Button>
            <Button
              disabled={etSaving}
              onClick={() => {
                if (!editingTargetId) return;
                setEtSaving(true);
                updateTargetMut.mutate({
                  id: editingTargetId,
                  name: etName || undefined,
                  tgt: etTgt || null,
                  hbf: etHbf || null,
                  hb: etHb || null,
                  v1f: etV1f || null,
                  v1: etV1 || null,
                  v2f: etV2f || null,
                  v2: etV2 || null,
                  dep: etDep || null,
                  arr: etArr || null,
                });
              }}
            >
              {etSaving ? <Spinner className="h-4 w-4" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
