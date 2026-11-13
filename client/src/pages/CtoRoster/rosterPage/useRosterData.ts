// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the modes, selections, queries, the grid's derived lists and the mutations.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useRosterScreen) and its layout is RosterView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useMemo, useRef } from "react";
import { opsByTeam } from "@shared/rosterTaskingOps";
import { trpc } from "@/lib/trpc";
import {} from "lucide-react";
import { ROSTER_START, ROSTER_END } from "@shared/ctoRosterShiftUtils";
import { toast } from "sonner";
import type { Member, Team, ShiftData, Secondment, EbaFinding } from "./types";
import type { RosterGridState } from "./useRosterGrid";

export function useRosterData(s: Pick<RosterGridState, "isAdmin">) {
  const { isAdmin } = s;

  // Bulk edit
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<
    Map<string, { memberId: number; date: string }>
  >(new Map());
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const isDraggingSelection = useRef(false);

  // Bulk copy (Excel-style: select block → copy → click paste-start cell)
  const [bulkCopyMode, setBulkCopyMode] = useState(false); // selecting cells for copy
  const [copiedBlock, setCopiedBlock] = useState<{
    cells: {
      memberId: number;
      date: string;
      shiftCode: string;
      comment: string;
      isActing: boolean;
      shiftTime: string | null;
      shiftDurationHours: number | null;
    }[];
    memberIds: number[]; // ordered unique member IDs in the block
    dates: string[]; // ordered unique dates in the block
  } | null>(null); // null = nothing copied yet; non-null = ready to paste
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false); // old dialog (kept for fallback, unused)

  // Cell edit sheet
  const [editSheet, setEditSheet] = useState<{
    open: boolean;
    memberId: number;
    memberName: string;
    date: string;
    currentCode: string;
    currentComment: string;
    currentIsActing: boolean;
    currentShiftTime: string | null;
    currentShiftDurationHours: number | null;
  } | null>(null);

  // Copy/paste clipboard
  const [clipboard, setClipboard] = useState<{
    code: string;
    comment: string;
    isActing: boolean;
  } | null>(null);

  // DnD
  const [localMembers, setLocalMembers] = useState<Member[] | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [overTeamId, setOverTeamId] = useState<number | null>(null);

  // Data
  const { data: teamsData } = trpc.ctoRoster.teams.list.useQuery();
  const { data: membersData, refetch: refetchMembers } =
    trpc.ctoRoster.members.list.useQuery();
  const { data: shiftsData, isLoading } =
    trpc.ctoRoster.roster.getRange.useQuery(
      { startDate: ROSTER_START, endDate: ROSTER_END },
      // A roster left open (a wall screen, a second window) asks again every
      // 30 seconds while it is visible, and when its tab is clicked back into,
      // so a change made elsewhere shows within about half a minute.
      { staleTime: 15_000, refetchInterval: 30_000 }
    );
  const { data: secondmentsData } = trpc.ctoRoster.secondments.list.useQuery();

  // Live EA compliance findings, recomputed from current shift data — used to
  // mark affected cells with a red dot and show detail in the edit sheet.
  const ebaQuery = trpc.ctoRoster.eba.liveFindings.useQuery(undefined, {
    enabled: isAdmin,
    staleTime: 30_000,
  });
  // The operation each team is tasked on (posted weeks), shown on the tiles of
  // people on duty. Refused or off for this Command: no names, nothing else.
  const taskingOpsQuery = trpc.opManager.postedTaskingOps.useQuery(
    { startDate: ROSTER_START, endDate: ROSTER_END },
    { staleTime: 5_000, refetchInterval: 30_000, retry: false }
  );
  const teamOpsByName = useMemo(
    () => opsByTeam(taskingOpsQuery.data ?? []),
    [taskingOpsQuery.data]
  );
  const issuesByCell = useMemo(() => {
    const map = new Map<string, EbaFinding[]>();
    for (const f of ebaQuery.data?.findings ?? []) {
      for (const d of f.dates) {
        const key = `${f.memberId}-${d}`;
        const existing = map.get(key);
        if (existing) existing.push(f);
        else map.set(key, [f]);
      }
    }
    return map;
  }, [ebaQuery.data]);
  const issueCells = useMemo(
    () => new Set(issuesByCell.keys()),
    [issuesByCell]
  );

  // One secondment at a time per member (enforced server-side), so this is
  // a straight memberId -> secondment lookup.
  const secondmentByMemberId = useMemo(() => {
    const map = new Map<number, Secondment>();
    for (const s of secondmentsData ?? []) map.set(s.memberId, s as Secondment);
    return map;
  }, [secondmentsData]);

  const utils = trpc.useUtils();
  const updateShift = trpc.ctoRoster.roster.updateShift.useMutation({
    onMutate: async vars => {
      // Optimistic update: immediately reflect the change in the cache
      await utils.ctoRoster.roster.getRange.cancel();
      const prev = utils.ctoRoster.roster.getRange.getData({
        startDate: ROSTER_START,
        endDate: ROSTER_END,
      });
      utils.ctoRoster.roster.getRange.setData(
        { startDate: ROSTER_START, endDate: ROSTER_END },
        old => {
          if (!old) return old;
          const updated = old.map(s => {
            if (
              s.memberId === vars.memberId &&
              s.shiftDate === vars.shiftDate
            ) {
              return {
                ...s,
                shiftCode: vars.shiftCode,
                shiftTime:
                  vars.shiftTime !== undefined
                    ? (vars.shiftTime ?? null)
                    : s.shiftTime,
                comment: vars.comment !== undefined ? vars.comment : s.comment,
                isActing:
                  vars.isActing !== undefined ? vars.isActing : s.isActing,
              };
            }
            return s;
          });
          return updated;
        }
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      // Roll back on error
      if (ctx?.prev)
        utils.ctoRoster.roster.getRange.setData(
          { startDate: ROSTER_START, endDate: ROSTER_END },
          ctx.prev
        );
      toast.error(`Failed to update: ${e.message}`);
    },
    onSettled: () => {
      utils.ctoRoster.roster.getRange.invalidate();
      utils.ctoRoster.eba.liveFindings.invalidate();
    },
  });
  const bulkUpdate = trpc.ctoRoster.roster.bulkUpdate.useMutation({
    onSuccess: data => {
      utils.ctoRoster.roster.getRange.invalidate();
      utils.ctoRoster.eba.liveFindings.invalidate();
      setSelectedCells(new Map());
      setBulkSheetOpen(false);
      setBulkMode(false);
      toast.success(`Updated ${data.count} shifts`);
    },
    onError: e => toast.error(`Bulk update failed: ${e.message}`),
  });
  const bulkCopy = trpc.ctoRoster.roster.bulkCopy.useMutation({
    onSuccess: data => {
      utils.ctoRoster.roster.getRange.invalidate();
      utils.ctoRoster.eba.liveFindings.invalidate();
      setBulkCopyOpen(false);
      toast.success(`Copied ${data.count} shifts`);
    },
    onError: e => toast.error(`Bulk copy failed: ${e.message}`),
  });
  const reorderMembers = trpc.ctoRoster.members.reorder.useMutation({
    onSuccess: async () => {
      await refetchMembers();
      setLocalMembers(null);
    },
    onError: e => {
      toast.error(`Failed to move: ${e.message}`);
      setLocalMembers(null);
    },
  });

  const displayMembers: Member[] = useMemo(() => {
    const source = localMembers ?? (membersData as Member[] | undefined) ?? [];
    return [...source].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [localMembers, membersData]);

  // Visual row order: members grouped by team (team sortOrder), then by member sortOrder within team.
  // This matches the exact render order of the grid and must be used for bulk-copy delta calculations.
  const visualRowMembers: Member[] = useMemo(() => {
    const teams = ((teamsData as Team[]) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return teams.flatMap(t =>
      displayMembers
        .filter(m => m.teamId === t.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
  }, [teamsData, displayMembers]);

  const shiftMap = useMemo(() => {
    const map = new Map<number, Map<string, ShiftData>>();
    for (const s of (shiftsData as ShiftData[]) ?? []) {
      if (!map.has(s.memberId)) map.set(s.memberId, new Map());
      map.get(s.memberId)!.set(s.shiftDate, s);
    }
    return map;
  }, [shiftsData]);

  return {
    bulkMode,
    setBulkMode,
    selectedCells,
    setSelectedCells,
    bulkSheetOpen,
    setBulkSheetOpen,
    isDraggingSelection,
    bulkCopyMode,
    setBulkCopyMode,
    copiedBlock,
    setCopiedBlock,
    bulkCopyOpen,
    setBulkCopyOpen,
    editSheet,
    setEditSheet,
    clipboard,
    setClipboard,
    localMembers,
    setLocalMembers,
    activeDragId,
    setActiveDragId,
    overTeamId,
    setOverTeamId,
    teamsData,
    membersData,
    shiftsData,
    isLoading,
    teamOpsByName,
    issuesByCell,
    issueCells,
    secondmentByMemberId,
    updateShift,
    bulkUpdate,
    bulkCopy,
    reorderMembers,
    displayMembers,
    visualRowMembers,
    shiftMap,
  };
}

export type RosterDataState = ReturnType<typeof useRosterData>;
