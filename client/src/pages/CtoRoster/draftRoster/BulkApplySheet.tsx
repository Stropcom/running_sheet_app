// Part of the Target Registry page (client/src/pages/CtoRoster/DraftRosterPage.tsx): the Bulk Edit apply sheet.
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

// ── Bulk Apply Sheet ─────────────────────────────────────────────────────────
export function BulkApplySheet({
  open,
  selectedCount,
  onClose,
  onApply,
}: {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (
    code: ShiftCode,
    isActing: boolean,
    actingOnly: boolean,
    shiftTime: string | null
  ) => void;
}) {
  const isMobile = useIsMobile();
  const [pendingCode, setPendingCode] = useState<ShiftCode>("d");
  const [pendingActing, setPendingActing] = useState(false);
  const [actingOnly, setActingOnly] = useState(false);
  const [shiftTime, setShiftTime] = useState(SHIFT_TIMES["d"] ?? "");

  useEffect(() => {
    if (open) {
      setPendingCode("d");
      setPendingActing(false);
      setActingOnly(false);
      setShiftTime(SHIFT_TIMES["d"] ?? "");
    }
  }, [open]);

  const handleShiftSelect = (code: ShiftCode) => {
    setPendingCode(code);
    setShiftTime(SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "");
  };

  const content = (
    <div className="flex flex-col gap-4 py-2">
      <div className="text-sm text-muted-foreground">
        {selectedCount} cell{selectedCount !== 1 ? "s" : ""} selected
      </div>
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
        <Switch
          id="draft-bulk-acting-only"
          checked={actingOnly}
          onCheckedChange={setActingOnly}
        />
        <Label
          htmlFor="draft-bulk-acting-only"
          className="cursor-pointer text-sm"
        >
          Acting only (don't change shift code)
        </Label>
      </div>
      {!actingOnly && (
        <>
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
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Start Time</Label>
            <input
              type="time"
              value={shiftTime}
              onChange={e => setShiftTime(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            {shiftTime !==
              (SHIFT_TIMES[pendingCode as keyof typeof SHIFT_TIMES] ?? "") && (
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
        </>
      )}
      {!actingOnly && (
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <Star className="h-4 w-4 text-amber-500" />
          <Label
            htmlFor="draft-bulk-acting"
            className="flex-1 cursor-pointer text-sm"
          >
            Mark as Acting
          </Label>
          <Switch
            id="draft-bulk-acting"
            checked={pendingActing}
            onCheckedChange={setPendingActing}
          />
        </div>
      )}
      <Button
        onClick={() => {
          onApply(pendingCode, pendingActing, actingOnly, shiftTime || null);
          onClose();
        }}
        className="w-full"
      >
        Apply to {selectedCount} cell{selectedCount !== 1 ? "s" : ""}
      </Button>
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
            <SheetTitle>Bulk Edit (Draft)</SheetTitle>
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
          <DialogTitle>Bulk Edit (Draft)</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
