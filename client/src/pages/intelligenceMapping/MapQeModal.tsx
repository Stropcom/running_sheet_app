// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Clock, Pencil } from "lucide-react";
import { _addDaysToYmd, _formatPerthDateLabel } from "./perthDates";
import type { MapScreen } from "./useMapScreen";
import { QeInlineEntry } from "./QeInlineEntry";

/** the Quick Entry modal opened from the map (time, date, and the entry or the sheet picker). */
export function MapQeModal({ s }: { s: MapScreen }) {
  const {
    closeInlineField,
    rsSelectedSheetId,
    setRsEditingLastEntry,
    mapQeOpen,
    setMapQeAddress,
    setMapQeOpen,
    vvKeyboardInset,
    vvOffsetTop,
    vvVisibleHeight,
    mapQeAddress,
    mapQeHour,
    setMapQeSelectOpen,
    setMapQeHour,
    setMapQeTimeOverride,
    mapQeMinute,
    mapQePeriod,
    setMapQeMinute,
    setMapQePeriod,
    setShowMapQeDateStepper,
    showMapQeDateStepper,
    setMapQeRowDate,
    mapQeRowDate,
    rsLastEntry,
    rsEditingLastEntry,
    openLastEntryEdit,
    rsEditHour,
    setRsEditHour,
    rsEditMinute,
    setRsEditMinute,
    rsEditPeriod,
    setRsEditPeriod,
    rsEditText,
    setRsEditText,
    cancelLastEntryEdit,
    rsUpdateRow,
    saveLastEntryEdit,
  } = s;
  return (
    <>
      {/* ── Map RS Quick Entry Modal ── */}
      {mapQeOpen && (
        // fixed, not absolute: DashboardLayout's <main> is overflow-hidden,
        // so an `absolute inset-0` descendant is bounded by it rather than
        // the true window — and the inner card's height was pinned to a
        // static `90vh`/`92vh`, computed against the full layout viewport,
        // which mobile Safari/Chrome don't shrink when the on-screen
        // keyboard opens (only `window.visualViewport` does). Combined,
        // that left the card sized for a screen that no longer matched
        // what was actually visible above the keyboard: the observation
        // textarea itself stayed compact, but the rest of the oversized
        // card rendered as a large blank gap next to the keyboard rather
        // than shrinking to fit. Same fix already applied to the Custom
        // Marker Placement Modal further below — `fixed` escapes the
        // clipping, and `useVisualViewportInset`'s `vvVisibleHeight` caps
        // the card against the keyboard-adjusted visible height instead.
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-3 pt-6 md:p-4 md:pt-10"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(3px)",
            // Keyboard open and the visible area panned down the page: fit
            // the overlay to exactly the visible area above the keyboard,
            // so the card isn't left floating with a blank band beneath it.
            ...(vvKeyboardInset > 0 || vvOffsetTop > 1
              ? {
                  top: vvOffsetTop,
                  bottom: "auto",
                  height: vvVisibleHeight,
                }
              : {}),
          }}
          onClick={() => {
            setMapQeOpen(false);
            setMapQeAddress("");
            setRsEditingLastEntry(false);
            closeInlineField();
          }}
        >
          <div
            className="no-scrollbar w-full max-w-lg md:max-w-3xl lg:max-w-5xl bg-card border border-border rounded-2xl shadow-2xl p-5 pb-6 md:p-6 lg:p-8 overflow-y-auto"
            style={{ maxHeight: Math.round(vvVisibleHeight * 0.9) }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4 lg:mb-6">
              <div className="flex-1 min-w-0">
                <p className="text-sm md:text-base lg:text-lg font-bold text-foreground">
                  RS Quick Entry
                </p>
                <p className="text-[11px] md:text-xs lg:text-sm text-muted-foreground mt-0.5 truncate">
                  {mapQeAddress}
                </p>
              </div>
              <button
                onClick={() => {
                  setMapQeOpen(false);
                  setMapQeAddress("");
                  setRsEditingLastEntry(false);
                  closeInlineField();
                }}
                className="ml-3 text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>

            {/* Time picker — slim inline row with Now + Date buttons */}
            <div className="flex items-center gap-1 md:gap-1.5 mb-2 lg:mb-3 flex-wrap">
              <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-[10px] md:text-xs text-muted-foreground font-medium mr-0.5">
                Time:
              </span>
              {/* Hour */}
              <Select
                value={mapQeHour}
                onOpenChange={o => setMapQeSelectOpen(o)}
                onValueChange={v => {
                  setMapQeHour(v);
                  setMapQeTimeOverride(
                    `${String(parseInt(v)).padStart(2, "0")}:${mapQeMinute} ${mapQePeriod}`
                  );
                }}
              >
                <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                    h => (
                      <SelectItem
                        key={h}
                        value={h}
                        className="font-mono text-xs"
                      >
                        {String(parseInt(h)).padStart(2, "0")}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground font-mono text-[11px] md:text-sm">
                :
              </span>
              {/* Minute */}
              <Select
                value={mapQeMinute}
                onOpenChange={o => setMapQeSelectOpen(o)}
                onValueChange={v => {
                  setMapQeMinute(v);
                  setMapQeTimeOverride(
                    `${String(parseInt(mapQeHour)).padStart(2, "0")}:${v} ${mapQePeriod}`
                  );
                }}
              >
                <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, i) =>
                    String(i).padStart(2, "0")
                  ).map(m => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* AM/PM */}
              <Select
                value={mapQePeriod}
                onOpenChange={o => setMapQeSelectOpen(o)}
                onValueChange={v => {
                  setMapQePeriod(v);
                  setMapQeTimeOverride(
                    `${String(parseInt(mapQeHour)).padStart(2, "0")}:${mapQeMinute} ${v}`
                  );
                }}
              >
                <SelectTrigger className="w-14 h-6 text-[11px] px-1.5 py-0 md:w-16 md:h-8 md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM" className="text-xs">
                    AM
                  </SelectItem>
                  <SelectItem value="PM" className="text-xs">
                    PM
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* Now button — inline */}
              <button
                type="button"
                onClick={() => {
                  const n = new Date();
                  const h24 = n.getHours();
                  const min = n.getMinutes();
                  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                  const ampm = h24 < 12 ? "AM" : "PM";
                  setMapQeHour(String(h12));
                  setMapQeMinute(String(min).padStart(2, "0"));
                  setMapQePeriod(ampm);
                  setMapQeTimeOverride(
                    `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`
                  );
                }}
                className="h-6 px-2 text-[10px] font-medium rounded border border-border bg-muted/30 hover:bg-accent/50 active:scale-95 transition-all whitespace-nowrap md:h-8 md:px-3 md:text-xs"
              >
                Now
              </button>
              {/* Date button — toggles stepper */}
              <button
                type="button"
                onClick={() => setShowMapQeDateStepper(v => !v)}
                className={`h-6 px-2 text-[10px] font-medium rounded border transition-all whitespace-nowrap active:scale-95 md:h-8 md:px-3 md:text-xs ${
                  showMapQeDateStepper
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 hover:bg-accent/50"
                }`}
              >
                Date
              </button>
            </div>

            {/* Date stepper — only visible when Date button is toggled on */}
            {showMapQeDateStepper && (
              <div className="flex items-center justify-between mb-2 px-1 py-1 rounded-md border border-border/70 bg-muted/30">
                <button
                  type="button"
                  className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() =>
                    setMapQeRowDate(_addDaysToYmd(mapQeRowDate, -1))
                  }
                >
                  ◀
                </button>
                <span className="text-[11px] font-semibold tracking-widest text-foreground font-mono">
                  {_formatPerthDateLabel(mapQeRowDate)}
                </span>
                <button
                  type="button"
                  className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() =>
                    setMapQeRowDate(_addDaysToYmd(mapQeRowDate, 1))
                  }
                >
                  ▶
                </button>
              </div>
            )}

            {/* No sheet selected warning */}
            {rsSelectedSheetId === null ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 md:px-4 md:py-4 text-center">
                <p className="text-xs md:text-sm font-semibold text-amber-400 mb-1">
                  No running sheet selected
                </p>
                <p className="text-[11px] md:text-xs text-muted-foreground">
                  Select an operation and running sheet in the right panel
                  first, then tap &amp; hold the map again.
                </p>
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3">
                {/* ARR panel removed per user request */}

                {/* Inline observation field */}
                <QeInlineEntry s={s} />

                {/* Quick action buttons removed per user request */}

                {/* Last entry confirmation — tap to quickly correct the
                      time/text just submitted and save again, rather than
                      going to the Running Sheet to fix a typo. */}
                {rsLastEntry && !rsEditingLastEntry && (
                  <button
                    type="button"
                    onClick={openLastEntryEdit}
                    className="w-full text-left rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 md:px-3.5 md:py-3 hover:bg-green-500/15 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-green-400">
                        Last Entry
                      </p>
                      <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5 text-green-400/70 flex-shrink-0" />
                    </div>
                    <p className="text-[11px] md:text-sm font-mono text-foreground">
                      {rsLastEntry.time} — {rsLastEntry.label}
                    </p>
                  </button>
                )}

                {rsLastEntry && rsEditingLastEntry && (
                  <div className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 md:px-3.5 md:py-3 flex flex-col gap-2">
                    <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-green-400">
                      Editing Last Entry
                    </p>
                    <div className="flex items-center gap-1 md:gap-1.5 flex-wrap">
                      <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
                      <Select value={rsEditHour} onValueChange={setRsEditHour}>
                        <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) =>
                            String(i + 1)
                          ).map(h => (
                            <SelectItem
                              key={h}
                              value={h}
                              className="font-mono text-xs"
                            >
                              {String(parseInt(h)).padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground font-mono text-[11px] md:text-sm">
                        :
                      </span>
                      <Select
                        value={rsEditMinute}
                        onValueChange={setRsEditMinute}
                      >
                        <SelectTrigger className="w-16 h-6 text-[11px] font-mono px-1.5 py-0 md:w-20 md:h-8 md:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 60 }, (_, i) =>
                            String(i).padStart(2, "0")
                          ).map(m => (
                            <SelectItem
                              key={m}
                              value={m}
                              className="font-mono text-xs"
                            >
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={rsEditPeriod}
                        onValueChange={setRsEditPeriod}
                      >
                        <SelectTrigger className="w-14 h-6 text-[11px] px-1.5 py-0 md:w-16 md:h-8 md:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM" className="text-xs">
                            AM
                          </SelectItem>
                          <SelectItem value="PM" className="text-xs">
                            PM
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      value={rsEditText}
                      onChange={e => setRsEditText(e.target.value)}
                      rows={3}
                      className="text-[11px] md:text-sm font-mono"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelLastEntryEdit}
                        disabled={rsUpdateRow.isPending}
                        className="rounded-md px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveLastEntryEdit}
                        disabled={rsUpdateRow.isPending || !rsEditText.trim()}
                        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:gap-1.5"
                      >
                        {rsUpdateRow.isPending ? (
                          <Spinner className="h-3 w-3 md:h-4 md:w-4" />
                        ) : (
                          <Send className="h-3 w-3 md:h-4 md:w-4" />
                        )}
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
