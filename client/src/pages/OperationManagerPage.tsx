import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Send,
  Eye,
  Edit2,
  Download,
  CheckCircle2,
  GripVertical,
  Copy,
  RefreshCw,
  FolderOpen,
  CalendarPlus,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { ON_DUTY_CODES } from "@shared/ctoRosterShiftUtils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DeleteWeekDialog } from "@/components/opManager/DeleteWeekDialog";
import { BlendTeamsDialog } from "@/components/opManager/BlendTeamsDialog";
import { RosterSyncDialog } from "@/components/opManager/RosterSyncDialog";
import { toClock } from "@shared/taskingRosterSync";
import {
  ARVO_SHIFT,
  DAY_SHIFT,
  shiftAfterTaskChange,
} from "@shared/taskingShiftHours";
import {
  distinctBreachCount,
  taskingBreachCells,
} from "@shared/taskingBreaches";
import type { SyncGroup } from "@shared/taskingRosterSync";
import {
  SHIFT_PRESETS,
  changedCellKeys,
  describeTimelineChanges,
  shiftStart,
  shiftToCellFields,
} from "@shared/taskingTimeline";
import { useTeamColour } from "@/lib/teams";
import { teamShades } from "@shared/teamColours";
import {
  blendFields,
  blendPartner,
  cellShift,
  isBlendTeam,
  shouldAskBlend,
  tasksDiffer,
} from "@shared/taskingBlend";
import { ExportTaskingDialog } from "@/components/opManager/ExportTaskingDialog";
import { readWeek, weekDays } from "@shared/taskingView";
import type { TaskingViewId } from "@/lib/taskingViewPref";
import { buildCtoTaskingHtml } from "@/lib/ctoTaskingExport";
import {
  TaskingCalendarViews,
  type TaskingTeam,
} from "@/components/opManager/TaskingViews";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Constants ────────────────────────────────────────────────────────────────
const TEAM_ROWS = ["surv1", "surv2", "ptt", "cap"] as const;
type TeamRow = (typeof TEAM_ROWS)[number];
// Matches the CTO Roster's team names exactly (Team 1/Team 2/PTT/Capability)
// so tasking coverage can look up roster minimums by name with no mapping
// table needed — see the roster coverage check below.
const TEAM_LABELS: Record<TeamRow, string> = {
  surv1: "Team 1",
  surv2: "Team 2",
  ptt: "PTT",
  cap: "Capability",
};
// Fallback minimums (mirrors CTO Roster Outlook's TEAM_MINIMUMS/DEFAULT_MIN)
// — overridden by the admin-configured cto_roster_outlook_settings row.
const TASKING_TEAM_MIN_FALLBACK: Record<string, number> = {
  "Team 1": 5,
  "Team 2": 5,
  PTT: 2,
  Capability: 1,
};
const TASKING_DEFAULT_MIN_FALLBACK = 3;
// Short forms for pills and labels. Colours are not here: a team's colour is
// the one set in User Management → Teams (useTeamColour, shared/teamColours.ts).
const TASKING_AB: Record<TeamRow, string> = {
  surv1: "T1",
  surv2: "T2",
  ptt: "PTT",
  cap: "CAP",
};
const SHIFT_OPTIONS: string[] = ["RDO", ...SHIFT_PRESETS, "Custom"];
const CATEGORIES = ["A-TACC 1", "A-TACC 2", "WC", "Other"];
const REQUEST_TYPES = ["Surv", "PTT", "Capability"];
const SUPERVISOR_ROLES = ["CTO Inspector", "Team 1", "Team 2", "PTT"];
const ON_CALL_ROLES = [
  "On-Call Supervisor",
  "On-Call PTT",
  "On-Call Cap. Support",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Week helpers ─────────────────────────────────────────────────────────────
// All date arithmetic uses UTC to avoid AEST/DST timezone drift.
function getMondayOfWeek(date: Date): string {
  // Use the local calendar date (year/month/day) but treat it as UTC midnight
  // so that AEST users on Monday morning don't get bumped back to Sunday UTC.
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const day = utc.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  const end = new Date(weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(d)} – ${fmt(end)}`;
}

// ─── Shift auto-population ────────────────────────────────────────────────────
// Rotation anchor: Team 1 (surv1) is on DAY shift the week of 2026-07-20.
// Week of 13 Jul: surv1=afternoon, surv2=day
// Week of 20 Jul: surv1=day,       surv2=afternoon
// Week of 27 Jul: surv1=afternoon, surv2=day   ... alternates forever
const SURV1_DAY_ANCHOR = "2026-07-20";

function isSurv1DayShift(weekStart: string): boolean {
  const anchor = new Date(SURV1_DAY_ANCHOR + "T00:00:00Z").getTime();
  const ws = new Date(weekStart + "T00:00:00Z").getTime();
  const diffWeeks = Math.round((ws - anchor) / (7 * 24 * 3600 * 1000));
  // diffWeeks even (0, 2, 4, ...) = surv1 on day; odd = surv1 on afternoon
  return diffWeeks % 2 === 0;
}

function getDefaultShift(
  teamRow: TeamRow,
  dayIndex: number,
  weekStart: string
): string {
  // PTT: Day shift (0600-1500) Mon-Fri, RDO Sat-Sun
  if (teamRow === "ptt") {
    return dayIndex <= 4 ? DAY_SHIFT : "RDO";
  }
  // Cap. Support: Day shift (0600-1500) Mon-Fri, RDO Sat-Sun
  if (teamRow === "cap") {
    return dayIndex <= 4 ? DAY_SHIFT : "RDO";
  }
  const surv1IsDay = isSurv1DayShift(weekStart);
  const isDay = teamRow === "surv1" ? surv1IsDay : !surv1IsDay;
  if (isDay) {
    return dayIndex <= 4 ? DAY_SHIFT : "RDO";
  } else {
    if (dayIndex === 0) return "RDO";
    if (dayIndex >= 1 && dayIndex <= 3) return ARVO_SHIFT;
    if (dayIndex === 4) return "1000-1800";
    return "RDO";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PriorityRow {
  localId: string;
  id?: number;
  category: string;
  priority: number;
  operationId?: number | null;
  operationName?: string | null;
  team?: string | null;
  requestType?: string | null;
  sortOrder: number;
}

/** "Operation RAVEN + Training", or "no task" — for the blend question. */
function taskText(c: TaskingCell | undefined): string {
  const p = c?.primaryTask === "Other" ? c.primaryOther : c?.primaryTask;
  const q = c?.secondaryTask === "Other" ? c.secondaryOther : c?.secondaryTask;
  return [p, q].filter(Boolean).join(" + ") || "no task";
}

interface TaskingCell {
  shiftTime?: string | null;
  customTime?: string;
  primaryTask?: string | null;
  primaryOther?: string;
  secondaryTask?: string | null;
  secondaryOther?: string;
  /** Team 1 and Team 2 working as one blended team that day (both cells). */
  blended?: boolean;
}

interface ContactEntry {
  localId: string;
  id?: number;
  role: string;
  userId?: number | null;
  phone?: string | null;
  sortOrder: number;
}

interface OnCallEntry {
  localId: string;
  id?: number;
  role: string;
  userId?: number | null;
  mobile?: string | null;
  isOnCall: boolean;
  dayScope: string;
}

// ─── Unique ID helper ─────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => String(++_uid);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OperationManagerPage() {
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
  const postedWeeksQuery = trpc.opManager.getPostedWeeks.useQuery(undefined, {
    staleTime: 30_000,
  });
  const allWeeksQuery = trpc.opManager.listAllWeeks.useQuery(undefined, {
    staleTime: 10_000,
  });

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
  const createOpMut = trpc.operation.create.useMutation({
    onSuccess: () => utils.operation.list.invalidate(),
  });
  const copyWeekMut = trpc.opManager.copyWeek.useMutation();
  const utils = trpc.useUtils();
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
            shiftTime: getDefaultShift(teamRow, dayIndex, weekStart) || null,
          };
        });
      });
    } else {
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
    // an operation makes it a 9-hour Day shift (0600-1500) again.
    let patch = patchIn;
    if ("primaryTask" in patchIn && !("shiftTime" in patchIn)) {
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
  /** Each team's start time on the tasking, by day (a shift with no time, such
   * as RDO, has none). */
  const rosterTargets = () => {
    const out: { teamName: string; date: string; start: string }[] = [];
    for (const teamRow of TEAM_ROWS)
      DAYS.forEach((_, dayIndex) => {
        const start = shiftStart(
          cellShift(taskingGrid[`${teamRow}-${dayIndex}`])
        );
        if (start === null) return;
        out.push({
          teamName: TEAM_LABELS[teamRow],
          date: addDaysUTC(weekStart, dayIndex),
          start: toClock(start),
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
    if (targets.length === 0) return;
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
  /** Saves only the cells that changed; with `repost` it then opens the same
   * "Select who to notify" dialog as Re-post & Notify. */
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
        keys.length === 1 ? "Saved 1 change." : `Saved ${keys.length} changes.`
      );
      await checkRosterAgainstTasking();
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
            shiftTime: getDefaultShift(teamRow, dayIndex, nextWeekStart),
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

  // ── Post & Notify ─────────────────────────────────────────────────────────────
  const openNotifyDialog = () => {
    // Pre-select all users
    const allIds = new Set(notifyRecipients.map(u => u.id));
    setSelectedUserIds(allIds);
    setNotifyDialogOpen(true);
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

  // ── Post & Notify user-selection dialog ─────────────────────────────────────────
  // Shared between the "view" and "edit" mode returns below (both are early
  // returns from this component, so the dialog must be rendered in whichever
  // branch is actually mounted, not just one of them — otherwise clicking
  // "Post & Notify" from view mode sets notifyDialogOpen but there's no
  // <Dialog> mounted anywhere to show it).
  const blendDialog = (
    <BlendTeamsDialog
      open={blendAsk !== null}
      colours={[TEAM_COLOURS.surv1.border, TEAM_COLOURS.surv2.border]}
      dayLabel={
        blendAsk === null
          ? ""
          : (() => {
              const d = weekDays(weekStart)[blendAsk];
              return `${d.name} ${String(d.day).padStart(2, "0")} ${d.month}`;
            })()
      }
      shift={cellShift(taskingGrid[`surv1-${blendAsk ?? 0}`])}
      tasks={{
        surv1: taskText(taskingGrid[`surv1-${blendAsk ?? 0}`]),
        surv2: taskText(taskingGrid[`surv2-${blendAsk ?? 0}`]),
        differ: tasksDiffer(
          taskingGrid[`surv1-${blendAsk ?? 0}`],
          taskingGrid[`surv2-${blendAsk ?? 0}`]
        ),
      }}
      onYes={keep => blendDay(blendAsk ?? 0, keep)}
      onNo={() => keepApart(blendAsk ?? 0)}
    />
  );

  const rosterSyncDialog = (
    <RosterSyncDialog
      open={rosterAsk !== null}
      groups={rosterAsk?.groups ?? []}
      members={rosterAsk?.members ?? 0}
      onYes={() => {
        rosterAsk?.answer(true);
        setRosterAsk(null);
      }}
      onNo={() => {
        rosterAsk?.answer(false);
        setRosterAsk(null);
      }}
    />
  );

  const notifyDialog = (
    <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select who to notify</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-1 max-h-72 overflow-y-auto">
          {/* Select All toggle */}
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Checkbox
              id="notify-all"
              checked={
                notifyRecipients.length > 0 &&
                selectedUserIds.size === notifyRecipients.length
              }
              onCheckedChange={checked => {
                if (checked) {
                  setSelectedUserIds(new Set(notifyRecipients.map(u => u.id)));
                } else {
                  setSelectedUserIds(new Set());
                }
              }}
            />
            <Label
              htmlFor="notify-all"
              className="font-semibold cursor-pointer"
            >
              Select All
            </Label>
          </div>
          {/* User list sorted: CIN 667 first, then ascending */}
          {[...notifyRecipients]
            .sort((a, b) => {
              const cinA = a.cin ?? "";
              const cinB = b.cin ?? "";
              if (cinA === "667" && cinB !== "667") return -1;
              if (cinB === "667" && cinA !== "667") return 1;
              return cinA.localeCompare(cinB, undefined, { numeric: true });
            })
            .map(u => (
              <div key={u.id} className="flex items-center gap-2 py-1">
                <Checkbox
                  id={`notify-user-${u.id}`}
                  checked={selectedUserIds.has(u.id)}
                  onCheckedChange={checked => {
                    setSelectedUserIds(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(u.id);
                      else next.delete(u.id);
                      return next;
                    });
                  }}
                />
                <Label
                  htmlFor={`notify-user-${u.id}`}
                  className="cursor-pointer flex items-center gap-2"
                >
                  <span className="font-mono text-xs text-muted-foreground w-10">
                    {u.cin ?? "—"}
                  </span>
                  <span>{u.name}</span>
                </Label>
              </div>
            ))}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotifyDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirmNotify}
            disabled={postWeekMut.isPending}
            className="gap-1"
          >
            <Send className="h-3.5 w-3.5" />
            Post & Notify ({selectedUserIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ── Delete a weekly tasking (admin) ─────────────────────────────────────────────
  // Rendered in the folder, view and edit branches alike (each is an early
  // return), so it is mounted wherever the Delete button was pressed.
  const deleteWeekDialog = (
    <DeleteWeekDialog
      weekStart={deleteWeekFor}
      label={deleteWeekFor ? formatWeekLabel(deleteWeekFor) : ""}
      onOpenChange={open => {
        if (!open) setDeleteWeekFor(null);
      }}
      onDeleted={() => {
        void refreshRosterViews();
        setViewMode("folder");
      }}
    />
  );

  // ── Create operation inline ───────────────────────────────────────────────────
  const handleCreateOp = async (
    name: string,
    onCreated: (id: number, name: string) => void
  ) => {
    if (!name.trim()) return;
    try {
      const trimmedName = name.trim();
      const result = await createOpMut.mutateAsync({
        name: trimmedName,
        promisNumber: "",
        imsNumber: "",
        investigationUnit: "",
      });
      onCreated(result.id, trimmedName);
      toast.success(`Operation "${trimmedName}" created.`);
    } catch {
      toast.error("Failed to create operation.");
    }
  };

  // ── Navigation for non-admins ─────────────────────────────────────────────────
  const postedWeekStarts = (postedWeeksQuery.data ?? []).map(p => p.weekStart);
  const currentWeekStart = getMondayOfWeek(new Date());
  const canViewWeek =
    isAdmin ||
    weekStart === currentWeekStart ||
    postedWeekStarts.includes(weekStart);
  const sortedViewableWeeks = Array.from(
    new Set([currentWeekStart, ...postedWeekStarts])
  ).sort();
  const currentViewIdx = sortedViewableWeeks.indexOf(weekStart);

  const handlePrevWeek = () => {
    if (isAdmin) setWeekStart(ws => addWeeks(ws, -1));
    else if (currentViewIdx > 0)
      setWeekStart(sortedViewableWeeks[currentViewIdx - 1]);
  };
  const handleNextWeek = () => {
    if (isAdmin) setWeekStart(ws => addWeeks(ws, 1));
    else if (currentViewIdx < sortedViewableWeeks.length - 1)
      setWeekStart(sortedViewableWeeks[currentViewIdx + 1]);
  };

  const activeOps = (opsQuery.data ?? [])
    .filter(op => !op.status || op.status === "active")
    .map(op => ({ id: op.id, name: op.name }));

  // ─────────────────────────────────────────────────────────────────────────────
  // FOLDER VIEW (landing page)
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === "folder") {
    const allWeeks = allWeeksQuery.data ?? [];
    return (
      <DashboardLayout>
        <div className="min-h-full bg-background text-foreground">
          {/* Header */}
          <div className="border-b border-border bg-card">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-semibold">CTO Weekly Tasking</h1>
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => setNewWeekDialogOpen(true)}
                >
                  <CalendarPlus className="h-4 w-4" />
                  New CTO Weekly Tasking
                </Button>
              )}
            </div>
          </div>

          {/* Week list */}
          <div className="px-4 py-6">
            {allWeeksQuery.isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                Loading…
              </div>
            ) : allWeeks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                <FolderOpen className="h-12 w-12 opacity-30" />
                <p className="text-base font-medium">
                  No weekly tasking sheets yet.
                </p>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setNewWeekDialogOpen(true)}
                    className="gap-1"
                  >
                    <CalendarPlus className="h-4 w-4" /> Create First Week
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {allWeeks.map((week, idx) => (
                  <div
                    key={week.weekStart}
                    className="flex items-stretch gap-2"
                  >
                    <button
                      onClick={() => {
                        setWeekStart(week.weekStart);
                        setViewMode("view");
                      }}
                      className="min-w-0 flex-1 text-left rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors px-4 py-3 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        <div>
                          <p className="font-medium text-sm">
                            CTO Weekly Tasking —{" "}
                            {formatWeekLabel(week.weekStart)}
                          </p>
                          {week.postedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Posted{" "}
                              {new Date(week.postedAt).toLocaleDateString(
                                "en-AU",
                                { dateStyle: "medium" }
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {idx === 0 && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                            Latest
                          </span>
                        )}
                        {week.posted ? (
                          <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Posted
                          </span>
                        ) : (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                            Draft
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Delete the weekly tasking for ${formatWeekLabel(week.weekStart)}`}
                        title="Delete this weekly tasking"
                        onClick={() => setDeleteWeekFor(week.weekStart)}
                        className="h-auto w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New week dialog */}
          <Dialog open={newWeekDialogOpen} onOpenChange={setNewWeekDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>New CTO Weekly Tasking</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Creating week:{" "}
                <span className="font-semibold text-foreground">
                  {formatWeekLabel(nextNewWeekStart)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Shift times are always auto-populated from the rotation
                schedule. You can change them manually after creating.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleCopyLastWeek}
                  disabled={isCreatingWeek || !copySource}
                  className="gap-2 justify-start"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  <div className="text-left">
                    <p className="font-medium">Copy Last Week</p>
                    <p className="text-xs text-muted-foreground font-normal">
                      {copySource
                        ? `Copies contacts & priority board from ${formatWeekLabel(copySource.weekStart)}`
                        : "No earlier week has contacts or a priority board to copy"}
                    </p>
                  </div>
                </Button>
                <Button
                  onClick={handleCreateBlankWeek}
                  disabled={isCreatingWeek}
                  className="gap-2 justify-start"
                  variant="outline"
                >
                  <CalendarPlus className="h-4 w-4" />
                  <div className="text-left">
                    <p className="font-medium">Create New</p>
                    <p className="text-xs text-muted-foreground font-normal">
                      Start with a blank sheet
                    </p>
                  </div>
                </Button>
              </div>
              {isCreatingWeek && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Creating…
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        {deleteWeekDialog}
      </DashboardLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FULL VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === "view") {
    return (
      <DashboardLayout>
        <div
          className={`min-h-full bg-background text-foreground ${editingCal ? "pb-24" : ""}`}
        >
          <div className="no-print">
            <PageHeader
              weekStart={weekStart}
              onPrev={handlePrevWeek}
              onNext={handleNextWeek}
              prevDisabled={!isAdmin && currentViewIdx <= 0}
              nextDisabled={
                !isAdmin && currentViewIdx >= sortedViewableWeeks.length - 1
              }
              onBack={() => setViewMode("folder")}
              rightSlot={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isAdmin && editingCal && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden md:inline-flex"
                        disabled={isSavingTasking}
                        onClick={cancelEditing}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          postedQuery.data?.posted ? "outline" : "default"
                        }
                        disabled={
                          isSavingTasking || timelineChanges.length === 0
                        }
                        onClick={() => void saveTimelineChanges(false)}
                        className="hidden gap-1 md:inline-flex"
                      >
                        <Save className="h-3.5 w-3.5" /> Save
                      </Button>
                      {postedQuery.data?.posted && (
                        <Button
                          size="sm"
                          disabled={
                            isSavingTasking || timelineChanges.length === 0
                          }
                          onClick={() => void saveTimelineChanges(true)}
                          className="hidden gap-1 md:inline-flex"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Save and re-post
                        </Button>
                      )}
                    </>
                  )}
                  {isAdmin && !editingCal && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCal(true)}
                        className="gap-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit Tasking
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewMode("edit")}
                        className="gap-1"
                        title="On-call, contacts and the priority board"
                      >
                        Edit Contacts &amp; Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExportDialogOpen(true)}
                        className="gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> Export PDF
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void postWithRosterCheck()}
                        disabled={postWeekMut.isPending}
                        className="gap-1"
                        variant={
                          postedQuery.data?.posted ? "outline" : "default"
                        }
                      >
                        {postWeekMut.isPending ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : postedQuery.data?.posted ? (
                          <RefreshCw className="h-3.5 w-3.5" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {postedQuery.data?.posted
                          ? "Re-post & Notify"
                          : "Post & Notify"}
                      </Button>
                    </>
                  )}
                </div>
              }
            />
          </div>

          {/* Branded hero banner */}
          <style>{`@media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 6mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .print-scale { transform: scale(0.72); transform-origin: top left; width: 139%; } }`}</style>
          <div
            className="print:block"
            style={{
              background:
                "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            }}
          >
            <div className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  CTO Weekly Tasking
                </h1>
                <span className="text-sm text-blue-200">
                  {formatWeekLabel(weekStart)}
                </span>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1">
                <p className="text-xs text-blue-400">
                  {new Date().toLocaleDateString("en-AU", {
                    dateStyle: "long",
                  })}
                </p>
              </div>
            </div>
          </div>

          {!canViewWeek ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <p className="text-base font-medium">
                No tasking posted for this week yet.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4 print:p-0 print-scale">
              <FullViewOnCall
                onCallEntries={onCallEntries}
                contacts={contacts}
                users={usersQuery.data ?? []}
              />
              <FullViewPriority priorityRows={priorityRows} />
              <TaskingCalendarViews
                weekStart={weekStart}
                teams={taskingTeams}
                grid={taskingGrid}
                issueCount={taskingIssueCount}
                counts={taskingCoverage}
                breaches={taskingBreaches}
                breachCount={taskingBreachCount}
                onOpenRoster={i =>
                  navigate(`/cto-roster?date=${addDaysUTC(weekStart, i)}`)
                }
                edit={
                  isAdmin && editingCal
                    ? {
                        editable: true,
                        ops: activeOps.map(o => o.name),
                        onSlide: slideTeamShift,
                        onShift: setTeamShift,
                        onSecond: pickSecondOp,
                        onOp: pickTeamOp,
                        onCreateOp: name =>
                          new Promise<string | null>(resolve => {
                            void handleCreateOp(name, (_, made) =>
                              resolve(made)
                            ).then(() => resolve(null));
                          }),
                        onSplit: splitDay,
                        changed: new Set(changedCellKeys(timelineChanges)),
                      }
                    : undefined
                }
                renderWarning={(teamId, dayIndex, primary) => {
                  const cv = taskingCoverage[`${teamId}-${dayIndex}`];
                  return cv?.short ? (
                    <CoverageWarningBadge
                      teamName={TEAM_LABELS[teamId as TeamRow]}
                      day={DAYS[dayIndex]}
                      onDuty={cv.onDuty}
                      min={cv.min}
                      primaryTask={primary || null}
                    />
                  ) : null;
                }}
              />
            </div>
          )}
        </div>
        {isAdmin && editingCal && timelineChanges.length > 0 && (
          <div
            role="region"
            aria-label="Unsaved timeline changes"
            className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-amber-500 bg-card px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.18)] print:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-semibold">
                  {timelineChanges.length === 1
                    ? "1 change"
                    : `${timelineChanges.length} changes`}{" "}
                  (not saved yet)
                </p>
                <p
                  className="line-clamp-2 text-xs text-muted-foreground"
                  title={timelineChanges.map(c => c.text).join("\n")}
                >
                  {timelineChanges.map(c => c.text).join("  •  ")}
                </p>
              </div>
              {/* On a phone the buttons are down here, within reach; on a
                  laptop or tablet they are at the top of the page. */}
              <div className="flex gap-2 md:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={isSavingTasking}
                  onClick={cancelEditing}
                >
                  Cancel
                </Button>
                <Button
                  variant={postedQuery.data?.posted ? "outline" : "default"}
                  size="sm"
                  className="h-9"
                  disabled={isSavingTasking}
                  onClick={() => void saveTimelineChanges(false)}
                >
                  Save
                </Button>
                {postedQuery.data?.posted && (
                  <Button
                    size="sm"
                    className="h-9 gap-1"
                    disabled={isSavingTasking}
                    onClick={() => void saveTimelineChanges(true)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Save and re-post
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        {isAdmin && editingCal && timelineChanges.length === 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 py-3 print:hidden md:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Editing. No changes yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={cancelEditing}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {blendDialog}
        {rosterSyncDialog}
        {notifyDialog}
        <ExportTaskingDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          onExport={handleExportTasking}
        />
        {deleteWeekDialog}
      </DashboardLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT VIEW (admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="min-h-full bg-background text-foreground">
        <PageHeader
          weekStart={weekStart}
          onPrev={() => setWeekStart(ws => addWeeks(ws, -1))}
          onNext={() => setWeekStart(ws => addWeeks(ws, 1))}
          onBack={() => setViewMode("folder")}
          rightSlot={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode("view")}
                className="gap-1"
              >
                <Eye className="h-3.5 w-3.5" /> Full View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteWeekFor(weekStart)}
                className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          }
        />

        {weekHasNoContactsOrPriority && emptyWeekSourceQuery.data && (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <span>
              This week has no contacts or priority board yet. The latest
              earlier week with them is{" "}
              <b>{formatWeekLabel(emptyWeekSourceQuery.data.weekStart)}</b>.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFillFromEarlierWeek}
              disabled={isFillingWeek}
              className="gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              {isFillingWeek ? "Copying…" : "Copy them in"}
            </Button>
          </div>
        )}

        <div className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 w-full grid grid-cols-3">
              <TabsTrigger value="oncall">On-Call</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="priority">Priority</TabsTrigger>
            </TabsList>

            {/* ── Contacts ──────────────────────────────────────────────────── */}
            <TabsContent value="contacts" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Supervisor Contacts</h2>
                <Button
                  size="sm"
                  onClick={saveDetails}
                  disabled={
                    saveContactsMut.isPending || savePriorityMut.isPending
                  }
                  className="gap-1"
                >
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {["CTO Inspector", "PTT"].map(role => (
                    <ContactRoleCard
                      key={role}
                      role={role}
                      contacts={contacts}
                      setContacts={setContacts}
                      users={usersQuery.data ?? []}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  {["Team 1", "Team 2"].map(role => (
                    <ContactRoleCard
                      key={role}
                      role={role}
                      contacts={contacts}
                      setContacts={setContacts}
                      users={usersQuery.data ?? []}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ── On-Call ───────────────────────────────────────────────────── */}
            <TabsContent value="oncall" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">On-Call Supervisor</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setOnCallEntries(prev => [
                        ...prev,
                        {
                          localId: uid(),
                          role: "On-Call Supervisor",
                          userId: null,
                          mobile: null,
                          isOnCall: true,
                          dayScope: "full",
                        },
                      ])
                    }
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveDetails}
                    disabled={
                      saveContactsMut.isPending || savePriorityMut.isPending
                    }
                    className="gap-1"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              </div>
              {onCallEntries.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="mb-3">No on-call entries yet.</p>
                  <Button
                    size="sm"
                    onClick={() =>
                      setOnCallEntries([
                        {
                          localId: uid(),
                          role: "On-Call Supervisor",
                          userId: null,
                          mobile: null,
                          isOnCall: true,
                          dayScope: "full",
                        },
                      ])
                    }
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Entry
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {onCallEntries.map(entry => (
                    <OnCallEntryEditor
                      key={entry.localId}
                      entry={entry}
                      onChange={patch =>
                        setOnCallEntries(prev =>
                          prev.map(e =>
                            e.localId === entry.localId ? { ...e, ...patch } : e
                          )
                        )
                      }
                      onRemove={() =>
                        setOnCallEntries(prev =>
                          prev.filter(e => e.localId !== entry.localId)
                        )
                      }
                      users={usersQuery.data ?? []}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Priority Board ────────────────────────────────────────────── */}
            <TabsContent value="priority" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Priority Board</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addPriorityRow}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveDetails}
                    disabled={
                      saveContactsMut.isPending || savePriorityMut.isPending
                    }
                    className="gap-1"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              </div>
              {priorityRows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="mb-3">No priority rows yet.</p>
                  <Button size="sm" onClick={addPriorityRow} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add First Row
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {priorityRows.map((row, idx) => (
                    <PriorityRowEditor
                      key={row.localId}
                      row={row}
                      idx={idx}
                      onChange={patch => updatePriorityRow(row.localId, patch)}
                      onRemove={() => removePriorityRow(row.localId)}
                      opOptions={activeOps}
                      onCreateOp={handleCreateOp}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {blendDialog}
      {rosterSyncDialog}
      {notifyDialog}
      {deleteWeekDialog}
    </DashboardLayout>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
function PageHeader({
  weekStart,
  onPrev,
  onNext,
  onBack,
  prevDisabled,
  nextDisabled,
  rightSlot,
}: {
  weekStart: string;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex-1 flex items-center justify-center gap-1 min-w-0 basis-full sm:basis-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          disabled={prevDisabled}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold truncate px-1">
          {formatWeekLabel(weekStart)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={nextDisabled}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {rightSlot && (
        <div className="shrink-0 basis-full sm:basis-auto flex items-center justify-center sm:justify-end">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

// ─── ContactRoleCard ──────────────────────────────────────────────────────────
function ContactRoleCard({
  role,
  contacts,
  setContacts,
  users,
}: {
  role: string;
  contacts: ContactEntry[];
  setContacts: React.Dispatch<React.SetStateAction<ContactEntry[]>>;
  users: {
    id: number;
    name: string;
    cin: string | null;
    phone?: string | null;
  }[];
}) {
  const entry = contacts.find(c => c.role === role);

  const update = (patch: Partial<ContactEntry>) => {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.role === role);
      if (idx >= 0)
        return prev.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      return [
        ...prev,
        {
          localId: uid(),
          role,
          userId: null,
          phone: null,
          sortOrder: prev.length,
          ...patch,
        },
      ];
    });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {role}
      </p>
      <Select
        value={entry?.userId ? String(entry.userId) : "__none__"}
        onValueChange={v => {
          const uid_val = v === "__none__" ? null : Number(v);
          const selectedUser = uid_val
            ? users.find(u => u.id === uid_val)
            : null;
          update({
            userId: uid_val,
            phone: selectedUser?.phone ?? entry?.phone ?? null,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select user…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
              {u.cin ? ` (${u.cin})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs"
        placeholder="Phone / mobile"
        value={entry?.phone ?? ""}
        onChange={e => update({ phone: e.target.value })}
      />
    </div>
  );
}

// ─── Coverage warning badge ───────────────────────────────────────────────────
// Click (or hover, on desktop) to see why a tasked cell is flagged — which
// team/day, what it's tasked for, and the actual vs minimum headcount.
function CoverageWarningBadge({
  teamName,
  day,
  onDuty,
  min,
  primaryTask,
}: {
  teamName: string;
  day: string;
  onDuty: number;
  min: number;
  primaryTask?: string | null;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 hover:underline underline-offset-2"
        >
          <AlertTriangle className="h-3 w-3" />
          {onDuty}/{min} rostered
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-xs space-y-1.5 p-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 font-semibold text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          Tasking issue
        </div>
        <p className="text-foreground leading-snug">
          {teamName} is tasked{primaryTask ? ` for "${primaryTask}"` : ""} on{" "}
          {day}, but only {onDuty} of the {min} minimum required{" "}
          {onDuty === 1 ? "is" : "are"} rostered on duty that day.
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ─── PriorityRowEditor ────────────────────────────────────────────────────────
function PriorityRowEditor({
  row,
  idx,
  onChange,
  onRemove,
  opOptions,
  onCreateOp,
}: {
  row: PriorityRow;
  idx: number;
  onChange: (patch: Partial<PriorityRow>) => void;
  onRemove: () => void;
  opOptions: { id: number; name: string }[];
  onCreateOp: (
    name: string,
    onCreated: (id: number, name: string) => void
  ) => void;
}) {
  const [addingOp, setAddingOp] = useState(false);
  const [newOpName, setNewOpName] = useState("");
  const reqTypes = row.requestType
    ? row.requestType
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  const toggleReqType = (rt: string) => {
    const next = reqTypes.includes(rt)
      ? reqTypes.filter(r => r !== rt)
      : [...reqTypes, rt];
    onChange({ requestType: next.join(", ") });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={String(row.priority || idx + 1)}
          onValueChange={v => onChange({ priority: Number(v) })}
        >
          <SelectTrigger className="h-8 text-xs w-16 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2].map(n => (
              <SelectItem key={n} value={String(n)}>
                #{n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={row.category}
          onValueChange={v => onChange({ category: v })}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Operation */}
      <div className="space-y-1">
        <Select
          value={row.operationName ?? "__none__"}
          onValueChange={v => {
            if (v === "__none__") {
              onChange({ operationId: null, operationName: null });
            } else if (v === "__add__") {
              setAddingOp(true);
            } else {
              const op = opOptions.find(o => o.name === v);
              onChange({ operationId: op?.id ?? null, operationName: v });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-full">
            <SelectValue placeholder="Select operation…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {opOptions.map(op => (
              <SelectItem key={op.id} value={op.name}>
                {op.name}
              </SelectItem>
            ))}
            <SelectItem value="__add__" className="text-primary">
              + Add Operation
            </SelectItem>
          </SelectContent>
        </Select>
        {addingOp && (
          <div className="flex gap-1">
            <Input
              className="h-8 text-xs flex-1"
              placeholder="Operation name…"
              value={newOpName}
              onChange={e => setNewOpName(e.target.value)}
              autoFocus
            />
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                onCreateOp(newOpName, (id, name) =>
                  onChange({ operationId: id, operationName: name })
                );
                setNewOpName("");
                setAddingOp(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {/* Team */}
      <Input
        className="h-8 text-xs"
        placeholder="Team (e.g. Surv 1)"
        value={row.team ?? ""}
        onChange={e => onChange({ team: e.target.value })}
      />
      {/* Request Type multi-select */}
      <div className="flex flex-wrap gap-3">
        {REQUEST_TYPES.map(rt => (
          <label
            key={rt}
            className="flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Checkbox
              checked={reqTypes.includes(rt)}
              onCheckedChange={() => toggleReqType(rt)}
            />
            {rt}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── OnCallEntryEditor ────────────────────────────────────────────────────────
function OnCallEntryEditor({
  entry,
  onChange,
  onRemove,
  users,
}: {
  entry: OnCallEntry;
  onChange: (patch: Partial<OnCallEntry>) => void;
  onRemove: () => void;
  users: {
    id: number;
    name: string;
    cin: string | null;
    phone?: string | null;
  }[];
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Select value={entry.role} onValueChange={v => onChange({ role: v })}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ON_CALL_ROLES.map(r => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Select
        value={entry.userId ? String(entry.userId) : "__none__"}
        onValueChange={v => {
          const uid_val = v === "__none__" ? null : Number(v);
          const selectedUser = uid_val
            ? users.find(u => u.id === uid_val)
            : null;
          onChange({
            userId: uid_val,
            mobile: selectedUser?.phone ?? entry.mobile ?? null,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs w-full">
          <SelectValue placeholder="Select user…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
              {u.cin ? ` (${u.cin})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs"
        placeholder="Mobile number"
        value={entry.mobile ?? ""}
        onChange={e => onChange({ mobile: e.target.value })}
      />
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Day:</span>
        {["full", ...DAYS].map(d => (
          <button
            key={d}
            onClick={() => onChange({ dayScope: d })}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-colors",
              entry.dayScope === d
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            )}
          >
            {d === "full" ? "Full Week" : d}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-xs">
        <Checkbox
          checked={entry.isOnCall}
          onCheckedChange={v => onChange({ isOnCall: !!v })}
        />
        On-Call
      </label>
    </div>
  );
}

// ─── Full View sub-components ─────────────────────────────────────────────────
// Combined On-Call + Supervisor Contacts card (compact)
function FullViewOnCall({
  onCallEntries,
  contacts,
  users,
}: {
  onCallEntries: OnCallEntry[];
  contacts: ContactEntry[];
  users: {
    id: number;
    name: string;
    cin: string | null;
    phone?: string | null;
  }[];
}) {
  const renderContact = (role: string) => {
    const c = contacts.find(x => x.role === role);
    const user = users.find(u => u.id === c?.userId);
    const name = user?.name ?? "—";
    const phone = c?.phone ?? user?.phone ?? null;
    return (
      <div key={role} className="py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
            {role}
          </span>
          <span className="text-xs font-semibold text-foreground">{name}</span>
          {phone && (
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-1">
              {phone}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Always shown, even with nothing saved for the week — the full view is the
  // whole page (supervisors & contacts, priority board and calendar), and an
  // empty section says so rather than disappearing.
  const hasOnCall = onCallEntries.length > 0;

  return (
    <section>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div
          className="px-4 py-2.5 border-b border-border"
          style={{
            background: "linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)",
          }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase text-white">
            Supervisors &amp; Contacts
          </h2>
        </div>
        <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {/* Left: On-Call */}
          <div className="py-2 sm:py-0 sm:pr-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              On-Call
            </p>
            {hasOnCall ? (
              onCallEntries.map((oc, i) => {
                const user = users.find(u => u.id === oc.userId);
                const name = user?.name ?? "—";
                const mobile = oc.mobile ?? user?.phone ?? null;
                return (
                  <div key={i} className="py-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {name}
                    </span>
                    {mobile && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {mobile}
                      </span>
                    )}
                    {oc.isOnCall && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 ml-2"
                      >
                        On-Call
                      </Badge>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">Not set</p>
            )}
          </div>
          {/* Middle: CTO Inspector + PTT */}
          <div className="py-2 sm:py-0 sm:px-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Supervisors
            </p>
            <div className="divide-y divide-border/50">
              {["CTO Inspector", "PTT"].map(renderContact)}
            </div>
          </div>
          {/* Right: Team 1 + Team 2 */}
          <div className="py-2 sm:py-0 sm:pl-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              &nbsp;
            </p>
            <div className="divide-y divide-border/50">
              {["Team 1", "Team 2"].map(renderContact)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Keep FullViewContacts as a no-op (merged into FullViewOnCall)
function FullViewContacts(_props: {
  contacts: ContactEntry[];
  users: { id: number; name: string; cin: string | null }[];
}) {
  return null;
}

function FullViewPriority({ priorityRows }: { priorityRows: PriorityRow[] }) {
  return (
    <section>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold tracking-wide">
            Priority Board
          </h2>
        </div>
        {priorityRows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No priorities set for this week.
          </p>
        )}
        {/* Mobile: stacked cards */}
        <div className="block sm:hidden p-3 space-y-2">
          {priorityRows.map((row, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-background p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-muted-foreground w-5">
                  {i + 1}.
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {row.operationName ?? "—"}
                </span>
                {row.category && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 ml-auto"
                  >
                    {row.category}
                  </Badge>
                )}
              </div>
              <div className="flex gap-3 pl-5">
                {row.team && (
                  <span className="text-[11px] text-muted-foreground">
                    {row.team}
                  </span>
                )}
                {row.requestType && (
                  <span className="text-[11px] text-muted-foreground">
                    {row.requestType}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Desktop: table */}
        <div
          className={`hidden overflow-x-auto ${priorityRows.length === 0 ? "" : "sm:block"}`}
        >
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border w-10 text-foreground">
                  #
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border w-24 text-foreground">
                  Category
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border text-foreground">
                  Operation
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border w-28 text-foreground">
                  Team
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-border text-foreground">
                  Request Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {priorityRows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 text-muted-foreground font-medium border-r border-border">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5 border-r border-border">
                    {row.category && (
                      <Badge
                        variant="outline"
                        className="text-[11px] px-2 py-0.5 font-medium"
                      >
                        {row.category}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-foreground border-r border-border">
                    {row.operationName ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-foreground border-r border-border">
                    {row.team ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-foreground">
                    {row.requestType ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
