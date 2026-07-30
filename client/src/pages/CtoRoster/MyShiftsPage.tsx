import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, TrendingUp, ChevronLeft, ChevronRight, PhoneCall, Plane, GraduationCap, Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { SHIFT_LABELS, SHIFT_TIMES, shiftClass, ON_DUTY_CODES, ON_CALL_CODES, ROSTER_START, ROSTER_END } from "@shared/ctoRosterShiftUtils";
import {
  format, parseISO, isBefore, isToday, startOfToday,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";

type ShiftEntry = { shiftDate: string; shiftCode: string };

// My Shifts' "On Duty" figure additionally counts Court, unlike the shared
// ON_DUTY_CODES (used for Outlook/Roster-grid deployable headcount, where
// Court attendance isn't "available" the same way) — scoped to this page only.
const MY_SHIFTS_ON_DUTY_CODES = new Set([...Array.from(ON_DUTY_CODES), "c"]);

const ROSTER_YEAR = parseISO(ROSTER_START).getFullYear();

const ROSTER_MONTHS: Date[] = (() => {
  const months: Date[] = [];
  let d = startOfMonth(parseISO(ROSTER_START));
  const end = startOfMonth(parseISO(ROSTER_END));
  while (d <= end) { months.push(d); d = addMonths(d, 1); }
  return months;
})();

export default function MyShiftsPage() {
  const { user, refresh } = useAuth();
  const { data: shifts, isLoading } = trpc.ctoRoster.roster.myShifts.useQuery({});
  const { data: members } = trpc.ctoRoster.members.list.useQuery();
  const isRosterMember = !!members?.some((m: any) => m.cin === user?.cin);
  const today = startOfToday();

  // Roster shift-change notifications — opt-out only, doesn't affect any
  // other notification type (e.g. CTO Weekly Tasking posts).
  const updateNotifPref = trpc.profile.updateRosterShiftNotifPref.useMutation({
    onSuccess: () => refresh(),
    onError: () => toast.error("Failed to update notification setting."),
  });
  const notifEnabled = user?.rosterShiftNotificationsEnabled ?? true;

  // Calendar month state — default to current month
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const now = startOfMonth(new Date());
    const rs  = startOfMonth(parseISO(ROSTER_START));
    const re  = startOfMonth(parseISO(ROSTER_END));
    return now >= rs && now <= re ? now : rs;
  });

  // Build a lookup: date string → shift code
  const shiftMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shifts ?? []) m.set(s.shiftDate, s.shiftCode);
    return m;
  }, [shifts]);

  const { stats } = useMemo(() => {
    if (!shifts) return { stats: { onDuty: 0, rest: 0, leave: 0, onCall: 0, deployment: 0, training: 0, total: 0 } };
    const sorted = [...shifts].sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
    const stats = {
      onDuty:     sorted.filter(s => MY_SHIFTS_ON_DUTY_CODES.has(s.shiftCode)).length,
      // Plain "o" (weekend on-call) counts as both Rest and On-Call — it's
      // a rest day with an on-call obligation, not a worked shift.
      rest:       sorted.filter(s => s.shiftCode === "r" || s.shiftCode === "o").length,
      leave:      sorted.filter(s => s.shiftCode === "l").length,
      onCall:     sorted.filter(s => ON_CALL_CODES.has(s.shiftCode)).length,
      deployment: sorted.filter(s => s.shiftCode === "dep").length,
      training:   sorted.filter(s => s.shiftCode === "tt").length,
      total:      sorted.length,
    };
    return { stats };
  }, [shifts, today]);

  // Calendar grid days
  const calDays = useMemo(() => {
    const first = startOfMonth(calMonth);
    const last  = endOfMonth(calMonth);
    const days  = eachDayOfInterval({ start: first, end: last });
    const startPad = (getDay(first) + 6) % 7; // Mon-based
    return { days, startPad };
  }, [calMonth]);

  const canPrevMonth = calMonth > ROSTER_MONTHS[0];
  const canNextMonth = calMonth < ROSTER_MONTHS[ROSTER_MONTHS.length - 1];

  // Selected day for detail panel
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedShiftCode = selectedDate ? (shiftMap.get(selectedDate) ?? "") : null;

  if (!isRosterMember) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full py-24 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No roster profile linked</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            You're not on the CTO Roster yet. Ask an admin to add you as a member.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="flex flex-col h-full min-h-0 overflow-y-auto px-4 py-3">
      <div className="max-w-2xl mx-auto w-full pb-10 px-0">
        {/* Page title */}
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold text-foreground tracking-tight">My Shifts</h1>
            <span className="text-sm text-muted-foreground">{ROSTER_YEAR}</span>
          </div>
          {/* Roster is still being actively edited/tested — this lets people
              turn off "your shift changed" notifications without affecting
              any other notification type. */}
          <div className="flex items-center gap-1.5">
            {notifEnabled
              ? <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <span className="text-xs text-muted-foreground">Shift notifications</span>
            <Switch
              checked={notifEnabled}
              disabled={updateNotifPref.isPending}
              onCheckedChange={checked => updateNotifPref.mutate({ enabled: checked })}
            />
          </div>
        </div>

        {/* ── Compact stats grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-5">
          {[
            { label: "On Duty",    value: stats.onDuty,     icon: TrendingUp,    color: "text-emerald-600" },
            { label: "Rest",       value: stats.rest,       icon: Clock,         color: "text-amber-600" },
            { label: "Leave",      value: stats.leave,      icon: CalendarDays,  color: "text-purple-600" },
            { label: "On-Call",    value: stats.onCall,     icon: PhoneCall,     color: "text-sky-600" },
            { label: "Deployment", value: stats.deployment, icon: Plane,         color: "text-rose-600" },
            { label: "Training",   value: stats.training,   icon: GraduationCap, color: "text-teal-600" },
            { label: "Total",      value: stats.total,      icon: CalendarDays,  color: "text-indigo-600" },
          ].map(stat => (
            <div key={stat.label}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg border border-border/60 bg-card shadow-sm text-center"
            >
              <stat.icon className={cn("h-3.5 w-3.5 flex-shrink-0", stat.color)} />
              <span className="text-[11px] text-muted-foreground font-medium leading-tight">{stat.label}</span>
              {isLoading
                ? <Skeleton className="h-4 w-6 rounded" />
                : <span className={cn("text-sm font-bold tabular-nums", stat.color)}>{stat.value}</span>
              }
            </div>
          ))}
        </div>

        {/* ── Calendar (primary focus) ─────────────────────────────────────── */}
        <section>
          {/* Month navigator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                onClick={() => setCalMonth(m => subMonths(m, 1))} disabled={!canPrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-base font-semibold min-w-[130px] text-center">
                {format(calMonth, "MMMM yyyy")}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                onClick={() => setCalMonth(m => addMonths(m, 1))} disabled={!canNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Jump to today */}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => { setCalMonth(startOfMonth(new Date())); setSelectedDate(format(new Date(), "yyyy-MM-dd")); }}>
              <CalendarDays className="h-3.5 w-3.5" />
              Today
            </Button>
          </div>

          <div className="bg-muted/30 rounded-2xl p-3">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calDays.startPad }).map((_, i) => <div key={`pad-${i}`} />)}

              {isLoading
                ? Array.from({ length: 28 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
                : calDays.days.map(d => {
                    const ds = format(d, "yyyy-MM-dd");
                    const code = shiftMap.get(ds) ?? "";
                    const todayFlag = isToday(d);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isSelected = selectedDate === ds;
                    const label = code ? (SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code) : "";
                    const time  = code ? (SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "") : "";

                    return (
                      <button
                        key={ds}
                        onClick={() => setSelectedDate(ds === selectedDate ? null : ds)}
                        className={cn(
                          "relative h-16 rounded-xl overflow-hidden transition-all active:scale-95 focus:outline-none text-left",
                          code
                            ? cn(shiftClass(code), "shadow-sm")
                            : cn(
                                todayFlag ? "bg-primary/10" :
                                isWeekend ? "bg-muted/50" : "bg-card border border-border/40",
                              ),
                          todayFlag && code && "ring-2 ring-primary ring-offset-1",
                          isSelected && "ring-2 ring-white ring-offset-1 brightness-90",
                        )}
                      >
                        {/* Date number */}
                        <span className={cn(
                          "absolute top-1.5 left-2 text-xs font-bold leading-none",
                          code ? "text-current opacity-90" : todayFlag ? "text-primary" : "text-foreground",
                        )}>
                          {format(d, "d")}
                        </span>

                        {/* Shift label bottom */}
                        {code && (
                          <span className="absolute bottom-1 left-1 right-1 text-[7px] leading-tight opacity-70 font-medium truncate">
                            {label}{time ? ` · ${time}` : ""}
                          </span>
                        )}

                        {/* Today dot */}
                        {todayFlag && !code && (
                          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })
              }
            </div>
          </div>

          {/* Selected day detail panel */}
          {selectedDate && (
            <div className={cn(
              "mt-3 rounded-xl border p-4 transition-all",
              selectedShiftCode
                ? cn(shiftClass(selectedShiftCode), "border-transparent shadow-sm")
                : "bg-card border-border/60"
            )}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {format(parseISO(selectedDate), "EEEE, d MMMM yyyy")}
                    {isToday(parseISO(selectedDate)) && (
                      <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1.5 border-current opacity-70">Today</Badge>
                    )}
                  </p>
                  {selectedShiftCode ? (
                    <div className="mt-1.5">
                      <span className="text-lg font-bold">
                        {SHIFT_LABELS[selectedShiftCode as keyof typeof SHIFT_LABELS] ?? selectedShiftCode}
                      </span>
                      {SHIFT_TIMES[selectedShiftCode as keyof typeof SHIFT_TIMES] && (
                        <span className="ml-2 text-sm opacity-70">
                          {SHIFT_TIMES[selectedShiftCode as keyof typeof SHIFT_TIMES]}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm opacity-60 mt-1">No shift assigned</p>
                  )}
                </div>
                <button onClick={() => setSelectedDate(null)} className="opacity-50 hover:opacity-80 text-lg leading-none mt-0.5">×</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
    </DashboardLayout>
  );
}
