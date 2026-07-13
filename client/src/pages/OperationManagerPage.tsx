import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  GripVertical,
  Phone,
  User,
  Calendar,
  ClipboardList,
  Save,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns Monday of the week containing `date` as YYYY-MM-DD (Perth UTC+8). */
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  // Adjust for Perth UTC+8
  const perthOffset = 8 * 60;
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const perthMs = utcMs + perthOffset * 60000;
  const perth = new Date(perthMs);
  const day = perth.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  perth.setDate(perth.getDate() + diff);
  return perth.toISOString().slice(0, 10);
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + "T00:00:00+08:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00+08:00");
  const end = new Date(weekStart + "T00:00:00+08:00");
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${start.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString("en-AU", opts)}`;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TEAM_ROWS = ["Surveillance 1", "Surveillance 2", "PTT", "Cap. Support"];
const SHIFT_OPTIONS = [
  "RDO",
  "0600–1400",
  "0700–1500",
  "1400–2200",
  "1000–1800",
  "Custom",
];
const DEFAULT_CATEGORIES = ["A-TACC", "WC", "Priority", "Tasking", "Other"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriorityRow {
  id?: number;
  localId: string;
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
  primaryTask?: string | null;
  secondaryTask?: string | null;
}

interface SupervisorContact {
  id?: number;
  localId: string;
  role: string;
  userId?: number | null;
  customName?: string | null;
  phone?: string | null;
  sortOrder: number;
}

// ─── Sortable Priority Row ────────────────────────────────────────────────────

function SortablePriorityRow({
  row,
  index,
  operations,
  onUpdate,
  onDelete,
  onCreateOp,
}: {
  row: PriorityRow;
  index: number;
  operations: { id: number; name: string }[];
  onUpdate: (localId: string, field: keyof PriorityRow, value: unknown) => void;
  onDelete: (localId: string) => void;
  onCreateOp: (name: string, localId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.localId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [opSearch, setOpSearch] = useState(row.operationName ?? "");
  const [showOpDropdown, setShowOpDropdown] = useState(false);
  const opRef = useRef<HTMLTableCellElement>(null);

  const filteredOps = operations.filter((op) =>
    op.name.toLowerCase().includes(opSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (opRef.current && !opRef.current.contains(e.target as Node)) {
        setShowOpDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
      <td className="p-1 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none"
        >
          <GripVertical size={14} />
        </button>
      </td>
      <td className="p-1 text-center text-xs text-muted-foreground w-8">{index + 1}</td>
      <td className="p-1 w-28">
        <Input
          value={row.category}
          onChange={(e) => onUpdate(row.localId, "category", e.target.value)}
          className="h-7 text-xs"
          placeholder="Category"
        />
      </td>
      <td className="p-1 w-16">
        <Input
          type="number"
          min={1}
          value={row.priority}
          onChange={(e) => onUpdate(row.localId, "priority", parseInt(e.target.value) || 1)}
          className="h-7 text-xs text-center"
        />
      </td>
      <td className="p-1 min-w-[160px]" ref={opRef}>
        <div className="relative">
          <Input
            value={opSearch}
            onChange={(e) => {
              setOpSearch(e.target.value);
              onUpdate(row.localId, "operationName", e.target.value);
              onUpdate(row.localId, "operationId", null);
              setShowOpDropdown(true);
            }}
            onFocus={() => setShowOpDropdown(true)}
            className="h-7 text-xs"
            placeholder="Search or create..."
          />
          {showOpDropdown && opSearch.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-md max-h-40 overflow-y-auto">
              {filteredOps.map((op) => (
                <button
                  key={op.id}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={() => {
                    onUpdate(row.localId, "operationId", op.id);
                    onUpdate(row.localId, "operationName", op.name);
                    setOpSearch(op.name);
                    setShowOpDropdown(false);
                  }}
                >
                  {op.name}
                </button>
              ))}
              {filteredOps.length === 0 && (
                <button
                  className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-accent flex items-center gap-1"
                  onMouseDown={() => {
                    onCreateOp(opSearch, row.localId);
                    setShowOpDropdown(false);
                  }}
                >
                  <Plus size={12} /> Create "{opSearch}"
                </button>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="p-1 w-28">
        <Input
          value={row.team ?? ""}
          onChange={(e) => onUpdate(row.localId, "team", e.target.value)}
          className="h-7 text-xs"
          placeholder="Team"
        />
      </td>
      <td className="p-1 w-32">
        <Input
          value={row.requestType ?? ""}
          onChange={(e) => onUpdate(row.localId, "requestType", e.target.value)}
          className="h-7 text-xs"
          placeholder="Request type"
        />
      </td>
      <td className="p-1 w-8">
        <button
          onClick={() => onDelete(row.localId)}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Tasking Cell Editor ──────────────────────────────────────────────────────

function TaskingCellEditor({
  cell,
  onChange,
}: {
  cell: TaskingCell;
  onChange: (updates: Partial<TaskingCell>) => void;
}) {
  const [customShift, setCustomShift] = useState(
    cell.shiftTime && !SHIFT_OPTIONS.slice(0, -1).includes(cell.shiftTime)
      ? cell.shiftTime
      : ""
  );
  const isCustom =
    cell.shiftTime != null &&
    cell.shiftTime !== "" &&
    !SHIFT_OPTIONS.slice(0, -1).includes(cell.shiftTime);

  return (
    <div className="flex flex-col gap-1 p-1 min-w-[120px]">
      <Select
        value={isCustom ? "Custom" : (cell.shiftTime ?? "")}
        onValueChange={(v) => {
          if (v === "Custom") {
            onChange({ shiftTime: customShift || "" });
          } else {
            onChange({ shiftTime: v === "" ? null : v });
          }
        }}
      >
        <SelectTrigger className="h-6 text-[11px] px-1.5">
          <SelectValue placeholder="Shift" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none-placeholder" disabled className="text-xs text-muted-foreground">Shift time</SelectItem>
          {SHIFT_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          value={customShift}
          onChange={(e) => {
            setCustomShift(e.target.value);
            onChange({ shiftTime: e.target.value });
          }}
          className="h-6 text-[11px] px-1.5"
          placeholder="Custom shift"
        />
      )}
      <Input
        value={cell.primaryTask ?? ""}
        onChange={(e) => onChange({ primaryTask: e.target.value || null })}
        className="h-6 text-[11px] px-1.5"
        placeholder="Primary task"
      />
      <Input
        value={cell.secondaryTask ?? ""}
        onChange={(e) => onChange({ secondaryTask: e.target.value || null })}
        className="h-6 text-[11px] px-1.5"
        placeholder="Secondary task"
      />
    </div>
  );
}

// ─── Supervisor Contact Row ───────────────────────────────────────────────────

function SortableContactRow({
  contact,
  users,
  onUpdate,
  onDelete,
}: {
  contact: SupervisorContact;
  users: { id: number; name: string; cin: string | null }[];
  onUpdate: (localId: string, field: keyof SupervisorContact, value: unknown) => void;
  onDelete: (localId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: contact.localId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-card border border-border/50 rounded-lg mb-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <Input
          value={contact.role}
          onChange={(e) => onUpdate(contact.localId, "role", e.target.value)}
          className="h-7 text-xs"
          placeholder="Role (e.g. Supervisor)"
        />
        <Select
          value={contact.userId != null ? String(contact.userId) : "custom"}
          onValueChange={(v) => {
            if (v === "custom") {
              onUpdate(contact.localId, "userId", null);
            } else {
              const u = users.find((u) => String(u.id) === v);
              onUpdate(contact.localId, "userId", Number(v));
              onUpdate(contact.localId, "customName", u?.name ?? null);
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom" className="text-xs">Custom / Manual</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                {u.name}{u.cin ? ` (${u.cin})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {contact.userId == null && (
          <Input
            value={contact.customName ?? ""}
            onChange={(e) => onUpdate(contact.localId, "customName", e.target.value || null)}
            className="h-7 text-xs"
            placeholder="Name"
          />
        )}
        <Input
          value={contact.phone ?? ""}
          onChange={(e) => onUpdate(contact.localId, "phone", e.target.value || null)}
          className="h-7 text-xs"
          placeholder="Phone"
        />
      </div>
      <button
        onClick={() => onDelete(contact.localId)}
        className="text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OperationManagerPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [activeTab, setActiveTab] = useState("priority");

  // ── Priority Board state ──────────────────────────────────────────────────
  const [priorityRows, setPriorityRows] = useState<PriorityRow[]>([]);
  const [priorityDirty, setPriorityDirty] = useState(false);

  const { data: priorityData, isLoading: priorityLoading } = trpc.opManager.getPriorityBoard.useQuery(
    { weekStart },
    { staleTime: 30_000 }
  );

  useEffect(() => {
    if (priorityData) {
      setPriorityRows(
        priorityData.map((r) => ({
          ...r,
          localId: String(r.id ?? Math.random()),
        }))
      );
      setPriorityDirty(false);
    } else if (!priorityLoading) {
      setPriorityRows([]);
    }
  }, [priorityData, priorityLoading]);

  const savePriorityMutation = trpc.opManager.savePriorityBoard.useMutation({
    onSuccess: () => {
      toast.success("Priority board saved");
      setPriorityDirty(false);
      utils.opManager.getPriorityBoard.invalidate({ weekStart });
    },
    onError: (e) => toast.error(e.message),
  });

  const addPriorityRow = () => {
    const newRow: PriorityRow = {
      localId: `new-${Date.now()}`,
      category: DEFAULT_CATEGORIES[0],
      priority: (priorityRows.length + 1),
      operationId: null,
      operationName: null,
      team: null,
      requestType: null,
      sortOrder: priorityRows.length,
    };
    setPriorityRows((prev) => [...prev, newRow]);
    setPriorityDirty(true);
  };

  const updatePriorityRow = useCallback(
    (localId: string, field: keyof PriorityRow, value: unknown) => {
      setPriorityRows((prev) =>
        prev.map((r) => (r.localId === localId ? { ...r, [field]: value } : r))
      );
      setPriorityDirty(true);
    },
    []
  );

  const deletePriorityRow = useCallback((localId: string) => {
    setPriorityRows((prev) => prev.filter((r) => r.localId !== localId));
    setPriorityDirty(true);
  }, []);

  const prioritySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handlePriorityDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPriorityRows((prev) => {
      const oldIdx = prev.findIndex((r) => r.localId === active.id);
      const newIdx = prev.findIndex((r) => r.localId === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((r, i) => ({ ...r, sortOrder: i }));
    });
    setPriorityDirty(true);
  };

  const savePriorityBoard = () => {
    savePriorityMutation.mutate({
      weekStart,
      rows: priorityRows.map((r, i) => ({
        id: r.id,
        category: r.category,
        priority: r.priority,
        operationId: r.operationId ?? null,
        operationName: r.operationName ?? null,
        team: r.team ?? null,
        requestType: r.requestType ?? null,
        sortOrder: i,
      })),
    });
  };

  // ── Inline operation creation ─────────────────────────────────────────────
  const [createOpDialog, setCreateOpDialog] = useState<{ open: boolean; name: string; localId: string }>({
    open: false, name: "", localId: "",
  });
  const createOpMutation = trpc.operation.create.useMutation({
    onSuccess: (data, vars) => {
      updatePriorityRow(createOpDialog.localId, "operationId", data.id);
      updatePriorityRow(createOpDialog.localId, "operationName", vars.name);
      utils.operation.list.invalidate();
      toast.success(`Operation "${vars.name}" created`);
      setCreateOpDialog({ open: false, name: "", localId: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Tasking Calendar state ────────────────────────────────────────────────
  const [taskingCells, setTaskingCells] = useState<Record<string, TaskingCell>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const { data: taskingData, isLoading: taskingLoading } = trpc.opManager.getTaskingCalendar.useQuery(
    { weekStart },
    { staleTime: 30_000 }
  );

  useEffect(() => {
    if (taskingData) {
      const map: Record<string, TaskingCell> = {};
      for (const cell of taskingData) {
        const key = `${cell.dayIndex}-${cell.teamRow}`;
        map[key] = {
          shiftTime: cell.shiftTime,
          primaryTask: cell.primaryTask,
          secondaryTask: cell.secondaryTask,
        };
      }
      setTaskingCells(map);
    }
  }, [taskingData]);

  const saveTaskingCellMutation = trpc.opManager.saveTaskingCell.useMutation({
    onSuccess: () => {
      utils.opManager.getTaskingCalendar.invalidate({ weekStart });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTaskingCell = useCallback(
    (dayIndex: number, teamRow: string, updates: Partial<TaskingCell>) => {
      const key = `${dayIndex}-${teamRow}`;
      setTaskingCells((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...updates },
      }));
      setSavingCell(key);
    },
    []
  );

  // Debounced save for tasking cells
  const pendingCellSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const scheduleTaskingCellSave = useCallback(
    (dayIndex: number, teamRow: string, cell: TaskingCell) => {
      const key = `${dayIndex}-${teamRow}`;
      const existing = pendingCellSaves.current.get(key);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        saveTaskingCellMutation.mutate({
          weekStart,
          dayIndex,
          teamRow,
          shiftTime: cell.shiftTime ?? null,
          primaryTask: cell.primaryTask ?? null,
          secondaryTask: cell.secondaryTask ?? null,
        });
        setSavingCell(null);
        pendingCellSaves.current.delete(key);
      }, 800);
      pendingCellSaves.current.set(key, t);
    },
    [weekStart, saveTaskingCellMutation]
  );

  const handleTaskingCellChange = useCallback(
    (dayIndex: number, teamRow: string, updates: Partial<TaskingCell>) => {
      const key = `${dayIndex}-${teamRow}`;
      setTaskingCells((prev) => {
        const updated = { ...prev[key], ...updates };
        scheduleTaskingCellSave(dayIndex, teamRow, updated);
        return { ...prev, [key]: updated };
      });
      setSavingCell(key);
    },
    [scheduleTaskingCellSave]
  );

  // ── Supervisor Contacts state ─────────────────────────────────────────────
  const [contacts, setContacts] = useState<SupervisorContact[]>([]);
  const [contactsDirty, setContactsDirty] = useState(false);

  const { data: contactsData, isLoading: contactsLoading } = trpc.opManager.getSupervisorContacts.useQuery(
    { weekStart },
    { staleTime: 30_000 }
  );

  useEffect(() => {
    if (contactsData) {
      setContacts(
        contactsData.map((c) => ({
          ...c,
          localId: String(c.id ?? Math.random()),
        }))
      );
      setContactsDirty(false);
    } else if (!contactsLoading) {
      setContacts([]);
    }
  }, [contactsData, contactsLoading]);

  const saveContactsMutation = trpc.opManager.saveSupervisorContacts.useMutation({
    onSuccess: () => {
      toast.success("Contacts saved");
      setContactsDirty(false);
      utils.opManager.getSupervisorContacts.invalidate({ weekStart });
    },
    onError: (e) => toast.error(e.message),
  });

  const addContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        localId: `new-${Date.now()}`,
        role: "Supervisor",
        userId: null,
        customName: null,
        phone: null,
        sortOrder: prev.length,
      },
    ]);
    setContactsDirty(true);
  };

  const updateContact = useCallback(
    (localId: string, field: keyof SupervisorContact, value: unknown) => {
      setContacts((prev) =>
        prev.map((c) => (c.localId === localId ? { ...c, [field]: value } : c))
      );
      setContactsDirty(true);
    },
    []
  );

  const deleteContact = useCallback((localId: string) => {
    setContacts((prev) => prev.filter((c) => c.localId !== localId));
    setContactsDirty(true);
  }, []);

  const contactSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleContactDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setContacts((prev) => {
      const oldIdx = prev.findIndex((c) => c.localId === active.id);
      const newIdx = prev.findIndex((c) => c.localId === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((c, i) => ({ ...c, sortOrder: i }));
    });
    setContactsDirty(true);
  };

  const saveContacts = () => {
    saveContactsMutation.mutate({
      weekStart,
      contacts: contacts.map((c, i) => ({
        id: c.id,
        role: c.role,
        userId: c.userId ?? null,
        customName: c.customName ?? null,
        phone: c.phone ?? null,
        sortOrder: i,
      })),
    });
  };

  // ── Operations list for autocomplete ─────────────────────────────────────
  const { data: operations } = trpc.operation.list.useQuery(undefined, { staleTime: 60_000 });
  const { data: usersData } = trpc.admin.listUsers.useQuery(undefined, { staleTime: 60_000 });

  const userList: { id: number; name: string; cin: string | null }[] = usersData ?? [];

  // ── Role guard ────────────────────────────────────────────────────────────
  if (user && user.role === "observer") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>You do not have access to Operation Manager.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50 shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-purple-600" />
          <h1 className="font-semibold text-sm">Operation Manager</h1>
        </div>
        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs font-medium text-muted-foreground min-w-[200px] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          >
            <ChevronRight size={14} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
          >
            This Week
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 pt-2 shrink-0 border-b border-border/30">
          <TabsList className="h-8">
            <TabsTrigger value="priority" className="text-xs h-7 px-3">
              <ClipboardList size={12} className="mr-1" /> Priority Board
            </TabsTrigger>
            <TabsTrigger value="tasking" className="text-xs h-7 px-3">
              <Calendar size={12} className="mr-1" /> Weekly Tasking
            </TabsTrigger>
            <TabsTrigger value="contacts" className="text-xs h-7 px-3">
              <User size={12} className="mr-1" /> Supervisor Contacts
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Priority Board ─────────────────────────────────────────────── */}
        <TabsContent value="priority" className="flex-1 overflow-auto m-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Priority Board</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addPriorityRow}>
                <Plus size={12} /> Add Row
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={savePriorityBoard}
                disabled={!priorityDirty || savePriorityMutation.isPending}
              >
                <Save size={12} /> {savePriorityMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {priorityLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-border/60 bg-muted/30">
                    <th className="p-1 w-8"></th>
                    <th className="p-1 w-8 text-center text-muted-foreground">#</th>
                    <th className="p-1 text-left font-medium">Category</th>
                    <th className="p-1 text-left font-medium w-16">Priority</th>
                    <th className="p-1 text-left font-medium">Operation</th>
                    <th className="p-1 text-left font-medium w-28">Team</th>
                    <th className="p-1 text-left font-medium w-32">Request Type</th>
                    <th className="p-1 w-8"></th>
                  </tr>
                </thead>
                <DndContext
                  sensors={prioritySensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePriorityDragEnd}
                >
                  <SortableContext
                    items={priorityRows.map((r) => r.localId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {priorityRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-muted-foreground">
                            No rows yet. Click "Add Row" to start.
                          </td>
                        </tr>
                      ) : (
                        priorityRows.map((row, idx) => (
                          <SortablePriorityRow
                            key={row.localId}
                            row={row}
                            index={idx}
                            operations={operations ?? []}
                            onUpdate={updatePriorityRow}
                            onDelete={deletePriorityRow}
                            onCreateOp={(name, localId) =>
                              setCreateOpDialog({ open: true, name, localId })
                            }
                          />
                        ))
                      )}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Weekly Tasking Calendar ────────────────────────────────────── */}
        <TabsContent value="tasking" className="flex-1 overflow-auto m-0 p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Weekly Tasking Calendar</h2>
          {taskingLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full min-w-[900px]">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="border border-border/40 p-2 text-left font-medium w-28 sticky left-0 bg-muted/30 z-10">
                      Team
                    </th>
                    {DAY_LABELS.map((day, i) => (
                      <th
                        key={day}
                        className="border border-border/40 p-2 text-center font-medium"
                      >
                        <span className="block">{day}</span>
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          {(() => {
                            const d = new Date(weekStart + "T00:00:00+08:00");
                            d.setDate(d.getDate() + i);
                            return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
                          })()}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEAM_ROWS.map((teamRow) => (
                    <tr key={teamRow} className="hover:bg-muted/10 transition-colors">
                      <td className="border border-border/40 p-2 font-medium text-xs sticky left-0 bg-card z-10 whitespace-nowrap">
                        {teamRow}
                      </td>
                      {DAY_LABELS.map((_, dayIndex) => {
                        const key = `${dayIndex}-${teamRow}`;
                        const cell = taskingCells[key] ?? {};
                        return (
                          <td
                            key={dayIndex}
                            className="border border-border/40 align-top p-0"
                          >
                            <TaskingCellEditor
                              cell={cell}
                              onChange={(updates) =>
                                handleTaskingCellChange(dayIndex, teamRow, updates)
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">
                Changes are auto-saved after a short delay.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Supervisor Contacts ────────────────────────────────────────── */}
        <TabsContent value="contacts" className="flex-1 overflow-auto m-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Supervisor Contacts</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addContact}>
                <Plus size={12} /> Add Contact
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={saveContacts}
                disabled={!contactsDirty || saveContactsMutation.isPending}
              >
                <Save size={12} /> {saveContactsMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {contactsLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="max-w-xl">
              <DndContext
                sensors={contactSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleContactDragEnd}
              >
                <SortableContext
                  items={contacts.map((c) => c.localId)}
                  strategy={verticalListSortingStrategy}
                >
                  {contacts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No contacts yet. Click "Add Contact" to start.
                    </div>
                  ) : (
                    contacts.map((contact) => (
                      <SortableContactRow
                        key={contact.localId}
                        contact={contact}
                        users={userList}
                        onUpdate={updateContact}
                        onDelete={deleteContact}
                      />
                    ))
                  )}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Inline Create Operation Dialog */}
      <Dialog
        open={createOpDialog.open}
        onOpenChange={(open) => !open && setCreateOpDialog({ open: false, name: "", localId: "" })}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Create New Operation</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-muted-foreground mb-1 block">Operation Name</label>
            <Input
              value={createOpDialog.name}
              onChange={(e) => setCreateOpDialog((prev) => ({ ...prev, name: e.target.value }))}
              className="h-8 text-sm"
              placeholder="Enter operation name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && createOpDialog.name.trim()) {
                  createOpMutation.mutate({ name: createOpDialog.name.trim() });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpDialog({ open: false, name: "", localId: "" })}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => {
                if (createOpDialog.name.trim()) {
                  createOpMutation.mutate({ name: createOpDialog.name.trim() });
                }
              }}
              disabled={!createOpDialog.name.trim() || createOpMutation.isPending}
            >
              {createOpMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
