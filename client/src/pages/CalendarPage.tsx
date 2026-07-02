import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Calendar, dateFnsLocalizer, View, SlotInfo } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enAU } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

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
  type: "operation" | "sheet";
  operationId: number | null;
  sheetId: number | null;
  operationName: string | null;
};

// ── Custom toolbar ────────────────────────────────────────────────────────────
function CustomToolbar({
  label,
  onNavigate,
  onView,
  view,
}: {
  label: string;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
  view: View;
}) {
  const views: { key: View; label: string }[] = [
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
    { key: "day", label: "Day" },
  ];

  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      {/* Navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onNavigate("PREV")}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => onNavigate("TODAY")}>
          Today
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onNavigate("NEXT")}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Label */}
      <span className="text-base font-semibold text-foreground">{label}</span>

      {/* View switcher */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => onView(v.key)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              view === v.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());

  const { data: rawEvents, isLoading } = trpc.calendar.events.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Convert timestamp numbers → Date objects
  const events: CalEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents.map((e) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    }));
  }, [rawEvents]);

  // Navigate on event click
  const handleSelectEvent = useCallback(
    (event: CalEvent) => {
      if (event.type === "sheet" && event.sheetId) {
        navigate(`/sheet/${event.sheetId}`);
      } else if (event.type === "operation" && event.operationId) {
        navigate(`/operation/${event.operationId}`);
      }
    },
    [navigate]
  );

  // Colour events: operations = blue, sheets = teal
  const eventStyleGetter = useCallback((event: CalEvent) => {
    const isOp = event.type === "operation";
    return {
      style: {
        backgroundColor: isOp ? "oklch(0.45 0.15 250)" : "oklch(0.45 0.15 190)",
        borderColor: isOp ? "oklch(0.35 0.15 250)" : "oklch(0.35 0.15 190)",
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
        <div className="flex items-center gap-3 mb-6">
          <CalendarDays className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "oklch(0.45 0.15 250)" }} />
            Operation
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "oklch(0.45 0.15 190)" }} />
            Running Sheet
          </span>
        </div>

        {/* Calendar */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
            Loading calendar…
          </div>
        ) : (
          <div className="rbc-calendar-wrapper rounded-xl border border-border overflow-hidden bg-card p-4">
            <Calendar
              localizer={localizer}
              events={events}
              view={view}
              date={date}
              onView={setView}
              onNavigate={setDate}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              style={{ height: 680 }}
              components={{
                toolbar: (props) => (
                  <CustomToolbar
                    label={props.label}
                    onNavigate={props.onNavigate as (a: "PREV" | "NEXT" | "TODAY") => void}
                    onView={props.onView}
                    view={props.view}
                  />
                ),
              }}
              popup
              showMultiDayTimes
            />
          </div>
        )}
      </div>

      {/* Inline CSS overrides to match dark theme */}
      <style>{`
        .rbc-calendar-wrapper .rbc-calendar { background: transparent; color: inherit; }
        .rbc-calendar-wrapper .rbc-header { background: transparent; border-color: hsl(var(--border)); color: hsl(var(--muted-foreground)); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 4px; }
        .rbc-calendar-wrapper .rbc-month-view,
        .rbc-calendar-wrapper .rbc-time-view { border: none; }
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
        .rbc-calendar-wrapper .rbc-time-content { border-color: hsl(var(--border)); }
        .rbc-calendar-wrapper .rbc-time-slot { border-color: hsl(var(--border) / 0.4); }
        .rbc-calendar-wrapper .rbc-timeslot-group { border-color: hsl(var(--border)); }
        .rbc-calendar-wrapper .rbc-time-header-content { border-color: hsl(var(--border)); }
        .rbc-calendar-wrapper .rbc-current-time-indicator { background: hsl(var(--primary)); }
        .rbc-calendar-wrapper .rbc-label { color: hsl(var(--muted-foreground)); font-size: 11px; }
        .rbc-calendar-wrapper .rbc-event { cursor: pointer; }
        .rbc-calendar-wrapper .rbc-event:focus { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
        .rbc-calendar-wrapper .rbc-row-segment { padding: 0 2px 2px; }
        .rbc-calendar-wrapper .rbc-month-row { overflow: visible; }
        .rbc-calendar-wrapper .rbc-agenda-view table { color: hsl(var(--foreground)); }
        .rbc-calendar-wrapper .rbc-agenda-date-cell,
        .rbc-calendar-wrapper .rbc-agenda-time-cell { color: hsl(var(--muted-foreground)); font-size: 12px; }
        .rbc-calendar-wrapper .rbc-agenda-event-cell { font-size: 12px; }
        .rbc-calendar-wrapper .rbc-toolbar { display: none; }
      `}</style>
    </DashboardLayout>
  );
}
