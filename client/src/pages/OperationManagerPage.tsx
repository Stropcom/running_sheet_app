import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Printer,
  Bell,
  BellOff,
  CheckCircle2,
  GripVertical,
} from "lucide-react";
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

// ─── Constants ────────────────────────────────────────────────────────────────
const TEAM_ROWS = ["surv1", "surv2", "ptt", "cap"] as const;
type TeamRow = (typeof TEAM_ROWS)[number];
const TEAM_LABELS: Record<TeamRow, string> = {
  surv1: "Surveillance 1",
  surv2: "Surveillance 2",
  ptt: "PTT",
  cap: "Cap. Support",
};
const SHIFT_OPTIONS = [
  "RDO",
  "0600-1400",
  "0700-1500",
  "1000-1800",
  "1400-2200",
  "Custom",
];
const CATEGORIES = ["A-TACC", "WC", "Other"];
const REQUEST_TYPES = ["Surv", "PTT", "Capability"];
const SUPERVISOR_ROLES = [
  "CTO Inspector",
  "Surveillance Team 1",
  "Surveillance Team 2",
  "PTT",
];
const ON_CALL_ROLES = [
  "On-Call Supervisor",
  "On-Call PTT",
  "On-Call Cap. Support",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Week helpers ─────────────────────────────────────────────────────────────
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setDate(d.getDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(d)} – ${fmt(end)}`;
}

// ─── Shift auto-population ────────────────────────────────────────────────────
// Surv 1 is on DAY shift the week of 2026-07-14 (Monday). Alternates each week.
const SURV1_DAY_ANCHOR = "2026-07-14";

function isSurv1DayShift(weekStart: string): boolean {
  const anchor = new Date(SURV1_DAY_ANCHOR + "T00:00:00Z").getTime();
  const ws = new Date(weekStart + "T00:00:00Z").getTime();
  const diffWeeks = Math.round((ws - anchor) / (7 * 24 * 3600 * 1000));
  return diffWeeks % 2 === 0;
}

function getDefaultShift(
  teamRow: TeamRow,
  dayIndex: number,
  weekStart: string
): string {
  if (teamRow === "ptt" || teamRow === "cap") return "";
  const surv1IsDay = isSurv1DayShift(weekStart);
  const isDay = teamRow === "surv1" ? surv1IsDay : !surv1IsDay;
  if (isDay) {
    return dayIndex <= 4 ? "0700-1500" : "RDO";
  } else {
    if (dayIndex === 0) return "RDO";
    if (dayIndex >= 1 && dayIndex <= 3) return "1400-2200";
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

interface TaskingCell {
  shiftTime?: string | null;
  customTime?: string;
  primaryTask?: string | null;
  primaryOther?: string;
  secondaryTask?: string | null;
  secondaryOther?: string;
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

// ─── Push notification hook ───────────────────────────────────────────────────
function usePushSubscription() {
  const [subscribed, setSubscribed] = useState(false);
  const subscribeMut = trpc.opManager.subscribePush.useMutation();
  const unsubscribeMut = trpc.opManager.unsubscribePush.useMutation();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const existing = await reg.pushManager.getSubscription();
        setSubscribed(!!existing);
      })
      .catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in this browser.");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
      if (!vapidKey) {
        toast.error("Push notifications not configured.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      const json = sub.toJSON();
      const keys = json.keys as Record<string, string>;
      await subscribeMut.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: keys["p256dh"],
        auth: keys["auth"],
      });
      setSubscribed(true);
      toast.success("Push notifications enabled.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to enable push notifications.");
    }
  }, [subscribeMut]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMut.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Push notifications disabled.");
    } catch {
      toast.error("Failed to disable push notifications.");
    }
  }, [unsubscribeMut]);

  return { subscribed, subscribe, unsubscribe };
}

// ─── Unique ID helper ─────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => String(++_uid);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OperationManagerPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";

  const [weekStart, setWeekStart] = useState(() =>
    getMondayOfWeek(new Date())
  );
  const [viewMode, setViewMode] = useState<"edit" | "view">(
    isAdmin ? "edit" : "view"
  );
  useEffect(() => {
    if (!isAdmin) setViewMode("view");
  }, [isAdmin]);

  const { subscribed, subscribe, unsubscribe } = usePushSubscription();

  // ── Queries ───────────────────────────────────────────────────────────────────
  const opsQuery = trpc.operation.list.useQuery(undefined, { staleTime: 30_000 });
  const usersQuery = trpc.opManager.listUsers.useQuery(undefined, {
    staleTime: 60_000,
  });
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

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const savePriorityMut = trpc.opManager.savePriorityBoard.useMutation();
  const saveTaskingCellMut = trpc.opManager.saveTaskingCell.useMutation();
  const saveContactsMut = trpc.opManager.saveSupervisorContacts.useMutation();
  const postWeekMut = trpc.opManager.postWeek.useMutation();
  const createOpMut = trpc.operation.create.useMutation({
    onSuccess: () => utils.operation.list.invalidate(),
  });
  const utils = trpc.useUtils();

  // ── Local state ───────────────────────────────────────────────────────────────
  const [priorityRows, setPriorityRows] = useState<PriorityRow[]>([]);
  const [taskingGrid, setTaskingGrid] = useState<Record<string, TaskingCell>>(
    {}
  );
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [onCallEntries, setOnCallEntries] = useState<OnCallEntry[]>([]);
  const [activeTab, setActiveTab] = useState("contacts");
  const [isSavingTasking, setIsSavingTasking] = useState(false);

  // ── Sync remote → local ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!priorityQuery.data) return;
    setPriorityRows(
      priorityQuery.data.map((r) => ({ ...r, localId: uid() }))
    );
  }, [priorityQuery.data]);

  useEffect(() => {
    if (!taskingQuery.data) return;
    const grid: Record<string, TaskingCell> = {};
    if (taskingQuery.data.length === 0) {
      TEAM_ROWS.forEach((teamRow) => {
        DAYS.forEach((_, dayIndex) => {
          const key = `${teamRow}-${dayIndex}`;
          grid[key] = { shiftTime: getDefaultShift(teamRow, dayIndex, weekStart) || null };
        });
      });
    } else {
      taskingQuery.data.forEach((cell) => {
        const key = `${cell.teamRow}-${cell.dayIndex}`;
        const storedShift = cell.shiftTime ?? null;
        const isCustomShift =
          storedShift !== null && !SHIFT_OPTIONS.includes(storedShift);
        grid[key] = {
          shiftTime: isCustomShift ? "Custom" : storedShift,
          customTime: isCustomShift ? storedShift ?? "" : "",
          primaryTask: cell.primaryTask ?? null,
          secondaryTask: cell.secondaryTask ?? null,
        };
      });
    }
    setTaskingGrid(grid);
  }, [taskingQuery.data, weekStart]);

  useEffect(() => {
    if (!contactsQuery.data) return;
    const fixed = contactsQuery.data.filter(
      (c) => !ON_CALL_ROLES.includes(c.role)
    );
    const onCall = contactsQuery.data.filter((c) =>
      ON_CALL_ROLES.includes(c.role)
    );
    setContacts(fixed.map((c) => ({ ...c, localId: uid() })));
    setOnCallEntries(
      onCall.map((c) => ({
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
    setPriorityRows((prev) => [
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
    setPriorityRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r))
    );
  };

  const removePriorityRow = (localId: string) => {
    setPriorityRows((prev) =>
      prev
        .filter((r) => r.localId !== localId)
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
      toast.success("Priority board saved.");
    } catch {
      toast.error("Failed to save priority board.");
    }
  };

  // ── Tasking Calendar ──────────────────────────────────────────────────────────
  const updateCell = (
    teamRow: TeamRow,
    dayIndex: number,
    patch: Partial<TaskingCell>
  ) => {
    const key = `${teamRow}-${dayIndex}`;
    setTaskingGrid((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const saveAllTaskingCells = async () => {
    setIsSavingTasking(true);
    try {
      const mutations = TEAM_ROWS.flatMap((teamRow) =>
        DAYS.map((_, dayIndex) => {
          const key = `${teamRow}-${dayIndex}`;
          const cell = taskingGrid[key] ?? {};
          const shiftTime =
            cell.shiftTime === "Custom"
              ? cell.customTime ?? null
              : cell.shiftTime ?? null;
          const primaryTask =
            cell.primaryTask === "Other"
              ? cell.primaryOther ?? null
              : cell.primaryTask ?? null;
          const secondaryTask =
            cell.secondaryTask === "Other"
              ? cell.secondaryOther ?? null
              : cell.secondaryTask ?? null;
          return saveTaskingCellMut.mutateAsync({
            weekStart,
            dayIndex,
            teamRow,
            shiftTime,
            primaryTask,
            secondaryTask,
          });
        })
      );
      await Promise.all(mutations);
      await utils.opManager.getTaskingCalendar.invalidate();
      toast.success("Tasking calendar saved.");
    } catch {
      toast.error("Failed to save tasking calendar.");
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
      toast.success("Contacts saved.");
    } catch {
      toast.error("Failed to save contacts.");
    }
  };

  // ── Post & Notify ─────────────────────────────────────────────────────────────
  const handlePostAndNotify = async () => {
    try {
      await postWeekMut.mutateAsync({ weekStart });
      await utils.opManager.isWeekPosted.invalidate();
      toast.success("CTO Tasking posted and notifications sent.");
    } catch {
      toast.error("Failed to post CTO Tasking.");
    }
  };

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
  const postedWeekStarts = (postedWeeksQuery.data ?? []).map((p) => p.weekStart);
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
    if (isAdmin) setWeekStart((ws) => addWeeks(ws, -1));
    else if (currentViewIdx > 0)
      setWeekStart(sortedViewableWeeks[currentViewIdx - 1]);
  };
  const handleNextWeek = () => {
    if (isAdmin) setWeekStart((ws) => addWeeks(ws, 1));
    else if (currentViewIdx < sortedViewableWeeks.length - 1)
      setWeekStart(sortedViewableWeeks[currentViewIdx + 1]);
  };

  const activeOps = (opsQuery.data ?? []).filter(
    (op) => !op.status || op.status === "active"
  ).map(op => ({ id: op.id, name: op.name }));

  // ─────────────────────────────────────────────────────────────────────────────
  // FULL VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === "view") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PageHeader
          weekStart={weekStart}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
          prevDisabled={!isAdmin && currentViewIdx <= 0}
          nextDisabled={
            !isAdmin && currentViewIdx >= sortedViewableWeeks.length - 1
          }
          onBack={() => navigate("/")}
          rightSlot={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={subscribed ? unsubscribe : subscribe}
                title={
                  subscribed ? "Disable notifications" : "Enable notifications"
                }
              >
                {subscribed ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode("edit")}
                    className="gap-1"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    className="gap-1"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePostAndNotify}
                    disabled={
                      postWeekMut.isPending || !!postedQuery.data?.posted
                    }
                    className="gap-1"
                  >
                    {postedQuery.data?.posted ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {postedQuery.data?.posted ? "Posted" : "Post & Notify"}
                  </Button>
                </>
              )}
            </div>
          }
        />

        {!canViewWeek ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <p className="text-base font-medium">
              No tasking posted for this week yet.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-6 max-w-5xl mx-auto print:p-2">
            <FullViewOnCall
              onCallEntries={onCallEntries}
              users={usersQuery.data ?? []}
            />
            <FullViewContacts
              contacts={contacts}
              users={usersQuery.data ?? []}
            />
            <FullViewTasking taskingGrid={taskingGrid} weekStart={weekStart} />
            <FullViewPriority priorityRows={priorityRows} />
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT VIEW (admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader
        weekStart={weekStart}
        onPrev={() => setWeekStart((ws) => addWeeks(ws, -1))}
        onNext={() => setWeekStart((ws) => addWeeks(ws, 1))}
        onBack={() => navigate("/")}
        rightSlot={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("view")}
            className="gap-1"
          >
            <Eye className="h-3.5 w-3.5" /> Full View
          </Button>
        }
      />

      <div className="p-4 max-w-5xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 w-full grid grid-cols-4">
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="oncall">On-Call</TabsTrigger>
            <TabsTrigger value="tasking">Tasking</TabsTrigger>
            <TabsTrigger value="priority">Priority</TabsTrigger>
          </TabsList>

          {/* ── Contacts ──────────────────────────────────────────────────── */}
          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Supervisor Contacts</h2>
              <Button
                size="sm"
                onClick={saveContacts}
                disabled={saveContactsMut.isPending}
                className="gap-1"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                {["CTO Inspector", "PTT"].map((role) => (
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
                {["Surveillance Team 1", "Surveillance Team 2"].map((role) => (
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
                    setOnCallEntries((prev) => [
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
                  onClick={saveContacts}
                  disabled={saveContactsMut.isPending}
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
                {onCallEntries.map((entry) => (
                  <OnCallEntryEditor
                    key={entry.localId}
                    entry={entry}
                    onChange={(patch) =>
                      setOnCallEntries((prev) =>
                        prev.map((e) =>
                          e.localId === entry.localId ? { ...e, ...patch } : e
                        )
                      )
                    }
                    onRemove={() =>
                      setOnCallEntries((prev) =>
                        prev.filter((e) => e.localId !== entry.localId)
                      )
                    }
                    users={usersQuery.data ?? []}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tasking ───────────────────────────────────────────────────── */}
          <TabsContent value="tasking" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Weekly Tasking Calendar
              </h2>
              <Button
                size="sm"
                onClick={saveAllTaskingCells}
                disabled={isSavingTasking}
                className="gap-1"
              >
                <Save className="h-3.5 w-3.5" />{" "}
                {isSavingTasking ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 font-medium border border-border w-28">
                      Team
                    </th>
                    {DAYS.map((d) => (
                      <th
                        key={d}
                        className="text-center p-2 font-medium border border-border min-w-[120px]"
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEAM_ROWS.map((teamRow) => (
                    <tr key={teamRow} className="border-b border-border">
                      <td className="p-2 font-medium border border-border text-xs">
                        {TEAM_LABELS[teamRow]}
                      </td>
                      {DAYS.map((_, dayIndex) => {
                        const key = `${teamRow}-${dayIndex}`;
                        const cell = taskingGrid[key] ?? {};
                        return (
                          <td
                            key={dayIndex}
                            className="p-1 border border-border align-top"
                          >
                            <TaskingCellEditor
                              cell={cell}
                              onChange={(patch) =>
                                updateCell(teamRow, dayIndex, patch)
                              }
                              opOptions={activeOps}
                              onCreateOp={handleCreateOp}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                  onClick={savePriorityBoard}
                  disabled={savePriorityMut.isPending}
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
                    onChange={(patch) => updatePriorityRow(row.localId, patch)}
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
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
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
      <div className="flex-1 min-w-0 text-center">
        <p className="text-sm font-semibold truncate">
          {formatWeekLabel(weekStart)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={nextDisabled}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {rightSlot}
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
  users: { id: number; name: string; cin: string | null }[];
}) {
  const entry = contacts.find((c) => c.role === role);

  const update = (patch: Partial<ContactEntry>) => {
    setContacts((prev) => {
      const idx = prev.findIndex((c) => c.role === role);
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
        onValueChange={(v) =>
          update({ userId: v === "__none__" ? null : Number(v) })
        }
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select user…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {users.map((u) => (
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
        onChange={(e) => update({ phone: e.target.value })}
      />
    </div>
  );
}

// ─── TaskingCellEditor ────────────────────────────────────────────────────────
function TaskingCellEditor({
  cell,
  onChange,
  opOptions,
  onCreateOp,
}: {
  cell: TaskingCell;
  onChange: (patch: Partial<TaskingCell>) => void;
  opOptions: { id: number; name: string }[];
  onCreateOp: (
    name: string,
    onCreated: (id: number, name: string) => void
  ) => void;
}) {
  const shiftVal = cell.shiftTime ?? "";
  const isCustom = shiftVal === "Custom";

  const taskOpts = [
    { value: "Training", label: "📋 Training" },
    { value: "Other", label: "✏️ Other (free text)" },
    ...opOptions.map((op) => ({ value: op.name, label: op.name })),
  ];

  return (
    <div className="space-y-1">
      {/* Shift */}
      <Select
        value={shiftVal || "__none__"}
        onValueChange={(v) => {
          if (v === "__none__") onChange({ shiftTime: null, customTime: "" });
          else onChange({ shiftTime: v, customTime: "" });
        }}
      >
        <SelectTrigger className="h-7 text-[11px] w-full">
          <SelectValue placeholder="Shift…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {SHIFT_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          className="h-7 text-[11px]"
          placeholder="e.g. 0800-1600"
          value={cell.customTime ?? ""}
          onChange={(e) => onChange({ customTime: e.target.value })}
        />
      )}
      {/* Primary task */}
      <TaskSelect
        placeholder="Primary…"
        value={cell.primaryTask ?? ""}
        otherValue={cell.primaryOther ?? ""}
        onChange={(v, other) =>
          onChange({ primaryTask: v, primaryOther: other })
        }
        taskOpts={taskOpts}
        onCreateOp={(name) =>
          onCreateOp(name, (_, opName) =>
            onChange({ primaryTask: opName, primaryOther: "" })
          )
        }
      />
      {/* Secondary task */}
      <TaskSelect
        placeholder="Secondary…"
        value={cell.secondaryTask ?? ""}
        otherValue={cell.secondaryOther ?? ""}
        onChange={(v, other) =>
          onChange({ secondaryTask: v, secondaryOther: other })
        }
        taskOpts={taskOpts}
        onCreateOp={(name) =>
          onCreateOp(name, (_, opName) =>
            onChange({ secondaryTask: opName, secondaryOther: "" })
          )
        }
      />
    </div>
  );
}

function TaskSelect({
  placeholder,
  value,
  otherValue,
  onChange,
  taskOpts,
  onCreateOp,
}: {
  placeholder: string;
  value: string;
  otherValue: string;
  onChange: (v: string, other: string) => void;
  taskOpts: { value: string; label: string }[];
  onCreateOp: (name: string) => void;
}) {
  const [addingOp, setAddingOp] = useState(false);
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-1">
      <Select
        value={value || "__none__"}
        onValueChange={(v) => {
          if (v === "__add__") {
            setAddingOp(true);
            return;
          }
          if (v === "__none__") onChange("", "");
          else onChange(v, "");
        }}
      >
        <SelectTrigger className="h-7 text-[11px] w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {taskOpts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value="__add__" className="text-primary">
            + Add Operation
          </SelectItem>
        </SelectContent>
      </Select>
      {value === "Other" && (
        <Input
          className="h-7 text-[11px]"
          placeholder="Describe task…"
          value={otherValue}
          onChange={(e) => onChange("Other", e.target.value)}
        />
      )}
      {addingOp && (
        <div className="flex gap-1">
          <Input
            className="h-7 text-[11px] flex-1"
            placeholder="Op name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Button
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              onCreateOp(newName);
              setNewName("");
              setAddingOp(false);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
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
    ? row.requestType.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const toggleReqType = (rt: string) => {
    const next = reqTypes.includes(rt)
      ? reqTypes.filter((r) => r !== rt)
      : [...reqTypes, rt];
    onChange({ requestType: next.join(", ") });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs shrink-0">
          #{idx + 1}
        </Badge>
        <Select
          value={row.category}
          onValueChange={(v) => onChange({ category: v })}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
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
          onValueChange={(v) => {
            if (v === "__none__") {
              onChange({ operationId: null, operationName: null });
            } else if (v === "__add__") {
              setAddingOp(true);
            } else {
              const op = opOptions.find((o) => o.name === v);
              onChange({ operationId: op?.id ?? null, operationName: v });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-full">
            <SelectValue placeholder="Select operation…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {opOptions.map((op) => (
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
              onChange={(e) => setNewOpName(e.target.value)}
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
        onChange={(e) => onChange({ team: e.target.value })}
      />
      {/* Request Type multi-select */}
      <div className="flex flex-wrap gap-3">
        {REQUEST_TYPES.map((rt) => (
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
  users: { id: number; name: string; cin: string | null }[];
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={entry.role}
          onValueChange={(v) => onChange({ role: v })}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ON_CALL_ROLES.map((r) => (
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
        onValueChange={(v) =>
          onChange({ userId: v === "__none__" ? null : Number(v) })
        }
      >
        <SelectTrigger className="h-8 text-xs w-full">
          <SelectValue placeholder="Select user…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {users.map((u) => (
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
        onChange={(e) => onChange({ mobile: e.target.value })}
      />
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Day:</span>
        {["full", ...DAYS].map((d) => (
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
          onCheckedChange={(v) => onChange({ isOnCall: !!v })}
        />
        On-Call
      </label>
    </div>
  );
}

// ─── Full View sub-components ─────────────────────────────────────────────────
function FullViewOnCall({
  onCallEntries,
  users,
}: {
  onCallEntries: OnCallEntry[];
  users: { id: number; name: string; cin: string | null }[];
}) {
  if (onCallEntries.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        On-Call Supervisors
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {onCallEntries.map((oc, i) => {
          const user = users.find((u) => u.id === oc.userId);
          const name = user?.name ?? "—";
          return (
            <div
              key={i}
              className="rounded-lg border border-border p-3 space-y-1"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                {oc.role}
              </p>
              <p className="text-sm font-medium">{name}</p>
              {oc.mobile && (
                <p className="text-xs text-muted-foreground">{oc.mobile}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {oc.isOnCall && (
                  <Badge variant="secondary" className="text-xs">
                    On-Call
                  </Badge>
                )}
                {oc.dayScope !== "full" && (
                  <Badge variant="outline" className="text-xs">
                    {oc.dayScope}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FullViewContacts({
  contacts,
  users,
}: {
  contacts: ContactEntry[];
  users: { id: number; name: string; cin: string | null }[];
}) {
  const renderCard = (role: string) => {
    const c = contacts.find((x) => x.role === role);
    const user = users.find((u) => u.id === c?.userId);
    const name = user?.name ?? "—";
    return (
      <div key={role} className="rounded-lg border border-border p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {role}
        </p>
        <p className="text-sm font-medium">{name}</p>
        {c?.phone && (
          <p className="text-xs text-muted-foreground">{c.phone}</p>
        )}
      </div>
    );
  };

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Supervisor Contacts
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          {["CTO Inspector", "PTT"].map(renderCard)}
        </div>
        <div className="space-y-3">
          {["Surveillance Team 1", "Surveillance Team 2"].map(renderCard)}
        </div>
      </div>
    </section>
  );
}

function FullViewTasking({
  taskingGrid,
  weekStart,
}: {
  taskingGrid: Record<string, TaskingCell>;
  weekStart: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Weekly Tasking
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium border border-border w-28">
                Team
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className="text-center p-2 font-medium border border-border min-w-[90px]"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM_ROWS.map((teamRow) => (
              <tr key={teamRow}>
                <td className="p-2 font-medium border border-border">
                  {TEAM_LABELS[teamRow]}
                </td>
                {DAYS.map((_, dayIndex) => {
                  const key = `${teamRow}-${dayIndex}`;
                  const cell = taskingGrid[key] ?? {};
                  const shift =
                    cell.shiftTime === "Custom"
                      ? cell.customTime ?? "Custom"
                      : cell.shiftTime ?? "";
                  const primary =
                    cell.primaryTask === "Other"
                      ? cell.primaryOther ?? ""
                      : cell.primaryTask ?? "";
                  const secondary =
                    cell.secondaryTask === "Other"
                      ? cell.secondaryOther ?? ""
                      : cell.secondaryTask ?? "";
                  return (
                    <td
                      key={dayIndex}
                      className={cn(
                        "p-2 border border-border align-top",
                        shift === "RDO" && "bg-muted/30"
                      )}
                    >
                      {shift && (
                        <p
                          className={cn(
                            "font-semibold",
                            shift === "RDO"
                              ? "text-muted-foreground"
                              : "text-primary"
                          )}
                        >
                          {shift}
                        </p>
                      )}
                      {primary && <p className="mt-0.5 truncate">{primary}</p>}
                      {secondary && (
                        <p className="text-muted-foreground truncate">
                          {secondary}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FullViewPriority({ priorityRows }: { priorityRows: PriorityRow[] }) {
  if (priorityRows.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Priority Board
      </h2>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium border-b border-border w-8">
                #
              </th>
              <th className="text-left p-2 font-medium border-b border-border">
                Category
              </th>
              <th className="text-left p-2 font-medium border-b border-border">
                Operation
              </th>
              <th className="text-left p-2 font-medium border-b border-border">
                Team
              </th>
              <th className="text-left p-2 font-medium border-b border-border">
                Request Type
              </th>
            </tr>
          </thead>
          <tbody>
            {priorityRows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="p-2 text-muted-foreground">{i + 1}</td>
                <td className="p-2 font-medium">{row.category}</td>
                <td className="p-2">{row.operationName ?? "—"}</td>
                <td className="p-2">{row.team ?? "—"}</td>
                <td className="p-2">{row.requestType ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
