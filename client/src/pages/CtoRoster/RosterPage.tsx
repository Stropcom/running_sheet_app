import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/useMobile";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckSquare2,
  Star,
  CalendarDays,
  Copy,
  ClipboardPaste,
  Scissors,
  Repeat,
} from "lucide-react";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
  ON_DUTY_CODES,
  ON_CALL_CODES,
  ROSTER_START,
  ROSTER_END,
} from "@shared/ctoRosterShiftUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, eachDayOfInterval, parseISO, isValid } from "date-fns";

// Safe format helper — never throws on invalid dates
function safeFormat(
  d: Date | string | null | undefined,
  fmt: string,
  fallback = ""
): string {
  if (!d) return fallback;
  try {
    const dt = typeof d === "string" ? parseISO(d) : d;
    if (!isValid(dt)) return fallback;
    return format(dt, fmt);
  } catch {
    return fallback;
  }
}

// Custom DnD sensors that refuse to activate when the touch/pointer starts on
// an element with data-no-dnd="true" (shift cells). This prevents the
// TouchSensor from intercepting normal taps on iOS.
function shouldHandleEvent(element: EventTarget | null): boolean {
  let cur = element as HTMLElement | null;
  while (cur) {
    if (cur.dataset?.noDnd === "true") return false;
    cur = cur.parentElement;
  }
  return true;
}
class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) =>
        shouldHandleEvent(nativeEvent.target),
    },
  ];
}
class SmartTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: ({ nativeEvent }: { nativeEvent: TouchEvent }) =>
        shouldHandleEvent(nativeEvent.target),
    },
  ];
}

type ShiftCode =
  | ""
  | "d"
  | "a"
  | "r"
  | "o"
  | "l"
  | "c"
  | "tt"
  | "dep"
  | "doc"
  | "adoc"
  | "ad"
  | "aoc";
type Member = { id: number; name: string; teamId: number; sortOrder: number };
type Team = { id: number; name: string; sortOrder: number };
type RepeatCycleResult = {
  cycleStart: string;
  cycleEnd: string;
  cycleLengthDays: number;
  daysFilledForSource: number;
  membersUpdated: number;
};
type ShiftData = {
  memberId: number;
  shiftDate: string;
  shiftCode: string;
  shiftTime?: string | null;
  comment?: string | null;
  isActing?: boolean;
};

const MONTHS = [
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
];

const ROSTER_START_DATE = parseISO(ROSTER_START);
const ROSTER_END_DATE = parseISO(ROSTER_END);
const ALL_DATES = eachDayOfInterval({
  start: ROSTER_START_DATE,
  end: ROSTER_END_DATE,
});
const TOTAL_DAYS = ALL_DATES.length;
const COL_WIDTH = 68; // px per date column
const NAME_COL_WIDTH = 152; // px for frozen name column
const ROW_HEIGHT = 48; // px per member row
const HEADER_HEIGHT = 44; // px for the frozen date header row

