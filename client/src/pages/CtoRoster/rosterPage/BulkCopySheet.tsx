// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the old Bulk Copy dialog (kept for fallback; the page never opens it).
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
import {} from "lucide-react";
import { ROSTER_START, ROSTER_END } from "@shared/ctoRosterShiftUtils";
import { format } from "date-fns";
import type { Member } from "./types";

// ── Bulk copy popup (Dialog on desktop, Sheet on mobile) ─────────────────────
export function BulkCopySheet({
  open,
  members,
  onClose,
  onCopy,
  isLoading,
}: {
  open: boolean;
  members: Member[];
  onClose: () => void;
  onCopy: (
    sourceMemberId: number,
    targetMemberIds: number[],
    startDate: string,
    endDate: string
  ) => void;
  isLoading: boolean;
}) {
  const isMobile = useIsMobile();
  const [sourceMemberId, setSourceMemberId] = useState<number | "">("");
  const [targetMemberIds, setTargetMemberIds] = useState<Set<number>>(
    new Set()
  );
  const [startDate, setStartDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(ROSTER_END);

  useEffect(() => {
    if (open) {
      setSourceMemberId("");
      setTargetMemberIds(new Set());
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      setEndDate(ROSTER_END);
    }
  }, [open]);

  const toggleTarget = (id: number) => {
    setTargetMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit =
    sourceMemberId !== "" && targetMemberIds.size > 0 && startDate <= endDate;

  const inner = (
    <div className="space-y-4">
      {/* Source member */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Copy From
        </p>
        <select
          value={sourceMemberId}
          onChange={e =>
            setSourceMemberId(
              e.target.value === "" ? "" : Number(e.target.value)
            )
          }
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select source member…</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            From Date
          </p>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            min={ROSTER_START}
            max={ROSTER_END}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            To Date
          </p>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            min={ROSTER_START}
            max={ROSTER_END}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Target members */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Copy To ({targetMemberIds.size} selected)
        </p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {members
            .filter(m => m.id !== (sourceMemberId === "" ? -1 : sourceMemberId))
            .map(m => (
              <label
                key={m.id}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={targetMemberIds.has(m.id)}
                  onChange={() => toggleTarget(m.id)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm">{m.name}</span>
              </label>
            ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!canSubmit || isLoading}
          onClick={() => {
            if (sourceMemberId === "") return;
            onCopy(
              sourceMemberId,
              Array.from(targetMemberIds),
              startDate,
              endDate
            );
          }}
        >
          {isLoading
            ? "Copying…"
            : `Copy to ${targetMemberIds.size} Member${targetMemberIds.size !== 1 ? "s" : ""}`}
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
            <SheetTitle>Bulk Copy Shifts</SheetTitle>
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
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-2">
          <DialogTitle>Bulk Copy Shifts</DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}
