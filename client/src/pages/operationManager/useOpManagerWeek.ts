// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the grids, the roster's view of the week, coverage and breaches.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {} from "lucide-react";
import { ON_DUTY_CODES } from "@shared/ctoRosterShiftUtils";
import { defaultTaskingShift } from "@shared/taskingDefaults";
import {
  distinctBreachCount,
  taskingBreachCells,
} from "@shared/taskingBreaches";
import type { SyncGroup } from "@shared/taskingRosterSync";
import type {
  PriorityRow,
  TaskingCell,
  ContactEntry,
  OnCallEntry,
} from "./types";
import {
  TEAM_ROWS,
  TEAM_LABELS,
  TASKING_TEAM_MIN_FALLBACK,
  TASKING_DEFAULT_MIN_FALLBACK,
  SHIFT_OPTIONS,
  ON_CALL_ROLES,
  DAYS,
} from "./constants";
import { addDaysUTC } from "./weekDates";
import { uid } from "./helpers";
import type { OpManagerBasicsState } from "./useOpManagerBasics";

export function useOpManagerWeek(
  s: Pick<
    OpManagerBasicsState,
    | "utils"
    | "priorityQuery"
    | "taskingQuery"
    | "weekStart"
    | "rosterSecondmentsQuery"
    | "rosterShiftsQuery"
    | "rosterTeamsQuery"
    | "rosterMembersQuery"
    | "outlookSettingsQuery"
    | "contactsQuery"
  >
) {
  const {
    utils,
    priorityQuery,
    taskingQuery,
    weekStart,
    rosterSecondmentsQuery,
    rosterShiftsQuery,
    rosterTeamsQuery,
    rosterMembersQuery,
    outlookSettingsQuery,
    contactsQuery,
  } = s;

  /** The roster (and the calendar's EA dots) read the tasking: after a save, a
   * post or a roster change, mark what they hold as out of date so they ask
   * again the next time they are shown, and a roster open on this screen asks
   * at once. A roster open elsewhere catches up by itself within ~30 seconds. */
  const refreshRosterViews = () =>
    Promise.all([
      utils.opManager.postedTaskingOps.invalidate(),
      utils.ctoRoster.roster.getRange.invalidate(),
      utils.ctoRoster.eba.liveFindings.invalidate(),
      utils.ctoRoster.eba.taskingBreaches.invalidate(),
    ]);

  // ── Local state ───────────────────────────────────────────────────────────────
  const [priorityRows, setPriorityRows] = useState<PriorityRow[]>([]);
  const [taskingGrid, setTaskingGrid] = useState<Record<string, TaskingCell>>(
    {}
  );
  // The grid as last saved or loaded, to tell what an admin has slid on the
  // Timeline and not saved yet.
  const [savedGrid, setSavedGrid] = useState<Record<string, TaskingCell>>({});
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [onCallEntries, setOnCallEntries] = useState<OnCallEntry[]>([]);
  const [activeTab, setActiveTab] = useState("contacts");
  const [isSavingTasking, setIsSavingTasking] = useState(false);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // Blending Team 1 and Team 2: the day being asked about, and the shift an
  // earlier No was given for (per day), so a No is not asked again.
  const [blendAsk, setBlendAsk] = useState<number | null>(null);
  const [declinedBlend, setDeclinedBlend] = useState<Record<number, string>>(
    {}
  );
  // "Update the roster too?": the question being asked, and how to answer the
  // step (Save, Post) that is waiting on it.
  const [rosterAsk, setRosterAsk] = useState<{
    groups: SyncGroup[];
    members: number;
    answer: (yes: boolean) => void;
  } | null>(null);
  const applyRosterSyncMut =
    trpc.ctoRoster.roster.applyTaskingSync.useMutation();
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(
    new Set()
  );

  // ── Sync remote → local ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!priorityQuery.data) return;
    setPriorityRows(priorityQuery.data.map(r => ({ ...r, localId: uid() })));
  }, [priorityQuery.data]);

  useEffect(() => {
    if (!taskingQuery.data) return;
    const grid: Record<string, TaskingCell> = {};
    if (taskingQuery.data.length === 0) {
      TEAM_ROWS.forEach(teamRow => {
        DAYS.forEach((_, dayIndex) => {
          const key = `${teamRow}-${dayIndex}`;
          grid[key] = {
            shiftTime:
              defaultTaskingShift(teamRow, dayIndex, weekStart) || null,
          };
        });
      });
    } else {
      // PTT and Capability always start the week with their standard shift
      // (8 hours Monday to Friday, RDO at the weekend): a day nobody has saved
      // yet shows it, so a week where only some cells were saved is not left
      // with blank PTT / Capability rows. A day that was saved, even with no
      // shift on purpose, is shown as saved.
      for (const teamRow of ["ptt", "cap"] as const)
        DAYS.forEach((_, dayIndex) => {
          grid[`${teamRow}-${dayIndex}`] = {
            shiftTime: defaultTaskingShift(teamRow, dayIndex, weekStart),
          };
        });
      taskingQuery.data.forEach(cell => {
        const key = `${cell.teamRow}-${cell.dayIndex}`;
        const storedShift = cell.shiftTime ?? null;
        const isCustomShift =
          storedShift !== null && !SHIFT_OPTIONS.includes(storedShift);
        grid[key] = {
          shiftTime: isCustomShift ? "Custom" : storedShift,
          customTime: isCustomShift ? (storedShift ?? "") : "",
          primaryTask: cell.primaryTask ?? null,
          secondaryTask: cell.secondaryTask ?? null,
          blended: cell.blended === true,
        };
      });
    }
    setTaskingGrid(grid);
    setSavedGrid(grid);
  }, [taskingQuery.data, weekStart]);

  // ── Roster coverage check ────────────────────────────────────────────────────
  // For every tasking cell with a task set, work out whether the team actually
  // has enough people rostered on for that day (same on-duty/minimum logic as
  // the Roster Outlook page) and flag it if not.
  const secondmentByMemberId = useMemo(() => {
    const map = new Map<
      number,
      { destinationTeamId: number; startDate: string; endDate: string }
    >();
    for (const s of rosterSecondmentsQuery.data ?? []) {
      map.set(s.memberId, {
        destinationTeamId: s.destinationTeamId,
        startDate: s.startDate,
        endDate: s.endDate,
      });
    }
    return map;
  }, [rosterSecondmentsQuery.data]);

  const rosterShiftMap = useMemo(() => {
    const map = new Map<number, Map<string, string>>();
    for (const s of rosterShiftsQuery.data ?? []) {
      if (!map.has(s.memberId)) map.set(s.memberId, new Map());
      map.get(s.memberId)!.set(s.shiftDate, s.shiftCode);
    }
    return map;
  }, [rosterShiftsQuery.data]);

  const taskingCoverage = useMemo(() => {
    const coverage: Record<
      string,
      { onDuty: number; min: number; short: boolean }
    > = {};
    const teams = rosterTeamsQuery.data;
    const members = rosterMembersQuery.data;
    if (!teams || !members) return coverage;

    for (const teamRow of TEAM_ROWS) {
      const teamName = TEAM_LABELS[teamRow];
      const team = teams.find(t => t.name === teamName);
      const min =
        outlookSettingsQuery.data?.teamMinimums[teamName] ??
        TASKING_TEAM_MIN_FALLBACK[teamName] ??
        TASKING_DEFAULT_MIN_FALLBACK;

      DAYS.forEach((_, dayIndex) => {
        const key = `${teamRow}-${dayIndex}`;
        const cell = taskingGrid[key];
        const hasTask = !!(cell?.primaryTask || cell?.secondaryTask);
        if (!team) {
          coverage[key] = { onDuty: 0, min, short: false };
          return;
        }
        const dateStr = addDaysUTC(weekStart, dayIndex);
        const onDuty = members.filter(m => {
          if (m.excludedFromCounts) return false;
          const sec = secondmentByMemberId.get(m.id);
          const onSecondmentToday =
            !!sec && dateStr >= sec.startDate && dateStr <= sec.endDate;
          const effectiveTeamId = onSecondmentToday
            ? sec!.destinationTeamId
            : m.teamId;
          if (effectiveTeamId !== team.id) return false;
          const code = rosterShiftMap.get(m.id)?.get(dateStr) ?? "";
          return ON_DUTY_CODES.has(code);
        }).length;
        // The count is worked out for every day (the Timeline shows it on each
        // bar); it only counts as a tasking issue when the day has a task.
        coverage[key] = { onDuty, min, short: hasTask && onDuty < min };
      });
    }
    return coverage;
  }, [
    taskingGrid,
    weekStart,
    rosterTeamsQuery.data,
    rosterMembersQuery.data,
    secondmentByMemberId,
    rosterShiftMap,
    outlookSettingsQuery.data,
  ]);

  // ── EA breaches (the roster's red dots, carried onto the calendar) ──────────
  // Open to everyone who can see the calendar. If the roster is switched off
  // for this Command the query is refused and the calendar just shows no dots.
  const breachQuery = trpc.ctoRoster.eba.taskingBreaches.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const taskingBreaches = useMemo(() => {
    const teams = rosterTeamsQuery.data;
    const members = rosterMembersQuery.data;
    if (!breachQuery.data || !teams || !members) return {};
    const dates = DAYS.map((_, i) => addDaysUTC(weekStart, i));
    const cells = taskingBreachCells(
      breachQuery.data,
      teams,
      members,
      rosterSecondmentsQuery.data ?? [],
      (memberId, date) => rosterShiftMap.get(memberId)?.get(date) ?? "",
      TEAM_ROWS.map(r => TEAM_LABELS[r]),
      dates
    );
    // Re-key by the calendar's own `teamRow-dayIndex`.
    const byCell: Record<string, (typeof cells)[string]> = {};
    for (const r of TEAM_ROWS) {
      dates.forEach((date, i) => {
        const list = cells[`${TEAM_LABELS[r]}|${date}`];
        if (list) byCell[`${r}-${i}`] = list;
      });
    }
    return byCell;
  }, [
    breachQuery.data,
    rosterTeamsQuery.data,
    rosterMembersQuery.data,
    rosterSecondmentsQuery.data,
    rosterShiftMap,
    weekStart,
  ]);
  const taskingBreachCount = useMemo(
    () => distinctBreachCount(taskingBreaches),
    [taskingBreaches]
  );

  const taskingIssueCount = useMemo(
    () => Object.values(taskingCoverage).filter(c => c.short).length,
    [taskingCoverage]
  );

  useEffect(() => {
    if (!contactsQuery.data) return;
    const fixed = contactsQuery.data.filter(
      c => !ON_CALL_ROLES.includes(c.role)
    );
    const onCall = contactsQuery.data.filter(c =>
      ON_CALL_ROLES.includes(c.role)
    );
    setContacts(fixed.map(c => ({ ...c, localId: uid() })));
    setOnCallEntries(
      onCall.map(c => ({
        localId: uid(),
        id: c.id,
        role: c.role,
        userId: c.userId ?? null,
        mobile: c.phone ?? null,
        isOnCall: true,
        dayScope: "full",
      }))
    );
  }, [contactsQuery.data]);

  return {
    refreshRosterViews,
    priorityRows,
    setPriorityRows,
    taskingGrid,
    setTaskingGrid,
    savedGrid,
    setSavedGrid,
    contacts,
    setContacts,
    onCallEntries,
    setOnCallEntries,
    activeTab,
    setActiveTab,
    isSavingTasking,
    setIsSavingTasking,
    notifyDialogOpen,
    setNotifyDialogOpen,
    exportDialogOpen,
    setExportDialogOpen,
    blendAsk,
    setBlendAsk,
    declinedBlend,
    setDeclinedBlend,
    rosterAsk,
    setRosterAsk,
    applyRosterSyncMut,
    selectedUserIds,
    setSelectedUserIds,
    taskingCoverage,
    taskingBreaches,
    taskingBreachCount,
    taskingIssueCount,
  };
}

export type OpManagerWeekState = ReturnType<typeof useOpManagerWeek>;
