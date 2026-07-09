import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
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
  FileText, ScrollText, Users, PanelLeft, LogOut, ShieldCheck, Crown, Eye, UserCircle, User, Sun, Moon, ClipboardList, Zap, FolderSearch, ClipboardCheck, BookOpen, Scale, FolderOpen, ChevronDown, ChevronRight, CalendarDays, Shield, ClipboardCheck as GovIcon, Network, ArrowRightLeft, HelpCircle, Trash2, WifiOff } from "lucide-react";
import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { useObservationFocus } from "@/contexts/ObservationFocusContext";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useOffline } from "@/contexts/OfflineContext";

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

const ROLE_CONFIG = {
  admin: { label: "Full Access + User Management", icon: Crown, color: "text-blue-400", badge: "border-blue-400/30 bg-blue-400/10 text-blue-400" },
  member: { label: "Full Access", icon: ShieldCheck, color: "text-emerald-400", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400" },
  observer: { label: "Observer", icon: Eye, color: "text-muted-foreground", badge: "border-border bg-muted/50 text-muted-foreground" },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to continue</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Access requires authentication.
            </p>
          </div>
          <Button onClick={() => { window.location.href = "/login"; }} size="lg" className="w-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
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

  const { data: outstanding } = trpc.sheet.outstandingForMe.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const { data: governanceTodo } = trpc.sheet.governanceTodo.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const certifyCount = outstanding?.length ?? 0;
  // Count all governance items with outstanding tasks — not just uncertified sheets.
  // This ensures the author's post-certification tasks (save as Word, PDF, etc.) are counted.
  const govCount = governanceTodo?.filter(g => g.outstanding.length > 0).length ?? 0;
  const todoCount = certifyCount + govCount;

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

  const [courtExpanded, setCourtExpanded] = useState(() => {
    return location.startsWith("/court");
  });
  const [todoExpanded, setTodoExpanded] = useState(() => {
    return location === "/todo" || location === "/todo/governance";
  });


  const menuItems = [
    { icon: FileText, label: "Operations", path: "/", color: "text-blue-400" },
    { icon: ClipboardCheck, label: "Governance", path: "/governance", color: "text-purple-400" },
    { icon: CalendarDays, label: "Calendar", path: "/calendar", color: "text-cyan-400" },
    { icon: Zap, label: "Shortcuts", path: "/shortcuts", color: "text-yellow-400" },
    { icon: FolderSearch, label: "Intelligence", path: "/intelligence", color: "text-violet-400" },
    { icon: BookOpen, label: "Target Registry", path: "/target-registry", color: "text-rose-400" },
    { icon: ScrollText, label: "Audit Log", path: "/audit", color: "text-slate-400" },
    { icon: WifiOff, label: "Draft Mode", path: "/draft", badge: draftCounts.total > 0 ? draftCounts.total : undefined, color: "text-orange-400" },
    { icon: Trash2, label: "Recycle Bin", path: "/recycle-bin", color: "text-red-400" },
    { icon: HelpCircle, label: "Help", path: "/help", color: "text-sky-400" },
    { icon: User, label: "My Profile", path: "/profile", color: "text-lime-400" },
    ...(user?.role === "admin" ? [
      { icon: Users, label: "User Management", path: "/admin", color: "text-indigo-400" },
    ] : []), // member and observer do not see User Management
  ];

  const activeMenuItem = menuItems.find((item) =>
    item.path === location || (item.path !== "/" && location.startsWith(item.path))
  );
  const roleConf = ROLE_CONFIG[(user?.role as keyof typeof ROLE_CONFIG) ?? "observer"];
  const RoleIcon = roleConf?.icon ?? Eye;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
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

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border" disableTransition={isResizing}>
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
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-sidebar-primary shrink-0" />
                  <span className="font-semibold text-sidebar-foreground tracking-tight truncate text-sm">
                    Running Sheet
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="gap-0 pt-2">
            <SidebarMenu className="px-2">
              {menuItems.map((item) => {
                const isActive =
                  item.path === "/"
                    ? location === "/" || location.startsWith("/operation/") || location.startsWith("/sheet/")
                    : location === item.path || location.startsWith(item.path);
                // Insert To-Do folder before Calendar
                const isBeforeCalendar = item.path === "/calendar";
                    // Intelligence is a plain single sidebar item
                const isIntelligenceItem = item.path === "/intelligence";
                // Insert Operation Management after Target Registry, Court after Operation Management
                const isAfterTargetRegistry = item.path === "/audit";
                return (
                  <React.Fragment key={item.path}>
                    {isBeforeCalendar && (
                      <>
                      <SidebarMenuItem key="todo-folder">
                        <SidebarMenuButton
                          isActive={location === "/todo" || location === "/todo/governance"}
                          onClick={() => setTodoExpanded((v) => !v)}
                          tooltip="To-Do"
                          className="h-10 font-normal transition-all"
                        >
                          <ClipboardList className={`h-4 w-4 ${todoCount > 0 ? "text-amber-400" : location === "/todo" || location === "/todo/governance" ? "text-amber-400" : "text-amber-400/60"}`} />
                          <span className={`flex-1 ${
                            todoCount > 0 ? "text-amber-300 font-medium" : location === "/todo" || location === "/todo/governance" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"
                          }`}>
                            To-Do
                          </span>
                          {todoCount > 0 && !isCollapsed && (
                            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400">
                              {todoCount}
                            </span>
                          )}
                          {!isCollapsed && (
                            todoExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
                              : <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
                          )}
                        </SidebarMenuButton>
                        {todoExpanded && !isCollapsed && (
                          <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
                            {/* Certify subfolder */}
                            <button
                              onClick={() => setLocation("/todo")}
                              className={`flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
                                location === "/todo"
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <Shield className={`h-3.5 w-3.5 shrink-0 ${certifyCount > 0 ? "text-red-400" : "text-emerald-400"}`} />
                              <span className="flex-1">Certify</span>
                              {certifyCount > 0 && (
                                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-bold bg-red-500/20 border border-red-500/40 text-red-400">
                                  {certifyCount}
                                </span>
                              )}
                            </button>
                            {/* RS Governance subfolder */}
                            <button
                              onClick={() => setLocation("/todo/governance")}
                              className={`flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
                                location === "/todo/governance"
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <GovIcon className={`h-3.5 w-3.5 shrink-0 ${govCount > 0 ? "text-blue-400" : "text-emerald-400"}`} />
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

                      {/* Mapping — own top-level folder, between To-Do and Calendar */}
                      <SidebarMenuItem key="mapping-folder">
                        <SidebarMenuButton
                          isActive={location === "/intelligence/mapping"}
                          onClick={() => setLocation("/intelligence/mapping")}
                          tooltip="Mapping"
                          className="h-10 font-normal transition-all"
                        >
                          <Network className={`h-4 w-4 ${location === "/intelligence/mapping" ? "text-emerald-400" : "text-emerald-400/60"}`} />
                          <span className={`flex-1 ${location === "/intelligence/mapping" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}>
                            Mapping
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      </>
                    )}

                    {isAfterTargetRegistry && (
                      <SidebarMenuItem key="op-management">
                        <SidebarMenuButton
                          isActive={location === "/operation-management"}
                          onClick={() => setLocation("/operation-management")}
                          tooltip="Operation Management"
                          className="h-10 font-normal transition-all"
                        >
                          <ArrowRightLeft className={`h-4 w-4 ${location === "/operation-management" ? "text-teal-400" : "text-teal-400/60"}`} />
                          <span className={`flex-1 ${location === "/operation-management" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}>
                            Operation Management
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}

                    {isAfterTargetRegistry && (
                      <SidebarMenuItem key="court-folder">
                        <SidebarMenuButton
                          isActive={location.startsWith("/court")}
                          onClick={() => setCourtExpanded((v) => !v)}
                          tooltip="Court"
                          className="h-10 font-normal transition-all"
                        >
                          <Scale className={`h-4 w-4 ${location.startsWith("/court") ? "text-amber-400" : "text-amber-400/60"}`} />
                          <span className={`flex-1 ${location.startsWith("/court") ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}>
                            Court
                          </span>
                          {!isCollapsed && (
                            courtExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                              : <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                          )}
                        </SidebarMenuButton>
                        {courtExpanded && !isCollapsed && (
                          <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
                            <button
                              onClick={() => setLocation("/court/statements")}
                              className={`flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
                                location === "/court/statements"
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                              Statements
                            </button>
                            <button
                              onClick={() => setLocation("/court/witness-list")}
                              className={`flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
                                location === "/court/witness-list"
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                              Witness List
                            </button>
                            <button
                              onClick={() => setLocation("/court/wipc")}
                              className={`flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
                                location === "/court/wipc"
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                              <span className="flex-1">WIPC</span>
                              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-4">
                                🔒
                              </span>
                            </button>
                          </div>
                        )}
                      </SidebarMenuItem>
                    )}
                    {isIntelligenceItem && (
                      <SidebarMenuItem key="intel-folder">
                        <SidebarMenuButton
                          isActive={location === "/intelligence" || (location.startsWith("/intelligence") && !location.startsWith("/intelligence/mapping"))}
                          onClick={() => setLocation("/intelligence")}
                          tooltip="Intelligence"
                          className="h-10 font-normal transition-all"
                        >
                          <FolderSearch className={`h-4 w-4 ${location === "/intelligence" || (location.startsWith("/intelligence") && !location.startsWith("/intelligence/mapping")) ? "text-violet-400" : "text-violet-400/60"}`} />
                          <span className={`flex-1 ${location === "/intelligence" || (location.startsWith("/intelligence") && !location.startsWith("/intelligence/mapping")) ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}>
                            Intelligence
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {!isIntelligenceItem && (
                      <SidebarMenuItem key={item.path} ref={item.label === "Shortcuts" ? shortcutsItemRef : undefined}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-10 font-normal transition-all"
                          onMouseEnter={() => {
                            if (item.label === "Shortcuts" && isObservationFocused) {
                              setShortcutsPanelOpen(true);
                            }
                          }}
                        >
                          <item.icon className={`h-4 w-4 ${
                            (item as any).badge > 0 ? "text-blue-400" : isActive ? (item as any).color ?? "text-sidebar-primary" : item.label === "Shortcuts" && isObservationFocused ? "text-yellow-400" : (item as any).color ? `${(item as any).color}/60` : "text-sidebar-foreground/60"
                          }`} />
                          <span className={`flex-1 ${
                            (item as any).badge > 0 ? "text-blue-300 font-medium" : isActive ? "text-sidebar-foreground font-medium" : item.label === "Shortcuts" && isObservationFocused ? "text-cyan-300 font-medium" : "text-sidebar-foreground/80"
                          }`}>
                            {(item as any).badgeLabel ?? item.label}
                          </span>
                          {(item as any).badge > 0 && !isCollapsed && (
                            <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400">
                              {(item as any).badge}
                            </span>
                          )}
                          {item.label === "Shortcuts" && isObservationFocused && !isCollapsed && (
                            <span className="ml-1 text-[9px] font-bold text-cyan-500 uppercase tracking-wide">hover</span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </React.Fragment>
                );
              })}
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
                        <RoleIcon className={`w-3 h-3 ${roleConf?.color}`} />
                        <span className={`text-xs ${roleConf?.color}`}>{roleConf?.label}</span>
                      </div>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{(user as any)?.cin ? `CIN: ${(user as any).cin}` : (user as any)?.username ?? ""}</p>
                  {(user as any)?.unit && <p className="text-xs text-muted-foreground">{(user as any).unit}</p>}
                  <Badge variant="outline" className={`mt-1.5 text-xs gap-1 ${roleConf?.badge}`}>
                    <RoleIcon className="w-3 h-3" />
                    {roleConf?.label}
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                {toggleTheme && (
                  <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                    {theme === "dark" ? (
                      <><Sun className="mr-2 h-4 w-4" />Switch to Light Mode</>
                    ) : (
                      <><Moon className="mr-2 h-4 w-4" />Switch to Dark Mode</>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
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
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="text-sm font-medium text-foreground">
                {activeMenuItem?.label ?? "Running Sheet"}
              </span>
            </div>
            {location !== "/intelligence/mapping" && (
              <button
                onClick={() => setLocation("/intelligence/mapping")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                title="Back to Map"
              >
                <Network className="h-3.5 w-3.5" />
                <span>Map</span>
              </button>
            )}
          </div>
        )}
        {!isMobile && location !== "/intelligence/mapping" && (
          <div className="flex justify-end px-4 pt-2 pb-0">
            <button
              onClick={() => setLocation("/intelligence/mapping")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
              title="Back to Map"
            >
              <Network className="h-3.5 w-3.5" />
              <span>Back to Map</span>
            </button>
          </div>
        )}
        <main className="flex-1 min-h-screen bg-background">{children}</main>
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
          onMouseDown={(e) => e.preventDefault()} // prevent textarea blur
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border bg-sidebar-accent/30">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-sidebar-foreground">Shortcuts Reference</span>
            </div>
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              onClick={() => setShortcutsPanelOpen(false)}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Close shortcuts panel"
            >
              ×
            </button>
          </div>
          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 48px)" }}>
            {!shortcutsList || shortcutsList.length === 0 ? (
              <p className="px-4 py-6 text-sm text-sidebar-foreground/50 text-center italic">No shortcuts defined</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {shortcutsList.map((s: { id: number; trigger: string; expansion: string }) => (
                    <tr key={s.id} className="border-b border-sidebar-border/40 last:border-0 hover:bg-sidebar-accent/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-cyan-400 font-semibold whitespace-nowrap w-1/3">{s.trigger}</td>
                      <td className="px-3 py-2.5 text-sidebar-foreground/80 leading-snug">{s.expansion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
