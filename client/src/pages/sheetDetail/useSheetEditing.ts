// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen used to be one
// 4,900-line function; its state and handlers are now these step hooks, called in this order:
// useSheetData → useRowActions → useRowChecks → useRowMembers → useSheetViewState → useSheetEditing.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { CinEntry } from "./types";
import { exportToPDF } from "./exportToPDF";
import type { SheetDataState } from "./useSheetData";
import type { SheetViewStateState } from "./useSheetViewState";

export function useSheetEditing(
  s: Pick<
    SheetDataState,
    | "utils"
    | "sheetId"
    | "sheet"
    | "navigate"
    | "isAuthenticated"
    | "isOnline"
    | "offlineRows"
    | "rows"
  > &
    Pick<
      SheetViewStateState,
      | "setEditSheetOpen"
      | "setEditSheetDate"
      | "setEditTargetName"
      | "setEditTargetMode"
      | "setEditTargetSearch"
      | "setEditSelectedTargetId"
      | "allUsers"
      | "myTeams"
      | "searchQuery"
      | "sortReversed"
    >
) {
  const {
    utils,
    sheetId,
    setEditSheetOpen,
    sheet,
    navigate,
    isAuthenticated,
    setEditSheetDate,
    setEditTargetName,
    setEditTargetMode,
    setEditTargetSearch,
    setEditSelectedTargetId,
    allUsers,
    myTeams,
    isOnline,
    offlineRows,
    rows,
    searchQuery,
    sortReversed,
  } = s;

  // Edit roster state
  const [editRosterOpen, setEditRosterOpen] = useState(false);
  const [rosterList, setRosterList] = useState<CinEntry[]>([]);
  const [rosterInput, setRosterInput] = useState("");
  const [rosterInputValid, setRosterInputValid] = useState(false);

  const updateSheet = trpc.sheet.update.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      setEditSheetOpen(false);
      setEditRosterOpen(false);
      toast.success("Sheet updated");
    },
    onError: e => toast.error(e.message),
  });

  // New Target from within the "Edit Sheet" dialog — same structured Add
  // Target dialog as everywhere else, linked straight to the sheet's operation.
  const createTargetForEditSheet = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.listAll.invalidate();
      if (sheet?.operationId) {
        utils.target.list.invalidate({ operationId: sheet.operationId });
      }
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const createLinkedTargetForEditSheet =
    trpc.target.registry.createLinkedFromAssociate.useMutation({
      onSuccess: () => {
        utils.target.listAll.invalidate();
        if (sheet?.operationId) {
          utils.target.list.invalidate({ operationId: sheet.operationId });
        }
      },
      onError: (e: { message: string }) => toast.error(e.message),
    });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => {
      setEditSheetOpen(false);
      toast.success("Running sheet moved to Recycle Bin");
      // Navigate back to the operation page
      if (sheet) navigate(`/operation/${sheet.operationId}`);
      else navigate("/");
    },
    onError: e => toast.error(e.message),
  });

  const [pendingExportType, setPendingExportType] = useState<"pdf" | null>(
    null
  );
  const [exportEnabled, setExportEnabled] = useState(false);
  const {
    data: exportData,
    isFetching: exportFetching,
    refetch: refetchExport,
  } = trpc.export.sheetData.useQuery(
    { id: sheetId },
    {
      enabled: isAuthenticated && !!sheetId && exportEnabled,
      staleTime: 0,
    }
  );

  // When export data arrives and there is a pending type, trigger the download
  useEffect(() => {
    if (exportData && pendingExportType === "pdf" && sheet) {
      exportToPDF(
        sheet.title,
        exportData.rows,
        exportData.operation ?? null,
        exportData.sheet.sheetCins ?? null,
        exportData.sheet.createdAt,
        exportData.targetFullName ?? null,
        exportData.sheet.sheetDate ?? null
      );
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

  const openEditSheet = () => {
    setEditSheetDate(
      (sheet as { sheetDate?: string | null } | undefined)?.sheetDate ??
        new Date().toISOString().slice(0, 10)
    );
    setEditTargetName(sheet?.targetName ?? "");
    setEditTargetMode("none");
    setEditTargetSearch("");
    setEditSelectedTargetId(sheet?.targetId ?? null);
    setEditSheetOpen(true);
  };

  const openEditRoster = () => {
    const parsed: CinEntry[] = (() => {
      try {
        return sheet?.sheetCins ? JSON.parse(sheet.sheetCins) : [];
      } catch {
        return [];
      }
    })();
    setRosterList(parsed);
    setRosterInput("");
    setEditRosterOpen(true);
  };

  const handleAddRosterTeam = (teamId: number) => {
    if (!allUsers) {
      toast.error("User list not available");
      return;
    }
    const members = allUsers.filter(u => u.teamId === teamId);
    if (members.length === 0) {
      toast.error("No members found in that team");
      return;
    }
    let added = 0;
    setRosterList(prev => {
      let updated = [...prev];
      for (const m of members) {
        if (!updated.some(c => c.cin.toLowerCase() === m.cin.toLowerCase())) {
          updated = [
            ...updated,
            {
              cin: m.cin,
              hasImages: false,
              isTeamLeader: false,
              isAuthor: false,
            },
          ];
          added++;
        }
      }
      return updated;
    });
    if (added === 0) toast.info("All team members already added");
    else
      toast.success(
        `Added ${added} member${added !== 1 ? "s" : ""} from ${myTeams.find(t => t.id === teamId)?.name ?? "the team"}`
      );
  };

  const handleAddRosterCin = () => {
    const trimmed = rosterInput.trim().toUpperCase();
    if (!trimmed) return;
    // Must be a registered user
    const registeredCins = new Set(
      (allUsers ?? []).map(u => u.cin.toUpperCase())
    );
    if (!registeredCins.has(trimmed)) {
      toast.error(`CIN "${trimmed}" is not a registered user`);
      return;
    }
    if (rosterList.some(c => c.cin.toUpperCase() === trimmed)) {
      toast.error("CIN already in team");
      return;
    }
    setRosterList(prev => [
      ...prev,
      { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false },
    ]);
    setRosterInput("");
    setRosterInputValid(false);
  };

  const handleExport = useCallback(() => {
    if (!sheet) return;
    if (exportData && !exportFetching) {
      setPendingExportType("pdf");
      refetchExport();
      return;
    }
    setPendingExportType("pdf");
    setExportEnabled(true);
  }, [sheet, exportData, exportFetching, refetchExport]);

  // Use offline cached rows when offline, live rows when online
  const displayRows = !isOnline && offlineRows ? offlineRows : rows;

  // Filter rows by search query (time, observation, member names)
  // NOTE: must be above the early return to satisfy React rules-of-hooks
  // ── Day-offset map: detect midnight rollovers from the time sequence itself ──
  // Scans timed rows in entry order (by rowNumber); when the effective time drops
  // by more than 2 hours it treats that as a midnight rollover and increments the
  // day counter. Shared between the sort and the date-divider render logic.
  const rowDayOffsetMap = useMemo(() => {
    if (!displayRows) return new Map<number, number>();
    // MUST sort by rowNumber (entry order) before scanning for rollovers.
    // displayRows may already be sorted by effective time from the server,
    // so we explicitly re-sort here to get the correct insertion sequence.
    const timedByRowNumber = [...displayRows]
      .filter((r: NonNullable<typeof rows>[0]) => r.timeMinutes != null)
      .sort(
        (a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) =>
          a.rowNumber - b.rowNumber
      );
    const map = new Map<number, number>();

    // Find the earliest rowDate among all rows that have one (day-0 anchor)
    const allRowDates = timedByRowNumber
      .map(
        (r: NonNullable<typeof rows>[0]) =>
          (r as any).rowDate as string | null | undefined
      )
      .filter((d): d is string => !!d);
    const minRowDate =
      allRowDates.length > 0 ? allRowDates.slice().sort()[0] : null;

    // First pass: assign offsets from rowDate (highest priority) or stored dayOffset (legacy)
    for (const r of timedByRowNumber) {
      const rd = (r as any).rowDate as string | null | undefined;
      if (rd && minRowDate) {
        // Day index relative to earliest rowDate in this sheet (Perth UTC+8)
        const anchor = new Date(minRowDate + "T00:00:00+08:00").getTime();
        const rowDay = new Date(rd + "T00:00:00+08:00").getTime();
        const dayIdx = Math.round((rowDay - anchor) / 86400000);
        map.set(r.id, dayIdx);
      } else if ((r as any).dayOffset !== 0 && (r as any).dayOffset != null) {
        map.set(r.id, (r as any).dayOffset);
      }
    }
    // Second pass: infer for rows with no explicit date/offset
    let day = 0;
    let prevEff = -1;
    for (const r of timedByRowNumber) {
      if (map.has(r.id)) {
        prevEff = (r.timeMinutes ?? 0) + map.get(r.id)! * 1440;
        day = map.get(r.id)!;
        continue;
      }
      const mins = r.timeMinutes ?? 0;
      const eff = mins + day * 1440;
      if (prevEff >= 0 && eff < prevEff - 120) day++;
      map.set(r.id, day);
      prevEff = mins + day * 1440;
    }
    return map;
  }, [displayRows]);

  // True when any row in this sheet has a day offset > 0 (sheet has crossed midnight)
  const sheetHasCrossedMidnight = useMemo(() => {
    if (!displayRows) return false;
    return Array.from(rowDayOffsetMap.values()).some(v => v > 0);
  }, [displayRows, rowDayOffsetMap]);

  const filteredRows = useMemo(() => {
    if (!displayRows) return [];
    const filtered = !searchQuery.trim()
      ? displayRows
      : displayRows.filter((row: NonNullable<typeof rows>[0]) => {
          const q = searchQuery.toLowerCase();
          if (row.time?.toLowerCase().includes(q)) return true;
          if (row.observation?.toLowerCase().includes(q)) return true;
          if (
            row.members?.some((m: { memberName: string }) =>
              m.memberName.toLowerCase().includes(q)
            )
          )
            return true;
          return false;
        });
    // Rows with no time set ALWAYS float to the top (newest/being filled in)
    const withTime = filtered.filter(
      (row: NonNullable<typeof rows>[0]) => row.timeMinutes != null
    );
    const noTime = filtered.filter(
      (row: NonNullable<typeof rows>[0]) => row.timeMinutes == null
    );
    const effectiveMinutes = (row: NonNullable<typeof rows>[0]) =>
      (row.timeMinutes ?? 0) + (rowDayOffsetMap.get(row.id) ?? 0) * 1440;
    // Sort timed rows by effective (day-offset) timeMinutes, then rowNumber as tie-break
    const sortedWithTime = [...withTime].sort(
      (a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) => {
        const timeDiff = effectiveMinutes(a) - effectiveMinutes(b);
        if (timeDiff !== 0) return sortReversed ? -timeDiff : timeDiff;
        return sortReversed
          ? b.rowNumber - a.rowNumber
          : a.rowNumber - b.rowNumber;
      }
    );
    // No-time rows sorted by descending rowNumber (most recently added first)
    const sortedNoTime = [...noTime].sort(
      (a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) =>
        b.rowNumber - a.rowNumber
    );
    // No-time rows always at the TOP regardless of sort direction
    return [...sortedNoTime, ...sortedWithTime];
  }, [displayRows, searchQuery, sortReversed, rowDayOffsetMap]);

  return {
    editRosterOpen,
    setEditRosterOpen,
    rosterList,
    setRosterList,
    rosterInput,
    setRosterInput,
    rosterInputValid,
    setRosterInputValid,
    updateSheet,
    createTargetForEditSheet,
    createLinkedTargetForEditSheet,
    deleteSheet,
    exportFetching,
    openEditSheet,
    openEditRoster,
    handleAddRosterTeam,
    handleAddRosterCin,
    handleExport,
    rowDayOffsetMap,
    sheetHasCrossedMidnight,
    filteredRows,
  };
}

export type SheetEditingState = ReturnType<typeof useSheetEditing>;
