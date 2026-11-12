// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen used to be one
// 4,900-line function; its state and handlers are now these step hooks, called in this order:
// useSheetData → useRowActions → useRowChecks → useRowMembers → useSheetViewState → useSheetEditing.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { locateTargetFromPending } from "@shared/targetPosition";
import { useTargetTrackingSettings } from "@/lib/targetTrackingSettings";
import { resolveTrackedTarget } from "@shared/trackedTarget";
import { useState, useEffect, useMemo, useRef } from "react";
import { extractOccupantNames } from "@/lib/mentionAutocomplete";
import { setLastActiveContext } from "@/lib/lastActiveContext";
import { useLocation, useParams, useSearch } from "wouter";
import { useOffline } from "@/contexts/OfflineContext";
import type { SheetDetailProps } from "./types";

export function useSheetData(s: Pick<SheetDetailProps, "sheetIdProp">) {
  const { sheetIdProp } = s;

  const { id } = useParams<{ id: string }>();
  const sheetId = sheetIdProp ?? parseInt(id ?? "0", 10);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const { isOnline, syncStatus } = useOffline();
  // Offline-aware local row state — used when offline
  const [offlineRows, setOfflineRows] = useState<typeof rows | null>(null);
  const [hasPendingOfflineChanges, setHasPendingOfflineChanges] =
    useState(false);

  // Per-session manual reorder tracking — suppresses auto-sort for rows the user has dragged
  // (client-only; resets on page reload, which is acceptable since sortOrder is persisted)
  const manuallyReorderedRowsRef = useRef<Set<number>>(new Set());
  const markManualReorder = (rowId: number) =>
    manuallyReorderedRowsRef.current.add(rowId);
  // Ref to the auto-sort function — set after parsedRoster and reorderMember are available
  const autoSortRef = useRef<((rowId: number) => void) | null>(null);

  const { data: sheet, isLoading: sheetLoading } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );
  // Pre-fills AddTargetDialog's required OperationPicker with this sheet's
  // own operation, without changing the shape of sheet.get.
  const { data: sheetOperation } = trpc.operation.get.useQuery(
    { id: sheet?.operationId ?? 0 },
    { enabled: isAuthenticated && !!sheet?.operationId }
  );

  // Remembers this as the officer's most recent operation/sheet context —
  // used only to pre-fill the New SMEAC Briefing form, nothing else reads it.
  useEffect(() => {
    if (sheet?.operationId) {
      setLastActiveContext({ operationId: sheet.operationId, sheetId });
    }
  }, [sheet?.operationId, sheetId]);

  const { data: rows, isLoading: rowsLoading } = trpc.row.list.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Jumped here from the Audit Log's "Row" column (?highlightRow=<id>) —
  // scroll to and briefly highlight that row, same scroll+highlight
  // handleJumpToCheckRow already does for a "Check Running Sheet" finding,
  // just triggered by a URL param instead of an in-page dialog callback.
  // Waits for `rows` to actually be loaded (the <tr> won't exist in the DOM
  // before then), then strips the param via replace so refreshing the page
  // doesn't re-trigger it and the URL doesn't keep it around.
  const search = useSearch();
  useEffect(() => {
    if (!rows || rowsLoading) return;
    const raw = new URLSearchParams(search).get("highlightRow");
    const highlightRowId = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(highlightRowId)) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`sheet-row-${highlightRowId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("row-check-highlight");
        window.setTimeout(
          () => el.classList.remove("row-check-highlight"),
          2000
        );
      }
      navigate(`/sheet/${sheetId}`, { replace: true });
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowsLoading, search]);

  const { data: entityChips } = trpc.row.entityChips.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Continuity chips (vehicle arriving/departing, walked in/out) — same
  // sheet-scoped "pending" queries the RS Quick Entry map popup uses (see
  // getPendingVehicleDepartures/Arrivals/WalkIns in server/db.ts). The
  // popup additionally filters these to whichever address pin is open;
  // the full sheet table has no such single-address context, so it shows
  // every pending entry across the sheet instead — see the render block
  // below for how each chip type's text is derived without it.
  const { data: pendingDeparturesBase } =
    trpc.row.pendingVehicleDepartures.useQuery(
      { sheetId },
      {
        enabled: isAuthenticated && !!sheetId && isOnline,
        refetchInterval: isOnline ? 10000 : false,
      }
    );
  const { data: pendingArrivalsBase } =
    trpc.row.pendingVehicleArrivals.useQuery(
      { sheetId },
      {
        enabled: isAuthenticated && !!sheetId && isOnline,
        refetchInterval: isOnline ? 10000 : false,
      }
    );
  const { data: pendingWalkInsBase } = trpc.row.pendingWalkIns.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Has the surveillance ended — every team member ceased and nobody has
  // commenced since (shared/surveillanceState.ts). Ends the Target Logger.
  const { data: surveillance } = trpc.row.surveillanceState.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  const { data: pendingHeadingToBase } = trpc.row.pendingHeadingTo.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  const { data: pendingPlacementsBase } = trpc.row.pendingPlacements.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Continuity cards the team has stopped tracking on this sheet (shared).
  const continuityDismissed = useMemo<Record<string, number>>(() => {
    try {
      return sheet?.continuityDismissed
        ? (JSON.parse(sheet.continuityDismissed) as Record<string, number>)
        : {};
    } catch {
      return {};
    }
  }, [sheet?.continuityDismissed]);
  const setContinuityDismissal = trpc.sheet.setContinuityDismissal.useMutation({
    onSuccess: () => utils.sheet.get.invalidate({ id: sheetId }),
  });

  // The text in an observation cell that is open for editing (not yet saved),
  // so the continuity cards can read it as the newest row and follow each
  // sentence as it is written. `rowId` is the saved row it replaces.
  const [openDraft, setOpenDraft] = useState<{
    rowId: number | null;
    text: string;
  } | null>(null);
  const [openDraftDebounced, setOpenDraftDebounced] = useState(openDraft);
  useEffect(() => {
    const t = setTimeout(() => setOpenDraftDebounced(openDraft), 250);
    return () => clearTimeout(t);
  }, [openDraft]);
  const { data: draftPending } = trpc.row.pendingWithDraft.useQuery(
    {
      sheetId,
      draft: openDraftDebounced?.text ?? "",
      excludeRowId: openDraftDebounced?.rowId ?? null,
    },
    {
      enabled:
        isAuthenticated &&
        !!sheetId &&
        isOnline &&
        !!openDraftDebounced?.text.trim(),
      placeholderData: prev => prev,
    }
  );
  const draftActive = !!openDraftDebounced?.text.trim() && !!draftPending;
  const pendingDepartures = draftActive
    ? draftPending!.departures
    : pendingDeparturesBase;
  const pendingArrivals = draftActive
    ? draftPending!.arrivals
    : pendingArrivalsBase;
  const pendingWalkIns = draftActive
    ? draftPending!.walkIns
    : pendingWalkInsBase;
  const pendingHeadingTo = draftActive
    ? draftPending!.headingTo
    : pendingHeadingToBase;
  const pendingPlacements = draftActive
    ? draftPending!.placements
    : pendingPlacementsBase;
  // Target Logger switches (per device, set in the map's right-hand pane).
  const trackingSettings = useTargetTrackingSettings();
  // What the sheet tracks (a person, a vehicle or a location) — the one rule
  // the cards, the map's flag and its popup share. The title alone answers it
  // until the server's answer (from the linked target) arrives or when offline.
  const { data: trackedTargetData } = trpc.sheet.trackedTarget.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );
  const trackedTarget = useMemo(
    () => trackedTargetData ?? resolveTrackedTarget({ title: sheet?.title }),
    [trackedTargetData, sheet?.title]
  );
  // Where the target is, for marking on the sheet's address chips.
  const targetPosition = useMemo(
    () =>
      trackingSettings.location
        ? locateTargetFromPending({
            subject: trackedTarget,
            arrivals: pendingArrivals ?? [],
            departures: pendingDepartures ?? [],
            walkIns: pendingWalkIns ?? [],
            headingTo: pendingHeadingTo ?? [],
            placements: pendingPlacements ?? [],
            extractNames: extractOccupantNames,
          })
        : null,
    [
      trackingSettings.location,
      trackedTarget,
      pendingArrivals,
      pendingDepartures,
      pendingWalkIns,
      pendingHeadingTo,
      pendingPlacements,
    ]
  );

  return {
    id,
    sheetId,
    user,
    isAuthenticated,
    navigate,
    utils,
    isOnline,
    syncStatus,
    offlineRows,
    setOfflineRows,
    hasPendingOfflineChanges,
    setHasPendingOfflineChanges,
    manuallyReorderedRowsRef,
    autoSortRef,
    sheet,
    sheetLoading,
    sheetOperation,
    rows,
    rowsLoading,
    entityChips,
    surveillance,
    continuityDismissed,
    setContinuityDismissal,
    openDraft,
    setOpenDraft,
    pendingDepartures,
    pendingArrivals,
    pendingWalkIns,
    pendingHeadingTo,
    pendingPlacements,
    trackingSettings,
    trackedTarget,
    targetPosition,
  };
}

export type SheetDataState = ReturnType<typeof useSheetData>;
