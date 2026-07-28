import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  DndContext,
  closestCenter,
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
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
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
  UserCog,
  BarChart3,
  GripVertical,
  LayoutGrid,
  List,
  Image,
  Link2,
  FileEdit,
} from "lucide-react";
import React, {
  CSSProperties,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useObservationFocus } from "@/contexts/ObservationFocusContext";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useOffline } from "@/contexts/OfflineContext";
import { useSectionColor } from "@/contexts/SectionColorContext";

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
};

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
          isActive={opManagerActive}
          onClick={() => setOpManagerExpanded(v => !v)}
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
              onClick={() => setCtoRosterSubExpanded(v => !v)}
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
                  Shift Grid
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/my-shifts")}
                  className={subItemClass(location === "/cto-roster/my-shifts")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  My Shifts
                </button>
                <button
                  onClick={() => setLocation("/cto-roster/members")}
                  className={subItemClass(location === "/cto-roster/members")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Members
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
              </div>
            )}
          </div>
        )}
      </SidebarMenuItem>
    );
  }

  return null;
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
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

const ROLE_CONFIG = {
  admin: {
    label: "Full Access + User Management",
    icon: Crown,
    color: "text-blue-400",
    badge: "border-blue-400/30 bg-blue-400/10 text-blue-400",
  },
  member: {
    label: "Full Access",
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
}: {
  children: React.ReactNode;
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
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
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

  // ── Home screen mode toggle ──────────────────────────────────────────────
  const [homeMode, setHomeMode] = useState<"folder" | "tile">("folder");
  const { data: homePrefsData } = trpc.sidebar.getHomePrefs.useQuery(
    undefined,
    { staleTime: Infinity }
  );
  const dashboardUtils = trpc.useUtils();
  const setHomePrefsMutation = trpc.sidebar.setHomePrefs.useMutation({
    onSuccess: () => dashboardUtils.sidebar.getHomePrefs.invalidate(),
  });

  useEffect(() => {
    if (homePrefsData?.mode) {
      setHomeMode(homePrefsData.mode as "folder" | "tile");
    }
  }, [homePrefsData]);

  function toggleHomeMode() {
    const newMode = homeMode === "folder" ? "tile" : "folder";
    setHomeMode(newMode);
    setHomePrefsMutation.mutate({ mode: newMode });
    if (newMode === "tile") {
      setLocation("/tile-home");
    } else {
      setLocation("/");
    }
  }

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
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 8 },
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
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border rounded-r-2xl shadow-2xl overflow-hidden"
          disableTransition={isResizing}
        >
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ShieldCheck className="w-5 h-5 text-sidebar-primary shrink-0" />
                  <span className="font-semibold text-sidebar-foreground tracking-tight truncate text-sm">
                    Running Sheet
                  </span>
                </div>
              )}
              {!isCollapsed && (
                <button
                  onClick={toggleHomeMode}
                  className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ml-auto"
                  title={
                    homeMode === "folder"
                      ? "Switch to Dashboard"
                      : "Switch to Folders"
                  }
                  aria-label={
                    homeMode === "folder"
                      ? "Switch to Dashboard"
                      : "Switch to Folders"
                  }
                >
                  {homeMode === "folder" ? (
                    <LayoutGrid className="h-4 w-4 text-sidebar-foreground/60" />
                  ) : (
                    <List className="h-4 w-4 text-sidebar-foreground/60" />
                  )}
                </button>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="gap-0 pt-2 pb-2">
            <SidebarMenu className="px-2 gap-1.5">
              {/* ── Draggable main nav items ── */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
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
                        location === "/reports"
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
                    {/* Reports */}
                    <button
                      onClick={() => setLocation("/reports")}
                      className={subItemClass(location === "/reports")}
                    >
                      <BarChart3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      Reports
                    </button>

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
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                              <span className={`text-xs ${roleConf?.color}`}>
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
                        (user?.role as keyof typeof ROLE_CONFIG) ?? "observer"
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

      <SidebarInset>
        {/* Section colour accent bar */}
        <SectionAccentBar />
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="text-base font-semibold text-foreground">
                Running Sheet
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Active RS quick-link (mobile) */}
              <button
                onClick={() => {
                  if (activeRsId) setLocation(`/sheet/${activeRsId}`);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-all ${
                  activeRsId
                    ? "text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                    : "text-muted-foreground/30 cursor-default"
                }`}
                title={activeRsId ? "Go to Active RS" : "No active RS selected"}
              >
                <ClipboardList className="h-7 w-7" />
              </button>
              {/* Map quick-link (mobile) */}
              {location !== "/intelligence/mapping" && (
                <button
                  onClick={() => setLocation("/intelligence/mapping")}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  title="Back to Map"
                >
                  <Map className="h-7 w-7" />
                </button>
              )}
            </div>
          </div>
        )}
        {!isMobile && location !== "/intelligence/mapping" && (
          <div className="flex justify-end items-center gap-2 px-4 pt-2 pb-0">
            {/* Active RS quick-link (desktop) — folder-chip style matching the
                Operations sidebar item's blue theme; fades out when there's
                no active RS, same as before. */}
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
            {/* Map quick-link (desktop) — folder-chip style matching the
                Mapping sidebar item's turquoise theme. */}
            <button
              onClick={() => setLocation("/intelligence/mapping")}
              className="flex items-center justify-center gap-2 min-w-[130px] px-3 py-2 rounded-xl border border-teal-400/50 bg-teal-400/10 text-teal-400 hover:bg-teal-400/20 text-sm font-semibold shadow-sm transition-all"
              title="Map"
            >
              <Map className="h-6 w-6" />
              <span>Map</span>
            </button>
          </div>
        )}
        <main className="flex-1 min-h-screen bg-background/90">{children}</main>
      </SidebarInset>

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
