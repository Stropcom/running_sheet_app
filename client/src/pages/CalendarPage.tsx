import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enAU } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupSheetsByDay } from "@shared/calendarList";

// ── date-fns localizer ────────────────────────────────────────────────────────
const locales = { "en-AU": enAU };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Monday
  getDay,
  locales,
});

// ── Event type ────────────────────────────────────────────────────────────────
type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  type: "operation" | "sheet";
  operationId: number | null;
  sheetId: number | null;
  operationName: string | null;
};

// ── Colour constants ──────────────────────────────────────────────────────────
const OP_COLOR = "oklch(0.45 0.15 250)";
const OP_BORDER = "oklch(0.35 0.15 250)";
const SHEET_COLOR = "oklch(0.45 0.15 190)";
const SHEET_BORDER = "oklch(0.35 0.15 190)";

// ── Custom toolbar (month nav only) ──────────────────────────────────────────
function CustomToolbar({
  label,
  onNavigate,
}: {
  label: string;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onNavigate("PREV")}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => onNavigate("TODAY")}
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onNavigate("NEXT")}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <span className="text-base font-semibold text-foreground">{label}</span>
      {/* Empty div to keep label centred */}
      <div className="w-[88px]" />
    </div>
  );
}

// ── Month grid or List (remembered on this device) ───────────────────────────
type CalView = "month" | "list";
const VIEW_KEY = "runlog.calendarView";
function loadView(): CalView {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "month";
  } catch {
    return "month";
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [date, setDate] = useState(new Date());
  const [view, setViewState] = useState<CalView>(loadView);
  const setView = (v: CalView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* the choice just is not remembered */
    }
  };

  const { data: rawEvents, isLoading } = trpc.calendar.events.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      staleTime: 60_000,
    }
  );

  // Convert timestamp numbers → Date objects, show only running sheets
  const events: CalEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents
      .filter(e => e.type === "sheet")
      .map(e => ({
        ...e,
        start: new Date(e.start),
        end: new Date(e.end),
        allDay: true,
      }));
  }, [rawEvents]);

  const handleSelectEvent = useCallback(
    (event: CalEvent) => {
      if (event.type === "sheet" && event.sheetId) {
        navigate(`/sheet/${event.sheetId}`);
      }
    },
    [navigate]
  );

  const eventStyleGetter = useCallback((_event: CalEvent) => {
    return {
      style: {
        backgroundColor: SHEET_COLOR,
        borderColor: SHEET_BORDER,
        color: "#fff",
        borderRadius: "4px",
        border: "none",
        fontSize: "11px",
        padding: "1px 4px",
      },
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-5">
          <CalendarDays className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-xl font-semibold text-foreground mr-auto">
            Calendar
          </h1>
          {/* Equal halves: Month grid (default) or List */}
          <div
            role="group"
            aria-label="Calendar layout"
            className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1"
          >
            {(
              [
                ["month", "Month", LayoutGrid],
                ["list", "List", List],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "flex h-8 w-24 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                  view === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: SHEET_COLOR }}
          />
          <span className="text-xs text-muted-foreground font-medium">
            Running Sheet
          </span>
        </div>

        {/* Calendar */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
            Loading calendar…
          </div>
        ) : view === "list" ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <CustomToolbar
              label={format(date, "MMMM yyyy")}
              onNavigate={action =>
                setDate(d =>
                  action === "TODAY"
                    ? new Date()
                    : new Date(
                        d.getFullYear(),
                        d.getMonth() + (action === "NEXT" ? 1 : -1),
                        1
                      )
                )
              }
            />
            <CalendarList
              events={events}
              date={date}
              onOpen={handleSelectEvent}
            />
          </div>
        ) : (
          <div className="rbc-calendar-wrapper rounded-xl border border-border overflow-hidden bg-card p-4">
            <Calendar
              localizer={localizer}
              events={events}
              view="month"
              views={["month"]}
              date={date}
              onNavigate={setDate}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              showAllEvents
              style={{ height: "auto" }}
              components={{
                toolbar: props => (
                  <CustomToolbar
                    label={props.label}
                    onNavigate={
                      props.onNavigate as (a: "PREV" | "NEXT" | "TODAY") => void
                    }
                  />
                ),
              }}
              popup
            />
          </div>
        )}
      </div>

      {/* Dark-theme overrides */}
      <style>{`
        .rbc-calendar-wrapper .rbc-calendar { background: transparent; color: inherit; }
        .rbc-calendar-wrapper .rbc-header { background: transparent; border-color: hsl(var(--border)); color: hsl(var(--muted-foreground)); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 4px; }
        .rbc-calendar-wrapper .rbc-month-view { border: none; }
        .rbc-calendar-wrapper .rbc-day-bg { background: transparent; }
        .rbc-calendar-wrapper .rbc-day-bg + .rbc-day-bg,
        .rbc-calendar-wrapper .rbc-month-row + .rbc-month-row,
        .rbc-calendar-wrapper .rbc-header + .rbc-header { border-color: hsl(var(--border)); }
        .rbc-calendar-wrapper .rbc-off-range-bg { background: hsl(var(--muted) / 0.3); }
        .rbc-calendar-wrapper .rbc-today { background: hsl(var(--primary) / 0.08); }
        .rbc-calendar-wrapper .rbc-date-cell { color: hsl(var(--foreground)); font-size: 12px; padding: 4px 6px; }
        .rbc-calendar-wrapper .rbc-date-cell.rbc-off-range { color: hsl(var(--muted-foreground)); }
        .rbc-calendar-wrapper .rbc-date-cell.rbc-now > a { color: hsl(var(--primary)); font-weight: 700; }
        .rbc-calendar-wrapper .rbc-show-more { color: hsl(var(--primary)); font-size: 11px; background: transparent; }
        .rbc-calendar-wrapper .rbc-event { cursor: pointer; }
        .rbc-calendar-wrapper .rbc-event:focus { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
        .rbc-calendar-wrapper .rbc-row-segment { padding: 0 2px 2px; }
        .rbc-calendar-wrapper .rbc-month-row { overflow: visible; }
        .rbc-calendar-wrapper .rbc-toolbar { display: none; }
        /* Full sheet names: the chip wraps onto as many lines as it needs and
           the week row grows with it (no cut-off "…", no "+N more"). */
        .rbc-calendar-wrapper .rbc-month-view { flex: none; }
        .rbc-calendar-wrapper .rbc-month-row { flex: 0 0 auto; min-height: 84px; }
        .rbc-calendar-wrapper .rbc-row-content-scrollable { max-height: none; overflow: visible; height: auto; }
        .rbc-calendar-wrapper .rbc-event { white-space: normal; height: auto; }
        .rbc-calendar-wrapper .rbc-event-content { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; line-height: 1.3; }
      `}</style>
    </DashboardLayout>
  );
}

// ── List view: one row per day that has a sheet, full names ─────────────────
function CalendarList({
  events,
  date,
  onOpen,
}: {
  events: CalEvent[];
  date: Date;
  onOpen: (e: CalEvent) => void;
}) {
  const groups = useMemo(
    () => groupSheetsByDay(events, date.getFullYear(), date.getMonth()),
    [events, date]
  );
  const todayKey = format(new Date(), "yyyy-MM-dd");
  if (groups.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No running sheets this month.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {groups.map(g => (
        <div
          key={g.day}
          className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 border-t border-border py-3 first:border-t-0 sm:grid-cols-[84px_minmax(0,1fr)]"
        >
          <div
            className={cn(
              "flex flex-col items-center self-start rounded-lg px-1 py-1.5",
              g.day === todayKey
                ? "bg-primary/10 ring-1 ring-primary"
                : "bg-muted"
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
              {format(g.date, "EEE")}
            </span>
            <span className="text-xl font-semibold leading-tight">
              {format(g.date, "d")}
            </span>
            <span className="text-xs text-foreground/70">
              {format(g.date, "MMM")}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            {g.items.map(ev => (
              <button
                key={ev.id}
                type="button"
                onClick={() => onOpen(ev)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium break-words transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                {ev.title}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
