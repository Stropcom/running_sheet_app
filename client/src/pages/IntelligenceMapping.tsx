import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMarkerDataUrl, getMarkerSvg, MARKER_COLOURS, MARKER_COLOUR_LABELS, MARKER_ICON_GROUPS, MARKER_ICON_LABELS, type MarkerColour, type MarkerIcon } from "@/lib/markerSvgs";
import { convertGoogleAddresses, buildPoiAddress, formatIntelAddress } from "@/lib/addressFormat";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  Search,
  LocateFixed,
  Navigation2,
  ExternalLink,
  Shield,
  Users,
  ShieldCheck,
  Settings,
  UserCog,
  LayoutGrid,
  FolderOpen as FolderIcon,
  Clock,
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
  /** Observation intel locations that were absorbed into this target_address pin at the same geocoded position */
  secondaryLocs?: IntelMapLocation[];
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
  { label: "Governance", path: "/governance", icon: "ClipboardCheck" },
  { label: "Calendar", path: "/calendar", icon: "CalendarDays" },
];

// Key → nav item mapping (mirrors DashboardLayout SortableNavItem)
const NAV_KEY_MAP: Record<string, { path: string; Icon: React.ComponentType<{ className?: string }>; label: string; iconColor: string }> = {
  operations:       { path: "/",                    Icon: FileText,      label: "Operations",     iconColor: "text-cyan-500" },
  governance:       { path: "/governance",           Icon: ClipboardCheck, label: "Governance",     iconColor: "text-purple-500" },
  todo:             { path: "/todo",                 Icon: ClipboardList,  label: "To-Do",          iconColor: "text-rose-500" },
  mapping:          { path: "/intelligence/mapping", Icon: MapIcon,        label: "Mapping",        iconColor: "text-teal-500" },
  calendar:         { path: "/calendar",             Icon: CalendarDays,   label: "Calendar",       iconColor: "text-orange-500" },
  shortcuts:        { path: "/shortcuts",            Icon: Zap,            label: "Shortcuts",      iconColor: "text-yellow-500" },
  intelligence:     { path: "/intelligence",         Icon: FolderSearch,   label: "Intelligence",   iconColor: "text-violet-500" },
  targetRegistry:   { path: "/target-registry",      Icon: BookOpen,       label: "Target Registry",iconColor: "text-rose-400" },
  operationManager: { path: "/operation-manager",    Icon: ClipboardList,  label: "Op Manager",     iconColor: "text-purple-500" },
};

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

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "poi.park", elementType: "labels.text.stroke", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

