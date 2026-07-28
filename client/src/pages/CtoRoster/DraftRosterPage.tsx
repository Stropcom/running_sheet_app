import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Lock,
  ChevronLeft,
  ChevronRight,
  CheckSquare2,
  Star,
  CalendarDays,
  Copy,
  ClipboardPaste,
  GitMerge,
  Trash2,
  Pencil,
  Plus,
  UserPlus,
  FolderPlus,
  Layers,
  Save,
  Settings2,
} from "lucide-react";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
  ON_DUTY_CODES,
  ON_CALL_CODES,
} from "@shared/ctoRosterShiftUtils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import {
  format,
  eachDayOfInterval,
  parseISO,
  isValid,
  addMonths,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────────
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

const LOCKED_CODES = ["l", "c"] as const;
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
  isLocked,
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
  isLocked: boolean;
  onClose: () => void;
  onSaveShift: (code: ShiftCode, shiftTime: string | null) => void;
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
    const newTime = SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
    setShiftTime(newTime);
  };

  const handleApply = () => {
    onSaveShift(pendingCode, shiftTime || null);
    onClose();
  };

  const content = (
    <div className="flex flex-col gap-4 py-2">
      <div className="text-sm text-muted-foreground">
        {memberName} · {safeFormat(date, "EEE d MMM yyyy")}
      </div>

      {isLocked ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            This cell is{" "}
            <strong>{currentCode === "l" ? "Leave" : "Court"}</strong> and is
            locked in the draft. Update the main roster first, then re-open this
            draft.
          </span>
        </div>
      ) : (
        <>
          {/* Acting toggle */}
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <Star className="h-4 w-4 text-amber-500" />
            <Label
              htmlFor="draft-acting"
              className="flex-1 cursor-pointer text-sm font-medium"
            >
              Acting
            </Label>
            <Switch
              id="draft-acting"
              checked={pendingActing}
              onCheckedChange={setPendingActing}
            />
          </div>

          {/* Shift selector */}
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

          {/* Time picker */}
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
                (SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] ??
                  "") && (
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

          {/* Comment */}
          <Textarea
            placeholder="Notes (optional)"
            value={pendingComment}
            onChange={e => setPendingComment(e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />

          <Button onClick={handleApply} className="w-full">
            Apply
          </Button>
        </>
      )}
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
            <SheetTitle>Edit Shift (Draft)</SheetTitle>
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
          <DialogTitle>Edit Shift (Draft)</DialogTitle>
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
          id="draft-bulk-acting-only"
          checked={actingOnly}
          onCheckedChange={setActingOnly}
        />
        <Label
          htmlFor="draft-bulk-acting-only"
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
            htmlFor="draft-bulk-acting"
            className="flex-1 cursor-pointer text-sm"
          >
            Mark as Acting
          </Label>
          <Switch
            id="draft-bulk-acting"
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
            <SheetTitle>Bulk Edit (Draft)</SheetTitle>
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
          <DialogTitle>Bulk Edit (Draft)</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// ── Main DraftRosterPage ─────────────────────────────────────────────────────
export default function DraftRosterPage() {
  const [, params] = useRoute("/cto-roster/draft/:draftId");
  const [, navigate] = useLocation();
  const draftId = params?.draftId ? parseInt(params.draftId, 10) : null;
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const utils = trpc.useUtils();

  // ── Data queries ────────────────────────────────────────────────────────────
  const draftQuery = trpc.ctoRoster.draft.get.useQuery(
    { draftId: draftId! },
    { enabled: !!draftId }
  );
  const draft = draftQuery.data;
  const isStandalone = (draft as any)?.draftType === "standalone";

  // For seeded drafts: use live teams/members. For standalone: use draft-owned ones.
  const teamsQuery = trpc.ctoRoster.teams.list.useQuery({
    enabled: !isStandalone,
  } as any);
  const membersQuery = trpc.ctoRoster.members.list.useQuery({
    enabled: !isStandalone,
  } as any);
  const draftTeamsQuery = trpc.ctoRoster.draft.getTeamsAndMembers.useQuery(
    { draftId: draftId! },
    { enabled: !!draftId && isStandalone }
  );
  const draftShiftsQuery = trpc.ctoRoster.draft.getShifts.useQuery(
    { draftId: draftId! },
    { enabled: !!draftId }
  );

  // ── Standalone team/member edit state ──────────────────────────────────────
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
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraftName, setRenameDraftName] = useState("");
  const [timeframeOpen, setTimeframeOpen] = useState(false);
  const [tfStart, setTfStart] = useState("");
  const [tfEnd, setTfEnd] = useState("");

  // ── Derived date range ──────────────────────────────────────────────────────
  const allDates = useMemo(() => {
    if (!draft?.startDate || !draft?.endDate) return [];
    try {
      const start =
        typeof draft.startDate === "string"
          ? parseISO(draft.startDate)
          : (draft.startDate as Date);
      const end =
        typeof draft.endDate === "string"
          ? parseISO(draft.endDate)
          : (draft.endDate as Date);
      if (!isValid(start) || !isValid(end)) return [];
      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [draft?.startDate, draft?.endDate]);

  // ── Month navigation ────────────────────────────────────────────────────────
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

  // ── Shift map ───────────────────────────────────────────────────────────────
  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftData>();
    for (const s of draftShiftsQuery.data ?? []) {
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
  }, [draftShiftsQuery.data]);

  // ── Teams & members ─────────────────────────────────────────────────────────
  const teams = useMemo(() => {
    if (isStandalone)
      return (draftTeamsQuery.data?.teams ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder);
    return (teamsQuery.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [isStandalone, teamsQuery.data, draftTeamsQuery.data]);
  const members = useMemo(() => {
    if (isStandalone)
      return (draftTeamsQuery.data?.members ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder);
    return (membersQuery.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [isStandalone, membersQuery.data, draftTeamsQuery.data]);
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
    isLocked: boolean;
  }>({
    open: false,
    memberId: 0,
    memberName: "",
    date: "",
    currentCode: "",
    currentComment: "",
    currentIsActing: false,
    isLocked: false,
  });

  // ── Bulk edit state ─────────────────────────────────────────────────────────
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const isDraggingSelection = useRef(false);
  const dragStartCell = useRef<string | null>(null);

  // ── Bulk copy state ──────────────────────────────────────────────────────────
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

  // ── Scroll ref ──────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);

  // ── Expiry info ─────────────────────────────────────────────────────────────
  const expiryInfo = useMemo(() => {
    if (!draft?.expiresAt) return null;
    const exp =
      typeof draft.expiresAt === "string"
        ? parseISO(draft.expiresAt)
        : (draft.expiresAt as Date);
    if (!isValid(exp)) return null;
    const daysLeft = Math.ceil(
      (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return {
      exp,
      daysLeft,
      isExpired: daysLeft <= 0,
      isWarning: daysLeft <= 3 && daysLeft > 0,
    };
  }, [draft?.expiresAt]);

  // ── Standalone mutations ────────────────────────────────────────────────────
  const addTeamMutation = trpc.ctoRoster.draft.addTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.draft.getTeamsAndMembers.invalidate({
        draftId: draftId!,
      });
      setAddTeamOpen(false);
      setAddTeamName("");
      toast.success("Team added.");
    },
    onError: err => toast.error(err.message),
  });
  const renameTeamMutation = trpc.ctoRoster.draft.renameTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.draft.getTeamsAndMembers.invalidate({
        draftId: draftId!,
      });
      setRenameTeamOpen(false);
      toast.success("Team renamed.");
    },
    onError: err => toast.error(err.message),
  });
  const deleteTeamMutation = trpc.ctoRoster.draft.deleteTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.draft.getTeamsAndMembers.invalidate({
        draftId: draftId!,
      });
      utils.ctoRoster.draft.getShifts.invalidate({ draftId: draftId! });
      toast.success("Team deleted.");
    },
    onError: err => toast.error(err.message),
  });
  const addMemberMutation = trpc.ctoRoster.draft.addMember.useMutation({
    onSuccess: () => {
      utils.ctoRoster.draft.getTeamsAndMembers.invalidate({
        draftId: draftId!,
      });
      setAddMemberOpen(false);
      setAddMemberName("");
      toast.success("Member added.");
    },
    onError: err => toast.error(err.message),
  });
  const renameMemberMutation = trpc.ctoRoster.draft.renameMember.useMutation({
    onSuccess: () => {
      utils.ctoRoster.draft.getTeamsAndMembers.invalidate({
        draftId: draftId!,
      });
      setRenameMemberOpen(false);
      toast.success("Member renamed.");
    },
    onError: err => toast.error(err.message),
  });
  const deleteMemberMutation = trpc.ctoRoster.draft.deleteMember.useMutation({
    onSuccess: () => {
      utils.ctoRoster.draft.getTeamsAndMembers.invalidate({
        draftId: draftId!,
      });
      utils.ctoRoster.draft.getShifts.invalidate({ draftId: draftId! });
      toast.success("Member deleted.");
    },
    onError: err => toast.error(err.message),
  });
  const saveAsRosterMutation = trpc.ctoRoster.draft.saveAsRoster.useMutation({
    onSuccess: data => {
      toast.success("Saved as roster!");
      utils.ctoRoster.savedRoster.list.invalidate();
      setSaveAsOpen(false);
      navigate(`/cto-roster/saved-roster/${data.savedRosterId}`);
    },
    onError: err => toast.error(err.message),
  });
  const renameDraftMutation = trpc.ctoRoster.draft.rename.useMutation({
    onSuccess: () => {
      toast.success("Draft renamed.");
      utils.ctoRoster.draft.get.invalidate({ draftId: draftId! });
      utils.ctoRoster.draft.list.invalidate();
      setRenameOpen(false);
    },
    onError: err => toast.error(err.message),
  });
  const setTimeframeMutation = trpc.ctoRoster.draft.setTimeframe.useMutation({
    onSuccess: () => {
      toast.success("Timeframe updated.");
      utils.ctoRoster.draft.get.invalidate({ draftId: draftId! });
      utils.ctoRoster.draft.list.invalidate();
      setTimeframeOpen(false);
    },
    onError: err => toast.error(err.message),
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const upsertShiftMutation = trpc.ctoRoster.draft.upsertShift.useMutation({
    onSuccess: () =>
      utils.ctoRoster.draft.getShifts.invalidate({ draftId: draftId! }),
    onError: err => toast.error(err.message),
  });

  const bulkUpsertMutation = trpc.ctoRoster.draft.bulkUpsert.useMutation({
    onSuccess: data => {
      utils.ctoRoster.draft.getShifts.invalidate({ draftId: draftId! });
      if (data.skipped > 0)
        toast.warning(`${data.skipped} locked cell(s) skipped (Leave/Court).`);
    },
    onError: err => toast.error(err.message),
  });

  const deleteDraftMutation = trpc.ctoRoster.draft.delete.useMutation({
    onSuccess: () => {
      toast.success("Draft deleted.");
      navigate("/cto-roster/drafts");
    },
    onError: err => toast.error(err.message),
  });

  // ── Cell tap ────────────────────────────────────────────────────────────────
  // ── Bulk copy handlers ──────────────────────────────────────────────────────────
  const handlePasteBlock = useCallback(
    (targetMemberId: number, targetDate: string) => {
      if (!copiedBlock || !draftId) return;
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
      bulkUpsertMutation.mutate({
        draftId,
        shifts: shifts.map(s => ({
          ...s,
          shiftCode: s.shiftCode as ShiftCode,
        })),
        actingOnly: false,
      });
      toast.success(
        `Pasted ${shifts.length} cell${shifts.length !== 1 ? "s" : ""}`
      );
      setCopiedBlock(null);
    },
    [copiedBlock, draftId, visualRowMembers, allDates, bulkUpsertMutation]
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
      const code = shift?.shiftCode ?? "";
      const isLocked = !isStandalone && (code === "l" || code === "c");
      setEditSheet({
        open: true,
        memberId,
        memberName,
        date,
        currentCode: code,
        currentComment: shift?.comment ?? "",
        currentIsActing: shift?.isActing ?? false,
        currentShiftTime: shift?.shiftTime ?? null,
        isLocked,
      });
    },
    [bulkEditMode, bulkCopyMode, copiedBlock, handlePasteBlock, shiftMap]
  );

  // ── Drag-select ───────────────────────────────────────────────────────────────
  const handleCellPointerDown = useCallback(
    (memberId: number, date: string) => {
      if (!bulkEditMode && !bulkCopyMode) return;
      isDraggingSelection.current = true;
      dragStartCell.current = `${memberId}_${date}`;
      setSelectedCells(prev => {
        const next = new Set(prev);
        const key = `${memberId}_${date}`;
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
      dragStartCell.current = null;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // ── Save shift ──────────────────────────────────────────────────────────────
  const handleSaveShift = useCallback(
    (code: ShiftCode, shiftTime: string | null) => {
      if (!draftId) return;
      upsertShiftMutation.mutate({
        draftId,
        memberId: editSheet.memberId,
        shiftDate: editSheet.date,
        shiftCode: code,
        shiftTime: shiftTime ?? null,
        comment: editSheet.currentComment,
        isActing: editSheet.currentIsActing,
      });
    },
    [draftId, editSheet, upsertShiftMutation]
  );

  // ── Bulk apply ──────────────────────────────────────────────────────────────
  const handleBulkApply = useCallback(
    (
      code: ShiftCode,
      isActing: boolean,
      actingOnly: boolean,
      shiftTime: string | null
    ) => {
      if (!draftId || selectedCells.size === 0) return;
      const shifts = Array.from(selectedCells).map(key => {
        const [memberId, shiftDate] = key.split("_");
        return {
          memberId: parseInt(memberId, 10),
          shiftDate,
          shiftCode: code,
          isActing,
          shiftTime,
        };
      });
      bulkUpsertMutation.mutate({ draftId, shifts, actingOnly });
      setSelectedCells(new Set());
      setBulkEditMode(false);
    },
    [draftId, selectedCells, bulkUpsertMutation]
  );

  // ── Scroll sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const grid = scrollRef.current;
    const bar = scrollbarRef.current;
    if (!grid || !bar) return;
    const syncBar = () => {
      bar.scrollLeft = grid.scrollLeft;
    };
    const syncGrid = () => {
      grid.scrollLeft = bar.scrollLeft;
    };
    grid.addEventListener("scroll", syncBar);
    bar.addEventListener("scroll", syncGrid);
    return () => {
      grid.removeEventListener("scroll", syncBar);
      bar.removeEventListener("scroll", syncGrid);
    };
  }, []);

  // ── Scroll to today on load ─────────────────────────────────────────────────
  useEffect(() => {
    if (
      !draftShiftsQuery.data ||
      !scrollRef.current ||
      visibleDates.length === 0
    )
      return;
    const today = format(new Date(), "yyyy-MM-dd");
    const idx = visibleDates.findIndex(d => format(d, "yyyy-MM-dd") === today);
    if (idx >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, idx * COL_WIDTH - 100);
    }
  }, [draftShiftsQuery.data, visibleDates]);

  // ── Loading / error states ──────────────────────────────────────────────────
  if (!draftId)
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Invalid draft ID.</div>
      </DashboardLayout>
    );
  if (draftQuery.isLoading || teamsQuery.isLoading || membersQuery.isLoading) {
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
  if (!draft)
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Draft not found.</div>
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
        {/* ── Banner ─────────────────────────────────────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "shrink-0 px-4 py-2.5 flex items-center gap-3",
            isStandalone
              ? "bg-purple-600 text-white"
              : "bg-amber-500 text-amber-950"
          )}
        >
          {isStandalone ? (
            <Layers className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base leading-tight flex items-center gap-2">
              {isStandalone ? "STANDALONE DRAFT" : "DRAFT"} — {draft.name}
            </div>
            <div className="text-xs opacity-80">
              {safeFormat(draft.startDate, "d MMM yyyy")} –{" "}
              {safeFormat(draft.endDate, "d MMM yyyy")}
              {" · "}Created by {draft.createdByName ?? "Admin"}
              {!isStandalone && expiryInfo && (
                <span
                  className={cn(
                    "ml-2 font-semibold",
                    expiryInfo.isExpired
                      ? "text-red-800"
                      : expiryInfo.isWarning
                        ? "text-amber-900"
                        : ""
                  )}
                >
                  {expiryInfo.isExpired
                    ? "⚠ EXPIRED"
                    : expiryInfo.isWarning
                      ? `⚠ Expires in ${expiryInfo.daysLeft} day${expiryInfo.daysLeft !== 1 ? "s" : ""}`
                      : `Expires ${safeFormat(expiryInfo.exp, "d MMM yyyy")}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {isStandalone ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/20 border-white/40 text-white hover:bg-white/30 text-xs h-8"
                  onClick={() => {
                    setEditPanelOpen(true);
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  Edit Structure
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/20 border-white/40 text-white hover:bg-white/30 text-xs h-8"
                  onClick={() => {
                    setSaveAsName(draft.name);
                    setSaveAsOpen(true);
                  }}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save as Roster
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="bg-amber-100 border-amber-700 text-amber-900 hover:bg-amber-200 text-xs h-8"
                onClick={() => navigate(`/cto-roster/draft/${draftId}/merge`)}
              >
                <GitMerge className="h-3.5 w-3.5 mr-1" />
                Merge
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "text-xs h-8",
                isStandalone
                  ? "bg-white/20 border-white/40 text-white hover:bg-white/30"
                  : "bg-red-100 border-red-400 text-red-800 hover:bg-red-200"
              )}
              onClick={() => {
                if (confirm("Delete this draft? This cannot be undone."))
                  deleteDraftMutation.mutate({ draftId: draftId! });
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>
        </div>

        {/* ── Sub-banner: lock notice (seeded) or standalone info ─────────────────────────── */}
        {isStandalone ? (
          <div className="shrink-0 bg-purple-50 border-b border-purple-200 px-4 py-1.5 flex items-center gap-2 text-xs text-purple-800">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span>
              Standalone draft — has its own teams and members. Use{" "}
              <strong>Edit Structure</strong> to add/rename/delete teams and
              members.
            </span>
          </div>
        ) : (
          <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-800">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Leave and Court shifts are <strong>locked</strong> in this draft —
              update the main roster first.
            </span>
          </div>
        )}

        {/* ── Edit Structure Dialog (standalone only) ───────────────────────────────────── */}
        <Dialog open={editPanelOpen} onOpenChange={setEditPanelOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Edit Draft Structure
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {/* Rename draft */}
              <div className="rounded-lg border p-3 flex flex-col gap-2">
                <div className="text-sm font-semibold">Draft Name</div>
                <div className="flex gap-2">
                  <Input
                    value={renameDraftName || draft.name}
                    onChange={e => setRenameDraftName(e.target.value)}
                    placeholder={draft.name}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!renameDraftName.trim()) return;
                      renameDraftMutation.mutate({
                        draftId: draftId!,
                        name: renameDraftName.trim(),
                      });
                    }}
                    disabled={renameDraftMutation.isPending}
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
                        tfStart || safeFormat(draft.startDate, "yyyy-MM-dd")
                      }
                      onChange={e => setTfStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Input
                      type="date"
                      className="mt-1"
                      value={tfEnd || safeFormat(draft.endDate, "yyyy-MM-dd")}
                      onChange={e => setTfEnd(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="self-end"
                  onClick={() => {
                    const s =
                      tfStart || safeFormat(draft.startDate, "yyyy-MM-dd");
                    const e2 = tfEnd || safeFormat(draft.endDate, "yyyy-MM-dd");
                    if (s > e2) {
                      toast.error("Start must be before end.");
                      return;
                    }
                    setTimeframeMutation.mutate({
                      draftId: draftId!,
                      startDate: s,
                      endDate: e2,
                    });
                  }}
                  disabled={setTimeframeMutation.isPending}
                >
                  Update Timeframe
                </Button>
              </div>
              {/* Teams */}
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
                            `Delete team "${team.name}" and all its members? This cannot be undone.`
                          )
                        )
                          deleteTeamMutation.mutate({
                            teamId: team.id,
                            draftId: draftId!,
                          });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              {/* Members */}
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
                              if (
                                confirm(
                                  `Delete member "${m.name}"? All their shifts will be removed.`
                                )
                              )
                                deleteMemberMutation.mutate({
                                  memberId: m.id,
                                  draftId: draftId!,
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

        {/* Add Team Dialog */}
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
                    draftId: draftId!,
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

        {/* Rename Team Dialog */}
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

        {/* Add Member Dialog */}
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
                    draftId: draftId!,
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

        {/* Rename Member Dialog */}
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

        {/* Save as Roster Dialog */}
        <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Save as Named Roster</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="text-sm text-muted-foreground">
                Creates a permanent saved roster from this draft. The draft will
                remain unchanged.
              </div>
              <div>
                <Label>Roster Name</Label>
                <Input
                  className="mt-1.5"
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!saveAsName.trim()) {
                    toast.error("Name required.");
                    return;
                  }
                  saveAsRosterMutation.mutate({
                    draftId: draftId!,
                    name: saveAsName.trim(),
                  });
                }}
                disabled={saveAsRosterMutation.isPending}
              >
                {saveAsRosterMutation.isPending ? "Saving…" : "Save Roster"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Toolbar ────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b bg-background px-3 py-2 flex flex-col gap-2">
          {/* Row 1: title */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/cto-roster/drafts")}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-sm">All Drafts</span>
            </Button>
          </div>
          {/* Row 2: month nav + bulk edit */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
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
            {bulkEditMode && selectedCells.size > 0 && (
              <Button
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => setBulkSheetOpen(true)}
              >
                Apply ({selectedCells.size})
              </Button>
            )}
            {/* Bulk Copy */}
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
        <div className="flex-1 overflow-hidden relative">
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-auto"
            style={{ willChange: "scroll-position" }}
          >
            <div style={{ width: gridWidth, minHeight: "100%" }}>
              {/* Frozen date header */}
              <div
                className="sticky top-0 z-20 flex bg-background border-b"
                style={{ height: HEADER_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-30 bg-background border-r flex items-center px-3 shrink-0"
                  style={{ width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH }}
                >
                  <span className="text-xs font-semibold text-muted-foreground">
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
                        "flex flex-col items-center justify-center shrink-0 border-r text-center",
                        isToday
                          ? "bg-primary/10"
                          : isWeekend
                            ? "bg-muted/40"
                            : ""
                      )}
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          isToday ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {format(d, "EEE")}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          isToday ? "text-primary" : ""
                        )}
                      >
                        {format(d, "d")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Team rows */}
              {teams.map(team => {
                const teamMembers = membersByTeam.get(team.id) ?? [];
                // On-duty count row
                const onDutyCounts = visibleDates.map(d => {
                  const ds = format(d, "yyyy-MM-dd");
                  return teamMembers.filter(m => {
                    const s = shiftMap.get(`${m.id}_${ds}`);
                    return s && Array.from(ON_DUTY_CODES).includes(s.shiftCode);
                  }).length;
                });
                const onCallCounts = visibleDates.map(d => {
                  const ds = format(d, "yyyy-MM-dd");
                  return teamMembers.filter(m => {
                    const s = shiftMap.get(`${m.id}_${ds}`);
                    return s && Array.from(ON_CALL_CODES).includes(s.shiftCode);
                  }).length;
                });

                return (
                  <div key={team.id}>
                    {/* Team header */}
                    <div className="sticky left-0 z-10 bg-muted/60 border-b border-t px-3 py-1 flex items-center">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                        {team.name}
                      </span>
                    </div>

                    {/* Member rows */}
                    {teamMembers.map(member => (
                      <div
                        key={member.id}
                        className="flex border-b hover:bg-muted/20 transition-colors"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Name cell */}
                        <div
                          className="sticky left-0 z-10 bg-background border-r flex items-center px-3 shrink-0"
                          style={{
                            width: NAME_COL_WIDTH,
                            minWidth: NAME_COL_WIDTH,
                          }}
                        >
                          <span className="text-sm font-medium truncate">
                            {member.name}
                          </span>
                        </div>
                        {/* Shift cells */}
                        {visibleDates.map(d => {
                          const ds = format(d, "yyyy-MM-dd");
                          const shift = shiftMap.get(`${member.id}_${ds}`);
                          const code = shift?.shiftCode ?? "";
                          const isLocked =
                            !isStandalone && (code === "l" || code === "c");
                          const isSelected =
                            (bulkEditMode || bulkCopyMode) &&
                            selectedCells.has(`${member.id}_${ds}`);
                          const isToday = ds === today;
                          const label =
                            SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ??
                            code;
                          const time =
                            shift?.shiftTime ??
                            SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ??
                            "";

                          return (
                            <div
                              key={ds}
                              data-no-dnd="true"
                              className={cn(
                                "shrink-0 border-r flex items-center justify-center cursor-pointer select-none transition-all",
                                isToday ? "bg-primary/5" : "",
                                isSelected
                                  ? "ring-2 ring-inset ring-primary"
                                  : ""
                              )}
                              style={{
                                width: COL_WIDTH,
                                minWidth: COL_WIDTH,
                                height: ROW_HEIGHT,
                              }}
                              onClick={() =>
                                handleCellTap(member.id, member.name, ds)
                              }
                              onPointerDown={() =>
                                handleCellPointerDown(member.id, ds)
                              }
                              onPointerEnter={() =>
                                handleCellPointerEnter(member.id, ds)
                              }
                            >
                              {code ? (
                                <div
                                  className={cn(
                                    "relative w-14 h-9 rounded-lg flex flex-col items-center justify-center overflow-hidden transition-transform active:scale-95",
                                    shiftClass(code),
                                    isLocked
                                      ? "opacity-70 cursor-not-allowed"
                                      : ""
                                  )}
                                >
                                  {isLocked && (
                                    <Lock className="absolute top-0.5 right-0.5 h-2.5 w-2.5 opacity-60" />
                                  )}
                                  {shift?.isActing && (
                                    <Star className="absolute top-0.5 left-0.5 h-2.5 w-2.5 text-amber-400" />
                                  )}
                                  <span
                                    className="text-[11px] font-bold leading-none"
                                    style={{ color: "rgba(0,0,0,0.9)" }}
                                  >
                                    {label}
                                  </span>
                                  {time && (
                                    <span
                                      className="text-[9px] leading-none mt-0.5"
                                      style={{ color: "rgba(0,0,0,0.75)" }}
                                    >
                                      {time}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="w-14 h-9 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/20" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {/* On Duty summary row */}
                    <div
                      className="flex border-b bg-muted/10"
                      style={{ height: 32 }}
                    >
                      <div
                        className="sticky left-0 z-10 bg-muted/10 border-r flex items-center px-3 shrink-0"
                        style={{
                          width: NAME_COL_WIDTH,
                          minWidth: NAME_COL_WIDTH,
                        }}
                      >
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          On Duty
                        </span>
                      </div>
                      {onDutyCounts.map((count, i) => (
                        <div
                          key={i}
                          className="shrink-0 border-r flex items-center justify-center"
                          style={{
                            width: COL_WIDTH,
                            minWidth: COL_WIDTH,
                            height: 32,
                          }}
                        >
                          <span
                            className={cn(
                              "text-xs font-bold px-1.5 py-0.5 rounded",
                              count >= 5
                                ? "text-emerald-700 bg-emerald-100"
                                : count > 0
                                  ? "text-red-700 bg-red-100"
                                  : "text-muted-foreground"
                            )}
                          >
                            {count || "—"}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* On Call summary row */}
                    <div
                      className="flex border-b bg-muted/10"
                      style={{ height: 32 }}
                    >
                      <div
                        className="sticky left-0 z-10 bg-muted/10 border-r flex items-center px-3 shrink-0"
                        style={{
                          width: NAME_COL_WIDTH,
                          minWidth: NAME_COL_WIDTH,
                        }}
                      >
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          On Call
                        </span>
                      </div>
                      {onCallCounts.map((count, i) => (
                        <div
                          key={i}
                          className="shrink-0 border-r flex items-center justify-center"
                          style={{
                            width: COL_WIDTH,
                            minWidth: COL_WIDTH,
                            height: 32,
                          }}
                        >
                          <span
                            className={cn(
                              "text-xs font-bold px-1.5 py-0.5 rounded",
                              count >= 5
                                ? "text-emerald-700 bg-emerald-100"
                                : count > 0
                                  ? "text-red-700 bg-red-100"
                                  : "text-muted-foreground"
                            )}
                          >
                            {count || "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Bottom scrollbar ───────────────────────────────────────────────── */}
        <div className="shrink-0 border-t bg-background" style={{ height: 16 }}>
          <div
            ref={scrollbarRef}
            className="h-full overflow-x-auto overflow-y-hidden"
          >
            <div style={{ width: gridWidth, height: 1 }} />
          </div>
        </div>

        {/* ── Edit popup ─────────────────────────────────────────────────────── */}
        <ShiftEditSheet
          open={editSheet.open}
          memberName={editSheet.memberName}
          date={editSheet.date}
          currentCode={editSheet.currentCode}
          currentComment={editSheet.currentComment}
          currentIsActing={editSheet.currentIsActing}
          currentShiftTime={editSheet.currentShiftTime}
          isLocked={editSheet.isLocked}
          onClose={() => setEditSheet(s => ({ ...s, open: false }))}
          onSaveShift={handleSaveShift}
        />

        {/* ── Bulk apply sheet ───────────────────────────────────────────────── */}
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
