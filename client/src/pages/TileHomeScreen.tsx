/**
 * TileHomeScreen — 3-row draggable tile layout
 * Row 1: 2 large tiles (full info)
 * Row 2: 4 medium tiles
 * Row 3: 4 medium tiles
 */

import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  ClipboardCheck,
  ClipboardList,
  Map,
  CalendarDays,
  Zap,
  FolderSearch,
  BookOpen,
  Settings,
  Users,
  GripVertical,
  List,
  ShieldCheck,
  ChevronRight,
  Image,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Tile config ──────────────────────────────────────────────────────────────

const TILE_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    accentColor: string;
    route: string;
  }
> = {
  operations: {
    label: "Operations",
    icon: FileText,
    color: "text-blue-700",
    bgColor: "bg-blue-700/10",
    borderColor: "border-blue-700/30",
    accentColor: "#1d4ed8",
    route: "/",
  },
  governance: {
    label: "Governance",
    icon: ClipboardCheck,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    accentColor: "#a855f7",
    route: "/governance",
  },
  todo: {
    label: "To-Do",
    icon: ClipboardList,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    accentColor: "#ef4444",
    route: "/todo",
  },
  mapping: {
    label: "Mapping",
    icon: Map,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/30",
    accentColor: "#14b8a6",
    route: "/intelligence/mapping",
  },
  images: {
    label: "Images",
    icon: Image,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/30",
    accentColor: "#ec4899",
    route: "/images",
  },
  calendar: {
    label: "Calendar",
    icon: CalendarDays,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    accentColor: "#f97316",
    route: "/calendar",
  },
  shortcuts: {
    label: "Shortcuts",
    icon: Zap,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    accentColor: "#eab308",
    route: "/shortcuts",
  },
  intelligence: {
    label: "Intelligence",
    icon: FolderSearch,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    accentColor: "#8b5cf6",
    route: "/intelligence",
  },
  targetRegistry: {
    label: "Target Registry",
    icon: BookOpen,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    accentColor: "#f43f5e",
    route: "/target-registry",
  },
  operationManager: {
    label: "Op Manager",
    icon: ClipboardList,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    accentColor: "#a855f7",
    route: "/operation-manager",
  },
  administration: {
    label: "Administration",
    icon: Settings,
    color: "text-slate-500",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/30",
    accentColor: "#64748b",
    route: "/reports",
  },
  userManagement: {
    label: "User Management",
    icon: Users,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    accentColor: "#06b6d4",
    route: "/profile",
  },
};

const DEFAULT_TILE_ORDER = [
  "operations",
  "administration",
  "todo",
  "governance",
  "intelligence",
  "targetRegistry",
  "mapping",
  "images",
  "calendar",
  "shortcuts",
  "userManagement",
  "operationManager",
];

// ─── Live badge data hook ─────────────────────────────────────────────────────

function useTileBadges() {
  const { data: operations } = trpc.operation.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: outstanding } = trpc.sheet.outstandingForMe.useQuery(undefined, { staleTime: 30_000 });
  const { data: governanceTodo } = trpc.sheet.governanceTodo.useQuery(undefined, { staleTime: 30_000 });
  const { data: unlinkedImagesTodo } = trpc.sheet.unlinkedImagesTodo.useQuery(undefined, { staleTime: 30_000 });
  const { data: allTargets } = trpc.target.listAll.useQuery(undefined, { staleTime: 60_000 });
  const { data: calendarEvents } = trpc.calendar.events.useQuery(undefined, { staleTime: 60_000 });

  const certifyCount = outstanding?.length ?? 0;
  const govCount = governanceTodo?.filter((g: any) => g.outstanding.length > 0).length ?? 0;
  const unlinkedImagesCount = unlinkedImagesTodo?.length ?? 0;
  const todoCount = certifyCount + govCount + unlinkedImagesCount;
  const activeOps = operations?.filter((o: any) => o.status === 'active')?.length ?? 0;
  const closedOps = operations?.filter((o: any) => o.status !== 'active')?.length ?? 0;
  const totalOps = operations?.length ?? 0;
  const targetCount = allTargets?.length ?? 0;
  const now = Date.now();
  const upcomingEvents = calendarEvents?.filter((e: any) =>
    e.start >= now && e.start <= now + 7 * 24 * 60 * 60 * 1000
  ).length ?? 0;
  const totalEvents = calendarEvents?.length ?? 0;

  // Count active running sheets (not closed, not deleted)
  const { data: allSheets } = trpc.sheet.list.useQuery(undefined, { staleTime: 30_000 });
  const activeSheets = allSheets?.filter((s: any) => !s.closedAt)?.length ?? 0;

  return {
    operations: {
      badge: activeOps > 0 ? activeOps : null,
      subtitle: `${activeOps} active`,
      stats: [
        { label: "Active", value: String(activeOps) },
        { label: "Running Sheets Active", value: String(activeSheets) },
      ],
    },
    governance: {
      badge: govCount > 0 ? govCount : null,
      subtitle: "Authorisation & compliance",
      stats: [
        { label: "Outstanding", value: String(govCount) },
        { label: "All clear", value: govCount === 0 ? "Yes" : "No" },
      ],
    },
    todo: {
      badge: todoCount > 0 ? todoCount : null,
      subtitle: `${certifyCount} to certify · ${unlinkedImagesCount} to link · ${govCount} governance`,
      stats: [
        { label: "Certify", value: String(certifyCount) },
        { label: "Link Images", value: String(unlinkedImagesCount) },
        { label: "Governance", value: String(govCount) },
        { label: "Total", value: String(todoCount) },
      ],
    },
    mapping: {
      badge: null,
      subtitle: "Intelligence mapping",
      stats: [],
    },
    calendar: {
      badge: upcomingEvents > 0 ? upcomingEvents : null,
      subtitle: `${upcomingEvents} events this week`,
      stats: [
        { label: "This week", value: String(upcomingEvents) },
        { label: "Total", value: String(totalEvents) },
      ],
    },
    shortcuts: {
      badge: null,
      subtitle: "Text expansion shortcuts",
      stats: [],
    },
    intelligence: {
      badge: targetCount > 0 ? targetCount : null,
      subtitle: `${targetCount} entities tracked`,
      stats: [
        { label: "Entities", value: String(targetCount) },
      ],
    },
    targetRegistry: {
      badge: targetCount > 0 ? targetCount : null,
      subtitle: `${targetCount} registered targets`,
      stats: [
        { label: "Targets", value: String(targetCount) },
      ],
    },
    operationManager: {
      badge: null,
      subtitle: "Priority board & tasking",
      stats: [],
    },
    administration: {
      badge: null,
      subtitle: "Reports & system settings",
      stats: [],
    },
    userManagement: {
      badge: null,
      subtitle: "Users, roles & access",
      stats: [],
    },
  } as Record<string, { badge: number | null; subtitle: string; stats: { label: string; value: string }[] }>;
}

