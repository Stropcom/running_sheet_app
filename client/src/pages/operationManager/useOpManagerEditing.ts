// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): editing priorities, tasking cells and the timeline, saving, and Post & Notify opening.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useMemo } from "react";
import {} from "@/components/ui/select";
import { toast } from "sonner";
import {} from "lucide-react";
import { hasFixedShiftHours } from "@shared/taskingDefaults";
import { toClock } from "@shared/taskingRosterSync";
import { shiftAfterTaskChange } from "@shared/taskingShiftHours";
import {
  changedCellKeys,
  describeTimelineChanges,
  shiftStart,
  shiftToCellFields,
} from "@shared/taskingTimeline";
import {
  blendFields,
  blendPartner,
  cellShift,
  isBlendTeam,
  shouldAskBlend,
} from "@shared/taskingBlend";
import { weekDays } from "@shared/taskingView";
import type { TeamRow, PriorityRow, TaskingCell } from "./types";
import { TEAM_ROWS, TEAM_LABELS, DAYS } from "./constants";
import { addDaysUTC } from "./weekDates";
import { uid } from "./helpers";
import type { OpManagerWeekState } from "./useOpManagerWeek";
import type { OpManagerBasicsState } from "./useOpManagerBasics";

export function useOpManagerEditing(
  s: Pick<
    OpManagerWeekState,
    | "setPriorityRows"
    | "priorityRows"
    | "taskingGrid"
    | "setTaskingGrid"
    | "setDeclinedBlend"
    | "declinedBlend"
    | "setBlendAsk"
    | "setRosterAsk"
    | "applyRosterSyncMut"
    | "refreshRosterViews"
    | "setSelectedUserIds"
    | "setNotifyDialogOpen"
    | "savedGrid"
    | "setIsSavingTasking"
    | "setSavedGrid"
    | "contacts"
    | "onCallEntries"
  > &
    Pick<
      OpManagerBasicsState,
      | "savePriorityMut"
      | "weekStart"
      | "utils"
      | "isAdmin"
      | "notifyRecipients"
      | "setEditingCal"
      | "saveTaskingCellMut"
      | "isPosted"
      | "saveContactsMut"
      | "setViewMode"
    >
) {
  const {
    setPriorityRows,
    savePriorityMut,
    weekStart,
    priorityRows,
    utils,
    taskingGrid,
    setTaskingGrid,
    setDeclinedBlend,
    declinedBlend,
    setBlendAsk,
    isAdmin,
    setRosterAsk,
    applyRosterSyncMut,
    refreshRosterViews,
    notifyRecipients,
    setSelectedUserIds,
    setNotifyDialogOpen,
    savedGrid,
    setEditingCal,
    setIsSavingTasking,
    saveTaskingCellMut,
    setSavedGrid,
    isPosted,
    contacts,
    onCallEntries,
    saveContactsMut,
    setViewMode,
  } = s;

  // ── Priority Board ────────────────────────────────────────────────────────────
  const addPriorityRow = () => {
    setPriorityRows(prev => [
      ...prev,
      {
        localId: uid(),
        category: "A-TACC",
        priority: prev.length + 1,
        operationId: null,
        operationName: null,
        team: null,
        requestType: null,
        sortOrder: prev.length,
      },
    ]);
  };

  const updatePriorityRow = (localId: string, patch: Partial<PriorityRow>) => {
    setPriorityRows(prev =>
      prev.map(r => (r.localId === localId ? { ...r, ...patch } : r))
    );
  };

  const removePriorityRow = (localId: string) => {
    setPriorityRows(prev =>
      prev
        .filter(r => r.localId !== localId)
        .map((r, i) => ({ ...r, priority: i + 1, sortOrder: i }))
    );
  };

  const savePriorityBoard = async () => {
    try {
      await savePriorityMut.mutateAsync({
        weekStart,
        rows: priorityRows.map((r, i) => ({
          id: r.id,
          category: r.category,
          priority: i + 1,
          operationId: r.operationId ?? null,
          operationName: r.operationName ?? null,
          team: r.team ?? null,
          requestType: r.requestType ?? null,
          sortOrder: i,
        })),
      });
      await utils.opManager.getPriorityBoard.invalidate();
      return true;
    } catch {
      toast.error("Failed to save priority board.");
      return false;
    }
  };

  // ── Tasking Calendar ──────────────────────────────────────────────────────────
  const updateCell = (
    teamRow: TeamRow,
    dayIndex: number,
    patchIn: Partial<TaskingCell>
  ) => {
    const key = `${teamRow}-${dayIndex}`;
    // Choosing Admin makes the shift 8 hours (0700-1500); changing it back to
    // an operation makes it a 9-hour Day shift (0600-1500) again. (Team 1 and
    // Team 2 only: PTT and Capability keep the shift they have, 8 hours.)
    let patch = patchIn;
    if (
      "primaryTask" in patchIn &&
      !("shiftTime" in patchIn) &&
      !hasFixedShiftHours(teamRow)
    ) {
      const before = taskingGrid[key];
      const moved = shiftAfterTaskChange(
        cellShift(before),
        before?.primaryTask,
        patchIn.primaryTask
      );
      if (moved) patch = { ...patchIn, ...shiftToCellFields(moved) };
    }
    setTaskingGrid(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      // A blended day is one shared entry: an edit goes to both teams' cells.
      if (isBlendTeam(teamRow)) {
        const pKey = `${blendPartner(teamRow)}-${dayIndex}`;
        if (prev[key]?.blended && prev[pKey]?.blended)
          next[pKey] = { ...prev[pKey], ...patch };
      }
      return next;
    });
    // Same working shift for Team 1 and Team 2? Ask whether to blend them.
    if (
      isBlendTeam(teamRow) &&
      ("shiftTime" in patch || "customTime" in patch)
    ) {
      const partnerKey = `${blendPartner(teamRow)}-${dayIndex}`;
      const mine = { ...taskingGrid[key], ...patch };
      const theirs = taskingGrid[partnerKey];
      const surv1 = teamRow === "surv1" ? mine : theirs;
      const surv2 = teamRow === "surv2" ? mine : theirs;
      if (cellShift(surv1) !== cellShift(surv2)) {
        // Shifts differ again: a No for the earlier shift no longer applies.
        setDeclinedBlend(d => (d[dayIndex] ? { ...d, [dayIndex]: "" } : d));
      } else if (
        shouldAskBlend({
          surv1,
          surv2,
          declinedShift: declinedBlend[dayIndex] || null,
        })
      ) {
        setBlendAsk(dayIndex);
      }
    }
  };

  /** Yes: both teams carry the chosen team's shift and tasks, flagged blended. */
  const blendDay = (dayIndex: number, keep: "surv1" | "surv2") => {
    const fields = {
      ...blendFields(taskingGrid[`${keep}-${dayIndex}`]),
      blended: true,
    };
    setTaskingGrid(prev => ({
      ...prev,
      [`surv1-${dayIndex}`]: { ...prev[`surv1-${dayIndex}`], ...fields },
      [`surv2-${dayIndex}`]: { ...prev[`surv2-${dayIndex}`], ...fields },
    }));
    setBlendAsk(null);
  };
  /** No (or closed): keep the teams apart, and do not ask again for this shift. */
  const keepApart = (dayIndex: number) => {
    setDeclinedBlend(d => ({
      ...d,
      [dayIndex]: cellShift(taskingGrid[`surv1-${dayIndex}`]),
    }));
    setBlendAsk(null);
  };
  /** Split a blended day back into two teams (each keeps the shared entry to edit). */
  const splitDay = (dayIndex: number) => {
    setDeclinedBlend(d => ({
      ...d,
      [dayIndex]: cellShift(taskingGrid[`surv1-${dayIndex}`]),
    }));
    setTaskingGrid(prev => ({
      ...prev,
      [`surv1-${dayIndex}`]: { ...prev[`surv1-${dayIndex}`], blended: false },
      [`surv2-${dayIndex}`]: { ...prev[`surv2-${dayIndex}`], blended: false },
    }));
  };

  /** One cell as the server stores it (a Custom shift is its own text, an Other
   * task is its typed text). */
  const cellToSave = (teamRow: TeamRow, dayIndex: number) => {
    const cell = taskingGrid[`${teamRow}-${dayIndex}`] ?? {};
    const shiftTime =
      cell.shiftTime === "Custom"
        ? (cell.customTime ?? null)
        : (cell.shiftTime ?? null);
    const primaryTask =
      cell.primaryTask === "Other"
        ? (cell.primaryOther ?? null)
        : (cell.primaryTask ?? null);
    const secondaryTask =
      cell.secondaryTask === "Other"
        ? (cell.secondaryOther ?? null)
        : (cell.secondaryTask ?? null);
    return {
      weekStart,
      dayIndex,
      teamRow,
      shiftTime,
      primaryTask,
      secondaryTask,
      blended: cell.blended === true,
    };
  };

  // ── Carry the tasking's start times to the roster ───────────────────────────
  /** Each team's start time on the tasking, by day (null for a day with no shift,
   * such as RDO), and whether its task is Admin. */
  const rosterTargets = () => {
    const out: {
      teamName: string;
      date: string;
      start: string | null;
      admin: boolean;
    }[] = [];
    for (const teamRow of TEAM_ROWS)
      DAYS.forEach((_, dayIndex) => {
        const cell = taskingGrid[`${teamRow}-${dayIndex}`];
        const start = shiftStart(cellShift(cell));
        out.push({
          teamName: TEAM_LABELS[teamRow],
          date: addDaysUTC(weekStart, dayIndex),
          // null: no shift that day (RDO or none), so a shift the roster took
          // from the tasking earlier can go back to a rest day.
          start: start === null ? null : toClock(start),
          admin: cell?.primaryTask === "Admin",
        });
      });
    return out;
  };
  /**
   * If the on-duty members' roster start times differ from the tasking's (today
   * and later), asks whether to update the roster; Yes updates it and notifies
   * them. Asked after every Save and before every Post / Re-post while they
   * differ (a No is not remembered, so changing the times again and saving asks
   * again). Resolves when the question is answered (or there was nothing to
   * ask), so Save and Re-post can carry on after it.
   */
  const checkRosterAgainstTasking = async () => {
    if (!isAdmin) return;
    const targets = rosterTargets();
    try {
      const plan = await utils.ctoRoster.roster.previewTaskingSync.fetch(
        { targets },
        { staleTime: 0 }
      );
      if (plan.shifts === 0) return;
      const yes = await new Promise<boolean>(resolve =>
        setRosterAsk({
          groups: plan.groups,
          members: plan.members,
          answer: resolve,
        })
      );
      if (!yes) return;
      const done = await applyRosterSyncMut.mutateAsync({ targets });
      await refreshRosterViews();
      toast.success(
        `Roster updated: ${done.shifts} shift${done.shifts === 1 ? "" : "s"} for ${done.members} ${done.members === 1 ? "person" : "people"}. They have been notified in the app.`
      );
    } catch {
      toast.error("Could not update the roster from the tasking.");
    }
  };

  // ── Post & Notify ─────────────────────────────────────────────────────────────
  const openNotifyDialog = () => {
    // Pre-select all users
    const allIds = new Set(notifyRecipients.map(u => u.id));
    setSelectedUserIds(allIds);
    setNotifyDialogOpen(true);
  };
  /** Post / Re-post: the roster question first, then who to notify. */
  const postWithRosterCheck = async () => {
    await checkRosterAgainstTasking();
    openNotifyDialog();
  };

  // ── Timeline edits (admin: slide a bar, pick an operation) ───────────────────
  const dayLabelOf = (i: number) => {
    const d = weekDays(weekStart)[i];
    return `${d.name} ${String(d.day).padStart(2, "0")} ${d.month}`;
  };
  const timelineChanges = useMemo(
    () =>
      describeTimelineChanges(
        savedGrid,
        taskingGrid,
        TEAM_ROWS,
        id => TEAM_LABELS[id as TeamRow],
        dayLabelOf
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedGrid, taskingGrid, weekStart]
  );
  const slideTeamShift = (teamId: string, dayIndex: number, shift: string) =>
    updateCell(teamId as TeamRow, dayIndex, shiftToCellFields(shift));
  const pickTeamOp = (
    teamId: string,
    dayIndex: number,
    op: string,
    other?: string
  ) =>
    updateCell(
      teamId as TeamRow,
      dayIndex,
      // "Other" keeps its typed text, as the edit grid does.
      other !== undefined
        ? { primaryTask: "Other", primaryOther: other }
        : { primaryTask: op, primaryOther: "" }
    );
  /** A shift picked in a layout: none, RDO or a range. */
  const setTeamShift = (teamId: string, dayIndex: number, shift: string) =>
    updateCell(
      teamId as TeamRow,
      dayIndex,
      shift === ""
        ? { shiftTime: null, customTime: "" }
        : shift === "RDO"
          ? { shiftTime: "RDO", customTime: "" }
          : shiftToCellFields(shift)
    );
  /** The second (S) operation, the same values as the first. */
  const pickSecondOp = (
    teamId: string,
    dayIndex: number,
    op: string,
    other?: string
  ) =>
    updateCell(
      teamId as TeamRow,
      dayIndex,
      other !== undefined
        ? { secondaryTask: "Other", secondaryOther: other }
        : { secondaryTask: op, secondaryOther: "" }
    );
  const discardTimelineChanges = () => {
    setTaskingGrid(savedGrid);
    setDeclinedBlend({});
  };
  /** Cancel: drop the changes and leave edit mode. */
  const cancelEditing = () => {
    discardTimelineChanges();
    setEditingCal(false);
  };
  /** Saves only the cells that changed. On a draft (not posted) that is all it
   * does; on a posted week it then asks the roster question, and with `repost`
   * it goes on to the same "Select who to notify" dialog as Re-post & Notify. */
  const saveTimelineChanges = async (repost: boolean) => {
    const keys = changedCellKeys(timelineChanges);
    setIsSavingTasking(true);
    try {
      await Promise.all(
        keys.map(key => {
          const [teamRow, day] = key.split("-");
          return saveTaskingCellMut.mutateAsync(
            cellToSave(teamRow as TeamRow, Number(day))
          );
        })
      );
      await utils.opManager.getTaskingCalendar.invalidate();
      await refreshRosterViews();
      setSavedGrid(taskingGrid);
      setEditingCal(false); // Save leaves edit mode
      toast.success(
        isPosted
          ? keys.length === 1
            ? "Saved 1 change."
            : `Saved ${keys.length} changes.`
          : "Draft saved. Not posted yet, so the roster is unchanged."
      );
      // A draft only saves. Once posted, every Save asks whether to update
      // the roster (start times and shifts), and Save and re-post then goes on
      // to the notify step.
      if (isPosted) await checkRosterAgainstTasking();
      if (repost) openNotifyDialog();
    } catch {
      toast.error("Failed to save the changes.");
    }
    setIsSavingTasking(false);
  };

  // ── Contacts ──────────────────────────────────────────────────────────────────
  const saveContacts = async () => {
    const all = [
      ...contacts.map((c, i) => ({
        id: c.id,
        role: c.role,
        userId: c.userId ?? null,
        customName: null as string | null,
        phone: c.phone ?? null,
        sortOrder: i,
      })),
      ...onCallEntries.map((oc, i) => ({
        id: oc.id,
        role: oc.role,
        userId: oc.userId ?? null,
        customName: null as string | null,
        phone: oc.mobile ?? null,
        sortOrder: contacts.length + i,
      })),
    ];
    try {
      await saveContactsMut.mutateAsync({ weekStart, contacts: all });
      await utils.opManager.getSupervisorContacts.invalidate();
      return true;
    } catch {
      toast.error("Failed to save contacts.");
      return false;
    }
  };
  /** Save on-call, contacts and the priority board together, then show the
   * full view (the tasking is edited there). */
  const saveDetails = async () => {
    const a = await saveContacts();
    const b = await savePriorityBoard();
    if (a && b) {
      toast.success("Saved.");
      setViewMode("view");
    }
  };

  return {
    addPriorityRow,
    updatePriorityRow,
    removePriorityRow,
    blendDay,
    keepApart,
    splitDay,
    postWithRosterCheck,
    timelineChanges,
    slideTeamShift,
    pickTeamOp,
    setTeamShift,
    pickSecondOp,
    cancelEditing,
    saveTimelineChanges,
    saveDetails,
  };
}

export type OpManagerEditingState = ReturnType<typeof useOpManagerEditing>;
