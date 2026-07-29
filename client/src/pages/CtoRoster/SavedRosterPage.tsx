import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckSquare2,
  Star,
  CalendarDays,
  Trash2,
  Pencil,
  Plus,
  UserPlus,
  FolderPlus,
  Settings2,
  ShieldCheck,
  Lock,
  Copy,
  ClipboardPaste,
  FileDown,
} from "lucide-react";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
  ON_DUTY_CODES,
  ON_CALL_CODES,
} from "@shared/ctoRosterShiftUtils";
import { PrintRosterView } from "@/components/PrintRosterView";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  format,
  eachDayOfInterval,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from "date-fns";

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
type ShiftData = {
  memberId: number;
  shiftDate: string;
  shiftCode: string;
  shiftTime?: string | null;
  comment?: string | null;
  isActing?: boolean;
};

const COL_WIDTH = 68;
const NAME_COL_WIDTH = 152;
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 44;

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

// ── Shift edit popup ─────────────────────────────────────────────────────────
function ShiftEditSheet({
  open,
  memberName,
  date,
  currentCode,
  currentComment,
  currentIsActing,
  currentShiftTime,
  onClose,
  onSaveShift,
}: {
  open: boolean;
  memberName: string;
  date: string;
  currentCode: string;
  currentComment: string;
  currentIsActing: boolean;
  currentShiftTime?: string | null;
  onClose: () => void;
  onSaveShift: (
    code: ShiftCode,
    shiftTime: string | null,
    comment: string,
    isActing: boolean
  ) => void;
}) {
  const isMobile = useIsMobile();
  const [pendingCode, setPendingCode] = useState<ShiftCode>(
    currentCode as ShiftCode
  );
  const [pendingComment, setPendingComment] = useState(currentComment);
  const [pendingActing, setPendingActing] = useState(currentIsActing);
  const [shiftTime, setShiftTime] = useState(currentShiftTime ?? "");

  useEffect(() => {
    if (open) {
      setPendingCode(currentCode as ShiftCode);
      setPendingComment(currentComment);
      setPendingActing(currentIsActing);
      setShiftTime(currentShiftTime ?? "");
    }
  }, [open, currentCode, currentComment, currentIsActing, currentShiftTime]);

  const handleShiftSelect = (code: ShiftCode) => {
    setPendingCode(code);
    setShiftTime(SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "");
  };

  const content = (
    <div className="flex flex-col gap-4 py-2">
      <div className="text-sm text-muted-foreground">
        {memberName} · {safeFormat(date, "EEE d MMM yyyy")}
      </div>
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
        <Star className="h-4 w-4 text-amber-500" />
        <Label
          htmlFor="saved-acting"
          className="flex-1 cursor-pointer text-sm font-medium"
        >
          Acting
        </Label>
        <Switch
          id="saved-acting"
          checked={pendingActing}
          onCheckedChange={setPendingActing}
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(SHIFT_CODES as readonly string[]).map(code => (
          <button
            key={code}
            onClick={() => handleShiftSelect(code as ShiftCode)}
            className={cn(
              "rounded-lg px-2 py-2 text-xs font-semibold transition-all active:scale-95",
              shiftClass(code),
              pendingCode === code
                ? "ring-2 ring-offset-1 ring-primary scale-105"
                : "opacity-80 hover:opacity-100"
            )}
          >
            <div className="font-bold">{code.toUpperCase()}</div>
            <div className="text-[10px] opacity-80 leading-tight">
              {SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code}
            </div>
          </button>
        ))}
        <button
          onClick={() => handleShiftSelect("" as ShiftCode)}
          className={cn(
            "rounded-lg px-2 py-2 text-xs font-semibold transition-all active:scale-95 border-2 border-dashed border-muted-foreground/30",
            pendingCode === ""
              ? "ring-2 ring-offset-1 ring-primary scale-105 bg-muted"
              : "opacity-60 hover:opacity-100"
          )}
        >
          <div className="font-bold text-muted-foreground">—</div>
          <div className="text-[10px] opacity-80 leading-tight text-muted-foreground">
            Clear
          </div>
        </button>
      </div>
      {pendingCode !== "" && (
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0">Start Time</Label>
          <input
            type="time"
            value={shiftTime}
            onChange={e => setShiftTime(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          {shiftTime !==
            (SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] ?? "") && (
            <button
              onClick={() =>
                setShiftTime(
                  SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] ?? ""
                )
              }
              className="text-xs text-muted-foreground underline"
            >
              Reset
            </button>
          )}
        </div>
      )}
      <Textarea
        placeholder="Notes (optional)"
        value={pendingComment}
        onChange={e => setPendingComment(e.target.value)}
        rows={2}
        className="text-sm resize-none"
      />
      <Button
        onClick={() => {
          onSaveShift(
            pendingCode,
            shiftTime || null,
            pendingComment,
            pendingActing
          );
          onClose();
        }}
        className="w-full"
      >
        Apply
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-8"
        >
          <SheetHeader className="mb-2">
            <SheetTitle>Edit Shift</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Shift</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Apply Sheet ─────────────────────────────────────────────────────────
function BulkApplySheet({
  open,
  selectedCount,
  onClose,
  onApply,
}: {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (
    code: ShiftCode,
    isActing: boolean,
    actingOnly: boolean,
    shiftTime: string | null
  ) => void;
}) {
  const isMobile = useIsMobile();
  const [pendingCode, setPendingCode] = useState<ShiftCode>("d");
  const [pendingActing, setPendingActing] = useState(false);
  const [actingOnly, setActingOnly] = useState(false);
  const [shiftTime, setShiftTime] = useState(SHIFT_TIMES["d"] ?? "");

  useEffect(() => {
    if (open) {
      setPendingCode("d");
      setPendingActing(false);
      setActingOnly(false);
      setShiftTime(SHIFT_TIMES["d"] ?? "");
    }
  }, [open]);

  const handleShiftSelect = (code: ShiftCode) => {
    setPendingCode(code);
    setShiftTime(SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "");
  };

  const content = (
    <div className="flex flex-col gap-4 py-2">
      <div className="text-sm text-muted-foreground">
        {selectedCount} cell{selectedCount !== 1 ? "s" : ""} selected
      </div>
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
        <Switch
          id="saved-bulk-acting-only"
          checked={actingOnly}
          onCheckedChange={setActingOnly}
        />
        <Label
          htmlFor="saved-bulk-acting-only"
          className="cursor-pointer text-sm"
        >
          Acting only (don't change shift code)
        </Label>
      </div>
      {!actingOnly && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {(SHIFT_CODES as readonly string[]).map(code => (
              <button
                key={code}
                onClick={() => handleShiftSelect(code as ShiftCode)}
                className={cn(
                  "rounded-lg px-2 py-2 text-xs font-semibold transition-all active:scale-95",
                  shiftClass(code),
                  pendingCode === code
                    ? "ring-2 ring-offset-1 ring-primary scale-105"
                    : "opacity-80 hover:opacity-100"
                )}
              >
                <div className="font-bold">{code.toUpperCase()}</div>
                <div className="text-[10px] opacity-80 leading-tight">
                  {SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code}
                </div>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Start Time</Label>
            <input
              type="time"
              value={shiftTime}
              onChange={e => setShiftTime(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            {shiftTime !==
              (SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] ?? "") && (
              <button
                onClick={() =>
                  setShiftTime(
                    SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] ?? ""
                  )
                }
                className="text-xs text-muted-foreground underline"
              >
                Reset
              </button>
            )}
          </div>
        </>
      )}
      {!actingOnly && (
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <Star className="h-4 w-4 text-amber-500" />
          <Label
            htmlFor="saved-bulk-acting"
            className="flex-1 cursor-pointer text-sm"
          >
            Mark as Acting
          </Label>
          <Switch
            id="saved-bulk-acting"
            checked={pendingActing}
            onCheckedChange={setPendingActing}
          />
        </div>
      )}
      <Button
        onClick={() => {
          onApply(pendingCode, pendingActing, actingOnly, shiftTime || null);
          onClose();
        }}
        className="w-full"
      >
        Apply to {selectedCount} cell{selectedCount !== 1 ? "s" : ""}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-8"
        >
          <SheetHeader className="mb-2">
            <SheetTitle>Bulk Edit (Saved Roster)</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bulk Edit (Saved Roster)</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// ── Main SavedRosterPage ─────────────────────────────────────────────────────
export default function SavedRosterPage() {
  const [, params] = useRoute("/cto-roster/saved-roster/:id");
  const [, navigate] = useLocation();
  const rosterId = params?.id ? parseInt(params.id, 10) : null;
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const utils = trpc.useUtils();

  const rosterQuery = trpc.ctoRoster.savedRoster.get.useQuery(
    { id: rosterId! },
    { enabled: !!rosterId }
  );
  const roster = rosterQuery.data;

  const shiftsQuery = trpc.ctoRoster.savedRoster.getShifts.useQuery(
    { id: rosterId! },
    { enabled: !!rosterId }
  );
  const teamsQuery = trpc.ctoRoster.savedRoster.getTeamsAndMembers.useQuery(
    { id: rosterId! },
    { enabled: !!rosterId }
  );

  // ── Derived date range ──────────────────────────────────────────────────────
  const allDates = useMemo(() => {
    if (!roster?.startDate || !roster?.endDate) return [];
    try {
      const start =
        typeof roster.startDate === "string"
          ? parseISO(roster.startDate)
          : (roster.startDate as Date);
      const end =
        typeof roster.endDate === "string"
          ? parseISO(roster.endDate)
          : (roster.endDate as Date);
      if (!isValid(start) || !isValid(end)) return [];
      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [roster?.startDate, roster?.endDate]);

  const [viewMonthIdx, setViewMonthIdx] = useState(0);
  const months = useMemo(() => {
    if (allDates.length === 0) return [];
    const seen = new Set<string>();
    const result: Date[] = [];
    for (const d of allDates) {
      const key = format(d, "yyyy-MM");
      if (!seen.has(key)) {
        seen.add(key);
        result.push(startOfMonth(d));
      }
    }
    return result;
  }, [allDates]);

  const visibleDates = useMemo(() => {
    if (months.length === 0) return allDates;
    const m = months[viewMonthIdx];
    if (!m) return allDates;
    const mEnd = endOfMonth(m);
    return allDates.filter(d => isWithinInterval(d, { start: m, end: mEnd }));
  }, [allDates, months, viewMonthIdx]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftData>();
    for (const s of shiftsQuery.data ?? []) {
      const dateStr =
        typeof s.shiftDate === "string"
          ? s.shiftDate
          : (s.shiftDate as Date).toISOString().slice(0, 10);
      map.set(`${s.memberId}_${dateStr}`, {
        memberId: s.memberId,
        shiftDate: dateStr,
        shiftCode: s.shiftCode,
        shiftTime: s.shiftTime,
        comment: s.comment,
        isActing: s.isActing,
      });
    }
    return map;
  }, [shiftsQuery.data]);

  const teams = useMemo(
    () =>
      (teamsQuery.data?.teams ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [teamsQuery.data]
  );
  const members = useMemo(
    () =>
      (teamsQuery.data?.members ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [teamsQuery.data]
  );

  // ── Codes actually used in the roster (for legend) ──────────────────────────
  const usedCodes = useMemo(() => {
    const seen = new Set<string>();
    for (const s of shiftsQuery.data ?? []) {
      if (s.shiftCode) seen.add(s.shiftCode);
    }
    // Return in canonical order
    return SHIFT_CODES.filter(c => seen.has(c));
  }, [shiftsQuery.data]);
  const membersByTeam = useMemo(() => {
    const map = new Map<number, Member[]>();
    for (const m of members) {
      if (!map.has(m.teamId)) map.set(m.teamId, []);
      map.get(m.teamId)!.push(m);
    }
    return map;
  }, [members]);

  // Visual row order: teams in sortOrder, then members within each team in sortOrder.
  // Must be used for bulk-copy delta calculations to match the grid render order.
  const visualRowMembers = useMemo(
    () =>
      teams.flatMap(t =>
        (membersByTeam.get(t.id) ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
      ),
    [teams, membersByTeam]
  );

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editSheet, setEditSheet] = useState<{
    open: boolean;
    memberId: number;
    memberName: string;
    date: string;
    currentCode: string;
    currentComment: string;
    currentIsActing: boolean;
    currentShiftTime?: string | null;
  }>({
    open: false,
    memberId: 0,
    memberName: "",
    date: "",
    currentCode: "",
    currentComment: "",
    currentIsActing: false,
  });

  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkCopyMode, setBulkCopyMode] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState<{
    cells: {
      memberId: number;
      date: string;
      shiftCode: string;
      shiftTime: string | null;
      isActing: boolean;
    }[];
    memberIds: number[];
    dates: string[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingSelection = useRef(false);

  // ── Structure edit state ────────────────────────────────────────────────────
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addTeamName, setAddTeamName] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberName, setAddMemberName] = useState("");
  const [addMemberTeamId, setAddMemberTeamId] = useState<number | null>(null);
  const [renameTeamOpen, setRenameTeamOpen] = useState(false);
  const [renameTeamId, setRenameTeamId] = useState<number | null>(null);
  const [renameTeamName, setRenameTeamName] = useState("");
  const [renameMemberOpen, setRenameMemberOpen] = useState(false);
  const [renameMemberId, setRenameMemberId] = useState<number | null>(null);
  const [renameMemberName, setRenameMemberName] = useState("");
  const [renameRosterOpen, setRenameRosterOpen] = useState(false);
  const [renameRosterName, setRenameRosterName] = useState("");
  const [tfStart, setTfStart] = useState("");
  const [tfEnd, setTfEnd] = useState("");

  // ── Mutations ───────────────────────────────────────────────────────────────
  const upsertShiftMutation =
    trpc.ctoRoster.savedRoster.upsertShift.useMutation({
      onSuccess: () =>
        utils.ctoRoster.savedRoster.getShifts.invalidate({ id: rosterId! }),
      onError: err => toast.error(err.message),
    });

  const addTeamMutation = trpc.ctoRoster.savedRoster.addTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.savedRoster.getTeamsAndMembers.invalidate({
        id: rosterId!,
      });
      setAddTeamOpen(false);
      setAddTeamName("");
      toast.success("Team added.");
    },
    onError: err => toast.error(err.message),
  });
  const renameTeamMutation = trpc.ctoRoster.savedRoster.renameTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.savedRoster.getTeamsAndMembers.invalidate({
        id: rosterId!,
      });
      setRenameTeamOpen(false);
      toast.success("Team renamed.");
    },
    onError: err => toast.error(err.message),
  });
  const deleteTeamMutation = trpc.ctoRoster.savedRoster.deleteTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.savedRoster.getTeamsAndMembers.invalidate({
        id: rosterId!,
      });
      utils.ctoRoster.savedRoster.getShifts.invalidate({ id: rosterId! });
      toast.success("Team deleted.");
    },
    onError: err => toast.error(err.message),
  });
  const addMemberMutation = trpc.ctoRoster.savedRoster.addMember.useMutation({
    onSuccess: () => {
      utils.ctoRoster.savedRoster.getTeamsAndMembers.invalidate({
        id: rosterId!,
      });
      setAddMemberOpen(false);
      setAddMemberName("");
      toast.success("Member added.");
    },
    onError: err => toast.error(err.message),
  });
  const renameMemberMutation =
    trpc.ctoRoster.savedRoster.renameMember.useMutation({
      onSuccess: () => {
        utils.ctoRoster.savedRoster.getTeamsAndMembers.invalidate({
          id: rosterId!,
        });
        setRenameMemberOpen(false);
        toast.success("Member renamed.");
      },
      onError: err => toast.error(err.message),
    });
  const deleteMemberMutation =
    trpc.ctoRoster.savedRoster.deleteMember.useMutation({
      onSuccess: () => {
        utils.ctoRoster.savedRoster.getTeamsAndMembers.invalidate({
          id: rosterId!,
        });
        utils.ctoRoster.savedRoster.getShifts.invalidate({ id: rosterId! });
        toast.success("Member deleted.");
      },
      onError: err => toast.error(err.message),
    });
  const deleteRosterMutation = trpc.ctoRoster.savedRoster.delete.useMutation({
    onSuccess: () => {
      toast.success("Roster deleted.");
      navigate("/cto-roster/saved-rosters");
    },
    onError: err => toast.error(err.message),
  });
  const renameRosterMutation = trpc.ctoRoster.savedRoster.rename.useMutation({
    onSuccess: () => {
      utils.ctoRoster.savedRoster.get.invalidate({ id: rosterId! });
      utils.ctoRoster.savedRoster.list.invalidate();
      setRenameRosterOpen(false);
      toast.success("Roster renamed.");
    },
    onError: err => toast.error(err.message),
  });
  const setTimeframeMutation =
    trpc.ctoRoster.savedRoster.setTimeframe.useMutation({
      onSuccess: () => {
        utils.ctoRoster.savedRoster.get.invalidate({ id: rosterId! });
        utils.ctoRoster.savedRoster.list.invalidate();
        toast.success("Timeframe updated.");
      },
      onError: err => toast.error(err.message),
    });

  const bulkUpsertMutation = trpc.ctoRoster.savedRoster.bulkUpsert.useMutation({
    onSuccess: () =>
      utils.ctoRoster.savedRoster.getShifts.invalidate({ id: rosterId! }),
    onError: err => toast.error(err.message),
  });

  const handleBulkApply = useCallback(
    (
      code: ShiftCode,
      isActing: boolean,
      actingOnly: boolean,
      shiftTime: string | null
    ) => {
      if (!rosterId || selectedCells.size === 0) return;
      const shifts = Array.from(selectedCells).map(key => {
        const [memberId, shiftDate] = key.split("_");
        return {
          memberId: parseInt(memberId, 10),
          shiftDate,
          shiftCode: actingOnly ? (undefined as unknown as string) : code,
          isActing,
          shiftTime,
        };
      });
      if (actingOnly) {
        // Acting-only: only set isActing on existing shifts, don't change code
        const actingShifts = Array.from(selectedCells)
          .map(key => {
            const [memberId, shiftDate] = key.split("_");
            const existing = shiftMap.get(key);
            return {
              memberId: parseInt(memberId, 10),
              shiftDate,
              shiftCode: (existing?.shiftCode ?? "") as ShiftCode,
              isActing: true,
              shiftTime: existing?.shiftTime ?? null,
            };
          })
          .filter(s => s.shiftCode !== "");
        if (actingShifts.length > 0)
          bulkUpsertMutation.mutate({
            savedRosterId: rosterId,
            shifts: actingShifts,
          });
      } else {
        bulkUpsertMutation.mutate({
          savedRosterId: rosterId,
          shifts: shifts.map(s => ({ ...s, shiftCode: code, shiftTime })),
        });
      }
      setSelectedCells(new Set());
      setBulkEditMode(false);
    },
    [rosterId, selectedCells, bulkUpsertMutation, shiftMap]
  );

  const handlePasteBlock = useCallback(
    (targetMemberId: number, targetDate: string) => {
      if (!copiedBlock || !rosterId) return;
      const { cells, memberIds, dates } = copiedBlock;
      // Use visualRowMembers (team-grouped order) so row deltas match the grid
      const anchorMemberIdx = visualRowMembers.findIndex(
        m => m.id === memberIds[0]
      );
      const anchorDateIdx = allDates.findIndex(
        d => format(d, "yyyy-MM-dd") === dates[0]
      );
      const targetMemberIdx = visualRowMembers.findIndex(
        m => m.id === targetMemberId
      );
      const targetDateIdx = allDates.findIndex(
        d => format(d, "yyyy-MM-dd") === targetDate
      );
      const rowDelta = targetMemberIdx - anchorMemberIdx;
      const colDelta = targetDateIdx - anchorDateIdx;
      const shifts: {
        memberId: number;
        shiftDate: string;
        shiftCode: string;
        shiftTime: string | null;
        isActing: boolean;
      }[] = [];
      for (const cell of cells) {
        const srcMemberIdx = visualRowMembers.findIndex(
          m => m.id === cell.memberId
        );
        const srcDateIdx = allDates.findIndex(
          d => format(d, "yyyy-MM-dd") === cell.date
        );
        const dstMemberIdx = srcMemberIdx + rowDelta;
        const dstDateIdx = srcDateIdx + colDelta;
        if (dstMemberIdx < 0 || dstMemberIdx >= visualRowMembers.length)
          continue;
        if (dstDateIdx < 0 || dstDateIdx >= allDates.length) continue;
        shifts.push({
          memberId: visualRowMembers[dstMemberIdx].id,
          shiftDate: format(allDates[dstDateIdx], "yyyy-MM-dd"),
          shiftCode: cell.shiftCode,
          shiftTime: cell.shiftTime,
          isActing: cell.isActing,
        });
      }
      if (shifts.length === 0) {
        toast.error("No cells to paste — target out of range.");
        return;
      }
      bulkUpsertMutation.mutate({ savedRosterId: rosterId, shifts });
      toast.success(
        `Pasted ${shifts.length} cell${shifts.length !== 1 ? "s" : ""}`
      );
      setCopiedBlock(null);
    },
    [copiedBlock, rosterId, visualRowMembers, allDates, bulkUpsertMutation]
  );

  const handleCopyBlock = useCallback(() => {
    if (selectedCells.size === 0) return;
    const cellList = Array.from(selectedCells).map(k => {
      const [mid, dt] = k.split("_");
      return { memberId: parseInt(mid, 10), date: dt };
    });
    // Sort by visual row order (team grouping) so anchor is always top-left cell
    const memberIds = Array.from(new Set(cellList.map(c => c.memberId))).sort(
      (a, b) =>
        visualRowMembers.findIndex(m => m.id === a) -
        visualRowMembers.findIndex(m => m.id === b)
    );
    const dates = Array.from(new Set(cellList.map(c => c.date))).sort();
    const enriched = cellList.map(c => ({
      memberId: c.memberId,
      date: c.date,
      shiftCode: shiftMap.get(`${c.memberId}_${c.date}`)?.shiftCode ?? "",
      shiftTime: shiftMap.get(`${c.memberId}_${c.date}`)?.shiftTime ?? null,
      isActing: shiftMap.get(`${c.memberId}_${c.date}`)?.isActing ?? false,
    }));
    setCopiedBlock({ cells: enriched, memberIds, dates });
    setBulkCopyMode(false);
    setSelectedCells(new Set());
    toast.success(
      `Block copied (${cellList.length} cell${cellList.length !== 1 ? "s" : ""}) — tap a cell to paste`
    );
  }, [selectedCells, shiftMap, visualRowMembers]);

  const handleCellPointerDown = useCallback(
    (memberId: number, date: string) => {
      if (!bulkEditMode && !bulkCopyMode) return;
      isDraggingSelection.current = true;
      const key = `${memberId}_${date}`;
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [bulkEditMode, bulkCopyMode]
  );

  const handleCellPointerEnter = useCallback(
    (memberId: number, date: string) => {
      if ((!bulkEditMode && !bulkCopyMode) || !isDraggingSelection.current)
        return;
      const key = `${memberId}_${date}`;
      setSelectedCells(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [bulkEditMode, bulkCopyMode]
  );

  useEffect(() => {
    const up = () => {
      isDraggingSelection.current = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const handleCellTap = useCallback(
    (memberId: number, memberName: string, date: string) => {
      if (copiedBlock) {
        handlePasteBlock(memberId, date);
        return;
      }
      if (bulkCopyMode) {
        const key = `${memberId}_${date}`;
        setSelectedCells(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        return;
      }
      if (bulkEditMode) {
        const key = `${memberId}_${date}`;
        setSelectedCells(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        return;
      }
      const shift = shiftMap.get(`${memberId}_${date}`);
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
    [bulkEditMode, bulkCopyMode, copiedBlock, handlePasteBlock, shiftMap]
  );

  const isAdmin = user?.role === "admin";

  if (!rosterId)
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Invalid roster ID.</div>
      </DashboardLayout>
    );
  if (rosterQuery.isLoading || teamsQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }
  if (!roster)
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Roster not found.</div>
      </DashboardLayout>
    );

  const totalCols = visibleDates.length;
  const gridWidth = NAME_COL_WIDTH + totalCols * COL_WIDTH;
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <DashboardLayout>
      <div
        className="flex flex-col overflow-hidden"
        style={{ height: "calc(100vh - 0px)" }}
      >
        {/* ── Purple banner — desktop ────────────────────────────────────────── */}
        <div className="hidden sm:flex shrink-0 bg-purple-600 text-white px-4 py-2.5 items-center gap-3">
          <BookOpen className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base leading-tight">
              SAVED ROSTER — {roster.name}
            </div>
            <div className="text-xs opacity-80">
              {safeFormat(roster.startDate, "d MMM yyyy")} –{" "}
              {safeFormat(roster.endDate, "d MMM yyyy")}
              {" · "}Saved by {roster.createdByName ?? "Admin"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end print-hide">
            <Button
              size="sm"
              variant="outline"
              className="bg-white/20 border-white/40 text-white hover:bg-white/30 text-xs h-8"
              onClick={() => window.print()}
            >
              <FileDown className="h-3.5 w-3.5 mr-1" />
              Export PDF
            </Button>
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/20 border-white/40 text-white hover:bg-white/30 text-xs h-8"
                  onClick={() => setEditPanelOpen(true)}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  Edit Structure
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/20 border-white/40 text-white hover:bg-white/30 text-xs h-8"
                  onClick={() =>
                    navigate(
                      `/cto-roster/ea-compliance?scope=saved&id=${rosterId}`
                    )
                  }
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  EA Check
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/20 border-white/40 text-white hover:bg-white/30 text-xs h-8"
                  onClick={() => {
                    if (confirm("Delete this roster? This cannot be undone."))
                      deleteRosterMutation.mutate({ id: rosterId! });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
        {/* ── Purple banner — mobile compact single line ─────────────────────── */}
        <div className="sm:hidden shrink-0 bg-purple-600 text-white px-3 py-1.5 flex items-center gap-2 print-hide">
          <BookOpen className="h-4 w-4 shrink-0" />
          <span className="flex-1 min-w-0 font-semibold text-sm truncate">
            {roster.name}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              title="Export PDF"
              onClick={() => window.print()}
              className="p-1.5 rounded hover:bg-white/20 transition-colors"
            >
              <FileDown className="h-4 w-4" />
            </button>
            {isAdmin && (
              <>
                <button
                  title="Edit Structure"
                  onClick={() => setEditPanelOpen(true)}
                  className="p-1.5 rounded hover:bg-white/20 transition-colors"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                <button
                  title="EA Check"
                  onClick={() =>
                    navigate(
                      `/cto-roster/ea-compliance?scope=saved&id=${rosterId}`
                    )
                  }
                  className="p-1.5 rounded hover:bg-white/20 transition-colors"
                >
                  <ShieldCheck className="h-4 w-4" />
                </button>
                <button
                  title="Delete roster"
                  onClick={() => {
                    if (confirm("Delete this roster? This cannot be undone."))
                      deleteRosterMutation.mutate({ id: rosterId! });
                  }}
                  className="p-1.5 rounded hover:bg-white/20 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Sub-banner — desktop only ─────────────────────────────────────── */}
        <div className="hidden sm:flex shrink-0 bg-purple-50 border-b border-purple-200 px-4 py-1.5 items-center gap-2 text-xs text-purple-800 print-hide">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span>
            This is a saved roster — fully editable. Use{" "}
            <strong>Edit Structure</strong> to manage teams and members, or
            click any cell to edit shifts.
          </span>
        </div>

        {/* ── Edit Structure Dialog ──────────────────────────────────────────── */}
        <Dialog open={editPanelOpen} onOpenChange={setEditPanelOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Edit Roster Structure
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {/* Rename roster */}
              <div className="rounded-lg border p-3 flex flex-col gap-2">
                <div className="text-sm font-semibold">Roster Name</div>
                <div className="flex gap-2">
                  <Input
                    value={renameRosterName || roster.name}
                    onChange={e => setRenameRosterName(e.target.value)}
                    placeholder={roster.name}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!renameRosterName.trim()) return;
                      renameRosterMutation.mutate({
                        id: rosterId!,
                        name: renameRosterName.trim(),
                      });
                    }}
                    disabled={renameRosterMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
              {/* Timeframe */}
              <div className="rounded-lg border p-3 flex flex-col gap-2">
                <div className="text-sm font-semibold">Timeframe</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Start</Label>
                    <Input
                      type="date"
                      className="mt-1"
                      value={
                        tfStart || safeFormat(roster.startDate, "yyyy-MM-dd")
                      }
                      onChange={e => setTfStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Input
                      type="date"
                      className="mt-1"
                      value={tfEnd || safeFormat(roster.endDate, "yyyy-MM-dd")}
                      onChange={e => setTfEnd(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="self-end"
                  onClick={() => {
                    const s =
                      tfStart || safeFormat(roster.startDate, "yyyy-MM-dd");
                    const e2 =
                      tfEnd || safeFormat(roster.endDate, "yyyy-MM-dd");
                    if (s > e2) {
                      toast.error("Start must be before end.");
                      return;
                    }
                    setTimeframeMutation.mutate({
                      id: rosterId!,
                      startDate: s,
                      endDate: e2,
                    });
                  }}
                  disabled={setTimeframeMutation.isPending}
                >
                  Update Timeframe
                </Button>
              </div>
              <div className="rounded-lg border p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Teams</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddTeamOpen(true)}
                  >
                    <FolderPlus className="h-3.5 w-3.5 mr-1" />
                    Add Team
                  </Button>
                </div>
                {teams.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No teams yet.
                  </div>
                )}
                {teams.map(team => (
                  <div
                    key={team.id}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                  >
                    <span className="flex-1 text-sm font-medium">
                      {team.name}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setRenameTeamId(team.id);
                        setRenameTeamName(team.name);
                        setRenameTeamOpen(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete team "${team.name}" and all its members?`
                          )
                        )
                          deleteTeamMutation.mutate({
                            teamId: team.id,
                            savedRosterId: rosterId!,
                          });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Members</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddMemberTeamId(teams[0]?.id ?? null);
                      setAddMemberOpen(true);
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Add Member
                  </Button>
                </div>
                {teams.map(team => {
                  const teamMembers = membersByTeam.get(team.id) ?? [];
                  return (
                    <div key={team.id}>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        {team.name}
                      </div>
                      {teamMembers.length === 0 && (
                        <div className="text-xs text-muted-foreground pl-2">
                          No members
                        </div>
                      )}
                      {teamMembers.map(m => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50"
                        >
                          <span className="flex-1 text-sm">{m.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setRenameMemberId(m.id);
                              setRenameMemberName(m.name);
                              setRenameMemberOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => {
                              if (confirm(`Delete member "${m.name}"?`))
                                deleteMemberMutation.mutate({
                                  memberId: m.id,
                                  savedRosterId: rosterId!,
                                });
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Team */}
        <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Team</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label>Team Name</Label>
              <Input
                className="mt-1.5"
                value={addTeamName}
                onChange={e => setAddTeamName(e.target.value)}
                placeholder="e.g. Alpha Team"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddTeamOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!addTeamName.trim()) return;
                  addTeamMutation.mutate({
                    savedRosterId: rosterId!,
                    name: addTeamName.trim(),
                  });
                }}
                disabled={addTeamMutation.isPending}
              >
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rename Team */}
        <Dialog open={renameTeamOpen} onOpenChange={setRenameTeamOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Team</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label>New Name</Label>
              <Input
                className="mt-1.5"
                value={renameTeamName}
                onChange={e => setRenameTeamName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRenameTeamOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!renameTeamId || !renameTeamName.trim()) return;
                  renameTeamMutation.mutate({
                    teamId: renameTeamId,
                    name: renameTeamName.trim(),
                  });
                }}
                disabled={renameTeamMutation.isPending}
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Member */}
        <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Member</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div>
                <Label>Member Name</Label>
                <Input
                  className="mt-1.5"
                  value={addMemberName}
                  onChange={e => setAddMemberName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div>
                <Label>Team</Label>
                <select
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addMemberTeamId ?? ""}
                  onChange={e => setAddMemberTeamId(Number(e.target.value))}
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!addMemberName.trim() || !addMemberTeamId) return;
                  addMemberMutation.mutate({
                    savedRosterId: rosterId!,
                    teamId: addMemberTeamId,
                    name: addMemberName.trim(),
                  });
                }}
                disabled={addMemberMutation.isPending}
              >
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rename Member */}
        <Dialog open={renameMemberOpen} onOpenChange={setRenameMemberOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Member</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label>New Name</Label>
              <Input
                className="mt-1.5"
                value={renameMemberName}
                onChange={e => setRenameMemberName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRenameMemberOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!renameMemberId || !renameMemberName.trim()) return;
                  renameMemberMutation.mutate({
                    memberId: renameMemberId,
                    name: renameMemberName.trim(),
                  });
                }}
                disabled={renameMemberMutation.isPending}
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Toolbar ────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b bg-background px-3 py-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/cto-roster/saved-rosters")}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-sm">All Saved Rosters</span>
            </Button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none print-hide">
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMonthIdx(i => Math.max(0, i - 1))}
                disabled={viewMonthIdx === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[90px] text-center">
                {months[viewMonthIdx]
                  ? format(months[viewMonthIdx], "MMM yyyy")
                  : ""}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setViewMonthIdx(i => Math.min(months.length - 1, i + 1))
                }
                disabled={viewMonthIdx >= months.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {isAdmin && (
              <Button
                variant={bulkEditMode ? "default" : "outline"}
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => {
                  setBulkEditMode(v => !v);
                  setBulkCopyMode(false);
                  setSelectedCells(new Set());
                  setCopiedBlock(null);
                }}
              >
                <CheckSquare2 className="h-3.5 w-3.5 mr-1" />
                {bulkEditMode ? "Cancel" : "Bulk Edit"}
              </Button>
            )}
            {bulkEditMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => setBulkSheetOpen(true)}
              >
                Apply ({selectedCells.size})
              </Button>
            )}
            {isAdmin && (
              <button
                onClick={() => {
                  if (bulkCopyMode) {
                    setBulkCopyMode(false);
                    setSelectedCells(new Set());
                  } else {
                    setBulkCopyMode(true);
                    setBulkEditMode(false);
                    setSelectedCells(new Set());
                    setCopiedBlock(null);
                  }
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors h-8 shrink-0",
                  bulkCopyMode
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Copy className="h-3.5 w-3.5" />
                {bulkCopyMode ? `${selectedCells.size} sel` : "Bulk Copy"}
              </button>
            )}
            {bulkCopyMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 shrink-0 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={handleCopyBlock}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy ({selectedCells.size})
              </Button>
            )}
            {copiedBlock && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium h-8 shrink-0">
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
          </div>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative print-grid-scroll">
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-auto print-grid-scroll"
            style={{ willChange: "scroll-position" }}
          >
            <div style={{ width: gridWidth, minHeight: "100%" }}>
              {/* Date header */}
              <div
                className="sticky top-0 z-20 flex bg-background border-b"
                style={{ height: HEADER_HEIGHT }}
              >
                <div
                  className="shrink-0 border-r bg-muted/40 flex items-center px-3"
                  style={{ width: NAME_COL_WIDTH }}
                >
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Member
                  </span>
                </div>
                {visibleDates.map(d => {
                  const ds = format(d, "yyyy-MM-dd");
                  const isToday = ds === today;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={ds}
                      className={cn(
                        "shrink-0 flex flex-col items-center justify-center border-r text-xs",
                        isToday
                          ? "bg-primary/10 font-bold text-primary"
                          : isWeekend
                            ? "bg-muted/30 text-muted-foreground"
                            : "text-muted-foreground"
                      )}
                      style={{ width: COL_WIDTH }}
                    >
                      <div className="font-semibold">{format(d, "EEE")}</div>
                      <div>{format(d, "d")}</div>
                    </div>
                  );
                })}
              </div>

              {/* Team rows */}
              {teams.map(team => {
                const teamMembers = membersByTeam.get(team.id) ?? [];
                const onDutyByDate = new Map<string, number>();
                const onCallByDate = new Map<string, number>();
                for (const m of teamMembers) {
                  for (const d of visibleDates) {
                    const ds = format(d, "yyyy-MM-dd");
                    const s = shiftMap.get(`${m.id}_${ds}`);
                    if (s?.shiftCode && ON_DUTY_CODES.has(s.shiftCode))
                      onDutyByDate.set(ds, (onDutyByDate.get(ds) ?? 0) + 1);
                    if (s?.shiftCode && ON_CALL_CODES.has(s.shiftCode))
                      onCallByDate.set(ds, (onCallByDate.get(ds) ?? 0) + 1);
                  }
                }
                return (
                  <div key={team.id}>
                    {/* Team header */}
                    <div
                      className="flex items-center bg-muted/60 border-b border-t"
                      style={{ height: 32 }}
                    >
                      <div
                        className="shrink-0 px-3 flex items-center"
                        style={{ width: NAME_COL_WIDTH }}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {team.name}
                        </span>
                      </div>
                      {visibleDates.map(d => (
                        <div
                          key={format(d, "yyyy-MM-dd")}
                          className="shrink-0 border-r bg-muted/20"
                          style={{ width: COL_WIDTH, height: 32 }}
                        />
                      ))}
                    </div>
                    {/* Member rows */}
                    {teamMembers.map(member => (
                      <div
                        key={member.id}
                        className="flex border-b hover:bg-muted/20 transition-colors"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <div
                          className="shrink-0 border-r flex items-center px-3 bg-background"
                          style={{ width: NAME_COL_WIDTH }}
                        >
                          <span className="text-sm font-medium truncate">
                            {member.name}
                          </span>
                        </div>
                        {visibleDates.map(d => {
                          const ds = format(d, "yyyy-MM-dd");
                          const shift = shiftMap.get(`${member.id}_${ds}`);
                          const code = shift?.shiftCode ?? "";
                          const isWeekend =
                            d.getDay() === 0 || d.getDay() === 6;
                          const isToday = ds === today;
                          const isSelected =
                            (bulkEditMode || bulkCopyMode) &&
                            selectedCells.has(`${member.id}_${ds}`);
                          return (
                            <div
                              key={ds}
                              className={cn(
                                "shrink-0 border-r flex items-center justify-center cursor-pointer transition-all",
                                isToday
                                  ? "bg-primary/5"
                                  : isWeekend
                                    ? "bg-muted/20"
                                    : "",
                                isSelected
                                  ? "ring-2 ring-inset ring-primary"
                                  : ""
                              )}
                              style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                              onClick={() =>
                                isAdmin &&
                                handleCellTap(member.id, member.name, ds)
                              }
                              onPointerDown={() =>
                                isAdmin && handleCellPointerDown(member.id, ds)
                              }
                              onPointerEnter={() =>
                                isAdmin && handleCellPointerEnter(member.id, ds)
                              }
                            >
                              {code ? (
                                <div
                                  className={cn(
                                    "rounded-md px-1.5 py-0.5 text-xs font-bold text-center min-w-[36px]",
                                    shiftClass(code),
                                    shift?.isActing
                                      ? "ring-2 ring-amber-400"
                                      : ""
                                  )}
                                >
                                  <div>{code.toUpperCase()}</div>
                                  {shift?.shiftTime && (
                                    <div className="text-[9px] opacity-80 font-normal">
                                      {shift.shiftTime.slice(0, 5)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="w-8 h-6 rounded border-2 border-dashed border-muted-foreground/20" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* On Duty summary */}
                    <div
                      className="flex border-b bg-green-50/50"
                      style={{ height: 28 }}
                    >
                      <div
                        className="shrink-0 border-r flex items-center px-3"
                        style={{ width: NAME_COL_WIDTH }}
                      >
                        <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">
                          On Duty
                        </span>
                      </div>
                      {visibleDates.map(d => {
                        const ds = format(d, "yyyy-MM-dd");
                        const count = onDutyByDate.get(ds) ?? 0;
                        return (
                          <div
                            key={ds}
                            className="shrink-0 border-r flex items-center justify-center"
                            style={{ width: COL_WIDTH, height: 28 }}
                          >
                            {count > 0 && (
                              <span className="text-[10px] font-bold text-green-700">
                                {count}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* On Call summary */}
                    <div
                      className="flex border-b bg-blue-50/50"
                      style={{ height: 28 }}
                    >
                      <div
                        className="shrink-0 border-r flex items-center px-3"
                        style={{ width: NAME_COL_WIDTH }}
                      >
                        <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">
                          On Call
                        </span>
                      </div>
                      {visibleDates.map(d => {
                        const ds = format(d, "yyyy-MM-dd");
                        const count = onCallByDate.get(ds) ?? 0;
                        return (
                          <div
                            key={ds}
                            className="shrink-0 border-r flex items-center justify-center"
                            style={{ width: COL_WIDTH, height: 28 }}
                          >
                            {count > 0 && (
                              <span className="text-[10px] font-bold text-blue-700">
                                {count}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Shift Legend ─────────────────────────────────────────────────── */}
        {usedCodes.length > 0 && (
          <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Shift Legend
            </div>
            <div className="flex flex-wrap gap-2">
              {usedCodes.map(code => (
                <div key={code} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold min-w-[28px] text-center",
                      shiftClass(code)
                    )}
                  >
                    {code.toUpperCase()}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Print view (hidden in screen, shown in print) ──────────────────── */}
        <PrintRosterView
          rosterName={roster.name}
          startDate={roster.startDate}
          endDate={roster.endDate}
          createdByName={roster.createdByName}
          teams={teams}
          members={members}
          shiftMap={shiftMap}
        />

        {/* Shift edit sheet */}
        <ShiftEditSheet
          open={editSheet.open}
          memberName={editSheet.memberName}
          date={editSheet.date}
          currentCode={editSheet.currentCode}
          currentComment={editSheet.currentComment}
          currentIsActing={editSheet.currentIsActing}
          currentShiftTime={editSheet.currentShiftTime}
          onClose={() => setEditSheet(s => ({ ...s, open: false }))}
          onSaveShift={(code, shiftTime, comment, isActing) => {
            upsertShiftMutation.mutate({
              savedRosterId: rosterId!,
              memberId: editSheet.memberId,
              shiftDate: editSheet.date,
              shiftCode: code,
              shiftTime,
              comment,
              isActing,
            });
          }}
        />

        {/* Bulk apply sheet */}
        <BulkApplySheet
          open={bulkSheetOpen}
          selectedCount={selectedCells.size}
          onClose={() => setBulkSheetOpen(false)}
          onApply={handleBulkApply}
        />
      </div>
    </DashboardLayout>
  );
}
