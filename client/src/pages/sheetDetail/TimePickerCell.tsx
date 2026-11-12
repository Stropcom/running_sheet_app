import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  PERTH_TIME_ZONE,
  addDaysToYmd,
  formatPerthDateLabel,
  getTodayPerthYmd,
} from "./perthDates";

/** Converts "hh:mm AM/PM" display string to minutes-since-midnight (0-1439) */
function timeStringToMinutes(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

/** Formats minutes-since-midnight to "hh:mm AM/PM" */
function minutesToTimeString(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const min = mins % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${period}`;
}

export function TimePickerCell({
  value,
  locked,
  dayOffset = 0,
  rowDate,
  inferredRowDate,
  sheetHasCrossedMidnight = false,
  sheetDate,
  sheetCreatedAt,
  onSave,
}: {
  value: string | null;
  locked: boolean;
  dayOffset?: number;
  rowDate?: string | null;
  inferredRowDate?: string | null;
  sheetHasCrossedMidnight?: boolean;
  /** The sheet's picker-set calendar date (YYYY-MM-DD) — the authoritative
   * date for a new row, taking priority over createdAt (when the DB row was
   * inserted, which can differ if the sheet was created for a past/future
   * date). Null only for legacy sheets that predate the date picker. */
  sheetDate?: string | null;
  sheetCreatedAt?: number | null;
  onSave: (
    display: string,
    minutes: number,
    dayOffset: number,
    rowDate?: string
  ) => void;
}) {
  // Default rowDate for a new row: the sheet's picker date first, falling
  // back to its creation date (Perth) only for legacy sheets with no
  // sheetDate — never the other way around, since createdAt is just when
  // the DB row was inserted and can differ from the shift's actual date.
  const sheetCreatedYmd = useMemo(() => {
    if (sheetDate) return sheetDate;
    if (!sheetCreatedAt) return getTodayPerthYmd();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: PERTH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(sheetCreatedAt));
  }, [sheetDate, sheetCreatedAt]);

  // Parse existing value into hour/minute/period; default to current time when empty
  const parsed = useMemo(() => {
    if (!value) {
      const now = new Date();
      const h24 = now.getHours();
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return {
        hour: String(h12),
        minute: String(now.getMinutes()).padStart(2, "0"),
        period: h24 < 12 ? "AM" : "PM",
      };
    }
    const m = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return { hour: "12", minute: "00", period: "AM" };
    return {
      hour: String(parseInt(m[1], 10)),
      minute: m[2].padStart(2, "0"),
      period: m[3].toUpperCase(),
    };
  }, [value]);

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);
  const [localDayOffset, setLocalDayOffset] = useState(dayOffset);
  // Default to the explicit rowDate, then inferred, then RS creation date
  const [selectedRowDate, setSelectedRowDate] = useState<string>(
    () => rowDate ?? inferredRowDate ?? sheetCreatedYmd
  );
  // Track whether any Radix Select dropdown is currently open
  const [selectOpen, setSelectOpen] = useState(false);
  // Controls visibility of the date stepper (toggled by Date button)
  const [showDateStepper, setShowDateStepper] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync local state when value prop changes (e.g. row refresh)
  useEffect(() => {
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
  }, [parsed.hour, parsed.minute, parsed.period]);

  // Sync dayOffset from prop
  useEffect(() => {
    setLocalDayOffset(dayOffset);
  }, [dayOffset]);

  // Sync explicit/inferred rowDate from props
  useEffect(() => {
    setSelectedRowDate(rowDate ?? inferredRowDate ?? sheetCreatedYmd);
  }, [rowDate, inferredRowDate, sheetCreatedYmd]);

  // Close picker on outside click — but only when no Radix Select is open
  // (Radix portals render outside popoverRef, so we must ignore those clicks)
  useEffect(() => {
    if (!open || selectOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // Use capture phase with a small delay so Radix can finish its own close logic first
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, selectOpen]);

  const handleDone = useCallback(() => {
    const display = `${String(parseInt(hour, 10)).padStart(2, "0")}:${minute.padStart(2, "0")} ${period}`;
    const mins = timeStringToMinutes(display);
    onSave(display, mins, localDayOffset, selectedRowDate);
    setOpen(false);
  }, [hour, minute, period, localDayOffset, selectedRowDate, onSave]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0")
  );

  if (locked) {
    return (
      <span className="text-sm font-mono text-muted-foreground">
        {value || <span className="italic opacity-40">—</span>}
      </span>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        className="flex items-center gap-1.5 text-sm font-mono hover:bg-accent/50 rounded px-1 py-0.5 transition-colors min-w-[90px]"
        onClick={() => setOpen(v => !v)}
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {value || (
          <span className="text-muted-foreground italic text-xs">Set time</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-3">
          {/* Time selectors row + Now + Date inline */}
          <div className="flex items-center gap-1.5 mb-2 flex-nowrap">
            {/* Hour */}
            <Select
              value={hour}
              onOpenChange={o => setSelectOpen(o)}
              onValueChange={v => setHour(v)}
            >
              <SelectTrigger className="w-[70px] h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map(h => (
                  <SelectItem
                    key={h}
                    value={h}
                    className="font-mono text-foreground"
                  >
                    {String(parseInt(h, 10)).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-mono text-lg">:</span>
            {/* Minute */}
            <Select
              value={minute}
              onOpenChange={o => setSelectOpen(o)}
              onValueChange={v => setMinute(v)}
            >
              <SelectTrigger className="w-[70px] h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minutes.map(m => (
                  <SelectItem
                    key={m}
                    value={m}
                    className="font-mono text-foreground"
                  >
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* AM/PM */}
            <Select
              value={period}
              onOpenChange={o => setSelectOpen(o)}
              onValueChange={v => setPeriod(v)}
            >
              <SelectTrigger className="w-[76px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM" className="text-foreground">
                  AM
                </SelectItem>
                <SelectItem value="PM" className="text-foreground">
                  PM
                </SelectItem>
              </SelectContent>
            </Select>
            {/* Now button — inline */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs px-2"
              onClick={() => {
                const now = new Date();
                const h24 = now.getHours();
                const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                setHour(String(h12));
                setMinute(String(now.getMinutes()).padStart(2, "0"));
                setPeriod(h24 < 12 ? "AM" : "PM");
              }}
            >
              Now
            </Button>
            {/* Date button — toggles stepper */}
            <Button
              size="sm"
              variant={showDateStepper ? "default" : "outline"}
              className="h-8 text-xs px-2"
              onClick={() => setShowDateStepper(v => !v)}
            >
              Date
            </Button>
          </div>
          {/* Date stepper — only visible when Date button is active */}
          {showDateStepper && (
            <div className="flex items-center justify-between mb-2 px-1 py-1 rounded-md border border-border/70 bg-muted/30">
              <button
                className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  setSelectedRowDate(addDaysToYmd(selectedRowDate, -1))
                }
              >
                ◀
              </button>
              <span className="text-xs font-semibold tracking-widest text-foreground font-mono">
                {formatPerthDateLabel(selectedRowDate)}
              </span>
              <button
                className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  setSelectedRowDate(addDaysToYmd(selectedRowDate, 1))
                }
              >
                ▶
              </button>
            </div>
          )}
          {/* Done button — full width */}
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleDone}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
