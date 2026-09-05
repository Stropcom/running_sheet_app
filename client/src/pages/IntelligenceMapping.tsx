import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RS_CANONICAL_CHIP_ORDER } from "@/lib/rsChipOrder";
import {
  getMarkerDataUrl,
  getMarkerSvg,
  MARKER_COLOURS,
  MARKER_COLOUR_LABELS,
  MARKER_ICON_GROUPS,
  MARKER_ICON_LABELS,
  type MarkerColour,
  type MarkerIcon,
} from "@/lib/markerSvgs";
import {
  convertGoogleAddresses,
  buildPoiAddress,
  formatIntelAddress,
  formatIntelVehicle,
  expandIntelVehicleToFullForm,
  ensureBracketCode,
} from "@/lib/addressFormat";
import {
  getCaretPixelPosition,
  detectMentionTrigger,
  detectVehicleMentionTrigger,
  detectAddressSpaceCompletion,
  detectPersonNameSpaceCompletion,
  computeUsedBracketCodes,
  computeUsedVehicleRegos,
  computeUsedAddressLabels,
  type PersonMentionSuggestion,
} from "@/lib/mentionAutocomplete";
import { MissingLocationAlert } from "@/components/MissingLocationAlert";
import { VagueVehicleMatchAlert } from "@/components/VagueVehicleMatchAlert";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { MapView } from "@/components/Map";
import { SmeacMapOverlay } from "@/components/SmeacMapOverlay";
import { UcoGuideMapOverlay } from "@/components/UcoGuideMapOverlay";
import { TargetProfileContent } from "@/components/TargetProfileContent";
import { OperationProfileContent } from "@/components/OperationProfileContent";
import SheetDetail from "@/pages/SheetDetail";
// The Images page's own folder/gallery levels, reused verbatim so the pane and
// the full page can't drift apart.
import { SheetFolderList, SheetGallery } from "@/pages/ImagesPage";
import { DocumentZoomViewer } from "@/components/DocumentZoomViewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Settings2,
  X,
  Radio,
  AlertTriangle,
  FolderOpen,
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
  Settings,
  Clock,
  Image as ImageIcon,
  Undo2,
  Keyboard,
  Car,
  RefreshCw,
  Shapes,
  Circle as CircleIcon,
  Square,
  PieChart,
  Route,
} from "lucide-react";

// Phone/tablet (touch, no physical keyboard) vs laptop/desktop (mouse +
// physical keyboard) — viewport width can't tell these apart (a tablet in
// landscape is often wider than a small laptop window), so this checks
// actual touch capability instead. Laptop/desktop always has the RSQE
// observation field editable; phone/tablet starts it read-only so tapping
// it doesn't summon the on-screen keyboard (see rsInlineTypingMode).
function useIsTouchDevice(): boolean {
  const [isTouch] = useState(() =>
    typeof window !== "undefined"
      ? "ontouchstart" in window || navigator.maxTouchPoints > 0
      : false
  );
  return isTouch;
}

// ── Perth date helpers (shared with SheetDetail logic) ───────────────────────
const _PERTH_OFFSET_SUFFIX = "T00:00:00+08:00";
const _PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
const _PERTH_TIME_ZONE = "Australia/Perth";

function _ymdToPerthMs(ymd: string) {
  return new Date(`${ymd}${_PERTH_OFFSET_SUFFIX}`).getTime();
}

function _addDaysToYmd(ymd: string, days: number) {
  const perthMs = _ymdToPerthMs(ymd) + days * 86400000;
  const d = new Date(perthMs + _PERTH_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function _formatPerthDateLabel(ymd: string) {
  return new Date(`${ymd}${_PERTH_OFFSET_SUFFIX}`)
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: _PERTH_TIME_ZONE,
    })
    .toUpperCase();
}

function _getTodayPerthYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: _PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === "year")?.value ?? "1970";
  const month = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface IntelMapLocation {
  label: string;
  type: "target_address" | "associate_address" | "observation";
  linkedTargets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    operationId: number | null;
    operationName: string | null;
    addressLabel: string | null;
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
const ICON_MAP: Record<
  string,
  { Icon: React.ComponentType<{ className?: string }>; colour: string }
> = {
  ClipboardCheck: { Icon: ClipboardCheck, colour: "text-purple-400" },
  CalendarDays: { Icon: CalendarDays, colour: "text-cyan-400" },
  Zap: { Icon: Zap, colour: "text-yellow-400" },
  FolderSearch: { Icon: FolderSearch, colour: "text-violet-400" },
  BookOpen: { Icon: BookOpen, colour: "text-rose-400" },
  ScrollText: { Icon: ScrollText, colour: "text-slate-400" },
  FileText: { Icon: FileText, colour: "text-orange-400" },
  Trash2: { Icon: Trash2, colour: "text-red-400" },
  HelpCircle: { Icon: HelpCircle, colour: "text-sky-400" },
  User: { Icon: User, colour: "text-lime-400" },
  FolderOpen: { Icon: FolderOpen, colour: "text-teal-400" },
  Scale: { Icon: Scale, colour: "text-amber-400" },
  ClipboardList: { Icon: ClipboardList, colour: "text-amber-400" },
  ArrowRightLeft: { Icon: ArrowRightLeft, colour: "text-teal-400" },
  Network: { Icon: Network, colour: "text-emerald-400" },
  WifiOff: { Icon: WifiOff, colour: "text-orange-400" },
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
  {
    label: "Operation Mgmt",
    path: "/operation-management",
    icon: "ArrowRightLeft",
  },
  { label: "Court", path: "/court/statements", icon: "Scale" },
  { label: "To-Do", path: "/todo", icon: "ClipboardList" },
];

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: "Intel Profiles", path: "/intelligence", icon: "FolderSearch" },
  { label: "Governance", path: "/governance", icon: "ClipboardCheck" },
  { label: "Calendar", path: "/calendar", icon: "CalendarDays" },
];

// Key → nav item mapping (mirrors DashboardLayout SortableNavItem)
const NAV_KEY_MAP: Record<
  string,
  {
    path: string;
    Icon: React.ComponentType<{ className?: string }>;
    label: string;
    iconColor: string;
  }
> = {
  operations: {
    path: "/",
    Icon: FileText,
    label: "Operations",
    iconColor: "text-cyan-500",
  },
  governance: {
    path: "/governance",
    Icon: ClipboardCheck,
    label: "Governance",
    iconColor: "text-purple-500",
  },
  todo: {
    path: "/todo",
    Icon: ClipboardList,
    label: "To-Do",
    iconColor: "text-rose-500",
  },
  mapping: {
    path: "/intelligence/mapping",
    Icon: MapIcon,
    label: "Mapping",
    iconColor: "text-teal-500",
  },
  images: {
    path: "/images",
    Icon: ImageIcon,
    label: "Images",
    iconColor: "text-pink-400",
  },
  calendar: {
    path: "/calendar",
    Icon: CalendarDays,
    label: "Calendar",
    iconColor: "text-orange-500",
  },
  shortcuts: {
    path: "/shortcuts",
    Icon: Zap,
    label: "Shortcuts",
    iconColor: "text-yellow-500",
  },
  intelligence: {
    path: "/intelligence",
    Icon: FolderSearch,
    label: "Intelligence",
    iconColor: "text-violet-500",
  },
  targetRegistry: {
    path: "/target-registry",
    Icon: BookOpen,
    label: "Target Registry",
    iconColor: "text-rose-400",
  },
  operationManager: {
    path: "/operation-manager",
    Icon: ClipboardList,
    label: "Op Manager",
    iconColor: "text-purple-500",
  },
};

const LS_QUICK_LINKS_KEY = "runlog_map_quick_links";
const LS_MAP_SETTINGS_KEY = "runlog_map_settings";

// ── Map Shapes ─────────────────────────────────────────────────────────────────
// Transparent annotation shapes drawn on the map — see the mapShapes schema
// comment for the full picture. "sector" is the pizza-slice shape — Google
// Maps has no native overlay for one, so it's built as a Polygon from an arc
// of points (see sectorPolygonPath below), unlike circle/rectangle/line
// which map straight onto google.maps.Circle/Rectangle/Polyline.
type ShapeType = "circle" | "rectangle" | "sector" | "line";

const SHAPE_TYPE_LABELS: Record<ShapeType, string> = {
  circle: "Circle",
  rectangle: "Rectangle",
  sector: "Pizza Slice",
  line: "Line",
};

const DEFAULT_SHAPE_RADIUS_M = 150;
const DEFAULT_RECT_HALF_SIDE_M = 120;

/** Builds the point path for a circular sector ("pizza slice") — a Polygon
 * fan from the center out to an arc of points between startAngle and
 * endAngle (degrees, 0 = North, clockwise, same convention as marker
 * rotation) and back. Google Maps has no native sector overlay, so this is
 * the one shape type that has to be hand-built rather than using a stock
 * Circle/Rectangle/Polyline. Walks the arc in ~6° steps — fine enough to
 * look round at any radius this feature is used at (tens to low hundreds of
 * metres), without generating an excessive point count. */
// innerRadiusMeters, when > 0, cuts the tip off the pizza slice — instead
// of a wedge closing at the center, it closes as a ring band between the
// two radii (the outer arc out, then the inner arc back, no center vertex
// at all). Kept in the same function rather than a separate shape type,
// since it's the same sector geometry with one more parameter.
function sectorPolygonPath(
  center: google.maps.LatLngLiteral,
  radiusMeters: number,
  startAngle: number,
  endAngle: number,
  innerRadiusMeters = 0
): google.maps.LatLngLiteral[] {
  const centerLatLng = new google.maps.LatLng(center.lat, center.lng);
  // Normalise so the arc always sweeps clockwise from start to end, even
  // when the officer has dragged endAngle back past 0/360.
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 360;
  const steps = Math.max(2, Math.ceil(sweep / 6));

  const outerArc: google.maps.LatLngLiteral[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (sweep * i) / steps;
    const point = google.maps.geometry.spherical.computeOffset(
      centerLatLng,
      radiusMeters,
      angle
    );
    outerArc.push({ lat: point.lat(), lng: point.lng() });
  }

  if (innerRadiusMeters <= 0) {
    return [center, ...outerArc, center];
  }

  const innerArc: google.maps.LatLngLiteral[] = [];
  for (let i = steps; i >= 0; i--) {
    const angle = startAngle + (sweep * i) / steps;
    const point = google.maps.geometry.spherical.computeOffset(
      centerLatLng,
      innerRadiusMeters,
      angle
    );
    innerArc.push({ lat: point.lat(), lng: point.lng() });
  }
  return [...outerArc, ...innerArc];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const TEAM_COLOURS: Record<string, string> = {
  TEAM1: "#ec4899", // pink
  TEAM2: "#1976d2", // blue
  PTT: "#f9a825", // yellow
  null: "#6b7280", // grey for unassigned
};

function getTeamColour(team: string | null): string {
  return TEAM_COLOURS[team ?? "null"] ?? "#6b7280";
}

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#181818" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1b1b1b" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#2c2c2c" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a8a" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#373737" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3c3c3c" }],
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry",
    stylers: [{ color: "#4e4e4e" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
];

// ── Marker pop-up entity blocks ─────────────────────────────────────────────
// A long operation accumulates a lot of entities against a single address.
// Left unbounded they push the pop-up's action buttons (RS Quick Entry,
// Waze, Edit/Move) off the bottom of the map, so each block is capped and
// scrolls on its own — the target details and the associated entities can be
// scrolled independently of each other. `overscroll-behavior:contain` stops a
// flick that reaches the end of a list from carrying on into a map pan.
const POPUP_SCROLL =
  "max-height:150px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;";

/** Vehicle mentions arrive either as a raw target-card V1F ("White Toyota
 * Corolla, bearing WA registration 5IND123 (Vehicle 5IND123)") or already as
 * an entity short form — both go through the same formatter the Intelligence
 * folder uses, so a vehicle reads identically in both places. */
function popupVehicleLines(vehicles: string[], fontSize: string): string {
  return vehicles
    .map(
      v =>
        `<div style="font-size:${fontSize};color:#111;padding:1px 0;">${formatIntelVehicle(v)}</div>`
    )
    .join("");
}

/** Person mentions display one per line, same layout as popupVehicleLines —
 * a comma-joined paragraph reads as a single run-on line in the popup's
 * narrow width instead of a scannable list. */
function popupPersonLines(persons: string[], fontSize: string): string {
  return persons
    .map(
      p =>
        `<div style="font-size:${fontSize};color:#111;padding:1px 0;">${p}</div>`
    )
    .join("");
}

function buildInfoWindowContent(
  loc: IntelMapLocation,
  override?: {
    markerIcon?: string | null;
    markerColour?: string | null;
    rotation?: number | null;
  }
): string {
  const isTarget = loc.type === "target_address";
  const isAdditionalTargetAddress =
    !isTarget && loc.linkedTargets.some(t => t.addressLabel);
  const accentColor = isTarget ? "#dc2626" : "#7c3aed";
  const typeLabel = isTarget
    ? "TARGET ADDRESS"
    : isAdditionalTargetAddress
      ? "ADDITIONAL ADDRESS"
      : loc.type === "associate_address"
        ? "ASSOCIATE ADDRESS"
        : "OBSERVED LOCATION";
  const displayLabel = formatIntelAddress(loc.label);
  const encodedLabel = encodeURIComponent(loc.label);

  // Persisted appearance for this intel pin (server-saved override — see
  // intelPinOverrides — takes priority over the type-based default).
  const intelIcon: string = override?.markerIcon ?? "house_filled";
  const intelColour: string =
    override?.markerColour ?? (isTarget ? "red" : "purple");
  const intelRotation: number = override?.rotation ?? 0;

  const lines: string[] = [];

  // Type badge + label
  lines.push(`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <span style="background:${accentColor};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${typeLabel}</span>
    </div>
    <strong style="font-size:13px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${displayLabel}</strong>
  `);

  // Linked target details (for target_address).
  // The TGT alias and HBF are deliberately not repeated here: the alias is
  // already inside the target's own name, and the address is the pop-up's
  // heading directly above. Vehicles show in the Intelligence folder's form
  // rather than the raw V1F/V2F card text.
  if (isTarget && loc.linkedTargets.length > 0) {
    lines.push(`<div style="margin-top:6px;${POPUP_SCROLL}">`);
    for (const t of loc.linkedTargets) {
      lines.push(
        `<div style="margin-bottom:5px;padding:6px 8px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;">`
      );
      lines.push(
        `<div style="font-size:12px;font-weight:700;color:#111;margin-bottom:2px;">${t.name}</div>`
      );
      const tVehicles = [t.v1f, t.v2f].filter((v): v is string => !!v);
      if (tVehicles.length) lines.push(popupVehicleLines(tVehicles, "11px"));
      if (t.operationName)
        lines.push(
          `<div style="font-size:10px;color:#888;margin-top:2px;">Op: ${t.operationName}</div>`
        );
      lines.push(`</div>`);
    }
    lines.push(`</div>`);
  }

  // ── Associated entities ──────────────────────────────────────────────────
  // Linked targets (observation pins only), persons and vehicles share one
  // scroll container, so this list scrolls independently of the target
  // details above it.
  {
    const entityLines: string[] = [];

    if (!isTarget && loc.linkedTargets.length > 0) {
      entityLines.push(
        `<span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Linked Targets</span>`
      );
      for (const t of loc.linkedTargets) {
        entityLines.push(
          `<div style="font-size:12px;color:#111;padding:1px 0;">${t.name}${
            t.addressLabel
              ? `<span style="color:#7c3aed;font-weight:600;"> · ${t.addressLabel}</span>`
              : ""
          }</div>`
        );
      }
    }

    if (loc.assocPersons.length > 0) {
      entityLines.push(
        `<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Persons</span><div style="margin-top:2px">${popupPersonLines(loc.assocPersons, "12px")}</div></div>`
      );
    }

    if (loc.assocVehicles.length > 0) {
      entityLines.push(
        `<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Vehicles</span><div style="margin-top:2px">${popupVehicleLines(loc.assocVehicles, "12px")}</div></div>`
      );
    }

    if (entityLines.length)
      lines.push(
        `<div style="margin-top:6px;${POPUP_SCROLL}">${entityLines.join("")}</div>`
      );
  }

  // ── Action buttons (observed location only — same layout as custom marker popup) ──
  if (!isTarget) {
    const btnBase =
      "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
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
    sections.push(
      `<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${safeLabel}')" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
    );

    // Row 2: Waze | Street View
    if (loc.lat != null && loc.lng != null) {
      const lat = loc.lat;
      const lng = loc.lng;
      const navBtns = [
        `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
        `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="${btnBase}background:#4285f4;color:#fff;">Street View</a>`,
      ];
      sections.push(
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`
      );
    }

    // Row 3: Edit | Move
    const editBtn = `<button onclick="window.__intelOpenEditDialog('${safeLabel}')" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`;
    const moveBtn = `<button onclick="window.__intelStartMove('${safeLabel}')" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
    sections.push(
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtn}${moveBtn}</div>`
    );

    lines.push(sections.join(""));
  } else {
    // Target address: full button set matching observation popup
    const btnBase =
      "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
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
    sections.push(
      `<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${safeLabel}')" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
    );

    // Row 2: Waze | Street View
    if (loc.lat != null && loc.lng != null) {
      const lat = loc.lat;
      const lng = loc.lng;
      const navBtns = [
        `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
        `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="${btnBase}background:#4285f4;color:#fff;">Street View</a>`,
      ];
      sections.push(
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`
      );
    }

    // Row 3: Edit (appearance) | Move
    const editBtn = `<button onclick="window.__intelOpenEditDialog('${safeLabel}')" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`;
    const moveBtn = `<button onclick="window.__intelStartMove('${safeLabel}')" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
    sections.push(
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtn}${moveBtn}</div>`
    );

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
        const stored = localStorage.getItem(
          `runlog_intel_appearance_${sec.label}`
        );
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.icon) secIcon = parsed.icon;
          if (parsed.colour) secColour = parsed.colour;
          if (typeof parsed.rotation === "number")
            secRotation = parsed.rotation;
        }
      } catch {
        /* ignore */
      }

      const secTypeLabel =
        sec.type === "associate_address"
          ? "ASSOCIATE ADDRESS"
          : "OBSERVED LOCATION";
      lines.push(
        `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">`
      );
      lines.push(`
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="background:#7c3aed;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${secTypeLabel}</span>
        </div>
        <strong style="font-size:12px;color:#111;line-height:1.35;display:block;margin-bottom:2px;">${secLabel}</strong>
      `);
      const secEntityLines: string[] = [];
      if (sec.linkedTargets.length > 0) {
        secEntityLines.push(
          `<span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Linked Targets</span>`
        );
        for (const t of sec.linkedTargets) {
          secEntityLines.push(
            `<div style="font-size:12px;color:#111;padding:1px 0;">${t.name}</div>`
          );
        }
      }
      if (sec.assocPersons.length > 0) {
        secEntityLines.push(
          `<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Persons</span><div style="margin-top:2px">${popupPersonLines(sec.assocPersons, "12px")}</div></div>`
        );
      }
      if (sec.assocVehicles.length > 0) {
        secEntityLines.push(
          `<div style="margin-top:6px"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em">Vehicles</span><div style="margin-top:2px">${popupVehicleLines(sec.assocVehicles, "12px")}</div></div>`
        );
      }
      if (secEntityLines.length) {
        lines.push(
          `<div style="margin-top:4px;${POPUP_SCROLL}">${secEntityLines.join("")}</div>`
        );
      }

      // Action buttons for secondary observation (same as standalone observation)
      const secBtnBase =
        "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
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
      lines.push(
        `<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${secSafeLabel}')" style="${secBtnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
      );
      if (sec.lat != null && sec.lng != null) {
        const sLat = sec.lat;
        const sLng = sec.lng;
        lines.push(
          `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;"><a href="https://waze.com/ul?ll=${sLat},${sLng}&navigate=yes" target="_blank" style="${secBtnBase}background:#00bcd4;color:#fff;">Waze</a><a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sLat},${sLng}" target="_blank" style="${secBtnBase}background:#4285f4;color:#fff;">Street View</a></div>`
        );
      }
      lines.push(
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;"><button onclick="window.__intelOpenEditDialog('${secSafeLabel}')" style="${secBtnBase}background:#16a34a;color:#fff;border:none;">Edit</button><button onclick="window.__intelStartMove('${secSafeLabel}')" style="${secBtnBase}background:#0369a1;color:#fff;border:none;">Move…</button></div>`
      );
      lines.push(`</div>`);
    }
  }

  return `<div style="font-family:sans-serif;max-width:280px;color:#111">${lines.join("")}</div>`;
}

