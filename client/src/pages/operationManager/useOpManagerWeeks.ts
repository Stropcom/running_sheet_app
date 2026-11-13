// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): creating, copying, filling, exporting and notifying for a week.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {} from "lucide-react";
import { defaultTaskingShift } from "@shared/taskingDefaults";
import { readWeek } from "@shared/taskingView";
import type { TaskingViewId } from "@/lib/taskingViewPref";
import { buildCtoTaskingHtml } from "@/lib/ctoTaskingExport";
import { TEAM_ROWS, DAYS } from "./constants";
import {
  getMondayOfWeek,
  addWeeks,
  addDaysUTC,
  formatWeekLabel,
} from "./weekDates";
import type { OpManagerBasicsState } from "./useOpManagerBasics";
import type { OpManagerWeekState } from "./useOpManagerWeek";

export function useOpManagerWeeks(
  s: Pick<
    OpManagerBasicsState,
    | "allWeeksQuery"
    | "setIsCreatingWeek"
    | "setWeekStart"
    | "setViewMode"
    | "setNewWeekDialogOpen"
    | "copyWeekMut"
    | "utils"
    | "weekStart"
    | "viewMode"
    | "contactsQuery"
    | "priorityQuery"
    | "savePriorityMut"
    | "saveTaskingCellMut"
    | "saveContactsMut"
    | "usersQuery"
    | "user"
    | "taskingTeams"
    | "postWeekMut"
  > &
    Pick<
      OpManagerWeekState,
      | "priorityRows"
      | "contacts"
      | "onCallEntries"
      | "taskingGrid"
      | "setNotifyDialogOpen"
      | "selectedUserIds"
      | "refreshRosterViews"
    >
) {
  const {
    allWeeksQuery,
    setIsCreatingWeek,
    setWeekStart,
    setViewMode,
    setNewWeekDialogOpen,
    copyWeekMut,
    utils,
    weekStart,
    viewMode,
    contactsQuery,
    priorityQuery,
    savePriorityMut,
    priorityRows,
    saveTaskingCellMut,
    contacts,
    onCallEntries,
    saveContactsMut,
    usersQuery,
    taskingTeams,
    taskingGrid,
    setNotifyDialogOpen,
    postWeekMut,
    selectedUserIds,
    refreshRosterViews,
  } = s;

  // ── New week creation ────────────────────────────────────────────────────────
  // Next un-saved week = first Monday after the latest saved week
  const nextNewWeekStart = (() => {
    const all = allWeeksQuery.data ?? [];
    if (all.length === 0) return getMondayOfWeek(new Date());
    return addWeeks(all[0].weekStart, 1);
  })();

  // The week "Copy Last Week" copies from: the most recent week before the new
  // one that actually has contacts or a priority board (a listed week can hold
  // only its calendar).
  const copySourceQuery = trpc.opManager.copySourceWeek.useQuery(
    { beforeWeekStart: nextNewWeekStart },
    { staleTime: 5_000 }
  );
  const copySource = copySourceQuery.data ?? null;

  const handleCreateBlankWeek = async () => {
    setIsCreatingWeek(true);
    setWeekStart(nextNewWeekStart);
    setViewMode("edit");
    setNewWeekDialogOpen(false);
    setIsCreatingWeek(false);
  };

  const handleCopyLastWeek = async () => {
    setIsCreatingWeek(true);
    if (!copySource) {
      toast.error(
        "No earlier week has contacts or a priority board to copy. Use Create New instead."
      );
      setIsCreatingWeek(false);
      return;
    }
    try {
      const result = await copyWeekMut.mutateAsync({
        fromWeekStart: copySource.weekStart,
        toWeekStart: nextNewWeekStart,
      });
      await utils.opManager.listAllWeeks.invalidate();
      await utils.opManager.getSupervisorContacts.invalidate();
      await utils.opManager.getPriorityBoard.invalidate();
      setWeekStart(nextNewWeekStart);
      setViewMode("edit");
      setNewWeekDialogOpen(false);
      toast.success(
        `Copied ${result.contacts} contact${result.contacts === 1 ? "" : "s"} and ${result.priority} priority row${result.priority === 1 ? "" : "s"} from ${formatWeekLabel(copySource.weekStart)}.`
      );
    } catch {
      toast.error("Failed to copy week.");
    }
    setIsCreatingWeek(false);
  };

  // The edit page of a week with no contacts, on-call or priority rows offers
  // to pull them in from the most recent earlier week that has them.
  const emptyWeekSourceQuery = trpc.opManager.copySourceWeek.useQuery(
    { beforeWeekStart: weekStart },
    { staleTime: 5_000, enabled: viewMode === "edit" }
  );
  const weekHasNoContactsOrPriority =
    !contactsQuery.isLoading &&
    !priorityQuery.isLoading &&
    (contactsQuery.data ?? []).length === 0 &&
    (priorityQuery.data ?? []).length === 0;
  const [isFillingWeek, setIsFillingWeek] = useState(false);
  const handleFillFromEarlierWeek = async () => {
    const source = emptyWeekSourceQuery.data;
    if (!source) return;
    setIsFillingWeek(true);
    try {
      const result = await copyWeekMut.mutateAsync({
        fromWeekStart: source.weekStart,
        toWeekStart: weekStart,
      });
      await utils.opManager.getSupervisorContacts.invalidate();
      await utils.opManager.getPriorityBoard.invalidate();
      toast.success(
        `Copied ${result.contacts} contact${result.contacts === 1 ? "" : "s"} and ${result.priority} priority row${result.priority === 1 ? "" : "s"} from ${formatWeekLabel(source.weekStart)}.`
      );
    } catch {
      toast.error("Failed to copy from the earlier week.");
    }
    setIsFillingWeek(false);
  };

  // ── Copy to Next Week ──────────────────────────────────────────────────────────
  const [isCopying, setIsCopying] = useState(false);
  const handleCopyToNextWeek = async () => {
    setIsCopying(true);
    try {
      const currentMs = new Date(weekStart).getTime();
      const nextWeek = new Date(currentMs + 7 * 24 * 60 * 60 * 1000);
      const nextWeekStart = getMondayOfWeek(nextWeek);
      // Copy priority board
      await savePriorityMut.mutateAsync({
        weekStart: nextWeekStart,
        rows: priorityRows.map((r, i) => ({
          id: undefined,
          category: r.category,
          priority: i + 1,
          operationId: r.operationId ?? null,
          operationName: r.operationName ?? null,
          team: r.team ?? null,
          requestType: r.requestType ?? null,
          sortOrder: i,
        })),
      });
      // Copy tasking cells — carry forward only the shift-time pattern for
      // next week (surv1/surv2 rotate day/afternoon, ptt/cap stay fixed).
      // Operations/tasking assignments are never carried forward — each
      // week's tasking is set fresh.
      const taskingMutations = TEAM_ROWS.flatMap(teamRow =>
        DAYS.map((_, dayIndex) =>
          saveTaskingCellMut.mutateAsync({
            weekStart: nextWeekStart,
            dayIndex,
            teamRow,
            shiftTime: defaultTaskingShift(teamRow, dayIndex, nextWeekStart),
            primaryTask: null,
            secondaryTask: null,
            blended: false,
          })
        )
      );
      await Promise.all(taskingMutations);
      // Copy contacts
      const allContacts = [
        ...contacts.map((c, i) => ({
          id: undefined as number | undefined,
          role: c.role,
          userId: c.userId ?? null,
          customName: null as string | null,
          phone: c.phone ?? null,
          sortOrder: i,
        })),
        ...onCallEntries.map((oc, i) => ({
          id: undefined as number | undefined,
          role: oc.role,
          userId: oc.userId ?? null,
          customName: null as string | null,
          phone: oc.mobile ?? null,
          sortOrder: contacts.length + i,
        })),
      ];
      await saveContactsMut.mutateAsync({
        weekStart: nextWeekStart,
        contacts: allContacts,
      });
      toast.success("Copied to next week. Navigate to next week to review.");
    } catch {
      toast.error("Failed to copy to next week.");
    }
    setIsCopying(false);
  };

  // ── Export (the same preview window as every other export) ───────────────────
  const handleExportTasking = (views: TaskingViewId[]) => {
    const users = usersQuery.data ?? [];
    const contactOf = (role: string) => {
      const c = contacts.find(x => x.role === role);
      const user = users.find(u => u.id === c?.userId);
      return {
        role,
        name: user?.name ?? "",
        phone: c?.phone ?? user?.phone ?? null,
      };
    };
    const html = buildCtoTaskingHtml({
      weekLabel: `${formatWeekLabel(weekStart)} ${new Date(addDaysUTC(weekStart, 6) + "T00:00:00Z").getUTCFullYear()}`,
      weekStart,
      onCall: onCallEntries.map(oc => {
        const user = users.find(u => u.id === oc.userId);
        return {
          name: user?.name ?? "",
          phone: oc.mobile ?? user?.phone ?? null,
        };
      }),
      supervisors: ["CTO Inspector", "PTT", "Team 1", "Team 2"].map(contactOf),
      priority: priorityRows.map(r => ({
        category: r.category,
        operation: r.operationName ?? "",
        team: r.team ?? "",
        requestType: r.requestType ?? "",
      })),
      calendar: {
        weekStart,
        teams: taskingTeams,
        week: readWeek(taskingGrid, TEAM_ROWS),
      },
      views,
    });
    const win = window.open("", "_blank");
    if (!win) {
      // Popup blocked — same failure mode/messaging as every other export in the app.
      alert("Pop-up blocked. Please allow pop-ups and try again.");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  const handleConfirmNotify = async () => {
    setNotifyDialogOpen(false);
    try {
      await postWeekMut.mutateAsync({
        weekStart,
        userIds: Array.from(selectedUserIds),
      });
      await utils.opManager.isWeekPosted.invalidate();
      await refreshRosterViews();
      toast.success(
        selectedUserIds.size > 0
          ? `CTO Tasking posted. Notified ${selectedUserIds.size} user${selectedUserIds.size === 1 ? "" : "s"} (check their notification bell).`
          : "CTO Tasking posted (no users notified)."
      );
    } catch {
      toast.error("Failed to post CTO Tasking.");
    }
  };

  return {
    nextNewWeekStart,
    copySource,
    handleCreateBlankWeek,
    handleCopyLastWeek,
    emptyWeekSourceQuery,
    weekHasNoContactsOrPriority,
    isFillingWeek,
    handleFillFromEarlierWeek,
    handleExportTasking,
    handleConfirmNotify,
  };
}

export type OpManagerWeeksState = ReturnType<typeof useOpManagerWeeks>;