// ── Shift edit popup (Dialog on desktop, Sheet on mobile) ───────────────────────
function ShiftEditSheet({
  open,
  memberName,
  date,
  currentCode,
  currentComment,
  currentIsActing,
  currentShiftTime,
  isAdmin,
  onClose,
  onSaveShift,
  onSaveAnnotation,
  onCopyShift,
}: {
  open: boolean;
  memberName: string;
  date: string;
  currentCode: string;
  currentComment: string;
  currentIsActing: boolean;
  currentShiftTime?: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaveShift: (code: string, shiftTime?: string | null) => void;
  onSaveAnnotation: (comment: string | null, isActing: boolean) => void;
  onCopyShift?: () => void;
}) {
  const isMobile = useIsMobile();
  const [comment, setComment] = useState(currentComment);
  const [isActing, setIsActing] = useState(currentIsActing);
  // shiftTime: use persisted override, else default from SHIFT_TIMES
  const [pendingCode, setPendingCode] = useState<string>(currentCode);
  const defaultTime = (code: string) =>
    SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
  const [shiftTime, setShiftTime] = useState<string>(
    currentShiftTime ?? defaultTime(currentCode)
  );
  useEffect(() => {
    if (open) {
      setComment(currentComment);
      setIsActing(currentIsActing);
      setPendingCode(currentCode);
      setShiftTime(currentShiftTime ?? defaultTime(currentCode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentComment, currentIsActing, currentCode, currentShiftTime]);
  const label =
    SHIFT_LABELS[currentCode as keyof typeof SHIFT_LABELS] ?? currentCode;
  const time =
    currentShiftTime ??
    SHIFT_TIMES[currentCode as keyof typeof SHIFT_TIMES] ??
    "";

  const inner = (
    <div>
      {currentCode && (
        <div className="flex items-center gap-2 mb-4">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
              shiftClass(currentCode)
            )}
          >
            <span className="font-bold uppercase">{currentCode}</span>
            <span className="opacity-60">·</span>
            <span>
              {label}
              {time ? ` · ${time}` : ""}
            </span>
          </div>
          {isAdmin && onCopyShift && (
            <button
              onClick={() => {
                onCopyShift();
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
              title="Copy this shift to clipboard"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
          )}
        </div>
      )}

      {/* Acting toggle — above shift selection */}
      {isAdmin && (
        <div className="flex items-center justify-between rounded-xl border border-border p-3.5 mb-4 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <Star
              className={cn(
                "h-4 w-4",
                isActing
                  ? "text-amber-500 fill-amber-400"
                  : "text-muted-foreground"
              )}
            />
            <div>
              <p className="text-sm font-medium">Acting</p>
              <p className="text-xs text-muted-foreground">
                Applies to existing shift — no shift change needed
              </p>
            </div>
          </div>
          <Switch
            checked={isActing}
            onCheckedChange={v => {
              setIsActing(v);
              onSaveAnnotation(comment.trim() || null, v);
            }}
          />
        </div>
      )}

      {/* Shift note — above shift selection */}
      {isAdmin && (
        <div className="mb-5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
            Shift Note
          </Label>
          <Textarea
            placeholder="Add a note for this shift…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="resize-none h-20 text-sm"
          />
          <Button
            className="w-full mt-2"
            size="sm"
            onClick={() => {
              onSaveAnnotation(comment.trim() || null, isActing);
              onClose();
            }}
          >
            Save Note
          </Button>
        </div>
      )}

      {/* Shift selector — below acting + note */}
      {isAdmin && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Change Shift
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {SHIFT_CODES.map(c => {
              const t = SHIFT_TIMES[c as keyof typeof SHIFT_TIMES];
              return (
                <button
                  key={c}
                  onClick={() => {
                    const newTime =
                      SHIFT_TIMES[c as keyof typeof SHIFT_TIMES] ?? "";
                    setPendingCode(c);
                    setShiftTime(newTime);
                  }}
                  className={cn(
                    "relative h-14 rounded-lg text-[10px] font-medium transition-all active:scale-95 overflow-hidden border-2",
                    shiftClass(c),
                    pendingCode === c
                      ? "border-white/60 shadow-md scale-[1.03]"
                      : "border-transparent"
                  )}
                >
                  <span className="absolute inset-x-1 top-1.5 text-[11px] font-bold uppercase text-center block">
                    {c}
                  </span>
                  <span className="absolute inset-x-1 bottom-1 text-[7px] opacity-60 leading-tight truncate text-center block">
                    {SHIFT_LABELS[c]}
                    {t ? ` · ${t}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Time picker for shifts that have a default time */}
          {pendingCode &&
            SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] !==
              undefined && (
              <div className="mt-3 flex items-center gap-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Start Time
                </Label>
                <input
                  type="time"
                  value={shiftTime}
                  onChange={e => setShiftTime(e.target.value)}
                  className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          {/* Apply / Clear buttons */}
          <div className="flex gap-2 mt-3">
            {pendingCode && (
              <Button
                className="flex-1"
                size="sm"
                onClick={() => {
                  onSaveShift(pendingCode, shiftTime || null);
                  onClose();
                }}
              >
                Apply
              </Button>
            )}
            {currentCode && (
              <button
                onClick={() => {
                  onSaveShift("", null);
                  onClose();
                }}
                className="flex-1 text-xs text-muted-foreground py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors font-medium border border-border/50"
              >
                Clear shift
              </button>
            )}
          </div>
        </div>
      )}

      {!isAdmin && currentComment && (
        <div className="rounded-xl border border-border p-3.5 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Note
          </p>
          <p className="text-sm">{currentComment}</p>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={o => {
          if (!o) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[92vh] overflow-y-auto pb-8"
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="font-semibold">{memberName}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground text-sm">
                {safeFormat(date, "EEE d MMM yyyy")}
              </span>
            </SheetTitle>
          </SheetHeader>
          {inner}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="font-semibold">{memberName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground text-sm">
              {safeFormat(date, "EEE d MMM yyyy")}
            </span>
          </DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk apply popup (Dialog on desktop, Sheet on mobile) ──────────────────────
function BulkApplySheet({
  open,
  count,
  onClose,
  onApply,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onApply: (
    code: ShiftCode | null,
    isActing: boolean,
    actingOnly: boolean,
    shiftTime: string | null
  ) => void;
}) {
  const isMobile = useIsMobile();
  const [selectedCode, setSelectedCode] = useState<ShiftCode>("d");
  const [isActing, setIsActing] = useState(false);
  const [actingOnly, setActingOnly] = useState(false);
  const defaultTime = (code: string) =>
    SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
  const [shiftTime, setShiftTime] = useState<string>(defaultTime("d"));
  useEffect(() => {
    if (open) {
      setSelectedCode("d");
      setIsActing(false);
      setActingOnly(false);
      setShiftTime(defaultTime("d"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const inner = (
    <div>
      {/* Acting toggle — at the top */}
      <div className="flex items-center justify-between rounded-xl border border-border p-3.5 mb-4 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <Star
            className={cn(
              "h-4 w-4",
              isActing
                ? "text-amber-500 fill-amber-400"
                : "text-muted-foreground"
            )}
          />
          <div>
            <p className="text-sm font-medium">Acting</p>
            <p className="text-xs text-muted-foreground">
              {actingOnly
                ? "Apply acting to existing shifts only (no shift change)"
                : "Also apply acting indicator"}
            </p>
          </div>
        </div>
        <Switch
          checked={isActing}
          onCheckedChange={v => {
            setIsActing(v);
            if (v) {
            } else setActingOnly(false);
          }}
        />
      </div>

      {/* Acting-only mode toggle */}
      {isActing && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 p-3 mb-4 bg-amber-50">
          <div>
            <p className="text-sm font-medium text-amber-800">
              Acting only (no shift change)
            </p>
            <p className="text-xs text-amber-600">
              Toggle acting on selected cells without changing their shift code
            </p>
          </div>
          <Switch checked={actingOnly} onCheckedChange={setActingOnly} />
        </div>
      )}

      {/* Shift selector — hidden in acting-only mode */}
      {!actingOnly && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Select Shift
          </p>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {SHIFT_CODES.map(c => {
              const t = SHIFT_TIMES[c as keyof typeof SHIFT_TIMES];
              return (
                <button
                  key={c}
                  onClick={() => {
                    setSelectedCode(c as ShiftCode);
                    setShiftTime(defaultTime(c));
                  }}
                  className={cn(
                    "relative h-14 rounded-lg text-[10px] font-medium transition-all active:scale-95 overflow-hidden border-2",
                    shiftClass(c),
                    selectedCode === c
                      ? "border-white/60 shadow-md scale-[1.03]"
                      : "border-transparent"
                  )}
                >
                  <span className="absolute inset-x-1 top-1.5 text-[11px] font-bold uppercase text-center block">
                    {c}
                  </span>
                  <span className="absolute inset-x-1 bottom-1 text-[7px] opacity-60 leading-tight truncate text-center block">
                    {SHIFT_LABELS[c]}
                    {t ? ` · ${t}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Time picker */}
          {SHIFT_TIMES[selectedCode as keyof typeof SHIFT_TIMES] !==
            undefined && (
            <div className="flex items-center gap-2 mb-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                Start Time
              </Label>
              <input
                type="time"
                value={shiftTime}
                onChange={e => setShiftTime(e.target.value)}
                className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {shiftTime !== defaultTime(selectedCode) && (
                <button
                  onClick={() => setShiftTime(defaultTime(selectedCode))}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={() =>
            onApply(
              actingOnly ? null : selectedCode,
              isActing,
              actingOnly,
              actingOnly ? null : shiftTime || null
            )
          }
        >
          {actingOnly
            ? `Set Acting on ${count} Cell${count !== 1 ? "s" : ""}`
            : `Apply to ${count} Cell${count !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={o => {
          if (!o) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[92vh] overflow-y-auto pb-8"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>
              Apply Shift to {count} Cell{count !== 1 ? "s" : ""}
            </SheetTitle>
          </SheetHeader>
          {inner}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-2">
          <DialogTitle>
            Apply Shift to {count} Cell{count !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk copy popup (Dialog on desktop, Sheet on mobile) ─────────────────────
function BulkCopySheet({
  open,
  members,
  onClose,
  onCopy,
  isLoading,
}: {
  open: boolean;
  members: Member[];
  onClose: () => void;
  onCopy: (
    sourceMemberId: number,
    targetMemberIds: number[],
    startDate: string,
    endDate: string
  ) => void;
  isLoading: boolean;
}) {
  const isMobile = useIsMobile();
  const [sourceMemberId, setSourceMemberId] = useState<number | "">("");
  const [targetMemberIds, setTargetMemberIds] = useState<Set<number>>(
    new Set()
  );
  const [startDate, setStartDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(ROSTER_END);

  useEffect(() => {
    if (open) {
      setSourceMemberId("");
      setTargetMemberIds(new Set());
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      setEndDate(ROSTER_END);
    }
  }, [open]);

  const toggleTarget = (id: number) => {
    setTargetMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit =
    sourceMemberId !== "" && targetMemberIds.size > 0 && startDate <= endDate;

  const inner = (
    <div className="space-y-4">
      {/* Source member */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Copy From
        </p>
        <select
          value={sourceMemberId}
          onChange={e =>
            setSourceMemberId(
              e.target.value === "" ? "" : Number(e.target.value)
            )
          }
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select source member…</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            From Date
          </p>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            min={ROSTER_START}
            max={ROSTER_END}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            To Date
          </p>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            min={ROSTER_START}
            max={ROSTER_END}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Target members */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Copy To ({targetMemberIds.size} selected)
        </p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {members
            .filter(m => m.id !== (sourceMemberId === "" ? -1 : sourceMemberId))
            .map(m => (
              <label
                key={m.id}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={targetMemberIds.has(m.id)}
                  onChange={() => toggleTarget(m.id)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm">{m.name}</span>
              </label>
            ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!canSubmit || isLoading}
          onClick={() => {
            if (sourceMemberId === "") return;
            onCopy(
              sourceMemberId,
              Array.from(targetMemberIds),
              startDate,
              endDate
            );
          }}
        >
          {isLoading
            ? "Copying…"
            : `Copy to ${targetMemberIds.size} Member${targetMemberIds.size !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={o => {
          if (!o) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[92vh] overflow-y-auto pb-8"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>Bulk Copy Shifts</SheetTitle>
          </SheetHeader>
          {inner}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-2">
          <DialogTitle>Bulk Copy Shifts</DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}

// ── Repeat Cycle → Team ───────────────────────────────────────────────────────
// Repeats a member's already-entered shift pattern (e.g. a 2-week rotation)
// forward to a chosen date, then optionally copies the result to every other
// member of the same team.
function RepeatCycleSheet({
  open,
  members,
  teams,
  onClose,
  onApply,
  isLoading,
  result,
}: {
  open: boolean;
  members: Member[];
  teams: Team[];
  onClose: () => void;
  onApply: (
    sourceMemberId: number,
    fillUntilDate: string,
    copyToTeam: boolean
  ) => void;
  isLoading: boolean;
  result: RepeatCycleResult | null;
}) {
  const isMobile = useIsMobile();
  const [sourceMemberId, setSourceMemberId] = useState<number | "">("");
  const [fillUntilDate, setFillUntilDate] = useState(ROSTER_END);
  const [copyToTeam, setCopyToTeam] = useState(true);

  useEffect(() => {
    if (open) {
      setSourceMemberId("");
      setFillUntilDate(ROSTER_END);
      setCopyToTeam(true);
    }
  }, [open]);

  const sourceMember = members.find(m => m.id === sourceMemberId);
  const sourceTeam = teams.find(t => t.id === sourceMember?.teamId);
  const teammateCount = sourceMember
    ? members.filter(
        m => m.teamId === sourceMember.teamId && m.id !== sourceMember.id
      ).length
    : 0;
  const canSubmit = sourceMemberId !== "" && !!fillUntilDate;

  const inner = (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Member with the pattern to repeat
        </p>
        <select
          value={sourceMemberId}
          onChange={e =>
            setSourceMemberId(
              e.target.value === "" ? "" : Number(e.target.value)
            )
          }
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select member…</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1.5">
          Whatever this member already has entered — from their earliest to
          latest shift — becomes the cycle that repeats.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Repeat through
        </p>
        <input
          type="date"
          value={fillUntilDate}
          onChange={e => setFillUntilDate(e.target.value)}
          min={ROSTER_START}
          max={ROSTER_END}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border bg-muted/30 p-3">
        <Switch
          checked={copyToTeam}
          onCheckedChange={setCopyToTeam}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">
            Also copy to the rest of {sourceTeam ? sourceTeam.name : "the team"}
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sourceMember
              ? `Applies the same repeated cycle to ${teammateCount} other member${teammateCount !== 1 ? "s" : ""} of ${sourceTeam?.name ?? "this team"}, overwriting their existing shifts in that range.`
              : "Applies the same repeated cycle to every other member of this member's team."}
          </p>
        </div>
      </label>

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Detected a {result.cycleLengthDays}-day cycle ({result.cycleStart} to{" "}
          {result.cycleEnd}). Filled {result.daysFilledForSource} more day
          {result.daysFilledForSource !== 1 ? "s" : ""} for this member
          {result.membersUpdated > 0
            ? ` and copied it to ${result.membersUpdated} teammate${result.membersUpdated !== 1 ? "s" : ""}.`
            : "."}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!canSubmit || isLoading}
          onClick={() => {
            if (sourceMemberId === "") return;
            onApply(sourceMemberId, fillUntilDate, copyToTeam);
          }}
        >
          {isLoading ? "Applying…" : "Repeat Cycle"}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={o => {
          if (!o) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[92vh] overflow-y-auto pb-8"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>Repeat Cycle to Team</SheetTitle>
          </SheetHeader>
          {inner}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-2">
          <DialogTitle>Repeat Cycle to Team</DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function RosterPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isMobile = useIsMobile();

  // Single scroll container ref — both axes scroll here
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
  }, []);

  // Drag-to-scroll (mouse/pointer drag on the grid background)
  const dragScrollRef = useRef<{
    startX: number;
    startScrollLeft: number;
    active: boolean;
  }>({
    startX: 0,
    startScrollLeft: 0,
    active: false,
  });
  const handleGridPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only activate on the grid background (not on shift cells or buttons)
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-no-dnd]") ||
        target.closest("button") ||
        target.closest('[role="button"]')
      )
        return;
      if (!scrollRef.current) return;
      dragScrollRef.current = {
        startX: e.clientX,
        startScrollLeft: scrollRef.current.scrollLeft,
        active: true,
      };
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        /* iOS Safari may not support setPointerCapture on all elements */
      }
      e.currentTarget.style.cursor = "grabbing";
    },
    []
  );
  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragScrollRef.current.active || !scrollRef.current) return;
      const dx = e.clientX - dragScrollRef.current.startX;
      scrollRef.current.scrollLeft = dragScrollRef.current.startScrollLeft - dx;
    },
    []
  );
  const handleGridPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragScrollRef.current.active = false;
      e.currentTarget.style.cursor = "";
    },
    []
  );

  const scrollToDate = useCallback((dateStr: string) => {
    const idx = ALL_DATES.findIndex(d => format(d, "yyyy-MM-dd") === dateStr);
    if (idx < 0) return;
    const target = idx * COL_WIDTH;
    if (scrollRef.current) scrollRef.current.scrollLeft = target;
    setScrollLeft(target);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  // scrolledToToday ref — the actual effect is placed after shiftsData is declared (line ~680)
  const scrolledToToday = useRef(false);

  // Month navigation
  const visibleMonthIndex = useMemo(() => {
    if (ALL_DATES.length === 0) return 0;
    const visibleDayIdx = Math.floor(scrollLeft / COL_WIDTH);
    const visibleDate =
      ALL_DATES[Math.min(Math.max(0, visibleDayIdx), ALL_DATES.length - 1)];
    if (!visibleDate) return 0;
    const monthStr = safeFormat(visibleDate, "MMM yyyy");
    if (!monthStr) return 0;
    const idx = MONTHS.findIndex(m => m === monthStr);
    return idx >= 0 ? idx : 0;
  }, [scrollLeft]);

  const goToPrevMonth = () => {
    const newIdx = Math.max(0, visibleMonthIndex - 1);
    const [mon, yr] = MONTHS[newIdx].split(" ");
    const mIdx = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(mon);
    const d = new Date(parseInt(yr), mIdx, 1);
    scrollToDate(
      format(d < ROSTER_START_DATE ? ROSTER_START_DATE : d, "yyyy-MM-dd")
    );
  };

  const goToNextMonth = () => {
    const newIdx = Math.min(MONTHS.length - 1, visibleMonthIndex + 1);
    const [mon, yr] = MONTHS[newIdx].split(" ");
    const mIdx = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(mon);
    const d = new Date(parseInt(yr), mIdx, 1);
    scrollToDate(
      format(d > ROSTER_END_DATE ? ROSTER_END_DATE : d, "yyyy-MM-dd")
    );
  };

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
    }[];
    memberIds: number[]; // ordered unique member IDs in the block
    dates: string[]; // ordered unique dates in the block
  } | null>(null); // null = nothing copied yet; non-null = ready to paste
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false); // old dialog (kept for fallback, unused)
  const [repeatCycleOpen, setRepeatCycleOpen] = useState(false);
  const [repeatCycleResult, setRepeatCycleResult] =
    useState<RepeatCycleResult | null>(null);

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
      { staleTime: 60_000 }
    );

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
    onSettled: () => utils.ctoRoster.roster.getRange.invalidate(),
  });
  const bulkUpdate = trpc.ctoRoster.roster.bulkUpdate.useMutation({
    onSuccess: data => {
      utils.ctoRoster.roster.getRange.invalidate();
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
      setBulkCopyOpen(false);
      toast.success(`Copied ${data.count} shifts`);
    },
    onError: e => toast.error(`Bulk copy failed: ${e.message}`),
  });
  const repeatCycle = trpc.ctoRoster.roster.repeatCycle.useMutation({
    onSuccess: data => {
      utils.ctoRoster.roster.getRange.invalidate();
      setRepeatCycleResult(data);
      toast.success(
        data.membersUpdated > 0
          ? `Cycle repeated and copied to ${data.membersUpdated} teammate${data.membersUpdated !== 1 ? "s" : ""}`
          : "Cycle repeated"
      );
    },
    onError: e => toast.error(`Repeat cycle failed: ${e.message}`),
  });

  const reorderMembers = trpc.ctoRoster.members.reorder.useMutation({
    onSuccess: () => {
      refetchMembers();
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
  // Scroll to today once data has loaded — fires on first non-empty shiftsData
  useEffect(() => {
    if (scrolledToToday.current) return;
    if (!shiftsData || !scrollRef.current) return;
    const raf = requestAnimationFrame(() => {
      scrollToDate(today);
      scrolledToToday.current = true;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsData]);
  const handlePasteBlock = useCallback(
    (targetMemberId: number, targetDate: string) => {
      if (!copiedBlock) return;
      const { cells, memberIds, dates } = copiedBlock;
      // Use visualRowMembers (team-grouped order) so row deltas match the grid
      const anchorMemberIdx = visualRowMembers.findIndex(
        m => m.id === memberIds[0]
      );
      const anchorDateIdx = ALL_DATES.findIndex(
        d => format(d, "yyyy-MM-dd") === dates[0]
      );
      const targetMemberIdx = visualRowMembers.findIndex(
        m => m.id === targetMemberId
      );
      const targetDateIdx = ALL_DATES.findIndex(
        d => format(d, "yyyy-MM-dd") === targetDate
      );
      const rowDelta = targetMemberIdx - anchorMemberIdx;
      const colDelta = targetDateIdx - anchorDateIdx;
      let pasted = 0;
      for (const cell of cells) {
        const srcMemberIdx = visualRowMembers.findIndex(
          m => m.id === cell.memberId
        );
        const srcDateIdx = ALL_DATES.findIndex(
          d => format(d, "yyyy-MM-dd") === cell.date
        );
        const dstMemberIdx = srcMemberIdx + rowDelta;
        const dstDateIdx = srcDateIdx + colDelta;
        if (dstMemberIdx < 0 || dstMemberIdx >= visualRowMembers.length)
          continue;
        if (dstDateIdx < 0 || dstDateIdx >= ALL_DATES.length) continue;
        const dstMember = visualRowMembers[dstMemberIdx];
        const dstDate = format(ALL_DATES[dstDateIdx], "yyyy-MM-dd");
        updateShift.mutate({
          memberId: dstMember.id,
          shiftDate: dstDate,
          shiftCode: cell.shiftCode as ShiftCode,
          comment: cell.comment || null,
          isActing: cell.isActing,
        });
        pasted++;
      }
      toast.success(`Pasted ${pasted} cell${pasted !== 1 ? "s" : ""}`);
      setCopiedBlock(null);
    },
    [copiedBlock, visualRowMembers, updateShift]
  );

  const handleCellTap = useCallback(
    (
      memberId: number,
      memberName: string,
      date: string,
      shift: ShiftData | undefined
    ) => {
      // Paste block: click on any cell to set paste-start position
      if (copiedBlock) {
        handlePasteBlock(memberId, date);
        return;
      }
      // Bulk copy selection mode
      if (bulkCopyMode) {
        const key = `${memberId}-${date}`;
        setSelectedCells(prev => {
          const next = new Map(prev);
          if (next.has(key)) next.delete(key);
          else next.set(key, { memberId, date });
          return next;
        });
        return;
      }
      // Bulk edit selection mode
      if (bulkMode) {
        const key = `${memberId}-${date}`;
        setSelectedCells(prev => {
          const next = new Map(prev);
          if (next.has(key)) next.delete(key);
          else next.set(key, { memberId, date });
          return next;
        });
        return;
      }
      setEditSheet({
        open: true,
        memberId,
        memberName,
        date,
        currentCode: shift?.shiftCode ?? "",
        currentComment: shift?.comment ?? "",
        currentIsActing: shift?.isActing ?? false,
        currentShiftTime: shift?.shiftTime ?? null,
      });
    },
    [bulkMode, bulkCopyMode, copiedBlock, handlePasteBlock]
  );

  const handleCellPointerDown = useCallback(
    (memberId: number, date: string) => {
      if (!bulkMode && !bulkCopyMode) return;
      isDraggingSelection.current = true;
      const key = `${memberId}-${date}`;
      setSelectedCells(prev => {
        const next = new Map(prev);
        if (next.has(key)) next.delete(key);
        else next.set(key, { memberId, date });
        return next;
      });
    },
    [bulkMode, bulkCopyMode]
  );

  const handleCellPointerEnter = useCallback(
    (memberId: number, date: string) => {
      if ((!bulkMode && !bulkCopyMode) || !isDraggingSelection.current) return;
      const key = `${memberId}-${date}`;
      setSelectedCells(prev => {
        const next = new Map(prev);
        next.set(key, { memberId, date });
        return next;
      });
    },
    [bulkMode, bulkCopyMode]
  );
  const handlePointerUp = useCallback(() => {
    isDraggingSelection.current = false;
  }, []);
  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerUp]);

  const handleSaveShift = useCallback(
    (memberId: number, date: string, code: string) => {
      updateShift.mutate({
        memberId,
        shiftDate: date,
        shiftCode: code as ShiftCode,
      });
    },
    [updateShift]
  );

  const handleSaveAnnotation = useCallback(
    (
      memberId: number,
      date: string,
      currentCode: string,
      comment: string | null,
      isActing: boolean
    ) => {
      updateShift.mutate({
        memberId,
        shiftDate: date,
        shiftCode: currentCode as ShiftCode,
        comment,
        isActing,
      });
    },
    [updateShift]
  );

  const handleCopyCell = useCallback((shift: ShiftData | undefined) => {
    if (!shift?.shiftCode) {
      toast.error("Nothing to copy — cell is empty");
      return;
    }
    setClipboard({
      code: shift.shiftCode,
      comment: shift.comment ?? "",
      isActing: shift.isActing ?? false,
    });
    toast.success(
      `Copied: ${SHIFT_LABELS[shift.shiftCode as keyof typeof SHIFT_LABELS] ?? shift.shiftCode}`
    );
  }, []);

  const handlePasteCell = useCallback(
    (memberId: number, date: string) => {
      if (!clipboard) {
        toast.error("Nothing in clipboard — copy a shift first");
        return;
      }
      updateShift.mutate({
        memberId,
        shiftDate: date,
        shiftCode: clipboard.code as ShiftCode,
        comment: clipboard.comment || null,
        isActing: clipboard.isActing,
      });
      toast.success(
        `Pasted: ${SHIFT_LABELS[clipboard.code as keyof typeof SHIFT_LABELS] ?? clipboard.code}`
      );
    },
    [clipboard, updateShift]
  );

  const handleBulkApply = useCallback(
    (
      code: ShiftCode | null,
      isActing: boolean,
      actingOnly: boolean,
      shiftTime: string | null
    ) => {
      if (selectedCells.size === 0) return;
      if (actingOnly) {
        // Acting-only: update each cell individually preserving its current shift code
        for (const { memberId, date } of Array.from(selectedCells.values())) {
          const currentCode =
            shiftMap.get(memberId)?.get(date)?.shiftCode ?? "";
          updateShift.mutate({
            memberId,
            shiftDate: date,
            shiftCode: currentCode as ShiftCode,
            isActing,
          });
        }
        setSelectedCells(new Map());
        setBulkSheetOpen(false);
        setBulkMode(false);
        return;
      }
      const byMember = new Map<number, string[]>();
      for (const { memberId, date } of Array.from(selectedCells.values())) {
        if (!byMember.has(memberId)) byMember.set(memberId, []);
        byMember.get(memberId)!.push(date);
      }
      for (const [memberId, dates] of Array.from(byMember.entries())) {
        bulkUpdate.mutate({
          memberId,
          dates,
          shiftCode: code as ShiftCode,
          isActing,
          shiftTime,
        });
      }
    },
    [selectedCells, bulkUpdate, updateShift, shiftMap]
  );

  // Excel-style bulk copy: copy the selected block, then paste at a target cell
  const handleCopyBlock = useCallback(() => {
    if (selectedCells.size === 0) return;
    const cells = Array.from(selectedCells.values());
    // Sort member IDs by visual row order (team grouping), not flat sortOrder
    const memberIds = Array.from(new Set(cells.map(c => c.memberId))).sort(
      (a, b) => {
        const ai = visualRowMembers.findIndex(m => m.id === a);
        const bi = visualRowMembers.findIndex(m => m.id === b);
        return ai - bi;
      }
    );
    const dates = Array.from(new Set(cells.map(c => c.date))).sort();
    const enriched = cells.map(c => ({
      ...c,
      shiftCode: shiftMap.get(c.memberId)?.get(c.date)?.shiftCode ?? "",
      comment: shiftMap.get(c.memberId)?.get(c.date)?.comment ?? "",
      isActing: shiftMap.get(c.memberId)?.get(c.date)?.isActing ?? false,
    }));
    setCopiedBlock({ cells: enriched, memberIds, dates });
    setBulkCopyMode(false);
    setSelectedCells(new Map());
    toast.success(
      `Block copied (${cells.length} cell${cells.length !== 1 ? "s" : ""}) — click a cell to paste`
    );
  }, [selectedCells, shiftMap, visualRowMembers]);

  // DnD sensors — SmartPointerSensor/SmartTouchSensor skip elements with
  // data-no-dnd="true" (shift cells) so normal taps on iOS are never intercepted.
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(SmartTouchSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
    if (!localMembers && membersData)
      setLocalMembers([...(membersData as Member[])]);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (overId.startsWith("team-zone-"))
      setOverTeamId(parseInt(overId.replace("team-zone-", "")));
    else {
      const overMember = displayMembers.find(m => m.id === over.id);
      if (overMember) setOverTeamId(overMember.teamId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setOverTeamId(null);
    if (!over || !localMembers) return;

    const activeId = active.id as number;
    const overId = String(over.id);
    let targetTeamId: number;
    let insertBeforeMemberId: number | null = null;

    if (overId.startsWith("team-zone-")) {
      targetTeamId = parseInt(overId.replace("team-zone-", ""));
    } else {
      const overMember = localMembers.find(m => m.id === Number(over.id));
      if (!overMember) return;
      targetTeamId = overMember.teamId;
      insertBeforeMemberId = overMember.id;
    }
    if (activeId === insertBeforeMemberId) return;

    const updated = localMembers.map(m => ({ ...m }));
    const activeMember = updated.find(m => m.id === activeId);
    if (!activeMember) return;
    activeMember.teamId = targetTeamId;

    const teamGroups = new Map<number, Member[]>();
    for (const m of updated) {
      if (!teamGroups.has(m.teamId)) teamGroups.set(m.teamId, []);
      teamGroups.get(m.teamId)!.push(m);
    }
    for (const [, group] of Array.from(teamGroups.entries())) {
      const withoutActive = group
        .filter((m: Member) => m.id !== activeId)
        .sort((a: Member, b: Member) => a.sortOrder - b.sortOrder);
      let insertIdx = withoutActive.length;
      if (
        insertBeforeMemberId !== null &&
        group.some((m: Member) => m.id === activeId)
      ) {
        const beforeIdx = withoutActive.findIndex(
          (m: Member) => m.id === insertBeforeMemberId
        );
        if (beforeIdx !== -1) insertIdx = beforeIdx;
      }
      withoutActive.splice(insertIdx, 0, activeMember);
      withoutActive.forEach((m: Member, i: number) => {
        m.sortOrder = i;
      });
    }
    setLocalMembers(updated);
    reorderMembers.mutate(
      updated.map(m => ({ id: m.id, teamId: m.teamId, sortOrder: m.sortOrder }))
    );
  };

  const activeMember = activeDragId
    ? displayMembers.find(m => m.id === activeDragId)
    : null;

  // Mobile name column: shrink to fit the longest member name (+ padding)
  const mobileNameColWidth = useMemo(() => {
    if (!isMobile || !membersData) return NAME_COL_WIDTH;
    const names = (membersData as Member[]).map(m => m.name);
    // Measure using canvas for accuracy
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = "500 14px ui-sans-serif, system-ui, sans-serif";
        const maxTextWidth = Math.max(
          ...names.map(n => ctx.measureText(n).width)
        );
        // Add horizontal padding (12px each side) + 4px buffer, min 80px
        return Math.max(80, Math.ceil(maxTextWidth) + 28);
      }
    } catch {
      /* fallback */
    }
    // Fallback: estimate 8px per char for the longest name
    const longest = Math.max(...names.map(n => n.length));
    return Math.max(80, longest * 8 + 28);
  }, [isMobile, membersData]);

  // Total grid dimensions
  const nameColWidthForGrid = isMobile ? mobileNameColWidth : NAME_COL_WIDTH;
  const totalContentWidth = nameColWidthForGrid + TOTAL_DAYS * COL_WIDTH;

  return (
    <DashboardLayout>
      <div
        className="flex flex-col select-none px-4 py-3"
        style={{
          height: "calc(100vh - 0px)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* ── Toolbar ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5 mb-3 flex-shrink-0">
          {/* Row 1: title + Today button (Today visible on mobile only here) */}
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight mr-auto">
              Team Duty Roster
            </h1>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs sm:hidden"
              onClick={() => scrollToDate(today)}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Today
            </Button>
          </div>
          {/* Row 2: month nav + bulk buttons (all on one line, scrollable on mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {/* Month navigator */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToPrevMonth}
                disabled={visibleMonthIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[76px] text-center tabular-nums">
                {MONTHS[visibleMonthIndex]}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToNextMonth}
                disabled={visibleMonthIndex === MONTHS.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Today button — tablet/desktop only, between month nav and Bulk Edit */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs hidden sm:flex flex-shrink-0"
              onClick={() => scrollToDate(today)}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Today
            </Button>
            {/* Bulk Edit */}
            {isAdmin && (
              <button
                onClick={() => {
                  setBulkMode(v => !v);
                  setSelectedCells(new Map());
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors h-8",
                  bulkMode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <CheckSquare2 className="h-3.5 w-3.5" />
                {bulkMode ? `${selectedCells.size} sel` : "Bulk Edit"}
              </button>
            )}
            {/* Bulk Copy */}
            {isAdmin && (
              <button
                onClick={() => {
                  if (bulkCopyMode) {
                    setBulkCopyMode(false);
                    setSelectedCells(new Map());
                  } else {
                    setBulkCopyMode(true);
                    setBulkMode(false);
                    setSelectedCells(new Map());
                    setCopiedBlock(null);
                  }
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors h-8",
                  bulkCopyMode
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Scissors className="h-3.5 w-3.5" />
                {bulkCopyMode ? `${selectedCells.size} sel` : "Bulk Copy"}
              </button>
            )}
            {/* Repeat Cycle → Team */}
            {isAdmin && (
              <button
                onClick={() => {
                  setRepeatCycleResult(null);
                  setRepeatCycleOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors h-8"
              >
                <Repeat className="h-3.5 w-3.5" />
                Repeat Cycle
              </button>
            )}
            {/* Copy block button */}
            {bulkCopyMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={handleCopyBlock}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy ({selectedCells.size})
              </Button>
            )}
            {/* Paste indicator */}
            {isAdmin && copiedBlock && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium h-8">
                <ClipboardPaste className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  Block ready ({copiedBlock.cells.length}) — tap paste start
                </span>
                <span className="sm:hidden">
                  {copiedBlock.cells.length} ready
                </span>
                <button
                  onClick={() => setCopiedBlock(null)}
                  className="ml-1 text-blue-400 hover:text-blue-700"
                >
                  ×
                </button>
              </div>
            )}
            {/* Apply shift button */}
            {bulkMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBulkSheetOpen(true)}
              >
                Apply ({selectedCells.size})
              </Button>
            )}
            {/* Clipboard indicator */}
            {isAdmin && clipboard && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium h-8">
                <ClipboardPaste className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  Clipboard:{" "}
                  {SHIFT_LABELS[clipboard.code as keyof typeof SHIFT_LABELS] ??
                    clipboard.code}
                </span>
                <span className="sm:hidden">
                  {SHIFT_LABELS[clipboard.code as keyof typeof SHIFT_LABELS] ??
                    clipboard.code}
                </span>
                <button
                  onClick={() => setClipboard(null)}
                  className="ml-1 text-amber-400 hover:text-amber-700"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Single scroll container — both axes ───────────────────────────── */}
        {/*
          The key to true frozen panes:
          - This outer div is the ONLY scroll container (overflow: auto on both axes)
          - The date header row uses `position: sticky; top: 0` → stays at top on vertical scroll
          - Each name cell uses `position: sticky; left: 0` → stays at left on horizontal scroll
          - Both freeze simultaneously because they share the same scroll container
      */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerUp}
          className="flex-1 min-h-0 overflow-auto cursor-grab active:cursor-grabbing"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-md" />
              ))}
            </div>
          ) : isMobile ? (
            // On mobile: render grid WITHOUT DndContext to avoid iOS Pointer Events crash.
            // Drag-to-reorder is a desktop-only admin feature.
            <div
              style={{ minWidth: `${totalContentWidth}px` }}
              className="relative pb-2"
            >
              {/* ── Frozen date header row ─────────────────────────────────── */}
              <div
                className="flex gap-[3px] mb-[3px]"
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 30,
                  background: "var(--color-background)",
                  paddingBottom: "2px",
                }}
              >
                <div
                  className="flex-shrink-0 flex items-center px-3 bg-card rounded-md shadow-sm border border-border/50 font-semibold text-foreground text-sm"
                  style={{
                    width: `${nameColWidthForGrid}px`,
                    height: `${HEADER_HEIGHT}px`,
                    position: "sticky",
                    left: 0,
                    zIndex: 40,
                    background: "var(--color-card)",
                  }}
                >
                  Member
                </div>
                {ALL_DATES.map(d => {
                  const ds = format(d, "yyyy-MM-dd");
                  const isToday = ds === today;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isMonthStart = d.getDate() === 1;
                  return (
                    <div
                      key={ds}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center justify-center rounded-md text-center relative",
                        isToday
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : isWeekend
                            ? "bg-muted/60 text-muted-foreground"
                            : "bg-card text-foreground border border-border/50 shadow-sm"
                      )}
                      style={{
                        width: `${COL_WIDTH}px`,
                        height: `${HEADER_HEIGHT}px`,
                      }}
                    >
                      {isMonthStart && (
                        <span className="absolute -top-0.5 left-0 right-0 text-[8px] font-bold text-primary/70 uppercase tracking-wider text-center leading-none">
                          {format(d, "MMM")}
                        </span>
                      )}
                      <span className="text-[9px] uppercase tracking-wide opacity-60 leading-none mt-1">
                        {format(d, "EEE")}
                      </span>
                      <span className="text-xs font-bold leading-none mt-0.5">
                        {format(d, "d")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ── Team sections ─────────────────────────────────────────── */}
              {((teamsData as Team[]) ?? []).map(team => {
                const teamMembers = displayMembers.filter(
                  m => m.teamId === team.id
                );
                const isSurveillance =
                  team.name === "Team 1" || team.name === "Team 2";
                return (
                  <div key={team.id} className="mb-1">
                    {/* Team label row */}
                    <div className="flex gap-[3px] mb-[3px]">
                      <div
                        className="flex-shrink-0 flex items-center px-3 h-7 rounded-md text-[10px] font-bold uppercase tracking-widest bg-sidebar text-sidebar-foreground"
                        style={{
                          width: `${nameColWidthForGrid}px`,
                          position: "sticky",
                          left: 0,
                          zIndex: 20,
                          background: "var(--color-sidebar)",
                        }}
                      >
                        {team.name}
                      </div>
                      {ALL_DATES.map(d => (
                        <div
                          key={format(d, "yyyy-MM-dd")}
                          className="flex-shrink-0 h-7 rounded-md bg-sidebar/50"
                          style={{ width: `${COL_WIDTH}px` }}
                        />
                      ))}
                    </div>

                    {/* Member rows (no DnD on mobile) */}
                    {teamMembers.map(member => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        allDates={ALL_DATES}
                        today={today}
                        shiftMap={shiftMap}
                        isAdmin={isAdmin}
                        bulkMode={bulkMode}
                        bulkCopyMode={bulkCopyMode}
                        copiedBlock={copiedBlock}
                        selectedCells={selectedCells}
                        nameColWidth={nameColWidthForGrid}
                        colWidth={COL_WIDTH}
                        rowHeight={ROW_HEIGHT}
                        clipboard={clipboard}
                        onCellTap={handleCellTap}
                        onCellPointerDown={handleCellPointerDown}
                        onCellPointerEnter={handleCellPointerEnter}
                        onCopyCell={handleCopyCell}
                        onPasteCell={handlePasteCell}
                      />
                    ))}

                    {/* On Duty row */}
                    <div className="flex gap-[3px] mt-[3px] mb-2">
                      <div
                        className="flex-shrink-0 flex items-center px-3 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest text-slate-400"
                        style={{
                          width: `${nameColWidthForGrid}px`,
                          position: "sticky",
                          left: 0,
                          zIndex: 20,
                          background: "#1e293b",
                        }}
                      >
                        On Duty
                      </div>
                      {ALL_DATES.map(d => {
                        const ds = format(d, "yyyy-MM-dd");
                        const isToday = ds === today;
                        const count = teamMembers.filter(m =>
                          ON_DUTY_CODES.has(
                            shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                          )
                        ).length;
                        const numClass = isSurveillance
                          ? count > 5
                            ? "text-emerald-400"
                            : count === 5
                              ? "text-yellow-400"
                              : count >= 1
                                ? "text-red-400"
                                : "text-slate-600"
                          : count >= 5
                            ? "text-emerald-400"
                            : count >= 1
                              ? "text-slate-300"
                              : "text-slate-600";
                        return (
                          <div
                            key={ds}
                            className={cn(
                              "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                              isToday ? "bg-primary/20" : "bg-slate-800/70"
                            )}
                            style={{ width: `${COL_WIDTH}px` }}
                          >
                            <span
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                numClass
                              )}
                            >
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* On Call row */}
                    <div className="flex gap-[3px] mt-[3px] mb-2">
                      <div
                        className="flex-shrink-0 flex items-center px-3 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest text-slate-400"
                        style={{
                          width: `${nameColWidthForGrid}px`,
                          position: "sticky",
                          left: 0,
                          zIndex: 20,
                          background: "#334155",
                        }}
                      >
                        On Call
                      </div>
                      {ALL_DATES.map(d => {
                        const ds = format(d, "yyyy-MM-dd");
                        const isToday = ds === today;
                        const count = teamMembers.filter(m =>
                          ON_CALL_CODES.has(
                            shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                          )
                        ).length;
                        const numClass =
                          count >= 5 ? "text-emerald-400" : "text-red-400";
                        return (
                          <div
                            key={ds}
                            className={cn(
                              "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                              isToday ? "bg-primary/20" : "bg-slate-700/60"
                            )}
                            style={{ width: `${COL_WIDTH}px` }}
                          >
                            <span
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                numClass
                              )}
                            >
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* Grid: min-width forces horizontal scroll when content overflows */}
              <div
                style={{
                  minWidth: `${totalContentWidth}px`,
                  width: `${totalContentWidth}px`,
                }}
                className="relative pb-2"
              >
                {/* ── Frozen date header row ─────────────────────────────────── */}
                <div
                  className="flex gap-[3px] mb-[3px]"
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 30,
                    background: "var(--color-background)",
                    paddingBottom: "2px",
                  }}
                >
                  {/* Corner cell — frozen top-left */}
                  <div
                    className="flex-shrink-0 flex items-center px-3 bg-card rounded-md shadow-sm border border-border/50 font-semibold text-foreground text-sm"
                    style={{
                      width: `${NAME_COL_WIDTH}px`,
                      height: `${HEADER_HEIGHT}px`,
                      position: "sticky",
                      left: 0,
                      zIndex: 40,
                      background: "var(--color-card)",
                    }}
                  >
                    Member
                  </div>
                  {/* Date columns */}
                  {ALL_DATES.map(d => {
                    const ds = format(d, "yyyy-MM-dd");
                    const isToday = ds === today;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isMonthStart = d.getDate() === 1;
                    return (
                      <div
                        key={ds}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center justify-center rounded-md text-center relative",
                          isToday
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : isWeekend
                              ? "bg-muted/60 text-muted-foreground"
                              : "bg-card text-foreground border border-border/50 shadow-sm"
                        )}
                        style={{
                          width: `${COL_WIDTH}px`,
                          height: `${HEADER_HEIGHT}px`,
                        }}
                      >
                        {isMonthStart && (
                          <span className="absolute -top-0.5 left-0 right-0 text-[8px] font-bold text-primary/70 uppercase tracking-wider text-center leading-none">
                            {format(d, "MMM")}
                          </span>
                        )}
                        <span className="text-[9px] uppercase tracking-wide opacity-60 leading-none mt-1">
                          {format(d, "EEE")}
                        </span>
                        <span className="text-xs font-bold leading-none mt-0.5">
                          {format(d, "d")}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ── Team sections ─────────────────────────────────────────── */}
                {((teamsData as Team[]) ?? []).map(team => {
                  const teamMembers = displayMembers.filter(
                    m => m.teamId === team.id
                  );
                  const isDropTarget =
                    overTeamId === team.id && activeDragId !== null;
                  const isSurveillance =
                    team.name === "Team 1" || team.name === "Team 2";

                  return (
                    <div key={team.id} className="mb-1">
                      {/* Team label row */}
                      <div className="flex gap-[3px] mb-[3px]">
                        <div
                          className={cn(
                            "flex-shrink-0 flex items-center px-3 h-7 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors",
                            isDropTarget
                              ? "bg-primary/20 text-primary"
                              : "bg-sidebar text-sidebar-foreground"
                          )}
                          style={{
                            width: `${NAME_COL_WIDTH}px`,
                            position: "sticky",
                            left: 0,
                            zIndex: 20,
                            background: isDropTarget
                              ? undefined
                              : "var(--color-sidebar)",
                          }}
                        >
                          {team.name}
                        </div>
                        {ALL_DATES.map(d => (
                          <div
                            key={format(d, "yyyy-MM-dd")}
                            className={cn(
                              "flex-shrink-0 h-7 rounded-md",
                              isDropTarget ? "bg-primary/10" : "bg-sidebar/50"
                            )}
                            style={{ width: `${COL_WIDTH}px` }}
                          />
                        ))}
                      </div>

                      {/* Member rows */}
                      <SortableContext
                        items={teamMembers.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {teamMembers.map(member => (
                          <SortableMemberRow
                            key={member.id}
                            member={member}
                            allDates={ALL_DATES}
                            today={today}
                            shiftMap={shiftMap}
                            isAdmin={isAdmin}
                            isDragging={activeDragId === member.id}
                            bulkMode={bulkMode}
                            bulkCopyMode={bulkCopyMode}
                            copiedBlock={copiedBlock}
                            selectedCells={selectedCells}
                            nameColWidth={NAME_COL_WIDTH}
                            colWidth={COL_WIDTH}
                            rowHeight={ROW_HEIGHT}
                            clipboard={clipboard}
                            onCellTap={handleCellTap}
                            onCellPointerDown={handleCellPointerDown}
                            onCellPointerEnter={handleCellPointerEnter}
                            onCopyCell={handleCopyCell}
                            onPasteCell={handlePasteCell}
                          />
                        ))}
                        {isAdmin && activeDragId !== null && (
                          <TeamDropZoneRow
                            key={`dropzone-${team.id}`}
                            teamId={team.id}
                            totalWidth={totalContentWidth}
                            isActive={isDropTarget}
                          />
                        )}
                      </SortableContext>

                      {/* On Duty row */}
                      <div className="flex gap-[3px] mt-[3px] mb-2">
                        <div
                          className="flex-shrink-0 flex items-center px-3 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest text-slate-400"
                          style={{
                            width: `${NAME_COL_WIDTH}px`,
                            position: "sticky",
                            left: 0,
                            zIndex: 20,
                            background: "#1e293b",
                          }}
                        >
                          On Duty
                        </div>
                        {ALL_DATES.map(d => {
                          const ds = format(d, "yyyy-MM-dd");
                          const isToday = ds === today;
                          const count = teamMembers.filter(m =>
                            ON_DUTY_CODES.has(
                              shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                            )
                          ).length;
                          const numClass = isSurveillance
                            ? count > 5
                              ? "text-emerald-400"
                              : count === 5
                                ? "text-yellow-400"
                                : count >= 1
                                  ? "text-red-400"
                                  : "text-slate-600"
                            : count >= 5
                              ? "text-emerald-400"
                              : count >= 1
                                ? "text-slate-300"
                                : "text-slate-600";
                          return (
                            <div
                              key={ds}
                              className={cn(
                                "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                                isToday ? "bg-primary/20" : "bg-slate-800/70"
                              )}
                              style={{ width: `${COL_WIDTH}px` }}
                            >
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  numClass
                                )}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* On Call row */}
                      <div className="flex gap-[3px] mt-[3px] mb-2">
                        <div
                          className="flex-shrink-0 flex items-center px-3 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest text-slate-400"
                          style={{
                            width: `${NAME_COL_WIDTH}px`,
                            position: "sticky",
                            left: 0,
                            zIndex: 20,
                            background: "#334155",
                          }}
                        >
                          On Call
                        </div>
                        {ALL_DATES.map(d => {
                          const ds = format(d, "yyyy-MM-dd");
                          const isToday = ds === today;
                          const count = teamMembers.filter(m =>
                            ON_CALL_CODES.has(
                              shiftMap.get(m.id)?.get(ds)?.shiftCode ?? ""
                            )
                          ).length;
                          const numClass =
                            count >= 5 ? "text-emerald-400" : "text-red-400";
                          return (
                            <div
                              key={ds}
                              className={cn(
                                "flex-shrink-0 h-9 rounded-md flex items-center justify-center",
                                isToday ? "bg-primary/20" : "bg-slate-700/60"
                              )}
                              style={{ width: `${COL_WIDTH}px` }}
                            >
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  numClass
                                )}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <DragOverlay>
                {activeMember ? (
                  <div
                    className="flex items-center gap-2 px-3 h-11 bg-card border border-primary/40 rounded-md shadow-xl text-sm font-medium"
                    style={{ width: `${NAME_COL_WIDTH}px` }}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {activeMember.name}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* ── Bottom slider (Excel-style) ────────────────────────────────────── */}
        <div className="flex-shrink-0 pt-2 pb-1 px-1">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalContentWidth - nameColWidthForGrid)}
            value={scrollLeft}
            onChange={e => {
              const v = Number(e.target.value);
              setScrollLeft(v);
              if (scrollRef.current) scrollRef.current.scrollLeft = v;
            }}
            className="w-full h-2 accent-primary cursor-pointer"
            style={{ appearance: "auto" }}
          />
        </div>

        {/* ── Cell edit sheet ───────────────────────────────────────────────── */}
        {editSheet && (
          <ShiftEditSheet
            open={editSheet.open}
            memberName={editSheet.memberName}
            date={editSheet.date}
            currentCode={editSheet.currentCode}
            currentComment={editSheet.currentComment}
            currentIsActing={editSheet.currentIsActing}
            currentShiftTime={editSheet.currentShiftTime}
            isAdmin={isAdmin}
            onClose={() => setEditSheet(null)}
            onSaveShift={(code, shiftTime) => {
              updateShift.mutate({
                memberId: editSheet.memberId,
                shiftDate: editSheet.date,
                shiftCode: code as ShiftCode,
                shiftTime: shiftTime ?? null,
                memberName: editSheet.memberName,
              });
            }}
            onSaveAnnotation={(comment, isActing) =>
              handleSaveAnnotation(
                editSheet.memberId,
                editSheet.date,
                editSheet.currentCode,
                comment,
                isActing
              )
            }
            onCopyShift={() => {
              const shift = shiftMap
                .get(editSheet.memberId)
                ?.get(editSheet.date);
              handleCopyCell(shift);
            }}
          />
        )}

        {/* ── Bulk apply sheet ──────────────────────────────────────────────── */}
        <BulkApplySheet
          open={bulkSheetOpen}
          count={selectedCells.size}
          onClose={() => setBulkSheetOpen(false)}
          onApply={handleBulkApply}
        />

        <BulkCopySheet
          open={bulkCopyOpen}
          members={displayMembers}
          onClose={() => setBulkCopyOpen(false)}
          onCopy={(sourceMemberId, targetMemberIds, startDate, endDate) =>
            bulkCopy.mutate({
              sourceMemberId,
              targetMemberIds,
              startDate,
              endDate,
            })
          }
          isLoading={bulkCopy.isPending}
        />

        <RepeatCycleSheet
          open={repeatCycleOpen}
          members={displayMembers}
          teams={(teamsData as Team[]) ?? []}
          onClose={() => setRepeatCycleOpen(false)}
          onApply={(sourceMemberId, fillUntilDate, copyToTeam) =>
            repeatCycle.mutate({
              sourceMemberId,
              sourceMemberName: displayMembers.find(
                m => m.id === sourceMemberId
              )?.name,
              fillUntilDate,
              copyToTeam,
            })
          }
          isLoading={repeatCycle.isPending}
          result={repeatCycleResult}
        />
      </div>
    </DashboardLayout>
  );
}

/* ── Team drop zone ───────────────────────────────────────────────────────── */
function TeamDropZoneRow({
  teamId,
  totalWidth,
  isActive,
}: {
  teamId: number;
  totalWidth: number;
  isActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `team-zone-${teamId}` });
  return (
    <div
      ref={setNodeRef}
      style={{ width: `${totalWidth}px` }}
      className={cn(
        "h-8 rounded-md border-2 border-dashed transition-all duration-150 mb-[3px]",
        isOver || isActive
          ? "border-primary/60 bg-primary/10"
          : "border-transparent"
      )}
    >
      {(isOver || isActive) && (
        <span className="flex items-center justify-center h-full text-[10px] text-primary/70 font-medium">
          Drop to add to this team
        </span>
      )}
    </div>
  );
}

/* ── Plain member row (mobile — no DnD hooks) ────────────────────────────── */
function MemberRow({
  member,
  allDates,
  today,
  shiftMap,
  isAdmin,
  bulkMode,
  bulkCopyMode,
  copiedBlock,
  selectedCells,
  nameColWidth,
  colWidth,
  rowHeight,
  clipboard,
  onCellTap,
  onCellPointerDown,
  onCellPointerEnter,
  onCopyCell,
  onPasteCell,
}: {
  member: Member;
  allDates: Date[];
  today: string;
  shiftMap: Map<number, Map<string, ShiftData>>;
  isAdmin: boolean;
  bulkMode: boolean;
  bulkCopyMode: boolean;
  copiedBlock: {
    cells: {
      memberId: number;
      date: string;
      shiftCode: string;
      comment: string;
      isActing: boolean;
    }[];
    memberIds: number[];
    dates: string[];
  } | null;
  selectedCells: Map<string, { memberId: number; date: string }>;
  nameColWidth: number;
  colWidth: number;
  rowHeight: number;
  clipboard: { code: string; comment: string; isActing: boolean } | null;
  onCellTap: (
    memberId: number,
    memberName: string,
    date: string,
    shift: ShiftData | undefined
  ) => void;
  onCellPointerDown: (memberId: number, date: string) => void;
  onCellPointerEnter: (memberId: number, date: string) => void;
  onCopyCell: (shift: ShiftData | undefined) => void;
  onPasteCell: (memberId: number, date: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "3px", marginBottom: "3px" }}>
      {/* Frozen name cell */}
      <div
        className="flex-shrink-0 flex items-center bg-card rounded-md shadow-sm border border-border/50 overflow-hidden"
        style={{
          width: `${nameColWidth}px`,
          height: `${rowHeight}px`,
          position: "sticky",
          left: 0,
          zIndex: 10,
          background: "var(--color-card)",
        }}
      >
        <span className="flex-1 truncate text-sm font-medium text-foreground pl-3 pr-2">
          {member.name}
        </span>
      </div>

      {/* Shift cells */}
      {allDates.map(d => {
        const ds = format(d, "yyyy-MM-dd");
        const shift = shiftMap.get(member.id)?.get(ds);
        const code = shift?.shiftCode ?? "";
        const isToday = ds === today;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const cellKey = `${member.id}-${ds}`;
        const isSelected = selectedCells.has(cellKey);
        const hasComment = !!shift?.comment;
        const isActing = shift?.isActing ?? false;
        const label = SHIFT_LABELS[code as keyof typeof SHIFT_LABELS];
        const time =
          shift?.shiftTime ??
          SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ??
          "";
        const isPasteMode =
          !!clipboard && isAdmin && !bulkMode && !bulkCopyMode && !copiedBlock;
        const isBlockPasteMode = !!copiedBlock && isAdmin;
        const isBulkCopySelected = bulkCopyMode && isSelected;
        return (
          <button
            key={ds}
            style={{
              width: `${colWidth}px`,
              height: `${rowHeight}px`,
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            className={cn(
              "rounded-md relative overflow-hidden transition-all duration-100 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isPasteMode && "cursor-copy",
              isBlockPasteMode && "cursor-crosshair",
              code
                ? cn(shiftClass(code), "shadow-sm")
                : cn(
                    isToday
                      ? "bg-primary/10"
                      : isWeekend
                        ? "bg-muted/40"
                        : "bg-muted/20",
                    "hover:bg-muted/50"
                  ),
              isToday && code && "ring-2 ring-primary ring-offset-1",
              isActing && !isSelected && "ring-2 ring-amber-400 ring-offset-1",
              isSelected &&
                !isBulkCopySelected &&
                "ring-2 ring-primary ring-offset-1 brightness-90",
              isBulkCopySelected &&
                "ring-2 ring-blue-400 ring-offset-1 brightness-90"
            )}
            onClick={() => {
              if (isPasteMode) {
                onPasteCell(member.id, ds);
                return;
              }
              onCellTap(member.id, member.name, ds, shift);
            }}
            onContextMenu={e => {
              if (isAdmin && !bulkMode && !bulkCopyMode) {
                e.preventDefault();
                onCopyCell(shift);
              }
            }}
            onPointerDown={e => {
              e.stopPropagation();
              onCellPointerDown(member.id, ds);
            }}
            onPointerEnter={() => onCellPointerEnter(member.id, ds)}
          >
            {code && !isSelected && (
              <span className="absolute inset-x-1 bottom-1 text-[7px] leading-tight opacity-90 truncate text-center block font-medium">
                {label}
                {time ? ` · ${time}` : ""}
              </span>
            )}
            {hasComment && !isSelected && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
            )}
            {isActing && !isSelected && (
              <span className="absolute top-1 left-1">
                <Star className="w-2.5 h-2.5 text-amber-300 fill-amber-300 drop-shadow" />
              </span>
            )}
            {isSelected && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-5 h-5 rounded-full bg-primary/90 flex items-center justify-center shadow-sm">
                  <CheckSquare2 className="w-3 h-3 text-white" />
                </span>
              </span>
            )}
            {!code && !isSelected && isAdmin && (
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/20 text-base font-light">
                +
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Sortable member row ──────────────────────────────────────────────────── */
function SortableMemberRow({
  member,
  allDates,
  today,
  shiftMap,
  isAdmin,
  isDragging,
  bulkMode,
  bulkCopyMode,
  copiedBlock,
  selectedCells,
  nameColWidth,
  colWidth,
  rowHeight,
  clipboard,
  onCellTap,
  onCellPointerDown,
  onCellPointerEnter,
  onCopyCell,
  onPasteCell,
}: {
  member: Member;
  allDates: Date[];
  today: string;
  shiftMap: Map<number, Map<string, ShiftData>>;
  isAdmin: boolean;
  isDragging: boolean;
  bulkMode: boolean;
  bulkCopyMode: boolean;
  copiedBlock: {
    cells: {
      memberId: number;
      date: string;
      shiftCode: string;
      comment: string;
      isActing: boolean;
    }[];
    memberIds: number[];
    dates: string[];
  } | null;
  selectedCells: Map<string, { memberId: number; date: string }>;
  nameColWidth: number;
  colWidth: number;
  rowHeight: number;
  clipboard: { code: string; comment: string; isActing: boolean } | null;
  onCellTap: (
    memberId: number,
    memberName: string,
    date: string,
    shift: ShiftData | undefined
  ) => void;
  onCellPointerDown: (memberId: number, date: string) => void;
  onCellPointerEnter: (memberId: number, date: string) => void;
  onCopyCell: (shift: ShiftData | undefined) => void;
  onPasteCell: (memberId: number, date: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: member.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: "flex", gap: "3px", marginBottom: "3px" }}
      className={cn(isDragging && "opacity-30")}
    >
      {/* Frozen name cell */}
      <div
        className="flex-shrink-0 flex items-center bg-card rounded-md shadow-sm border border-border/50 overflow-hidden"
        style={{
          width: `${nameColWidth}px`,
          height: `${rowHeight}px`,
          position: "sticky",
          left: 0,
          zIndex: 10,
          background: "var(--color-card)",
        }}
      >
        {isAdmin && (
          <button
            {...attributes}
            {...listeners}
            className="flex-shrink-0 flex items-center justify-center w-8 h-full text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors focus:outline-none touch-none"
            tabIndex={-1}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <span
          className={cn(
            "flex-1 truncate text-sm font-medium text-foreground pr-2",
            !isAdmin && "pl-3"
          )}
        >
          {member.name}
        </span>
      </div>

      {/* Shift cells */}
      {allDates.map(d => {
        const ds = format(d, "yyyy-MM-dd");
        const shift = shiftMap.get(member.id)?.get(ds);
        const code = shift?.shiftCode ?? "";
        const isToday = ds === today;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const cellKey = `${member.id}-${ds}`;
        const isSelected = selectedCells.has(cellKey);
        const hasComment = !!shift?.comment;
        const isActing = shift?.isActing ?? false;
        const label = SHIFT_LABELS[code as keyof typeof SHIFT_LABELS];
        const time =
          shift?.shiftTime ??
          SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ??
          "";
        const isPasteMode =
          !!clipboard && isAdmin && !bulkMode && !bulkCopyMode && !copiedBlock;
        const isBlockPasteMode = !!copiedBlock && isAdmin;
        const isBulkCopySelected = bulkCopyMode && isSelected;
        return (
          <button
            key={ds}
            data-no-dnd="true"
            style={{
              width: `${colWidth}px`,
              height: `${rowHeight}px`,
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            className={cn(
              "rounded-md relative overflow-hidden transition-all duration-100 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isPasteMode && "cursor-copy",
              isBlockPasteMode && "cursor-crosshair",
              code
                ? cn(shiftClass(code), "shadow-sm")
                : cn(
                    isToday
                      ? "bg-primary/10"
                      : isWeekend
                        ? "bg-muted/40"
                        : "bg-muted/20",
                    "hover:bg-muted/50"
                  ),
              isToday && code && "ring-2 ring-primary ring-offset-1",
              isActing && !isSelected && "ring-2 ring-amber-400 ring-offset-1",
              isSelected &&
                !isBulkCopySelected &&
                "ring-2 ring-primary ring-offset-1 brightness-90",
              isBulkCopySelected &&
                "ring-2 ring-blue-400 ring-offset-1 brightness-90"
            )}
            onClick={() => {
              if (isPasteMode) {
                onPasteCell(member.id, ds);
                return;
              }
              onCellTap(member.id, member.name, ds, shift);
            }}
            onContextMenu={e => {
              if (isAdmin && !bulkMode && !bulkCopyMode) {
                e.preventDefault();
                onCopyCell(shift);
              }
            }}
            onPointerDown={e => {
              e.stopPropagation();
              onCellPointerDown(member.id, ds);
            }}
            onPointerEnter={() => onCellPointerEnter(member.id, ds)}
          >
            {code && !isSelected && (
              <span className="absolute inset-x-1 bottom-1 text-[7px] leading-tight opacity-90 truncate text-center block font-medium">
                {label}
                {time ? ` · ${time}` : ""}
              </span>
            )}
            {hasComment && !isSelected && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
            )}
            {isActing && !isSelected && (
              <span className="absolute top-1 left-1">
                <Star className="w-2.5 h-2.5 text-amber-300 fill-amber-300 drop-shadow" />
              </span>
            )}
            {isSelected && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-5 h-5 rounded-full bg-primary/90 flex items-center justify-center shadow-sm">
                  <CheckSquare2 className="w-3 h-3 text-white" />
                </span>
              </span>
            )}
            {!code && !isSelected && isAdmin && (
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/20 text-base font-light">
                +
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
