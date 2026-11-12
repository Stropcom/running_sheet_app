// Part of the side menu (client/src/components/DashboardLayout.tsx): a sidebar item in the folder view (sortable, with its folder of children).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { isOpManagerPath, isProceduresPath } from "@shared/rosterMenu";
import { useCommandFeatures } from "@/lib/commandFeatures";
import {} from "@/lib/trpc";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  FileText,
  ScrollText,
  Users,
  ShieldCheck,
  Eye,
  ClipboardList,
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
  GripVertical,
  Image,
  Link2,
  FileEdit,
  Wrench,
  Binoculars,
  TrendingUp,
  ShieldAlert,
  Car,
  BookText,
} from "lucide-react";
import React from "react";
import type { SortableNavItemProps } from "./types";
import { scrollToggleNearTop } from "./navHelpers";

export function SortableNavItem({
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
  rosterToolsExpanded,
  setRosterToolsExpanded,
  reportsExpanded,
  setReportsExpanded,
  courtExpanded,
  setCourtExpanded,
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
  const features = useCommandFeatures();
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
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-cyan-400/50 shadow-sm"
        >
          <Image className="h-4 w-4 text-cyan-400" />
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
    const opManagerActive = isOpManagerPath(location);
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
            {features.roster && (
              <>
                {/* CTO Roster opens the main roster page; the arrow folds the
                    pages under it. */}
                <div className="flex items-stretch gap-0.5">
                  <button
                    data-nav-toggle="cto-roster"
                    onClick={e => {
                      setLocation("/cto-roster");
                      if (!ctoRosterSubExpanded) {
                        setCtoRosterSubExpanded(true);
                        scrollToggleNearTop(
                          sidebarScrollRef.current,
                          e.currentTarget
                        );
                      }
                    }}
                    className={subItemClass(location === "/cto-roster")}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                    <span className="flex-1">CTO Roster</span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      ctoRosterSubExpanded
                        ? "Fold away CTO Roster pages"
                        : "Show CTO Roster pages"
                    }
                    aria-expanded={ctoRosterSubExpanded}
                    onClick={() => setCtoRosterSubExpanded(v => !v)}
                    className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  >
                    {ctoRosterSubExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                </div>
                {ctoRosterSubExpanded && (
                  <div className="ml-4 border-l border-sidebar-border/40 pl-3 flex flex-col gap-0.5 mb-0.5">
                    <button
                      onClick={() => setLocation("/cto-roster/my-shifts")}
                      className={subItemClass(
                        location === "/cto-roster/my-shifts"
                      )}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                      My Shifts
                    </button>
                    <button
                      onClick={() => setLocation("/cto-roster/outlook")}
                      className={subItemClass(
                        location === "/cto-roster/outlook"
                      )}
                    >
                      <Binoculars className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                      Outlook
                    </button>
                    {/* Roster tools: folded away unless you are on one of them */}
                    <button
                      type="button"
                      aria-expanded={rosterToolsExpanded}
                      onClick={() => setRosterToolsExpanded(v => !v)}
                      className={subItemClass(false)}
                    >
                      <Wrench className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                      <span className="flex-1">Roster tools</span>
                      {rosterToolsExpanded ? (
                        <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-sidebar-foreground/40" />
                      )}
                    </button>
                    {rosterToolsExpanded && (
                      <div className="ml-4 border-l border-sidebar-border/40 pl-3 flex flex-col gap-0.5 mb-0.5">
                        <button
                          onClick={() => setLocation("/cto-roster/drafts")}
                          className={subItemClass(
                            location.startsWith("/cto-roster/draft")
                          )}
                        >
                          <FileEdit className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                          Drafts
                        </button>
                        <button
                          onClick={() =>
                            setLocation("/cto-roster/saved-rosters")
                          }
                          className={subItemClass(
                            location.startsWith("/cto-roster/saved-roster")
                          )}
                        >
                          <BookOpen className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                          Saved Rosters
                        </button>
                        <button
                          onClick={() =>
                            setLocation("/cto-roster/ea-compliance")
                          }
                          className={subItemClass(
                            location === "/cto-roster/ea-compliance"
                          )}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                          EA Compliance
                        </button>
                        <button
                          onClick={() => setLocation("/cto-roster/audit")}
                          className={subItemClass(
                            location === "/cto-roster/audit"
                          )}
                        >
                          <ScrollText className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                          Audit Log
                        </button>
                        <button
                          onClick={() => setLocation("/cto-roster/members")}
                          className={subItemClass(
                            location === "/cto-roster/members"
                          )}
                        >
                          <Users className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                          Members
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {features.tasking && (
              <button
                onClick={() => setLocation("/operation-manager")}
                className={subItemClass(
                  location.startsWith("/operation-manager")
                )}
              >
                <ClipboardList className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                CTO Weekly Tasking
              </button>
            )}
            <button
              onClick={() => setLocation("/reports/weekly-activity")}
              className={subItemClass(location === "/reports/weekly-activity")}
            >
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-purple-500" />
              Weekly Activity
            </button>
          </div>
        )}
      </SidebarMenuItem>
    );
  }

  if (id === "reports") {
    // Internal id stays "reports" (not renamed to "procedures") even though
    // this folder now shows "Procedures" — a user's saved sidebar order
    // (trpc.sidebar router) is a list of these id strings, and renaming the
    // id would drop it out of DEFAULT_NAV_ORDER's merge check and silently
    // bump it to the end of any already-customised order. See where this id
    // is used in Outstanding Actions/Weekly Activity's move to Op Manager
    // above, and Vehicle Crash/UCO Guide/SMEAC Briefings' move from
    // Administration below, for the rest of this folder's rename.
    const isActive = isProceduresPath(location);
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={isActive}
          onClick={e => {
            const willExpand = !reportsExpanded;
            setReportsExpanded(v => !v);
            if (willExpand)
              scrollToggleNearTop(sidebarScrollRef.current, e.currentTarget);
          }}
          tooltip="Procedures"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-indigo-400/50 shadow-sm"
        >
          <BookText className="h-4 w-4 text-indigo-400" />
          <span
            className={`flex-1 ${isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Procedures
          </span>
          {!isCollapsed &&
            (reportsExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ))}
          {gripHandle}
        </SidebarMenuButton>
        {reportsExpanded && !isCollapsed && (
          <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
            {features.crash && (
              <button
                onClick={() => setLocation("/administration/vehicle-crash")}
                className={subItemClass(
                  location.startsWith("/administration/vehicle-crash")
                )}
              >
                <Car className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                Vehicle Crash
              </button>
            )}
            <button
              onClick={() => setLocation("/administration/uco-guide")}
              className={subItemClass(
                location.startsWith("/administration/uco-guide")
              )}
            >
              <Eye className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              UCO Guide
            </button>
            <button
              onClick={() => setLocation("/administration/smeac")}
              className={subItemClass(
                location.startsWith("/administration/smeac")
              )}
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              SMEAC Briefings
            </button>
          </div>
        )}
      </SidebarMenuItem>
    );
  }

  if (id === "court") {
    const isActive = location.startsWith("/court");
    return (
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          isActive={isActive}
          onClick={e => {
            const willExpand = !courtExpanded;
            setCourtExpanded(v => !v);
            if (willExpand)
              scrollToggleNearTop(sidebarScrollRef.current, e.currentTarget);
          }}
          tooltip="Court"
          className="h-14 font-normal transition-all rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:border-amber-400/50 shadow-sm"
        >
          <Scale className="h-4 w-4 text-amber-400" />
          <span
            className={`flex-1 ${isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}
          >
            Court
          </span>
          {!isCollapsed &&
            (courtExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 ml-1" />
            ))}
          {gripHandle}
        </SidebarMenuButton>
        {courtExpanded && !isCollapsed && (
          <div className="ml-4 mt-0.5 mb-0.5 border-l border-sidebar-border/50 pl-3 flex flex-col gap-0.5">
            <button
              onClick={() => setLocation("/court/statements")}
              className={subItemClass(location === "/court/statements")}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              Statements
            </button>
            <button
              onClick={() => setLocation("/court/witness-list")}
              className={subItemClass(location === "/court/witness-list")}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
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
      </SidebarMenuItem>
    );
  }

  return null;
}
