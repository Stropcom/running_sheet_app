import {
  FolderOpen,
  FileText,
  ClipboardCheck,
  CalendarDays,
  FolderSearch,
  BookOpen,
  ScrollText,
  HelpCircle,
  Map as MapIcon,
  ClipboardList,
  Zap,
  Scale,
  ArrowRightLeft,
  Trash2,
  WifiOff,
  User,
  Network,
  Image as ImageIcon,
} from "lucide-react";

// ── Quick-link config ──────────────────────────────────────────────────────────
export interface QuickLink {
  label: string;
  path: string;
  icon: string; // icon name key
}

// Icon component + colour for each quick-link option
export const ICON_MAP: Record<
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

export const ALL_QUICK_LINK_OPTIONS: QuickLink[] = [
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

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: "Intel Profiles", path: "/intelligence", icon: "FolderSearch" },
  { label: "Governance", path: "/governance", icon: "ClipboardCheck" },
  { label: "Calendar", path: "/calendar", icon: "CalendarDays" },
];

// Key → nav item mapping (mirrors DashboardLayout SortableNavItem)
export const NAV_KEY_MAP: Record<
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
    iconColor: "text-cyan-400",
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

export const LS_QUICK_LINKS_KEY = "runlog_map_quick_links";

export const LS_MAP_SETTINGS_KEY = "runlog_map_settings";
