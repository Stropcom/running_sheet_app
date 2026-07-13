/**
 * TileHomeScreen — 3-row draggable tile layout
 *
 * Row 1: 2 large tiles (full info)
 * Row 2: 4 medium tiles (icon + name + badge)
 * Row 3: 4 medium tiles (icon + name + badge)
 *
 * Dragging a tile to row 1 makes it large; rows 2/3 are medium.
 * Layout is persisted per-user via trpc.sidebar.setHomePrefs.
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
} from "lucide-react";

// ─── Tile config ──────────────────────────────────────────────────────────────

const TILE_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    route: string;
  }
> = {
  operations: {
    label: "Operations",
    icon: FileText,
    color: "text-blue-700",
    bgColor: "bg-blue-700/10",
    borderColor: "border-blue-700/30",
    route: "/",
  },
  governance: {
    label: "Governance",
    icon: ClipboardCheck,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
    borderColor: "border-purple-400/30",
    route: "/governance",
  },
  todo: {
    label: "To-Do",
    icon: ClipboardList,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    borderColor: "border-red-400/30",
    route: "/todo",
  },
  mapping: {
    label: "Mapping",
    icon: Map,
    color: "text-teal-400",
    bgColor: "bg-teal-400/10",
    borderColor: "border-teal-400/30",
    route: "/intelligence/mapping",
  },
  calendar: {
    label: "Calendar",
    icon: CalendarDays,
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
    borderColor: "border-orange-400/30",
    route: "/calendar",
  },
  shortcuts: {
    label: "Shortcuts",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/30",
    route: "/shortcuts",
  },
  intelligence: {
    label: "Intelligence",
    icon: FolderSearch,
    color: "text-violet-400",
    bgColor: "bg-violet-400/10",
    borderColor: "border-violet-400/30",
    route: "/intelligence",
  },
  targetRegistry: {
    label: "Target Registry",
    icon: BookOpen,
    color: "text-rose-400",
    bgColor: "bg-rose-400/10",
    borderColor: "border-rose-400/30",
    route: "/target-registry",
  },
  administration: {
    label: "Administration",
    icon: Settings,
    color: "text-slate-400",
    bgColor: "bg-slate-400/10",
    borderColor: "border-slate-400/30",
    route: "/court",
  },
  userManagement: {
    label: "User Management",
    icon: Users,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
    borderColor: "border-cyan-400/30",
    route: "/user-management",
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
  "calendar",
  "shortcuts",
  "userManagement",
];

// ─── Live badge data hook ─────────────────────────────────────────────────────

function useTileBadges() {
  const { data: operations } = trpc.operation.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: outstanding } = trpc.sheet.outstandingForMe.useQuery(undefined, { staleTime: 30_000 });
  const { data: governanceTodo } = trpc.sheet.governanceTodo.useQuery(undefined, { staleTime: 30_000 });
  const { data: allTargets } = trpc.target.listAll.useQuery(undefined, { staleTime: 60_000 });
  const { data: calendarEvents } = trpc.calendar.events.useQuery(undefined, { staleTime: 60_000 });

  const certifyCount = outstanding?.length ?? 0;
  const govCount = governanceTodo?.filter((g: any) => g.outstanding.length > 0).length ?? 0;
  const todoCount = certifyCount + govCount;
  const activeOps = operations?.filter((o: any) => !o.closedAt)?.length ?? 0;
  const totalOps = operations?.length ?? 0;
  const targetCount = allTargets?.length ?? 0;
  const upcomingEvents = calendarEvents?.filter((e: any) => {
    const now = Date.now();
    return e.start >= now && e.start <= now + 7 * 24 * 60 * 60 * 1000;
  }).length ?? 0;

  return {
    operations: { badge: activeOps > 0 ? activeOps : null, subtitle: `${activeOps} active · ${totalOps} total` },
    governance: { badge: null, subtitle: "Authorisation & compliance" },
    todo: { badge: todoCount > 0 ? todoCount : null, subtitle: `${certifyCount} to certify · ${govCount} governance` },
    mapping: { badge: null, subtitle: "Intelligence mapping" },
    calendar: { badge: upcomingEvents > 0 ? upcomingEvents : null, subtitle: `${upcomingEvents} events this week` },
    shortcuts: { badge: null, subtitle: "Text expansion shortcuts" },
    intelligence: { badge: targetCount > 0 ? targetCount : null, subtitle: `${targetCount} entities tracked` },
    targetRegistry: { badge: targetCount > 0 ? targetCount : null, subtitle: `${targetCount} registered targets` },
    administration: { badge: null, subtitle: "Reports & system settings" },
    userManagement: { badge: null, subtitle: "Users, roles & access" },
  } as Record<string, { badge: number | null; subtitle: string }>;
}

// ─── Single tile ─────────────────────────────────────────────────────────────

type TileSize = "large" | "medium";

interface TileProps {
  id: string;
  size: TileSize;
  badge?: number | null;
  subtitle?: string;
  isDragging?: boolean;
  onClick?: () => void;
}

function TileContent({ id, size, badge, subtitle, isDragging }: TileProps) {
  const cfg = TILE_CONFIG[id];
  if (!cfg) return null;
  const Icon = cfg.icon;

  if (size === "large") {
    return (
      <div
        className={`
          relative flex flex-col justify-between h-full p-5 rounded-2xl border
          ${cfg.bgColor} ${cfg.borderColor}
          transition-all duration-200
          ${isDragging ? "opacity-50 scale-95" : "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"}
          cursor-pointer select-none overflow-hidden
        `}
      >
        {/* Grip hint */}
        <div className="absolute top-3 right-3 opacity-20">
          <GripVertical className="h-4 w-4 text-foreground" />
        </div>

        {/* Badge */}
        {badge != null && badge > 0 && (
          <span className={`absolute top-3 left-3 inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-xs font-bold ${cfg.color} bg-current/20 border border-current/30`}
            style={{ color: "inherit" }}
          >
            <span className={cfg.color}>{badge}</span>
          </span>
        )}

        <div className="flex flex-col gap-3 mt-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${cfg.bgColor} border ${cfg.borderColor}`}>
            <Icon className={`h-6 w-6 ${cfg.color}`} />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">{cfg.label}</p>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Medium
  return (
    <div
      className={`
        relative flex flex-col items-center justify-center gap-2 h-full p-4 rounded-2xl border
        ${cfg.bgColor} ${cfg.borderColor}
        transition-all duration-200
        ${isDragging ? "opacity-50 scale-95" : "hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"}
        cursor-pointer select-none
      `}
    >
      {/* Grip hint */}
      <div className="absolute top-2 right-2 opacity-20">
        <GripVertical className="h-3 w-3 text-foreground" />
      </div>

      {/* Badge */}
      {badge != null && badge > 0 && (
        <span className={`absolute top-2 left-2 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold ${cfg.color}`}
          style={{ background: "currentColor" }}
        >
          <span className="text-white">{badge}</span>
        </span>
      )}

      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bgColor} border ${cfg.borderColor}`}>
        <Icon className={`h-5 w-5 ${cfg.color}`} />
      </div>
      <p className="text-sm font-medium text-foreground text-center leading-tight">{cfg.label}</p>
    </div>
  );
}

// ─── Sortable tile wrapper ────────────────────────────────────────────────────

interface SortableTileProps extends TileProps {
  size: TileSize;
}

function SortableTile({ id, size, badge, subtitle }: SortableTileProps) {
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
      className={`touch-none ${size === "large" ? "h-44" : "h-32"}`}
      onClick={() => {
        if (!isDragging && cfg) setLocation(cfg.route);
      }}
    >
      <TileContent id={id} size={size} badge={badge} subtitle={subtitle} isDragging={isDragging} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TileHomeScreen() {
  const [tileOrder, setTileOrder] = useState<string[]>(DEFAULT_TILE_ORDER);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const badges = useTileBadges();

  const { data: homePrefs } = trpc.sidebar.getHomePrefs.useQuery(undefined, { staleTime: Infinity });
  const setHomePrefsMutation = trpc.sidebar.setHomePrefs.useMutation();

  useEffect(() => {
    if (homePrefs?.tileOrder && homePrefs.tileOrder.length >= 10) {
      // Ensure all known keys are present (handle new tiles added later)
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

  // Split into rows: [0,1] large, [2..5] medium, [6..9] medium
  const row1 = tileOrder.slice(0, 2);
  const row2 = tileOrder.slice(2, 6);
  const row3 = tileOrder.slice(6, 10);
  const overflow = tileOrder.slice(10); // future-proof

  const tileSize = (id: string): TileSize => (row1.includes(id) ? "large" : "medium");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Home</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Hold and drag any tile to rearrange. Tiles in the top row show more detail.</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveDragId(e.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <SortableContext items={tileOrder} strategy={rectSortingStrategy}>
          {/* Row 1 — 2 large tiles */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {row1.map((id) => (
              <SortableTile
                key={id}
                id={id}
                size="large"
                badge={badges[id]?.badge}
                subtitle={badges[id]?.subtitle}
              />
            ))}
          </div>

          {/* Row 2 — 4 medium tiles */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            {row2.map((id) => (
              <SortableTile
                key={id}
                id={id}
                size="medium"
                badge={badges[id]?.badge}
                subtitle={badges[id]?.subtitle}
              />
            ))}
          </div>

          {/* Row 3 — 4 medium tiles */}
          <div className="grid grid-cols-4 gap-3">
            {row3.map((id) => (
              <SortableTile
                key={id}
                id={id}
                size="medium"
                badge={badges[id]?.badge}
                subtitle={badges[id]?.subtitle}
              />
            ))}
          </div>

          {/* Overflow row — any extra tiles beyond 10 */}
          {overflow.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mt-3">
              {overflow.map((id) => (
                <SortableTile
                  key={id}
                  id={id}
                  size="medium"
                  badge={badges[id]?.badge}
                  subtitle={badges[id]?.subtitle}
                />
              ))}
            </div>
          )}
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragId ? (
            <div className={tileSize(activeDragId) === "large" ? "h-44 w-full opacity-90" : "h-32 w-full opacity-90"}>
              <TileContent
                id={activeDragId}
                size={tileSize(activeDragId)}
                badge={badges[activeDragId]?.badge}
                subtitle={badges[activeDragId]?.subtitle}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
