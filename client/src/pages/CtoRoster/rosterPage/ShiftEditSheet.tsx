// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the sheet that edits one cell's shift.
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Star, Copy, AlertTriangle } from "lucide-react";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
} from "@shared/ctoRosterShiftUtils";
import { cn } from "@/lib/utils";
import type { EbaFinding } from "./types";
import { safeFormat } from "./helpers";

// px for the frozen date header row

// ── Shift edit popup (Dialog on desktop, Sheet on mobile) ───────────────────────
export function ShiftEditSheet({
  open,
  memberName,
  date,
  currentCode,
  currentComment,
  currentIsActing,
  currentShiftTime,
  currentShiftDurationHours,
  isAdmin,
  onClose,
  onSaveShift,
  onSaveAnnotation,
  onCopyShift,
  issues,
}: {
  open: boolean;
  memberName: string;
  date: string;
  currentCode: string;
  currentComment: string;
  currentIsActing: boolean;
  currentShiftTime?: string | null;
  /** Deployment shift duration override (8 or 9), if one is set. */
  currentShiftDurationHours?: number | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaveShift: (
    code: string,
    shiftTime?: string | null,
    shiftDurationHours?: number | null
  ) => void;
  onSaveAnnotation: (comment: string | null, isActing: boolean) => void;
  onCopyShift?: () => void;
  /** Live EA compliance findings involving this member/date, if any. */
  issues?: EbaFinding[];
}) {
  const isMobile = useIsMobile();
  const [comment, setComment] = useState(currentComment);
  const [isActing, setIsActing] = useState(currentIsActing);
  // shiftTime: use persisted override, else default from SHIFT_TIMES
  const [pendingCode, setPendingCode] = useState<string>(currentCode);
  const defaultTime = (code: string) =>
    SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
  const [shiftTime, setShiftTime] = useState<string>(
    currentShiftTime ?? defaultTime(currentCode)
  );
  // Deployment shift duration (8hr/9hr) — defaults to 9hr, the standard length
  const [durationHours, setDurationHours] = useState<number>(
    currentShiftDurationHours ?? 9
  );
  useEffect(() => {
    if (open) {
      setComment(currentComment);
      setIsActing(currentIsActing);
      setPendingCode(currentCode);
      setShiftTime(currentShiftTime ?? defaultTime(currentCode));
      setDurationHours(currentShiftDurationHours ?? 9);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    currentComment,
    currentIsActing,
    currentCode,
    currentShiftTime,
    currentShiftDurationHours,
  ]);
  const label =
    SHIFT_LABELS[currentCode as keyof typeof SHIFT_LABELS] ?? currentCode;
  const time =
    currentShiftTime ??
    SHIFT_TIMES[currentCode as keyof typeof SHIFT_TIMES] ??
    "";

  const inner = (
    <div>
      {issues && issues.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-3.5 mb-4 space-y-2">
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              EA Compliance Issue{issues.length !== 1 ? "s" : ""}
            </span>
          </div>
          {issues.map((f, i) => (
            <div key={i} className="text-xs text-foreground">
              <span className="font-semibold">{f.ruleTitle}</span>
              {f.eaReference && (
                <span className="ml-1.5 font-mono text-muted-foreground">
                  {f.eaReference}
                </span>
              )}
              <p className="text-muted-foreground mt-0.5">{f.detail}</p>
            </div>
          ))}
        </div>
      )}
      {(currentCode || pendingCode === "dep") && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {currentCode && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                shiftClass(currentCode)
              )}
            >
              <span className="font-bold uppercase">{currentCode}</span>
              <span className="opacity-60">·</span>
              <span>
                {label}
                {time ? ` · ${time}` : ""}
              </span>
            </div>
          )}
          {currentCode && isAdmin && onCopyShift && (
            <button
              onClick={() => {
                onCopyShift();
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
              title="Copy this shift to clipboard"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
          )}
          {isAdmin && pendingCode === "dep" && (
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
                  title={`Count this Deployment shift as ${h} hours in EA compliance calculations`}
                >
                  {h}hr
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Acting toggle — above shift selection */}
      {isAdmin && (
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
                Applies to existing shift — no shift change needed
              </p>
            </div>
          </div>
          <Switch
            checked={isActing}
            onCheckedChange={v => {
              setIsActing(v);
              onSaveAnnotation(comment.trim() || null, v);
            }}
          />
        </div>
      )}

      {/* Shift note — above shift selection */}
      {isAdmin && (
        <div className="mb-5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
            Shift Note
          </Label>
          <Textarea
            placeholder="Add a note for this shift…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="resize-none h-20 text-sm"
          />
          <Button
            className="w-full mt-2"
            size="sm"
            onClick={() => {
              onSaveAnnotation(comment.trim() || null, isActing);
              onClose();
            }}
          >
            Save Note
          </Button>
        </div>
      )}

      {/* Shift selector — below acting + note */}
      {isAdmin && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Change Shift
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {SHIFT_CODES.map(c => {
              const t = SHIFT_TIMES[c as keyof typeof SHIFT_TIMES];
              return (
                <button
                  key={c}
                  onClick={() => {
                    const newTime =
                      SHIFT_TIMES[c as keyof typeof SHIFT_TIMES] ?? "";
                    setPendingCode(c);
                    setShiftTime(newTime);
                  }}
                  className={cn(
                    "relative h-14 rounded-lg text-[10px] font-medium transition-all active:scale-95 overflow-hidden border-2",
                    shiftClass(c),
                    pendingCode === c
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
          {/* Time picker for shifts that have a default time */}
          {pendingCode &&
            SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] !==
              undefined && (
              <div className="mt-3 flex items-center gap-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Start Time
                </Label>
                <input
                  type="time"
                  value={shiftTime}
                  onChange={e => setShiftTime(e.target.value)}
                  className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          {/* Apply / Clear buttons */}
          <div className="flex gap-2 mt-3">
            {pendingCode && (
              <Button
                className="flex-1"
                size="sm"
                onClick={() => {
                  onSaveShift(
                    pendingCode,
                    shiftTime || null,
                    pendingCode === "dep" ? durationHours : null
                  );
                  onClose();
                }}
              >
                Apply
              </Button>
            )}
            {currentCode && (
              <button
                onClick={() => {
                  onSaveShift("", null, null);
                  onClose();
                }}
                className="flex-1 text-xs text-muted-foreground py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors font-medium border border-border/50"
              >
                Clear shift
              </button>
            )}
          </div>
        </div>
      )}

      {!isAdmin && currentComment && (
        <div className="rounded-xl border border-border p-3.5 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Note
          </p>
          <p className="text-sm">{currentComment}</p>
        </div>
      )}
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
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="font-semibold">{memberName}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground text-sm">
                {safeFormat(date, "EEE d MMM yyyy")}
              </span>
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
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="font-semibold">{memberName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground text-sm">
              {safeFormat(date, "EEE d MMM yyyy")}
            </span>
          </DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}
