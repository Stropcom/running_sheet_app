import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  Eye,
  Edit2,
  Printer,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = ["A-TACC", "WC", "Other"];
const REQUEST_TYPE_OPTIONS = ["Surv", "PTT", "Capability"];
const ROLE_OPTIONS = ["CTO Inspector", "Surveillance Team 1", "Surveillance Team 2", "PTT"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TEAM_ROWS = ["Surveillance 1", "Surveillance 2", "PTT", "Cap. Support"];
const SHIFT_OPTIONS = [
  "RDO",
  "0600–1400",
  "0700–1500",
  "1400–2200",
  "1000–1800",
  "Custom Time",
];

// Sentinel values for operation dropdown
const OP_OTHER = "__OTHER__";
const OP_TRAINING = "__TRAINING__";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const perthOffset = 8 * 60;
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const perthMs = utcMs + perthOffset * 60000;
  const perth = new Date(perthMs);
  const day = perth.getDay();
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

function getDayDate(weekStart: string, dayIndex: number): string {
  const d = new Date(weekStart + "T00:00:00+08:00");
  d.setDate(d.getDate() + dayIndex);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriorityRow {
  id?: number;
  localId: string;
  category: string;
  priority: number;
  operationId?: number | null;
  operationName?: string | null;
  team?: string | null;
  requestType?: string | null; // comma-separated e.g. "Surv,PTT"
  sortOrder: number;
}

interface TaskingCell {
  shiftTime?: string | null;
  primaryTask?: string | null;      // operation name or sentinel
  primaryTaskFree?: string | null;  // free text when Other
  secondaryTask?: string | null;
  secondaryTaskFree?: string | null;
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

interface OnCallEntry {
  id?: number;
  localId: string;
  dayScope: string; // "week" | "Mon" | "Tue" | ...
  userId?: number | null;
  customName?: string | null;
  mobile?: string | null;
  isOnCall: boolean;
  sortOrder: number;
}

// ─── Multi-select Request Type ────────────────────────────────────────────────

function RequestTypeMultiSelect({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  function toggle(opt: string) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next.join(","));
  }

  return (
    <div className="flex flex-col gap-0.5">
      {REQUEST_TYPE_OPTIONS.map((opt) => (
        <label key={opt} className="flex items-center gap-1 cursor-pointer text-[11px]">
          <Checkbox
            checked={selected.includes(opt)}
            onCheckedChange={() => toggle(opt)}
            className="h-3 w-3"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

// ─── Operation Dropdown ───────────────────────────────────────────────────────

function OperationDropdown({
  value,
  valueName,
  operations,
  onSelect,
  onCreateOp,
  placeholder,
  includeSpecial, // include Other / Training at top
}: {
  value?: number | null;
  valueName?: string | null;
  operations: { id: number; name: string }[];
  onSelect: (id: number | null, name: string | null) => void;
  onCreateOp?: (name: string) => void;
  placeholder?: string;
  includeSpecial?: boolean;
}) {
  const [search, setSearch] = useState(valueName ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(valueName ?? "");
  }, [valueName]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = operations.filter((op) =>
    op.name.toLowerCase().includes(search.toLowerCase())
  );

  const displayValue =
    value === null && valueName === "Other" ? "Other" :
    value === null && valueName === "Training" ? "Training" :
    valueName ?? "";

  return (
    <div className="relative" ref={ref}>
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="h-7 text-[11px] px-1.5"
        placeholder={placeholder ?? "Select operation…"}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-md max-h-48 overflow-y-auto min-w-[180px]">
          {includeSpecial && (
            <>
              <button
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground font-medium text-amber-600"
                onMouseDown={() => {
                  onSelect(null, "Training");
                  setSearch("Training");
                  setOpen(false);
                }}
              >
                📋 Training
              </button>
              <button
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground"
                onMouseDown={() => {
                  onSelect(null, "Other");
                  setSearch("Other");
                  setOpen(false);
                }}
              >
                ✏️ Other (free text)
              </button>
              <div className="border-t border-border/40 my-0.5" />
            </>
          )}
          {filtered.map((op) => (
            <button
              key={op.id}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
              onMouseDown={() => {
                onSelect(op.id, op.name);
                setSearch(op.name);
                setOpen(false);
              }}
            >
              {op.name}
            </button>
          ))}
          {filtered.length === 0 && search.trim() && onCreateOp && (
            <button
              className="w-full text-left px-2 py-1.5 text-xs text-blue-500 hover:bg-accent flex items-center gap-1"
              onMouseDown={() => {
                onCreateOp(search.trim());
                setOpen(false);
              }}
            >
              <Plus size={11} /> Create "{search.trim()}"
            </button>
          )}
          {filtered.length === 0 && search.trim() && !onCreateOp && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No match</div>
          )}
        </div>
      )}
    </div>
  );
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

      {/* Category dropdown */}
      <td className="p-1 w-28">
        <Select
          value={row.category}
          onValueChange={(v) => onUpdate(row.localId, "category", v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Priority */}
      <td className="p-1 w-16">
        <Input
          type="number"
          min={1}
          value={row.priority}
          onChange={(e) => onUpdate(row.localId, "priority", parseInt(e.target.value) || 1)}
          className="h-7 text-xs text-center"
        />
      </td>

      {/* Operation dropdown with Add Op */}
      <td className="p-1 min-w-[160px]">
        <OperationDropdown
          value={row.operationId}
          valueName={row.operationName}
          operations={operations}
          onSelect={(id, name) => {
            onUpdate(row.localId, "operationId", id);
            onUpdate(row.localId, "operationName", name);
          }}
          onCreateOp={(name) => onCreateOp(name, row.localId)}
          placeholder="Search or add op…"
        />
      </td>

      {/* Team */}
      <td className="p-1 w-28">
        <Input
          value={row.team ?? ""}
          onChange={(e) => onUpdate(row.localId, "team", e.target.value)}
          className="h-7 text-xs"
          placeholder="Team"
        />
      </td>

      {/* Request type multi-select */}
      <td className="p-1 w-32">
        <RequestTypeMultiSelect
          value={row.requestType}
          onChange={(v) => onUpdate(row.localId, "requestType", v)}
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
  operations,
  onChange,
}: {
  cell: TaskingCell;
  operations: { id: number; name: string }[];
  onChange: (updates: Partial<TaskingCell>) => void;
}) {
  const isCustom =
    cell.shiftTime != null &&
    cell.shiftTime !== "" &&
    !SHIFT_OPTIONS.slice(0, -1).includes(cell.shiftTime);

  const shiftSelectValue = isCustom ? "Custom Time" : (cell.shiftTime ?? "");

  return (
    <div className="flex flex-col gap-1 p-1 min-w-[140px]">
      {/* Shift */}
      <Select
        value={shiftSelectValue}
        onValueChange={(v) => {
          if (v === "Custom Time") {
            onChange({ shiftTime: "" });
          } else {
            onChange({ shiftTime: v === "" ? null : v });
          }
        }}
      >
        <SelectTrigger className="h-6 text-[11px] px-1.5">
          <SelectValue placeholder="Shift" />
        </SelectTrigger>
        <SelectContent>
          {SHIFT_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom time input — shown when Custom Time is selected */}
      {(shiftSelectValue === "Custom Time" || isCustom) && (
        <Input
          value={isCustom ? (cell.shiftTime ?? "") : ""}
          onChange={(e) => onChange({ shiftTime: e.target.value || null })}
          className="h-6 text-[11px] px-1.5"
          placeholder="e.g. 0800–1600"
          autoFocus={shiftSelectValue === "Custom Time" && !isCustom}
        />
      )}

      {/* Primary task */}
      <OperationDropdown
        value={null}
        valueName={cell.primaryTask}
        operations={operations}
        onSelect={(_, name) => {
          onChange({
            primaryTask: name,
            primaryTaskFree: name === "Other" ? (cell.primaryTaskFree ?? "") : null,
          });
        }}
        placeholder="Primary task…"
        includeSpecial
      />
      {cell.primaryTask === "Other" && (
        <Input
          value={cell.primaryTaskFree ?? ""}
          onChange={(e) => onChange({ primaryTaskFree: e.target.value || null })}
          className="h-6 text-[11px] px-1.5"
          placeholder="Describe task…"
        />
      )}

      {/* Secondary task */}
      <OperationDropdown
        value={null}
        valueName={cell.secondaryTask}
        operations={operations}
        onSelect={(_, name) => {
          onChange({
            secondaryTask: name,
            secondaryTaskFree: name === "Other" ? (cell.secondaryTaskFree ?? "") : null,
          });
        }}
        placeholder="Secondary task…"
        includeSpecial
      />
      {cell.secondaryTask === "Other" && (
        <Input
          value={cell.secondaryTaskFree ?? ""}
          onChange={(e) => onChange({ secondaryTaskFree: e.target.value || null })}
          className="h-6 text-[11px] px-1.5"
          placeholder="Describe task…"
        />
      )}
    </div>
  );
}

// ─── Sortable Contact Row ─────────────────────────────────────────────────────

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
      className="flex items-start gap-2 p-2 bg-card border border-border/50 rounded-lg mb-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none mt-1.5"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 grid grid-cols-3 gap-2">
        {/* Role dropdown */}
        <Select
          value={contact.role}
          onValueChange={(v) => onUpdate(contact.localId, "role", v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Name dropdown from users */}
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
            <SelectItem value="custom" className="text-xs italic text-muted-foreground">Custom name</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                {u.name}{u.cin ? ` (${u.cin})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Phone free text */}
        <Input
          value={contact.phone ?? ""}
          onChange={(e) => onUpdate(contact.localId, "phone", e.target.value || null)}
          className="h-7 text-xs"
          placeholder="Phone"
        />

        {/* Custom name field when not linked to a user */}
        {contact.userId == null && (
          <Input
            value={contact.customName ?? ""}
            onChange={(e) => onUpdate(contact.localId, "customName", e.target.value || null)}
            className="h-7 text-xs col-span-2"
            placeholder="Custom name"
          />
        )}
      </div>
      <button
        onClick={() => onDelete(contact.localId)}
        className="text-muted-foreground hover:text-destructive transition-colors mt-1.5"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── On-Call Entry Row ────────────────────────────────────────────────────────

function OnCallEntryRow({
  entry,
  users,
  onUpdate,
  onDelete,
}: {
  entry: OnCallEntry;
  users: { id: number; name: string; cin: string | null }[];
  onUpdate: (localId: string, field: keyof OnCallEntry, value: unknown) => void;
  onDelete: (localId: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 p-2 bg-card border border-border/50 rounded-lg mb-2">
      <div className="flex-1 grid grid-cols-4 gap-2">
        {/* Day scope */}
        <Select
          value={entry.dayScope}
          onValueChange={(v) => onUpdate(entry.localId, "dayScope", v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week" className="text-xs font-medium">Full Week</SelectItem>
            {DAY_LABELS.map((d) => (
              <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Name dropdown */}
        <Select
          value={entry.userId != null ? String(entry.userId) : "custom"}
          onValueChange={(v) => {
            if (v === "custom") {
              onUpdate(entry.localId, "userId", null);
            } else {
              const u = users.find((u) => String(u.id) === v);
              onUpdate(entry.localId, "userId", Number(v));
              onUpdate(entry.localId, "customName", u?.name ?? null);
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom" className="text-xs italic text-muted-foreground">Custom name</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                {u.name}{u.cin ? ` (${u.cin})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Custom name */}
        {entry.userId == null && (
          <Input
            value={entry.customName ?? ""}
            onChange={(e) => onUpdate(entry.localId, "customName", e.target.value || null)}
            className="h-7 text-xs"
            placeholder="Name"
          />
        )}

        {/* Mobile free text */}
        <Input
          value={entry.mobile ?? ""}
          onChange={(e) => onUpdate(entry.localId, "mobile", e.target.value || null)}
          className="h-7 text-xs"
          placeholder="Mobile"
        />

        {/* On-call toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer text-xs col-span-1">
          <Checkbox
            checked={entry.isOnCall}
            onCheckedChange={(v) => onUpdate(entry.localId, "isOnCall", !!v)}
            className="h-3.5 w-3.5"
          />
          On-call
        </label>
      </div>
      <button
        onClick={() => onDelete(entry.localId)}
        className="text-muted-foreground hover:text-destructive transition-colors mt-1.5"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── CTO Tasking Week View ────────────────────────────────────────────────────

function CTOTaskingWeekView({
  weekStart,
  priorityRows,
  taskingCells,
  contacts,
  onCallEntries,
  onEdit,
}: {
  weekStart: string;
  priorityRows: PriorityRow[];
  taskingCells: Record<string, TaskingCell>;
  contacts: SupervisorContact[];
  onCallEntries: OnCallEntry[];
  onEdit: () => void;
}) {
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">CTO Tasking Week</h2>
          <p className="text-sm text-muted-foreground">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={onEdit}>
            <Edit2 size={13} /> Edit
          </Button>
        </div>
      </div>

      {/* Supervisor Contacts */}
      {contacts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 border-b border-border/40 pb-1">Supervisor Contacts</h3>
          <div className="grid grid-cols-2 gap-2">
            {contacts.map((c) => (
              <div key={c.localId} className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                <User size={12} className="text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{c.role}:</span>
                <span>{c.customName ?? "—"}</span>
                {c.phone && (
                  <span className="flex items-center gap-0.5 text-muted-foreground ml-auto">
                    <Phone size={10} /> {c.phone}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-Call */}
      {onCallEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 border-b border-border/40 pb-1">On-Call Supervisor</h3>
          <div className="grid grid-cols-2 gap-2">
            {onCallEntries.map((e) => (
              <div key={e.localId} className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                  {e.dayScope === "week" ? "Full Week" : e.dayScope}
                </Badge>
                {e.isOnCall && <Badge className="text-[10px] px-1 py-0 bg-amber-500/20 text-amber-600 border-amber-500/30 shrink-0">On-Call</Badge>}
                <span>{e.customName ?? "—"}</span>
                {e.mobile && (
                  <span className="flex items-center gap-0.5 text-muted-foreground ml-auto">
                    <Phone size={10} /> {e.mobile}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority Board */}
      {priorityRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 border-b border-border/40 pb-1">Priority Board</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60">
                <th className="p-1.5 text-left font-medium w-8">#</th>
                <th className="p-1.5 text-left font-medium">Category</th>
                <th className="p-1.5 text-left font-medium">Pri</th>
                <th className="p-1.5 text-left font-medium">Operation</th>
                <th className="p-1.5 text-left font-medium">Team</th>
                <th className="p-1.5 text-left font-medium">Request</th>
              </tr>
            </thead>
            <tbody>
              {priorityRows.map((row, idx) => (
                <tr key={row.localId} className="border-b border-border/30">
                  <td className="p-1.5 text-muted-foreground">{idx + 1}</td>
                  <td className="p-1.5 font-medium">{row.category}</td>
                  <td className="p-1.5">{row.priority}</td>
                  <td className="p-1.5">{row.operationName ?? "—"}</td>
                  <td className="p-1.5">{row.team ?? "—"}</td>
                  <td className="p-1.5">
                    {row.requestType ? (
                      <div className="flex flex-wrap gap-0.5">
                        {row.requestType.split(",").map((rt) => (
                          <Badge key={rt} variant="outline" className="text-[10px] px-1 py-0">{rt.trim()}</Badge>
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Weekly Tasking Calendar */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2 border-b border-border/40 pb-1">Weekly Tasking Calendar</h3>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full min-w-[700px]">
            <thead>
              <tr className="bg-muted/40">
                <th className="border border-border/40 p-1.5 text-left font-medium w-24">Team</th>
                {DAY_LABELS.map((day, i) => (
                  <th key={day} className="border border-border/40 p-1.5 text-center font-medium">
                    <span className="block">{day}</span>
                    <span className="block text-[10px] text-muted-foreground font-normal">{getDayDate(weekStart, i)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEAM_ROWS.map((teamRow) => (
                <tr key={teamRow}>
                  <td className="border border-border/40 p-1.5 font-medium whitespace-nowrap bg-muted/20">{teamRow}</td>
                  {DAY_LABELS.map((_, dayIndex) => {
                    const key = `${dayIndex}-${teamRow}`;
                    const cell = taskingCells[key] ?? {};
                    const primaryDisplay = cell.primaryTask === "Other" ? (cell.primaryTaskFree || "Other") : cell.primaryTask;
                    const secondaryDisplay = cell.secondaryTask === "Other" ? (cell.secondaryTaskFree || "Other") : cell.secondaryTask;
                    return (
                      <td key={dayIndex} className="border border-border/40 p-1.5 align-top">
                        {cell.shiftTime && (
                          <div className="font-medium text-purple-600 text-[10px] mb-0.5">{cell.shiftTime}</div>
                        )}
                        {primaryDisplay && <div className="text-[11px]">{primaryDisplay}</div>}
                        {secondaryDisplay && (
                          <div className="text-[10px] text-muted-foreground">{secondaryDisplay}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OperationManagerPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [activeTab, setActiveTab] = useState("priority");
  const [viewMode, setViewMode] = useState<"edit" | "view">("edit");

  // ── Operations & Users ────────────────────────────────────────────────────
  const { data: operations } = trpc.operation.list.useQuery(undefined, { staleTime: 60_000 });
  const { data: usersData } = trpc.opManager.listUsers.useQuery(undefined, { staleTime: 60_000 });
  const userList: { id: number; name: string; cin: string | null }[] = usersData ?? [];

  // ── Priority Board ────────────────────────────────────────────────────────
  const [priorityRows, setPriorityRows] = useState<PriorityRow[]>([]);
  const [priorityDirty, setPriorityDirty] = useState(false);

  const { data: priorityData, isLoading: priorityLoading } = trpc.opManager.getPriorityBoard.useQuery(
    { weekStart }, { staleTime: 30_000 }
  );

  useEffect(() => {
    if (priorityData) {
      setPriorityRows(priorityData.map((r) => ({ ...r, localId: String(r.id ?? Math.random()) })));
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
    setPriorityRows((prev) => [
      ...prev,
      {
        localId: `new-${Date.now()}`,
        category: CATEGORY_OPTIONS[0],
        priority: prev.length + 1,
        operationId: null,
        operationName: null,
        team: null,
        requestType: null,
        sortOrder: prev.length,
      },
    ]);
    setPriorityDirty(true);
  };

  const updatePriorityRow = useCallback((localId: string, field: keyof PriorityRow, value: unknown) => {
    setPriorityRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, [field]: value } : r)));
    setPriorityDirty(true);
  }, []);

  const deletePriorityRow = useCallback((localId: string) => {
    setPriorityRows((prev) => prev.filter((r) => r.localId !== localId));
    setPriorityDirty(true);
  }, []);

  const prioritySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }));

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

  // ── Tasking Calendar ──────────────────────────────────────────────────────
  const [taskingCells, setTaskingCells] = useState<Record<string, TaskingCell>>({});

  const { data: taskingData, isLoading: taskingLoading } = trpc.opManager.getTaskingCalendar.useQuery(
    { weekStart }, { staleTime: 30_000 }
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
    onError: (e) => toast.error(e.message),
  });

  const pendingCellSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleTaskingCellChange = useCallback(
    (dayIndex: number, teamRow: string, updates: Partial<TaskingCell>) => {
      const key = `${dayIndex}-${teamRow}`;
      setTaskingCells((prev) => {
        const updated = { ...prev[key], ...updates };
        // Debounce save
        const existing = pendingCellSaves.current.get(key);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          saveTaskingCellMutation.mutate({
            weekStart,
            dayIndex,
            teamRow,
            shiftTime: updated.shiftTime ?? null,
            primaryTask: updated.primaryTask === "Other"
              ? (updated.primaryTaskFree ? `Other: ${updated.primaryTaskFree}` : "Other")
              : (updated.primaryTask ?? null),
            secondaryTask: updated.secondaryTask === "Other"
              ? (updated.secondaryTaskFree ? `Other: ${updated.secondaryTaskFree}` : "Other")
              : (updated.secondaryTask ?? null),
          });
          pendingCellSaves.current.delete(key);
        }, 800);
        pendingCellSaves.current.set(key, t);
        return { ...prev, [key]: updated };
      });
    },
    [weekStart, saveTaskingCellMutation]
  );

  // ── Supervisor Contacts ───────────────────────────────────────────────────
  const [contacts, setContacts] = useState<SupervisorContact[]>([]);
  const [contactsDirty, setContactsDirty] = useState(false);

  const { data: contactsData, isLoading: contactsLoading } = trpc.opManager.getSupervisorContacts.useQuery(
    { weekStart }, { staleTime: 30_000 }
  );

  useEffect(() => {
    if (contactsData) {
      setContacts(contactsData.map((c) => ({ ...c, localId: String(c.id ?? Math.random()) })));
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
      { localId: `new-${Date.now()}`, role: ROLE_OPTIONS[0], userId: null, customName: null, phone: null, sortOrder: prev.length },
    ]);
    setContactsDirty(true);
  };

  const updateContact = useCallback((localId: string, field: keyof SupervisorContact, value: unknown) => {
    setContacts((prev) => prev.map((c) => (c.localId === localId ? { ...c, [field]: value } : c)));
    setContactsDirty(true);
  }, []);

  const deleteContact = useCallback((localId: string) => {
    setContacts((prev) => prev.filter((c) => c.localId !== localId));
    setContactsDirty(true);
  }, []);

  const contactSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }));

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

  // ── On-Call Supervisor (local state, stored via contacts with special role) ─
  const [onCallEntries, setOnCallEntries] = useState<OnCallEntry[]>([]);
  const [onCallDirty, setOnCallDirty] = useState(false);

  // Load on-call from contacts data (role starts with "On-Call:")
  useEffect(() => {
    if (contactsData) {
      const onCallRows = contactsData
        .filter((c) => c.role.startsWith("On-Call:"))
        .map((c) => {
          const dayScope = c.role.replace("On-Call:", "").trim() || "week";
          const isOnCall = (c.phone ?? "").startsWith("on-call:");
          const mobile = isOnCall ? (c.phone ?? "").replace("on-call:", "") : (c.phone ?? "");
          return {
            id: c.id,
            localId: String(c.id ?? Math.random()),
            dayScope,
            userId: c.userId ?? null,
            customName: c.customName ?? null,
            mobile: mobile || null,
            isOnCall,
            sortOrder: c.sortOrder,
          };
        });
      setOnCallEntries(onCallRows);
      setOnCallDirty(false);
    }
  }, [contactsData]);

  const addOnCallEntry = () => {
    setOnCallEntries((prev) => [
      ...prev,
      { localId: `oncall-${Date.now()}`, dayScope: "week", userId: null, customName: null, mobile: null, isOnCall: true, sortOrder: prev.length },
    ]);
    setOnCallDirty(true);
  };

  const updateOnCallEntry = useCallback((localId: string, field: keyof OnCallEntry, value: unknown) => {
    setOnCallEntries((prev) => prev.map((e) => (e.localId === localId ? { ...e, [field]: value } : e)));
    setOnCallDirty(true);
  }, []);

  const deleteOnCallEntry = useCallback((localId: string) => {
    setOnCallEntries((prev) => prev.filter((e) => e.localId !== localId));
    setOnCallDirty(true);
  }, []);

  const saveOnCall = () => {
    // Save on-call entries as supervisor contacts with special role encoding
    const regularContacts = contacts.filter((c) => !c.role.startsWith("On-Call:"));
    const onCallAsContacts = onCallEntries.map((e, i) => ({
      id: e.id,
      role: `On-Call:${e.dayScope}`,
      userId: e.userId ?? null,
      customName: e.customName ?? null,
      phone: e.isOnCall ? `on-call:${e.mobile ?? ""}` : (e.mobile ?? null),
      sortOrder: regularContacts.length + i,
    }));
    saveContactsMutation.mutate({
      weekStart,
      contacts: [
        ...regularContacts.map((c, i) => ({
          id: c.id,
          role: c.role,
          userId: c.userId ?? null,
          customName: c.customName ?? null,
          phone: c.phone ?? null,
          sortOrder: i,
        })),
        ...onCallAsContacts,
      ],
    });
    setOnCallDirty(false);
  };

  // ── Role guard ────────────────────────────────────────────────────────────
  if (user && user.role === "observer") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-8">
        <p>You do not have access to Operation Manager.</p>
      </div>
    );
  }

  // ── View mode ─────────────────────────────────────────────────────────────
  if (viewMode === "view") {
    return (
      <div className="flex flex-col h-full overflow-auto">
        {/* Week navigation bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50 shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-purple-600" />
            <h1 className="font-semibold text-sm">Operation Manager</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-xs font-medium text-muted-foreground min-w-[200px] text-center">{formatWeekRange(weekStart)}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setWeekStart(getMondayOfWeek(new Date()))}>
              This Week
            </Button>
          </div>
        </div>
        <CTOTaskingWeekView
          weekStart={weekStart}
          priorityRows={priorityRows}
          taskingCells={taskingCells}
          contacts={contacts.filter((c) => !c.role.startsWith("On-Call:"))}
          onCallEntries={onCallEntries}
          onEdit={() => setViewMode("edit")}
        />
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
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs font-medium text-muted-foreground min-w-[200px] text-center">{formatWeekRange(weekStart)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setWeekStart(getMondayOfWeek(new Date()))}>
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
            onClick={() => setViewMode("view")}
          >
            <Eye size={12} /> Full View
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
            <TabsTrigger value="oncall" className="text-xs h-7 px-3">
              <Phone size={12} className="mr-1" /> On-Call Supervisor
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
                    <th className="p-1 text-left font-medium w-28">Category</th>
                    <th className="p-1 text-left font-medium w-16">Priority</th>
                    <th className="p-1 text-left font-medium">Operation</th>
                    <th className="p-1 text-left font-medium w-28">Team</th>
                    <th className="p-1 text-left font-medium w-32">Request Type</th>
                    <th className="p-1 w-8"></th>
                  </tr>
                </thead>
                <DndContext sensors={prioritySensors} collisionDetection={closestCenter} onDragEnd={handlePriorityDragEnd}>
                  <SortableContext items={priorityRows.map((r) => r.localId)} strategy={verticalListSortingStrategy}>
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
                            onCreateOp={(name, localId) => setCreateOpDialog({ open: true, name, localId })}
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
          <p className="text-[11px] text-muted-foreground mb-3">Changes auto-save after a short delay.</p>
          {taskingLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full min-w-[1000px]">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="border border-border/40 p-2 text-left font-medium w-28 sticky left-0 bg-muted/30 z-10">Team</th>
                    {DAY_LABELS.map((day, i) => (
                      <th key={day} className="border border-border/40 p-2 text-center font-medium">
                        <span className="block">{day}</span>
                        <span className="block text-[10px] text-muted-foreground font-normal">{getDayDate(weekStart, i)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEAM_ROWS.map((teamRow) => (
                    <tr key={teamRow} className="hover:bg-muted/10 transition-colors">
                      <td className="border border-border/40 p-2 font-medium text-xs sticky left-0 bg-card z-10 whitespace-nowrap">{teamRow}</td>
                      {DAY_LABELS.map((_, dayIndex) => {
                        const key = `${dayIndex}-${teamRow}`;
                        const cell = taskingCells[key] ?? {};
                        return (
                          <td key={dayIndex} className="border border-border/40 align-top p-0">
                            <TaskingCellEditor
                              cell={cell}
                              operations={operations ?? []}
                              onChange={(updates) => handleTaskingCellChange(dayIndex, teamRow, updates)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <p className="text-[11px] text-muted-foreground mb-3">
            Role, name (from user list), and phone number for each supervisor contact.
          </p>
          {contactsLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="max-w-2xl">
              <DndContext sensors={contactSensors} collisionDetection={closestCenter} onDragEnd={handleContactDragEnd}>
                <SortableContext items={contacts.filter((c) => !c.role.startsWith("On-Call:")).map((c) => c.localId)} strategy={verticalListSortingStrategy}>
                  {contacts.filter((c) => !c.role.startsWith("On-Call:")).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No contacts yet. Click "Add Contact" to start.
                    </div>
                  ) : (
                    contacts
                      .filter((c) => !c.role.startsWith("On-Call:"))
                      .map((contact) => (
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

        {/* ── On-Call Supervisor ─────────────────────────────────────────── */}
        <TabsContent value="oncall" className="flex-1 overflow-auto m-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">On-Call Supervisor</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addOnCallEntry}>
                <Plus size={12} /> Add Entry
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={saveOnCall}
                disabled={!onCallDirty || saveContactsMutation.isPending}
              >
                <Save size={12} /> {saveContactsMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Select a day (or Full Week), choose the supervisor from the user list, enter their mobile, and mark if they are on-call.
          </p>
          {contactsLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="max-w-2xl">
              {onCallEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  No on-call entries yet. Click "Add Entry" to start.
                </div>
              ) : (
                onCallEntries.map((entry) => (
                  <OnCallEntryRow
                    key={entry.localId}
                    entry={entry}
                    users={userList}
                    onUpdate={updateOnCallEntry}
                    onDelete={deleteOnCallEntry}
                  />
                ))
              )}
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
            <Button variant="ghost" size="sm" onClick={() => setCreateOpDialog({ open: false, name: "", localId: "" })}>
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
