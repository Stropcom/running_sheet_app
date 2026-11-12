// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useEffect, useMemo, useRef, useState } from "react";
import { wholeSentenceChips } from "@shared/sentenceJoin";
import { popupShortAddress } from "@shared/markerLink";
import { locateTargetFromPending } from "@shared/targetPosition";
import { extractOccupantNames } from "@/lib/mentionAutocomplete";
import { trpc } from "@/lib/trpc";
import { resolveTrackedTarget } from "@shared/trackedTarget";
import { useTargetPredictor } from "@/components/TargetPredictor";
import type { MapPanesState } from "./useMapPanes";
import type { MapDataState } from "./useMapData";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapBasicsState } from "./useMapBasics";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { QeDupe } from "./screenTypes";

export function useMapRsDraft(
  s: Pick<
    MapPanesState,
    | "rsSelectedSheetId"
    | "rsInlineText"
    | "rsSelectedOpId"
    | "setRsSelectedSheetId"
    | "setRsLastEntry"
    | "setRsEditingLastEntry"
  > &
    Pick<
      MapDataState,
      | "rsTrackingActive"
      | "trackingSettings"
      | "rsSheetsData"
      | "utils"
      | "rsPendingDeparturesBase"
      | "rsPendingArrivalsBase"
      | "rsPendingWalkInsBase"
      | "rsPendingHeadingToBase"
      | "activeMapOperationId"
    > &
    Pick<MapPlacingState, "mapQeOpen" | "mapQeAddress"> &
    Pick<
      MapBasicsState,
      | "activeTargetIdRef"
      | "isInvestigator"
      | "selectedOpIds"
      | "heatOpChoice"
      | "heatOn"
      | "selectedTargetIds"
      | "heatTargetChoice"
      | "setOpsExplicitlySet"
      | "setSelectedOpIds"
      | "setSelectedTargetIds"
      | "setMultiOpMode"
      | "setOpsDropdownOpen"
      | "multiOpMode"
      | "user"
    > &
    Pick<MapAddressSearchState, "operations">
) {
  const {
    rsSelectedSheetId,
    rsTrackingActive,
    trackingSettings,
    rsSheetsData,
    utils,
    rsInlineText,
    mapQeOpen,
    rsPendingDeparturesBase,
    rsPendingArrivalsBase,
    rsPendingWalkInsBase,
    rsPendingHeadingToBase,
    mapQeAddress,
    activeTargetIdRef,
    isInvestigator,
    rsSelectedOpId,
    selectedOpIds,
    operations,
    heatOpChoice,
    heatOn,
    selectedTargetIds,
    heatTargetChoice,
    activeMapOperationId,
    setOpsExplicitlySet,
    setSelectedOpIds,
    setSelectedTargetIds,
    setRsSelectedSheetId,
    setRsLastEntry,
    setRsEditingLastEntry,
    setMultiOpMode,
    setOpsDropdownOpen,
    multiOpMode,
    user,
  } = s;

  // People who walked to / got into a vehicle (see getPendingPlacements).
  const { data: rsPendingPlacementsBase } = trpc.row.pendingPlacements.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    {
      enabled: rsTrackingActive && !!rsSelectedSheetId,
      refetchInterval: trackingSettings.location ? 15000 : false,
    }
  );
  // Continuity cards the team has stopped tracking on this sheet — shared
  // with the running sheet's own "Where now" band (same keys).
  const rsContinuityDismissed = useMemo<Record<string, number>>(() => {
    const sh = (rsSheetsData as any[] | undefined)?.find(
      (x: any) => x.id === rsSelectedSheetId
    );
    try {
      return sh?.continuityDismissed ? JSON.parse(sh.continuityDismissed) : {};
    } catch {
      return {};
    }
  }, [rsSheetsData, rsSelectedSheetId]);
  const setContinuityDismissal = trpc.sheet.setContinuityDismissal.useMutation({
    onSuccess: () => {
      void utils.sheet.listByOperations.invalidate();
      void utils.sheet.get.invalidate();
    },
  });
  // The same four lists, read with the text being typed in the observation box
  // (not yet saved) counted as the newest row — so the cards below follow each
  // sentence as it is written: type "BAIG exited A and walked towards Vehicle
  // X." and the next options already have him back in the vehicle. Falls back
  // to the saved-only lists until the first answer arrives.
  const [rsDraftDebounced, setRsDraftDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setRsDraftDebounced(rsInlineText), 250);
    return () => clearTimeout(t);
  }, [rsInlineText]);
  const { data: rsDraftPending } = trpc.row.pendingWithDraft.useQuery(
    { sheetId: rsSelectedSheetId ?? 0, draft: rsDraftDebounced },
    {
      enabled: mapQeOpen && !!rsSelectedSheetId && !!rsDraftDebounced.trim(),
      // Keep the previous answer while the next one loads so the cards don't
      // flicker back to the saved-only state on every keystroke.
      placeholderData: prev => prev,
    }
  );
  const draftActive = !!rsDraftDebounced.trim() && !!rsDraftPending;
  const rsPendingDepartures = draftActive
    ? rsDraftPending!.departures
    : rsPendingDeparturesBase;
  const rsPendingArrivals = draftActive
    ? rsDraftPending!.arrivals
    : rsPendingArrivalsBase;
  const rsPendingWalkIns = draftActive
    ? rsDraftPending!.walkIns
    : rsPendingWalkInsBase;
  const rsPendingHeadingTo = draftActive
    ? rsDraftPending!.headingTo
    : rsPendingHeadingToBase;
  const rsPendingPlacements = draftActive
    ? rsDraftPending!.placements
    : rsPendingPlacementsBase;
  // Where the target is on the selected sheet — marked on the map with a flag
  // above that place's pin (see the Target location flag effect below).
  // What the selected sheet tracks — a person, a vehicle or a location — by
  // the one rule the sheet's cards share (shared/trackedTarget.ts). The title
  // answers it until the server's answer (from the linked target) arrives.
  const { data: rsTrackedTargetData } = trpc.sheet.trackedTarget.useQuery(
    { sheetId: rsSelectedSheetId ?? 0 },
    { enabled: !!rsSelectedSheetId }
  );
  const rsSelectedSheetTitle = (rsSheetsData as any[] | undefined)?.find(
    (x: any) => x.id === rsSelectedSheetId
  )?.title as string | undefined;
  const rsTrackedTarget = useMemo(
    () =>
      rsSelectedSheetId
        ? (rsTrackedTargetData ??
          resolveTrackedTarget({ title: rsSelectedSheetTitle }))
        : null,
    [rsSelectedSheetId, rsTrackedTargetData, rsSelectedSheetTitle]
  );
  const rsTargetPosition = useMemo(() => {
    if (!trackingSettings.location || !rsSelectedSheetId) return null;
    return locateTargetFromPending({
      subject: rsTrackedTarget,
      arrivals: rsPendingArrivals ?? [],
      departures: rsPendingDepartures ?? [],
      walkIns: rsPendingWalkIns ?? [],
      headingTo: rsPendingHeadingTo ?? [],
      placements: rsPendingPlacements ?? [],
      extractNames: extractOccupantNames,
    });
  }, [
    trackingSettings.location,
    rsSelectedSheetId,
    rsTrackedTarget,
    rsPendingArrivals,
    rsPendingDepartures,
    rsPendingWalkIns,
    rsPendingHeadingTo,
    rsPendingPlacements,
  ]);
  // Short-form of the quick-entry address (mirrors the extraction the
  // "Address chips" section below already does) — used only to check
  // whether this address has already been mentioned in the sheet, for the
  // vehicle-arriving chip's full-vs-short decision.
  const rsQeShortAddr = useMemo(() => {
    if (!mapQeAddress) return "";
    return popupShortAddress(mapQeAddress);
  }, [mapQeAddress]);
  // Has this address already been mentioned (full bracketed form) anywhere
  // in this sheet? If so the vehicle-arriving chip uses the short form,
  // matching the app-wide first-mention-full/subsequent-mention-short rule
  // that Intelligence's entity extraction relies on.
  const { data: rsAddressMentionedData } = trpc.row.addressMentioned.useQuery(
    { sheetId: rsSelectedSheetId ?? 0, shortAddress: rsQeShortAddr },
    { enabled: mapQeOpen && !!rsSelectedSheetId && !!rsQeShortAddr }
  );
  // RS Actions pane — target for selected sheet
  const { data: rsTargetData } = trpc.intelligence.getSheetTarget.useQuery(
    { sheetId: rsSelectedSheetId! },
    { enabled: rsSelectedSheetId !== null }
  );
  activeTargetIdRef.current = isInvestigator
    ? null
    : (rsTargetData?.id ?? null);
  // Heat Map — which operation and target. By default the same ones the top
  // of the pane has selected: the running sheet's operation and its target, else
  // the map's first selected operation (and a single selected target). Anything
  // chosen in the Heat Map section overrides that.
  const heatDefaultOpId: number | null =
    rsSelectedOpId ??
    selectedOpIds[0] ??
    ((operations ?? []) as Array<{ id: number }>)[0]?.id ??
    null;
  const heatOpId: number | null =
    heatOpChoice === "auto" ? heatDefaultOpId : heatOpChoice;
  const { data: heatTargets } = trpc.target.list.useQuery(
    { operationId: heatOpId! },
    { enabled: heatOn && heatOpId != null && !isInvestigator }
  );
  const heatDefaultTargetId: number | null =
    rsSelectedOpId != null && heatOpId === rsSelectedOpId && rsTargetData?.id
      ? rsTargetData.id
      : selectedTargetIds.length === 1
        ? selectedTargetIds[0]
        : null;
  // A default target only counts if it really belongs to the operation.
  const heatDefaultTargetValid =
    heatDefaultTargetId != null &&
    ((heatTargets ?? []) as Array<{ id: number }>).some(
      t => t.id === heatDefaultTargetId
    );
  const heatTargetId: number | null =
    heatTargetChoice === "all"
      ? null
      : typeof heatTargetChoice === "number"
        ? heatTargetChoice
        : heatDefaultTargetValid
          ? heatDefaultTargetId
          : null;
  const { data: heatLocations, error: heatError } =
    trpc.intelligence.getHeatMapLocations.useQuery(
      {
        operationId: heatOpId!,
        targetId: heatTargetId,
        when: { mode: "all" },
      },
      {
        // wait for the operation's targets, so a default target is applied
        // before the first request rather than after it
        enabled:
          heatOn &&
          heatOpId != null &&
          !isInvestigator &&
          (heatTargets !== undefined || heatTargetChoice !== "auto"),
        retry: false,
      }
    );
  const heatOpName = (
    (operations ?? []) as Array<{ id: number; name: string }>
  ).find(o => o.id === heatDefaultOpId)?.name;
  const heatDefaultTargetName = heatDefaultTargetValid
    ? ((heatTargets ?? []) as Array<{ id: number; name: string }>).find(
        t => t.id === heatDefaultTargetId
      )?.name
    : undefined;
  // Search — the target, operation and running sheet picked at the
  // top of the pane (see components/TargetPredictor.tsx).
  const predictor = useTargetPredictor({
    // The sheet's own operation (rsSelectedOpId is not set by anything on this
    // page, so it cannot be relied on).
    opId: isInvestigator ? null : (activeMapOperationId ?? rsSelectedOpId),
    sheetId: isInvestigator ? null : rsSelectedSheetId,
    targetId: isInvestigator ? null : (rsTargetData?.id ?? null),
    // A Search running on any operation selected here is shown here.
    selectedOpIds: isInvestigator
      ? []
      : selectedOpIds.length > 0
        ? selectedOpIds
        : activeMapOperationId != null
          ? [activeMapOperationId]
          : [],
  });
  const predictorOn = predictor.on;
  // RS Actions pane — create row mutation
  const rsAddMember = trpc.member.add.useMutation();
  const rsCreateRow = trpc.row.create.useMutation();
  const [qeDupeQueue, setQeDupeQueue] = useState<QeDupe[]>([]);
  const [qeDupeIndex, setQeDupeIndex] = useState(0);
  const [qeDupeDialogOpen, setQeDupeDialogOpen] = useState(false);
  const [qeVagueVehicleBusy, setQeVagueVehicleBusy] = useState(false);
  const qePendingEntryRef = useRef<{
    observation: string;
    cinsToAttach: Set<string> | null;
    timeOverride: string | null;
    rowDateOverride: string | null;
    viaVoice: boolean;
  } | null>(null);
  const mergeEntitiesMut = trpc.intelligence.mergeEntities.useMutation();
  const markEntitiesNotDuplicateMut =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();
  // General shortcuts for quick entry buttons
  const { data: generalShortcuts } = trpc.shortcuts.list.useQuery(undefined, {
    staleTime: 0,
  });
  // The chips that are whole sentences — the tidy-up puts a full stop between
  // two of them (shared/sentenceJoin.ts).
  const sentenceChips = useMemo(
    () => wholeSentenceChips((generalShortcuts ?? []).map(s => s.expansion)),
    [generalShortcuts]
  );
  // Target shortcuts for the selected sheet's target
  const { data: targetShortcuts } = trpc.targetShortcuts.list.useQuery(
    { targetId: rsTargetData?.id! },
    { enabled: !!rsTargetData?.id }
  );

  // Per-sheet target shortcuts (for RS Quick Entry shortcut expansion)
  const { data: targetShortcutsForSheet } =
    trpc.targetShortcuts.listForSheet.useQuery(
      { sheetId: rsSelectedSheetId! },
      { enabled: !!rsSelectedSheetId }
    );
  // Assigned target for the selected sheet (for TGT/HBF/HB/V1F/V1/V2F/V2/DEP/ARR shortcuts)
  const { data: assignedTarget } = trpc.target.getById.useQuery(
    { id: rsTargetData?.id ?? 0 },
    { enabled: !!rsTargetData?.id }
  );
  // Combined shortcut map for RS Quick Entry textarea
  const mapQeShortcutMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of (generalShortcuts as any[]) ?? [])
      map[s.trigger.toLowerCase()] = s.expansion;
    if (assignedTarget) {
      const t = assignedTarget as any;
      if (t.tgt) map["tgt"] = t.tgt;
      if (t.hbf) map["hbf"] = t.hbf;
      if (t.hb) map["hb"] = t.hb;
      if (t.v1f) map["v1f"] = t.v1f;
      if (t.v1) map["v1"] = t.v1;
      if (t.v2f) map["v2f"] = t.v2f;
      if (t.v2) map["v2"] = t.v2;
      if (t.dep) map["dep"] = t.dep;
      if (t.arr) map["arr"] = t.arr;
      // Extra vehicles (V2F/V2, V3F/V3, …)
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(
          t.extraVehicles ?? "[]"
        );
        evs.forEach((ev: { full: string; short: string }, i: number) => {
          const num = i + 2;
          if (ev.full) map[`v${num}f`] = ev.full;
          if (ev.short) map[`v${num}`] = ev.short;
        });
      } catch {}
      // Wild fields (#1, #2, …)
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(
          t.wildFields ?? "[]"
        );
        wfs.forEach((wf: { label: string; value: string }) => {
          if (wf.value) map[wf.label.toLowerCase()] = wf.value;
        });
      } catch {}
    }
    for (const s of (targetShortcutsForSheet as any[]) ?? [])
      map[s.trigger.toLowerCase()] = s.expansion;
    return map;
  }, [generalShortcuts, assignedTarget, targetShortcutsForSheet]);

  // Targets per operation
  // Also unscoped (every target, every operation) — not offered to
  // Investigator accounts; blocked server-side too.
  const { data: allTargets } = trpc.target.registry.list.useQuery(undefined, {
    enabled: !isInvestigator,
  });
  const opTargetMap = new Map<number, Array<{ id: number; name: string }>>();
  if (allTargets) {
    for (const t of allTargets as any[]) {
      const opId = t.operationId;
      if (!opId) continue;
      if (!opTargetMap.has(opId)) opTargetMap.set(opId, []);
      opTargetMap.get(opId)!.push({ id: t.id, name: t.name });
    }
  }

  // ── Filter handlers ──────────────────────────────────────────────────────────
  // Multi-select toggle (only reachable while multiOpMode is on — see
  // handleOpRowClick) — accumulates/removes from selectedOpIds and leaves
  // the dropdown open so several operations can be picked in one visit.
  // Narrowing the selection back down to one (or zero) operations by
  // REMOVING one drops multiOpMode back to single-select automatically,
  // since there's no longer anything to be "multi" about — but adding never
  // triggers that, so picking your first couple of operations after turning
  // Multi on doesn't immediately kick you back out of multi mode.
  const toggleOp = (opId: number) => {
    setOpsExplicitlySet(true);
    setSelectedOpIds(prev => {
      const isRemoval = prev.includes(opId);
      const next = isRemoval ? prev.filter(id => id !== opId) : [...prev, opId];
      if (isRemoval) {
        const opTargets = opTargetMap.get(opId) ?? [];
        setSelectedTargetIds(tPrev =>
          tPrev.filter(tid => !opTargets.find(t => t.id === tid))
        );
        // If all ops are now deselected, clear RS selection too
        if (next.length === 0) {
          setRsSelectedSheetId(null);
          setRsLastEntry(null);
          setRsEditingLastEntry(false);
        }
        if (next.length <= 1) setMultiOpMode(false);
      }
      return next;
    });
  };

  // Single-select pick — the default mode. Replaces the whole selection
  // with just this operation (so the map's markers/pins/sheets for the
  // previously-selected operation are dropped and the new operation's data
  // loads in their place, via the operationIds-scoped queries below reacting
  // to selectedOpIds changing), clears target/RS-sheet selections since
  // those belonged to the old operation, and closes the dropdown. Re-picking
  // the operation that's already the sole selection deselects it instead,
  // matching checkbox semantics.
  const selectSingleOp = (opId: number) => {
    setOpsExplicitlySet(true);
    setSelectedOpIds(prev =>
      prev.length === 1 && prev[0] === opId ? [] : [opId]
    );
    setSelectedTargetIds([]);
    setRsSelectedSheetId(null);
    setRsLastEntry(null);
    setRsEditingLastEntry(false);
    setOpsDropdownOpen(false);
  };

  const handleOpRowClick = (opId: number) => {
    if (multiOpMode) toggleOp(opId);
    else selectSingleOp(opId);
  };

  const toggleTarget = (targetId: number) => {
    setSelectedTargetIds(prev =>
      prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId]
    );
  };

  const clearAll = () => {
    setOpsExplicitlySet(true);
    setSelectedOpIds([]);
    setSelectedTargetIds([]);
    setRsSelectedSheetId(null);
    setRsLastEntry(null);
    setRsEditingLastEntry(false);
    setMultiOpMode(false);
  };
  // Mirrors user?.id for createUserPinElement, a useCallback with empty
  // deps that can't otherwise see a fresh value across renders — used to
  // decide whether a given pin is the viewer's own (only the own pin gets
  // a click listener for the On Foot popup).
  const ownUserIdRef = useRef<number | undefined>(user?.id);

  return {
    rsContinuityDismissed,
    setContinuityDismissal,
    rsPendingDepartures,
    rsPendingArrivals,
    rsPendingWalkIns,
    rsPendingHeadingTo,
    rsPendingPlacements,
    rsSelectedSheetTitle,
    rsTrackedTarget,
    rsTargetPosition,
    rsQeShortAddr,
    rsAddressMentionedData,
    rsTargetData,
    heatTargets,
    heatLocations,
    heatError,
    heatOpName,
    heatDefaultTargetName,
    predictor,
    predictorOn,
    rsAddMember,
    rsCreateRow,
    qeDupeQueue,
    setQeDupeQueue,
    qeDupeIndex,
    setQeDupeIndex,
    qeDupeDialogOpen,
    setQeDupeDialogOpen,
    qeVagueVehicleBusy,
    setQeVagueVehicleBusy,
    qePendingEntryRef,
    mergeEntitiesMut,
    markEntitiesNotDuplicateMut,
    generalShortcuts,
    sentenceChips,
    assignedTarget,
    mapQeShortcutMap,
    opTargetMap,
    handleOpRowClick,
    toggleTarget,
    clearAll,
    ownUserIdRef,
  };
}

export type MapRsDraftState = ReturnType<typeof useMapRsDraft>;
