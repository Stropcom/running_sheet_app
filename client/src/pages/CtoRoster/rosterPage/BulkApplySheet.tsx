// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the sheet that applies one shift to the selected cells.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
} from "@shared/ctoRosterShiftUtils";
import { cn } from "@/lib/utils";
import type { ShiftCode } from "./types";

// ── Bulk apply popup (Dialog on desktop, Sheet on mobile) ──────────────────────
export function BulkApplySheet({
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
    shiftTime: string | null,
    shiftDurationHours: number | null
  ) => void;
}) {
  const isMobile = useIsMobile();
  const [selectedCode, setSelectedCode] = useState<ShiftCode>("d");
  const [isActing, setIsActing] = useState(false);
  const [actingOnly, setActingOnly] = useState(false);
  const defaultTime = (code: string) =>
    SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
  const [shiftTime, setShiftTime] = useState<string>(defaultTime("d"));
  // Deployment shift duration (8hr/9hr) — defaults to 9hr, the standard length
  const [durationHours, setDurationHours] = useState<number>(9);
  useEffect(() => {
    if (open) {
      setSelectedCode("d");
      setIsActing(false);
      setActingOnly(false);
      setShiftTime(defaultTime("d"));
      setDurationHours(9);
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
          {/* Deployment shift duration — feeds EA compliance hour calculations */}
          {selectedCode === "dep" && (
            <div className="flex items-center gap-2 mb-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                Duration
              </Label>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {[8, 9].map(h => (
                  <button
                    key={h}
                    onClick={() => setDurationHours(h)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                      durationHours === h
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                    title={`Count these Deployment shifts as ${h} hours in EA compliance calculations`}
                  >
                    {h}hr
                  </button>
                ))}
              </div>
            </div>
          )}
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
              actingOnly ? null : shiftTime || null,
              !actingOnly && selectedCode === "dep" ? durationHours : null
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
