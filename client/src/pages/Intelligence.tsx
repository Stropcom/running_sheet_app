import { ClearInputButton } from "@/components/ClearInputButton";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/useMobile";
import { Search, MapPin, ChevronRight, FileText, Camera } from "lucide-react";
import { useViewMode } from "@/contexts/ViewModeContext";
import { formatIntelVehicle } from "@/lib/addressFormat";
import { RegionSearchButton } from "@/components/RegionSearch";
import { IndicesBadge } from "@/components/IndicesBadge";
import IntelligenceHeatMap from "@/pages/IntelligenceHeatMap";
import IntelligencePatternOfLife from "@/pages/IntelligencePatternOfLife";
import EgoNetworkMap from "@/pages/EgoNetworkMap";
import IntelligenceDayRoute from "@/pages/IntelligenceDayRoute";
import IntelligencePlaces from "@/pages/IntelligencePlaces";
import IntelPackages from "@/pages/IntelPackages";
import type {
  TabView,
  SavedIntelView,
  Entity,
  DatePreset,
} from "./intelligence/types";
import {
  INTEL_TABS,
  readIntelView,
  writeIntelView,
} from "./intelligence/viewState";
import {
  placeLabel,
  TYPE_LABELS,
  TYPE_ICONS,
  TARGET_COLOR,
  TYPE_COLORS,
  uniqueSheets,
  deriveVehicleMake,
  deriveSuburb,
  getPrimaryOperationName,
  presetToRange,
} from "./intelligence/helpers";
import { ProfileDialog } from "./intelligence/ProfileDialog";
import { OperationsTab } from "./intelligence/OperationsTab";
import {
  ENTITY_TAB_OPTIONS,
  REPORT_TAB_OPTIONS,
  TAB_OPTIONS,
  ENTITY_TAB_COLORS,
} from "./intelligence/tabOptions";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const { viewMode } = useViewMode();
  const { data: entities, isLoading } =
    trpc.intelligence.getEntities.useQuery();
  const { data: allOps } = trpc.operation.list.useQuery();
  const { data: entityLinkCounts } =
    trpc.attachment.entityLinkCounts.useQuery();
  const photoCountByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of entityLinkCounts ?? []) {
      const key =
        l.category === "target"
          ? `target::${l.targetId}`
          : `${l.category}::${l.entityKey}`;
      map.set(key, l.count);
    }
    return map;
  }, [entityLinkCounts]);
  const photoCountForEntity = (entity: {
    isTarget?: boolean;
    targetId?: number | null;
    type: string;
    shortForm: string;
  }): number => {
    const key =
      entity.isTarget && entity.targetId
        ? `target::${entity.targetId}`
        : `${entity.type === "vehicle" ? "vehicle" : entity.type === "address" || entity.type === "business" ? "location" : "associate"}::${entity.shortForm.toLowerCase().replace(/\s+/g, " ").trim()}`;
    return photoCountByKey.get(key) ?? 0;
  };
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  // Deep link support for "View on Ego Network" (e.g. from a Running Sheet
  // page): ?tab=egonet&operationId=X&sheetId=Y opens straight into the Ego
  // Network tab, pre-scoped. Read once on mount via the lazy initializers
  // below — not tracked afterwards, so navigating away and using the tabs
  // normally doesn't fight with a stale query string.
  const routeSearch = useSearch();
  const [deepLinkTab] = useState(() =>
    new URLSearchParams(routeSearch).get("tab")
  );
  const [deepLinkOperationId] = useState<number | null>(() => {
    const raw = new URLSearchParams(routeSearch).get("operationId");
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [deepLinkSheetId] = useState<number | null>(() => {
    const raw = new URLSearchParams(routeSearch).get("sheetId");
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  // Where the officer left the list last time (ignored for a deep link,
  // which says exactly where to open).
  const savedView = useMemo<SavedIntelView>(
    () => (deepLinkTab ? {} : readIntelView()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [activeTab, setActiveTab] = useState<TabView>(
    deepLinkTab === "egonet"
      ? "egonet"
      : savedView.tab && INTEL_TABS.includes(savedView.tab)
        ? (savedView.tab as TabView)
        : "operations"
  );
  const [search, setSearch] = useState(savedView.search ?? "");
  // The map tabs render a full-bleed canvas with their own filter chrome and
  // their own data fetch — none of the entity-list scaffolding (search/sort
  // bar, skeleton loader, entity grid) applies to them. Kept as one derived
  // flag so adding another map tab can't leave one of those behind it.
  // Full-bleed tabs that bring their own chrome and data fetching — none of
  // the entity-list scaffolding (search/sort bar, skeleton, entity grid)
  // applies to them.
  const isMapTab =
    activeTab === "heatmap" ||
    activeTab === "places" ||
    activeTab === "dayRoute" ||
    activeTab === "patternOfLife" ||
    activeTab === "egonet" ||
    activeTab === "packages";
  const [selected, setSelected] = useState<Entity | null>(null);

  // Date filter state
  const [datePreset, setDatePreset] = useState<DatePreset>(
    (["all", "1w", "1m", "3m", "6m", "custom"] as const).find(
      d => d === savedView.datePreset
    ) ?? "all"
  );
  const [customFrom, setCustomFrom] = useState(savedView.customFrom ?? "");
  const [customTo, setCustomTo] = useState(savedView.customTo ?? "");

  // Sort order (entity tabs) — "operation"/"surname" apply to Targets and
  // Associates, "make" to Vehicles, "suburb" to Locations (see the sort pill
  // row below, which only shows the options relevant to the active tab).
  type SortOrder =
    | "frequency"
    | "az"
    | "za"
    | "recent"
    | "oldest"
    | "operation"
    | "surname"
    | "make"
    | "suburb";
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (
      [
        "frequency",
        "az",
        "za",
        "recent",
        "oldest",
        "operation",
        "surname",
        "make",
        "suburb",
      ] as const
    ).find(o => o === savedView.sortOrder) ?? "recent"
  );

  // Sort order (operations tab)
  type OpSortOrder = "az" | "recent";
  const [opSortOrder, setOpSortOrder] = useState<OpSortOrder>(
    savedView.opSortOrder === "az" ? "az" : "recent"
  );

  // Operation filter (Targets/Associates/Vehicles/Locations tabs) — null = all operations.
  const [filterOperationId, setFilterOperationId] = useState<number | null>(
    typeof savedView.filterOperationId === "number"
      ? savedView.filterOperationId
      : null
  );

  // Keep the saved view in step, and the scroll position per tab (the page
  // scrolls inside <main class="app-canvas">).
  useEffect(() => {
    writeIntelView({
      tab: activeTab,
      search,
      datePreset,
      customFrom,
      customTo,
      sortOrder,
      opSortOrder,
      filterOperationId,
    });
  }, [
    activeTab,
    search,
    datePreset,
    customFrom,
    customTo,
    sortOrder,
    opSortOrder,
    filterOperationId,
  ]);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  useEffect(() => {
    const main = document.querySelector("main.app-canvas");
    if (!main) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writeIntelView({
          scroll: {
            ...readIntelView().scroll,
            [activeTabRef.current]: main.scrollTop,
          },
        });
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  // Back at the saved scroll position once the list has loaded.
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current || isLoading) return;
    scrollRestoredRef.current = true;
    const top = savedView.scroll?.[activeTabRef.current];
    if (!top) return;
    requestAnimationFrame(() => {
      document.querySelector("main.app-canvas")?.scrollTo({ top });
    });
  }, [isLoading, savedView]);

  const dateRange = useMemo(
    () => presetToRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );

  // Apply date + search filtering to entities
  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    return entities
      .map(e => {
        let occs = e.occurrences;
        if (dateRange.from || dateRange.to) {
          occs = occs.filter(o => {
            const match = o.sheetTitle.match(/^(\d{4})(\d{2})(\d{2})/);
            if (!match) return true;
            const sheetDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
            if (dateRange.from && sheetDate < dateRange.from) return false;
            if (dateRange.to && sheetDate > dateRange.to) return false;
            return true;
          });
        }
        return { ...e, occurrences: occs };
      })
      .filter(e => e.occurrences.length > 0);
  }, [entities, dateRange]);

  // Sort helper: registry entities (all occurrences from operationId=0 / operationName="(Registry)") pinned to bottom
  const sortedByTab = useMemo(() => {
    const isRegistryOnly = (e: Entity) =>
      e.occurrences.length > 0 &&
      e.occurrences.every(
        o => o.operationId === 0 || o.operationName === "(Registry)"
      );
    const getLatestTime = (e: Entity) =>
      Math.max(...e.occurrences.map(o => o.timeMinutes ?? 0));
    const getLatestSheet = (e: Entity) =>
      e.occurrences.reduce(
        (best, o) => (o.sheetTitle > best ? o.sheetTitle : best),
        ""
      );

    return (list: Entity[]) => {
      const registry = list.filter(isRegistryOnly);
      const normal = list.filter(e => !isRegistryOnly(e));
      const sorted = [...normal].sort((a, b) => {
        if (sortOrder === "az") return a.shortForm.localeCompare(b.shortForm);
        if (sortOrder === "za") return b.shortForm.localeCompare(a.shortForm);
        if (sortOrder === "recent")
          return (
            getLatestSheet(b).localeCompare(getLatestSheet(a)) ||
            getLatestTime(b) - getLatestTime(a)
          );
        if (sortOrder === "oldest")
          return (
            getLatestSheet(a).localeCompare(getLatestSheet(b)) ||
            getLatestTime(a) - getLatestTime(b)
          );
        if (sortOrder === "operation")
          return getPrimaryOperationName(a).localeCompare(
            getPrimaryOperationName(b)
          );
        if (sortOrder === "surname") {
          const as = (a.surname ?? "").trim();
          const bs = (b.surname ?? "").trim();
          if (!as && !bs) return a.shortForm.localeCompare(b.shortForm);
          if (!as) return 1;
          if (!bs) return -1;
          return as.localeCompare(bs);
        }
        if (sortOrder === "make") {
          const am = deriveVehicleMake(a);
          const bm = deriveVehicleMake(b);
          if (!am && !bm) return a.shortForm.localeCompare(b.shortForm);
          if (!am) return 1;
          if (!bm) return -1;
          return am.localeCompare(bm);
        }
        if (sortOrder === "suburb") {
          const asub = deriveSuburb(a);
          const bsub = deriveSuburb(b);
          if (!asub && !bsub) return a.shortForm.localeCompare(b.shortForm);
          if (!asub) return 1;
          if (!bsub) return -1;
          return asub.localeCompare(bsub);
        }
        // default: frequency
        return b.occurrences.length - a.occurrences.length;
      });
      // Registry entries sorted A-Z within themselves, always at bottom
      const sortedRegistry = [...registry].sort((a, b) =>
        a.shortForm.localeCompare(b.shortForm)
      );
      return [...sorted, ...sortedRegistry];
    };
  }, [sortOrder]);

  // For entity-type tabs: also apply search + type filter
  const filteredByTab = useMemo(() => {
    if (activeTab === "operations") return filteredEntities;
    const q = search.toLowerCase();
    const matchesSearch = (e: Entity) =>
      !search ||
      e.shortForm.toLowerCase().includes(q) ||
      (e.tgtAlias ?? "").toLowerCase().includes(q) ||
      e.occurrences.some(
        o =>
          o.observationSnippet.toLowerCase().includes(q) ||
          o.fullDescription.toLowerCase().includes(q)
      );
    // Every entity occurrence already carries an operationId regardless of
    // type, not just a text mention (see getPrimaryOperationName's
    // comment) — so this same "only show entities linked to that
    // operation" filter applies uniformly across Targets/Associates/
    // Vehicles/Locations rather than being a targets-specific concept.
    const matchesOperationFilter = (e: Entity) =>
      filterOperationId === null ||
      e.occurrences.some(o => o.operationId === filterOperationId);
    if (activeTab === "targets")
      return filteredEntities.filter(
        e =>
          e.isTarget === true && matchesSearch(e) && matchesOperationFilter(e)
      );
    if (activeTab === "associates")
      return filteredEntities.filter(
        e =>
          e.type === "person" &&
          !e.isTarget &&
          matchesSearch(e) &&
          matchesOperationFilter(e)
      );
    if (activeTab === "vehicle")
      return filteredEntities.filter(
        e =>
          e.type === "vehicle" && matchesSearch(e) && matchesOperationFilter(e)
      );
    if (activeTab === "locations")
      return filteredEntities.filter(
        e =>
          (e.type === "address" || e.type === "business") &&
          matchesSearch(e) &&
          matchesOperationFilter(e)
      );
    return filteredEntities.filter(matchesSearch);
  }, [filteredEntities, activeTab, search, filterOperationId]);

  // Sort pills shown per tab — each tab only offers the orderings that
  // actually make sense for it, rather than one shared list.
  const sortOptions = useMemo((): { value: SortOrder; label: string }[] => {
    if (activeTab === "targets" || activeTab === "associates") {
      return [
        { value: "recent", label: "Most recent" },
        { value: "frequency", label: "Most frequent" },
        { value: "operation", label: "Operation A → Z" },
        { value: "surname", label: "Surname A → Z" },
      ];
    }
    if (activeTab === "vehicle") {
      return [
        { value: "recent", label: "Most recent" },
        { value: "frequency", label: "Most frequent" },
        { value: "az", label: "A → Z" },
        { value: "za", label: "Z → A" },
        { value: "make", label: "Make A → Z" },
      ];
    }
    if (activeTab === "locations") {
      return [
        { value: "recent", label: "Most recent" },
        { value: "frequency", label: "Most frequent" },
        { value: "az", label: "A → Z" },
        { value: "suburb", label: "Suburb A → Z" },
      ];
    }
    return [
      { value: "recent", label: "Most recent" },
      { value: "frequency", label: "Most frequent" },
      { value: "az", label: "A → Z" },
      { value: "za", label: "Z → A" },
      { value: "oldest", label: "Oldest first" },
    ];
  }, [activeTab]);

  // Counts per tab for badges
  const tabCounts = useMemo(() => {
    const counts: Partial<Record<TabView, number>> = {};
    if (!filteredEntities) return counts;
    // Count all operations: entity-derived + any with no entities yet
    // (excludes the operationId=0 "(Registry)" pseudo-operation — not a real op)
    const opIds = new Set<number>();
    for (const e of filteredEntities)
      for (const o of e.occurrences)
        if (o.operationId !== 0) opIds.add(o.operationId);
    const allOpCount = Math.max(opIds.size, allOps?.length ?? 0);
    counts["operations"] = allOpCount;
    counts["targets"] = filteredEntities.filter(
      e => e.isTarget === true
    ).length;
    counts["associates"] = filteredEntities.filter(
      e => e.type === "person" && !e.isTarget
    ).length;
    counts["vehicle"] = filteredEntities.filter(
      e => e.type === "vehicle"
    ).length;
    counts["locations"] = filteredEntities.filter(
      e => e.type === "address" || e.type === "business"
    ).length;
    return counts;
  }, [filteredEntities]);

  const totalEntities = entities?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-violet-400/10 border border-violet-400/20">
            <FileText className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">
              Intelligence Folder
            </h1>
            {!isMobile && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLoading
                  ? "Loading…"
                  : `${totalEntities} entities extracted from observation records`}
              </p>
            )}
          </div>
          <RegionSearchButton />
        </div>

        {/* Tab nav */}
        {isMobile ? (
          <div className="mb-5">
            <Select
              value={activeTab}
              onValueChange={v => setActiveTab(v as TabView)}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAB_OPTIONS.map(tab => {
                  const count = tabCounts[tab.value];
                  return (
                    <SelectItem key={tab.value} value={tab.value}>
                      {tab.label}
                      {count !== undefined && count > 0 ? ` (${count})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="mb-5 space-y-3">
            <div className="grid grid-cols-5 gap-2">
              {ENTITY_TAB_OPTIONS.map(tab => {
                const count = tabCounts[tab.value];
                const isActive = activeTab === tab.value;
                const colors =
                  ENTITY_TAB_COLORS[
                    tab.value as keyof typeof ENTITY_TAB_COLORS
                  ];
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border-2 transition-colors ${
                      isActive
                        ? `${colors.activeBorder} ${colors.activeBg}`
                        : `${colors.idleBorder} ${colors.idleBg} hover:bg-muted/40`
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={colors.icon}>{tab.icon}</span>
                      <span
                        className={`text-[13px] font-bold ${isActive ? colors.activeText : "text-foreground"}`}
                      >
                        {tab.label}
                      </span>
                    </span>
                    {count !== undefined && (
                      <span
                        className={`text-lg font-bold ${isActive ? colors.activeText : "text-foreground/80"}`}
                      >
                        {count}
                      </span>
                    )}
                    <span
                      className={`w-7 h-0.5 rounded-full ${isActive ? colors.bar : "bg-transparent"}`}
                    />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-foreground/70">
                Reports
              </span>
              <div className="flex gap-2">
                {REPORT_TAB_OPTIONS.map(tab => {
                  const isActive = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg border-2 text-[13px] font-bold transition-colors ${
                        isActive
                          ? "border-indigo-500 bg-indigo-500/15 text-indigo-800 shadow-sm dark:text-indigo-300"
                          : "border-indigo-500/45 bg-card text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Search bar + filter + sort control — entity tabs only */}
        {activeTab !== "operations" && !isMapTab && (
          <div className="space-y-2 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 pr-9"
                placeholder="Search entities, descriptions, observations…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <ClearInputButton value={search} onClear={() => setSearch("")} />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(activeTab === "targets" ||
                activeTab === "associates" ||
                activeTab === "vehicle" ||
                activeTab === "locations") && (
                <>
                  <span className="text-xs text-muted-foreground mr-1">
                    Filter:
                  </span>
                  <Select
                    value={filterOperationId?.toString() ?? "all"}
                    onValueChange={v =>
                      setFilterOperationId(v === "all" ? null : Number(v))
                    }
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[10rem] text-xs">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All operations</SelectItem>
                      {(allOps ?? []).map(op => (
                        <SelectItem key={op.id} value={op.id.toString()}>
                          {op.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground mx-0.5">|</span>
                </>
              )}
              <span className="text-xs text-muted-foreground mr-1">Sort:</span>
              {sortOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSortOrder(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    sortOrder === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground/80 border-input hover:bg-muted/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && !isMapTab && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Heat Map tab content */}
        {activeTab === "heatmap" && <IntelligenceHeatMap />}

        {/* Places Report tab content */}
        {activeTab === "places" && <IntelligencePlaces />}

        {/* Day Route tab content */}
        {activeTab === "dayRoute" && <IntelligenceDayRoute />}

        {/* Pattern of Life tab content — unlike Heat Map/Ego Network/Packages
            this isn't a canvas that needs to fill the viewport, it's a
            variable-length report (sometimes just an empty state, sometimes
            several chart sections), so it renders inline and lets the page
            scroll normally instead of being boxed into a fixed-height inner
            scroll region. */}
        {activeTab === "patternOfLife" && <IntelligencePatternOfLife />}

        {/* Ego Network tab content */}
        {activeTab === "egonet" && (
          <EgoNetworkMap
            initialOperationId={deepLinkOperationId}
            initialSheetId={deepLinkSheetId}
          />
        )}

        {/* Packages tab content */}
        {activeTab === "packages" && (
          <div
            className="-mx-4 -mb-4 flex-1"
            style={{ height: "calc(100vh - 260px)" }}
          >
            <IntelPackages />
          </div>
        )}

        {/* Operations tab content */}
        {!isLoading && activeTab === "operations" && (
          <>
            {/* Search + sort bar for operations tab */}
            <div className="space-y-2 mb-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9"
                  placeholder="Search operations…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <ClearInputButton
                  value={search}
                  onClear={() => setSearch("")}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">
                  Sort:
                </span>
                {[
                  { value: "recent" as const, label: "Most recent" },
                  { value: "az" as const, label: "A → Z" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setOpSortOrder(opt.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      opSortOrder === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground/80 border-input hover:bg-muted/70"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {viewMode === "tile" ? (
              <OperationsTab
                entities={filteredEntities}
                allOps={allOps}
                search={search}
                sortOrder={opSortOrder}
                tileView
              />
            ) : (
              <OperationsTab
                entities={filteredEntities}
                allOps={allOps}
                search={search}
                sortOrder={opSortOrder}
              />
            )}
          </>
        )}

        {/* Search bar for operations tab (inline, above results) */}
        {!isLoading && activeTab === "operations" && (
          <div className="relative mt-4 hidden">
            {/* search is handled inside OperationsTab via prop */}
          </div>
        )}

        {/* Entity type tab content */}
        {!isLoading && activeTab !== "operations" && !isMapTab && (
          <>
            {filteredByTab.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {search || datePreset !== "all"
                    ? "No entities match your filters."
                    : "No entities found. Entities are extracted automatically from observation text using the (ShortForm) convention."}
                </p>
              </div>
            ) : viewMode === "tile" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedByTab(filteredByTab).map(entity => {
                  const iconColor = entity.isTarget
                    ? TARGET_COLOR
                    : TYPE_COLORS[entity.type];
                  const icon =
                    entity.type === "address" || entity.type === "business" ? (
                      <MapPin className="w-3.5 h-3.5" />
                    ) : (
                      TYPE_ICONS[entity.type]
                    );
                  const displayShortForm =
                    entity.type === "vehicle"
                      ? formatIntelVehicle(
                          entity.shortForm,
                          entity.occurrences[0]?.fullDescription
                        )
                      : entity.type === "address" || entity.type === "business"
                        ? placeLabel(entity.shortForm)
                        : entity.shortForm;
                  const handleClick = () => {
                    if (entity.isTarget && entity.targetId)
                      navigate(`/intelligence/target/${entity.targetId}`);
                    else if (entity.type === "vehicle")
                      navigate(
                        `/intelligence/vehicle/${encodeURIComponent(entity.shortForm)}`
                      );
                    else if (
                      entity.type === "address" ||
                      entity.type === "business"
                    )
                      navigate(
                        `/intelligence/location/${encodeURIComponent(entity.shortForm)}`
                      );
                    else
                      navigate(
                        `/intelligence/associate/${encodeURIComponent(entity.shortForm)}`
                      );
                  };
                  return (
                    <button
                      key={`${entity.isTarget ? "target" : entity.type}::${entity.shortForm}`}
                      onClick={handleClick}
                      className="group flex flex-col gap-3 p-5 rounded-xl overflow-hidden border border-border bg-card shadow-sm hover:bg-accent/20 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 text-left w-full"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border ${iconColor} shrink-0`}
                        >
                          {icon}
                        </span>
                        <div className="hidden text-right shrink-0 sm:block">
                          <p className="text-sm font-bold text-foreground">
                            {entity.occurrences.length}×
                          </p>
                          <p className="text-xs text-foreground/70">
                            {uniqueSheets(entity.occurrences).length} sheet
                            {uniqueSheets(entity.occurrences).length !== 1
                              ? "s"
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="font-mono text-[15px] font-medium leading-snug text-foreground line-clamp-2">
                          {displayShortForm}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {entity.isIndicesOnly && <IndicesBadge />}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${entity.isTarget ? TARGET_COLOR : TYPE_COLORS[entity.type]}`}
                        >
                          {TYPE_LABELS[entity.type]}
                        </span>
                        {photoCountForEntity(entity) > 0 && (
                          <span
                            title={`${photoCountForEntity(entity)} linked photo${photoCountForEntity(entity) === 1 ? "" : "s"}`}
                            className="hidden items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/40 shrink-0 sm:inline-flex"
                          >
                            <Camera className="w-3 h-3" />
                            {photoCountForEntity(entity)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                {sortedByTab(filteredByTab).map((entity, idx) => {
                  const iconColor = entity.isTarget
                    ? TARGET_COLOR
                    : TYPE_COLORS[entity.type];
                  const icon =
                    entity.type === "address" || entity.type === "business" ? (
                      <MapPin className="w-3.5 h-3.5" />
                    ) : (
                      TYPE_ICONS[entity.type]
                    );
                  const displayShortForm =
                    entity.type === "vehicle"
                      ? formatIntelVehicle(
                          entity.shortForm,
                          entity.occurrences[0]?.fullDescription
                        )
                      : entity.type === "address" || entity.type === "business"
                        ? placeLabel(entity.shortForm)
                        : entity.shortForm;
                  return (
                    <button
                      key={`${entity.isTarget ? "target" : entity.type}::${entity.shortForm}`}
                      data-entity={entity.shortForm}
                      onClick={() => {
                        if (entity.isTarget && entity.targetId) {
                          navigate(`/intelligence/target/${entity.targetId}`);
                        } else if (entity.type === "vehicle") {
                          navigate(
                            `/intelligence/vehicle/${encodeURIComponent(entity.shortForm)}`
                          );
                        } else if (
                          entity.type === "address" ||
                          entity.type === "business"
                        ) {
                          navigate(
                            `/intelligence/location/${encodeURIComponent(entity.shortForm)}`
                          );
                        } else {
                          navigate(
                            `/intelligence/associate/${encodeURIComponent(entity.shortForm)}`
                          );
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors ${
                        idx < filteredByTab.length - 1
                          ? "border-b border-border"
                          : ""
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full border ${iconColor} shrink-0`}
                      >
                        {icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-[15px] font-medium text-foreground truncate">
                            {displayShortForm}
                          </p>
                          {entity.lowConfidence && (
                            <span
                              title="Low confidence — classification may need review"
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-400/15 text-yellow-600 dark:text-yellow-400 border border-yellow-400/30 shrink-0"
                            >
                              ?
                            </span>
                          )}
                          {entity.isIndicesOnly && <IndicesBadge />}
                        </div>
                      </div>
                      <div className="hidden text-right shrink-0 sm:block">
                        <p className="text-sm font-bold text-foreground">
                          {entity.occurrences.length}×
                        </p>
                        <p className="text-xs text-foreground/70">
                          {uniqueSheets(entity.occurrences).length} sheet
                          {uniqueSheets(entity.occurrences).length !== 1
                            ? "s"
                            : ""}
                        </p>
                      </div>
                      {photoCountForEntity(entity) > 0 && (
                        <span
                          title={`${photoCountForEntity(entity)} linked photo${photoCountForEntity(entity) === 1 ? "" : "s"}`}
                          className="hidden items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/40 shrink-0 sm:inline-flex"
                        >
                          <Camera className="w-3 h-3" />
                          {photoCountForEntity(entity)}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Profile dialog */}
      {selected && entities && (
        <ProfileDialog
          entity={selected}
          allEntities={entities}
          onClose={() => setSelected(null)}
          onNavigate={e => setSelected(e)}
        />
      )}
    </DashboardLayout>
  );
}
