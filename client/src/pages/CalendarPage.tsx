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
      <span className="text-base font-semibold text-foreground">{label}</span>
      {/* Empty div to keep label centred */}
      <div className="w-[88px]" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [date, setDate] = useState(new Date());
  const [showOps, setShowOps] = useState(true);
  const [showSheets, setShowSheets] = useState(true);

  const { data: rawEvents, isLoading } = trpc.calendar.events.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Convert timestamp numbers → Date objects, then filter by toggle state
  const events: CalEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents
      .filter((e) => (e.type === "operation" ? showOps : showSheets))
      .map((e) => ({
        ...e,
        start: new Date(e.start),
        end: new Date(e.end),
        allDay: true,
      }));
  }, [rawEvents, showOps, showSheets]);

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

  const eventStyleGetter = useCallback((event: CalEvent) => {
    const isOp = event.type === "operation";
    return {
      style: {
        backgroundColor: isOp ? OP_COLOR : SHEET_COLOR,
        borderColor: isOp ? OP_BORDER : SHEET_BORDER,
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
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
        </div>

        {/* Interactive legend */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setShowOps((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all select-none ${
              showOps
                ? "border-transparent text-white"
                : "border-border text-muted-foreground bg-transparent"
            }`}
            style={showOps ? { backgroundColor: OP_COLOR, borderColor: OP_BORDER } : {}}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: showOps ? "#fff" : OP_COLOR, opacity: showOps ? 0.85 : 1 }}
            />
            Operation
          </button>

          <button
            onClick={() => setShowSheets((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all select-none ${
              showSheets
                ? "border-transparent text-white"
                : "border-border text-muted-foreground bg-transparent"
            }`}
            style={showSheets ? { backgroundColor: SHEET_COLOR, borderColor: SHEET_BORDER } : {}}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: showSheets ? "#fff" : SHEET_COLOR, opacity: showSheets ? 0.85 : 1 }}
            />
            Running Sheet
          </button>
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
              view="month"
              views={["month"]}
              date={date}
              onNavigate={setDate}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              style={{ height: 680 }}
              components={{
                toolbar: (props) => (
                  <CustomToolbar
                    label={props.label}
                    onNavigate={props.onNavigate as (a: "PREV" | "NEXT" | "TODAY") => void}
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
      `}</style>
    </DashboardLayout>
  );
}