// ── Haversine distance helper (metres) ───────────────────────────────────────
function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IntelligenceMapping() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // SMEAC briefing overlay — opened via ?smeac=<id>, e.g. from the Post
  // notification. Purely additive: doesn't touch any map/marker state below.
  const search = useSearch();
  const smeacId = (() => {
    const raw = new URLSearchParams(search).get("smeac");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const closeSmeacOverlay = () => setLocation("/intelligence/mapping");

  // UCO Surveillance Deployment Guide overlay — opened via ?ucoGuide=<id>,
  // same mechanics as the SMEAC overlay above.
  const ucoGuideId = (() => {
    const raw = new URLSearchParams(search).get("ucoGuide");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const closeUcoGuideOverlay = () => setLocation("/intelligence/mapping");

  // Filter state — persisted in localStorage
  const [selectedOpIds, setSelectedOpIds] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).selectedOpIds ?? [];
    } catch {
      /* ignore */
    }
    return [];
  });
  // Track whether the user has explicitly interacted with the ops selector.
  // When true and selectedOpIds is empty, we show NO markers (user cleared).
  // When false and selectedOpIds is empty, fall back to rsSelectedOpId context.
  const [opsExplicitlySet, setOpsExplicitlySet] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const p = JSON.parse(s);
        return p.opsExplicitlySet ?? false;
      }
    } catch {
      /* ignore */
    }
    return false;
  });
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).selectedTargetIds ?? [];
    } catch {
      /* ignore */
    }
    return [];
  });
  const [opExpanded, setOpExpanded] = useState<Set<number>>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return new Set<number>(JSON.parse(s).opExpanded ?? []);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // Map position memory — persisted in localStorage
  const [mapInitialCenter, setMapInitialCenter] =
    useState<google.maps.LatLngLiteral>(() => {
      try {
        const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        if (s) {
          const p = JSON.parse(s).mapCenter;
          if (p && typeof p.lat === "number" && typeof p.lng === "number")
            return p;
        }
      } catch {
        /* ignore */
      }
      return { lat: -31.9505, lng: 115.8605 };
    });
  const [mapInitialZoom, setMapInitialZoom] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const z = JSON.parse(s).mapZoom;
        if (typeof z === "number") return z;
      }
    } catch {
      /* ignore */
    }
    return 11;
  });
  // Persist the user's chosen map type (roadmap / hybrid). Not plain
  // "satellite" — that's imagery with no street/business/number labels,
  // which isn't usable for this app; "hybrid" is the same imagery with
  // labels overlaid. Anyone with "satellite" already saved (from before
  // this was fixed) gets migrated to "hybrid" on read below.
  const [mapInitialTypeId, setMapInitialTypeId] = useState<string>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const t = JSON.parse(s).mapTypeId;
        if (typeof t === "string") return t === "satellite" ? "hybrid" : t;
      }
    } catch {
      /* ignore */
    }
    return "roadmap";
  });

  // Per-device ID — tab-unique, stored in sessionStorage so each browser tab gets its own ID.
  // This is critical: two tabs logged in as the same user must have different deviceIds so
  // the receiving tab can see the sharing tab's pin without its own sharing being on.
  const [deviceId] = useState<string>(() => {
    const ssKey = `runlog_tab_device_id`;
    const existing = sessionStorage.getItem(ssKey);
    if (existing) return existing;
    const newId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      sessionStorage.setItem(ssKey, newId);
    } catch {
      /* ignore */
    }
    return newId;
  });
  // Keep a ref so GPS callbacks always use the latest value
  // (deviceId is now stable for the tab lifetime, but ref is still needed for the GPS callbacks)
  // No server query needed — the ID is generated client-side per tab.

  // Location sharing state — read from localStorage immediately so the toggle shows the right state
  // before the server query resolves. The server query will confirm/correct it on mount.
  const [sharingEnabled, setSharingEnabled] = useState<boolean>(() => {
    try {
      const key = `runlog_sharing_u${typeof window !== "undefined" ? (localStorage.getItem("runlog_last_user_id") ?? "anon") : "anon"}`;
      const v = localStorage.getItem(key);
      return v === "true";
    } catch {
      return false;
    }
  });
  // Per-user visibility: Set of userIds that are hidden
  const [hiddenUsers, setHiddenUsers] = useState<Set<number>>(new Set());
  // Users currently being "live traced" — draws their recorded trail as a
  // line on the map, colour-matched to their team pin. Not persisted; each
  // session starts with tracing off.
  const [tracedUserIds, setTracedUserIds] = useState<Set<number>>(new Set());
  // Per-team visibility: Set of team keys that are hidden — persisted
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return new Set<string>(JSON.parse(s).hiddenTeams ?? []);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // Per-team collapsed (members hidden): Set of team keys — persisted
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return new Set<string>(JSON.parse(s).collapsedTeams ?? []);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // RS Quick Entry inline panel open/closed — persisted
  const [rsQeExpanded, setRsQeExpanded] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).rsQeExpanded ?? false;
    } catch {
      /* ignore */
    }
    return false;
  });
  const [mapDarkMode, setMapDarkMode] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).mapDarkMode ?? false;
    } catch {
      /* ignore */
    }
    return false;
  });
  // Operations dropdown open state
  const [opsDropdownOpen, setOpsDropdownOpen] = useState(false);
  // GPS error
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Whether device supports geolocation
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // Quick-link state
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
    try {
      const saved = localStorage.getItem(LS_QUICK_LINKS_KEY);
      if (saved) return JSON.parse(saved) as QuickLink[];
    } catch {
      /* ignore */
    }
    return DEFAULT_QUICK_LINKS;
  });
  const [editingQuickLinks, setEditingQuickLinks] = useState(false);

  // RS Actions pane state — persisted in localStorage
  const [rsActionsPaneOpen, setRsActionsPaneOpen] = useState(false);
  // Target/Operation profile sub-views shown inline within the right pane
  // (null = normal pane content). Mutually exclusive — opening one clears
  // the other, since both occupy the same pane body.
  const [paneTargetProfileId, setPaneTargetProfileId] = useState<number | null>(
    null
  );
  const [paneOperationProfileId, setPaneOperationProfileId] = useState<
    number | null
  >(null);
  // Operation Images, browsed inside the pane the same way the profiles are,
  // rather than navigating away to /images and losing the map. Two levels:
  // the operation's running-sheet folders, then one sheet's photos — mirroring
  // the Images page's own hierarchy (it reuses the very same components).
  const [paneImagesOpId, setPaneImagesOpId] = useState<number | null>(null);
  const [paneImagesSheetId, setPaneImagesSheetId] = useState<number | null>(
    null
  );
  // The Active running sheet, opened inline (view + edit) within the pane —
  // same idea as the Target/Operation profile sub-views above, so an officer
  // can work the sheet without leaving the map. Unlike those, this renders
  // the full SheetDetail page component itself (embedded mode — see its own
  // props), not a purpose-built read view.
  const [paneSheetDetailId, setPaneSheetDetailId] = useState<number | null>(
    null
  );
  // Pane width — resizable by dragging its left edge, remembered separately for the
  // normal pane content vs. the Target Profile sub-view (which wants more room)
  const [panelWidthNormal, setPanelWidthNormal] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const v = JSON.parse(s).panelWidthNormal;
        if (typeof v === "number") return v;
      }
    } catch {
      /* ignore */
    }
    return 320;
  });
  const [panelWidthProfile, setPanelWidthProfile] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const v = JSON.parse(s).panelWidthProfile;
        if (typeof v === "number") return v;
      }
    } catch {
      /* ignore */
    }
    return 480;
  });
  const paneResizeDraggingRef = useRef(false);
  const PANE_MIN_WIDTH = 288;
  // Any full-pane sub-view (profile, images, or the running sheet) gets the
  // wider remembered width — they're all content to read/browse/edit rather
  // than the compact settings list.
  const paneSubViewOpen =
    paneTargetProfileId !== null ||
    paneOperationProfileId !== null ||
    paneImagesOpId !== null ||
    paneSheetDetailId !== null;
  const activePaneWidth = paneSubViewOpen
    ? panelWidthProfile
    : panelWidthNormal;

  // Draggable pill bar vertical position (percentage from top, 5-95)
  const [pillBarTop, setPillBarTop] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) {
        const v = JSON.parse(s).pillBarTop;
        if (typeof v === "number") return v;
      }
    } catch {
      /* ignore */
    }
    return 90;
  });
  const pillBarDraggingRef = useRef(false);
  const pillBarLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pillBarIsDraggingRef = useRef(false);
  const [rsSelectedOpId, setRsSelectedOpId] = useState<number | null>(() => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).rsSelectedOpId ?? null;
    } catch {
      /* ignore */
    }
    return null;
  });
  const [rsSelectedSheetId, setRsSelectedSheetId] = useState<number | null>(
    () => {
      try {
        const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
        if (s) return JSON.parse(s).rsSelectedSheetId ?? null;
      } catch {
        /* ignore */
      }
      return null;
    }
  );
  // Quick-insert chips mined from this sheet's own observations so far
  // (surname / short address / vehicle rego) — same query SheetDetail uses,
  // so both surfaces show the same shared, server-computed chip set.
  const { data: rsEntityChips } = trpc.row.entityChips.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    { enabled: !!rsSelectedSheetId }
  );
  const [rsAddingRow, setRsAddingRow] = useState(false);
  const [rsLastEntry, setRsLastEntry] = useState<{
    label: string;
    time: string;
  } | null>(null);
  const isTouchDevice = useIsTouchDevice();

  // Inline observation field state
  const [rsInlineLabel, setRsInlineLabel] = useState<string | null>(null); // null = closed
  const [rsInlineText, setRsInlineText] = useState("");
  const [rsInlineCins, setRsInlineCins] = useState<Set<string>>(new Set()); // selected CINs for the inline entry (multi-select)
  const rsInlineCinsRef = useRef<Set<string>>(new Set()); // ref so mutation callback always sees latest
  const [rsCountdown, setRsCountdown] = useState<number>(30); // countdown seconds
  const rsInlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rsCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const rsInlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  // RSQE is built for tapping shortcut chips, not typing — the observation
  // textarea starts read-only (so focusing it, including the auto-focus on
  // open, never summons the on-screen keyboard) until the user taps directly
  // into the field to switch into typing mode.
  const [rsInlineTypingMode, setRsInlineTypingMode] = useState(false);
  // Undo history for the observation textarea — snapshots of the text
  // before each chip insert / shortcut expansion / burst of typing, so the
  // undo button can step backwards repeatedly (continuous undo).
  const [rsInlineUndoStack, setRsInlineUndoStack] = useState<string[]>([]);
  const rsInlineTypingPushRef = useRef<number>(0);

  // ── Inline mention autocomplete (person + vehicle) ──────────────────────
  // Same behaviour as SheetDetail's observation field — see
  // client/src/lib/mentionAutocomplete.ts, shared by both surfaces.
  const { data: rsInlineRows } = trpc.row.list.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    { enabled: !!rsSelectedSheetId }
  );
  const rsUsedBracketCodes = useMemo(
    () => computeUsedBracketCodes(rsInlineRows ?? []),
    [rsInlineRows]
  );
  const rsUsedVehicleRegos = useMemo(
    () => computeUsedVehicleRegos(rsInlineRows ?? []),
    [rsInlineRows]
  );
  const rsUsedAddressLabels = useMemo(
    () => computeUsedAddressLabels(rsInlineRows ?? []),
    [rsInlineRows]
  );
  const [rsMentionWord, setRsMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [rsMentionAnchor, setRsMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rsMentionActiveIndex, setRsMentionActiveIndex] = useState(0);
  const rsMentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [rsMentionQuery, setRsMentionQuery] = useState("");
  const { data: rsMentionResults } =
    trpc.intelligence.searchPersonMentions.useQuery(
      { query: rsMentionQuery },
      { enabled: rsMentionQuery.trim().length >= 2 }
    );
  const rsMentionSuggestions =
    rsMentionQuery.trim().length >= 2 ? (rsMentionResults ?? []) : [];
  const rsConfirmPersonMatch =
    trpc.intelligence.confirmPersonNameMatch.useMutation();

  const [rsVehicleMentionWord, setRsVehicleMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [rsVehicleMentionAnchor, setRsVehicleMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rsVehicleMentionActiveIndex, setRsVehicleMentionActiveIndex] =
    useState(0);
  const rsVehicleMentionDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [rsVehicleMentionQuery, setRsVehicleMentionQuery] = useState("");
  const { data: rsVehicleMentionResults } =
    trpc.intelligence.searchEntities.useQuery(
      {
        type: "vehicle",
        query: rsVehicleMentionQuery,
        excludeTargets: false,
      },
      { enabled: rsVehicleMentionQuery.trim().length >= 2 }
    );
  const rsVehicleMentionSuggestions = (
    rsVehicleMentionQuery.trim().length >= 2
      ? (rsVehicleMentionResults ?? [])
      : []
  ) as { key: string; label: string; rowCount: number }[];

  function closeRsMentionDropdown() {
    setRsMentionWord(null);
    setRsMentionAnchor(null);
    setRsMentionQuery("");
    setRsMentionActiveIndex(0);
    if (rsMentionDebounceRef.current)
      clearTimeout(rsMentionDebounceRef.current);
  }
  function closeRsVehicleMentionDropdown() {
    setRsVehicleMentionWord(null);
    setRsVehicleMentionAnchor(null);
    setRsVehicleMentionQuery("");
    setRsVehicleMentionActiveIndex(0);
    if (rsVehicleMentionDebounceRef.current)
      clearTimeout(rsVehicleMentionDebounceRef.current);
  }

  function selectRsMentionSuggestion(
    s: PersonMentionSuggestion,
    textarea: HTMLTextAreaElement
  ) {
    if (!rsMentionWord) return;
    const insertText = `${s.displayName} (${s.bracketCode})`;
    pushInlineUndo(rsInlineText);
    const newText =
      rsInlineText.slice(0, rsMentionWord.wordStart) +
      insertText +
      rsInlineText.slice(rsMentionWord.wordEnd);
    setRsInlineText(newText);
    if (s.targetId != null || s.associateId != null) {
      rsConfirmPersonMatch.mutate({
        spelling: s.bracketCode,
        targetId: s.targetId ?? undefined,
        associateId: s.associateId ?? undefined,
        correctSpelling: s.bracketCode,
      });
    }
    closeRsMentionDropdown();
    const newPos = rsMentionWord.wordStart + insertText.length;
    resetInlineTimer();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function selectRsVehicleMentionSuggestion(
    s: { key: string; label: string; rowCount: number },
    textarea: HTMLTextAreaElement
  ) {
    if (!rsVehicleMentionWord) return;
    const insertText = expandIntelVehicleToFullForm(s.label);
    pushInlineUndo(rsInlineText);
    const newText =
      rsInlineText.slice(0, rsVehicleMentionWord.wordStart) +
      insertText +
      rsInlineText.slice(rsVehicleMentionWord.wordEnd);
    setRsInlineText(newText);
    closeRsVehicleMentionDropdown();
    const newPos = rsVehicleMentionWord.wordStart + insertText.length;
    resetInlineTimer();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  // Right-pane collapsible RS Quick Entry panel state (separate from modal inline field)
  const [rsQeText, setRsQeText] = useState("");
  const [rsQeCins, setRsQeCins] = useState<Set<string>>(new Set());
  const rsQeInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Custom Marker Placement State ────────────────────────────────────────────
  const [placingMarker, setPlacingMarker] = useState(false); // placement mode active
  const [dismissedNoLocs, setDismissedNoLocs] = useState(false); // user dismissed the empty-state overlay
  const [pendingLatLng, setPendingLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // POI tap: shown when user taps a Google Maps business/POI pin
  const [poiTap, setPoiTap] = useState<{
    lat: number;
    lng: number;
    name: string;
    address: string;
  } | null>(null);
  // Action chooser: shown on tap-and-hold / right-click before user picks RS Quick Entry or Marker/Intel
  // intelLoc is set when the tap is on an intelligence-derived marker (target address / observation)
  const [actionChooser, setActionChooser] = useState<{
    lat: number;
    lng: number;
    address: string;
    intelLoc?: IntelMapLocation;
  } | null>(null);
  // RS Quick Entry from map: shown when user picks "RS Quick Entry" from the action chooser
  const [mapQeOpen, setMapQeOpen] = useState(false);
  const [mapQeTimeOverride, setMapQeTimeOverride] = useState<string | null>(
    null
  ); // "HH:MM AM/PM" or null for current time
  const [mapQeHour, setMapQeHour] = useState("12");
  const [mapQeMinute, setMapQeMinute] = useState("00");
  const [mapQePeriod, setMapQePeriod] = useState("AM");
  const [mapQeRowDate, setMapQeRowDate] = useState<string>(() =>
    _getTodayPerthYmd()
  ); // explicit calendar date for the QE row
  const [showMapQeDateStepper, setShowMapQeDateStepper] = useState(false); // toggled by Date button
  const [mapQeSelectOpen, setMapQeSelectOpen] = useState(false);
  const [mapQeAddress, setMapQeAddress] = useState(""); // pre-filled address for the observation
  // Quick Entry shortcut chip order — persisted to localStorage so user can reorder them.
  // Shared with SheetDetail's canonical order so the QE popup's fallback (used only
  // when a sheet has no saved custom order yet) can't drift out of sync with the main RS.
  const QE_CANONICAL_ORDER = RS_CANONICAL_CHIP_ORDER;
  // QE chips mirror the main RS chip order (read from the active sheet's localStorage key)
  // No drag in QE — main RS is the single source of truth for chip order
  const [qeChipOrder, setQeChipOrder] = useState<string[]>(QE_CANONICAL_ORDER);
  // Sync QE chip order from the active RS sheet's saved order whenever the sheet changes
  // Also listen to storage events so the QE updates live when chips are reordered on the main RS
  useEffect(() => {
    const syncOrder = () => {
      if (!rsSelectedSheetId) {
        setQeChipOrder(QE_CANONICAL_ORDER);
        return;
      }
      try {
        const s = localStorage.getItem(
          `runsheet_field_order_${rsSelectedSheetId}`
        );
        if (s) {
          setQeChipOrder(JSON.parse(s));
          return;
        }
      } catch {}
      setQeChipOrder(QE_CANONICAL_ORDER);
    };
    syncOrder();
    window.addEventListener("storage", syncOrder);
    return () => window.removeEventListener("storage", syncOrder);
  }, [rsSelectedSheetId]);
  const [cmLabel, setCmLabel] = useState("");
  const [cmAddress, setCmAddress] = useState("");
  const [cmNote, setCmNote] = useState("");
  const [cmOpId, setCmOpId] = useState<number | null>(null);
  const [cmPersons, setCmPersons] = useState<string[]>([]);
  const [cmVehicles, setCmVehicles] = useState<string[]>([]);
  const [cmIcon, setCmIcon] = useState<MarkerIcon>("house_filled");
  const [cmColour, setCmColour] = useState<MarkerColour>("red");
  const [cmRotation, setCmRotation] = useState(0);
  // "Label only" — the marker renders as just its label pill, no icon (see
  // the Add Shape feature's own note-label pill, which this borrows the
  // look of). Off by default so ordinary icon markers behave as before.
  const [cmLabelOnly, setCmLabelOnly] = useState(false);
  const [cmPersonInput, setCmPersonInput] = useState("");
  const [cmVehicleInput, setCmVehicleInput] = useState("");
  const [cmSaving, setCmSaving] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null);

  // ── Map Shape Placement State ────────────────────────────────────────────────
  // Transparent annotation shapes (circle/rectangle/sector/line) — see the
  // mapShapes schema comment. Purely visual (no target/person/vehicle
  // linkage, unlike custom markers), so the draft state here is deliberately
  // smaller than cm* above.
  // Shown right after "Add Shape Here" — lets the officer pick which of the
  // four shapes to place at the tapped point before a draft overlay appears.
  const [shapeTypePicker, setShapeTypePicker] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // The shape currently being placed (new) or edited (existing) — drives
  // both the live draggable/resizable overlay on the map and the bottom-
  // sheet panel. `id` is null for a new, not-yet-saved shape.
  const [pendingShape, setPendingShape] = useState<{
    id: number | null;
    shapeType: ShapeType;
    centerLat?: number;
    centerLng?: number;
    radiusMeters?: number;
    startAngle?: number;
    endAngle?: number;
    innerRadiusMeters?: number;
    neLat?: number;
    neLng?: number;
    swLat?: number;
    swLng?: number;
    points?: { lat: number; lng: number }[];
  } | null>(null);
  const [shapeColour, setShapeColour] = useState<MarkerColour>("blue");
  const [shapeOpacity, setShapeOpacity] = useState(30); // 0-100 %
  const [shapeLabel, setShapeLabel] = useState("");
  // A shape saved with no operation is hidden from any single/multi-
  // operation-filtered map view — same "silent default" trap as custom
  // markers had, see the Operation picker in the marker panel below for the
  // full explanation. Needs to be user-visible/correctable rather than
  // derived silently, since the derivation can only guess when exactly one
  // operation is in view.
  const [shapeOpId, setShapeOpId] = useState<number | null>(null);
  const [shapeSaving, setShapeSaving] = useState(false);
  // In-progress line: each map tap while this is set appends a vertex.
  // Kept separate from pendingShape (which only exists once the line has at
  // least its starting point AND the officer has tapped "Finish Line") so
  // the map's click handler can tell "still drawing" apart from "an
  // ordinary tap that should open the action chooser".
  const [drawingLine, setDrawingLine] = useState<{
    points: { lat: number; lng: number }[];
  } | null>(null);
  const draftShapeOverlayRef = useRef<
    | google.maps.Circle
    | google.maps.Rectangle
    | google.maps.Polygon
    | google.maps.Polyline
    | null
  >(null);
  // A sector's draft polygon path[0] means "center" for a plain wedge but
  // "first outer-arc point" once an inner radius is set — kept in sync
  // wherever the path is (re)built, so its dragend handler always has a
  // correct current reference to diff against, even after the officer has
  // toggled the inner-radius slider since the overlay was created (see
  // that handler for why a delta against this ref, not the point's
  // supposed identity, is what actually stays correct).
  const sectorDragAnchorRef = useRef<google.maps.LatLngLiteral | null>(null);
  // Mirrors drawingLine for the map's click listener (set up once in
  // handleMapReady, so it can't read the state value directly without
  // going stale — same reasoning as customMarkersDataRef above).
  const drawingLineRef = useRef<{
    points: { lat: number; lng: number }[];
  } | null>(null);
  useEffect(() => {
    drawingLineRef.current = drawingLine;
  }, [drawingLine]);
  // mapShapesDataRef itself is declared below, right after the mapShape
  // query it mirrors (it can't be declared here — mapShapesData doesn't
  // exist yet at this point in the component).

  // Opens the edit panel for an existing shape, populating the draft state
  // from its current saved fields.
  const beginEditShape = useCallback((s: any) => {
    setShapeColour((s.colour as MarkerColour) ?? "blue");
    setShapeOpacity(s.opacity ?? 30);
    setShapeLabel(s.label ?? "");
    setShapeOpId(s.operationId ?? null);
    setPendingShape({
      id: s.id,
      shapeType: s.shapeType,
      centerLat: s.centerLat ?? undefined,
      centerLng: s.centerLng ?? undefined,
      radiusMeters: s.radiusMeters ?? undefined,
      startAngle: s.startAngle ?? undefined,
      endAngle: s.endAngle ?? undefined,
      innerRadiusMeters: s.innerRadiusMeters ?? 0,
      neLat: s.neLat ?? undefined,
      neLng: s.neLng ?? undefined,
      swLat: s.swLat ?? undefined,
      swLng: s.swLng ?? undefined,
      points: s.points ?? undefined,
    });
  }, []);

  // Starts placing a brand-new shape of `type` centred/anchored at the
  // tapped point, with sensible defaults an officer can then drag/resize
  // (circle/rectangle) or adjust via sliders (sector) before saving. Line
  // is different — it has no single "default size", so this instead starts
  // drawingLine's click-to-add-vertex mode rather than an immediate draft.
  const beginCreateShape = useCallback(
    (type: ShapeType, lat: number, lng: number) => {
      setShapeColour("blue");
      setShapeOpacity(30);
      setShapeLabel("");
      const currentOpIds = effectiveOpIdsForMarkersRef.current;
      setShapeOpId(
        currentOpIds && currentOpIds.length === 1 ? currentOpIds[0] : null
      );
      if (type === "circle") {
        setPendingShape({
          id: null,
          shapeType: "circle",
          centerLat: lat,
          centerLng: lng,
          radiusMeters: DEFAULT_SHAPE_RADIUS_M,
        });
      } else if (type === "rectangle") {
        // Metres-per-degree approximation, fine at the scale this feature
        // operates at (tens to low hundreds of metres) — the officer can
        // drag-resize to the exact area needed afterwards anyway.
        const latOffset = DEFAULT_RECT_HALF_SIDE_M / 111_320;
        const lngOffset =
          DEFAULT_RECT_HALF_SIDE_M /
          (111_320 * Math.cos((lat * Math.PI) / 180));
        setPendingShape({
          id: null,
          shapeType: "rectangle",
          neLat: lat + latOffset,
          neLng: lng + lngOffset,
          swLat: lat - latOffset,
          swLng: lng - lngOffset,
        });
      } else if (type === "sector") {
        setPendingShape({
          id: null,
          shapeType: "sector",
          centerLat: lat,
          centerLng: lng,
          radiusMeters: DEFAULT_SHAPE_RADIUS_M,
          startAngle: 0,
          endAngle: 90,
          innerRadiusMeters: 0,
        });
      } else {
        setDrawingLine({ points: [{ lat, lng }] });
      }
    },
    []
  );

  // Address search bar state
  const [addrSearch, setAddrSearch] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [addrSearchOpen, setAddrSearchOpen] = useState(false);
  const autocompleteServiceRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const addrSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const addrSearchPinRef =
    useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  // Follow-me mode: keeps own tag centred on map
  const [followMode, setFollowMode] = useState(false);
  const followModeRef = useRef(false);
  // Own position ref — updated whenever liveUsers refreshes
  const ownPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  // ref for long-press on mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // custom marker map objects
  const customMarkersRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  // Merged intel data: custom marker ID → array of intel locations merged into this marker
  // Multiple intel pins (e.g. target_address + observation) can merge into the same house marker.
  // The array is always sorted with target_address entries first (red takes priority).
  const mergedIntelRef = useRef<Map<number, IntelMapLocation[]>>(new Map());
  // Latest custom markers data ref — kept in sync so placeMarker can access it without stale closure
  const customMarkersDataRef = useRef<any[]>([]);
  // All geocoded intel locations (label → {loc, position, secondaryLocs?}) for manual merge lookup
  const geocodedIntelRef = useRef<
    Map<
      string,
      {
        loc: IntelMapLocation;
        position: google.maps.LatLngLiteral;
        secondaryLocs?: IntelMapLocation[];
      }
    >
  >(new Map());
  // Manual merge picker state: which custom marker is being merged, and nearby intel candidates
  const [manualMergePicker, setManualMergePicker] = useState<{
    cmId: number;
    candidates: Array<{
      loc: IntelMapLocation;
      position: google.maps.LatLngLiteral;
      distanceM: number;
    }>;
  } | null>(null);

  // Move marker state: which marker is being dragged to a new position
  const [movingMarkerId, setMovingMarkerId] = useState<number | null>(null);
  const [pendingMoveAddress, setPendingMoveAddress] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);

  // Intel pin move state (separate from custom marker move — intel pins
  // persist to intelPinOverrides, a different table/flow than customMapMarkers)
  const [movingIntelLabel, setMovingIntelLabel] = useState<string | null>(null);
  const [pendingIntelMoveAddress, setPendingIntelMoveAddress] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  // Manual "refresh map data" button — re-pulls locations/customMarkers/
  // pinOverrides and forces a full pin rebuild, for the case where a pin
  // fails to populate and the officer doesn't want to wait for the next
  // poll (or worse, has to clear and reapply the operation filter to force
  // one — see the mapReady dependency fix on the locations render effect).
  const [mapRefreshing, setMapRefreshing] = useState(false);

  // Intel pin edit dialog state (appearance only — persisted to localStorage)
  const [editingIntelLabel, setEditingIntelLabel] = useState<string | null>(
    null
  );
  const [intelEditIcon, setIntelEditIcon] =
    useState<MarkerIcon>("house_filled");
  const [intelEditColour, setIntelEditColour] =
    useState<MarkerColour>("purple");
  const [intelEditRotation, setIntelEditRotation] = useState<number>(0);

  // Map state
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  // Direct img element refs for live rotation/icon updates without stale
  // `.content.querySelector` lookups — mirrors customMarkerImgRefs below,
  // keyed by the intel pin's location label (same key markersRef entries
  // are found by via `.title`).
  const intelPinImgRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  // Key: "userId_deviceId" for per-device pins
  const liveMarkersRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  // Key: userId — one trace polyline per traced officer
  const traceLinesRef = useRef<Map<number, google.maps.Polyline>>(new Map());
  // Remembers each user's last-known team so a trace line keeps its colour
  // even if that officer briefly drops out of the live liveUsers list.
  const traceUserTeamRef = useRef<Map<number, LiveUser["team"]>>(new Map());
  // Key: userId -> epoch ms when Track was switched on for that officer, so
  // each line starts where they started rather than showing earlier history.
  const trackStartsRef = useRef<Map<number, number>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const geocodeQueueRef = useRef<IntelMapLocation[]>([]);
  const geocodeIndexRef = useRef(0);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Persist map settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_MAP_SETTINGS_KEY,
        JSON.stringify({
          selectedOpIds,
          opsExplicitlySet,
          selectedTargetIds,
          opExpanded: Array.from(opExpanded),
          rsSelectedOpId,
          rsSelectedSheetId,
          hiddenTeams: Array.from(hiddenTeams),
          collapsedTeams: Array.from(collapsedTeams),
          rsQeExpanded,
          mapDarkMode,
          pillBarTop,
          panelWidthNormal,
          panelWidthProfile,
        })
      );
    } catch {
      /* ignore */
    }
  }, [
    selectedOpIds,
    opsExplicitlySet,
    selectedTargetIds,
    opExpanded,
    rsSelectedOpId,
    rsSelectedSheetId,
    hiddenTeams,
    collapsedTeams,
    rsQeExpanded,
    mapDarkMode,
    pillBarTop,
    panelWidthNormal,
    panelWidthProfile,
  ]);

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
        localStorage.setItem(
          LS_MAP_SETTINGS_KEY,
          JSON.stringify({ ...parsed, mapCenter: { lat, lng }, mapZoom: zoom })
        );
      } catch {
        /* ignore */
      }
    });
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [mapReady]);

  // Apply dark/light map style whenever mapDarkMode or mapReady changes
  // Dark mode is applied via CSS filter on the map container div (not setOptions — blocked by mapId)

  // Persist sharing state and current userId so it can be read before auth resolves
  useEffect(() => {
    try {
      if (user?.id) {
        localStorage.setItem("runlog_last_user_id", String(user.id));
        const key = `runlog_sharing_u${user.id}`;
        localStorage.setItem(key, String(sharingEnabled));
      }
    } catch {
      /* ignore */
    }
  }, [sharingEnabled, user?.id]);

  // Data
  const { data: operations, isLoading: opsLoading } =
    trpc.operation.list.useQuery();
  const {
    data: locations,
    isLoading: locsLoading,
    refetch: refetchLocations,
  } = trpc.intelligence.mappingLocations.useQuery(
    {
      operationIds: selectedOpIds.length > 0 ? selectedOpIds : undefined,
      targetIds: selectedTargetIds.length > 0 ? selectedTargetIds : undefined,
    },
    { refetchInterval: 30_000 }
  );

  // Live user locations — poll every 1 second
  const { data: liveUsers } = trpc.intelligence.userLocations.useQuery(
    { operationIds: selectedOpIds },
    { refetchInterval: 1000, enabled: true }
  );

  // Live trails for any officers currently being tracked. Each officer's
  // line starts at the moment Track was switched on for them (see
  // toggleUserTrace) — the query asks for everything since the earliest of
  // those starts, and each officer's points are then clipped to their own
  // start when the line is drawn.
  const traceUserIdsArray = useMemo(
    () => Array.from(tracedUserIds),
    [tracedUserIds]
  );
  // Rounded to the second so the query key doesn't churn on every render
  // (Date.now() as an input would refetch continuously).
  const trackSinceMs = useMemo(() => {
    const starts = traceUserIdsArray
      .map(id => trackStartsRef.current.get(id))
      .filter((t): t is number => typeof t === "number");
    const earliest = starts.length ? Math.min(...starts) : Date.now();
    return Math.floor(earliest / 1000) * 1000;
  }, [traceUserIdsArray]);
  const { data: traceHistories } =
    trpc.intelligence.userLocationHistories.useQuery(
      { userIds: traceUserIdsArray, sinceMs: trackSinceMs },
      { refetchInterval: 3000, enabled: traceUserIdsArray.length > 0 }
    );

  // Mutations — declared early so refs are available to GPS effects below
  const updateLocationMut = trpc.intelligence.updateUserLocation.useMutation();
  const clearLocationMut = trpc.intelligence.clearUserLocation.useMutation();
  const updateLocationMutRef = useRef(updateLocationMut);
  const clearLocationMutRef = useRef(clearLocationMut);
  useEffect(() => {
    updateLocationMutRef.current = updateLocationMut;
  });
  useEffect(() => {
    clearLocationMutRef.current = clearLocationMut;
  });

  // Custom map markers — poll every 5 seconds
  // Filter by selected operations so markers are scoped to the active operation.
  // When no operation is selected in Map Settings but an RS pane operation is active,
  // include rsSelectedOpId so custom markers for that operation are visible.
  // Pass empty array only when the user explicitly cleared the ops selector
  // (that's a deliberate "show nothing" per getCustomMarkers). When there's
  // truly no operation context at all, pass undefined — not [] — so the
  // server takes its "all ops" branch, which is the only one that includes
  // markers with no operation attached. [] and undefined are NOT
  // interchangeable here: getCustomMarkers treats [] as "nothing selected,
  // show nothing" and only shows unscoped markers when operationIds is
  // omitted entirely.
  const effectiveOpIdsForMarkers = useMemo((): number[] | undefined => {
    if (selectedOpIds.length > 0) return selectedOpIds;
    // If user explicitly cleared the selection, show nothing (don't fall back)
    if (opsExplicitlySet) return [];
    if (rsSelectedOpId !== null) return [rsSelectedOpId];
    return undefined;
  }, [selectedOpIds, opsExplicitlySet, rsSelectedOpId]);
  // Mirrored into a ref so beginCreateShape (declared earlier in the
  // component, before this value exists, and memoized with empty deps) can
  // read the current selection without closing over a stale snapshot from
  // its first render — same pattern as mapShapesDataRef/customMarkersDataRef.
  const effectiveOpIdsForMarkersRef = useRef<number[] | undefined>(undefined);
  useEffect(() => {
    effectiveOpIdsForMarkersRef.current = effectiveOpIdsForMarkers;
  }, [effectiveOpIdsForMarkers]);
  const utils = trpc.useUtils();
  // Paused while a marker is being dragged/confirmed (movingMarkerId !== null)
  // so the 5s poll can't land mid-move and hand the render effect below a
  // stale (pre-update) position — which snapped the marker straight back to
  // where it started, intermittently, right after "Accept".
  const { data: customMarkers, refetch: refetchCustomMarkers } =
    trpc.customMarker.list.useQuery(
      { operationIds: effectiveOpIdsForMarkers },
      { refetchInterval: movingMarkerId === null ? 5000 : false, enabled: true }
    );
  const createCustomMarkerMut = trpc.customMarker.create.useMutation({
    onSuccess: () => {
      void refetchCustomMarkers();
    },
  });
  const deleteCustomMarkerMut = trpc.customMarker.delete.useMutation({
    onSuccess: () => {
      void refetchCustomMarkers();
    },
  });
  const updateCustomMarkerMut = trpc.customMarker.update.useMutation({
    onMutate: async () => {
      // Belt-and-braces: also cancel any poll already in flight when the
      // move is accepted, so a stale response can't resolve after this
      // mutation's own refetch and undo it.
      await utils.customMarker.list.cancel();
    },
    onSuccess: () => {
      void refetchCustomMarkers();
    },
  });

  // Transparent annotation shapes (circle/rectangle/sector/line) — same
  // operation scoping as custom markers, same reason the poll pauses while
  // one is actively being placed/dragged/drawn.
  const { data: mapShapesData, refetch: refetchMapShapes } =
    trpc.mapShape.list.useQuery(
      { operationIds: effectiveOpIdsForMarkers },
      {
        refetchInterval: !pendingShape && !drawingLine ? 5000 : false,
      }
    );
  const createMapShapeMut = trpc.mapShape.create.useMutation({
    onSuccess: () => void refetchMapShapes(),
  });
  const updateMapShapeMut = trpc.mapShape.update.useMutation({
    onMutate: async () => {
      await utils.mapShape.list.cancel();
    },
    onSuccess: () => void refetchMapShapes(),
  });
  const deleteMapShapeMut = trpc.mapShape.delete.useMutation({
    onSuccess: () => void refetchMapShapes(),
  });
  // Latest map shapes data ref — lets a shape's click listener (attached
  // once, at creation) read this shape's CURRENT saved fields rather than
  // the stale snapshot captured when the listener was first attached — the
  // exact bug this pattern fixed for custom markers earlier.
  const mapShapesDataRef = useRef<any[]>([]);
  useEffect(() => {
    mapShapesDataRef.current = (mapShapesData as any[] | undefined) ?? [];
  }, [mapShapesData]);

  // Manual position/appearance corrections for intel pins (entities mined
  // from observation text) — a move or an icon/colour/rotation change used
  // to only live in an in-memory ref or localStorage, so it never actually
  // persisted past a refresh, let alone showed up on another device. See
  // the intelPinOverrides schema comment.
  const { data: pinOverrides, refetch: refetchPinOverrides } =
    trpc.intelligence.getPinOverrides.useQuery(undefined, {
      // Without this, a correction saved on one device only ever reached
      // another device when that device's own component happened to
      // remount (navigating out of the map and back in) — this query had
      // no poll at all, unlike locations (30s) and customMarkers (5s).
      // Paused during an active move/rotate on THIS device for the same
      // reason customMarkers' poll pauses then — a poll landing mid-drag
      // could hand the render effect a position that hasn't caught up to
      // what's being dragged yet.
      refetchInterval:
        movingMarkerId === null && movingIntelLabel === null ? 5000 : false,
    });
  const pinOverridesRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    const map = new Map<string, any>();
    for (const o of (pinOverrides as any[] | undefined) ?? []) {
      map.set(o.label, o);
    }
    pinOverridesRef.current = map;
  }, [pinOverrides]);
  const savePinOverrideMut = trpc.intelligence.savePinOverride.useMutation({
    onMutate: async () => {
      await utils.intelligence.getPinOverrides.cancel();
    },
    onSuccess: () => {
      void refetchPinOverrides();
    },
  });

  // Intelligence entities for associate/vehicle dropdowns
  const { data: intelEntities } = trpc.intelligence.getEntities.useQuery();
  const assocPersonOptions = useMemo(() => {
    if (!intelEntities) return [];
    return (intelEntities as any[])
      .filter((e: any) => e.type === "person")
      .map((e: any) => e.label as string);
  }, [intelEntities]);
  const vehicleOptions = useMemo(() => {
    if (!intelEntities) return [];
    return (intelEntities as any[])
      .filter((e: any) => e.type === "vehicle")
      .map((e: any) => e.label as string);
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

  // RS Actions pane — sheets driven by the top Operations filter
  // When selectedOpIds is non-empty, fetch sheets for all selected operations.
  // When selectedOpIds is empty (ops cleared), return no sheets.
  const rsOpIdsForSheets = useMemo(() => selectedOpIds, [selectedOpIds]);
  const { data: rsSheetsData } = trpc.sheet.listByOperations.useQuery(
    { operationIds: rsOpIdsForSheets },
    { enabled: rsOpIdsForSheets.length > 0 }
  );
  // Vehicles that departed somewhere on THIS sheet and haven't since
  // arrived anywhere — surfaced as a "Vehicle arriving" chip in RS Quick
  // Entry so the officer doesn't have to retype the occupant description.
  // Deliberately scoped to just this sheet, not the whole operation — these
  // are one-shift, one-use chips that don't carry over to the next sheet.
  const { data: rsPendingDepartures } =
    trpc.row.pendingVehicleDepartures.useQuery(
      { sheetId: rsSelectedSheetId ?? 0 },
      { enabled: mapQeOpen && !!rsSelectedSheetId }
    );
  // Vehicles that arrived somewhere on this sheet and haven't since
  // departed again — surfaced as a "Vehicle departing" chip so the officer
  // doesn't have to retype the occupant description from the last arrival.
  const { data: rsPendingArrivals } = trpc.row.pendingVehicleArrivals.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    { enabled: mapQeOpen && !!rsSelectedSheetId }
  );
  // Short-form of the quick-entry address (mirrors the extraction the
  // "Address chips" section below already does) — used only to check
  // whether this address has already been mentioned in the sheet, for the
  // vehicle-arriving chip's full-vs-short decision.
  const rsQeShortAddr = useMemo(() => {
    if (!mapQeAddress) return "";
    const bracketMatch = mapQeAddress.match(
      /^(.*?)(?:,\s*[A-Z][\w\s]+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))\s*\(([^)]+)\)/
    );
    const toTitleCase = (s: string) =>
      s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return bracketMatch
      ? toTitleCase(bracketMatch[2])
      : (mapQeAddress.split(",")[0]?.trim() ?? mapQeAddress);
  }, [mapQeAddress]);
  // Has this address already been mentioned (full bracketed form) anywhere
  // in this sheet? If so the vehicle-arriving chip uses the short form,
  // matching the app-wide first-mention-full/subsequent-mention-short rule
  // that Intelligence's entity extraction relies on.
  const { data: rsAddressMentionedData } = trpc.row.addressMentioned.useQuery(
    { sheetId: rsSelectedSheetId ?? 0, shortAddress: rsQeShortAddr },
    { enabled: mapQeOpen && !!rsSelectedSheetId && !!rsQeShortAddr }
  );
  // RS Actions pane — target for selected sheet
  const { data: rsTargetData } = trpc.intelligence.getSheetTarget.useQuery(
    { sheetId: rsSelectedSheetId! },
    { enabled: rsSelectedSheetId !== null }
  );
  // RS Actions pane — create row mutation
  const rsAddMember = trpc.member.add.useMutation();
  const rsCreateRow = trpc.row.create.useMutation();
  // Save-time prompts (missing location / vague vehicle match) — same
  // checks as the full running-sheet table's updateRowWithDupeCheck in
  // SheetDetail.tsx, ported here since RS Quick Entry from the map is a
  // second, independent way to add a row and was bypassing them entirely.
  type QeDupe =
    | { kind: "missingLocation"; location: string; source: string }
    | {
        kind: "vagueVehicle";
        loserLabel: string;
        winnerLabel: string;
        reason: string;
      };
  const [qeDupeQueue, setQeDupeQueue] = useState<QeDupe[]>([]);
  const [qeDupeIndex, setQeDupeIndex] = useState(0);
  const [qeDupeDialogOpen, setQeDupeDialogOpen] = useState(false);
  const [qeVagueVehicleBusy, setQeVagueVehicleBusy] = useState(false);
  const qePendingEntryRef = useRef<{
    observation: string;
    cinsToAttach: Set<string> | null;
    timeOverride: string | null;
    rowDateOverride: string | null;
  } | null>(null);
  const mergeEntitiesMut = trpc.intelligence.mergeEntities.useMutation();
  const markEntitiesNotDuplicateMut =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();
  // General shortcuts for quick entry buttons
  const { data: generalShortcuts } = trpc.shortcuts.list.useQuery(undefined, {
    staleTime: 0,
  });
  // Target shortcuts for the selected sheet's target
  const { data: targetShortcuts } = trpc.targetShortcuts.list.useQuery(
    { targetId: rsTargetData?.id! },
    { enabled: !!rsTargetData?.id }
  );

  // Per-sheet target shortcuts (for RS Quick Entry shortcut expansion)
  const { data: targetShortcutsForSheet } =
    trpc.targetShortcuts.listForSheet.useQuery(
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
    for (const s of (generalShortcuts as any[]) ?? [])
      map[s.trigger.toLowerCase()] = s.expansion;
    if (assignedTarget) {
      const t = assignedTarget as any;
      if (t.tgt) map["tgt"] = t.tgt;
      if (t.hbf) map["hbf"] = t.hbf;
      if (t.hb) map["hb"] = t.hb;
      if (t.v1f) map["v1f"] = t.v1f;
      if (t.v1) map["v1"] = t.v1;
      if (t.v2f) map["v2f"] = t.v2f;
      if (t.v2) map["v2"] = t.v2;
      if (t.dep) map["dep"] = t.dep;
      if (t.arr) map["arr"] = t.arr;
      // Extra vehicles (V2F/V2, V3F/V3, …)
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(
          t.extraVehicles ?? "[]"
        );
        evs.forEach((ev: { full: string; short: string }, i: number) => {
          const num = i + 2;
          if (ev.full) map[`v${num}f`] = ev.full;
          if (ev.short) map[`v${num}`] = ev.short;
        });
      } catch {}
      // Wild fields (#1, #2, …)
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(
          t.wildFields ?? "[]"
        );
        wfs.forEach((wf: { label: string; value: string }) => {
          if (wf.value) map[wf.label.toLowerCase()] = wf.value;
        });
      } catch {}
    }
    for (const s of (targetShortcutsForSheet as any[]) ?? [])
      map[s.trigger.toLowerCase()] = s.expansion;
    return map;
  }, [generalShortcuts, assignedTarget, targetShortcutsForSheet]);

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
    setOpsExplicitlySet(true);
    setSelectedOpIds(prev => {
      const next = prev.includes(opId)
        ? prev.filter(id => id !== opId)
        : [...prev, opId];
      if (!next.includes(opId)) {
        const opTargets = opTargetMap.get(opId) ?? [];
        setSelectedTargetIds(tPrev =>
          tPrev.filter(tid => !opTargets.find(t => t.id === tid))
        );
        // If all ops are now deselected, clear RS selection too
        if (next.length === 0) {
          setRsSelectedSheetId(null);
          setRsLastEntry(null);
        }
      }
      return next;
    });
    // Collapse the dropdown after each selection (multi-select but auto-close per tap)
    setOpsDropdownOpen(false);
  };

  const toggleTarget = (targetId: number) => {
    setSelectedTargetIds(prev =>
      prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId]
    );
  };

  const selectAllOps = () => {
    if (!operations) return;
    setOpsExplicitlySet(true);
    setSelectedOpIds(operations.map((op: any) => op.id));
  };

  const clearAll = () => {
    setOpsExplicitlySet(true);
    setSelectedOpIds([]);
    setSelectedTargetIds([]);
    setRsSelectedSheetId(null);
    setRsLastEntry(null);
  };

  // ── GPS / Sharing ────────────────────────────────────────────────────────────
  // Keep refs for values used inside watchPosition callback so the callback
  // always sees the latest deviceId and selectedOpIds without needing to
  // re-register the watcher.
  const deviceIdRef = useRef(deviceId);
  const selectedOpIdsRef = useRef(selectedOpIds);
  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);
  useEffect(() => {
    selectedOpIdsRef.current = selectedOpIds;
  }, [selectedOpIds]);

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
      pos => {
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
      err => {
        setGpsError(`GPS error: ${err.message}`);
      },
      // maximumAge caps how stale a cached fix the browser may hand back.
      // At 5000 it could serve a 5-second-old position, which alone would
      // stop the 2-second trail sampling on the server from ever seeing
      // 2-second-apart fixes. 1000 keeps them fresh enough to sample.
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
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
        setGpsError(
          "Location sharing is designed for mobile devices. Your desktop location may be inaccurate."
        );
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
      traceLinesRef.current.forEach(line => line.setMap(null));
      traceLinesRef.current.clear();
    };
  }, []);

  // ── Click-outside to close panels ──────────────────────────────────────────
  // Only collapses the default Map Settings content — once a sub-view
  // (Target/Operation Profile, Images, or the Running Sheet) is open, it
  // stays open until its own back arrow / X is used. Without this guard, a
  // stray tap on the visible slice of map beside the pane would silently
  // discard whatever the officer was viewing or editing.
  const handleMapAreaClick = useCallback(() => {
    if (
      rsActionsPaneOpen &&
      paneTargetProfileId === null &&
      paneOperationProfileId === null &&
      paneImagesOpId === null &&
      paneSheetDetailId === null
    ) {
      setRsActionsPaneOpen(false);
    }
  }, [
    rsActionsPaneOpen,
    paneTargetProfileId,
    paneOperationProfileId,
    paneImagesOpId,
    paneSheetDetailId,
  ]);

  // ── Map pin rendering ────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    for (const m of markersRef.current) {
      m.map = null;
    }
    markersRef.current = [];
    intelPinImgRefs.current.clear();
    if (geocodeTimerRef.current) {
      clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = null;
    }
  }, []);

  const createPinElement = useCallback((loc: IntelMapLocation) => {
    const isTarget = loc.type === "target_address";
    const count = loc.linkCount;

    // Apply any saved appearance override (icon/colour/rotation) — server-
    // persisted (see intelPinOverrides), same override the popup's rotation
    // slider and Edit dialog save to — so a customization set once actually
    // survives the pin being recreated (map data refresh, filter changes,
    // etc.) AND shows up for every officer on every device, not just the
    // one that set it.
    const override = pinOverridesRef.current.get(loc.label);
    const icon: MarkerIcon =
      (override?.markerIcon as MarkerIcon) ?? "house_filled";
    const colour: MarkerColour =
      (override?.markerColour as MarkerColour) ?? (isTarget ? "red" : "purple");
    const rotation = override?.rotation ?? 0;

    const el = document.createElement("div");
    el.style.cssText = `position:relative;display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;`;

    const img = document.createElement("img");
    img.src = getMarkerDataUrl(icon, colour);
    img.style.cssText = `width:40px;height:40px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));display:block;transform:rotate(${rotation}deg);`;
    el.appendChild(img);
    // Direct img ref for live rotation/icon updates — avoids stale
    // `.content.querySelector` lookups (see intelPinImgRefs declaration).
    intelPinImgRefs.current.set(loc.label, img);

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
            const newPinEl = createPinElement(merged);
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
        infoWindowRef.current.setContent(
          buildInfoWindowContent(
            fullEnriched,
            pinOverridesRef.current.get(loc.label)
          )
        );
        infoWindowRef.current.setPosition({
          lat: position.lat,
          lng: position.lng,
        });
        // Deferred one frame: the InfoWindow computes its on-screen pixel
        // position (including which way to flip itself near a map edge)
        // from its content's actual rendered size, but the browser hasn't
        // laid out the HTML setContent() just injected until the next
        // paint — opening in the same tick can position the bubble using a
        // stale/zero size from whatever was in this reused singleton
        // InfoWindow before, which is exactly the "off-centre on the first
        // click, correct on the second" symptom this fixes (the second
        // click's content was already painted from the first).
        requestAnimationFrame(() => {
          infoWindowRef.current?.open(mapRef.current!);
        });
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
    const idx = geocodeIndexRef.current;
    if (idx >= queue.length || !geocoderRef.current) return;

    const loc = queue[idx];
    geocodeIndexRef.current = idx + 1;

    // A manually-moved position (see intelPinOverrides) takes priority over
    // the geocoded address — skip the API call entirely and place it there.
    // Without this, the next time this location's queue runs (every poll)
    // it would re-geocode from the address string and snap straight back to
    // where the address geocodes to, undoing the move a moment after it
    // last "took".
    const override = pinOverridesRef.current.get(loc.label);
    if (override?.lat != null && override?.lng != null) {
      placeMarker(loc, { lat: override.lat, lng: override.lng });
      advanceGeocodeQueue();
      return;
    }

    const query =
      loc.label.includes(",") || /\d/.test(loc.label)
        ? `${loc.label}, Western Australia, Australia`
        : `${loc.label}, Perth, Western Australia, Australia`;

    geocoderRef.current.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const pos = results[0].geometry.location;
        placeMarker(loc, { lat: pos.lat(), lng: pos.lng() });
      }
      advanceGeocodeQueue();
    });
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
  // NOTE: Do NOT call renderLocations here — that would create a loop:
  //   customMarkers changes → renderLocations → geocode → placeMarker stores mergedIntel
  //   → (nothing triggers re-render, but the 5s poll refetches customMarkers) → loop
  // The ref is updated synchronously so placeMarker always reads fresh data.
  useEffect(() => {
    customMarkersDataRef.current = (customMarkers as any[] | undefined) ?? [];
  }, [customMarkers]);

  // Re-render location markers when locations change.
  // After geocoding completes, persisted linkedIntelLabel merges are restored in a second pass
  // (see the geocodeNext callback which calls restorePersistedMerges after the queue drains)
  //
  // mapReady is included (matching the customMarkers effect below) because
  // mapRef/geocoderRef are plain refs, not state — if `locations` resolves
  // BEFORE the Google Maps script finishes loading, this effect's guard
  // fails on that run, and a ref becoming non-null later doesn't by itself
  // trigger anything to re-run. Without mapReady in the deps, nothing then
  // ever re-fires this effect until `locations` itself changes reference
  // again (e.g. clearing and reapplying the operation filter) — which is
  // exactly the "some/all markers don't show up until I reapply the
  // operation" symptom this was causing.
  useEffect(() => {
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
      renderLocations(locations);
    }
  }, [locations, renderLocations, mapReady]);

  // Re-render pins when a pin override changes on ANOTHER device (a move or
  // appearance edit synced in by the poll above). The pinOverridesRef effect
  // keeps the *data* fresh, but nothing else re-draws an already-placed pin
  // from it — without this, a teammate's correction only ever became visible
  // once something else forced a full rebuild (e.g. navigating out of the
  // map and back in), which is exactly the "have to leave and come back for
  // it to take effect" symptom this fixes.
  //
  // Gated on an actual content change, not just a new query response — every
  // 5s poll returns a fresh array reference even when nothing changed, and
  // renderLocations does a full clear-then-rebuild (unlike the customMarkers
  // effect, which diffs in place), so without this every single poll
  // visibly flashed all the pins off and back on again. Skips the very
  // first load too, which the effect above already covers once
  // pinOverridesRef is populated (it runs first — declared earlier in the
  // component).
  const pinOverridesSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pinOverrides) return;
    const signature = JSON.stringify(
      (pinOverrides as any[])
        .map(o => [
          o.label,
          o.lat,
          o.lng,
          o.markerIcon,
          o.markerColour,
          o.rotation,
        ])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    );
    if (pinOverridesSignatureRef.current === null) {
      pinOverridesSignatureRef.current = signature;
      return;
    }
    if (signature === pinOverridesSignatureRef.current) return;
    pinOverridesSignatureRef.current = signature;
    if (locations && mapRef.current && geocoderRef.current) {
      mergedIntelRef.current.clear();
      renderLocations(locations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinOverrides]);

  // ── Live user marker rendering ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !liveUsers) return;

    const currentUserId = user?.id;
    const currentDeviceId = deviceIdRef.current;
    const visibleUsers = (liveUsers as LiveUser[]).filter(u => {
      // Only hide THIS device's own pin when sharing is off.
      // Same user on a different device (different deviceId) must always show.
      const isThisDevice =
        u.userId === currentUserId && u.deviceId === currentDeviceId;
      if (isThisDevice && !showOwnLocation) return false;
      // Per-team visibility (manual hide buttons in the team list)
      const teamKey = u.team ?? "null";
      if (hiddenTeams.has(teamKey)) return false;
      // Per-user visibility (manual hide button per user)
      if (hiddenUsers.has(u.userId)) return false;
      return true;
    });

    // Remove markers for devices no longer visible
    const visibleKeys = new Set(
      visibleUsers.map(u => `${u.userId}_${u.deviceId}`)
    );
    Array.from(liveMarkersRef.current.entries()).forEach(([key, marker]) => {
      if (!visibleKeys.has(key)) {
        marker.map = null;
        liveMarkersRef.current.delete(key);
      }
    });

    // Track own position and apply follow-mode pan
    const ownEntry = (liveUsers as LiveUser[]).find(
      u => u.userId === currentUserId && u.deviceId === currentDeviceId
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
        console.error(
          "[LiveMarkers] failed to place pin for",
          liveUser.name,
          err
        );
      }
    }
    // mapReady is included so this effect re-runs the moment the map is available,
    // even if liveUsers data arrived before the map was initialised.
  }, [
    liveUsers,
    showOwnLocation,
    hiddenUsers,
    hiddenTeams,
    user,
    createUserPinElement,
    mapReady,
  ]);

  // Remember each live user's team so a trace line keeps its colour even if
  // that officer's pin briefly drops out of the live list (GPS gap, etc.).
  useEffect(() => {
    if (!liveUsers) return;
    for (const u of liveUsers as LiveUser[]) {
      traceUserTeamRef.current.set(u.userId, u.team);
    }
  }, [liveUsers]);

  // ── Live-trace line rendering ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove lines for users no longer being traced
    Array.from(traceLinesRef.current.entries()).forEach(([userId, line]) => {
      if (!tracedUserIds.has(userId)) {
        line.setMap(null);
        traceLinesRef.current.delete(userId);
      }
    });

    if (!traceHistories) return;
    for (const userId of Array.from(tracedUserIds)) {
      const all = (
        traceHistories as Record<
          number,
          { lat: number; lng: number; recordedAt: number }[]
        >
      )[userId];
      // The query fetches from the earliest start across all tracked
      // officers, so clip each one to their own Track-on moment.
      const startedAt = trackStartsRef.current.get(userId) ?? 0;
      const points = (all ?? []).filter(p => p.recordedAt >= startedAt);
      if (points.length < 2) continue;
      const path = points.map(p => ({ lat: p.lat, lng: p.lng }));
      const colour = getTeamColour(
        traceUserTeamRef.current.get(userId) ?? null
      );
      const existing = traceLinesRef.current.get(userId);
      if (existing) {
        existing.setPath(path);
      } else {
        const line = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: colour,
          strokeOpacity: 0.85,
          strokeWeight: 3,
          zIndex: 500,
          map: mapRef.current,
        });
        traceLinesRef.current.set(userId, line);
      }
    }
  }, [traceHistories, tracedUserIds]);

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();
      infoWindowRef.current = new google.maps.InfoWindow({
        pixelOffset: new google.maps.Size(0, -40),
      });
      autocompleteServiceRef.current =
        new google.maps.places.AutocompleteService();
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
          const addr =
            status === "OK" && results && results[0]
              ? results[0].formatted_address
              : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setActionChooser({ lat, lng, address: convertGoogleAddresses(addr) });
        });
      });

      // Persist map type (roadmap / satellite) whenever the user switches
      map.addListener("maptypeid_changed", () => {
        const typeId = map.getMapTypeId();
        if (!typeId) return;
        setMapInitialTypeId(typeId);
        try {
          const existing = localStorage.getItem(LS_MAP_SETTINGS_KEY);
          const parsed = existing ? JSON.parse(existing) : {};
          localStorage.setItem(
            LS_MAP_SETTINGS_KEY,
            JSON.stringify({ ...parsed, mapTypeId: typeId })
          );
        } catch {
          /* ignore */
        }
      });

      // Tap anywhere on the map (not on a marker/POI) → close the InfoWindow
      map.addListener(
        "click",
        (e: google.maps.MapMouseEvent & { placeId?: string }) => {
          // While drawing a line, every tap appends a vertex instead of the
          // usual close-InfoWindow / POI-lookup behaviour — including a tap
          // that happens to land on a POI, since the officer is mid-draw.
          if (drawingLineRef.current && e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setDrawingLine(d =>
              d ? { points: [...d.points, { lat, lng }] } : d
            );
            return;
          }
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
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                place
              ) {
                setPoiTap({
                  lat,
                  lng,
                  name: place.name ?? "",
                  address:
                    place.formatted_address ??
                    `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                });
              }
            }
          );
        }
      );
    },
    [locations, renderLocations]
  );

  // A small floating pill of text — used both for a shape's note (beside its
  // anchor point) and a custom marker's label (below its icon, or, for a
  // "label only" marker, standing in for the icon entirely). Nudged via a
  // CSS transform rather than a real pixel offset, since AdvancedMarkerElement
  // positioning is geographic only and has no pixel-offset option of its
  // own — `transform: "translate(-50%, -50%)"` centers the pill exactly on
  // its anchor (the "label only" case), anything else nudges it clear of an
  // icon/shape rendered at the same point instead of sitting on top of it.
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

  // ── Custom marker rendering ────────────────────────────────────────────────
  const customMarkerMapRefs = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  // Direct img element refs for live rotation without stale content queries
  const customMarkerImgRefs = useRef<Map<number, HTMLImageElement>>(new Map());
  // Companion floating label pill beside a marker's icon (only when the
  // marker has a label AND isn't itself a "label only" marker — that case
  // uses the label as the marker's own content instead, see below).
  const customMarkerLabelsRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());

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
    customMarkerLabelsRef.current.forEach((labelMarker, id) => {
      if (!incomingIds.has(id)) {
        labelMarker.map = null;
        customMarkerLabelsRef.current.delete(id);
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
        // "Label only" — the pill itself stands in for the icon, centered
        // exactly on the marker's point rather than nudged beside it.
        content = createLabelPillElement(
          labelText || "(no label)",
          fillColor,
          "translate(-50%, -50%)"
        );
        customMarkerImgRefs.current.delete(outerCm.id);
      } else {
        const dataUrl = getMarkerDataUrl(
          outerCm.markerIcon as MarkerIcon,
          outerCm.markerColour as MarkerColour
        );
        rotation = (outerCm.rotation ?? 0) as number;
        const el = document.createElement("div");
        el.style.cssText = "width:40px;height:40px;cursor:pointer;";
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.cssText = `width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));transform:rotate(${rotation}deg);`;
        el.appendChild(img);
        content = el;
        // Store direct img ref for live rotation
        customMarkerImgRefs.current.set(outerCm.id, img);
      }

      if (existing.has(outerCm.id)) {
        const m = existing.get(outerCm.id)!;
        m.position = { lat: outerCm.lat, lng: outerCm.lng };
        m.content = content;
      } else {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: outerCm.lat, lng: outerCm.lng },
          content,
          title:
            outerCm.label ??
            MARKER_ICON_LABELS[outerCm.markerIcon as MarkerIcon],
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
          const iconLabel =
            MARKER_ICON_LABELS[cm.markerIcon as MarkerIcon] ?? cm.markerIcon;
          const currentRotation = cm.rotation ?? 0;
          const dataUrl = getMarkerDataUrl(
            cm.markerIcon as MarkerIcon,
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
            if (cm.assocPersons?.length)
              lines.push(
                `<div style="margin-top:6px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Persons</span><div style="margin-top:2px">${popupPersonLines(cm.assocPersons as string[], "12px")}</div></div>`
              );

            // Vehicles (from custom marker)
            if (cm.assocVehicles?.length)
              lines.push(
                `<div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Vehicles</span><p style="font-size:12px;color:#111;margin:2px 0 0;">${(cm.assocVehicles as string[]).join(", ")}</p></div>`
              );

            // ── Merged intel section: render each merged entry (target_address first) ──
            for (const intel of mergedIntelList) {
              const isTarget = intel.type === "target_address";
              const accentColor = isTarget ? "#dc2626" : "#7c3aed";
              const typeLabel = isTarget
                ? "TARGET ADDRESS"
                : intel.type === "associate_address"
                  ? "ASSOCIATE ADDRESS"
                  : "OBSERVED LOCATION";
              lines.push(`
                <div style="margin-top:8px;padding:8px;background:${isTarget ? "#fff5f5" : "#f8fafc"};border:1px solid ${isTarget ? "#fca5a5" : "#e2e8f0"};border-radius:6px;">
                  <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <span style="background:${accentColor};color:#fff;border-radius:3px;font-size:9px;font-weight:700;padding:1px 5px;letter-spacing:0.07em;">${typeLabel}</span>
                  </div>
                  <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:3px;">${formatIntelAddress(intel.label)}</div>
              `);
              // Linked target details — same treatment as the standalone
              // target pin: no repeated TGT alias or HBF, vehicles in the
              // Intelligence folder's form, capped and scrollable.
              if (isTarget && intel.linkedTargets.length > 0) {
                lines.push(`<div style="${POPUP_SCROLL}">`);
                for (const t of intel.linkedTargets) {
                  lines.push(
                    `<div style="padding:4px 6px;background:#fef2f2;border-left:2px solid #dc2626;border-radius:0 3px 3px 0;margin-bottom:3px;">`
                  );
                  lines.push(
                    `<div style="font-size:11px;font-weight:700;color:#111;">${t.name}</div>`
                  );
                  const tVehicles = [t.v1f, t.v2f].filter(
                    (v): v is string => !!v
                  );
                  if (tVehicles.length)
                    lines.push(popupVehicleLines(tVehicles, "10px"));
                  lines.push(`</div>`);
                }
                lines.push(`</div>`);
              }

              const intelEntityLines: string[] = [];
              if (!isTarget && intel.linkedTargets.length > 0) {
                intelEntityLines.push(
                  `<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Linked Targets</div>`
                );
                for (const t of intel.linkedTargets) {
                  intelEntityLines.push(
                    `<div style="font-size:11px;color:#111;">${t.name}</div>`
                  );
                }
              }
              if (intel.assocPersons.length > 0) {
                intelEntityLines.push(
                  `<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;">Intel Persons</div><div>${popupPersonLines(intel.assocPersons, "11px")}</div>`
                );
              }
              if (intel.assocVehicles.length > 0) {
                intelEntityLines.push(
                  `<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Intel Vehicles</div><div>${popupVehicleLines(intel.assocVehicles, "11px")}</div>`
                );
              }
              if (intelEntityLines.length)
                lines.push(
                  `<div style="${POPUP_SCROLL}">${intelEntityLines.join("")}</div>`
                );
              lines.push(`</div>`);
            }
            // ─────────────────────────────────────────────────────────────────────────

            // Rotation slider — not applicable to a "label only" marker,
            // there's no icon to rotate.
            if (!cm.labelOnly)
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
            const btnBase =
              "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
            const sections: string[] = [];

            // Row 0: RS Quick Entry — always at top, full width
            sections.push(
              `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;"><button onclick="window.__cmRsQuickEntry(${cm.id})" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
            );

            // Row 2: Navigation — Waze | Street View (2 columns)
            const navBtns = [
              `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
              `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="${btnBase}background:#4285f4;color:#fff;">Street View</a>`,
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
            const mergeBtn = !mergedIntel
              ? `<button onclick="window.__cmOpenMergePicker(${cm.id})" style="${btnBase}background:#78716c;color:#fff;border:none;">Merge…</button>`
              : `<button disabled style="${btnBase}background:#78716c;color:#fff;border:none;opacity:0.4;cursor:default;">Merge…</button>`;
            const moveBtn = `<button onclick="window.__cmStartMove(${cm.id})" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
            sections.push(
              `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${mergeBtn}${moveBtn}</div>`
            );

            lines.push(sections.join(""));

            return `<div style="font-family:sans-serif;max-width:280px;color:#111;">${lines.join("")}</div>`;
          };

          infoWindowRef.current.setContent(buildPopupHtml(currentRotation));
          // Deferred one frame — same reasoning as the intel pin popup's
          // own open() above: the browser hasn't laid out the HTML
          // setContent() just injected until the next paint, so opening in
          // the same tick can position the bubble off-anchor using a
          // stale/zero size from this reused singleton InfoWindow's
          // previous content.
          requestAnimationFrame(() => {
            infoWindowRef.current?.open(map, marker);
          });
        });
        existing.set(outerCm.id, marker);
      }

      // Companion label pill below the icon — only when there's an icon to
      // sit under (a "label only" marker already uses the label as its own
      // content, above) and a label is actually set. Clicking the pill opens
      // the same popup as the icon itself, by forwarding to its click
      // listener rather than duplicating the popup-building logic above.
      const iconMarker = existing.get(outerCm.id)!;
      const companionLabelTransform = "translate(-50%, 26px)";
      const existingCompanionLabel = customMarkerLabelsRef.current.get(
        outerCm.id
      );
      if (labelOnly || !labelText) {
        if (existingCompanionLabel) {
          existingCompanionLabel.map = null;
          customMarkerLabelsRef.current.delete(outerCm.id);
        }
      } else if (existingCompanionLabel) {
        existingCompanionLabel.position = {
          lat: outerCm.lat,
          lng: outerCm.lng,
        };
        existingCompanionLabel.content = createLabelPillElement(
          labelText,
          fillColor,
          companionLabelTransform
        );
      } else {
        const companionLabel = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: outerCm.lat, lng: outerCm.lng },
          content: createLabelPillElement(
            labelText,
            fillColor,
            companionLabelTransform
          ),
          zIndex: 500,
        });
        companionLabel.addListener("click", () => {
          google.maps.event.trigger(iconMarker, "click");
        });
        customMarkerLabelsRef.current.set(outerCm.id, companionLabel);
      }
    });
  }, [customMarkers, mapReady, createLabelPillElement]);

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
  const shapeLabelsRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());

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
  // Wraps the ordinary "open edit panel" click so a click immediately
  // following a just-fired long-press/right-click (see above) doesn't also
  // pop the edit panel open on top of the action chooser.
  const wireShapeEditClick = useCallback(
    (
      overlay:
        | google.maps.Circle
        | google.maps.Rectangle
        | google.maps.Polygon
        | google.maps.Polyline,
      openEdit: () => void
    ) => {
      overlay.addListener("click", () => {
        if (shapeLongPressFiredRef.current) {
          shapeLongPressFiredRef.current = false;
          return;
        }
        openEdit();
      });
    },
    []
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const existing = shapesRef.current;
    const incoming = (mapShapesData as any[] | undefined) ?? [];
    const incomingIds = new Set(incoming.map((s: any) => s.id as number));

    // Remove stale shapes (deleted, or filtered out by the operation scope)
    existing.forEach((overlay, id) => {
      if (!incomingIds.has(id)) {
        overlay.setMap(null);
        existing.delete(id);
      }
    });
    shapeLabelsRef.current.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.map = null;
        shapeLabelsRef.current.delete(id);
      }
    });

    incoming.forEach((s: any) => {
      // The shape currently being placed/edited is rendered by its own
      // draft overlay (draftShapeOverlayRef, see below) instead — skip it
      // here so the two don't sit on top of each other while the officer
      // is actively adjusting it.
      if (pendingShape && pendingShape.id === s.id) {
        const stale = existing.get(s.id);
        if (stale) {
          stale.setMap(null);
          existing.delete(s.id);
        }
        const staleLabel = shapeLabelsRef.current.get(s.id);
        if (staleLabel) {
          staleLabel.map = null;
          shapeLabelsRef.current.delete(s.id);
        }
        return;
      }

      const fillColor =
        MARKER_COLOURS[s.colour as MarkerColour] ?? MARKER_COLOURS.blue;
      const opacity = (s.opacity ?? 30) / 100;
      const openEdit = () => {
        const latest =
          mapShapesDataRef.current.find((x: any) => x.id === s.id) ?? s;
        beginEditShape(latest);
      };

      if (s.shapeType === "circle") {
        const center = { lat: s.centerLat, lng: s.centerLng };
        let circle = existing.get(s.id) as google.maps.Circle | undefined;
        if (circle) {
          circle.setCenter(center);
          circle.setRadius(s.radiusMeters);
          circle.setOptions({
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
          });
        } else {
          circle = new google.maps.Circle({
            map,
            center,
            radius: s.radiusMeters,
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            clickable: true,
          });
          wireShapeEditClick(circle, openEdit);
          wireShapeActionChooserGesture(circle);
          existing.set(s.id, circle);
        }
      } else if (s.shapeType === "rectangle") {
        const bounds = {
          north: s.neLat,
          east: s.neLng,
          south: s.swLat,
          west: s.swLng,
        };
        let rect = existing.get(s.id) as google.maps.Rectangle | undefined;
        if (rect) {
          rect.setBounds(bounds);
          rect.setOptions({
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
          });
        } else {
          rect = new google.maps.Rectangle({
            map,
            bounds,
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            clickable: true,
          });
          wireShapeEditClick(rect, openEdit);
          wireShapeActionChooserGesture(rect);
          existing.set(s.id, rect);
        }
      } else if (s.shapeType === "sector") {
        const path = sectorPolygonPath(
          { lat: s.centerLat, lng: s.centerLng },
          s.radiusMeters,
          s.startAngle,
          s.endAngle,
          s.innerRadiusMeters ?? 0
        );
        let poly = existing.get(s.id) as google.maps.Polygon | undefined;
        if (poly) {
          poly.setPath(path);
          poly.setOptions({
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
          });
        } else {
          poly = new google.maps.Polygon({
            map,
            paths: path,
            fillColor,
            fillOpacity: opacity,
            strokeColor: fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            clickable: true,
          });
          wireShapeEditClick(poly, openEdit);
          wireShapeActionChooserGesture(poly);
          existing.set(s.id, poly);
        }
      } else {
        // line
        const path = (s.points ?? []) as { lat: number; lng: number }[];
        let line = existing.get(s.id) as google.maps.Polyline | undefined;
        if (line) {
          line.setPath(path);
          line.setOptions({ strokeColor: fillColor, strokeOpacity: opacity });
        } else {
          line = new google.maps.Polyline({
            map,
            path,
            strokeColor: fillColor,
            strokeOpacity: opacity,
            strokeWeight: 4,
            clickable: true,
          });
          wireShapeEditClick(line, openEdit);
          wireShapeActionChooserGesture(line);
          existing.set(s.id, line);
        }
      }

      // ── Label pill — floats the shape's note beside its primary point
      // (previously only visible after tapping the shape to edit it), so an
      // officer glancing at the map sees what a shape is for without
      // opening it. Anchor is each shape's own "first point": the center
      // for a circle/sector (its only point), the geometric midpoint of
      // its stored corners for a rectangle (equal to the point it was
      // originally tapped at, since it's built from symmetric offsets —
      // see beginCreateShape), and the first vertex placed for a line.
      const labelText = (s.label ?? "").trim();
      const labelAnchor: { lat: number; lng: number } | null =
        s.shapeType === "circle" || s.shapeType === "sector"
          ? { lat: s.centerLat, lng: s.centerLng }
          : s.shapeType === "rectangle"
            ? {
                lat: (s.neLat + s.swLat) / 2,
                lng: (s.neLng + s.swLng) / 2,
              }
            : ((s.points ?? [])[0] ?? null);
      const existingLabel = shapeLabelsRef.current.get(s.id);
      if (!labelText || !labelAnchor) {
        if (existingLabel) {
          existingLabel.map = null;
          shapeLabelsRef.current.delete(s.id);
        }
      } else if (existingLabel) {
        existingLabel.position = labelAnchor;
        existingLabel.content = createLabelPillElement(labelText, fillColor);
      } else {
        const labelMarker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: labelAnchor,
          content: createLabelPillElement(labelText, fillColor),
          zIndex: 500,
        });
        labelMarker.addListener("click", openEdit);
        shapeLabelsRef.current.set(s.id, labelMarker);
      }
    });
  }, [
    mapShapesData,
    mapReady,
    pendingShape,
    beginEditShape,
    createLabelPillElement,
    wireShapeEditClick,
    wireShapeActionChooserGesture,
  ]);

  // ── Draft shape overlay (create/edit in progress) ────────────────────────────
  // Creates (once, on shape identity/type change) a live editable overlay
  // for whatever's currently being placed or edited, wiring its own
  // drag/resize events straight into pendingShape state. Deliberately does
  // NOT depend on pendingShape's geometry fields — those are the very
  // things these listeners update, and re-running this effect on every one
  // of their changes would tear the overlay down and rebuild it mid-drag.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !pendingShape) {
      if (draftShapeOverlayRef.current) {
        draftShapeOverlayRef.current.setMap(null);
        draftShapeOverlayRef.current = null;
      }
      return;
    }
    const map = mapRef.current;
    const fillColor = MARKER_COLOURS[shapeColour];
    const opacity = shapeOpacity / 100;
    let overlay:
      | google.maps.Circle
      | google.maps.Rectangle
      | google.maps.Polygon
      | google.maps.Polyline;

    if (pendingShape.shapeType === "circle") {
      const circle = new google.maps.Circle({
        map,
        center: { lat: pendingShape.centerLat!, lng: pendingShape.centerLng! },
        radius: pendingShape.radiusMeters!,
        editable: true,
        draggable: true,
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
      circle.addListener("center_changed", () => {
        const c = circle.getCenter();
        if (!c) return;
        setPendingShape(p =>
          p ? { ...p, centerLat: c.lat(), centerLng: c.lng() } : p
        );
      });
      circle.addListener("radius_changed", () => {
        setPendingShape(p =>
          p ? { ...p, radiusMeters: circle.getRadius() } : p
        );
      });
      overlay = circle;
    } else if (pendingShape.shapeType === "rectangle") {
      const bounds = new google.maps.LatLngBounds(
        { lat: pendingShape.swLat!, lng: pendingShape.swLng! },
        { lat: pendingShape.neLat!, lng: pendingShape.neLng! }
      );
      const rect = new google.maps.Rectangle({
        map,
        bounds,
        editable: true,
        draggable: true,
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
      rect.addListener("bounds_changed", () => {
        const b = rect.getBounds();
        if (!b) return;
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        setPendingShape(p =>
          p
            ? {
                ...p,
                neLat: ne.lat(),
                neLng: ne.lng(),
                swLat: sw.lat(),
                swLng: sw.lng(),
              }
            : p
        );
      });
      overlay = rect;
    } else if (pendingShape.shapeType === "sector") {
      const path = sectorPolygonPath(
        { lat: pendingShape.centerLat!, lng: pendingShape.centerLng! },
        pendingShape.radiusMeters!,
        pendingShape.startAngle!,
        pendingShape.endAngle!,
        pendingShape.innerRadiusMeters ?? 0
      );
      // Not editable (no free-dragging arc vertices) — a sector's shape is
      // controlled entirely by center/radius/angles, adjusted via the panel
      // below, so it always stays a clean pizza slice (or ring band, with
      // an inner radius set) rather than something an officer could
      // accidentally drag into a stray polygon. Still draggable as a
      // whole, which moves its center.
      const poly = new google.maps.Polygon({
        map,
        paths: path,
        editable: false,
        draggable: true,
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
      // sectorPolygonPath's first point is the center for a plain wedge,
      // but the first outer-arc point once an inner radius makes this a
      // ring band with no center vertex at all — so rather than assuming
      // a specific index IS the center, track the delta that same index
      // moved by (uniform for every vertex when the whole polygon is
      // dragged) and apply that delta to the stored center instead. The
      // "before" position comes from sectorDragAnchorRef rather than this
      // path directly, since the radius/angle-sync effect below can move
      // path[0] (e.g. toggling the inner-radius slider off flips it back
      // to the center) without this overlay being recreated.
      sectorDragAnchorRef.current = path[0];
      poly.addListener("dragend", () => {
        const newFirstVertex = poly.getPath().getAt(0);
        const before = sectorDragAnchorRef.current;
        if (!newFirstVertex || !before) return;
        const deltaLat = newFirstVertex.lat() - before.lat;
        const deltaLng = newFirstVertex.lng() - before.lng;
        sectorDragAnchorRef.current = {
          lat: newFirstVertex.lat(),
          lng: newFirstVertex.lng(),
        };
        setPendingShape(p =>
          p
            ? {
                ...p,
                centerLat: (p.centerLat ?? 0) + deltaLat,
                centerLng: (p.centerLng ?? 0) + deltaLng,
              }
            : p
        );
      });
      overlay = poly;
    } else {
      // line
      const line = new google.maps.Polyline({
        map,
        path: pendingShape.points ?? [],
        editable: true,
        draggable: true,
        strokeColor: fillColor,
        strokeOpacity: opacity,
        strokeWeight: 4,
      });
      const syncPath = () => {
        const pts = line
          .getPath()
          .getArray()
          .map(p => ({ lat: p.lat(), lng: p.lng() }));
        setPendingShape(p => (p ? { ...p, points: pts } : p));
      };
      line.getPath().addListener("set_at", syncPath);
      line.getPath().addListener("insert_at", syncPath);
      line.getPath().addListener("remove_at", syncPath);
      overlay = line;
    }

    draftShapeOverlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
      if (draftShapeOverlayRef.current === overlay) {
        draftShapeOverlayRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pendingShape?.id, pendingShape?.shapeType]);

  // Pushes a live colour/opacity change (from the panel's swatches/slider)
  // onto whichever draft overlay is currently on the map, without
  // recreating it.
  useEffect(() => {
    const overlay = draftShapeOverlayRef.current;
    if (!overlay) return;
    const fillColor = MARKER_COLOURS[shapeColour];
    const opacity = shapeOpacity / 100;
    if (overlay instanceof google.maps.Polyline) {
      overlay.setOptions({ strokeColor: fillColor, strokeOpacity: opacity });
    } else {
      overlay.setOptions({
        fillColor,
        fillOpacity: opacity,
        strokeColor: fillColor,
      });
    }
  }, [shapeColour, shapeOpacity]);

  // A sector's geometry is driven by the panel's radius/angle sliders
  // rather than by dragging the polygon itself (see the "not editable"
  // note above) — push those changes onto the draft Polygon's path live.
  useEffect(() => {
    const overlay = draftShapeOverlayRef.current;
    if (!overlay || !pendingShape || pendingShape.shapeType !== "sector")
      return;
    if (!(overlay instanceof google.maps.Polygon)) return;
    const path = sectorPolygonPath(
      { lat: pendingShape.centerLat!, lng: pendingShape.centerLng! },
      pendingShape.radiusMeters!,
      pendingShape.startAngle!,
      pendingShape.endAngle!,
      pendingShape.innerRadiusMeters ?? 0
    );
    overlay.setPath(path);
    // Keep the dragend delta-tracking anchor in sync — this is the only
    // other place path[0]'s position can change without the overlay being
    // recreated (see the dragend handler above).
    sectorDragAnchorRef.current = path[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingShape?.startAngle,
    pendingShape?.endAngle,
    pendingShape?.radiusMeters,
    pendingShape?.innerRadiusMeters,
  ]);

  // Global RS Quick Entry handler for merged marker popup
  useEffect(() => {
    (window as any).__cmRsQuickEntry = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkers as any[] | undefined)?.find(
        (m: any) => m.id === id
      );
      if (!cm) return;
      const address = cm.address || cm.label || "";
      setMapQeAddress(convertGoogleAddresses(address));
      setMapQeOpen(true);
    };
    return () => {
      delete (window as any).__cmRsQuickEntry;
    };
  }, [customMarkers, setMapQeAddress, setMapQeOpen]);

  // Global manual merge picker handler — opens the merge picker bottom sheet
  useEffect(() => {
    (window as any).__cmOpenMergePicker = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkersDataRef.current as any[]).find(
        (m: any) => m.id === id
      );
      if (!cm) return;
      // Find all geocoded intel pins within 150m of this custom marker
      const MANUAL_MERGE_RADIUS_M = 150;
      const candidates: Array<{
        loc: IntelMapLocation;
        position: google.maps.LatLngLiteral;
        distanceM: number;
      }> = [];
      geocodedIntelRef.current.forEach(({ loc, position }) => {
        const d = haversineMetres(cm.lat, cm.lng, position.lat, position.lng);
        if (d <= MANUAL_MERGE_RADIUS_M) {
          candidates.push({ loc, position, distanceM: Math.round(d) });
        }
      });
      candidates.sort((a, b) => a.distanceM - b.distanceM);
      setManualMergePicker({ cmId: id, candidates });
    };
    return () => {
      delete (window as any).__cmOpenMergePicker;
    };
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
      const origLat =
        typeof (origPos as any).lat === "function"
          ? (origPos as any).lat()
          : (origPos as any).lat;
      const origLng =
        typeof (origPos as any).lng === "function"
          ? (origPos as any).lng()
          : (origPos as any).lng;
      // Make marker draggable
      (marker as any).gmpDraggable = true;
      setMovingMarkerId(id);
      setPendingMoveAddress(null);
      // Listen for drag end to reverse geocode new position
      const dragEndListener = marker.addListener("dragend", () => {
        const newPos = marker.position as google.maps.LatLngLiteral | null;
        if (!newPos || !geocoderRef.current) return;
        const newLat =
          typeof (newPos as any).lat === "function"
            ? (newPos as any).lat()
            : (newPos as any).lat;
        const newLng =
          typeof (newPos as any).lng === "function"
            ? (newPos as any).lng()
            : (newPos as any).lng;
        geocoderRef.current.geocode(
          { location: { lat: newLat, lng: newLng } },
          (results, status) => {
            const rawAddr =
              status === "OK" && results && results[0]
                ? results[0].formatted_address
                : `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
            const addr = convertGoogleAddresses(rawAddr);
            setPendingMoveAddress({ lat: newLat, lng: newLng, address: addr });
          }
        );
        // Remove this one-time listener
        google.maps.event.removeListener(dragEndListener);
      });
      // Store original position on the window object for cancel rollback
      (window as any).__cmMoveOrigPos = { id, lat: origLat, lng: origLng };
    };
    return () => {
      delete (window as any).__cmStartMove;
    };
  }, [
    customMarkerMapRefs,
    geocoderRef,
    setMovingMarkerId,
    setPendingMoveAddress,
  ]);

  // Global inline rotation handler for custom marker popup slider
  useEffect(() => {
    let rotateTimer: ReturnType<typeof setTimeout> | null = null;
    (window as any).__cmPopupRotate = (id: number, valueStr: string) => {
      const rotation = Number(valueStr);
      // Update the live preview image and degree label in the popup DOM
      const previewImg = document.getElementById(
        `cm-popup-preview-${id}`
      ) as HTMLImageElement | null;
      const degLabel = document.getElementById(
        `cm-popup-deg-${id}`
      ) as HTMLElement | null;
      if (previewImg) previewImg.style.transform = `rotate(${rotation}deg)`;
      if (degLabel) degLabel.textContent = `${rotation}°`;
      // Also rotate the actual map marker element immediately via direct img ref
      const markerImg = customMarkerImgRefs.current.get(id);
      if (markerImg) markerImg.style.transform = `rotate(${rotation}deg)`;
      // Fallback: query through content if direct ref not found
      if (!markerImg) {
        const markerEl = customMarkerMapRefs.current.get(id);
        if (markerEl?.content instanceof HTMLElement) {
          const img = markerEl.content.querySelector(
            "img"
          ) as HTMLImageElement | null;
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
    return () => {
      delete (window as any).__deleteCustomMarker;
    };
  }, [deleteCustomMarkerMut]);

  // Global edit handler for custom marker info window
  useEffect(() => {
    (window as any).__editCustomMarker = (id: number) => {
      infoWindowRef.current?.close();
      const cm = (customMarkers as any[] | undefined)?.find(
        (m: any) => m.id === id
      );
      if (!cm) return;
      // Pre-fill all form fields with existing marker data
      setCmIcon((cm.markerIcon as MarkerIcon) ?? "house_filled");
      setCmColour((cm.markerColour as MarkerColour) ?? "red");
      setCmRotation(cm.rotation ?? 0);
      setCmLabelOnly(!!cm.labelOnly);
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
    return () => {
      delete (window as any).__editCustomMarker;
    };
  }, [customMarkers]);

  // ── Intel pin global handlers ─────────────────────────────────────────────────

  // RS Quick Entry from intel pin popup
  useEffect(() => {
    (window as any).__intelRsQuickEntry = (label: string) => {
      infoWindowRef.current?.close();
      // Ensure the label has a bracket short-form — intel entity labels are already
      // in RS format (suburb UPPERCASE, no postcode) but may lack the bracket code.
      setMapQeAddress(ensureBracketCode(label));
      setMapQeOpen(true);
    };
    return () => {
      delete (window as any).__intelRsQuickEntry;
    };
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
      } catch {
        /* ignore */
      }
      setIntelEditIcon(icon);
      setIntelEditColour(colour);
      setIntelEditRotation(rotation);
      setEditingIntelLabel(label);
    };
    return () => {
      delete (window as any).__intelOpenEditDialog;
    };
  }, []);

  // Inline rotation handler for intel pin popup slider
  useEffect(() => {
    let intelRotateTimer: ReturnType<typeof setTimeout> | null = null;
    (window as any).__intelPopupRotate = (label: string, valueStr: string) => {
      const rotation = Number(valueStr);
      const encodedLabel = encodeURIComponent(label);
      // Update popup preview image and degree label
      const previewImg = document.getElementById(
        `intel-popup-preview-${encodedLabel}`
      ) as HTMLImageElement | null;
      const degLabel = document.getElementById(
        `intel-popup-deg-${encodedLabel}`
      ) as HTMLElement | null;
      if (previewImg) previewImg.style.transform = `rotate(${rotation}deg)`;
      if (degLabel) degLabel.textContent = `${rotation}°`;
      // Update the actual map marker element — direct img ref first (avoids
      // stale `.content.querySelector` lookups after a marker gets
      // recreated), falling back to querySelector if the ref isn't set.
      // Note: `filter:drop-shadow(...)` is applied once at creation time
      // via the img's base cssText — it must not be mixed into `transform`
      // here, drop-shadow() isn't a valid transform function and doing so
      // makes the browser silently reject the whole transform value.
      const directImg = intelPinImgRefs.current.get(label);
      if (directImg) {
        directImg.style.transform = `rotate(${rotation}deg)`;
      } else {
        const markerEntry = markersRef.current.find(
          (m: any) => m.title === label
        );
        if (markerEntry?.content instanceof HTMLElement) {
          const img = markerEntry.content.querySelector(
            "img"
          ) as HTMLImageElement | null;
          if (img) img.style.transform = `rotate(${rotation}deg)`;
        }
      }
      // Debounce the DB save so we don't fire on every pixel of drag —
      // same pattern as the custom marker rotation slider (__cmPopupRotate).
      if (intelRotateTimer) clearTimeout(intelRotateTimer);
      intelRotateTimer = setTimeout(() => {
        savePinOverrideMut.mutate({ label, rotation });
      }, 400);
    };
    return () => {
      delete (window as any).__intelPopupRotate;
      if (intelRotateTimer) clearTimeout(intelRotateTimer);
    };
  }, [savePinOverrideMut]);

  // Move intel pin handler
  useEffect(() => {
    (window as any).__intelStartMove = (label: string) => {
      infoWindowRef.current?.close();
      const marker = markersRef.current.find((m: any) => m.title === label);
      if (!marker) return;
      const origPos = marker.position as google.maps.LatLngLiteral | null;
      if (!origPos) return;
      const origLat =
        typeof (origPos as any).lat === "function"
          ? (origPos as any).lat()
          : (origPos as any).lat;
      const origLng =
        typeof (origPos as any).lng === "function"
          ? (origPos as any).lng()
          : (origPos as any).lng;
      (marker as any).gmpDraggable = true;
      setMovingIntelLabel(label);
      setPendingIntelMoveAddress(null);
      const dragEndListener = marker.addListener("dragend", () => {
        const newPos = marker.position as google.maps.LatLngLiteral | null;
        if (!newPos || !geocoderRef.current) return;
        const newLat =
          typeof (newPos as any).lat === "function"
            ? (newPos as any).lat()
            : (newPos as any).lat;
        const newLng =
          typeof (newPos as any).lng === "function"
            ? (newPos as any).lng()
            : (newPos as any).lng;
        geocoderRef.current.geocode(
          { location: { lat: newLat, lng: newLng } },
          (results, status) => {
            const rawAddr =
              status === "OK" && results && results[0]
                ? results[0].formatted_address
                : `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
            const addr = convertGoogleAddresses(rawAddr);
            setPendingIntelMoveAddress({
              lat: newLat,
              lng: newLng,
              address: addr,
            });
          }
        );
        google.maps.event.removeListener(dragEndListener);
      });
      (window as any).__intelMoveOrigPos = {
        label,
        lat: origLat,
        lng: origLng,
      };
    };
    return () => {
      delete (window as any).__intelStartMove;
    };
  }, []);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const targetPins =
    locations?.filter(l => l.type === "target_address").length ?? 0;
  const obsPins = locations?.filter(l => l.type === "observation").length ?? 0;

  // ── Group live users by team for the settings panel ──────────────────────────
  const liveUsersByTeam = {
    TEAM1: [] as LiveUser[],
    TEAM2: [] as LiveUser[],
    PTT: [] as LiveUser[],
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

  // Draws an officer's recorded GPS breadcrumb from user_location_history.
  // Labelled "Track" in the UI — the running-sheet map's old "Trace Route"
  // (waypoint route reconstruction) was a different feature and has been
  // removed, so the name is no longer shared. The internal tracedUserIds /
  // traceLinesRef names are unchanged to keep this diff to the label.
  const toggleUserTrace = (userId: number) => {
    setTracedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        trackStartsRef.current.delete(userId);
      } else {
        next.add(userId);
        // Track draws from the moment it is switched on, not from whatever
        // history already exists — an officer tracked for a search wants the
        // line to start where they started, not to open with the drive in.
        trackStartsRef.current.set(userId, Date.now());
      }
      return next;
    });
  };

  // ── RS Quick-entry helper ────────────────────────────────────────────────────
  // Helper: start/restart the 30-second countdown + auto-submit timer
  const startInlineCountdown = () => {
    // Countdown/auto-submit removed — no timer
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current)
      clearInterval(rsCountdownIntervalRef.current);
  };

  const closeInlineField = () => {
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current)
      clearInterval(rsCountdownIntervalRef.current);
    setRsInlineLabel(null);
    setRsInlineText("");
    setRsInlineCins(new Set());
    rsInlineCinsRef.current = new Set();
    setRsCountdown(30);
    setRsInlineTypingMode(false);
    setRsInlineUndoStack([]);
  };

  const submitInlineField = () => {
    if (!rsInlineLabel) return;
    const finalText = rsInlineText.trim() ? rsInlineText.trim() : rsInlineLabel;
    // Capture CINs BEFORE closeInlineField clears the ref
    const cinsToAttach = new Set(rsInlineCinsRef.current);
    const timeOverride = mapQeTimeOverride;
    const rowDateOverride = mapQeRowDate;
    closeInlineField();
    void addQuickRsEntryWithChecks(
      finalText,
      cinsToAttach,
      timeOverride,
      rowDateOverride
    );
  };

  const resetInlineTimer = () => {
    startInlineCountdown();
  };

  // Switches the observation field from tap-only to typing mode, then
  // re-focuses it — blur+focus (not just focus) is needed because the field
  // may already be focused as read-only, and browsers only summon the
  // on-screen keyboard on a fresh focus event against an editable field.
  const enableInlineTyping = () => {
    setRsInlineTypingMode(true);
    requestAnimationFrame(() => {
      const el = rsInlineInputRef.current;
      if (el) {
        el.blur();
        el.focus();
      }
    });
  };

  // Explicit on/off control for the same tap-only/typing switch as
  // enableInlineTyping above — lets a touch-device officer deliberately
  // drop back to chip-click-only instead of typing mode being one-way.
  const toggleInlineTyping = () => {
    if (rsInlineTypingMode) {
      setRsInlineTypingMode(false);
      rsInlineInputRef.current?.blur();
    } else {
      enableInlineTyping();
    }
  };

  // Snapshot the observation text before a change is applied, so undoInlineText
  // can step back to it. Call with the pre-change value.
  const pushInlineUndo = (prevText: string) => {
    setRsInlineUndoStack(stack => [...stack, prevText]);
  };

  // Steps the observation text back one snapshot at a time — repeated taps
  // keep undoing further back, all the way to the empty starting text.
  const undoInlineText = () => {
    setRsInlineUndoStack(stack => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setRsInlineText(restored);
      return stack.slice(0, -1);
    });
    resetInlineTimer();
  };

  const openInlineField = (label: string) => {
    if (!rsSelectedSheetId) return;
    setRsInlineLabel(label);
    setRsInlineText("");
    setRsInlineCins(new Set());
    rsInlineCinsRef.current = new Set();
    setRsInlineTypingMode(false);
    setRsInlineUndoStack([]);
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
      setMapQeTimeOverride(
        `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`
      );
      // Default date to the RS creation date (Perth) so operators don't accidentally log on the wrong day
      const selectedSheet = (rsSheetsData as any[] | undefined)?.find(
        (s: any) => s.id === rsSelectedSheetId
      );
      if (selectedSheet?.createdAt) {
        const sheetDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Australia/Perth",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(selectedSheet.createdAt));
        setMapQeRowDate(sheetDate);
      } else {
        setMapQeRowDate(_getTodayPerthYmd());
      }
      setShowMapQeDateStepper(false); // always start with stepper hidden
      // Use a small delay so the sheet has rendered before we set focus
      setTimeout(() => {
        setRsInlineLabel("Entry");
        setRsInlineText("");
        setRsInlineCins(new Set());
        rsInlineCinsRef.current = new Set();
        setRsInlineTypingMode(false);
        setTimeout(() => rsInlineInputRef.current?.focus(), 80);
      }, 50);
    }
    if (!mapQeOpen) {
      // Clear the inline field when the sheet closes
      setRsInlineLabel(null);
      setRsInlineText("");
    }
  }, [mapQeOpen, rsSelectedSheetId, rsSheetsData]);

  const addQuickRsEntry = (
    observation: string,
    cinsToAttach?: Set<string> | null,
    timeOverride?: string | null,
    rowDateOverride?: string | null
  ) => {
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
        const h24 = now.getHours();
        const min = now.getMinutes();
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
      {
        sheetId: rsSelectedSheetId,
        time: timeStr,
        timeMinutes: totalMins,
        observation,
        rowDate: rowDateOverride ?? undefined,
      },
      {
        onSuccess: (data, vars) => {
          const now2 = new Date();
          const h24b = now2.getHours();
          const minb = now2.getMinutes();
          const timeStr2 = `${String(h24b % 12 === 0 ? 12 : h24b % 12).padStart(2, "0")}:${String(minb).padStart(2, "0")} ${h24b < 12 ? "AM" : "PM"}`;
          setRsLastEntry({
            label: vars.observation ?? "Entry",
            time: timeStr2,
          });
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
          // Refetch entity chips so a newly-mentioned entity shows up as a chip immediately
          if (rsSelectedSheetId) {
            void utils.row.entityChips.invalidate({
              sheetId: rsSelectedSheetId,
            });
            // Refetch pending vehicle depart/arrive chips so a chip that
            // was just used (e.g. this row logged the vehicle arriving)
            // disappears immediately rather than staying offered again.
            void utils.row.pendingVehicleDepartures.invalidate({
              sheetId: rsSelectedSheetId,
            });
            void utils.row.pendingVehicleArrivals.invalidate({
              sheetId: rsSelectedSheetId,
            });
          }
        },
        onError: e => {
          setRsAddingRow(false);
          toast.error(e.message);
        },
      }
    );
  };

  // Appends " at <location>" to the end of the observation, ahead of any
  // trailing sentence punctuation — used when the officer confirms the
  // MissingLocationAlert prompt. Mirrors appendLocationSuggestion in
  // SheetDetail.tsx (kept local rather than shared — it's a single small
  // pure function with no other dependencies). Deliberately WITHOUT
  // brackets, matching the vehicle-arriving chip's "subsequent mention"
  // convention — a bare mention of an address already bracket-introduced
  // elsewhere in the sheet is picked up by getAllIntelligenceEntities'
  // "Pass B" scan, and looksLikeUnlocatedVehiclePresenceRow (server/db.ts)
  // checks for that bare mention too, so this row correctly stops being
  // flagged without needing its own bracket — see
  // missingLocationSuggestion.test.ts.
  const appendQeLocationSuggestion = (
    text: string,
    location: string
  ): string => {
    const trimmed = text.trimEnd();
    const trailingPunct = trimmed.match(/([.:])\s*$/);
    if (trailingPunct) {
      return `${trimmed.slice(0, -1)} at ${location}${trailingPunct[1]}`;
    }
    return `${trimmed} at ${location}.`;
  };

  // Same save-time checks as SheetDetail's updateRowWithDupeCheck, run
  // before the row actually gets created — RS Quick Entry from the map is
  // a second entry point into row.create and was skipping both prompts
  // entirely. Only fires with meaningful observation text and a selected
  // sheet; on any check failure, falls through to a normal save rather
  // than blocking the officer's entry.
  const addQuickRsEntryWithChecks = async (
    observation: string,
    cinsToAttach?: Set<string> | null,
    timeOverride?: string | null,
    rowDateOverride?: string | null
  ) => {
    if (!rsSelectedSheetId || !observation.trim()) {
      addQuickRsEntry(observation, cinsToAttach, timeOverride, rowDateOverride);
      return;
    }

    const queue: QeDupe[] = [];
    try {
      const missingLocation = await utils.row.checkMissingLocation.fetch({
        sheetId: rsSelectedSheetId,
        observation,
      });
      if (missingLocation) {
        queue.push({
          kind: "missingLocation",
          location: missingLocation.location,
          source: missingLocation.source,
        });
      }
    } catch (err) {
      console.warn("checkMissingLocation failed", err);
    }
    try {
      const vagueVehicle = await utils.row.checkVagueVehicleMatch.fetch({
        sheetId: rsSelectedSheetId,
        observation,
      });
      if (vagueVehicle) {
        queue.push({
          kind: "vagueVehicle",
          loserLabel: vagueVehicle.loserLabel,
          winnerLabel: vagueVehicle.winnerLabel,
          reason: vagueVehicle.reason,
        });
      }
    } catch (err) {
      console.warn("checkVagueVehicleMatch failed", err);
    }

    if (queue.length === 0) {
      addQuickRsEntry(observation, cinsToAttach, timeOverride, rowDateOverride);
      return;
    }
    qePendingEntryRef.current = {
      observation,
      cinsToAttach: cinsToAttach ?? null,
      timeOverride: timeOverride ?? null,
      rowDateOverride: rowDateOverride ?? null,
    };
    setQeDupeQueue(queue);
    setQeDupeIndex(0);
    setQeDupeDialogOpen(true);
  };

  function handleQeDupeResolved() {
    const nextIndex = qeDupeIndex + 1;
    if (nextIndex < qeDupeQueue.length) {
      setQeDupeIndex(nextIndex);
      setQeDupeDialogOpen(true);
    } else {
      setQeDupeDialogOpen(false);
      setQeDupeQueue([]);
      setQeDupeIndex(0);
      const pending = qePendingEntryRef.current;
      qePendingEntryRef.current = null;
      if (pending) {
        addQuickRsEntry(
          pending.observation,
          pending.cinsToAttach,
          pending.timeOverride,
          pending.rowDateOverride
        );
      }
    }
  }

  function handleQeMissingLocationResolved(
    addLocation: boolean,
    location: string
  ) {
    if (addLocation && qePendingEntryRef.current) {
      qePendingEntryRef.current = {
        ...qePendingEntryRef.current,
        observation: appendQeLocationSuggestion(
          qePendingEntryRef.current.observation,
          location
        ),
      };
    }
    handleQeDupeResolved();
  }

  async function handleQeVagueVehicleResolved(
    confirmed: boolean,
    warning: { loserLabel: string; winnerLabel: string }
  ) {
    setQeVagueVehicleBusy(true);
    try {
      if (confirmed) {
        await mergeEntitiesMut.mutateAsync({
          type: "vehicle",
          winnerLabel: warning.winnerLabel,
          loserLabel: warning.loserLabel,
        });
      } else {
        await markEntitiesNotDuplicateMut.mutateAsync({
          type: "vehicle",
          labelA: warning.winnerLabel,
          labelB: warning.loserLabel,
        });
      }
    } catch (err) {
      console.warn("vague vehicle match resolution failed", err);
    } finally {
      setQeVagueVehicleBusy(false);
    }
    handleQeDupeResolved();
  }

  return (
    <DashboardLayout
      fillViewport
      rightPaneToggle={{
        isOpen: rsActionsPaneOpen,
        onToggle: () => setRsActionsPaneOpen(o => !o),
      }}
    >
      <div className="relative flex w-full h-full overflow-hidden">
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
            />

            {/* Map / Sat toggle — top-right, replaces Google's native
              mapTypeControl (see Map.tsx) so it can sit at a predictable,
              compact size next to the search bar instead of the SDK's own
              wider "Map"/"Satellite" control, which doesn't shrink or
              relabel and collided with the search bar on narrow screens. */}
            <div
              className="absolute z-20 pointer-events-auto flex items-center bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden"
              style={{ top: "10px", right: "10px", height: "36px" }}
              onClick={e => e.stopPropagation()}
            >
              {(
                [
                  { id: "roadmap", label: "Map" },
                  { id: "hybrid", label: "Sat" },
                ] as const
              ).map((opt, i) => {
                const active = mapInitialTypeId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => mapRef.current?.setMapTypeId(opt.id)}
                    className={`h-full px-3 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-sky-600 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    } ${i === 0 ? "border-r border-gray-200" : ""}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
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
              style={{ top: "52px", right: "10px" }}
              aria-label="Refresh map data"
              title="Refresh map data"
            >
              <RefreshCw
                className={`h-4 w-4 ${mapRefreshing ? "animate-spin" : ""}`}
              />
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
                  followMode
                    ? "Stop following my location"
                    : "Follow my location"
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
                                const pin =
                                  new google.maps.marker.AdvancedMarkerElement({
                                    map: mapRef.current!,
                                    position: loc,
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

          {/* RS Actions pane is now opened via the header folder-expander icon
            (DashboardLayout's rightPaneToggle prop) instead of a draggable
            side tab — see the DashboardLayout invocation below. */}

          {/* ── Draggable Floating Pill Bar (all devices) ──
             Tap-hold the drag handle to reposition vertically. Position persisted to localStorage. */}
          <div
            className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none"
            style={{ top: `${pillBarTop}%`, transform: "translateY(-50%)" }}
          >
            {/* Drag handle — long-press activates drag */}
            <div
              className={`pointer-events-auto flex items-center gap-1.5 px-2 py-1.5 rounded-3xl ${
                pillBarDraggingRef.current ? "cursor-grabbing" : "cursor-grab"
              } select-none touch-none`}
              onMouseDown={e => {
                // Long-press to drag on desktop
                const startY = e.clientY;
                const startTop = pillBarTop;
                const parentH =
                  e.currentTarget.parentElement?.parentElement?.clientHeight ??
                  window.innerHeight;
                pillBarIsDraggingRef.current = false;
                pillBarLongPressRef.current = setTimeout(() => {
                  pillBarDraggingRef.current = true;
                  const onMove = (me: MouseEvent) => {
                    const delta = me.clientY - startY;
                    if (Math.abs(delta) > 3) {
                      pillBarIsDraggingRef.current = true;
                    }
                    setPillBarTop(
                      Math.max(
                        5,
                        Math.min(95, startTop + (delta / parentH) * 100)
                      )
                    );
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
                  if (pillBarLongPressRef.current)
                    clearTimeout(pillBarLongPressRef.current);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mouseup", onUp);
              }}
              onTouchStart={e => {
                const touch = e.touches[0];
                const startY = touch.clientY;
                const startTop = pillBarTop;
                const parentH =
                  e.currentTarget.parentElement?.parentElement?.clientHeight ??
                  window.innerHeight;
                pillBarIsDraggingRef.current = false;
                pillBarLongPressRef.current = setTimeout(() => {
                  pillBarDraggingRef.current = true;
                  const onMove = (te: TouchEvent) => {
                    const delta = te.touches[0].clientY - startY;
                    if (Math.abs(delta) > 3) {
                      pillBarIsDraggingRef.current = true;
                    }
                    setPillBarTop(
                      Math.max(
                        5,
                        Math.min(95, startTop + (delta / parentH) * 100)
                      )
                    );
                  };
                  const onEnd = () => {
                    pillBarDraggingRef.current = false;
                    document.removeEventListener("touchmove", onMove);
                    document.removeEventListener("touchend", onEnd);
                  };
                  document.addEventListener("touchmove", onMove, {
                    passive: true,
                  });
                  document.addEventListener("touchend", onEnd);
                }, 300);
                const onEnd = () => {
                  if (pillBarLongPressRef.current)
                    clearTimeout(pillBarLongPressRef.current);
                  document.removeEventListener("touchend", onEnd);
                };
                document.addEventListener("touchend", onEnd);
              }}
            >
              {/* Active RS pill */}
              {(() => {
                const activeSheet =
                  rsSelectedSheetId && rsSheetsData
                    ? (rsSheetsData as any[]).find(
                        (s: any) => s.id === rsSelectedSheetId
                      )
                    : null;
                return (
                  <button
                    disabled={!activeSheet}
                    onClick={e => {
                      if (pillBarIsDraggingRef.current) {
                        e.preventDefault();
                        return;
                      }
                      if (activeSheet)
                        setLocation(`/sheet/${rsSelectedSheetId}`);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl shadow-lg border transition-all w-[136px] px-5 py-2.5 ${
                      activeSheet
                        ? "text-white border-blue-600 bg-blue-400 hover:bg-blue-300 active:scale-95 cursor-pointer"
                        : "text-muted-foreground/25 border-sidebar-border/40 bg-transparent cursor-default"
                    }`}
                    title={
                      activeSheet
                        ? "Open active running sheet"
                        : "No running sheet selected"
                    }
                  >
                    <ClipboardList className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-semibold whitespace-nowrap">
                      Active RS
                    </span>
                  </button>
                );
              })()}

              {/* RS Entry pill */}
              {(() => {
                const hasSheet = !!rsSelectedSheetId;
                return (
                  <button
                    disabled={!hasSheet}
                    onClick={e => {
                      if (pillBarIsDraggingRef.current) {
                        e.preventDefault();
                        return;
                      }
                      if (hasSheet) setMapQeOpen(true);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl shadow-lg border transition-all w-[136px] px-5 py-2.5 ${
                      hasSheet
                        ? "text-white border-emerald-600 bg-emerald-400 hover:bg-emerald-300 active:scale-95 cursor-pointer"
                        : "text-muted-foreground/25 border-sidebar-border/40 bg-transparent cursor-default"
                    }`}
                    title={
                      hasSheet
                        ? "RS Quick Entry"
                        : "Select a running sheet first"
                    }
                  >
                    <FileText className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-semibold whitespace-nowrap">
                      RS Entry
                    </span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── RS Actions Right Pane ──
           z-30 + full viewport width on mobile: the map's floating overlays
           (search bar, locate buttons, bottom pill bar) are absolutely
           positioned within Map Area and don't shrink/clip with it, so on a
           narrow screen a partial-width pane still leaves them spilling over
           its content underneath. The left pane never showed this because it
           opens flush against the same top-left corner those specific
           overlays already anchor to, so it happens to cover them outright;
           the right pane has no such natural overlap, so it needs to be
           explicit here — full width (nothing beside it to spill into) and a
           z-index above the overlays' z-20 (nothing paints over it either),
           giving it the same "full vision" the left pane already has. */}
        <div
          className={`relative flex h-full flex-col border-l-[3px] border-primary/40 bg-card shadow-2xl flex-shrink-0 ${
            rsActionsPaneOpen ? "z-30" : ""
          } ${
            paneResizeDraggingRef.current ? "" : "transition-all duration-200"
          } ${rsActionsPaneOpen ? "rounded-l-2xl" : "overflow-hidden"}`}
          style={{
            width: rsActionsPaneOpen
              ? isMobile
                ? "100vw"
                : `${activePaneWidth}px`
              : 0,
            minWidth: rsActionsPaneOpen
              ? isMobile
                ? "100vw"
                : `${PANE_MIN_WIDTH}px`
              : 0,
          }}
        >
          {/* Resize handle — drag left edge to widen/narrow the pane (mouse or touch). Not on mobile: the pane is full-width there, nothing to resize against. */}
          {rsActionsPaneOpen && !isMobile && (
            <div
              className="absolute -left-1.5 top-0 bottom-0 w-3 z-10 flex items-center justify-center cursor-col-resize touch-none select-none group"
              title="Drag to resize"
              onMouseDown={e => {
                e.stopPropagation();
                paneResizeDraggingRef.current = true;
                const startX = e.clientX;
                const startWidth = activePaneWidth;
                const onMove = (me: MouseEvent) => {
                  const delta = startX - me.clientX;
                  const maxW = Math.max(
                    PANE_MIN_WIDTH,
                    Math.min(720, window.innerWidth - 320)
                  );
                  const next = Math.min(
                    maxW,
                    Math.max(PANE_MIN_WIDTH, startWidth + delta)
                  );
                  if (paneSubViewOpen) setPanelWidthProfile(next);
                  else setPanelWidthNormal(next);
                };
                const onUp = () => {
                  paneResizeDraggingRef.current = false;
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
              onTouchStart={e => {
                e.stopPropagation();
                paneResizeDraggingRef.current = true;
                const startX = e.touches[0].clientX;
                const startWidth = activePaneWidth;
                const onMove = (te: TouchEvent) => {
                  const delta = startX - te.touches[0].clientX;
                  const maxW = Math.max(
                    PANE_MIN_WIDTH,
                    Math.min(720, window.innerWidth - 320)
                  );
                  const next = Math.min(
                    maxW,
                    Math.max(PANE_MIN_WIDTH, startWidth + delta)
                  );
                  if (paneSubViewOpen) setPanelWidthProfile(next);
                  else setPanelWidthNormal(next);
                };
                const onEnd = () => {
                  paneResizeDraggingRef.current = false;
                  document.removeEventListener("touchmove", onMove);
                  document.removeEventListener("touchend", onEnd);
                };
                document.addEventListener("touchmove", onMove, {
                  passive: true,
                });
                document.addEventListener("touchend", onEnd);
              }}
            >
              <div className="w-1 h-12 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
            </div>
          )}

          {/* Pane Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-primary/20 flex-shrink-0 bg-primary/[0.06]">
            {paneTargetProfileId !== null ? (
              <button
                onClick={() => setPaneTargetProfileId(null)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-violet-500 flex-shrink-0" />
                <User className="h-4 w-4 text-violet-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Target Profile
                </span>
              </button>
            ) : paneOperationProfileId !== null ? (
              <button
                onClick={() => setPaneOperationProfileId(null)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Operation Profile
                </span>
              </button>
            ) : paneImagesOpId !== null ? (
              <button
                onClick={() => {
                  // Back steps one level at a time: a sheet's photos -> that
                  // operation's sheet folders -> out to the settings list.
                  if (paneImagesSheetId !== null) setPaneImagesSheetId(null);
                  else setPaneImagesOpId(null);
                }}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-pink-500 flex-shrink-0" />
                <ImageIcon className="h-4 w-4 text-pink-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Operation Images
                </span>
              </button>
            ) : paneSheetDetailId !== null ? (
              <button
                onClick={() => setPaneSheetDetailId(null)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4 text-teal-500 flex-shrink-0" />
                <ClipboardList className="h-4 w-4 text-teal-500 flex-shrink-0" />
                <span className="font-bold text-sm tracking-tight truncate">
                  Running Sheet
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <span className="font-bold text-sm tracking-tight">
                  Map Settings
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl flex-shrink-0"
              onClick={() => {
                setRsActionsPaneOpen(false);
                setPaneTargetProfileId(null);
                setPaneOperationProfileId(null);
                setPaneImagesOpId(null);
                setPaneImagesSheetId(null);
                setPaneSheetDetailId(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Pane Body */}
          {paneTargetProfileId !== null ? (
            <div className="flex-1 overflow-hidden">
              <DocumentZoomViewer contentWidth={768} className="w-full h-full">
                <TargetProfileContent targetId={paneTargetProfileId} />
              </DocumentZoomViewer>
            </div>
          ) : paneOperationProfileId !== null ? (
            <div className="flex-1 overflow-hidden">
              <DocumentZoomViewer contentWidth={768} className="w-full h-full">
                <OperationProfileContent operationId={paneOperationProfileId} />
              </DocumentZoomViewer>
            </div>
          ) : paneImagesOpId !== null ? (
            // The Images page's own two levels, rendered inline. Plain scroll
            // rather than DocumentZoomViewer: this is an interactive gallery
            // (upload, link, delete, lightbox), not a document to zoom.
            <div className="flex-1 overflow-y-auto">
              {paneImagesSheetId !== null ? (
                <SheetGallery
                  operationId={paneImagesOpId}
                  sheetId={paneImagesSheetId}
                  onBack={() => setPaneImagesSheetId(null)}
                  hideBackButton
                />
              ) : (
                <SheetFolderList
                  operationId={paneImagesOpId}
                  onBack={() => setPaneImagesOpId(null)}
                  onSelect={id => setPaneImagesSheetId(id)}
                  hideBackButton
                />
              )}
            </div>
          ) : paneSheetDetailId !== null ? (
            // The full SheetDetail page component itself, embedded — plain
            // scroll rather than DocumentZoomViewer since it's an
            // interactive edit surface (rows, certification, roster), not a
            // document to zoom. `embedded` hides its own page chrome (back
            // arrow, Summary/Governance tabs) since this pane already
            // supplies a header/close control and those would otherwise
            // navigate the whole app away from the map.
            <div className="flex-1 overflow-y-auto">
              <SheetDetail sheetIdProp={paneSheetDetailId} embedded />
            </div>
          ) : (
            <div
              className="flex-1 overflow-y-auto"
              onClick={() => {
                if (rsInlineLabel) closeInlineField();
              }}
            >
              {/* ── MAP THEME toggle ── */}
              <div className="px-3 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Map Theme
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-medium transition-colors ${!mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      Light
                    </span>
                    <Switch
                      checked={mapDarkMode}
                      onCheckedChange={setMapDarkMode}
                      className="scale-90"
                    />
                    <span
                      className={`text-[11px] font-medium transition-colors ${mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      Dark
                    </span>
                  </div>
                </div>
              </div>

              {/* ── OPERATIONS section ── */}
              <div className="px-3 py-3 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                  Operations
                </span>
                {opsLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Spinner className="h-4 w-4" />
                  </div>
                ) : !operations || operations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    No operations found.
                  </p>
                ) : (
                  <Popover
                    open={opsDropdownOpen}
                    onOpenChange={setOpsDropdownOpen}
                  >
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-border bg-background hover:bg-accent/50 active:scale-[0.98] transition-all text-left">
                        <span className="text-xs text-foreground truncate flex-1">
                          {selectedOpIds.length === 0
                            ? "Select operations…"
                            : selectedOpIds.length ===
                                (operations as any[]).length
                              ? "All operations"
                              : (operations as any[])
                                  .filter((op: any) =>
                                    selectedOpIds.includes(op.id)
                                  )
                                  .map((op: any) => op.name)
                                  .join(", ")}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-2 rounded-xl border-2 border-border shadow-xl"
                      align="end"
                    >
                      <div className="flex items-center justify-between px-1 pb-2 border-b border-border mb-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Select Operations
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={selectAllOps}
                            className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold"
                          >
                            All
                          </button>
                          <button
                            onClick={clearAll}
                            className="text-[10px] text-muted-foreground hover:text-foreground font-semibold"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                        {(operations as any[]).map(op => {
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
                                <label
                                  htmlFor={`rp-op-${op.id}`}
                                  className="flex-1 text-sm cursor-pointer truncate font-medium"
                                >
                                  {op.name}
                                </label>
                                {opTargets.length > 0 && (
                                  <button
                                    onClick={() =>
                                      setOpExpanded(prev => {
                                        const next = new Set(prev);
                                        next.has(op.id)
                                          ? next.delete(op.id)
                                          : next.add(op.id);
                                        return next;
                                      })
                                    }
                                    className="text-muted-foreground hover:text-foreground p-0.5"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {isExpanded && opTargets.length > 0 && (
                                <div className="ml-6 pl-2 border-l border-border/50 flex flex-col gap-0.5 mb-1">
                                  {opTargets.map(t => (
                                    <div
                                      key={t.id}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/40 transition-colors"
                                    >
                                      <Checkbox
                                        id={`rp-tgt-${t.id}`}
                                        checked={selectedTargetIds.includes(
                                          t.id
                                        )}
                                        onCheckedChange={() =>
                                          toggleTarget(t.id)
                                        }
                                        className="h-3.5 w-3.5"
                                      />
                                      <label
                                        htmlFor={`rp-tgt-${t.id}`}
                                        className="text-xs cursor-pointer truncate text-muted-foreground"
                                      >
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
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* ── RS SELECTION section ── */}
              <div className="px-3 py-3 border-b border-border space-y-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  RS Selection
                </span>

                {/* No ops selected — prompt user */}
                {selectedOpIds.length === 0 && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Select an operation above to see available running sheets.
                  </p>
                )}

                {/* Running sheet selector — driven by top Operations filter */}
                {selectedOpIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={
                        rsSelectedSheetId !== null
                          ? String(rsSelectedSheetId)
                          : ""
                      }
                      onValueChange={val => {
                        setRsSelectedSheetId(Number(val));
                        setRsLastEntry(null);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9 text-xs rounded-xl border-2">
                        <SelectValue placeholder="Choose running sheet…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(rsSheetsData ?? [])
                          .filter((s: any) => !s.closedAt && !s.deletedAt)
                          .map((s: any) => (
                            <SelectItem
                              key={s.id}
                              value={String(s.id)}
                              className="text-xs"
                            >
                              {s.title || `Sheet #${s.id}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {rsSelectedSheetId !== null && (
                      <button
                        onClick={() => {
                          setRsSelectedSheetId(null);
                          setRsLastEntry(null);
                        }}
                        className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border-2 border-border bg-muted/40 hover:bg-destructive/20 hover:border-destructive/40 active:scale-95 transition-all"
                        title="Clear running sheet selection"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}

                {/* Open the selected sheet inline (view + edit) without
                    leaving the map — same "colour-coded link" pattern as
                    the Operation Profile / Images links below, so this
                    reads as one consistent set of pane shortcuts. Unlike
                    those, stays open until the pane's own back arrow / X is
                    used (not on a map tap), since it's an active edit
                    surface, not a read view. */}
                {rsSelectedSheetId !== null && (
                  <button
                    onClick={() => {
                      setPaneSheetDetailId(rsSelectedSheetId);
                      setPaneTargetProfileId(null);
                      setPaneOperationProfileId(null);
                      setPaneImagesOpId(null);
                      setPaneImagesSheetId(null);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 active:scale-[0.98] transition-all min-w-0"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-teal-500 truncate flex-1 text-left">
                      Open Running Sheet
                    </span>
                    <ExternalLink className="h-3 w-3 text-teal-500/60 flex-shrink-0" />
                  </button>
                )}

                {/* RS Quick Entry moved to bottom tab bar — use the indigo RS Entry pill instead */}
              </div>
              {/* end RS Selection */}

              {/* ── PROFILES (Operation behind the selected RS, then its Target) ── */}
              {rsSelectedSheetId !== null &&
                (() => {
                  const sheet = rsSheetsData
                    ? (rsSheetsData as any[]).find(
                        (s: any) => s.id === rsSelectedSheetId
                      )
                    : null;
                  const opId = sheet?.operationId ?? null;
                  if (!opId && !rsTargetData) return null;
                  return (
                    <div className="px-3 py-3 border-b border-border space-y-2">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                        Profiles
                      </span>
                      {opId && (
                        <button
                          onClick={() => {
                            setPaneOperationProfileId(opId);
                            setPaneTargetProfileId(null);
                            setPaneImagesOpId(null);
                            setPaneImagesSheetId(null);
                            setPaneSheetDetailId(null);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 active:scale-[0.98] transition-all min-w-0"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-blue-500 truncate flex-1 text-left">
                            {(operations as any[] | undefined)?.find(
                              (o: any) => o.id === opId
                            )?.name ?? "Operation profile"}
                          </span>
                          <ExternalLink className="h-3 w-3 text-blue-500/60 flex-shrink-0" />
                        </button>
                      )}
                    </div>
                  );
                })()}
              {/* end Profiles */}

              {/* ── IMAGES (linked to the selected RS's operation) ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Images
                </span>
                {(() => {
                  const sheet =
                    rsSelectedSheetId !== null && rsSheetsData
                      ? (rsSheetsData as any[]).find(
                          (s: any) => s.id === rsSelectedSheetId
                        )
                      : null;
                  const opId = sheet?.operationId ?? null;
                  if (!opId) {
                    return (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Select a running sheet above to open its operation's
                        images.
                      </p>
                    );
                  }
                  return (
                    <button
                      onClick={() => {
                        setPaneImagesOpId(opId);
                        setPaneImagesSheetId(null);
                        setPaneTargetProfileId(null);
                        setPaneOperationProfileId(null);
                        setPaneSheetDetailId(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 active:scale-[0.98] transition-all min-w-0"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-pink-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-pink-500 truncate flex-1 text-left">
                        Operation Images
                      </span>
                      <ExternalLink className="h-3 w-3 text-pink-500/60 flex-shrink-0" />
                    </button>
                  );
                })()}
              </div>
              {/* end Images */}

              {/* ── LOCATION (own section, so sharing your position is a
                deliberate act with its own heading rather than a small switch
                tucked into the Teams header) ── */}
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Location
                </span>
                <button
                  onClick={() => handleSharingToggle(!sharingEnabled)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                    sharingEnabled
                      ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={sharingEnabled}
                >
                  <Radio
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      sharingEnabled
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      sharingEnabled ? "text-emerald-500" : "text-foreground"
                    }`}
                  >
                    Show &amp; Share
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      sharingEnabled
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {sharingEnabled ? "On" : "Off"}
                  </span>
                </button>
              </div>
              {/* end Location */}

              {/* ── TEAMS (Live Location) ── */}
              <div className="px-3 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      TEAMS
                    </span>
                  </div>
                </div>

                {/* GPS error */}
                {gpsError && (
                  <div className="flex items-start gap-1.5 mb-3 p-2.5 rounded-xl border-2 border-amber-500/30 bg-amber-500/10">
                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-[10px] text-amber-400 leading-tight">
                      {gpsError}
                    </span>
                  </div>
                )}

                {/* Team rows — collapsible with memory */}
                <div className="flex flex-col gap-2">
                  {[
                    {
                      key: "TEAM1",
                      label: "Team 1",
                      colour: TEAM_COLOURS.TEAM1,
                      users: liveUsersByTeam.TEAM1,
                    },
                    {
                      key: "TEAM2",
                      label: "Team 2",
                      colour: TEAM_COLOURS.TEAM2,
                      users: liveUsersByTeam.TEAM2,
                    },
                    {
                      key: "PTT",
                      label: "PTT",
                      colour: TEAM_COLOURS.PTT,
                      users: liveUsersByTeam.PTT,
                    },
                  ].map(({ key, label, colour, users: teamUsers }) => {
                    const isCollapsed = collapsedTeams.has(key);
                    return (
                      <div
                        key={key}
                        className="rounded-xl border-2 border-border overflow-hidden"
                      >
                        {/* Team header — tap to collapse/expand */}
                        <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                          <button
                            onClick={() =>
                              setCollapsedTeams(prev => {
                                const next = new Set(prev);
                                next.has(key)
                                  ? next.delete(key)
                                  : next.add(key);
                                return next;
                              })
                            }
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: colour }}
                            />
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: colour }}
                            >
                              {label}
                            </span>
                            {teamUsers.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                ({teamUsers.length})
                              </span>
                            )}
                            {isCollapsed ? (
                              <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                            )}
                          </button>
                          <button
                            onClick={() => toggleTeamVisibility(key)}
                            className="ml-2 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0 px-1.5 py-0.5 rounded-md border border-border/50 bg-background/50"
                          >
                            {hiddenTeams.has(key) ? "Show" : "Hide"}
                          </button>
                        </div>
                        {/* Team members — shown when not collapsed */}
                        {!isCollapsed && (
                          <div className="px-3 py-2 border-t border-border bg-card">
                            {teamUsers.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground/50 italic">
                                No units online
                              </p>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {teamUsers.map(u => (
                                  <div
                                    key={u.userId}
                                    className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30"
                                  >
                                    <span className="text-[11px] text-foreground font-medium truncate">
                                      {u.name.toUpperCase()}
                                      {u.userId === user?.id && (
                                        <span className="ml-1 text-[9px] text-muted-foreground">
                                          (you)
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          toggleUserTrace(u.userId)
                                        }
                                        className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                          tracedUserIds.has(u.userId)
                                            ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                                            : "border-border/50 text-muted-foreground hover:text-foreground bg-background/50"
                                        }`}
                                      >
                                        {tracedUserIds.has(u.userId)
                                          ? "Tracking"
                                          : "Track"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          toggleUserVisibility(u.userId)
                                        }
                                        className="text-[10px] text-muted-foreground hover:text-foreground"
                                      >
                                        {hiddenUsers.has(u.userId)
                                          ? "Show"
                                          : "Hide"}
                                      </button>
                                    </div>
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
                  {liveUsersByTeam.unassigned.length > 0 &&
                    (() => {
                      const isCollapsed = collapsedTeams.has("null");
                      return (
                        <div className="rounded-xl border-2 border-border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                            <button
                              onClick={() =>
                                setCollapsedTeams(prev => {
                                  const next = new Set(prev);
                                  next.has("null")
                                    ? next.delete("null")
                                    : next.add("null");
                                  return next;
                                })
                              }
                              className="flex items-center gap-2 flex-1 min-w-0"
                            >
                              <div className="w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0" />
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                Unassigned
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ({liveUsersByTeam.unassigned.length})
                              </span>
                              {isCollapsed ? (
                                <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                              ) : (
                                <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                              )}
                            </button>
                            <button
                              onClick={() => toggleTeamVisibility("null")}
                              className="ml-2 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0 px-1.5 py-0.5 rounded-md border border-border/50 bg-background/50"
                            >
                              {hiddenTeams.has("null") ? "Show" : "Hide"}
                            </button>
                          </div>
                          {!isCollapsed && (
                            <div className="px-3 py-2 border-t border-border bg-card">
                              <div className="flex flex-col gap-0.5">
                                {liveUsersByTeam.unassigned.map(u => (
                                  <div
                                    key={u.userId}
                                    className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30"
                                  >
                                    <span className="text-[11px] text-foreground font-medium truncate">
                                      {u.name.toUpperCase()}
                                      {u.userId === user?.id && (
                                        <span className="ml-1 text-[9px] text-muted-foreground">
                                          (you)
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          toggleUserTrace(u.userId)
                                        }
                                        className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                          tracedUserIds.has(u.userId)
                                            ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                                            : "border-border/50 text-muted-foreground hover:text-foreground bg-background/50"
                                        }`}
                                      >
                                        {tracedUserIds.has(u.userId)
                                          ? "Tracking"
                                          : "Track"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          toggleUserVisibility(u.userId)
                                        }
                                        className="text-[10px] text-muted-foreground hover:text-foreground"
                                      >
                                        {hiddenUsers.has(u.userId)
                                          ? "Show"
                                          : "Hide"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              </div>
              {/* end TEAMS */}
            </div>
          )}
          {/* end Pane Body */}
        </div>
        {/* end RS Actions Right Pane */}

        {/* ── Quick-Link Editor Modal ── */}
        {editingQuickLinks && (
          <div
            className="absolute inset-0 z-30 flex items-end justify-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setEditingQuickLinks(false)}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Customise Quick Links
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose up to 3 custom shortcut folders (laptop: 3, tablet:
                    2, mobile: 1)
                  </p>
                </div>
                <button
                  onClick={() => setEditingQuickLinks(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {ALL_QUICK_LINK_OPTIONS.map(opt => {
                  const isSelected = quickLinks.some(q => q.path === opt.path);
                  const iconEntry = ICON_MAP[opt.icon];
                  const IconComp = iconEntry?.Icon ?? FolderSearch;
                  const iconColour =
                    iconEntry?.colour ?? "text-muted-foreground";
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
                          localStorage.setItem(
                            LS_QUICK_LINKS_KEY,
                            JSON.stringify(next)
                          );
                          return next;
                        });
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        isSelected
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-accent/30 border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      }`}
                    >
                      <IconComp
                        className={`h-3.5 w-3.5 flex-shrink-0 ${iconColour}`}
                      />
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 ml-auto flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground/60 mt-3 text-center">
                {quickLinks.length}/2 slots used — Operations and active sheet
                are always shown
              </p>
            </div>
          </div>
        )}

        {/* ── POI Tap Bottom Sheet ── */}
        {poiTap && !pendingLatLng && !mapQeOpen && !actionChooser && (
          <div
            className="absolute inset-0 z-40 flex items-end justify-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => setPoiTap(null)}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                    Business / Place
                  </p>
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {poiTap.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {poiTap.address}
                  </p>
                </div>
                <button
                  onClick={() => setPoiTap(null)}
                  className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* RS Quick Entry */}
                <button
                  onClick={() => {
                    setMapQeAddress(
                      buildPoiAddress(poiTap.name, poiTap.address)
                    );
                    setMapQeOpen(true);
                    setPoiTap(null);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all px-4 py-5"
                >
                  <ClipboardList className="h-7 w-7 text-primary" />
                  <span className="text-sm font-bold text-foreground">
                    RS Quick Entry
                  </span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    Add a running sheet entry for this location
                  </span>
                </button>
                {/* Add Marker Here */}
                <button
                  onClick={() => {
                    const rsAddress = buildPoiAddress(
                      poiTap.name,
                      poiTap.address
                    );
                    setCmLabel(poiTap.name);
                    setCmAddress(rsAddress);
                    setCmNote("");
                    setCmPersons([]);
                    setCmVehicles([]);
                    setCmRotation(0);
                    setCmLabelOnly(false);
                    setCmPersonInput("");
                    setCmVehicleInput("");
                    setCmOpId(
                      effectiveOpIdsForMarkers &&
                        effectiveOpIdsForMarkers.length === 1
                        ? effectiveOpIdsForMarkers[0]
                        : null
                    );
                    setPendingLatLng({ lat: poiTap.lat, lng: poiTap.lng });
                    setPoiTap(null);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
                >
                  <MapPin className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">
                    Add Marker Here
                  </span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    Place a custom marker at this business
                  </span>
                </button>
              </div>
              {/* Add Shape Here — full-width below the grid */}
              <button
                onClick={() => {
                  setShapeTypePicker({ lat: poiTap.lat, lng: poiTap.lng });
                  setPoiTap(null);
                }}
                className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-3"
              >
                <Shapes className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">
                  Add Shape Here
                </span>
              </button>
              {/* Navigate with Waze — full-width below the grid */}
              <a
                href={`https://waze.com/ul?ll=${poiTap?.lat},${poiTap?.lng}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPoiTap(null)}
                className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-95 transition-all px-4 py-3"
              >
                <Navigation2 className="h-5 w-5 text-cyan-400" />
                <span className="text-sm font-bold text-foreground">
                  Navigate with Waze
                </span>
              </a>
            </div>
          </div>
        )}

        {/* ── Action Chooser Bottom Sheet ── */}
        {actionChooser && (
          <div
            className="absolute inset-0 z-40 flex items-end justify-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => setActionChooser(null)}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                    Map Location
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {actionChooser.address}
                  </p>
                </div>
                <button
                  onClick={() => setActionChooser(null)}
                  className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
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
                  <span className="text-sm font-bold text-foreground">
                    RS Quick Entry
                  </span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    Add a running sheet entry for this location
                  </span>
                </button>
                {/* Add Marker Here */}
                <button
                  onClick={() => {
                    setCmLabel("");
                    setCmAddress(actionChooser.address);
                    setCmNote("");
                    setCmPersons([]);
                    setCmVehicles([]);
                    setCmRotation(0);
                    setCmLabelOnly(false);
                    setCmPersonInput("");
                    setCmVehicleInput("");
                    setCmOpId(
                      effectiveOpIdsForMarkers &&
                        effectiveOpIdsForMarkers.length === 1
                        ? effectiveOpIdsForMarkers[0]
                        : null
                    );
                    setPendingLatLng({
                      lat: actionChooser.lat,
                      lng: actionChooser.lng,
                    });
                    setActionChooser(null);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
                >
                  <MapPin className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">
                    Add Marker Here
                  </span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    Place a custom marker at this location
                  </span>
                </button>
              </div>
              {/* Add Shape Here — full-width below the grid */}
              <button
                onClick={() => {
                  setShapeTypePicker({
                    lat: actionChooser.lat,
                    lng: actionChooser.lng,
                  });
                  setActionChooser(null);
                }}
                className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-3"
              >
                <Shapes className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">
                  Add Shape Here
                </span>
              </button>
              {/* Navigate with Waze — full-width below the grid */}
              <a
                href={`https://waze.com/ul?ll=${actionChooser.lat},${actionChooser.lng}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setActionChooser(null)}
                className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl border-2 border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-95 transition-all px-4 py-3"
              >
                <Navigation2 className="h-5 w-5 text-cyan-400" />
                <span className="text-sm font-bold text-foreground">
                  Navigate with Waze
                </span>
              </a>
            </div>
          </div>
        )}

        {/* ── Shape Type Picker ── */}
        {shapeTypePicker && (
          <div
            className="absolute inset-0 z-40 flex items-end justify-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => setShapeTypePicker(null)}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                    Add Shape
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Choose a shape
                  </p>
                </div>
                <button
                  onClick={() => setShapeTypePicker(null)}
                  className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { type: "circle" as const, Icon: CircleIcon },
                    { type: "rectangle" as const, Icon: Square },
                    { type: "sector" as const, Icon: PieChart },
                    { type: "line" as const, Icon: Route },
                  ] as const
                ).map(({ type, Icon }) => (
                  <button
                    key={type}
                    onClick={() => {
                      beginCreateShape(
                        type,
                        shapeTypePicker.lat,
                        shapeTypePicker.lng
                      );
                      setShapeTypePicker(null);
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all px-4 py-5"
                  >
                    <Icon className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-bold text-foreground">
                      {SHAPE_TYPE_LABELS[type]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Line drawing indicator ── */}
        {drawingLine && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 rounded-full shadow-lg">
            <span>Tap the map to add points ({drawingLine.points.length})</span>
            {drawingLine.points.length >= 2 && (
              <button
                onClick={() => {
                  setPendingShape({
                    id: null,
                    shapeType: "line",
                    points: drawingLine.points,
                  });
                  setDrawingLine(null);
                }}
                className="rounded-full bg-primary-foreground text-primary px-2.5 py-0.5 text-[11px] font-bold"
              >
                Finish
              </button>
            )}
            {drawingLine.points.length > 1 && (
              <button
                onClick={() =>
                  setDrawingLine(d =>
                    d ? { points: d.points.slice(0, -1) } : d
                  )
                }
                className="rounded-full border border-primary-foreground/50 px-2.5 py-0.5 text-[11px] font-bold"
              >
                Undo point
              </button>
            )}
            <button
              onClick={() => setDrawingLine(null)}
              className="rounded-full border border-primary-foreground/50 px-2.5 py-0.5 text-[11px] font-bold"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Shape Placement / Edit Panel ──
            Deliberately NOT a blocking modal (no full-screen backdrop) —
            unlike the custom-marker placement panel, which just edits
            fields for a marker already fixed at the tapped point, a shape
            has to stay draggable/resizable ON THE MAP while this is open
            (the draft overlay effect above made it editable). A full
            backdrop would sit on top of the map and swallow every drag
            before it ever reached the shape — see movingMarkerId's own
            banner below for the same pointer-events-none wrapper /
            pointer-events-auto card pattern already used for exactly this
            "map must stay interactive underneath" situation. */}
        {pendingShape && (
          <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 max-h-[55vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {pendingShape.id ? "Edit Shape" : "Place Shape"} —{" "}
                    {SHAPE_TYPE_LABELS[pendingShape.shapeType]}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {pendingShape.shapeType === "circle" ||
                    pendingShape.shapeType === "sector"
                      ? "Drag the shape to move it, or drag its edge to resize."
                      : pendingShape.shapeType === "rectangle"
                        ? "Drag a corner to resize, or drag the shape to move it."
                        : "Drag any point to reshape the line."}
                  </p>
                </div>
                <button
                  onClick={() => setPendingShape(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Label */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={shapeLabel}
                  onChange={e => setShapeLabel(e.target.value)}
                  placeholder="e.g. Search area, No-go zone, Line of sight…"
                  className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Colour picker */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Colour
                </p>
                <div className="flex gap-2">
                  {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(col => (
                    <button
                      key={col}
                      onClick={() => setShapeColour(col)}
                      title={MARKER_COLOUR_LABELS[col]}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        shapeColour === col
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-foreground/40"
                      }`}
                      style={{ background: MARKER_COLOURS[col] }}
                    />
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {pendingShape.shapeType === "line"
                    ? "Line opacity"
                    : "Fill opacity"}{" "}
                  — {shapeOpacity}%
                </p>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={shapeOpacity}
                  onChange={e => setShapeOpacity(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              {/* Sector-only: radius + angle sliders (the shape isn't
                  freely draggable-edge like circle/rectangle, so these are
                  its only resize controls). */}
              {pendingShape.shapeType === "sector" && (
                <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Radius — {Math.round(pendingShape.radiusMeters ?? 0)}m
                    </p>
                    <input
                      type="range"
                      min={20}
                      max={3000}
                      step={10}
                      value={
                        pendingShape.radiusMeters ?? DEFAULT_SHAPE_RADIUS_M
                      }
                      onChange={e => {
                        const nextRadius = Number(e.target.value);
                        setPendingShape(p =>
                          p
                            ? {
                                ...p,
                                radiusMeters: nextRadius,
                                // An inner radius can never exceed the outer
                                // one — clamp it down if the officer shrinks
                                // the outer radius past it, rather than
                                // leaving an invalid/inverted ring band.
                                innerRadiusMeters: Math.min(
                                  p.innerRadiusMeters ?? 0,
                                  nextRadius
                                ),
                              }
                            : p
                        );
                      }}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Inner radius —{" "}
                      {Math.round(pendingShape.innerRadiusMeters ?? 0)}m
                    </p>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      0 draws a full wedge to the center point; anything higher
                      cuts the tip off into an arc band.
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(
                        20,
                        Math.round(
                          pendingShape.radiusMeters ?? DEFAULT_SHAPE_RADIUS_M
                        )
                      )}
                      step={10}
                      value={pendingShape.innerRadiusMeters ?? 0}
                      onChange={e =>
                        setPendingShape(p =>
                          p
                            ? {
                                ...p,
                                innerRadiusMeters: Number(e.target.value),
                              }
                            : p
                        )
                      }
                      className="w-full accent-primary"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Start angle — {Math.round(pendingShape.startAngle ?? 0)}°
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      step={1}
                      value={pendingShape.startAngle ?? 0}
                      onChange={e =>
                        setPendingShape(p =>
                          p ? { ...p, startAngle: Number(e.target.value) } : p
                        )
                      }
                      className="w-full accent-primary"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      End angle — {Math.round(pendingShape.endAngle ?? 90)}°
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      step={1}
                      value={pendingShape.endAngle ?? 90}
                      onChange={e =>
                        setPendingShape(p =>
                          p ? { ...p, endAngle: Number(e.target.value) } : p
                        )
                      }
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              )}

              {/* Operation — a shape saved with no operation is hidden from
                  any single/multi-operation-filtered map view (only the
                  "all operations" view shows it), same trap this fix closed
                  for custom markers — see the Operation picker in the
                  marker panel further down for the full explanation. */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                  Operation
                </label>
                <Select
                  value={shapeOpId === null ? "none" : String(shapeOpId)}
                  onValueChange={v =>
                    setShapeOpId(v === "none" ? null : Number(v))
                  }
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="No operation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No operation</SelectItem>
                    {(operations as any[] | undefined)?.map(op => (
                      <SelectItem key={op.id} value={String(op.id)}>
                        {op.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shapeOpId === null && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    No operation selected — this shape will only appear in the
                    all-operations map view.
                  </p>
                )}
              </div>

              {/* Save / Cancel / Delete */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPendingShape(null)}
                >
                  Cancel
                </Button>
                {pendingShape.id !== null && (
                  <Button
                    variant="destructive"
                    disabled={shapeSaving}
                    onClick={async () => {
                      if (pendingShape.id === null) return;
                      setShapeSaving(true);
                      try {
                        await deleteMapShapeMut.mutateAsync({
                          id: pendingShape.id,
                        });
                        toast.success("Shape deleted");
                        setPendingShape(null);
                      } catch {
                        toast.error("Couldn't delete shape");
                      } finally {
                        setShapeSaving(false);
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
                <Button
                  className="flex-1"
                  disabled={shapeSaving}
                  onClick={async () => {
                    setShapeSaving(true);
                    try {
                      const common = {
                        colour: shapeColour,
                        opacity: shapeOpacity,
                        label: shapeLabel.trim() || null,
                        operationId: shapeOpId,
                        centerLat: pendingShape.centerLat ?? null,
                        centerLng: pendingShape.centerLng ?? null,
                        radiusMeters: pendingShape.radiusMeters ?? null,
                        startAngle: pendingShape.startAngle ?? null,
                        endAngle: pendingShape.endAngle ?? null,
                        innerRadiusMeters:
                          pendingShape.innerRadiusMeters ?? null,
                        neLat: pendingShape.neLat ?? null,
                        neLng: pendingShape.neLng ?? null,
                        swLat: pendingShape.swLat ?? null,
                        swLng: pendingShape.swLng ?? null,
                        points: pendingShape.points ?? [],
                      };
                      if (pendingShape.id !== null) {
                        await updateMapShapeMut.mutateAsync({
                          id: pendingShape.id,
                          ...common,
                        });
                        toast.success("Shape updated");
                      } else {
                        await createMapShapeMut.mutateAsync({
                          shapeType: pendingShape.shapeType,
                          ...common,
                        });
                        toast.success("Shape placed");
                      }
                      setPendingShape(null);
                    } catch {
                      toast.error("Couldn't save shape");
                    } finally {
                      setShapeSaving(false);
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Manual Merge Picker ── */}
        {manualMergePicker && (
          <div
            className="absolute inset-0 z-40 flex items-end justify-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => setManualMergePicker(null)}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                    Manual Merge
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Select an Intel Pin to merge with
                  </p>
                </div>
                <button
                  onClick={() => setManualMergePicker(null)}
                  className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {manualMergePicker.candidates.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">
                    No intel pins found within 150m of this marker.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Intel pins must be visible on the map (not already merged)
                    to appear here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {manualMergePicker.candidates.map(c => (
                    <button
                      key={c.loc.label}
                      onClick={() => {
                        // Perform the merge: append intel data to the custom marker's merged list
                        const enriched = {
                          ...c.loc,
                          lat: c.position.lat,
                          lng: c.position.lng,
                        };
                        const existingList =
                          mergedIntelRef.current.get(manualMergePicker.cmId) ??
                          [];
                        if (
                          !existingList.find(e => e.label === enriched.label)
                        ) {
                          existingList.push(enriched);
                          existingList.sort((a, b) => {
                            if (
                              a.type === "target_address" &&
                              b.type !== "target_address"
                            )
                              return -1;
                            if (
                              a.type !== "target_address" &&
                              b.type === "target_address"
                            )
                              return 1;
                            return 0;
                          });
                          mergedIntelRef.current.set(
                            manualMergePicker.cmId,
                            existingList
                          );
                        }
                        // Remove the intel pin from the map
                        const pinIdx = markersRef.current.findIndex(m => {
                          const pos = m.position as
                            | google.maps.LatLng
                            | google.maps.LatLngLiteral
                            | null;
                          if (!pos) return false;
                          const lat =
                            typeof (pos as any).lat === "function"
                              ? (pos as any).lat()
                              : (pos as any).lat;
                          const lng =
                            typeof (pos as any).lng === "function"
                              ? (pos as any).lng()
                              : (pos as any).lng;
                          return (
                            Math.abs(lat - c.position.lat) < 0.00001 &&
                            Math.abs(lng - c.position.lng) < 0.00001
                          );
                        });
                        if (pinIdx !== -1) {
                          markersRef.current[pinIdx].map = null;
                          markersRef.current.splice(pinIdx, 1);
                        }
                        // Also remove from geocodedIntelRef so it doesn't show in future merge pickers
                        geocodedIntelRef.current.delete(c.loc.label);
                        // Persist the merge to the database so it survives page reloads
                        updateCustomMarkerMut.mutate({
                          id: manualMergePicker.cmId,
                          linkedIntelLabel: c.loc.label,
                        });
                        setManualMergePicker(null);
                      }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 active:scale-[0.98] transition-all px-4 py-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                          {c.loc.type === "target_address"
                            ? "Target Address"
                            : c.loc.type === "associate_address"
                              ? "Associate Address"
                              : "Observed Location"}
                        </p>
                        <p className="text-sm font-semibold text-foreground truncate">
                          {formatIntelAddress(c.loc.label)}
                        </p>
                        {c.loc.linkedTargets?.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.loc.linkedTargets
                              .map((t: any) => t.name)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {c.distanceM}m away
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Move Marker Banner ── */}
        {movingMarkerId !== null && (
          <div className="absolute top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 pointer-events-none">
            <div
              className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden"
              style={{ background: "rgba(3,105,161,0.97)" }}
            >
              {pendingMoveAddress === null ? (
                /* Phase 1: dragging */
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="text-sm font-semibold text-white">
                    Drag marker to new position
                  </p>
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
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 mb-0.5">
                    Move to
                  </p>
                  <p className="text-sm font-semibold text-white mb-3 leading-snug">
                    {pendingMoveAddress.address}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (
                          movingMarkerId === null ||
                          pendingMoveAddress === null
                        )
                          return;
                        updateCustomMarkerMut.mutate({
                          id: movingMarkerId,
                          lat: pendingMoveAddress.lat,
                          lng: pendingMoveAddress.lng,
                          address: pendingMoveAddress.address,
                        });
                        const marker =
                          customMarkerMapRefs.current.get(movingMarkerId);
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
                          const marker = customMarkerMapRefs.current.get(
                            orig.id
                          );
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
          <div className="absolute top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 pointer-events-none">
            <div
              className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden"
              style={{ background: "rgba(3,105,161,0.97)" }}
            >
              {pendingIntelMoveAddress === null ? (
                /* Phase 1: dragging */
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="text-sm font-semibold text-white">
                    Drag marker to new position
                  </p>
                  <button
                    onClick={() => {
                      // Cancel: snap marker back to original position
                      const orig = (window as any).__intelMoveOrigPos;
                      if (orig && orig.label === movingIntelLabel) {
                        const marker = markersRef.current.find(
                          (m: any) => m.title === orig.label
                        );
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
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 mb-0.5">
                    Move to
                  </p>
                  <p className="text-sm font-semibold text-white mb-3 leading-snug">
                    {pendingIntelMoveAddress.address}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (
                          movingIntelLabel === null ||
                          pendingIntelMoveAddress === null
                        )
                          return;
                        // Accept: update geocodedIntelRef so the new
                        // position is used immediately (this render), and
                        // persist it server-side so it's still there on the
                        // next redraw and on every other device — see
                        // intelPinOverrides.
                        const entry =
                          geocodedIntelRef.current.get(movingIntelLabel);
                        if (entry) {
                          geocodedIntelRef.current.set(movingIntelLabel, {
                            ...entry,
                            position: {
                              lat: pendingIntelMoveAddress.lat,
                              lng: pendingIntelMoveAddress.lng,
                            },
                          });
                        }
                        savePinOverrideMut.mutate({
                          label: movingIntelLabel,
                          lat: pendingIntelMoveAddress.lat,
                          lng: pendingIntelMoveAddress.lng,
                          address: pendingIntelMoveAddress.address,
                        });
                        const marker = markersRef.current.find(
                          (m: any) => m.title === movingIntelLabel
                        );
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
                          const marker = markersRef.current.find(
                            (m: any) => m.title === orig.label
                          );
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
            style={{
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setEditingIntelLabel(null)}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Edit Marker Appearance
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[260px]">
                    {editingIntelLabel}
                  </p>
                </div>
                <button
                  onClick={() => setEditingIntelLabel(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Icon picker */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Marker Icon
                </p>
                <div className="space-y-3">
                  {MARKER_ICON_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-[10px] text-muted-foreground/70 mb-1.5">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.icons.map(iconKey => (
                          <button
                            key={iconKey}
                            onClick={() =>
                              setIntelEditIcon(iconKey as MarkerIcon)
                            }
                            title={MARKER_ICON_LABELS[iconKey as MarkerIcon]}
                            className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                              intelEditIcon === iconKey
                                ? "border-primary bg-primary/10 scale-110"
                                : "border-border bg-accent/30 hover:border-primary/50"
                            }`}
                          >
                            <img
                              src={getMarkerDataUrl(
                                iconKey as MarkerIcon,
                                intelEditColour
                              )}
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
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Colour
                </p>
                <div className="flex gap-2">
                  {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(col => (
                    <button
                      key={col}
                      onClick={() => setIntelEditColour(col)}
                      title={MARKER_COLOUR_LABELS[col]}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        intelEditColour === col
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-foreground/40"
                      }`}
                      style={{ background: MARKER_COLOURS[col] }}
                    />
                  ))}
                </div>
              </div>

              {/* Rotation */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Rotation — {intelEditRotation}°
                </p>
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
                    onChange={e => setIntelEditRotation(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <div className="flex gap-1">
                    {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                      <button
                        key={deg}
                        onClick={() => setIntelEditRotation(deg)}
                        title={`${deg}°`}
                        className={`w-6 h-6 text-[9px] rounded border transition-all ${
                          intelEditRotation === deg
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/50 text-muted-foreground"
                        }`}
                      >
                        {deg === 0
                          ? "N"
                          : deg === 45
                            ? "NE"
                            : deg === 90
                              ? "E"
                              : deg === 135
                                ? "SE"
                                : deg === 180
                                  ? "S"
                                  : deg === 225
                                    ? "SW"
                                    : deg === 270
                                      ? "W"
                                      : "NW"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingIntelLabel(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!editingIntelLabel) return;
                    // Persist server-side so it survives a redraw and shows
                    // up for every officer on every device, not just this one.
                    savePinOverrideMut.mutate({
                      label: editingIntelLabel,
                      markerIcon: intelEditIcon,
                      markerColour: intelEditColour,
                      rotation: intelEditRotation,
                    });
                    // Update the actual map marker element immediately —
                    // direct img ref first, querySelector fallback (see
                    // intelPinImgRefs declaration).
                    const directImg =
                      intelPinImgRefs.current.get(editingIntelLabel);
                    const img =
                      directImg ??
                      (() => {
                        const markerEntry = markersRef.current.find(
                          (m: any) => m.title === editingIntelLabel
                        );
                        return markerEntry?.content instanceof HTMLElement
                          ? (markerEntry.content.querySelector(
                              "img"
                            ) as HTMLImageElement | null)
                          : null;
                      })();
                    if (img) {
                      img.src = getMarkerDataUrl(
                        intelEditIcon,
                        intelEditColour
                      );
                      img.style.transform = `rotate(${intelEditRotation}deg)`;
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
            className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto p-3 pt-6 md:p-4 md:pt-10"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => {
              setMapQeOpen(false);
              setMapQeAddress("");
              closeInlineField();
            }}
          >
            <div
              className="no-scrollbar w-full max-w-lg md:max-w-3xl lg:max-w-5xl bg-card border border-border rounded-2xl shadow-2xl p-5 pb-6 md:p-6 lg:p-8 max-h-[90vh] md:max-h-[92vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4 lg:mb-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm md:text-base lg:text-lg font-bold text-foreground">
                    RS Quick Entry
                  </p>
                  <p className="text-[11px] md:text-xs lg:text-sm text-muted-foreground mt-0.5 truncate">
                    {mapQeAddress}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMapQeOpen(false);
                    setMapQeAddress("");
                    closeInlineField();
                  }}
                  className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </div>

              {/* Time picker — slim inline row with Now + Date buttons */}
              <div className="flex items-center gap-1 md:gap-1.5 mb-2 lg:mb-3 flex-wrap">
                <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-[10px] md:text-xs text-muted-foreground font-medium mr-0.5">
                  Time:
                </span>
                {/* Hour */}
                <Select
                  value={mapQeHour}
                  onOpenChange={o => setMapQeSelectOpen(o)}
                  onValueChange={v => {
                    setMapQeHour(v);
                    setMapQeTimeOverride(
                      `${String(parseInt(v)).padStart(2, "0")}:${mapQeMinute} ${mapQePeriod}`
                    );
                  }}
                >
                  <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                      h => (
                        <SelectItem
                          key={h}
                          value={h}
                          className="font-mono text-xs"
                        >
                          {String(parseInt(h)).padStart(2, "0")}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-mono text-[11px] md:text-sm">
                  :
                </span>
                {/* Minute */}
                <Select
                  value={mapQeMinute}
                  onOpenChange={o => setMapQeSelectOpen(o)}
                  onValueChange={v => {
                    setMapQeMinute(v);
                    setMapQeTimeOverride(
                      `${String(parseInt(mapQeHour)).padStart(2, "0")}:${v} ${mapQePeriod}`
                    );
                  }}
                >
                  <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 60 }, (_, i) =>
                      String(i).padStart(2, "0")
                    ).map(m => (
                      <SelectItem
                        key={m}
                        value={m}
                        className="font-mono text-xs"
                      >
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* AM/PM */}
                <Select
                  value={mapQePeriod}
                  onOpenChange={o => setMapQeSelectOpen(o)}
                  onValueChange={v => {
                    setMapQePeriod(v);
                    setMapQeTimeOverride(
                      `${String(parseInt(mapQeHour)).padStart(2, "0")}:${mapQeMinute} ${v}`
                    );
                  }}
                >
                  <SelectTrigger className="w-14 h-6 text-[11px] px-1.5 py-0 md:w-16 md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM" className="text-xs">
                      AM
                    </SelectItem>
                    <SelectItem value="PM" className="text-xs">
                      PM
                    </SelectItem>
                  </SelectContent>
                </Select>
                {/* Now button — inline */}
                <button
                  type="button"
                  onClick={() => {
                    const n = new Date();
                    const h24 = n.getHours();
                    const min = n.getMinutes();
                    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                    const ampm = h24 < 12 ? "AM" : "PM";
                    setMapQeHour(String(h12));
                    setMapQeMinute(String(min).padStart(2, "0"));
                    setMapQePeriod(ampm);
                    setMapQeTimeOverride(
                      `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`
                    );
                  }}
                  className="h-6 px-2 text-[10px] font-medium rounded border border-border bg-muted/30 hover:bg-accent/50 active:scale-95 transition-all whitespace-nowrap md:h-8 md:px-3 md:text-xs"
                >
                  Now
                </button>
                {/* Date button — toggles stepper */}
                <button
                  type="button"
                  onClick={() => setShowMapQeDateStepper(v => !v)}
                  className={`h-6 px-2 text-[10px] font-medium rounded border transition-all whitespace-nowrap active:scale-95 md:h-8 md:px-3 md:text-xs ${
                    showMapQeDateStepper
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/30 hover:bg-accent/50"
                  }`}
                >
                  Date
                </button>
              </div>

              {/* Date stepper — only visible when Date button is toggled on */}
              {showMapQeDateStepper && (
                <div className="flex items-center justify-between mb-2 px-1 py-1 rounded-md border border-border/70 bg-muted/30">
                  <button
                    type="button"
                    className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() =>
                      setMapQeRowDate(_addDaysToYmd(mapQeRowDate, -1))
                    }
                  >
                    ◀
                  </button>
                  <span className="text-[11px] font-semibold tracking-widest text-foreground font-mono">
                    {_formatPerthDateLabel(mapQeRowDate)}
                  </span>
                  <button
                    type="button"
                    className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() =>
                      setMapQeRowDate(_addDaysToYmd(mapQeRowDate, 1))
                    }
                  >
                    ▶
                  </button>
                </div>
              )}

              {/* No sheet selected warning */}
              {rsSelectedSheetId === null ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 md:px-4 md:py-4 text-center">
                  <p className="text-xs md:text-sm font-semibold text-amber-400 mb-1">
                    No running sheet selected
                  </p>
                  <p className="text-[11px] md:text-xs text-muted-foreground">
                    Select an operation and running sheet in the right panel
                    first, then tap &amp; hold the map again.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {/* ARR panel removed per user request */}

                  {/* Inline observation field */}
                  {rsInlineLabel &&
                    (() => {
                      const selectedSheet = (
                        rsSheetsData as any[] | undefined
                      )?.find((s: any) => s.id === rsSelectedSheetId);
                      const rosterCins: string[] = [];
                      if (selectedSheet?.sheetCins) {
                        try {
                          const parsed: Array<{
                            cin: string;
                            isTeamLeader?: boolean;
                          }> =
                            typeof selectedSheet.sheetCins === "string"
                              ? JSON.parse(selectedSheet.sheetCins)
                              : selectedSheet.sheetCins;
                          parsed
                            .sort((a, b) => {
                              if (a.isTeamLeader && !b.isTeamLeader) return -1;
                              if (!a.isTeamLeader && b.isTeamLeader) return 1;
                              const numA = parseInt(a.cin ?? "", 10);
                              const numB = parseInt(b.cin ?? "", 10);
                              if (!isNaN(numA) && !isNaN(numB))
                                return numA - numB;
                              return (a.cin ?? "").localeCompare(b.cin ?? "");
                            })
                            .forEach(c => {
                              if (c.cin) rosterCins.push(c.cin);
                            });
                        } catch {
                          /* ignore */
                        }
                      }
                      const inlineReadOnly =
                        isTouchDevice && !rsInlineTypingMode;
                      return (
                        <div
                          className="rounded-lg border border-border bg-muted/40 p-2.5 md:p-3.5 flex flex-col gap-2 md:gap-2.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-muted-foreground">
                              Observation
                            </span>
                            <div className="flex items-center gap-1.5">
                              {/* Only meaningful on touch devices — desktop's
                                  observation field is always editable (see
                                  useIsTouchDevice above), so this toggle
                                  would have nothing to switch there. */}
                              {isTouchDevice && (
                                <button
                                  type="button"
                                  onClick={toggleInlineTyping}
                                  title={
                                    rsInlineTypingMode
                                      ? "Switch back to chip-click only"
                                      : "Switch to keyboard typing"
                                  }
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-all active:scale-95 hover:bg-accent/50 ${
                                    rsInlineTypingMode
                                      ? "border-primary/50 text-primary bg-primary/10"
                                      : "border-border text-muted-foreground"
                                  }`}
                                >
                                  <Keyboard className="h-3 w-3" />
                                  Keyboard
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={undoInlineText}
                                disabled={rsInlineUndoStack.length === 0}
                                title="Undo"
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-border text-muted-foreground transition-all active:scale-95 hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none"
                              >
                                <Undo2 className="h-3 w-3" />
                                Undo
                              </button>
                            </div>
                          </div>
                          <textarea
                            ref={rsInlineInputRef}
                            value={rsInlineText}
                            readOnly={inlineReadOnly}
                            autoCapitalize="off"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            onClick={() => {
                              if (inlineReadOnly) enableInlineTyping();
                            }}
                            onChange={e => {
                              const next = e.target.value;
                              const now = Date.now();
                              // Group rapid keystrokes into a single undo step; only
                              // snapshot when there's been a pause since the last one.
                              if (now - rsInlineTypingPushRef.current > 600) {
                                pushInlineUndo(rsInlineText);
                              }
                              rsInlineTypingPushRef.current = now;
                              setRsInlineText(next);
                              resetInlineTimer();

                              const cursorPos =
                                e.target.selectionStart ?? next.length;
                              const vehicleTrigger =
                                detectVehicleMentionTrigger(
                                  next,
                                  cursorPos,
                                  rsUsedVehicleRegos
                                );
                              if (vehicleTrigger) {
                                closeRsMentionDropdown();
                                setRsVehicleMentionWord({
                                  word: vehicleTrigger.word,
                                  wordStart: vehicleTrigger.wordStart,
                                  wordEnd: cursorPos,
                                });
                                setRsVehicleMentionActiveIndex(0);
                                setRsVehicleMentionAnchor(
                                  getCaretPixelPosition(e.target, cursorPos)
                                );
                                if (rsVehicleMentionDebounceRef.current)
                                  clearTimeout(
                                    rsVehicleMentionDebounceRef.current
                                  );
                                rsVehicleMentionDebounceRef.current =
                                  setTimeout(() => {
                                    setRsVehicleMentionQuery(
                                      vehicleTrigger.word
                                    );
                                  }, 250);
                              } else {
                                closeRsVehicleMentionDropdown();
                                const trigger = detectMentionTrigger(
                                  next,
                                  cursorPos,
                                  rsUsedBracketCodes
                                );
                                if (!trigger) {
                                  closeRsMentionDropdown();
                                } else {
                                  setRsMentionWord({
                                    word: trigger.word,
                                    wordStart: trigger.wordStart,
                                    wordEnd: cursorPos,
                                  });
                                  setRsMentionActiveIndex(0);
                                  setRsMentionAnchor(
                                    getCaretPixelPosition(e.target, cursorPos)
                                  );
                                  if (rsMentionDebounceRef.current)
                                    clearTimeout(rsMentionDebounceRef.current);
                                  rsMentionDebounceRef.current = setTimeout(
                                    () => {
                                      setRsMentionQuery(trigger.word);
                                    },
                                    250
                                  );
                                }
                              }
                            }}
                            onFocus={resetInlineTimer}
                            onBlur={() => {
                              closeRsMentionDropdown();
                              closeRsVehicleMentionDropdown();
                            }}
                            onKeyDown={e => {
                              if (
                                rsVehicleMentionWord &&
                                rsVehicleMentionSuggestions.length > 0
                              ) {
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setRsVehicleMentionActiveIndex(
                                    i =>
                                      (i + 1) %
                                      rsVehicleMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setRsVehicleMentionActiveIndex(
                                    i =>
                                      (i -
                                        1 +
                                        rsVehicleMentionSuggestions.length) %
                                      rsVehicleMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  selectRsVehicleMentionSuggestion(
                                    rsVehicleMentionSuggestions[
                                      rsVehicleMentionActiveIndex
                                    ],
                                    e.currentTarget
                                  );
                                  return;
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  closeRsVehicleMentionDropdown();
                                  return;
                                }
                              }
                              if (
                                rsMentionWord &&
                                rsMentionSuggestions.length > 0
                              ) {
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setRsMentionActiveIndex(
                                    i => (i + 1) % rsMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setRsMentionActiveIndex(
                                    i =>
                                      (i - 1 + rsMentionSuggestions.length) %
                                      rsMentionSuggestions.length
                                  );
                                  return;
                                }
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  selectRsMentionSuggestion(
                                    rsMentionSuggestions[rsMentionActiveIndex],
                                    e.currentTarget
                                  );
                                  return;
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  closeRsMentionDropdown();
                                  return;
                                }
                              }
                              if (e.key === " " || e.key === "Tab") {
                                const textarea = e.currentTarget;
                                const pos = textarea.selectionStart ?? 0;
                                const textBefore = rsInlineText.slice(0, pos);
                                const match = textBefore.match(/(\S+)$/);
                                let expanded = false;
                                if (match) {
                                  const word = match[1].toLowerCase();
                                  const expansion = mapQeShortcutMap[word];
                                  if (expansion) {
                                    expanded = true;
                                    e.preventDefault();
                                    const before = textBefore.slice(
                                      0,
                                      textBefore.length - match[1].length
                                    );
                                    const after = rsInlineText.slice(pos);
                                    const newText =
                                      before + expansion + " " + after;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length + expansion.length + 1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                                // Deterministic vehicle-bracket completion —
                                // same rule as the registry dropdown above
                                // (detectVehicleMentionTrigger), but fires
                                // unconditionally on Space so a fresh, never-
                                // before-seen rego still gets bracketed, not
                                // just one Intelligence already knows about.
                                if (
                                  !expanded &&
                                  e.key === " " &&
                                  rsUsedVehicleRegos
                                ) {
                                  const vehicleTrigger =
                                    detectVehicleMentionTrigger(
                                      rsInlineText,
                                      pos,
                                      rsUsedVehicleRegos
                                    );
                                  if (vehicleTrigger) {
                                    expanded = true;
                                    e.preventDefault();
                                    const { word, wordStart } = vehicleTrigger;
                                    const before = rsInlineText.slice(
                                      0,
                                      wordStart
                                    );
                                    const after = rsInlineText.slice(pos);
                                    const bracket = `(Vehicle ${word.toUpperCase()})`;
                                    const newText = `${before}${word} ${bracket} ${after}`;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    closeRsVehicleMentionDropdown();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length +
                                        word.length +
                                        1 +
                                        bracket.length +
                                        1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                                // Same idea, for a street address completed
                                // by its suburb + state (see
                                // detectAddressSpaceCompletion) —
                                // "(44 Elvira Street)".
                                if (
                                  !expanded &&
                                  e.key === " " &&
                                  rsUsedAddressLabels
                                ) {
                                  const addressTrigger =
                                    detectAddressSpaceCompletion(
                                      rsInlineText,
                                      pos,
                                      rsUsedAddressLabels
                                    );
                                  if (addressTrigger) {
                                    expanded = true;
                                    e.preventDefault();
                                    const bracket = `(${addressTrigger.addressLabel})`;
                                    const before = rsInlineText.slice(0, pos);
                                    const after = rsInlineText.slice(pos);
                                    const newText = `${before} ${bracket} ${after}`;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length + 1 + bracket.length + 1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                                // Same idea, for a fresh person's name
                                // completed by its ALL-CAPS surname (see
                                // detectPersonNameSpaceCompletion) —
                                // "(SURNAME)".
                                if (
                                  !expanded &&
                                  e.key === " " &&
                                  rsUsedBracketCodes
                                ) {
                                  const personTrigger =
                                    detectPersonNameSpaceCompletion(
                                      rsInlineText,
                                      pos,
                                      rsUsedBracketCodes
                                    );
                                  if (personTrigger) {
                                    e.preventDefault();
                                    const bracket = `(${personTrigger.surname.toUpperCase()})`;
                                    const before = rsInlineText.slice(0, pos);
                                    const after = rsInlineText.slice(pos);
                                    const newText = `${before} ${bracket} ${after}`;
                                    pushInlineUndo(rsInlineText);
                                    setRsInlineText(newText);
                                    resetInlineTimer();
                                    closeRsMentionDropdown();
                                    requestAnimationFrame(() => {
                                      const newPos =
                                        before.length + 1 + bracket.length + 1;
                                      textarea.setSelectionRange(
                                        newPos,
                                        newPos
                                      );
                                    });
                                  }
                                }
                              }
                            }}
                            placeholder={
                              inlineReadOnly
                                ? "Tap shortcuts below, or tap here to type…"
                                : "Add details (optional)…"
                            }
                            rows={4}
                            className={`w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring md:px-3 md:py-2 md:text-sm lg:min-h-[140px] ${inlineReadOnly ? "cursor-pointer" : ""}`}
                          />
                          {rsMentionWord &&
                            rsMentionAnchor &&
                            rsMentionSuggestions.length > 0 && (
                              <div
                                className="fixed z-50 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                                style={{
                                  top: rsMentionAnchor.top,
                                  left: rsMentionAnchor.left,
                                  maxHeight: "220px",
                                  overflowY: "auto",
                                }}
                              >
                                {rsMentionSuggestions.map((s, i) => (
                                  <button
                                    key={s.key}
                                    type="button"
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                                      i === rsMentionActiveIndex
                                        ? "bg-accent text-accent-foreground"
                                        : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                                    }`}
                                    onMouseEnter={() =>
                                      setRsMentionActiveIndex(i)
                                    }
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      if (rsInlineInputRef.current)
                                        selectRsMentionSuggestion(
                                          s,
                                          rsInlineInputRef.current
                                        );
                                    }}
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="truncate">
                                        {s.displayName}
                                      </span>
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {s.rowCount} obs.
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          {rsVehicleMentionWord &&
                            rsVehicleMentionAnchor &&
                            rsVehicleMentionSuggestions.length > 0 && (
                              <div
                                className="fixed z-50 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                                style={{
                                  top: rsVehicleMentionAnchor.top,
                                  left: rsVehicleMentionAnchor.left,
                                  maxHeight: "220px",
                                  overflowY: "auto",
                                }}
                              >
                                {rsVehicleMentionSuggestions.map((s, i) => (
                                  <button
                                    key={s.key}
                                    type="button"
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                                      i === rsVehicleMentionActiveIndex
                                        ? "bg-accent text-accent-foreground"
                                        : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                                    }`}
                                    onMouseEnter={() =>
                                      setRsVehicleMentionActiveIndex(i)
                                    }
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      if (rsInlineInputRef.current)
                                        selectRsVehicleMentionSuggestion(
                                          s,
                                          rsInlineInputRef.current
                                        );
                                    }}
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="truncate">
                                        {formatIntelVehicle(s.label)}
                                      </span>
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {s.rowCount} obs.
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          {/* Shortcut buttons */}
                          {(() => {
                            // ── QE chips: exact mirror of main RS chip set, values, and order ──────────
                            // Single source of truth: assignedTarget (target.getById) for all target fields.
                            // Chip set matches SheetDetail exactly: TGT, HBF, HB, V1F, V1, extra vehicles, wildcards, DEP, ARR, folder shortcuts.
                            // Order: qeChipOrder (read from RS localStorage key) with wildcards always last.
                            const appendText = (text: string) => {
                              pushInlineUndo(rsInlineText);
                              setRsInlineText(prev =>
                                prev ? `${prev} ${text}` : text
                              );
                              resetInlineTimer();
                              rsInlineInputRef.current?.focus();
                            };
                            const t = assignedTarget as any;
                            if (!t) return null;

                            // Extra vehicle chips from JSON (V2F/V2, V3F/V3, …)
                            const extraVehicleChips: Array<{
                              label: string;
                              display: string;
                              getValue: () => string | null;
                            }> = [];
                            try {
                              const evs: Array<{
                                full: string;
                                short: string;
                              }> = JSON.parse(t.extraVehicles ?? "[]");
                              evs.forEach(
                                (
                                  ev: { full: string; short: string },
                                  i: number
                                ) => {
                                  const num = i + 2;
                                  if (ev.full)
                                    extraVehicleChips.push({
                                      label: `V${num}F`,
                                      display: `V${num}F`,
                                      getValue: () => ev.full,
                                    });
                                  if (ev.short) {
                                    extraVehicleChips.push({
                                      label: `V${num}`,
                                      display: ev.short
                                        ? `V${num} ${ev.short}`
                                        : `V${num}`,
                                      getValue: () => ev.short,
                                    });
                                  }
                                }
                              );
                            } catch {}

                            // Wild field chips (#1, #2, …)
                            const wildChips: Array<{
                              label: string;
                              display: string;
                              getValue: () => string | null;
                            }> = [];
                            try {
                              const wfs: Array<{
                                label: string;
                                value: string;
                              }> = JSON.parse(t.wildFields ?? "[]");
                              wfs.forEach(
                                (wf: { label: string; value: string }) => {
                                  if (wf.value)
                                    wildChips.push({
                                      label: wf.label,
                                      display: wf.label,
                                      getValue: () => wf.value,
                                    });
                                }
                              );
                            } catch {}

                            // Folder shortcut chips (showInRs=true, exclude legacy 'D')
                            const folderShortcutChips: Array<{
                              label: string;
                              display: string;
                              getValue: () => string | null;
                            }> = ((generalShortcuts as any[]) ?? [])
                              .filter(
                                (s: any) =>
                                  (s.trigger as string).toUpperCase() !== "D" &&
                                  !!s.showInRs
                              )
                              .map((s: any) => ({
                                label: (s.trigger as string).toUpperCase(),
                                display: (s.trigger as string).toUpperCase(),
                                getValue: () => s.expansion as string,
                              }));

                            // Full chip list — identical order to SheetDetail fields array
                            const allChips: Array<{
                              label: string;
                              display: string;
                              getValue: () => string | null;
                            }> = [
                              {
                                label: "TGT",
                                display: "TGT",
                                getValue: () => t.tgt ?? null,
                              },
                              {
                                label: "HBF",
                                display: "HBF",
                                getValue: () => t.hbf ?? null,
                              },
                              {
                                label: "HB",
                                display: "HB",
                                getValue: () => t.hb ?? null,
                              },
                              {
                                label: "V1F",
                                display: "V1F",
                                getValue: () => t.v1f ?? null,
                              },
                              {
                                label: "V1",
                                display: t.v1 ? `V1 ${t.v1}` : "V1",
                                getValue: () => t.v1 ?? null,
                              },
                              ...extraVehicleChips,
                              ...wildChips,
                              {
                                label: "DEP",
                                display: "DEP",
                                getValue: () => t.dep ?? null,
                              },
                              {
                                label: "ARR",
                                display: "ARR",
                                getValue: () => t.arr ?? null,
                              },
                              ...folderShortcutChips,
                            ];

                            const available = allChips.filter(
                              s => s.getValue() !== null
                            );
                            if (available.length === 0) return null;

                            // Apply saved RS order — wildcards always last (mirrors SheetDetail)
                            const isWildcard = (lbl: string) =>
                              /^#\d+$/.test(lbl);
                            const nonWildAvail = available.filter(
                              s => !isWildcard(s.label)
                            );
                            const wildAvail = available.filter(s =>
                              isWildcard(s.label)
                            );
                            const orderedNonWild =
                              qeChipOrder.length > 0
                                ? [
                                    ...(qeChipOrder
                                      .filter(lbl => !isWildcard(lbl))
                                      .map(lbl =>
                                        nonWildAvail.find(s => s.label === lbl)
                                      )
                                      .filter(Boolean) as typeof available),
                                    ...nonWildAvail.filter(
                                      s => !qeChipOrder.includes(s.label)
                                    ),
                                  ]
                                : nonWildAvail;
                            const orderedWild =
                              qeChipOrder.length > 0
                                ? [
                                    ...(qeChipOrder
                                      .filter(isWildcard)
                                      .map(lbl =>
                                        wildAvail.find(s => s.label === lbl)
                                      )
                                      .filter(Boolean) as typeof available),
                                    ...wildAvail.filter(
                                      s => !qeChipOrder.includes(s.label)
                                    ),
                                  ]
                                : wildAvail;
                            const orderedChips = [
                              ...orderedNonWild,
                              ...orderedWild,
                            ];

                            // Display rules — same as SheetDetail:
                            // Vn short (V1/V2/…): show label + rego; everything else: trigger label only
                            const shortcutFolderLabels = new Set(
                              ((generalShortcuts as any[]) ?? []).map(
                                (s: any) => (s.trigger as string).toUpperCase()
                              )
                            );
                            const TRIGGER_ONLY = new Set([
                              "TGT",
                              "HBF",
                              "HB",
                              "V1F",
                              "DEP",
                              "ARR",
                            ]);
                            const isVnShort = (lbl: string) =>
                              /^V\d+$/.test(lbl);
                            const isVnFull = (lbl: string) =>
                              /^V\d+F$/.test(lbl);
                            const isStandard = (lbl: string) =>
                              !isVnShort(lbl) &&
                              (shortcutFolderLabels.has(lbl) ||
                                TRIGGER_ONLY.has(lbl) ||
                                isVnFull(lbl));

                            return (
                              <div className="flex flex-wrap gap-1 md:gap-1.5">
                                {orderedChips.map(s => (
                                  <button
                                    key={s.label}
                                    onClick={() => {
                                      const v = s.getValue();
                                      if (v) appendText(v);
                                    }}
                                    data-qe-chip={s.label}
                                    className="cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                  >
                                    {isVnShort(s.label)
                                      ? s.display
                                      : isStandard(s.label)
                                        ? s.label
                                        : s.display}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          {/* Address chips — full RS address and short street address */}
                          {mapQeAddress &&
                            (() => {
                              const appendText = (text: string) => {
                                pushInlineUndo(rsInlineText);
                                setRsInlineText(prev =>
                                  prev ? `${prev} ${text}` : text
                                );
                                resetInlineTimer();
                                rsInlineInputRef.current?.focus();
                              };
                              // Extract short address from bracket code: e.g. "21 Olding Way, MELVILLE WA (21 OLDING WAY)" → "21 Olding Way"
                              const bracketMatch = mapQeAddress.match(
                                /^(.*?)(?:,\s*[A-Z][\w\s]+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))\s*\(([^)]+)\)/
                              );
                              // Short address: title-case the bracket code content (e.g. "21 OLDING WAY" → "21 Olding Way")
                              const toTitleCase = (s: string) =>
                                s
                                  .toLowerCase()
                                  .replace(/\b\w/g, c => c.toUpperCase());
                              const shortAddr = bracketMatch
                                ? toTitleCase(bracketMatch[2])
                                : (mapQeAddress.split(",")[0]?.trim() ??
                                  mapQeAddress);
                              return (
                                <div className="flex flex-col gap-1 md:gap-1.5">
                                  <button
                                    onClick={() => appendText(mapQeAddress)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/30 bg-teal-500/5 text-teal-400 hover:bg-teal-500/15 active:scale-[0.98] transition-all md:px-3.5 md:py-2.5"
                                  >
                                    <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">
                                      Full Address
                                    </span>
                                    <span className="text-[10px] md:text-sm font-mono leading-tight break-all">
                                      {mapQeAddress}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => appendText(shortAddr)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-md border border-teal-500/20 bg-teal-500/5 text-teal-300 hover:bg-teal-500/10 active:scale-[0.98] transition-all md:px-3.5 md:py-2.5"
                                  >
                                    <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-teal-500/70 block mb-0.5">
                                      Short Address
                                    </span>
                                    <span className="text-[10px] md:text-sm font-mono leading-tight">
                                      {shortAddr}
                                    </span>
                                  </button>
                                </div>
                              );
                            })()}
                          {/* Entity chips — quick-insert shortcuts mined from this sheet's own
                          observations (surname / short address / vehicle rego), shared
                          across every officer on the sheet via the server. */}
                          {rsEntityChips &&
                            rsEntityChips.length > 0 &&
                            (() => {
                              const appendText = (text: string) => {
                                pushInlineUndo(rsInlineText);
                                setRsInlineText(prev =>
                                  prev ? `${prev} ${text}` : text
                                );
                                resetInlineTimer();
                                rsInlineInputRef.current?.focus();
                              };
                              return (
                                <div className="flex flex-wrap gap-1 md:gap-1.5">
                                  {rsEntityChips.map(chip => (
                                    <button
                                      key={chip.key}
                                      onClick={() =>
                                        appendText(chip.insertValue)
                                      }
                                      className="px-2 py-0.5 rounded text-[10px] font-bold border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                    >
                                      <span className="font-mono normal-case">
                                        {chip.insertValue}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}
                          {/* Vehicle arriving chips — reuses the occupant
                            description from the vehicle's last logged
                            departure anywhere in this operation, so the
                            officer doesn't have to retype it when the same
                            vehicle arrives at this quick-entry location. One
                            chip per still-pending (un-arrived) vehicle —
                            always requires an explicit tap, never inserted
                            automatically, since this writes into the record. */}
                          {mapQeAddress &&
                            rsPendingDepartures &&
                            rsPendingDepartures.length > 0 &&
                            (() => {
                              const appendText = (text: string) => {
                                pushInlineUndo(rsInlineText);
                                setRsInlineText(prev =>
                                  prev ? `${prev} ${text}` : text
                                );
                                resetInlineTimer();
                                rsInlineInputRef.current?.focus();
                              };
                              const bracketMatch = mapQeAddress.match(
                                /^(.*?)(?:,\s*[A-Z][\w\s]+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))\s*\(([^)]+)\)/
                              );
                              const toTitleCase = (s: string) =>
                                s
                                  .toLowerCase()
                                  .replace(/\b\w/g, c => c.toUpperCase());
                              const shortAddr = bracketMatch
                                ? toTitleCase(bracketMatch[2])
                                : (mapQeAddress.split(",")[0]?.trim() ??
                                  mapQeAddress);
                              // App-wide rule: first mention of an address in
                              // this sheet is written in full (with its
                              // bracket short-form, which is what Intelligence
                              // relies on to register the location) — every
                              // later mention just uses the short form.
                              const arriveAddr =
                                rsAddressMentionedData?.mentioned
                                  ? shortAddr
                                  : mapQeAddress;
                              return (
                                <div className="flex flex-col gap-1 md:gap-1.5">
                                  <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-amber-500/70">
                                    Vehicle arriving
                                  </span>
                                  <div className="flex flex-wrap gap-1 md:gap-1.5">
                                    {rsPendingDepartures.map(d => (
                                      <button
                                        key={d.rego}
                                        onClick={() =>
                                          appendText(
                                            `Vehicle ${d.rego}, ${d.occupantDesc}, arrived at ${arriveAddr}`
                                          )
                                        }
                                        title={`Vehicle ${d.rego}, ${d.occupantDesc}, arrived at ${arriveAddr}`}
                                        className="px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                      >
                                        <span className="font-mono normal-case">
                                          {d.rego}
                                        </span>{" "}
                                        arriving
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          {/* Vehicle departing chips — mirror of the arriving
                            chips above: reuses the occupant description from
                            the vehicle's most recent logged arrival, for when
                            that vehicle is now departing THAT SAME location.
                            Only shows for a vehicle whose last-known arrival
                            address matches where this quick-entry popup is
                            — a vehicle can't be logged departing from
                            somewhere it isn't. Always uses the short address
                            form (not the first-mention full form the arriving
                            chip sometimes needs), since a departure isn't
                            establishing a new address mention the way an
                            arrival can be. Requires an explicit tap, same as
                            the arriving chips. */}
                          {mapQeAddress &&
                            rsPendingArrivals &&
                            rsPendingArrivals.length > 0 &&
                            (() => {
                              const appendText = (text: string) => {
                                pushInlineUndo(rsInlineText);
                                setRsInlineText(prev =>
                                  prev ? `${prev} ${text}` : text
                                );
                                resetInlineTimer();
                                rsInlineInputRef.current?.focus();
                              };
                              const bracketMatch = mapQeAddress.match(
                                /^(.*?)(?:,\s*[A-Z][\w\s]+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT))\s*\(([^)]+)\)/
                              );
                              const toTitleCase = (s: string) =>
                                s
                                  .toLowerCase()
                                  .replace(/\b\w/g, c => c.toUpperCase());
                              const shortAddr = bracketMatch
                                ? toTitleCase(bracketMatch[2])
                                : (mapQeAddress.split(",")[0]?.trim() ??
                                  mapQeAddress);
                              const arrivalsHere = rsPendingArrivals.filter(
                                a =>
                                  a.address.trim().toLowerCase() ===
                                  shortAddr.trim().toLowerCase()
                              );
                              if (arrivalsHere.length === 0) return null;
                              return (
                                <div className="flex flex-col gap-1 md:gap-1.5">
                                  <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-amber-500/70">
                                    Vehicle departing
                                  </span>
                                  <div className="flex flex-wrap gap-1 md:gap-1.5">
                                    {arrivalsHere.map(a => (
                                      <button
                                        key={a.rego}
                                        onClick={() =>
                                          appendText(
                                            `Vehicle ${a.rego}, ${a.occupantDesc}, departed ${shortAddr} and continued via:`
                                          )
                                        }
                                        title={`Vehicle ${a.rego}, ${a.occupantDesc}, departed ${shortAddr} and continued via:`}
                                        className="px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 active:scale-95 transition-all select-none md:px-3 md:py-1.5 md:text-xs md:rounded-md"
                                      >
                                        <span className="font-mono normal-case">
                                          {a.rego}
                                        </span>{" "}
                                        departing
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          {/* CIN picker — multi-select with TEAM */}
                          {rosterCins.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 md:gap-2">
                              <button
                                onClick={() => {
                                  const allSel = rosterCins.every(c =>
                                    rsInlineCins.has(c)
                                  );
                                  const next = allSel
                                    ? new Set<string>()
                                    : new Set(rosterCins);
                                  setRsInlineCins(next);
                                  rsInlineCinsRef.current = next;
                                  resetInlineTimer();
                                }}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 md:px-3.5 md:py-1.5 md:text-sm ${rosterCins.every(c => rsInlineCins.has(c)) ? "bg-amber-500/20 border-amber-500/60 text-amber-400" : "bg-muted/40 border-amber-500/30 text-amber-500/80 hover:bg-amber-500/10"}`}
                              >
                                TEAM
                              </button>
                              {rosterCins.map(cin => (
                                <button
                                  key={cin}
                                  onClick={() => {
                                    const next = new Set(rsInlineCins);
                                    if (next.has(cin)) {
                                      next.delete(cin);
                                    } else {
                                      next.add(cin);
                                    }
                                    setRsInlineCins(next);
                                    rsInlineCinsRef.current = next;
                                    resetInlineTimer();
                                  }}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 md:px-3.5 md:py-1.5 md:text-sm ${rsInlineCins.has(cin) ? "bg-primary/20 border-primary/60 text-primary" : "bg-muted/40 border-border text-foreground/80 hover:bg-muted/70 hover:text-foreground"}`}
                                >
                                  {cin}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={submitInlineField}
                              disabled={rsAddingRow}
                              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:gap-1.5"
                            >
                              {rsAddingRow ? (
                                <Spinner className="h-3 w-3 md:h-4 md:w-4" />
                              ) : (
                                <Send className="h-3 w-3 md:h-4 md:w-4" />
                              )}
                              Submit
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Quick action buttons removed per user request */}

                  {/* Last entry confirmation */}
                  {rsLastEntry && (
                    <div className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 md:px-3.5 md:py-3">
                      <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-green-400 mb-0.5">
                        Last Entry
                      </p>
                      <p className="text-[11px] md:text-sm font-mono text-foreground">
                        {rsLastEntry.time} — {rsLastEntry.label}
                      </p>
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
            style={{
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => {
              setPendingLatLng(null);
              setEditingMarkerId(null);
            }}
          >
            <div
              className="w-full max-w-lg bg-card border border-border rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {editingMarkerId ? "Edit Map Marker" : "Place Map Marker"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {pendingLatLng.lat.toFixed(5)},{" "}
                    {pendingLatLng.lng.toFixed(5)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPendingLatLng(null);
                    setEditingMarkerId(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 0. Location / Business Name — shown at top for quick identification */}
              <div className="mb-3">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                  Location / Business Name
                </label>
                <input
                  type="text"
                  value={cmLabel}
                  onChange={e => setCmLabel(e.target.value)}
                  placeholder="e.g. Target address, coffee shop..."
                  className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* 0b. Address */}
              <div className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                  Address
                </p>
                <input
                  type="text"
                  value={cmAddress}
                  onChange={e => setCmAddress(e.target.value)}
                  placeholder="Auto-filled from coordinates…"
                  className="w-full text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* 0c. Notes — directly below address */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                  Notes
                </label>
                <Textarea
                  value={cmNote}
                  onChange={e => setCmNote(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              {/* 0d. Label only — the marker renders as just its label pill
                  (same look as a shape's note label), no icon underneath.
                  Useful for a plain text callout rather than a
                  house/vehicle/POI icon. */}
              <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div>
                  <p className="text-[11px] font-semibold text-foreground">
                    Label Only
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Show just the label as a pill — no marker icon
                  </p>
                </div>
                <Switch
                  checked={cmLabelOnly}
                  onCheckedChange={setCmLabelOnly}
                />
              </div>
              {cmLabelOnly && !cmLabel.trim() && (
                <p className="text-[10px] text-amber-500 -mt-3 mb-4">
                  Enter a label above — a Label Only marker with no text has
                  nothing to show on the map.
                </p>
              )}

              {/* 1. Icon picker — not shown for a Label Only marker, which
                  has no icon to pick. */}
              {!cmLabelOnly && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Marker Icon
                  </p>
                  <div className="space-y-3">
                    {MARKER_ICON_GROUPS.map(group => (
                      <div key={group.label}>
                        <p className="text-[10px] text-muted-foreground/70 mb-1.5">
                          {group.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.icons.map(iconKey => (
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
                                src={getMarkerDataUrl(
                                  iconKey as MarkerIcon,
                                  cmColour
                                )}
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
              )}

              {/* 2. Colour picker — doubles as the label pill's background
                  colour when Label Only is on. */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {cmLabelOnly ? "Label Colour" : "Colour"}
                </p>
                <div className="flex gap-2">
                  {(Object.keys(MARKER_COLOURS) as MarkerColour[]).map(col => (
                    <button
                      key={col}
                      onClick={() => setCmColour(col)}
                      title={MARKER_COLOUR_LABELS[col]}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        cmColour === col
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-foreground/40"
                      }`}
                      style={{ background: MARKER_COLOURS[col] }}
                    />
                  ))}
                </div>
                {cmLabelOnly && (
                  <div className="mt-3">
                    <span
                      className="inline-flex items-center max-w-[200px] truncate rounded-full border-[1.5px] px-2.5 py-1 text-[11px] font-bold text-white shadow"
                      style={{
                        background: MARKER_COLOURS[cmColour],
                        borderColor: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {cmLabel.trim() || "(no label)"}
                    </span>
                  </div>
                )}
              </div>

              {/* 3. Rotation — not applicable to a Label Only marker. */}
              {!cmLabelOnly && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Rotation — {cmRotation}°
                  </p>
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
                      onChange={e => setCmRotation(Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    {/* Quick preset buttons */}
                    <div className="flex gap-1">
                      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                        <button
                          key={deg}
                          onClick={() => setCmRotation(deg)}
                          title={`${deg}°`}
                          className={`w-6 h-6 text-[9px] rounded border transition-all ${
                            cmRotation === deg
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:border-primary/50 text-muted-foreground"
                          }`}
                        >
                          {deg === 0
                            ? "N"
                            : deg === 45
                              ? "NE"
                              : deg === 90
                                ? "E"
                                : deg === 135
                                  ? "SE"
                                  : deg === 180
                                    ? "S"
                                    : deg === 225
                                      ? "SW"
                                      : deg === 270
                                        ? "W"
                                        : "NW"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Operation — a marker saved with no operation is hidden
                  from any single/multi-operation-filtered map view (only
                  the "all operations" view shows it), so this needs to be
                  visible and correctable rather than a silent default. The
                  create flows below pre-fill this from the operation(s)
                  currently selected on the map, but that pre-fill can only
                  guess when exactly one operation is in view — with zero or
                  several selected it falls back to "no operation", which is
                  how a newly placed marker was disappearing from view. */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                  Operation
                </label>
                <Select
                  value={cmOpId === null ? "none" : String(cmOpId)}
                  onValueChange={v =>
                    setCmOpId(v === "none" ? null : Number(v))
                  }
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="No operation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No operation</SelectItem>
                    {(operations as any[] | undefined)?.map(op => (
                      <SelectItem key={op.id} value={String(op.id)}>
                        {op.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cmOpId === null && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    No operation selected — this marker will only appear in the
                    all-operations map view.
                  </p>
                )}
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setPendingLatLng(null);
                    setEditingMarkerId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={cmSaving || (cmLabelOnly && !cmLabel.trim())}
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
                          labelOnly: cmLabelOnly,
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
                          labelOnly: cmLabelOnly,
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
                      setCmLabelOnly(false);
                    } catch {
                      toast.error(
                        editingMarkerId !== null
                          ? "Failed to update marker"
                          : "Failed to save marker"
                      );
                    } finally {
                      setCmSaving(false);
                    }
                  }}
                >
                  {cmSaving ? (
                    <Spinner className="h-4 w-4" />
                  ) : editingMarkerId !== null ? (
                    "Save Changes"
                  ) : (
                    "Place Marker"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {(() => {
        const currentQeDupe = qeDupeQueue[qeDupeIndex];
        if (!currentQeDupe) return null;
        if (currentQeDupe.kind === "missingLocation") {
          return (
            <MissingLocationAlert
              key={qeDupeIndex}
              warning={
                qeDupeDialogOpen
                  ? {
                      location: currentQeDupe.location,
                      source: currentQeDupe.source,
                    }
                  : null
              }
              onConfirm={() =>
                handleQeMissingLocationResolved(true, currentQeDupe.location)
              }
              onDecline={() =>
                handleQeMissingLocationResolved(false, currentQeDupe.location)
              }
            />
          );
        }
        return (
          <VagueVehicleMatchAlert
            key={qeDupeIndex}
            warning={
              qeDupeDialogOpen
                ? {
                    loserLabel: currentQeDupe.loserLabel,
                    winnerLabel: currentQeDupe.winnerLabel,
                    reason: currentQeDupe.reason,
                  }
                : null
            }
            busy={qeVagueVehicleBusy}
            onConfirm={() => handleQeVagueVehicleResolved(true, currentQeDupe)}
            onDecline={() => handleQeVagueVehicleResolved(false, currentQeDupe)}
          />
        );
      })()}
    </DashboardLayout>
  );
}
