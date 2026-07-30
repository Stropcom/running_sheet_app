import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  format,
  addDays,
  startOfToday,
  eachDayOfInterval,
  isWeekend,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Binoculars,
  ChevronLeft,
  ChevronRight,
  Users,
  Sun,
  Moon,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Settings,
} from "lucide-react";
import { SHIFT_LABELS, shiftClass } from "@shared/ctoRosterShiftUtils";
import DashboardLayout from "@/components/DashboardLayout";

// ── Thresholds (fallback defaults — overridden by DB settings) ────────────────
const TEAM_MINIMUMS: Record<string, number> = {
  "Team 1": 5,
  "Team 2": 5,
  PTT: 2,
  Capability: 1,
};
const DEFAULT_MIN = 3; // fallback for any other team

// Day-shift codes (includes day on-call)
const DAY_CODES = new Set(["d", "doc"]);
// Arvo-shift codes (includes arvo on-call)
const ARVO_CODES = new Set(["a", "aoc", "ad"]);
// On-duty codes (all active shifts)
const ON_DUTY_CODES = new Set(["d", "a", "ad", "adoc", "aoc", "doc"]);
// On-call codes
const ON_CALL_CODES = new Set(["o", "doc", "adoc", "aoc"]);
// Days of week where on-call is always shown (0=Sun,1=Mon,5=Fri,6=Sat)
const ON_CALL_DAYS = new Set([0, 1, 5, 6]);
const ON_CALL_MIN = 5;

// ── Timeframe helpers ─────────────────────────────────────────────────────────
type Timeframe = "1w" | "2w" | "1m" | "custom";

function getDateRange(
  tf: Timeframe,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = startOfToday();
  if (tf === "1w")
    return {
      start: format(today, "yyyy-MM-dd"),
      end: format(addDays(today, 6), "yyyy-MM-dd"),
    };
  if (tf === "2w")
    return {
      start: format(today, "yyyy-MM-dd"),
      end: format(addDays(today, 13), "yyyy-MM-dd"),
    };
  if (tf === "1m")
    return {
      start: format(today, "yyyy-MM-dd"),
      end: format(addDays(today, 29), "yyyy-MM-dd"),
    };
  return {
    start: customStart || format(today, "yyyy-MM-dd"),
    end: customEnd || format(addDays(today, 13), "yyyy-MM-dd"),
  };
}

// ── Day detail drawer ─────────────────────────────────────────────────────────
type DayDetail = {
  date: string;
  teams: {
    teamId: number;
    teamName: string;
    members: {
      id: number;
      name: string;
      shiftCode: string;
      shiftTime: string | null;
    }[];
    onDuty: number;
    dayCount: number;
    arvoCount: number;
    min: number;
    deployable: boolean;
  }[];
  onCall: {
    count: number;
    min: number;
    deployable: boolean;
    show: boolean;
    members: {
      id: number;
      name: string;
      shiftCode: string;
      shiftTime: string | null;
    }[];
  };
};

