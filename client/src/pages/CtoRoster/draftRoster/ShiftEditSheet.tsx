// Part of the Target Registry page (client/src/pages/CtoRoster/DraftRosterPage.tsx): one cell's shift sheet.
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
import { Lock, Star } from "lucide-react";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
} from "@shared/ctoRosterShiftUtils";
import { cn } from "@/lib/utils";
import type { ShiftCode } from "./types";
import { safeFormat } from "./helpers";

// ── Shift edit popup ─────────────────────────────────────────────────────────
export function ShiftEditSheet({
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
