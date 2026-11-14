// Part of the Intelligence page (client/src/pages/Intelligence.tsx): the tab bar's options and colours.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  User,
  Car,
  MapPin,
  Folder,
  Flame,
  Activity,
  MapPinned,
  Route,
  Radar,
  Eye,
  PackageOpen,
} from "lucide-react";
import type { TabView } from "./types";

// ─── Tab nav config ───────────────────────────────────────────────────────────
// Split into two groups, rendered as two rows on desktop: entity tabs (filter
// the list below) and report tabs (replace the whole content area with their
// own full-page view). Kept as one combined TAB_OPTIONS for the mobile
// dropdown and the tabCounts lookup, since mobile collapses both groups into
// a single flat list.

export const ENTITY_TAB_OPTIONS: Array<{
  value: TabView;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    value: "operations",
    label: "Operations",
    icon: <Folder className="w-3.5 h-3.5" />,
  },
  {
    value: "targets",
    label: "Targets",
    icon: <User className="w-3.5 h-3.5" />,
  },
  {
    value: "associates",
    label: "Associates",
    icon: <User className="w-3.5 h-3.5" />,
  },
  {
    value: "vehicle",
    label: "Vehicles",
    icon: <Car className="w-3.5 h-3.5" />,
  },
  {
    value: "locations",
    label: "Locations",
    icon: <MapPin className="w-3.5 h-3.5" />,
  },
];

export const REPORT_TAB_OPTIONS: Array<{
  value: TabView;
  label: string;
  icon: React.ReactNode;
}> = [
  // Visual RS goes first: it is the report officers reach for to read a sheet.
  {
    value: "visualRs",
    label: "Visual RS",
    icon: <Eye className="w-3.5 h-3.5" />,
  },
  {
    value: "egonet",
    label: "Ego Network",
    icon: <Radar className="w-3.5 h-3.5" />,
  },
  {
    value: "heatmap",
    label: "Heat Map",
    icon: <Flame className="w-3.5 h-3.5" />,
  },
  {
    value: "places",
    label: "Places",
    icon: <MapPinned className="w-3.5 h-3.5" />,
  },
  {
    value: "dayRoute",
    label: "Day Route",
    icon: <Route className="w-3.5 h-3.5" />,
  },
  {
    value: "patternOfLife",
    label: "Pattern of Life",
    icon: <Activity className="w-3.5 h-3.5" />,
  },
  {
    value: "packages",
    label: "Packages",
    icon: <PackageOpen className="w-3.5 h-3.5" />,
  },
];

export const TAB_OPTIONS: Array<{
  value: TabView;
  label: string;
  icon: React.ReactNode;
}> = [...ENTITY_TAB_OPTIONS, ...REPORT_TAB_OPTIONS];

// Desktop/tablet entity tab bar colour-codes each tab to match its own
// colour everywhere else in RunLog (Target Registry's own field sections,
// the Imported Documents card) — Targets = sky, Associates = violet,
// Vehicles = amber, Locations = emerald. Operations isn't one of those
// four profile-entity colours (it's the containing folder, not a profile
// type), so it gets a neutral slate treatment instead. Written as full
// literal class strings, never interpolated from a colour name, since
// Tailwind's build-time scanner can't see a class assembled from a
// runtime variable. Mobile's <Select> dropdown (below) doesn't use this —
// it stays plain text, matching its own existing look.
export const ENTITY_TAB_COLORS: Record<
  "operations" | "targets" | "associates" | "vehicle" | "locations",
  {
    icon: string;
    activeBg: string;
    activeText: string;
    bar: string;
    idleBorder: string;
    idleBg: string;
    activeBorder: string;
  }
> = {
  operations: {
    icon: "text-slate-500 dark:text-slate-400",
    activeBg: "bg-slate-500/15 shadow-sm",
    activeText: "text-slate-900 dark:text-slate-100",
    bar: "bg-slate-500",
    idleBorder: "border-slate-500/45",
    idleBg: "bg-card",
    activeBorder: "border-slate-500",
  },
  targets: {
    icon: "text-rose-600",
    activeBg: "bg-rose-500/15 shadow-sm",
    activeText: "text-rose-700 dark:text-rose-400",
    bar: "bg-rose-500",
    idleBorder: "border-rose-500/45",
    idleBg: "bg-card",
    activeBorder: "border-rose-500",
  },
  associates: {
    icon: "text-violet-600",
    activeBg: "bg-violet-500/15 shadow-sm",
    activeText: "text-violet-700 dark:text-violet-400",
    bar: "bg-violet-500",
    idleBorder: "border-violet-500/45",
    idleBg: "bg-card",
    activeBorder: "border-violet-500",
  },
  vehicle: {
    icon: "text-amber-600",
    activeBg: "bg-amber-500/15 shadow-sm",
    activeText: "text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
    idleBorder: "border-amber-500/45",
    idleBg: "bg-card",
    activeBorder: "border-amber-500",
  },
  locations: {
    icon: "text-emerald-600",
    activeBg: "bg-emerald-500/15 shadow-sm",
    activeText: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
    idleBorder: "border-emerald-500/45",
    idleBg: "bg-card",
    activeBorder: "border-emerald-500",
  },
};