function DayDetailDrawer({
  detail,
  onClose,
}: {
  detail: DayDetail | null;
  onClose: () => void;
}) {
  if (!detail) return null;
  const d = new Date(detail.date + "T00:00:00");
  return (
    <Sheet
      open={!!detail}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            {format(d, "EEEE, d MMMM yyyy")}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          {detail.teams.map(team => (
            <div
              key={team.teamId}
              className="rounded-xl border border-border/60 overflow-hidden"
            >
              <div
                className={cn(
                  "flex items-center justify-between px-3 py-2",
                  team.deployable
                    ? "bg-emerald-50 border-b border-emerald-200"
                    : "bg-red-50 border-b border-red-200"
                )}
              >
                <div className="flex items-center gap-2">
                  {team.deployable ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-semibold text-sm">{team.teamName}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "font-bold",
                      team.deployable ? "text-emerald-700" : "text-red-600"
                    )}
                  >
                    {team.onDuty} / {team.min} min
                  </span>
                  {team.dayCount > 0 && (
                    <span className="flex items-center gap-0.5 text-muted-foreground">
                      <Sun className="h-3 w-3" />
                      {team.dayCount}
                    </span>
                  )}
                  {team.arvoCount > 0 && (
                    <span className="flex items-center gap-0.5 text-muted-foreground">
                      <Moon className="h-3 w-3" />
                      {team.arvoCount}
                    </span>
                  )}
                </div>
              </div>
              {team.members.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                  No shifts recorded
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {team.members.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-3 py-1.5"
                    >
                      <span className="text-sm font-medium">{m.name}</span>
                      <div className="flex items-center gap-1.5">
                        {m.shiftCode ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                              shiftClass(m.shiftCode)
                            )}
                          >
                            {m.shiftCode}
                            <span className="font-normal opacity-75">
                              {SHIFT_LABELS[
                                m.shiftCode as keyof typeof SHIFT_LABELS
                              ] ?? ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            —
                          </span>
                        )}
                        {m.shiftTime && (
                          <span className="text-[10px] text-muted-foreground">
                            {m.shiftTime}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {detail.onCall.show && (
          <div className="rounded-xl border border-border/60 overflow-hidden mt-4">
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2",
                detail.onCall.deployable
                  ? "bg-emerald-50 border-b border-emerald-200"
                  : "bg-red-50 border-b border-red-200"
              )}
            >
              <div className="flex items-center gap-2">
                {detail.onCall.deployable ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-semibold text-sm">On-Call</span>
              </div>
              <span
                className={cn(
                  "text-xs font-bold",
                  detail.onCall.deployable ? "text-emerald-700" : "text-red-600"
                )}
              >
                {detail.onCall.count} / {detail.onCall.min} min
              </span>
            </div>
            {detail.onCall.members.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">
                No on-call shifts recorded
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {detail.onCall.members.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-1.5"
                  >
                    <span className="text-sm font-medium">{m.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                          shiftClass(m.shiftCode)
                        )}
                      >
                        {m.shiftCode}
                        <span className="font-normal opacity-75">
                          {SHIFT_LABELS[
                            m.shiftCode as keyof typeof SHIFT_LABELS
                          ] ?? ""}
                        </span>
                      </span>
                      {m.shiftTime && (
                        <span className="text-[10px] text-muted-foreground">
                          {m.shiftTime}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OutlookPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [timeframe, setTimeframe] = useState<Timeframe>("2w");
  const [customStart, setCustomStart] = useState(
    format(startOfToday(), "yyyy-MM-dd")
  );
  const [customEnd, setCustomEnd] = useState(
    format(addDays(startOfToday(), 13), "yyyy-MM-dd")
  );
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editMins, setEditMins] = useState<Record<string, number>>({});
  const [editOnCallMin, setEditOnCallMin] = useState(5);
  const [editCombinedMin, setEditCombinedMin] = useState(5);

  const { start, end } = getDateRange(timeframe, customStart, customEnd);

  const { data: teamsData, isLoading: teamsLoading } =
    trpc.ctoRoster.teams.list.useQuery();
  const { data: membersData, isLoading: membersLoading } =
    trpc.ctoRoster.members.list.useQuery();
  // Administration is a roster-only team (holds people who need CTO Roster
  // access for admin purposes) — it never has real coverage/deployability
  // numbers, so it's excluded from Outlook entirely rather than showing an
  // always-empty, always "at risk" card.
  const outlookTeams = useMemo(
    () => (teamsData ?? []).filter(t => t.name !== "Administration"),
    [teamsData]
  );
  const { data: shiftsData, isLoading: shiftsLoading } =
    trpc.ctoRoster.roster.getRange.useQuery(
      { startDate: start, endDate: end },
      { staleTime: 60_000 }
    );
  const { data: settingsData, refetch: refetchSettings } =
    trpc.ctoRoster.outlookSettings.get.useQuery();
  const updateSettings = trpc.ctoRoster.outlookSettings.update.useMutation({
    onSuccess: () => {
      refetchSettings();
      setShowSettings(false);
    },
  });

  const isLoading = teamsLoading || membersLoading || shiftsLoading;

  // Build shift lookup: memberId → date → shift
  const shiftMap = useMemo(() => {
    const map = new Map<
      number,
      Map<string, { shiftCode: string; shiftTime: string | null }>
    >();
    for (const s of shiftsData ?? []) {
      if (!map.has(s.memberId)) map.set(s.memberId, new Map());
      map.get(s.memberId)!.set(s.shiftDate, {
        shiftCode: s.shiftCode,
        shiftTime: s.shiftTime ?? null,
      });
    }
    return map;
  }, [shiftsData]);

  // All days in range
  const days = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: new Date(start + "T00:00:00"),
        end: new Date(end + "T00:00:00"),
      });
    } catch {
      return [];
    }
  }, [start, end]);

  // Per-day per-team stats
  type TeamDayStat = {
    teamId: number;
    teamName: string;
    onDuty: number;
    dayCount: number;
    arvoCount: number;
    total: number;
    min: number;
    deployable: boolean;
    members: {
      id: number;
      name: string;
      shiftCode: string;
      shiftTime: string | null;
    }[];
  };
  type OnCallStat = {
    count: number;
    total: number;
    min: number;
    deployable: boolean;
    show: boolean;
    members: {
      id: number;
      name: string;
      shiftCode: string;
      shiftTime: string | null;
    }[];
  };
  type DayStat = {
    date: string;
    teams: TeamDayStat[];
    onCall: OnCallStat;
    allDeployable: boolean;
    combinedDeployable: boolean;
    atRisk: boolean;
  };

  const effectiveOnCallMin = settingsData?.onCallMin ?? ON_CALL_MIN;

  const dayStats: DayStat[] = useMemo(() => {
    if (!teamsData || !membersData) return [];
    return days.map(d => {
      const ds = format(d, "yyyy-MM-dd");
      const teamStats: TeamDayStat[] = outlookTeams.map(team => {
        // Members marked "excluded from counts" (see the checkbox on their
        // roster row) don't contribute to coverage stats here at all.
        const teamMembers = membersData.filter(
          m => m.teamId === team.id && !m.excludedFromCounts
        );
        const min =
          settingsData?.teamMinimums[team.name] ??
          TEAM_MINIMUMS[team.name] ??
          DEFAULT_MIN;
        const memberShifts = teamMembers.map(m => {
          const s = shiftMap.get(m.id)?.get(ds);
          return {
            id: m.id,
            name: m.name,
            shiftCode: s?.shiftCode ?? "",
            shiftTime: s?.shiftTime ?? null,
          };
        });
        const onDuty = memberShifts.filter(m =>
          ON_DUTY_CODES.has(m.shiftCode)
        ).length;
        const dayCount = memberShifts.filter(m =>
          DAY_CODES.has(m.shiftCode)
        ).length;
        const arvoCount = memberShifts.filter(m =>
          ARVO_CODES.has(m.shiftCode)
        ).length;
        return {
          teamId: team.id,
          teamName: team.name,
          onDuty,
          dayCount,
          arvoCount,
          total: teamMembers.length,
          min,
          deployable: onDuty >= min,
          members: memberShifts,
        };
      });
      const outlookTeamIds = new Set(outlookTeams.map(t => t.id));
      const allMembers = membersData.filter(
        m => !m.excludedFromCounts && outlookTeamIds.has(m.teamId)
      );
      const onCallMembers = allMembers
        .map(m => {
          const s = shiftMap.get(m.id)?.get(ds);
          return {
            id: m.id,
            name: m.name,
            shiftCode: s?.shiftCode ?? "",
            shiftTime: s?.shiftTime ?? null,
          };
        })
        .filter(m => ON_CALL_CODES.has(m.shiftCode));
      const dayOfWeek = d.getDay();
      const hasOnCallShifts = onCallMembers.length > 0;
      const showOnCall = ON_CALL_DAYS.has(dayOfWeek) || hasOnCallShifts;
      const ocMin = settingsData?.onCallMin ?? ON_CALL_MIN;
      const onCallStat: OnCallStat = {
        count: onCallMembers.length,
        total: allMembers.length,
        min: ocMin,
        deployable: onCallMembers.length >= ocMin,
        show: showOnCall,
        members: onCallMembers,
      };
      const allDeployable =
        teamStats.every(t => t.deployable) &&
        (!showOnCall || onCallStat.deployable);
      const atRisk =
        teamStats.some(t => !t.deployable) ||
        (showOnCall && !onCallStat.deployable);
      const combinedMin = settingsData?.combinedMin ?? 5;
      const mainTeams = teamStats.filter(
        t => t.teamName === "Team 1" || t.teamName === "Team 2"
      );
      const someMainBelowMin = mainTeams.some(t => !t.deployable);
      const combinedMainOnDuty = mainTeams.reduce(
        (sum, t) => sum + t.onDuty,
        0
      );
      const combinedDeployable =
        !allDeployable && someMainBelowMin && combinedMainOnDuty >= combinedMin;
      return {
        date: ds,
        teams: teamStats,
        onCall: onCallStat,
        allDeployable,
        combinedDeployable,
        atRisk,
      };
    });
  }, [days, teamsData, outlookTeams, membersData, shiftMap, settingsData]);

  // Summary stats
  const summary = useMemo(() => {
    const total = dayStats.length;
    const fullyDeployable = dayStats.filter(d => d.allDeployable).length;
    const atRiskDays = dayStats.filter(d => d.atRisk).length;
    const avgDay =
      total === 0
        ? 0
        : Math.round(
            dayStats.reduce(
              (acc, d) => acc + d.teams.reduce((a, t) => a + t.dayCount, 0),
              0
            ) / total
          );
    const avgArvo =
      total === 0
        ? 0
        : Math.round(
            dayStats.reduce(
              (acc, d) => acc + d.teams.reduce((a, t) => a + t.arvoCount, 0),
              0
            ) / total
          );
    return { total, fullyDeployable, atRiskDays, avgDay, avgArvo };
  }, [dayStats]);

  const handleDayClick = (stat: DayStat) => {
    setSelectedDay({
      date: stat.date,
      teams: stat.teams.map(t => ({
        teamId: t.teamId,
        teamName: t.teamName,
        members: t.members,
        onDuty: t.onDuty,
        dayCount: t.dayCount,
        arvoCount: t.arvoCount,
        min: t.min,
        deployable: t.deployable,
      })),
      onCall: {
        count: stat.onCall.count,
        min: stat.onCall.min,
        deployable: stat.onCall.deployable,
        show: stat.onCall.show,
        members: stat.onCall.members,
      },
    });
  };

  const handleOpenSettings = () => {
    const currentMins: Record<string, number> = {};
    for (const team of outlookTeams) {
      currentMins[team.name] =
        settingsData?.teamMinimums[team.name] ??
        TEAM_MINIMUMS[team.name] ??
        DEFAULT_MIN;
    }
    setEditMins(currentMins);
    setEditOnCallMin(settingsData?.onCallMin ?? ON_CALL_MIN);
    setEditCombinedMin(settingsData?.combinedMin ?? 5);
    setShowSettings(true);
  };

  const handleSaveSettings = () => {
    updateSettings.mutate({
      teamMinimums: editMins,
      onCallMin: editOnCallMin,
      combinedMin: editCombinedMin,
    });
  };

  const TIMEFRAMES: { id: Timeframe; label: string }[] = [
    { id: "1w", label: "1 Week" },
    { id: "2w", label: "2 Weeks" },
    { id: "1m", label: "1 Month" },
    { id: "custom", label: "Custom" },
  ];

  // Build dynamic minimums label for legend
  const minimumsLabel = useMemo(() => {
    if (outlookTeams.length === 0)
      return "Minimums: Team 1 & 2 = 5 · PTT = 2 · Capability = 1";
    const parts = outlookTeams.map(t => {
      const min =
        settingsData?.teamMinimums[t.name] ??
        TEAM_MINIMUMS[t.name] ??
        DEFAULT_MIN;
      return `${t.name} = ${min}`;
    });
    return "Minimums: " + parts.join(" · ");
  }, [outlookTeams, settingsData]);

  return (
    <DashboardLayout>
      <div
        className="flex flex-col overflow-hidden gap-2 px-4 py-3"
        style={{ height: "calc(100vh - 0px)" }}
      >
        {/* ── Header (desktop only) ── */}
        <div className="hidden sm:flex items-start gap-3 flex-shrink-0">
          <Binoculars className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Outlook</h1>
            <p className="text-xs text-muted-foreground">
              Deployment capability at a glance — click any day for detail
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleOpenSettings}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Configure minimums"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Settings</span>
            </button>
          )}
        </div>

        {/* ── Control bar ── */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                  timeframe === tf.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {timeframe === "custom" && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="border border-border rounded-lg px-2 py-1 text-xs bg-background"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="border border-border rounded-lg px-2 py-1 text-xs bg-background"
              />
            </div>
          )}
          {/* Mobile settings button */}
          {isAdmin && (
            <button
              onClick={handleOpenSettings}
              className="sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-auto"
              title="Configure minimums"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* At-risk strip removed */}

        {/* ── Day cards grid ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2 pb-2">
              {dayStats.map(stat => {
                const d = new Date(stat.date + "T00:00:00");
                const isToday =
                  stat.date === format(startOfToday(), "yyyy-MM-dd");
                const isWknd = isWeekend(d);
                return (
                  <button
                    key={stat.date}
                    onClick={() => handleDayClick(stat)}
                    className={cn(
                      "rounded-xl border text-left transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] overflow-hidden",
                      stat.allDeployable
                        ? isToday
                          ? "border-2 border-primary bg-card"
                          : "border border-emerald-300 bg-card"
                        : stat.combinedDeployable
                          ? isToday
                            ? "border-2 border-primary bg-card"
                            : "border border-amber-500 bg-card"
                          : isToday
                            ? "border-2 border-primary bg-card"
                            : "border border-red-300 bg-card"
                    )}
                  >
                    {/* Card header */}
                    <div
                      className={cn(
                        "px-2 py-1.5 flex items-center justify-between border-b",
                        stat.allDeployable
                          ? "bg-emerald-100 border-emerald-300"
                          : stat.combinedDeployable
                            ? "bg-amber-100 border-amber-300"
                            : "bg-red-100 border-red-300"
                      )}
                    >
                      <div>
                        <div
                          className={cn(
                            "text-xs font-semibold uppercase tracking-wide",
                            isWknd
                              ? "text-muted-foreground"
                              : "text-foreground/70"
                          )}
                        >
                          {format(d, "EEE")}
                        </div>
                        <div
                          className={cn(
                            "text-xl font-bold leading-tight",
                            isToday ? "text-primary" : "text-foreground"
                          )}
                        >
                          {format(d, "d MMM")}
                        </div>
                      </div>
                      {stat.allDeployable ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : stat.combinedDeployable ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    {/* Team rows — no progress bar, full name always visible */}
                    <div className="divide-y divide-border/30">
                      {stat.teams.map(team => (
                        <div
                          key={team.teamId}
                          className="flex items-center gap-1.5 px-2 py-1.5"
                        >
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full flex-shrink-0",
                              team.deployable ? "bg-emerald-500" : "bg-red-500"
                            )}
                          />
                          <span className="text-xs font-medium flex-1 min-w-0 text-foreground/80 truncate">
                            {team.teamName}
                          </span>
                          {/* Progress bar — desktop only, only when name fits */}
                          <div className="hidden lg:flex items-center gap-1.5">
                            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  team.deployable
                                    ? "bg-emerald-500"
                                    : "bg-red-500"
                                )}
                                style={{
                                  width: `${Math.min(100, (team.onDuty / Math.max(team.total, 1)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <span
                            className={cn(
                              "text-[11px] font-bold tabular-nums text-right flex-shrink-0",
                              team.deployable
                                ? "text-emerald-700"
                                : "text-red-600"
                            )}
                          >
                            {team.onDuty}/{team.total}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* On-Call row — always rendered for uniform tile height; empty placeholder when not applicable */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border/30">
                      {stat.onCall.show ? (
                        <>
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full flex-shrink-0",
                              stat.onCall.deployable
                                ? "bg-emerald-500"
                                : "bg-red-500"
                            )}
                          />
                          <span className="text-xs font-medium flex-1 min-w-0 text-foreground/80 truncate">
                            On-Call
                          </span>
                          {/* Progress bar — desktop only */}
                          <div className="hidden lg:flex items-center gap-1.5">
                            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  stat.onCall.deployable
                                    ? "bg-emerald-500"
                                    : "bg-red-500"
                                )}
                                style={{
                                  width: `${Math.min(100, (stat.onCall.count / effectiveOnCallMin) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <span
                            className={cn(
                              "text-[11px] font-bold tabular-nums text-right flex-shrink-0",
                              stat.onCall.deployable
                                ? "text-emerald-700"
                                : "text-red-600"
                            )}
                          >
                            {stat.onCall.count}/{effectiveOnCallMin}
                          </span>
                        </>
                      ) : (
                        // Empty placeholder — keeps tile height uniform
                        <span className="text-xs text-transparent select-none">
                          &nbsp;
                        </span>
                      )}
                    </div>
                    {/* Bottom status bar */}
                    <div
                      className={cn(
                        "px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1",
                        stat.allDeployable
                          ? "bg-emerald-200 text-emerald-900"
                          : stat.combinedDeployable
                            ? "bg-amber-200 text-amber-900"
                            : "bg-red-200 text-red-900"
                      )}
                    >
                      {stat.allDeployable ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> All teams
                          deployable
                        </>
                      ) : stat.combinedDeployable ? (
                        <>
                          <AlertTriangle className="h-3 w-3" />{" "}
                          {(() => {
                            const mainTeams = stat.teams.filter(
                              t =>
                                t.teamName === "Team 1" ||
                                t.teamName === "Team 2"
                            );
                            const deployableTeam = mainTeams.find(
                              t => t.deployable
                            );
                            return deployableTeam
                              ? `${deployableTeam.teamName} only deployable`
                              : "Combined deployable (BLENDED)";
                          })()}
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3 w-3" />
                          {[
                            ...stat.teams
                              .filter(t => !t.deployable)
                              .map(t => t.teamName),
                            ...(stat.onCall.show && !stat.onCall.deployable
                              ? ["On-Call"]
                              : []),
                          ].join(", ")}{" "}
                          below minimum
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Legend — desktop only ── */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0 flex-wrap pb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />{" "}
            Deployable (at or above minimum)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />{" "}
            Combined / BLENDED deployable
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />{" "}
            Not deployable (below minimum)
          </span>
          <span className="flex items-center gap-1.5">
            <Sun className="h-3 w-3 text-amber-400" /> Day shift
          </span>
          <span className="flex items-center gap-1.5">
            <Moon className="h-3 w-3 text-indigo-400" /> Arvo shift
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>{minimumsLabel}</span>
        </div>

        {/* ── Day detail drawer ── */}
        <DayDetailDrawer
          detail={selectedDay}
          onClose={() => setSelectedDay(null)}
        />

        {/* ── Settings dialog (admin only) ── */}
        {isAdmin && (
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Outlook Minimum Thresholds
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Set the minimum on-duty headcount required for each team to
                    be considered deployable.
                  </p>
                  <div className="space-y-3">
                    {outlookTeams.map(team => (
                      <div key={team.id} className="flex items-center gap-3">
                        <Label className="w-28 text-sm font-medium flex-shrink-0">
                          {team.name}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={
                            editMins[team.name] ??
                            settingsData?.teamMinimums[team.name] ??
                            TEAM_MINIMUMS[team.name] ??
                            DEFAULT_MIN
                          }
                          onChange={e =>
                            setEditMins(prev => ({
                              ...prev,
                              [team.name]: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-20 text-center"
                        />
                        <span className="text-xs text-muted-foreground">
                          members on duty
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Label className="w-28 text-sm font-medium flex-shrink-0">
                      On-Call min
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={editOnCallMin}
                      onChange={e =>
                        setEditOnCallMin(parseInt(e.target.value) || 0)
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-xs text-muted-foreground">
                      on-call members
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-28 text-sm font-medium flex-shrink-0">
                      Combined min
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={editCombinedMin}
                      onChange={e =>
                        setEditCombinedMin(parseInt(e.target.value) || 0)
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-xs text-muted-foreground">
                      Team 1+2 combined (BLENDED)
                    </span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveSettings}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
