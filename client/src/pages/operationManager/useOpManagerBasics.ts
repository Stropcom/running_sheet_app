// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the week, view mode, queries and mutations.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useOpManagerScreen) and its layout is OpManagerView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {} from "lucide-react";
import { taskingWeekFromSearch } from "@shared/opManagerWeeks";
import { useTeamColour } from "@/lib/teams";
import { teamShades } from "@shared/teamColours";
import { type TaskingTeam } from "@/components/opManager/TaskingViews";
import type { TeamRow } from "./types";
import { TEAM_ROWS, TEAM_LABELS, TASKING_AB } from "./constants";
import { getMondayOfWeek, addDaysUTC } from "./weekDates";

export function useOpManagerBasics(s: {}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";

  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [viewMode, setViewMode] = useState<"folder" | "edit" | "view">(
    "folder"
  );
  useEffect(() => {
    // Non-admins can only be in folder or view mode
    if (!isAdmin && viewMode === "edit") setViewMode("folder");
  }, [isAdmin, viewMode]);
  // Editing the calendar in place, in whichever layout is chosen (admin). It
  // ends when the week or the screen changes.
  const [editingCal, setEditingCal] = useState(false);
  useEffect(() => {
    setEditingCal(false);
  }, [weekStart, viewMode]);

  // ── New-week dialog state ─────────────────────────────────────────────────────
  const [newWeekDialogOpen, setNewWeekDialogOpen] = useState(false);
  // The week being deleted (null = no delete dialog).
  const [deleteWeekFor, setDeleteWeekFor] = useState<string | null>(null);
  const [isCreatingWeek, setIsCreatingWeek] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────────
  const opsQuery = trpc.operation.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const usersQuery = trpc.opManager.listUsers.useQuery(undefined, {
    staleTime: 60_000,
  });
  // Who a posted tasking can go to: this Command's people and the visitors it
  // hosts (not everyone in the system, which listUsers returns).
  const notifyRecipientsQuery = trpc.opManager.notifyRecipients.useQuery(
    undefined,
    { staleTime: 30_000, enabled: isAdmin }
  );
  const notifyRecipients = notifyRecipientsQuery.data ?? [];
  const priorityQuery = trpc.opManager.getPriorityBoard.useQuery(
    { weekStart },
    { staleTime: 5_000 }
  );
  const taskingQuery = trpc.opManager.getTaskingCalendar.useQuery(
    { weekStart },
    { staleTime: 5_000 }
  );
  const contactsQuery = trpc.opManager.getSupervisorContacts.useQuery(
    { weekStart },
    { staleTime: 5_000 }
  );
  const postedQuery = trpc.opManager.isWeekPosted.useQuery(
    { weekStart },
    { staleTime: 5_000 }
  );
  /** A week that has not been posted is a draft: Save draft only saves it. */
  const isPosted = postedQuery.data?.posted === true;
  const postedWeeksQuery = trpc.opManager.getPostedWeeks.useQuery(undefined, {
    staleTime: 30_000,
  });
  const allWeeksQuery = trpc.opManager.listAllWeeks.useQuery(undefined, {
    staleTime: 10_000,
  });

  // A "tasking posted" notification links to "?week=YYYY-MM-DD": open that
  // week's tasking (the document), not just the folder. A week that is not in
  // the list (deleted since) leaves the folder showing. The address is tidied
  // afterwards so Back from the document does not open it again.
  const search = useSearch();
  const wantedWeek = taskingWeekFromSearch(search);
  useEffect(() => {
    if (!wantedWeek) return;
    const weeks = allWeeksQuery.data;
    if (!weeks) return;
    if (weeks.some(w => w.weekStart === wantedWeek)) {
      setWeekStart(wantedWeek);
      setViewMode("view");
    }
    navigate("/operation-manager", { replace: true });
  }, [wantedWeek, allWeeksQuery.data, navigate]);

  // ── Roster coverage (for the tasking-vs-minimum-numbers check) ──────────────
  const rosterTeamsQuery = trpc.ctoRoster.teams.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const rosterMembersQuery = trpc.ctoRoster.members.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const rosterSecondmentsQuery = trpc.ctoRoster.secondments.list.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const outlookSettingsQuery = trpc.ctoRoster.outlookSettings.get.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const rosterShiftsQuery = trpc.ctoRoster.roster.getRange.useQuery(
    { startDate: weekStart, endDate: addDaysUTC(weekStart, 6) },
    { staleTime: 5_000 }
  );

  // ── Team colours: the ones set in User Management → Teams ───────────────────
  const teamColourOf = useTeamColour();
  const TEAM_COLOURS = Object.fromEntries(
    TEAM_ROWS.map(id => [id, teamShades(teamColourOf(TEAM_LABELS[id]))])
  ) as Record<TeamRow, { bg: string; border: string; text: string }>;
  const taskingTeams: TaskingTeam[] = TEAM_ROWS.map(id => ({
    id,
    label: TEAM_LABELS[id],
    ab: TASKING_AB[id],
    colour: TEAM_COLOURS[id].border,
  }));

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const savePriorityMut = trpc.opManager.savePriorityBoard.useMutation();
  const saveTaskingCellMut = trpc.opManager.saveTaskingCell.useMutation();
  const saveContactsMut = trpc.opManager.saveSupervisorContacts.useMutation();
  const postWeekMut = trpc.opManager.postWeek.useMutation();
  const utils = trpc.useUtils();
  const createOpMut = trpc.operation.create.useMutation({
    onSuccess: () => utils.operation.list.invalidate(),
  });
  const copyWeekMut = trpc.opManager.copyWeek.useMutation();

  return {
    user,
    navigate,
    isAdmin,
    weekStart,
    setWeekStart,
    viewMode,
    setViewMode,
    editingCal,
    setEditingCal,
    newWeekDialogOpen,
    setNewWeekDialogOpen,
    deleteWeekFor,
    setDeleteWeekFor,
    isCreatingWeek,
    setIsCreatingWeek,
    opsQuery,
    usersQuery,
    notifyRecipients,
    priorityQuery,
    taskingQuery,
    contactsQuery,
    postedQuery,
    isPosted,
    postedWeeksQuery,
    allWeeksQuery,
    rosterTeamsQuery,
    rosterMembersQuery,
    rosterSecondmentsQuery,
    outlookSettingsQuery,
    rosterShiftsQuery,
    TEAM_COLOURS,
    taskingTeams,
    savePriorityMut,
    saveTaskingCellMut,
    saveContactsMut,
    postWeekMut,
    utils,
    createOpMut,
    copyWeekMut,
  };
}

export type OpManagerBasicsState = ReturnType<typeof useOpManagerBasics>;
