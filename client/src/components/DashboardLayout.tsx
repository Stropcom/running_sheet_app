import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { APP_VERSION } from "@shared/const";
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ViewToggle } from "./ViewToggle";
import type { ViewMode } from "@/contexts/ViewModeContext";
import {
  SIDEBAR_COOKIE_NAME,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { useTheme } from "@/contexts/ThemeContext";
import {
  FileText,
  ScrollText,
  Users,
  PanelLeft,
  PanelRight,
  LogOut,
  ShieldCheck,
  Crown,
  Eye,
  UserCircle,
  User,
  Sun,
  Moon,
  ClipboardList,
  Zap,
  FolderSearch,
  ClipboardCheck,
  BookOpen,
  Scale,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Shield,
  ClipboardCheck as GovIcon,
  Map,
  ArrowRightLeft,
  HelpCircle,
  Trash2,
  WifiOff,
  Settings,
  SlidersHorizontal,
  UserCog,
  BarChart3,
  GripVertical,
  Image,
  Link2,
  FileEdit,
  Binoculars,
  RefreshCw,
  TrendingUp,
  CalendarClock,
} from "lucide-react";
import React, {
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useObservationFocus } from "@/contexts/ObservationFocusContext";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { NotificationBell } from "./NotificationBell";
import { Button } from "./ui/button";
import { PullToRefresh, useRefreshAction } from "./PullToRefresh";
import { useOffline } from "@/contexts/OfflineContext";
import { useSectionColor } from "@/contexts/SectionColorContext";

// Every page mounts its own <DashboardLayout>, so navigating between pages
// unmounts and remounts this whole component — including the sidebar's
// scrollable nav list, which would otherwise reset to the top on every click.
// This module-level value survives that remount so the sidebar stays scrolled
// to wherever the user left it (e.g. deep in an expanded Op Manager folder).
let lastSidebarScrollTop = 0;

// SidebarProvider persists its open/collapsed state to a cookie on every
// toggle, but only reads it back if we pass it in as `defaultOpen` — and
// since a fresh <SidebarProvider> is mounted on every navigation (see
// above), leaving that unset means the sidebar snaps back open on every
// click. Reading the cookie synchronously here keeps a manually-closed
// sidebar closed until the toggle is clicked again.
function getInitialSidebarOpen(): boolean {
  if (typeof document === "undefined") return true;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${SIDEBAR_COOKIE_NAME}=([^;]*)`)
  );
  return match ? match[1] === "true" : true;
}

// ─── SortableNavItem ─────────────────────────────────────────────────────────
type SortableNavItemProps = {
  id: string;
  isCollapsed: boolean;
  location: string;
  setLocation: (path: string) => void;
  todoCount: number;
  certifyCount: number;
  unlinkedImagesCount: number;
  govCount: number;
  todoExpanded: boolean;
  setTodoExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  opManagerExpanded: boolean;
  setOpManagerExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  ctoRosterSubExpanded: boolean;
  setCtoRosterSubExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  shortcutsItemRef: React.RefObject<HTMLLIElement | null>;
  isObservationFocused: boolean;
  setShortcutsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  subItemClass: (active: boolean) => string;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
};

// Expanding Op Manager / CTO Roster reveals sub-items below the clicked
// button without generating a scroll event, so on a short sidebar viewport
// the new items can land almost entirely below the fold. Scrolling to bring
// the whole newly-revealed block into view doesn't help when that block is
// taller than the viewport — it just aligns to its top and still hides most
// of it. Instead, scroll the clicked button itself up near the top of the
// container, which maximizes the space left below it for the reveal.
function scrollToggleNearTop(
  container: HTMLElement | null,
  btn: HTMLElement | null,
  behavior: ScrollBehavior = "smooth"
) {
  if (!container || !btn) return;
  const containerRect = container.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const offsetWithinContainer =
    btnRect.top - containerRect.top + container.scrollTop;
  container.scrollTo({
    top: Math.max(0, offsetWithinContainer - 12),
    behavior,
  });
}

function SortableNavItem({
  id,
  isCollapsed,
  location,
  setLocation,
  todoCount,
  certifyCount,
  unlinkedImagesCount,
  govCount,
  todoExpanded,
  setTodoExpanded,
  opManagerExpanded,
  setOpManagerExpanded,
  ctoRosterSubExpanded,
  setCtoRosterSubExpanded,
  shortcutsItemRef,
  isObservationFocused,
  setShortcutsPanelOpen,
  subItemClass,
  sidebarScrollRef,
}: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const gripHandle = !isCollapsed ? (
    <span
      {...listeners}
      className="flex items-center px-1 cursor-grab active:cursor-grabbing text-sidebar-foreground/20 hover:text-sidebar-foreground/50 transition-colors shrink-0 touch-none"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  ) : null;

  const itemProps = { ref: setNodeRef, style, ...attributes };

  if (id === "operations")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={
            location === "/" ||
            location.startsWith("/operation/") ||
            location.startsWith("/sheet/")
          }
          onClick={() => setLocation("/")}
          tooltip="Operations"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-blue-700/50 shadow-sm"
        >
          <FileText className="h-4 w-4 text-blue-700" />
          <span className="flex-1 flex flex-col gap-0">
            <span
              className={
                location === "/" ||
                location.startsWith("/operation/") ||
                location.startsWith("/sheet/")
                  ? "text-sidebar-foreground font-medium text-sm leading-tight"
                  : "text-sidebar-foreground/80 text-sm leading-tight"
              }
            >
              Operations
            </span>
            <span className="text-[10px] text-sidebar-foreground/40 font-normal leading-tight">
              Running Sheets
            </span>
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "governance")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={
            location === "/governance" || location.startsWith("/governance")
          }
          onClick={() => setLocation("/governance")}
          tooltip="Governance"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-purple-400/50 shadow-sm"
        >
          <ClipboardCheck className="h-4 w-4 text-purple-400" />
          <span
            className={`flex-1 ${location === "/governance" || location.startsWith("/governance") ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Governance
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "todo")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={
            location === "/todo" ||
            location === "/todo/images" ||
            location === "/todo/governance"
          }
          onClick={() => setTodoExpanded(v => !v)}
          tooltip="To-Do"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-red-400/50 shadow-sm"
        >
          <ClipboardList
            className={`h-4 w-4 ${todoCount > 0 ? "text-red-500" : "text-red-400"}`}
          />
          <span
            className={`flex-1 ${todoCount > 0 ? "text-red-500 font-medium" : location === "/todo" || location === "/todo/images" || location === "/todo/governance" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            To-Do
          </span>
          {todoCount > 0 && !isCollapsed && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-red-500/20 border border-red-500/40 text-red-500">
              {todoCount}
            </span>
          )}
          {!isCollapsed &&
            (todoExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ))}
          {gripHandle}
        </SidebarMenuButton>
        {todoExpanded && !isCollapsed && (
          <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
            <button
              onClick={() => setLocation("/todo")}
              className={subItemClass(location === "/todo")}
            >
              <Shield
                className={`h-3.5 w-3.5 shrink-0 ${certifyCount > 0 ? "text-red-400" : "text-emerald-400"}`}
              />
              <span className="flex-1">Certify</span>
              {certifyCount > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-bold bg-red-500/20 border border-red-500/40 text-red-400">
                  {certifyCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setLocation("/todo/images")}
              className={subItemClass(location === "/todo/images")}
            >
              <Link2
                className={`h-3.5 w-3.5 shrink-0 ${unlinkedImagesCount > 0 ? "text-amber-400" : "text-emerald-400"}`}
              />
              <span className="flex-1">Link Images</span>
              {unlinkedImagesCount > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400">
                  {unlinkedImagesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setLocation("/todo/governance")}
              className={subItemClass(location === "/todo/governance")}
            >
              <GovIcon
                className={`h-3.5 w-3.5 shrink-0 ${govCount > 0 ? "text-blue-400" : "text-emerald-400"}`}
              />
              <span className="flex-1">RS Governance</span>
              {govCount > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400">
                  {govCount}
                </span>
              )}
            </button>
          </div>
        )}
      </SidebarMenuItem>
    );

  if (id === "mapping")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={location === "/intelligence/mapping"}
          onClick={() => setLocation("/intelligence/mapping")}
          tooltip="Mapping"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-teal-400/50 shadow-sm"
        >
          <Map className="h-4 w-4 text-teal-400" />
          <span
            className={`flex-1 ${location === "/intelligence/mapping" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Mapping
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "images")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={location === "/images" || location.startsWith("/images")}
          onClick={() => setLocation("/images")}
          tooltip="Images"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-pink-400/50 shadow-sm"
        >
          <Image className="h-4 w-4 text-pink-400" />
          <span
            className={`flex-1 ${location === "/images" || location.startsWith("/images") ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Images
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "calendar")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={
            location === "/calendar" || location.startsWith("/calendar")
          }
          onClick={() => setLocation("/calendar")}
          tooltip="Calendar"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-orange-400/50 shadow-sm"
        >
          <CalendarDays className="h-4 w-4 text-orange-400" />
          <span
            className={`flex-1 ${location === "/calendar" || location.startsWith("/calendar") ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Calendar
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "shortcuts")
    return (
      <SidebarMenuItem
        {...itemProps}
        ref={el => {
          (itemProps as any).ref(el);
          (
            shortcutsItemRef as React.MutableRefObject<HTMLLIElement | null>
          ).current = el;
        }}
      >
        <SidebarMenuButton
          isActive={
            location === "/shortcuts" || location.startsWith("/shortcuts")
          }
          onClick={() => setLocation("/shortcuts")}
          tooltip="Shortcuts"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-yellow-400/50 shadow-sm"
          onMouseEnter={() => {
            if (isObservationFocused) setShortcutsPanelOpen(true);
          }}
        >
          <Zap className="h-4 w-4 text-yellow-400" />
          <span
            className={`flex-1 ${location === "/shortcuts" || location.startsWith("/shortcuts") ? "text-sidebar-foreground font-medium" : isObservationFocused ? "text-cyan-300 font-medium" : "text-sidebar-foreground/80"}`}
          >
            Shortcuts
          </span>
          {isObservationFocused && !isCollapsed && (
            <span className="ml-1 text-[9px] font-bold text-cyan-500 uppercase tracking-wide">
              hover
            </span>
          )}
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "intelligence")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={
            location === "/intelligence" ||
            (location.startsWith("/intelligence") &&
              !location.startsWith("/intelligence/mapping"))
          }
          onClick={() => setLocation("/intelligence")}
          tooltip="Intelligence"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-violet-400/50 shadow-sm"
        >
          <FolderSearch className="h-4 w-4 text-violet-400" />
          <span
            className={`flex-1 ${location === "/intelligence" || (location.startsWith("/intelligence") && !location.startsWith("/intelligence/mapping")) ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Intelligence
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "targetRegistry")
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={
            location === "/target-registry" ||
            location.startsWith("/target-registry")
          }
          onClick={() => setLocation("/target-registry")}
          tooltip="Target Registry"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-rose-400/50 shadow-sm"
        >
          <BookOpen className="h-4 w-4 text-rose-400" />
          <span
            className={`flex-1 ${location === "/target-registry" || location.startsWith("/target-registry") ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Target Registry
          </span>
          {gripHandle}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  if (id === "operationManager") {
    const opManagerActive =
      location.startsWith("/operation-manager") ||
      location.startsWith("/cto-roster");
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          data-nav-toggle="op-manager"
          isActive={opManagerActive}
          onClick={e => {
            const willExpand = !opManagerExpanded;
            setOpManagerExpanded(v => !v);
            if (willExpand)
              scrollToggleNearTop(sidebarScrollRef.current, e.currentTarget);
          }}
          tooltip="Op Manager"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-purple-500/50 shadow-sm"
        >
          <ClipboardList className="h-4 w-4 text-purple-500" />
          <span
            className={`flex-1 ${opManagerActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Op Manager
          </span>
          {!isCollapsed &&
            (opManagerExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ))}
          {gripHandle}
        </SidebarMenuButton>
        {opManagerExpanded && !isCollapsed && (
          <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
            <button
              onClick={() => setLocation("/operation-manager")}
              className={subItemClass(
                location.startsWith("/operation-manager")
              )}
            >
              <ClipboardList className="h-3.5 w-3.5 shrink-0 text-purple-500" />
              CTO Weekly Tasking
            </button>
            <button
              data-nav-toggle="cto-roster"
              onClick={e => {
                const willExpand = !ctoRosterSubExpanded;
                setCtoRosterSubExpanded(v => !v);
                if (willExpand)
                  scrollToggleNearTop(
                    sidebarScrollRef.current,
                    e.currentTarget
                  );
              }}
              className={subItemClass(location.startsWith("/cto-roster"))}
            >
              <Users className="h-3.5 w-3.5 shrink-0 text-purple-500" />
              <span className="flex-1">CTO Roster</span>
              {ctoRosterSubExpanded ? (
                <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
              ) : (
                <ChevronRight className="h-3 w-3 text-sidebar-foreground/40" />
              )}
            </button>
            {ctoRosterSubExpanded && (
              <div className="ml-4 border-l border-sidebar-border/40 pl-3 flex flex-col gap-0.5 mb-0.5">
                <button
                  onClick={() => setLocation("/cto-roster")}
                  className={subItemClass(location === "/cto-roster")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Roster
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/my-shifts")}
                  className={subItemClass(location === "/cto-roster/my-shifts")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  My Shifts
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/outlook")}
                  className={subItemClass(location === "/cto-roster/outlook")}
                >
                  <Binoculars className="h-3.5 w-3.5 shrink-0" />
                  Outlook
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/drafts")}
                  className={subItemClass(
                    location.startsWith("/cto-roster/draft")
                  )}
                >
                  <FileEdit className="h-3.5 w-3.5 shrink-0" />
                  Drafts
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/saved-rosters")}
                  className={subItemClass(
                    location.startsWith("/cto-roster/saved-roster")
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0" />
                  Saved Rosters
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/ea-compliance")}
                  className={subItemClass(
                    location === "/cto-roster/ea-compliance"
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  EA Compliance
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/audit")}
                  className={subItemClass(location === "/cto-roster/audit")}
                >
                  <ScrollText className="h-3.5 w-3.5 shrink-0" />
                  Audit Log
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/members")}
                  className={subItemClass(location === "/cto-roster/members")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Members
                </button>
              </div>
            )}
          </div>
        )}
      </SidebarMenuItem>
    );
  }

  return null;
}

// ── Tile-view nav item shell ────────────────────────────────────────────────
// Shared square-tile chrome (swatch + label + hover grip handle + active
// border) used by every SortableNavTile below, so each item only needs to
// supply its icon/colour/label/active state — same pattern as the list rows'
// per-item if-chain, just rendered as a tile instead of a row.
function NavTileShell({
  icon,
  label,
  isActive,
  hasSub,
  badgeCount,
  activeBorderClass,
  onClick,
  gripListeners,
  style,
  setNodeRef,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  hasSub?: boolean;
  badgeCount?: number;
  activeBorderClass: string;
  onClick?: () => void;
  gripListeners?: Record<string, unknown>;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLElement | null) => void;
}) {
  return (
    <button
      ref={setNodeRef as React.Ref<HTMLButtonElement>}
      style={style}
      onClick={onClick}
      data-active={isActive}
      className={`group/tile relative flex flex-col items-center justify-center gap-1.5 h-[84px] rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border transition-all shadow-sm px-1 ${activeBorderClass}`}
    >
      {gripListeners && (
        <span
          {...gripListeners}
          onClick={e => e.stopPropagation()}
          className="absolute top-1.5 left-1.5 flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing text-sidebar-foreground/0 group-hover/tile:text-sidebar-foreground/40 hover:!text-sidebar-foreground/70 transition-colors touch-none"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      {hasSub && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-sidebar-foreground/30" />
      )}
      {typeof badgeCount === "number" && badgeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold bg-red-500/90 text-white shadow">
          {badgeCount}
        </span>
      )}
      {icon}
      <span className="text-[11px] font-medium text-sidebar-foreground leading-tight text-center line-clamp-1">
        {label}
      </span>
    </button>
  );
}

function SortableNavTile({
  id,
  location,
  setLocation,
  todoCount,
  certifyCount,
  unlinkedImagesCount,
  govCount,
}: {
  id: string;
  location: string;
  setLocation: (path: string) => void;
  todoCount: number;
  certifyCount: number;
  unlinkedImagesCount: number;
  govCount: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const gripListeners = { ...attributes, ...listeners };

  if (id === "operations") {
    const isActive =
      location === "/" ||
      location.startsWith("/operation/") ||
      location.startsWith("/sheet/");
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<FileText className="h-5 w-5 text-blue-700" />}
        label="Operations"
        isActive={isActive}
        activeBorderClass="data-[active=true]:border-blue-700/60"
        onClick={() => setLocation("/")}
      />
    );
  }

  if (id === "governance") {
    const isActive = location === "/governance" || location.startsWith("/governance");
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<ClipboardCheck className="h-5 w-5 text-purple-400" />}
        label="Governance"
        isActive={isActive}
        activeBorderClass="data-[active=true]:border-purple-400/60"
        onClick={() => setLocation("/governance")}
      />
    );
  }

  if (id === "todo") {
    const isActive =
      location === "/todo" || location === "/todo/images" || location === "/todo/governance";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div>
            <NavTileShell
              setNodeRef={setNodeRef}
              style={style}
              gripListeners={gripListeners}
              icon={
                <ClipboardList
                  className={`h-5 w-5 ${todoCount > 0 ? "text-red-500" : "text-red-400"}`}
                />
              }
              label="To-Do"
              isActive={isActive}
              hasSub
              badgeCount={todoCount}
              activeBorderClass="data-[active=true]:border-red-400/60"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setLocation("/todo")}>
            <Shield className={`h-4 w-4 mr-2 ${certifyCount > 0 ? "text-red-400" : "text-emerald-400"}`} />
            Certify
            {certifyCount > 0 && (
              <Badge variant="outline" className="ml-auto text-[10px] border-red-500/40 bg-red-500/10 text-red-400">
                {certifyCount}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/todo/images")}>
            <Link2 className={`h-4 w-4 mr-2 ${unlinkedImagesCount > 0 ? "text-amber-400" : "text-emerald-400"}`} />
            Link Images
            {unlinkedImagesCount > 0 && (
              <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-400">
                {unlinkedImagesCount}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/todo/governance")}>
            <GovIcon className={`h-4 w-4 mr-2 ${govCount > 0 ? "text-blue-400" : "text-emerald-400"}`} />
            RS Governance
            {govCount > 0 && (
              <Badge variant="outline" className="ml-auto text-[10px] border-blue-500/40 bg-blue-500/10 text-blue-400">
                {govCount}
              </Badge>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (id === "mapping") {
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<Map className="h-5 w-5 text-teal-400" />}
        label="Mapping"
        isActive={location === "/intelligence/mapping"}
        activeBorderClass="data-[active=true]:border-teal-400/60"
        onClick={() => setLocation("/intelligence/mapping")}
      />
    );
  }

  if (id === "images") {
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<Image className="h-5 w-5 text-pink-400" />}
        label="Images"
        isActive={location === "/images" || location.startsWith("/images")}
        activeBorderClass="data-[active=true]:border-pink-400/60"
        onClick={() => setLocation("/images")}
      />
    );
  }

  if (id === "calendar") {
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<CalendarDays className="h-5 w-5 text-orange-400" />}
        label="Calendar"
        isActive={location === "/calendar" || location.startsWith("/calendar")}
        activeBorderClass="data-[active=true]:border-orange-400/60"
        onClick={() => setLocation("/calendar")}
      />
    );
  }

  if (id === "shortcuts") {
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<Zap className="h-5 w-5 text-yellow-400" />}
        label="Shortcuts"
        isActive={location === "/shortcuts" || location.startsWith("/shortcuts")}
        activeBorderClass="data-[active=true]:border-yellow-400/60"
        onClick={() => setLocation("/shortcuts")}
      />
    );
  }

  if (id === "intelligence") {
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<FolderSearch className="h-5 w-5 text-violet-400" />}
        label="Intelligence"
        isActive={
          location === "/intelligence" ||
          (location.startsWith("/intelligence") && !location.startsWith("/intelligence/mapping"))
        }
        activeBorderClass="data-[active=true]:border-violet-400/60"
        onClick={() => setLocation("/intelligence")}
      />
    );
  }

  if (id === "targetRegistry") {
    return (
      <NavTileShell
        setNodeRef={setNodeRef}
        style={style}
        gripListeners={gripListeners}
        icon={<BookOpen className="h-5 w-5 text-rose-400" />}
        label="Target Registry"
        isActive={location === "/target-registry" || location.startsWith("/target-registry")}
        activeBorderClass="data-[active=true]:border-rose-400/60"
        onClick={() => setLocation("/target-registry")}
      />
    );
  }

  if (id === "operationManager") {
    const isActive =
      location.startsWith("/operation-manager") || location.startsWith("/cto-roster");
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div>
            <NavTileShell
              setNodeRef={setNodeRef}
              style={style}
              gripListeners={gripListeners}
              icon={<ClipboardList className="h-5 w-5 text-purple-500" />}
              label="Op Manager"
              isActive={isActive}
              hasSub
              activeBorderClass="data-[active=true]:border-purple-500/60"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setLocation("/operation-manager")}>
            <ClipboardList className="h-4 w-4 mr-2 text-purple-500" />
            CTO Weekly Tasking
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Users className="h-4 w-4 mr-2 text-purple-500" />
              CTO Roster
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster")}>
                <Users className="h-4 w-4 mr-2" />
                Roster
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster/my-shifts")}>
                <Users className="h-4 w-4 mr-2" />
                My Shifts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster/outlook")}>
                <Binoculars className="h-4 w-4 mr-2" />
                Outlook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster/drafts")}>
                <FileEdit className="h-4 w-4 mr-2" />
                Drafts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster/saved-rosters")}>
                <BookOpen className="h-4 w-4 mr-2" />
                Saved Rosters
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster/ea-compliance")}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                EA Compliance
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/cto-roster/audit")}>
                <ScrollText className="h-4 w-4 mr-2" />
                Audit Log
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return null;
}

// Administration and User Management aren't part of the draggable navOrder
// list (same as in list view — they're fixed at the end), so these render as
// plain tiles with no grip handle rather than going through SortableNavTile.
function AdminNavTile({
  location,
  setLocation,
}: {
  location: string;
  setLocation: (path: string) => void;
}) {
  const isActive =
    location.startsWith("/court") ||
    location === "/audit" ||
    location === "/draft" ||
    location === "/operation-management" ||
    location === "/recycle-bin" ||
    location === "/help" ||
    location.startsWith("/reports");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div>
          <NavTileShell
            icon={<Settings className="h-5 w-5 text-slate-400" />}
            label="Administration"
            isActive={isActive}
            hasSub
            activeBorderClass="data-[active=true]:border-slate-400/60"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <BarChart3 className="h-4 w-4 mr-2 text-slate-400" />
            Reports
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setLocation("/reports/outstanding-actions")}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Outstanding Actions
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/reports/weekly-activity")}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Weekly Activity
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/reports/weekly-tasking")}>
              <CalendarClock className="h-4 w-4 mr-2" />
              Weekly Tasking
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Scale className="h-4 w-4 mr-2" />
            Court
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setLocation("/court/statements")}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Statements
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/court/witness-list")}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Witness List
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/court/wipc")}>
              <ShieldCheck className="h-4 w-4 mr-2 text-amber-400" />
              WIPC
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/audit")}>
          <ScrollText className="h-4 w-4 mr-2" />
          Audit Log
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/draft")}>
          <WifiOff className="h-4 w-4 mr-2" />
          Draft Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/operation-management")}>
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/recycle-bin")}>
          <Trash2 className="h-4 w-4 mr-2" />
          Recycle Bin
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/help")}>
          <HelpCircle className="h-4 w-4 mr-2" />
          Help
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMgmtNavTile({
  setLocation,
  isAdmin,
}: {
  setLocation: (path: string) => void;
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div>
          <NavTileShell
            icon={<UserCog className="h-5 w-5 text-blue-400" />}
            label="User Management"
            isActive={false}
            hasSub
            activeBorderClass="data-[active=true]:border-blue-400/60"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={() => setLocation("/profile")}>
          <User className="h-4 w-4 mr-2" />
          My Profile
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => setLocation("/admin")}>
            <Users className="h-4 w-4 mr-2" />
            Access Management
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Thin coloured accent bar at the top of the main content area
function SectionAccentBar() {
  const color = useSectionColor();
  return (
    <div
      className="h-[3px] w-full transition-colors duration-300"
      style={{ backgroundColor: color.hex }}
    />
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const SIDEBAR_VIEW_MODE_KEY = "sidebar-view-mode";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

const ROLE_CONFIG = {
  admin: {
    label: "Admin",
    icon: Crown,
    color: "text-blue-400",
    badge: "border-blue-400/30 bg-blue-400/10 text-blue-400",
  },
  member: {
    label: "Member",
    icon: ShieldCheck,
    color: "text-emerald-400",
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
  },
  observer: {
    label: "Observer",
    icon: Eye,
    color: "text-muted-foreground",
    badge: "border-border bg-muted/50 text-muted-foreground",
  },
};

export default function DashboardLayout({
  children,
  rightPaneToggle,
  fillViewport = false,
}: {
  children: React.ReactNode;
  rightPaneToggle?: { isOpen: boolean; onToggle: () => void };
  /**
   * Lock the whole layout to exactly the viewport height and stop the document
   * scrolling at all. For pages that are a single fixed-size surface the user
   * pans/zooms inside (the map pages) rather than a document they scroll
   * through: the shell's default `min-h-svh` is only a *minimum*, so the flex
   * column's height ends up content-driven and `<main>` grows past the
   * viewport — which scrolled the map's own fixed top/bottom overlays (search
   * bar, Map/Satellite toggle, bottom pill bar) out of view. Opt-in, so every
   * ordinary scrolling page keeps its existing behaviour.
   */
  fillViewport?: boolean;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  /**
   * Hard lock against document scrolling for `fillViewport` pages.
   *
   * CSS viewport units alone are not enough here: on iOS Safari `100svh`/`100vh`
   * are measured against the browser's chrome state and don't necessarily match
   * the area actually on screen, so the shell ends up a little taller than the
   * visible viewport and the page scrolls by roughly the header's height —
   * which is exactly the symptom this is fixing. `window.innerHeight` *is* the
   * real visible height on every browser, so we publish it as `--app-vh` and
   * size the shell off that instead of trusting a unit, re-measuring whenever
   * the viewport changes (rotation, browser chrome collapsing, keyboard).
   *
   * The `app-no-scroll` class then pins html/body/#root to that height with
   * overflow hidden and `overscroll-behavior: none`, so there is nothing to
   * scroll and no iOS rubber-band bounce. Both are torn down on unmount so
   * ordinary scrolling pages are completely unaffected.
   *
   * useLayoutEffect (not useEffect) so the height is set before first paint —
   * otherwise the map flashes at the wrong size on entry.
   */
  useLayoutEffect(() => {
    if (!fillViewport) return;
    const root = document.documentElement;
    const setVh = () => {
      const vv = window.visualViewport;
      // visualViewport excludes browser chrome; innerHeight is the fallback.
      const h = Math.round(vv?.height ?? window.innerHeight);
      if (h > 0) root.style.setProperty("--app-vh", `${h}px`);
    };
    setVh();
    root.classList.add("app-no-scroll");
    document.body.classList.add("app-no-scroll");

    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    window.visualViewport?.addEventListener("resize", setVh);
    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
      window.visualViewport?.removeEventListener("resize", setVh);
      root.classList.remove("app-no-scroll");
      document.body.classList.remove("app-no-scroll");
      root.style.removeProperty("--app-vh");
    };
  }, [fillViewport]);

  // A forced password change locks the user out of every other page until
  // they set a real password — enforced server-side too, this is just the
  // matching client-side redirect.
  useEffect(() => {
    if (user?.mustChangePassword) {
      setLocation("/change-password");
    }
  }, [user, setLocation]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (user?.mustChangePassword) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Access requires authentication.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            size="lg"
            className="w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={getInitialSidebarOpen()}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          // --app-vh is the real visible height measured in JS (see the
          // useLayoutEffect above); the svh fallback only covers the instant
          // before that first measurement lands.
          ...(fillViewport ? { height: "var(--app-vh, 100svh)" } : {}),
        } as CSSProperties
      }
      // flex-col: the shell's default is a row (folder menu beside the page).
      // The app banner has to span the full width above both, so the wrapper
      // stacks banner-then-row instead, and the row itself is a nested flex.
      className={`flex-col ${fillViewport ? "min-h-0 overflow-hidden" : ""}`}
    >
      <DashboardLayoutContent
        setSidebarWidth={setSidebarWidth}
        rightPaneToggle={rightPaneToggle}
        fillViewport={fillViewport}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  rightPaneToggle,
  fillViewport = false,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
  rightPaneToggle?: { isOpen: boolean; onToggle: () => void };
  fillViewport?: boolean;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const {
    state,
    isMobile: sidebarIsMobile,
    toggleSidebar,
    setOpen,
  } = useSidebar();
  // The collapsed icon-rail is a desktop-only mode: on mobile <Sidebar>
  // renders as a full-width sheet and never as the rail. But `state` is
  // derived purely from the desktop open/closed cookie, which mobile's
  // toggle never writes — so a browser that once collapsed the sidebar at
  // desktop width (a tablet in landscape, say) carries state="collapsed"
  // into every later phone-width visit. Without the isMobile guard that hid
  // the chevron and the sub-items on every expandable folder
  // (Administration, User Management, To-Do, Op Manager), leaving folders
  // that looked tappable but never opened. ui/sidebar.tsx guards its
  // collapsed-only tooltips the same way.
  const isCollapsed = state === "collapsed" && !sidebarIsMobile;
  const { refresh, refreshing } = useRefreshAction();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [sidebarViewMode, setSidebarViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(SIDEBAR_VIEW_MODE_KEY);
    return saved === "tile" ? "tile" : "folder";
  });
  useEffect(() => {
    localStorage.setItem(SIDEBAR_VIEW_MODE_KEY, sidebarViewMode);
  }, [sidebarViewMode]);

  // Remembers whether the folder menu was open right before the page's
  // right-hand pane (e.g. the map's Map Settings) auto-closed it, so closing
  // that pane again can put the folder menu back exactly how it was — rather
  // than always leaving it closed. null = not currently tracking (right pane
  // is closed, or already restored). Reacting to rightPaneToggle.isOpen
  // itself, rather than only handling this inside the Map Settings button's
  // own onClick, is what makes this work no matter how the pane closes — the
  // map also closes it from a click on the map area and from its own X
  // button, neither of which goes through this component at all.
  const sidebarStateBeforeRightPaneRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!rightPaneToggle) return;
    if (rightPaneToggle.isOpen) {
      sidebarStateBeforeRightPaneRef.current = state === "expanded";
      if (state === "expanded") setOpen(false);
    } else if (sidebarStateBeforeRightPaneRef.current !== null) {
      // Only ever re-open here, never force-close: if the folder menu was
      // already closed before the pane opened, leave it exactly as it
      // currently is rather than fighting anything else that may have
      // changed it in the meantime (e.g. the Folders button's own manual
      // open+close-the-other-pane action, below).
      if (sidebarStateBeforeRightPaneRef.current) setOpen(true);
      sidebarStateBeforeRightPaneRef.current = null;
    }
    // Only react to the pane opening/closing, not to the folder menu's own
    // state changes -- those are handled by the Folders button directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPaneToggle?.isOpen]);

  // Restore the sidebar's scroll position immediately on mount (before paint)
  // so re-opening a nav item deep in the list doesn't visibly jump to the top.
  // For pages under Op Manager / CTO Roster specifically, don't just trust
  // the carried-over scrollTop from the previous page (a `let` surviving the
  // full remount every navigation causes) — re-pin the deepest expanded
  // toggle near the top of the list every time, deterministically, so all of
  // its children get the maximum space and stay visible on every page under
  // it until it's collapsed, not just on the page where it was expanded.
  useLayoutEffect(() => {
    const container = sidebarScrollRef.current;
    if (!container) return;
    const toggleSelector = location.startsWith("/cto-roster")
      ? '[data-nav-toggle="cto-roster"]'
      : location.startsWith("/operation-manager")
        ? '[data-nav-toggle="op-manager"]'
        : null;
    const toggleBtn = toggleSelector
      ? container.querySelector<HTMLElement>(toggleSelector)
      : null;
    if (toggleBtn) {
      scrollToggleNearTop(container, toggleBtn, "instant");
    } else {
      container.scrollTop = lastSidebarScrollTop;
    }
  }, []);

  const isMobile = useIsMobile();

  const { data: outstanding } = trpc.sheet.outstandingForMe.useQuery(
    undefined,
    {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    }
  );
  const { data: governanceTodo } = trpc.sheet.governanceTodo.useQuery(
    undefined,
    {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    }
  );
  const { data: unlinkedImagesTodo } = trpc.sheet.unlinkedImagesTodo.useQuery(
    undefined,
    {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    }
  );
  const certifyCount = outstanding?.length ?? 0;
  const govCount =
    governanceTodo?.filter(g => g.outstanding.length > 0).length ?? 0;
  const unlinkedImagesCount = unlinkedImagesTodo?.length ?? 0;
  const todoCount = certifyCount + govCount + unlinkedImagesCount;

  const { draftCounts } = useOffline();
  const { isObservationFocused } = useObservationFocus();
  const [shortcutsPanelOpen, setShortcutsPanelOpen] = useState(false);
  const [shortcutsPanelHovered, setShortcutsPanelHovered] = useState(false);
  const shortcutsItemRef = useRef<HTMLLIElement>(null);

  const { data: shortcutsList } = trpc.shortcuts.list.useQuery(undefined, {
    staleTime: 60_000,
    enabled: isObservationFocused,
  });

  // Close panel when observation focus is lost and mouse is not in panel
  useEffect(() => {
    if (!isObservationFocused && !shortcutsPanelHovered) {
      setShortcutsPanelOpen(false);
    }
  }, [isObservationFocused, shortcutsPanelHovered]);

  const [courtExpanded, setCourtExpanded] = useState(() =>
    location.startsWith("/court")
  );
  const [reportsExpanded, setReportsExpanded] = useState(() =>
    location.startsWith("/reports")
  );
  const [todoExpanded, setTodoExpanded] = useState(
    () =>
      location === "/todo" ||
      location === "/todo/images" ||
      location === "/todo/governance"
  );
  const [opManagerExpanded, setOpManagerExpanded] = useState(
    () =>
      location.startsWith("/operation-manager") ||
      location.startsWith("/cto-roster")
  );
  const [ctoRosterSubExpanded, setCtoRosterSubExpanded] = useState(() =>
    location.startsWith("/cto-roster")
  );
  const [adminFolderExpanded, setAdminFolderExpanded] = useState(false);
  const [userMgmtFolderExpanded, setUserMgmtFolderExpanded] = useState(false);

  // ── Active RS from map localStorage ─────────────────────────────────────
  const LS_MAP_SETTINGS_KEY = "runlog_map_settings";
  const readActiveRsId = useCallback((): number | null => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      if (s) return JSON.parse(s).rsSelectedSheetId ?? null;
    } catch {
      /* ignore */
    }
    return null;
  }, []);
  const [activeRsId, setActiveRsId] = useState<number | null>(readActiveRsId);

  // Sync when the map page writes to localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_MAP_SETTINGS_KEY) setActiveRsId(readActiveRsId());
    };
    window.addEventListener("storage", onStorage);
    // Also poll on focus in case same-tab writes don't fire storage events
    const onFocus = () => setActiveRsId(readActiveRsId());
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [readActiveRsId]);

  // Re-read when navigating back to any page (location change)
  useEffect(() => {
    setActiveRsId(readActiveRsId());
  }, [location, readActiveRsId]);

  const dashboardUtils = trpc.useUtils();

  // ── Sidebar drag-to-reorder ──────────────────────────────────────────────
  const DEFAULT_NAV_ORDER = [
    "operations",
    "governance",
    "todo",
    "mapping",
    "images",
    "calendar",
    "shortcuts",
    "intelligence",
    "targetRegistry",
    "operationManager",
  ];
  const [navOrder, setNavOrder] = useState<string[]>(DEFAULT_NAV_ORDER);
  const { data: sidebarOrderData } = trpc.sidebar.getOrder.useQuery(undefined, {
    staleTime: Infinity,
  });
  const setSidebarOrderMutation = trpc.sidebar.setOrder.useMutation({
    onSuccess: () => dashboardUtils.sidebar.getOrder.invalidate(),
  });

  useEffect(() => {
    if (sidebarOrderData?.order && sidebarOrderData.order.length > 0) {
      // Merge: keep saved order but append any new keys not yet in the saved list
      const saved = sidebarOrderData.order;
      const allKeys = DEFAULT_NAV_ORDER;
      const merged = [...saved.filter(k => allKeys.includes(k))];
      for (const k of allKeys) {
        if (!merged.includes(k)) merged.push(k);
      }
      setNavOrder(merged);
    }
  }, [sidebarOrderData]);

  const sensors = useSensors(
    // Mouse drags activate on movement past a small threshold — a delay-based
    // constraint here (meant for disambiguating touch-scroll from touch-drag)
    // made normal fast mouse drags get cancelled before they ever started,
    // since moving past the tolerance within the delay window aborts activation.
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 8 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = navOrder.indexOf(active.id as string);
    const newIndex = navOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(navOrder, oldIndex, newIndex);
    setNavOrder(newOrder);
    setSidebarOrderMutation.mutate({ orderedKeys: newOrder });
  }

  // Expand admin folder if current route is inside it
  useEffect(() => {
    const adminPaths = [
      "/court",
      "/audit",
      "/draft",
      "/operation-management",
      "/recycle-bin",
      "/help",
      "/reports",
    ];
    if (adminPaths.some(p => location === p || location.startsWith(p))) {
      setAdminFolderExpanded(true);
    }
    if (location === "/profile" || location === "/admin") {
      setUserMgmtFolderExpanded(true);
    }
  }, []);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH)
        setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const subItemClass = (active: boolean) =>
    `flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
      active
        ? "bg-sidebar-accent text-sidebar-foreground font-medium"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
    }`;

  return (
    <>
      {/* ── App top banner (laptop/tablet only) ───────────────────────────────
          One bar across the full width of the screen, above both the folder
          menu and the page, so the wordmark and the always-available controls
          stay put on every page and don't move when the folder menu collapses.
          Phones keep their own compact header inside SidebarInset instead —
          there's no room for this there. */}
      {!isMobile && (
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-3 print:hidden">
          {/* Left: folder menu, refresh, notifications */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Opening the folders menu closes whatever right-hand pane the
                // page has (the map's Map Settings), so only one pane ever eats
                // into the page width. Closing it just closes it.
                if (state === "collapsed" && rightPaneToggle?.isOpen) {
                  rightPaneToggle.onToggle();
                }
                toggleSidebar();
              }}
              className={`flex items-center justify-center gap-2 min-w-[130px] px-3 py-2 rounded-xl border text-sm font-semibold shadow-sm transition-all ${
                state === "expanded"
                  ? "text-primary border-primary/50 bg-primary/10 hover:bg-primary/20"
                  : "text-muted-foreground border-sidebar-border/60 hover:text-foreground hover:bg-accent"
              }`}
              aria-label="Toggle folders"
              title="Folders"
            >
              <PanelLeft className="h-6 w-6" />
              <span>Folders</span>
            </button>
            <button
              onClick={() => void refresh()}
              disabled={refreshing}
              className="h-10 w-10 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 disabled:opacity-50"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw
                className={`h-5 w-5 text-sidebar-foreground/70 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            <NotificationBell
              className="hover:bg-sidebar-accent h-10 w-10"
              iconClassName="h-5 w-5 text-sidebar-foreground/70"
            />
            <ViewToggle
              value={sidebarViewMode}
              onChange={setSidebarViewMode}
              folderLabel="Folder view"
              tileLabel="Tile view"
            />
          </div>

          {/* Centre: wordmark, absolutely positioned so it sits at true screen
              centre rather than being pushed around by whatever is on either
              side of it. pointer-events-none so it can never swallow a click
              aimed at a control underneath. */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-sidebar-primary shrink-0" />
            <span className="font-semibold text-sidebar-foreground tracking-tight text-xl">
              RunLog
            </span>
          </div>

          {/* Right: page-level quick links (Active RS / Map, or the map's own
              Map Settings pane toggle) */}
          <div className="flex items-center gap-2">
            {location !== "/intelligence/mapping" && (
              <>
                <button
                  onClick={() => {
                    if (activeRsId) setLocation(`/sheet/${activeRsId}`);
                  }}
                  className={`flex items-center justify-center gap-2 min-w-[130px] px-3 py-2 rounded-xl border text-sm font-semibold shadow-sm transition-all ${
                    activeRsId
                      ? "text-blue-700 border-blue-700/50 bg-blue-700/10 hover:bg-blue-700/20 cursor-pointer"
                      : "text-muted-foreground/25 border-sidebar-border/40 bg-transparent cursor-default"
                  }`}
                  title={activeRsId ? "Go to Active RS" : "No active RS selected"}
                >
                  <ClipboardList className="h-6 w-6" />
                  <span>Active RS</span>
                </button>
                <button
                  onClick={() => setLocation("/intelligence/mapping")}
                  className="flex items-center justify-center gap-2 min-w-[130px] px-3 py-2 rounded-xl border border-teal-400/50 bg-teal-400/10 text-teal-400 hover:bg-teal-400/20 text-sm font-semibold shadow-sm transition-all"
                  title="Map"
                >
                  <Map className="h-6 w-6" />
                  <span>Map</span>
                </button>
              </>
            )}
            {rightPaneToggle && (
              <button
                onClick={rightPaneToggle.onToggle}
                className={`flex items-center justify-center gap-2 min-w-[150px] px-3 py-2 rounded-xl border text-sm font-semibold shadow-sm transition-all ${
                  rightPaneToggle.isOpen
                    ? "text-primary border-primary/50 bg-primary/10 hover:bg-primary/20"
                    : "text-muted-foreground border-sidebar-border/60 hover:text-foreground hover:bg-accent"
                }`}
                aria-label="Toggle side panel"
                title="Map Settings"
              >
                <SlidersHorizontal className="h-6 w-6" />
                <span>Map Settings</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* The banner sits above this row, so the folder menu and the page share
          what's left of the viewport height. */}
      <div className="flex w-full flex-1 min-h-0">
      <div className="relative print:hidden" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className={`border-r border-sidebar-border rounded-r-2xl shadow-2xl overflow-hidden ${
            isMobile
              ? ""
              : "top-14 h-[calc(var(--app-vh,100svh)-3.5rem)]"
          }`}
          disableTransition={isResizing}
        >
          {/* The shield/wordmark, refresh, bell and the folder-menu toggle all
              live in the app banner above now — on phones they're in the
              compact mobile header instead — so this header would otherwise be
              an empty 64px band above the nav. Kept only as a small spacer so
              the first folder isn't jammed against the banner. */}
          <SidebarHeader className="h-2 p-0" />

          {/* Navigation */}
          <SidebarContent
            className="gap-0 pt-2 pb-2"
            ref={sidebarScrollRef}
            onScroll={e => {
              lastSidebarScrollTop = e.currentTarget.scrollTop;
            }}
          >
            {sidebarViewMode === "tile" && !isCollapsed ? (
              <div className="grid grid-cols-2 gap-2 px-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={pointerWithin}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={navOrder} strategy={rectSortingStrategy}>
                    {navOrder.map(key => (
                      <SortableNavTile
                        key={key}
                        id={key}
                        location={location}
                        setLocation={setLocation}
                        todoCount={todoCount}
                        certifyCount={certifyCount}
                        unlinkedImagesCount={unlinkedImagesCount}
                        govCount={govCount}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <AdminNavTile location={location} setLocation={setLocation} />
                <UserMgmtNavTile setLocation={setLocation} isAdmin={user?.role === "admin"} />
              </div>
            ) : (
            <SidebarMenu className="px-2 gap-1.5">
              {/* ── Draggable main nav items ── */}
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={navOrder}
                  strategy={verticalListSortingStrategy}
                >
                  {navOrder.map(key => (
                    <SortableNavItem
                      key={key}
                      id={key}
                      isCollapsed={isCollapsed}
                      location={location}
                      setLocation={setLocation}
                      todoCount={todoCount}
                      certifyCount={certifyCount}
                      unlinkedImagesCount={unlinkedImagesCount}
                      govCount={govCount}
                      todoExpanded={todoExpanded}
                      setTodoExpanded={setTodoExpanded}
                      opManagerExpanded={opManagerExpanded}
                      setOpManagerExpanded={setOpManagerExpanded}
                      ctoRosterSubExpanded={ctoRosterSubExpanded}
                      setCtoRosterSubExpanded={setCtoRosterSubExpanded}
                      shortcutsItemRef={shortcutsItemRef}
                      isObservationFocused={isObservationFocused}
                      setShortcutsPanelOpen={setShortcutsPanelOpen}
                      subItemClass={subItemClass}
                      sidebarScrollRef={sidebarScrollRef}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* ── Administration (expandable, all users) ── */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={
                    adminFolderExpanded && !isCollapsed
                      ? false
                      : location.startsWith("/court") ||
                        location === "/audit" ||
                        location === "/draft" ||
                        location === "/operation-management" ||
                        location === "/recycle-bin" ||
                        location === "/help" ||
                        location.startsWith("/reports")
                  }
                  onClick={() => setAdminFolderExpanded(v => !v)}
                  tooltip="Administration"
                  className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-slate-400/50 shadow-sm"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  <span
                    className={`flex-1 ${
                      location.startsWith("/court") ||
                      location === "/audit" ||
                      location === "/draft" ||
                      location === "/operation-management" ||
                      location === "/recycle-bin" ||
                      location === "/help" ||
                      location === "/reports"
                        ? "text-sidebar-foreground font-medium"
                        : "text-sidebar-foreground/80"
                    }`}
                  >
                    Administration
                  </span>
                  {!isCollapsed &&
                    (adminFolderExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
                    ))}
                </SidebarMenuButton>

                {adminFolderExpanded && !isCollapsed && (
                  <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
                    {/* Reports (expandable sub-folder) */}
                    <button
                      onClick={() => setReportsExpanded(v => !v)}
                      className={subItemClass(location.startsWith("/reports"))}
                    >
                      <BarChart3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="flex-1">Reports</span>
                      {reportsExpanded ? (
                        <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-sidebar-foreground/40" />
                      )}
                    </button>
                    {reportsExpanded && (
                      <div className="ml-4 border-l border-sidebar-border/40 pl-3 flex flex-col gap-0.5 mb-0.5">
                        <button
                          onClick={() =>
                            setLocation("/reports/outstanding-actions")
                          }
                          className={subItemClass(
                            location === "/reports/outstanding-actions"
                          )}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                          Outstanding Actions
                        </button>
                        <button
                          onClick={() =>
                            setLocation("/reports/weekly-activity")
                          }
                          className={subItemClass(
                            location === "/reports/weekly-activity"
                          )}
                        >
                          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                          Weekly Activity
                        </button>
                        <button
                          onClick={() => setLocation("/reports/weekly-tasking")}
                          className={subItemClass(
                            location === "/reports/weekly-tasking"
                          )}
                        >
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                          Weekly Tasking
                        </button>
                      </div>
                    )}

                    {/* Court (expandable sub-folder) */}
                    <button
                      onClick={() => setCourtExpanded(v => !v)}
                      className={subItemClass(location.startsWith("/court"))}
                    >
                      <Scale className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      <span className="flex-1">Court</span>
                      {courtExpanded ? (
                        <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-sidebar-foreground/40" />
                      )}
                    </button>
                    {courtExpanded && (
                      <div className="ml-4 border-l border-sidebar-border/40 pl-3 flex flex-col gap-0.5 mb-0.5">
                        <button
                          onClick={() => setLocation("/court/statements")}
                          className={subItemClass(
                            location === "/court/statements"
                          )}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          Statements
                        </button>
                        <button
                          onClick={() => setLocation("/court/witness-list")}
                          className={subItemClass(
                            location === "/court/witness-list"
                          )}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          Witness List
                        </button>
                        <button
                          onClick={() => setLocation("/court/wipc")}
                          className={subItemClass(location === "/court/wipc")}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <span className="flex-1">WIPC</span>
                          <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-4">
                            🔒
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Audit Log */}
                    <button
                      onClick={() => setLocation("/audit")}
                      className={subItemClass(location === "/audit")}
                    >
                      <ScrollText className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      Audit Log
                    </button>

                    {/* Draft Mode */}
                    <button
                      onClick={() => setLocation("/draft")}
                      className={subItemClass(location === "/draft")}
                    >
                      <WifiOff
                        className={`h-3.5 w-3.5 shrink-0 ${draftCounts.total > 0 ? "text-blue-400" : "text-foreground"}`}
                      />
                      <span className="flex-1">Draft Mode</span>
                      {draftCounts.total > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400">
                          {draftCounts.total}
                        </span>
                      )}
                    </button>

                    {/* Archive (was Operation Management) */}
                    <button
                      onClick={() => setLocation("/operation-management")}
                      className={subItemClass(
                        location === "/operation-management"
                      )}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      Archive
                    </button>

                    {/* Recycle Bin */}
                    <button
                      onClick={() => setLocation("/recycle-bin")}
                      className={subItemClass(location === "/recycle-bin")}
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      Recycle Bin
                    </button>

                    {/* Help */}
                    <button
                      onClick={() => setLocation("/help")}
                      className={subItemClass(location === "/help")}
                    >
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      Help
                    </button>
                  </div>
                )}
              </SidebarMenuItem>

              {/* ── User Management (expandable, all users see it, Access Management is admin-only inside) ── */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={false}
                  onClick={() => setUserMgmtFolderExpanded(v => !v)}
                  tooltip="User Management"
                  className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-blue-400/50 shadow-sm"
                >
                  <UserCog className="h-4 w-4 text-blue-400" />
                  <span
                    className={`flex-1 ${location === "/profile" || location === "/admin" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
                  >
                    User Management
                  </span>
                  {!isCollapsed &&
                    (userMgmtFolderExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
                    ))}
                </SidebarMenuButton>

                {userMgmtFolderExpanded && !isCollapsed && (
                  <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
                    {/* My Profile */}
                    <button
                      onClick={() => setLocation("/profile")}
                      className={subItemClass(location === "/profile")}
                    >
                      <User className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      My Profile
                    </button>
                    {/* Access Management — admin only */}
                    {user?.role === "admin" && (
                      <button
                        onClick={() => setLocation("/admin")}
                        className={subItemClass(location === "/admin")}
                      >
                        <Users className="h-3.5 w-3.5 shrink-0 text-foreground" />
                        Access Management
                      </button>
                    )}
                  </div>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
            )}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                      <AvatarFallback className="text-xs font-semibold bg-sidebar-primary/20 text-sidebar-primary">
                        {user?.name?.charAt(0).toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    {!isCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-sidebar-foreground truncate leading-none">
                          {user?.name ?? "—"}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5">
                          {(() => {
                            const roleConf =
                              ROLE_CONFIG[
                                (user?.role as keyof typeof ROLE_CONFIG) ??
                                  "observer"
                              ];
                            const RoleIcon = roleConf?.icon ?? Eye;
                            return (
                              <>
                                <RoleIcon
                                  className={`w-3 h-3 ${roleConf?.color}`}
                                />
                                <span
                                  className={`text-xs ${roleConf?.color}`}
                                >
                                  {roleConf?.label}
                                </span>

                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {(user as any)?.cin
                        ? `CIN: ${(user as any).cin}`
                        : ((user as any)?.username ?? "")}
                    </p>
                    {(user as any)?.unit && (
                      <p className="text-xs text-muted-foreground">
                        {(user as any).unit}
                      </p>
                    )}
                    {(() => {
                      const roleConf =
                        ROLE_CONFIG[
                          (user?.role as keyof typeof ROLE_CONFIG) ??
                            "observer"
                        ];
                      const RoleIcon = roleConf?.icon ?? Eye;
                      return (
                        <Badge
                          variant="outline"
                          className={`mt-1.5 text-xs gap-1 ${roleConf?.badge}`}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {roleConf?.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setLocation("/profile")}
                    className="cursor-pointer"
                  >
                    <UserCircle className="mr-2 h-4 w-4" />
                    My Profile
                  </DropdownMenuItem>
                  {toggleTheme && (
                    <DropdownMenuItem
                      onClick={toggleTheme}
                      className="cursor-pointer"
                    >
                      {theme === "dark" ? (
                        <>
                          <Sun className="mr-2 h-4 w-4" />
                          Switch to Light Mode
                        </>
                      ) : (
                        <>
                          <Moon className="mr-2 h-4 w-4" />
                          Switch to Dark Mode
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {!isCollapsed && (
                <div className="text-right shrink-0 pr-1">
                  <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 leading-none">
                    Version
                  </p>
                  <p className="text-xs font-mono text-sidebar-foreground/60 leading-none mt-1">
                    {APP_VERSION}
                  </p>
                </div>
              )}
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors"
            style={{ zIndex: 50 }}
            onMouseDown={() => setIsResizing(true)}
          />
        )}
      </div>

      <SidebarInset
        className={fillViewport ? "min-h-0 overflow-hidden" : undefined}
      >
        {/* Section colour accent bar */}
        <SectionAccentBar />
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSidebar}
                className="flex items-center justify-center h-11 w-11 rounded-lg text-foreground hover:bg-accent transition-colors"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-6 w-6" />
              </button>
              <span className="text-base font-semibold text-foreground">
                RunLog
              </span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell
                className="h-11 w-11 hover:bg-accent"
                iconClassName="h-6 w-6 text-muted-foreground"
              />
              <ViewToggle
                value={sidebarViewMode}
                onChange={setSidebarViewMode}
                folderLabel="Folder view"
                tileLabel="Tile view"
              />
              {/* Active RS quick-link (mobile) */}
              <button
                onClick={() => {
                  if (activeRsId) setLocation(`/sheet/${activeRsId}`);
                }}
                className={`flex items-center justify-center h-11 w-11 rounded-lg transition-all ${
                  activeRsId
                    ? "text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                    : "text-muted-foreground/30 cursor-default"
                }`}
                title={activeRsId ? "Go to Active RS" : "No active RS selected"}
              >
                <ClipboardList className="h-6 w-6" />
              </button>
              {/* Map quick-link (mobile) */}
              {location !== "/intelligence/mapping" && (
                <button
                  onClick={() => setLocation("/intelligence/mapping")}
                  className="flex items-center justify-center h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  title="Back to Map"
                >
                  <Map className="h-6 w-6" />
                </button>
              )}
              {/* Right pane folder-expander (page-specific, e.g. Map's RS Actions pane) */}
              {rightPaneToggle && (
                <button
                  onClick={rightPaneToggle.onToggle}
                  className={`flex items-center justify-center h-11 w-11 rounded-lg transition-colors ${
                    rightPaneToggle.isOpen
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  aria-label="Toggle side panel"
                  title="Toggle side panel"
                >
                  <PanelRight className="h-6 w-6" />
                </button>
              )}
            </div>
          </div>
        )}
        {/* min-h-0 (not min-h-screen): this sits below the mobile header bar
            in the same flex column, so a 100vh floor here always overflows
            the actual viewport by the header's height — that's what caused
            the whole page to scroll slightly, hiding the Map page's fixed
            top/bottom overlays. flex-1 alone already fills the remaining
            space for short pages; min-h-0 just lets it shrink correctly
            instead of forcing more height than is actually available. */}
        {/* app-canvas: the page ground. Carries the soft background wash (see
            index.css) — it has to live here rather than on <body>, because this
            element's bg-background/90 and SidebarInset's bg-background would
            paint straight over anything set further up. */}
        <main
          className={`app-canvas flex-1 min-h-0 bg-background/90 ${
            fillViewport ? "overflow-hidden" : ""
          }`}
        >
          <PullToRefresh disabled={location === "/intelligence/mapping"}>
            {children}
          </PullToRefresh>
        </main>
      </SidebarInset>
      </div>
      {/* end sidebar + page row */}

      {/* ── Shortcuts Reference Panel ─────────────────────────────────────── */}
      {shortcutsPanelOpen && isObservationFocused && (
        <div
          className="fixed z-[200] top-1/4 left-0 w-72 rounded-r-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden"
          style={{ maxHeight: "60vh" }}
          onMouseEnter={() => setShortcutsPanelHovered(true)}
          onMouseLeave={() => {
            setShortcutsPanelHovered(false);
            if (!isObservationFocused) setShortcutsPanelOpen(false);
          }}
          onMouseDown={e => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border bg-sidebar-accent/30">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-sidebar-foreground">
                Shortcuts Reference
              </span>
            </div>
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              onClick={() => setShortcutsPanelOpen(false)}
            >
              ×
            </button>
          </div>
          {/* Body */}
          <div
            className="overflow-y-auto p-3 flex flex-col gap-1"
            style={{ maxHeight: "calc(60vh - 48px)" }}
          >
            {shortcutsList && shortcutsList.length > 0 ? (
              shortcutsList.map((sc: any) => (
                <div
                  key={sc.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/40 transition-colors"
                >
                  <span className="shrink-0 font-mono text-xs font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 rounded px-1.5 py-0.5 leading-none mt-0.5">
                    {sc.trigger}
                  </span>
                  <span className="text-xs text-sidebar-foreground/80 leading-relaxed">
                    {sc.expansion}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-sidebar-foreground/50 text-center py-4">
                No shortcuts yet
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
