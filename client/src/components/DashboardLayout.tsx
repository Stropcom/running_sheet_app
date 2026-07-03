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
import { FileText, ScrollText, Users, PanelLeft, LogOut, ShieldCheck, Crown, Eye, UserCircle, User, Sun, Moon, ClipboardList, Zap, FolderSearch, ClipboardCheck, BookOpen, Scale, FolderOpen, ChevronDown, ChevronRight, CalendarDays, Shield, ClipboardCheck as GovIcon, Network } from "lucide-react";
import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

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
  const govCount = governanceTodo?.filter(g => !g.allSigned).length ?? 0;
  const todoCount = certifyCount + govCount;

  const [courtExpanded, setCourtExpanded] = useState(() => {
    return location.startsWith("/court");
  });
  const [todoExpanded, setTodoExpanded] = useState(() => {
    return location === "/todo" || location === "/todo/governance";
  });


  const menuItems = [
    { icon: FileText, label: "Operations", path: "/" },
    { icon: ClipboardCheck, label: "Governance", path: "/governance" },
    { icon: CalendarDays, label: "Calendar", path: "/calendar" },
    { icon: Zap, label: "Shortcuts", path: "/shortcuts" },
    { icon: FolderSearch, label: "Intelligence", path: "/intelligence" },
    { icon: BookOpen, label: "Target Registry", path: "/target-registry" },
    { icon: ScrollText, label: "Audit Log", path: "/audit" },
    { icon: User, label: "My Profile", path: "/profile" },
    ...(user?.role === "admin" ? [
      { icon: Users, label: "User Management", path: "/admin" },
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
                const isIntelligenceItem = false;
                // Insert Court folder after Target Registry
                const isAfterTargetRegistry = item.path === "/audit";
                return (
                  <React.Fragment key={item.path}>
                    {isBeforeCalendar && (
                      <SidebarMenuItem key="todo-folder">
                        <SidebarMenuButton
                          isActive={location === "/todo" || location === "/todo/governance"}
                          onClick={() => setTodoExpanded((v) => !v)}
                          tooltip="To-Do"
                          className="h-10 font-normal transition-all"
                        >
                          <ClipboardList className={`h-4 w-4 ${todoCount > 0 ? "text-blue-400" : location === "/todo" || location === "/todo/governance" ? "text-sidebar-primary" : "text-sidebar-foreground/60"}`} />
                          <span className={`flex-1 ${
                            todoCount > 0 ? "text-blue-300 font-medium" : location === "/todo" || location === "/todo/governance" ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"
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
                    )}

                    {isAfterTargetRegistry && (
                      <SidebarMenuItem key="court-folder">
                        <SidebarMenuButton
                          isActive={location.startsWith("/court")}
                          onClick={() => setCourtExpanded((v) => !v)}
                          tooltip="Court"
                          className="h-10 font-normal transition-all"
                        >
                          <Scale className={`h-4 w-4 ${location.startsWith("/court") ? "text-sidebar-primary" : "text-sidebar-foreground/60"}`} />
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
                              onClick={() => setLocation("/court/disclosure")}
                              className={`flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors w-full text-left ${
                                location === "/court/disclosure"
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                              Disclosure
                            </button>
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
                          </div>
                        )}
                      </SidebarMenuItem>
                    )}
                    {!isIntelligenceItem && (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-10 font-normal transition-all"
                        >
                          <item.icon className={`h-4 w-4 ${
                            (item as any).badge > 0 ? "text-blue-400" : isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                          }`} />
                          <span className={`flex-1 ${
                            (item as any).badge > 0 ? "text-blue-300 font-medium" : isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"
                          }`}>
                            {(item as any).badgeLabel ?? item.label}
                          </span>
                          {(item as any).badge > 0 && !isCollapsed && (
                            <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400">
                              {(item as any).badge}
                            </span>
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
          </div>
        )}
        <main className="flex-1 min-h-screen bg-background">{children}</main>
      </SidebarInset>
    </>
  );
}