// ─── Tile content ─────────────────────────────────────────────────────────────

type TileSize = "large" | "medium";

interface TileContentProps {
  id: string;
  size: TileSize;
  badge?: number | null;
  subtitle?: string;
  stats?: { label: string; value: string }[];
  isDragging?: boolean;
}

function TileContent({ id, size, badge, subtitle, stats, isDragging }: TileContentProps) {
  const cfg = TILE_CONFIG[id];
  if (!cfg) return null;
  const Icon = cfg.icon;

  if (size === "large") {
    return (
      <div
        className={`
          relative flex flex-col h-full rounded-2xl border-2 overflow-hidden
          ${cfg.borderColor} bg-background
          transition-all duration-200
          ${isDragging ? "opacity-50 scale-95" : "hover:shadow-xl active:scale-[0.98]"}
          cursor-pointer select-none
        `}
      >
        {/* Coloured accent strip at top */}
        <div className="h-1.5 w-full" style={{ backgroundColor: cfg.accentColor }} />

        <div className="flex flex-col flex-1 p-5">
          {/* Top row: icon + badge */}
          <div className="flex items-start justify-between mb-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${cfg.bgColor} border ${cfg.borderColor}`}>
              <Icon className={`h-5 w-5 ${cfg.color}`} />
            </div>
            <div className="flex items-center gap-2">
              {badge != null && badge > 0 && (
                <span
                  className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: cfg.accentColor }}
                >
                  {badge}
                </span>
              )}
              <GripVertical className="h-4 w-4 text-muted-foreground/30" />
            </div>
          </div>

          {/* Title + subtitle */}
          <p className="text-base font-bold text-foreground leading-tight">{cfg.label}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{subtitle}</p>}

          {/* Stats row */}
          {stats && stats.length > 0 && (
            <div className="mt-auto flex gap-3 pt-3 border-t border-border/50">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col">
                  <span className="text-lg font-bold text-foreground leading-none">{s.value}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Arrow hint */}
          <div className="absolute bottom-4 right-4 opacity-20">
            <ChevronRight className="h-4 w-4 text-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // Medium
  return (
    <div
      className={`
        relative flex flex-col items-center justify-center gap-2 h-full rounded-2xl border-2 overflow-hidden
        ${cfg.borderColor} bg-background
        transition-all duration-200
        ${isDragging ? "opacity-50 scale-95" : "hover:shadow-lg active:scale-[0.98]"}
        cursor-pointer select-none
      `}
    >
      {/* Coloured accent strip */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: cfg.accentColor }} />

      {/* Badge */}
      {badge != null && badge > 0 && (
        <span
          className="absolute top-3 right-3 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: cfg.accentColor }}
        >
          {badge}
        </span>
      )}

      {/* Grip */}
      <div className="absolute top-3 left-3 opacity-15">
        <GripVertical className="h-3 w-3 text-foreground" />
      </div>

      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bgColor} border ${cfg.borderColor} mt-2`}>
        <Icon className={`h-5 w-5 ${cfg.color}`} />
      </div>
      <p className="text-sm font-semibold text-foreground text-center leading-tight px-2">{cfg.label}</p>
    </div>
  );
}

// ─── Sortable tile wrapper ────────────────────────────────────────────────────

interface SortableTileProps {
  id: string;
  size: TileSize;
  badge?: number | null;
  subtitle?: string;
  stats?: { label: string; value: string }[];
}

function SortableTile({ id, size, badge, subtitle, stats }: SortableTileProps) {
  const [, setLocation] = useLocation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const cfg = TILE_CONFIG[id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-none ${size === "large" ? "h-44 sm:h-52" : "h-28 sm:h-32"}`}
      onClick={() => {
        if (!isDragging && cfg) setLocation(cfg.route);
      }}
    >
      <TileContent id={id} size={size} badge={badge} subtitle={subtitle} stats={stats} isDragging={isDragging} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TileHomeScreen() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [tileOrder, setTileOrder] = useState<string[]>(DEFAULT_TILE_ORDER);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const badges = useTileBadges();

  const { data: homePrefs } = trpc.sidebar.getHomePrefs.useQuery(undefined, { staleTime: Infinity });
  const utils = trpc.useUtils();
  const setHomePrefsMutation = trpc.sidebar.setHomePrefs.useMutation({
    onSuccess: () => utils.sidebar.getHomePrefs.invalidate(),
  });

  // Current date/time display
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    if (homePrefs?.tileOrder && (homePrefs.tileOrder as string[]).length >= 10) {
      const saved = homePrefs.tileOrder as string[];
      const allKeys = Object.keys(TILE_CONFIG);
      const merged = [...saved.filter((k) => allKeys.includes(k))];
      for (const k of allKeys) {
        if (!merged.includes(k)) merged.push(k);
      }
      setTileOrder(merged);
    }
  }, [homePrefs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = tileOrder.indexOf(active.id as string);
    const newIndex = tileOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(tileOrder, oldIndex, newIndex);
    setTileOrder(newOrder);
    setHomePrefsMutation.mutate({ tileOrder: newOrder });
  }

  function switchToFolderView() {
    setHomePrefsMutation.mutate({ mode: "folder" });
    setLocation("/");
  }

  const row1 = tileOrder.slice(0, 2);
  const row2 = tileOrder.slice(2, 6);
  const row3 = tileOrder.slice(6, 10);
  const overflow = tileOrder.slice(10);

  const tileSize = (id: string): TileSize => (row1.includes(id) ? "large" : "medium");

  return (
    <div className="min-h-full bg-background">
      {/* ── Page header ── */}
      <div className="border-b border-border bg-card px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-700/10 border border-blue-700/30 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">
                RunLog Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">{user?.name ? `${user.name.split(" ")[0]} · ` : ""}{dateStr} · {timeStr}</p>
            </div>
          </div>

          {/* Switch to folder view */}
          <button
            onClick={switchToFolderView}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            title="Switch to Folders"
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Folders</span>
          </button>
        </div>
      </div>

      {/* ── Tile grid ── */}
      <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto">
        {/* Outer frame */}
        <div className="rounded-2xl border-2 border-border bg-card/50 p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dashboard</p>
            <p className="text-xs text-muted-foreground hidden sm:block">Hold &amp; drag to rearrange · Top row shows full detail</p>
            <p className="text-xs text-muted-foreground sm:hidden">Hold &amp; drag to reorder</p>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveDragId(e.active.id as string)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext items={tileOrder} strategy={rectSortingStrategy}>
              {/* Row 1 — 1 col on xs, 2 large tiles on sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {row1.map((id) => (
                  <SortableTile
                    key={id}
                    id={id}
                    size="large"
                    badge={badges[id]?.badge}
                    subtitle={badges[id]?.subtitle}
                    stats={badges[id]?.stats}
                  />
                ))}
              </div>

              {/* Row 2 — 2 cols on mobile, 4 on desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {row2.map((id) => (
                  <SortableTile
                    key={id}
                    id={id}
                    size="medium"
                    badge={badges[id]?.badge}
                    subtitle={badges[id]?.subtitle}
                    stats={badges[id]?.stats}
                  />
                ))}
              </div>

              {/* Row 3 — 2 cols on mobile, 4 on desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {row3.map((id) => (
                  <SortableTile
                    key={id}
                    id={id}
                    size="medium"
                    badge={badges[id]?.badge}
                    subtitle={badges[id]?.subtitle}
                    stats={badges[id]?.stats}
                  />
                ))}
              </div>

              {/* Overflow */}
              {overflow.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {overflow.map((id) => (
                    <SortableTile
                      key={id}
                      id={id}
                      size="medium"
                      badge={badges[id]?.badge}
                      subtitle={badges[id]?.subtitle}
                      stats={badges[id]?.stats}
                    />
                  ))}
                </div>
              )}
            </SortableContext>

            {/* Drag overlay */}
            <DragOverlay>
              {activeDragId ? (
                <div className={tileSize(activeDragId) === "large" ? "h-52 w-full opacity-90" : "h-32 w-full opacity-90"}>
                  <TileContent
                    id={activeDragId}
                    size={tileSize(activeDragId)}
                    badge={badges[activeDragId]?.badge}
                    subtitle={badges[activeDragId]?.subtitle}
                    stats={badges[activeDragId]?.stats}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