function buildInfoWindowContent(loc: IntelMapLocation): string {
  const isTarget = loc.type === "target_address";
  const accentColor = isTarget ? "#dc2626" : "#7c3aed";
  const typeLabel = isTarget ? "TARGET ADDRESS" : "OBSERVED LOCATION";
  const displayLabel = formatIntelAddress(loc.label);
  const encodedLabel = encodeURIComponent(loc.label);

  // Load persisted appearance for this intel pin from localStorage
  let intelIcon: string = "house_filled";
  let intelColour: string = isTarget ? "red" : "purple";
  let intelRotation: number = 0;
  try {
    const stored = localStorage.getItem(`runlog_intel_appearance_${loc.label}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.icon) intelIcon = parsed.icon;
      if (parsed.colour) intelColour = parsed.colour;
      if (typeof parsed.rotation === "number") intelRotation = parsed.rotation;
    }
  } catch { /* ignore */ }

  const lines: string[] = [];

  // Type badge + label
  lines.push(`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <span style="background:${accentColor};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${typeLabel}</span>
    </div>
    <strong style="font-size:13px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${displayLabel}</strong>
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

  // ── Action buttons (observed location only — same layout as custom marker popup) ──
  if (!isTarget) {
    const btnBase = "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
    const sections: string[] = [];

    // Rotation slider (at top, above buttons)
    const safeLabel = loc.label.replace(/'/g, "\\'");
    sections.push(`
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img id="intel-popup-preview-${encodedLabel}" src="data:image/svg+xml;base64,${btoa(getMarkerSvg(intelIcon as any, intelColour as any))}" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;transform:rotate(${intelRotation}deg);transition:transform 0.1s;" />
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Rotation</span>
              <span id="intel-popup-deg-${encodedLabel}" style="font-size:10px;color:#374151;font-weight:600;">${intelRotation}°</span>
            </div>
            <input id="intel-popup-slider-${encodedLabel}" type="range" min="0" max="359" step="1" value="${intelRotation}"
              style="width:100%;accent-color:#6366f1;cursor:pointer;"
              oninput="window.__intelPopupRotate('${safeLabel}', this.value)"
            />
          </div>
        </div>
      </div>
    `);

    // Row 0: RS Quick Entry — full width, indigo
    sections.push(`<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${safeLabel}')" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`);

    // Row 1: View Observation Profile — full width, purple
    sections.push(`<div style="margin-top:5px;"><a href="/intelligence/location/${encodedLabel}" style="${btnBase}background:#7c3aed;color:#fff;font-size:13px;padding:9px 0;">View Observation Profile</a></div>`);

    // Row 2: Waze | Street View
    if (loc.lat != null && loc.lng != null) {
      const lat = loc.lat;
      const lng = loc.lng;
      const navBtns = [
        `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
        `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="${btnBase}background:#4285f4;color:#fff;">Street View</a>`,
      ];
      sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`);
    }

    // Row 3: Edit | Move
    const editBtn = `<button onclick="window.__intelOpenEditDialog('${safeLabel}')" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`;
    const moveBtn = `<button onclick="window.__intelStartMove('${safeLabel}')" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
    sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtn}${moveBtn}</div>`);

    lines.push(sections.join(""));
  } else {
    // Target address: full button set matching observation popup
    const btnBase = "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
    const safeLabel = loc.label.replace(/'/g, "\\'");
    const sections: string[] = [];

    // Rotation slider
    sections.push(`
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img id="intel-popup-preview-${encodedLabel}" src="data:image/svg+xml;base64,${btoa(getMarkerSvg(intelIcon as any, intelColour as any))}" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;transform:rotate(${intelRotation}deg);transition:transform 0.1s;" />
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Rotation</span>
              <span id="intel-popup-deg-${encodedLabel}" style="font-size:10px;color:#374151;font-weight:600;">${intelRotation}\u00b0</span>
            </div>
            <input id="intel-popup-slider-${encodedLabel}" type="range" min="0" max="359" step="1" value="${intelRotation}"
              style="width:100%;accent-color:#6366f1;cursor:pointer;"
              oninput="window.__intelPopupRotate('${safeLabel}', this.value)"
            />
          </div>
        </div>
      </div>
    `);

    // Row 0: RS Quick Entry — full width, indigo
    sections.push(`<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${safeLabel}')" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`);

    // Row 1: Edit Target buttons (one per linked target) — teal
    if (loc.linkedTargets.length > 0) {
      for (const t of loc.linkedTargets) {
        sections.push(`<div style="margin-top:5px;"><button onclick="window.__editTargetFromMap(${t.targetId})" style="${btnBase}background:#0f766e;color:#fff;border:none;font-size:13px;padding:9px 0;">Edit ${t.name}</button></div>`);
      }
    }

    // Row 2: Waze | Street View
    if (loc.lat != null && loc.lng != null) {
      const lat = loc.lat;
      const lng = loc.lng;
      const navBtns = [
        `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
        `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="${btnBase}background:#4285f4;color:#fff;">Street View</a>`,
      ];
      sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`);
    }

    // Row 3: Edit (appearance) | Move
    const editBtn = `<button onclick="window.__intelOpenEditDialog('${safeLabel}')" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`;
    const moveBtn = `<button onclick="window.__intelStartMove('${safeLabel}')" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
    sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtn}${moveBtn}</div>`);

    lines.push(sections.join(""));
  }

  // ── Secondary (observation) locs absorbed into this target_address pin ──
  if (isTarget && loc.secondaryLocs && loc.secondaryLocs.length > 0) {
    for (const sec of loc.secondaryLocs) {
      const secLabel = formatIntelAddress(sec.label);
      const secEncodedLabel = encodeURIComponent(sec.label);
      const secSafeLabel = sec.label.replace(/'/g, "\\'");

      // Load persisted appearance for secondary pin
      let secIcon: string = "house_filled";
      let secColour: string = "purple";
      let secRotation: number = 0;
      try {
        const stored = localStorage.getItem(`runlog_intel_appearance_${sec.label}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.icon) secIcon = parsed.icon;
          if (parsed.colour) secColour = parsed.colour;
          if (typeof parsed.rotation === "number") secRotation = parsed.rotation;
        }
      } catch { /* ignore */ }

      lines.push(`<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">`);
      lines.push(`
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="background:#7c3aed;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">OBSERVED LOCATION</span>
        </div>
        <strong style="font-size:12px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${secLabel}</strong>
      `);
      if (sec.linkedTargets.length > 0) {
        lines.push(`<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Linked Targets</span>`);
        for (const t of sec.linkedTargets) {
          lines.push(`<div style="font-size:12px;color:#111;padding:1px 0;">${t.name}</div>`);
        }
        lines.push(`</div>`);
      }
      if (sec.assocPersons.length > 0) {
        lines.push(`<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Persons</span><p style="font-size:12px;color:#111;margin:2px 0 0">${sec.assocPersons.join(", ")}</p></div>`);
      }
      if (sec.assocVehicles.length > 0) {
        lines.push(`<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Vehicles</span><p style="font-size:12px;color:#111;margin:2px 0 0">${sec.assocVehicles.join(", ")}</p></div>`);
      }

      // Action buttons for secondary observation (same as standalone observation)
      const secBtnBase = "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
      // Rotation slider
      lines.push(`
        <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #e5e7eb;">
          <div style="display:flex;align-items:center;gap:8px;">
            <img id="intel-popup-preview-${secEncodedLabel}" src="data:image/svg+xml;base64,${btoa(getMarkerSvg(secIcon as any, secColour as any))}" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;transform:rotate(${secRotation}deg);transition:transform 0.1s;" />
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                <span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Rotation</span>
                <span id="intel-popup-deg-${secEncodedLabel}" style="font-size:10px;color:#374151;font-weight:600;">${secRotation}°</span>
              </div>
              <input id="intel-popup-slider-${secEncodedLabel}" type="range" min="0" max="359" step="1" value="${secRotation}"
                style="width:100%;accent-color:#6366f1;cursor:pointer;"
                oninput="window.__intelPopupRotate('${secSafeLabel}', this.value)"
              />
            </div>
          </div>
        </div>
      `);
      lines.push(`<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${secSafeLabel}')" style="${secBtnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`);
      lines.push(`<div style="margin-top:5px;"><a href="/intelligence/location/${secEncodedLabel}" style="${secBtnBase}background:#7c3aed;color:#fff;font-size:13px;padding:9px 0;">View Observation Profile</a></div>`);
      if (sec.lat != null && sec.lng != null) {
        const sLat = sec.lat;
        const sLng = sec.lng;
        lines.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;"><a href="https://waze.com/ul?ll=${sLat},${sLng}&navigate=yes" target="_blank" style="${secBtnBase}background:#00bcd4;color:#fff;">Waze</a><a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sLat},${sLng}" target="_blank" style="${secBtnBase}background:#4285f4;color:#fff;">Street View</a></div>`);
      }
      lines.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;"><button onclick="window.__intelOpenEditDialog('${secSafeLabel}')" style="${secBtnBase}background:#16a34a;color:#fff;border:none;">Edit</button><button onclick="window.__intelStartMove('${secSafeLabel}')" style="${secBtnBase}background:#0369a1;color:#fff;border:none;">Move…</button></div>`);
      lines.push(`</div>`);
    }
  }

  return `<div style="font-family:sans-serif;max-width:280px;color:#111">${lines.join("")}</div>`;
}

// ── Haversine distance helper (metres) ───────────────────────────────────────
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Map Sidebar Nav Component ─────────────────────────────────────────────────
function MapSidebarNav({ user, onNavigate, navOrder }: { user: any; onNavigate: (path: string) => void; navOrder: string[] }) {
  const curPath = window.location.pathname;
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [userMgmtExpanded, setUserMgmtExpanded] = useState(false);
  const [courtExpanded, setCourtExpanded] = useState(false);

  const navBtn = (path: string, Icon: React.ComponentType<{ className?: string }>, label: string, iconColor?: string) => {
    const isActive = path === "/"
      ? curPath === "/" || curPath.startsWith("/operation/") || curPath.startsWith("/sheet/")
      : curPath === path || curPath.startsWith(path);
    return (
      <button
        key={path}
        onClick={() => onNavigate(path)}
        className={`flex items-center gap-3 w-full px-3 py-0 h-14 rounded-xl border text-sm font-medium transition-all shadow-sm ${
          isActive
            ? "bg-accent border-primary/40 text-foreground shadow-md"
            : "bg-card border-border/60 text-foreground/80 hover:bg-accent/60 hover:border-border"
        }`}
      >
        <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor ?? "text-foreground/60"}`} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  const subBtn = (path: string, Icon: React.ComponentType<{ className?: string }>, label: string, extra?: React.ReactNode) => {
    const isActive = curPath === path || curPath.startsWith(path);
    return (
      <button
        key={path}
        onClick={() => onNavigate(path)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors hover:bg-accent/60 rounded-md ${
          isActive ? "bg-accent text-foreground font-medium" : "text-foreground/70"
        }`}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {extra}
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto py-2 px-2 flex flex-col gap-1.5">
      {navOrder.map(key => {
        const item = NAV_KEY_MAP[key];
        if (!item) return null;
        return navBtn(item.path, item.Icon, item.label, item.iconColor);
      })}

      {/* Administration folder */}
      <button
        onClick={() => setAdminExpanded(v => !v)}
        className={`flex items-center gap-3 w-full px-3 h-14 rounded-xl border text-sm font-medium transition-all shadow-sm ${
          adminExpanded ? "bg-accent border-primary/40 text-foreground" : "bg-card border-border/60 text-foreground/80 hover:bg-accent/60"
        }`}
      >
        <Settings className="h-5 w-5 flex-shrink-0 text-slate-500" />
        <span className="flex-1 truncate">Administration</span>
        {adminExpanded ? <ChevronDown className="h-3.5 w-3.5 text-foreground/40" /> : <ChevronRight className="h-3.5 w-3.5 text-foreground/40" />}
      </button>
      {adminExpanded && (
        <div className="ml-4 border-l border-border/50 pl-2 flex flex-col gap-0.5 mb-1">
          {/* Court expandable */}
          <button
            onClick={() => setCourtExpanded(v => !v)}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors hover:bg-accent/60 rounded-md ${
              curPath.startsWith("/court") ? "bg-accent text-foreground font-medium" : "text-foreground/70"
            }`}
          >
            <Scale className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">Court</span>
            {courtExpanded ? <ChevronDown className="h-3 w-3 text-foreground/40" /> : <ChevronRight className="h-3 w-3 text-foreground/40" />}
          </button>
          {courtExpanded && (
            <div className="ml-4 border-l border-border/40 pl-2 flex flex-col gap-0.5 mb-0.5">
              {subBtn("/court/statements", FolderOpen, "Statements")}
              {subBtn("/court/witness-list", FolderOpen, "Witness List")}
              {subBtn("/court/wipc", ShieldCheck, "WIPC", <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 rounded leading-4">🔒</span>)}
            </div>
          )}
          {subBtn("/audit", ScrollText, "Audit Log")}
          {subBtn("/draft", WifiOff, "Draft Mode")}
          {subBtn("/operation-management", ArrowRightLeft, "Archive")}
          {subBtn("/recycle-bin", Trash2, "Recycle Bin")}
          {subBtn("/help", HelpCircle, "Help")}
        </div>
      )}

      {/* User Management folder */}
      <button
        onClick={() => setUserMgmtExpanded(v => !v)}
        className={`flex items-center gap-3 w-full px-3 h-14 rounded-xl border text-sm font-medium transition-all shadow-sm ${
          userMgmtExpanded ? "bg-accent border-primary/40 text-foreground" : "bg-card border-border/60 text-foreground/80 hover:bg-accent/60"
        }`}
      >
        <UserCog className="h-5 w-5 flex-shrink-0 text-blue-500" />
        <span className="flex-1 truncate">User Management</span>
        {userMgmtExpanded ? <ChevronDown className="h-3.5 w-3.5 text-foreground/40" /> : <ChevronRight className="h-3.5 w-3.5 text-foreground/40" />}
      </button>
      {userMgmtExpanded && (
        <div className="ml-4 border-l border-border/50 pl-2 flex flex-col gap-0.5 mb-1">
          {subBtn("/profile", User, "My Profile")}
          {user?.role === "admin" && subBtn("/admin", Users, "Access Management")}
        </div>
      )}
    </div>
  );
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
  // Map position memory — persisted in localStorage
  const [mapInitialCenter, setMapInitialCenter] = useState<google.maps.LatLngLiteral>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) { const p = JSON.parse(s).mapCenter; if (p && typeof p.lat === 'number' && typeof p.lng === 'number') return p; } } catch { /* ignore */ }
    return { lat: -31.9505, lng: 115.8605 };
  });
  const [mapInitialZoom, setMapInitialZoom] = useState<number>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) { const z = JSON.parse(s).mapZoom; if (typeof z === 'number') return z; } } catch { /* ignore */ }
    return 11;
  });

  // Left pane starts closed — user opens it when needed. Never auto-open on navigation.
  // On desktop (lg+), the left pane is always open and resizable
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
  const [sidebarOpen, setSidebarOpen] = useState(() => isDesktop);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try { const s = localStorage.getItem("runlog_map_sidebar_width"); if (s) return Math.max(200, Math.min(480, parseInt(s))); } catch { /* ignore */ } return 256;
  });
  const sidebarResizingRef = useRef(false);
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(256);

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
  // Per-team visibility: Set of team keys that are hidden — persisted
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return new Set<string>(JSON.parse(s).hiddenTeams ?? []); } catch { /* ignore */ } return new Set();
  });
  // Per-team collapsed (members hidden): Set of team keys — persisted
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return new Set<string>(JSON.parse(s).collapsedTeams ?? []); } catch { /* ignore */ } return new Set();
  });
  // RS Quick Entry inline panel open/closed — persisted
  const [rsQeExpanded, setRsQeExpanded] = useState<boolean>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).rsQeExpanded ?? false; } catch { /* ignore */ } return false;
  });
  const [mapDarkMode, setMapDarkMode] = useState<boolean>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).mapDarkMode ?? false; } catch { /* ignore */ } return false;
  });
  // Operations dropdown open state
  const [opsDropdownOpen, setOpsDropdownOpen] = useState(false);
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

  // Draggable side-tab vertical position (percentage from top, 0-100)
  const [leftTabTop, setLeftTabTop] = useState<number>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).leftTabTop ?? 50; } catch { /* ignore */ } return 50;
  });
  const [rightTabTop, setRightTabTop] = useState<number>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) return JSON.parse(s).rightTabTop ?? 50; } catch { /* ignore */ } return 50;
  });
  const leftTabDraggingRef = useRef(false);
  const rightTabDraggingRef = useRef(false);

  // Draggable pill bar vertical position (percentage from top, 5-95)
  const [pillBarTop, setPillBarTop] = useState<number>(() => {
    try { const s = localStorage.getItem(LS_MAP_SETTINGS_KEY); if (s) { const v = JSON.parse(s).pillBarTop; if (typeof v === 'number') return v; } } catch { /* ignore */ } return 90;
  });
  const pillBarDraggingRef = useRef(false);
  const pillBarLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillBarIsDraggingRef = useRef(false);
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
  const [rsInlineCins, setRsInlineCins] = useState<Set<string>>(new Set()); // selected CINs for the inline entry (multi-select)
  const rsInlineCinsRef = useRef<Set<string>>(new Set()); // ref so mutation callback always sees latest
  const [rsCountdown, setRsCountdown] = useState<number>(30); // countdown seconds
  const rsInlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rsCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rsInlineInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Right-pane collapsible RS Quick Entry panel state (separate from modal inline field)
  const [rsQeText, setRsQeText] = useState("");
  const [rsQeCins, setRsQeCins] = useState<Set<string>>(new Set());
  const rsQeInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Custom Marker Placement State ────────────────────────────────────────────
  const [placingMarker, setPlacingMarker] = useState(false); // placement mode active
  const [dismissedNoLocs, setDismissedNoLocs] = useState(false); // user dismissed the empty-state overlay
  const [pendingLatLng, setPendingLatLng] = useState<{ lat: number; lng: number } | null>(null);
  // POI tap: shown when user taps a Google Maps business/POI pin
  const [poiTap, setPoiTap] = useState<{ lat: number; lng: number; name: string; address: string } | null>(null);
  // Action chooser: shown on tap-and-hold / right-click before user picks RS Quick Entry or Marker/Intel
  // intelLoc is set when the tap is on an intelligence-derived marker (target address / observation)
  const [actionChooser, setActionChooser] = useState<{ lat: number; lng: number; address: string; intelLoc?: IntelMapLocation } | null>(null);
  // RS Quick Entry from map: shown when user picks "RS Quick Entry" from the action chooser
  const [mapQeOpen, setMapQeOpen] = useState(false);
  const [mapQeTimeOverride, setMapQeTimeOverride] = useState<string | null>(null); // "HH:MM AM/PM" or null for current time
  const [mapQeHour, setMapQeHour] = useState("12");
  const [mapQeMinute, setMapQeMinute] = useState("00");
  const [mapQePeriod, setMapQePeriod] = useState("AM");
  const [mapQeSelectOpen, setMapQeSelectOpen] = useState(false);
  const [mapQeAddress, setMapQeAddress] = useState(""); // pre-filled address for the observation
  // Quick Entry shortcut chip order — persisted to localStorage so user can reorder them
  const QE_CANONICAL_ORDER = [
    "SC", "HBF",
    ...(Array.from({ length: 8 }, (_, i) => [`V${i + 1}F`, `V${i + 1}`]) as string[][]).flat(),
    "TGT", "DSO", "DR", "FP", "US", "DE", "AR", "CV", "OOS", "COOS", "PU", "PT", "RACK",
    "DEP", "ARR",
    ...(Array.from({ length: 10 }, (_, i) => `#${i + 1}`) as string[]),
  ];
  const [qeChipOrder, setQeChipOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("runlog_qe_chip_order"); if (s) return JSON.parse(s); } catch {} return QE_CANONICAL_ORDER;
  });
  const qeChipDragRef = useRef<{ dragging: string | null; startX: number; startY: number }>({ dragging: null, startX: 0, startY: 0 });
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
  // Address search bar state
  const [addrSearch, setAddrSearch] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [addrSearchOpen, setAddrSearchOpen] = useState(false);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const addrSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSearchPinRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  // Follow-me mode: keeps own tag centred on map
  const [followMode, setFollowMode] = useState(false);
  const followModeRef = useRef(false);
  // Own position ref — updated whenever liveUsers refreshes
  const ownPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  // ref for long-press on mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // custom marker map objects
  const customMarkersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  // Merged intel data: custom marker ID → array of intel locations merged into this marker
  // Multiple intel pins (e.g. target_address + observation) can merge into the same house marker.
  // The array is always sorted with target_address entries first (red takes priority).
  const mergedIntelRef = useRef<Map<number, IntelMapLocation[]>>(new Map());
  // Latest custom markers data ref — kept in sync so placeMarker can access it without stale closure
  const customMarkersDataRef = useRef<any[]>([]);
  // All geocoded intel locations (label → {loc, position, secondaryLocs?}) for manual merge lookup
  const geocodedIntelRef = useRef<Map<string, { loc: IntelMapLocation; position: google.maps.LatLngLiteral; secondaryLocs?: IntelMapLocation[] }>>(new Map());
  // Manual merge picker state: which custom marker is being merged, and nearby intel candidates
  const [manualMergePicker, setManualMergePicker] = useState<{
    cmId: number;
    candidates: Array<{ loc: IntelMapLocation; position: google.maps.LatLngLiteral; distanceM: number }>;
  } | null>(null);

  // Move marker state: which marker is being dragged to a new position
  const [movingMarkerId, setMovingMarkerId] = useState<number | null>(null);
  const [pendingMoveAddress, setPendingMoveAddress] = useState<{ lat: number; lng: number; address: string } | null>(null);

  // Intel pin move state (separate from custom marker move — intel pins are not persisted to DB)
  const [movingIntelLabel, setMovingIntelLabel] = useState<string | null>(null);
  const [pendingIntelMoveAddress, setPendingIntelMoveAddress] = useState<{ lat: number; lng: number; address: string } | null>(null);

  // Intel pin edit dialog state (appearance only — persisted to localStorage)
  const [editingIntelLabel, setEditingIntelLabel] = useState<string | null>(null);
  const [intelEditIcon, setIntelEditIcon] = useState<MarkerIcon>("house_filled");
  const [intelEditColour, setIntelEditColour] = useState<MarkerColour>("purple");
  const [intelEditRotation, setIntelEditRotation] = useState<number>(0);

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
        hiddenTeams: Array.from(hiddenTeams),
        collapsedTeams: Array.from(collapsedTeams),
        rsQeExpanded,
        mapDarkMode,
        leftTabTop,
        rightTabTop,
        pillBarTop,
      }));
    } catch { /* ignore */ }
  }, [selectedOpIds, selectedTargetIds, opExpanded, rsSelectedOpId, rsSelectedSheetId, hiddenTeams, collapsedTeams, rsQeExpanded, mapDarkMode, leftTabTop, rightTabTop, pillBarTop]);

  // Save map center/zoom to localStorage whenever the map stops moving (idle event)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const listener = map.addListener("idle", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (!center || zoom === undefined) return;
      const lat = center.lat();
      const lng = center.lng();
      try {
        const existing = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(LS_MAP_SETTINGS_KEY, JSON.stringify({ ...parsed, mapCenter: { lat, lng }, mapZoom: zoom }));
      } catch { /* ignore */ }
    });
    return () => { google.maps.event.removeListener(listener); };
  }, [mapReady]);

  // Apply dark/light map style whenever mapDarkMode or mapReady changes
  // Dark mode is applied via CSS filter on the map container div (not setOptions — blocked by mapId)

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
  const { data: locations, isLoading: locsLoading, refetch: refetchLocations } = trpc.intelligence.mappingLocations.useQuery({
    operationIds: selectedOpIds.length > 0 ? selectedOpIds : undefined,
    targetIds: selectedTargetIds.length > 0 ? selectedTargetIds : undefined,
  }, { refetchInterval: 30_000 });

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
  // Filter by selected operations so markers are scoped to the active operation.
  // When no operation is selected in Map Settings but an RS pane operation is active,
  // include rsSelectedOpId so custom markers for that operation are visible.
  // Pass empty array only when truly no operation context exists.
  const effectiveOpIdsForMarkers = useMemo(() => {
    if (selectedOpIds.length > 0) return selectedOpIds;
    if (rsSelectedOpId != null) return [rsSelectedOpId];
    return [];
  }, [selectedOpIds, rsSelectedOpId]);
  const { data: customMarkers, refetch: refetchCustomMarkers } = trpc.customMarker.list.useQuery(
    { operationIds: effectiveOpIdsForMarkers },
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
  // General shortcuts for quick entry buttons
  const { data: generalShortcuts } = trpc.shortcuts.list.useQuery();
  // Target shortcuts for the selected sheet's target
  const { data: targetShortcuts } = trpc.targetShortcuts.list.useQuery(
    { targetId: rsTargetData?.id! },
    { enabled: !!rsTargetData?.id }
  );

  // Per-sheet target shortcuts (for RS Quick Entry shortcut expansion)
  const { data: targetShortcutsForSheet } = trpc.targetShortcuts.listForSheet.useQuery(
    { sheetId: rsSelectedSheetId! },
    { enabled: !!rsSelectedSheetId }
  );
  // Assigned target for the selected sheet (for TGT/HBF/HB/V1F/V1/V2F/V2/DEP/ARR shortcuts)
  const { data: assignedTarget } = trpc.target.getById.useQuery(
    { id: rsTargetData?.id ?? 0 },
    { enabled: !!rsTargetData?.id }
  );
  // Combined shortcut map for RS Quick Entry textarea
  const mapQeShortcutMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of (generalShortcuts as any[] ?? [])) map[s.trigger.toLowerCase()] = s.expansion;
    if (assignedTarget) {
      const t = assignedTarget as any;
      if (t.tgt) map['tgt'] = t.tgt;
      if (t.hbf) map['hbf'] = t.hbf;
      if (t.hb)  map['hb']  = t.hb;
      if (t.v1f) map['v1f'] = t.v1f;
      if (t.v1)  map['v1']  = t.v1;
      if (t.v2f) map['v2f'] = t.v2f;
      if (t.v2)  map['v2']  = t.v2;
      if (t.dep) map['dep'] = t.dep;
      if (t.arr) map['arr'] = t.arr;
      // Extra vehicles (V2F/V2, V3F/V3, …)
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(t.extraVehicles ?? '[]');
        evs.forEach((ev: { full: string; short: string }, i: number) => {
          const num = i + 2;
          if (ev.full)  map[`v${num}f`] = ev.full;
          if (ev.short) map[`v${num}`]  = ev.short;
        });
      } catch {}
      // Wild fields (#1, #2, …)
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(t.wildFields ?? '[]');
        wfs.forEach((wf: { label: string; value: string }) => {
          if (wf.value) map[wf.label.toLowerCase()] = wf.value;
        });
      } catch {}
    }
    for (const s of (targetShortcutsForSheet as any[] ?? [])) map[s.trigger.toLowerCase()] = s.expansion;
    return map;
  }, [generalShortcuts, assignedTarget, targetShortcutsForSheet]);

  // Sidebar order (mirrors main menu) for left map pane
  const { data: sidebarOrderData } = trpc.sidebar.getOrder.useQuery(undefined, { staleTime: 30_000 });
  const DEFAULT_MAP_NAV_ORDER = ["operations", "governance", "todo", "mapping", "calendar", "shortcuts", "intelligence", "targetRegistry", "operationManager"];
  const mapNavOrder = useMemo(() => {
    if (!sidebarOrderData?.order?.length) return DEFAULT_MAP_NAV_ORDER;
    const saved = sidebarOrderData.order as string[];
    const merged = [...saved.filter((k: string) => DEFAULT_MAP_NAV_ORDER.includes(k))];
    for (const k of DEFAULT_MAP_NAV_ORDER) { if (!merged.includes(k)) merged.push(k); }
    return merged;
  }, [sidebarOrderData]);

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
    // Collapse the dropdown after each selection (multi-select but auto-close per tap)
    setOpsDropdownOpen(false);
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
  // On desktop the left pane is permanently open — only close it on mobile/tablet
  const handleMapAreaClick = useCallback(() => {
    if (sidebarOpen && !isDesktop) setSidebarOpen(false);
    if (rsActionsPaneOpen) setRsActionsPaneOpen(false);
  }, [sidebarOpen, isDesktop, rsActionsPaneOpen]);

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
        position:absolute;top:-5px;right:-5px;
        background:${isTarget ? "#dc2626" : "#7c3aed"};
        color:#fff;font-size:11px;font-weight:700;
        min-width:18px;height:18px;
        border-radius:9px;padding:0 3px;
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

    // ── Smart merge: only merge/suppress when a HOUSE-type custom marker is within 40m ──
    // Non-house markers (cars, arrows, cameras, etc.) let the intel pin render normally.
    const HOUSE_ICONS: string[] = ["house_outline", "house_filled"];
    const MERGE_RADIUS_M = 40;
    const nearbyHouseCm = customMarkersDataRef.current.find((cm: any) =>
      HOUSE_ICONS.includes(cm.markerIcon) &&
      haversineMetres(position.lat, position.lng, cm.lat, cm.lng) <= MERGE_RADIUS_M
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
          if (a.type === 'target_address' && b.type !== 'target_address') return -1;
          if (a.type !== 'target_address' && b.type === 'target_address') return 1;
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
    if (loc.type === 'observation') {
      const nearbyTargetMarkerIdx = markersRef.current.findIndex((m: any) => {
        const pos = m.position as google.maps.LatLng | google.maps.LatLngLiteral | null;
        if (!pos) return false;
        const mLat = typeof (pos as any).lat === 'function' ? (pos as any).lat() : (pos as any).lat;
        const mLng = typeof (pos as any).lng === 'function' ? (pos as any).lng() : (pos as any).lng;
        // Check if this marker is a target_address intel pin (stored in geocodedIntelRef)
        const entry = geocodedIntelRef.current.get(m.title ?? '');
        return entry?.loc.type === 'target_address' &&
          haversineMetres(position.lat, position.lng, mLat, mLng) <= INTEL_DEDUP_RADIUS_M;
      });

      if (nearbyTargetMarkerIdx !== -1) {
        const targetMarker = markersRef.current[nearbyTargetMarkerIdx];
        const targetEntry = geocodedIntelRef.current.get(targetMarker.title ?? '');
        if (targetEntry) {
          // Merge observation data into the target_address loc
          const merged = targetEntry.loc;
          // Merge assocPersons
          for (const p of loc.assocPersons) {
            if (!merged.assocPersons.includes(p)) merged.assocPersons.push(p);
          }
          // Merge assocVehicles
          for (const v of loc.assocVehicles) {
            if (!merged.assocVehicles.includes(v)) merged.assocVehicles.push(v);
          }
          // Merge linkedTargets
          for (const t of loc.linkedTargets) {
            if (!merged.linkedTargets.find(lt => lt.targetId === t.targetId)) {
              merged.linkedTargets.push(t);
            }
          }
          // Store the observation as a secondary merged entry on the target pin
          if (!targetEntry.secondaryLocs) targetEntry.secondaryLocs = [];
          (targetEntry as any).secondaryLocs.push({ ...loc, lat: position.lat, lng: position.lng });
          // Recompute linkCount and update the badge on the existing marker
          merged.linkCount = merged.linkedTargets.length + merged.assocPersons.length + merged.assocVehicles.length;
          const newPinEl = createPinElement(merged);
          targetMarker.content = newPinEl;
          // Update geocodedIntelRef so the click handler has fresh data
          geocodedIntelRef.current.set(targetMarker.title ?? '', { loc: merged, position: targetEntry.position, secondaryLocs: (targetEntry as any).secondaryLocs });
        }
        return; // suppress the observation pin
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    // Store geocoded position for manual merge lookup (all non-suppressed intel pins)
    geocodedIntelRef.current.set(loc.label, { loc, position });
    // ────────────────────────────────────────────────────────────────────────────────

    const pinEl = createPinElement(loc);
    const marker = new google.maps.marker.AdvancedMarkerElement({
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
      infoWindowRef.current.setContent(buildInfoWindowContent(fullEnriched));
      infoWindowRef.current.setPosition({ lat: position.lat, lng: position.lng });
      infoWindowRef.current.open(mapRef.current!);
    });
    markersRef.current.push(marker);
  }, [createPinElement, buildInfoWindowContent]);

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
      // Check if this was the last item in the queue
      const isLast = geocodeIndexRef.current >= geocodeQueueRef.current.length;
      if (isLast) {
        // Restore persisted linkedIntelLabel merges for custom markers that have one saved
        const allIntel = geocodedIntelRef.current;
        customMarkersDataRef.current.forEach((cm: any) => {
          if (cm.linkedIntelLabel) {
            const entry = allIntel.get(cm.linkedIntelLabel);
            if (entry) {
              const existing = mergedIntelRef.current.get(cm.id) ?? [];
              const enriched = { ...entry.loc, lat: entry.position.lat, lng: entry.position.lng };
              if (!existing.find(e => e.label === enriched.label)) {
                // Remove the intel pin from the map and merge its data into the custom marker
                const pinIdx = markersRef.current.findIndex((m: any) => m.title === cm.linkedIntelLabel);
                if (pinIdx !== -1) {
                  markersRef.current[pinIdx].map = null;
                  markersRef.current.splice(pinIdx, 1);
                }
                existing.push(enriched);
                existing.sort((a, b) => {
                  if (a.type === 'target_address' && b.type !== 'target_address') return -1;
                  if (a.type !== 'target_address' && b.type === 'target_address') return 1;
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
    });
  }, [placeMarker]);

  const renderLocations = useCallback((locs: IntelMapLocation[]) => {
    clearMarkers();
    geocodedIntelRef.current.clear(); // reset geocoded positions so manual merge sees fresh data
    if (!locs || locs.length === 0 || !geocoderRef.current) return;
    geocodeQueueRef.current = locs;
    geocodeIndexRef.current = 0;
    geocodeTimerRef.current = setTimeout(geocodeNext, 200);
  }, [clearMarkers, geocodeNext]);

  // Keep customMarkersDataRef in sync so placeMarker can access latest data without stale closure
  // NOTE: Do NOT call renderLocations here — that would create a loop:
  //   customMarkers changes → renderLocations → geocode → placeMarker stores mergedIntel
  //   → (nothing triggers re-render, but the 5s poll refetches customMarkers) → loop
  // The ref is updated synchronously so placeMarker always reads fresh data.
  useEffect(() => {
    customMarkersDataRef.current = (customMarkers as any[] | undefined) ?? [];
  }, [customMarkers]);

  // Re-render location markers when locations change
  // After geocoding completes, persisted linkedIntelLabel merges are restored in a second pass
  // (see the geocodeNext callback which calls restorePersistedMerges after the queue drains)
  useEffect(() => {
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
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

    // Track own position and apply follow-mode pan
    const ownEntry = (liveUsers as LiveUser[]).find(
      (u) => u.userId === currentUserId && u.deviceId === currentDeviceId
    );
    if (ownEntry) {
      ownPositionRef.current = { lat: ownEntry.lat, lng: ownEntry.lng };
      if (followModeRef.current && mapRef.current) {
        mapRef.current.panTo({ lat: ownEntry.lat, lng: ownEntry.lng });
      }
    }

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
    infoWindowRef.current = new google.maps.InfoWindow({
      pixelOffset: new google.maps.Size(0, -40),
    });
    autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
    setMapReady(true); // triggers live marker effect to run now that map is available
    if (locations) {
      renderLocations(locations);
    }
    // Right-click: show action chooser (RS Quick Entry | Add Marker Here | Navigate with Waze)
    map.addListener("rightclick", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        const addr = (status === "OK" && results && results[0]) ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setActionChooser({ lat, lng, address: convertGoogleAddresses(addr) });
      });
    });

    // Tap anywhere on the map (not on a marker/POI) → close the InfoWindow
    map.addListener("click", (e: google.maps.MapMouseEvent & { placeId?: string }) => {
      if (!e.placeId) {
        infoWindowRef.current?.close();
        return;
      }
      if (!e.latLng) return;
      // Prevent the default Google info window from opening
      e.stop?.();
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      // Look up the business details via Places API
      const service = new google.maps.places.PlacesService(map);
      service.getDetails(
        { placeId: e.placeId, fields: ["name", "formatted_address"] },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            setPoiTap({
              lat,
              lng,
              name: place.name ?? "",
              address: place.formatted_address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            });
          }
        }
      );
    });
  }, [locations, renderLocations]);

  // ── Custom marker rendering ────────────────────────────────────────────────
  const customMarkerMapRefs = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  // Direct img element refs for live rotation without stale content queries
  const customMarkerImgRefs = useRef<Map<number, HTMLImageElement>>(new Map());

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
      // Store direct img ref for live rotation
      customMarkerImgRefs.current.set(cm.id, img);

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
          const lat = cm.lat;
          const lng = cm.lng;
          const iconLabel = MARKER_ICON_LABELS[cm.markerIcon as MarkerIcon] ?? cm.markerIcon;
          const currentRotation = cm.rotation ?? 0;
          const dataUrl = getMarkerDataUrl(cm.markerIcon as MarkerIcon, cm.markerColour as MarkerColour);
          // Check if intel locations have been merged into this marker (array, target_address first)
          const mergedIntelList = mergedIntelRef.current.get(cm.id) ?? [];
          // Primary merged intel = first entry (target_address if present, else observation)
          const mergedIntel = mergedIntelList.length > 0 ? mergedIntelList[0] : null;

          const buildPopupHtml = (rotation: number) => {
            const lines: string[] = [];

            // Type badge row
            const hasMerged = mergedIntelList.length > 0;
            const badgeLabel = hasMerged ? "MERGED MARKER" : "MAP MARKER";
            const badgeBg = hasMerged ? "#0f766e" : "#374151";
            lines.push(`
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="background:${badgeBg};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${badgeLabel}</span>
                <span style="font-size:10px;color:#6b7280;">${iconLabel}</span>
              </div>
            `);

            // Label
            if (cm.label) lines.push(`<strong style="font-size:13px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${cm.label}</strong>`);

            // Address
            if (cm.address) lines.push(`<div style="font-size:11px;color:#444;margin-top:2px;">${cm.address}</div>`);

            // Notes
            if (cm.note) lines.push(`<div style="margin-top:6px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Notes</span><p style="font-size:12px;color:#111;margin:2px 0 0;">${cm.note}</p></div>`);

            // Persons (from custom marker)
            if (cm.assocPersons?.length) lines.push(`<div style="margin-top:6px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Persons</span><p style="font-size:12px;color:#111;margin:2px 0 0;">${(cm.assocPersons as string[]).join(", ")}</p></div>`);

            // Vehicles (from custom marker)
            if (cm.assocVehicles?.length) lines.push(`<div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Vehicles</span><p style="font-size:12px;color:#111;margin:2px 0 0;">${(cm.assocVehicles as string[]).join(", ")}</p></div>`);

            // ── Merged intel section: render each merged entry (target_address first) ──
            for (const intel of mergedIntelList) {
              const isTarget = intel.type === "target_address";
              const accentColor = isTarget ? "#dc2626" : "#7c3aed";
              const typeLabel = isTarget ? "TARGET ADDRESS" : "OBSERVED LOCATION";
              lines.push(`
                <div style="margin-top:8px;padding:8px;background:${isTarget ? '#fff5f5' : '#f8fafc'};border:1px solid ${isTarget ? '#fca5a5' : '#e2e8f0'};border-radius:6px;">
                  <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <span style="background:${accentColor};color:#fff;border-radius:3px;font-size:9px;font-weight:700;padding:1px 5px;letter-spacing:0.07em;">${typeLabel}</span>
                  </div>
                  <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:3px;">${formatIntelAddress(intel.label)}</div>
              `);
              // Linked target details
              if (isTarget && intel.linkedTargets.length > 0) {
                for (const t of intel.linkedTargets) {
                  lines.push(`<div style="padding:4px 6px;background:#fef2f2;border-left:2px solid #dc2626;border-radius:0 3px 3px 0;margin-bottom:3px;">`);
                  lines.push(`<div style="font-size:11px;font-weight:700;color:#111;">${t.name}</div>`);
                  if (t.tgt) lines.push(`<div style="font-size:10px;color:#555;">TGT: ${t.tgt}</div>`);
                  if (t.hbf) lines.push(`<div style="font-size:10px;color:#555;">HBF: ${t.hbf}</div>`);
                  if (t.v1f) lines.push(`<div style="font-size:10px;color:#555;">V1F: ${t.v1f}</div>`);
                  if (t.v2f) lines.push(`<div style="font-size:10px;color:#555;">V2F: ${t.v2f}</div>`);
                  lines.push(`</div>`);
                }
              }
              // Linked targets for observation
              if (!isTarget && intel.linkedTargets.length > 0) {
                lines.push(`<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Linked Targets</div>`);
                for (const t of intel.linkedTargets) {
                  lines.push(`<div style="font-size:11px;color:#111;">${t.name}</div>`);
                }
              }
              // Intel persons/vehicles
              if (intel.assocPersons.length > 0) {
                lines.push(`<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;">Intel Persons</div><div style="font-size:11px;color:#111;">${intel.assocPersons.join(", ")}</div>`);
              }
              if (intel.assocVehicles.length > 0) {
                lines.push(`<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Intel Vehicles</div><div style="font-size:11px;color:#111;">${intel.assocVehicles.join(", ")}</div>`);
              }
              lines.push(`</div>`);
            }
            // ─────────────────────────────────────────────────────────────────────────

            // Rotation slider
            lines.push(`
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <img id="cm-popup-preview-${cm.id}" src="${dataUrl}" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;transform:rotate(${rotation}deg);transition:transform 0.1s;" />
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

            // ── Action buttons: symmetric grid layout ─────────────────────────────
            const btnBase = "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
            const sections: string[] = [];

            // Row 0: RS Quick Entry — always at top, full width
            sections.push(`<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;"><button onclick="window.__cmRsQuickEntry(${cm.id})" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`);

            // Row 1: Intel actions (full-width) — only in merged mode (excluding RS Quick Entry which moved to top)
            if (mergedIntel) {
              const intelBtns: string[] = [];
              const isTarget = mergedIntel.type === "target_address";
              if (isTarget && mergedIntel.linkedTargets.length > 0) {
                for (const t of mergedIntel.linkedTargets) {
                  intelBtns.push(`<button onclick="window.__editTargetFromMap(${t.targetId})" style="${btnBase}background:#0f766e;color:#fff;border:none;font-size:13px;padding:9px 0;">Edit ${t.name}</button>`);
                }
              }
              // Also add View Profile for any observation entries
              for (const intel of mergedIntelList) {
                if (intel.type !== 'target_address') {
                  const encodedLabel = encodeURIComponent(intel.label);
                  intelBtns.push(`<a href="/intelligence/location/${encodedLabel}" style="${btnBase}background:#7c3aed;color:#fff;font-size:13px;padding:9px 0;">View Observation Profile</a>`);
                }
              }
              if (intelBtns.length > 0) {
                sections.push(`<div style="display:grid;grid-template-columns:1fr;gap:5px;margin-top:5px;">${intelBtns.join("")}</div>`);
              }
            }

            // Row 2: Navigation — Waze | Street View (2 columns)
            const navBtns = [
              `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
              `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="${btnBase}background:#4285f4;color:#fff;">Street View</a>`,
            ];
            sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`);

            // Row 3: Edit | Delete (2 columns)
            const editBtns = [
              `<button onclick="window.__editCustomMarker(${cm.id})" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`,
              `<button onclick="window.__deleteCustomMarker(${cm.id})" style="${btnBase}background:#ef4444;color:#fff;border:none;">Delete</button>`,
            ];
            sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtns.join("")}</div>`);

            // Row 4: Merge | Move — same size as Edit/Delete, 2 columns
            const mergeBtn = !mergedIntel
              ? `<button onclick="window.__cmOpenMergePicker(${cm.id})" style="${btnBase}background:#78716c;color:#fff;border:none;">Merge…</button>`
              : `<button disabled style="${btnBase}background:#78716c;color:#fff;border:none;opacity:0.4;cursor:default;">Merge…</button>`;
            const moveBtn = `<button onclick="window.__cmStartMove(${cm.id})" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
            sections.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${mergeBtn}${moveBtn}</div>`);

            lines.push(sections.join(""));

            return `<div style="font-family:sans-serif;max-width:280px;color:#111;">${lines.join("")}</div>`;
          };

          infoWindowRef.current.setContent(buildPopupHtml(currentRotation));
          infoWindowRef.current.open(map, marker);
        });
        existing.set(cm.id, marker);
      }
    });
  }, [customMarkers, mapReady]);

  // Global RS Quick Entry handler for merged marker popup
  useEffect(() => {
    (window as any).__cmRsQuickEntry = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkers as any[] | undefined)?.find((m: any) => m.id === id);
      if (!cm) return;
      const address = cm.address || cm.label || "";
      setMapQeAddress(convertGoogleAddresses(address));
      setMapQeOpen(true);
    };
    return () => { delete (window as any).__cmRsQuickEntry; };
  }, [customMarkers, setMapQeAddress, setMapQeOpen]);

  // Global manual merge picker handler — opens the merge picker bottom sheet
  useEffect(() => {
    (window as any).__cmOpenMergePicker = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkersDataRef.current as any[]).find((m: any) => m.id === id);
      if (!cm) return;
      // Find all geocoded intel pins within 150m of this custom marker
      const MANUAL_MERGE_RADIUS_M = 150;
      const candidates: Array<{ loc: IntelMapLocation; position: google.maps.LatLngLiteral; distanceM: number }> = [];
      geocodedIntelRef.current.forEach(({ loc, position }) => {
        const d = haversineMetres(cm.lat, cm.lng, position.lat, position.lng);
        if (d <= MANUAL_MERGE_RADIUS_M) {
          candidates.push({ loc, position, distanceM: Math.round(d) });
        }
      });
      candidates.sort((a, b) => a.distanceM - b.distanceM);
      setManualMergePicker({ cmId: id, candidates });
    };
    return () => { delete (window as any).__cmOpenMergePicker; };
  }, []);

  // Global move marker handler — makes the marker draggable and enters move mode
  useEffect(() => {
    (window as any).__cmStartMove = (id: number) => {
      infoWindowRef.current?.close();
      const marker = customMarkerMapRefs.current.get(id);
      if (!marker) return;
      // Store original position for cancel rollback
      const origPos = marker.position as google.maps.LatLngLiteral | null;
      if (!origPos) return;
      const origLat = typeof (origPos as any).lat === 'function' ? (origPos as any).lat() : (origPos as any).lat;
      const origLng = typeof (origPos as any).lng === 'function' ? (origPos as any).lng() : (origPos as any).lng;
      // Make marker draggable
      (marker as any).gmpDraggable = true;
      setMovingMarkerId(id);
      setPendingMoveAddress(null);
      // Listen for drag end to reverse geocode new position
      const dragEndListener = marker.addListener('dragend', () => {
        const newPos = marker.position as google.maps.LatLngLiteral | null;
        if (!newPos || !geocoderRef.current) return;
        const newLat = typeof (newPos as any).lat === 'function' ? (newPos as any).lat() : (newPos as any).lat;
        const newLng = typeof (newPos as any).lng === 'function' ? (newPos as any).lng() : (newPos as any).lng;
        geocoderRef.current.geocode({ location: { lat: newLat, lng: newLng } }, (results, status) => {
          const rawAddr = (status === 'OK' && results && results[0]) ? results[0].formatted_address : `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
          const addr = convertGoogleAddresses(rawAddr);
          setPendingMoveAddress({ lat: newLat, lng: newLng, address: addr });
        });
        // Remove this one-time listener
        google.maps.event.removeListener(dragEndListener);
      });
      // Store original position on the window object for cancel rollback
      (window as any).__cmMoveOrigPos = { id, lat: origLat, lng: origLng };
    };
    return () => { delete (window as any).__cmStartMove; };
  }, [customMarkerMapRefs, geocoderRef, setMovingMarkerId, setPendingMoveAddress]);

  // Global inline rotation handler for custom marker popup slider
  useEffect(() => {
    let rotateTimer: ReturnType<typeof setTimeout> | null = null;
    (window as any).__cmPopupRotate = (id: number, valueStr: string) => {
      const rotation = Number(valueStr);
      // Update the live preview image and degree label in the popup DOM
      const previewImg = document.getElementById(`cm-popup-preview-${id}`) as HTMLImageElement | null;
      const degLabel = document.getElementById(`cm-popup-deg-${id}`) as HTMLElement | null;
      if (previewImg) previewImg.style.transform = `rotate(${rotation}deg)`;
      if (degLabel) degLabel.textContent = `${rotation}°`;
      // Also rotate the actual map marker element immediately via direct img ref
      const markerImg = customMarkerImgRefs.current.get(id);
      if (markerImg) markerImg.style.transform = `rotate(${rotation}deg)`;
      // Fallback: query through content if direct ref not found
      if (!markerImg) {
        const markerEl = customMarkerMapRefs.current.get(id);
        if (markerEl?.content instanceof HTMLElement) {
          const img = markerEl.content.querySelector('img') as HTMLImageElement | null;
          if (img) img.style.transform = `rotate(${rotation}deg)`;
        }
      }
      // Debounce the DB save so we don't fire on every pixel of drag
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = setTimeout(() => {
        updateCustomMarkerMut.mutate({ id, rotation });
      }, 400);
    };
    return () => {
      delete (window as any).__cmPopupRotate;
      if (rotateTimer) clearTimeout(rotateTimer);
    };
  }, [updateCustomMarkerMut]);

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

  // ── Intel pin global handlers ─────────────────────────────────────────────────

  // RS Quick Entry from intel pin popup
  useEffect(() => {
    (window as any).__intelRsQuickEntry = (label: string) => {
      infoWindowRef.current?.close();
      setMapQeAddress(label);
      setMapQeOpen(true);
    };
    return () => { delete (window as any).__intelRsQuickEntry; };
  }, [setMapQeAddress, setMapQeOpen]);

  // Open edit dialog for intel pin (icon/colour/rotation only)
  useEffect(() => {
    (window as any).__intelOpenEditDialog = (label: string) => {
      infoWindowRef.current?.close();
      // Load current appearance from localStorage
      let icon: MarkerIcon = "house_filled";
      let colour: MarkerColour = "purple";
      let rotation = 0;
      try {
        const stored = localStorage.getItem(`runlog_intel_appearance_${label}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.icon) icon = parsed.icon as MarkerIcon;
          if (parsed.colour) colour = parsed.colour as MarkerColour;
          if (typeof parsed.rotation === "number") rotation = parsed.rotation;
        }
      } catch { /* ignore */ }
      setIntelEditIcon(icon);
      setIntelEditColour(colour);
      setIntelEditRotation(rotation);
      setEditingIntelLabel(label);
    };
    return () => { delete (window as any).__intelOpenEditDialog; };
  }, []);

  // Inline rotation handler for intel pin popup slider
  useEffect(() => {
    (window as any).__intelPopupRotate = (label: string, valueStr: string) => {
      const rotation = Number(valueStr);
      const encodedLabel = encodeURIComponent(label);
      // Update popup preview image and degree label
      const previewImg = document.getElementById(`intel-popup-preview-${encodedLabel}`) as HTMLImageElement | null;
      const degLabel = document.getElementById(`intel-popup-deg-${encodedLabel}`) as HTMLElement | null;
      if (previewImg) previewImg.style.transform = `rotate(${rotation}deg)`;
      if (degLabel) degLabel.textContent = `${rotation}°`;
      // Update the actual map marker element
      const markerEntry = markersRef.current.find((m: any) => m.title === label);
      if (markerEntry?.content instanceof HTMLElement) {
        const img = markerEntry.content.querySelector('img') as HTMLImageElement | null;
        if (img) img.style.transform = `rotate(${rotation}deg) drop-shadow(0 2px 4px rgba(0,0,0,0.4))`;
      }
      // Persist to localStorage immediately
      try {
        const stored = localStorage.getItem(`runlog_intel_appearance_${label}`);
        const parsed = stored ? JSON.parse(stored) : {};
        parsed.rotation = rotation;
        localStorage.setItem(`runlog_intel_appearance_${label}`, JSON.stringify(parsed));
      } catch { /* ignore */ }
    };
    return () => { delete (window as any).__intelPopupRotate; };
  }, []);

  // Move intel pin handler
  useEffect(() => {
    (window as any).__intelStartMove = (label: string) => {
      infoWindowRef.current?.close();
      const marker = markersRef.current.find((m: any) => m.title === label);
      if (!marker) return;
      const origPos = marker.position as google.maps.LatLngLiteral | null;
      if (!origPos) return;
      const origLat = typeof (origPos as any).lat === 'function' ? (origPos as any).lat() : (origPos as any).lat;
      const origLng = typeof (origPos as any).lng === 'function' ? (origPos as any).lng() : (origPos as any).lng;
      (marker as any).gmpDraggable = true;
      setMovingIntelLabel(label);
      setPendingIntelMoveAddress(null);
      const dragEndListener = marker.addListener('dragend', () => {
        const newPos = marker.position as google.maps.LatLngLiteral | null;
        if (!newPos || !geocoderRef.current) return;
        const newLat = typeof (newPos as any).lat === 'function' ? (newPos as any).lat() : (newPos as any).lat;
        const newLng = typeof (newPos as any).lng === 'function' ? (newPos as any).lng() : (newPos as any).lng;
        geocoderRef.current.geocode({ location: { lat: newLat, lng: newLng } }, (results, status) => {
          const rawAddr = (status === 'OK' && results && results[0]) ? results[0].formatted_address : `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
          const addr = convertGoogleAddresses(rawAddr);
          setPendingIntelMoveAddress({ lat: newLat, lng: newLng, address: addr });
        });
        google.maps.event.removeListener(dragEndListener);
      });
      (window as any).__intelMoveOrigPos = { label, lat: origLat, lng: origLng };
    };
    return () => { delete (window as any).__intelStartMove; };
  }, []);

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
    // Countdown/auto-submit removed — no timer
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current) clearInterval(rsCountdownIntervalRef.current);
  };

  const closeInlineField = () => {
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current) clearInterval(rsCountdownIntervalRef.current);
    setRsInlineLabel(null);
    setRsInlineText("");
    setRsInlineCins(new Set());
    rsInlineCinsRef.current = new Set();
    setRsCountdown(30);
  };

  const submitInlineField = () => {
    if (!rsInlineLabel) return;
    const finalText = rsInlineText.trim() ? rsInlineText.trim() : rsInlineLabel;
    // Capture CINs BEFORE closeInlineField clears the ref
    const cinsToAttach = new Set(rsInlineCinsRef.current);
    const timeOverride = mapQeTimeOverride;
    closeInlineField();
    addQuickRsEntry(finalText, cinsToAttach, timeOverride);
  };

  const resetInlineTimer = () => {
    startInlineCountdown();
  };

  const openInlineField = (label: string) => {
    if (!rsSelectedSheetId) return;
    setRsInlineLabel(label);
    setRsInlineText("");
    setRsInlineCins(new Set());
    rsInlineCinsRef.current = new Set();
    // Focus the textarea after render
    setTimeout(() => rsInlineInputRef.current?.focus(), 50);
    // Start auto-submit countdown
    startInlineCountdown();
  };

  // Auto-open the inline observation field whenever the RS Quick Entry sheet opens
  // (replaces the old trigger buttons — the full form appears immediately)
  useEffect(() => {
    if (mapQeOpen && rsSelectedSheetId) {
      // Reset time picker to current time on each open
      const now = new Date();
      const h24 = now.getHours();
      const min = now.getMinutes();
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const ampm = h24 < 12 ? "AM" : "PM";
      setMapQeHour(String(h12));
      setMapQeMinute(String(min).padStart(2, "0"));
      setMapQePeriod(ampm);
      setMapQeTimeOverride(`${String(h12).padStart(2,"0")}:${String(min).padStart(2,"0")} ${ampm}`);
      // Use a small delay so the sheet has rendered before we set focus
      setTimeout(() => {
        setRsInlineLabel("Entry");
        setRsInlineText("");
        setRsInlineCins(new Set());
        rsInlineCinsRef.current = new Set();
        setTimeout(() => rsInlineInputRef.current?.focus(), 80);
      }, 50);
    }
    if (!mapQeOpen) {
      // Clear the inline field when the sheet closes
      setRsInlineLabel(null);
      setRsInlineText("");
    }
  }, [mapQeOpen, rsSelectedSheetId]);

  const addQuickRsEntry = (observation: string, cinsToAttach?: Set<string> | null, timeOverride?: string | null) => {
    if (!rsSelectedSheetId) return;
    let timeStr: string;
    let totalMins: number;
    if (timeOverride) {
      const match = timeOverride.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        let h = parseInt(match[1]);
        const m = parseInt(match[2]);
        const ampm = match[3].toUpperCase();
        if (ampm === "PM" && h !== 12) h += 12;
        if (ampm === "AM" && h === 12) h = 0;
        totalMins = h * 60 + m;
        const h12 = h % 12 === 0 ? 12 : h % 12;
        timeStr = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
      } else {
        const now = new Date();
        const h24 = now.getHours(); const min = now.getMinutes();
        totalMins = h24 * 60 + min;
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
      }
    } else {
      const now = new Date();
      const h24 = now.getHours();
      const min = now.getMinutes();
      totalMins = h24 * 60 + min;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
    }
    setRsAddingRow(true);
    // Store the CINs in a local variable captured by the mutation callback
    const cins = cinsToAttach ? Array.from(cinsToAttach) : [];
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
          // Attach all selected CINs — use the locally captured variable, not the ref
          if (cins.length > 0 && (data as any)?.id) {
            for (const cin of cins) {
              rsAddMember.mutate({ rowId: (data as any).id, memberName: cin });
            }
          }
          toast.success("RS entry added");
          // Refetch intel pins so any new address in this observation appears on the map
          void refetchLocations();
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
        className={`flex flex-col min-h-0 border-r-2 border-border bg-card shadow-2xl relative flex-shrink-0 ${
          sidebarOpen
            ? "lg:rounded-none rounded-r-2xl transition-none"
            : "w-0 min-w-0 overflow-hidden transition-all duration-200"
        }`}
        style={sidebarOpen ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : undefined}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-border flex-shrink-0 bg-muted/20">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm tracking-tight">Navigate</span>
          </div>
          {/* Close button: hidden on desktop (always open), visible on mobile/tablet */}
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* App Navigation Menu */}
        <MapSidebarNav
          user={user}
          onNavigate={(path) => { if (!isDesktop) setSidebarOpen(false); setLocation(path); }}
          navOrder={mapNavOrder}
        />

        {/* Resize handle — desktop only */}
        <div
          className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
          onMouseDown={(e) => {
            e.preventDefault();
            sidebarResizingRef.current = true;
            sidebarResizeStartXRef.current = e.clientX;
            sidebarResizeStartWidthRef.current = sidebarWidth;
            const onMove = (me: MouseEvent) => {
              if (!sidebarResizingRef.current) return;
              const delta = me.clientX - sidebarResizeStartXRef.current;
              const newW = Math.max(200, Math.min(480, sidebarResizeStartWidthRef.current + delta));
              setSidebarWidth(newW);
            };
            const onUp = () => {
              sidebarResizingRef.current = false;
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              try { localStorage.setItem("runlog_map_sidebar_width", String(sidebarWidth)); } catch { /* ignore */ }
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />
      </div>

      {/* ── Map Area ── */}
      <div className="flex-1 relative" onClick={handleMapAreaClick}>

        {/* Collapsed panel arrow tab — positioned on left edge, vertically centred, above map type controls */}
        {!sidebarOpen && (
          <button
            onClick={(e) => { if (leftTabDraggingRef.current) { leftTabDraggingRef.current = false; return; } e.stopPropagation(); setSidebarOpen(true); }}
            className="absolute left-0 z-10 flex items-center justify-center bg-card border-2 border-l-0 border-border shadow-lg hover:bg-accent active:scale-95 transition-colors cursor-grab active:cursor-grabbing select-none touch-none"
            style={{
              top: `${leftTabTop}%`,
              transform: "translateY(-50%)",
              width: "40px",
              height: "112px",
              borderRadius: "0 12px 12px 0",
            }}
            title="Open Navigation Menu (drag to reposition)"
            onMouseDown={(e) => {
              e.stopPropagation();
              const startY = e.clientY;
              const startTop = leftTabTop;
              const parentH = (e.currentTarget.parentElement?.clientHeight ?? window.innerHeight);
              let moved = false;
              const onMove = (me: MouseEvent) => {
                const delta = me.clientY - startY;
                if (Math.abs(delta) > 3) moved = true;
                const newPct = Math.max(5, Math.min(95, startTop + (delta / parentH) * 100));
                setLeftTabTop(newPct);
              };
              const onUp = () => {
                if (moved) leftTabDraggingRef.current = true;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const touch = e.touches[0];
              const startY = touch.clientY;
              const startTop = leftTabTop;
              const parentH = (e.currentTarget.parentElement?.clientHeight ?? window.innerHeight);
              let moved = false;
              const onMove = (te: TouchEvent) => {
                const delta = te.touches[0].clientY - startY;
                if (Math.abs(delta) > 3) moved = true;
                const newPct = Math.max(5, Math.min(95, startTop + (delta / parentH) * 100));
                setLeftTabTop(newPct);
              };
              const onEnd = () => {
                if (moved) leftTabDraggingRef.current = true;
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", onEnd);
              };
              document.addEventListener("touchmove", onMove, { passive: true });
              document.addEventListener("touchend", onEnd);
            }}
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
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

        {/* Empty state — only show when there are also no custom markers, and user hasn't dismissed it */}
        {!locsLoading && !dismissedNoLocs && locations && locations.length === 0 && !(customMarkers && customMarkers.length > 0) && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
            <div className="relative bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2.5 shadow-md text-center max-w-[260px] flex items-center gap-2.5">
              <MapPin className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-tight">
                {selectedOpIds.length > 0 || selectedTargetIds.length > 0
                  ? "No locations found for selected filters."
                  : "Select operations or targets in Map Settings to show locations."}
              </p>
              <button
                onClick={() => setDismissedNoLocs(true)}
                className="flex-shrink-0 ml-1 text-muted-foreground/60 hover:text-foreground transition-colors"
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
          style={mapDarkMode ? { filter: "brightness(0.6) invert(1) hue-rotate(180deg)" } : undefined}
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
                setActionChooser({ lat, lng, address: convertGoogleAddresses(addr) });
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
            initialCenter={mapInitialCenter}
            initialZoom={mapInitialZoom}
          />

          {/* Centre on me / Follow me floating buttons — top-left below search bar */}
          <div
            className="absolute z-20 pointer-events-auto flex gap-1"
            style={{ top: "60px", left: "10px" }}
          >
            {/* Centre on me */}
            <button
              title="Centre on my location"
              onClick={(e) => {
                e.stopPropagation();
                if (!ownPositionRef.current) {
                  toast.error("Location not available — enable location sharing first");
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
              title={followMode ? "Stop following my location" : "Follow my location"}
              onClick={(e) => {
                e.stopPropagation();
                if (!followMode && !ownPositionRef.current) {
                  toast.error("Location not available — enable location sharing first");
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
              <Navigation2 className={`w-5 h-5 ${ followMode ? "text-white" : "text-sky-600" }`} />
            </button>
          </div>

          {/* Floating address search bar — top-left, next to Map/Satellite toggle */}
          <div
            className="absolute z-20 pointer-events-auto"
            style={{ top: "10px", left: "10px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <div className="flex items-center bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden" style={{ height: "40px", minWidth: "200px", maxWidth: "260px" }}>
                <Search className="w-4 h-4 text-gray-400 ml-3 shrink-0" />
                <input
                  type="text"
                  value={addrSearch}
                  placeholder="Search address…"
                  className="flex-1 px-2 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
                  style={{ height: "40px" }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAddrSearch(val);
                    if (addrSearchDebounceRef.current) clearTimeout(addrSearchDebounceRef.current);
                    if (!val.trim()) { setAddrSuggestions([]); setAddrSearchOpen(false); return; }
                    addrSearchDebounceRef.current = setTimeout(() => {
                      if (!autocompleteServiceRef.current) return;
                      autocompleteServiceRef.current.getPlacePredictions(
                        { input: val, componentRestrictions: { country: "au" } },
                        (predictions, status) => {
                          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
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
                  onFocus={() => { if (addrSuggestions.length > 0) setAddrSearchOpen(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setAddrSearch(""); setAddrSuggestions([]); setAddrSearchOpen(false); }
                  }}
                />
                {addrSearch && (
                  <button
                    className="mr-2 text-gray-400 hover:text-gray-600"
                    onClick={() => { setAddrSearch(""); setAddrSuggestions([]); setAddrSearchOpen(false); if (addrSearchPinRef.current) { addrSearchPinRef.current.map = null; addrSearchPinRef.current = null; } }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {addrSearchOpen && addrSuggestions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden" style={{ minWidth: "260px", maxWidth: "320px", zIndex: 30 }}>
                  {addrSuggestions.map((s) => (
                    <button
                      key={s.place_id}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-start gap-2"
                      onClick={() => {
                        setAddrSearch(s.description);
                        setAddrSuggestions([]);
                        setAddrSearchOpen(false);
                        // Geocode the selected place and pan map
                        if (!geocoderRef.current || !mapRef.current) return;
                        geocoderRef.current.geocode({ placeId: s.place_id }, (results, status) => {
                          if (status === "OK" && results && results[0]) {
                            const loc = results[0].geometry.location;
                            mapRef.current!.panTo(loc);
                            mapRef.current!.setZoom(17);
                            // Drop a temporary search pin
                            if (addrSearchPinRef.current) { addrSearchPinRef.current.map = null; }
                            const pinEl = document.createElement("div");
                            pinEl.innerHTML = `<div style="width:36px;height:36px;background:#4285f4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`;
                            const pin = new google.maps.marker.AdvancedMarkerElement({
                              map: mapRef.current!,
                              position: loc,
                              content: pinEl,
                              title: s.description,
                            });
                            addrSearchPinRef.current = pin;
                            // Clicking the blue pin shows the action chooser
                            pin.addListener("gmp-click", () => {
                              setActionChooser({ lat: loc.lat(), lng: loc.lng(), address: convertGoogleAddresses(s.description) });
                            });
                          }
                        });
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

        {/* RS Actions pane toggle tab — right edge, draggable */}
        {!rsActionsPaneOpen && (
          <button
            onClick={(e) => { if (rightTabDraggingRef.current) { rightTabDraggingRef.current = false; return; } e.stopPropagation(); setRsActionsPaneOpen(true); }}
            className="absolute right-0 z-10 flex items-center justify-center bg-card border-2 border-r-0 border-border shadow-lg hover:bg-accent active:scale-95 transition-colors cursor-grab active:cursor-grabbing select-none touch-none"
            style={{
              top: `${rightTabTop}%`,
              transform: "translateY(-50%)",
              width: "40px",
              height: "112px",
              borderRadius: "12px 0 0 12px",
            }}
            title="Open Map Settings (drag to reposition)"
            onMouseDown={(e) => {
              e.stopPropagation();
              const startY = e.clientY;
              const startTop = rightTabTop;
              const parentH = (e.currentTarget.parentElement?.clientHeight ?? window.innerHeight);
              let moved = false;
              const onMove = (me: MouseEvent) => {
                const delta = me.clientY - startY;
                if (Math.abs(delta) > 3) moved = true;
                const newPct = Math.max(5, Math.min(95, startTop + (delta / parentH) * 100));
                setRightTabTop(newPct);
              };
              const onUp = () => {
                if (moved) rightTabDraggingRef.current = true;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const touch = e.touches[0];
              const startY = touch.clientY;
              const startTop = rightTabTop;
              const parentH = (e.currentTarget.parentElement?.clientHeight ?? window.innerHeight);
              let moved = false;
              const onMove = (te: TouchEvent) => {
                const delta = te.touches[0].clientY - startY;
                if (Math.abs(delta) > 3) moved = true;
                const newPct = Math.max(5, Math.min(95, startTop + (delta / parentH) * 100));
                setRightTabTop(newPct);
              };
              const onEnd = () => {
                if (moved) rightTabDraggingRef.current = true;
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", onEnd);
              };
              document.addEventListener("touchmove", onMove, { passive: true });
              document.addEventListener("touchend", onEnd);
            }}
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        {/* ── Draggable Floating Pill Bar (all devices) ──
             Tap-hold the drag handle to reposition vertically. Position persisted to localStorage. */}
        <div
          className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none"
          style={{ top: `${pillBarTop}%`, transform: "translateY(-50%)" }}
        >
          {/* Drag handle — long-press activates drag */}
          <div
            className={`pointer-events-auto flex items-center gap-2 lg:gap-3 px-2 py-1.5 rounded-3xl ${
              pillBarDraggingRef.current ? "cursor-grabbing" : "cursor-grab"
            } select-none touch-none`}
            onMouseDown={(e) => {
              // Long-press to drag on desktop
              const startY = e.clientY;
              const startTop = pillBarTop;
              const parentH = (e.currentTarget.parentElement?.parentElement?.clientHeight ?? window.innerHeight);
              pillBarIsDraggingRef.current = false;
              pillBarLongPressRef.current = setTimeout(() => {
                pillBarDraggingRef.current = true;
                const onMove = (me: MouseEvent) => {
                  const delta = me.clientY - startY;
                  if (Math.abs(delta) > 3) { pillBarIsDraggingRef.current = true; }
                  setPillBarTop(Math.max(5, Math.min(95, startTop + (delta / parentH) * 100)));
                };
                const onUp = () => {
                  pillBarDraggingRef.current = false;
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }, 300);
              const onUp = () => {
                if (pillBarLongPressRef.current) clearTimeout(pillBarLongPressRef.current);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mouseup", onUp);
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const startY = touch.clientY;
              const startTop = pillBarTop;
              const parentH = (e.currentTarget.parentElement?.parentElement?.clientHeight ?? window.innerHeight);
              pillBarIsDraggingRef.current = false;
              pillBarLongPressRef.current = setTimeout(() => {
                pillBarDraggingRef.current = true;
                const onMove = (te: TouchEvent) => {
                  const delta = te.touches[0].clientY - startY;
                  if (Math.abs(delta) > 3) { pillBarIsDraggingRef.current = true; }
                  setPillBarTop(Math.max(5, Math.min(95, startTop + (delta / parentH) * 100)));
                };
                const onEnd = () => {
                  pillBarDraggingRef.current = false;
                  document.removeEventListener("touchmove", onMove);
                  document.removeEventListener("touchend", onEnd);
                };
                document.addEventListener("touchmove", onMove, { passive: true });
                document.addEventListener("touchend", onEnd);
              }, 300);
              const onEnd = () => {
                if (pillBarLongPressRef.current) clearTimeout(pillBarLongPressRef.current);
                document.removeEventListener("touchend", onEnd);
              };
              document.addEventListener("touchend", onEnd);
            }}
          >
            {/* Home pill (all devices) */}
            <button
              onClick={(e) => { if (pillBarIsDraggingRef.current) { e.preventDefault(); return; } setLocation("/"); }}
              className="flex flex-col items-center justify-center gap-1 px-5 py-2.5 rounded-2xl shadow-lg border bg-slate-600 border-slate-500 hover:bg-slate-500 active:scale-95 transition-all min-w-[80px]"
              title="Home"
            >
              <Home className="h-5 w-5 flex-shrink-0 text-white" />
              <span className="text-[11px] font-semibold leading-none text-white">Home</span>
            </button>

            {/* Active RS pill */}
            {(() => {
              const activeSheet = rsSelectedSheetId && rsSheetsData
                ? (rsSheetsData as any[]).find((s: any) => s.id === rsSelectedSheetId)
                : null;
              return (
                <button
                  disabled={!activeSheet}
                  onClick={(e) => { if (pillBarIsDraggingRef.current) { e.preventDefault(); return; } if (activeSheet) setLocation(`/sheet/${rsSelectedSheetId}`); }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl shadow-lg border transition-all min-w-[80px] px-5 py-2.5 ${
                    activeSheet
                      ? "bg-emerald-700 border-emerald-600 hover:bg-emerald-600 active:scale-95 cursor-pointer"
                      : "bg-emerald-900/50 border-emerald-800/50 cursor-default opacity-50"
                  }`}
                  title={activeSheet ? "Open active running sheet" : "No running sheet selected"}
                >
                  <ClipboardList className={`h-5 w-5 flex-shrink-0 ${activeSheet ? "text-white" : "text-white/40"}`} />
                  <span className={`text-[11px] font-semibold leading-none ${activeSheet ? "text-white" : "text-white/40"}`}>Active RS</span>
                </button>
              );
            })()}

            {/* RS Entry pill */}
            {(() => {
              const hasSheet = !!rsSelectedSheetId;
              return (
                <button
                  disabled={!hasSheet}
                  onClick={(e) => { if (pillBarIsDraggingRef.current) { e.preventDefault(); return; } if (hasSheet) setMapQeOpen(true); }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl shadow-lg border transition-all min-w-[80px] px-5 py-2.5 ${
                    hasSheet
                      ? "bg-blue-700 border-blue-600 hover:bg-blue-600 active:scale-95 cursor-pointer"
                      : "bg-blue-900/50 border-blue-800/50 cursor-default opacity-50"
                  }`}
                  title={hasSheet ? "RS Quick Entry" : "Select a running sheet first"}
                >
                  <FileText className={`h-5 w-5 flex-shrink-0 ${hasSheet ? "text-white" : "text-white/40"}`} />
                  <span className={`text-[11px] font-semibold leading-none ${hasSheet ? "text-white" : "text-white/40"}`}>RS Entry</span>
                </button>
              );
            })()}

            {/* Intel Profiles pill */}
            <button
              onClick={(e) => { if (pillBarIsDraggingRef.current) { e.preventDefault(); return; } setLocation("/intelligence"); }}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl shadow-lg border bg-violet-700 border-violet-600 hover:bg-violet-600 active:scale-95 transition-all min-w-[80px] px-5 py-2.5"
              title="Intel Profiles"
            >
              <FolderSearch className="h-5 w-5 flex-shrink-0 text-white" />
              <span className="text-[11px] font-semibold leading-none text-white">Intel Profiles</span>
            </button>
          </div>
        </div>

      </div>

      {/* ── RS Actions Right Pane ── */}
      <div
        className={`flex flex-col border-l-2 border-border bg-card transition-all duration-200 shadow-2xl ${
          rsActionsPaneOpen ? "w-80 min-w-[20rem] rounded-l-2xl" : "w-0 min-w-0 overflow-hidden"
        }`}
      >
        {/* Pane Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-border flex-shrink-0 bg-muted/20">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm tracking-tight">Map Settings</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setRsActionsPaneOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Pane Body */}
        <div className="flex-1 overflow-y-auto" onClick={() => { if (rsInlineLabel) closeInlineField(); }}>

          {/* ── MAP THEME toggle ── */}
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Map Theme</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-medium transition-colors ${!mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}>Light</span>
                <Switch
                  checked={mapDarkMode}
                  onCheckedChange={setMapDarkMode}
                  className="scale-90"
                />
                <span className={`text-[11px] font-medium transition-colors ${mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}>Dark</span>
              </div>
            </div>
          </div>

          {/* ── OPERATIONS section ── */}
          <div className="px-3 py-3 border-b border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Operations</span>
            {opsLoading ? (
              <div className="flex items-center justify-center py-3"><Spinner className="h-4 w-4" /></div>
            ) : !operations || operations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No operations found.</p>
            ) : (
              <Popover open={opsDropdownOpen} onOpenChange={setOpsDropdownOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-border bg-background hover:bg-accent/50 active:scale-[0.98] transition-all text-left">
                    <span className="text-xs text-foreground truncate flex-1">
                      {selectedOpIds.length === 0
                        ? "Select operations…"
                        : selectedOpIds.length === (operations as any[]).length
                        ? "All operations"
                        : (operations as any[]).filter((op: any) => selectedOpIds.includes(op.id)).map((op: any) => op.name).join(", ")}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 rounded-xl border-2 border-border shadow-xl" align="end">
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-border mb-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Select Operations</span>
                    <div className="flex gap-2">
                      <button onClick={selectAllOps} className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold">All</button>
                      <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-foreground font-semibold">Clear</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                    {(operations as any[]).map((op) => {
                      const opTargets = opTargetMap.get(op.id) ?? [];
                      const isOpSelected = selectedOpIds.includes(op.id);
                      const isExpanded = opExpanded.has(op.id);
                      return (
                        <div key={op.id}>
                          <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors">
                            <Checkbox
                              id={`rp-op-${op.id}`}
                              checked={isOpSelected}
                              onCheckedChange={() => toggleOp(op.id)}
                              className="h-4 w-4"
                            />
                            <label htmlFor={`rp-op-${op.id}`} className="flex-1 text-sm cursor-pointer truncate font-medium">{op.name}</label>
                            {opTargets.length > 0 && (
                              <button
                                onClick={() => setOpExpanded(prev => {
                                  const next = new Set(prev);
                                  next.has(op.id) ? next.delete(op.id) : next.add(op.id);
                                  return next;
                                })}
                                className="text-muted-foreground hover:text-foreground p-0.5"
                              >
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                          {isExpanded && opTargets.length > 0 && (
                            <div className="ml-6 pl-2 border-l border-border/50 flex flex-col gap-0.5 mb-1">
                              {opTargets.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/40 transition-colors">
                                  <Checkbox
                                    id={`rp-tgt-${t.id}`}
                                    checked={selectedTargetIds.includes(t.id)}
                                    onCheckedChange={() => toggleTarget(t.id)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <label htmlFor={`rp-tgt-${t.id}`} className="text-xs cursor-pointer truncate text-muted-foreground">{t.name}</label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* ── RS SELECTION section ── */}
          <div className="px-3 py-3 border-b border-border space-y-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">RS Selection</span>

            {/* Operation selector */}
            <Select
              value={rsSelectedOpId !== null ? String(rsSelectedOpId) : ""}
              onValueChange={(val) => {
                setRsSelectedOpId(Number(val));
                setRsSelectedSheetId(null);
                setRsLastEntry(null);
              }}
            >
              <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                <SelectValue placeholder="1. Choose operation…" />
              </SelectTrigger>
              <SelectContent>
                {(operations ?? []).map((op: any) => (
                  <SelectItem key={op.id} value={String(op.id)} className="text-xs">{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Running sheet selector */}
            {rsSelectedOpId !== null && (
              <Select
                value={rsSelectedSheetId !== null ? String(rsSelectedSheetId) : ""}
                onValueChange={(val) => {
                  setRsSelectedSheetId(Number(val));
                  setRsLastEntry(null);
                }}
              >
                <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                  <SelectValue placeholder="2. Choose running sheet…" />
                </SelectTrigger>
                <SelectContent>
                  {(rsSheetsData ?? []).filter((s: any) => !s.closedAt && !s.deletedAt).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-xs">{s.title || `Sheet #${s.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Sheet link — shown below RS dropdown when sheet selected */}
            {rsSelectedSheetId !== null && rsSheetsData && (() => {
              const sheet = (rsSheetsData as any[]).find((s: any) => s.id === rsSelectedSheetId);
              return sheet ? (
                <button
                  onClick={() => setLocation(`/sheet/${rsSelectedSheetId}`)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-primary/40 bg-primary/10 hover:bg-primary/20 active:scale-[0.98] transition-all min-w-0"
                >
                  <MapIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs font-semibold text-primary truncate flex-1 text-left">{sheet.title || `Sheet #${sheet.id}`}</span>
                  <ExternalLink className="h-3 w-3 text-primary/60 flex-shrink-0" />
                </button>
              ) : null;
            })()}

            {/* RS Quick Entry moved to bottom tab bar — use the indigo RS Entry pill instead */}
          </div>{/* end RS Selection */}

          {/* ── TEAMS (Live Location) ── */}
          <div className="px-3 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">TEAMS</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Show &amp; Share</span>
                <Switch checked={sharingEnabled} onCheckedChange={handleSharingToggle} className="scale-90" />
              </div>
            </div>

            {/* GPS error */}
            {gpsError && (
              <div className="flex items-start gap-1.5 mb-3 p-2.5 rounded-xl border-2 border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-amber-400 leading-tight">{gpsError}</span>
              </div>
            )}

            {/* Team rows — collapsible with memory */}
            <div className="flex flex-col gap-2">
              {[
                { key: "TEAM1", label: "Team 1", colour: TEAM_COLOURS.TEAM1, users: liveUsersByTeam.TEAM1 },
                { key: "TEAM2", label: "Team 2", colour: TEAM_COLOURS.TEAM2, users: liveUsersByTeam.TEAM2 },
                { key: "PTT",   label: "PTT",    colour: TEAM_COLOURS.PTT,   users: liveUsersByTeam.PTT },
              ].map(({ key, label, colour, users: teamUsers }) => {
                const isCollapsed = collapsedTeams.has(key);
                return (
                  <div key={key} className="rounded-xl border-2 border-border overflow-hidden">
                    {/* Team header — tap to collapse/expand */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                      <button
                        onClick={() => setCollapsedTeams(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; })}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour }} />
                        <span className="text-[11px] font-semibold" style={{ color: colour }}>{label}</span>
                        {teamUsers.length > 0 && <span className="text-[10px] text-muted-foreground">({teamUsers.length})</span>}
                        {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" /> : <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </button>
                      <button onClick={() => toggleTeamVisibility(key)} className="ml-2 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0 px-1.5 py-0.5 rounded-md border border-border/50 bg-background/50">
                        {hiddenTeams.has(key) ? "Show" : "Hide"}
                      </button>
                    </div>
                    {/* Team members — shown when not collapsed */}
                    {!isCollapsed && (
                      <div className="px-3 py-2 border-t border-border bg-card">
                        {teamUsers.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground/50 italic">No units online</p>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {teamUsers.map((u) => (
                              <div key={u.userId} className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30">
                                <span className="text-[11px] text-foreground font-medium truncate">
                                  {u.name.toUpperCase()}
                                  {u.userId === user?.id && <span className="ml-1 text-[9px] text-muted-foreground">(you)</span>}
                                </span>
                                <button onClick={() => toggleUserVisibility(u.userId)} className="text-[10px] text-muted-foreground hover:text-foreground ml-2 flex-shrink-0">
                                  {hiddenUsers.has(u.userId) ? "Show" : "Hide"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unassigned users */}
              {liveUsersByTeam.unassigned.length > 0 && (() => {
                const isCollapsed = collapsedTeams.has("null");
                return (
                  <div className="rounded-xl border-2 border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                      <button
                        onClick={() => setCollapsedTeams(prev => { const next = new Set(prev); next.has("null") ? next.delete("null") : next.add("null"); return next; })}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0" />
                        <span className="text-[11px] font-semibold text-muted-foreground">Unassigned</span>
                        <span className="text-[10px] text-muted-foreground">({liveUsersByTeam.unassigned.length})</span>
                        {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" /> : <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </button>
                      <button onClick={() => toggleTeamVisibility("null")} className="ml-2 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0 px-1.5 py-0.5 rounded-md border border-border/50 bg-background/50">
                        {hiddenTeams.has("null") ? "Show" : "Hide"}
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div className="px-3 py-2 border-t border-border bg-card">
                        <div className="flex flex-col gap-0.5">
                          {liveUsersByTeam.unassigned.map((u) => (
                            <div key={u.userId} className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30">
                              <span className="text-[11px] text-foreground font-medium truncate">
                                {u.name.toUpperCase()}
                                {u.userId === user?.id && <span className="ml-1 text-[9px] text-muted-foreground">(you)</span>}
                              </span>
                              <button onClick={() => toggleUserVisibility(u.userId)} className="text-[10px] text-muted-foreground hover:text-foreground ml-2 flex-shrink-0">
                                {hiddenUsers.has(u.userId) ? "Show" : "Hide"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>{/* end TEAMS */}

        </div>{/* end Pane Body */}
      </div>{/* end RS Actions Right Pane */}

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
                <p className="text-xs text-muted-foreground mt-0.5">Choose up to 3 custom shortcut folders (laptop: 3, tablet: 2, mobile: 1)</p>
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
                        } else if (prev.length < 3) {
                          next = [...prev, opt];
                        } else {
                          // Replace last slot
                          next = [...prev.slice(0, 2), opt];
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
              {quickLinks.length}/2 slots used — Operations and active sheet are always shown
            </p>
          </div>
        </div>
      )}

      {/* ── POI Tap Bottom Sheet ── */}
      {poiTap && !pendingLatLng && !mapQeOpen && !actionChooser && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => setPoiTap(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Business / Place</p>
                <p className="text-sm font-bold text-foreground leading-snug">{poiTap.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{poiTap.address}</p>
              </div>
              <button onClick={() => setPoiTap(null)} className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* RS Quick Entry */}
              <button
                onClick={() => {
                  setMapQeAddress(buildPoiAddress(poiTap.name, poiTap.address));
                  setMapQeOpen(true);
                  setPoiTap(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all px-4 py-5"
              >
                <ClipboardList className="h-7 w-7 text-primary" />
                <span className="text-sm font-bold text-foreground">RS Quick Entry</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Add a running sheet entry for this location</span>
              </button>
              {/* Add Marker Here */}
              <button
                onClick={() => {
                  const rsAddress = buildPoiAddress(poiTap.name, poiTap.address);
                  setCmLabel(poiTap.name);
                  setCmAddress(rsAddress);
                  setCmNote(""); setCmPersons([]); setCmVehicles([]); setCmRotation(0);
                  setCmPersonInput(""); setCmVehicleInput("");
                  setCmOpId(selectedOpIds.length === 1 ? selectedOpIds[0] : (rsSelectedOpId ?? null));
                  setPendingLatLng({ lat: poiTap.lat, lng: poiTap.lng });
                  setPoiTap(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
              >
                <MapPin className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">Add Marker Here</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Place a custom marker at this business</span>
              </button>
            </div>
            {/* Navigate with Waze — full-width below the grid */}
            <a
              href={`https://waze.com/ul?ll=${poiTap?.lat},${poiTap?.lng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setPoiTap(null)}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-95 transition-all px-4 py-3"
            >
              <Navigation2 className="h-5 w-5 text-cyan-400" />
              <span className="text-sm font-bold text-foreground">Navigate with Waze</span>
            </a>
          </div>
        </div>
      )}

      {/* ── Action Chooser Bottom Sheet ── */}
      {actionChooser && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => setActionChooser(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Map Location</p>
                <p className="text-xs text-muted-foreground leading-snug">{actionChooser.address}</p>
              </div>
              <button onClick={() => setActionChooser(null)} className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* RS Quick Entry */}
              <button
                onClick={() => {
                  setMapQeAddress(actionChooser.address);
                  setMapQeOpen(true);
                  setActionChooser(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all px-4 py-5"
              >
                <ClipboardList className="h-7 w-7 text-primary" />
                <span className="text-sm font-bold text-foreground">RS Quick Entry</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Add a running sheet entry for this location</span>
              </button>
              {/* Add Marker Here */}
              <button
                onClick={() => {
                  setCmLabel("");
                  setCmAddress(actionChooser.address);
                  setCmNote(""); setCmPersons([]); setCmVehicles([]); setCmRotation(0);
                  setCmPersonInput(""); setCmVehicleInput("");
                  setCmOpId(selectedOpIds.length === 1 ? selectedOpIds[0] : (rsSelectedOpId ?? null));
                  setPendingLatLng({ lat: actionChooser.lat, lng: actionChooser.lng });
                  setActionChooser(null);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
              >
                <MapPin className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">Add Marker Here</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Place a custom marker at this location</span>
              </button>
            </div>
            {/* Navigate with Waze — full-width below the grid */}
            <a
              href={`https://waze.com/ul?ll=${actionChooser.lat},${actionChooser.lng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setActionChooser(null)}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-95 transition-all px-4 py-3"
            >
              <Navigation2 className="h-5 w-5 text-cyan-400" />
              <span className="text-sm font-bold text-foreground">Navigate with Waze</span>
            </a>
          </div>
        </div>
      )}

      {/* ── Manual Merge Picker ── */}
      {manualMergePicker && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => setManualMergePicker(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Manual Merge</p>
                <p className="text-sm font-semibold text-foreground">Select an Intel Pin to merge with</p>
              </div>
              <button onClick={() => setManualMergePicker(null)} className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            {manualMergePicker.candidates.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No intel pins found within 150m of this marker.</p>
                <p className="text-xs text-muted-foreground mt-1">Intel pins must be visible on the map (not already merged) to appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {manualMergePicker.candidates.map((c) => (
                  <button
                    key={c.loc.label}
                    onClick={() => {
                      // Perform the merge: append intel data to the custom marker's merged list
                      const enriched = { ...c.loc, lat: c.position.lat, lng: c.position.lng };
                      const existingList = mergedIntelRef.current.get(manualMergePicker.cmId) ?? [];
                      if (!existingList.find(e => e.label === enriched.label)) {
                        existingList.push(enriched);
                        existingList.sort((a, b) => {
                          if (a.type === 'target_address' && b.type !== 'target_address') return -1;
                          if (a.type !== 'target_address' && b.type === 'target_address') return 1;
                          return 0;
                        });
                        mergedIntelRef.current.set(manualMergePicker.cmId, existingList);
                      }
                      // Remove the intel pin from the map
                      const pinIdx = markersRef.current.findIndex((m) => {
                        const pos = m.position as google.maps.LatLng | google.maps.LatLngLiteral | null;
                        if (!pos) return false;
                        const lat = typeof (pos as any).lat === 'function' ? (pos as any).lat() : (pos as any).lat;
                        const lng = typeof (pos as any).lng === 'function' ? (pos as any).lng() : (pos as any).lng;
                        return Math.abs(lat - c.position.lat) < 0.00001 && Math.abs(lng - c.position.lng) < 0.00001;
                      });
                      if (pinIdx !== -1) {
                        markersRef.current[pinIdx].map = null;
                        markersRef.current.splice(pinIdx, 1);
                      }
                      // Also remove from geocodedIntelRef so it doesn't show in future merge pickers
                      geocodedIntelRef.current.delete(c.loc.label);
                      // Persist the merge to the database so it survives page reloads
                      updateCustomMarkerMut.mutate({ id: manualMergePicker.cmId, linkedIntelLabel: c.loc.label });
                      setManualMergePicker(null);
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 active:scale-[0.98] transition-all px-4 py-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                        {c.loc.type === "target_address" ? "Target Address" : "Observed Location"}
                      </p>
                      <p className="text-sm font-semibold text-foreground truncate">{formatIntelAddress(c.loc.label)}</p>
                      {c.loc.linkedTargets?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.loc.linkedTargets.map((t: any) => t.name).join(", ")}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{c.distanceM}m away</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Move Marker Banner ── */}
      {movingMarkerId !== null && (
        <div
          className="absolute top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 pointer-events-none"
        >
          <div
            className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden"
            style={{ background: "rgba(3,105,161,0.97)" }}
          >
            {pendingMoveAddress === null ? (
              /* Phase 1: dragging */
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-semibold text-white">Drag marker to new position</p>
                <button
                  onClick={() => {
                    // Cancel: snap marker back to original position
                    const orig = (window as any).__cmMoveOrigPos;
                    if (orig && orig.id === movingMarkerId) {
                      const marker = customMarkerMapRefs.current.get(orig.id);
                      if (marker) {
                        marker.position = { lat: orig.lat, lng: orig.lng };
                        (marker as any).gmpDraggable = false;
                      }
                    }
                    setMovingMarkerId(null);
                    setPendingMoveAddress(null);
                    delete (window as any).__cmMoveOrigPos;
                  }}
                  className="flex-shrink-0 text-white/80 hover:text-white text-xs font-medium bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Phase 2: confirm new address */
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 mb-0.5">Move to</p>
                <p className="text-sm font-semibold text-white mb-3 leading-snug">{pendingMoveAddress.address}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (movingMarkerId === null || pendingMoveAddress === null) return;
                      updateCustomMarkerMut.mutate({
                        id: movingMarkerId,
                        lat: pendingMoveAddress.lat,
                        lng: pendingMoveAddress.lng,
                        address: pendingMoveAddress.address,
                      });
                      const marker = customMarkerMapRefs.current.get(movingMarkerId);
                      if (marker) (marker as any).gmpDraggable = false;
                      setMovingMarkerId(null);
                      setPendingMoveAddress(null);
                      delete (window as any).__cmMoveOrigPos;
                      toast.success("Marker moved");
                    }}
                    className="flex-1 text-sm font-semibold text-white bg-white/25 hover:bg-white/35 rounded-xl py-2 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      // Cancel: snap marker back to original position
                      const orig = (window as any).__cmMoveOrigPos;
                      if (orig && orig.id === movingMarkerId) {
                        const marker = customMarkerMapRefs.current.get(orig.id);
                        if (marker) {
                          marker.position = { lat: orig.lat, lng: orig.lng };
                          (marker as any).gmpDraggable = false;
                        }
                      }
                      setMovingMarkerId(null);
                      setPendingMoveAddress(null);
                      delete (window as any).__cmMoveOrigPos;
                    }}
                    className="flex-1 text-sm font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Intel Pin Move Banner ── */}
      {movingIntelLabel !== null && (
        <div
          className="absolute top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 pointer-events-none"
        >
          <div
            className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden"
            style={{ background: "rgba(3,105,161,0.97)" }}
          >
            {pendingIntelMoveAddress === null ? (
              /* Phase 1: dragging */
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-semibold text-white">Drag marker to new position</p>
                <button
                  onClick={() => {
                    // Cancel: snap marker back to original position
                    const orig = (window as any).__intelMoveOrigPos;
                    if (orig && orig.label === movingIntelLabel) {
                      const marker = markersRef.current.find((m: any) => m.title === orig.label);
                      if (marker) {
                        marker.position = { lat: orig.lat, lng: orig.lng };
                        (marker as any).gmpDraggable = false;
                      }
                    }
                    setMovingIntelLabel(null);
                    setPendingIntelMoveAddress(null);
                    delete (window as any).__intelMoveOrigPos;
                  }}
                  className="flex-shrink-0 text-white/80 hover:text-white text-xs font-medium bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Phase 2: confirm new address */
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 mb-0.5">Move to</p>
                <p className="text-sm font-semibold text-white mb-3 leading-snug">{pendingIntelMoveAddress.address}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (movingIntelLabel === null || pendingIntelMoveAddress === null) return;
                      // Accept: update geocodedIntelRef so the new position is used next time
                      const entry = geocodedIntelRef.current.get(movingIntelLabel);
                      if (entry) {
                        geocodedIntelRef.current.set(movingIntelLabel, {
                          ...entry,
                          position: { lat: pendingIntelMoveAddress.lat, lng: pendingIntelMoveAddress.lng },
                        });
                      }
                      const marker = markersRef.current.find((m: any) => m.title === movingIntelLabel);
                      if (marker) (marker as any).gmpDraggable = false;
                      setMovingIntelLabel(null);
                      setPendingIntelMoveAddress(null);
                      delete (window as any).__intelMoveOrigPos;
                      toast.success("Marker moved");
                    }}
                    className="flex-1 text-sm font-semibold text-white bg-white/25 hover:bg-white/35 rounded-xl py-2 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      const orig = (window as any).__intelMoveOrigPos;
                      if (orig && orig.label === movingIntelLabel) {
                        const marker = markersRef.current.find((m: any) => m.title === orig.label);
                        if (marker) {
                          marker.position = { lat: orig.lat, lng: orig.lng };
                          (marker as any).gmpDraggable = false;
                        }
                      }
                      setMovingIntelLabel(null);
                      setPendingIntelMoveAddress(null);
                      delete (window as any).__intelMoveOrigPos;
                    }}
                    className="flex-1 text-sm font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Intel Pin Edit Dialog ── */}
      {editingIntelLabel !== null && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setEditingIntelLabel(null)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-foreground">Edit Marker Appearance</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[260px]">{editingIntelLabel}</p>
              </div>
              <button onClick={() => setEditingIntelLabel(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Icon picker */}
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
                          onClick={() => setIntelEditIcon(iconKey as MarkerIcon)}
                          title={MARKER_ICON_LABELS[iconKey as MarkerIcon]}
                          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                            intelEditIcon === iconKey
                              ? "border-primary bg-primary/10 scale-110"
                              : "border-border bg-accent/30 hover:border-primary/50"
                          }`}
                        >
                          <img
                            src={getMarkerDataUrl(iconKey as MarkerIcon, intelEditColour)}
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

            {/* Colour picker */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Colour</p>
              <div className="flex gap-2">
                {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map((col) => (
                  <button
                    key={col}
                    onClick={() => setIntelEditColour(col)}
                    title={MARKER_COLOUR_LABELS[col]}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      intelEditColour === col ? "border-foreground scale-110" : "border-transparent hover:border-foreground/40"
                    }`}
                    style={{ background: MARKER_COLOURS[col] }}
                  />
                ))}
              </div>
            </div>

            {/* Rotation */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rotation — {intelEditRotation}°</p>
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                  <img
                    src={getMarkerDataUrl(intelEditIcon, intelEditColour)}
                    alt="preview"
                    className="w-8 h-8 object-contain transition-transform"
                    style={{ transform: `rotate(${intelEditRotation}deg)` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={intelEditRotation}
                  onChange={(e) => setIntelEditRotation(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <div className="flex gap-1">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setIntelEditRotation(deg)}
                      title={`${deg}°`}
                      className={`w-6 h-6 text-[9px] rounded border transition-all ${
                        intelEditRotation === deg ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      {deg === 0 ? "N" : deg === 45 ? "NE" : deg === 90 ? "E" : deg === 135 ? "SE" : deg === 180 ? "S" : deg === 225 ? "SW" : deg === 270 ? "W" : "NW"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setEditingIntelLabel(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!editingIntelLabel) return;
                  // Persist to localStorage
                  try {
                    localStorage.setItem(`runlog_intel_appearance_${editingIntelLabel}`, JSON.stringify({
                      icon: intelEditIcon,
                      colour: intelEditColour,
                      rotation: intelEditRotation,
                    }));
                  } catch { /* ignore */ }
                  // Update the actual map marker element immediately
                  const markerEntry = markersRef.current.find((m: any) => m.title === editingIntelLabel);
                  if (markerEntry?.content instanceof HTMLElement) {
                    const img = markerEntry.content.querySelector('img') as HTMLImageElement | null;
                    if (img) {
                      img.src = getMarkerDataUrl(intelEditIcon, intelEditColour);
                      img.style.transform = `rotate(${intelEditRotation}deg)`;
                    }
                  }
                  setEditingIntelLabel(null);
                  toast.success("Marker appearance saved");
                }}
              >
                Save Changes
              </Button>
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

            {/* Time picker — slim inline row */}
            <div className="flex items-center gap-1 mb-3">
              <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-[10px] text-muted-foreground font-medium mr-0.5">Time:</span>
              {/* Hour */}
              <Select
                value={mapQeHour}
                onOpenChange={(o) => setMapQeSelectOpen(o)}
                onValueChange={(v) => {
                  setMapQeHour(v);
                  setMapQeTimeOverride(`${String(parseInt(v)).padStart(2,"0")}:${mapQeMinute} ${mapQePeriod}`);
                }}
              >
                <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
                    <SelectItem key={h} value={h} className="font-mono text-xs">
                      {String(parseInt(h)).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground font-mono text-[11px]">:</span>
              {/* Minute */}
              <Select
                value={mapQeMinute}
                onOpenChange={(o) => setMapQeSelectOpen(o)}
                onValueChange={(v) => {
                  setMapQeMinute(v);
                  setMapQeTimeOverride(`${String(parseInt(mapQeHour)).padStart(2,"0")}:${v} ${mapQePeriod}`);
                }}
              >
                <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* AM/PM */}
              <Select
                value={mapQePeriod}
                onOpenChange={(o) => setMapQeSelectOpen(o)}
                onValueChange={(v) => {
                  setMapQePeriod(v);
                  setMapQeTimeOverride(`${String(parseInt(mapQeHour)).padStart(2,"0")}:${mapQeMinute} ${v}`);
                }}
              >
                <SelectTrigger className="w-14 h-6 text-[11px] px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM" className="text-xs">AM</SelectItem>
                  <SelectItem value="PM" className="text-xs">PM</SelectItem>
                </SelectContent>
              </Select>
              {/* Now button */}
              <button
                onClick={() => {
                  const n = new Date();
                  const h24 = n.getHours(); const min = n.getMinutes();
                  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                  const ampm = h24 < 12 ? "AM" : "PM";
                  setMapQeHour(String(h12));
                  setMapQeMinute(String(min).padStart(2, "0"));
                  setMapQePeriod(ampm);
                  setMapQeTimeOverride(`${String(h12).padStart(2,"0")}:${String(min).padStart(2,"0")} ${ampm}`);
                }}
                className="ml-1 text-[10px] text-primary hover:text-primary/80 underline font-medium"
              >Now</button>
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
                      <button
                        onClick={() => { setMapQeOpen(false); setMapQeAddress(""); closeInlineField(); setLocation(`/sheet/${rsSelectedSheetId}`); }}
                        className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 active:scale-[0.98] transition-all min-w-0"
                      >
                        <MapIcon className="h-3 w-3 text-primary flex-shrink-0" />
                        <span className="text-[11px] font-semibold text-primary truncate">{sheet.title || `Sheet #${sheet.id}`}</span>
                        <ExternalLink className="h-3 w-3 text-primary/60 flex-shrink-0 ml-auto" />
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

                {/* DEP / ARR */}
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

                {/* Inline observation field */}
                {rsInlineLabel && (() => {
                  const selectedSheet = (rsSheetsData as any[] | undefined)?.find((s: any) => s.id === rsSelectedSheetId);
                  const rosterCins: string[] = [];
                  if (selectedSheet?.sheetCins) {
                    try {
                      const parsed: Array<{ cin: string; isTeamLeader?: boolean }> = typeof selectedSheet.sheetCins === "string"
                        ? JSON.parse(selectedSheet.sheetCins)
                        : selectedSheet.sheetCins;
                      parsed
                        .sort((a, b) => {
                          if (a.isTeamLeader && !b.isTeamLeader) return -1;
                          if (!a.isTeamLeader && b.isTeamLeader) return 1;
                          const numA = parseInt(a.cin ?? "", 10);
                          const numB = parseInt(b.cin ?? "", 10);
                          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                          return (a.cin ?? "").localeCompare(b.cin ?? "");
                        })
                        .forEach(c => { if (c.cin) rosterCins.push(c.cin); });
                    } catch { /* ignore */ }
                  }
                  return (
                    <div className="rounded-lg border border-border bg-muted/40 p-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Observation</span>
                      </div>
                      <textarea
                        ref={rsInlineInputRef}
                        value={rsInlineText}
                        onChange={(e) => { setRsInlineText(e.target.value); resetInlineTimer(); }}
                        onFocus={resetInlineTimer}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Tab") {
                            const textarea = e.currentTarget;
                            const pos = textarea.selectionStart ?? 0;
                            const textBefore = rsInlineText.slice(0, pos);
                            const match = textBefore.match(/(\S+)$/);
                            if (match) {
                              const word = match[1].toLowerCase();
                              const expansion = mapQeShortcutMap[word];
                              if (expansion) {
                                e.preventDefault();
                                const before = textBefore.slice(0, textBefore.length - match[1].length);
                                const after = rsInlineText.slice(pos);
                                const newText = before + expansion + " " + after;
                                setRsInlineText(newText);
                                resetInlineTimer();
                                requestAnimationFrame(() => {
                                  const newPos = before.length + expansion.length + 1;
                                  textarea.setSelectionRange(newPos, newPos);
                                });
                              }
                            }
                          }
                        }}
                        placeholder="Add details (optional)…"
                        rows={4}
                        className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      {/* Shortcut buttons */}
                      {(() => {
                        const appendText = (text: string) => { setRsInlineText(prev => prev ? `${prev} ${text}` : text); resetInlineTimer(); rsInlineInputRef.current?.focus(); };
                        const findShortcut = (trigger: string) => {
                          const tgt = (targetShortcuts as any[] | undefined)?.find((s: any) => s.trigger?.toLowerCase() === trigger.toLowerCase());
                          if (tgt) return tgt.expansion as string;
                          const gen = (generalShortcuts as any[] | undefined)?.find((s: any) => s.trigger?.toLowerCase() === trigger.toLowerCase());
                          return gen ? gen.expansion as string : null;
                        };
                        // Helper: extract registration/short value for display preview
                        // A rego must be 3-8 alphanumeric chars AND contain at least one digit OR letter
                        const extractReg = (val: string | null | undefined): string | null => {
                          if (!val) return null;
                          const stripped = val.replace(/^Vehicle\s+/i, '').trim();
                          const tokens = stripped.split(/\s+/).map(t => t.replace(/[^A-Z0-9]/gi, ''));
                          const rego = tokens.slice().reverse().find(t => /^[A-Z0-9]{3,8}$/i.test(t) && /\d/.test(t) && /[A-Z]/i.test(t));
                          if (rego) return rego;
                          // Fallback: if stripped value looks like a plate (3-8 chars, alphanumeric), use it directly
                          if (/^[A-Z0-9]{3,8}$/i.test(stripped)) return stripped;
                          return null;
                        };
                        // Build dynamic extra vehicle chips from assignedTarget JSON
                        // Each extra vehicle gets both a VnF chip (full value, trigger-only label) and a Vn chip (rego-only)
                        const extraVehicleChips: Array<{ label: string; display: string; getValue: () => string | null }> = [];
                        try {
                          const evs: Array<{ full: string; short: string }> = JSON.parse((assignedTarget as any)?.extraVehicles ?? '[]');
                          evs.forEach((ev, i) => {
                            const num = i + 2;
                            if (ev.full) extraVehicleChips.push({ label: `V${num}F`, display: `V${num}F`, getValue: () => ev.full });
                            if (ev.short) {
                              const reg = extractReg(ev.short);
                              extraVehicleChips.push({ label: `V${num}`, display: reg ? `V${num} ${reg}` : `V${num}`, getValue: () => ev.short });
                            }
                          });
                        } catch {}
                        // Wild field chips — show full value (truncated to 12 chars)
                        const wildChips: Array<{ label: string; display: string; getValue: () => string | null }> = [];
                        try {
                          const wfs: Array<{ label: string; value: string }> = JSON.parse((assignedTarget as any)?.wildFields ?? '[]');
                          wfs.forEach((wf) => {
                            if (wf.value) {
                              const preview = wf.value.trim().slice(0, 12) + (wf.value.trim().length > 12 ? '…' : '');
                              wildChips.push({ label: wf.label, display: `${wf.label} ${preview}`, getValue: () => wf.value });
                            }
                          });
                        } catch {}
                        // V1F and V1 chips — only shown if the target has those fields set
                        const v1fVal = rsTargetData?.v1f ?? null;
                        const v1Val = rsTargetData?.v1 ?? null;
                        const v1Reg = extractReg(v1Val);
                        // All shortcut-folder triggers as chips (trigger only, always present) — exclude legacy 'D' chip
                        const folderShortcutChips: Array<{ label: string; display: string; getValue: () => string | null }> =
                          (generalShortcuts as any[] ?? []).filter((s: any) => (s.trigger as string).toUpperCase() !== "D").map((s: any) => ({
                            label: (s.trigger as string).toUpperCase(),
                            display: (s.trigger as string).toUpperCase(),
                            getValue: () => findShortcut(s.trigger) ?? s.expansion as string,
                          }));
                        const shortcuts: Array<{ label: string; display: string; getValue: () => string | null }> = [
                          { label: "HBF", display: "HBF", getValue: () => rsTargetData?.hbf ?? null },
                          { label: "V1F", display: "V1F", getValue: () => v1fVal },
                          { label: "V1",  display: v1Reg ? `V1 ${v1Reg}` : "V1", getValue: () => v1Val },
                          ...extraVehicleChips,
                          { label: "TGT", display: "TGT", getValue: () => rsTargetData?.tgt ?? rsTargetData?.name ?? null },
                          ...wildChips,
                          ...folderShortcutChips,
                        ];
                        const available = shortcuts.filter(s => s.getValue() !== null);
                        if (available.length === 0) return null;
                        // Apply saved order
                        const orderedChips = qeChipOrder.length > 0
                          ? [
                              ...qeChipOrder.map(lbl => available.find(s => s.label === lbl)).filter(Boolean) as typeof available,
                              ...available.filter(s => !qeChipOrder.includes(s.label)),
                            ]
                          : available;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              // Chip display rules for QE modal:
                              // - Vn short chips (V1, V2, V3...): show label + rego (from s.display which already has rego)
                              // - VnF full chips, TGT, HBF, HB, DEP, ARR, folder shortcuts: trigger only
                              const folderQeLabels = new Set([
                                "TGT", "HBF", "HB", "V1F", "V2F", "DEP", "ARR",
                                ...(generalShortcuts as any[] ?? []).map((s: any) => (s.trigger as string).toUpperCase()),
                              ]);
                              const isVnShortQe = (label: string) => /^V\d+$/.test(label); // V1, V2, V3 — show rego
                              const isTargetDetailChip = (label: string) => /^V\d+F$/.test(label); // VnF — trigger only
                              const doQeReorder = (fromLabel: string, toLabel: string) => {
                                if (!fromLabel || fromLabel === toLabel) return;
                                const labels = orderedChips.map(x => x.label);
                                const fromIdx = labels.indexOf(fromLabel);
                                const toIdx = labels.indexOf(toLabel);
                                if (fromIdx === -1 || toIdx === -1) return;
                                const newOrder = [...labels];
                                newOrder.splice(fromIdx, 1);
                                newOrder.splice(toIdx, 0, fromLabel);
                                setQeChipOrder(newOrder);
                                try { localStorage.setItem("runlog_qe_chip_order", JSON.stringify(newOrder)); } catch {};
                              };
                              return orderedChips.map((s) => {
                                const isStdQe = folderQeLabels.has(s.label);
                                return (
                                  <div
                                    key={s.label}
                                    // Desktop HTML5 drag — draggable on the div itself (it IS the interactive element)
                                    draggable
                                    onDragStart={(e) => {
                                      qeChipDragRef.current.dragging = s.label;
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const fromLabel = qeChipDragRef.current.dragging;
                                      if (fromLabel) doQeReorder(fromLabel, s.label);
                                      qeChipDragRef.current.dragging = null;
                                    }}
                                    onDragEnd={() => { qeChipDragRef.current.dragging = null; }}
                                    // Touch drag — 8px threshold before entering drag mode
                                    onTouchStart={(e) => {
                                      qeChipDragRef.current.dragging = null;
                                      qeChipDragRef.current.startX = e.touches[0].clientX;
                                      qeChipDragRef.current.startY = e.touches[0].clientY;
                                    }}
                                    onTouchMove={(e) => {
                                      const touch = e.touches[0];
                                      const dx = touch.clientX - qeChipDragRef.current.startX;
                                      const dy = touch.clientY - qeChipDragRef.current.startY;
                                      const dist = Math.sqrt(dx * dx + dy * dy);
                                      if (dist > 8) {
                                        if (!qeChipDragRef.current.dragging) {
                                          qeChipDragRef.current.dragging = s.label;
                                        }
                                        e.preventDefault();
                                        const el = document.elementFromPoint(touch.clientX, touch.clientY);
                                        const chipEl = el?.closest('[data-qe-chip]') as HTMLElement | null;
                                        if (chipEl) {
                                          const overLabel = chipEl.dataset.qeChip;
                                          if (overLabel && overLabel !== qeChipDragRef.current.dragging) {
                                            doQeReorder(qeChipDragRef.current.dragging!, overLabel);
                                            qeChipDragRef.current.dragging = overLabel;
                                          }
                                        }
                                      }
                                    }}
                                    onTouchEnd={(e) => {
                                      if (!qeChipDragRef.current.dragging) {
                                        e.preventDefault();
                                        const v = s.getValue(); if (v) appendText(v);
                                      }
                                      qeChipDragRef.current.dragging = null;
                                    }}
                                    // Desktop click: insert text only if this wasn't a drag
                                    // NOTE: do NOT call e.preventDefault() on mouseDown here —
                                    // that would block the HTML5 dragstart event on desktop.
                                    onClick={() => {
                                      if (!qeChipDragRef.current.dragging) {
                                        const v = s.getValue(); if (v) appendText(v);
                                      }
                                    }}
                                    data-qe-chip={s.label}
                                    className="cursor-grab active:cursor-grabbing px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 active:scale-95 transition-all select-none"
                                  >
                                    {/* Vn short: show display (label + rego); VnF/folder/TGT: show label only */}
                                    {isVnShortQe(s.label) ? s.display : (isStdQe || isTargetDetailChip(s.label)) ? s.label : s.display}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        );
                      })()}
                      {/* Address chips — full RS address and short street address */}
                      {mapQeAddress && (() => {
                        const appendText = (text: string) => { setRsInlineText(prev => prev ? `${prev} ${text}` : text); resetInlineTimer(); rsInlineInputRef.current?.focus(); };
                        // Extract short address from bracket code: e.g. "21 Olding Way, MELVILLE WA (21 OLDING WAY)" → "21 Olding Way"
                        const bracketMatch = mapQeAddress.match(/^(.*?)(?:,\s*[A-Z][\w\s]+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))\s*\(([^)]+)\)/);
                        // Short address: title-case the bracket code content (e.g. "21 OLDING WAY" → "21 Olding Way")
                        const toTitleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                        const shortAddr = bracketMatch
                          ? toTitleCase(bracketMatch[2])
                          : mapQeAddress.split(",")[0]?.trim() ?? mapQeAddress;
                        return (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => appendText(mapQeAddress)}
                              className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/30 bg-teal-500/5 text-teal-400 hover:bg-teal-500/15 active:scale-[0.98] transition-all"
                            >
                              <span className="text-[9px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">Full Address</span>
                              <span className="text-[10px] font-mono leading-tight break-all">{mapQeAddress}</span>
                            </button>
                            <button
                              onClick={() => appendText(shortAddr)}
                              className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/20 bg-teal-500/5 text-teal-300 hover:bg-teal-500/10 active:scale-[0.98] transition-all"
                            >
                              <span className="text-[9px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">Short Address</span>
                              <span className="text-[10px] font-mono leading-tight">{shortAddr}</span>
                            </button>
                          </div>
                        );
                      })()}
                      {/* CIN picker — multi-select with TEAM */}
                      {rosterCins.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => { const allSel = rosterCins.every(c => rsInlineCins.has(c)); const next = allSel ? new Set<string>() : new Set(rosterCins); setRsInlineCins(next); rsInlineCinsRef.current = next; resetInlineTimer(); }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${rosterCins.every(c => rsInlineCins.has(c)) ? "bg-amber-500/20 border-amber-500/60 text-amber-400" : "bg-muted/40 border-amber-500/30 text-amber-500/80 hover:bg-amber-500/10"}`}
                          >TEAM</button>
                          {rosterCins.map((cin) => (
                            <button key={cin} onClick={() => { const next = new Set(rsInlineCins); if (next.has(cin)) { next.delete(cin); } else { next.add(cin); } setRsInlineCins(next); rsInlineCinsRef.current = next; resetInlineTimer(); }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${rsInlineCins.has(cin) ? "bg-primary/20 border-primary/60 text-primary" : "bg-muted/40 border-border text-foreground/80 hover:bg-muted/70 hover:text-foreground"}`}>
                              {cin}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={submitInlineField} disabled={rsAddingRow}
                          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50">
                          {rsAddingRow ? <Spinner className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                          Submit
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Quick action buttons removed per user request */}

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

            {/* 0. Location / Business Name — shown at top for quick identification */}
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

            {/* 0b. Address */}
            <div className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Address</p>
              <input
                type="text"
                value={cmAddress}
                onChange={(e) => setCmAddress(e.target.value)}
                placeholder="Auto-filled from coordinates…"
                className="w-full text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* 0c. Notes — directly below address */}
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

            {/* 4. (Label moved to top, Operation/Person/Vehicle removed) */}


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
