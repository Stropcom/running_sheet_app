import { RosterCommandBar, isRosterPath } from "@/components/RosterCommandBar";
import {
  isOpManagerPath,
  isProceduresPath,
  isRosterToolsPath,
} from "@shared/rosterMenu";
import { RosterFullscreenBar } from "@/components/roster/RosterZoomControl";
import { useRosterFullscreen } from "@/lib/rosterFullscreen";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  looksOffline,
  offlineReopenView,
  readLastOfficer,
} from "@shared/offlineReopen";
import { BannerOperation } from "@/components/BannerOperation";
import { PasskeyBanner } from "@/components/PasskeyBanner";
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
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {} from "@dnd-kit/utilities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ViewToggle } from "./ViewToggle";
import { useViewMode } from "@/contexts/ViewModeContext";
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
import { useIsMobile } from "@/hooks/useMobile";
import { useTheme } from "@/contexts/ThemeContext";
import {
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
  ChevronDown,
  ChevronRight,
  Map,
  ArrowRightLeft,
  HelpCircle,
  Trash2,
  WifiOff,
  Settings,
  SlidersHorizontal,
  UserCog,
  Binoculars,
  RefreshCw,
  Database,
} from "lucide-react";
import React, {
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import {
  scrollToggleNearTop,
  isAdministrationPath,
} from "./dashboardLayout/navHelpers";
import { SortableNavItem } from "./dashboardLayout/SortableNavItem";
import {
  SortableNavTile,
  AdminNavTile,
  UserMgmtNavTile,
} from "./dashboardLayout/NavTiles";

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
  investigator: {
    label: "Investigator",
    icon: Binoculars,
    color: "text-purple-400",
    badge: "border-purple-400/30 bg-purple-400/10 text-purple-400",
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
  const { loading, user, error: authError } = useAuth();
  const [, setLocation] = useLocation();
  // Investigator accounts are map-only (see server/_core/trpc.ts's
  // INVESTIGATOR_ALLOWED_PATHS, the real enforcement — this is just the
  // matching client-side redirect so a typed URL bounces straight back
  // instead of rendering a page whose every query then fails).
  const isInvestigator = user?.role === "investigator";
  const [investigatorPath] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  /**
   * Hard lock against document scrolling, on every page.
   *
   * The app shell (header + sidebar + main content) used to have no height
   * ceiling of its own, so on any page whose content was taller than the
   * viewport the *document* scrolled — carrying the header and the sidebar
   * off-screen with it, since neither is fixed/sticky relative to the page.
   * Locking html/body/#root to exactly the viewport height means there's
   * nothing for the document to scroll; the header and sidebar are simply
   * never part of anything that moves, and `<main>` (see the `app-canvas`
   * element below) becomes its own scroll container instead — sized by the
   * same flex-column + min-h-0 chain `fillViewport` pages already relied on,
   * just applied unconditionally now instead of opt-in. `fillViewport` pages
   * (the map) still additionally set `overflow-hidden` on `<main>` itself,
   * since those are a fixed canvas the user pans/zooms rather than a
   * document with its own scrollbar.
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
   * scroll and no iOS rubber-band bounce.
   *
   * useLayoutEffect (not useEffect) so the height is set before first paint —
   * otherwise the page flashes at the wrong size on entry.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const setVh = () => {
      const vv = window.visualViewport;
      // visualViewport excludes browser chrome; innerHeight is the fallback.
      const h = Math.round(vv?.height ?? window.innerHeight);
      if (h > 0) root.style.setProperty("--app-vh", `${h}px`);
      // With the on-screen keyboard up, iOS pans the visible area down the
      // page to keep the typing field in view (visualViewport.offsetTop > 0)
      // without resizing the page itself. The shell, sized only to the
      // visible HEIGHT, then ends offsetTop short of the keyboard — a blank
      // band between the content and the keyboard (phones and iPads). While
      // that's the case, the shell is moved down to start exactly where the
      // visible area does, so it fills the space above the keyboard.
      const top = Math.round(vv?.offsetTop ?? 0);
      if (top > 1) {
        root.style.setProperty("--app-vv-top", `${top}px`);
        document.body.classList.add("app-vv-shifted");
      } else {
        document.body.classList.remove("app-vv-shifted");
        root.style.removeProperty("--app-vv-top");
      }
    };
    setVh();
    root.classList.add("app-no-scroll");
    document.body.classList.add("app-no-scroll");

    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    window.visualViewport?.addEventListener("resize", setVh);
    window.visualViewport?.addEventListener("scroll", setVh);
    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
      window.visualViewport?.removeEventListener("resize", setVh);
      window.visualViewport?.removeEventListener("scroll", setVh);
      root.classList.remove("app-no-scroll");
      document.body.classList.remove("app-no-scroll", "app-vv-shifted");
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--app-vv-top");
    };
  }, []);

  // A forced password change locks the user out of every other page until
  // they set a real password — enforced server-side too, this is just the
  // matching client-side redirect.
  useEffect(() => {
    if (user?.mustChangePassword) {
      setLocation("/change-password");
    }
  }, [user, setLocation]);

  const INVESTIGATOR_ALLOWED_ROUTES = ["/intelligence/mapping", "/profile"];
  useEffect(() => {
    if (
      isInvestigator &&
      !user?.mustChangePassword &&
      !INVESTIGATOR_ALLOWED_ROUTES.includes(investigatorPath)
    ) {
      setLocation("/intelligence/mapping");
    }
  }, [isInvestigator, investigatorPath, user?.mustChangePassword, setLocation]);

  // Opened with no connection: show the drafts saved on this device for the
  // last officer instead of a dead sign-in prompt (shared/offlineReopen.ts).
  const [reopenPath] = useLocation();
  const reopenView = offlineReopenView({
    signedIn: Boolean(user),
    online: !looksOffline(
      typeof navigator === "undefined" ? true : navigator.onLine,
      authError
    ),
    lastOfficer: readLastOfficer(),
    path: reopenPath,
  });
  if (loading) return <DashboardLayoutSkeleton />;

  if (user?.mustChangePassword) return <DashboardLayoutSkeleton />;

  if (reopenView === "drafts" || reopenView === "go-drafts") {
    const officer = readLastOfficer();
    return (
      <div className="min-h-screen bg-background pt-10">
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Offline — showing the drafts saved on this device for CIN{" "}
          {officer?.cin}. You will need to sign in when you are back online;
          nothing is sent until then.
        </div>
        <div className="p-4">{reopenView === "drafts" ? children : null}</div>
      </div>
    );
  }

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
          // before that first measurement lands. Applied on every page (not
          // just fillViewport) — without a hard height ceiling here, this
          // wrapper's default min-h-svh lets it grow with content instead of
          // handing the overflow down to <main> to scroll, which is exactly
          // the "whole page scrolls" bug this shell now exists to prevent.
          height: "var(--app-vh, 100svh)",
        } as CSSProperties
      }
      // flex-col: the shell's default is a row (folder menu beside the page).
      // The app banner has to span the full width above both, so the wrapper
      // stacks banner-then-row instead, and the row itself is a nested flex.
      // min-h-0 overflow-hidden: lets the column shrink to the height above
      // instead of growing past it, and stops it becoming a second scroll
      // container of its own — <main class="app-canvas"> is the only one.
      className="flex-col min-h-0 overflow-hidden"
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
  // Investigator accounts are map-only — see INVESTIGATOR_ALLOWED_PATHS in
  // server/_core/trpc.ts for the real (server-side) enforcement; this just
  // trims the sidebar/header down to match so nothing renders that would
  // fail anyway.
  const isInvestigator = user?.role === "investigator";
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
  const { viewMode } = useViewMode();

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
      : isOpManagerPath(location)
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
  const rosterFullscreen = useRosterFullscreen();

  const { data: outstanding } = trpc.sheet.outstandingForMe.useQuery(
    undefined,
    {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      enabled: !isInvestigator,
    }
  );
  const { data: governanceTodo } = trpc.sheet.governanceTodo.useQuery(
    undefined,
    {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      enabled: !isInvestigator,
    }
  );
  const { data: unlinkedImagesTodo } = trpc.sheet.unlinkedImagesTodo.useQuery(
    undefined,
    {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      enabled: !isInvestigator,
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
    isProceduresPath(location)
  );
  const [todoExpanded, setTodoExpanded] = useState(
    () =>
      location === "/todo" ||
      location === "/todo/images" ||
      location === "/todo/governance"
  );
  const [opManagerExpanded, setOpManagerExpanded] = useState(() =>
    isOpManagerPath(location)
  );
  const [ctoRosterSubExpanded, setCtoRosterSubExpanded] = useState(() =>
    location.startsWith("/cto-roster")
  );
  // Roster tools (Drafts, Saved Rosters, EA Compliance, Audit Log, Members) is
  // folded away unless you are on one of its pages.
  const [rosterToolsExpanded, setRosterToolsExpanded] = useState(() =>
    isRosterToolsPath(location)
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

  // Operation(s) chosen in the Map Settings pane — shown beside Active RS.
  const readMapOpIds = useCallback((): number[] => {
    try {
      const s = localStorage.getItem(LS_MAP_SETTINGS_KEY);
      const ids = s ? JSON.parse(s).selectedOpIds : null;
      if (Array.isArray(ids)) {
        return ids.filter((n: unknown): n is number => typeof n === "number");
      }
    } catch {
      /* ignore */
    }
    return [];
  }, []);
  const [mapOpIds, setMapOpIds] = useState<number[]>(readMapOpIds);
  const { data: mapOperations } = trpc.operation.listForMap.useQuery(
    undefined,
    { staleTime: 60_000, enabled: !!user }
  );
  const mapOperationLabel = useMemo(() => {
    if (mapOpIds.length === 0 || !mapOperations) return null;
    const all = mapOperations as { id: number; name: string }[];
    const chosen = all.filter(op => mapOpIds.includes(op.id));
    if (chosen.length === 0) return null;
    if (chosen.length === 1) return chosen[0].name.toUpperCase();
    if (chosen.length === all.length) return "ALL OPERATIONS";
    return `${chosen.length} OPERATIONS`;
  }, [mapOpIds, mapOperations]);

  // Sync when the map page writes to localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_MAP_SETTINGS_KEY) {
        setActiveRsId(readActiveRsId());
        setMapOpIds(readMapOpIds());
      }
    };
    window.addEventListener("storage", onStorage);
    // "storage" never fires in the tab that wrote the value, so the Map page
    // announces its own saves (picking a running sheet lights Active RS now).
    const onSameTab = () => {
      setActiveRsId(readActiveRsId());
      setMapOpIds(readMapOpIds());
    };
    window.addEventListener("runlog-map-settings-changed", onSameTab);
    // Also poll on focus in case same-tab writes don't fire storage events
    const onFocus = () => {
      setActiveRsId(readActiveRsId());
      setMapOpIds(readMapOpIds());
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("runlog-map-settings-changed", onSameTab);
      window.removeEventListener("focus", onFocus);
    };
  }, [readActiveRsId, readMapOpIds]);

  // Re-read when navigating back to any page (location change)
  useEffect(() => {
    setActiveRsId(readActiveRsId());
    setMapOpIds(readMapOpIds());
  }, [location, readActiveRsId, readMapOpIds]);

  const dashboardUtils = trpc.useUtils();

  // ── Sidebar drag-to-reorder ──────────────────────────────────────────────
  const DEFAULT_NAV_ORDER = [
    "operations",
    "governance",
    "todo",
    "mapping",
    "images",
    "calendar",
    "intelligence",
    "targetRegistry",
    "operationManager",
    "reports",
    "court",
  ];
  const [navOrder, setNavOrder] = useState<string[]>(DEFAULT_NAV_ORDER);
  // Investigator accounts are map-only — feed the existing nav renderer a
  // single-item list rather than touching its (drag-reorder-capable)
  // rendering code, so every other role's sidebar stays untouched.
  const effectiveNavOrder = isInvestigator ? ["mapping"] : navOrder;
  const { data: sidebarOrderData } = trpc.sidebar.getOrder.useQuery(undefined, {
    staleTime: Infinity,
    enabled: !isInvestigator,
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
      "/shortcuts",
      "/administration/intel-export",
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
        <header className="app-chrome relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-3 print:hidden">
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
            <ViewToggle />
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
            {!isInvestigator && (
              <NotificationBell
                className="hover:bg-sidebar-accent h-10 w-10"
                iconClassName="h-5 w-5 text-sidebar-foreground/70"
              />
            )}
          </div>

          {/* Centre: wordmark, absolutely positioned so it sits at true screen
              centre rather than being pushed around by whatever is on either
              side of it. pointer-events-none so it can never swallow a click
              aimed at a control underneath. */}
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 ${
              rosterFullscreen ? "hidden 2xl:flex" : "flex"
            }`}
          >
            <ShieldCheck className="w-7 h-7 text-sidebar-primary shrink-0" />
            <span className="font-semibold text-sidebar-foreground tracking-tight text-xl">
              RunLog
            </span>
          </div>

          {/* Right: page-level quick links (Active RS / Map, or the map's own
              Map Settings pane toggle). Active RS is always shown, including
              on the mapping page itself — it used to live there as a
              separate floating pill over the map instead; this is the same
              link, just consolidated into the one place every other page
              already has it. */}
          <div className="flex items-center gap-2">
            {/* Roster full screen: its few controls live here on a laptop
                (a portrait tablet or a small phone gets a strip on the page
                instead; a phone turned sideways has room, so it is here). */}
            {rosterFullscreen && (
              <div className="roster-fs-header mr-2">
                <RosterFullscreenBar variant="header" />
              </div>
            )}
            {mapOperationLabel && <BannerOperation label={mapOperationLabel} />}
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
            {location !== "/intelligence/mapping" && (
              <button
                onClick={() => setLocation("/intelligence/mapping")}
                className="flex items-center justify-center gap-2 min-w-[130px] px-3 py-2 rounded-xl border border-teal-400/50 bg-teal-400/10 text-teal-400 hover:bg-teal-400/20 text-sm font-semibold shadow-sm transition-all"
                title="Map"
              >
                <Map className="h-6 w-6" />
                <span>Map</span>
              </button>
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
              isMobile ? "" : "top-14 h-[calc(var(--app-vh,100svh)-3.5rem)]"
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
              {viewMode === "tile" && !isCollapsed ? (
                <div className="grid grid-cols-2 gap-2 px-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithin}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={effectiveNavOrder}
                      strategy={rectSortingStrategy}
                    >
                      {effectiveNavOrder.map(key => (
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
                  <UserMgmtNavTile
                    setLocation={setLocation}
                    isAdmin={user?.role === "admin"}
                  />
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
                      items={effectiveNavOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      {effectiveNavOrder.map(key => (
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
                          rosterToolsExpanded={rosterToolsExpanded}
                          setRosterToolsExpanded={setRosterToolsExpanded}
                          reportsExpanded={reportsExpanded}
                          setReportsExpanded={setReportsExpanded}
                          courtExpanded={courtExpanded}
                          setCourtExpanded={setCourtExpanded}
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
                          : isAdministrationPath(location)
                      }
                      onClick={() => setAdminFolderExpanded(v => !v)}
                      tooltip="Administration"
                      className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-emerald-400/50 shadow-sm"
                    >
                      <Settings className="h-4 w-4 text-emerald-400" />
                      <span
                        className={`flex-1 ${
                          isAdministrationPath(location)
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
                        {/* Sub-folders are alphabetical, with Help always last. */}
                        {/* Archive (was Operation Management) */}
                        <button
                          onClick={() => setLocation("/operation-management")}
                          className={subItemClass(
                            location === "/operation-management"
                          )}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                          Archive
                        </button>

                        {/* Audit Log */}
                        <button
                          onClick={() => setLocation("/audit")}
                          className={subItemClass(location === "/audit")}
                        >
                          <ScrollText className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                          Audit Log
                        </button>

                        {/* Draft Mode */}
                        <button
                          onClick={() => setLocation("/draft")}
                          className={subItemClass(location === "/draft")}
                        >
                          <WifiOff
                            className={`h-3.5 w-3.5 shrink-0 ${draftCounts.total > 0 ? "text-blue-400" : "text-orange-400"}`}
                          />
                          <span className="flex-1">Draft Mode</span>
                          {draftCounts.total > 0 && (
                            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400">
                              {draftCounts.total}
                            </span>
                          )}
                        </button>

                        {/* Intel Export */}
                        <button
                          onClick={() =>
                            setLocation("/administration/intel-export")
                          }
                          className={subItemClass(
                            location.startsWith("/administration/intel-export")
                          )}
                        >
                          <Database className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                          Intel Export
                        </button>

                        {/* Recycle Bin */}
                        <button
                          onClick={() => setLocation("/recycle-bin")}
                          className={subItemClass(location === "/recycle-bin")}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-400" />
                          Recycle Bin
                        </button>

                        {/* Shortcuts — while an observation is being typed it
                            lights up, and hovering it opens the Shortcuts
                            Reference panel (this used to be a top-level folder) */}
                        <button
                          onClick={() => setLocation("/shortcuts")}
                          onMouseEnter={() => {
                            if (isObservationFocused)
                              setShortcutsPanelOpen(true);
                          }}
                          className={subItemClass(
                            location.startsWith("/shortcuts")
                          )}
                        >
                          <Zap
                            className={`h-3.5 w-3.5 shrink-0 ${isObservationFocused ? "text-cyan-300" : "text-yellow-400"}`}
                          />
                          <span
                            className={`flex-1 ${isObservationFocused ? "text-cyan-300 font-medium" : ""}`}
                          >
                            Shortcuts
                          </span>
                          {isObservationFocused && (
                            <span className="text-[9px] font-bold text-cyan-500 uppercase tracking-wide">
                              hover
                            </span>
                          )}
                        </button>

                        {/* Help — always last */}
                        <button
                          onClick={() => setLocation("/help")}
                          className={subItemClass(location === "/help")}
                        >
                          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-sky-400" />
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
                          <User className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                          My Profile
                        </button>
                        {/* Access Management — admin only */}
                        {user?.role === "admin" && (
                          <button
                            onClick={() => setLocation("/admin")}
                            className={subItemClass(location === "/admin")}
                          >
                            <Users className="h-3.5 w-3.5 shrink-0 text-blue-400" />
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

        <SidebarInset className="min-h-0 overflow-hidden">
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
                {/* Roster full screen, phone turned sideways: the same
                    controls as the laptop header (see index.css). */}
                {rosterFullscreen && (
                  <div className="roster-fs-header mr-1">
                    <RosterFullscreenBar variant="bar" />
                  </div>
                )}
                {!isInvestigator && (
                  <NotificationBell
                    className="h-11 w-11 hover:bg-accent"
                    iconClassName="h-6 w-6 text-muted-foreground"
                  />
                )}
                <ViewToggle />
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
                  title={
                    activeRsId ? "Go to Active RS" : "No active RS selected"
                  }
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
          {/* app-canvas: the page ground and the app's one scroll container.
            The document itself never scrolls (see the useLayoutEffect above)
            so the header and sidebar never move — this element is what
            scrolls instead, for every ordinary page. It also carries the
            soft background wash (see index.css); that has to live here
            rather than on <body>, because this element's bg-background/90
            and SidebarInset's bg-background would paint straight over
            anything set further up. `fillViewport` pages (the map) are a
            fixed canvas the user pans/zooms rather than scrolls, so they get
            overflow-hidden instead and opt out of the wash entirely
            (app-canvas-fill, see index.css) since it would only ever flash
            while tiles load on a full-bleed surface. */}
          <main
            className={`app-canvas flex-1 min-h-0 bg-background/90 ${
              fillViewport
                ? "app-canvas-fill overflow-hidden"
                : "overflow-y-auto"
            }`}
          >
            <PullToRefresh disabled={location === "/intelligence/mapping"}>
              {isRosterPath(location) && <RosterCommandBar />}
              <PasskeyBanner />
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
