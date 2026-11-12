// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { ClearInputButton } from "@/components/ClearInputButton";
import { TargetLocationSection } from "@/components/TargetLocationSection";
import { TargetProfileContent } from "@/components/TargetProfileContent";
import { OperationProfileContent } from "@/components/OperationProfileContent";
import SheetDetail from "@/pages/SheetDetail";
import { SheetFolderList, SheetGallery } from "@/pages/ImagesPage";
import { DocumentZoomViewer } from "@/components/DocumentZoomViewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TargetPredictorSection } from "@/components/TargetPredictor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Settings2,
  X,
  Radio,
  AlertTriangle,
  FolderOpen,
  ClipboardList,
  User,
  Search,
  LocateFixed,
  ExternalLink,
  Image as ImageIcon,
  Compass,
  Crosshair,
  Hash,
  Flame,
} from "lucide-react";
import type { MapScreen } from "./useMapScreen";

/** the right-hand RS Actions pane (search, target profile and running-sheet actions). */
export function RsActionsPane({ s }: { s: MapScreen }) {
  const {
    rsActionsPaneOpen,
    setRsActionsPaneOpen,
    selectedOpIds,
    selectedTargetIds,
    mapDarkMode,
    user,
    heatOn,
    isInvestigator,
    showStreetHeadingBar,
    paneResizeDraggingRef,
    isMobile,
    activePaneWidth,
    PANE_MIN_WIDTH,
    paneSubViewOpen,
    setPanelWidthProfile,
    setPanelWidthNormal,
    paneTargetProfileId,
    setPaneTargetProfileId,
    paneOperationProfileId,
    setPaneOperationProfileId,
    paneImagesOpId,
    paneImagesSheetId,
    setPaneImagesSheetId,
    setPaneImagesOpId,
    paneSheetDetailId,
    setPaneSheetDetailId,
    rsInlineLabel,
    closeInlineField,
    setMapDarkMode,
    opsLoading,
    operations,
    opsDropdownOpen,
    setOpsDropdownOpen,
    setOpSearchQuery,
    multiOpMode,
    setMultiOpMode,
    clearAll,
    opSearchQuery,
    opTargetMap,
    opExpanded,
    handleOpRowClick,
    setOpExpanded,
    toggleTarget,
    rsSelectedSheetId,
    setRsSelectedSheetId,
    setRsLastEntry,
    setRsEditingLastEntry,
    rsSheetsData,
    handleSharingToggle,
    sharingEnabled,
    mustShare,
    gpsError,
    teamRows,
    collapsedTeams,
    setCollapsedTeams,
    toggleTeamVisibility,
    hiddenTeams,
    toggleUserTrace,
    tracedUserIds,
    toggleUserVisibility,
    hiddenUsers,
    unassignedLiveUsers,
    trackingSettings,
    targetFlagStatus,
    predictor,
    rsTargetData,
    activeMapOperationId,
    rsSelectedOpId,
    rsSelectedSheetTitle,
    showTargetLocation,
    setShowTargetLocation,
    setShowStreetHeadingBar,
    setNearbyOn,
    nearbyOn,
    setHeatOn,
    heatOpChoice,
    setHeatOpChoice,
    setHeatTargetChoice,
    heatOpName,
    heatTargetChoice,
    heatDefaultTargetName,
    heatTargets,
    heatTransparency,
    setHeatTransparency,
    heatError,
    heatLocations,
    setShowMarkerEntityCount,
    showMarkerEntityCount,
  } = s;
  return (
    <>
      {/* ── RS Actions Right Pane ──
           z-30 + full viewport width on mobile: the map's floating overlays
           (search bar, locate buttons, bottom pill bar) are absolutely
           positioned within Map Area and don't shrink/clip with it, so on a
           narrow screen a partial-width pane still leaves them spilling over
           its content underneath. The left pane never showed this because it
           opens flush against the same top-left corner those specific
           overlays already anchor to, so it happens to cover them outright;
           the right pane has no such natural overlap, so it needs to be
           explicit here — full width (nothing beside it to spill into) and a
           z-index above the overlays' z-20 (nothing paints over it either),
           giving it the same "full vision" the left pane already has. */}
      <div
        data-testid="right-pane"
        data-open={rsActionsPaneOpen ? "true" : "false"}
        className={`relative flex h-full flex-col border-l-[3px] border-primary/40 bg-card shadow-2xl flex-shrink-0 ${
          rsActionsPaneOpen ? "z-30" : ""
        } ${
          paneResizeDraggingRef.current ? "" : "transition-all duration-200"
        } ${rsActionsPaneOpen ? "rounded-l-2xl" : "overflow-hidden"}`}
        style={{
          width: rsActionsPaneOpen
            ? isMobile
              ? "100vw"
              : `${activePaneWidth}px`
            : 0,
          minWidth: rsActionsPaneOpen
            ? isMobile
              ? "100vw"
              : `${PANE_MIN_WIDTH}px`
            : 0,
        }}
      >
        {/* Resize handle — drag left edge to widen/narrow the pane (mouse or touch). Not on mobile: the pane is full-width there, nothing to resize against. */}
        {rsActionsPaneOpen && !isMobile && (
          <div
            className="absolute -left-1.5 top-0 bottom-0 w-3 z-10 flex items-center justify-center cursor-col-resize touch-none select-none group"
            title="Drag to resize"
            onMouseDown={e => {
              e.stopPropagation();
              paneResizeDraggingRef.current = true;
              const startX = e.clientX;
              const startWidth = activePaneWidth;
              const onMove = (me: MouseEvent) => {
                const delta = startX - me.clientX;
                const maxW = Math.max(
                  PANE_MIN_WIDTH,
                  Math.min(720, window.innerWidth - 320)
                );
                const next = Math.min(
                  maxW,
                  Math.max(PANE_MIN_WIDTH, startWidth + delta)
                );
                if (paneSubViewOpen) setPanelWidthProfile(next);
                else setPanelWidthNormal(next);
              };
              const onUp = () => {
                paneResizeDraggingRef.current = false;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            onTouchStart={e => {
              e.stopPropagation();
              paneResizeDraggingRef.current = true;
              const startX = e.touches[0].clientX;
              const startWidth = activePaneWidth;
              const onMove = (te: TouchEvent) => {
                const delta = startX - te.touches[0].clientX;
                const maxW = Math.max(
                  PANE_MIN_WIDTH,
                  Math.min(720, window.innerWidth - 320)
                );
                const next = Math.min(
                  maxW,
                  Math.max(PANE_MIN_WIDTH, startWidth + delta)
                );
                if (paneSubViewOpen) setPanelWidthProfile(next);
                else setPanelWidthNormal(next);
              };
              const onEnd = () => {
                paneResizeDraggingRef.current = false;
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", onEnd);
              };
              document.addEventListener("touchmove", onMove, {
                passive: true,
              });
              document.addEventListener("touchend", onEnd);
            }}
          >
            <div className="w-1 h-12 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
          </div>
        )}

        {/* Pane Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-primary/20 flex-shrink-0 bg-primary/[0.06]">
          {paneTargetProfileId !== null ? (
            <button
              onClick={() => setPaneTargetProfileId(null)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
            >
              <ChevronLeft className="h-4 w-4 text-violet-500 flex-shrink-0" />
              <User className="h-4 w-4 text-violet-500 flex-shrink-0" />
              <span className="font-bold text-sm tracking-tight truncate">
                Target Profile
              </span>
            </button>
          ) : paneOperationProfileId !== null ? (
            <button
              onClick={() => setPaneOperationProfileId(null)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
            >
              <ChevronLeft className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="font-bold text-sm tracking-tight truncate">
                Operation Profile
              </span>
            </button>
          ) : paneImagesOpId !== null ? (
            <button
              onClick={() => {
                // Back steps one level at a time: a sheet's photos -> that
                // operation's sheet folders -> out to the settings list.
                if (paneImagesSheetId !== null) setPaneImagesSheetId(null);
                else setPaneImagesOpId(null);
              }}
              className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
            >
              <ChevronLeft className="h-4 w-4 text-cyan-500 flex-shrink-0" />
              <ImageIcon className="h-4 w-4 text-cyan-500 flex-shrink-0" />
              <span className="font-bold text-sm tracking-tight truncate">
                Operation Images
              </span>
            </button>
          ) : paneSheetDetailId !== null ? (
            <button
              onClick={() => setPaneSheetDetailId(null)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
            >
              <ChevronLeft className="h-4 w-4 text-teal-500 flex-shrink-0" />
              <ClipboardList className="h-4 w-4 text-teal-500 flex-shrink-0" />
              <span className="font-bold text-sm tracking-tight truncate">
                Running Sheet
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm tracking-tight">
                Map Settings
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl flex-shrink-0"
            onClick={() => {
              setRsActionsPaneOpen(false);
              setPaneTargetProfileId(null);
              setPaneOperationProfileId(null);
              setPaneImagesOpId(null);
              setPaneImagesSheetId(null);
              setPaneSheetDetailId(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Pane Body */}
        {paneTargetProfileId !== null ? (
          <div className="flex-1 overflow-hidden">
            <DocumentZoomViewer contentWidth={768} className="w-full h-full">
              <TargetProfileContent targetId={paneTargetProfileId} />
            </DocumentZoomViewer>
          </div>
        ) : paneOperationProfileId !== null ? (
          <div className="flex-1 overflow-hidden">
            <DocumentZoomViewer contentWidth={768} className="w-full h-full">
              <OperationProfileContent operationId={paneOperationProfileId} />
            </DocumentZoomViewer>
          </div>
        ) : paneImagesOpId !== null ? (
          // The Images page's own two levels, rendered inline. Plain scroll
          // rather than DocumentZoomViewer: this is an interactive gallery
          // (upload, link, delete, lightbox), not a document to zoom.
          <div className="flex-1 overflow-y-auto">
            {paneImagesSheetId !== null ? (
              <SheetGallery
                operationId={paneImagesOpId}
                sheetId={paneImagesSheetId}
                onBack={() => setPaneImagesSheetId(null)}
                hideBackButton
              />
            ) : (
              <SheetFolderList
                operationId={paneImagesOpId}
                onBack={() => setPaneImagesOpId(null)}
                onSelect={id => setPaneImagesSheetId(id)}
                hideBackButton
              />
            )}
          </div>
        ) : paneSheetDetailId !== null ? (
          // The full SheetDetail page component itself, embedded — plain
          // scroll rather than DocumentZoomViewer since it's an
          // interactive edit surface (rows, certification, roster), not a
          // document to zoom. `embedded` hides its own page chrome (back
          // arrow, Summary/Governance tabs) since this pane already
          // supplies a header/close control and those would otherwise
          // navigate the whole app away from the map.
          <div className="flex-1 overflow-y-auto">
            <SheetDetail sheetIdProp={paneSheetDetailId} embedded />
          </div>
        ) : (
          <div
            className="flex-1 overflow-y-auto"
            onClick={() => {
              if (rsInlineLabel) closeInlineField();
            }}
          >
            {/* ── MAP THEME toggle ── */}
            <div className="px-3 py-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Map Theme
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-medium transition-colors ${!mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    Light
                  </span>
                  <Switch
                    checked={mapDarkMode}
                    onCheckedChange={setMapDarkMode}
                    className="scale-90"
                  />
                  <span
                    className={`text-[11px] font-medium transition-colors ${mapDarkMode ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    Dark
                  </span>
                </div>
              </div>
            </div>

            {/* ── OPERATIONS section ── */}
            <div className="px-3 py-3 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Operations
              </span>
              {opsLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : !operations || operations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No operations found.
                </p>
              ) : isInvestigator ? (
                // Investigator accounts don't get a picker at all — just a
                // static readout of their allocated operation(s), locked
                // by the effect above and re-enforced server-side.
                <div className="w-full px-3 py-2 rounded-xl border-2 border-purple-500/30 bg-purple-500/5 text-xs text-foreground">
                  {(operations as any[])
                    .filter((op: any) => selectedOpIds.includes(op.id))
                    .map((op: any) => op.name)
                    .join(", ") || "No operation allocated"}
                </div>
              ) : (
                <Popover
                  open={opsDropdownOpen}
                  onOpenChange={open => {
                    setOpsDropdownOpen(open);
                    if (!open) setOpSearchQuery("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-border bg-background hover:bg-accent/50 active:scale-[0.98] transition-all text-left">
                      <span className="text-xs text-foreground truncate flex-1">
                        {selectedOpIds.length === 0
                          ? "Select operation…"
                          : selectedOpIds.length ===
                              (operations as any[]).length
                            ? "All operations"
                            : (operations as any[])
                                .filter((op: any) =>
                                  selectedOpIds.includes(op.id)
                                )
                                .map((op: any) => op.name)
                                .join(", ")}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 p-2 rounded-xl border-2 border-border shadow-xl"
                    align="end"
                  >
                    <div className="flex items-center justify-between px-1 pb-2 border-b border-border mb-2">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {multiOpMode ? "Select Operations" : "Select Operation"}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setMultiOpMode(v => !v)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                            multiOpMode
                              ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                              : "text-muted-foreground hover:text-foreground border-border hover:bg-accent/50"
                          }`}
                        >
                          Multi
                        </button>
                        <button
                          onClick={clearAll}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={opSearchQuery}
                        onChange={e => setOpSearchQuery(e.target.value)}
                        placeholder="Search operations…"
                        className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <ClearInputButton
                        value={opSearchQuery}
                        onClear={() => setOpSearchQuery("")}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                      {(operations as any[])
                        .filter((op: any) =>
                          op.name
                            .toLowerCase()
                            .includes(opSearchQuery.trim().toLowerCase())
                        )
                        .map(op => {
                          const opTargets = opTargetMap.get(op.id) ?? [];
                          const isOpSelected = selectedOpIds.includes(op.id);
                          const isExpanded = opExpanded.has(op.id);
                          return (
                            <div key={op.id}>
                              <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors">
                                <Checkbox
                                  id={`rp-op-${op.id}`}
                                  checked={isOpSelected}
                                  onCheckedChange={() =>
                                    handleOpRowClick(op.id)
                                  }
                                  className="h-4 w-4"
                                />
                                <label
                                  htmlFor={`rp-op-${op.id}`}
                                  className="flex-1 text-sm cursor-pointer truncate font-medium"
                                >
                                  {op.name}
                                </label>
                                {opTargets.length > 0 && (
                                  <button
                                    onClick={() =>
                                      setOpExpanded(prev => {
                                        const next = new Set(prev);
                                        next.has(op.id)
                                          ? next.delete(op.id)
                                          : next.add(op.id);
                                        return next;
                                      })
                                    }
                                    className="text-muted-foreground hover:text-foreground p-0.5"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {isExpanded && opTargets.length > 0 && (
                                <div className="ml-6 pl-2 border-l border-border/50 flex flex-col gap-0.5 mb-1">
                                  {opTargets.map(t => (
                                    <div
                                      key={t.id}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/40 transition-colors"
                                    >
                                      <Checkbox
                                        id={`rp-tgt-${t.id}`}
                                        checked={selectedTargetIds.includes(
                                          t.id
                                        )}
                                        onCheckedChange={() =>
                                          toggleTarget(t.id)
                                        }
                                        className="h-3.5 w-3.5"
                                      />
                                      <label
                                        htmlFor={`rp-tgt-${t.id}`}
                                        className="text-xs cursor-pointer truncate text-muted-foreground"
                                      >
                                        {t.name}
                                      </label>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {(operations as any[]).filter((op: any) =>
                        op.name
                          .toLowerCase()
                          .includes(opSearchQuery.trim().toLowerCase())
                      ).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          No operations match "{opSearchQuery}".
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* ── RS SELECTION section ── */}
            <div className="px-3 py-3 border-b border-border space-y-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                RS Selection
              </span>

              {/* No ops selected — prompt user */}
              {selectedOpIds.length === 0 && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Select an operation above to see available running sheets.
                </p>
              )}

              {/* Running sheet selector — driven by top Operations filter */}
              {selectedOpIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    value={
                      rsSelectedSheetId !== null
                        ? String(rsSelectedSheetId)
                        : ""
                    }
                    onValueChange={val => {
                      setRsSelectedSheetId(Number(val));
                      setRsLastEntry(null);
                      setRsEditingLastEntry(false);
                    }}
                  >
                    <SelectTrigger className="flex-1 h-9 text-xs rounded-xl border-2">
                      <SelectValue placeholder="Choose running sheet…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(rsSheetsData ?? [])
                        .filter((s: any) => !s.closedAt && !s.deletedAt)
                        .map((s: any) => (
                          <SelectItem
                            key={s.id}
                            value={String(s.id)}
                            className="text-xs"
                          >
                            {s.title || `Sheet #${s.id}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {rsSelectedSheetId !== null && (
                    <button
                      onClick={() => {
                        setRsSelectedSheetId(null);
                        setRsLastEntry(null);
                        setRsEditingLastEntry(false);
                      }}
                      className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border-2 border-border bg-muted/40 hover:bg-destructive/20 hover:border-destructive/40 active:scale-95 transition-all"
                      title="Clear running sheet selection"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}

              {/* Open the selected sheet inline (view + edit) without
                    leaving the map — same "colour-coded link" pattern as
                    the Operation Profile / Images links below, so this
                    reads as one consistent set of pane shortcuts. Unlike
                    those, stays open until the pane's own back arrow / X is
                    used (not on a map tap), since it's an active edit
                    surface, not a read view. */}
              {rsSelectedSheetId !== null && (
                <button
                  onClick={() => {
                    setPaneSheetDetailId(rsSelectedSheetId);
                    setPaneTargetProfileId(null);
                    setPaneOperationProfileId(null);
                    setPaneImagesOpId(null);
                    setPaneImagesSheetId(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 active:scale-[0.98] transition-all min-w-0"
                >
                  <ClipboardList className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-teal-500 truncate flex-1 text-left">
                    Open Running Sheet
                  </span>
                  <ExternalLink className="h-3 w-3 text-teal-500/60 flex-shrink-0" />
                </button>
              )}

              {/* RS Quick Entry is reached via the map's own action
                    chooser / POI tap sheets, or a marker's own popup —
                    no dedicated entry point needed here. */}
            </div>
            {/* end RS Selection */}

            {/* ── PROFILES (one per selected operation, driven by the
                Operations filter above — not the RS selection, so it's
                available as soon as an operation is picked even with no
                running sheet chosen yet, and shows one link per operation
                when more than one is selected) ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Profiles
              </span>
              {selectedOpIds.length === 0 ? (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Select an operation above to open its profile.
                </p>
              ) : (
                (operations as any[] | undefined)
                  ?.filter((op: any) => selectedOpIds.includes(op.id))
                  .map((op: any) => (
                    <button
                      key={op.id}
                      onClick={() => {
                        setPaneOperationProfileId(op.id);
                        setPaneTargetProfileId(null);
                        setPaneImagesOpId(null);
                        setPaneImagesSheetId(null);
                        setPaneSheetDetailId(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 active:scale-[0.98] transition-all min-w-0"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-blue-500 truncate flex-1 text-left">
                        {op.name}
                      </span>
                      <ExternalLink className="h-3 w-3 text-blue-500/60 flex-shrink-0" />
                    </button>
                  ))
              )}
            </div>
            {/* end Profiles */}

            {/* ── IMAGES (one per selected operation, same
                Operations-filter-driven pattern as Profiles above, and
                labelled with the operation's own name rather than a
                generic "Operation Images" so multiple operations' links
                are distinguishable) ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Images
              </span>
              {selectedOpIds.length === 0 ? (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Select an operation above to open its images.
                </p>
              ) : (
                (operations as any[] | undefined)
                  ?.filter((op: any) => selectedOpIds.includes(op.id))
                  .map((op: any) => (
                    <button
                      key={op.id}
                      onClick={() => {
                        setPaneImagesOpId(op.id);
                        setPaneImagesSheetId(null);
                        setPaneTargetProfileId(null);
                        setPaneOperationProfileId(null);
                        setPaneSheetDetailId(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 active:scale-[0.98] transition-all min-w-0"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-cyan-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-cyan-500 truncate flex-1 text-left">
                        {op.name} Images
                      </span>
                      <ExternalLink className="h-3 w-3 text-cyan-500/60 flex-shrink-0" />
                    </button>
                  ))
              )}
            </div>
            {/* end Images */}

            {/* ── LOCATION (own section, so sharing your position is a
                deliberate act with its own heading rather than a small switch
                tucked into the Teams header) ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Location
              </span>
              <button
                onClick={() => handleSharingToggle(!sharingEnabled)}
                disabled={mustShare}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 disabled:cursor-default disabled:opacity-100 disabled:active:scale-100 ${
                  sharingEnabled
                    ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
                aria-pressed={sharingEnabled}
              >
                <Radio
                  className={`h-3.5 w-3.5 flex-shrink-0 ${
                    sharingEnabled
                      ? "text-emerald-500"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-xs font-semibold truncate flex-1 text-left ${
                    sharingEnabled ? "text-emerald-500" : "text-foreground"
                  }`}
                >
                  Show &amp; Share
                </span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                    sharingEnabled
                      ? "text-emerald-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {sharingEnabled ? "On" : "Off"}
                </span>
              </button>
            </div>
            {/* end Location */}

            {/* ── TEAMS (Live Location) — the roster PANEL (per-team
                  hide/collapse, member list) isn't shown to Investigator
                  accounts, but their map still renders every officer's
                  live pin same as everyone else's (see the userLocations
                  query above) — they just can't filter/hide by team from
                  here, and don't get the Location section's page-mate
                  wall-of-names view either. */}
            {!isInvestigator && (
              <div className="px-3 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      TEAMS
                    </span>
                  </div>
                </div>

                {/* GPS error */}
                {gpsError && (
                  <div className="flex items-start gap-1.5 mb-3 p-2.5 rounded-xl border-2 border-amber-500/30 bg-amber-500/10">
                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-[10px] text-amber-400 leading-tight">
                      {gpsError}
                    </span>
                  </div>
                )}

                {/* Team rows — collapsible with memory */}
                <div className="flex flex-col gap-2">
                  {teamRows.map(({ key, label, colour, users: teamUsers }) => {
                    const isCollapsed = collapsedTeams.has(key);
                    return (
                      <div
                        key={key}
                        className="rounded-xl border-2 border-border overflow-hidden"
                      >
                        {/* Team header — tap to collapse/expand */}
                        <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                          <button
                            onClick={() =>
                              setCollapsedTeams(prev => {
                                const next = new Set(prev);
                                next.has(key)
                                  ? next.delete(key)
                                  : next.add(key);
                                return next;
                              })
                            }
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: colour }}
                            />
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: colour }}
                            >
                              {label}
                            </span>
                            {teamUsers.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                ({teamUsers.length})
                              </span>
                            )}
                            {isCollapsed ? (
                              <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                            )}
                          </button>
                          <button
                            onClick={() => toggleTeamVisibility(key)}
                            className="ml-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0 px-2.5 py-1 rounded-md border border-border/50 bg-background/50 transition-colors"
                          >
                            {hiddenTeams.has(key) ? "Show" : "Hide"}
                          </button>
                        </div>
                        {/* Team members — shown when not collapsed */}
                        {!isCollapsed && (
                          <div className="px-3 py-2 border-t border-border bg-card">
                            {teamUsers.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground italic">
                                No units online
                              </p>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {teamUsers.map(u => (
                                  <div
                                    key={u.userId}
                                    className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30"
                                  >
                                    <span className="text-[11px] text-foreground font-medium truncate">
                                      {u.name.toUpperCase()}
                                      {u.userId === user?.id && (
                                        <span className="ml-1 text-[9px] text-muted-foreground">
                                          (you)
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          toggleUserTrace(u.userId)
                                        }
                                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                                          tracedUserIds.has(u.userId)
                                            ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                                            : "border-border/50 text-muted-foreground hover:text-foreground bg-background/50"
                                        }`}
                                      >
                                        {tracedUserIds.has(u.userId)
                                          ? "Tracking"
                                          : "Track"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          toggleUserVisibility(u.userId)
                                        }
                                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {hiddenUsers.has(u.userId)
                                          ? "Show"
                                          : "Hide"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unassigned users */}
                  {unassignedLiveUsers.length > 0 &&
                    (() => {
                      const isCollapsed = collapsedTeams.has("null");
                      return (
                        <div className="rounded-xl border-2 border-border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                            <button
                              onClick={() =>
                                setCollapsedTeams(prev => {
                                  const next = new Set(prev);
                                  next.has("null")
                                    ? next.delete("null")
                                    : next.add("null");
                                  return next;
                                })
                              }
                              className="flex items-center gap-2 flex-1 min-w-0"
                            >
                              <div className="w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0" />
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                Unassigned
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ({unassignedLiveUsers.length})
                              </span>
                              {isCollapsed ? (
                                <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                              ) : (
                                <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                              )}
                            </button>
                            <button
                              onClick={() => toggleTeamVisibility("null")}
                              className="ml-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0 px-2.5 py-1 rounded-md border border-border/50 bg-background/50 transition-colors"
                            >
                              {hiddenTeams.has("null") ? "Show" : "Hide"}
                            </button>
                          </div>
                          {!isCollapsed && (
                            <div className="px-3 py-2 border-t border-border bg-card">
                              <div className="flex flex-col gap-0.5">
                                {unassignedLiveUsers.map(u => (
                                  <div
                                    key={u.userId}
                                    className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-accent/30"
                                  >
                                    <span className="text-[11px] text-foreground font-medium truncate">
                                      {u.name.toUpperCase()}
                                      {u.userId === user?.id && (
                                        <span className="ml-1 text-[9px] text-muted-foreground">
                                          (you)
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          toggleUserTrace(u.userId)
                                        }
                                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                                          tracedUserIds.has(u.userId)
                                            ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                                            : "border-border/50 text-muted-foreground hover:text-foreground bg-background/50"
                                        }`}
                                      >
                                        {tracedUserIds.has(u.userId)
                                          ? "Tracking"
                                          : "Track"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          toggleUserVisibility(u.userId)
                                        }
                                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {hiddenUsers.has(u.userId)
                                          ? "Show"
                                          : "Hide"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              </div>
            )}
            {/* end TEAMS */}

            {/* ── TARGET LOGGER — same on/off pattern as the sections
                above. The first switch is the whole feature (the Target
                logger panel on the running sheet and in the quick-entry
                popup); the second is the flag marking where the target is,
                and only applies while tracking is on. Per device. ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Target Logger
              </span>
              {[
                {
                  key: "tracking",
                  label: "Target logger",
                  on: trackingSettings.tracking,
                  toggle: () =>
                    trackingSettings.setTracking(!trackingSettings.tracking),
                  disabled: false,
                  Icon: Crosshair,
                },
                {
                  key: "location",
                  label: "Target location",
                  on: trackingSettings.location,
                  toggle: () =>
                    trackingSettings.setLocation(
                      !trackingSettings.locationSetting
                    ),
                  disabled: !trackingSettings.tracking,
                  Icon: MapPin,
                },
              ].map(({ key, label, on, toggle, disabled, Icon }) => (
                <button
                  key={key}
                  onClick={toggle}
                  disabled={disabled}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 disabled:opacity-50 disabled:active:scale-100 ${
                    on
                      ? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={on}
                  title={
                    disabled ? "Turn Target logger on to use this" : undefined
                  }
                >
                  <Icon
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      on ? "text-sky-500" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      on ? "text-sky-500" : "text-foreground"
                    }`}
                  >
                    {label}
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      on ? "text-sky-500" : "text-muted-foreground"
                    }`}
                  >
                    {on ? "On" : "Off"}
                  </span>
                </button>
              ))}
              {!trackingSettings.tracking && (
                <p className="text-[11px] text-muted-foreground">
                  Target location needs Target logger on.
                </p>
              )}
              {trackingSettings.location && targetFlagStatus && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {targetFlagStatus}
                </p>
              )}
            </div>
            {/* end Target Logger */}

            {/* ── SEARCH — one button, off by default. On: a search for the
                team on the selected sheet's target — a pin where he was last
                seen and two rings round it for how far he could have got.
                Plain arithmetic, nothing sent anywhere. Not for map-only
                Investigator accounts (the history isn't open to them). ── */}
            {!isInvestigator && (
              <TargetPredictorSection
                p={predictor}
                targetName={rsTargetData?.name ?? null}
                operationName={
                  (
                    (operations ?? []) as Array<{ id: number; name: string }>
                  ).find(o => o.id === (activeMapOperationId ?? rsSelectedOpId))
                    ?.name ?? null
                }
                sheetTitle={rsSelectedSheetTitle ?? null}
              />
            )}
            {/* end Search */}

            {/* ── TARGET LOCATION — one switch, off by default. On: the
                markers tied to the target of the active running sheet (by the
                Target Registry or its running sheets) get a soft tile in their
                own colour. Not for map-only Investigator accounts. ── */}
            {!isInvestigator && (
              <TargetLocationSection
                on={showTargetLocation}
                onToggle={() => setShowTargetLocation(v => !v)}
                targetName={rsTargetData?.name ?? null}
                hasSheet={rsSelectedSheetId !== null}
              />
            )}
            {/* end Target Location */}

            {/* ── STREET & HEADING — own section, same on/off pattern as
                Location's "Show & Share" above: a deliberate toggle with
                its own heading rather than a switch buried elsewhere. ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Street &amp; Heading
              </span>
              <button
                onClick={() => setShowStreetHeadingBar(!showStreetHeadingBar)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                  showStreetHeadingBar
                    ? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
                aria-pressed={showStreetHeadingBar}
              >
                <Compass
                  className={`h-3.5 w-3.5 flex-shrink-0 ${
                    showStreetHeadingBar
                      ? "text-sky-500"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-xs font-semibold truncate flex-1 text-left ${
                    showStreetHeadingBar ? "text-sky-500" : "text-foreground"
                  }`}
                >
                  Current Street &amp; Direction
                </span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                    showStreetHeadingBar
                      ? "text-sky-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {showStreetHeadingBar ? "On" : "Off"}
                </span>
              </button>
            </div>
            {/* end Street & Heading */}

            {/* ── NEARBY LOCATION — one switch, off by default. On: every
                Intelligence Folder / Target Registry location within 500 m
                of you is shown as a diamond, with a translucent 500 m area,
                in addition to the normal pins. ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Nearby Location
              </span>
              <button
                onClick={() => setNearbyOn(v => !v)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                  nearbyOn
                    ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
                aria-pressed={nearbyOn}
              >
                <LocateFixed
                  className={`h-3.5 w-3.5 flex-shrink-0 ${
                    nearbyOn ? "text-amber-500" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-xs font-semibold truncate flex-1 text-left ${
                    nearbyOn ? "text-amber-500" : "text-foreground"
                  }`}
                >
                  Nearby location
                </span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                    nearbyOn ? "text-amber-500" : "text-muted-foreground"
                  }`}
                >
                  {nearbyOn ? "On" : "Off"}
                </span>
              </button>
            </div>
            {/* end Nearby Location */}

            {/* ── HEAT MAP — one switch, off by default. On: a soft fade
                at every place seen for the chosen operation (and target),
                all time, under the normal pins. Not for map-only
                Investigator accounts (the report's data isn't open to them). ── */}
            {!isInvestigator && (
              <div className="px-3 py-3 border-b border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                  Heat Map
                </span>
                <button
                  onClick={() => setHeatOn(v => !v)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                    heatOn
                      ? "border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  aria-pressed={heatOn}
                >
                  <Flame
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      heatOn ? "text-orange-500" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold truncate flex-1 text-left ${
                      heatOn ? "text-orange-500" : "text-foreground"
                    }`}
                  >
                    Heat map
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      heatOn ? "text-orange-500" : "text-muted-foreground"
                    }`}
                  >
                    {heatOn ? "On" : "Off"}
                  </span>
                </button>
                {heatOn && (
                  <div className="space-y-2">
                    <Select
                      value={
                        heatOpChoice === "auto" ? "auto" : String(heatOpChoice)
                      }
                      onValueChange={v => {
                        setHeatOpChoice(v === "auto" ? "auto" : Number(v));
                        setHeatTargetChoice("auto");
                      }}
                    >
                      <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                        <SelectValue placeholder="Operation…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          Current{heatOpName ? ` — ${heatOpName}` : ""}
                        </SelectItem>
                        {(
                          (operations ?? []) as Array<{
                            id: number;
                            name: string;
                          }>
                        ).map(o => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={
                        heatTargetChoice === "auto"
                          ? "auto"
                          : String(heatTargetChoice)
                      }
                      onValueChange={v =>
                        setHeatTargetChoice(
                          v === "auto" || v === "all" ? v : Number(v)
                        )
                      }
                    >
                      <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                        <SelectValue placeholder="Target…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          Current — {heatDefaultTargetName ?? "All targets"}
                        </SelectItem>
                        <SelectItem value="all">All targets</SelectItem>
                        {(
                          (heatTargets ?? []) as Array<{
                            id: number;
                            name: string;
                          }>
                        ).map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Transparency
                        </span>
                        <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                          {heatTransparency}%
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={80}
                        step={5}
                        value={[heatTransparency]}
                        onValueChange={v => setHeatTransparency(v[0] ?? 30)}
                        aria-label="Heat map transparency"
                      />
                    </div>
                    {heatError && (
                      <p className="text-[11px] leading-snug text-red-500">
                        The heat map isn&apos;t available for this operation.
                      </p>
                    )}
                    {!heatError &&
                      heatLocations &&
                      heatLocations.length === 0 && (
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          Nothing to show for this selection.
                        </p>
                      )}
                  </div>
                )}
              </div>
            )}
            {/* end Heat Map */}

            {/* ── MARKER ENTITY COUNT — same on/off pattern as Street &
                Heading: the number on a house marker is the total distinct
                people and vehicles linked to it. ── */}
            <div className="px-3 py-3 border-b border-border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Marker Entity Count
              </span>
              <button
                onClick={() => setShowMarkerEntityCount(!showMarkerEntityCount)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
                  showMarkerEntityCount
                    ? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
                aria-pressed={showMarkerEntityCount}
              >
                <Hash
                  className={`h-3.5 w-3.5 flex-shrink-0 ${
                    showMarkerEntityCount
                      ? "text-sky-500"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-xs font-semibold truncate flex-1 text-left ${
                    showMarkerEntityCount ? "text-sky-500" : "text-foreground"
                  }`}
                >
                  Entity count on markers
                </span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                    showMarkerEntityCount
                      ? "text-sky-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {showMarkerEntityCount ? "On" : "Off"}
                </span>
              </button>
            </div>
            {/* end Marker Entity Count */}
          </div>
        )}
        {/* end Pane Body */}
      </div>
      {/* end RS Actions Right Pane */}
    </>
  );
}
