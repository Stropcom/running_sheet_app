// Part of the side menu (client/src/components/DashboardLayout.tsx): the sidebar's tile view: a tile, its menu, and the Administration and User Management tiles.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { isOpManagerPath } from "@shared/rosterMenu";
import { useCommandFeatures } from "@/lib/commandFeatures";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  ScrollText,
  Users,
  ShieldCheck,
  Eye,
  User,
  ClipboardList,
  Zap,
  FolderSearch,
  ClipboardCheck,
  BookOpen,
  Scale,
  FolderOpen,
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
  GripVertical,
  Image,
  Link2,
  FileEdit,
  Wrench,
  Binoculars,
  TrendingUp,
  ShieldAlert,
  Database,
  Car,
  BookText,
} from "lucide-react";
import React from "react";
import { isAdministrationPath } from "./navHelpers";

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
      className={`group/tile relative flex w-full flex-col items-center justify-center gap-1.5 h-[84px] rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border transition-all shadow-sm px-1 ${activeBorderClass}`}
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

export function SortableNavTile({
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
    const isActive =
      location === "/governance" || location.startsWith("/governance");
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
      location === "/todo" ||
      location === "/todo/images" ||
      location === "/todo/governance";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="w-full">
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
            <Shield
              className={`h-4 w-4 mr-2 ${certifyCount > 0 ? "text-red-400" : "text-emerald-400"}`}
            />
            Certify
            {certifyCount > 0 && (
              <Badge
                variant="outline"
                className="ml-auto text-[10px] border-red-500/40 bg-red-500/10 text-red-400"
              >
                {certifyCount}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/todo/images")}>
            <Link2
              className={`h-4 w-4 mr-2 ${unlinkedImagesCount > 0 ? "text-amber-400" : "text-emerald-400"}`}
            />
            Link Images
            {unlinkedImagesCount > 0 && (
              <Badge
                variant="outline"
                className="ml-auto text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-400"
              >
                {unlinkedImagesCount}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/todo/governance")}>
            <GovIcon
              className={`h-4 w-4 mr-2 ${govCount > 0 ? "text-blue-400" : "text-emerald-400"}`}
            />
            RS Governance
            {govCount > 0 && (
              <Badge
                variant="outline"
                className="ml-auto text-[10px] border-blue-500/40 bg-blue-500/10 text-blue-400"
              >
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
        icon={<Image className="h-5 w-5 text-cyan-400" />}
        label="Images"
        isActive={location === "/images" || location.startsWith("/images")}
        activeBorderClass="data-[active=true]:border-cyan-400/60"
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
          (location.startsWith("/intelligence") &&
            !location.startsWith("/intelligence/mapping"))
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
        isActive={
          location === "/target-registry" ||
          location.startsWith("/target-registry")
        }
        activeBorderClass="data-[active=true]:border-rose-400/60"
        onClick={() => setLocation("/target-registry")}
      />
    );
  }

  if (id === "operationManager") {
    const isActive = isOpManagerPath(location);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="w-full">
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
          {features.roster && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Users className="h-4 w-4 mr-2 text-purple-500" />
                CTO Roster
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setLocation("/cto-roster")}>
                  <Users className="h-4 w-4 mr-2 text-purple-500" />
                  Main roster
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/cto-roster/my-shifts")}
                >
                  <Users className="h-4 w-4 mr-2 text-purple-500" />
                  My Shifts
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/cto-roster/outlook")}
                >
                  <Binoculars className="h-4 w-4 mr-2 text-purple-500" />
                  Outlook
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Wrench className="h-4 w-4 mr-2 text-purple-500" />
                    Roster tools
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => setLocation("/cto-roster/drafts")}
                    >
                      <FileEdit className="h-4 w-4 mr-2 text-purple-500" />
                      Drafts
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/cto-roster/saved-rosters")}
                    >
                      <BookOpen className="h-4 w-4 mr-2 text-purple-500" />
                      Saved Rosters
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/cto-roster/ea-compliance")}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2 text-purple-500" />
                      EA Compliance
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/cto-roster/audit")}
                    >
                      <ScrollText className="h-4 w-4 mr-2 text-purple-500" />
                      Audit Log
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/cto-roster/members")}
                    >
                      <Users className="h-4 w-4 mr-2 text-purple-500" />
                      Members
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {features.tasking && (
            <DropdownMenuItem onClick={() => setLocation("/operation-manager")}>
              <ClipboardList className="h-4 w-4 mr-2 text-purple-500" />
              CTO Weekly Tasking
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setLocation("/reports/weekly-activity")}
          >
            <TrendingUp className="h-4 w-4 mr-2 text-purple-500" />
            Weekly Activity
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (id === "reports") {
    // Internal id stays "reports" — see the matching comment on the list-view
    // render of this same folder for why (saved sidebar order preservation).
    const isActive =
      location.startsWith("/administration/vehicle-crash") ||
      location.startsWith("/administration/uco-guide") ||
      location.startsWith("/administration/smeac");
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="w-full">
            <NavTileShell
              setNodeRef={setNodeRef}
              style={style}
              gripListeners={gripListeners}
              icon={<BookText className="h-5 w-5 text-indigo-400" />}
              label="Procedures"
              isActive={isActive}
              hasSub
              activeBorderClass="data-[active=true]:border-indigo-400/60"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {features.crash && (
            <DropdownMenuItem
              onClick={() => setLocation("/administration/vehicle-crash")}
            >
              <Car className="h-4 w-4 mr-2 text-indigo-400" />
              Vehicle Crash
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setLocation("/administration/uco-guide")}
          >
            <Eye className="h-4 w-4 mr-2 text-indigo-400" />
            UCO Guide
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setLocation("/administration/smeac")}
          >
            <ShieldAlert className="h-4 w-4 mr-2 text-indigo-400" />
            SMEAC Briefings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (id === "court") {
    const isActive = location.startsWith("/court");
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="w-full">
            <NavTileShell
              setNodeRef={setNodeRef}
              style={style}
              gripListeners={gripListeners}
              icon={<Scale className="h-5 w-5 text-amber-400" />}
              label="Court"
              isActive={isActive}
              hasSub
              activeBorderClass="data-[active=true]:border-amber-400/60"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setLocation("/court/statements")}>
            <FolderOpen className="h-4 w-4 mr-2 text-amber-400" />
            Statements
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/court/witness-list")}>
            <FolderOpen className="h-4 w-4 mr-2 text-amber-400" />
            Witness List
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/court/wipc")}>
            <ShieldCheck className="h-4 w-4 mr-2 text-amber-400" />
            WIPC
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return null;
}

// Administration and User Management aren't part of the draggable navOrder
// list (same as in list view — they're fixed at the end), so these render as
// plain tiles with no grip handle rather than going through SortableNavTile.
export function AdminNavTile({
  location,
  setLocation,
}: {
  location: string;
  setLocation: (path: string) => void;
}) {
  const isActive = isAdministrationPath(location);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="w-full">
          <NavTileShell
            icon={<Settings className="h-5 w-5 text-emerald-400" />}
            label="Administration"
            isActive={isActive}
            hasSub
            activeBorderClass="data-[active=true]:border-emerald-400/60"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => setLocation("/operation-management")}>
          <ArrowRightLeft className="h-4 w-4 mr-2 text-teal-400" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/audit")}>
          <ScrollText className="h-4 w-4 mr-2 text-fuchsia-400" />
          Audit Log
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/draft")}>
          <WifiOff className="h-4 w-4 mr-2 text-orange-400" />
          Draft Mode
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocation("/administration/intel-export")}
        >
          <Database className="h-4 w-4 mr-2 text-violet-400" />
          Intel Export
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/recycle-bin")}>
          <Trash2 className="h-4 w-4 mr-2 text-red-400" />
          Recycle Bin
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/shortcuts")}>
          <Zap className="h-4 w-4 mr-2 text-yellow-400" />
          Shortcuts
        </DropdownMenuItem>
        {/* Help stays last */}
        <DropdownMenuItem onClick={() => setLocation("/help")}>
          <HelpCircle className="h-4 w-4 mr-2 text-sky-400" />
          Help
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMgmtNavTile({
  setLocation,
  isAdmin,
}: {
  setLocation: (path: string) => void;
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="w-full">
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
          <User className="h-4 w-4 mr-2 text-blue-400" />
          My Profile
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => setLocation("/admin")}>
            <Users className="h-4 w-4 mr-2 text-blue-400" />
            Access Management
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
